/**
 * File Helpers
 *
 * File system operations and utilities.
 */

const fs = require('fs');
const path = require('path');

/**
 * Safely delete a directory and its contents
 * @param {string} dirPath - Path to directory to delete
 * @param {object} logger - Logger instance (optional)
 * @returns {boolean} True if successful or directory doesn't exist
 */
function deleteDirectory(dirPath, logger) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      if (logger) {
        logger.debug('Deleted directory:', dirPath);
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error deleting directory:', dirPath, error);
      }
      return false;
    }
  }
  return true;
}

/**
 * Safely delete a file
 * @param {string} filePath - Path to file to delete
 * @param {object} logger - Logger instance (optional)
 * @returns {boolean} True if successful or file doesn't exist
 */
function deleteFile(filePath, logger) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      if (logger) {
        logger.debug('Deleted file:', filePath);
      }
      return true;
    } catch (error) {
      if (logger) {
        logger.error('Error deleting file:', filePath, error);
      }
      return false;
    }
  }
  return true;
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Path to directory
 * @returns {boolean} True if directory exists or was created
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return true;
    } catch (error) {
      return false;
    }
  }
  return true;
}

/**
 * Get file size in bytes
 * @param {string} filePath - Path to file
 * @returns {number} File size in bytes, or 0 if file doesn't exist
 */
function getFileSize(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      return fs.statSync(filePath).size;
    } catch (error) {
      return 0;
    }
  }
  return 0;
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to file
 * @returns {boolean} True if file exists
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Copy a file from source to destination
 * @param {string} source - Source file path
 * @param {string} destination - Destination file path
 * @param {object} logger - Logger instance (optional)
 * @returns {boolean} True if successful
 */
function copyFile(source, destination, logger) {
  try {
    // Ensure destination directory exists
    const destDir = path.dirname(destination);
    ensureDirectory(destDir);

    fs.copyFileSync(source, destination);
    if (logger) {
      logger.debug('Copied file:', source, '→', destination);
    }
    return true;
  } catch (error) {
    if (logger) {
      logger.error('Error copying file:', source, error);
    }
    return false;
  }
}

/**
 * Move a file from source to destination
 * @param {string} source - Source file path
 * @param {string} destination - Destination file path
 * @param {object} logger - Logger instance (optional)
 * @returns {boolean} True if successful
 */
function moveFile(source, destination, logger) {
  try {
    // Ensure destination directory exists
    const destDir = path.dirname(destination);
    ensureDirectory(destDir);

    fs.renameSync(source, destination);
    if (logger) {
      logger.debug('Moved file:', source, '→', destination);
    }
    return true;
  } catch (error) {
    // If rename fails (cross-device), try copy + delete
    if (copyFile(source, destination, logger)) {
      return deleteFile(source, logger);
    }
    return false;
  }
}

/**
 * Read a JSON file
 * @param {string} filePath - Path to JSON file
 * @returns {object|null} Parsed JSON or null if failed
 */
function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

/**
 * Write a JSON file
 * @param {string} filePath - Path to JSON file
 * @param {object} data - Data to write
 * @param {boolean} pretty - Use pretty printing (default: true)
 * @returns {boolean} True if successful
 */
function writeJsonFile(filePath, data, pretty = true) {
  try {
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    fs.writeFileSync(filePath, content);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get file extension (lowercase, with dot)
 * @param {string} filePath - Path to file
 * @returns {string} File extension (e.g., '.tif')
 */
function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

/**
 * Check if a file is a TIFF file
 * @param {string} filePath - Path to file
 * @returns {boolean} True if file has TIFF extension
 */
function isTiffFile(filePath) {
  const ext = getFileExtension(filePath);
  return ext === '.tif' || ext === '.tiff';
}

/**
 * List files in a directory
 * @param {string} dirPath - Path to directory
 * @param {object} options - Options { recursive: boolean, filter: function }
 * @returns {string[]} Array of file paths
 */
function listFiles(dirPath, options = {}) {
  const { recursive = false, filter = null } = options;
  const files = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...listFiles(fullPath, options));
      }
    } else if (entry.isFile()) {
      if (!filter || filter(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

module.exports = {
  deleteDirectory,
  deleteFile,
  ensureDirectory,
  getFileSize,
  fileExists,
  copyFile,
  moveFile,
  readJsonFile,
  writeJsonFile,
  getFileExtension,
  isTiffFile,
  listFiles
};
