/**
 * Application Constants
 *
 * Centralized configuration for paths, directories, and limits.
 */

const path = require('path');
const fs = require('fs');

// Base directory (project root) - for application code
const BASE_DIR = path.resolve(__dirname, '..', '..');

// Data directory (user data) - defaults to BASE_DIR if DATA_DIR env var is not set
// This allows storing user data (workspaces, sessions, logs, users.json) on a separate volume
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : BASE_DIR;

// Absolute paths for user data directories
const DATA_PATHS = {
  workspaces: path.join(DATA_DIR, 'workspaces'),
  sessions: path.join(DATA_DIR, 'sessions'),
  logs: path.join(DATA_DIR, 'logs'),
  usersFile: path.join(DATA_DIR, 'users.json')
};

// Python interpreter - use venv Python to ensure all dependencies are available
// Cross-platform: Windows uses Scripts\python.exe, Unix uses bin/python
const PYTHON_PATH = process.platform === 'win32'
  ? path.join(BASE_DIR, 'venv', 'Scripts', 'python.exe')
  : path.join(BASE_DIR, 'venv', 'bin', 'python');

// Directory structure
const DIRECTORIES = {
  uploads: 'uploads',
  results: 'results',
  models: 'models',
  public: 'public',
  sessions: 'sessions',
  testData: 'test_data',
  workspaces: 'workspaces',
  logs: 'logs',
  unfinishedAnnotations: 'unfinished_annotations'
};

// File upload limits
const UPLOAD_LIMITS = {
  tiffFileSize: 200 * 1024 * 1024,        // 200MB for TIFF stacks
  modelFileSize: 2 * 1024 * 1024 * 1024,  // 2GB for model files
  maxModelFiles: 2,                        // Maximum 2 files (model + config)
  workspaceZipFileSize: 5 * 1024 * 1024 * 1024  // 5GB for workspace ZIP files
};

// Session configuration
const SESSION_CONFIG = {
  ttl: 86400 * 7,        // 7 days in seconds
  cookieMaxAge: 86400000 * 7  // 7 days in milliseconds
};

// Cleanup service configuration
const CLEANUP_CONFIG = {
  intervalMs: 15 * 60 * 1000,    // Run cleanup every 15 minutes
  gracePeriodMs: 60 * 60 * 1000, // 1 hour before considering a session abandoned
  enableOnStartup: true          // Start cleanup service when server starts
};

// Allowed file types
const ALLOWED_FILE_TYPES = {
  tiff: ['image/tiff', '.tif', '.tiff'],
  model: ['.pth', '.json']
};

// Python scripts paths (relative to BASE_DIR)
const PYTHON_SCRIPTS = {
  trainModel: 'python/train_model.py',
  runInference: 'python/run_inference.py',
  validateTiff: 'python/validate_tiff.py',
  validateInferenceTiff: 'python/validate_inference_tiff.py',
  validateImportedModel: 'python/validate_imported_model.py',
  generateThumbnail: 'python/generate_thumbnail.py',
  computeDirectionVectors: 'python/compute_direction_vectors.py',
  validateDirectionVolume: 'python/validate_direction_volume.py'
};

// Training configuration validation ranges
const TRAINING_CONFIG_RANGES = {
  patchSize: { min: 64, max: 1024 },
  learningRate: { min: 0, max: 1 }
};

// Required training configuration fields
const REQUIRED_TRAINING_FIELDS = [
  'patch_size',
  'patches_per_image',
  'batch_size',
  'num_epochs',
  'learning_rate',
  'features',
  'num_layers'
];

/**
 * Validate that Python interpreter exists
 * @returns {boolean} True if Python exists, exits process if not
 */
function validatePythonPath() {
  if (!fs.existsSync(PYTHON_PATH)) {
    console.error('FATAL: Python interpreter not found at:', PYTHON_PATH);
    console.error('Please set up the virtual environment:');
    console.error('  1. Run: python -m venv venv');
    console.error('  2. Run: source venv/bin/activate');
    console.error('  3. Run: pip install -r requirements.txt');
    return false;
  }
  return true;
}

/**
 * Ensure required directories exist (code directories in BASE_DIR)
 */
function ensureDirectories() {
  const requiredDirs = [
    DIRECTORIES.uploads,
    DIRECTORIES.results,
    DIRECTORIES.models,
    DIRECTORIES.public
  ];

  requiredDirs.forEach(dir => {
    const fullPath = path.join(BASE_DIR, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
}

/**
 * Ensure data directories exist (user data directories in DATA_DIR)
 * Creates workspaces, sessions, and logs directories
 */
function ensureDataDirectories() {
  const dataDirs = [
    DATA_PATHS.workspaces,
    DATA_PATHS.sessions,
    DATA_PATHS.logs
  ];

  dataDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Get absolute path from relative path
 * @param {string} relativePath - Path relative to BASE_DIR
 * @returns {string} Absolute path
 */
function getAbsolutePath(relativePath) {
  return path.join(BASE_DIR, relativePath);
}

module.exports = {
  BASE_DIR,
  DATA_DIR,
  DATA_PATHS,
  PYTHON_PATH,
  DIRECTORIES,
  UPLOAD_LIMITS,
  SESSION_CONFIG,
  CLEANUP_CONFIG,
  ALLOWED_FILE_TYPES,
  PYTHON_SCRIPTS,
  TRAINING_CONFIG_RANGES,
  REQUIRED_TRAINING_FIELDS,
  validatePythonPath,
  ensureDirectories,
  ensureDataDirectories,
  getAbsolutePath
};
