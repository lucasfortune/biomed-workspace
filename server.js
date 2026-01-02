/**
 * Server Entry Point
 *
 * Minimal entry point that initializes the environment, creates services,
 * and starts the HTTP server with Socket.IO support.
 */

// Load environment configuration FIRST (before any other requires)
const { initializeEnvironment } = require('./utils/envLoader');
const env = initializeEnvironment();

// Load logger (after env is initialized)
const logger = require('./utils/logger');

const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Configuration
const { PYTHON_PATH, validatePythonPath, CLEANUP_CONFIG } = require('./src/config/constants');

// Core modules
const activityLogger = require('./activityLogger');
const WorkspaceManager = require('./WorkspaceManager');

// Services
const {
  AuthService,
  WorkspaceService,
  FileService,
  TrainingService,
  InferenceService,
  DenoisingService,
  CleanupService
} = require('./src/services');
const sessionTracker = require('./src/services/SessionTracker');

// Socket.IO handlers
const { initializeSocketHandlers } = require('./src/sockets');

// App configuration
const configureApp = require('./src/app');

// =============================================================================
// STARTUP VALIDATION
// =============================================================================

// Validate Python interpreter exists at startup
if (!validatePythonPath()) {
  process.exit(1);
}
logger.info('Python interpreter found at:', PYTHON_PATH);

// =============================================================================
// INITIALIZE CORE MODULES
// =============================================================================

const workspaceManager = new WorkspaceManager();

// =============================================================================
// INITIALIZE SERVICES
// =============================================================================

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

const denoisingService = new DenoisingService({
  pythonPath: PYTHON_PATH,
  sessionTracker,
  workspaceManager,
  logger
});

// Cleanup service for abandoned workspaces
const cleanupService = new CleanupService(
  {
    workspaceManager,
    sessionTracker,
    activityLogger,
    logger
  },
  {
    intervalMs: CLEANUP_CONFIG.intervalMs,
    gracePeriodMs: CLEANUP_CONFIG.gracePeriodMs
  }
);

// =============================================================================
// CREATE EXPRESS APP, HTTP SERVER, AND SOCKET.IO
// =============================================================================

// Create Express app first
const express = require('express');
const app = express();

// Create HTTP server with the app
const server = http.createServer(app);

// Create Socket.IO (attaches to server for both WebSocket and polling)
const io = socketIo(server);

// Initialize Socket.IO handlers
initializeSocketHandlers(io, logger);

// =============================================================================
// CONFIGURE EXPRESS APP
// =============================================================================

// Now configure the app with all middleware and routes
// (This happens after Socket.IO is attached, so io can be passed to routes)
configureApp(app, {
  env,
  logger,
  io,
  workspaceManager,
  services: {
    workspaceService,
    fileService,
    authService,
    trainingService,
    inferenceService,
    denoisingService
  },
  activityLogger
});

// =============================================================================
// START SERVER
// =============================================================================

const PORT = env.PORT;

server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);

  // Start cleanup service for abandoned workspaces
  if (CLEANUP_CONFIG.enableOnStartup) {
    cleanupService.start();
  }
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  cleanupService.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  cleanupService.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
