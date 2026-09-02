/**
 * ImageViewerModule - TIFF Stack Viewer with Gallery and Icon Modes
 *
 * A 2-step module for viewing TIFF image stacks:
 * - Step 1: File Selection (workspace files or segmentation results)
 * - Step 2: Image Viewing (Gallery mode or Icon grid mode)
 *
 * Extends BaseModule for consistent UI and lifecycle management.
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import {
  StepNavigator,
  NavigationButtons,
  ValidationDisplay,
  FileSelector
} from '/workspace/js/core/components/index.js';

class ImageViewerModule extends BaseModule {
  constructor(stateManager) {
    // Define module configuration
    const config = {
      id: 'imageviewer',
      name: 'Image Viewer',
      cssPath: '/workspace/js/modules/imageviewer/css/imageviewer.css',
      steps: [
        {
          id: 'selection',
          name: 'Image Selection',
          canNavigate: true
        },
        {
          id: 'viewer',
          name: 'View Image',
          canNavigate: (module) => module.selectedFile !== null
        }
      ]
    };

    super(stateManager, config);

    // Module-specific state
    this.selectedFile = null;
    this.tiffInfo = null;
    this.currentSlice = 0;
    this.viewMode = 'gallery';  // 'gallery' or 'icon'

    // Comparison mode: 2-4 stacks viewed side by side with synced
    // z/zoom/pan (single-file behavior is unchanged when empty)
    this.comparisonFiles = [];  // {id, name, path, sliceCount, width, height}

    // Slice prefetch bookkeeping (browser-cached via Cache-Control)
    this._prefetched = new Set();

    // Zoom/pan state for gallery view
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    // Components
    this.stepNavigator = null;
    this.navigationButtons = null;
    this.validationDisplay = null;
    this.imageSelector = null;

    // IntersectionObserver for lazy loading (stored for cleanup)
    this.imageObserver = null;

    // Bind methods
    this.onFileSelect = this.onFileSelect.bind(this);
    this.onFileUpload = this.onFileUpload.bind(this);
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

  /**
   * Initialize module after render
   */
  async initialize() {
    // Make module instance globally accessible
    window.imageViewerModule = this;

    // Initialize components
    this.initializeComponents();

    // Check for incoming data from segmentation module
    const hasIncoming = this.checkForIncomingData();

    // Setup event listeners
    this.setupEventListeners();

    // If we have incoming data, automatically proceed to step 2
    if (hasIncoming) {
      await this.handleIncomingData();
    }
  }

  /**
   * Initialize UI components
   */
  initializeComponents() {
    // Initialize StepNavigator
    this.stepNavigator = new StepNavigator({
      steps: this.config.steps,
      currentStep: this.currentStep,
      onStepClick: (stepNum) => this.goToStep(stepNum),
      canNavigate: (stepNum) => this.canNavigateToStep(stepNum)
    });
    this.stepNavigator.init(this.container);

    // Initialize ValidationDisplay
    this.validationDisplay = new ValidationDisplay('validationResult');

    // Initialize NavigationButtons for step 1
    this.navigationButtons = new NavigationButtons({
      onPrevious: null,
      onNext: () => this.proceedToViewer(),
      previousLabel: '',
      nextLabel: 'Next: View Image',
      showPrevious: false,
      nextDisabled: true,
      nextId: 'step1Next'
    });
    this.navigationButtons.init(this.container);

    // Initialize FileSelector
    this.imageSelector = new FileSelector({
      id: 'image-selector',
      title: 'Image Stack',
      icon: '🖼️',
      helpIconHtml: this.renderHelpIcon('imageviewer.step1.image-stack'),
      fileType: 'image_stack',
      showTestData: false,
      showRecentResults: true,
      acceptAllTiff: true,
      onSelect: this.onFileSelect,
      onUpload: this.onFileUpload,
      stateManager: this.state
    });

    // Render FileSelector into container
    const selectorContainer = document.getElementById('imageSelectorContainer');
    if (selectorContainer) {
      selectorContainer.innerHTML = this.imageSelector.render();
      this.imageSelector.init();
    }
  }

  /**
   * Check for incoming data from other modules (segmentation, denoising, etc.)
   */
  checkForIncomingData() {
    // Check for segmentation results
    const segResults = this.state.get('modules.segmentation.inferenceResults');
    if (segResults?.outputPath) {
      console.log('[ImageViewerModule] Found incoming segmentation result:', segResults);
      this.selectedFile = {
        id: segResults.inferenceId || 'segmentation_result',
        path: segResults.outputPath,
        name: 'Segmentation Result',
        source: 'segmentation',
        inferenceId: segResults.inferenceId,
        metadataPath: segResults.metadataPath
      };
      return true;
    }

    // Check for DL denoising results (from DLDenoisingModule)
    const dlDenoisingResults = this.state.get('modules.denoising-dl.viewerFile');
    if (dlDenoisingResults?.outputPath) {
      console.log('[ImageViewerModule] Found incoming DL denoising result:', dlDenoisingResults);
      const stageName = dlDenoisingResults.stage === 'stage2' ? 'Stage 2' : 'Stage 1';
      const methodName = dlDenoisingResults.method === 'autostructn2v' ? 'autoStructN2V' : 'N2V';
      this.selectedFile = {
        id: dlDenoisingResults.trainingId || 'dl_denoising_result',
        path: dlDenoisingResults.outputPath,
        name: `${methodName} Denoised (${stageName})`,
        source: 'denoising-dl',
        trainingId: dlDenoisingResults.trainingId,
        stage: dlDenoisingResults.stage
      };
      return true;
    }

    // Check for filter denoising results
    const denoisingResults = this.state.get('modules.denoising.viewerFile');
    if (denoisingResults?.fileId) {
      console.log('[ImageViewerModule] Found incoming denoising result:', denoisingResults);
      this.selectedFile = {
        id: denoisingResults.fileId,
        path: denoisingResults.path,
        name: denoisingResults.name || 'Denoised Image',
        source: 'denoising'
      };
      return true;
    }

    // Check for generic incoming file (for any module to use)
    const genericFile = this.state.get('workspace.viewerFile');
    if (genericFile?.fileId) {
      console.log('[ImageViewerModule] Found incoming generic file:', genericFile);
      this.selectedFile = {
        id: genericFile.fileId,
        path: genericFile.path,
        name: genericFile.name || 'Image File',
        source: genericFile.source || 'workspace'
      };
      return true;
    }

    return false;
  }

  /**
   * Handle incoming data - load info and go to step 2
   */
  async handleIncomingData() {
    try {
      await this.loadTiffInfo();
      this.goToStep(2);
      // Clear all incoming data sources
      this.state.update('modules.segmentation.inferenceResults', null);
      this.state.update('modules.denoising-dl.viewerFile', null);
      this.state.update('modules.denoising.viewerFile', null);
      this.state.update('workspace.viewerFile', null);
    } catch (error) {
      console.error('[ImageViewerModule] Error handling incoming data:', error);
      this.state.notify('error', 'Failed to load image file');
    }
  }

  /**
   * Render main UI
   */
  render() {
    this.container.innerHTML = `
      <div class="imageviewer-module">
        ${this.renderHeader()}

        <!-- Step Navigation (rendered by StepNavigator) -->
        ${this.renderStepNav()}

        <!-- Step Content -->
        <div class="step-contents">
          <!-- Step 1: File Selection -->
          <div class="step-content active" id="step1">
            ${this.renderStep1()}
          </div>

          <!-- Step 2: Image Viewer -->
          <div class="step-content" id="step2">
            ${this.renderStep2()}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Step 1: File Selection
   */
  renderStep1() {
    return `
      <h2>Step 1: Image Selection</h2>
      <p>Select a TIFF image stack to view. Choose from recent results or upload a new file.</p>

      <!-- FileSelector will be inserted here -->
      <div id="imageSelectorContainer"></div>

      <!-- Validation Result (rendered by ValidationDisplay) -->
      ${ValidationDisplay.renderContainer('validationResult')}

      <!-- Comparison list: add several stacks to view them side by side -->
      <div class="comparison-section">
        <div class="comparison-header">
          <h4>Compare stacks <span class="comparison-hint">(optional)</span></h4>
          <button class="btn small" id="addToComparisonBtn" disabled>+ Add selected to comparison</button>
        </div>
        <ul class="comparison-list" id="comparisonList"></ul>
        <p class="field-hint">
          Add two to four stacks to view them side by side with a shared
          slice slider, zoom and pan. Leave the list empty to view the
          selected stack on its own.
        </p>
      </div>

      <!-- Navigation Buttons -->
      <div class="navigation-buttons">
        <div></div>
        <button class="btn" id="step1Next" disabled>Next: View Image</button>
      </div>
    `;
  }

  /**
   * Render Step 2: Image Viewer
   */
  renderStep2() {
    return `
      <div class="image-viewer-container">
        <!-- View Mode Toggle -->
        <div class="viewer-toolbar">
          <button class="btn secondary" id="backToStep1">
            <span class="back-arrow">←</span> Change File
          </button>
          <div class="view-mode-toggle">
            <button class="mode-btn active" id="galleryModeBtn" title="Gallery View">
              <span>Gallery</span>
            </button>
            <button class="mode-btn" id="iconModeBtn" title="Thumbnail Grid">
              <span>Thumbnails</span>
            </button>
          </div>
          <div class="file-info" id="fileInfoDisplay">
            <span class="filename">--</span>
            <span class="slice-count">-- slices</span>
          </div>
          ${this.renderHelpIcon('imageviewer.step2.ui-controls')}
        </div>

        <!-- View Container -->
        <div class="view-container" id="viewContainer">
          <!-- Gallery or Icon view will be rendered here -->
          <div class="view-placeholder">
            <p>Select a file to view</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * FileSelector callback: called when user selects a file
   */
  async onFileSelect(fileInfo) {
    console.log(`[ImageViewerModule] File selected:`, fileInfo);
    this.selectedFile = fileInfo;

    if (fileInfo && !fileInfo.isTestData) {
      // Validate the file
      await this.validateTiffFile(fileInfo.id || fileInfo.path);
    } else if (fileInfo?.isTestData) {
      // Test data selected (shouldn't happen as showTestData=false)
      this.validationDisplay.showInfo('Test Data', 'Test data selected');
      this.navigationButtons.setNextEnabled(true);
    }
  }

  /**
   * FileSelector callback: called when user uploads a file
   */
  async onFileUpload(file, uploadedInfo) {
    console.log(`[ImageViewerModule] File uploaded:`, uploadedInfo);
    this.selectedFile = {
      id: uploadedInfo.id,
      name: uploadedInfo.name || file.name,
      path: uploadedInfo.path,
      source: 'upload'
    };

    // Trigger validation for the uploaded file
    if (uploadedInfo.id) {
      await this.validateTiffFile(uploadedInfo.id);
    }
  }

  /**
   * Validate TIFF file and display results
   */
  async validateTiffFile(fileId) {
    this.validationDisplay.showLoading('Validating file...');

    try {
      const response = await fetch(`/api/workspace/tiff-info/${fileId}`);
      const data = await response.json();

      if (data.success) {
        this.tiffInfo = {
          sliceCount: data.sliceCount,
          width: data.width,
          height: data.height,
          dtype: data.dtype
        };

        this.validationDisplay.showSuccess('Valid TIFF File', [
          { label: 'Dimensions', value: `${data.width} x ${data.height}` },
          { label: 'Slices', value: data.sliceCount },
          { label: 'Data Type', value: data.dtype }
        ]);

        // Enable next button + comparison add
        this.navigationButtons.setNextEnabled(true);
        this.updateComparisonControls();
      } else {
        this.validationDisplay.showError('Validation Failed', data.error || 'Unknown error');
        this.navigationButtons.setNextEnabled(false);
        this.updateComparisonControls();
      }
    } catch (error) {
      console.error('[ImageViewerModule] Validation error:', error);
      this.validationDisplay.showError('Validation Error', error.message);
      this.navigationButtons.setNextEnabled(false);
      this.updateComparisonControls();
    }
  }

  // ===========================================================================
  // COMPARISON LIST (step 1)
  // ===========================================================================

  get comparing() {
    return this.comparisonFiles.length >= 2;
  }

  updateComparisonControls() {
    const addBtn = document.getElementById('addToComparisonBtn');
    if (addBtn) {
      const eligible = this.selectedFile?.id && this.tiffInfo
        && this.comparisonFiles.length < 4
        && !this.comparisonFiles.some(f => f.id === this.selectedFile.id);
      addBtn.disabled = !eligible;
    }
    const next = document.getElementById('step1Next');
    if (next) {
      if (this.comparing) {
        next.disabled = false;
        next.textContent = `Next: Compare ${this.comparisonFiles.length} Stacks`;
      } else {
        next.textContent = 'Next: View Image';
        if (this.comparisonFiles.length === 1) next.disabled = false;
      }
    }
  }

  addToComparison() {
    if (!this.selectedFile?.id || !this.tiffInfo) return;
    if (this.comparisonFiles.length >= 4) {
      this.state.notify('warning', 'Comparison supports up to four stacks.');
      return;
    }
    if (this.comparisonFiles.some(f => f.id === this.selectedFile.id)) return;
    this.comparisonFiles.push({
      id: this.selectedFile.id,
      name: this.selectedFile.name,
      path: this.selectedFile.path,
      sliceCount: this.tiffInfo.sliceCount,
      width: this.tiffInfo.width,
      height: this.tiffInfo.height
    });
    this.renderComparisonList();
    this.updateComparisonControls();
  }

  removeFromComparison(index) {
    this.comparisonFiles.splice(index, 1);
    this.renderComparisonList();
    this.updateComparisonControls();
  }

  renderComparisonList() {
    const list = document.getElementById('comparisonList');
    if (!list) return;
    list.innerHTML = this.comparisonFiles.map((f, i) => `
      <li class="comparison-item">
        <span class="comparison-order">${i + 1}</span>
        <span class="comparison-name">${f.name}</span>
        <span class="comparison-dims">${f.width}&times;${f.height}, ${f.sliceCount} slices</span>
        <button class="btn tiny" onclick="window.imageViewerModule?.removeFromComparison(${i})">&times;</button>
      </li>
    `).join('') || '';
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Back to hub
    const backBtn = document.getElementById('backToHub');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.workspace.returnToHub();
      });
    }

    // Back to step 1
    const backToStep1 = document.getElementById('backToStep1');
    if (backToStep1) {
      backToStep1.addEventListener('click', () => this.goToStep(1));
    }

    // View mode toggle
    const galleryBtn = document.getElementById('galleryModeBtn');
    const iconBtn = document.getElementById('iconModeBtn');

    if (galleryBtn) {
      galleryBtn.addEventListener('click', () => this.switchToGalleryMode());
    }
    if (iconBtn) {
      iconBtn.addEventListener('click', () => this.switchToIconMode());
    }

    // Comparison list
    document.getElementById('addToComparisonBtn')
      ?.addEventListener('click', () => this.addToComparison());
  }

  /**
   * Override goToStep to add step-specific logic
   */
  goToStep(stepNum) {
    // Call parent implementation
    super.goToStep(stepNum);

    // Scroll step-contents to top when changing steps
    const stepContents = this.container?.querySelector('.step-contents');
    if (stepContents) {
      stepContents.scrollTop = 0;
    }

    // Update StepNavigator
    if (this.stepNavigator) {
      this.stepNavigator.update(stepNum);
    }

    // Step-specific initialization
    if (stepNum === 2 && (this.selectedFile || this.comparing)) {
      this.initializeViewer();
    }
  }

  /**
   * Proceed to viewer (Step 1 -> Step 2)
   */
  async proceedToViewer() {
    // A single stack in the comparison list is just a viewing choice
    if (this.comparisonFiles.length === 1 && !this.selectedFile) {
      const f = this.comparisonFiles[0];
      this.selectedFile = { id: f.id, path: f.path, name: f.name, source: 'workspace' };
      this.tiffInfo = { sliceCount: f.sliceCount, width: f.width, height: f.height };
    }
    if (!this.selectedFile && !this.comparing) return;

    try {
      this.showLoading('Loading image information...');

      // Load TIFF info if not already loaded by validation
      if (!this.comparing && !this.tiffInfo) {
        await this.loadTiffInfo();
      }

      this.goToStep(2);
      this.hideLoading();
    } catch (error) {
      console.error('[ImageViewerModule] Error loading file:', error);
      this.state.notify('error', 'Failed to load file information');
      this.hideLoading();
    }
  }

  /**
   * Load TIFF file information
   */
  async loadTiffInfo() {
    if (!this.selectedFile) return;

    try {
      let url;
      if (this.selectedFile.source === 'segmentation') {
        url = `/results/${this.selectedFile.inferenceId}/tiff-info`;
      } else if (this.selectedFile.source === 'denoising-dl') {
        // DL denoising results use path-based endpoint
        url = `/api/denoising/dl/tiff-info?path=${encodeURIComponent(this.selectedFile.path)}`;
      } else {
        url = `/api/workspace/tiff-info/${this.selectedFile.id}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        this.tiffInfo = {
          sliceCount: data.sliceCount,
          width: data.width,
          height: data.height,
          dtype: data.dtype
        };
      } else {
        throw new Error(data.error || 'Failed to get file info');
      }
    } catch (error) {
      console.error('[ImageViewerModule] Error loading TIFF info:', error);
      throw error;
    }
  }

  /**
   * Maximum slice index across the compared stacks
   */
  comparisonMaxSlices() {
    return Math.max(...this.comparisonFiles.map(f => f.sliceCount));
  }

  /**
   * Initialize the viewer for Step 2
   */
  async initializeViewer() {
    // Update file info display
    const fileInfoDisplay = document.getElementById('fileInfoDisplay');
    if (fileInfoDisplay) {
      if (this.comparing) {
        fileInfoDisplay.innerHTML = `
          <span class="filename">Comparing ${this.comparisonFiles.length} stacks</span>
          <span class="slice-count">${this.comparisonMaxSlices()} slices</span>
        `;
      } else if (this.tiffInfo) {
        fileInfoDisplay.innerHTML = `
          <span class="filename">${this.selectedFile.name}</span>
          <span class="slice-count">${this.tiffInfo.sliceCount} slices</span>
        `;
      }
    }

    // Render the appropriate view mode
    if (this.viewMode === 'gallery') {
      this.renderGalleryView();
    } else {
      this.renderIconView();
    }
  }

  /**
   * Switch to gallery mode
   */
  switchToGalleryMode(sliceIndex = null) {
    if (sliceIndex !== null) {
      this.currentSlice = sliceIndex;
    }
    this.viewMode = 'gallery';

    // Update toggle buttons
    document.getElementById('galleryModeBtn')?.classList.add('active');
    document.getElementById('iconModeBtn')?.classList.remove('active');

    this.renderGalleryView();
  }

  /**
   * Switch to icon mode
   */
  switchToIconMode() {
    this.viewMode = 'icon';

    // Update toggle buttons
    document.getElementById('galleryModeBtn')?.classList.remove('active');
    document.getElementById('iconModeBtn')?.classList.add('active');

    this.renderIconView();
  }

  /**
   * URL of a slice image for a comparison entry (workspace files)
   */
  comparisonSliceUrl(file, sliceIndex, size) {
    return `/api/workspace/slice/${file.id}/${sliceIndex}?size=${size}`;
  }

  /**
   * Warm the browser cache with neighboring slices (slice endpoints send
   * Cache-Control, so each URL is fetched at most once per day)
   */
  prefetchNeighbors(sliceIndex) {
    if (this._prefetched.size > 800) this._prefetched.clear();
    const targets = this.comparing ? this.comparisonFiles
      : (this.selectedFile?.id && this.selectedFile.source !== 'segmentation'
         && this.selectedFile.source !== 'denoising-dl'
        ? [{ id: this.selectedFile.id, sliceCount: this.tiffInfo?.sliceCount || 1 }]
        : []);
    for (const file of targets) {
      for (const offset of [1, -1, 2, -2]) {
        const idx = sliceIndex + offset;
        if (idx < 0 || idx >= file.sliceCount) continue;
        const url = this.comparisonSliceUrl(file, idx, 'gallery');
        if (this._prefetched.has(url)) continue;
        this._prefetched.add(url);
        const img = new Image();
        img.src = url;
      }
    }
  }

  /**
   * Render gallery view
   */
  renderGalleryView() {
    if (this.comparing) {
      this.renderComparisonGallery();
      return;
    }
    const container = document.getElementById('viewContainer');
    if (!container) return;

    const sliceCount = this.tiffInfo?.sliceCount || 1;

    container.innerHTML = `
      <div class="gallery-view">
        <!-- Image Display -->
        <div class="gallery-image-wrapper" id="imageWrapper">
          <img id="galleryImage" src="" alt="Slice" style="display: none;" />
          <div class="image-loading" id="imageLoading">
            <div class="spinner"></div>
            <span>Loading slice...</span>
          </div>
        </div>

        <!-- Controls -->
        <div class="gallery-controls">
          <div class="slice-navigation">
            <button class="nav-btn" id="prevSliceBtn" ${this.currentSlice <= 0 ? 'disabled' : ''}>
              ◀ Previous
            </button>
            <div class="slice-indicator">
              <span id="currentSliceNum">${this.currentSlice + 1}</span>
              <span>/</span>
              <span id="totalSlicesNum">${sliceCount}</span>
            </div>
            <button class="nav-btn" id="nextSliceBtn" ${this.currentSlice >= sliceCount - 1 ? 'disabled' : ''}>
              Next ▶
            </button>
          </div>

          <div class="zoom-controls">
            <button class="zoom-btn" id="zoomOutBtn">−</button>
            <span class="zoom-level" id="zoomLevel">${Math.round(this.zoomLevel * 100)}%</span>
            <button class="zoom-btn" id="zoomInBtn">+</button>
            <button class="zoom-btn" id="zoomResetBtn">Reset</button>
          </div>
        </div>

        <!-- Slice Slider -->
        <div class="slice-slider-container">
          <input type="range"
                 id="sliceSlider"
                 min="0"
                 max="${sliceCount - 1}"
                 value="${this.currentSlice}"
                 class="slice-slider range-slider" />
        </div>
      </div>
    `;

    // Setup gallery event listeners
    this.setupGalleryEventListeners();

    // Load current slice
    this.loadSlice(this.currentSlice);
  }

  /**
   * Render the comparison gallery: 2-4 panes with shared slice slider,
   * zoom and pan
   */
  renderComparisonGallery() {
    const container = document.getElementById('viewContainer');
    if (!container) return;

    const sliceCount = this.comparisonMaxSlices();
    const n = this.comparisonFiles.length;

    container.innerHTML = `
      <div class="gallery-view comparison-view">
        <div class="comparison-grid panes-${n}" id="comparisonGrid">
          ${this.comparisonFiles.map((f, i) => `
            <div class="comparison-pane" data-pane="${i}">
              <div class="comparison-pane-label" title="${f.name}">${f.name}</div>
              <div class="comparison-pane-image">
                <img data-pane-img="${i}" alt="" draggable="false" />
                <div class="pane-end-badge" data-pane-end="${i}" style="display: none;">end of stack</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="gallery-controls">
          <div class="slice-navigation">
            <button class="nav-btn" id="prevSliceBtn" ${this.currentSlice <= 0 ? 'disabled' : ''}>
              ◀ Previous
            </button>
            <div class="slice-indicator">
              <span id="currentSliceNum">${this.currentSlice + 1}</span>
              <span>/</span>
              <span id="totalSlicesNum">${sliceCount}</span>
            </div>
            <button class="nav-btn" id="nextSliceBtn" ${this.currentSlice >= sliceCount - 1 ? 'disabled' : ''}>
              Next ▶
            </button>
          </div>

          <div class="zoom-controls">
            <button class="zoom-btn" id="zoomOutBtn">−</button>
            <span class="zoom-level" id="zoomLevel">${Math.round(this.zoomLevel * 100)}%</span>
            <button class="zoom-btn" id="zoomInBtn">+</button>
            <button class="zoom-btn" id="zoomResetBtn">Reset</button>
          </div>
        </div>

        <div class="slice-slider-container">
          <input type="range"
                 id="sliceSlider"
                 min="0"
                 max="${sliceCount - 1}"
                 value="${this.currentSlice}"
                 class="slice-slider range-slider" />
        </div>
      </div>
    `;

    // Same shared controls as the single gallery; pan attaches to the grid
    this.setupGalleryEventListeners('comparisonGrid');
    this.loadComparisonSlices(this.currentSlice);
  }

  /**
   * Load the current slice into every comparison pane (shorter stacks
   * clamp to their last slice and show an end-of-stack badge)
   */
  loadComparisonSlices(sliceIndex) {
    this.comparisonFiles.forEach((f, i) => {
      const img = document.querySelector(`[data-pane-img="${i}"]`);
      const badge = document.querySelector(`[data-pane-end="${i}"]`);
      if (!img) return;
      const clamped = Math.min(sliceIndex, f.sliceCount - 1);
      if (badge) badge.style.display = sliceIndex > f.sliceCount - 1 ? '' : 'none';
      img.src = this.comparisonSliceUrl(f, clamped, 'gallery');
    });
    this.applyZoomPan();
    this.prefetchNeighbors(sliceIndex);
  }

  /**
   * Setup gallery view event listeners
   * @param {string} [panSurfaceId='imageWrapper'] - element that receives
   *   pan/wheel events (the comparison grid in comparison mode)
   */
  setupGalleryEventListeners(panSurfaceId = 'imageWrapper') {
    // Slice navigation
    document.getElementById('prevSliceBtn')?.addEventListener('click', () => this.previousSlice());
    document.getElementById('nextSliceBtn')?.addEventListener('click', () => this.nextSlice());

    // Slice slider
    const slider = document.getElementById('sliceSlider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        this.goToSlice(parseInt(e.target.value));
      });
    }

    // Zoom controls
    document.getElementById('zoomInBtn')?.addEventListener('click', () => this.zoomIn());
    document.getElementById('zoomOutBtn')?.addEventListener('click', () => this.zoomOut());
    document.getElementById('zoomResetBtn')?.addEventListener('click', () => this.resetZoom());

    // Pan handlers
    const imageWrapper = document.getElementById(panSurfaceId);
    if (imageWrapper) {
      imageWrapper.addEventListener('mousedown', (e) => this.startPan(e));
      imageWrapper.addEventListener('mousemove', (e) => this.doPan(e));
      imageWrapper.addEventListener('mouseup', () => this.endPan());
      imageWrapper.addEventListener('mouseleave', () => this.endPan());
      imageWrapper.addEventListener('wheel', (e) => this.handleWheel(e));
    }
  }

  /**
   * Load a slice image
   */
  async loadSlice(sliceIndex) {
    if (!this.selectedFile) return;

    const img = document.getElementById('galleryImage');
    const loading = document.getElementById('imageLoading');

    if (loading) loading.style.display = 'flex';
    if (img) img.style.display = 'none';

    try {
      let url;
      if (this.selectedFile.source === 'segmentation') {
        url = `/results/${this.selectedFile.inferenceId}/slice/${sliceIndex}?size=gallery`;
      } else if (this.selectedFile.source === 'denoising-dl') {
        // DL denoising results use path-based endpoint
        url = `/api/denoising/dl/slice/${sliceIndex}?path=${encodeURIComponent(this.selectedFile.path)}&size=gallery`;
      } else {
        url = `/api/workspace/slice/${this.selectedFile.id}/${sliceIndex}?size=gallery`;
      }

      const newImg = new Image();
      newImg.onload = () => {
        if (img) {
          img.src = newImg.src;
          img.style.display = 'block';
          this.applyZoomPan();
        }
        if (loading) loading.style.display = 'none';
        this.prefetchNeighbors(sliceIndex);
      };
      newImg.onerror = () => {
        if (loading) {
          loading.innerHTML = '<span class="error">Failed to load slice</span>';
        }
      };
      newImg.src = url;

    } catch (error) {
      console.error('[ImageViewerModule] Error loading slice:', error);
      if (loading) {
        loading.innerHTML = '<span class="error">Failed to load slice</span>';
      }
    }
  }

  /**
   * Navigate to specific slice
   */
  goToSlice(index) {
    const maxSlice = this.comparing
      ? this.comparisonMaxSlices() - 1
      : (this.tiffInfo?.sliceCount || 1) - 1;
    this.currentSlice = Math.max(0, Math.min(index, maxSlice));

    // Update UI
    const currentNum = document.getElementById('currentSliceNum');
    const slider = document.getElementById('sliceSlider');
    const prevBtn = document.getElementById('prevSliceBtn');
    const nextBtn = document.getElementById('nextSliceBtn');

    if (currentNum) currentNum.textContent = this.currentSlice + 1;
    if (slider) slider.value = this.currentSlice;
    if (prevBtn) prevBtn.disabled = this.currentSlice <= 0;
    if (nextBtn) nextBtn.disabled = this.currentSlice >= maxSlice;

    // Load the slice(s)
    if (this.comparing) {
      this.loadComparisonSlices(this.currentSlice);
    } else {
      this.loadSlice(this.currentSlice);
    }
  }

  /**
   * Go to next slice
   */
  nextSlice() {
    const maxSlice = this.comparing
      ? this.comparisonMaxSlices() - 1
      : (this.tiffInfo?.sliceCount || 1) - 1;
    if (this.currentSlice < maxSlice) {
      this.goToSlice(this.currentSlice + 1);
    }
  }

  /**
   * Go to previous slice
   */
  previousSlice() {
    if (this.currentSlice > 0) {
      this.goToSlice(this.currentSlice - 1);
    }
  }

  /**
   * Zoom in
   */
  zoomIn() {
    this.zoomLevel = Math.min(4, this.zoomLevel * 1.25);
    this.updateZoomDisplay();
    this.applyZoomPan();
  }

  /**
   * Zoom out
   */
  zoomOut() {
    this.zoomLevel = Math.max(0.25, this.zoomLevel / 1.25);
    this.updateZoomDisplay();
    this.applyZoomPan();
  }

  /**
   * Reset zoom
   */
  resetZoom() {
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
    this.updateZoomDisplay();
    this.applyZoomPan();
  }

  /**
   * Update zoom level display
   */
  updateZoomDisplay() {
    const zoomDisplay = document.getElementById('zoomLevel');
    if (zoomDisplay) {
      zoomDisplay.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  /**
   * Apply zoom and pan to the image (or to every comparison pane -
   * the same transform keeps the views in sync)
   */
  applyZoomPan() {
    const transform = `scale(${this.zoomLevel}) translate(${this.panOffset.x}px, ${this.panOffset.y}px)`;
    const img = document.getElementById('galleryImage');
    if (img) img.style.transform = transform;
    document.querySelectorAll('[data-pane-img]').forEach(pimg => {
      pimg.style.transform = transform;
    });
  }

  /**
   * Start panning
   */
  startPan(e) {
    if (this.zoomLevel > 1) {
      this.isDragging = true;
      this.dragStart = { x: e.clientX - this.panOffset.x, y: e.clientY - this.panOffset.y };
      e.preventDefault();
    }
  }

  /**
   * Continue panning
   */
  doPan(e) {
    if (this.isDragging) {
      this.panOffset = {
        x: e.clientX - this.dragStart.x,
        y: e.clientY - this.dragStart.y
      };
      this.applyZoomPan();
    }
  }

  /**
   * End panning
   */
  endPan() {
    this.isDragging = false;
  }

  /**
   * Handle mouse wheel for zooming
   */
  handleWheel(e) {
    e.preventDefault();
    if (e.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  /**
   * Render icon grid view
   */
  renderIconView() {
    if (this.comparing) {
      this.renderComparisonIconView();
      return;
    }
    const container = document.getElementById('viewContainer');
    if (!container) return;

    const sliceCount = this.tiffInfo?.sliceCount || 1;

    container.innerHTML = `
      <div class="icon-grid-view">
        <div class="icon-grid" id="iconGrid">
          ${this.renderThumbnailCards(sliceCount)}
        </div>
      </div>
    `;

    // Setup lazy loading
    this.setupLazyLoading();
  }

  /**
   * Comparison thumbnail view: one column per stack, one row per slice
   * index, so the same z position lines up across stacks
   */
  renderComparisonIconView() {
    const container = document.getElementById('viewContainer');
    if (!container) return;

    const sliceCount = this.comparisonMaxSlices();
    const n = this.comparisonFiles.length;

    let rows = '';
    for (let i = 0; i < sliceCount; i++) {
      rows += `
        <div class="comparison-thumb-row">
          <div class="comparison-thumb-index">${i + 1}</div>
          ${this.comparisonFiles.map((f, col) => i < f.sliceCount ? `
            <div class="thumbnail-card comparison-thumb-cell" data-slice="${i}" data-col="${col}">
              <div class="thumbnail-placeholder" id="cmp-thumb-${col}-${i}">
                <span class="slice-num">${i + 1}</span>
              </div>
            </div>` : `
            <div class="comparison-thumb-cell comparison-thumb-empty"></div>`).join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="icon-grid-view comparison-icon-view">
        <div class="comparison-thumb-table cols-${n}">
          <div class="comparison-thumb-row comparison-thumb-header">
            <div class="comparison-thumb-index">#</div>
            ${this.comparisonFiles.map(f =>
              `<div class="comparison-thumb-cell comparison-thumb-title" title="${f.name}">${f.name}</div>`).join('')}
          </div>
          ${rows}
        </div>
      </div>
    `;

    this.setupComparisonLazyLoading();
  }

  /**
   * Lazy loading for the comparison thumbnail table
   */
  setupComparisonLazyLoading() {
    const cells = document.querySelectorAll('.comparison-thumb-cell[data-slice]');

    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }
    this.imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sliceIndex = parseInt(entry.target.dataset.slice);
          const col = parseInt(entry.target.dataset.col);
          const file = this.comparisonFiles[col];
          const placeholder = entry.target.querySelector('.thumbnail-placeholder');
          if (file && placeholder) {
            const img = new Image();
            img.onload = () => {
              placeholder.innerHTML = '';
              placeholder.appendChild(img);
              img.className = 'thumbnail-img';
            };
            img.src = this.comparisonSliceUrl(file, sliceIndex, 'icon');
          }
          this.imageObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '150px' });

    cells.forEach(cell => {
      this.imageObserver.observe(cell);
      cell.addEventListener('click', () => {
        this.switchToGalleryMode(parseInt(cell.dataset.slice));
      });
    });
  }

  /**
   * Render thumbnail cards
   */
  renderThumbnailCards(count) {
    let cards = '';
    for (let i = 0; i < count; i++) {
      cards += `
        <div class="thumbnail-card" data-slice="${i}">
          <div class="thumbnail-placeholder" id="thumb-${i}">
            <span class="slice-num">${i + 1}</span>
          </div>
        </div>
      `;
    }
    return cards;
  }

  /**
   * Setup lazy loading for thumbnails
   */
  setupLazyLoading() {
    const cards = document.querySelectorAll('.thumbnail-card');

    // Disconnect any previous observer
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }

    this.imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sliceIndex = parseInt(entry.target.dataset.slice);
          this.loadThumbnail(sliceIndex, entry.target);
          this.imageObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '100px' });

    cards.forEach(card => {
      this.imageObserver.observe(card);
      card.addEventListener('click', () => {
        const sliceIndex = parseInt(card.dataset.slice);
        this.switchToGalleryMode(sliceIndex);
      });
    });
  }

  /**
   * Load a thumbnail
   */
  async loadThumbnail(sliceIndex, card) {
    if (!this.selectedFile) return;

    try {
      let url;
      if (this.selectedFile.source === 'segmentation') {
        url = `/results/${this.selectedFile.inferenceId}/slice/${sliceIndex}?size=icon`;
      } else if (this.selectedFile.source === 'denoising-dl') {
        // DL denoising results use path-based endpoint
        url = `/api/denoising/dl/slice/${sliceIndex}?path=${encodeURIComponent(this.selectedFile.path)}&size=thumbnail`;
      } else {
        url = `/api/workspace/slice/${this.selectedFile.id}/${sliceIndex}?size=icon`;
      }

      const img = new Image();
      img.onload = () => {
        const placeholder = card.querySelector('.thumbnail-placeholder');
        if (placeholder) {
          placeholder.innerHTML = '';
          placeholder.appendChild(img);
          img.className = 'thumbnail-img';
        }
      };
      img.src = url;
    } catch (error) {
      console.error('[ImageViewerModule] Error loading thumbnail:', error);
    }
  }

  /**
   * Override deactivate for cleanup
   */
  async deactivate() {
    console.log('[ImageViewerModule] Deactivating...');

    // Disconnect IntersectionObserver to prevent memory leaks
    if (this.imageObserver) {
      this.imageObserver.disconnect();
      this.imageObserver = null;
    }

    // Clear global reference
    window.imageViewerModule = null;

    // Reset module state to defaults
    this.selectedFile = null;
    this.tiffInfo = null;
    this.currentSlice = 0;
    this.viewMode = 'gallery';
    this.comparisonFiles = [];
    this._prefetched.clear();
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    // Reset component references
    this.stepNavigator = null;
    this.navigationButtons = null;
    this.validationDisplay = null;
    this.imageSelector = null;

    // Call parent deactivate
    await super.deactivate();

    console.log('[ImageViewerModule] Deactivation complete');
  }
}

// Export as default
export default ImageViewerModule;
