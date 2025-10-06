/**
 * Handle login form submission
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    // Basic validation
    if (!username || !password) {
        displayError('Please enter both username and password');
        return;
    }
    
    // Show loading
    showLoading('Logging in...', 'Please wait while we verify your credentials.');
    hideError();
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        hideLoading();
        
        if (response.ok && result.success) {
            // Login successful
            console.log('Login successful:', result);
            
            // Redirect based on user status
            if (result.user.status === 'pending') {
                // Pending users can access app with test data
                window.location.href = result.redirect || '/';
            } else if (result.user.status === 'active') {
                // Active users get full access
                window.location.href = result.redirect || '/';
            } else {
                // Rejected or other status
                displayError('Your account status does not allow login. Please contact the administrator.');
            }
        } else {
            // Login failed
            displayError(result.error || 'Login failed. Please check your credentials.');
        }
    } catch (error) {
        hideLoading();
        console.error('Login error:', error);
        displayError('An error occurred during login. Please try again.');
    }
}

/**
 * Display error message
 */
function displayError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * Hide error message
 */
function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
}

// Check if user is already logged in on page load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();
        
        if (data.authenticated) {
            // Already logged in, redirect to home
            window.location.href = '/';
        }
    } catch (error) {
        // Not logged in, stay on login page
        console.log('Not logged in');
    }
});