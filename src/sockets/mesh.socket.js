/**
 * Mesh Socket Handlers
 *
 * Socket.IO event handlers for mesh generation room management and progress updates.
 */

/**
 * Register mesh-related socket event handlers
 * @param {object} socket - Socket.IO socket instance
 * @param {object} logger - Logger instance
 */
function registerMeshHandlers(socket, logger) {
  /**
   * Handle client joining a mesh generation room
   * Clients join rooms to receive real-time mesh generation progress updates
   */
  socket.on('join-mesh-generation', (meshId) => {
    const roomName = `mesh-${meshId}`;
    socket.join(roomName);
    logger.debug(`Client ${socket.id} joined mesh room: ${roomName}`);

    // Send confirmation that client has joined the room
    socket.emit('mesh-room-joined', { meshId: meshId });
  });

  /**
   * Handle client leaving a mesh generation room
   */
  socket.on('leave-mesh-generation', (meshId) => {
    const roomName = `mesh-${meshId}`;
    socket.leave(roomName);
    logger.debug(`Client ${socket.id} left mesh room: ${roomName}`);
  });
}

/**
 * Emit mesh generation progress to all clients in a mesh room
 * @param {object} io - Socket.IO server instance
 * @param {string} meshId - Mesh generation ID
 * @param {object} progress - Progress data { class, total_classes, progress_percent, vertices_processed }
 */
function emitMeshProgress(io, meshId, progress) {
  io.to(`mesh-${meshId}`).emit('mesh-progress', {
    mesh_id: meshId,
    ...progress
  });
}

/**
 * Emit mesh generation completion to all clients in a mesh room
 * @param {object} io - Socket.IO server instance
 * @param {string} meshId - Mesh generation ID
 * @param {object} result - Result object with success status, output paths, and statistics
 */
function emitMeshComplete(io, meshId, result) {
  io.to(`mesh-${meshId}`).emit('mesh-complete', {
    mesh_id: meshId,
    ...result
  });
}

/**
 * Emit mesh generation error to all clients in a mesh room
 * @param {object} io - Socket.IO server instance
 * @param {string} meshId - Mesh generation ID
 * @param {string} error - Error message
 */
function emitMeshError(io, meshId, error) {
  io.to(`mesh-${meshId}`).emit('mesh-error', {
    mesh_id: meshId,
    error: error
  });
}

module.exports = {
  registerMeshHandlers,
  emitMeshProgress,
  emitMeshComplete,
  emitMeshError
};
