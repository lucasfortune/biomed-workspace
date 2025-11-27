# Documentation Index

Welcome to the Biomedical Image Processing Workspace documentation! This index will help you find what you need quickly.

---

## 🚀 Quick Links

| I want to... | Go to | Status |
|--------------|-------|--------|
| **Get started quickly** | [Getting Started](guides/GETTING_STARTED.md) | ✅ |
| **Look up an API endpoint** | [API Endpoints](reference/API_ENDPOINTS.md) | ✅ |
| **Understand state management** | [State Management](reference/STATE_MANAGEMENT.md) | ✅ |
| **Understand module system** | [Module System](reference/MODULE_SYSTEM.md) | ✅ |
| **Understand Socket.IO** | [Socket Protocol](reference/SOCKET_PROTOCOL.md) | ✅ |
| **Work with Python scripts** | [Python Integration](reference/PYTHON_INTEGRATION.md) | ✅ |
| **Find files in codebase** | [File Structure](reference/FILE_STRUCTURE.md) | ✅ |
| **Find recent changes** | [Session Logs](sessions/INDEX.md) | ✅ |
| **Troubleshoot an issue** | [Troubleshooting Guide](guides/TROUBLESHOOTING.md) | ✅ |

---

## 🤖 For AI Assistants (Claude Code)

### Quick Context Map
New to this project? Start here:
1. **System Overview**: Read [CLAUDE.md](../CLAUDE.md) in project root - 10 min read
2. **Recent Work**: [Session Logs Index](sessions/INDEX.md) - Review latest sessions
3. **API Reference**: [API Endpoints](reference/API_ENDPOINTS.md) - All 29 HTTP endpoints
4. **State System**: [State Management](reference/STATE_MANAGEMENT.md) - StateManager API
5. **Module System**: [Module System](reference/MODULE_SYSTEM.md) - ModuleLoader API
6. **Known Issues**: [Troubleshooting](guides/TROUBLESHOOTING.md) - File upload category mismatch (Phase 3)

### Common AI Tasks
| Task | Resources |
|------|-----------|
| **Fix a bug** | [Troubleshooting](guides/TROUBLESHOOTING.md), [Session Logs](sessions/INDEX.md) |
| **Add API endpoint** | [API Endpoints](reference/API_ENDPOINTS.md), [CLAUDE.md](../CLAUDE.md) |
| **Work with state** | [State Management](reference/STATE_MANAGEMENT.md) |
| **Create/modify module** | [Module System](reference/MODULE_SYSTEM.md), [CLAUDE.md](../CLAUDE.md) |
| **Debug Socket.IO** | [Socket Protocol](reference/SOCKET_PROTOCOL.md) |
| **Work with Python** | [Python Integration](reference/PYTHON_INTEGRATION.md) |
| **Find a file** | [File Structure](reference/FILE_STRUCTURE.md) |
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
System design and architectural decisions.

| Document | Description | Status |
|----------|-------------|--------|
| Overview | High-level system architecture | 📅 Phase 3 |
| Dual Version Design | Classic vs Workspace explanation | 📅 Phase 3 |
| State Architecture | State management patterns | 📅 Phase 3 |
| Module Architecture | Module system design | 📅 Phase 3 |
| Authentication | Auth system & permissions | 📅 Phase 3 |

**Note:** Architecture details are currently in [CLAUDE.md](../CLAUDE.md) and will be extracted to dedicated docs in Phase 3.

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
Architecture Decision Records documenting key technical choices.

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | Vanilla JS Over Framework | 📅 Phase 3 |
| ADR-002 | Dual Version Approach | 📅 Phase 3 |
| ADR-003 | Session-Based Isolation | 📅 Phase 3 |
| ADR-004 | Module System Design | 📅 Phase 3 |

**Note:** ADRs will be created in Phase 3 to document key architectural decisions.

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
| **Total documentation files** | **15** |
| **Total documentation lines** | **~7,200 lines** |
| Guides | 2 ✅ (3 planned) |
| Reference docs | 6 ✅ (5,894 lines) |
| Architecture docs | 0 (5 planned for Phase 3) |
| Session logs | 5 ✅ |
| ADRs | 0 (4 planned for Phase 3) |
| Vision docs | 0 (3 planned for Phase 3) |
| Templates | 4 ✅ |

**Day 2 Achievement:** Created 6 comprehensive reference docs totaling 5,894 lines!

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
