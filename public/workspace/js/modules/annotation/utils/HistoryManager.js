/**
 * HistoryManager.js
 *
 * Manages per-slice undo/redo history for annotation editing.
 * Stores annotation states as Uint8Array snapshots.
 */

class HistoryManager {
  /**
   * Create a new HistoryManager
   * @param {Object} options - Configuration options
   * @param {number} options.maxStatesPerSlice - Maximum undo states per slice (default: 20)
   */
  constructor(options = {}) {
    this.maxStatesPerSlice = options.maxStatesPerSlice || 20;

    // Storage: Map<sliceIndex, { undoStack: Uint8Array[], redoStack: Uint8Array[] }>
    this.history = new Map();

    // Event callbacks
    this.onHistoryChange = null;
  }

  /**
   * Get or create history entry for a slice
   * @param {number} sliceIndex - Slice index
   * @returns {Object} History entry with undoStack and redoStack
   */
  getSliceHistory(sliceIndex) {
    if (!this.history.has(sliceIndex)) {
      this.history.set(sliceIndex, {
        undoStack: [],
        redoStack: []
      });
    }
    return this.history.get(sliceIndex);
  }

  /**
   * Save current state before making changes
   * Call this before each stroke/edit operation
   * @param {number} sliceIndex - Slice index
   * @param {Uint8Array} annotationData - Current annotation data to save
   */
  saveState(sliceIndex, annotationData) {
    if (!annotationData) return;

    const history = this.getSliceHistory(sliceIndex);

    // Clone the data to avoid reference issues
    const snapshot = new Uint8Array(annotationData);

    // Push to undo stack
    history.undoStack.push(snapshot);

    // Clear redo stack (new edit invalidates redo)
    history.redoStack = [];

    // Trim undo stack if exceeds max
    while (history.undoStack.length > this.maxStatesPerSlice) {
      history.undoStack.shift(); // Remove oldest state
    }

    this.notifyChange(sliceIndex);
  }

  /**
   * Undo the last edit on a slice
   * @param {number} sliceIndex - Slice index
   * @param {Uint8Array} currentData - Current annotation data (to push to redo stack)
   * @returns {Uint8Array|null} Previous state to restore, or null if nothing to undo
   */
  undo(sliceIndex, currentData) {
    const history = this.getSliceHistory(sliceIndex);

    if (history.undoStack.length === 0) {
      return null;
    }

    // Push current state to redo stack
    if (currentData) {
      history.redoStack.push(new Uint8Array(currentData));
    }

    // Pop previous state from undo stack
    const previousState = history.undoStack.pop();

    this.notifyChange(sliceIndex);

    return previousState;
  }

  /**
   * Redo a previously undone edit
   * @param {number} sliceIndex - Slice index
   * @param {Uint8Array} currentData - Current annotation data (to push to undo stack)
   * @returns {Uint8Array|null} Next state to restore, or null if nothing to redo
   */
  redo(sliceIndex, currentData) {
    const history = this.getSliceHistory(sliceIndex);

    if (history.redoStack.length === 0) {
      return null;
    }

    // Push current state to undo stack
    if (currentData) {
      history.undoStack.push(new Uint8Array(currentData));
    }

    // Pop next state from redo stack
    const nextState = history.redoStack.pop();

    this.notifyChange(sliceIndex);

    return nextState;
  }

  /**
   * Check if undo is available for a slice
   * @param {number} sliceIndex - Slice index
   * @returns {boolean} True if undo is available
   */
  canUndo(sliceIndex) {
    const history = this.history.get(sliceIndex);
    return history ? history.undoStack.length > 0 : false;
  }

  /**
   * Check if redo is available for a slice
   * @param {number} sliceIndex - Slice index
   * @returns {boolean} True if redo is available
   */
  canRedo(sliceIndex) {
    const history = this.history.get(sliceIndex);
    return history ? history.redoStack.length > 0 : false;
  }

  /**
   * Get the number of undo states for a slice
   * @param {number} sliceIndex - Slice index
   * @returns {number} Number of undo states
   */
  getUndoCount(sliceIndex) {
    const history = this.history.get(sliceIndex);
    return history ? history.undoStack.length : 0;
  }

  /**
   * Get the number of redo states for a slice
   * @param {number} sliceIndex - Slice index
   * @returns {number} Number of redo states
   */
  getRedoCount(sliceIndex) {
    const history = this.history.get(sliceIndex);
    return history ? history.redoStack.length : 0;
  }

  /**
   * Clear history for a specific slice
   * @param {number} sliceIndex - Slice index
   */
  clearSliceHistory(sliceIndex) {
    this.history.delete(sliceIndex);
    this.notifyChange(sliceIndex);
  }

  /**
   * Clear all history
   */
  clearAllHistory() {
    this.history.clear();
    this.notifyChange(null);
  }

  /**
   * Get memory usage estimate in bytes
   * @returns {number} Estimated memory usage in bytes
   */
  getMemoryUsage() {
    let totalBytes = 0;

    for (const [, history] of this.history) {
      for (const state of history.undoStack) {
        totalBytes += state.byteLength;
      }
      for (const state of history.redoStack) {
        totalBytes += state.byteLength;
      }
    }

    return totalBytes;
  }

  /**
   * Get formatted memory usage string
   * @returns {string} Formatted memory usage (e.g., "5.2 MB")
   */
  getFormattedMemoryUsage() {
    const bytes = this.getMemoryUsage();

    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }

  /**
   * Notify listeners of history change
   * @param {number|null} sliceIndex - Slice index that changed, or null for all
   */
  notifyChange(sliceIndex) {
    if (this.onHistoryChange) {
      this.onHistoryChange({
        sliceIndex,
        canUndo: sliceIndex !== null ? this.canUndo(sliceIndex) : false,
        canRedo: sliceIndex !== null ? this.canRedo(sliceIndex) : false
      });
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.clearAllHistory();
    this.onHistoryChange = null;
  }
}

export default HistoryManager;
