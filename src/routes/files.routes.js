/**
 * File Routes
 *
 * Handles file CRUD operations, batch operations, and search.
 * Mounted at /api/workspace
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth.middleware');
const { PYTHON_PATH } = require('../config/constants');

/**
 * Create file routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.workspaceService - WorkspaceService instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @returns {Router} Express router
 */
function createFilesRoutes(dependencies) {
  const router = express.Router();
  const { workspaceManager, workspaceService, activityLogger, logger } = dependencies;

  // ===========================================================================
  // SINGLE FILE OPERATIONS
  // ===========================================================================

  /**
   * Get file by ID
   * GET /api/workspace/file/:fileId
   */
  router.get('/file/:fileId', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const file = await workspaceService.getFile(sessionId, fileId);

      res.json({ success: true, file });
    } catch (error) {
      if (logger) {
        logger.error('Get file error:', error);
      }
      res.status(404).json({ success: false, error: error.message });
    }
  });

  /**
   * Delete file by ID
   * DELETE /api/workspace/file/:fileId
   */
  router.delete('/file/:fileId', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const result = await workspaceService.deleteFile(sessionId, fileId);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'file_deleted',
          { fileId }
        );
      }

      res.json(result);
    } catch (error) {
      if (logger) {
        logger.error('Delete file error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Rename file
   * PATCH /api/workspace/file/:fileId/rename
   */
  router.patch('/file/:fileId/rename', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const { newName } = req.body;
      const sessionId = req.session.id;

      if (logger) {
        logger.debug(`Rename endpoint hit: fileId=${fileId}, newName=${newName}, sessionId=${sessionId}`);
      }

      if (!newName) {
        return res.status(400).json({ success: false, error: 'New name required' });
      }

      const file = await workspaceService.renameFile(sessionId, fileId, newName);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'file_renamed',
          { fileId, newName }
        );
      }

      res.json({ success: true, file });
    } catch (error) {
      if (logger) {
        logger.error('Rename file error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Set or clear a file's physical voxel size (ADR-008)
   * PATCH /api/workspace/file/:fileId/voxel-size
   * Body: { voxelSize: {x, y, z, unit} | null }
   */
  router.patch('/file/:fileId/voxel-size', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const { voxelSize } = req.body;
      const sessionId = req.session.id;

      let cleaned = null;
      if (voxelSize != null) {
        const x = Number(voxelSize.x);
        const y = Number(voxelSize.y);
        const z = voxelSize.z != null && voxelSize.z !== '' ? Number(voxelSize.z) : null;
        if (!(x > 0) || !(y > 0) || (z != null && !(z > 0))) {
          return res.status(400).json({
            success: false,
            error: 'Voxel sizes must be positive numbers'
          });
        }
        const unit = String(voxelSize.unit || 'um').slice(0, 10);
        cleaned = { x, y, ...(z != null && { z }), unit };
      }

      const file = workspaceManager.updateFileVoxelSize(sessionId, fileId, cleaned);
      res.json({ success: true, file });
    } catch (error) {
      if (logger) {
        logger.error('Voxel size update error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Move file to folder
   * PATCH /api/workspace/file/:fileId/move
   */
  router.patch('/file/:fileId/move', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const { targetFolderId } = req.body;
      const sessionId = req.session.id;

      const file = await workspaceService.moveFile(sessionId, fileId, targetFolderId);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'file_moved',
          { fileId, targetFolderId }
        );
      }

      res.json({ success: true, file });
    } catch (error) {
      if (logger) {
        logger.error('Move file error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Download file
   * GET /api/workspace/file/:fileId/download
   */
  router.get('/file/:fileId/download', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const file = await workspaceService.getFile(sessionId, fileId);
      const filePath = workspaceService.getFilePath(sessionId, file);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      res.download(filePath, file.name);
    } catch (error) {
      if (logger) {
        logger.error('Download file error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Read file content (for JSON viewer)
   * GET /api/workspace/file/:fileId/content
   */
  router.get('/file/:fileId/content', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const file = await workspaceService.getFile(sessionId, fileId);
      const filePath = workspaceService.getFilePath(sessionId, file);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      const ext = file.name.split('.').pop().toLowerCase();
      if (ext !== 'json') {
        return res.status(400).json({ success: false, error: 'Only JSON files can be viewed' });
      }

      const stats = fs.statSync(filePath);
      if (stats.size > 10 * 1024 * 1024) {
        return res.status(413).json({ success: false, error: 'File too large to view (max 10MB)' });
      }

      const rawContent = fs.readFileSync(filePath, 'utf-8');
      const content = JSON.parse(rawContent);

      res.json({ success: true, content, filename: file.name });
    } catch (error) {
      if (logger) {
        logger.error('Read file content error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===========================================================================
  // TIFF STACK OPERATIONS
  // ===========================================================================

  /**
   * Duplicate a TIFF stack
   * POST /api/workspace/file/:fileId/duplicate
   */
  router.post('/file/:fileId/duplicate', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      // Get original file
      const file = await workspaceService.getFile(sessionId, fileId);
      const workspacePath = workspaceService.getWorkspacePath(sessionId);
      const inputPath = path.join(workspacePath, file.path);

      // Validate it's a TIFF file
      const ext = path.extname(file.name).toLowerCase();
      if (ext !== '.tif' && ext !== '.tiff') {
        return res.status(400).json({ success: false, error: 'Only TIFF files can be duplicated' });
      }

      // Check input file exists
      if (!fs.existsSync(inputPath)) {
        return res.status(404).json({ success: false, error: 'Source file not found' });
      }

      // Generate output filename: original_copy.tif (handle conflicts)
      const baseName = path.basename(file.name, ext);
      const dirPath = path.dirname(inputPath);
      let outputName = `${baseName}_copy${ext}`;
      let outputPath = path.join(dirPath, outputName);
      let counter = 1;

      while (fs.existsSync(outputPath)) {
        outputName = `${baseName}_copy_${counter}${ext}`;
        outputPath = path.join(dirPath, outputName);
        counter++;
      }

      // Run Python script
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/tiff_stack_ops.py',
        'duplicate',
        inputPath,
        outputPath
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
      pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });

      pythonProcess.on('close', async (code) => {
        if (code === 0 && stdout.includes('SUCCESS:')) {
          try {
            const result = JSON.parse(stdout.replace('SUCCESS:', '').trim());

            // Add to metadata with lineage
            const newFile = workspaceManager.addFileToMetadata(sessionId, {
              name: outputName,
              path: path.relative(workspacePath, outputPath),
              category: file.category,
              size: result.size,
              tags: file.tags || [],
              ...(file.voxelSize && { voxelSize: file.voxelSize }),
              lineage: {
                processType: 'duplicate',
                inputs: [fileId],
                processedAt: new Date().toISOString()
              }
            });

            // Log activity
            if (activityLogger) {
              activityLogger.logActivity(req.session.user.username, 'file_duplicated', {
                sourceFileId: fileId,
                newFileId: newFile.id,
                sourceName: file.name,
                newName: outputName
              });
            }

            res.json({ success: true, file: newFile });
          } catch (parseError) {
            if (logger) logger.error('Parse duplicate result error:', parseError);
            res.status(500).json({ success: false, error: 'Failed to parse result' });
          }
        } else {
          const errorMsg = stdout.includes('ERROR:')
            ? stdout.replace('ERROR:', '').trim()
            : stderr || 'Duplication failed';
          if (logger) logger.error('Duplicate error:', errorMsg);
          res.status(500).json({ success: false, error: errorMsg });
        }
      });

      pythonProcess.on('error', (err) => {
        if (logger) logger.error('Python process error:', err);
        res.status(500).json({ success: false, error: 'Failed to spawn Python process' });
      });

    } catch (error) {
      if (logger) logger.error('Duplicate file error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Split a TIFF stack at specified slice
   * POST /api/workspace/file/:fileId/split
   * Body: { splitAt: number, deleteOriginal: boolean }
   */
  router.post('/file/:fileId/split', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const { splitAt, deleteOriginal = true } = req.body;
      const sessionId = req.session.id;

      // Validate splitAt
      if (!splitAt || typeof splitAt !== 'number' || splitAt < 1) {
        return res.status(400).json({ success: false, error: 'Invalid split point. Must be a positive number.' });
      }

      // Get original file
      const file = await workspaceService.getFile(sessionId, fileId);
      const workspacePath = workspaceService.getWorkspacePath(sessionId);
      const inputPath = path.join(workspacePath, file.path);

      // Validate it's a TIFF file
      const ext = path.extname(file.name).toLowerCase();
      if (ext !== '.tif' && ext !== '.tiff') {
        return res.status(400).json({ success: false, error: 'Only TIFF files can be split' });
      }

      // Check input file exists
      if (!fs.existsSync(inputPath)) {
        return res.status(404).json({ success: false, error: 'Source file not found' });
      }

      // Generate output filenames
      const baseName = path.basename(file.name, ext);
      const dirPath = path.dirname(inputPath);
      const output1Path = path.join(dirPath, `${baseName}_part1${ext}`);
      const output2Path = path.join(dirPath, `${baseName}_part2${ext}`);

      // Run Python script
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/tiff_stack_ops.py',
        'split',
        inputPath,
        output1Path,
        output2Path,
        splitAt.toString()
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
      pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });

      pythonProcess.on('close', async (code) => {
        if (code === 0 && stdout.includes('SUCCESS:')) {
          try {
            const result = JSON.parse(stdout.replace('SUCCESS:', '').trim());

            // Add both parts to metadata with lineage
            const file1 = workspaceManager.addFileToMetadata(sessionId, {
              name: path.basename(output1Path),
              path: path.relative(workspacePath, output1Path),
              category: file.category,
              size: result.part1.size,
              tags: file.tags || [],
              ...(file.voxelSize && { voxelSize: file.voxelSize }),
              lineage: {
                processType: 'split',
                inputs: [fileId],
                splitInfo: { part: 1, sliceRange: `1-${splitAt}`, sliceCount: result.part1.sliceCount },
                processedAt: new Date().toISOString()
              }
            });

            const file2 = workspaceManager.addFileToMetadata(sessionId, {
              name: path.basename(output2Path),
              path: path.relative(workspacePath, output2Path),
              category: file.category,
              size: result.part2.size,
              tags: file.tags || [],
              ...(file.voxelSize && { voxelSize: file.voxelSize }),
              lineage: {
                processType: 'split',
                inputs: [fileId],
                splitInfo: { part: 2, sliceRange: `${splitAt + 1}-${result.originalSliceCount}`, sliceCount: result.part2.sliceCount },
                processedAt: new Date().toISOString()
              }
            });

            // Delete original if requested
            if (deleteOriginal) {
              await workspaceService.deleteFile(sessionId, fileId);
            }

            // Log activity
            if (activityLogger) {
              activityLogger.logActivity(req.session.user.username, 'file_split', {
                sourceFileId: fileId,
                sourceName: file.name,
                splitAt,
                newFiles: [file1.id, file2.id],
                originalDeleted: deleteOriginal
              });
            }

            res.json({
              success: true,
              files: [file1, file2],
              originalDeleted: deleteOriginal
            });
          } catch (parseError) {
            if (logger) logger.error('Parse split result error:', parseError);
            res.status(500).json({ success: false, error: 'Failed to parse result' });
          }
        } else {
          const errorMsg = stdout.includes('ERROR:')
            ? stdout.replace('ERROR:', '').trim()
            : stderr || 'Split failed';
          if (logger) logger.error('Split error:', errorMsg);
          res.status(500).json({ success: false, error: errorMsg });
        }
      });

      pythonProcess.on('error', (err) => {
        if (logger) logger.error('Python process error:', err);
        res.status(500).json({ success: false, error: 'Failed to spawn Python process' });
      });

    } catch (error) {
      if (logger) logger.error('Split file error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===========================================================================
  // BATCH OPERATIONS
  // ===========================================================================

  /**
   * Batch delete files
   * POST /api/workspace/files/batch-delete
   */
  router.post('/files/batch-delete', requireAuth, async (req, res) => {
    try {
      const { fileIds } = req.body;
      const sessionId = req.session.id;

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, error: 'File IDs array required' });
      }

      const result = await workspaceService.deleteFiles(sessionId, fileIds);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'batch_delete',
          { count: result.deletedCount }
        );
      }

      res.json(result);
    } catch (error) {
      if (logger) {
        logger.error('Batch delete error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Batch download files as zip
   * POST /api/workspace/files/batch-download
   */
  router.post('/files/batch-download', requireAuth, async (req, res) => {
    try {
      const { fileIds } = req.body;
      const sessionId = req.session.id;

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, error: 'File IDs array required' });
      }

      const archive = archiver('zip', { zlib: { level: 9 } });

      // Set headers
      res.attachment('workspace_files.zip');
      archive.pipe(res);

      // Get file metadata
      const metadata = workspaceService.loadMetadata(sessionId);
      const files = metadata.files.filter(f => fileIds.includes(f.id));
      const workspacePath = workspaceService.getWorkspacePath(sessionId);

      // Add files to archive
      for (const file of files) {
        const filePath = path.join(workspacePath, file.path);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: file.name });
        }
      }

      await archive.finalize();

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'batch_download',
          { count: files.length }
        );
      }

    } catch (error) {
      if (logger) {
        logger.error('Batch download error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===========================================================================
  // SEARCH AND FILTER
  // ===========================================================================

  /**
   * Search files by name
   * GET /api/workspace/files/search
   */
  router.get('/files/search', requireAuth, async (req, res) => {
    try {
      const { q } = req.query;
      const sessionId = req.session.id;

      const files = await workspaceService.searchFiles(sessionId, q);

      res.json({ success: true, files });
    } catch (error) {
      if (logger) {
        logger.error('Search files error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Filter files by category
   * GET /api/workspace/files/category/:category
   */
  router.get('/files/category/:category', requireAuth, async (req, res) => {
    try {
      const { category } = req.params;
      const sessionId = req.session.id;

      const files = await workspaceService.getFilesByCategory(sessionId, category);

      res.json({ success: true, files });
    } catch (error) {
      if (logger) {
        logger.error('Filter files error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createFilesRoutes;
