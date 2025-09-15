function initializeFileUpload() {
    // Raw images upload
    const rawInput = document.getElementById('rawImagesInput');
    const rawSection = document.getElementById('rawUploadSection');
    
    setupFileUpload(rawInput, rawSection, 'rawImages');
    
    // Annotations upload
    const annotationsInput = document.getElementById('annotationsInput');
    const annotationsSection = document.getElementById('annotationsUploadSection');
    
    setupFileUpload(annotationsInput, annotationsSection, 'annotations');
    
    // Inference upload
    const inferenceInput = document.getElementById('inferenceInput');
    const inferenceSection = document.getElementById('inferenceUploadSection');
    
    setupFileUpload(inferenceInput, inferenceSection, 'inferenceData');
}

function setupFileUpload(input, section, type) {
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
            handleFileUpload(files[0], type);
        }
    });

    section.addEventListener('click', () => {
        input.click();
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0], type);
        }
    });
}

async function handleFileUpload(file, type) {
    if (!file.name.toLowerCase().endsWith('.tif') && !file.name.toLowerCase().endsWith('.tiff')) {
        showError('Please select a TIFF file.');
        return;
    }

    uploadedFiles[type] = file;
    
    if (type === 'rawImages' || type === 'annotations') {
        updateUploadStatus(type, file.name);
        
        // If both files are uploaded, validate them
        if (uploadedFiles.rawImages && uploadedFiles.annotations) {
            await validateTiffStacks();
        }
    } else if (type === 'inferenceData') {
        document.getElementById('runInferenceBtn').disabled = false;
        updateUploadStatus(type, file.name);
    }
}

function updateUploadStatus(type, filename) {
    const sectionMap = {
        'rawImages': 'rawUploadSection',
        'annotations': 'annotationsUploadSection',
        'inferenceData': 'inferenceUploadSection'
    };
    
    const section = document.getElementById(sectionMap[type]);
    const uploadText = section.querySelector('.upload-text');
    
    uploadText.innerHTML = `
        <h3>✅ ${filename}</h3>
        <p>File uploaded successfully</p>
    `;
    section.style.borderColor = '#4CAF50';
    section.style.backgroundColor = '#e8f5e8';
}

async function validateTiffStacks() {
    showLoading('Validating TIFF stacks...', 'Please wait while we check file compatibility.');
    
    const formData = new FormData();
    formData.append('raw_images', uploadedFiles.rawImages);
    formData.append('annotations', uploadedFiles.annotations);

    try {
        const response = await fetch('/upload-data', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        hideLoading();

        if (result.success) {
            showValidationSuccess(result.validation);
            document.getElementById('step1Next').disabled = false;
        } else {
            // Use result.details for the actual error message from Python validation
            const errorMessage = result.details || result.error || 'Unknown validation error';
            showValidationError(errorMessage);
        }
    } catch (error) {
        hideLoading();
        showError('Error during validation: ' + error.message);
    }
}

function showValidationSuccess(validation) {
    const validationDiv = document.getElementById('validationResult');
    validationDiv.innerHTML = `
        <div class="validation-info">
            <h3>✅ Validation Successful</h3>
            <p><strong>Stack Shape:</strong> ${validation.info.shape.join(' × ')}</p>
            <p><strong>Number of Slices:</strong> ${validation.info.num_slices}</p>
            <p><strong>Slice Dimensions:</strong> ${validation.info.slice_dimensions.join(' × ')}</p>
            <p><strong>Raw Images Size:</strong> ${validation.info.raw_size_mb} MB</p>
            <p><strong>Annotations Size:</strong> ${validation.info.annotation_size_mb} MB</p>
            <p><strong>Annotation Classes:</strong> ${validation.info.annotation_stats.unique_values.join(', ')}</p>
        </div>
    `;
}

function showValidationError(error) {
    const validationDiv = document.getElementById('validationResult');
    validationDiv.innerHTML = `
        <div class="validation-error">
            <h3>❌ Validation Failed</h3>
            <p>${error}</p>
        </div>
    `;
}