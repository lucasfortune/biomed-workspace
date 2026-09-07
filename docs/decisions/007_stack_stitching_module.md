# ADR-007: Stack Stitching Module

**Date:** 2026-08-26
**Status:** Accepted; MVP implemented 2026-08-26 (Python align + apply
verified pixel-exact against synthetic ground truth in both modes; module
UI pending browser E2E). Help articles for the module are a follow-up.
**Deciders:** Lucas Fortune
**Tags:** stitching, module, python, volumetric, feature

---

## Context

### Problem Statement

Volumetric EM samples are frequently imaged as several stacks: one organism
split across sequential acquisitions along z (the Engstler tr samples: one
trypanosome in 10 stacks of ~4000x9000 px x 250-300 slices), side-by-side
fields of view, or workspace-made crops taken so the ML modules do not have
to process a 4000x9000 slice at once. The workspace can split stacks but
cannot join them, so multi-stack samples dead-end before a complete 3D
model. A stitching module closes the workflow gap: noisy stacks ->
denoise -> annotate -> segment -> **stitch** -> mesh -> visualize (with
stitch-early on denoised stacks as an equally supported order, see below).

### Scope boundaries

- Each input stack is assumed INTERNALLY aligned; the module applies ONE
  rigid placement per stack. Per-slice drift correction inside a stack
  (serial-section registration) is explicitly out of scope.
- Rigid transforms only (integer z-offset; in-plane dx, dy, small rotation).
  Elastic/affine registration is out of scope.

## Decision: the placement model

One module handles z-concatenation, z-overlap, and xy mosaicking through a
single model. Every stack after the first ("moving") is placed relative to
an already-placed stack ("reference") by:

1. **A declared slice pair**: the user selects one slice from each stack
   and declares "these are the same physical section." This fixes the
   integer z-offset. Last-of-A against first-of-B gives pure concatenation
   (overlap 0); any other pair produces a z-overlap. Overlap is the general
   case; concatenation is its zero special case. Real z-overlaps occur
   (re-imaged sections at session boundaries, restarted runs), and the
   pair semantics also protect users who do not know whether acquisitions
   abut cleanly.
2. **An in-plane transform** (dx, dy, rotation) aligned on that slice
   pair in an overlay viewer: fixed slice tinted magenta, moving slice
   tinted green (gray = aligned), opacity slider and flicker toggle, drag
   to translate, arrow keys for 1 px nudges, fine rotation control. An
   **Auto-align** button runs phase correlation server-side (seconds,
   downsampled) and snaps the placement; the user verifies and nudges.
   Automation proposes, the human confirms (same pattern as the denoising
   mask approval).

Transforms compose down a chain: each junction is a two-slice alignment
regardless of how many stacks the set has.

## Decision: stitch recipes (align once, apply to everything)

The module's primary product is a **stitch recipe**: the ordered set of
per-stack placements, saved as JSON and tracked in workspace metadata.
Composition applies a recipe to a set of volumes.

Rationale: a stack and its segmentation share a pixel grid (known from
lineage). Alignment is computed ONCE on the best-suited data, then the same
recipe composes the grayscale volume AND the label volume, guaranteeing the
mesh sits exactly on the image. Stitching image and labels with independent
alignment runs could produce two subtly different transforms.

- Alignment source recommendation: grayscale (raw/denoised) when available.
  Phase correlation feeds on texture; EM grayscale gives sharp peaks.
  Label maps are piecewise-constant: sparse segmentations give broad,
  directionally ambiguous peaks (elongated structures constrain alignment
  poorly along their own axis), and separately trained models can disagree
  systematically at boundaries. Direct seg+seg alignment stays available
  (auto-align then runs on a boundary map extracted from the labels) for
  when only segmentations exist; it is second-best, not preferred.
- Workspace-made crops record their crop origin in file lineage
  (`lineage.cropInfo`, written by the preprocess module). *Struck
  (2026-09-07, data model consolidation / ADR-012): the originally planned
  crop-origin placement prefill in the stitcher was never implemented and
  is dropped - placement UX has moved on and the value is low. cropInfo
  stays as recorded provenance data.*

## Decision: two data modes, never mixed

A stitch set is either **grayscale** (raw/denoised intensities) or
**labels** (segmentation results), detected from workspace metadata tags
and enforced (raw+raw or seg+seg; mixing rejected). The modes differ in
composition rules, which is why the distinction is first-class:

| | grayscale | labels |
|---|---|---|
| interpolation | linear | nearest-neighbor ONLY (class IDs never average) |
| xy-overlap seams | linear feathering across the overlap band | precedence (hard seam by design) |
| z-duplicate sections | trim the losing side (user picks which) | trim (same) |
| intensity match | optional linear match of moving to reference, fit on the aligned junction overlap | never |
| extra checks | dtype match warning | class-set consistency warning (differing label sets across stacks) |

z-overlap resolution is TRIMMING, not blending: duplicated z-positions are
two images of the same physical section from different sessions; averaging
them softens detail. The recipe records which side keeps its slices; the
compositor then only ever blends xy overlap within a section.

## Output composition

- Union canvas in xy, union range in z, computed from all placed
  footprints (rotation via bounding boxes).
- Fill value for empty margins (default: per-stack mean for grayscale,
  0/background for labels); optional crop-to-common-area.
- Streamed slice-by-slice (tifffile), memory-safe for full-size stacks.
- Output tracked in workspace metadata with lineage (stitched-from inputs +
  the recipe file).

## Architecture

- **Python** (stdout JSON protocol, same conventions as denoising):
  - `python/stitch_align.py`: phase correlation between two slices
    (downsampled to ~1024 max dim, offsets rescaled), grayscale or
    label-boundary mode. Synchronous, returns dx/dy + confidence.
  - `python/stitch_apply.py`: applies a recipe to a volume set, emits
    `STITCH_PROGRESS:` / `STITCH_RESULT:` / `STITCH_ERROR:` lines.
- **Node**: `src/routes/stitching.routes.js` mounted at `/api/stitching`
  (`/align` sync; `/apply` async job + Socket.IO room `stitching-<id>`;
  recipe save/load). Slice previews reuse the existing generic TIFF
  info/slice endpoints. Socket join/leave events follow the denoising
  pattern.
- **Frontend**: `public/workspace/js/modules/stitching/` registered in the
  module registry. Steps: (1) select and order stacks, mode detection +
  compatibility enforcement; (2) junction wizard with slice pickers +
  overlay alignment viewer; (3) compose: options, progress, result,
  apply-recipe-to-sibling-volumes.

No new dependencies: scikit-image (phase_cross_correlation), scipy,
tifffile, numpy are all present.

## Phasing

- **MVP**: N stacks, slice-pair z-offsets, auto translation + manual
  translation/rotation, both data modes with the composition rules above,
  recipes saved/reapplied, streamed output. (Lineage-prefilled crop
  placements were planned here but struck - see note above.)
- **Later**: rotation auto-estimation, overlap auto-detection (score B's
  first k slices against A's last k), non-workspace montage import,
  automatic tiled processing inside the ML modules (which removes the
  crop-and-reassemble round trip entirely; the stitching module still
  covers the acquisition-side problem).

## References

- ADR-006 (routed ASN2V migration; job/socket/stdout conventions reused)
- Interaction precedent: IMOD midas, BigWarp overlay alignment
