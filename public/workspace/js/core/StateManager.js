/**
 * StateManager - Centralized state management with event-based subscriptions
 * Uses mitt for lightweight event system
 */
class StateManager {
  constructor() {
    this.state = {
      workspace: {
        sessionId: null,
        initialized: false,
        files: [],
        stats: null,
        activeModule: null
      },
      modules: {
        segmentation: {
          active: false,
          currentTask: null,
          history: [],
          inferenceResults: null  // For passing results to imageviewer
        },
        imageviewer: {
          active: false,
          currentFile: null,
          viewMode: 'gallery',
          currentSlice: 0
        },
        denoising: {
          active: false,
          currentTask: null,
          history: []
        },
        annotation: {
          active: false,
          currentFile: null,
          history: []
        },
        mesh: {
          active: false,
          currentTask: null,
          history: []
        }
      },
      ui: {
        sidebarCollapsed: true,
        currentView: 'welcome',
        loading: false,
        notifications: []
      },
      infoPanel: {
        isOpen: false,
        currentArticleId: null,
        glossaryExpanded: false,
        searchQuery: ''
      },
      user: {
        username: null,
        fullName: null,
        status: null,
        isAdmin: false
      }
    };

    // Initialize event emitter (mitt)
    this.events = mitt();

    // Bind methods
    this.update = this.update.bind(this);
    this.get = this.get.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.reset = this.reset.bind(this);
  }

  /**
   * Update state at a given path
   * @param {string} path - Dot-notation path (e.g., 'workspace.files')
   * @param {*} value - New value
   */
  update(path, value) {
    const keys = path.split('.');
    let current = this.state;

    // Navigate to the parent of the target property
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    // Update the value
    const lastKey = keys[keys.length - 1];
    const oldValue = current[lastKey];
    current[lastKey] = value;

    // Emit change event
    this.events.emit('state:change', { path, value, oldValue });
    this.events.emit(`state:change:${path}`, { value, oldValue });

    console.log(`[StateManager] Updated ${path}:`, value);
  }

  /**
   * Get state value at a given path
   * @param {string} path - Dot-notation path
   * @returns {*} Value at path
   */
  get(path) {
    const keys = path.split('.');
    let current = this.state;

    for (const key of keys) {
      if (current[key] === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Subscribe to state changes at a specific path
   * @param {string} path - Dot-notation path to watch
   * @param {Function} callback - Function to call on change
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, callback) {
    const handler = (data) => {
      if (data.path === path || data.path.startsWith(path + '.')) {
        callback(this.get(path), data.oldValue);
      }
    };

    this.events.on('state:change', handler);

    // Return unsubscribe function
    return () => {
      this.events.off('state:change', handler);
    };
  }

  /**
   * Subscribe to specific path changes only
   * @param {string} path - Exact path to watch
   * @param {Function} callback - Function to call on change
   * @returns {Function} Unsubscribe function
   */
  subscribeExact(path, callback) {
    const eventName = `state:change:${path}`;
    this.events.on(eventName, callback);

    return () => {
      this.events.off(eventName, callback);
    };
  }

  /**
   * Get entire state tree
   * @returns {Object} Complete state
   */
  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Reset state to initial values
   */
  reset() {
    const previousState = this.getState();

    this.state = {
      workspace: {
        sessionId: null,
        initialized: false,
        files: [],
        stats: null,
        activeModule: null
      },
      modules: {
        segmentation: {
          active: false,
          currentTask: null,
          history: [],
          inferenceResults: null
        },
        imageviewer: {
          active: false,
          currentFile: null,
          viewMode: 'gallery',
          currentSlice: 0
        },
        denoising: { active: false, currentTask: null, history: [] },
        annotation: { active: false, currentFile: null, history: [] },
        mesh: { active: false, currentTask: null, history: [] }
      },
      ui: {
        sidebarCollapsed: true,
        currentView: 'welcome',
        loading: false,
        notifications: []
      },
      infoPanel: {
        isOpen: false,
        currentArticleId: null,
        glossaryExpanded: false,
        searchQuery: ''
      },
      user: {
        username: null,
        fullName: null,
        status: null,
        isAdmin: false
      }
    };

    this.events.emit('state:reset', { previousState });
    console.log('[StateManager] State reset');
  }

  /**
   * Add notification to state
   * @param {string} type - Type of notification (success, error, info, warning)
   * @param {string} message - Notification message
   * @param {number} duration - Duration in ms (0 = persistent)
   */
  notify(type, message, duration = 5000) {
    const notification = {
      id: `notif_${Date.now()}`,
      type,
      message,
      timestamp: new Date().toISOString()
    };

    const currentNotifications = this.get('ui.notifications') || [];
    this.update('ui.notifications', [...currentNotifications, notification]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, duration);
    }

    return notification.id;
  }

  /**
   * Remove notification by ID
   * @param {string} notificationId - Notification ID to remove
   */
  removeNotification(notificationId) {
    const currentNotifications = this.get('ui.notifications') || [];
    const filtered = currentNotifications.filter(n => n.id !== notificationId);
    this.update('ui.notifications', filtered);
  }

  /**
   * Log state for debugging
   */
  logState() {
    console.log('[StateManager] Current State:', this.getState());
  }
}

// Make available globally (loaded as regular script, not ES6 module)
if (typeof window !== 'undefined') {
  window.StateManager = StateManager;
}

// Also support CommonJS for potential future use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateManager;
}
