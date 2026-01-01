/**
 * InfoArticle Component
 *
 * Renders article content including title, summary, body, parameter impact,
 * and "See Also" links. Handles article navigation via callbacks.
 *
 * @class InfoArticle
 */
class InfoArticle {
  constructor(contentService, onNavigate) {
    this.contentService = contentService;
    this.onNavigate = onNavigate; // Callback when user clicks a link
    this.container = null;
    this.currentArticle = null;
  }

  /**
   * Attach to a container element
   * @param {HTMLElement} container - The container element
   */
  attach(container) {
    this.container = container;
  }

  /**
   * Display an article
   * @param {Object} article - The article object to display
   */
  display(article) {
    this.currentArticle = article;
    this.render();
  }

  /**
   * Clear the article display
   */
  clear() {
    this.currentArticle = null;
    this.render();
  }

  /**
   * Render the article content
   */
  render() {
    if (!this.container) return;

    if (!this.currentArticle) {
      this.container.innerHTML = this.renderEmptyState();
    } else {
      this.container.innerHTML = this.renderArticle(this.currentArticle);
    }

    this.attachEventListeners();
  }

  /**
   * Render empty state when no article is selected
   */
  renderEmptyState() {
    return `
      <div class="ip-empty">
        <div class="ip-empty-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
          </svg>
        </div>
        <div class="ip-empty-text">
          Click a <strong>?</strong> icon anywhere in the workspace to learn more about that topic.
        </div>
      </div>
    `;
  }

  /**
   * Render article content
   * @param {Object} article - The article to render
   */
  renderArticle(article) {
    const seeAlso = this.contentService.generateSeeAlso(article);

    return `
      <h2 class="ip-article-title">${this.escapeHtml(article.title)}</h2>

      <div class="ip-article-meta">
        <span class="ip-article-category">${this.escapeHtml(article.category || 'general')}</span>
      </div>

      ${article.content?.summary ? `
        <p class="ip-article-summary">${this.escapeHtml(article.content.summary)}</p>
      ` : ''}

      ${article.content?.body ? `
        <div class="ip-article-body">
          ${this.formatBody(article.content.body)}
        </div>
      ` : ''}

      ${article.content?.parameterImpact ? `
        <div class="ip-article-impact">
          <div class="ip-article-impact-label">Parameter Impact</div>
          <div class="ip-article-impact-text">${this.escapeHtml(article.content.parameterImpact)}</div>
        </div>
      ` : ''}

      ${seeAlso.length > 0 ? this.renderSeeAlso(seeAlso) : ''}
    `;
  }

  /**
   * Render "See Also" section
   * @param {Array} seeAlso - Array of related articles
   */
  renderSeeAlso(seeAlso) {
    return `
      <div class="ip-see-also">
        <div class="ip-see-also-header">See Also</div>
        <div class="ip-see-also-list">
          ${seeAlso.map(item => `
            <a class="ip-see-also-link" data-article-id="${this.escapeHtml(item.articleId)}">
              ${this.escapeHtml(item.title)}
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Format article body text with support for:
   * - Paragraphs (double newlines)
   * - Lists (lines starting with -, •, *)
   * - Section headers (lines ending with :)
   * - Line breaks within paragraphs
   * @param {string} body - Raw body text
   */
  formatBody(body) {
    if (!body) return '';

    // Split by double newlines for blocks
    const blocks = body.split(/\n\n+/);
    const result = [];

    for (const block of blocks) {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) continue;

      const lines = trimmedBlock.split('\n');

      // Check if this block is a list (most lines start with list markers)
      const listLines = lines.filter(l => /^[\-\•\*]\s/.test(l.trim()));
      const isListBlock = listLines.length > 0 && listLines.length >= lines.length * 0.5;

      if (isListBlock) {
        // Process as a mixed block with potential header and list
        result.push(this.formatListBlock(lines));
      } else {
        // Process as regular paragraph(s)
        result.push(this.formatParagraphBlock(lines));
      }
    }

    return result.join('');
  }

  /**
   * Format a block that contains list items
   * @param {Array} lines - Lines in the block
   */
  formatListBlock(lines) {
    let html = '';
    let inList = false;
    let listItems = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Check if line is a list item
      const listMatch = trimmedLine.match(/^[\-\•\*]\s+(.+)$/);

      if (listMatch) {
        if (!inList) {
          inList = true;
          listItems = [];
        }
        listItems.push(listMatch[1]);
      } else {
        // Not a list item - could be a header or regular text
        if (inList && listItems.length > 0) {
          // Close the previous list
          html += '<ul>' + listItems.map(item => `<li>${this.escapeHtml(item)}</li>`).join('') + '</ul>';
          listItems = [];
          inList = false;
        }

        // Check if it's a section header (ends with :)
        if (trimmedLine.endsWith(':')) {
          html += `<h4 class="ip-section-header">${this.escapeHtml(trimmedLine)}</h4>`;
        } else {
          html += `<p>${this.escapeHtml(trimmedLine)}</p>`;
        }
      }
    }

    // Close any remaining list
    if (inList && listItems.length > 0) {
      html += '<ul>' + listItems.map(item => `<li>${this.escapeHtml(item)}</li>`).join('') + '</ul>';
    }

    return html;
  }

  /**
   * Format a paragraph block (non-list content)
   * @param {Array} lines - Lines in the block
   */
  formatParagraphBlock(lines) {
    let html = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check if it's a section header (ends with : and is short, or followed by list/content)
      const isHeader = line.endsWith(':') && (
        line.length < 50 ||
        (i + 1 < lines.length && /^[\-\•\*]\s/.test(lines[i + 1].trim()))
      );

      if (isHeader) {
        html += `<h4 class="ip-section-header">${this.escapeHtml(line)}</h4>`;
      } else {
        // Regular text - check for inline formatting
        html += `<p>${this.escapeHtml(line)}</p>`;
      }
    }

    return html;
  }

  /**
   * Attach event listeners for interactive elements
   */
  attachEventListeners() {
    if (!this.container) return;

    // See Also links
    this.container.querySelectorAll('.ip-see-also-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const articleId = link.dataset.articleId;
        if (articleId && this.onNavigate) {
          this.onNavigate(articleId);
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

  /**
   * Get the current article
   * @returns {Object|null}
   */
  getCurrentArticle() {
    return this.currentArticle;
  }
}
