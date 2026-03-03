# Implementation Plan: Help Articles for Filaments & 2.5D Segmentation

## Context

Two high-priority (Prio 5) issues require creating help/info articles:
1. **Filaments help article + ? icon** - The annotation module's filament section has no help icon or article, unlike all other toolbar sections (tools, brush size, history, classes).
2. **2.5D segmentation info articles** - Four help icons in the segmentation module UI reference articles that don't exist yet, causing 404s when clicked.

## Phase 1: Filament Help Article + ? Icon

### 1a. Create markdown article

**New file:** `public/workspace/content/modules/annotation/step2-filaments.md`

Content will cover comprehensively:
- What filaments are (centerpoint-based tracking for tubular structures)
- Adding/deleting filaments (+ button, x button)
- Centerpoint placement: click on canvas to place one point per slice per filament
- Right-click to remove a placed point
- Class association: filaments inherit the currently selected class
- MT-naming convention (MT-1, MT-2, ...) and the auto-incrementing color palette
- Point count badge explanation
- Active filament selection (click to select in list)

Article ID: `annotation.step2.filaments`

### 1b. Add ? help icon to filament section header

**Modify:** `public/workspace/js/modules/annotation/AnnotationModule.js` (~line 313-314)

Change from:
```html
<div class="filaments-header">
  <h4>Filaments</h4>
  <button id="addFilamentBtn" ...>+</button>
</div>
```
To:
```html
<div class="filaments-header">
  <h4>Filaments${this.renderHelpIcon('annotation.step2.filaments')}</h4>
  <button id="addFilamentBtn" ...>+</button>
</div>
```

This follows the exact same pattern as Tools (line 242), Brush Size (line 264), History (line 277), and Classes (line 303).

### 1c. Add manifest entry

**Modify:** `public/workspace/content/manifest.json`

Add entry to `articles` object for `annotation.step2.filaments`.

## Phase 2: 2.5D Segmentation Info Articles

### 2a. Create 4 markdown articles

All in `public/workspace/content/modules/segmentation/`:

1. **`step1-mode.md`** (ID: `segmentation.step1.mode`)
   - 2D vs 2.5D mode toggle explanation
   - When to use each mode (2D for single-slice, 2.5D for volumetric context)
   - How 2.5D feeds adjacent slices as input channels
   - Impact on training time and memory

2. **`config-context-slices.md`** (ID: `segmentation.config.context-slices`)
   - What context slices/input slices means (how many adjacent slices fed as input)
   - Available values: 3, 5, 7
   - Trade-off: more slices = more context but more memory
   - Only visible in 2.5D mode

3. **`config-alpha.md`** (ID: `segmentation.config.alpha`)
   - Alpha = orientation loss weight in combined loss function
   - Only visible when direction-aware training is active (filament annotations present)
   - Range 0-10, default 1.0
   - Higher values emphasize orientation prediction accuracy

4. **`config-lambda-dir.md`** (ID: `segmentation.config.lambda-dir`)
   - Lambda Dir = direction loss scaling factor
   - Only visible when direction-aware training is active
   - Range 0-5, default 0.3
   - Controls how strongly direction prediction error contributes to total loss

### 2b. Add 4 manifest entries

**Modify:** `public/workspace/content/manifest.json`

Add entries for all 4 new article IDs.

## Phase 3: Regenerate Manifest & Validate

Note: The `scripts/convert-help-to-markdown.js` script is a one-time JSON-to-markdown migration tool - it reads JSON sources, not existing markdown files. Since articles are now authored directly as markdown, manifest entries must be added manually. We will run `scripts/validate-help-migration.js` afterward to verify all references are resolved.

## Files to Create (5 new)
- `public/workspace/content/modules/annotation/step2-filaments.md`
- `public/workspace/content/modules/segmentation/step1-mode.md`
- `public/workspace/content/modules/segmentation/config-context-slices.md`
- `public/workspace/content/modules/segmentation/config-alpha.md`
- `public/workspace/content/modules/segmentation/config-lambda-dir.md`

## Files to Modify (2)
- `public/workspace/js/modules/annotation/AnnotationModule.js` (add help icon to filaments header)
- `public/workspace/content/manifest.json` (add 5 new article entries + glossary)

## Manual Testing

### After Phase 1 (Filaments):
1. Start dev server (`npm run dev`)
2. Open workspace, launch Annotation module
3. Load any image, advance to Step 2
4. Verify ? icon appears next to "Filaments" header, matching style of other ? icons
5. Click ? icon - verify help panel opens with comprehensive filaments article
6. Verify article content is well-formatted and all sections render

### After Phase 2 (2.5D Segmentation):
1. Launch Segmentation module
2. On Step 1, verify ? icon next to 2D/2.5D toggle works and shows mode article
3. Toggle to 2.5D mode, advance to Step 2 (config)
4. Verify "Input Slices" ? icon shows context-slices article
5. Load annotation data with filament direction volume to trigger direction-aware section
6. Verify "Alpha" and "Lambda Dir" ? icons show their respective articles
7. Check that all articles render properly in the help panel

### After Phase 3 (Validation):
1. Run `node scripts/validate-help-migration.js`
2. Verify no errors about missing articles for referenced help icon IDs
