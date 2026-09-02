/**
 * SegcleanupModule - Segmentation Cleanup & Quantification (ADR-009)
 *
 * Two steps: Select -> Edit & Quantify. The edit step is ONE integrated
 * environment (Lucas's design, 2026-08-27 revision):
 *  - painting is always active (brush / eraser / flood fill, reusing the
 *    annotation module's AnnotationCanvas + BrushEngine + HistoryManager)
 *  - automated cleanup (merge classes, fill holes, remove small
 *    components, smooth boundaries) runs on a server-side WORKING COPY,
 *    including any unsaved paint edits; the editor reloads from the
 *    result
 *  - quantification is computed on entry and always visible below the
 *    viewer; it goes stale on edits and can be updated; "Create report"
 *    registers the CSVs in the file browser
 *  - "Save as New File" writes the current state as a tracked output
 *
 * The original file is never modified.
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
        { id: 'edit', name: 'Edit & Quantify' }
      ]
    });

    this.stepNavigator = null;
    this.fileSelector = null;
    this.resetState();
  }

  resetState() {
    // {path, name, id, slices, width, height, dtype, classes, voxelSize}
    this.file = null;
    this.underlay = null;      // {id, path, name} grayscale origin via lineage
    this.currentSlice = 0;

    // Current editing source: null = the original file; otherwise the
    // server-side working copy produced by automated cleanup / saving
    this.workingPath = null;

    // Automated-cleanup ops (consumed on Apply)
    this.ops = {
      mergeMap: {},
      fillHoles: 'off',
      minSize: 0,
      smoothRadius: 0
    };

    // Painting state
    this.canvas = null;
    this.brushEngine = null;
    this.historyManager = null;
    this.tool = 'brush';
    this.loadedSlices = new Set();
    this.editedSlices = new Set();
    this._fillHandler = null;

    // Quantification
    this.metrics = null;
    this.metricsStale = false;
    this.reportDir = null;
    this.reportSaved = false;

    this.busy = false;         // one server job at a time
    this.jobId = null;
    this.lastSaved = null;     // {outputPath, outputFileId}
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
            Pick a segmentation (or annotation mask) to edit and measure.
            All changes are saved as new files; the original is never
            modified.
          </p>

          <div id="scFileSelectorContainer"></div>
          <div id="scSelectedFile"></div>

          <div class="navigation-buttons">
            <div></div>
            <button id="scStep1Next" class="btn" disabled>Next: Edit &amp; Quantify</button>
          </div>
        </div>
      </div>
    `;
  }

  renderStep2() {
    return `
      <div id="step2" class="step-content">
        <div class="step-inner wide">
          <h3>Edit &amp; Quantify</h3>
          <p class="step-description">
            Paint corrections directly, run automated cleanup on the whole
            stack, and measure the result. Left-drag paints, right-drag or
            space+drag pans, wheel zooms.
          </p>

          <div class="section-card success-card" id="scSavedBanner" style="display: none;">
            <div class="success-header">
              <span class="success-icon">&#10003;</span>
              <span class="success-title">Saved</span>
              <span id="scSavedName" class="sc-saved-name"></span>
            </div>
            <div class="success-actions">
              <button class="btn primary small" id="scOpenViewerBtn">Open in Image Viewer</button>
            </div>
          </div>

          <div class="sc-main">
            <div class="sc-viewer-wrap">
              <div class="sc-viewer-controls">
                <div class="control-group sc-slice-group">
                  <label>Slice:</label>
                  <input type="range" class="range-slider" id="scEditSliceRange" min="0" value="0">
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
                <div class="sc-row">
                  <label>size</label>
                  <input type="range" class="range-slider" id="scBrushSize" min="1" max="100" value="10">
                  <span id="scBrushSizeVal">10px</span>
                </div>
              </div>

              <div class="toolbar-section">
                <div class="toolbar-section-title">Active class</div>
                <div id="scClassList"></div>
              </div>

              <div class="toolbar-section">
                <div class="toolbar-section-title">Automated cleanup</div>
                <div id="scClassOps"></div>
                <div class="sc-row">
                  <label>fill holes</label>
                  <select id="scFillHoles">
                    <option value="off">off</option>
                    <option value="2d">2D (per slice)</option>
                    <option value="3d">3D</option>
                  </select>
                </div>
                <div class="sc-row">
                  <label>min size</label>
                  <input type="number" id="scMinSize" min="0" step="1" value="0">
                  <span class="field-hint-inline">voxels</span>
                </div>
                <div class="sc-row">
                  <label>smooth</label>
                  <input type="range" class="range-slider" id="scSmoothRadius" min="0" max="5" step="1" value="0">
                  <span id="scSmoothVal">0</span>
                </div>
                <button class="btn small primary" id="scApplyCleanupBtn">Apply cleanup</button>
                <div class="sc-job-status" id="scCleanupStatus"></div>
                <p class="field-hint">Runs on the full stack (including your
                  unsaved paint edits) and reloads the editor.</p>
              </div>

              <div class="toolbar-section">
                <div class="toolbar-section-title">Output</div>
                <input type="text" id="scOutputName" value="cleaned" class="sc-name-input">
                <div class="sc-job-status" id="scSaveStatus"></div>
              </div>
            </div>
          </div>

          <div class="section-card sc-quant-card">
            <div class="sc-quant-header">
              <h4>Quantification</h4>
              <div class="sc-quant-actions">
                <span class="sc-stale-badge" id="scStaleBadge" style="display: none;">labels edited</span>
                <button class="btn small" id="scUpdateQuantBtn" style="display: none;">Update</button>
                <button class="btn small" id="scSaveReportBtn" disabled>Create report (CSV)</button>
              </div>
            </div>
            <div id="scQuantStatus" class="field-hint"></div>
            <div id="scMetrics"></div>
          </div>

          <div class="navigation-buttons">
            <button id="scStep2Back" class="btn secondary">Back</button>
            <button class="btn primary" id="scSaveBtn">
              <span class="btn-glyph">&#9658;</span> Save as New File
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

    // Step 1: shared FileSelector
    const fileSelectorContainer = document.getElementById('scFileSelectorContainer');
    if (fileSelectorContainer) {
      this.fileSelector = new FileSelector({
        id: 'segcleanup_source',
        // List uploads tagged 'annotation'; upload new files AS annotations
        fileType: 'uploads',
        uploadCategory: 'annotations',
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
    document.getElementById('scStep1Next')?.addEventListener('click', () => this.goToStep(2));

    // Step 2
    document.getElementById('scStep2Back')?.addEventListener('click', () => this.goToStep(1));
    document.getElementById('scSaveBtn')?.addEventListener('click', () => this.save());
    document.getElementById('scOpenViewerBtn')?.addEventListener('click', () => this.openResultInViewer());
    document.getElementById('scApplyCleanupBtn')?.addEventListener('click', () => this.applyCleanup());
    document.getElementById('scUpdateQuantBtn')?.addEventListener('click', () => this.runQuantify());
    document.getElementById('scSaveReportBtn')?.addEventListener('click', () => this.saveReport());
    this.setupEditControls();

    window.segcleanupModule = this;
  }

  async deactivate() {
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
    return this.file != null;
  }

  onStepChange(prev, next) {
    if (this.stepNavigator) this.stepNavigator.update(next);
    if (next === 2) this.enterEditStep();
  }

  // ==========================================================================
  // Step 1
  // ==========================================================================

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

      this.teardownEditor();
      this.resetState();
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
  // Step 2: integrated editor
  // ==========================================================================

  /** The file the editor currently reads labels from */
  currentSourcePath() {
    return this.workingPath || this.file.path;
  }

  /** File id (or path) whose full-res slices back the canvas image */
  editorImageFileId() {
    return this.underlay?.id || this.workingPath || this.file.id || this.file.path;
  }

  setupEditControls() {
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

    bind('scFillHoles', 'change', (e) => { this.ops.fillHoles = e.target.value; });
    bind('scMinSize', 'change', (e) => {
      this.ops.minSize = Math.max(0, parseInt(e.target.value, 10) || 0);
    });
    bind('scSmoothRadius', 'input', (e) => {
      this.ops.smoothRadius = parseInt(e.target.value, 10) || 0;
      const val = document.getElementById('scSmoothVal');
      if (val) val.textContent = String(this.ops.smoothRadius);
    });
  }

  async enterEditStep() {
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
      this.seedClasses(this.file.classes);

      this.brushEngine.onStrokeStart = () => {
        const idx = this.canvas.currentSlice;
        const data = this.brushEngine.getAnnotationData();
        if (data) this.historyManager.saveState(idx, new Uint8Array(data));
      };
      this.brushEngine.onStrokeEnd = () => this.updateHistoryButtons();
      this.brushEngine.onAnnotationChange = () => this.markEdited(this.canvas.currentSlice);
      this.brushEngine.onStrokeCancel = () => this.undo();
      this.canvas.onTwoFingerStart = () => this.brushEngine.cancelCurrentStroke();
      this.canvas.onMouseMove = (coords) => this.brushEngine.updatePreview(coords);

      this.renderClassList();
      this.renderClassOps();
      this.setTool(this.tool);
    }
    this.updateEditedInfo();
    this.updateQuantUI();
    await this.goToEditSlice(this.currentSlice);

    // Quantification runs automatically on entry
    if (!this.metrics && !this.busy) this.runQuantify();
  }

  seedClasses(classes) {
    this.brushEngine.classes = classes.map(c => ({
      id: c.value, name: `Class ${c.value}`, color: c.color, visible: true
    }));
    this.brushEngine.activeClassId = classes[0]?.value ?? 1;
    this.brushEngine.nextClassId =
      classes.length ? Math.max(...classes.map(c => c.value)) + 1 : 2;
  }

  markEdited(sliceIndex) {
    this.editedSlices.add(sliceIndex);
    this.metricsStale = true;
    this.updateEditedInfo();
    this.updateQuantUI();
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
    const url = `/api/segcleanup/label-slice?path=${encodeURIComponent(this.currentSourcePath())}&slice=${index}`;
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

    this.brushEngine.renderAnnotations();
    this.updateHistoryButtons();
    this.markEdited(idx);
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
      this.markEdited(idx);
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
      this.markEdited(idx);
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
      const parts = [];
      if (this.workingPath) parts.push('automated cleanup applied');
      if (this.editedSlices.size) {
        parts.push(`${this.editedSlices.size} slice${this.editedSlices.size > 1 ? 's' : ''} painted`);
      }
      el.textContent = parts.join(' · ') || 'No changes yet';
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

  // ---- automated cleanup ----------------------------------------------------

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

  opsActive() {
    return Object.keys(this.ops.mergeMap).length > 0
      || this.ops.fillHoles !== 'off'
      || this.ops.minSize > 0
      || this.ops.smoothRadius > 0;
  }

  collectEdits() {
    const edits = {};
    for (const idx of this.editedSlices) {
      const data = this.brushEngine?.getAllAnnotations().get(idx);
      if (data) edits[idx] = this.encodeSlice(data);
    }
    return edits;
  }

  setStatus(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '';
  }

  setBusy(busy) {
    this.busy = busy;
    ['scApplyCleanupBtn', 'scUpdateQuantBtn', 'scSaveBtn', 'scSaveReportBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = busy || (id === 'scSaveReportBtn' && !this.reportDir);
    });
  }

  async applyCleanup() {
    if (!this.file || this.busy) return;
    if (!this.opsActive()) {
      this.state.notify('info', 'Configure at least one cleanup operation first.');
      return;
    }
    this.setBusy(true);
    this._statusTarget = 'scCleanupStatus';
    this.setStatus('scCleanupStatus', 'Starting...');
    try {
      const response = await fetch('/api/segcleanup/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.currentSourcePath(),
          ops: this.buildOpsPayload(),
          edits: this.collectEdits(),
          sourceFileId: this.file.id
        })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to start cleanup');
      this.jobId = result.jobId;
      this.connectSocket();
    } catch (e) {
      this.state.notify('error', `Cleanup failed: ${e.message}`);
      this.setStatus('scCleanupStatus', '');
      this.setBusy(false);
    }
  }

  /** Apply-cleanup completed: switch the editor to the new working copy */
  async onCleanupComplete(data) {
    this.workingPath = data.workingPath;
    this.metrics = data.metrics || null;
    this.metricsStale = false;
    this.reportDir = data.reportDir || null;
    this.reportSaved = false;

    // The working copy already contains the paint edits and ops
    this.editedSlices.clear();
    this.loadedSlices.clear();
    this.brushEngine.clearAllAnnotations();
    this.historyManager.clearAllHistory();

    // Classes may have changed (merges/removals)
    if (data.classes) {
      const prevActive = this.brushEngine.activeClassId;
      this.file.classes = data.classes;
      this.seedClasses(data.classes);
      if (data.classes.some(c => c.value === prevActive)) {
        this.brushEngine.activeClassId = prevActive;
      }
      this.renderClassList();
    }

    // Ops were consumed by this run
    this.ops = { mergeMap: {}, fillHoles: 'off', minSize: 0, smoothRadius: 0 };
    this.renderClassOps();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('scFillHoles', 'off');
    set('scMinSize', 0);
    set('scSmoothRadius', 0);
    const val = document.getElementById('scSmoothVal');
    if (val) val.textContent = '0';

    this.setStatus('scCleanupStatus', '');
    this.updateEditedInfo();
    this.updateQuantUI();
    await this.goToEditSlice(this.currentSlice);
    this.state.notify('success', 'Automated cleanup applied.');
  }

  // ---- quantification -------------------------------------------------------

  async runQuantify() {
    if (!this.file || this.busy) return;
    this.setBusy(true);
    this._statusTarget = 'scQuantStatus';
    this.setStatus('scQuantStatus', 'Computing quantification...');
    try {
      const response = await fetch('/api/segcleanup/quantify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.currentSourcePath(),
          edits: this.collectEdits(),
          sourceFileId: this.file.id
        })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to start quantification');
      this.jobId = result.jobId;
      this.connectSocket();
    } catch (e) {
      this.state.notify('error', `Quantification failed: ${e.message}`);
      this.setStatus('scQuantStatus', '');
      this.setBusy(false);
    }
  }

  updateQuantUI() {
    const stale = document.getElementById('scStaleBadge');
    const update = document.getElementById('scUpdateQuantBtn');
    const report = document.getElementById('scSaveReportBtn');
    if (stale) stale.style.display = this.metricsStale && this.metrics ? '' : 'none';
    if (update) update.style.display = this.metricsStale && this.metrics ? '' : 'none';
    if (report) {
      report.disabled = this.busy || !this.reportDir;
      report.textContent = this.reportSaved
        ? 'Report saved to workspace' : 'Create report (CSV)';
    }
    this.renderMetrics();
  }

  renderMetrics() {
    const el = document.getElementById('scMetrics');
    if (!el) return;
    if (!this.metrics) {
      el.innerHTML = '';
      return;
    }

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
  }

  async saveReport() {
    if (!this.reportDir || this.busy) return;
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
      this.updateQuantUI();
    } catch (e) {
      this.state.notify('error', `Could not save report: ${e.message}`);
      if (btn) btn.disabled = false;
    }
  }

  // ---- save -----------------------------------------------------------------

  async save() {
    if (!this.file || this.busy) return;
    const edits = this.collectEdits();
    if (!Object.keys(edits).length && !this.workingPath) {
      this.state.notify('info', 'No changes to save yet.');
      return;
    }
    this.setBusy(true);
    this._statusTarget = 'scSaveStatus';
    this.setStatus('scSaveStatus', 'Saving...');
    try {
      const response = await fetch('/api/segcleanup/save-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.currentSourcePath(),
          width: this.file.width,
          height: this.file.height,
          edits,
          outputName: document.getElementById('scOutputName')?.value || 'cleaned',
          sourceFileId: this.file.id
        })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to start saving');
      this.jobId = result.jobId;
      this.connectSocket();
    } catch (e) {
      this.state.notify('error', `Save failed: ${e.message}`);
      this.setStatus('scSaveStatus', '');
      this.setBusy(false);
    }
  }

  onSaveComplete(data) {
    this.lastSaved = { outputPath: data.outputPath, outputFileId: data.outputFileId };
    // Continue editing on top of the saved (tracked) file
    this.workingPath = data.outputPath;
    this.editedSlices.clear();
    this.setStatus('scSaveStatus', '');
    this.updateEditedInfo();

    const banner = document.getElementById('scSavedBanner');
    const name = document.getElementById('scSavedName');
    if (banner) banner.style.display = '';
    if (name) name.textContent = data.outputPath.split('/').pop();

    this.fileSelector?.refresh();
    if (window.workspace?.fileBrowser) window.workspace.fileBrowser.refresh();
    this.state.notify('success', `Saved: ${data.outputPath.split('/').pop()}`);
  }

  // ---- socket ---------------------------------------------------------------

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
      const text = data.current_slice != null
        ? `Slice ${data.current_slice} of ${data.total_slices}`
        : (data.stage || '');
      if (this._statusTarget) this.setStatus(this._statusTarget, text);
    });
    this.socket.on('segcleanup-complete', async (data) => {
      this.setBusy(false);
      if (!data.success) {
        this.state.notify('error', `Failed: ${data.error || 'unknown error'}`);
        this.setStatus('scCleanupStatus', '');
        this.setStatus('scQuantStatus', '');
        this.setStatus('scSaveStatus', '');
        return;
      }
      if (data.kind === 'apply') {
        await this.onCleanupComplete(data);
      } else if (data.kind === 'quantify') {
        this.metrics = data.metrics || null;
        this.metricsStale = false;
        this.reportDir = data.reportDir || null;
        this.reportSaved = false;
        this.setStatus('scQuantStatus', '');
        this.updateQuantUI();
      } else if (data.kind === 'edit') {
        this.onSaveComplete(data);
      }
      this.setBusy(false);
    });
    this.socket.on('segcleanup-error', (data) => {
      this.state.notify('error', `Error: ${data.message}`);
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

  openResultInViewer() {
    if (!this.lastSaved?.outputPath) return;
    this.state.update('workspace.viewerFile', {
      fileId: this.lastSaved.outputFileId,
      path: this.lastSaved.outputPath,
      name: this.lastSaved.outputPath.split('/').pop(),
      source: 'segcleanup'
    });
    window.workspace.loadModule('imageviewer');
  }
}

export default SegcleanupModule;
