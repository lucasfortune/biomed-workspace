/**
 * Denoising Socket Handlers
 *
 * Socket.IO event handlers for DL denoising room management and progress updates.
 * Supports multi-stage training (stage1, mask extraction, stage2) and inference.
 */

/**
 * Register denoising-related socket event handlers
 * @param {object} socket - Socket.IO socket instance
 * @param {object} logger - Logger instance
 */
function registerDenoisingHandlers(socket, logger) {
  /**
   * Handle client joining a denoising training room
   * Clients join rooms to receive real-time training progress updates
   */
  socket.on('join-denoising', (trainingId) => {
    const roomName = `denoising-${trainingId}`;
    socket.join(roomName);
    logger.debug(`Client ${socket.id} joined denoising room: ${roomName}`);
  });

  /**
   * Handle client leaving a denoising training room
   */
  socket.on('leave-denoising', (trainingId) => {
    const roomName = `denoising-${trainingId}`;
    socket.leave(roomName);
    logger.debug(`Client ${socket.id} left denoising room: ${roomName}`);
  });

  /**
   * Handle client joining a denoising inference room
   */
  socket.on('join-denoising-inference', (inferenceId) => {
    const roomName = `denoising-inference-${inferenceId}`;
    socket.join(roomName);
    logger.debug(`Client ${socket.id} joined denoising inference room: ${roomName}`);
  });

  /**
   * Handle client leaving a denoising inference room
   */
  socket.on('leave-denoising-inference', (inferenceId) => {
    const roomName = `denoising-inference-${inferenceId}`;
    socket.leave(roomName);
    logger.debug(`Client ${socket.id} left denoising inference room: ${roomName}`);
  });
}

// =============================================================================
// Stage 1 Progress Emit Functions
// =============================================================================

/**
 * Emit stage 1 progress
 * @param {object} io - Socket.IO server instance
 * @param {string} trainingId - Training ID
 * @param {object} progress - Progress data
 */
function emitDenoisingStage1Progress(io, trainingId, progress) {
  io.to(`denoising-${trainingId}`).emit('denoising-stage1-progress', progress);
}

/**
 * Emit stage 1 completion
 * @param {object} io - Socket.IO server instance
 * @param {string} trainingId - Training ID
 * @param {object} result - Result data
 */
function emitDenoisingStage1Complete(io, trainingId, result) {
  io.to(`denoising-${trainingId}`).emit('denoising-stage1-complete', result);
}

// =============================================================================
// Mask Extraction Emit Functions
// =============================================================================

/**
 * Emit mask extraction progress
 * @param {object} io - Socket.IO server instance
 * @param {string} trainingId - Training ID
 * @param {object} progress - Progress data
 */
function emitDenoisingMaskProgress(io, trainingId, progress) {
  io.to(`denoising-${trainingId}`).emit('denoising-mask-progress', progress);
}

/**
 * Emit mask extraction result
 * @param {object} io - Socket.IO server instance
 * @param {string} trainingId - Training ID
 * @param {object} result - Result data including mask info
 */
function emitDenoisingMaskResult(io, trainingId, result) {
  io.to(`denoising-${trainingId}`).emit('denoising-mask-result', result);
}

// =============================================================================
// Stage 2 Progress Emit Functions
// =============================================================================

/**
 * Emit stage 2 progress
 * @param {object} io - Socket.IO server instance
 * @param {string} trainingId - Training ID
 * @param {object} progress - Progress data
 */
function emitDenoisingStage2Progress(io, trainingId, progress) {
  io.to(`denoising-${trainingId}`).emit('denoising-stage2-progress', progress);
}

/**
 * Emit stage 2 completion
 * @param {object} io - Socket.IO server instance
 * @param {string} trainingId - Training ID
 * @param {object} result - Result data
 */
function emitDenoisingStage2Complete(io, trainingId, result) {
  io.to(`denoising-${trainingId}`).emit('denoising-stage2-complete', result);
}

// =============================================================================
// Training Complete Emit Functions
// =============================================================================

/**
 * Emit training complete (all stages)
 * @param {object} io - Socket.IO server instance
 * @param {string} trainingId - Training ID
 * @param {object} result - Final result { success, method, experimentDir, error? }
 */
function emitDenoisingTrainingComplete(io, trainingId, result) {
  io.to(`denoising-${trainingId}`).emit('denoising-training-complete', result);
}

// =============================================================================
// Inference Emit Functions
// =============================================================================

/**
 * Emit inference progress
 * @param {object} io - Socket.IO server instance
 * @param {string} inferenceId - Inference ID
 * @param {object} progress - Progress data
 */
function emitDenoisingInferenceProgress(io, inferenceId, progress) {
  io.to(`denoising-inference-${inferenceId}`).emit('denoising-inference-progress', progress);
}

/**
 * Emit inference completion
 * @param {object} io - Socket.IO server instance
 * @param {string} inferenceId - Inference ID
 * @param {object} result - Result data
 */
function emitDenoisingInferenceComplete(io, inferenceId, result) {
  io.to(`denoising-inference-${inferenceId}`).emit('denoising-inference-complete', result);
}

// =============================================================================
// Error Emit Function
// =============================================================================

/**
 * Emit denoising error
 * @param {object} io - Socket.IO server instance
 * @param {string} id - Training or inference ID
 * @param {object} error - Error data { stage, message, details? }
 */
function emitDenoisingError(io, id, error) {
  // Try both room types
  io.to(`denoising-${id}`).emit('denoising-error', error);
  io.to(`denoising-inference-${id}`).emit('denoising-error', error);
}

module.exports = {
  registerDenoisingHandlers,
  emitDenoisingStage1Progress,
  emitDenoisingStage1Complete,
  emitDenoisingMaskProgress,
  emitDenoisingMaskResult,
  emitDenoisingStage2Progress,
  emitDenoisingStage2Complete,
  emitDenoisingTrainingComplete,
  emitDenoisingInferenceProgress,
  emitDenoisingInferenceComplete,
  emitDenoisingError
};
