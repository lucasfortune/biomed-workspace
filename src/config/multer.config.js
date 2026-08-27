/**
 * Multer Configuration
 *
 * File upload configuration for TIFF files and model imports.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { UPLOAD_LIMITS, ALLOWED_FILE_TYPES } = require('./constants');

/**
 * Create multer storage configuration
 * @param {object} workspaceManager - WorkspaceManager instance
 * @param {object} logger - Logger instance
 * @returns {multer.StorageEngine} Multer disk storage configuration
 */
function createStorage(workspaceManager, logger) {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      const sessionId = req.session.id;

      // Use workspace directory structure
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Initialize workspace if it doesn't exist
      if (!fs.existsSync(workspacePath)) {
        logger.debug('[Multer] Initializing workspace for session:', sessionId);
        workspaceManager.initializeWorkspace(sessionId);
      }

      // Determine subdirectory based on field name
      let subdir = 'uploads/raw'; // Default

      if (file.fieldname === 'raw_images') {
        subdir = 'uploads/raw';
      } else if (file.fieldname === 'annotations') {
        subdir = 'uploads/annotations';
      } else if (file.fieldname === 'inference_data') {
        subdir = 'uploads/raw';  // Redirect inference data to raw folder
      } else if (file.fieldname === 'file') {
        // For workspace upload endpoint, use category from body if available
        subdir = 'uploads/raw'; // Will be moved if needed
      }

      logger.debug('[Multer] Field name:', file.fieldname, '→ Directory:', subdir);

      const uploadDir = path.join(workspacePath, subdir);

      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      logger.debug('[Multer] Upload destination:', uploadDir);
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const timestamp = Date.now();
      cb(null, `${timestamp}-${file.originalname}`);
    }
  });
}

/**
 * TIFF file filter
 */
function tiffFileFilter(req, file, cb) {
  // Accept only TIFF files
  if (file.mimetype === 'image/tiff' || /\.tiff?$/.test(file.originalname.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only TIFF files are allowed!'), false);
  }
}

/**
 * Model import file filter (accepts .pth and .json)
 */
function modelFileFilter(req, file, cb) {
  const fileName = file.originalname.toLowerCase();
  if (fileName.endsWith('.pth') || fileName.endsWith('.json')) {
    cb(null, true);
  } else {
    cb(new Error('Only .pth (model) and .json (config) files are allowed for import!'), false);
  }
}

/**
 * Create multer instance for TIFF uploads
 * @param {object} workspaceManager - WorkspaceManager instance
 * @param {object} logger - Logger instance
 * @returns {multer.Multer} Configured multer instance
 */
function createTiffUploader(workspaceManager, logger) {
  return multer({
    storage: createStorage(workspaceManager, logger),
    fileFilter: tiffFileFilter,
    limits: {
      fileSize: UPLOAD_LIMITS.tiffFileSize
    }
  });
}

/**
 * Create multer instance for model imports
 * @param {object} workspaceManager - WorkspaceManager instance
 * @param {object} logger - Logger instance
 * @returns {multer.Multer} Configured multer instance
 */
function createModelUploader(workspaceManager, logger) {
  return multer({
    storage: createStorage(workspaceManager, logger),
    fileFilter: modelFileFilter,
    limits: {
      fileSize: UPLOAD_LIMITS.modelFileSize,
      files: UPLOAD_LIMITS.maxModelFiles
    }
  });
}

/**
 * Multer error handler middleware
 * @param {Error} err - Error object
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function multerErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        details: `Maximum file size is ${UPLOAD_LIMITS.tiffFileSize / (1024 * 1024)}MB for TIFF files`
      });
    }
    return res.status(400).json({
      error: 'File upload error',
      details: err.message
    });
  } else if (err) {
    return res.status(400).json({
      error: 'File upload error',
      details: err.message
    });
  }
  next();
}

module.exports = {
  createStorage,
  createTiffUploader,
  createModelUploader,
  tiffFileFilter,
  modelFileFilter,
  multerErrorHandler
};
