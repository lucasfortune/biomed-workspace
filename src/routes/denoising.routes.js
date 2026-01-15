/**
 * Denoising Routes
 *
 * Handles filter-based denoising operations.
 * Mounted at /api/denoising
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth.middleware');
const { PYTHON_PATH } = require('../config/constants');
const { createLineage } = require('../helpers/lineageHelpers');

/**
 * Create denoising routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.workspaceService - WorkspaceService instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @returns {Router} Express router
 */
function createDenoisingRoutes(dependencies) {
  const router = express.Router();
  const {
    workspaceManager,
    workspaceService,
    activityLogger,
    logger
  } = dependencies;

  // ===========================================================================
  // FILTER-BASED DENOISING
  // ===========================================================================

  /**
   * Process image with filter-based denoising
   * POST /api/denoising/filter/process
   *
   * Body:
   *   - inputPath: Path to input TIFF file (relative to workspace)
   *   - method: 'gaussian' or 'nlm'
   *   - parameters: Method-specific parameters
   */
  router.post('/filter/process', requireAuth, async (req, res) => {
    const { inputPath, method, parameters } = req.body;
    const sessionId = req.session.id;

    // Validate input
    if (!inputPath) {
      return res.status(400).json({
        success: false,
        error: 'Input path is required'
      });
    }

    if (!method || !['gaussian', 'nlm'].includes(method)) {
      return res.status(400).json({
        success: false,
        error: 'Method must be "gaussian" or "nlm"'
      });
    }

    try {
      // Generate processing ID
      const processingId = `filter_${Date.now()}`;

      // Get workspace path and resolve input file
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const absoluteInputPath = path.join(workspacePath, inputPath);

      // Verify input file exists
      if (!fs.existsSync(absoluteInputPath)) {
        return res.status(404).json({
          success: false,
          error: 'Input file not found'
        });
      }

      // Create output directory
      const outputDir = path.join(workspacePath, 'results', 'denoising', processingId);
      fs.mkdirSync(outputDir, { recursive: true });

      // Determine output filename based on method
      const outputFilename = `${method}_denoised.tif`;
      const outputPath = path.join(outputDir, outputFilename);

      // Build Python command arguments
      const args = [
        'python/filter_denoising.py',
        '--input', absoluteInputPath,
        '--output', outputPath,
        '--method', method
      ];

      // Add method-specific parameters
      if (method === 'gaussian') {
        if (parameters.sigma) {
          args.push('--sigma', parameters.sigma.toString());
        }
        if (parameters.kernel_size) {
          args.push('--kernel', parameters.kernel_size.toString());
        }
      } else if (method === 'nlm') {
        if (parameters.h) {
          args.push('--h', parameters.h.toString());
        }
        if (parameters.template_window) {
          args.push('--template', parameters.template_window.toString());
        }
        if (parameters.search_window) {
          args.push('--search', parameters.search_window.toString());
        }
      }

      if (logger) {
        logger.info(`[Denoising] Starting ${method} filter processing:`, {
          sessionId,
          processingId,
          inputPath,
          method,
          parameters
        });
      }

      // Run Python script
      const pythonProcess = spawn(PYTHON_PATH, args);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          // Parse result from stdout
          const resultLine = stdout.split('\n').find(l => l.startsWith('FILTER_RESULT:'));
          let result = {};

          if (resultLine) {
            try {
              result = JSON.parse(resultLine.substring(14));
            } catch (parseError) {
              if (logger) {
                logger.warn('[Denoising] Failed to parse result JSON:', parseError);
              }
            }
          }

          // Track output file in workspace metadata
          try {
            // Find input file ID for lineage
            const metadata = workspaceManager.loadMetadata(sessionId);
            const inputFile = metadata?.files?.find(f =>
              f.path === inputPath || path.join(workspacePath, f.path) === absoluteInputPath
            );

            // Create lineage
            let lineage = null;
            if (inputFile) {
              lineage = createLineage(`denoising-${method}`, [inputFile.id], processingId);
            }

            // Get output file size
            const outputStats = fs.existsSync(outputPath) ? fs.statSync(outputPath) : { size: 0 };

            // Add file to metadata
            const fileEntry = workspaceManager.addFileToMetadata(sessionId, {
              name: outputFilename,
              path: path.relative(workspacePath, outputPath),
              category: 'denoised_images',
              size: outputStats.size,
              folderId: null,
              lineage
            });

            if (logger) {
              logger.info(`[Denoising] Processing complete:`, {
                processingId,
                outputPath: path.relative(workspacePath, outputPath),
                slicesProcessed: result.slices_processed
              });
            }

            // Log activity
            if (activityLogger) {
              activityLogger.logActivity(req.session.user.username, 'filter_denoising', {
                processingId,
                method,
                parameters,
                slicesProcessed: result.slices_processed
              });
            }

            res.json({
              success: true,
              processingId,
              outputPath: path.relative(workspacePath, outputPath),
              outputFilename,
              fileId: fileEntry?.id,
              ...result
            });
          } catch (trackError) {
            if (logger) {
              logger.error('[Denoising] Error tracking output:', trackError);
            }

            // Still return success since processing worked
            res.json({
              success: true,
              processingId,
              outputPath: path.relative(workspacePath, outputPath),
              outputFilename,
              ...result
            });
          }
        } else {
          // Check for error message in stdout
          const errorLine = stdout.split('\n').find(l => l.startsWith('FILTER_ERROR:'));
          let errorMessage = stderr || 'Processing failed';

          if (errorLine) {
            try {
              const errorData = JSON.parse(errorLine.substring(13));
              errorMessage = errorData.error || errorMessage;
            } catch (e) {
              // Use stderr if parsing fails
            }
          }

          if (logger) {
            logger.error('[Denoising] Processing failed:', {
              code,
              stderr,
              stdout
            });
          }

          res.status(500).json({
            success: false,
            error: errorMessage
          });
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // DEEP LEARNING DENOISING
  // ===========================================================================

  /**
   * Check GPU availability
   * GET /api/denoising/dl/gpu-check
   *
   * Returns GPU status for the deep learning module.
   */
  router.get('/dl/gpu-check', requireAuth, async (req, res) => {
    try {
      const pythonProcess = spawn(PYTHON_PATH, ['python/utils/gpu_check.py']);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        try {
          const result = JSON.parse(stdout);
          res.json(result);
        } catch (parseError) {
          if (logger) {
            logger.error('[Denoising] Failed to parse GPU check output:', parseError);
          }
          res.json({
            available: false,
            device: 'cpu',
            warning: 'Could not determine GPU status'
          });
        }
      });

      pythonProcess.on('error', (error) => {
        if (logger) {
          logger.error('[Denoising] GPU check process error:', error);
        }
        res.json({
          available: false,
          device: 'cpu',
          warning: `Error checking GPU: ${error.message}`
        });
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] GPU check error:', error);
      }
      res.json({
        available: false,
        device: 'cpu',
        warning: error.message
      });
    }
  });

  /**
   * Validate TIFF file for DL denoising
   * POST /api/denoising/dl/validate
   *
   * Body:
   *   - filePath: Path to TIFF file (relative to workspace)
   *
   * Returns validation result with image info.
   */
  router.post('/dl/validate', requireAuth, async (req, res) => {
    const { filePath } = req.body;
    const sessionId = req.session.id;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const absolutePath = path.join(workspacePath, filePath);

      // Verify file exists
      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Run validation script
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/validate_dl_tiff.py',
        '--input', absolutePath
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        try {
          const result = JSON.parse(stdout);
          res.json({
            success: true,
            ...result
          });
        } catch (parseError) {
          if (logger) {
            logger.error('[Denoising] Failed to parse validation output:', parseError);
          }
          res.status(500).json({
            success: false,
            error: 'Failed to parse validation result',
            details: stderr || stdout
          });
        }
      });

      pythonProcess.on('error', (error) => {
        if (logger) {
          logger.error('[Denoising] Validation process error:', error);
        }
        res.status(500).json({
          success: false,
          error: `Validation error: ${error.message}`
        });
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Validation error:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get configuration presets
   * GET /api/denoising/dl/presets
   *
   * Returns available presets and parameter ranges.
   */
  router.get('/dl/presets', requireAuth, async (req, res) => {
    try {
      const presetsPath = path.join('config', 'denoising_presets.json');

      if (!fs.existsSync(presetsPath)) {
        return res.status(404).json({
          success: false,
          error: 'Presets configuration not found'
        });
      }

      const presetsData = fs.readFileSync(presetsPath, 'utf8');
      const presets = JSON.parse(presetsData);

      res.json({
        success: true,
        ...presets
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error loading presets:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Start DL denoising training
   * POST /api/denoising/dl/start-training
   *
   * Body:
   *   - method: 'n2v' or 'autostructn2v'
   *   - config: Training configuration
   *   - inputFileId: ID of input file in workspace
   *
   * Returns training ID for Socket.IO room joining.
   */
  router.post('/dl/start-training', requireAuth, async (req, res) => {
    const { method, config, inputFileId, inputPath, mode = '2d' } = req.body;
    const sessionId = req.session.id;

    // Validate mode
    if (!['2d', '2.5d'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Mode must be "2d" or "2.5d"'
      });
    }

    // Validate method
    if (!method || !['n2v', 'autostructn2v'].includes(method)) {
      return res.status(400).json({
        success: false,
        error: 'Method must be "n2v" or "autostructn2v"'
      });
    }

    // Validate config
    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'Training configuration is required'
      });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Resolve input path
      let absoluteInputPath;
      if (inputPath) {
        absoluteInputPath = path.join(workspacePath, inputPath);
      } else if (inputFileId) {
        const metadata = workspaceManager.loadMetadata(sessionId);
        const inputFile = metadata?.files?.find(f => f.id === inputFileId);
        if (!inputFile) {
          return res.status(404).json({
            success: false,
            error: 'Input file not found'
          });
        }
        absoluteInputPath = path.join(workspacePath, inputFile.path);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either inputPath or inputFileId is required'
        });
      }

      // Verify input file exists
      if (!fs.existsSync(absoluteInputPath)) {
        return res.status(404).json({
          success: false,
          error: 'Input file not found on disk'
        });
      }

      // Generate training ID
      const trainingId = `dl_denoise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create output directory
      const outputDir = path.join(workspacePath, 'models', 'denoising', trainingId);
      fs.mkdirSync(outputDir, { recursive: true });

      // Build full training config
      // Pass the file path as input_dir - the Python wrapper will extract stacks if needed
      // Restructure config to match Python wrapper expectations:
      // - stage1, stage2 are direct properties
      // - maskExtractor becomes stage2.extractor
      // - Map frontend parameter names to Python parameter names (e.g., epochs -> num_epochs)

      // Helper to map frontend param names to Python param names
      const mapStageConfig = (stageConfig) => {
        if (!stageConfig) return {};
        const mapped = { ...stageConfig };
        // Map 'epochs' to 'num_epochs' for Python compatibility
        if (mapped.epochs !== undefined) {
          mapped.num_epochs = mapped.epochs;
          delete mapped.epochs;
        }
        return mapped;
      };

      // Helper to map frontend mask extractor params to Python param names
      // Include ALL parameters to match regenerate mode exactly
      const mapExtractorConfig = (extractorConfig) => {
        if (!extractorConfig) return {};
        return {
          // Core extraction parameters
          norm_autocorr: extractorConfig.norm_autocorr !== false,
          log_autocorr: extractorConfig.log_autocorr !== false,
          crop_autocorr: extractorConfig.crop_autocorr !== false,
          // Map frontend 'adaptive_thresholding' to Python 'adapt_autocorr'
          adapt_autocorr: extractorConfig.adaptive_thresholding !== false,
          adapt_CB: extractorConfig.adapt_CB || 50.0,
          adapt_DF: extractorConfig.adapt_DF || 0.95,
          center_size: extractorConfig.center_size || 10,
          // User-adjustable parameters
          base_percentile: extractorConfig.base_percentile || 50,
          percentile_decay: extractorConfig.percentile_decay || 1.15,
          // Center proximity parameters
          center_ratio_threshold: extractorConfig.center_ratio_threshold || 0.3,
          use_center_proximity: extractorConfig.use_center_proximity !== false,
          center_proximity_threshold: extractorConfig.center_proximity_threshold || 0.95,
          keep_center_component_only: extractorConfig.keep_center_component_only !== false,
          // Frontend uses 'max_masked_pixels', Python expects 'max_true_pixels'
          max_true_pixels: extractorConfig.max_masked_pixels || 25
        };
      };

      const fullConfig = {
        method,
        mode, // '2d' or '2.5d'
        training_id: trainingId,
        input_dir: absoluteInputPath,
        output_dir: outputDir,
        experiment_name: trainingId,
        device: 'cuda', // Will fallback to CPU in wrapper
        verbose: false,
        // Spread stage1 config with mapped parameter names
        stage1: mapStageConfig(config.stage1),
        // Spread stage2 config with mapped names and add extractor from maskExtractor
        stage2: {
          ...mapStageConfig(config.stage2),
          extractor: mapExtractorConfig(config.maskExtractor)
        },
        // Add workspace directory for output file organization
        workspace_dir: workspacePath,
        // For autoStructN2V: pause after mask extraction to allow user approval
        pauseAfterMask: config.pauseAfterMask || false
      };

      // Log the full config for debugging
      if (logger) {
        logger.info('[Denoising] Full training config:', JSON.stringify(fullConfig, null, 2));
      }

      // Create session in DenoisingService
      const { denoisingService, io } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      // Create training session
      denoisingService.createSession(trainingId, {
        sessionId,
        method,
        mode,
        config: fullConfig,
        inputFileId: inputFileId || null  // Store for lineage tracking
      });

      // Start training asynchronously
      denoisingService.startTraining({
        trainingId,
        config: fullConfig,
        inputPath: absoluteInputPath,
        outputDir
      }, io);

      if (logger) {
        logger.info('[Denoising] Started DL training:', {
          sessionId,
          trainingId,
          method,
          mode
        });
      }

      if (activityLogger) {
        activityLogger.logActivity(req.session.user.username, 'dl_denoising_start', {
          trainingId,
          method,
          mode
        });
      }

      // Return immediately with training ID
      res.json({
        success: true,
        trainingId,
        method,
        mode,
        message: 'Training started. Join Socket.IO room for progress updates.'
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error starting training:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get training status
   * GET /api/denoising/dl/training-status/:trainingId
   *
   * Returns current status of a training session.
   */
  router.get('/dl/training-status/:trainingId', requireAuth, async (req, res) => {
    const { trainingId } = req.params;

    try {
      const { denoisingService } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      const session = denoisingService.getSession(trainingId);

      if (!session) {
        // Session not in memory - could be server restart or completed training
        return res.json({
          success: true,
          status: 'unknown',
          message: 'Training session not found in memory. It may have completed or the server was restarted.'
        });
      }

      res.json({
        success: true,
        status: session.status,
        method: session.method,  // Include method at top level for easy access
        stage1History: session.stage1History || [],  // History for chart restoration
        stage2History: session.stage2History || [],  // History for chart restoration
        session: {
          id: session.id,
          method: session.method,
          status: session.status,
          stage: session.stage,
          startTime: session.startTime,
          endTime: session.endTime,
          stage1: session.stage1,
          mask: session.mask,
          stage2: session.stage2,
          experimentDir: session.experimentDir,
          error: session.error
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error getting training status:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Cancel an ongoing training process
   * POST /api/denoising/dl/cancel-training/:trainingId
   *
   * Kills the Python process and marks the session as cancelled.
   */
  router.post('/dl/cancel-training/:trainingId', requireAuth, async (req, res) => {
    const { trainingId } = req.params;

    try {
      const { denoisingService, io } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      const cancelled = denoisingService.cancelTraining(trainingId, io);

      if (cancelled) {
        if (logger) {
          logger.info(`[Denoising] Training cancelled: ${trainingId}`);
        }
        res.json({
          success: true,
          message: 'Training cancelled successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'No active training process found for this ID'
        });
      }

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error cancelling training:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Run inference with trained or imported model
   * POST /api/denoising/dl/run-inference
   *
   * Body (Training workflow):
   *   - trainingId: Training ID to use model from
   *   - inputPath: Path to input TIFF file
   *   - stage: 'stage1' or 'stage2' (which model to use)
   *
   * Body (Import workflow):
   *   - modelPaths: { stage1: string, stage2?: string }
   *   - configPath: Path to shared config file (.json)
   *   - inputPath: Path to input TIFF file
   *   - method: 'n2v' or 'autostructn2v'
   *   - isImported: true
   */
  router.post('/dl/run-inference', requireAuth, async (req, res) => {
    const { trainingId, inputPath, inputFileId, stage, modelPaths, configPath, method, isImported, mode: requestMode } = req.body;
    const sessionId = req.session.id;

    try {
      const { denoisingService, io } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Resolve input path
      let absoluteInputPath;
      if (inputPath) {
        absoluteInputPath = path.isAbsolute(inputPath)
          ? inputPath
          : path.join(workspacePath, inputPath);
      } else if (inputFileId) {
        const metadata = workspaceManager.loadMetadata(sessionId);
        const inputFile = metadata?.files?.find(f => f.id === inputFileId);
        if (!inputFile) {
          return res.status(404).json({
            success: false,
            error: 'Input file not found'
          });
        }
        absoluteInputPath = path.join(workspacePath, inputFile.path);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either inputPath or inputFileId is required'
        });
      }

      // Generate inference ID
      const inferenceId = `dl_infer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create output directory
      const outputDir = path.join(workspacePath, 'results', 'denoising', inferenceId);
      fs.mkdirSync(outputDir, { recursive: true });

      let inferenceParams;

      if (isImported && modelPaths) {
        // Import workflow: use directly provided model paths with shared config
        // Resolve model paths to absolute paths
        const stage1ModelPath = modelPaths.stage1
          ? (path.isAbsolute(modelPaths.stage1) ? modelPaths.stage1 : path.join(workspacePath, modelPaths.stage1))
          : null;
        const stage2ModelPath = modelPaths.stage2
          ? (path.isAbsolute(modelPaths.stage2) ? modelPaths.stage2 : path.join(workspacePath, modelPaths.stage2))
          : null;

        // Resolve config path
        const absoluteConfigPath = configPath
          ? (path.isAbsolute(configPath) ? configPath : path.join(workspacePath, configPath))
          : null;

        // Load config to get model parameters
        let modelConfig = {
          features: 64,
          num_layers: 2,
          patch_size: 64,
          use_resize_conv: true,
          upsampling_mode: 'bilinear'
        };

        let fullConfig = null;
        // Mode from request, config file, or default to '2d'
        let mode = requestMode || '2d';

        if (absoluteConfigPath && fs.existsSync(absoluteConfigPath)) {
          try {
            fullConfig = JSON.parse(fs.readFileSync(absoluteConfigPath, 'utf8'));
            const stageConfig = fullConfig.stage1 || fullConfig;
            modelConfig = {
              features: stageConfig.features || 64,
              num_layers: stageConfig.num_layers || 2,
              patch_size: stageConfig.patch_size || 64,
              use_resize_conv: stageConfig.use_resize_conv !== false,
              upsampling_mode: stageConfig.upsampling_mode || 'bilinear'
            };
            // Get mode from config if not provided in request
            if (!requestMode && fullConfig.mode) {
              mode = fullConfig.mode;
            }
          } catch (e) {
            console.warn('Could not parse config file, using defaults');
          }
        }

        // For autoStructN2V with imported models, run sequential pipeline
        if (method === 'autostructn2v' && stage2ModelPath) {
          inferenceParams = {
            inferenceId,
            modelPaths: {
              stage1: stage1ModelPath,
              stage2: stage2ModelPath
            },
            configPath: absoluteConfigPath,  // Shared config
            fullConfig,  // Full parsed config
            inputPath: absoluteInputPath,
            outputDir,
            modelConfig,
            method: 'autostructn2v',
            mode,  // '2d' or '2.5d'
            sequential: true,
            // For file tracking
            sessionId,
            workspacePath,
            inputFileId
          };

          // Use sequential inference
          denoisingService.runSequentialInference(inferenceParams, io);
        } else {
          // Single stage inference
          inferenceParams = {
            inferenceId,
            modelPath: stage1ModelPath,
            inputPath: absoluteInputPath,
            outputDir,
            modelConfig,
            stage: 'stage1',
            method,
            mode,  // '2d' or '2.5d'
            // For file tracking
            sessionId,
            workspacePath,
            inputFileId
          };

          denoisingService.runInference(inferenceParams, io);
        }

        if (logger) {
          logger.info('[Denoising] Started DL inference (imported):', {
            sessionId,
            inferenceId,
            method,
            sequential: method === 'autostructn2v' && !!stage2ModelPath
          });
        }

      } else if (trainingId) {
        // Training workflow: get model from training session
        const trainSession = denoisingService.getSession(trainingId);
        if (!trainSession) {
          return res.status(404).json({
            success: false,
            error: 'Training session not found'
          });
        }

        // Determine which model to use
        const useStage = stage || (trainSession.method === 'autostructn2v' && trainSession.stage2?.modelPath ? 'stage2' : 'stage1');
        // Check both possible locations for stage1 model path (nested for N2V completion, root level for autoStructN2V paused state)
        const rawModelPath = useStage === 'stage2'
          ? trainSession.stage2?.modelPath
          : (trainSession.stage1?.modelPath || trainSession.stage1ModelPath);

        // Resolve model path - paths from training session may already include workspace prefix
        // or be relative to workspace, so check before joining
        let modelPath = null;
        if (rawModelPath) {
          if (path.isAbsolute(rawModelPath)) {
            // Already absolute path
            modelPath = rawModelPath;
          } else if (rawModelPath.startsWith(workspacePath) || rawModelPath.startsWith('workspaces/')) {
            // Already includes workspace path prefix - use as-is
            modelPath = rawModelPath;
          } else {
            // Relative to workspace - join with workspace path
            modelPath = path.join(workspacePath, rawModelPath);
          }
        }

        if (!modelPath || !fs.existsSync(modelPath)) {
          return res.status(400).json({
            success: false,
            error: `${useStage} model not found. Training may not be complete.`
          });
        }

        // Get model config from training session
        const stageConfig = trainSession.config?.[useStage] || {};
        const modelConfig = {
          features: stageConfig.features || 64,
          num_layers: stageConfig.num_layers || 2,
          patch_size: stageConfig.patch_size || 64,
          use_resize_conv: stageConfig.use_resize_conv !== false,
          upsampling_mode: stageConfig.upsampling_mode || 'bilinear'
        };

        // Get mode from training session or request
        const mode = requestMode || trainSession.mode || trainSession.config?.mode || '2d';

        // Start inference
        denoisingService.runInference({
          inferenceId,
          modelPath,
          inputPath: absoluteInputPath,
          outputDir,
          modelConfig,
          stage: useStage,
          method: trainSession.method || 'n2v',
          mode,  // '2d' or '2.5d'
          // For file tracking
          sessionId,
          workspacePath,
          inputFileId
        }, io);

        if (logger) {
          logger.info('[Denoising] Started DL inference:', {
            sessionId,
            inferenceId,
            trainingId,
            stage: useStage,
            mode
          });
        }

      } else {
        return res.status(400).json({
          success: false,
          error: 'Either trainingId or modelPaths (with isImported: true) is required'
        });
      }

      res.json({
        success: true,
        inferenceId,
        trainingId: trainingId || null,
        message: 'Inference started. Join Socket.IO room for progress updates.'
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error starting inference:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // MASK REGENERATION
  // ===========================================================================

  /**
   * Regenerate structural noise mask with new parameters
   * POST /api/denoising/dl/regenerate-mask
   *
   * Body:
   *   - trainingId: Training ID of completed Stage 1
   *   - parameters: New mask extraction parameters
   *     - adaptive_thresholding: boolean
   *     - base_percentile: number (30-70)
   *     - percentile_decay: number (1.0-1.3)
   *     - max_masked_pixels: number (10-40)
   *
   * Returns new mask data for visualization.
   */
  router.post('/dl/regenerate-mask', requireAuth, async (req, res) => {
    const { trainingId, parameters } = req.body;

    if (!trainingId) {
      return res.status(400).json({
        success: false,
        error: 'Training ID is required'
      });
    }

    try {
      const { denoisingService, io } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      // Get training session
      const session = denoisingService.getSession(trainingId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Training session not found'
        });
      }

      // Check if Stage 1 is complete or paused at mask
      if (session.status !== 'stage1_complete' && session.status !== 'mask_complete' && session.status !== 'paused_at_mask') {
        return res.status(400).json({
          success: false,
          error: 'Stage 1 must be complete before regenerating mask'
        });
      }

      // Get Stage 1 experiment directory
      const stage1Dir = session.experimentDir;
      if (!stage1Dir || !fs.existsSync(stage1Dir)) {
        return res.status(400).json({
          success: false,
          error: 'Stage 1 output directory not found'
        });
      }

      // Get mode from session
      const mode = session.mode || session.config?.mode || '2d';

      // Regenerate mask with new parameters
      const result = await denoisingService.regenerateMask({
        trainingId,
        stage1Dir,
        parameters: parameters || {},
        mode  // '2d' or '2.5d'
      }, io);

      res.json({
        success: true,
        mask: result
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error regenerating mask:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Continue training after mask approval
   * POST /api/denoising/dl/continue-training
   *
   * Body:
   *   - trainingId: Training ID paused at mask approval
   *
   * Continues with Stage 2 training using saved Stage 1 output and approved mask.
   */
  router.post('/dl/continue-training', requireAuth, async (req, res) => {
    const { trainingId } = req.body;

    if (!trainingId) {
      return res.status(400).json({
        success: false,
        error: 'Training ID is required'
      });
    }

    try {
      const { denoisingService, io } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      // Get training session
      const session = denoisingService.getSession(trainingId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Training session not found'
        });
      }

      // Verify session is in paused_at_mask status
      if (session.status !== 'paused_at_mask') {
        return res.status(400).json({
          success: false,
          error: `Cannot continue training: session status is '${session.status}', expected 'paused_at_mask'`
        });
      }

      // Verify required paths exist
      if (!session.stage1ModelPath || !fs.existsSync(session.stage1ModelPath)) {
        return res.status(400).json({
          success: false,
          error: 'Stage 1 model not found. Cannot continue.'
        });
      }

      if (!session.maskPath || !fs.existsSync(session.maskPath)) {
        return res.status(400).json({
          success: false,
          error: 'Mask file not found. Cannot continue.'
        });
      }

      // Get mode from session
      const mode = session.mode || session.config?.mode || '2d';

      if (logger) {
        logger.info('[Denoising] Continuing training after mask approval:', {
          trainingId,
          stage1ModelPath: session.stage1ModelPath,
          maskPath: session.maskPath,
          mode
        });
      }

      // Continue training with Stage 2
      denoisingService.continueTraining({
        trainingId,
        session,
        mode  // Pass mode explicitly for clarity
      }, io);

      if (activityLogger) {
        activityLogger.logActivity(req.session.user.username, 'dl_denoising_continue', {
          trainingId,
          stage: 'stage2',
          mode
        });
      }

      res.json({
        success: true,
        trainingId,
        message: 'Stage 2 training started. Continue monitoring Socket.IO room for progress.'
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error continuing training:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Skip Stage 2 training and use N2V (Stage 1) results only
   * POST /api/denoising/dl/skip-stage2
   *
   * Body:
   *   - trainingId: Training ID paused at mask approval
   *
   * Marks training as complete with Stage 1 results only, tracks output files.
   */
  router.post('/dl/skip-stage2', requireAuth, async (req, res) => {
    const { trainingId } = req.body;

    if (!trainingId) {
      return res.status(400).json({
        success: false,
        error: 'Training ID is required'
      });
    }

    try {
      const { denoisingService, io } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      // Get training session
      const session = denoisingService.getSession(trainingId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Training session not found'
        });
      }

      // Verify session is in paused_at_mask status
      if (session.status !== 'paused_at_mask') {
        return res.status(400).json({
          success: false,
          error: `Cannot skip Stage 2: session status is '${session.status}', expected 'paused_at_mask'`
        });
      }

      // Verify Stage 1 model exists
      if (!session.stage1ModelPath || !fs.existsSync(session.stage1ModelPath)) {
        return res.status(400).json({
          success: false,
          error: 'Stage 1 model not found. Cannot complete training.'
        });
      }

      if (logger) {
        logger.info('[Denoising] Skipping Stage 2 for training:', {
          trainingId,
          stage1ModelPath: session.stage1ModelPath
        });
      }

      // Skip Stage 2 and finalize with Stage 1 results
      await denoisingService.skipStage2Training({
        trainingId,
        session
      }, io);

      if (activityLogger) {
        activityLogger.logActivity(req.session.user.username, 'dl_denoising_skip_stage2', {
          trainingId,
          stage: 'stage2_skipped'
        });
      }

      res.json({
        success: true,
        trainingId,
        message: 'Stage 2 skipped. Training completed with N2V (Stage 1) results only.'
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error skipping Stage 2:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // DL DENOISING RESULT VIEWING (for ImageViewer integration)
  // ===========================================================================

  /**
   * Get TIFF info for DL denoising result
   * GET /api/denoising/dl/tiff-info
   *
   * Query params:
   *   - path: Absolute or relative path to the TIFF file
   */
  router.get('/dl/tiff-info', requireAuth, async (req, res) => {
    const { path: filePath } = req.query;
    const sessionId = req.session.id;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Resolve path - handle different path formats:
      // 1. Absolute path -> use directly
      // 2. Path starting with "workspaces/" -> resolve from project root
      // 3. Relative path -> resolve from workspace directory
      let absolutePath = filePath;
      if (path.isAbsolute(filePath)) {
        absolutePath = filePath;
      } else if (filePath.startsWith('workspaces/') || filePath.startsWith('workspaces\\')) {
        // Path is relative to project root
        absolutePath = path.join(process.cwd(), filePath);
      } else {
        // Path is relative to workspace
        absolutePath = path.join(workspacePath, filePath);
      }

      // Verify file exists
      if (!fs.existsSync(absolutePath)) {
        if (logger) {
          logger.error('[Denoising] File not found:', absolutePath);
        }
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Security: ensure path is within the workspaces directory
      // (relaxed check since these paths come from our own training results)
      const normalizedPath = path.normalize(absolutePath);
      const workspacesDir = path.normalize(path.join(process.cwd(), 'workspaces'));
      if (!normalizedPath.startsWith(workspacesDir)) {
        if (logger) {
          logger.error('[Denoising] Access denied - path outside workspaces:', normalizedPath);
        }
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Run Python script to get TIFF info (using extract_slice.py with --info flag)
      // Use --no-classes to skip expensive class detection (not needed for denoised images)
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/extract_slice.py',
        absolutePath,
        '--info',
        '--no-classes'
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0 && stdout.includes('INFO:')) {
          try {
            const jsonStr = stdout.replace('INFO:', '').trim();
            const result = JSON.parse(jsonStr);
            res.json({
              success: true,
              sliceCount: result.sliceCount,
              width: result.width,
              height: result.height,
              dtype: result.dtype
            });
          } catch (parseError) {
            if (logger) {
              logger.error('[Denoising] Failed to parse TIFF info:', parseError);
            }
            res.status(500).json({
              success: false,
              error: 'Failed to parse TIFF info'
            });
          }
        } else {
          const errorMsg = stdout.includes('ERROR:')
            ? stdout.replace('ERROR:', '').trim()
            : stderr || 'Failed to get TIFF info';
          if (logger) {
            logger.error('[Denoising] TIFF info failed:', errorMsg);
          }
          res.status(500).json({
            success: false,
            error: errorMsg
          });
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error getting TIFF info:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get slice image from DL denoising result
   * GET /api/denoising/dl/slice/:sliceIndex
   *
   * Query params:
   *   - path: Absolute or relative path to the TIFF file
   *   - size: 'thumbnail', 'gallery', or 'full' (default: 'gallery')
   */
  router.get('/dl/slice/:sliceIndex', requireAuth, async (req, res) => {
    const { sliceIndex } = req.params;
    const { path: filePath, size = 'gallery' } = req.query;
    const sessionId = req.session.id;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Resolve path - handle different path formats:
      // 1. Absolute path -> use directly
      // 2. Path starting with "workspaces/" -> resolve from project root
      // 3. Relative path -> resolve from workspace directory
      let absolutePath = filePath;
      if (path.isAbsolute(filePath)) {
        absolutePath = filePath;
      } else if (filePath.startsWith('workspaces/') || filePath.startsWith('workspaces\\')) {
        // Path is relative to project root
        absolutePath = path.join(process.cwd(), filePath);
      } else {
        // Path is relative to workspace
        absolutePath = path.join(workspacePath, filePath);
      }

      // Verify file exists
      if (!fs.existsSync(absolutePath)) {
        if (logger) {
          logger.error('[Denoising] Slice file not found:', absolutePath);
        }
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Security: ensure path is within the workspaces directory
      // (relaxed check since these paths come from our own training results)
      const normalizedPath = path.normalize(absolutePath);
      const workspacesDir = path.normalize(path.join(process.cwd(), 'workspaces'));
      if (!normalizedPath.startsWith(workspacesDir)) {
        if (logger) {
          logger.error('[Denoising] Access denied - path outside workspaces:', normalizedPath);
        }
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Map size parameter to extract_slice.py format
      let sizeParam = size;
      if (size === 'thumbnail') sizeParam = 'icon';
      else if (size === 'full') sizeParam = '2048';

      // Create cache directory for slices
      const slicesDir = path.join(workspacePath, '.slices');
      if (!fs.existsSync(slicesDir)) {
        fs.mkdirSync(slicesDir, { recursive: true });
      }

      // Generate cache filename based on path hash, slice, and size
      const pathHash = require('crypto').createHash('md5').update(normalizedPath).digest('hex').substring(0, 8);
      const cacheFilename = `dl_${pathHash}_${sliceIndex}_${sizeParam}.jpg`;
      const cachePath = path.join(slicesDir, cacheFilename);

      // Check cache first
      if (fs.existsSync(cachePath)) {
        return res.sendFile(path.resolve(cachePath));
      }

      // Run Python script to extract slice
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/extract_slice.py',
        absolutePath,
        sliceIndex.toString(),
        cachePath,
        '--size',
        sizeParam
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0 && stdout.includes('SUCCESS:')) {
          res.sendFile(path.resolve(cachePath));
        } else {
          const errorMsg = stdout.includes('ERROR:')
            ? stdout.replace('ERROR:', '').trim()
            : stderr || 'Failed to extract slice';
          if (logger) {
            logger.error('[Denoising] Slice extraction failed:', errorMsg);
          }
          res.status(500).json({
            success: false,
            error: errorMsg
          });
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error extracting slice:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // MODEL IMPORT & RECENT RESULTS (Phase 7)
  // ===========================================================================

  /**
   * Get recent training results for model import
   * GET /api/denoising/dl/recent-results
   *
   * Returns completed training sessions with model paths for import.
   */
  router.get('/dl/recent-results', requireAuth, async (req, res) => {
    const sessionId = req.session.id;

    try {
      const { denoisingService } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      // Get all completed trainings for this session
      const results = denoisingService.getRecentTrainingResults(sessionId);

      res.json({
        success: true,
        results
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error getting recent results:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Validate and parse config file for import
   * POST /api/denoising/dl/validate-config
   *
   * Body:
   *   - configPath: Path to .json config file
   *
   * Returns validation result with parsed config data.
   */
  router.post('/dl/validate-config', requireAuth, async (req, res) => {
    const { configPath } = req.body;
    const sessionId = req.session.id;

    if (!configPath) {
      return res.status(400).json({
        success: false,
        error: 'configPath is required'
      });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const { denoisingService } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      // Resolve path
      const absoluteConfigPath = path.isAbsolute(configPath)
        ? configPath
        : path.join(workspacePath, configPath);

      // Validate and parse the config file
      const result = await denoisingService.validateConfig(absoluteConfigPath);

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error validating config:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Validate model files for import
   * POST /api/denoising/dl/validate-model
   *
   * Body:
   *   - modelPath: Path to .pth model file
   *   - configPath: Path to .json config file
   *   - stage: 'stage1' or 'stage2' (optional)
   *
   * Returns validation result with model/config info.
   */
  router.post('/dl/validate-model', requireAuth, async (req, res) => {
    const { modelPath, configPath, stage } = req.body;
    const sessionId = req.session.id;

    if (!modelPath || !configPath) {
      return res.status(400).json({
        success: false,
        error: 'Both modelPath and configPath are required'
      });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const { denoisingService } = dependencies;

      if (!denoisingService) {
        return res.status(500).json({
          success: false,
          error: 'DenoisingService not available'
        });
      }

      // Resolve paths
      const absoluteModelPath = path.isAbsolute(modelPath)
        ? modelPath
        : path.join(workspacePath, modelPath);
      const absoluteConfigPath = path.isAbsolute(configPath)
        ? configPath
        : path.join(workspacePath, configPath);

      // Validate the model files
      const result = await denoisingService.validateImportedModel({
        modelPath: absoluteModelPath,
        configPath: absoluteConfigPath,
        stage: stage || 'stage1'
      });

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error validating model:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // TEST DATA FOR DENOISING
  // ===========================================================================

  /**
   * Load test data for denoising
   * POST /api/denoising/test-data
   *
   * Copies denoising test data to user's workspace.
   */
  router.post('/test-data', requireAuth, async (req, res) => {
    const sessionId = req.session.id;

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const uploadsDir = path.join(workspacePath, 'uploads', 'raw');

      // Ensure uploads directory exists
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Test data file for denoising
      const testFileName = 'trypB_testData_denoising.tif';
      const sourcePath = path.join('test_data', testFileName);

      if (!fs.existsSync(sourcePath)) {
        return res.status(400).json({
          success: false,
          error: 'Test denoising data not found',
          details: `Expected file: test_data/${testFileName}`
        });
      }

      // Copy to workspace
      const destPath = path.join(uploadsDir, testFileName);
      fs.copyFileSync(sourcePath, destPath);

      // Add to workspace metadata
      const fileStats = fs.statSync(destPath);
      const fileEntry = workspaceManager.addFileToMetadata(sessionId, {
        name: testFileName,
        path: path.relative(workspacePath, destPath),
        category: 'raw',
        tags: ['test-data'],
        size: fileStats.size,
        folderId: null
      });

      if (logger) {
        logger.info('[Denoising] Test data loaded:', {
          sessionId,
          file: testFileName
        });
      }

      if (activityLogger) {
        activityLogger.logActivity(req.session.user.username, 'load_test_data', {
          module: 'denoising',
          file: testFileName
        });
      }

      res.json({
        success: true,
        message: 'Test data loaded successfully',
        file: fileEntry
      });

    } catch (error) {
      if (logger) {
        logger.error('[Denoising] Error loading test data:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createDenoisingRoutes;
