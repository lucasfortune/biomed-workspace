// Admin Dashboard JavaScript

let currentUser = null;
let allUsers = [];
let pendingUsersData = [];

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', async function() {
    await checkAdminAccess();
    loadUsers();
    loadPendingUsers();
    loadActivityLogs();
    loadActiveSessions();
});

/**
 * Check if user has admin access
 */
async function checkAdminAccess() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = '/login';
            return;
        }
        
        if (!data.user.isAdmin) {
            alert('Access denied. Admin privileges required.');
            window.location.href = '/app';
            return;
        }
        
        currentUser = data.user;
        
        // Display admin user info
        document.getElementById('adminUserInfo').textContent = `Admin: ${currentUser.fullName}`;
        
    } catch (error) {
        console.error('Error checking admin access:', error);
        window.location.href = '/login';
    }
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
    // Update nav buttons
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    // Load data if needed
    if (tabName === 'activity') {
        loadActivityLogs();
    } else if (tabName === 'sessions') {
        loadActiveSessions();
    }
}

/**
 * Load all users
 */
async function loadUsers() {
    const filter = document.getElementById('userFilter').value;
    const content = document.getElementById('usersContent');
    
    content.innerHTML = '<div class="loading-spinner">Loading users...</div>';
    
    try {
        const response = await fetch(`/admin/users?filter=${filter}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load users');
        }
        
        allUsers = data.users;
        displayUsers(allUsers);
        
    } catch (error) {
        console.error('Error loading users:', error);
        content.innerHTML = `<div class="empty-state"><p>Error loading users: ${error.message}</p></div>`;
    }
}

/**
 * Display users
 */
function displayUsers(users) {
    const content = document.getElementById('usersContent');
    
    if (users.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <h3>No users found</h3>
                <p>No users match the selected filter.</p>
            </div>
        `;
        return;
    }
    
    const usersHTML = users.map(user => `
        <div class="user-card">
            <div class="user-card-header">
                <div class="user-info-main">
                    <div class="user-name">
                        ${user.fullName}
                        ${user.isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}
                    </div>
                    <div class="user-username">@${user.username}</div>
                </div>
                <span class="status-badge ${user.status}">${getStatusText(user.status)}</span>
            </div>
            <div class="user-meta">
                <div class="user-meta-item"><strong>Email:</strong> ${user.email}</div>
                <div class="user-meta-item"><strong>Institution:</strong> ${user.institution}</div>
                <div class="user-meta-item"><strong>Registered:</strong> ${formatDate(user.createdAt)}</div>
                ${user.approvedAt ? `<div class="user-meta-item"><strong>Approved:</strong> ${formatDate(user.approvedAt)}</div>` : ''}
            </div>
            ${user.status === 'pending' && !user.isAdmin ? `
                <div class="user-actions">
                    <button class="btn btn-primary" onclick="approveUser('${user.username}')">✅ Approve</button>
                    <button class="btn btn-danger" onclick="rejectUser('${user.username}')">❌ Reject</button>
                </div>
            ` : ''}
        </div>
    `).join('');
    
    content.innerHTML = usersHTML;
}

/**
 * Load pending users
 */
async function loadPendingUsers() {
    const content = document.getElementById('pendingContent');
    
    content.innerHTML = '<div class="loading-spinner">Loading pending users...</div>';
    
    try {
        const response = await fetch('/admin/pending-users');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load pending users');
        }
        
        pendingUsersData = data.users;
        
        // Update badge count
        document.getElementById('pendingCount').textContent = pendingUsersData.length;
        
        displayPendingUsers(pendingUsersData);
        
    } catch (error) {
        console.error('Error loading pending users:', error);
        content.innerHTML = `<div class="empty-state"><p>Error loading pending users: ${error.message}</p></div>`;
    }
}

/**
 * Display pending users
 */
function displayPendingUsers(users) {
    const content = document.getElementById('pendingContent');
    
    if (users.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✅</div>
                <h3>No pending approvals</h3>
                <p>All user registrations have been reviewed.</p>
            </div>
        `;
        return;
    }
    
    const usersHTML = users.map(user => `
        <div class="user-card">
            <div class="user-card-header">
                <div class="user-info-main">
                    <div class="user-name">${user.fullName}</div>
                    <div class="user-username">@${user.username}</div>
                </div>
                <span class="status-badge pending">⏳ Pending</span>
            </div>
            <div class="user-meta">
                <div class="user-meta-item"><strong>Email:</strong> ${user.email}</div>
                <div class="user-meta-item"><strong>Institution:</strong> ${user.institution}</div>
                <div class="user-meta-item"><strong>Registered:</strong> ${formatDate(user.createdAt)}</div>
            </div>
            <div class="user-actions">
                <button class="btn btn-primary" onclick="approveUser('${user.username}')">✅ Approve User</button>
                <button class="btn btn-danger" onclick="rejectUser('${user.username}')">❌ Reject</button>
            </div>
        </div>
    `).join('');
    
    content.innerHTML = usersHTML;
}

/**
 * Approve user
 */
async function approveUser(username) {
    const confirmed = await showConfirmModal(
        'Approve User',
        `Are you sure you want to approve user "${username}"? They will gain full access to upload custom data and train models.`
    );
    
    if (!confirmed) {
        console.log('User approval cancelled');
        return;
    }
    
    console.log('Attempting to approve user:', username);
    
    try {
        const response = await fetch('/admin/approve-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        
        console.log('Response status:', response.status);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (!response.ok) {
            console.error('Response not OK:', data);
            throw new Error(data.error || 'Failed to approve user');
        }
        
        console.log('User approved successfully');
        alert(`✅ User "${username}" has been approved successfully!`);
        
        // Reload data
        console.log('Reloading user data...');
        await loadUsers();
        await loadPendingUsers();
        await loadActivityLogs();
        console.log('Data reloaded');
        
    } catch (error) {
        console.error('Error approving user:', error);
        alert(`Error approving user: ${error.message}`);
    }
}

/**
 * Reject user
 */
async function rejectUser(username) {
    const confirmed = await showConfirmModal(
        'Reject User',
        `Are you sure you want to reject user "${username}"? They will not be able to access the application.`
    );
    
    if (!confirmed) {
        console.log('User rejection cancelled');
        return;
    }
    
    console.log('Attempting to reject user:', username);
    
    try {
        const response = await fetch('/admin/reject-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        
        console.log('Response status:', response.status);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (!response.ok) {
            console.error('Response not OK:', data);
            throw new Error(data.error || 'Failed to reject user');
        }
        
        console.log('User rejected successfully');
        alert(`❌ User "${username}" has been rejected.`);
        
        // Reload data
        console.log('Reloading user data...');
        await loadUsers();
        await loadPendingUsers();
        await loadActivityLogs();
        console.log('Data reloaded');
        
    } catch (error) {
        console.error('Error rejecting user:', error);
        alert(`Error rejecting user: ${error.message}`);
    }
}

/**
 * Load activity logs
 */
async function loadActivityLogs() {
    const userFilter = document.getElementById('activityUserFilter').value;
    const typeFilter = document.getElementById('activityTypeFilter').value;
    const limit = document.getElementById('activityLimit').value;
    const content = document.getElementById('activityContent');
    
    content.innerHTML = '<div class="loading-spinner">Loading activity logs...</div>';
    
    try {
        const response = await fetch(`/admin/activity-logs?user=${userFilter}&type=${typeFilter}&limit=${limit}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load activity logs');
        }
        
        displayActivityLogs(data.logs, data.users);
        
    } catch (error) {
        console.error('Error loading activity logs:', error);
        content.innerHTML = `<div class="empty-state"><p>Error loading activity logs: ${error.message}</p></div>`;
    }
}

/**
 * Display activity logs
 */
function displayActivityLogs(logs, users) {
    const content = document.getElementById('activityContent');
    
    // Populate user filter dropdown if not already done
    const userFilter = document.getElementById('activityUserFilter');
    if (userFilter.options.length === 1 && users) {
        users.forEach(username => {
            const option = document.createElement('option');
            option.value = username;
            option.textContent = username;
            userFilter.appendChild(option);
        });
    }
    
    if (logs.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <h3>No activity logs</h3>
                <p>No activity logs match the selected filters.</p>
            </div>
        `;
        return;
    }
    
    const logsHTML = `
        <table class="activity-table">
            <thead>
                <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                ${logs.map(log => `
                    <tr>
                        <td class="timestamp">${formatDateTime(log.timestamp)}</td>
                        <td><strong>${log.username}</strong></td>
                        <td><span class="activity-type ${getActivityClass(log.action)}">${formatAction(log.action)}</span></td>
                        <td>${formatDetails(log.details)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    content.innerHTML = logsHTML;
}

/**
 * Load active sessions
 */
async function loadActiveSessions() {
    const content = document.getElementById('sessionsContent');
    
    content.innerHTML = '<div class="loading-spinner">Loading sessions...</div>';
    
    try {
        const response = await fetch('/admin/active-sessions');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load sessions');
        }
        
        displayActiveSessions(data.training, data.inference, data.mesh || [], data.denoising || []);

    } catch (error) {
        console.error('Error loading sessions:', error);
        content.innerHTML = `<div class="empty-state"><p>Error loading sessions: ${error.message}</p></div>`;
    }
}

/**
 * Display active sessions
 */
function displayActiveSessions(training, inference, mesh = [], denoising = []) {
    const content = document.getElementById('sessionsContent');

    if (training.length === 0 && inference.length === 0 && mesh.length === 0 && denoising.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔄</div>
                <h3>No sessions found</h3>
                <p>There are no active sessions in the system.</p>
            </div>
        `;
        return;
    }
    
    let sessionsHTML = '';
    
    if (training.length > 0) {
        sessionsHTML += '<h3 style="margin-top: 0;">🎓 Training Sessions</h3>';
        training.forEach(session => {
            sessionsHTML += `
                <div class="session-card training">
                    <div class="session-header">
                        <div class="session-type">Training: ${session.trainingId.substring(0, 8)}</div>
                        <span class="session-status ${session.status}">${session.status}</span>
                    </div>
                    <div class="session-details">
                        <div class="session-detail">
                            <strong>User</strong>
                            ${session.fullName || session.username || 'Unknown'}
                        </div>
                        <div class="session-detail">
                            <strong>Started</strong>
                            ${formatDateTime(session.startTime)}
                        </div>
                        <div class="session-detail">
                            <strong>Progress</strong>
                            ${session.current_epoch} / ${session.total_epochs} epochs
                        </div>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${(session.current_epoch / session.total_epochs) * 100}%"></div>
                    </div>
                </div>
            `;
        });
    }
    
    if (inference.length > 0) {
        sessionsHTML += '<h3 style="margin-top: 20px;">🔬 Inference Sessions</h3>';
        inference.forEach(session => {
            sessionsHTML += `
                <div class="session-card inference">
                    <div class="session-header">
                        <div class="session-type">Inference: ${session.inferenceId.substring(0, 8)}</div>
                        <span class="session-status ${session.status}">${session.status}</span>
                    </div>
                    <div class="session-details">
                        <div class="session-detail">
                            <strong>User</strong>
                            ${session.fullName || session.username || 'Unknown'}
                        </div>
                        <div class="session-detail">
                            <strong>Started</strong>
                            ${formatDateTime(session.startTime)}
                        </div>
                        <div class="session-detail">
                            <strong>Progress</strong>
                            ${session.progress || 0}%
                        </div>
                    </div>
                    ${session.totalSlices ? `
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${(session.currentSlice / session.totalSlices) * 100}%"></div>
                        </div>
                    ` : ''}
                </div>
            `;
        });
    }

    if (mesh.length > 0) {
        sessionsHTML += '<h3 style="margin-top: 20px;">🧊 Mesh Sessions</h3>';
        mesh.forEach(session => {
            sessionsHTML += `
                <div class="session-card mesh">
                    <div class="session-header">
                        <div class="session-type">Mesh: ${session.meshId.substring(0, 8)}</div>
                        <span class="session-status ${session.status}">${session.status}</span>
                    </div>
                    <div class="session-details">
                        <div class="session-detail">
                            <strong>User</strong>
                            ${session.fullName || session.username || 'Unknown'}
                        </div>
                        <div class="session-detail">
                            <strong>Started</strong>
                            ${formatDateTime(session.startTime)}
                        </div>
                        <div class="session-detail">
                            <strong>Progress</strong>
                            ${session.currentClass || 0} / ${session.totalClasses || 0} classes
                        </div>
                    </div>
                    ${session.totalClasses ? `
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${(session.currentClass / session.totalClasses) * 100}%"></div>
                        </div>
                    ` : ''}
                </div>
            `;
        });
    }

    if (denoising.length > 0) {
        sessionsHTML += '<h3 style="margin-top: 20px;">🔇 Denoising Sessions</h3>';
        denoising.forEach(session => {
            sessionsHTML += `
                <div class="session-card denoising">
                    <div class="session-header">
                        <div class="session-type">Denoising: ${session.denoisingId ? session.denoisingId.substring(0, 8) : 'N/A'}</div>
                        <span class="session-status ${session.status}">${session.status}</span>
                    </div>
                    <div class="session-details">
                        <div class="session-detail">
                            <strong>User</strong>
                            ${session.username || 'Unknown'}
                        </div>
                        <div class="session-detail">
                            <strong>Method</strong>
                            ${session.method || 'N/A'}
                        </div>
                        <div class="session-detail">
                            <strong>Stage</strong>
                            ${session.stage || 'N/A'}
                        </div>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${session.progress || 0}%"></div>
                    </div>
                </div>
            `;
        });
    }

    content.innerHTML = sessionsHTML;
}

/**
 * Show confirmation modal
 */
// Store the current promise resolver
let currentModalResolver = null;

function showConfirmModal(title, message) {
    return new Promise((resolve) => {
        // Store resolver
        currentModalResolver = resolve;
        
        // Set modal content
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        
        // Show modal
        const modal = document.getElementById('confirmModal');
        modal.style.display = 'flex';
        
        // Remove any existing click handlers to prevent duplicates
        const confirmBtn = document.getElementById('confirmBtn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        // Add click handler for confirm button
        newConfirmBtn.onclick = (e) => {
            e.stopPropagation();
            console.log('Confirm button clicked');
            modal.style.display = 'none';
            if (currentModalResolver) {
                currentModalResolver(true);
                currentModalResolver = null;
            }
        };
        
        // Prevent clicking modal backdrop from closing
        modal.onclick = (e) => {
            if (e.target === modal) {
                // Clicked backdrop - do nothing (don't close)
                e.stopPropagation();
            }
        };
    });
}

function closeConfirmModal() {
    console.log('Cancel clicked');
    const modal = document.getElementById('confirmModal');
    modal.style.display = 'none';
    if (currentModalResolver) {
        currentModalResolver(false);
        currentModalResolver = null;
    }
}

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        const response = await fetch('/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Utility functions
function getStatusText(status) {
    const statusMap = {
        'active': '✅ Active',
        'pending': '⏳ Pending',
        'rejected': '❌ Rejected'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getActivityClass(action) {
    if (action.includes('login')) return 'login';
    if (action.includes('training')) return 'training';
    if (action.includes('inference')) return 'inference';
    if (action.includes('upload')) return 'upload';
    if (action.includes('logout')) return 'logout';
    return 'login';
}

function formatAction(action) {
    return action.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function formatDetails(details) {
    if (!details || Object.keys(details).length === 0) return '-';
    
    const formatted = [];
    for (const [key, value] of Object.entries(details)) {
        if (value) {
            formatted.push(`${key}: ${value}`);
        }
    }
    
    return formatted.join(', ') || '-';
}