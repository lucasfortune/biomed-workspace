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
    }

    // Spawn Python process
    const pythonScript = spawn(this.pythonPath, [
      'python/autostructn2v_wrapper.py',
      '--config', configPath,
      '--mode', 'train'
    ]);

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
    const { trainingId, session } = params;

    if (!this.pythonPath) {
      this._emitError(io, trainingId, 'stage2', 'Python path not configured');
      return;
    }

    // Update session status
    session.status = 'running';
    session.stage = 'stage2';
    session.stage2.status = 'starting';

    // Build config for Stage 2 only
    const stage2Config = {
      training_id: trainingId,
      method: 'autostructn2v',
      experiment_dir: session.experimentDir,
      mask_path: session.maskPath,
      stage1_model_path: session.stage1ModelPath,
      stage1_denoised_dir: session.stage1DenoisedDir,
      // Include original config for stage2 parameters
      stage2: session.config?.stage2 || {},
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
      } else if (stage === 'mask') {
        session.mask.status = data.status || 'extracting';
      }
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
        session.mask.activePixels = data.activePixels;
        session.mask.pattern = data.pattern;
        session.mask.maskArray = data.maskArray;
      } else if (stage === 'complete') {
        session.status = 'completed';
        session.experimentDir = data.experimentDir;
        session.outputFiles = data.outputFiles;

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

      // Track denoised TIFF stacks
      if (outputFiles.stage1_stack && fs.existsSync(outputFiles.stage1_stack)) {
        const relativePath = path.relative(workspacePath, outputFiles.stage1_stack);
        const stats = fs.statSync(outputFiles.stage1_stack);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.stage1_stack),
          path: relativePath,
          category: 'denoised_images',
          size: stats.size,
          folderId: null,
          lineage: {
            operation: `denoising-${method}`,
            trainingId: trainingId
          }
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
          category: 'denoised_images',
          size: stats.size,
          folderId: null,
          lineage: {
            operation: `denoising-${method}-stage2`,
            trainingId: trainingId
          }
        });
        if (this.logger) {
          this.logger.debug(`Tracked stage2 output: ${relativePath}`);
        }
      }

      // Track model files
      if (outputFiles.stage1_model && fs.existsSync(outputFiles.stage1_model)) {
        const relativePath = path.relative(workspacePath, outputFiles.stage1_model);
        const stats = fs.statSync(outputFiles.stage1_model);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.stage1_model),
          path: relativePath,
          category: 'models',
          size: stats.size,
          folderId: null,
          lineage: {
            operation: `denoising-${method}-model`,
            trainingId: trainingId
          }
        });
      }

      if (outputFiles.stage2_model && fs.existsSync(outputFiles.stage2_model)) {
        const relativePath = path.relative(workspacePath, outputFiles.stage2_model);
        const stats = fs.statSync(outputFiles.stage2_model);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.stage2_model),
          path: relativePath,
          category: 'models',
          size: stats.size,
          folderId: null,
          lineage: {
            operation: `denoising-${method}-model-stage2`,
            trainingId: trainingId
          }
        });
      }

      // Track config file
      if (outputFiles.config && fs.existsSync(outputFiles.config)) {
        const relativePath = path.relative(workspacePath, outputFiles.config);
        const stats = fs.statSync(outputFiles.config);
        this.workspaceManager.addFileToMetadata(sessionId, {
          name: path.basename(outputFiles.config),
          path: relativePath,
          category: 'config',
          size: stats.size,
          folderId: null
        });
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

  // ===========================================================================
  // INFERENCE
  // ===========================================================================

  /**
   * Run inference with a trained model
   * @param {object} params - Inference parameters
   * @param {object} io - Socket.IO instance
   */
  async runInference(params, io) {
    const { inferenceId, modelPath, inputPath, outputDir, modelConfig, stage } = params;

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
        stage: stage || 'stage1'
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
    const { trainingId, stage1Dir, parameters } = params;

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
      adapt_DF: 0.95,
      center_size: 10,
      base_percentile: parameters.base_percentile || 50,
      percentile_decay: parameters.percentile_decay || 1.15,
      center_ratio_threshold: 0.3,
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
        patch_size: 64
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
