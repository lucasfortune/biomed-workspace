# ADR-002: Dual Version Approach (Classic + Workspace)

**Date:** 2024-06-01 (Estimated - Phase 2 planning)
**Status:** Superseded (the Classic version was removed in 1.5.1; the Workspace is the only frontend)
**Deciders:** Development Team, Product Owner
**Tags:** architecture, migration-strategy, user-experience, modularity

> **Superseded.** This record is kept for history. The Classic version it
> describes was removed from the codebase in release 1.5.1.

---

## Context

### Problem Statement

After successfully launching the Classic version of the biomedical image segmentation application, we identified a need for more advanced features:
- Multiple processing modules (denoising, annotation, mesh generation)
- Non-linear workflows (pipeline chaining)
- Better state management (reactive UI updates)
- Modular architecture for extensibility

However, the Classic version was:
- **Stable and working** - Users actively using it
- **Battle-tested** - No major bugs
- **Feature-complete** for basic segmentation
- **Simple** - Easy to understand and maintain

**The Question:** How do we innovate without breaking what works?

### Background

**Classic Version Status (May 2024):**
- Fully functional linear workflow
- ~10 active research users
- No major bugs
- All basic features complete
- Monolithic architecture (hard to extend)

**Desired New Features:**
- Modular architecture (plugin-like modules)
- State management (reactive UI)
- Module system (dynamic loading)
- Pipeline chaining (future)
- Multiple processing types beyond segmentation

**Risk Factors:**
- Users depend on Classic version for research
- Breaking changes would disrupt workflows
- Migration could introduce bugs
- Refactoring monolithic code is risky

### Current State

This decision was made in **June 2024** during Phase 2 planning, after Classic version was stable and in production use.

---

## Decision

**We have decided to maintain two parallel versions of the application (Classic + Workspace) with shared backend infrastructure, rather than migrating the Classic version or using feature flags.**

### Details

**Architecture:**
```
/public/
├── /classic/          # Original version (stable, complete)
│   ├── index.html     # Linear workflow UI
│   └── /js/           # Monolithic JavaScript
│
├── /workspace/        # New modular version (Phase 2+)
│   ├── index.html     # Hub-based UI
│   └── /js/
│       ├── /core/     # StateManager, ModuleLoader
│       └── /modules/  # Plugin-like modules
│
└── welcome.html       # Landing page (version selection)
```

**Shared Components:**
- `server.js` - Express backend (serves both versions)
- `/python/` - ML scripts (used by both)
- `/uploads/`, `/models/`, `/results/` - File storage (same structure)
- Authentication system (session-based, shared)

**User Experience:**
- Landing page offers choice of version
- Users can switch between versions mid-session
- Same login, same session
- Same files accessible from both

**Development Strategy:**
- Classic: **Maintenance mode** (bug fixes only, no new features)
- Workspace: **Active development** (all new features)
- Eventual deprecation of Classic (Phase 5+, timeline TBD)

---

## Alternatives Considered

### Option 1: Full Migration (Deprecate Classic)

**Description:**
Refactor Classic version into modular architecture, force all users to new version.

**Pros:**
- ✅ Single codebase to maintain
- ✅ All users on latest features
- ✅ Cleaner architecture
- ✅ Faster feature development (no dual maintenance)

**Cons:**
- ❌ **High risk** - Could break working application
- ❌ **User disruption** - Force users to learn new interface
- ❌ **No fallback** - If Workspace has bugs, no alternative
- ❌ **Rushed development** - Pressure to match Classic features quickly
- ❌ **Testing burden** - Must test everything before launch

**Why not chosen:**
Too risky. Users depend on Classic for research. No fallback if migration fails.

---

### Option 2: Feature Flags (Single Codebase)

**Description:**
Add feature flags to Classic version, toggle between old and new UI/features.

**Pros:**
- ✅ Single codebase
- ✅ Can gradually roll out features
- ✅ Users can opt-in to new features

**Cons:**
- ❌ **Code complexity** - `if (newFeature)` checks everywhere
- ❌ **Hard to maintain** - Two code paths in every file
- ❌ **Testing nightmare** - Must test all combinations
- ❌ **Coupled development** - Classic and Workspace tightly coupled
- ❌ **Difficult rollback** - Can't easily revert features
- ❌ **Performance overhead** - Runtime checks for flags

**Why not chosen:**
Code complexity would become unmanageable. Testing burden too high. Tightly coupled development limits innovation.

---

### Option 3: Dual Version (Chosen)

**Description:**
Create separate `/workspace/` directory with new modular architecture, keep Classic version unchanged.

**Pros:**
- ✅ **Zero risk to Classic** - No changes to working code
- ✅ **User choice** - Users decide when to switch
- ✅ **Incremental innovation** - Develop Workspace at own pace
- ✅ **Fallback option** - If Workspace fails, Classic still works
- ✅ **Clear separation** - No code coupling
- ✅ **Parallel testing** - Test Workspace without affecting Classic
- ✅ **Backend reuse** - Share server, Python, storage
- ✅ **Gradual migration** - Users migrate when ready

**Cons:**
- ⚠️ **Dual maintenance** - Must maintain two frontends
  - **Mitigation:** Classic in maintenance mode (minimal work)

- ⚠️ **Increased codebase size** - Two frontend codebases
  - **Mitigation:** Shared backend reduces duplication

- ⚠️ **Feature parity gap** - Classic may lag behind
  - **Mitigation:** Acceptable - Classic is "done", Workspace is future

- ⚠️ **User confusion** - Which version to use?
  - **Mitigation:** Clear landing page, guidance

**Why chosen:**
Best balance of risk vs innovation. Allows safe development of new architecture while keeping stable version available.

---

## Comparison Matrix

| Criteria | Full Migration | Feature Flags | **Dual Version** | Weight |
|----------|---------------|---------------|------------------|--------|
| **Risk to Classic** | 1/5 (high risk) | 2/5 (moderate) | **5/5** (zero risk) | Critical |
| **User Disruption** | 1/5 (forced change) | 3/5 (some confusion) | **5/5** (user choice) | High |
| **Development Freedom** | 3/5 (constrained) | 2/5 (coupled) | **5/5** (independent) | High |
| **Code Maintainability** | 5/5 (single codebase) | 1/5 (complex flags) | **4/5** (dual but clean) | High |
| **Testing Complexity** | 3/5 (moderate) | 1/5 (high) | **4/5** (parallel, separate) | High |
| **Fallback Option** | 1/5 (none) | 2/5 (limited) | **5/5** (full fallback) | High |
| **Backend Duplication** | 5/5 (single) | 5/5 (single) | **5/5** (shared) | Medium |
| **Time to Market** | 2/5 (must finish all) | 3/5 (gradual) | **5/5** (incremental) | Medium |
| **Long-term Scalability** | 4/5 (good) | 2/5 (poor) | **4/5** (good) | Medium |
| **Total Score** | 25/45 | 21/45 | **42/45** | |

**Dual Version wins decisively.**

---

## Consequences

### Positive (Benefits)

- ✅ **Classic Remains Stable:** No risk of regression, users can continue research uninterrupted
- ✅ **Incremental Innovation:** Workspace can be developed properly without rushing
- ✅ **User Choice:** Power users can try Workspace, others stay on Classic
- ✅ **Backend Reuse:** 90% of backend code shared, minimal duplication
- ✅ **Parallel Development:** Can experiment with Workspace features risk-free
- ✅ **Graceful Migration Path:** Users migrate when ready, not forced
- ✅ **Clear Separation:** No code coupling, independent development
- ✅ **Fallback Option:** If Workspace has issues, Classic is always available

### Negative (Trade-offs)

- ⚠️ **Dual Frontend Maintenance:** Two UI codebases to maintain
  - **Mitigation:** Classic in maintenance mode (bug fixes only)
  - **Acceptance:** Worth it for zero-risk innovation

- ⚠️ **Feature Parity Lag:** Classic won't get new features
  - **Mitigation:** Classic is "done" - has all basic features needed
  - **Acceptance:** Users who want new features can use Workspace

- ⚠️ **Codebase Size:** Larger overall codebase
  - **Mitigation:** Shared backend, Python, storage reduces duplication
  - **Acceptance:** ~2x frontend code, but clean and separated

- ⚠️ **Version Selection Confusion:** Users may not know which to use
  - **Mitigation:** Clear landing page with guidance
  - **Future:** Analytics to understand usage patterns, deprecate Classic when ready

### Neutral (Impacts)

- ℹ️ **Session Sharing:** Users can switch versions mid-session (same login, files)
- ℹ️ **Deployment:** Both versions deployed together (simple)
- ℹ️ **Documentation:** Need separate user guides for each version
- ℹ️ **Testing:** Must test both versions (but separately, easier than coupled)

---

## Implementation

### Changes Required

**1. Directory Restructure:**
```
OLD:
/public/
├── index.html
├── /js/
└── /css/

NEW:
/public/
├── welcome.html           # NEW: Landing page
├── /classic/              # MOVED: Classic version
│   ├── index.html
│   ├── /js/
│   └── /css/
└── /workspace/            # NEW: Workspace version
    ├── index.html
    ├── /js/
    └── /css/
```

**2. Server Routes:**
```javascript
// server.js

// Landing page
app.get('/', (req, res) => {
  res.sendFile('public/welcome.html');
});

// Classic version
app.get('/classic', requireAuth, (req, res) => {
  res.sendFile('public/classic/index.html');
});

// Workspace version
app.get('/workspace', requireAuth, (req, res) => {
  res.sendFile('public/workspace/index.html');
});

// Workspace-specific API (new namespace)
app.get('/api/workspace/status', requireAuth, ...);
```

**3. Shared Backend:**
- Existing endpoints work for both versions
- Add `/api/workspace/*` namespace for workspace-specific endpoints
- Python scripts unchanged (shared by both)
- File storage unchanged (same structure)

**4. Welcome Page UI:**
```html
<div class="version-selector">
  <div class="version-card classic">
    <h2>Classic Version</h2>
    <p>Linear workflow, stable and complete</p>
    <a href="/classic">Launch Classic</a>
  </div>

  <div class="version-card workspace">
    <h2>Workspace Version</h2>
    <p>Modular, advanced features</p>
    <a href="/workspace">Launch Workspace</a>
  </div>
</div>
```

### Migration Path

**Phase 1:** Classic version working (complete)
**Phase 2:** Create Workspace foundation
  - Directory structure
  - StateManager, ModuleLoader
  - Welcome page
  - First module (segmentation)

**Phase 3-4:** Add more modules to Workspace
  - Denoising
  - Annotation
  - Mesh generation
  - Visualization

**Phase 5:** Evaluate Classic deprecation
  - Once Workspace reaches feature parity
  - User adoption analysis
  - Feedback collection
  - Deprecation announcement (3+ months notice)

**Phase 6:** Classic deprecation (timeline TBD)
  - Redirect to Workspace by default
  - Classic available as "fallback mode"
  - Eventually remove Classic entirely

**No forced migration** - users migrate when Workspace is ready.

### Timeline

- **Decision Made:** June 2024
- **Implementation Started:** June 2024 (Phase 2)
- **Workspace Phase 1 Complete:** July 2024 (foundation)
- **Workspace Phase 2 Complete:** November 2024 (segmentation module)
- **Classic Deprecation:** TBD (Phase 5+, not before 2025)

---

## Validation

### Success Criteria

- [x] **Classic remains stable** - No regressions, all features work
- [x] **Workspace foundation working** - StateManager, ModuleLoader operational
- [ ] **User adoption** - Users trying Workspace version (in progress)
- [ ] **Feature parity** - Workspace has all Classic features (Phase 3)
- [x] **Backend shared successfully** - No duplication of server/Python code
- [x] **Clear version selection** - Users understand which version to use
- [ ] **Positive user feedback** - Users prefer Workspace (Phase 4+)

### Monitoring

**Metrics to Watch:**
- Version usage (Classic vs Workspace page visits)
- User retention per version
- Bug reports per version
- Feature requests per version
- User feedback/surveys

**Results (as of Nov 2025):**
- ✅ Classic: Stable, no regressions
- ✅ Workspace: Foundation complete, segmentation module in progress
- ⏳ User adoption: Small test group using Workspace
- ✅ Backend sharing: Working well, no duplication issues
- ✅ Development velocity: Good progress on Workspace

### Review Date

**Scheduled Review:** March 2025 (after Phase 3 complete)

**Review Questions:**
- Is Classic still being used? How much?
- Is Workspace ready for wider adoption?
- Should we deprecate Classic?
- Any issues with dual maintenance?

---

## References

### Documentation

- [Dual Version Design](../architecture/DUAL_VERSION_DESIGN.md) - Complete comparison
- [Architecture Overview](../architecture/OVERVIEW.md) - System architecture
- [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) - Workspace modules
- [State Architecture](../architecture/STATE_ARCHITECTURE.md) - StateManager design

### Related ADRs

- [ADR-001](001_vanilla_js_over_framework.md) - Vanilla JS (both versions use it)
- [ADR-004](004_module_system_design.md) - Module system design (Workspace)

### Discussions

- Team discussion: "How to add modularity without breaking Classic?" (May 2024)
- User feedback: "Don't break my workflow!" (multiple users)
- Prototype review: Dual version approach (June 2024)

---

## Notes

### Future Considerations

**When to Deprecate Classic?**
- Feature parity (Workspace has all Classic features)
- User adoption (majority of users on Workspace)
- Positive feedback (users prefer Workspace)
- Stability (Workspace as stable as Classic)
- Timeline: Not before mid-2025

**What if Workspace fails?**
- Classic remains available indefinitely
- Can iterate on Workspace without pressure
- Zero risk to users

**Backend coupling risk?**
- Monitor for version-specific backend code
- Keep backend agnostic where possible
- Use `/api/workspace/*` namespace for workspace-only endpoints

### Assumptions

- Users value stability over new features (validated)
- Classic feature set is complete (validated)
- Workspace development won't be rushed (validated)
- Dual maintenance burden is acceptable (validated so far)
- Users will migrate when ready (to be validated)

### Lessons Learned

**What Worked Well:**
- Zero risk to Classic - users unaffected
- Freedom to innovate in Workspace
- Backend sharing minimized duplication
- Clear separation reduced complexity

**What Could Be Better:**
- Earlier user testing of Workspace (should have started sooner)
- Better analytics on version usage (in progress)
- More user communication about versions (improved)

**Would We Make Same Decision Again?**
**Yes, absolutely.** This approach has proven correct:
- Classic remains stable (goal achieved)
- Workspace developed properly without rushing (goal achieved)
- Users have choice (goal achieved)
- No regrets about this decision

---

**Navigation:**
← [ADR-001](001_vanilla_js_over_framework.md) | [All ADRs](.) | [ADR-003](003_session_based_isolation.md) →

---

**Decision Lifecycle:**
- **Proposed:** May 2024
- **Accepted:** June 2024
- **Deprecated:** N/A
- **Superseded:** N/A

**Last Updated:** 2025-11-27
