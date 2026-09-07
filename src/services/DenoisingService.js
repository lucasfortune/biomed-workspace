/**
 * DenoisingService
 *
 * Handles deep learning denoising process orchestration including:
 * - Spawning Python autoStructN2V processes
 * - Parsing real-time progress updates (stage1, mask, stage2)
 * - Managing denoising session state
 * - Emitting Socket.IO events for each stage
 * - Handling mask extraction and regeneration
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { buildDisplayName } = require('../helpers/namingHelpers');
const { createLineage } = require('../helpers/lineageHelpers');
// fs is already imported for async operations; sync functions used for file tracking

class DenoisingService {
  /**
   * Create DenoisingService instance
   * @param {object} options - Configuration options
   * @param {string} options.pythonPath - Path to Python interpreter
   * @param {object} options.sessionTracker - SessionTracker instance
   * @param {object} options.workspaceManager - WorkspaceManager instance
   * @param {object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.pythonPath = options.pythonPath;
    this.sessionTracker = options.sessionTracker;
    this.workspaceManager = options.workspaceManager;
    this.logger = options.logger;

    // Map to track active denoising sessions
    this.denoisingSessions = new Map();

    // Map to track active Python processes (for cancellation)
    this.activeProcesses = new Map();
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Create a new denoising training session
   * @param {string} trainingId - Unique training ID
   * @param {object} sessionData - Session data
   * @returns {object} Training session object
   */
  createSession(trainingId, sessionData) {
    const session = {
      id: trainingId,
      sessionId: sessionData.sessionId,
      username: sessionData.username || null,
      fullName: sessionData.fullName || null,
      moduleType: sessionData.moduleType || 'DL Denoising',
      method: sessionData.method, // 'n2v' or 'autostructn2v'
      inputFileId: sessionData.inputFileId || null, // For lineage tracking
      status: 'pending',
      startTime: new Date(),
      endTime: null,
      stage: null, // 'mask', 'train', 'predict', 'cleanup' (routed pipeline)
      config: sessionData.config,
      mask: {
        status: 'pending',
        kernelSize: null,
        kernelHeight: null,
        kernelWidth: null,
        activePixels: null,
        pattern: null,
        isEmpty: false,
        maskPath: null,
        maskArray: null,
        // Routing decision (routed v1.0)
        branch: null,        // 'structn2v' or 'n2v'
        routeReason: null,
        routeMessage: null,
        dmax: null,
        dmaxThreshold: null,
        maskRho2: null
      },
      // The ONE routed training run (replaces the old stage1/stage2 pair)
      train: {
        status: 'pending',
        epoch: 0,
        totalEpochs: 0,
        trainLoss: null,
        valLoss: null,
        modelPath: null,
        branch: null
      },
      // History array for chart restoration on resume
      trainHistory: [], // Array of {epoch, trainLoss, valLoss}
      experimentDir: null,
      error: null
    };

    this.denoisingSessions.set(trainingId, session);

    if (this.logger) {
      this.logger.debug(`Created denoising session: ${trainingId} (${sessionData.method})`);
    }

    return session;
  }

  /**
   * Get denoising session by ID
   * @param {string} trainingId - Training ID
   * @returns {object|undefined} Denoising session
   */
  getSession(trainingId) {
    return this.denoisingSessions.get(trainingId);
  }

  /**
   * Update session status
   * @param {string} trainingId - Training ID
   * @param {string} status - New status
   * @param {object} data - Additional data to update
   */
  updateSession(trainingId, status, data = {}) {
    const session = this.denoisingSessions.get(trainingId);
    if (session) {
      session.status = status;
      Object.assign(session, data);

      if (status === 'completed' || status === 'failed') {
        session.endTime = new Date();
      }

      // Sync status to centralized SessionTracker
      if (this.sessionTracker) {
        const trackerUpdates = { status };
        if (data.stage) trackerUpdates.stage = data.stage;
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          trackerUpdates.endTime = new Date();
        }
        this.sessionTracker.updateDenoisingSession(trainingId, trackerUpdates);
      }
    }
  }

  /**
   * Get all active sessions for a user session
   * @param {string} sessionId - User session ID
   * @returns {array} Array of denoising sessions
   */
  getSessionsByUser(sessionId) {
    const sessions = [];
    for (const [id, session] of this.denoisingSessions) {
      if (session.sessionId === sessionId) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  // ===========================================================================
  // TRAINING PROCESS EXECUTION
  // ===========================================================================

  /**
   * Start a denoising training process
   * @param {object} params - Training parameters
   * @param {object} io - Socket.IO instance
   * @returns {Promise<void>}
   */
  async startTraining(params, io) {
    const { trainingId, config, inputPath, outputDir } = params;

    if (!this.pythonPath) {
      this._emitError(io, trainingId, 'init', 'Python path not configured');
      return;
    }

    // Write config to temp file
    const configPath = path.join(outputDir, `config_${trainingId}.json`);

    try {
      await fsp.mkdir(outputDir, { recursive: true });
      // Note: config already has input_dir set correctly (to directory path)
      // Don't overwrite it with inputPath (which is the file path)
      await fsp.writeFile(configPath, JSON.stringify({
        ...config,
        training_id: trainingId,
        output_dir: outputDir
      }, null, 2));
    } catch (err) {
      this._emitError(io, trainingId, 'init', `Failed to write config: ${err.message}`);
      return;
    }

    // Update session
    const session = this.getSession(trainingId);
    if (session) {
      session.status = 'running';
      session.stage = 'mask'; // routed pipeline: mask/route comes first
      session.outputDir = outputDir; // Store for cleanup on cancel
    }

    // Spawn Python process
    const pythonScript = spawn(this.pythonPath, [
      'python/autostructn2v_wrapper.py',
      '--config', configPath,
      '--mode', 'train'
    ]);

    // Track process for cancellation
    this.activeProcesses.set(trainingId, pythonScript);

    let outputBuffer = '';
    let stderrBuffer = '';

    // Handle stdout for progress updates
    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();

      if (this.logger) {
        this.logger.debug('Denoising output:', output);
      }

      outputBuffer += output;

      // Process complete lines
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        this._handleOutputLine(line, trainingId, io);
      }
    });

    // Handle stderr
    pythonScript.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      if (this.logger) {
        this.logger.debug('Denoising stderr:', data.toString());
      }
    });

    // Handle process completion
    pythonScript.on('close', (code) => {
      this._handleProcessComplete(code, trainingId, stderrBuffer, io);

      // Clean up config file
      fsp.unlink(configPath).catch(() => {});
    });

    pythonScript.on('error', (err) => {
      this._emitError(io, trainingId, 'process', `Failed to spawn process: ${err.message}`);
    });
  }

  /**
   * Continue training after mask approval (the single routed training run)
   * @param {object} params - Continue parameters
   * @param {string} params.trainingId - Training ID
   * @param {object} params.session - Existing session object
   * @param {string} [params.overrideBranch] - 'n2v' to force plain N2V
   *   regardless of the discovered mask (the old "skip" action)
   * @param {object} io - Socket.IO instance
   * @returns {Promise<void>}
   */
  async continueTraining(params, io) {
    const { trainingId, session, overrideBranch } = params;

    if (!this.pythonPath) {
      this._emitError(io, trainingId, 'train', 'Python path not configured');
      return;
    }

    // Update session status
    session.status = 'running';
    session.stage = 'train';
    session.train.status = 'starting';

    // Train with the most recent mask: a regenerated mask (session.mask.maskPath)
    // wins over the one from the original paused payload (session.maskPath).
    const maskPath = session.mask?.maskPath || session.maskPath;

    const continueConfig = {
      training_id: trainingId,
      experiment_dir: session.experimentDir,
      mask_path: maskPath
    };
    if (overrideBranch) {
      continueConfig.override_branch = overrideBranch;
      session.mask.branch = overrideBranch;
      session.mask.routeReason = 'user_override';
    }

    // Write config to temp file
    const configPath = path.join(session.experimentDir, `config_continue_${trainingId}.json`);

    try {
      await fsp.writeFile(configPath, JSON.stringify(continueConfig, null, 2));
    } catch (err) {
      this._emitError(io, trainingId, 'train', `Failed to write config: ${err.message}`);
      return;
    }

    if (this.logger) {
      this.logger.info(`Continuing training ${trainingId}` +
        (overrideBranch ? ` (forced branch: ${overrideBranch})` : ''));
    }

    // Emit training starting event
    const roomName = `denoising-${trainingId}`;
    io.to(roomName).emit('denoising-train-progress', {
      stage: 'train',
      status: 'starting',
      branch: overrideBranch || session.mask?.branch || null,
      epoch: 0
    });

    // Spawn Python process
    const pythonScript = spawn(this.pythonPath, [
      'python/autostructn2v_wrapper.py',
      '--config', configPath,
      '--mode', 'continue_training'
    ]);

    // Track process for cancellation
    this.activeProcesses.set(trainingId, pythonScript);

    let outputBuffer = '';
    let stderrBuffer = '';

    // Handle stdout for progress updates
    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();

      if (this.logger) {
        this.logger.debug('Denoising training output:', output);
      }

      outputBuffer += output;

      // Process complete lines
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        this._handleOutputLine(line, trainingId, io);
      }
    });

    // Handle stderr
    pythonScript.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      if (this.logger) {
        this.logger.debug('Denoising training stderr:', data.toString());
      }
    });

    // Handle process completion
    pythonScript.on('close', (code) => {
      this._handleProcessComplete(code, trainingId, stderrBuffer, io);

      // Clean up config file
      fsp.unlink(configPath).catch(() => {});
    });

    pythonScript.on('error', (err) => {
      this._emitError(io, trainingId, 'train', `Failed to spawn process: ${err.message}`);
    });
  }

  /**
   * Force plain N2V after mask approval (replaces the old "Skip Stage 2":
   * trains the N2V branch with the 1x1 center kernel via continue_training)
   * @param {Object} params - Parameters
   * @param {string} params.trainingId - Training session ID
   * @param {Object} params.session - Training session object
   * @param {Object} io - Socket.IO instance
   */
  async forceN2VTraining(params, io) {
    return this.continueTraining({ ...params, overrideBranch: 'n2v' }, io);
  }

  /**
   * Handle a line of output from the training process
   * @private
   */
  _handleOutputLine(line, trainingId, io) {
    const session = this.getSession(trainingId);
    const roomName = `denoising-${trainingId}`;

    if (line.startsWith('DENOISING_PROGRESS:')) {
      try {
        const data = JSON.parse(line.substring(19));
        this._handleProgress(data, session, io, roomName);
      } catch (e) {
        if (this.logger) {
          this.logger.error('Error parsing progress:', e.message);
        }
      }
    } else if (line.startsWith('DENOISING_RESULT:')) {
      try {
        const data = JSON.parse(line.substring(17));
        this._handleResult(data, session, io, roomName);
      } catch (e) {
        if (this.logger) {
          this.logger.error('Error parsing result:', e.message);
        }
      }
    } else if (line.startsWith('DENOISING_ERROR:')) {
      try {
        const data = JSON.parse(line.substring(16));
        this._handlePythonError(data, session, io, roomName);
      } catch (e) {
        if (this.logger) {
          this.logger.error('Error parsing error:', e.message);
        }
      }
    }
  }

  /**
   * Handle progress update
   * @private
   */
  _handleProgress(data, session, io, roomName) {
    const { stage } = data;

    if (session) {
      session.stage = stage;

      if (stage === 'train') {
        session.train.status = 'training';
        session.train.epoch = data.epoch || 0;
        session.train.totalEpochs = data.totalEpochs || 0;
        session.train.trainLoss = data.trainLoss;
        session.train.valLoss = data.valLoss;
        if (data.branch) session.train.branch = data.branch;

        // Store in history for chart restoration on resume
        // Only store if we have valid epoch and loss data (skip initial/empty progress events)
        if (data.epoch != null && data.epoch > 0 && data.trainLoss != null && data.valLoss != null) {
          if (!session.trainHistory) session.trainHistory = [];
          session.trainHistory.push({
            epoch: data.epoch,
            trainLoss: data.trainLoss,
            valLoss: data.valLoss
          });
        }
      } else if (stage === 'mask') {
        session.mask.status = data.status || 'extracting';
      }
    }

    // Keep workspace fresh during long-running processes
    if (session && this.workspaceManager) {
      this.workspaceManager.touchWorkspace(session.sessionId);
    }

    // Emit to room
    io.to(roomName).emit(`denoising-${stage}-progress`, data);

    if (this.logger) {
      this.logger.debug(`Emitted ${stage} progress to ${roomName}`);
    }
  }

  /**
   * Handle result update
   * @private
   */
  _handleResult(data, session, io, roomName) {
    const { stage } = data;

    if (session) {
      if (stage === 'mask') {
        this._applyMaskResult(session, data);
        session.mask.status = 'completed';
        if (data.experimentDir) session.experimentDir = data.experimentDir;
      } else if (stage === 'train') {
        session.train.status = 'completed';
        session.train.modelPath = data.modelPath;
        if (data.branch) session.train.branch = data.branch;
      } else if (stage === 'paused') {
        // Run paused at mask approval (BEFORE any training) - store state
        session.status = 'paused_at_mask';
        session.maskPath = data.maskPath;
        if (data.experimentDir) session.experimentDir = data.experimentDir;
        this._applyMaskResult(session, data);
        session.mask.status = 'completed';
      } else if (stage === 'complete') {
        session.status = 'completed';
        if (data.experimentDir) session.experimentDir = data.experimentDir;
        session.outputFiles = data.outputFiles;

        // Update model path with final location from outputFiles
        if (data.outputFiles?.model) {
          session.train.modelPath = data.outputFiles.model;
        }
        if (data.branch) session.train.branch = data.branch;

        // Track output files in workspace metadata
        if (data.outputFiles && session.sessionId && this.workspaceManager) {
          this._trackOutputFiles(session.sessionId, data.outputFiles, session.method, data.training_id);
        }
      }
    }

    // Emit to room
    io.to(roomName).emit(`denoising-${stage}-complete`, data);

    if (this.logger) {
      this.logger.debug(`Emitted ${stage} complete to ${roomName}`);
    }
  }

  /**
   * Copy mask + route-decision fields from a Python payload onto the session
   * @private
   */
  _applyMaskResult(session, data) {
    session.mask.kernelSize = data.kernelSize;
    session.mask.kernelHeight = data.kernelHeight;
    session.mask.kernelWidth = data.kernelWidth;
    session.mask.activePixels = data.activePixels;
    session.mask.pattern = data.pattern;
    session.mask.isEmpty = data.isEmpty;
    session.mask.maskPath = data.maskPath;
    session.mask.maskArray = data.maskArray;
    session.mask.branch = data.branch;
    session.mask.routeReason = data.routeReason;
    session.mask.routeMessage = data.routeMessage;
    session.mask.dmax = data.dmax;
    session.mask.dmaxThreshold = data.dmaxThreshold;
    session.mask.maskRho2 = data.maskRho2;
  }

  /**
   * Track output files in workspace metadata
   * @private
   */
  _trackOutputFiles(sessionId, outputFiles, method, trainingId) {
    try {
      const workspacePath = this.workspaceManager.getWorkspacePath(sessionId);

      // Get the session to find the input file ID for lineage
      const session = this.getSession(trainingId);
      const inputFileId = session?.inputFileId;

      // Helper to create a canonical lineage record. When the input file id is
      // unknown the record still carries an (empty) inputs array so consumers
      // never see a lineage object without one.
      const makeLineage = (processType) => {
        if (inputFileId) {
          return createLineage(processType, [inputFileId], trainingId);
        }
        return {
          processType,
          processedAt: new Date().toISOString(),
          inputs: [],
          processId: trainingId
        };
      };

      // Resolve the source file's display name + a method-specific operation token so
      // derived names chain from the input (e.g. trypB.tif -> trypB_asn2v.tif). Auxiliary
      // outputs get a qualifier so they don't collide with the primary denoised stack.
      const sourceName = this.workspaceManager.getSourceDisplayName(sessionId, inputFileId);
      const denoiseOp = method === 'autostructn2v'
        ? 'denoising-autostructn2v-stage1'
        : 'denoising-n2v';

      // Helper: register one output file when present on disk
      const track = (filePath, category, tags, lineage = null, qualifier = null) => {
        if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) return;
        const relativePath = path.relative(workspacePath, filePath);
        const stats = fs.statSync(filePath);
        const entry = {
          name: path.basename(filePath),
          path: relativePath,
          category,
          tags,
          size: stats.size,
          folderId: null,
          displayName: buildDisplayName({
            sourceName,
            operation: denoiseOp,
            ext: path.extname(filePath),
            qualifier
          })
        };
        if (lineage) entry.lineage = lineage;
        this.workspaceManager.addFileToMetadata(sessionId, entry);
        if (this.logger) {
          this.logger.debug(`Tracked denoising output: ${relativePath}`);
        }
      };

      // Routed v1.0 output keys (see finalize_routed_output in python/denoising/output.py).
      // All auxiliary training artifacts carry the same denoising-training lineage as the
      // model so nothing in the run looks like an original upload.
      track(outputFiles.denoised_stack, 'results', ['denoising', 'data'],
            makeLineage('denoising'));
      track(outputFiles.model, 'models', ['weights', 'denoising'],
            makeLineage('denoising-training'), 'model');
      track(outputFiles.routed_mask, 'models', ['info', 'denoising'],
            makeLineage('denoising-training'), 'mask');
      track(outputFiles.route_decision, 'models', ['info', 'denoising'],
            makeLineage('denoising-training'), 'route');
      track(outputFiles.config, 'models', ['config', 'denoising'],
            makeLineage('denoising-training'), 'config');
      track(outputFiles.results, 'models', ['info', 'denoising'],
            makeLineage('denoising-training'), 'results');

    } catch (error) {
      if (this.logger) {
        this.logger.error('Error tracking output files:', error);
      }
    }
  }

  /**
   * Handle error from Python
   * @private
   */
  _handlePythonError(data, session, io, roomName) {
    if (session) {
      session.status = 'failed';
      session.error = data.message;

      // Python emits errors under stage 'training' (run/continue) and 'mask';
      // both map onto the session sub-objects.
      const stageKey = data.stage === 'training' ? 'train' : data.stage;
      if (stageKey && session[stageKey]) {
        session[stageKey].status = 'failed';
      }
    }

    io.to(roomName).emit('denoising-error', data);

    if (this.logger) {
      this.logger.error(`Denoising error (${data.stage}):`, data.message);
    }
  }

  /**
   * Handle process completion
   * @private
   */
  _handleProcessComplete(code, trainingId, stderrBuffer, io) {
    // Remove from active processes map
    this.activeProcesses.delete(trainingId);

    const session = this.getSession(trainingId);
    const roomName = `denoising-${trainingId}`;

    if (!session) {
      if (this.logger) {
        this.logger.warn(`Denoising session not found: ${trainingId}`);
      }
      return;
    }

    if (code === 0) {
      // Check if we're paused at mask - don't emit training-complete, just paused event
      if (session.status === 'paused_at_mask') {
        if (this.logger) {
          this.logger.info(`Training ${trainingId} paused at mask approval`);
        }
        io.to(roomName).emit('denoising-paused', {
          trainingId,
          reason: 'awaiting_mask_approval',
          maskPath: session.maskPath,
          kernelSize: session.mask.kernelSize,
          kernelHeight: session.mask.kernelHeight,
          kernelWidth: session.mask.kernelWidth,
          activePixels: session.mask.activePixels,
          pattern: session.mask.pattern,
          maskArray: session.mask.maskArray,
          isEmpty: session.mask.isEmpty,
          // Routing decision (routed v1.0)
          branch: session.mask.branch,
          routeReason: session.mask.routeReason,
          routeMessage: session.mask.routeMessage,
          dmax: session.mask.dmax,
          dmaxThreshold: session.mask.dmaxThreshold,
          maskRho2: session.mask.maskRho2
        });
        return;
      }

      // Success - should have been marked completed by DENOISING_RESULT:complete
      if (session.status !== 'completed') {
        session.status = 'completed';
      }
      session.endTime = new Date();

      io.to(roomName).emit('denoising-training-complete', {
        success: true,
        trainingId,
        method: session.method,
        experimentDir: session.experimentDir
      });
    } else {
      // Failure
      session.status = 'failed';
      session.endTime = new Date();

      const errorMessage = session.error || 'Training process failed';

      io.to(roomName).emit('denoising-training-complete', {
        success: false,
        trainingId,
        error: errorMessage,
        details: stderrBuffer
      });

      if (this.logger) {
        this.logger.error(`Denoising failed (${trainingId}):`, stderrBuffer);
      }
    }
  }

  /**
   * Emit error to Socket.IO room
   * @private
   */
  _emitError(io, trainingId, stage, message, details = null) {
    const roomName = `denoising-${trainingId}`;
    const data = { stage, message };
    if (details) data.details = details;

    io.to(roomName).emit('denoising-error', data);

    const session = this.getSession(trainingId);
    if (session) {
      session.status = 'failed';
      session.error = message;
    }

    if (this.logger) {
      this.logger.error(`Denoising error (${stage}):`, message);
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
      const session = this.getSession(trainingId);
      if (session) {
        session.status = 'cancelled';
        session.endTime = new Date();

        // Clean up training output files
        // experimentDir is set after stage1 completes, outputDir is set when training starts
        const dirToClean = session.experimentDir || session.outputDir;
        if (dirToClean) {
          this.cleanupCancelledTrainingFiles(dirToClean, session.sessionId);
        }
      }

      // Emit cancellation event
      const roomName = `denoising-${trainingId}`;
      io.to(roomName).emit('denoising-cancelled', {
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
   * Clean up files from cancelled denoising training
   * @param {string} experimentDir - Experiment directory path
   * @param {string} sessionId - Session ID for metadata cleanup
   */
  cleanupCancelledTrainingFiles(experimentDir, sessionId) {
    try {
      if (!experimentDir || !fs.existsSync(experimentDir)) {
        if (this.logger) {
          this.logger.debug(`No experiment directory to clean up: ${experimentDir}`);
        }
        return;
      }

      if (this.logger) {
        this.logger.info(`Cleaning up cancelled denoising files: ${experimentDir}`);
      }

      // Remove entire experiment directory recursively
      // This includes all models, configs, intermediate results, etc.
      try {
        fs.rmSync(experimentDir, { recursive: true, force: true });
        if (this.logger) {
          this.logger.debug(`Removed experiment directory: ${experimentDir}`);
        }

        // Try to remove parent directory if empty (e.g., models/denoising/)
        const parentDir = path.dirname(experimentDir);
        try {
          const parentFiles = fs.readdirSync(parentDir);
          if (parentFiles.length === 0) {
            fs.rmdirSync(parentDir);
            if (this.logger) {
              this.logger.debug(`Removed empty parent directory: ${parentDir}`);
            }
          }
        } catch (parentError) {
          // Parent directory not empty or doesn't exist - that's fine
        }
      } catch (rmError) {
        if (this.logger) {
          this.logger.warn(`Could not remove experiment directory: ${rmError.message}`);
        }
      }

      // Remove entries from workspace metadata if any were tracked
      // (typically files are tracked during/after training completes)
      if (this.workspaceManager && sessionId) {
        this.removeFromMetadata(experimentDir, sessionId);
      }

    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error cleaning up cancelled denoising files:`, error);
      }
    }
  }

  /**
   * Remove file entries from workspace metadata for a cancelled experiment
   * @param {string} experimentDir - Experiment directory path
   * @param {string} sessionId - Session ID
   */
  removeFromMetadata(experimentDir, sessionId) {
    try {
      const metadata = this.workspaceManager.loadMetadata(sessionId);
      const workspacePath = this.workspaceManager.getWorkspacePath(sessionId);
      const relativeDirPath = path.relative(workspacePath, experimentDir);

      // Remove any files that were in the experiment directory
      const originalCount = metadata.files.length;
      metadata.files = metadata.files.filter(f => {
        // Keep files that are NOT in the experiment directory
        const isInExperimentDir = f.path.startsWith(relativeDirPath + '/') ||
                                   f.path.startsWith(relativeDirPath + '\\');
        if (isInExperimentDir && this.logger) {
          this.logger.debug(`Removing from metadata: ${f.path}`);
        }
        return !isInExperimentDir;
      });

      if (metadata.files.length < originalCount) {
        this.workspaceManager.saveMetadata(sessionId, metadata);
        if (this.logger) {
          this.logger.debug(`Removed ${originalCount - metadata.files.length} files from metadata`);
        }
      }
    } catch (error) {
      if (this.logger) {
        this.logger.warn(`Could not clean metadata for cancelled denoising: ${error.message}`);
      }
    }
  }

  // ===========================================================================
  // INFERENCE
  // ===========================================================================

  /**
   * Run inference with a trained model
   * @param {object} params - Inference parameters
   * @param {object} io - Socket.IO instance
   */
  async runInference(params, io) {
    const { inferenceId, modelPath, inputPath, outputDir, modelConfig, stage, method,
            mode, sessionId, workspacePath, inputFileId, modelFileId } = params;

    if (!this.pythonPath) {
      this._emitInferenceError(io, inferenceId, 'Python path not configured');
      return;
    }

    // Write config to temp file
    const configPath = path.join(outputDir, `inference_config_${inferenceId}.json`);

    try {
      await fsp.mkdir(outputDir, { recursive: true });
      await fsp.writeFile(configPath, JSON.stringify({
        inference_id: inferenceId,
        model_path: modelPath,
        input_path: inputPath,
        output_dir: outputDir,
        model_config: modelConfig,
        stage: stage || 'stage1',
        method: method || 'n2v',
        mode: mode || '2d'  // '2d' or '2.5d'
      }, null, 2));
    } catch (err) {
      this._emitInferenceError(io, inferenceId, `Failed to write config: ${err.message}`);
      return;
    }

    const roomName = `denoising-inference-${inferenceId}`;

    // Spawn Python process
    const pythonScript = spawn(this.pythonPath, [
      'python/autostructn2v_wrapper.py',
      '--config', configPath,
      '--mode', 'inference'
    ]);

    let outputBuffer = '';
    let stderrBuffer = '';

    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;

      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('DENOISING_PROGRESS:')) {
          try {
            const progressData = JSON.parse(line.substring(19));
            io.to(roomName).emit('denoising-inference-progress', progressData);
          } catch (e) {
            // Ignore parse errors
          }
        } else if (line.startsWith('DENOISING_RESULT:')) {
          try {
            const resultData = JSON.parse(line.substring(17));

            // Track the output file in workspace metadata
            this._trackInferenceOutput(resultData, {
              sessionId, workspacePath, inputFileId, method, inferenceId, modelFileId
            });

            io.to(roomName).emit('denoising-inference-complete', resultData);
          } catch (e) {
            // Ignore parse errors
          }
        } else if (line.startsWith('DENOISING_ERROR:')) {
          try {
            const errorData = JSON.parse(line.substring(16));
            io.to(roomName).emit('denoising-error', errorData);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    pythonScript.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
    });

    pythonScript.on('close', (code) => {
      if (code !== 0) {
        io.to(roomName).emit('denoising-inference-complete', {
          success: false,
          error: 'Inference failed',
          details: stderrBuffer
        });
      }

      // Clean up
      fsp.unlink(configPath).catch(() => {});
    });
  }

  /**
   * Emit inference error
   * @private
   */
  _emitInferenceError(io, inferenceId, message) {
    const roomName = `denoising-inference-${inferenceId}`;
    io.to(roomName).emit('denoising-error', { stage: 'inference', message });

    if (this.logger) {
      this.logger.error(`Inference error:`, message);
    }
  }

  /**
   * Track inference output file in workspace metadata
   * @private
   * @param {object} resultData - Result from Python inference
   * @param {object} trackingInfo - Tracking context
   */
  _trackInferenceOutput(resultData, trackingInfo) {
    const { sessionId, workspacePath, inputFileId, method, inferenceId, modelFileId } = trackingInfo;

    // Check if we have required info for tracking
    if (!sessionId || !workspacePath || !this.workspaceManager) {
      if (this.logger) {
        this.logger.debug('Skipping file tracking - missing sessionId, workspacePath, or workspaceManager');
      }
      return;
    }

    const outputPath = resultData.outputPath;
    if (!outputPath || !fs.existsSync(outputPath)) {
      if (this.logger) {
        this.logger.warn(`Cannot track inference output - file not found: ${outputPath}`);
      }
      return;
    }

    try {
      // Get relative path from workspace
      const relativePath = path.relative(workspacePath, outputPath);
      const stats = fs.statSync(outputPath);

      // Canonical lineage record (processType/processedAt/inputs/processId). The
      // optional modelFileId records which model produced the output without
      // polluting `inputs`, which stays data-only for root resolution.
      const makeLineage = () => {
        const lineage = inputFileId
          ? createLineage('denoising', [inputFileId], inferenceId)
          : {
              processType: 'denoising',
              processedAt: new Date().toISOString(),
              inputs: [],
              processId: inferenceId
            };
        if (modelFileId) {
          lineage.modelFileId = modelFileId;
        }
        return lineage;
      };

      // Add to workspace metadata
      // New metadata system: results category with denoising/data tags
      const sourceName = this.workspaceManager.getSourceDisplayName(sessionId, inputFileId);
      const denoiseOp = method === 'autostructn2v'
        ? 'denoising-autostructn2v-stage1'
        : 'denoising-n2v';
      const entry = this.workspaceManager.addFileToMetadata(sessionId, {
        name: path.basename(outputPath),
        path: relativePath,
        category: 'results',
        tags: ['denoising', 'data'],
        size: stats.size,
        folderId: null,
        displayName: buildDisplayName({
          sourceName,
          operation: denoiseOp,
          ext: path.extname(outputPath)
        }),
        lineage: makeLineage()
      });

      // Track the inference metadata sidecar like every other module's info file
      const metadataPath = resultData.metadataPath;
      if (metadataPath && fs.existsSync(metadataPath)) {
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(metadataPath),
          path: path.relative(workspacePath, metadataPath),
          category: 'results',
          tags: ['denoising', 'info'],
          size: fs.statSync(metadataPath).size,
          folderId: null,
          displayName: buildDisplayName({
            sourceName,
            operation: denoiseOp,
            ext: path.extname(metadataPath),
            qualifier: 'info'
          }),
          lineage: makeLineage()
        });
      }

      // Expose the tracked file to the client (used for the Image Viewer hand-off)
      if (entry) {
        resultData.fileId = entry.id;
        resultData.relativePath = entry.path;
        resultData.fileName = entry.name;
      }

      if (this.logger) {
        this.logger.info(`Tracked inference output: ${relativePath} (lineage: ${JSON.stringify(lineage)})`);
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error tracking inference output:', error);
      }
    }
  }

  /**
   * Run sequential inference for autoStructN2V (Stage 1 -> Stage 2)
   * @param {object} params - Inference parameters
   * @param {object} io - Socket.IO instance
   */
  async runSequentialInference(params, io) {
    const { inferenceId, modelPaths, configPath, fullConfig, inputPath, outputDir, modelConfig,
            mode, sessionId, workspacePath, inputFileId, modelFileId } = params;

    if (!this.pythonPath) {
      this._emitInferenceError(io, inferenceId, 'Python path not configured');
      return;
    }

    const roomName = `denoising-inference-${inferenceId}`;

    // Use stage2 config from shared config file
    let stage2Config = { ...modelConfig };
    if (fullConfig?.stage2) {
      const stageConfig = fullConfig.stage2;
      stage2Config = {
        features: stageConfig.features || modelConfig.features,
        num_layers: stageConfig.num_layers || modelConfig.num_layers,
        patch_size: stageConfig.patch_size || modelConfig.patch_size,
        use_resize_conv: stageConfig.use_resize_conv !== false,
        upsampling_mode: stageConfig.upsampling_mode || 'bilinear'
      };
    } else if (this.logger) {
      this.logger.warn('No stage2 config in shared config, using stage1 config');
    }

    // Write sequential inference config for Python script
    const inferenceConfigPath = path.join(outputDir, `sequential_config_${inferenceId}.json`);

    try {
      await fsp.mkdir(outputDir, { recursive: true });
      await fsp.writeFile(inferenceConfigPath, JSON.stringify({
        inference_id: inferenceId,
        mode: mode || fullConfig?.mode || '2d',  // '2d' or '2.5d' processing mode
        stage1_model_path: modelPaths.stage1,
        stage2_model_path: modelPaths.stage2,
        input_path: inputPath,
        output_dir: outputDir,
        stage1_config: modelConfig,
        stage2_config: stage2Config
      }, null, 2));
    } catch (err) {
      this._emitInferenceError(io, inferenceId, `Failed to write config: ${err.message}`);
      return;
    }

    if (this.logger) {
      this.logger.info(`Starting sequential inference ${inferenceId}`);
    }

    // Spawn Python process for sequential inference
    const pythonScript = spawn(this.pythonPath, [
      'python/autostructn2v_wrapper.py',
      '--config', inferenceConfigPath,
      '--mode', 'inference_sequential'
    ]);

    let outputBuffer = '';
    let stderrBuffer = '';

    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;

      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('DENOISING_PROGRESS:')) {
          try {
            const progressData = JSON.parse(line.substring(19));
            io.to(roomName).emit('denoising-inference-progress', progressData);
          } catch (e) {
            // Ignore parse errors
          }
        } else if (line.startsWith('DENOISING_RESULT:')) {
          try {
            const resultData = JSON.parse(line.substring(17));

            // Track the output file in workspace metadata
            this._trackInferenceOutput(resultData, {
              sessionId, workspacePath, inputFileId, method: 'autostructn2v', inferenceId, modelFileId
            });

            io.to(roomName).emit('denoising-inference-complete', resultData);
          } catch (e) {
            // Ignore parse errors
          }
        } else if (line.startsWith('DENOISING_ERROR:')) {
          try {
            const errorData = JSON.parse(line.substring(16));
            io.to(roomName).emit('denoising-error', errorData);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    pythonScript.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      if (this.logger) {
        this.logger.debug('Sequential inference stderr:', data.toString());
      }
    });

    pythonScript.on('close', (code) => {
      if (code !== 0) {
        io.to(roomName).emit('denoising-inference-complete', {
          success: false,
          error: 'Sequential inference failed',
          details: stderrBuffer
        });
      }

      // Clean up
      fsp.unlink(inferenceConfigPath).catch(() => {});
    });

    pythonScript.on('error', (err) => {
      this._emitInferenceError(io, inferenceId, `Failed to spawn process: ${err.message}`);
    });
  }

  // ===========================================================================
  // MODEL IMPORT & RECENT RESULTS (Phase 7)
  // ===========================================================================

  /**
   * Get recent completed training results for model import
   * @param {string} sessionId - User session ID
   * @returns {array} Array of completed training results with model paths
   */
  getRecentTrainingResults(sessionId) {
    const results = [];

    for (const [trainingId, session] of this.denoisingSessions) {
      // Only return completed sessions for this user
      if (session.sessionId === sessionId && session.status === 'completed') {
        // The experiment dir is deleted at finalize; the persisted config
        // lives in the models output dir (outputFiles.config).
        const configPath = session.outputFiles?.config || null;
        const inputData = session.config?.input_data || session.config?.input_dir;

        const result = {
          trainingId: session.id,
          method: session.method,
          branch: session.train?.branch || null,
          completedAt: session.endTime,
          inputFile: inputData ? path.basename(inputData) : null,
          configPath: configPath,
          model: null
        };

        // Single routed model
        if (session.train?.modelPath && fs.existsSync(session.train.modelPath)) {
          result.model = { modelPath: session.train.modelPath };
        }

        results.push(result);
      }
    }

    // Sort by completion time (newest first)
    results.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    return results;
  }

  /**
   * Validate imported model files
   * @param {object} params - Validation parameters
   * @param {string} params.modelPath - Path to .pth model file
   * @param {string} params.configPath - Path to .json config file
   * @param {string} params.stage - 'stage1' or 'stage2'
   * @returns {Promise<object>} Validation result
   */
  async validateImportedModel(params) {
    const { modelPath, configPath, stage } = params;

    const result = {
      valid: false,
      modelInfo: {
        exists: false,
        readable: false,
        path: modelPath
      },
      configInfo: {
        exists: false,
        valid: false,
        path: configPath,
        method: null,
        stage: stage
      },
      errors: []
    };

    // Check model file
    if (!modelPath) {
      result.errors.push('Model path is required');
    } else if (!fs.existsSync(modelPath)) {
      result.errors.push(`Model file not found: ${path.basename(modelPath)}`);
    } else {
      result.modelInfo.exists = true;
      try {
        // Check if file is readable and has content
        const stats = fs.statSync(modelPath);
        result.modelInfo.readable = stats.size > 0;
        result.modelInfo.size = stats.size;
        result.modelInfo.sizeFormatted = this._formatFileSize(stats.size);

        if (!result.modelInfo.readable) {
          result.errors.push('Model file is empty');
        }
      } catch (err) {
        result.errors.push(`Cannot read model file: ${err.message}`);
      }
    }

    // Check config file
    if (!configPath) {
      result.errors.push('Config path is required');
    } else if (!fs.existsSync(configPath)) {
      result.errors.push(`Config file not found: ${path.basename(configPath)}`);
    } else {
      result.configInfo.exists = true;
      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);

        result.configInfo.valid = true;
        result.configInfo.method = config.method || (config.stage2 || config.recipes ? 'autostructn2v' : 'n2v');
        // Routed v1.0 configs carry recipes; the architecture that matters for
        // display comes from the structn2v recipe (falls back to n2v). Note the
        // checkpoint's own hparams are authoritative at inference time.
        const archSource = config.recipes
          ? (config.recipes.structn2v || config.recipes.n2v || {})
          : (config.stage1 || {});
        result.configInfo.routed = !!config.recipes;
        result.configInfo.features = archSource.features || config.features || 64;
        result.configInfo.numLayers = archSource.num_layers || config.num_layers || 2;
        result.configInfo.patchSize = archSource.patch_size || config.patch_size || 64;

        // For legacy autoStructN2V, check if this is a stage1 or stage2 config
        if (!config.recipes && stage === 'stage2' && config.stage2) {
          result.configInfo.features = config.stage2.features || result.configInfo.features;
          result.configInfo.numLayers = config.stage2.num_layers || result.configInfo.numLayers;
          result.configInfo.patchSize = config.stage2.patch_size || result.configInfo.patchSize;
        }

      } catch (err) {
        result.errors.push(`Invalid config file: ${err.message}`);
      }
    }

    // Overall validation
    result.valid = result.modelInfo.exists &&
                   result.modelInfo.readable &&
                   result.configInfo.exists &&
                   result.configInfo.valid;

    return result;
  }

  /**
   * Validate and parse a config file for import
   * @param {string} configPath - Path to .json config file
   * @returns {Promise<object>} Validation result with parsed config data
   */
  async validateConfig(configPath) {
    const result = {
      valid: false,
      configData: null,
      errors: []
    };

    // Check if file exists
    if (!configPath) {
      result.errors.push('Config path is required');
      return result;
    }

    if (!fs.existsSync(configPath)) {
      result.errors.push(`Config file not found: ${path.basename(configPath)}`);
      return result;
    }

    try {
      // Read and parse config file
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);

      // Routed v1.0 config (single model, recipes block)
      if (config.recipes) {
        result.configData = {
          method: config.method || 'autostructn2v',
          routed: true,
          recipes: config.recipes,
          mask: config.mask || null,
          trainingId: config.training_id
        };
        result.valid = true;
        return result;
      }

      // Legacy two-stage config
      if (!config.method && !config.stage1) {
        result.errors.push('Invalid config: missing method, stage1, or recipes configuration');
        return result;
      }

      // Determine method from config
      const method = config.method || (config.stage2 ? 'autostructn2v' : 'n2v');

      // For autoStructN2V, check that stage2 config exists
      if (method === 'autostructn2v' && !config.stage2) {
        result.errors.push('Invalid autoStructN2V config: missing stage2 configuration');
        return result;
      }

      // Store parsed config data
      result.configData = {
        method,
        routed: false,
        stage1: config.stage1 || {},
        stage2: config.stage2 || null,
        // Store paths from config if available
        stage1ModelPath: config.stage1_model_path,
        stage2MaskPath: config.mask_path,
        experimentDir: config.experiment_dir,
        trainingId: config.training_id
      };

      result.valid = true;

    } catch (err) {
      result.errors.push(`Invalid config file: ${err.message}`);
    }

    return result;
  }

  /**
   * Format file size for display
   * @private
   */
  _formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // ===========================================================================
  // MASK REGENERATION
  // ===========================================================================

  /**
   * Regenerate mask with new parameters
   * @param {object} params - Mask parameters
   * @param {string} params.trainingId - Training session ID
   * @param {string} params.stage1Dir - Path to Stage 1 experiment directory
   * @param {object} params.parameters - Mask extractor parameters
   * @param {object} io - Socket.IO instance
   * @returns {Promise<object>} Mask result data
   */
  async regenerateMask(params, io) {
    const { trainingId, experimentDir, parameters } = params;

    if (!this.pythonPath) {
      throw new Error('Python path not configured');
    }

    const session = this.getSession(trainingId);

    // The routed extractor always works on the RAW input stack (the method;
    // E8 in the paper validated raw over denoised extraction).
    const inputPath = session?.config?.input_data || session?.config?.input_dir;
    if (!inputPath || !fs.existsSync(inputPath)) {
      throw new Error('Original input stack not found for mask extraction');
    }

    const outputDir = experimentDir;

    // Write config to temp file
    const configPath = path.join(outputDir, `mask_config_${Date.now()}.json`);

    // Extractor parameters: start from what the run was configured with
    // (bg_side in particular), then apply the user's adjustments.
    const baseExtractor = session?.config?.mask?.extractor || {};
    const extractorParams = { ...baseExtractor };
    if (parameters.bg_side !== undefined) extractorParams.bg_side = parameters.bg_side;
    if (parameters.rho_floor !== undefined) extractorParams.rho_floor = parameters.rho_floor;
    if (parameters.spine_thresh !== undefined) extractorParams.spine_thresh = parameters.spine_thresh;
    if (parameters.max_pixels !== undefined) extractorParams.max_pixels = parameters.max_pixels;

    try {
      await fsp.mkdir(outputDir, { recursive: true });
      const maskConfig = {
        training_id: trainingId,
        input_path: inputPath,
        output_dir: outputDir,
        extractor: extractorParams
      };
      await fsp.writeFile(configPath, JSON.stringify(maskConfig, null, 2));
    } catch (err) {
      throw new Error(`Failed to write config: ${err.message}`);
    }

    const roomName = `denoising-${trainingId}`;

    return new Promise((resolve, reject) => {
      // Spawn Python process
      const pythonScript = spawn(this.pythonPath, [
        'python/autostructn2v_wrapper.py',
        '--config', configPath,
        '--mode', 'extract_mask'
      ]);

      let outputBuffer = '';
      let stderrBuffer = '';
      let result = null;
      let error = null;

      pythonScript.stdout.on('data', (data) => {
        const output = data.toString();
        outputBuffer += output;

        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('DENOISING_PROGRESS:')) {
            try {
              const progressData = JSON.parse(line.substring(19));
              io.to(roomName).emit('denoising-mask-progress', progressData);
            } catch (e) {
              // Ignore parse errors
            }
          } else if (line.startsWith('DENOISING_RESULT:')) {
            try {
              const resultData = JSON.parse(line.substring(17));
              result = resultData;

              // Update session with the regenerated mask + route decision.
              // continueTraining reads session.mask.maskPath, so the
              // regenerated kernel is what actually trains.
              if (session) {
                this._applyMaskResult(session, resultData);
              }

              io.to(roomName).emit('denoising-mask-complete', resultData);
            } catch (e) {
              // Ignore parse errors
            }
          } else if (line.startsWith('DENOISING_ERROR:')) {
            try {
              const errorData = JSON.parse(line.substring(16));
              error = errorData;
              io.to(roomName).emit('denoising-error', errorData);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      pythonScript.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
      });

      pythonScript.on('close', (code) => {
        fsp.unlink(configPath).catch(() => {});

        if (code !== 0 || error) {
          reject(new Error(error?.message || stderrBuffer || 'Mask extraction failed'));
        } else if (result) {
          resolve(result);
        } else {
          reject(new Error('No result from mask extraction'));
        }
      });

      pythonScript.on('error', (err) => {
        fsp.unlink(configPath).catch(() => {});
        reject(err);
      });
    });
  }
}

module.exports = DenoisingService;
