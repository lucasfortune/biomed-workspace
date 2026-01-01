// Global variables
let currentStep = 1;
let socket = null;
let currentTrainingId = null;
let currentInferenceId = null;
let lossChart = null;
let diceChart = null;
let scene = null;
let camera = null;
let renderer = null;
let trainingPollInterval = null;
let uploadedFiles = {
    rawImages: null,
    annotations: null,
    inferenceData: null
};

let segmentationMesh = null;
let segmentationData = null;
let availableClasses = [];
let visibleClasses = [];
let currentSliceRange = [0, 100]; // percentage range

let classMeshes = {}; // Object to store separate meshes per class
let meshGroup = null; // Group to contain all class meshes

let sliceDirection = 'z'; // 'x', 'y', or 'z'

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    // Check if user came from welcome page
    const userChoice = sessionStorage.getItem('userChoice');
    if (userChoice === 'testData') {
        // Load test data automatically
        loadTestDataset();
        sessionStorage.removeItem('userChoice');
    } else if (userChoice === 'importedModel') {
        // Handle imported model mode
        handleImportedModelMode();
        sessionStorage.removeItem('userChoice');
    }
    initializeSocketConnection();
    initializeFileUpload();
    initializeCharts();
    updateProgressBar();
});

// Load test dataset function
// Load test dataset function (UPDATED to work with your exact routes)
// Load test dataset function (UPDATED to enable the Run Segmentation button)
async function loadTestDataset() {
    console.log('Loading test dataset...');
    
    try {
        // Show loading state
        const validationResult = document.getElementById('validationResult');
        if (validationResult) {
            validationResult.innerHTML = '<p class="info">Loading test dataset...</p>';
        }
        
        // First, load training data (Step 1)
        console.log('Loading training data...');
        const formData = new FormData();
        formData.append('isTestData', 'true');
        
        const trainingResponse = await fetch('/upload-data', {
            method: 'POST',
            body: formData
        });
        
        const trainingResult = await trainingResponse.json();

        
        if (!trainingResponse.ok) {
            throw new Error(trainingResult.error || 'Failed to load training data');
        }
        
        console.log('Training data loaded:', trainingResult);
        
        // Update uploadedFiles object to match your app's expectations
        uploadedFiles.rawImages = { 
            name: 'trypB_testData_training.tif',  // Updated to match your file name
            isTestData: true,
            loaded: true
        };
        uploadedFiles.annotations = { 
            name: 'trypB_testData_annotations.tif',  // Updated to match your file name
            isTestData: true,
            loaded: true
        };
        
        // Also load inference data (Step 4) 
        console.log('Loading inference data...');
        const inferenceFormData = new FormData();
        inferenceFormData.append('isTestData', 'true');
        
        const inferenceResponse = await fetch('/upload-inference', {
            method: 'POST',
            body: inferenceFormData
        });
        
        const inferenceResult = await inferenceResponse.json();
        
        if (!inferenceResponse.ok) {
            console.warn('Inference data loading failed:', inferenceResult.error);
            // Don't fail completely if inference data fails - user can load it later
        } else {
            console.log('Inference data loaded:', inferenceResult);
            
            // IMPORTANT: Create a mock file object that matches what the app expects
            uploadedFiles.inferenceData = {
                name: 'trypB_testData_inference.tif',  // Updated to match your file name
                isTestData: true,
                loaded: true,
                // Add these properties that runInference() might expect
                type: 'image/tiff',
                size: 1000000 // Placeholder size
            };
            
            // CRITICAL FIX: Enable the Run Segmentation button
            const runInferenceBtn = document.getElementById('runInferenceBtn');
            if (runInferenceBtn) {
                runInferenceBtn.disabled = false;
                console.log('Run Segmentation button enabled');
            }
        }
        
        // Update the validation result with success message
        if (validationResult) {
            let previewHtml = '';
            if (trainingResult.validation && trainingResult.validation.preview) {
                previewHtml = `
                    <div class="preview-section">
                        <h4>📸 Training Data Preview (First Slice)</h4>
                        <div class="preview-images">
                            <div class="preview-item">
                                <label>Raw Image</label>
                                <img src="data:image/png;base64,${trainingResult.validation.preview.raw_preview}" 
                                    alt="Raw image preview"
                                    style="max-width: 180px; max-height: 180px; border: 1px solid #ddd;">
                            </div>
                            <div class="preview-item">
                                <label>Annotation</label>
                                <img src="data:image/png;base64,${trainingResult.validation.preview.annotation_preview}" 
                                    alt="Annotation preview"
                                    style="max-width: 180px; max-height: 180px; border: 1px solid #ddd;">
                            </div>
                        </div>
                    </div>
                `;
            }
            
            validationResult.innerHTML = `
                <div class="test-data-loaded">
                    <div class="success-with-preview">
                        <div class="success-message-content">
                            <h3>✓ Test Dataset Loaded Successfully!</h3>
                            <ul>
                                <li>Training Images: trypB_testData_training.tif ${trainingResult.validation ? '(Validated ✓)' : ''}</li>
                                <li>Annotations: trypB_testData_annotations.tif ${trainingResult.validation ? '(Validated ✓)' : ''}</li>
                                <li>Inference Data: trypB_testData_inference.tif ${inferenceResult && inferenceResult.validation ? '(Validated ✓)' : ''}</li>
                            </ul>
                            <p><em>You can now proceed through the workflow using this sample data.</em></p>
                        </div>
                        ${previewHtml ? `<div class="preview-container">${previewHtml}</div>` : ''}
                    </div>
                </div>
            `;
        }
        
        // Enable the next step button for Step 1
        const step1NextBtn = document.getElementById('step1Next');
        if (step1NextBtn) {
            step1NextBtn.disabled = false;
            markStepCompleted(1);
            updateNavigationButtons();
        }
        
        // Update upload sections visually
        updateUploadSectionForTestData('rawUploadSection', '✓ Training Images Loaded', 'trypB_testData_training.tif');
        updateUploadSectionForTestData('annotationsUploadSection', '✓ Annotations Loaded', 'trypB_testData_annotations.tif');
        
        // Only update inference section if it loaded successfully
        if (inferenceResult && inferenceResult.validation) {
            updateInferenceUploadSectionForTestData(inferenceResult.validation);
        }
        
        console.log('Test dataset loaded successfully');
        
    } catch (error) {
        console.error('Error loading test dataset:', error);
        
        const validationResult = document.getElementById('validationResult');
        if (validationResult) {
            validationResult.innerHTML = `
                <p class="error">Failed to load test dataset: ${escapeHtml(error.message)}</p>
                <p>Please try uploading your own data instead.</p>
            `;
        }
    }
}

// NEW FUNCTION: Handle imported model mode
async function handleImportedModelMode() {
    console.log('Handling imported model mode...');
    
    try {
        // Verify the imported model is still valid
        const response = await fetch('/verify-imported-model');
        const result = await response.json();
        
        if (result.success) {
            // Set up UI for imported model mode
            setupImportedModelUI(result.modelInfo);
            
            // Jump directly to step 4 (inference)
            setStep(4);
            
            // Store model info globally
            window.importedModelInfo = result.modelInfo;
            
        } else {
            // Imported model validation failed, show error
            showError('Imported model validation failed: ' + result.error);
        }
        
    } catch (error) {
        console.error('Error handling imported model mode:', error);
        showError('Error loading imported model: ' + error.message);
    }
}

function setupImportedModelUI(modelInfo) {
    // Update step 4 UI to show imported model info
    const modelInfoSection = document.querySelector('#step4 .model-info');
    if (modelInfoSection) {
        modelInfoSection.innerHTML = `
            <h3>Imported Model Ready</h3>
            <div class="imported-model-details">
                <p><strong>Model:</strong> ${escapeHtml(modelInfo.model_size)}</p>
                <p><strong>Architecture:</strong> ${escapeHtml(modelInfo.config.features)} features, ${escapeHtml(modelInfo.config.num_layers)} layers</p>
                <p><strong>Patch Size:</strong> ${escapeHtml(modelInfo.config.patch_size)}px</p>
                <p><em>You can now run inference using this pre-trained model.</em></p>
            </div>
        `;
    }
    
    // Mark steps 1-3 as completed in the progress bar
    ['1', '2', '3'].forEach(step => {
        const stepElement = document.querySelector(`[data-step="${step}"]`);
        if (stepElement) {
            stepElement.classList.add('completed');
        }
    });
}

// Updated helper function
function updateUploadSectionForTestData(sectionId, message, filename) {
    const section = document.getElementById(sectionId);
    if (section) {
        // Update visual styling
        section.style.borderColor = '#4CAF50';
        section.style.backgroundColor = '#f0f8f0';
        
        // Remove any existing test data message
        const existingMessage = section.querySelector('.test-data-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Add new message
        const messageEl = document.createElement('div');
        messageEl.className = 'test-data-message';
        messageEl.style.cssText = `
            color: #4CAF50;
            font-weight: bold;
            margin-top: 10px;
            padding: 10px;
            background: #e8f5e8;
            border-radius: 5px;
            font-size: 0.9em;
        `;
        messageEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.2em;">📁</span>
                <div>
                    <div>${message}</div>
                    <div style="color: #666; font-weight: normal; font-size: 0.85em;">${filename}</div>
                </div>
            </div>
        `;
        section.appendChild(messageEl);
    }
}

function updateInferenceUploadSectionForTestData(validation) {
    const section = document.getElementById('inferenceUploadSection');
    if (section) {
        // Update visual styling
        section.style.borderColor = '#4CAF50';
        section.style.backgroundColor = '#f0f8f0';
        
        // Remove any existing content
        const uploadText = section.querySelector('.upload-text');
        
        let previewHtml = '';
        if (validation.preview) {
            previewHtml = `
                <div class="preview-container">
                    <div class="preview-section">
                        <h4>📸 Inference Data Preview (First Slice)</h4>
                        <div class="preview-images single">
                            <div class="preview-item centered">
                                <label>Test Inference Data</label>
                                <img src="data:image/png;base64,${validation.preview.inference_preview}" 
                                     alt="Test inference data preview"
                                     style="max-width: 200px; max-height: 200px; border: 1px solid #ddd;">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        uploadText.innerHTML = `
            <div class="success-with-preview">
                <div class="success-message-content">
                    <h3>✅ Test Inference Data Loaded</h3>
                    <p><strong>Stack Shape:</strong> ${validation.info.shape.join(' × ')}</p>
                    <p><strong>Number of Slices:</strong> ${validation.info.num_slices}</p>
                    <p><strong>File:</strong> trypB_testData_inference.tif</p>
                </div>
                ${previewHtml}
            </div>
        `;
    }
}

function updateProgressBar() {
    const progress = ((currentStep - 1) / 4) * 100;
    document.getElementById('overallProgress').style.width = progress + '%';
}