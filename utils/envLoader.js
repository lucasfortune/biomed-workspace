/**
 * Environment Configuration Loader
 *
 * This module handles loading environment variables from .env file
 * and auto-generates critical secrets if they don't exist.
 *
 * SECURITY: Auto-generates SESSION_SECRET on first run if not present.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate a cryptographically secure random string
 * @param {number} length - Length of the random string
 * @returns {string} Random hex string
 */
function generateSecureSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Load or create .env file with required variables
 * @returns {object} Environment configuration object
 */
function loadEnvironment() {
  const envPath = path.join(__dirname, '..', '.env');
  let envFileExists = fs.existsSync(envPath);
  let envContent = envFileExists ? fs.readFileSync(envPath, 'utf8') : '';
  let modified = false;

  // Parse existing .env content
  const envVars = {};
  if (envContent) {
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  }

  // Check and auto-generate SESSION_SECRET if missing
  if (!envVars.SESSION_SECRET || envVars.SESSION_SECRET === 'segmentation-app-secret') {
    console.log('[ENV] SESSION_SECRET not found or using default. Generating new secure secret...');
    const newSecret = generateSecureSecret(64);
    envVars.SESSION_SECRET = newSecret;
    modified = true;
    console.log('[ENV] Generated new SESSION_SECRET and saved to .env file');
  }

  // Add DEBUG flag if missing (default: false for production)
  if (!envVars.DEBUG) {
    envVars.DEBUG = 'false';
    modified = true;
    console.log('[ENV] Added DEBUG=false to .env (set to "true" for verbose logging)');
  }

  // Save back to .env file if modified
  if (modified) {
    const lines = [];
    lines.push('# Biomedical Image Segmentation Application');
    lines.push('# Auto-generated configuration file');
    lines.push('');
    lines.push('# Session Secret (auto-generated)');
    lines.push('# IMPORTANT: Keep this secret secure and do not commit to version control');
    lines.push(`SESSION_SECRET=${envVars.SESSION_SECRET}`);
    lines.push('');
    lines.push('# Debug Mode (set to "true" for verbose console logging)');
    lines.push(`DEBUG=${envVars.DEBUG}`);
    lines.push('');
    lines.push('# Server Port (optional, defaults to 3000)');
    lines.push(`# PORT=3000`);
    lines.push('');
    lines.push('# Server Host (optional, defaults to 127.0.0.1 for security)');
    lines.push('# Use 0.0.0.0 to bind to all interfaces (not recommended for production)');
    lines.push(`# HOST=127.0.0.1`);
    lines.push('');
    lines.push('# Allowed Origins for CORS (required for production deployments)');
    lines.push('# Comma-separated list of allowed origins, e.g.:');
    lines.push('# ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com');
    lines.push('');

    try {
      fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
      console.log(`[ENV] Configuration saved to ${envPath}`);
    } catch (error) {
      console.error('[ENV] ERROR: Failed to write .env file:', error.message);
      throw new Error('Failed to save environment configuration');
    }
  }

  // Load environment variables using dotenv
  require('dotenv').config({ path: envPath });

  // Validate critical environment variables
  if (!process.env.SESSION_SECRET) {
    console.error('[ENV] FATAL ERROR: SESSION_SECRET not available after loading .env');
    console.error('[ENV] This should never happen. Please check .env file permissions.');
    throw new Error('SESSION_SECRET not available');
  }

  return {
    SESSION_SECRET: process.env.SESSION_SECRET,
    DEBUG: process.env.DEBUG === 'true',
    PORT: process.env.PORT || 3000,
    HOST: process.env.HOST || '127.0.0.1',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || null
  };
}

/**
 * Initialize environment and return configuration object
 * This should be called at the very start of server.js
 */
function initializeEnvironment() {
  try {
    console.log('[ENV] Loading environment configuration...');
    const env = loadEnvironment();
    console.log('[ENV] Environment configuration loaded successfully');
    console.log(`[ENV] DEBUG mode: ${env.DEBUG ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[ENV] HOST: ${env.HOST}`);
    console.log(`[ENV] PORT: ${env.PORT}`);
    console.log(`[ENV] ALLOWED_ORIGINS: ${env.ALLOWED_ORIGINS || '(not set, using localhost defaults)'}`);
    return env;
  } catch (error) {
    console.error('[ENV] FATAL: Failed to initialize environment:', error.message);
    process.exit(1);
  }
}

module.exports = { initializeEnvironment };
