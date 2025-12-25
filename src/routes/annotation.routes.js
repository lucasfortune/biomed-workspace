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
const { PYTHON_PATH, DIRECTORIES } = require('../config/constants');

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
        existingAnnotationId
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
          existingSidecar = metadata?.files?.find(f => f.parentId === existingAnnotationId);
          // Reuse existing filenames and paths
          tiffFilename = existingFile.name;
          tiffPath = path.join(workspacePath, existingFile.path);
          fileId = existingAnnotationId;
          if (existingSidecar) {
            sidecarFilename = existingSidecar.name;
            sidecarPath = path.join(workspacePath, existingSidecar.path);
          } else {
            // Create sidecar filename based on TIFF name
            sidecarFilename = tiffFilename.replace('.tif', '_classes.json');
            sidecarPath = path.join(annotationsDir, sidecarFilename);
          }
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

          // Update or add to workspace metadata
          const metadata = workspaceManager.loadMetadata(sessionId);
          if (!metadata.files) {
            metadata.files = [];
          }

          if (existingFile) {
            // Update existing file entries
            const tiffIndex = metadata.files.findIndex(f => f.id === fileId);
            if (tiffIndex !== -1) {
              metadata.files[tiffIndex].size = fs.statSync(tiffPath).size;
              metadata.files[tiffIndex].lastModifiedAt = new Date().toISOString();
            }

            const sidecarIndex = metadata.files.findIndex(f => f.parentId === fileId);
            if (sidecarIndex !== -1) {
              metadata.files[sidecarIndex].size = fs.statSync(sidecarPath).size;
              metadata.files[sidecarIndex].lastModifiedAt = new Date().toISOString();
            } else {
              // Add sidecar if it didn't exist
              metadata.files.push({
                id: `${fileId}_sidecar`,
                name: sidecarFilename,
                path: path.join(DIRECTORIES.unfinishedAnnotations, sidecarFilename),
                category: 'unfinished_annotations_sidecar',
                uploadedAt: new Date().toISOString(),
                size: fs.statSync(sidecarPath).size,
                parentId: fileId
              });
            }
          } else {
            // Add new TIFF file
            metadata.files.push({
              id: fileId,
              name: tiffFilename,
              path: path.join(DIRECTORIES.unfinishedAnnotations, tiffFilename),
              category: 'unfinished_annotations',
              uploadedAt: new Date().toISOString(),
              size: fs.statSync(tiffPath).size,
              lineage: {
                processType: 'annotation',
                inputs: [sourceFileId],
                status: 'in_progress'
              }
            });

            // Add sidecar file
            metadata.files.push({
              id: `${fileId}_sidecar`,
              name: sidecarFilename,
              path: path.join(DIRECTORIES.unfinishedAnnotations, sidecarFilename),
              category: 'unfinished_annotations_sidecar',
              uploadedAt: new Date().toISOString(),
              size: fs.statSync(sidecarPath).size,
              parentId: fileId
            });
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
        classes
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

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = sourceFileName
        ? path.basename(sourceFileName, path.extname(sourceFileName))
        : 'annotation';
      const tiffFilename = `${timestamp}_${baseName}_annotation.tif`;
      const sidecarFilename = `${timestamp}_${baseName}_annotation_classes.json`;

      const tiffPath = path.join(annotationsDir, tiffFilename);
      const sidecarPath = path.join(annotationsDir, sidecarFilename);

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

          // Generate file ID
          const fileId = `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Add to workspace metadata
          const metadata = workspaceManager.loadMetadata(sessionId);
          if (!metadata.files) {
            metadata.files = [];
          }

          // Add TIFF file with 'annotations' category
          metadata.files.push({
            id: fileId,
            name: tiffFilename,
            path: path.join('annotations', tiffFilename),
            category: 'annotations',
            uploadedAt: new Date().toISOString(),
            size: fs.statSync(tiffPath).size,
            lineage: {
              processType: 'annotation',
              inputs: [sourceFileId],
              status: 'complete'
            }
          });

          // Add sidecar file
          metadata.files.push({
            id: `${fileId}_sidecar`,
            name: sidecarFilename,
            path: path.join('annotations', sidecarFilename),
            category: 'annotations_sidecar',
            uploadedAt: new Date().toISOString(),
            size: fs.statSync(sidecarPath).size,
            parentId: fileId
          });

          workspaceManager.saveMetadata(sessionId, metadata);

          if (logger) logger.info(`[Annotation] Created final annotation: ${tiffFilename}`);
          if (activityLogger) {
            activityLogger.logActivity(req.session.user?.username, 'annotation_create', {
              fileId,
              sourceFileId
            });
          }

          res.json({
            success: true,
            fileId,
            tiffPath: path.join('annotations', tiffFilename),
            sidecarPath: path.join('annotations', sidecarFilename),
            message: 'Annotation created successfully'
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

      // Find sidecar JSON
      const sidecarFile = metadata.files.find(f => f.parentId === fileId);
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
            lastModifiedAt: sidecarData?.lastModifiedAt || file.uploadedAt
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
