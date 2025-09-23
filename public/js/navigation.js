// Central function to handle step changes
function setStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 5) return;
    
    // NEW: Handle import mode navigation
    if (window.importedModelInfo && stepNumber < 4) {
        // In import mode, don't allow going back to steps 1-3
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
    
    // Initialize 3D visualization when reaching step 5
    if (stepNumber === 5) {
        console.log('Initializing 3D visualization...');
        initialize3DVisualization();
    }
    
    // Update progress bar
    updateProgressBar();
}

function nextStep() {
    if (currentStep < 5) {
        setStep(currentStep + 1);
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
    
    // Reset UI
    setStep(1);
    document.getElementById('step1Next').disabled = true;
    document.getElementById('validationResult').innerHTML = '';
    
    // Reset upload sections
    const uploadSections = ['rawUploadSection', 'annotationsUploadSection', 'inferenceUploadSection'];
    uploadSections.forEach(id => {
        const section = document.getElementById(id);
        section.style.borderColor = '#ddd';
        section.style.backgroundColor = 'transparent';
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
}