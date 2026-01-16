/**
 * Restore Socket Handlers
 *
 * Socket.IO event handlers for workspace restore room management and progress updates.
 */

/**
 * Register restore-related socket event handlers
 * @param {object} socket - Socket.IO socket instance
 * @param {object} logger - Logger instance
 */
function registerRestoreHandlers(socket, logger) {
  /**
   * Handle client joining a restore room
   * Clients join rooms to receive real-time workspace restore progress updates
   */
  socket.on('join-restore', (restoreId) => {
    const roomName = `restore-${restoreId}`;
    socket.join(roomName);
    logger.debug(`Client ${socket.id} joined restore room: ${roomName}`);

    // Send confirmation that client has joined the room
    socket.emit('restore-room-joined', { restoreId: restoreId });
  });

  /**
   * Handle client leaving a restore room
   */
  socket.on('leave-restore', (restoreId) => {
    const roomName = `restore-${restoreId}`;
    socket.leave(roomName);
    logger.debug(`Client ${socket.id} left restore room: ${roomName}`);
  });
}

/**
 * Emit restore progress to all clients in a restore room
 * @param {object} io - Socket.IO server instance
 * @param {string} restoreId - Restore operation ID
 * @param {object} progress - Progress data { phase, progress, message }
 */
function emitRestoreProgress(io, restoreId, progress) {
  io.to(`restore-${restoreId}`).emit('restore-progress', {
    restoreId: restoreId,
    ...progress
  });
}

/**
 * Emit restore completion to all clients in a restore room
 * @param {object} io - Socket.IO server instance
 * @param {string} restoreId - Restore operation ID
 * @param {object} result - Result object with success status, file/folder counts
 */
function emitRestoreComplete(io, restoreId, result) {
  io.to(`restore-${restoreId}`).emit('restore-complete', {
    restoreId: restoreId,
    ...result
  });
}

module.exports = {
  registerRestoreHandlers,
  emitRestoreProgress,
  emitRestoreComplete
};
