/**
 * Socket.IO Configuration and Initialization
 *
 * Sets up Socket.IO server and registers all event handlers.
 */

const { registerTrainingHandlers, emitTrainingProgress, emitTrainingComplete } = require('./training.socket');
const { registerInferenceHandlers, emitInferenceProgress, emitInferenceComplete } = require('./inference.socket');
const { registerMeshHandlers, emitMeshProgress, emitMeshComplete, emitMeshError } = require('./mesh.socket');

/**
 * Initialize Socket.IO connection handlers
 * @param {object} io - Socket.IO server instance
 * @param {object} logger - Logger instance
 */
function initializeSocketHandlers(io, logger) {
  io.on('connection', (socket) => {
    logger.debug('Client connected:', socket.id);

    // Register training event handlers
    registerTrainingHandlers(socket, logger);

    // Register inference event handlers
    registerInferenceHandlers(socket, logger);

    // Register mesh event handlers
    registerMeshHandlers(socket, logger);

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.debug('Client disconnected:', socket.id);
    });
  });

  logger.debug('Socket.IO handlers initialized');
}

/**
 * Create a socket emitter object with helper functions
 * This provides a clean interface for emitting events from route handlers
 * @param {object} io - Socket.IO server instance
 * @returns {object} Object with emit helper functions
 */
function createSocketEmitter(io) {
  return {
    // Training events
    trainingProgress: (trainingId, progress) => emitTrainingProgress(io, trainingId, progress),
    trainingComplete: (trainingId, result) => emitTrainingComplete(io, trainingId, result),

    // Inference events
    inferenceProgress: (inferenceId, progress) => emitInferenceProgress(io, inferenceId, progress),
    inferenceComplete: (inferenceId, result) => emitInferenceComplete(io, inferenceId, result),

    // Mesh events
    meshProgress: (meshId, progress) => emitMeshProgress(io, meshId, progress),
    meshComplete: (meshId, result) => emitMeshComplete(io, meshId, result),
    meshError: (meshId, error) => emitMeshError(io, meshId, error),

    // Direct access to io for custom emissions
    io: io
  };
}

module.exports = {
  initializeSocketHandlers,
  createSocketEmitter,
  // Re-export individual emit functions for direct use
  emitTrainingProgress,
  emitTrainingComplete,
  emitInferenceProgress,
  emitInferenceComplete,
  emitMeshProgress,
  emitMeshComplete,
  emitMeshError
};
