/**
 * Configuration Index
 *
 * Re-exports all configuration modules for convenient importing.
 */

const constants = require('./constants');
const multerConfig = require('./multer.config');

module.exports = {
  ...constants,
  multerConfig
};
