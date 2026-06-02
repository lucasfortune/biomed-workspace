# Annotation Module — Out-of-Order / Stale Slice Loading Race Fix

**Date:** 2026-06-02
**Phase:** Phase 4 - Polish & Bug Fixes
**Duration:** ~1 hour
**Status:** ✅ Complete
**Complexity:** Medium

---

## 🎯 Goals

Fix the intermittent, hard-to-reproduce annotation-module bug where navigating
between slices sometimes loads the wrong slice, fails to load a new slice at all,
or appears to "reload the previous image."

**Primary Objectives:**
- [ ] Identify the root cause of the out-of-order / stale slice loading
- [ ] Make slice loading race-safe (latest-wins) without regressing normal navigation
- [ ] Protect annotation data integrity (strokes must never bind to the wrong slice)

---

## 📝 Summary

**Accomplished:**
- ✅ Identified the root cause: a shared `<img>` element + unsequenced async handlers
- ✅ Made slice loading latest-wins at the canvas level (fresh `Image()` per request + load token)
- ✅ Serialized concurrent navigations at the module level (navigation token)
- ✅ Protected annotation data integrity — stale loads can no longer overwrite `currentSliceIndex`
- ✅ User-confirmed: rapid arrow-key / button navigation now always settles on the correct slice

**Key Findings:**
- `AnnotationCanvas.loadSlice()` reused a **single shared `<img>`** (`this.sourceImage`),
  reassigning its `onload`/`onerror` handlers and `.src` on every call.
- When two loads overlap (arrow-key auto-repeat, double-click ◀/▶, slow network), the
  handlers clobber each other:
  - The earlier request's `onload` is overwritten → its Promise never resolves →
    `goToSlice()` hangs with the loading overlay and `currentSlice` never advances
    ("progressing reloads the previous image / doesn't load").
  - Reassigning `.src` to a browser-cached value can fail to refire `onload`, hanging
    the same way.
  - Whichever load wins writes `canvas.currentSliceIndex`, which is the **source of truth**
    the `BrushEngine` uses to key annotations (`getAnnotationData()` reads
    `canvas.currentSlice`). A stale winner desyncs the displayed image from the annotation
    layer → wrong slice / strokes saved to the wrong slice ("out of order").
- `goToSlice()` read `this.currentSlice` (only updated *after* the await), so concurrent
  navigations were not serialized.

---

## 📋 Detailed Log

### Task 1: Make slice loading race-safe ⏳

**Problem:**
Overlapping slice loads corrupt navigation state and can bind annotations to the wrong
slice, because a single shared `<img>` element and unsequenced async handlers are reused
across requests.

**Investigation:**
- Traced slice navigation: `AnnotationModule.goToSlice()` → `AnnotationCanvas.loadSlice()`.
- Found shared `this.sourceImage` (created once at `AnnotationCanvas.js:137`) whose
  `onload`/`onerror`/`.src` are reassigned per call (`loadSlice`, ~line 241).
- Confirmed `BrushEngine.getAnnotationData()` keys the annotation `Map` by
  `this.canvas.currentSlice` (`BrushEngine.js:587`), so a stale `currentSliceIndex` is a
  data-integrity hazard, not just a display glitch.

**Solution:**
- **`AnnotationCanvas.loadSlice()`**: replaced the reused shared `this.sourceImage`
  handlers with a **fresh `Image()` per request** plus a monotonic `this.loadToken`.
  Only the most recent request promotes its (now-cached) result to the displayed
  `sourceImage` and updates `currentSliceIndex`/state; superseded requests resolve
  silently without mutating display or state. This also avoids the case where
  reassigning a cached `.src` never refires `onload` (which previously hung the load).
- **`AnnotationModule.goToSlice()`**: added a `this.sliceNavToken`. Only the latest
  navigation runs post-load processing (currentSlice update, annotation re-render,
  history buttons) and owns the loading overlay; stale awaits bail out early.

**Result:**
Overlapping slice loads (arrow-key auto-repeat, double-clicking ◀/▶, slow network) can
no longer hang the loading overlay, strand the user on the previous slice, or desync
`currentSliceIndex` from the displayed image. Navigation always settles on the correct
final slice with the matching annotation layer. User-confirmed on the dev server.

**Files Changed:**
- `public/workspace/js/modules/annotation/utils/AnnotationCanvas.js` — latest-wins load token + fresh Image() per request
- `public/workspace/js/modules/annotation/AnnotationModule.js` — navigation token serialization in `goToSlice()`

---

## 💻 Code Changes Summary

### Modified Files (2)
- 📝 `public/workspace/js/modules/annotation/utils/AnnotationCanvas.js` — Added `loadToken`; rewrote `loadSlice()` to use a fresh `Image()` per request with latest-wins semantics (+40/-7)
- 📝 `public/workspace/js/modules/annotation/AnnotationModule.js` — Added `sliceNavToken`; `goToSlice()` now serializes concurrent navigations (+16/-1)

---

## 💡 Lessons Learned

### Technical Insights
1. **Shared mutable DOM objects + async = races.** Reusing a single `<img>` and
   reassigning its `onload`/`.src` per request is fine only if loads never overlap.
   Once they can (auto-repeat keys, fast clicks, slow network), handlers clobber each
   other and earlier promises silently never resolve.
2. **`currentSliceIndex` was a hidden source of truth.** Because `BrushEngine` keys its
   annotation `Map` by `canvas.currentSlice`, a slice-load race was not just a display
   glitch but a data-integrity hazard — strokes could bind to the wrong slice.
3. **Token / latest-wins is the cheap, robust pattern** for "only the most recent async
   request should win" without needing AbortController plumbing.

---

## 🚧 Known Issues

### Issues Resolved
- **Annotation out-of-order / stale slice loading** - ✅ Fixed _(confirm at end)_

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 2 |
| Lines Added | +49 |
| Lines Removed | -7 |
| Commits | 1 |
| Issues Closed | 1 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Bug Fix
**Phase Status After Session:** On Track
