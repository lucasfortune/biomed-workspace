/**
 * ResumeDialog Component
 *
 * Displays a modal dialog when an active training session is detected,
 * allowing the user to resume or start fresh.
 *
 * Usage:
 * ```javascript
 * const choice = await ResumeDialog.show({
 *   moduleType: 'denoising-dl',
 *   trainingId: 'abc123',
 *   startedAt: '2024-01-15T10:30:00Z',
 *   stage: 'training'
 * });
 *
 * if (choice === 'resume') {
 *   // Reconnect to Socket.IO and restore UI
 * } else {
 *   // Cancel training and clear localStorage
 * }
 * ```
 */
class ResumeDialog {
  static DIALOG_ID = 'resume-training-dialog';

  /**
   * Show the resume dialog
   * @param {Object} options - Dialog options
   * @param {string} options.moduleType - 'segmentation' | 'denoising-dl'
   * @param {string} options.trainingId - Training ID
   * @param {string} options.startedAt - ISO timestamp when training started
   * @param {string} options.stage - Current stage ('training', 'paused_at_mask', 'stage2')
   * @returns {Promise<'resume'|'fresh'>} - User's choice
   */
  static show(options) {
    return new Promise((resolve) => {
      // Remove any existing dialog
      this.hide();

      const dialog = this.createDialog(options, resolve);
      document.body.appendChild(dialog);

      // Focus the resume button
      const resumeBtn = dialog.querySelector('.resume-dialog-btn-resume');
      if (resumeBtn) resumeBtn.focus();
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
   * @param {Object} options - Dialog options
   * @param {Function} resolve - Promise resolve function
   * @returns {HTMLElement}
   */
  static createDialog(options, resolve) {
    const { moduleType, trainingId, startedAt, stage } = options;

    const moduleName = this.getModuleName(moduleType);
    const stageName = this.getStageName(stage);
    const timeAgo = this.getTimeAgo(startedAt);

    const overlay = document.createElement('div');
    overlay.id = this.DIALOG_ID;
    overlay.className = 'resume-dialog-overlay';
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
      animation: resumeDialogFadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <style>
        @keyframes resumeDialogFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes resumeDialogSlideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .resume-dialog-content {
          background: var(--bg-primary, #ffffff);
          border-radius: 12px;
          padding: 28px 32px;
          max-width: 440px;
          width: 90%;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          animation: resumeDialogSlideIn 0.3s ease-out;
        }
        .resume-dialog-icon {
          width: 56px;
          height: 56px;
          background: var(--accent-primary, #EB1F17);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          color: white;
          font-size: 24px;
        }
        .resume-dialog-title {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary, #1a1a1a);
          text-align: center;
          margin-bottom: 12px;
        }
        .resume-dialog-message {
          font-size: 14px;
          color: var(--text-secondary, #666);
          text-align: center;
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .resume-dialog-info {
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 8px;
          padding: 14px 16px;
          margin-bottom: 24px;
        }
        .resume-dialog-info-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 8px;
        }
        .resume-dialog-info-row:last-child {
          margin-bottom: 0;
        }
        .resume-dialog-info-label {
          color: var(--text-secondary, #666);
        }
        .resume-dialog-info-value {
          color: var(--text-primary, #1a1a1a);
          font-weight: 500;
        }
        .resume-dialog-buttons {
          display: flex;
          gap: 12px;
        }
        .resume-dialog-btn {
          flex: 1;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s ease;
        }
        .resume-dialog-btn-fresh {
          background: var(--bg-secondary, #f0f0f0);
          color: var(--text-primary, #333);
        }
        .resume-dialog-btn-fresh:hover {
          background: var(--bg-tertiary, #e0e0e0);
        }
        .resume-dialog-btn-resume {
          background: var(--accent-primary, #EB1F17);
          color: white;
        }
        .resume-dialog-btn-resume:hover {
          background: var(--accent-hover, #C91810);
        }
      </style>
      <div class="resume-dialog-content">
        <div class="resume-dialog-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
          </svg>
        </div>
        <h3 class="resume-dialog-title">Active Training Detected</h3>
        <p class="resume-dialog-message">
          A training session from ${moduleName} is still in progress. Would you like to resume monitoring it or start fresh?
        </p>
        <div class="resume-dialog-info">
          <div class="resume-dialog-info-row">
            <span class="resume-dialog-info-label">Module</span>
            <span class="resume-dialog-info-value">${moduleName}</span>
          </div>
          <div class="resume-dialog-info-row">
            <span class="resume-dialog-info-label">Stage</span>
            <span class="resume-dialog-info-value">${stageName}</span>
          </div>
          <div class="resume-dialog-info-row">
            <span class="resume-dialog-info-label">Started</span>
            <span class="resume-dialog-info-value">${timeAgo}</span>
          </div>
        </div>
        <div class="resume-dialog-buttons">
          <button class="resume-dialog-btn resume-dialog-btn-fresh" data-action="fresh">
            Start Fresh
          </button>
          <button class="resume-dialog-btn resume-dialog-btn-resume" data-action="resume">
            Resume Training
          </button>
        </div>
      </div>
    `;

    // Add event listeners
    const buttons = overlay.querySelectorAll('.resume-dialog-btn');
    buttons.forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.action;
        this.hide();
        resolve(action);
      };
    });

    // Close on backdrop click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        this.hide();
        resolve('fresh'); // Default to fresh if clicking outside
      }
    };

    // Handle escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEscape);
        this.hide();
        resolve('fresh');
      }
    };
    document.addEventListener('keydown', handleEscape);

    return overlay;
  }

  /**
   * Get human-readable module name
   * @param {string} moduleType
   * @returns {string}
   */
  static getModuleName(moduleType) {
    const names = {
      'segmentation': 'Segmentation',
      'denoising-dl': 'DL Denoising'
    };
    return names[moduleType] || moduleType;
  }

  /**
   * Get human-readable stage name
   * @param {string} stage
   * @returns {string}
   */
  static getStageName(stage) {
    const names = {
      'training': 'Training in progress',
      'paused_at_mask': 'Awaiting mask approval',
      'stage2': 'Stage 2 training'
    };
    return names[stage] || stage || 'Unknown';
  }

  /**
   * Get relative time string
   * @param {string} isoTimestamp
   * @returns {string}
   */
  static getTimeAgo(isoTimestamp) {
    if (!isoTimestamp) return 'Unknown';

    const then = new Date(isoTimestamp);
    const now = new Date();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.ResumeDialog = ResumeDialog;
}

export default ResumeDialog;
