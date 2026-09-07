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
const { validateTrainingConfig } = require('./helpers/validation');

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
const createStitchingRoutes = require('./routes/stitching.routes');
const createPreprocessRoutes = require('./routes/preprocess.routes');
const createSegcleanupRoutes = require('./routes/segcleanup.routes');
const createAdminRoutes = require('./routes/admin.routes');

// Python runner wrappers
const {
  validateTiffStacks: validateTiffStacksPython,
  validateImportedModel: validateImportedModelPython,
  validateInferenceTiff: validateInferenceTiffPython,
  startTrainingProcess: startTrainingProcessPython,
  startInferenceProcess: startInferenceProcessPython
} = require('./helpers/pythonRunner');

// Session tracker
const sessionTracker = require('./services/SessionTracker');

// Lineage helpers
const { createLineage } = require('./helpers/lineageHelpers');
const { buildDisplayName } = require('./helpers/namingHelpers');

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
    denoisingService,
    telegramService
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

        // Chain model display names from the training raw image so they're unique and
        // self-documenting (e.g. trypB_seg_model.pth) instead of duplicate best_model.pth.
        const trainSource = params.raw_images ? path.basename(params.raw_images) : 'training';
        const modelName = (qualifier, ext) => buildDisplayName({
          sourceName: trainSource, operation: 'segmentation', ext, qualifier
        });

        // Training outputs record lineage to the raw + annotation input files.
        // A fresh record per output; empty inputs when the ids are unavailable
        // (never a lineage object without an inputs array).
        const inputIds = (training.inputFileIds || []).filter(Boolean);
        const trainingLineage = () => inputIds.length
          ? createLineage('segmentation-training', inputIds, params.training_id)
          : {
              processType: 'segmentation-training',
              processedAt: new Date().toISOString(),
              inputs: [],
              processId: params.training_id
            };

        // Track model files with appropriate tags
        if (fs.existsSync(modelPath)) {
          await fileService.trackModuleOutput(training.sessionId, modelPath, 'models', { tags: ['weights', 'segmentation'], displayName: modelName('model', '.pth'), lineage: trainingLineage() });
        }
        if (fs.existsSync(configPath)) {
          await fileService.trackModuleOutput(training.sessionId, configPath, 'models', { tags: ['config', 'segmentation'], displayName: modelName('config', '.json'), lineage: trainingLineage() });
        }
        if (fs.existsSync(resultsPath)) {
          await fileService.trackModuleOutput(training.sessionId, resultsPath, 'models', { tags: ['info', 'segmentation'], displayName: modelName('info', '.json'), lineage: trainingLineage() });
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
            // Record the model that produced this output (data inputs stay in
            // `inputs`; the model is an optional annotation on the record)
            if (inf.modelFileId) {
              lineage.modelFileId = inf.modelFileId;
            }
            logger.debug(`[INFERENCE] Built lineage for inference ${inferenceId}:`, lineage);
          }

          await fileService.trackInferenceResults(result, inferenceId, inf.sessionId, resultSource, lineage);
          const workspacePath = workspaceManager.getWorkspacePath(inf.sessionId);
          const convertedResult = convertResultPathsForWeb(result, inf.sessionId, workspacePath);
          inf.result = convertedResult;
        }
      }
    });
  }

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

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
    sessionTracker,
    telegramService
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
    sessionTracker,
    io
  }));

  // Stitching routes
  app.use('/api/stitching', createStitchingRoutes({
    workspaceManager,
    activityLogger,
    logger,
    io
  }));

  // Preprocess routes
  app.use('/api/preprocess', createPreprocessRoutes({
    workspaceManager,
    activityLogger,
    logger,
    io
  }));

  // Segmentation cleanup routes
  app.use('/api/segcleanup', createSegcleanupRoutes({
    workspaceManager,
    activityLogger,
    logger,
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
