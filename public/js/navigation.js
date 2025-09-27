// Step state management system
let stepStates = {
    1: { completed: false, canNavigate: true },
    2: { completed: false, canNavigate: false },
    3: { completed: false, canNavigate: false, trainingStarted: false, trainingCompleted: false },
    4: { completed: false, canNavigate: false },
    5: { completed: false, canNavigate: false, initialized: false }
};

let processStates = {
    trainingInProgress: false,
    inferenceInProgress: false,
    visualizationInitialized: false
};

// Central function to handle step changes
function setStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 5) return;
    
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
    
    // REMOVED: Auto-initialization of 3D visualization
    // NEW: Only initialize if not already done and step allows it
    if (stepNumber === 5) {
        console.log('Reached step 5 - 3D visualization step');
        if (!stepStates[5].initialized && window.inferenceResult) {
            console.log('Initializing 3D visualization...');
            initialize3DVisualization();
            stepStates[5].initialized = true;
            processStates.visualizationInitialized = true;
        } else if (stepStates[5].initialized) {
            console.log('3D visualization already initialized');
        } else {
            console.log('Cannot initialize 3D visualization - no inference result available');
        }
    }
    
    // Update progress bar and navigation buttons
    updateProgressBar();
    updateNavigationButtons();
}

function nextStep() {
    if (currentStep < 5) {
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
    // Reset all states
    currentStep = 1;
    currentTrainingId = null;
    currentInferenceId = null;
    uploadedFiles = { rawImages: null, annotations: null, inferenceData: null };
    
    // NEW: Reset step and process states
    resetStepStates();

    // Reset training UI elements
    const trainingAction = document.getElementById('trainingAction');
    const startTrainingBtn = document.getElementById('startTrainingBtn');
    if (trainingAction) trainingAction.style.display = 'block';
    if (startTrainingBtn) startTrainingBtn.disabled = false;

    // Reset UI
    setStep(1);
    document.getElementById('step1Next').disabled = true;
    document.getElementById('validationResult').innerHTML = '';
    
    // Reset upload sections
    const uploadSections = ['rawUploadSection', 'annotationsUploadSection', 'inferenceUploadSection'];
    uploadSections.forEach(id => {
        const section = document.getElementById(id);
        if (section) {
            section.style.borderColor = '#ddd';
            section.style.backgroundColor = 'transparent';
        }
    });
    
    // Clear and reinitialize charts to prevent sizing issues
    if (lossChart) {
        lossChart.destroy();
        lossChart = null;
    }
    if (diceChart) {
        diceChart.destroy();
        diceChart = null;
    }
    
    // Reinitialize charts
    setTimeout(() => {
        initializeCharts();
    }, 100);
    
    // NEW: Update navigation buttons
    updateNavigationButtons();
}

// NEW: State management functions
function canNavigateToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 5) return false;
    
    // Handle imported model mode
    if (window.importedModelInfo && stepNumber < 4) {
        return stepNumber === 4;
    }
    
    return stepStates[stepNumber].canNavigate;
}

function markStepCompleted(stepNumber) {
    if (stepNumber >= 1 && stepNumber <= 5) {
        stepStates[stepNumber].completed = true;
        
        // Enable navigation to next step
        if (stepNumber < 5) {
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
        4: { completed: false, canNavigate: false },
        5: { completed: false, canNavigate: false, initialized: false }
    };
    
    processStates = {
        trainingInProgress: false,
        inferenceInProgress: false,
        visualizationInitialized: false
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
        4: 'Please complete model training first.',
        5: 'Please run inference first.'
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
    
    // Update inference button
    const inferenceNextBtn = document.getElementById('inferenceNextBtn');
    if (inferenceNextBtn) {
        inferenceNextBtn.disabled = !stepStates[5].canNavigate;
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