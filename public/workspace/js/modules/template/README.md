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

### 4. Register Your Module

Edit `/workspace/js/modules/registry.js`:

```javascript
{
  id: 'yourmodule',
  name: 'Your Module Name',
  description: 'What your module does',
  icon: '🔧',
  path: '/workspace/js/modules/yourmodule/YourModule.js',
  inputs: ['input_type'],
  outputs: ['output_type'],
  color: '#4A90E2',
  status: 'available'
}
```

### 5. Test Your Module

1. Restart the development server
2. Navigate to `/workspace`
3. Click your module card to launch

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
- [ ] Implement `onFileSelected()` handler
- [ ] Implement `onFileUploaded()` handler

### Processing

- [ ] Implement actual processing logic in `startProcessing()`
- [ ] Set up Socket.IO for real-time progress (if needed)
- [ ] Handle processing errors
- [ ] Display results in `onProcessingComplete()`

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
