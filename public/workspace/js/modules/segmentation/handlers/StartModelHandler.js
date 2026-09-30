/**
 * StartModelHandler.js - Starting point of a training run (ADR-017)
 *
 * Step 2 lets a run start from random weights (default), from a workspace
 * checkpoint (.pth, same architecture, trained further) or from a
 * bioimage.io model (a package in the workspace or a zoo model, written back
 * as a fine-tuned package). The server checks the parent against the
 * validated training pairs; this handler shows the result and locks what
 * the parent fixes: the architecture fields and the allowed patch sizes.
 */

import { FileSelector } from '/workspace/js/core/components/index.js';
import { icon } from '/workspace/js/core/icons.js';
import SegmentationAPI from '../SegmentationAPI.js';
import ZooModelList from './ZooModelList.js';

const FINETUNE_DEFAULTS = { learningRate: '0.0001', numEpochs: '30' };
const SCRATCH_DEFAULTS = { learningRate: '0.001', numEpochs: '100' };
const HEAD_TEXT = {
  softmax: 'softmax over classes',
  sigmoid_logits: 'one sigmoid channel',
  sigmoid_probs: 'one probability channel'
};

class StartModelHandler {
  /**
   * @param {SegmentationModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
    this.api = new SegmentationAPI();
    this.initialized = false;
    this.checkpointSelector = null;
    this.packageSelector = null;
    this.zooList = null;
    // Fields the user changed by hand (fine-tune defaults never overwrite them)
    this.edited = new Set();
  }

  /** Forget DOM state (the module rebuilds its DOM on every activate) */
  reset() {
    this.initialized = false;
    this.checkpointSelector = null;
    this.packageSelector = null;
    this.zooList = null;
    this.edited = new Set();
  }

  /** Build the Step 2 controls once the step is visible (idempotent) */
  initialize() {
    if (this.initialized) return;
    const group = document.getElementById('startModelGroup');
    if (!group) return;
    this.initialized = true;

    group.querySelectorAll('input[name="startModelKind"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) this.onKindChange(radio.value);
      });
    });
    for (const id of ['learningRate', 'numEpochs']) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this.edited.add(id));
    }

    const checkpointContainer = document.getElementById('startCheckpointSelector');
    if (checkpointContainer) {
      this.checkpointSelector = new FileSelector({
        id: 'start_checkpoint',
        fileType: 'models',
        filterTags: ['weights'],
        // Segmentation U-Nets and imported checkpoints of unspecified
        // method; DL denoising models are not starting points (ADR-018)
        filterFiles: (files) => files.filter(f => !(f.tags || []).includes('denoising')),
        title: 'Workspace model to continue from',
        icon: 'model',
        accept: '.pth',
        showUpload: false,
        stateManager: this.module.state,
        onSelect: (fileInfo) => this.onFileSelected('checkpoint', fileInfo)
      });
      checkpointContainer.innerHTML = this.checkpointSelector.render();
      this.checkpointSelector.init();
    }

    const packageContainer = document.getElementById('startPackageSelector');
    if (packageContainer) {
      this.packageSelector = new FileSelector({
        id: 'start_package',
        fileType: 'models',
        filterTags: ['bioimageio'],
        uploadCategory: 'imported_models',
        title: 'bioimage.io package in the workspace',
        icon: 'model',
        accept: '.zip',
        stateManager: this.module.state,
        onSelect: (fileInfo) => this.onFileSelected('package', fileInfo)
      });
      packageContainer.innerHTML = this.packageSelector.render();
      this.packageSelector.init();
    }

    // Zoo models that can be fine-tuned AND take the class count of the
    // validated pairs (a model whose manifest does not state its channels
    // stays listed; the server decides at selection)
    const numClasses = this.pairClasses();
    this.zooList = new ZooModelList({
      listId: 'startZooList',
      searchId: 'startZooSearch',
      filter: (m) => m.finetunable && (m.finetuneClasses == null || numClasses == null || m.finetuneClasses === numClasses),
      onSelect: (id) => this.onZooSelected(id),
      notify: (type, message, ms) => this.module.state?.notify(type, message, ms),
      emptyText: numClasses == null
        ? 'No zoo model with a fine-tunable head matches.'
        : `No zoo model matches: your pairs have ${numClasses} classes (background included), and the fine-tunable zoo models expect other class counts.`
    });
    this.zooList.init();
    this.zooList.load();
    const hint = document.getElementById('startZooHint');
    if (hint) {
      hint.textContent = numClasses == null
        ? 'Zoo models with a fine-tunable head.'
        : `Zoo models with a fine-tunable head that take ${numClasses} classes (background included), like your training pairs.`;
    }

    this.restoreUI();
  }

  /** Class count of the validated training pairs (background included), or null */
  pairClasses() {
    const n = this.module.trainingData?.num_classes;
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  /** Reflect the module's current selection (after a resume or a rebuild) */
  restoreUI() {
    const sm = this.module.startModel;
    const kind = !sm ? 'none' : (sm.kind === 'checkpoint' ? 'checkpoint' : 'bioimageio');
    const radio = document.querySelector(`input[name="startModelKind"][value="${kind}"]`);
    if (radio) radio.checked = true;
    this.showSlot(kind);
    if (sm && sm.kind === 'checkpoint' && this.checkpointSelector) {
      this.checkpointSelector.setSelectedFile?.({ id: sm.fileId, name: sm.displayName });
    } else if (sm && sm.kind === 'package' && this.packageSelector) {
      this.packageSelector.setSelectedFile?.({ id: sm.fileId, name: sm.displayName });
    } else if (sm && sm.kind === 'zoo' && this.zooList) {
      this.zooList.setSelected(sm.id);
    }
    this.renderStatus();
    this.applyConstraints();
  }

  showSlot(kind) {
    const checkpointSlot = document.getElementById('startCheckpointSlot');
    const packageSlot = document.getElementById('startPackageSlot');
    if (checkpointSlot) checkpointSlot.hidden = kind !== 'checkpoint';
    if (packageSlot) packageSlot.hidden = kind !== 'bioimageio';
  }

  async onKindChange(kind) {
    this.showSlot(kind);
    const sm = this.module.startModel;
    // Switching the kind drops a selection that no longer fits it
    if (kind === 'none' && sm) {
      await this.clear();
    } else if (kind === 'checkpoint' && sm && sm.kind !== 'checkpoint') {
      await this.clear();
    } else if (kind === 'bioimageio' && sm && sm.kind === 'checkpoint') {
      await this.clear();
    }
  }

  /**
   * Drop the starting point (session and UI)
   * @param {object} [opts]
   * @param {boolean} [opts.remote=true] - also clear it on the server
   */
  async clear({ remote = true } = {}) {
    this.module.startModel = null;
    if (remote) {
      try { await this.api.setStartModel({ kind: 'none' }); } catch (e) { /* session may be gone */ }
    }
    if (this.checkpointSelector) this.checkpointSelector.clearSelection?.();
    if (this.packageSelector) this.packageSelector.clearSelection?.();
    if (this.zooList) this.zooList.setSelected(null);
    this.renderStatus();
    this.applyConstraints();
    this.module.stateHandler.saveState();
  }

  async onFileSelected(kind, fileInfo) {
    if (!fileInfo) {
      const sm = this.module.startModel;
      if (sm && sm.kind === kind) await this.clear();
      return;
    }
    const payload = fileInfo.id
      ? { kind, fileId: fileInfo.id }
      : { kind, path: fileInfo.path || fileInfo.value };
    await this.choose(payload, fileInfo.name || fileInfo.id);
  }

  async onZooSelected(id) {
    await this.choose({ kind: 'zoo', id }, id);
  }

  async choose(payload, label) {
    this.renderStatus(null, `Checking ${label || 'the model'} against your training pairs...`);
    try {
      const result = await this.api.setStartModel(payload);
      this.module.startModel = result.startModel;
      // One selection at a time across the three pickers
      if (payload.kind === 'zoo') {
        this.packageSelector?.clearSelection?.();
        this.zooList?.setSelected(payload.id);
      } else if (payload.kind === 'package') {
        this.zooList?.setSelected(null);
      }
      this.renderStatus();
      this.applyConstraints();
      this.module.stateHandler.saveState();
      this.module.state?.notify('success', `Starting point: ${result.startModel.name || result.startModel.displayName}`);
    } catch (error) {
      console.error('[StartModelHandler] Starting point refused:', error);
      this.module.startModel = null;
      if (payload.kind === 'zoo') this.zooList?.setSelected(null);
      else if (payload.kind === 'package') this.packageSelector?.clearSelection?.();
      else this.checkpointSelector?.clearSelection?.();
      this.renderStatus(null, null, error.message);
      this.applyConstraints();
      this.module.stateHandler.saveState();
    }
  }

  renderStatus(unused = null, loadingText = null, error = null) {
    const slot = document.getElementById('startModelStatus');
    if (!slot) return;
    if (loadingText) {
      slot.hidden = false;
      slot.className = 'start-model-status';
      slot.innerHTML = `${icon('hourglass')} ${this.escape(loadingText)}`;
      return;
    }
    if (error) {
      slot.hidden = false;
      slot.className = 'start-model-status error';
      slot.innerHTML = `${icon('cross')} ${this.escape(error)}`;
      return;
    }
    const sm = this.module.startModel;
    if (!sm) {
      slot.hidden = true;
      slot.innerHTML = '';
      return;
    }
    const parts = [];
    if (sm.kind === 'checkpoint') {
      parts.push(`${sm.architecture.features} features, ${sm.architecture.num_layers} layers, ${sm.classes} classes`);
      if (sm.valDice != null) parts.push(`validation Dice ${Number(sm.valDice).toFixed(3)}`);
      parts.push('output: a new .pth model');
    } else {
      parts.push(`${HEAD_TEXT[sm.head] || sm.head}, ${sm.classes} classes`);
      parts.push(`patch size ${(sm.allowedPatchSizes || []).join(', ')}`);
      parts.push('output: a fine-tuned bioimage.io package');
    }
    const notes = (sm.notes || []).map(n => `<div class="bio-note">${this.escape(n)}</div>`).join('');
    slot.hidden = false;
    slot.className = 'start-model-status ok';
    slot.innerHTML = `${icon('check')} <strong>${this.escape(sm.name || sm.displayName)}</strong>: ${this.escape(parts.join('; '))}${notes}`;
  }

  /**
   * Lock what the parent fixes and apply the fine-tune defaults (rule F10).
   * Runs after the form validation is (re)attached, so it wins over the
   * controller's own option handling.
   */
  applyConstraints() {
    const sm = this.module.startModel;
    const features = document.getElementById('numFeatures');
    const layers = document.getElementById('numLayers');
    const note = document.getElementById('architectureNote');
    const group = document.getElementById('architectureGroup');

    if (sm && sm.kind === 'checkpoint') {
      if (features) { features.value = String(sm.architecture.features); features.disabled = true; }
      if (layers) { layers.value = String(sm.architecture.num_layers); layers.disabled = true; }
      if (note) { note.hidden = false; note.textContent = 'Fixed by the workspace model you continue from.'; }
    } else if (sm) {
      if (features) features.disabled = true;
      if (layers) layers.disabled = true;
      if (note) { note.hidden = false; note.textContent = 'Defined by the bioimage.io model; these fields do not apply.'; }
    } else {
      if (features) features.disabled = false;
      if (layers) layers.disabled = false;
      if (note) { note.hidden = true; note.textContent = ''; }
    }
    if (group) group.classList.toggle('locked', !!sm);

    // Patch sizes the parent's input rule accepts
    const patch = document.getElementById('patchSize');
    if (patch) {
      const allowed = sm && Array.isArray(sm.allowedPatchSizes) ? sm.allowedPatchSizes : null;
      let firstAllowed = null;
      for (const option of patch.options) {
        const val = parseInt(option.value, 10);
        const exceeds = (option.textContent || '').includes('(exceeds image)');
        const ok = !allowed || allowed.includes(val);
        option.disabled = exceeds || !ok;
        if (!option.disabled && firstAllowed == null) firstAllowed = option.value;
        const base = option.dataset.originalText || option.textContent;
        option.dataset.originalText = base;
        if (!exceeds) option.textContent = ok ? base : `${base} (not accepted by the model)`;
      }
      if (patch.selectedOptions[0]?.disabled && firstAllowed != null) {
        patch.value = firstAllowed;
      }
    }

    // Fine-tune defaults, unless the user edited the field
    const defaults = sm ? FINETUNE_DEFAULTS : SCRATCH_DEFAULTS;
    for (const [id, value] of Object.entries(defaults)) {
      const el = document.getElementById(id);
      if (el && !this.edited.has(id)) el.value = value;
    }

    this.module.formValidationController?.validateAll();
  }

  escape(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

export default StartModelHandler;
