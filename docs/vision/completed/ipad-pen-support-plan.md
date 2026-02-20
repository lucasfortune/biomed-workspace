# iPad Pen Support for Annotation Module

## Context

The annotation module currently uses **only mouse events** (`mousedown`, `mousemove`, `mouseup`, `mouseleave`). On iPad/touch devices, pen and finger input generates pointer/touch events, not mouse events. This means drawing doesn't work and the default browser behavior (panning/scrolling) kicks in.

**Goal:** Pen AND single finger both draw. Two-finger gestures pan/zoom. Mouse behavior unchanged.

## Strategy: Migrate from Mouse Events to Pointer Events

The Pointer Events API unifies mouse, touch, and pen input. Using `pointerType` and tracking active pointer count lets us route input correctly.

### Input Routing Rules

| Input | Action |
|-------|--------|
| Mouse left-click drag | Draw (existing) |
| Mouse right/middle-click drag | Pan (existing) |
| Mouse wheel | Zoom (existing) |
| Space + any | Pan mode (existing) |
| Apple Pencil / Stylus | Draw |
| Single finger drag | Draw |
| Two-finger drag | Pan |
| Two-finger pinch | Zoom |

### Key Design: Single-to-Multi-Finger Transition

When a single finger touches, drawing starts. If a second finger arrives:
1. Cancel/undo the current stroke (it was likely unintentional)
2. Switch to pan/zoom mode
3. When all fingers lift, return to normal mode

## Files to Modify

1. **`public/workspace/js/modules/annotation/utils/AnnotationCanvas.js`** - Pan/zoom event handlers
2. **`public/workspace/js/modules/annotation/utils/BrushEngine.js`** - Drawing event handlers

## Phase 1: AnnotationCanvas.js - Pointer Events + Two-Finger Pan/Zoom

### 1a. Add state tracking (constructor, ~line 38-49)
Add new properties:
```javascript
this.activePointers = new Map();  // pointerId -> {x, y, type}
this.lastPinchDistance = 0;
this.lastPinchCenter = null;
this.isTwoFingerGesture = false;
```

### 1b. Rename and bind handlers (constructor, ~line 68-75)
- `handleMouseDown` → `handlePointerDown`
- `handleMouseMove` → `handlePointerMove`
- `handleMouseUp` → `handlePointerUp`
- Add `handlePointerCancel` (bound)

### 1c. Add `touch-action: none` CSS (in `createDOM()`)
On the **viewport** element (~line 108) and **interaction layer** (~line 162), add `touch-action: none;` to prevent browser default touch gestures.

### 1d. Replace event listeners (`attachEventListeners()`, ~line 187)
```
mousedown → pointerdown (on viewport)
mousemove → pointermove (on window)
mouseup   → pointerup (on window)
+ pointercancel (on window)
```
Keep: `wheel`, `keydown`, `keyup`, `contextmenu` unchanged.

### 1e. Update detach (`detachEventListeners()`, ~line 207)
Mirror the attachment changes.

### 1f. Rewrite `handlePointerDown` (~line 497)
- Track pointer in `activePointers` map
- If 2+ touch pointers → set `isTwoFingerGesture = true`, start pan, notify BrushEngine to cancel stroke via callback `this.onTwoFingerStart?.()`
- Mouse: existing logic (right/middle/space → pan)
- Pen/single touch: don't pan (BrushEngine handles drawing)

### 1g. Rewrite `handlePointerMove` (~line 510)
- If `isTwoFingerGesture` and 2 pointers active:
  - Calculate distance between pointers → pinch zoom
  - Calculate center delta → pan
- Otherwise: existing coordinate tracking behavior

### 1h. Rewrite `handlePointerUp` (~line 535)
- Remove pointer from `activePointers`
- If fewer than 2 touch pointers → end two-finger gesture, reset pinch state
- End panning if applicable

### 1i. Add `handlePointerCancel`
- Same cleanup as `handlePointerUp` (handles interrupted gestures)

## Phase 2: BrushEngine.js - Pointer Events for Drawing

### 2a. Rename and bind handlers (constructor, ~line 88-91)
- `handleMouseDown` → `handlePointerDown`
- `handleMouseMove` → `handlePointerMove`
- `handleMouseUp` → `handlePointerUp`
- `handleMouseLeave` → `handlePointerLeave`

### 2b. Replace event listeners (`attachEventListeners()`, ~line 116)
```
mousedown  → pointerdown (on canvasArea)
mousemove  → pointermove (on window)
mouseup    → pointerup (on window)
mouseleave → pointerleave (on canvasArea)
+ pointercancel (on window)
```

### 2c. Update detach (`detachEventListeners()`, ~line 139)
Mirror the attachment changes.

### 2d. Rewrite `handlePointerDown` (~line 223)
- Track the active drawing `pointerId` (store as `this.drawingPointerId`)
- For mouse: require `button === 0` (existing check)
- For pen/touch: always accept
- If `canvas.isTwoFingerGesture` → reject (two fingers active)
- Keep space/pan-mode check
- Call `canvasArea.setPointerCapture(e.pointerId)` for reliable tracking

### 2e. Rewrite `handlePointerMove` (~line 245)
- Only process events matching `this.drawingPointerId` (ignore other pointers)
- If `canvas.isTwoFingerGesture` → skip drawing, clear preview
- Keep existing stroke continuation + preview logic

### 2f. Rewrite `handlePointerUp` (~line 272)
- Only process if `e.pointerId === this.drawingPointerId`
- Release pointer capture
- Reset `drawingPointerId`
- Keep existing `endStroke()` logic

### 2g. Rewrite `handlePointerLeave` (~line 284)
- Same logic as before, just pointer event type

### 2h. Add `cancelCurrentStroke()` method
- Called by AnnotationCanvas via `onTwoFingerStart` callback when second finger arrives
- If `isDrawing`: call `endStroke()`, undo the partial stroke via `onStrokeCancel?.()` callback
- Clear preview, reset drawing state

### 2i. Wire up the two-finger cancellation
In AnnotationModule.js (or wherever BrushEngine + AnnotationCanvas are connected):
- Set `annotationCanvas.onTwoFingerStart = () => brushEngine.cancelCurrentStroke()`

## Testing

### Manual Testing Steps

**Phase 1 test (after AnnotationCanvas changes):**
1. Desktop: right-click pan works, wheel zoom works, space+drag pans
2. Touch device: two-finger drag pans, pinch zooms

**Phase 2 test (after BrushEngine changes):**
1. Desktop: left-click draws, brush preview shows, undo/redo works
2. iPad/touch: single finger draws, stylus draws
3. iPad/touch: start drawing with one finger → add second finger → stroke cancels, panning starts
4. iPad/touch: lift both fingers → single finger draws again
