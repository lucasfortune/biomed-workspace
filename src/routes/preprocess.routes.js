/**
 * Preprocess Routes (ADR-008)
 *
 * Stack preprocessing: crop / z-trim / flip / rotate / downscale /
 * intensity adjustment / dtype conversion. Mounted at /api/preprocess.
 *
 * Endpoints:
 *   GET  /info     - stack info + sampled intensity histogram (sync)
 *   POST /preview  - one slice with intensity ops applied, as JPEG (sync)
 *   POST /apply    - full run (async job, Socket.IO room preprocess-<id>)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth.middleware');
const { PYTHON_PATH, DATA_PATHS } = require('../config/constants');
const { createLineage } = require('../helpers/lineageHelpers');
const { buildDisplayName } = require('../helpers/namingHelpers');
const sessionTracker = require('../services/SessionTracker');

function createPreprocessRoutes(dependencies) {
  const router = express.Router();
  const { workspaceManager, activityLogger, logger, io } = dependencies;

  /**
   * Resolve a workspace-relative path to absolute and verify it stays
   * inside the workspaces directory.
   */
  function resolveWorkspacePath(workspacePath, p) {
    const absolute = path.isAbsolute(p) ? p : path.join(workspacePath, p);
    const normalized = path.normalize(absolute);
    if (!normalized.startsWith(path.normalize(DATA_PATHS.workspaces))) {
      throw new Error('Access denied: path outside workspaces');
    }
    return normalized;
  }

  /** Find a payload line like PREPROCESS_INFO:{...} in the stdout buffer */
  function findPayload(stdout, prefix) {
    const line = stdout.split('\n').find(l => l.startsWith(`${prefix}:`));
    if (!line) return null;
    try {
      return JSON.parse(line.substring(prefix.length + 1));
    } catch (e) {
      return null;
    }
  }

  function errorMessage(stdout, stderr, fallback) {
    const err = findPayload(stdout, 'PREPROCESS_ERROR');
    if (err && err.message) return err.message;
    if (stderr) return stderr.split('\n').slice(-3).join(' ').trim() || fallback;
    return fallback;
  }

  /**
   * Stack info + sampled intensity histogram
   * GET /api/preprocess/info?path=<workspace-relative tiff>
   */
  router.get('/info', requireAuth, async (req, res) => {
    const { path: fileReq } = req.query;
    const sessionId = req.session.id;

    if (!fileReq) {
      return res.status(400).json({ success: false, error: 'path is required' });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const absolute = resolveWorkspacePath(workspacePath, fileReq);
      if (!fs.existsSync(absolute)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      const proc = spawn(PYTHON_PATH, [
        'python/preprocess_stack.py', '--mode', 'info', '--input', absolute
      ]);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const info = findPayload(stdout, 'PREPROCESS_INFO');
        if (code === 0 && info) {
          return res.json({ success: true, ...info });
        }
        const message = errorMessage(stdout, stderr, 'Could not read stack info');
        if (logger) logger.error('[Preprocess] Info failed:', message);
        res.status(500).json({ success: false, error: message });
      });
      proc.on('error', (err) => {
        res.status(500).json({ success: false, error: `Failed to spawn process: ${err.message}` });
      });
    } catch (error) {
      if (logger) logger.error('[Preprocess] Info error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Preview one slice with the intensity ops applied
   * POST /api/preprocess/preview
   * Body: { path, slice, ops }
   * Responds with the JPEG image directly (no caching - ops change live).
   */
  router.post('/preview', requireAuth, async (req, res) => {
    const { path: fileReq, slice = 0, ops = {} } = req.body;
    const sessionId = req.session.id;

    if (!fileReq) {
      return res.status(400).json({ success: false, error: 'path is required' });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const absolute = resolveWorkspacePath(workspacePath, fileReq);
      if (!fs.existsSync(absolute)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      const previewDir = path.join(workspacePath, '.preprocess');
      await fsp.mkdir(previewDir, { recursive: true });
      const previewPath = path.join(previewDir,
        `preview_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.jpg`);

      const proc = spawn(PYTHON_PATH, [
        'python/preprocess_stack.py', '--mode', 'preview',
        '--input', absolute,
        '--slice', String(parseInt(slice, 10) || 0),
        '--ops', JSON.stringify(ops),
        '--output', previewPath,
        '--size', '768'
      ]);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        const result = findPayload(stdout, 'PREPROCESS_RESULT');
        if (code === 0 && result && fs.existsSync(previewPath)) {
          res.set('Cache-Control', 'no-store');
          res.set('X-Source-Width', String(result.sourceWidth));
          res.set('X-Source-Height', String(result.sourceHeight));
          return res.sendFile(previewPath, () => {
            fsp.unlink(previewPath).catch(() => {});
          });
        }
        const message = errorMessage(stdout, stderr, 'Preview failed');
        if (logger) logger.error('[Preprocess] Preview failed:', message);
        res.status(500).json({ success: false, error: message });
      });
      proc.on('error', (err) => {
        res.status(500).json({ success: false, error: `Failed to spawn process: ${err.message}` });
      });
    } catch (error) {
      if (logger) logger.error('[Preprocess] Preview error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Apply the preprocessing pipeline to the full stack
   * POST /api/preprocess/apply
   * Body: { path, ops, outputName }
   *
   * Async: returns { preprocessId }; progress arrives in Socket.IO room
   * `preprocess-<id>` as preprocess-progress / preprocess-complete /
   * preprocess-error events.
   */
  router.post('/apply', requireAuth, async (req, res) => {
    const { path: fileReq, ops = {}, outputName } = req.body;
    const sessionId = req.session.id;

    if (!fileReq) {
      return res.status(400).json({ success: false, error: 'path is required' });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const absolute = resolveWorkspacePath(workspacePath, fileReq);
      if (!fs.existsSync(absolute)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      const metadata = workspaceManager.loadMetadata(sessionId);
      const relInput = path.relative(workspacePath, absolute);
      const inputFile = metadata?.files?.find(f => f.path === relInput);

      const preprocessId = `pp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      // Registry entry: socket-room ownership checks + cleanup guard
      sessionTracker.registerJob(preprocessId, sessionId, 'preprocess');
      const outputDir = path.join(workspacePath, 'results', 'preprocess', preprocessId);
      await fsp.mkdir(outputDir, { recursive: true });

      const safeName = (outputName || 'preprocessed')
        .replace(/[^\w.-]/g, '_').replace(/\.tiff?$/i, '');
      const outputPath = path.join(outputDir, `${safeName}.tif`);

      const config = { ...ops, input_path: absolute, output_path: outputPath };
      const configPath = path.join(outputDir, `preprocess_config_${preprocessId}.json`);
      await fsp.writeFile(configPath, JSON.stringify(config, null, 2));

      const roomName = `preprocess-${preprocessId}`;
      const proc = spawn(PYTHON_PATH, [
        'python/preprocess_stack.py', '--mode', 'apply', '--config', configPath
      ]);

      let outputBuffer = '';
      let stderrBuffer = '';
      let resultData = null;

      proc.stdout.on('data', (data) => {
        outputBuffer += data.toString();
        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('PREPROCESS_PROGRESS:')) {
            try {
              io.to(roomName).emit('preprocess-progress', JSON.parse(line.substring(20)));
            } catch (e) { /* ignore parse errors */ }
          } else if (line.startsWith('PREPROCESS_RESULT:')) {
            try {
              resultData = JSON.parse(line.substring(18));
            } catch (e) { /* ignore parse errors */ }
          } else if (line.startsWith('PREPROCESS_ERROR:')) {
            try {
              io.to(roomName).emit('preprocess-error', JSON.parse(line.substring(17)));
            } catch (e) { /* ignore parse errors */ }
          }
        }
      });

      proc.stderr.on('data', (d) => { stderrBuffer += d.toString(); });

      proc.on('close', (code) => {
        sessionTracker.completeJob(preprocessId, code === 0 ? 'completed' : 'failed');

        // The config is the run manifest (applied ops: crop/flip/rotate/
        // downscale/gamma) - kept and tracked on success, discarded on failure
        if (code !== 0 || !resultData) {
          fsp.unlink(configPath).catch(() => {});
        }

        if (code === 0 && resultData) {
          let outputFileId = null;
          try {
            const lineage = inputFile
              ? createLineage('preprocess', [inputFile.id], preprocessId)
              : null;
            // Crop origin recorded for stitch-recipe prefill (ADR-007/008)
            if (lineage && (resultData.crop || resultData.z_range)) {
              lineage.cropInfo = {
                x: resultData.crop ? resultData.crop.x : 0,
                y: resultData.crop ? resultData.crop.y : 0,
                z: resultData.z_range ? resultData.z_range[0] : 0
              };
            }

            // Voxel size: xy scales with the downscale factor
            let voxelSize = inputFile?.voxelSize || null;
            if (voxelSize && resultData.downscale > 1) {
              voxelSize = {
                ...voxelSize,
                x: voxelSize.x * resultData.downscale,
                y: voxelSize.y * resultData.downscale
              };
            }

            const stats = fs.statSync(outputPath);
            const outputEntry = workspaceManager.addFileToMetadata(sessionId, {
              name: path.basename(outputPath),
              path: path.relative(workspacePath, outputPath),
              category: 'results',
              tags: ['preprocess', 'raw', 'data'],
              size: stats.size,
              folderId: null,
              ...(inputFile && {
                displayName: buildDisplayName({
                  sourceName: inputFile.displayName || inputFile.name,
                  operation: 'preprocess',
                  ext: path.extname(outputPath)
                })
              }),
              ...(voxelSize && { voxelSize }),
              ...(lineage && { lineage })
            });
            outputFileId = outputEntry?.id || null;

            // Track the run manifest like every other module's info file (B7)
            if (fs.existsSync(configPath)) {
              workspaceManager.addFileToMetadata(sessionId, {
                name: path.basename(configPath),
                path: path.relative(workspacePath, configPath),
                category: 'results',
                tags: ['preprocess', 'info'],
                size: fs.statSync(configPath).size,
                folderId: null,
                ...(inputFile && {
                  displayName: buildDisplayName({
                    sourceName: inputFile.displayName || inputFile.name,
                    operation: 'preprocess',
                    ext: '.json',
                    qualifier: 'config'
                  })
                }),
                ...(lineage && { lineage: { ...lineage } })
              });
            }
          } catch (trackError) {
            if (logger) logger.error('[Preprocess] Error tracking output:', trackError);
          }

          io.to(roomName).emit('preprocess-complete', {
            success: true,
            preprocessId,
            outputPath: path.relative(workspacePath, outputPath),
            outputFileId,
            slices: resultData.slices,
            width: resultData.width,
            height: resultData.height,
            dtype: resultData.dtype
          });

          if (activityLogger && req.session.user) {
            activityLogger.logActivity(req.session.user.username, 'preprocess_apply', {
              preprocessId,
              input: relInput,
              downscale: resultData.downscale,
              dtype: resultData.dtype
            });
          }
        } else {
          io.to(roomName).emit('preprocess-complete', {
            success: false,
            preprocessId,
            error: errorMessage('', stderrBuffer, 'Preprocessing failed'),
            details: stderrBuffer
          });
          if (logger) logger.error(`[Preprocess] Apply failed (${preprocessId}):`, stderrBuffer);
        }
      });

      proc.on('error', (err) => {
        io.to(roomName).emit('preprocess-error', { message: `Failed to spawn process: ${err.message}` });
      });

      res.json({
        success: true,
        preprocessId,
        message: 'Preprocessing started. Join Socket.IO room for progress updates.'
      });
    } catch (error) {
      if (logger) logger.error('[Preprocess] Apply error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createPreprocessRoutes;
