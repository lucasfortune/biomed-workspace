/**
 * Upload Middleware
 *
 * Multer middleware for file uploads (TIFF files and model imports).
 * This module creates configured multer instances for use in routes.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { UPLOAD_LIMITS } = require('../config/constants');

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
      } else if (file.fieldname === 'imported_models') {
        subdir = 'uploads/imported_models';
      } else if (file.fieldname === 'meshes') {
        subdir = 'results/meshes';
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
 * Workspace file filter - accepts files based on category/fieldname
 * - meshes: JSON files
 * - imported_models: PTH and JSON files
 * - all others: TIFF files
 */
function workspaceFileFilter(req, file, cb) {
  const fieldname = file.fieldname.toLowerCase();
  const filename = file.originalname.toLowerCase();

  // Mesh uploads accept JSON files
  if (fieldname === 'meshes') {
    if (filename.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed for mesh data!'), false);
    }
    return;
  }

  // Model imports accept PTH and JSON files
  if (fieldname === 'imported_models') {
    if (filename.endsWith('.pth') || filename.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only .pth and .json files are allowed for models!'), false);
    }
    return;
  }

  // All other categories accept TIFF files
  if (file.mimetype === 'image/tiff' || filename.endsWith('.tif') || filename.endsWith('.tiff')) {
    cb(null, true);
  } else {
    cb(new Error('Only TIFF files are allowed!'), false);
  }
}

/**
 * TIFF file filter - accepts only TIFF files (legacy, for specific routes)
 */
function tiffFileFilter(req, file, cb) {
  if (file.mimetype === 'image/tiff' || file.originalname.toLowerCase().endsWith('.tif')) {
    cb(null, true);
  } else {
    cb(new Error('Only TIFF files are allowed!'), false);
  }
}

/**
 * Model file filter - accepts .pth and .json files
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
 * Workspace ZIP file filter - accepts only .zip files
 */
function workspaceZipFileFilter(req, file, cb) {
  const fileName = file.originalname.toLowerCase();
  if (fileName.endsWith('.zip')) {
    cb(null, true);
  } else {
    cb(new Error('Only ZIP files are allowed for workspace restore!'), false);
  }
}

/**
 * Create upload middleware instances
 * @param {object} workspaceManager - WorkspaceManager instance
 * @param {object} logger - Logger instance
 * @returns {object} Object containing upload and uploadImport multer instances
 */
function createUploadMiddleware(workspaceManager, logger) {
  const storage = createStorage(workspaceManager, logger);

  // Workspace upload middleware - accepts files based on category (200MB limit)
  const upload = multer({
    storage: storage,
    fileFilter: workspaceFileFilter,
    limits: {
      fileSize: UPLOAD_LIMITS.tiffFileSize
    }
  });

  // Model import middleware (2GB limit, max 2 files)
  const uploadImport = multer({
    storage: storage,
    fileFilter: modelFileFilter,
    limits: {
      fileSize: UPLOAD_LIMITS.modelFileSize,
      files: UPLOAD_LIMITS.maxModelFiles
    }
  });

  // Workspace ZIP upload middleware (memory storage for buffer access, 5GB limit)
  const uploadWorkspaceZip = multer({
    storage: multer.memoryStorage(),
    fileFilter: workspaceZipFileFilter,
    limits: {
      fileSize: UPLOAD_LIMITS.workspaceZipFileSize || 5 * 1024 * 1024 * 1024 // 5GB default
    }
  });

  return {
    upload,
    uploadImport,
    uploadWorkspaceZip
  };
}

/**
 * Multer error handler middleware
 * Place this after routes that use multer to catch upload errors
 */
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        details: `Maximum file size exceeded`
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        details: 'Maximum number of files exceeded'
      });
    }
    return res.status(400).json({
      error: 'File upload error',
      details: err.message
    });
  } else if (err) {
    // Custom errors from fileFilter
    return res.status(400).json({
      error: 'File upload error',
      details: err.message
    });
  }
  next();
}

module.exports = {
  createStorage,
  createUploadMiddleware,
  workspaceFileFilter,
  tiffFileFilter,
  modelFileFilter,
  workspaceZipFileFilter,
  handleMulterError
};
