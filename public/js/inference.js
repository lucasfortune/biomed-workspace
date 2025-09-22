async function runInference() {
    if (!uploadedFiles.inferenceData) {
        showError('Please upload inference data first.');
        return;
    }
    
    if (!currentTrainingId) {
        showError('No training session found. Please complete training first.');
        return;
    }

    showLoading('Preparing inference...', 'Uploading data and starting segmentation.');

    const formData = new FormData();
    formData.append('inference_data', uploadedFiles.inferenceData);

    try {
        // Upload inference data
        const uploadResponse = await fetch('/upload-inference', {
            method: 'POST',
            body: formData
        });

        const uploadResult = await uploadResponse.json();
        if (!uploadResult.success) {
            throw new Error(uploadResult.error);
        }

        // Start inference
        const inferenceResponse = await fetch('/run-inference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model_path: `models/${currentTrainingId}/best_model.pth`,
                data_path: uploadResult.file_path,
                output_path: `results/${currentTrainingId}/inference_result.tif`,
                training_id: currentTrainingId
            })
        });

        const inferenceResult = await inferenceResponse.json();

        if (inferenceResult.success) {
            currentInferenceId = inferenceResult.inference_id;
            
            // Join inference room immediately for progress updates
            socket.emit('join-inference', currentInferenceId);
            
            // Update UI to show progress tracking
            updateInferenceLoadingUI();
            
            // Initialize progress display
            document.getElementById('currentSlice').textContent = '0';
            document.getElementById('totalSlices').textContent = '...';
            document.getElementById('inferenceProgressPercent').textContent = '0%';
            document.getElementById('inferenceProgressBar').style.width = '0%';
            
        } else {
            hideLoading();
            showError('Failed to start inference: ' + (inferenceResult.error || 'Unknown error') + 
                     (inferenceResult.details ? '\n' + inferenceResult.details : ''));
        }
    } catch (error) {
        hideLoading();
        showError('Error during inference: ' + error.message);
        console.error('Inference error:', error);
    }
}

function updateInferenceProgress(data) {
    
    const { current_slice, total_slices, progress_percent } = data;
    
    // Validate data
    if (current_slice === undefined || total_slices === undefined || progress_percent === undefined) {
        console.warn('Incomplete inference progress data:', data);
        return;
    }
    
    // Update slice counters
    const currentSliceEl = document.getElementById('currentSlice');
    if (currentSliceEl) {
        currentSliceEl.textContent = current_slice;
    } else {
        console.warn('currentSlice element not found');
    }
    
    const totalSlicesEl = document.getElementById('totalSlices');
    if (totalSlicesEl) {
        totalSlicesEl.textContent = total_slices;
    } else {
        console.warn('totalSlices element not found');
    }
    
    // Update progress bar
    const progressBarEl = document.getElementById('inferenceProgressBar');
    if (progressBarEl) {
        const safeProgress = Math.min(100, Math.max(0, progress_percent));
        progressBarEl.style.width = safeProgress + '%';
    } else {
        console.warn('inferenceProgressBar element not found');
    }
    
    const progressPercentEl = document.getElementById('inferenceProgressPercent');
    if (progressPercentEl) {
        progressPercentEl.textContent = Math.round(progress_percent) + '%';
    } else {
        console.warn('inferenceProgressPercent element not found');
    }
    
    // If elements don't exist, try to recreate the UI
    if (!currentSliceEl || !totalSlicesEl || !progressBarEl || !progressPercentEl) {
        console.log('Some progress elements not found, checking loading overlay...');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay && loadingOverlay.style.display !== 'none') {
            updateInferenceLoadingUI();
            // Retry updating with the new elements
            setTimeout(() => updateInferenceProgress(data), 100);
        } else {
            console.log('Loading overlay is not visible, cannot update progress');
        }
    }
}

function onInferenceComplete(data) {
    
    hideLoading();
    
    if (data.success) {
        document.getElementById('inferenceNextBtn').disabled = false;
        
        // Store inference result for 3D visualization with detailed logging
        if (data.result) {
            window.inferenceResult = data.result;
        } else {
            console.log('No data.result found, creating fallback result');
            // Create a basic result if not provided
            window.inferenceResult = {
                success: true,
                output_path: `results/${currentTrainingId}/inference_result.tif`,
                metadata_path: `results/${currentTrainingId}/inference_result_metadata.json`,
                visualization_path: `results/${currentTrainingId}/visualization_data.json`
            };
        }
        
        showSuccess('Inference completed successfully! Your segmentation is ready.');
    } else {
        showError('Inference failed: ' + (data.error || 'Unknown error'));
    }
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    
    // Insert after the inference section
    const inferenceSection = document.querySelector('.inference-section');
    inferenceSection.parentNode.insertBefore(successDiv, inferenceSection.nextSibling);
    
    // Remove after 5 seconds
    setTimeout(() => {
        successDiv.remove();
    }, 5000);
}

function updateInferenceLoadingUI() {
    // Update the loading overlay with progress elements
    document.getElementById('loadingText').textContent = 'Processing slices...';
    document.getElementById('loadingDescription').innerHTML = `
        <div id="inferenceProgressContainer" style="margin-top: 20px; text-align: center;">
            <div style="margin-bottom: 15px; font-size: 16px;">
                Slice <span id="currentSlice" style="font-weight: bold; color: #4CAF50;">0</span> 
                of <span id="totalSlices" style="font-weight: bold; color: #4CAF50;">...</span>
            </div>
            <div style="background: #e0e0e0; height: 15px; border-radius: 8px; margin: 15px 0; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);">
                <div id="inferenceProgressBar" style="background: linear-gradient(90deg, #4CAF50, #81C784); height: 100%; width: 0%; transition: width 0.3s ease; border-radius: 8px;"></div>
            </div>
            <div id="inferenceProgressPercent" style="font-size: 18px; font-weight: bold; color: #4CAF50;">0%</div>
            <div style="margin-top: 15px; font-size: 14px; color: #666;">
                <div>Initializing segmentation process...</div>
                <div style="margin-top: 5px; font-size: 12px; color: #999;">
                    Progress updates will appear once processing begins
                </div>
            </div>
        </div>
    `;
}

function downloadResults() {
    if (window.inferenceResult) {
        window.open(window.inferenceResult.result_path, '_blank');
    }
}