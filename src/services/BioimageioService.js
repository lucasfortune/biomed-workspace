/**
 * BioimageioService - bioimage.io model zoo integration (ADR-015)
 *
 * - Lists zoo models from the hub (one request, cached for an hour, filtered
 *   to what the workspace can run: torch weights, one single-channel input,
 *   2 or 3 space axes, segmentation-like tags unless "all" is requested).
 * - Describes a model (zoo id or uploaded package) through
 *   python/bioimageio_utils.py.
 * - Writes the per-workspace model card that lineage points at.
 * - Exports workspace U-Net checkpoints as packages (ADR-016) through
 *   python/export_bioimageio.py, as polled jobs.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { createLineage } = require('../helpers/lineageHelpers');
const PACKAGE_VERSION = require('../../package.json').version;

const HUB_URL = 'https://hypha.aicell.io/bioimage-io/artifacts/bioimage.io/children'
  + '?filters=%7B%22type%22%3A%22model%22%7D&limit=1000';
const HUB_FILE_BASE = 'https://hypha.aicell.io/bioimage-io/artifacts';
const HUB_PAGE_BASE = 'https://bioimage.io/#/?id=';
const LIST_TTL_MS = 60 * 60 * 1000;
const RUNNABLE_WEIGHTS = ['torchscript', 'pytorch_state_dict'];
const EXCLUDED_TAGS = ['denoising', 'restoration', 'super-resolution', 'classification', 'in-silico-labeling'];
const EXPORT_LICENSES = ['CC-BY-4.0', 'MIT', 'BSD-3-Clause', 'CC0-1.0'];
const MAX_EXPORT_RECORDS = 100;

class BioimageioService {
  /**
   * @param {object} deps
   * @param {string} deps.pythonPath
   * @param {object} deps.workspaceManager
   * @param {object} deps.fileService
   * @param {object} [deps.logger]
   * @param {function} [deps.fetchImpl] - injectable fetch (tests)
   */
  constructor({ pythonPath, workspaceManager, fileService, logger, fetchImpl }) {
    this.pythonPath = pythonPath;
    this.workspaceManager = workspaceManager;
    this.fileService = fileService;
    this.logger = logger;
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.listCache = null; // { fetchedAt, items }
    this.exports = new Map(); // exportId -> job record (ADR-016)
  }

  // ---------------------------------------------------------------------------
  // Zoo listing
  // ---------------------------------------------------------------------------

  /**
   * Summarise one manifest input tensor: channels and number of space axes.
   * Handles format 0.4 (axes string + shape) and 0.5 (axes list).
   */
  static inputSummary(input) {
    if (!input) return null;
    const axes = input.axes;
    if (typeof axes === 'string') {
      const spaceDims = (axes.match(/[xyz]/g) || []).length;
      const cIdx = axes.indexOf('c');
      let channels = 1;
      if (cIdx >= 0) {
        const shape = input.shape;
        if (Array.isArray(shape)) channels = shape[cIdx];
        else if (shape && Array.isArray(shape.min)) channels = shape.min[cIdx];
        else channels = null;
      }
      return { channels, spaceDims };
    }
    if (Array.isArray(axes)) {
      let channels = 1;
      let spaceDims = 0;
      for (const a of axes) {
        if (!a || typeof a !== 'object') continue;
        if (a.type === 'channel') {
          if (Array.isArray(a.channel_names)) channels = a.channel_names.length;
          else if (typeof a.size === 'number') channels = a.size;
          else channels = null;
        } else if (a.type === 'space') {
          spaceDims += 1;
        }
      }
      return { channels, spaceDims };
    }
    return null;
  }

  /**
   * A file reference in a manifest is either a plain path/URL string or,
   * since spec 0.5.12, an object { source, sha256 }. Returns the string
   * form or null.
   */
  static fileRef(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && typeof value.source === 'string') return value.source;
    return null;
  }

  /**
   * Where the pytorch_state_dict architecture code comes from: a file in
   * the model package (URL) or an importable library module. Null when the
   * model has no state dict or the form is unknown.
   */
  static architectureSource(artifact, id) {
    const m = artifact.manifest || {};
    const w = (m.weights || {}).pytorch_state_dict;
    if (!w) return null;
    const arch = w.architecture;
    let source = null;
    let importFrom = null;
    if (typeof arch === 'string') {
      source = arch.split(':')[0];                       // format 0.4: "unet.py:UNet2d"
    } else if (arch && typeof arch === 'object') {
      if (arch.import_from) importFrom = String(arch.import_from);
      else if (arch.source) source = BioimageioService.fileRef(arch.source);
    }
    if (importFrom) return { import_from: importFrom };
    if (!source) return null;
    const url = /^https?:\/\//.test(source) ? source : `${HUB_FILE_BASE}/${id}/files/${source}`;
    return { source_url: url };
  }

  /**
   * Map a hub artifact to the picker entry, or null when the workspace
   * cannot run it (hard requirements, independent of the tag filter).
   */
  static toEntry(artifact) {
    const m = artifact && artifact.manifest;
    if (!m || m.type !== 'model') return null;
    if (m.status && m.status !== 'published') return null;
    const weights = Object.keys(m.weights || {});
    if (!weights.some(w => RUNNABLE_WEIGHTS.includes(w))) return null;
    const inputs = Array.isArray(m.inputs) ? m.inputs : [];
    if (inputs.length !== 1) return null;
    const inp = BioimageioService.inputSummary(inputs[0]);
    if (!inp || inp.channels !== 1 || (inp.spaceDims !== 2 && inp.spaceDims !== 3)) return null;

    const id = artifact.alias || m.id;
    if (!id) return null;
    const cover = Array.isArray(m.covers) && m.covers.length ? BioimageioService.fileRef(m.covers[0]) : null;
    const coverUrl = cover
      ? (/^https?:\/\//.test(cover) ? cover : `${HUB_FILE_BASE}/${id}/files/${cover}`)
      : null;
    const tags = Array.isArray(m.tags) ? m.tags.map(String) : [];
    return {
      id,
      name: m.name || id,
      description: m.description || '',
      tags,
      license: m.license || null,
      version: m.version != null ? String(m.version) : null,
      emoji: m.id_emoji || null,
      dims: inp.spaceDims,
      weights: weights.filter(w => RUNNABLE_WEIGHTS.includes(w)),
      cover: coverUrl,
      page: `${HUB_PAGE_BASE}${id}`,
      finetunable: BioimageioService.finetuneFacts(artifact).candidate,
      finetuneClasses: BioimageioService.finetuneFacts(artifact).classes,
      // set by checkArchitectures for state-dict-only models
      missing: [],
      architecture: weights.includes('torchscript') ? null : BioimageioService.architectureSource(artifact, id)
    };
  }

  /**
   * Run `bioimageio_utils.py check-imports` for the entries that can only
   * run from a pytorch_state_dict, and record the packages their
   * architecture code needs but the server lacks. Cached on disk by the
   * Python side, so only new models cost a download.
   */
  checkArchitectures(items) {
    const candidates = items
      .filter(e => e.architecture)
      .map(e => ({ id: e.id, ...e.architecture }));
    if (candidates.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const tmp = path.join(os.tmpdir(), `bioimageio_check_${process.pid}_${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(candidates));
      const proc = spawn(this.pythonPath, ['python/bioimageio_utils.py', 'check-imports', '--input', tmp]);
      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', () => {});
      const finish = () => {
        fs.unlink(tmp, () => {});
        const line = stdout.split('\n').find(l => l.startsWith('BIOIMAGEIO_RESULT:'));
        if (line) {
          try {
            const parsed = JSON.parse(line.substring('BIOIMAGEIO_RESULT:'.length));
            const results = (parsed && parsed.results) || {};
            for (const e of items) {
              const r = results[e.id];
              if (r && Array.isArray(r.missing)) e.missing = r.missing;
            }
          } catch (err) {
            if (this.logger) this.logger.warn(`[bioimageio] Architecture check unreadable: ${err.message}`);
          }
        } else if (this.logger) {
          this.logger.warn('[bioimageio] Architecture check produced no result; listing state-dict models unchecked');
        }
        resolve();
      };
      proc.on('error', finish);
      proc.on('close', finish);
    });
  }

  /**
   * Output channel count of a manifest's first output, or null when the
   * manifest does not say. Format 0.5 lists axes; format 0.4 gives an axes
   * string with either a shape list or a reference shape
   * ({reference_tensor, scale, offset}: size = input * scale + 2 * offset).
   */
  static outputChannels(manifest) {
    const out = (manifest.outputs || [])[0];
    if (!out) return null;
    const direct = BioimageioService.inputSummary(out);
    if (direct && direct.channels != null) return direct.channels;
    const axes = out.axes;
    if (typeof axes !== 'string') return null;
    const cIdx = axes.indexOf('c');
    if (cIdx < 0) return 1;
    const shape = out.shape;
    if (shape && Array.isArray(shape.scale) && Array.isArray(shape.offset)) {
      const inp = BioimageioService.inputSummary((manifest.inputs || [])[0]);
      const inChannels = inp && inp.channels != null ? inp.channels : 1;
      const value = inChannels * shape.scale[cIdx] + 2 * shape.offset[cIdx];
      return Number.isInteger(value) && value > 0 ? value : null;
    }
    return null;
  }

  /**
   * Fine-tuning facts of a manifest (ADR-017, rule F12): whether the model
   * is a candidate and how many annotation classes it needs. A candidate
   * needs pytorch_state_dict weights, a 2D input and an output head that
   * is a softmax over channels (classes = channels), a single sigmoid
   * channel or a single channel without a declared activation (classes =
   * 2). Unknown channel counts stay candidates with classes null; the
   * definitive check is the Python `describe` at selection time.
   * @returns {{candidate: boolean, classes: number|null}}
   */
  static finetuneFacts(artifact) {
    const m = artifact && artifact.manifest;
    const no = { candidate: false, classes: null };
    if (!m || !(m.weights || {}).pytorch_state_dict) return no;
    const inp = BioimageioService.inputSummary((m.inputs || [])[0]);
    if (!inp || inp.spaceDims !== 2) return no;
    const out = (m.outputs || [])[0];
    if (!out) return no;
    const channels = BioimageioService.outputChannels(m);
    const post = (out.postprocessing || []).map(p => p && (p.id || p.name)).filter(Boolean);
    if (channels == null) return { candidate: true, classes: null };
    if (channels >= 2) return post.includes('softmax') ? { candidate: true, classes: channels } : no;
    return { candidate: true, classes: 2 };
  }

  static isFinetuneCandidate(artifact) {
    return BioimageioService.finetuneFacts(artifact).candidate;
  }

  static isSegmentationLike(entry) {
    const lower = entry.tags.map(t => t.toLowerCase());
    return !lower.some(t => EXCLUDED_TAGS.includes(t));
  }

  async fetchHub() {
    const response = await this.fetchImpl(HUB_URL, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`bioimage.io hub responded with ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('bioimage.io hub returned an unexpected payload');
    }
    return data;
  }

  /**
   * List runnable zoo models.
   * @param {object} [opts]
   * @param {boolean} [opts.all=false] - lift the segmentation-like tag filter
   * @returns {Promise<{models: Array, fetchedAt: string, stale: boolean}>}
   */
  async listModels({ all = false } = {}) {
    const now = Date.now();
    let stale = false;
    if (!this.listCache || now - this.listCache.fetchedAt > LIST_TTL_MS) {
      try {
        const artifacts = await this.fetchHub();
        const items = artifacts.map(BioimageioService.toEntry).filter(Boolean);
        items.sort((a, b) => a.name.localeCompare(b.name));
        await this.checkArchitectures(items);
        this.listCache = { fetchedAt: now, items };
        const hidden = items.filter(e => e.missing.length).length;
        if (this.logger) this.logger.info(`[bioimageio] Hub list refreshed: ${items.length - hidden} runnable models (${hidden} need packages not installed)`);
      } catch (error) {
        if (!this.listCache) throw error;
        stale = true;
        if (this.logger) this.logger.warn(`[bioimageio] Hub refresh failed, serving cached list: ${error.message}`);
      }
    }
    // Models whose architecture code needs packages this server lacks are
    // never listed (they cannot run); the count is reported for the UI
    const runnable = this.listCache.items.filter(e => e.missing.length === 0);
    const hidden = this.listCache.items.length - runnable.length;
    const items = (all ? runnable : runnable.filter(BioimageioService.isSegmentationLike))
      .map(({ architecture, missing, ...rest }) => rest);
    return { models: items, hidden, fetchedAt: new Date(this.listCache.fetchedAt).toISOString(), stale };
  }

  // ---------------------------------------------------------------------------
  // Describe
  // ---------------------------------------------------------------------------

  /**
   * Run `bioimageio_utils.py describe` and return its summary.
   * @param {string} source - zoo id or absolute package path
   * @returns {Promise<{success: boolean, summary?: object, error?: string}>}
   */
  describe(source) {
    return this.runUtils(['describe', '--source', source]);
  }

  /**
   * Model config, validation Dice and allowed patch sizes of a workspace
   * checkpoint (ADR-017): `bioimageio_utils.py describe-checkpoint`.
   * @param {string} modelPath - absolute .pth path
   * @returns {Promise<{success: boolean, checkpoint?: object, error?: string}>}
   */
  describeCheckpoint(modelPath) {
    return this.runUtils(['describe-checkpoint', '--model', modelPath]);
  }

  runUtils(args) {
    return new Promise((resolve) => {
      const proc = spawn(this.pythonPath, ['python/bioimageio_utils.py', ...args]);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', (err) => resolve({ success: false, error: `Failed to start Python: ${err.message}` }));
      proc.on('close', () => {
        const line = stdout.split('\n').find(l => l.startsWith('BIOIMAGEIO_RESULT:'));
        if (line) {
          try {
            return resolve(JSON.parse(line.substring('BIOIMAGEIO_RESULT:'.length)));
          } catch (e) { /* fall through */ }
        }
        const tail = stderr.trim().split('\n').slice(-3).join(' ').trim();
        resolve({ success: false, error: tail || 'Model description failed without output' });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Model card (R7)
  // ---------------------------------------------------------------------------

  static safeName(id) {
    return String(id).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'model';
  }

  /**
   * Write `models/bioimageio/zoo/<id>/<id>_card.json` into the workspace and
   * track it (models + bioimageio + card, lineage bioimageio-import).
   * Re-selecting the same model reuses the existing card (also one written
   * by an older version under models/bioimageio/<id>/model_card.json).
   * @returns {Promise<{cardPath: string, fileId: string|null}>}
   */
  async writeModelCard(sessionId, zooId, summary) {
    const workspacePath = this.workspaceManager.getWorkspacePath(sessionId);
    const safeId = BioimageioService.safeName(zooId);
    const dir = path.join(workspacePath, 'models', 'bioimageio', 'zoo', safeId);
    const cardName = `${safeId}_card.json`;
    const cardPath = path.join(dir, cardName);
    const relPath = path.relative(workspacePath, cardPath);

    const legacyRel = path.join('models', 'bioimageio', safeId, 'model_card.json');
    for (const rel of [relPath, legacyRel]) {
      const existingId = this.workspaceManager.getFileIdByPath(sessionId, rel);
      if (existingId && fs.existsSync(path.join(workspacePath, rel))) {
        return { cardPath: path.join(workspacePath, rel), fileId: existingId };
      }
    }

    fs.mkdirSync(dir, { recursive: true });
    const card = {
      type: 'bioimageio-model-card',
      zoo_id: zooId,
      id: summary.id,
      name: summary.name,
      version: summary.version,
      source: summary.source,
      description: summary.description,
      license: summary.license,
      cite: summary.cite,
      weight_format: summary.weight_format,
      dims: summary.dims,
      output_channels: summary.output && summary.output.channels,
      page: `${HUB_PAGE_BASE}${zooId}`,
      selected_at: new Date().toISOString()
    };
    fs.writeFileSync(cardPath, JSON.stringify(card, null, 2));

    let fileId = null;
    if (this.fileService) {
      const entry = await this.fileService.trackModuleOutput(sessionId, cardPath, 'models', {
        tags: ['bioimageio', 'card'],
        displayName: cardName,
        // A card is written by the workspace, never uploaded: it carries a
        // lineage record with no data inputs and the zoo id as process id
        lineage: {
          processType: 'bioimageio-import',
          processedAt: new Date().toISOString(),
          inputs: [],
          processId: zooId
        }
      });
      fileId = entry ? entry.id : null;
    }
    return { cardPath, fileId };
  }

  // ---------------------------------------------------------------------------
  // Export of workspace U-Nets as packages (ADR-016)
  // ---------------------------------------------------------------------------

  static get EXPORT_LICENSES() {
    return EXPORT_LICENSES.slice();
  }

  static slugify(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
      || 'workspace-unet';
  }

  /**
   * Start an export job (returns immediately; poll exportStatus()).
   * @param {object} job
   * @param {string} job.sessionId
   * @param {object} job.modelFile   workspace file entry of the .pth
   * @param {string} job.samplePath  absolute path of the sample TIFF
   * @param {string} [job.sampleFileId]
   * @param {string} [job.sampleName]
   * @param {string} job.name        package name
   * @param {string} job.license
   * @param {string} [job.author]
   * @param {string} [job.trainingId]
   * @returns {string} exportId
   */
  startExport(job) {
    const exportId = crypto.randomUUID();
    const workspacePath = this.workspaceManager.getWorkspacePath(job.sessionId);
    const modelPath = path.resolve(workspacePath, job.modelFile.path);
    // Run folder models/bioimageio/export<n>/ (ADR-018); the zip is renamed
    // onto its display name (<package name>.zip) once written
    let outDir;
    try {
      outDir = this.workspaceManager.allocateRun(job.sessionId, 'export', ['models/bioimageio']).dirs['models/bioimageio'];
    } catch (err) {
      outDir = path.join(workspacePath, 'models', 'bioimageio', `export_${Date.now()}`);
    }
    const record = {
      id: exportId,
      sessionId: job.sessionId,
      status: 'running',
      stage: 'starting',
      name: job.name,
      modelFileId: job.modelFile.id,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null
    };
    this.exports.set(exportId, record);
    this.pruneExports();

    const finish = (error, result) => {
      record.finishedAt = new Date().toISOString();
      if (error) {
        record.status = 'failed';
        record.error = error;
        fs.rmSync(outDir, { recursive: true, force: true });
        if (this.logger) this.logger.error(`[bioimageio] Export ${exportId} failed: ${error}`);
      } else {
        record.status = 'done';
        record.result = result;
        if (this.logger) this.logger.info(`[bioimageio] Export ${exportId} done: ${result.relPath}`);
      }
    };

    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch (err) {
      finish(`Could not create the export directory: ${err.message}`);
      return exportId;
    }
    if (this.logger) this.logger.debug(`[bioimageio] Export ${exportId} writes to ${outDir}`);

    const meta = {
      training_id: job.trainingId || null,
      workspace_version: PACKAGE_VERSION,
      model_file: job.modelFile.displayName || job.modelFile.name
    };
    const args = [
      'python/export_bioimageio.py',
      '--model', modelPath,
      '--sample', job.samplePath,
      '--output_dir', outDir,
      '--name', job.name,
      '--license', job.license,
      '--author', job.author || '',
      '--meta', JSON.stringify(meta),
      '--sample_name', job.sampleName || ''
    ];

    let proc;
    try {
      proc = spawn(this.pythonPath, args);
    } catch (err) {
      finish(`Failed to start Python: ${err.message}`);
      return exportId;
    }

    let stdout = '';
    let stderr = '';
    let pending = '';
    proc.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      pending += text;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (line.startsWith('BIOIMAGEIO_PROGRESS:')) {
          try {
            record.stage = JSON.parse(line.substring('BIOIMAGEIO_PROGRESS:'.length)).stage || record.stage;
          } catch (e) { /* ignore malformed progress */ }
        }
      }
    });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => finish(`Failed to start Python: ${err.message}`));
    proc.on('close', async (code) => {
      const lines = stdout.split('\n');
      const resultLine = lines.find(l => l.startsWith('BIOIMAGEIO_RESULT:'));
      let result = null;
      if (resultLine) {
        try { result = JSON.parse(resultLine.substring('BIOIMAGEIO_RESULT:'.length)); } catch (e) { result = null; }
      }
      if (!result || !result.zip_path) {
        const errLine = lines.find(l => l.startsWith('BIOIMAGEIO_ERROR:'));
        let message = null;
        if (errLine) {
          try { message = JSON.parse(errLine.substring('BIOIMAGEIO_ERROR:'.length)).message; } catch (e) { message = null; }
        }
        if (!message) {
          const tail = stderr.trim().split('\n').filter(l => l && !/warn/i.test(l)).slice(-2).join(' ').trim();
          message = tail || `Export failed without output (exit code ${code})`;
        }
        return finish(message);
      }

      try {
        // Data inputs only (the sample image); the exported model is the
        // record's modelFileId (ADR-012/018)
        const lineage = job.sampleFileId
          ? createLineage('bioimageio-export', [job.sampleFileId], exportId)
          : { processType: 'bioimageio-export', processedAt: new Date().toISOString(), inputs: [], processId: exportId };
        lineage.modelFileId = job.modelFile.id;
        let entry = null;
        if (this.fileService) {
          entry = await this.fileService.trackModuleOutput(job.sessionId, result.zip_path, 'models', {
            tags: ['bioimageio', 'weights', 'segmentation'],
            displayName: `${job.name}.zip`,
            lineage,
            adoptName: true
          });
          if (entry && entry.absolutePath) result.zip_path = entry.absolutePath;
        }
        finish(null, {
          ...result,
          fileId: entry ? entry.id : null,
          fileName: entry ? (entry.displayName || entry.name) : path.basename(result.zip_path),
          relPath: path.relative(workspacePath, result.zip_path)
        });
      } catch (err) {
        finish(`Package written but could not be added to the workspace: ${err.message}`);
      }
    });

    return exportId;
  }

  /**
   * Public view of an export job, or null when unknown or owned by another session.
   */
  exportStatus(exportId, sessionId) {
    const record = this.exports.get(exportId);
    if (!record || record.sessionId !== sessionId) return null;
    const { sessionId: _owner, ...view } = record;
    return view;
  }

  pruneExports() {
    if (this.exports.size <= MAX_EXPORT_RECORDS) return;
    const finished = [...this.exports.values()].filter(r => r.status !== 'running')
      .sort((a, b) => (a.finishedAt || '').localeCompare(b.finishedAt || ''));
    for (const r of finished) {
      if (this.exports.size <= MAX_EXPORT_RECORDS) break;
      this.exports.delete(r.id);
    }
  }
}

module.exports = BioimageioService;
