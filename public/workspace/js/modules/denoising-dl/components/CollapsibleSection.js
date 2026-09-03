/**
 * CollapsibleSection Component
 *
 * A collapsible section with header, status badge, and animated expand/collapse.
 * Used for organizing training configuration into logical groups.
 */

import { icon } from '/workspace/js/core/icons.js';

class CollapsibleSection {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique identifier
   * @param {string} options.title - Section title
   * @param {string} options.status - Status: 'pending' | 'in_progress' | 'complete'
   * @param {boolean} options.expanded - Initial expanded state
   * @param {string} options.content - HTML content for the section body
   * @param {Function} options.onToggle - Callback when toggled
   */
  constructor(options) {
    this.id = options.id;
    this.title = options.title;
    this.status = options.status || 'pending';
    this.expanded = options.expanded !== false;
    this.content = options.content || '';
    this.onToggle = options.onToggle;
  }

  /**
   * Get status badge HTML
   */
  getStatusBadge() {
    const statusConfig = {
      pending: { label: 'Pending', class: 'status-pending' },
      in_progress: { label: 'In Progress', class: 'status-in-progress' },
      complete: { label: 'Complete', class: 'status-complete' }
    };

    const config = statusConfig[this.status] || statusConfig.pending;
    return `<span class="collapsible-status ${config.class}">${config.label}</span>`;
  }

  /**
   * Render the collapsible section
   */
  render() {
    return `
      <div class="collapsible-section ${this.expanded ? 'expanded' : ''}" id="${this.id}">
        <div class="collapsible-header" data-section="${this.id}">
          <div class="collapsible-title">
            <span class="collapsible-icon">${icon('caretDown')}</span>
            <span class="collapsible-label">${this.title}</span>
          </div>
          ${this.getStatusBadge()}
        </div>
        <div class="collapsible-body" style="${this.expanded ? '' : 'display: none;'}">
          <div class="collapsible-content">
            ${this.content}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Initialize event listeners
   */
  init() {
    const header = document.querySelector(`[data-section="${this.id}"]`);
    if (header) {
      header.addEventListener('click', () => this.toggle());
    }
  }

  /**
   * Toggle expanded state
   */
  toggle() {
    this.expanded = !this.expanded;
    this.updateUI();
    if (this.onToggle) {
      this.onToggle(this.expanded);
    }
  }

  /**
   * Expand the section
   */
  expand() {
    if (!this.expanded) {
      this.expanded = true;
      this.updateUI();
    }
  }

  /**
   * Collapse the section
   */
  collapse() {
    if (this.expanded) {
      this.expanded = false;
      this.updateUI();
    }
  }

  /**
   * Update status
   * @param {string} status - New status
   */
  setStatus(status) {
    this.status = status;
    const section = document.getElementById(this.id);
    if (section) {
      const badge = section.querySelector('.collapsible-status');
      if (badge) {
        badge.outerHTML = this.getStatusBadge();
      }
    }
  }

  /**
   * Update UI to match current state
   */
  updateUI() {
    const section = document.getElementById(this.id);
    if (!section) return;

    const body = section.querySelector('.collapsible-body');

    if (this.expanded) {
      section.classList.add('expanded');
      if (body) {
        body.style.display = 'block';
        // Trigger animation
        requestAnimationFrame(() => {
          body.style.maxHeight = body.scrollHeight + 'px';
        });
      }
    } else {
      section.classList.remove('expanded');
      if (body) {
        body.style.maxHeight = '0';
        setTimeout(() => {
          if (!this.expanded) body.style.display = 'none';
        }, 200);
      }
    }
  }

  /**
   * Update content
   * @param {string} content - New HTML content
   */
  setContent(content) {
    this.content = content;
    const section = document.getElementById(this.id);
    if (section) {
      const contentEl = section.querySelector('.collapsible-content');
      if (contentEl) {
        contentEl.innerHTML = content;
      }
    }
  }
}

export default CollapsibleSection;
