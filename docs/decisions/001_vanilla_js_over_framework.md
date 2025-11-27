# ADR-001: Vanilla JavaScript Over Frontend Framework

**Date:** 2024-01-15 (Estimated - Phase 1 start)
**Status:** Accepted
**Deciders:** Development Team
**Tags:** frontend, architecture, technology-choice, vanilla-js

---

## Context

### Problem Statement

When building the biomedical image segmentation web application, we needed to choose a frontend technology stack. The application requires:
- Real-time 3D visualization using Three.js
- Interactive UI for multi-step ML workflow
- File upload/download capabilities
- Real-time progress updates (WebSocket)
- Support for future modular architecture (workspace version)

### Background

**Project Constraints:**
- Small development team (1-2 developers)
- Rapid prototyping required
- Educational/research tool (not consumer product)
- Heavy reliance on Three.js for 3D visualization
- Need for direct DOM manipulation for complex 3D scenes
- Potential for future module system

**Common Alternatives:**
- React (most popular, large ecosystem)
- Vue (lightweight, easier learning curve)
- Angular (full framework, enterprise-ready)
- Svelte (compile-time framework, performant)

### Current State

This decision was made at the **beginning of Phase 1** when architecting the Classic version of the application. No previous frontend codebase existed.

---

## Decision

**We have decided to use Vanilla JavaScript (ES6+) without a frontend framework for both the Classic and Workspace versions of the application.**

### Details

**Implementation Approach:**
- Pure JavaScript (ES6+) with modern features
- Direct DOM manipulation
- No build step or bundler for Classic version
- ES6 modules for Workspace version
- Three.js integrated directly (framework-agnostic)
- Custom state management (mitt + StateManager for Workspace)

**Classic Version:**
```javascript
// No framework, simple script includes
<script src="/js/app.js"></script>
<script src="/js/training.js"></script>
<script src="/js/visualization.js"></script>
```

**Workspace Version:**
```javascript
// ES6 modules with dynamic imports
import StateManager from './core/StateManager.js';
import ModuleLoader from './core/ModuleLoader.js';
const ModuleClass = await import(modulePath);
```

**State Management:**
- Classic: Local variables + DOM state
- Workspace: Custom StateManager with mitt event emitter

**Why Not Use a Framework Later?**
Even as the application grew more complex (Workspace version), we continued with Vanilla JS because:
1. Architecture investment already made
2. Custom state management (StateManager) solved complexity
3. Module system works well with dynamic ES6 imports
4. No benefit worth migration cost

---

## Alternatives Considered

### Option 1: React

**Description:**
Most popular JavaScript framework with component-based architecture and virtual DOM.

**Pros:**
- ✅ Large ecosystem and community
- ✅ Component reusability
- ✅ Virtual DOM for performance
- ✅ Many UI libraries available
- ✅ Well-documented
- ✅ Team likely familiar with it

**Cons:**
- ❌ Build step required (webpack/vite)
- ❌ Learning curve for team
- ❌ Overhead for simple application
- ❌ Three.js integration more complex
- ❌ Need to manage React lifecycle with Three.js
- ❌ Overkill for Phase 1 scope

**Why not chosen:**
Too much overhead for the initial scope. Build step complexity and Three.js integration challenges outweighed benefits.

---

### Option 2: Vue

**Description:**
Progressive JavaScript framework with template-based approach.

**Pros:**
- ✅ Easier learning curve than React
- ✅ Good documentation
- ✅ Progressive adoption possible
- ✅ Reactive state management
- ✅ Smaller bundle size than React

**Cons:**
- ❌ Still requires build step for optimal use
- ❌ Template syntax learning curve
- ❌ Three.js integration still requires work
- ❌ Smaller ecosystem than React
- ❌ Additional layer of abstraction

**Why not chosen:**
While lighter than React, still introduced unnecessary complexity for a straightforward ML workflow application. Three.js integration would still require careful lifecycle management.

---

### Option 3: Svelte

**Description:**
Compile-time framework that compiles components to efficient vanilla JavaScript.

**Pros:**
- ✅ No virtual DOM (compiles to vanilla JS)
- ✅ Reactive by default
- ✅ Smaller bundle sizes
- ✅ Simpler state management
- ✅ Good performance

**Cons:**
- ❌ Requires build step and compiler
- ❌ Smaller ecosystem
- ❌ Team unfamiliar with it
- ❌ Less mature than React/Vue
- ❌ Still abstraction over vanilla JS

**Why not chosen:**
While interesting from a performance perspective, the build step and learning curve weren't justified for the project scope. The compiled output is vanilla JS, so we might as well write vanilla JS directly.

---

### Option 4: Vanilla JavaScript (Chosen)

**Description:**
Pure JavaScript (ES6+) with no framework, direct DOM manipulation, and native browser APIs.

**Pros:**
- ✅ No build step required (Classic version)
- ✅ Direct DOM manipulation
- ✅ No learning curve (pure JavaScript)
- ✅ Fast initial development
- ✅ Easy Three.js integration (no framework lifecycle)
- ✅ Complete control over code
- ✅ No framework update concerns
- ✅ Smaller codebase
- ✅ Easier for contributors to understand
- ✅ ES6 modules work natively in browsers

**Cons:**
- ⚠️ Manual DOM manipulation (more verbose)
- ⚠️ No built-in state management (solved: StateManager)
- ⚠️ No component reusability (mitigated: modules)
- ⚠️ Less tooling support (linting still works)
- ⚠️ Potential for spaghetti code (mitigated: architecture)

**Why chosen:**
Best fit for project requirements - simple, fast to develop, perfect for Three.js integration, and extensible enough for future modular architecture.

---

## Comparison Matrix

| Criteria | React | Vue | Svelte | **Vanilla JS** | Weight |
|----------|-------|-----|--------|----------------|--------|
| **Initial Development Speed** | 2/5 | 3/5 | 2/5 | **5/5** | High |
| **Three.js Integration** | 3/5 | 3/5 | 3/5 | **5/5** | High |
| **Learning Curve** | 2/5 | 3/5 | 2/5 | **5/5** | High |
| **Build Complexity** | 2/5 | 2/5 | 2/5 | **5/5** | Medium |
| **Performance** | 4/5 | 4/5 | 5/5 | **4/5** | Medium |
| **Maintainability** | 5/5 | 4/5 | 4/5 | **3/5** | High |
| **Ecosystem** | 5/5 | 4/5 | 3/5 | **3/5** | Low |
| **State Management** | 4/5 | 5/5 | 5/5 | **2/5** → **4/5** (with StateManager) | Medium |
| **Bundle Size** | 2/5 | 3/5 | 4/5 | **5/5** | Low |
| **Flexibility** | 3/5 | 3/5 | 3/5 | **5/5** | Medium |
| **Total Score** | 32/50 | 34/50 | 33/50 | **41-43/50** | |

**Note:** Vanilla JS score improved with StateManager (Phase 2).

---

## Consequences

### Positive (Benefits)

- ✅ **Fast Initial Development:** Classic version built rapidly without build setup or framework learning
- ✅ **Three.js Integration:** Seamless integration, no framework lifecycle conflicts
- ✅ **No Build Step (Classic):** Classic version loads instantly, no webpack/babel needed
- ✅ **Easy to Understand:** New contributors can jump in immediately (just JavaScript)
- ✅ **Small Codebase:** No framework overhead, only application code
- ✅ **Complete Control:** Full control over every DOM interaction
- ✅ **Performance:** No virtual DOM overhead, direct DOM manipulation
- ✅ **Extensibility:** ES6 modules enabled Workspace version without framework

### Negative (Trade-offs)

- ⚠️ **Manual DOM Manipulation:** More verbose than declarative frameworks
  - **Mitigation:** Utility functions, consistent patterns, StateManager for Workspace

- ⚠️ **No Built-in State Management (Classic):** Scattered state in Classic version
  - **Mitigation:** Custom StateManager added for Workspace version (mitt + reactive updates)

- ⚠️ **Code Reusability:** Less component reusability than frameworks
  - **Mitigation:** Module system in Workspace, shared utility functions

- ⚠️ **Potential for Disorganized Code:** Risk of spaghetti code without framework structure
  - **Mitigation:** Clear architecture (modules, core systems), code organization patterns

### Neutral (Impacts)

- ℹ️ **ES6 Module Support:** Modern browsers support ES6 modules natively, used in Workspace
- ℹ️ **Learning Opportunity:** Team learned advanced vanilla JS patterns
- ℹ️ **Framework-Agnostic:** Could integrate framework in future if needed (unlikely)

---

## Implementation

### Changes Required

**Phase 1 (Classic Version):**
1. **Directory Structure:**
   ```
   /public/classic/js/
   ├── app.js          # Main controller
   ├── training.js     # Training logic
   ├── inference.js    # Inference logic
   ├── visualization.js # Three.js visualization
   └── utils.js        # Utility functions
   ```

2. **HTML Integration:**
   ```html
   <script src="/js/app.js"></script>
   <script src="/js/socket.js"></script>
   <script src="/js/training.js"></script>
   ```

3. **State Management:**
   ```javascript
   // Local variables
   let uploadedFiles = null;
   let trainingConfig = null;

   // DOM state
   document.getElementById('step1-panel').style.display = 'block';
   ```

**Phase 2 (Workspace Version):**
1. **ES6 Modules:**
   ```
   /public/workspace/js/
   ├── workspace.js        # Main
   ├── /core/
   │   ├── StateManager.js  # Centralized state
   │   └── ModuleLoader.js  # Dynamic modules
   └── /modules/
       └── registry.js
   ```

2. **StateManager (Custom):**
   ```javascript
   import mitt from 'mitt';

   class StateManager {
     constructor() {
       this.state = { ... };
       this.events = mitt();
     }

     update(path, value) {
       // Update state, emit events
     }

     subscribe(path, callback) {
       // Reactive subscriptions
     }
   }
   ```

3. **Dynamic Module Loading:**
   ```javascript
   const ModuleClass = await import(modulePath);
   const module = new ModuleClass.default(stateManager);
   ```

### Migration Path

**No migration needed** - This was the initial decision.

**If we were to migrate to a framework in the future:**
1. Start with Workspace version only (Classic can remain vanilla)
2. Migrate one module at a time
3. Keep StateManager interface, swap implementation
4. Gradual migration, not "big bang"

### Timeline

- **Decision Made:** January 2024 (Phase 1 planning)
- **Implementation Started:** January 2024 (Phase 1 development)
- **Classic Version Complete:** March 2024 (estimated)
- **Workspace Version Started:** June 2024 (Phase 2)
- **StateManager Added:** June 2024 (Phase 2)
- **Current Status:** Working well, no plans to change

---

## Validation

### Success Criteria

- [x] **Fast development** - Classic version built in reasonable time
- [x] **Three.js works smoothly** - No framework integration issues
- [x] **Code is understandable** - New contributors can jump in
- [x] **Performance is acceptable** - No lag or rendering issues
- [x] **Extensible** - Workspace version built on same foundation
- [x] **State management solved** - StateManager addresses Classic limitations
- [x] **Module system works** - Dynamic loading works as expected

### Monitoring

**Metrics to Watch:**
- Development velocity (feature completion time)
- Bug count related to state management
- Code complexity (lines of code, cyclomatic complexity)
- Load time and performance
- Contributor onboarding time

**Results (as of Nov 2025):**
- ✅ Development velocity: Good (features delivered on time)
- ✅ State bugs: Minimal (StateManager solved Classic issues)
- ✅ Code complexity: Manageable (~3,000 lines total, well-organized)
- ✅ Load time: Excellent (instant load, no build step)
- ✅ Contributor onboarding: Easy (vanilla JS is familiar)

### Review Date

**Scheduled Review:** June 2025 (after Phase 3 complete)

**Review Questions:**
- Is state management still working well?
- Are we hitting framework limitations?
- Would a framework simplify Phase 4+ modules?
- Any performance issues?

**Current Status (Nov 2025):** No need to change, decision still valid.

---

## References

### Documentation

- [Architecture Overview](../architecture/OVERVIEW.md) - System architecture
- [Dual Version Design](../architecture/DUAL_VERSION_DESIGN.md) - Classic vs Workspace
- [State Architecture](../architecture/STATE_ARCHITECTURE.md) - StateManager design
- [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) - Module system

### External Resources

- [Three.js Documentation](https://threejs.org/docs/) - 3D library used
- [mitt (Event Emitter)](https://github.com/developit/mitt) - Used in StateManager
- [MDN: JavaScript Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) - ES6 modules
- [MDN: Vanilla JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript) - JavaScript reference

### Related ADRs

- [ADR-002](002_dual_version_approach.md) - Dual version decision (uses vanilla JS for both)
- [ADR-004](004_module_system_design.md) - Module system uses dynamic ES6 imports

### Discussions

- Internal team discussion (January 2024)
- Three.js integration investigation
- Prototype development and testing

---

## Notes

### Future Considerations

**When Would We Reconsider?**
- If application becomes significantly more complex (100+ components)
- If we need server-side rendering (SSR)
- If we need mobile app (React Native could make sense)
- If team changes to framework-only developers

**Likelihood:** Low - Current approach working well

### Assumptions

- Team comfortable with vanilla JavaScript
- Application complexity remains manageable
- Three.js remains core requirement
- Performance is acceptable
- Browser support remains good (modern browsers)

### Lessons Learned

**What Worked Well:**
- Three.js integration is seamless
- Fast initial development
- Easy for contributors to understand
- StateManager solved state management gap
- Module system provides structure

**What Could Be Better:**
- Classic version state is scattered (accepted trade-off)
- More boilerplate for reactive updates (StateManager helps)
- Need to manually manage subscriptions (unsubscribe pattern)

**Would We Make Same Decision Again?**
**Yes** - For this project's requirements, vanilla JS was the right choice. It enabled rapid prototyping, perfect Three.js integration, and provided foundation for modular Workspace architecture.

---

**Navigation:**
← [Authentication Architecture](../architecture/AUTHENTICATION.md) | [All ADRs](.) | [ADR-002](002_dual_version_approach.md) →

---

**Decision Lifecycle:**
- **Proposed:** January 2024
- **Accepted:** January 2024
- **Deprecated:** N/A
- **Superseded:** N/A

**Last Updated:** 2025-11-27
