/**
 * Preprocess Socket Handlers (ADR-008)
 *
 * Socket.IO event handlers for preprocessing job room management.
 */

/**
 * Register preprocess-related socket event handlers
 * @param {object} socket - Socket.IO socket instance
 * @param {object} logger - Logger instance
 */
function registerPreprocessHandlers(socket, logger) {
  socket.on('join-preprocess', (preprocessId) => {
    const roomName = `preprocess-${preprocessId}`;
    socket.join(roomName);
    logger.debug(`Client ${socket.id} joined preprocess room: ${roomName}`);
    socket.emit('preprocess-room-joined', { preprocessId });
  });

  socket.on('leave-preprocess', (preprocessId) => {
    const roomName = `preprocess-${preprocessId}`;
    socket.leave(roomName);
    logger.debug(`Client ${socket.id} left preprocess room: ${roomName}`);
  });
}

module.exports = { registerPreprocessHandlers };
