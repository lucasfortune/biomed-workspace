/**
 * Segmentation Cleanup Socket Handlers (ADR-009)
 *
 * Socket.IO event handlers for segcleanup job room management.
 */

/**
 * Register segcleanup-related socket event handlers
 * @param {object} socket - Socket.IO socket instance
 * @param {object} logger - Logger instance
 */
function registerSegcleanupHandlers(socket, logger) {
  socket.on('join-segcleanup', (jobId) => {
    const roomName = `segcleanup-${jobId}`;
    socket.join(roomName);
    logger.debug(`Client ${socket.id} joined segcleanup room: ${roomName}`);
    socket.emit('segcleanup-room-joined', { jobId });
  });

  socket.on('leave-segcleanup', (jobId) => {
    const roomName = `segcleanup-${jobId}`;
    socket.leave(roomName);
    logger.debug(`Client ${socket.id} left segcleanup room: ${roomName}`);
  });
}

module.exports = { registerSegcleanupHandlers };
