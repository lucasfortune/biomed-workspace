async function runInference() {
    if (!uploadedFiles.inferenceData) {
        showError('Please upload inference data first.');
        return;
    }
    
    // NEW: Check if we're using imported model OR have training session
    const usingImportedModel = window.importedModelInfo;
    if (!currentTrainingId && !usingImportedModel) {
        showError('No training session found and no imported model. Please complete training or import a model first.');
        return;
    }

    showLoading('Preparing inference...', 'Uploading data and starting segmentation.');

    try {
        let uploadResult;
        
        // Check if we're using test data
        if (uploadedFiles.inferenceData.isTestData) {
            console.log('Using test data for inference');
            
            // For test data, send a special request to handle server-side file copying
            const testDataForm = new FormData();
            testDataForm.append('isTestData', 'true');
            
            const uploadResponse = await fetch('/upload-inference', {
                method: 'POST',
                body: testDataForm
            });
            
            uploadResult = await uploadResponse.json();
            if (!uploadResult.success) {
                throw new Error(uploadResult.error);
            }
            
        } else {
            // Handle regular uploaded files
            const formData = new FormData();
            formData.append('inference_data', uploadedFiles.inferenceData);

            const uploadResponse = await fetch('/upload-inference', {
                method: 'POST',
                body: formData
            });

            uploadResult = await uploadResponse.json();
            if (!uploadResult.success) {
                throw new Error(uploadResult.error);
            }
        }

        // NEW: Build inference request based on model type
        let inferenceRequestBody;
        
        if (usingImportedModel) {
            console.log('Running inference with imported model');
            // For imported model, send minimal request - server will handle model path
            inferenceRequestBody = {
                data_path: uploadResult.file_path,
                output_path: `results/imported_model_${Date.now()}/inference_result.tif`,
                // Don't send training_id for imported models
            };
        } else {
            console.log('Running inference with trained model');
            // For trained model, use original logic
            inferenceRequestBody = {
                model_path: `models/${currentTrainingId}/best_model.pth`,
                data_path: uploadResult.file_path,
                output_path: `results/${currentTrainingId}/inference_result.tif`,
                training_id: currentTrainingId
            };
        }

        // Start inference
        const inferenceResponse = await fetch('/run-inference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inferenceRequestBody)
        });

        const inferenceResult = await inferenceResponse.json();

        if (inferenceResult.success) {
            currentInferenceId = inferenceResult.inference_id;
            
            console.log('Inference started successfully:', inferenceResult.model_info);
            
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
                     (inferenceResult.details ? ('\n' + inferenceResult.details) : ''));
        }

    } catch (error) {
        hideLoading();
        showError('Error during inference: ' + error.message);
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
            
            // NEW: Handle both training and imported model cases
            const usingImportedModel = window.importedModelInfo;
            const resultPath = usingImportedModel 
                ? `results/imported_model_${Date.now()}/inference_result.tif`
                : `results/${currentTrainingId}/inference_result.tif`;
                
            // Create a basic result if not provided
            window.inferenceResult = {
                success: true,
                output_path: resultPath,
                metadata_path: resultPath.replace('.tif', '_metadata.json'),
                visualization_path: resultPath.replace('.tif', '_visualization.json').replace('inference_result', 'visualization_data')
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