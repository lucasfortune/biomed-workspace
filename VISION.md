# Biomedical Image Processing Workspace - Platform Summary

## Project Overview

### Vision
Transform the current linear biomedical segmentation pipeline into a comprehensive, modular **IDE-like workspace for biomedical image processing**. The platform will serve as an all-in-one solution for researchers to process electron tomography images through various algorithms, from raw data to simulation-ready meshes.

### Current State (Starting Point)
- **Architecture**: Linear 5-step wizard (Upload → Configure → Train → Inference → Visualize)
- **Technology**: Node.js/Express backend, vanilla JavaScript frontend, Socket.io, Three.js visualization
- **Functionality**: U-Net segmentation training and inference with 3D visualization
- **Code Structure**: Modular ES6 JavaScript, separate Python scripts for ML operations
- **Session Management**: Temporary session-based file storage

### Target State (Platform Vision)
- **Architecture**: Hub-and-spoke modular system with persistent workspace
- **Interface**: IDE-style with collapsible sidebar, file browser, and module launcher
- **Functionality**: Multiple processing modules (denoising, segmentation, annotation, mesh generation)
- **Workflow**: Flexible, allowing users to chain processes in any order
- **File Management**: Persistent workspace with organized file structure

---

## Technical Architecture

### Technology Stack

#### Frontend (Staying with Enhanced Vanilla JS)
```javascript
{
  "core": "Vanilla JavaScript with ES6 modules",
  "helpers": {
    "mitt": "Event system (200 bytes)",
    "split.js": "Resizable panels",
    "inspire-tree": "File tree component",
    "cash-dom": "jQuery-like DOM helpers (10KB)",
    "sortablejs": "Drag-and-drop",
    "navigo": "Client-side routing"
  },
  "visualization": "Three.js for 3D rendering",
  "charts": "Chart.js for training metrics"
}
```

#### Backend
- **Server**: Node.js with Express
- **Real-time Communication**: Socket.io for progress updates
- **File Handling**: Multer for uploads, Archiver for downloads
- **Session Management**: express-session with UUID
- **Python Integration**: Child process spawn for ML operations

#### Python Processing
- **Segmentation**: PyTorch U-Net implementation
- **Denoising**: Custom deep learning algorithm (to be integrated)
- **Image Processing**: tifffile, numpy, PIL
- **Model Management**: Save/load PyTorch models (.pth files)

### File System Structure
```
/workspaces/
├── {sessionId}/
│   ├── uploads/
│   │   ├── raw_images/        # Original TIFF stacks
│   │   ├── annotations/       # Manual annotations
│   │   └── processed/         # Denoised images
│   ├── models/
│   │   ├── segmentation/      # Trained U-Net models
│   │   └── denoising/         # Denoising models
│   ├── results/
│   │   ├── segmented/         # Segmentation outputs
│   │   ├── denoised/          # Denoising outputs
│   │   └── meshes/            # Generated 3D meshes
│   └── metadata.json          # Workspace configuration
```

---

## Module Specifications

### 1. Segmentation Module
**Purpose**: Train and run U-Net neural networks for biomedical image segmentation  
**Status**: Existing functionality to be wrapped  

**Features**:
- Upload TIFF stacks (raw images + annotations)
- Configure U-Net architecture (layers, features, parameters)
- Real-time training monitoring with loss/dice charts
- Model saving and import functionality
- Batch inference on new data
- WebSocket progress updates

**Technical Details**:
- Python script: `train_model.py`, `run_inference.py`
- Supports multi-class segmentation (up to 255 classes)
- Patch-based training for large images
- Data augmentation options

### 2. Denoising Module
**Purpose**: Apply deep learning denoising to electron microscopy images  
**Status**: New module to be integrated  

**Features**:
- Pre-trained and custom model support
- Adjustable noise reduction levels
- Batch processing of TIFF stacks
- Before/after comparison view
- Progress tracking via Socket.io

**Technical Details**:
- Python script: `denoise_model.py` (to be created)
- Preserves image dimensions and bit depth
- GPU-accelerated processing when available

### 3. Annotation Module
**Purpose**: Simple in-platform annotation tool for creating training data  
**Status**: New, minimal implementation  

**Features**:
- Basic brush and eraser tools
- Multi-class support (up to 4 classes)
- Slice-by-slice navigation
- Export as TIFF stack
- Touch support for tablets

**Limitations** (intentional, to keep scope minimal):
- No 3D interpolation
- No magic wand/automated selection
- No advanced brush dynamics
- Basic flood fill only

**Technical Details**:
- Pure Canvas API implementation
- ~500 lines of code maximum
- Saves annotations as RGBA layers

### 4. Mesh Generation Module
**Purpose**: Convert segmentations to 3D surface meshes for simulation  
**Status**: Extract from current visualizer  

**Features**:
- Multiple export formats (OBJ, STL, PLY, glTF)
- Mesh decimation and smoothing
- Per-class mesh generation
- 3D preview before export
- Optimization parameters

**Technical Details**:
- Leverages existing Three.js mesh creation
- Marching cubes algorithm for surface extraction
- Supports multi-class segmentations

### 5. 3D Visualization Component
**Purpose**: View and interact with segmentation results  
**Status**: Existing, to be made embeddable  

**Features**:
- Multi-class rendering with individual controls
- Opacity and visibility per class
- Three-axis slicing (X, Y, Z)
- Camera controls (rotate, pan, zoom)
- Screenshot export

**Technical Details**:
- Three.js based implementation
- Modular architecture with separate files for scene, mesh, controls
- Efficient memory management for large datasets

---

## User Interface Design

### Layout Structure
```
┌─────────────────────────────────────────────────┐
│                    Header                       │
├──────┬──────────────────────────────────────────┤
│      │                                          │
│  S   │                                          │
│  i   │         Main Content Area                │
│  d   │                                          │
│  e   │    (Welcome Hub / Active Module)         │
│  b   │                                          │
│  a   │                                          │
│  r   │                                          │
│      │                                          │
└──────┴──────────────────────────────────────────┘
```

### Sidebar Components
1. **File Browser**: Tree view of workspace files
2. **Upload Zone**: Drag-and-drop area
3. **Session Info**: Current processing status
4. **Quick Actions**: Common operations

### Welcome Hub
- Module cards with descriptions
- Visual workflow indicators
- Resource links (documentation, GitHub, publications)
- Recent files quick access

---

## State Management Pattern

### Architecture
```javascript
// Centralized state management without framework
class AppState {
  constructor() {
    this.state = {
      workspace: {
        sessionId: null,
        files: [],
        activeModule: null
      },
      modules: {
        segmentation: { /* module state */ },
        denoising: { /* module state */ },
        annotation: { /* module state */ },
        mesh: { /* module state */ }
      }
    };
    this.events = mitt(); // Event emitter
  }
  
  update(path, value) {
    // Nested state updates with event emission
  }
  
  subscribe(path, callback) {
    // Selective state subscriptions
  }
}
```

### Data Flow
1. User actions → Module methods
2. Module methods → State updates
3. State updates → Event emission
4. Event listeners → UI updates

---

## API Endpoints

### Workspace Management
- `GET /api/workspace/files` - Get file tree structure
- `POST /api/workspace/upload` - Upload files to workspace
- `GET /api/workspace/download/:fileId` - Download files
- `DELETE /api/workspace/file/:fileId` - Delete files

### Processing Modules
- `POST /api/segmentation/train` - Start training
- `POST /api/segmentation/inference` - Run inference
- `POST /api/denoising/start` - Start denoising
- `POST /api/annotation/export` - Export annotations
- `POST /api/mesh/generate` - Generate mesh

### Real-time Events (Socket.io)
- `training-progress-{id}` - Training updates
- `inference-progress-{id}` - Inference updates
- `denoising-progress-{id}` - Denoising updates

---

## Key Design Decisions

### 1. Vanilla JS vs Framework
**Decision**: Stay with vanilla JavaScript  
**Rationale**: 
- Developer already familiar with current codebase
- Avoids 2-3 week learning curve
- Existing code remains relevant
- Simpler debugging and deployment

**Mitigation**: Use lightweight helper libraries and good patterns

### 2. Module Architecture
**Decision**: Hub-and-spoke with independent modules  
**Rationale**:
- Modules can be developed independently
- Easy to add new processing types
- Clear separation of concerns
- Allows incremental development

### 3. File Management
**Decision**: Persistent session-based workspace  
**Rationale**:
- Users can leave and return to work
- Clear organization of inputs/outputs
- Enables workflow chaining
- Familiar IDE-like experience

### 4. Annotation Tool Scope
**Decision**: Minimal implementation (1 week effort)  
**Rationale**:
- Not core to platform value
- Professional tools already exist
- Keeps development time reasonable
- Provides basic functionality for simple cases

---

## Implementation Phases

### Phase Overview
1. **Foundation** (2 weeks): Architecture setup, state management
2. **Module System** (2 weeks): Hub interface, segmentation wrapper
3. **File Browser** (3 weeks): Sidebar, persistent workspace
4. **Denoising** (2 weeks): Second processing module
5. **Annotation** (1 week): Basic annotation tool
6. **Mesh Generation** (1 week): Mesh module extraction
7. **Polish** (2 weeks): Shortcuts, help, optimization

**Total Timeline**: 12-16 weeks  
**Stopping Points**: Can deliver value after phases 2, 3, 4, 5, or 6

---

## Critical Implementation Notes

### For Frontend Development
1. **Module Loading**: Use dynamic imports for lazy loading
2. **State Management**: Implement subscription pattern for reactive updates
3. **Event Handling**: Use event delegation for dynamic content
4. **Memory Management**: Clean up Three.js resources and large arrays
5. **Canvas Operations**: Use requestAnimationFrame for smooth drawing

### For Backend Development
1. **File Organization**: Maintain strict workspace structure
2. **Process Management**: Track and clean up Python processes
3. **Socket Rooms**: Use session-based rooms for targeted updates
4. **Error Handling**: Wrap all Python spawns in try-catch
5. **Resource Limits**: Implement file size and processing time limits

### For Python Integration
1. **Progress Communication**: Use "PROGRESS:" prefix for parseability
2. **Error Reporting**: Output JSON for structured error messages
3. **GPU Memory**: Include CUDA memory management
4. **File Formats**: Maintain TIFF compatibility throughout

---

## Migration Strategy

### Parallel Development
1. Current app remains at `/classic`
2. New workspace develops at `/workspace`
3. Users can choose version from welcome page
4. Gradual feature parity achievement
5. Eventually deprecate classic version

### Code Reuse Priority
1. **High Reuse**: Python scripts, Three.js visualization, Socket.io setup
2. **Moderate Reuse**: File handling, validation logic, UI components
3. **New Development**: Module system, file browser, state management

---

## Success Criteria

### Technical Metrics
- Page load time < 3 seconds
- File upload/download reliable up to 500MB
- Processing status updates every 1-2 seconds
- Browser memory usage < 2GB typical
- Support for Chrome, Firefox, Safari, Edge

### User Experience Metrics
- Complete workflow without leaving platform
- Intuitive file organization
- Clear progress indication
- Responsive UI during processing
- Helpful error messages

### Platform Goals
- Reduce workflow interruption
- Enable result comparison
- Support iterative processing
- Maintain research-grade quality
- Provide educational value

---

## Future Enhancements (Post-MVP)

### Near-term (3-6 months)
- Advanced annotation tools
- Batch processing queues
- Workflow templates
- Cloud storage integration
- User preferences persistence

### Long-term (6-12 months)
- Collaborative features
- Plugin architecture
- Advanced mesh processing
- Machine learning model zoo
- Publication-ready exports

---

## Risk Factors & Mitigations

### Technical Risks
1. **Large file handling**: Implement chunked uploads
2. **Browser compatibility**: Progressive enhancement approach
3. **GPU availability**: CPU fallback for all operations
4. **Session persistence**: Auto-save and recovery mechanisms

### User Adoption Risks
1. **Complexity**: Provide guided tutorials
2. **Performance**: Set clear expectations for processing times
3. **Data loss**: Implement auto-save every 5 minutes
4. **Learning curve**: Include sample datasets and workflows

---

## Development Environment Requirements

### Minimum Requirements
- Node.js 18+
- Python 3.8+
- 8GB RAM
- Modern browser
- 10GB free disk space

### Recommended Setup
- Node.js 20+
- Python 3.10+
- 16GB RAM
- CUDA-capable GPU
- 50GB free disk space
- VSCode with extensions:
  - ESLint
  - Python
  - Three.js snippets

---

## Contact & Resources

### Documentation References
- Three.js: https://threejs.org/docs/
- Socket.io: https://socket.io/docs/
- PyTorch: https://pytorch.org/docs/
- TIFF handling: https://github.com/cgohlke/tifffile

### Project Resources
- Current GitHub: [Will be provided]
- Publications: [Will be provided]
- Research Group: Physics of Parasitism, University of Würzburg

---

## Summary for AI Assistants

When working on this project, remember:

1. **Architecture**: Modular, vanilla JS with helper libraries, not a framework
2. **Priority**: Denoising and segmentation are core; annotation is nice-to-have
3. **Approach**: Enhance existing code, don't rewrite from scratch
4. **State**: Use centralized state management with event system
5. **Files**: Maintain strict workspace organization structure
6. **Modules**: Each module is independent and lazy-loaded
7. **Real-time**: Socket.io for all progress updates
8. **Python**: Spawn processes, parse "PROGRESS:" prefixed JSON
9. **UI**: IDE-like with sidebar, hub, and module views
10. **Goal**: Complete biomedical image processing without leaving platform

The platform transforms a linear pipeline into a flexible workspace where researchers can apply various processing steps to their data in any order, with results from one step feeding into the next, all within a familiar IDE-like interface.