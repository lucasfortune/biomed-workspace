/**
 * Routes Index
 *
 * Aggregates all route modules and exports a function to register them.
 */

const staticRoutes = require('./static.routes');
const authRoutes = require('./auth.routes');
const foldersRoutes = require('./folders.routes');
const filesRoutes = require('./files.routes');
const workspaceRoutes = require('./workspace.routes');
const mlRoutes = require('./ml.routes');

/**
 * Register all routes with the Express app
 * @param {object} app - Express app instance
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.workspaceService - WorkspaceService instance
 * @param {object} dependencies.fileService - FileService instance
 * @param {object} dependencies.authService - AuthService instance
 * @param {object} dependencies.trainingService - TrainingService instance
 * @param {object} dependencies.inferenceService - InferenceService instance
 * @param {object} dependencies.sessionTracker - SessionTracker instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @param {object} dependencies.io - Socket.IO instance
 */
function registerRoutes(app, dependencies) {
  // Static routes (pages, static files)
  app.use(staticRoutes(dependencies));

  // Authentication routes
  app.use(authRoutes(dependencies));

  // Workspace API routes
  app.use('/api/workspace', workspaceRoutes(dependencies));

  // Folder routes (part of workspace API)
  app.use('/api/workspace', foldersRoutes(dependencies));

  // File routes (part of workspace API)
  app.use('/api/workspace', filesRoutes(dependencies));

  // ML pipeline routes (training, inference)
  app.use(mlRoutes(dependencies));
}

module.exports = {
  registerRoutes
};
