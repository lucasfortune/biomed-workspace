# ADR-012: Workspace Data Model Consolidation

**Status:** Accepted (2026-09-07)
**Release:** v1.5.0
**Related:** ADR-003 (session isolation), ADR-007 (stitching), ADR-008
(preprocessing + voxel size), ADR-010 (format conversion)
**Source material:** a full data-model workup and inconsistency register
(three code sweeps, ~30 findings), executed as work packages WP1 to WP7.

## Context

The workspace's data model grew organically during platform development
and had never been written down or addressed as an entity of its own.
A systematic reverse-engineering pass (2026-09-07) produced a normative
description and an inconsistency register: lineage records that violated
their own schema, producers that skipped the display-name system, security
gaps around job rooms and restore, retention promises that didn't match
the cleanup service, and a layer of dead legacy surfaces. This ADR records
the canonical model that the consolidation established and the decisions
taken along the way. Every register item was either FIXED, REMOVED, or is
explicitly documented below as a design decision.

## The canonical data model

### Storage

- There is **no database**. Each user session owns one workspace directory
  `workspaces/<sessionId>/` (under `DATA_DIR`); the session ID doubles as
  the workspace name and the isolation boundary (ADR-003).
- The single persistent store is the workspace manifest `metadata.json`
  (schema version **1.2.0**). Everything else in the workspace is payload
  files plus regenerable caches (the shared `CACHE_DIRS` list:
  `.thumbnails`, `.slices`, `.mesh-previews`, `.preprocess`,
  `.segcleanup` — excluded from ZIP export, preserved by clearWorkspace).
- **Load-time migration:** `loadMetadata` runs `normalizeManifest()` on
  every read. Legacy categories are mapped to the three-category system,
  legacy lineage shapes are rewritten to the canonical record, missing
  names are recovered from paths, and the result is persisted once.
  Because workspaces are short-lived but ZIP backups can be restored at
  any time, *reads tolerate and upgrade old manifests; writes only ever
  produce canonical ones*.

### The file entity

Every tracked file is one row in `metadata.files`, created by the single
constructor `WorkspaceManager.addFileToMetadata` (producers conform to the
constructor, never the other way around):

| Field | Meaning |
|---|---|
| `id` | `file_<epochMillis>_<12hex>` (or a producer-supplied id); workspace-scoped identity |
| `name` | physical file name; **invariant: `name === basename(path)`** |
| `path` | workspace-relative path (this is what makes ZIP restore work) |
| `category` | coarse bucket: `uploads` \| `models` \| `results` |
| `tags` | the real type system: method tag (raw/annotation/denoising/segmentation/mesh/preprocess/stitching/segcleanup/…) + type tag (data/info/wip/weights/config/report/recipe/…) |
| `size`, `uploadedAt` | bytes; creation time of the row |
| `displayName` | cosmetic, user-facing name (`displayName \|\| name` everywhere); unique per workspace (collision-suffixed on insert *and* rename) |
| `voxelSize` | `{x, y, z?, unit}` physical voxel size (ADR-008), inherited through processing, kept on all conversions |
| `lineage` | provenance record, see below |
| `parentId` | sidecar link: the file lives and dies with its parent (deleting the parent removes it) |
| `lastModifiedAt` | set when a file's bytes are rewritten in place; `uploadedAt` stays the creation time |
| `thumbnailPath`, `folderId` | cache pointer; reserved field (see "virtual folders") |

### Display names

Derived names chain from the source's display name plus a short operation
token, so names read as provenance:
`trypB.tif → trypB_prep.tif → trypB_prep_stitch.tif → …`.
The token vocabulary (`namingHelpers.OPERATION_TOKENS`) covers every
producer: gaussian, nlm, n2v, asn2v, seg, mesh, annot, prep, stitch,
clean, conv (target format via extension, e.g. `stack_conv.stl`), copy,
split (+ `part1`/`part2` qualifier). Auxiliary outputs take a qualifier
(`info`, `config`, `model`, `recipe`, `report`, `classes`, …) so they
never collide with the primary output. Uploads store the on-disk
(timestamped) name as `name` and the user's original filename as
`displayName`. Renaming changes only `displayName`.

### Lineage (the provenance DAG)

Every derived file carries a canonical record created by `createLineage`:

```json
{
  "processType": "denoising",
  "processedAt": "ISO timestamp",
  "inputs": ["file_..."],
  "processId": "optional job/run id"
}
```

- `inputs` is **always** an array and **data-only**: root-finding
  (`findRootFiles`, `findOriginalDataFile`) resolves through it to the
  original imaging data. It is empty (never absent) when inputs are
  unknown.
- Documented extensions: **`modelFileId`** (the model a segmentation or DL
  inference ran with — an annotation on the record, *not* an input, so
  roots stay imaging data; null for untracked imported models),
  **`status`** (`in_progress`/`complete` on annotations), **`splitInfo`**
  (part/slice-range on splits), **`cropInfo`** (crop origin recorded by
  preprocess).
- Every producer emits lineage, including training runs
  (`segmentation-training`, `denoising-training` on models *and* their
  auxiliary config/info artifacts) and every info/sidecar file. Nothing a
  module writes looks like an original upload.
- Broken chains are surfaced honestly: the file info modal shows
  "(source deleted) → …" when an upstream file is gone.

### Jobs

Jobs are **in-memory only** (SessionTracker maps for training, inference,
mesh, denoising, plus a generic registry for preprocess, stitching,
segcleanup, DL inference and filter runs) and restart-lossy by design —
an acknowledged trade-off; outputs on disk survive, progress state does
not. The registry gives three guarantees: the cleanup service defers
deletion while a session has running jobs; Socket.IO job rooms admit only
the owning session (the shared session middleware runs on the socket
handshake); job status/cancel/download endpoints return 404 for other
sessions' jobs.

### Lifecycle

- **Retention (decision):** one policy, `RETENTION_HOURS = 48`. The
  cleanup grace period and the session cookie/TTL both derive from it, so
  login lifetime and data lifetime match, and the help articles state the
  real policy. Rationale: small user base, storage affordable; revisit if
  the platform grows into storage pressure.
- **Backup/restore:** ZIP export excludes `CACHE_DIRS`; restore streams
  the uploaded archive from a temp file (never buffered in memory),
  sanitizes entry paths (zip-slip guard), clears the workspace (caches
  preserved), extracts, and remaps only the manifest's `sessionId`.
  File ids are kept verbatim on restore: ids are workspace-scoped by
  design.

## Decisions taken (settled 2026-09-07)

1. **Retention:** 48 h grace + honest wording, cookie shortened to match
   (see above).
2. **Virtual folders: removed.** The CRUD, tree and move endpoints never
   had a UI and are gone; `folders: []` and `folderId` stay in the schema
   as reserved fields so old manifests load untouched.
3. **ADR-007 crop-prefill: struck.** The promised crop-origin placement
   prefill in the stitcher was never implemented and is dropped (noted in
   ADR-007); `cropInfo` stays as recorded provenance data.
4. **Convert naming:** `<base>_conv.<ext>` (e.g. `stack_conv.stl`).

## Explicitly NOT changed (documented as design)

- Jobs remain in-memory / restart-lossy (see above).
- `uploadedAt` keeps its meaning (row creation time); derived files get
  their processing time from `lineage.processedAt`, in-place rewrites are
  visible via `lastModifiedAt`.
- Restore keeps file ids verbatim (workspace-scoped identity).
- `addFileToMetadata` returns the existing entry on a path collision;
  run directories are id-unique, so collisions require deliberate
  same-path writes.
- No disk quota — a deployment-level concern (also a report limitation).
- An empty tag filter matches all files — intentional escape hatch in the
  selector semantics.

## Consequences

- The manifest is now a schema one can document and draw (the workspace
  report's data-model section describes exactly this model).
- Old backups keep working forever through the load-time migration; the
  codebase no longer carries per-consumer legacy fallbacks.
- The provenance DAG is sound end-to-end: any result resolves to its
  original upload, records the model that produced it, and every module's
  outputs are named and typed consistently.
- Removed surfaces (legacy root directories and their unauthenticated
  mounts, `/reset-session`, `/api/mesh/sources`, folder CRUD,
  `session.config.js`) shrink the attack and maintenance surface.
