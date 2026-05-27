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
      method: sessionData.method, // 'n2v' or 'autostructn2v'
      inputFileId: sessionData.inputFileId || null, // For lineage tracking
      status: 'pending',
      startTime: new Date(),
      endTime: null,
      stage: null, // 'stage1', 'mask', 'stage2'
      config: sessionData.config,
      stage1: {
        status: 'pending',
        epoch: 0,
        totalEpochs: 0,
        trainLoss: null,
        valLoss: null,
        modelPath: null
      },
      mask: {
        status: 'pending',
        kernelSize: null,
        kernelHeight: null,
        kernelWidth: null,
        activePixels: null,
        pattern: null,
        isEmpty: false,
        maskPath: null
      },
      stage2: {
        status: 'pending',
        epoch: 0,
        totalEpochs: 0,
        trainLoss: null,
        valLoss: null,
        modelPath: null
      },
      // History arrays for chart restoration on resume
      stage1History: [], // Array of {epoch, trainLoss, valLoss}
      stage2History: [], // Array of {epoch, trainLoss, valLoss}
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
      session.stage = 'stage1';
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
   * Continue training after mask approval (Stage 2 only)
   * @param {object} params - Continue parameters
   * @param {string} params.trainingId - Training ID
   * @param {object} params.session - Existing session object
   * @param {object} io - Socket.IO instance
   * @returns {Promise<void>}
   */
  async continueTraining(params, io) {
    const { trainingId, session, mode: explicitMode } = params;

    if (!this.pythonPath) {
      this._emitError(io, trainingId, 'stage2', 'Python path not configured');
      return;
    }

    // Update session status
    session.status = 'running';
    session.stage = 'stage2';
    session.stage2.status = 'starting';

    // Get mode from explicit param, session, or config
    const mode = explicitMode || session.mode || session.config?.mode || '2d';

    // Build config for Stage 2 only
    const stage2Config = {
      training_id: trainingId,
      method: 'autostructn2v',
      mode,  // '2d' or '2.5d'
      experiment_dir: session.experimentDir,
      mask_path: session.maskPath,
      stage1_model_path: session.stage1ModelPath,
      stage1_denoised_dir: session.stage1DenoisedDir,
      // Include original config for stage2 parameters
      stage1: session.config?.stage1 || {},  // Needed for model creation
      stage2: session.config?.stage2 || {},
      run_stage2: true,  // Needed for channel config
      input_dir: session.config?.input_dir,
      output_dir: session.config?.output_dir,
      workspace_dir: session.config?.workspace_dir,
      device: session.config?.device || 'cuda',
      verbose: session.config?.verbose || false
    };

    // Write config to temp file
    const configPath = path.join(session.experimentDir, `config_stage2_${trainingId}.json`);

    try {
      await fsp.writeFile(configPath, JSON.stringify(stage2Config, null, 2));
    } catch (err) {
      this._emitError(io, trainingId, 'stage2', `Failed to write config: ${err.message}`);
      return;
    }

    if (this.logger) {
      this.logger.info(`Continuing training ${trainingId} with Stage 2`);
    }

    // Emit stage2 starting event
    const roomName = `denoising-${trainingId}`;
    io.to(roomName).emit('denoising-stage2-progress', {
      stage: 'stage2',
      status: 'starting',
      epoch: 0,
      totalEpochs: stage2Config.stage2?.num_epochs || 100
    });

    // Spawn Python process
    const pythonScript = spawn(this.pythonPath, [
      'python/autostructn2v_wrapper.py',
      '--config', configPath,
      '--mode', 'train_stage2_only'
    ]);

    // Track process for cancellation
    this.activeProcesses.set(trainingId, pythonScript);

    let outputBuffer = '';
    let stderrBuffer = '';

    // Handle stdout for progress updates
    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();

      if (this.logger) {
        this.logger.debug('Denoising Stage 2 output:', output);
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
        this.logger.debug('Denoising Stage 2 stderr:', data.toString());
      }
    });

    // Handle process completion
    pythonScript.on('close', (code) => {
      this._handleProcessComplete(code, trainingId, stderrBuffer, io);

      // Clean up config file
      fsp.unlink(configPath).catch(() => {});
    });

    pythonScript.on('error', (err) => {
      this._emitError(io, trainingId, 'stage2', `Failed to spawn process: ${err.message}`);
    });
  }

  /**
   * Skip Stage 2 training and finalize with Stage 1 results only
   * Called when user chooses to skip autoStructN2V Stage 2 after mask approval
   * Spawns Python process to properly finalize outputs and cleanup intermediate files
   * @param {Object} params - Skip parameters
   * @param {string} params.trainingId - Training session ID
   * @param {Object} params.session - Training session object
   * @param {Object} io - Socket.IO instance
   */
  async skipStage2Training(params, io) {
    const { trainingId, session } = params;
    const roomName = `denoising-${trainingId}`;

    if (!this.pythonPath) {
      this._emitError(io, trainingId, 'finalize', 'Python path not configured');
      return;
    }

    if (this.logger) {
      this.logger.info(`[Denoising] Skipping Stage 2 for training ${trainingId}, starting finalization`);
    }

    // Update session status
    session.status = 'finalizing';
    session.stage = 'cleanup';
    session.stage2.status = 'skipped';

    // Get mode and workspace info
    const mode = session.mode || session.config?.mode || '2d';
    const workspacePath = this.workspaceManager.getWorkspacePath(session.sessionId);

    // Build config for finalization
    const finalizeConfig = {
      training_id: trainingId,
      method: 'autostructn2v',
      mode,
      experiment_dir: session.experimentDir,
      stage1_model_path: session.stage1ModelPath,
      stage1_denoised_dir: session.stage1DenoisedDir,
      workspace_dir: workspacePath,
      // Include original config for reference
      stage1: session.config?.stage1 || {},
      stage2: session.config?.stage2 || {}
    };

    // For 2.5D mode, also pass the stack path
    if (mode === '2.5d') {
      const stackPath = path.join(session.experimentDir, 'data', 'stage1_denoised', 'stage1_denoised_stack.tif');
      if (fs.existsSync(stackPath)) {
        finalizeConfig.stage1_denoised_stack_path = stackPath;
      }
    }

    // Write config to temp file
    const configPath = path.join(session.experimentDir, `config_finalize_${trainingId}.json`);

    try {
      await fsp.writeFile(configPath, JSON.stringify(finalizeConfig, null, 2));
    } catch (err) {
      this._emitError(io, trainingId, 'finalize', `Failed to write config: ${err.message}`);
      return;
    }

    if (this.logger) {
      this.logger.info(`[Denoising] Starting finalization for ${trainingId}`);
    }

    // Emit finalization starting event
    io.to(roomName).emit('denoising-cleanup-progress', {
      stage: 'finalize',
      status: 'starting',
      message: 'Finalizing Stage 1 results (Stage 2 skipped)'
    });

    // Spawn Python process for finalization
    const pythonScript = spawn(this.pythonPath, [
      'python/autostructn2v_wrapper.py',
      '--config', configPath,
      '--mode', 'finalize_stage1_only'
    ]);

    // Track process for cancellation
    this.activeProcesses.set(trainingId, pythonScript);

    let outputBuffer = '';
    let stderrBuffer = '';

    // Handle stdout for progress updates
    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();

      if (this.logger) {
        this.logger.debug('Denoising finalization output:', output);
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
        this.logger.debug('Denoising finalization stderr:', data.toString());
      }
    });

    // Handle process completion
    pythonScript.on('close', (code) => {
      // Mark stage2 as skipped (in case it was reset)
      session.stage2.status = 'skipped';

      this._handleProcessComplete(code, trainingId, stderrBuffer, io);

      // Clean up temp config file
      fsp.unlink(configPath).catch(() => {});
    });

    pythonScript.on('error', (err) => {
      this._emitError(io, trainingId, 'finalize', `Failed to spawn process: ${err.message}`);
    });
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

      if (stage === 'stage1' || stage === 'stage2') {
        session[stage].status = 'training';
        session[stage].epoch = data.epoch || 0;
        session[stage].totalEpochs = data.totalEpochs || 0;
        session[stage].trainLoss = data.trainLoss;
        session[stage].valLoss = data.valLoss;

        // Store in history for chart restoration on resume
        // Only store if we have valid epoch and loss data (skip initial/empty progress events)
        if (data.epoch != null && data.epoch > 0 && data.trainLoss != null && data.valLoss != null) {
          const historyKey = `${stage}History`;
          if (!session[historyKey]) session[historyKey] = [];
          session[historyKey].push({
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
      if (stage === 'stage1') {
        session.stage1.status = 'completed';
        session.stage1.modelPath = data.modelPath;
        session.experimentDir = data.experimentDir;
      } else if (stage === 'mask') {
        session.mask.status = 'completed';
        session.mask.kernelSize = data.kernelSize;
        session.mask.kernelHeight = data.kernelHeight;
        session.mask.kernelWidth = data.kernelWidth;
        session.mask.activePixels = data.activePixels;
        session.mask.pattern = data.pattern;
        session.mask.isEmpty = data.isEmpty;
        session.mask.maskPath = data.maskPath;
      } else if (stage === 'stage2') {
        session.stage2.status = 'completed';
        session.stage2.modelPath = data.modelPath;
      } else if (stage === 'paused') {
        // Training paused at mask approval - store state for resume
        session.status = 'paused_at_mask';
        session.stage1ModelPath = data.stage1ModelPath;
        session.stage1DenoisedDir = data.stage1DenoisedDir;
        session.maskPath = data.maskPath;
        session.mask.kernelSize = data.kernelSize;
        session.mask.kernelHeight = data.kernelHeight;
        session.mask.kernelWidth = data.kernelWidth;
        session.mask.activePixels = data.activePixels;
        session.mask.pattern = data.pattern;
        session.mask.maskArray = data.maskArray;
      } else if (stage === 'complete') {
        session.status = 'completed';
        session.experimentDir = data.experimentDir;
        session.outputFiles = data.outputFiles;

        // Update model paths with final locations from outputFiles
        if (data.outputFiles) {
          if (data.outputFiles.stage1_model) {
            session.stage1.modelPath = data.outputFiles.stage1_model;
          }
          if (data.outputFiles.stage2_model) {
            session.stage2.modelPath = data.outputFiles.stage2_model;
          }
        }

        // Preserve stage2 skipped status if this was a skip finalization
        if (data.stage2Skipped) {
          session.stage2.status = 'skipped';
        }

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
   * Track output files in workspace metadata
   * @private
   */
  _trackOutputFiles(sessionId, outputFiles, method, trainingId) {
    try {
      const workspacePath = this.workspaceManager.getWorkspacePath(sessionId);

      // Get the session to find the input file ID for lineage
      const session = this.getSession(trainingId);
      const inputFileId = session?.inputFileId;

      // Helper to create proper lineage object
      const createLineageObj = (processType) => {
        const lineage = {
          processType: processType,
          processedAt: new Date().toISOString(),
          processId: trainingId
        };
        // Add input file reference if available
        if (inputFileId) {
          lineage.inputs = [inputFileId];
        }
        return lineage;
      };

      // Track denoised TIFF stacks
      // New metadata system: results category with denoising/data tags
      if (outputFiles.stage1_stack && fs.existsSync(outputFiles.stage1_stack)) {
        const relativePath = path.relative(workspacePath, outputFiles.stage1_stack);
        const stats = fs.statSync(outputFiles.stage1_stack);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.stage1_stack),
          path: relativePath,
          category: 'results',
          tags: ['denoising', 'data'],
          size: stats.size,
          folderId: null,
          lineage: createLineageObj('denoising')
        });
        if (this.logger) {
          this.logger.debug(`Tracked stage1 output: ${relativePath}`);
        }
      }

      if (outputFiles.stage2_stack && fs.existsSync(outputFiles.stage2_stack)) {
        const relativePath = path.relative(workspacePath, outputFiles.stage2_stack);
        const stats = fs.statSync(outputFiles.stage2_stack);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.stage2_stack),
          path: relativePath,
          category: 'results',
          tags: ['denoising', 'data'],
          size: stats.size,
          folderId: null,
          lineage: createLineageObj('denoising')
        });
        if (this.logger) {
          this.logger.debug(`Tracked stage2 output: ${relativePath}`);
        }
      }

      // Track model files (models are outputs of training, linked to input data)
      if (outputFiles.stage1_model && fs.existsSync(outputFiles.stage1_model)) {
        const relativePath = path.relative(workspacePath, outputFiles.stage1_model);
        const stats = fs.statSync(outputFiles.stage1_model);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.stage1_model),
          path: relativePath,
          category: 'models',
          tags: ['weights', 'denoising'],
          size: stats.size,
          folderId: null,
          lineage: createLineageObj('denoising-training')
        });
      }

      if (outputFiles.stage2_model && fs.existsSync(outputFiles.stage2_model)) {
        const relativePath = path.relative(workspacePath, outputFiles.stage2_model);
        const stats = fs.statSync(outputFiles.stage2_model);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.stage2_model),
          path: relativePath,
          category: 'models',
          tags: ['weights', 'denoising'],
          size: stats.size,
          folderId: null,
          lineage: createLineageObj('denoising-training')
        });
      }

      // Track config file
      if (outputFiles.config && fs.existsSync(outputFiles.config)) {
        const relativePath = path.relative(workspacePath, outputFiles.config);
        const stats = fs.statSync(outputFiles.config);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.config),
          path: relativePath,
          category: 'models',
          tags: ['config', 'denoising'],
          size: stats.size,
          folderId: null
        });
      }

      // Track results.json file (training metrics)
      if (outputFiles.results && fs.existsSync(outputFiles.results)) {
        const relativePath = path.relative(workspacePath, outputFiles.results);
        const stats = fs.statSync(outputFiles.results);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.results),
          path: relativePath,
          category: 'models',
          tags: ['info', 'denoising'],
          size: stats.size,
          folderId: null
        });
        if (this.logger) {
          this.logger.debug(`Tracked results.json: ${relativePath}`);
        }
      }

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

      if (data.stage && session[data.stage]) {
        session[data.stage].status = 'failed';
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
          maskArray: session.mask.maskArray
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
            mode, sessionId, workspacePath, inputFileId } = params;

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
              sessionId, workspacePath, inputFileId, method, inferenceId
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
    const { sessionId, workspacePath, inputFileId, method, inferenceId } = trackingInfo;

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

      // Build lineage information
      const lineage = {
        operation: `denoising-${method || 'dl'}-inference`,
        inferenceId: inferenceId,
        timestamp: new Date().toISOString()
      };

      // Add input file reference if available
      if (inputFileId) {
        lineage.sourceFileId = inputFileId;
      }

      // Add to workspace metadata
      // New metadata system: results category with denoising/data tags
      this.workspaceManager.addFileToMetadata(sessionId, {
        name: path.basename(outputPath),
        path: relativePath,
        category: 'results',
        tags: ['denoising', 'data'],
        size: stats.size,
        folderId: null,
        lineage: lineage
      });

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
            mode, sessionId, workspacePath, inputFileId } = params;

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
              sessionId, workspacePath, inputFileId, method: 'autostructn2v', inferenceId
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
        // Shared config path at the training level
        const configPath = session.experimentDir ? path.join(session.experimentDir, 'config.json') : null;

        const result = {
          trainingId: session.id,
          method: session.method,
          completedAt: session.endTime,
          inputFile: session.config?.input_dir ? path.basename(session.config.input_dir) : null,
          experimentDir: session.experimentDir,
          configPath: configPath,  // Shared config file for both stages
          stage1: null,
          stage2: null
        };

        // Add Stage 1 model info if available
        if (session.stage1?.modelPath && fs.existsSync(session.stage1.modelPath)) {
          result.stage1 = {
            modelPath: session.stage1.modelPath
          };
        }

        // Add Stage 2 model info if available (autoStructN2V)
        if (session.method === 'autostructn2v' && session.stage2?.modelPath && fs.existsSync(session.stage2.modelPath)) {
          result.stage2 = {
            modelPath: session.stage2.modelPath
          };
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
        result.configInfo.method = config.method || (config.stage2 ? 'autostructn2v' : 'n2v');
        result.configInfo.features = config.stage1?.features || config.features || 64;
        result.configInfo.numLayers = config.stage1?.num_layers || config.num_layers || 2;
        result.configInfo.patchSize = config.stage1?.patch_size || config.patch_size || 64;

        // For autoStructN2V, check if this is a stage1 or stage2 config
        if (stage === 'stage2' && config.stage2) {
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

      // Validate config structure
      if (!config.method && !config.stage1) {
        result.errors.push('Invalid config: missing method or stage1 configuration');
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
    const { trainingId, stage1Dir, parameters, mode } = params;

    if (!this.pythonPath) {
      throw new Error('Python path not configured');
    }

    // Find denoised images from Stage 1
    // They should be in stage1Dir/extracted_images/ or in the denoised output
    const session = this.getSession(trainingId);
    let inputPath;

    // Check for Stage 1 denoised stack in results directory
    const resultsDir = path.join(stage1Dir, '..', '..', 'results', 'denoising');
    const possiblePaths = [
      path.join(resultsDir, `DL_${trainingId}`, `asn2v_stage1_denoised_${trainingId}.tif`),
      path.join(resultsDir, `DL_${trainingId}`, `n2v_denoised_${trainingId}.tif`),
      session?.config?.input_dir  // Original input as fallback
    ];

    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        inputPath = p;
        break;
      }
    }

    if (!inputPath) {
      throw new Error('Could not find Stage 1 denoised images for mask extraction');
    }

    // Look for saved denoised patches from initial training
    // This ensures regeneration uses exact same patches as initial mask
    let denoisedPatchesPath = null;
    const possiblePatchPaths = [
      path.join(stage1Dir, 'stage2', 'model', 'denoised_patches_for_mask.npy'),
      path.join(stage1Dir, 'stage2_model', 'denoised_patches_for_mask.npy')
    ];

    for (const p of possiblePatchPaths) {
      if (fs.existsSync(p)) {
        denoisedPatchesPath = p;
        if (this.logger) {
          this.logger.info(`Found saved denoised patches at: ${p}`);
        }
        break;
      }
    }

    if (!denoisedPatchesPath && this.logger) {
      this.logger.warn('No saved denoised patches found - will sample from denoised output');
    }

    const outputDir = stage1Dir;

    // Write config to temp file
    const configPath = path.join(outputDir, `mask_config_${Date.now()}.json`);

    // Map frontend parameter names to Python StructuralNoiseExtractor param names
    // Include ALL parameters to match training mode exactly
    const extractorParams = {
      // Core extraction parameters
      norm_autocorr: true,
      log_autocorr: true,
      crop_autocorr: true,
      // Map frontend 'adaptive_thresholding' to Python 'adapt_autocorr'
      adapt_autocorr: parameters.adaptive_thresholding !== false,
      adapt_CB: 50.0,
      adapt_DF: 0.65,
      center_size: 15,
      base_percentile: parameters.base_percentile || 50,
      percentile_decay: parameters.percentile_decay || 1.035,
      center_ratio_threshold: 0.2,
      use_center_proximity: true,
      center_proximity_threshold: 0.95,
      keep_center_component_only: true,
      // Map frontend 'max_masked_pixels' to Python 'max_true_pixels'
      max_true_pixels: parameters.max_masked_pixels || 25
    };

    try {
      await fsp.mkdir(outputDir, { recursive: true });
      const maskConfig = {
        input_path: inputPath,
        output_dir: outputDir,
        extractor: extractorParams,
        patch_size: 64,
        mode: mode || '2d'  // '2d' or '2.5d'
      };
      // Include saved patches path if available for exact match with training
      if (denoisedPatchesPath) {
        maskConfig.denoised_patches_path = denoisedPatchesPath;
      }
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

              // Update session
              if (session) {
                session.mask.kernelSize = resultData.kernelSize;
                session.mask.kernelHeight = resultData.kernelHeight;
                session.mask.kernelWidth = resultData.kernelWidth;
                session.mask.activePixels = resultData.activePixels;
                session.mask.pattern = resultData.pattern;
                session.mask.maskPath = resultData.maskPath;
                session.mask.isEmpty = resultData.activePixels < 2;
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
