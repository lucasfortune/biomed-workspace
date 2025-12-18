/**
 * Inference Socket Handlers
 *
 * Socket.IO event handlers for inference room management and progress updates.
 */

/**
 * Register inference-related socket event handlers
 * @param {object} socket - Socket.IO socket instance
 * @param {object} logger - Logger instance
 */
function registerInferenceHandlers(socket, logger) {
  /**
   * Handle client joining an inference room
   * Clients join rooms to receive real-time inference progress updates
   * A confirmation message is sent back to the client
   */
  socket.on('join-inference', (inferenceId) => {
    const roomName = `inference-${inferenceId}`;
    socket.join(roomName);
    logger.debug(`Client ${socket.id} joined inference room: ${roomName}`);

    // Send confirmation that client has joined the room
    socket.emit('inference-room-joined', { inferenceId: inferenceId });
  });
}

/**
 * Emit inference progress to all clients in an inference room
 * @param {object} io - Socket.IO server instance
 * @param {string} inferenceId - Inference ID
 * @param {object} progress - Progress data { current_slice, total_slices, progress_percent }
 */
function emitInferenceProgress(io, inferenceId, progress) {
  io.to(`inference-${inferenceId}`).emit('inference-progress', progress);
}

/**
 * Emit inference completion to all clients in an inference room
 * @param {object} io - Socket.IO server instance
 * @param {string} inferenceId - Inference ID
 * @param {object} result - Result object with success status and output paths
 */
function emitInferenceComplete(io, inferenceId, result) {
  io.to(`inference-${inferenceId}`).emit('inference-complete', result);
}

module.exports = {
  registerInferenceHandlers,
  emitInferenceProgress,
  emitInferenceComplete
};
