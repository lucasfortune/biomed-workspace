/**
 * BioimageioService - bioimage.io model zoo integration (ADR-015)
 *
 * - Lists zoo models from the hub (one request, cached for an hour, filtered
 *   to what the workspace can run: torch weights, one single-channel input,
 *   2 or 3 space axes, segmentation-like tags unless "all" is requested).
 * - Describes a model (zoo id or uploaded package) through
 *   python/bioimageio_utils.py.
 * - Writes the per-workspace model card that lineage points at.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const HUB_URL = 'https://hypha.aicell.io/bioimage-io/artifacts/bioimage.io/children'
  + '?filters=%7B%22type%22%3A%22model%22%7D&limit=1000';
const HUB_FILE_BASE = 'https://hypha.aicell.io/bioimage-io/artifacts';
const HUB_PAGE_BASE = 'https://bioimage.io/#/?id=';
const LIST_TTL_MS = 60 * 60 * 1000;
const RUNNABLE_WEIGHTS = ['torchscript', 'pytorch_state_dict'];
const EXCLUDED_TAGS = ['denoising', 'restoration', 'super-resolution', 'classification', 'in-silico-labeling'];

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
      else if (arch.source) source = String(arch.source);
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
    const cover = Array.isArray(m.covers) && m.covers.length ? String(m.covers[0]) : null;
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
    return new Promise((resolve) => {
      const proc = spawn(this.pythonPath, ['python/bioimageio_utils.py', 'describe', '--source', source]);
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
   * Write `models/bioimageio/<id>/model_card.json` into the workspace and
   * track it (models + bioimageio + info). Re-selecting the same model
   * reuses the existing card.
   * @returns {Promise<{cardPath: string, fileId: string|null}>}
   */
  async writeModelCard(sessionId, zooId, summary) {
    const workspacePath = this.workspaceManager.getWorkspacePath(sessionId);
    const dir = path.join(workspacePath, 'models', 'bioimageio', BioimageioService.safeName(zooId));
    const cardPath = path.join(dir, 'model_card.json');
    const relPath = path.relative(workspacePath, cardPath);

    const existingId = this.workspaceManager.getFileIdByPath(sessionId, relPath);
    if (existingId && fs.existsSync(cardPath)) {
      return { cardPath, fileId: existingId };
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
        tags: ['bioimageio', 'info'],
        displayName: `${BioimageioService.safeName(zooId)}_card.json`
      });
      fileId = entry ? entry.id : null;
    }
    return { cardPath, fileId };
  }
}

module.exports = BioimageioService;
