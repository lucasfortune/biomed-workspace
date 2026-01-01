/**
 * Welcome Page JavaScript
 * Handles authentication, theme toggle, and form interactions
 */

// ============================================================================
// Theme Management
// ============================================================================

function initTheme() {
    const savedTheme = localStorage.getItem('workspace-theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    // Default is light (no attribute needed)
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';

    if (isDark) {
        html.removeAttribute('data-theme');
        localStorage.setItem('workspace-theme', 'light');
    } else {
        html.setAttribute('data-theme', 'dark');
        localStorage.setItem('workspace-theme', 'dark');
    }
}

// ============================================================================
// Tab Switching
// ============================================================================

function initTabs() {
    const tabs = document.querySelectorAll('.auth-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetForm = tab.dataset.tab;
            switchTab(targetForm);
        });
    });
}

function switchTab(formName) {
    // Update tab states
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === formName);
    });

    // Update form visibility
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.toggle('hidden', form.dataset.form !== formName);
    });

    // Clear messages when switching tabs
    clearMessages();
}

// ============================================================================
// Form Handling
// ============================================================================

function initForms() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showError('loginError', 'Please enter both username and password');
        return;
    }

    showLoading('Logging in...');
    clearMessages();

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();
        hideLoading();

        if (response.ok && result.success) {
            // Redirect to workspace (works for both pending and approved users)
            window.location.href = '/workspace';
        } else {
            showError('loginError', result.error || 'Login failed. Please check your credentials.');
        }
    } catch (error) {
        hideLoading();
        console.error('Login error:', error);
        showError('loginError', 'An error occurred during login. Please try again.');
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const fullName = document.getElementById('registerFullName').value.trim();
    const institution = document.getElementById('registerInstitution').value.trim();

    // Validation
    if (password !== confirmPassword) {
        showError('registerError', 'Passwords do not match');
        return;
    }

    if (password.length < 8) {
        showError('registerError', 'Password must be at least 8 characters');
        return;
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
        showError('registerError', 'Username must be 3-20 characters, alphanumeric and underscore only');
        return;
    }

    showLoading('Creating account...');
    clearMessages();

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, fullName, institution })
        });

        const result = await response.json();
        hideLoading();

        if (response.ok && result.success) {
            showSuccess('registerSuccess', 'Registration successful! You can now log in.');
            document.getElementById('registerForm').reset();

            // Switch to login tab after 2 seconds
            setTimeout(() => switchTab('login'), 2000);
        } else {
            showError('registerError', result.error || 'Registration failed. Please try again.');
        }
    } catch (error) {
        hideLoading();
        console.error('Registration error:', error);
        showError('registerError', 'An error occurred during registration. Please try again.');
    }
}

// ============================================================================
// Auth State
// ============================================================================

async function checkAuthStatus() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();

        if (data.authenticated) {
            // Show authenticated state
            document.getElementById('authContainer').classList.add('hidden');
            const authContainer = document.getElementById('authenticatedContainer');
            authContainer.classList.remove('hidden');
            document.getElementById('userName').textContent = data.user.fullName || data.user.username;

            // Show admin link if user is admin
            if (data.user.isAdmin) {
                document.getElementById('adminLink').classList.remove('hidden');
            }
        }
        // If not authenticated, default state (forms visible) is correct
    } catch (error) {
        console.error('Error checking auth status:', error);
        // On error, show login form (default state)
    }
}

async function handleLogout() {
    try {
        await fetch('/logout', { method: 'POST' });
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ============================================================================
// UI Helpers
// ============================================================================

function showLoading(text) {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.add('visible');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('visible');
}

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.add('visible');
    }
}

function showSuccess(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.add('visible');
    }
}

function clearMessages() {
    document.querySelectorAll('.error-message, .success-message').forEach(el => {
        el.classList.remove('visible');
        el.textContent = '';
    });
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initForms();
    checkAuthStatus();

    // Theme toggle button
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});
