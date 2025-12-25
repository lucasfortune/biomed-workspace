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
      const uploadsDir = path.join(workspacePath, 'uploads');

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
        category: 'raw_images',
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
