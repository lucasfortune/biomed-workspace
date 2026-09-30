/**
 * uploadKind - detect what an uploaded file is and place it in the workspace
 * (ADR-018). Uploads land in a temp folder first; the kind decides the
 * destination folder, the category and the tags:
 *
 *   raw          uploads/raw/           uploads   raw
 *   annotation   uploads/annotations/   uploads   annotation
 *   weights      models/imported/       models    unspecified + weights
 *   config       models/imported/       models    unspecified + config
 *   package      models/imported/       models    bioimageio + weights
 *   workspace    (a workspace backup, handed to the restore flow)
 *
 * TIFF/MRC files are told apart by content (python/probe_upload.py); a
 * caller's hint (a module selector that knows what it asked for) wins over
 * the heuristic for images. Zips are peeked for metadata.json (backup) or
 * an rdf.yaml / bioimageio.yaml (package).
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const unzipper = require('unzipper');
const { PYTHON_PATH, UPLOAD_LIMITS } = require('../config/constants');
const { toPhysicalName, uniqueFileName } = require('./namingHelpers');

const IMAGE_EXT = ['.tif', '.tiff'];
const KINDS = {
  raw: { dir: 'uploads/raw', category: 'uploads', tags: ['raw'], label: 'raw image data', limit: UPLOAD_LIMITS.tiffFileSize },
  annotation: { dir: 'uploads/annotations', category: 'uploads', tags: ['annotation'], label: 'an annotation', limit: UPLOAD_LIMITS.tiffFileSize },
  weights: { dir: 'models/imported', category: 'models', tags: ['unspecified', 'weights'], label: 'model weights', limit: UPLOAD_LIMITS.modelFileSize },
  config: { dir: 'models/imported', category: 'models', tags: ['unspecified', 'config'], label: 'a model config', limit: UPLOAD_LIMITS.modelFileSize },
  package: { dir: 'models/imported', category: 'models', tags: ['bioimageio', 'weights'], label: 'a bioimage.io package', limit: UPLOAD_LIMITS.modelFileSize },
  workspace: { dir: null, category: null, tags: [], label: 'a workspace backup', limit: UPLOAD_LIMITS.workspaceZipFileSize }
};

/** Legacy category values (and the kind names themselves) to a kind hint */
function normalizeHint(value) {
  const v = String(value || '').toLowerCase();
  if (['raw', 'raw_images', 'inference_data', 'image', 'images'].includes(v)) return 'raw';
  if (['annotation', 'annotations', 'mask', 'labels'].includes(v)) return 'annotation';
  if (['model', 'models', 'imported_models', 'weights'].includes(v)) return 'weights';
  if (['config'].includes(v)) return 'config';
  if (['package', 'bioimageio'].includes(v)) return 'package';
  if (['workspace', 'backup'].includes(v)) return 'workspace';
  return null;
}

/** Entry names of a zip (top-level listing is enough for the decision) */
function listZipEntries(zipPath, limit = 4000) {
  return new Promise((resolve, reject) => {
    const names = [];
    let done = false;
    const stream = fs.createReadStream(zipPath).pipe(unzipper.Parse());
    stream.on('entry', (entry) => {
      if (!done) names.push(String(entry.path).replace(/\\/g, '/'));
      entry.autodrain();
      if (names.length >= limit) done = true;
    });
    stream.on('close', () => resolve(names));
    stream.on('finish', () => resolve(names));
    stream.on('error', reject);
  });
}

/** Run probe_upload.py on a TIFF; resolves with the PROBE payload or null */
function probeTiff(filePath, logger) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let proc;
    try {
      proc = spawn(PYTHON_PATH, ['python/probe_upload.py', filePath]);
    } catch (e) {
      return resolve(null);
    }
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const line = stdout.split('\n').find(l => l.startsWith('PROBE:'));
      if (line) {
        try { return resolve(JSON.parse(line.substring(6))); } catch (e) { /* fall through */ }
      }
      if (logger) logger.warn('[uploadKind] probe failed:', stderr.trim().split('\n').slice(-2).join(' '));
      resolve(null);
    });
  });
}

/**
 * Detect the kind of an uploaded file.
 * @param {string} filePath - Absolute path of the uploaded (temp) file
 * @param {string} originalName - The user's file name
 * @param {object} [opts]
 * @param {string} [opts.hint] - Kind hint from the caller (wins for images)
 * @param {object} [opts.logger]
 * @returns {Promise<{kind: string|null, reason: string, probe?: object}>}
 */
async function detectKind(filePath, originalName, opts = {}) {
  const ext = path.extname(originalName || filePath).toLowerCase();
  const hint = normalizeHint(opts.hint);

  if (ext === '.zip') {
    let entries = [];
    try { entries = await listZipEntries(filePath); } catch (e) {
      return { kind: null, reason: `not a readable zip archive (${e.message})` };
    }
    if (entries.includes('metadata.json')) return { kind: 'workspace', reason: 'metadata.json at the archive root' };
    if (entries.some(n => /(^|\/)(rdf|bioimageio)\.ya?ml$/i.test(n))) return { kind: 'package', reason: 'bioimage.io description found' };
    return { kind: null, reason: 'zip is neither a workspace backup (metadata.json) nor a bioimage.io package (rdf.yaml)' };
  }
  if (ext === '.pth' || ext === '.pt') return { kind: 'weights', reason: 'PyTorch checkpoint' };
  if (ext === '.json') return { kind: 'config', reason: 'JSON configuration' };
  if (IMAGE_EXT.includes(ext)) {
    if (hint === 'raw' || hint === 'annotation') return { kind: hint, reason: 'kind given by the caller' };
    const probe = await probeTiff(filePath, opts.logger);
    if (!probe) return { kind: 'raw', reason: 'content probe unavailable, treated as raw image data', probe: null };
    return { kind: probe.kind, reason: probe.reason, probe };
  }
  return { kind: null, reason: `unsupported file type ${ext || '(none)'}` };
}

/**
 * Move an uploaded temp file into the workspace under its kind's folder,
 * keeping the original file name (sanitised, unique in the folder).
 * @returns {{absPath: string, relPath: string, name: string, category: string, tags: string[]}}
 */
function placeUploadedFile(workspaceManager, sessionId, tmpPath, originalName, kind) {
  const spec = KINDS[kind];
  if (!spec || !spec.dir) throw new Error(`Cannot place a file of kind '${kind}'`);
  const workspacePath = workspaceManager.getWorkspacePath(sessionId);
  const dir = path.join(workspacePath, spec.dir);
  fs.mkdirSync(dir, { recursive: true });
  const name = uniqueFileName(dir, toPhysicalName(originalName, 'upload'));
  const absPath = path.join(dir, name);
  try {
    fs.renameSync(tmpPath, absPath);
  } catch (e) {
    // Different volume: copy then remove
    fs.copyFileSync(tmpPath, absPath);
    fs.unlinkSync(tmpPath);
  }
  return {
    absPath,
    relPath: path.relative(workspacePath, absPath).replace(/\\/g, '/'),
    name,
    category: spec.category,
    tags: spec.tags.slice()
  };
}

module.exports = { KINDS, normalizeHint, detectKind, placeUploadedFile, listZipEntries, probeTiff };
