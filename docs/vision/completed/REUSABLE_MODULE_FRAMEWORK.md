# Reusable Module Structure Framework

## Overview

Create a reusable module framework ensuring visual and structural consistency across all workspace modules (Segmentation, Image Viewer, and future modules).

### Design Decisions (User Confirmed)
- **Architecture**: Base class + composable components
- **File Sections**: Hybrid (fixed types + custom sections)
- **Styling**: Strict consistency (all modules use same design)
- **Step Flow**: Conditional steps (can skip/show based on config)

---

## Phase 1: Shared CSS Foundation

**Objective**: Create unified CSS with design tokens that all modules inherit.

### Files to Create/Modify
| File | Action |
|------|--------|
| `/public/workspace/js/core/css/module-base.css` | CREATE |
| `/public/workspace/js/modules/segmentation/css/segmentation-modern.css` | MODIFY - import base |
| `/public/workspace/js/modules/imageviewer/css/imageviewer.css` | MODIFY - use variables |

### Todo List
- [ ] Create `/public/workspace/js/core/css/` directory
- [ ] Create `module-base.css` with CSS custom properties:
  - [ ] Primary colors: `--module-primary: #667eea`, `--module-secondary: #764ba2`
  - [ ] Status colors: success (#d4edda), error (#f8d7da), info (#d1ecf1)
  - [ ] Neutral colors: bg, card-bg, border, text-primary, text-secondary
  - [ ] Spacing rhythm: xs(8px), sm(16px), md(20px), lg(24px), xl(30px), xxl(40px)
  - [ ] Typography: font-family, radius-sm(6px), radius-md(8px)
- [ ] Extract common component styles from segmentation-modern.css:
  - [ ] Button styles (.btn, .btn-secondary, .btn-upload)
  - [ ] Card styles (.file-selector-card, .config-form, .chart-container)
  - [ ] Form field styles (.form-field, .file-dropdown)
  - [ ] Step navigation styles (.step-nav, .step, .step-number)
  - [ ] Progress bar styles (.progress-bar, .progress-fill)
  - [ ] Validation displays (.validation-success, .validation-error, .validation-info)
  - [ ] Navigation buttons (.navigation-buttons)
- [ ] Update segmentation-modern.css to import base and remove duplicates
- [ ] Update imageviewer.css to import base and use variables (changes cyan to purple)
- [ ] Test: Both modules should render correctly with consistent styling

### Validation
- Segmentation module should have NO visual changes
- Image Viewer should change from cyan/dark theme to purple/light theme

---

## Phase 2: BaseModule Class

**Objective**: Create abstract base class with standard lifecycle and step management.

### Files to Create
| File | Action |
|------|--------|
| `/public/workspace/js/core/BaseModule.js` | CREATE |
| `/public/workspace/js/core/index.js` | CREATE |

### Todo List
- [ ] Create `/public/workspace/js/core/BaseModule.js` with:
  - [ ] Constructor accepting stateManager and config object
  - [ ] Config properties: id, name, cssPath, totalSteps, steps array
  - [ ] Lifecycle methods: `activate()`, `deactivate()`, `cleanup()`
  - [ ] Abstract method: `render()` (must be overridden)
  - [ ] Optional override: `initialize()` (called after render)
  - [ ] Step navigation: `goToStep(n)`, `nextStep()`, `previousStep()`
  - [ ] Conditional logic: `canNavigateToStep(n)`, `shouldSkipStep(n)`
  - [ ] UI updates: `updateStepNavigation()`, `updateStepContent()`, `updateProgressBar()`
  - [ ] Utilities: `loadCSS()`, `loadScript()`, `showLoading()`, `hideLoading()`
  - [ ] JSDoc documentation for all methods
- [ ] Create `/public/workspace/js/core/index.js` exporting BaseModule

### Step Configuration Format
```javascript
{
  steps: [
    {
      id: 'upload',
      name: 'Data Upload',
      canNavigate: true,  // or function: (module) => module.hasFiles
      shouldSkip: false,  // or function: (module) => module.importedModel !== null
      blockedMessage: 'Please select files first.'
    }
  ]
}
```

### Validation
- Create simple test module extending BaseModule
- Verify lifecycle methods called in correct order
- Verify conditional step logic works (skip, block)

---

## Phase 3: Composable UI Components

**Objective**: Create reusable UI components for common patterns.

### Files to Create
| File | Action |
|------|--------|
| `/public/workspace/js/core/components/StepNavigator.js` | CREATE |
| `/public/workspace/js/core/components/ValidationDisplay.js` | CREATE |
| `/public/workspace/js/core/components/NavigationButtons.js` | CREATE |
| `/public/workspace/js/core/components/MetricCard.js` | CREATE |
| `/public/workspace/js/core/components/ProgressIndicator.js` | CREATE |
| `/public/workspace/js/core/components/LoadingOverlay.js` | CREATE |
| `/public/workspace/js/core/components/FileSelector.js` | CREATE (move & enhance) |
| `/public/workspace/js/core/components/index.js` | CREATE |

### Todo List

#### StepNavigator Component
- [ ] Create `StepNavigator.js`:
  - [ ] Constructor: `{ steps, currentStep, onStepClick }`
  - [ ] `render()` - returns step bar + progress bar HTML
  - [ ] `init(container)` - attach click handlers
  - [ ] `update(currentStep)` - update active/completed classes
  - [ ] `setStepState(stepNum, state)` - mark completed/blocked/skipped

#### ValidationDisplay Component
- [ ] Create `ValidationDisplay.js`:
  - [ ] Constructor: `containerId`
  - [ ] `show(type, title, details)` - type: success/error/info/warning
  - [ ] `hide()` - hide the container
  - [ ] Helper methods: `showSuccess()`, `showError()`, `showInfo()`

#### NavigationButtons Component
- [ ] Create `NavigationButtons.js`:
  - [ ] Constructor: `{ onPrevious, onNext, previousLabel, nextLabel }`
  - [ ] `render()` - returns navigation buttons HTML
  - [ ] `init(container)` - attach click handlers
  - [ ] `setPreviousEnabled(bool)`, `setNextEnabled(bool)`
  - [ ] `setPreviousVisible(bool)`, `setNextVisible(bool)`

#### MetricCard Component
- [ ] Create `MetricCard.js`:
  - [ ] Constructor: `{ id, label, initialValue }`
  - [ ] `render()` - returns metric card HTML
  - [ ] `setValue(value)` - update displayed value
  - [ ] Static: `renderGrid(cards)` - render multiple in grid

#### ProgressIndicator Component
- [ ] Create `ProgressIndicator.js`:
  - [ ] Constructor: `{ containerId, type }` - type: 'small' or 'large'
  - [ ] `render()` - returns progress bar HTML
  - [ ] `setProgress(percent)` - update width
  - [ ] `setLabel(text)` - update label text

#### LoadingOverlay Component
- [ ] Create `LoadingOverlay.js`:
  - [ ] `show(title, description)` - display overlay with spinner
  - [ ] `hide()` - remove overlay

#### FileSelector Enhancement
- [ ] Move FileSelector from segmentation to core
- [ ] Add custom sections API:
  - [ ] `config.customSections` array option
  - [ ] `addCustomSection({ id, label, items, getValue })` method
  - [ ] `removeCustomSection(id)` method
  - [ ] `refreshSection(id, items)` method
- [ ] Maintain backward compatibility with existing config options

#### Component Index
- [ ] Create `components/index.js` exporting all components

### Validation
- Import components in test page
- Verify each component renders correctly standalone
- Verify FileSelector backward compatibility

---

## Phase 4: Migrate Image Viewer Module

**Objective**: Convert ImageViewerModule to use framework (simpler module, good test case).

### Files to Modify
| File | Action |
|------|--------|
| `/public/workspace/js/modules/imageviewer/ImageViewerModule.js` | MODIFY |
| `/public/workspace/js/modules/imageviewer/css/imageviewer.css` | MODIFY or DELETE |

### Todo List
- [ ] Update ImageViewerModule to extend BaseModule:
  - [ ] Import BaseModule from core
  - [ ] Call `super()` with config in constructor
  - [ ] Define 2-step configuration with conditional navigation
- [ ] Replace inline step nav rendering with StepNavigator component
- [ ] Replace inline validation with ValidationDisplay component
- [ ] Replace inline navigation buttons with NavigationButtons component
- [ ] Update CSS imports to use module-base.css
- [ ] Remove duplicate styles from imageviewer.css (or delete if empty)
- [ ] Update FileSelector import path to use core component

### Testing Checklist
- [ ] Module loads without errors
- [ ] File selection works (workspace files, recent results)
- [ ] Step navigation works (click steps, next/previous buttons)
- [ ] Conditional navigation works (can't go to step 2 without file)
- [ ] Gallery view works (zoom, pan, slice navigation)
- [ ] Thumbnail view works (lazy loading, click to gallery)
- [ ] Incoming data from segmentation works (auto-advance)
- [ ] Visual consistency with segmentation module

---

## Phase 5: Migrate Segmentation Module

**Objective**: Convert SegmentationModule to use framework (complex migration).

### Sub-phases (for incremental migration)

#### Phase 5a: Extend BaseModule
- [ ] Update SegmentationModule to extend BaseModule
- [ ] Call `super()` with 4-step config in constructor
- [ ] Define step configuration with conditional logic:
  - Step 1: Always accessible
  - Step 2: Requires files validated
  - Step 3: Requires config saved (skip if imported model)
  - Step 4: Requires training complete OR imported model
- [ ] Verify existing functionality unchanged

#### Phase 5b: Replace Step Navigation
- [ ] Replace inline step nav HTML with StepNavigator component
- [ ] Update `goToStep()` to use component's `update()` method
- [ ] Update navigation.js to work with new component
- [ ] Verify step clicking and progress bar work

#### Phase 5c: Replace File Selectors
- [ ] Update imports to use FileSelector from core
- [ ] Delete `/public/workspace/js/modules/segmentation/components/FileSelector.js`
- [ ] Verify file selection for raw images, annotations, inference data

#### Phase 5d: Replace Validation Displays
- [ ] Replace inline validation HTML with ValidationDisplay component
- [ ] Update validation result handling to use component methods
- [ ] Verify success/error states display correctly

#### Phase 5e: Cleanup and Optimization
- [ ] Update CSS imports to use module-base.css
- [ ] Remove duplicate styles from segmentation-modern.css
- [ ] Simplify navigation.js (delegate to BaseModule)
- [ ] Add JSDoc comments

### Files to Modify
| File | Action |
|------|--------|
| `/public/workspace/js/modules/segmentation/SegmentationModule.js` | MODIFY |
| `/public/workspace/js/modules/segmentation/css/segmentation-modern.css` | MODIFY |
| `/public/workspace/js/modules/segmentation/components/FileSelector.js` | DELETE |
| `/public/workspace/js/modules/segmentation/navigation.js` | MODIFY |

### Testing Checklist
- [ ] Full workflow: upload -> config -> train -> inference
- [ ] Test data selection works
- [ ] Custom file upload works
- [ ] Training configuration saves correctly
- [ ] Training progress (Socket.IO) displays correctly
- [ ] Training metrics and charts update
- [ ] Model import flow works (skips training step)
- [ ] Inference file selection works
- [ ] Inference progress displays correctly
- [ ] Results pass to Image Viewer correctly
- [ ] State persistence works (page refresh resume)

---

## Phase 6: Documentation and Template

**Objective**: Document the framework and provide starter template.

### Files to Create
| File | Action |
|------|--------|
| `/docs/guides/MODULE_FRAMEWORK.md` | CREATE |
| `/public/workspace/js/modules/template/TemplateModule.js` | CREATE |
| `/public/workspace/js/modules/template/README.md` | CREATE |
| `/docs/guides/MODULE_CREATION.md` | MODIFY |

### Todo List
- [ ] Create MODULE_FRAMEWORK.md with:
  - [ ] Overview and architecture diagram
  - [ ] BaseModule API reference
  - [ ] Component API reference
  - [ ] CSS variables reference
  - [ ] Step configuration guide
  - [ ] Migration guide for existing modules

- [ ] Create TemplateModule.js as starter:
  - [ ] Extends BaseModule
  - [ ] 3-step workflow (data, config, process)
  - [ ] Uses all components
  - [ ] Extensive comments explaining each part

- [ ] Create template README.md:
  - [ ] How to copy and customize template
  - [ ] Checklist for new module creation
  - [ ] Common patterns and examples

- [ ] Update MODULE_CREATION.md:
  - [ ] Reference new framework
  - [ ] Update step-by-step guide
  - [ ] Add link to MODULE_FRAMEWORK.md

---

## Critical Files Summary

### Core Framework (to create)
```
/public/workspace/js/core/
├── BaseModule.js              # Base class for all modules
├── index.js                   # Main exports
├── css/
│   └── module-base.css        # Shared CSS with design tokens
└── components/
    ├── index.js               # Component exports
    ├── StepNavigator.js       # Step bar + progress
    ├── FileSelector.js        # File selection (moved from segmentation)
    ├── ValidationDisplay.js   # Success/error/info displays
    ├── NavigationButtons.js   # Previous/Next buttons
    ├── MetricCard.js          # Metric display cards
    ├── ProgressIndicator.js   # Progress bars
    └── LoadingOverlay.js      # Loading overlay with spinner
```

### Modules to Modify
```
/public/workspace/js/modules/
├── imageviewer/
│   ├── ImageViewerModule.js   # MODIFY: extend BaseModule
│   └── css/imageviewer.css    # MODIFY: use base CSS
├── segmentation/
│   ├── SegmentationModule.js  # MODIFY: extend BaseModule
│   ├── navigation.js          # MODIFY: simplify
│   ├── css/segmentation-modern.css  # MODIFY: remove duplicates
│   └── components/FileSelector.js   # DELETE: moved to core
└── template/
    ├── TemplateModule.js      # CREATE: starter template
    └── README.md              # CREATE: instructions
```

---

## Rollback Strategy

Each phase is independently rollback-able via git:

| Phase | Rollback |
|-------|----------|
| 1 | Delete module-base.css, restore CSS imports |
| 2 | Delete BaseModule.js, modules work standalone |
| 3 | Delete component files |
| 4 | `git checkout` ImageViewerModule.js |
| 5 | `git checkout` segmentation files |
| 6 | Delete documentation files |

**Git Strategy**: Commit each phase separately with clear messages.

---

## Session Handover Notes

When resuming in a new Claude Code session:

1. **Check current phase**: Look at git log to see last completed phase
2. **Read this plan**: Located at `/docs/vision/REUSABLE_MODULE_FRAMEWORK.md`
3. **Check todo status**: Look for `[x]` completed items in this file
4. **Continue from current phase**: Each phase is self-contained
5. **Test after each phase**: Verify modules still work before proceeding
