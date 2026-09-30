/**
 * BioimageioHandler.js - bioimage.io model zoo for the Segmentation module (ADR-015)
 *
 * Step 1: zoo picker (searchable list from /api/bioimageio/models) plus a
 * FileSelector for uploaded packages; selecting either registers the model
 * in the session and shows a model card.
 * Step 4: output conversion controls (rule + threshold) for the run.
 */

import { FileSelector } from '/workspace/js/core/components/index.js';
import { icon } from '/workspace/js/core/icons.js';
import Templates from '../templates/Templates.js';
import SegmentationAPI from '../SegmentationAPI.js';
import ZooModelList from './ZooModelList.js';

class BioimageioHandler {
  /**
   * @param {SegmentationModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
    this.api = new SegmentationAPI();
    this.initialized = false;
    this.packageSelector = null;
    this.zooList = null;
  }

  /** Forget DOM state (the module rebuilds its DOM on every activate) */
  reset() {
    this.initialized = false;
    this.packageSelector = null;
    this.zooList = null;
  }

  // ---------------------------------------------------------------------------
  // Step 1
  // ---------------------------------------------------------------------------

  async initialize() {
    const content = document.getElementById('bioimageioContent');
    if (!content) return;
    if (this.initialized) return;
    this.initialized = true;

    content.innerHTML = `
      <div class="section-card-inner">
        <div class="bio-toolbar">
          <input type="search" class="bio-search" id="bioSearch" placeholder="Search the model zoo (name, tag, description)">
          <label class="bio-show-all" title="Also list models whose tags do not look like segmentation">
            <input type="checkbox" id="bioShowAll"> Show all runnable models
          </label>
        </div>
        <ul class="bio-model-list" id="bioModelList">
          <li class="bio-model-row empty">Loading the model zoo...</li>
        </ul>
        <div id="bioPackageSelector"></div>
        <div id="bioModelCard"></div>
      </div>
    `;

    this.zooList = new ZooModelList({
      listId: 'bioModelList',
      searchId: 'bioSearch',
      showAllId: 'bioShowAll',
      onSelect: (id) => this.selectZoo(id),
      notify: (type, message, ms) => this.module.state?.notify(type, message, ms)
    });
    this.zooList.init();

    const selectorContainer = document.getElementById('bioPackageSelector');
    if (selectorContainer) {
      this.packageSelector = new FileSelector({
        id: 'bio_package',
        fileType: 'models',
        filterTags: ['bioimageio'],
        uploadCategory: 'imported_models',
        title: 'Or use an uploaded bioimage.io package',
        icon: 'model',
        helpIconHtml: Templates.renderHelpIcon('segmentation.step1.bioimageio-package'),
        accept: '.zip',
        stateManager: this.module.state,
        onSelect: (fileInfo) => this.onPackageSelected(fileInfo)
      });
      selectorContainer.innerHTML = this.packageSelector.render();
      this.packageSelector.init();
    }

    // A selection restored from state renders its card right away
    if (this.module.bioimageioModel) {
      this.renderCard(this.module.bioimageioModel.summary);
      const source = this.module.bioimageioModel.source;
      if (source && source.type === 'upload' && this.packageSelector) {
        this.packageSelector.setSelectedFile?.({ id: source.fileId, path: source.path, name: source.name });
      }
    }

    this.syncListSelection();
    await this.zooList.load();
  }

  /** Highlight the selected zoo model in the list (if any) */
  syncListSelection() {
    if (!this.zooList) return;
    const selectedId = this.module.bioimageioModel?.source?.type === 'zoo'
      ? this.module.bioimageioModel.source.id : null;
    this.zooList.setSelected(selectedId);
  }

  async selectZoo(id) {
    this.renderCard(null, null, `Loading ${id}...`);
    try {
      const result = await this.api.selectBioimageioModel({ type: 'zoo', id });
      if (this.packageSelector) this.packageSelector.clearSelection?.();
      this.applySelection(result);
    } catch (error) {
      console.error('[BioimageioHandler] Zoo selection failed:', error);
      this.applyFailure(error.message);
    }
  }

  async onPackageSelected(fileInfo) {
    if (!fileInfo) {
      if (this.module.bioimageioModel?.source?.type === 'upload') {
        await this.clearSelection();
      }
      return;
    }
    this.renderCard(null, null, `Loading ${fileInfo.name || 'package'}...`);
    try {
      const source = fileInfo.id
        ? { type: 'upload', fileId: fileInfo.id }
        : { type: 'upload', path: fileInfo.path || fileInfo.value };
      const result = await this.api.selectBioimageioModel(source);
      this.applySelection(result);
    } catch (error) {
      console.error('[BioimageioHandler] Package selection failed:', error);
      this.applyFailure(error.message);
    }
  }

  applySelection(result) {
    this.module.bioimageioModel = {
      summary: result.summary,
      source: result.source,
      modelFileId: result.modelFileId || null
    };
    this.renderCard(result.summary);
    this.syncListSelection();
    this.module.updateStep1NextButton();
    this.module.stateHandler.saveState();
    if (this.module.state) {
      this.module.state.notify('success', `Model ready: ${result.summary.name}`);
    }
  }

  applyFailure(message) {
    this.module.bioimageioModel = null;
    this.renderCard(null, message);
    this.syncListSelection();
    this.module.updateStep1NextButton();
    this.module.stateHandler.saveState();
  }

  /**
   * Drop the session's selection (called on reset and when the package is deselected)
   * @param {object} [opts]
   * @param {boolean} [opts.remote=true] - also clear it on the server
   */
  async clearSelection({ remote = true } = {}) {
    this.module.bioimageioModel = null;
    this.renderCard(null);
    this.syncListSelection();
    this.module.updateStep1NextButton();
    if (remote) {
      try { await this.api.clearBioimageioModel(); } catch (e) { /* session may be gone */ }
    }
  }

  renderCard(summary, error = null, loadingText = null) {
    const slot = document.getElementById('bioModelCard');
    if (!slot) return;
    if (loadingText) {
      slot.innerHTML = `<div class="bio-card"><p>${icon('hourglass')} ${this.escape(loadingText)}</p></div>`;
      return;
    }
    if (error) {
      slot.innerHTML = `<div class="bio-card bio-card-error"><h5>${icon('cross')} Model not usable</h5><p>${this.escape(error)}</p></div>`;
      return;
    }
    if (!summary) {
      slot.innerHTML = '';
      return;
    }
    const space = Object.entries(summary.input.space || {}).map(([axis, s]) => {
      if (s.kind === 'fixed') return `${axis}: ${s.size} (tiled)`;
      if (s.kind === 'parameterized') return `${axis}: ${s.min} + n×${s.step}`;
      return `${axis}: any`;
    }).join(', ');
    const channels = summary.output.channels;
    const conversion = summary.default_conversion === 'argmax'
      ? 'argmax over channels'
      : (channels > 1 ? 'one class per channel (threshold)' : 'threshold');
    const zooId = summary.source && !summary.source.includes('/') && !summary.source.endsWith('.zip')
      ? summary.source : null;
    const link = zooId
      ? `<a href="https://bioimage.io/#/?id=${encodeURIComponent(zooId)}" target="_blank" rel="noopener">bioimage.io page</a>`
      : 'uploaded package';
    const notes = (summary.notes || []).map(n => `<div class="bio-note">${this.escape(n)}</div>`).join('');
    const cite = (summary.cite || []).slice(0, 2).map(c => this.escape(c.text) + (c.doi ? ` (doi:${this.escape(c.doi)})` : '')).join('; ');
    slot.innerHTML = `
      <div class="bio-card">
        <h5>${icon('check')} ${this.escape(summary.name)}</h5>
        <p>${this.escape(summary.description || '')}</p>
        <dl>
          <dt>Input</dt><dd>${summary.dims}D, one channel; ${this.escape(space)}</dd>
          <dt>Output</dt><dd>${channels} channel${channels === 1 ? '' : 's'}, default conversion: ${conversion}</dd>
          <dt>Weights</dt><dd>${this.escape(summary.weight_format)}</dd>
          <dt>License</dt><dd>${this.escape(summary.license || 'not stated')}, ${link}</dd>
          ${cite ? `<dt>Cite</dt><dd>${cite}</dd>` : ''}
        </dl>
        ${notes}
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Step 4
  // ---------------------------------------------------------------------------

  /** Show or hide the conversion block for the current selection */
  renderConversionControls() {
    const block = document.getElementById('bioimageioConversion');
    if (!block) return;
    const model = this.module.bioimageioModel;
    if (!model) {
      block.style.display = 'none';
      return;
    }
    const summary = model.summary;
    block.style.display = 'block';
    const line = document.getElementById('bioimageioConversionModel');
    if (line) {
      line.textContent = `${summary.name}: ${summary.output.channels} output channel${summary.output.channels === 1 ? '' : 's'}`;
    }
    // Controls that do not apply are greyed out with the correct value
    // selected, never hidden, so the block always looks the same
    const rules = document.getElementById('bioimageioConversionRules');
    const radios = block.querySelectorAll('input[name="bioConversion"]');
    const multi = summary.output.channels > 1;
    if (rules) rules.classList.toggle('disabled', !multi);
    radios.forEach(r => {
      r.checked = (r.value === (multi ? summary.default_conversion : 'per_channel'));
      r.disabled = !multi;
      r.onchange = () => this.syncThresholdState();
    });
    this.syncThresholdState();
  }

  syncThresholdState() {
    const rule = this.getConversionParams().conversion;
    const row = document.getElementById('bioimageioThresholdRow');
    const input = document.getElementById('bioThreshold');
    const off = rule === 'argmax';
    if (row) row.classList.toggle('disabled', off);
    if (input) input.disabled = off;
  }

  /** @returns {{conversion: string, threshold: number}} */
  getConversionParams() {
    const checked = document.querySelector('input[name="bioConversion"]:checked');
    const summary = this.module.bioimageioModel?.summary;
    const multi = summary ? summary.output.channels > 1 : false;
    const conversion = multi ? (checked ? checked.value : (summary?.default_conversion || 'per_channel')) : 'per_channel';
    const input = document.getElementById('bioThreshold');
    let threshold = input ? parseFloat(input.value) : 0.5;
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) threshold = 0.5;
    return { conversion, threshold };
  }

  escape(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

export default BioimageioHandler;
