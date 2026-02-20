/**
 * AnnotationCanvas - Canvas management for annotation module
 *
 * Handles:
 * - Layered canvas structure (source image + annotation overlay + preview)
 * - Full-resolution image loading
 * - Zoom and pan with CSS transforms
 * - Coordinate transformation between screen and source pixels
 *
 * DOM Structure:
 * ```
 * container
 * └── viewport (overflow: hidden)
 *     └── transformContainer (scaled/translated)
 *         ├── sourceImage (<img>)
 *         ├── annotationCanvas (<canvas>)
 *         └── previewCanvas (<canvas>)
 * ```
 */

class AnnotationCanvas {
  /**
   * Create an AnnotationCanvas
   * @param {HTMLElement} container - Container element
   * @param {object} options - Configuration options
   * @param {number} [options.minZoom=0.1] - Minimum zoom level
   * @param {number} [options.maxZoom=10] - Maximum zoom level
   * @param {number} [options.zoomStep=1.25] - Zoom increment multiplier
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      minZoom: options.minZoom || 0.1,
      maxZoom: options.maxZoom || 10,
      zoomStep: options.zoomStep || 1.25
    };

    // State
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.imageSize = { width: 0, height: 0 };
    this.isLoaded = false;
    this.currentFileId = null;
    this.currentSliceIndex = 0;

    // Pan state
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.spacePressed = false;

    // Touch/pointer tracking for multi-finger gestures
    this.activePointers = new Map();  // pointerId -> {x, y, type}
    this.lastPinchDistance = 0;
    this.lastPinchCenter = null;
    this.isTwoFingerGesture = false;

    // Callback for notifying BrushEngine when two-finger gesture starts
    this.onTwoFingerStart = null;

    // DOM elements (created in init)
    this.viewport = null;
    this.transformContainer = null;
    this.sourceImage = null;
    this.annotationCanvas = null;
    this.previewCanvas = null;

    // Contexts
    this.annotationCtx = null;
    this.previewCtx = null;

    // Event callbacks
    this.onSliceLoaded = null;
    this.onZoomChange = null;
    this.onPanChange = null;
    this.onMouseMove = null;

    // Bind methods
    this.handleWheel = this.handleWheel.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);

    // Initialize
    this.init();
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize DOM structure and event listeners
   */
  init() {
    // Create DOM structure
    this.createDOM();

    // Attach event listeners
    this.attachEventListeners();

    console.log('[AnnotationCanvas] Initialized');
  }

  /**
   * Create the layered DOM structure
   */
  createDOM() {
    // Clear container
    this.container.innerHTML = '';

    // Create viewport (clips content)
    this.viewport = document.createElement('div');
    this.viewport.className = 'annotation-viewport';
    this.viewport.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: hidden;
      position: relative;
      background: #1a1a2e;
      touch-action: none;
    `;

    // Create transform container (handles zoom/pan)
    this.transformContainer = document.createElement('div');
    this.transformContainer.className = 'annotation-transform';
    this.transformContainer.style.cssText = `
      position: absolute;
      transform-origin: 0 0;
      will-change: transform;
    `;

    // Create source image
    this.sourceImage = document.createElement('img');
    this.sourceImage.className = 'annotation-source-image';
    this.sourceImage.style.cssText = `
      display: block;
      image-rendering: pixelated;
      user-select: none;
      -webkit-user-drag: none;
      pointer-events: none;
    `;
    this.sourceImage.draggable = false;

    // Create annotation canvas (for painted annotations)
    this.annotationCanvas = document.createElement('canvas');
    this.annotationCanvas.className = 'annotation-layer';
    this.annotationCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      image-rendering: pixelated;
      pointer-events: none;
    `;

    // Create preview canvas (for brush cursor, guides)
    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.className = 'annotation-preview';
    this.previewCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      image-rendering: pixelated;
      pointer-events: none;
    `;

    // Create interaction layer (transparent layer for mouse events)
    this.interactionLayer = document.createElement('div');
    this.interactionLayer.className = 'annotation-interaction';
    this.interactionLayer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      cursor: crosshair;
      touch-action: none;
    `;

    // Get contexts
    this.annotationCtx = this.annotationCanvas.getContext('2d');
    this.previewCtx = this.previewCanvas.getContext('2d');

    // Assemble DOM
    this.transformContainer.appendChild(this.sourceImage);
    this.transformContainer.appendChild(this.annotationCanvas);
    this.transformContainer.appendChild(this.previewCanvas);
    this.transformContainer.appendChild(this.interactionLayer);
    this.viewport.appendChild(this.transformContainer);
    this.container.appendChild(this.viewport);
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Wheel zoom
    this.viewport.addEventListener('wheel', this.handleWheel, { passive: false });

    // Pointer events (unified mouse/touch/pen)
    this.viewport.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerCancel);

    // Keyboard (space for pan)
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Prevent context menu on right-click (used for pan)
    this.viewport.addEventListener('contextmenu', this.handleContextMenu);
  }

  /**
   * Remove event listeners
   */
  detachEventListeners() {
    this.viewport.removeEventListener('wheel', this.handleWheel);
    this.viewport.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerCancel);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.viewport.removeEventListener('contextmenu', this.handleContextMenu);
  }

  // ===========================================================================
  // IMAGE LOADING
  // ===========================================================================

  /**
   * Load a slice from the server
   * @param {string} fileId - File ID
   * @param {number} sliceIndex - Slice index (0-based)
   * @returns {Promise<void>}
   */
  async loadSlice(fileId, sliceIndex) {
    return new Promise((resolve, reject) => {
      const url = `/api/annotation/raw-slice/${encodeURIComponent(fileId)}/${sliceIndex}`;

      this.sourceImage.onload = () => {
        // Update state
        this.imageSize.width = this.sourceImage.naturalWidth;
        this.imageSize.height = this.sourceImage.naturalHeight;
        this.currentFileId = fileId;
        this.currentSliceIndex = sliceIndex;
        this.isLoaded = true;

        // Resize canvases to match image
        this.resizeCanvases();

        // Fit to container on first load
        this.zoomToFit();

        // Notify
        if (this.onSliceLoaded) {
          this.onSliceLoaded({
            fileId,
            sliceIndex,
            width: this.imageSize.width,
            height: this.imageSize.height
          });
        }

        console.log(`[AnnotationCanvas] Loaded slice ${sliceIndex}: ${this.imageSize.width}x${this.imageSize.height}`);
        resolve();
      };

      this.sourceImage.onerror = () => {
        console.error(`[AnnotationCanvas] Failed to load slice ${sliceIndex}`);
        reject(new Error(`Failed to load slice ${sliceIndex}`));
      };

      this.sourceImage.src = url;
    });
  }

  /**
   * Resize canvases to match image dimensions
   */
  resizeCanvases() {
    const { width, height } = this.imageSize;

    this.annotationCanvas.width = width;
    this.annotationCanvas.height = height;
    this.previewCanvas.width = width;
    this.previewCanvas.height = height;

    // Resize interaction layer to match image
    this.interactionLayer.style.width = `${width}px`;
    this.interactionLayer.style.height = `${height}px`;

    // Reset transform for crisp rendering
    this.annotationCtx.imageSmoothingEnabled = false;
    this.previewCtx.imageSmoothingEnabled = false;
  }

  // ===========================================================================
  // ZOOM
  // ===========================================================================

  /**
   * Set zoom level
   * @param {number} level - Zoom level (1 = 100%)
   * @param {object} [center] - Zoom center point in viewport coords
   */
  setZoom(level, center = null) {
    // Clamp to limits
    const newZoom = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, level));

    if (newZoom === this.zoom) return;

    // If center provided, adjust pan to zoom toward that point
    if (center) {
      const viewportRect = this.viewport.getBoundingClientRect();
      const centerX = center.x - viewportRect.left;
      const centerY = center.y - viewportRect.top;

      // Calculate the point in image space before zoom
      const imageX = (centerX - this.pan.x) / this.zoom;
      const imageY = (centerY - this.pan.y) / this.zoom;

      // Update zoom
      this.zoom = newZoom;

      // Adjust pan so the same image point stays under the cursor
      this.pan.x = centerX - imageX * this.zoom;
      this.pan.y = centerY - imageY * this.zoom;
    } else {
      this.zoom = newZoom;
    }

    this.applyTransform();

    if (this.onZoomChange) {
      this.onZoomChange(this.zoom);
    }
  }

  /**
   * Zoom in by step
   * @param {object} [center] - Zoom center point
   */
  zoomIn(center = null) {
    this.setZoom(this.zoom * this.options.zoomStep, center);
  }

  /**
   * Zoom out by step
   * @param {object} [center] - Zoom center point
   */
  zoomOut(center = null) {
    this.setZoom(this.zoom / this.options.zoomStep, center);
  }

  /**
   * Reset zoom to 100%
   */
  resetZoom() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.centerImage();
    this.applyTransform();

    if (this.onZoomChange) {
      this.onZoomChange(this.zoom);
    }
  }

  /**
   * Zoom to fit image in container
   */
  zoomToFit() {
    if (!this.isLoaded) return;

    const viewportRect = this.viewport.getBoundingClientRect();
    const scaleX = viewportRect.width / this.imageSize.width;
    const scaleY = viewportRect.height / this.imageSize.height;

    // Use smaller scale to fit entirely
    this.zoom = Math.min(scaleX, scaleY) * 0.95; // 95% to add some padding
    this.zoom = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, this.zoom));

    // Center the image
    this.centerImage();
    this.applyTransform();

    if (this.onZoomChange) {
      this.onZoomChange(this.zoom);
    }
  }

  /**
   * Center the image in the viewport
   */
  centerImage() {
    const viewportRect = this.viewport.getBoundingClientRect();
    const scaledWidth = this.imageSize.width * this.zoom;
    const scaledHeight = this.imageSize.height * this.zoom;

    this.pan.x = (viewportRect.width - scaledWidth) / 2;
    this.pan.y = (viewportRect.height - scaledHeight) / 2;
  }

  // ===========================================================================
  // PAN
  // ===========================================================================

  /**
   * Set pan position
   * @param {number} x - X offset
   * @param {number} y - Y offset
   */
  setPan(x, y) {
    this.pan.x = x;
    this.pan.y = y;
    this.applyTransform();

    if (this.onPanChange) {
      this.onPanChange(this.pan);
    }
  }

  /**
   * Apply CSS transform for zoom and pan
   */
  applyTransform() {
    this.transformContainer.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
  }

  // ===========================================================================
  // COORDINATE TRANSFORMATION
  // ===========================================================================

  /**
   * Convert screen coordinates to source image coordinates
   * @param {number} screenX - Screen X (client coordinates)
   * @param {number} screenY - Screen Y (client coordinates)
   * @returns {{x: number, y: number}} Source coordinates
   */
  screenToSource(screenX, screenY) {
    const viewportRect = this.viewport.getBoundingClientRect();

    // Convert to viewport-relative coordinates
    const viewportX = screenX - viewportRect.left;
    const viewportY = screenY - viewportRect.top;

    // Remove pan offset and divide by zoom
    const sourceX = (viewportX - this.pan.x) / this.zoom;
    const sourceY = (viewportY - this.pan.y) / this.zoom;

    return { x: sourceX, y: sourceY };
  }

  /**
   * Convert source image coordinates to screen coordinates
   * @param {number} sourceX - Source X
   * @param {number} sourceY - Source Y
   * @returns {{x: number, y: number}} Screen coordinates
   */
  sourceToScreen(sourceX, sourceY) {
    const viewportRect = this.viewport.getBoundingClientRect();

    // Apply zoom and add pan offset
    const viewportX = sourceX * this.zoom + this.pan.x;
    const viewportY = sourceY * this.zoom + this.pan.y;

    // Convert to screen coordinates
    const screenX = viewportX + viewportRect.left;
    const screenY = viewportY + viewportRect.top;

    return { x: screenX, y: screenY };
  }

  /**
   * Check if source coordinates are within image bounds
   * @param {number} x - Source X
   * @param {number} y - Source Y
   * @returns {boolean}
   */
  isInBounds(x, y) {
    return x >= 0 && x < this.imageSize.width && y >= 0 && y < this.imageSize.height;
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  /**
   * Handle mouse wheel for zoom
   */
  handleWheel(e) {
    e.preventDefault();

    const center = { x: e.clientX, y: e.clientY };

    if (e.deltaY < 0) {
      this.zoomIn(center);
    } else {
      this.zoomOut(center);
    }
  }

  /**
   * Handle pointer down for pan (unified mouse/touch/pen)
   * @param {PointerEvent} e
   */
  handlePointerDown(e) {
    // Track all active pointers
    this.activePointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType
    });

    // Check for two-finger gesture (touch only)
    const touchPointers = this._getTouchPointers();
    if (touchPointers.length >= 2 && !this.isTwoFingerGesture) {
      // Transition to two-finger gesture mode
      this.isTwoFingerGesture = true;

      // Notify BrushEngine to cancel any in-progress stroke
      if (this.onTwoFingerStart) {
        this.onTwoFingerStart();
      }

      // Initialize pinch state from the two touch pointers
      const [p1, p2] = touchPointers;
      this.lastPinchDistance = this._getDistance(p1, p2);
      this.lastPinchCenter = this._getCenter(p1, p2);

      // Start panning from pinch center
      this.isPanning = true;
      this.panStart = {
        x: this.lastPinchCenter.x - this.pan.x,
        y: this.lastPinchCenter.y - this.pan.y
      };
      this.viewport.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Mouse: right-click, middle-click, or space for pan
    if (e.pointerType === 'mouse') {
      if (e.button === 2 || e.button === 1 || this.spacePressed) {
        e.preventDefault();
        this.isPanning = true;
        this.panStart = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
        this.viewport.style.cursor = 'grabbing';
      }
    }

    // Pen and single touch: don't pan here (BrushEngine handles drawing)
    // Space + pen/touch: pan mode
    if (e.pointerType !== 'mouse' && this.spacePressed) {
      e.preventDefault();
      this.isPanning = true;
      this.panStart = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
      this.viewport.style.cursor = 'grabbing';
    }
  }

  /**
   * Handle pointer move for pan, pinch-to-zoom, and coordinate tracking
   * @param {PointerEvent} e
   */
  handlePointerMove(e) {
    // Update tracked pointer position
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        type: e.pointerType
      });
    }

    // Two-finger gesture: pinch-to-zoom + pan
    if (this.isTwoFingerGesture) {
      const touchPointers = this._getTouchPointers();
      if (touchPointers.length >= 2) {
        const [p1, p2] = touchPointers;
        const currentDistance = this._getDistance(p1, p2);
        const currentCenter = this._getCenter(p1, p2);

        // Pinch-to-zoom
        if (this.lastPinchDistance > 0) {
          const scale = currentDistance / this.lastPinchDistance;
          if (Math.abs(scale - 1) > 0.01) {
            const newZoom = this.zoom * scale;
            this.setZoom(newZoom, currentCenter);
          }
        }

        // Pan with two fingers
        if (this.lastPinchCenter) {
          const dx = currentCenter.x - this.lastPinchCenter.x;
          const dy = currentCenter.y - this.lastPinchCenter.y;
          this.pan.x += dx;
          this.pan.y += dy;
          this.applyTransform();

          if (this.onPanChange) {
            this.onPanChange(this.pan);
          }
        }

        this.lastPinchDistance = currentDistance;
        this.lastPinchCenter = currentCenter;
      }
      return;
    }

    // Single-pointer panning (mouse right-click/middle or space+drag)
    if (this.isPanning) {
      this.pan.x = e.clientX - this.panStart.x;
      this.pan.y = e.clientY - this.panStart.y;
      this.applyTransform();

      if (this.onPanChange) {
        this.onPanChange(this.pan);
      }
    }

    // Track pointer position for coordinate display
    if (this.onMouseMove && this.isLoaded) {
      const source = this.screenToSource(e.clientX, e.clientY);
      this.onMouseMove({
        screen: { x: e.clientX, y: e.clientY },
        source: source,
        inBounds: this.isInBounds(source.x, source.y)
      });
    }
  }

  /**
   * Handle pointer up
   * @param {PointerEvent} e
   */
  handlePointerUp(e) {
    this.activePointers.delete(e.pointerId);

    // End two-finger gesture when fewer than 2 touch pointers remain
    if (this.isTwoFingerGesture) {
      const touchPointers = this._getTouchPointers();
      if (touchPointers.length < 2) {
        this.isTwoFingerGesture = false;
        this.isPanning = false;
        this.lastPinchDistance = 0;
        this.lastPinchCenter = null;
        this.viewport.style.cursor = this.spacePressed ? 'grab' : 'crosshair';
      }
      return;
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.viewport.style.cursor = this.spacePressed ? 'grab' : 'crosshair';
    }
  }

  /**
   * Handle pointer cancel (interrupted gesture)
   * @param {PointerEvent} e
   */
  handlePointerCancel(e) {
    this.handlePointerUp(e);
  }

  /**
   * Handle keydown (space for pan mode)
   */
  handleKeyDown(e) {
    if (e.code === 'Space' && !this.spacePressed) {
      this.spacePressed = true;
      this.viewport.style.cursor = 'grab';
      e.preventDefault();
    }
  }

  /**
   * Handle keyup
   */
  handleKeyUp(e) {
    if (e.code === 'Space') {
      this.spacePressed = false;
      if (!this.isPanning) {
        this.viewport.style.cursor = 'crosshair';
      }
    }
  }

  /**
   * Prevent context menu on right-click
   */
  handleContextMenu(e) {
    e.preventDefault();
  }

  // ===========================================================================
  // TOUCH HELPERS
  // ===========================================================================

  /**
   * Get all active touch pointers (excludes mouse and pen)
   * @returns {Array<{x: number, y: number}>}
   */
  _getTouchPointers() {
    const pointers = [];
    for (const [id, pointer] of this.activePointers) {
      if (pointer.type === 'touch') {
        pointers.push(pointer);
      }
    }
    return pointers;
  }

  /**
   * Get distance between two pointer positions
   * @param {{x: number, y: number}} p1
   * @param {{x: number, y: number}} p2
   * @returns {number}
   */
  _getDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get center point between two pointer positions
   * @param {{x: number, y: number}} p1
   * @param {{x: number, y: number}} p2
   * @returns {{x: number, y: number}}
   */
  _getCenter(p1, p2) {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    };
  }

  // ===========================================================================
  // CANVAS ACCESS
  // ===========================================================================

  /**
   * Get the annotation canvas context
   * @returns {CanvasRenderingContext2D}
   */
  getAnnotationContext() {
    return this.annotationCtx;
  }

  /**
   * Get the preview canvas context
   * @returns {CanvasRenderingContext2D}
   */
  getPreviewContext() {
    return this.previewCtx;
  }

  /**
   * Clear the preview canvas
   */
  clearPreview() {
    this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
  }

  /**
   * Clear the annotation canvas
   */
  clearAnnotation() {
    this.annotationCtx.clearRect(0, 0, this.annotationCanvas.width, this.annotationCanvas.height);
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  /**
   * Get current zoom level
   * @returns {number}
   */
  getZoom() {
    return this.zoom;
  }

  /**
   * Get current pan offset
   * @returns {{x: number, y: number}}
   */
  getPan() {
    return { ...this.pan };
  }

  /**
   * Get image dimensions
   * @returns {{width: number, height: number}}
   */
  getImageSize() {
    return { ...this.imageSize };
  }

  /**
   * Get current slice index
   * @returns {number}
   */
  getCurrentSliceIndex() {
    return this.currentSliceIndex;
  }

  /**
   * Get current slice (alias for BrushEngine compatibility)
   * @returns {number}
   */
  get currentSlice() {
    return this.currentSliceIndex;
  }

  /**
   * Get the canvas area element (for event listeners)
   * @returns {HTMLElement}
   */
  get canvasArea() {
    return this.interactionLayer;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Destroy the canvas and clean up
   */
  destroy() {
    this.detachEventListeners();
    this.container.innerHTML = '';
    this.isLoaded = false;
    console.log('[AnnotationCanvas] Destroyed');
  }
}

// Export
export default AnnotationCanvas;
