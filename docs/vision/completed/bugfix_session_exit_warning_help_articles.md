# Fix: Update 5 Help & Info Articles for New Features

## Context

Several help articles are outdated and don't document features that have been added since they were written. This causes confusion for users who rely on the help system. Priority 5, complexity 1.

## Changes

### 1. Annotation: Drawing Tools (`step2-tools.md`)
**File:** `public/workspace/content/modules/annotation/step2-tools.md`

**Add** Fill tool section after Eraser in "Available Tools", and add `fill` tag to frontmatter. Add G shortcut to keyboard shortcuts list.

Content to add under Available Tools:
```
Fill (G)

Fills a contiguous region of the same class with the currently selected class color. Click on any pixel to flood-fill all connected pixels of the same value. Useful for quickly filling large uniform areas instead of painting with the brush. Brush size has no effect on this tool.
```

### 2. Annotation: Module Overview (`_module.md`)
**File:** `public/workspace/content/modules/annotation/_module.md`

**Update** Key Features list to add fill tool and filament annotation. Add `filaments` tag to frontmatter. Add `annotation.step2.filaments` to seeAlsoManual.

Add to Key Features:
- Fill tool for quickly filling large regions
- Filament annotation for tracing tubular structures (e.g., microtubules)

Update Workflow step 2 to mention all tools and filaments.

### 3. Segmentation: Annotation Masks (`step1-annotations.md`)
**File:** `public/workspace/content/modules/segmentation/step1-annotations.md`

**Add** a "Filament Volume (Optional)" section at the end explaining that annotations can optionally include filament centerpoint data for direction-aware segmentation. Add `filaments` and `direction` tags.

### 4. Visualization: Controls (`step2-controls.md`)
**File:** `public/workspace/content/modules/visualization/step2-controls.md`

**Add** "Filament Network (Optional)" section after Original Data Overlay, documenting:
- Visibility toggle checkbox
- Z Range slider for depth clipping
- Only appears when mesh was generated from data with filament annotations

Add `filaments` tag.

### 5. File Browser: File Operations (`file-operations.md`)
**File:** `public/workspace/content/modules/file-browser/file-operations.md`

**Add** "View JSON" to Context Menu section. Add `json` tag.

Content: View JSON option appears for .json files, opens a modal with syntax-highlighted content for examining mesh metadata, model configs, and processing parameters.

## Verification

1. Start the app (`npm run dev`)
2. Open workspace, navigate to each module's help panel
3. Verify each updated article renders correctly with the new content
4. Check that article links (seeAlso) work
