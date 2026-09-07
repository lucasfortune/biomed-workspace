# Documentation Index

Welcome to the Biomedical Image Processing Workspace documentation! This index will help you find what you need quickly.

---

## 🚀 Quick Links

| I want to... | Go to | Status |
|--------------|-------|--------|
| **Get started quickly** | [Getting Started](guides/GETTING_STARTED.md) | ✅ |
| **Understand system architecture** | [Architecture Overview](architecture/OVERVIEW.md) | ✅ |
| **Look up an API endpoint** | [API Endpoints](reference/API_ENDPOINTS.md) | ✅ |
| **Understand state management** | [State Architecture](architecture/STATE_ARCHITECTURE.md) | ✅ |
| **Understand module system** | [Module Architecture](architecture/MODULE_ARCHITECTURE.md) | ✅ |
| **Understand authentication** | [Authentication](architecture/AUTHENTICATION.md) | ✅ |
| **Understand Socket.IO** | [Socket Protocol](reference/SOCKET_PROTOCOL.md) | ✅ |
| **Work with Python scripts** | [Python Integration](reference/PYTHON_INTEGRATION.md) | ✅ |
| **Find files in codebase** | [File Structure](reference/FILE_STRUCTURE.md) | ✅ |
| **Understand key decisions** | [ADRs](decisions/) | ✅ |
| **Find recent changes** | [Session Logs](sessions/INDEX.md) | ✅ |
| **Troubleshoot an issue** | [Troubleshooting Guide](guides/TROUBLESHOOTING.md) | ✅ |
| **Create a new module** | [Module Creation Guide](guides/MODULE_CREATION.md) | ✅ |
| **Deploy to production** | [Deployment Guide](guides/DEPLOYMENT.md) | ✅ |
| **Test the application** | [Testing Guide](guides/TESTING.md) | ✅ |
| **Understand long-term vision** | [Platform Vision](vision/PLATFORM_VISION.md) | ✅ |
| **See development roadmap** | [Roadmap](vision/ROADMAP.md) | ✅ |
| **Review module specifications** | [Module Specs](vision/MODULE_SPECS.md) | ✅ |

---

## 🤖 For AI Assistants (Claude Code)

### Quick Context Map
New to this project? Start here:
1. **System Overview**: Read [Architecture Overview](architecture/OVERVIEW.md) - Comprehensive system design
2. **Recent Work**: [Session Logs Index](sessions/INDEX.md) - Review latest sessions
3. **API Reference**: [API Endpoints](reference/API_ENDPOINTS.md) - All 60+ HTTP endpoints
4. **State System**: [State Architecture](architecture/STATE_ARCHITECTURE.md) - Complete state management
5. **Module System**: [Module Architecture](architecture/MODULE_ARCHITECTURE.md) - 8 modules, BaseModule framework
6. **Key Decisions**: [ADRs](decisions/) - Why we made key architectural choices
7. **Roadmap**: [Roadmap](vision/ROADMAP.md) - Phase 4 complete, Phase 5 planning

### Common AI Tasks
| Task | Resources |
|------|-----------|
| **Fix a bug** | [Troubleshooting](guides/TROUBLESHOOTING.md), [Session Logs](sessions/INDEX.md) |
| **Add API endpoint** | [API Endpoints](reference/API_ENDPOINTS.md), [Architecture Overview](architecture/OVERVIEW.md) |
| **Work with state** | [State Architecture](architecture/STATE_ARCHITECTURE.md), [State Reference](reference/STATE_MANAGEMENT.md) |
| **Create/modify module** | [Module Architecture](architecture/MODULE_ARCHITECTURE.md), [Module Reference](reference/MODULE_SYSTEM.md) |
| **Debug Socket.IO** | [Socket Protocol](reference/SOCKET_PROTOCOL.md) |
| **Work with Python** | [Python Integration](reference/PYTHON_INTEGRATION.md) |
| **Find a file** | [File Structure](reference/FILE_STRUCTURE.md) |
| **Understand a decision** | [ADRs](decisions/) |
| **Continue previous work** | [Session Logs Index](sessions/INDEX.md) (reverse chronological) |

### Search Tips
- **By topic**: Use documentation categories below
- **By date**: Check [Session Logs Index](sessions/INDEX.md)
- **By file**: Check [File Structure Reference](reference/FILE_STRUCTURE.md)
- **By endpoint**: Check [API Endpoints](reference/API_ENDPOINTS.md)
- **By Python script**: Check [Python Integration](reference/PYTHON_INTEGRATION.md)

---

## 📚 Documentation Categories

### 📖 Guides (How-To)
Practical, step-by-step instructions for common tasks - **All complete!** ✅

| Guide | Description | Time | Status |
|-------|-------------|------|--------|
| [Getting Started](guides/GETTING_STARTED.md) | Installation, setup, first run | 15 min | ✅ |
| [Troubleshooting](guides/TROUBLESHOOTING.md) | Common issues and solutions | As needed | ✅ |
| [Module Creation](guides/MODULE_CREATION.md) | Create a new processing module | 2-3 hr | ✅ ~900 lines |
| [Deployment](guides/DEPLOYMENT.md) | Deploy to production | 1-2 hr | ✅ ~1,100 lines |
| [Testing](guides/TESTING.md) | Testing strategies and tools | 30 min | ✅ ~850 lines |

### 📋 Reference (Lookup)
Complete technical reference documentation - **All complete!** ✅

| Reference | Description | Status |
|-----------|-------------|--------|
| [API Endpoints](reference/API_ENDPOINTS.md) | Complete HTTP endpoint catalog (60+ endpoints) | ✅ Updated |
| [State Management](reference/STATE_MANAGEMENT.md) | StateManager API reference | ✅ |
| [Module System](reference/MODULE_SYSTEM.md) | ModuleLoader API reference | ✅ |
| [Socket Protocol](reference/SOCKET_PROTOCOL.md) | Real-time communication protocol | ✅ |
| [Python Integration](reference/PYTHON_INTEGRATION.md) | Python script communication (16 scripts) | ✅ Updated |
| [File Structure](reference/FILE_STRUCTURE.md) | Codebase organization | ✅ Updated |

### 🏗️ Architecture (Understanding)
System design and architectural decisions - **All complete!** ✅

| Document | Description | Status |
|----------|-------------|--------|
| [Overview](architecture/OVERVIEW.md) | High-level system architecture | ✅ |
| [Dual Version Design](architecture/DUAL_VERSION_DESIGN.md) | Classic vs Workspace explanation | ✅ |
| [State Architecture](architecture/STATE_ARCHITECTURE.md) | State management patterns | ✅ |
| [Module Architecture](architecture/MODULE_ARCHITECTURE.md) | Module system (8 modules, BaseModule) | ✅ Updated |
| [Authentication](architecture/AUTHENTICATION.md) | Auth system & permissions | ✅ |

### 📝 Sessions (Historical)
Development session logs with detailed change records.

| Document | Description | Status |
|----------|-------------|--------|
| [Session Index](sessions/INDEX.md) | Chronological development history | ✅ |
| → 7 sessions documented | Phase 1 & 2 complete (~48 hours) | ✅ |

**Recent Sessions:**
- 2025-11-27: Documentation system (Days 1-2)
- 2025-11-27: Guides & vision documentation (Day 4)
- 2025-11-26: Overlay debugging & root cause fix
- 2025-11-26: Phase 2 completion, cleanup, bug fixes
- 2025-11-20: Phase 1 foundation architecture

### 🎯 Decisions (ADRs)
Architecture Decision Records documenting key technical choices - **All complete!** ✅

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](decisions/001_vanilla_js_over_framework.md) | Vanilla JS Over Framework | ✅ Accepted |
| [ADR-002](decisions/002_dual_version_approach.md) | Dual Version Approach | ✅ Accepted |
| [ADR-003](decisions/003_session_based_isolation.md) | Session-Based Isolation | ✅ Accepted |
| [ADR-004](decisions/004_module_system_design.md) | Module System Design | ✅ Accepted |
| [ADR-005](decisions/005_design_system_color_scheme.md) | Design System & Color Scheme | ✅ Accepted |
| [ADR-006](decisions/006_asn2v_routed_v1_migration.md) | autoStructN2V Routed v1 Migration | ✅ Accepted |
| [ADR-007](decisions/007_stack_stitching_module.md) | Stack Stitching Module | ✅ Accepted |
| [ADR-008](decisions/008_preprocess_module.md) | Preprocessing Module | ✅ Accepted |
| [ADR-009](decisions/009_segcleanup_module.md) | Segmentation Cleanup & Quantification | ✅ Accepted |
| [ADR-010](decisions/010_format_conversion.md) | File Format Conversion + Mesh Simplification | ✅ Accepted |
| [ADR-011](decisions/011_shared_viewer_chrome_and_conventions.md) | Shared Viewer Chrome & UI Conventions | ✅ Accepted |
| [ADR-012](decisions/012_workspace_data_model_consolidation.md) | Workspace Data Model Consolidation | ✅ Accepted |

### 🚀 Vision (Strategy)
Product roadmap and long-term planning - **All complete!** ✅

| Document | Description | Status |
|----------|-------------|--------|
| [Platform Vision](vision/PLATFORM_VISION.md) | Long-term platform goals | ✅ ~750 lines |
| [Roadmap](vision/ROADMAP.md) | Phase-based implementation plan | ✅ ~1,050 lines |
| [Module Specs](vision/MODULE_SPECS.md) | Planned module specifications | ✅ ~1,050 lines |

### 📄 Templates
Documentation templates for consistency.

| Template | Use For | Status |
|----------|---------|--------|
| [Guide Template](templates/GUIDE_TEMPLATE.md) | Creating new how-to guides | ✅ |
| [Session Template](templates/SESSION_TEMPLATE.md) | Documenting development sessions | ✅ |
| [ADR Template](templates/ADR_TEMPLATE.md) | Recording architecture decisions | ✅ |
| [API Entry Template](templates/API_REFERENCE_ENTRY.md) | Documenting API endpoints | ✅ |

---

## 🔍 Finding What You Need

### By User Type

**New Developer:**
1. Start: [Getting Started](guides/GETTING_STARTED.md)
2. Understand: [CLAUDE.md](../CLAUDE.md) architecture section
3. Reference: [API Endpoints](reference/API_ENDPOINTS.md), [File Structure](reference/FILE_STRUCTURE.md)

**Continuing Developer:**
1. Recent work: [Session Logs](sessions/INDEX.md)
2. Current status: [Troubleshooting Known Issues](guides/TROUBLESHOOTING.md)
3. Codebase map: [File Structure](reference/FILE_STRUCTURE.md)

**AI Assistant (Claude Code):**
1. Context: [CLAUDE.md](../CLAUDE.md) + [Session Logs](sessions/INDEX.md)
2. API Reference: [API Endpoints](reference/API_ENDPOINTS.md)
3. Task-specific: Use Quick Links table above

### By Task Type

**I need to...**

| Task | Look here |
|------|-----------|
| Install and run the app | [Getting Started](guides/GETTING_STARTED.md) |
| Understand system design | [CLAUDE.md](../CLAUDE.md) or [File Structure](reference/FILE_STRUCTURE.md) |
| Look up an endpoint | [API Endpoints](reference/API_ENDPOINTS.md) |
| Work with state | [State Management](reference/STATE_MANAGEMENT.md) |
| Work with modules | [Module System](reference/MODULE_SYSTEM.md) |
| Debug Socket.IO | [Socket Protocol](reference/SOCKET_PROTOCOL.md) |
| Work with Python scripts | [Python Integration](reference/PYTHON_INTEGRATION.md) |
| Find a file | [File Structure](reference/FILE_STRUCTURE.md) |
| Fix a bug | [Troubleshooting](guides/TROUBLESHOOTING.md) |
| See recent changes | [Session Logs](sessions/INDEX.md) |

---

## 📦 Project Structure

```
/viz_app/
├── README.md                          # Quick start
├── CLAUDE.md                          # AI assistant guide
├── /public/
│   ├── /classic/                      # Original app (stable)
│   └── /workspace/                    # New modular app
├── /python/                           # ML processing scripts
├── /docs/                             # Documentation (you are here)
└── server.js                          # Express backend
```

---

## 🆘 Help & Support

**Need Help?**
- Check [Troubleshooting Guide](guides/TROUBLESHOOTING.md)
- Review [Recent Sessions](sessions/INDEX.md) for similar issues
- Check [GitHub Issues](https://github.com/lucasfortune/viz_app/issues)

**Contributing Documentation?**
- Use appropriate [template](templates/)
- Follow existing documentation style
- Update this index if adding new docs
- Cross-reference related documentation

---

## 📊 Documentation Stats

| Metric | Value |
|--------|-------|
| **Total active documentation files** | **32** |
| **Total documentation lines** | **~30,000 lines** |
| Guides | 5 ✅ (~2,850 lines) |
| Reference docs | 6 ✅ (5,894 lines) |
| Architecture docs | 5 ✅ (~4,250 lines) |
| Session logs | 7 ✅ (~12,000 lines) |
| ADRs | 4 ✅ (~1,960 lines) |
| Vision docs | 3 ✅ (~2,850 lines) |
| Templates | 4 ✅ |
| Archive | 3 (VISION.md, ACTIONPLAN.md, README.md) |

**Day 3 Achievement:** Created 5 architecture docs and 4 ADRs totaling ~6,210 lines!

**Day 4 Achievement:** Created 3 guides (Module Creation, Deployment, Testing) and 3 vision docs (Platform Vision, Roadmap, Module Specs) totaling ~5,700 lines!

**Day 5 Achievement:** Created 2 comprehensive session logs (Phase 1 & 2) totaling ~12,000 lines, archived historical documents, verified all links, and finalized the documentation system! ✅

---

## ⚡ Quick Tips

1. **Use Ctrl+F/Cmd+F** to search within this index
2. **Bookmark this page** for quick access
3. **Check session logs first** when continuing work
4. **Read ADRs** to understand why decisions were made
5. **Use templates** when creating new documentation

---

**Last Updated:** 2025-11-28
**Documentation Version:** 1.3 (Day 5 Complete - Final)
**Project Phase:** Phase 2 Complete, Phase 3 Ready

---

**Navigation:** Up: [Project Root](../) | Start Reading: [Getting Started](guides/GETTING_STARTED.md) →
