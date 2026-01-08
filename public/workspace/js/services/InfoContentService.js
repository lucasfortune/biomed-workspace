/**
 * InfoContentService (v2.0 - Manifest-based with Markdown)
 *
 * Handles loading, caching, and searching educational content articles.
 * Uses manifest-based architecture:
 * - Manifest loads eagerly (complete glossary immediately available)
 * - Markdown content loads lazily on demand
 *
 * Content is stored in /public/workspace/content/
 */
class InfoContentService {
  constructor() {
    // Manifest data (loaded eagerly)
    this.manifest = null;

    // Content cache: articleId -> parsed article object
    this.contentCache = new Map();

    // Search index built from manifest
    this.searchIndex = [];

    // Base path for content files
    this.basePath = '/workspace/content';

    // Initialization promise (ensures single load)
    this.initPromise = null;

    // Track initialization state
    this.initialized = false;
  }

  /**
   * Initialize the service - loads manifest
   * Call this once at startup before using other methods
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._loadManifest();
    return this.initPromise;
  }

  /**
   * Load the manifest file (eager loading)
   * @private
   */
  async _loadManifest() {
    try {
      const response = await fetch(`${this.basePath}/manifest.json`);
      if (!response.ok) {
        throw new Error(`Failed to load manifest: ${response.status}`);
      }

      this.manifest = await response.json();

      // Build search index from manifest
      this._buildSearchIndex();

      this.initialized = true;
      console.log(`[InfoContentService] Loaded manifest v${this.manifest.version} with ${Object.keys(this.manifest.articles).length} articles`);
    } catch (error) {
      console.error('[InfoContentService] Failed to load manifest:', error);
      // Fallback: try to use empty manifest structure
      this.manifest = { articles: {}, glossary: {}, modules: [] };
      throw error;
    }
  }

  /**
   * Build search index from manifest data
   * @private
   */
  _buildSearchIndex() {
    this.searchIndex = Object.values(this.manifest.articles).map(entry => ({
      id: entry.id,
      title: entry.title,
      displayTitle: entry.displayTitle,
      category: entry.category,
      tags: entry.tags,
      module: entry.module
    }));
  }

  /**
   * Get article by ID (lazy loads content)
   * @param {string} articleId - The article ID
   * @returns {Promise<Object|null>}
   */
  async getArticle(articleId) {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Check content cache first
    if (this.contentCache.has(articleId)) {
      return this.contentCache.get(articleId);
    }

    // Get manifest entry
    const entry = this.manifest.articles[articleId];
    if (!entry) {
      console.warn(`[InfoContentService] Article not found in manifest: ${articleId}`);
      return null;
    }

    // Load markdown content
    try {
      const response = await fetch(`${this.basePath}/${entry.path}`);
      if (!response.ok) {
        throw new Error(`Failed to load article: ${response.status}`);
      }

      const markdown = await response.text();
      const article = this._parseMarkdown(markdown, entry);

      // Cache the parsed article
      this.contentCache.set(articleId, article);

      return article;
    } catch (error) {
      console.error(`[InfoContentService] Error loading article ${articleId}:`, error);
      return null;
    }
  }

  /**
   * Fetch an article (alias for getArticle for backward compatibility)
   * @param {string} articleId
   * @returns {Promise<Object|null>}
   */
  async fetchArticle(articleId) {
    return this.getArticle(articleId);
  }

  /**
   * Parse markdown file to article object
   * @private
   * @param {string} markdown - Raw markdown content
   * @param {Object} manifestEntry - Entry from manifest
   * @returns {Object} Parsed article object
   */
  _parseMarkdown(markdown, manifestEntry) {
    // Extract frontmatter
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    let frontmatter = {};
    let content = markdown;

    if (frontmatterMatch) {
      try {
        frontmatter = this._parseYaml(frontmatterMatch[1]);
        content = frontmatterMatch[2].trim();
      } catch (e) {
        console.warn('[InfoContentService] Failed to parse frontmatter:', e);
      }
    }

    // Parse markdown content
    const parsedContent = this._parseContent(content);

    // Build article object (compatible with existing InfoArticle component)
    return {
      id: manifestEntry.id,
      title: manifestEntry.displayTitle || manifestEntry.title,
      category: manifestEntry.category,
      tags: manifestEntry.tags,
      content: {
        summary: parsedContent.summary,
        body: parsedContent.body,
        bodyHtml: parsedContent.bodyHtml,
        parameterImpact: frontmatter.parameterImpact
      },
      seeAlsoManual: manifestEntry.seeAlsoManual,
      seeAlsoTags: manifestEntry.seeAlsoTags
    };
  }

  /**
   * Simple YAML parser for frontmatter
   * @private
   * @param {string} yamlStr - YAML string
   * @returns {Object} Parsed object
   */
  _parseYaml(yamlStr) {
    const result = {};
    const lines = yamlStr.split('\n');
    let currentKey = null;
    let inArray = false;
    let multilineValue = '';
    let inMultiline = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Handle multiline strings (indicated by | )
      if (inMultiline) {
        if (line.startsWith('  ') || line === '') {
          multilineValue += (multilineValue ? '\n' : '') + line.slice(2);
          continue;
        } else {
          result[currentKey] = multilineValue.trim();
          inMultiline = false;
          multilineValue = '';
        }
      }

      if (!trimmed) continue;

      // Array item
      if (trimmed.startsWith('- ') && currentKey && inArray) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        result[currentKey].push(trimmed.slice(2).trim());
      } else {
        // Key-value pair
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          currentKey = trimmed.slice(0, colonIndex).trim();
          const value = trimmed.slice(colonIndex + 1).trim();

          if (value === '|') {
            // Multiline string starts
            inMultiline = true;
            multilineValue = '';
          } else if (value === '' || value === '[]') {
            // Empty value or empty array - next lines might be array items
            result[currentKey] = [];
            inArray = true;
          } else {
            // Simple value
            result[currentKey] = value.replace(/^["']|["']$/g, '');
            inArray = false;
          }
        }
      }
    }

    // Handle any remaining multiline value
    if (inMultiline && currentKey) {
      result[currentKey] = multilineValue.trim();
    }

    return result;
  }

  /**
   * Parse markdown content, extracting summary and body
   * @private
   * @param {string} markdown - Markdown content without frontmatter
   * @returns {Object} { summary, body, bodyHtml }
   */
  _parseContent(markdown) {
    // Remove the title (first # heading)
    const withoutTitle = markdown.replace(/^#\s+.+\n+/, '');

    // Split into paragraphs
    const paragraphs = withoutTitle.split(/\n\n+/);

    // First non-header paragraph is the summary
    let summary = '';
    let bodyStart = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i].trim();
      if (p && !p.startsWith('#') && !p.startsWith('-')) {
        summary = p.replace(/\n/g, ' ');
        bodyStart = i + 1;
        break;
      }
    }

    // Rest is the body
    const body = paragraphs.slice(bodyStart).join('\n\n');

    // Parse body to HTML using marked (if available)
    let bodyHtml = body;
    if (typeof marked !== 'undefined') {
      try {
        bodyHtml = marked.parse(body);
      } catch (e) {
        console.warn('[InfoContentService] marked.parse failed:', e);
      }
    }

    return { summary, body, bodyHtml };
  }

  /**
   * Get full glossary (from manifest - no lazy loading needed)
   * @returns {Object} Glossary index by letter
   */
  getFullGlossary() {
    if (!this.manifest) {
      return {};
    }
    return this.manifest.glossary || {};
  }

  /**
   * Get all glossary letters
   * @returns {Array<string>}
   */
  getAllGlossaryLetters() {
    return Object.keys(this.getFullGlossary()).sort();
  }

  /**
   * Get glossary terms by letter
   * @param {string} letter - Single letter
   * @returns {Array}
   */
  getGlossaryByLetter(letter) {
    const glossary = this.getFullGlossary();
    return glossary[letter.toUpperCase()] || [];
  }

  /**
   * Search articles (using manifest data - no content loading needed)
   * @param {string} query - Search query
   * @returns {Array} Array of {article, score} sorted by score descending
   */
  search(query) {
    if (!query || query.length < 2) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
    const results = [];

    for (const entry of this.searchIndex) {
      let score = 0;

      // Title match (weight: 10)
      const titleLower = (entry.displayTitle || entry.title).toLowerCase();
      if (titleLower === queryLower) {
        score += 100; // Exact match
      } else if (titleLower.includes(queryLower)) {
        score += 10;
      } else {
        queryWords.forEach(word => {
          if (titleLower.includes(word)) score += 5;
        });
      }

      // Tag match (weight: 3)
      if (entry.tags && Array.isArray(entry.tags)) {
        entry.tags.forEach(tag => {
          const tagLower = tag.toLowerCase();
          if (tagLower === queryLower) {
            score += 5;
          } else if (queryWords.some(word => tagLower.includes(word))) {
            score += 2;
          }
        });
      }

      // Category match
      if (entry.category && entry.category.toLowerCase().includes(queryLower)) {
        score += 3;
      }

      if (score > 0) {
        results.push({
          article: {
            id: entry.id,
            title: entry.displayTitle || entry.title,
            category: entry.category,
            tags: entry.tags
          },
          score
        });
      }
    }

    // Sort by score descending, then by title alphabetically
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.article.title.localeCompare(b.article.title);
    });

    // Return top 15 results
    return results.slice(0, 15);
  }

  /**
   * Generate "See Also" links for an article
   * Uses manifest data, so all articles are always findable
   * @param {Object} article - The article object
   * @returns {Array<{title: string, articleId: string}>}
   */
  generateSeeAlso(article) {
    const seeAlso = [];
    const seenIds = new Set([article.id]);

    // Add manual links first
    if (article.seeAlsoManual && Array.isArray(article.seeAlsoManual)) {
      for (const articleId of article.seeAlsoManual) {
        const entry = this.manifest?.articles[articleId];
        if (entry && !seenIds.has(articleId)) {
          seeAlso.push({
            title: entry.displayTitle || entry.title,
            articleId: articleId
          });
          seenIds.add(articleId);
        }
      }
    }

    // Add auto-generated links based on shared tags
    if (article.seeAlsoTags && Array.isArray(article.seeAlsoTags) && seeAlso.length < 8) {
      const tagMatches = [];

      for (const [id, entry] of Object.entries(this.manifest?.articles || {})) {
        if (seenIds.has(id)) continue;
        if (!entry.tags) continue;

        const sharedTags = article.seeAlsoTags.filter(tag =>
          entry.tags.includes(tag)
        );

        if (sharedTags.length > 0) {
          tagMatches.push({
            entry,
            sharedCount: sharedTags.length
          });
        }
      }

      // Sort by shared tag count
      tagMatches.sort((a, b) => b.sharedCount - a.sharedCount);

      // Add top matches until we have 8 total
      for (const match of tagMatches) {
        if (seeAlso.length >= 8) break;
        if (!seenIds.has(match.entry.id)) {
          seeAlso.push({
            title: match.entry.displayTitle || match.entry.title,
            articleId: match.entry.id
          });
          seenIds.add(match.entry.id);
        }
      }
    }

    return seeAlso;
  }

  /**
   * Get statistics about loaded content
   * @returns {Object}
   */
  getStats() {
    return {
      totalArticles: this.manifest ? Object.keys(this.manifest.articles).length : 0,
      cachedArticles: this.contentCache.size,
      glossaryLetters: this.getAllGlossaryLetters().length,
      initialized: this.initialized
    };
  }

  /**
   * Check if a specific article exists in the manifest
   * @param {string} articleId
   * @returns {boolean}
   */
  hasArticle(articleId) {
    return this.manifest?.articles?.[articleId] !== undefined;
  }

  /**
   * Get article metadata from manifest without loading content
   * @param {string} articleId
   * @returns {Object|null}
   */
  getArticleMetadata(articleId) {
    return this.manifest?.articles?.[articleId] || null;
  }

  // =========================================================================
  // BACKWARD COMPATIBILITY METHODS
  // These methods are kept for compatibility with existing code but
  // are no longer needed with manifest-based loading
  // =========================================================================

  /**
   * @deprecated No longer needed - manifest provides complete glossary
   */
  buildGlossaryFromCache() {
    // No-op: glossary is pre-built in manifest
    console.log('[InfoContentService] buildGlossaryFromCache() is deprecated - glossary is loaded from manifest');
  }

  /**
   * @deprecated No longer needed - manifest is loaded once
   */
  async loadModule(moduleName) {
    // No-op: modules are not loaded separately anymore
    console.log(`[InfoContentService] loadModule('${moduleName}') is deprecated - use manifest-based loading`);
  }

  /**
   * @deprecated Use getArticle() instead
   */
  async loadContentFile(filePath) {
    // Map old file paths to article IDs
    const articleId = filePath.replace('.json', '').replace('/', '.');
    return this.getArticle(articleId);
  }

  /**
   * @deprecated No longer needed
   */
  async loadGlossaryIndex() {
    // No-op: glossary is in manifest
    console.log('[InfoContentService] loadGlossaryIndex() is deprecated - glossary is loaded from manifest');
  }
}
