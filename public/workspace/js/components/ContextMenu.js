/**
 * ContextMenu Component
 *
 * Reusable context menu for right-click interactions.
 * Supports menu items, separators, disabled states, and keyboard shortcuts.
 * Automatically positions within viewport boundaries.
 *
 * @class ContextMenu
 */
class ContextMenu {
  constructor() {
    this.menu = null;
    this.isVisible = false;
    this.currentItems = [];

    // Bind event handlers
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleEscapeKey = this.handleEscapeKey.bind(this);
  }

  /**
   * Show context menu at specified coordinates
   * @param {number} x - X coordinate (pageX)
   * @param {number} y - Y coordinate (pageY)
   * @param {Array} items - Array of menu item objects
   *
   * Menu item structure:
   * {
   *   icon: string,        // Emoji or icon
   *   label: string,       // Display text
   *   shortcut: string,    // Optional keyboard shortcut (e.g., "Del", "Ctrl+C")
   *   onClick: function,   // Click handler
   *   disabled: boolean,   // Whether item is disabled
   *   separator: boolean   // If true, renders as separator instead
   * }
   */
  show(x, y, items) {
    // Hide existing menu if any
    this.hide();

    // Store items for reference
    this.currentItems = items;

    // Create menu element
    this.menu = document.createElement('div');
    this.menu.className = 'context-menu';
    this.menu.innerHTML = this.renderMenuItems(items);

    // Add to document
    document.body.appendChild(this.menu);

    // Position menu
    this.positionMenu(x, y);

    // Mark as visible
    this.isVisible = true;

    // Attach event listeners
    this.attachEventListeners();

    // Add global event listeners
    setTimeout(() => {
      document.addEventListener('click', this.handleDocumentClick);
      document.addEventListener('keydown', this.handleEscapeKey);
    }, 0);
  }

  /**
   * Hide context menu
   */
  hide() {
    if (!this.menu) return;

    // Remove event listeners
    document.removeEventListener('click', this.handleDocumentClick);
    document.removeEventListener('keydown', this.handleEscapeKey);

    // Remove menu from DOM
    if (this.menu.parentNode) {
      this.menu.parentNode.removeChild(this.menu);
    }

    this.menu = null;
    this.isVisible = false;
    this.currentItems = [];
  }

  /**
   * Render menu items HTML
   * @param {Array} items - Menu items
   * @returns {string} HTML string
   */
  renderMenuItems(items) {
    return items.map(item => {
      if (item.separator) {
        return '<div class="context-menu-separator"></div>';
      }

      const disabledClass = item.disabled ? 'disabled' : '';
      const icon = item.icon || '';
      const label = this.escapeHtml(item.label || '');
      const shortcut = item.shortcut ? `<span class="context-menu-shortcut">${this.escapeHtml(item.shortcut)}</span>` : '';

      return `
        <div class="context-menu-item ${disabledClass}" data-action="${item.label}">
          <span class="context-menu-icon">${icon}</span>
          <span class="context-menu-label">${label}</span>
          ${shortcut}
        </div>
      `;
    }).join('');
  }

  /**
   * Position menu at coordinates with viewport boundary detection
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  positionMenu(x, y) {
    // Initial positioning
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;

    // Get menu dimensions
    const rect = this.menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position if menu overflows right edge
    if (rect.right > viewportWidth) {
      const newX = viewportWidth - rect.width - 5; // 5px margin
      this.menu.style.left = `${Math.max(5, newX)}px`;
    }

    // Adjust vertical position if menu overflows bottom edge
    if (rect.bottom > viewportHeight) {
      const newY = viewportHeight - rect.height - 5; // 5px margin
      this.menu.style.top = `${Math.max(5, newY)}px`;
    }

    // Ensure menu doesn't go off left edge
    if (rect.left < 0) {
      this.menu.style.left = '5px';
    }

    // Ensure menu doesn't go off top edge
    if (rect.top < 0) {
      this.menu.style.top = '5px';
    }
  }

  /**
   * Attach event listeners to menu items
   */
  attachEventListeners() {
    if (!this.menu) return;

    const menuItems = this.menu.querySelectorAll('.context-menu-item:not(.disabled)');

    menuItems.forEach((menuItem, index) => {
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();

        // Find corresponding item by label
        const action = menuItem.dataset.action;
        const item = this.currentItems.find(i => i.label === action);

        if (item && item.onClick && !item.disabled) {
          item.onClick();
          this.hide();
        }
      });
    });
  }

  /**
   * Handle clicks outside the menu
   * @param {Event} e - Click event
   */
  handleDocumentClick(e) {
    if (!this.menu) return;

    // Check if click is outside menu
    if (!this.menu.contains(e.target)) {
      this.hide();
    }
  }

  /**
   * Handle ESC key press
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleEscapeKey(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      this.hide();
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if menu is currently visible
   * @returns {boolean}
   */
  isMenuVisible() {
    return this.isVisible;
  }

  /**
   * Destroy the context menu instance
   */
  destroy() {
    this.hide();
  }
}

// Make available globally
window.ContextMenu = ContextMenu;
