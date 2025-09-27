# Biomedical Image Segmentation Visualizer

A complete web-based machine learning pipeline for biomedical image segmentation using U-Net neural networks, featuring real-time training progress, inference capabilities, and interactive 3D visualization.

![Node.js](https://img.shields.io/badge/Node.js-v18+-blue) ![Python](https://img.shields.io/badge/Python-3.8+-blue) ![Three.js](https://img.shields.io/badge/Three.js-r128-orange) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
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
- **Individual Class Controls**: Per-class opacity, visibility, and range controls
- **Slice-based Rendering**: Efficient rendering system for large datasets
- **Enhanced Lighting**: Professional 6-point lighting system
- **Camera Controls**: Smooth rotation, zoom, and pan interactions
- **Clipping Planes**: Advanced 3D slicing and cropping functionality
- **Multi-axis Slicing**: Support for X, Y, and Z-axis slice directions

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
- **Individual Control Panels**: Per-class visualization controls
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

# Create required directories
mkdir uploads models outputs results

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
   pip install -r requirements.txt
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
2. **Individual class controls**: Per-class opacity, visibility, and range sliders
3. **Slice controls**: Navigate through 3D volume slices in X, Y, or Z directions
4. **Transparency**: Adjust visualization opacity per class
5. **Lighting controls**: Professional visualization settings
6. **Export options**: Save screenshots or export data

## Project Structure

```
biomedical-segmentation-visualizer/
├── 📄 server.js                 # Main Express.js server with WebSocket handling
├── 📄 package.json              # Node.js dependencies and scripts
├── 📄 requirements.txt          # Python dependencies
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
  secret: 'segmentation-app-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false,  // Set to true with HTTPS
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}));
```

### Training Defaults
Default training parameters can be modified in the frontend:

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
- **File too large**: Check server upload limits (default: 200MB)
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

We welcome contributions to improve the visualizer! Here are some areas where you can help:

### Areas for Contribution
- **Additional ML models**: Support for different architectures
- **Enhanced visualization**: New rendering techniques and controls
- **Performance optimization**: Speed and memory improvements
- **Documentation**: API docs, tutorials, examples
- **Testing**: Unit tests and integration tests
- **Accessibility**: UI improvements for accessibility
- **Mobile support**: Responsive design enhancements

### Development Workflow
1. Fork the repository and create a feature branch
2. Set up development environment with hot reloading
3. Make your changes following the coding standards
4. Test thoroughly on both frontend and backend
5. Submit a pull request with detailed description

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

### Dependencies
- **Three.js**: MIT License
- **Express.js**: MIT License  
- **PyTorch**: BSD License
- **Socket.io**: MIT License
- **Chart.js**: MIT License

---