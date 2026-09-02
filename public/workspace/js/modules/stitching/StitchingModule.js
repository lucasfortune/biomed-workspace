/**
 * StitchingModule - Stack Stitching (ADR-007)
 *
 * Joins multiple stacks into one volume: z-concatenation, z-overlap and
 * xy mosaics through a single placement model. Each stack after the first
 * is placed by a declared slice pair ("these two slices are the same
 * physical section" -> z-offset) plus an in-plane transform aligned in an
 * overlay viewer (auto phase correlation + manual drag/nudge/rotate).
 *
 * The junction relationship (continuation vs side-by-side) is INFERRED
 * from how the user positions the slices: large footprint overlap means
 * the stacks continue each other in z (duplicated sections are trimmed,
 * keeping the dominant stack's slices); small overlap means a mosaic
 * (all slices kept). The only per-junction choice is which stack is
 * dominant.
 *
 * The product is a stitch recipe (per-stack placements) that composes the
 * selected volumes AND can be reapplied to sibling volumes of the same
 * geometry (align once, apply to everything).
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, SliceViewerChrome } from '/workspace/js/core/components/index.js';

const TIFF_INFO_URL = '/api/denoising/dl/tiff-info';
const SLICE_URL = (idx, filePath) =>
  `/api/denoising/dl/slice/${idx}?path=${encodeURIComponent(filePath)}&size=full`;

// Align-viewer zoom limits (shared slice-viewer semantics, tracker B5)
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;

// Footprint overlap fraction above which a junction counts as a
// z-continuation (duplicated sections trimmed) instead of a mosaic.
const CONTINUATION_OVERLAP = 0.5;

class StitchingModule extends BaseModule {

  constructor(stateManager) {
    super(stateManager, {
      id: 'stitching',
      name: 'Stack Stitching',
      cssPath: '/workspace/js/modules/stitching/css/stitching.css',
      steps: [
        { id: 'select', name: 'Select Stacks' },
        { id: 'align', name: 'Align' },
        { id: 'compose', name: 'Compose' }
      ]
    });

    this.stepNavigator = null;
    this.workspaceFiles = [];
    this.resetState();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
  }

  resetState() {
    // Workflow: 'new' (align from scratch) or 'recipe' (apply a saved recipe)
    this.workflow = 'new';

    // Data mode, detected from the first selected file:
    // 'grayscale' (raw/denoised) or 'labels' (segmentations)
    this.mode = null;

    // Ordered stack list: {path, name, slices, width, height}
    this.stacks = [];

    // Junction i places stacks[i] (moving) against stacks[i-1] (fixed):
    // {fixedSlice, movingSlice, dx, dy, rotation, dominant, score}
    // dominant: 'previous' | 'this' - whose slices win duplicated sections
    this.junctions = [];
    this.currentJunction = 1;

    // Saved-recipe workflow state
    this.loadedRecipe = null;       // parsed recipe JSON
    this.recipeStackPaths = [];     // per-placement selected file path

    this.viewer = {
      fixedImg: null, movingImg: null,
      fixedScale: 1, movingScale: 1,
      zoom: 1, panX: 0, panY: 0,
      opacity: 0.5, flicker: null, flickerShow: 0,
      dragging: false, panning: false, lastX: 0, lastY: 0,
      spaceDown: false
    };

    this.stitchId = null;
    this.stitchResult = null;
    this._lastPlacements = null;
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================

  render() {
    this.container.innerHTML = `
      <div class="stitching-module module-container">
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
          <h3>Select Stacks</h3>
          <p class="step-description">
            Start a new stitch, or reapply a saved recipe to sibling volumes
            (for example the segmentations of already-aligned stacks).
          </p>

          <div class="section-card">
            <label class="radio-option">
              <input type="radio" name="stitch-workflow" value="new" checked>
              <strong>New stitch</strong> - select stacks and align them
            </label>
            <label class="radio-option">
              <input type="radio" name="stitch-workflow" value="recipe">
              <strong>Apply saved recipe</strong> - reuse placements from an earlier stitch
            </label>
          </div>

          <div class="section-card" id="newStitchSection">
            <div class="section-title-row">
              <h4>Stacks (in order)</h4>
              <span class="mode-badge" id="stitchModeBadge" style="display: none;"></span>
            </div>
            <div class="stack-add-row">
              <select id="stitchFilePicker"><option value="">Loading files...</option></select>
              <button class="btn small" id="stitchAddStack">Add</button>
            </div>
            <ul class="stack-list" id="stitchStackList"></ul>
            <p class="field-hint">
              Top of the list = reference stack; each following stack is
              aligned against the one above it. The data mode (images or
              segmentations) follows the first stack you add; only
              compatible files stay selectable.
            </p>
          </div>

          <div class="section-card" id="recipeSection" style="display: none;">
            <h4>Recipe</h4>
            <div class="stack-add-row">
              <select id="recipePicker"><option value="">Loading recipes...</option></select>
              <button class="btn small" id="recipeLoadBtn">Load</button>
            </div>
            <div id="recipeStacks"></div>
            <p class="field-hint">
              The recipe stores the placements. Swap each entry for a
              sibling volume on the same pixel grid (its segmentation, its
              denoised version) and compose without re-aligning.
            </p>
          </div>

          <div class="navigation-buttons">
            <div></div>
            <button id="stitchStep1Next" class="btn" disabled>Next: Align</button>
          </div>
        </div>
      </div>
    `;
  }

  renderStep2() {
    this.chrome = new SliceViewerChrome({
      showPrevNext: false,
      showSlider: false,
      keyboard: false,   // arrows nudge the moving slice (see _onKeyDown)
      headerExtra: `
        <div class="sv-group">
          <label>Overlay:</label>
          <input type="range" class="range-slider" id="overlayOpacity" min="0" max="100" value="50" title="Moving slice opacity">
          <label class="checkbox-inline" title="Rapidly alternate the two slices">
            <input type="checkbox" id="flickerToggle"> flicker
          </label>
        </div>`,
      footerRight: 'drag = move slice · middle-drag, Shift+drag or Space+drag = pan · arrows = nudge 1 px (Shift: 10) · wheel = zoom',
      onZoomIn: () => this.zoomBy(1.25),
      onZoomOut: () => this.zoomBy(0.8),
      onZoomFit: () => this.zoomFit(),
      onZoomReset: () => this.zoomActual()
    });
    return `
      <div id="step2" class="step-content">
        <div class="step-inner wide">
          <h3>Align Junctions</h3>
          <p class="step-description">
            Pick the slice pair that shows the <strong>same physical
            section</strong> in both stacks, then align. Fixed slice is
            magenta, moving slice green; aligned structure turns gray.
          </p>

          <div class="sv-main">
            ${this.chrome.render()}

            <div class="sv-toolbar">
              <div class="sv-section">
                <div class="sv-section-header"><h4>Junction</h4></div>
                <div class="junction-nav" id="junctionNav"></div>
              </div>

              <div class="sv-section">
                <div class="sv-section-header"><h4>Fixed slice <span class="stack-label" id="fixedStackName"></span></h4></div>
                <div class="sv-row">
                  <input type="range" class="range-slider" id="fixedSliceRange" min="0" value="0" title="Fixed slice">
                  <input type="number" id="fixedSliceNum" min="1" value="1" title="Fixed slice (1-based)">
                </div>
              </div>

              <div class="sv-section dominance-section">
                <div class="sv-section-header">
                  <h4>Overlapping sections keep</h4>
                  ${this.renderInfoTip('Where the two stacks cover the same z positions (re-imaged sections), only the dominant stack contributes slices. Ignored for side-by-side mosaics.')}
                </div>
                <div class="dominance-toggle">
                  <button class="dominance-btn" id="dominantPrevBtn" title="Keep the upper (previous) stack's slices">
                    &#9650; upper stack
                  </button>
                  <button class="dominance-btn" id="dominantThisBtn" title="Keep the lower (this) stack's slices">
                    &#9660; lower stack
                  </button>
                </div>
              </div>

              <div class="sv-section">
                <div class="sv-section-header"><h4>Moving slice <span class="stack-label" id="movingStackName"></span></h4></div>
                <div class="sv-row">
                  <input type="range" class="range-slider" id="movingSliceRange" min="0" value="0" title="Moving slice">
                  <input type="number" id="movingSliceNum" min="1" value="1" title="Moving slice (1-based)">
                </div>
              </div>

              <div class="sv-section">
                <div class="sv-section-header"><h4>Transform</h4></div>
                <div class="transform-row">
                  <span>dx <input type="number" id="junctionDx" step="1" value="0"></span>
                  <span>dy <input type="number" id="junctionDy" step="1" value="0"></span>
                </div>
                <div class="transform-row">
                  <span>rotation&deg; <input type="number" id="junctionRot" step="0.1" value="0"></span>
                </div>
                <div class="transform-row">
                  <button class="btn small primary" id="autoAlignBtn">Auto-align</button>
                  <button class="btn small secondary" id="resetAlignBtn">Reset</button>
                </div>
              </div>
            </div>
          </div>

          <div class="navigation-buttons">
            <button id="stitchStep2Back" class="btn secondary">Back</button>
            <button id="stitchStep2Next" class="btn">Next: Compose</button>
          </div>
        </div>
      </div>
    `;
  }

  renderInfoTip(text) {
    return `<span class="info-tip" title="${text}">?</span>`;
  }

  renderStep3() {
    return `
      <div id="step3" class="step-content">
        <div class="step-inner">
          <h3>Compose Stitched Volume</h3>
          <p class="step-description">
            Review the placements and compose the output. The stitch recipe
            is saved alongside the result for later reuse.
          </p>

          <div class="section-card">
            <h4>Placement Summary</h4>
            <div id="placementSummary"></div>
          </div>

          <div class="section-card">
            <h4>Options</h4>
            <div class="form-field checkbox-field" id="intensityMatchField">
              <input type="checkbox" id="stitchIntensityMatch" checked>
              <label for="stitchIntensityMatch">Match intensities between stacks (recommended for separate sessions)</label>
            </div>
            <div class="form-field checkbox-field">
              <input type="checkbox" id="stitchCropCommon">
              <label for="stitchCropCommon">Crop to common area (instead of union canvas with fill)</label>
            </div>
            <div class="form-field">
              <label for="stitchOutputName">Output name</label>
              <input type="text" id="stitchOutputName" value="stitched">
            </div>
          </div>

          <div class="section-card" id="stitchProgressSection" style="display: none;">
            <h4>Progress</h4>
            <div class="inference-status" id="stitchStatusText">Starting...</div>
            <div class="progress-bar-container">
              <div class="progress-bar" id="stitchProgressBar" style="width: 0%"></div>
            </div>
          </div>

          <div class="section-card success-card" id="stitchSuccessSection" style="display: none;">
            <div class="success-header">
              <span class="success-icon">&#10003;</span>
              <span class="success-title">Stitching Complete</span>
            </div>
            <div id="stitchResultInfo"></div>
            <div class="success-actions">
              <button class="btn primary" id="stitchOpenViewerBtn">Open in Image Viewer</button>
              <button class="btn secondary" id="stitchNewRunBtn">New Stitch</button>
            </div>
          </div>

          <div class="navigation-buttons">
            <button id="stitchStep3Back" class="btn secondary">Back</button>
            <button class="btn primary" id="stitchComposeBtn">
              <span class="btn-glyph">&#9658;</span> Compose
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
    document.querySelectorAll('input[name="stitch-workflow"]').forEach(r =>
      r.addEventListener('change', (e) => this.onWorkflowChange(e.target.value)));
    document.getElementById('stitchAddStack')?.addEventListener('click', () => this.addStack());
    document.getElementById('recipeLoadBtn')?.addEventListener('click', () => this.loadRecipe());
    document.getElementById('stitchStep1Next')?.addEventListener('click', () => {
      this.goToStep(this.workflow === 'recipe' ? 3 : 2);
    });

    // Step 2
    document.getElementById('stitchStep2Back')?.addEventListener('click', () => this.goToStep(1));
    document.getElementById('stitchStep2Next')?.addEventListener('click', () => this.goToStep(3));
    this.setupAlignControls();

    // Step 3
    document.getElementById('stitchStep3Back')?.addEventListener('click', () => {
      this.goToStep(this.workflow === 'recipe' ? 1 : 2);
    });
    document.getElementById('stitchComposeBtn')?.addEventListener('click', () => this.compose());
    document.getElementById('stitchOpenViewerBtn')?.addEventListener('click', () => this.openResultInViewer());
    document.getElementById('stitchNewRunBtn')?.addEventListener('click', () => {
      this.resetState();
      this.populateFilePicker();
      this.populateRecipePicker();
      this.renderStackList();
      this.updateStep1Next();
      this.goToStep(1);
    });

    window.stitchingModule = this;
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);

    await this.loadWorkspaceFiles();
  }

  async deactivate() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this.chrome?.destroy();
    if (this.viewer.flicker) clearInterval(this.viewer.flicker);
    if (this.socket && this.stitchId) {
      this.socket.emit('leave-stitching', this.stitchId);
    }
    // Leaving the module starts fresh next time (user preference)
    this.resetState();
    try { delete window.stitchingModule; } catch (e) { window.stitchingModule = undefined; }
    await super.deactivate();
  }

  canNavigateToStep(n) {
    if (n === 1) return true;
    if (this.workflow === 'recipe') {
      // Recipe workflow skips alignment entirely
      if (n === 2) return false;
      return this.loadedRecipe != null;
    }
    if (n === 2) return this.stacks.length >= 2;
    if (n === 3) return this.stacks.length >= 2 && this.junctions.length === this.stacks.length;
    return false;
  }

  onStepChange(prev, next) {
    if (this.stepNavigator) this.stepNavigator.update(next);
    if (next === 2) this.enterAlignStep();
    if (next === 3) this.renderPlacementSummary();
  }

  // ==========================================================================
  // Step 1: workflow + stack selection
  // ==========================================================================

  onWorkflowChange(workflow) {
    this.workflow = workflow;
    document.getElementById('newStitchSection').style.display =
      workflow === 'new' ? '' : 'none';
    document.getElementById('recipeSection').style.display =
      workflow === 'recipe' ? '' : 'none';
    const nextBtn = document.getElementById('stitchStep1Next');
    if (nextBtn) {
      nextBtn.textContent = workflow === 'recipe' ? 'Next: Compose' : 'Next: Align';
    }
    if (workflow === 'recipe') this.populateRecipePicker();
    this.updateStep1Next();
  }

  async loadWorkspaceFiles() {
    try {
      const response = await fetch('/api/workspace/files');
      const data = await response.json();
      this.workspaceFiles = (data.files || []);
    } catch (e) {
      console.error('[Stitching] Error loading files:', e);
      this.workspaceFiles = [];
    }
    this.populateFilePicker();
    this.populateRecipePicker();
  }

  /** Data mode of a workspace file, from its metadata tags */
  fileMode(f) {
    const tags = f.tags || [];
    if (tags.includes('segmentation')) return 'labels';
    const isRawUpload = f.category === 'uploads' && tags.includes('raw');
    const isProcessed = f.category === 'results' && tags.includes('data');
    return (isRawUpload || isProcessed) ? 'grayscale' : null;
  }

  eligibleFiles() {
    return this.workspaceFiles.filter(f => {
      if (!/\.tiff?$/i.test(f.name)) return false;
      const tags = f.tags || [];
      if (tags.includes('info') || tags.includes('recipe')) return false;
      const mode = this.fileMode(f);
      if (!mode) return false;
      // The first added stack fixes the mode; only compatible files remain
      return this.mode == null || mode === this.mode;
    });
  }

  populateFilePicker() {
    const picker = document.getElementById('stitchFilePicker');
    if (!picker) return;
    const files = this.eligibleFiles()
      .filter(f => !this.stacks.some(s => s.path === f.path));
    picker.innerHTML = files.length
      ? '<option value="">Select a stack...</option>' +
        files.map(f => `<option value="${f.path}">${f.name}</option>`).join('')
      : `<option value="">No ${this.mode === 'labels' ? 'compatible segmentation' : 'eligible'} files in workspace</option>`;
  }

  updateModeBadge() {
    const badge = document.getElementById('stitchModeBadge');
    if (!badge) return;
    if (this.mode) {
      badge.style.display = '';
      badge.textContent = this.mode === 'labels'
        ? 'Mode: segmentations (label maps)'
        : 'Mode: images (grayscale)';
    } else {
      badge.style.display = 'none';
    }
  }

  async addStack() {
    const picker = document.getElementById('stitchFilePicker');
    const filePath = picker?.value;
    if (!filePath) return;

    const file = this.workspaceFiles.find(f => f.path === filePath);
    const mode = file ? this.fileMode(file) : null;
    if (this.mode && mode !== this.mode) {
      this.state.notify('error',
        'Image stacks and segmentation results cannot be mixed in one stitch.');
      return;
    }

    const btn = document.getElementById('stitchAddStack');
    if (btn) btn.disabled = true;
    try {
      const response = await fetch(`${TIFF_INFO_URL}?path=${encodeURIComponent(filePath)}`);
      const info = await response.json();
      if (!info.success) throw new Error(info.error || 'Could not read stack info');

      if (this.mode == null) this.mode = mode;
      this.stacks.push({
        path: filePath,
        name: filePath.split('/').pop(),
        slices: info.sliceCount,
        width: info.width,
        height: info.height
      });
      this.renderStackList();
      this.populateFilePicker();
      this.updateModeBadge();
      this.updateStep1Next();
    } catch (e) {
      this.state.notify('error', `Could not add stack: ${e.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  removeStack(index) {
    this.stacks.splice(index, 1);
    this.junctions = [];
    if (this.stacks.length === 0) this.mode = null;
    this.renderStackList();
    this.populateFilePicker();
    this.updateModeBadge();
    this.updateStep1Next();
  }

  moveStack(index, delta) {
    const j = index + delta;
    if (j < 0 || j >= this.stacks.length) return;
    [this.stacks[index], this.stacks[j]] = [this.stacks[j], this.stacks[index]];
    this.junctions = [];
    this.renderStackList();
  }

  renderStackList() {
    const list = document.getElementById('stitchStackList');
    if (!list) return;
    list.innerHTML = this.stacks.map((s, i) => `
      <li class="stack-item">
        <span class="stack-order">${i + 1}</span>
        <span class="stack-name">${s.name}</span>
        <span class="stack-dims">${s.width}&times;${s.height}, ${s.slices} slices</span>
        <span class="stack-item-actions">
          <button class="btn tiny" onclick="window.stitchingModule?.moveStack(${i}, -1)" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
          <button class="btn tiny" onclick="window.stitchingModule?.moveStack(${i}, 1)" ${i === this.stacks.length - 1 ? 'disabled' : ''}>&darr;</button>
          <button class="btn tiny" onclick="window.stitchingModule?.removeStack(${i})">&times;</button>
        </span>
      </li>
    `).join('') || '<li class="stack-item empty">No stacks added yet</li>';
  }

  updateStep1Next() {
    const btn = document.getElementById('stitchStep1Next');
    if (!btn) return;
    btn.disabled = this.workflow === 'recipe'
      ? this.loadedRecipe == null
      : this.stacks.length < 2;
  }

  // ---- saved recipe workflow ------------------------------------------------

  populateRecipePicker() {
    const picker = document.getElementById('recipePicker');
    if (!picker) return;
    const recipes = this.workspaceFiles.filter(f =>
      (f.tags || []).includes('recipe') && (f.tags || []).includes('stitching'));
    picker.innerHTML = recipes.length
      ? '<option value="">Select a recipe...</option>' +
        recipes.map(f => `<option value="${f.path}">${f.path}</option>`).join('')
      : '<option value="">No saved recipes in workspace</option>';
  }

  async loadRecipe() {
    const picker = document.getElementById('recipePicker');
    const recipePath = picker?.value;
    if (!recipePath) return;
    try {
      const response = await fetch(`/api/stitching/recipe?path=${encodeURIComponent(recipePath)}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Could not load recipe');
      this.loadedRecipe = data.recipe;
      this.recipeStackPaths = data.recipe.stacks.map(s => s.path);
      this.renderRecipeStacks();
      this.updateStep1Next();
    } catch (e) {
      this.state.notify('error', `Could not load recipe: ${e.message}`);
    }
  }

  renderRecipeStacks() {
    const el = document.getElementById('recipeStacks');
    if (!el || !this.loadedRecipe) return;
    const candidates = this.workspaceFiles.filter(f => /\.tiff?$/i.test(f.name)
      && !(f.tags || []).includes('recipe') && !(f.tags || []).includes('info'));
    el.innerHTML = this.loadedRecipe.stacks.map((s, i) => `
      <div class="sibling-row">
        <span class="stack-order">${i + 1}</span>
        <select data-recipe-index="${i}">
          ${candidates.map(f =>
            `<option value="${f.path}" ${f.path === this.recipeStackPaths[i] ? 'selected' : ''}>${f.name}</option>`).join('')}
          ${candidates.some(f => f.path === this.recipeStackPaths[i]) ? '' :
            `<option value="${this.recipeStackPaths[i]}" selected>${this.recipeStackPaths[i]} (missing)</option>`}
        </select>
      </div>
    `).join('');
    el.querySelectorAll('[data-recipe-index]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        this.recipeStackPaths[parseInt(e.target.getAttribute('data-recipe-index'), 10)] = e.target.value;
      });
    });
  }

  // ==========================================================================
  // Step 2: junction alignment
  // ==========================================================================

  enterAlignStep() {
    if (this.junctions.length !== this.stacks.length) {
      this.junctions = [null];
      for (let i = 1; i < this.stacks.length; i++) {
        this.junctions.push({
          fixedSlice: this.stacks[i - 1].slices - 1,
          movingSlice: 0,
          dx: 0, dy: 0, rotation: 0,
          dominant: 'previous', score: null
        });
      }
    }
    this.currentJunction = Math.min(Math.max(1, this.currentJunction), this.stacks.length - 1);
    this.renderJunctionNav();
    this.loadJunction();
  }

  renderJunctionNav() {
    const nav = document.getElementById('junctionNav');
    if (!nav) return;
    const parts = [];
    for (let i = 1; i < this.stacks.length; i++) {
      const j = this.junctions[i];
      const done = j && (j.score != null || j.dx !== 0 || j.dy !== 0);
      parts.push(`<button class="junction-tab ${i === this.currentJunction ? 'active' : ''} ${done ? 'done' : ''}"
        onclick="window.stitchingModule?.selectJunction(${i})">
        ${i}: ${this.stacks[i - 1].name} &rarr; ${this.stacks[i].name}</button>`);
    }
    nav.innerHTML = parts.join('');
  }

  selectJunction(i) {
    this.currentJunction = i;
    this.renderJunctionNav();
    this.loadJunction();
  }

  setupAlignControls() {
    const bind = (id, evt, fn) => document.getElementById(id)?.addEventListener(evt, fn);

    // Shared viewer chrome (zoom set, overlay controls, status, footer);
    // the overlay canvas lives in its canvas host
    this.chrome.mount(document.getElementById('step2'));
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'overlayCanvas';
    overlayCanvas.tabIndex = 0;
    this.chrome.area.appendChild(overlayCanvas);

    // Slider is 0-based, number field 1-based (decision 4); junction slices stay 0-based
    const syncSlice = (which) => {
      const range = document.getElementById(`${which}SliceRange`);
      const num = document.getElementById(`${which}SliceNum`);
      return (e) => {
        const stack = this.stacks[which === 'fixed' ? this.currentJunction - 1 : this.currentJunction];
        const max = (stack?.slices || 1) - 1;
        const raw = parseInt(e.target.value, 10);
        const v = Math.max(0, Math.min(max, (isNaN(raw) ? 0 : raw) - (e.target === num ? 1 : 0)));
        if (range) range.value = v;
        if (num) num.value = v + 1;
        const j = this.junctions[this.currentJunction];
        if (j) {
          j[`${which}Slice`] = v;
          this.reloadSlices();
        }
      };
    };
    bind('fixedSliceRange', 'input', syncSlice('fixed'));
    bind('fixedSliceNum', 'change', syncSlice('fixed'));
    bind('movingSliceRange', 'input', syncSlice('moving'));
    bind('movingSliceNum', 'change', syncSlice('moving'));

    bind('dominantPrevBtn', 'click', () => this.setDominant('previous'));
    bind('dominantThisBtn', 'click', () => this.setDominant('this'));

    const num = (e) => parseFloat(e.target.value) || 0;
    bind('junctionDx', 'change', (e) => { this.setTransform({ dx: num(e) }); });
    bind('junctionDy', 'change', (e) => { this.setTransform({ dy: num(e) }); });
    bind('junctionRot', 'change', (e) => { this.setTransform({ rotation: num(e) }); });

    bind('autoAlignBtn', 'click', () => this.autoAlign());
    bind('resetAlignBtn', 'click', () => { this.setTransform({ dx: 0, dy: 0, rotation: 0 }); this.setScore(null); });

    bind('overlayOpacity', 'input', (e) => {
      this.viewer.opacity = parseInt(e.target.value, 10) / 100;
      this.drawOverlay();
    });
    bind('flickerToggle', 'change', (e) => this.toggleFlicker(e.target.checked));

    const canvas = document.getElementById('overlayCanvas');
    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => {
        // Left drag moves the moving slice; middle-button drag, Shift+left
        // or Space+left pans the VIEW, i.e. moves both slices together to
        // inspect a different area at the current zoom.
        const pan = e.button === 1 || e.shiftKey || this.viewer.spaceDown;
        if (e.button !== 0 && e.button !== 1) return;
        e.preventDefault();  // middle button would otherwise start autoscroll
        canvas.setPointerCapture(e.pointerId);
        this.viewer[pan ? 'panning' : 'dragging'] = true;
        this.viewer.lastX = e.clientX; this.viewer.lastY = e.clientY;
        canvas.focus();
      });
      canvas.addEventListener('pointermove', (e) => {
        const v = this.viewer;
        if (!v.dragging && !v.panning) return;
        const dxPix = e.clientX - v.lastX;
        const dyPix = e.clientY - v.lastY;
        v.lastX = e.clientX; v.lastY = e.clientY;
        if (v.panning) {
          v.panX += dxPix; v.panY += dyPix;
        } else {
          const j = this.junctions[this.currentJunction];
          if (j) {
            j.dx += dxPix / (v.zoom) * v.fixedScale;
            j.dy += dyPix / (v.zoom) * v.fixedScale;
            this.updateTransformInputs();
            this.setScore(null);
          }
        }
        this.drawOverlay();
      });
      const up = () => { this.viewer.dragging = this.viewer.panning = false; };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        // Anchor the zoom at the cursor (canvas bitmap coordinates)
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * canvas.width / rect.width;
        const cy = (e.clientY - rect.top) * canvas.height / rect.height;
        this.zoomBy(e.deltaY < 0 ? 1.1 : 0.9, cx, cy);
      }, { passive: false });
    }
  }

  setDominant(which) {
    const j = this.junctions[this.currentJunction];
    if (j) j.dominant = which;
    this.updateDominanceButtons();
  }

  updateDominanceButtons() {
    const j = this.junctions[this.currentJunction];
    document.getElementById('dominantPrevBtn')?.classList.toggle('active', j?.dominant === 'previous');
    document.getElementById('dominantThisBtn')?.classList.toggle('active', j?.dominant === 'this');
  }

  _onKeyDown(e) {
    if (this.currentStep !== 2) return;
    if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') {
      // Space+drag pans (AnnotationCanvas semantics); block page scroll
      if (!this.viewer.spaceDown) {
        this.viewer.spaceDown = true;
        const canvas = document.getElementById('overlayCanvas');
        if (canvas) canvas.style.cursor = 'grab';
      }
      e.preventDefault();
      return;
    }
    const j = this.junctions[this.currentJunction];
    if (!j) return;
    const step = e.shiftKey ? 10 : 1;
    let handled = true;
    if (e.key === 'ArrowLeft') j.dx -= step;
    else if (e.key === 'ArrowRight') j.dx += step;
    else if (e.key === 'ArrowUp') j.dy -= step;
    else if (e.key === 'ArrowDown') j.dy += step;
    else handled = false;
    if (handled) {
      e.preventDefault();
      this.updateTransformInputs();
      this.setScore(null);
      this.drawOverlay();
    }
  }

  _onKeyUp(e) {
    if (e.code !== 'Space' || !this.viewer.spaceDown) return;
    this.viewer.spaceDown = false;
    const canvas = document.getElementById('overlayCanvas');
    if (canvas) canvas.style.cursor = '';
  }

  setTransform(partial) {
    const j = this.junctions[this.currentJunction];
    if (!j) return;
    Object.assign(j, partial);
    this.updateTransformInputs();
    this.drawOverlay();
  }

  updateTransformInputs() {
    const j = this.junctions[this.currentJunction];
    if (!j) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('junctionDx', Math.round(j.dx * 10) / 10);
    set('junctionDy', Math.round(j.dy * 10) / 10);
    set('junctionRot', Math.round(j.rotation * 100) / 100);
  }

  loadJunction() {
    const i = this.currentJunction;
    const fixed = this.stacks[i - 1];
    const moving = this.stacks[i];
    const j = this.junctions[i];
    if (!fixed || !moving || !j) return;

    document.getElementById('fixedStackName').textContent = fixed.name;
    document.getElementById('movingStackName').textContent = moving.name;
    const setup = (which, stack, value) => {
      const range = document.getElementById(`${which}SliceRange`);
      const numEl = document.getElementById(`${which}SliceNum`);
      if (range) { range.max = stack.slices - 1; range.value = value; }
      if (numEl) { numEl.max = stack.slices; numEl.value = value + 1; }
    };
    setup('fixed', fixed, j.fixedSlice);
    setup('moving', moving, j.movingSlice);
    this.updateDominanceButtons();
    this.updateTransformInputs();
    this.setScore(j.score);
    this.reloadSlices();
  }

  async reloadSlices() {
    const i = this.currentJunction;
    const j = this.junctions[i];
    const fixed = this.stacks[i - 1];
    const moving = this.stacks[i];
    this.chrome.setStatus('Loading slices…');

    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('slice load failed'));
      img.src = src;
    });

    try {
      const [fi, mi] = await Promise.all([
        load(SLICE_URL(j.fixedSlice, fixed.path)),
        load(SLICE_URL(j.movingSlice, moving.path))
      ]);
      const v = this.viewer;
      v.fixedImg = this.tintImage(fi, [255, 0, 255]);
      v.movingImg = this.tintImage(mi, [0, 255, 0]);
      v.fixedScale = fixed.width / fi.width;
      v.movingScale = moving.width / mi.width;
      this.chrome.setStatus(null);
      this.zoomFit();
    } catch (e) {
      this.chrome.setStatus('Could not load slice previews', true);
    }
  }

  /** Tint a grayscale image with a color (multiply) onto an offscreen canvas */
  tintImage(img, rgb) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  zoomFit() {
    const canvas = document.getElementById('overlayCanvas');
    const v = this.viewer;
    if (!canvas || !v.fixedImg) return;
    const wrap = canvas.parentElement;
    canvas.width = wrap.clientWidth;
    canvas.height = Math.max(420, wrap.clientHeight || 0, Math.round(wrap.clientWidth * 0.6));
    v.zoom = Math.min(canvas.width / v.fixedImg.width, canvas.height / v.fixedImg.height) * 0.95;
    v.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom));
    v.panX = (canvas.width - v.fixedImg.width * v.zoom) / 2;
    v.panY = (canvas.height - v.fixedImg.height * v.zoom) / 2;
    this.chrome?.setZoom(v.zoom);
    this.drawOverlay();
  }

  /** 1:1 — one preview pixel per canvas pixel, centred */
  zoomActual() {
    const canvas = document.getElementById('overlayCanvas');
    const v = this.viewer;
    if (!canvas || !v.fixedImg) return;
    v.zoom = 1;
    v.panX = (canvas.width - v.fixedImg.width) / 2;
    v.panY = (canvas.height - v.fixedImg.height) / 2;
    this.chrome?.setZoom(v.zoom);
    this.drawOverlay();
  }

  /**
   * Multiply the zoom, keeping the canvas point (cx, cy) fixed
   * (defaults to the centre). Clamped to ZOOM_MIN..ZOOM_MAX.
   */
  zoomBy(factor, cx = null, cy = null) {
    const canvas = document.getElementById('overlayCanvas');
    const v = this.viewer;
    if (!canvas) return;
    const target = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom * factor));
    const f = target / v.zoom;
    if (f === 1) return;
    if (cx == null) cx = canvas.width / 2;
    if (cy == null) cy = canvas.height / 2;
    v.panX = cx - (cx - v.panX) * f;
    v.panY = cy - (cy - v.panY) * f;
    v.zoom = target;
    this.chrome?.setZoom(v.zoom);
    this.drawOverlay();
  }

  toggleFlicker(on) {
    const v = this.viewer;
    if (v.flicker) { clearInterval(v.flicker); v.flicker = null; }
    if (on) {
      v.flicker = setInterval(() => {
        v.flickerShow = 1 - v.flickerShow;
        this.drawOverlay();
      }, 350);
    } else {
      this.drawOverlay();
    }
  }

  drawOverlay() {
    const canvas = document.getElementById('overlayCanvas');
    const v = this.viewer;
    const j = this.junctions[this.currentJunction];
    if (!canvas || !v.fixedImg || !v.movingImg || !j) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);   // --module-viewer-bg shows through
    ctx.imageSmoothingEnabled = true;

    const flickering = !!v.flicker;
    const showFixed = !flickering || v.flickerShow === 0;
    const showMoving = !flickering || v.flickerShow === 1;

    ctx.save();
    ctx.translate(v.panX, v.panY);
    ctx.scale(v.zoom, v.zoom);

    if (showFixed) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(v.fixedImg, 0, 0);
    }
    if (showMoving) {
      ctx.globalCompositeOperation = flickering ? 'source-over' : 'lighter';
      ctx.globalAlpha = flickering ? 1 : v.opacity * 2;
      const s = v.fixedScale;
      const mw = v.movingImg.width, mh = v.movingImg.height;
      const rel = v.movingScale / v.fixedScale;
      ctx.translate(j.dx / s, j.dy / s);
      ctx.translate(mw * rel / 2, mh * rel / 2);
      ctx.rotate(j.rotation * Math.PI / 180);
      ctx.translate(-mw * rel / 2, -mh * rel / 2);
      ctx.scale(rel, rel);
      ctx.drawImage(v.movingImg, 0, 0);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  setScore(score) {
    const j = this.junctions[this.currentJunction];
    if (j) j.score = score;
    this.chrome?.setFooter(
      score == null ? '' : `overlap correlation: ${score.toFixed(3)}`, undefined,
      score == null ? '' : score > 0.5 ? 'good' : 'poor');
  }

  async autoAlign() {
    const i = this.currentJunction;
    const j = this.junctions[i];
    const btn = document.getElementById('autoAlignBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Aligning...'; }
    try {
      const response = await fetch('/api/stitching/align', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixedPath: this.stacks[i - 1].path,
          fixedSlice: j.fixedSlice,
          movingPath: this.stacks[i].path,
          movingSlice: j.movingSlice,
          mode: this.mode || 'grayscale'
        })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Alignment failed');
      j.dx = result.dx;
      j.dy = result.dy;
      this.updateTransformInputs();
      this.setScore(result.score);
      this.drawOverlay();
      if (result.score < 0.3) {
        this.state.notify('warning',
          'Low alignment confidence; check the slice pair and adjust manually.', 6000);
      }
    } catch (e) {
      this.state.notify('error', `Auto-align failed: ${e.message}`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Auto-align'; }
    }
  }

  // ==========================================================================
  // Step 3: compose
  // ==========================================================================

  /** xy footprint overlap fraction of the moving stack against the fixed
   *  one, in the junction's local frame (rotation neglected: it is small) */
  junctionOverlapFraction(i) {
    const f = this.stacks[i - 1];
    const m = this.stacks[i];
    const j = this.junctions[i];
    const x0 = Math.max(0, j.dx), x1 = Math.min(f.width, j.dx + m.width);
    const y0 = Math.max(0, j.dy), y1 = Math.min(f.height, j.dy + m.height);
    const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    return inter / Math.min(f.width * f.height, m.width * m.height);
  }

  /**
   * Compose junction transforms into global per-stack placements.
   *
   * Junction i maps moving-stack pixels into the previous stack's frame:
   *   F_i(p) = R(rot_i) (p - c_i) + c_i + (dx_i, dy_i)
   * Global placement composes down the chain (G_i = G_{i-1} o F_i) and is
   * re-expressed as rotation about the stack's own center plus translation
   * (the recipe format). z-offsets: the declared pair pins moving slice m
   * to the fixed stack's global z of slice f.
   *
   * The junction relationship is inferred from the footprint overlap: a
   * large overlap means the stacks continue each other in z (duplicated
   * z-positions are trimmed, keeping the dominant stack's slices); a small
   * overlap means a mosaic (all slices kept).
   */
  buildPlacements() {
    const placements = [{
      z_offset: 0, dx: 0, dy: 0, rotation_deg: 0,
      theta: 0, tx: 0, ty: 0
    }];

    for (let i = 1; i < this.stacks.length; i++) {
      const j = this.junctions[i];
      const prev = placements[i - 1];
      const cM = { x: (this.stacks[i].width - 1) / 2, y: (this.stacks[i].height - 1) / 2 };
      const cP = { x: (this.stacks[i - 1].width - 1) / 2, y: (this.stacks[i - 1].height - 1) / 2 };

      const thPrev = prev.theta * Math.PI / 180;
      const px = cM.x + j.dx, py = cM.y + j.dy;
      const gx = Math.cos(thPrev) * (px - cP.x) - Math.sin(thPrev) * (py - cP.y) + cP.x + prev.tx;
      const gy = Math.sin(thPrev) * (px - cP.x) + Math.cos(thPrev) * (py - cP.y) + cP.y + prev.ty;

      const theta = prev.theta + j.rotation;
      const z_offset = prev.z_offset + j.fixedSlice - j.movingSlice;
      placements.push({
        z_offset,
        dx: gx - cM.x,
        dy: gy - cM.y,
        rotation_deg: theta,
        theta, tx: gx - cM.x, ty: gy - cM.y
      });
    }

    // z_keep: trim duplicated sections at continuation junctions, keeping
    // the dominant stack's slices
    const keeps = this.stacks.map((s) => [0, s.slices]);
    const relationships = [null];
    let coveredEnd = placements[0].z_offset + this.stacks[0].slices;
    for (let i = 1; i < this.stacks.length; i++) {
      const j = this.junctions[i];
      const isContinuation = this.junctionOverlapFraction(i) >= CONTINUATION_OVERLAP;
      relationships.push(isContinuation ? 'z' : 'xy');
      const z0 = placements[i].z_offset;
      const z1 = z0 + this.stacks[i].slices;
      if (isContinuation && z0 < coveredEnd) {
        if (j.dominant === 'previous') {
          keeps[i][0] = Math.min(this.stacks[i].slices, coveredEnd - z0);
        } else {
          const prevZ0 = placements[i - 1].z_offset;
          keeps[i - 1][1] = Math.max(keeps[i - 1][0], z0 - prevZ0);
        }
      }
      coveredEnd = Math.max(coveredEnd, z1);
    }
    this._relationships = relationships;

    return this.stacks.map((s, i) => ({
      path: s.path,
      z_offset: placements[i].z_offset,
      dx: placements[i].dx,
      dy: placements[i].dy,
      rotation_deg: placements[i].rotation_deg,
      z_keep: keeps[i]
    }));
  }

  renderPlacementSummary() {
    const el = document.getElementById('placementSummary');
    if (!el) return;

    let placements, names, mode;
    if (this.workflow === 'recipe' && this.loadedRecipe) {
      placements = this.loadedRecipe.stacks.map((s, i) => ({
        ...s, path: this.recipeStackPaths[i]
      }));
      names = this.recipeStackPaths.map(p => p.split('/').pop());
      mode = this.detectRecipeMode();
      this._relationships = null;
    } else {
      placements = this.buildPlacements();
      names = this.stacks.map(s => s.name);
      mode = this.mode;
    }
    this._lastPlacements = placements;
    this._composeMode = mode;

    const relNote = (i) => {
      if (!this._relationships || i === 0) return '';
      return this._relationships[i] === 'z'
        ? '<span class="rel-note">continues in z</span>'
        : '<span class="rel-note">side by side</span>';
    };

    el.innerHTML = `
      <table class="placement-table">
        <tr><th>#</th><th>Stack</th><th></th><th>z offset</th><th>dx</th><th>dy</th><th>rot&deg;</th><th>slices kept</th></tr>
        ${placements.map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${names[i]}</td>
            <td>${relNote(i)}</td>
            <td>${p.z_offset}</td>
            <td>${Number(p.dx).toFixed(1)}</td>
            <td>${Number(p.dy).toFixed(1)}</td>
            <td>${Number(p.rotation_deg).toFixed(2)}</td>
            <td>${p.z_keep ? `${p.z_keep[0]}&ndash;${p.z_keep[1]}` : 'all'}</td>
          </tr>`).join('')}
      </table>
      <p class="field-hint">Mode: ${mode === 'labels' ? 'segmentations (nearest-neighbor, hard seams)' : 'images (feathered seams)'}</p>
    `;
    const intensityField = document.getElementById('intensityMatchField');
    if (intensityField) intensityField.style.display = mode === 'labels' ? 'none' : '';
  }

  detectRecipeMode() {
    // Mode follows the actually selected files (a recipe aligned on images
    // may be applied to segmentations)
    for (const p of this.recipeStackPaths) {
      const f = this.workspaceFiles.find(x => x.path === p);
      if (f) {
        const m = this.fileMode(f);
        if (m) return m;
      }
    }
    return this.loadedRecipe?.mode || 'grayscale';
  }

  async compose() {
    const placements = this._lastPlacements || this.buildPlacements();
    const mode = this._composeMode || this.mode || 'grayscale';

    const recipe = {
      mode,
      crop_to_common: document.getElementById('stitchCropCommon')?.checked || false,
      intensity_match: mode === 'grayscale'
        && (document.getElementById('stitchIntensityMatch')?.checked || false),
      stacks: placements
    };
    const outputName = document.getElementById('stitchOutputName')?.value || 'stitched';

    const progressSection = document.getElementById('stitchProgressSection');
    const successSection = document.getElementById('stitchSuccessSection');
    const composeBtn = document.getElementById('stitchComposeBtn');
    if (progressSection) progressSection.style.display = 'block';
    if (successSection) successSection.style.display = 'none';
    if (composeBtn) composeBtn.disabled = true;
    this.updateStitchProgress(0, 'Starting...');

    try {
      const response = await fetch('/api/stitching/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe, outputName })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to start stitching');
      this.stitchId = result.stitchId;
      this.connectStitchSocket();
    } catch (e) {
      this.state.notify('error', `Stitching failed: ${e.message}`);
      if (progressSection) progressSection.style.display = 'none';
      if (composeBtn) composeBtn.disabled = false;
    }
  }

  connectStitchSocket() {
    if (!this.socket) {
      if (!window.io) { this.state.notify('error', 'Socket.IO not available'); return; }
      this.socket = window.io();
    }
    this.socket.off('stitching-progress');
    this.socket.off('stitching-complete');
    this.socket.off('stitching-error');
    this.socket.emit('join-stitching', this.stitchId);

    this.socket.on('stitching-progress', (data) => {
      if (data.current_slice != null) {
        this.updateStitchProgress(data.progress_percent || 0,
          `Composing slice ${data.current_slice} of ${data.total_slices}`);
      } else if (data.status === 'starting') {
        this.updateStitchProgress(0,
          `Canvas ${data.width}×${data.height}, ${data.total_slices} slices`);
      }
    });
    this.socket.on('stitching-complete', (data) => {
      const composeBtn = document.getElementById('stitchComposeBtn');
      if (composeBtn) composeBtn.disabled = false;
      if (data.success) {
        this.stitchResult = data;
        this.showStitchSuccess(data);
        this.loadWorkspaceFiles();  // new output + recipe become selectable
        if (window.workspace?.fileBrowser) window.workspace.fileBrowser.refresh();
      } else {
        this.state.notify('error', `Stitching failed: ${data.error || 'unknown error'}`);
        const progressSection = document.getElementById('stitchProgressSection');
        if (progressSection) progressSection.style.display = 'none';
      }
    });
    this.socket.on('stitching-error', (data) => {
      this.state.notify('error', `Stitching error: ${data.message}`);
    });
  }

  updateStitchProgress(percent, text) {
    const bar = document.getElementById('stitchProgressBar');
    const status = document.getElementById('stitchStatusText');
    if (bar) bar.style.width = `${percent}%`;
    if (status) status.textContent = text;
  }

  showStitchSuccess(data) {
    const progressSection = document.getElementById('stitchProgressSection');
    const successSection = document.getElementById('stitchSuccessSection');
    if (progressSection) progressSection.style.display = 'none';
    if (successSection) successSection.style.display = 'block';

    const info = document.getElementById('stitchResultInfo');
    if (info) {
      const warnings = (data.warnings || []).map(w => `<div class="stitch-warning">&#9888; ${w}</div>`).join('');
      info.innerHTML = `
        <div class="detail-row"><span class="detail-label">Output:</span> <span class="detail-value">${data.outputPath}</span></div>
        <div class="detail-row"><span class="detail-label">Size:</span> <span class="detail-value">${data.width}&times;${data.height}, ${data.slices} slices (${data.dtype})</span></div>
        <div class="detail-row"><span class="detail-label">Recipe:</span> <span class="detail-value">${data.recipePath}</span></div>
        ${warnings}
      `;
    }
  }

  openResultInViewer() {
    if (!this.stitchResult?.outputPath) return;
    // The Image Viewer picks up 'workspace.viewerFile' on activation and
    // jumps straight to viewing; it requires a workspace file id.
    this.state.update('workspace.viewerFile', {
      fileId: this.stitchResult.outputFileId,
      path: this.stitchResult.outputPath,
      name: this.stitchResult.outputPath.split('/').pop(),
      source: 'stitching'
    });
    window.workspace.loadModule('imageviewer');
  }
}

export default StitchingModule;
