/**
 * namingHelpers - Consistent, self-documenting display names for workspace files.
 *
 * The workspace tracks each file with a physical `name`/`path` (often coupled to backend
 * logic) and, separately, a user-facing `displayName`. These helpers build the display
 * name from the *source* file's display name plus a short operation token, so provenance
 * chains naturally:
 *
 *   trypB.tif -> trypB_gaussian.tif -> trypB_gaussian_seg.tif -> trypB_gaussian_seg_mesh.obj
 *
 * Physical filenames are never derived from these — only what the user sees and downloads.
 */

// Operation token vocabulary (short, method-specific). Keep tokens lowercase and free of
// separators so they read cleanly when chained with '_'.
const OPERATION_TOKENS = {
  // Filter denoising
  'denoising-gaussian': 'gaussian',
  'denoising-nlm': 'nlm',
  // Deep-learning denoising
  'denoising-n2v': 'n2v',
  'denoising-autostructn2v-stage1': 'asn2v',
  'denoising-autostructn2v-stage2': 'asn2v2',
  // Deep-learning denoising inference / training records (the method-specific
  // keys above are used when the method is known)
  denoising: 'dn',
  'denoising-training': 'dn',
  // Segmentation / inference
  segmentation: 'seg',
  'segmentation-training': 'seg',
  // Training continued from a parent model (ADR-017)
  finetune: 'ft',
  'segmentation-finetune': 'ft',
  // bioimage.io packages (ADR-016) and zoo model cards (ADR-015)
  'bioimageio-export': 'export',
  'bioimageio-import': 'card',
  // Mesh generation
  meshGeneration: 'mesh',
  mesh: 'mesh',
  // Annotation
  annotation: 'annot',
  // Preprocessing
  preprocess: 'prep',
  // Stitching
  stitching: 'stitch',
  // Segmentation cleanup
  segcleanup: 'clean',
  // File operations (convert appends the target format via the extension:
  // stack_conv.stl; split parts are distinguished via qualifier part1/part2)
  convert: 'conv',
  duplicate: 'copy',
  split: 'split'
};

// Soft cap on the base portion (without extension). Beyond this we trim the *middle* of
// the chain, keeping the source identity (head) and the most recent operations (tail).
const MAX_BASE_LENGTH = 64;

/**
 * Split a filename into base and extension. Handles compound names with multiple dots by
 * treating only the final segment as the extension (e.g. 'a.b.tif' -> base 'a.b', ext '.tif').
 * @param {string} name
 * @returns {{ base: string, ext: string }}
 */
function splitNameExt(name) {
  const safe = (name || '').trim();
  const dot = safe.lastIndexOf('.');
  if (dot <= 0) {
    return { base: safe, ext: '' };
  }
  return { base: safe.slice(0, dot), ext: safe.slice(dot) };
}

/**
 * Resolve a processType (+ optional method) into a short token. Falls back to a sanitized
 * version of the processType when unknown, so new process types still produce sane names.
 * @param {string} operation - A key from OPERATION_TOKENS, or an arbitrary process type
 * @returns {string}
 */
function operationToken(operation) {
  if (!operation) return 'out';
  if (OPERATION_TOKENS[operation]) return OPERATION_TOKENS[operation];
  // Unknown operation: sanitize to a compact token.
  return String(operation)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12) || 'out';
}

/**
 * Trim an over-long base while preserving the head (source identity) and tail (recent ops).
 * @param {string} base
 * @returns {string}
 */
function capBaseLength(base) {
  if (base.length <= MAX_BASE_LENGTH) return base;
  const segments = base.split('_');
  // Always keep the first segment (original source name) and the last two operation tokens.
  if (segments.length <= 3) {
    return base.slice(0, MAX_BASE_LENGTH);
  }
  const head = segments[0];
  const tail = segments.slice(-2).join('_');
  let candidate = `${head}_${tail}`;
  if (candidate.length > MAX_BASE_LENGTH) {
    candidate = candidate.slice(0, MAX_BASE_LENGTH);
  }
  return candidate;
}

/**
 * Build the ideal (pre-collision-resolution) display name for a derived file.
 * @param {object} opts
 * @param {string} opts.sourceName - Display name (or name) of the primary input file
 * @param {string} opts.operation - Process type / operation key (see OPERATION_TOKENS)
 * @param {string} opts.ext - Output extension including dot (e.g. '.tif'); falls back to
 *                            the source extension when omitted
 * @param {string} [opts.qualifier] - Optional extra qualifier appended after the operation
 *                                    token (e.g. 'info' for metadata, 'model' for weights),
 *                                    so auxiliary files don't collide with the primary output
 * @returns {string} Display name (not yet de-duplicated against the workspace)
 */
function buildDisplayName({ sourceName, operation, ext, qualifier }) {
  const src = splitNameExt(sourceName || 'file');
  const token = operationToken(operation);
  const outExt = ext || src.ext || '';
  let base = `${src.base}_${token}`;
  if (qualifier) base += `_${qualifier}`;
  base = capBaseLength(base);
  return `${base}${outExt}`;
}

/**
 * Ensure a candidate display name is unique within a set of existing display names.
 * Appends ' (2)', ' (3)', … before the extension until unique. Comparison is
 * case-insensitive to avoid confusingly-similar names.
 * @param {string} candidate
 * @param {Iterable<string>} existingNames - display names already in use
 * @returns {string}
 */
function resolveDisplayNameCollision(candidate, existingNames) {
  const taken = new Set();
  for (const n of existingNames || []) {
    if (n) taken.add(String(n).toLowerCase());
  }
  if (!taken.has(candidate.toLowerCase())) return candidate;

  const { base, ext } = splitNameExt(candidate);
  let counter = 2;
  let next;
  do {
    next = `${base} (${counter})${ext}`;
    counter += 1;
  } while (taken.has(next.toLowerCase()));
  return next;
}

/**
 * Turn a display name into a file-system safe physical name (ADR-018: files
 * inside a run folder carry their display name on disk). Whitespace becomes
 * '_', anything outside [A-Za-z0-9._()-] is dropped, and the result never
 * starts with a dot or ends up empty.
 * @param {string} name
 * @param {string} [fallback='file']
 * @returns {string}
 */
function toPhysicalName(name, fallback = 'file') {
  const { base, ext } = splitNameExt(String(name || ''));
  const clean = (s) => s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._()-]+/g, '')
    .replace(/_{2,}/g, '_');
  const safeBase = clean(base).replace(/^[._]+/, '').slice(0, 120) || fallback;
  const safeExt = ext ? `.${clean(ext.slice(1)).replace(/^[._]+/, '').toLowerCase()}` : '';
  return `${safeBase}${safeExt === '.' ? '' : safeExt}`;
}

/**
 * Pick a file name that does not exist in `dir` yet: name, name_2, name_3, ...
 * (the suffix goes before the extension). Purely a disk check; display-name
 * uniqueness is handled separately by resolveDisplayNameCollision.
 * @param {string} dir - Absolute directory
 * @param {string} name - Desired file name
 * @param {(p: string) => boolean} [exists] - Existence check (fs.existsSync by default)
 * @returns {string}
 */
function uniqueFileName(dir, name, exists) {
  const fs = require('fs');
  const path = require('path');
  const check = exists || ((p) => fs.existsSync(p));
  if (!check(path.join(dir, name))) return name;
  const { base, ext } = splitNameExt(name);
  let counter = 2;
  let next;
  do {
    next = `${base}_${counter}${ext}`;
    counter += 1;
  } while (check(path.join(dir, next)));
  return next;
}

module.exports = {
  OPERATION_TOKENS,
  MAX_BASE_LENGTH,
  splitNameExt,
  operationToken,
  buildDisplayName,
  resolveDisplayNameCollision,
  toPhysicalName,
  uniqueFileName
};
