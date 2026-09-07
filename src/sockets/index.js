/**
 * Socket.IO Configuration and Initialization
 *
 * Sets up Socket.IO server and registers all event handlers.
 */

const { registerTrainingHandlers, emitTrainingProgress, emitTrainingComplete } = require('./training.socket');
const { registerInferenceHandlers, emitInferenceProgress, emitInferenceComplete } = require('./inference.socket');
const { registerMeshHandlers, emitMeshProgress, emitMeshComplete, emitMeshError } = require('./mesh.socket');
const { registerRestoreHandlers, emitRestoreProgress, emitRestoreComplete } = require('./restore.socket');
const { registerStitchingHandlers } = require('./stitching.socket');
const { registerPreprocessHandlers } = require('./preprocess.socket');
const { registerSegcleanupHandlers } = require('./segcleanup.socket');
const {
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
} = require('./denoising.socket');

const sessionTracker = require('../services/SessionTracker');

// Known job-room prefixes, longest first so 'denoising-inference-' wins
// over 'denoising-'. Every join goes through the ownership gate below.
const ROOM_PREFIXES = [
  'denoising-inference-',
  'denoising-',
  'training-',
  'inference-',
  'mesh-',
  'restore-',
  'stitching-',
  'preprocess-',
  'segcleanup-'
];

/**
 * Ownership gate for job rooms: a socket may only join the room of a job
 * that belongs to its own express session (jobs carry sessionId in the
 * SessionTracker maps / generic job registry). Exception: restore rooms -
 * their id is generated client-side and joined BEFORE the restore request
 * exists server-side, so they are gated on an authenticated session only.
 * Unknown room prefixes are denied.
 * @param {object} socket - Socket.IO socket (session attached via io.engine)
 * @param {string} room - Room name being joined
 * @param {object} logger - Logger instance
 * @returns {boolean} True when the join is allowed
 */
function isRoomJoinAllowed(socket, room, logger) {
  const sessionId = socket.request?.session?.id || null;
  const user = socket.request?.session?.user || null;
  if (!sessionId || !user) {
    logger.warn(`[Socket] Denied join (no authenticated session): ${room}`);
    return false;
  }

  const prefix = ROOM_PREFIXES.find(p => String(room).startsWith(p));
  if (!prefix) {
    logger.warn(`[Socket] Denied join (unknown room): ${room}`);
    return false;
  }

  if (prefix === 'restore-') {
    return true;
  }

  const jobId = String(room).slice(prefix.length);
  const owner = sessionTracker.getJobOwner(jobId);
  if (owner !== sessionId) {
    // Don't leak whether the job exists
    logger.warn(`[Socket] Denied join (not owner): ${room}`);
    return false;
  }
  return true;
}

/**
 * Initialize Socket.IO connection handlers
 * @param {object} io - Socket.IO server instance
 * @param {object} logger - Logger instance
 */
function initializeSocketHandlers(io, logger) {
  io.on('connection', (socket) => {
    logger.debug('Client connected:', socket.id);

    // Single choke point for room ownership: every handler below joins
    // through socket.join, so the gate covers all current and future rooms
    const originalJoin = socket.join.bind(socket);
    socket.join = (room) => {
      if (!isRoomJoinAllowed(socket, room, logger)) return undefined;
      return originalJoin(room);
    };

    // Register training event handlers
    registerTrainingHandlers(socket, logger);

    // Register inference event handlers
    registerInferenceHandlers(socket, logger);

    // Register mesh event handlers
    registerMeshHandlers(socket, logger);

    // Register denoising event handlers
    registerDenoisingHandlers(socket, logger);

    // Register restore event handlers
    registerRestoreHandlers(socket, logger);

    // Register stitching event handlers
    registerStitchingHandlers(socket, logger);

    // Register preprocess event handlers
    registerPreprocessHandlers(socket, logger);

    // Register segcleanup event handlers
    registerSegcleanupHandlers(socket, logger);

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

    // Denoising events
    denoisingStage1Progress: (trainingId, progress) => emitDenoisingStage1Progress(io, trainingId, progress),
    denoisingStage1Complete: (trainingId, result) => emitDenoisingStage1Complete(io, trainingId, result),
    denoisingMaskProgress: (trainingId, progress) => emitDenoisingMaskProgress(io, trainingId, progress),
    denoisingMaskResult: (trainingId, result) => emitDenoisingMaskResult(io, trainingId, result),
    denoisingStage2Progress: (trainingId, progress) => emitDenoisingStage2Progress(io, trainingId, progress),
    denoisingStage2Complete: (trainingId, result) => emitDenoisingStage2Complete(io, trainingId, result),
    denoisingTrainingComplete: (trainingId, result) => emitDenoisingTrainingComplete(io, trainingId, result),
    denoisingInferenceProgress: (inferenceId, progress) => emitDenoisingInferenceProgress(io, inferenceId, progress),
    denoisingInferenceComplete: (inferenceId, result) => emitDenoisingInferenceComplete(io, inferenceId, result),
    denoisingError: (id, error) => emitDenoisingError(io, id, error),

    // Restore events
    restoreProgress: (restoreId, progress) => emitRestoreProgress(io, restoreId, progress),
    restoreComplete: (restoreId, result) => emitRestoreComplete(io, restoreId, result),

    // Direct access to io for custom emissions
    io: io
  };
}

module.exports = {
  initializeSocketHandlers,
  createSocketEmitter,
  isRoomJoinAllowed,
  // Re-export individual emit functions for direct use
  emitTrainingProgress,
  emitTrainingComplete,
  emitInferenceProgress,
  emitInferenceComplete,
  emitMeshProgress,
  emitMeshComplete,
  emitMeshError,
  // Denoising emit functions
  emitDenoisingStage1Progress,
  emitDenoisingStage1Complete,
  emitDenoisingMaskProgress,
  emitDenoisingMaskResult,
  emitDenoisingStage2Progress,
  emitDenoisingStage2Complete,
  emitDenoisingTrainingComplete,
  emitDenoisingInferenceProgress,
  emitDenoisingInferenceComplete,
  emitDenoisingError,
  // Restore emit functions
  emitRestoreProgress,
  emitRestoreComplete
};
