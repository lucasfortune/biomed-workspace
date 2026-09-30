#!/usr/bin/env node
/**
 * harness-producers - run every workspace producer once against a scratch
 * DATA_DIR and validate the manifest after each step (ADR-018).
 *
 *   node scripts/harness-producers.js            # everything
 *   node scripts/harness-producers.js --skip-dl  # without DL denoising (slow)
 *   node scripts/harness-producers.js --legacy <workspaceDir>
 *       also restores a backup made from an existing (old) workspace
 *
 * The app is booted in-process with a fake session (no login) on a random
 * port; real Python does the work. Scratch data lives in tmp/hk/data.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'tmp', 'hk', 'data');
process.env.DATA_DIR = DATA_DIR;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'harness-secret';
process.chdir(ROOT);

const args = process.argv.slice(2);
const SKIP_DL = args.includes('--skip-dl');
const LEGACY_DIR = args.includes('--legacy') ? args[args.indexOf('--legacy') + 1] : null;

const SESSION_ID = 'harness_ws';
fs.rmSync(path.join(DATA_DIR, 'workspaces', SESSION_ID), { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const { PYTHON_PATH, DATA_PATHS, ensureDataDirectories } = require('../src/config/constants');
ensureDataDirectories();
if (!process.env.BIOIMAGEIO_CACHE_PATH) process.env.BIOIMAGEIO_CACHE_PATH = DATA_PATHS.bioimageioCache;

const logger = {
  info: () => {}, debug: () => {}, warn: (...a) => console.warn('[warn]', ...a),
  error: (...a) => console.error('[error]', ...a)
};
const activityLogger = require('../activityLogger');
activityLogger.initialize(DATA_DIR);

const WorkspaceManager = require('../WorkspaceManager');
const { WorkspaceService, FileService, AuthService, TrainingService, InferenceService, DenoisingService } = require('../src/services');
const sessionTracker = require('../src/services/SessionTracker');
const { initializeSocketHandlers } = require('../src/sockets');
const configureApp = require('../src/app');
const { checkManifest } = require('./check-manifest');

const workspaceManager = new WorkspaceManager({ workspacesBaseDir: DATA_PATHS.workspaces });
const workspaceService = new WorkspaceService({ workspaceManager, activityLogger, logger });
const fileService = new FileService({ workspaceService, pythonPath: PYTHON_PATH, logger });
const authService = new AuthService({ usersFilePath: DATA_PATHS.usersFile, activityLogger, logger });
const trainingService = new TrainingService({ pythonPath: PYTHON_PATH, sessionTracker, fileService, workspaceManager, logger });
const inferenceService = new InferenceService({ pythonPath: PYTHON_PATH, sessionTracker, fileService, workspaceService, workspaceManager, logger });
const denoisingService = new DenoisingService({ pythonPath: PYTHON_PATH, sessionTracker, workspaceManager, logger });
const telegramService = { notify: async () => {}, isEnabled: () => false };

const SESSION = {
  id: SESSION_ID,
  user: { username: 'harness', fullName: 'Harness User', status: 'active', isAdmin: false },
  save(cb) { if (cb) cb(); },
  destroy(cb) { if (cb) cb(); },
  touch() {}
};
const sessionMiddleware = (req, res, next) => { req.session = SESSION; next(); };

const express = require('express');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);
initializeSocketHandlers(io, logger);
configureApp(app, {
  env: { SESSION_SECRET: process.env.SESSION_SECRET },
  logger,
  io,
  sessionMiddleware,
  workspaceManager,
  services: { workspaceService, fileService, authService, trainingService, inferenceService, denoisingService, telegramService },
  activityLogger
});

const WS = path.join(DATA_PATHS.workspaces, SESSION_ID);
let BASE = '';
let failures = 0;
const ok = (label, detail) => console.log(`OK   ${label}${detail ? ' | ' + detail : ''}`);
const fail = (label, detail) => { failures++; console.log(`FAIL ${label}${detail ? ' | ' + detail : ''}`); };
const assert = (cond, label, detail) => (cond ? ok(label, detail) : fail(label, detail));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(method, route, { json, form } = {}) {
  const opts = { method, headers: {} };
  if (json !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(json); }
  if (form) opts.body = form;
  const res = await fetch(BASE + route, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }
  return { status: res.status, body };
}
const formWith = (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v && v.buffer) fd.append(k, new Blob([v.buffer]), v.name);
    else fd.append(k, v);
  }
  return fd;
};
const upload = (filePath, name, kind) => api('POST', '/api/workspace/upload', {
  form: formWith({ file: { buffer: fs.readFileSync(filePath), name: name || path.basename(filePath) }, ...(kind && { kind }) })
});
const manifest = () => workspaceManager.loadMetadata(SESSION_ID);
const files = () => manifest().files;
const byId = (id) => files().find(f => f.id === id);
const byPath = (re) => files().find(f => re.test(f.path));

async function waitFor(pred, label, timeoutMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await pred();
    if (v) return v;
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${label}`);
}
const waitForProcessId = (processId, label) => waitFor(() => files().find(f => f.lineage && f.lineage.processId === processId), label);

function check(label) {
  const result = checkManifest(WS);
  if (result.errors.length) {
    fail(`manifest after ${label}`, `${result.errors.length} errors`);
    for (const e of result.errors) console.log(`       ERROR ${e}`);
  } else {
    ok(`manifest after ${label}`, `${result.files} files, ${result.warnings.length} warnings`);
  }
  for (const w of result.warnings) if (!/no counters/.test(w)) console.log(`       WARN ${w}`);
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;
  console.log(`harness on ${BASE}, workspace ${WS}`);

  // ---- 0. workspace with the seeded samples ------------------------------
  let r = await api('POST', '/api/workspace/init');
  assert(r.status === 200, 'workspace initialised');
  const sampleRaw = byPath(/sample_raw\.tif$/);
  const sampleAnn = byPath(/sample_annotation\.tif$/);
  assert(sampleRaw && sampleAnn, 'samples seeded', `${sampleRaw && sampleRaw.path}, ${sampleAnn && sampleAnn.path}`);
  check('init');

  // ---- 1. uploads with kind detection -------------------------------------
  r = await upload('test_data/trypB_testData_training.tif');
  const raw = r.body.file;
  assert(r.status === 200 && raw && raw.detectedKind === 'raw', 'raw upload detected as raw', raw && `${raw.path} tags ${raw.tags}`);
  assert(raw && raw.name === 'trypB_testData_training.tif' && raw.path === 'uploads/raw/trypB_testData_training.tif', 'upload keeps its original name');
  r = await upload('test_data/trypB_testData_annotations.tif');
  const ann = r.body.file;
  assert(r.status === 200 && ann && ann.detectedKind === 'annotation', 'annotation upload detected as annotation', ann && `${ann.path} (${ann.detectedReason})`);
  r = await upload('test_data/trypB_testData_training.tif', 'hinted.tif', 'annotation');
  const hinted = r.body.file;
  assert(hinted && hinted.detectedKind === 'annotation' && hinted.path.startsWith('uploads/annotations/'), 'kind hint wins for images');
  r = await api('PATCH', `/api/workspace/file/${hinted.id}/kind`, { json: { kind: 'raw' } });
  assert(r.status === 200 && byId(hinted.id).tags.includes('raw') && !byId(hinted.id).tags.includes('annotation'), 'change kind raw');
  r = await upload('test_data/trypB_testData_training.tif');
  const dup = r.body.file;
  assert(dup && dup.name === 'trypB_testData_training_2.tif' && /\(2\)\.tif$/.test(dup.displayName), 'second upload of the same name', `${dup && dup.name} / ${dup && dup.displayName}`);
  r = await upload('package.json', 'not-a-model.json');
  assert(r.status === 200 && r.body.file && r.body.file.category === 'models' && r.body.file.path.startsWith('models/imported/'), 'json upload placed as model config');
  const junkId = r.body.file && r.body.file.id;
  fs.writeFileSync(path.join(os.tmpdir(), 'harness_junk.zip'), 'PK\u0003\u0004nothing');
  r = await upload(path.join(os.tmpdir(), 'harness_junk.zip'), 'junk.zip');
  assert(r.status === 400, 'unrecognised zip refused', r.body.error);
  check('uploads');

  // ---- 2. training from scratch ------------------------------------------
  r = await api('POST', '/upload-data', { form: formWith({ skipUpload: 'true', pairs: JSON.stringify([{ raw_images_path: raw.path, annotations_path: ann.path }]) }) });
  assert(r.status === 200 && r.body.success, 'training pairs validated', r.body.error);
  const trainConfig = { patch_size: 64, patches_per_image: 2, batch_size: 2, num_epochs: 1, learning_rate: 0.001, features: 16, num_layers: 2, val_fraction: 0.2 };
  r = await api('POST', '/configure-training', { json: trainConfig });
  assert(r.status === 200, 'training configured', r.body.error || (r.body.details && r.body.details.join(';')));
  r = await api('POST', '/start-training');
  assert(r.status === 200 && r.body.training_id, 'training started', r.body.error);
  const trainingId = r.body.training_id;
  let status = await waitFor(async () => {
    const s = (await api('GET', `/training-status/${trainingId}`)).body;
    return ['completed', 'failed'].includes(s.status) ? s : null;
  }, 'training');
  assert(status.status === 'completed', 'training completed', status.error);
  const pth = await waitFor(() => byPath(/^models\/segmentation\/train1\/best_model\.pth$/), 'model tracked');
  assert(pth && pth.displayName === 'trypB_testData_training_seg_model.pth', 'model display name from the raw display name', pth && pth.displayName);
  const trainCfg = byPath(/^models\/segmentation\/train1\/config\.json$/);
  const trainRes = byPath(/^models\/segmentation\/train1\/results\.json$/);
  assert(trainCfg && trainCfg.parentId === pth.id && trainRes && trainRes.parentId === pth.id, 'config/results hang off the model');
  assert(pth.lineage.processType === 'segmentation-training' && pth.lineage.inputs.length === 2 && !pth.lineage.modelFileId, 'training lineage: pairs only');
  check('training');

  // ---- 3. inference with the trained model --------------------------------
  r = await api('POST', '/upload-inference', { form: formWith({ skipUpload: 'true', inference_data_path: raw.path }) });
  assert(r.status === 200, 'inference data validated', r.body.error);
  r = await api('POST', '/run-inference', { json: { data_path: raw.path, training_id: trainingId, inputFileIds: [raw.id] } });
  assert(r.status === 200 && r.body.inference_id, 'inference started', r.body.error);
  const inferenceId = r.body.inference_id;
  status = await waitFor(async () => {
    const s = (await api('GET', `/inference-status/${inferenceId}`)).body;
    return ['completed', 'failed'].includes(s.status) ? s : null;
  }, 'inference');
  assert(status.status === 'completed', 'inference completed', status.error);
  const seg = await waitFor(() => byPath(/^results\/segmentation\/seg1\/trypB_testData_training_seg\.tif$/), 'segmentation tracked');
  const segInfo = byPath(/^results\/segmentation\/seg1\/trypB_testData_training_seg_info\.json$/);
  assert(seg && segInfo && segInfo.parentId === seg.id, 'segmentation output carries its display name, info is a sidecar', seg && seg.path);
  assert(seg.lineage.modelFileId === pth.id && seg.lineage.inputs.length === 1, 'segmentation lineage: data input + modelFileId');
  assert(status.result && /\/results\/segmentation\/seg1\/trypB_testData_training_seg\.tif$/.test(status.result.output_path), 'web result path follows the rename', status.result && status.result.output_path);
  check('inference');

  // ---- 4. fine-tune from the checkpoint ------------------------------------
  r = await api('POST', '/api/segmentation/start-model', { json: { kind: 'checkpoint', fileId: pth.id } });
  assert(r.status === 200, 'checkpoint accepted as starting point', r.body.error);
  r = await api('POST', '/configure-training', { json: { ...trainConfig } });
  assert(r.status === 200, 'fine-tune configured', r.body.error);
  r = await api('POST', '/start-training');
  const ftId = r.body.training_id;
  status = await waitFor(async () => {
    const s = (await api('GET', `/training-status/${ftId}`)).body;
    return ['completed', 'failed'].includes(s.status) ? s : null;
  }, 'fine-tune');
  assert(status.status === 'completed', 'fine-tune completed', status.error);
  const ftPth = await waitFor(() => byPath(/^models\/segmentation\/train2\/best_model\.pth$/), 'fine-tuned model tracked');
  assert(ftPth.displayName === 'trypB_testData_training_ft_model.pth', 'fine-tune display name', ftPth.displayName);
  assert(ftPth.lineage.processType === 'segmentation-finetune' && ftPth.lineage.modelFileId === pth.id && ftPth.lineage.inputs.every(id => byId(id).category === 'uploads'), 'fine-tune lineage: parent in modelFileId, inputs data-only');
  await api('POST', '/api/segmentation/start-model', { json: { kind: 'none' } });
  check('fine-tune');

  // ---- 5. bioimage.io export -----------------------------------------------
  r = await api('POST', '/api/bioimageio/export', { json: { fileId: pth.id, name: 'Harness U-Net', license: 'CC-BY-4.0', sampleFileId: raw.id } });
  assert(r.status === 200 && r.body.exportId, 'export started', r.body.error);
  let exp = await waitFor(async () => {
    const s = (await api('GET', `/api/bioimageio/export/${r.body.exportId}`)).body.export;
    return ['done', 'failed'].includes(s.status) ? s : null;
  }, 'export');
  assert(exp.status === 'done', 'export done', exp.error);
  const zip = exp.result && byId(exp.result.fileId);
  assert(zip && zip.path === 'models/bioimageio/export1/Harness_U-Net.zip', 'package in export1 under its display name', zip && zip.path);
  assert(zip.lineage.modelFileId === pth.id && zip.lineage.inputs.length === 1 && zip.lineage.inputs[0] === raw.id, 'export lineage: sample input, model as modelFileId');
  check('export');

  // ---- 5b. tiled inference with the exported package ----------------------
  r = await api('POST', '/api/bioimageio/select', { json: { source: { type: 'upload', fileId: zip.id } } });
  assert(r.status === 200, 'package selected', r.body.error);
  r = await api('POST', '/run-inference', { json: { data_path: raw.path, inputFileIds: [raw.id] } });
  assert(r.status === 200 && r.body.inference_id, 'package inference started', r.body.error);
  status = await waitFor(async () => {
    const s = (await api('GET', `/inference-status/${r.body.inference_id}`)).body;
    return ['completed', 'failed'].includes(s.status) ? s : null;
  }, 'package inference');
  assert(status.status === 'completed', 'package inference completed', status.error);
  const seg2 = await waitFor(() => byPath(/^results\/segmentation\/seg2\//), 'package segmentation tracked');
  assert(seg2.lineage.modelFileId === zip.id, 'package inference lineage points at the zip', seg2.path);
  await api('DELETE', '/api/bioimageio/select');
  check('package inference');

  // ---- 6. filter denoising -------------------------------------------------
  r = await api('POST', '/api/denoising/filter/process', { json: { inputPath: raw.path, method: 'gaussian', parameters: { sigma: 1 } } });
  assert(r.status === 200 && r.body.success, 'filter denoising done', r.body.error);
  const gauss = byPath(/^results\/denoising\/filter1\/trypB_testData_training_gaussian\.tif$/);
  assert(gauss && gauss.lineage.processType === 'denoising-gaussian', 'filter output in filter1 under its display name');
  check('filter denoising');

  // ---- 7. preprocess -------------------------------------------------------
  r = await api('POST', '/api/preprocess/apply', { json: { path: raw.path, ops: { flip_h: true }, outputName: '' } });
  assert(r.status === 200 && r.body.preprocessId, 'preprocess started', r.body.error);
  const prep = await waitForProcessId(r.body.preprocessId, 'preprocess');
  const prepCfg = files().find(f => f.lineage && f.lineage.processId === r.body.preprocessId && f.tags.includes('info'));
  assert(prep.path === 'results/preprocess/prep1/trypB_testData_training_prep.tif' && prepCfg && prepCfg.parentId === prep.id, 'preprocess output + config sidecar', `${prep.path}, ${prepCfg && prepCfg.path}`);
  r = await api('POST', '/api/preprocess/apply', { json: { path: raw.path, ops: { flip_v: true }, outputName: 'my custom name' } });
  const prep2 = await waitForProcessId(r.body.preprocessId, 'preprocess 2');
  assert(prep2.path === 'results/preprocess/prep2/my_custom_name.tif' && prep2.displayName === 'my custom name.tif', 'typed output name becomes display + physical name', prep2.path);
  check('preprocess');

  // ---- 8. stitching --------------------------------------------------------
  r = await api('POST', '/api/stitching/apply', { json: { recipe: { mode: 'grayscale', stacks: [{ fileId: raw.id, z_offset: 0 }, { fileId: sampleRaw.id, z_offset: 5 }] }, outputName: '' } });
  assert(r.status === 200 && r.body.stitchId, 'stitching started', r.body.error);
  const stitched = await waitForProcessId(r.body.stitchId, 'stitching');
  const recipe = files().find(f => f.lineage && f.lineage.processId === r.body.stitchId && f.tags.includes('recipe'));
  assert(stitched.path === 'results/stitching/stitch1/trypB_testData_training_stitch.tif' && recipe && recipe.parentId === stitched.id, 'stitch output + recipe sidecar', `${stitched.path}, ${recipe && recipe.path}`);
  check('stitching');

  // ---- 9. segmentation cleanup (save edits) ---------------------------------
  const zeros = Buffer.alloc(256 * 256).toString('base64');
  r = await api('POST', '/api/segcleanup/save-edits', { json: { path: ann.path, width: 256, height: 256, edits: { 0: { encoding: 'dense', data: zeros } }, outputName: '', sourceFileId: ann.id } });
  assert(r.status === 200 && r.body.jobId, 'cleanup save started', r.body.error);
  const clean = await waitForProcessId(r.body.jobId, 'segcleanup');
  assert(clean.path === 'results/segcleanup/clean1/trypB_testData_annotations_clean.tif', 'cleanup output in clean1', clean.path);
  check('segcleanup');

  // ---- 10. mesh --------------------------------------------------------------
  r = await api('POST', '/api/mesh/generate', { json: { sourceFile: ann.id, sourceFileId: ann.id, outputFormats: ['json', 'obj', 'stl'] } });
  assert(r.status === 200 && r.body.meshId, 'mesh started', r.body.error);
  status = await waitFor(async () => {
    const s = (await api('GET', `/api/mesh/status/${r.body.meshId}`)).body;
    return ['completed', 'failed'].includes(s.status) ? s : null;
  }, 'mesh');
  assert(status.status === 'completed', 'mesh completed', status.error);
  const obj = await waitFor(() => byPath(/^results\/meshes\/mesh1\/mesh\.obj$/), 'mesh tracked');
  const mtl = byPath(/^results\/meshes\/mesh1\/mesh\.mtl$/);
  const meshMeta = byPath(/^results\/meshes\/mesh1\/metadata\.json$/);
  assert(obj.displayName === 'trypB_testData_annotations_mesh.obj' && (!mtl || mtl.parentId === obj.id) && meshMeta && meshMeta.parentId, 'mesh files in mesh1 with sidecars linked', obj.displayName);
  assert(status.result && status.result.json_file_id && byId(status.result.json_file_id), 'mesh status carries the tracked json id');
  check('mesh');

  // ---- 11. annotation: save progress, promote, second annotation -----------
  const annBody = { sourceFileId: raw.id, sourceFileName: raw.name, width: 256, height: 256, slices: 23, sliceData: { 0: { encoding: 'dense', pixels: zeros } }, classes: [{ id: 1, name: 'cell', color: '#ff0000', visible: true }] };
  r = await api('POST', '/api/annotation/save-progress', { json: annBody });
  assert(r.status === 200 && r.body.fileId, 'annotation progress saved', r.body.error);
  const wipId = r.body.fileId;
  let wip = byId(wipId);
  assert(wip.path === 'results/annotation/annot1/trypB_testData_training_annot.tif' && wip.category === 'results' && wip.tags.includes('wip'), 'WIP annotation in annot1', wip.path);
  const sidecar = files().find(f => f.parentId === wipId);
  assert(sidecar && sidecar.path === 'results/annotation/annot1/trypB_testData_training_annot_classes.json' && sidecar.lineage, 'classes sidecar next to it with lineage', sidecar && sidecar.path);
  r = await api('POST', '/api/annotation/save-progress', { json: { ...annBody, existingAnnotationId: wipId } });
  assert(r.status === 200 && r.body.fileId === wipId && files().filter(f => f.path.startsWith('results/annotation/')).length === 2, 'second save rewrites in place');
  r = await api('POST', '/api/annotation/create', { json: { ...annBody, existingAnnotationId: wipId } });
  wip = byId(wipId);
  assert(r.status === 200 && r.body.promoted && wip.tags.includes('data') && !wip.tags.includes('wip') && wip.lineage.status === 'complete', 'create promotes the WIP in place');
  r = await api('POST', '/api/annotation/create', { json: { ...annBody, existingAnnotationId: wipId } });
  const ann2 = byId(r.body.fileId);
  assert(r.status === 200 && !r.body.promoted && ann2.path === 'results/annotation/annot2/trypB_testData_training_annot.tif' && /\(2\)/.test(ann2.displayName), 'create on a finished annotation makes a new one', ann2.path);
  r = await api('GET', `/api/annotation/load/${wipId}`);
  assert(r.status === 200 && r.body.status === 'complete' && r.body.classes.length === 1, 'annotation loads with its classes');
  check('annotation');

  // ---- 12. DL denoising (optional) ------------------------------------------
  if (!SKIP_DL) {
    const presets = (await api('GET', '/api/denoising/dl/presets')).body;
    const fast = presets.presets.fast || Object.values(presets.presets)[0];
    const stage1 = { ...fast.stage1, epochs: 1, patches_per_image: 4, batch_size: 8, early_stopping: false };
    r = await api('POST', '/api/denoising/dl/start-training', { json: { method: 'n2v', config: { stage1, stage2: fast.stage2, maskExtractor: fast.maskExtractor }, inputFileId: raw.id, inputPath: raw.path } });
    assert(r.status === 200 && r.body.trainingId, 'DL training started', r.body.error);
    const dlId = r.body.trainingId;
    status = await waitFor(async () => {
      const s = (await api('GET', `/api/denoising/dl/training-status/${dlId}`)).body;
      return ['completed', 'failed', 'cancelled'].includes(s.status) ? s : null;
    }, 'DL training', 1800000);
    assert(status.status === 'completed', 'DL training completed', status.error);
    const dn = await waitFor(() => byPath(/^results\/denoising\/dn1\/trypB_testData_training_n2v\.tif$/), 'DL denoised stack tracked');
    const dnModel = byPath(/^models\/denoising\/dn1\/best_model\.pth$/);
    const dnCfg = byPath(/^models\/denoising\/dn1\/config\.json$/);
    assert(dn && dnModel && dnCfg && dnCfg.parentId === dnModel.id, 'DL outputs in dn1 with sidecars linked', dnModel && dnModel.displayName);
    assert(!fs.existsSync(path.join(WS, 'models', 'denoising', 'dn1', `config_${dlId}.json`)), 'launch config removed');
    check('DL denoising');
  } else {
    console.log('SKIP DL denoising');
  }

  // ---- 13. file operations ----------------------------------------------------
  r = await api('POST', `/api/workspace/file/${raw.id}/duplicate`);
  assert(r.status === 200 && r.body.file.path === 'uploads/raw/trypB_testData_training_copy.tif', 'duplicate next to the source under its display name', r.body.file && r.body.file.path);
  r = await api('POST', `/api/workspace/file/${raw.id}/convert`, { json: { format: 'mrc' } });
  assert(r.status === 200 && r.body.file.path === 'uploads/raw/trypB_testData_training_conv.mrc', 'convert to MRC', r.body.file && r.body.file.path);
  r = await api('POST', `/api/workspace/file/${ann.id}/split`, { json: { splitAt: 10, deleteOriginal: false } });
  assert(r.status === 200 && r.body.files[0].path === 'uploads/annotations/trypB_testData_annotations_split_part1.tif', 'split parts under their display names', r.body.files && r.body.files[0].path);
  r = await api('PATCH', `/api/workspace/file/${raw.id}/rename`, { json: { newName: 'renamed.tif' } });
  assert(r.status === 200 && byId(raw.id).displayName === 'renamed.tif' && byId(raw.id).name === 'trypB_testData_training.tif', 'rename changes the display name only');
  r = await api('DELETE', `/api/workspace/file/${pth.id}`);
  assert(r.status === 200 && !byId(trainCfg.id) && !byId(trainRes.id) && !fs.existsSync(path.join(WS, trainCfg.path)), 'deleting the model removes config and results');
  r = await api('POST', '/api/workspace/files/batch-delete', { json: { fileIds: [junkId, dup.id] } });
  assert(r.status === 200 && !byId(junkId) && !byId(dup.id), 'batch delete');
  check('file operations');

  // ---- 14. backup and restore ---------------------------------------------------
  const before = files().length;
  const countersBefore = { ...manifest().counters };
  const zipRes = await fetch(BASE + '/api/workspace/download');
  const backup = path.join(os.tmpdir(), 'harness_backup.zip');
  fs.writeFileSync(backup, Buffer.from(await zipRes.arrayBuffer()));
  r = await upload(backup, 'backup.zip');
  assert(r.status === 200 && r.body.pendingRestore && r.body.pendingRestore.id, 'backup upload parked for confirmation', r.body.error);
  r = await api('POST', '/api/workspace/restore', { json: { pendingRestoreId: r.body.pendingRestore.id } });
  assert(r.status === 200 && r.body.fileCount === before, 'restore from the parked backup', `${r.body.fileCount} files`);
  assert(JSON.stringify(manifest().counters) === JSON.stringify(countersBefore), 'counters survive the round trip', JSON.stringify(manifest().counters));
  r = await api('POST', '/api/denoising/filter/process', { json: { inputPath: raw.path, method: 'nlm', parameters: { h: 5 } } });
  assert(r.status === 200 && byPath(/^results\/denoising\/filter2\//), 'next run continues the counter after restore');
  check('restore');

  // ---- 15. legacy workspace (pre-1.3.0 manifest) ------------------------------
  if (LEGACY_DIR && fs.existsSync(path.join(LEGACY_DIR, 'metadata.json'))) {
    const archiver = require('archiver');
    const legacyZip = path.join(os.tmpdir(), 'harness_legacy.zip');
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(legacyZip);
      const archive = archiver('zip', { zlib: { level: 1 } });
      out.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(out);
      archive.glob('**/*', { cwd: LEGACY_DIR, ignore: ['.*/**', '.*'] });
      archive.finalize();
    });
    r = await upload(legacyZip, 'legacy.zip');
    r = await api('POST', '/api/workspace/restore', { json: { pendingRestoreId: r.body.pendingRestore.id } });
    assert(r.status === 200, 'legacy backup restored', r.body.error);
    const m = manifest();
    assert(m.version === '1.3.0' && m.counters, 'legacy manifest migrated to 1.3.0', JSON.stringify(m.counters));
    const legacyAnn = m.files.find(f => f.lineage && f.lineage.processType === 'annotation' && !f.tags.includes('info') && !f.tags.includes('wip'));
    assert(!legacyAnn || legacyAnn.category === 'results', 'legacy created annotations are results now');
    assert(m.files.every(f => !f.lineage || !f.lineage.inputs.some(id => (m.files.find(g => g.id === id) || {}).category === 'models')), 'legacy model inputs moved to modelFileId');
    check('legacy restore');
    r = await api('POST', '/api/denoising/filter/process', { json: { inputPath: m.files.find(f => f.category === 'uploads' && f.tags.includes('raw')).path, method: 'gaussian', parameters: { sigma: 1 } } });
    assert(r.status === 200 && byPath(/^results\/denoising\/filter1\//), 'first run after a legacy restore is filter1');
    check('legacy + run');
  }

  console.log(failures ? `FAILED (${failures})` : 'ALL OK');
  server.close();
  io.close();
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('HARNESS ERROR', err);
  process.exit(2);
});
