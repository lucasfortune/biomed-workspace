/**
 * SegcleanupModule - Segmentation Cleanup & Quantification (ADR-009)
 *
 * Three workflows on segmentation stacks, chosen in step 1:
 *  - Automated cleanup: merge/relabel classes, fill holes, remove small
 *    components, smooth boundaries - with a live per-slice preview.
 *    Applying runs the full volume and quantifies the result.
 *  - Manual touch-up: paint corrections with brush / eraser / flood
 *    fill, reusing the annotation module's painting stack
 *    (AnnotationCanvas + BrushEngine + HistoryManager). Only edited
 *    slices are uploaded on save.
 *  - Quantify: metrics only, no changes.
 *
 * Quantification: per-class voxel counts, physical volumes (when the
 * file carries a voxel size, ADR-008), component counts and sizes,
 * surface areas. "Save report" registers the CSVs in the file browser.
 *
 * All outputs are new tracked files with lineage; inputs are never
 * modified.
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector } from '/workspace/js/core/components/index.js';
import AnnotationCanvas from '/workspace/js/modules/annotation/utils/AnnotationCanvas.js';
import BrushEngine from '/workspace/js/modules/annotation/utils/BrushEngine.js';
import HistoryManager from '/workspace/js/modules/annotation/utils/HistoryManager.js';

class SegcleanupModule extends BaseModule {

  constructor(stateManager) {
    super(stateManager, {
      id: 'segcleanup',
      name: 'Segmentation Cleanup',
      cssPath: '/workspace/js/modules/segcleanup/css/segcleanup.css',
      steps: [
        { id: 'select', name: 'Select' },
        { id: 'edit', name: 'Edit' },
        { id: 'result', name: 'Result & Report' }
      ]
    });

    this.stepNavigator = null;
    this.fileSelector = null;
    this.resetState();
  }

  resetState() {
    this.workflow = 'auto';   // 'auto' | 'manual' | 'quantify'

    // {path, name, id, slices, width, height, dtype, classes, voxelSize}
    this.file = null;
    this.underlay = null;     // {id, path, name} grayscale origin via lineage
    this.currentSlice = 0;

    // Automated-cleanup ops
    this.ops = {
      mergeMap: {},           // {classValue: targetValue} (0 = remove)
      fillHoles: 'off',       // 'off' | '2d' | '3d'
      minSize: 0,
      smoothRadius: 0
    };
    this.showUnderlay = true;

    // Manual touch-up state
    this.canvas = null;       // AnnotationCanvas
    this.brushEngine = null;
    this.historyManager = null;
    this.tool = 'brush';      // 'brush' | 'eraser' | 'fill'
    this.loadedSlices = new Set();
    this.editedSlices = new Set();
    this._fillHandler = null;

    this._previewTimer = null;
    this._previewSeq = 0;
    this.jobId = null;
    this.result = null;
    this.metrics = null;
    this.reportDir = null;
    this.reportSaved = false;
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================

  render() {
    this.container.innerHTML = `
      <div class="segcleanup-module module-container">
        ${this.renderHeader()}
        ${this.renderStepNav()}
        <div class="step-contents">
          ${this.renderStep1()}
          ${this.renderStep2()}
          ${this.renderStep3()}
        </div>
      </div>
    `;
  }

  renderStep1() {
    return `
      <div id="step1" class="step-content active">
        <div class="step-inner">
          <h3>Select Segmentation</h3>
          <p class="step-description">
            Pick a segmentation (or annotation mask) and choose what to do
            with it. Results are saved as new files; the original is never
            modified.
          </p>

          <div class="section-card">
            <label class="radio-option">
              <input type="radio" name="sc-workflow" value="auto" checked>
              <strong>Automated cleanup</strong> - fill holes, remove small
              components, smooth boundaries, merge classes
            </label>
            <label class="radio-option">
              <input type="radio" name="sc-workflow" value="manual">
              <strong>Manual touch-up</strong> - paint corrections with
              brush, eraser and flood fill
            </label>
            <label class="radio-option">
              <input type="radio" name="sc-workflow" value="quantify">
              <strong>Quantify</strong> - volumes, object counts and surface
              areas, without changing the data
            </label>
          </div>

          <div id="scFileSelectorContainer"></div>
          <div id="scSelectedFile"></div>

          <div class="navigation-buttons">
            <div></div>
            <button id="scStep1Next" class="btn" disabled>Next: Clean Up</button>
          </div>
        </div>
      </div>
    `;
  }

  renderStep2() {
    return `
      <div id="step2" class="step-content">
        <div class="step-inner wide">

          <!-- Automated cleanup layout -->
          <div id="scAutoEdit" style="display: none;">
            <h3>Automated Cleanup</h3>
            <p class="step-description">
              Configure the operations; the preview shows the current slice
              with a 2D approximation (hole filling and component removal
              run in full 3D on apply).
            </p>

            <div class="sc-main">
              <div class="sc-viewer-wrap">
                <div class="sc-viewer-controls">
                  <div class="control-group sc-slice-group">
                    <label>Slice:</label>
                    <input type="range" id="scSliceRange" min="0" value="0">
                    <input type="number" id="scSliceNum" min="0" value="0">
                    <span class="sc-slice-total" id="scSliceTotal"></span>
                  </div>
                  <label class="checkbox-inline" id="scUnderlayToggleWrap" style="display: none;">
                    <input type="checkbox" id="scUnderlayToggle" checked> image underlay
                  </label>
                </div>
                <div class="sc-viewer-area">
                  <img id="scPreviewImg" alt="">
                  <div class="viewer-status" id="scViewerStatus">Loading preview...</div>
                </div>
                <div class="sc-viewer-footer">
                  <span id="scImageInfo" class="field-hint"></span>
                </div>
              </div>

              <div class="sc-toolbar">
                <div class="toolbar-section">
                  <div class="toolbar-section-title">Classes</div>
                  <div id="scClassOps"></div>
                </div>
                <div class="toolbar-section">
                  <div class="toolbar-section-title">Fill holes</div>
                  <select id="scFillHoles">
                    <option value="off">off</option>
                    <option value="2d">2D (per slice)</option>
                    <option value="3d">3D (volumetric)</option>
                  </select>
                </div>
                <div class="toolbar-section">
                  <div class="toolbar-section-title">Remove small components</div>
                  <div class="sc-row">
                    <label>min size</label>
                    <input type="number" id="scMinSize" min="0" step="1" value="0">
                    <span class="field-hint-inline">voxels (3D)</span>
                  </div>
                </div>
                <div class="toolbar-section">
                  <div class="toolbar-section-title">Smooth boundaries</div>
                  <div class="sc-row">
                    <label>radius</label>
                    <input type="range" id="scSmoothRadius" min="0" max="5" step="1" value="0">
                    <span id="scSmoothVal">0</span>
                  </div>
                  <p class="field-hint">Majority filter per slice; 0 = off.</p>
                </div>
                <div class="toolbar-section">
                  <button class="btn small secondary" id="scOpsResetBtn">Reset all operations</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Manual touch-up layout -->
          <div id="scManualEdit" style="display: none;">
            <h3>Manual Touch-Up</h3>
            <p class="step-description">
              Paint corrections onto the labels. Left-drag paints, right-drag
              or space+drag pans, wheel zooms. Only edited slices are written
              on save.
            </p>

            <div class="sc-main">
              <div class="sc-viewer-wrap">
                <div class="sc-viewer-controls">
                  <div class="control-group sc-slice-group">
                    <label>Slice:</label>
                    <input type="range" id="scEditSliceRange" min="0" value="0">
                    <input type="number" id="scEditSliceNum" min="0" value="0">
                    <span class="sc-slice-total" id="scEditSliceTotal"></span>
                  </div>
                  <div class="control-group">
                    <button class="btn-icon" id="scUndoBtn" title="Undo (this slice)">&#8630;</button>
                    <button class="btn-icon" id="scRedoBtn" title="Redo (this slice)">&#8631;</button>
                  </div>
                </div>
                <div class="sc-canvas-area" id="scCanvasArea">
                  <div class="viewer-status" id="scEditStatus">Loading...</div>
                </div>
                <div class="sc-viewer-footer">
                  <span class="field-hint" id="scEditedInfo"></span>
                  <span class="field-hint">left-drag = paint &middot; right-drag / space = pan &middot; wheel = zoom</span>
                </div>
              </div>

              <div class="sc-toolbar">
                <div class="toolbar-section">
                  <div class="toolbar-section-title">Tool</div>
                  <div class="sc-tool-row">
                    <button class="sc-tool-btn active" data-tool="brush" title="Paint with the active class">&#128396; Brush</button>
                    <button class="sc-tool-btn" data-tool="eraser" title="Erase to background">&#9003; Eraser</button>
                    <button class="sc-tool-btn" data-tool="fill" title="Flood-fill the clicked region with the active class">&#127754; Fill</button>
                  </div>
                </div>
                <div class="toolbar-section">
                  <div class="toolbar-section-title">Brush size</div>
                  <div class="sc-row">
                    <input type="range" id="scBrushSize" min="1" max="100" value="10">
                    <span id="scBrushSizeVal">10px</span>
                  </div>
                </div>
                <div class="toolbar-section">
                  <div class="toolbar-section-title">Active class</div>
                  <div id="scClassList"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="navigation-buttons">
            <button id="scStep2Back" class="btn secondary">Back</button>
            <button id="scStep2Next" class="btn">Next</button>
          </div>
        </div>
      </div>
    `;
  }

  renderStep3() {
    return `
      <div id="step3" class="step-content">
        <div class="step-inner">
          <h3 id="scStep3Title">Result &amp; Report</h3>

          <div class="section-card" id="scSummarySection">
            <h4>Summary</h4>
            <div id="scSummary"></div>
          </div>

          <div class="section-card" id="scOutputSection">
            <h4>Output</h4>
            <div class="form-field">
              <label for="scOutputName">Output name</label>
              <input type="text" id="scOutputName" value="cleaned">
            </div>
          </div>

          <div class="section-card" id="scProgressSection" style="display: none;">
            <h4>Progress</h4>
            <div class="inference-status" id="scStatusText">Starting...</div>
            <div class="progress-bar-container">
              <div class="progress-bar" id="scProgressBar" style="width: 0%"></div>
            </div>
          </div>

          <div class="section-card success-card" id="scSuccessSection" style="display: none;">
            <div class="success-header">
              <span class="success-icon">&#10003;</span>
              <span class="success-title" id="scSuccessTitle">Done</span>
            </div>
            <div id="scResultInfo"></div>
            <div class="success-actions">
              <button class="btn primary" id="scOpenViewerBtn" style="display: none;">Open in Image Viewer</button>
              <button class="btn secondary" id="scNewRunBtn">Start Over</button>
            </div>
          </div>

          <div class="section-card" id="scMetricsSection" style="display: none;">
            <h4>Quantification</h4>
            <div id="scMetrics"></div>
            <div class="success-actions">
              <button class="btn" id="scSaveReportBtn">Save report (CSV) to workspace</button>
            </div>
          </div>

          <div class="navigation-buttons">
            <button id="scStep3Back" class="btn secondary">Back</button>
            <button class="btn btn-danger" id="scRunBtn">
              <span class="btn-icon">&#9658;</span> <span id="scRunBtnLabel">Apply</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async initialize() {
    this.stepNavigator = new StepNavigator({
      steps: this.config.steps,
      currentStep: this.currentStep,
      onStepClick: (n) => this.goToStep(n),
      canNavigate: (n) => this.canNavigateToStep(n)
    });
    this.stepNavigator.init(this.container);

    document.getElementById('backToHub')?.addEventListener('click',
      () => window.workspace.returnToHub());

    // Step 1
    document.querySelectorAll('input[name="sc-workflow"]').forEach(r =>
      r.addEventListener('change', (e) => this.onWorkflowChange(e.target.value)));

    const fileSelectorContainer = document.getElementById('scFileSelectorContainer');
    if (fileSelectorContainer) {
      this.fileSelector = new FileSelector({
        id: 'segcleanup_source',
        fileType: 'annotations',
        filterTags: ['annotation'],
        title: 'Segmentation',
        icon: '🧩',
        accept: '.tif,.tiff',
        showTestData: false,
        showRecentResults: true,
        stateManager: this.state,
        onSelect: (file) => this.onFileSelected(file),
        onUpload: (rawFile, uploadedFile) => this.onFileSelected(uploadedFile),
        resultCategories: ['results', 'segmentations'],
        resultCategoryLabels: {
          'results': 'Result',
          'segmentations': 'Segmentation'
        },
        filterRecentResults: (files) => files.filter(f => {
          if (f.category === 'results') {
            const tags = f.tags || [];
            return tags.includes('segmentation') && tags.includes('data');
          }
          return f.category === 'segmentations';
        }),
        filterFiles: (files) => files.filter(f =>
          f.category === 'uploads' && (f.tags || []).includes('annotation'))
      });
      fileSelectorContainer.innerHTML = this.fileSelector.render();
      await this.fileSelector.init();
    }
    document.getElementById('scStep1Next')?.addEventListener('click', () => {
      this.goToStep(this.workflow === 'quantify' ? 3 : 2);
    });

    // Step 2
    document.getElementById('scStep2Back')?.addEventListener('click', () => this.goToStep(1));
    document.getElementById('scStep2Next')?.addEventListener('click', () => this.goToStep(3));
    this.setupAutoControls();
    this.setupManualControls();

    // Step 3
    document.getElementById('scStep3Back')?.addEventListener('click', () => {
      this.goToStep(this.workflow === 'quantify' ? 1 : 2);
    });
    document.getElementById('scRunBtn')?.addEventListener('click', () => this.run());
    document.getElementById('scOpenViewerBtn')?.addEventListener('click', () => this.openResultInViewer());
    document.getElementById('scSaveReportBtn')?.addEventListener('click', () => this.saveReport());
    document.getElementById('scNewRunBtn')?.addEventListener('click', async () => {
      this.teardownEditor();
      this.resetState();
      this.renderSelectedFile();
      if (this.fileSelector) {
        this.fileSelector.selectedFile = null;
        await this.fileSelector.refresh();
        const dropdown = document.getElementById(`${this.fileSelector.id}-select`);
        if (dropdown) dropdown.value = '';
        this.fileSelector.hidePreview();
      }
      this.onWorkflowChange(this.workflow);
      this.goToStep(1);
    });

    window.segcleanupModule = this;
  }

  async deactivate() {
    clearTimeout(this._previewTimer);
    this.teardownEditor();
    if (this.socket && this.jobId) {
      this.socket.emit('leave-segcleanup', this.jobId);
    }
    // Leaving the module starts fresh next time (user preference)
    this.resetState();
    this.fileSelector = null;
    try { delete window.segcleanupModule; } catch (e) { window.segcleanupModule = undefined; }
    await super.deactivate();
  }

  teardownEditor() {
    if (this.brushEngine) {
      try { this.brushEngine.destroy(); } catch (e) { /* ignore */ }
      this.brushEngine = null;
    }
    if (this.canvas) {
      try { this.canvas.destroy(); } catch (e) { /* ignore */ }
      this.canvas = null;
    }
    this.historyManager = null;
  }

  canNavigateToStep(n) {
    if (n === 1) return true;
    if (n === 2) return this.file != null && this.workflow !== 'quantify';
    return this.file != null;
  }

  onStepChange(prev, next) {
    if (this.stepNavigator) this.stepNavigator.update(next);
    if (next === 2) this.enterEditStep();
    if (next === 3) this.enterResultStep();
  }

  // ==========================================================================
  // Step 1
  // ==========================================================================

  onWorkflowChange(workflow) {
    this.workflow = workflow;
    const next = document.getElementById('scStep1Next');
    if (next) {
      next.textContent = workflow === 'auto' ? 'Next: Clean Up'
        : workflow === 'manual' ? 'Next: Touch Up' : 'Next: Quantify';
    }
  }

  async onFileSelected(file) {
    const next = document.getElementById('scStep1Next');
    if (next) next.disabled = true;

    if (!file || !file.path) {
      this.file = null;
      this.renderSelectedFile();
      return;
    }

    try {
      const response = await fetch(`/api/segcleanup/info?path=${encodeURIComponent(file.path)}`);
      const info = await response.json();
      if (!info.success) throw new Error(info.error || 'Could not read stack info');
      if (!info.classes.length) throw new Error('No labeled classes found in this stack');

      const workflow = this.workflow;
      this.teardownEditor();
      this.resetState();
      this.workflow = workflow;
      this.file = {
        path: file.path,
        name: file.name || file.path.split('/').pop(),
        id: file.id || null,
        voxelSize: file.voxelSize || null,
        slices: info.sliceCount,
        width: info.width,
        height: info.height,
        dtype: info.dtype,
        classes: info.classes
      };
      this.currentSlice = Math.floor(info.sliceCount / 2);
      await this.resolveUnderlay(file);
      this.renderSelectedFile();
      if (next) next.disabled = false;
    } catch (e) {
      this.state.notify('error', `Could not select segmentation: ${e.message}`);
      this.renderSelectedFile();
    }
  }

  /** Grayscale origin of the segmentation via its lineage (one hop) */
  async resolveUnderlay(file) {
    this.underlay = null;
    const inputId = file.lineage?.inputs?.[0];
    if (!inputId) return;
    try {
      const response = await fetch('/api/workspace/files');
      const data = await response.json();
      const origin = (data.files || []).find(f => f.id === inputId);
      if (origin && /\.tiff?$/i.test(origin.name)
          && !(origin.tags || []).includes('segmentation')
          && !(origin.tags || []).includes('annotation')) {
        this.underlay = { id: origin.id, path: origin.path, name: origin.name };
      }
    } catch (e) { /* underlay is optional */ }
  }

  renderSelectedFile() {
    const el = document.getElementById('scSelectedFile');
    if (!el) return;
    if (!this.file) {
      el.innerHTML = '';
      return;
    }
    const chips = this.file.classes.map(c =>
      `<span class="sc-class-chip"><span class="sc-color" style="background:${c.color}"></span>
       ${c.value} <span class="sc-chip-count">(${this.formatCount(c.voxels)} vox)</span></span>`).join('');
    el.innerHTML = `
      <div class="stack-item">
        <span class="stack-name">${this.file.name}</span>
        <span class="stack-dims">${this.file.width}&times;${this.file.height},
          ${this.file.slices} slices${this.underlay ? `, image underlay: ${this.underlay.name}` : ''}</span>
      </div>
      <div class="sc-class-chips">${chips}</div>
      ${this.file.voxelSize?.x ? '' : `<p class="field-hint">No voxel size set on this file -
        quantification reports voxels only. Set it via the file browser's file info dialog.</p>`}
    `;
  }

  formatCount(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return String(n);
  }

  // ==========================================================================
  // Step 2 shared
  // ==========================================================================

  enterEditStep() {
    const auto = document.getElementById('scAutoEdit');
    const manual = document.getElementById('scManualEdit');
    if (auto) auto.style.display = this.workflow === 'auto' ? '' : 'none';
    if (manual) manual.style.display = this.workflow === 'manual' ? '' : 'none';
    const next = document.getElementById('scStep2Next');
    if (next) next.textContent = this.workflow === 'auto' ? 'Next: Apply' : 'Next: Save';

    if (this.workflow === 'auto') this.enterAutoStep();
    else this.enterManualStep();
  }

  // ==========================================================================
  // Automated cleanup (workflow A)
  // ==========================================================================

  setupAutoControls() {
    const bind = (id, evt, fn) => document.getElementById(id)?.addEventListener(evt, fn);

    const onSlice = (e) => {
      const v = Math.max(0, Math.min(this.file ? this.file.slices - 1 : 0,
        parseInt(e.target.value, 10) || 0));
      this.currentSlice = v;
      const r = document.getElementById('scSliceRange');
      const n = document.getElementById('scSliceNum');
      if (r) r.value = v;
      if (n) n.value = v;
      this.requestPreview();
    };
    bind('scSliceRange', 'input', onSlice);
    bind('scSliceNum', 'change', onSlice);

    bind('scUnderlayToggle', 'change', (e) => {
      this.showUnderlay = e.target.checked;
      this.requestPreview();
    });
    bind('scFillHoles', 'change', (e) => {
      this.ops.fillHoles = e.target.value;
      this.requestPreview();
    });
    bind('scMinSize', 'change', (e) => {
      this.ops.minSize = Math.max(0, parseInt(e.target.value, 10) || 0);
      this.requestPreview();
    });
    bind('scSmoothRadius', 'input', (e) => {
      this.ops.smoothRadius = parseInt(e.target.value, 10) || 0;
      const val = document.getElementById('scSmoothVal');
      if (val) val.textContent = String(this.ops.smoothRadius);
      this.requestPreview();
    });
    bind('scOpsResetBtn', 'click', () => {
      this.ops = { mergeMap: {}, fillHoles: 'off', minSize: 0, smoothRadius: 0 };
      this.syncOpsInputs();
      this.renderClassOps();
      this.requestPreview();
    });
  }

  enterAutoStep() {
    if (!this.file) return;
    const setup = (id, value, max) => {
      const el = document.getElementById(id);
      if (el) { if (max != null) el.max = max; el.value = value; }
    };
    setup('scSliceRange', this.currentSlice, this.file.slices - 1);
    setup('scSliceNum', this.currentSlice, this.file.slices - 1);
    const total = document.getElementById('scSliceTotal');
    if (total) total.textContent = `/ ${this.file.slices - 1}`;

    const underlayWrap = document.getElementById('scUnderlayToggleWrap');
    if (underlayWrap) underlayWrap.style.display = this.underlay ? '' : 'none';

    const info = document.getElementById('scImageInfo');
    if (info) info.textContent = `${this.file.name} - ${this.file.width}×${this.file.height}`;

    this.syncOpsInputs();
    this.renderClassOps();
    this.requestPreview(true);
  }

  syncOpsInputs() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('scFillHoles', this.ops.fillHoles);
    set('scMinSize', this.ops.minSize);
    set('scSmoothRadius', this.ops.smoothRadius);
    const val = document.getElementById('scSmoothVal');
    if (val) val.textContent = String(this.ops.smoothRadius);
    const toggle = document.getElementById('scUnderlayToggle');
    if (toggle) toggle.checked = this.showUnderlay;
  }

  renderClassOps() {
    const el = document.getElementById('scClassOps');
    if (!el || !this.file) return;
    el.innerHTML = this.file.classes.map(c => {
      const target = this.ops.mergeMap[c.value];
      const options = [
        `<option value="keep" ${target == null ? 'selected' : ''}>keep</option>`,
        `<option value="0" ${target === 0 ? 'selected' : ''}>remove</option>`,
        ...this.file.classes.filter(o => o.value !== c.value).map(o =>
          `<option value="${o.value}" ${target === o.value ? 'selected' : ''}>merge into ${o.value}</option>`)
      ].join('');
      return `
        <div class="sc-class-row">
          <span class="sc-color" style="background:${c.color}"></span>
          <span class="sc-class-label">${c.value}</span>
          <select data-class="${c.value}">${options}</select>
        </div>`;
    }).join('');
    el.querySelectorAll('select[data-class]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const cls = parseInt(e.target.getAttribute('data-class'), 10);
        const v = e.target.value;
        if (v === 'keep') delete this.ops.mergeMap[cls];
        else this.ops.mergeMap[cls] = parseInt(v, 10);
        this.requestPreview();
      });
    });
  }

  buildOpsPayload() {
    return {
      merge_map: this.ops.mergeMap,
      fill_holes: this.ops.fillHoles,
      min_size: this.ops.minSize,
      smooth_radius: this.ops.smoothRadius
    };
  }

  requestPreview(immediate = false) {
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => this.loadPreview(), immediate ? 0 : 350);
  }

  async loadPreview() {
    if (!this.file || this.workflow !== 'auto') return;
    const seq = ++this._previewSeq;
    const img = document.getElementById('scPreviewImg');
    const status = document.getElementById('scViewerStatus');
    if (status && (!img || !img.src)) {
      status.style.display = 'block';
      status.textContent = 'Loading preview...';
    }
    try {
      const response = await fetch('/api/segcleanup/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.file.path,
          slice: this.currentSlice,
          ops: this.buildOpsPayload(),
          underlayPath: this.showUnderlay ? this.underlay?.path : null
        })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Preview failed (${response.status})`);
      }
      const blob = await response.blob();
      if (seq !== this._previewSeq) return;
      const url = URL.createObjectURL(blob);
      if (img) {
        const old = img.src;
        img.onload = () => { if (old && old.startsWith('blob:')) URL.revokeObjectURL(old); };
        img.src = url;
      }
      if (status) status.style.display = 'none';
    } catch (e) {
      if (seq !== this._previewSeq) return;
      if (status) {
        status.style.display = 'block';
        status.textContent = `Could not load preview: ${e.message}`;
      }
    }
  }

  // ==========================================================================
  // Manual touch-up (workflow B)
  // ==========================================================================

  setupManualControls() {
    const bind = (id, evt, fn) => document.getElementById(id)?.addEventListener(evt, fn);

    const onSlice = (e) => {
      const v = Math.max(0, Math.min(this.file ? this.file.slices - 1 : 0,
        parseInt(e.target.value, 10) || 0));
      const r = document.getElementById('scEditSliceRange');
      const n = document.getElementById('scEditSliceNum');
      if (r) r.value = v;
      if (n) n.value = v;
      this.goToEditSlice(v);
    };
    bind('scEditSliceRange', 'input', onSlice);
    bind('scEditSliceNum', 'change', onSlice);

    document.querySelectorAll('.sc-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.getAttribute('data-tool')));
    });
    bind('scBrushSize', 'input', (e) => {
      const size = parseInt(e.target.value, 10) || 10;
      this.brushEngine?.setBrushSize(size);
      const val = document.getElementById('scBrushSizeVal');
      if (val) val.textContent = `${size}px`;
    });
    bind('scUndoBtn', 'click', () => this.undo());
    bind('scRedoBtn', 'click', () => this.redo());
  }

  async enterManualStep() {
    if (!this.file) return;
    const setup = (id, value, max) => {
      const el = document.getElementById(id);
      if (el) { if (max != null) el.max = max; el.value = value; }
    };
    setup('scEditSliceRange', this.currentSlice, this.file.slices - 1);
    setup('scEditSliceNum', this.currentSlice, this.file.slices - 1);
    const total = document.getElementById('scEditSliceTotal');
    if (total) total.textContent = `/ ${this.file.slices - 1}`;

    if (!this.canvas) {
      const area = document.getElementById('scCanvasArea');
      this.canvas = new AnnotationCanvas(area);
      this.brushEngine = new BrushEngine(this.canvas);
      this.historyManager = new HistoryManager();

      // Classes = the stack's label values (id = label value)
      this.brushEngine.classes = this.file.classes.map(c => ({
        id: c.value, name: `Class ${c.value}`, color: c.color, visible: true
      }));
      this.brushEngine.activeClassId = this.file.classes[0].value;
      this.brushEngine.nextClassId = Math.max(...this.file.classes.map(c => c.value)) + 1;

      this.brushEngine.onStrokeStart = () => {
        const idx = this.canvas.currentSlice;
        const data = this.brushEngine.getAnnotationData();
        if (data) this.historyManager.saveState(idx, new Uint8Array(data));
      };
      this.brushEngine.onStrokeEnd = () => this.updateHistoryButtons();
      this.brushEngine.onAnnotationChange = () => {
        this.editedSlices.add(this.canvas.currentSlice);
        this.updateEditedInfo();
      };
      this.brushEngine.onStrokeCancel = () => this.undo();
      this.canvas.onTwoFingerStart = () => this.brushEngine.cancelCurrentStroke();
      this.canvas.onMouseMove = (coords) => this.brushEngine.updatePreview(coords);
      this.canvas.onSliceLoaded = () => { /* labels ensured in goToEditSlice */ };

      this.renderClassList();
      this.setTool(this.tool);
    }
    this.updateEditedInfo();
    await this.goToEditSlice(this.currentSlice);
  }

  /** File id whose full-resolution slices back the editor view */
  editorImageFileId() {
    return this.underlay?.id || this.file.id || this.file.path;
  }

  async goToEditSlice(index) {
    if (!this.file || !this.canvas) return;
    this.currentSlice = index;
    const status = document.getElementById('scEditStatus');
    if (status) { status.style.display = 'block'; status.textContent = 'Loading slice...'; }
    try {
      await this.canvas.loadSlice(this.editorImageFileId(), index);
      if (this.canvas.currentSlice !== index) return;  // superseded

      if (this.brushEngine.imageWidth === 0) {
        this.brushEngine.initialize(this.file.width, this.file.height);
      }
      await this.ensureLabelsLoaded(index);
      if (this.canvas.currentSlice !== index) return;
      this.brushEngine.renderAnnotations();
      this.updateHistoryButtons();
      if (status) status.style.display = 'none';
    } catch (e) {
      if (status) status.textContent = `Could not load slice: ${e.message}`;
    }
  }

  /** Fetch the slice's label values (lossless L-mode PNG) into the engine */
  async ensureLabelsLoaded(index) {
    if (this.loadedSlices.has(index)) return;
    const url = `/api/segcleanup/label-slice?path=${encodeURIComponent(this.file.path)}&slice=${index}`;
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('label slice load failed'));
      im.src = url;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
    const labels = new Uint8Array(c.width * c.height);
    for (let i = 0; i < labels.length; i++) labels[i] = rgba[i * 4];
    this.brushEngine.setAnnotationData(index, labels);
    this.loadedSlices.add(index);
  }

  setTool(tool) {
    this.tool = tool;
    document.querySelectorAll('.sc-tool-btn').forEach(btn =>
      btn.classList.toggle('active', btn.getAttribute('data-tool') === tool));
    if (!this.brushEngine || !this.canvas) return;

    // The flood-fill tool takes over pointer handling from the brush
    if (this._fillHandler) {
      this.canvas.canvasArea?.removeEventListener('pointerdown', this._fillHandler);
      this._fillHandler = null;
    }
    if (tool === 'fill') {
      this.brushEngine.detachEventListeners();
      this._fillHandler = (e) => this.handleFillClick(e);
      this.canvas.canvasArea?.addEventListener('pointerdown', this._fillHandler);
    } else {
      this.brushEngine.attachEventListeners();
      this.brushEngine.setTool(tool);
    }
  }

  handleFillClick(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.canvas.isPanning || this.canvas.spacePressed) return;
    const source = this.canvas.screenToSource(e.clientX, e.clientY);
    if (!this.canvas.isInBounds(source.x, source.y)) return;
    e.preventDefault();

    const idx = this.canvas.currentSlice;
    const data = this.brushEngine.getAnnotationData();
    if (!data) return;
    const w = this.brushEngine.imageWidth;
    const h = this.brushEngine.imageHeight;
    const x0 = Math.floor(source.x);
    const y0 = Math.floor(source.y);
    const target = data[y0 * w + x0];
    const replacement = this.brushEngine.activeClassId;
    if (target === replacement) return;

    this.historyManager.saveState(idx, new Uint8Array(data));

    // Scanline flood fill of the connected `target` region
    const stack = [[x0, y0]];
    while (stack.length) {
      const [px, py] = stack.pop();
      let x = px;
      while (x >= 0 && data[py * w + x] === target) x--;
      x++;
      let above = false;
      let below = false;
      while (x < w && data[py * w + x] === target) {
        data[py * w + x] = replacement;
        if (py > 0) {
          if (data[(py - 1) * w + x] === target) {
            if (!above) { stack.push([x, py - 1]); above = true; }
          } else above = false;
        }
        if (py < h - 1) {
          if (data[(py + 1) * w + x] === target) {
            if (!below) { stack.push([x, py + 1]); below = true; }
          } else below = false;
        }
        x++;
      }
    }

    this.editedSlices.add(idx);
    this.brushEngine.renderAnnotations();
    this.updateHistoryButtons();
    this.updateEditedInfo();
  }

  undo() {
    if (!this.historyManager || !this.brushEngine) return;
    const idx = this.canvas.currentSlice;
    if (!this.historyManager.canUndo(idx)) return;
    const current = this.brushEngine.getAnnotationData();
    const previous = this.historyManager.undo(idx, new Uint8Array(current));
    if (previous) {
      this.brushEngine.setAnnotationData(idx, previous);
      this.brushEngine.renderAnnotations();
      this.editedSlices.add(idx);
      this.updateEditedInfo();
    }
    this.updateHistoryButtons();
  }

  redo() {
    if (!this.historyManager || !this.brushEngine) return;
    const idx = this.canvas.currentSlice;
    if (!this.historyManager.canRedo(idx)) return;
    const current = this.brushEngine.getAnnotationData();
    const next = this.historyManager.redo(idx, new Uint8Array(current));
    if (next) {
      this.brushEngine.setAnnotationData(idx, next);
      this.brushEngine.renderAnnotations();
      this.editedSlices.add(idx);
      this.updateEditedInfo();
    }
    this.updateHistoryButtons();
  }

  updateHistoryButtons() {
    const idx = this.canvas?.currentSlice ?? 0;
    const undoBtn = document.getElementById('scUndoBtn');
    const redoBtn = document.getElementById('scRedoBtn');
    if (undoBtn) undoBtn.disabled = !this.historyManager?.canUndo(idx);
    if (redoBtn) redoBtn.disabled = !this.historyManager?.canRedo(idx);
  }

  updateEditedInfo() {
    const el = document.getElementById('scEditedInfo');
    if (el) {
      el.textContent = this.editedSlices.size
        ? `${this.editedSlices.size} slice${this.editedSlices.size > 1 ? 's' : ''} edited`
        : 'No edits yet';
    }
  }

  renderClassList() {
    const el = document.getElementById('scClassList');
    if (!el || !this.brushEngine) return;
    el.innerHTML = this.brushEngine.classes.map(c => `
      <button class="sc-class-item ${c.id === this.brushEngine.activeClassId ? 'active' : ''}"
              data-class="${c.id}">
        <span class="sc-color" style="background:${c.color}"></span> ${c.name}
      </button>
    `).join('');
    el.querySelectorAll('[data-class]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.brushEngine.setActiveClass(parseInt(btn.getAttribute('data-class'), 10));
        this.renderClassList();
      });
    });
  }

  // ---- edited-slice encoding (annotation module formats) --------------------

  encodeSlice(data) {
    let nonZero = 0;
    for (let i = 0; i < data.length; i++) if (data[i] !== 0) nonZero++;

    if (nonZero * 5 < data.length * 0.75) {
      const buf = new Uint8Array(nonZero * 5);
      const w = this.brushEngine.imageWidth;
      let o = 0;
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== 0) {
          const x = i % w;
          const y = (i / w) | 0;
          buf[o++] = x & 255; buf[o++] = x >> 8;
          buf[o++] = y & 255; buf[o++] = y >> 8;
          buf[o++] = data[i];
        }
      }
      return { encoding: 'sparse', data: this.toBase64(buf) };
    }
    return { encoding: 'dense', data: this.toBase64(data) };
  }

  toBase64(bytes) {
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  // ==========================================================================
  // Step 3: run + results
  // ==========================================================================

  enterResultStep() {
    const summarySection = document.getElementById('scSummarySection');
    const outputSection = document.getElementById('scOutputSection');
    const runBtn = document.getElementById('scRunBtn');
    const runLabel = document.getElementById('scRunBtnLabel');
    const title = document.getElementById('scStep3Title');
    const nameInput = document.getElementById('scOutputName');
    document.getElementById('scSuccessSection').style.display = 'none';
    document.getElementById('scMetricsSection').style.display = 'none';
    document.getElementById('scProgressSection').style.display = 'none';
    if (runBtn) { runBtn.style.display = ''; runBtn.disabled = false; }

    if (this.workflow === 'auto') {
      if (title) title.innerHTML = 'Apply &amp; Quantify';
      if (runLabel) runLabel.textContent = 'Apply';
      if (outputSection) outputSection.style.display = '';
      if (nameInput && nameInput.value === 'edited') nameInput.value = 'cleaned';
      this.renderAutoSummary();
    } else if (this.workflow === 'manual') {
      if (title) title.textContent = 'Save Edits';
      if (runLabel) runLabel.textContent = 'Save';
      if (outputSection) outputSection.style.display = '';
      if (nameInput && nameInput.value === 'cleaned') nameInput.value = 'edited';
      this.renderManualSummary();
    } else {
      if (title) title.textContent = 'Quantify';
      if (runLabel) runLabel.textContent = 'Quantify';
      if (outputSection) outputSection.style.display = 'none';
      const el = document.getElementById('scSummary');
      if (el && this.file) {
        el.innerHTML = `
          <div class="detail-row"><span class="detail-label">Input:</span>
            <span class="detail-value">${this.file.name} (${this.file.classes.length}
            class${this.file.classes.length > 1 ? 'es' : ''})</span></div>
          ${this.voxelSizeNote()}`;
      }
    }
    if (summarySection) summarySection.style.display = '';
  }

  voxelSizeNote() {
    const vs = this.file?.voxelSize;
    if (vs?.x && vs?.z) {
      const unit = vs.unit === 'um' ? '&micro;m' : (vs.unit || '');
      return `<div class="detail-row"><span class="detail-label">Voxel size:</span>
        <span class="detail-value">${vs.x} &times; ${vs.y} &times; ${vs.z} ${unit}
        - volumes and areas in physical units</span></div>`;
    }
    return `<div class="detail-row"><span class="detail-label">Voxel size:</span>
      <span class="detail-value">not set - metrics in voxels</span></div>`;
  }

  renderAutoSummary() {
    const el = document.getElementById('scSummary');
    if (!el || !this.file) return;
    const items = [];
    for (const [cls, target] of Object.entries(this.ops.mergeMap)) {
      items.push(target === 0 ? `Remove class ${cls}` : `Merge class ${cls} into ${target}`);
    }
    if (this.ops.fillHoles !== 'off') items.push(`Fill holes (${this.ops.fillHoles.toUpperCase()})`);
    if (this.ops.minSize > 0) items.push(`Remove components smaller than ${this.ops.minSize} voxels`);
    if (this.ops.smoothRadius > 0) items.push(`Smooth boundaries (radius ${this.ops.smoothRadius})`);
    el.innerHTML = `
      <div class="detail-row"><span class="detail-label">Input:</span>
        <span class="detail-value">${this.file.name}</span></div>
      ${items.length
        ? `<ul class="sc-ops-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
        : '<p class="field-hint">No operations configured - the output will be an identical copy (still quantified).</p>'}
      ${this.voxelSizeNote()}`;
  }

  renderManualSummary() {
    const el = document.getElementById('scSummary');
    if (!el || !this.file) return;
    el.innerHTML = `
      <div class="detail-row"><span class="detail-label">Input:</span>
        <span class="detail-value">${this.file.name}</span></div>
      <div class="detail-row"><span class="detail-label">Edited slices:</span>
        <span class="detail-value">${this.editedSlices.size
          ? [...this.editedSlices].sort((a, b) => a - b).join(', ')
          : 'none yet - go back to paint'}</span></div>`;
  }

  async run() {
    if (!this.file) return;
    if (this.workflow === 'manual' && this.editedSlices.size === 0) {
      this.state.notify('warning', 'No edited slices to save yet.');
      return;
    }

    const progressSection = document.getElementById('scProgressSection');
    const runBtn = document.getElementById('scRunBtn');
    if (progressSection) progressSection.style.display = 'block';
    if (runBtn) runBtn.disabled = true;
    this.updateProgress(0, 'Starting...');

    try {
      let response;
      if (this.workflow === 'auto') {
        response = await fetch('/api/segcleanup/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: this.file.path,
            ops: this.buildOpsPayload(),
            outputName: document.getElementById('scOutputName')?.value || 'cleaned'
          })
        });
      } else if (this.workflow === 'manual') {
        this.updateProgress(0, 'Encoding edited slices...');
        const edits = {};
        for (const idx of this.editedSlices) {
          const data = this.brushEngine.getAllAnnotations().get(idx);
          if (data) edits[idx] = this.encodeSlice(data);
        }
        response = await fetch('/api/segcleanup/save-edits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: this.file.path,
            width: this.file.width,
            height: this.file.height,
            edits,
            outputName: document.getElementById('scOutputName')?.value || 'edited'
          })
        });
      } else {
        response = await fetch('/api/segcleanup/quantify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: this.file.path })
        });
      }
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to start');
      this.jobId = result.jobId;
      this.connectSocket();
    } catch (e) {
      this.state.notify('error', `Failed: ${e.message}`);
      if (progressSection) progressSection.style.display = 'none';
      if (runBtn) runBtn.disabled = false;
    }
  }

  connectSocket() {
    if (!this.socket) {
      if (!window.io) { this.state.notify('error', 'Socket.IO not available'); return; }
      this.socket = window.io();
    }
    this.socket.off('segcleanup-progress');
    this.socket.off('segcleanup-complete');
    this.socket.off('segcleanup-error');
    this.socket.emit('join-segcleanup', this.jobId);

    this.socket.on('segcleanup-progress', (data) => {
      if (data.current_slice != null) {
        this.updateProgress(data.progress_percent || 0,
          `Slice ${data.current_slice} of ${data.total_slices}`);
      } else if (data.stage) {
        this.updateProgress(data.progress_percent || 0, data.stage);
      }
    });
    this.socket.on('segcleanup-complete', (data) => {
      const runBtn = document.getElementById('scRunBtn');
      if (runBtn) runBtn.disabled = false;
      if (data.success) {
        this.result = data;
        this.metrics = data.metrics || null;
        this.reportDir = data.reportDir || null;
        this.reportSaved = false;
        this.showSuccess(data);
        this.fileSelector?.refresh();
        if (window.workspace?.fileBrowser) window.workspace.fileBrowser.refresh();
      } else {
        this.state.notify('error', `Failed: ${data.error || 'unknown error'}`);
        const progressSection = document.getElementById('scProgressSection');
        if (progressSection) progressSection.style.display = 'none';
      }
    });
    this.socket.on('segcleanup-error', (data) => {
      this.state.notify('error', `Error: ${data.message}`);
    });
  }

  updateProgress(percent, text) {
    const bar = document.getElementById('scProgressBar');
    const status = document.getElementById('scStatusText');
    if (bar) bar.style.width = `${percent}%`;
    if (status) status.textContent = text;
  }

  showSuccess(data) {
    document.getElementById('scProgressSection').style.display = 'none';
    const successSection = document.getElementById('scSuccessSection');
    const runBtn = document.getElementById('scRunBtn');
    if (runBtn) runBtn.style.display = 'none';

    const titleEl = document.getElementById('scSuccessTitle');
    const info = document.getElementById('scResultInfo');
    const viewerBtn = document.getElementById('scOpenViewerBtn');

    if (data.kind === 'quantify') {
      if (successSection) successSection.style.display = 'none';
    } else {
      if (successSection) successSection.style.display = 'block';
      if (titleEl) {
        titleEl.textContent = data.kind === 'edit' ? 'Edits Saved' : 'Cleanup Complete';
      }
      if (viewerBtn) viewerBtn.style.display = data.outputPath ? '' : 'none';
      if (info) {
        info.innerHTML = `
          <div class="detail-row"><span class="detail-label">Output:</span>
            <span class="detail-value">${data.outputPath}</span></div>
          ${data.editedSlices != null
            ? `<div class="detail-row"><span class="detail-label">Edited slices:</span>
               <span class="detail-value">${data.editedSlices}</span></div>` : ''}`;
      }
    }

    if (this.metrics) this.renderMetrics();
  }

  renderMetrics() {
    const section = document.getElementById('scMetricsSection');
    const el = document.getElementById('scMetrics');
    if (!section || !el || !this.metrics) return;
    section.style.display = 'block';

    const hasPhysical = this.metrics.classes.some(c => c.volume != null);
    const unit = this.metrics.voxel_size?.unit === 'um' ? '&micro;m' : (this.metrics.voxel_size?.unit || '');
    const fmt = (v, digits = 2) => v == null ? '&ndash;'
      : Number(v).toLocaleString('en-US', { maximumFractionDigits: digits });

    const colorOf = (value) => this.file?.classes.find(c => c.value === value)?.color || '#999';

    el.innerHTML = `
      <div class="sc-table-scroll">
        <table class="sc-metrics-table">
          <tr>
            <th></th><th>class</th><th>voxels</th>
            ${hasPhysical ? `<th>volume (${unit}&sup3;)</th>` : ''}
            <th>objects</th><th>mean size</th><th>largest</th>
            <th>surface area${hasPhysical ? ` (${unit}&sup2;)` : ' (px&sup2;)'}</th>
          </tr>
          ${this.metrics.classes.map(c => `
            <tr>
              <td><span class="sc-color" style="background:${colorOf(c.class)}"></span></td>
              <td>${c.class}</td>
              <td>${fmt(c.voxels, 0)}</td>
              ${hasPhysical ? `<td>${fmt(c.volume)}</td>` : ''}
              <td>${fmt(c.components, 0)}</td>
              <td>${fmt(c.component_voxels.mean, 1)}</td>
              <td>${fmt(c.component_voxels.max, 0)}</td>
              <td>${fmt(c.surface_area)}</td>
            </tr>`).join('')}
        </table>
      </div>
      ${hasPhysical ? '' : '<p class="field-hint">Set a voxel size on the input file (file browser &rarr; file info) for physical units.</p>'}
    `;
    const saveBtn = document.getElementById('scSaveReportBtn');
    if (saveBtn) {
      saveBtn.disabled = this.reportSaved;
      saveBtn.textContent = this.reportSaved
        ? 'Report saved to workspace' : 'Save report (CSV) to workspace';
    }
  }

  async saveReport() {
    if (!this.reportDir) return;
    const btn = document.getElementById('scSaveReportBtn');
    if (btn) btn.disabled = true;
    try {
      const response = await fetch('/api/segcleanup/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportDir: this.reportDir,
          sourceFileId: this.file?.id || null
        })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to save report');
      this.reportSaved = true;
      this.state.notify('success',
        `Report saved (${result.files.map(f => f.name).join(', ')})`);
      if (window.workspace?.fileBrowser) window.workspace.fileBrowser.refresh();
      this.renderMetrics();
    } catch (e) {
      this.state.notify('error', `Could not save report: ${e.message}`);
      if (btn) btn.disabled = false;
    }
  }

  openResultInViewer() {
    if (!this.result?.outputPath) return;
    this.state.update('workspace.viewerFile', {
      fileId: this.result.outputFileId,
      path: this.result.outputPath,
      name: this.result.outputPath.split('/').pop(),
      source: 'segcleanup'
    });
    window.workspace.loadModule('imageviewer');
  }
}

export default SegcleanupModule;
