# Documentation Index

Welcome to the Biomedical Image Processing Workspace documentation! This index will help you find what you need quickly.

---

## 🚀 Quick Links

| I want to... | Go to |
|--------------|-------|
| **Get started quickly** | [Getting Started](guides/GETTING_STARTED.md) |
| **Look up an API endpoint** | [API Endpoints](reference/API_ENDPOINTS.md) |
| **Create a new module** | [Module Creation Guide](guides/MODULE_CREATION.md) |
| **Deploy to production** | [Deployment Guide](guides/DEPLOYMENT.md) |
| **Understand the architecture** | [Architecture Overview](architecture/OVERVIEW.md) |
| **Find recent changes** | [Session Logs](sessions/INDEX.md) |
| **Troubleshoot an issue** | [Troubleshooting Guide](guides/TROUBLESHOOTING.md) |

---

## 🤖 For AI Assistants (Claude Code)

### Quick Context Map
New to this project? Start here:
1. **System Overview**: [Architecture Overview](architecture/OVERVIEW.md) - 10 min read
2. **Recent Work**: [Session Logs Index](sessions/INDEX.md) - Review latest sessions
3. **API Reference**: [API Endpoints](reference/API_ENDPOINTS.md) - Complete endpoint catalog
4. **Known Issues**: [Roadmap Phase 3](vision/ROADMAP.md#phase-3-file-browser--workspace-management) - File upload category mismatch

### Common AI Tasks
| Task | Resources |
|------|-----------|
| **Fix a bug** | [Troubleshooting](guides/TROUBLESHOOTING.md), [Session Logs](sessions/INDEX.md) |
| **Add new feature** | [Architecture](architecture/), [Module Creation](guides/MODULE_CREATION.md) |
| **Understand design choice** | [Architecture Decisions](decisions/) |
| **Continue previous work** | [Session Logs Index](sessions/INDEX.md) (reverse chronological) |

### Search Tips
- **By topic**: Use documentation categories below
- **By date**: Check [Session Logs Index](sessions/INDEX.md)
- **By file**: Check [File Structure Reference](reference/FILE_STRUCTURE.md)
- **By endpoint**: Check [API Endpoints](reference/API_ENDPOINTS.md)

---

## 📚 Documentation Categories

### 📖 Guides (How-To)
Practical, step-by-step instructions for common tasks.

| Guide | Description | Time |
|-------|-------------|------|
| [Getting Started](guides/GETTING_STARTED.md) | Installation, setup, first run | 15 min |
| [Module Creation](guides/MODULE_CREATION.md) | Create a new processing module | 2-3 hr |
| [Deployment](guides/DEPLOYMENT.md) | Deploy to production | 1-2 hr |
| [Testing](guides/TESTING.md) | Testing strategies and tools | 30 min |
| [Troubleshooting](guides/TROUBLESHOOTING.md) | Common issues and solutions | As needed |

### 📋 Reference (Lookup)
Complete technical reference documentation.

| Reference | Description |
|-----------|-------------|
| [API Endpoints](reference/API_ENDPOINTS.md) | Complete HTTP endpoint catalog |
| [State Management](reference/STATE_MANAGEMENT.md) | StateManager API reference |
| [Module System](reference/MODULE_SYSTEM.md) | ModuleLoader API reference |
| [Socket Protocol](reference/SOCKET_PROTOCOL.md) | Real-time communication protocol |
| [Python Integration](reference/PYTHON_INTEGRATION.md) | Python script communication |
| [File Structure](reference/FILE_STRUCTURE.md) | Codebase organization |

### 🏗️ Architecture (Understanding)
System design and architectural decisions.

| Document | Description |
|----------|-------------|
| [Overview](architecture/OVERVIEW.md) | High-level system architecture |
| [Dual Version Design](architecture/DUAL_VERSION_DESIGN.md) | Classic vs Workspace explanation |
| [State Architecture](architecture/STATE_ARCHITECTURE.md) | State management patterns |
| [Module Architecture](architecture/MODULE_ARCHITECTURE.md) | Module system design |
| [Authentication](architecture/AUTHENTICATION.md) | Auth system & permissions |

### 📝 Sessions (Historical)
Development session logs with detailed change records.

| Document | Description |
|----------|-------------|
| [Session Index](sessions/INDEX.md) | Chronological development history |
| Recent sessions... | See index for complete list |

### 🎯 Decisions (ADRs)
Architecture Decision Records documenting key technical choices.

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](decisions/001_vanilla_js_over_framework.md) | Vanilla JS Over Framework | Accepted |
| [ADR-002](decisions/002_dual_version_approach.md) | Dual Version Approach | Accepted |
| [ADR-003](decisions/003_session_based_isolation.md) | Session-Based Isolation | Accepted |
| [ADR-004](decisions/004_module_system_design.md) | Module System Design | Accepted |

### 🚀 Vision (Strategy)
Product roadmap and long-term planning.

| Document | Description |
|----------|-------------|
| [Platform Vision](vision/PLATFORM_VISION.md) | Long-term platform goals |
| [Roadmap](vision/ROADMAP.md) | Phase-based implementation plan |
| [Module Specs](vision/MODULE_SPECS.md) | Planned module specifications |

### 📄 Templates
Documentation templates for consistency.

| Template | Use For |
|----------|---------|
| [Guide Template](templates/GUIDE_TEMPLATE.md) | Creating new how-to guides |
| [Session Template](templates/SESSION_TEMPLATE.md) | Documenting development sessions |
| [ADR Template](templates/ADR_TEMPLATE.md) | Recording architecture decisions |
| [API Entry Template](templates/API_REFERENCE_ENTRY.md) | Documenting API endpoints |

---

## 🔍 Finding What You Need

### By User Type

**New Developer:**
1. Start: [Getting Started](guides/GETTING_STARTED.md)
2. Understand: [Architecture Overview](architecture/OVERVIEW.md)
3. Learn: [Module Creation](guides/MODULE_CREATION.md)

**Continuing Developer:**
1. Recent work: [Session Logs](sessions/INDEX.md)
2. Current status: [Roadmap](vision/ROADMAP.md)
3. Known issues: [Troubleshooting](guides/TROUBLESHOOTING.md)

**AI Assistant (Claude Code):**
1. Context: [Architecture Overview](architecture/OVERVIEW.md)
2. Recent changes: [Session Logs](sessions/INDEX.md)
3. Task-specific: Use Quick Links table above

### By Task Type

**I need to...**

| Task | Look here |
|------|-----------|
| Install and run the app | [Getting Started](guides/GETTING_STARTED.md) |
| Understand system design | [Architecture Overview](architecture/OVERVIEW.md) |
| Look up an endpoint | [API Endpoints](reference/API_ENDPOINTS.md) |
| Create a new module | [Module Creation](guides/MODULE_CREATION.md) |
| Deploy to production | [Deployment](guides/DEPLOYMENT.md) |
| Fix a bug | [Troubleshooting](guides/TROUBLESHOOTING.md) |
| Understand a decision | [Architecture Decisions](decisions/) |
| See recent changes | [Session Logs](sessions/INDEX.md) |
| Understand state management | [State Management](reference/STATE_MANAGEMENT.md) |
| Work with Python scripts | [Python Integration](reference/PYTHON_INTEGRATION.md) |
| Find a file | [File Structure](reference/FILE_STRUCTURE.md) |

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
- Check [GitHub Issues](https://github.com/yourusername/viz_app/issues)

**Contributing Documentation?**
- Use appropriate [template](templates/)
- Follow existing documentation style
- Update this index if adding new docs
- Cross-reference related documentation

---

## 📊 Documentation Stats

| Metric | Value |
|--------|-------|
| Total documentation files | 35+ |
| Guides | 5 |
| Reference docs | 6 |
| Architecture docs | 5 |
| ADRs | 4 |
| Templates | 4 |

---

## ⚡ Quick Tips

1. **Use Ctrl+F/Cmd+F** to search within this index
2. **Bookmark this page** for quick access
3. **Check session logs first** when continuing work
4. **Read ADRs** to understand why decisions were made
5. **Use templates** when creating new documentation

---

**Last Updated:** 2025-11-27
**Documentation Version:** 1.0
**Project Phase:** Phase 2 Complete

---

**Navigation:** Up: [Project Root](../) | Start Reading: [Getting Started](guides/GETTING_STARTED.md) →
