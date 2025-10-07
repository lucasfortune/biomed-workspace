// Welcome page JavaScript functionality

function startWithTestData() {
    // Store user choice in sessionStorage for the main app to read
    sessionStorage.setItem('userChoice', 'testData');
    
    // Redirect to main application
    window.location.href = '/app';
}

async function startWithCustomData() {
    // Check if user is pending
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();
        
        if (data.authenticated && data.user.status === 'pending') {
            // User is pending - show message and redirect to test data instead
            if (confirm('Custom data upload requires account approval.\n\nWould you like to try the test data instead? It includes the full workflow: training, inference, and visualization.')) {
                startWithTestData();
            }
            return;
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
    
    // Normal flow for approved users
    sessionStorage.setItem('userChoice', 'customData');
    window.location.href = '/app';
}

// Import model state
let importedFiles = {
    model: null,
    config: null
};

async function toggleImportModel() {
    // NEW: Check if user is pending first
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();
        
        if (data.authenticated && data.user.status === 'pending') {
            // User is pending - show message
            alert('Model import requires account approval.\n\nYou can use test data to explore the full system while waiting for approval.');
            return;
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
    
    // Original code continues
    const section = document.getElementById('importModelSection');
    const isVisible = section.style.display !== 'none';
    
    if (isVisible) {
        // Hide section
        section.style.display = 'none';
        resetImportSection();
    } else {
        // Show section
        section.style.display = 'block';
        setupImportUploads();
    }
    window.scrollTo({
        top: document.body.scrollHeight,
        left: 0,
        behavior: 'smooth'
    });
}

function setupImportUploads() {
    // Setup model file upload
    const modelInput = document.getElementById('modelInput');
    const modelSection = document.getElementById('modelUploadSection');
    setupImportFileUpload(modelInput, modelSection, 'model');

    // Setup config file upload  
    const configInput = document.getElementById('configInput');
    const configSection = document.getElementById('configUploadSection');
    setupImportFileUpload(configInput, configSection, 'config');
}

function setupImportFileUpload(input, section, type) {
    // Click to upload
    section.addEventListener('click', () => input.click());

    // Drag and drop
    section.addEventListener('dragover', (e) => {
        e.preventDefault();
        section.classList.add('dragover');
    });

    section.addEventListener('dragleave', () => {
        section.classList.remove('dragover');
    });

    section.addEventListener('drop', (e) => {
        e.preventDefault();
        section.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleImportFileUpload(files[0], type);
        }
    });

    // File input change
    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImportFileUpload(e.target.files[0], type);
        }
    });
}

async function handleImportFileUpload(file, type) {
    // Validate file extension
    const expectedExt = type === 'model' ? '.pth' : '.json';
    if (!file.name.toLowerCase().endsWith(expectedExt)) {
        showImportError(`Please select a ${expectedExt} file.`);
        return;
    }

    // NEW: Show brief loading for large files
    if (file.size > 50 * 1024 * 1024) { // If file is larger than 50MB
        const resultDiv = document.getElementById('importValidationResult');
        resultDiv.innerHTML = '<p>⏳ Processing large file...</p>';
    }

    importedFiles[type] = file;
    updateImportUploadStatus(type, file.name);
    
    // If both files uploaded, validate them
    if (importedFiles.model && importedFiles.config) {
        await validateImportedFiles();
    }
}

function updateImportUploadStatus(type, filename) {
    const sectionId = type === 'model' ? 'modelUploadSection' : 'configUploadSection';
    const section = document.getElementById(sectionId);
    const uploadText = section.querySelector('.upload-text');
    
    uploadText.innerHTML = `
        <h3>✅ ${filename}</h3>
        <p>File uploaded successfully</p>
    `;
    section.style.borderColor = '#4CAF50';
    section.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
}

async function validateImportedFiles() {
    const resultDiv = document.getElementById('importValidationResult');
    
    // NEW: Show loading screen for upload
    showLoading('Uploading Model Files...', 'Large model files may take several minutes to upload. Please be patient.');
    
    // Clear any previous results
    resultDiv.innerHTML = '';
    
    const formData = new FormData();
    formData.append('model_file', importedFiles.model);
    formData.append('config_file', importedFiles.config);

    try {
        const response = await fetch('/import-pretrained-model', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        
        // NEW: Hide loading screen
        hideLoading();

        if (result.success) {
            resultDiv.innerHTML = `
                <div style="color: #4CAF50; background: rgba(76, 175, 80, 0.1); padding: 15px; border-radius: 8px;">
                    <h4>✅ Validation Successful!</h4>
                    <ul style="text-align: left; margin: 10px 0;">
                        <li>Model: ${result.validation.model_info}</li>
                        <li>Config: ${result.validation.config_info}</li>
                    </ul>
                </div>
            `;
            document.getElementById('proceedWithImportBtn').disabled = false;
        } else {
            showImportError(result.error || 'Validation failed');
        }
    } catch (error) {
        // NEW: Make sure to hide loading on error
        hideLoading();
        showImportError('Error during validation: ' + error.message);
    }
}

function showImportError(message) {
    // NEW: Make sure loading is hidden when showing error
    hideLoading();
    
    const resultDiv = document.getElementById('importValidationResult');
    resultDiv.innerHTML = `
        <div style="color: #f44336; background: rgba(244, 67, 54, 0.1); padding: 15px; border-radius: 8px;">
            <h4>❌ Validation Error</h4>
            <p>${message}</p>
        </div>
    `;
    document.getElementById('proceedWithImportBtn').disabled = true;
}

function resetImportSection() {
    importedFiles = { model: null, config: null };
    document.getElementById('importValidationResult').innerHTML = '';
    document.getElementById('proceedWithImportBtn').disabled = true;
    
    // Reset upload sections
    ['modelUploadSection', 'configUploadSection'].forEach(id => {
        const section = document.getElementById(id);
        section.style.borderColor = '#ddd';
        section.style.backgroundColor = 'transparent';
        
        const uploadText = section.querySelector('.upload-text');
        const isModel = id.includes('model');
        uploadText.innerHTML = `
            <h3>${isModel ? 'Model File (.pth)' : 'Config File (.json)'}</h3>
            <p>Drag and drop your ${isModel ? 'best_model.pth' : 'training_config.json'} file here</p>
        `;
    });
}

function proceedWithImportedModel() {
    // Check if user is pending
    fetch('/check-auth')
        .then(res => res.json())
        .then(data => {
            if (data.authenticated && data.user.status === 'pending') {
                alert('Model import requires account approval. You can use test data while waiting for approval.');
                return;
            }
            
            // Store import choice in sessionStorage
            sessionStorage.setItem('userChoice', 'importedModel');
            
            // Redirect to main application
            window.location.href = '/app';
        })
        .catch(error => {
            console.error('Error checking auth:', error);
            window.location.href = '/app';
        });
}

// Check authentication status and update UI
document.addEventListener('DOMContentLoaded', function() {
    // Add fade-in animation to feature cards
    const cards = document.querySelectorAll('.feature-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            card.style.transition = 'all 0.6s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 * index);
    });
    
    // NEW: Check authentication status
    checkAuthStatus();
});

/**
 * Check if user is logged in and update UI
 */
async function checkAuthStatus() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();
        
        const userInfoBar = document.getElementById('userInfoBar');
        const loginButtonContainer = document.getElementById('loginButtonContainer');
        
        if (data.authenticated) {
            // User is logged in - show user info bar, hide login button
            const isPending = data.user.status === 'pending';
            const statusBadge = isPending 
                ? '<span class="user-status-badge pending">Pending Approval</span>' 
                : '<span class="user-status-badge active">Approved</span>';
            
            // Add admin dashboard link if user is admin
            const adminLink = data.user.isAdmin 
                ? '<a href="/admin" class="admin-dashboard-link">Admin Dashboard</a>' 
                : '';
            
            userInfoBar.innerHTML = `
                <div class="user-details">
                    <span class="user-name">${data.user.fullName}</span>
                    <span class="user-institution">${data.user.institution}</span>
                    ${statusBadge}
                </div>
                <div class="user-actions">
                    ${adminLink}
                    <button class="logout-button" onclick="handleLogout()">Logout</button>
                </div>
            `;
            
            // Show user info bar, hide login button
            userInfoBar.classList.add('visible');
            loginButtonContainer.classList.remove('visible');
            document.body.classList.add('has-user-bar');
            
        } else {
            // User is not logged in - show login button, hide user info bar
            loginButtonContainer.innerHTML = `
                <a href="/login" class="login-btn">Login</a>
            `;
            
            // Show login button, hide user info bar
            loginButtonContainer.classList.add('visible');
            userInfoBar.classList.remove('visible');
            document.body.classList.remove('has-user-bar');
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        // On error, show login button as fallback
        const loginButtonContainer = document.getElementById('loginButtonContainer');
        loginButtonContainer.innerHTML = `
            <a href="/login" class="login-btn">Login</a>
        `;
        loginButtonContainer.classList.add('visible');
    }
}


/**
 * Handle logout
 */
async function handleLogout() {
    try {
        const response = await fetch('/logout', { method: 'POST' });
        if (response.ok) {
            window.location.reload();
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}