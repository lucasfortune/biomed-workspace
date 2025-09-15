function initializeSocketConnection() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server via WebSocket');
    });
    
    socket.on('training-progress', function(data) {
        console.log('Received training progress:', data);
        updateTrainingProgress(data);
    });
    
    socket.on('training-complete', function(data) {
        console.log('Training completed:', data);
        onTrainingComplete(data);
    });
    
    socket.on('inference-room-joined', function(data) {
        console.log('Joined inference room confirmed:', data);
    });
    
    socket.on('inference-progress', function(data) {
        console.log('Received inference progress:', data);
        updateInferenceProgress(data);
    });
    
    socket.on('inference-complete', function(data) {
        console.log('Inference completed:', data);
        onInferenceComplete(data);
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
    });
}