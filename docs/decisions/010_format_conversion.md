# ADR-010: File Format Conversion + Mesh Module Simplification

**Status:** Accepted, implemented + API-verified (2026-08-27)
**Context:** Module roadmap item 4 (see ADR-008 header). Lucas's
decisions: conversion lives in the FILE BROWSER's right-click menu (not
a module); non-TIFF image uploads are converted to TIFF on import (the
workbench is TIFF-internal everywhere); the mesh module drops its format
checkboxes and OBJ becomes the canonical geometry; generic JSON->CSV
conversion was considered and REJECTED (platform JSONs are not tabular;
the quantification report is born as CSV, ADR-009).

## Decision

### "Convert to..." in the file browser context menu

Per-file actions, gated by extension:

- `.tif/.tiff` -> **MRC** (voxel size from file metadata written into the
  MRC header, converted to Angstrom)
- `.mrc` -> **TIFF**
- `.obj` -> **STL**, **PLY**, **glTF (GLB)**

Endpoint: POST `/api/workspace/file/:fileId/convert` `{format}` (sync,
duplicate-route pattern). Output lands next to the source, conflict-safe
naming, tracked with lineage `processType: 'convert'`; image conversions
inherit tags + `converted` and the voxel size; mesh conversions get tags
`['mesh', 'data', <fmt>]`.

### MRC import

Upload accepts `.mrc` (file browser accept attribute + workspace multer
filter). The upload route converts to `.tif` before tracking, deletes
the MRC, and stores the voxel size read from the MRC header (Angstrom ->
nm, or um for large spacings) - plugging directly into the ADR-008
voxel-size foundation. A failed conversion rejects the upload with the
converter's message.

### Mesh module

Format checkboxes removed; every run writes **Three.js JSON + OBJ**
(the previous defaults, so nothing regresses). Rationale: the module's
default JSON is the voxel-slices format, which contains NO triangle
mesh - the OBJ is the only reliable geometry source, so it is always
written and all downstream conversions (STL/PLY/GLB) read from it via
the file browser. UI shows a note pointing at the conversion action.

## Implementation

- `python/convert_file.py` - `CONVERT_RESULT/ERROR` protocol. TIFF<->MRC
  via mrcfile (uint8/16 -> mode 6, int -> mode 1, float -> mode 2,
  lossless round trip). OBJ parser handles the mesh generator's
  `f v//n` output plus common face forms, fan-triangulates, and
  computes area-weighted vertex normals when `vn` is absent. Writers:
  binary STL, binary-little-endian PLY, and a minimal hand-rolled
  glTF 2.0 GLB (JSON + BIN chunks, positions/normals/u32 indices) -
  no new mesh dependencies.
- `mrcfile>=1.5.0` added to requirements.txt (was installed in the env
  but undeclared).
- Both duplicate TIFF upload filters now accept `.tiff` (the
  multer.config.js one was fixed in ADR-008's commit; the
  upload.middleware.js copy is fixed here).

## Verification (2026-08-27)

- Python: tif->mrc->tif lossless round trip incl. voxel size
  (0.008 um -> 80 A -> 8 nm); OBJ->STL triangle count, GLB
  magic/length, PLY header + binary layout all checked.
- Server: context-menu conversion tracks output with tags + lineage;
  `.mrc` upload arrives as `.tif` with header voxel size; source MRC
  removed.
- Browser E2E: pending (Lucas).

## Follow-ups

- Prefill the mesh module's "Z Voxel Scale" from voxelSize metadata
  (z/x ratio) when the source segmentation carries one.
- 3D visualization module could gain a GLB loader later (it currently
  reads only the custom JSON formats).
