# Template Module

A starter template for creating new workspace modules using the BaseModule framework.

## Quick Start

### 1. Copy the Template

```bash
# From the modules directory
cp -r template yourmodule
```

### 2. Rename Files

```bash
cd yourmodule
mv TemplateModule.js YourModule.js
mv css/template.css css/yourmodule.css
```

### 3. Update the Module

Edit `YourModule.js`:

1. **Update class name:**
   ```javascript
   class YourModule extends BaseModule {
   ```

2. **Update configuration:**
   ```javascript
   super(stateManager, {
     id: 'yourmodule',
     name: 'Your Module Name',
     cssPath: '/workspace/js/modules/yourmodule/css/yourmodule.css',
     steps: [
       { id: 'step1', name: 'First Step' },
       { id: 'step2', name: 'Second Step' },
       // Add or remove steps as needed
     ]
   });
   ```

3. **Update CSS import in `css/yourmodule.css`:**
   ```css
   /* Keep this import */
   @import url('/workspace/js/core/css/module-base.css');

   /* Update class names */
   .yourmodule { ... }
   ```

4. **Implement your processing logic** in `startProcessing()` and related methods

5. **Keep the shared step chrome** (see "Module UI Contract" below) - it is what
   makes every module look and behave the same way

### 4. Register Your Module

Edit `/workspace/js/modules/registry.js`:

Add an inline SVG to the `moduleIcons` map at the top of the file, then the
entry itself:

```javascript
{
  id: 'yourmodule',
  name: 'Your Module Name',
  description: 'What your module does',      // at most 14 words
  icon: moduleIcons.yourmodule,              // inline SVG, not an emoji
  path: '/workspace/js/modules/yourmodule/YourModule.js',
  inputs: ['input_type'],
  outputs: ['output_type'],
  status: 'available',                       // or 'coming_soon'
  helpArticleId: 'yourmodule'                // opens the overview article
}
```

Cards carry **no** per-module `color`: the hub uses the single PoP accent.
Hub order follows the processing pipeline, so insert the entry at the point
where your module belongs in that pipeline.

### 5. Test Your Module

1. Restart the development server
2. Navigate to `/workspace`
3. Click your module card to launch

---

## Module UI Contract

Every workspace module follows the same conventions. The template already
implements them - keep them when you copy it.

### 1. Step markup

```html
<div class="yourmodule-module module-container">
  ${this.renderHeader()}
  ${this.renderStepNav()}
  <div class="step-contents">
    <div id="step1" class="step-content active">
      <div class="step-inner">
        <h3>Step Title</h3>
        ...
      </div>
    </div>
  </div>
</div>
```

Headings are `<h3>`; every step body sits in a `.step-inner` wrapper.
`renderHeader()` and `renderStepNav()` come from `BaseModule`; the outer div
carries the module root class **and** `module-container` (the class the shared
`:where(.module-container)` form baselines hang off).

Do not hand-write a container a component owns. The validation slot is
`${ValidationDisplay.renderContainer('validationResult')}`, and the step nav
markup only ever comes from `renderStepNav()`.

`.step-contents` is the scroll container **and** the container-query root
named `module` (see section 8).

### 2. Step gating

`canNavigateToStep(stepNumber)` is the single source of truth for which steps
are reachable. Pass it to `StepNavigator` as `canNavigate` so a blocked step
indicator is un-clickable and gets the `.blocked` class, and let
`BaseModule.goToStep()` enforce it (it notifies with the step's
`blockedMessage`):

```javascript
this.stepNavigator = new StepNavigator({
  steps: this.config.steps,
  currentStep: this.currentStep,
  onStepClick: (stepNum) => this.goToStep(stepNum),
  canNavigate: (stepNum) => this.canNavigateToStep(stepNum)
});
this.stepNavigator.init(this.container);
```

Your `goToStep()` override calls `super.goToStep(n)` and then
`this.stepNavigator.update(n)` to move the indicator and progress bar.

### 3. Help icons

Any heading or label can carry a help icon that opens the info panel on a
specific article. `renderHelpIcon(articleId)` returns the markup; components
take it through their `helpIconHtml` option:

```javascript
this.fileSelector = new FileSelector({
  title: 'Input Data',
  helpIconHtml: this.renderHelpIcon('yourmodule.step1.input-data'),
  // ...
});
```

Article ids are `<moduleId>.<step>.<topic>` and the articles themselves live
in `/public/workspace/content/modules/<moduleId>/`, indexed by
`content/manifest.json`.

### 4. The job button lives in the nav row

The primary long-running action (Start Processing, Generate Mesh, Start
Denoising, ...) is the right-hand button of the step's `.navigation-buttons`
row - not a button floating in the middle of the step:

```html
<div class="navigation-buttons">
  <button id="step3Back" class="btn secondary">Back</button>
  <button id="startProcessingBtn" class="btn primary">
    <span class="btn-glyph">&#9658;</span> Start Processing
  </button>
</div>
```

If the right slot needs two buttons, wrap them in `<div class="nav-actions">`.
There must be exactly one enabled red (`.btn.primary`) button on screen, so
hide the job button while the job runs and while the result card is shown
(`setJobButtonVisible(false)`), and bring it back on failure and on reset.

### 5. Result block = success card

```html
<div class="section-card success-card" id="processingResults" style="display: none;">
  <div class="success-header">
    <span class="success-icon">&#10003;</span>
    <span class="success-title">Processing Complete</span>
  </div>
  <div id="resultsDetails" class="validation-details"></div>
  <div class="success-actions">
    <button class="btn primary" id="downloadBtn">Download Results</button>
    <button class="btn secondary" id="resetBtn">Start New Run</button>
  </div>
</div>
```

The secondary action is always labelled **Start New Run**; a "view the output"
action is labelled **Open in Image Viewer** (or **Open in 3D Visualization**
for meshes). Do not reintroduce `.validation-success` wrappers or
`.result-actions` containers.

### 6. Job progress bar

```html
<div class="progress-bar-container">
  <div id="progressBar" class="job-progress-fill" style="width: 0%"></div>
</div>
```

Both rules live in `module-base.css` - never copy them into module CSS.

### 7. No inline handlers, no global free functions

No `onclick="..."` in `render()`, and no `window.nextStep` / `window.startProcessing`
style globals. Wire everything in `setupEventListeners()` with
`addEventListener`, tracking each listener so `deactivate()` can remove it:

```javascript
setupEventListeners() {
  const addListener = (element, event, handler) => {
    if (element) {
      element.addEventListener(event, handler);
      this.eventListeners.push({ element, event, handler });
    }
  };
  addListener(document.getElementById('startProcessingBtn'), 'click', () => this.startProcessing());
}
```

For markup you re-render with `innerHTML` (e.g. a list of per-result buttons),
the ids do not exist when `setupEventListeners()` runs. Delegate from the
stable parent and read `data-action` off the button instead:

```javascript
addListener(document.getElementById('resultsDetails'), 'click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'open-viewer') this.openInImageViewer(button.dataset.fileId);
});
```

One delegated listener survives every re-render.

A `window.yourModule = this` debugging handle is fine, as long as
`deactivate()` deletes it.

### 8. Reset on leave

`ModuleLoader` caches the module instance, and `BaseModule.activate()` calls
`render()` + `initialize()` again - so instance fields survive between visits.
`deactivate()` must therefore call `reset()` **before** `super.deactivate()`
(the DOM still exists at that point): clear the selected file, clear the
`FileSelector` selection, put config back to the constructor defaults, drop
result/job ids, and return to step 1.

### 9. Sample data

Every new workspace is seeded with a matched raw + annotation sample pair
(`WorkspaceManager.SAMPLE_FILES`), tracked exactly like uploads. They show up in
any `FileSelector` whose `fileType`/`filterTags` match (raw selectors get the
raw sample, annotation selectors get the annotation sample) with no extra
config - so there is nothing to enable and no `isTestData` branch to add.

### 10. Styling: tokens, baselines, icons, scoping

- **Tokens, never literals.** Colours, spacing, radii, font sizes and shadows
  all come from `core/css/module-base.css`: `--module-primary` / `-light`
  (accent + its 10 % tint for hover/focus/selection), `--module-secondary`,
  `--module-success/-warning/-danger/-info` and their `-bg/-border/-text`
  status trios, `--module-bg*` / `--module-card-bg` / `--module-surface`,
  `--module-border(-dark)`, `--module-text-primary/-secondary/-muted`,
  `--module-text-on-accent` (white on an accent or always-dark surface),
  `--module-spacing-*`, `--module-font-size-*`, `--module-radius-*`,
  `--module-shadow-*`, `--z-*`. A hex or `rgb()` in a module stylesheet is a
  bug: it will not follow dark mode. The only allowed literals are neutral
  `rgba(0, 0, 0, x)` shadows and scrims.
- **Do not restyle the baselines.** `module-base.css` sets zero-specificity
  `:where(.module-container)` rules for `h4`, `.field-hint`, `select`,
  `input[type=number|text|search]` (padding, border, radius, focus ring) and
  `input[type=checkbox|radio]` (accent colour, 16px). Only add layout on top -
  `flex: 1`, `min-width: 0`, `width: 100%`. Short numeric fields (a slice
  index, a pixel offset) get `class="input-sm"` in the markup instead of a
  width rule. The shared `.btn` family, `.section-card` / `.success-card`,
  `.progress-bar-container` + `.job-progress-fill`, `.metric-card`,
  `.form-field`, `.range-slider` and `.toggle-switch`
  (`<label class="toggle-switch"><input type="checkbox"><span class="toggle-slider"></span></label>`)
  are shared too - use them, never copy them into the module.
- **Icons come from `core/icons.js`, not emoji.** `import { icon } from
  '/workspace/js/core/icons.js'` and write `${icon('brush')} Brush`; the SVG
  inherits `currentColor` and 1em. `FileSelector` takes a name string
  (`icon: 'image'`). The only kept glyph entities are `&#9658;` in a
  `.btn-glyph` job button and `&#10003;` in a `.success-icon`.
- **Scope every selector under the module root class**
  (`.template-module ...`, dark variants `[data-theme="dark"] .template-module ...`).
  Module CSS is loaded on activate and *unloaded* on deactivate, so an
  unscoped rule leaks into every other module while yours is open, then
  vanishes - a class of bug that is very hard to spot.
- **Prefer container queries to viewport queries.** `.step-contents` is a
  container named `module`, so a two-column block that should collapse when
  the sidebar is open uses
  `@container module (max-width: 900px) { .template-module ... }`. Keep
  `@media (max-width: 768px)` only for genuine phone-level tweaks.

---

## Customization Checklist

### Essential Changes

- [ ] Rename class from `TemplateModule` to `YourModule`
- [ ] Update `id` in config
- [ ] Update `name` in config
- [ ] Update `cssPath` in config
- [ ] Update `steps` array for your workflow
- [ ] Update CSS class names (`.template-module` → `.yourmodule`)
- [ ] Register in `registry.js`

### Step Configuration

- [ ] Define steps in constructor config
- [ ] Update step condition flags (`filesValidated`, etc.)
- [ ] Override `canNavigateToStep()` for your logic
- [ ] Update step HTML in `render()`

### File Selection

- [ ] Configure FileSelector options (fileType, title, etc.)
- [ ] (Samples are auto-seeded into the workspace - no FileSelector test-data config)
- [ ] Implement `onFileSelected()` handler (including the `null` deselection case)
- [ ] Implement `onFileUploaded()` handler

### Processing

- [ ] Implement actual processing logic in `startProcessing()`
- [ ] Set up Socket.IO for real-time progress (if needed)
- [ ] Handle processing errors (job button visible again)
- [ ] Display results in `onProcessingComplete()` (success card, job button hidden)

### UI Contract

- [ ] Job button in the nav row's right slot, hidden while running / showing results
- [ ] Result block is a `.section-card.success-card` with `Start New Run`
- [ ] Progress bar uses `.progress-bar-container` + `.job-progress-fill`
- [ ] `StepNavigator` gets `canNavigate: (n) => this.canNavigateToStep(n)`
- [ ] Validation slot via `ValidationDisplay.renderContainer(id)`, not hand-written
- [ ] Help icons via `helpIconHtml` / `renderHelpIcon(articleId)` where a topic needs one
- [ ] No inline `onclick`, no `window.*` free functions; `data-action` delegation for re-rendered markup
- [ ] `deactivate()` calls `reset()` before `super.deactivate()`
- [ ] Every selector in the module CSS starts with the module root class
- [ ] No colour/spacing/radius literals - design tokens only
- [ ] Selects, inputs, `h4` and `.field-hint` left to the module-base baselines
- [ ] Icons via `icon()` from `core/icons.js`, no emoji

### Backend Integration

- [ ] Create backend API endpoints (if needed)
- [ ] Create Python processing script (if needed)
- [ ] Set up Socket.IO events (if needed)

### Cleanup

- [ ] Remove unused template code
- [ ] Update comments and documentation
- [ ] Test all functionality

---

## File Structure

```
yourmodule/
├── YourModule.js       # Main module class
├── css/
│   └── yourmodule.css  # Module-specific styles
└── README.md           # Module documentation (optional)
```

---

## Common Patterns

### Adding More Steps

```javascript
// In constructor config:
steps: [
  { id: 'upload', name: 'Upload' },
  { id: 'preprocess', name: 'Preprocess' },
  { id: 'configure', name: 'Configure' },
  { id: 'process', name: 'Process' },
  { id: 'visualize', name: 'Visualize' }
]

// Add corresponding HTML in render():
<div id="step4" class="step-content">...</div>
<div id="step5" class="step-content">...</div>

// Update canNavigateToStep():
case 4: return this.processingComplete;
case 5: return this.visualizationReady;
```

### Skipping Steps (Conditional Workflow)

```javascript
// For example, skip training if model is imported
canNavigateToStep(stepNumber) {
  if (stepNumber === 3 && this.hasImportedModel) {
    return true; // Allow skipping to step 4
  }
  // ... normal logic
}

goToStep(stepNumber) {
  // Skip step 3 if model imported
  if (stepNumber === 3 && this.hasImportedModel) {
    stepNumber = 4;
  }
  super.goToStep(stepNumber);
}
```

### Real-Time Progress with Socket.IO

```javascript
async startProcessing() {
  // Start processing on server
  const response = await fetch('/api/yourmodule/start', {
    method: 'POST',
    body: JSON.stringify({ file: this.uploadedFile.path })
  });
  const { taskId } = await response.json();

  // Connect to Socket.IO
  this.socket = io();
  this.socket.emit('join-yourmodule', taskId);

  // Listen for progress
  this.socket.on('yourmodule-progress', (data) => {
    this.updateProgress(data.percent, data.status);
  });

  // Listen for completion
  this.socket.on('yourmodule-complete', (result) => {
    this.onProcessingComplete(result);
  });
}
```

### Multiple File Selectors

```javascript
// In initialize():
this.rawFileSelector = new FileSelector({
  id: 'raw_images',
  fileType: 'raw_images',
  title: 'Raw Images',
  // ...
});

this.annotationSelector = new FileSelector({
  id: 'annotations',
  fileType: 'annotations',
  title: 'Annotations',
  // ...
});

// Check both in canNavigateToStep:
case 2:
  return this.rawFilesSelected && this.annotationsSelected;
```

---

## Troubleshooting

### Module Not Loading

1. Check path in `registry.js` is correct
2. Check for JavaScript errors in browser console
3. Verify `export default YourModule` at end of file
4. Restart development server

### Styles Not Applying

1. Verify CSS import path in config
2. Check `@import` statement for module-base.css
3. Verify class names match in CSS and HTML
4. Hard refresh browser (Ctrl+Shift+R)

### Components Not Working

1. Ensure components are initialized in `initialize()`
2. Check container elements exist in HTML
3. Verify component imports are correct

---

## Related Documentation

- [Module Framework](../../../docs/guides/MODULE_FRAMEWORK.md) - Full API reference
- [Module Creation Guide](../../../docs/guides/MODULE_CREATION.md) - Step-by-step tutorial
- [BaseModule Source](../../core/BaseModule.js) - Base class implementation
