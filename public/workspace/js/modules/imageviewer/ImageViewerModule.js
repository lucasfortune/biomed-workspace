/**
 * ImageViewerModule - TIFF Stack Viewer with Gallery and Icon Modes
 *
 * A 2-step module for viewing TIFF image stacks:
 * - Step 1: File Selection (workspace files or segmentation results)
 * - Step 2: Image Viewing (Gallery mode or Icon grid mode)
 */

class ImageViewerModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;

    // Module state
    this.currentStep = 1;
    this.selectedFile = null;
    this.tiffInfo = null;
    this.currentSlice = 0;
    this.viewMode = 'gallery';  // 'gallery' or 'icon'

    // Zoom/pan state for gallery view
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    // View components
    this.galleryView = null;
    this.iconGridView = null;

    // FileSelector component
    this.imageSelector = null;

    // Cache for loaded slices
    this.sliceCache = new Map();

    // Dependencies loaded flag
    this.dependenciesLoaded = false;

    // Bind methods
    this.activate = this.activate.bind(this);
    this.deactivate = this.deactivate.bind(this);
  }

  /**
   * Activate the module
   */
  async activate() {
    console.log('[ImageViewerModule] Activating...');

    // Make module instance globally accessible
    window.imageViewerModule = this;

    try {
      // Get container
      this.container = document.getElementById('module-view');

      if (!this.container) {
        throw new Error('Module container not found');
      }

      // Show loading
      this.state.update('ui.loading', true);

      // Load CSS
      await this.loadCSS();

      // Load required scripts (FileSelector component)
      await this.loadDependencies();

      // Check for incoming data from segmentation module
      const hasIncoming = this.checkForIncomingData();

      // Render UI
      this.render();

      // Initialize FileSelector
      await this.initializeFileSelector();

      // Setup event listeners
      this.setupEventListeners();

      // Hide loading
      this.state.update('ui.loading', false);

      // If we have incoming data, automatically proceed to step 2
      if (hasIncoming) {
        await this.handleIncomingData();
      }

      console.log('[ImageViewerModule] Activation complete');

    } catch (error) {
      console.error('[ImageViewerModule] Activation error:', error);
      this.state.notify('error', `Failed to activate image viewer: ${error.message}`);
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Load required script dependencies
   */
  async loadDependencies() {
    // Load FileSelector component if not already loaded
    const fileSelectorPath = '/workspace/js/modules/segmentation/components/FileSelector.js';
    if (!document.querySelector(`script[src="${fileSelectorPath}"]`) && typeof FileSelector === 'undefined') {
      await this.loadScript(fileSelectorPath);
    }
  }

  /**
   * Load a script dynamically
   */
  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Load module CSS
   */
  async loadCSS() {
    const cssPath = '/workspace/js/modules/imageviewer/css/imageviewer.css';

    // Check if already loaded
    if (document.querySelector(`link[href="${cssPath}"]`)) {
      return;
    }

    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssPath;
      link.onload = resolve;
      link.onerror = () => reject(new Error('Failed to load CSS'));
      document.head.appendChild(link);
    });
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
        <!-- Header -->
        <div class="module-header">
          <button class="btn-back" id="backToHub">
            <span class="back-arrow">←</span> Back to Hub
          </button>
          <h2>Image Viewer</h2>
          <div class="header-spacer"></div>
        </div>

        <!-- Step Navigation -->
        <div class="step-nav">
          <div class="step active" data-step="1">
            <div class="step-number">1</div>
            <span>Image Selection</span>
          </div>
          <div class="step" data-step="2">
            <div class="step-number">2</div>
            <span>View Image</span>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="progress-container">
          <div class="progress-bar" id="overallProgress" style="width: 50%"></div>
        </div>

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

      <div id="validationResult"></div>

      <div class="navigation-buttons">
        <div></div>
        <button class="btn" id="step1Next" disabled>Next: View Image</button>
      </div>
    `;
  }

  /**
   * Initialize FileSelector component
   */
  async initializeFileSelector() {
    console.log('[ImageViewerModule] Initializing FileSelector...');

    // Create FileSelector instance with configuration:
    // - No test data options
    // - Show recent results optgroup (from segmentation, denoising, etc.)
    // - Accept any TIFF file regardless of category
    this.imageSelector = new FileSelector('image_stack', 'Image Stack', '🖼️', this, {
      showTestData: false,
      showRecentResults: true,
      acceptAllTiff: true
    });

    // Render into container
    const container = document.getElementById('imageSelectorContainer');
    if (container) {
      container.innerHTML = this.imageSelector.render();
      await this.imageSelector.init();
    }

    console.log('[ImageViewerModule] FileSelector initialized');
  }

  /**
   * FileSelector callback: called when user selects a file from dropdown
   */
  async onFileSelected(type, fileInfo) {
    console.log(`[ImageViewerModule] File selected:`, fileInfo);
    this.selectedFile = fileInfo;

    // Validate the file
    await this.validateTiffFile(fileInfo.id);
  }

  /**
   * FileSelector callback: called when user uploads a new file
   */
  async onFileUploaded(type, file, uploadedFileInfo) {
    console.log(`[ImageViewerModule] File uploaded:`, uploadedFileInfo);
    this.selectedFile = uploadedFileInfo;

    // Validate the file
    await this.validateTiffFile(uploadedFileInfo.id);

    return true; // Indicates validation was triggered
  }

  /**
   * Validate TIFF file and display results
   */
  async validateTiffFile(fileId) {
    const validationResult = document.getElementById('validationResult');
    if (!validationResult) return;

    validationResult.innerHTML = '<div class="validation-loading">Validating file...</div>';

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

        this.displayValidationResults({
          success: true,
          sliceCount: data.sliceCount,
          width: data.width,
          height: data.height,
          dtype: data.dtype
        });

        // Enable next button
        const nextBtn = document.getElementById('step1Next');
        if (nextBtn) nextBtn.disabled = false;
      } else {
        this.displayValidationResults({ success: false, error: data.error || 'Unknown error' });
      }
    } catch (error) {
      console.error('[ImageViewerModule] Validation error:', error);
      this.displayValidationResults({ success: false, error: error.message });
    }
  }

  /**
   * Display validation results
   */
  displayValidationResults(results) {
    const container = document.getElementById('validationResult');
    if (!container) return;

    if (results.success) {
      container.innerHTML = `
        <div class="validation-success">
          <div class="validation-header">✓ Valid TIFF File</div>
          <div class="validation-details">
            <div class="detail-row"><span>Dimensions:</span> ${results.width} × ${results.height}</div>
            <div class="detail-row"><span>Slices:</span> ${results.sliceCount}</div>
            <div class="detail-row"><span>Data Type:</span> ${results.dtype}</div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="validation-error">
          <div class="validation-header">✗ Validation Failed</div>
          <div class="validation-message">${results.error}</div>
        </div>
      `;
    }
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

    // Step navigation
    document.querySelectorAll('.step[data-step]').forEach(step => {
      step.addEventListener('click', () => {
        const stepNum = parseInt(step.dataset.step);
        if (this.canNavigateToStep(stepNum)) {
          this.goToStep(stepNum);
        }
      });
    });

    // Next button (Step 1 -> Step 2)
    const nextBtn = document.getElementById('step1Next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.proceedToViewer());
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
   * Check if navigation to step is allowed
   */
  canNavigateToStep(stepNum) {
    if (stepNum === 1) return true;
    if (stepNum === 2) return this.selectedFile !== null;
    return false;
  }

  /**
   * Navigate to step
   */
  goToStep(stepNum) {
    if (stepNum < 1 || stepNum > 2) return;

    this.currentStep = stepNum;

    // Update step indicators
    document.querySelectorAll('.step[data-step]').forEach(step => {
      const num = parseInt(step.dataset.step);
      step.classList.toggle('active', num === stepNum);
      step.classList.toggle('completed', num < stepNum);
    });

    // Update step content
    document.querySelectorAll('.step-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`step${stepNum}`)?.classList.add('active');

    // Update progress bar
    const progress = (stepNum / 2) * 100;
    const progressBar = document.getElementById('overallProgress');
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
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
      this.state.update('ui.loading', true);

      // Load TIFF info if not already loaded by validation
      if (!this.tiffInfo) {
        await this.loadTiffInfo();
      }

      this.goToStep(2);
      this.state.update('ui.loading', false);
    } catch (error) {
      console.error('[ImageViewerModule] Error loading file:', error);
      this.state.notify('error', 'Failed to load file information');
      this.state.update('ui.loading', false);
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
        // Use results endpoint for segmentation outputs
        url = `/results/${this.selectedFile.inferenceId}/tiff-info`;
      } else {
        // Use workspace endpoint for regular files
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
      // Build URL based on file source
      let url;
      if (this.selectedFile.source === 'segmentation') {
        // Use results endpoint for segmentation outputs
        url = `/results/${this.selectedFile.inferenceId}/slice/${sliceIndex}?size=gallery`;
      } else {
        // Use workspace endpoint for regular files
        url = `/api/workspace/slice/${this.selectedFile.id}/${sliceIndex}?size=gallery`;
      }

      // Create new image to preload
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
      // Build URL based on file source
      let url;
      if (this.selectedFile.source === 'segmentation') {
        // Use results endpoint for segmentation outputs
        url = `/results/${this.selectedFile.inferenceId}/slice/${sliceIndex}?size=icon`;
      } else {
        // Use workspace endpoint for regular files
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
   * Format file size
   */
  formatFileSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Deactivate the module
   */
  async deactivate() {
    console.log('[ImageViewerModule] Deactivating...');

    // Clear cache
    this.sliceCache.clear();

    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }

    // Clear global reference
    window.imageViewerModule = null;

    console.log('[ImageViewerModule] Deactivation complete');
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('[ImageViewerModule] Cleaning up...');
    this.deactivate();
  }
}

// Export as default
export default ImageViewerModule;
