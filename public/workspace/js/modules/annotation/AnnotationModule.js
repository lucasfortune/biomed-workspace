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

    // =========================================================================
    // MODULE STATE
    // =========================================================================

    // Source file info
    this.sourceFile = null;
    this.tiffInfo = null;

    // Annotation file info (for resume/edit scenarios)
    this.annotationFile = null;
    this.isResuming = false;

    // Slice navigation
    this.currentSlice = 0;
    this.totalSlices = 1;

    // =========================================================================
    // BIND METHODS
    // =========================================================================

    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
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
                    <h4>Tools</h4>
                    <div class="tool-buttons">
                      <button id="toolBrush" class="tool-btn active" title="Brush (B)">
                        <span class="tool-icon">🖌️</span>
                        <span class="tool-label">Brush</span>
                      </button>
                      <button id="toolEraser" class="tool-btn" title="Eraser (E)">
                        <span class="tool-icon">🧹</span>
                        <span class="tool-label">Eraser</span>
                      </button>
                    </div>
                  </div>

                  <!-- Brush Size Section -->
                  <div class="toolbar-section">
                    <h4>Brush Size</h4>
                    <div class="brush-size-control">
                      <input type="range" id="brushSizeSlider" min="1" max="50" value="10"
                             class="brush-slider" title="Brush size">
                      <span id="brushSizeValue" class="brush-size-value">10px</span>
                    </div>
                  </div>

                  <!-- History Section (placeholder for Phase 6) -->
                  <div class="toolbar-section">
                    <h4>History</h4>
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
                  </div>

                  <!-- Classes Section -->
                  <div class="toolbar-section classes-section">
                    <div class="classes-header">
                      <h4>Classes</h4>
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
        fileType: 'raw_images',  // Default category for uploads
        title: 'Source Image',
        icon: '🖼️',
        accept: '.tif,.tiff',
        showTestData: true,
        showRecentResults: true,
        stateManager: this.state,
        onSelect: this.onFileSelected,
        onUpload: this.onFileUploaded,
        // Show results from annotations and unfinished_annotations
        resultCategories: ['annotations', 'unfinished_annotations'],
        resultCategoryLabels: {
          'annotations': 'Existing Annotation',
          'unfinished_annotations': 'Unfinished'
        },
        // Filter workspace files to show raw images and inference data
        filterFiles: (files) => {
          return files.filter(f =>
            f.category === 'raw_images' ||
            f.category === 'inference_data' ||
            f.category === 'raw'  // Legacy category name
          );
        }
      });

      fileSelectorContainer.innerHTML = this.fileSelector.render();
      await this.fileSelector.init();
    }

    // Set up event listeners
    this.setupEventListeners();

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

    // Save Progress button (placeholder)
    const saveProgressBtn = this.container.querySelector('#saveProgressBtn');
    if (saveProgressBtn) {
      saveProgressBtn.addEventListener('click', () => {
        console.log('[AnnotationModule] Save progress clicked (not implemented yet)');
      });
    }

    // Create Annotation button (placeholder)
    const createAnnotationBtn = this.container.querySelector('#createAnnotationBtn');
    if (createAnnotationBtn) {
      createAnnotationBtn.addEventListener('click', () => {
        console.log('[AnnotationModule] Create annotation clicked (not implemented yet)');
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
    document.addEventListener('keydown', (e) => {
      // Only handle if Step 2 is active
      if (this.currentStep !== 2) return;

      // Don't handle if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
    });

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

      // Create brush engine if not exists
      if (!this.brushEngine) {
        this.brushEngine = new BrushEngine(this.canvas);

        // Set up brush engine callbacks
        this.brushEngine.onStrokeEnd = () => {
          // Could save history state here (Phase 6)
        };

        this.brushEngine.onAnnotationChange = () => {
          // Mark as dirty for unsaved changes warning (Phase 9)
        };

        // Render initial class list
        this.renderClassList();
      }

      // Get file ID and slice count
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

    this.showCanvasLoading(true);

    try {
      await this.canvas.loadSlice(fileId, index);
      this.currentSlice = index;
      this.updateSliceIndicator();
      this.updateSliceButtons();

      // Re-render annotations for the new slice
      if (this.brushEngine) {
        this.brushEngine.renderAnnotations();
      }
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
    this.sourceFileLoaded = false;

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
      // Determine scenario based on file category or test data flag
      if (file.isTestData) {
        // Test data scenario - treat as new annotation
        await this.handleNewAnnotation(file);
      } else if (file.category === 'unfinished_annotations') {
        // Resume unfinished annotation
        await this.handleResumeAnnotation(file);
      } else if (file.category === 'annotations') {
        // Edit existing annotation
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
    this.isResuming = true;  // Similar flow to resume
    this.sourceFileLoaded = true;

    // For Phase 2, just show info - actual loading happens in later phases
    this.validationDisplay.showSuccess('Existing Annotation Selected', [
      { label: 'File', value: file.name },
      { label: 'Mode', value: 'Edit Existing (creates new version)' },
      { label: 'Note', value: 'Changes will be saved as a new file' }
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
    this.sourceFileLoaded = false;
    this.currentSlice = 0;
    this.totalSlices = 1;

    await super.deactivate();
    console.log('[AnnotationModule] Deactivated');
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default AnnotationModule;
