# Phase 1: Centerpoint Annotation Tooling — Implementation Plan

## Context

Phase 1 of the Direction-Aware Segmentation initiative: Centerpoint Annotation Tooling. This adds filament centerpoint annotation to the existing annotation module, enabling users to click-to-place named points on filament centers across Z-slices.

**User decisions from clarifying questions:**
- Centerpoint markers: **always visible** regardless of active tool
- Undo/redo: **no undo for centerpoints** (MVP) — click to reposition, right-click to delete
- Class association: new filaments use the **currently active class** ID
- Filament list: **always visible** in the toolbar

---

## Step 1: Create FilamentManager.js (New File)

**File:** `public/workspace/js/modules/annotation/utils/FilamentManager.js`

**Purpose:** Pure data manager with no DOM dependencies. Manages filament definitions, per-slice point placement, naming, coloring, selection, deletion, and serialization. All other components depend on this as their single source of truth for filament state.

**Design decisions:**
- Filament IDs are monotonically increasing integers (never reused within a session, like `nextClassId` in BrushEngine).
- Auto-naming uses the pattern `MT-{n}` where n increments globally. Users see this in the filament list.
- Color palette is a fixed 10-color array that cycles. This differs from the BrushEngine golden-angle approach because filaments are a small set and we want maximum visual distinction from the class overlay colors.
- Points are stored per filament per slice as `{ x: number, y: number }` in source-pixel coordinates (floats, matching the `screenToSource` output from AnnotationCanvas).
- Callbacks notify the module layer of changes so it can set `isDirty` and re-render.

**Complete class specification:**

```javascript
/**
 * FilamentManager - Pure data manager for filament centerpoints
 *
 * Manages filament definitions and per-slice point placement.
 * No DOM dependencies - rendering handled by CenterpointEngine.
 */
class FilamentManager {

  constructor() {
    // Filament storage
    this.filaments = [];         // Array<Filament>
    this.nextFilamentId = 1;     // Auto-incrementing ID
    this.nextNameNumber = 1;     // Auto-incrementing name counter
    this.activeFilamentId = null;// Currently selected filament ID (null = none)

    // 10-color palette, visually distinct from BrushEngine class colors
    this.colorPalette = [
      '#00BFFF', // deep sky blue
      '#FF4500', // orange-red
      '#32CD32', // lime green
      '#FF69B4', // hot pink
      '#FFD700', // gold
      '#8A2BE2', // blue-violet
      '#00CED1', // dark turquoise
      '#FF6347', // tomato
      '#7FFF00', // chartreuse
      '#DA70D6'  // orchid
    ];

    // Callbacks
    this.onChange = null;     // () => void -- called on any data mutation
  }

  // --- Filament CRUD ---

  /**
   * Add a new filament
   * @param {number} classId - The class ID to associate (from BrushEngine active class)
   * @returns {object} The created filament { id, name, color, classId, points: {} }
   */
  addFilament(classId) {
    const id = this.nextFilamentId++;
    const colorIndex = (this.filaments.length) % this.colorPalette.length;
    const filament = {
      id,
      name: `MT-${this.nextNameNumber++}`,
      color: this.colorPalette[colorIndex],
      classId: classId || 0,
      points: {}   // Map<sliceIndex (string), { x: number, y: number }>
    };
    this.filaments.push(filament);
    this.activeFilamentId = id;
    this._notify();
    return filament;
  }

  /**
   * Remove a filament by ID
   * @param {number} filamentId
   * @returns {boolean} true if removed
   */
  removeFilament(filamentId) {
    const index = this.filaments.findIndex(f => f.id === filamentId);
    if (index === -1) return false;
    this.filaments.splice(index, 1);
    if (this.activeFilamentId === filamentId) {
      this.activeFilamentId = this.filaments.length > 0
        ? this.filaments[0].id
        : null;
    }
    this._notify();
    return true;
  }

  /**
   * Rename a filament
   * @param {number} filamentId
   * @param {string} newName
   */
  renameFilament(filamentId, newName) {
    const fil = this.getFilament(filamentId);
    if (fil && newName && newName.trim()) {
      fil.name = newName.trim();
      this._notify();
    }
  }

  /**
   * Set the active filament
   * @param {number|null} filamentId
   */
  setActiveFilament(filamentId) {
    this.activeFilamentId = filamentId;
    // No _notify here -- this is a UI selection, not a data change
    // The module will re-render the list and canvas directly
  }

  /**
   * Get filament by ID
   * @param {number} filamentId
   * @returns {object|null}
   */
  getFilament(filamentId) {
    return this.filaments.find(f => f.id === filamentId) || null;
  }

  /**
   * Get the active filament
   * @returns {object|null}
   */
  getActiveFilament() {
    return this.getFilament(this.activeFilamentId);
  }

  /**
   * Get all filaments
   * @returns {Array}
   */
  getAllFilaments() {
    return this.filaments;
  }

  /**
   * Check if any filament has points
   * @returns {boolean}
   */
  hasAnyPoints() {
    return this.filaments.some(f => Object.keys(f.points).length > 0);
  }

  // --- Point management ---

  /**
   * Set (place or reposition) a point for the active filament on a slice
   * @param {number} sliceIndex
   * @param {number} x - source pixel X
   * @param {number} y - source pixel Y
   * @returns {boolean} true if placed
   */
  setPoint(sliceIndex, x, y) {
    const fil = this.getActiveFilament();
    if (!fil) return false;
    fil.points[sliceIndex.toString()] = { x, y };
    this._notify();
    return true;
  }

  /**
   * Remove a point for a specific filament on a slice
   * @param {number} filamentId
   * @param {number} sliceIndex
   * @returns {boolean} true if removed
   */
  removePoint(filamentId, sliceIndex) {
    const fil = this.getFilament(filamentId);
    if (!fil) return false;
    const key = sliceIndex.toString();
    if (key in fil.points) {
      delete fil.points[key];
      this._notify();
      return true;
    }
    return false;
  }

  /**
   * Get a point for a filament on a slice
   * @param {number} filamentId
   * @param {number} sliceIndex
   * @returns {{ x: number, y: number }|null}
   */
  getPoint(filamentId, sliceIndex) {
    const fil = this.getFilament(filamentId);
    if (!fil) return null;
    return fil.points[sliceIndex.toString()] || null;
  }

  /**
   * Get all points on a given slice (all filaments)
   * @param {number} sliceIndex
   * @returns {Array<{ filamentId: number, x: number, y: number, color: string, isActive: boolean }>}
   */
  getPointsOnSlice(sliceIndex) {
    const key = sliceIndex.toString();
    const points = [];
    for (const fil of this.filaments) {
      const pt = fil.points[key];
      if (pt) {
        points.push({
          filamentId: fil.id,
          x: pt.x,
          y: pt.y,
          color: fil.color,
          name: fil.name,
          isActive: fil.id === this.activeFilamentId
        });
      }
    }
    return points;
  }

  /**
   * Get point count for a filament (across all slices)
   * @param {number} filamentId
   * @returns {number}
   */
  getPointCount(filamentId) {
    const fil = this.getFilament(filamentId);
    return fil ? Object.keys(fil.points).length : 0;
  }

  /**
   * Find which filament has a point near the given coordinates on a slice
   * Used for right-click deletion hit-testing
   * @param {number} sliceIndex
   * @param {number} x
   * @param {number} y
   * @param {number} radius - hit-test radius in source pixels
   * @returns {{ filamentId: number, distance: number }|null}
   */
  hitTest(sliceIndex, x, y, radius = 8) {
    const key = sliceIndex.toString();
    let closest = null;
    let closestDist = Infinity;

    for (const fil of this.filaments) {
      const pt = fil.points[key];
      if (!pt) continue;
      const dx = pt.x - x;
      const dy = pt.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius && dist < closestDist) {
        closest = { filamentId: fil.id, distance: dist };
        closestDist = dist;
      }
    }
    return closest;
  }

  // --- Serialization ---

  /**
   * Serialize to JSON-safe object for saving
   * @param {string} sourceFileId
   * @returns {object}
   */
  toJSON(sourceFileId) {
    return {
      version: '1.0.0',
      sourceFileId: sourceFileId || 'unknown',
      filaments: this.filaments.map(f => ({
        id: f.id,
        name: f.name,
        color: f.color,
        classId: f.classId,
        points: { ...f.points }
      }))
    };
  }

  /**
   * Restore from saved JSON data
   * @param {object} data - The _filaments.json content
   */
  fromJSON(data) {
    if (!data || !data.filaments) return;

    this.filaments = data.filaments.map(f => ({
      id: f.id,
      name: f.name,
      color: f.color,
      classId: f.classId,
      points: f.points || {}
    }));

    // Update counters
    if (this.filaments.length > 0) {
      this.nextFilamentId = Math.max(...this.filaments.map(f => f.id)) + 1;
      // Parse name numbers for MT-N pattern
      const nameNumbers = this.filaments
        .map(f => {
          const match = f.name.match(/^MT-(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);
      this.nextNameNumber = nameNumbers.length > 0
        ? Math.max(...nameNumbers) + 1
        : this.filaments.length + 1;
      this.activeFilamentId = this.filaments[0].id;
    } else {
      this.nextFilamentId = 1;
      this.nextNameNumber = 1;
      this.activeFilamentId = null;
    }
  }

  // --- Internal ---

  _notify() {
    if (this.onChange) {
      this.onChange();
    }
  }

  /**
   * Clean up
   */
  destroy() {
    this.filaments = [];
    this.onChange = null;
  }
}

export default FilamentManager;
```

**Key design notes:**
- Points are stored with string keys (`sliceIndex.toString()`) to match the pattern used by `prepareAnnotationData()` for `sliceData`.
- `hitTest()` is needed for right-click deletion. The radius of 8 source pixels is reasonable for typical microscopy images (512x512 to 2048x2048).
- `setPoint()` operates on the active filament only, simplifying the click handler.
- `fromJSON()`/`toJSON()` handle the `_filaments.json` sidecar format exactly.

---

## Step 2: Modify AnnotationCanvas.js — Add Filament Canvas Layer

**File:** `public/workspace/js/modules/annotation/utils/AnnotationCanvas.js`

**Purpose:** Insert a new `<canvas>` element between `annotationCanvas` and `previewCanvas` in the DOM layering order. This canvas will be used exclusively by CenterpointEngine for rendering filament markers.

**Changes to `createDOM()` method (around line 111):**

Add these new properties after `this.previewCanvas` declaration (line 65-66 area in constructor):

```javascript
// In constructor, add after line 69:
this.filamentCanvas = null;
this.filamentCtx = null;
```

In `createDOM()`, add the filament canvas creation after the annotationCanvas creation (after line 157) and before the previewCanvas:

```javascript
// Create filament canvas (for centerpoint markers, always visible)
this.filamentCanvas = document.createElement('canvas');
this.filamentCanvas.className = 'annotation-filaments';
this.filamentCanvas.style.cssText = `
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
`;

// Get context
this.filamentCtx = this.filamentCanvas.getContext('2d');
```

In the DOM assembly section (around line 188), insert the filament canvas between annotationCanvas and previewCanvas:

```javascript
// Assemble DOM (modified order)
this.transformContainer.appendChild(this.sourceImage);
this.transformContainer.appendChild(this.annotationCanvas);
this.transformContainer.appendChild(this.filamentCanvas);      // NEW
this.transformContainer.appendChild(this.previewCanvas);
this.transformContainer.appendChild(this.interactionLayer);
```

In `resizeCanvases()` (around line 285), add filament canvas resizing:

```javascript
resizeCanvases() {
  const { width, height } = this.imageSize;

  this.annotationCanvas.width = width;
  this.annotationCanvas.height = height;
  this.filamentCanvas.width = width;           // NEW
  this.filamentCanvas.height = height;         // NEW
  this.previewCanvas.width = width;
  this.previewCanvas.height = height;

  // Resize interaction layer to match image
  this.interactionLayer.style.width = `${width}px`;
  this.interactionLayer.style.height = `${height}px`;

  // Reset transform for crisp rendering
  this.annotationCtx.imageSmoothingEnabled = false;
  this.filamentCtx.imageSmoothingEnabled = true;  // NEW: anti-aliased circles
  this.previewCtx.imageSmoothingEnabled = false;
}
```

Note: `filamentCtx.imageSmoothingEnabled = true` because we want anti-aliased circle markers, not pixel-perfect painting like BrushEngine.

**No other changes to AnnotationCanvas.js are needed.** The zoom/pan transform is inherited via the CSS `transform` on `transformContainer`, so the filament canvas moves and scales automatically with everything else.

---

## Step 3: Create CenterpointEngine.js (New File)

**File:** `public/workspace/js/modules/annotation/utils/CenterpointEngine.js`

**Purpose:** Handles pointer events for click-to-place centerpoints, renders all filament markers on the filament canvas layer, renders cursor preview on the preview canvas, and manages enable/disable state.

**Design decisions:**
- Uses canvas 2D API (`arc`, `stroke`, `fill`, `beginPath`) for rendering, NOT `ImageData` pixel manipulation. This is because markers are sparse, anti-aliased, and use diverse visual styles (filled vs hollow, dashed lines, etc.).
- Has an `enabled` flag. When disabled (brush/eraser active), pointer events are ignored but `render()` still works (markers always visible).
- `render()` is called externally by the AnnotationModule whenever the slice changes or filament state changes. It does NOT attach its own event listeners for pointer move — the preview is driven by the existing `onMouseMove` callback in AnnotationCanvas.
- For right-click handling: listens for `pointerdown` with `button === 2` on the canvas area. The context menu is already prevented by AnnotationCanvas.

```javascript
/**
 * CenterpointEngine - Pointer handling + rendering for filament centerpoints
 *
 * Handles click-to-place interaction and renders filament markers
 * on a dedicated canvas layer. Markers are always visible regardless
 * of which tool is active.
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
    this.lastHoverCoords = null;  // For cursor preview: { x, y }

    // Callbacks
    this.onPointPlaced = null;    // () => void -- notify module of data change
    this.onPointRemoved = null;   // () => void

    // Bind methods
    this.handlePointerDown = this.handlePointerDown.bind(this);
  }

  // --- Lifecycle ---

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

  // --- Pointer Events ---

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
    const placed = this.filamentManager.setPoint(this.currentSlice, x, y);
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

  // --- Preview (cursor) ---

  /**
   * Update cursor preview when hovering in centerpoint mode
   * Called by AnnotationModule from the onMouseMove callback
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

    if (!coords || !coords.inBounds) {
      this.lastHoverCoords = null;
      return;
    }

    this.lastHoverCoords = coords.source;
    const x = coords.source.x;
    const y = coords.source.y;

    // Draw crosshair in active filament color
    const activeFil = this.filamentManager.getActiveFilament();
    const color = activeFil ? activeFil.color : '#FFFFFF';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.8;

    const armLength = 8; // pixels in source coords

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(x - armLength, y);
    ctx.lineTo(x + armLength, y);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, y - armLength);
    ctx.lineTo(x, y + armLength);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Clear the cursor preview
   */
  clearPreview() {
    const ctx = this.canvas.previewCtx;
    if (!ctx) return;
    const w = this.canvas.imageSize.width;
    const h = this.canvas.imageSize.height;
    if (w > 0 && h > 0) {
      ctx.clearRect(0, 0, w, h);
    }
    this.lastHoverCoords = null;
  }

  // --- Rendering ---

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

    // 2. Render inactive filament points (behind active)
    for (const pt of allPoints) {
      if (!pt.isActive) {
        this._renderInactiveMarker(ctx, pt.x, pt.y, pt.color);
      }
    }

    // 3. Render active filament point (on top)
    for (const pt of allPoints) {
      if (pt.isActive) {
        this._renderActiveMarker(ctx, pt.x, pt.y, pt.color);
      }
    }
  }

  /**
   * Render an inactive filament marker
   * Filled circle, radius 4px, filament color, 1px white border, alpha 0.7
   */
  _renderInactiveMarker(ctx, x, y, color) {
    ctx.save();
    ctx.globalAlpha = 0.7;

    // Filled circle
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // White border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Render the active filament marker
   * Filled circle, radius 6px, filament color, 2px white border, full opacity
   * Plus outer highlight ring
   */
  _renderActiveMarker(ctx, x, y, color) {
    ctx.save();
    ctx.globalAlpha = 1.0;

    // Outer highlight ring
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.stroke();

    // Filled circle
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // White border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Render ghost markers for the active filament from z-1 and z+1
   * Hollow dashed circle with label text and connecting line to current point
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

      ctx.save();

      // Ghost marker: hollow dashed circle
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = filament.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.arc(ghostPt.x, ghostPt.y, 5, 0, Math.PI * 2);
      ctx.stroke();

      // Label text
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = filament.color;
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, ghostPt.x + 8, ghostPt.y);

      // Connecting line to current point (if exists)
      if (currentPt) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = filament.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(ghostPt.x, ghostPt.y);
        ctx.lineTo(currentPt.x, currentPt.y);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // --- Cleanup ---

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
```

**Key design notes:**
- `handlePointerDown` is attached to `this.canvas.canvasArea` (the interaction layer). Since BrushEngine also listens on the same element, the `enabled` check at the top of the handler ensures only the active engine processes events. BrushEngine will get a similar guard added in Step 4.
- `e.stopPropagation()` after handling prevents the event from being processed by BrushEngine's handler as well. However, since both handlers are attached to the same element (not parent/child), `stopPropagation` alone is not sufficient — the `enabled` guard on BrushEngine (Step 4) is the primary mechanism.
- Ghost markers use `setLineDash` for dashed circles. The font `8px monospace` for the z-label is tiny enough to not obscure the image but readable at typical zoom levels.
- The rendering coordinate system is source pixels. Since the filament canvas is inside the `transformContainer`, all CSS transforms (zoom/pan) apply automatically.

---

## Step 4: Modify BrushEngine.js — Add Enabled Flag

**File:** `public/workspace/js/modules/annotation/utils/BrushEngine.js`

**Purpose:** Add an `enabled` flag so BrushEngine can be disabled when the centerpoint tool is active, preventing brush/eraser drawing from competing with point placement.

**Changes:**

1. **In constructor** (after line 48, after `this.lastPoint = null;`):

```javascript
this.enabled = true;  // Can be disabled when centerpoint tool is active
```

2. **Add enable/disable methods** (after `updateCursor()` around line 223):

```javascript
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
  // End any in-progress stroke
  if (this.isDrawing) {
    this.endStroke();
  }
  this.clearPreview();
}
```

3. **Guard `handlePointerDown`** (line 234, add at the very beginning of the method body):

```javascript
handlePointerDown(e) {
  if (!this.enabled) return;  // NEW GUARD
  // ... existing code unchanged
}
```

4. **Guard `handlePointerMove`** (line 273, add at the very beginning):

```javascript
handlePointerMove(e) {
  if (!this.enabled) return;  // NEW GUARD
  // ... existing code unchanged
}
```

5. **Guard `handlePointerUp`** (line 316, add at the very beginning):

```javascript
handlePointerUp(e) {
  if (!this.enabled) return;  // NEW GUARD
  // ... existing code unchanged
}
```

6. **Guard `updatePreview`** (line 750, add at the beginning):

```javascript
updatePreview(coords = null) {
  if (!this.enabled) return;  // NEW GUARD
  // ... existing code unchanged
}
```

That is the complete set of changes to BrushEngine.js. The existing `handlePointerLeave` and `handlePointerCancel` do not need guards because they only clear the preview and end strokes, which is safe even when disabled.

---

## Step 5: Modify AnnotationModule.js — UI, Tool Switching, Save/Load

**File:** `public/workspace/js/modules/annotation/AnnotationModule.js`

This is the largest change. Each modification area is detailed below.

### 5a. Imports (top of file, after line 26)

Add new imports:

```javascript
import FilamentManager from './utils/FilamentManager.js';
import CenterpointEngine from './utils/CenterpointEngine.js';
```

### 5b. Constructor (after line 65)

Add new component references:

```javascript
this.filamentManager = null;
this.centerpointEngine = null;
```

And a tracking property for active tool:

```javascript
this.activeTool = 'brush';  // 'brush' | 'eraser' | 'centerpoint'
```

### 5c. Toolbar HTML in render() — Tools Section

Replace the existing tool-buttons div (lines 236-245) with:

```html
<div class="tool-buttons">
  <button id="toolBrush" class="tool-btn active" title="Brush (B)">
    <span class="tool-icon">&#x1F58C;&#xFE0F;</span>
    <span class="tool-label">Brush</span>
  </button>
  <button id="toolEraser" class="tool-btn" title="Eraser (E)">
    <span class="tool-icon">&#x1F9F9;</span>
    <span class="tool-label">Eraser</span>
  </button>
  <button id="toolCenterpoint" class="tool-btn" title="Centerpoint (C)">
    <span class="tool-icon">&#x271A;</span>
    <span class="tool-label">Center</span>
  </button>
</div>
```

Note: The unicode `&#x271A;` is a heavy Greek cross, which makes a good crosshair/point icon without requiring SVG. It renders cleanly in all browsers.

### 5d. Toolbar HTML — Add Filaments Section

After the Classes section closing `</div>` (around line 297), add a new toolbar section:

```html
<!-- Filaments Section -->
<div class="toolbar-section filaments-section">
  <div class="filaments-header">
    <h4>Filaments</h4>
    <button id="addFilamentBtn" class="btn-add-class" title="Add filament">+</button>
  </div>
  <div id="filamentList" class="filament-list">
    <!-- Filaments rendered dynamically -->
    <div class="filament-empty-state">
      No filaments. Click + to add.
    </div>
  </div>
</div>
```

### 5e. initializeCanvas() — Instantiate FilamentManager and CenterpointEngine

In `initializeCanvas()` (around line 738, after the BrushEngine creation block), add:

```javascript
// Create filament manager if not exists
if (!this.filamentManager) {
  this.filamentManager = new FilamentManager();

  // Notify module of filament data changes
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
```

Also update the `canvas.onSliceLoaded` callback to re-render filament markers:

```javascript
this.canvas.onSliceLoaded = (info) => {
  this.updateDimensionsDisplay(info.width, info.height);
  if (this.brushEngine) {
    this.brushEngine.initialize(info.width, info.height);
    this.brushEngine.renderAnnotations();
  }
  if (this.centerpointEngine) {
    this.centerpointEngine.setSlice(this.currentSlice);
    this.centerpointEngine.render();
  }
};
```

And update the `canvas.onMouseMove` callback to route preview to the right engine:

```javascript
this.canvas.onMouseMove = (coords) => {
  this.updateCoordsDisplay(coords);
  if (this.activeTool === 'centerpoint' && this.centerpointEngine) {
    this.centerpointEngine.updatePreview(coords);
  } else if (this.brushEngine) {
    this.brushEngine.updatePreview(coords);
  }
};
```

Then render the initial filament list:

```javascript
this.renderFilamentList();
```

### 5f. setTool() — Handle All Three Tools

Replace the existing `setTool()` method (lines 898-911):

```javascript
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
  const toolCenterpoint = this.container.querySelector('#toolCenterpoint');

  if (toolBrush) toolBrush.classList.toggle('active', tool === 'brush');
  if (toolEraser) toolEraser.classList.toggle('active', tool === 'eraser');
  if (toolCenterpoint) toolCenterpoint.classList.toggle('active', tool === 'centerpoint');

  // Show/hide brush size section based on tool
  const brushSizeSection = this.container.querySelector('.brush-size-control')
    ?.closest('.toolbar-section');
  if (brushSizeSection) {
    brushSizeSection.style.display = tool === 'centerpoint' ? 'none' : '';
  }

  // Re-render filament markers (selection highlight may change cursor preview)
  if (this.centerpointEngine) {
    this.centerpointEngine.render();
  }
}
```

### 5g. Event Listeners — Add Centerpoint Tool Button and Filament Controls

In `setupEventListeners()`, after the existing tool button bindings (around line 558), add:

```javascript
// Centerpoint tool button
const toolCenterpoint = this.container.querySelector('#toolCenterpoint');
if (toolCenterpoint) {
  toolCenterpoint.addEventListener('click', () => this.setTool('centerpoint'));
}

// Add filament button
const addFilamentBtn = this.container.querySelector('#addFilamentBtn');
if (addFilamentBtn) {
  addFilamentBtn.addEventListener('click', () => this.addFilament());
}
```

### 5h. Keyboard Shortcut — Add 'C' for Centerpoint

In the `keydownHandler` (around line 533), add after the `'e' || 'E'` case:

```javascript
} else if (e.key === 'c' || e.key === 'C') {
  this.setTool('centerpoint');
```

### 5i. goToSlice() — Re-render Filament Points

In `goToSlice()` (around line 800), after the `brushEngine.renderAnnotations()` call, add:

```javascript
// Re-render filament markers for the new slice
if (this.centerpointEngine) {
  this.centerpointEngine.setSlice(index);
  this.centerpointEngine.render();
}
```

### 5j. New Methods — Filament Management

Add these new methods after the class management methods (after `renderClassList()`, around line 1049):

```javascript
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

  // Re-render canvas to show any updated active state
  if (this.centerpointEngine) {
    this.centerpointEngine.render();
  }
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

  if (this.centerpointEngine) {
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

  if (this.centerpointEngine) {
    this.centerpointEngine.render();
  }
}

/**
 * Render the filament list UI
 */
renderFilamentList() {
  const filamentList = this.container?.querySelector('#filamentList');
  if (!filamentList || !this.filamentManager) return;

  const filaments = this.filamentManager.getAllFilaments();
  const activeId = this.filamentManager.activeFilamentId;

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
      <div class="filament-item ${fil.id === activeId ? 'active' : ''}"
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
```

### 5k. prepareAnnotationData() — Include Filaments

In `prepareAnnotationData()` (around line 1190), add the filaments field to the returned object:

```javascript
return {
  sourceFileId: this.sourceFile?.id || this.sourceFile?.path || 'unknown',
  sourceFileName: this.sourceFile?.name || 'unknown',
  width: this.tiffInfo.width,
  height: this.tiffInfo.height,
  slices: this.tiffInfo.sliceCount,
  sliceData,
  classes: this.brushEngine.getClasses(),
  existingAnnotationId: this.currentAnnotationId,
  // NEW: filament data
  filaments: this.filamentManager
    ? this.filamentManager.toJSON(this.sourceFile?.id || this.sourceFile?.path)
    : null
};
```

### 5l. restoreAnnotation() — Load Filaments

In `restoreAnnotation()` (around line 1340, before the `console.log` at the end), add:

```javascript
// Restore filaments if present
if (annotationData.filaments && this.filamentManager) {
  this.filamentManager.fromJSON(annotationData.filaments);
  this.renderFilamentList();
  if (this.centerpointEngine) {
    this.centerpointEngine.render();
  }
}
```

### 5m. updateSaveButtonState() — Account for Filaments

Modify `updateSaveButtonState()` to also check filament data:

```javascript
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
```

### 5n. deactivate() — Clean Up New Components

In `deactivate()` (around line 1855), add cleanup before the BrushEngine cleanup:

```javascript
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
```

And reset the tool state:

```javascript
this.activeTool = 'brush';
```

---

## Step 6: Modify AnnotationAPI.js — Add Filaments to Requests

**File:** `public/workspace/js/modules/annotation/AnnotationAPI.js`

**Changes:** The existing `saveProgress()` and `createAnnotation()` methods already pass the entire `data` object as JSON body via `JSON.stringify(data)`. Since we added `filaments` to the `prepareAnnotationData()` return value (Step 5k), no changes are needed to these methods — the filaments field will be included automatically.

For `loadAnnotation()`, the response handling also needs no client-side changes — it returns the full JSON object from the server. The server will now include a `filaments` field in the response (Step 7), and `restoreAnnotation()` (Step 5l) already reads it.

**However**, for clarity and documentation purposes, update the JSDoc comments in `saveProgress()` and `createAnnotation()` to reflect the new field:

```javascript
/**
 * @param {object} data.filaments - Filament data (optional, from FilamentManager.toJSON())
 */
```

This is a documentation-only change. No functional code modifications needed in this file.

---

## Step 7: Modify annotation.routes.js — Backend Filaments Support

**File:** `src/routes/annotation.routes.js`

Three endpoints need changes: save-progress, create, and load.

### 7a. POST /api/annotation/save-progress

In the request body destructuring (around line 163), add `filaments`:

```javascript
const {
  sourceFileId,
  sourceFileName,
  width,
  height,
  slices,
  sliceData,
  classes,
  existingAnnotationId,
  filaments          // NEW
} = req.body;
```

After the sidecar JSON is written (around line 291), add filaments sidecar writing:

```javascript
// Write filaments sidecar if present
let filamentsSidecarPath = null;
let filamentsSidecarFilename = null;

if (filaments && filaments.filaments && filaments.filaments.length > 0) {
  filamentsSidecarFilename = existingFile
    ? tiffFilename.replace('.tif', '_filaments.json')
    : sidecarFilename.replace('_classes.json', '_filaments.json');
  filamentsSidecarPath = path.join(
    path.dirname(sidecarPath),
    filamentsSidecarFilename
  );
  fs.writeFileSync(filamentsSidecarPath, JSON.stringify(filaments, null, 2));
}
```

In the metadata update section, add the filaments sidecar to metadata (alongside the existing sidecar registration). This should go in both the "existing file" and "new file" branches:

For new files (in the block that pushes to `metadata.files`, after the existing sidecar push):

```javascript
// Add filaments sidecar file if present
if (filamentsSidecarPath && filamentsSidecarFilename) {
  // Check if it already exists in metadata
  const existingFilamentsEntry = metadata.files.find(
    f => f.id === `${fileId}_filaments`
  );
  if (existingFilamentsEntry) {
    existingFilamentsEntry.size = fs.statSync(filamentsSidecarPath).size;
    existingFilamentsEntry.lastModifiedAt = new Date().toISOString();
  } else {
    metadata.files.push({
      id: `${fileId}_filaments`,
      name: filamentsSidecarFilename,
      path: path.join(
        existingFile ? path.dirname(existingFile.path) : DIRECTORIES.unfinishedAnnotations,
        filamentsSidecarFilename
      ),
      category: 'results',
      tags: ['annotation', 'filaments'],
      uploadedAt: new Date().toISOString(),
      size: fs.statSync(filamentsSidecarPath).size,
      parentId: fileId
    });
  }
}
```

### 7b. POST /api/annotation/create

Same pattern as save-progress. Destructure `filaments` from request body, write the filaments JSON sidecar alongside the classes sidecar, and register it in metadata with `parentId` pointing to the annotation TIFF.

### 7c. GET /api/annotation/load/:fileId

After loading the classes sidecar (around line 643-655), add filaments loading:

```javascript
// Find filaments sidecar JSON
let filamentsData = null;
const filamentsFile = metadata.files.find(
  f => f.parentId === fileId && f.tags && f.tags.includes('filaments')
);

if (filamentsFile) {
  const filamentsPath = path.join(workspacePath, filamentsFile.path);
  if (fs.existsSync(filamentsPath)) {
    try {
      filamentsData = JSON.parse(fs.readFileSync(filamentsPath, 'utf8'));
    } catch (e) {
      if (logger) logger.warn('[Annotation] Failed to read filaments sidecar:', e.message);
    }
  }
}
```

Then include it in the response object (around line 701):

```javascript
const result = {
  success: true,
  fileId,
  sourceFileId: sidecarData?.sourceFileId || file.lineage?.inputs?.[0] || null,
  sourceFileName: sidecarData?.sourceFileName || null,
  classes: sidecarData?.classes || [],
  width: tiffData.width,
  height: tiffData.height,
  slices: tiffData.slices,
  sliceData: tiffData.sliceData,
  annotatedSlices: tiffData.annotatedSlices,
  status: sidecarData?.status || file.lineage?.status || 'unknown',
  createdAt: sidecarData?.createdAt || file.uploadedAt,
  lastModifiedAt: sidecarData?.lastModifiedAt || file.uploadedAt,
  filaments: filamentsData || null    // NEW
};
```

---

## Step 8: Modify annotation.css — Filament Section Styles

**File:** `public/workspace/js/modules/annotation/css/annotation.css`

Add at the end of the file, before the responsive adjustments section:

```css
/* ============================================
   FILAMENT LIST
   ============================================ */

.annotation-module .filaments-section {
  display: flex;
  flex-direction: column;
}

.annotation-module .filaments-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--module-spacing-xs);
}

.annotation-module .filaments-header h4 {
  margin: 0;
  border-bottom: none;
  padding-bottom: 0;
}

.annotation-module .filament-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.annotation-module .filament-empty-state {
  font-size: var(--module-font-size-xs);
  color: var(--module-text-secondary);
  text-align: center;
  padding: var(--module-spacing-sm);
  opacity: 0.6;
}

.annotation-module .filament-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--module-bg);
  border: 1px solid var(--module-border);
  border-radius: var(--module-radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.annotation-module .filament-item:hover {
  border-color: var(--module-text-secondary);
}

.annotation-module .filament-item.active {
  border-color: var(--module-primary);
  background: var(--module-primary-light);
}

.annotation-module .filament-color {
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--module-border);
  flex-shrink: 0;
  pointer-events: none;
}

.annotation-module .filament-item.active .filament-color {
  box-shadow: 0 0 0 2px var(--module-primary);
}

.annotation-module .filament-name {
  flex: 1;
  font-size: var(--module-font-size-xs);
  color: var(--module-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.annotation-module .filament-count {
  font-size: 10px;
  font-family: monospace;
  color: var(--module-text-secondary);
  background: var(--module-border);
  border-radius: 8px;
  padding: 1px 5px;
  min-width: 18px;
  text-align: center;
}

.annotation-module .filament-item.active .filament-count {
  background: var(--module-primary);
  color: white;
}

.annotation-module .filament-delete {
  width: 20px;
  height: 20px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  opacity: 0.6;
  color: var(--module-error-text);
  transition: all 0.15s ease;
}

.annotation-module .filament-delete:hover {
  opacity: 1;
  background: var(--module-error-bg);
}

/* ============================================
   CENTERPOINT TOOL BUTTON ADJUSTMENTS
   ============================================ */

/* Ensure 3 tool buttons fit properly in the row */
.annotation-module .tool-buttons {
  display: flex;
  gap: var(--module-spacing-xs);
  flex-wrap: wrap;
}
```

**Design notes:**
- Filament items mirror the `.class-item` pattern but use a circular color swatch (`.filament-color` has `border-radius: 50%`) instead of the square class swatch, visually differentiating the two lists.
- The `.filament-count` badge uses a pill shape with monospace font, matching the app's aesthetic for numeric indicators.
- `max-height: 200px` with `overflow-y: auto` on `.filament-list` prevents the toolbar from growing unboundedly if many filaments are added.

---

## Summary of All Changes

| Step | File | Action | Lines Changed (Approx) |
|------|------|--------|----------------------|
| 1 | `utils/FilamentManager.js` | NEW FILE | ~250 lines |
| 2 | `utils/AnnotationCanvas.js` | MODIFY (add filament canvas layer) | ~15 lines added |
| 3 | `utils/CenterpointEngine.js` | NEW FILE | ~280 lines |
| 4 | `utils/BrushEngine.js` | MODIFY (add enabled flag + guards) | ~20 lines added |
| 5 | `AnnotationModule.js` | MODIFY (UI, tool switching, save/load, filament mgmt) | ~200 lines added |
| 6 | `AnnotationAPI.js` | MODIFY (JSDoc only, no functional changes) | ~3 lines |
| 7 | `annotation.routes.js` | MODIFY (save/load filaments sidecar) | ~60 lines added |
| 8 | `css/annotation.css` | MODIFY (filament section styles) | ~120 lines added |

---

## Data Format: _filaments.json Sidecar

```json
{
  "version": "1.0.0",
  "sourceFileId": "file_abc123",
  "filaments": [
    {
      "id": 1,
      "name": "MT-1",
      "color": "#00BFFF",
      "classId": 1,
      "points": {
        "0": { "x": 256.5, "y": 128.3 },
        "1": { "x": 257.1, "y": 129.0 },
        "3": { "x": 258.0, "y": 130.5 }
      }
    },
    {
      "id": 2,
      "name": "MT-2",
      "color": "#FF4500",
      "classId": 1,
      "points": {
        "0": { "x": 100.0, "y": 200.0 }
      }
    }
  ]
}
```

---

## Rendering Specification

| Element | Size | Color | Opacity | Border |
|---------|------|-------|---------|--------|
| Active marker | radius 6px | filament color | 1.0 | 2px white |
| Active highlight ring | radius 10px | filament color | 0.4 | 2px stroke |
| Inactive marker | radius 4px | filament color | 0.7 | 1px white |
| Ghost marker (z+/-1) | radius 5px | filament color | 0.4 | 1px dashed |
| Ghost label | 8px monospace | filament color | 0.5 | — |
| Connecting line | — | filament color | 0.25 | 1px dashed |
| Cursor crosshair | 8px arms | filament color | 0.8 | 1px stroke |

---

## Verification Criteria

1. Can add filaments — `addFilament()` calls `FilamentManager.addFilament()` with active class ID. Auto-names MT-1, MT-2 etc.
2. Can select filament — Click on `.filament-item` calls `selectFilament()`. Active state highlighted via `.active` CSS class.
3. Can delete filament — Click delete button with confirmation if points exist.
4. Click places point — `CenterpointEngine.handlePointerDown()` with button=0 calls `filamentManager.setPoint()`.
5. Click again repositions — `setPoint()` overwrites the existing entry for that slice.
6. Right-click deletes — `CenterpointEngine._handleRightClick()` does `hitTest()` then `removePoint()`.
7. Points visible in all modes — `CenterpointEngine.render()` is called from `goToSlice()` and on filament state change. The filament canvas is always visible (pointer-events: none, no hide/show logic).
8. Ghost markers — `_renderGhostMarkers()` checks z-1 and z+1 for active filament.
9. Save includes filaments — `prepareAnnotationData()` includes `filaments` field. Backend writes `_filaments.json` sidecar.
10. Load restores filaments — Backend returns `filaments` in response. `restoreAnnotation()` calls `fromJSON()`.
11. Autosave includes filaments — `performAutosave()` calls `saveProgress()` which calls `prepareAnnotationData()`, which includes filaments.
12. Slice switching re-renders — `goToSlice()` calls `centerpointEngine.setSlice()` and `render()`.
13. Zoom/pan works — Filament canvas is inside `transformContainer`, inherits CSS transform.
14. Keyboard shortcut C — Added in `keydownHandler`.
15. Brush size hidden for centerpoint — `setTool('centerpoint')` hides the brush size section via `style.display = 'none'`.

---

## Architecture Decisions

- **Separate canvas layer** rather than drawing on annotation canvas: Filament markers must be always visible and anti-aliased, while annotation canvas uses pixel-perfect `ImageData` manipulation. Mixing these would require complex render ordering.
- **Sidecar JSON file** rather than embedding in TIFF: Filament data is sparse point coordinates, not pixel masks. JSON is the natural format and avoids modifying the TIFF write pipeline.
- **No undo/redo for MVP**: Click-to-reposition and right-click-to-delete provide sufficient correction ability. Undo/redo can be added in a future phase if needed.
- **FilamentManager as pure data class**: Separating data management from rendering keeps the code testable and allows future reuse (e.g., if filament data needs to be consumed by the loss function pipeline).
- **Event-driven updates**: `onChange` callback + explicit `render()` calls rather than automatic re-rendering on every state change. This gives the module layer control over when and how updates propagate.
