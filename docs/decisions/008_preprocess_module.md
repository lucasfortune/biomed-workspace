# ADR-008: Preprocessing Module + Physical Voxel Size Foundation

**Status:** Accepted, MVP implemented (2026-08-27)
**Context:** Module roadmap session 2026-08-26/27. Agreed build order:
(1) this module, (2) Segmentation Cleanup & Quantification (ADR-009,
future), (3) comparison mode in the Image Viewer, (4) file-browser format
conversion + mesh module simplification. Items 3 and 4 may interleave.

## Decision

### Preprocessing module (`preprocess`)

A three-step module (Select Stack -> Adjust -> Apply) that prepares
grayscale image stacks for the downstream pipeline. All operations are
non-destructive: the output is a new tracked file with lineage; the
original is never modified.

**Operations, applied in a fixed order** (each optional):

1. **Crop** - xy rectangle in original pixel coordinates, drawn on the
   slice preview or typed numerically
2. **Z-range trim** - keep slices [first, last] (inclusive in the UI)
3. **Flip** horizontal / vertical
4. **Rotate** 90/180/270 degrees
5. **Downscale** - integer factor mean binning (2/4/8x)
6. **Intensity** - window [min, max] + gamma + invert
7. **Output dtype** - keep / uint8 / uint16

Deliberately excluded from the MVP: gaussian/median filtering (overlaps
the denoising modules), freeform operation pipelines (fixed order keeps
the UI and semantics simple).

**Preview model:** intensity ops preview live (debounced 300 ms) on the
current slice via a server-rendered JPEG; the crop rectangle is a
client-side overlay on the full frame; geometry ops (flip/rotate/
downscale) are described in the Apply summary but not previewed. This
keeps crop coordinates unambiguous (always original frame).

**Intensity semantics** (python/preprocess_stack.py):
- normalized = clip((v - lo) / (hi - lo), 0, 1), then `** gamma`
  (gamma < 1 brightens), then optional 1-x invert
- output scaling: [0,1] -> full range of the output dtype; 'keep' with an
  integer input uses that type's full range, float inputs stay [0,1]
  float32
- when normalization is needed (dtype conversion or downscale) but no
  window was chosen, a streamed global min/max pass supplies it
- histogram for the UI is sampled: <=5 evenly spaced slices, spatially
  strided to <=1024 px, 256 bins, with percentiles (0.1/1/5/95/99/99.9)
  powering the Auto-window buttons

**Crop origin lineage (feeds ADR-007):** when crop or z-trim is applied,
the output's lineage carries `cropInfo: {x, y, z}` - the offset of the
crop in the source stack. The stitching module can later prefill
placements from this (planned follow-up in stitching step 1).

### Physical voxel size (platform-wide foundation)

File metadata entries can now carry `voxelSize: {x, y, z, unit}`
(z optional; unit normalized, 'um' displayed as µm):

- **Auto-read on upload**: `extract_slice.py --info` now parses OME-XML
  PhysicalSize*, TIFF X/YResolution tags, and ImageJ metadata
  (spacing/unit); the upload route stores the result asynchronously
  (fire-and-forget, non-critical).
- **Editable**: file-info modal has a voxel-size row with inline edit
  (PATCH `/api/workspace/file/:fileId/voxel-size`, validates positive
  numbers, null clears).
- **Inherited** through duplicate, split, stitching (from the first input
  stack), and preprocess - where downscale multiplies x/y by the binning
  factor.
- `WorkspaceManager.addFileToMetadata` whitelists the field;
  `updateFileVoxelSize` patches it. (The whitelist silently drops unknown
  fields - any future metadata field needs an explicit entry there.)

Motivation: quantification in physical units (ADR-009) and eventually
prefililng the mesh module's z-aspect from real spacing. MRC import
(future ADR) will populate it from MRC headers.

## Architecture

Same shape as the stitching module (ADR-007):

- **Python** `python/preprocess_stack.py` - modes info / preview / apply;
  stdout protocol `PREPROCESS_INFO/PROGRESS/RESULT/ERROR:` + JSON;
  streaming slice-by-slice apply (TiffWriter `contiguous=True`, bigtiff
  above 2 GB).
- **Node** `src/routes/preprocess.routes.js` mounted at
  `/api/preprocess`: GET `/info` (sync), POST `/preview` (sync, returns
  JPEG with `Cache-Control: no-store`, temp files under the workspace's
  `.preprocess/`, excluded from ZIP export), POST `/apply` (async job,
  Socket.IO room `preprocess-<id>`, events `preprocess-progress/
  complete/error`). Output tracked under `results/preprocess/<id>/` with
  tags `['preprocess', 'raw', 'data']` (downstream pickers treat it as
  grayscale data) + lineage (`processType: 'preprocess'`).
- **Frontend** `public/workspace/js/modules/preprocess/` - annotation-
  style wide Adjust step (viewer left with slice slider, crop overlay,
  dim-outside crop drawing; 290px toolbar right with Crop / Z range /
  Geometry / Intensity / Output sections; draggable histogram window
  markers, log-scaled counts). Module resets on deactivate. Registry
  color #C29B0C, listed first (start of the workflow).

## Incidental fixes in this change

- Multer TIFF filter accepted only `.tif` (not `.tiff`) by extension -
  now `/\.tiff?$/`.
- Slice endpoints (`/api/workspace/slice`, `/api/denoising/dl/slice`) now
  send `Cache-Control: private, max-age=86400` - workspace files are
  immutable, so revisited slices come from the browser cache instead of
  re-fetching with a visible loading state. (Client-side prefetch of
  neighboring slices is planned with the Image Viewer comparison work.)
- `stitching` and `preprocess` added to the lineage display-name map.

## Verification (2026-08-27, headless)

- `preprocess_stack.py` apply is pixel-exact against a NumPy reference
  for crop + z-trim + flip + rotate + 2x binning + window + uint8 on a
  synthetic uint16 stack; passthrough config produces an identical copy.
- Full API round trip through the dev server (login -> upload ->
  info -> preview -> apply): output tracked with correct tags, lineage
  with `cropInfo`, and pixel-exact content.
- Voxel size: auto-extracted from an ImageJ-metadata TIFF on upload
  (x/y from resolution tags, z from spacing, unit), PATCH edit + invalid
  input 400, downscale x2 doubles x/y on the output entry.
- Browser E2E: pending (Lucas).

## Follow-ups

- Help articles for the module (manifest + content) - pending, together
  with the stitching articles.
- Stitching step 1: prefill placements from `cropInfo` lineage.
- Possible later ops: background subtraction, per-slice intensity
  normalization for drift correction.
