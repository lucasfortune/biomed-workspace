# Markdown Help System Migration Plan

## Overview

Migrate the workspace help system from JSON-based lazy loading to a **manifest-based markdown system** that:
1. Fixes the glossary rendering issue (all articles visible on initial load)
2. Provides better formatting via markdown
3. Disambiguates duplicate article titles with parenthetical suffixes

---

## Root Cause of Current Issue

In `InfoPanel.loadInitialContent()` (line 106-124), only 2 modules are loaded:
- `getting-started` (1 article)
- `segmentation` (22 articles)

The glossary is built from `articlesCache`, so only ~23 articles appear initially instead of ~89+. Other modules load on-demand when help icons are clicked.

---

## Architecture Change

**Current:** Lazy load JSON modules → Build glossary from cache → Incomplete glossary

**New:** Eager load manifest.json → Complete glossary immediately → Lazy load markdown content on demand

```
/public/workspace/content/
├── manifest.json              # Complete index (loaded eagerly)
├── getting-started.md
└── modules/
    ├── segmentation/
    │   ├── _module.md
    │   ├── config-batch-size.md
    │   └── ...
    ├── denoising-dl/
    │   └── ...
    └── ... (8 module directories)
```

---

## Implementation Phases

### Phase 1: Conversion Script & Markdown Files

**Files to create:**
- `scripts/convert-help-to-markdown.js`

**Tasks:**
- [ ] Create Node.js conversion script with js-yaml dependency
- [ ] Define duplicate title disambiguation map (14 titles)
- [ ] Generate YAML frontmatter from JSON article metadata
- [ ] Convert article body text to markdown format
- [ ] Generate `manifest.json` with all article metadata + glossary
- [ ] Create directory structure: `modules/{module-name}/*.md`
- [ ] Run conversion on all 10 JSON files (~89 articles)
- [ ] Validate: article count matches, all IDs preserved

**Duplicate Titles to Disambiguate:**
| Original Title | Segmentation ID | DL Denoising ID |
|----------------|-----------------|-----------------|
| Batch Size | segmentation.config.batch-size | denoising-dl.step2.batch-size |
| Data Augmentation | segmentation.config.augmentation | denoising-dl.step2.augmentation |
| Learning Rate | segmentation.config.learning-rate | denoising-dl.step2.learning-rate |
| Patch Size | segmentation.config.patch-size | denoising-dl.step2.patch-size |
| Number of Epochs | segmentation.config.num-epochs | denoising-dl.step2.epochs |
| Number of Features | segmentation.config.num-features | denoising-dl.step2.features |
| Number of Layers | segmentation.config.num-layers | denoising-dl.step2.num-layers |
| Patches per Image | segmentation.config.patches-per-image | denoising-dl.step2.patches-per-image |
| Loss Curves | segmentation.step3.loss-curves | denoising-dl.step3.loss |
| Workflow Options | segmentation.step1.workflow-choice | denoising-dl.step1.workflow |
| Input Image Stack | denoising-dl.step1.input | denoising-filter.step1.input |
| Denoising Methods | denoising-dl.step1.method | denoising-filter.step2.methods |
| Model Configuration File | segmentation.step1.config-file | denoising-dl.step1.import.config |
| Model Weights File | segmentation.step1.model-file | denoising-dl.step1.import.model |

**Markdown File Format:**
```yaml
---
id: segmentation.config.batch-size
title: Batch Size
displayTitle: Batch Size (Segmentation)
category: parameter
module: segmentation
tags: [segmentation, training, batch, configuration]
seeAlsoManual: [segmentation.config.patch-size]
seeAlsoTags: [training, configuration]
parameterImpact: "Larger values provide more stable training..."
---

# Batch Size

Number of image patches processed simultaneously during each training step.

## Overview

Batch size controls how many patches are processed together...
```

**Manifest Schema:**
```json
{
  "version": "2.0.0",
  "generated": "2026-01-08T...",
  "articles": {
    "segmentation.config.batch-size": {
      "id": "segmentation.config.batch-size",
      "title": "Batch Size",
      "displayTitle": "Batch Size (Segmentation)",
      "category": "parameter",
      "module": "segmentation",
      "tags": ["..."],
      "path": "modules/segmentation/config-batch-size.md",
      "seeAlsoManual": ["..."],
      "seeAlsoTags": ["..."]
    }
  },
  "glossary": {
    "A": [{"term": "Annotation Masks", "articleId": "..."}],
    "B": [
      {"term": "Batch Size (DL Denoising)", "articleId": "denoising-dl.step2.batch-size"},
      {"term": "Batch Size (Segmentation)", "articleId": "segmentation.config.batch-size"}
    ]
  },
  "modules": ["segmentation", "denoising-dl", ...]
}
```

---

### Phase 2: InfoContentService Refactoring

**File to modify:**
- `public/workspace/js/services/InfoContentService.js` (complete rewrite)

**Tasks:**
- [ ] Add `manifest` property (loaded eagerly)
- [ ] Add `contentCache` Map for lazy-loaded markdown content
- [ ] Implement `initialize()` method that fetches manifest.json
- [ ] Update `getArticle()` to lazy-load markdown on demand
- [ ] Update `getFullGlossary()` to return manifest.glossary directly
- [ ] Update `search()` to use manifest data (no content loading needed)
- [ ] Update `generateSeeAlso()` to use manifest for link resolution
- [ ] Add simple YAML frontmatter parser (or use existing if available)
- [ ] Add markdown content parser (extract summary from first paragraph)

**Key Method Changes:**

```javascript
// NEW: Initialize service (called once at startup)
async initialize() {
  const response = await fetch(`${this.basePath}/manifest.json`);
  this.manifest = await response.json();
  // Glossary is now immediately available!
}

// CHANGED: Get article (lazy load content)
async getArticle(articleId) {
  if (this.contentCache.has(articleId)) {
    return this.contentCache.get(articleId);
  }

  const entry = this.manifest.articles[articleId];
  if (!entry) return null;

  const markdown = await fetch(`${this.basePath}/${entry.path}`);
  const article = this._parseMarkdown(markdown, entry);
  this.contentCache.set(articleId, article);
  return article;
}

// CHANGED: Glossary from manifest (no building needed)
getFullGlossary() {
  return this.manifest?.glossary || {};
}
```

---

### Phase 3: Markdown Rendering

**Files to modify:**
- `public/workspace/index.html` - Add marked.js library
- `public/workspace/js/core/components/InfoArticle.js` - Render HTML
- `public/workspace/css/workspace.css` - Markdown styling

**Tasks:**
- [ ] Add marked.js CDN script to index.html
- [ ] Update InfoArticle.renderArticle() to use `article.content.bodyHtml`
- [ ] Add `.markdown-content` CSS class with styles for h2, h3, ul, ol, code, pre, strong, a

**CSS Additions:**
```css
.ip-article-body.markdown-content h2 { font-size: 1.1rem; margin: 1.5rem 0 0.75rem; }
.ip-article-body.markdown-content h3 { font-size: 1rem; margin: 1.25rem 0 0.5rem; }
.ip-article-body.markdown-content ul,
.ip-article-body.markdown-content ol { padding-left: 1.5rem; }
.ip-article-body.markdown-content code {
  background: var(--bg-tertiary);
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}
.ip-article-body.markdown-content pre {
  background: var(--bg-tertiary);
  padding: 0.75rem;
  border-radius: 6px;
  overflow-x: auto;
}
```

---

### Phase 4: InfoPanel & InfoGlossary Updates

**Files to modify:**
- `public/workspace/js/core/components/InfoPanel.js`
- `public/workspace/js/core/components/InfoGlossary.js`

**Tasks:**
- [ ] Update InfoPanel.loadInitialContent() to call `contentService.initialize()`
- [ ] Remove `buildGlossaryFromCache()` call (no longer needed)
- [ ] Update InfoGlossary to use manifest glossary directly
- [ ] Remove glossary rebuild in InfoPanel.showArticle() (lines 187-189)

**InfoPanel Changes:**
```javascript
async loadInitialContent() {
  // Initialize service (loads manifest with complete glossary)
  await this.contentService.initialize();

  // Load getting-started article content
  const article = await this.contentService.getArticle('getting-started');
  if (article && this.articleComponent) {
    this.articleComponent.display(article);
  }

  // Glossary is already complete from manifest - just refresh UI
  if (this.glossaryComponent) {
    this.glossaryComponent.refresh();
  }
}
```

---

### Phase 5: Validation & Testing

**Files to create:**
- `scripts/validate-conversion.js`
- `scripts/verify-help-icons.js`

**Tasks:**
- [ ] Create validation script: compare article counts, verify all IDs exist
- [ ] Create help icon verification: scan codebase for `data-info-id`, verify in manifest
- [ ] Manual testing checklist:
  - [ ] Glossary shows all articles on initial load
  - [ ] All 14 duplicate titles show disambiguation suffixes
  - [ ] Search returns multiple results for "batch size"
  - [ ] Help icons in all modules work correctly
  - [ ] See Also links resolve correctly
  - [ ] Markdown formatting renders (headers, lists, code)

---

### Phase 6: Cleanup & Documentation

**Tasks:**
- [ ] Archive or remove old JSON files from `content/modules/`
- [ ] Update CLAUDE.md with new help system architecture
- [ ] Save copy of plan to `docs/vision/` as requested

---

## Critical Files Summary

| File | Action |
|------|--------|
| `scripts/convert-help-to-markdown.js` | CREATE |
| `public/workspace/content/manifest.json` | CREATE (generated) |
| `public/workspace/content/modules/**/*.md` | CREATE (generated, ~89 files) |
| `public/workspace/js/services/InfoContentService.js` | REWRITE |
| `public/workspace/js/core/components/InfoPanel.js` | MODIFY |
| `public/workspace/js/core/components/InfoGlossary.js` | MODIFY |
| `public/workspace/js/core/components/InfoArticle.js` | MODIFY |
| `public/workspace/css/workspace.css` | MODIFY (add markdown styles) |
| `public/workspace/index.html` | MODIFY (add marked.js) |
| `scripts/validate-conversion.js` | CREATE |

---

## Dependencies

- `js-yaml` (npm) - For YAML frontmatter generation in conversion script
- `marked` (CDN) - For markdown rendering in browser

---

## Risk Mitigation

1. **Backward compatibility:** Keep old JSON files until validation passes
2. **Incremental testing:** Test each phase before proceeding
3. **Article ID preservation:** IDs remain unchanged, only titles get displayTitle
4. **Help icon compatibility:** `data-info-id` attributes unchanged
