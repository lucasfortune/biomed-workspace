/**
 * Handle registration form submission
 */
async function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const fullName = document.getElementById('fullName').value.trim();
    const institution = document.getElementById('institution').value.trim();
    
    // Validate privacy consent
    const privacyConsent = document.getElementById('privacyConsent');
    if (!privacyConsent || !privacyConsent.checked) {
        displayError('Please accept the privacy policy to register / Bitte akzeptieren Sie die Datenschutzerklärung');
        return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
        displayError('Passwords do not match');
        return;
    }
    
    // Validate password length
    if (password.length < 8) {
        displayError('Password must be at least 8 characters long');
        return;
    }
    
    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
        displayError('Username must be 3-20 characters, alphanumeric and underscore only');
        return;
    }
    
    // Show loading
    showLoading('Creating account...', 'Please wait while we process your registration.');
    hideError();
    hideSuccess();
    
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                email,
                password,
                fullName,
                institution
            })
        });
        
        const result = await response.json();
        hideLoading();
        
        if (response.ok && result.success) {
            // Registration successful
            displaySuccess(result.message || 'Registration successful! Your account is pending approval. You can log in and use test data while waiting.');
            
            // Clear form
            document.getElementById('registerForm').reset();
            
            // Redirect to login after 3 seconds
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        } else {
            // Registration failed
            displayError(result.error || 'Registration failed. Please try again.');
        }
    } catch (error) {
        hideLoading();
        console.error('Registration error:', error);
        displayError('An error occurred during registration. Please try again.');
    }
}

/**
 * Display error message
 */
function displayError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Scroll to top to show error
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Hide error message
 */
function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
}

/**
 * Display success message
 */
function displaySuccess(message) {
    const successDiv = document.getElementById('successMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    
    // Scroll to top to show success
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Hide success message
 */
function hideSuccess() {
    const successDiv = document.getElementById('successMessage');
    successDiv.style.display = 'none';
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
        // Not logged in, stay on registration page
        console.log('Not logged in');
    }
});