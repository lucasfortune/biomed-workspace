/**
 * InfoSearch Component
 *
 * Provides search functionality for help articles with debounced input,
 * ranked results dropdown, and match highlighting.
 *
 * @class InfoSearch
 */
class InfoSearch {
  constructor(contentService, onResultSelect) {
    this.contentService = contentService;
    this.onResultSelect = onResultSelect; // Callback when user selects a result
    this.container = null;
    this.searchQuery = '';
    this.debounceTimer = null;
    this.debounceDelay = 250; // ms
  }

  /**
   * Attach to a container element
   * @param {HTMLElement} container - The container element
   */
  attach(container) {
    this.container = container;
  }

  /**
   * Render the search component
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <input
        type="text"
        class="ip-search-input"
        placeholder="Search topics..."
        value="${this.escapeHtml(this.searchQuery)}"
      />
      <button class="ip-search-clear" title="Clear search">&times;</button>
      <div class="ip-search-results"></div>
    `;

    this.attachEventListeners();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (!this.container) return;

    const input = this.container.querySelector('.ip-search-input');
    const clearBtn = this.container.querySelector('.ip-search-clear');

    if (input) {
      input.addEventListener('input', (e) => this.handleInput(e));
      input.addEventListener('focus', () => this.showResults());
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
      if (this.container && !this.container.contains(e.target)) {
        this.hideResults();
      }
    });
  }

  /**
   * Handle input changes with debouncing
   * @param {Event} e - Input event
   */
  handleInput(e) {
    this.searchQuery = e.target.value;

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.performSearch();
    }, this.debounceDelay);
  }

  /**
   * Perform search and display results
   */
  performSearch() {
    const resultsContainer = this.container?.querySelector('.ip-search-results');
    if (!resultsContainer) return;

    if (this.searchQuery.length < 2) {
      this.hideResults();
      return;
    }

    const results = this.contentService.search(this.searchQuery);

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="ip-search-no-results">No results found</div>
      `;
    } else {
      resultsContainer.innerHTML = results.map(({ article }) => `
        <div class="ip-search-result" data-article-id="${this.escapeHtml(article.id)}">
          <div class="ip-search-result-title">
            ${this.highlightMatch(article.title, this.searchQuery)}
            <span class="ip-search-result-category">${this.escapeHtml(article.category || '')}</span>
          </div>
          ${article.content?.summary ? `
            <div class="ip-search-result-snippet">
              ${this.highlightMatch(this.truncate(article.content.summary, 80), this.searchQuery)}
            </div>
          ` : ''}
        </div>
      `).join('');

      // Attach click handlers to results
      resultsContainer.querySelectorAll('.ip-search-result').forEach(result => {
        result.addEventListener('click', () => {
          const articleId = result.dataset.articleId;
          if (articleId) {
            this.selectResult(articleId);
          }
        });
      });
    }

    this.showResults();
  }

  /**
   * Select a search result
   * @param {string} articleId - The selected article ID
   */
  selectResult(articleId) {
    if (this.onResultSelect) {
      this.onResultSelect(articleId);
    }
    this.clear();
  }

  /**
   * Show the results dropdown
   */
  showResults() {
    const resultsContainer = this.container?.querySelector('.ip-search-results');
    if (resultsContainer && this.searchQuery.length >= 2) {
      resultsContainer.classList.add('active');
    }
  }

  /**
   * Hide the results dropdown
   */
  hideResults() {
    const resultsContainer = this.container?.querySelector('.ip-search-results');
    if (resultsContainer) {
      resultsContainer.classList.remove('active');
    }
  }

  /**
   * Clear the search
   */
  clear() {
    this.searchQuery = '';
    const input = this.container?.querySelector('.ip-search-input');
    if (input) {
      input.value = '';
    }
    this.hideResults();
  }

  /**
   * Get the current search query
   * @returns {string}
   */
  getQuery() {
    return this.searchQuery;
  }

  /**
   * Highlight matching text in search results
   * @param {string} text - Text to highlight
   * @param {string} query - Search query
   */
  highlightMatch(text, query) {
    if (!query || !text) return this.escapeHtml(text);

    const escaped = this.escapeHtml(text);
    const queryLower = query.toLowerCase();
    const textLower = escaped.toLowerCase();
    const index = textLower.indexOf(queryLower);

    if (index === -1) return escaped;

    const before = escaped.substring(0, index);
    const match = escaped.substring(index, index + query.length);
    const after = escaped.substring(index + query.length);

    return `${before}<span class="ip-search-highlight">${match}</span>${after}`;
  }

  /**
   * Truncate text to maximum length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   */
  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
