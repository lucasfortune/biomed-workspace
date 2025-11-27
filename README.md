# Biomedical Image Processing Workspace

A modular web-based platform for biomedical image processing with machine learning pipelines, featuring U-Net segmentation, real-time training, and interactive 3D visualization.

![Node.js](https://img.shields.io/badge/Node.js-v18+-blue) ![Python](https://img.shields.io/badge/Python-3.8+-blue) ![Three.js](https://img.shields.io/badge/Three.js-r128-orange)

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18 or higher
- Python 3.8 or higher
- 8GB RAM minimum (16GB recommended for training)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/lucasfortune/viz_app.git
cd viz_app

# 2. Install Node.js dependencies
npm install

# 3. Install Python dependencies
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 4. Start the application
npm start

# 5. Open browser
# Navigate to http://localhost:3000
```

### First Time Setup

1. **Create admin user** (required for first login):
```bash
node manageUsers.js add-admin <username> <password> <fullName> <email> <institution>
```

2. **Login** at `http://localhost:3000`
3. **Choose version**:
   - **Workspace** (recommended): New modular interface with IDE-like experience
   - **Classic**: Original linear workflow (stable, fully functional)

---

## 📖 Full Documentation

**→ [Complete Documentation Index](docs/INDEX.md)**

| Topic | Link |
|-------|------|
| 🎯 **Getting Started Guide** | [docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md) |
| 🏗️ **Architecture Overview** | [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md) |
| 📋 **API Reference** | [docs/reference/API_ENDPOINTS.md](docs/reference/API_ENDPOINTS.md) |
| 🔧 **Module Creation** | [docs/guides/MODULE_CREATION.md](docs/guides/MODULE_CREATION.md) |
| 🚀 **Deployment Guide** | [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md) |
| 🐛 **Troubleshooting** | [docs/guides/TROUBLESHOOTING.md](docs/guides/TROUBLESHOOTING.md) |
| 🗺️ **Roadmap** | [docs/vision/ROADMAP.md](docs/vision/ROADMAP.md) |

---

## ✨ Features

### Workspace Version (Phase 2 Complete)
- **Modular Architecture**: IDE-like interface with pluggable processing modules
- **Segmentation Module**: Complete U-Net pipeline (upload, train, inference, visualize)
- **State Management**: Centralized state with event-driven updates
- **Real-time Progress**: Socket.IO integration for training/inference tracking
- **3D Visualization**: Interactive Three.js viewer with per-class controls

### Classic Version (Stable)
- Complete ML pipeline in linear workflow
- Training and inference with real-time charts
- Model import/export
- Session-based isolation

### Common Features
- Session-based authentication with admin approval workflow
- Test data included for quick evaluation
- Multi-user support with isolated workspaces
- TIFF stack processing (8-bit and 16-bit)
- Model management (save, download, import)

---

## 🏃 Quick Usage

### Workspace Version
1. **Launch Segmentation Module** from welcome hub
2. **Upload Data**: Raw images + annotations (or use test data)
3. **Configure Training**: Set patch size, learning rate, epochs
4. **Train Model**: Monitor real-time progress with charts
5. **Run Inference**: Segment new data
6. **Visualize**: Interactive 3D view with class controls

### Classic Version
- Traditional 5-step linear workflow
- Same capabilities, different UI

---

## 🔧 Common Commands

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Custom port
PORT=3001 npm start

# User management
node manageUsers.js list                    # List all users
node manageUsers.js approve <username>      # Approve pending user
node manageUsers.js reset-password <user> <pass>
```

---

## 📂 Project Structure

```
/viz_app/
├── /public/
│   ├── /classic/         # Original app (stable)
│   └── /workspace/       # New modular app (Phase 2 complete)
├── /python/              # ML processing scripts
├── /docs/                # Comprehensive documentation
├── server.js             # Express backend
├── CLAUDE.md             # AI assistant guide
└── README.md             # This file
```

---

## 🆘 Troubleshooting

**Port already in use:**
```bash
PORT=3001 npm start
```

**CUDA out of memory:**
- Reduce batch size or patch size in training configuration

**File upload fails:**
- Check file size limit (default: 200MB)
- Verify TIFF format compatibility

**For more help:** See [Troubleshooting Guide](docs/guides/TROUBLESHOOTING.md)

---

## 📊 Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Foundation & architecture setup |
| Phase 2 | ✅ Complete | Module system & segmentation integration |
| Phase 3 | 📋 Planned | File browser & workspace management |
| Phase 4 | 📋 Planned | Denoising module |
| Phase 5 | 📋 Planned | Annotation tool |

See [Roadmap](docs/vision/ROADMAP.md) for detailed plan.

---

## 🤝 Contributing

See [CLAUDE.md](CLAUDE.md) for development guidelines and architecture information.

---

## 📄 License

MIT License

---

## 🔗 Links

- **Documentation**: [docs/INDEX.md](docs/INDEX.md)
- **Architecture**: [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md)
- **Session Logs**: [docs/sessions/INDEX.md](docs/sessions/INDEX.md)
- **GitHub**: https://github.com/lucasfortune/viz_app

---

**Last Updated:** 2025-11-27 | **Current Version:** Phase 2 Complete
