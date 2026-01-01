/**
 * Application Constants
 *
 * Centralized configuration for paths, directories, and limits.
 */

const path = require('path');
const fs = require('fs');

// Base directory (project root)
const BASE_DIR = path.resolve(__dirname, '..', '..');

// Python interpreter - use venv Python to ensure all dependencies are available
const PYTHON_PATH = path.join(BASE_DIR, 'venv', 'bin', 'python');

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
  generateThumbnail: 'python/generate_thumbnail.py'
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
 * Ensure required directories exist
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
 * Get absolute path from relative path
 * @param {string} relativePath - Path relative to BASE_DIR
 * @returns {string} Absolute path
 */
function getAbsolutePath(relativePath) {
  return path.join(BASE_DIR, relativePath);
}

module.exports = {
  BASE_DIR,
  PYTHON_PATH,
  DIRECTORIES,
  UPLOAD_LIMITS,
  SESSION_CONFIG,
  ALLOWED_FILE_TYPES,
  PYTHON_SCRIPTS,
  TRAINING_CONFIG_RANGES,
  REQUIRED_TRAINING_FIELDS,
  validatePythonPath,
  ensureDirectories,
  getAbsolutePath
};
