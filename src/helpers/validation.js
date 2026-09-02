/**
 * Validation Helpers
 *
 * Functions for validating training configuration and TIFF files.
 */

const { spawn } = require('child_process');
const { PYTHON_PATH, PYTHON_SCRIPTS, TRAINING_CONFIG_RANGES, REQUIRED_TRAINING_FIELDS } = require('../config/constants');

/**
 * Validate training configuration
 * @param {object} config - Training configuration object
 * @returns {object} Validation result { valid: boolean, errors: string[] }
 */
function validateTrainingConfig(config) {
  const errors = [];

  // Check required fields
  for (const field of REQUIRED_TRAINING_FIELDS) {
    if (!config[field]) {
      errors.push(`${field} is required`);
    }
  }

  // Validate ranges
  if (config.patch_size) {
    const { min, max, multipleOf } = TRAINING_CONFIG_RANGES.patchSize;
    if (config.patch_size < min || config.patch_size > max) {
      errors.push(`patch_size must be between ${min} and ${max}`);
    } else if (multipleOf && config.patch_size % multipleOf !== 0) {
      errors.push(`patch_size must be a multiple of ${multipleOf}`);
    }
  }

  if (config.learning_rate) {
    const { min, max } = TRAINING_CONFIG_RANGES.learningRate;
    if (config.learning_rate <= min || config.learning_rate > max) {
      errors.push(`learning_rate must be between ${min} and ${max}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Validate TIFF stacks (raw images and annotations)
 * @param {string} rawPath - Path to raw images TIFF
 * @param {string} annotationPath - Path to annotations TIFF
 * @param {object} logger - Logger instance
 * @returns {Promise<object>} Validation result from Python script
 */
async function validateTiffStacks(rawPath, annotationPath, logger) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      PYTHON_SCRIPTS.validateTiff,
      rawPath,
      annotationPath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
      const message = data.toString().trim();
      if (message && logger) {
        logger.debug('[Python Validation]:', message);
      }
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
      const message = data.toString().trim();
      if (message && logger) {
        logger.error('[Python Validation Error]:', message);
      }
    });

    pythonScript.on('close', (code) => {
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        if (logger) {
          logger.error('Failed to parse validation output:', output);
          logger.error('Stderr:', error);
        }
        resolve({
          valid: false,
          error: error || 'Invalid validation output - failed to parse JSON response'
        });
      }
    });
  });
}

/**
 * Validate imported model files
 * @param {string} modelPath - Path to .pth model file
 * @param {string} configPath - Path to .json config file
 * @param {object} logger - Logger instance (optional)
 * @returns {Promise<object>} Validation result from Python script
 */
async function validateImportedModel(modelPath, configPath, logger) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      PYTHON_SCRIPTS.validateImportedModel,
      modelPath,
      configPath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonScript.on('close', (code) => {
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        resolve({
          success: false,
          error: 'Failed to parse validation results: ' + (error || e.message)
        });
      }
    });
  });
}

/**
 * Validate inference TIFF file
 * @param {string} filePath - Path to inference TIFF file
 * @param {object} logger - Logger instance (optional)
 * @returns {Promise<object>} Validation result from Python script
 */
async function validateInferenceTiff(filePath, logger) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      PYTHON_SCRIPTS.validateInferenceTiff,
      filePath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonScript.on('close', (code) => {
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        if (logger) {
          logger.error('Failed to parse validation output:', output);
          logger.error('Stderr:', error);
        }
        resolve({
          valid: false,
          error: error || 'Invalid validation output - failed to parse JSON response'
        });
      }
    });
  });
}

module.exports = {
  validateTrainingConfig,
  validateTiffStacks,
  validateImportedModel,
  validateInferenceTiff
};
