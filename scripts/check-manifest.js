#!/usr/bin/env node
/**
 * check-manifest - validate a workspace manifest (metadata.json) against the
 * data model (ADR-012, ADR-018).
 *
 *   node scripts/check-manifest.js <workspaceDir> [--no-disk] [--json]
 *
 * Exit code 1 when any error is found. Warnings never fail the check.
 * Also usable as a module: require(...).checkManifest(workspaceDir, opts).
 */

const fs = require('fs');
const path = require('path');

const CATEGORIES = ['uploads', 'models', 'results'];
const UPLOAD_KIND_TAGS = ['raw', 'annotation'];
const MODEL_METHOD_TAGS = ['denoising', 'segmentation', 'bioimageio', 'unspecified'];
const MODEL_TYPE_TAGS = ['weights', 'config', 'info', 'card'];
// File operations keep the category of their source, so an upload may carry
// one of these lineage records (ADR-012)
const UPLOAD_LINEAGE_OK = ['duplicate', 'convert', 'split'];
const RESULT_METHOD_TAGS = ['denoising', 'annotation', 'segmentation', 'mesh', 'preprocess', 'stitching', 'segcleanup'];
const RESULT_TYPE_TAGS = ['data', 'info', 'wip', 'recipe', 'report'];
// Type tags that mark a companion file of a main output (must carry parentId)
const SIDECAR_TYPE_TAGS = ['info', 'config', 'recipe'];
const CACHE_DIRS = ['.thumbnails', '.slices', '.mesh-previews', '.preprocess', '.segcleanup', '.classifier'];
// Files a run writes next to tracked outputs without tracking them
const UNTRACKED_OK = new Set(['training_pairs.json', 'training_meta.json', 'metadata.json', 'metrics.json']);
const RUN_LABEL_RE = /^(?:results|models)\/[^/]+\/([a-z]+)(\d+)(?:\/|$)/;

function checkManifest(workspaceDir, opts = {}) {
  const errors = [];
  const warnings = [];
  const err = (id, msg) => errors.push(id ? `${id}: ${msg}` : msg);
  const warn = (id, msg) => warnings.push(id ? `${id}: ${msg}` : msg);

  const manifestPath = path.join(workspaceDir, 'metadata.json');
  if (!fs.existsSync(manifestPath)) {
    return { errors: [`no metadata.json in ${workspaceDir}`], warnings, files: 0 };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return { errors: [`metadata.json is not valid JSON: ${e.message}`], warnings, files: 0 };
  }

  if (!Array.isArray(manifest.files)) err(null, 'manifest.files is not an array');
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!manifest.version) warn(null, 'manifest has no version');
  if (!manifest.counters || typeof manifest.counters !== 'object') {
    warn(null, 'manifest has no counters (pre-1.3.0 manifest, or nothing produced yet)');
  }

  const byId = new Map();
  for (const f of files) {
    if (!f.id) { err(null, `row without id (path ${f.path})`); continue; }
    if (byId.has(f.id)) err(f.id, 'duplicate id');
    byId.set(f.id, f);
  }

  const displayNames = new Map();
  const labelMax = {};

  for (const f of files) {
    const id = f.id || '?';
    // Path and name
    if (typeof f.path !== 'string' || !f.path) { err(id, 'missing path'); continue; }
    const p = f.path.replace(/\\/g, '/');
    if (path.isAbsolute(p) || p.split('/').includes('..')) err(id, `path escapes the workspace: ${p}`);
    if (f.name !== path.posix.basename(p)) err(id, `name "${f.name}" !== basename(path) "${path.posix.basename(p)}"`);
    if (!opts.noDisk && !fs.existsSync(path.join(workspaceDir, p))) err(id, `file missing on disk: ${p}`);

    // Category and tags
    if (!CATEGORIES.includes(f.category)) err(id, `category "${f.category}" not in ${CATEGORIES.join('|')}`);
    const tags = Array.isArray(f.tags) ? f.tags : null;
    if (!tags) {
      err(id, 'tags missing');
    } else if (f.category === 'uploads') {
      if (!tags.some(t => UPLOAD_KIND_TAGS.includes(t))) err(id, `upload without raw|annotation tag (${tags.join(',')})`);
    } else if (f.category === 'models') {
      if (!tags.some(t => MODEL_METHOD_TAGS.includes(t))) err(id, `model without method tag (${tags.join(',')})`);
      if (!tags.some(t => MODEL_TYPE_TAGS.includes(t))) err(id, `model without type tag (${tags.join(',')})`);
    } else if (f.category === 'results') {
      if (!tags.some(t => RESULT_METHOD_TAGS.includes(t))) err(id, `result without method tag (${tags.join(',')})`);
      if (!tags.some(t => RESULT_TYPE_TAGS.includes(t))) err(id, `result without type tag (${tags.join(',')})`);
    }

    // Display names unique
    const dn = String(f.displayName || f.name || '').toLowerCase();
    if (displayNames.has(dn)) err(id, `display name "${f.displayName || f.name}" also used by ${displayNames.get(dn)}`);
    else displayNames.set(dn, id);

    // Lineage
    const lin = f.lineage;
    if (lin) {
      if (f.category === 'uploads' && !UPLOAD_LINEAGE_OK.includes(lin.processType)) {
        err(id, 'upload row carries lineage (module outputs are never uploads)');
      }
      if (!lin.processType) err(id, 'lineage without processType');
      if (!lin.processedAt) warn(id, 'lineage without processedAt');
      if (!Array.isArray(lin.inputs)) {
        err(id, 'lineage.inputs is not an array');
      } else {
        for (const inputId of lin.inputs) {
          const input = byId.get(inputId);
          if (!input) warn(id, `lineage input ${inputId} no longer exists`);
          else if (input.category === 'models') err(id, `lineage input ${inputId} is a model (models belong in modelFileId)`);
        }
      }
      if (lin.modelFileId && !byId.has(lin.modelFileId)) warn(id, `modelFileId ${lin.modelFileId} no longer exists`);
    } else if (f.category === 'results') {
      err(id, 'result row without lineage');
    } else if (f.category === 'models' && tags && !tags.includes('unspecified') && !(tags.includes('bioimageio') && !lin)) {
      // models without lineage: imported .pth/.json (unspecified) and uploaded packages only
      err(id, 'model row without lineage that is not an import');
    }

    // Sidecars: module-written info/config/recipe files hang off their main
    // output. Imported model configs (no lineage) stand alone.
    if (f.parentId && !byId.has(f.parentId)) err(id, `parentId ${f.parentId} does not exist`);
    if (tags && lin && tags.some(t => SIDECAR_TYPE_TAGS.includes(t)) && !f.parentId) {
      err(id, `sidecar (${tags.join(',')}) without parentId`);
    }

    // Run labels
    const m = RUN_LABEL_RE.exec(p);
    if (m) {
      const n = parseInt(m[2], 10);
      labelMax[m[1]] = Math.max(labelMax[m[1]] || 0, n);
    }
  }

  // Counters cover every label in use
  const counters = manifest.counters || {};
  for (const [prefix, max] of Object.entries(labelMax)) {
    if ((counters[prefix] || 0) < max) err(null, `counter ${prefix}=${counters[prefix] || 0} below highest folder label ${prefix}${max}`);
  }

  // Orphans on disk
  if (!opts.noDisk) {
    const tracked = new Set(files.map(f => String(f.path).replace(/\\/g, '/')));
    const walk = (dir, rel) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const e of entries) {
        if (rel === '' && CACHE_DIRS.includes(e.name)) continue;
        if (e.name === '.slices' || e.name === 'build') continue;
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), relPath);
        else if (!tracked.has(relPath) && !UNTRACKED_OK.has(e.name)) warn(null, `untracked file on disk: ${relPath}`);
      }
    };
    walk(workspaceDir, '');
  }

  return { errors, warnings, files: files.length };
}

function main() {
  const args = process.argv.slice(2);
  const dir = args.find(a => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: node scripts/check-manifest.js <workspaceDir> [--no-disk] [--json]');
    process.exit(2);
  }
  const result = checkManifest(path.resolve(dir), { noDisk: args.includes('--no-disk') });
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const w of result.warnings) console.log(`WARN  ${w}`);
    for (const e of result.errors) console.log(`ERROR ${e}`);
    console.log(`${result.files} files, ${result.errors.length} errors, ${result.warnings.length} warnings`);
  }
  process.exit(result.errors.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { checkManifest };
