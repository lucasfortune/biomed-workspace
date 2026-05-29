/**
 * InferenceService
 *
 * Handles inference process orchestration including:
 * - Spawning Python inference processes
 * - Parsing real-time progress updates
 * - Managing inference session state
 * - Emitting Socket.IO events
 * - Tracking output files
 * - Converting paths for web access
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  attachErrorHandler,
  createInferenceErrorHandler
} = require('../../utils/processErrorHandler');
const { convertResultPathsForWeb } = require('../helpers/pathHelpers');
const { createLineage } = require('../helpers/lineageHelpers');

class InferenceService {
  /**
   * Create InferenceService instance
   * @param {object} options - Configuration options
   * @param {string} options.pythonPath - Path to Python interpreter
   * @param {object} options.sessionTracker - SessionTracker instance
   * @param {object} options.fileService - FileService instance for tracking outputs
   * @param {object} options.workspaceService - WorkspaceService instance
   * @param {object} options.workspaceManager - WorkspaceManager instance
   * @param {object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.pythonPath = options.pythonPath;
    this.sessionTracker = options.sessionTracker;
    this.fileService = options.fileService;
    this.workspaceService = options.workspaceService;
    this.workspaceManager = options.workspaceManager;
    this.logger = options.logger;
  }

  // ===========================================================================
  // INFERENCE SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Create a new inference session
   * @param {string} inferenceId - Unique inference ID
   * @param {object} sessionData - Session data
   * @returns {object} Inference session object
   */
  createInferenceSession(inferenceId, sessionData) {
    const session = {
      id: inferenceId,
      sessionId: sessionData.sessionId,
      status: 'pending',
      startTime: new Date(),
      endTime: null,
      currentSlice: 0,
      totalSlices: 0,
      progress: 0,
      modelPath: sessionData.modelPath,
      dataPath: sessionData.dataPath,
      outputPath: sessionData.outputPath,
      result: null,
      error: null
    };

    this.sessionTracker.setInferenceSession(inferenceId, session);

    if (this.logger) {
      this.logger.debug(`Created inference session: ${inferenceId}`);
    }

    return session;
  }

  /**
   * Get inference session by ID
   * @param {string} inferenceId - Inference ID
   * @returns {object|undefined} Inference session
   */
  getInferenceSession(inferenceId) {
    return this.sessionTracker.getInferenceSession(inferenceId);
  }

  /**
   * Update inference session status
   * @param {string} inferenceId - Inference ID
   * @param {string} status - New status
   * @param {object} data - Additional data to update
   */
  updateInferenceStatus(inferenceId, status, data = {}) {
    const session = this.sessionTracker.getInferenceSession(inferenceId);
    if (session) {
      session.status = status;
      Object.assign(session, data);

      if (status === 'completed' || status === 'failed') {
        session.endTime = new Date();
      }
    }
  }

  // ===========================================================================
  // INFERENCE PROCESS EXECUTION
  // ===========================================================================

  /**
   * Start an inference process (fire and forget with callbacks)
   * @param {string} modelPath - Path to model file
   * @param {string} dataPath - Path to input data
   * @param {string} outputPath - Path for output file
   * @param {string} inferenceId - Inference ID
   * @param {object} io - Socket.IO instance
   */
  startInferenceProcess(modelPath, dataPath, outputPath, inferenceId, io) {
    // Update inference session status
    const inference = this.sessionTracker.getInferenceSession(inferenceId);
    if (inference) {
      inference.status = 'running';
    }

    // Start the inference process
    this.runInferenceWithProgress(modelPath, dataPath, outputPath, inferenceId, io)
      .then((result) => {
        if (this.logger) {
          this.logger.info('Inference completed successfully:', result);
        }

        // Update inference session with final result
        const inference = this.sessionTracker.getInferenceSession(inferenceId);
        if (inference) {
          inference.status = 'completed';
          inference.endTime = new Date();
          inference.result = result;
        }
      })
      .catch((error) => {
        if (this.logger) {
          this.logger.error('Inference failed:', error);
        }

        // Update inference session with error
        const inference = this.sessionTracker.getInferenceSession(inferenceId);
        if (inference) {
          inference.status = 'failed';
          inference.endTime = new Date();
          inference.error = error.message;
        }
      });
  }

  /**
   * Run inference with progress tracking (returns promise)
   * @param {string} modelPath - Path to model file
   * @param {string} dataPath - Path to input data
   * @param {string} outputPath - Path for output file
   * @param {string} inferenceId - Inference ID
   * @param {object} io - Socket.IO instance
   * @returns {Promise<object>} Inference result
   */
  runInferenceWithProgress(modelPath, dataPath, outputPath, inferenceId, io) {
    return new Promise((resolve, reject) => {
      if (!this.pythonPath) {
        const error = new Error('Python path not configured');
        if (this.logger) {
          this.logger.error('Python path not configured for inference');
        }
        io.to(`inference-${inferenceId}`).emit('inference-complete', {
          success: false,
          error: error.message
        });
        reject(error);
        return;
      }

      const pythonScript = spawn(this.pythonPath, [
        'python/run_inference.py',
        '--model', modelPath,
        '--input', dataPath,
        '--output', outputPath,
        '--inference_id', inferenceId
      ]);

      // Attach unified error handler
      const stderrBuffer = attachErrorHandler(
        pythonScript,
        createInferenceErrorHandler(
          inferenceId,
          this.pythonPath,
          io,
          this.sessionTracker.inferenceSessions,
          (error) => {
            // Custom error callback - reject the promise on spawn error
            reject(error);
          }
        )
      );

      let outputBuffer = '';
      let finalResult = null;
      let backupJsonLines = [];
      let collectingBackupJson = false;

      // Handle stdout for progress updates
      pythonScript.stdout.on('data', (data) => {
        const output = data.toString();

        if (this.logger) {
          this.logger.debug('Inference output:', output);
        }

        // Add to buffer
        outputBuffer += output;

        // Process complete lines
        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('INFERENCE_PROGRESS:')) {
            this.handleProgressLine(line, inferenceId, io);
          } else if (line.startsWith('FINAL_RESULT:')) {
            finalResult = this.parseFinalResult(line);
          } else if (line === 'BACKUP_JSON_START') {
            collectingBackupJson = true;
            backupJsonLines = [];
            if (this.logger) {
              this.logger.debug('Started collecting backup JSON');
            }
          } else if (line === 'BACKUP_JSON_END') {
            collectingBackupJson = false;
            if (this.logger) {
              this.logger.debug('Finished collecting backup JSON');
            }

            // Try to parse backup JSON if we don't have final result yet
            if (!finalResult && backupJsonLines.length > 0) {
              finalResult = this.parseBackupJson(backupJsonLines);
            }
          } else if (collectingBackupJson) {
            backupJsonLines.push(line);
          }
        }
      });

      // Handle process completion
      pythonScript.on('close', async (code) => {
        await this.handleInferenceComplete(
          code,
          inferenceId,
          outputPath,
          finalResult,
          outputBuffer,
          stderrBuffer,
          io,
          resolve,
          reject
        );
      });
    });
  }

  /**
   * Handle a progress line from the inference process
   * @param {string} line - Progress line from stdout
   * @param {string} inferenceId - Inference ID
   * @param {object} io - Socket.IO instance
   */
  handleProgressLine(line, inferenceId, io) {
    try {
      const progressData = line.substring(19); // Remove 'INFERENCE_PROGRESS:' prefix
      const progress = JSON.parse(progressData);

      if (this.logger) {
        this.logger.debug('Parsed inference progress:', progress);
      }

      // Device init message: forward to clients without touching slice state
      if (progress.type === 'init') {
        io.to(`inference-${inferenceId}`).emit('inference-progress', progress);
        return;
      }

      // Update inference session
      const inference = this.sessionTracker.getInferenceSession(inferenceId);
      if (inference) {
        inference.currentSlice = progress.current_slice;
        inference.totalSlices = progress.total_slices;
        inference.progress = progress.progress_percent;
      }

      // Keep workspace fresh during long-running inference
      if (inference && this.workspaceManager) {
        this.workspaceManager.touchWorkspace(inference.sessionId);
      }

      // Send real-time update to clients
      io.to(`inference-${inferenceId}`).emit('inference-progress', progress);

      if (this.logger) {
        this.logger.debug(`Emitted inference progress to room: inference-${inferenceId}`);
      }

    } catch (e) {
      if (this.logger) {
        this.logger.error('Error parsing inference progress data:', e.message);
      }
    }
  }

  /**
   * Parse the final result line
   * @param {string} line - FINAL_RESULT line
   * @returns {object|null} Parsed result or null
   */
  parseFinalResult(line) {
    try {
      const resultData = line.substring(13); // Remove 'FINAL_RESULT:' prefix
      const result = JSON.parse(resultData);

      if (this.logger) {
        this.logger.debug('Parsed final result:', result);
      }

      return result;
    } catch (e) {
      if (this.logger) {
        this.logger.error('Error parsing final result:', e.message);
      }
      return { success: false, error: 'Failed to parse final result' };
    }
  }

  /**
   * Parse backup JSON lines
   * @param {Array<string>} lines - Backup JSON lines
   * @returns {object|null} Parsed result or null
   */
  parseBackupJson(lines) {
    try {
      const backupJsonString = lines.join('\n');
      const result = JSON.parse(backupJsonString);

      if (this.logger) {
        this.logger.debug('Successfully parsed backup JSON:', result);
      }

      return result;
    } catch (e) {
      if (this.logger) {
        this.logger.error('Failed to parse backup JSON:', e.message);
      }
      return null;
    }
  }

  /**
   * Handle inference process completion
   * @param {number} code - Exit code
   * @param {string} inferenceId - Inference ID
   * @param {string} outputPath - Output file path
   * @param {object|null} finalResult - Parsed final result
   * @param {string} outputBuffer - Remaining output buffer
   * @param {object} stderrBuffer - Stderr buffer
   * @param {object} io - Socket.IO instance
   * @param {function} resolve - Promise resolve
   * @param {function} reject - Promise reject
   */
  async handleInferenceComplete(
    code,
    inferenceId,
    outputPath,
    finalResult,
    outputBuffer,
    stderrBuffer,
    io,
    resolve,
    reject
  ) {
    const inference = this.sessionTracker.getInferenceSession(inferenceId);

    if (this.logger) {
      this.logger.debug(`[INFERENCE] Python script finished with code: ${code}`);
      this.logger.debug(`[INFERENCE] Final result found: ${finalResult ? 'yes' : 'no'}`);
    }

    // STEP 1: Handle non-zero exit codes (failures)
    if (code !== 0) {
      const stderrOutput = stderrBuffer.getBuffer();
      const errorMessage = stderrOutput || 'Inference failed with unknown error';

      if (this.logger) {
        this.logger.error(`[INFERENCE] Process failed with code ${code}`);
        this.logger.error(`[INFERENCE] Error output: ${stderrOutput}`);
      }

      if (inference) {
        inference.status = 'failed';
        inference.endTime = new Date();
      }

      io.to(`inference-${inferenceId}`).emit('inference-complete', {
        success: false,
        error: errorMessage
      });

      reject(new Error(`Inference failed with code ${code}: ${errorMessage}`));
      return;
    }

    // STEP 2: Determine result source and parse result
    let result = this.determineResult(finalResult, outputBuffer, outputPath);
    const resultSource = result.source;
    result = result.data;

    // STEP 3: Update session status
    if (inference) {
      inference.status = 'completed';
      inference.endTime = new Date();
    }

    // STEP 4: Track files ONCE (single tracking point) with lineage
    if (inference && result && this.fileService) {
      // Build lineage from inference session's input file IDs
      const lineage = this.buildInferenceLineage(inference, inferenceId);

      await this.fileService.trackInferenceResults(
        result,
        inferenceId,
        inference.sessionId,
        resultSource,
        lineage
      );
    }

    // STEP 5: Convert paths to web-accessible format
    if (inference && result && this.workspaceService) {
      const workspacePath = this.workspaceService.getWorkspacePath(inference.sessionId);
      result = convertResultPathsForWeb(result, inference.sessionId, workspacePath);

      if (this.logger) {
        this.logger.debug('[INFERENCE] Converted paths for web access');
      }
    }

    // STEP 6: Emit completion event
    io.to(`inference-${inferenceId}`).emit('inference-complete', {
      success: true,
      result: result
    });

    // STEP 7: Resolve or reject promise
    if (result && result.success) {
      resolve(result);
    } else {
      reject(new Error(result?.error || 'Inference failed'));
    }
  }

  /**
   * Determine the result from available sources
   * @param {object|null} finalResult - Parsed final result
   * @param {string} outputBuffer - Output buffer
   * @param {string} outputPath - Output path
   * @returns {object} Object with source and data
   */
  determineResult(finalResult, outputBuffer, outputPath) {
    if (finalResult) {
      // Source 1: FINAL_RESULT prefix from Python script
      if (this.logger) {
        this.logger.debug('[INFERENCE] Using FINAL_RESULT from Python script');
      }
      return { source: 'FINAL_RESULT', data: finalResult };
    }

    // Source 2: Try to parse JSON from output buffer
    if (this.logger) {
      this.logger.debug('[INFERENCE] No FINAL_RESULT found, trying to parse buffer...');
    }

    const jsonMatch = outputBuffer.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);

        if (this.logger) {
          this.logger.debug('[INFERENCE] Successfully parsed JSON from buffer');
        }

        return { source: 'BUFFER_JSON', data: result };
      } catch (e) {
        if (this.logger) {
          this.logger.error('[INFERENCE] Failed to parse buffer JSON:', e.message);
        }
      }
    }

    // Source 3: Create manual result as last resort
    if (this.logger) {
      this.logger.debug('[INFERENCE] Created manual result (no JSON output found)');
    }

    return {
      source: 'MANUAL',
      data: {
        success: true,
        output_path: outputPath,
        metadata_path: outputPath.replace('.tif', '_metadata.json'),
        visualization_path: outputPath.replace('.tif', '') + '_visualization_data.json',
        metrics: { message: 'Inference completed but metrics not available' }
      }
    };
  }

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  /**
   * Validate inference TIFF file
   * @param {string} filePath - Path to TIFF file
   * @returns {Promise<object>} Validation result
   */
  async validateInferenceTiff(filePath) {
    return new Promise((resolve) => {
      if (!this.pythonPath) {
        resolve({ valid: false, error: 'Python path not configured' });
        return;
      }

      const pythonScript = spawn(this.pythonPath, [
        'python/validate_inference_tiff.py',
        filePath
      ]);

      let output = '';
      let error = '';

      pythonScript.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonScript.stderr.on('data', (data) => {
        error += data.toString();
      });

      pythonScript.on('close', (code) => {
        // Always try to parse the JSON output first, regardless of exit code
        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (e) {
          if (this.logger) {
            this.logger.error('Failed to parse validation output:', output);
            this.logger.error('Stderr:', error);
          }
          resolve({
            valid: false,
            error: error || 'Invalid validation output - failed to parse JSON response'
          });
        }
      });
    });
  }

  // ===========================================================================
  // LINEAGE TRACKING
  // ===========================================================================

  /**
   * Build lineage object from inference session data
   * @param {object} inference - Inference session object
   * @param {string} inferenceId - Inference ID
   * @returns {object|null} Lineage object or null if no input file IDs
   */
  buildInferenceLineage(inference, inferenceId) {
    // Check if inference session has input file IDs
    if (!inference || !inference.inputFileIds || inference.inputFileIds.length === 0) {
      if (this.logger) {
        this.logger.debug('[INFERENCE] No inputFileIds found for lineage tracking');
      }
      return null;
    }

    try {
      const lineage = createLineage('segmentation', inference.inputFileIds, inferenceId);
      if (this.logger) {
        this.logger.debug('[INFERENCE] Built lineage:', lineage);
      }
      return lineage;
    } catch (error) {
      if (this.logger) {
        this.logger.error('[INFERENCE] Failed to build lineage:', error.message);
      }
      return null;
    }
  }

  /**
   * Get inference status for API response
   * @param {string} inferenceId - Inference ID
   * @returns {object} Status object
   */
  getInferenceStatus(inferenceId) {
    const session = this.sessionTracker.getInferenceSession(inferenceId);

    if (!session) {
      return { found: false };
    }

    return {
      found: true,
      id: session.id,
      status: session.status,
      currentSlice: session.currentSlice,
      totalSlices: session.totalSlices,
      progress: session.progress,
      startTime: session.startTime,
      endTime: session.endTime,
      result: session.result,
      error: session.error
    };
  }
}

module.exports = InferenceService;
