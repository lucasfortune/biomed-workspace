/**
 * BrushEngine - Painting engine for annotation canvas
 *
 * Handles brush and eraser tools for painting annotations on the canvas.
 * Works with AnnotationCanvas for coordinate transformation and rendering.
 *
 * Features:
 * - Brush and eraser tools
 * - Configurable brush size
 * - Smooth stroke interpolation
 * - Multi-class painting support
 * - Preview cursor display
 *
 * @module BrushEngine
 */

// =============================================================================
// CLASS DEFINITION
// =============================================================================

class BrushEngine {

  // ===========================================================================
  // CONSTRUCTOR
  // ===========================================================================

  /**
   * Create a BrushEngine instance
   * @param {AnnotationCanvas} annotationCanvas - The annotation canvas instance
   * @param {object} options - Configuration options
   */
  constructor(annotationCanvas, options = {}) {
    this.canvas = annotationCanvas;
    this.options = {
      minBrushSize: 1,
      maxBrushSize: 100,
      defaultBrushSize: 10,
      ...options
    };

    // =========================================================================
    // STATE
    // =========================================================================

    this.tool = 'brush';           // 'brush' | 'eraser'
    this.brushSize = this.options.defaultBrushSize;
    this.activeClassId = 1;        // Current class ID for painting
    this.isDrawing = false;        // Whether currently in a stroke
    this.lastPoint = null;         // Last point for line interpolation
    this.enabled = true;           // Can be disabled when centerpoint tool is active

    // =========================================================================
    // ANNOTATION DATA STORAGE
    // Per-slice annotation data as Uint8Array (width * height)
    // Values: 0 = background, 1-N = class IDs
    // =========================================================================

    this.sliceAnnotations = new Map();  // Map<sliceIndex, Uint8Array>
    this.imageWidth = 0;
    this.imageHeight = 0;

    // =========================================================================
    // CLASS DEFINITIONS
    // =========================================================================

    this.classes = [
      { id: 1, name: 'Class 1', color: '#FF6B6B', visible: true }
    ];
    this.nextClassId = 2;

    // Color generation settings for maximum distinction
    this.colorSettings = {
      saturation: 70,  // Percentage (0-100)
      lightness: 55    // Percentage (0-100)
    };

    // =========================================================================
    // CALLBACKS
    // =========================================================================

    this.onStrokeStart = null;     // Called when stroke starts
    this.onStrokeEnd = null;       // Called when stroke ends
    this.onAnnotationChange = null; // Called when annotation data changes
    this.onStrokeCancel = null;    // Called when stroke is cancelled (e.g., two-finger gesture)

    // =========================================================================
    // POINTER TRACKING
    // =========================================================================

    this.drawingPointerId = null;  // Active pointer ID for drawing

    // =========================================================================
    // BIND METHODS
    // =========================================================================

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize the brush engine with image dimensions
   * @param {number} width - Image width in pixels
   * @param {number} height - Image height in pixels
   */
  initialize(width, height) {
    this.imageWidth = width;
    this.imageHeight = height;

    // Set up mouse event listeners on the canvas area
    this.attachEventListeners();

    console.log(`[BrushEngine] Initialized with dimensions ${width}x${height}`);
  }

  /**
   * Attach pointer event listeners to the canvas
   */
  attachEventListeners() {
    const canvasArea = this.canvas.canvasArea;
    if (!canvasArea) {
      console.warn('[BrushEngine] Canvas area not available for event listeners');
      return;
    }

    // Pointer down on canvas area starts stroke
    canvasArea.addEventListener('pointerdown', this.handlePointerDown);

    // Pointer move and up are global to handle dragging outside canvas
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerCancel);

    // Pointer leave clears preview
    canvasArea.addEventListener('pointerleave', this.handlePointerLeave);

    console.log('[BrushEngine] Event listeners attached');
  }

  /**
   * Detach pointer event listeners
   */
  detachEventListeners() {
    const canvasArea = this.canvas.canvasArea;

    if (canvasArea) {
      canvasArea.removeEventListener('pointerdown', this.handlePointerDown);
      canvasArea.removeEventListener('pointerleave', this.handlePointerLeave);
    }

    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerCancel);
  }

  // ===========================================================================
  // TOOL MANAGEMENT
  // ===========================================================================

  /**
   * Set the active tool
   * @param {'brush' | 'eraser' | 'fill'} tool - Tool to activate
   */
  setTool(tool) {
    if (tool === 'brush' || tool === 'eraser' || tool === 'fill') {
      this.tool = tool;
      this.updateCursor();
      console.log(`[BrushEngine] Tool set to: ${tool}`);
    }
  }

  /**
   * Set the brush size
   * @param {number} size - Brush size in pixels
   */
  setBrushSize(size) {
    this.brushSize = Math.max(
      this.options.minBrushSize,
      Math.min(this.options.maxBrushSize, size)
    );
    this.updatePreview();
    console.log(`[BrushEngine] Brush size set to: ${this.brushSize}`);
  }

  /**
   * Get current brush size
   * @returns {number} Current brush size
   */
  getBrushSize() {
    return this.brushSize;
  }

  /**
   * Set the active class for painting
   * @param {number} classId - Class ID to paint with
   */
  setActiveClass(classId) {
    const classExists = this.classes.some(c => c.id === classId);
    if (classExists) {
      this.activeClassId = classId;
      this.updatePreview();
      console.log(`[BrushEngine] Active class set to: ${classId}`);
    }
  }

  /**
   * Update cursor style based on current tool
   */
  updateCursor() {
    const canvasArea = this.canvas.canvasArea;
    if (!canvasArea) return;

    if (this.tool === 'eraser') {
      canvasArea.style.cursor = 'crosshair';
    } else {
      canvasArea.style.cursor = 'crosshair';
    }
  }

  /**
   * Enable the brush engine (brush/eraser tools active)
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable the brush engine (centerpoint tool active)
   */
  disable() {
    this.enabled = false;
    if (this.isDrawing) {
      this.endStroke();
    }
    this.clearPreview();
  }

  // ===========================================================================
  // POINTER EVENT HANDLERS
  // ===========================================================================

  /**
   * Handle pointer down - start stroke
   * Accepts mouse (left-click), pen, and single touch for drawing.
   * @param {PointerEvent} e
   */
  handlePointerDown(e) {
    if (!this.enabled) return;

    // For mouse: only handle left-click (right/middle are for pan)
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Don't paint if space is held (pan mode) or already panning
    if (this.canvas.isPanning || this.canvas.spacePressed) return;

    // Don't paint during two-finger gesture
    if (this.canvas.isTwoFingerGesture) return;

    // Only one pointer can draw at a time
    if (this.drawingPointerId !== null) return;

    const source = this.canvas.screenToSource(e.clientX, e.clientY);
    const inBounds = this.canvas.isInBounds(source.x, source.y);
    if (!inBounds) return;

    e.preventDefault();

    // Handle fill tool as a single-click action
    if (this.tool === 'fill') {
      if (this.onStrokeStart) this.onStrokeStart();
      this.floodFill(source.x, source.y);
      this.renderAnnotations();
      if (this.onStrokeEnd) this.onStrokeEnd();
      if (this.onAnnotationChange) this.onAnnotationChange();
      return;
    }

    // Track this pointer as the drawing pointer
    this.drawingPointerId = e.pointerId;

    // Capture pointer for reliable tracking even outside canvas bounds
    const canvasArea = this.canvas.canvasArea;
    if (canvasArea) {
      try {
        canvasArea.setPointerCapture(e.pointerId);
      } catch (err) {
        // Pointer capture may fail in some edge cases, non-fatal
      }
    }

    this.startStroke(source.x, source.y);
  }

  /**
   * Handle pointer move - continue stroke or update preview
   * @param {PointerEvent} e
   */
  handlePointerMove(e) {
    if (!this.enabled) return;

    // Skip if canvas not ready
    if (!this.canvas || !this.imageWidth) return;

    // Skip during two-finger gesture
    if (this.canvas.isTwoFingerGesture) {
      if (this.isDrawing) {
        this.clearPreview();
      }
      return;
    }

    // Only process the drawing pointer for stroke continuation
    if (this.isDrawing && e.pointerId !== this.drawingPointerId) return;

    // For preview: only show for mouse/pen or the single active touch
    if (!this.isDrawing && e.pointerType === 'touch') return;

    const source = this.canvas.screenToSource(e.clientX, e.clientY);
    const inBounds = this.canvas.isInBounds(source.x, source.y);

    // Continue stroke if drawing
    if (this.isDrawing) {
      if (inBounds) {
        this.continueStroke(source.x, source.y);
      }
    }

    // Update preview (mouse/pen only - touch has no hover state)
    if (e.pointerType !== 'touch') {
      if (inBounds) {
        const coords = { source, inBounds };
        this.updatePreview(coords);
      } else {
        this.clearPreview();
      }
    }
  }

  /**
   * Handle pointer up - end stroke
   * @param {PointerEvent} e
   */
  handlePointerUp(e) {
    if (!this.enabled) return;

    // Only process the drawing pointer
    if (e.pointerId !== this.drawingPointerId) return;

    // For mouse: only handle left-click release
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Release pointer capture
    const canvasArea = this.canvas.canvasArea;
    if (canvasArea) {
      try {
        canvasArea.releasePointerCapture(e.pointerId);
      } catch (err) {
        // May fail if already released, non-fatal
      }
    }

    this.drawingPointerId = null;

    if (this.isDrawing) {
      this.endStroke();
    }
  }

  /**
   * Handle pointer leave - clear preview
   * @param {PointerEvent} e
   */
  handlePointerLeave(e) {
    // Clear preview (only for non-captured pointers)
    if (!this.isDrawing || e.pointerId !== this.drawingPointerId) {
      this.clearPreview();
    }
  }

  /**
   * Handle pointer cancel - end stroke cleanly
   * @param {PointerEvent} e
   */
  handlePointerCancel(e) {
    if (e.pointerId !== this.drawingPointerId) return;

    this.drawingPointerId = null;

    if (this.isDrawing) {
      this.endStroke();
    }

    this.clearPreview();
  }

  /**
   * Cancel the current stroke (called when two-finger gesture starts)
   * Ends the stroke and triggers undo via onStrokeCancel callback
   */
  cancelCurrentStroke() {
    if (!this.isDrawing) return;

    // End the in-progress stroke
    this.isDrawing = false;
    this.lastPoint = null;

    // Release pointer capture if active
    if (this.drawingPointerId !== null) {
      const canvasArea = this.canvas.canvasArea;
      if (canvasArea) {
        try {
          canvasArea.releasePointerCapture(this.drawingPointerId);
        } catch (err) {
          // Non-fatal
        }
      }
      this.drawingPointerId = null;
    }

    // Notify that stroke was cancelled (so AnnotationModule can undo)
    if (this.onStrokeCancel) {
      this.onStrokeCancel();
    }

    this.clearPreview();
    console.log('[BrushEngine] Stroke cancelled (two-finger gesture)');
  }

  // ===========================================================================
  // STROKE MANAGEMENT
  // ===========================================================================

  /**
   * Start a new stroke
   * @param {number} x - X coordinate in source pixels
   * @param {number} y - Y coordinate in source pixels
   */
  startStroke(x, y) {
    console.log(`[BrushEngine] Starting stroke at (${x.toFixed(1)}, ${y.toFixed(1)}) with ${this.tool}, size ${this.brushSize}`);

    this.isDrawing = true;
    this.lastPoint = { x, y };

    // Notify stroke start (for history management)
    if (this.onStrokeStart) {
      this.onStrokeStart();
    }

    // Draw initial point
    this.drawCircle(x, y);
    this.renderAnnotations();
  }

  /**
   * Continue the current stroke
   * @param {number} x - X coordinate in source pixels
   * @param {number} y - Y coordinate in source pixels
   */
  continueStroke(x, y) {
    if (!this.isDrawing || !this.lastPoint) return;

    // Draw line from last point to current point
    this.drawLine(this.lastPoint.x, this.lastPoint.y, x, y);
    this.lastPoint = { x, y };

    // Render updated annotations
    this.renderAnnotations();
  }

  /**
   * End the current stroke
   */
  endStroke() {
    if (!this.isDrawing) return;

    this.isDrawing = false;
    this.lastPoint = null;

    // Notify stroke end (for history management)
    if (this.onStrokeEnd) {
      this.onStrokeEnd();
    }

    // Notify annotation change
    if (this.onAnnotationChange) {
      this.onAnnotationChange();
    }

    console.log('[BrushEngine] Stroke ended');
  }

  // ===========================================================================
  // DRAWING ALGORITHMS
  // ===========================================================================

  /**
   * Draw a filled circle at the given position
   * @param {number} cx - Center X in source pixels
   * @param {number} cy - Center Y in source pixels
   */
  drawCircle(cx, cy) {
    const data = this.getAnnotationData();
    if (!data) return;

    const isEraser = this.tool === 'eraser';
    const value = isEraser ? 0 : this.activeClassId;

    // Get the pixels that would be painted
    const pixels = this.getBrushPixels(cx, cy);

    for (const { x, y } of pixels) {
      if (x >= 0 && x < this.imageWidth && y >= 0 && y < this.imageHeight) {
        const index = y * this.imageWidth + x;

        // For eraser: only erase if the pixel's class is visible
        if (isEraser) {
          const currentClassId = data[index];
          if (currentClassId !== 0) {
            const currentClass = this.classes.find(c => c.id === currentClassId);
            // Skip if class is hidden
            if (currentClass && !currentClass.visible) {
              continue;
            }
          }
        }

        data[index] = value;
      }
    }
  }

  /**
   * Get the list of pixel coordinates that the brush would paint
   * This is used both for painting and for the preview to ensure they match exactly
   * @param {number} cx - Center X in source pixels
   * @param {number} cy - Center Y in source pixels
   * @returns {Array<{x: number, y: number}>} Array of pixel coordinates
   */
  getBrushPixels(cx, cy) {
    const pixels = [];
    const centerX = Math.floor(cx);
    const centerY = Math.floor(cy);

    if (this.brushSize <= 1) {
      // Single pixel brush
      pixels.push({ x: centerX, y: centerY });
    } else if (this.brushSize <= 2) {
      // 2x2 block for size 2
      pixels.push({ x: centerX, y: centerY });
      pixels.push({ x: centerX + 1, y: centerY });
      pixels.push({ x: centerX, y: centerY + 1 });
      pixels.push({ x: centerX + 1, y: centerY + 1 });
    } else {
      // Circle for larger brushes
      // Use the brush size as diameter, radius = size / 2
      const radius = this.brushSize / 2;
      const radiusSq = radius * radius;

      // Calculate bounding box
      const minX = Math.floor(cx - radius);
      const maxX = Math.ceil(cx + radius);
      const minY = Math.floor(cy - radius);
      const maxY = Math.ceil(cy + radius);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          // Check distance from pixel center to brush center
          const dx = (x + 0.5) - cx;
          const dy = (y + 0.5) - cy;
          if (dx * dx + dy * dy <= radiusSq) {
            pixels.push({ x, y });
          }
        }
      }
    }

    return pixels;
  }

  /**
   * Draw a line between two points with the brush
   * Uses linear interpolation to ensure smooth strokes
   * @param {number} x0 - Start X
   * @param {number} y0 - Start Y
   * @param {number} x1 - End X
   * @param {number} y1 - End Y
   */
  drawLine(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Number of steps based on distance (at least 1)
    // Use smaller step size for smoother lines
    const stepSize = Math.max(1, this.brushSize / 4);
    const steps = Math.max(1, Math.ceil(distance / stepSize));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      this.drawCircle(x, y);
    }
  }

  // ===========================================================================
  // FLOOD FILL
  // ===========================================================================

  /**
   * Perform scanline flood fill at the given position.
   * Replaces all contiguous pixels matching the clicked pixel's class
   * with the current activeClassId.
   * @param {number} clickX - X coordinate in source pixels
   * @param {number} clickY - Y coordinate in source pixels
   */
  floodFill(clickX, clickY) {
    const data = this.getAnnotationData();
    if (!data) return;

    const width = this.imageWidth;
    const height = this.imageHeight;

    const startX = Math.floor(clickX);
    const startY = Math.floor(clickY);

    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

    const targetClassId = data[startY * width + startX];
    const fillClassId = this.activeClassId;

    // No-op if target already matches fill color
    if (targetClassId === fillClassId) return;

    // Scanline flood fill using a stack of seed points
    const stack = [{ x: startX, y: startY }];

    while (stack.length > 0) {
      const { x, y } = stack.pop();
      const rowStart = y * width;

      // Skip if this pixel no longer matches (already filled)
      if (data[rowStart + x] !== targetClassId) continue;

      // Scan left to find span start
      let spanLeft = x;
      while (spanLeft > 0 && data[rowStart + spanLeft - 1] === targetClassId) {
        spanLeft--;
      }

      // Scan right to find span end
      let spanRight = x;
      while (spanRight < width - 1 && data[rowStart + spanRight + 1] === targetClassId) {
        spanRight++;
      }

      // Fill the span
      for (let i = spanLeft; i <= spanRight; i++) {
        data[rowStart + i] = fillClassId;
      }

      // Check row above and row below for new seeds
      for (const newY of [y - 1, y + 1]) {
        if (newY < 0 || newY >= height) continue;
        const newRowStart = newY * width;

        let i = spanLeft;
        while (i <= spanRight) {
          if (data[newRowStart + i] === targetClassId) {
            stack.push({ x: i, y: newY });
            // Skip past this contiguous run to avoid duplicate seeds
            while (i <= spanRight && data[newRowStart + i] === targetClassId) {
              i++;
            }
          } else {
            i++;
          }
        }
      }
    }
  }

  // ===========================================================================
  // ANNOTATION DATA MANAGEMENT
  // ===========================================================================

  /**
   * Get annotation data for the current slice
   * Creates new data if it doesn't exist
   * @returns {Uint8Array} Annotation data array
   */
  getAnnotationData() {
    const sliceIndex = this.canvas.currentSlice || 0;

    if (!this.sliceAnnotations.has(sliceIndex)) {
      // Create new empty annotation data
      const size = this.imageWidth * this.imageHeight;
      if (size <= 0) return null;

      this.sliceAnnotations.set(sliceIndex, new Uint8Array(size));
    }

    return this.sliceAnnotations.get(sliceIndex);
  }

  /**
   * Set annotation data for a specific slice
   * @param {number} sliceIndex - Slice index
   * @param {Uint8Array} data - Annotation data
   */
  setAnnotationData(sliceIndex, data) {
    this.sliceAnnotations.set(sliceIndex, data);
  }

  /**
   * Get all slice annotations
   * @returns {Map<number, Uint8Array>} Map of slice index to annotation data
   */
  getAllAnnotations() {
    return this.sliceAnnotations;
  }

  /**
   * Clear annotation data for a specific slice
   * @param {number} sliceIndex - Slice index to clear
   */
  clearSliceAnnotations(sliceIndex) {
    this.sliceAnnotations.delete(sliceIndex);
  }

  /**
   * Clear all annotation data
   */
  clearAllAnnotations() {
    this.sliceAnnotations.clear();
  }

  /**
   * Check if a slice has any annotations
   * @param {number} sliceIndex - Slice index to check
   * @returns {boolean} True if slice has annotations
   */
  hasAnnotations(sliceIndex) {
    const data = this.sliceAnnotations.get(sliceIndex);
    if (!data) return false;

    // Check if any non-zero values exist
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0) return true;
    }
    return false;
  }

  // ===========================================================================
  // CANVAS RENDERING
  // ===========================================================================

  /**
   * Render annotations to the annotation canvas
   * Maps class IDs to colors and handles visibility
   */
  renderAnnotations() {
    const ctx = this.canvas.annotationCtx;
    if (!ctx) return;

    const data = this.getAnnotationData();
    if (!data) return;

    const width = this.imageWidth;
    const height = this.imageHeight;

    // Guard: don't render if dimensions not set (image not loaded yet)
    if (width <= 0 || height <= 0) return;

    // Create ImageData for efficient pixel manipulation
    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    // Build color lookup table
    const colorLUT = this.buildColorLUT();

    // Fill pixel data
    for (let i = 0; i < data.length; i++) {
      const classId = data[i];
      const pixelIndex = i * 4;

      if (classId === 0) {
        // Background - transparent
        pixels[pixelIndex] = 0;
        pixels[pixelIndex + 1] = 0;
        pixels[pixelIndex + 2] = 0;
        pixels[pixelIndex + 3] = 0;
      } else {
        // Class color with semi-transparency
        const color = colorLUT[classId];
        if (color && color.visible) {
          pixels[pixelIndex] = color.r;
          pixels[pixelIndex + 1] = color.g;
          pixels[pixelIndex + 2] = color.b;
          pixels[pixelIndex + 3] = 180;  // Semi-transparent
        } else {
          // Class hidden or not found
          pixels[pixelIndex + 3] = 0;
        }
      }
    }

    // Clear and draw
    ctx.clearRect(0, 0, width, height);
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Build color lookup table from class definitions
   * @returns {object} LUT mapping class ID to RGB values
   */
  buildColorLUT() {
    const lut = {};

    for (const cls of this.classes) {
      const rgb = this.hexToRgb(cls.color);
      lut[cls.id] = {
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        visible: cls.visible
      };
    }

    return lut;
  }

  /**
   * Convert hex color to RGB
   * @param {string} hex - Hex color string
   * @returns {object} RGB values
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 0, b: 0 };  // Default to red
  }

  // ===========================================================================
  // BRUSH PREVIEW
  // ===========================================================================

  /**
   * Update the brush preview cursor
   * Shows exactly which pixels will be painted with hard edges
   * @param {object} coords - Coordinate info from AnnotationCanvas
   */
  updatePreview(coords = null) {
    if (!this.enabled) return;

    const ctx = this.canvas.previewCtx;
    if (!ctx) return;

    // Guard: don't render if dimensions not set (image not loaded yet)
    if (this.imageWidth <= 0 || this.imageHeight <= 0) return;

    // Disable anti-aliasing for crisp pixel edges
    ctx.imageSmoothingEnabled = false;

    // Clear previous preview
    ctx.clearRect(0, 0, this.imageWidth, this.imageHeight);

    if (!coords || !coords.inBounds) return;

    const x = coords.source.x;
    const y = coords.source.y;

    // Fill tool preview: small crosshair at cursor position
    if (this.tool === 'fill') {
      const px = Math.floor(x);
      const py = Math.floor(y);
      if (px >= 0 && px < this.imageWidth && py >= 0 && py < this.imageHeight) {
        const activeClass = this.classes.find(c => c.id === this.activeClassId);
        const rgb = this.hexToRgb(activeClass ? activeClass.color : '#FF6B6B');
        const imageData = ctx.createImageData(this.imageWidth, this.imageHeight);
        const data = imageData.data;

        const idx = (py * this.imageWidth + px) * 4;
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 200;

        ctx.putImageData(imageData, 0, 0);
      }
      return;
    }

    // Get color for preview - use semi-transparent solid color
    let previewColor;
    if (this.tool === 'eraser') {
      previewColor = 'rgba(255, 255, 255, 0.6)';
    } else {
      const activeClass = this.classes.find(c => c.id === this.activeClassId);
      const hexColor = activeClass ? activeClass.color : '#FF6B6B';
      const rgb = this.hexToRgb(hexColor);
      previewColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;
    }

    // Get the exact pixels that would be painted
    const pixels = this.getBrushPixels(x, y);

    // Use ImageData for pixel-perfect rendering without anti-aliasing
    if (pixels.length > 0) {
      const imageData = ctx.createImageData(this.imageWidth, this.imageHeight);
      const data = imageData.data;

      // Parse the preview color
      const rgb = this.tool === 'eraser'
        ? { r: 255, g: 255, b: 255 }
        : this.hexToRgb(this.classes.find(c => c.id === this.activeClassId)?.color || '#FF6B6B');

      for (const { x: px, y: py } of pixels) {
        if (px >= 0 && px < this.imageWidth && py >= 0 && py < this.imageHeight) {
          const idx = (py * this.imageWidth + px) * 4;
          data[idx] = rgb.r;       // R
          data[idx + 1] = rgb.g;   // G
          data[idx + 2] = rgb.b;   // B
          data[idx + 3] = 150;     // A (semi-transparent)
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }
  }

  /**
   * Clear the brush preview
   */
  clearPreview() {
    const ctx = this.canvas.previewCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.imageWidth, this.imageHeight);
  }

  // ===========================================================================
  // CLASS MANAGEMENT
  // ===========================================================================

  /**
   * Add a new class
   * @param {string} name - Optional class name
   * @param {string} color - Optional color
   * @returns {object} The new class
   */
  addClass(name = null, color = null) {
    const id = this.nextClassId++;
    const newClass = {
      id,
      name: name || `Class ${id}`,
      color: color || this.getNextColor(),
      visible: true
    };

    this.classes.push(newClass);
    this.activeClassId = id;

    console.log(`[BrushEngine] Added class: ${newClass.name}`);
    return newClass;
  }

  /**
   * Delete a class
   * @param {number} classId - Class ID to delete
   * @returns {boolean} True if deleted
   */
  deleteClass(classId) {
    const index = this.classes.findIndex(c => c.id === classId);
    if (index === -1) return false;

    // Remove class
    this.classes.splice(index, 1);

    // Clear all pixels with this class ID
    for (const [sliceIndex, data] of this.sliceAnnotations) {
      for (let i = 0; i < data.length; i++) {
        if (data[i] === classId) {
          data[i] = 0;
        }
      }
    }

    // Update active class if needed
    if (this.activeClassId === classId) {
      this.activeClassId = this.classes.length > 0 ? this.classes[0].id : 0;
    }

    // Re-render
    this.renderAnnotations();

    console.log(`[BrushEngine] Deleted class ID: ${classId}`);
    return true;
  }

  /**
   * Toggle class visibility
   * @param {number} classId - Class ID to toggle
   */
  toggleClassVisibility(classId) {
    const cls = this.classes.find(c => c.id === classId);
    if (cls) {
      cls.visible = !cls.visible;
      this.renderAnnotations();
      console.log(`[BrushEngine] Class ${classId} visibility: ${cls.visible}`);
    }
  }

  /**
   * Generate a color with maximum distinction from existing colors
   * Uses HSL color space with evenly distributed hues
   * @returns {string} Hex color
   */
  getNextColor() {
    const numClasses = this.classes.length;

    // Use golden angle approximation for optimal hue distribution
    // This ensures colors are well-separated even when adding many classes
    const goldenAngle = 137.508; // degrees
    const hue = (numClasses * goldenAngle) % 360;

    const { saturation, lightness } = this.colorSettings;
    return this.hslToHex(hue, saturation, lightness);
  }

  /**
   * Convert HSL to Hex color
   * @param {number} h - Hue (0-360)
   * @param {number} s - Saturation (0-100)
   * @param {number} l - Lightness (0-100)
   * @returns {string} Hex color
   */
  hslToHex(h, s, l) {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }

    const toHex = (n) => {
      const hex = Math.round((n + m) * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /**
   * Get all classes
   * @returns {Array} Array of class definitions
   */
  getClasses() {
    return [...this.classes];
  }

  /**
   * Get active class
   * @returns {object|null} Active class or null
   */
  getActiveClass() {
    return this.classes.find(c => c.id === this.activeClassId) || null;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Destroy the brush engine and clean up resources
   */
  destroy() {
    this.detachEventListeners();
    this.sliceAnnotations.clear();
    this.classes = [];
    this.canvas = null;

    console.log('[BrushEngine] Destroyed');
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default BrushEngine;
