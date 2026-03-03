/**
 * ExitWarningDialog Component
 *
 * Shows a styled confirmation dialog when a user tries to leave a module
 * that has active training in progress.
 *
 * Usage:
 * ```javascript
 * const shouldLeave = await ExitWarningDialog.show();
 * if (shouldLeave) {
 *   // Cancel training and leave
 * } else {
 *   // Stay in module
 * }
 * ```
 */
class ExitWarningDialog {
  static DIALOG_ID = 'exit-warning-dialog';

  /**
   * Show the exit warning dialog
   * @returns {Promise<boolean>} true = leave & cancel, false = stay
   */
  static show() {
    return new Promise((resolve) => {
      // Remove any existing dialog
      this.hide();

      const dialog = this.createDialog(resolve);
      document.body.appendChild(dialog);

      // Focus the stay button (safe default)
      const stayBtn = dialog.querySelector('.exit-warning-btn-stay');
      if (stayBtn) stayBtn.focus();
    });
  }

  /**
   * Hide and remove the dialog
   */
  static hide() {
    const existing = document.getElementById(this.DIALOG_ID);
    if (existing) {
      existing.remove();
    }
  }

  /**
   * Create the dialog element
   * @param {Function} resolve - Promise resolve function
   * @returns {HTMLElement}
   */
  static createDialog(resolve) {
    const overlay = document.createElement('div');
    overlay.id = this.DIALOG_ID;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: exitWarningFadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <style>
        @keyframes exitWarningFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes exitWarningSlideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .exit-warning-content {
          background: var(--surface-primary, #ffffff);
          border-radius: 12px;
          padding: 28px 32px;
          max-width: 420px;
          width: 90%;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          animation: exitWarningSlideIn 0.3s ease-out;
        }
        .exit-warning-icon {
          width: 56px;
          height: 56px;
          background: #e74c3c;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          color: white;
          font-size: 24px;
        }
        .exit-warning-title {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary, #1a1a1a);
          text-align: center;
          margin-bottom: 12px;
        }
        .exit-warning-message {
          font-size: 14px;
          color: var(--text-secondary, #666);
          text-align: center;
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .exit-warning-buttons {
          display: flex;
          gap: 12px;
        }
        .exit-warning-btn {
          flex: 1;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s ease;
        }
        .exit-warning-btn-leave {
          background: #e74c3c;
          color: white;
        }
        .exit-warning-btn-leave:hover {
          background: #c0392b;
        }
        .exit-warning-btn-stay {
          background: var(--accent-secondary, #1DA924);
          color: white;
        }
        .exit-warning-btn-stay:hover {
          background: var(--success-color, #28A745);
        }
      </style>
      <div class="exit-warning-content">
        <div class="exit-warning-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3 class="exit-warning-title">Training in Progress</h3>
        <p class="exit-warning-message">
          Leaving will cancel the current training process. Are you sure you want to leave?
        </p>
        <div class="exit-warning-buttons">
          <button class="exit-warning-btn exit-warning-btn-leave" data-action="leave">
            Leave & Cancel
          </button>
          <button class="exit-warning-btn exit-warning-btn-stay" data-action="stay">
            Stay
          </button>
        </div>
      </div>
    `;

    // Add event listeners
    const buttons = overlay.querySelectorAll('.exit-warning-btn');
    buttons.forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.action;
        this.hide();
        resolve(action === 'leave');
      };
    });

    // Close on backdrop click = stay
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        this.hide();
        resolve(false);
      }
    };

    // Escape key = stay
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEscape);
        this.hide();
        resolve(false);
      }
    };
    document.addEventListener('keydown', handleEscape);

    return overlay;
  }
}

export default ExitWarningDialog;
