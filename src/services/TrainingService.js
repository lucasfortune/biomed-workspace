/**
 * TrainingService
 *
 * Handles training process orchestration including:
 * - Spawning Python training processes
 * - Parsing real-time progress updates
 * - Managing training session state
 * - Emitting Socket.IO events
 * - Tracking output files
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  attachErrorHandler,
  createTrainingErrorHandler
} = require('../../utils/processErrorHandler');

class TrainingService {
  /**
   * Create TrainingService instance
   * @param {object} options - Configuration options
   * @param {string} options.pythonPath - Path to Python interpreter
   * @param {object} options.sessionTracker - SessionTracker instance
   * @param {object} options.fileService - FileService instance for tracking outputs
   * @param {object} options.workspaceManager - WorkspaceManager instance
   * @param {object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.pythonPath = options.pythonPath;
    this.sessionTracker = options.sessionTracker;
    this.fileService = options.fileService;
    this.workspaceManager = options.workspaceManager;
    this.logger = options.logger;

    // Map to track active Python processes (for cancellation)
    this.activeProcesses = new Map();
  }

  // ===========================================================================
  // TRAINING SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Create a new training session
   * @param {string} trainingId - Unique training ID
   * @param {object} sessionData - Session data
   * @returns {object} Training session object
   */
  createTrainingSession(trainingId, sessionData) {
    const session = {
      id: trainingId,
      sessionId: sessionData.sessionId,
      status: 'pending',
      startTime: new Date(),
      endTime: null,
      current_epoch: 0,
      total_epochs: sessionData.config?.epochs || 0,
      metrics: null,
      outputDir: sessionData.outputDir,
      config: sessionData.config
    };

    this.sessionTracker.setTrainingSession(trainingId, session);

    if (this.logger) {
      this.logger.debug(`Created training session: ${trainingId}`);
    }

    return session;
  }

  /**
   * Get training session by ID
   * @param {string} trainingId - Training ID
   * @returns {object|undefined} Training session
   */
  getTrainingSession(trainingId) {
    return this.sessionTracker.getTrainingSession(trainingId);
  }

  /**
   * Update training session status
   * @param {string} trainingId - Training ID
   * @param {string} status - New status
   * @param {object} data - Additional data to update
   */
  updateTrainingStatus(trainingId, status, data = {}) {
    const session = this.sessionTracker.getTrainingSession(trainingId);
    if (session) {
      session.status = status;
      Object.assign(session, data);

      if (status === 'completed' || status === 'failed') {
        session.endTime = new Date();
      }
    }
  }

  // ===========================================================================
  // TRAINING PROCESS EXECUTION
  // ===========================================================================

  /**
   * Start a training process
   * @param {object} params - Training parameters
   * @param {object} params.config - Training configuration
   * @param {string} params.raw_images - Path to raw images
   * @param {string} params.annotations - Path to annotations
   * @param {string} params.output_dir - Output directory
   * @param {string} params.training_id - Training ID
   * @param {object} io - Socket.IO instance
   */
  startTrainingProcess(params, io) {
    if (!this.pythonPath) {
      if (this.logger) {
        this.logger.error('Python path not configured for training');
      }
      io.to(`training-${params.training_id}`).emit('training-complete', {
        success: false,
        error: 'Python path not configured'
      });
      return;
    }

    const pythonScript = spawn(this.pythonPath, [
      'python/train_model.py',
      '--config', JSON.stringify(params.config),
      '--raw_images', params.raw_images,
      '--annotations', params.annotations,
      '--output_dir', params.output_dir,
      '--training_id', params.training_id
    ]);

    // Track process for cancellation
    this.activeProcesses.set(params.training_id, pythonScript);

    // Attach unified error handler
    const stderrBuffer = attachErrorHandler(
      pythonScript,
      createTrainingErrorHandler(
        params.training_id,
        this.pythonPath,
        io,
        this.sessionTracker.trainingSessions
      )
    );

    let outputBuffer = '';

    // Handle stdout for progress updates
    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();

      if (this.logger) {
        this.logger.debug('Training output:', output);
      }

      // Add to buffer
      outputBuffer += output;

      // Process complete lines
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('PROGRESS:')) {
          this.handleProgressLine(line, params.training_id, io);
        }
      }
    });

    // Handle process completion
    pythonScript.on('close', async (code) => {
      await this.handleTrainingComplete(
        code,
        params,
        stderrBuffer,
        io
      );
    });
  }

  /**
   * Handle a progress line from the training process
   * @param {string} line - Progress line from stdout
   * @param {string} trainingId - Training ID
   * @param {object} io - Socket.IO instance
   */
  handleProgressLine(line, trainingId, io) {
    try {
      const progressData = line.substring(9); // Remove 'PROGRESS:' prefix
      const progress = JSON.parse(progressData);

      if (this.logger) {
        this.logger.debug('Parsed progress:', progress);
      }

      // Update training session
      const training = this.sessionTracker.getTrainingSession(trainingId);
      if (training) {
        training.status = 'training';
        training.current_epoch = progress.epoch;
        training.total_epochs = progress.total_epochs;
        training.metrics = progress.metrics;
      }

      // Keep workspace fresh during long-running training
      if (training && this.workspaceManager) {
        this.workspaceManager.touchWorkspace(training.sessionId);
      }

      // Send real-time update to clients
      io.to(`training-${trainingId}`).emit('training-progress', progress);

      if (this.logger) {
        this.logger.debug(`Emitted progress to room: training-${trainingId}`);
      }

    } catch (e) {
      if (this.logger) {
        this.logger.error('Error parsing progress data:', e.message);
      }
    }
  }

  /**
   * Handle training process completion
   * @param {number} code - Exit code
   * @param {object} params - Training parameters
   * @param {object} stderrBuffer - Stderr buffer
   * @param {object} io - Socket.IO instance
   */
  async handleTrainingComplete(code, params, stderrBuffer, io) {
    // Remove from active processes map
    this.activeProcesses.delete(params.training_id);

    const training = this.sessionTracker.getTrainingSession(params.training_id);

    if (!training) {
      if (this.logger) {
        this.logger.warn(`Training session not found: ${params.training_id}`);
      }
      return;
    }

    if (code === 0) {
      // Success
      training.status = 'completed';
      training.endTime = new Date();

      io.to(`training-${params.training_id}`).emit('training-complete', {
        success: true
      });

      // Track training outputs in file browser
      await this.trackTrainingOutputs(training.sessionId, params.output_dir);

    } else {
      // Failure
      training.status = 'failed';
      training.endTime = new Date();

      const stderrOutput = stderrBuffer.getBuffer();
      const errorMessage = stderrOutput || 'Training failed with unknown error';

      if (this.logger) {
        this.logger.error(`[TRAINING] Process failed with code ${code}`);
        this.logger.error(`[TRAINING] stderr output: ${stderrOutput}`);
      }

      io.to(`training-${params.training_id}`).emit('training-complete', {
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Track training output files in workspace
   * @param {string} sessionId - Session ID
   * @param {string} outputDir - Training output directory
   */
  async trackTrainingOutputs(sessionId, outputDir) {
    // NOTE: This method is currently not called - file tracking is done in src/app.js onComplete callback
    if (!this.fileService) {
      if (this.logger) {
        this.logger.warn('FileService not configured, skipping output tracking');
      }
      return;
    }

    // Track model files with appropriate tags
    const filesToTrack = [
      { path: path.join(outputDir, 'best_model.pth'), category: 'models', tags: ['weights', 'segmentation'] },
      { path: path.join(outputDir, 'config.json'), category: 'models', tags: ['config', 'segmentation'] },
      { path: path.join(outputDir, 'results.json'), category: 'models', tags: ['info', 'segmentation'] }
    ];

    for (const file of filesToTrack) {
      if (fs.existsSync(file.path)) {
        await this.fileService.trackModuleOutput(sessionId, file.path, file.category, {
          tags: file.tags
        });

        if (this.logger) {
          this.logger.debug(`Tracked training output: ${path.basename(file.path)}`);
        }
      }
    }
  }

  /**
   * Register a training process for cancellation support
   * @param {string} trainingId - Training ID
   * @param {object} process - Child process object
   */
  registerProcess(trainingId, process) {
    this.activeProcesses.set(trainingId, process);
    if (this.logger) {
      this.logger.debug(`Registered training process: ${trainingId}`);
    }
  }

  /**
   * Unregister a training process (called on completion/failure)
   * @param {string} trainingId - Training ID
   */
  unregisterProcess(trainingId) {
    this.activeProcesses.delete(trainingId);
    if (this.logger) {
      this.logger.debug(`Unregistered training process: ${trainingId}`);
    }
  }

  /**
   * Cancel an ongoing training process
   * @param {string} trainingId - Training ID to cancel
   * @param {object} io - Socket.IO instance
   * @returns {boolean} True if process was cancelled
   */
  cancelTraining(trainingId, io) {
    const process = this.activeProcesses.get(trainingId);

    if (!process) {
      if (this.logger) {
        this.logger.warn(`No active process found for training ${trainingId}`);
      }
      return false;
    }

    // Kill the process
    try {
      process.kill('SIGTERM');
      this.activeProcesses.delete(trainingId);

      // Update session status
      const training = this.sessionTracker.getTrainingSession(trainingId);
      if (training) {
        training.status = 'cancelled';
        training.endTime = new Date();

        // Clean up training output files
        // Note: output_dir is stored in training.params.output_dir (from ml.routes.js)
        const outputDir = training.outputDir || training.params?.output_dir;
        if (outputDir) {
          this.cleanupCancelledTrainingFiles(outputDir, training.sessionId);
        }
      }

      // Emit cancellation event
      io.to(`training-${trainingId}`).emit('training-cancelled', {
        trainingId,
        message: 'Training cancelled by user'
      });

      if (this.logger) {
        this.logger.info(`Cancelled training process: ${trainingId}`);
      }

      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error(`Failed to cancel training ${trainingId}:`, error);
      }
      return false;
    }
  }

  /**
   * Clean up files from cancelled training
   * @param {string} outputDir - Training output directory path
   * @param {string} sessionId - Session ID for metadata cleanup
   */
  cleanupCancelledTrainingFiles(outputDir, sessionId) {
    try {
      if (!outputDir || !fs.existsSync(outputDir)) {
        if (this.logger) {
          this.logger.debug(`No output directory to clean up: ${outputDir}`);
        }
        return;
      }

      if (this.logger) {
        this.logger.info(`Cleaning up cancelled training files: ${outputDir}`);
      }

      // Files that might have been created during cancelled training
      const filesToRemove = ['best_model.pth', 'config.json', 'results.json'];

      for (const fileName of filesToRemove) {
        const filePath = path.join(outputDir, fileName);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            if (this.logger) {
              this.logger.debug(`Deleted cancelled training file: ${filePath}`);
            }
          }
        } catch (fileError) {
          if (this.logger) {
            this.logger.warn(`Could not delete file ${filePath}: ${fileError.message}`);
          }
        }
      }

      // Remove the directory if empty
      try {
        const remainingFiles = fs.readdirSync(outputDir);
        if (remainingFiles.length === 0) {
          fs.rmdirSync(outputDir);
          if (this.logger) {
            this.logger.debug(`Removed empty training directory: ${outputDir}`);
          }

          // Also try to remove parent directory if empty (e.g., models/segmentation/)
          const parentDir = path.dirname(outputDir);
          const parentFiles = fs.readdirSync(parentDir);
          if (parentFiles.length === 0) {
            fs.rmdirSync(parentDir);
            if (this.logger) {
              this.logger.debug(`Removed empty parent directory: ${parentDir}`);
            }
          }
        }
      } catch (dirError) {
        if (this.logger) {
          this.logger.debug(`Could not remove directory: ${dirError.message}`);
        }
      }

      // Remove entries from workspace metadata if any were tracked
      // (typically files aren't tracked until training completes, but clean up just in case)
      if (this.fileService?.workspaceManager && sessionId) {
        this.removeFromMetadata(outputDir, sessionId, filesToRemove);
      }

    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error cleaning up cancelled training files:`, error);
      }
    }
  }

  /**
   * Remove file entries from workspace metadata
   * @param {string} outputDir - Output directory path
   * @param {string} sessionId - Session ID
   * @param {string[]} fileNames - File names to remove
   */
  removeFromMetadata(outputDir, sessionId, fileNames) {
    try {
      const workspaceManager = this.fileService.workspaceManager;
      const metadata = workspaceManager.loadMetadata(sessionId);
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      let modified = false;
      for (const fileName of fileNames) {
        const fullPath = path.join(outputDir, fileName);
        const relativePath = path.relative(workspacePath, fullPath);
        const fileIndex = metadata.files.findIndex(f => f.path === relativePath);
        if (fileIndex !== -1) {
          metadata.files.splice(fileIndex, 1);
          modified = true;
          if (this.logger) {
            this.logger.debug(`Removed from metadata: ${relativePath}`);
          }
        }
      }

      if (modified) {
        workspaceManager.saveMetadata(sessionId, metadata);
      }
    } catch (error) {
      if (this.logger) {
        this.logger.warn(`Could not clean metadata for cancelled training: ${error.message}`);
      }
    }
  }

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  /**
   * Validate training configuration
   * @param {object} config - Training configuration
   * @returns {object} Validation result { valid, errors }
   */
  validateConfig(config) {
    const errors = [];

    // Required fields
    const requiredFields = ['patch_size', 'epochs', 'batch_size', 'learning_rate', 'augment'];
    for (const field of requiredFields) {
      if (config[field] === undefined || config[field] === null || config[field] === '') {
        errors.push(`${field} is required`);
      }
    }

    // Numeric validations
    if (config.patch_size && config.patch_size < 32) {
      errors.push('patch_size must be at least 32');
    }

    if (config.epochs && config.epochs < 1) {
      errors.push('epochs must be at least 1');
    }

    if (config.batch_size && config.batch_size < 1) {
      errors.push('batch_size must be at least 1');
    }

    if (config.learning_rate && (config.learning_rate <= 0 || config.learning_rate > 1)) {
      errors.push('learning_rate must be between 0 and 1');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Get training status for API response
   * @param {string} trainingId - Training ID
   * @returns {object} Status object
   */
  getTrainingStatus(trainingId) {
    const session = this.sessionTracker.getTrainingSession(trainingId);

    if (!session) {
      return { found: false };
    }

    return {
      found: true,
      status: session.status,
      currentEpoch: session.current_epoch,
      totalEpochs: session.total_epochs,
      metrics: session.metrics,
      startTime: session.startTime,
      endTime: session.endTime
    };
  }
}

module.exports = TrainingService;
