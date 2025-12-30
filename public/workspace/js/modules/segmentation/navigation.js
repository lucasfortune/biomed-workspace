/**
 * Navigation and Step State Management
 *
 * This module manages step navigation and state for the segmentation workflow.
 * When SegmentationModule is available, navigation functions delegate to it.
 * The fallback code handles cases where the module hasn't initialized yet.
 *
 * Key responsibilities:
 * - Step state tracking (completed, canNavigate, trainingStarted, etc.)
 * - Process state tracking (trainingInProgress, inferenceInProgress)
 * - Reset workflow with download options
 * - Global function exports for other modules
 */

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

/**
 * Central function to handle step changes
 * Delegates to SegmentationModule when available
 * @param {number} stepNumber - The step to navigate to (1-4)
 */
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

/**
 * Navigate to the next step
 * Delegates to SegmentationModule when available
 */
function nextStep() {
    // Delegate to module if available
    if (window.segmentationModule && window.segmentationModule.nextStep) {
        window.segmentationModule.nextStep();
        return;
    }

    // Fallback: Direct navigation
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

/**
 * Navigate to the previous step
 * Delegates to SegmentationModule when available
 */
function previousStep() {
    // Delegate to module if available
    if (window.segmentationModule && window.segmentationModule.previousStep) {
        window.segmentationModule.previousStep();
        return;
    }

    // Fallback: Direct navigation
    if (currentStep > 1) {
        setStep(currentStep - 1);
    }
}

/**
 * Initiate workflow reset - shows warning modal first
 */
function resetWorkflow() {
    // Show warning modal instead of immediately resetting
    showResetWarning();
}

/**
 * Display reset warning modal with download options
 */
function showResetWarning() {
    // Populate download actions based on available data
    populateDownloadActions();
    
    // Show the warning overlay
    const warningOverlay = document.getElementById('resetWarningOverlay');
    warningOverlay.style.display = 'flex';
}

/**
 * Populate download actions in the reset warning modal
 * Shows available downloads (trained model, inference results) based on current state
 */
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

/**
 * Track downloads before reset (for analytics)
 * @param {string} type - Type of download ('model' or 'results')
 */
function trackDownload(type) {
    // Optional: Track which downloads were used
    console.log(`User downloaded ${type} before reset`);
}

/**
 * Cancel the reset operation and hide the warning modal
 */
function cancelReset() {
    // Hide the warning overlay
    const warningOverlay = document.getElementById('resetWarningOverlay');
    warningOverlay.style.display = 'none';
}

/**
 * Execute the reset operation
 * Calls server to clear session data and redirects to welcome page
 */
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

/**
 * Perform complete frontend state reset
 * Clears all state variables, charts, and UI elements
 */
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

    // Remove any dynamically created success-message elements (legacy cleanup)
    document.querySelectorAll('.success-message').forEach(el => el.remove());
}

// ============================================
// State Management Functions
// ============================================

/**
 * Check if navigation to a step is allowed
 * @param {number} stepNumber - The step to check (1-4)
 * @returns {boolean} True if navigation is allowed
 */
function canNavigateToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 4) return false;
    
    // Handle imported model mode
    if (window.importedModelInfo && stepNumber < 4) {
        return stepNumber === 4;
    }
    
    return stepStates[stepNumber].canNavigate;
}

/**
 * Mark a step as completed and enable navigation to the next step
 * @param {number} stepNumber - The step to mark as completed (1-4)
 */
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

/**
 * Update the visual state of a step element (add completed class)
 * @param {number} stepNumber - The step to update
 */
function updateStepVisualState(stepNumber) {
    const stepElement = document.querySelector(`[data-step="${stepNumber}"]`);
    if (stepElement && stepStates[stepNumber].completed) {
        stepElement.classList.add('completed');
    }
}

/**
 * Reset all step and process states to initial values
 */
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

/**
 * Get the current step completion status
 * @returns {object} The stepStates object
 */
function getStepCompletionStatus() {
    return stepStates;
}

/**
 * Display an error message explaining why navigation is blocked
 * @param {number} stepNumber - The step that was blocked
 */
function showNavigationError(stepNumber) {
    const reasons = {
        2: 'Please complete data upload first.',
        3: 'Please configure training parameters first.',
        4: 'Please complete model training first.'
    };

    const message = reasons[stepNumber] || 'This step is not yet available.';
    showError(message);
}

/**
 * Update navigation button states based on current step states
 */
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

/**
 * Validate training configuration fields locally (client-side)
 * @returns {boolean} True if all required fields are valid
 */
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

// ============================================
// Global Exports
// Make functions available globally for other modules
// ============================================

window.markStepCompleted = markStepCompleted;
window.canNavigateToStep = canNavigateToStep;
window.updateNavigationButtons = updateNavigationButtons;
window.validateConfigurationLocally = validateConfigurationLocally;
window.stepStates = stepStates;
window.processStates = processStates;