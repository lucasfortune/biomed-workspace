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

    // Cache for loaded slices
    this.sliceCache = new Map();

    // Bind methods
    this.onFileSelect = this.onFileSelect.bind(this);
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
      fileType: 'image_stack',
      showTestData: false,
      showRecentResults: true,
      acceptAllTiff: true,
      onSelect: this.onFileSelect,
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
   * Check for incoming data from segmentation module
   */
  checkForIncomingData() {
    const results = this.state.get('modules.segmentation.inferenceResults');
    if (results?.outputPath) {
      console.log('[ImageViewerModule] Found incoming segmentation result:', results);
      this.selectedFile = {
        id: results.inferenceId || 'segmentation_result',
        path: results.outputPath,
        name: 'Segmentation Result',
        source: 'segmentation',
        inferenceId: results.inferenceId,
        metadataPath: results.metadataPath
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
      // Clear the incoming data
      this.state.update('modules.segmentation.inferenceResults', null);
    } catch (error) {
      console.error('[ImageViewerModule] Error handling incoming data:', error);
      this.state.notify('error', 'Failed to load segmentation result');
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

        // Enable next button
        this.navigationButtons.setNextEnabled(true);
      } else {
        this.validationDisplay.showError('Validation Failed', data.error || 'Unknown error');
        this.navigationButtons.setNextEnabled(false);
      }
    } catch (error) {
      console.error('[ImageViewerModule] Validation error:', error);
      this.validationDisplay.showError('Validation Error', error.message);
      this.navigationButtons.setNextEnabled(false);
    }
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
  }

  /**
   * Override goToStep to add step-specific logic
   */
  goToStep(stepNum) {
    // Call parent implementation
    super.goToStep(stepNum);

    // Update StepNavigator
    if (this.stepNavigator) {
      this.stepNavigator.update(stepNum);
    }

    // Step-specific initialization
    if (stepNum === 2 && this.selectedFile) {
      this.initializeViewer();
    }
  }

  /**
   * Proceed to viewer (Step 1 -> Step 2)
   */
  async proceedToViewer() {
    if (!this.selectedFile) return;

    try {
      this.showLoading('Loading image information...');

      // Load TIFF info if not already loaded by validation
      if (!this.tiffInfo) {
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
   * Initialize the viewer for Step 2
   */
  async initializeViewer() {
    // Update file info display
    const fileInfoDisplay = document.getElementById('fileInfoDisplay');
    if (fileInfoDisplay && this.tiffInfo) {
      fileInfoDisplay.innerHTML = `
        <span class="filename">${this.selectedFile.name}</span>
        <span class="slice-count">${this.tiffInfo.sliceCount} slices</span>
      `;
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
   * Render gallery view
   */
  renderGalleryView() {
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
                 class="slice-slider" />
        </div>
      </div>
    `;

    // Setup gallery event listeners
    this.setupGalleryEventListeners();

    // Load current slice
    this.loadSlice(this.currentSlice);
  }

  /**
   * Setup gallery view event listeners
   */
  setupGalleryEventListeners() {
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
    const imageWrapper = document.getElementById('imageWrapper');
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
    const maxSlice = (this.tiffInfo?.sliceCount || 1) - 1;
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

    // Load the slice
    this.loadSlice(this.currentSlice);
  }

  /**
   * Go to next slice
   */
  nextSlice() {
    const maxSlice = (this.tiffInfo?.sliceCount || 1) - 1;
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
   * Apply zoom and pan to image
   */
  applyZoomPan() {
    const img = document.getElementById('galleryImage');
    if (img) {
      img.style.transform = `scale(${this.zoomLevel}) translate(${this.panOffset.x}px, ${this.panOffset.y}px)`;
    }
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

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sliceIndex = parseInt(entry.target.dataset.slice);
          this.loadThumbnail(sliceIndex, entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '100px' });

    cards.forEach(card => {
      observer.observe(card);
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

    // Clear cache
    this.sliceCache.clear();

    // Clear global reference
    window.imageViewerModule = null;

    // Call parent deactivate
    await super.deactivate();

    console.log('[ImageViewerModule] Deactivation complete');
  }
}

// Export as default
export default ImageViewerModule;
