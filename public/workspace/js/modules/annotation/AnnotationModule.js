/**
 * AnnotationModule - Annotation
 *
 * Browser-based painting tool for creating ground-truth segmentation masks
 * on TIFF image stacks.
 *
 * Features:
 * - Step 1: Data selection (source images, resume unfinished, edit existing)
 * - Step 2: Annotation interface with brush/eraser tools
 * - Multi-class support with color-coded labels
 * - Per-class interpolation between annotated slices (shape-based, ADR-013)
 * - Hidden and locked classes are protected from brush, eraser and fill
 * - Fill tool, Alt+click eyedropper, 1-9 class keys, rename + colour, batch show/lock
 * - Overlay opacity slider and V-to-peek
 * - Pixel classifier suggestions (random forest on the user's strokes, ADR-013 §8)
 * - Save progress and create final annotations as TIFF
 *
 * @module AnnotationModule
 */

// =============================================================================
// IMPORTS
// =============================================================================

import BaseModule from '/workspace/js/core/BaseModule.js';
// ---------------------------------------------------------------------------
// File classification helpers (workspace metadata: category + tags)
// ---------------------------------------------------------------------------
const hasTag = (f, tag) => Array.isArray(f.tags) && f.tags.includes(tag);
/** Raw image stack a new annotation can be started from */
const isRawImageFile = (f) =>
  (f.category === 'uploads' && hasTag(f, 'raw')) ||
  f.category === 'raw' || f.category === 'raw_images' || f.category === 'inference_data';
/** Processed image stack (denoised) that can also be annotated */
const isImageResultFile = (f) =>
  (f.category === 'results' && hasTag(f, 'data') && hasTag(f, 'denoising')) ||
  f.category === 'denoised_images';
/**
 * Segmentation result (U-Net inference or Segmentation Cleanup output): a label
 * map, opened for correction in edit mode over its raw stack (ADR-014)
 */
const isSegmentationResult = (f) =>
  (f.category === 'results' && hasTag(f, 'data') && hasTag(f, 'segmentation')) ||
  f.category === 'segmentations';
/** Unfinished annotation saved with "Save Progress" */
const isUnfinishedAnnotation = (f) =>
  f.category === 'results' && hasTag(f, 'annotation') && hasTag(f, 'wip');
/** Finished annotation (created by this module or uploaded as a mask) */
const isFinishedAnnotation = (f) =>
  f.category === 'uploads' && hasTag(f, 'annotation') && !hasTag(f, 'info');
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

import { StepNavigator, FileSelector, ValidationDisplay, SliceViewerChrome }
  from '/workspace/js/core/components/index.js';
import { icon } from '/workspace/js/core/icons.js';
import AnnotationAPI from './AnnotationAPI.js';
import AnnotationCanvas from './utils/AnnotationCanvas.js';
import BrushEngine from './utils/BrushEngine.js';
import HistoryManager from './utils/HistoryManager.js';
import { planGaps, interpolateClass } from './utils/SliceInterpolator.js';

/** Default for the widest keyframe distance the interpolation still bridges */
const DEFAULT_MAX_GAP = 10;

// =============================================================================
// MODULE CLASS
// =============================================================================

class AnnotationModule extends BaseModule {

  // ===========================================================================
  // CONSTRUCTOR
  // ===========================================================================

  constructor(stateManager) {
    super(stateManager, {
      id: 'annotation',
      name: 'Annotation',
      cssPath: '/workspace/js/modules/annotation/css/annotation.css',
      steps: [
        { id: 'select', name: 'Data Selection' },
        { id: 'annotate', name: 'Annotation' }
      ]
    });

    // =========================================================================
    // STEP CONDITION FLAGS
    // =========================================================================

    this.sourceFileLoaded = false;  // Step 1 complete -> can access Step 2

    // =========================================================================
    // COMPONENT REFERENCES
    // =========================================================================

    this.stepNavigator = null;
    this.validationDisplay = null;
    this.fileSelector = null;
    this.api = null;
    this.canvas = null;
    this.brushEngine = null;
    this.historyManager = null;

    // =========================================================================
    // MODULE STATE
    // =========================================================================

    // Source file info
    this.sourceFile = null;
    this.tiffInfo = null;

    // Annotation file info (for resume/edit scenarios)
    this.annotationFile = null;
    this.isResuming = false;
    this.annotationMode = 'new';      // 'new' | 'resume' (WIP, saves update it) | 'edit' (saves create a new file)
    this.currentAnnotationId = null;  // ID of current unfinished annotation (for updates)

    // Slice navigation
    this.currentSlice = 0;
    this.totalSlices = 1;
    this.sliceNavToken = 0;  // serializes concurrent slice navigations (latest-wins)

    // Dirty state tracking
    this.isDirty = false;

    // Slice interpolation (ADR-013)
    this.classPresence = new Map();      // slice index -> Set<classId> present on that slice
    this.interpolatedSlices = new Map(); // slice index -> Set<classId> filled by interpolation, not yet edited
    this.lastInterpolation = null;       // { classId, snapshots: Map<slice, Uint8Array|null> } for revert
    this.interpolateDialog = null;       // open dialog element, if any

    // Pixel classifier (ADR-013 §8)
    this.suggestions = new Map();        // slice index -> { labels: Uint8Array, confidence: Uint8Array }
    this.classifierModelId = null;       // server-side model trained on the current labels
    this.labelsVersion = 0;              // bumped on every label change; the model remembers the version it saw
    this.classifierTrainedVersion = -1;
    this.suggestBusy = false;

    // Autosave
    this.autosaveEnabled = true;
    this.autosaveInterval = null;

    // =========================================================================
    // BIND METHODS
    // =========================================================================

    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
  }

  /**
   * Render a help icon that opens the info panel with a specific article
   * @param {string} articleId - The article ID to display
   * @returns {string} HTML for the help icon
   */
  renderHelpIcon(articleId) {
    return `<span class="help-icon" data-info-id="${articleId}" title="Click for help">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
      </svg>
    </span>`;
  }

  // ===========================================================================
  // LIFECYCLE METHODS
  // ===========================================================================

  /**
   * Load any dependencies (called before render)
   */
  async loadDependencies() {
    // No external dependencies for now
    // Socket.IO will be added in later phases
  }

  // ===========================================================================
  // RENDER METHOD
  // ===========================================================================

  render() {
    // Shared slice-viewer chrome (header nav + zoom, canvas host, slider
    // strip, footer); the module keeps AnnotationCanvas + BrushEngine
    this.chrome = new SliceViewerChrome({
      slices: this.totalSlices || 1,
      slice: this.currentSlice || 0,
      footerLeft: 'X: -- Y: --',
      footerRight: '-- × --',
      isActive: () => this.currentStep === 2,
      onSliceChange: (i) => this.goToSlice(i),
      onZoomIn: () => this.canvas?.zoomIn(),
      onZoomOut: () => this.canvas?.zoomOut(),
      onZoomFit: () => this.canvas?.zoomToFit(),
      onZoomReset: () => this.canvas?.resetZoom()
    });
    this.container.innerHTML = `
      <div class="annotation-module module-container">
        <!-- Header with back button -->
        ${this.renderHeader()}

        <!-- Step navigation -->
        ${this.renderStepNav()}

        <!-- Step Contents Container -->
        <div class="step-contents">

          <!-- =============================================================== -->
          <!-- STEP 1: Data Selection -->
          <!-- =============================================================== -->
          <div id="step1" class="step-content active">
            <div class="step-inner">
              <h3>Select Source Image</h3>
              <p class="step-description">
                Choose an image stack to annotate, resume an unfinished annotation,
                or edit an existing annotation.
              </p>

              <!-- File Selector Container -->
              <div id="fileSelectorContainer"></div>

              <!-- Validation Display -->
              ${ValidationDisplay.renderContainer('validationResult')}

              <!-- Source image picker (only when an annotation has no known source) -->
              <div id="annotationSourcePicker" style="display: none;"></div>

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <div></div>
                <button id="step1Next" class="btn" disabled>
                  Next: Annotate
                </button>
              </div>
            </div>
          </div>

          <!-- =============================================================== -->
          <!-- STEP 2: Annotation Interface -->
          <!-- =============================================================== -->
          <div id="step2" class="step-content">
            <div class="step-inner annotation-interface">
              <div class="annotation-header">
                <h3>Annotation Interface</h3>
                <div class="annotation-actions">
                  <div class="autosave-toggle" title="Save progress automatically every 2 minutes">
                    <label class="toggle-switch">
                      <input type="checkbox" id="autosaveToggle" checked>
                      <span class="toggle-slider"></span>
                    </label>
                    <span class="toggle-label">Autosave</span>
                    <span id="autosaveStatus" class="autosave-status"></span>
                  </div>
                  <button id="saveProgressBtn" class="btn secondary" disabled>
                    Save Progress
                  </button>
                </div>
              </div>

              <!-- Main Content Area (Canvas + Toolbar side by side) -->
              <div class="sv-main">
                ${this.chrome.render()}

                <!-- Toolbar: three sections, the whole column scrolls -->
                <div id="toolbar" class="sv-toolbar">
                  <!-- Tools: tool buttons, history, brush size -->
                  <div class="sv-section">
                    <div class="sv-section-header">
                      <h4>Tools</h4>
                      ${this.renderHelpIcon('annotation.step2.tools')}
                    </div>
                    <div class="tool-buttons">
                      <button id="toolBrush" class="tool-btn active" title="Brush (B)">
                        <span class="tool-icon">${icon('brush')}</span>
                        <span class="tool-label">Brush</span>
                      </button>
                      <button id="toolEraser" class="tool-btn" title="Eraser (E)">
                        <span class="tool-icon">${icon('eraser')}</span>
                        <span class="tool-label">Eraser</span>
                      </button>
                      <button id="toolFill" class="tool-btn" title="Fill (F): click a region to fill it with the active class">
                        <span class="tool-icon">${icon('fill')}</span>
                        <span class="tool-label">Fill</span>
                      </button>
                    </div>
                    <div class="history-row">
                      <button id="undoBtn" class="btn-icon-sm" title="Undo (Ctrl+Z)" disabled>${icon('undo')}</button>
                      <button id="redoBtn" class="btn-icon-sm" title="Redo (Ctrl+Y)" disabled>${icon('redo')}</button>
                      <button id="revertInterpolationBtn" class="btn-icon-sm btn-revert-interpolation"
                              title="Restore every slice the last interpolation wrote to its previous content" hidden>
                        ${icon('layers')}<span>Revert interpolation</span>
                      </button>
                    </div>
                    <div class="brush-size-control" title="Brush size ([ and ] to change)">
                      <span class="control-label">Size</span>
                      <input type="range" id="brushSizeSlider" min="1" max="50" value="10"
                             class="brush-slider range-slider" title="Brush size">
                      <span id="brushSizeValue" class="brush-size-value">10px</span>
                    </div>
                  </div>

                  <!-- Classes and overlay -->
                  <div class="sv-section classes-section">
                    <div class="classes-header">
                      <h4>Classes</h4>
                      ${this.renderHelpIcon('annotation.step2.classes')}
                      <span class="classes-header-spacer"></span>
                      <button id="toggleAllVisibleBtn" class="btn-class-batch" title="Hide all classes">${icon('eyeOff')}</button>
                      <button id="toggleAllLockedBtn" class="btn-class-batch" title="Lock all classes">${icon('lock')}</button>
                      <button id="addClassBtn" class="btn-add-class" title="Add class">+</button>
                    </div>
                    <div class="brush-size-control" title="Opacity of the painted classes. Hold V to peek at the raw image.">
                      <span class="control-label">Overlay</span>
                      <input type="range" id="overlayOpacitySlider" min="0" max="100" value="70"
                             class="brush-slider range-slider" title="Overlay opacity">
                      <span id="overlayOpacityValue" class="brush-size-value">70%</span>
                    </div>
                    <div class="overlay-hint">Hold <kbd>V</kbd> to peek at the image</div>
                    <input type="color" id="classColorInput" class="class-color-input" aria-label="Class colour">
                    <div id="classList" class="class-list">
                      <!-- Classes will be rendered dynamically -->
                    </div>
                  </div>

                  <!-- Suggest (pixel classifier), collapsible -->
                  <div class="sv-section suggest-section" id="suggestSection">
                    <div class="sv-section-header suggest-header" id="suggestHeader" title="Show / hide">
                      <span class="suggest-caret">${icon('caretRight')}</span>
                      <h4>Suggest</h4>
                      ${this.renderHelpIcon('annotation.step2.suggest')}
                    </div>
                    <div class="suggest-body" id="suggestBody">
                      <label class="suggest-field" title="Strokes of this class are background examples. Its pixels are written as unlabeled (0) when you create the annotation.">
                        <span>Background class (examples of what to leave empty)</span>
                        <select id="suggestBackground"></select>
                      </label>
                      <button id="addBackgroundClassBtn" class="btn secondary suggest-add-bg" title="Add a class named Background and mark it as the background class">+ Add background class</button>
                      <div class="brush-size-control" title="Pixels predicted with lower confidence are left empty">
                        <span class="control-label">Min conf.</span>
                        <input type="range" id="suggestConfidence" min="0" max="100" value="60"
                               class="brush-slider range-slider" title="Minimum confidence">
                        <span id="suggestConfidenceValue" class="brush-size-value">60%</span>
                      </div>
                      <label class="suggest-check" title="Median filter on the prediction to remove speckles">
                        <input type="checkbox" id="suggestSmooth" checked> Smooth result
                      </label>
                      <div class="suggest-buttons">
                        <button id="suggestBtn" class="btn primary" title="Train on your strokes and suggest the current slice (S)">
                          Suggest slice
                        </button>
                      </div>
                      <div class="suggest-range">
                        <input type="number" id="suggestFrom" min="1" value="1" title="First slice">
                        <span>to</span>
                        <input type="number" id="suggestTo" min="1" value="1" title="Last slice">
                        <button id="suggestRangeBtn" class="btn secondary" title="Suggest every slice in the range">Range</button>
                      </div>
                      <div id="suggestStatus" class="suggest-status"></div>
                      <div id="suggestActions" class="suggest-actions" hidden>
                        <button id="acceptSuggestionBtn" class="btn primary" title="Write the suggestion into empty pixels of this slice (A)">Accept</button>
                        <button id="discardSuggestionBtn" class="btn secondary" title="Drop the suggestion for this slice">Discard</button>
                        <button id="acceptAllSuggestionsBtn" class="btn secondary" title="Accept every pending suggestion" hidden>Accept all</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <button id="step2Back" class="btn secondary">Back</button>
                <button id="createAnnotationBtn" class="btn primary" disabled>
                  <span class="btn-glyph">&#9658;</span> Create Annotation
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  // ===========================================================================
  // INITIALIZE METHOD
  // ===========================================================================

  async initialize() {
    // Initialize API client
    this.api = new AnnotationAPI();

    // Initialize step navigator
    this.stepNavigator = new StepNavigator({
      steps: this.config.steps,
      currentStep: this.currentStep,
      onStepClick: (stepNum) => {
        if (this.canNavigateToStep(stepNum)) {
          this.goToStep(stepNum);
        }
      },
      canNavigate: (stepNum) => this.canNavigateToStep(stepNum)
    });

    // Find the step-nav container (which is inside the module container)
    // The step nav HTML is rendered by BaseModule.renderStepNav()
    const stepNavContainer = this.container.querySelector('.step-nav');
    if (stepNavContainer) {
      // StepNavigator.init() expects the parent that contains .step elements
      this.stepNavigator.init(stepNavContainer.parentElement || stepNavContainer);
    }

    // Initialize validation display - takes container ID in constructor
    this.validationDisplay = new ValidationDisplay('validationResult');

    // =========================================================================
    // Initialize FileSelector
    // =========================================================================

    const fileSelectorContainer = document.getElementById('fileSelectorContainer');
    if (fileSelectorContainer) {
      this.fileSelector = new FileSelector({
        id: 'annotation_source',
        fileType: 'uploads',  // New metadata system: uploads category
        filterTags: ['raw'],  // Filter to raw images only
        title: 'Source Image',
        icon: 'image',
        helpIconHtml: this.renderHelpIcon('annotation.step1.source-image'),
        accept: '.tif,.tiff',
        showRecentResults: true,
        stateManager: this.state,
        onSelect: this.onFileSelected,
        onUpload: this.onFileUploaded,
        // Recent Results: denoised stacks users might want to annotate
        resultCategories: ['results', 'denoised_images'],
        resultCategoryLabels: {
          'results': 'Result',
          'denoised_images': 'Denoised'
        },
        // Recent results: only denoised image data, not info/wip files
        filterRecentResults: (files) => files.filter(isImageResultFile),
        // Workspace files: raw image stacks (new annotation)
        filterFiles: (files) => files.filter(isRawImageFile),
        // Resume / edit / correct: WIP results, finished annotations and segmentation
        // results are not raw images, so they get their own groups (the mode is
        // decided from the tags in onFileSelected)
        extraGroups: [
          { label: 'Unfinished annotations (resume)', filter: (files) => files.filter(isUnfinishedAnnotation) },
          { label: 'Existing annotations (edit)', filter: (files) => files.filter(isFinishedAnnotation) },
          { label: 'Segmentation results (correct)', filter: (files) => files.filter(isSegmentationResult) }
        ]
      });

      fileSelectorContainer.innerHTML = this.fileSelector.render();
      await this.fileSelector.init();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Start autosave interval (enabled by default)
    if (this.autosaveEnabled) {
      this.startAutosaveInterval();
    }

    window.annotationModule = this;

    await this.consumeCorrectionHandoff();

    console.log('[AnnotationModule] Initialized');
  }

  /**
   * "Correct in Annotation" from the segmentation module leaves the inference
   * result in state; open it as a segmentation result to correct (ADR-014).
   */
  async consumeCorrectionHandoff() {
    const incoming = this.state?.get?.('modules.segmentation.correctionFile');
    if (!incoming?.path) return;
    this.state.update('modules.segmentation.correctionFile', null);

    try {
      const files = await this.fetchWorkspaceFiles();
      // Inference results carry a web path (/workspaces/<session>/results/...);
      // workspace entries are workspace-relative (results/...)
      const rel = String(incoming.path).replace(/^\/?workspaces\/[^/]+\//, '').replace(/^\/+/, '');
      const file = files.find(f => f.path === rel || f.path === incoming.path || f.id === incoming.id)
        || files.find(f => rel.endsWith(f.path));
      if (!file) {
        this.state.notify?.('error', 'The segmentation result was not found in the workspace');
        return;
      }
      if (this.currentStep !== 1) this.goToStep(1);
      this.fileSelector?.setSelectedFile(file);
      await this.onFileSelected(file);
      this.state.notify?.('info', 'Correct the segmentation, then create the annotation to train on it');
    } catch (error) {
      console.error('[AnnotationModule] Correction hand-off failed:', error);
    }
  }

  // ===========================================================================
  // EVENT LISTENERS
  // ===========================================================================

  setupEventListeners() {
    // Back to Hub button
    const backButton = document.getElementById('backToHub');
    if (backButton) {
      backButton.addEventListener('click', () => {
        if (this.isDirty) {
          const confirmed = confirm(
            'You have unsaved annotations. Are you sure you want to leave?'
          );
          if (!confirmed) return;
        }
        window.workspace.returnToHub();
      });
    }

    // Step 1: Next button
    const step1Next = this.container.querySelector('#step1Next');
    if (step1Next) {
      step1Next.addEventListener('click', () => {
        if (this.sourceFileLoaded) {
          this.goToStep(2);
        }
      });
    }

    // Step 2: Back button
    const step2Back = this.container.querySelector('#step2Back');
    if (step2Back) {
      step2Back.addEventListener('click', () => {
        this.goToStep(1);
      });
    }

    // Save Progress button
    const saveProgressBtn = this.container.querySelector('#saveProgressBtn');
    if (saveProgressBtn) {
      saveProgressBtn.addEventListener('click', () => this.saveProgress());
    }

    // Create Annotation button
    const createAnnotationBtn = this.container.querySelector('#createAnnotationBtn');
    if (createAnnotationBtn) {
      createAnnotationBtn.addEventListener('click', () => this.createAnnotation());
    }

    // Autosave toggle
    const autosaveToggle = this.container.querySelector('#autosaveToggle');
    if (autosaveToggle) {
      autosaveToggle.addEventListener('change', (e) => {
        this.toggleAutosave(e.target.checked);
      });
    }

    // =========================================================================
    // Canvas Controls
    // =========================================================================

    // Shared viewer chrome: slice nav / slider / zoom buttons / ←→ keys
    this.chrome.mount(this.container.querySelector('#step2'));

    // Keyboard shortcuts for slice navigation and tools
    this.keydownHandler = (e) => {
      // Only handle if Step 2 is active
      if (this.currentStep !== 2) return;

      // Don't handle if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
        return;
      }

      // Peek at the raw image while V is held
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey) {
        if (!e.repeat) this.brushEngine?.setOverlayVisible(false);
        return;
      }

      // 1-9: select the n-th class
      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const cls = this.brushEngine?.getClasses()[parseInt(e.key, 10) - 1];
        if (cls) this.selectClass(cls.id);
        return;
      }

      // S: suggest the current slice, A: accept its suggestion
      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.suggestSlices([this.currentSlice]);
        return;
      }
      if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey) {
        if (this.suggestions.has(this.currentSlice)) { e.preventDefault(); this.acceptSuggestion(); }
        return;
      }

      // ←/→ slice navigation is handled by SliceViewerChrome
      if (e.key === 'b' || e.key === 'B') {
        this.setTool('brush');
      } else if (e.key === 'e' || e.key === 'E') {
        this.setTool('eraser');
      } else if (e.key === 'f' || e.key === 'F') {
        this.setTool('fill');
      } else if (e.key === '[') {
        this.adjustBrushSize(-5);
      } else if (e.key === ']') {
        this.adjustBrushSize(5);
      } else if (e.key === ',') {
        this.jumpToKeyframe(-1);
      } else if (e.key === '.') {
        this.jumpToKeyframe(1);
      }
    };
    document.addEventListener('keydown', this.keydownHandler);

    // Release the peek when V comes up, or when the window loses focus mid-peek
    this.keyupHandler = (e) => {
      if (e.key === 'v' || e.key === 'V') this.brushEngine?.setOverlayVisible(true);
    };
    document.addEventListener('keyup', this.keyupHandler);
    this.blurHandler = () => this.brushEngine?.setOverlayVisible(true);
    window.addEventListener('blur', this.blurHandler);

    // =========================================================================
    // Toolbar Controls
    // =========================================================================

    // Tool buttons
    const toolBrush = this.container.querySelector('#toolBrush');
    const toolEraser = this.container.querySelector('#toolEraser');

    if (toolBrush) {
      toolBrush.addEventListener('click', () => this.setTool('brush'));
    }
    if (toolEraser) {
      toolEraser.addEventListener('click', () => this.setTool('eraser'));
    }
    const toolFill = this.container.querySelector('#toolFill');
    if (toolFill) {
      toolFill.addEventListener('click', () => this.setTool('fill'));
    }

    // Overlay opacity slider
    const overlaySlider = this.container.querySelector('#overlayOpacitySlider');
    if (overlaySlider) {
      overlaySlider.addEventListener('input', (e) => {
        this.setOverlayOpacity(parseInt(e.target.value, 10));
      });
    }

    // Batch visibility / lock
    this.container.querySelector('#toggleAllVisibleBtn')?.addEventListener('click', () => this.toggleAllVisible());
    this.container.querySelector('#toggleAllLockedBtn')?.addEventListener('click', () => this.toggleAllLocked());

    // Suggest (pixel classifier): collapsible section, state remembered per browser
    const suggestHeader = this.container.querySelector('#suggestHeader');
    if (suggestHeader) {
      suggestHeader.addEventListener('click', (e) => {
        if (e.target.closest('.help-icon')) return;
        this.setSuggestCollapsed(!this.isSuggestCollapsed());
      });
    }
    let collapsed = true;
    try { collapsed = localStorage.getItem('annotation.suggestCollapsed') !== '0'; } catch (e) { /* ignore */ }
    this.setSuggestCollapsed(collapsed, false);
    this.container.querySelector('#suggestBtn')?.addEventListener('click', () => this.suggestSlices([this.currentSlice]));
    this.container.querySelector('#suggestRangeBtn')?.addEventListener('click', () => {
      const from = parseInt(this.container.querySelector('#suggestFrom')?.value, 10);
      const to = parseInt(this.container.querySelector('#suggestTo')?.value, 10);
      if (!Number.isInteger(from) || !Number.isInteger(to)) return;
      const a = Math.max(1, Math.min(from, to)), b = Math.min(this.totalSlices, Math.max(from, to));
      const slices = [];
      for (let i = a; i <= b; i++) slices.push(i - 1);
      this.suggestSlices(slices);
    });
    this.container.querySelector('#acceptSuggestionBtn')?.addEventListener('click', () => this.acceptSuggestion());
    this.container.querySelector('#discardSuggestionBtn')?.addEventListener('click', () => this.discardSuggestion());
    this.container.querySelector('#acceptAllSuggestionsBtn')?.addEventListener('click', () => this.acceptAllSuggestions());
    this.container.querySelector('#suggestBackground')?.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      this.brushEngine?.setClassRole(Number.isInteger(v) ? v : null, Number.isInteger(v) ? 'background' : null);
      this.classifierTrainedVersion = -1;   // the background choice is part of the model
      this.isDirty = true;
      this.updateSaveButtonState();
      this.renderClassList();
    });
    this.container.querySelector('#addBackgroundClassBtn')?.addEventListener('click', () => {
      if (!this.brushEngine) return;
      const cls = this.brushEngine.addClass('Background', '#9E9E9E', 'background');
      this.classifierTrainedVersion = -1;
      this.renderClassList();
      this.updateSliceMarks();
      this.setSuggestStatus(`"${cls.name}" added and selected: paint a few strokes on cytoplasm, resin or anything that is not a structure.`);
    });
    const confSlider = this.container.querySelector('#suggestConfidence');
    if (confSlider) {
      confSlider.addEventListener('input', (e) => {
        const v = this.container.querySelector('#suggestConfidenceValue');
        if (v) v.textContent = `${e.target.value}%`;
      });
    }

    // Rename: double-click on a class name. Delegated to the list container
    // because the list is re-rendered on selection and per-item listeners
    // would sit on a replaced node by the time dblclick fires.
    const classListEl = this.container.querySelector('#classList');
    if (classListEl) {
      classListEl.addEventListener('dblclick', (e) => {
        const item = e.target.closest('.class-item');
        if (!item || e.target.closest('button') || e.target.closest('.class-name-input')) return;
        e.preventDefault();
        const classId = parseInt(item.dataset.classId, 10);
        const nameEl = item.querySelector('[data-action="name"]');
        if (nameEl) this.startRenameClass(classId, nameEl);
      });
    }

    // Colour picker (one persistent input; the swatch click sets its target class)
    const colorInput = this.container.querySelector('#classColorInput');
    if (colorInput) {
      colorInput.addEventListener('input', (e) => {
        const classId = parseInt(colorInput.dataset.classId, 10);
        if (!Number.isNaN(classId) && this.brushEngine) {
          this.brushEngine.setClassColor(classId, e.target.value);
          this.renderClassList();
          this.updateSliceMarks();
        }
      });
    }

    // Brush size slider
    const brushSizeSlider = this.container.querySelector('#brushSizeSlider');
    if (brushSizeSlider) {
      brushSizeSlider.addEventListener('input', (e) => {
        this.setBrushSize(parseInt(e.target.value, 10));
      });
    }

    // Add class button
    const addClassBtn = this.container.querySelector('#addClassBtn');
    if (addClassBtn) {
      addClassBtn.addEventListener('click', () => this.addClass());
    }

    // Revert last interpolation
    const revertBtn = this.container.querySelector('#revertInterpolationBtn');
    if (revertBtn) {
      revertBtn.addEventListener('click', () => this.revertLastInterpolation());
    }

    // Undo/Redo buttons
    const undoBtn = this.container.querySelector('#undoBtn');
    const redoBtn = this.container.querySelector('#redoBtn');

    if (undoBtn) {
      undoBtn.addEventListener('click', () => this.undo());
    }
    if (redoBtn) {
      redoBtn.addEventListener('click', () => this.redo());
    }

    // Beforeunload warning for unsaved changes
    this.beforeUnloadHandler = (e) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved annotations. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  // ===========================================================================
  // STEP NAVIGATION
  // ===========================================================================

  canNavigateToStep(stepNum) {
    switch (stepNum) {
      case 1:
        return true;
      case 2:
        return this.sourceFileLoaded;
      default:
        return false;
    }
  }

  goToStep(stepNum) {
    // Hide all steps
    const stepContents = this.container.querySelectorAll('.step-content');
    stepContents.forEach(step => step.classList.remove('active'));

    // Show target step
    const targetStep = this.container.querySelector(`#step${stepNum}`);
    if (targetStep) {
      targetStep.classList.add('active');
    }

    // Update step navigator
    this.currentStep = stepNum;
    if (this.stepNavigator) {
      this.stepNavigator.update(stepNum);
    }

    // Toggle step2-active class for CSS :has() fallback (browser compatibility)
    const moduleContainer = this.container.querySelector('.annotation-module');
    if (moduleContainer) {
      if (stepNum === 2) {
        moduleContainer.classList.add('step2-active');
      } else {
        moduleContainer.classList.remove('step2-active');
      }
    }

    // Initialize canvas when entering Step 2
    if (stepNum === 2) {
      this.initializeCanvas();
    }

    console.log(`[AnnotationModule] Navigated to step ${stepNum}`);
  }

  // ===========================================================================
  // CANVAS MANAGEMENT
  // ===========================================================================

  /**
   * Initialize the annotation canvas
   */
  async initializeCanvas() {
    const canvasArea = this.chrome?.area;
    if (!canvasArea) {
      console.error('[AnnotationModule] Canvas area not found');
      return;
    }

    // Show loading
    this.showCanvasLoading(true);

    try {
      // Create canvas if not exists
      if (!this.canvas) {
        this.canvas = new AnnotationCanvas(canvasArea);

        // Set up canvas event callbacks
        this.canvas.onZoomChange = (zoom) => {
          this.updateZoomIndicator(zoom);
        };

        this.canvas.onMouseMove = (coords) => {
          this.updateCoordsDisplay(coords);
          // Update brush preview
          if (this.brushEngine) {
            this.brushEngine.updatePreview(coords);
          }
        };

        this.canvas.onSliceLoaded = (info) => {
          this.updateDimensionsDisplay(info.width, info.height);
          // Initialize brush engine with image dimensions
          if (this.brushEngine) {
            this.brushEngine.initialize(info.width, info.height);
            this.brushEngine.renderAnnotations();
          }
        };
      }

      // Create history manager if not exists
      if (!this.historyManager) {
        this.historyManager = new HistoryManager({ maxStatesPerSlice: 20 });

        // Update button states when history changes
        this.historyManager.onHistoryChange = (info) => {
          this.updateHistoryButtons();
        };
      }

      // Create brush engine if not exists
      if (!this.brushEngine) {
        this.brushEngine = new BrushEngine(this.canvas);

        // Set up brush engine callbacks
        this.brushEngine.onStrokeStart = () => {
          // Save state before the stroke begins (for undo)
          const sliceIndex = this.canvas.currentSlice || 0;
          const data = this.brushEngine.getAnnotationData();
          if (data) {
            this.historyManager.saveState(sliceIndex, data);
          }
        };

        this.brushEngine.onStrokeEnd = () => {
          // Update history buttons after stroke
          this.updateHistoryButtons();
          // A painted slice counts as reviewed: drop its "interpolated" mark
          this.interpolatedSlices.delete(this.canvas.currentSlice || 0);
          this.refreshPresence(this.canvas.currentSlice || 0);
          this.updateSliceMarks();
          this.noteLabelsChanged();
        };

        // The engine may change a class itself (auto-showing a hidden active class)
        this.brushEngine.onClassesChange = () => {
          this.renderClassList();
        };

        // Alt+click eyedropper changed the active class
        this.brushEngine.onClassPicked = () => {
          this.renderClassList();
          this.updateSliceMarks();
        };

        // Painting with a locked class is refused
        this.brushEngine.onLockedStroke = (cls) => {
          this.state?.notify?.('info', `${cls.name} is locked. Unlock it (padlock in the class list) to paint with it.`, 3000);
        };

        this.brushEngine.onAnnotationChange = () => {
          // Mark as dirty for unsaved changes warning
          this.isDirty = true;
          // Update save button states
          this.updateSaveButtonState();
        };

        // Cancel stroke and undo when two-finger gesture interrupts drawing
        this.brushEngine.onStrokeCancel = () => {
          this.undo();
        };

        // Wire up two-finger gesture detection to stroke cancellation
        this.canvas.onTwoFingerStart = () => {
          this.brushEngine.cancelCurrentStroke();
        };

        // Render initial class list
        this.renderClassList();
      }

      // Handle resume/edit workflow
      if (this.isResuming && this.annotationFile) {
        await this.loadExistingAnnotation();
      } else {
        // New annotation - get file ID and slice count from source file
        const fileId = this.sourceFile?.id || this.sourceFile?.path;
        this.totalSlices = this.tiffInfo?.sliceCount || 1;
        this.currentSlice = 0;

        // Update UI
        this.updateSliceIndicator();
        this.updateSliceButtons();

        // Load first slice
        if (fileId) {
          await this.canvas.loadSlice(fileId, this.currentSlice);
          this.updateZoomIndicator(this.canvas.getZoom());
        }
      }

    } catch (error) {
      console.error('[AnnotationModule] Canvas initialization error:', error);
      if (this.state?.notify) {
        this.state.notify('error', `Failed to load image: ${error.message}`);
      }
    } finally {
      this.showCanvasLoading(false);
    }
  }

  /**
   * Navigate to a specific slice
   * @param {number} index - Slice index (0-based)
   */
  async goToSlice(index) {
    // Validate index
    if (index < 0 || index >= this.totalSlices) {
      return;
    }

    // Don't reload if already on this slice
    if (index === this.currentSlice) {
      return;
    }

    const fileId = this.sourceFile?.id || this.sourceFile?.path;
    if (!fileId || !this.canvas) {
      return;
    }

    // Serialize concurrent navigations (rapid arrow-key auto-repeat, double-clicks).
    // Only the most recent navigation runs post-load processing and owns the loading
    // overlay; superseded awaits bail out so a stale load can't overwrite currentSlice
    // or re-render annotations for the wrong slice.
    const navToken = ++this.sliceNavToken;
    this.showCanvasLoading(true);

    try {
      await this.canvas.loadSlice(fileId, index);
      if (navToken !== this.sliceNavToken) {
        return;
      }
      this.currentSlice = index;
      this.updateSliceIndicator();
      this.updateSliceButtons();

      // Re-render annotations for the new slice
      if (this.brushEngine) {
        this.brushEngine.renderAnnotations();
      }
      this.renderSuggestion();
      this.updateSuggestActions();

      // Update history buttons for the new slice
      this.updateHistoryButtons();
    } catch (error) {
      if (navToken !== this.sliceNavToken) {
        return;
      }
      console.error('[AnnotationModule] Error loading slice:', error);
      if (this.state?.notify) {
        this.state.notify('error', `Failed to load slice ${index + 1}`);
      }
    } finally {
      if (navToken === this.sliceNavToken) {
        this.showCanvasLoading(false);
      }
    }
  }

  /**
   * Update slice indicator text
   */
  updateSliceIndicator() {
    this.chrome?.setSlice(this.currentSlice, this.totalSlices);
  }

  /**
   * Update slice navigation control states (prev/next buttons + slider)
   */
  updateSliceButtons() {
    // Prev/next buttons, number field and slider all live in the chrome
    this.chrome?.setSlice(this.currentSlice, this.totalSlices);
  }

  /**
   * Update zoom indicator
   * @param {number} zoom - Current zoom level
   */
  updateZoomIndicator(zoom) {
    this.chrome?.setZoom(zoom);
  }

  /**
   * Update coordinates display
   * @param {object} coords - Coordinate info from canvas
   */
  updateCoordsDisplay(coords) {
    this.chrome?.setFooter(coords.inBounds
      ? `X: ${Math.floor(coords.source.x)} Y: ${Math.floor(coords.source.y)}`
      : 'X: -- Y: --');
  }

  /**
   * Update dimensions display
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  updateDimensionsDisplay(width, height) {
    this.chrome?.setFooter(undefined, `${width} × ${height}`);
  }

  /**
   * Show/hide canvas loading overlay
   * @param {boolean} show - Whether to show loading
   */
  showCanvasLoading(show) {
    this.chrome?.setStatus(show ? 'Loading slice…' : null);
  }

  // ===========================================================================
  // TOOL MANAGEMENT
  // ===========================================================================

  /**
   * Set the active tool
   * @param {'brush' | 'eraser'} tool - Tool to activate
   */
  setTool(tool) {
    if (!this.brushEngine) return;

    this.brushEngine.setTool(tool);

    // Update UI
    for (const [id, name] of [['#toolBrush', 'brush'], ['#toolEraser', 'eraser'], ['#toolFill', 'fill']]) {
      this.container.querySelector(id)?.classList.toggle('active', tool === name);
    }
  }

  /**
   * Set overlay opacity (slider + engine)
   * @param {number} percent - 0-100
   */
  setOverlayOpacity(percent) {
    if (!this.brushEngine) return;
    this.brushEngine.setOverlayOpacity(percent);
    const slider = this.container.querySelector('#overlayOpacitySlider');
    const value = this.container.querySelector('#overlayOpacityValue');
    if (slider) slider.value = percent;
    if (value) value.textContent = `${Math.round(percent)}%`;
  }

  /**
   * Set the brush size
   * @param {number} size - Brush size in pixels
   */
  setBrushSize(size) {
    if (!this.brushEngine) return;

    // The slider range is the source of truth (the engine's own clamp is wider)
    const slider = this.container.querySelector('#brushSizeSlider');
    const value = this.container.querySelector('#brushSizeValue');
    const min = slider ? parseInt(slider.min, 10) || 1 : 1;
    const max = slider ? parseInt(slider.max, 10) || 50 : 50;
    this.brushEngine.setBrushSize(Math.min(max, Math.max(min, size)));

    if (slider) slider.value = this.brushEngine.getBrushSize();
    if (value) value.textContent = `${this.brushEngine.getBrushSize()}px`;
  }

  /**
   * Adjust brush size by delta
   * @param {number} delta - Amount to add/subtract
   */
  adjustBrushSize(delta) {
    if (!this.brushEngine) return;

    const currentSize = this.brushEngine.getBrushSize();
    this.setBrushSize(currentSize + delta);
  }

  // ===========================================================================
  // CLASS MANAGEMENT
  // ===========================================================================

  /**
   * Add a new class
   */
  addClass() {
    if (!this.brushEngine) return;

    this.brushEngine.addClass();
    this.renderClassList();
    this.updateSliceMarks();
  }

  /**
   * Delete a class
   * @param {number} classId - Class ID to delete
   */
  deleteClass(classId) {
    if (!this.brushEngine) return;

    // Confirm deletion
    if (!confirm('Delete this class? All annotations with this class will be removed.')) {
      return;
    }

    this.brushEngine.deleteClass(classId);
    if (this.lastInterpolation?.classId === classId) {
      this.lastInterpolation = null;
      this.updateRevertButton();
    }
    this.refreshAllPresence();
    this.renderClassList();
    this.updateSliceMarks();
    this.noteLabelsChanged();
  }

  /**
   * Select a class as active
   * @param {number} classId - Class ID to select
   */
  selectClass(classId) {
    if (!this.brushEngine) return;
    if (this.brushEngine.activeClassId === classId) return;

    this.brushEngine.setActiveClass(classId);
    this.renderClassList();
    this.updateSliceMarks();
  }

  /**
   * Toggle class visibility
   * @param {number} classId - Class ID to toggle
   */
  toggleClassVisibility(classId) {
    if (!this.brushEngine) return;

    this.brushEngine.toggleClassVisibility(classId);
    this.renderClassList();
  }

  /**
   * Toggle class lock
   * @param {number} classId - Class ID to toggle
   */
  toggleClassLock(classId) {
    if (!this.brushEngine) return;

    this.brushEngine.toggleClassLock(classId);
    this.renderClassList();
  }

  /**
   * Open the colour picker for a class
   * @param {number} classId
   */
  openColorPicker(classId) {
    const cls = this.brushEngine?.getClasses().find(c => c.id === classId);
    const input = this.container.querySelector('#classColorInput');
    if (!cls || !input) return;
    input.dataset.classId = String(classId);
    input.value = cls.color;
    input.click();
  }

  /**
   * Replace a class name with an inline editor; Enter/blur commit, Escape cancels
   * @param {number} classId
   * @param {HTMLElement} nameEl - the .class-name span
   */
  startRenameClass(classId, nameEl) {
    const cls = this.brushEngine?.getClasses().find(c => c.id === classId);
    if (!cls) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'class-name-input';
    input.value = cls.name;
    input.maxLength = 40;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      if (commit && this.brushEngine?.renameClass(classId, input.value)) {
        this.isDirty = true;
        this.updateSaveButtonState();
      }
      this.renderClassList();
      this.updateSliceMarks();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();   // keep B/E/F/1-9 shortcuts out of the editor
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  /**
   * Show every class if any is hidden, otherwise hide all
   */
  toggleAllVisible() {
    if (!this.brushEngine) return;
    const anyHidden = this.brushEngine.getClasses().some(c => !c.visible);
    this.brushEngine.setAllVisible(anyHidden);
    this.renderClassList();
  }

  /**
   * Unlock every class if all are locked, otherwise lock all
   */
  toggleAllLocked() {
    if (!this.brushEngine) return;
    const classes = this.brushEngine.getClasses();
    const allLocked = classes.length > 0 && classes.every(c => c.locked);
    this.brushEngine.setAllLocked(!allLocked);
    this.renderClassList();
  }

  /**
   * The batch buttons show the action they will perform
   * @param {Array} classes
   */
  updateBatchButtons(classes) {
    const visBtn = this.container.querySelector('#toggleAllVisibleBtn');
    const lockBtn = this.container.querySelector('#toggleAllLockedBtn');
    const anyHidden = classes.some(c => !c.visible);
    const allLocked = classes.length > 0 && classes.every(c => c.locked);
    if (visBtn) {
      visBtn.innerHTML = anyHidden ? icon('eye') : icon('eyeOff');
      visBtn.title = anyHidden ? 'Show all classes' : 'Hide all classes';
    }
    if (lockBtn) {
      lockBtn.innerHTML = allLocked ? icon('lockOpen') : icon('lock');
      lockBtn.title = allLocked ? 'Unlock all classes' : 'Lock all classes';
    }
  }

  /**
   * Render the class list UI
   */
  renderClassList() {
    const classList = this.container.querySelector('#classList');
    if (!classList || !this.brushEngine) return;

    const classes = this.brushEngine.getClasses();
    const activeClass = this.brushEngine.getActiveClass();

    classList.innerHTML = classes.map(cls => `
      <div class="class-item ${cls.id === activeClass?.id ? 'active' : ''} ${cls.locked ? 'is-locked' : ''}"
           data-class-id="${cls.id}">
        <span class="class-color" style="background: ${cls.color};" title="Change colour" data-action="color"></span>
        <span class="class-name" title="${escapeHtml(cls.name)} (double-click to rename)" data-action="name">${escapeHtml(cls.name)}</span>
        ${cls.role === 'background' ? `<span class="class-badge" title="Background examples for the classifier; written as 0 (unlabeled) on Create Annotation">bg</span>` : ''}
        <button class="class-interpolate" title="${cls.locked ? 'Unlock the class to interpolate it' : 'Interpolate between annotated slices…'}" data-action="interpolate">
          ${icon('layers')}
        </button>
        <button class="class-lock ${cls.locked ? 'is-locked' : 'is-unlocked'}"
                title="${cls.locked ? 'Unlock class' : 'Lock class (no stroke can change its pixels, even when visible)'}" data-action="lock">
          ${cls.locked ? icon('lock') : icon('lockOpen')}
        </button>
        <button class="class-visibility ${cls.visible ? 'is-visible' : 'is-hidden'}"
                title="${cls.visible ? 'Hide class (hidden classes are protected from painting)' : 'Show class'}" data-action="visibility">
          ${cls.visible ? icon('eye') : icon('eyeOff')}
        </button>
        <button class="class-delete" title="Delete class" data-action="delete">×</button>
      </div>
    `).join('');

    this.updateBatchButtons(classes);
    this.populateBackgroundSelect(classes);

    // Attach event listeners to class items
    classList.querySelectorAll('.class-item').forEach(item => {
      const classId = parseInt(item.dataset.classId, 10);

      // Visibility toggle button
      const visibilityBtn = item.querySelector('[data-action="visibility"]');
      if (visibilityBtn) {
        visibilityBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleClassVisibility(classId);
        });
      }

      // Colour swatch: open the picker for this class
      const swatch = item.querySelector('[data-action="color"]');
      if (swatch) {
        swatch.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.selectClass(classId);
          this.openColorPicker(classId);
        });
      }

      // Lock toggle button
      const lockBtn = item.querySelector('[data-action="lock"]');
      if (lockBtn) {
        lockBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleClassLock(classId);
        });
      }

      // Interpolate button
      const interpolateBtn = item.querySelector('[data-action="interpolate"]');
      if (interpolateBtn) {
        interpolateBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openInterpolateDialog(classId);
        });
      }

      // Delete button
      const deleteBtn = item.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.deleteClass(classId);
        });
      }

      // Click anywhere on the item to select (except action buttons)
      item.addEventListener('click', (e) => {
        // Don't select if clicking on the action buttons
        if (e.target.closest('.class-visibility') || e.target.closest('.class-delete') ||
            e.target.closest('.class-interpolate') || e.target.closest('.class-lock') ||
            e.target.closest('.class-color') || e.target.closest('.class-name-input')) {
          return;
        }
        this.selectClass(classId);
      });
    });
  }

  // ===========================================================================
  // HISTORY MANAGEMENT (UNDO/REDO)
  // ===========================================================================

  /**
   * Undo the last stroke on the current slice
   */
  undo() {
    if (!this.historyManager || !this.brushEngine) return;

    const sliceIndex = this.canvas?.currentSlice || 0;

    if (!this.historyManager.canUndo(sliceIndex)) {
      console.log('[AnnotationModule] Nothing to undo');
      return;
    }

    // Get current data to save to redo stack
    const currentData = this.brushEngine.getAnnotationData();

    // Get previous state
    const previousState = this.historyManager.undo(sliceIndex, currentData);

    if (previousState) {
      // Restore the previous state
      this.brushEngine.setAnnotationData(sliceIndex, previousState);
      this.brushEngine.renderAnnotations();
      this.refreshPresence(sliceIndex);
      this.updateSliceMarks();
      this.noteLabelsChanged();
      console.log('[AnnotationModule] Undo applied');
    }

    this.updateHistoryButtons();
  }

  /**
   * Redo a previously undone stroke
   */
  redo() {
    if (!this.historyManager || !this.brushEngine) return;

    const sliceIndex = this.canvas?.currentSlice || 0;

    if (!this.historyManager.canRedo(sliceIndex)) {
      console.log('[AnnotationModule] Nothing to redo');
      return;
    }

    // Get current data to save to undo stack
    const currentData = this.brushEngine.getAnnotationData();

    // Get next state
    const nextState = this.historyManager.redo(sliceIndex, currentData);

    if (nextState) {
      // Restore the next state
      this.brushEngine.setAnnotationData(sliceIndex, nextState);
      this.brushEngine.renderAnnotations();
      this.refreshPresence(sliceIndex);
      this.updateSliceMarks();
      this.noteLabelsChanged();
      console.log('[AnnotationModule] Redo applied');
    }

    this.updateHistoryButtons();
  }

  /**
   * Update the enabled/disabled state of undo/redo buttons
   */
  updateHistoryButtons() {
    const undoBtn = this.container?.querySelector('#undoBtn');
    const redoBtn = this.container?.querySelector('#redoBtn');

    if (!this.historyManager) {
      if (undoBtn) undoBtn.disabled = true;
      if (redoBtn) redoBtn.disabled = true;
      return;
    }

    const sliceIndex = this.canvas?.currentSlice || 0;

    if (undoBtn) {
      undoBtn.disabled = !this.historyManager.canUndo(sliceIndex);
    }
    if (redoBtn) {
      redoBtn.disabled = !this.historyManager.canRedo(sliceIndex);
    }
  }

  // ===========================================================================
  // SLICE INTERPOLATION (ADR-013)
  // ===========================================================================

  /**
   * Recompute which classes are present on one slice (cache for keyframe marks)
   * @param {number} sliceIndex
   */
  refreshPresence(sliceIndex) {
    const data = this.brushEngine?.getAllAnnotations().get(sliceIndex);
    const present = new Set();
    if (data) {
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== 0) present.add(data[i]);
      }
    }
    if (present.size > 0) {
      this.classPresence.set(sliceIndex, present);
    } else {
      this.classPresence.delete(sliceIndex);
    }
  }

  /**
   * Recompute class presence for every slice (after load, delete class, …)
   */
  refreshAllPresence() {
    this.classPresence.clear();
    if (!this.brushEngine) return;
    for (const sliceIndex of this.brushEngine.getAllAnnotations().keys()) {
      this.refreshPresence(sliceIndex);
    }
  }

  /**
   * Slices on which a class is present, ascending (from the presence cache)
   * @param {number} classId
   * @returns {number[]}
   */
  keyframesOf(classId) {
    const slices = [];
    for (const [sliceIndex, present] of this.classPresence) {
      if (present.has(classId)) slices.push(sliceIndex);
    }
    return slices.sort((a, b) => a - b);
  }

  /**
   * Show the active class's annotated slices (solid marks) and the slices the last
   * interpolations filled for it (light marks) above the slice slider
   */
  updateSliceMarks() {
    if (!this.chrome) return;
    const active = this.brushEngine?.getActiveClass();
    if (!active) {
      this.chrome.setMarks([]);
      return;
    }
    const marks = [];
    for (const [sliceIndex, present] of this.classPresence) {
      if (!present.has(active.id)) continue;
      const auto = this.interpolatedSlices.get(sliceIndex)?.has(active.id);
      marks.push({
        index: sliceIndex,
        kind: auto ? 'auto' : 'key',
        color: active.color,
        title: `Slice ${sliceIndex + 1}: ${escapeHtml(active.name)} ${auto ? '(auto-filled, not yet reviewed)' : '(annotated)'}`
      });
    }
    for (const sliceIndex of this.suggestions.keys()) {
      marks.push({ index: sliceIndex, kind: 'pending', title: `Slice ${sliceIndex + 1}: suggestion waiting for review` });
    }
    this.chrome.setMarks(marks);
  }

  /**
   * Jump to the previous/next slice that carries the active class (keys , and .)
   * @param {number} direction - -1 or +1
   */
  jumpToKeyframe(direction) {
    const active = this.brushEngine?.getActiveClass();
    if (!active) return;
    const keyframes = this.keyframesOf(active.id);
    const current = this.currentSlice;
    const target = direction < 0
      ? [...keyframes].reverse().find(k => k < current)
      : keyframes.find(k => k > current);
    if (target !== undefined) this.goToSlice(target);
  }

  /**
   * Open the per-class interpolation dialog
   * @param {number} classId
   */
  openInterpolateDialog(classId) {
    const cls = this.brushEngine?.getClasses().find(c => c.id === classId);
    if (!cls) return;
    this.closeInterpolateDialog();

    if (cls.locked) {
      this.state?.notify?.('info', `${cls.name} is locked. Unlock it to interpolate it.`, 3000);
      return;
    }

    if (this.totalSlices <= 1) {
      this.state?.notify?.('info', 'Interpolation needs an image stack with more than one slice');
      return;
    }

    this.refreshPresence(this.currentSlice);
    const keyframes = this.keyframesOf(classId);
    const keyframeText = keyframes.length
      ? keyframes.map(k => k + 1).join(', ')
      : 'none yet';

    const overlay = document.createElement('div');
    overlay.className = 'annot-dialog-overlay';
    overlay.innerHTML = `
      <div class="annot-dialog" role="dialog" aria-modal="true" aria-labelledby="interpDialogTitle">
        <div class="annot-dialog-header">
          <h4 id="interpDialogTitle">
            <span class="class-color" style="background: ${cls.color};"></span>
            Interpolate ${escapeHtml(cls.name)}
          </h4>
          ${this.renderHelpIcon('annotation.step2.interpolation')}
        </div>
        <p class="annot-dialog-text">
          Annotated on <strong>${keyframes.length}</strong> slice${keyframes.length === 1 ? '' : 's'}:
          <span class="annot-dialog-keyframes">${keyframeText}</span>
        </p>
        <label class="annot-dialog-field">
          <span>Max gap (slices between two annotated slices that still get connected)</span>
          <input type="number" id="interpMaxGap" min="2" max="${Math.max(2, this.totalSlices - 1)}" step="1"
                 value="${DEFAULT_MAX_GAP}">
        </label>
        <div id="interpPlan" class="annot-dialog-plan"></div>
        <p class="annot-dialog-note">
          Only empty pixels are filled. Pixels of other classes are never overwritten.
          Every filled slice gets an undo step, and the whole run can be reverted from the History section.
        </p>
        <div class="annot-dialog-actions">
          <button type="button" class="btn secondary" data-action="cancel">Cancel</button>
          <button type="button" class="btn primary" data-action="run" disabled>Interpolate</button>
        </div>
      </div>
    `;

    const planEl = overlay.querySelector('#interpPlan');
    const gapInput = overlay.querySelector('#interpMaxGap');
    const runBtn = overlay.querySelector('[data-action="run"]');

    const describeGap = (g) => `${g.from + 1} → ${g.to + 1} (${g.count} slice${g.count === 1 ? '' : 's'})`;
    const updatePlan = () => {
      const maxGap = Math.max(2, parseInt(gapInput.value, 10) || DEFAULT_MAX_GAP);
      if (keyframes.length < 2) {
        planEl.innerHTML = '<span class="annot-dialog-warn">Paint this class on at least two slices first.</span>';
        runBtn.disabled = true;
        return null;
      }
      const plan = planGaps(keyframes, maxGap);
      const total = plan.fill.reduce((n, g) => n + g.count, 0);
      const lines = [];
      if (plan.fill.length) {
        lines.push(`<div><strong>${plan.fill.length}</strong> gap${plan.fill.length === 1 ? '' : 's'} to fill, ` +
          `<strong>${total}</strong> slice${total === 1 ? '' : 's'}: ${plan.fill.map(describeGap).join('; ')}</div>`);
      } else {
        lines.push('<div class="annot-dialog-warn">No gap within the max gap. Raise it or add annotated slices.</div>');
      }
      if (plan.skipped.length) {
        lines.push(`<div class="annot-dialog-muted">Skipped (wider than max gap): ${plan.skipped.map(describeGap).join('; ')}</div>`);
      }
      planEl.innerHTML = lines.join('');
      runBtn.disabled = plan.fill.length === 0;
      return { plan, maxGap };
    };
    gapInput.addEventListener('input', updatePlan);
    updatePlan();

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => this.closeInterpolateDialog());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeInterpolateDialog(); });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.closeInterpolateDialog(); }
      if (e.key === 'Enter' && !runBtn.disabled) { e.preventDefault(); runBtn.click(); }
    });
    runBtn.addEventListener('click', async () => {
      const result = updatePlan();
      if (!result) return;
      this.closeInterpolateDialog();
      await this.runInterpolation(classId, result.plan.fill);
    });

    // On <body>, like ResumeDialog, so no animated/transformed ancestor can trap the fixed overlay
    document.body.appendChild(overlay);
    this.interpolateDialog = overlay;
    gapInput.focus();
    gapInput.select();
  }

  /**
   * Close the interpolation dialog if open
   */
  closeInterpolateDialog() {
    if (this.interpolateDialog) {
      this.interpolateDialog.remove();
      this.interpolateDialog = null;
    }
  }

  /**
   * Fill the given gaps for one class. Only background pixels are written; every
   * touched slice gets an undo step and a snapshot for "Revert interpolation".
   * @param {number} classId
   * @param {Array<{from:number,to:number,count:number}>} gaps - from planGaps().fill
   */
  async runInterpolation(classId, gaps) {
    if (!this.brushEngine || !this.historyManager || gaps.length === 0) return;
    const width = this.brushEngine.imageWidth;
    const height = this.brushEngine.imageHeight;
    if (width <= 0 || height <= 0) {
      this.state?.notify?.('error', 'Image not loaded yet');
      return;
    }
    const cls = this.brushEngine.getClasses().find(c => c.id === classId);
    const className = cls ? cls.name : `class ${classId}`;
    const total = gaps.reduce((n, g) => n + g.count, 0);

    this.chrome?.setStatus(`Interpolating ${className}: 0 / ${total} slices…`);
    // Let the status paint before the first gap is computed
    await new Promise(resolve => setTimeout(resolve, 0));

    const all = this.brushEngine.getAllAnnotations();
    const snapshots = new Map();
    let done = 0, filledPixels = 0;
    const t0 = performance.now();

    try {
      const runs = interpolateClass(all, classId, width, height, gaps);
      for (const run of runs) {
        run.masks.forEach((mask, i) => {
          const sliceIndex = run.from + 1 + i;
          const existing = all.get(sliceIndex);
          // Remember the previous content once (null = slice had no data at all)
          if (!snapshots.has(sliceIndex)) {
            snapshots.set(sliceIndex, existing ? new Uint8Array(existing) : null);
          }
          const data = existing || new Uint8Array(width * height);
          if (!existing) this.brushEngine.setAnnotationData(sliceIndex, data);
          this.historyManager.saveState(sliceIndex, data);
          for (let k = 0; k < mask.length; k++) {
            if (mask[k] && data[k] === 0) { data[k] = classId; filledPixels++; }
          }
          this.refreshPresence(sliceIndex);
          if (!this.interpolatedSlices.has(sliceIndex)) this.interpolatedSlices.set(sliceIndex, new Set());
          this.interpolatedSlices.get(sliceIndex).add(classId);
          done++;
        });
        this.chrome?.setStatus(`Interpolating ${className}: ${done} / ${total} slices…`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } catch (error) {
      console.error('[AnnotationModule] Interpolation failed:', error);
      this.state?.notify?.('error', `Interpolation failed: ${error.message}`);
    } finally {
      this.chrome?.setStatus(null);
    }

    this.lastInterpolation = { classId, snapshots };
    this.noteLabelsChanged();
    this.isDirty = true;
    this.updateSaveButtonState();
    this.updateHistoryButtons();
    this.updateRevertButton();
    this.updateSliceMarks();
    this.brushEngine.renderAnnotations();

    const seconds = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`[AnnotationModule] Interpolated ${className}: ${done} slices, ${filledPixels} px, ${seconds}s`);
    this.state?.notify?.('success',
      `${className}: filled ${done} slice${done === 1 ? '' : 's'} in ${gaps.length} gap${gaps.length === 1 ? '' : 's'}. ` +
      'Step through them with , and . to review.');
  }

  /**
   * Restore every slice the last interpolation touched to its content before the run.
   * The restore itself is an undo step on each of those slices.
   */
  revertLastInterpolation() {
    const last = this.lastInterpolation;
    if (!last || !this.brushEngine || !this.historyManager) return;

    const all = this.brushEngine.getAllAnnotations();
    for (const [sliceIndex, snapshot] of last.snapshots) {
      const current = all.get(sliceIndex);
      if (current) this.historyManager.saveState(sliceIndex, current);
      if (snapshot) {
        this.brushEngine.setAnnotationData(sliceIndex, new Uint8Array(snapshot));
      } else {
        this.brushEngine.clearSliceAnnotations(sliceIndex);
      }
      this.interpolatedSlices.get(sliceIndex)?.delete(last.classId);
      if (this.interpolatedSlices.get(sliceIndex)?.size === 0) this.interpolatedSlices.delete(sliceIndex);
      this.refreshPresence(sliceIndex);
    }

    const cls = this.brushEngine.getClasses().find(c => c.id === last.classId);
    this.lastInterpolation = null;
    this.noteLabelsChanged();
    this.isDirty = true;
    this.updateSaveButtonState();
    this.updateHistoryButtons();
    this.updateRevertButton();
    this.updateSliceMarks();
    this.brushEngine.renderAnnotations();
    this.state?.notify?.('info', `Reverted the interpolation of ${cls ? cls.name : 'the class'} on ${last.snapshots.size} slices`);
  }

  /**
   * Show the revert button only while a run can be reverted
   */
  updateRevertButton() {
    const btn = this.container?.querySelector('#revertInterpolationBtn');
    if (btn) btn.hidden = !this.lastInterpolation;
  }

  // ===========================================================================
  // PIXEL CLASSIFIER SUGGESTIONS (ADR-013 §8)
  // ===========================================================================

  /**
   * Labels changed: the trained model is stale and suggestions must be redrawn
   * (accepting a suggestion fills pixels, so the visible remainder shrinks)
   */
  noteLabelsChanged() {
    this.labelsVersion++;
    this.renderSuggestion();
  }

  /**
   * Fill the background-class dropdown; keeps the current choice, otherwise
   * preselects a class whose name looks like "background"
   * @param {Array} classes
   */
  populateBackgroundSelect(classes) {
    const select = this.container?.querySelector('#suggestBackground');
    if (!select) return;
    const background = classes.find(c => c.role === 'background') || null;
    select.innerHTML = `<option value="">(none yet)</option>` +
      classes.map(c => `<option value="${c.id}" ${background && c.id === background.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
    const addBtn = this.container.querySelector('#addBackgroundClassBtn');
    if (addBtn) addBtn.hidden = !!background;
  }

  /**
   * Is the Suggest section collapsed?
   */
  isSuggestCollapsed() {
    return !!this.container?.querySelector('#suggestSection')?.classList.contains('is-collapsed');
  }

  /**
   * Collapse or expand the Suggest section
   * @param {boolean} collapsed
   * @param {boolean} [persist=true] - remember the choice in localStorage
   */
  setSuggestCollapsed(collapsed, persist = true) {
    const section = this.container?.querySelector('#suggestSection');
    const body = this.container?.querySelector('#suggestBody');
    if (!section || !body) return;
    section.classList.toggle('is-collapsed', collapsed);
    body.hidden = collapsed;
    if (persist) {
      try { localStorage.setItem('annotation.suggestCollapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Status line under the Suggest buttons
   * @param {string} text
   * @param {boolean} [isError]
   */
  setSuggestStatus(text, isError = false) {
    const el = this.container?.querySelector('#suggestStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
  }

  /**
   * Show/hide Accept, Discard and Accept all depending on pending suggestions
   */
  updateSuggestActions() {
    const actions = this.container?.querySelector('#suggestActions');
    const acceptAll = this.container?.querySelector('#acceptAllSuggestionsBtn');
    if (!actions) return;
    const hasCurrent = this.suggestions.has(this.currentSlice);
    const pending = this.suggestions.size;
    actions.hidden = pending === 0;
    actions.querySelector('#acceptSuggestionBtn').disabled = !hasCurrent;
    actions.querySelector('#discardSuggestionBtn').disabled = !hasCurrent;
    if (acceptAll) {
      acceptAll.hidden = pending < 2;
      acceptAll.textContent = `Accept all (${pending})`;
    }
    const from = this.container.querySelector('#suggestFrom');
    const to = this.container.querySelector('#suggestTo');
    if (from && to) {
      from.max = this.totalSlices; to.max = this.totalSlices;
      if (!from.dataset.touched) from.value = this.currentSlice + 1;
      if (!to.dataset.touched) to.value = Math.min(this.totalSlices, this.currentSlice + 10);
      from.addEventListener('input', () => { from.dataset.touched = '1'; }, { once: true });
      to.addEventListener('input', () => { to.dataset.touched = '1'; }, { once: true });
    }
  }

  /**
   * Train the classifier on the current labels if the model is missing or stale.
   * Auto-filled slices (interpolation / accepted suggestions the user has not
   * painted on since) are excluded so the model learns from the user's strokes.
   * @returns {Promise<boolean>} true when a usable model exists
   */
  async ensureClassifierTrained() {
    if (this.classifierModelId && this.classifierTrainedVersion === this.labelsVersion) return true;
    const payload = this.prepareAnnotationData();
    if (!payload) return false;
    const labels = {};
    for (const [key, value] of Object.entries(payload.sliceData)) {
      if (!this.interpolatedSlices.has(parseInt(key, 10))) labels[key] = value;
    }
    const background = this.brushEngine.getBackgroundClass();
    if (!background) {
      this.setSuggestStatus('Mark a class as background first (or add one). Its strokes tell the classifier what to leave empty.', true);
      return false;
    }
    if (Object.keys(labels).length === 0) {
      this.setSuggestStatus('Paint some strokes first: a structure class and the background class.', true);
      return false;
    }
    const version = this.labelsVersion;
    this.setSuggestStatus('Training on your strokes…');
    const result = await this.api.trainClassifier({
      sourceFileId: payload.sourceFileId,
      labels,
      classes: this.brushEngine.getClasses().map(c => c.id),
      backgroundClass: background.id
    });
    if (!result.success) {
      this.setSuggestStatus(result.error || 'Training failed', true);
      return false;
    }
    this.classifierModelId = result.modelId;
    this.classifierTrainedVersion = version;
    const oob = Number.isFinite(result.oobAccuracy) ? ` · est. accuracy ${Math.round(result.oobAccuracy * 100)}%` : '';
    this.setSuggestStatus(`Trained on ${result.labelledSlices.length} slice${result.labelledSlices.length === 1 ? '' : 's'}${oob}`);
    return true;
  }

  /**
   * Predict suggestions for slices (trains first if needed), in chunks so the
   * status line keeps moving
   * @param {number[]} slices - 0-based
   */
  async suggestSlices(slices) {
    if (this.suggestBusy || !this.brushEngine || !this.api) return;
    const targets = [...new Set(slices)].filter(i => Number.isInteger(i) && i >= 0 && i < this.totalSlices);
    if (targets.length === 0) return;
    if (this.isSuggestCollapsed()) this.setSuggestCollapsed(false, false);
    this.suggestBusy = true;
    const btns = ['#suggestBtn', '#suggestRangeBtn'].map(id => this.container.querySelector(id));
    btns.forEach(b => { if (b) b.disabled = true; });
    try {
      if (!(await this.ensureClassifierTrained())) return;
      const minConfidence = (parseInt(this.container.querySelector('#suggestConfidence')?.value, 10) || 0) / 100;
      const smooth = this.container.querySelector('#suggestSmooth')?.checked ? 1 : 0;
      const sourceFileId = this.sourceFile?.id || this.sourceFile?.path;
      const chunk = 6;
      let done = 0;
      for (let i = 0; i < targets.length; i += chunk) {
        const part = targets.slice(i, i + chunk);
        this.setSuggestStatus(`Suggesting slice ${done + 1} of ${targets.length}…`);
        const result = await this.api.predictClassifier({
          sourceFileId, modelId: this.classifierModelId, slices: part, minConfidence, smooth
        });
        if (!result.success) {
          if (result.code === 'MODEL_MISSING') this.classifierModelId = null;
          this.setSuggestStatus(result.error || 'Prediction failed', true);
          return;
        }
        for (const [key, value] of Object.entries(result.slices)) {
          this.suggestions.set(parseInt(key, 10), {
            labels: this.base64ToUint8Array(value.labels),
            confidence: this.base64ToUint8Array(value.confidence)
          });
        }
        done += part.length;
      }
      const px = targets.reduce((n, i) => n + this.countSuggested(i), 0);
      this.setSuggestStatus(`${targets.length} slice${targets.length === 1 ? '' : 's'} suggested (${px.toLocaleString()} px). Review, then Accept (A) or Discard.`);
    } catch (error) {
      console.error('[AnnotationModule] Suggest failed:', error);
      this.setSuggestStatus(`Suggest failed: ${error.message}`, true);
    } finally {
      this.suggestBusy = false;
      btns.forEach(b => { if (b) b.disabled = false; });
      this.renderSuggestion();
      this.updateSuggestActions();
      this.updateSliceMarks();
    }
  }

  /**
   * Suggested pixels that would actually be written (label set, pixel still empty)
   * @param {number} sliceIndex
   */
  countSuggested(sliceIndex) {
    const s = this.suggestions.get(sliceIndex);
    if (!s) return 0;
    const data = this.brushEngine.getAllAnnotations().get(sliceIndex);
    let n = 0;
    for (let k = 0; k < s.labels.length; k++) {
      if (s.labels[k] !== 0 && (!data || data[k] === 0)) n++;
    }
    return n;
  }

  /**
   * Draw the current slice's suggestion under the annotations: class colours at
   * reduced alpha, only where the pixel is still empty (what Accept would write)
   */
  renderSuggestion() {
    const ctx = this.canvas?.suggestionCtx;
    if (!ctx || !this.brushEngine) return;
    const w = this.brushEngine.imageWidth, h = this.brushEngine.imageHeight;
    if (w <= 0 || h <= 0) return;
    ctx.clearRect(0, 0, w, h);
    const s = this.suggestions.get(this.currentSlice);
    if (!s || s.labels.length !== w * h) return;
    const data = this.brushEngine.getAllAnnotations().get(this.currentSlice);
    const lut = this.brushEngine.buildColorLUT();
    const img = ctx.createImageData(w, h);
    const px = img.data;
    for (let k = 0; k < s.labels.length; k++) {
      const cls = s.labels[k];
      if (cls === 0 || (data && data[k] !== 0)) continue;
      const c = lut[cls];
      if (!c) continue;
      const o = k * 4;
      px[o] = c.r; px[o + 1] = c.g; px[o + 2] = c.b;
      // Confidence shows through the alpha: 60 (barely) … 150 (certain)
      px[o + 3] = 60 + Math.round(s.confidence[k] * 90 / 255);
    }
    ctx.putImageData(img, 0, 0);
  }

  /**
   * Write a slice's suggestion into its empty pixels (locked classes excluded),
   * as one undo step, and flag the slice as auto-filled until the user paints on it
   * @param {number} [sliceIndex=currentSlice]
   * @param {boolean} [render=true]
   * @returns {number} pixels written
   */
  acceptSuggestion(sliceIndex = this.currentSlice, render = true) {
    const s = this.suggestions.get(sliceIndex);
    if (!s || !this.brushEngine || !this.historyManager) return 0;
    const w = this.brushEngine.imageWidth, h = this.brushEngine.imageHeight;
    if (s.labels.length !== w * h) { this.suggestions.delete(sliceIndex); return 0; }
    const all = this.brushEngine.getAllAnnotations();
    const data = all.get(sliceIndex) || new Uint8Array(w * h);
    if (!all.has(sliceIndex)) this.brushEngine.setAnnotationData(sliceIndex, data);
    this.historyManager.saveState(sliceIndex, data);
    const locked = new Set(this.brushEngine.getClasses().filter(c => c.locked).map(c => c.id));
    const known = new Set(this.brushEngine.getClasses().map(c => c.id));
    const written = new Set();
    let n = 0;
    for (let k = 0; k < data.length; k++) {
      const cls = s.labels[k];
      if (cls === 0 || data[k] !== 0 || locked.has(cls) || !known.has(cls)) continue;
      data[k] = cls; written.add(cls); n++;
    }
    this.suggestions.delete(sliceIndex);
    if (n > 0) {
      if (!this.interpolatedSlices.has(sliceIndex)) this.interpolatedSlices.set(sliceIndex, new Set());
      for (const cls of written) this.interpolatedSlices.get(sliceIndex).add(cls);
      this.refreshPresence(sliceIndex);
      this.isDirty = true;
    }
    if (render) {
      this.labelsVersion++;
      this.updateSaveButtonState();
      this.updateHistoryButtons();
      this.updateSliceMarks();
      this.brushEngine.renderAnnotations();
      this.renderSuggestion();
      this.updateSuggestActions();
      this.setSuggestStatus(n > 0 ? `Accepted ${n.toLocaleString()} px on slice ${sliceIndex + 1}` : 'Nothing to accept on this slice');
    }
    return n;
  }

  /**
   * Accept every pending suggestion
   */
  acceptAllSuggestions() {
    const slices = [...this.suggestions.keys()];
    let total = 0;
    for (const i of slices) total += this.acceptSuggestion(i, false);
    this.labelsVersion++;
    this.updateSaveButtonState();
    this.updateHistoryButtons();
    this.updateSliceMarks();
    this.brushEngine?.renderAnnotations();
    this.renderSuggestion();
    this.updateSuggestActions();
    this.setSuggestStatus(`Accepted ${total.toLocaleString()} px on ${slices.length} slices`);
  }

  /**
   * Drop the current slice's suggestion
   */
  discardSuggestion(sliceIndex = this.currentSlice) {
    if (!this.suggestions.delete(sliceIndex)) return;
    this.renderSuggestion();
    this.updateSuggestActions();
    this.updateSliceMarks();
    this.setSuggestStatus(this.suggestions.size ? `${this.suggestions.size} suggestion(s) still pending` : '');
  }

  // ===========================================================================
  // SAVE / EXPORT METHODS
  // ===========================================================================

  /**
   * Prepare annotation data for saving
   * Converts slice annotations to base64-encoded format
   * @returns {object} Data ready for API
   */
  prepareAnnotationData(options = {}) {
    if (!this.brushEngine || !this.tiffInfo) {
      return null;
    }

    const sliceAnnotations = this.brushEngine.getAllAnnotations();
    const sliceData = {};
    const width = this.tiffInfo.width;

    // The background class (classifier examples) is written as 0 for the final
    // annotation: the platform's convention is that background is unlabeled
    const background = this.brushEngine.getBackgroundClass();
    const stripId = options.stripBackground && background ? background.id : 0;

    let sparseCount = 0;
    let denseCount = 0;

    // Convert each annotated slice using sparse or dense encoding
    for (const [sliceIndex, rawData] of sliceAnnotations) {
      let data = rawData;
      if (stripId && rawData.includes(stripId)) {
        data = new Uint8Array(rawData);
        for (let i = 0; i < data.length; i++) if (data[i] === stripId) data[i] = 0;
      }
      // Only include slices that have non-zero pixels
      let hasContent = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== 0) {
          hasContent = true;
          break;
        }
      }

      if (hasContent) {
        // Choose encoding based on data density
        if (this.shouldUseSparseEncoding(data)) {
          // Use sparse encoding (more efficient for sparse data)
          sliceData[sliceIndex.toString()] = {
            encoding: 'sparse',
            pixels: this.encodeSliceSparse(data, width)
          };
          sparseCount++;
        } else {
          // Use dense encoding (more efficient for heavily annotated slices)
          sliceData[sliceIndex.toString()] = {
            encoding: 'dense',
            pixels: this.uint8ArrayToBase64(data)
          };
          denseCount++;
        }
      }
    }

    console.log(`[AnnotationModule] Encoding: ${sparseCount} sparse, ${denseCount} dense slices`);

    return {
      sourceFileId: this.sourceFile?.id || this.sourceFile?.path || 'unknown',
      sourceFileName: this.sourceFile?.name || 'unknown',
      width: this.tiffInfo.width,
      height: this.tiffInfo.height,
      slices: this.tiffInfo.sliceCount,
      sliceData,
      classes: this.brushEngine.getClasses().filter(c => c.id !== stripId),
      strippedBackgroundClass: stripId ? background.name : null,
      existingAnnotationId: this.currentAnnotationId  // For updating existing annotations
    };
  }

  /**
   * Convert Uint8Array to base64 string
   * @param {Uint8Array} uint8Array - The array to convert
   * @returns {string} Base64-encoded string
   */
  uint8ArrayToBase64(uint8Array) {
    let binary = '';
    const chunkSize = 0x8000; // Process in chunks to avoid stack overflow

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
  }

  /**
   * Convert base64 string to Uint8Array
   * @param {string} base64 - Base64-encoded string
   * @returns {Uint8Array} The decoded array
   */
  base64ToUint8Array(base64) {
    const binary = atob(base64);
    const length = binary.length;
    const array = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
      array[i] = binary.charCodeAt(i);
    }

    return array;
  }

  // ===========================================================================
  // SPARSE ENCODING
  // ===========================================================================

  /**
   * Check if sparse encoding would be more efficient than dense
   * Sparse is better when: nonZeroCount * 5 < totalSize
   * @param {Uint8Array} uint8Array - The annotation data
   * @returns {boolean} True if sparse encoding should be used
   */
  shouldUseSparseEncoding(uint8Array) {
    let nonZeroCount = 0;
    for (let i = 0; i < uint8Array.length; i++) {
      if (uint8Array[i] !== 0) nonZeroCount++;
    }
    // Each sparse pixel takes 5 bytes (2 for x, 2 for y, 1 for classId)
    return (nonZeroCount * 5) < uint8Array.length;
  }

  /**
   * Encode slice data as sparse (only non-zero pixels)
   * Each pixel is stored as 5 bytes: x(2) + y(2) + classId(1)
   * @param {Uint8Array} uint8Array - The annotation data
   * @param {number} width - Image width
   * @returns {string} Base64-encoded sparse data
   */
  encodeSliceSparse(uint8Array, width) {
    const pixels = [];
    for (let i = 0; i < uint8Array.length; i++) {
      if (uint8Array[i] !== 0) {
        const x = i % width;
        const y = Math.floor(i / width);
        // Pack as little-endian uint16 for x and y, uint8 for classId
        pixels.push(x & 0xFF, x >> 8, y & 0xFF, y >> 8, uint8Array[i]);
      }
    }
    return this.uint8ArrayToBase64(new Uint8Array(pixels));
  }

  /**
   * Decode sparse pixel data back to full Uint8Array
   * @param {string} base64Data - Base64-encoded sparse data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Uint8Array} Full annotation array
   */
  decodeSliceSparse(base64Data, width, height) {
    const packed = this.base64ToUint8Array(base64Data);
    const result = new Uint8Array(width * height);

    for (let i = 0; i < packed.length; i += 5) {
      const x = packed[i] | (packed[i + 1] << 8);
      const y = packed[i + 2] | (packed[i + 3] << 8);
      const classId = packed[i + 4];
      result[y * width + x] = classId;
    }
    return result;
  }

  /**
   * Restore annotation data from loaded annotation
   * @param {object} annotationData - Data from load endpoint
   */
  async restoreAnnotation(annotationData) {
    if (!this.brushEngine || !annotationData) {
      return;
    }

    // Restore classes
    if (annotationData.classes && annotationData.classes.length > 0) {
      this.brushEngine.classes = annotationData.classes;
      this.brushEngine.nextClassId = Math.max(...annotationData.classes.map(c => c.id)) + 1;
      this.brushEngine.activeClassId = annotationData.classes[0].id;
    }

    // Restore slice annotations (handles both sparse and dense encoding)
    const hasClassList = !!(annotationData.classes && annotationData.classes.length > 0);
    const labelsSeen = new Set();
    if (annotationData.sliceData) {
      const width = annotationData.width || this.tiffInfo?.width;
      const height = annotationData.height || this.tiffInfo?.height;

      for (const [sliceIndexStr, sliceInfo] of Object.entries(annotationData.sliceData)) {
        const sliceIndex = parseInt(sliceIndexStr, 10);
        let uint8Array;

        // Handle both new format (object) and legacy format (raw string)
        if (typeof sliceInfo === 'object' && sliceInfo.encoding) {
          if (sliceInfo.encoding === 'sparse') {
            uint8Array = this.decodeSliceSparse(sliceInfo.pixels, width, height);
          } else {
            // Dense encoding
            uint8Array = this.base64ToUint8Array(sliceInfo.pixels);
          }
        } else {
          // Legacy format: raw base64 string (dense)
          uint8Array = this.base64ToUint8Array(sliceInfo);
        }

        if (!hasClassList) {
          for (let i = 0; i < uint8Array.length; i++) {
            if (uint8Array[i] !== 0) labelsSeen.add(uint8Array[i]);
          }
        }

        this.brushEngine.setAnnotationData(sliceIndex, uint8Array);
      }
    }

    // Uploaded masks have no class list: derive one from the label values present
    if (!hasClassList && labelsSeen.size > 0) {
      const labels = [...labelsSeen].sort((a, b) => a - b);
      this.brushEngine.classes = [];
      labels.forEach(id => {
        // getNextColor() spaces hues by the current class count, so push one at a time
        this.brushEngine.classes.push({
          id,
          name: `Class ${id}`,
          color: this.brushEngine.getNextColor(),
          visible: true
        });
      });
      this.brushEngine.nextClassId = labels[labels.length - 1] + 1;
      this.brushEngine.activeClassId = labels[0];
    }

    // Re-render class list
    this.renderClassList();
    this.updateSaveButtonState();
    this.refreshAllPresence();
    this.updateSliceMarks();
    this.noteLabelsChanged();

    // Only render annotations if brush engine has been initialized with dimensions
    // (onSliceLoaded will call renderAnnotations after image loads)
    if (this.brushEngine.imageWidth > 0 && this.brushEngine.imageHeight > 0) {
      this.brushEngine.renderAnnotations();
    }

    console.log(`[AnnotationModule] Restored annotation with ${annotationData.annotatedSlices || 0} slices`);
  }

  /**
   * Load existing annotation for resume/edit
   */
  async loadExistingAnnotation() {
    if (!this.annotationFile || !this.api) {
      console.error('[AnnotationModule] Cannot load: no annotation file or API');
      return;
    }

    const annotationFileId = this.annotationFile.id || this.annotationFile.path;

    // Resume: "Save Progress" keeps updating the same WIP file.
    // Edit: the finished annotation is never overwritten; saves create a new file.
    this.currentAnnotationId = this.annotationMode === 'resume' ? annotationFileId : null;

    try {
      // Load annotation data from API
      const result = await this.api.loadAnnotation(annotationFileId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to load annotation');
      }

      // Source image: the one resolved (or chosen) in step 1 wins; fall back to the sidecar
      if (!this.sourceFile?.id) {
        if (result.sourceFileId) {
          this.sourceFile = {
            id: result.sourceFileId,
            name: result.sourceFileName
          };
        } else {
          console.warn('[AnnotationModule] No sourceFileId in annotation data');
        }
      }

      // Update TIFF info
      this.tiffInfo = {
        width: result.width,
        height: result.height,
        sliceCount: result.slices
      };

      this.totalSlices = result.slices;
      this.currentSlice = 0;

      // Update UI
      this.updateSliceIndicator();
      this.updateSliceButtons();

      // Load source image slice
      const sourceFileId = this.sourceFile?.id;
      if (sourceFileId) {
        console.log('[AnnotationModule] Loading source image:', sourceFileId);
        await this.canvas.loadSlice(sourceFileId, this.currentSlice);
        this.updateZoomIndicator(this.canvas.getZoom());
      } else {
        console.error('[AnnotationModule] Cannot load source image: sourceFileId is missing');
        throw new Error('Source image not found. The original image may have been deleted.');
      }

      // Restore annotation data (classes and slice annotations)
      await this.restoreAnnotation(result);

      if (this.state?.notify) {
        this.state.notify('success', `Loaded annotation with ${result.annotatedSlices || 0} annotated slices`);
      }

    } catch (error) {
      console.error('[AnnotationModule] Load annotation error:', error);
      if (this.state?.notify) {
        this.state.notify('error', `Failed to load annotation: ${error.message}`);
      }
    }
  }

  /**
   * Save annotation progress (unfinished)
   */
  async saveProgress() {
    if (!this.brushEngine || !this.api) {
      console.error('[AnnotationModule] Cannot save: module not initialized');
      return;
    }

    // Prepare data
    const data = this.prepareAnnotationData();
    if (!data) {
      if (this.state?.notify) {
        this.state.notify('error', 'Cannot save: no source file loaded');
      }
      return;
    }

    // Check if there's anything to save
    if (Object.keys(data.sliceData).length === 0) {
      if (this.state?.notify) {
        this.state.notify('warning', 'Nothing to save: no annotations have been made');
      }
      return;
    }

    // Disable button and show loading
    const saveBtn = this.container?.querySelector('#saveProgressBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      const result = await this.api.saveProgress(data);

      if (result.success) {
        if (this.state?.notify) {
          this.state.notify('success', 'Annotation progress saved');
        }
        console.log('[AnnotationModule] Progress saved:', result);

        // Store the annotation ID for future saves (to update instead of create new)
        if (result.fileId) {
          this.currentAnnotationId = result.fileId;
        }

        // Mark as not dirty (for future unsaved changes warning)
        this.isDirty = false;
      } else {
        throw new Error(result.error || 'Failed to save progress');
      }
    } catch (error) {
      console.error('[AnnotationModule] Save error:', error);
      if (this.state?.notify) {
        this.state.notify('error', `Failed to save: ${error.message}`);
      }
    } finally {
      // Re-enable button
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Progress';
      }
    }
  }

  /**
   * Create final annotation
   */
  async createAnnotation() {
    if (!this.brushEngine || !this.api) {
      console.error('[AnnotationModule] Cannot create: module not initialized');
      return;
    }

    // Prepare data
    const data = this.prepareAnnotationData({ stripBackground: true });
    if (!data) {
      if (this.state?.notify) {
        this.state.notify('error', 'Cannot create: no source file loaded');
      }
      return;
    }

    // Check if there's anything to save
    if (Object.keys(data.sliceData).length === 0) {
      const confirmed = confirm(
        'No annotations have been made. Create an empty annotation anyway?'
      );
      if (!confirmed) return;
    }
    const strippedNote = data.strippedBackgroundClass
      ? ` The background class "${data.strippedBackgroundClass}" was written as unlabeled (0).`
      : '';

    // Validate classes
    if (!data.classes || data.classes.length === 0) {
      if (this.state?.notify) {
        this.state.notify('error', 'At least one class is required');
      }
      return;
    }

    // Disable button and show loading
    const createBtn = this.container?.querySelector('#createAnnotationBtn');
    if (createBtn) {
      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';
    }

    try {
      const result = await this.api.createAnnotation(data);

      if (result.success) {
        if (this.state?.notify) {
          this.state.notify('success', `Annotation created successfully.${strippedNote}`, strippedNote ? 8000 : 5000);
        }
        console.log('[AnnotationModule] Annotation created:', result);

        // Mark as not dirty
        this.isDirty = false;
      } else {
        throw new Error(result.error || 'Failed to create annotation');
      }
    } catch (error) {
      console.error('[AnnotationModule] Create error:', error);
      if (this.state?.notify) {
        this.state.notify('error', `Failed to create: ${error.message}`);
      }
    } finally {
      // Re-enable button
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.innerHTML = '<span class="btn-glyph">&#9658;</span> Create Annotation';
      }
    }
  }

  /**
   * Update save button state based on annotations
   */
  updateSaveButtonState() {
    const saveBtn = this.container?.querySelector('#saveProgressBtn');
    const createBtn = this.container?.querySelector('#createAnnotationBtn');

    const hasAnnotations = this.brushEngine && this.brushEngine.getAllAnnotations().size > 0;

    if (saveBtn) {
      saveBtn.disabled = !hasAnnotations;
    }
    if (createBtn) {
      createBtn.disabled = !hasAnnotations;
    }
  }

  // ===========================================================================
  // AUTOSAVE METHODS
  // ===========================================================================

  /**
   * Toggle autosave on/off
   * @param {boolean} enabled - Whether autosave should be enabled
   */
  toggleAutosave(enabled) {
    this.autosaveEnabled = enabled;

    if (enabled) {
      this.startAutosaveInterval();
      console.log('[AnnotationModule] Autosave enabled (120s interval)');
    } else {
      this.stopAutosaveInterval();
      console.log('[AnnotationModule] Autosave disabled');
    }
  }

  /**
   * Start the autosave interval timer
   */
  startAutosaveInterval() {
    // Clear any existing interval first
    this.stopAutosaveInterval();

    // Set interval to 120 seconds (120000ms)
    this.autosaveInterval = setInterval(() => {
      this.performAutosave();
    }, 120000);
  }

  /**
   * Stop the autosave interval timer
   */
  stopAutosaveInterval() {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
  }

  /**
   * Perform autosave if there are unsaved changes
   */
  async performAutosave() {
    // Only save if there are unsaved changes
    if (!this.isDirty) {
      console.log('[AnnotationModule] Autosave skipped: no unsaved changes');
      return;
    }

    // Show autosave status indicator
    const statusEl = this.container?.querySelector('#autosaveStatus');
    if (statusEl) {
      statusEl.textContent = 'Saving...';
      statusEl.classList.add('active');
    }

    try {
      await this.saveProgress();
      console.log('[AnnotationModule] Autosave completed');
    } catch (error) {
      console.error('[AnnotationModule] Autosave failed:', error);
    } finally {
      // Hide status indicator after a brief delay
      setTimeout(() => {
        if (statusEl) {
          statusEl.textContent = '';
          statusEl.classList.remove('active');
        }
      }, 1500);
    }
  }

  // ===========================================================================
  // FILE SELECTION HANDLERS
  // ===========================================================================

  /**
   * Handle file selection from dropdown
   * Determines scenario: new annotation, resume, or edit
   */
  async onFileSelected(file) {
    console.log('[AnnotationModule] File selected:', file);

    // Reset state
    this.sourceFile = null;
    this.annotationFile = null;
    this.tiffInfo = null;
    this.isResuming = false;
    this.annotationMode = 'new';
    this.sourceFileLoaded = false;
    this.currentAnnotationId = null;
    this.hideSourcePicker();

    // Disable next button until validation passes
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    if (!file) {
      this.validationDisplay.hide();
      // Ensure Next button is disabled when no file selected
      const step1Next = document.getElementById('step1Next');
      if (step1Next) step1Next.disabled = true;
      return;
    }

    // Show loading state
    this.validationDisplay.showLoading('Loading file information...');

    try {
      // Determine scenario from the file's tags
      if (isUnfinishedAnnotation(file)) {
        // Resume unfinished annotation (saves keep updating the same WIP file)
        await this.handleResumeAnnotation(file);
      } else if (isFinishedAnnotation(file) || isSegmentationResult(file)) {
        // Edit existing annotation or correct a segmentation result
        // (saves create a new annotation file; the original is never touched)
        await this.handleEditAnnotation(file);
      } else {
        // New annotation from raw image
        await this.handleNewAnnotation(file);
      }
    } catch (error) {
      console.error('[AnnotationModule] File selection error:', error);
      this.validationDisplay.showError('Error', error.message || 'Failed to load file information');
      this.sourceFileLoaded = false;
      if (step1Next) step1Next.disabled = true;
    }
  }

  /**
   * Handle new annotation scenario
   * Source is a raw image - fetch TIFF info
   */
  async handleNewAnnotation(file) {
    console.log('[AnnotationModule] New annotation from:', file.name || file.path);

    // Fetch TIFF info for real files
    const fileId = file.id || file.path;
    const result = await this.api.getTiffInfo(fileId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to get file information');
    }

    this.sourceFile = file;
    // API returns info fields directly (width, height, sliceCount, dtype)
    this.tiffInfo = {
      width: result.width,
      height: result.height,
      sliceCount: result.sliceCount,
      dtype: result.dtype
    };
    this.isResuming = false;
    this.sourceFileLoaded = true;

    // Show validation success
    this.validationDisplay.showSuccess('Source Image Selected', [
      { label: 'File', value: file.displayName || file.name },
      { label: 'Dimensions', value: `${this.tiffInfo.width} × ${this.tiffInfo.height}` },
      { label: 'Slices', value: this.tiffInfo.sliceCount },
      { label: 'Mode', value: 'New Annotation' }
    ]);

    // Enable next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = false;
  }

  /**
   * Handle resume unfinished annotation scenario (WIP file from "Save Progress")
   */
  async handleResumeAnnotation(file) {
    await this.handleExistingAnnotation(file, 'resume');
  }

  /**
   * Handle edit existing annotation scenario (finished or uploaded mask).
   * Saving creates a new file; the original is never overwritten.
   */
  async handleEditAnnotation(file) {
    await this.handleExistingAnnotation(file, 'edit');
  }

  /**
   * Shared resume/edit preparation: read the annotation's dimensions and
   * resolve its source image via lineage. Without a resolvable source the
   * user picks one (uploaded masks have no lineage).
   * @param {object} file - Workspace file entry of the annotation TIFF
   * @param {'resume'|'edit'} mode
   */
  async handleExistingAnnotation(file, mode) {
    console.log(`[AnnotationModule] ${mode} annotation:`, file.name);

    this.annotationMode = mode;
    this.annotationFile = file;
    this.isResuming = true;

    const fileId = file.id || file.path;
    const info = await this.api.getTiffInfo(fileId);
    if (!info.success) {
      throw new Error(info.error || 'Failed to read the annotation file');
    }
    this.tiffInfo = {
      width: info.width,
      height: info.height,
      sliceCount: info.sliceCount,
      dtype: info.dtype
    };

    const title = mode === 'resume' ? 'Unfinished Annotation Selected' : 'Existing Annotation Selected';
    const details = [
      { label: 'File', value: file.displayName || file.name },
      { label: 'Dimensions', value: `${this.tiffInfo.width} × ${this.tiffInfo.height}` },
      { label: 'Slices', value: this.tiffInfo.sliceCount },
      { label: 'Mode', value: mode === 'resume' ? 'Resume Previous Work' : 'Edit Existing (saved as a new file)' }
    ];

    const step1Next = document.getElementById('step1Next');
    const source = await this.resolveAnnotationSource(file);

    if (source) {
      this.sourceFile = source;
      this.sourceFileLoaded = true;
      details.push({ label: 'Source Image', value: source.name });
      this.validationDisplay.showSuccess(title, details);
      if (step1Next) step1Next.disabled = false;
      return;
    }

    // No lineage (uploaded mask) or the source was deleted: ask for it
    this.sourceFileLoaded = false;
    details.push({ label: 'Source Image', value: 'not found - choose it below' });
    this.validationDisplay.showWarning(title, details);
    await this.showSourcePicker();
    if (step1Next) step1Next.disabled = true;
  }

  /**
   * Resolve an annotation's source image from its lineage
   * @param {object} file - Annotation file entry
   * @returns {Promise<{id: string, name: string, path: string}|null>}
   */
  async resolveAnnotationSource(file) {
    if (!file.lineage?.inputs?.[0]) return null;
    const files = await this.fetchWorkspaceFiles();
    // Walk the provenance chain until an image stack: an annotation points at
    // its raw stack directly, an inference result at the stack it segmented,
    // a cleanup output at the segmentation it cleaned (then one step further).
    let current = file;
    for (let depth = 0; depth < 10; depth++) {
      const parentId = current.lineage?.inputs?.[0];
      if (!parentId) return null;
      const parent = files.find(f => f.id === parentId);
      if (!parent) return null;
      if (isRawImageFile(parent) || isImageResultFile(parent)) {
        return { id: parent.id, name: parent.name, path: parent.path };
      }
      current = parent;
    }
    return null;
  }

  /**
   * Current workspace file listing
   * @returns {Promise<Array>}
   */
  async fetchWorkspaceFiles() {
    try {
      const response = await fetch('/api/workspace/files', { credentials: 'include' });
      const data = await response.json();
      return data.success ? (data.files || []) : [];
    } catch (error) {
      console.error('[AnnotationModule] Failed to list workspace files:', error);
      return [];
    }
  }

  /**
   * Render the source image picker below the validation display
   */
  async showSourcePicker() {
    const el = document.getElementById('annotationSourcePicker');
    if (!el) return;

    const candidates = (await this.fetchWorkspaceFiles())
      .filter(f => (isRawImageFile(f) || isImageResultFile(f)) && /\.tiff?$/i.test(f.name || ''));

    el.innerHTML = `
      <div class="section-card">
        <h4>Source Image</h4>
        <p class="step-description">
          Choose the image stack this annotation belongs to. It must have the same
          dimensions and slice count as the annotation.
        </p>
        <select id="annotationSourceSelect" class="file-dropdown">
          <option value="">-- Select the source image --</option>
          ${candidates.map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('')}
        </select>
        ${candidates.length ? '' : '<p class="step-description">No image stacks in the workspace. Upload the source image first.</p>'}
      </div>
    `;
    el.style.display = '';

    el.querySelector('#annotationSourceSelect')?.addEventListener('change', (e) => {
      const picked = candidates.find(f => f.id === e.target.value) || null;
      this.onSourcePicked(picked);
    });
  }

  hideSourcePicker() {
    const el = document.getElementById('annotationSourcePicker');
    if (!el) return;
    el.style.display = 'none';
    el.innerHTML = '';
  }

  /**
   * A source image was chosen for an annotation without lineage:
   * check the dimensions against the annotation
   * @param {object|null} file - Chosen workspace file entry
   */
  async onSourcePicked(file) {
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;
    this.sourceFile = null;
    this.sourceFileLoaded = false;
    if (!file) return;

    try {
      const info = await this.api.getTiffInfo(file.id);
      if (!info.success) throw new Error(info.error || 'Failed to read the image');

      const a = this.tiffInfo;
      if (info.width !== a.width || info.height !== a.height || info.sliceCount !== a.sliceCount) {
        this.validationDisplay.showError('Source Image Does Not Match', [
          { label: 'Annotation', value: `${a.width} × ${a.height}, ${a.sliceCount} slices` },
          { label: file.name, value: `${info.width} × ${info.height}, ${info.sliceCount} slices` }
        ]);
        return;
      }

      this.sourceFile = { id: file.id, name: file.name, path: file.path };
      this.sourceFileLoaded = true;
      this.validationDisplay.showSuccess(
        this.annotationMode === 'resume' ? 'Unfinished Annotation Selected' : 'Existing Annotation Selected', [
          { label: 'File', value: this.annotationFile?.displayName || this.annotationFile?.name },
          { label: 'Source Image', value: file.displayName || file.name },
          { label: 'Dimensions', value: `${a.width} × ${a.height}` },
          { label: 'Slices', value: a.sliceCount },
          { label: 'Mode', value: this.annotationMode === 'resume' ? 'Resume Previous Work' : 'Edit Existing (saved as a new file)' }
        ]);
      if (step1Next) step1Next.disabled = false;
    } catch (error) {
      this.validationDisplay.showError('Error', error.message);
    }
  }

  /**
   * Handle file upload
   */
  async onFileUploaded(file, uploadedInfo) {
    console.log('[AnnotationModule] File uploaded:', file.name, uploadedInfo);

    // The file selector will auto-select the uploaded file and call onFileSelected
    // Just log the upload for now
    if (this.state?.notify) {
      this.state.notify('success', `Uploaded: ${file.name}`);
    }
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  async deactivate() {
    // Stop autosave interval
    this.stopAutosaveInterval();

    // Remove keyboard event listeners (module shortcuts + chrome ←/→)
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.keyupHandler) {
      document.removeEventListener('keyup', this.keyupHandler);
      this.keyupHandler = null;
    }
    if (this.blurHandler) {
      window.removeEventListener('blur', this.blurHandler);
      this.blurHandler = null;
    }
    this.chrome?.destroy();

    // Remove beforeunload handler
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }

    // Classifier state
    this.suggestions.clear();
    this.classifierModelId = null;
    this.classifierTrainedVersion = -1;
    this.suggestBusy = false;

    // Interpolation state
    this.closeInterpolateDialog();
    this.classPresence.clear();
    this.interpolatedSlices.clear();
    this.lastInterpolation = null;

    // Clean up history manager
    if (this.historyManager) {
      this.historyManager.destroy();
      this.historyManager = null;
    }

    // Clean up brush engine
    if (this.brushEngine) {
      this.brushEngine.destroy();
      this.brushEngine = null;
    }

    // Clean up canvas
    if (this.canvas) {
      this.canvas.destroy();
      this.canvas = null;
    }

    // Clean up resources
    this.stepNavigator = null;
    this.validationDisplay = null;
    this.fileSelector = null;
    this.api = null;

    this.sourceFile = null;
    this.tiffInfo = null;
    this.annotationFile = null;
    this.isResuming = false;
    this.annotationMode = 'new';
    this.sourceFileLoaded = false;
    this.currentAnnotationId = null;
    this.currentSlice = 0;
    this.totalSlices = 1;
    this.isDirty = false;

    try { delete window.annotationModule; } catch (e) { window.annotationModule = undefined; }

    await super.deactivate();
    console.log('[AnnotationModule] Deactivated');
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default AnnotationModule;
