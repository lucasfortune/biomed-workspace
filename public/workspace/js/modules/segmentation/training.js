// Training state is managed by the module instance (window.segmentationModule)
// Access via: window.segmentationModule.currentTrainingId
let trainingPollInterval = null;

async function startTraining() {
    // Get configuration
    const config = {
        patch_size: parseInt(document.getElementById('patchSize').value),
        patches_per_image: parseInt(document.getElementById('patchesPerImage').value),
        batch_size: parseInt(document.getElementById('batchSize').value),
        augment: document.getElementById('augmentation').checked,
        features: parseInt(document.getElementById('numFeatures').value),
        num_layers: parseInt(document.getElementById('numLayers').value),
        learning_rate: parseFloat(document.getElementById('learningRate').value),
        num_epochs: parseInt(document.getElementById('numEpochs').value)
    };

    // Validate configuration
    if (!validateConfiguration(config)) {
        return;
    }

    showLoading('Starting training...', 'Preparing your model and data for training.');

    try {
        // Send configuration
        const configResponse = await fetch('/configure-training', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        if (!configResponse.ok) {
            throw new Error('Configuration failed');
        }

        // Start training
        const trainingResponse = await fetch('/start-training', {
            method: 'POST'
        });

        const result = await trainingResponse.json();
        hideLoading();

        if (result.success) {
            // Store in module instance
            if (window.segmentationModule) {
                window.segmentationModule.currentTrainingId = result.training_id;
            }

            // Mark training as started
            stepStates[3].trainingStarted = true;
            processStates.trainingInProgress = true;

            // Switch from action button to progress display
            const trainingActionContent = document.getElementById('trainingActionContent');
            const trainingProgressContent = document.getElementById('trainingProgressContent');

            if (trainingActionContent) {
                trainingActionContent.style.display = 'none';
            }
            if (trainingProgressContent) {
                trainingProgressContent.style.display = 'block';
            }

            // Initialize training UI
            document.getElementById('totalEpochs').textContent = config.num_epochs;
            document.getElementById('currentEpoch').textContent = '0';
            document.getElementById('trainingStatusText').textContent = 'Training started... Preparing data...';

            // Join training room via module socket
            if (window.segmentationModule && window.segmentationModule.socket) {
                window.segmentationModule.socket.emit('join-training', window.segmentationModule.currentTrainingId);
            }
            
            // Start polling as backup
            startTrainingPolling();
            
            // Update navigation buttons
            document.getElementById('trainingBackBtn').disabled = true;
            updateNavigationButtons();
            
        } else {
            showError('Failed to start training: ' + result.error);
        }
    } catch (error) {
        hideLoading();
        showError('Error starting training: ' + error.message);
    }
}

function validateConfiguration(config) {
    // Add validation logic here
    if (config.patch_size < 64 || config.patch_size > 1024) {
        showError('Patch size must be between 64 and 1024');
        return false;
    }
    // Add more validation as needed
    return true;
}

function updateTrainingProgress(data) {
    
    const { epoch, total_epochs, metrics } = data;
    
    // Validate data
    if (!epoch || !total_epochs || !metrics) {
        console.warn('Incomplete training progress data:', data);
        return;
    }
    
    // Update progress bar
    const progress = (epoch / total_epochs) * 100;
    document.getElementById('trainingProgressFill').style.width = progress + '%';
    
    // Update epoch display
    document.getElementById('currentEpoch').textContent = epoch;
    document.getElementById('totalEpochs').textContent = total_epochs;
    
    // Update metrics with error checking
    if (metrics.train_loss !== undefined) {
        document.getElementById('trainLoss').textContent = metrics.train_loss.toFixed(4);
    }
    if (metrics.val_loss !== undefined) {
        document.getElementById('valLoss').textContent = metrics.val_loss.toFixed(4);
    }
    if (metrics.train_dice !== undefined) {
        document.getElementById('trainDice').textContent = metrics.train_dice.toFixed(4);
    }
    if (metrics.val_dice !== undefined) {
        document.getElementById('valDice').textContent = metrics.val_dice.toFixed(4);
    }
    
    // Update status
    document.getElementById('trainingStatusText').textContent = `Training in progress...`;
    
    // Update charts
    updateCharts(epoch, metrics);
}

function onTrainingComplete(data) {

    if (data.success) {
        document.getElementById('trainingStatusText').textContent = 'Training completed successfully!';

        // Training ID is already stored in window.segmentationModule.currentTrainingId

        // NEW: Mark step 3 as completed and enable step 4
        stepStates[3].completed = true;
        stepStates[3].trainingCompleted = true;
        stepStates[4].canNavigate = true;
        markStepCompleted(3);

        // Update process states
        processStates.trainingInProgress = false;

        // Enable navigation buttons
        document.getElementById('trainingNextBtn').disabled = false;
        document.getElementById('trainingBackBtn').disabled = false;

        // Update navigation buttons
        updateNavigationButtons();
        
    } else {
        document.getElementById('trainingStatusText').textContent = 'Training failed!';
        showError('Training failed. Please check your configuration and try again.');
        
        // Reset training states on failure
        stepStates[3].trainingStarted = false;
        processStates.trainingInProgress = false;
        document.getElementById('trainingBackBtn').disabled = false;
    }
    
    // Stop polling
    if (trainingPollInterval) {
        clearInterval(trainingPollInterval);
        trainingPollInterval = null;
    }
}

function startTrainingPolling() {
    if (trainingPollInterval) {
        clearInterval(trainingPollInterval);
    }
    
    trainingPollInterval = setInterval(async () => {
        const trainingId = window.segmentationModule?.currentTrainingId;
        if (!trainingId) return;

        try {
            const response = await fetch(`/training-status/${trainingId}`);
            const status = await response.json();
            
            // Update UI if we have progress data
            if (status.current_epoch && status.total_epochs && status.metrics) {
                const progressData = {
                    epoch: status.current_epoch,
                    total_epochs: status.total_epochs,
                    metrics: status.metrics
                };
                updateTrainingProgress(progressData);
            }
            
            // Check if training is complete
            if (status.status === 'completed' || status.status === 'failed') {
                onTrainingComplete({ success: status.status === 'completed' });
            }
            
        } catch (error) {
            console.error('Error polling training status:', error);
        }
    }, 5000); // Poll every 5 seconds
}

function downloadModel() {
    const trainingId = window.segmentationModule?.currentTrainingId;
    if (trainingId) {
        window.open(`/download-model/${trainingId}`, '_blank');
    }
}

window.downloadModel = downloadModel;