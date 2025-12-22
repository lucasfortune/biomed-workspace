/**
 * Mesh Generation Routes
 *
 * Handles surface mesh generation from segmented TIFF stacks:
 * - List available segmentation sources
 * - Get TIFF metadata and previews
 * - Start mesh generation
 * - Check generation status
 * - Download generated meshes
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');
const { requireAuth } = require('../middleware/auth.middleware');
const { PYTHON_PATH } = require('../config/constants');

/**
 * Create mesh routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.sessionTracker - SessionTracker instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @param {object} dependencies.io - Socket.IO instance
 * @param {function} dependencies.upload - Multer upload middleware
 * @returns {Router} Express router
 */
function createMeshRoutes(dependencies) {
  const router = express.Router();
  const {
    workspaceManager,
    sessionTracker,
    activityLogger,
    logger,
    io,
    upload
  } = dependencies;

  // ===========================================================================
  // GET AVAILABLE SOURCES
  // ===========================================================================

  /**
   * Get available segmentation sources (results + annotations)
   * GET /api/mesh/sources
   */
  router.get('/sources', requireAuth, async (req, res) => {
    try {
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Get workspace files metadata
      const metadata = workspaceManager.loadMetadata(sessionId);
      const files = metadata?.files || [];

      // Filter for segmentation results and annotations
      const recentResults = [];
      const annotationFiles = [];

      for (const file of files) {
        if (file.category === 'segmentations' || file.category === 'segmented_stack') {
          // Check if file exists
          const fullPath = path.join(workspacePath, file.path);
          if (fs.existsSync(fullPath)) {
            recentResults.push({
              id: file.id,
              name: file.name,
              path: file.path,
              category: file.category,
              type: 'segmentation_result',
              timestamp: file.createdAt || file.uploadedAt,
              size: file.size
            });
          }
        } else if (file.category === 'annotations') {
          const fullPath = path.join(workspacePath, file.path);
          if (fs.existsSync(fullPath)) {
            annotationFiles.push({
              id: file.id,
              name: file.name,
              path: file.path,
              category: file.category,
              type: 'annotation',
              timestamp: file.createdAt || file.uploadedAt,
              size: file.size
            });
          }
        }
      }

      res.json({
        success: true,
        sources: {
          recentResults,
          annotationFiles
        }
      });

    } catch (error) {
      if (logger) logger.error('Error getting mesh sources:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // GET TIFF INFO
  // ===========================================================================

  /**
   * Get TIFF stack metadata (dimensions, classes, etc.)
   * GET /api/mesh/info/:fileId
   */
  router.get('/info/:fileId', requireAuth, async (req, res) => {
    const { spawn } = require('child_process');

    try {
      const fileId = decodeURIComponent(req.params.fileId);
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Resolve file path
      let filePath;
      if (path.isAbsolute(fileId)) {
        filePath = fileId;
      } else {
        // Check if it's a file ID or a path
        const metadata = workspaceManager.loadMetadata(sessionId);
        const file = metadata?.files?.find(f => f.id === fileId);

        if (file) {
          filePath = path.join(workspacePath, file.path);
        } else {
          // Assume it's a relative path
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

      // Use Python script to get TIFF info
      // Note: extract_slice.py --info provides basic info
      // Class detection will be enhanced in Phase 3
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/extract_slice.py',
        filePath,
        '--info'
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
        if (code === 0) {
          try {
            // Parse output - look for INFO: prefix
            const jsonMatch = output.match(/INFO:(.*)/);
            if (jsonMatch) {
              const info = JSON.parse(jsonMatch[1]);

              // extract_slice.py returns: sliceCount, width, height, dtype
              // We construct dimensions array and add placeholder classes
              // Full class detection will be added in Phase 3
              const sliceCount = info.sliceCount || 1;
              const width = info.width || 0;
              const height = info.height || 0;

              res.json({
                success: true,
                info: {
                  dimensions: [sliceCount, height, width],
                  sliceCount: sliceCount,
                  width: width,
                  height: height,
                  classes: info.classes || [0, 1, 2], // Placeholder until Phase 3
                  classCounts: info.class_counts || {},
                  dtype: info.dtype || 'uint8',
                  totalVoxels: sliceCount * width * height
                }
              });
            } else {
              // Try parsing entire output as JSON
              const info = JSON.parse(output.trim());
              const sliceCount = info.sliceCount || 1;
              const width = info.width || 0;
              const height = info.height || 0;

              res.json({
                success: true,
                info: {
                  dimensions: [sliceCount, height, width],
                  sliceCount: sliceCount,
                  width: width,
                  height: height,
                  classes: info.classes || [0, 1, 2],
                  classCounts: info.class_counts || {},
                  dtype: info.dtype || 'uint8',
                  totalVoxels: sliceCount * width * height
                }
              });
            }
          } catch (parseError) {
            if (logger) logger.error('Error parsing TIFF info:', parseError, output);
            res.status(500).json({
              success: false,
              error: 'Failed to parse TIFF info'
            });
          }
        } else {
          if (logger) logger.error('TIFF info error:', errorOutput);
          res.status(500).json({
            success: false,
            error: errorOutput || 'Failed to get TIFF info'
          });
        }
      });

    } catch (error) {
      if (logger) logger.error('Error getting TIFF info:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // GET PREVIEW IMAGE
  // ===========================================================================

  /**
   * Get preview image for a specific slice
   * GET /api/mesh/preview/:fileId/:sliceIndex
   */
  router.get('/preview/:fileId/:sliceIndex', requireAuth, async (req, res) => {
    const { spawn } = require('child_process');

    try {
      const fileId = decodeURIComponent(req.params.fileId);
      const sliceIndex = parseInt(req.params.sliceIndex, 10);
      const size = req.query.size || 'gallery';
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Resolve file path
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
          error: 'File not found'
        });
      }

      // Create cache directory
      const cacheDir = path.join(workspacePath, '.mesh-previews');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      // Generate cache filename
      const fileHash = Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_').substring(0, 32);
      const cacheFilename = `${fileHash}_${sliceIndex}_${size}.jpg`;
      const cachePath = path.join(cacheDir, cacheFilename);

      // Check cache
      if (fs.existsSync(cachePath)) {
        return res.sendFile(path.resolve(cachePath));
      }

      // Extract slice using Python
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
        if (code === 0 && fs.existsSync(cachePath)) {
          res.sendFile(path.resolve(cachePath));
        } else {
          if (logger) logger.error('Preview extraction error:', errorOutput || output);
          res.status(500).json({
            success: false,
            error: 'Failed to extract preview'
          });
        }
      });

    } catch (error) {
      if (logger) logger.error('Error getting preview:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // START MESH GENERATION
  // ===========================================================================

  /**
   * Start mesh generation
   * POST /api/mesh/generate
   */
  router.post('/generate', requireAuth, async (req, res) => {
    const { spawn } = require('child_process');

    try {
      const { sourceFile, outputFormats = ['json', 'obj'], targetClasses = 'all' } = req.body;
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      if (!sourceFile) {
        return res.status(400).json({
          success: false,
          error: 'Source file is required'
        });
      }

      // Resolve source file path
      let sourcePath;
      if (path.isAbsolute(sourceFile)) {
        sourcePath = sourceFile;
      } else {
        const metadata = workspaceManager.loadMetadata(sessionId);
        const file = metadata?.files?.find(f => f.id === sourceFile);

        if (file) {
          sourcePath = path.join(workspacePath, file.path);
        } else {
          sourcePath = path.join(workspacePath, sourceFile);
        }
      }

      if (!fs.existsSync(sourcePath)) {
        return res.status(404).json({
          success: false,
          error: 'Source file not found',
          path: sourceFile
        });
      }

      // Generate mesh ID
      const meshId = `mesh_${Date.now()}_${uuid.v4().substring(0, 8)}`;

      // Create output directory
      const outputDir = path.join(workspacePath, 'results', 'meshes', meshId);
      fs.mkdirSync(outputDir, { recursive: true });

      // Store mesh session
      sessionTracker.meshSessions.set(meshId, {
        sessionId: sessionId,
        username: req.session.user?.username,
        status: 'starting',
        startTime: new Date(),
        progress: 0,
        currentClass: 0,
        totalClasses: 0,
        sourcePath: sourcePath,
        outputDir: outputDir,
        outputFormats: outputFormats,
        result: null,
        error: null
      });

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user?.username,
          'mesh_generation_start',
          { meshId, sourceFile }
        );
      }

      // Send response immediately
      res.json({
        success: true,
        meshId: meshId,
        message: 'Mesh generation started'
      });

      // Start mesh generation process after delay (allow client to join room)
      setTimeout(() => {
        startMeshGeneration(meshId, sourcePath, outputDir, outputFormats, targetClasses);
      }, 1000);

    } catch (error) {
      if (logger) logger.error('Error starting mesh generation:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Start mesh generation Python process
   */
  function startMeshGeneration(meshId, sourcePath, outputDir, outputFormats, targetClasses) {
    const { spawn } = require('child_process');

    const meshSession = sessionTracker.meshSessions.get(meshId);
    if (!meshSession) return;

    meshSession.status = 'processing';

    const args = [
      'python/generate_mesh.py',
      '--input', sourcePath,
      '--output_dir', outputDir,
      '--mesh_id', meshId,
      '--formats', outputFormats.join(',')
    ];

    if (targetClasses !== 'all') {
      args.push('--classes', Array.isArray(targetClasses) ? targetClasses.join(',') : targetClasses);
    }

    if (logger) logger.info('Starting mesh generation:', args.join(' '));

    const pythonProcess = spawn(PYTHON_PATH, args);

    let lastProgressUpdate = 0;

    pythonProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');

      for (const line of lines) {
        if (line.startsWith('MESH_PROGRESS:')) {
          try {
            const progress = JSON.parse(line.replace('MESH_PROGRESS:', ''));

            // Update session
            meshSession.progress = progress.progress_percent;
            meshSession.currentClass = progress.class;
            meshSession.totalClasses = progress.total_classes;

            // Emit progress to clients
            io.to(`mesh-${meshId}`).emit('mesh-progress', {
              mesh_id: meshId,
              ...progress
            });

            lastProgressUpdate = Date.now();
          } catch (e) {
            if (logger) logger.error('Error parsing mesh progress:', e);
          }
        } else if (line.startsWith('MESH_RESULT:')) {
          try {
            const result = JSON.parse(line.replace('MESH_RESULT:', ''));

            if (result.success) {
              meshSession.status = 'completed';
              meshSession.endTime = new Date();
              meshSession.result = result;

              // Track output files in workspace metadata
              trackMeshOutputs(meshSession.sessionId, outputDir, result);

              // Emit completion
              io.to(`mesh-${meshId}`).emit('mesh-complete', {
                mesh_id: meshId,
                ...result
              });

              if (activityLogger) {
                activityLogger.logActivity(
                  meshSession.username,
                  'mesh_generation_complete',
                  { meshId, outputDir }
                );
              }
            } else {
              meshSession.status = 'failed';
              meshSession.error = result.error;

              io.to(`mesh-${meshId}`).emit('mesh-error', {
                mesh_id: meshId,
                error: result.error
              });
            }
          } catch (e) {
            if (logger) logger.error('Error parsing mesh result:', e);
          }
        } else if (line.trim()) {
          if (logger) logger.debug('[Mesh]', line);
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      if (logger) logger.error('[Mesh stderr]', data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0 && meshSession.status !== 'completed') {
        meshSession.status = 'failed';
        meshSession.error = `Process exited with code ${code}`;

        io.to(`mesh-${meshId}`).emit('mesh-error', {
          mesh_id: meshId,
          error: meshSession.error
        });
      }

      if (logger) logger.info(`Mesh generation process exited with code ${code}`);
    });
  }

  /**
   * Track mesh output files in workspace metadata
   */
  async function trackMeshOutputs(sessionId, outputDir, result) {
    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Track each output file
      const filesToTrack = ['mesh_data.json', 'mesh.obj', 'mesh.mtl', 'mesh.stl', 'metadata.json'];

      for (const filename of filesToTrack) {
        const filePath = path.join(outputDir, filename);
        if (fs.existsSync(filePath)) {
          const relativePath = path.relative(workspacePath, filePath);
          const stats = fs.statSync(filePath);

          workspaceManager.addFileToMetadata(sessionId, {
            name: filename,
            path: relativePath,
            category: 'meshes',
            size: stats.size,
            folderId: null
          });
        }
      }
    } catch (error) {
      if (logger) logger.error('Error tracking mesh outputs:', error);
    }
  }

  // ===========================================================================
  // GET MESH STATUS
  // ===========================================================================

  /**
   * Check mesh generation status
   * GET /api/mesh/status/:meshId
   */
  router.get('/status/:meshId', requireAuth, (req, res) => {
    const meshId = req.params.meshId;
    const meshSession = sessionTracker.meshSessions.get(meshId);

    if (!meshSession) {
      return res.status(404).json({
        success: false,
        error: 'Mesh session not found'
      });
    }

    res.json({
      success: true,
      status: meshSession.status,
      progress: meshSession.progress,
      currentClass: meshSession.currentClass,
      totalClasses: meshSession.totalClasses,
      result: meshSession.result,
      error: meshSession.error
    });
  });

  // ===========================================================================
  // DOWNLOAD MESH
  // ===========================================================================

  /**
   * Download generated mesh file
   * GET /api/mesh/download/:meshId/:format
   */
  router.get('/download/:meshId/:format', requireAuth, (req, res) => {
    const { meshId, format } = req.params;
    const meshSession = sessionTracker.meshSessions.get(meshId);

    if (!meshSession) {
      return res.status(404).json({
        success: false,
        error: 'Mesh session not found'
      });
    }

    if (meshSession.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Mesh generation not completed'
      });
    }

    // Determine filename based on format
    let filename;
    switch (format.toLowerCase()) {
      case 'json':
        filename = 'mesh_data.json';
        break;
      case 'obj':
        filename = 'mesh.obj';
        break;
      case 'stl':
        filename = 'mesh.stl';
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown format: ${format}`
        });
    }

    const filePath = path.join(meshSession.outputDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: `${format.toUpperCase()} file not found`
      });
    }

    // Set download headers
    res.download(filePath, `${meshId}_${filename}`);
  });

  return router;
}

module.exports = createMeshRoutes;
