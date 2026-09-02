/**
 * LoadingOverlay Component
 *
 * Displays a full-screen or container-scoped loading overlay with spinner and message.
 * Supports multiple concurrent operations with reference counting.
 *
 * Usage:
 * ```javascript
 * // Create overlay for a specific container
 * const loader = new LoadingOverlay({
 *   containerId: 'module-content',
 *   message: 'Processing...'
 * });
 *
 * // Show overlay
 * loader.show('Loading data...');
 *
 * // Update message
 * loader.setMessage('Almost done...');
 *
 * // Hide overlay
 * loader.hide();
 *
 * // For nested async operations (reference counting)
 * loader.show('Step 1');
 * loader.show('Step 2');  // Increments counter
 * loader.hide();          // Decrements counter (still visible)
 * loader.hide();          // Counter = 0, overlay hidden
 *
 * // Force hide regardless of counter
 * loader.forceHide();
 * ```
 */
class LoadingOverlay {
  /**
   * Create a LoadingOverlay
   * @param {object} config - Configuration options
   * @param {string} [config.containerId] - Container element ID (null for document.body)
   * @param {string} [config.message='Loading...'] - Default loading message
   * @param {boolean} [config.showSpinner=true] - Show spinner animation
   * @param {string} [config.spinnerSize='medium'] - Spinner size: 'small', 'medium', 'large'
   * @param {boolean} [config.backdrop=true] - Show backdrop overlay
   * @param {string} [config.backdropColor] - Backdrop colour (defaults to the theme's page background at 90%)
   */
  constructor(config = {}) {
    this.containerId = config.containerId || null;
    this.message = config.message || 'Loading...';
    this.showSpinner = config.showSpinner !== false;
    this.spinnerSize = config.spinnerSize || 'medium';
    this.backdrop = config.backdrop !== false;
    this.backdropColor = config.backdropColor || 'color-mix(in srgb, var(--bg-primary, #fff) 90%, transparent)';

    this.overlayElement = null;
    this.refCount = 0;
    this.overlayId = `loading-overlay-${Date.now()}`;
  }

  /**
   * Get the container element
   * @returns {HTMLElement}
   */
  getContainer() {
    if (this.containerId) {
      return document.getElementById(this.containerId);
    }
    return document.body;
  }

  /**
   * Get spinner size in pixels
   * @returns {number}
   */
  getSpinnerSize() {
    const sizes = {
      small: 24,
      medium: 40,
      large: 60
    };
    return sizes[this.spinnerSize] || sizes.medium;
  }

  /**
   * Create the overlay element
   * @returns {HTMLElement}
   */
  createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = this.overlayId;
    overlay.className = 'loading-overlay';
    overlay.setAttribute('data-component', 'loading-overlay');

    const spinnerSize = this.getSpinnerSize();
    const isFullScreen = !this.containerId;

    overlay.style.cssText = `
      position: ${isFullScreen ? 'fixed' : 'absolute'};
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: ${this.backdrop ? this.backdropColor : 'transparent'};
      z-index: ${isFullScreen ? '10000' : '100'};
      transition: opacity 0.2s ease;
    `;

    let content = '';

    if (this.showSpinner) {
      content += `
        <div class="loading-spinner" style="
          width: ${spinnerSize}px;
          height: ${spinnerSize}px;
          border: 3px solid var(--module-border, #e1e4e8);
          border-top-color: var(--module-primary, #667eea);
          border-radius: 50%;
          animation: loading-spin 0.8s linear infinite;
        "></div>
      `;
    }

    content += `
      <div class="loading-message" style="
        margin-top: 16px;
        font-size: 14px;
        color: var(--module-text-secondary, #586069);
        text-align: center;
        max-width: 300px;
      ">${this.message}</div>
    `;

    overlay.innerHTML = content;

    // Add keyframe animation if not already present
    this.ensureAnimationStyles();

    return overlay;
  }

  /**
   * Ensure spinner animation styles are in the document
   */
  ensureAnimationStyles() {
    const styleId = 'loading-overlay-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes loading-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Show the loading overlay
   * @param {string} [message] - Optional message to display
   */
  show(message) {
    this.refCount++;

    if (message) {
      this.message = message;
    }

    if (this.overlayElement) {
      // Already showing, just update message
      this.setMessage(this.message);
      return;
    }

    const container = this.getContainer();
    if (!container) {
      console.warn(`[LoadingOverlay] Container not found: ${this.containerId}`);
      return;
    }

    // Ensure container has position for absolute overlay
    if (this.containerId && getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.overlayElement = this.createOverlay();
    container.appendChild(this.overlayElement);

    // Trigger reflow for animation
    this.overlayElement.offsetHeight;
    this.overlayElement.style.opacity = '1';
  }

  /**
   * Hide the loading overlay
   * Uses reference counting - only hides when all show() calls are matched with hide()
   */
  hide() {
    if (this.refCount > 0) {
      this.refCount--;
    }

    if (this.refCount > 0) {
      // Still have pending operations
      return;
    }

    this.removeOverlay();
  }

  /**
   * Force hide the overlay regardless of reference count
   */
  forceHide() {
    this.refCount = 0;
    this.removeOverlay();
  }

  /**
   * Remove the overlay element from DOM
   */
  removeOverlay() {
    if (!this.overlayElement) {
      return;
    }

    this.overlayElement.style.opacity = '0';

    // Remove after fade animation
    setTimeout(() => {
      if (this.overlayElement && this.overlayElement.parentNode) {
        this.overlayElement.parentNode.removeChild(this.overlayElement);
      }
      this.overlayElement = null;
    }, 200);
  }

  /**
   * Update the loading message
   * @param {string} message - New message to display
   */
  setMessage(message) {
    this.message = message;

    if (this.overlayElement) {
      const messageEl = this.overlayElement.querySelector('.loading-message');
      if (messageEl) {
        messageEl.textContent = message;
      }
    }
  }

  /**
   * Check if overlay is currently visible
   * @returns {boolean}
   */
  isVisible() {
    return this.overlayElement !== null && this.refCount > 0;
  }

  /**
   * Get current reference count
   * @returns {number}
   */
  getRefCount() {
    return this.refCount;
  }

  /**
   * Static method to show a quick loading overlay
   * @param {string} [containerId] - Container ID or null for fullscreen
   * @param {string} [message='Loading...'] - Message to display
   * @returns {LoadingOverlay} The overlay instance
   */
  static show(containerId = null, message = 'Loading...') {
    const overlay = new LoadingOverlay({ containerId, message });
    overlay.show();
    return overlay;
  }

  /**
   * Create a wrapper for async operations that automatically shows/hides loading
   * @param {Function} asyncFn - Async function to wrap
   * @param {string} [containerId] - Container ID for overlay
   * @param {string} [message='Loading...'] - Loading message
   * @returns {Function} Wrapped function
   */
  static withLoading(asyncFn, containerId = null, message = 'Loading...') {
    return async (...args) => {
      const overlay = new LoadingOverlay({ containerId, message });
      overlay.show();
      try {
        return await asyncFn(...args);
      } finally {
        overlay.forceHide();
      }
    };
  }
}

// Export for ES6 modules
export default LoadingOverlay;

// Also make available globally
if (typeof window !== 'undefined') {
  window.LoadingOverlay = LoadingOverlay;
}
