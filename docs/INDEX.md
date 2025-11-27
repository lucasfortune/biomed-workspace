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

---

## 🤖 For AI Assistants (Claude Code)

### Quick Context Map
New to this project? Start here:
1. **System Overview**: Read [Architecture Overview](architecture/OVERVIEW.md) - Comprehensive system design
2. **Recent Work**: [Session Logs Index](sessions/INDEX.md) - Review latest sessions
3. **API Reference**: [API Endpoints](reference/API_ENDPOINTS.md) - All 29 HTTP endpoints
4. **State System**: [State Architecture](architecture/STATE_ARCHITECTURE.md) - Complete state management
5. **Module System**: [Module Architecture](architecture/MODULE_ARCHITECTURE.md) - Module system design
6. **Key Decisions**: [ADRs](decisions/) - Why we made key architectural choices
7. **Known Issues**: [Troubleshooting](guides/TROUBLESHOOTING.md) - File upload category mismatch (Phase 3)

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
Practical, step-by-step instructions for common tasks.

| Guide | Description | Time | Status |
|-------|-------------|------|--------|
| [Getting Started](guides/GETTING_STARTED.md) | Installation, setup, first run | 15 min | ✅ |
| [Troubleshooting](guides/TROUBLESHOOTING.md) | Common issues and solutions | As needed | ✅ |
| Module Creation | Create a new processing module | 2-3 hr | 📅 Phase 3 |
| Deployment | Deploy to production | 1-2 hr | 📅 Future |
| Testing | Testing strategies and tools | 30 min | 📅 Future |

### 📋 Reference (Lookup)
Complete technical reference documentation - **All complete!** ✅

| Reference | Description | Status |
|-----------|-------------|--------|
| [API Endpoints](reference/API_ENDPOINTS.md) | Complete HTTP endpoint catalog (29 endpoints) | ✅ 1,159 lines |
| [State Management](reference/STATE_MANAGEMENT.md) | StateManager API reference | ✅ 787 lines |
| [Module System](reference/MODULE_SYSTEM.md) | ModuleLoader API reference | ✅ 987 lines |
| [Socket Protocol](reference/SOCKET_PROTOCOL.md) | Real-time communication protocol | ✅ 1,024 lines |
| [Python Integration](reference/PYTHON_INTEGRATION.md) | Python script communication | ✅ 1,079 lines |
| [File Structure](reference/FILE_STRUCTURE.md) | Codebase organization | ✅ 858 lines |

### 🏗️ Architecture (Understanding)
System design and architectural decisions - **All complete!** ✅

| Document | Description | Status |
|----------|-------------|--------|
| [Overview](architecture/OVERVIEW.md) | High-level system architecture | ✅ ~920 lines |
| [Dual Version Design](architecture/DUAL_VERSION_DESIGN.md) | Classic vs Workspace explanation | ✅ ~740 lines |
| [State Architecture](architecture/STATE_ARCHITECTURE.md) | State management patterns | ✅ ~870 lines |
| [Module Architecture](architecture/MODULE_ARCHITECTURE.md) | Module system design | ✅ ~850 lines |
| [Authentication](architecture/AUTHENTICATION.md) | Auth system & permissions | ✅ ~870 lines |

### 📝 Sessions (Historical)
Development session logs with detailed change records.

| Document | Description | Status |
|----------|-------------|--------|
| [Session Index](sessions/INDEX.md) | Chronological development history | ✅ |
| → 5 sessions documented | Phase 1 & 2 sessions (~32 hours) | ✅ |

**Recent Sessions:**
- 2025-11-26: Overlay debugging & root cause fix
- 2025-11-26: Phase 2 cleanup
- 2025-11-26: Three bug fixes
- Earlier: Phase 1 foundation, Module system

### 🎯 Decisions (ADRs)
Architecture Decision Records documenting key technical choices - **All complete!** ✅

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](decisions/001_vanilla_js_over_framework.md) | Vanilla JS Over Framework | ✅ Accepted |
| [ADR-002](decisions/002_dual_version_approach.md) | Dual Version Approach | ✅ Accepted |
| [ADR-003](decisions/003_session_based_isolation.md) | Session-Based Isolation | ✅ Accepted |
| [ADR-004](decisions/004_module_system_design.md) | Module System Design | ✅ Accepted |

### 🚀 Vision (Strategy)
Product roadmap and long-term planning.

| Document | Description | Status |
|----------|-------------|--------|
| Platform Vision | Long-term platform goals | 📅 Phase 3 |
| Roadmap | Phase-based implementation plan | 📅 Phase 3 |
| Module Specs | Planned module specifications | 📅 Phase 3 |

**Note:** Vision documents will be created in Phase 3 or Phase 4.

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
| **Total documentation files** | **24** |
| **Total documentation lines** | **~12,100 lines** |
| Guides | 2 ✅ (3 planned) |
| Reference docs | 6 ✅ (5,894 lines) |
| Architecture docs | 5 ✅ (~4,250 lines) |
| Session logs | 5 ✅ |
| ADRs | 4 ✅ (~1,960 lines) |
| Vision docs | 0 (3 planned for Day 4) |
| Templates | 4 ✅ |

**Day 3 Achievement:** Created 5 architecture docs and 4 ADRs totaling ~6,210 lines!

---

## ⚡ Quick Tips

1. **Use Ctrl+F/Cmd+F** to search within this index
2. **Bookmark this page** for quick access
3. **Check session logs first** when continuing work
4. **Read ADRs** to understand why decisions were made
5. **Use templates** when creating new documentation

---

**Last Updated:** 2025-11-27
**Documentation Version:** 1.1 (Day 3 Complete)
**Project Phase:** Phase 2 Complete

---

**Navigation:** Up: [Project Root](../) | Start Reading: [Getting Started](guides/GETTING_STARTED.md) →
