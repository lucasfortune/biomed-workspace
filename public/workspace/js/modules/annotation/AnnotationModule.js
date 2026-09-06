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
/** Processed image stack (denoised / segmented) that can also be annotated */
const isImageResultFile = (f) =>
  (f.category === 'results' && hasTag(f, 'data') && (hasTag(f, 'denoising') || hasTag(f, 'segmentation'))) ||
  f.category === 'denoised_images' || f.category === 'segmentations';
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
                  <button id="saveProgressBtn" class="btn secondary" disabled>
                    Save Progress
                  </button>
                </div>
              </div>

              <!-- Main Content Area (Canvas + Toolbar side by side) -->
              <div class="sv-main">
                ${this.chrome.render()}

                <!-- Toolbar -->
                <div id="toolbar" class="sv-toolbar">
                  <!-- Tools Section -->
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
                    </div> 
                  </div>

                  <!-- Brush Size Section -->
                  <div class="sv-section">
                    <div class="sv-section-header">
                      <h4>Brush Size</h4>
                      ${this.renderHelpIcon('annotation.step2.brush-size')}
                    </div>
                    <div class="brush-size-control">
                      <input type="range" id="brushSizeSlider" min="1" max="50" value="10"
                             class="brush-slider range-slider" title="Brush size">
                      <span id="brushSizeValue" class="brush-size-value">10px</span>
                    </div>
                  </div>

                  <!-- History Section -->
                  <div class="sv-section">
                    <div class="sv-section-header">
                      <h4>History</h4>
                      ${this.renderHelpIcon('annotation.step2.history')}
                    </div>
                    <div class="history-buttons">
                      <button id="undoBtn" class="tool-btn" title="Undo (Ctrl+Z)" disabled>
                        <span class="tool-icon">${icon('undo')}</span>
                        <span class="tool-label">Undo</span>
                      </button>
                      <button id="redoBtn" class="tool-btn" title="Redo (Ctrl+Y)" disabled>
                        <span class="tool-icon">${icon('redo')}</span>
                        <span class="tool-label">Redo</span>
                      </button>
                    </div>
                    <div class="autosave-toggle">
                      <label class="toggle-switch">
                        <input type="checkbox" id="autosaveToggle" checked>
                        <span class="toggle-slider"></span>
                      </label>
                      <span class="toggle-label">Autosave</span>
                      <span id="autosaveStatus" class="autosave-status"></span>
                    </div>
                  </div>

                  <!-- Classes Section -->
                  <div class="sv-section classes-section">
                    <div class="classes-header">
                      <h4>Classes</h4>
                      ${this.renderHelpIcon('annotation.step2.classes')}
                      <button id="addClassBtn" class="btn-add-class" title="Add class">+</button>
                    </div>
                    <div id="classList" class="class-list">
                      <!-- Classes will be rendered dynamically -->
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
        // Recent Results: show denoising and segmentation results (TIFF files users might want to annotate)
        resultCategories: ['results', 'denoised_images', 'segmentations'],
        resultCategoryLabels: {
          'results': 'Result',
          'denoised_images': 'Denoised',
          'segmentations': 'Segmentation'
        },
        // Recent results: only image data (denoising or segmentation output), not info/wip files
        filterRecentResults: (files) => files.filter(isImageResultFile),
        // Workspace files: raw image stacks (new annotation)
        filterFiles: (files) => files.filter(isRawImageFile),
        // Resume / edit: WIP results and finished annotations are not raw images, so they
        // get their own groups (the mode is decided from the tags in onFileSelected)
        extraGroups: [
          { label: 'Unfinished annotations (resume)', filter: (files) => files.filter(isUnfinishedAnnotation) },
          { label: 'Existing annotations (edit)', filter: (files) => files.filter(isFinishedAnnotation) }
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

    console.log('[AnnotationModule] Initialized');
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

      // ←/→ slice navigation is handled by SliceViewerChrome
      if (e.key === 'b' || e.key === 'B') {
        this.setTool('brush');
      } else if (e.key === 'e' || e.key === 'E') {
        this.setTool('eraser');
      } else if (e.key === '[') {
        this.adjustBrushSize(-5);
      } else if (e.key === ']') {
        this.adjustBrushSize(5);
      }
    };
    document.addEventListener('keydown', this.keydownHandler);

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
    const toolBrush = this.container.querySelector('#toolBrush');
    const toolEraser = this.container.querySelector('#toolEraser');

    if (toolBrush && toolEraser) {
      toolBrush.classList.toggle('active', tool === 'brush');
      toolEraser.classList.toggle('active', tool === 'eraser');
    }
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
    this.renderClassList();
  }

  /**
   * Select a class as active
   * @param {number} classId - Class ID to select
   */
  selectClass(classId) {
    if (!this.brushEngine) return;

    this.brushEngine.setActiveClass(classId);
    this.renderClassList();
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
   * Render the class list UI
   */
  renderClassList() {
    const classList = this.container.querySelector('#classList');
    if (!classList || !this.brushEngine) return;

    const classes = this.brushEngine.getClasses();
    const activeClass = this.brushEngine.getActiveClass();

    classList.innerHTML = classes.map(cls => `
      <div class="class-item ${cls.id === activeClass?.id ? 'active' : ''}"
           data-class-id="${cls.id}">
        <span class="class-color" style="background: ${cls.color};"></span>
        <span class="class-name">${cls.name}</span>
        <button class="class-visibility ${cls.visible ? 'is-visible' : 'is-hidden'}"
                title="${cls.visible ? 'Hide class' : 'Show class'}" data-action="visibility">
          ${cls.visible ? icon('eye') : icon('eyeOff')}
        </button>
        <button class="class-delete" title="Delete class" data-action="delete">×</button>
      </div>
    `).join('');

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
        // Don't select if clicking on visibility or delete buttons
        if (e.target.closest('.class-visibility') || e.target.closest('.class-delete')) {
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
  // SAVE / EXPORT METHODS
  // ===========================================================================

  /**
   * Prepare annotation data for saving
   * Converts slice annotations to base64-encoded format
   * @returns {object} Data ready for API
   */
  prepareAnnotationData() {
    if (!this.brushEngine || !this.tiffInfo) {
      return null;
    }

    const sliceAnnotations = this.brushEngine.getAllAnnotations();
    const sliceData = {};
    const width = this.tiffInfo.width;

    let sparseCount = 0;
    let denseCount = 0;

    // Convert each annotated slice using sparse or dense encoding
    for (const [sliceIndex, data] of sliceAnnotations) {
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
      classes: this.brushEngine.getClasses(),
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
    const data = this.prepareAnnotationData();
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
          this.state.notify('success', 'Annotation created successfully');
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
      } else if (isFinishedAnnotation(file)) {
        // Edit existing annotation (saves create a new file)
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
    const sourceId = file.lineage?.inputs?.[0];
    if (!sourceId) return null;
    const files = await this.fetchWorkspaceFiles();
    const src = files.find(f => f.id === sourceId);
    return src ? { id: src.id, name: src.name, path: src.path } : null;
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
    this.chrome?.destroy();

    // Remove beforeunload handler
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }

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
