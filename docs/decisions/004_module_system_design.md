# ADR-004: Module System with Dynamic ES6 Imports

**Date:** 2024-06-15 (Estimated - Phase 2 planning)
**Status:** Accepted
**Deciders:** Development Team, Architect
**Tags:** architecture, modularity, extensibility, es6-modules

---

## Context

### Problem Statement

For the Workspace version, we needed a **plugin-like architecture** to support multiple processing modules (segmentation, denoising, annotation, mesh generation, visualization). The system should:
- Load modules **on demand** (lazy loading)
- Support **dynamic module registration** (easy to add new modules)
- Allow **module isolation** (modules don't interfere with each other)
- Enable **shared state** (modules communicate via centralized state)
- Work with **Vanilla JavaScript** (no framework, see ADR-001)

### Background

**Workspace Requirements (Phase 2):**
- Hub-based UI (welcome view with module cards)
- Launch modules on demand
- Multiple modules: Segmentation, Denoising, Annotation, Mesh, Visualization
- Module lifecycle: activate → use → deactivate
- Shared state management (StateManager)
- Future: Module pipeline chaining

**Technical Constraints:**
- Vanilla JavaScript (no React/Vue, see ADR-001)
- Modern browser support (ES6+)
- No build step required (optional for development)
- Fast initial page load
- Memory-efficient (load only what's needed)

**Key Questions:**
1. How to load modules dynamically?
2. How to isolate module code?
3. How to share state between modules?
4. How to manage module lifecycle?

### Current State

This decision was made in **June 2024** during Phase 2 planning, when designing the Workspace architecture.

---

## Decision

**We have decided to use dynamic ES6 imports with class instantiation for the module system, rather than static imports or iframe-based plugins.**

### Details

**Architecture:**
```javascript
// ModuleLoader handles dynamic loading
class ModuleLoader {
  async load(moduleId) {
    const module = this.modules.get(moduleId);

    // Dynamic ES6 import
    const ModuleClass = await import(module.path);

    // Instantiate with state injection
    const instance = new ModuleClass.default(stateManager);

    // Activate
    await instance.activate();
  }
}

// Module Registry (configuration)
const moduleRegistry = [
  {
    id: 'segmentation',
    name: 'U-Net Segmentation',
    path: '/workspace/js/modules/segmentation/SegmentationModule.js',
    inputs: ['image_stack', 'annotations'],
    outputs: ['segmented_stack', 'trained_model']
  }
];

// Module Implementation
class SegmentationModule {
  constructor(stateManager) {
    this.state = stateManager;  // Shared state injection
  }

  async activate() {
    // Render UI, attach listeners
  }

  async deactivate() {
    // Cleanup
  }
}

export default SegmentationModule;
```

**Key Features:**
- **Dynamic imports:** `await import(modulePath)` loads module on demand
- **State injection:** StateManager passed to constructor
- **Lifecycle:** activate() → deactivate() pattern
- **Registry:** Centralized module definitions
- **ES6 modules:** Native browser support (no bundler needed)

---

## Alternatives Considered

### Option 1: Static Imports (All Upfront)

**Description:**
Import all modules statically at application start.

```javascript
// All modules loaded upfront
import SegmentationModule from './modules/segmentation/SegmentationModule.js';
import DenoisingModule from './modules/denoising/DenoisingModule.js';
import AnnotationModule from './modules/annotation/AnnotationModule.js';
import MeshModule from './modules/mesh/MeshModule.js';

// Instantiate all on load
const modules = {
  segmentation: new SegmentationModule(stateManager),
  denoising: new DenoisingModule(stateManager),
  annotation: new AnnotationModule(stateManager),
  mesh: new MeshModule(stateManager)
};
```

**Pros:**
- ✅ Simplest implementation
- ✅ No async loading complexity
- ✅ All code available immediately
- ✅ Works offline after initial load

**Cons:**
- ❌ **Slow initial load:** All modules loaded even if not used
- ❌ **High memory usage:** All modules in memory always
- ❌ **Large bundle:** User downloads all modules upfront
- ❌ **Poor user experience:** Long wait before UI appears
- ❌ **Wasted bandwidth:** User may only use one module

**Why not chosen:**
Performance issue - users would wait for all modules to load even if they only use segmentation. Wastes bandwidth and memory.

---

### Option 2: iframe-Based Plugins (Complete Isolation)

**Description:**
Each module runs in a separate iframe for complete isolation.

```html
<div id="module-container">
  <iframe id="module-iframe" src="/modules/segmentation/index.html"></iframe>
</div>
```

```javascript
// Parent window
function loadModule(moduleId) {
  const iframe = document.getElementById('module-iframe');
  iframe.src = `/modules/${moduleId}/index.html`;

  // Communication via postMessage
  window.addEventListener('message', (event) => {
    if (event.data.type === 'moduleUpdate') {
      stateManager.update(event.data.path, event.data.value);
    }
  });
}
```

**Pros:**
- ✅ **Complete isolation:** Modules can't interfere with each other
- ✅ **Separate context:** Each module has own global scope
- ✅ **Security:** Strong sandboxing
- ✅ **Technology agnostic:** Modules could use different frameworks

**Cons:**
- ❌ **Complex communication:** postMessage API is cumbersome
- ❌ **Shared state complexity:** Hard to share StateManager
- ❌ **Performance overhead:** Multiple DOM trees, browser contexts
- ❌ **Styling isolation:** Need to duplicate styles in each iframe
- ❌ **Debugging harder:** Each iframe is separate context
- ❌ **URL complexity:** Each module needs own URL
- ❌ **Resource duplication:** Each iframe loads own dependencies

**Why not chosen:**
Overengineered for our needs. Communication complexity and performance overhead not worth the isolation benefits. StateManager sharing would be difficult.

---

### Option 3: Dynamic ES6 Imports (Chosen)

**Description:**
Use native browser dynamic imports with class instantiation and shared state.

```javascript
// Dynamic import
const ModuleClass = await import('/workspace/js/modules/segmentation/SegmentationModule.js');

// Instantiate with state injection
const module = new ModuleClass.default(stateManager);

// Lifecycle
await module.activate();
await module.deactivate();
```

**Pros:**
- ✅ **Lazy loading:** Only load modules when needed
- ✅ **Native JavaScript:** No external dependencies
- ✅ **Shared state:** Easy state injection via constructor
- ✅ **Fast initial load:** Load hub first, modules on demand
- ✅ **Memory efficient:** Load/unload modules as needed
- ✅ **Simple communication:** Shared StateManager, no postMessage
- ✅ **Easy debugging:** Single browser context
- ✅ **Clean lifecycle:** activate/deactivate pattern
- ✅ **Extensible:** Easy to add new modules

**Cons:**
- ⚠️ **Less isolation than iframes:** Modules share global scope
  - **Mitigation:** Enforce module interface contract
  - **Mitigation:** Code review to prevent global pollution

- ⚠️ **Module bugs affect app:** No sandboxing
  - **Mitigation:** Proper error handling in ModuleLoader
  - **Mitigation:** try/catch in activate/deactivate

- ⚠️ **Require modern browsers:** IE11 doesn't support dynamic imports
  - **Acceptance:** Target modern browsers only

**Why chosen:**
Best balance of features vs complexity. Native JavaScript, lazy loading, easy state sharing, simple lifecycle. Trade-offs (less isolation) are acceptable for our use case.

---

## Comparison Matrix

| Criteria | Static Imports | iframe Plugins | **Dynamic ES6** | Weight |
|----------|----------------|----------------|-----------------|--------|
| **Initial Load Speed** | 1/5 (slow) | 3/5 (moderate) | **5/5** (fast) | Critical |
| **Memory Efficiency** | 1/5 (all loaded) | 3/5 (separate contexts) | **5/5** (on demand) | High |
| **State Sharing** | 5/5 (easy) | 2/5 (postMessage) | **5/5** (injection) | Critical |
| **Isolation** | 2/5 (same context) | 5/5 (complete) | **3/5** (moderate) | Medium |
| **Complexity** | 5/5 (simple) | 2/5 (complex) | **4/5** (moderate) | High |
| **Debugging** | 5/5 (easy) | 2/5 (harder) | **5/5** (easy) | Medium |
| **Extensibility** | 3/5 (static) | 4/5 (good) | **5/5** (excellent) | High |
| **Browser Support** | 5/5 (all) | 5/5 (all) | **4/5** (modern) | Low |
| **Performance** | 3/5 (upfront cost) | 3/5 (overhead) | **5/5** (lazy) | High |
| **Total Score** | 30/45 | 29/45 | **41/45** | |

**Dynamic ES6 Imports wins decisively.**

---

## Consequences

### Positive (Benefits)

- ✅ **Fast Initial Load:** Hub loads instantly, modules load on demand
- ✅ **Memory Efficient:** Only active modules in memory
- ✅ **Lazy Loading:** Bandwidth saved, modules loaded when needed
- ✅ **Easy State Sharing:** StateManager injected via constructor
- ✅ **Clean Lifecycle:** activate/deactivate pattern
- ✅ **Simple Communication:** No postMessage complexity
- ✅ **Easy to Add Modules:** Just add entry to registry
- ✅ **Native JavaScript:** No external dependencies

### Negative (Trade-offs)

- ⚠️ **Less Isolation:** Modules share global scope
  - **Mitigation:** Module interface contract (constructor, activate, deactivate)
  - **Mitigation:** Code review to prevent global pollution
  - **Mitigation:** Namespace module code (use classes, avoid globals)

- ⚠️ **Module Bugs Can Affect App:** No sandboxing
  - **Mitigation:** Error handling in ModuleLoader
  - **Mitigation:** try/catch in activate/deactivate
  - **Mitigation:** Module testing before registration

- ⚠️ **Cleanup Responsibility:** Modules must clean up properly
  - **Mitigation:** Enforce deactivate() method in interface
  - **Mitigation:** Document cleanup requirements
  - **Mitigation:** Module creation guide (Phase 3)

### Neutral (Impacts)

- ℹ️ **Modern Browser Requirement:** IE11 doesn't support dynamic imports (acceptable)
- ℹ️ **Async Loading:** Need to handle loading states (already done with StateManager)
- ℹ️ **Registry Pattern:** Need to maintain module registry (simple)

---

## Implementation

### Changes Required

**1. ModuleLoader Class:**
```javascript
// /workspace/js/core/ModuleLoader.js
class ModuleLoader {
  constructor(stateManager) {
    this.state = stateManager;
    this.modules = new Map();
    this.activeModule = null;
  }

  register(moduleConfig) {
    this.modules.set(moduleConfig.id, moduleConfig);
  }

  async load(moduleId) {
    const moduleConfig = this.modules.get(moduleId);

    // Dynamic import
    const ModuleClass = await import(moduleConfig.path);

    // Instantiate
    moduleConfig.instance = new ModuleClass.default(this.state);

    // Activate
    await moduleConfig.instance.activate();

    this.activeModule = moduleConfig;
  }

  async deactivate() {
    if (this.activeModule && this.activeModule.instance) {
      await this.activeModule.instance.deactivate();
    }
    this.activeModule = null;
  }
}
```

**2. Module Registry:**
```javascript
// /workspace/js/modules/registry.js
const moduleRegistry = [
  {
    id: 'segmentation',
    name: 'U-Net Segmentation',
    path: '/workspace/js/modules/segmentation/SegmentationModule.js',
    icon: '🧩',
    inputs: ['image_stack', 'annotations'],
    outputs: ['segmented_stack', 'trained_model'],
    status: 'available'
  },
  {
    id: 'denoising',
    name: 'Deep Learning Denoising',
    path: '/workspace/js/modules/denoising/DenoisingModule.js',
    icon: '🔊',
    status: 'coming_soon'
  }
];
```

**3. Module Interface Contract:**
```javascript
// /workspace/js/modules/yourmodule/YourModule.js
class YourModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;
    this.unsubscribers = [];
  }

  async activate() {
    this.container = document.getElementById('module-view');
    this.render();
    this.attachListeners();
  }

  async deactivate() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.removeListeners();
    this.container.innerHTML = '';
  }

  render() {
    this.container.innerHTML = `...`;
  }
}

export default YourModule;
```

**4. Workspace Initialization:**
```javascript
// /workspace/js/workspace.js
import StateManager from './core/StateManager.js';
import ModuleLoader from './core/ModuleLoader.js';
import moduleRegistry from './modules/registry.js';

const stateManager = new StateManager();
const moduleLoader = new ModuleLoader(stateManager);

// Register all modules
moduleRegistry.forEach(module => moduleLoader.register(module));

// Load module on click
function launchModule(moduleId) {
  moduleLoader.load(moduleId);
}
```

### Migration Path

**No migration needed** - This is the initial Workspace design.

**Evolution Path:**
- **Phase 2:** Basic module system (single module at a time)
- **Phase 3:** Module state persistence
- **Phase 4:** Module pipeline chaining
- **Phase 5+:** Module dependencies, marketplace

### Timeline

- **Decision Made:** June 2024 (Phase 2 planning)
- **Implementation Started:** June 2024 (Phase 2 development)
- **First Module (Segmentation):** November 2024 (Phase 2 complete)
- **More Modules:** Phase 4+ (2025)

---

## Validation

### Success Criteria

- [x] **Fast initial load** - Hub loads in <1 second
- [x] **Lazy loading works** - Modules load on demand
- [x] **State sharing works** - StateManager accessible in modules
- [x] **Lifecycle works** - activate/deactivate pattern functional
- [x] **Easy to add modules** - New modules added via registry
- [ ] **Multiple modules working** - Segmentation complete, more in Phase 4
- [x] **No isolation issues** - Modules don't interfere with each other

### Monitoring

**Metrics to Watch:**
- Initial page load time
- Module load time (per module)
- Memory usage (with/without modules loaded)
- Module activation/deactivation success rate
- Developer onboarding time (module creation)

**Results (as of Nov 2025):**
- ✅ Initial load: <1 second (excellent)
- ✅ Module load: <500ms (excellent)
- ✅ Memory: Efficient, only active module in memory
- ✅ Lifecycle: No issues with activate/deactivate
- ✅ Easy to add modules: Registry pattern works well

### Review Date

**Scheduled Review:** June 2025 (after Phase 4, more modules added)

**Review Questions:**
- Are isolation issues a problem?
- Should we add module dependencies?
- Any performance issues with multiple modules?
- Is lifecycle pattern working well?

**Current Status (Nov 2025):** Working excellently, no changes needed.

---

## References

### Documentation

- [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) - Complete architecture
- [State Architecture](../architecture/STATE_ARCHITECTURE.md) - StateManager design
- [Module System Reference](../reference/MODULE_SYSTEM.md) - Complete API
- Module Creation Guide (Phase 3) - Step-by-step tutorial

### External Resources

- [MDN: Dynamic Imports](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import)
- [MDN: ES6 Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [JavaScript Module Pattern](https://www.patterns.dev/posts/module-pattern)

### Related ADRs

- [ADR-001](001_vanilla_js_over_framework.md) - Vanilla JS decision (module system uses vanilla JS)
- [ADR-002](002_dual_version_approach.md) - Dual version (Workspace has module system)

### Discussions

- Team discussion: "How to make Workspace extensible?" (June 2024)
- Prototype: Dynamic import POC (June 2024)
- Review: Module system design (June 2024)

---

## Notes

### Future Considerations

**Module Dependencies (Phase 4+):**
```javascript
{
  id: 'mesh',
  dependencies: ['segmentation'],  // Requires segmentation output
  inputs: ['segmented_stack']
}
```

**Module Pipeline Chaining (Phase 4+):**
```
Denoise → Segment → Generate Mesh → Export
```

**Module Marketplace (Phase 5+):**
- Third-party modules
- Module versioning
- Module package manager
- Security review process

### Assumptions

- Users have modern browsers (ES6+ support) - validated
- Modules will be well-behaved (proper cleanup) - enforced via contract
- Module bugs won't crash entire app - mitigated with error handling
- Module isolation sufficient without iframes - validated so far

### Lessons Learned

**What Worked Well:**
- Dynamic imports are fast and easy
- State injection works perfectly
- Lifecycle pattern is clean
- Registry pattern is simple
- Easy to add new modules

**What Could Be Better:**
- Module interface enforcement (TypeScript would help)
- Automated testing for module interface compliance
- Module dependency system (coming in Phase 4)
- Better module isolation (acceptable trade-off)

**Would We Make Same Decision Again?**
**Yes, absolutely.** Dynamic ES6 imports are:
- Native JavaScript (no dependencies)
- Fast (lazy loading)
- Easy to use (simple API)
- Extensible (easy to add modules)
- Perfect fit for Vanilla JS architecture

Alternative (iframes) would have been overengineered and complex. Current approach works excellently.

---

**Navigation:**
← [ADR-003](003_session_based_isolation.md) | [All ADRs](.) | [Documentation Index](../INDEX.md) →

---

**Decision Lifecycle:**
- **Proposed:** June 2024
- **Accepted:** June 2024
- **Deprecated:** N/A
- **Superseded:** N/A

**Last Updated:** 2025-11-27
