const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFilePath = path.join(logsDir, 'activity.log');

/**
 * Log user activity to file
 * @param {string} username - Username performing the action
 * @param {string} action - Type of action
 * @param {object} details - Additional details about the action
 */
function logActivity(username, action, details = {}) {
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
  logActivity,
  logTrainingStart,
  logInferenceStart,
  logFileUpload,
  logLogin,
  logRegistration
};