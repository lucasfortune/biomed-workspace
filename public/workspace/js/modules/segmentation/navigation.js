// Step state management system
let stepStates = {
    1: { completed: false, canNavigate: true },
    2: { completed: false, canNavigate: false },
    3: { completed: false, canNavigate: false, trainingStarted: false, trainingCompleted: false },
    4: { completed: false, canNavigate: false }
};

let processStates = {
    trainingInProgress: false,
    inferenceInProgress: false
};

// Central function to handle step changes
function setStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 4) return;

    // If SegmentationModule is available, delegate to its goToStep method
    // This ensures the StepNavigator component is updated properly
    if (window.segmentationModule && window.segmentationModule.goToStep) {
        window.segmentationModule.goToStep(stepNumber);
        return;
    }

    // Fallback: Direct DOM manipulation (for cases without module)
    // NEW: Check if navigation is allowed
    if (!canNavigateToStep(stepNumber)) {
        console.warn(`Navigation to step ${stepNumber} is not allowed`);
        showNavigationError(stepNumber);
        return;
    }

    // Handle import mode navigation
    if (window.importedModelInfo && stepNumber < 4) {
        stepNumber = 4;
    }

    // Hide current step
    document.querySelector(`.step-content.active`)?.classList.remove('active');
    document.querySelector(`.step.active`)?.classList.remove('active');

    // Show new step
    document.querySelector(`[data-step="${stepNumber}"]`)?.classList.add('active');
    document.querySelector(`#step${stepNumber}`)?.classList.add('active');

    // Update global variable
    currentStep = stepNumber;

    // Handle Step 3 specific UI
    if (stepNumber === 3) {
        const trainingAction = document.getElementById('trainingAction');
        const startTrainingBtn = document.getElementById('startTrainingBtn');

        if (stepStates[3].trainingStarted) {
            // Training has started, hide the action button
            if (trainingAction) trainingAction.style.display = 'none';
            if (startTrainingBtn) startTrainingBtn.disabled = true;
        } else {
            // Training hasn't started, show the action button
            if (trainingAction) trainingAction.style.display = 'block';
            if (startTrainingBtn) startTrainingBtn.disabled = false;
        }
    }

    // Update progress bar and navigation buttons
    updateProgressBar();
    updateNavigationButtons();

    window.scrollTo(0, 0);
}

function nextStep() {
    if (currentStep < 4) {
        // Special handling for Step 2 -> Step 3 transition
        if (currentStep === 2) {
            if (validateConfigurationLocally()) {
                // Mark step 2 as completed since config is valid
                markStepCompleted(2);
                setStep(currentStep + 1);
            } else {
                showError('Please fill out all training configuration parameters before proceeding.');
                return;
            }
        } else {
            setStep(currentStep + 1);
        }
    }
}

function previousStep() {
    if (currentStep > 1) {
        setStep(currentStep - 1);
    }
}

function resetWorkflow() {
    // Show warning modal instead of immediately resetting
    showResetWarning();
}

function showResetWarning() {
    // Populate download actions based on available data
    populateDownloadActions();
    
    // Show the warning overlay
    const warningOverlay = document.getElementById('resetWarningOverlay');
    warningOverlay.style.display = 'flex';
}

function populateDownloadActions() {
    const downloadActionsDiv = document.getElementById('downloadActions');
    let downloadButtons = [];
    
    // Check if trained model is available for download
    if (currentTrainingId && stepStates[3].trainingCompleted) {
        downloadButtons.push(`
            <button class="btn secondary" onclick="downloadModel(); trackDownload('model');">
                📦 Download Trained Model
            </button>
        `);
    }
    
    // Check if inference results are available for download  
    if (currentInferenceId && stepStates[4].completed) {
        downloadButtons.push(`
            <button class="btn secondary" onclick="downloadResults(); trackDownload('results');">
                📊 Download Segmentation Results
            </button>
        `);
    }
    
    if (downloadButtons.length > 0) {
        downloadActionsDiv.innerHTML = `
            <p><strong>Available Downloads:</strong></p>
            ${downloadButtons.join('')}
            <hr style="margin: 15px 0; border: 1px solid #eee;">
        `;
    } else {
        downloadActionsDiv.innerHTML = `
            <p style="color: #666; font-style: italic;">No files available for download.</p>
            <hr style="margin: 15px 0; border: 1px solid #eee;">
        `;
    }
}

function trackDownload(type) {
    // Optional: Track which downloads were used
    console.log(`User downloaded ${type} before reset`);
}

function cancelReset() {
    // Hide the warning overlay
    const warningOverlay = document.getElementById('resetWarningOverlay');
    warningOverlay.style.display = 'none';
}

async function proceedWithReset() {
    // Hide warning modal
    const warningOverlay = document.getElementById('resetWarningOverlay');
    warningOverlay.style.display = 'none';
    
    // Show loading for reset process
    showLoading('Resetting Session...', 'Clearing all data and starting fresh. This may take a moment.');
    
    try {
        // Call server to reset session and delete files
        const response = await fetch('/reset-session', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Complete frontend state reset
            performCompleteStateReset();
            
            // Redirect to welcome page
            window.location.href = '/';
        } else {
            hideLoading();
            showError('Failed to reset session: ' + (result.error || 'Unknown error'));
        }
        
    } catch (error) {
        hideLoading();
        console.error('Error resetting session:', error);
        showError('Error resetting session: ' + error.message);
        
        // Still redirect to welcome page even if server call fails
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
    }
}

function performCompleteStateReset() {
    // Reset all global state variables
    currentStep = 1;
    currentTrainingId = null;
    currentInferenceId = null;
    uploadedFiles = { rawImages: null, annotations: null, inferenceData: null };
    
    // Reset window-level variables
    window.inferenceResult = null;
    window.importedModelInfo = null;
    
    // Reset step and process states
    resetStepStates();
    
    // Clear session storage
    sessionStorage.removeItem('userChoice');
    
    // Clear upload sections
    const uploadSections = ['rawUploadSection', 'annotationsUploadSection', 'inferenceUploadSection'];
    uploadSections.forEach(id => {
        const section = document.getElementById(id);
        if (section) {
            section.style.borderColor = '#ddd';
            section.style.backgroundColor = 'transparent';
            // Clear file input
            const fileInput = section.querySelector('input[type="file"]');
            if (fileInput) fileInput.value = '';
        }
    });
    
    // Clear validation results
    const validationResult = document.getElementById('validationResult');
    if (validationResult) validationResult.innerHTML = '';
    
    // Clear and destroy charts
    // Destroy charts from module instance
    if (window.segmentationModule) {
        if (window.segmentationModule.lossChart) {
            window.segmentationModule.lossChart.destroy();
            window.segmentationModule.lossChart = null;
        }
        if (window.segmentationModule.diceChart) {
            window.segmentationModule.diceChart.destroy();
            window.segmentationModule.diceChart = null;
        }
    }
    
    // Disconnect WebSocket
    if (window.socket) {
        window.socket.disconnect();
    }
}

// NEW: State management functions
function canNavigateToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 4) return false;
    
    // Handle imported model mode
    if (window.importedModelInfo && stepNumber < 4) {
        return stepNumber === 4;
    }
    
    return stepStates[stepNumber].canNavigate;
}

function markStepCompleted(stepNumber) {
    if (stepNumber >= 1 && stepNumber <= 4) {
        stepStates[stepNumber].completed = true;

        // Enable navigation to next step
        if (stepNumber < 4) {
            stepStates[stepNumber + 1].canNavigate = true;
        }

        // Update visual indicators
        updateStepVisualState(stepNumber);
    }
}

function updateStepVisualState(stepNumber) {
    const stepElement = document.querySelector(`[data-step="${stepNumber}"]`);
    if (stepElement && stepStates[stepNumber].completed) {
        stepElement.classList.add('completed');
    }
}

function resetStepStates() {
    stepStates = {
        1: { completed: false, canNavigate: true },
        2: { completed: false, canNavigate: false },
        3: { completed: false, canNavigate: false, trainingStarted: false, trainingCompleted: false },
        4: { completed: false, canNavigate: false }
    };

    processStates = {
        trainingInProgress: false,
        inferenceInProgress: false
    };
    
    // Remove completed classes
    document.querySelectorAll('.step.completed').forEach(step => {
        step.classList.remove('completed');
    });
}

function getStepCompletionStatus() {
    return stepStates;
}

function showNavigationError(stepNumber) {
    const reasons = {
        2: 'Please complete data upload first.',
        3: 'Please configure training parameters first.',
        4: 'Please complete model training first.'
    };

    const message = reasons[stepNumber] || 'This step is not yet available.';
    showError(message);
}

function updateNavigationButtons() {
    // Update step 1 next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) {
        step1Next.disabled = !stepStates[2].canNavigate;
    }
    
    // Update training buttons
    const trainingNextBtn = document.getElementById('trainingNextBtn');
    const trainingBackBtn = document.getElementById('trainingBackBtn');
    
    if (trainingNextBtn) {
        trainingNextBtn.disabled = !stepStates[4].canNavigate;
    }
    
    if (trainingBackBtn) {
        trainingBackBtn.disabled = processStates.trainingInProgress;
    }
}

function validateConfigurationLocally() {
    // Check all required configuration fields
    const requiredFields = [
        'patchSize',
        'patchesPerImage', 
        'batchSize',
        'numFeatures',
        'numLayers',
        'learningRate',
        'numEpochs'
    ];
    
    for (const fieldId of requiredFields) {
        const element = document.getElementById(fieldId);
        if (!element || !element.value || element.value.trim() === '') {
            console.log(`Missing or empty field: ${fieldId}`);
            return false;
        }
        
        // Basic numeric validation
        const value = parseFloat(element.value);
        if (isNaN(value) || value <= 0) {
            console.log(`Invalid numeric value for field: ${fieldId}`);
            return false;
        }
    }
    
    // Check augmentation checkbox (this one is optional but should exist)
    const augmentElement = document.getElementById('augmentation');
    if (!augmentElement) {
        console.log('Missing augmentation checkbox');
        return false;
    }
    
    console.log('All configuration fields validated successfully');
    return true;
}

// Make functions available globally for other modules
window.markStepCompleted = markStepCompleted;
window.canNavigateToStep = canNavigateToStep;
window.updateNavigationButtons = updateNavigationButtons;
window.validateConfigurationLocally = validateConfigurationLocally;
window.stepStates = stepStates;
window.processStates = processStates;