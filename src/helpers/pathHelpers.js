/**
 * Path Helpers
 *
 * Utilities for path conversion and manipulation.
 */

const path = require('path');

/**
 * Convert inference result paths from absolute to web-accessible paths
 * @param {object} result - Result object with file paths
 * @param {string} sessionId - Session ID
 * @param {string} workspacePath - Workspace root path
 * @returns {object} Result object with converted paths
 */
function convertResultPathsForWeb(result, sessionId, workspacePath) {
  const resultsDir = path.join(workspacePath, 'results');
  const convertedResult = { ...result };

  if (result.output_path) {
    convertedResult.output_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.output_path);
  }
  if (result.metadata_path) {
    convertedResult.metadata_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.metadata_path);
  }
  if (result.visualization_path) {
    convertedResult.visualization_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.visualization_path);
  }
  if (result.original_data_overlay_path) {
    convertedResult.original_data_overlay_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.original_data_overlay_path);
  }

  return convertedResult;
}

/**
 * Get web-accessible path for a file in the workspace
 * @param {string} absolutePath - Absolute file path
 * @param {string} sessionId - Session ID
 * @param {string} workspacePath - Workspace root path
 * @returns {string} Web-accessible path
 */
function getWebPath(absolutePath, sessionId, workspacePath) {
  const relativePath = path.relative(workspacePath, absolutePath);
  return `/workspaces/${sessionId}/${relativePath}`;
}

/**
 * Get relative path from workspace root
 * @param {string} absolutePath - Absolute file path
 * @param {string} workspacePath - Workspace root path
 * @returns {string} Relative path
 */
function getRelativePath(absolutePath, workspacePath) {
  return path.relative(workspacePath, absolutePath);
}

/**
 * Normalize path separators for consistent handling
 * @param {string} filePath - File path to normalize
 * @returns {string} Normalized path with forward slashes
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Build session-scoped directory path
 * @param {string} baseDir - Base directory name
 * @param {string} sessionId - Session ID
 * @param {...string} subPaths - Additional path segments
 * @returns {string} Complete path
 */
function buildSessionPath(baseDir, sessionId, ...subPaths) {
  return path.join(baseDir, sessionId, ...subPaths);
}

/**
 * Extract session ID from a path if present
 * @param {string} filePath - File path
 * @param {string} baseDir - Base directory to look for session ID after
 * @returns {string|null} Session ID or null if not found
 */
function extractSessionId(filePath, baseDir) {
  const normalizedPath = normalizePath(filePath);
  const normalizedBase = normalizePath(baseDir);

  const baseIndex = normalizedPath.indexOf(normalizedBase);
  if (baseIndex === -1) return null;

  const afterBase = normalizedPath.substring(baseIndex + normalizedBase.length + 1);
  const parts = afterBase.split('/');

  return parts.length > 0 ? parts[0] : null;
}

module.exports = {
  convertResultPathsForWeb,
  getWebPath,
  getRelativePath,
  normalizePath,
  buildSessionPath,
  extractSessionId
};
