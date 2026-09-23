# Module Framework Documentation

**Last Updated:** 2026-09-03
**Framework Version:** 1.1
**Target Audience:** Developers creating or maintaining workspace modules

---

## Overview

The Module Framework provides a consistent structure for building workspace modules. It includes:

- **BaseModule** - Abstract base class with lifecycle management and step navigation
- **Five reusable components** - StepNavigator, NavigationButtons, ValidationDisplay,
  FileSelector, SliceViewerChrome
- **Shared CSS** - Design tokens, zero-specificity baselines and common styles via
  `module-base.css`
- **Shared icon set** - `core/icons.js` (inline SVG, never emoji)

> The component set in `core/components/index.js` is exactly the five listed
> above. A component nothing imports does not stay in the framework: tracker
> D16 deleted three unused ones, plus the unused runtime-lookup helpers that
> the index used to export.
>
> The help-panel components in the same directory (`InfoPanel`, `InfoArticle`,
> `InfoGlossary`, `InfoSearch`) are loaded as plain (non-module) `<script>` tags by
> `workspace/index.html`, and `ResumeDialog` is dynamically imported by
> `workspace.js` - none of them are exported from the index.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Module Framework                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │   BaseModule    │    │  Components (core/components)│    │
│  │                 │    │                              │    │
│  │ • activate()    │    │ • StepNavigator              │    │
│  │ • deactivate()  │    │ • NavigationButtons          │    │
│  │ • goToStep()    │    │ • ValidationDisplay          │    │
│  │ • render()      │    │ • FileSelector               │    │
│  │ • renderHeader()│    │ • SliceViewerChrome          │    │
│  │ • renderStepNav()    │                              │    │
│  │ • loadCSS()     │    └──────────────────────────────┘    │
│  │ • unloadCSS()   │    ┌──────────────────────────────┐    │
│  │ • showLoading() │    │  core/icons.js — icon(name)  │    │
│  └────────┬────────┘    └──────────────────────────────┘    │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              module-base.css                         │    │
│  │                                                      │    │
│  │  Tokens:    --module-primary, --module-spacing-*, …  │    │
│  │  Baselines: :where(.module-container) select/input/… │    │
│  │  Shared:    .btn, .step-nav, .section-card, …        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Your Module                               │
│                                                              │
│  class MyModule extends BaseModule {                         │
│    constructor(stateManager) {                               │
│      super(stateManager, { ... config ... });                │
│    }                                                         │
│    render() { ... }                                          │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

The fastest way in is to copy `/public/workspace/js/modules/template/` - it
implements every convention below, and its `README.md` is the UI contract.

---

## Quick Start

### 1. Extend BaseModule

```javascript
import BaseModule from '/workspace/js/core/BaseModule.js';

class MyModule extends BaseModule {
  constructor(stateManager) {
    super(stateManager, {
      id: 'mymodule',
      name: 'My Module',
      cssPath: '/workspace/js/modules/mymodule/css/mymodule.css',
      steps: [
        { id: 'upload', name: 'Upload Data' },
        { id: 'process', name: 'Process' },
        { id: 'results', name: 'Results' }
      ]
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="mymodule-module module-container">
        ${this.renderHeader()}
        ${this.renderStepNav()}
        <div class="step-contents">
          <div id="step1" class="step-content active">
            <div class="step-inner">
              <h3>Upload Data</h3>
              <div id="fileSelectorContainer"></div>
              ${ValidationDisplay.renderContainer('validationResult')}
              <div class="navigation-buttons">
                <div></div>
                <button id="step1Next" class="btn" disabled>Next: Process</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

export default MyModule;
```

The outer element carries the module root class **and** `module-container` -
the latter is what the shared `:where(.module-container)` form baselines hang
off. `.step-contents` is both the scroll container and the container-query
root (see [Container queries](#container-queries)).

### 2. Use Components

```javascript
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';

// In your initialize() method - the markup is already in the DOM, so the
// components attach to it rather than producing it:
this.stepNavigator = new StepNavigator({
  steps: this.config.steps,
  currentStep: this.currentStep,
  onStepClick: (step) => this.goToStep(step),
  canNavigate: (step) => this.canNavigateToStep(step)
});
this.stepNavigator.init(this.container);

this.validationDisplay = new ValidationDisplay('validationResult');
```

### 3. Wire the buttons yourself

No `onclick="..."` in `render()`, and no `window.nextStep`-style free
functions. Wire every button in `setupEventListeners()`, tracking the
listeners so `deactivate()` can remove them:

```javascript
setupEventListeners() {
  const addListener = (element, event, handler) => {
    if (element) {
      element.addEventListener(event, handler);
      this.eventListeners.push({ element, event, handler });
    }
  };

  // #backToHub comes from renderHeader()
  addListener(document.getElementById('backToHub'), 'click', () => window.workspace.returnToHub());
  addListener(document.getElementById('step1Next'), 'click', () => this.nextStep());

  // Markup you rebuild with innerHTML: delegate from the stable parent
  addListener(document.getElementById('resultsDetails'), 'click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button?.dataset.action === 'open-viewer') this.openInImageViewer(button.dataset.fileId);
  });
}
```

### 4. Reset on leave

`ModuleLoader` caches the module instance and `activate()` only re-renders, so
instance fields survive between visits. `deactivate()` must call your `reset()`
**before** `super.deactivate()` (the DOM still exists at that point), then
remove the tracked listeners, disconnect Socket.IO, and delete any
`window.*` debugging handle.

### 5. Import Shared CSS

```css
/* In your module's CSS file */
@import url('/workspace/js/core/css/module-base.css');

/* Add module-specific styles below - every selector scoped to the
   module root class, tokens only, no colour literals */
```

`BaseModule.loadCSS()` loads this sheet on activate (tagged with
`data-module-css="<moduleId>"`) and `ModuleLoader` calls `unloadCSS()` after
`deactivate()` to remove it again - so an *unscoped* rule leaks into every
other module while yours is open and then vanishes.

---

## BaseModule API Reference

### Constructor

```javascript
constructor(stateManager, config)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `stateManager` | StateManager | The centralized state manager instance |
| `config` | Object | Module configuration (see below) |

#### Config Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique module identifier |
| `name` | string | Yes | Display name |
| `cssPath` | string | No | Path to module CSS file (loaded on activate, unloaded on deactivate) |
| `steps` | Array | No | Step configuration array - `{ id, name, canNavigate?, shouldSkip?, blockedMessage? }` |

**Never assign to `this.config`** in a subclass: BaseModule keeps the module
configuration there.

### Lifecycle Methods

#### `async activate()`
Called when the module is loaded. Default implementation:
1. Gets container element
2. Loads CSS (if `config.cssPath` specified)
3. Calls `loadDependencies()`
4. Calls `render()`
5. Calls `initialize()`

**Note:** Loading overlay is handled by ModuleLoader - don't call `showLoading()` in activate.

#### `async deactivate()`
Called when leaving the module. The default implementation clears the container
HTML and resets `currentStep` to 1. Override it to call your `reset()` first,
remove tracked listeners and disconnect sockets, then `await super.deactivate()`.
`ModuleLoader` calls `unloadCSS()` afterwards.

#### `cleanup()`
Optional cleanup method for releasing resources.

### Abstract Methods (Must Override)

#### `render()`
Render the module UI into `this.container`. Must be implemented by subclass.

### Optional Override Methods

#### `async loadDependencies()`
Load external dependencies (scripts, libraries). Override for custom loading.

#### `async initialize()`
Initialize components after render. Called automatically after `render()`.

### Step Navigation Methods

#### `goToStep(stepNumber)`
Navigate to a specific step (1-indexed).

```javascript
this.goToStep(2); // Go to step 2
```

#### `nextStep()`
Navigate to the next step.

#### `previousStep()`
Navigate to the previous step.

#### `canNavigateToStep(stepNumber)`
Check if navigation to a step is allowed. The base implementation reads the
step's `canNavigate` (boolean or `(module) => boolean`); override it for
flag-based logic. This is the **single source of truth** for step gating -
pass it to `StepNavigator` as `canNavigate` so blocked step indicators are
un-clickable and get the `.blocked` class.

```javascript
canNavigateToStep(stepNumber) {
  switch (stepNumber) {
    case 1: return true;
    case 2: return this.filesValidated;
    case 3: return this.configSaved;
    default: return false;
  }
}
```

`goToStep()` also honours the step's `shouldSkip` (skipping forward or
backward depending on direction) and notifies with `blockedMessage` when
navigation is refused.

#### `onStepChange(previousStep, newStep)`
Hook called after a successful navigation. Override for step-specific setup.

#### `setupStepClickHandlers()`
Binds clicks on the `.step` indicators straight to `goToStep()`. Only needed
if the module does **not** use `StepNavigator` (which does the same thing plus
`canNavigate` gating).

### Utility Methods

#### `async loadCSS(href, id)`
Load a stylesheet dynamically. Called automatically for `config.cssPath`. The
`<link>` is tagged `data-module-css="<moduleId>"`.

```javascript
await this.loadCSS('/path/to/styles.css', 'my-styles');
```

#### `unloadCSS()`
Removes every stylesheet this module loaded through `loadCSS()`. Called by
`ModuleLoader` after `deactivate()`, so a module's unscoped rules cannot leak
into the next module. The next `activate()` loads the sheet again (browser
cache makes that cheap).

#### `async loadScript(src, isModule = false)`
Load a JavaScript file dynamically.

```javascript
await this.loadScript('/socket.io/socket.io.js');
```

#### `showLoading(title, description)`
Show the shared `.module-loading-overlay` (spinner + title + description).
Use for long operations within the module; a second call updates the text of
the existing overlay rather than stacking one.

```javascript
this.showLoading('Processing', 'Please wait...');
```

#### `hideLoading()`
Remove the loading overlay.

#### `renderHeader(title)`
Returns HTML for the module header: a `#backToHub` button and the title
(defaults to `config.name`). Wire `#backToHub` in your
`setupEventListeners()`.

```javascript
${this.renderHeader()}
```

#### `renderStepNav()`
Returns HTML for the step navigation bar: a `.progress-bar` / `.progress-fill`
above the `.step-nav` row of numbered `.step` indicators, built from
`config.steps`. This is the only place that markup should come from.

#### `updateStepNavigation()` / `updateStepContent()` / `updateProgressBar()`
Called by `goToStep()`; override only if your step chrome differs.

#### `saveState()` / `restoreState()`
Empty hooks for persisting module state through the StateManager.

---

## Component API Reference

All five components are exported from
`/workspace/js/core/components/index.js` (and re-exported from
`/workspace/js/core/index.js`). They **attach to markup the module already
rendered** - none of them injects a step chrome of its own.

### StepNavigator

Drives the step navigation bar produced by `BaseModule.renderStepNav()`:
click navigation gated by `canNavigate`, plus the active / completed /
blocked states and the progress fill.

#### Constructor

```javascript
const stepNav = new StepNavigator({
  steps: [
    { id: 'upload', name: 'Upload' },
    { id: 'config', name: 'Configure' },
    { id: 'process', name: 'Process' }
  ],
  currentStep: 1,
  onStepClick: (stepNumber) => this.goToStep(stepNumber),
  canNavigate: (stepNumber) => this.canNavigateToStep(stepNumber)
});
```

| Option | Type | Description |
|--------|------|-------------|
| `steps` | Array | Array of step objects with `id` and `name` |
| `currentStep` | number | Current active step (1-indexed) |
| `onStepClick` | Function | Callback when a step is clicked |
| `canNavigate` | Function | `(stepNumber) => boolean`; a click on a step that returns false is ignored |

#### Methods

| Method | Description |
|--------|-------------|
| `init(container)` | Bind the `.step` elements already in the DOM (call after `render()`) |
| `update(stepNumber)` | Move to a step: updates classes, `.blocked` states and the progress fill |
| `setStepState(stepNumber, state)` | Set one step's state: 'active', 'completed', 'blocked', 'default' |
| `totalSteps` / `progressPercent` | Getters |

---

### NavigationButtons

Manages a Previous/Next `.navigation-buttons` row that the module wrote into
its own step markup. Optional - most modules just wire the two buttons with
`addEventListener` and set `disabled` directly.

#### Constructor

```javascript
// In render():
// <div class="navigation-buttons">
//   <div></div>
//   <button id="step1Next" class="btn" disabled>Next: View Image</button>
// </div>

this.navigationButtons = new NavigationButtons({
  showPrevious: false,
  onNext: () => this.proceedToViewer(),
  nextLabel: 'Next: View Image',
  nextDisabled: true,
  nextId: 'step1Next'
});
this.navigationButtons.init(this.container);
```

| Option | Type | Description |
|--------|------|-------------|
| `previousId` / `nextId` | string | IDs of the buttons in your markup (default `nav-btn-previous` / `nav-btn-next`) |
| `onPrevious` / `onNext` | Function | Click handlers (skipped while the button is disabled) |
| `previousLabel` / `nextLabel` | string | Starting labels for the component's bookkeeping |
| `showPrevious` / `showNext` | boolean | Starting visibility |
| `previousDisabled` / `nextDisabled` | boolean | Starting disabled state |

The label / visible / disabled options only seed the component's own state -
the initial markup is yours, so set `disabled` and the labels there.

#### Methods

| Method | Description |
|--------|-------------|
| `init(container)` | Find the buttons and attach the handlers |
| `setNextEnabled(bool)` / `setPreviousEnabled(bool)` | Enable/disable |
| `setNextVisible(bool)` / `setPreviousVisible(bool)` | Show/hide |
| `setNextLabel(text)` / `setPreviousLabel(text)` | Change a label |
| `getNextButton()` / `getPreviousButton()` | The elements |

---

### FileSelector

The standard `.file-selector-card` picker: a dropdown over the workspace
files, an optional upload button, an optional built-in test-data option, and
a preview line. It renders its own card, so the module only supplies a
container div.

#### Constructor

```javascript
this.fileSelector = new FileSelector({
  id: 'raw_images',
  fileType: 'uploads',
  filterTags: ['raw'],
  title: 'Raw Images',
  icon: 'image',                                            // core/icons.js name
  helpIconHtml: this.renderHelpIcon('mymodule.step1.raw'),  // info-panel link
  showTestData: true,
  testDataKind: 'raw',
  stateManager: this.state,
  onSelect: (fileInfo) => this.onFileSelected(fileInfo),
  onUpload: (file, result) => this.onFileUploaded(file, result)
});

container.innerHTML = this.fileSelector.render();
await this.fileSelector.init();
```

| Option | Type | Description |
|--------|------|-------------|
| `id` | string | Unique identifier; also the prefix of the element ids inside the card |
| `title` | string | Display title (also used in the upload button label) |
| `icon` | string | An icon **name** from `core/icons.js` (`'image'`, `'tag'`, `'model'`, …), ready-made SVG, or nothing (`folder`) |
| `helpIconHtml` | string | Markup from the module's `renderHelpIcon(articleId)`, shown next to the title |
| `fileType` | string | Workspace category to list (also the default upload category) |
| `uploadCategory` | string | Upload category when it differs from `fileType` |
| `filterTags` / `excludeTags` | Array | Tags a file must / must not have |
| `accept` | string | Accepted extensions (default `.tif,.tiff`) |
| `acceptAllTiff` | boolean | Accept any TIFF regardless of category |
| `showUpload` | boolean | Render the upload button (default true) |
| `showTestData` | boolean | Show the test-data optgroup (default true) |
| `testDataKind` | string | `'raw' \| 'inference' \| 'denoising' \| 'annotations'`. Picking the test option POSTs `/api/workspace/test-data`, copying the built-in stack into the workspace; the selector then reports it exactly like a picked workspace file, so **no `isTestData` branch is needed** |
| `showRecentResults` | boolean | Show the recent-results optgroup |
| `resultCategories` / `resultCategoryLabels` / `resultTags` | Array/Object | Which results to offer and how to label them |
| `mode` | `'select'` \| `'list'` | `'list'` adds an Add button next to the dropdown and reports through `onAdd` instead of keeping a selection (used by the stitching stack list) |
| `onAdd` / `addLabel` | Function/string | List mode: the add callback and the button label |
| `filterFiles` | Function | `(files) => files` - custom filter on top of the category/tag filters |
| `filterRecentResults` | Function | `(results) => results` |
| `extraGroups` | Array | Additional optgroups after the workspace files: `[{ label, filter: (allFiles) => files }]`. Files come from the full listing (only the extension check applies), so a group can list files the regular filters would drop (e.g. WIP results) |
| `uploadEndpoint` | string | Default `/api/workspace/upload` |
| `stateManager` | StateManager | Used for notifications |
| `onSelect` / `onUpload` / `onValidate` | Function | Selection (`null` when cleared), upload, and pre-upload validation callbacks |

#### Methods

| Method | Description |
|--------|-------------|
| `render()` | Returns the card HTML |
| `async init(container)` | Attach listeners and load the file list |
| `getSelectedFile()` / `setSelectedFile(fileInfo)` | Read / set the selection |
| `clearSelection()` | Clear the selection (use this in `reset()`, not just `refresh()`) |
| `async refresh()` | Reload the file list |
| `setEnabled(bool)` / `setAddEnabled(bool)` | Enable/disable the dropdown / Add button |
| `subscribeToFileChanges(stateManager, path)` | Repopulate when `workspace.files` changes |

---

### SliceViewerChrome

The shared header / slider strip / footer around a slice canvas, used by the
slice viewers. The module keeps its own canvas or engine; the chrome renders
the frame and turns clicks, slider input, the slice-number field and the ←/→
keys into callbacks. Styles live in `core/css/slice-viewer.css` (imported by
`module-base.css`). Slice indices are **0-based in the API and displayed
1-based** (`n / N`).

```javascript
this.chrome = new SliceViewerChrome({
  slices: 12,
  onSliceChange: (index0) => this.goToSlice(index0),
  onZoomIn: () => this.canvas.zoomIn(),
  showUndoRedo: true,
  onUndo: () => this.history.undo()
});

// in render(): <div class="sv-main">${this.chrome.render()}<div class="sv-toolbar">…</div></div>
this.chrome.mount(rootElement);       // after the markup is in the DOM
this.chrome.area.appendChild(canvas); // host div that fills the canvas box
```

| Option | Type | Description |
|--------|------|-------------|
| `slices` / `slice` | number | Total count / initial slice (0-based) |
| `showPrevNext` | boolean | The `◀ n / N ▶` group in the header (default true) |
| `showSlider` | boolean | Full-width slider strip under the canvas (default true) |
| `showZoom` | boolean | The zoom group (default true) |
| `showUndoRedo` | boolean | The undo/redo group (default false) |
| `headerExtra` | string | Extra HTML for the right side of the header |
| `footerLeft` / `footerRight` | string | Initial footer text |
| `keyboard` | boolean | Bind ←/→ on document (default true) |
| `isActive` | Function | `() => boolean`; keys are ignored when false |
| `onSliceChange` | Function | `(index0) => void` |
| `onZoomIn` / `onZoomOut` / `onZoomFit` / `onZoomReset` | Function | Zoom callbacks |
| `onUndo` / `onRedo` | Function | History callbacks |

#### Methods

| Method | Description |
|--------|-------------|
| `render()` | Returns the `.sv-wrap` markup |
| `mount(root)` | Bind after the markup is in the DOM |
| `area` | Getter: the host div to put the canvas into |
| `setSlice(index0, total)` / `setSlices(total)` | Update the slice readout |
| `setZoom(zoom)` | Update the zoom readout |
| `setStatus(text, isError)` | Header status text |
| `setFooter(left, right, leftClass, rightClass)` | Footer text |
| `setHistory(canUndo, canRedo)` | Enable/disable undo/redo |
| `destroy()` | Unbind the keyboard handler - call in `deactivate()` |

---

### ValidationDisplay

Displays validation messages with success/error/info/warning styling, using
the shared `core/icons.js` icons.

#### Constructor

```javascript
// In render(): let the component own the container markup
${ValidationDisplay.renderContainer('validationResult')}

// In initialize():
this.validationDisplay = new ValidationDisplay('validationResult');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `containerId` | string | ID of the container element |

#### Methods

| Method | Description |
|--------|-------------|
| `static renderContainer(id)` | Returns the hidden `.validation-container` div - use this instead of hand-writing `<div id="validationResult">` |
| `show(type, title, details)` | Show message with type: 'success', 'error', 'info', 'warning' |
| `showSuccess(title, details)` | Show success message |
| `showError(title, details)` | Show error message |
| `showInfo(title, details)` | Show info message |
| `showWarning(title, details)` | Show warning message |
| `showLoading(message)` | Show loading state |
| `hide()` | Clear and hide the display |
| `reset()` | Drop the cached container reference (after the DOM is rebuilt) |

#### Details Format

Details can be a string or array of objects:

```javascript
// String
validation.showError('Validation Failed', 'File format not supported');

// Array of details
validation.showSuccess('Validation Passed', [
  { label: 'Dimensions', value: '512x512x100' },
  { label: 'Data Type', value: 'uint8' },
  { label: 'File Size', value: '52 MB' }
]);
```

---

## Styling

### Tokens, never literals

Import `module-base.css` at the top of your module stylesheet and take every
colour, space, radius, font size and shadow from a token. Each one is
redefined under `[data-theme="dark"]`, so **a hex or `rgb()` in a module
stylesheet is a bug: it will not follow dark mode.** The only allowed literals
are neutral `rgba(0, 0, 0, x)` shadows and scrims.

#### Colors (light values; dark mode overrides them)

| Variable | Value | Description |
|----------|-------|-------------|
| `--module-primary` | #EB1F17 | PoP accent - the single accent in the app |
| `--module-primary-dark` / `-hover` | #C91810 | Pressed / hover accent |
| `--module-primary-light` | rgba(235,31,23,.1) | 10% tint for hover, focus rings, selection |
| `--module-secondary` | #1DA924 | Secondary accent |
| `--module-gradient` / `-hover` | linear-gradient(...) | Accent gradient |
| `--module-text-on-accent` | #FFFFFF | Text on an accent or always-dark surface |

#### Status Colors

`--module-success`, `--module-warning`, `--module-danger`, `--module-info` are
the solid semantic colours; each of success / error / info / warning also has a
`-bg` / `-border` / `-text` trio for message blocks:

| Variable | Light value |
|----------|-------------|
| `--module-success-bg` / `-border` / `-text` | #d4edda / #c3e6cb / #155724 |
| `--module-error-bg` / `-border` / `-text` | #f8d7da / #f5c6cb / #721c24 |
| `--module-info-bg` / `-border` / `-text` | #d1ecf1 / #bee5eb / #0c5460 |
| `--module-warning-bg` / `-border` / `-text` | #fff3cd / #ffeeba / #856404 |

#### Neutral Colors

| Variable | Light value |
|----------|-------------|
| `--module-bg` / `-secondary` / `-tertiary` / `-hover` | #F8F9FA / #F8F9FA / #E9ECEF / #E9ECEF |
| `--module-card-bg` | #FFFFFF |
| `--module-surface` | rgba(0,0,0,.02) |
| `--module-border` / `--module-border-dark` | #DEE2E6 / #CED4DA |
| `--module-text-primary` / `-secondary` / `-muted` | #343A40 / #6C757D / #868E96 |
| `--module-viewer-bg` / `--module-bg-dark` / `--module-chrome-bg` | #1a1a2e / #1a1a1a / rgba(0,0,0,.2) - image canvases are dark in both themes |

#### Spacing

| Variable | Value |
|----------|-------|
| `--module-spacing-xs` | 8px |
| `--module-spacing-sm` | 16px |
| `--module-spacing-md` | 20px |
| `--module-spacing-lg` | 24px |
| `--module-spacing-xl` | 30px |
| `--module-spacing-xxl` | 40px |

#### Typography & Borders

| Variable | Value |
|----------|-------|
| `--module-font-family` | System font stack |
| `--module-font-size-xs` … `-xxl` | 12 / 14 / 16 / 18 / 24 / 28px |
| `--module-radius-sm` / `-md` / `-lg` / `-xl` | 6 / 8 / 10 / 12px |
| `--module-input-width-sm` / `-md` | 70px / 110px |

#### Shadows, Transitions, Layers

| Variable | Description |
|----------|-------------|
| `--module-shadow-sm` / `-md` / `-lg` | Elevation shadows |
| `--module-shadow-button` / `-button-hover` | Accent-tinted button shadows |
| `--module-transition-fast` / `-normal` / `-slow` | 0.2s / 0.3s / 0.5s ease |
| `--z-raised` / `-chrome` / `-panel` / `-module-overlay` / `-notification` / `-overlay` / `-modal` / `-modal-top` | Stacking layers, defined in `workspace.css` - never hard-code a `z-index` |

### Baselines: do not restyle them

`module-base.css` sets zero-specificity `:where(.module-container)` rules, so
any class-qualified rule in your module still wins - but you should not need
one. They cover:

- `h4` (section heading) and `.field-hint` (xs, secondary) typography roles
- `select` and `input[type=number|text|search]`: padding, border, radius,
  background, and the focus ring
- `input[type=checkbox|radio]`: accent colour and 16px size

Only add layout on top (`flex: 1`, `min-width: 0`, `width: 100%`). A short
numeric field (a slice index, a pixel offset) gets `class="input-sm"` in the
markup instead of a width rule.

The shared `.btn` family, `.section-card` / `.section-card.success-card`,
`.progress-bar-container` + `.job-progress-fill`, `.metric-card`,
`.form-field`, `.range-slider` and `.toggle-switch` are shared too - use them,
never copy them into the module.

### Icons

Icons come from `core/icons.js`, never emoji (ADR-005). Every icon is a 24×24
`currentColor` path, so it takes the colour and size of the surrounding text:

```javascript
import { icon } from '/workspace/js/core/icons.js';

button.innerHTML = `${icon('play')} Start`;         // decorative (aria-hidden)
button.innerHTML = icon('undo', { label: 'Undo' }); // labelled (role="img" + <title>)
icon('next', { size: 18 })                          // explicit pixel size
```

`hasIcon(name)` and `ICON_NAMES` are exported alongside. `FileSelector` takes
an icon **name** in its `icon` option, so a module does not have to import
this file just to label a picker. The only kept glyph entities are `&#9658;`
in a `.btn-glyph` job button and `&#10003;` in a `.success-icon`.

### Scoping

Every selector in a module stylesheet starts with the module root class
(`.mymodule-module ...`, dark variants
`[data-theme="dark"] .mymodule-module ...`). Module CSS is loaded on activate
and *unloaded* on deactivate, so an unscoped rule leaks into every other
module while yours is open, then vanishes - a class of bug that is very hard
to spot.

### Container queries

`.step-contents` is a container query root, `container-type: inline-size` and
`container-name: module`, so a layout can respond to the module area's width
(which already excludes the sidebar):

```css
@container module (max-width: 900px) {
  .mymodule-module .two-column { grid-template-columns: 1fr; }
}
```

Keep `@media (max-width: 768px)` only for genuine phone-level tweaks.

---

## Step Configuration Guide

### Basic Step Configuration

```javascript
{
  steps: [
    { id: 'upload', name: 'Data Upload' },
    { id: 'config', name: 'Configuration' },
    { id: 'train', name: 'Training' },
    { id: 'inference', name: 'Inference' }
  ]
}
```

### Conditional Navigation

Override `canNavigateToStep()` for conditional logic:

```javascript
canNavigateToStep(stepNumber) {
  switch(stepNumber) {
    case 1:
      return true; // Always accessible
    case 2:
      return this.filesValidated; // Requires validation
    case 3:
      return this.configSaved; // Requires config
    case 4:
      return this.trainingComplete || this.hasImportedModel;
    default:
      return false;
  }
}
```

### Step State Flags

Track step completion with instance properties:

```javascript
constructor(stateManager) {
  super(stateManager, config);

  // Step condition flags
  this.filesValidated = false;
  this.configSaved = false;
  this.trainingComplete = false;
}

// Update flags when conditions are met
onValidationSuccess() {
  this.filesValidated = true;
}
```

---

## Migration Guide

### Migrating from Custom Module to BaseModule

#### Step 1: Update Imports

```javascript
// Before
class MyModule {
  constructor(stateManager) { ... }
}

// After
import BaseModule from '/workspace/js/core/BaseModule.js';

class MyModule extends BaseModule {
  constructor(stateManager) {
    super(stateManager, {
      id: 'mymodule',
      name: 'My Module',
      cssPath: '/path/to/css'
    });
  }
}
```

#### Step 2: Use renderHeader() and renderStepNav()

```javascript
render() {
  this.container.innerHTML = `
    <div class="mymodule-module module-container">
      ${this.renderHeader()}
      ${this.renderStepNav()}
      <div class="step-contents">
        <div id="step1" class="step-content active">
          <div class="step-inner"><!-- Step content --></div>
        </div>
      </div>
    </div>
  `;
}
```

#### Step 3: Initialize Components in initialize()

```javascript
async initialize() {
  // Initialize StepNavigator
  this.stepNavigator = new StepNavigator({
    steps: this.config.steps,
    currentStep: this.currentStep,
    onStepClick: (step) => this.goToStep(step),
    canNavigate: (step) => this.canNavigateToStep(step)
  });
  this.stepNavigator.init(this.container);

  // Initialize other components...
}
```

#### Step 4: Update goToStep() Calls

```javascript
// Update step navigator when step changes
goToStep(stepNumber) {
  super.goToStep(stepNumber);

  if (this.stepNavigator) {
    this.stepNavigator.update(stepNumber);
  }
}
```

#### Step 5: Replace Inline Validation with ValidationDisplay

```javascript
// Before
const div = document.getElementById('result');
div.className = 'success';
div.innerHTML = '<h4>Success!</h4><p>Details...</p>';

// After - container from ValidationDisplay.renderContainer('validationResult')
this.validationDisplay.showSuccess('Success!', [
  { label: 'Status', value: 'Completed' }
]);
```

#### Step 6: Replace inline handlers and globals

Delete every `onclick="..."` and every `window.someFreeFunction` the module
relied on, and wire the buttons in `setupEventListeners()` instead (tracked, so
`deactivate()` can remove them). Use delegated `data-action` listeners for
markup you rebuild with `innerHTML`. A `window.myModule = this` debugging
handle is fine as long as `deactivate()` deletes it.

#### Step 7: Add reset-on-leave

Move everything that puts the module back to its fresh state into a `reset()`,
call it from both "Start New Run" and `deactivate()` (before
`super.deactivate()`), and clear the `FileSelector` selection there with
`clearSelection()`.

#### Step 8: Update CSS to Import Base

```css
/* At top of your module CSS */
@import url('/workspace/js/core/css/module-base.css');

/* Remove duplicate styles that are now in base, replace literals with
   tokens, and scope every remaining selector to the module root class */
```

---

## File Structure

```
/public/workspace/js/
├── core/
│   ├── BaseModule.js           # Base class
│   ├── ModuleLoader.js         # Dynamic loading, activate/deactivate/unloadCSS
│   ├── StateManager.js         # Centralized state
│   ├── WorkspaceAPI.js         # Backend API client
│   ├── icons.js                # icon(name) - shared inline-SVG set
│   ├── index.js                # Core exports (BaseModule + the 5 components)
│   ├── css/
│   │   ├── module-base.css     # Tokens, baselines, shared component styles
│   │   └── slice-viewer.css    # .sv-* chrome (imported by module-base.css)
│   └── components/
│       ├── index.js            # Component exports (the 5 below)
│       ├── StepNavigator.js
│       ├── NavigationButtons.js
│       ├── ValidationDisplay.js
│       ├── FileSelector.js
│       ├── SliceViewerChrome.js
│       ├── InfoPanel.js        # help panel - loaded via <script>, not exported
│       ├── InfoArticle.js      #   "
│       ├── InfoGlossary.js     #   "
│       ├── InfoSearch.js       #   "
│       └── ResumeDialog.js     # dynamically imported by workspace.js
│
└── modules/
    ├── registry.js             # Module registry
    ├── template/               # Starter template + UI contract README
    │   ├── TemplateModule.js
    │   ├── README.md
    │   └── css/template.css
    ├── segmentation/
    │   ├── SegmentationModule.js
    │   └── css/
    │       └── segmentation-modern.css
    └── imageviewer/
        ├── ImageViewerModule.js
        └── css/
            └── imageviewer.css
```

---

## Related Documentation

- [Module Creation Guide](MODULE_CREATION.md) - Step-by-step module creation
- [Template module README](../../public/workspace/js/modules/template/README.md) - the UI contract
- [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) - System design
- [State Architecture](../architecture/STATE_ARCHITECTURE.md) - State management

---

**Navigation:**
← [Module Creation](MODULE_CREATION.md) | [Guides](.) | [Troubleshooting](TROUBLESHOOTING.md) →
