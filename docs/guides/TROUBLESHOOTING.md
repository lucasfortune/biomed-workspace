# Troubleshooting Guide

> **Goal:** Quickly resolve common issues
> **Time:** As needed
> **Prerequisites:** Basic understanding of the application

## Overview

This guide covers common issues, their causes, and solutions. Issues are organized by category for quick navigation.

**Quick Navigation:**
- [Installation & Setup](#installation--setup)
- [Server Issues](#server-issues)
- [Authentication & Users](#authentication--users)
- [File Upload Issues](#file-upload-issues)
- [Training Issues](#training-issues)
- [Inference Issues](#inference-issues)
- [Visualization Issues](#visualization-issues)
- [Phase-Specific Issues](#phase-specific-issues)

---

## Installation & Setup

### Port Already in Use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Cause:** Another application is using port 3000

**Solution:**
```bash
# Option 1: Use different port
PORT=3001 npm start

# Option 2: Kill process on port 3000 (Mac/Linux)
lsof -ti:3000 | xargs kill -9

# Option 2: Kill process on port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

### Python Dependencies Won't Install

**Symptoms:**
```
ERROR: Could not build wheels for torch
```

**Cause:** Missing build tools or incompatible Python version

**Solution:**
```bash
# Ensure Python 3.8+
python --version

# Install build tools (Ubuntu/Debian)
sudo apt-get install python3-dev build-essential

# Install build tools (Mac)
xcode-select --install

# Try installing with --no-cache-dir
pip install --no-cache-dir -r requirements.txt
```

---

### Node Modules Installation Fails

**Symptoms:**
```
npm ERR! code EACCES
npm ERR! syscall access
```

**Cause:** Permission issues

**Solution:**
```bash
# Option 1: Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Option 2: Clear cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Option 3: Use sudo (NOT recommended)
sudo npm install --unsafe-perm=true
```

---

## Server Issues

### Server Crashes on Start

**Symptoms:**
Server starts then immediately crashes

**Check:**
1. All dependencies installed
2. Required directories exist
3. No syntax errors in recent code changes

**Solution:**
```bash
# Check for errors
DEBUG=* npm start

# Verify all directories
mkdir -p uploads models results workspaces

# Check Node version
node --version  # Should be v18+
```

---

### Session Secret Warning

**Symptoms:**
```
Warning: Using hardcoded session secret in production
```

**Cause:** No SESSION_SECRET environment variable set

**Solution:**
```bash
# Create .env file
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env

# Or set environment variable
export SESSION_SECRET="your-secure-random-string"
npm start
```

---

### Socket.IO Connection Issues

**Symptoms:**
- Real-time updates not working
- Training progress not showing
- Console error: "WebSocket connection failed"

**Cause:** Proxy or firewall blocking WebSocket

**Solution:**
1. Check browser console for specific error
2. Verify server is running
3. Try accessing directly (no proxy)
4. Check firewall settings

---

## Authentication & Users

### Can't Login - "Invalid Credentials"

**Symptoms:**
Login fails with correct username/password

**Check:**
```bash
# List all users
node manageUsers.js list

# Check user status
cat users.json | grep "username"
```

**Common Causes:**
- Username is case-sensitive
- Password is case-sensitive
- User status is "pending" (needs approval)
- `users.json` is corrupted

**Solution:**
```bash
# Reset password
node manageUsers.js reset-password username newpassword

# Approve pending user
node manageUsers.js approve username
```

---

### No Admin User Exists

**Symptoms:**
Can't access admin panel, no users can be approved

**Solution:**
```bash
# Create first admin user
node manageUsers.js add-admin admin SecurePass123 "Admin User" "admin@example.com" "Institution"
```

---

### User Registration Not Working

**Symptoms:**
Registration form submits but user not created

**Check:**
1. Write permissions on project directory
2. `users.json` is valid JSON
3. No duplicate username

**Solution:**
```bash
# Check users.json
cat users.json

# If corrupted, restore from backup or recreate
mv users.json users.json.backup
echo "{}" > users.json
```

---

## File Upload Issues

### File Upload Fails - "File Too Large"

**Symptoms:**
```
Error: File too large
```

**Cause:** File exceeds 200MB limit (default)

**Solution:**
Edit `server.js` around line 40:
```javascript
const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // Increase to 500MB
});
```

Then restart server.

---

### TIFF Validation Fails

**Symptoms:**
```
Error: Invalid TIFF format
Error: Dimensions mismatch
```

**Causes:**
- File is not a valid TIFF
- Image stack is 2D instead of 3D
- Annotations don't match image dimensions

**Solution:**
```bash
# Check TIFF with Python
python -c "import tifffile; img = tifffile.imread('file.tif'); print(img.shape, img.dtype)"

# Expected output for valid stack:
# (depth, height, width) uint8 or uint16
```

**Requirements:**
- Images: 3D stack (depth, height, width), uint8 or uint16
- Annotations: Same dimensions as images, uint8 only
- Classes: 0-255 (typically 0-3)

---

## Training Issues

### Training Won't Start

**Symptoms:**
Click "Start Training" but nothing happens

**Check:**
1. Data uploaded and validated
2. Training configuration set
3. Browser console for errors (F12)
4. Server logs for Python errors

**Solution:**
```bash
# Check server logs
tail -f logs/activity.log

# Verify Python environment
source venv/bin/activate  # If using venv
python -c "import torch; print(torch.__version__)"

# Test Python script manually
python python/train_model.py --help
```

---

### CUDA Out of Memory

**Symptoms:**
```
RuntimeError: CUDA out of memory
```

**Cause:** Batch size or patch size too large for GPU

**Solution:**
1. Reduce batch size (try 1 or 2)
2. Reduce patch size (try 64x64 or 128x128)
3. Close other GPU applications
4. Use CPU instead (automatic fallback)

**Prevention:**
- Start with small batch size (1-2)
- Increase gradually if training succeeds
- Monitor GPU memory usage

---

### Training Progress Not Updating

**Symptoms:**
- Charts not updating
- Progress bar stuck
- No real-time updates

**Cause:** Socket.IO connection issue

**Solution:**
1. Check browser console (F12) for WebSocket errors
2. Verify server is running
3. Try refreshing page
4. Check network tab for blocked connections

---

### Training Completes But No Model Saved

**Symptoms:**
Training finishes but can't download model

**Check:**
```bash
# Check models directory
ls -la models/{sessionId}/{trainingId}/

# Should contain:
# best_model.pth
# config.json
# results.json
```

**Solution:**
- Verify write permissions
- Check disk space
- Review server logs for errors

---

## Inference Issues

### Inference Starts But Never Completes

**Symptoms:**
- Progress shows but gets stuck
- Never reaches 100%
- No final result

**Check:**
1. Python process still running: `ps aux | grep run_inference`
2. Server logs for errors
3. Disk space available

**Solution:**
```bash
# Kill stuck process
pkill -f run_inference.py

# Check disk space
df -h

# Restart inference with smaller data
```

---

### Inference Result Download Fails

**Symptoms:**
Can't download segmented TIFF

**Check:**
```bash
# Verify result file exists
ls -la results/{trainingId}/inference_result.tif

# Check file permissions
chmod 644 results/{trainingId}/inference_result.tif
```

---

## Visualization Issues

### 3D Visualization Doesn't Load

**Symptoms:**
- Black screen
- "WebGL not supported" error
- Visualization panel empty

**Cause:** WebGL not available or disabled

**Solution:**
1. Test WebGL support: https://get.webgl.org/
2. Try different browser
3. Update graphics drivers
4. Enable hardware acceleration in browser settings

**Browser-Specific:**
- **Chrome:** Settings → Advanced → System → Enable hardware acceleration
- **Firefox:** about:config → webgl.disabled → false

---

## Getting More Help

### Enable Debug Mode

```bash
DEBUG=* npm start
```

Shows detailed logs for all operations.

---

### Check Logs

```bash
# Activity log
tail -f logs/activity.log

# Server output
# (Watch terminal where npm start is running)
```

---

### Browser Developer Tools

Press `F12` and check:
- **Console:** JavaScript errors
- **Network:** Failed requests (look for red items)
- **Application:** Session storage, cookies

---

### Common Error Patterns

| Error Message | Likely Cause | See Section |
|---------------|--------------|-------------|
| "Port already in use" | Port conflict | [Server Issues](#port-already-in-use) |
| "CUDA out of memory" | GPU memory | [Training Issues](#cuda-out-of-memory) |
| "File too large" | Upload limit | [File Upload](#file-upload-fails---file-too-large) |
| "WebSocket connection failed" | Socket.IO | [Server Issues](#socketio-connection-issues) |
| "Invalid credentials" | Auth problem | [Authentication](#cant-login---invalid-credentials) |
| "WebGL not supported" | Browser/GPU | [Visualization](#3d-visualization-doesnt-load) |

---

## Still Stuck?

1. **Review Architecture:** [docs/architecture/OVERVIEW.md](../architecture/OVERVIEW.md) to understand system
2. **GitHub Issues:** https://github.com/lucasfortune/biomed-workspace/issues

---

**Navigation:**
← Back to [Documentation Index](../INDEX.md) | See Also: [Getting Started](GETTING_STARTED.md) →

---

**Last Updated:** 2025-11-27
**Coverage:** Installation, Server, Auth, Files, Training, Inference, Visualization
