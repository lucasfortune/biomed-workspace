/**
 * Stitching Routes (ADR-007)
 *
 * Stack stitching: alignment estimation (sync) and recipe composition
 * (async job with Socket.IO progress). Mounted at /api/stitching.
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

/**
 * Create stitching routes router
 * @param {object} dependencies - Shared dependencies
 * @returns {Router} Express router
 */
function createStitchingRoutes(dependencies) {
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

  /**
   * Estimate the in-plane translation between two slices (phase correlation)
   * POST /api/stitching/align
   *
   * Body:
   *   - fixedPath, fixedSlice: reference stack + slice index
   *   - movingPath, movingSlice: moving stack + slice index
   *   - mode: 'grayscale' | 'labels'
   *
   * Synchronous (seconds); returns { success, dx, dy, score }.
   */
  router.post('/align', requireAuth, async (req, res) => {
    const { fixedPath, fixedSlice, movingPath, movingSlice, mode } = req.body;
    const sessionId = req.session.id;

    if (!fixedPath || !movingPath || fixedSlice == null || movingSlice == null) {
      return res.status(400).json({
        success: false,
        error: 'fixedPath, fixedSlice, movingPath and movingSlice are required'
      });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const absFixed = resolveWorkspacePath(workspacePath, fixedPath);
      const absMoving = resolveWorkspacePath(workspacePath, movingPath);

      for (const p of [absFixed, absMoving]) {
        if (!fs.existsSync(p)) {
          return res.status(404).json({ success: false, error: `File not found: ${path.basename(p)}` });
        }
      }

      const args = [
        'python/stitch_align.py',
        '--fixed', absFixed, '--fixed-slice', String(parseInt(fixedSlice, 10)),
        '--moving', absMoving, '--moving-slice', String(parseInt(movingSlice, 10)),
        '--mode', mode === 'labels' ? 'labels' : 'grayscale'
      ];

      const pythonProcess = spawn(PYTHON_PATH, args);
      let stdout = '';
      let stderr = '';
      pythonProcess.stdout.on('data', (d) => { stdout += d.toString(); });
      pythonProcess.stderr.on('data', (d) => { stderr += d.toString(); });

      pythonProcess.on('close', (code) => {
        const resultLine = stdout.split('\n').find(l => l.startsWith('STITCH_RESULT:'));
        const errorLine = stdout.split('\n').find(l => l.startsWith('STITCH_ERROR:'));
        if (code === 0 && resultLine) {
          try {
            const result = JSON.parse(resultLine.substring(14));
            return res.json({ success: true, ...result });
          } catch (e) { /* fall through */ }
        }
        let message = 'Alignment failed';
        if (errorLine) {
          try { message = JSON.parse(errorLine.substring(13)).message || message; } catch (e) { /* keep */ }
        } else if (stderr) {
          message = stderr.split('\n').slice(-3).join(' ').trim() || message;
        }
        if (logger) logger.error('[Stitching] Align failed:', message);
        res.status(500).json({ success: false, error: message });
      });

      pythonProcess.on('error', (err) => {
        res.status(500).json({ success: false, error: `Failed to spawn process: ${err.message}` });
      });

    } catch (error) {
      if (logger) logger.error('[Stitching] Align error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Read a saved stitch recipe
   * GET /api/stitching/recipe?path=<workspace-relative recipe json>
   */
  router.get('/recipe', requireAuth, async (req, res) => {
    const { path: recipeReq } = req.query;
    const sessionId = req.session.id;

    if (!recipeReq) {
      return res.status(400).json({ success: false, error: 'path is required' });
    }
    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const absolute = resolveWorkspacePath(workspacePath, recipeReq);
      if (!fs.existsSync(absolute)) {
        return res.status(404).json({ success: false, error: 'Recipe not found' });
      }
      const recipe = JSON.parse(await fsp.readFile(absolute, 'utf8'));
      if (!Array.isArray(recipe.stacks)) {
        return res.status(400).json({ success: false, error: 'Not a stitch recipe' });
      }
      // v2 recipes carry a fileId per stack: resolve it (id primary) back
      // to the file's current path so the client prefills correctly even
      // when the stored path string is stale
      try {
        const manifestFiles = workspaceManager.loadMetadata(sessionId)?.files || [];
        recipe.stacks = recipe.stacks.map((s) => {
          const entry = s.fileId ? manifestFiles.find(f => f.id === s.fileId) : null;
          return entry ? { ...s, path: entry.path } : s;
        });
      } catch (e) { /* recipe returned as saved */ }
      res.json({ success: true, recipe });
    } catch (error) {
      if (logger) logger.error('[Stitching] Recipe read error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Compose a stitched volume from a recipe
   * POST /api/stitching/apply
   *
   * Body:
   *   - recipe: { mode, crop_to_common, intensity_match, fill_value,
   *               feather_px, stacks: [{ path (workspace-relative),
   *               z_offset, dx, dy, rotation_deg, z_keep, z_merge }] }
   *   - outputName: optional basename for the output TIFF
   *
   * Async: returns { stitchId }; progress arrives in Socket.IO room
   * `stitching-<stitchId>` as stitching-progress / stitching-complete /
   * stitching-error events. The recipe is saved next to the output and
   * tracked in metadata so it can be reapplied to sibling volumes.
   */
  router.post('/apply', requireAuth, async (req, res) => {
    const { recipe, outputName } = req.body;
    const sessionId = req.session.id;

    if (!recipe || !Array.isArray(recipe.stacks) || recipe.stacks.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'A recipe with at least two stacks is required'
      });
    }

    try {
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const stitchId = `stitch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const outputDir = path.join(workspacePath, 'results', 'stitching', stitchId);
      await fsp.mkdir(outputDir, { recursive: true });

      const safeName = (outputName || 'stitched').replace(/[^\w.-]/g, '_').replace(/\.tiff?$/i, '');
      const outputPath = path.join(outputDir, `${safeName}.tif`);

      // Resolve each stack slot: fileId is primary, path the fallback
      // (recipe schema v2; v1 path-only recipes keep working). All
      // unresolvable slots are collected into one structured 400 instead
      // of a 500 on the first miss.
      const manifestFiles = workspaceManager.loadMetadata(sessionId)?.files || [];
      const missing = [];
      const resolvedStacks = recipe.stacks.map((s) => {
        let entry = null;
        if (s.fileId) entry = manifestFiles.find(f => f.id === s.fileId) || null;
        if (!entry && s.path) entry = manifestFiles.find(f => f.path === s.path) || null;
        const relPath = entry ? entry.path : s.path;
        let abs = null;
        try {
          abs = relPath ? resolveWorkspacePath(workspacePath, relPath) : null;
        } catch (e) {
          abs = null;
        }
        if (!abs || !fs.existsSync(abs)) {
          missing.push(relPath || s.fileId || 'unknown');
          return null;
        }
        return { src: s, abs, rel: path.relative(workspacePath, abs), fileId: entry ? entry.id : null };
      });
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Recipe references missing stacks: ${missing.join(', ')}`,
          missing
        });
      }

      const inputRelPaths = resolvedStacks.map(r => r.rel);
      const pythonRecipe = {
        output_path: outputPath,
        mode: recipe.mode === 'labels' ? 'labels' : 'grayscale',
        crop_to_common: !!recipe.crop_to_common,
        intensity_match: !!recipe.intensity_match,
        fill_value: recipe.fill_value != null ? Number(recipe.fill_value) : null,
        feather_px: recipe.feather_px != null ? parseInt(recipe.feather_px, 10) : 64,
        stacks: resolvedStacks.map((r) => ({
          path: r.abs,
          z_offset: parseInt(r.src.z_offset || 0, 10),
          dx: Number(r.src.dx || 0),
          dy: Number(r.src.dy || 0),
          rotation_deg: Number(r.src.rotation_deg || 0),
          z_keep: r.src.z_keep || null,
          z_merge: !!r.src.z_merge
        }))
      };

      // Save the portable recipe (schema v2: {path, fileId} per stack -
      // id primary, workspace-relative path as fallback + human-readable)
      // for reuse on sibling volumes (align once, apply to everything -
      // ADR-007)
      const savedRecipe = {
        ...pythonRecipe,
        version: 2,
        output_path: undefined,
        stacks: pythonRecipe.stacks.map((s, i) => ({
          ...s,
          path: inputRelPaths[i],
          fileId: resolvedStacks[i].fileId
        }))
      };
      const recipePath = path.join(outputDir, 'stitch_recipe.json');
      await fsp.writeFile(recipePath, JSON.stringify(savedRecipe, null, 2));

      const configPath = path.join(outputDir, `stitch_config_${stitchId}.json`);
      await fsp.writeFile(configPath, JSON.stringify(pythonRecipe, null, 2));

      const roomName = `stitching-${stitchId}`;
      const pythonProcess = spawn(PYTHON_PATH, ['python/stitch_apply.py', '--config', configPath]);

      let outputBuffer = '';
      let stderrBuffer = '';
      let resultData = null;

      pythonProcess.stdout.on('data', (data) => {
        outputBuffer += data.toString();
        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('STITCH_PROGRESS:')) {
            try {
              io.to(roomName).emit('stitching-progress', JSON.parse(line.substring(16)));
            } catch (e) { /* ignore parse errors */ }
          } else if (line.startsWith('STITCH_RESULT:')) {
            try {
              resultData = JSON.parse(line.substring(14));
            } catch (e) { /* ignore parse errors */ }
          } else if (line.startsWith('STITCH_ERROR:')) {
            try {
              io.to(roomName).emit('stitching-error', JSON.parse(line.substring(13)));
            } catch (e) { /* ignore parse errors */ }
          }
        }
      });

      pythonProcess.stderr.on('data', (d) => { stderrBuffer += d.toString(); });

      pythonProcess.on('close', (code) => {
        fsp.unlink(configPath).catch(() => {});

        if (code === 0 && resultData) {
          // Track output + recipe in workspace metadata with lineage
          let outputFileId = null;
          try {
            const metadata = workspaceManager.loadMetadata(sessionId);
            const inputIds = inputRelPaths
              .map(rel => metadata?.files?.find(f => f.path === rel)?.id)
              .filter(Boolean);
            const lineage = createLineage('stitching', inputIds, stitchId);

            const stats = fs.statSync(outputPath);
            const isLabels = pythonRecipe.mode === 'labels';
            // Voxel size inherited from the first input stack (all stacks
            // in a stitch share a pixel grid) - ADR-008
            const voxelSize = inputRelPaths
              .map(rel => metadata?.files?.find(f => f.path === rel)?.voxelSize)
              .find(Boolean);
            // Display names chain from the first input stack
            const firstInput = metadata?.files?.find(f => f.path === inputRelPaths[0]);
            const stitchSource = firstInput
              ? (firstInput.displayName || firstInput.name)
              : path.basename(inputRelPaths[0] || 'stitch');
            const outputEntry = workspaceManager.addFileToMetadata(sessionId, {
              name: path.basename(outputPath),
              path: path.relative(workspacePath, outputPath),
              category: 'results',
              tags: isLabels ? ['stitching', 'segmentation', 'data']
                             : ['stitching', 'raw', 'data'],
              size: stats.size,
              folderId: null,
              displayName: buildDisplayName({
                sourceName: stitchSource,
                operation: 'stitching',
                ext: path.extname(outputPath)
              }),
              ...(voxelSize && { voxelSize }),
              lineage
            });
            outputFileId = outputEntry?.id || null;
            const recipeStats = fs.statSync(recipePath);
            workspaceManager.addFileToMetadata(sessionId, {
              name: path.basename(recipePath),
              path: path.relative(workspacePath, recipePath),
              category: 'results',
              tags: ['stitching', 'recipe'],
              size: recipeStats.size,
              folderId: null,
              displayName: buildDisplayName({
                sourceName: stitchSource,
                operation: 'stitching',
                ext: path.extname(recipePath),
                qualifier: 'recipe'
              }),
              lineage
            });
          } catch (trackError) {
            if (logger) logger.error('[Stitching] Error tracking output:', trackError);
          }

          io.to(roomName).emit('stitching-complete', {
            success: true,
            stitchId,
            ...resultData,
            // The workspace-relative paths win over the Python result's
            // absolute output_path (the client shows and hands them on)
            outputPath: path.relative(workspacePath, outputPath),
            outputFileId,
            recipePath: path.relative(workspacePath, recipePath),
            outputPathAbsolute: undefined
          });

          if (activityLogger && req.session.user) {
            activityLogger.logActivity(req.session.user.username, 'stitching_apply', {
              stitchId,
              stacks: inputRelPaths.length,
              mode: pythonRecipe.mode
            });
          }
        } else {
          io.to(roomName).emit('stitching-complete', {
            success: false,
            stitchId,
            error: 'Stitching failed',
            details: stderrBuffer
          });
          if (logger) logger.error(`[Stitching] Apply failed (${stitchId}):`, stderrBuffer);
        }
      });

      pythonProcess.on('error', (err) => {
        io.to(roomName).emit('stitching-error', { message: `Failed to spawn process: ${err.message}` });
      });

      res.json({
        success: true,
        stitchId,
        message: 'Stitching started. Join Socket.IO room for progress updates.'
      });

    } catch (error) {
      if (logger) logger.error('[Stitching] Apply error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createStitchingRoutes;
