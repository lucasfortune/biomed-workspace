/**
 * InfoPanel Component
 *
 * Educational help panel that displays contextual information about
 * methods, parameters, and concepts. Orchestrates sub-components for
 * search, glossary, and article display.
 *
 * @class InfoPanel
 */
class InfoPanel {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;
    this.panelElement = null;

    // Content service for loading and searching articles
    this.contentService = new InfoContentService();

    // Sub-components
    this.searchComponent = null;
    this.glossaryComponent = null;
    this.articleComponent = null;

    // Current state
    this.isCollapsed = true;

    // Unsubscribe functions for cleanup
    this.unsubscribers = [];
  }

  /**
   * Initialize the info panel component
   * @param {string} containerId - ID of the container element inside the panel
   */
  async initialize(containerId) {
    this.container = document.getElementById(containerId);
    this.panelElement = document.getElementById('info-panel');

    if (!this.container || !this.panelElement) {
      console.error('[InfoPanel] Container element not found');
      return;
    }

    // Set up panel toggle
    const toggleBtn = document.getElementById('info-panel-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggle());
    }

    // Initialize sub-components
    this.initSubComponents();

    // Subscribe to state changes
    this.setupStateSubscriptions();

    // Load initial content
    await this.loadInitialContent();

    // Initial render
    this.render();

    console.log('[InfoPanel] Initialized');
  }

  /**
   * Initialize sub-components with callbacks
   */
  initSubComponents() {
    // Search component - navigates to article on result select
    this.searchComponent = new InfoSearch(
      this.contentService,
      (articleId) => this.showArticle(articleId)
    );

    // Glossary component - navigates to article on term select
    this.glossaryComponent = new InfoGlossary(
      this.contentService,
      (articleId) => this.showArticle(articleId)
    );

    // Article component - navigates to article on "See Also" click
    this.articleComponent = new InfoArticle(
      this.contentService,
      (articleId) => this.showArticle(articleId)
    );
  }

  /**
   * Set up state subscriptions
   */
  setupStateSubscriptions() {
    // Subscribe to info panel state changes
    const unsubscribe = this.state.subscribe('infoPanel', (panelState) => {
      if (panelState) {
        if (panelState.isOpen !== undefined && panelState.isOpen !== !this.isCollapsed) {
          panelState.isOpen ? this.expand() : this.collapse();
        }
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  /**
   * Load initial content
   * Uses manifest-based loading for complete glossary on first render
   */
  async loadInitialContent() {
    try {
      // Initialize content service (loads manifest with complete glossary)
      await this.contentService.initialize();

      // Load getting-started article content
      const article = await this.contentService.getArticle('getting-started');

      // Display getting-started as default article
      if (article && this.articleComponent) {
        this.articleComponent.display(article);
      }

      // Refresh glossary UI (glossary data is already loaded from manifest)
      if (this.glossaryComponent) {
        this.glossaryComponent.refresh();
      }

      console.log('[InfoPanel] Initial content loaded, glossary ready with',
        this.contentService.getStats().totalArticles, 'articles');
    } catch (error) {
      console.warn('[InfoPanel] Error loading initial content:', error);
    }
  }

  /**
   * Render the info panel content structure
   */
  render() {
    if (!this.container) return;

    // Create the panel structure
    this.container.innerHTML = `
      <div class="ip-header">
        <h3>Help & Info</h3>
      </div>

      <div class="ip-search" id="ip-search-container"></div>

      <div class="ip-glossary" id="ip-glossary-container"></div>

      <div class="ip-article" id="ip-article-container"></div>
    `;

    // Attach sub-components to their containers
    const searchContainer = this.container.querySelector('#ip-search-container');
    const glossaryContainer = this.container.querySelector('#ip-glossary-container');
    const articleContainer = this.container.querySelector('#ip-article-container');

    if (searchContainer && this.searchComponent) {
      this.searchComponent.attach(searchContainer);
      this.searchComponent.render();
    }

    if (glossaryContainer && this.glossaryComponent) {
      this.glossaryComponent.attach(glossaryContainer);
      this.glossaryComponent.render();
    }

    if (articleContainer && this.articleComponent) {
      this.articleComponent.attach(articleContainer);
      this.articleComponent.render();
    }
  }

  /**
   * Show a specific article
   * @param {string} articleId - The article ID to display
   */
  async showArticle(articleId) {
    try {
      const article = await this.contentService.fetchArticle(articleId);

      if (article) {
        // Display the article
        if (this.articleComponent) {
          this.articleComponent.display(article);
        }

        // Expand panel if collapsed
        this.expand();

        // Update state
        this.state.update('infoPanel.currentArticleId', articleId);

        // Note: Glossary refresh not needed - manifest provides complete glossary
      } else {
        console.warn(`[InfoPanel] Article not found: ${articleId}`);
        this.state.notify('warning', `Help article not found: ${articleId}`);
      }
    } catch (error) {
      console.error('[InfoPanel] Error loading article:', error);
    }
  }

  /**
   * Expand the panel
   */
  expand() {
    this.isCollapsed = false;
    if (this.panelElement) {
      this.panelElement.classList.remove('collapsed');
    }
    this.state.update('infoPanel.isOpen', true);
  }

  /**
   * Collapse the panel
   */
  collapse() {
    this.isCollapsed = true;
    if (this.panelElement) {
      this.panelElement.classList.add('collapsed');
    }
    this.state.update('infoPanel.isOpen', false);
  }

  /**
   * Toggle panel expanded/collapsed state
   */
  toggle() {
    if (this.isCollapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /**
   * Handle help icon click (called from global handler)
   * @param {string} articleId - The article ID from the help icon
   */
  onHelpIconClick(articleId) {
    this.showArticle(articleId);
  }

  /**
   * Get the current article being displayed
   * @returns {Object|null}
   */
  getCurrentArticle() {
    return this.articleComponent?.getCurrentArticle() || null;
  }

  /**
   * Check if panel is currently expanded
   * @returns {boolean}
   */
  isOpen() {
    return !this.isCollapsed;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Unsubscribe from state changes
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];

    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
