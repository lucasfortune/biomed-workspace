# Authentication Architecture

**Last Updated:** 2026-09-07 (v1.5.0 data-model consolidation)
**Status:** ✅ Complete
**Target Audience:** Developers, security engineers, administrators

---

## Introduction

This document describes the authentication and authorization architecture of the Biomedical Image Processing Workspace. The system uses **session-based authentication** with a **three-tier permission system** and **admin approval workflow**.

### What This Document Covers

- Authentication system design (session-based)
- Three-tier middleware levels (requireAuth, requireApproved, requireAdmin)
- User lifecycle (registration → pending → approved/rejected)
- Session management and security
- Admin approval workflow
- Password security (bcrypt)
- File isolation and permissions
- CLI user management

### Who Should Read This

- **Developers** - Implementing authentication checks
- **Security engineers** - Evaluating security posture
- **Administrators** - Understanding user management
- **New contributors** - Learning access control patterns

### Related Documentation

- [API Endpoints](../reference/API_ENDPOINTS.md) - Auth endpoint details
- [Architecture Overview](OVERVIEW.md) - System architecture
- [ADR-003](../decisions/003_session_based_isolation.md) - Session-based isolation

---

## System Overview

### Authentication Strategy

**Session-Based Authentication**
- Not JWT/token-based
- Server-side session storage (file-based)
- Cookie-based session identification
- 48-hour session lifetime (`RETENTION_HOURS` in `src/config/constants.js`) - the same schedule drives workspace cleanup, so login lifetime and data lifetime match

**Why Session-Based?**
- Simple implementation
- Server controls sessions
- Easy to revoke
- Suitable for web application

---

### Three-Tier Permission System

```
┌─────────────────────────────────────────────────────────────┐
│               Three-Tier Access Control                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Tier 1: requireAuth (Basic Authentication)                │
│  ├─ Allows: Logged-in users (pending OR approved)          │
│  ├─ Use case: View interface, use test data                │
│  └─ Protected: /workspace, most API endpoints              │
│                                                             │
│  Tier 2: requireApproved (Full Access)                     │
│  ├─ Allows: Approved users (status === 'active')           │
│  ├─ Use case: Upload custom files, import models, train    │
│  └─ Protected: /upload-data, /import-pretrained-model      │
│                                                             │
│  Tier 3: requireAdmin (Admin-Only)                         │
│  ├─ Allows: Administrators (isAdmin === true)              │
│  ├─ Use case: User approval, system admin                  │
│  └─ Protected: /admin, /admin/*, user management           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication Middleware

### Implementation

**File:** `src/middleware/auth.middleware.js`

---

### 1. requireAuth (Tier 1)

**Purpose:** Basic authentication - allows any logged-in user

```javascript
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({
    error: 'Authentication required',
    authenticated: false
  });
}
```

**Allows:**
- ✅ Pending users (`status: 'pending'`)
- ✅ Approved users (`status: 'active'`)

**Blocks:**
- ❌ Not logged in
- ❌ No session
- ❌ Rejected users (can't log in)

**Protected Routes:**
- `GET /workspace` - Workspace application
- `/workspaces/:sessionId/uploads/*`, `/workspaces/:sessionId/results/*` - Session-scoped workspace file serving (session ownership verified; there are no unauthenticated `/uploads`, `/results` or `/models` mounts)
- Most API endpoints

**Use Cases:**
- View application interface
- Work with the seeded sample data (every new workspace is seeded with a built-in raw + annotation sample pair)
- Browse UI
- Check auth status

---

### 2. requireApproved (Tier 2)

**Purpose:** Full access - requires approved status

```javascript
function requireApproved(req, res, next) {
  if (req.session && req.session.user && req.session.user.status === 'active') {
    return next();
  }
  res.status(403).json({
    error: 'Account approval required'
  });
}
```

**Allows:**
- ✅ Approved users only (`status: 'active'`)

**Blocks:**
- ❌ Pending users (`status: 'pending'`)
- ❌ Rejected users
- ❌ Not logged in

**Protected Routes:**
- `/upload-data` (custom file uploads)
- `/import-pretrained-model` (model imports)
- Other custom file operations

**Use Cases:**
- Upload custom TIFF files
- Import pretrained models
- Train models on custom data
- Full workflow access

**Error Response:**
```json
{
  "error": "Account approval required"
}
```

---

### 3. requireAdmin (Tier 3)

**Purpose:** Admin-only access

```javascript
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) {
    return next();
  }
  res.status(403).json({
    error: 'Admin access required'
  });
}
```

**Allows:**
- ✅ Admin users only (`isAdmin: true`)

**Blocks:**
- ❌ Non-admin users
- ❌ Pending users
- ❌ Not logged in

**Protected Routes** (admin API lives in `src/routes/admin.routes.js`, mounted at `/admin`):
- `GET /admin` - Admin dashboard
- `GET /admin/users` - User list
- `GET /admin/pending-users` - Pending user list
- `POST /admin/approve-user` - Approve user (body: `{ username }`)
- `POST /admin/reject-user` - Reject user (body: `{ username }`)
- `GET /admin/active-sessions` - Session monitoring
- `GET /admin/activity-logs` - Activity logs

**Use Cases:**
- User approval/rejection
- User management
- System monitoring
- Activity log review

---

## User Lifecycle

### Complete Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Lifecycle                           │
└─────────────────────────────────────────────────────────────┘

1. Registration
   │
   ├─► User fills registration form
   ├─► Server validates input
   ├─► Password hashed with bcrypt (10 rounds)
   ├─► User created with status='pending'
   └─► Activity logged
   │
   ▼

2. Pending State
   │
   ├─► Can log in
   ├─► Can view interface (requireAuth)
   ├─► Can use the seeded sample data
   ├─► Cannot upload custom files (requireApproved)
   └─► Cannot import models (requireApproved)
   │
   ▼

3. Admin Review
   │
   ├─► Admin views pending users
   ├─► Admin reviews user details
   └─► Admin decision:
         │
         ├─► APPROVE → status='active'
         │       │
         │       ▼
         │   4a. Active State
         │       │
         │       ├─► Full access
         │       ├─► Can upload custom files
         │       ├─► Can import models
         │       └─► Can use all features
         │
         └─► REJECT → status='rejected'
                 │
                 ▼
             4b. Rejected State
                 │
                 ├─► Cannot log in
                 ├─► Login blocked with message
                 └─► Must contact admin
```

---

### Registration Flow

**Endpoint:** `POST /register`
**File:** `src/routes/auth.routes.js`

**Request:**
```json
{
  "username": "john",
  "password": "secret123",
  "fullName": "John Doe",
  "email": "john@example.com",
  "institution": "University of Science"
}
```

**Process:**
1. Validate all fields present
2. Check username not already taken
3. Hash password with bcrypt (10 rounds)
4. Create user object:
   ```javascript
   {
     id: generateUserId(),
     username,
     passwordHash,
     fullName,
     email,
     institution,
     status: 'pending',        // Default: pending
     isAdmin: false,           // Default: not admin
     createdAt: new Date().toISOString()
   }
   ```
5. Save to `users.json`
6. Log registration activity
7. Return success

**Response (Success):**
```json
{
  "success": true,
  "message": "Registration successful! Your account is pending approval.",
  "user": {
    "username": "john",
    "fullName": "John Doe",
    "status": "pending"
  }
}
```

**Response (Error - Username Exists):**
```json
{
  "success": false,
  "error": "Username already exists"
}
```

**Security Measures:**
- Password never stored in plaintext
- bcrypt hash (10 rounds)
- Unique username validation
- All fields required
- Activity logging

---

### Login Flow

**Endpoint:** `POST /login`
**File:** `src/routes/auth.routes.js`

**Request:**
```json
{
  "username": "john",
  "password": "secret123"
}
```

**Process:**
1. Validate username and password provided
2. Find user in `users.json`
3. Verify password with bcrypt.compare()
4. Check if user status is 'rejected' (block login)
5. Create session:
   ```javascript
   req.session.user = {
     id: user.id,
     username: user.username,
     fullName: user.fullName,
     email: user.email,
     institution: user.institution,
     status: user.status,        // 'pending' or 'active'
     isAdmin: user.isAdmin
   };
   ```
6. Log successful login
7. Return success

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "username": "john",
    "fullName": "John Doe",
    "status": "pending",
    "isAdmin": false
  },
  "redirect": "/"
}
```

**Response (Error - Invalid Credentials):**
```json
{
  "success": false,
  "error": "Invalid username or password"
}
```

**Response (Error - Rejected User):**
```json
{
  "success": false,
  "error": "Your account has been rejected. Please contact the administrator."
}
```

**Security Measures:**
- Password comparison with bcrypt
- Generic error message (doesn't reveal if username exists)
- Rejected users blocked from login
- Activity logging (success/failure)
- Session-based authentication

---

### Approval Flow (Admin)

**Approve Endpoint:** `POST /admin/approve-user` (body: `{ username }`)
**Reject Endpoint:** `POST /admin/reject-user` (body: `{ username }`)
**Middleware:** `requireAdmin`

**Approve Process:**
1. Admin navigates to `/admin`
2. Views pending users list
3. Clicks "Approve" on user
4. Server updates user:
   ```javascript
   user.status = 'active';
   user.approvedAt = new Date().toISOString();
   ```
5. Saves to `users.json`
6. Logs activity
7. Returns success

**Reject Process:**
1. Admin clicks "Reject" on user
2. Server updates user:
   ```javascript
   user.status = 'rejected';
   user.rejectedAt = new Date().toISOString();
   ```
3. Saves to `users.json`
4. Logs activity
5. User can no longer log in

---

### Logout Flow

**Endpoint:** `POST /logout`
**Body (optional):** `{ "deleteWorkspace": true }`

**Process:**
1. If `deleteWorkspace === true` (the UI shows a confirmation dialog first), the user's workspace directory (`workspaces/<sessionId>/`) is deleted via `WorkspaceManager.deleteWorkspace()` and in-memory session tracking is cleaned up
2. The server-side session is destroyed and the cookie cleared

**Behavior:**
- Destroys server-side session
- Clears session cookie
- Optionally deletes the workspace (after a confirmation dialog)
- User must log in again

**Note:** There is no `POST /reset-session` endpoint anymore - logout + login is the reset.

---

## Session Management

### Session Configuration

**File:** `src/middleware/session.middleware.js` (using `SESSION_CONFIG` from `src/config/constants.js`)

```javascript
// src/middleware/session.middleware.js
return session({
  store: new FileStore({
    path: sessionsDir,               // defaults to './sessions'
    ttl: SESSION_CONFIG.ttl,         // RETENTION_HOURS * 3600 = 48 h
    retries: 0,
    secret: env.SESSION_SECRET
  }),
  secret: env.SESSION_SECRET,        // required; throws if missing
  resave: false,
  saveUninitialized: false,          // no sessions for unauthenticated users
  cookie: {
    secure: isProduction,            // HTTPS required in production
    httpOnly: true,                  // no client-side JS access
    sameSite: 'lax',                 // CSRF protection
    maxAge: SESSION_CONFIG.cookieMaxAge  // RETENTION_HOURS * 3600 * 1000 = 48 h
  }
});
```

**Key Settings:**
- **Storage:** File-based (`session-file-store`)
- **Location:** `./sessions/` directory (under `DATA_DIR`)
- **Lifetime (TTL) / Cookie MaxAge:** 48 h - both derive from `RETENTION_HOURS` (`src/config/constants.js`), the same constant that drives the workspace cleanup grace period
- **Secret:** `SESSION_SECRET` environment variable (required - the middleware throws without it)
- **Secure:** enabled automatically when `NODE_ENV === 'production'`

The Socket.IO server shares this same session middleware (`io.engine.use(sessionMiddleware)` in `server.js`), so socket connections carry the express session and job-room joins can be ownership-checked (see `src/sockets/index.js`).

---

### Session Data Structure

```javascript
req.session = {
  // Added by express-session
  id: 'abc123...',               // Unique session ID
  cookie: {
    originalMaxAge: 172800000,   // 48 h in ms
    expires: '2026-09-09T...',
    secure: false,
    httpOnly: true,
    path: '/'
  },

  // Added by authentication (login)
  user: {
    id: 'user123',
    username: 'john',
    fullName: 'John Doe',
    email: 'john@example.com',
    institution: 'University of Science',
    status: 'active',            // 'pending' | 'active' | 'rejected'
    isAdmin: false
  },

  // Added by application (file uploads, training, etc.)
  uploadedFiles: {
    training: 'workspaces/abc123/uploads/training.tif',
    annotation: 'workspaces/abc123/uploads/annotation.tif',
    inference: 'workspaces/abc123/uploads/inference.tif'
  },
  trainingConfig: { ... },
  currentTraining: 'training_uuid',
  importedModel: { ... }
};
```

---

### Session Persistence

**File Storage:**
- Sessions stored in `./sessions/` directory
- Each session is a JSON file: `./sessions/abc123.json`
- Survives server restarts
- TTL managed by `session-file-store`

**Production Consideration:**
- Consider Redis for session storage
- Better performance at scale
- Distributed session support
- Easier session management

**Example (Redis):**
```javascript
const RedisStore = require('connect-redis')(session);
const redisClient = require('redis').createClient();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  // ...
}));
```

---

## Password Security

### Hashing with bcrypt

**Library:** bcrypt
**Rounds:** 10 (default)

**Registration:**
```javascript
const passwordHash = await bcrypt.hash(password, 10);
// Stores hash, never plaintext
```

**Login:**
```javascript
const passwordMatch = await bcrypt.compare(password, user.passwordHash);
if (!passwordMatch) {
  return res.status(401).json({ error: 'Invalid credentials' });
}
```

**Why bcrypt?**
- Industry standard for password hashing
- Adaptive hashing (configurable rounds)
- Salt automatically included
- Resistant to rainbow table attacks
- Designed to be slow (prevents brute force)

**Security Best Practices:**
- ✅ Never log passwords
- ✅ Never store plaintext passwords
- ✅ Never return passwords in API responses
- ✅ Use environment variables for secrets
- ✅ Use 10+ rounds for bcrypt
- ❌ Don't reveal if username exists in error messages

---

## File Isolation and Security

### Session-Based File Isolation

**Pattern:** ALL user data lives inside the per-session workspace directory

```
workspaces/<sessionId>/
   ├─ metadata.json                       # Single persistent manifest
   ├─ uploads/                            # Uploads + seeded samples
   ├─ results/<module>/<jobId>/           # e.g. results/preprocess/<id>/,
   │                                      #      results/segmentation/<trainingId>/
   ├─ models/segmentation/<trainingId>/
   │    ├─ best_model.pth
   │    ├─ config.json
   │    └─ results.json
   ├─ annotations/  unfinished_annotations/
   └─ .thumbnails/ .slices/ .mesh-previews/ .preprocess/ .segcleanup/  (caches)
```

**Security Implications:**
- Session ID as source of truth for file access
- No cross-session file access
- File paths validated against session
- Workspace files are served **only** via authenticated, session-scoped routes (`/workspaces/:sessionId/...` with ownership checks in `static.routes.js`); the legacy unauthenticated `/uploads`, `/results` and `/models` static mounts are removed
- Socket.IO job-room joins are ownership-checked (`isRoomJoinAllowed` in `src/sockets/index.js` + `SessionTracker.getJobOwner()`); job status/cancel/download HTTP endpoints also verify ownership and return 404 for other sessions' jobs
- Workspace restore streams the uploaded ZIP from a temp file on disk (`DATA_PATHS.tmp`) with zip-slip sanitization (no in-memory buffering)

See [ADR-003: Session-Based Isolation](../decisions/003_session_based_isolation.md).

---

### Permission Checks on File Operations

**Upload Custom Files:**
```javascript
app.post('/upload-data', requireApproved, upload.fields([...]), (req, res) => {
  // Only approved users can upload custom files
  // Pending users blocked by requireApproved middleware
});
```

**Import Models:**
```javascript
app.post('/import-pretrained-model', requireApproved, uploadImport.array('files', 2), (req, res) => {
  // Only approved users can import models
});
```

**Inline Checks (Additional):**
Some routes additionally verify `req.session.user.status === 'active'` inline before accepting custom data; seeded sample files require no such check because they are already part of the workspace.

---

### Seeded Sample Data (Pending Users)

**Pattern:** Every new workspace is seeded with built-in sample files; pending users can use them

**Sample Source:** `test_data/` (copied on workspace creation by `WorkspaceManager.seedSampleData()`)
- `trypB_testData_training.tif` → seeded as `uploads/raw/sample_raw.tif`
- `trypB_testData_annotations.tif` → seeded as `uploads/annotations/sample_annotation.tif`

**How it Works:**
1. On workspace creation, the matched raw + annotation sample pair is copied into `workspaces/<sessionId>/uploads/`
2. The samples are registered in `metadata.json` exactly like ordinary uploads
3. They appear in file selectors and the file browser as normal workspace files (there is no per-request "test data" checkbox or `isTestData` flag anymore)
4. All modules work on them through the normal workflow

**Benefits:**
- Pending users can explore the whole pipeline without upload rights
- Learn workflow before approval
- No risk of malicious file uploads
- Admin can approve based on usage

---

## Admin Dashboard

### Admin Functions

**Route:** `GET /admin` (requireAdmin)
**Page:** `public/admin.html`

**Features:**
- View all users (pending, active, rejected)
- Approve pending users
- Reject pending users
- Monitor active sessions
- View activity logs
- User statistics

---

### Admin Endpoints

**Get All Users:**
```javascript
GET /admin/users (requireAdmin)

Response:
{
  "users": [
    {
      "id": "...",
      "username": "john",
      "fullName": "John Doe",
      "email": "john@example.com",
      "institution": "University",
      "status": "pending",
      "isAdmin": false,
      "createdAt": "2025-11-27T..."
    }
  ]
}
```

**Approve User:**
```javascript
POST /admin/approve-user (requireAdmin, body: { username })

Response:
{
  "success": true,
  "message": "User john approved successfully",
  "user": {
    "username": "john",
    "status": "active"
  }
}
```

**Reject User:**
```javascript
POST /admin/reject-user (requireAdmin, body: { username })

Response:
{
  "success": true,
  "message": "User john rejected successfully",
  "user": {
    "username": "john",
    "status": "rejected"
  }
}
```

**Active Sessions:**
```javascript
GET /admin/active-sessions (requireAdmin)

Response:
{
  "sessions": [
    {
      "sessionId": "abc123",
      "user": "john",
      "loginTime": "2025-11-27T10:00:00Z",
      "lastActivity": "2025-11-27T12:30:00Z"
    }
  ]
}
```

**Activity Logs:**
```javascript
GET /admin/activity-logs (requireAdmin)

Response:
{
  "logs": [
    {
      "timestamp": "2025-11-27T10:00:00Z",
      "type": "login",
      "username": "john",
      "success": true
    },
    {
      "timestamp": "2025-11-27T10:05:00Z",
      "type": "registration",
      "username": "jane",
      "institution": "MIT"
    }
  ]
}
```

---

## CLI User Management

### manageUsers.js

**Purpose:** Command-line tool for user administration

**File:** `manageUsers.js`

**Commands:**

#### Create Admin User

```bash
node manageUsers.js add-admin <username> <password> <fullName> <email> <institution>

# Example:
node manageUsers.js add-admin admin password123 "Admin User" admin@example.com "Admin"
```

**Use Case:** Bootstrap first admin account

---

#### List All Users

```bash
node manageUsers.js list
```

**Output:**
```
All users:
┌─────────┬──────────┬────────────┬─────────────────┬───────────┬─────────┐
│ Username│ Full Name│ Email      │ Institution     │ Status    │ Admin   │
├─────────┼──────────┼────────────┼─────────────────┼───────────┼─────────┤
│ admin   │ Admin    │ admin@...  │ Admin           │ active    │ Yes     │
│ john    │ John Doe │ john@...   │ University      │ pending   │ No      │
└─────────┴──────────┴────────────┴─────────────────┴───────────┴─────────┘
```

---

#### List Pending Users

```bash
node manageUsers.js list-pending
```

**Output:**
```
Pending users (awaiting approval):
┌─────────┬──────────┬────────────┬─────────────────┬────────────────┐
│ Username│ Full Name│ Email      │ Institution     │ Registered     │
├─────────┼──────────┼────────────┼─────────────────┼────────────────┤
│ john    │ John Doe │ john@...   │ University      │ 2025-11-27     │
└─────────┴──────────┴────────────┴─────────────────┴────────────────┘
```

---

#### Approve User

```bash
node manageUsers.js approve <username>

# Example:
node manageUsers.js approve john
```

**Output:**
```
✅ User 'john' approved successfully
```

---

#### Reject User

```bash
node manageUsers.js reject <username>

# Example:
node manageUsers.js reject jane
```

**Output:**
```
❌ User 'jane' rejected successfully
```

---

#### Reset Password

```bash
node manageUsers.js reset-password <username> <newPassword>

# Example:
node manageUsers.js reset-password john newpassword123
```

**Output:**
```
✅ Password reset successfully for user 'john'
```

---

## Security Considerations

### Current Security Measures

**Password Security:**
- ✅ bcrypt hashing (10 rounds)
- ✅ No plaintext storage
- ✅ Salt automatically included
- ✅ Never logged or returned in responses

**Session Security:**
- ✅ Secure session storage (file-based)
- ✅ HttpOnly cookies (prevent XSS), `sameSite: 'lax'`
- ✅ Session expiry (48 h, matching workspace retention)
- ✅ Session secret (required environment variable)
- ✅ Socket.IO shares the session middleware; job-room joins are ownership-checked

**File Security:**
- ✅ Session-based isolation
- ✅ Path validation
- ✅ No cross-session access
- ✅ File type validation (TIFF, .pth, .json)
- ✅ File size limits (200MB for TIFF, 2GB for models)

**Authorization:**
- ✅ Three-tier middleware system
- ✅ Admin approval workflow
- ✅ Pending user restrictions
- ✅ Activity logging

---

### Production Recommendations

**Environment Variables:**
```bash
# .env
SESSION_SECRET=your-strong-random-secret-here
NODE_ENV=production
PORT=3000
```

**HTTPS (Required for Production):**
```javascript
cookie: {
  secure: true,  // Enable for HTTPS
  httpOnly: true,
  sameSite: 'strict'
}
```

**Session Storage (Redis):**
```javascript
const RedisStore = require('connect-redis')(session);
const redis = require('redis').createClient();

app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: SESSION_CONFIG.cookieMaxAge  // keep tied to RETENTION_HOURS
  }
}));
```

**Rate Limiting:**
```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later'
});

app.post('/login', loginLimiter, async (req, res) => {
  // Login logic
});
```

**CSRF Protection:**
```javascript
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

app.use(csrfProtection);
```

**Security Headers:**
```javascript
const helmet = require('helmet');
app.use(helmet());
```

---

### Future Enhancements

**Planned (Phase 4+):**
- Two-factor authentication (2FA)
- OAuth integration (Google, GitHub)
- Password reset flow (email-based)
- Email verification on registration
- Role-based access control (RBAC)
- Audit logging (detailed user actions)
- Session IP validation
- Suspicious activity detection

---

## Best Practices

### For Developers

**Authentication Checks:**
```javascript
// ✅ Good - Use appropriate middleware
app.post('/upload-data', requireApproved, (req, res) => {
  // Only approved users reach here
});

// ❌ Bad - Inline check after processing
app.post('/upload-data', requireAuth, (req, res) => {
  // Process file...
  if (req.session.user.status !== 'active') {
    return res.status(403).json({ error: 'Not approved' });
  }
  // Too late! File already processed
});
```

**Password Handling:**
```javascript
// ✅ Good
const passwordHash = await bcrypt.hash(password, 10);
user.passwordHash = passwordHash;
delete user.password; // Never store plaintext

// ❌ Bad
user.password = password; // Never store plaintext!
```

**Session Access:**
```javascript
// ✅ Good - Check session exists
if (req.session && req.session.user) {
  const username = req.session.user.username;
}

// ❌ Bad - Potential undefined error
const username = req.session.user.username; // May crash
```

**Activity Logging:**
```javascript
// ✅ Good - Log important actions
activityLogger.logLogin(username, success);
activityLogger.logFileUpload(username, filename);

// ❌ Bad - Log sensitive data
console.log('Password:', password); // NEVER log passwords!
```

---

## Related Documentation

### Architecture

- [Architecture Overview](OVERVIEW.md) - System architecture
- [State Architecture](STATE_ARCHITECTURE.md) - State management

### Reference

- [API Endpoints](../reference/API_ENDPOINTS.md) - Complete endpoint catalog (includes auth routes)

### Decisions

- [ADR-003](../decisions/003_session_based_isolation.md) - Session-based isolation rationale

### Guides

- [Getting Started](../guides/GETTING_STARTED.md) - Initial setup
- [Troubleshooting](../guides/TROUBLESHOOTING.md) - Common issues

---

**Navigation:**
← [Module Architecture](MODULE_ARCHITECTURE.md) | [Architecture Docs](.) | [ADR-001](../decisions/001_vanilla_js_over_framework.md) →

---

**Document Status:** ✅ Complete
**Last Updated:** 2026-09-07 (v1.5.0)
**Maintained By:** Development Team
