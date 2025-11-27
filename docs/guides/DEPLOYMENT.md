# Deployment Guide

**Guide Type:** Step-by-Step Production Deployment
**Difficulty:** Intermediate to Advanced
**Time Required:** 2-4 hours (initial setup)
**Last Updated:** 2025-11-27

---

## Overview

This guide covers deploying the Biomedical Image Processing Workspace to a production environment. It includes server configuration, security hardening, process management, and monitoring setup.

**What You'll Learn:**
- Production server requirements and setup
- Environment configuration and secrets management
- HTTPS/SSL certificate setup
- Redis session storage configuration
- Process management with PM2
- Reverse proxy with nginx
- Security hardening checklist
- Monitoring and logging
- Backup strategies
- Common deployment issues

**Prerequisites:**
- Linux server (Ubuntu 20.04+ or similar)
- Root or sudo access
- Domain name (for HTTPS)
- Basic Linux/bash knowledge
- Git installed on server

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Initial Server Setup](#initial-server-setup)
3. [Install Dependencies](#install-dependencies)
4. [Environment Configuration](#environment-configuration)
5. [Redis Session Storage](#redis-session-storage)
6. [HTTPS/SSL Setup](#httpsssl-setup)
7. [Process Management (PM2)](#process-management-pm2)
8. [Reverse Proxy (nginx)](#reverse-proxy-nginx)
9. [Security Hardening](#security-hardening)
10. [Monitoring & Logging](#monitoring--logging)
11. [Backup Strategy](#backup-strategy)
12. [Deployment Checklist](#deployment-checklist)
13. [Troubleshooting](#troubleshooting)
14. [Maintenance](#maintenance)

---

## System Requirements

### Minimum Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| **CPU** | 2 cores | 4+ cores |
| **RAM** | 4 GB | 8+ GB |
| **Storage** | 50 GB | 100+ GB SSD |
| **Network** | 100 Mbps | 1 Gbps |
| **OS** | Ubuntu 20.04 | Ubuntu 22.04 LTS |

### Software Requirements

| Software | Version | Purpose |
|----------|---------|---------|
| **Node.js** | v16+ (v18+ recommended) | Application runtime |
| **Python** | 3.8+ | ML pipeline |
| **Redis** | 6.0+ | Session storage |
| **nginx** | 1.18+ | Reverse proxy |
| **PM2** | 5.0+ | Process manager |
| **Git** | 2.0+ | Code deployment |

### Storage Considerations

**File Storage Estimates:**
- TIFF uploads: 100-500 MB per file
- Trained models: 10-100 MB per model
- Results: 100-500 MB per inference
- Logs: 1-10 MB per day

**Recommendations:**
- Use SSD for fast I/O (large TIFF files)
- Plan for 50-100 GB per 50 active users
- Set up automated cleanup for old sessions
- Consider object storage (S3) for large deployments

---

## Initial Server Setup

### 1. Create Deployment User

```bash
# Create user for running the application
sudo adduser biomedapp
sudo usermod -aG sudo biomedapp

# Switch to deployment user
su - biomedapp
```

### 2. Configure SSH Key Authentication

```bash
# On your local machine, copy SSH key to server
ssh-copy-id biomedapp@your-server-ip

# On server, disable password authentication (optional, after testing key auth)
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart sshd
```

### 3. Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

### 4. Update System

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential
```

---

## Install Dependencies

### 1. Install Node.js (v18 LTS)

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version
```

### 2. Install Python & Dependencies

```bash
# Install Python 3.10+
sudo apt install -y python3.10 python3.10-venv python3-pip

# Verify installation
python3 --version  # Should show 3.10+
```

### 3. Install Redis

```bash
# Install Redis server
sudo apt install -y redis-server

# Configure Redis to start on boot
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify Redis is running
redis-cli ping  # Should return "PONG"
```

### 4. Install nginx

```bash
# Install nginx
sudo apt install -y nginx

# Start nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Verify nginx is running
sudo systemctl status nginx
```

### 5. Install PM2 (Process Manager)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Configure PM2 to start on boot
pm2 startup systemd
# Run the command it outputs (will be something like):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u biomedapp --hp /home/biomedapp

# Verify PM2
pm2 --version
```

---

## Environment Configuration

### 1. Clone Repository

```bash
# Clone to home directory
cd ~
git clone https://github.com/yourusername/viz_app.git
cd viz_app

# Or pull latest changes
git pull origin main
```

### 2. Create `.env` File

```bash
# Create production .env file
nano .env
```

**Production `.env` Template:**

```bash
# Server Configuration
NODE_ENV=production
PORT=3000

# Session Secret (CRITICAL: Generate strong random secret)
SESSION_SECRET=your-very-long-random-secret-here-min-32-chars

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password-here  # Optional but recommended

# File Upload Limits
MAX_FILE_SIZE=524288000  # 500 MB in bytes

# Python Virtual Environment Path
PYTHON_VENV=/home/biomedapp/viz_app/venv/bin/python

# Logging
LOG_LEVEL=info
LOG_FILE=/home/biomedapp/viz_app/logs/app.log

# Domain (for HTTPS)
DOMAIN=yourdomain.com

# Admin Email (for notifications)
ADMIN_EMAIL=admin@yourdomain.com
```

**Generate Session Secret:**

```bash
# Generate strong random secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Set File Permissions

```bash
# Secure .env file
chmod 600 .env

# Set ownership
sudo chown -R biomedapp:biomedapp /home/biomedapp/viz_app
```

### 4. Install Node.js Dependencies

```bash
cd /home/biomedapp/viz_app
npm ci --production  # Use ci for deterministic installs
```

### 5. Set Up Python Virtual Environment

```bash
# Create virtual environment
python3 -m venv venv

# Activate and install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Verify PyTorch installation
python -c "import torch; print(torch.__version__)"

# Deactivate
deactivate
```

### 6. Create Required Directories

```bash
# Create data directories
mkdir -p uploads models results test_data sessions logs

# Set permissions
chmod 755 uploads models results test_data sessions
chmod 755 logs
```

---

## Redis Session Storage

By default, the application uses file-based session storage. For production, Redis is recommended for better performance and scalability.

### 1. Install Redis Client for Node.js

```bash
cd /home/biomedapp/viz_app
npm install redis connect-redis --save
```

### 2. Configure Redis Password (Recommended)

```bash
# Edit Redis configuration
sudo nano /etc/redis/redis.conf

# Find and uncomment/set:
requirepass your-strong-redis-password-here

# Restart Redis
sudo systemctl restart redis-server

# Test authentication
redis-cli -a your-strong-redis-password-here ping  # Should return "PONG"
```

### 3. Update `server.js` for Redis Sessions

**Find this section in `server.js` (around line 25-35):**

```javascript
// Current file-based session storage
const FileStore = require('session-file-store')(session);

app.use(session({
  store: new FileStore({
    path: './sessions',
    ttl: 86400 * 7,
    retries: 0
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,  // Set to true with HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));
```

**Replace with Redis configuration:**

```javascript
// Redis session storage (production)
const redis = require('redis');
const RedisStore = require('connect-redis').default;

// Create Redis client
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  legacyMode: true
});

redisClient.connect().catch(console.error);

redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

redisClient.on('connect', () => {
  console.log('Redis client connected');
});

// Session configuration with Redis
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',  // true in production with HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7  // 7 days
  }
}));
```

### 4. Test Redis Sessions

```bash
# Start application
npm start

# In another terminal, check Redis keys
redis-cli -a your-redis-password
> KEYS sess:*
# Should show session keys after logging in
```

---

## HTTPS/SSL Setup

### Option 1: Let's Encrypt (Free, Automated)

**1. Install Certbot:**

```bash
sudo apt install -y certbot python3-certbot-nginx
```

**2. Obtain SSL Certificate:**

```bash
# Make sure nginx is running and domain points to server
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow prompts:
# - Enter email
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (recommended)
```

**3. Auto-Renewal:**

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically sets up cron job for renewal
# Check with:
sudo systemctl status certbot.timer
```

### Option 2: Custom SSL Certificate

**1. Place certificate files:**

```bash
# Copy certificate files to server
sudo mkdir -p /etc/ssl/private
sudo cp yourdomain.com.crt /etc/ssl/certs/
sudo cp yourdomain.com.key /etc/ssl/private/

# Set permissions
sudo chmod 600 /etc/ssl/private/yourdomain.com.key
```

**2. Configure nginx (see next section)**

---

## Process Management (PM2)

PM2 keeps your application running, handles crashes, and manages logs.

### 1. Create PM2 Ecosystem File

```bash
cd /home/biomedapp/viz_app
nano ecosystem.config.js
```

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [{
    name: 'biomedapp',
    script: './server.js',
    instances: 2,  // Use 2 instances for load balancing
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true
  }]
};
```

### 2. Start Application with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# View status
pm2 status

# View logs
pm2 logs biomedapp

# Monitor
pm2 monit
```

### 3. PM2 Commands Reference

```bash
# Start
pm2 start ecosystem.config.js

# Restart (after code changes)
pm2 restart biomedapp

# Stop
pm2 stop biomedapp

# Delete from PM2
pm2 delete biomedapp

# View logs
pm2 logs biomedapp --lines 100

# Clear logs
pm2 flush

# Monitor CPU/Memory
pm2 monit

# List processes
pm2 list
```

---

## Reverse Proxy (nginx)

nginx handles HTTPS, serves static files, and proxies API requests to Node.js.

### 1. Create nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/biomedapp
```

**nginx Configuration:**

```nginx
# Upstream Node.js application
upstream nodejs_backend {
    least_conn;
    server 127.0.0.1:3000;
    # If using PM2 cluster mode with multiple instances:
    # server 127.0.0.1:3000;
    # server 127.0.0.1:3001;
}

# HTTP server (redirects to HTTPS)
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificate (Let's Encrypt paths)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL configuration (Mozilla Intermediate)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # File upload size limit (500 MB for TIFF files)
    client_max_body_size 500M;

    # Timeouts for large file uploads
    client_body_timeout 300s;
    client_header_timeout 300s;

    # Root directory for static files
    root /home/biomedapp/viz_app/public;
    index index.html;

    # Proxy API requests to Node.js
    location /api/ {
        proxy_pass http://nodejs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts for long-running requests
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # Socket.IO WebSocket proxying
    location /socket.io/ {
        proxy_pass http://nodejs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Serve static files directly
    location ~* \.(css|js|jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # All other requests to Node.js
    location / {
        proxy_pass http://nodejs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }

    location ~ (\.env|users\.json|ecosystem\.config\.js)$ {
        deny all;
    }
}
```

### 2. Enable Configuration

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/biomedapp /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 3. Test HTTPS

```bash
# Check SSL certificate
curl -I https://yourdomain.com

# Test WebSocket connection
# Should see upgrade to WebSocket protocol
```

---

## Security Hardening

### 1. System Security

**Update `.env` with Strong Secrets:**

```bash
# Generate session secret (128 characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate Redis password (64 characters)
openssl rand -base64 48
```

**Secure File Permissions:**

```bash
# Application files
sudo chown -R biomedapp:biomedapp /home/biomedapp/viz_app
chmod 755 /home/biomedapp/viz_app
chmod 600 /home/biomedapp/viz_app/.env
chmod 600 /home/biomedapp/viz_app/users.json
chmod 700 /home/biomedapp/viz_app/uploads
chmod 700 /home/biomedapp/viz_app/models
chmod 700 /home/biomedapp/viz_app/results
```

### 2. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Verify
sudo ufw status verbose
```

### 3. Fail2Ban (Brute Force Protection)

```bash
# Install fail2ban
sudo apt install -y fail2ban

# Create custom jail for nginx
sudo nano /etc/fail2ban/jail.local
```

**jail.local:**

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-botsearch]
enabled = true
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 2
```

```bash
# Start fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Check status
sudo fail2ban-client status
```

### 4. Application Security Checklist

- [ ] `SESSION_SECRET` is strong random string (128+ characters)
- [ ] `NODE_ENV=production` in .env
- [ ] `.env` file permissions are 600
- [ ] `users.json` permissions are 600
- [ ] Redis has password authentication enabled
- [ ] Session cookies have `secure: true` (HTTPS only)
- [ ] Session cookies have `httpOnly: true`
- [ ] File upload limits configured (`MAX_FILE_SIZE`)
- [ ] CORS properly configured (if using separate frontend domain)
- [ ] Rate limiting enabled for login endpoint (see code below)
- [ ] SQL injection prevention (use parameterized queries if adding DB)
- [ ] XSS prevention (sanitize user input)
- [ ] CSRF protection enabled (consider `csurf` package)
- [ ] Security headers set in nginx (already in config above)

**Add Rate Limiting to Login:**

```javascript
// Install express-rate-limit
// npm install express-rate-limit

const rateLimit = require('express-rate-limit');

// Rate limit for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to login route
app.post('/login', loginLimiter, (req, res) => {
  // ... existing login code
});
```

### 5. Regular Security Updates

```bash
# Set up automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Enable
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
# Uncomment: "origin=Debian,codename=${distro_codename}-updates";
```

---

## Monitoring & Logging

### 1. Application Logs

**PM2 Logs:**

```bash
# View logs
pm2 logs biomedapp --lines 100

# Log files location
ls -lh /home/biomedapp/viz_app/logs/

# Rotate logs (automatic with PM2)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

**Application Activity Log:**

```bash
# View activity log
tail -f /home/biomedapp/viz_app/logs/activity.log

# Monitor for errors
grep ERROR /home/biomedapp/viz_app/logs/activity.log
```

### 2. nginx Logs

```bash
# Access log
sudo tail -f /var/log/nginx/access.log

# Error log
sudo tail -f /var/log/nginx/error.log

# Configure log rotation
sudo nano /etc/logrotate.d/nginx
```

### 3. System Monitoring

**Install Monitoring Tools:**

```bash
# Install htop for interactive process viewer
sudo apt install -y htop

# Install iotop for disk I/O monitoring
sudo apt install -y iotop

# Install nethogs for network monitoring
sudo apt install -y nethogs
```

**Monitor Resources:**

```bash
# CPU and memory
htop

# Disk usage
df -h
du -sh /home/biomedapp/viz_app/*

# Disk I/O
sudo iotop

# Network
sudo nethogs

# PM2 monitoring
pm2 monit
```

### 4. Uptime Monitoring

**Set Up External Monitoring:**

- **UptimeRobot** (free): https://uptimerobot.com/
- **Pingdom** (paid): https://www.pingdom.com/
- **StatusCake** (freemium): https://www.statuscake.com/

**Monitor these endpoints:**
- `https://yourdomain.com/` (main page)
- `https://yourdomain.com/api/health` (create health check endpoint)

**Add Health Check Endpoint to `server.js`:**

```javascript
// Health check endpoint (no auth required)
app.get('/api/health', (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: 'OK',
    redis: redisClient.isOpen ? 'connected' : 'disconnected'
  };

  res.status(200).json(health);
});
```

### 5. Error Alerting

**Set Up Email Alerts with PM2:**

```bash
# Install PM2 email module
pm2 install pm2-auto-pull
pm2 install pm2-server-monit

# Configure email alerts (requires SMTP)
pm2 set pm2-server-monit:smtp_host smtp.gmail.com
pm2 set pm2-server-monit:smtp_port 587
pm2 set pm2-server-monit:smtp_username your-email@gmail.com
pm2 set pm2-server-monit:smtp_password your-app-password
pm2 set pm2-server-monit:alert_email admin@yourdomain.com
```

---

## Backup Strategy

### 1. Database Backups (users.json)

```bash
# Create backup script
nano /home/biomedapp/backup-users.sh
```

**backup-users.sh:**

```bash
#!/bin/bash
BACKUP_DIR="/home/biomedapp/backups/users"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup users.json
cp /home/biomedapp/viz_app/users.json $BACKUP_DIR/users_$TIMESTAMP.json

# Keep only last 30 days of backups
find $BACKUP_DIR -name "users_*.json" -mtime +30 -delete

echo "Users backup completed: users_$TIMESTAMP.json"
```

```bash
# Make executable
chmod +x /home/biomedapp/backup-users.sh

# Add to cron (daily at 2 AM)
crontab -e
# Add line:
0 2 * * * /home/biomedapp/backup-users.sh >> /home/biomedapp/backups/backup.log 2>&1
```

### 2. File Storage Backups

**Option 1: Local Backups (rsync)**

```bash
# Create backup script
nano /home/biomedapp/backup-files.sh
```

**backup-files.sh:**

```bash
#!/bin/bash
SOURCE_DIR="/home/biomedapp/viz_app"
BACKUP_DIR="/backup/biomedapp"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR/$TIMESTAMP

# Backup critical directories
rsync -avz --exclude='node_modules' --exclude='venv' \
  $SOURCE_DIR/uploads \
  $SOURCE_DIR/models \
  $SOURCE_DIR/results \
  $SOURCE_DIR/sessions \
  $SOURCE_DIR/logs \
  $BACKUP_DIR/$TIMESTAMP/

# Keep only last 7 days of backups
find $BACKUP_DIR -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \;

echo "Files backup completed: $TIMESTAMP"
```

**Option 2: S3 Backups (AWS CLI)**

```bash
# Install AWS CLI
sudo apt install -y awscli

# Configure AWS credentials
aws configure

# Backup to S3
aws s3 sync /home/biomedapp/viz_app/uploads s3://your-bucket/backups/uploads/
aws s3 sync /home/biomedapp/viz_app/models s3://your-bucket/backups/models/
```

### 3. Redis Backups

```bash
# Redis automatically saves to /var/lib/redis/dump.rdb

# Create Redis backup script
nano /home/biomedapp/backup-redis.sh
```

**backup-redis.sh:**

```bash
#!/bin/bash
BACKUP_DIR="/home/biomedapp/backups/redis"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Trigger Redis save
redis-cli -a your-redis-password BGSAVE

# Wait for save to complete
sleep 5

# Copy dump file
sudo cp /var/lib/redis/dump.rdb $BACKUP_DIR/dump_$TIMESTAMP.rdb

# Keep only last 7 days
find $BACKUP_DIR -name "dump_*.rdb" -mtime +7 -delete

echo "Redis backup completed: dump_$TIMESTAMP.rdb"
```

### 4. Complete System Snapshot

**For VPS/Cloud Servers:**
- AWS: Use EBS snapshots
- DigitalOcean: Use droplet snapshots
- Azure: Use VM snapshots
- Google Cloud: Use persistent disk snapshots

**Schedule weekly snapshots of entire server**

---

## Deployment Checklist

### Pre-Deployment

- [ ] Server meets minimum requirements
- [ ] Domain name configured (DNS A record points to server IP)
- [ ] SSH key authentication working
- [ ] Firewall configured
- [ ] All software dependencies installed (Node.js, Python, Redis, nginx, PM2)

### Application Setup

- [ ] Repository cloned to `/home/biomedapp/viz_app`
- [ ] `.env` file created with production values
- [ ] `SESSION_SECRET` is strong random string
- [ ] `NODE_ENV=production` set
- [ ] Node.js dependencies installed (`npm ci --production`)
- [ ] Python virtual environment created
- [ ] Python dependencies installed
- [ ] Required directories created (uploads, models, results, sessions, logs)
- [ ] File permissions set correctly

### Redis Configuration

- [ ] Redis installed and running
- [ ] Redis password configured
- [ ] `server.js` updated to use Redis sessions
- [ ] Redis credentials in `.env`
- [ ] Redis session storage tested

### HTTPS/SSL Setup

- [ ] SSL certificate obtained (Let's Encrypt or custom)
- [ ] nginx configured with SSL
- [ ] HTTP to HTTPS redirect working
- [ ] SSL certificate auto-renewal configured (if Let's Encrypt)

### nginx Configuration

- [ ] nginx configuration file created
- [ ] Configuration tested (`sudo nginx -t`)
- [ ] Static file serving working
- [ ] API proxying working
- [ ] Socket.IO proxying working
- [ ] File upload size limit set (500 MB)
- [ ] Security headers configured

### PM2 Setup

- [ ] `ecosystem.config.js` created
- [ ] Application started with PM2
- [ ] PM2 startup script configured
- [ ] PM2 process list saved
- [ ] Application auto-restarts on crash (tested)
- [ ] PM2 logs working

### Security

- [ ] Firewall rules configured (UFW)
- [ ] Fail2Ban installed and configured
- [ ] File permissions secured
- [ ] Sensitive files (.env, users.json) protected
- [ ] Rate limiting enabled for login
- [ ] Security headers configured in nginx
- [ ] HTTPS enforced (HTTP redirects to HTTPS)

### Monitoring & Logging

- [ ] PM2 logs configured
- [ ] Application activity log working
- [ ] nginx access and error logs configured
- [ ] Log rotation configured
- [ ] Uptime monitoring configured (external service)
- [ ] Health check endpoint working
- [ ] Error alerting configured

### Backups

- [ ] User database backup script created and scheduled
- [ ] File storage backup configured
- [ ] Redis backup script created and scheduled
- [ ] System snapshots scheduled (if using VPS)

### Testing

- [ ] Application accessible at `https://yourdomain.com`
- [ ] Login working
- [ ] User registration working
- [ ] File upload working (test with small file)
- [ ] Training workflow working (with test data)
- [ ] Inference workflow working
- [ ] 3D visualization working
- [ ] Socket.IO real-time updates working
- [ ] Session persistence working (login, close browser, reopen)
- [ ] HTTPS working (check for mixed content warnings)

### Post-Deployment

- [ ] Create first admin user (`node manageUsers.js add-admin ...`)
- [ ] Test full workflow end-to-end
- [ ] Monitor logs for errors
- [ ] Monitor resource usage (CPU, memory, disk)
- [ ] Document deployment date and version
- [ ] Create deployment runbook (this checklist!)

---

## Troubleshooting

### Common Issues

#### 1. **502 Bad Gateway (nginx)**

**Cause:** nginx can't connect to Node.js application

**Solutions:**
```bash
# Check if Node.js is running
pm2 status

# Check if Node.js is listening on port 3000
sudo netstat -tlnp | grep 3000

# Check PM2 logs for errors
pm2 logs biomedapp --lines 50

# Restart application
pm2 restart biomedapp

# Check nginx error log
sudo tail -f /var/log/nginx/error.log
```

#### 2. **Application Crashes on Startup**

**Cause:** Environment variables missing or incorrect

**Solutions:**
```bash
# Check .env file exists and has correct values
cat /home/biomedapp/viz_app/.env

# Check PM2 logs for specific error
pm2 logs biomedapp --lines 100 --err

# Common issues:
# - SESSION_SECRET not set
# - Redis connection failed (check REDIS_PASSWORD)
# - Port 3000 already in use
# - Missing node_modules (run npm install)

# Test running directly (not with PM2)
cd /home/biomedapp/viz_app
NODE_ENV=production node server.js
```

#### 3. **Redis Connection Error**

**Cause:** Redis not running or authentication failed

**Solutions:**
```bash
# Check Redis status
sudo systemctl status redis-server

# Test Redis connection
redis-cli -a your-redis-password ping

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log

# Restart Redis
sudo systemctl restart redis-server

# Verify Redis password in .env matches redis.conf
```

#### 4. **SSL Certificate Not Working**

**Cause:** Certificate not properly configured or expired

**Solutions:**
```bash
# Check certificate expiry
openssl x509 -in /etc/letsencrypt/live/yourdomain.com/fullchain.pem -noout -dates

# Renew Let's Encrypt certificate manually
sudo certbot renew

# Check nginx SSL configuration
sudo nginx -t

# Check certificate files exist and permissions
ls -l /etc/letsencrypt/live/yourdomain.com/
```

#### 5. **File Upload Fails**

**Cause:** nginx client_max_body_size too small or directory permissions

**Solutions:**
```bash
# Check nginx client_max_body_size (should be 500M)
grep client_max_body_size /etc/nginx/sites-available/biomedapp

# Check upload directory permissions
ls -ld /home/biomedapp/viz_app/uploads

# Check disk space
df -h

# Check nginx error log during upload
sudo tail -f /var/log/nginx/error.log
```

#### 6. **Socket.IO Connection Fails**

**Cause:** WebSocket upgrade not properly proxied by nginx

**Solutions:**
```bash
# Check nginx configuration for /socket.io/ location
grep -A 10 "location /socket.io/" /etc/nginx/sites-available/biomedapp

# Verify headers are set:
# - Upgrade $http_upgrade
# - Connection "upgrade"

# Test WebSocket connection in browser console:
# const socket = io();
# socket.on('connect', () => console.log('Connected'));

# Check for mixed content (HTTPS page trying to connect to WS instead of WSS)
```

#### 7. **Session Not Persisting**

**Cause:** Redis session storage not working or cookies not set

**Solutions:**
```bash
# Check Redis sessions exist
redis-cli -a your-redis-password
> KEYS sess:*

# Check cookie is set in browser DevTools (Application > Cookies)
# Should see: connect.sid

# Verify secure: true only when using HTTPS
# In server.js session config:
# cookie: { secure: process.env.NODE_ENV === 'production' }

# Check express-session and connect-redis versions
npm list express-session connect-redis
```

#### 8. **Python Script Fails**

**Cause:** Python dependencies not installed or virtual environment not found

**Solutions:**
```bash
# Activate venv and test Python import
source /home/biomedapp/viz_app/venv/bin/activate
python -c "import torch; print(torch.__version__)"

# Check venv path in .env
grep PYTHON_VENV /home/biomedapp/viz_app/.env

# Check Python script has execute permissions
ls -l /home/biomedapp/viz_app/python/*.py

# Test Python script directly
/home/biomedapp/viz_app/venv/bin/python /home/biomedapp/viz_app/python/validate_tiff.py
```

#### 9. **High Memory Usage**

**Cause:** Memory leak or too many PM2 instances

**Solutions:**
```bash
# Check PM2 instances
pm2 status

# Reduce instances in ecosystem.config.js (change instances to 1 for testing)
# restart with: pm2 restart ecosystem.config.js

# Check for memory leaks with PM2
pm2 monit

# Set max_memory_restart in ecosystem.config.js:
# max_memory_restart: '1G'

# Check system memory
free -h
```

#### 10. **Disk Space Full**

**Cause:** Old sessions, models, or logs not cleaned up

**Solutions:**
```bash
# Check disk usage
df -h
du -sh /home/biomedapp/viz_app/*

# Find large files
find /home/biomedapp/viz_app -type f -size +100M -exec ls -lh {} \;

# Clean up old sessions (older than 7 days)
find /home/biomedapp/viz_app/uploads -type d -mtime +7 -exec rm -rf {} \;
find /home/biomedapp/viz_app/models -type d -mtime +7 -exec rm -rf {} \;
find /home/biomedapp/viz_app/results -type d -mtime +7 -exec rm -rf {} \;

# Rotate PM2 logs
pm2 flush

# Clear old nginx logs
sudo journalctl --vacuum-time=7d
```

---

## Maintenance

### Daily Tasks

```bash
# Check application status
pm2 status
pm2 logs biomedapp --lines 20

# Check system resources
htop
df -h

# Check for errors in logs
grep ERROR /home/biomedapp/viz_app/logs/activity.log | tail -20
```

### Weekly Tasks

```bash
# Review application logs
pm2 logs biomedapp --lines 500 | less

# Check disk usage trends
du -sh /home/biomedapp/viz_app/uploads
du -sh /home/biomedapp/viz_app/models
du -sh /home/biomedapp/viz_app/results

# Review backup logs
cat /home/biomedapp/backups/backup.log

# Check uptime monitoring reports

# Review fail2ban bans
sudo fail2ban-client status nginx-http-auth
```

### Monthly Tasks

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js packages (check for breaking changes first)
cd /home/biomedapp/viz_app
npm outdated
# Review and update package.json, then:
# npm install
# pm2 restart biomedapp

# Update Python packages
source venv/bin/activate
pip list --outdated
# Review and update requirements.txt, then:
# pip install -r requirements.txt
deactivate

# Clean up old sessions (older than 30 days)
find /home/biomedapp/viz_app/uploads -type d -mtime +30 -exec rm -rf {} \;
find /home/biomedapp/viz_app/models -type d -mtime +30 -exec rm -rf {} \;
find /home/biomedapp/viz_app/results -type d -mtime +30 -exec rm -rf {} \;

# Review and rotate logs if needed
pm2 flush
sudo journalctl --vacuum-time=30d

# Test backup restoration (important!)
# Restore users.json from backup to staging environment
```

### Quarterly Tasks

```bash
# Security audit
# - Review users.json for inactive accounts
# - Review fail2ban logs for attack patterns
# - Update SSL certificates if needed
# - Review and update security dependencies

# Performance review
# - Analyze PM2 monit data
# - Review slow endpoints (nginx access logs)
# - Optimize database queries if needed
# - Review and adjust PM2 instances

# Disaster recovery test
# - Test full backup restoration
# - Test application deployment on fresh server
# - Update deployment documentation
```

### Updating Application Code

```bash
# 1. Pull latest code
cd /home/biomedapp/viz_app
git pull origin main

# 2. Install new dependencies (if any)
npm install
source venv/bin/activate
pip install -r requirements.txt
deactivate

# 3. Run any database migrations (if applicable)

# 4. Restart application
pm2 restart biomedapp

# 5. Monitor for errors
pm2 logs biomedapp --lines 50

# 6. Test critical workflows
# - Login
# - File upload
# - Training
# - Inference
```

---

## Related Documentation

- [Architecture Overview](../architecture/OVERVIEW.md) - System architecture
- [Module Creation Guide](MODULE_CREATION.md) - Creating new modules
- [Testing Guide](TESTING.md) - Testing strategies
- [API Endpoints Reference](../reference/API_ENDPOINTS.md) - API documentation
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues

---

## Additional Resources

### External Documentation

- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Redis Security](https://redis.io/topics/security)
- [OWASP Security Guidelines](https://owasp.org/www-project-top-ten/)

### Monitoring Services

- [UptimeRobot](https://uptimerobot.com/) - Free uptime monitoring
- [PM2 Plus](https://pm2.io/plus/) - Advanced PM2 monitoring (paid)
- [Datadog](https://www.datadoghq.com/) - Comprehensive monitoring (paid)
- [New Relic](https://newrelic.com/) - Application performance monitoring (paid)

---

**Last Updated:** 2025-11-27
**Deployment Guide Version:** 1.0
**Application Version:** Phase 2 Complete

---

**Navigation:** [← Getting Started](GETTING_STARTED.md) | [Documentation Index](../INDEX.md) | [Troubleshooting →](TROUBLESHOOTING.md)
