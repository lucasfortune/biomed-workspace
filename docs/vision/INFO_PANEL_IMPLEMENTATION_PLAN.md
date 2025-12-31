# Implementation Plan: Educational Info Panel System

**Status:** Ready for Implementation
**Spec:** `/docs/vision/spec_files/INFO_PANEL_SYSTEM.md`
**Created:** 2025-12-31

---

## Overview

Build a context-sensitive educational help panel for the workspace that provides accessible explanations for methods, parameters, and concepts. The panel appears on the right side, mirroring the file browser on the left (280px width).

**Key Decisions Made:**
- Content storage: `/public/workspace/content/`
- Build order: Panel first, icons added later
- Initial scope: Segmentation module only (~30-50 articles)
- Keyboard shortcuts: None initially

---

## File Structure

```
/public/workspace/
  /content/                           # NEW - Educational content
    /modules/
      segmentation.json               # Segmentation articles (~30-50)
    /concepts/
      fundamentals.json               # Core concepts
    glossary-index.json               # A-Z navigation index
    getting-started.json              # Default welcome article

  /js/
    /core/components/
      InfoPanel.js                    # NEW - Main panel component
      InfoSearch.js                   # NEW - Search functionality
      InfoGlossary.js                 # NEW - A-Z glossary
      InfoArticle.js                  # NEW - Article display
    /services/
      InfoContentService.js           # NEW - Content loading/caching

  /css/
    info-panel.css                    # NEW - Panel styles
```

---

## Component Architecture

### InfoPanel.js (Main Component)
```javascript
class InfoPanel {
  constructor(stateManager)
  async initialize(containerId)    // Mount to DOM, load content
  render()                         // Generate panel HTML
  cleanup()                        // Release resources
  expand() / collapse() / toggle() // Panel visibility
  async showArticle(articleId)     // Display specific article
  onHelpIconClick(articleId)       // Global ? icon handler
}
```

### InfoContentService.js (Data Layer)
```javascript
class InfoContentService {
  async loadModule(moduleName)     // Load module JSON
  getArticle(articleId)            // Get cached article
  search(query)                    // Ranked search results
  getGlossaryByLetter(letter)      // A-Z terms
  generateSeeAlso(article)         // Manual + auto links
}
```

### Sub-Components
- **InfoSearch.js**: Search input, 250ms debounce, results dropdown
- **InfoGlossary.js**: Collapsible A-Z term list
- **InfoArticle.js**: Article renderer with See Also section

---

## State Structure

Add to `StateManager.js`:
```javascript
infoPanel: {
  isOpen: false,
  currentArticleId: null,
  glossaryExpanded: false,
  searchQuery: ''
}
```

---

## CSS Class Naming

All classes prefixed with `ip-`:
- `.ip-panel`, `.ip-panel.collapsed` - Panel container
- `.ip-header`, `.ip-toggle` - Header section
- `.ip-search`, `.ip-search-input`, `.ip-search-results` - Search
- `.ip-glossary`, `.ip-glossary-term` - Glossary
- `.ip-article`, `.ip-article-title`, `.ip-article-body` - Article
- `.ip-see-also`, `.ip-see-also-link` - Related links
- `.help-icon` - Global ? icon styling

---

## Content JSON Schema

```json
{
  "id": "segmentation.config.patch-size",
  "title": "Patch Size",
  "category": "parameter",
  "tags": ["segmentation", "training", "u-net"],
  "contentType": "medium",
  "content": {
    "summary": "Controls the size of image patches extracted during training.",
    "body": "The patch size determines the dimensions of square image regions...",
    "parameterImpact": "Larger patches capture more context but require more memory."
  },
  "seeAlsoManual": ["segmentation.unet", "concepts.convolution"],
  "seeAlsoTags": ["training", "patch"]
}
```

---

## HTML Integration

Add to `index.html` after `<main id="main-content">`:
```html
<aside id="info-panel" class="ip-panel collapsed">
  <div class="ip-toggle" id="info-panel-toggle" title="Toggle info panel">
    <span class="toggle-icon">?</span>
  </div>
  <div class="ip-content">
    <div id="info-panel-container"></div>
  </div>
</aside>
```

---

## Workspace.js Integration

```javascript
// In Workspace.init()
this.infoPanel = new InfoPanel(this.state);
await this.infoPanel.initialize('info-panel-container');

// Global help icon handler
document.addEventListener('click', (e) => {
  if (e.target.closest('.help-icon')) {
    const articleId = e.target.closest('.help-icon').dataset.infoId;
    if (articleId) this.infoPanel.showArticle(articleId);
  }
});
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- Create `/public/workspace/content/` directory structure
- Create `info-panel.css` with base styles mirroring sidebar
- Create `InfoContentService.js` (module loading, caching, basic search)
- Create `InfoPanel.js` shell (collapse/expand, toggle button)
- Add HTML structure to `index.html`
- Wire up in `workspace.js`

**Deliverable:** Empty collapsible panel visible on right side

### Phase 2: Article Display
- Create `getting-started.json` with welcome content
- Create `InfoArticle.js` component (summary, body, parameterImpact rendering)
- Create example `segmentation.json` with ~5 test articles
- Implement `showArticle(articleId)` in InfoPanel
- Show getting-started by default when panel opens

**Deliverable:** Articles display correctly in panel

### Phase 3: Search Functionality
- Create `InfoSearch.js` component (input, 250ms debounce, dropdown)
- Implement search algorithm (title/summary/tag/body weighting)
- Add search highlighting in results
- Wire search results to article display

**Deliverable:** Functional search with ranked results

### Phase 4: Glossary Navigation
- Create `InfoGlossary.js` component (collapsible header, A-Z list)
- Generate `glossary-index.json` from articles
- Wire glossary term clicks to article display

**Deliverable:** Expandable A-Z glossary

### Phase 5: Help Icons & Integration
- Create `.help-icon` CSS styles
- Implement global click handler for help icons
- Add help icons to Segmentation module (step titles, params)
- Auto-expand panel when help icon clicked

**Deliverable:** Help icons visible and functional in Segmentation

### Phase 6: Content Authoring & Polish
- Write remaining segmentation articles (~25-45)
- Implement "See Also" section (manual + auto-generated)
- Add loading states and error handling
- Dark mode theming
- Performance optimization

**Deliverable:** Complete info panel system

---

## Files to Modify

| File | Changes |
|------|---------|
| `public/workspace/index.html` | Add info panel HTML structure |
| `public/workspace/js/workspace.js` | Initialize InfoPanel, global click handler |
| `public/workspace/js/core/StateManager.js` | Add `infoPanel` state section |
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | Add `data-info-id` attributes |

## Files to Create

| File | Purpose |
|------|---------|
| `public/workspace/css/info-panel.css` | Panel styling |
| `public/workspace/js/core/components/InfoPanel.js` | Main panel component |
| `public/workspace/js/core/components/InfoSearch.js` | Search functionality |
| `public/workspace/js/core/components/InfoGlossary.js` | A-Z glossary |
| `public/workspace/js/core/components/InfoArticle.js` | Article renderer |
| `public/workspace/js/services/InfoContentService.js` | Content loading/caching |
| `public/workspace/content/getting-started.json` | Welcome article |
| `public/workspace/content/modules/segmentation.json` | Segmentation articles |
| `public/workspace/content/glossary-index.json` | A-Z index |

---

## Search Algorithm

Custom weighted scoring (no external library):
1. Tokenize query into words
2. For each article:
   - Title match: weight 10
   - Summary match: weight 5
   - Tag match: weight 3
   - Body match: weight 1
3. Sort by score descending
4. Return top 10-15 results

---

## Testing Checklist

- [ ] Panel expands/collapses via toggle button
- [ ] Help icon click opens panel and shows correct article
- [ ] Search finds articles by title, summary, tags, body
- [ ] Search results rank correctly
- [ ] Glossary expands and shows all terms
- [ ] Clicking glossary term navigates to article
- [ ] "See Also" shows manual + auto-generated links
- [ ] Works in both light and dark mode
- [ ] Panel width matches sidebar (280px)
