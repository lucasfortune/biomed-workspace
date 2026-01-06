/**
 * TrainingSessionPersistence.js - Client-side session persistence for training sessions
 *
 * Handles saving and restoring active training sessions to localStorage,
 * allowing users to refresh the page or navigate away and resume their training.
 */

class TrainingSessionPersistence {
  static STORAGE_KEY = 'workspace_active_training';
  static LOCK_KEY = 'workspace_training_lock';

  /**
   * Save an active training session to localStorage
   * @param {Object} session - Training session data
   * @param {string} session.moduleType - 'segmentation' | 'denoising-dl'
   * @param {string} session.trainingId - Unique training ID
   * @param {string} session.stage - Current stage ('training', 'paused_at_mask', 'stage2')
   * @param {Object} session.config - Training configuration
   * @param {string} session.status - 'running' | 'paused'
   */
  static save(session) {
    try {
      const data = {
        moduleType: session.moduleType,
        trainingId: session.trainingId,
        startedAt: session.startedAt || new Date().toISOString(),
        stage: session.stage || 'training',
        config: session.config || {},
        status: session.status || 'running',
        lastProgressAt: new Date().toISOString()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      console.log('[TrainingSessionPersistence] Session saved:', data.trainingId);
      return true;
    } catch (error) {
      console.error('[TrainingSessionPersistence] Failed to save session:', error);
      return false;
    }
  }

  /**
   * Load the active training session from localStorage
   * @returns {Object|null} - Session data or null if no active session
   */
  static load() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;

      const session = JSON.parse(stored);
      console.log('[TrainingSessionPersistence] Session loaded:', session.trainingId);
      return session;
    } catch (error) {
      console.error('[TrainingSessionPersistence] Failed to load session:', error);
      return null;
    }
  }

  /**
   * Clear the active training session from localStorage
   */
  static clear() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('[TrainingSessionPersistence] Session cleared');
      return true;
    } catch (error) {
      console.error('[TrainingSessionPersistence] Failed to clear session:', error);
      return false;
    }
  }

  /**
   * Check if there's an active training session
   * @returns {boolean}
   */
  static isActive() {
    return localStorage.getItem(this.STORAGE_KEY) !== null;
  }

  /**
   * Get the module type of the active training session
   * @returns {string|null} - 'segmentation' | 'denoising-dl' | null
   */
  static getModuleType() {
    const session = this.load();
    return session ? session.moduleType : null;
  }

  /**
   * Update the stage of the current training session
   * @param {string} stage - New stage ('training', 'paused_at_mask', 'stage2')
   */
  static updateStage(stage) {
    const session = this.load();
    if (session) {
      session.stage = stage;
      session.lastProgressAt = new Date().toISOString();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
      console.log('[TrainingSessionPersistence] Stage updated:', stage);
    }
  }

  /**
   * Update the last progress timestamp (for stale detection)
   */
  static updateProgress() {
    const session = this.load();
    if (session) {
      session.lastProgressAt = new Date().toISOString();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
    }
  }

  /**
   * Check if the session is stale (no progress for specified minutes)
   * @param {number} minutes - Minutes threshold for stale detection (default: 10)
   * @returns {boolean}
   */
  static isStale(minutes = 10) {
    const session = this.load();
    if (!session || !session.lastProgressAt) return false;

    const lastProgress = new Date(session.lastProgressAt);
    const now = new Date();
    const diffMinutes = (now - lastProgress) / (1000 * 60);

    return diffMinutes > minutes;
  }

  // ==================== Global Training Lock ====================

  /**
   * Attempt to acquire the global training lock
   * @param {string} moduleType - 'segmentation' | 'denoising-dl'
   * @param {string} trainingId - Training ID
   * @returns {boolean} - true if lock acquired, false if already locked
   */
  static acquireLock(moduleType, trainingId) {
    try {
      const existingLock = this.getLockOwner();

      // If there's an existing lock for a different training, deny
      if (existingLock && existingLock.trainingId !== trainingId) {
        console.log('[TrainingSessionPersistence] Lock denied - already held by:', existingLock.moduleType);
        return false;
      }

      const lock = {
        moduleType,
        trainingId,
        lockedAt: new Date().toISOString()
      };
      localStorage.setItem(this.LOCK_KEY, JSON.stringify(lock));
      console.log('[TrainingSessionPersistence] Lock acquired for:', moduleType);
      return true;
    } catch (error) {
      console.error('[TrainingSessionPersistence] Failed to acquire lock:', error);
      return false;
    }
  }

  /**
   * Release the global training lock
   */
  static releaseLock() {
    try {
      localStorage.removeItem(this.LOCK_KEY);
      console.log('[TrainingSessionPersistence] Lock released');
      return true;
    } catch (error) {
      console.error('[TrainingSessionPersistence] Failed to release lock:', error);
      return false;
    }
  }

  /**
   * Check if the global training lock is held
   * @returns {boolean}
   */
  static isLocked() {
    return localStorage.getItem(this.LOCK_KEY) !== null;
  }

  /**
   * Get the current lock owner
   * @returns {Object|null} - { moduleType, trainingId, lockedAt } or null
   */
  static getLockOwner() {
    try {
      const stored = localStorage.getItem(this.LOCK_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (error) {
      console.error('[TrainingSessionPersistence] Failed to get lock owner:', error);
      return null;
    }
  }

  /**
   * Clear both session and lock (for complete cleanup)
   */
  static clearAll() {
    this.clear();
    this.releaseLock();
    console.log('[TrainingSessionPersistence] All data cleared');
  }

  /**
   * Get human-readable module name
   * @param {string} moduleType - 'segmentation' | 'denoising-dl'
   * @returns {string}
   */
  static getModuleName(moduleType) {
    const names = {
      'segmentation': 'Segmentation',
      'denoising-dl': 'DL Denoising'
    };
    return names[moduleType] || moduleType;
  }
}

// Make available globally for modules that don't use ES6 imports
if (typeof window !== 'undefined') {
  window.TrainingSessionPersistence = TrainingSessionPersistence;
}

export default TrainingSessionPersistence;
