/**
 * bioimage.io routes (ADR-015)
 *
 *   GET    /api/bioimageio/models?all=1   runnable zoo models (cached list)
 *   GET    /api/bioimageio/selected       the model selected in this session
 *   POST   /api/bioimageio/select         { source: {type:'zoo', id} | {type:'upload', fileId} }
 *   DELETE /api/bioimageio/select         clear the selection
 *   GET    /api/bioimageio/export-options/:fileId  defaults for the export dialog of a .pth file
 *   POST   /api/bioimageio/export         { fileId, name, license, sampleFileId } -> { exportId }
 *   GET    /api/bioimageio/export/:id     status of an export job (ADR-016)
 *
 * Selecting a model describes it (downloads only the description), writes
 * the workspace model card and stores the choice in the session, where
 * /run-inference picks it up.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth.middleware');

function createBioimageioRoutes({ bioimageioService, workspaceManager, activityLogger, logger }) {
  const router = express.Router();

  router.get('/models', requireAuth, async (req, res) => {
    try {
      const all = req.query.all === '1' || req.query.all === 'true';
      const result = await bioimageioService.listModels({ all });
      res.json({ success: true, ...result });
    } catch (error) {
      if (logger) logger.error('[bioimageio] List failed:', error);
      res.status(502).json({
        success: false,
        error: 'Could not reach the bioimage.io model zoo: ' + error.message
      });
    }
  });

  router.get('/selected', requireAuth, (req, res) => {
    const selected = req.session.bioimageioModel || null;
    res.json({ success: true, selected });
  });

  router.post('/select', requireAuth, async (req, res) => {
    try {
      const source = req.body && req.body.source;
      if (!source || !source.type) {
        return res.status(400).json({ success: false, error: 'source {type, id | fileId} is required' });
      }
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      let pythonSource;
      let modelFileId = null;
      let cardPath = null;
      let cleanSource;

      if (source.type === 'zoo') {
        const id = String(source.id || '').trim();
        if (!/^[A-Za-z0-9._\/-]{1,120}$/.test(id)) {
          return res.status(400).json({ success: false, error: 'Invalid zoo model id' });
        }
        pythonSource = id;
        cleanSource = { type: 'zoo', id };
      } else if (source.type === 'upload') {
        const fileId = source.fileId ? String(source.fileId) : null;
        const relPath = source.path ? String(source.path).replace(/^\/?workspaces\/[^/]+\//, '') : null;
        const metadata = workspaceManager.loadMetadata(sessionId);
        const file = (metadata.files || []).find(f => (fileId && f.id === fileId) || (relPath && f.path === relPath));
        if (!file) {
          return res.status(404).json({ success: false, error: 'Package file not found in workspace' });
        }
        const absolute = path.resolve(workspacePath, file.path);
        if (!absolute.startsWith(workspacePath + path.sep) || !fs.existsSync(absolute)) {
          return res.status(404).json({ success: false, error: 'Package file not found on disk' });
        }
        if (!/\.zip$/i.test(absolute)) {
          return res.status(400).json({ success: false, error: 'A bioimage.io package must be a .zip file' });
        }
        pythonSource = absolute;
        modelFileId = file.id;
        cleanSource = { type: 'upload', fileId: file.id, path: file.path, name: file.displayName || file.name };
      } else {
        return res.status(400).json({ success: false, error: `Unknown source type '${source.type}'` });
      }

      const described = await bioimageioService.describe(pythonSource);
      if (!described.success) {
        return res.status(400).json({ success: false, error: described.error || 'Model could not be loaded' });
      }
      const summary = described.summary;

      if (cleanSource.type === 'zoo') {
        const card = await bioimageioService.writeModelCard(sessionId, cleanSource.id, summary);
        cardPath = card.cardPath;
        modelFileId = card.fileId;
      }

      // A zoo model replaces any workspace U-Net import for this session
      if (req.session.importedModel) {
        delete req.session.importedModel;
      }
      req.session.bioimageioModel = {
        source: cleanSource,
        pythonSource,
        summary,
        modelFileId,
        cardPath,
        selectedAt: new Date().toISOString()
      };

      if (activityLogger && req.session.user) {
        activityLogger.logActivity(req.session.user.username, 'bioimageio_select', {
          source: cleanSource.type,
          id: cleanSource.id || cleanSource.name
        });
      }
      if (logger) logger.info(`[bioimageio] Session ${sessionId} selected ${summary.name}`);

      res.json({ success: true, summary, modelFileId, source: cleanSource });
    } catch (error) {
      if (logger) logger.error('[bioimageio] Select failed:', error);
      res.status(500).json({ success: false, error: 'Model selection failed: ' + error.message });
    }
  });

  router.delete('/select', requireAuth, (req, res) => {
    if (req.session.bioimageioModel) {
      delete req.session.bioimageioModel;
    }
    res.json({ success: true });
  });


  // ---------------------------------------------------------------------------
  // Export of workspace U-Nets (ADR-016): a file action on .pth model files
  // ---------------------------------------------------------------------------

  // Exportable: a .pth of a workspace U-Net (segmentation) or an imported
  // checkpoint of unspecified method; DL denoising models are refused here
  // instead of failing late in Python (ADR-018)
  const isPth = (f) => /\.pth$/i.test(f.name || '')
    && !((f.tags || []).includes('denoising'));
  const isTiff = (f) => /\.tiff?$/i.test(f.name || '');
  const NON_SAMPLE_TAGS = ['annotation', 'segmentation', 'mask', 'result', 'mesh'];
  const MAX_NAME = 100;

  function workspaceFiles(sessionId) {
    const metadata = workspaceManager.loadMetadata(sessionId);
    return metadata.files || [];
  }

  function confinedPath(workspacePath, file) {
    const absolute = path.resolve(workspacePath, file.path);
    if (!absolute.startsWith(workspacePath + path.sep) || !fs.existsSync(absolute)) return null;
    return absolute;
  }

  function sampleCandidates(files) {
    const rank = (f) => ((f.tags || []).includes('raw') ? 0 : 1);
    return files
      .filter(isTiff)
      .filter(f => !(f.tags || []).some(t => NON_SAMPLE_TAGS.includes(t)))
      .sort((a, b) => rank(a) - rank(b) || String(a.displayName || a.name).localeCompare(String(b.displayName || b.name)));
  }

  router.get('/export-options/:fileId', requireAuth, (req, res) => {
    try {
      const sessionId = req.session.id;
      const files = workspaceFiles(sessionId);
      const model = files.find(f => f.id === req.params.fileId);
      if (!model) return res.status(404).json({ success: false, error: 'Model file not found in workspace' });
      if (!isPth(model)) return res.status(400).json({ success: false, error: 'Only segmentation .pth model files can be exported' });

      const samples = sampleCandidates(files);
      const lineageInputs = model.lineage && Array.isArray(model.lineage.inputs) ? model.lineage.inputs : [];
      const preferred = lineageInputs.map(id => samples.find(f => f.id === id)).find(Boolean) || samples[0] || null;
      const base = String(model.displayName || model.name).replace(/\.pth$/i, '')
        .replace(/_(seg|ft)_model$/i, '').replace(/_segmentation_model$/i, '');
      const user = req.session.user || {};
      res.json({
        success: true,
        model: { id: model.id, name: model.displayName || model.name },
        defaultName: `${base} segmentation U-Net`.slice(0, MAX_NAME),
        defaultSampleId: preferred ? preferred.id : null,
        samples: samples.map(f => ({ id: f.id, name: f.displayName || f.name })),
        licenses: bioimageioService.constructor.EXPORT_LICENSES,
        defaultLicense: 'CC-BY-4.0',
        author: user.fullName || user.username || ''
      });
    } catch (error) {
      if (logger) logger.error('[bioimageio] Export options failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/export', requireAuth, (req, res) => {
    try {
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const body = req.body || {};
      const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
      const license = String(body.license || 'CC-BY-4.0');
      if (!name) return res.status(400).json({ success: false, error: 'A package name is required' });
      if (!bioimageioService.constructor.EXPORT_LICENSES.includes(license)) {
        return res.status(400).json({ success: false, error: 'Unknown license' });
      }

      const files = workspaceFiles(sessionId);
      const model = files.find(f => f.id === String(body.fileId || ''));
      if (!model) return res.status(404).json({ success: false, error: 'Model file not found in workspace' });
      if (!isPth(model)) return res.status(400).json({ success: false, error: 'Only segmentation .pth model files can be exported' });
      if (!confinedPath(workspacePath, model)) {
        return res.status(404).json({ success: false, error: 'Model file not found on disk' });
      }
      const sample = files.find(f => f.id === String(body.sampleFileId || ''));
      if (!sample || !isTiff(sample)) {
        return res.status(400).json({ success: false, error: 'A sample TIFF image is required' });
      }
      const samplePath = confinedPath(workspacePath, sample);
      if (!samplePath) return res.status(404).json({ success: false, error: 'Sample image not found on disk' });

      const user = req.session.user || {};
      const trainingId = model.lineage
        && ['segmentation-training', 'segmentation-finetune'].includes(model.lineage.processType)
        ? (model.lineage.processId || null) : null;
      const exportId = bioimageioService.startExport({
        sessionId,
        modelFile: model,
        samplePath,
        sampleFileId: sample.id,
        sampleName: sample.displayName || sample.name,
        name,
        license,
        author: user.fullName || user.username || '',
        trainingId
      });

      if (activityLogger && user.username) {
        activityLogger.logActivity(user.username, 'bioimageio_export', { fileId: model.id, exportId, name });
      }
      res.json({ success: true, exportId });
    } catch (error) {
      if (logger) logger.error('[bioimageio] Export start failed:', error);
      res.status(500).json({ success: false, error: 'Export could not be started: ' + error.message });
    }
  });

  router.get('/export/:exportId', requireAuth, (req, res) => {
    const status = bioimageioService.exportStatus(req.params.exportId, req.session.id);
    if (!status) return res.status(404).json({ success: false, error: 'Export not found' });
    res.json({ success: true, export: status });
  });

  return router;
}

module.exports = createBioimageioRoutes;
