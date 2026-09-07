/**
 * Lineage Helpers - Utilities for data lineage/provenance tracking
 *
 * Lineage tracks the processing history of files in the workspace.
 * Each processed file stores its lineage with:
 * - processType: The type of processing (e.g., 'segmentation', 'denoising', 'meshGeneration')
 * - processedAt: ISO timestamp of when processing occurred
 * - inputs: Array of input file IDs that were used
 * - processId: Optional process session ID (e.g., inferenceId, meshId)
 *
 * Uploaded files have no lineage property - they are considered root files.
 */

/**
 * Create a lineage entry for a newly processed file
 * @param {string} processType - Type of process (segmentation, denoising, meshGeneration)
 * @param {string|string[]} inputFileIds - Input file ID(s) - can be single string or array
 * @param {string} [processId=null] - Optional process session ID (trainingId, inferenceId, meshId)
 * @returns {object} Lineage object
 *
 * @example
 * // Single input
 * const lineage = createLineage('segmentation', 'file_123', 'inference_456');
 *
 * // Multiple inputs (e.g., training uses raw_images + annotations)
 * const lineage = createLineage('segmentation', ['file_123', 'file_456'], 'inference_789');
 */
function createLineage(processType, inputFileIds, processId = null) {
  if (!processType) {
    throw new Error('processType is required for lineage creation');
  }

  if (!inputFileIds || (Array.isArray(inputFileIds) && inputFileIds.length === 0)) {
    throw new Error('At least one input file ID is required for lineage creation');
  }

  const lineage = {
    processType,
    processedAt: new Date().toISOString(),
    inputs: Array.isArray(inputFileIds) ? inputFileIds : [inputFileIds]
  };

  if (processId) {
    lineage.processId = processId;
  }

  return lineage;
}

/**
 * Find the root file(s) by traversing lineage backwards
 * @param {string} fileId - Starting file ID
 * @param {object[]} allFiles - Array of all file objects from metadata
 * @returns {object} Object with rootIds, path, and errors
 *
 * @example
 * const result = findRootFiles('mesh_file_123', metadata.files);
 * // Returns:
 * // {
 * //   rootIds: ['original_upload_id'],
 * //   path: [
 * //     { fileId: 'original_upload_id', fileName: 'input.tif', processType: 'upload' },
 * //     { fileId: 'segmented_id', fileName: 'result.tif', processType: 'segmentation' },
 * //     { fileId: 'mesh_file_123', fileName: 'mesh.json', processType: 'meshGeneration' }
 * //   ],
 * //   errors: [],
 * //   hasErrors: false
 * // }
 */
function findRootFiles(fileId, allFiles) {
  const path = [];
  const visited = new Set();
  const errors = [];

  function traverse(currentId) {
    if (visited.has(currentId)) {
      errors.push({ type: 'circular_reference', fileId: currentId });
      return [];
    }
    visited.add(currentId);

    const file = allFiles.find(f => f.id === currentId);
    if (!file) {
      errors.push({ type: 'missing_file', fileId: currentId });
      return [];
    }

    path.push({
      fileId: currentId,
      fileName: file.name,
      processType: file.lineage?.processType || 'upload'
    });

    // If no lineage, this is a root file (original upload)
    if (!file.lineage || !file.lineage.inputs || file.lineage.inputs.length === 0) {
      return [currentId];
    }

    // Traverse all inputs
    const roots = [];
    for (const inputId of file.lineage.inputs) {
      roots.push(...traverse(inputId));
    }
    return [...new Set(roots)]; // Remove duplicates
  }

  const rootIds = traverse(fileId);

  return {
    rootIds,
    path: path.reverse(), // Root first, current file last
    errors,
    hasErrors: errors.length > 0
  };
}

/**
 * Get the full lineage chain for a file
 * @param {string} fileId - File ID
 * @param {object[]} allFiles - Array of all file objects
 * @returns {object[]} Array of objects with fileId, fileName, processType, and file reference
 *
 * @example
 * const chain = getLineageChain('mesh_file_123', metadata.files);
 * // Returns array from root to current file with full file objects
 */
function getLineageChain(fileId, allFiles) {
  const result = findRootFiles(fileId, allFiles);
  return result.path.map(entry => ({
    ...entry,
    file: allFiles.find(f => f.id === entry.fileId) || null
  }));
}

/**
 * Get a human-readable processing history string
 * @param {string} fileId - File ID
 * @param {object[]} allFiles - Array of all file objects
 * @returns {string} Processing history like "Denoising → Segmentation → Mesh Generation"
 *
 * @example
 * const history = getProcessingHistoryString('mesh_file_123', metadata.files);
 * // Returns: "Denoising → Segmentation → Mesh Generation"
 */
function getProcessingHistoryString(fileId, allFiles) {
  const chain = getLineageChain(fileId, allFiles);

  if (chain.length === 0) {
    return '';
  }

  // Map process types to display names
  const displayNames = {
    'upload': 'Original Upload',
    'denoising': 'Denoising',
    'denoising-training': 'Denoising Training',
    'denoising-gaussian': 'Gaussian Denoising',
    'denoising-nlm': 'NLM Denoising',
    'denoising-n2v': 'N2V Denoising',
    'denoising-autostructn2v': 'autoStructN2V Denoising',
    'denoising-autostructn2v-stage1': 'autoStructN2V Stage 1',
    'denoising-autostructn2v-stage2': 'autoStructN2V Stage 2',
    'segmentation': 'Segmentation',
    'segmentation-training': 'Segmentation Training',
    'meshGeneration': 'Mesh Generation',
    'annotation': 'Annotation',
    'duplicate': 'Duplicated',
    'split': 'Split',
    'stitching': 'Stitching',
    'preprocess': 'Preprocessing',
    'segcleanup': 'Segmentation Cleanup',
    'convert': 'Format Conversion'
  };

  const steps = chain.map(entry => displayNames[entry.processType] || entry.processType);
  return steps.join(' → ');
}

/**
 * Find the original raw image file for overlay purposes
 * Looks for files that are raw image uploads (category 'uploads' with 'raw' tag)
 * Also supports legacy categories for backward compatibility
 * @param {string} fileId - Starting file ID (e.g., mesh or segmentation result)
 * @param {object[]} allFiles - Array of all file objects
 * @returns {object|null} Original data file or null if not found
 *
 * @example
 * const original = findOriginalDataFile('mesh_file_123', metadata.files);
 * // Returns the original raw image file that started the chain
 */
function findOriginalDataFile(fileId, allFiles) {
  const result = findRootFiles(fileId, allFiles);

  // Helper to check if file is original raw data
  const isOriginalData = (file) => {
    if (!file) return false;

    // New category system: uploads with raw tag
    if (file.category === 'uploads' && file.tags && file.tags.includes('raw')) {
      return true;
    }

    // Legacy categories for backward compatibility with existing workspaces
    const legacyCategories = ['raw_images', 'raw', 'inference_data'];
    if (legacyCategories.includes(file.category)) {
      return true;
    }

    return false;
  };

  // First, check root files
  for (const rootId of result.rootIds) {
    const file = allFiles.find(f => f.id === rootId);
    if (isOriginalData(file)) {
      return file;
    }
  }

  // If no direct root match, look through the entire path
  for (const entry of result.path) {
    const file = allFiles.find(f => f.id === entry.fileId);
    if (isOriginalData(file)) {
      return file;
    }
  }

  return null;
}

/**
 * Check if a file has lineage (i.e., was processed from another file)
 * @param {object} file - File object from metadata
 * @returns {boolean} True if file has lineage, false if it's an original upload
 */
function hasLineage(file) {
  return !!(file && file.lineage && file.lineage.inputs && file.lineage.inputs.length > 0);
}

/**
 * Get the immediate parent files (direct inputs) for a file
 * @param {object} file - File object from metadata
 * @param {object[]} allFiles - Array of all file objects
 * @returns {object[]} Array of parent file objects
 */
function getParentFiles(file, allFiles) {
  if (!hasLineage(file)) {
    return [];
  }

  return file.lineage.inputs
    .map(inputId => allFiles.find(f => f.id === inputId))
    .filter(f => f !== undefined);
}

module.exports = {
  createLineage,
  findRootFiles,
  getLineageChain,
  getProcessingHistoryString,
  findOriginalDataFile,
  hasLineage,
  getParentFiles
};
