/**
 * Training Socket Handlers
 *
 * Socket.IO event handlers for training room management and progress updates.
 */

/**
 * Register training-related socket event handlers
 * @param {object} socket - Socket.IO socket instance
 * @param {object} logger - Logger instance
 */
function registerTrainingHandlers(socket, logger) {
  /**
   * Handle client joining a training room
   * Clients join rooms to receive real-time training progress updates
   */
  socket.on('join-training', (trainingId) => {
    const roomName = `training-${trainingId}`;
    socket.join(roomName);
    logger.debug(`Client ${socket.id} joined training room: ${roomName}`);
  });
}

/**
 * Emit training progress to all clients in a training room
 * @param {object} io - Socket.IO server instance
 * @param {string} trainingId - Training ID
 * @param {object} progress - Progress data
 */
function emitTrainingProgress(io, trainingId, progress) {
  io.to(`training-${trainingId}`).emit('training-progress', progress);
}

/**
 * Emit training completion to all clients in a training room
 * @param {object} io - Socket.IO server instance
 * @param {string} trainingId - Training ID
 * @param {object} result - Result object { success: boolean, error?: string }
 */
function emitTrainingComplete(io, trainingId, result) {
  io.to(`training-${trainingId}`).emit('training-complete', result);
}

module.exports = {
  registerTrainingHandlers,
  emitTrainingProgress,
  emitTrainingComplete
};
