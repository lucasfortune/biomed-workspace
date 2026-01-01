/**
 * InfoContentService
 *
 * Handles loading, caching, and searching educational content articles.
 * Content is stored as JSON files in /public/workspace/content/
 */
class InfoContentService {
  constructor() {
    // Article cache: articleId -> article object
    this.articlesCache = new Map();

    // Search index: flat array of all articles for searching
    this.searchIndex = [];

    // Glossary index: letter -> array of {term, articleId}
    this.glossaryIndex = {};

    // Track which module files have been loaded
    this.loadedModules = new Set();

    // Base path for content files
    this.basePath = '/workspace/content';
  }

  /**
   * Load a module's articles (e.g., 'segmentation', 'denoising')
   * @param {string} moduleName - Name of the module to load
   * @returns {Promise<void>}
   */
  async loadModule(moduleName) {
    if (this.loadedModules.has(moduleName)) {
      return; // Already loaded
    }

    try {
      const response = await fetch(`${this.basePath}/modules/${moduleName}.json`);
      if (!response.ok) {
        console.warn(`InfoContentService: Could not load module '${moduleName}'`);
        return;
      }

      const data = await response.json();

      if (data.articles && Array.isArray(data.articles)) {
        data.articles.forEach(article => {
          this.articlesCache.set(article.id, article);
          this.searchIndex.push(article);
        });
      }

      this.loadedModules.add(moduleName);
      console.log(`InfoContentService: Loaded ${data.articles?.length || 0} articles from '${moduleName}'`);
    } catch (error) {
      console.error(`InfoContentService: Error loading module '${moduleName}':`, error);
    }
  }

  /**
   * Load a standalone content file (e.g., 'getting-started', 'concepts/fundamentals')
   * @param {string} filePath - Path relative to content directory
   * @returns {Promise<Object|null>}
   */
  async loadContentFile(filePath) {
    try {
      const response = await fetch(`${this.basePath}/${filePath}.json`);
      if (!response.ok) {
        console.warn(`InfoContentService: Could not load '${filePath}'`);
        return null;
      }

      const data = await response.json();

      // If it's a single article, add to cache
      if (data.id) {
        this.articlesCache.set(data.id, data);
        this.searchIndex.push(data);
        return data;
      }

      // If it's a collection of articles
      if (data.articles && Array.isArray(data.articles)) {
        data.articles.forEach(article => {
          this.articlesCache.set(article.id, article);
          this.searchIndex.push(article);
        });
        return data;
      }

      return data;
    } catch (error) {
      console.error(`InfoContentService: Error loading '${filePath}':`, error);
      return null;
    }
  }

  /**
   * Load the glossary index file
   * @returns {Promise<void>}
   */
  async loadGlossaryIndex() {
    try {
      const response = await fetch(`${this.basePath}/glossary-index.json`);
      if (!response.ok) {
        // Glossary index doesn't exist - we'll build it dynamically
        this.buildGlossaryFromCache();
        return;
      }

      const data = await response.json();
      if (data.terms) {
        this.glossaryIndex = data.terms;
      }
    } catch (error) {
      console.warn('InfoContentService: No glossary index found, building from cache');
      this.buildGlossaryFromCache();
    }
  }

  /**
   * Build glossary index from cached articles
   */
  buildGlossaryFromCache() {
    this.glossaryIndex = {};

    this.articlesCache.forEach((article, id) => {
      const firstLetter = article.title.charAt(0).toUpperCase();

      if (!this.glossaryIndex[firstLetter]) {
        this.glossaryIndex[firstLetter] = [];
      }

      this.glossaryIndex[firstLetter].push({
        term: article.title,
        articleId: id
      });
    });

    // Sort terms within each letter
    Object.keys(this.glossaryIndex).forEach(letter => {
      this.glossaryIndex[letter].sort((a, b) =>
        a.term.localeCompare(b.term)
      );
    });
  }

  /**
   * Get an article by ID
   * @param {string} articleId - The article ID
   * @returns {Object|null}
   */
  getArticle(articleId) {
    return this.articlesCache.get(articleId) || null;
  }

  /**
   * Fetch an article, loading its module if necessary
   * @param {string} articleId - The article ID
   * @returns {Promise<Object|null>}
   */
  async fetchArticle(articleId) {
    // Check cache first
    if (this.articlesCache.has(articleId)) {
      return this.articlesCache.get(articleId);
    }

    // Try to determine the module from the article ID
    const moduleName = articleId.split('.')[0];

    // Special case for getting-started
    if (articleId === 'getting-started') {
      return await this.loadContentFile('getting-started');
    }

    // Special case for concepts
    if (moduleName === 'concepts') {
      await this.loadContentFile('concepts/fundamentals');
      return this.articlesCache.get(articleId) || null;
    }

    // Try to load the module
    await this.loadModule(moduleName);
    return this.articlesCache.get(articleId) || null;
  }

  /**
   * Search articles
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

    this.searchIndex.forEach(article => {
      let score = 0;

      // Title match (weight: 10)
      const titleLower = article.title.toLowerCase();
      if (titleLower === queryLower) {
        score += 100; // Exact match
      } else if (titleLower.includes(queryLower)) {
        score += 10;
      } else {
        queryWords.forEach(word => {
          if (titleLower.includes(word)) score += 5;
        });
      }

      // Summary match (weight: 5)
      const summaryLower = article.content?.summary?.toLowerCase() || '';
      queryWords.forEach(word => {
        if (summaryLower.includes(word)) score += 3;
      });

      // Tag match (weight: 3)
      if (article.tags && Array.isArray(article.tags)) {
        article.tags.forEach(tag => {
          const tagLower = tag.toLowerCase();
          if (tagLower === queryLower) {
            score += 5;
          } else if (queryWords.some(word => tagLower.includes(word))) {
            score += 2;
          }
        });
      }

      // Body match (weight: 1)
      const bodyLower = article.content?.body?.toLowerCase() || '';
      queryWords.forEach(word => {
        if (bodyLower.includes(word)) score += 1;
      });

      if (score > 0) {
        results.push({ article, score });
      }
    });

    // Sort by score descending, then by title alphabetically
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.article.title.localeCompare(b.article.title);
    });

    // Return top 15 results
    return results.slice(0, 15);
  }

  /**
   * Get glossary terms for a specific letter
   * @param {string} letter - Single uppercase letter
   * @returns {Array}
   */
  getGlossaryByLetter(letter) {
    return this.glossaryIndex[letter.toUpperCase()] || [];
  }

  /**
   * Get all available glossary letters
   * @returns {Array<string>}
   */
  getAllGlossaryLetters() {
    return Object.keys(this.glossaryIndex).sort();
  }

  /**
   * Get full glossary index
   * @returns {Object}
   */
  getFullGlossary() {
    return this.glossaryIndex;
  }

  /**
   * Generate "See Also" links for an article
   * @param {Object} article - The article object
   * @returns {Array<{title: string, articleId: string}>}
   */
  generateSeeAlso(article) {
    const seeAlso = [];
    const seenIds = new Set([article.id]);

    // Add manual links first
    if (article.seeAlsoManual && Array.isArray(article.seeAlsoManual)) {
      article.seeAlsoManual.forEach(articleId => {
        const linkedArticle = this.articlesCache.get(articleId);
        if (linkedArticle && !seenIds.has(articleId)) {
          seeAlso.push({
            title: linkedArticle.title,
            articleId: articleId
          });
          seenIds.add(articleId);
        }
      });
    }

    // Add auto-generated links based on shared tags
    if (article.seeAlsoTags && Array.isArray(article.seeAlsoTags) && seeAlso.length < 8) {
      const tagMatches = [];

      this.articlesCache.forEach((otherArticle, id) => {
        if (seenIds.has(id)) return;
        if (!otherArticle.tags) return;

        const sharedTags = article.seeAlsoTags.filter(tag =>
          otherArticle.tags.includes(tag)
        );

        if (sharedTags.length > 0) {
          tagMatches.push({
            article: otherArticle,
            sharedCount: sharedTags.length
          });
        }
      });

      // Sort by shared tag count
      tagMatches.sort((a, b) => b.sharedCount - a.sharedCount);

      // Add top matches until we have 8 total
      tagMatches.forEach(match => {
        if (seeAlso.length >= 8) return;
        if (!seenIds.has(match.article.id)) {
          seeAlso.push({
            title: match.article.title,
            articleId: match.article.id
          });
          seenIds.add(match.article.id);
        }
      });
    }

    return seeAlso;
  }

  /**
   * Get statistics about loaded content
   * @returns {Object}
   */
  getStats() {
    return {
      totalArticles: this.articlesCache.size,
      loadedModules: Array.from(this.loadedModules),
      glossaryLetters: this.getAllGlossaryLetters().length
    };
  }
}
