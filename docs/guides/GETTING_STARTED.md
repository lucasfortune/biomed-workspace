# Getting Started Guide

> **Goal:** Get the Biomedical Image Processing Workspace up and running in 15 minutes
> **Time:** 15-20 minutes
> **Prerequisites:** Basic command line knowledge

## Overview

This guide will walk you through installing and running the application for the first time. You'll learn how to set up both the backend (Node.js + Python) and choose between the Classic or Workspace interface.

By the end of this guide, you'll have:
- A running server on `http://localhost:3000`
- An admin user account
- Access to both Classic and Workspace versions
- Understanding of the dual-version architecture

---

## Before You Begin

**System Requirements:**
- [ ] Node.js v18 or higher
- [ ] Python 3.8 or higher
- [ ] 8GB RAM minimum (16GB recommended for ML training)
- [ ] 5GB free disk space
- [ ] Modern web browser (Chrome, Firefox, Safari, or Edge)

**Check Your Versions:**
```bash
node --version   # Should show v18.x.x or higher
python --version # Should show 3.8.x or higher
npm --version    # Should show 8.x.x or higher
```

---

## Installation Steps

### Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/lucasfortune/viz_app.git
cd viz_app

# Verify you're in the right directory
ls -la  # You should see package.json, server.js, etc.
```

**What This Does:**
Downloads the complete project to your local machine.

---

### Step 2: Install Node.js Dependencies

```bash
npm install
```

**Expected Output:**
```
added XXX packages in Xs
```

**What This Does:**
Installs all required Node.js packages including Express, Socket.IO, and other dependencies listed in `package.json`.

**Troubleshooting:**
- If you see EACCES errors, you may need to fix npm permissions
- If you see version conflicts, try deleting `node_modules/` and `package-lock.json`, then run `npm install` again

---

### Step 3: Set Up Python Environment

**Option A: Using Virtual Environment (Recommended)**
```bash
# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Verify activation (should show path to venv)
which python  # On Windows: where python

# Install Python dependencies
pip install -r requirements.txt
```

**Option B: Global Installation (Not Recommended)**
```bash
pip install -r requirements.txt
```

**Expected Output:**
```
Successfully installed torch-X.X.X tifffile-X.X.X numpy-X.X.X ...
```

**What This Does:**
Installs PyTorch, tifffile, numpy, and other ML/image processing libraries.

**Troubleshooting:**
- CUDA errors: PyTorch will fall back to CPU automatically
- Wheel build errors: You may need to install build tools (gcc, python-dev)

---

### Step 4: Create Required Directories

```bash
mkdir -p uploads models results workspaces
```

**What This Does:**
Creates directories for:
- `uploads/` - User-uploaded TIFF files
- `models/` - Trained ML models
- `results/` - Inference results
- `workspaces/` - Session-based workspaces

---

### Step 5: Start the Server

```bash
npm start
```

**Expected Output:**
```
> biomedical-segmentation-interface@1.0.0 start
> node server.js

Server running on http://localhost:3000
```

**What This Does:**
Starts the Express server with Socket.IO for real-time updates.

**Troubleshooting:**
- **Port already in use:** Run `PORT=3001 npm start`
- **Module not found:** Re-run `npm install`
- **Python errors:** Ensure virtual environment is activated

---

### Step 6: Create Admin User

**Open a new terminal** (keep the server running in the first one):

```bash
# Navigate to project directory
cd /path/to/viz_app

# Create admin user
node manageUsers.js add-admin myusername mypassword "My Full Name" "email@example.com" "My Institution"
```

**Example:**
```bash
node manageUsers.js add-admin admin SecurePassword123 "John Doe" "john@lab.edu" "Research Lab"
```

**Expected Output:**
```
✅ Admin user created successfully!
Username: admin
Status: active
Role: admin
```

**What This Does:**
Creates the first admin user with full permissions. This user can approve other users and access all features.

**Security Note:**
- Use a strong password
- This user has full system access
- You can create additional users through the web interface later

---

### Step 7: Access the Application

1. **Open your browser** and navigate to:
   ```
   http://localhost:3000
   ```

2. **You should see the login page**

3. **Login** with the admin credentials you just created

4. **Choose a version:**
   - **Workspace** (recommended): New modular interface
   - **Classic**: Original linear workflow

---

## Understanding the Dual-Version Architecture

### Workspace Version (Recommended)
**Best for:** Modular workflows, future expansion, modern UI

**Features:**
- Module-based interface (currently: Segmentation)
- IDE-like experience
- State management system
- Extensible architecture

**Status:** Phase 2 Complete

**Access:** Click "Launch Workspace" on welcome page

---

### Classic Version (Stable)
**Best for:** Traditional workflow, proven stability

**Features:**
- Linear 5-step workflow
- All original functionality
- Stable and tested
- Complete ML pipeline

**Status:** Fully functional, maintained

**Access:** Click "Launch Classic App" on welcome page

---

## Quick Test with Sample Data

### Test the Workspace Version

1. **Launch Workspace** from welcome page
2. **Click "Segmentation" module** card
3. **Step 1: Upload Data**
   - Click "Use Test Data"
   - Test data loads automatically
4. **Step 2: Configure Training**
   - Leave default settings
   - Click "Next"
5. **Step 3: Train Model**
   - Click "Start Training"
   - Watch real-time progress charts
   - Wait ~2-5 minutes (depends on hardware)
6. **Step 4: Run Inference**
   - Click "Use Test Data"
   - Click "Run Inference"
   - Wait ~30 seconds
7. **Step 5: 3D Visualization**
   - Interact with 3D view (rotate, zoom)
   - Toggle class visibility
   - Adjust opacity sliders

**Success!** You've completed a full ML pipeline workflow.

---

## User Management

### Approve New Users (Admin Only)

1. Navigate to `http://localhost:3000/admin`
2. View pending users
3. Click "Approve" or "Reject"

**Command Line Alternative:**
```bash
# List all users
node manageUsers.js list

# List pending users
node manageUsers.js list-pending

# Approve a user
node manageUsers.js approve username

# Reject a user
node manageUsers.js reject username
```

---

## Common Workflows

### Development Mode (Auto-Reload)
```bash
npm run dev
```
Server restarts automatically when you edit files.

### Custom Port
```bash
PORT=3001 npm start
```

### Check Logs
```bash
tail -f logs/activity.log
```

### Reset a Session
1. Login as user
2. Navigate to desired version
3. Click "Reset Session" (if available)

**Command Line:**
- Session data is automatically cleaned up on logout
- Manual cleanup: Delete `uploads/{sessionId}/` and `models/{sessionId}/`

---

## Verification Checklist

After completing this guide, verify:

- [ ] Server starts without errors
- [ ] Can login with admin account
- [ ] Can access welcome page
- [ ] Can launch Workspace version
- [ ] Can launch Classic version
- [ ] Test data workflow completes successfully
- [ ] 3D visualization renders correctly
- [ ] Can logout and login again

---

## Next Steps

**After setup:**
1. [ ] Read [Architecture Overview](../architecture/OVERVIEW.md) to understand system design
2. [ ] Try uploading custom TIFF data
3. [ ] Explore [API Reference](../reference/API_ENDPOINTS.md)
4. [ ] Learn to [create modules](MODULE_CREATION.md) (if developing)

**For developers:**
1. [ ] Review [CLAUDE.md](../../CLAUDE.md) for development guidelines
2. [ ] Check [Session Logs](../sessions/INDEX.md) for recent changes
3. [ ] Read [Architecture Decisions](../decisions/) for design rationale

---

## Troubleshooting

### Server won't start
**Check:**
- Port 3000 not in use: `lsof -i :3000` (Mac/Linux) or `netstat -ano | findstr :3000` (Windows)
- All dependencies installed: Delete `node_modules/`, run `npm install`
- Python environment activated

### Can't create admin user
**Check:**
- You're in the project directory
- `users.json` doesn't already exist with that username
- You have write permissions

### Login fails
**Check:**
- Username/password correct (case-sensitive)
- `users.json` exists and is valid JSON
- Server is running

### 3D visualization doesn't load
**Check:**
- Browser supports WebGL (test at https://get.webgl.org/)
- No console errors (press F12)
- Inference completed successfully

### Python errors during training
**Check:**
- Virtual environment activated
- PyTorch installed: `python -c "import torch; print(torch.__version__)"`
- Enough disk space for model files
- CUDA available (optional): `python -c "import torch; print(torch.cuda.is_available())"`

**For more issues:** See [Troubleshooting Guide](TROUBLESHOOTING.md)

---

## Configuration Options

### Environment Variables

Create `.env` file in project root:
```bash
PORT=3000
SESSION_SECRET=your-secret-key-here
MAX_FILE_SIZE=209715200  # 200MB in bytes
```

### Python Settings

Edit `requirements.txt` to change PyTorch version or add packages.

### File Upload Limits

Edit `server.js` around line 40:
```javascript
const upload = multer({
  storage: storage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB
});
```

---

## Additional Resources

- **Main Documentation:** [docs/INDEX.md](../INDEX.md)
- **API Reference:** [docs/reference/API_ENDPOINTS.md](../reference/API_ENDPOINTS.md)
- **Deployment Guide:** [docs/guides/DEPLOYMENT.md](DEPLOYMENT.md)
- **GitHub Issues:** https://github.com/lucasfortune/viz_app/issues

---

**Navigation:**
← Back to [Documentation Index](../INDEX.md) | Next: [Architecture Overview](../architecture/OVERVIEW.md) →

---

**Last Updated:** 2025-11-27
**Difficulty:** Beginner
**Estimated Time:** 15-20 minutes
