/**
 * Simple Debug Logger
 *
 * Provides a lightweight logging system controlled by DEBUG environment variable.
 *
 * Usage:
 *   logger.debug('Detailed trace information') - Only shown when DEBUG=true
 *   logger.info('Important events') - Always shown
 *   logger.error('Error messages') - Always shown
 *
 * Set DEBUG=true in .env to enable verbose logging
 */

// Get DEBUG flag from environment (set by envLoader)
const DEBUG = process.env.DEBUG === 'true';

/**
 * Log levels with color codes for better readability
 */
const colors = {
  debug: '\x1b[36m',   // Cyan
  info: '\x1b[32m',    // Green
  warn: '\x1b[33m',    // Yellow
  error: '\x1b[31m',   // Red
  reset: '\x1b[0m'     // Reset
};

/**
 * Format timestamp for log messages
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Debug-level logging - only shown when DEBUG=true
 * Use for detailed trace information during development
 */
function debug(...args) {
  if (DEBUG) {
    const timestamp = getTimestamp();
    console.log(`${colors.debug}[DEBUG ${timestamp}]${colors.reset}`, ...args);
  }
}

/**
 * Info-level logging - always shown
 * Use for important events that should always be logged
 */
function info(...args) {
  const timestamp = getTimestamp();
  console.log(`${colors.info}[INFO ${timestamp}]${colors.reset}`, ...args);
}

/**
 * Warning-level logging - always shown
 * Use for potential issues that don't prevent operation
 */
function warn(...args) {
  const timestamp = getTimestamp();
  console.warn(`${colors.warn}[WARN ${timestamp}]${colors.reset}`, ...args);
}

/**
 * Error-level logging - always shown
 * Use for errors and exceptions
 */
function error(...args) {
  const timestamp = getTimestamp();
  console.error(`${colors.error}[ERROR ${timestamp}]${colors.reset}`, ...args);
}

/**
 * Log current DEBUG status on module load
 */
if (DEBUG) {
  console.log(`${colors.debug}[LOGGER] Debug mode ENABLED - Verbose logging active${colors.reset}`);
} else {
  console.log(`${colors.info}[LOGGER] Debug mode DISABLED - Showing only important events${colors.reset}`);
}

module.exports = {
  debug,
  info,
  warn,
  error,
  isDebugEnabled: () => DEBUG
};
