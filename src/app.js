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
const { localModeUser } = require('./middleware/localMode.middleware');
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
const createBioimageioRoutes = require('./routes/bioimageio.routes');
const BioimageioService = require('./services/BioimageioService');

// Python runner wrappers
const {
  validateTiffStacks: validateTiffStacksPython,
  validateTrainingPairs: validateTrainingPairsPython,
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
    sessionMiddleware,
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

  function validateTrainingPairs(pairsFile) {
    return validateTrainingPairsPython(PYTHON_PATH, pairsFile, { logger });
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

        // Chain model display names from the training raw image's display
        // name so they're unique and self-documenting (e.g. trypB_seg_model.pth).
        // A run that continued from a parent model (ADR-017) carries the
        // fine-tune token instead (trypB_ft_model.pth).
        const start = training.startModel || null;
        const trainSource = training.rawFileId
          ? workspaceManager.getSourceDisplayName(training.sessionId, training.rawFileId, 'training')
          : (params.raw_images ? path.basename(params.raw_images) : 'training');
        const modelName = (qualifier, ext) => buildDisplayName({
          sourceName: trainSource, operation: start ? 'finetune' : 'segmentation', ext, qualifier
        });

        // Training outputs record lineage to the raw + annotation input files
        // (data only); the parent model of a fine-tuning run is recorded as
        // modelFileId (ADR-012/018). A fresh record per output; empty inputs
        // when the ids are unavailable (never a lineage object without an
        // inputs array).
        const processType = start ? 'segmentation-finetune' : 'segmentation-training';
        const inputIds = (training.inputFileIds || []).filter(Boolean);
        const trainingLineage = () => {
          const lineage = inputIds.length
            ? createLineage(processType, inputIds, params.training_id)
            : {
                processType,
                processedAt: new Date().toISOString(),
                inputs: [],
                processId: params.training_id
              };
          if (training.parentFileId) lineage.modelFileId = training.parentFileId;
          return lineage;
        };

        // Fine-tuned bioimage.io package (ADR-017): tracked like an export so
        // Step 1's package selector and Step 4 pick it up. It is the main
        // output of a package run; config/results hang off it.
        let mainId = null;
        let mainName = null;
        const pkg = training.outputPackage;
        if (pkg && pkg.zip_path && fs.existsSync(pkg.zip_path)) {
          const parentName = (start && (start.displayName || start.name)) || 'model';
          const entry = await fileService.trackModuleOutput(training.sessionId, pkg.zip_path, 'models', {
            tags: ['bioimageio', 'weights', 'segmentation'],
            displayName: buildDisplayName({ sourceName: parentName, operation: 'finetune', ext: '.zip' }),
            lineage: trainingLineage(),
            adoptName: true
          });
          if (entry && entry.absolutePath) pkg.zip_path = entry.absolutePath;
          pkg.fileId = entry ? entry.id : null;
          pkg.fileName = entry ? (entry.displayName || entry.name) : path.basename(pkg.zip_path);
          pkg.relPath = entry ? entry.path : null;
          if (entry) {
            mainId = entry.id;
            mainName = buildDisplayName({ sourceName: parentName, operation: 'finetune', ext: '' });
          }
        }

        // Track model files with appropriate tags (fixed physical names
        // best_model.pth / config.json / results.json inside train<n>/)
        if (fs.existsSync(modelPath)) {
          const entry = await fileService.trackModuleOutput(training.sessionId, modelPath, 'models', { tags: ['weights', 'segmentation'], displayName: modelName('model', '.pth'), lineage: trainingLineage() });
          if (entry) mainId = entry.id;
        }
        const auxName = (qualifier, ext) => mainName
          ? `${mainName}_${qualifier}${ext}`
          : modelName(qualifier, ext);
        if (fs.existsSync(configPath)) {
          await fileService.trackModuleOutput(training.sessionId, configPath, 'models', { tags: ['config', 'segmentation'], displayName: auxName('config', '.json'), lineage: trainingLineage(), parentId: mainId });
        }
        if (fs.existsSync(resultsPath)) {
          await fileService.trackModuleOutput(training.sessionId, resultsPath, 'models', { tags: ['info', 'segmentation'], displayName: auxName('info', '.json'), lineage: trainingLineage(), parentId: mainId });
        }
      }
    });
  }

  function startInferenceProcess(modelPath, dataPath, outputPath, inferenceId, ioInstance, runOptions = {}) {
    return startInferenceProcessPython(PYTHON_PATH, modelPath, dataPath, outputPath, inferenceId, ioInstance, inferenceSessions, {
      logger,
      script: runOptions.script,
      extraArgs: runOptions.extraArgs,
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
        // bioimage.io model covers in the Segmentation module's zoo list (ADR-015)
        imgSrc: ["'self'", "data:", "blob:", "https://hypha.aicell.io"],
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

  // Session middleware (the shared instance also attached to Socket.IO;
  // created here only when the caller doesn't provide one, e.g. in tests)
  app.use(sessionMiddleware || createSessionMiddleware(env, { sessionsDir: DATA_PATHS.sessions }));
  app.use(localModeUser); // no-op unless LOCAL_MODE (ADR-019)

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

  // bioimage.io service (ADR-015 zoo, ADR-016 export, ADR-017 starting points)
  const bioimageioService = services.bioimageioService || new BioimageioService({
    pythonPath: PYTHON_PATH,
    workspaceManager,
    fileService,
    logger
  });

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
    validateTrainingPairs,
    validateImportedModel,
    validateInferenceTiff,
    validateTrainingConfig,
    startTrainingProcess,
    startInferenceProcess,
    bioimageioService
  }));

  // bioimage.io model zoo routes (ADR-015)
  app.use('/api/bioimageio', createBioimageioRoutes({
    bioimageioService,
    workspaceManager,
    activityLogger,
    logger
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
