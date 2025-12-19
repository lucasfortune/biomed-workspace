/**
 * Services Index
 *
 * Re-exports all service modules for easy importing.
 */

const AuthService = require('./AuthService');
const WorkspaceService = require('./WorkspaceService');
const FileService = require('./FileService');
const TrainingService = require('./TrainingService');
const InferenceService = require('./InferenceService');
const SessionTracker = require('./SessionTracker');

module.exports = {
  AuthService,
  WorkspaceService,
  FileService,
  TrainingService,
  InferenceService,
  SessionTracker
};
