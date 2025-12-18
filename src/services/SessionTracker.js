/**
 * SessionTracker Service
 *
 * Manages in-memory tracking of training and inference sessions.
 * Provides a centralized interface for session state management.
 */

/**
 * SessionTracker class for managing training and inference session state
 */
class SessionTracker {
  constructor() {
    /**
     * Map of training sessions
     * Key: trainingId
     * Value: { sessionId, username, fullName, status, startTime, endTime,
     *          current_epoch, total_epochs, metrics, params, isTestData, error }
     */
    this.trainingSessions = new Map();

    /**
     * Map of inference sessions
     * Key: inferenceId
     * Value: { sessionId, username, fullName, status, startTime, endTime,
     *          progress, currentSlice, totalSlices, usingImportedModel, result, error }
     */
    this.inferenceSessions = new Map();
  }

  // ============================================================================
  // TRAINING SESSION METHODS
  // ============================================================================

  /**
   * Create a new training session
   * @param {string} trainingId - Unique training ID
   * @param {object} data - Training session data
   * @returns {object} The created training session
   */
  createTrainingSession(trainingId, data) {
    const session = {
      sessionId: data.sessionId,
      username: data.username,
      fullName: data.fullName,
      status: data.status || 'initializing',
      startTime: data.startTime || new Date(),
      endTime: null,
      current_epoch: 0,
      total_epochs: data.total_epochs || 0,
      metrics: {},
      params: data.params || {},
      isTestData: data.isTestData || false,
      error: null
    };

    this.trainingSessions.set(trainingId, session);
    return session;
  }

  /**
   * Get a training session by ID
   * @param {string} trainingId - Training ID
   * @returns {object|undefined} Training session or undefined
   */
  getTrainingSession(trainingId) {
    return this.trainingSessions.get(trainingId);
  }

  /**
   * Update a training session
   * @param {string} trainingId - Training ID
   * @param {object} updates - Fields to update
   * @returns {object|null} Updated session or null if not found
   */
  updateTrainingSession(trainingId, updates) {
    const session = this.trainingSessions.get(trainingId);
    if (!session) return null;

    Object.assign(session, updates);
    return session;
  }

  /**
   * Delete a training session
   * @param {string} trainingId - Training ID
   * @returns {boolean} True if deleted
   */
  deleteTrainingSession(trainingId) {
    return this.trainingSessions.delete(trainingId);
  }

  /**
   * Get all training sessions for a specific user session
   * @param {string} sessionId - User session ID
   * @returns {Array<[string, object]>} Array of [trainingId, session] pairs
   */
  getTrainingSessionsBySessionId(sessionId) {
    const sessions = [];
    for (const [trainingId, training] of this.trainingSessions.entries()) {
      if (training.sessionId === sessionId) {
        sessions.push([trainingId, training]);
      }
    }
    return sessions;
  }

  /**
   * Get all training sessions
   * @returns {Map} All training sessions
   */
  getAllTrainingSessions() {
    return this.trainingSessions;
  }

  // ============================================================================
  // INFERENCE SESSION METHODS
  // ============================================================================

  /**
   * Create a new inference session
   * @param {string} inferenceId - Unique inference ID
   * @param {object} data - Inference session data
   * @returns {object} The created inference session
   */
  createInferenceSession(inferenceId, data) {
    const session = {
      sessionId: data.sessionId,
      username: data.username,
      fullName: data.fullName,
      status: data.status || 'initializing',
      startTime: data.startTime || new Date(),
      endTime: null,
      progress: 0,
      currentSlice: 0,
      totalSlices: 0,
      usingImportedModel: data.usingImportedModel || false,
      result: null,
      error: null
    };

    this.inferenceSessions.set(inferenceId, session);
    return session;
  }

  /**
   * Get an inference session by ID
   * @param {string} inferenceId - Inference ID
   * @returns {object|undefined} Inference session or undefined
   */
  getInferenceSession(inferenceId) {
    return this.inferenceSessions.get(inferenceId);
  }

  /**
   * Update an inference session
   * @param {string} inferenceId - Inference ID
   * @param {object} updates - Fields to update
   * @returns {object|null} Updated session or null if not found
   */
  updateInferenceSession(inferenceId, updates) {
    const session = this.inferenceSessions.get(inferenceId);
    if (!session) return null;

    Object.assign(session, updates);
    return session;
  }

  /**
   * Delete an inference session
   * @param {string} inferenceId - Inference ID
   * @returns {boolean} True if deleted
   */
  deleteInferenceSession(inferenceId) {
    return this.inferenceSessions.delete(inferenceId);
  }

  /**
   * Get all inference sessions for a specific user session
   * @param {string} sessionId - User session ID
   * @returns {Array<[string, object]>} Array of [inferenceId, session] pairs
   */
  getInferenceSessionsBySessionId(sessionId) {
    const sessions = [];
    for (const [inferenceId, inference] of this.inferenceSessions.entries()) {
      if (inference.sessionId === sessionId) {
        sessions.push([inferenceId, inference]);
      }
    }
    return sessions;
  }

  /**
   * Get all inference sessions
   * @returns {Map} All inference sessions
   */
  getAllInferenceSessions() {
    return this.inferenceSessions;
  }

  // ============================================================================
  // CLEANUP METHODS
  // ============================================================================

  /**
   * Clean up all sessions for a specific user session ID
   * @param {string} sessionId - User session ID
   * @returns {object} Cleanup results { trainingIds: [], inferenceIds: [] }
   */
  cleanupSessionById(sessionId) {
    const result = {
      trainingIds: [],
      inferenceIds: []
    };

    // Clean up training sessions
    for (const [trainingId, training] of this.trainingSessions.entries()) {
      if (training.sessionId === sessionId) {
        result.trainingIds.push(trainingId);
        this.trainingSessions.delete(trainingId);
      }
    }

    // Clean up inference sessions
    for (const [inferenceId, inference] of this.inferenceSessions.entries()) {
      if (inference.sessionId === sessionId) {
        result.inferenceIds.push(inferenceId);
        this.inferenceSessions.delete(inferenceId);
      }
    }

    return result;
  }

  /**
   * Get statistics about active sessions
   * @returns {object} Session statistics
   */
  getStats() {
    const trainingStats = {
      total: this.trainingSessions.size,
      active: 0,
      completed: 0,
      failed: 0
    };

    const inferenceStats = {
      total: this.inferenceSessions.size,
      active: 0,
      completed: 0,
      failed: 0
    };

    for (const training of this.trainingSessions.values()) {
      if (training.status === 'training' || training.status === 'initializing') {
        trainingStats.active++;
      } else if (training.status === 'completed') {
        trainingStats.completed++;
      } else if (training.status === 'failed') {
        trainingStats.failed++;
      }
    }

    for (const inference of this.inferenceSessions.values()) {
      if (inference.status === 'running' || inference.status === 'initializing') {
        inferenceStats.active++;
      } else if (inference.status === 'completed') {
        inferenceStats.completed++;
      } else if (inference.status === 'failed') {
        inferenceStats.failed++;
      }
    }

    return {
      training: trainingStats,
      inference: inferenceStats
    };
  }
}

// Export singleton instance
const sessionTracker = new SessionTracker();

module.exports = sessionTracker;
