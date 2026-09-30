/**
 * Workspace Routes
 *
 * Handles workspace initialization, status, upload, stats, and thumbnails.
 * Mounted at /api/workspace
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth.middleware');
const { PYTHON_PATH } = require('../config/constants');
const { findRootFiles, getLineageChain, getProcessingHistoryString, findOriginalDataFile } = require('../helpers/lineageHelpers');
const { KINDS, detectKind, placeUploadedFile } = require('../helpers/uploadKind');

/**
 * Create workspace routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.workspaceService - WorkspaceService instance
 * @param {object} dependencies.fileService - FileService instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @param {function} dependencies.upload - Multer upload middleware
 * @returns {Router} Express router
 */
function createWorkspaceRoutes(dependencies) {
  const router = express.Router();
  const {
    workspaceManager,
    workspaceService,
    fileService,
    activityLogger,
    logger,
    io,
    upload
  } = dependencies;

  // ===========================================================================
  // WORKSPACE MANAGEMENT
  // ===========================================================================

  /**
   * Initialize workspace for current session
   * POST /api/workspace/init
   */
  router.post('/init', requireAuth, (req, res) => {
    try {
      const sessionId = req.session.id;
      const workspaceInfo = workspaceService.initializeWorkspace(
        sessionId,
        req.session.user.username
      );

      res.json({
        success: true,
        workspace: workspaceInfo
      });
    } catch (error) {
      if (logger) {
        logger.error('Error initializing workspace:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get workspace status and file tree
   * GET /api/workspace/status
   */
  router.get('/status', requireAuth, async (req, res) => {
    try {
      const sessionId = req.session.id;
      const status = workspaceService.getWorkspaceStatus(sessionId);

      res.json({
        success: true,
        workspace: status
      });
    } catch (error) {
      if (logger) {
        logger.error('Error getting workspace status:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get workspace file tree
   * GET /api/workspace/files
   */
  router.get('/files', requireAuth, (req, res) => {
    try {
      const sessionId = req.session.id;
      const metadata = workspaceService.loadMetadata(sessionId);

      res.json({
        success: true,
        files: metadata?.files || []
      });
    } catch (error) {
      if (logger) {
        logger.error('Error getting workspace files:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get workspace statistics
   * GET /api/workspace/stats
   */
  router.get('/stats', requireAuth, (req, res) => {
    try {
      const sessionId = req.session.id;
      const stats = workspaceService.getWorkspaceStats(sessionId);

      res.json({
        success: true,
        stats: stats
      });
    } catch (error) {
      if (logger) {
        logger.error('Error getting workspace stats:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Read physical voxel size from a TIFF's metadata in the background and
   * store it on the file entry when found (ADR-008). Fire-and-forget.
   */
  function extractVoxelSizeAsync(sessionId, absolutePath, fileId) {
    try {
      const proc = spawn(PYTHON_PATH, [
        'python/extract_slice.py', absolutePath, '--info', '--no-classes'
      ]);
      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.on('close', () => {
        try {
          const line = stdout.split('\n').find(l => l.startsWith('INFO:'));
          if (!line) return;
          const info = JSON.parse(line.substring(5));
          if (info.voxelSize && info.voxelSize.x) {
            workspaceManager.updateFileVoxelSize(sessionId, fileId, info.voxelSize);
            if (logger) logger.debug(`[Workspace] Voxel size stored for ${fileId}:`, info.voxelSize);
          }
        } catch (e) { /* non-critical */ }
      });
      proc.on('error', () => { /* non-critical */ });
    } catch (e) { /* non-critical */ }
  }

  // ===========================================================================
  // FILE UPLOAD (ADR-018: the server detects what a file is)
  // ===========================================================================

  /** Convert an uploaded MRC to TIFF in place; resolves {path, size, voxelSize} or {error} */
  function convertMrc(mrcPath) {
    const tifPath = mrcPath.replace(/\.mrc$/i, '') + '.tif';
    return new Promise((resolve) => {
      const proc = spawn(PYTHON_PATH, [
        'python/convert_file.py', '--input', mrcPath, '--output', tifPath
      ]);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const line = stdout.split('\n').find(l => l.startsWith('CONVERT_RESULT:'));
        if (code === 0 && line) {
          try {
            const result = JSON.parse(line.substring(15));
            return resolve({ path: tifPath, size: result.size, voxelSize: result.voxelSize || null });
          } catch (e) { /* fall through */ }
        }
        const errLine = stdout.split('\n').find(l => l.startsWith('CONVERT_ERROR:'));
        let message = 'MRC conversion failed';
        if (errLine) {
          try { message = JSON.parse(errLine.substring(14)).message || message; } catch (e) { /* keep */ }
        } else if (stderr) {
          message = stderr.split('\n').slice(-2).join(' ').trim() || message;
        }
        resolve({ error: message });
      });
      proc.on('error', (err) => resolve({ error: `Failed to spawn converter: ${err.message}` }));
    });
  }

  /** Forget (and delete) a pending workspace-backup upload of this session */
  function dropPendingRestore(req) {
    const pending = req.session.pendingRestore;
    if (pending && pending.path) {
      fs.unlink(pending.path, () => {});
    }
    delete req.session.pendingRestore;
  }

  /**
   * Upload files to the workspace
   * POST /api/workspace/upload   (multipart; any field name; several files)
   *
   * Body (optional): `kind` - a hint from a module selector ('raw',
   * 'annotation', 'model'); legacy `category` values are accepted too. The
   * hint wins for images; every other kind comes from the file itself
   * (zip peek, extension, TIFF content probe).
   *
   * Response: { success, files: [entry...], file: entry, detected: [...],
   * pendingRestore } - a workspace backup is not placed but parked for the
   * restore confirmation (pendingRestore: {id, size, originalName}).
   */
  router.post('/upload', requireAuth, upload.any(), async (req, res) => {
    const uploaded = req.files || [];
    const cleanupTemp = () => {
      for (const f of uploaded) {
        if (f && f.path && fs.existsSync(f.path)) fs.unlink(f.path, () => {});
      }
    };
    try {
      const sessionId = req.session.id;

      // Check approval status - only active users can upload custom files
      if (req.session.user.status !== 'active') {
        cleanupTemp();
        return res.status(403).json({
          success: false,
          error: 'Custom file upload requires account approval',
          status: req.session.user.status,
          message: 'Your account is pending approval. You can use test data while waiting.'
        });
      }

      if (uploaded.length === 0) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const hint = req.body.kind || req.body.category || null;
      const results = [];
      const errors = [];
      let pendingRestore = null;

      for (const file of uploaded) {
        let tmpPath = file.path;
        let originalName = file.originalname;
        let size = file.size;
        let voxelSize = null;

        try {
          // MRC uploads are converted to TIFF on import - every module in
          // the workbench operates on TIFF. Voxel size comes from the header.
          if (/\.mrc$/i.test(originalName)) {
            const conversion = await convertMrc(tmpPath);
            fs.unlink(tmpPath, () => {});
            if (conversion.error) {
              errors.push({ name: originalName, error: `Could not import MRC file: ${conversion.error}` });
              continue;
            }
            tmpPath = conversion.path;
            originalName = originalName.replace(/\.mrc$/i, '.tif');
            size = conversion.size;
            voxelSize = conversion.voxelSize;
          }

          const detected = await detectKind(tmpPath, originalName, { hint, logger });
          if (!detected.kind) {
            fs.unlink(tmpPath, () => {});
            errors.push({ name: originalName, error: `Not uploaded: ${detected.reason}` });
            continue;
          }

          const spec = KINDS[detected.kind];
          if (spec.limit && size > spec.limit) {
            fs.unlink(tmpPath, () => {});
            errors.push({
              name: originalName,
              error: `File too large for ${spec.label} (${Math.round(size / 1048576)} MB, limit ${Math.round(spec.limit / 1048576)} MB)`
            });
            continue;
          }

          if (detected.kind === 'workspace') {
            // Parked for the restore confirmation; one pending backup per session
            dropPendingRestore(req);
            const id = `restore_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
            const parked = path.join(path.dirname(tmpPath), `${id}.zip`);
            fs.renameSync(tmpPath, parked);
            req.session.pendingRestore = { id, path: parked, size, originalName, receivedAt: new Date().toISOString() };
            pendingRestore = { id, size, originalName };
            continue;
          }

          const placed = placeUploadedFile(workspaceManager, sessionId, tmpPath, originalName, detected.kind);

          // Add file to metadata. Invariant: `name` is the on-disk basename
          // (name === basename(path)); the user's original filename is the
          // display name (unique per workspace).
          const fileEntry = workspaceService.addFileToMetadata(sessionId, {
            name: placed.name,
            path: placed.relPath,
            category: placed.category,
            tags: placed.tags,
            size,
            folderId: null,
            displayName: originalName,
            ...(voxelSize && { voxelSize })
          });

          if (fileService && fileService.isTiffFile(placed.name)) {
            fileService.generateThumbnailAsync(sessionId, placed.absPath, fileEntry.id);
            extractVoxelSizeAsync(sessionId, placed.absPath, fileEntry.id);
          }

          if (activityLogger) {
            activityLogger.logActivity(req.session.user.username, 'file_upload', {
              filename: originalName,
              kind: detected.kind,
              category: placed.category,
              size
            });
          }

          results.push({
            ...fileEntry,
            detectedKind: detected.kind,
            detectedLabel: spec.label,
            detectedReason: detected.reason
          });
        } catch (fileError) {
          if (logger) logger.error(`Error placing upload ${originalName}:`, fileError);
          if (tmpPath && fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => {});
          errors.push({ name: originalName, error: fileError.message });
        }
      }

      if (results.length === 0 && !pendingRestore) {
        return res.status(400).json({
          success: false,
          error: errors.length === 1 ? errors[0].error : 'No file could be uploaded',
          errors
        });
      }

      res.json({
        success: true,
        files: results,
        file: results[0] || null,
        errors,
        pendingRestore,
        message: results.length
          ? `Uploaded ${results.length} file${results.length === 1 ? '' : 's'}`
          : 'Workspace backup received'
      });

    } catch (error) {
      cleanupTemp();
      if (logger) {
        logger.error('Error uploading file to workspace:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Discard a parked workspace backup
   * DELETE /api/workspace/restore/pending
   */
  router.delete('/restore/pending', requireAuth, (req, res) => {
    dropPendingRestore(req);
    res.json({ success: true });
  });


  // ===========================================================================
  // WORKSPACE EXPORT/IMPORT (ZIP)
  // ===========================================================================

  /**
   * Download workspace as ZIP file
   * GET /api/workspace/download
   *
   * Streams a zip file containing all workspace files (excluding cache directories).
   * Cache directories (.thumbnails, .slices, .mesh-previews) are excluded.
   */
  router.get('/download', requireAuth, async (req, res) => {
    try {
      const sessionId = req.session.id;

      // Set extended timeout for large workspaces (10 minutes)
      req.setTimeout(600000);
      res.setTimeout(600000);

      await workspaceService.exportWorkspace(
        sessionId,
        res,
        req.session.user?.username
      );

      // Note: response is handled by exportWorkspace (streaming)
    } catch (error) {
      if (logger) {
        logger.error('Workspace download error:', error);
      }
      // Only send error if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  });

  /**
   * Middleware to track upload progress via Socket.IO
   * Must run BEFORE multer to capture incoming bytes
   */
  const trackUploadProgress = (req, res, next) => {
    // Get restoreId from query params (available before body is parsed)
    const restoreId = req.query.restoreId;
    if (!restoreId || !io) {
      return next();
    }

    const roomName = `restore-${restoreId}`;
    const contentLength = parseInt(req.headers['content-length'], 10);

    if (!contentLength || contentLength === 0) {
      return next();
    }

    let bytesReceived = 0;
    let lastEmittedPercent = 0;

    // Listen to data events on the request stream
    req.on('data', (chunk) => {
      bytesReceived += chunk.length;
      // Scale upload to 0-50% range
      const percent = Math.round((bytesReceived / contentLength) * 50);

      // Only emit every 2% to avoid flooding
      if (percent > lastEmittedPercent + 1 || percent === 50) {
        lastEmittedPercent = percent;
        io.to(roomName).emit('restore-progress', {
          restoreId,
          phase: 'uploading',
          progress: percent,
          message: `Uploading... ${Math.round((bytesReceived / contentLength) * 100)}%`
        });
      }
    });

    next();
  };

  /**
   * Restore workspace from ZIP file
   * POST /api/workspace/restore
   *
   * Accepts a zip file upload and restores the workspace from it.
   * Clears existing workspace, extracts zip, updates session ID in metadata.
   *
   * Query params:
   *   - restoreId: ID for Socket.IO progress tracking
   */
  router.post('/restore', requireAuth, trackUploadProgress, dependencies.uploadWorkspaceZip.single('workspace'), async (req, res) => {
    try {
      const sessionId = req.session.id;

      // Check approval status - only active users can restore workspaces
      if (req.session.user.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Workspace restore requires account approval',
          status: req.session.user.status,
          message: 'Your account is pending approval.'
        });
      }

      // Either a multipart zip (legacy client) or a backup parked by the
      // upload endpoint (ADR-018: `pendingRestoreId` in a JSON body)
      let zipPath = req.file ? req.file.path : null;
      const pending = req.session.pendingRestore || null;
      const pendingId = req.body && req.body.pendingRestoreId;
      if (!zipPath && pendingId) {
        if (!pending || pending.id !== pendingId || !fs.existsSync(pending.path)) {
          delete req.session.pendingRestore;
          return res.status(404).json({
            success: false,
            error: 'The uploaded backup is no longer available; upload it again'
          });
        }
        zipPath = pending.path;
        delete req.session.pendingRestore;
      }

      if (!zipPath) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      // Validate file is a zip
      if (req.file && !req.file.originalname.toLowerCase().endsWith('.zip')) {
        fs.unlink(zipPath, () => {});
        return res.status(400).json({
          success: false,
          error: 'Only ZIP files are allowed for workspace restore'
        });
      }

      // Get restoreId from query params (used by upload progress middleware)
      // Fall back to body or generate new one
      const restoreId = req.query.restoreId || req.body.restoreId || `restore_${Date.now()}`;
      const roomName = `restore-${restoreId}`;

      // Create progress callback that emits to Socket.IO room
      const progressCallback = (phase, progress, message) => {
        if (io) {
          io.to(roomName).emit('restore-progress', {
            restoreId,
            phase,
            progress,
            message
          });
        }
      };

      // Restore workspace from the uploaded temp file (streamed, sanitized);
      // the temp file is deleted afterwards either way
      let result;
      try {
        result = await workspaceService.restoreWorkspace(
          sessionId,
          zipPath,
          fileService,
          req.session.user?.username,
          progressCallback
        );
      } finally {
        fs.unlink(zipPath, () => {});
      }

      res.json({
        success: true,
        message: 'Workspace restored successfully',
        fileCount: result.fileCount,
        folderCount: result.folderCount,
        originalSessionId: result.originalSessionId
      });

    } catch (error) {
      if (logger) {
        logger.error('Workspace restore error:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // THUMBNAILS
  // ===========================================================================

  /**
   * Get or generate thumbnail for a file
   * GET /api/workspace/thumbnail/:fileId
   */
  router.get('/thumbnail/:fileId', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const file = await workspaceService.getFile(sessionId, fileId);
      const workspacePath = workspaceService.getWorkspacePath(sessionId);

      // Check if thumbnail already exists
      if (file.thumbnailPath) {
        const thumbPath = path.join(workspacePath, file.thumbnailPath);
        if (fs.existsSync(thumbPath)) {
          return res.sendFile(path.resolve(thumbPath));
        }
      }

      // Only generate thumbnails for TIFF files
      const ext = path.extname(file.name).toLowerCase();
      if (ext !== '.tif' && ext !== '.tiff') {
        return res.status(400).json({
          success: false,
          error: 'Thumbnails only available for TIFF files'
        });
      }

      // Create .thumbnails directory
      const thumbnailsDir = workspaceService.ensureThumbnailsDir(sessionId);
      const thumbnailFilename = `${fileId}.jpg`;
      const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
      const filePath = path.join(workspacePath, file.path);

      // Spawn Python script
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/generate_thumbnail.py',
        filePath,
        thumbnailPath
      ]);

      let output = '';
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.on('close', async (code) => {
        if (code === 0 && output.includes('SUCCESS:')) {
          // Update metadata with thumbnail path
          await workspaceService.setThumbnailPath(
            sessionId,
            fileId,
            `.thumbnails/${thumbnailFilename}`
          );

          res.sendFile(path.resolve(thumbnailPath));
        } else {
          if (logger) {
            logger.error('Thumbnail generation failed:', output);
          }
          res.status(500).json({
            success: false,
            error: 'Thumbnail generation failed'
          });
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('Thumbnail error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===========================================================================
  // IMAGE VIEWER - SLICE EXTRACTION
  // ===========================================================================

  /**
   * Get TIFF file information (slice count, dimensions, dtype)
   * GET /api/workspace/tiff-info/:fileId
   */
  router.get('/tiff-info/:fileId', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const file = await workspaceService.getFile(sessionId, fileId);
      const workspacePath = workspaceService.getWorkspacePath(sessionId);
      const filePath = path.join(workspacePath, file.path);

      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Only allow TIFF files
      const ext = path.extname(file.name).toLowerCase();
      if (ext !== '.tif' && ext !== '.tiff') {
        return res.status(400).json({
          success: false,
          error: 'Only TIFF files are supported'
        });
      }

      // Spawn Python script to get info
      // Use --no-classes for fast metadata-only read (skips loading entire file)
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/extract_slice.py',
        filePath,
        '--info',
        '--no-classes'
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
        if (code === 0 && output.includes('INFO:')) {
          const jsonStr = output.replace('INFO:', '').trim();
          try {
            const info = JSON.parse(jsonStr);
            res.json({
              success: true,
              fileId: fileId,
              fileName: file.name,
              ...info
            });
          } catch (parseError) {
            res.status(500).json({
              success: false,
              error: 'Failed to parse TIFF info'
            });
          }
        } else {
          const errorMsg = output.includes('ERROR:')
            ? output.replace('ERROR:', '').trim()
            : errorOutput || 'Unknown error';
          res.status(500).json({
            success: false,
            error: errorMsg
          });
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('TIFF info error:', error);
      }
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Extract and serve a slice from a TIFF file as JPEG
   * GET /api/workspace/slice/:fileId/:sliceIndex
   * Query params:
   *   - size: 'icon' (128px), 'gallery' (512px), or number (default: 512)
   */
  router.get('/slice/:fileId/:sliceIndex', requireAuth, async (req, res) => {
    try {
      const { fileId, sliceIndex } = req.params;
      const size = req.query.size || 'gallery';
      const sessionId = req.session.id;

      // Validate slice index
      const sliceNum = parseInt(sliceIndex, 10);
      if (isNaN(sliceNum) || sliceNum < 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid slice index'
        });
      }

      const file = await workspaceService.getFile(sessionId, fileId);
      const workspacePath = workspaceService.getWorkspacePath(sessionId);
      const filePath = path.join(workspacePath, file.path);

      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Only allow TIFF files
      const ext = path.extname(file.name).toLowerCase();
      if (ext !== '.tif' && ext !== '.tiff') {
        return res.status(400).json({
          success: false,
          error: 'Only TIFF files are supported'
        });
      }

      // Create cache directory for slices
      const slicesDir = path.join(workspacePath, '.slices');
      if (!fs.existsSync(slicesDir)) {
        fs.mkdirSync(slicesDir, { recursive: true });
      }

      // Generate cache filename based on fileId, slice, and size
      const cacheFilename = `${fileId}_${sliceIndex}_${size}.jpg`;
      const cachePath = path.join(slicesDir, cacheFilename);

      // Workspace files are immutable (edits create new files), so slice
      // JPEGs can be browser-cached: revisiting a slice reuses the local
      // copy instead of re-fetching and re-showing a loading state
      res.set('Cache-Control', 'private, max-age=86400');

      // Check cache first
      if (fs.existsSync(cachePath)) {
        return res.sendFile(path.resolve(cachePath));
      }

      // Spawn Python script to extract slice
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/extract_slice.py',
        filePath,
        sliceIndex.toString(),
        cachePath,
        '--size',
        size
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
        if (code === 0 && output.includes('SUCCESS:')) {
          res.sendFile(path.resolve(cachePath));
        } else {
          const errorMsg = output.includes('ERROR:')
            ? output.replace('ERROR:', '').trim()
            : errorOutput || 'Unknown error';

          // Check for specific error types
          if (errorMsg.includes('out of range')) {
            res.status(400).json({
              success: false,
              error: errorMsg
            });
          } else {
            res.status(500).json({
              success: false,
              error: errorMsg
            });
          }
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('Slice extraction error:', error);
      }
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // LINEAGE TRACKING
  // ===========================================================================

  /**
   * Get lineage chain for a file
   * GET /api/workspace/lineage/:fileId
   *
   * Returns the processing history chain from root file(s) to the specified file.
   */
  router.get('/lineage/:fileId', requireAuth, (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;
      const metadata = workspaceManager.loadMetadata(sessionId);

      if (!metadata || !metadata.files) {
        return res.status(404).json({
          success: false,
          error: 'Workspace metadata not found'
        });
      }

      // Find the file by ID or path (path fallback for direct module navigation)
      let file = metadata.files.find(f => f.id === fileId);
      if (!file) {
        // Try matching by path (fileId might be a path from mesh module)
        file = metadata.files.find(f => f.path === fileId || f.path === decodeURIComponent(fileId));
      }
      if (!file) {
        return res.status(404).json({
          success: false,
          error: 'File not found',
          fileId
        });
      }

      // Get lineage information (use actual file.id for lookups)
      const actualFileId = file.id;
      const chain = getLineageChain(actualFileId, metadata.files);
      const roots = findRootFiles(actualFileId, metadata.files);
      const processingHistory = getProcessingHistoryString(actualFileId, metadata.files);
      const originalDataFile = findOriginalDataFile(actualFileId, metadata.files);

      // The model that produced this file (segmentation, DL denoising,
      // export, fine-tuning): an annotation on the record, not an input
      const modelId = file.lineage && file.lineage.modelFileId;
      const modelRow = modelId ? metadata.files.find(f => f.id === modelId) : null;

      res.json({
        success: true,
        fileId,
        fileName: file.displayName || file.name,
        hasLineage: !!file.lineage,
        processingHistory,
        chain,
        rootIds: roots.rootIds,
        originalDataFile: originalDataFile ? {
          id: originalDataFile.id,
          name: originalDataFile.name,
          displayName: originalDataFile.displayName || originalDataFile.name,
          path: originalDataFile.path,
          category: originalDataFile.category
        } : null,
        modelFile: modelId ? {
          id: modelId,
          name: modelRow ? (modelRow.displayName || modelRow.name) : null,
          deleted: !modelRow
        } : null,
        hasErrors: roots.hasErrors,
        errors: roots.errors
      });
    } catch (error) {
      if (logger) {
        logger.error('Lineage query error:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createWorkspaceRoutes;
