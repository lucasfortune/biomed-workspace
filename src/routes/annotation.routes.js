/**
 * Annotation Routes
 *
 * Handles annotation-related endpoints:
 * - Get full-resolution slices (no scaling)
 * - Save annotation progress
 * - Create final annotations
 * - Load existing annotations
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth.middleware');
const { PYTHON_PATH, DIRECTORIES, PYTHON_SCRIPTS } = require('../config/constants');

/**
 * Create annotation routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.sessionTracker - SessionTracker instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @param {object} dependencies.io - Socket.IO instance
 * @returns {Router} Express router
 */
function createAnnotationRoutes(dependencies) {
  const router = express.Router();
  const {
    workspaceManager,
    sessionTracker,
    activityLogger,
    logger,
    io
  } = dependencies;

  // ===========================================================================
  // HELPER: Generate Direction Volume
  // ===========================================================================

  /**
   * Generate a direction vector volume from filament centerpoints and a class mask.
   * Non-fatal: returns null on failure so the annotation is still saved.
   *
   * @param {string} filamentsSidecarPath - Absolute path to _filaments.json
   * @param {string} classMaskPath - Absolute path to the annotation TIFF (class mask)
   * @param {string} outputDir - Directory for the output file
   * @param {string} tiffFilename - Base TIFF filename (used to derive output name)
   * @returns {Promise<{path: string, filename: string, stats: object} | null>}
   */
  function generateDirectionVolume(filamentsSidecarPath, classMaskPath, outputDir, tiffFilename) {
    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const outputFilename = tiffFilename.replace('.tif', '_directions.tif');
      const outputPath = path.join(outputDir, outputFilename);

      const pythonProcess = spawn(PYTHON_PATH, [
        PYTHON_SCRIPTS.computeDirectionVectors,
        '--filaments_json', filamentsSidecarPath,
        '--class_mask', classMaskPath,
        '--output', outputPath
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
        if (code !== 0 || !stdout.includes('SUCCESS:')) {
          const errorMsg = stdout.includes('ERROR:')
            ? stdout.split('ERROR:')[1].split('\n')[0].trim()
            : stderr || 'Unknown error';
          if (logger) logger.warn(`[Annotation] Direction volume generation failed (non-fatal): ${errorMsg}`);
          resolve(null);
          return;
        }

        // Parse STATS line
        let stats = null;
        const statsMatch = stdout.match(/STATS:(.+)/);
        if (statsMatch) {
          try {
            stats = JSON.parse(statsMatch[1]);
          } catch (e) {
            if (logger) logger.warn('[Annotation] Failed to parse direction volume stats');
          }
        }

        if (logger) logger.info(`[Annotation] Direction volume generated: ${outputFilename}`);
        resolve({
          path: outputPath,
          filename: outputFilename,
          stats
        });
      });

      pythonProcess.on('error', (err) => {
        if (logger) logger.warn(`[Annotation] Direction volume process error (non-fatal): ${err.message}`);
        resolve(null);
      });
    });
  }

  // ===========================================================================
  // GET RAW SLICE (Full Resolution)
  // ===========================================================================

  /**
   * Get full-resolution slice as PNG (no scaling)
   * GET /api/annotation/raw-slice/:fileId/:sliceIndex
   *
   * Note: Full implementation in Phase 3
   */
  router.get('/raw-slice/:fileId/:sliceIndex', requireAuth, async (req, res) => {
    const { spawn } = require('child_process');

    try {
      const fileId = decodeURIComponent(req.params.fileId);
      const sliceIndex = parseInt(req.params.sliceIndex, 10);
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Resolve file path from fileId
      let filePath;
      if (path.isAbsolute(fileId)) {
        filePath = fileId;
      } else {
        const metadata = workspaceManager.loadMetadata(sessionId);
        const file = metadata?.files?.find(f => f.id === fileId);

        if (file) {
          filePath = path.join(workspacePath, file.path);
        } else {
          filePath = path.join(workspacePath, fileId);
        }
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found',
          path: fileId
        });
      }

      // Create cache directory for raw slices
      const cacheDir = path.join(workspacePath, '.slices');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      // Generate cache filename with _raw suffix to distinguish from scaled slices
      const fileHash = Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_').substring(0, 32);
      const cacheFilename = `${fileHash}_${sliceIndex}_raw.png`;
      const cachePath = path.join(cacheDir, cacheFilename);

      // Check cache
      if (fs.existsSync(cachePath)) {
        return res.sendFile(path.resolve(cachePath));
      }

      // Extract slice using Python (full resolution, no scaling)
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/extract_raw_slice.py',
        filePath,
        sliceIndex.toString(),
        cachePath
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0 && output.includes('SUCCESS:') && fs.existsSync(cachePath)) {
          res.sendFile(path.resolve(cachePath));
        } else {
          const errorMsg = output.includes('ERROR:')
            ? output.replace('ERROR:', '').trim()
            : errorOutput || 'Unknown error during slice extraction';
          if (logger) logger.error('Raw slice extraction error:', errorMsg);
          res.status(500).json({
            success: false,
            error: errorMsg
          });
        }
      });

    } catch (error) {
      if (logger) logger.error('Error getting raw slice:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // SAVE PROGRESS
  // ===========================================================================

  /**
   * Save annotation progress (unfinished annotation)
   * POST /api/annotation/save-progress
   *
   * Request body:
   * {
   *   sourceFileId: string,      // ID of the source image
   *   sourceFileName: string,    // Name of the source image
   *   width: number,
   *   height: number,
   *   slices: number,
   *   sliceData: { "0": "base64...", "5": "base64...", ... },
   *   classes: [{ id, name, color, visible }, ...],
   *   existingAnnotationId: string  // Optional: ID of existing annotation to update
   * }
   */
  router.post('/save-progress', requireAuth, async (req, res) => {
    const { spawn } = require('child_process');
    const os = require('os');

    try {
      const {
        sourceFileId,
        sourceFileName,
        width,
        height,
        slices,
        sliceData,
        classes,
        existingAnnotationId,
        filaments
      } = req.body;

      // Validate required fields
      if (!sourceFileId || !width || !height || !slices) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: sourceFileId, width, height, slices'
        });
      }

      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Create unfinished annotations directory within workspace
      const annotationsDir = path.join(workspacePath, DIRECTORIES.unfinishedAnnotations);
      if (!fs.existsSync(annotationsDir)) {
        fs.mkdirSync(annotationsDir, { recursive: true });
      }

      // Check if we're updating an existing annotation
      let existingFile = null;
      let existingSidecar = null;
      let tiffFilename, sidecarFilename, tiffPath, sidecarPath, fileId;

      if (existingAnnotationId) {
        // Find the existing annotation in metadata
        const metadata = workspaceManager.loadMetadata(sessionId);
        existingFile = metadata?.files?.find(f => f.id === existingAnnotationId);
        if (existingFile) {
          existingSidecar = metadata?.files?.find(
            f => f.parentId === existingAnnotationId && (!f.tags || !f.tags.includes('filaments'))
          );
          // Always save WIP data to unfinished_annotations/
          tiffFilename = existingFile.name;
          fileId = existingAnnotationId;
          tiffPath = path.join(annotationsDir, tiffFilename);
          sidecarFilename = existingSidecar
            ? existingSidecar.name
            : tiffFilename.replace('.tif', '_classes.json');
          sidecarPath = path.join(annotationsDir, sidecarFilename);
          if (logger) logger.info(`[Annotation] Updating existing annotation: ${existingAnnotationId}`);
        }
      }

      // If no existing file found, create new filenames
      if (!existingFile) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = sourceFileName
          ? path.basename(sourceFileName, path.extname(sourceFileName))
          : 'annotation';
        tiffFilename = `${timestamp}_${baseName}_annotation.tif`;
        sidecarFilename = `${timestamp}_${baseName}_annotation_classes.json`;
        tiffPath = path.join(annotationsDir, tiffFilename);
        sidecarPath = path.join(annotationsDir, sidecarFilename);
        fileId = `unfinished_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Create config file for Python script
      const configData = {
        width,
        height,
        slices,
        sliceData: sliceData || {}
      };

      const tempConfigPath = path.join(os.tmpdir(), `annotation_config_${Date.now()}.json`);
      fs.writeFileSync(tempConfigPath, JSON.stringify(configData));

      // Call Python script to create TIFF
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/create_annotation_tiff.py',
        '--config', tempConfigPath,
        '--output', tiffPath
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', async (code) => {
        // Clean up temp config file
        try {
          fs.unlinkSync(tempConfigPath);
        } catch (e) {
          // Ignore cleanup errors
        }

        if (code !== 0 || !output.includes('SUCCESS:')) {
          const errorMsg = output.includes('ERROR:')
            ? output.split('ERROR:')[1].split('\n')[0].trim()
            : errorOutput || 'Failed to create annotation TIFF';
          if (logger) logger.error('Annotation TIFF creation error:', errorMsg);
          return res.status(500).json({
            success: false,
            error: errorMsg
          });
        }

        try {
          // Create sidecar JSON
          const sidecarData = {
            version: '1.0.0',
            sourceFileId,
            sourceFileName: sourceFileName || 'unknown',
            classes: classes || [],
            createdAt: new Date().toISOString(),
            lastModifiedAt: new Date().toISOString(),
            status: 'in_progress'
          };

          fs.writeFileSync(sidecarPath, JSON.stringify(sidecarData, null, 2));

          // Write filaments sidecar if present
          let filamentsSidecarPath = null;
          let filamentsSidecarFilename = null;

          if (filaments && filaments.filaments && filaments.filaments.length > 0) {
            filamentsSidecarFilename = existingFile
              ? tiffFilename.replace('.tif', '_filaments.json')
              : sidecarFilename.replace('_classes.json', '_filaments.json');
            filamentsSidecarPath = path.join(
              path.dirname(sidecarPath),
              filamentsSidecarFilename
            );
            fs.writeFileSync(filamentsSidecarPath, JSON.stringify(filaments, null, 2));
          }

          // Update or add to workspace metadata
          const metadata = workspaceManager.loadMetadata(sessionId);
          if (!metadata.files) {
            metadata.files = [];
          }

          if (existingFile) {
            // Check if this annotation was finished (being demoted to WIP for editing)
            const wasFinished = !existingFile.path.includes(DIRECTORIES.unfinishedAnnotations);

            // Update TIFF metadata entry
            const tiffIndex = metadata.files.findIndex(f => f.id === fileId);
            if (tiffIndex !== -1) {
              if (wasFinished) {
                // Delete old TIFF from its original location
                const oldPath = path.join(workspacePath, metadata.files[tiffIndex].path);
                if (oldPath !== tiffPath && fs.existsSync(oldPath)) {
                  try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
                }
                metadata.files[tiffIndex].path = path.join(DIRECTORIES.unfinishedAnnotations, tiffFilename);
                metadata.files[tiffIndex].category = 'results';
                metadata.files[tiffIndex].tags = ['annotation', 'wip'];
              }
              metadata.files[tiffIndex].size = fs.statSync(tiffPath).size;
              metadata.files[tiffIndex].lastModifiedAt = new Date().toISOString();
            }

            // Update sidecar metadata entry
            const sidecarIndex = metadata.files.findIndex(
              f => f.parentId === fileId && (!f.tags || !f.tags.includes('filaments'))
            );
            if (sidecarIndex !== -1) {
              if (wasFinished) {
                const oldPath = path.join(workspacePath, metadata.files[sidecarIndex].path);
                if (oldPath !== sidecarPath && fs.existsSync(oldPath)) {
                  try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
                }
                metadata.files[sidecarIndex].path = path.join(DIRECTORIES.unfinishedAnnotations, sidecarFilename);
              }
              metadata.files[sidecarIndex].size = fs.statSync(sidecarPath).size;
              metadata.files[sidecarIndex].lastModifiedAt = new Date().toISOString();
            } else {
              // Add sidecar if it didn't exist
              metadata.files.push({
                id: `${fileId}_sidecar`,
                name: sidecarFilename,
                path: path.join(DIRECTORIES.unfinishedAnnotations, sidecarFilename),
                category: 'results',
                tags: ['annotation', 'info'],
                uploadedAt: new Date().toISOString(),
                size: fs.statSync(sidecarPath).size,
                parentId: fileId,
                lineage: {
                  processType: 'annotation',
                  inputs: [sourceFileId],
                  status: 'in_progress'
                }
              });
            }

            // When demoting from finished, clean up old direction volume (will be regenerated on finalize)
            if (wasFinished) {
              const dirVolIdx = metadata.files.findIndex(
                f => f.parentId === fileId && f.tags && f.tags.includes('direction_volume')
              );
              if (dirVolIdx !== -1) {
                const oldDirPath = path.join(workspacePath, metadata.files[dirVolIdx].path);
                if (fs.existsSync(oldDirPath)) {
                  try { fs.unlinkSync(oldDirPath); } catch (e) { /* ignore */ }
                }
                metadata.files.splice(dirVolIdx, 1);
              }
            }
          } else {
            // Add new TIFF file
            // New metadata system: results category with annotation/wip tags
            metadata.files.push({
              id: fileId,
              name: tiffFilename,
              path: path.join(DIRECTORIES.unfinishedAnnotations, tiffFilename),
              category: 'results',
              tags: ['annotation', 'wip'],
              uploadedAt: new Date().toISOString(),
              size: fs.statSync(tiffPath).size,
              lineage: {
                processType: 'annotation',
                inputs: [sourceFileId],
                status: 'in_progress'
              }
            });

            // Add sidecar file
            // New metadata system: results category with annotation/info tags
            metadata.files.push({
              id: `${fileId}_sidecar`,
              name: sidecarFilename,
              path: path.join(DIRECTORIES.unfinishedAnnotations, sidecarFilename),
              category: 'results',
              tags: ['annotation', 'info'],
              uploadedAt: new Date().toISOString(),
              size: fs.statSync(sidecarPath).size,
              parentId: fileId,
              lineage: {
                processType: 'annotation',
                inputs: [sourceFileId],
                status: 'in_progress'
              }
            });
          }

          // Register filaments sidecar in metadata if present
          if (filamentsSidecarPath && filamentsSidecarFilename) {
            const existingFilamentsEntry = metadata.files.find(
              f => f.id === `${fileId}_filaments`
            );
            if (existingFilamentsEntry) {
              // Delete old filaments file if it was in a different location
              const oldPath = path.join(workspacePath, existingFilamentsEntry.path);
              if (oldPath !== filamentsSidecarPath && fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
              }
              existingFilamentsEntry.path = path.join(DIRECTORIES.unfinishedAnnotations, filamentsSidecarFilename);
              existingFilamentsEntry.size = fs.statSync(filamentsSidecarPath).size;
              existingFilamentsEntry.lastModifiedAt = new Date().toISOString();
            } else {
              metadata.files.push({
                id: `${fileId}_filaments`,
                name: filamentsSidecarFilename,
                path: path.join(DIRECTORIES.unfinishedAnnotations, filamentsSidecarFilename),
                category: 'results',
                tags: ['annotation', 'filaments'],
                uploadedAt: new Date().toISOString(),
                size: fs.statSync(filamentsSidecarPath).size,
                parentId: fileId,
                lineage: {
                  processType: 'annotation',
                  inputs: [sourceFileId],
                  status: 'in_progress'
                }
              });
            }
          }

          workspaceManager.saveMetadata(sessionId, metadata);

          if (logger) logger.info(`[Annotation] Saved progress: ${tiffFilename}`);
          if (activityLogger) {
            activityLogger.logActivity(req.session.user?.username, 'annotation_save_progress', {
              fileId,
              sourceFileId
            });
          }

          res.json({
            success: true,
            fileId,
            tiffPath: path.join(DIRECTORIES.unfinishedAnnotations, tiffFilename),
            sidecarPath: path.join(DIRECTORIES.unfinishedAnnotations, sidecarFilename),
            message: 'Annotation progress saved successfully'
          });

        } catch (metadataError) {
          if (logger) logger.error('Error saving metadata:', metadataError);
          res.status(500).json({
            success: false,
            error: 'TIFF created but failed to save metadata: ' + metadataError.message
          });
        }
      });

    } catch (error) {
      if (logger) logger.error('Error saving annotation progress:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // CREATE ANNOTATION (Final)
  // ===========================================================================

  /**
   * Create final annotation
   * POST /api/annotation/create
   *
   * Request body: Same as save-progress
   * Saves to uploads/annotations/ directory with status 'complete'
   */
  router.post('/create', requireAuth, async (req, res) => {
    const { spawn } = require('child_process');
    const os = require('os');

    try {
      const {
        sourceFileId,
        sourceFileName,
        width,
        height,
        slices,
        sliceData,
        classes,
        filaments,
        existingAnnotationId
      } = req.body;

      // Validate required fields
      if (!sourceFileId || !width || !height || !slices) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: sourceFileId, width, height, slices'
        });
      }

      // Validate classes
      if (!classes || classes.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one class is required'
        });
      }

      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Create annotations directory within workspace (final annotations)
      const annotationsDir = path.join(workspacePath, 'annotations');
      if (!fs.existsSync(annotationsDir)) {
        fs.mkdirSync(annotationsDir, { recursive: true });
      }

      // Check if we're updating an existing annotation in-place
      let existingFile = null;
      let existingSidecar = null;
      let existingFilaments = null;
      let tiffFilename, sidecarFilename, tiffPath, sidecarPath, fileId;

      if (existingAnnotationId) {
        const metadata = workspaceManager.loadMetadata(sessionId);
        existingFile = metadata?.files?.find(f => f.id === existingAnnotationId);
        if (existingFile) {
          existingSidecar = metadata?.files?.find(
            f => f.parentId === existingAnnotationId && (!f.tags || !f.tags.includes('filaments'))
          );
          existingFilaments = metadata?.files?.find(
            f => f.parentId === existingAnnotationId && f.tags && f.tags.includes('filaments')
          );
          tiffFilename = existingFile.name;
          fileId = existingAnnotationId;

          // Always write final annotations to annotations/ directory
          tiffPath = path.join(annotationsDir, tiffFilename);
          sidecarFilename = existingSidecar
            ? existingSidecar.name
            : tiffFilename.replace('.tif', '_classes.json');
          sidecarPath = path.join(annotationsDir, sidecarFilename);

          if (logger) logger.info(`[Annotation] Finalizing annotation: ${existingAnnotationId}`);
        }
      }

      if (!existingFile) {
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = sourceFileName
          ? path.basename(sourceFileName, path.extname(sourceFileName))
          : 'annotation';
        tiffFilename = `${timestamp}_${baseName}_annotation.tif`;
        sidecarFilename = `${timestamp}_${baseName}_annotation_classes.json`;
        tiffPath = path.join(annotationsDir, tiffFilename);
        sidecarPath = path.join(annotationsDir, sidecarFilename);
      }

      // Create config file for Python script
      const configData = {
        width,
        height,
        slices,
        sliceData: sliceData || {}
      };

      const tempConfigPath = path.join(os.tmpdir(), `annotation_config_${Date.now()}.json`);
      fs.writeFileSync(tempConfigPath, JSON.stringify(configData));

      // Call Python script to create TIFF
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/create_annotation_tiff.py',
        '--config', tempConfigPath,
        '--output', tiffPath
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', async (code) => {
        // Clean up temp config file
        try {
          fs.unlinkSync(tempConfigPath);
        } catch (e) {
          // Ignore cleanup errors
        }

        if (code !== 0 || !output.includes('SUCCESS:')) {
          const errorMsg = output.includes('ERROR:')
            ? output.split('ERROR:')[1].split('\n')[0].trim()
            : errorOutput || 'Failed to create annotation TIFF';
          if (logger) logger.error('Annotation TIFF creation error:', errorMsg);
          return res.status(500).json({
            success: false,
            error: errorMsg
          });
        }

        try {
          // Create sidecar JSON with 'complete' status
          const sidecarData = {
            version: '1.0.0',
            sourceFileId,
            sourceFileName: sourceFileName || 'unknown',
            classes: classes || [],
            createdAt: new Date().toISOString(),
            lastModifiedAt: new Date().toISOString(),
            status: 'complete'  // Final annotation
          };

          fs.writeFileSync(sidecarPath, JSON.stringify(sidecarData, null, 2));

          // Write filaments sidecar if present
          let filamentsSidecarPath = null;
          let filamentsSidecarFilename = null;

          if (filaments && filaments.filaments && filaments.filaments.length > 0) {
            filamentsSidecarFilename = tiffFilename
              ? tiffFilename.replace('.tif', '_filaments.json')
              : sidecarFilename.replace('_classes.json', '_filaments.json');
            filamentsSidecarPath = path.join(annotationsDir, filamentsSidecarFilename);
            fs.writeFileSync(filamentsSidecarPath, JSON.stringify(filaments, null, 2));
          }

          // Generate direction volume if filaments with points exist
          let directionVolumeResult = null;
          if (filamentsSidecarPath) {
            try {
              const filData = JSON.parse(fs.readFileSync(filamentsSidecarPath, 'utf8'));
              const hasPoints = filData.filaments?.some(f => Object.keys(f.points || {}).length > 0);
              if (hasPoints) {
                directionVolumeResult = await generateDirectionVolume(
                  filamentsSidecarPath, tiffPath, path.dirname(tiffPath), tiffFilename
                );
              }
            } catch (dirErr) {
              if (logger) logger.warn(`[Annotation] Direction volume check failed (non-fatal): ${dirErr.message}`);
            }
          }

          // Update or add to workspace metadata
          const metadata = workspaceManager.loadMetadata(sessionId);
          if (!metadata.files) {
            metadata.files = [];
          }

          if (existingFile) {
            const newTiffRelPath = path.join('annotations', tiffFilename);
            const newSidecarRelPath = path.join('annotations', sidecarFilename);

            // Clean up old files from any previous location (WIP, uploads, etc.)
            const oldTiffPath = path.join(workspacePath, existingFile.path);
            if (oldTiffPath !== tiffPath && fs.existsSync(oldTiffPath)) {
              try { fs.unlinkSync(oldTiffPath); } catch (e) { /* ignore */ }
            }
            if (existingSidecar) {
              const oldSidecarPath = path.join(workspacePath, existingSidecar.path);
              if (oldSidecarPath !== sidecarPath && fs.existsSync(oldSidecarPath)) {
                try { fs.unlinkSync(oldSidecarPath); } catch (e) { /* ignore */ }
              }
            }
            if (existingFilaments) {
              const oldFilamentsPath = path.join(workspacePath, existingFilaments.path);
              const newFilamentsPath = filamentsSidecarPath || path.join(annotationsDir, existingFilaments.name);
              if (oldFilamentsPath !== newFilamentsPath && fs.existsSync(oldFilamentsPath)) {
                try { fs.unlinkSync(oldFilamentsPath); } catch (e) { /* ignore */ }
              }
            }
            // Clean up old direction volume from previous location
            const existingDirVolume = metadata.files.find(
              f => f.parentId === fileId && f.tags && f.tags.includes('direction_volume')
            );
            if (existingDirVolume) {
              const oldDirPath = path.join(workspacePath, existingDirVolume.path);
              const newDirName = tiffFilename.replace('.tif', '_directions.tif');
              const newDirPath = path.join(annotationsDir, newDirName);
              if (oldDirPath !== newDirPath && fs.existsSync(oldDirPath)) {
                try { fs.unlinkSync(oldDirPath); } catch (e) { /* ignore */ }
              }
            }

            // Update TIFF metadata — always point to annotations/
            const tiffIdx = metadata.files.findIndex(f => f.id === fileId);
            if (tiffIdx !== -1) {
              metadata.files[tiffIdx].path = newTiffRelPath;
              metadata.files[tiffIdx].size = fs.statSync(tiffPath).size;
              metadata.files[tiffIdx].lastModifiedAt = new Date().toISOString();
              metadata.files[tiffIdx].category = 'uploads';
              metadata.files[tiffIdx].tags = ['annotation'];
              // Ensure lineage exists and is complete
              metadata.files[tiffIdx].lineage = {
                processType: 'annotation',
                inputs: [sourceFileId],
                status: 'complete'
              };
            }
            // Update sidecar metadata — always point to annotations/
            const sidecarIdx = metadata.files.findIndex(
              f => f.parentId === fileId && (!f.tags || !f.tags.includes('filaments'))
            );
            if (sidecarIdx !== -1) {
              metadata.files[sidecarIdx].path = newSidecarRelPath;
              metadata.files[sidecarIdx].size = fs.statSync(sidecarPath).size;
              metadata.files[sidecarIdx].lastModifiedAt = new Date().toISOString();
              metadata.files[sidecarIdx].lineage = {
                processType: 'annotation',
                inputs: [sourceFileId],
                status: 'complete'
              };
            }
            // Handle filaments sidecar — always point to annotations/
            if (filamentsSidecarPath && filamentsSidecarFilename) {
              const newFilamentsRelPath = path.join('annotations', filamentsSidecarFilename);
              const filIdx = metadata.files.findIndex(f => f.id === `${fileId}_filaments`);
              if (filIdx !== -1) {
                metadata.files[filIdx].path = newFilamentsRelPath;
                metadata.files[filIdx].size = fs.statSync(filamentsSidecarPath).size;
                metadata.files[filIdx].lastModifiedAt = new Date().toISOString();
                metadata.files[filIdx].lineage = {
                  processType: 'annotation',
                  inputs: [sourceFileId],
                  status: 'complete'
                };
              } else {
                metadata.files.push({
                  id: `${fileId}_filaments`,
                  name: filamentsSidecarFilename,
                  path: newFilamentsRelPath,
                  category: 'results',
                  tags: ['annotation', 'filaments'],
                  uploadedAt: new Date().toISOString(),
                  size: fs.statSync(filamentsSidecarPath).size,
                  parentId: fileId,
                  lineage: {
                    processType: 'annotation',
                    inputs: [sourceFileId],
                    status: 'complete'
                  }
                });
              }
            }
          } else {
            // Generate file ID for new annotation
            if (!fileId) {
              fileId = `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }

            // Add TIFF file - completed annotations are user-created content
            // New metadata system: uploads category with annotation tag
            metadata.files.push({
              id: fileId,
              name: tiffFilename,
              path: path.join('annotations', tiffFilename),
              category: 'uploads',
              tags: ['annotation'],
              uploadedAt: new Date().toISOString(),
              size: fs.statSync(tiffPath).size,
              lineage: {
                processType: 'annotation',
                inputs: [sourceFileId],
                status: 'complete'
              }
            });

            // Add sidecar file
            // New metadata system: results category with annotation/info tags
            metadata.files.push({
              id: `${fileId}_sidecar`,
              name: sidecarFilename,
              path: path.join('annotations', sidecarFilename),
              category: 'results',
              tags: ['annotation', 'info'],
              uploadedAt: new Date().toISOString(),
              size: fs.statSync(sidecarPath).size,
              parentId: fileId,
              lineage: {
                processType: 'annotation',
                inputs: [sourceFileId],
                status: 'complete'
              }
            });

            // Add filaments sidecar if present
            if (filamentsSidecarPath && filamentsSidecarFilename) {
              metadata.files.push({
                id: `${fileId}_filaments`,
                name: filamentsSidecarFilename,
                path: path.join('annotations', filamentsSidecarFilename),
                category: 'results',
                tags: ['annotation', 'filaments'],
                uploadedAt: new Date().toISOString(),
                size: fs.statSync(filamentsSidecarPath).size,
                parentId: fileId,
                lineage: {
                  processType: 'annotation',
                  inputs: [sourceFileId],
                  status: 'complete'
                }
              });
            }
          }

          // Register direction volume in metadata if generated
          if (directionVolumeResult) {
            const dirRelPath = path.join('annotations', directionVolumeResult.filename);
            const dirEntryId = `${fileId}_directions`;
            const existingDirIdx = metadata.files.findIndex(f => f.id === dirEntryId);
            if (existingDirIdx !== -1) {
              metadata.files[existingDirIdx].size = fs.statSync(directionVolumeResult.path).size;
              metadata.files[existingDirIdx].lastModifiedAt = new Date().toISOString();
              metadata.files[existingDirIdx].path = dirRelPath;
              metadata.files[existingDirIdx].lineage = {
                processType: 'direction_volume',
                inputs: [fileId],
                status: 'complete'
              };
            } else {
              metadata.files.push({
                id: dirEntryId,
                name: directionVolumeResult.filename,
                path: dirRelPath,
                category: 'results',
                tags: ['annotation', 'direction_volume'],
                uploadedAt: new Date().toISOString(),
                size: fs.statSync(directionVolumeResult.path).size,
                parentId: fileId,
                lineage: {
                  processType: 'direction_volume',
                  inputs: [fileId],
                  status: 'complete'
                }
              });
            }
          }

          workspaceManager.saveMetadata(sessionId, metadata);

          const actionVerb = existingFile ? 'Updated' : 'Created';
          if (logger) logger.info(`[Annotation] ${actionVerb} final annotation: ${tiffFilename}`);
          if (activityLogger) {
            activityLogger.logActivity(req.session.user?.username, 'annotation_create', {
              fileId,
              sourceFileId,
              inPlace: !!existingFile
            });
          }

          res.json({
            success: true,
            fileId,
            tiffPath: path.join('annotations', tiffFilename),
            sidecarPath: path.join('annotations', sidecarFilename),
            message: existingFile ? 'Annotation updated successfully' : 'Annotation created successfully',
            directionVolume: directionVolumeResult ? {
              path: path.join('annotations', directionVolumeResult.filename),
              stats: directionVolumeResult.stats
            } : null
          });

        } catch (metadataError) {
          if (logger) logger.error('Error saving metadata:', metadataError);
          res.status(500).json({
            success: false,
            error: 'TIFF created but failed to save metadata: ' + metadataError.message
          });
        }
      });

    } catch (error) {
      if (logger) logger.error('Error creating annotation:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // LOAD ANNOTATION
  // ===========================================================================

  /**
   * Load existing or unfinished annotation
   * GET /api/annotation/load/:fileId
   *
   * Returns:
   * {
   *   success: boolean,
   *   sourceFileId: string,
   *   sourceFileName: string,
   *   classes: [...],
   *   width: number,
   *   height: number,
   *   slices: number,
   *   sliceData: { "0": "base64...", ... },
   *   status: 'in_progress' | 'complete'
   * }
   */
  router.get('/load/:fileId', requireAuth, async (req, res) => {
    const { spawn } = require('child_process');
    const os = require('os');

    try {
      const fileId = decodeURIComponent(req.params.fileId);
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Find file in metadata
      const metadata = workspaceManager.loadMetadata(sessionId);
      const file = metadata?.files?.find(f => f.id === fileId);

      if (!file) {
        return res.status(404).json({
          success: false,
          error: 'Annotation file not found'
        });
      }

      const tiffPath = path.join(workspacePath, file.path);

      if (!fs.existsSync(tiffPath)) {
        return res.status(404).json({
          success: false,
          error: 'Annotation TIFF file not found on disk'
        });
      }

      // Find sidecar JSON (classes)
      const sidecarFile = metadata.files.find(
        f => f.parentId === fileId && (!f.tags || !f.tags.includes('filaments'))
      );
      let sidecarData = null;

      if (sidecarFile) {
        const sidecarPath = path.join(workspacePath, sidecarFile.path);
        if (fs.existsSync(sidecarPath)) {
          try {
            sidecarData = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
          } catch (e) {
            if (logger) logger.warn('[Annotation] Failed to read sidecar:', e.message);
          }
        }
      }

      // Find filaments sidecar JSON
      let filamentsData = null;
      const filamentsFile = metadata.files.find(
        f => f.parentId === fileId && f.tags && f.tags.includes('filaments')
      );

      if (filamentsFile) {
        const filamentsPath = path.join(workspacePath, filamentsFile.path);
        if (fs.existsSync(filamentsPath)) {
          try {
            filamentsData = JSON.parse(fs.readFileSync(filamentsPath, 'utf8'));
          } catch (e) {
            if (logger) logger.warn('[Annotation] Failed to read filaments sidecar:', e.message);
          }
        }
      }

      // Extract slice data from TIFF using Python script
      const tempOutputPath = path.join(os.tmpdir(), `annotation_data_${Date.now()}.json`);

      const pythonProcess = spawn(PYTHON_PATH, [
        'python/read_annotation_tiff.py',
        tiffPath,
        tempOutputPath
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0 || !output.includes('SUCCESS:')) {
          const errorMsg = output.includes('ERROR:')
            ? output.split('ERROR:')[1].split('\n')[0].trim()
            : errorOutput || 'Failed to read annotation TIFF';
          if (logger) logger.error('Annotation TIFF read error:', errorMsg);

          // Clean up temp file
          try { fs.unlinkSync(tempOutputPath); } catch (e) { /* ignore */ }

          return res.status(500).json({
            success: false,
            error: errorMsg
          });
        }

        try {
          // Read the output JSON
          const tiffData = JSON.parse(fs.readFileSync(tempOutputPath, 'utf8'));

          // Clean up temp file
          try { fs.unlinkSync(tempOutputPath); } catch (e) { /* ignore */ }

          // Combine with sidecar data
          const result = {
            success: true,
            fileId,
            sourceFileId: sidecarData?.sourceFileId || file.lineage?.inputs?.[0] || null,
            sourceFileName: sidecarData?.sourceFileName || null,
            classes: sidecarData?.classes || [],
            width: tiffData.width,
            height: tiffData.height,
            slices: tiffData.slices,
            sliceData: tiffData.sliceData,
            annotatedSlices: tiffData.annotatedSlices,
            status: sidecarData?.status || file.lineage?.status || 'unknown',
            createdAt: sidecarData?.createdAt || file.uploadedAt,
            lastModifiedAt: sidecarData?.lastModifiedAt || file.uploadedAt,
            filaments: filamentsData || null
          };

          if (logger) logger.info(`[Annotation] Loaded annotation: ${file.name} (${tiffData.annotatedSlices} slices)`);

          res.json(result);

        } catch (parseError) {
          if (logger) logger.error('Error parsing annotation data:', parseError);

          // Clean up temp file
          try { fs.unlinkSync(tempOutputPath); } catch (e) { /* ignore */ }

          res.status(500).json({
            success: false,
            error: 'Failed to parse annotation data'
          });
        }
      });

    } catch (error) {
      if (logger) logger.error('Error loading annotation:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createAnnotationRoutes;
