# Server.js Refactoring Plan

## Executive Summary

Refactor the 3012-line `server.js` file into a modular, maintainable architecture using **gradual migration** strategy. Goal: Reduce server.js to ~150 lines while improving testability, maintainability, and scalability without breaking existing functionality.

---

## Current State Analysis

**server.js Structure (3012 lines):**
- 44+ routes across 7 functional areas
- 3 authentication middleware functions
- 10+ helper functions mixed with routes
- 2 in-memory Maps (trainingSessions, inferenceSessions)
- Socket.IO real-time communication
- Heavy Python process spawning logic
- Multer file upload configuration

**Supporting Modules (already well-structured):**
- `WorkspaceManager.js` (751 lines) - File/folder operations
- `activityLogger.js` (90 lines) - Audit trail
- `utils/processErrorHandler.js` (197 lines) - Error handling
- `utils/logger.js` (90 lines) - Logging
- `utils/envLoader.js` (124 lines) - Environment config

---

## Target Architecture

```
/viz_app/
├── server.js                          # Entry point (~150 lines)
├── /src/
│   ├── app.js                         # Express app factory
│   ├── /routes/                       # Express Routers
│   │   ├── index.js                   # Route aggregator
│   │   ├── auth.routes.js             # Login, register, logout
│   │   ├── workspace.routes.js        # Workspace API
│   │   ├── files.routes.js            # File CRUD + batch ops
│   │   ├── folders.routes.js          # Folder CRUD
│   │   ├── ml.routes.js               # Training/inference pipeline
│   │   └── static.routes.js           # Static file serving
│   │
│   ├── /middleware/                   # Express middleware
│   │   ├── auth.middleware.js         # requireAuth, requireApproved, requireAdmin
│   │   ├── upload.middleware.js       # Multer configuration
│   │   ├── error.middleware.js        # Global error handler
│   │   └── session.middleware.js      # Session configuration
│   │
│   ├── /services/                     # Business logic layer
│   │   ├── AuthService.js             # User auth & management
│   │   ├── WorkspaceService.js        # Workspace operations (wraps WorkspaceManager)
│   │   ├── FileService.js             # File upload/validation/tracking
│   │   ├── TrainingService.js         # ML training orchestration
│   │   ├── InferenceService.js        # ML inference orchestration
│   │   └── SessionTracker.js          # Manages trainingSessions/inferenceSessions Maps
│   │
│   ├── /helpers/                      # Pure utility functions
│   │   ├── pathHelpers.js             # Path conversion utilities
│   │   ├── validation.js              # Config validation
│   │   ├── pythonRunner.js            # Python process spawning wrapper
│   │   └── fileHelpers.js             # File system operations
│   │
│   ├── /sockets/                      # Socket.IO handlers
│   │   ├── index.js                   # Socket.IO initialization
│   │   ├── training.socket.js         # Training room management
│   │   └── inference.socket.js        # Inference room management
│   │
│   └── /config/                       # Configuration
│       ├── constants.js               # App constants (PYTHON_PATH, dirs)
│       ├── multer.config.js           # Multer storage config
│       └── session.config.js          # Session store config
│
├── /utils/                            # Keep existing modules
│   ├── envLoader.js                   # ✅ Already good
│   ├── logger.js                      # ✅ Already good
│   └── processErrorHandler.js         # ✅ Already good
│
├── WorkspaceManager.js                # ✅ Keep as-is
└── activityLogger.js                  # ✅ Keep as-is
```

---

## Migration Strategy: 7 Phases (4-5 weeks)

### Phase 1: Foundation Setup (Week 1, 3-4 days)
**Goal:** Create directory structure and extract pure utilities.

**Tasks:**
1. Create `/src` directory with subdirectories
2. Extract configuration:
   - `src/config/constants.js` - PYTHON_PATH, directory names, file limits
   - `src/config/multer.config.js` - Multer storage configuration
   - `src/config/session.config.js` - Session store setup
3. Extract pure helper functions:
   - `src/helpers/validation.js` - `validateTrainingConfig()`, validation wrappers
   - `src/helpers/pathHelpers.js` - `convertResultPathsForWeb()`, path utilities
   - `src/helpers/fileHelpers.js` - File system operations
4. Create `src/services/SessionTracker.js` - Wrap trainingSessions/inferenceSessions Maps

**Verification:** Server starts, all routes accessible

**Risk:** LOW (only extracting pure functions)

---

### Phase 2: Middleware Extraction (Week 1-2, 2-3 days)
**Goal:** Extract all middleware into dedicated modules.

**Tasks:**
1. Create `src/middleware/auth.middleware.js`:
   - Move `requireAuth()`, `requireApproved()`, `requireAdmin()`
2. Create `src/middleware/upload.middleware.js`:
   - Move multer configuration (uploadTiff, uploadImport)
3. Create `src/middleware/session.middleware.js`:
   - Extract session configuration
4. Create `src/middleware/error.middleware.js`:
   - Move multer error handler
5. Update `server.js` imports

**Verification:** Test authentication, file uploads, error handling

**Risk:** LOW (self-contained functions)

---

### Phase 3: Socket.IO Extraction (Week 2, 2-3 days)
**Goal:** Separate real-time communication logic.

**Tasks:**
1. Create `src/sockets/index.js` - Socket.IO initialization
2. Create `src/sockets/training.socket.js` - `join-training` room
3. Create `src/sockets/inference.socket.js` - `join-inference` room
4. Update server.js to use socket handlers

**Verification:** Test real-time updates during training/inference

**Risk:** MEDIUM (critical for UX)
**Mitigation:** Preserve exact logic, test with actual ML runs

---

### Phase 4: Service Layer (Week 2-3, 5-6 days)
**Goal:** Extract business logic into testable service classes.

**Order of implementation:**
1. **AuthService** (1-2 days):
   - User management functions (loadUsers, saveUsers, findUserByUsername)
   - Registration logic with bcrypt
   - Login/logout logic
   - Session creation

2. **WorkspaceService** (1 day):
   - Wrap WorkspaceManager
   - Add workspace initialization checks
   - Higher-level orchestration

3. **FileService** (1-2 days):
   - File upload handling
   - TIFF validation orchestration
   - Thumbnail generation
   - Metadata tracking via WorkspaceManager

4. **TrainingService** (1 day):
   - Training orchestration
   - Session tracking via SessionTracker
   - Model output tracking
   - Activity logging

5. **InferenceService** (1 day):
   - Inference orchestration
   - Model loading (imported vs trained)
   - Result tracking (3-source parsing)
   - Path conversion for web

**Verification:** Unit test each service, integrate one at a time

**Risk:** MEDIUM-HIGH (core business logic)
**Mitigation:** Incremental integration, comprehensive tests

---

### Phase 5: Route Extraction (Week 3-4, 6-8 days)
**Goal:** Split routes into Express Router modules.

**Order (simplest to most complex):**
1. `static.routes.js` (1 day) - File serving, welcome pages
2. `auth.routes.js` (1 day) - Login, register, logout
3. `folders.routes.js` (1 day) - Folder CRUD
4. `files.routes.js` (1-2 days) - File CRUD, batch operations, search
5. `workspace.routes.js` (1 day) - Workspace API endpoints
6. `ml.routes.js` (2-3 days) - Training/inference pipeline (most complex)

**Per route module:**
- Create router file in `src/routes/`
- Move route handlers from server.js
- Update to use services instead of inline logic
- Add route to `src/routes/index.js` aggregator
- Update server.js
- Test API endpoints

**Verification:** Integration tests for each route module

**Risk:** HIGH (primary API surface)
**Mitigation:** One module per day, API contract testing, keep server.js.backup

---

### Phase 6: Python Process Extraction (Week 4, 3-4 days)
**Goal:** Extract Python process spawning into dedicated helper.

**Tasks:**
1. Create `src/helpers/pythonRunner.js`:
   - `startTraining(params)` - Spawns train_model.py
   - `startInference(params)` - Spawns run_inference.py
   - `validateTiffStacks(rawPath, annPath)` - Spawns validate_tiff.py
   - `validateImportedModel(modelPath, configPath)` - Spawns validation
   - Use processErrorHandler for all processes
2. Update TrainingService and InferenceService to use pythonRunner
3. Preserve process communication protocol (PROGRESS:, FINAL_RESULT:, etc.)

**Verification:** Full ML pipeline E2E tests

**Risk:** MEDIUM (complex process management)
**Mitigation:** Preserve existing patterns, extensive logging

---

### Phase 7: App Factory & Finalization (Week 5, 3-4 days)
**Goal:** Create testable Express app factory.

**Tasks:**
1. Create `src/app.js`:
   - Express app factory function
   - Import all routers, middleware, config
   - NO server.listen() - export app instance
2. Update `server.js` to minimal entry point:
   ```javascript
   const app = require('./src/app');
   const server = http.createServer(app);
   const io = require('./src/sockets')(server);
   server.listen(PORT, () => { /* ... */ });
   ```
3. Add integration tests using supertest
4. Update documentation (CLAUDE.md, README)
5. Remove commented code

**Verification:** Full regression test suite

**Risk:** LOW (final organization)

---

## Testing Strategy

### Unit Tests (Phase 4+)
**Framework:** Jest + supertest

**Coverage targets:**
- Services: 80%+ coverage
- Helpers: 90%+ coverage
- Overall: 70%+

**Example test structure:**
```javascript
// src/services/AuthService.test.js
describe('AuthService', () => {
  describe('register', () => {
    it('should create new user with hashed password', async () => {
      // Test implementation
    });

    it('should reject duplicate usernames', async () => {
      // Test implementation
    });
  });
});
```

### Integration Tests (Phase 5+)
**API testing with supertest:**
```javascript
// src/routes/auth.routes.test.js
describe('POST /register', () => {
  it('should register new user', async () => {
    const response = await request(app)
      .post('/register')
      .send({ /* user data */ });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

### E2E Tests (Phase 6+)
**Full ML pipeline tests:**
- Upload test data → Configure → Train → Inference
- Test Socket.IO real-time updates
- Verify file tracking in metadata

---

## Dependencies to Add

### Required (Phase 1)
```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "@types/jest": "^29.5.5"
  }
}
```

### Optional (as needed)
```json
{
  "dependencies": {
    "express-validator": "^7.0.1",  // Request validation
    "helmet": "^7.0.0",             // Security headers
    "compression": "^1.7.4"         // Response compression
  },
  "devDependencies": {
    "eslint": "^8.50.0",            // Code linting
    "eslint-config-airbnb-base": "^15.0.0"
  }
}
```

---

## Risk Mitigation

### High-Risk Areas
1. **Socket.IO room management** - Critical for real-time updates
   - Mitigation: Preserve exact logic, test with actual training/inference
2. **Python process spawning** - Complex error handling
   - Mitigation: Keep processErrorHandler unchanged, extensive logging
3. **File path resolution** - Session-scoped paths
   - Mitigation: Centralize in pathHelpers, thorough testing
4. **ML pipeline** - Most complex workflow
   - Mitigation: E2E tests, manual verification

### Rollback Strategy
- Git tag each phase completion: `refactor-phase-1`, `refactor-phase-2`, etc.
- Keep `server.js.backup` until Phase 7 complete
- Quick rollback: `git checkout <phase-tag>`
- Session/user data backups before each phase

### Deployment Strategy
- Deploy each phase to staging first
- Manual smoke tests after each phase
- Production deployment on weekends (lower traffic)
- Monitor error rates for 48 hours post-deployment

---

## Success Metrics

### Quantitative
- **server.js:** 3012 → ~150 lines (95% reduction)
- **Largest file:** <500 lines per file
- **Test coverage:** >70% overall
- **API response times:** No regression (±5%)
- **Build time:** No increase

### Qualitative
- ✅ New developers understand structure in <1 hour
- ✅ Adding new route takes <15 minutes
- ✅ Services testable in isolation
- ✅ No breaking changes to API contracts

---

## Critical Files

### Primary Source (to be refactored)
- **`server.js:1-3012`** - All routes, middleware, helpers, Socket.IO logic

### Supporting Modules (reference patterns)
- **`WorkspaceManager.js:1-751`** - Example of well-structured service
- **`utils/processErrorHandler.js:1-197`** - Error handling to preserve
- **`activityLogger.js:1-90`** - Logging integration pattern
- **`utils/logger.js:1-90`** - Logging infrastructure
- **`utils/envLoader.js:1-124`** - Config pattern

### Configuration
- **`package.json`** - Dependencies, scripts
- **`.env`** - Environment variables (SESSION_SECRET, PORT, DEBUG)

---

## Post-Refactoring Improvements (Future Phases)

Once refactoring complete, consider:
1. Add request validation (express-validator/Joi)
2. Implement dependency injection for services
3. Add API documentation (Swagger/OpenAPI)
4. Implement rate limiting
5. Replace users.json with SQLite/PostgreSQL
6. Add job queue for ML tasks (Bull, Bee-Queue)
7. Health check endpoint (`/health`)
8. Structured logging (Winston, Pino)

---

## Timeline Summary

| Phase | Duration | Effort | Complexity |
|-------|----------|--------|------------|
| 1. Foundation | 3-4 days | 16-20h | LOW |
| 2. Middleware | 2-3 days | 10-12h | LOW |
| 3. Socket.IO | 2-3 days | 12-15h | MEDIUM |
| 4. Services | 5-6 days | 25-30h | HIGH |
| 5. Routes | 6-8 days | 30-40h | HIGH |
| 6. Python | 3-4 days | 15-20h | MEDIUM |
| 7. Finalization | 3-4 days | 15-20h | LOW |
| **TOTAL** | **24-32 days** | **123-157h** | - |

**Assumptions:** Part-time developer (4-5h/day), includes testing & documentation

---

## Implementation Notes

### Code Patterns to Follow

**Service Constructor Pattern:**
```javascript
class TrainingService {
  constructor(sessionTracker, workspaceManager, activityLogger, io) {
    this.sessions = sessionTracker;
    this.workspace = workspaceManager;
    this.logger = activityLogger;
    this.io = io;
  }

  async startTraining(params) {
    // Business logic here
  }
}
```

**Route Module Pattern:**
```javascript
const express = require('express');
const router = express.Router();
const TrainingService = require('../services/TrainingService');

router.post('/start-training', async (req, res) => {
  try {
    const result = await TrainingService.startTraining(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### Backward Compatibility Rules
1. Never change API response schemas
2. Preserve all existing endpoints
3. Maintain session structure
4. Keep Python communication protocol unchanged
5. Don't modify WorkspaceManager, activityLogger, utils/* modules

---

## Ready to Start Implementation

This plan provides a battle-tested, incremental approach to refactoring the monolithic server.js file. Each phase is deployable independently, minimizing risk and allowing course corrections.

**Next Steps:**
1. Review and approve this plan
2. Create feature branch: `git checkout -b refactor/server-modularization`
3. Start with Phase 1 (Foundation Setup)
4. Deploy to staging after each phase
5. Request code review before moving to next phase
