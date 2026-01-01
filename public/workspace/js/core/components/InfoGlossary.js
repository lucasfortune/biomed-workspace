/**
 * InfoGlossary Component
 *
 * Provides an expandable A-Z glossary navigation for help articles.
 * Clicking a term navigates to that article.
 *
 * @class InfoGlossary
 */
class InfoGlossary {
  constructor(contentService, onTermSelect) {
    this.contentService = contentService;
    this.onTermSelect = onTermSelect; // Callback when user selects a term
    this.container = null;
    this.isExpanded = false;
  }

  /**
   * Attach to a container element
   * @param {HTMLElement} container - The container element
   */
  attach(container) {
    this.container = container;
  }

  /**
   * Get expanded state
   * @returns {boolean}
   */
  getExpanded() {
    return this.isExpanded;
  }

  /**
   * Set expanded state
   * @param {boolean} expanded - Whether glossary is expanded
   */
  setExpanded(expanded) {
    this.isExpanded = expanded;
    this.updateExpandedState();
  }

  /**
   * Toggle expanded state
   */
  toggle() {
    this.isExpanded = !this.isExpanded;
    this.updateExpandedState();
  }

  /**
   * Update DOM to reflect expanded state
   */
  updateExpandedState() {
    if (!this.container) return;

    if (this.isExpanded) {
      this.container.classList.add('expanded');
    } else {
      this.container.classList.remove('expanded');
    }
  }

  /**
   * Render the glossary component
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="ip-glossary-toggle">
        <span>Glossary</span>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
        </svg>
      </div>
      <div class="ip-glossary-list">
        ${this.renderTerms()}
      </div>
    `;

    this.updateExpandedState();
    this.attachEventListeners();
  }

  /**
   * Render glossary terms organized by letter
   */
  renderTerms() {
    const glossary = this.contentService.getFullGlossary();
    const letters = Object.keys(glossary).sort();

    if (letters.length === 0) {
      return '<div class="ip-glossary-empty">No terms available yet</div>';
    }

    return letters.map(letter => `
      <div class="ip-glossary-letter">${letter}</div>
      ${glossary[letter].map(item => `
        <a class="ip-glossary-term" data-article-id="${this.escapeHtml(item.articleId)}">
          ${this.escapeHtml(item.term)}
        </a>
      `).join('')}
    `).join('');
  }

  /**
   * Refresh the glossary content
   */
  refresh() {
    const listContainer = this.container?.querySelector('.ip-glossary-list');
    if (listContainer) {
      listContainer.innerHTML = this.renderTerms();
      this.attachTermListeners();
    }
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (!this.container) return;

    // Toggle button
    const toggle = this.container.querySelector('.ip-glossary-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => this.toggle());
    }

    // Term links
    this.attachTermListeners();
  }

  /**
   * Attach click listeners to term links
   */
  attachTermListeners() {
    if (!this.container) return;

    this.container.querySelectorAll('.ip-glossary-term').forEach(term => {
      term.addEventListener('click', (e) => {
        e.preventDefault();
        const articleId = term.dataset.articleId;
        if (articleId && this.onTermSelect) {
          this.onTermSelect(articleId);
          // Optionally collapse after selection
          this.setExpanded(false);
        }
      });
    });
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
