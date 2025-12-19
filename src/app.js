/**
 * Express App Factory
 *
 * Creates and configures the Express application with all middleware and routes.
 * This factory pattern allows for easy testing and flexible configuration.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Configuration
const { PYTHON_PATH, ensureDirectories } = require('./config/constants');

// Middleware
const { createSessionMiddleware } = require('./middleware/session.middleware');
const { createUploadMiddleware } = require('./middleware/upload.middleware');
const { globalErrorHandler } = require('./middleware/error.middleware');

// Routes
const createStaticRoutes = require('./routes/static.routes');
const createAuthRoutes = require('./routes/auth.routes');
const createFoldersRoutes = require('./routes/folders.routes');
const createFilesRoutes = require('./routes/files.routes');
const createWorkspaceRoutes = require('./routes/workspace.routes');
const createMLRoutes = require('./routes/ml.routes');

// Python runner wrappers
const {
  validateTiffStacks: validateTiffStacksPython,
  validateImportedModel: validateImportedModelPython,
  validateInferenceTiff: validateInferenceTiffPython,
  generateThumbnail: generateThumbnailPython,
  startTrainingProcess: startTrainingProcessPython,
  startInferenceProcess: startInferenceProcessPython
} = require('./helpers/pythonRunner');

// Session tracker
const sessionTracker = require('./services/SessionTracker');

/**
 * Configure an Express application with all middleware and routes
 * @param {Express} app - Express application instance to configure
 * @param {object} dependencies - External dependencies
 * @param {object} dependencies.env - Environment configuration
 * @param {object} dependencies.logger - Logger instance
 * @param {object} dependencies.io - Socket.IO instance
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.services - Service instances
 * @param {object} dependencies.activityLogger - Activity logger instance
 */
function configureApp(app, dependencies) {
  const {
    env,
    logger,
    io,
    workspaceManager,
    services,
    activityLogger
  } = dependencies;

  const {
    workspaceService,
    fileService,
    authService,
    trainingService,
    inferenceService
  } = services;

  // Aliases for backward compatibility
  const trainingSessions = sessionTracker.trainingSessions;
  const inferenceSessions = sessionTracker.inferenceSessions;

  // =============================================================================
  // PYTHON RUNNER WRAPPERS
  // =============================================================================

  function validateTiffStacks(rawPath, annotationPath) {
    return validateTiffStacksPython(PYTHON_PATH, rawPath, annotationPath, { logger });
  }

  function validateImportedModel(modelPath, configPath) {
    return validateImportedModelPython(PYTHON_PATH, modelPath, configPath, { logger });
  }

  function validateInferenceTiff(filePath) {
    return validateInferenceTiffPython(PYTHON_PATH, filePath, { logger });
  }

  function startTrainingProcess(params, ioInstance) {
    return startTrainingProcessPython(PYTHON_PATH, params, ioInstance, trainingSessions, {
      logger,
      onComplete: async (training, params) => {
        const modelPath = path.join(params.output_dir, 'best_model.pth');
        const configPath = path.join(params.output_dir, 'config.json');
        const resultsPath = path.join(params.output_dir, 'results.json');

        if (fs.existsSync(modelPath)) {
          await trackModuleOutput(training.sessionId, modelPath, 'models');
        }
        if (fs.existsSync(configPath)) {
          await trackModuleOutput(training.sessionId, configPath, 'models');
        }
        if (fs.existsSync(resultsPath)) {
          await trackModuleOutput(training.sessionId, resultsPath, 'models');
        }
      }
    });
  }

  function startInferenceProcess(modelPath, dataPath, outputPath, inferenceId, ioInstance) {
    return startInferenceProcessPython(PYTHON_PATH, modelPath, dataPath, outputPath, inferenceId, ioInstance, inferenceSessions, {
      logger,
      onSuccess: async (result, resultSource, inf) => {
        if (inf && result) {
          await trackInferenceResults(result, inferenceId, inf.sessionId, resultSource);
          const workspacePath = workspaceManager.getWorkspacePath(inf.sessionId);
          const convertedResult = convertResultPathsForWeb(result, inf.sessionId, workspacePath);
          inf.result = convertedResult;
        }
      }
    });
  }

  function validateTrainingConfig(config) {
    const errors = [];
    const required = ['patch_size', 'patches_per_image', 'batch_size', 'num_epochs', 'learning_rate', 'features', 'num_layers'];

    for (const field of required) {
      if (!config[field]) {
        errors.push(`${field} is required`);
      }
    }

    if (config.patch_size && (config.patch_size < 64 || config.patch_size > 1024)) {
      errors.push('patch_size must be between 64 and 1024');
    }

    if (config.learning_rate && (config.learning_rate <= 0 || config.learning_rate > 1)) {
      errors.push('learning_rate must be between 0 and 1');
    }

    return { valid: errors.length === 0, errors };
  }

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

  async function trackModuleOutput(sessionId, filePath, category, metadata = {}) {
    try {
      const fileName = path.basename(filePath);
      const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);
      const relativePath = path.relative(workspacePath, filePath);

      const fileEntry = workspaceManager.addFileToMetadata(sessionId, {
        name: fileName,
        path: relativePath,
        category: category,
        size: fileSize,
        folderId: null
      });

      logger.debug(`Tracked ${category} output:`, fileName);

      const ext = path.extname(fileName).toLowerCase();
      if (ext === '.tif' || ext === '.tiff') {
        const thumbnailsDir = path.join(workspacePath, '.thumbnails');
        if (!fs.existsSync(thumbnailsDir)) {
          fs.mkdirSync(thumbnailsDir, { recursive: true });
        }

        const thumbnailPath = path.join(thumbnailsDir, `${fileEntry.id}.jpg`);

        generateThumbnailPython(PYTHON_PATH, filePath, thumbnailPath, { logger })
          .then(async (success) => {
            if (success) {
              await workspaceManager.setThumbnailPath(
                sessionId,
                fileEntry.id,
                `.thumbnails/${fileEntry.id}.jpg`
              );
            }
          });
      }

      return fileEntry;
    } catch (error) {
      logger.error('Error tracking module output:', error);
      return null;
    }
  }

  function convertResultPathsForWeb(result, sessionId, workspacePath) {
    const resultsDir = path.join(workspacePath, 'results');
    const convertedResult = { ...result };

    if (result.output_path) {
      convertedResult.output_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.output_path);
    }
    if (result.metadata_path) {
      convertedResult.metadata_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.metadata_path);
    }
    if (result.visualization_path) {
      convertedResult.visualization_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.visualization_path);
    }
    if (result.original_data_overlay_path) {
      convertedResult.original_data_overlay_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.original_data_overlay_path);
    }

    return convertedResult;
  }

  async function trackInferenceResults(result, inferenceId, sessionId, source) {
    if (!result || !result.success) {
      logger.debug(`[TRACKING] Skipping tracking - result not successful (source: ${source})`);
      return;
    }

    logger.debug(`[TRACKING] Tracking inference results from ${source} for inference ${inferenceId}`);

    const filesToTrack = [
      { path: result.output_path, category: 'segmentations' },
      { path: result.metadata_path, category: 'segmentations' },
      { path: result.visualization_path, category: 'segmentations' }
    ];

    for (const file of filesToTrack) {
      if (file.path && fs.existsSync(file.path)) {
        await trackModuleOutput(sessionId, file.path, file.category);
        logger.debug(`[TRACKING] Tracked ${path.basename(file.path)} (${file.category})`);
      }
    }

    logger.debug(`[TRACKING] Completed tracking for inference ${inferenceId} (source: ${source})`);
  }

  // =============================================================================
  // MIDDLEWARE CONFIGURATION
  // =============================================================================

  // Session middleware
  app.use(createSessionMiddleware(env));

  // CORS and JSON parsing
  app.use(cors());
  app.use(express.json());

  // =============================================================================
  // ROUTE REGISTRATION
  // =============================================================================

  // Static routes (HTML pages, static files, workspace file serving)
  app.use(createStaticRoutes({ workspaceService }));

  // Auth routes (login, register, logout, check-auth)
  app.use(createAuthRoutes({ authService, activityLogger, logger }));

  // Folders routes at /api/workspace
  app.use('/api/workspace', createFoldersRoutes({ workspaceService, activityLogger, logger }));

  // Files routes at /api/workspace
  app.use('/api/workspace', createFilesRoutes({ workspaceManager, workspaceService, activityLogger, logger }));

  // Configure multer for file uploads
  const { upload, uploadImport } = createUploadMiddleware(workspaceManager, logger);

  // Workspace routes at /api/workspace
  app.use('/api/workspace', createWorkspaceRoutes({
    workspaceManager,
    workspaceService,
    fileService,
    activityLogger,
    logger,
    upload
  }));

  // ML pipeline routes
  app.use(createMLRoutes({
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
  }));

  // Ensure directories exist
  ensureDirectories();

  // Error handling middleware (must be last)
  app.use(globalErrorHandler);
}

module.exports = configureApp;
