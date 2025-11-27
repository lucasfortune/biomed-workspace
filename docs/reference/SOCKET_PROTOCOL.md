# Socket.IO Protocol Reference

> **Real-time communication protocol for training and inference progress updates**

This document provides comprehensive documentation for the Socket.IO event protocol used for real-time communication between the client and server.

**Last Updated:** 2025-11-27
**Technology:** Socket.IO (WebSocket-based)
**Server Implementation:** `server.js:1648-1668`

---

## Overview

The application uses **Socket.IO** for real-time bidirectional communication, primarily for:

- **Training Progress:** Real-time epoch updates, loss metrics, accuracy
- **Inference Progress:** Slice-by-slice processing updates, completion status
- **Room-Based Updates:** Client joins specific rooms for targeted updates

---

## Architecture

### Connection Model

```
┌─────────┐                    ┌─────────┐
│ Client  │◄──────────────────►│ Server  │
│ (Web)   │   WebSocket / HTTP │ (Node)  │
└────┬────┘                    └────┬────┘
     │                              │
     │ 1. Connect                   │
     ├─────────────────────────────►│
     │                              │
     │ 2. Join Room                 │
     ├─────────────────────────────►│
     │                              │
     │ 3. Progress Events           │
     │◄─────────────────────────────┤
     │                              │
     │ 4. Complete Event            │
     │◄─────────────────────────────┤
     │                              │
     │ 5. Disconnect                │
     ├─────────────────────────────►│
     │                              │
```

### Room System

Socket.IO rooms provide **isolated channels** for targeted updates:

```javascript
// Training room
`training-${trainingId}`

// Inference room
`inference-${inferenceId}`
```

**Benefits:**
- Only relevant clients receive updates
- Multiple concurrent operations don't interfere
- Efficient server-side event broadcasting

---

## Connection Events

### connection

Server-side event when client connects.

**Direction:** Server ← Client (automatic)

**Server Handler:**
```javascript
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  // socket.id is unique per connection
});
```

**Client-Side:**
```javascript
// Automatically triggered on page load if Socket.IO client included
const socket = io();

socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});
```

**When it fires:**
- Page loads with Socket.IO client library
- WebSocket connection established
- Client reconnects after disconnect

---

### disconnect

Server-side event when client disconnects.

**Direction:** Server ← Client (automatic)

**Server Handler:**
```javascript
socket.on('disconnect', () => {
  console.log('Client disconnected:', socket.id);
});
```

**Client-Side:**
```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  // reason: 'transport close', 'client namespace disconnect', etc.
});
```

**When it fires:**
- User closes browser tab
- Network connection lost
- Server crashes or restarts
- Client explicitly disconnects: `socket.disconnect()`

---

## Training Events

### join-training

Client joins training room to receive progress updates.

**Direction:** Server ← Client

**Client Emits:**
```javascript
socket.emit('join-training', trainingId);
```

**Server Handler:**
```javascript
socket.on('join-training', (trainingId) => {
  socket.join(`training-${trainingId}`);
  console.log(`Client ${socket.id} joined training room: training-${trainingId}`);
});
```

**When to call:**
- Immediately after receiving `training_id` from `/start-training` endpoint
- Before Python training process starts emitting progress

**Example Flow:**
```javascript
// 1. Start training
const response = await fetch('/start-training', { method: 'POST' });
const { training_id } = await response.json();

// 2. Join Socket.IO room
socket.emit('join-training', training_id);

// 3. Listen for progress
socket.on('training-progress', (data) => {
  console.log('Progress:', data);
});
```

---

### training-progress

Server broadcasts training progress to training room.

**Direction:** Server → Client (broadcast to room)

**Server Emits:**
```javascript
io.to(`training-${trainingId}`).emit('training-progress', {
  epoch: 5,
  total_epochs: 10,
  metrics: {
    train_loss: 0.123,
    val_loss: 0.145,
    train_accuracy: 0.95,
    val_accuracy: 0.93,
    learning_rate: 0.001
  }
});
```

**Client Receives:**
```javascript
socket.on('training-progress', (data) => {
  const { epoch, total_epochs, metrics } = data;

  console.log(`Epoch ${epoch}/${total_epochs}`);
  console.log('Train Loss:', metrics.train_loss);
  console.log('Val Loss:', metrics.val_loss);

  // Update UI
  updateProgressBar(epoch / total_epochs * 100);
  updateMetricsChart(metrics);
});
```

**Event Data Structure:**
```javascript
{
  epoch: 5,               // Current epoch (1-indexed)
  total_epochs: 10,       // Total epochs
  metrics: {
    train_loss: 0.123,         // Training loss
    val_loss: 0.145,           // Validation loss
    train_accuracy: 0.95,      // Training accuracy (0-1)
    val_accuracy: 0.93,        // Validation accuracy (0-1)
    learning_rate: 0.001       // Current learning rate
  }
}
```

**Frequency:**
- Emitted once per epoch
- Typically every 10-60 seconds depending on data size and hardware

**Python Source:**
Python script outputs to stdout:
```python
print(f"PROGRESS:{json.dumps(progress_data)}")
```

Server parses and emits to room (see `server.js:1804-1827`).

---

### training-complete

Server broadcasts training completion to training room.

**Direction:** Server → Client (broadcast to room)

**Server Emits:**
```javascript
// Success
io.to(`training-${trainingId}`).emit('training-complete', {
  success: true
});

// Failure
io.to(`training-${trainingId}`).emit('training-complete', {
  success: false
});
```

**Client Receives:**
```javascript
socket.on('training-complete', (data) => {
  if (data.success) {
    console.log('Training completed successfully!');

    // Hide progress UI
    hideProgressBar();

    // Enable download button
    document.getElementById('btn-download-model').disabled = false;

    // Show success message
    showNotification('Training complete!', 'success');
  } else {
    console.error('Training failed');
    showNotification('Training failed', 'error');
  }
});
```

**Event Data Structure:**
```javascript
{
  success: true  // or false
}
```

**When it fires:**
- Training Python script exits with code 0 (success)
- Training Python script exits with non-zero code (failure)

**What to do:**
- Update UI to show completion
- Enable "Download Model" button (if success)
- Allow starting inference
- Clear progress indicators

---

## Inference Events

### join-inference

Client joins inference room to receive progress updates.

**Direction:** Server ← Client

**Client Emits:**
```javascript
socket.emit('join-inference', inferenceId);
```

**Server Handler:**
```javascript
socket.on('join-inference', (inferenceId) => {
  socket.join(`inference-${inferenceId}`);
  console.log(`Client ${socket.id} joined inference room: inference-${inferenceId}`);

  // Send confirmation
  socket.emit('inference-room-joined', { inferenceId: inferenceId });
});
```

**When to call:**
- Immediately after receiving `inference_id` from `/run-inference` endpoint
- Before Python inference process starts (1-second server delay accounts for this)

**Example Flow:**
```javascript
// 1. Start inference
const response = await fetch('/run-inference', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data_path: '...', training_id: '...' })
});
const { inference_id } = await response.json();

// 2. Join Socket.IO room
socket.emit('join-inference', inference_id);

// 3. Wait for confirmation
socket.on('inference-room-joined', (data) => {
  console.log('Joined inference room:', data.inferenceId);
});

// 4. Listen for progress
socket.on('inference-progress', (data) => {
  console.log('Progress:', data);
});
```

---

### inference-room-joined

Server confirms client joined inference room.

**Direction:** Server → Client (unicast)

**Server Emits:**
```javascript
socket.emit('inference-room-joined', {
  inferenceId: inferenceId
});
```

**Client Receives:**
```javascript
socket.on('inference-room-joined', (data) => {
  console.log('Successfully joined inference room:', data.inferenceId);
  // Now ready to receive inference-progress events
});
```

**Event Data Structure:**
```javascript
{
  inferenceId: "x1y2z3..."
}
```

**Purpose:**
- Confirms client is ready to receive updates
- Useful for debugging connection issues
- Optional to listen for (not critical)

---

### inference-progress

Server broadcasts inference progress to inference room.

**Direction:** Server → Client (broadcast to room)

**Server Emits:**
```javascript
io.to(`inference-${inferenceId}`).emit('inference-progress', {
  current_slice: 50,
  total_slices: 100,
  progress_percent: 50
});
```

**Client Receives:**
```javascript
socket.on('inference-progress', (data) => {
  const { current_slice, total_slices, progress_percent } = data;

  console.log(`Processing slice ${current_slice}/${total_slices} (${progress_percent}%)`);

  // Update UI
  updateProgressBar(progress_percent);
  updateSliceCounter(current_slice, total_slices);
});
```

**Event Data Structure:**
```javascript
{
  current_slice: 50,        // Current slice being processed (1-indexed)
  total_slices: 100,        // Total slices in stack
  progress_percent: 50      // Progress percentage (0-100)
}
```

**Frequency:**
- Emitted per slice or per batch of slices
- Typically 10-100 updates per inference
- Depends on stack size and batch processing

**Python Source:**
Python script outputs to stdout:
```python
print(f"INFERENCE_PROGRESS:{json.dumps(progress_data)}")
```

Server parses and emits to room (see `server.js:1916-1937`).

---

### inference-complete

Server broadcasts inference completion to inference room.

**Direction:** Server → Client (broadcast to room)

**Server Emits:**
```javascript
// Success
io.to(`inference-${inferenceId}`).emit('inference-complete', {
  success: true,
  result: {
    output_path: "results/training_id/inference_result.tif",
    metadata_path: "results/training_id/inference_result_metadata.json",
    visualization_path: "results/training_id/inference_result_visualization_data.json",
    metrics: {
      total_pixels: 10000000,
      class_distribution: {
        "0": 5000000,
        "1": 3000000,
        "2": 2000000
      }
    }
  }
});

// Failure
io.to(`inference-${inferenceId}`).emit('inference-complete', {
  success: false
});
```

**Client Receives:**
```javascript
socket.on('inference-complete', (data) => {
  if (data.success) {
    console.log('Inference completed successfully!');
    console.log('Result:', data.result);

    // Hide progress UI
    hideProgressBar();

    // Enable visualization
    loadVisualization(data.result.visualization_path);

    // Enable download button
    document.getElementById('btn-download-results').disabled = false;

    // Show success message
    showNotification('Inference complete!', 'success');
  } else {
    console.error('Inference failed');
    showNotification('Inference failed', 'error');
  }
});
```

**Event Data Structure:**
```javascript
{
  success: true,  // or false
  result: {       // Only present if success === true
    output_path: string,              // Path to segmented TIFF
    metadata_path: string,            // Path to metadata JSON
    visualization_path: string,       // Path to visualization JSON
    metrics: {
      total_pixels: number,
      class_distribution: {
        "0": number,  // Background pixels
        "1": number,  // Class 1 pixels
        "2": number,  // Class 2 pixels
        // ...
      }
    }
  }
}
```

**When it fires:**
- Inference Python script exits with code 0 (success)
- Inference Python script exits with non-zero code (failure)

**What to do:**
- Update UI to show completion
- Load 3D visualization data
- Enable "Download Results" button (if success)
- Clear progress indicators

---

## Client Implementation Patterns

### Basic Setup

```javascript
// Initialize Socket.IO client
const socket = io();

// Wait for connection
socket.on('connect', () => {
  console.log('Connected to server');
});

// Handle disconnection
socket.on('disconnect', (reason) => {
  console.warn('Disconnected:', reason);
  showNotification('Connection lost. Reconnecting...', 'warning');
});

// Handle reconnection
socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  showNotification('Reconnected!', 'success');
});
```

---

### Training Flow

```javascript
async function startTraining() {
  try {
    // 1. Start training via HTTP
    const response = await fetch('/start-training', { method: 'POST' });
    const { success, training_id } = await response.json();

    if (!success) {
      throw new Error('Failed to start training');
    }

    // 2. Join Socket.IO room
    socket.emit('join-training', training_id);

    // 3. Set up progress handler
    socket.on('training-progress', (data) => {
      updateTrainingProgress(data);
    });

    // 4. Set up completion handler
    socket.once('training-complete', (data) => {
      handleTrainingComplete(data);
    });

  } catch (error) {
    console.error('Training error:', error);
    showNotification('Failed to start training', 'error');
  }
}

function updateTrainingProgress(data) {
  const { epoch, total_epochs, metrics } = data;

  // Update progress bar
  const progress = (epoch / total_epochs) * 100;
  document.getElementById('training-progress').style.width = `${progress}%`;
  document.getElementById('epoch-text').textContent = `Epoch ${epoch}/${total_epochs}`;

  // Update metrics chart
  trainingChart.addData({
    epoch,
    trainLoss: metrics.train_loss,
    valLoss: metrics.val_loss,
    trainAcc: metrics.train_accuracy,
    valAcc: metrics.val_accuracy
  });
}

function handleTrainingComplete(data) {
  if (data.success) {
    showNotification('Training completed successfully!', 'success');
    enableDownloadButton();
    enableInferenceButton();
  } else {
    showNotification('Training failed', 'error');
  }

  // Clean up listener
  socket.off('training-progress');
}
```

---

### Inference Flow

```javascript
async function startInference(dataPath, trainingId) {
  try {
    // 1. Start inference via HTTP
    const response = await fetch('/run-inference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_path: dataPath, training_id: trainingId })
    });
    const { success, inference_id } = await response.json();

    if (!success) {
      throw new Error('Failed to start inference');
    }

    // 2. Join Socket.IO room
    socket.emit('join-inference', inference_id);

    // 3. Wait for room confirmation (optional)
    socket.once('inference-room-joined', (data) => {
      console.log('Ready to receive progress');
    });

    // 4. Set up progress handler
    socket.on('inference-progress', (data) => {
      updateInferenceProgress(data);
    });

    // 5. Set up completion handler
    socket.once('inference-complete', (data) => {
      handleInferenceComplete(data);
    });

  } catch (error) {
    console.error('Inference error:', error);
    showNotification('Failed to start inference', 'error');
  }
}

function updateInferenceProgress(data) {
  const { current_slice, total_slices, progress_percent } = data;

  // Update progress bar
  document.getElementById('inference-progress').style.width = `${progress_percent}%`;
  document.getElementById('slice-text').textContent = `Slice ${current_slice}/${total_slices}`;
}

function handleInferenceComplete(data) {
  if (data.success) {
    showNotification('Inference completed successfully!', 'success');

    // Load visualization
    loadVisualization(data.result.visualization_path);

    // Enable download
    enableDownloadButton(data.result.output_path);
  } else {
    showNotification('Inference failed', 'error');
  }

  // Clean up listener
  socket.off('inference-progress');
}
```

---

### Cleanup Pattern

```javascript
class TrainingManager {
  constructor(socket) {
    this.socket = socket;
    this.listeners = [];
  }

  startTraining(trainingId) {
    // Join room
    this.socket.emit('join-training', trainingId);

    // Add progress listener
    const progressHandler = (data) => this.onProgress(data);
    this.socket.on('training-progress', progressHandler);
    this.listeners.push({ event: 'training-progress', handler: progressHandler });

    // Add complete listener
    const completeHandler = (data) => this.onComplete(data);
    this.socket.once('training-complete', completeHandler);
    this.listeners.push({ event: 'training-complete', handler: completeHandler });
  }

  cleanup() {
    // Remove all listeners
    this.listeners.forEach(({ event, handler }) => {
      this.socket.off(event, handler);
    });
    this.listeners = [];
  }

  onProgress(data) {
    // Handle progress
  }

  onComplete(data) {
    // Handle completion
    this.cleanup();  // Clean up after completion
  }
}
```

---

## Server Implementation

### Setting Up Socket.IO

**In server.js:**
```javascript
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Connection handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Room join handlers
  socket.on('join-training', (trainingId) => {
    socket.join(`training-${trainingId}`);
    console.log(`Client ${socket.id} joined training room: training-${trainingId}`);
  });

  socket.on('join-inference', (inferenceId) => {
    socket.join(`inference-${inferenceId}`);
    console.log(`Client ${socket.id} joined inference room: inference-${inferenceId}`);
    socket.emit('inference-room-joined', { inferenceId });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

---

### Emitting from Python Process

**Training progress parsing:**
```javascript
pythonScript.stdout.on('data', (data) => {
  const output = data.toString();

  // Split into lines
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.startsWith('PROGRESS:')) {
      // Parse JSON
      const progressData = line.substring(9);
      const progress = JSON.parse(progressData);

      // Emit to room
      io.to(`training-${trainingId}`).emit('training-progress', progress);
    }
  }
});

pythonScript.on('close', (code) => {
  if (code === 0) {
    io.to(`training-${trainingId}`).emit('training-complete', { success: true });
  } else {
    io.to(`training-${trainingId}`).emit('training-complete', { success: false });
  }
});
```

**Inference progress parsing:**
```javascript
pythonScript.stdout.on('data', (data) => {
  const output = data.toString();
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.startsWith('INFERENCE_PROGRESS:')) {
      const progressData = line.substring(19);
      const progress = JSON.parse(progressData);
      io.to(`inference-${inferenceId}`).emit('inference-progress', progress);
    } else if (line.startsWith('FINAL_RESULT:')) {
      const resultData = line.substring(13);
      const result = JSON.parse(resultData);
      finalResult = result;
    }
  }
});

pythonScript.on('close', (code) => {
  if (code === 0 && finalResult) {
    io.to(`inference-${inferenceId}`).emit('inference-complete', {
      success: true,
      result: finalResult
    });
  } else {
    io.to(`inference-${inferenceId}`).emit('inference-complete', { success: false });
  }
});
```

---

## Timing Considerations

### Critical 1-Second Delay

**Inference endpoint (`server.js:1184-1190`):**
```javascript
// Send response immediately
res.json({
  success: true,
  inference_id: inferenceId,
  status: 'starting'
});

// Start inference after a short delay to allow frontend to join room
setTimeout(() => {
  startInferenceProcess(modelPath, dataPath, outputPath, inferenceId, io);
}, 1000); // 1 second delay
```

**Why it's needed:**
1. Client receives `inference_id` in HTTP response
2. Client calls `socket.emit('join-inference', inference_id)`
3. **Delay ensures client joins room before Python starts emitting**
4. Without delay, early progress messages may be lost

**Do NOT remove this delay** without implementing a different synchronization mechanism.

---

## Error Handling

### Connection Errors

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  showNotification('Failed to connect to server', 'error');
});

socket.on('connect_timeout', () => {
  console.error('Connection timeout');
  showNotification('Connection timeout', 'error');
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log('Reconnection attempt:', attemptNumber);
});

socket.on('reconnect_failed', () => {
  console.error('Reconnection failed');
  showNotification('Unable to reconnect to server', 'error');
});
```

---

### Missing Events

```javascript
// Set timeout for expected events
function startTrainingWithTimeout(trainingId) {
  socket.emit('join-training', trainingId);

  // Set 5-minute timeout
  const timeout = setTimeout(() => {
    showNotification('Training timeout - no progress received', 'error');
    socket.off('training-progress');
    socket.off('training-complete');
  }, 300000);

  socket.on('training-progress', (data) => {
    clearTimeout(timeout);
    // Reset timeout on each progress
  });

  socket.once('training-complete', (data) => {
    clearTimeout(timeout);
    handleComplete(data);
  });
}
```

---

## Debugging

### Enable Socket.IO Debug Logs

**Client-side:**
```javascript
localStorage.debug = 'socket.io-client:*';
// Reload page to see debug logs
```

**Server-side:**
```bash
DEBUG=socket.io:* npm start
```

---

### Monitor Room Membership

**Server-side:**
```javascript
// Log all rooms a socket is in
socket.on('join-training', (trainingId) => {
  socket.join(`training-${trainingId}`);
  console.log('Socket rooms:', Array.from(socket.rooms));
});

// Get all clients in a room
io.in(`training-${trainingId}`).allSockets().then(clients => {
  console.log(`Training room ${trainingId} has ${clients.size} clients:`, clients);
});
```

---

### Test Event Flow

```javascript
// Client-side test
function testSocketConnection() {
  console.log('Testing Socket.IO connection...');

  socket.on('connect', () => {
    console.log('✅ Connected:', socket.id);

    // Test joining room
    socket.emit('join-training', 'test-123');

    // Manually trigger event (for testing)
    socket.on('training-progress', (data) => {
      console.log('✅ Received training-progress:', data);
    });
  });
}
```

---

## Related Documentation

**Architecture:**
- [API Endpoints](API_ENDPOINTS.md) - HTTP endpoints that trigger Socket.IO events
- [Python Integration](PYTHON_INTEGRATION.md) - How Python scripts emit progress
- [State Management](STATE_MANAGEMENT.md) - How to update UI from socket events

**Guides:**
- [Troubleshooting](../guides/TROUBLESHOOTING.md) - Socket.IO connection issues

**Implementation:**
- Server: `server.js:1648-1668` (connection handlers)
- Training emission: `server.js:1792-1849` (Python output parsing)
- Inference emission: `server.js:1904-2073` (Python output parsing)
- Client: `public/classic/js/socket.js` (Classic app)
- Client: `public/workspace/js/modules/segmentation/` (Workspace app)

---

**Navigation:**
← [Module System](MODULE_SYSTEM.md) | [Documentation Index](../INDEX.md) | Next: [Python Integration](PYTHON_INTEGRATION.md) →

---

**Status:** ✅ Complete
**Last Updated:** 2025-11-27
