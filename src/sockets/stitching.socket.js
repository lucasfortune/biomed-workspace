/**
 * Stitching Socket Handlers (ADR-007)
 *
 * Socket.IO event handlers for stitch composition room management.
 */

/**
 * Register stitching-related socket event handlers
 * @param {object} socket - Socket.IO socket instance
 * @param {object} logger - Logger instance
 */
function registerStitchingHandlers(socket, logger) {
  socket.on('join-stitching', (stitchId) => {
    const roomName = `stitching-${stitchId}`;
    socket.join(roomName);
    logger.debug(`Client ${socket.id} joined stitching room: ${roomName}`);
    socket.emit('stitching-room-joined', { stitchId });
  });

  socket.on('leave-stitching', (stitchId) => {
    const roomName = `stitching-${stitchId}`;
    socket.leave(roomName);
    logger.debug(`Client ${socket.id} left stitching room: ${roomName}`);
  });
}

module.exports = { registerStitchingHandlers };
