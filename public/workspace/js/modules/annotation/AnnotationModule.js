/**
 * AnnotationModule - Quick Annotation Tool
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
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';
import AnnotationAPI from './AnnotationAPI.js';
import AnnotationCanvas from './utils/AnnotationCanvas.js';
import BrushEngine from './utils/BrushEngine.js';
import HistoryManager from './utils/HistoryManager.js';
import FilamentManager from './utils/FilamentManager.js';
import CenterpointEngine from './utils/CenterpointEngine.js';

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
      name: 'Quick Annotation Tool',
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
    this.filamentManager = null;
    this.centerpointEngine = null;

    // =========================================================================
    // MODULE STATE
    // =========================================================================

    // Source file info
    this.sourceFile = null;
    this.tiffInfo = null;

    // Annotation file info (for resume/edit scenarios)
    this.annotationFile = null;
    this.isResuming = false;
    this.isEditing = false;  // True when editing a finished annotation in-place
    this.currentAnnotationId = null;  // ID of current unfinished annotation (for updates)

    // Slice navigation
    this.currentSlice = 0;
    this.totalSlices = 1;

    // Active tool tracking
    this.activeTool = 'brush';  // 'brush' | 'eraser' | 'centerpoint'

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
              <div id="validationResult"></div>

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
                  <button id="saveProgressBtn" class="btn btn-secondary" disabled>
                    Save Progress
                  </button>
                  <button id="createAnnotationBtn" class="btn btn-primary" disabled>
                    Create Annotation
                  </button>
                </div>
              </div>

              <!-- Main Content Area (Canvas + Toolbar side by side) -->
              <div class="annotation-main">
                <!-- Canvas Wrapper -->
                <div class="canvas-wrapper">
                  <!-- Controls Bar -->
                  <div class="canvas-controls">
                    <!-- Slice Navigation -->
                    <div class="control-group">
                      <label>Slice:</label>
                      <div class="slice-nav">
                        <button id="prevSlice" class="btn-icon" title="Previous slice (←)">◀</button>
                        <span id="sliceIndicator" class="slice-indicator">1 / 1</span>
                        <button id="nextSlice" class="btn-icon" title="Next slice (→)">▶</button>
                      </div>
                    </div>

                    <!-- Zoom Controls -->
                    <div class="control-group">
                      <label>Zoom:</label>
                      <div class="zoom-controls">
                        <button id="zoomOut" class="btn-icon" title="Zoom out (-)">−</button>
                        <span id="zoomIndicator" class="zoom-indicator">100%</span>
                        <button id="zoomIn" class="btn-icon" title="Zoom in (+)">+</button>
                        <button id="zoomFit" class="btn-icon" title="Fit to view">⊡</button>
                        <button id="zoomReset" class="btn-icon" title="Reset to 100%">1:1</button>
                      </div>
                    </div>
                  </div>

                  <!-- Canvas Area -->
                  <div id="canvasArea" class="canvas-area">
                    <div id="canvasLoading" class="canvas-loading" style="display: none;">
                      <div class="spinner"></div>
                      <span>Loading slice...</span>
                    </div>
                  </div>

                  <!-- Status Bar -->
                  <div class="canvas-status">
                    <span id="coordsDisplay" class="status-item">X: -- Y: --</span>
                    <span id="dimensionsDisplay" class="status-item">-- × --</span>
                  </div>
                </div>

                <!-- Toolbar -->
                <div id="toolbar" class="annotation-toolbar">
                  <!-- Tools Section -->
                  <div class="toolbar-section">
                    <div class="toolbar-section-header">
                      <h4>Tools</h4>
                      ${this.renderHelpIcon('annotation.step2.tools')}
                    </div>
                    <div class="tool-buttons">
                      <button id="toolBrush" class="tool-btn active" title="Brush (B)">
                        <span class="tool-icon">&#x1F58C;&#xFE0F;</span>
                        <span class="tool-label">Brush</span>
                      </button>
                      <button id="toolEraser" class="tool-btn" title="Eraser (E)">
                        <span class="tool-icon">&#x1F9F9;</span>
                        <span class="tool-label">Eraser</span>
                      </button>
                    </div> 
                  </div>

                  <!-- Brush Size Section -->
                  <div class="toolbar-section">
                    <div class="toolbar-section-header">
                      <h4>Brush Size</h4>
                      ${this.renderHelpIcon('annotation.step2.brush-size')}
                    </div>
                    <div class="brush-size-control">
                      <input type="range" id="brushSizeSlider" min="1" max="50" value="10"
                             class="brush-slider" title="Brush size">
                      <span id="brushSizeValue" class="brush-size-value">10px</span>
                    </div>
                  </div>

                  <!-- History Section -->
                  <div class="toolbar-section">
                    <div class="toolbar-section-header">
                      <h4>History</h4>
                      ${this.renderHelpIcon('annotation.step2.history')}
                    </div>
                    <div class="history-buttons">
                      <button id="undoBtn" class="tool-btn" title="Undo (Ctrl+Z)" disabled>
                        <span class="tool-icon">↶</span>
                        <span class="tool-label">Undo</span>
                      </button>
                      <button id="redoBtn" class="tool-btn" title="Redo (Ctrl+Y)" disabled>
                        <span class="tool-icon">↷</span>
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
                  <div class="toolbar-section classes-section">
                    <div class="classes-header">
                      <h4>Classes</h4>
                      ${this.renderHelpIcon('annotation.step2.classes')}
                      <button id="addClassBtn" class="btn-add-class" title="Add class">+</button>
                    </div>
                    <div id="classList" class="class-list">
                      <!-- Classes will be rendered dynamically -->
                    </div>
                  </div>

                  <!-- Filaments Section -->
                  <div class="toolbar-section filaments-section">
                    <div class="filaments-header">
                      <h4>Filaments</h4>
                      <button id="addFilamentBtn" class="btn-add-class" title="Add filament">+</button>
                    </div>
                    <div id="filamentList" class="filament-list">
                      <div class="filament-empty-state">
                        No filaments. Click + to add.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <button id="step2Back" class="btn btn-secondary">
                  ← Back to Selection
                </button>
                <div></div>
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
        icon: '🖼️',
        helpIconHtml: this.renderHelpIcon('annotation.step1.source-image'),
        accept: '.tif,.tiff',
        showTestData: false,
        showRecentResults: true,
        workspaceFilesLabel: 'Raw Images',
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
        // Filter recent results to only show data files (denoising or segmentation), not info/wip
        filterRecentResults: (files) => {
          return files.filter(f => {
            // New system: results with denoising or segmentation data tag
            if (f.category === 'results' && f.tags) {
              const isDenoising = f.tags.includes('denoising') && f.tags.includes('data');
              const isSegmentation = f.tags.includes('segmentation') && f.tags.includes('data');
              return isDenoising || isSegmentation;
            }
            // Legacy categories
            return f.category === 'denoised_images' || f.category === 'segmentations';
          });
        },
        // Custom section: Annotations (finished + WIP)
        customSections: [{
          id: 'annotations',
          label: 'Annotations',
          filter: (allFiles) => {
            return allFiles.filter(f => {
              const isFinished = f.category === 'uploads' && f.tags && f.tags.includes('annotation');
              const isWip = f.category === 'results' && f.tags && f.tags.includes('annotation') && f.tags.includes('wip');
              const isNotSidecar = !f.tags || (!f.tags.includes('info') && !f.tags.includes('filaments'));
              return (isFinished || isWip) && isNotSidecar;
            });
          },
          formatLabel: (file, selector) => {
            const isWip = file.tags && file.tags.includes('wip');
            const prefix = isWip ? '[In Progress] ' : '';
            return `${prefix}${file.name} (${selector.formatFileSize(file.size)})`;
          },
          emptyText: 'No annotations yet'
        }],
        // Filter workspace files to show only raw images (uploads with raw tag)
        filterFiles: (files) => {
          return files.filter(f => {
            // Exclude finished annotations from workspace files (they go in custom section)
            if (f.tags && f.tags.includes('annotation')) {
              return false;
            }
            // New system: uploads with raw tag
            if (f.category === 'uploads' && f.tags && f.tags.includes('raw')) {
              return true;
            }
            // Legacy categories for backward compat
            return f.category === 'raw' ||
                   f.category === 'raw_images' ||
                   f.category === 'inference_data';
          });
        }
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

    // Slice navigation
    const prevSlice = this.container.querySelector('#prevSlice');
    const nextSlice = this.container.querySelector('#nextSlice');

    if (prevSlice) {
      prevSlice.addEventListener('click', () => this.goToSlice(this.currentSlice - 1));
    }
    if (nextSlice) {
      nextSlice.addEventListener('click', () => this.goToSlice(this.currentSlice + 1));
    }

    // Zoom controls
    const zoomIn = this.container.querySelector('#zoomIn');
    const zoomOut = this.container.querySelector('#zoomOut');
    const zoomFit = this.container.querySelector('#zoomFit');
    const zoomReset = this.container.querySelector('#zoomReset');

    if (zoomIn) {
      zoomIn.addEventListener('click', () => this.canvas?.zoomIn());
    }
    if (zoomOut) {
      zoomOut.addEventListener('click', () => this.canvas?.zoomOut());
    }
    if (zoomFit) {
      zoomFit.addEventListener('click', () => this.canvas?.zoomToFit());
    }
    if (zoomReset) {
      zoomReset.addEventListener('click', () => this.canvas?.resetZoom());
    }

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

      if (e.key === 'ArrowLeft') {
        this.goToSlice(this.currentSlice - 1);
      } else if (e.key === 'ArrowRight') {
        this.goToSlice(this.currentSlice + 1);
      } else if (e.key === 'b' || e.key === 'B') {
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

    // Add filament button
    const addFilamentBtn = this.container.querySelector('#addFilamentBtn');
    if (addFilamentBtn) {
      addFilamentBtn.addEventListener('click', () => this.addFilament());
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
    const canvasArea = this.container.querySelector('#canvasArea');
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
          // Route preview to the active engine
          if (this.activeTool === 'centerpoint' && this.centerpointEngine) {
            this.centerpointEngine.updatePreview(coords);
          } else if (this.brushEngine) {
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
          // Re-render filament markers for loaded slice
          if (this.centerpointEngine) {
            this.centerpointEngine.setSlice(this.currentSlice);
            this.centerpointEngine.render();
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

      // Create filament manager if not exists
      if (!this.filamentManager) {
        this.filamentManager = new FilamentManager();

        this.filamentManager.onChange = () => {
          this.isDirty = true;
          this.updateSaveButtonState();
          this.renderFilamentList();
        };
      }

      // Create centerpoint engine if not exists
      if (!this.centerpointEngine) {
        this.centerpointEngine = new CenterpointEngine(this.canvas, this.filamentManager);
        this.centerpointEngine.initialize();

        this.centerpointEngine.onPointPlaced = () => {
          this.isDirty = true;
          this.updateSaveButtonState();
          this.renderFilamentList();
        };

        this.centerpointEngine.onPointRemoved = () => {
          this.isDirty = true;
          this.updateSaveButtonState();
          this.renderFilamentList();
        };
      }

      // Render initial filament list
      this.renderFilamentList();

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

    if (!this.canvas) {
      return;
    }

    const fileId = this.sourceFile?.id || this.sourceFile?.path;

    this.showCanvasLoading(true);

    try {
      if (fileId) {
        await this.canvas.loadSlice(fileId, index);
      } else {
        // No source image — update blank canvas for new slice index
        this.canvas.initBlankCanvas(this.tiffInfo.width, this.tiffInfo.height, index);
      }
      this.currentSlice = index;
      this.updateSliceIndicator();
      this.updateSliceButtons();

      // Re-render annotations for the new slice
      if (this.brushEngine) {
        this.brushEngine.renderAnnotations();
      }

      // Re-render filament markers for the new slice
      if (this.centerpointEngine) {
        this.centerpointEngine.setSlice(index);
        this.centerpointEngine.render();
      }

      // Update history buttons for the new slice
      this.updateHistoryButtons();
    } catch (error) {
      console.error('[AnnotationModule] Error loading slice:', error);
      if (this.state?.notify) {
        this.state.notify('error', `Failed to load slice ${index + 1}`);
      }
    } finally {
      this.showCanvasLoading(false);
    }
  }

  /**
   * Update slice indicator text
   */
  updateSliceIndicator() {
    const indicator = this.container.querySelector('#sliceIndicator');
    if (indicator) {
      indicator.textContent = `${this.currentSlice + 1} / ${this.totalSlices}`;
    }
  }

  /**
   * Update slice navigation button states
   */
  updateSliceButtons() {
    const prevBtn = this.container.querySelector('#prevSlice');
    const nextBtn = this.container.querySelector('#nextSlice');

    if (prevBtn) {
      prevBtn.disabled = this.currentSlice <= 0;
    }
    if (nextBtn) {
      nextBtn.disabled = this.currentSlice >= this.totalSlices - 1;
    }
  }

  /**
   * Update zoom indicator
   * @param {number} zoom - Current zoom level
   */
  updateZoomIndicator(zoom) {
    const indicator = this.container.querySelector('#zoomIndicator');
    if (indicator) {
      indicator.textContent = `${Math.round(zoom * 100)}%`;
    }
  }

  /**
   * Update coordinates display
   * @param {object} coords - Coordinate info from canvas
   */
  updateCoordsDisplay(coords) {
    const display = this.container.querySelector('#coordsDisplay');
    if (display) {
      if (coords.inBounds) {
        display.textContent = `X: ${Math.floor(coords.source.x)} Y: ${Math.floor(coords.source.y)}`;
      } else {
        display.textContent = 'X: -- Y: --';
      }
    }
  }

  /**
   * Update dimensions display
   * @param {number} width - Image width
   * @param {number} height - Image height
   */
  updateDimensionsDisplay(width, height) {
    const display = this.container.querySelector('#dimensionsDisplay');
    if (display) {
      display.textContent = `${width} × ${height}`;
    }
  }

  /**
   * Show/hide canvas loading overlay
   * @param {boolean} show - Whether to show loading
   */
  showCanvasLoading(show) {
    const loading = this.container.querySelector('#canvasLoading');
    if (loading) {
      loading.style.display = show ? 'flex' : 'none';
    }
  }

  // ===========================================================================
  // TOOL MANAGEMENT
  // ===========================================================================

  /**
   * Set the active tool
   * @param {'brush' | 'eraser' | 'centerpoint'} tool - Tool to activate
   */
  setTool(tool) {
    this.activeTool = tool;

    // Toggle engine states
    if (tool === 'centerpoint') {
      if (this.brushEngine) this.brushEngine.disable();
      if (this.centerpointEngine) this.centerpointEngine.enable();
    } else {
      if (this.centerpointEngine) this.centerpointEngine.disable();
      if (this.brushEngine) {
        this.brushEngine.enable();
        this.brushEngine.setTool(tool);
      }
    }

    // Update tool button UI
    const toolBrush = this.container.querySelector('#toolBrush');
    const toolEraser = this.container.querySelector('#toolEraser');

    if (toolBrush) toolBrush.classList.toggle('active', tool === 'brush');
    if (toolEraser) toolEraser.classList.toggle('active', tool === 'eraser');

    // Show/hide brush size section based on tool
    const brushSizeSection = this.container.querySelector('.brush-size-control')
      ?.closest('.toolbar-section');
    if (brushSizeSection) {
      brushSizeSection.style.display = tool === 'centerpoint' ? 'none' : '';
    }

    // Re-render both lists so only the active one shows a highlight
    this.renderClassList();
    this.renderFilamentList();

    // Re-render filament markers
    if (this.centerpointEngine) {
      this.centerpointEngine.render();
    }
  }

  /**
   * Set the brush size
   * @param {number} size - Brush size in pixels
   */
  setBrushSize(size) {
    if (!this.brushEngine) return;

    this.brushEngine.setBrushSize(size);

    // Update UI
    const slider = this.container.querySelector('#brushSizeSlider');
    const value = this.container.querySelector('#brushSizeValue');

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

    // Deselect active filament — only one selection across both lists
    if (this.filamentManager) {
      this.filamentManager.setActiveFilament(null);
      this.renderFilamentList();
    }

    this.renderClassList();

    // Auto-switch to brush tool when selecting a class
    if (this.activeTool === 'centerpoint') {
      this.setTool('brush');
    }
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
    const showClassHighlight = this.activeTool !== 'centerpoint';

    classList.innerHTML = classes.map(cls => `
      <div class="class-item ${showClassHighlight && cls.id === activeClass?.id ? 'active' : ''}"
           data-class-id="${cls.id}">
        <span class="class-color" style="background: ${cls.color};"></span>
        <span class="class-name">${cls.name}</span>
        <button class="class-visibility ${cls.visible ? 'is-visible' : 'is-hidden'}"
                title="${cls.visible ? 'Hide class' : 'Show class'}" data-action="visibility">
          ${cls.visible ? '👁️' : '👁️‍🗨️'}
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
  // FILAMENT MANAGEMENT
  // ===========================================================================

  /**
   * Add a new filament using the active class ID
   */
  addFilament() {
    if (!this.filamentManager) return;

    const activeClass = this.brushEngine?.getActiveClass();
    const classId = activeClass ? activeClass.id : 0;

    this.filamentManager.addFilament(classId);
    this.renderFilamentList();

    // Auto-switch to centerpoint tool when adding a filament (it's auto-selected)
    this.setTool('centerpoint');
  }

  /**
   * Delete a filament
   * @param {number} filamentId
   */
  deleteFilament(filamentId) {
    if (!this.filamentManager) return;

    const pointCount = this.filamentManager.getPointCount(filamentId);
    if (pointCount > 0) {
      if (!confirm(`Delete this filament? It has ${pointCount} point(s) across slices.`)) {
        return;
      }
    }

    this.filamentManager.removeFilament(filamentId);
    this.isDirty = true;
    this.renderFilamentList();

    // If no filaments remain, switch back to brush tool
    if (this.activeTool === 'centerpoint' && this.filamentManager.getAllFilaments().length === 0) {
      this.setTool('brush');
    } else if (this.centerpointEngine) {
      this.centerpointEngine.render();
    }
  }

  /**
   * Select a filament as active
   * @param {number} filamentId
   */
  selectFilament(filamentId) {
    if (!this.filamentManager) return;

    this.filamentManager.setActiveFilament(filamentId);
    this.renderFilamentList();

    // Re-render class list to remove its highlight
    this.renderClassList();

    // Auto-switch to centerpoint tool when selecting a filament
    this.setTool('centerpoint');
  }

  /**
   * Render the filament list UI
   */
  renderFilamentList() {
    const filamentList = this.container?.querySelector('#filamentList');
    if (!filamentList || !this.filamentManager) return;

    const filaments = this.filamentManager.getAllFilaments();
    const activeId = this.filamentManager.activeFilamentId;
    const showFilamentHighlight = this.activeTool === 'centerpoint';

    if (filaments.length === 0) {
      filamentList.innerHTML = `
        <div class="filament-empty-state">
          No filaments. Click + to add.
        </div>
      `;
      return;
    }

    filamentList.innerHTML = filaments.map(fil => {
      const pointCount = this.filamentManager.getPointCount(fil.id);
      return `
        <div class="filament-item ${showFilamentHighlight && fil.id === activeId ? 'active' : ''}"
             data-filament-id="${fil.id}">
          <span class="filament-color" style="background: ${fil.color};"></span>
          <span class="filament-name">${fil.name}</span>
          <span class="filament-count" title="${pointCount} point(s)">${pointCount}</span>
          <button class="filament-delete" title="Delete filament" data-action="delete">&times;</button>
        </div>
      `;
    }).join('');

    // Attach event listeners
    filamentList.querySelectorAll('.filament-item').forEach(item => {
      const filamentId = parseInt(item.dataset.filamentId, 10);

      const deleteBtn = item.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.deleteFilament(filamentId);
        });
      }

      item.addEventListener('click', (e) => {
        if (e.target.closest('.filament-delete')) return;
        this.selectFilament(filamentId);
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
      existingAnnotationId: this.currentAnnotationId,  // For updating existing annotations
      filaments: this.filamentManager
        ? this.filamentManager.toJSON(this.sourceFile?.id || this.sourceFile?.path)
        : null
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
    // Also collect all unique class IDs found in the pixel data
    const foundClassIds = new Set();

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

        // Scan for unique class IDs
        for (let i = 0; i < uint8Array.length; i++) {
          if (uint8Array[i] !== 0) {
            foundClassIds.add(uint8Array[i]);
          }
        }

        this.brushEngine.setAnnotationData(sliceIndex, uint8Array);
      }
    }

    // Auto-generate class definitions for any class IDs found in pixel data
    // that don't have a corresponding class definition (e.g. uploaded annotations
    // without a sidecar file)
    const existingIds = new Set(this.brushEngine.classes.map(c => c.id));
    const missingIds = [...foundClassIds].filter(id => !existingIds.has(id)).sort((a, b) => a - b);

    if (missingIds.length > 0) {
      console.log(`[AnnotationModule] Auto-generating classes for IDs: ${missingIds.join(', ')}`);
      for (const classId of missingIds) {
        // Manually insert a class with the exact ID found in the data
        const newClass = {
          id: classId,
          name: `Class ${classId}`,
          color: this.brushEngine.getNextColor(),
          visible: true
        };
        this.brushEngine.classes.push(newClass);
      }
      // Sort classes by ID for consistent ordering
      this.brushEngine.classes.sort((a, b) => a.id - b.id);
      // Update nextClassId to be above all existing IDs
      const maxId = Math.max(...this.brushEngine.classes.map(c => c.id));
      this.brushEngine.nextClassId = maxId + 1;
      this.brushEngine.activeClassId = this.brushEngine.classes[0].id;
    }

    // Re-render class list
    this.renderClassList();
    this.updateSaveButtonState();

    // Only render annotations if brush engine has been initialized with dimensions
    // (onSliceLoaded will call renderAnnotations after image loads)
    if (this.brushEngine.imageWidth > 0 && this.brushEngine.imageHeight > 0) {
      this.brushEngine.renderAnnotations();
    }

    // Restore filaments if present
    if (annotationData.filaments && this.filamentManager) {
      this.filamentManager.fromJSON(annotationData.filaments);
      this.renderFilamentList();
      if (this.centerpointEngine) {
        this.centerpointEngine.render();
      }
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

    // Store the annotation ID for future saves (to update instead of create new)
    this.currentAnnotationId = annotationFileId;

    try {
      // Load annotation data from API
      const result = await this.api.loadAnnotation(annotationFileId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to load annotation');
      }

      // Store source file info from sidecar
      if (result.sourceFileId) {
        this.sourceFile = {
          id: result.sourceFileId,
          name: result.sourceFileName
        };
      } else {
        console.warn('[AnnotationModule] No sourceFileId in annotation data');
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

      // Load source image slice or init blank canvas
      const sourceFileId = this.sourceFile?.id;
      if (sourceFileId) {
        console.log('[AnnotationModule] Loading source image:', sourceFileId);
        try {
          await this.canvas.loadSlice(sourceFileId, this.currentSlice);
        } catch (sliceError) {
          // Source image no longer available — fall back to blank canvas
          console.warn('[AnnotationModule] Source image unavailable, using blank canvas:', sliceError.message);
          this.sourceFile = null;
          this.canvas.initBlankCanvas(result.width, result.height);
        }
        this.updateZoomIndicator(this.canvas.getZoom());
      } else {
        // No source image (e.g. uploaded annotation) — show blank canvas
        console.log('[AnnotationModule] No source image, initializing blank canvas');
        this.canvas.initBlankCanvas(result.width, result.height);
        this.updateZoomIndicator(this.canvas.getZoom());
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
        let message = 'Annotation created successfully';
        if (result.directionVolume) {
          const coverage = result.directionVolume.stats?.coverage_percent;
          message += `. Direction volume generated (${coverage ?? '?'}% coverage)`;
        }
        if (this.state?.notify) {
          this.state.notify('success', message);
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
        createBtn.textContent = 'Create Annotation';
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
    const hasFilaments = this.filamentManager && this.filamentManager.hasAnyPoints();
    const hasContent = hasAnnotations || hasFilaments;

    if (saveBtn) {
      saveBtn.disabled = !hasContent;
    }
    if (createBtn) {
      createBtn.disabled = !hasContent;
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
    this.isEditing = false;
    this.sourceFileLoaded = false;
    this.currentAnnotationId = null;

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
      // Determine scenario based on file tags/category
      if (file.isTestData) {
        // Test data scenario - treat as new annotation
        await this.handleNewAnnotation(file);
      } else if (file.tags && file.tags.includes('annotation')) {
        if (file.tags.includes('wip')) {
          // WIP annotation - resume
          await this.handleResumeAnnotation(file);
        } else {
          // Finished annotation - edit in-place
          await this.handleEditAnnotation(file);
        }
      } else if (file.category === 'unfinished_annotations') {
        // Legacy fallback
        await this.handleResumeAnnotation(file);
      } else if (file.category === 'annotations') {
        // Legacy fallback
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

    // For test data, we'll use placeholder info until we actually load it
    if (file.isTestData) {
      this.sourceFile = file;
      this.tiffInfo = {
        width: 512,
        height: 512,
        sliceCount: 64,
        dtype: 'uint8'
      };
      this.isResuming = false;
      this.sourceFileLoaded = true;

      this.validationDisplay.showSuccess('Test Data Selected', [
        { label: 'Source', value: file.name || 'Test Dataset' },
        { label: 'Mode', value: 'New Annotation' },
        { label: 'Note', value: 'Test data will be loaded when you proceed' }
      ]);

      const step1Next = document.getElementById('step1Next');
      if (step1Next) step1Next.disabled = false;
      return;
    }

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
      { label: 'File', value: file.name },
      { label: 'Dimensions', value: `${this.tiffInfo.width} × ${this.tiffInfo.height}` },
      { label: 'Slices', value: this.tiffInfo.sliceCount },
      { label: 'Mode', value: 'New Annotation' }
    ]);

    // Enable next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = false;
  }

  /**
   * Handle resume unfinished annotation scenario
   * Will load annotation data and find source image
   */
  async handleResumeAnnotation(file) {
    console.log('[AnnotationModule] Resume annotation:', file.name);

    // Store as annotation file - source will be loaded from sidecar in Step 2
    this.annotationFile = file;
    this.isResuming = true;
    this.sourceFileLoaded = true;

    // For Phase 2, just show info - actual loading happens in later phases
    this.validationDisplay.showSuccess('Unfinished Annotation Selected', [
      { label: 'File', value: file.name },
      { label: 'Mode', value: 'Resume Previous Work' },
      { label: 'Note', value: 'Your previous progress will be restored' }
    ]);

    // Enable next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = false;
  }

  /**
   * Handle edit existing annotation scenario
   * Will load annotation and create new version
   */
  async handleEditAnnotation(file) {
    console.log('[AnnotationModule] Edit annotation:', file.name);

    // Store as annotation file - source will be loaded from sidecar in Step 2
    this.annotationFile = file;
    this.isResuming = true;  // Similar flow to resume (loads existing data)
    this.isEditing = true;   // Flag for in-place saves
    this.sourceFileLoaded = true;

    this.validationDisplay.showSuccess('Existing Annotation Selected', [
      { label: 'File', value: file.name },
      { label: 'Mode', value: 'Edit In-Place' },
      { label: 'Note', value: 'Changes will overwrite the existing annotation' }
    ]);

    // Enable next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = false;
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

    // Remove keyboard event listener
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }

    // Remove beforeunload handler
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }

    // Clean up centerpoint engine
    if (this.centerpointEngine) {
      this.centerpointEngine.destroy();
      this.centerpointEngine = null;
    }

    // Clean up filament manager
    if (this.filamentManager) {
      this.filamentManager.destroy();
      this.filamentManager = null;
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
    this.isEditing = false;
    this.sourceFileLoaded = false;
    this.currentAnnotationId = null;
    this.currentSlice = 0;
    this.totalSlices = 1;
    this.isDirty = false;
    this.activeTool = 'brush';

    await super.deactivate();
    console.log('[AnnotationModule] Deactivated');
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default AnnotationModule;
