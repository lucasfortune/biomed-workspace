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
const uuid = require('uuid');
const archiver = require('archiver');
const { spawn } = require('child_process');
const { requireAuth, requireApproved } = require('../middleware/auth.middleware');
const { PYTHON_PATH } = require('../config/constants');

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
 * @param {function} dependencies.validateImportedModel - Model validation function
 * @param {function} dependencies.validateInferenceTiff - Inference TIFF validation function
 * @param {function} dependencies.validateTrainingConfig - Config validation function
 * @param {function} dependencies.startTrainingProcess - Training process starter
 * @param {function} dependencies.startInferenceProcess - Inference process starter
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
    validateImportedModel,
    validateInferenceTiff,
    validateTrainingConfig,
    startTrainingProcess,
    startInferenceProcess
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

      // Case 1: Files already uploaded via FileSelector
      if (skipUpload) {
        if (logger) logger.debug('Validating pre-uploaded files...');

        const rawImagesPath = req.body.raw_images_path;
        const annotationsPath = req.body.annotations_path;

        if (!rawImagesPath || !annotationsPath) {
          return res.status(400).json({
            error: 'File paths are required when skipUpload is true'
          });
        }

        const rawFullPath = path.join(workspacePath, rawImagesPath);
        const annFullPath = path.join(workspacePath, annotationsPath);

        if (!fs.existsSync(rawFullPath)) {
          return res.status(400).json({ error: 'Raw images file not found', path: rawImagesPath });
        }
        if (!fs.existsSync(annFullPath)) {
          return res.status(400).json({ error: 'Annotations file not found', path: annotationsPath });
        }

        rawFile = {
          path: rawFullPath,
          filename: path.basename(rawFullPath),
          originalname: path.basename(rawFullPath),
          size: fs.statSync(rawFullPath).size,
          mimetype: 'image/tiff'
        };

        annotationFile = {
          path: annFullPath,
          filename: path.basename(annFullPath),
          originalname: path.basename(annFullPath),
          size: fs.statSync(annFullPath).size,
          mimetype: 'image/tiff'
        };
      }
      // Case 2: Regular file upload
      else {
        if (!req.files.raw_images || !req.files.annotations) {
          return res.status(400).json({
            error: 'Both raw images and annotations are required'
          });
        }
        rawFile = req.files.raw_images[0];
        annotationFile = req.files.annotations[0];
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
          name: rawFile.filename || rawFile.originalname,
          path: rawRelPath,
          category: 'uploads',
          tags: ['raw'],
          size: rawFile.size,
          folderId: null
        });

        const annRelPath = path.relative(workspacePath, annotationFile.path);
        annFileEntry = workspaceManager.addFileToMetadata(sessionId, {
          name: annotationFile.filename || annotationFile.originalname,
          path: annRelPath,
          category: 'uploads',
          tags: ['annotation'],
          size: annotationFile.size,
          folderId: null
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

      // Add num_classes from validation
      const config = req.session.trainingConfig;
      if (req.session.uploadedFiles.validation?.num_classes) {
        config.num_classes = req.session.uploadedFiles.validation.num_classes;
      } else {
        config.num_classes = 3;
      }

      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const trainingParams = {
        session_id: sessionId,
        training_id: trainingId,
        raw_images: req.session.uploadedFiles.raw_images,
        annotations: req.session.uploadedFiles.annotations,
        config: config,
        output_dir: path.join(workspacePath, 'models', 'segmentation', trainingId)
      };

      if (!fs.existsSync(trainingParams.output_dir)) {
        fs.mkdirSync(trainingParams.output_dir, { recursive: true });
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
        // Lineage tracking: raw + annotation input file ids for training outputs
        inputFileIds: [
          req.session.uploadedFiles.raw_images_id,
          req.session.uploadedFiles.annotations_id
        ].filter(Boolean),
        history: [] // Array of {epoch, train_loss, val_loss, train_dice, val_dice}
      });

      if (activityLogger) {
        activityLogger.logTrainingStart(
          req.session.user.username,
          trainingId,
          config
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
      // Case 2: Regular upload
      else {
        if (!req.file) {
          return res.status(400).json({ error: 'No file provided for inference' });
        }
        inferenceFile = req.file;
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
          name: inferenceFile.filename || inferenceFile.originalname,
          path: inferenceRelPath,
          category: 'uploads',
          tags: ['raw'],
          size: inferenceFile.size,
          folderId: null
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

      const modelFile = req.files.model_file[0];
      const configFile = req.files.config_file[0];

      if (!modelFile.originalname.toLowerCase().endsWith('.pth')) {
        return res.status(400).json({
          success: false,
          error: 'Model file must be a .pth file.'
        });
      }

      if (!configFile.originalname.toLowerCase().endsWith('.json')) {
        return res.status(400).json({
          success: false,
          error: 'Config file must be a .json file.'
        });
      }

      const validationResult = await validateImportedModel(modelFile.path, configFile.path);

      if (validationResult.success) {
        const sessionId = req.session.id;
        const workspacePath = workspaceManager.getWorkspacePath(sessionId);

        // Track imported model files in workspace metadata
        // New metadata system: models category with unspecified/weights or unspecified/config tags
        const modelRelPath = path.relative(workspacePath, modelFile.path);
        const modelEntry = workspaceManager.addFileToMetadata(sessionId, {
          name: modelFile.originalname,
          path: modelRelPath,
          category: 'models',
          tags: ['unspecified', 'weights'],
          size: modelFile.size,
          folderId: null
        });

        const configRelPath = path.relative(workspacePath, configFile.path);
        const configEntry = workspaceManager.addFileToMetadata(sessionId, {
          name: configFile.originalname,
          path: configRelPath,
          category: 'models',
          tags: ['unspecified', 'config'],
          size: configFile.size,
          folderId: null
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
          const modelDir = path.join(workspacePath, 'models', 'segmentation', trainingId);
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
      const { model_path, data_path, output_path, training_id, inputFileIds } = req.body;

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

      // Check if using imported model
      if (req.session.importedModel && req.session.importedModel.validated) {
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
      const modelFileId = workspaceManager.getFileIdByPath(
        sessionId,
        path.relative(workspacePath, actualModelPath)
      );

      // Initialize imported model results directories tracking
      if (!req.session.importedModelResultsDirs) {
        req.session.importedModelResultsDirs = [];
      }

      // Generate output directory path (Python script will generate filename)
      let outputDir;
      if (req.session.importedModel && req.session.importedModel.validated) {
        const timestamp = Date.now();
        const importedModelDir = `imported_model_${timestamp}`;
        outputDir = path.join(workspacePath, 'results', 'segmentation', importedModelDir);
        req.session.importedModelResultsDirs.push(outputDir);
      } else if (training_id) {
        outputDir = path.join(workspacePath, 'results', 'segmentation', training_id);
      } else {
        outputDir = path.join(workspacePath, 'results', 'segmentation', `inference_${inferenceId}`);
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
        model_info: req.session.importedModel ? 'Using imported model' : 'Using trained model'
      });

      // Start inference after delay to allow frontend to join room
      setTimeout(() => {
        startInferenceProcess(actualModelPath, actualDataPath, actualOutputPath, inferenceId, io);
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

    const outputPath = result.output_path;

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

    if (result.metadata_path && fs.existsSync(result.metadata_path)) {
      archive.file(result.metadata_path, { name: path.basename(result.metadata_path) });
    }

    if (result.visualization_path && fs.existsSync(result.visualization_path)) {
      archive.file(result.visualization_path, { name: path.basename(result.visualization_path) });
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
