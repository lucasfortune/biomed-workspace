// Load environment configuration FIRST (before any other requires)
const { initializeEnvironment } = require('./utils/envLoader');
const env = initializeEnvironment();

// Load logger (after env is initialized)
const logger = require('./utils/logger');

const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const uuid = require('uuid');
const archiver = require('archiver');
const bcrypt = require('bcrypt');
const activityLogger = require('./activityLogger');
const WorkspaceManager = require('./WorkspaceManager');
const { attachErrorHandler, createTrainingErrorHandler, createInferenceErrorHandler } = require('./utils/processErrorHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = env.PORT;

// Python interpreter configuration - use venv Python to ensure all dependencies are available
const PYTHON_PATH = path.join(__dirname, 'venv', 'bin', 'python');

// Validate Python interpreter exists at startup
if (!fs.existsSync(PYTHON_PATH)) {
  logger.error('FATAL: Python interpreter not found at:', PYTHON_PATH);
  logger.error('Please set up the virtual environment:');
  logger.error('  1. Run: python -m venv venv');
  logger.error('  2. Run: source venv/bin/activate');
  logger.error('  3. Run: pip install -r requirements.txt');
  process.exit(1);
}
logger.info('Python interpreter found at:', PYTHON_PATH);

// Initialize WorkspaceManager
const workspaceManager = new WorkspaceManager();

/**
 * Helper function to track module outputs in file browser
 * @param {string} sessionId - Session ID
 * @param {string} filePath - Absolute path to the output file
 * @param {string} category - File category (models, segmentations, denoised, etc.)
 * @param {object} metadata - Optional metadata about the file
 * @returns {Promise<object>} File entry object
 */
async function trackModuleOutput(sessionId, filePath, category, metadata = {}) {
  try {
    const fileName = path.basename(filePath);
    const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

    // Get relative path from workspace root
    const workspacePath = workspaceManager.getWorkspacePath(sessionId);
    const relativePath = path.relative(workspacePath, filePath);

    const fileEntry = workspaceManager.addFileToMetadata(sessionId, {
      name: fileName,
      path: relativePath,
      category: category,
      size: fileSize,
      folderId: null
    });

    logger.debug(`Tracked ${category} output:`, fileName);

    // Generate thumbnail for TIFF files (async, don't wait)
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.tif' || ext === '.tiff') {
      const { spawn } = require('child_process');
      const thumbnailsDir = path.join(workspacePath, '.thumbnails');
      if (!fs.existsSync(thumbnailsDir)) {
        fs.mkdirSync(thumbnailsDir, { recursive: true });
      }

      const thumbnailPath = path.join(thumbnailsDir, `${fileEntry.id}.jpg`);

      spawn(PYTHON_PATH, [
        'python/generate_thumbnail.py',
        filePath,
        thumbnailPath
      ]).on('close', async (code) => {
        if (code === 0) {
          await workspaceManager.setThumbnailPath(
            sessionId,
            fileEntry.id,
            `.thumbnails/${fileEntry.id}.jpg`
          );
        }
      });
    }

    return fileEntry;
  } catch (error) {
    logger.error('Error tracking module output:', error);
    return null;
  }
}

/**
 * Convert inference result paths from absolute to web-accessible paths
 * @param {object} result - Result object with file paths
 * @param {string} sessionId - Session ID
 * @param {string} workspacePath - Workspace root path
 * @returns {object} Result object with converted paths
 */
function convertResultPathsForWeb(result, sessionId, workspacePath) {
  const resultsDir = path.join(workspacePath, 'results');
  const convertedResult = { ...result };

  if (result.output_path) {
    convertedResult.output_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.output_path);
  }
  if (result.metadata_path) {
    convertedResult.metadata_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.metadata_path);
  }
  if (result.visualization_path) {
    convertedResult.visualization_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.visualization_path);
  }
  if (result.original_data_overlay_path) {
    convertedResult.original_data_overlay_path = `/workspaces/${sessionId}/results/` + path.relative(resultsDir, result.original_data_overlay_path);
  }

  return convertedResult;
}

/**
 * Track inference result files in workspace metadata (SINGLE tracking point)
 * @param {object} result - Result object with file paths (absolute paths)
 * @param {string} inferenceId - Inference ID
 * @param {string} sessionId - Session ID
 * @param {string} source - Source of result (FINAL_RESULT, BUFFER_JSON, MANUAL)
 * @returns {Promise<void>}
 */
async function trackInferenceResults(result, inferenceId, sessionId, source) {
  if (!result || !result.success) {
    logger.debug(`[TRACKING] Skipping tracking - result not successful (source: ${source})`);
    return;
  }

  logger.debug(`[TRACKING] Tracking inference results from ${source} for inference ${inferenceId}`);

  const filesToTrack = [
    { path: result.output_path, category: 'segmentations' },
    { path: result.metadata_path, category: 'segmentations' },
    { path: result.visualization_path, category: 'segmentations' }
  ];

  for (const file of filesToTrack) {
    if (file.path && fs.existsSync(file.path)) {
      await trackModuleOutput(sessionId, file.path, file.category);
      logger.debug(`[TRACKING] Tracked ${path.basename(file.path)} (${file.category})`);
    }
  }

  logger.debug(`[TRACKING] Completed tracking for inference ${inferenceId} (source: ${source})`);
}

// Session configuration with file-based storage for persistence
app.use(session({
  store: new FileStore({
    path: './sessions',
    ttl: 86400 * 7, // 7 days
    retries: 0,
    secret: env.SESSION_SECRET
  }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 86400000 * 7 // 7 days
  }
}));

// Middleware
app.use(cors());
app.use(express.json());

// Serve welcome page as the default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

// Serve the main app at /app route (authentication required)
app.get('/app', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve test data files
app.get('/test_data/:filename', requireAuth, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'test_data', filename);
  
  // Check if file exists
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Test file not found');
  }
});

// Keep the existing static middleware
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const sessionId = req.session.id;

    // NEW: Use workspace directory structure
    const workspacePath = workspaceManager.getWorkspacePath(sessionId);

    // Initialize workspace if it doesn't exist
    if (!fs.existsSync(workspacePath)) {
      logger.debug('[Multer] Initializing workspace for session:', sessionId);
      workspaceManager.initializeWorkspace(sessionId);
    }

    // Determine subdirectory based on field name
    let subdir = 'uploads/raw'; // Default

    if (file.fieldname === 'raw_images') {
      subdir = 'uploads/raw';
    } else if (file.fieldname === 'annotations') {
      subdir = 'uploads/annotations';
    } else if (file.fieldname === 'inference_data') {
      subdir = 'uploads/inference_data';
    } else if (file.fieldname === 'file') {
      // For workspace upload endpoint, use category from body if available
      subdir = 'uploads/raw'; // Will be moved if needed
    }

    logger.debug('[Multer] Field name:', file.fieldname, '→ Directory:', subdir);

    const uploadDir = path.join(workspacePath, subdir);

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    logger.debug('[Multer] Upload destination:', uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept only TIFF files
    if (file.mimetype === 'image/tiff' || file.originalname.toLowerCase().endsWith('.tif')) {
      cb(null, true);
    } else {
      cb(new Error('Only TIFF files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB limit for TIFF stacks
  }
});
// NEW: Separate multer configuration for importing pre-trained models
const uploadImport = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept .pth (PyTorch model) and .json (config) files
    const fileName = file.originalname.toLowerCase();
    if (fileName.endsWith('.pth') || fileName.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only .pth (model) and .json (config) files are allowed for import!'), false);
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit for model files (they can be quite large)
    files: 2 // Maximum 2 files (model + config)
  }
});

// Store active training sessions and inference sessions
const trainingSessions = new Map();
const inferenceSessions = new Map();

// Ensure directories exist
const dirs = ['uploads', 'results', 'models', 'public'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ==============================================================================
// AUTHENTICATION MIDDLEWARE
// ==============================================================================

/**
 * Basic authentication - allows pending & approved users
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required', authenticated: false });
}

/**
 * Requires approved status - full access
 */
function requireApproved(req, res, next) {
  if (req.session && req.session.user && req.session.user.status === 'active') {
    return next();
  }
  res.status(403).json({ error: 'Account approval required' });
}

/**
 * Admin-only access
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
}

// ==============================================================================
// USER MANAGEMENT FUNCTIONS
// ==============================================================================

const usersFilePath = path.join(__dirname, 'users.json');

/**
 * Load users from file
 */
function loadUsers() {
  if (!fs.existsSync(usersFilePath)) {
    return { users: [] };
  }
  const data = fs.readFileSync(usersFilePath, 'utf8');
  return JSON.parse(data);
}

/**
 * Save users to file
 */
function saveUsers(usersData) {
  fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
}

/**
 * Generate unique user ID
 */
function generateUserId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/**
 * Find user by username
 */
function findUserByUsername(username) {
  const usersData = loadUsers();
  return usersData.users.find(u => u.username === username);
}

// ==============================================================================
// AUTHENTICATION ROUTES
// ==============================================================================

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve register page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Serve admin page
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Check authentication status
app.get('/check-auth', (req, res) => {
  if (req.session && req.session.user) {
    res.json({
      authenticated: true,
      user: {
        username: req.session.user.username,
        fullName: req.session.user.fullName,
        email: req.session.user.email,
        institution: req.session.user.institution,
        status: req.session.user.status,
        isAdmin: req.session.user.isAdmin
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Register new user
app.post('/register', async (req, res) => {
  try {
    const { username, password, fullName, email, institution } = req.body;

    // Validation
    if (!username || !password || !fullName || !email || !institution) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Check if username already exists
    const existingUser = findUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create new user (pending status by default)
    const newUser = {
      id: generateUserId(),
      username,
      passwordHash,
      fullName,
      email,
      institution,
      status: 'pending',
      isAdmin: false,
      createdAt: new Date().toISOString()
    };

    // Save user
    const usersData = loadUsers();
    usersData.users.push(newUser);
    saveUsers(usersData);

    // Log registration
    activityLogger.logRegistration(username, institution);

    logger.info(`New user registered: ${username} (pending approval)`);

    res.json({
      success: true,
      message: 'Registration successful! Your account is pending approval.',
      user: {
        username: newUser.username,
        fullName: newUser.fullName,
        status: newUser.status
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
});

// Login
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Find user
    const user = findUserByUsername(username);
    if (!user) {
      activityLogger.logLogin(username, false);
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      activityLogger.logLogin(username, false);
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    // Check if user is rejected
    if (user.status === 'rejected') {
      return res.status(403).json({
        success: false,
        error: 'Your account has been rejected. Please contact the administrator.'
      });
    }

    // Create session
    req.session.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      institution: user.institution,
      status: user.status,
      isAdmin: user.isAdmin
    };

    // Log successful login
    activityLogger.logLogin(username, true);

    logger.info(`User logged in: ${username} (status: ${user.status})`);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        username: user.username,
        fullName: user.fullName,
        status: user.status,
        isAdmin: user.isAdmin
      },
      redirect: '/'
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
});

// Logout
app.post('/logout', (req, res) => {
  const username = req.session?.user?.username || 'unknown';
  req.session.destroy((err) => {
    if (err) {
      logger.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }

    logger.info(`User logged out: ${username}`);
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// ==============================================================================
// WORKSPACE API ROUTES
// ==============================================================================

/**
 * Initialize workspace for current session
 */
app.post('/api/workspace/init', requireAuth, (req, res) => {
  try {
    const sessionId = req.session.id;
    const workspaceInfo = workspaceManager.initializeWorkspace(sessionId);

    activityLogger.logActivity(
      req.session.user.username,
      'workspace_initialized',
      { sessionId }
    );

    res.json({
      success: true,
      workspace: workspaceInfo
    });
  } catch (error) {
    logger.error('Error initializing workspace:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get workspace status and file tree
 */
app.get('/api/workspace/status', requireAuth, async (req, res) => {
  try {
    const sessionId = req.session.id;
    const workspaceInfo = workspaceManager.getWorkspaceInfo(sessionId);
    const metadata = workspaceManager.loadMetadata(sessionId);

    res.json({
      success: true,
      workspace: {
        sessionId: sessionId,
        path: workspaceManager.getWorkspacePath(sessionId),
        initialized: true,
        files: metadata.files || [],
        folders: metadata.folders || [],
        fileTree: workspaceInfo.fileTree,
        createdAt: metadata.createdAt,
        lastAccessed: metadata.lastAccessed,
        version: metadata.version
      }
    });
  } catch (error) {
    // If workspace doesn't exist, initialize it
    if (error.message.includes('not found')) {
      const workspaceInfo = workspaceManager.initializeWorkspace(req.session.id);
      const metadata = workspaceManager.loadMetadata(req.session.id);
      return res.json({
        success: true,
        workspace: {
          sessionId: req.session.id,
          path: workspaceManager.getWorkspacePath(req.session.id),
          initialized: true,
          files: metadata.files || [],
          folders: metadata.folders || [],
          fileTree: workspaceInfo.fileTree,
          createdAt: metadata.createdAt,
          lastAccessed: metadata.lastAccessed,
          version: metadata.version
        }
      });
    }

    logger.error('Error getting workspace status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get workspace file tree
 */
app.get('/api/workspace/files', requireAuth, (req, res) => {
  try {
    const sessionId = req.session.id;
    const workspaceInfo = workspaceManager.getWorkspaceInfo(sessionId);

    res.json({
      success: true,
      files: workspaceInfo.metadata.files || []
    });
  } catch (error) {
    logger.error('Error getting workspace files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Upload file to workspace
 * Accepts any field name (raw_images, annotations, inference_data, etc.)
 */
app.post('/api/workspace/upload', requireAuth, upload.any(), async (req, res) => {
  try {
    const sessionId = req.session.id;
    const category = req.body.category || 'uploads'; // raw_images, annotations, inference_data

    // Check approval status - only active users can upload custom files
    if (req.session.user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Custom file upload requires account approval',
        status: req.session.user.status,
        message: 'Your account is pending approval. You can use test data while waiting.'
      });
    }

    // upload.any() puts files in req.files array
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Get first (and should be only) file
    const uploadedFile = req.files[0];

    // Determine relative path within workspace
    const relativePath = path.relative(
      workspaceManager.getWorkspacePath(sessionId),
      uploadedFile.path
    );

    // Add file to metadata
    const fileEntry = workspaceManager.addFileToMetadata(sessionId, {
      name: uploadedFile.originalname,
      path: relativePath,
      category: category,
      size: uploadedFile.size,
      folderId: req.body.folderId || null
    });

    // Trigger thumbnail generation for TIFF files (async, don't wait)
    const ext = path.extname(uploadedFile.originalname).toLowerCase();
    if (ext === '.tif' || ext === '.tiff') {
      const { spawn } = require('child_process');
      const thumbnailsDir = path.join(workspaceManager.getWorkspacePath(sessionId), '.thumbnails');
      if (!fs.existsSync(thumbnailsDir)) {
        fs.mkdirSync(thumbnailsDir, { recursive: true });
      }

      const thumbnailPath = path.join(thumbnailsDir, `${fileEntry.id}.jpg`);
      const filePath = uploadedFile.path;

      spawn(PYTHON_PATH, [
        'python/generate_thumbnail.py',
        filePath,
        thumbnailPath
      ]).on('close', async (code) => {
        if (code === 0) {
          await workspaceManager.setThumbnailPath(
            sessionId,
            fileEntry.id,
            `.thumbnails/${fileEntry.id}.jpg`
          );
        }
      });
    }

    activityLogger.logActivity(req.session.user.username, 'file_upload', {
      filename: uploadedFile.originalname,
      category: category,
      size: uploadedFile.size
    });

    res.json({
      success: true,
      file: fileEntry,
      message: 'File uploaded successfully'
    });

  } catch (error) {
    logger.error('Error uploading file to workspace:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get workspace statistics
 */
app.get('/api/workspace/stats', requireAuth, (req, res) => {
  try {
    const sessionId = req.session.id;
    const stats = workspaceManager.getWorkspaceStats(sessionId);

    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    logger.error('Error getting workspace stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// FILE OPERATIONS ENDPOINTS
// ==============================================================================

/**
 * Get file info by ID
 */
app.get('/api/workspace/file/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const sessionId = req.session.id;

    const file = await workspaceManager.getFile(sessionId, fileId);

    res.json({ success: true, file });
  } catch (error) {
    logger.error('Get file error:', error);
    res.status(404).json({ success: false, error: error.message });
  }
});

/**
 * Delete file by ID
 */
app.delete('/api/workspace/file/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const sessionId = req.session.id;

    const result = await workspaceManager.deleteFile(sessionId, fileId);

    activityLogger.logActivity(
      req.session.user.username,
      'file_deleted',
      { fileId }
    );

    res.json(result);
  } catch (error) {
    logger.error('Delete file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Rename file
 */
app.patch('/api/workspace/file/:fileId/rename', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { newName } = req.body;
    const sessionId = req.session.id;

    logger.debug(`[server.js] Rename endpoint hit: fileId=${fileId}, newName=${newName}, sessionId=${sessionId}`);

    if (!newName) {
      return res.status(400).json({ success: false, error: 'New name required' });
    }

    logger.debug('[server.js] Calling workspaceManager.renameFile()...');
    const file = await workspaceManager.renameFile(sessionId, fileId, newName);
    logger.debug('[server.js] renameFile returned:', file);

    activityLogger.logActivity(
      req.session.user.username,
      'file_renamed',
      { fileId, newName }
    );

    res.json({ success: true, file });
  } catch (error) {
    logger.error('[server.js] Rename file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Move file to folder
 */
app.patch('/api/workspace/file/:fileId/move', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { targetFolderId } = req.body;
    const sessionId = req.session.id;

    const file = await workspaceManager.moveFile(sessionId, fileId, targetFolderId);

    activityLogger.logActivity(
      req.session.user.username,
      'file_moved',
      { fileId, targetFolderId }
    );

    res.json({ success: true, file });
  } catch (error) {
    logger.error('Move file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Download file
 */
app.get('/api/workspace/file/:fileId/download', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const sessionId = req.session.id;

    const file = await workspaceManager.getFile(sessionId, fileId);
    const filePath = path.join(workspaceManager.getWorkspacePath(sessionId), file.path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    res.download(filePath, file.name);
  } catch (error) {
    logger.error('Download file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Batch delete files
 */
app.post('/api/workspace/files/batch-delete', requireAuth, async (req, res) => {
  try {
    const { fileIds } = req.body;
    const sessionId = req.session.id;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ success: false, error: 'File IDs array required' });
    }

    const result = await workspaceManager.deleteFiles(sessionId, fileIds);

    activityLogger.logActivity(
      req.session.user.username,
      'batch_delete',
      { count: result.deletedCount }
    );

    res.json(result);
  } catch (error) {
    logger.error('Batch delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Batch download files as zip
 */
app.post('/api/workspace/files/batch-download', requireAuth, async (req, res) => {
  try {
    const { fileIds } = req.body;
    const sessionId = req.session.id;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ success: false, error: 'File IDs array required' });
    }

    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Set headers
    res.attachment('workspace_files.zip');
    archive.pipe(res);

    // Get file metadata
    const metadata = await workspaceManager.loadMetadata(sessionId);
    const files = metadata.files.filter(f => fileIds.includes(f.id));

    // Add files to archive
    for (const file of files) {
      const filePath = path.join(workspaceManager.getWorkspacePath(sessionId), file.path);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file.name });
      }
    }

    await archive.finalize();

    activityLogger.logActivity(
      req.session.user.username,
      'batch_download',
      { count: files.length }
    );

  } catch (error) {
    logger.error('Batch download error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Search files by name
 */
app.get('/api/workspace/files/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const sessionId = req.session.id;

    const files = await workspaceManager.searchFiles(sessionId, q);

    res.json({ success: true, files });
  } catch (error) {
    logger.error('Search files error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Filter files by category
 */
app.get('/api/workspace/files/category/:category', requireAuth, async (req, res) => {
  try {
    const { category } = req.params;
    const sessionId = req.session.id;

    const files = await workspaceManager.getFilesByCategory(sessionId, category);

    res.json({ success: true, files });
  } catch (error) {
    logger.error('Filter files error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// FOLDER OPERATIONS ENDPOINTS
// ==============================================================================

/**
 * Get all folders
 */
app.get('/api/workspace/folders', requireAuth, async (req, res) => {
  try {
    const sessionId = req.session.id;

    const folders = await workspaceManager.getFolders(sessionId);

    res.json({ success: true, folders });
  } catch (error) {
    logger.error('Get folders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create folder
 */
app.post('/api/workspace/folders', requireAuth, async (req, res) => {
  try {
    const { name, parentId, color } = req.body;
    const sessionId = req.session.id;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Folder name required' });
    }

    const folder = await workspaceManager.createFolder(
      sessionId,
      name,
      parentId || null,
      color || '#4A90E2'
    );

    activityLogger.logActivity(
      req.session.user.username,
      'folder_created',
      { folderId: folder.id, name }
    );

    res.json({ success: true, folder });
  } catch (error) {
    logger.error('Create folder error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Rename folder
 */
app.patch('/api/workspace/folders/:folderId', requireAuth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name } = req.body;
    const sessionId = req.session.id;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Folder name required' });
    }

    const folder = await workspaceManager.renameFolder(sessionId, folderId, name);

    activityLogger.logActivity(
      req.session.user.username,
      'folder_renamed',
      { folderId, name }
    );

    res.json({ success: true, folder });
  } catch (error) {
    logger.error('Rename folder error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete folder
 */
app.delete('/api/workspace/folders/:folderId', requireAuth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const sessionId = req.session.id;

    const result = await workspaceManager.deleteFolder(sessionId, folderId);

    activityLogger.logActivity(
      req.session.user.username,
      'folder_deleted',
      { folderId }
    );

    res.json(result);
  } catch (error) {
    logger.error('Delete folder error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// THUMBNAIL ENDPOINT
// ==============================================================================

/**
 * Get or generate thumbnail for a file
 */
app.get('/api/workspace/thumbnail/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const sessionId = req.session.id;

    const file = await workspaceManager.getFile(sessionId, fileId);
    const workspacePath = workspaceManager.getWorkspacePath(sessionId);

    // Check if thumbnail already exists
    if (file.thumbnailPath) {
      const thumbPath = path.join(workspacePath, file.thumbnailPath);
      if (fs.existsSync(thumbPath)) {
        return res.sendFile(path.resolve(thumbPath));
      }
    }

    // Generate thumbnail if TIFF file
    const ext = path.extname(file.name).toLowerCase();
    if (ext !== '.tif' && ext !== '.tiff') {
      return res.status(400).json({
        success: false,
        error: 'Thumbnails only available for TIFF files'
      });
    }

    // Create .thumbnails directory
    const thumbnailsDir = path.join(workspacePath, '.thumbnails');
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }

    const thumbnailFilename = `${fileId}.jpg`;
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
    const filePath = path.join(workspacePath, file.path);

    // Spawn Python script
    const { spawn } = require('child_process');
    const pythonProcess = spawn(PYTHON_PATH, [
      'python/generate_thumbnail.py',
      filePath,
      thumbnailPath
    ]);

    let output = '';
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.on('close', async (code) => {
      if (code === 0 && output.includes('SUCCESS:')) {
        // Update metadata with thumbnail path
        await workspaceManager.setThumbnailPath(
          sessionId,
          fileId,
          `.thumbnails/${thumbnailFilename}`
        );

        res.sendFile(path.resolve(thumbnailPath));
      } else {
        logger.error('Thumbnail generation failed:', output);
        res.status(500).json({
          success: false,
          error: 'Thumbnail generation failed'
        });
      }
    });

  } catch (error) {
    logger.error('Thumbnail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// MAIN ROUTES
// ==============================================================================

// Serve welcome page as default
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

// Serve classic app
app.get('/classic', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'classic', 'index.html'));
});

// Serve workspace app
app.get('/workspace', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'workspace', 'index.html'));
});

// Step 1: Upload and validate TIFF stacks (MODIFIED to support test data + pre-uploaded files)
app.post('/upload-data', upload.fields([
    { name: 'raw_images', maxCount: 1 },
    { name: 'annotations', maxCount: 1 }
]), async (req, res) => {
    try {
        let rawFile, annotationFile;
        const sessionId = req.session.id;
        const workspacePath = workspaceManager.getWorkspacePath(sessionId);

        // NEW: Check if files are already uploaded (skipUpload flag)
        const skipUpload = req.body.skipUpload === 'true';
        const isTestData = req.body.isTestData === 'true';

        // If NOT test data and NOT already uploaded, require approved status
        if (!isTestData && !skipUpload && req.session.user.status !== 'active') {
            return res.status(403).json({
                error: 'Custom data upload requires account approval',
                status: req.session.user.status,
                message: 'You can use test data while waiting for approval'
            });
        }

        // Case 1: Files already uploaded via FileSelector (custom upload flow)
        if (skipUpload) {
            logger.debug('Validating pre-uploaded files...');

            const rawImagesPath = req.body.raw_images_path;
            const annotationsPath = req.body.annotations_path;

            if (!rawImagesPath || !annotationsPath) {
                return res.status(400).json({
                    error: 'File paths are required when skipUpload is true'
                });
            }

            // Convert relative paths to absolute paths
            const rawFullPath = path.join(workspacePath, rawImagesPath);
            const annFullPath = path.join(workspacePath, annotationsPath);

            // Verify files exist
            if (!fs.existsSync(rawFullPath)) {
                return res.status(400).json({
                    error: 'Raw images file not found',
                    path: rawImagesPath
                });
            }

            if (!fs.existsSync(annFullPath)) {
                return res.status(400).json({
                    error: 'Annotations file not found',
                    path: annotationsPath
                });
            }

            // Create file objects for validation
            rawFile = {
                path: rawFullPath,
                filename: path.basename(rawFullPath),
                originalname: path.basename(rawFullPath),
                size: fs.statSync(rawFullPath).size,
                mimetype: 'image/tiff'
            };

            annotationFile = {
                path: annFullPath,
                filename: path.basename(annFullPath),
                originalname: path.basename(annFullPath),
                size: fs.statSync(annFullPath).size,
                mimetype: 'image/tiff'
            };

            logger.debug('Using pre-uploaded files:', {
                raw: rawImagesPath,
                annotations: annotationsPath
            });
        }
        // Case 2: Test data request
        else if (isTestData) {
            logger.debug('Processing test data request...');

            // Use workspace directory structure
            const rawUploadDir = path.join(workspacePath, 'uploads', 'raw');
            const annUploadDir = path.join(workspacePath, 'uploads', 'annotations');

            // Initialize workspace if it doesn't exist
            if (!fs.existsSync(workspacePath)) {
                logger.debug('Initializing workspace for session:', sessionId);
                workspaceManager.initializeWorkspace(sessionId);
            }

            // Create upload directories if they don't exist
            if (!fs.existsSync(rawUploadDir)) {
                fs.mkdirSync(rawUploadDir, { recursive: true });
            }
            if (!fs.existsSync(annUploadDir)) {
                fs.mkdirSync(annUploadDir, { recursive: true });
            }

            // Define test file paths
            const testFiles = {
                raw_images: 'trypB_testData_training.tif',
                annotations: 'trypB_testData_annotations.tif'
            };

            // Copy test files and create mock file objects
            const rawSourcePath = path.join('test_data', testFiles.raw_images);
            const annotationSourcePath = path.join('test_data', testFiles.annotations);

            // Check if test files exist
            if (!fs.existsSync(rawSourcePath)) {
                return res.status(400).json({
                    error: 'Test training images not found',
                    details: `Expected file: test_data/${testFiles.raw_images}`
                });
            }

            if (!fs.existsSync(annotationSourcePath)) {
                return res.status(400).json({
                    error: 'Test annotation images not found',
                    details: `Expected file: test_data/${testFiles.annotations}`
                });
            }

            // Copy files to appropriate directories
            const rawDestPath = path.join(rawUploadDir, testFiles.raw_images);
            const annotationDestPath = path.join(annUploadDir, testFiles.annotations);

            fs.copyFileSync(rawSourcePath, rawDestPath);
            fs.copyFileSync(annotationSourcePath, annotationDestPath);

            // Create mock file objects that match the expected structure
            rawFile = {
                path: rawDestPath,
                filename: testFiles.raw_images,
                originalname: testFiles.raw_images,
                size: fs.statSync(rawDestPath).size,
                mimetype: 'image/tiff'
            };

            annotationFile = {
                path: annotationDestPath,
                filename: testFiles.annotations,
                originalname: testFiles.annotations,
                size: fs.statSync(annotationDestPath).size,
                mimetype: 'image/tiff'
            };

            logger.debug('Test files copied successfully');

        }
        // Case 3: Regular file upload (legacy, should not happen in workspace version)
        else {
            // Handle regular uploaded files
            if (!req.files.raw_images || !req.files.annotations) {
                return res.status(400).json({
                    error: 'Both raw images and annotations are required'
                });
            }

            rawFile = req.files.raw_images[0];
            annotationFile = req.files.annotations[0];
        }
        
        logger.debug('Validating TIFF stacks...');
        
        // Validate TIFF stacks (same logic for both test data and uploads)
        const validationResult = await validateTiffStacks(rawFile.path, annotationFile.path);

        
        if (!validationResult.valid) {
            return res.status(400).json({
                error: 'TIFF validation failed',
                details: validationResult.error
            });
        }
        
        // Store file paths in session (same logic for both test data and uploads)
        req.session.uploadedFiles = {
            raw_images: rawFile.path,
            annotations: annotationFile.path,
            validation: validationResult,
            isTestData: req.body.isTestData === 'true'
        };

        // NEW: Track files in workspace metadata
        // BUT: Skip if files were already uploaded (skipUpload=true means already tracked)
        let rawFileEntry, annFileEntry;

        if (!skipUpload) {
            // Add raw images file to metadata
            const rawRelPath = path.relative(workspacePath, rawFile.path);
            rawFileEntry = workspaceManager.addFileToMetadata(sessionId, {
                name: rawFile.filename || rawFile.originalname,
                path: rawRelPath,
                category: 'raw_images',
                size: rawFile.size,
                folderId: null
            });

            // Add annotations file to metadata
            const annRelPath = path.relative(workspacePath, annotationFile.path);
            annFileEntry = workspaceManager.addFileToMetadata(sessionId, {
                name: annotationFile.filename || annotationFile.originalname,
                path: annRelPath,
                category: 'annotations',
                size: annotationFile.size,
                folderId: null
            });

            logger.debug('Files tracked in metadata:', {
                raw: rawFileEntry.id,
                annotations: annFileEntry.id
            });
        } else {
            logger.debug('Files already tracked in metadata, skipping duplicate tracking');
            // For skipUpload case, just return the paths
            rawFileEntry = { path: path.relative(workspacePath, rawFile.path) };
            annFileEntry = { path: path.relative(workspacePath, annotationFile.path) };
        }

        // NEW: Log the upload (only for new uploads, not validation-only)
        if (!skipUpload) {
            activityLogger.logFileUpload(
                req.session.user.username,
                req.body.isTestData === 'true' ? 'test_data' : 'custom_data',
                rawFile.filename || rawFile.originalname,
                rawFile.size
            );
        }

        logger.info('Files processed and validated successfully');

        res.json({
            success: true,
            message: skipUpload
                ? 'Files validated successfully'
                : (req.body.isTestData === 'true'
                    ? 'Test dataset loaded and validated successfully'
                    : 'Files uploaded and validated successfully'),
            validation: validationResult,
            isTestData: req.body.isTestData === 'true',
            raw_images_path: rawFileEntry.path,
            annotations_path: annFileEntry.path
        });
        
    } catch (error) {
        logger.error('Upload/Test data error:', error);
        res.status(500).json({ 
            error: error.message,
            isTestData: req.body.isTestData === 'true'
        });
    }
});

// Step 2: Configure training parameters
app.post('/configure-training', (req, res) => {
  try {
    const config = req.body;
    
    // Validate configuration
    const validationResult = validateTrainingConfig(config);
    if (!validationResult.valid) {
      return res.status(400).json({ 
        error: 'Invalid configuration',
        details: validationResult.errors 
      });
    }

    // Store configuration in session
    req.session.trainingConfig = config;

    res.json({
      success: true,
      message: 'Training configuration saved',
      config: config
    });

  } catch (error) {
    logger.error('Configuration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 3: Start training
app.post('/start-training', requireAuth, (req, res) => {
  try {
    if (!req.session.uploadedFiles || !req.session.trainingConfig) {
      return res.status(400).json({ 
        error: 'Missing uploaded files or configuration' 
      });
    }
    
    // NEW: Check if using test data FIRST (before doing anything else)
    const isUsingTestData = req.session.uploadedFiles && req.session.uploadedFiles.isTestData;
    
    // NEW: If NOT using test data, require approval (check BEFORE starting training)
    if (!isUsingTestData && req.session.user.status !== 'active') {
      return res.status(403).json({
        error: 'Training with custom data requires account approval',
        status: req.session.user.status,
        message: 'You can train models with test data while waiting for approval'
      });
    }
    
    // Approval check passed, continue with training setup
    const sessionId = req.session.id;
    const trainingId = uuid.v4();
    
    // Add num_classes from validation to config
    const config = req.session.trainingConfig;
    if (req.session.uploadedFiles.validation && req.session.uploadedFiles.validation.num_classes) {
      config.num_classes = req.session.uploadedFiles.validation.num_classes;
      logger.info(`Using ${config.num_classes} classes detected from annotations`);
    } else {
      // Fallback to 3 if not detected (shouldn't happen with new validation)
      config.num_classes = 3;
      logger.info('Warning: num_classes not detected, defaulting to 3');
    }
    
    // Prepare training parameters
    const workspacePath = workspaceManager.getWorkspacePath(sessionId);
    const trainingParams = {
      session_id: sessionId,
      training_id: trainingId,
      raw_images: req.session.uploadedFiles.raw_images,
      annotations: req.session.uploadedFiles.annotations,
      config: req.session.trainingConfig,
      output_dir: path.join(workspacePath, 'models', 'segmentation', trainingId)
    };

    // Create output directory
    if (!fs.existsSync(trainingParams.output_dir)) {
      fs.mkdirSync(trainingParams.output_dir, { recursive: true });
    }
    
    // Store training session (BEFORE starting training process)
    trainingSessions.set(trainingId, {
      sessionId: sessionId,
      username: req.session.user.username,
      fullName: req.session.user.fullName,
      status: 'starting',
      startTime: new Date(),
      current_epoch: 0,
      total_epochs: req.session.trainingConfig.num_epochs,
      params: trainingParams,
      isTestData: isUsingTestData
    });
    
    // Log training start
    activityLogger.logTrainingStart(
      req.session.user.username,
      trainingId,
      req.session.trainingConfig
    );
    
    req.session.currentTraining = trainingId;
    
    // NOW start training process (after all checks and setup)
    startTrainingProcess(trainingParams, io);
    
    res.json({
      success: true,
      training_id: trainingId,
      message: 'Training started successfully'
    });
    
  } catch (error) {
    logger.error('Training start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get training status
app.get('/training-status/:trainingId', requireAuth, (req, res) => {
  const trainingId = req.params.trainingId;
  const training = trainingSessions.get(trainingId);
  
  if (!training) {
    return res.status(404).json({ error: 'Training session not found' });
  }

  res.json(training);
});

// Step 4: Upload data for inference (MODIFIED to support test data)
app.post('/upload-inference', requireAuth, upload.single('inference_data'), async (req, res) => {
    try {
        let inferenceFile;
        const sessionId = req.session.id;
        const workspacePath = workspaceManager.getWorkspacePath(sessionId);

        // NEW: Check if file is already uploaded (skipUpload flag)
        const skipUpload = req.body.skipUpload === 'true';
        const isTestData = req.body.isTestData === 'true';

        // If NOT test data and NOT already uploaded, require approved status
        if (!isTestData && !skipUpload && req.session.user.status !== 'active') {
            return res.status(403).json({
                error: 'Custom inference data upload requires account approval',
                status: req.session.user.status,
                message: 'You can use test data while waiting for approval'
            });
        }

        // Case 1: File already uploaded via FileSelector (custom upload flow)
        if (skipUpload) {
            logger.debug('Validating pre-uploaded inference file...');

            const inferenceDataPath = req.body.inference_data_path;

            if (!inferenceDataPath) {
                return res.status(400).json({
                    error: 'File path is required when skipUpload is true'
                });
            }

            // Convert relative path to absolute path
            const inferenceFullPath = path.join(workspacePath, inferenceDataPath);

            // Verify file exists
            if (!fs.existsSync(inferenceFullPath)) {
                return res.status(400).json({
                    error: 'Inference data file not found',
                    path: inferenceDataPath
                });
            }

            // Create file object for validation
            inferenceFile = {
                path: inferenceFullPath,
                filename: path.basename(inferenceFullPath),
                originalname: path.basename(inferenceFullPath),
                size: fs.statSync(inferenceFullPath).size,
                mimetype: 'image/tiff'
            };

            logger.debug('Using pre-uploaded inference file:', inferenceDataPath);
        }
        // Case 2: Test data request
        else if (isTestData) {
            logger.debug('Processing test inference data request...');

            // Use workspace directory structure
            const inferenceUploadDir = path.join(workspacePath, 'uploads', 'inference_data');

            // Initialize workspace if it doesn't exist
            if (!fs.existsSync(workspacePath)) {
                logger.debug('Initializing workspace for session:', sessionId);
                workspaceManager.initializeWorkspace(sessionId);
            }

            // Create upload directory if it doesn't exist
            if (!fs.existsSync(inferenceUploadDir)) {
                fs.mkdirSync(inferenceUploadDir, { recursive: true });
            }

            // Define test inference file
            const testInferenceFile = 'trypB_testData_inference.tif';
            const sourceInferencePath = path.join('test_data', testInferenceFile);

            // Check if test inference file exists
            if (!fs.existsSync(sourceInferencePath)) {
                return res.status(400).json({
                    error: 'Test inference images not found',
                    details: `Expected file: test_data/${testInferenceFile}`
                });
            }

            // Copy file to workspace directory
            const destInferencePath = path.join(inferenceUploadDir, testInferenceFile);
            fs.copyFileSync(sourceInferencePath, destInferencePath);

            // Create mock file object
            inferenceFile = {
                path: destInferencePath,
                filename: testInferenceFile,
                originalname: testInferenceFile,
                size: fs.statSync(destInferencePath).size,
                mimetype: 'image/tiff'
            };

            logger.debug('Test inference file copied successfully');

        }
        // Case 3: Regular file upload (legacy, should not happen in workspace version)
        else {
            // Handle regular uploaded file
            if (!req.file) {
                return res.status(400).json({ error: 'No file provided for inference' });
            }

            inferenceFile = req.file;
        }
        
        logger.debug('Validating inference TIFF...');

        // Validate TIFF file (same logic for both test data and uploads)
        const validationResult = await validateInferenceTiff(inferenceFile.path);

        if (!validationResult.valid) {
            return res.status(400).json({
                error: 'TIFF validation failed',
                details: validationResult.error
            });
        }

        // NEW: Track file in workspace metadata (only for test data, not skipUpload)
        let inferenceFileEntry;

        if (!skipUpload && isTestData) {
            // Add inference file to metadata (test data flow)
            const inferenceRelPath = path.relative(workspacePath, inferenceFile.path);
            inferenceFileEntry = workspaceManager.addFileToMetadata(sessionId, {
                name: inferenceFile.filename || inferenceFile.originalname,
                path: inferenceRelPath,
                category: 'inference_data',
                size: inferenceFile.size,
                folderId: null
            });

            logger.debug('Inference file tracked in metadata:', inferenceFileEntry.id);
        } else if (skipUpload) {
            logger.debug('Inference file already tracked in metadata, skipping duplicate tracking');
            // For skipUpload case, just return the path
            inferenceFileEntry = { path: path.relative(workspacePath, inferenceFile.path) };
        }

        logger.info('Inference file processed and validated successfully');

        res.json({
            success: true,
            message: skipUpload
                ? 'Inference file validated successfully'
                : (req.body.isTestData === 'true'
                    ? 'Test inference data loaded successfully'
                    : 'Inference data uploaded successfully'),
            file_path: inferenceFile.path,
            inference_data_path: inferenceFileEntry ? inferenceFileEntry.path : path.relative(workspacePath, inferenceFile.path),
            validation: validationResult,
            isTestData: req.body.isTestData === 'true'
        });
        
    } catch (error) {
        logger.error('Inference upload/test data error:', error);
        res.status(500).json({ 
            error: error.message,
            isTestData: req.body.isTestData === 'true'
        });
    }
});

// Import pre-trained model endpoint (requires approval)
app.post('/import-pretrained-model', requireApproved, uploadImport.fields([
  { name: 'model_file', maxCount: 1 },
  { name: 'config_file', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files.model_file || !req.files.config_file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Both model file (.pth) and config file (.json) are required.' 
      });
    }

    const modelFile = req.files.model_file[0];
    const configFile = req.files.config_file[0];

    // Validate file extensions
    if (!modelFile.originalname.toLowerCase().endsWith('.pth')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Model file must be a .pth file.' 
      });
    }

    if (!configFile.originalname.toLowerCase().endsWith('.json')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Config file must be a .json file.' 
      });
    }

    logger.debug('Validating imported model and config...');
    
    // Validate the imported files
    const validationResult = await validateImportedModel(modelFile.path, configFile.path);
    
    if (validationResult.success) {
      // Store imported model info in session
      req.session.importedModel = {
        modelPath: modelFile.path,
        configPath: configFile.path,
        validated: true,
        validation: validationResult
      };
      
      res.json({
        success: true,
        message: 'Model and config validated successfully',
        validation: {
          model_info: `Valid PyTorch model (${validationResult.model_size})`,
          config_info: `Valid configuration with ${validationResult.config.features} features, ${validationResult.config.num_layers} layers`
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: validationResult.error
      });
    }

  } catch (error) {
    logger.error('Import model error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error during model import: ' + error.message 
    });
  }
});

// Verify imported model is still valid
app.get('/verify-imported-model', (req, res) => {
  try {
    const importedModel = req.session.importedModel;
    
    if (!importedModel || !importedModel.validated) {
      return res.status(400).json({
        success: false,
        error: 'No valid imported model found in session'
      });
    }
    
    // Check if files still exist
    if (!fs.existsSync(importedModel.modelPath) || !fs.existsSync(importedModel.configPath)) {
      return res.status(400).json({
        success: false,
        error: 'Imported model files no longer exist'
      });
    }
    
    res.json({
      success: true,
      modelInfo: {
        model_size: importedModel.validation.model_size,
        config: importedModel.validation.config
      }
    });
    
  } catch (error) {
    logger.error('Error verifying imported model:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during model verification'
    });
  }
});

// Run inference
app.post('/run-inference', async (req, res) => {
  try {
    const { model_path, data_path, output_path, training_id } = req.body;

    logger.info('Inference request received:', { model_path, data_path, output_path, training_id });

    // Convert data_path to absolute workspace path if it's not already absolute
    const sessionId = req.session.id;
    const workspacePath = workspaceManager.getWorkspacePath(sessionId);
    let actualDataPath = data_path;

    // Check if data_path is relative or absolute
    if (!path.isAbsolute(data_path)) {
      // If relative, join with workspace path
      actualDataPath = path.join(workspacePath, data_path);
      logger.debug('Converted relative data path to absolute:', actualDataPath);
    }

    // Verify the data file exists
    if (!fs.existsSync(actualDataPath)) {
      return res.status(400).json({
        error: 'Input file not found',
        details: `File not found at: ${actualDataPath}`,
        original_path: data_path
      });
    }

    let actualModelPath;
    let modelConfig;
    let inferenceId;

    // Check if using imported model first
    if (req.session.importedModel && req.session.importedModel.validated) {
      logger.info('Using imported model for inference');
      
      // Use imported model
      actualModelPath = req.session.importedModel.modelPath;
      
      // Load config from imported config file
      try {
        const configData = fs.readFileSync(req.session.importedModel.configPath, 'utf8');
        modelConfig = JSON.parse(configData);
        logger.debug('Loaded imported model config:', modelConfig);
      } catch (error) {
        return res.status(400).json({ 
          error: 'Failed to load imported model config: ' + error.message 
        });
      }

      // Verify imported model file still exists
      if (!fs.existsSync(actualModelPath)) {
        return res.status(400).json({ 
          error: 'Imported model file not found: ' + actualModelPath 
        });
      }

      logger.debug('Imported model validated. Model at:', actualModelPath);

    } else {
      // Original logic: Check if training session exists and model file exists
      if (!training_id || !trainingSessions.has(training_id)) {
        return res.status(400).json({ 
          error: 'No imported model found and training session not found or invalid training_id provided',
          training_id: training_id,
          available_sessions: Array.from(trainingSessions.keys())
        });
      }

      const training = trainingSessions.get(training_id);
      actualModelPath = path.join(training.params.output_dir, 'best_model.pth');
      modelConfig = training.params.config;
      
      logger.debug('Training session found. Checking model at:', actualModelPath);

      if (!fs.existsSync(actualModelPath)) {
        logger.error('Model file not found at:', actualModelPath);
        logger.debug('Contents of training output directory:');
        try {
          const files = fs.readdirSync(training.params.output_dir);
          logger.debug('Files in directory:', files);
        } catch (e) {
          logger.debug('Could not read directory:', e.message);
        }
        
        return res.status(404).json({ 
          error: `Model file not found. Training may not have completed successfully.`,
          details: `Expected: ${actualModelPath}`
        });
      }

      logger.debug('Training model validated. Model at:', actualModelPath);
    }
    
    // Generate inference ID
    inferenceId = uuid.v4();

    // Initialize session tracking for imported model results directories
    if (!req.session.importedModelResultsDirs) {
      req.session.importedModelResultsDirs = [];
    }

    // Generate output path if not provided (sessionId and workspacePath already declared above)
    let actualOutputPath = output_path;
    if (!actualOutputPath) {
      // Determine base directory based on whether using imported model or trained model
      if (req.session.importedModel && req.session.importedModel.validated) {
        // For imported models, use a timestamp-based directory
        const timestamp = Date.now();
        const importedModelDir = `imported_model_${timestamp}`;
        actualOutputPath = path.join(workspacePath, 'results', 'segmentation', importedModelDir, 'inference_result.tif');

        // Track this directory for cleanup
        const resultsDir = path.join(workspacePath, 'results', 'segmentation', importedModelDir);
        req.session.importedModelResultsDirs.push(resultsDir);
        logger.debug('Tracking imported model results directory:', resultsDir);
      } else if (training_id) {
        // For trained models, use the training ID
        actualOutputPath = path.join(workspacePath, 'results', 'segmentation', training_id, 'inference_result.tif');
      } else {
        // Fallback
        actualOutputPath = path.join(workspacePath, 'results', 'segmentation', `inference_${inferenceId}`, 'inference_result.tif');
      }
      logger.debug('Generated output path:', actualOutputPath);
    }

    // Store inference session
    inferenceSessions.set(inferenceId, {
      sessionId: req.session.id,
      username: req.session.user.username,  // NEW
      fullName: req.session.user.fullName,  // NEW
      status: 'starting',
      startTime: new Date(),
      progress: 0,
      currentSlice: 0,
      totalSlices: 0,
      usingImportedModel: !!(req.session.importedModel && req.session.importedModel.validated)
    });

    // NEW: Log inference start
    activityLogger.logInferenceStart(
      req.session.user.username,
      inferenceId,
      !!(req.session.importedModel && req.session.importedModel.validated)
    );

    logger.info('Generated inference ID:', inferenceId);

    // Send response immediately with inference ID so frontend can join room
    res.json({
      success: true,
      inference_id: inferenceId,
      status: 'starting',
      message: 'Inference request accepted. Join the WebSocket room for progress updates.',
      model_info: req.session.importedModel ? 'Using imported model' : 'Using trained model'
    });

    // Start inference after a short delay to allow frontend to join room
    setTimeout(() => {
      logger.debug('Starting inference with model path:', actualModelPath);
      logger.debug('Data path:', actualDataPath);
      logger.debug('Output path:', actualOutputPath);
      startInferenceProcess(actualModelPath, actualDataPath, actualOutputPath, inferenceId, io);
    }, 1000); // 1 second delay

  } catch (error) {
    logger.error('Inference error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download model and config as zip
app.get('/download-model/:trainingId', requireAuth, (req, res) => {
  const trainingId = req.params.trainingId;
  const training = trainingSessions.get(trainingId);
  
  if (!training || training.status !== 'completed') {
    return res.status(404).json({ error: 'Model not found or training not completed' });
  }

  const modelDir = training.params.output_dir;
  const modelPath = path.join(modelDir, 'best_model.pth');
  const configPath = path.join(modelDir, 'config.json');
  const resultsPath = path.join(modelDir, 'results.json');
  
  // Check if files exist
  if (!fs.existsSync(modelPath)) {
    return res.status(404).json({ error: 'Model file not found' });
  }
  
  // Create zip file
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  // Set response headers
  res.attachment(`trained_model_${trainingId.substring(0, 8)}.zip`);
  
  // Pipe archive to response
  archive.pipe(res);
  
  // Add files to zip
  archive.file(modelPath, { name: 'best_model.pth' });
  
  if (fs.existsSync(configPath)) {
    archive.file(configPath, { name: 'training_config.json' });
  }
  
  if (fs.existsSync(resultsPath)) {
    archive.file(resultsPath, { name: 'training_results.json' });
  }
  
  // Add a readme file with instructions
  const readmeContent = `# Trained U-Net Model

This archive contains:

## Files
- **best_model.pth**: The trained PyTorch model state dict
- **training_config.json**: Configuration used for training
- **training_results.json**: Final training metrics and results

## Loading the Model

\`\`\`python
import torch
from your_unet_class import UNet  # Import your UNet class

# Load configuration
import json
with open('training_config.json', 'r') as f:
    config = json.load(f)

# Create model with same architecture
model = UNet(
    features=config['features'],
    num_layers=config['num_layers'],
    in_channels=1,
    num_classes=3
)

# Load trained weights
checkpoint = torch.load('best_model.pth')
model.load_state_dict(checkpoint['model_state_dict'])
model.eval()

# Now you can use the model for inference
\`\`\`

## Training Results
Check training_results.json for final performance metrics.

Training ID: ${trainingId}
Generated: ${new Date().toISOString()}
`;

  archive.append(readmeContent, { name: 'README.md' });
  
  // Finalize the archive
  archive.finalize();
  
  archive.on('error', (err) => {
    logger.error('Archive error:', err);
    res.status(500).json({ error: 'Failed to create archive' });
  });
});

// Download inference results as zip
app.get('/download-inference-results/:inferenceId', requireAuth, (req, res) => {
  const inferenceId = req.params.inferenceId;
  const inference = inferenceSessions.get(inferenceId);
  
  if (!inference || inference.status !== 'completed') {
    return res.status(404).json({ 
      error: 'Inference results not found or inference not completed',
      available_sessions: Array.from(inferenceSessions.keys())
    });
  }

  // Get the result paths from the inference session
  const result = inference.result;
  if (!result) {
    return res.status(404).json({ error: 'Inference result data not found' });
  }

  const outputPath = result.output_path;
  const metadataPath = result.metadata_path;
  const visualizationPath = result.visualization_path;
  const overlayPath = result.original_data_overlay_path;  // NEW: overlay file path

  logger.debug('Download request for inference:', inferenceId);
  logger.debug('Output path:', outputPath);
  logger.debug('Metadata path:', metadataPath);
  logger.debug('Visualization path:', visualizationPath);
  logger.debug('Overlay path:', overlayPath);
  
  // Check if main result file exists
  if (!fs.existsSync(outputPath)) {
    return res.status(404).json({ 
      error: 'Segmentation result file not found',
      path: outputPath
    });
  }
  
  // Create zip file
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  // Set response headers
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substr(0, 19);
  res.attachment(`segmentation_results_${timestamp}.zip`);
  
  // Handle archive errors
  archive.on('error', (err) => {
    logger.error('Archive error:', err);
    res.status(500).json({ error: 'Failed to create archive: ' + err.message });
  });
  
  // Pipe archive to response
  archive.pipe(res);
  
  // Add segmentation results TIFF file
  archive.file(outputPath, { name: path.basename(outputPath) });
  logger.debug('Added to archive:', path.basename(outputPath));
  
  // Add metadata file if it exists
  if (metadataPath && fs.existsSync(metadataPath)) {
    archive.file(metadataPath, { name: path.basename(metadataPath) });
    logger.debug('Added to archive:', path.basename(metadataPath));
  } else {
    logger.debug('Metadata file not found:', metadataPath);
  }
  
  // Add visualization data if it exists
  if (visualizationPath && fs.existsSync(visualizationPath)) {
    archive.file(visualizationPath, { name: path.basename(visualizationPath) });
    logger.debug('Added to archive:', path.basename(visualizationPath));
  } else {
    logger.debug('Visualization file not found:', visualizationPath);
  }
  
  // Add a readme file with information about the results
  const readmeContent = `# Segmentation Results

This archive contains the results from your biomedical image segmentation:

## Files Included

### Main Results
- **${path.basename(outputPath)}**: The segmented TIFF image stack
  - Contains the segmentation mask with different classes labeled as integers
  - Can be opened with ImageJ, Fiji, or any TIFF-compatible software

### Metadata  
- **${metadataPath ? path.basename(metadataPath) : 'metadata file (if available)'}**: Segmentation metadata and metrics
  - Contains class distribution statistics
  - Model configuration used for segmentation
  - Input file information

### 3D Visualization Data
- **${visualizationPath ? path.basename(visualizationPath) : 'visualization file (if available)'}**: 3D visualization data
  - JSON format containing sparse 3D data for web visualization
  - Can be used to recreate the 3D view in the application

## Usage

### Loading in ImageJ/Fiji
1. Open ImageJ or Fiji
2. File → Open → Select the .tif file
3. The segmentation will appear as a grayscale stack where:
   - 0 = Background
   - 1 = Foreground/Objects
   - 2+ = Additional classes (if present)

### Python Analysis
\`\`\`python
import tifffile
import json

# Load segmentation results
segmented_data = tifffile.imread('${path.basename(outputPath)}')
print(f"Segmentation shape: {segmented_data.shape}")

# Load metadata (if available)
with open('${metadataPath ? path.basename(metadataPath) : 'metadata.json'}', 'r') as f:
    metadata = json.load(f)
    
print("Class distribution:", metadata['metrics']['class_distribution'])
\`\`\`

## Inference Details
- **Generated**: ${new Date().toISOString()}
- **Inference ID**: ${inferenceId}
- **Model Type**: ${inference.usingImportedModel ? 'Imported Model' : 'Custom Trained Model'}

For questions about these results, please refer to the application documentation.
`;

  archive.append(readmeContent, { name: 'README.md' });
  
  // Finalize the archive
  archive.finalize();
  
  logger.debug('Archive finalized for inference:', inferenceId);
});

// Serve static files from workspace directories (session-scoped)
app.use('/workspaces/:sessionId/results', requireAuth, (req, res, next) => {
  const sessionId = req.params.sessionId;

  // Verify the session ID matches the current user's session
  if (sessionId !== req.session.id) {
    return res.status(403).json({ error: 'Access denied to this workspace' });
  }

  const workspacePath = workspaceManager.getWorkspacePath(sessionId);
  const resultsPath = path.join(workspacePath, 'results');

  // Serve files from the workspace results directory
  express.static(resultsPath)(req, res, next);
});

app.use('/workspaces/:sessionId/uploads', requireAuth, (req, res, next) => {
  const sessionId = req.params.sessionId;

  // Verify the session ID matches the current user's session
  if (sessionId !== req.session.id) {
    return res.status(403).json({ error: 'Access denied to this workspace' });
  }

  const workspacePath = workspaceManager.getWorkspacePath(sessionId);
  const uploadsPath = path.join(workspacePath, 'uploads');

  // Serve files from the workspace uploads directory
  express.static(uploadsPath)(req, res, next);
});

// Legacy static file serving (for backward compatibility with old results/uploads directories)
app.use('/uploads', express.static('uploads'));
app.use('/results', express.static('results'));

// Serve downsampled original data for visualization
app.get('/results/:inferenceId/original-data-web', requireAuth, (req, res) => {
  const inferenceId = req.params.inferenceId;
  
  // Look up the inference session
  const inference = inferenceSessions.get(inferenceId);
  
  if (!inference || !inference.result) {
    return res.status(404).json({ 
      error: 'Inference session not found or incomplete',
      inferenceId: inferenceId 
    });
  }
  
  // Get the metadata path
  const metadataPath = inference.result.metadata_path;
  
  if (!fs.existsSync(metadataPath)) {
    return res.status(404).json({ error: 'Metadata file not found' });
  }
  
  try {
    // Read metadata to get downsampled original data path
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

    // Check new key first, then fall back to old key for backward compatibility
    const overlayData = metadata.original_data_overlay || metadata.original_data_web;

    if (!overlayData || !overlayData.path) {
      return res.status(404).json({
        error: 'Downsampled original data not available for this inference',
        message: 'Original data overlay was not generated during inference'
      });
    }

    const downsampledPath = overlayData.path;
    
    if (!fs.existsSync(downsampledPath)) {
      return res.status(404).json({ error: 'Downsampled original data file not found' });
    }
    
    // Send the downsampled TIFF file
    res.sendFile(path.resolve(downsampledPath));
    
  } catch (error) {
    logger.error('Error serving downsampled original data:', error);
    res.status(500).json({ error: 'Failed to serve original data' });
  }
});

app.use('/models', express.static('models'));

// Reset session and delete all associated files
app.post('/reset-session', requireAuth, async (req, res) => {
  try {
    const sessionId = req.session.id;
    logger.info('Resetting session:', sessionId);
    
    // Clean up session-specific files and directories
    const sessionDir = path.join('uploads', sessionId);
    const modelDir = path.join('models', sessionId);
    const outputDir = path.join('outputs', sessionId);
    
    // Function to safely delete directory
    const deleteDirectory = (dirPath) => {
      if (fs.existsSync(dirPath)) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          logger.debug('Deleted directory:', dirPath);
          return true;
        } catch (error) {
          logger.error('Error deleting directory:', dirPath, error);
          return false;
        }
      }
      return true;
    };
    
    // Delete basic session directories
    deleteDirectory(sessionDir);
    deleteDirectory(modelDir);
    deleteDirectory(outputDir);
    
    // NEW: Clean up inference results directories
    // Get all training sessions for this session and delete their results
    const trainingIdsToCleanup = [];
    for (const [trainingId, training] of trainingSessions.entries()) {
      if (training.sessionId === sessionId) {
        trainingIdsToCleanup.push(trainingId);
        
        // Delete results directory for this training
        const trainingResultsDir = path.join('results', trainingId);
        deleteDirectory(trainingResultsDir);
        
        logger.debug('Cleaned up training results for:', trainingId);
      }
    }
    
    // NEW: Clean up inference results directories
    const inferenceIdsToCleanup = [];
    for (const [inferenceId, inference] of inferenceSessions.entries()) {
      if (inference.sessionId === sessionId) {
        inferenceIdsToCleanup.push(inferenceId);
        
        // Extract the results directory from the inference result if it exists
        if (inference.result && inference.result.output_path) {
          const resultPath = inference.result.output_path;
          const resultDir = path.dirname(resultPath);
          deleteDirectory(resultDir);
          logger.debug('Cleaned up inference results from:', resultDir);
        }
      }
    }
    
    // Clean up tracked imported model results directories
    if (req.session.importedModelResultsDirs && req.session.importedModelResultsDirs.length > 0) {
      logger.debug(`Cleaning up ${req.session.importedModelResultsDirs.length} tracked imported model directories`);

      for (const resultsDir of req.session.importedModelResultsDirs) {
        if (fs.existsSync(resultsDir)) {
          deleteDirectory(resultsDir);
          logger.debug('Cleaned up imported model results directory:', resultsDir);
        }
      }

      // Clear the tracking array
      req.session.importedModelResultsDirs = [];
    }
    
    // Clean up training sessions for this session
    for (const trainingId of trainingIdsToCleanup) {
      trainingSessions.delete(trainingId);
      logger.debug('Removed training session:', trainingId);
    }
    
    // Clean up inference sessions for this session
    for (const inferenceId of inferenceIdsToCleanup) {
      inferenceSessions.delete(inferenceId);
      logger.debug('Removed inference session:', inferenceId);
    }
    
    logger.info(`Session cleanup summary:
      - Training sessions removed: ${trainingIdsToCleanup.length}
      - Inference sessions removed: ${inferenceIdsToCleanup.length}
      - Directories cleaned: uploads/${sessionId}, models/${sessionId}, outputs/${sessionId}, and all associated results`);

    // Clear session data but keep user authenticated
    const user = req.session.user; // Preserve user info

    // Reset session data
    req.session.uploadedFiles = undefined;
    req.session.trainingConfig = undefined;
    req.session.currentTraining = undefined;
    req.session.importedModel = undefined;

    // Restore user info
    req.session.user = user;

    logger.info('Session reset completed successfully');
    res.json({
      success: true,
      message: 'Session reset successfully',
      cleanupSummary: {
        trainingSessions: trainingIdsToCleanup.length,
        inferenceSessions: inferenceIdsToCleanup.length
      }
    });
    
  } catch (error) {
    logger.error('Error in reset-session:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during session reset' 
    });
  }
});

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
  logger.debug('Client connected:', socket.id);
  
  socket.on('join-training', (trainingId) => {
    socket.join(`training-${trainingId}`);
    logger.debug(`Client ${socket.id} joined training room: training-${trainingId}`);
  });
  
  socket.on('join-inference', (inferenceId) => {
    socket.join(`inference-${inferenceId}`);
    logger.debug(`Client ${socket.id} joined inference room: inference-${inferenceId}`);
    
    // Send a confirmation message
    socket.emit('inference-room-joined', { inferenceId: inferenceId });
  });

  socket.on('disconnect', () => {
    logger.debug('Client disconnected:', socket.id);
  });
});

// Helper functions
async function validateTiffStacks(rawPath, annotationPath) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      'python/validate_tiff.py',
      rawPath,
      annotationPath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
      // Log Python output to console for debugging (includes conversion messages)
      const message = data.toString().trim();
      if (message) {
        logger.debug('[Python Validation]:', message);
      }
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
      // Log errors to console
      const message = data.toString().trim();
      if (message) {
        logger.error('[Python Validation Error]:', message);
      }
    });

    pythonScript.on('close', (code) => {
      // Always try to parse the JSON output first, regardless of exit code
      // The Python script always outputs valid JSON
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        // If JSON parsing fails, fall back to generic error
        logger.error('Failed to parse validation output:', output);
        logger.error('Stderr:', error);
        resolve({ 
          valid: false, 
          error: error || 'Invalid validation output - failed to parse JSON response'
        });
      }
    });
  });
}

// Helper function to validate imported model
async function validateImportedModel(modelPath, configPath) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      'python/validate_imported_model.py',
      modelPath,
      configPath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonScript.on('close', (code) => {
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        resolve({
          success: false,
          error: 'Failed to parse validation results: ' + (error || e.message)
        });
      }
    });
  });
}

function validateTrainingConfig(config) {
  const errors = [];
  
  // Required fields
  const required = ['patch_size', 'patches_per_image', 'batch_size', 'num_epochs', 'learning_rate', 'features', 'num_layers'];
  
  for (const field of required) {
    if (!config[field]) {
      errors.push(`${field} is required`);
    }
  }

  // Validate ranges
  if (config.patch_size && (config.patch_size < 64 || config.patch_size > 1024)) {
    errors.push('patch_size must be between 64 and 1024');
  }

  if (config.learning_rate && (config.learning_rate <= 0 || config.learning_rate > 1)) {
    errors.push('learning_rate must be between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function startTrainingProcess(params, io) {
  const pythonScript = spawn(PYTHON_PATH, [
    'python/train_model.py',
    '--config', JSON.stringify(params.config),
    '--raw_images', params.raw_images,
    '--annotations', params.annotations,
    '--output_dir', params.output_dir,
    '--training_id', params.training_id
  ]);

  // Attach unified error handler (handles spawn errors and stderr buffering)
  const stderrBuffer = attachErrorHandler(
    pythonScript,
    createTrainingErrorHandler(params.training_id, PYTHON_PATH, io, trainingSessions)
  );

  let outputBuffer = '';

  pythonScript.stdout.on('data', (data) => {
    const output = data.toString();
    logger.debug('Training output:', output);

    // Add to buffer
    outputBuffer += output;

    // Process complete lines
    const lines = outputBuffer.split('\n');
    outputBuffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('PROGRESS:')) {
        try {
          const progressData = line.substring(9);
          const progress = JSON.parse(progressData);

          logger.debug('Parsed progress:', progress);

          // Update training session
          const training = trainingSessions.get(params.training_id);
          if (training) {
            training.status = 'training';
            training.current_epoch = progress.epoch;
            training.total_epochs = progress.total_epochs;
            training.metrics = progress.metrics;
          }

          // Send real-time update to clients
          io.to(`training-${params.training_id}`).emit('training-progress', progress);
          logger.debug(`Emitted progress to room: training-${params.training_id}`);

        } catch (e) {
          logger.error('Error parsing progress data:', e.message);
        }
      }
    }
  });

  pythonScript.on('close', async (code) => {
    const training = trainingSessions.get(params.training_id);
    if (training) {
      if (code === 0) {
        training.status = 'completed';
        training.endTime = new Date();
        io.to(`training-${params.training_id}`).emit('training-complete', { success: true });

        // Track training outputs in file browser
        const modelPath = path.join(params.output_dir, 'best_model.pth');
        const configPath = path.join(params.output_dir, 'config.json');
        const resultsPath = path.join(params.output_dir, 'results.json');

        if (fs.existsSync(modelPath)) {
          await trackModuleOutput(training.sessionId, modelPath, 'models');
        }
        if (fs.existsSync(configPath)) {
          await trackModuleOutput(training.sessionId, configPath, 'models');
        }
        if (fs.existsSync(resultsPath)) {
          await trackModuleOutput(training.sessionId, resultsPath, 'models');
        }
      } else {
        training.status = 'failed';
        training.endTime = new Date();

        // Include stderr output in error message
        const stderrOutput = stderrBuffer.getBuffer();
        const errorMessage = stderrOutput || 'Training failed with unknown error';

        logger.error(`[TRAINING] Process failed with code ${code}`);
        logger.error(`[TRAINING] stderr output: ${stderrOutput}`);

        io.to(`training-${params.training_id}`).emit('training-complete', {
          success: false,
          error: errorMessage
        });
      }
    }
  });
}

async function validateInferenceTiff(filePath) {
  return new Promise((resolve) => {
    const pythonScript = spawn(PYTHON_PATH, [
      'python/validate_inference_tiff.py',
      filePath
    ]);

    let output = '';
    let error = '';

    pythonScript.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonScript.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonScript.on('close', (code) => {
      // Always try to parse the JSON output first, regardless of exit code
      // The Python script always outputs valid JSON
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        // If JSON parsing fails, fall back to generic error
        logger.error('Failed to parse validation output:', output);
        logger.error('Stderr:', error);
        resolve({ 
          valid: false, 
          error: error || 'Invalid validation output - failed to parse JSON response'
        });
      }
    });
  });
}

async function runInferenceWithProgress(modelPath, dataPath, outputPath, inferenceId, io) {
  return new Promise((resolve, reject) => {
    const pythonScript = spawn(PYTHON_PATH, [
      'python/run_inference.py',
      '--model', modelPath,
      '--input', dataPath,
      '--output', outputPath,
      '--inference_id', inferenceId
    ]);

    // Attach unified error handler (handles spawn errors and stderr buffering)
    const stderrBuffer = attachErrorHandler(
      pythonScript,
      createInferenceErrorHandler(inferenceId, PYTHON_PATH, io, inferenceSessions, (error) => {
        // Custom error callback - reject the promise on spawn error
        reject(error);
      })
    );

    let outputBuffer = '';
    let finalResult = null;
    let backupJsonLines = [];
    let collectingBackupJson = false;

    pythonScript.stdout.on('data', (data) => {
      const output = data.toString();
      logger.debug('Inference output:', output);
      
      // Add to buffer
      outputBuffer += output;
      
      // Process complete lines
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('INFERENCE_PROGRESS:')) {
          try {
            const progressData = line.substring(19);
            const progress = JSON.parse(progressData);
            
            logger.debug('Parsed inference progress:', progress);
            
            // Update inference session
            const inference = inferenceSessions.get(inferenceId);
            if (inference) {
              inference.currentSlice = progress.current_slice;
              inference.totalSlices = progress.total_slices;
              inference.progress = progress.progress_percent;
            }
            
            // Send real-time update to clients
            io.to(`inference-${inferenceId}`).emit('inference-progress', progress);
            logger.debug(`Emitted inference progress to room: inference-${inferenceId}`);
            
          } catch (e) {
            logger.error('Error parsing inference progress data:', e.message);
          }
        } else if (line.startsWith('FINAL_RESULT:')) {
          try {
            const resultData = line.substring(13);
            finalResult = JSON.parse(resultData);
            logger.debug('Parsed final result:', finalResult);
          } catch (e) {
            logger.error('Error parsing final result:', e.message);
            finalResult = { success: false, error: 'Failed to parse final result' };
          }
        } else if (line === 'BACKUP_JSON_START') {
          collectingBackupJson = true;
          backupJsonLines = [];
          logger.debug('Started collecting backup JSON');
        } else if (line === 'BACKUP_JSON_END') {
          collectingBackupJson = false;
          logger.debug('Finished collecting backup JSON');
          
          // Try to parse backup JSON if we don't have final result yet
          if (!finalResult && backupJsonLines.length > 0) {
            try {
              const backupJsonString = backupJsonLines.join('\n');
              finalResult = JSON.parse(backupJsonString);
              logger.debug('Successfully parsed backup JSON:', finalResult);
            } catch (e) {
              logger.error('Failed to parse backup JSON:', e.message);
            }
          }
        } else if (collectingBackupJson) {
          backupJsonLines.push(line);
        }
      }
    });

    pythonScript.on('close', async (code) => {
      const inference = inferenceSessions.get(inferenceId);

      logger.debug(`[INFERENCE] Python script finished with code: ${code}`);
      logger.debug(`[INFERENCE] Final result found: ${finalResult ? 'yes' : 'no'}`);

      // STEP 1: Handle non-zero exit codes (failures)
      if (code !== 0) {
        const stderrOutput = stderrBuffer.getBuffer();
        const errorMessage = stderrOutput || 'Inference failed with unknown error';

        logger.error(`[INFERENCE] Process failed with code ${code}`);
        logger.error(`[INFERENCE] Error output: ${stderrOutput}`);

        if (inference) {
          inference.status = 'failed';
          inference.endTime = new Date();
        }

        io.to(`inference-${inferenceId}`).emit('inference-complete', {
          success: false,
          error: errorMessage
        });
        reject(new Error(`Inference failed with code ${code}: ${errorMessage}`));
        return;
      }

      // STEP 2: Determine result source and parse result
      let result = null;
      let resultSource = null;

      if (finalResult) {
        // Source 1: FINAL_RESULT prefix from Python script
        result = finalResult;
        resultSource = 'FINAL_RESULT';
        logger.debug('[INFERENCE] Using FINAL_RESULT from Python script');
      } else {
        // Source 2: Try to parse JSON from output buffer
        logger.debug('[INFERENCE] No FINAL_RESULT found, trying to parse buffer...');
        const jsonMatch = outputBuffer.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          try {
            result = JSON.parse(jsonMatch[0]);
            resultSource = 'BUFFER_JSON';
            logger.debug('[INFERENCE] Successfully parsed JSON from buffer');
          } catch (e) {
            logger.error('[INFERENCE] Failed to parse buffer JSON:', e.message);
          }
        }

        // Source 3: Create manual result as last resort
        if (!result) {
          result = {
            success: true,
            output_path: outputPath,
            metadata_path: outputPath.replace('.tif', '_metadata.json'),
            visualization_path: outputPath.replace('.tif', '') + '_visualization_data.json',
            metrics: { message: 'Inference completed but metrics not available' }
          };
          resultSource = 'MANUAL';
          logger.debug('[INFERENCE] Created manual result (no JSON output found)');
        }
      }

      // STEP 3: Update session status
      if (inference) {
        inference.status = 'completed';
        inference.endTime = new Date();
      }

      // STEP 4: Track files ONCE (single tracking point)
      if (inference && result) {
        await trackInferenceResults(result, inferenceId, inference.sessionId, resultSource);
      }

      // STEP 5: Convert paths to web-accessible format
      if (inference && result) {
        const workspacePath = workspaceManager.getWorkspacePath(inference.sessionId);
        result = convertResultPathsForWeb(result, inference.sessionId, workspacePath);
        logger.debug('[INFERENCE] Converted paths for web access');
      }

      // STEP 6: Emit completion event
      io.to(`inference-${inferenceId}`).emit('inference-complete', {
        success: true,
        result: result
      });

      // STEP 7: Resolve or reject promise
      if (result && result.success) {
        resolve(result);
      } else {
        reject(new Error(result?.error || 'Inference failed'));
      }
    });
  });
}

function startInferenceProcess(modelPath, dataPath, outputPath, inferenceId, io) {
  // Update inference session status
  const inference = inferenceSessions.get(inferenceId);
  if (inference) {
    inference.status = 'running';
  }
  
  // Start the inference process
  runInferenceWithProgress(modelPath, dataPath, outputPath, inferenceId, io)
    .then((result) => {
      logger.info('Inference completed successfully:', result);
      
      // Update inference session with final result
      const inference = inferenceSessions.get(inferenceId);
      if (inference) {
        inference.status = 'completed';
        inference.endTime = new Date();
        inference.result = result;
      }
      
    })
    .catch((error) => {
      logger.error('Inference failed:', error);
      
      // Update inference session with error
      const inference = inferenceSessions.get(inferenceId);
      if (inference) {
        inference.status = 'failed';
        inference.endTime = new Date();
        inference.error = error.message;
      }
      
    });
}

// Get inference status
app.get('/inference-status/:inferenceId', requireAuth, (req, res) => {
  const inferenceId = req.params.inferenceId;
  const inference = inferenceSessions.get(inferenceId);
  
  if (!inference) {
    return res.status(404).json({ error: 'Inference session not found' });
  }

  res.json(inference);
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 200MB)' });
    }
  }
  res.status(500).json({ error: error.message });
});

server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});