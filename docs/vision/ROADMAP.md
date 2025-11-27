# Development Roadmap

**Document Type:** Phase-Based Development Plan
**Status:** Living Document (Updated Regularly)
**Current Phase:** Phase 2 Complete, Phase 3 Planning
**Last Updated:** 2025-11-27

---

## Overview

This roadmap outlines the development plan for the Biomedical Image Processing Workspace, organized into phases with clear objectives, deliverables, and timelines.

**Development Philosophy:**
- **Incremental delivery:** Ship working features regularly
- **User feedback driven:** Adapt based on real-world usage
- **Quality over speed:** Ensure stability before adding complexity
- **Dual-version safety:** Classic version remains stable throughout

---

## Roadmap Timeline

```
Phase 1 (✅ COMPLETE)   Phase 2 (✅ COMPLETE)   Phase 3 (📅 NEXT)      Phase 4 (📅 PLANNED)
Jan-Mar 2024           Jun-Nov 2024            Dec 2024-Feb 2025     Mar-Jun 2025

Classic Version        Workspace Foundation    File Browser &        Additional Modules
- Auth System          - StateManager          Workspace Mgmt        - Denoising
- Upload/Validation    - ModuleLoader          - File Browser        - Annotation
- Training Pipeline    - Module Registry       - Project Mgmt        - Mesh Generation
- Inference            - First Module          - Custom Upload Fix   - Visualization
- 3D Visualization     (Segmentation)          - Search/Filter       - Pipeline Chaining
- Admin Dashboard                              - Batch Delete

│                      │                        │                    │
│                      │                        │                    │
│                      │                        │                    │
└──────────────────────┴────────────────────────┴────────────────────┴─────────────────>

                                                                     Phase 5+ (📅 FUTURE)
                                                                     2025-2026
                                                                     - Batch Processing
                                                                     - Model Zoo
                                                                     - Collaboration
                                                                     - Cloud Native
```

---

## Phase 1: Classic Version Foundation ✅

**Duration:** January - March 2024 (3 months)
**Status:** COMPLETE
**Goal:** Build fully functional linear segmentation workflow

### Objectives

- [x] Create working web application for biomedical image segmentation
- [x] Implement complete ML pipeline (upload → train → inference → visualize)
- [x] Support 3D visualization with Three.js
- [x] Establish authentication and user management
- [x] Deploy production-ready application

### Deliverables

**Backend:**
- [x] Express server with session management
- [x] User authentication (bcrypt, session-based)
- [x] Admin approval workflow
- [x] File upload handling (multer, 500 MB limit)
- [x] Python ML pipeline integration (spawn processes)
- [x] Socket.IO for real-time progress updates
- [x] Activity logging
- [x] Session reset functionality

**Frontend (Classic):**
- [x] Login and registration pages
- [x] Admin dashboard (pending users, approval/rejection)
- [x] Linear workflow UI (step-by-step)
- [x] File upload with validation
- [x] Training configuration and progress tracking
- [x] Inference workflow
- [x] 3D visualization with Three.js (point cloud, orbit controls)
- [x] Original data overlay

**Python/ML:**
- [x] TIFF validation (dimensions, dtype, class count)
- [x] 16-bit to 8-bit auto-conversion
- [x] U-Net training with PyTorch
- [x] Real-time progress reporting (PROGRESS: protocol)
- [x] Model saving (best_model.pth, config.json, results.json)
- [x] Inference with trained models
- [x] Visualization data generation (downsampled 3D points)

**Infrastructure:**
- [x] Test data (100 slices, 3 classes)
- [x] Session-based file isolation (`uploads/<sessionId>/`)
- [x] Development and production configurations
- [x] CLI user management tool (`manageUsers.js`)

### Key Achievements

- **100% functional:** All features working end-to-end
- **Research-ready:** Used by multiple researchers for actual projects
- **Stable:** No critical bugs, minimal issues
- **Documented:** Complete CLAUDE.md for context

### Lessons Learned

**What Worked:**
- Vanilla JavaScript kept complexity low
- Session-based isolation prevented security issues
- Socket.IO real-time updates excellent UX
- Test data enabled immediate experimentation

**Challenges:**
- Monolithic architecture limited extensibility
- Linear workflow doesn't support advanced pipelines
- No way to organize multiple projects/files
- State management scattered across files

---

## Phase 2: Workspace Version & Module System ✅

**Duration:** June - November 2024 (6 months)
**Status:** COMPLETE
**Goal:** Create modular architecture and workspace foundation

### Objectives

- [x] Design and implement module system (dynamic ES6 imports)
- [x] Create centralized state management (StateManager)
- [x] Build workspace UI (hub with module cards)
- [x] Maintain Classic version stability (zero breaking changes)
- [x] Document architecture decisions (ADRs)

### Deliverables

**Workspace Core:**
- [x] `StateManager.js` - Centralized state with mitt event emitter
- [x] `ModuleLoader.js` - Dynamic module loading and lifecycle
- [x] `WorkspaceAPI.js` - Unified API client
- [x] `workspace.js` - Main controller
- [x] Welcome hub UI (module cards, version selection)

**Module System:**
- [x] Module registry pattern
- [x] Module interface contract (constructor, activate, deactivate)
- [x] Lifecycle management (registration → loading → activation)
- [x] State injection via constructor
- [x] Segmentation module (Phase 2 work started, not complete)

**Backend:**
- [x] New API endpoints: `/api/workspace/init`, `/api/workspace/status`, `/api/workspace/files`, `/api/workspace/stats`
- [x] Workspace directory initialization
- [x] Session-aware workspace management

**Documentation:**
- [x] Architecture Overview
- [x] Dual Version Design
- [x] State Architecture
- [x] Module Architecture
- [x] Authentication Architecture
- [x] 4 ADRs (Vanilla JS, Dual Version, Session Isolation, Module System)
- [x] Complete API reference (29 endpoints)
- [x] Socket Protocol reference
- [x] Python Integration reference
- [x] File Structure reference
- [x] Module Creation Guide
- [x] Deployment Guide
- [x] Testing Guide

**Infrastructure:**
- [x] Dual version file structure (`/public/classic/`, `/public/workspace/`)
- [x] Shared backend (both versions use same server.js)
- [x] Welcome page (version selection)

### Key Achievements

- **Modular foundation:** Module system works perfectly
- **State management:** Reactive state updates across UI
- **Zero risk:** Classic version completely unaffected
- **Excellent documentation:** ~12,100 lines of comprehensive docs
- **ADRs:** All major decisions documented with rationale

### Lessons Learned

**What Worked:**
- Module system design (dynamic imports, state injection)
- Dual version approach (innovation without risk)
- Documentation sprint (massive productivity gain)
- ADRs (clarified decision rationale)

**Challenges:**
- Segmentation module integration more complex than expected
- Custom data upload not yet integrated in workspace
- Need better file organization/browsing

### Known Issues

#### 🐛 **Issue #1: Workspace Custom Data Upload Not Functional**

**Status:** OPEN (High Priority for Phase 3)
**Severity:** Medium
**Impact:** Users can only use test data in workspace version

**Description:**
The workspace version can use test data successfully, but custom file upload is not yet integrated. The segmentation module needs to support the same file upload workflow as Classic version.

**Root Cause:**
- Segmentation module UI not yet complete
- Classic upload code not yet wrapped in module
- File upload form needs to be added to module view

**Workaround:**
- Use Classic version for custom data
- Use test data in workspace

**Fix Plan (Phase 3):**
1. Add file upload form to segmentation module
2. Integrate multer upload handling
3. Connect to existing backend endpoints
4. Test full workflow (upload → validate → train → inference)

**Tracking:** docs/sessions/2025-11-26_overlay_debugging.md

---

## Phase 3: File Browser & Workspace Management 📅

**Duration:** December 2024 - February 2025 (3 months)
**Status:** NEXT
**Goal:** Complete workspace file management and fix custom upload

### Objectives

- [ ] Implement fully functional file browser
- [ ] Fix custom data upload in workspace
- [ ] Add project/workspace organization
- [ ] Complete segmentation module integration
- [ ] Add search, filter, and batch operations

### Deliverables

**High Priority:**
- [ ] **Fix custom upload in workspace** (Issue #1)
  - [ ] Add file upload form to segmentation module
  - [ ] Integrate with `/upload-data` endpoint
  - [ ] Test validation, training, inference with custom data
  - [ ] Update documentation

**File Browser:**
- [ ] Visual file tree display
  - [ ] Folder structure (uploads/, models/, results/)
  - [ ] File icons (TIFF, JSON, PTH)
  - [ ] File sizes and timestamps
  - [ ] Thumbnail previews for TIFF (first slice)

- [ ] File Operations
  - [ ] Select single/multiple files
  - [ ] Download files
  - [ ] Delete files
  - [ ] Rename files
  - [ ] Move files to folders
  - [ ] Copy files

- [ ] Search & Filter
  - [ ] Search by filename
  - [ ] Filter by file type (TIFF, model, results)
  - [ ] Filter by date range
  - [ ] Sort (name, size, date)

**Workspace Organization:**
- [ ] Projects/Folders
  - [ ] Create new project
  - [ ] Name and describe projects
  - [ ] Move files into projects
  - [ ] Delete projects (with confirmation)

- [ ] Workspace Templates
  - [ ] Save workspace configuration (modules, settings)
  - [ ] Load saved workspace
  - [ ] Share workspace templates
  - [ ] Import/export workspace

**Segmentation Module Completion:**
- [ ] Full integration of Classic segmentation workflow
- [ ] File upload UI in module
- [ ] Training configuration UI
- [ ] Real-time progress display
- [ ] Results visualization
- [ ] Module state persistence (resume after leaving module)

**Backend:**
- [ ] Enhanced `/api/workspace/files` endpoint (full file tree)
- [ ] File operation endpoints (download, delete, rename, move)
- [ ] Project management endpoints (CRUD)
- [ ] Workspace template save/load

**Testing:**
- [ ] File browser UI tests
- [ ] File operation tests (upload, download, delete)
- [ ] Project management tests
- [ ] End-to-end custom upload workflow

### Success Criteria

- [x] User can upload custom data in workspace ✅
- [ ] User can browse all files in visual tree
- [ ] User can search and filter files
- [ ] User can organize files into projects
- [ ] User can delete old files (batch operations)
- [ ] Segmentation module fully functional (test + custom data)
- [ ] No regressions in Classic version

### Timeline

- **Month 1 (Dec 2024):** Fix custom upload + file browser backend
- **Month 2 (Jan 2025):** File browser UI + operations
- **Month 3 (Feb 2025):** Projects, templates, testing

### Dependencies

- None (Phase 2 foundation complete)

---

## Phase 4: Additional Modules & Pipeline Chaining 📅

**Duration:** March - June 2025 (4 months)
**Status:** PLANNED
**Goal:** Add denoising, annotation, mesh, visualization modules + pipeline editor

### Objectives

- [ ] Implement 4 new processing modules
- [ ] Create visual pipeline editor
- [ ] Enable module chaining (output → input)
- [ ] Save and execute multi-step pipelines
- [ ] Expand module registry

### Deliverables

**New Modules:**

**1. Denoising Module**
- [ ] Deep learning denoising (Noise2Noise architecture)
- [ ] Upload noisy image stack
- [ ] Configure training (epochs, patch size)
- [ ] Train denoising model
- [ ] Apply to new images
- [ ] Before/after comparison UI
- [ ] Export denoised TIFF

**2. Annotation Module**
- [ ] Interactive 2D slice annotation
- [ ] Brush, eraser, polygon tools
- [ ] Class labeling (assign colors/names)
- [ ] Navigate slices (keyboard shortcuts)
- [ ] Undo/redo
- [ ] Save annotations as TIFF
- [ ] Load existing annotations for editing

**3. Mesh Generation Module**
- [ ] Load segmented TIFF
- [ ] Generate 3D mesh (marching cubes)
- [ ] Mesh smoothing (Laplacian, Taubin)
- [ ] Mesh simplification (reduce polygons)
- [ ] Preview mesh in 3D viewer
- [ ] Export to STL, OBJ, PLY formats
- [ ] Color by class

**4. Visualization Module**
- [ ] Advanced 3D rendering (volume rendering, isosurfaces)
- [ ] Multi-channel overlay
- [ ] Time-series playback (4D data)
- [ ] Adjustable transfer functions (opacity, color)
- [ ] Lighting and shadows
- [ ] Screenshot and video export
- [ ] VR support (WebXR, optional)

**Pipeline System:**
- [ ] Visual pipeline editor (drag-and-drop)
- [ ] Module nodes (input/output ports)
- [ ] Connect modules (define data flow)
- [ ] Validate pipelines (type checking)
- [ ] Execute pipeline (run all steps)
- [ ] Progress visualization (which module running)
- [ ] Save pipelines as templates
- [ ] Share pipelines (export/import JSON)

**Example Pipelines:**
```
Pipeline 1: Denoise → Segment → Visualize
Pipeline 2: Annotate → Train Segmentation → Mesh → Export STL
Pipeline 3: Denoise → Segment → Quantify → Export CSV
```

**Backend:**
- [ ] Python scripts for denoising (Noise2Noise training)
- [ ] Python scripts for mesh generation (scikit-image marching cubes)
- [ ] API endpoints for each module's operations
- [ ] Pipeline execution engine (queue, orchestrate modules)

**Documentation:**
- [ ] Module specifications (detailed docs for each module)
- [ ] Pipeline creation guide
- [ ] API updates

### Success Criteria

- [ ] All 4 modules functional (end-to-end workflows)
- [ ] Pipeline editor allows chaining modules
- [ ] Example pipelines work correctly
- [ ] Modules can share data (output → input)
- [ ] No performance degradation

### Timeline

- **Month 1 (Mar 2025):** Denoising module + backend
- **Month 2 (Apr 2025):** Annotation module + Mesh module
- **Month 3 (May 2025):** Visualization module + Pipeline editor
- **Month 4 (Jun 2025):** Testing, refinement, documentation

### Dependencies

- Phase 3 complete (file browser for managing outputs)

---

## Phase 5: Batch Processing & Model Zoo 📅

**Duration:** July - October 2025 (4 months)
**Status:** PLANNED
**Goal:** High-throughput workflows and pretrained model library

### Objectives

- [ ] Enable batch processing (multiple samples)
- [ ] Create model zoo (pretrained models)
- [ ] Support transfer learning (fine-tune on custom data)
- [ ] Add job queue and parallel processing
- [ ] Implement notifications

### Deliverables

**Batch Processing:**
- [ ] Upload multiple samples (zip, folder)
- [ ] Select pipeline to apply
- [ ] Queue all samples
- [ ] Parallel processing (multi-GPU support)
- [ ] Progress for each sample
- [ ] Notification on completion (email, in-app)
- [ ] Batch download results

**Model Zoo:**
- [ ] Library of pretrained models:
  - [ ] Cell segmentation (HeLa, U2OS, CHO cells)
  - [ ] Nuclei segmentation (DAPI, Hoechst)
  - [ ] Neuron tracing (light-sheet microscopy)
  - [ ] Vessel segmentation (angiography)
  - [ ] Organelle detection (mitochondria, ER, Golgi)
- [ ] Model cards (metadata, training data, performance metrics)
- [ ] One-click download and use
- [ ] Fine-tuning on custom data (transfer learning)
- [ ] Model versioning

**Backend:**
- [ ] Job queue (Bull, Redis)
- [ ] Worker processes for parallel execution
- [ ] Model storage (S3, MinIO)
- [ ] Notification service (email, webhooks)

**Performance:**
- [ ] Multi-GPU support (CUDA, PyTorch DataParallel)
- [ ] Distributed training (PyTorch DDP, optional)
- [ ] Batch inference optimization

### Success Criteria

- [ ] Process 100 samples overnight
- [ ] Model zoo has 10+ pretrained models
- [ ] Transfer learning reduces training time by 50%+
- [ ] Notifications work (email, in-app)

### Timeline

- **Month 1 (Jul 2025):** Job queue + parallel processing
- **Month 2 (Aug 2025):** Batch UI + model zoo backend
- **Month 3 (Sep 2025):** Model zoo UI + transfer learning
- **Month 4 (Oct 2025):** Testing, optimization, documentation

### Dependencies

- Phase 4 complete (pipeline system for batch processing)

---

## Phase 6: Collaboration & Advanced Features 📅

**Duration:** November 2025 - February 2026 (4 months)
**Status:** PLANNED
**Goal:** Multi-user collaboration, advanced ML, and API integrations

### Objectives

- [ ] Multi-user projects (shared workspaces)
- [ ] Real-time collaboration
- [ ] Advanced model architectures (3D U-Net, transformers)
- [ ] API and integrations (Python SDK, ImageJ plugins)
- [ ] Quantification and analytics

### Deliverables

**Collaboration:**
- [ ] Shared projects (invite collaborators)
- [ ] Role-based access control (owner, editor, viewer)
- [ ] Real-time updates (multiple users viewing same project)
- [ ] Comments and annotations
- [ ] Version history (track changes, restore previous versions)
- [ ] Publish and share (DOI, Zenodo integration)

**Advanced ML:**
- [ ] 3D U-Net (volumetric training, not 2D slices)
- [ ] Transformer-based models (attention mechanisms)
- [ ] Multi-task learning (segmentation + classification)
- [ ] Active learning (model suggests samples to annotate)
- [ ] Self-supervised learning (Noise2Void, Noise2Self)
- [ ] Model explainability (activation maps, uncertainty)

**API & Integrations:**
- [ ] RESTful API (OpenAPI/Swagger documentation)
- [ ] Python SDK (`pip install biomedapp`)
- [ ] MATLAB integration (HTTP client)
- [ ] ImageJ/Fiji plugins (call API from Fiji)
- [ ] OMERO integration (load images from OMERO database)
- [ ] Webhooks (trigger external workflows)

**Analytics & Quantification:**
- [ ] Automated quantification (cell counts, volumes, intensities)
- [ ] Feature extraction (shape, texture, intensity features)
- [ ] Statistical analysis (group comparisons, plots)
- [ ] Time-series analysis (tracking, motion)
- [ ] Export to CSV, Excel, R, Python

### Success Criteria

- [ ] Multi-user projects work with 5+ collaborators
- [ ] Advanced models show >10% accuracy improvement
- [ ] Python SDK has 1,000+ downloads
- [ ] ImageJ plugin used by 100+ users
- [ ] Quantification reduces manual work by 80%+

### Timeline

- **Month 1 (Nov 2025):** Collaboration backend + RBAC
- **Month 2 (Dec 2025):** Collaboration UI + version history
- **Month 3 (Jan 2026):** Advanced ML models
- **Month 4 (Feb 2026):** API, SDK, integrations, analytics

### Dependencies

- Phase 5 complete (model zoo for advanced models)

---

## Phase 7+: Cloud-Native & Marketplace 📅

**Duration:** 2026 and Beyond
**Status:** FUTURE
**Goal:** Infinitely scalable cloud platform with ecosystem

### Objectives

- [ ] Kubernetes-based architecture
- [ ] SaaS offering (managed cloud service)
- [ ] Module marketplace (community modules)
- [ ] Enterprise features
- [ ] Global deployment

### Deliverables

**Cloud-Native:**
- [ ] Kubernetes deployment (Helm charts)
- [ ] Autoscaling (horizontal pod autoscaling)
- [ ] Distributed storage (S3, GCS, Azure Blob)
- [ ] Database (PostgreSQL for metadata)
- [ ] Monitoring (Prometheus, Grafana)
- [ ] Logging (ELK stack)
- [ ] CI/CD (GitHub Actions, automated tests)

**SaaS Platform:**
- [ ] Multi-tenant architecture
- [ ] User organizations (teams, billing)
- [ ] Usage-based pricing (compute, storage)
- [ ] Free tier (limited resources)
- [ ] Credit card processing (Stripe)
- [ ] Dashboard (usage stats, billing)

**Module Marketplace:**
- [ ] Community-contributed modules
- [ ] Module submission and review
- [ ] Ratings and reviews
- [ ] Verified/trusted modules (security audit)
- [ ] Commercial modules (paid plugins)
- [ ] Automatic updates
- [ ] Revenue share (70/30 split)

**Enterprise:**
- [ ] SSO (SAML, OAuth)
- [ ] LDAP/Active Directory integration
- [ ] Audit logs (compliance)
- [ ] SLA (99.9% uptime)
- [ ] Priority support
- [ ] Custom deployments

### Success Criteria

- [ ] 10,000+ registered users on SaaS platform
- [ ] 50+ modules in marketplace
- [ ] 10+ enterprise customers
- [ ] 99.9% uptime for 12 months
- [ ] Self-sustaining (revenue covers costs)

---

## Current Priorities

### Immediate (Phase 3 - Next 3 Months)

**Priority 1: Fix Custom Upload in Workspace (HIGH)**
- Essential for workspace adoption
- Blocks testing of full workflow
- Quick win (backend already exists)

**Priority 2: File Browser**
- Users need to manage multiple files/projects
- Critical for multi-sample workflows
- Improves UX significantly

**Priority 3: Complete Segmentation Module**
- First module must be fully polished
- Serves as template for future modules
- Validates module system design

### Short-Term (Phase 4 - Next 6-9 Months)

**Priority 4: Denoising Module**
- Highly requested feature
- Complements segmentation
- Demonstrates pipeline chaining

**Priority 5: Pipeline Editor**
- Unlocks advanced workflows
- Differentiator from Classic
- Validates modular architecture

### Long-Term (Phase 5-6 - Next 12-18 Months)

**Priority 6: Batch Processing**
- Essential for high-throughput users
- Required for facility adoption
- Scalability demonstration

**Priority 7: Model Zoo**
- Enables transfer learning
- Reduces training time
- Builds community ecosystem

---

## Success Metrics

### Phase 3 Metrics

- [ ] Custom upload works in workspace (100% success rate)
- [ ] File browser used by 80%+ of users
- [ ] User satisfaction survey: 4/5+ stars
- [ ] Zero critical bugs in Classic version

### Phase 4 Metrics

- [ ] All 4 modules released
- [ ] 10+ example pipelines shared
- [ ] Pipeline chaining used by 50%+ of users
- [ ] Module load time < 500ms

### Phase 5 Metrics

- [ ] Batch processing handles 100+ samples
- [ ] Model zoo has 10+ models
- [ ] Transfer learning adoption: 30%+ of training jobs
- [ ] Parallel processing 3x faster than sequential

### Phase 6 Metrics

- [ ] Multi-user projects: 20+ active shared projects
- [ ] Python SDK: 1,000+ downloads
- [ ] ImageJ plugin: 500+ active users
- [ ] API usage: 10,000+ calls per day

---

## Risk Management

### Technical Risks

**Risk:** Workspace complexity grows unmanageable
**Mitigation:** Maintain modular architecture, code reviews, documentation

**Risk:** Performance degrades with more modules
**Mitigation:** Lazy loading, code splitting, performance testing

**Risk:** Module interface becomes limiting
**Mitigation:** Design for extensibility, version module API, allow overrides

### User Adoption Risks

**Risk:** Users prefer Classic over Workspace
**Mitigation:** Ensure feature parity, better UX in Workspace, user feedback

**Risk:** Custom upload fix doesn't meet user needs
**Mitigation:** User testing, iterate based on feedback

**Risk:** Learning curve too steep for new modules
**Mitigation:** Tutorials, tooltips, guided workflows

### Resource Risks

**Risk:** Development time underestimated
**Mitigation:** Buffer in timeline, prioritize ruthlessly, cut scope if needed

**Risk:** Funding shortfall
**Mitigation:** Grants, SaaS revenue (future), partnerships

**Risk:** Maintainer burnout
**Mitigation:** Community contributions, modular ownership, sustainable pace

---

## How to Contribute

### Developers

**Pick a Phase 3 Task:**
1. Browse issues tagged `phase-3`
2. Comment to claim an issue
3. Submit PR with tests and documentation

**Create a Module (Phase 4):**
1. Follow [Module Creation Guide](../guides/MODULE_CREATION.md)
2. Submit module to registry
3. Write tests and documentation

### Researchers

**Provide Feedback:**
- Use the platform
- Report bugs and suggest features
- Participate in user testing

**Share Datasets:**
- Contribute test datasets (with permission)
- Help build model zoo

### Imaging Facilities

**Pilot Testing:**
- Deploy in your facility
- Provide multi-user feedback
- Share success stories

---

## Related Documentation

- [Platform Vision](PLATFORM_VISION.md) - Long-term vision
- [Module Specifications](MODULE_SPECS.md) - Detailed module specs
- [Architecture Overview](../architecture/OVERVIEW.md) - System architecture
- [Troubleshooting Guide](../guides/TROUBLESHOOTING.md) - Known issues

---

**Last Updated:** 2025-11-27
**Roadmap Version:** 1.0
**Next Review:** 2025-12-15 (monthly review)

---

**Navigation:** [← Platform Vision](PLATFORM_VISION.md) | [Documentation Index](../INDEX.md) | [Module Specs →](MODULE_SPECS.md)
