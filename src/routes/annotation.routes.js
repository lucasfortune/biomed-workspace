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
const { buildDisplayName } = require('../helpers/namingHelpers');
const { createLineage } = require('../helpers/lineageHelpers');

/**
 * Cache key for a source file's raw slices: sha1 of the full path, 16 hex chars
 * (also computed in WorkspaceManager.cleanupSliceCache; keep both in sync)
 * @param {string} filePath
 * @returns {string}
 */
function rawSliceHash(filePath) {
  return require('crypto').createHash('sha1').update(filePath).digest('hex').substring(0, 16);
}

/** Legacy raw-slice cache names ({32 base64 chars}_{slice}_raw.png) collided across files: drop them once */
const purgedRawSliceDirs = new Set();
function purgeLegacyRawSliceCache(cacheDir) {
  if (purgedRawSliceDirs.has(cacheDir)) return;
  purgedRawSliceDirs.add(cacheDir);
  try {
    for (const name of fs.readdirSync(cacheDir)) {
      if (/^[A-Za-z0-9_]{32}_\d+_raw\.png$/.test(name)) {
        try { fs.unlinkSync(path.join(cacheDir, name)); } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* ignore */ }
}

/**
 * Build an annotation display name chained from the source image. Collision
 * resolution happens inside addFileToMetadata, so this only builds the candidate.
 * @param {string} sourceFileName - Source image file name
 * @param {string} ext - Output extension (e.g. '.tif')
 * @param {string} [qualifier] - Optional qualifier (e.g. 'classes' for the sidecar)
 * @returns {string}
 */
function annotationDisplayName(sourceFileName, ext, qualifier) {
  return buildDisplayName({
    sourceName: sourceFileName || 'annotation',
    operation: 'annotation',
    ext,
    qualifier
  });
}

/**
 * Canonical annotation lineage: createLineage plus the documented `status`
 * extension ('in_progress' | 'complete').
 * @param {string} sourceFileId - Source image file id
 * @param {string} status - Annotation status
 * @returns {object}
 */
function annotationLineage(sourceFileId, status) {
  const lineage = createLineage('annotation', [sourceFileId]);
  lineage.status = status;
  return lineage;
}

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

      // Cache key: a hash of the full path. (The previous key was the first 32
      // base64 characters of the path, i.e. its first 24 bytes, which is the same
      // for every file under one install: every stack shared one cache and the
      // first stack loaded was shown for all others.)
      purgeLegacyRawSliceCache(cacheDir);
      const cacheFilename = `raw_${rawSliceHash(filePath)}_${sliceIndex}.png`;
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

          // Update or add to workspace metadata (via the canonical constructor)
          if (existingFile) {
            // Update existing file entries in place
            const metadata = workspaceManager.loadMetadata(sessionId);
            const tiffIndex = metadata.files.findIndex(f => f.id === fileId);
            if (tiffIndex !== -1) {
              metadata.files[tiffIndex].size = fs.statSync(tiffPath).size;
              metadata.files[tiffIndex].lastModifiedAt = new Date().toISOString();
            }

            const sidecarIndex = metadata.files.findIndex(f => f.parentId === fileId);
            if (sidecarIndex !== -1) {
              metadata.files[sidecarIndex].size = fs.statSync(sidecarPath).size;
              metadata.files[sidecarIndex].lastModifiedAt = new Date().toISOString();
            }
            workspaceManager.saveMetadata(sessionId, metadata);

            // The TIFF was rewritten in place: drop stale caches
            workspaceManager.invalidateFileCaches(sessionId, fileId);

            if (sidecarIndex === -1) {
              // Add sidecar if it didn't exist
              workspaceManager.addFileToMetadata(sessionId, {
                id: `${fileId}_sidecar`,
                name: sidecarFilename,
                path: path.join(DIRECTORIES.unfinishedAnnotations, sidecarFilename),
                category: 'results',
                tags: ['annotation', 'info'],
                size: fs.statSync(sidecarPath).size,
                displayName: annotationDisplayName(sourceFileName, '.json', 'classes'),
                parentId: fileId
              });
            }
          } else {
            // Add new TIFF file (results category with annotation/wip tags)
            workspaceManager.addFileToMetadata(sessionId, {
              id: fileId,
              name: tiffFilename,
              path: path.join(DIRECTORIES.unfinishedAnnotations, tiffFilename),
              category: 'results',
              tags: ['annotation', 'wip'],
              size: fs.statSync(tiffPath).size,
              displayName: annotationDisplayName(sourceFileName, '.tif'),
              lineage: annotationLineage(sourceFileId, 'in_progress')
            });

            // Add sidecar file (results category with annotation/info tags)
            workspaceManager.addFileToMetadata(sessionId, {
              id: `${fileId}_sidecar`,
              name: sidecarFilename,
              path: path.join(DIRECTORIES.unfinishedAnnotations, sidecarFilename),
              category: 'results',
              tags: ['annotation', 'info'],
              size: fs.statSync(sidecarPath).size,
              displayName: annotationDisplayName(sourceFileName, '.json', 'classes'),
              parentId: fileId
            });
          }

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

          // Add to workspace metadata (via the canonical constructor)
          // TIFF file - completed annotations are user-created content
          // (uploads category with annotation tag)
          workspaceManager.addFileToMetadata(sessionId, {
            id: fileId,
            name: tiffFilename,
            path: path.join('annotations', tiffFilename),
            category: 'uploads',
            tags: ['annotation'],
            size: fs.statSync(tiffPath).size,
            displayName: annotationDisplayName(sourceFileName, '.tif'),
            lineage: annotationLineage(sourceFileId, 'complete')
          });

          // Sidecar file (results category with annotation/info tags)
          workspaceManager.addFileToMetadata(sessionId, {
            id: `${fileId}_sidecar`,
            name: sidecarFilename,
            path: path.join('annotations', sidecarFilename),
            category: 'results',
            tags: ['annotation', 'info'],
            size: fs.statSync(sidecarPath).size,
            displayName: annotationDisplayName(sourceFileName, '.json', 'classes'),
            parentId: fileId
          });

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

  // ===========================================================================
  // PIXEL CLASSIFIER (ADR-013 §8): train on the user's strokes, predict slices
  // ===========================================================================

  /** Resolve a source file id (metadata id or workspace-relative path) to a path */
  function resolveSourcePath(sessionId, fileId) {
    const workspacePath = workspaceManager.getWorkspacePath(sessionId);
    if (path.isAbsolute(fileId)) return fileId;
    const metadata = workspaceManager.loadMetadata(sessionId);
    const file = metadata?.files?.find(f => f.id === fileId);
    return path.join(workspacePath, file ? file.path : fileId);
  }

  /** Per-workspace cache dir for classifier models (untracked, like .slices) */
  function classifierDir(sessionId) {
    const dir = path.join(workspaceManager.getWorkspacePath(sessionId), '.classifier');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Run pixel_classifier.py with a temp config; resolves with the PIXCLS_RESULT payload */
  function runClassifier(mode, config) {
    const { spawn } = require('child_process');
    const os = require('os');
    return new Promise((resolve, reject) => {
      const configPath = path.join(os.tmpdir(), `pixcls_${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`);
      fs.writeFileSync(configPath, JSON.stringify(config));
      const proc = spawn(PYTHON_PATH, ['python/pixel_classifier.py', mode, '--config', configPath]);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', (err) => reject(new Error(`Failed to spawn process: ${err.message}`)));
      proc.on('close', (code) => {
        try { fs.unlinkSync(configPath); } catch (e) { /* ignore */ }
        const find = (prefix) => {
          const line = stdout.split('\n').find(l => l.startsWith(`${prefix}:`));
          if (!line) return null;
          try { return JSON.parse(line.substring(prefix.length + 1)); } catch (e) { return null; }
        };
        const result = find('PIXCLS_RESULT');
        if (code === 0 && result) return resolve(result);
        const err = find('PIXCLS_ERROR');
        reject(new Error(err?.message || stderr.split('\n').slice(-3).join(' ').trim() || `Classifier ${mode} failed`));
      });
    });
  }

  /**
   * POST /api/annotation/classifier/train
   * Body: { sourceFileId, labels: {slice: encoding}, classes: [ids], backgroundClass }
   * Trains a random forest on the labelled pixels and stores it in the workspace.
   */
  router.post('/classifier/train', requireAuth, async (req, res) => {
    try {
      const { sourceFileId, labels, classes, backgroundClass } = req.body;
      if (!sourceFileId || !labels || Object.keys(labels).length === 0) {
        return res.status(400).json({ success: false, error: 'Missing sourceFileId or labels' });
      }
      const sessionId = req.session.id;
      const source = resolveSourcePath(sessionId, sourceFileId);
      if (!fs.existsSync(source)) {
        return res.status(404).json({ success: false, error: 'Source image not found' });
      }
      const modelId = `model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const modelPath = path.join(classifierDir(sessionId), `${modelId}.pkl`);

      const result = await runClassifier('train', {
        source, labels, classes: classes || [],
        backgroundClass: backgroundClass ?? null,
        modelPath
      });

      // Keep only the newest model per workspace
      for (const name of fs.readdirSync(classifierDir(sessionId))) {
        if (name.endsWith('.pkl') && name !== `${modelId}.pkl`) {
          try { fs.unlinkSync(path.join(classifierDir(sessionId), name)); } catch (e) { /* ignore */ }
        }
      }
      if (activityLogger && req.session.user) {
        activityLogger.logActivity(req.session.user.username, 'annotation_classifier_train',
          { sourceFileId, classes: result.classes, oob: result.oobAccuracy });
      }
      res.json({
        success: true,
        modelId,
        classes: result.classes,
        samplesPerClass: result.samplesPerClass,
        labelledSlices: result.labelledSlices,
        oobAccuracy: result.oobAccuracy,
        seconds: result.seconds
      });
    } catch (error) {
      if (logger) logger.error('[Annotation] Classifier train error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/annotation/classifier/predict
   * Body: { sourceFileId, modelId, slices: [i], minConfidence, smooth }
   * Returns dense base64 labels + confidence per slice (0 = no suggestion).
   */
  router.post('/classifier/predict', requireAuth, async (req, res) => {
    try {
      const { sourceFileId, modelId, slices, minConfidence, smooth } = req.body;
      if (!sourceFileId || !modelId || !Array.isArray(slices) || slices.length === 0) {
        return res.status(400).json({ success: false, error: 'Missing sourceFileId, modelId or slices' });
      }
      if (!/^model_[0-9]+_[a-z0-9]+$/.test(modelId)) {
        return res.status(400).json({ success: false, error: 'Invalid modelId' });
      }
      const sessionId = req.session.id;
      const source = resolveSourcePath(sessionId, sourceFileId);
      const modelPath = path.join(classifierDir(sessionId), `${modelId}.pkl`);
      if (!fs.existsSync(source)) {
        return res.status(404).json({ success: false, error: 'Source image not found' });
      }
      if (!fs.existsSync(modelPath)) {
        return res.status(404).json({ success: false, error: 'Model not found, train again', code: 'MODEL_MISSING' });
      }
      const result = await runClassifier('predict', {
        source, modelPath,
        slices: slices.slice(0, 64).map(i => parseInt(i, 10)).filter(Number.isInteger),
        minConfidence: Math.max(0, Math.min(1, Number(minConfidence) || 0)),
        smooth: Math.max(0, Math.min(3, parseInt(smooth, 10) || 0))
      });
      res.json({ success: true, slices: result.slices, width: result.width, height: result.height, seconds: result.seconds });
    } catch (error) {
      if (logger) logger.error('[Annotation] Classifier predict error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createAnnotationRoutes;
