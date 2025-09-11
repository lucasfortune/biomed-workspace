# Biomedical Image Segmentation Visualizer

A complete web-based machine learning pipeline for biomedical image segmentation using U-Net neural networks, featuring real-time training progress, inference capabilities, and interactive 3D visualization.

![Project Demo](https://img.shields.io/badge/Status-Active-green) ![Node.js](https://img.shields.io/badge/Node.js-v18+-blue) ![Python](https://img.shields.io/badge/Python-3.8+-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

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
3. **Real-time Progress**: Live updates during training and inference
4. **3D Visualization**: Interactive WebGL-based visualization of segmentation results
5. **Performance Monitoring**: Training charts and validation metrics
6. **Model Management**: Save, download, and reuse trained models

## Features

### Core Functionality
- **Multi-step Workflow**: Guided 5-step process from data upload to visualization
- **TIFF Stack Support**: Native support for biomedical TIFF image stacks
- **Custom U-Net Architecture**: Configurable neural network parameters
- **Session Management**: Individual user sessions with isolated data
- **Real-time Communication**: WebSocket-based progress updates

### Visualization & UI
- **Interactive 3D Rendering**: Three.js-powered 3D visualization
- **Training Progress Charts**: Real-time loss and accuracy plotting
- **Responsive Design**: Works on desktop and tablet devices
- **Modern Interface**: Clean, intuitive user experience

### Scientific Features
- **3-Class Segmentation**: Background, foreground, and boundary detection
- **Patch-based Training**: Efficient memory usage for large images
- **Data Augmentation**: Optional augmentation for improved model performance
- **Model Validation**: Automatic train/validation/test splits
- **Performance Metrics**: Dice coefficient and accuracy reporting

## Technology Stack

### Backend
- **Node.js** - Server runtime environment
- **Express.js** - Web application framework
- **Socket.io** - Real-time bidirectional communication
- **Multer** - File upload middleware
- **Express-session** - Session management

### Frontend
- **Vanilla JavaScript** - No frameworks, pure JS
- **Three.js** - 3D graphics and visualization
- **Chart.js** - Training progress visualization
- **Socket.io Client** - Real-time updates
- **Modern CSS** - Responsive design with flexbox/grid

### Machine Learning
- **Python 3.8+** - ML backend language
- **PyTorch** - Deep learning framework
- **NumPy** - Numerical computing
- **PIL/Pillow** - Image processing
- **tifffile** - TIFF format handling

## Prerequisites

Before installing this application, ensure you have:

### Required Software
- **Node.js** (v18.0 or higher) - [Download here](https://nodejs.org/)
- **Python** (3.8 or higher) - [Download here](https://python.org/)
- **npm** (usually comes with Node.js)
- **pip** (usually comes with Python)

### System Requirements
- **RAM**: 8GB minimum (16GB recommended for large datasets)
- **Storage**: 5GB free space for models and data
- **GPU**: CUDA-compatible GPU recommended (optional, CPU works too)

### Check Your Installation
```bash
# Check Node.js version
node --version

# Check Python version
python --version  # or python3 --version

# Check npm version
npm --version

# Check pip version
pip --version  # or pip3 --version
```

## Installation

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd biomedical-segmentation-visualizer
```

### Step 2: Install Node.js Dependencies
```bash
# Install all Node.js packages listed in package.json
npm install
```

This installs:
- `express` - Web server framework
- `socket.io` - Real-time communication
- `multer` - File upload handling
- `cors` - Cross-origin resource sharing
- `express-session` - Session management
- `archiver` - ZIP file creation
- `uuid` - Unique ID generation
- `nodemon` - Development auto-restart (dev dependency)

### Step 3: Install Python Dependencies
```bash
# Create a virtual environment (recommended)
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install Python packages
pip install torch torchvision tifffile numpy pillow
```

### Step 4: Create Required Directories
```bash
# Create directories for uploads and outputs
mkdir uploads
mkdir models
mkdir outputs
```

### Step 5: Verify Installation
```bash
# Run the application in development mode
npm run dev
```

If everything is installed correctly, you should see:
```
Server running on port 3000
```

## Usage

### Starting the Application

#### Development Mode (with auto-restart)
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

### Access the Application
Open your web browser and navigate to:
```
http://localhost:3000
```

### Complete Workflow

#### Step 1: Upload Training Data
1. **Prepare your data**: You need two TIFF stacks:
   - **Raw images**: Original biomedical images
   - **Annotations**: Ground truth segmentation masks
2. **Upload files**: Use the file upload interface
3. **Validation**: The system validates your TIFF files

#### Step 2: Configure Training Parameters
Set your U-Net training parameters:

```javascript
// Example configuration
{
  "patch_size": 512,           // Size of training patches
  "patches_per_image": 10,     // Number of patches per image
  "batch_size": 4,             // Training batch size
  "features": 64,              // Base number of features
  "num_layers": 4,             // Number of U-Net layers
  "learning_rate": 0.001,      // Learning rate
  "num_epochs": 50,            // Training epochs
  "augment": true              // Enable data augmentation
}
```

#### Step 3: Train Your Model
1. **Start training**: Click "Start Training"
2. **Monitor progress**: Watch real-time charts
3. **View metrics**: Training/validation loss and accuracy
4. **Wait for completion**: Training time depends on data size and epochs

#### Step 4: Run Inference
1. **Upload new data**: TIFF stack for segmentation
2. **Select model**: Use your newly trained model
3. **Run segmentation**: Process your data
4. **Download results**: Get segmented TIFF files

#### Step 5: 3D Visualization
1. **Interactive 3D view**: Rotate, zoom, pan
2. **Class filtering**: Show/hide different classes
3. **Transparency control**: Adjust visualization opacity
4. **Export options**: Save screenshots or data

## Project Structure

```
biomedical-segmentation-visualizer/
├── 📄 server.js                 # Main Express.js server
├── 📄 server.js.backup          # Backup server file
├── 📄 package.json              # Node.js dependencies and scripts
├── 📄 package-lock.json         # Locked dependency versions
├── 📁 public/                   # Frontend files (served statically)
│   └── 📄 index.html           # Main web interface
├── 📁 python/                   # Python ML scripts
│   ├── 📄 train_model.py       # U-Net training script
│   └── 📄 run_inference.py     # Inference script
├── 📁 uploads/                  # User uploads (created automatically)
│   └── 📁 [session-id]/        # Session-specific directories
├── 📁 models/                   # Trained models storage
├── 📁 outputs/                  # Training and inference outputs
└── 📁 node_modules/            # Installed Node.js packages
```

### Key Files Explained

#### `server.js` - Main Server File
The heart of the application containing:
- **Express.js setup**: Server configuration and middleware
- **Route handlers**: API endpoints for each step
- **Socket.io integration**: Real-time communication
- **Python script orchestration**: Launching ML processes
- **Session management**: User isolation and data handling

#### `public/index.html` - Frontend Interface
Single-page application featuring:
- **5-step workflow**: Guided user interface
- **Real-time updates**: Socket.io client integration
- **3D visualization**: Three.js implementation
- **Chart integration**: Training progress visualization

#### `python/train_model.py` - Training Script
U-Net training implementation:
- **Data preprocessing**: TIFF handling and patch extraction
- **Model architecture**: Configurable U-Net implementation
- **Training loop**: With validation and progress reporting
- **Model saving**: Checkpoint management

#### `python/run_inference.py` - Inference Script
Segmentation inference:
- **Model loading**: Trained model restoration
- **Image processing**: Slice-by-slice inference
- **3D data generation**: Visualization data creation
- **Results saving**: Output file management

## 🔌 API Documentation

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
  "annotations_path": "/uploads/session/annotations.tif"
}
```

#### `POST /start-training`
Start the U-Net training process.

**Request**:
```json
{
  "config": {
    "patch_size": 512,
    "batch_size": 4,
    "learning_rate": 0.001,
    "num_epochs": 50,
    "features": 64,
    "num_layers": 4
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
    "best_val_dice": 0.87
  }
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

#### `POST /run-inference`
Run segmentation inference.

**Request**:
```json
{
  "model_path": "/models/best_model.pth",
  "data_path": "/uploads/inference_data.tif",
  "training_id": "uuid-string"
}
```

### Model Management

#### `GET /download-model/:trainingId`
Download trained model as ZIP file.

**Response**: ZIP file containing:
- `best_model.pth` - Trained model weights
- `training_config.json` - Training configuration
- `training_results.json` - Final metrics
- `README.txt` - Usage instructions

## Configuration

### Server Configuration
Modify these settings in `server.js`:

```javascript
const PORT = process.env.PORT || 3000;  // Server port

// Session configuration
app.use(session({
  secret: 'your-secret-key',  // Change in production
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }   // Set to true with HTTPS
}));
```

### File Upload Limits
Configure in multer setup:

```javascript
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024,  // 100MB limit
    files: 2                       // Max 2 files
  }
});
```

### Python Environment
Set Python path if needed:

```javascript
// In server.js, modify Python command
const pythonProcess = spawn('python3', [...]);  // Use python3 if needed
```

## Troubleshooting

### Common Issues

#### "Module not found" errors
```bash
# Reinstall Node.js dependencies
rm -rf node_modules package-lock.json
npm install
```

#### Python script errors
```bash
# Check Python installation
python --version
pip list

# Reinstall Python packages
pip install --upgrade torch torchvision tifffile numpy pillow
```

#### Port already in use
```bash
# Kill process on port 3000 (Linux/Mac)
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm start
```

#### File upload fails
- Check file permissions in uploads directory
- Verify TIFF file format (not corrupted)
- Check file size limits

#### Training doesn't start
- Verify Python dependencies are installed
- Check GPU/CUDA setup if using GPU
- Monitor server console for Python errors

### Debug Mode
Enable detailed logging:

```bash
# Set debug environment
DEBUG=* npm run dev
```

### Memory Issues
For large datasets:

```javascript
// Increase Node.js memory limit
node --max-old-space-size=8192 server.js
```

## Contributing

We welcome contributions! Here's how to get started:

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Style
- **JavaScript**: Use ES6+ features, consistent indentation
- **Python**: Follow PEP 8 guidelines
- **HTML/CSS**: Semantic markup, responsive design

### Testing
```bash
# Run basic tests
npm test

# Test Python components
python -m pytest python/tests/
```

### Areas for Contribution
- Additional neural network architectures
- Enhanced visualization features
- More evaluation metrics
- Bug fixes and optimizations
- Documentation improvements

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **PyTorch Team** - Deep learning framework
- **Three.js Contributors** - 3D visualization library
- **Express.js Community** - Web framework
- **Biomedical Imaging Community** - Inspiration and requirements

## Support

If you encounter issues or have questions:

1. **Check the troubleshooting section** above
2. **Search existing issues** in the repository
3. **Create a new issue** with detailed description
4. **Include system information**: OS, Node.js version, Python version
5. **Provide error logs** and steps to reproduce

---

**Happy segmenting!**