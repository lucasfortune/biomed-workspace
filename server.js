// Load environment configuration FIRST (before any other requires)
const { initializeEnvironment } = require('./utils/envLoader');
const env = initializeEnvironment();

// Load logger (after env is initialized)
const logger = require('./utils/logger');

const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const uuid = require('uuid');
const archiver = require('archiver');
const bcrypt = require('bcrypt');
const activityLogger = require('./activityLogger');
const WorkspaceManager = require('./WorkspaceManager');
const { attachErrorHandler, createTrainingErrorHandler, createInferenceErrorHandler } = require('./utils/processErrorHandler');

// =============================================================================
// REFACTORED MODULES (Phase 1)
// =============================================================================
const {
  PYTHON_PATH,
  DIRECTORIES,
  UPLOAD_LIMITS,
  SESSION_CONFIG,
  PYTHON_SCRIPTS,
  validatePythonPath,
  ensureDirectories
} = require('./src/config/constants');
const {
  validateTrainingConfig: validateTrainingConfigHelper,
  validateTiffStacks: validateTiffStacksHelper,
  validateImportedModel: validateImportedModelHelper,
  validateInferenceTiff: validateInferenceTiffHelper
} = require('./src/helpers/validation');
const {
  convertResultPathsForWeb: convertResultPathsForWebHelper
} = require('./src/helpers/pathHelpers');
const {
  deleteDirectory: deleteDirectoryHelper
} = require('./src/helpers/fileHelpers');
const sessionTracker = require('./src/services/SessionTracker');

// =============================================================================
// REFACTORED MODULES (Phase 2 - Middleware)
// =============================================================================
const {
  requireAuth,
  requireApproved,
  requireAdmin
} = require('./src/middleware/auth.middleware');
const {
  createUploadMiddleware,
  handleMulterError
} = require('./src/middleware/upload.middleware');
const {
  createSessionMiddleware
} = require('./src/middleware/session.middleware');
const {
  globalErrorHandler
} = require('./src/middleware/error.middleware');

// =============================================================================
// REFACTORED MODULES (Phase 3 - Sockets)
// =============================================================================
const {
  initializeSocketHandlers
} = require('./src/sockets');

// =============================================================================
// REFACTORED MODULES (Phase 4 - Services)
// =============================================================================
const {
  AuthService,
  WorkspaceService,
  FileService,
  TrainingService,
  InferenceService
} = require('./src/services');

// =============================================================================
// REFACTORED MODULES (Phase 5 - Routes)
// =============================================================================
const createStaticRoutes = require('./src/routes/static.routes');
const createAuthRoutes = require('./src/routes/auth.routes');
const createFoldersRoutes = require('./src/routes/folders.routes');
const createFilesRoutes = require('./src/routes/files.routes');
const createWorkspaceRoutes = require('./src/routes/workspace.routes');
const createMLRoutes = require('./src/routes/ml.routes');

// Aliases for backward compatibility with existing code
const trainingSessions = sessionTracker.trainingSessions;
const inferenceSessions = sessionTracker.inferenceSessions;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = env.PORT;

// Initialize Socket.IO handlers (Phase 3 refactoring)
initializeSocketHandlers(io, logger);

// Validate Python interpreter exists at startup (using imported function)
if (!validatePythonPath()) {
  process.exit(1);
}
logger.info('Python interpreter found at:', PYTHON_PATH);

// Initialize WorkspaceManager
const workspaceManager = new WorkspaceManager();

// =============================================================================
// SERVICE INITIALIZATION (Phase 4)
// =============================================================================
// Note: Services are initialized here but existing functions are kept for
// backward compatibility during gradual migration. Replace inline functions
// with service calls incrementally.

const workspaceService = new WorkspaceService({
  workspaceManager,
  activityLogger,
  logger
});

const fileService = new FileService({
  workspaceService,
  pythonPath: PYTHON_PATH,
  logger
});

const authService = new AuthService({
  usersFilePath: path.join(process.cwd(), 'users.json'),
  activityLogger,
  logger
});

const trainingService = new TrainingService({
  pythonPath: PYTHON_PATH,
  sessionTracker,
  fileService,
  logger
});

const inferenceService = new InferenceService({
  pythonPath: PYTHON_PATH,
  sessionTracker,
  fileService,
  workspaceService,
  logger
});

/**
 * Helper function to track module outputs in file browser
 * @param {string} sessionId - Session ID
 * @param {string} filePath - Absolute path to the output file
 * @param {string} category - File category (models, segmentations, denoised, etc.)
 * @param {object} metadata - Optional metadata about the file
 * @returns {Promise<object>} File entry object
 */
async function trackModuleOutput(sessionId, filePath, category, metadata = {}) {
  try {
    const fileName = path.basename(filePath);
    const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

    // Get relative path from workspace root
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

    // Generate thumbnail for TIFF files (async, don't wait)
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.tif' || ext === '.tiff') {
      const { spawn } = require('child_process');
      const thumbnailsDir = path.join(workspacePath, '.thumbnails');
      if (!fs.existsSync(thumbnailsDir)) {
        fs.mkdirSync(thumbnailsDir, { recursive: true });
      }

      const thumbnailPath = path.join(thumbnailsDir, `${fileEntry.id}.jpg`);

      spawn(PYTHON_PATH, [
        'python/generate_thumbnail.py',
        filePath,
        thumbnailPath
      ]).on('close', async (code) => {
        if (code === 0) {
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

/**
 * Convert inference result paths from absolute to web-accessible paths
 * @param {object} result - Result object with file paths
 * @param {string} sessionId - Session ID
 * @param {string} workspacePath - Workspace root path
 * @returns {object} Result object with converted paths
 */
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

/**
 * Track inference result files in workspace metadata (SINGLE tracking point)
 * @param {object} result - Result object with file paths (absolute paths)
 * @param {string} inferenceId - Inference ID
 * @param {string} sessionId - Session ID
 * @param {string} source - Source of result (FINAL_RESULT, BUFFER_JSON, MANUAL)
 * @returns {Promise<void>}
 */
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

// Session configuration with file-based storage for persistence
// NOTE: Using createSessionMiddleware from Phase 2 refactoring
app.use(createSessionMiddleware(env));

// Middleware
app.use(cors());
app.use(express.json());

// =============================================================================
// STATIC ROUTES (Phase 5 Integration)
// =============================================================================
// Register static routes (HTML pages, static files, workspace file serving)
app.use(createStaticRoutes({ workspaceService }));

// Register auth routes (login, register, logout, check-auth)
app.use(createAuthRoutes({ authService, activityLogger, logger }));

// Register folders routes at /api/workspace (folder CRUD)
app.use('/api/workspace', createFoldersRoutes({ workspaceService, activityLogger, logger }));

// Register files routes at /api/workspace (file CRUD, batch operations, search)
app.use('/api/workspace', createFilesRoutes({ workspaceManager, workspaceService, activityLogger, logger }));

// Configure multer for file uploads
// NOTE: Using createUploadMiddleware factory from Phase 2 refactoring
const { upload, uploadImport } = createUploadMiddleware(workspaceManager, logger);

// Register workspace routes at /api/workspace (init, status, upload, stats, thumbnails)
// NOTE: Must be registered after upload middleware is created
app.use('/api/workspace', createWorkspaceRoutes({
  workspaceManager,
  workspaceService,
  fileService,
  activityLogger,
  logger,
  upload
}));

// Register ML pipeline routes (training, inference, model import, etc.)
// NOTE: Helper functions (validateTiffStacks, startTrainingProcess, etc.) are hoisted
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

// NOTE: trainingSessions and inferenceSessions are now imported from SessionTracker
// (aliases defined at top of file for backward compatibility)

// Ensure directories exist (using imported function)
ensureDirectories();

// ==============================================================================
// AUTHENTICATION MIDDLEWARE
// ==============================================================================
// NOTE: requireAuth, requireApproved, requireAdmin are now imported from
// ./src/middleware/auth.middleware.js (Phase 2 refactoring)

// ==============================================================================
// USER MANAGEMENT FUNCTIONS
// ==============================================================================

const usersFilePath = path.join(__dirname, 'users.json');

/**
 * Load users from file
 */
function loadUsers() {
  if (!fs.existsSync(usersFilePath)) {
    return { users: [] };
  }
  const data = fs.readFileSync(usersFilePath, 'utf8');
  return JSON.parse(data);
}

/**
 * Save users to file
 */
function saveUsers(usersData) {
  fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
}

/**
 * Generate unique user ID
 */
function generateUserId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/**
 * Find user by username
 */
function findUserByUsername(username) {
  const usersData = loadUsers();
  return usersData.users.find(u => u.username === username);
}

// ==============================================================================
// AUTHENTICATION ROUTES
// ==============================================================================

// NOTE: /login, /register, /admin HTML routes moved to static.routes.js (Phase 5)
// NOTE: /check-auth, POST /register, POST /login, POST /logout routes moved to auth.routes.js (Phase 5)

// NOTE: Workspace API routes moved to workspace.routes.js (Phase 5)
// Routes: /api/workspace/init, /api/workspace/status, /api/workspace/files,
//         /api/workspace/upload, /api/workspace/stats, /api/workspace/thumbnail/:fileId

// NOTE: File operations endpoints moved to files.routes.js (Phase 5)
// Routes: GET/DELETE /api/workspace/file/:fileId, PATCH move/rename, batch-delete, batch-download, search, category

// NOTE: Folder operations endpoints moved to folders.routes.js (Phase 5)
// Routes: GET/POST /api/workspace/folders, PATCH/DELETE /api/workspace/folders/:folderId


// NOTE: ML pipeline routes moved to ml.routes.js (Phase 5)
// Routes: /upload-data, /configure-training, /start-training, /training-status/:trainingId
//         /upload-inference, /import-pretrained-model, /verify-imported-model
//         /run-inference, /download-model/:trainingId, /download-inference-results/:inferenceId
//         /results/:inferenceId/original-data-web, /reset-session, /inference-status/:inferenceId

// Helper functions
async function validateTiffStacks(rawPath, annotationPath) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      'python/validate_tiff.py',
      rawPath,
      annotationPath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
      // Log Python output to console for debugging (includes conversion messages)
      const message = data.toString().trim();
      if (message) {
        logger.debug('[Python Validation]:', message);
      }
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
      // Log errors to console
      const message = data.toString().trim();
      if (message) {
        logger.error('[Python Validation Error]:', message);
      }
    });

    pythonScript.on('close', (code) => {
      // Always try to parse the JSON output first, regardless of exit code
      // The Python script always outputs valid JSON
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        // If JSON parsing fails, fall back to generic error
        logger.error('Failed to parse validation output:', output);
        logger.error('Stderr:', error);
        resolve({ 
          valid: false, 
          error: error || 'Invalid validation output - failed to parse JSON response'
        });
      }
    });
  });
}

// Helper function to validate imported model
async function validateImportedModel(modelPath, configPath) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      'python/validate_imported_model.py',
      modelPath,
      configPath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonScript.on('close', (code) => {
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        resolve({
          success: false,
          error: 'Failed to parse validation results: ' + (error || e.message)
        });
      }
    });
  });
}

function validateTrainingConfig(config) {
  const errors = [];
  
  // Required fields
  const required = ['patch_size', 'patches_per_image', 'batch_size', 'num_epochs', 'learning_rate', 'features', 'num_layers'];
  
  for (const field of required) {
    if (!config[field]) {
      errors.push(`${field} is required`);
    }
  }

  // Validate ranges
  if (config.patch_size && (config.patch_size < 64 || config.patch_size > 1024)) {
    errors.push('patch_size must be between 64 and 1024');
  }

  if (config.learning_rate && (config.learning_rate <= 0 || config.learning_rate > 1)) {
    errors.push('learning_rate must be between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function startTrainingProcess(params, io) {
  const pythonScript = spawn(PYTHON_PATH, [
    'python/train_model.py',
    '--config', JSON.stringify(params.config),
    '--raw_images', params.raw_images,
    '--annotations', params.annotations,
    '--output_dir', params.output_dir,
    '--training_id', params.training_id
  ]);

  // Attach unified error handler (handles spawn errors and stderr buffering)
  const stderrBuffer = attachErrorHandler(
    pythonScript,
    createTrainingErrorHandler(params.training_id, PYTHON_PATH, io, trainingSessions)
  );

  let outputBuffer = '';

  pythonScript.stdout.on('data', (data) => {
    const output = data.toString();
    logger.debug('Training output:', output);

    // Add to buffer
    outputBuffer += output;

    // Process complete lines
    const lines = outputBuffer.split('\n');
    outputBuffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('PROGRESS:')) {
        try {
          const progressData = line.substring(9);
          const progress = JSON.parse(progressData);

          logger.debug('Parsed progress:', progress);

          // Update training session
          const training = trainingSessions.get(params.training_id);
          if (training) {
            training.status = 'training';
            training.current_epoch = progress.epoch;
            training.total_epochs = progress.total_epochs;
            training.metrics = progress.metrics;
          }

          // Send real-time update to clients
          io.to(`training-${params.training_id}`).emit('training-progress', progress);
          logger.debug(`Emitted progress to room: training-${params.training_id}`);

        } catch (e) {
          logger.error('Error parsing progress data:', e.message);
        }
      }
    }
  });

  pythonScript.on('close', async (code) => {
    const training = trainingSessions.get(params.training_id);
    if (training) {
      if (code === 0) {
        training.status = 'completed';
        training.endTime = new Date();
        io.to(`training-${params.training_id}`).emit('training-complete', { success: true });

        // Track training outputs in file browser
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
      } else {
        training.status = 'failed';
        training.endTime = new Date();

        // Include stderr output in error message
        const stderrOutput = stderrBuffer.getBuffer();
        const errorMessage = stderrOutput || 'Training failed with unknown error';

        logger.error(`[TRAINING] Process failed with code ${code}`);
        logger.error(`[TRAINING] stderr output: ${stderrOutput}`);

        io.to(`training-${params.training_id}`).emit('training-complete', {
          success: false,
          error: errorMessage
        });
      }
    }
  });
}

async function validateInferenceTiff(filePath) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      'python/validate_inference_tiff.py',
      filePath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonScript.on('close', (code) => {
      // Always try to parse the JSON output first, regardless of exit code
      // The Python script always outputs valid JSON
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        // If JSON parsing fails, fall back to generic error
        logger.error('Failed to parse validation output:', output);
        logger.error('Stderr:', error);
        resolve({ 
          valid: false, 
          error: error || 'Invalid validation output - failed to parse JSON response'
        });
      }
    });
  });
}

async function runInferenceWithProgress(modelPath, dataPath, outputPath, inferenceId, io) {
  return new Promise((resolve, reject) => {
    const pythonScript = spawn(PYTHON_PATH, [
      'python/run_inference.py',
      '--model', modelPath,
      '--input', dataPath,
      '--output', outputPath,
      '--inference_id', inferenceId
    ]);

    // Attach unified error handler (handles spawn errors and stderr buffering)
    const stderrBuffer = attachErrorHandler(
      pythonScript,
      createInferenceErrorHandler(inferenceId, PYTHON_PATH, io, inferenceSessions, (error) => {
        // Custom error callback - reject the promise on spawn error
        reject(error);
      })
    );

    let outputBuffer = '';
    let finalResult = null;
    let backupJsonLines = [];
    let collectingBackupJson = false;

    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();
      logger.debug('Inference output:', output);
      
      // Add to buffer
      outputBuffer += output;
      
      // Process complete lines
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('INFERENCE_PROGRESS:')) {
          try {
            const progressData = line.substring(19);
            const progress = JSON.parse(progressData);
            
            logger.debug('Parsed inference progress:', progress);
            
            // Update inference session
            const inference = inferenceSessions.get(inferenceId);
            if (inference) {
              inference.currentSlice = progress.current_slice;
              inference.totalSlices = progress.total_slices;
              inference.progress = progress.progress_percent;
            }
            
            // Send real-time update to clients
            io.to(`inference-${inferenceId}`).emit('inference-progress', progress);
            logger.debug(`Emitted inference progress to room: inference-${inferenceId}`);
            
          } catch (e) {
            logger.error('Error parsing inference progress data:', e.message);
          }
        } else if (line.startsWith('FINAL_RESULT:')) {
          try {
            const resultData = line.substring(13);
            finalResult = JSON.parse(resultData);
            logger.debug('Parsed final result:', finalResult);
          } catch (e) {
            logger.error('Error parsing final result:', e.message);
            finalResult = { success: false, error: 'Failed to parse final result' };
          }
        } else if (line === 'BACKUP_JSON_START') {
          collectingBackupJson = true;
          backupJsonLines = [];
          logger.debug('Started collecting backup JSON');
        } else if (line === 'BACKUP_JSON_END') {
          collectingBackupJson = false;
          logger.debug('Finished collecting backup JSON');
          
          // Try to parse backup JSON if we don't have final result yet
          if (!finalResult && backupJsonLines.length > 0) {
            try {
              const backupJsonString = backupJsonLines.join('\n');
              finalResult = JSON.parse(backupJsonString);
              logger.debug('Successfully parsed backup JSON:', finalResult);
            } catch (e) {
              logger.error('Failed to parse backup JSON:', e.message);
            }
          }
        } else if (collectingBackupJson) {
          backupJsonLines.push(line);
        }
      }
    });

    pythonScript.on('close', async (code) => {
      const inference = inferenceSessions.get(inferenceId);

      logger.debug(`[INFERENCE] Python script finished with code: ${code}`);
      logger.debug(`[INFERENCE] Final result found: ${finalResult ? 'yes' : 'no'}`);

      // STEP 1: Handle non-zero exit codes (failures)
      if (code !== 0) {
        const stderrOutput = stderrBuffer.getBuffer();
        const errorMessage = stderrOutput || 'Inference failed with unknown error';

        logger.error(`[INFERENCE] Process failed with code ${code}`);
        logger.error(`[INFERENCE] Error output: ${stderrOutput}`);

        if (inference) {
          inference.status = 'failed';
          inference.endTime = new Date();
        }

        io.to(`inference-${inferenceId}`).emit('inference-complete', {
          success: false,
          error: errorMessage
        });
        reject(new Error(`Inference failed with code ${code}: ${errorMessage}`));
        return;
      }

      // STEP 2: Determine result source and parse result
      let result = null;
      let resultSource = null;

      if (finalResult) {
        // Source 1: FINAL_RESULT prefix from Python script
        result = finalResult;
        resultSource = 'FINAL_RESULT';
        logger.debug('[INFERENCE] Using FINAL_RESULT from Python script');
      } else {
        // Source 2: Try to parse JSON from output buffer
        logger.debug('[INFERENCE] No FINAL_RESULT found, trying to parse buffer...');
        const jsonMatch = outputBuffer.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          try {
            result = JSON.parse(jsonMatch[0]);
            resultSource = 'BUFFER_JSON';
            logger.debug('[INFERENCE] Successfully parsed JSON from buffer');
          } catch (e) {
            logger.error('[INFERENCE] Failed to parse buffer JSON:', e.message);
          }
        }

        // Source 3: Create manual result as last resort
        if (!result) {
          result = {
            success: true,
            output_path: outputPath,
            metadata_path: outputPath.replace('.tif', '_metadata.json'),
            visualization_path: outputPath.replace('.tif', '') + '_visualization_data.json',
            metrics: { message: 'Inference completed but metrics not available' }
          };
          resultSource = 'MANUAL';
          logger.debug('[INFERENCE] Created manual result (no JSON output found)');
        }
      }

      // STEP 3: Update session status
      if (inference) {
        inference.status = 'completed';
        inference.endTime = new Date();
      }

      // STEP 4: Track files ONCE (single tracking point)
      if (inference && result) {
        await trackInferenceResults(result, inferenceId, inference.sessionId, resultSource);
      }

      // STEP 5: Convert paths to web-accessible format
      if (inference && result) {
        const workspacePath = workspaceManager.getWorkspacePath(inference.sessionId);
        result = convertResultPathsForWeb(result, inference.sessionId, workspacePath);
        logger.debug('[INFERENCE] Converted paths for web access');
      }

      // STEP 6: Emit completion event
      io.to(`inference-${inferenceId}`).emit('inference-complete', {
        success: true,
        result: result
      });

      // STEP 7: Resolve or reject promise
      if (result && result.success) {
        resolve(result);
      } else {
        reject(new Error(result?.error || 'Inference failed'));
      }
    });
  });
}

function startInferenceProcess(modelPath, dataPath, outputPath, inferenceId, io) {
  // Update inference session status
  const inference = inferenceSessions.get(inferenceId);
  if (inference) {
    inference.status = 'running';
  }
  
  // Start the inference process
  runInferenceWithProgress(modelPath, dataPath, outputPath, inferenceId, io)
    .then((result) => {
      logger.info('Inference completed successfully:', result);
      
      // Update inference session with final result
      const inference = inferenceSessions.get(inferenceId);
      if (inference) {
        inference.status = 'completed';
        inference.endTime = new Date();
        inference.result = result;
      }
      
    })
    .catch((error) => {
      logger.error('Inference failed:', error);
      
      // Update inference session with error
      const inference = inferenceSessions.get(inferenceId);
      if (inference) {
        inference.status = 'failed';
        inference.endTime = new Date();
        inference.error = error.message;
      }
      
    });
}

// NOTE: /inference-status/:inferenceId route moved to ml.routes.js (Phase 5)

// Error handling middleware
// NOTE: Using globalErrorHandler from Phase 2 refactoring
app.use(globalErrorHandler);

server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});