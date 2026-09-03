/**
 * Segmentation Cleanup Routes (ADR-009)
 *
 * Automated cleanup, manual touch-up saving and quantification for
 * segmentation stacks. Mounted at /api/segcleanup.
 *
 * Endpoints:
 *   GET  /info        - classes + counts + shape (sync)
 *   POST /preview     - one slice with cleanup ops applied, as PNG (sync)
 *   GET  /label-slice - raw label values of one slice as L-mode PNG (sync)
 *   POST /apply       - full cleanup pipeline + quantification (async job)
 *   POST /quantify    - quantification only (async job)
 *   POST /save-edits  - write manually edited slices into a new stack (async job)
 *   POST /report      - register a job's report CSVs in the file browser
 *
 * Async jobs emit segcleanup-progress / segcleanup-complete /
 * segcleanup-error into Socket.IO room `segcleanup-<jobId>`.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth.middleware');
const { PYTHON_PATH, DATA_PATHS } = require('../config/constants');
const { createLineage } = require('../helpers/lineageHelpers');

function createSegcleanupRoutes(dependencies) {
  const router = express.Router();
  const { workspaceManager, activityLogger, logger, io } = dependencies;

  function resolveWorkspacePath(workspacePath, p) {
    const absolute = path.isAbsolute(p) ? p : path.join(workspacePath, p);
    const normalized = path.normalize(absolute);
    if (!normalized.startsWith(path.normalize(DATA_PATHS.workspaces))) {
      throw new Error('Access denied: path outside workspaces');
    }
    return normalized;
  }

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
    const err = findPayload(stdout, 'SEGCLEANUP_ERROR');
    if (err && err.message) return err.message;
    if (stderr) return stderr.split('\n').slice(-3).join(' ').trim() || fallback;
    return fallback;
  }

  /** Spawn a synchronous (request-scoped) segcleanup.py call */
  function runSync(args, res, onSuccess, failMessage) {
    const proc = spawn(PYTHON_PATH, ['python/segcleanup.py', ...args]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) return onSuccess(stdout);
      const message = errorMessage(stdout, stderr, failMessage);
      if (logger) logger.error(`[Segcleanup] ${failMessage}:`, message);
      res.status(500).json({ success: false, error: message });
    });
    proc.on('error', (err) => {
      res.status(500).json({ success: false, error: `Failed to spawn process: ${err.message}` });
    });
  }

  /**
   * Run an async job process; wires stdout protocol lines into the
   * Socket.IO room and calls done(resultData|null, stderr) on close.
   */
  function runJob(args, roomName, done) {
    const proc = spawn(PYTHON_PATH, ['python/segcleanup.py', ...args]);
    let buffer = '';
    let stderrBuffer = '';
    let resultData = null;

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('SEGCLEANUP_PROGRESS:')) {
          try {
            io.to(roomName).emit('segcleanup-progress', JSON.parse(line.substring(20)));
          } catch (e) { /* ignore parse errors */ }
        } else if (line.startsWith('SEGCLEANUP_RESULT:')) {
          try {
            resultData = JSON.parse(line.substring(18));
          } catch (e) { /* ignore parse errors */ }
        } else if (line.startsWith('SEGCLEANUP_ERROR:')) {
          try {
            io.to(roomName).emit('segcleanup-error', JSON.parse(line.substring(17)));
          } catch (e) { /* ignore parse errors */ }
        }
      }
    });
    proc.stderr.on('data', (d) => { stderrBuffer += d.toString(); });
    proc.on('close', () => done(resultData, stderrBuffer));
    proc.on('error', (err) => {
      io.to(roomName).emit('segcleanup-error', { message: `Failed to spawn process: ${err.message}` });
    });
  }

  /** Track a produced label stack in metadata; returns the entry or null */
  function trackOutput(sessionId, workspacePath, outputPath, inputFile, jobId) {
    try {
      const stats = fs.statSync(outputPath);
      const lineage = inputFile
        ? createLineage('segcleanup', [inputFile.id], jobId)
        : null;
      return workspaceManager.addFileToMetadata(sessionId, {
        name: path.basename(outputPath),
        path: path.relative(workspacePath, outputPath),
        category: 'results',
        tags: ['segcleanup', 'segmentation', 'data'],
        size: stats.size,
        folderId: null,
        ...(inputFile?.voxelSize && { voxelSize: inputFile.voxelSize }),
        ...(lineage && { lineage })
      });
    } catch (e) {
      if (logger) logger.error('[Segcleanup] Error tracking output:', e);
      return null;
    }
  }

  function lookupFile(sessionId, workspacePath, absolute) {
    const metadata = workspaceManager.loadMetadata(sessionId);
    const rel = path.relative(workspacePath, absolute);
    return metadata?.files?.find(f => f.path === rel) || null;
  }

  /**
   * Classes + counts + shape
   * GET /api/segcleanup/info?path=<workspace-relative tiff>
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
      runSync(['--mode', 'info', '--input', absolute], res, (stdout) => {
        const info = findPayload(stdout, 'SEGCLEANUP_INFO');
        if (!info) return res.status(500).json({ success: false, error: 'Could not read stack info' });
        res.json({ success: true, ...info });
      }, 'Info failed');
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Preview one slice with ops applied (2D approximation), colored PNG
   * POST /api/segcleanup/preview
   * Body: { path, slice, ops, underlayPath }
   */
  router.post('/preview', requireAuth, async (req, res) => {
    const { path: fileReq, slice = 0, ops = {}, underlayPath } = req.body;
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

      const previewDir = path.join(workspacePath, '.segcleanup');
      await fsp.mkdir(previewDir, { recursive: true });
      const previewPath = path.join(previewDir,
        `preview_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.png`);

      const args = ['--mode', 'preview', '--input', absolute,
        '--slice', String(parseInt(slice, 10) || 0),
        '--ops', JSON.stringify(ops), '--output', previewPath];
      if (underlayPath) {
        const absUnderlay = resolveWorkspacePath(workspacePath, underlayPath);
        if (fs.existsSync(absUnderlay)) args.push('--underlay', absUnderlay);
      }

      runSync(args, res, () => {
        if (!fs.existsSync(previewPath)) {
          return res.status(500).json({ success: false, error: 'Preview failed' });
        }
        res.set('Cache-Control', 'no-store');
        res.sendFile(previewPath, () => {
          fsp.unlink(previewPath).catch(() => {});
        });
      }, 'Preview failed');
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Raw label values of one slice as L-mode PNG (for the touch-up editor)
   * GET /api/segcleanup/label-slice?path=<rel>&slice=<n>
   */
  router.get('/label-slice', requireAuth, async (req, res) => {
    const { path: fileReq, slice = 0 } = req.query;
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

      const cacheDir = path.join(workspacePath, '.segcleanup');
      await fsp.mkdir(cacheDir, { recursive: true });
      const outPath = path.join(cacheDir,
        `label_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.png`);

      runSync(['--mode', 'label-slice', '--input', absolute,
        '--slice', String(parseInt(slice, 10) || 0), '--output', outPath],
      res, () => {
        // Label files are immutable -> browser-cacheable
        res.set('Cache-Control', 'private, max-age=86400');
        res.sendFile(outPath, () => {
          fsp.unlink(outPath).catch(() => {});
        });
      }, 'Label slice failed');
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /** True when a path is one of this module's working copies */
  function isWorkingCopy(absolute) {
    return absolute.includes(`${path.sep}.segcleanup${path.sep}`);
  }

  /** Remove a superseded working-copy job dir (best effort) */
  function cleanupWorkingCopy(absolute) {
    if (!isWorkingCopy(absolute)) return;
    fsp.rm(path.dirname(absolute), { recursive: true, force: true }).catch(() => {});
  }

  /**
   * Remove this module's job dirs (work_* and quant_*) under the workspace's
   * .segcleanup/ cache, keeping `keep` (absolute path) if given. The preview
   * cache files in the same dir are left alone. Best effort.
   */
  async function sweepJobDirs(workspacePath, { keep = null, prefixes = ['work_', 'quant_'] } = {}) {
    const root = path.join(workspacePath, '.segcleanup');
    let entries = [];
    try { entries = await fsp.readdir(root); } catch (e) { return; }
    await Promise.all(entries
      .filter(name => prefixes.some(p => name.startsWith(p)))
      .map(name => path.join(root, name))
      .filter(dir => dir !== keep)
      .map(dir => fsp.rm(dir, { recursive: true, force: true }).catch(() => {})));
  }

  /**
   * Run the cleanup pipeline (incl. pending paint edits) into a NEW
   * WORKING COPY and quantify the result. The working copy lives under
   * the workspace's .segcleanup/ cache dir and is not tracked; the final
   * tracked output is produced by /save-edits.
   *
   * POST /api/segcleanup/apply
   * Body: { path, ops, edits, sourceFileId }
   *   - path: current editing source (original file or a working copy)
   *   - sourceFileId: the ORIGINAL tracked file (voxel size lookup)
   */
  router.post('/apply', requireAuth, async (req, res) => {
    const { path: fileReq, ops = {}, edits = {}, sourceFileId } = req.body;
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
      const sourceFile = metadata?.files?.find(f => f.id === sourceFileId)
        || lookupFile(sessionId, workspacePath, absolute);

      const jobId = `sc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const workDir = path.join(workspacePath, '.segcleanup', `work_${jobId}`);
      await fsp.mkdir(workDir, { recursive: true });
      const outputPath = path.join(workDir, 'working.tif');

      const config = {
        input_path: absolute,
        output_path: outputPath,
        ops,
        edits,
        voxel_size: sourceFile?.voxelSize || null
      };
      const configPath = path.join(workDir, `config_${jobId}.json`);
      await fsp.writeFile(configPath, JSON.stringify(config));

      const roomName = `segcleanup-${jobId}`;
      runJob(['--mode', 'apply', '--config', configPath], roomName, (resultData, stderr) => {
        fsp.unlink(configPath).catch(() => {});
        if (resultData) {
          // The previous working copy and any earlier quantification are superseded
          cleanupWorkingCopy(absolute);
          sweepJobDirs(workspacePath, { prefixes: ['quant_'] });
          io.to(roomName).emit('segcleanup-complete', {
            success: true,
            jobId,
            kind: 'apply',
            workingPath: path.relative(workspacePath, outputPath),
            reportDir: path.relative(workspacePath, workDir),
            slices: resultData.slices,
            width: resultData.width,
            height: resultData.height,
            classes: resultData.classes,
            metrics: resultData.metrics
          });
          if (activityLogger && req.session.user) {
            activityLogger.logActivity(req.session.user.username, 'segcleanup_apply', { jobId });
          }
        } else {
          io.to(roomName).emit('segcleanup-complete', {
            success: false, jobId, kind: 'apply',
            error: errorMessage('', stderr, 'Cleanup failed'), details: stderr
          });
          if (logger) logger.error(`[Segcleanup] Apply failed (${jobId}):`, stderr);
        }
      });

      res.json({ success: true, jobId });
    } catch (error) {
      if (logger) logger.error('[Segcleanup] Apply error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Quantification of the current editing state (source + pending edits)
   * POST /api/segcleanup/quantify
   * Body: { path, edits, sourceFileId }
   */
  router.post('/quantify', requireAuth, async (req, res) => {
    const { path: fileReq, edits = {}, sourceFileId } = req.body;
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
      const sourceFile = metadata?.files?.find(f => f.id === sourceFileId)
        || lookupFile(sessionId, workspacePath, absolute);

      const jobId = `sc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const outputDir = path.join(workspacePath, '.segcleanup', `quant_${jobId}`);
      await fsp.mkdir(outputDir, { recursive: true });

      const config = {
        input_path: absolute,
        output_dir: outputDir,
        edits,
        voxel_size: sourceFile?.voxelSize || null
      };
      const configPath = path.join(outputDir, `config_${jobId}.json`);
      await fsp.writeFile(configPath, JSON.stringify(config));

      const roomName = `segcleanup-${jobId}`;
      runJob(['--mode', 'quantify', '--config', configPath], roomName, (resultData, stderr) => {
        fsp.unlink(configPath).catch(() => {});
        if (resultData) {
          // Earlier quantifications are superseded by this one
          sweepJobDirs(workspacePath, { keep: outputDir, prefixes: ['quant_'] });
          io.to(roomName).emit('segcleanup-complete', {
            success: true,
            jobId,
            kind: 'quantify',
            reportDir: path.relative(workspacePath, outputDir),
            metrics: resultData.metrics
          });
        } else {
          io.to(roomName).emit('segcleanup-complete', {
            success: false, jobId, kind: 'quantify',
            error: errorMessage('', stderr, 'Quantification failed'), details: stderr
          });
          if (logger) logger.error(`[Segcleanup] Quantify failed (${jobId}):`, stderr);
        }
      });

      res.json({ success: true, jobId });
    } catch (error) {
      if (logger) logger.error('[Segcleanup] Quantify error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Drop every working copy and quantification dir of this session's
   * workspace (called when the module is left or an editing session is
   * abandoned; saved outputs and reports are tracked copies elsewhere).
   * POST /api/segcleanup/sweep
   */
  router.post('/sweep', requireAuth, async (req, res) => {
    try {
      const workspacePath = workspaceManager.getWorkspacePath(req.session.id);
      await sweepJobDirs(workspacePath);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Save the current editing state (source + pending edits) as a NEW
   * tracked file. Empty edits are allowed when saving from a working
   * copy (the automated cleanup already changed the data).
   *
   * POST /api/segcleanup/save-edits
   * Body: { path, width, height, edits, outputName, sourceFileId }
   */
  router.post('/save-edits', requireAuth, async (req, res) => {
    const { path: fileReq, width, height, edits = {}, outputName, sourceFileId } = req.body;
    const sessionId = req.session.id;
    if (!fileReq || !width || !height) {
      return res.status(400).json({ success: false, error: 'path, width and height are required' });
    }
    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const absolute = resolveWorkspacePath(workspacePath, fileReq);
      if (!fs.existsSync(absolute)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      if (!Object.keys(edits).length && !isWorkingCopy(absolute)) {
        return res.status(400).json({ success: false, error: 'No changes to save' });
      }
      const metadata = workspaceManager.loadMetadata(sessionId);
      const inputFile = metadata?.files?.find(f => f.id === sourceFileId)
        || lookupFile(sessionId, workspacePath, absolute);

      const jobId = `sc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const outputDir = path.join(workspacePath, 'results', 'segcleanup', jobId);
      await fsp.mkdir(outputDir, { recursive: true });
      const safeName = (outputName || 'edited')
        .replace(/[^\w.-]/g, '_').replace(/\.tiff?$/i, '');
      const outputPath = path.join(outputDir, `${safeName}.tif`);

      const config = {
        input_path: absolute,
        output_path: outputPath,
        width: parseInt(width, 10),
        height: parseInt(height, 10),
        edits
      };
      const configPath = path.join(outputDir, `edits_${jobId}.json`);
      await fsp.writeFile(configPath, JSON.stringify(config));

      const roomName = `segcleanup-${jobId}`;
      runJob(['--mode', 'edit-save', '--config', configPath], roomName, async (resultData, stderr) => {
        fsp.unlink(configPath).catch(() => {});
        if (resultData) {
          const entry = trackOutput(sessionId, workspacePath, outputPath, inputFile, jobId);
          // The working copy's quantification (metrics + report CSVs) would be
          // lost with the working copy; keep a copy next to the tracked output
          // so "Create report" still works after saving.
          let reportDir = null;
          if (isWorkingCopy(absolute)) {
            const workDir = path.dirname(absolute);
            for (const name of ['metrics.json', 'report.csv', 'objects.csv']) {
              const src = path.join(workDir, name);
              if (!fs.existsSync(src)) continue;
              try {
                await fsp.copyFile(src, path.join(outputDir, name));
                reportDir = path.relative(workspacePath, outputDir);
              } catch (e) {
                if (logger) logger.warn(`[Segcleanup] Could not keep ${name}: ${e.message}`);
              }
            }
          }
          // A working copy is superseded by the tracked output
          cleanupWorkingCopy(absolute);
          io.to(roomName).emit('segcleanup-complete', {
            success: true,
            jobId,
            kind: 'edit',
            outputPath: path.relative(workspacePath, outputPath),
            outputFileId: entry?.id || null,
            reportDir,
            editedSlices: resultData.editedSlices,
            slices: resultData.slices
          });
          if (activityLogger && req.session.user) {
            activityLogger.logActivity(req.session.user.username, 'segcleanup_edit', {
              jobId, editedSlices: resultData.editedSlices
            });
          }
        } else {
          io.to(roomName).emit('segcleanup-complete', {
            success: false, jobId, kind: 'edit',
            error: errorMessage('', stderr, 'Saving edits failed'), details: stderr
          });
          if (logger) logger.error(`[Segcleanup] Edit save failed (${jobId}):`, stderr);
        }
      });

      res.json({ success: true, jobId });
    } catch (error) {
      if (logger) logger.error('[Segcleanup] Save edits error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Register a quantification's report CSVs in the file browser.
   * The CSVs are COPIED from the (transient) job dir into a results
   * directory first, so later cleanup of working copies cannot remove
   * a registered report.
   *
   * POST /api/segcleanup/report
   * Body: { reportDir, sourceFileId }
   */
  router.post('/report', requireAuth, async (req, res) => {
    const { reportDir, sourceFileId } = req.body;
    const sessionId = req.session.id;
    if (!reportDir) {
      return res.status(400).json({ success: false, error: 'reportDir is required' });
    }
    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const absoluteDir = resolveWorkspacePath(workspacePath, reportDir);

      const reportId = `report_${Date.now()}`;
      const destDir = path.join(workspacePath, 'results', 'segcleanup', reportId);

      const tracked = [];
      for (const name of ['report.csv', 'objects.csv']) {
        const srcPath = path.join(absoluteDir, name);
        if (!fs.existsSync(srcPath)) continue;
        await fsp.mkdir(destDir, { recursive: true });
        const destPath = path.join(destDir, name);
        await fsp.copyFile(srcPath, destPath);
        const stats = fs.statSync(destPath);
        const lineage = sourceFileId
          ? createLineage('segcleanup', [sourceFileId], reportId)
          : null;
        const entry = workspaceManager.addFileToMetadata(sessionId, {
          name,
          path: path.relative(workspacePath, destPath),
          category: 'results',
          tags: ['segcleanup', 'report'],
          size: stats.size,
          folderId: null,
          ...(lineage && { lineage })
        });
        tracked.push(entry);
      }
      if (!tracked.length) {
        return res.status(404).json({ success: false, error: 'No report files found' });
      }
      res.json({ success: true, files: tracked });
    } catch (error) {
      if (logger) logger.error('[Segcleanup] Report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createSegcleanupRoutes;
