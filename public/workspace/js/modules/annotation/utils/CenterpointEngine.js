/**
 * CenterpointEngine - Pointer handling + rendering for filament centerpoints
 *
 * Handles click-to-place interaction and renders filament markers
 * on a dedicated canvas layer. Markers are always visible regardless
 * of which tool is active.
 *
 * @module CenterpointEngine
 */

class CenterpointEngine {

  /**
   * @param {AnnotationCanvas} annotationCanvas
   * @param {FilamentManager} filamentManager
   */
  constructor(annotationCanvas, filamentManager) {
    this.canvas = annotationCanvas;
    this.filamentManager = filamentManager;

    // State
    this.enabled = false;         // Only true when centerpoint tool is active
    this.currentSlice = 0;

    // Callbacks
    this.onPointPlaced = null;    // () => void -- notify module of data change
    this.onPointRemoved = null;   // () => void

    // Bind methods
    this.handlePointerDown = this.handlePointerDown.bind(this);
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Attach event listeners
   */
  initialize() {
    const canvasArea = this.canvas.canvasArea;
    if (canvasArea) {
      canvasArea.addEventListener('pointerdown', this.handlePointerDown);
    }
  }

  /**
   * Enable centerpoint interaction (centerpoint tool selected)
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable centerpoint interaction (brush/eraser selected)
   */
  disable() {
    this.enabled = false;
    this.clearPreview();
  }

  /**
   * Update the current slice index
   * @param {number} sliceIndex
   */
  setSlice(sliceIndex) {
    this.currentSlice = sliceIndex;
  }

  // ===========================================================================
  // POINTER EVENTS
  // ===========================================================================

  /**
   * Handle pointer down for placing/deleting points
   * @param {PointerEvent} e
   */
  handlePointerDown(e) {
    if (!this.enabled) return;

    // Don't handle during pan mode
    if (this.canvas.isPanning || this.canvas.spacePressed) return;
    if (this.canvas.isTwoFingerGesture) return;

    const source = this.canvas.screenToSource(e.clientX, e.clientY);
    if (!this.canvas.isInBounds(source.x, source.y)) return;

    // Right-click: delete nearest point
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      this._handleRightClick(source.x, source.y);
      return;
    }

    // Left-click (or pen/touch): place point for active filament
    if (e.button === 0 || e.pointerType === 'pen' || e.pointerType === 'touch') {
      e.preventDefault();
      e.stopPropagation();
      this._handleLeftClick(source.x, source.y);
      return;
    }
  }

  /**
   * Place or reposition point for active filament on current slice
   */
  _handleLeftClick(x, y) {
    const placed = this.filamentManager.setPoint(
      this.currentSlice, Math.floor(x), Math.floor(y)
    );
    if (placed) {
      this.render();
      if (this.onPointPlaced) this.onPointPlaced();
    }
  }

  /**
   * Delete the nearest point on the current slice (any filament)
   */
  _handleRightClick(x, y) {
    const hit = this.filamentManager.hitTest(this.currentSlice, x, y, 10);
    if (hit) {
      this.filamentManager.removePoint(hit.filamentId, this.currentSlice);
      this.render();
      if (this.onPointRemoved) this.onPointRemoved();
    }
  }

  // ===========================================================================
  // PREVIEW (HOVER PIXEL)
  // ===========================================================================

  /**
   * Show the exact pixel that would be marked on hover
   * @param {object|null} coords - { source: { x, y }, inBounds: boolean }
   */
  updatePreview(coords) {
    if (!this.enabled) return;

    const ctx = this.canvas.previewCtx;
    if (!ctx) return;

    const w = this.canvas.imageSize.width;
    const h = this.canvas.imageSize.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    if (!coords || !coords.inBounds) return;

    const activeFil = this.filamentManager.getActiveFilament();
    if (!activeFil) return;

    const px = Math.floor(coords.source.x);
    const py = Math.floor(coords.source.y);

    ctx.fillStyle = activeFil.color;
    ctx.fillRect(px, py, 1, 1);
  }

  /**
   * Clear the hover preview
   */
  clearPreview() {
    const ctx = this.canvas.previewCtx;
    if (!ctx) return;
    const w = this.canvas.imageSize.width;
    const h = this.canvas.imageSize.height;
    if (w > 0 && h > 0) {
      ctx.clearRect(0, 0, w, h);
    }
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  /**
   * Render all filament markers on the filament canvas
   * Called whenever: slice changes, filament data changes, filament selection changes
   */
  render() {
    const ctx = this.canvas.filamentCtx;
    if (!ctx) return;

    const w = this.canvas.imageSize.width;
    const h = this.canvas.imageSize.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const activeFilament = this.filamentManager.getActiveFilament();
    const allPoints = this.filamentManager.getPointsOnSlice(this.currentSlice);

    // 1. Render ghost markers for active filament (z-1 and z+1)
    if (activeFilament) {
      this._renderGhostMarkers(ctx, activeFilament);
    }

    // 2. Render all filament points (single pixel, full opacity)
    for (const pt of allPoints) {
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.floor(pt.x), Math.floor(pt.y), 1, 1);
    }
  }

  /**
   * Render ghost markers for the active filament from z-1 and z+1
   * Single pixel with label text and connecting line to current point
   */
  _renderGhostMarkers(ctx, filament) {
    const currentPt = this.filamentManager.getPoint(
      filament.id, this.currentSlice
    );

    const adjacentSlices = [
      { offset: -1, label: 'z-1' },
      { offset: +1, label: 'z+1' }
    ];

    for (const { offset, label } of adjacentSlices) {
      const adjSlice = this.currentSlice + offset;
      if (adjSlice < 0) continue;

      const ghostPt = this.filamentManager.getPoint(filament.id, adjSlice);
      if (!ghostPt) continue;

      const gx = Math.floor(ghostPt.x);
      const gy = Math.floor(ghostPt.y);

      ctx.save();

      // Ghost marker: single pixel
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = filament.color;
      ctx.fillRect(gx, gy, 1, 1);

      // Label text
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = filament.color;
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, gx + 4, gy);

      // Connecting line to current point (if exists)
      if (currentPt) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = filament.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(Math.floor(currentPt.x), Math.floor(currentPt.y));
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  destroy() {
    const canvasArea = this.canvas?.canvasArea;
    if (canvasArea) {
      canvasArea.removeEventListener('pointerdown', this.handlePointerDown);
    }
    this.canvas = null;
    this.filamentManager = null;
    this.onPointPlaced = null;
    this.onPointRemoved = null;
  }
}

export default CenterpointEngine;
