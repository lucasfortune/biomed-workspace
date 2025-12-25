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

class DenoisingService {
  /**
   * Create DenoisingService instance
   * @param {object} options - Configuration options
   * @param {string} options.pythonPath - Path to Python interpreter
   * @param {object} options.sessionTracker - SessionTracker instance
   * @param {object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.pythonPath = options.pythonPath;
    this.sessionTracker = options.sessionTracker;
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
      await fsp.writeFile(configPath, JSON.stringify({
        ...config,
        training_id: trainingId,
        input_dir: inputPath,
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
      } else if (stage === 'complete') {
        session.status = 'completed';
        session.experimentDir = data.experimentDir;
      }
    }

    // Emit to room
    io.to(roomName).emit(`denoising-${stage}-complete`, data);

    if (this.logger) {
      this.logger.debug(`Emitted ${stage} complete to ${roomName}`);
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
   * @param {object} io - Socket.IO instance
   */
  async regenerateMask(params, io) {
    const { trainingId, inputPath, outputDir, extractorParams } = params;

    if (!this.pythonPath) {
      this._emitError(io, trainingId, 'mask', 'Python path not configured');
      return;
    }

    // Write config to temp file
    const configPath = path.join(outputDir, `mask_config_${Date.now()}.json`);

    try {
      await fsp.mkdir(outputDir, { recursive: true });
      await fsp.writeFile(configPath, JSON.stringify({
        input_path: inputPath,
        output_dir: outputDir,
        extractor: extractorParams,
        patch_size: 64
      }, null, 2));
    } catch (err) {
      this._emitError(io, trainingId, 'mask', `Failed to write config: ${err.message}`);
      return;
    }

    const roomName = `denoising-${trainingId}`;

    // Spawn Python process
    const pythonScript = spawn(this.pythonPath, [
      'python/autostructn2v_wrapper.py',
      '--config', configPath,
      '--mode', 'extract_mask'
    ]);

    let outputBuffer = '';

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
            // Update session
            const session = this.getSession(trainingId);
            if (session) {
              session.mask.kernelSize = resultData.kernelSize;
              session.mask.activePixels = resultData.activePixels;
              session.mask.pattern = resultData.pattern;
              session.mask.maskPath = resultData.maskPath;
            }
            io.to(roomName).emit('denoising-mask-result', resultData);
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

    pythonScript.on('close', () => {
      fsp.unlink(configPath).catch(() => {});
    });
  }
}

module.exports = DenoisingService;
