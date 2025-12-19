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
const { PYTHON_PATH, validatePythonPath } = require('./src/config/constants');

// Core modules
const activityLogger = require('./activityLogger');
const WorkspaceManager = require('./WorkspaceManager');

// Services
const {
  AuthService,
  WorkspaceService,
  FileService,
  TrainingService,
  InferenceService
} = require('./src/services');
const sessionTracker = require('./src/services/SessionTracker');

// Socket.IO handlers
const { initializeSocketHandlers } = require('./src/sockets');

// App factory
const createApp = require('./src/app');

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

// =============================================================================
// CREATE HTTP SERVER AND SOCKET.IO
// =============================================================================

// Create a temporary express app to create the server
// (We'll replace it with the fully configured app below)
const express = require('express');
const tempApp = express();
const server = http.createServer(tempApp);
const io = socketIo(server);

// Initialize Socket.IO handlers
initializeSocketHandlers(io, logger);

// =============================================================================
// CREATE AND CONFIGURE EXPRESS APP
// =============================================================================

const app = createApp({
  env,
  logger,
  io,
  workspaceManager,
  services: {
    workspaceService,
    fileService,
    authService,
    trainingService,
    inferenceService
  },
  activityLogger
});

// Replace the temporary app with the configured one
server.removeAllListeners('request');
server.on('request', app);

// =============================================================================
// START SERVER
// =============================================================================

const PORT = env.PORT;

server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
