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
const { PYTHON_PATH } = require('../config/constants');
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
      let cacheKey = null;
      if (path.isAbsolute(fileId)) {
        filePath = fileId;
      } else {
        const metadata = workspaceManager.loadMetadata(sessionId);
        const file = metadata?.files?.find(f => f.id === fileId)
          || metadata?.files?.find(f => f.path === fileId);

        if (file) {
          filePath = path.join(workspacePath, file.path);
          cacheKey = file.id;
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

      // Cache key: the tracked file id (ADR-018), a path hash for untracked
      // files. (The original key was the first 32 base64 characters of the
      // path, i.e. its first 24 bytes, which is the same for every file under
      // one install: every stack shared one cache.)
      purgeLegacyRawSliceCache(cacheDir);
      const cacheFilename = `raw_${cacheKey || rawSliceHash(filePath)}_${sliceIndex}.png`;
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
  // SAVE PROGRESS / CREATE (ADR-018: one run folder per annotation)
  // ===========================================================================

  /**
   * Write the label TIFF with create_annotation_tiff.py
   * @returns {Promise<void>} rejects with the script's error message
   */
  function writeAnnotationTiff(configData, tiffPath) {
    const { spawn } = require('child_process');
    const os = require('os');
    return new Promise((resolve, reject) => {
      const tempConfigPath = path.join(os.tmpdir(), `annotation_config_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`);
      fs.writeFileSync(tempConfigPath, JSON.stringify(configData));
      const proc = spawn(PYTHON_PATH, [
        'python/create_annotation_tiff.py',
        '--config', tempConfigPath,
        '--output', tiffPath
      ]);
      let output = '';
      let errorOutput = '';
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
      proc.on('error', (err) => {
        try { fs.unlinkSync(tempConfigPath); } catch (e) { /* ignore */ }
        reject(new Error(`Failed to spawn process: ${err.message}`));
      });
      proc.on('close', (code) => {
        try { fs.unlinkSync(tempConfigPath); } catch (e) { /* ignore */ }
        if (code !== 0 || !output.includes('SUCCESS:')) {
          const errorMsg = output.includes('ERROR:')
            ? output.split('ERROR:')[1].split('\n')[0].trim()
            : errorOutput || 'Failed to create annotation TIFF';
          return reject(new Error(errorMsg));
        }
        resolve();
      });
    });
  }

  /**
   * Source image row (for the display name and the voxel size). The client
   * may send an id or a workspace-relative path.
   */
  function findSource(metadata, sourceFileId) {
    return (metadata.files || []).find(f => f.id === sourceFileId || f.path === sourceFileId) || null;
  }

  /**
   * Save or create an annotation.
   *
   * New annotation: a run folder results/annotation/annot<n>/ with the label
   * TIFF and the classes sidecar, both carrying their display names
   * (<source>_annot.tif, <source>_annot_classes.json). Category results,
   * tags annotation + wip (in progress) or annotation + data (complete).
   *
   * Existing annotation (existingAnnotationId): the TIFF and sidecar are
   * rewritten in place; Create promotes a work-in-progress annotation to a
   * finished one (tags, lineage status, sidecar status) instead of leaving
   * an orphaned copy behind.
   *
   * @param {object} req - Express request
   * @param {'in_progress'|'complete'} status - Target status
   * @returns {Promise<{fileId, tiffPath, sidecarPath, promoted}>}
   */
  async function saveAnnotation(req, status) {
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

    const sessionId = req.session.id;
    const workspacePath = workspaceManager.getWorkspacePath(sessionId);
    const metadata = workspaceManager.loadMetadata(sessionId);
    const source = findSource(metadata, sourceFileId);
    const resolvedSourceId = source ? source.id : sourceFileId;
    const sourceDisplay = source
      ? (source.displayName || source.name)
      : (sourceFileName && sourceFileName !== 'unknown' ? sourceFileName : 'annotation');

    // Existing annotation to rewrite in place (any location: a folder of
    // this version or one written before ADR-018)
    let existingFile = existingAnnotationId
      ? (metadata.files || []).find(f => f.id === existingAnnotationId) || null
      : null;
    // A finished annotation is never overwritten by Save Progress or a
    // second Create: those start a new annotation
    if (existingFile && !(existingFile.tags || []).includes('wip') && status === 'complete') {
      existingFile = null;
    }
    if (existingFile && !(existingFile.tags || []).includes('wip')) {
      existingFile = null;
    }
    const existingSidecar = existingFile
      ? (metadata.files || []).find(f => f.parentId === existingFile.id) || null
      : null;

    let fileId, tiffPath, sidecarPath, dir;
    if (existingFile) {
      fileId = existingFile.id;
      tiffPath = path.join(workspacePath, existingFile.path);
      dir = path.dirname(tiffPath);
      sidecarPath = existingSidecar
        ? path.join(workspacePath, existingSidecar.path)
        : path.join(dir, path.basename(tiffPath).replace(/\.tiff?$/i, '') + '_classes.json');
    } else {
      dir = workspaceManager.allocateRun(sessionId, 'annot', ['results/annotation']).dirs['results/annotation'];
      fileId = `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      tiffPath = path.join(dir, workspaceManager.physicalNameFor(dir, annotationDisplayName(sourceDisplay, '.tif')));
      sidecarPath = path.join(dir, workspaceManager.physicalNameFor(dir, annotationDisplayName(sourceDisplay, '.json', 'classes')));
    }

    await writeAnnotationTiff({ width, height, slices, sliceData: sliceData || {} }, tiffPath);

    // Sidecar JSON (createdAt survives rewrites)
    let createdAt = new Date().toISOString();
    if (existingSidecar && fs.existsSync(sidecarPath)) {
      try { createdAt = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')).createdAt || createdAt; } catch (e) { /* keep */ }
    }
    const sidecarData = {
      version: '1.0.0',
      sourceFileId: resolvedSourceId,
      sourceFileName: sourceDisplay,
      classes: classes || [],
      createdAt,
      lastModifiedAt: new Date().toISOString(),
      status
    };
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecarData, null, 2));

    const tags = status === 'complete' ? ['annotation', 'data'] : ['annotation', 'wip'];
    const now = new Date().toISOString();

    if (existingFile) {
      // Rewrite in place (and promote when completing)
      const fresh = workspaceManager.loadMetadata(sessionId);
      const row = fresh.files.find(f => f.id === fileId);
      if (row) {
        row.size = fs.statSync(tiffPath).size;
        row.lastModifiedAt = now;
        row.tags = tags;
        if (row.lineage) row.lineage.status = status;
        row.category = 'results';
      }
      const sidecarRow = fresh.files.find(f => f.parentId === fileId);
      if (sidecarRow) {
        sidecarRow.size = fs.statSync(sidecarPath).size;
        sidecarRow.lastModifiedAt = now;
      }
      workspaceManager.saveMetadata(sessionId, fresh);
      workspaceManager.invalidateFileCaches(sessionId, fileId);
      workspaceManager.notifyFilesChanged(sessionId);

      if (!sidecarRow) {
        workspaceManager.addFileToMetadata(sessionId, {
          id: `${fileId}_sidecar`,
          name: path.basename(sidecarPath),
          path: path.relative(workspacePath, sidecarPath),
          category: 'results',
          tags: ['annotation', 'info'],
          size: fs.statSync(sidecarPath).size,
          displayName: annotationDisplayName(sourceDisplay, '.json', 'classes'),
          lineage: annotationLineage(resolvedSourceId, status),
          parentId: fileId
        });
      }
    } else {
      workspaceManager.addFileToMetadata(sessionId, {
        id: fileId,
        name: path.basename(tiffPath),
        path: path.relative(workspacePath, tiffPath),
        category: 'results',
        tags,
        size: fs.statSync(tiffPath).size,
        displayName: annotationDisplayName(sourceDisplay, '.tif'),
        ...(source && source.voxelSize && { voxelSize: { ...source.voxelSize } }),
        lineage: annotationLineage(resolvedSourceId, status)
      });
      workspaceManager.addFileToMetadata(sessionId, {
        id: `${fileId}_sidecar`,
        name: path.basename(sidecarPath),
        path: path.relative(workspacePath, sidecarPath),
        category: 'results',
        tags: ['annotation', 'info'],
        size: fs.statSync(sidecarPath).size,
        displayName: annotationDisplayName(sourceDisplay, '.json', 'classes'),
        lineage: annotationLineage(resolvedSourceId, status),
        parentId: fileId
      });
    }

    return {
      fileId,
      tiffPath: path.relative(workspacePath, tiffPath),
      sidecarPath: path.relative(workspacePath, sidecarPath),
      promoted: !!existingFile && status === 'complete'
    };
  }

  function validateAnnotationBody(req, res, requireClasses) {
    const { sourceFileId, width, height, slices, classes } = req.body;
    if (!sourceFileId || !width || !height || !slices) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: sourceFileId, width, height, slices'
      });
      return false;
    }
    if (requireClasses && (!classes || classes.length === 0)) {
      res.status(400).json({ success: false, error: 'At least one class is required' });
      return false;
    }
    return true;
  }

  /**
   * Save annotation progress (work in progress)
   * POST /api/annotation/save-progress
   *
   * Request body:
   * {
   *   sourceFileId: string,      // ID of the source image
   *   sourceFileName: string,    // Name of the source image (fallback only)
   *   width: number,
   *   height: number,
   *   slices: number,
   *   sliceData: { "0": "base64...", "5": "base64...", ... },
   *   classes: [{ id, name, color, visible }, ...],
   *   existingAnnotationId: string  // Optional: ID of the WIP annotation to update
   * }
   */
  router.post('/save-progress', requireAuth, async (req, res) => {
    if (!validateAnnotationBody(req, res, false)) return;
    try {
      const result = await saveAnnotation(req, 'in_progress');
      if (logger) logger.info(`[Annotation] Saved progress: ${result.tiffPath}`);
      if (activityLogger) {
        activityLogger.logActivity(req.session.user?.username, 'annotation_save_progress', {
          fileId: result.fileId,
          sourceFileId: req.body.sourceFileId
        });
      }
      res.json({
        success: true,
        ...result,
        message: 'Annotation progress saved successfully'
      });
    } catch (error) {
      if (logger) logger.error('Error saving annotation progress:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Create final annotation
   * POST /api/annotation/create
   *
   * Request body: same as save-progress. A work-in-progress annotation named
   * by existingAnnotationId is promoted in place; otherwise a new annotation
   * is written to results/annotation/annot<n>/ with status 'complete'.
   */
  router.post('/create', requireAuth, async (req, res) => {
    if (!validateAnnotationBody(req, res, true)) return;
    try {
      const result = await saveAnnotation(req, 'complete');
      if (logger) logger.info(`[Annotation] Created annotation: ${result.tiffPath}${result.promoted ? ' (promoted)' : ''}`);
      if (activityLogger) {
        activityLogger.logActivity(req.session.user?.username, 'annotation_create', {
          fileId: result.fileId,
          sourceFileId: req.body.sourceFileId,
          promoted: result.promoted
        });
      }
      res.json({
        success: true,
        ...result,
        message: result.promoted ? 'Annotation completed' : 'Annotation created successfully'
      });
    } catch (error) {
      if (logger) logger.error('Error creating annotation:', error);
      res.status(500).json({ success: false, error: error.message });
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
