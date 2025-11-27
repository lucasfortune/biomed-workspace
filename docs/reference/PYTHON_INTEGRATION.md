# Python Integration Reference

> **Python process communication protocol and script interfaces**

This document provides comprehensive documentation for how Python scripts communicate with the Node.js server, including stdout protocols, script invocation patterns, and data exchange formats.

**Last Updated:** 2025-11-27
**Python Scripts Location:** `python/`
**Node.js Integration:** `server.js`

---

## Overview

The application uses **Python for ML operations** (training, inference, validation) and **Node.js for the web server**. Communication happens via:

- **Process Spawning:** Node.js spawns Python processes using `child_process.spawn()`
- **Stdout Protocol:** Python writes structured messages to stdout
- **JSON Exchange:** All data exchanged as JSON
- **Exit Codes:** Process exit codes indicate success/failure

---

## Architecture

### Communication Model

```
┌──────────────┐                    ┌──────────────┐
│   Node.js    │                    │   Python     │
│   Server     │                    │   Script     │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       │ 1. Spawn process with args        │
       ├──────────────────────────────────►│
       │                                   │
       │ 2. Python writes to stdout        │
       │◄──────────────────────────────────┤
       │ PROGRESS:{"epoch": 1, ...}        │
       │                                   │
       │ 3. Python writes to stdout        │
       │◄──────────────────────────────────┤
       │ PROGRESS:{"epoch": 2, ...}        │
       │                                   │
       │ 4. Python exits with code         │
       │◄──────────────────────────────────┤
       │ exit(0) for success               │
       │                                   │
```

### Python Environment

**Python Interpreter:**
```javascript
const PYTHON_PATH = path.join(__dirname, 'venv', 'bin', 'python');
```

**Why virtual environment:**
- Isolated dependencies
- Consistent versions across deployments
- Prevents system Python conflicts

---

## Python Scripts

### Overview Table

| Script | Purpose | Inputs | Outputs | Protocol |
|--------|---------|--------|---------|----------|
| `validate_tiff.py` | Validate training data | 2 TIFF paths | JSON result | Single JSON output |
| `validate_inference_tiff.py` | Validate inference data | 1 TIFF path | JSON result | Single JSON output |
| `validate_imported_model.py` | Validate imported model | Model + config paths | JSON result | Single JSON output |
| `train_model.py` | Train U-Net model | Config, images, annotations | Model + results | PROGRESS: protocol |
| `run_inference.py` | Run inference | Model, input, output | Segmentation + metadata | INFERENCE_PROGRESS: + FINAL_RESULT: protocols |

---

## Validation Scripts

### validate_tiff.py

Validate training TIFF stacks.

**Invocation:**
```javascript
spawn(PYTHON_PATH, [
  'python/validate_tiff.py',
  rawPath,           // Path to raw images TIFF
  annotationPath     // Path to annotations TIFF
]);
```

**Stdout Protocol:**
```json
{
  "valid": true,
  "raw_images": {
    "shape": [100, 512, 512],
    "dtype": "uint8",
    "min": 0,
    "max": 255
  },
  "annotations": {
    "shape": [100, 512, 512],
    "dtype": "uint8",
    "min": 0,
    "max": 2
  },
  "num_classes": 3,
  "class_counts": {
    "0": 50000,
    "1": 30000,
    "2": 20000
  },
  "auto_converted": false
}
```

**Success Output:**
```json
{
  "valid": true,
  "raw_images": { ... },
  "annotations": { ... },
  "num_classes": 3,
  "class_counts": { ... }
}
```

**Error Output:**
```json
{
  "valid": false,
  "error": "Raw images must be 3D stack, got shape (512, 512)"
}
```

**Exit Codes:**
- `0` - Validation passed
- `1` - Validation failed (error in JSON)

**Node.js Parsing:**
```javascript
async function validateTiffStacks(rawPath, annotationPath) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      'python/validate_tiff.py',
      rawPath,
      annotationPath
    ]);

    let output = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonScript.on('close', (code) => {
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        resolve({ valid: false, error: 'Failed to parse validation output' });
      }
    });
  });
}
```

**Special Behavior:**
- **Auto-conversion:** May convert 16-bit annotations to 8-bit
- **Logging:** Conversion messages written to stdout before JSON
- **Parsing:** Node.js must extract JSON from output (may have extra lines)

**Example Usage:**
```javascript
const result = await validateTiffStacks(
  'uploads/abc123/training.tif',
  'uploads/abc123/annotations.tif'
);

if (result.valid) {
  console.log(`Detected ${result.num_classes} classes`);
  console.log('Class distribution:', result.class_counts);
} else {
  console.error('Validation failed:', result.error);
}
```

---

### validate_inference_tiff.py

Validate inference TIFF stack.

**Invocation:**
```javascript
spawn(PYTHON_PATH, [
  'python/validate_inference_tiff.py',
  filePath
]);
```

**Stdout Protocol:**

**Success:**
```json
{
  "valid": true,
  "shape": [50, 512, 512],
  "dtype": "uint8",
  "min": 0,
  "max": 255
}
```

**Error:**
```json
{
  "valid": false,
  "error": "File must be 3D stack, got shape (512, 512)"
}
```

**Exit Codes:**
- `0` - Validation passed
- `1` - Validation failed

---

### validate_imported_model.py

Validate imported PyTorch model and configuration.

**Invocation:**
```javascript
spawn(PYTHON_PATH, [
  'python/validate_imported_model.py',
  modelPath,    // Path to .pth file
  configPath    // Path to .json file
]);
```

**Stdout Protocol:**

**Success:**
```json
{
  "success": true,
  "model_size": "50.2 MB",
  "config": {
    "patch_size": 256,
    "features": 32,
    "num_layers": 4,
    "num_classes": 3
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Invalid model: checkpoint does not contain 'model_state_dict'"
}
```

**Validation Checks:**
- Model file is valid PyTorch checkpoint
- Contains `model_state_dict` key
- Config is valid JSON
- Config contains required fields: `patch_size`, `features`, `num_layers`, `num_classes`

---

## Training Script

### train_model.py

Train U-Net model with real-time progress updates.

**Invocation:**
```javascript
spawn(PYTHON_PATH, [
  'python/train_model.py',
  '--config', JSON.stringify(config),
  '--raw_images', rawImagesPath,
  '--annotations', annotationsPath,
  '--output_dir', outputDir,
  '--training_id', trainingId
]);
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `--config` | JSON string | Training configuration (see below) |
| `--raw_images` | string | Path to raw images TIFF |
| `--annotations` | string | Path to annotations TIFF |
| `--output_dir` | string | Directory for model output |
| `--training_id` | string | Unique training ID |

**Config Structure:**
```json
{
  "patch_size": 256,
  "patches_per_image": 100,
  "batch_size": 4,
  "num_epochs": 10,
  "learning_rate": 0.001,
  "features": 32,
  "num_layers": 4,
  "num_classes": 3
}
```

---

### Training Progress Protocol

**Format:**
```
PROGRESS:<json>
```

**Progress JSON Structure:**
```json
{
  "epoch": 5,
  "total_epochs": 10,
  "metrics": {
    "train_loss": 0.123,
    "val_loss": 0.145,
    "train_accuracy": 0.95,
    "val_accuracy": 0.93,
    "learning_rate": 0.001
  }
}
```

**Python Output Example:**
```python
progress = {
    "epoch": epoch + 1,
    "total_epochs": num_epochs,
    "metrics": {
        "train_loss": train_loss,
        "val_loss": val_loss,
        "train_accuracy": train_acc,
        "val_accuracy": val_acc,
        "learning_rate": current_lr
    }
}
print(f"PROGRESS:{json.dumps(progress)}")
sys.stdout.flush()  # Important: flush immediately
```

**Frequency:**
- Emitted once per epoch
- Typically every 10-60 seconds depending on hardware

---

### Node.js Parsing

```javascript
function startTrainingProcess(params, io) {
  const pythonScript = spawn(PYTHON_PATH, [
    'python/train_model.py',
    '--config', JSON.stringify(params.config),
    '--raw_images', params.raw_images,
    '--annotations', params.annotations,
    '--output_dir', params.output_dir,
    '--training_id', params.training_id
  ]);

  let outputBuffer = '';

  pythonScript.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('Training output:', output);

    // Add to buffer
    outputBuffer += output;

    // Process complete lines
    const lines = outputBuffer.split('\n');
    outputBuffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('PROGRESS:')) {
        try {
          const progressData = line.substring(9);
          const progress = JSON.parse(progressData);

          // Update training session
          const training = trainingSessions.get(params.training_id);
          if (training) {
            training.status = 'training';
            training.current_epoch = progress.epoch;
            training.metrics = progress.metrics;
          }

          // Emit to clients via Socket.IO
          io.to(`training-${params.training_id}`).emit('training-progress', progress);

        } catch (e) {
          console.error('Error parsing progress data:', e.message);
        }
      }
    }
  });

  pythonScript.stderr.on('data', (data) => {
    console.error('Training error:', data.toString());
  });

  pythonScript.on('close', (code) => {
    const training = trainingSessions.get(params.training_id);
    if (training) {
      if (code === 0) {
        training.status = 'completed';
        io.to(`training-${params.training_id}`).emit('training-complete', { success: true });
      } else {
        training.status = 'failed';
        io.to(`training-${params.training_id}`).emit('training-complete', { success: false });
      }
    }
  });
}
```

---

### Training Output Files

**Generated in `output_dir`:**

**`best_model.pth`** - PyTorch model checkpoint
```python
{
  'model_state_dict': model.state_dict(),
  'optimizer_state_dict': optimizer.state_dict(),
  'epoch': epoch,
  'loss': best_loss
}
```

**`config.json`** - Training configuration
```json
{
  "patch_size": 256,
  "features": 32,
  "num_layers": 4,
  "num_classes": 3,
  "batch_size": 4,
  "learning_rate": 0.001,
  "num_epochs": 10
}
```

**`results.json`** - Final metrics
```json
{
  "final_metrics": {
    "train_loss": 0.089,
    "val_loss": 0.102,
    "train_accuracy": 0.98,
    "val_accuracy": 0.96
  },
  "training_time": "15m 32s",
  "total_epochs": 10
}
```

---

## Inference Script

### run_inference.py

Run inference on TIFF stack with trained model.

**Invocation:**
```javascript
spawn(PYTHON_PATH, [
  'python/run_inference.py',
  '--model', modelPath,
  '--input', inputPath,
  '--output', outputPath,
  '--inference_id', inferenceId
]);
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `--model` | string | Path to trained model (.pth) |
| `--input` | string | Path to input TIFF stack |
| `--output` | string | Path for output segmented TIFF |
| `--inference_id` | string | Unique inference ID |

---

### Inference Progress Protocol

**Format:**
```
INFERENCE_PROGRESS:<json>
```

**Progress JSON Structure:**
```json
{
  "current_slice": 50,
  "total_slices": 100,
  "progress_percent": 50
}
```

**Python Output Example:**
```python
progress = {
    "current_slice": i + 1,
    "total_slices": total_slices,
    "progress_percent": int((i + 1) / total_slices * 100)
}
print(f"INFERENCE_PROGRESS:{json.dumps(progress)}")
sys.stdout.flush()
```

---

### Final Result Protocol

**Format:**
```
FINAL_RESULT:<json>
```

**Result JSON Structure:**
```json
{
  "success": true,
  "output_path": "results/training_id/inference_result.tif",
  "metadata_path": "results/training_id/inference_result_metadata.json",
  "visualization_path": "results/training_id/inference_result_visualization_data.json",
  "original_data_web": "results/training_id/original_data_downsampled.tif",
  "metrics": {
    "total_pixels": 10000000,
    "class_distribution": {
      "0": 5000000,
      "1": 3000000,
      "2": 2000000
    }
  }
}
```

**Python Output Example:**
```python
result = {
    "success": True,
    "output_path": output_path,
    "metadata_path": metadata_path,
    "visualization_path": viz_path,
    "original_data_web": downsampled_path,
    "metrics": {
        "total_pixels": int(total_pixels),
        "class_distribution": class_counts
    }
}
print(f"FINAL_RESULT:{json.dumps(result)}")
sys.stdout.flush()
```

---

### Backup JSON Protocol

**For cases where FINAL_RESULT parsing fails:**

```
BACKUP_JSON_START
<multi-line JSON>
BACKUP_JSON_END
```

**Python Output:**
```python
print("BACKUP_JSON_START")
print(json.dumps(result, indent=2))
print("BACKUP_JSON_END")
sys.stdout.flush()
```

**Node.js Parsing:**
```javascript
let collectingBackupJson = false;
let backupJsonLines = [];

for (const line of lines) {
  if (line === 'BACKUP_JSON_START') {
    collectingBackupJson = true;
    backupJsonLines = [];
  } else if (line === 'BACKUP_JSON_END') {
    collectingBackupJson = false;
    const backupJsonString = backupJsonLines.join('\n');
    finalResult = JSON.parse(backupJsonString);
  } else if (collectingBackupJson) {
    backupJsonLines.push(line);
  }
}
```

---

### Inference Output Files

**`inference_result.tif`** - Segmented TIFF stack
- Same dimensions as input
- dtype: uint8
- Values: 0-N (class labels)

**`inference_result_metadata.json`** - Metadata
```json
{
  "input_file": "uploads/abc123/inference.tif",
  "model_file": "models/session/training/best_model.pth",
  "inference_id": "x1y2z3...",
  "timestamp": "2025-11-27T12:00:00.000Z",
  "metrics": {
    "total_pixels": 10000000,
    "class_distribution": {
      "0": 5000000,
      "1": 3000000,
      "2": 2000000
    }
  },
  "original_data_web": {
    "path": "results/training_id/original_data_downsampled.tif",
    "downsample_factor": 2
  }
}
```

**`inference_result_visualization_data.json`** - 3D viz data
```json
{
  "points": [
    {"x": 10, "y": 20, "z": 5, "class": 1},
    {"x": 15, "y": 25, "z": 6, "class": 2}
  ],
  "bounds": {
    "min_x": 0, "max_x": 512,
    "min_y": 0, "max_y": 512,
    "min_z": 0, "max_z": 100
  },
  "num_classes": 3,
  "downsample_factor": 4
}
```

**`original_data_downsampled.tif`** - Downsampled original
- For "Original Data Overlay" in 3D visualization
- Downsampled to reduce file size for web
- dtype: uint8

---

## Error Handling

### Python Errors

**Python writes to stderr:**
```python
try:
    # Process
    pass
except Exception as e:
    import traceback
    print(json.dumps({
        "valid": False,
        "error": str(e),
        "traceback": traceback.format_exc()
    }))
    sys.exit(1)
```

**Node.js captures stderr:**
```javascript
pythonScript.stderr.on('data', (data) => {
  console.error('Python error:', data.toString());
});
```

---

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Parse output, emit success |
| 1 | General error | Check stderr, emit failure |
| 2 | Missing arguments | Log error, emit failure |
| Other | Unexpected | Log error, emit failure |

---

### Timeout Handling

```javascript
// Set timeout for long-running processes
const TRAINING_TIMEOUT = 3600000; // 1 hour

const pythonScript = spawn(PYTHON_PATH, ['python/train_model.py', ...]);

const timeout = setTimeout(() => {
  console.error('Training timeout exceeded');
  pythonScript.kill('SIGTERM');
  // Emit timeout event
  io.to(`training-${trainingId}`).emit('training-complete', {
    success: false,
    error: 'Timeout exceeded'
  });
}, TRAINING_TIMEOUT);

pythonScript.on('close', (code) => {
  clearTimeout(timeout);
  // Handle completion
});
```

---

## Best Practices

### Python Script Guidelines

1. **Always flush stdout immediately:**
   ```python
   print(f"PROGRESS:{json.dumps(data)}")
   sys.stdout.flush()  # Critical!
   ```

2. **Use structured JSON output:**
   ```python
   # Good
   print(json.dumps({"valid": True, "shape": [100, 512, 512]}))

   # Bad
   print("Validation passed!")
   print("Shape: [100, 512, 512]")
   ```

3. **Exit with appropriate codes:**
   ```python
   if success:
       sys.exit(0)
   else:
       sys.exit(1)
   ```

4. **Provide detailed errors:**
   ```python
   except Exception as e:
       print(json.dumps({
           "valid": False,
           "error": str(e),
           "traceback": traceback.format_exc()
       }))
       sys.exit(1)
   ```

5. **Validate inputs early:**
   ```python
   if not os.path.exists(input_path):
       print(json.dumps({"valid": False, "error": f"File not found: {input_path}"}))
       sys.exit(1)
   ```

---

### Node.js Integration Guidelines

1. **Buffer stdout properly:**
   ```javascript
   let outputBuffer = '';

   pythonScript.stdout.on('data', (data) => {
     outputBuffer += data.toString();
     const lines = outputBuffer.split('\n');
     outputBuffer = lines.pop(); // Keep incomplete line
     // Process complete lines
   });
   ```

2. **Handle incomplete JSON:**
   ```javascript
   try {
     const result = JSON.parse(output);
   } catch (e) {
     // Try extracting JSON from mixed output
     const jsonMatch = output.match(/\{[\s\S]*\}/);
     if (jsonMatch) {
       const result = JSON.parse(jsonMatch[0]);
     }
   }
   ```

3. **Log all Python output:**
   ```javascript
   pythonScript.stdout.on('data', (data) => {
     console.log('[Python]:', data.toString());
   });

   pythonScript.stderr.on('data', (data) => {
     console.error('[Python Error]:', data.toString());
   });
   ```

4. **Use Promises for async operations:**
   ```javascript
   async function runPythonScript(scriptPath, args) {
     return new Promise((resolve, reject) => {
       const pythonScript = spawn(PYTHON_PATH, [scriptPath, ...args]);
       // Handle output, completion, errors
     });
   }
   ```

---

## Testing

### Testing Python Scripts Standalone

```bash
# Test validation
python python/validate_tiff.py test_data/training.tif test_data/annotations.tif

# Test training (with dummy config)
python python/train_model.py \
  --config '{"patch_size": 64, "num_epochs": 2, "batch_size": 2, "learning_rate": 0.001, "features": 16, "num_layers": 3, "num_classes": 3}' \
  --raw_images test_data/training.tif \
  --annotations test_data/annotations.tif \
  --output_dir test_output \
  --training_id test123

# Test inference
python python/run_inference.py \
  --model test_output/best_model.pth \
  --input test_data/inference.tif \
  --output test_result.tif \
  --inference_id test456
```

---

### Testing Protocol Parsing

```javascript
// Test progress parsing
function testProgressParsing() {
  const testOutput = `
Some log message
PROGRESS:{"epoch": 1, "total_epochs": 5, "metrics": {"train_loss": 0.5}}
Another log message
PROGRESS:{"epoch": 2, "total_epochs": 5, "metrics": {"train_loss": 0.4}}
  `;

  const lines = testOutput.split('\n');
  const progressEvents = [];

  for (const line of lines) {
    if (line.startsWith('PROGRESS:')) {
      const data = JSON.parse(line.substring(9));
      progressEvents.push(data);
    }
  }

  console.log('Parsed progress events:', progressEvents);
  // Should have 2 events
}
```

---

## Related Documentation

**Architecture:**
- [API Endpoints](API_ENDPOINTS.md) - HTTP endpoints that spawn Python processes
- [Socket Protocol](SOCKET_PROTOCOL.md) - How progress is broadcast to clients

**Python Scripts:**
- Training: `python/train_model.py`
- Inference: `python/run_inference.py`
- Validation: `python/validate_tiff.py`, `python/validate_inference_tiff.py`, `python/validate_imported_model.py`

**Node.js Integration:**
- Training spawn: `server.js:1780-1849`
- Inference spawn: `server.js:1888-2109`
- Validation helpers: `server.js:1671-1885`

---

**Navigation:**
← [Socket Protocol](SOCKET_PROTOCOL.md) | [Documentation Index](../INDEX.md) | Next: [File Structure](FILE_STRUCTURE.md) →

---

**Status:** ✅ Complete
**Last Updated:** 2025-11-27
