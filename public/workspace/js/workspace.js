/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this when inserting user-provided or server-provided data into innerHTML.
 * @param {string|number|null|undefined} text - The text to escape
 * @returns {string} The escaped HTML-safe string
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// Make escapeHtml globally available for modules
window.escapeHtml = escapeHtml;

/**
 * Workspace Application - Main entry point
 * Initializes state management, module loading, and UI
 */
class Workspace {
  constructor() {
    this.state = null;
    this.moduleLoader = null;
    this.api = null;
    this.socket = null;
    this.fileBrowser = null;  // File browser component (Phase 3.2)
    this.infoPanel = null;    // Info panel component
    this.initialized = false;

    // Store unsubscribe functions for cleanup
    this.stateUnsubscribers = [];

    // Initialize theme before DOM fully loads to prevent flash
    this.initTheme();

    console.log('[Workspace] Initializing...');
  }

  /**
   * Initialize theme from localStorage or default to light
   */
  initTheme() {
    const savedTheme = localStorage.getItem('workspace-theme') || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('workspace-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('workspace-theme', 'dark');
    }
  }

  /**
   * Initialize the workspace application
   */
  async init() {
    try {
      // One-time cleanup of removed persistence keys
      localStorage.removeItem('workspace_active_training');
      localStorage.removeItem('workspace_training_lock');

      // Initialize core systems
      this.state = new StateManager();
      this.moduleLoader = new ModuleLoader(this.state);
      this.api = new WorkspaceAPI();

      // Set up module container
      const moduleView = document.getElementById('module-view');
      this.moduleLoader.setContainer(moduleView);

      // Register all modules
      this.moduleLoader.registerAll(moduleRegistry);

      // Subscribe to state changes (MUST be before initializeWorkspace so it catches initial stats)
      this.setupStateSubscriptions();

      // Check authentication
      await this.checkAuth();

      // Initialize workspace
      await this.initializeWorkspace();

      // Initialize file browser (Phase 3.2)
      this.fileBrowser = new FileBrowser(this.state, this.api);
      await this.fileBrowser.initialize('file-tree-container');

      // Initialize info panel
      this.infoPanel = new InfoPanel(this.state);
      await this.infoPanel.initialize('info-panel-container');

      // Set up UI
      this.setupUI();
      this.setupEventListeners();

      // Render module cards
      this.renderModuleCards();

      this.initialized = true;
      console.log('[Workspace] Initialization complete');

    } catch (error) {
      console.error('[Workspace] Initialization error:', error);
      this.showError('Failed to initialize workspace: ' + error.message);
    }
  }

  /**
   * Check authentication status
   */
  async checkAuth() {
    try {
      const response = await this.api.checkAuth();

      if (response.authenticated) {
        this.state.update('user', {
          username: response.user.username,
          fullName: response.user.fullName,
          status: response.user.status,
          isAdmin: response.user.isAdmin
        });

        console.log('[Workspace] User authenticated:', response.user.username);
      } else {
        // Redirect to login
        window.location.href = '/';
      }
    } catch (error) {
      console.error('[Workspace] Auth check error:', error);
      window.location.href = '/';
    }
  }

  /**
   * Initialize workspace for current session
   */
  async initializeWorkspace() {
    try {
      const response = await this.api.getWorkspaceStatus();

      if (response.success) {
        const { workspace } = response;

        this.state.update('workspace', {
          sessionId: workspace.sessionId,
          initialized: true,
          files: workspace.fileTree || [],
          stats: null,
          activeModule: null
        });

        console.log('[Workspace] Workspace initialized');

        // Load stats
        await this.loadWorkspaceStats();
      }
    } catch (error) {
      console.error('[Workspace] Workspace initialization error:', error);

      // Try to create workspace
      try {
        const initResponse = await this.api.initializeWorkspace();
        if (initResponse.success) {
          console.log('[Workspace] New workspace created');
          await this.initializeWorkspace(); // Retry
        }
      } catch (initError) {
        console.error('[Workspace] Failed to create workspace:', initError);
      }
    }
  }

  /**
   * Load workspace statistics
   */
  async loadWorkspaceStats() {
    try {
      const response = await this.api.getWorkspaceStats();

      if (response.success) {
        this.state.update('workspace.stats', response.stats);
      }
    } catch (error) {
      console.error('[Workspace] Error loading stats:', error);
    }
  }

  /**
   * Set up UI components
   */
  setupUI() {
    // Update user info display
    const userName = document.getElementById('user-name');
    const userStatus = document.getElementById('user-status');

    if (userName) {
      userName.textContent = this.state.get('user.fullName') || this.state.get('user.username');
    }

    if (userStatus) {
      const status = this.state.get('user.status');
      userStatus.textContent = status === 'active' ? '✓ Approved' : '⏳ Pending';
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        const isCollapsed = !sidebar.classList.contains('collapsed');
        sidebar.classList.toggle('collapsed');
        this.state.update('ui.sidebarCollapsed', isCollapsed);
      });
    }

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // Global help icon click handler (capture phase to fire before element handlers)
    document.addEventListener('click', (e) => {
      const helpIcon = e.target.closest('.help-icon');
      if (helpIcon && this.infoPanel) {
        const articleId = helpIcon.dataset.infoId;
        if (articleId) {
          e.preventDefault();
          e.stopPropagation();
          this.infoPanel.onHelpIconClick(articleId);
        }
      }
    }, true);

    // Workspace download button
    const downloadBtn = document.getElementById('btn-download-workspace');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadWorkspace());
    }

    // Logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // Global return to hub function
    window.backToHub = () => this.returnToHub();
  }

  /**
   * Handle logout with confirmation dialog
   */
  async handleLogout() {
    try {
      // Get workspace stats for confirmation dialog
      const statsResponse = await this.api.getWorkspaceStats();
      const stats = statsResponse.success ? statsResponse.stats : null;

      const fileCount = stats?.fileCount || 0;
      const size = stats?.totalSizeMB || '0';

      // Show confirmation dialog
      const confirmed = confirm(
        `Logging out will permanently delete your workspace files.\n\n` +
        `Current workspace:\n` +
        `- ${fileCount} file(s)\n` +
        `- ${size} MB total size\n\n` +
        `This action cannot be undone. Do you want to continue?`
      );

      if (!confirmed) {
        return;
      }

      // Show loading state
      this.state.update('ui.loading', true);

      // Logout and delete workspace
      await this.api.logout({ deleteWorkspace: true });

      // Redirect to welcome page
      window.location.href = '/';

    } catch (error) {
      console.error('[Workspace] Logout error:', error);
      this.state.update('ui.loading', false);
      this.state.notify('error', 'Logout failed: ' + error.message);
    }
  }

  /**
   * Download current workspace as ZIP file
   * Uses browser's native download manager - no blocking overlay needed
   */
  async downloadWorkspace() {
    try {
      // Get stats for confirmation dialog
      const statsResponse = await this.api.getWorkspaceStats();
      const stats = statsResponse.success ? statsResponse.stats : null;

      // Show confirmation dialog (using FileBrowser's method)
      const confirmed = await this.fileBrowser.showDownloadConfirmation(stats);
      if (!confirmed) {
        this.state.notify('info', 'Download cancelled');
        return;
      }

      // Trigger download via browser's native download manager
      // This streams directly to disk and shows progress in browser's download bar
      this.api.downloadWorkspace();

      // Notify user - download will proceed in background
      this.state.notify('success', 'Download started - check your browser\'s download bar', 5000);

    } catch (error) {
      console.error('[Workspace] Download error:', error);
      this.state.notify('error', `Download failed: ${error.message}`);
    }
  }

  /**
   * Set up state subscriptions
   */
  setupStateSubscriptions() {
    // Subscribe to workspace stats changes
    const unsubStats = this.state.subscribe('workspace.stats', (stats) => {
      if (stats) {
        const fileCountEl = document.getElementById('file-count');
        const workspaceSizeEl = document.getElementById('workspace-size');

        if (fileCountEl) {
          fileCountEl.textContent = stats.fileCount || 0;
        }

        if (workspaceSizeEl) {
          // stats.totalSizeMB is a string like "10.50", so append " MB"
          workspaceSizeEl.textContent = (stats.totalSizeMB || '0') + ' MB';
        }
      }
    });
    this.stateUnsubscribers.push(unsubStats);

    // Subscribe to loading state
    const unsubLoading = this.state.subscribe('ui.loading', (isLoading) => {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) {
        overlay.style.display = isLoading ? 'flex' : 'none';
      }
    });
    this.stateUnsubscribers.push(unsubLoading);

    // Subscribe to notifications
    const unsubNotifications = this.state.subscribe('ui.notifications', (notifications) => {
      this.renderNotifications(notifications);
    });
    this.stateUnsubscribers.push(unsubNotifications);
  }

  /**
   * Clean up state subscriptions
   */
  cleanupStateSubscriptions() {
    for (const unsubscribe of this.stateUnsubscribers) {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
    this.stateUnsubscribers = [];
  }

  /**
   * Render module cards in the welcome view
   */
  renderModuleCards() {
    const grid = document.getElementById('modules-grid');
    if (!grid) return;

    const modules = this.moduleLoader.getAllModules();

    grid.innerHTML = modules.map(module => {
      // Handle multi-launch cards (dual buttons)
      if (module.cardType === 'multi-launch') {
        return this.renderMultiLaunchCard(module);
      }
      // Standard single-launch card
      return this.renderSingleLaunchCard(module);
    }).join('');
  }

  /**
   * Render a help icon for info panel integration
   */
  renderHelpIcon(articleId) {
    return `<span class="help-icon" data-info-id="${articleId}" title="Click for help">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
      </svg>
    </span>`;
  }

  /**
   * Render a standard single-launch module card
   */
  renderSingleLaunchCard(module) {
    const helpIcon = module.helpArticleId ? this.renderHelpIcon(module.helpArticleId) : '';

    return `
      <div class="module-card ${module.status === 'coming_soon' ? 'coming-soon' : ''}"
           style="--card-color: ${module.color}"
           data-module-id="${module.id}">
        ${helpIcon ? `<div class="module-card-help">${helpIcon}</div>` : ''}
        <div class="module-icon">${module.icon}</div>
        <h3>${module.name}</h3>
        <p>${module.description}</p>
        <div class="module-io">
          <div class="inputs">Inputs: ${module.inputs.join(', ')}</div>
          <div class="outputs">Outputs: ${module.outputs.join(', ')}</div>
        </div>
        ${module.status === 'coming_soon'
          ? '<div class="status-badge">Coming Soon</div>'
          : `<button class="btn-launch" onclick="workspace.loadModule('${module.id}')">
               Launch Module
             </button>`
        }
      </div>
    `;
  }

  /**
   * Render a multi-launch module card with dual buttons
   */
  renderMultiLaunchCard(module) {
    const helpIcon = module.helpArticleId ? this.renderHelpIcon(module.helpArticleId) : '';

    const buttons = module.launchOptions.map(opt => {
      if (opt.status === 'coming_soon') {
        return `
          <button class="btn-launch btn-launch-half" disabled title="Coming Soon">
            <span class="btn-launch-label">${opt.label}</span>
            <span class="btn-launch-sublabel">${opt.sublabel}</span>
          </button>
        `;
      }
      return `
        <button class="btn-launch btn-launch-half" onclick="workspace.loadModule('${opt.id}')">
          <span class="btn-launch-label">${opt.label}</span>
          <span class="btn-launch-sublabel">${opt.sublabel}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="module-card"
           style="--card-color: ${module.color}"
           data-module-id="${module.id}">
        ${helpIcon ? `<div class="module-card-help">${helpIcon}</div>` : ''}
        <div class="module-icon">${module.icon}</div>
        <h3>${module.name}</h3>
        <p>${module.description}</p>
        <div class="module-io">
          <div class="inputs">Inputs: ${module.inputs.join(', ')}</div>
          <div class="outputs">Outputs: ${module.outputs.join(', ')}</div>
        </div>
        <div class="module-buttons-dual">
          ${buttons}
        </div>
      </div>
    `;
  }

  /**
   * Load and activate a module
   * @param {string} moduleId - Module ID to load
   */
  async loadModule(moduleId) {
    try {
      console.log(`[Workspace] Loading module: ${moduleId}`);

      // Note: Pending users can access all modules but are restricted from custom file uploads
      // (upload restrictions are handled by backend with user-friendly error messages)

      await this.moduleLoader.load(moduleId);

      // Hide welcome view, show module view
      const welcomeView = document.getElementById('welcome-view');
      const moduleView = document.getElementById('module-view');

      if (welcomeView && moduleView) {
        welcomeView.classList.remove('active');
        moduleView.classList.add('active');
      }

    } catch (error) {
      console.error('[Workspace] Error loading module:', error);
      this.state.notify('error', `Failed to load module: ${error.message}`);
    }
  }

  /**
   * Return to hub/welcome view
   */
  async returnToHub() {
    try {
      await this.moduleLoader.returnToHub();
      console.log('[Workspace] Returned to hub');
    } catch (error) {
      console.error('[Workspace] Error returning to hub:', error);
    }
  }

  /**
   * Refresh workspace data
   */
  async refreshWorkspace() {
    this.state.update('ui.loading', true);
    try {
      await this.loadWorkspaceStats();

      // Refresh file browser (Phase 3.2)
      if (this.fileBrowser) {
        await this.fileBrowser.refresh();
      }

      this.state.notify('success', 'Workspace refreshed');
    } catch (error) {
      console.error('[Workspace] Refresh error:', error);
      this.state.notify('error', 'Failed to refresh workspace');
    } finally {
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Render notifications
   * @param {Array} notifications - Array of notification objects
   */
  renderNotifications(notifications) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    container.innerHTML = notifications.map(notif => `
      <div class="notification ${escapeHtml(notif.type)}">
        <div class="notification-content">
          <span class="notification-icon">${icons[notif.type] || icons.info}</span>
          <span>${escapeHtml(notif.message)}</span>
        </div>
      </div>
    `).join('');
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    alert('Error: ' + message);
  }
}

// Initialize workspace when DOM is ready
const workspace = new Workspace();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => workspace.init());
} else {
  workspace.init();
}

// Make workspace globally available
window.workspace = workspace;
