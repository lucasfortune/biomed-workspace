# Biomedical Image Segmentation Visualizer

A web-based machine learning pipeline for biomedical image segmentation using U-Net neural networks with interactive 3D visualization.

![Node.js](https://img.shields.io/badge/Node.js-v18+-blue) ![Python](https://img.shields.io/badge/Python-3.8+-blue) ![Three.js](https://img.shields.io/badge/Three.js-r128-orange)

![Segmentation Result](https://github.com/lucasfortune/viz_app/blob/main/src/imgs/segmentation_result_example.png)

## Features

- **Complete ML Pipeline**: Upload TIFF stacks, train U-Net models, run inference, and visualize results
- **Real-time Progress**: Live WebSocket updates during training and inference
- **Interactive 3D Visualization**: Three.js-powered visualization with per-class controls and multi-axis slicing
- **Model Management**: Save, download, and import pre-trained models
- **Session-based**: Isolated user sessions for concurrent usage

## Installation

### Prerequisites
- Node.js v18 or higher
- Python 3.8 or higher
- 8GB RAM minimum (16GB recommended)

### Setup

1. **Clone the Repository**

```bash
git clone https://github.com/lucasfortune/viz_app.git
cd viz_app
```

2. **Install Node.js dependencies**
```bash
npm install
```

3. **Install Python dependencies**
```bash
# Optional: Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install packages
pip install -r requirements.txt
```

4. **Create required directories**
```bash
mkdir uploads models outputs results
```

5. **Start the application**
```bash
npm start
```

6. **Access the application**
```
http://localhost:3000
```

## Usage

### Step 1: Upload Data
- Upload raw TIFF stack (grayscale images)
- Upload annotations TIFF stack (segmentation masks)
- Supported format: TIFF image stacks

### Step 2: Configure Training
- Set patch size, batch size, learning rate, and epochs
- Configure U-Net architecture (features, layers)
- Enable optional data augmentation

### Step 3: Train Model
- Monitor real-time training progress with charts
- View validation metrics (loss, Dice coefficient)
- Download trained model when complete

### Step 4: Run Inference
- Select trained model or import pre-trained model
- Run segmentation on new TIFF data
- Monitor inference progress
- Download segmented results

### Step 5: 3D Visualization
- Interactive 3D view with mouse controls (rotate, zoom, pan)
- Per-class opacity and visibility controls
- Export screenshots or data

## Troubleshooting

**Port already in use:**
```bash
PORT=3001 npm start
```

**CUDA out of memory:**
- Reduce batch size or patch size in training configuration

**File upload fails:**
- Check file size limit (default: 200MB)
- Verify TIFF format compatibility

**For detailed debugging:**
```bash
DEBUG=* npm start
```

## License

MIT License