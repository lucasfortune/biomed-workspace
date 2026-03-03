/**
 * Python Process Runner
 *
 * Centralized helper for spawning Python processes with proper error handling.
 * All Python script interactions should go through this module.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  attachErrorHandler,
  createTrainingErrorHandler,
  createInferenceErrorHandler
} = require('../../utils/processErrorHandler');

/**
 * Run a Python script and return the JSON result
 * @param {string} pythonPath - Path to Python interpreter
 * @param {Array<string>} args - Script arguments
 * @param {object} options - Options
 * @param {object} options.logger - Logger instance
 * @returns {Promise<object>} Parsed JSON result
 */
function runPythonScript(pythonPath, args, options = {}) {
  const { logger } = options;

  return new Promise((resolve) => {
    const pythonScript = spawn(pythonPath, args);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
      if (logger) {
        const message = data.toString().trim();
        if (message) {
          logger.debug('[Python]:', message);
        }
      }
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
      if (logger) {
        const message = data.toString().trim();
        if (message) {
          logger.error('[Python Error]:', message);
        }
      }
    });

    pythonScript.on('close', (code) => {
      // Try parsing the full output as JSON first
      try {
        const result = JSON.parse(output);
        resolve(result);
        return;
      } catch (e) {
        // Full output isn't valid JSON - try extracting JSON from it
        // (handles cases where diagnostic messages are printed before the JSON)
      }

      // Fallback: find the last JSON object in the output
      const jsonMatch = output.match(/\{[\s\S]*\}\s*$/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          resolve(result);
          return;
        } catch (e2) {
          // Still couldn't parse
        }
      }

      if (logger) {
        logger.error('Failed to parse Python output:', output);
        logger.error('Stderr:', error);
      }
      resolve({
        valid: false,
        success: false,
        error: error || 'Invalid output - failed to parse JSON response'
      });
    });
  });
}

/**
 * Validate TIFF stacks (training data + annotations)
 * @param {string} pythonPath - Path to Python interpreter
 * @param {string} rawPath - Path to raw images TIFF
 * @param {string} annotationPath - Path to annotations TIFF
 * @param {object} options - Options
 * @returns {Promise<object>} Validation result
 */
async function validateTiffStacks(pythonPath, rawPath, annotationPath, options = {}) {
  return runPythonScript(pythonPath, [
    'python/validate_tiff.py',
    rawPath,
    annotationPath
  ], options);
}

/**
 * Validate imported model files
 * @param {string} pythonPath - Path to Python interpreter
 * @param {string} modelPath - Path to .pth model file
 * @param {string} configPath - Path to config.json
 * @param {object} options - Options
 * @returns {Promise<object>} Validation result
 */
async function validateImportedModel(pythonPath, modelPath, configPath, options = {}) {
  return runPythonScript(pythonPath, [
    'python/validate_imported_model.py',
    modelPath,
    configPath
  ], options);
}

/**
 * Validate inference TIFF file
 * @param {string} pythonPath - Path to Python interpreter
 * @param {string} filePath - Path to TIFF file
 * @param {object} options - Options
 * @returns {Promise<object>} Validation result
 */
async function validateInferenceTiff(pythonPath, filePath, options = {}) {
  return runPythonScript(pythonPath, [
    'python/validate_inference_tiff.py',
    filePath
  ], options);
}

/**
 * Generate thumbnail for a TIFF file
 * @param {string} pythonPath - Path to Python interpreter
 * @param {string} inputPath - Path to input TIFF
 * @param {string} outputPath - Path for output thumbnail
 * @param {object} options - Options
 * @returns {Promise<boolean>} Success status
 */
function generateThumbnail(pythonPath, inputPath, outputPath, options = {}) {
  const { logger } = options;

  return new Promise((resolve) => {
    const process = spawn(pythonPath, [
      'python/generate_thumbnail.py',
      inputPath,
      outputPath
    ]);

    process.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        if (logger) {
          logger.error(`Thumbnail generation failed with code ${code}`);
        }
        resolve(false);
      }
    });

    process.on('error', (err) => {
      if (logger) {
        logger.error('Thumbnail generation error:', err.message);
      }
      resolve(false);
    });
  });
}

/**
 * Start a training process with real-time progress updates
 * @param {string} pythonPath - Path to Python interpreter
 * @param {object} params - Training parameters
 * @param {object} params.config - Training configuration
 * @param {string} params.raw_images - Path to raw images
 * @param {string} params.annotations - Path to annotations
 * @param {string} params.output_dir - Output directory
 * @param {string} params.training_id - Training ID
 * @param {object} io - Socket.IO instance
 * @param {Map} trainingSessions - Training sessions map
 * @param {object} options - Options
 * @param {object} options.logger - Logger instance
 * @param {function} options.onComplete - Callback on completion
 * @param {function} options.onProcessStart - Callback when process starts (for registration)
 * @param {function} options.onProcessEnd - Callback when process ends (for cleanup)
 */
function startTrainingProcess(pythonPath, params, io, trainingSessions, options = {}) {
  const { logger, onComplete, onProcessStart, onProcessEnd } = options;

  const spawnArgs = [
    'python/train_model.py',
    '--config', JSON.stringify(params.config),
    '--raw_images', params.raw_images,
    '--annotations', params.annotations,
    '--output_dir', params.output_dir,
    '--training_id', params.training_id
  ];

  if (params.direction_volume) {
    spawnArgs.push('--direction_volume', params.direction_volume);
  }

  if (params.context_slices) {
    spawnArgs.push('--context_slices', String(params.context_slices));
  }

  const pythonScript = spawn(pythonPath, spawnArgs);

  // Register process for cancellation support
  if (onProcessStart) {
    onProcessStart(pythonScript, params.training_id);
  }

  // Attach unified error handler
  const stderrBuffer = attachErrorHandler(
    pythonScript,
    createTrainingErrorHandler(params.training_id, pythonPath, io, trainingSessions)
  );

  let outputBuffer = '';

  pythonScript.stdout.on('data', (data) => {
    const output = data.toString();
    if (logger) {
      logger.debug('Training output:', output);
    }

    outputBuffer += output;

    // Process complete lines
    const lines = outputBuffer.split('\n');
    outputBuffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('PROGRESS:')) {
        try {
          const progressData = line.substring(9);
          const progress = JSON.parse(progressData);

          if (logger) {
            logger.debug('Parsed progress:', progress);
          }

          // Update training session
          const training = trainingSessions.get(params.training_id);
          if (training) {
            training.status = 'training';
            training.current_epoch = progress.epoch;
            training.total_epochs = progress.total_epochs;
            training.metrics = progress.metrics;

            // Store in history for chart restoration on resume
            // Only store if we have valid epoch and metrics (skip initial/empty progress events)
            const epoch = progress.epoch;
            const trainLoss = progress.metrics?.train_loss;
            const valLoss = progress.metrics?.val_loss;
            const trainDice = progress.metrics?.train_dice;
            const valDice = progress.metrics?.val_dice;

            if (epoch != null && epoch > 0 && trainLoss != null && valLoss != null) {
              if (!training.history) training.history = [];
              const historyEntry = {
                epoch: epoch,
                train_loss: trainLoss,
                val_loss: valLoss,
                train_dice: trainDice,
                val_dice: valDice
              };

              // Store direction sub-losses when present (direction-aware training)
              const metrics = progress.metrics;
              if (metrics.train_seg_loss != null) historyEntry.train_seg_loss = metrics.train_seg_loss;
              if (metrics.train_dir_loss != null) historyEntry.train_dir_loss = metrics.train_dir_loss;
              if (metrics.val_seg_loss != null) historyEntry.val_seg_loss = metrics.val_seg_loss;
              if (metrics.val_dir_loss != null) historyEntry.val_dir_loss = metrics.val_dir_loss;

              training.history.push(historyEntry);
            }
          }

          // Send real-time update to clients
          io.to(`training-${params.training_id}`).emit('training-progress', progress);

        } catch (e) {
          if (logger) {
            logger.error('Error parsing progress data:', e.message);
          }
        }
      }
    }
  });

  pythonScript.on('close', async (code) => {
    // Unregister process from cancellation tracking
    if (onProcessEnd) {
      onProcessEnd(params.training_id);
    }

    const training = trainingSessions.get(params.training_id);

    if (training) {
      if (code === 0) {
        training.status = 'completed';
        training.endTime = new Date();
        io.to(`training-${params.training_id}`).emit('training-complete', { success: true });

        if (onComplete) {
          await onComplete(training, params);
        }
      } else {
        // Check if training was cancelled (status set by TrainingService.cancelTraining)
        // Don't emit failure for cancelled training - it already emitted 'training-cancelled'
        if (training.status === 'cancelled') {
          if (logger) {
            logger.debug(`[TRAINING] Process ended due to cancellation: ${params.training_id}`);
          }
          return;
        }

        training.status = 'failed';
        training.endTime = new Date();

        const stderrOutput = stderrBuffer.getBuffer();
        const errorMessage = stderrOutput || 'Training failed with unknown error';

        if (logger) {
          logger.error(`[TRAINING] Process failed with code ${code}`);
          logger.error(`[TRAINING] stderr output: ${stderrOutput}`);
        }

        io.to(`training-${params.training_id}`).emit('training-complete', {
          success: false,
          error: errorMessage
        });
      }
    }
  });
}

/**
 * Run inference with real-time progress updates
 * @param {string} pythonPath - Path to Python interpreter
 * @param {string} modelPath - Path to model file
 * @param {string} dataPath - Path to input data
 * @param {string} outputPath - Path for output file
 * @param {string} inferenceId - Inference ID
 * @param {object} io - Socket.IO instance
 * @param {Map} inferenceSessions - Inference sessions map
 * @param {object} options - Options
 * @returns {Promise<object>} Inference result
 */
function runInferenceWithProgress(pythonPath, modelPath, dataPath, outputPath, inferenceId, io, inferenceSessions, options = {}) {
  const { logger } = options;

  return new Promise((resolve, reject) => {
    const pythonScript = spawn(pythonPath, [
      'python/run_inference.py',
      '--model', modelPath,
      '--input', dataPath,
      '--output', outputPath,
      '--inference_id', inferenceId
    ]);

    // Attach unified error handler
    const stderrBuffer = attachErrorHandler(
      pythonScript,
      createInferenceErrorHandler(inferenceId, pythonPath, io, inferenceSessions, (error) => {
        reject(error);
      })
    );

    let outputBuffer = '';
    let finalResult = null;
    let backupJsonLines = [];
    let collectingBackupJson = false;

    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();
      if (logger) {
        logger.debug('Inference output:', output);
      }

      outputBuffer += output;

      // Process complete lines
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('INFERENCE_PROGRESS:')) {
          try {
            const progressData = line.substring(19);
            const progress = JSON.parse(progressData);

            if (logger) {
              logger.debug('Parsed inference progress:', progress);
            }

            // Update inference session
            const inference = inferenceSessions.get(inferenceId);
            if (inference) {
              inference.currentSlice = progress.current_slice;
              inference.totalSlices = progress.total_slices;
              inference.progress = progress.progress_percent;
            }

            // Send real-time update to clients
            io.to(`inference-${inferenceId}`).emit('inference-progress', progress);

          } catch (e) {
            if (logger) {
              logger.error('Error parsing inference progress data:', e.message);
            }
          }
        } else if (line.startsWith('FINAL_RESULT:')) {
          try {
            const resultData = line.substring(13);
            finalResult = JSON.parse(resultData);
            if (logger) {
              logger.debug('Parsed final result:', finalResult);
            }
          } catch (e) {
            if (logger) {
              logger.error('Error parsing final result:', e.message);
            }
            finalResult = { success: false, error: 'Failed to parse final result' };
          }
        } else if (line === 'BACKUP_JSON_START') {
          collectingBackupJson = true;
          backupJsonLines = [];
        } else if (line === 'BACKUP_JSON_END') {
          collectingBackupJson = false;
          if (!finalResult && backupJsonLines.length > 0) {
            try {
              const backupJsonString = backupJsonLines.join('\n');
              finalResult = JSON.parse(backupJsonString);
              if (logger) {
                logger.debug('Successfully parsed backup JSON:', finalResult);
              }
            } catch (e) {
              if (logger) {
                logger.error('Failed to parse backup JSON:', e.message);
              }
            }
          }
        } else if (collectingBackupJson) {
          backupJsonLines.push(line);
        }
      }
    });

    pythonScript.on('close', (code) => {
      const inference = inferenceSessions.get(inferenceId);

      if (logger) {
        logger.debug(`[INFERENCE] Python script finished with code: ${code}`);
        logger.debug(`[INFERENCE] Final result found: ${finalResult ? 'yes' : 'no'}`);
      }

      // Handle non-zero exit codes
      if (code !== 0) {
        const stderrOutput = stderrBuffer.getBuffer();
        const errorMessage = stderrOutput || 'Inference failed with unknown error';

        if (logger) {
          logger.error(`[INFERENCE] Process failed with code ${code}`);
          logger.error(`[INFERENCE] Error output: ${stderrOutput}`);
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

      // Determine result source
      let result = null;
      let resultSource = null;

      if (finalResult) {
        result = finalResult;
        resultSource = 'FINAL_RESULT';
      } else {
        const jsonMatch = outputBuffer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            result = JSON.parse(jsonMatch[0]);
            resultSource = 'BUFFER_JSON';
          } catch (e) {
            if (logger) {
              logger.error('[INFERENCE] Failed to parse buffer JSON:', e.message);
            }
          }
        }

        if (!result) {
          result = {
            success: true,
            output_path: outputPath,
            metadata_path: outputPath.replace('.tif', '_metadata.json'),
            visualization_path: outputPath.replace('.tif', '') + '_visualization_data.json',
            metrics: { message: 'Inference completed but metrics not available' }
          };
          resultSource = 'MANUAL';
        }
      }

      // Update session status
      if (inference) {
        inference.status = 'completed';
        inference.endTime = new Date();
      }

      // Resolve with result and source
      resolve({ result, resultSource, inference });
    });
  });
}

/**
 * Start an inference process (fire and forget with callbacks)
 * @param {string} pythonPath - Path to Python interpreter
 * @param {string} modelPath - Path to model file
 * @param {string} dataPath - Path to input data
 * @param {string} outputPath - Path for output file
 * @param {string} inferenceId - Inference ID
 * @param {object} io - Socket.IO instance
 * @param {Map} inferenceSessions - Inference sessions map
 * @param {object} options - Options
 * @param {function} options.onSuccess - Success callback
 * @param {function} options.onError - Error callback
 */
function startInferenceProcess(pythonPath, modelPath, dataPath, outputPath, inferenceId, io, inferenceSessions, options = {}) {
  const { logger, onSuccess, onError } = options;

  // Update inference session status
  const inference = inferenceSessions.get(inferenceId);
  if (inference) {
    inference.status = 'running';
  }

  // Start the inference process
  runInferenceWithProgress(pythonPath, modelPath, dataPath, outputPath, inferenceId, io, inferenceSessions, { logger })
    .then(async ({ result, resultSource, inference }) => {
      if (logger) {
        logger.info('Inference completed successfully');
      }

      // Update inference session with final result
      if (inference) {
        inference.result = result;
      }

      if (onSuccess) {
        await onSuccess(result, resultSource, inference);
      }

      // Emit completion event
      io.to(`inference-${inferenceId}`).emit('inference-complete', {
        success: true,
        result: result
      });
    })
    .catch((error) => {
      if (logger) {
        logger.error('Inference failed:', error);
      }

      if (onError) {
        onError(error);
      }
    });
}

module.exports = {
  runPythonScript,
  validateTiffStacks,
  validateImportedModel,
  validateInferenceTiff,
  generateThumbnail,
  startTrainingProcess,
  runInferenceWithProgress,
  startInferenceProcess
};
