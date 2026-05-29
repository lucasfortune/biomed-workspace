class ParameterValidator {
  constructor(imageDimensions = null) {
    this.minDim = null;
    this.width = null;
    this.height = null;
    if (imageDimensions) {
      this.setImageDimensions(imageDimensions.width, imageDimensions.height);
    }
  }

  setImageDimensions(width, height) {
    this.width = width;
    this.height = height;
    this.minDim = (width != null && height != null) ? Math.min(width, height) : null;
  }

  getMaxPatchSize() {
    return this.minDim;
  }

  hasImageDimensions() {
    return this.minDim != null;
  }

  validatePatchSize(value, options = {}) {
    const ps = parseInt(value);
    if (isNaN(ps) || ps <= 0) {
      return { valid: false, error: 'Patch size must be a positive number' };
    }

    if (this.minDim != null && ps > this.minDim) {
      return {
        valid: false,
        error: `Patch size ${ps} exceeds image dimensions (${this.width}x${this.height}, max: ${this.minDim})`
      };
    }

    const { overlapTilePad, numLayers } = options;
    if (overlapTilePad != null && numLayers != null) {
      const result = this.checkExtractSize(ps, overlapTilePad, numLayers);
      if (!result.valid) return result;
    }

    return { valid: true, error: null };
  }

  checkExtractSize(patchSize, overlapTilePad, numLayers) {
    const extractSize = patchSize + 2 * overlapTilePad;
    const divisor = Math.pow(2, numLayers);
    const remainder = extractSize % divisor;

    if (remainder !== 0) {
      return {
        valid: false,
        error: `Extract size ${extractSize} (patch ${patchSize} + 2x${overlapTilePad} padding) must be divisible by ${divisor} (2^${numLayers} layers). Remainder: ${remainder}`
      };
    }

    return { valid: true, error: null, extractSize, divisor };
  }

  validateRange(value, min, max, fieldName) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, error: `${fieldName} must be a number` };
    }
    if (num < min || num > max) {
      return { valid: false, error: `${fieldName} must be between ${min} and ${max}` };
    }
    return { valid: true, error: null };
  }

  isPatchSizeValid(value, options = {}) {
    return this.validatePatchSize(value, options).valid;
  }
}

export default ParameterValidator;
