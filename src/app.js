/**
 * Express App Factory
 *
 * Creates and configures the Express application with all middleware and routes.
 * This factory pattern allows for easy testing and flexible configuration.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

// Configuration
const { PYTHON_PATH, ensureDirectories, DATA_PATHS } = require('./config/constants');

// Middleware
const { createSessionMiddleware } = require('./middleware/session.middleware');
const { createUploadMiddleware } = require('./middleware/upload.middleware');
const { globalErrorHandler } = require('./middleware/error.middleware');

// Routes
const createStaticRoutes = require('./routes/static.routes');
const createAuthRoutes = require('./routes/auth.routes');
const createFilesRoutes = require('./routes/files.routes');
const createWorkspaceRoutes = require('./routes/workspace.routes');
const createMLRoutes = require('./routes/ml.routes');
const createMeshRoutes = require('./routes/mesh.routes');
const createAnnotationRoutes = require('./routes/annotation.routes');
const createDenoisingRoutes = require('./routes/denoising.routes');
const createAdminRoutes = require('./routes/admin.routes');

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

// Lineage helpers
const { createLineage } = require('./helpers/lineageHelpers');

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
    inferenceService,
    denoisingService
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
      onProcessStart: (process, trainingId) => {
        // Register process with TrainingService for cancellation support
        trainingService.registerProcess(trainingId, process);
      },
      onProcessEnd: (trainingId) => {
        // Unregister process when training completes or fails
        trainingService.unregisterProcess(trainingId);
      },
      onComplete: async (training, params) => {
        const modelPath = path.join(params.output_dir, 'best_model.pth');
        const configPath = path.join(params.output_dir, 'config.json');
        const resultsPath = path.join(params.output_dir, 'results.json');

        // Track model files with appropriate tags
        if (fs.existsSync(modelPath)) {
          await trackModuleOutput(training.sessionId, modelPath, 'models', { tags: ['weights', 'segmentation'] });
        }
        if (fs.existsSync(configPath)) {
          await trackModuleOutput(training.sessionId, configPath, 'models', { tags: ['config', 'segmentation'] });
        }
        if (fs.existsSync(resultsPath)) {
          await trackModuleOutput(training.sessionId, resultsPath, 'models', { tags: ['info', 'segmentation'] });
        }
      }
    });
  }

  function startInferenceProcess(modelPath, dataPath, outputPath, inferenceId, ioInstance) {
    return startInferenceProcessPython(PYTHON_PATH, modelPath, dataPath, outputPath, inferenceId, ioInstance, inferenceSessions, {
      logger,
      onSuccess: async (result, resultSource, inf) => {
        if (inf && result) {
          // Build lineage from inference session's input file IDs
          let lineage = null;
          if (inf.inputFileIds && inf.inputFileIds.length > 0) {
            lineage = createLineage('segmentation', inf.inputFileIds, inferenceId);
            logger.debug(`[INFERENCE] Built lineage for inference ${inferenceId}:`, lineage);
          }

          await trackInferenceResults(result, inferenceId, inf.sessionId, resultSource, lineage);
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

    // Optional direction-aware training parameters
    if (config.alpha !== undefined && (config.alpha < 0 || config.alpha > 10)) {
      errors.push('alpha must be between 0 and 10');
    }
    if (config.lambda_dir !== undefined && (config.lambda_dir < 0 || config.lambda_dir > 5)) {
      errors.push('lambda_dir must be between 0 and 5');
    }
    if (config.context_slices !== undefined && ![3, 5, 7].includes(config.context_slices)) {
      errors.push('context_slices must be 3, 5, or 7');
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
        folderId: null,
        ...metadata  // Spread metadata to include lineage if provided
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
    if (result.direction_output_path) {
      convertedResult.direction_output_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.direction_output_path);
    }

    return convertedResult;
  }

  async function trackInferenceResults(result, inferenceId, sessionId, source, lineage = null) {
    if (!result || !result.success) {
      logger.debug(`[TRACKING] Skipping tracking - result not successful (source: ${source})`);
      return;
    }

    logger.debug(`[TRACKING] Tracking inference results from ${source} for inference ${inferenceId}`);
    if (lineage) {
      logger.debug(`[TRACKING] Including lineage: ${JSON.stringify(lineage)}`);
    }

    const filesToTrack = [
      { path: result.output_path, category: 'results', tags: ['segmentation', 'data'] },
      { path: result.metadata_path, category: 'results', tags: ['segmentation', 'info'] },
      { path: result.visualization_path, category: 'results', tags: ['segmentation', 'info'] },
      { path: result.direction_output_path, category: 'results', tags: ['direction_volume', 'inference'] }
    ];

    for (const file of filesToTrack) {
      if (file.path && fs.existsSync(file.path)) {
        // Pass lineage and tags as part of metadata
        await trackModuleOutput(sessionId, file.path, file.category, { lineage, tags: file.tags });
        logger.debug(`[TRACKING] Tracked ${path.basename(file.path)} (${file.category}, tags: ${file.tags.join(', ')})`);
      }
    }

    logger.debug(`[TRACKING] Completed tracking for inference ${inferenceId} (source: ${source})`);
  }

  // =============================================================================
  // MIDDLEWARE CONFIGURATION
  // =============================================================================

  // Trust proxy - required when behind a reverse proxy (Caddy, Nginx, etc.)
  // This allows Express to correctly handle secure cookies over HTTPS
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Security headers with Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://unpkg.com"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false, // Required for loading external scripts
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow loading resources
  }));

  // Session middleware
  app.use(createSessionMiddleware(env, { sessionsDir: DATA_PATHS.sessions }));

  // CORS configuration
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  app.use(cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // In development, allow all origins
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));

  // JSON parsing
  app.use(express.json({ limit: '100mb' }));

  // =============================================================================
  // ROUTE REGISTRATION
  // =============================================================================

  // Static routes (HTML pages, static files, workspace file serving)
  app.use(createStaticRoutes({ workspaceService }));

  // Auth routes (login, register, logout, check-auth)
  app.use(createAuthRoutes({
    authService,
    activityLogger,
    logger,
    workspaceManager,
    sessionTracker
  }));

  // Files routes at /api/workspace
  app.use('/api/workspace', createFilesRoutes({ workspaceManager, workspaceService, activityLogger, logger }));

  // Configure multer for file uploads
  const { upload, uploadImport, uploadWorkspaceZip } = createUploadMiddleware(workspaceManager, logger);

  // Workspace routes at /api/workspace
  app.use('/api/workspace', createWorkspaceRoutes({
    workspaceManager,
    workspaceService,
    fileService,
    activityLogger,
    logger,
    io,
    upload,
    uploadWorkspaceZip
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

  // Mesh generation routes
  app.use('/api/mesh', createMeshRoutes({
    workspaceManager,
    sessionTracker,
    activityLogger,
    logger,
    io,
    upload
  }));

  // Annotation routes
  app.use('/api/annotation', createAnnotationRoutes({
    workspaceManager,
    sessionTracker,
    activityLogger,
    logger,
    io
  }));

  // Denoising routes
  app.use('/api/denoising', createDenoisingRoutes({
    workspaceManager,
    workspaceService,
    activityLogger,
    logger,
    denoisingService,
    io
  }));

  // Admin routes
  app.use('/admin', createAdminRoutes({
    authService,
    sessionTracker,
    denoisingService,
    logger,
    activityLogger
  }));

  // Ensure directories exist
  ensureDirectories();

  // Error handling middleware (must be last)
  app.use(globalErrorHandler);
}

module.exports = configureApp;
