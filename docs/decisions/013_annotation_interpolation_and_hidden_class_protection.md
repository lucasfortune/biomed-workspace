# ADR-013: Annotation Slice Interpolation and Hidden-Class Protection

**Status:** Accepted, implemented and browser-tested by Lucas (2026-09-29);
class lock added the same day (decision 6)
**Context:** Lucas (2026-09-29): "i want it to be possible to only annotate
every x slice and interpolate between slices per class" and "if i am
annotating and i have one class set to not being visible, i should not be
able to paint over the area of one class with another class". The first is
the larger feature; the second is a one-rule change to the brush engine.

## Decision

### 1. Interpolation is per class, between the slices the class is already on

The user does not enter "every x slices". The module treats every slice on
which the chosen class has at least one pixel as a **keyframe** and fills
the gaps between neighbouring keyframes. This is what ITK-SNAP ("Interpolate
labels") and 3D Slicer ("Fill between slices") do, and it has two
advantages over a fixed stride: the user can annotate densely where the
shape changes fast and sparsely where it does not, and there is no stride
to remember or get wrong. Annotating every 10th slice simply produces
keyframes 10 apart.

**Max gap** (dialog setting, default **10**) is the largest keyframe
distance that still gets connected; wider gaps are listed as skipped. Lucas
works with stacks of ~100 slices and asked for a small default so several
separate occurrences of a class are not bridged into one. Adjacent
keyframes (distance 1) have nothing to fill.

### 2. Algorithm: shape-based interpolation with centroid alignment, client-side

Per gap, the binary masks of the two keyframes are turned into signed
distance fields (positive inside, negative outside; exact Euclidean
transform after Felzenszwalb & Huttenlocher), blended linearly in z and
thresholded at zero (Raya & Udupa 1990, the ITK-SNAP method). Before the
blend the two fields are shifted so the intermediate shape sits on the
linearly interpolated centroid; without this, a structure that drifts
sideways thins out and vanishes mid-gap (covered by a unit test).

It runs **in the browser** (`utils/SliceInterpolator.js`, pure functions,
label arrays in and 0/1 masks out): the annotation state lives in the
browser and is only uploaded on save, the per-slice arrays are already in
memory, and a 400×400 gap of 9 slices takes ~40 ms. The generator API
yields one gap at a time so the module can update the status line
between gaps. A Python route (scipy `distance_transform_edt`) was
considered and rejected: it would need the full annotation map uploaded
and downloaded for every run and adds a second implementation of the
same arithmetic.

Known limits (documented in the help article): splitting, merging,
appearing or ending structures are morphed smoothly, not topologically;
the remedy is an extra keyframe near the event.

### 3. Write policy: only background is filled

Interpolated pixels are written only where the slice is 0. Pixels of other
classes are never overwritten, so the order in which classes are
interpolated does not matter and the rule matches decision 5 (hidden
classes are protected). Gap slices by definition contain no pixel of the
interpolated class, so nothing of that class is replaced either.

### 4. UI: class-row button, dialog, slider marks, keys, revert

- **Entry point** is a layers icon in each class row next to the eye
  (not a right-click menu: the workspace has no context-menu idiom, custom
  context menus fight trackpads and the native menu, and a button is
  discoverable). A context menu can be added later as a second entry.
- **Dialog** (module-local overlay, `annot-dialog-*` classes) shows the
  annotated slices (1-based per ADR-011), the max-gap field, a live plan
  ("3 gaps to fill, 27 slices: 1 → 11 …; skipped: …") and a note on the
  write policy. Enter runs, Escape cancels.
- **Slider marks**: `SliceViewerChrome.setMarks()` (new, shared) draws a
  mark track above the slider. Solid marks in the class colour are the
  active class's keyframes, lighter marks are slices an interpolation
  filled and the user has not painted on since. Clicking a mark navigates.
  Marks are a session hint and are not saved.
- **Keys** `,` and `.` jump to the previous/next keyframe of the active
  class (Shift+arrows would collide with the chrome's arrow handling).
- **Undo**: every filled slice gets a normal per-slice history entry. In
  addition **Revert interpolation** (History section, visible only while a
  run can be reverted) restores every slice of the last run to its
  pre-run content; the restore is itself an undo step on each slice. Only
  the last run is revertable; deleting the class drops it.

Class presence per slice is cached (`classPresence`) and refreshed per
slice on stroke end, undo, redo and interpolation, and in full on load and
class deletion, so marks never rescan the whole stack per stroke.

### 5. Hidden classes are protected from brush and eraser

Before this change the eraser skipped pixels of hidden classes but the
brush did not. Now a stroke builds the set of hidden class IDs once at
stroke start and both tools leave those pixels alone. Painting with a
hidden active class shows the class again first (painting invisibly is
confusing), via a new `onClassesChange` callback that re-renders the
class list. The segcleanup module shares `BrushEngine` and keeps all
classes visible, so its behaviour is unchanged.

### 6. Per-class lock (added after Lucas's test)

Lucas: "give each class a lock icon. locking it will not let a user draw
over it even if it is visible." Each class gets `locked: false` (saved
with the class list; older files load as unlocked). The protected set at
stroke start is now hidden **or** locked classes. Beyond the hidden rule,
a locked class also cannot be painted *with*: the stroke is refused at
start (no history entry) and a 3 s notice explains why, rather than
auto-unlocking, because the lock is a deliberate guard and silently
lifting it would defeat it. Interpolating a locked class is refused the
same way. Visibility and lock are independent: hide to see the image
underneath, lock to keep a finished structure safe while it stays
visible. The segcleanup module builds its class list without the field,
so nothing changes there.

### 7. Editing conveniences (same day, Lucas picked from a proposed list)

Accepted: fill tool, class rename and colour, overlay opacity with a
peek key, quick class switching, batch show/hide and lock/unlock.
Declined for now: copy from previous slice. Not yet proposed as work:
polygon, magic wand, in-viewer contrast.

- **Fill** lives in `BrushEngine` (`floodFill`, tool `'fill'`, key F)
  rather than in the module as in segcleanup, so the protection rules
  and the stroke callbacks (history snapshot, dirty flag, presence
  refresh) apply unchanged. Scanline 4-connected fill of the clicked
  value; a hidden or locked target region is left alone; a locked active
  class is refused like a stroke. Segcleanup keeps its own copy for now.
- **Eyedropper**: Alt+click with any tool picks the class under the
  cursor (`pickClassAt`, `onClassPicked`). **Number keys 1–9** select
  the n-th class in list order.
- **Overlay**: alpha was hard-coded at 180; now `overlayAlpha` (slider
  0–100 %, default 70) and `overlayVisible` (held V hides every overlay,
  keyup or window blur restores). Class visibility flags are untouched
  by the peek.
- **Rename** by double-clicking the name (inline input, Enter commits,
  Escape cancels, key events stopped so shortcuts don't fire); **colour**
  by clicking the swatch (one persistent hidden `<input type="color">`
  per module, retargeted per click). Names are now HTML-escaped in the
  list. Both are already part of the saved class list.
- **Batch buttons** in the classes header show the action they will
  take: hide all / show all (show if any hidden), lock all / unlock all
  (unlock only when all are locked).

### 8. Pixel-classifier suggestions (same day; Lucas: "pixel classifier sounds good")

An ilastik / Labkit style helper, chosen over prompt-based segmentation
(micro-SAM) and over a U-Net-in-the-loop because it is interactive on CPU,
needs no model download and fits the existing Python side.

- **Backend** `python/pixel_classifier.py` (modes `train`, `predict`,
  JSON config file, `PIXCLS_*` stdout protocol like segcleanup). Features:
  `skimage.feature.multiscale_basic_features` (intensity, edges, Hessian
  texture, σ 1–8, 4 scales, 16 features) on per-slice percentile-normalised
  intensities. Model: `sklearn` RandomForest (80 trees, min_samples_leaf 2,
  OOB score reported as "est. accuracy"), samples capped per class (20 k).
  Labels arrive in the annotation module's own sparse/dense encoding and
  are decoded with `create_annotation_tiff.decode_sparse`. The model is
  pickled to `<workspace>/.classifier/<modelId>.pkl`; only the newest per
  workspace is kept. New dependency: scikit-learn (added to
  requirements.txt and installed in the venv).
- **Routes** `POST /api/annotation/classifier/train` (labels, classes,
  backgroundClass → modelId + stats) and `…/predict` (modelId, slices ≤ 64,
  minConfidence, smooth → dense base64 labels + confidence per slice).
  modelId is validated against a strict pattern before it touches the
  filesystem.
- **Background class**: the user paints a normal class for "not a
  structure" and selects it in the Suggest section (auto-picked when a
  class name contains background/bg/rest/other). Its predictions and
  every pixel under the confidence threshold become 0, i.e. no
  suggestion. Choosing a background class is part of the model, so
  changing it retrains.
- **Client**: a Suggest section (background select, min confidence,
  smooth, Suggest slice / Range, status line, Accept / Discard / Accept
  all). Suggestions live in a `Map<slice, {labels, confidence}>` and are
  drawn on a new `suggestionCanvas` under the annotation layer, only
  where the slice is still empty, with alpha scaled by confidence. Accept
  writes into empty pixels only (locked classes excluded), one undo step
  per slice, and flags the slice auto-filled (same map as interpolation,
  so marks and the training exclusion below apply). Pending suggestions
  are hollow marks on the slider (`kind: 'pending'` in `setMarks`).
  Keys: S suggest, A accept.
- **Staleness**: `labelsVersion` is bumped on every label change
  (stroke, fill, undo/redo, interpolation, revert, class delete, load);
  Suggest retrains when the model's version differs. Auto-filled slices
  are excluded from training so the forest learns from the user's
  strokes, not from its own accepted output.
- **Measured** on the bundled test stack (23×256×256, two classes plus a
  synthetic background class from 15 % / 3 % scribbles on two slices):
  OOB 0.955, unseen slices pixel accuracy 0.96, foreground IoU 0.97–0.98;
  train 0.3 s compute (≈1 s wall incl. interpreter start), predict
  0.3 s per slice.

## Consequences

- Memory: an interpolated slice costs the same as a painted one (one
  `Uint8Array` per slice) plus one history snapshot, plus a revert
  snapshot for slices that already had data. Fine for windowed crops;
  noted in the help article for full stacks.
- The save format is unchanged: interpolated pixels are ordinary labels.
- New help article `annotation.step2.interpolation`; the classes, tools
  and module articles mention the protection rule and the keys.
- The classifier adds scikit-learn to the Python environment and a
  `.classifier/` cache dir per workspace (untracked, like `.slices/`).
- Tests: `SliceInterpolator` (EDT vs brute force, SDF signs, growing disc,
  drifting disc with and without alignment, keyframes, gap plan,
  generator) and `BrushEngine` protection were exercised with Node
  scripts during the session (see the session log). The browser
  walkthrough (dialog, marks, revert) is Lucas's to do; the Chrome tools
  were not available in the implementing session.

## Files

- `public/workspace/js/modules/annotation/utils/SliceInterpolator.js` (new)
- `public/workspace/js/modules/annotation/AnnotationModule.js` (dialog,
  run, revert, marks, keys, presence cache)
- `public/workspace/js/modules/annotation/utils/BrushEngine.js`
  (protected classes, auto-show, `onClassesChange`)
- `public/workspace/js/core/components/SliceViewerChrome.js` +
  `core/css/slice-viewer.css` (`setMarks`)
- `public/workspace/js/core/icons.js` (`layers`, `lock`, `lockOpen`)
- `public/workspace/js/modules/annotation/css/annotation.css`
- `public/workspace/content/modules/annotation/step2-interpolation.md`
  (new), `step2-suggest.md` (new), `step2-classes.md`, `step2-tools.md`,
  `_module.md`, `manifest.json`
- `python/pixel_classifier.py` (new), `src/routes/annotation.routes.js`
  (classifier routes), `AnnotationAPI.js`, `AnnotationCanvas.js`
  (suggestion layer), `requirements.txt`
