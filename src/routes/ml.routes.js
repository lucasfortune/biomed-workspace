/**
 * ML Pipeline Routes
 *
 * Handles training and inference pipeline:
 * - Upload training/inference data
 * - Configure training
 * - Start/monitor training
 * - Import models
 * - Run inference
 * - Download results
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const uuid = require('uuid');
const archiver = require('archiver');
const { spawn } = require('child_process');
const { requireAuth, requireApproved } = require('../middleware/auth.middleware');
const { PYTHON_PATH } = require('../config/constants');
const { placeUploadedFile } = require('../helpers/uploadKind');
const PACKAGE_VERSION = require('../../package.json').version;

/**
 * Create ML routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.workspaceService - WorkspaceService instance
 * @param {object} dependencies.trainingService - TrainingService instance
 * @param {object} dependencies.inferenceService - InferenceService instance
 * @param {object} dependencies.sessionTracker - SessionTracker instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @param {object} dependencies.io - Socket.IO instance
 * @param {function} dependencies.upload - Multer upload middleware
 * @param {function} dependencies.uploadImport - Multer upload middleware for imports
 * @param {function} dependencies.validateTiffStacks - TIFF validation function
 * @param {function} dependencies.validateTrainingPairs - Multi-pair training data validation
 * @param {function} dependencies.validateImportedModel - Model validation function
 * @param {function} dependencies.validateInferenceTiff - Inference TIFF validation function
 * @param {function} dependencies.validateTrainingConfig - Config validation function
 * @param {function} dependencies.startTrainingProcess - Training process starter
 * @param {function} dependencies.startInferenceProcess - Inference process starter
 * @param {object} [dependencies.bioimageioService] - Starting-point checks (ADR-017)
 * @returns {Router} Express router
 */
function createMLRoutes(dependencies) {
  const router = express.Router();
  const {
    workspaceManager,
    workspaceService,
    trainingService,
    inferenceService,
    sessionTracker,
    activityLogger,
    logger,
    io,
    upload,
    uploadImport,
    validateTiffStacks,
    validateTrainingPairs,
    validateImportedModel,
    validateInferenceTiff,
    validateTrainingConfig,
    startTrainingProcess,
    startInferenceProcess,
    bioimageioService
  } = dependencies;

  // Aliases for backward compatibility
  const trainingSessions = sessionTracker.trainingSessions;
  const inferenceSessions = sessionTracker.inferenceSessions;

  // ===========================================================================
  // TRAINING DATA UPLOAD
  // ===========================================================================

  /**
   * Upload and validate training data
   * POST /upload-data
   */
  router.post('/upload-data', upload.fields([
    { name: 'raw_images', maxCount: 1 },
    { name: 'annotations', maxCount: 1 }
  ]), async (req, res) => {
    try {
      let rawFile, annotationFile;
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Clear any imported model from session when uploading training data
      // This indicates user is starting the "Train from Scratch" workflow
      if (req.session.importedModel) {
        delete req.session.importedModel;
        if (logger) logger.info('Cleared importedModel from session - uploading training data');
      }
      if (req.session.bioimageioModel) {
        delete req.session.bioimageioModel;
      }
      // New pairs may change the class count: the starting point (ADR-017)
      // is chosen again in Step 2
      if (req.session.startModel) {
        delete req.session.startModel;
      }

      const skipUpload = req.body.skipUpload === 'true';

      // Uploading a new file requires approved status; the built-in sample files
      // (already in the workspace) are selected via skipUpload and stay allowed.
      if (!skipUpload && req.session.user.status !== 'active') {
        return res.status(403).json({
          error: 'Custom data upload requires account approval',
          status: req.session.user.status,
          message: 'You can use the built-in sample files while waiting for approval'
        });
      }

      // Case 1: Files already in the workspace (FileSelector). One or more
      // raw/annotation pairs (ADR-014): `pairs` is a JSON array of
      // { raw_images_path, annotations_path }; the legacy two fields describe
      // a single pair. All paths are workspace-relative.
      if (skipUpload) {
        if (logger) logger.debug('Validating training pairs...');

        let pairSpecs = [];
        if (req.body.pairs) {
          try {
            pairSpecs = JSON.parse(req.body.pairs);
          } catch (e) {
            return res.status(400).json({ error: 'pairs must be a JSON array' });
          }
        } else if (req.body.raw_images_path && req.body.annotations_path) {
          pairSpecs = [{
            raw_images_path: req.body.raw_images_path,
            annotations_path: req.body.annotations_path
          }];
        }
        if (!Array.isArray(pairSpecs) || pairSpecs.length === 0) {
          return res.status(400).json({
            error: 'At least one raw/annotation pair is required'
          });
        }

        // Resolve every path inside the workspace and check it exists
        const resolveInWorkspace = (rel) => {
          if (typeof rel !== 'string' || !rel) return null;
          const full = path.resolve(workspacePath, rel);
          if (!full.startsWith(workspacePath + path.sep)) return null;
          return full;
        };
        const pairs = [];
        for (let i = 0; i < pairSpecs.length; i++) {
          const spec = pairSpecs[i] || {};
          const rawFull = resolveInWorkspace(spec.raw_images_path);
          const annFull = resolveInWorkspace(spec.annotations_path);
          if (!rawFull || !fs.existsSync(rawFull)) {
            return res.status(400).json({ error: `Pair ${i + 1}: raw images file not found`, path: spec.raw_images_path });
          }
          if (!annFull || !fs.existsSync(annFull)) {
            return res.status(400).json({ error: `Pair ${i + 1}: annotations file not found`, path: spec.annotations_path });
          }
          const rawRel = path.relative(workspacePath, rawFull);
          const annRel = path.relative(workspacePath, annFull);
          pairs.push({
            raw_images: rawFull,
            annotations: annFull,
            raw_images_rel: rawRel,
            annotations_rel: annRel,
            raw_images_id: workspaceManager.getFileIdByPath(sessionId, rawRel) || null,
            annotations_id: workspaceManager.getFileIdByPath(sessionId, annRel) || null
          });
        }

        // Validate all pairs in one Python run (global class map)
        const pairsFile = path.join(os.tmpdir(), `training_pairs_${sessionId}_${Date.now()}.json`);
        fs.writeFileSync(pairsFile, JSON.stringify(
          pairs.map(p => ({ raw: p.raw_images, annotations: p.annotations }))
        ));
        let validationResult;
        try {
          validationResult = await validateTrainingPairs(pairsFile);
        } finally {
          try { fs.unlinkSync(pairsFile); } catch (e) { /* temp file */ }
        }

        if (!validationResult.valid) {
          return res.status(400).json({
            error: 'TIFF validation failed',
            details: validationResult.error
          });
        }

        // Store in session: the pair list plus the legacy single-pair keys
        // (first pair) for code that still reads them
        req.session.uploadedFiles = {
          pairs: pairs.map(p => ({
            raw_images: p.raw_images,
            annotations: p.annotations,
            raw_images_id: p.raw_images_id,
            annotations_id: p.annotations_id
          })),
          raw_images: pairs[0].raw_images,
          annotations: pairs[0].annotations,
          raw_images_id: pairs[0].raw_images_id,
          annotations_id: pairs[0].annotations_id,
          validation: validationResult
        };

        // Validation may rewrite annotation stacks in place (label remap,
        // 8-bit conversion): drop their stale thumbnail/slice caches
        for (const p of pairs) {
          if (p.annotations_id) workspaceManager.invalidateFileCaches(sessionId, p.annotations_id);
        }

        return res.json({
          success: true,
          message: 'Files validated successfully',
          validation: validationResult,
          pairs: pairs.map(p => ({
            raw_images_path: p.raw_images_rel,
            annotations_path: p.annotations_rel,
            raw_images_id: p.raw_images_id,
            annotations_id: p.annotations_id
          })),
          raw_images_path: pairs[0].raw_images_rel,
          annotations_path: pairs[0].annotations_rel
        });
      }

      // Case 2: Regular file upload (single pair). The files arrive in the
      // scratch folder and are placed under their original names (ADR-018).
      {
        if (!req.files || !req.files.raw_images || !req.files.annotations) {
          return res.status(400).json({
            error: 'Both raw images and annotations are required'
          });
        }
        const rawUp = req.files.raw_images[0];
        const annUp = req.files.annotations[0];
        const rawPlaced = placeUploadedFile(workspaceManager, sessionId, rawUp.path, rawUp.originalname, 'raw');
        const annPlaced = placeUploadedFile(workspaceManager, sessionId, annUp.path, annUp.originalname, 'annotation');
        rawFile = { path: rawPlaced.absPath, filename: rawPlaced.name, originalname: rawUp.originalname, size: rawUp.size };
        annotationFile = { path: annPlaced.absPath, filename: annPlaced.name, originalname: annUp.originalname, size: annUp.size };
      }

      // Validate TIFF stacks
      const validationResult = await validateTiffStacks(rawFile.path, annotationFile.path);

      if (!validationResult.valid) {
        return res.status(400).json({
          error: 'TIFF validation failed',
          details: validationResult.error
        });
      }

      // Store file paths in session
      req.session.uploadedFiles = {
        raw_images: rawFile.path,
        annotations: annotationFile.path,
        validation: validationResult
      };

      // Track files in workspace metadata
      let rawFileEntry, annFileEntry;

      if (!skipUpload) {
        // New metadata system: uploads category with raw/annotation tags
        const rawRelPath = path.relative(workspacePath, rawFile.path);
        rawFileEntry = workspaceManager.addFileToMetadata(sessionId, {
          name: rawFile.filename,
          path: rawRelPath,
          category: 'uploads',
          tags: ['raw'],
          size: rawFile.size,
          folderId: null,
          displayName: rawFile.originalname
        });

        const annRelPath = path.relative(workspacePath, annotationFile.path);
        annFileEntry = workspaceManager.addFileToMetadata(sessionId, {
          name: annotationFile.filename,
          path: annRelPath,
          category: 'uploads',
          tags: ['annotation'],
          size: annotationFile.size,
          folderId: null,
          displayName: annotationFile.originalname
        });

        if (activityLogger) {
          activityLogger.logFileUpload(
            req.session.user.username,
            'custom_data',
            rawFile.filename || rawFile.originalname,
            rawFile.size
          );
        }
      } else {
        // Pre-uploaded files are already tracked - resolve their ids by path
        // so training outputs can still record lineage to them
        const rawRelPath = path.relative(workspacePath, rawFile.path);
        const annRelPath = path.relative(workspacePath, annotationFile.path);
        rawFileEntry = { path: rawRelPath, id: workspaceManager.getFileIdByPath(sessionId, rawRelPath) };
        annFileEntry = { path: annRelPath, id: workspaceManager.getFileIdByPath(sessionId, annRelPath) };
      }

      // Record the tracked file ids for training-output lineage
      req.session.uploadedFiles.raw_images_id = rawFileEntry.id || null;
      req.session.uploadedFiles.annotations_id = annFileEntry.id || null;

      // Validation may rewrite a pre-existing annotation stack in place
      // (16->8 bit conversion / label remapping in validate_tiff.py):
      // drop its stale thumbnail/slice caches
      if (skipUpload && annFileEntry.id) {
        workspaceManager.invalidateFileCaches(sessionId, annFileEntry.id);
      }

      res.json({
        success: true,
        message: skipUpload
          ? 'Files validated successfully'
          : 'Files uploaded and validated successfully',
        validation: validationResult,
        raw_images_path: rawFileEntry.path,
        annotations_path: annFileEntry.path
      });

    } catch (error) {
      if (logger) logger.error('Upload error:', error);
      res.status(500).json({
        error: error.message
      });
    }
  });

  // ===========================================================================
  // TRAINING CONFIGURATION
  // ===========================================================================

  /**
   * Configure training parameters
   * POST /configure-training
   */
  router.post('/configure-training', (req, res) => {
    try {
      const config = req.body;

      const validationResult = validateTrainingConfig(config);
      if (!validationResult.valid) {
        return res.status(400).json({
          error: 'Invalid configuration',
          details: validationResult.errors
        });
      }

      // The patch must fit the smallest slice of every training pair
      const minDim = req.session.uploadedFiles?.validation?.min_dimension;
      if (minDim && config.patch_size > minDim) {
        return res.status(400).json({
          error: 'Invalid configuration',
          details: [`patch_size ${config.patch_size} exceeds the smallest slice dimension (${minDim}) of the training pairs`]
        });
      }

      // Starting point (ADR-017): the parent fixes the architecture and the
      // patch sizes its input rule accepts
      const start = req.session.startModel;
      if (start) {
        const allowed = Array.isArray(start.allowedPatchSizes) ? start.allowedPatchSizes : [];
        if (allowed.length && !allowed.includes(Number(config.patch_size))) {
          return res.status(400).json({
            error: 'Invalid configuration',
            details: [`patch_size ${config.patch_size} is not accepted by the starting model (allowed: ${allowed.join(', ')})`]
          });
        }
        if (start.kind === 'checkpoint' && start.modelConfig) {
          config.features = start.modelConfig.features;
          config.num_layers = start.modelConfig.num_layers;
        }
      }

      req.session.trainingConfig = config;

      res.json({
        success: true,
        message: 'Training configuration saved',
        config: config
      });

    } catch (error) {
      if (logger) logger.error('Configuration error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================================================================
  // TRAINING EXECUTION
  // ===========================================================================

  /**
   * Start training
   * POST /start-training
   */
  router.post('/start-training', requireAuth, (req, res) => {
    try {
      if (!req.session.uploadedFiles || !req.session.trainingConfig) {
        return res.status(400).json({
          error: 'Missing uploaded files or configuration'
        });
      }

      // Custom uploads are gated at upload time; training runs on whatever is
      // already in the workspace (custom uploads for approved users, or the
      // built-in samples), so no separate approval gate is needed here.

      const sessionId = req.session.id;
      const trainingId = uuid.v4();

      // Clear any imported model from session since we're training from scratch
      // This prevents inference from mistakenly using an old imported model
      if (req.session.importedModel) {
        delete req.session.importedModel;
        if (logger) logger.info('Cleared importedModel from session - training from scratch');
      }
      if (req.session.bioimageioModel) {
        delete req.session.bioimageioModel;
      }

      // Add num_classes from validation
      const config = req.session.trainingConfig;
      if (req.session.uploadedFiles.validation?.num_classes) {
        config.num_classes = req.session.uploadedFiles.validation.num_classes;
      } else {
        config.num_classes = 3;
      }

      // Run folder models/segmentation/train<n>/ (ADR-018); the training id
      // stays the job key for the session map and the socket room
      const run = workspaceManager.allocateRun(sessionId, 'train', ['models/segmentation']);
      const trainingParams = {
        session_id: sessionId,
        training_id: trainingId,
        run_label: run.label,
        raw_images: req.session.uploadedFiles.raw_images,
        annotations: req.session.uploadedFiles.annotations,
        config: config,
        output_dir: run.dirs['models/segmentation']
      };

      // Training pairs (ADR-014): written next to the model so the run is
      // reproducible; the legacy single pair becomes a one-entry list
      const pairs = req.session.uploadedFiles.pairs || [{
        raw_images: req.session.uploadedFiles.raw_images,
        annotations: req.session.uploadedFiles.annotations,
        raw_images_id: req.session.uploadedFiles.raw_images_id,
        annotations_id: req.session.uploadedFiles.annotations_id
      }];
      trainingParams.pairs_file = path.join(trainingParams.output_dir, 'training_pairs.json');
      fs.writeFileSync(trainingParams.pairs_file, JSON.stringify(
        pairs.map(p => ({ raw: p.raw_images, annotations: p.annotations })), null, 2
      ));

      // Starting point (ADR-017): a workspace checkpoint or a bioimage.io
      // model; its details go to the script for the package README
      const start = req.session.startModel || null;
      let startRecord = null;
      if (start) {
        if (start.kind === 'checkpoint') {
          if (!start.path || !fs.existsSync(start.path)) {
            return res.status(400).json({ error: 'The starting checkpoint no longer exists: ' + (start.displayName || '') });
          }
          trainingParams.init_from = start.path;
        } else {
          if (start.kind === 'package' && (!start.path || !fs.existsSync(start.path))) {
            return res.status(400).json({ error: 'The starting package no longer exists: ' + (start.displayName || '') });
          }
          trainingParams.bioimageio = start.source;
        }
        const metadata = workspaceManager.loadMetadata(sessionId);
        const nameOf = (id) => {
          const f = (metadata.files || []).find(x => x.id === id);
          return f ? (f.displayName || f.name) : null;
        };
        const dataLine = pairs
          .map(p => [nameOf(p.raw_images_id) || path.basename(p.raw_images), nameOf(p.annotations_id) || path.basename(p.annotations)].join(' + '))
          .join('; ');
        startRecord = {
          kind: start.kind,
          fileId: start.fileId || null,
          displayName: start.displayName || null,
          id: start.id || null,
          name: start.name || start.displayName || null,
          head: start.head || 'softmax',
          classes: start.classes || config.num_classes
        };
        const meta = {
          parent: { kind: start.kind, fileId: start.fileId || null, displayName: start.displayName || null, id: start.id || null },
          parent_display: start.displayName || start.name || start.id || null,
          author: req.session.user.fullName || req.session.user.username,
          workspace_version: PACKAGE_VERSION,
          data: dataLine
        };
        trainingParams.meta_file = path.join(trainingParams.output_dir, 'training_meta.json');
        fs.writeFileSync(trainingParams.meta_file, JSON.stringify(meta, null, 2));
      }

      // Store training session with history array for chart restoration
      trainingSessions.set(trainingId, {
        sessionId: sessionId,
        username: req.session.user.username,
        fullName: req.session.user.fullName,
        moduleType: 'Segmentation',
        status: 'starting',
        startTime: new Date(),
        current_epoch: 0,
        total_epochs: config.num_epochs,
        params: trainingParams,
        // Lineage tracking: every raw + annotation input file id (all pairs);
        // the parent model of a fine-tuning run (ADR-017) is recorded
        // separately and lands in lineage.modelFileId, never in inputs
        inputFileIds: pairs.flatMap(p => [p.raw_images_id, p.annotations_id]).filter(Boolean),
        rawFileId: pairs[0] && pairs[0].raw_images_id || null,
        parentFileId: startRecord && startRecord.fileId || null,
        startModel: startRecord,
        stage: null,
        outputPackage: null,
        history: [] // Array of {epoch, train_loss, val_loss, train_dice, val_dice}
      });

      if (activityLogger) {
        activityLogger.logTrainingStart(
          req.session.user.username,
          trainingId,
          startRecord ? { ...config, fine_tuned_from: startRecord.name || startRecord.kind } : config
        );
      }

      req.session.currentTraining = trainingId;

      // Start training process
      startTrainingProcess(trainingParams, io);

      res.json({
        success: true,
        training_id: trainingId,
        message: 'Training started successfully'
      });

    } catch (error) {
      if (logger) logger.error('Training start error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Choose the starting point of the next training run (ADR-017)
   * POST /api/segmentation/start-model
   * body: { kind: 'none' | 'checkpoint' | 'package' | 'zoo', fileId?, id? }
   *
   * Checks the parent against the validated training pairs (class count,
   * eligibility of a bioimage.io head) and stores it on the session; the
   * response carries what Step 2 locks (architecture, patch sizes).
   */
  router.post('/api/segmentation/start-model', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const kind = String(body.kind || 'none');
      if (kind === 'none') {
        delete req.session.startModel;
        return res.json({ success: true, startModel: null });
      }
      if (!['checkpoint', 'package', 'zoo'].includes(kind)) {
        return res.status(400).json({ success: false, error: `Unknown starting point kind '${kind}'` });
      }
      if (!bioimageioService) {
        return res.status(503).json({ success: false, error: 'Starting points are not available on this server' });
      }
      const numClasses = req.session.uploadedFiles?.validation?.num_classes;
      if (!numClasses) {
        return res.status(400).json({ success: false, error: 'Validate the training pairs in Step 1 first' });
      }
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Workspace file (checkpoint or package): confined to the workspace
      let file = null;
      let absolute = null;
      if (kind !== 'zoo') {
        const fileId = body.fileId ? String(body.fileId) : null;
        const relPath = body.path ? String(body.path).replace(/^\/?workspaces\/[^/]+\//, '') : null;
        const metadata = workspaceManager.loadMetadata(sessionId);
        file = (metadata.files || []).find(f => (fileId && f.id === fileId) || (relPath && f.path === relPath));
        if (!file) {
          return res.status(404).json({ success: false, error: 'Model file not found in workspace' });
        }
        absolute = path.resolve(workspacePath, file.path);
        if (!absolute.startsWith(workspacePath + path.sep) || !fs.existsSync(absolute)) {
          return res.status(404).json({ success: false, error: 'Model file not found on disk' });
        }
        const expectExt = kind === 'checkpoint' ? /\.pth$/i : /\.zip$/i;
        if (!expectExt.test(absolute)) {
          return res.status(400).json({
            success: false,
            error: kind === 'checkpoint' ? 'A workspace checkpoint must be a .pth file' : 'A bioimage.io package must be a .zip file'
          });
        }
      }

      let startModel;
      let publicView;
      if (kind === 'checkpoint') {
        const described = await bioimageioService.describeCheckpoint(absolute);
        if (!described.success) {
          return res.status(400).json({ success: false, error: described.error || 'Checkpoint could not be read' });
        }
        const ck = described.checkpoint;
        if (ck.model_config.num_classes !== numClasses) {
          return res.status(400).json({
            success: false,
            error: `This checkpoint was trained for ${ck.model_config.num_classes} classes (background included); the training pairs have ${numClasses}. Pick a model with the same classes or change the annotations.`
          });
        }
        startModel = {
          kind, fileId: file.id, displayName: file.displayName || file.name, path: absolute, relPath: file.path,
          modelConfig: ck.model_config, valDice: ck.val_dice, allowedPatchSizes: ck.allowed_patch_sizes,
          classes: numClasses, head: 'softmax', name: file.displayName || file.name
        };
        publicView = {
          kind, fileId: file.id, displayName: startModel.displayName, name: startModel.name,
          architecture: { features: ck.model_config.features, num_layers: ck.model_config.num_layers },
          classes: numClasses, head: 'softmax', valDice: ck.val_dice,
          allowedPatchSizes: ck.allowed_patch_sizes, notes: []
        };
      } else {
        let source;
        let zooId = null;
        if (kind === 'zoo') {
          zooId = String(body.id || '').trim();
          if (!/^[A-Za-z0-9._\/-]{1,120}$/.test(zooId)) {
            return res.status(400).json({ success: false, error: 'Invalid zoo model id' });
          }
          source = zooId;
        } else {
          source = absolute;
        }
        const described = await bioimageioService.describe(source);
        if (!described.success) {
          return res.status(400).json({ success: false, error: described.error || 'Model could not be loaded' });
        }
        const summary = described.summary;
        const fi = summary.finetune || { eligible: false, reason: 'no fine-tuning information' };
        if (!fi.eligible) {
          return res.status(400).json({ success: false, error: `This model cannot be fine-tuned: ${fi.reason}` });
        }
        if (fi.classes !== numClasses) {
          return res.status(400).json({
            success: false,
            error: `This model expects ${fi.classes} annotation classes (background included); the training pairs have ${numClasses}. Pick a model with the same classes or change the annotations.`
          });
        }
        let modelFileId = file ? file.id : null;
        if (kind === 'zoo') {
          const card = await bioimageioService.writeModelCard(sessionId, zooId, summary);
          modelFileId = card.fileId;
        }
        const displayName = file ? (file.displayName || file.name) : summary.name;
        startModel = {
          kind, fileId: modelFileId, displayName, name: summary.name, id: zooId || summary.id || null,
          path: file ? absolute : null, relPath: file ? file.path : null, source,
          head: fi.head, classes: fi.classes, allowedPatchSizes: fi.allowed_patch_sizes, channels: fi.channels
        };
        publicView = {
          kind, fileId: modelFileId, displayName, name: summary.name, id: startModel.id,
          architecture: null, classes: fi.classes, head: fi.head, channels: fi.channels,
          allowedPatchSizes: fi.allowed_patch_sizes, notes: summary.notes || [],
          weightFormat: summary.weight_format, license: summary.license || null
        };
      }

      req.session.startModel = startModel;
      if (activityLogger && req.session.user) {
        activityLogger.logActivity(req.session.user.username, 'segmentation_start_model', {
          kind, name: startModel.name || startModel.displayName
        });
      }
      res.json({ success: true, startModel: publicView });
    } catch (error) {
      if (logger) logger.error('[ML] start-model failed:', error);
      res.status(500).json({ success: false, error: 'Starting point could not be set: ' + error.message });
    }
  });

  /**
   * Get training status
   * GET /training-status/:trainingId
   */
  router.get('/training-status/:trainingId', requireAuth, (req, res) => {
    const trainingId = req.params.trainingId;
    let training = trainingSessions.get(trainingId);

    // Ownership: another session's job looks like an unknown one
    if (training && training.sessionId !== req.session.id) {
      training = undefined;
    }

    if (!training) {
      // Session not in memory - could be server restart or old session
      // Return success: true with status: 'unknown' so frontend can handle gracefully
      return res.json({
        success: true,
        status: 'unknown',
        message: 'Training session not found in memory. It may have completed or the server was restarted.'
      });
    }

    res.json({
      success: true,
      ...training
    });
  });

  /**
   * Cancel an ongoing training process
   * POST /cancel-training/:trainingId
   */
  router.post('/cancel-training/:trainingId', requireAuth, (req, res) => {
    const { trainingId } = req.params;

    try {
      // Ownership: only the owning session may cancel (404, don't leak)
      const training = trainingSessions.get(trainingId);
      if (!training || training.sessionId !== req.session.id) {
        return res.status(404).json({
          success: false,
          error: 'No active training process found for this ID'
        });
      }

      const cancelled = trainingService.cancelTraining(trainingId, io);

      if (cancelled) {
        activityLogger.logActivity(
          req.session.user?.username || 'unknown',
          'TRAINING_CANCELLED',
          { trainingId }
        );
        res.json({
          success: true,
          message: 'Training cancelled successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'No active training process found for this ID'
        });
      }

    } catch (error) {
      if (logger) {
        logger.error('[ML] Error cancelling training:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // INFERENCE DATA UPLOAD
  // ===========================================================================

  /**
   * Upload inference data
   * POST /upload-inference
   */
  router.post('/upload-inference', requireAuth, upload.single('inference_data'), async (req, res) => {
    try {
      let inferenceFile;
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      const skipUpload = req.body.skipUpload === 'true';

      // Uploading a new file requires approved status; existing workspace files
      // (including the built-in samples) are selected via skipUpload.
      if (!skipUpload && req.session.user.status !== 'active') {
        return res.status(403).json({
          error: 'Custom inference data upload requires account approval',
          status: req.session.user.status,
          message: 'You can use the built-in sample files while waiting for approval'
        });
      }

      // Case 1: File already uploaded
      if (skipUpload) {
        const inferenceDataPath = req.body.inference_data_path;

        if (!inferenceDataPath) {
          return res.status(400).json({
            error: 'File path is required when skipUpload is true'
          });
        }

        const inferenceFullPath = path.join(workspacePath, inferenceDataPath);

        if (!fs.existsSync(inferenceFullPath)) {
          return res.status(400).json({
            error: 'Inference data file not found',
            path: inferenceDataPath
          });
        }

        inferenceFile = {
          path: inferenceFullPath,
          filename: path.basename(inferenceFullPath),
          originalname: path.basename(inferenceFullPath),
          size: fs.statSync(inferenceFullPath).size,
          mimetype: 'image/tiff'
        };
      }
      // Case 2: Regular upload (placed under its original name, ADR-018)
      else {
        if (!req.file) {
          return res.status(400).json({ error: 'No file provided for inference' });
        }
        const placed = placeUploadedFile(workspaceManager, sessionId, req.file.path, req.file.originalname, 'raw');
        inferenceFile = {
          path: placed.absPath,
          filename: placed.name,
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        };
      }

      // Validate TIFF
      const validationResult = await validateInferenceTiff(inferenceFile.path);

      if (!validationResult.valid) {
        return res.status(400).json({
          error: 'TIFF validation failed',
          details: validationResult.error
        });
      }

      // Track file in metadata
      let inferenceFileEntry;
      const inferenceRelPath = path.relative(workspacePath, inferenceFile.path);

      if (skipUpload) {
        // File already exists in workspace - look it up by path to get the ID
        const metadata = workspaceManager.loadMetadata(sessionId);
        if (metadata && metadata.files) {
          inferenceFileEntry = metadata.files.find(f => f.path === inferenceRelPath);
        }
        // If not found in metadata, create a basic entry (file exists but wasn't tracked)
        if (!inferenceFileEntry) {
          inferenceFileEntry = { path: inferenceRelPath };
        }
      } else {
        // New upload - track in metadata
        // New metadata system: uploads category with raw tag
        inferenceFileEntry = workspaceManager.addFileToMetadata(sessionId, {
          name: inferenceFile.filename,
          path: inferenceRelPath,
          category: 'uploads',
          tags: ['raw'],
          size: inferenceFile.size,
          folderId: null,
          displayName: inferenceFile.originalname
        });
      }

      res.json({
        success: true,
        message: skipUpload
          ? 'Inference file validated successfully'
          : 'Inference data uploaded successfully',
        file_path: inferenceFile.path,
        inference_data_path: inferenceFileEntry ? inferenceFileEntry.path : inferenceRelPath,
        file_id: inferenceFileEntry ? inferenceFileEntry.id : null,
        validation: validationResult
      });

    } catch (error) {
      if (logger) logger.error('Inference upload error:', error);
      res.status(500).json({
        error: error.message
      });
    }
  });

  // ===========================================================================
  // MODEL IMPORT
  // ===========================================================================

  /**
   * Import pre-trained model
   * POST /import-pretrained-model
   */
  router.post('/import-pretrained-model', requireApproved, uploadImport.fields([
    { name: 'model_file', maxCount: 1 },
    { name: 'config_file', maxCount: 1 }
  ]), async (req, res) => {
    try {
      if (!req.files || !req.files.model_file || !req.files.config_file) {
        return res.status(400).json({
          success: false,
          error: 'Both model file (.pth) and config file (.json) are required.'
        });
      }

      const modelUp = req.files.model_file[0];
      const configUp = req.files.config_file[0];
      const dropTemp = () => {
        for (const f of [modelUp, configUp]) fs.unlink(f.path, () => {});
      };

      if (!modelUp.originalname.toLowerCase().endsWith('.pth')) {
        dropTemp();
        return res.status(400).json({
          success: false,
          error: 'Model file must be a .pth file.'
        });
      }

      if (!configUp.originalname.toLowerCase().endsWith('.json')) {
        dropTemp();
        return res.status(400).json({
          success: false,
          error: 'Config file must be a .json file.'
        });
      }

      const validationResult = await validateImportedModel(modelUp.path, configUp.path);

      if (validationResult.success) {
        const sessionId = req.session.id;
        const workspacePath = workspaceManager.getWorkspacePath(sessionId);

        // Place both files under models/imported/ with their original names
        // (ADR-018; name === basename(path)) and track them: models category
        // with unspecified/weights or unspecified/config tags, the config
        // living and dying with the weights (parentId)
        const modelPlaced = placeUploadedFile(workspaceManager, sessionId, modelUp.path, modelUp.originalname, 'weights');
        const configPlaced = placeUploadedFile(workspaceManager, sessionId, configUp.path, configUp.originalname, 'config');
        const modelFile = { path: modelPlaced.absPath, size: modelUp.size };
        const configFile = { path: configPlaced.absPath, size: configUp.size };

        const modelEntry = workspaceManager.addFileToMetadata(sessionId, {
          name: modelPlaced.name,
          path: modelPlaced.relPath,
          category: 'models',
          tags: ['unspecified', 'weights'],
          size: modelUp.size,
          folderId: null,
          displayName: modelUp.originalname
        });

        const configEntry = workspaceManager.addFileToMetadata(sessionId, {
          name: configPlaced.name,
          path: configPlaced.relPath,
          category: 'models',
          tags: ['unspecified', 'config'],
          size: configUp.size,
          folderId: null,
          displayName: configUp.originalname,
          parentId: modelEntry.id
        });

        req.session.importedModel = {
          modelPath: modelFile.path,
          configPath: configFile.path,
          modelFileId: modelEntry.id,
          configFileId: configEntry.id,
          validated: true,
          validation: validationResult
        };

        res.json({
          success: true,
          message: 'Model and config validated successfully',
          modelFileId: modelEntry.id,
          configFileId: configEntry.id,
          validation: {
            model_info: `Valid PyTorch model (${validationResult.model_size})`,
            config_info: `Valid configuration with ${validationResult.config.features} features, ${validationResult.config.num_layers} layers`
          }
        });
      } else {
        dropTemp();
        res.status(400).json({
          success: false,
          error: validationResult.error
        });
      }

    } catch (error) {
      if (logger) logger.error('Import model error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error during model import: ' + error.message
      });
    }
  });

  // ===========================================================================
  // SEGMENTATION MODEL IMPORT (Workspace Workflow)
  // ===========================================================================

  /**
   * Get recent completed training results for model import
   * GET /api/segmentation/recent-results
   */
  router.get('/api/segmentation/recent-results', requireAuth, (req, res) => {
    try {
      const sessionId = req.session.id;
      const results = [];

      // Iterate through trainingSessions to find completed ones for this session
      for (const [trainingId, session] of trainingSessions.entries()) {
        if (session.sessionId === sessionId && session.status === 'completed') {
          const workspacePath = workspaceManager.getWorkspacePath(sessionId);
          const modelDir = session.params && session.params.output_dir
            ? session.params.output_dir
            : path.join(workspacePath, 'models', 'segmentation', trainingId);
          const modelPath = path.join(modelDir, 'best_model.pth');
          const configPath = path.join(modelDir, 'config.json');

          // Only include if model files exist
          if (fs.existsSync(modelPath) && fs.existsSync(configPath)) {
            let configData = null;
            try {
              configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch (e) {
              // Ignore parse errors
            }

            results.push({
              trainingId,
              completedAt: session.endTime || session.startTime,
              modelPath: path.relative(workspacePath, modelPath),
              configPath: path.relative(workspacePath, configPath),
              config: configData
            });
          }
        }
      }

      // Sort by completion time (most recent first)
      results.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

      res.json({ success: true, results });

    } catch (error) {
      if (logger) logger.error('Error getting recent results:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get recent training results: ' + error.message
      });
    }
  });

  /**
   * Validate model and config files for import
   * POST /api/segmentation/validate-model
   */
  router.post('/api/segmentation/validate-model', requireAuth, async (req, res) => {
    try {
      const { modelPath, configPath } = req.body;
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      if (!modelPath || !configPath) {
        return res.status(400).json({
          success: false,
          error: 'Both modelPath and configPath are required'
        });
      }

      // Resolve paths relative to workspace
      const absoluteModelPath = path.isAbsolute(modelPath)
        ? modelPath
        : path.join(workspacePath, modelPath);
      const absoluteConfigPath = path.isAbsolute(configPath)
        ? configPath
        : path.join(workspacePath, configPath);

      // Check files exist
      if (!fs.existsSync(absoluteModelPath)) {
        return res.json({
          success: true,
          valid: false,
          errors: [`Model file not found: ${modelPath}`]
        });
      }

      if (!fs.existsSync(absoluteConfigPath)) {
        return res.json({
          success: true,
          valid: false,
          errors: [`Config file not found: ${configPath}`]
        });
      }

      // Validate using existing function
      const validationResult = await validateImportedModel(absoluteModelPath, absoluteConfigPath);

      if (validationResult.success) {
        // Parse config for additional info
        let configData = null;
        try {
          configData = JSON.parse(fs.readFileSync(absoluteConfigPath, 'utf8'));
        } catch (e) {
          return res.json({
            success: true,
            valid: false,
            errors: ['Failed to parse config.json: ' + e.message]
          });
        }

        res.json({
          success: true,
          valid: true,
          modelInfo: {
            path: modelPath,
            size: validationResult.model_size
          },
          configData
        });
      } else {
        res.json({
          success: true,
          valid: false,
          errors: [validationResult.error || 'Model validation failed']
        });
      }

    } catch (error) {
      if (logger) logger.error('Error validating model:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate model: ' + error.message
      });
    }
  });

  /**
   * Store imported model paths in session (workspace workflow)
   * POST /api/segmentation/store-imported-model
   *
   * Unlike /import-pretrained-model which expects file uploads,
   * this accepts paths to already-validated files in workspace.
   */
  router.post('/api/segmentation/store-imported-model', requireAuth, async (req, res) => {
    try {
      const { modelPath, configPath } = req.body;
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      if (!modelPath || !configPath) {
        return res.status(400).json({
          success: false,
          error: 'Both modelPath and configPath are required'
        });
      }

      // Resolve paths
      const absoluteModelPath = path.isAbsolute(modelPath)
        ? modelPath
        : path.join(workspacePath, modelPath);
      const absoluteConfigPath = path.isAbsolute(configPath)
        ? configPath
        : path.join(workspacePath, configPath);

      // Verify files exist
      if (!fs.existsSync(absoluteModelPath)) {
        return res.status(404).json({
          success: false,
          error: 'Model file not found'
        });
      }
      if (!fs.existsSync(absoluteConfigPath)) {
        return res.status(404).json({
          success: false,
          error: 'Config file not found'
        });
      }

      // Load and parse config
      let configData;
      try {
        configData = JSON.parse(fs.readFileSync(absoluteConfigPath, 'utf8'));
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Failed to parse config file: ' + e.message
        });
      }

      // Store in session (matches existing importedModel format)
      req.session.importedModel = {
        modelPath: absoluteModelPath,
        configPath: absoluteConfigPath,
        validated: true,
        validation: {
          config: configData,
          model_size: fs.statSync(absoluteModelPath).size
        }
      };

      if (logger) logger.info(`[ML] Stored imported model for session ${sessionId}`);

      res.json({
        success: true,
        message: 'Model stored in session for inference'
      });

    } catch (error) {
      if (logger) logger.error('Error storing imported model:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to store imported model: ' + error.message
      });
    }
  });

  // ===========================================================================
  // INFERENCE EXECUTION
  // ===========================================================================

  /**
   * Run inference
   * POST /run-inference
   */
  router.post('/run-inference', async (req, res) => {
    try {
      const { model_path, data_path, output_path, training_id, inputFileIds, conversion, threshold } = req.body;

      if (logger) logger.info('Inference request received:', { model_path, data_path, output_path, training_id });

      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      let actualDataPath = data_path;

      if (!path.isAbsolute(data_path)) {
        actualDataPath = path.join(workspacePath, data_path);
      }

      if (!fs.existsSync(actualDataPath)) {
        return res.status(400).json({
          error: 'Input file not found',
          details: `File not found at: ${actualDataPath}`,
          original_path: data_path
        });
      }

      let actualModelPath;
      let modelConfig;
      let inferenceId;
      let runOptions = {};

      // ADR-015: a selected bioimage.io model takes precedence; it runs
      // through run_bioimageio_inference.py (tiled) with the same protocol
      const bioModel = req.session.bioimageioModel;
      const usingBioimageio = !!(bioModel && bioModel.summary && bioModel.pythonSource);
      if (usingBioimageio) {
        actualModelPath = bioModel.pythonSource;
        const summary = bioModel.summary;
        const rule = ['argmax', 'per_channel'].includes(conversion) ? conversion : summary.default_conversion;
        let thr = Number(threshold);
        if (!Number.isFinite(thr) || thr <= 0 || thr >= 1) thr = 0.5;
        modelConfig = {
          type: 'bioimageio',
          id: summary.id,
          name: summary.name,
          version: summary.version,
          weight_format: summary.weight_format,
          dims: summary.dims,
          conversion: rule,
          threshold: thr
        };
        runOptions = {
          script: 'python/run_bioimageio_inference.py',
          extraArgs: ['--conversion', rule, '--threshold', String(thr)]
        };
        if (bioModel.source && bioModel.source.type === 'upload' && !fs.existsSync(actualModelPath)) {
          return res.status(400).json({ error: 'Selected bioimage.io package no longer exists: ' + bioModel.source.name });
        }
      } else if (req.session.importedModel && req.session.importedModel.validated) {
        actualModelPath = req.session.importedModel.modelPath;

        try {
          const configData = fs.readFileSync(req.session.importedModel.configPath, 'utf8');
          modelConfig = JSON.parse(configData);
        } catch (error) {
          return res.status(400).json({
            error: 'Failed to load imported model config: ' + error.message
          });
        }

        if (!fs.existsSync(actualModelPath)) {
          return res.status(400).json({
            error: 'Imported model file not found: ' + actualModelPath
          });
        }

      } else {
        // Use training session model
        if (!training_id || !trainingSessions.has(training_id)) {
          return res.status(400).json({
            error: 'No imported model found and training session not found',
            training_id: training_id
            // Note: available_sessions removed to prevent information disclosure
          });
        }

        const training = trainingSessions.get(training_id);
        actualModelPath = path.join(training.params.output_dir, 'best_model.pth');
        modelConfig = training.params.config;

        if (!fs.existsSync(actualModelPath)) {
          return res.status(404).json({
            error: 'Model file not found. Training may not have completed successfully.',
            details: `Expected: ${actualModelPath}`
          });
        }
      }

      inferenceId = uuid.v4();

      // Resolve the model's tracked file id (if the model lives in the workspace)
      // so output lineage can record which model produced the segmentation.
      // Imported models without a tracked entry resolve to null.
      const modelFileId = usingBioimageio
        ? (bioModel.modelFileId || null)
        : workspaceManager.getFileIdByPath(
          sessionId,
          path.relative(workspacePath, actualModelPath)
        );

      // Initialize imported model results directories tracking
      if (!req.session.importedModelResultsDirs) {
        req.session.importedModelResultsDirs = [];
      }

      // Run folder results/segmentation/seg<n>/ for every inference, whatever
      // the model source (ADR-018); the script picks the file name inside it
      // and the tracker renames the outputs onto their display names
      const outputDir = workspaceManager.allocateRun(sessionId, 'seg', ['results/segmentation']).dirs['results/segmentation'];
      if (req.session.importedModel && req.session.importedModel.validated) {
        req.session.importedModelResultsDirs.push(outputDir);
      }

      // Create a placeholder path for the Python script (it will use the directory)
      const actualOutputPath = path.join(outputDir, 'placeholder.tif');

      // Store inference session
      inferenceSessions.set(inferenceId, {
        sessionId: req.session.id,
        username: req.session.user.username,
        fullName: req.session.user.fullName,
        moduleType: 'Segmentation',
        status: 'starting',
        startTime: new Date(),
        progress: 0,
        currentSlice: 0,
        totalSlices: 0,
        usingImportedModel: !!(req.session.importedModel && req.session.importedModel.validated),
        usingBioimageio,
        modelName: usingBioimageio ? bioModel.summary.name : null,
        // Lineage tracking: store input file IDs for provenance
        inputFileIds: inputFileIds || [],
        // Lineage tracking: model that runs this inference (null when untracked)
        modelFileId
      });

      if (activityLogger) {
        activityLogger.logInferenceStart(
          req.session.user.username,
          inferenceId,
          !!(req.session.importedModel && req.session.importedModel.validated)
        );
      }

      res.json({
        success: true,
        inference_id: inferenceId,
        status: 'starting',
        message: 'Inference request accepted. Join the WebSocket room for progress updates.',
        model_info: usingBioimageio
          ? `Using bioimage.io model ${bioModel.summary.name}`
          : (req.session.importedModel ? 'Using imported model' : 'Using trained model')
      });

      // Start inference after delay to allow frontend to join room
      setTimeout(() => {
        startInferenceProcess(actualModelPath, actualDataPath, actualOutputPath, inferenceId, io, runOptions);
      }, 1000);

    } catch (error) {
      if (logger) logger.error('Inference error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get inference status
   * GET /inference-status/:inferenceId
   */
  router.get('/inference-status/:inferenceId', requireAuth, (req, res) => {
    const inferenceId = req.params.inferenceId;
    const inference = inferenceSessions.get(inferenceId);

    // Ownership: another session's job looks like an unknown one
    if (!inference || inference.sessionId !== req.session.id) {
      return res.status(404).json({ error: 'Inference session not found' });
    }

    res.json(inference);
  });

  // ===========================================================================
  // DOWNLOADS
  // ===========================================================================

  /**
   * Download trained model
   * GET /download-model/:trainingId
   */
  router.get('/download-model/:trainingId', requireAuth, (req, res) => {
    const trainingId = req.params.trainingId;
    const training = trainingSessions.get(trainingId);

    // Ownership check included: another session's model is a 404
    if (!training || training.sessionId !== req.session.id || training.status !== 'completed') {
      return res.status(404).json({ error: 'Model not found or training not completed' });
    }

    const modelDir = training.params.output_dir;
    const modelPath = path.join(modelDir, 'best_model.pth');
    const configPath = path.join(modelDir, 'config.json');
    const resultsPath = path.join(modelDir, 'results.json');

    if (!fs.existsSync(modelPath)) {
      return res.status(404).json({ error: 'Model file not found' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment(`trained_model_${trainingId.substring(0, 8)}.zip`);
    archive.pipe(res);

    archive.file(modelPath, { name: 'best_model.pth' });

    if (fs.existsSync(configPath)) {
      archive.file(configPath, { name: 'training_config.json' });
    }

    if (fs.existsSync(resultsPath)) {
      archive.file(resultsPath, { name: 'training_results.json' });
    }

    const readmeContent = `# Trained U-Net Model\n\nTraining ID: ${trainingId}\nGenerated: ${new Date().toISOString()}\n`;
    archive.append(readmeContent, { name: 'README.md' });

    archive.finalize();

    archive.on('error', (err) => {
      if (logger) logger.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create archive' });
    });
  });

  /**
   * Download inference results
   * GET /download-inference-results/:inferenceId
   */
  router.get('/download-inference-results/:inferenceId', requireAuth, (req, res) => {
    const inferenceId = req.params.inferenceId;
    const inference = inferenceSessions.get(inferenceId);

    if (!inference || inference.status !== 'completed') {
      return res.status(404).json({
        error: 'Inference results not found or inference not completed'
      });
    }

    const result = inference.result;
    if (!result) {
      return res.status(404).json({ error: 'Inference result data not found' });
    }

    // Result paths are stored as web paths (/workspaces/...); resolve them
    // to file paths the same way the tiff-info and slice routes do.
    const outputPath = webPathToFilePath(result.output_path);
    const metadataPath = webPathToFilePath(result.metadata_path);
    const visualizationPath = webPathToFilePath(result.visualization_path);

    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({
        error: 'Segmentation result file not found',
        path: outputPath
      });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substr(0, 19);
    res.attachment(`segmentation_results_${timestamp}.zip`);

    archive.on('error', (err) => {
      if (logger) logger.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create archive: ' + err.message });
    });

    archive.pipe(res);

    archive.file(outputPath, { name: path.basename(outputPath) });

    if (metadataPath && fs.existsSync(metadataPath)) {
      archive.file(metadataPath, { name: path.basename(metadataPath) });
    }

    if (visualizationPath && fs.existsSync(visualizationPath)) {
      archive.file(visualizationPath, { name: path.basename(visualizationPath) });
    }

    const readmeContent = `# Segmentation Results\n\nInference ID: ${inferenceId}\nGenerated: ${new Date().toISOString()}\n`;
    archive.append(readmeContent, { name: 'README.md' });

    archive.finalize();
  });

  /**
   * Get original data for web visualization
   * GET /results/:inferenceId/original-data-web
   */
  router.get('/results/:inferenceId/original-data-web', requireAuth, (req, res) => {
    const inferenceId = req.params.inferenceId;
    const inference = inferenceSessions.get(inferenceId);

    if (!inference || !inference.result) {
      return res.status(404).json({
        error: 'Inference session not found or incomplete',
        inferenceId: inferenceId
      });
    }

    const metadataPath = inference.result.metadata_path;

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({ error: 'Metadata file not found' });
    }

    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const overlayData = metadata.original_data_overlay || metadata.original_data_web;

      if (!overlayData || !overlayData.path) {
        return res.status(404).json({
          error: 'Downsampled original data not available for this inference',
          message: 'Original data overlay was not generated during inference'
        });
      }

      const downsampledPath = overlayData.path;

      if (!fs.existsSync(downsampledPath)) {
        return res.status(404).json({ error: 'Downsampled original data file not found' });
      }

      res.sendFile(path.resolve(downsampledPath));

    } catch (error) {
      if (logger) logger.error('Error serving downsampled original data:', error);
      res.status(500).json({ error: 'Failed to serve original data' });
    }
  });

  /**
   * Convert web path to file system path
   * Web path: /workspaces/sessionId/results/...
   * File path: workspaces/sessionId/results/...
   */
  function webPathToFilePath(webPath) {
    if (!webPath) return webPath;
    // Remove leading slash to convert from web path to file system path
    return webPath.startsWith('/') ? webPath.substring(1) : webPath;
  }

  /**
   * Get TIFF info for inference result
   * GET /results/:inferenceId/tiff-info
   */
  router.get('/results/:inferenceId/tiff-info', requireAuth, (req, res) => {
    const inferenceId = req.params.inferenceId;
    const inference = inferenceSessions.get(inferenceId);

    if (!inference || !inference.result) {
      return res.status(404).json({
        success: false,
        error: 'Inference session not found or incomplete',
        inferenceId: inferenceId
      });
    }

    // Convert web path back to file system path
    const webOutputPath = inference.result.output_path;
    const outputPath = webPathToFilePath(webOutputPath);

    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({
        success: false,
        error: 'Result file not found',
        path: outputPath,
        webPath: webOutputPath
      });
    }

    // Spawn Python script to get info
    // Use --no-classes for fast metadata-only read (skips loading entire file)
    const pythonProcess = spawn(PYTHON_PATH, [
      'python/extract_slice.py',
      outputPath,
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
            inferenceId: inferenceId,
            fileName: path.basename(outputPath),
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
  });

  /**
   * Extract and serve a slice from inference result as JPEG
   * GET /results/:inferenceId/slice/:sliceIndex
   * Query params:
   *   - size: 'icon' (128px), 'gallery' (512px), or number (default: 512)
   */
  router.get('/results/:inferenceId/slice/:sliceIndex', requireAuth, (req, res) => {
    const { inferenceId, sliceIndex } = req.params;
    const size = req.query.size || 'gallery';

    // Validate slice index
    const sliceNum = parseInt(sliceIndex, 10);
    if (isNaN(sliceNum) || sliceNum < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid slice index'
      });
    }

    const inference = inferenceSessions.get(inferenceId);

    if (!inference || !inference.result) {
      return res.status(404).json({
        success: false,
        error: 'Inference session not found or incomplete'
      });
    }

    // Convert web path back to file system path
    const outputPath = webPathToFilePath(inference.result.output_path);

    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({
        success: false,
        error: 'Result file not found',
        path: outputPath
      });
    }

    // Create cache directory for result slices
    const resultsDir = path.dirname(outputPath);
    const slicesDir = path.join(resultsDir, '.slices');
    if (!fs.existsSync(slicesDir)) {
      fs.mkdirSync(slicesDir, { recursive: true });
    }

    // Generate cache filename
    const cacheFilename = `${inferenceId}_${sliceIndex}_${size}.jpg`;
    const cachePath = path.join(slicesDir, cacheFilename);

    // Check cache first
    if (fs.existsSync(cachePath)) {
      return res.sendFile(path.resolve(cachePath));
    }

    // Spawn Python script to extract slice
    const pythonProcess = spawn(PYTHON_PATH, [
      'python/extract_slice.py',
      outputPath,
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
  });

  return router;
}

module.exports = createMLRoutes;
