/**
 * Configuration Index
 *
 * Re-exports all configuration modules for convenient importing.
 */

const constants = require('./constants');
const multerConfig = require('./multer.config');
const sessionConfig = require('./session.config');

module.exports = {
  ...constants,
  multerConfig,
  sessionConfig
};
