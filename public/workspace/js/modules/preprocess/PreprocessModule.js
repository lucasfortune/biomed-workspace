/**
 * PreprocessModule - Stack Preprocessing (ADR-008)
 *
 * Prepares image stacks for the downstream pipeline: crop (xy + z-range),
 * flip/rotate, downscale (mean binning), intensity adjustment
 * (histogram window / gamma / invert) and bit-depth conversion.
 *
 * All operations are non-destructive: the result is written as a new
 * tracked file with lineage (including the crop origin, which feeds the
 * stitching module's recipe prefill). The intensity ops are previewed
 * live on the current slice; crop is drawn as an overlay; geometric ops
 * apply on output.
 *
 * Fixed operation order:
 *   crop -> z-trim -> flips -> rotate -> downscale -> intensity -> dtype
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, SliceViewerChrome } from '/workspace/js/core/components/index.js';
import ParameterValidator from '/workspace/js/core/utils/ParameterValidator.js';
import FormValidationController from '/workspace/js/core/utils/FormValidationController.js';

class PreprocessModule extends BaseModule {

  constructor(stateManager) {
    super(stateManager, {
      id: 'preprocess',
      name: 'Preprocessing',
      cssPath: '/workspace/js/modules/preprocess/css/preprocess.css',
      steps: [
        { id: 'select', name: 'Select Stack' },
        { id: 'adjust', name: 'Adjust' },
        { id: 'apply', name: 'Apply' }
      ]
    });

    this.stepNavigator = null;
    this.fileSelector = null;
    this.resetState();
  }

  resetState() {
    this.file = null;          // {path, name, id, slices, width, height, dtype, voxelSize}
    this.info = null;          // /api/preprocess/info payload (histogram etc.)
    this.currentSlice = 0;

    this.ops = {
      crop: null,              // {x, y, width, height} in original coords
      zRange: null,            // [first, lastExclusive]
      flipH: false,
      flipV: false,
      rotate90: 0,             // k * 90 degrees clockwise
      downscale: 1,
      window: null,            // [lo, hi] raw intensity values
      gamma: 1.0,
      invert: false,
      outDtype: 'keep'
    };

    this.viewer = {
      img: null, imgUrl: null,
      scale: 1, offX: 0, offY: 0,   // fit transform (image -> canvas)
      cropMode: false, cropDragging: false,
      cropStart: null,
      histDrag: null                // 'lo' | 'hi' while dragging a marker
    };

    this._previewTimer = null;
    this._previewSeq = 0;
    this.preprocessId = null;
    this.result = null;
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================

  render() {
    this.container.innerHTML = `
      <div class="preprocess-module module-container">
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

  /** Help icon linking to an info-panel article (see workspace.js delegated handler). */
  renderHelpIcon(articleId) {
    return `<span class="help-icon" data-info-id="${articleId}" title="Click for help">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
      </svg>
    </span>`;
  }

  renderStep1() {
    return `
      <div id="step1" class="step-content active">
        <div class="step-inner">
          <h3>Select Stack ${this.renderHelpIcon('preprocess.step1.stack')}</h3>
          <p class="step-description">
            Pick the image stack to preprocess. The result is saved as a new
            file; the original is never modified.
          </p>

          <!-- File Selector Container (shared FileSelector component) -->
          <div id="ppFileSelectorContainer"></div>

          <div id="ppSelectedFile"></div>
          <p class="field-hint">
            Grayscale stacks only (raw uploads and processing results).
            Segmentations get their own operations in the segmentation
            cleanup module.
          </p>

          <div class="navigation-buttons">
            <div></div>
            <button id="ppStep1Next" class="btn" disabled>Next: Adjust</button>
          </div>
        </div>
      </div>
    `;
  }

  renderStep2() {
    this.chrome = new SliceViewerChrome({
      slices: this.file?.slices || 1,
      slice: this.currentSlice,
      showZoom: false,
      isActive: () => this.currentStep === 2 && !!this.file,
      onSliceChange: (i) => {
        this.currentSlice = i;
        this.chrome.setSlice(i);
        this.requestPreview();
      },
      onResize: () => this.drawCanvas()
    });
    return `
      <div id="step2" class="step-content">
        <div class="step-inner wide">
          <h3>Adjust</h3>
          <p class="step-description">
            Intensity changes preview live on the current slice. The crop
            rectangle is drawn on the image; flips, rotation and downscaling
            are applied when the output is written.
          </p>

          <div class="sv-main">
            ${this.chrome.render()}

            <div class="sv-toolbar">
              <div class="sv-section">
                <div class="sv-section-header"><h4>Crop</h4>${this.renderHelpIcon('preprocess.step2.crop')}</div>
                <div class="sv-row">
                  <button class="btn small" id="ppCropDrawBtn">Draw on image</button>
                  <button class="btn small secondary" id="ppCropClearBtn">Clear</button>
                </div>
                <div class="pp-grid2">
                  <span data-field-group>x <input type="number" id="ppCropX" min="0" step="1"></span>
                  <span data-field-group>y <input type="number" id="ppCropY" min="0" step="1"></span>
                  <span data-field-group>w <input type="number" id="ppCropW" min="1" step="1"></span>
                  <span data-field-group>h <input type="number" id="ppCropH" min="1" step="1"></span>
                </div>
              </div>

              <div class="sv-section">
                <div class="sv-section-header"><h4>Z range</h4>${this.renderHelpIcon('preprocess.step2.crop')}</div>
                <div class="pp-grid2">
                  <span>first <input type="number" id="ppZFrom" min="1" step="1"></span>
                  <span>last <input type="number" id="ppZTo" min="1" step="1"></span>
                </div>
                <p class="field-hint">Inclusive slice numbers (1-based); leave untouched to keep the whole stack.</p>
              </div>

              <div class="sv-section">
                <div class="sv-section-header"><h4>Geometry</h4>${this.renderHelpIcon('preprocess.step2.geometry')}</div>
                <label class="checkbox-inline"><input type="checkbox" id="ppFlipH"> flip horizontal</label>
                <label class="checkbox-inline"><input type="checkbox" id="ppFlipV"> flip vertical</label>
                <div class="sv-row">
                  <label>rotate</label>
                  <select id="ppRotate">
                    <option value="0">none</option>
                    <option value="1">90&deg; cw</option>
                    <option value="2">180&deg;</option>
                    <option value="3">90&deg; ccw</option>
                  </select>
                </div>
                <div class="sv-row">
                  <label>downscale</label>
                  <select id="ppDownscale">
                    <option value="1">none</option>
                    <option value="2">2&times; (bin 2&times;2)</option>
                    <option value="4">4&times;</option>
                    <option value="8">8&times;</option>
                  </select>
                </div>
              </div>

              <div class="sv-section">
                <div class="sv-section-header"><h4>Intensity</h4>${this.renderHelpIcon('preprocess.step2.intensity')}</div>
                <canvas id="ppHistCanvas" width="258" height="90"></canvas>
                <div class="pp-grid2">
                  <span>min <input type="number" id="ppWinLo" step="any"></span>
                  <span>max <input type="number" id="ppWinHi" step="any"></span>
                </div>
                <div class="sv-row">
                  <button class="btn small" id="ppAuto1Btn" title="Window at the 1% / 99% percentiles">Auto 1%</button>
                  <button class="btn small" id="ppAuto01Btn" title="Window at the 0.1% / 99.9% percentiles">Auto 0.1%</button>
                  <button class="btn small secondary" id="ppIntensityResetBtn">Reset</button>
                </div>
                <div class="sv-row">
                  <label>gamma</label>
                  <input type="range" class="range-slider" id="ppGamma" min="0.2" max="3" step="0.05" value="1">
                  <span class="sv-row-value" id="ppGammaVal">1.00</span>
                </div>
                <label class="checkbox-inline"><input type="checkbox" id="ppInvert"> invert</label>
                <p class="field-hint">Gamma &lt; 1 brightens dark regions.</p>
              </div>

              <div class="sv-section">
                <div class="sv-section-header"><h4>Output</h4>${this.renderHelpIcon('preprocess.step2.output')}</div>
                <div class="sv-row">
                  <label>data type</label>
                  <select id="ppOutDtype">
                    <option value="keep">keep</option>
                    <option value="uint8">8-bit</option>
                    <option value="uint16">16-bit</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="navigation-buttons">
            <button id="ppStep2Back" class="btn secondary">Back</button>
            <button id="ppStep2Next" class="btn">Next: Apply</button>
          </div>
        </div>
      </div>
    `;
  }

  renderStep3() {
    return `
      <div id="step3" class="step-content">
        <div class="step-inner">
          <h3>Apply ${this.renderHelpIcon('preprocess.step3.apply')}</h3>
          <p class="step-description">
            Review the operations and write the preprocessed stack as a new
            workspace file.
          </p>

          <div class="section-card">
            <h4>Summary</h4>
            <div id="ppSummary"></div>
          </div>

          <div class="section-card">
            <h4>Output</h4>
            <div class="form-field">
              <label for="ppOutputName">Output name</label>
              <input type="text" id="ppOutputName" value="preprocessed">
            </div>
          </div>

          <div class="section-card" id="ppProgressSection" style="display: none;">
            <h4>Progress</h4>
            <div class="inference-status" id="ppStatusText">Starting...</div>
            <div class="progress-bar-container">
              <div class="job-progress-fill" id="ppProgressBar" style="width: 0%"></div>
            </div>
          </div>

          <div class="section-card success-card" id="ppSuccessSection" style="display: none;">
            <div class="success-header">
              <span class="success-icon">&#10003;</span>
              <span class="success-title">Preprocessing Complete</span>
            </div>
            <div id="ppResultInfo"></div>
            <div class="success-actions">
              <button class="btn primary" id="ppOpenViewerBtn">Open in Image Viewer</button>
              <button class="btn secondary" id="ppNewRunBtn">Start New Run</button>
            </div>
          </div>

          <div class="navigation-buttons">
            <button id="ppStep3Back" class="btn secondary">Back</button>
            <button class="btn primary" id="ppApplyBtn">
              <span class="btn-glyph">&#9658;</span> Apply
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

    // Step 1: shared FileSelector component (same setup as the annotation
    // module - single file, dropdown + upload button)
    const fileSelectorContainer = document.getElementById('ppFileSelectorContainer');
    if (fileSelectorContainer) {
      this.fileSelector = new FileSelector({
        id: 'preprocess_source',
        fileType: 'uploads',
        filterTags: ['raw'],
        title: 'Image Stack',
        helpIconHtml: this.renderHelpIcon('preprocess.step1.stack'),
        icon: 'image',
        accept: '.tif,.tiff',
        showRecentResults: true,
        stateManager: this.state,
        onSelect: (file) => this.onFileSelected(file),
        onUpload: (rawFile, uploadedFile) => this.onFileSelected(uploadedFile),
        // Recent Results: grayscale data results (denoised, stitched,
        // preprocessed) - segmentations are excluded
        resultCategories: ['results', 'denoised_images'],
        resultCategoryLabels: {
          'results': 'Result',
          'denoised_images': 'Denoised'
        },
        filterRecentResults: (files) => files.filter(f => {
          if (f.category === 'results') {
            const tags = f.tags || [];
            return tags.includes('data') && !tags.includes('segmentation');
          }
          return f.category === 'denoised_images';
        }),
        // Workspace files: raw uploads only
        filterFiles: (files) => files.filter(f =>
          f.category === 'uploads' && (f.tags || []).includes('raw'))
      });
      fileSelectorContainer.innerHTML = this.fileSelector.render();
      await this.fileSelector.init();
    }
    document.getElementById('ppStep1Next')?.addEventListener('click', () => this.goToStep(2));

    // Step 2
    document.getElementById('ppStep2Back')?.addEventListener('click', () => this.goToStep(1));
    document.getElementById('ppStep2Next')?.addEventListener('click', () => this.goToStep(3));
    this.setupAdjustControls();

    // Step 3
    document.getElementById('ppStep3Back')?.addEventListener('click', () => this.goToStep(2));
    document.getElementById('ppApplyBtn')?.addEventListener('click', () => this.apply());
    document.getElementById('ppOpenViewerBtn')?.addEventListener('click', () => this.openResultInViewer());
    document.getElementById('ppNewRunBtn')?.addEventListener('click', async () => {
      this.resetState();
      this.renderSelectedFile();
      if (this.fileSelector) {
        this.fileSelector.selectedFile = null;
        await this.fileSelector.refresh();
        const dropdown = document.getElementById(`${this.fileSelector.id}-select`);
        if (dropdown) dropdown.value = '';
        this.fileSelector.hidePreview();
      }
      this.goToStep(1);
    });

    window.preprocessModule = this;
  }

  async deactivate() {
    clearTimeout(this._previewTimer);
    this.chrome?.destroy();
    if (this.viewer.imgUrl) URL.revokeObjectURL(this.viewer.imgUrl);
    if (this.socket && this.preprocessId) {
      this.socket.emit('leave-preprocess', this.preprocessId);
    }
    // Leaving the module starts fresh next time (user preference)
    this.formValidationController?.destroy();
    this.formValidationController = null;
    this.applyRunning = false;
    this.resetState();
    this.fileSelector = null;
    try { delete window.preprocessModule; } catch (e) { window.preprocessModule = undefined; }
    await super.deactivate();
  }

  canNavigateToStep(n) {
    if (n === 1) return true;
    return this.file != null;
  }

  onStepChange(prev, next) {
    if (this.stepNavigator) this.stepNavigator.update(next);
    if (next === 2) this.enterAdjustStep();
    if (next === 3) this.renderSummary();
  }

  // ==========================================================================
  // Step 1: file selection
  // ==========================================================================

  /**
   * FileSelector callback: a workspace file was selected (or deselected).
   * Reads the stack info + histogram before enabling the Adjust step.
   */
  async onFileSelected(file) {
    const next = document.getElementById('ppStep1Next');
    if (next) next.disabled = true;

    if (!file || !file.path) {
      this.resetState();
      this.renderSelectedFile();
      return;
    }

    try {
      const response = await fetch(`/api/preprocess/info?path=${encodeURIComponent(file.path)}`);
      const info = await response.json();
      if (!info.success) throw new Error(info.error || 'Could not read stack info');

      this.resetState();
      this.file = {
        path: file.path,
        name: file.name || file.path.split('/').pop(),
        id: file.id || null,
        voxelSize: file.voxelSize || null,
        slices: info.sliceCount,
        width: info.width,
        height: info.height,
        dtype: info.dtype
      };
      this.info = info;
      this.currentSlice = Math.floor(info.sliceCount / 2);
      this.renderSelectedFile();
      if (next) next.disabled = false;
    } catch (e) {
      this.state.notify('error', `Could not select stack: ${e.message}`);
      this.renderSelectedFile();
    }
  }

  renderSelectedFile() {
    const el = document.getElementById('ppSelectedFile');
    if (!el) return;
    if (!this.file) {
      el.innerHTML = '';
      const next = document.getElementById('ppStep1Next');
      if (next) next.disabled = true;
      return;
    }
    const vs = this.file.voxelSize;
    const vsText = vs && vs.x
      ? `${vs.x} &times; ${vs.y}${vs.z != null ? ` &times; ${vs.z}` : ''} ${vs.unit === 'um' ? '&micro;m' : (vs.unit || '')}`
      : 'not set';
    el.innerHTML = `
      <div class="stack-item">
        <span class="stack-name">${this.file.name}</span>
        <span class="stack-dims">${this.file.width}&times;${this.file.height},
          ${this.file.slices} slices, ${this.file.dtype}, voxel size: ${vsText}</span>
      </div>
    `;
  }

  // ==========================================================================
  // Step 2: adjust
  // ==========================================================================

  enterAdjustStep() {
    if (!this.file) return;

    const setup = (id, value, max) => {
      const el = document.getElementById(id);
      if (el) { if (max != null) el.max = max; el.value = value; }
    };
    this.chrome.setSlice(this.currentSlice, this.file.slices);

    const [z0, z1] = this.ops.zRange || [0, this.file.slices];
    setup('ppZFrom', z0 + 1, this.file.slices);
    setup('ppZTo', z1, this.file.slices);

    this.syncCropInputs();
    this.syncIntensityInputs();
    this.chrome.setFooter(
      `${this.file.name} · ${this.file.width} × ${this.file.height} px · ${this.file.slices} slices · ${this.file.dtype}`);
    this.updateCropHint();
    this.requestPreview(true);
    this.drawHistogram();
  }

  setupAdjustControls() {
    const bind = (id, evt, fn) => document.getElementById(id)?.addEventListener(evt, fn);

    // Shared viewer chrome (slice nav, status overlay, footer); the
    // preview canvas lives in its canvas host
    this.chrome.mount(document.getElementById('step2'));
    const previewCanvas = document.createElement('canvas');
    previewCanvas.id = 'ppCanvas';
    this.chrome.area.appendChild(previewCanvas);

    // Crop
    bind('ppCropDrawBtn', 'click', () => this.toggleCropMode());
    bind('ppCropClearBtn', 'click', () => {
      this.ops.crop = null;
      this.setCropMode(false);
      this.syncCropInputs();
      this.drawCanvas();
    });
    const onCropInput = () => {
      const num = (id) => parseInt(document.getElementById(id)?.value, 10);
      const x = num('ppCropX'), y = num('ppCropY'), w = num('ppCropW'), h = num('ppCropH');
      if ([x, y, w, h].some(v => isNaN(v))) return;
      // Out-of-range values stay in the field with their message; the crop
      // keeps its previous value until the entry is fixed
      if (this.formValidationController && !this.formValidationController.validateAll()) return;
      this.ops.crop = this.clampCrop({ x, y, width: w, height: h });
      this.syncCropInputs();
      this.drawCanvas();
    };
    ['ppCropX', 'ppCropY', 'ppCropW', 'ppCropH'].forEach(id => bind(id, 'change', onCropInput));
    this._initParamValidation();

    // Z range
    const onZ = () => {
      if (!this.file) return;
      // Inputs are 1-based (decision 4); ops.zRange stays [first, lastExclusive] 0-based
      const from = parseInt(document.getElementById('ppZFrom')?.value, 10) - 1;
      const to = parseInt(document.getElementById('ppZTo')?.value, 10) - 1;
      if (isNaN(from) || isNaN(to)) return;
      const z0 = Math.max(0, Math.min(from, this.file.slices - 1));
      const z1 = Math.max(z0 + 1, Math.min(to + 1, this.file.slices));
      this.ops.zRange = (z0 === 0 && z1 === this.file.slices) ? null : [z0, z1];
      document.getElementById('ppZFrom').value = z0 + 1;
      document.getElementById('ppZTo').value = z1;
    };
    bind('ppZFrom', 'change', onZ);
    bind('ppZTo', 'change', onZ);

    // Geometry
    bind('ppFlipH', 'change', (e) => { this.ops.flipH = e.target.checked; });
    bind('ppFlipV', 'change', (e) => { this.ops.flipV = e.target.checked; });
    bind('ppRotate', 'change', (e) => { this.ops.rotate90 = parseInt(e.target.value, 10) || 0; });
    bind('ppDownscale', 'change', (e) => { this.ops.downscale = parseInt(e.target.value, 10) || 1; });

    // Intensity
    const onWindow = () => {
      const lo = parseFloat(document.getElementById('ppWinLo')?.value);
      const hi = parseFloat(document.getElementById('ppWinHi')?.value);
      if (isNaN(lo) || isNaN(hi)) return;
      this.ops.window = [Math.min(lo, hi), Math.max(lo, hi, Math.min(lo, hi) + 1e-9)];
      this.drawHistogram();
      this.requestPreview();
    };
    bind('ppWinLo', 'change', onWindow);
    bind('ppWinHi', 'change', onWindow);
    bind('ppAuto1Btn', 'click', () => this.autoWindow('1.0', '99.0'));
    bind('ppAuto01Btn', 'click', () => this.autoWindow('0.1', '99.9'));
    bind('ppIntensityResetBtn', 'click', () => {
      this.ops.window = null;
      this.ops.gamma = 1.0;
      this.ops.invert = false;
      this.syncIntensityInputs();
      this.drawHistogram();
      this.requestPreview();
    });
    bind('ppGamma', 'input', (e) => {
      this.ops.gamma = parseFloat(e.target.value) || 1.0;
      const val = document.getElementById('ppGammaVal');
      if (val) val.textContent = this.ops.gamma.toFixed(2);
      this.requestPreview();
    });
    bind('ppInvert', 'change', (e) => {
      this.ops.invert = e.target.checked;
      this.requestPreview();
    });

    this.setupCanvasEvents();
    this.setupHistogramEvents();
  }

  /**
   * Field-level validation of the typed crop rectangle against the stack
   * size. Apply stays disabled while a field is out of range.
   */
  _initParamValidation() {
    this.formValidationController?.destroy();
    this.paramValidator = new ParameterValidator();
    this.formValidationController = new FormValidationController(this.paramValidator, {
      fieldSelector: '.form-field, [data-field-group]',
      onValidationChange: (allValid) => {
        const applyBtn = document.getElementById('ppApplyBtn');
        if (applyBtn && !this.applyRunning) applyBtn.disabled = !allValid;
      }
    });
    const form = document.getElementById('step2');
    if (form) this.formValidationController.attachTo(form);

    const typed = (id) => parseInt(document.getElementById(id)?.value, 10) || 0;
    // Empty fields mean "no crop" and are fine; a typed value must be a
    // whole number inside the stack
    const rule = (label, min, max) => (value) => {
      if (value === '' || value == null) return { valid: true, error: null };
      const n = Number(value);
      if (!Number.isInteger(n)) return { valid: false, error: `${label} must be a whole number` };
      return max == null ? { valid: true, error: null }
        : this.paramValidator.validateRange(n, min, max, label);
    };
    const W = () => this.file?.width, H = () => this.file?.height;
    this.formValidationController.addFieldRule('ppCropX', (v) => rule('x', 0, W() != null ? W() - 1 : null)(v));
    this.formValidationController.addFieldRule('ppCropY', (v) => rule('y', 0, H() != null ? H() - 1 : null)(v));
    this.formValidationController.addFieldRule('ppCropW', (v) => rule('w', 1, W() != null ? W() - typed('ppCropX') : null)(v));
    this.formValidationController.addFieldRule('ppCropH', (v) => rule('h', 1, H() != null ? H() - typed('ppCropY') : null)(v));
  }

  clampCrop(crop) {
    if (!this.file) return crop;
    const x = Math.max(0, Math.min(crop.x, this.file.width - 1));
    const y = Math.max(0, Math.min(crop.y, this.file.height - 1));
    return {
      x, y,
      width: Math.max(1, Math.min(crop.width, this.file.width - x)),
      height: Math.max(1, Math.min(crop.height, this.file.height - y))
    };
  }

  syncCropInputs() {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v == null ? '' : v;
    };
    const c = this.ops.crop;
    set('ppCropX', c?.x); set('ppCropY', c?.y);
    set('ppCropW', c?.width); set('ppCropH', c?.height);
  }

  syncIntensityInputs() {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v == null ? '' : v;
    };
    set('ppWinLo', this.ops.window ? this.round3(this.ops.window[0]) : '');
    set('ppWinHi', this.ops.window ? this.round3(this.ops.window[1]) : '');
    const gamma = document.getElementById('ppGamma');
    if (gamma) gamma.value = this.ops.gamma;
    const gval = document.getElementById('ppGammaVal');
    if (gval) gval.textContent = this.ops.gamma.toFixed(2);
    const inv = document.getElementById('ppInvert');
    if (inv) inv.checked = this.ops.invert;
  }

  round3(v) { return Math.round(v * 1000) / 1000; }

  autoWindow(pLo, pHi) {
    const p = this.info?.percentiles;
    if (!p) return;
    this.ops.window = [p[pLo], Math.max(p[pHi], p[pLo] + 1e-9)];
    this.syncIntensityInputs();
    this.drawHistogram();
    this.requestPreview();
  }

  // ---- crop drawing ---------------------------------------------------------

  toggleCropMode() { this.setCropMode(!this.viewer.cropMode); }

  setCropMode(on) {
    this.viewer.cropMode = on;
    document.getElementById('ppCropDrawBtn')?.classList.toggle('active', on);
    const canvas = document.getElementById('ppCanvas');
    if (canvas) canvas.style.cursor = on ? 'crosshair' : 'default';
    this.updateCropHint();
  }

  updateCropHint() {
    this.chrome?.setFooter(undefined, this.viewer.cropMode
      ? 'drag on the image to draw the crop rectangle'
      : '');
  }

  canvasToImage(e) {
    const canvas = document.getElementById('ppCanvas');
    const rect = canvas.getBoundingClientRect();
    const v = this.viewer;
    return {
      x: (e.clientX - rect.left - v.offX) / v.scale,
      y: (e.clientY - rect.top - v.offY) / v.scale
    };
  }

  setupCanvasEvents() {
    const canvas = document.getElementById('ppCanvas');
    if (!canvas) return;

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.viewer.cropMode || e.button !== 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.viewer.cropDragging = true;
      this.viewer.cropStart = this.canvasToImage(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.viewer.cropDragging) return;
      const start = this.viewer.cropStart;
      const cur = this.canvasToImage(e);
      this.ops.crop = this.clampCrop({
        x: Math.round(Math.min(start.x, cur.x)),
        y: Math.round(Math.min(start.y, cur.y)),
        width: Math.round(Math.abs(cur.x - start.x)),
        height: Math.round(Math.abs(cur.y - start.y))
      });
      this.syncCropInputs();
      this.drawCanvas();
    });
    const up = () => {
      if (this.viewer.cropDragging) {
        this.viewer.cropDragging = false;
        this.setCropMode(false);
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  // ---- preview --------------------------------------------------------------

  requestPreview(immediate = false) {
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => this.loadPreview(),
      immediate ? 0 : 300);
  }

  async loadPreview() {
    if (!this.file) return;
    const seq = ++this._previewSeq;
    if (!this.viewer.img) this.chrome.setStatus('Loading preview…');
    try {
      const response = await fetch('/api/preprocess/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.file.path,
          slice: this.currentSlice,
          ops: {
            intensity: {
              window: this.ops.window,
              gamma: this.ops.gamma,
              invert: this.ops.invert
            }
          }
        })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Preview failed (${response.status})`);
      }
      const blob = await response.blob();
      if (seq !== this._previewSeq) return;  // superseded by a newer request

      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('preview decode failed'));
        img.src = url;
      });
      if (seq !== this._previewSeq) { URL.revokeObjectURL(url); return; }

      if (this.viewer.imgUrl) URL.revokeObjectURL(this.viewer.imgUrl);
      this.viewer.img = img;
      this.viewer.imgUrl = url;
      this.chrome.setStatus(null);
      this.drawCanvas();
    } catch (e) {
      if (seq !== this._previewSeq) return;
      this.chrome.setStatus(`Could not load preview: ${e.message}`, true);
    }
  }

  drawCanvas() {
    const canvas = document.getElementById('ppCanvas');
    const v = this.viewer;
    if (!canvas || !v.img || !this.file) return;

    const wrap = canvas.parentElement;
    canvas.width = wrap.clientWidth;
    canvas.height = Math.max(420, wrap.clientHeight || 0, Math.round(wrap.clientWidth * 0.6));

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);   // --module-viewer-bg shows through

    // Fit transform maps ORIGINAL image coords -> canvas (the preview JPEG
    // may be downsampled, so scale via the original width)
    const fit = Math.min(canvas.width / this.file.width,
      canvas.height / this.file.height) * 0.97;
    v.scale = fit;
    v.offX = (canvas.width - this.file.width * fit) / 2;
    v.offY = (canvas.height - this.file.height * fit) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(v.img, v.offX, v.offY,
      this.file.width * fit, this.file.height * fit);

    // Crop overlay: dim the outside, outline the kept region
    const c = this.ops.crop;
    if (c) {
      const rx = v.offX + c.x * fit;
      const ry = v.offY + c.y * fit;
      const rw = c.width * fit;
      const rh = c.height * fit;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.rect(v.offX, v.offY, this.file.width * fit, this.file.height * fit);
      ctx.rect(rx, ry, rw, rh);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#EB1F17';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }
  }

  // ---- histogram ------------------------------------------------------------

  histRange() {
    const h = this.info?.histogram;
    if (!h) return null;
    return {
      lo: h.binStart,
      hi: h.binStart + h.binWidth * h.counts.length
    };
  }

  histValueToX(value, width) {
    const r = this.histRange();
    return ((value - r.lo) / (r.hi - r.lo)) * width;
  }

  histXToValue(x, width) {
    const r = this.histRange();
    return r.lo + (x / width) * (r.hi - r.lo);
  }

  drawHistogram() {
    const canvas = document.getElementById('ppHistCanvas');
    const h = this.info?.histogram;
    if (!canvas || !h) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Log-scaled counts read better for EM histograms
    const maxLog = Math.log1p(Math.max(...h.counts, 1));
    const barW = W / h.counts.length;
    ctx.fillStyle = 'rgba(120, 120, 120, 0.8)';
    for (let i = 0; i < h.counts.length; i++) {
      const bh = (Math.log1p(h.counts[i]) / maxLog) * (H - 4);
      ctx.fillRect(i * barW, H - bh, Math.max(1, barW), bh);
    }

    // Window markers
    const r = this.histRange();
    const [lo, hi] = this.ops.window || [r.lo, r.hi];
    const xLo = this.histValueToX(lo, W);
    const xHi = this.histValueToX(hi, W);
    ctx.fillStyle = 'rgba(235, 31, 23, 0.12)';
    ctx.fillRect(xLo, 0, Math.max(1, xHi - xLo), H);
    ctx.strokeStyle = '#EB1F17';
    ctx.lineWidth = 2;
    for (const x of [xLo, xHi]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }

  setupHistogramEvents() {
    const canvas = document.getElementById('ppHistCanvas');
    if (!canvas) return;

    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return (e.clientX - rect.left) * (canvas.width / rect.width);
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.info) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const r = this.histRange();
      const [lo, hi] = this.ops.window || [r.lo, r.hi];
      const x = pos(e);
      const dLo = Math.abs(x - this.histValueToX(lo, canvas.width));
      const dHi = Math.abs(x - this.histValueToX(hi, canvas.width));
      this.viewer.histDrag = dLo <= dHi ? 'lo' : 'hi';
      this.dragHistMarker(x);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.viewer.histDrag) this.dragHistMarker(pos(e));
    });
    const up = () => {
      if (this.viewer.histDrag) {
        this.viewer.histDrag = null;
        this.requestPreview();
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  dragHistMarker(x) {
    const canvas = document.getElementById('ppHistCanvas');
    const r = this.histRange();
    if (!canvas || !r) return;
    const value = Math.max(r.lo, Math.min(r.hi,
      this.histXToValue(x, canvas.width)));
    let [lo, hi] = this.ops.window || [r.lo, r.hi];
    if (this.viewer.histDrag === 'lo') lo = Math.min(value, hi);
    else hi = Math.max(value, lo);
    this.ops.window = [lo, hi];
    this.syncIntensityInputs();
    this.drawHistogram();
  }

  // ==========================================================================
  // Step 3: apply
  // ==========================================================================

  /** Output dimensions after crop -> rotate -> downscale */
  outputDims() {
    const c = this.ops.crop;
    let w = c ? c.width : this.file.width;
    let h = c ? c.height : this.file.height;
    if (this.ops.rotate90 % 2 === 1) [w, h] = [h, w];
    const f = this.ops.downscale;
    if (f > 1) { w = Math.floor(w / f); h = Math.floor(h / f); }
    const [z0, z1] = this.ops.zRange || [0, this.file.slices];
    return { w, h, slices: z1 - z0 };
  }

  activeOpsList() {
    const items = [];
    const o = this.ops;
    if (o.crop) items.push(`Crop to ${o.crop.width}&times;${o.crop.height} at (${o.crop.x}, ${o.crop.y})`);
    if (o.zRange) items.push(`Keep slices ${o.zRange[0] + 1}&ndash;${o.zRange[1]}`);
    if (o.flipH) items.push('Flip horizontal');
    if (o.flipV) items.push('Flip vertical');
    if (o.rotate90) items.push(`Rotate ${[null, '90&deg; cw', '180&deg;', '90&deg; ccw'][o.rotate90]}`);
    if (o.downscale > 1) items.push(`Downscale ${o.downscale}&times; (mean binning)`);
    if (o.window) items.push(`Intensity window [${this.round3(o.window[0])}, ${this.round3(o.window[1])}]`);
    if (o.gamma !== 1.0) items.push(`Gamma ${o.gamma.toFixed(2)}`);
    if (o.invert) items.push('Invert');
    if (o.outDtype !== 'keep') items.push(`Convert to ${o.outDtype === 'uint8' ? '8-bit' : '16-bit'}`);
    return items;
  }

  renderSummary() {
    const el = document.getElementById('ppSummary');
    if (!el || !this.file) return;
    this.ops.outDtype = document.getElementById('ppOutDtype')?.value || this.ops.outDtype;

    const items = this.activeOpsList();
    const dims = this.outputDims();
    let vsNote = '';
    const vs = this.file.voxelSize;
    if (vs && vs.x && this.ops.downscale > 1) {
      vsNote = `<p class="field-hint">Voxel size scales with the binning:
        ${this.round3(vs.x * this.ops.downscale)} &times; ${this.round3(vs.y * this.ops.downscale)}
        ${vs.unit === 'um' ? '&micro;m' : (vs.unit || '')} in xy.</p>`;
    }

    el.innerHTML = `
      <div class="detail-row"><span class="detail-label">Input:</span>
        <span class="detail-value">${this.file.name}
        (${this.file.width}&times;${this.file.height}, ${this.file.slices} slices)</span></div>
      <div class="detail-row"><span class="detail-label">Output:</span>
        <span class="detail-value">${dims.w}&times;${dims.h}, ${dims.slices} slices</span></div>
      ${items.length
        ? `<ul class="pp-ops-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
        : '<p class="field-hint">No operations configured - the output would be an identical copy.</p>'}
      ${vsNote}
    `;
  }

  buildOpsPayload() {
    const o = this.ops;
    return {
      crop: o.crop,
      z_range: o.zRange,
      flip_h: o.flipH,
      flip_v: o.flipV,
      rotate90: o.rotate90,
      downscale: o.downscale,
      intensity: { window: o.window, gamma: o.gamma, invert: o.invert },
      out_dtype: document.getElementById('ppOutDtype')?.value || o.outDtype
    };
  }

  async apply() {
    if (!this.file) return;
    const outputName = document.getElementById('ppOutputName')?.value || 'preprocessed';

    const progressSection = document.getElementById('ppProgressSection');
    const successSection = document.getElementById('ppSuccessSection');
    const applyBtn = document.getElementById('ppApplyBtn');
    if (progressSection) progressSection.style.display = 'block';
    if (successSection) successSection.style.display = 'none';
    this.applyRunning = true;
    if (applyBtn) applyBtn.disabled = true;
    this.updateProgress(0, 'Starting...');

    try {
      const response = await fetch('/api/preprocess/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.file.path,
          ops: this.buildOpsPayload(),
          outputName
        })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to start preprocessing');
      this.preprocessId = result.preprocessId;
      this.connectSocket();
    } catch (e) {
      this.state.notify('error', `Preprocessing failed: ${e.message}`);
      if (progressSection) progressSection.style.display = 'none';
      if (applyBtn) applyBtn.disabled = false;
    }
  }

  connectSocket() {
    if (!this.socket) {
      if (!window.io) { this.state.notify('error', 'Socket.IO not available'); return; }
      this.socket = window.io();
    }
    this.socket.off('preprocess-progress');
    this.socket.off('preprocess-complete');
    this.socket.off('preprocess-error');
    this.socket.emit('join-preprocess', this.preprocessId);

    this.socket.on('preprocess-progress', (data) => {
      if (data.current_slice != null) {
        this.updateProgress(data.progress_percent || 0,
          `Processing slice ${data.current_slice} of ${data.total_slices}`);
      } else if (data.status === 'scanning') {
        this.updateProgress(0, 'Scanning intensity range...');
      }
    });
    this.socket.on('preprocess-complete', (data) => {
      this.applyRunning = false;
      const applyBtn = document.getElementById('ppApplyBtn');
      if (applyBtn) applyBtn.disabled = !(this.formValidationController?.isValid() ?? true);
      if (data.success) {
        this.result = data;
        this.showSuccess(data);
        this.fileSelector?.refresh();
        if (window.workspace?.fileBrowser) window.workspace.fileBrowser.refresh();
      } else {
        this.state.notify('error', `Preprocessing failed: ${data.error || 'unknown error'}`);
        const progressSection = document.getElementById('ppProgressSection');
        if (progressSection) progressSection.style.display = 'none';
      }
    });
    this.socket.on('preprocess-error', (data) => {
      this.state.notify('error', `Preprocessing error: ${data.message}`);
    });
  }

  updateProgress(percent, text) {
    const bar = document.getElementById('ppProgressBar');
    const status = document.getElementById('ppStatusText');
    if (bar) bar.style.width = `${percent}%`;
    if (status) status.textContent = text;
  }

  showSuccess(data) {
    const progressSection = document.getElementById('ppProgressSection');
    const successSection = document.getElementById('ppSuccessSection');
    if (progressSection) progressSection.style.display = 'none';
    if (successSection) successSection.style.display = 'block';

    const info = document.getElementById('ppResultInfo');
    if (info) {
      info.innerHTML = `
        <div class="detail-row"><span class="detail-label">Output:</span>
          <span class="detail-value">${data.outputPath}</span></div>
        <div class="detail-row"><span class="detail-label">Size:</span>
          <span class="detail-value">${data.width}&times;${data.height},
          ${data.slices} slices (${data.dtype})</span></div>
      `;
    }
  }

  openResultInViewer() {
    if (!this.result?.outputPath) return;
    this.state.update('workspace.viewerFile', {
      fileId: this.result.outputFileId,
      path: this.result.outputPath,
      name: this.result.outputPath.split('/').pop(),
      source: 'preprocess'
    });
    window.workspace.loadModule('imageviewer');
  }
}

export default PreprocessModule;
