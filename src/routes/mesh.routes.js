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
const { createLineage } = require('../helpers/lineageHelpers');

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
            let info;

            if (jsonMatch) {
              info = JSON.parse(jsonMatch[1]);
            } else {
              // Try parsing entire output as JSON
              info = JSON.parse(output.trim());
            }

            const sliceCount = info.sliceCount || 1;
            const width = info.width || 0;
            const height = info.height || 0;
            const classes = info.classes || [];
            const dtype = info.dtype || 'unknown';

            // Validate this is a segmentation/annotation file
            // Must have discrete integer classes (at least background + 1 object)
            const nonBackgroundClasses = classes.filter(c => c > 0);

            if (classes.length === 0) {
              return res.status(400).json({
                success: false,
                error: 'Invalid file: Could not detect class labels. This file does not appear to be a segmentation or annotation file.',
                validationError: 'no_classes'
              });
            }

            if (nonBackgroundClasses.length === 0) {
              return res.status(400).json({
                success: false,
                error: 'Invalid file: No object classes found (only background detected). Segmentation files must contain at least one labeled region.',
                validationError: 'only_background'
              });
            }

            // Check if this looks like continuous data rather than discrete labels
            // Segmentation files typically have few unique values (< 20)
            if (classes.length > 50) {
              return res.status(400).json({
                success: false,
                error: 'Invalid file: Too many unique values detected (' + classes.length + '). This appears to be raw image data rather than a segmentation file. Segmentation files should contain discrete class labels.',
                validationError: 'too_many_classes'
              });
            }

            // Check dtype - segmentation files are typically uint8 or uint16 integers
            const validDtypes = ['uint8', 'uint16', 'int8', 'int16', 'int32', 'uint32'];
            if (!validDtypes.some(d => dtype.toLowerCase().includes(d))) {
              return res.status(400).json({
                success: false,
                error: `Invalid file: Data type "${dtype}" is not typical for segmentation files. Expected integer type (uint8, uint16, etc.). This may be raw image data.`,
                validationError: 'invalid_dtype'
              });
            }

            res.json({
              success: true,
              info: {
                dimensions: [sliceCount, height, width],
                sliceCount: sliceCount,
                width: width,
                height: height,
                classes: classes,
                classCounts: info.class_counts || {},
                dtype: dtype,
                totalVoxels: sliceCount * width * height
              }
            });

          } catch (parseError) {
            if (logger) logger.error('Error parsing TIFF info:', parseError, output);
            res.status(400).json({
              success: false,
              error: 'Failed to read file. This may not be a valid TIFF image file.',
              validationError: 'parse_error'
            });
          }
        } else {
          if (logger) logger.error('TIFF info error:', errorOutput);
          // Provide more helpful error message
          let errorMessage = 'Failed to read file.';
          if (errorOutput.includes('not a valid TIFF') || errorOutput.includes('TiffFileError')) {
            errorMessage = 'Invalid file format. Please select a TIFF (.tif/.tiff) image file.';
          } else if (errorOutput.includes('Permission denied')) {
            errorMessage = 'Permission denied reading file.';
          }
          res.status(400).json({
            success: false,
            error: errorMessage,
            validationError: 'read_error'
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
      const { sourceFile, sourceFileId, outputFormats = ['json', 'obj'], targetClasses = 'all' } = req.body;

      // Z voxel aspect ratio relative to x/y (1.0 = symmetric). Clamp to a sane range.
      let zAspect = parseFloat(req.body.zAspect);
      if (!Number.isFinite(zAspect) || zAspect <= 0) {
        zAspect = 1.0;
      }
      zAspect = Math.min(Math.max(zAspect, 0.05), 20);

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
        moduleType: 'Mesh Generation',
        status: 'starting',
        startTime: new Date(),
        progress: 0,
        currentClass: 0,
        totalClasses: 0,
        sourcePath: sourcePath,
        outputDir: outputDir,
        outputFormats: outputFormats,
        zAspect: zAspect,
        result: null,
        error: null,
        // Lineage tracking: store source file ID for provenance
        sourceFileId: sourceFileId || null
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
        startMeshGeneration(meshId, sourcePath, outputDir, outputFormats, targetClasses, zAspect);
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
  function startMeshGeneration(meshId, sourcePath, outputDir, outputFormats, targetClasses, zAspect = 1.0) {
    const { spawn } = require('child_process');

    const meshSession = sessionTracker.meshSessions.get(meshId);
    if (!meshSession) return;

    meshSession.status = 'processing';

    const args = [
      'python/generate_mesh.py',
      '--input', sourcePath,
      '--output_dir', outputDir,
      '--mesh_id', meshId,
      '--formats', outputFormats.join(','),
      // Voxel spacing z,y,x: x/y fixed at 1, z carries the chosen aspect ratio
      '--spacing', `${zAspect},1,1`
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

            // Keep workspace fresh during mesh generation
            if (workspaceManager) {
              workspaceManager.touchWorkspace(meshSession.sessionId);
            }

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

              // Track output files in workspace metadata with lineage
              trackMeshOutputs(meshSession.sessionId, outputDir, result, meshSession.sourceFileId, meshId);

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
   * Track mesh output files in workspace metadata with lineage
   * @param {string} sessionId - Session ID
   * @param {string} outputDir - Output directory path
   * @param {object} result - Mesh generation result
   * @param {string|null} sourceFileId - Source file ID for lineage tracking
   * @param {string} meshId - Mesh generation ID
   */
  async function trackMeshOutputs(sessionId, outputDir, result, sourceFileId, meshId) {
    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Build lineage if source file ID is provided
      let lineage = null;
      if (sourceFileId) {
        try {
          lineage = createLineage('meshGeneration', [sourceFileId], meshId);
          if (logger) logger.debug('[Mesh] Built lineage:', lineage);
        } catch (e) {
          if (logger) logger.error('[Mesh] Failed to build lineage:', e.message);
        }
      }

      // Track each output file
      // New metadata system: results category with mesh/data or mesh/info tags
      // Format tag (json, obj, mtl, stl) added for filtering in visualization module
      const filesToTrack = [
        { name: 'mesh_data.json', tags: ['mesh', 'data', 'json'] },
        { name: 'mesh.obj', tags: ['mesh', 'data', 'obj'] },
        { name: 'mesh.mtl', tags: ['mesh', 'data', 'mtl'] },
        { name: 'mesh.stl', tags: ['mesh', 'data', 'stl'] },
        { name: 'metadata.json', tags: ['mesh', 'info'] }
      ];

      for (const file of filesToTrack) {
        const filePath = path.join(outputDir, file.name);
        if (fs.existsSync(filePath)) {
          const relativePath = path.relative(workspacePath, filePath);
          const stats = fs.statSync(filePath);

          workspaceManager.addFileToMetadata(sessionId, {
            name: file.name,
            path: relativePath,
            category: 'results',
            tags: file.tags,
            size: stats.size,
            folderId: null,
            // Include lineage if available
            ...(lineage && { lineage })
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
