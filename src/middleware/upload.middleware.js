/**
 * Upload Middleware
 *
 * Multer middleware for file uploads (TIFF files and model imports).
 * This module creates configured multer instances for use in routes.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { UPLOAD_LIMITS, DATA_PATHS } = require('../config/constants');

/**
 * Create multer storage configuration
 * @param {object} workspaceManager - WorkspaceManager instance
 * @param {object} logger - Logger instance
 * @returns {multer.StorageEngine} Multer disk storage configuration
 */
function createStorage(workspaceManager, logger) {
  // Every upload lands in the scratch folder first (ADR-018): the route
  // detects what the file is and moves it into the workspace under its
  // original name. The workspace is initialised here so a first upload
  // never races the placement.
  return multer.diskStorage({
    destination: function (req, file, cb) {
      try {
        const sessionId = req.session.id;
        const workspacePath = workspaceManager.getWorkspacePath(sessionId);
        if (!fs.existsSync(workspacePath)) {
          logger.debug('[Multer] Initializing workspace for session:', sessionId);
          workspaceManager.initializeWorkspace(sessionId);
        }
        fs.mkdirSync(DATA_PATHS.tmp, { recursive: true });
        cb(null, DATA_PATHS.tmp);
      } catch (err) {
        cb(err);
      }
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `upload_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
    }
  });
}

const WORKSPACE_UPLOAD_EXT = ['.tif', '.tiff', '.mrc', '.pth', '.pt', '.json', '.zip'];

/**
 * Workspace file filter - accepts every kind the workspace can place
 * (images, models, packages, backups); the route decides the kind from the
 * content (ADR-018)
 */
function workspaceFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (WORKSPACE_UPLOAD_EXT.includes(ext) || file.mimetype === 'image/tiff') {
    cb(null, true);
  } else {
    cb(new Error('Only TIFF/MRC images, .pth/.json model files and .zip archives (bioimage.io packages, workspace backups) can be uploaded'), false);
  }
}

/**
 * TIFF file filter - accepts only TIFF files (legacy, for specific routes)
 */
function tiffFileFilter(req, file, cb) {
  if (file.mimetype === 'image/tiff' || /\.tiff?$/.test(file.originalname.toLowerCase())) {
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
  if (fileName.endsWith('.pth') || fileName.endsWith('.json') || fileName.endsWith('.zip')) {
    cb(null, true);
  } else {
    cb(new Error('Only .pth (model), .json (config) and .zip (bioimage.io package) files are allowed for import!'), false);
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

  // Workspace upload middleware. The transport limit is the largest kind's
  // (workspace backups); the route enforces the per-kind limits (200 MB for
  // images, 2 GB for models) once it knows what the file is.
  const upload = multer({
    storage: storage,
    fileFilter: workspaceFileFilter,
    limits: {
      fileSize: UPLOAD_LIMITS.workspaceZipFileSize
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

  // Workspace ZIP upload middleware (5GB limit). Disk storage: buffering a
  // multi-GB archive in memory (the old memoryStorage) could exhaust the
  // process; the restore streams from the temp file and deletes it after.
  const uploadWorkspaceZip = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try {
          fs.mkdirSync(DATA_PATHS.tmp, { recursive: true });
          cb(null, DATA_PATHS.tmp);
        } catch (err) {
          cb(err);
        }
      },
      filename: (req, file, cb) => {
        cb(null, `restore_${Date.now()}_${Math.round(Math.random() * 1e9)}.zip`);
      }
    }),
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
