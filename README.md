# Biomedical Image Segmentation Visualizer

A complete web-based machine learning pipeline for biomedical image segmentation using U-Net neural networks, featuring real-time training progress, inference capabilities, and interactive 3D visualization.

![Project Demo](https://img.shields.io/badge/Status-Active-green) ![Node.js](https://img.shields.io/badge/Node.js-v18+-blue) ![Python](https://img.shields.io/badge/Python-3.8+-blue) ![Three.js](https://img.shields.io/badge/Three.js-r128-orange) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

This application provides researchers and scientists with a complete toolkit for biomedical image analysis. Upload TIFF image stacks, train custom U-Net models, run segmentation inference, and visualize results in stunning 3D - all through an intuitive web interface.

### What This Application Does

1. **Complete ML Pipeline**: From raw data upload to 3D visualization
2. **U-Net Training**: Train custom neural networks for your specific data
3. **Real-time Progress**: Live updates during training and inference with WebSocket communication
4. **Interactive 3D Visualization**: Advanced Three.js-powered 3D visualization with modular architecture
5. **Performance Monitoring**: Training charts and validation metrics
6. **Model Management**: Save, download, and reuse trained models

## Features

### Core Functionality
- **Multi-step Workflow**: Guided 5-step process from data upload to visualization
- **TIFF Stack Support**: Native support for biomedical TIFF image stacks
- **Custom U-Net Architecture**: Configurable neural network parameters
- **Session Management**: Individual user sessions with isolated data
- **Real-time Communication**: WebSocket-based progress updates

### Advanced 3D Visualization
- **Modular Architecture**: Clean, maintainable visualization code structure
- **Interactive Rendering**: Three.js-powered WebGL visualization
- **Class-based Segmentation**: Multi-class visualization with individual controls
- **Slice-based Rendering**: Efficient rendering system for large datasets
- **Enhanced Lighting**: Professional 4-point lighting system
- **Camera Controls**: Smooth rotation, zoom, and pan interactions
- **Clipping Planes**: Advanced 3D slicing and cropping functionality

### Scientific Features
- **3-Class Segmentation**: Background, foreground, and boundary detection
- **Patch-based Training**: Efficient memory usage for large images
- **Data Augmentation**: Optional augmentation for improved model performance
- **Model Validation**: Automatic train/validation/test splits
- **Performance Metrics**: Dice coefficient and accuracy reporting
- **Sparse Data Storage**: Efficient 3D data representation for visualization

### User Interface
- **Responsive Design**: Works on desktop and tablet devices
- **Modern Interface**: Clean, intuitive user experience with step navigation
- **Real-time Charts**: Training progress visualization with Chart.js
- **Modal System**: Clean modal interfaces for configuration
- **Progress Tracking**: Comprehensive progress indicators throughout the pipeline

## Technology Stack

### Backend
- **Node.js** - Server runtime environment
- **Express.js** - Web application framework
- **Socket.io** - Real-time bidirectional communication
- **Multer** - File upload middleware with session-based storage
- **Express-session** - Session management for user isolation
- **Archiver** - ZIP file creation for model downloads

### Frontend
- **Three.js (r128)** - 3D visualization and WebGL rendering
- **Chart.js** - Real-time training progress visualization
- **Socket.io Client** - Real-time communication with server
- **ES6 Modules** - Modern modular JavaScript architecture
- **CSS Grid/Flexbox** - Responsive layout system

### Machine Learning
- **PyTorch** - Deep learning framework
- **TIFF Processing** - Native TIFF stack handling for biomedical data
- **U-Net Architecture** - Configurable convolutional neural network
- **CUDA Support** - GPU acceleration when available

### Data Processing
- **NumPy** - Numerical computing for image processing
- **PIL/Pillow** - Additional image processing capabilities
- **JSON** - Configuration and data serialization
- **Sparse Data Structures** - Efficient 3D data representation

## Prerequisites

### System Requirements
- **Node.js** v18 or higher
- **Python** 3.8 or higher
- **Operating System**: Windows, macOS, or Linux
- **Memory**: Minimum 8GB RAM (16GB recommended for large datasets)
- **Storage**: 5GB free space for models and data

### Python Dependencies
```bash
pip install torch torchvision tifffile numpy pillow
```

### Optional (for GPU acceleration)
- CUDA-compatible GPU
- CUDA Toolkit 11.0+
- cuDNN library

## Installation

### Quick Start
```bash
# Clone the repository
git clone <your-repository-url>
cd biomedical-segmentation-visualizer

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt

# Start the application
npm start
```

### Detailed Setup

1. **Install Node.js Dependencies**
   ```bash
   npm install
   ```

2. **Set up Python Environment** (recommended)
   ```bash
   # Create virtual environment
   python -m venv venv

   # Activate (Windows)
   venv\Scripts\activate
   
   # Activate (macOS/Linux)
   source venv/bin/activate

   # Install Python packages
   pip install torch torchvision tifffile numpy pillow
   ```

3. **Create Required Directories**
   ```bash
   mkdir uploads models outputs results
   ```

4. **Start the Server**
   ```bash
   # Development mode (auto-restart on changes)
   npm run dev

   # Production mode
   npm start
   ```

5. **Access the Application**
   Open http://localhost:3000 in your browser

## Usage

### Complete Workflow

#### Step 1: Upload Training Data
1. **Prepare your data**: TIFF stacks for raw images and annotations
2. **Upload files**: Use the drag-and-drop interface
3. **Validation**: Automatic TIFF stack validation and compatibility check
4. **Session creation**: Individual session directory created

#### Step 2: Configure Training Parameters
- **Patch Size**: Recommended 512x512 for most biomedical images
- **Batch Size**: Start with 4, adjust based on GPU memory
- **Learning Rate**: Default 0.001, lower for fine-tuning
- **Epochs**: 50-100 typically sufficient
- **Architecture**: U-Net features and layers configuration
- **Data Augmentation**: Toggle augmentation techniques

#### Step 3: Train the Model
1. **Start training**: Real-time progress updates via WebSocket
2. **Monitor progress**: Live charts showing loss and accuracy
3. **View metrics**: Training/validation performance
4. **Model saving**: Best model automatically saved based on validation score

#### Step 4: Run Inference
1. **Upload new data**: TIFF stack for segmentation
2. **Select model**: Use your newly trained model
3. **Run segmentation**: Real-time progress tracking
4. **Download results**: Get segmented TIFF files and visualization data

#### Step 5: 3D Visualization
1. **Interactive 3D view**: Mouse controls for rotation, zoom, pan
2. **Class filtering**: Show/hide different segmentation classes
3. **Slice controls**: Navigate through 3D volume slices
4. **Transparency**: Adjust visualization opacity per class
5. **Lighting controls**: Professional visualization settings
6. **Export options**: Save screenshots or export data

## Project Structure

```
biomedical-segmentation-visualizer/
├── 📄 server.js                 # Main Express.js server with WebSocket handling
├── 📄 package.json              # Node.js dependencies and scripts
├── 📄 package-lock.json         # Locked dependency versions
├── 📁 public/                   # Frontend files (served statically)
│   ├── 📄 index.html           # Main single-page application
│   ├── 📁 css/                 # Modular CSS stylesheets
│   │   ├── base.css            # Base styles and variables
│   │   ├── layout.css          # Layout and grid systems
│   │   ├── components.css      # UI components
│   │   ├── steps.css           # Step-specific styles
│   │   ├── charts.css          # Chart visualization styles
│   │   └── modals.css          # Modal dialog styles
│   └── 📁 js/                  # JavaScript modules
│       ├── 📄 socket.js        # WebSocket client handling
│       ├── 📄 visualization.js # Main visualization entry point
│       └── 📁 visualization/   # Modular 3D visualization system
│           ├── main.js         # Orchestration and initialization
│           ├── scene.js        # Three.js scene setup and lighting
│           ├── meshCreation.js # 3D mesh generation from data
│           ├── interactions.js # Mouse/keyboard controls
│           ├── uiControls.js   # Visualization UI controls
│           ├── clipping.js     # 3D clipping and slicing
│           ├── utils.js        # Utility functions
│           └── debug.js        # Debugging tools
├── 📁 python/                   # Python ML pipeline
│   ├── 📄 train_model.py       # U-Net training with progress reporting
│   ├── 📄 run_inference.py     # Inference with 3D data generation
│   └── 📄 validate_tiff.py     # TIFF validation utilities
├── 📁 uploads/                  # User uploads (session-organized)
│   └── 📁 [session-id]/        # Individual session directories
├── 📁 models/                   # Trained model storage
├── 📁 outputs/                  # Training outputs and logs
├── 📁 results/                  # Inference results and visualizations
└── 📁 node_modules/            # Installed Node.js packages
```

### Key Components Explained

#### `server.js` - Main Server Application
The heart of the application containing:
- **Express.js setup**: Server configuration and middleware
- **API endpoints**: RESTful routes for each pipeline step
- **Socket.io integration**: Real-time progress communication
- **Session management**: User isolation and data handling
- **File upload handling**: Multer configuration with validation
- **Python script orchestration**: Spawning and monitoring ML processes
- **Model download**: ZIP archive creation for trained models

#### `public/js/visualization/` - Modular 3D System
Advanced modular architecture for 3D visualization:
- **main.js**: Central orchestration and state management
- **scene.js**: Three.js scene initialization and lighting setup
- **meshCreation.js**: Efficient mesh generation from segmentation data
- **interactions.js**: Mouse/keyboard interaction handling
- **uiControls.js**: Visualization control panel management
- **clipping.js**: Advanced 3D slicing and clipping plane management
- **utils.js**: Shared utilities and helper functions

#### `python/train_model.py` - Training Pipeline
Comprehensive U-Net training implementation:
- **TIFF stack processing**: Native biomedical image handling
- **Patch-based training**: Memory-efficient processing
- **Data augmentation**: Optional geometric and intensity transforms
- **Progress reporting**: Real-time WebSocket communication
- **Model checkpointing**: Best model preservation
- **Metrics calculation**: Dice coefficient and accuracy tracking

#### `python/run_inference.py` - Inference Engine
Production inference with visualization data generation:
- **Model loading**: Robust checkpoint restoration
- **Slice-by-slice processing**: Memory-efficient inference
- **3D data generation**: Sparse data structure for visualization
- **Progress tracking**: Real-time inference updates
- **Multi-format output**: TIFF results and JSON visualization data

## API Documentation

### Training Endpoints

#### `POST /upload-training`
Upload training data (raw images and annotations).

**Request**: Multipart form data
```javascript
FormData:
- raw_images: File (TIFF stack)
- annotations: File (TIFF stack)
```

**Response**:
```json
{
  "success": true,
  "message": "Files uploaded successfully",
  "raw_path": "/uploads/session/raw.tif",
  "annotations_path": "/uploads/session/annotations.tif",
  "validation": {
    "valid": true,
    "dimensions": [512, 512, 100],
    "slices": 100
  }
}
```

#### `POST /start-training`
Start the U-Net training process.

**Request**:
```json
{
  "config": {
    "patch_size": 512,
    "patches_per_image": 10,
    "batch_size": 4,
    "learning_rate": 0.001,
    "num_epochs": 50,
    "features": 64,
    "num_layers": 4,
    "augment": true
  },
  "raw_path": "/uploads/session/raw.tif",
  "annotations_path": "/uploads/session/annotations.tif"
}
```

**Response**:
```json
{
  "success": true,
  "training_id": "uuid-string",
  "message": "Training started successfully"
}
```

#### `GET /training-status/:trainingId`
Get current training status and progress.

**Response**:
```json
{
  "training_id": "uuid-string",
  "status": "training|completed|failed",
  "progress": {
    "epoch": 25,
    "total_epochs": 50,
    "current_loss": 0.234,
    "best_val_dice": 0.87,
    "current_lr": 0.001
  },
  "startTime": "2024-01-01T10:00:00.000Z"
}
```

### Inference Endpoints

#### `POST /upload-inference`
Upload data for inference.

**Request**: Multipart form data
```javascript
FormData:
- inference_data: File (TIFF stack)
```

**Response**:
```json
{
  "success": true,
  "message": "Inference data uploaded successfully",
  "file_path": "/uploads/session/inference.tif",
  "validation": {
    "valid": true,
    "dimensions": [512, 512, 80]
  }
}
```

#### `POST /run-inference`
Run segmentation inference.

**Request**:
```json
{
  "model_path": "/models/best_model.pth",
  "data_path": "/uploads/inference_data.tif",
  "output_path": "/results/segmented_output.tif",
  "training_id": "uuid-string"
}
```

**Response**:
```json
{
  "success": true,
  "inference_id": "uuid-string",
  "message": "Inference started successfully"
}
```

### Model Management

#### `GET /download-model/:trainingId`
Download trained model as ZIP file.

**Response**: ZIP file containing:
- `best_model.pth` - Trained model weights and configuration
- `training_config.json` - Complete training configuration
- `training_results.json` - Final performance metrics
- `README.md` - Usage instructions and model information

### WebSocket Events

#### Training Progress
```javascript
socket.on('training-progress', (data) => {
  // data: { epoch, loss, val_loss, val_dice, learning_rate }
});

socket.on('training-complete', (data) => {
  // data: { success, training_id, final_metrics }
});
```

#### Inference Progress
```javascript
socket.on('inference-progress', (data) => {
  // data: { current_slice, total_slices, progress_percent }
});

socket.on('inference-complete', (data) => {
  // data: { success, result: { segmented_path, visualization_path } }
});
```

## Configuration

### Server Configuration
Key settings in `server.js`:

```javascript
const PORT = process.env.PORT || 3000;

// File upload limits
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 200 * 1024 * 1024,  // 200MB limit
    files: 2
  }
});

// Session configuration
app.use(session({
  secret: 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false,  // Set to true with HTTPS
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}));
```

### Visualization Configuration
The 3D visualization system can be configured in `public/js/visualization/main.js`:

```javascript
// Visualization parameters
export let sliceMetadata = { 
  sliceCount: 20, 
  sliceDirection: 'z', 
  visibleSliceRange: [0, 19] 
};

// Camera and rendering settings
const cameraSettings = {
  fov: 75,
  near: 0.1,
  far: 1000,
  position: [3, 2, 5]
};
```

### Training Defaults
Default training parameters can be modified in the frontend or server:

```javascript
const defaultTrainingConfig = {
  patch_size: 512,
  patches_per_image: 10,
  batch_size: 4,
  learning_rate: 0.001,
  num_epochs: 50,
  features: 64,
  num_layers: 4,
  augment: true
};
```

## Troubleshooting

### Common Issues and Solutions

#### Installation Problems
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Python environment issues
pip install --upgrade pip
pip install --force-reinstall torch torchvision
```

#### Server Issues
```bash
# Port already in use
lsof -ti:3000 | xargs kill -9

# Use different port
PORT=3001 npm start

# Memory issues with large datasets
node --max-old-space-size=8192 server.js
```

#### Training Problems
- **CUDA out of memory**: Reduce batch size or patch size
- **Training very slow**: Check GPU utilization, consider CPU-only mode
- **Poor validation scores**: Increase epochs, check data quality
- **Python script errors**: Verify all dependencies installed correctly

#### 3D Visualization Issues
- **WebGL not supported**: Update browser, check graphics drivers
- **Slow rendering**: Reduce data resolution, check system performance
- **Controls not responsive**: Clear browser cache, check for JavaScript errors

#### File Upload Problems
- **File too large**: Check server upload limits
- **TIFF validation fails**: Verify TIFF format compatibility
- **Session expired**: Files may be cleaned up, re-upload if needed

### Debug Mode
Enable comprehensive debugging:

```bash
# Node.js debugging
DEBUG=* npm start

# Python script debugging
PYTHONPATH=. python python/train_model.py --verbose

# Browser console debugging
# Open Developer Tools (F12) and check console for errors
```

### Performance Optimization

#### For Large Datasets
- Increase system memory allocation
- Use GPU acceleration when available
- Consider data preprocessing and compression
- Monitor disk space usage

#### For Better Visualization Performance
- Use modern browsers with WebGL 2.0 support
- Ensure graphics drivers are updated
- Close other browser tabs during visualization
- Consider reducing visualization data resolution

## Contributing

We welcome contributions to improve the visualizer! Here's how to get involved:

### Development Workflow
1. **Fork the repository** and create a feature branch
2. **Set up development environment** with hot reloading
3. **Make your changes** following the coding standards
4. **Test thoroughly** on both frontend and backend
5. **Submit a pull request** with detailed description

### Code Organization Guidelines

#### JavaScript (Frontend)
- **ES6+ features**: Use modern JavaScript syntax
- **Modular architecture**: Keep modules focused and independent
- **Error handling**: Comprehensive try-catch blocks
- **Performance**: Avoid memory leaks in Three.js operations

#### Node.js (Backend)
- **Async/await**: Use modern asynchronous patterns
- **Error middleware**: Proper error handling and logging
- **Security**: Input validation and sanitization
- **API design**: RESTful endpoints with clear documentation

#### Python (ML Pipeline)
- **PEP 8 compliance**: Follow Python style guidelines
- **Type hints**: Use type annotations where appropriate
- **Error handling**: Robust exception handling
- **Memory efficiency**: Optimize for large datasets

### Areas for Contribution
- **Additional ML models**: Support for different architectures
- **Enhanced visualization**: New rendering techniques and controls
- **Performance optimization**: Speed and memory improvements
- **Documentation**: API docs, tutorials, examples
- **Testing**: Unit tests and integration tests
- **Accessibility**: UI improvements for accessibility
- **Mobile support**: Responsive design enhancements

### Testing
```bash
# Frontend testing (if test suite available)
npm test

# Backend API testing
npm run test:server

# Python components testing
python -m pytest python/tests/ -v
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

### Dependencies
- **Three.js**: MIT License
- **Express.js**: MIT License  
- **PyTorch**: BSD License
- **Socket.io**: MIT License
- **Chart.js**: MIT License

## Acknowledgments

- **PyTorch Team** - Deep learning framework and ecosystem
- **Three.js Contributors** - 3D visualization library and WebGL abstraction
- **Express.js Community** - Web framework and middleware ecosystem
- **Biomedical Imaging Community** - Domain expertise and requirements
- **Open Source Contributors** - All the amazing libraries that made this possible

## Support & Community

### Getting Help
1. **Check the troubleshooting section** above for common issues
2. **Search existing issues** in the repository
3. **Create a detailed issue** with system info and error logs
4. **Join our community discussions** for general questions

### Reporting Issues
When reporting bugs, please include:
- **System information**: OS, Node.js version, Python version
- **Error messages**: Complete stack traces and logs
- **Steps to reproduce**: Detailed reproduction steps
- **Expected vs actual behavior**: Clear description of the problem
- **Data information**: Dataset size and format (if relevant)

### Feature Requests
We welcome suggestions for new features! Please provide:
- **Clear use case**: Why this feature would be valuable
- **Detailed description**: How the feature should work
- **Implementation ideas**: Any technical considerations
- **Examples**: Similar features in other tools (if applicable)

---
