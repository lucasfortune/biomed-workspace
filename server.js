const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const uuid = require('uuid');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Session configuration
app.use(session({
  secret: 'segmentation-app-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const sessionId = req.session.id;
    const uploadDir = path.join('uploads', sessionId);
    
    // Create session-specific directory
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept only TIFF files
    if (file.mimetype === 'image/tiff' || file.originalname.toLowerCase().endsWith('.tif')) {
      cb(null, true);
    } else {
      cb(new Error('Only TIFF files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB limit for TIFF stacks
  }
});

// Store active training sessions and inference sessions
const trainingSessions = new Map();
const inferenceSessions = new Map();

// Ensure directories exist
const dirs = ['uploads', 'results', 'models', 'public'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Step 1: Upload and validate TIFF stacks
app.post('/upload-data', upload.fields([
  { name: 'raw_images', maxCount: 1 },
  { name: 'annotations', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files.raw_images || !req.files.annotations) {
      return res.status(400).json({ 
        error: 'Both raw images and annotations are required' 
      });
    }

    const rawFile = req.files.raw_images[0];
    const annotationFile = req.files.annotations[0];
    
    // Validate TIFF stacks
    const validationResult = await validateTiffStacks(rawFile.path, annotationFile.path);
    
    if (!validationResult.valid) {
      return res.status(400).json({ 
        error: 'TIFF validation failed',
        details: validationResult.error 
      });
    }

    // Store file paths in session
    req.session.uploadedFiles = {
      raw_images: rawFile.path,
      annotations: annotationFile.path,
      validation: validationResult
    };

    res.json({
      success: true,
      message: 'Files uploaded and validated successfully',
      validation: validationResult
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Configure training parameters
app.post('/configure-training', (req, res) => {
  try {
    const config = req.body;
    
    // Validate configuration
    const validationResult = validateTrainingConfig(config);
    if (!validationResult.valid) {
      return res.status(400).json({ 
        error: 'Invalid configuration',
        details: validationResult.errors 
      });
    }

    // Store configuration in session
    req.session.trainingConfig = config;

    res.json({
      success: true,
      message: 'Training configuration saved',
      config: config
    });

  } catch (error) {
    console.error('Configuration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 3: Start training
app.post('/start-training', (req, res) => {
  try {
    if (!req.session.uploadedFiles || !req.session.trainingConfig) {
      return res.status(400).json({ 
        error: 'Missing uploaded files or configuration' 
      });
    }

    const sessionId = req.session.id;
    const trainingId = uuid.v4();
    
    // Prepare training parameters
    const trainingParams = {
      session_id: sessionId,
      training_id: trainingId,
      raw_images: req.session.uploadedFiles.raw_images,
      annotations: req.session.uploadedFiles.annotations,
      config: req.session.trainingConfig,
      output_dir: path.join('models', sessionId, trainingId)
    };

    // Create output directory
    if (!fs.existsSync(trainingParams.output_dir)) {
      fs.mkdirSync(trainingParams.output_dir, { recursive: true });
    }

    // Start training process
    startTrainingProcess(trainingParams, io);

    // Store training session
    trainingSessions.set(trainingId, {
      sessionId: sessionId,
      status: 'starting',
      startTime: new Date(),
      current_epoch: 0,
      total_epochs: req.session.trainingConfig.num_epochs,
      params: trainingParams
    });

    req.session.currentTraining = trainingId;

    res.json({
      success: true,
      training_id: trainingId,
      message: 'Training started successfully'
    });

  } catch (error) {
    console.error('Training start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get training status
app.get('/training-status/:trainingId', (req, res) => {
  const trainingId = req.params.trainingId;
  const training = trainingSessions.get(trainingId);
  
  if (!training) {
    return res.status(404).json({ error: 'Training session not found' });
  }

  res.json(training);
});

// Step 4: Upload data for inference
app.post('/upload-inference', upload.single('inference_data'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided for inference' });
    }

    // Validate TIFF file
    const validationResult = await validateInferenceTiff(req.file.path);
    
    if (!validationResult.valid) {
      return res.status(400).json({ 
        error: 'TIFF validation failed',
        details: validationResult.error 
      });
    }

    res.json({
      success: true,
      message: 'Inference data uploaded successfully',
      file_path: req.file.path,
      validation: validationResult
    });

  } catch (error) {
    console.error('Inference upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Run inference
app.post('/run-inference', async (req, res) => {
  try {
    const { model_path, data_path, output_path, training_id } = req.body;
    
    console.log('Inference request received:', { model_path, data_path, output_path, training_id });
    
    // Check if training session exists and model file exists
    if (training_id && trainingSessions.has(training_id)) {
      const training = trainingSessions.get(training_id);
      const actualModelPath = path.join(training.params.output_dir, 'best_model.pth');
      
      console.log('Training session found. Checking model at:', actualModelPath);
      
      if (!fs.existsSync(actualModelPath)) {
        console.error('Model file not found at:', actualModelPath);
        console.log('Contents of training output directory:');
        try {
          const files = fs.readdirSync(training.params.output_dir);
          console.log('Files in directory:', files);
        } catch (e) {
          console.log('Could not read directory:', e.message);
        }
        
        return res.status(404).json({ 
          error: `Model file not found. Training may not have completed successfully.`,
          details: `Expected: ${actualModelPath}`
        });
      }
      
      // Generate inference ID
      const inferenceId = uuid.v4();
      
      // Store inference session
      inferenceSessions.set(inferenceId, {
        status: 'starting',
        startTime: new Date(),
        progress: 0,
        currentSlice: 0,
        totalSlices: 0
      });
      
      console.log('Generated inference ID:', inferenceId);
      
      // Send response immediately with inference ID so frontend can join room
      res.json({
        success: true,
        inference_id: inferenceId,
        status: 'starting',
        message: 'Inference request accepted. Join the WebSocket room for progress updates.'
      });
      
      // Start inference after a short delay to allow frontend to join room
      setTimeout(() => {
        console.log('Starting inference with corrected paths');
        startInferenceProcess(actualModelPath, data_path, output_path, inferenceId, io);
      }, 1000); // 1 second delay
      
    } else {
      return res.status(400).json({ 
        error: 'Training session not found or invalid training_id provided',
        training_id: training_id,
        available_sessions: Array.from(trainingSessions.keys())
      });
    }

  } catch (error) {
    console.error('Inference error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download model and config as zip
app.get('/download-model/:trainingId', (req, res) => {
  const trainingId = req.params.trainingId;
  const training = trainingSessions.get(trainingId);
  
  if (!training || training.status !== 'completed') {
    return res.status(404).json({ error: 'Model not found or training not completed' });
  }

  const modelDir = training.params.output_dir;
  const modelPath = path.join(modelDir, 'best_model.pth');
  const configPath = path.join(modelDir, 'config.json');
  const resultsPath = path.join(modelDir, 'results.json');
  
  // Check if files exist
  if (!fs.existsSync(modelPath)) {
    return res.status(404).json({ error: 'Model file not found' });
  }
  
  // Create zip file
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  // Set response headers
  res.attachment(`trained_model_${trainingId.substring(0, 8)}.zip`);
  
  // Pipe archive to response
  archive.pipe(res);
  
  // Add files to zip
  archive.file(modelPath, { name: 'best_model.pth' });
  
  if (fs.existsSync(configPath)) {
    archive.file(configPath, { name: 'training_config.json' });
  }
  
  if (fs.existsSync(resultsPath)) {
    archive.file(resultsPath, { name: 'training_results.json' });
  }
  
  // Add a readme file with instructions
  const readmeContent = `# Trained U-Net Model

This archive contains:

## Files
- **best_model.pth**: The trained PyTorch model state dict
- **training_config.json**: Configuration used for training
- **training_results.json**: Final training metrics and results

## Loading the Model

\`\`\`python
import torch
from your_unet_class import UNet  # Import your UNet class

# Load configuration
import json
with open('training_config.json', 'r') as f:
    config = json.load(f)

# Create model with same architecture
model = UNet(
    features=config['features'],
    num_layers=config['num_layers'],
    in_channels=1,
    num_classes=3
)

# Load trained weights
checkpoint = torch.load('best_model.pth')
model.load_state_dict(checkpoint['model_state_dict'])
model.eval()

# Now you can use the model for inference
\`\`\`

## Training Results
Check training_results.json for final performance metrics.

Training ID: ${trainingId}
Generated: ${new Date().toISOString()}
`;

  archive.append(readmeContent, { name: 'README.md' });
  
  // Finalize the archive
  archive.finalize();
  
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    res.status(500).json({ error: 'Failed to create archive' });
  });
});

// Serve static files
app.use('/uploads', express.static('uploads'));
app.use('/results', express.static('results'));
app.use('/models', express.static('models'));

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-training', (trainingId) => {
    socket.join(`training-${trainingId}`);
    console.log(`Client ${socket.id} joined training room: training-${trainingId}`);
  });
  
  socket.on('join-inference', (inferenceId) => {
    socket.join(`inference-${inferenceId}`);
    console.log(`Client ${socket.id} joined inference room: inference-${inferenceId}`);
    
    // Send a confirmation message
    socket.emit('inference-room-joined', { inferenceId: inferenceId });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Helper functions
async function validateTiffStacks(rawPath, annotationPath) {
  return new Promise((resolve) => {
    const pythonScript = spawn('python', [
      'python/validate_tiff.py',
      rawPath,
      annotationPath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonScript.on('close', (code) => {
      // Always try to parse the JSON output first, regardless of exit code
      // The Python script always outputs valid JSON
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        // If JSON parsing fails, fall back to generic error
        console.error('Failed to parse validation output:', output);
        console.error('Stderr:', error);
        resolve({ 
          valid: false, 
          error: error || 'Invalid validation output - failed to parse JSON response'
        });
      }
    });
  });
}

function validateTrainingConfig(config) {
  const errors = [];
  
  // Required fields
  const required = ['patch_size', 'patches_per_image', 'batch_size', 'num_epochs', 'learning_rate', 'features', 'num_layers'];
  
  for (const field of required) {
    if (!config[field]) {
      errors.push(`${field} is required`);
    }
  }

  // Validate ranges
  if (config.patch_size && (config.patch_size < 64 || config.patch_size > 1024)) {
    errors.push('patch_size must be between 64 and 1024');
  }

  if (config.learning_rate && (config.learning_rate <= 0 || config.learning_rate > 1)) {
    errors.push('learning_rate must be between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function startTrainingProcess(params, io) {
  const pythonScript = spawn('python', [
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
          
          console.log('Parsed progress:', progress);
          
          // Update training session
          const training = trainingSessions.get(params.training_id);
          if (training) {
            training.status = 'training';
            training.current_epoch = progress.epoch;
            training.total_epochs = progress.total_epochs;
            training.metrics = progress.metrics;
          }
          
          // Send real-time update to clients
          io.to(`training-${params.training_id}`).emit('training-progress', progress);
          console.log(`Emitted progress to room: training-${params.training_id}`);
          
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
        training.endTime = new Date();
        io.to(`training-${params.training_id}`).emit('training-complete', { success: true });
      } else {
        training.status = 'failed';
        training.endTime = new Date();
        io.to(`training-${params.training_id}`).emit('training-complete', { success: false });
      }
    }
  });
}

async function validateInferenceTiff(filePath) {
  return new Promise((resolve) => {
    const pythonScript = spawn('python', [
      'python/validate_inference_tiff.py',
      filePath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonScript.on('close', (code) => {
      // Always try to parse the JSON output first, regardless of exit code
      // The Python script always outputs valid JSON
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        // If JSON parsing fails, fall back to generic error
        console.error('Failed to parse validation output:', output);
        console.error('Stderr:', error);
        resolve({ 
          valid: false, 
          error: error || 'Invalid validation output - failed to parse JSON response'
        });
      }
    });
  });
}

async function runInferenceWithProgress(modelPath, dataPath, outputPath, inferenceId, io) {
  return new Promise((resolve, reject) => {
    const pythonScript = spawn('python', [
      'python/run_inference.py',
      '--model', modelPath,
      '--input', dataPath,
      '--output', outputPath,
      '--inference_id', inferenceId
    ]);

    let outputBuffer = '';
    let errorOutput = '';
    let finalResult = null;
    let backupJsonLines = [];
    let collectingBackupJson = false;
    
    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Inference output:', output);
      
      // Add to buffer
      outputBuffer += output;
      
      // Process complete lines
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('INFERENCE_PROGRESS:')) {
          try {
            const progressData = line.substring(19);
            const progress = JSON.parse(progressData);
            
            console.log('Parsed inference progress:', progress);
            
            // Update inference session
            const inference = inferenceSessions.get(inferenceId);
            if (inference) {
              inference.currentSlice = progress.current_slice;
              inference.totalSlices = progress.total_slices;
              inference.progress = progress.progress_percent;
            }
            
            // Send real-time update to clients
            io.to(`inference-${inferenceId}`).emit('inference-progress', progress);
            console.log(`Emitted inference progress to room: inference-${inferenceId}`);
            
          } catch (e) {
            console.error('Error parsing inference progress data:', e.message);
          }
        } else if (line.startsWith('FINAL_RESULT:')) {
          try {
            const resultData = line.substring(13);
            finalResult = JSON.parse(resultData);
            console.log('Parsed final result:', finalResult);
          } catch (e) {
            console.error('Error parsing final result:', e.message);
            finalResult = { success: false, error: 'Failed to parse final result' };
          }
        } else if (line === 'BACKUP_JSON_START') {
          collectingBackupJson = true;
          backupJsonLines = [];
          console.log('Started collecting backup JSON');
        } else if (line === 'BACKUP_JSON_END') {
          collectingBackupJson = false;
          console.log('Finished collecting backup JSON');
          
          // Try to parse backup JSON if we don't have final result yet
          if (!finalResult && backupJsonLines.length > 0) {
            try {
              const backupJsonString = backupJsonLines.join('\n');
              finalResult = JSON.parse(backupJsonString);
              console.log('Successfully parsed backup JSON:', finalResult);
            } catch (e) {
              console.error('Failed to parse backup JSON:', e.message);
            }
          }
        } else if (collectingBackupJson) {
          backupJsonLines.push(line);
        }
      }
    });
    
    pythonScript.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error('Inference error:', data.toString());
    });

    pythonScript.on('close', (code) => {
      const inference = inferenceSessions.get(inferenceId);
      
      console.log(`Python script finished with code: ${code}`);
      console.log(`Final result found: ${finalResult ? 'yes' : 'no'}`);
      console.log(`Output buffer length: ${outputBuffer.length}`);
      console.log(`Output buffer content: "${outputBuffer}"`);
      
      if (code === 0) {
        // Check if we got a final result
        if (finalResult) {
          if (inference) {
            inference.status = 'completed';
            inference.endTime = new Date();
          }
          
          io.to(`inference-${inferenceId}`).emit('inference-complete', { 
            success: true, 
            result: finalResult 
          });
          
          if (finalResult.success) {
            resolve(finalResult);
          } else {
            reject(new Error(finalResult.error || 'Inference failed'));
          }
        } else {
          // Try to parse any remaining output as backup
          console.log('No FINAL_RESULT found, trying to parse remaining buffer...');
          
          // Try to find JSON in the remaining buffer
          try {
            // Look for JSON-like content in the buffer
            const jsonMatch = outputBuffer.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[0]);
              console.log('Successfully parsed JSON from buffer:', result);
              
              if (inference) {
                inference.status = 'completed';
                inference.endTime = new Date();
              }
              io.to(`inference-${inferenceId}`).emit('inference-complete', { 
                success: true, 
                result: finalResult 
              });
              resolve(result);
              return;
            }
            
            // If no JSON found, create a success result manually
            const manualResult = {
              success: true,
              output_path: outputPath,
              metadata_path: outputPath.replace('.tif', '_metadata.json'),
              visualization_path: outputPath.replace('.tif', '') + '_visualization_data.json',
              metrics: { message: 'Inference completed but metrics not available' }
            };
            
            console.log('Created manual result:', manualResult);
            
            if (inference) {
              inference.status = 'completed';
              inference.endTime = new Date();
            }
            io.to(`inference-${inferenceId}`).emit('inference-complete', { 
              success: true, 
              result: finalResult 
            });
            resolve(manualResult);
            
          } catch (e) {
            console.error('Failed to parse any output as JSON:', e.message);
            console.error('Complete output buffer:', outputBuffer);
            console.error('Complete error output:', errorOutput);
            
            if (inference) {
              inference.status = 'failed';
              inference.endTime = new Date();
            }
            io.to(`inference-${inferenceId}`).emit('inference-complete', { success: false });
            reject(new Error(`Failed to get inference result. Output: "${outputBuffer}"`));
          }
        }
      } else {
        console.error(`Python script failed with code ${code}`);
        console.error('Error output:', errorOutput);
        
        if (inference) {
          inference.status = 'failed';
          inference.endTime = new Date();
        }
        
        io.to(`inference-${inferenceId}`).emit('inference-complete', { success: false });
        reject(new Error(`Inference failed with code ${code}: ${errorOutput}`));
      }
    });
  });
}

function startInferenceProcess(modelPath, dataPath, outputPath, inferenceId, io) {
  // Update inference session status
  const inference = inferenceSessions.get(inferenceId);
  if (inference) {
    inference.status = 'running';
  }
  
  // Start the inference process
  runInferenceWithProgress(modelPath, dataPath, outputPath, inferenceId, io)
    .then((result) => {
      console.log('Inference completed successfully:', result);
      
      // Update inference session with final result
      const inference = inferenceSessions.get(inferenceId);
      if (inference) {
        inference.status = 'completed';
        inference.endTime = new Date();
        inference.result = result;
      }
      
      // Send completion with full result
      io.to(`inference-${inferenceId}`).emit('inference-complete', { 
        success: true, 
        result: result 
      });
    })
    .catch((error) => {
      console.error('Inference failed:', error);
      
      // Update inference session with error
      const inference = inferenceSessions.get(inferenceId);
      if (inference) {
        inference.status = 'failed';
        inference.endTime = new Date();
        inference.error = error.message;
      }
      
      // Send failure notification
      io.to(`inference-${inferenceId}`).emit('inference-complete', { 
        success: false, 
        error: error.message 
      });
    });
}

// Get inference status
app.get('/inference-status/:inferenceId', (req, res) => {
  const inferenceId = req.params.inferenceId;
  const inference = inferenceSessions.get(inferenceId);
  
  if (!inference) {
    return res.status(404).json({ error: 'Inference session not found' });
  }

  res.json(inference);
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 200MB)' });
    }
  }
  res.status(500).json({ error: error.message });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});