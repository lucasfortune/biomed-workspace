const fs = require('fs');
const path = require('path');

// Lazy initialization - paths are set when initialize() is called
let logsDir = null;
let logFilePath = null;
let initialized = false;

/**
 * Initialize the activity logger with the specified data directory
 * @param {string} dataDir - Data directory path (defaults to __dirname for backward compat)
 */
function initialize(dataDir) {
  if (initialized) return;

  logsDir = dataDir ? path.join(dataDir, 'logs') : path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  logFilePath = path.join(logsDir, 'activity.log');
  initialized = true;
}

/**
 * Ensure logger is initialized (fallback for direct requires without explicit init)
 */
function ensureInitialized() {
  if (!initialized) {
    initialize(null); // Use default (project root)
  }
}

/**
 * Log user activity to file
 * @param {string} username - Username performing the action
 * @param {string} action - Type of action
 * @param {object} details - Additional details about the action
 */
function logActivity(username, action, details = {}) {
  ensureInitialized();

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    username,
    action,
    details
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  try {
    fs.appendFileSync(logFilePath, logLine);
  } catch (error) {
    console.error('Failed to write to activity log:', error);
  }
}

/**
 * Log training start
 */
function logTrainingStart(username, trainingId, config) {
  logActivity(username, 'training_start', {
    trainingId,
    num_epochs: config.num_epochs,
    batch_size: config.batch_size,
    features: config.features
  });
}

/**
 * Log inference start
 */
function logInferenceStart(username, inferenceId, usingImportedModel) {
  logActivity(username, 'inference_start', {
    inferenceId,
    modelType: usingImportedModel ? 'imported' : 'trained'
  });
}

/**
 * Log file upload
 */
function logFileUpload(username, fileType, fileName, fileSize) {
  logActivity(username, 'file_upload', {
    fileType,
    fileName,
    fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2)
  });
}

/**
 * Log login
 */
function logLogin(username, success) {
  logActivity(username, success ? 'login_success' : 'login_failed', {});
}

/**
 * Log registration
 */
function logRegistration(username, institution) {
  logActivity(username, 'user_registration', { institution });
}

module.exports = {
  initialize,
  logActivity,
  logTrainingStart,
  logInferenceStart,
  logFileUpload,
  logLogin,
  logRegistration
};
