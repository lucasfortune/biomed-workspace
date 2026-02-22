# Phase 1: Filament Centerpoint Annotation Tooling

**Date:** 2026-02-22
**Phase:** Directional Segmentation - Phase 1
**Duration:** ~3 hours
**Status:** ✅ Complete
**Complexity:** Architectural

---

## Goals

**Primary Objectives:**
- [x] Implement FilamentManager for filament data CRUD
- [x] Implement CenterpointEngine for marker rendering and pointer interaction
- [x] Add filament canvas layer to AnnotationCanvas
- [x] Add BrushEngine enable/disable guards for tool switching
- [x] Integrate filament UI into AnnotationModule (toolbar, list, save/load)
- [x] Add backend sidecar persistence for filaments JSON
- [x] Add filament list CSS styles

**Secondary Objectives:**
- [x] Fix UX: automatic tool switching (no manual centerpoint button)
- [x] Fix UX: single highlight across class and filament lists
- [x] Fix UX: single-pixel markers with crisp rendering
- [x] Fix layout: class list visibility in toolbar

---

## Summary

**Accomplished:**
- ✅ Full Phase 1 implementation of centerpoint annotation tooling
- ✅ Saved directional segmentation vision docs (5 documents)
- ✅ Reorganized old vision docs into `completed/` subdirectory
- ✅ Fixed 4 UX issues identified during testing

**Key Design Decisions:**
- Tool switching is automatic: selecting a class activates brush, selecting a filament activates centerpoint
- Markers are exactly 1 pixel with `image-rendering: pixelated` for crisp edges at any zoom
- Hover preview shows the exact pixel that would be marked before clicking
- Only one item highlighted across both class and filament lists at any time
- Filaments stored as `_filaments.json` sidecar alongside `_classes.json`

---

## Detailed Log

### Task 1: Save Phase 1 Implementation Plan ✅

**Problem:** Extract and save the detailed implementation plan from a previous planning session.

**Solution:** Read the plan transcript JSONL, extracted the full plan, wrote it to `docs/vision/05_phase1_centerpoint_annotation.md` (1,696 lines). Also saved 4 other vision documents and reorganized old plans into `docs/vision/completed/`.

**Files Changed:**
- `docs/vision/01_overall_idea_and_planning.md` - NEW
- `docs/vision/02_annotation_pipeline.md` - NEW
- `docs/vision/03_loss_function_design.md` - NEW
- `docs/vision/04_implementation_roadmap.md` - NEW
- `docs/vision/05_phase1_centerpoint_annotation.md` - NEW (1,696 lines)
- `docs/vision/completed/fix_three_open_issues_plan.md` - MOVED
- `docs/vision/completed/user-guides-plan.md` - MOVED

---

### Task 2: Implement Phase 1 (8 Steps) ✅

**Problem:** Implement the full centerpoint annotation system per the plan specification.

**Solution:** Implemented all 8 steps:

1. **FilamentManager.js** (323 lines) - Pure data manager for filament CRUD, point management, hit-testing, serialization. 10-color palette, auto-naming (MT-1, MT-2...), onChange callback.
2. **AnnotationCanvas.js** - Added filament canvas layer between annotation and preview canvases with `pointer-events: none`.
3. **CenterpointEngine.js** (279 lines) - Pointer events (left-click place, right-click delete), single-pixel marker rendering, ghost markers for z-1/z+1 with connecting lines.
4. **BrushEngine.js** - Added `enabled` flag with `enable()`/`disable()` methods and guards on all pointer handlers.
5. **AnnotationModule.js** (+395 lines) - Imports, constructor, UI sections, tool switching, filament management methods, save/load integration, cleanup.
6. **AnnotationAPI.js** - JSDoc updates for filaments parameter.
7. **annotation.routes.js** (+308 lines) - Backend sidecar persistence for `_filaments.json`, direction volume generation via Python script, metadata registration.
8. **annotation.css** (+126 lines) - Filament list styles, section headers, item layout.

**Files Changed:**
- `public/workspace/js/modules/annotation/utils/FilamentManager.js` - NEW (323 lines)
- `public/workspace/js/modules/annotation/utils/CenterpointEngine.js` - NEW (279 lines)
- `public/workspace/js/modules/annotation/utils/AnnotationCanvas.js` - Modified (+60 lines)
- `public/workspace/js/modules/annotation/utils/BrushEngine.js` - Modified (+27 lines)
- `public/workspace/js/modules/annotation/AnnotationModule.js` - Modified (+395 lines)
- `public/workspace/js/modules/annotation/AnnotationAPI.js` - Modified (+2 lines)
- `public/workspace/js/modules/annotation/css/annotation.css` - Modified (+126 lines)
- `src/routes/annotation.routes.js` - Modified (+308 lines)

---

### Task 3: Fix Automatic Tool Switching ✅

**Problem:** User didn't want a separate "Center" tool button. Tool switching should be automatic based on what's selected (class vs filament).

**Solution:**
- Removed centerpoint button from toolbar HTML
- Removed `C` keyboard shortcut
- Removed centerpoint button event listener
- `selectClass()` auto-switches to brush if in centerpoint mode
- `selectFilament()` auto-switches to centerpoint mode
- `addFilament()` auto-switches to centerpoint (new filament is auto-selected)
- `deleteFilament()` switches back to brush if no filaments remain

**Files Changed:**
- `public/workspace/js/modules/annotation/AnnotationModule.js` - Removed button, added auto-switching
- `public/workspace/js/modules/annotation/css/annotation.css` - Removed 3-button layout CSS

---

### Task 4: Fix Class List Visibility ✅

**Problem:** Class list section collapsed to zero height because `flex: 1; min-height: 0` made it shrink to nothing when competing with other toolbar sections.

**Solution:**
- Removed `flex: 1; min-height: 0` from `.classes-section`
- Replaced `flex: 1` on `.class-list` with `max-height: 200px` (consistent with filament list)
- Toolbar scrolls via its own `overflow-y: auto` when sections exceed available space

**Files Changed:**
- `public/workspace/js/modules/annotation/css/annotation.css` - Layout fix

---

### Task 5: Fix Single Highlight Across Lists ✅

**Problem:** Both the class list and filament list showed an active highlight simultaneously, which was confusing since only one represents the current action.

**Solution:**
- `selectClass()` deselects the active filament (`setActiveFilament(null)`) and re-renders filament list
- `selectFilament()` re-renders class list to remove its highlight
- `renderClassList()` only shows highlight when tool is brush/eraser
- `renderFilamentList()` only shows highlight when tool is centerpoint
- `setTool()` re-renders both lists on any tool change (including B/E keyboard shortcuts)

**Files Changed:**
- `public/workspace/js/modules/annotation/AnnotationModule.js` - Selection exclusivity logic

---

### Task 6: Fix Marker Rendering ✅

**Problem:** Centerpoint markers were too large (6px circles with highlight rings), cursor preview was an unnecessary crosshair, and markers had blurry edges.

**Solution (3 iterations):**
1. Reduced markers to single pixel (`fillRect(x, y, 1, 1)`), removed cursor preview crosshair
2. Added hover preview back (single colored pixel on preview canvas), set all markers to 100% opacity, switched to `Math.floor` for exact pixel alignment
3. Added `image-rendering: pixelated` CSS to filament canvas (was missing, causing bilinear interpolation blur at zoom)

**Files Changed:**
- `public/workspace/js/modules/annotation/utils/CenterpointEngine.js` - Complete rewrite of rendering
- `public/workspace/js/modules/annotation/utils/AnnotationCanvas.js` - Added `image-rendering: pixelated`

---

## Code Changes Summary

### New Files (+7)
- `docs/vision/01_overall_idea_and_planning.md` (68 lines) - Overall direction-aware segmentation idea
- `docs/vision/02_annotation_pipeline.md` (110 lines) - Annotation pipeline design
- `docs/vision/03_loss_function_design.md` (163 lines) - Loss function for directional training
- `docs/vision/04_implementation_roadmap.md` (709 lines) - Multi-phase implementation roadmap
- `docs/vision/05_phase1_centerpoint_annotation.md` (1,696 lines) - Detailed Phase 1 spec
- `public/workspace/js/modules/annotation/utils/FilamentManager.js` (323 lines) - Filament data management
- `public/workspace/js/modules/annotation/utils/CenterpointEngine.js` (279 lines) - Pointer handling and rendering

### Modified Files (8 changes)
- `public/workspace/js/modules/annotation/AnnotationModule.js` - Filament integration, auto tool switching, single highlight
- `public/workspace/js/modules/annotation/AnnotationAPI.js` - JSDoc for filaments param
- `public/workspace/js/modules/annotation/css/annotation.css` - Filament list styles, layout fixes
- `public/workspace/js/modules/annotation/utils/AnnotationCanvas.js` - Filament canvas layer, pixelated rendering
- `public/workspace/js/modules/annotation/utils/BrushEngine.js` - Enable/disable guards
- `src/routes/annotation.routes.js` - Filaments sidecar persistence, direction volume generation
- `docs/vision/fix_three_open_issues_plan.md` - Moved to completed/
- `docs/vision/user-guides-plan.md` - Moved to completed/

### Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 17 files |
| Lines Added | +4,252 |
| Lines Removed | -82 |
| Commits | 1 |

---

## Lessons Learned

### Technical Insights
1. **`image-rendering: pixelated`** is essential for any canvas that displays single-pixel markers inside a CSS-transformed container. Without it, the browser uses bilinear interpolation when zooming, making 1px markers blurry.
2. **`imageSmoothingEnabled`** on canvas context only affects `drawImage()` and pattern fills -- it does not affect `fillRect()`. The CSS `image-rendering` property controls how the browser scales the canvas element itself.

### Design Decisions
1. **Automatic tool switching** instead of manual tool buttons. Rationale: the active tool is always determined by what's selected (class = painting, filament = centerpoint). A manual button adds cognitive overhead.
2. **Single-pixel markers** instead of circles. Rationale: centerpoints mark exact pixel positions. A circle obscures the data and misrepresents precision.
3. **Exclusive highlight** across class and filament lists. Rationale: only one action can happen on click, so only one item should appear selected.

---

## Known Issues

### Issues Created
- **Filaments help article needed** - Filaments section needs a help/info article and "?" icon similar to other toolbar sections
  - **Impact:** Low
  - **Tracked in:** docs/dev/BUGS_ISSUES.md

---

## Next Steps

**Immediate Follow-up:**
1. [ ] Test filament save/load with actual TIFF data
2. [ ] Test direction volume generation end-to-end
3. [ ] Add filaments help article to info panel

**Future Work (Phase 2+):**
1. [ ] Direction-aware loss function integration
2. [ ] Training pipeline modifications for directional data
3. [ ] Validation and visualization of direction volumes

---

## Related Documentation

**Created:**
- [Phase 1 Centerpoint Spec](../vision/05_phase1_centerpoint_annotation.md) - Detailed implementation spec
- [Implementation Roadmap](../vision/04_implementation_roadmap.md) - Multi-phase plan

**Architecture Decisions:**
- Automatic tool switching (no manual centerpoint button)
- Single-pixel markers with pixelated rendering
- Sidecar JSON pattern for filament persistence

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Feature
**Phase Status After Session:** On Track
