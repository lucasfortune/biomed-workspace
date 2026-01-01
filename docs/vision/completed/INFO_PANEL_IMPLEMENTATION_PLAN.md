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

## Design System Alignment (ADR-005)

**Reference:** `/docs/decisions/005_design_system_color_scheme.md`

### Required: Use CSS Custom Properties

**Never hardcode colors.** Always use design tokens:

```css
/* Correct */
.ip-panel {
  background-color: var(--bg-tertiary);
  border-left: 1px solid var(--border-color);
}

/* Wrong */
.ip-panel {
  background-color: #E9ECEF;
  border-left: 1px solid #DEE2E6;
}
```

### Token Mapping for Info Panel

| Element | Token | Rationale |
|---------|-------|-----------|
| Panel background | `--bg-tertiary` | Matches sidebar |
| Panel border | `--border-color` | Default borders |
| Header text | `--text-primary` | Main headings |
| Article body text | `--text-primary` | Readable content |
| Secondary text (meta) | `--text-secondary` | Labels, categories |
| Search input bg | `--bg-secondary` | Form inputs |
| Search input border | `--border-color` | Default borders |
| Search highlight | `--accent-muted` | Subtle highlight |
| Glossary term hover | `--accent-muted` | Consistent hover |
| See Also links | `--accent-primary` | Clickable links |
| See Also hover | `--accent-hover` | Link hover state |
| Category badges | `--bg-secondary` + `--text-secondary` | Subtle badges |
| Parameter impact box | `--info-color` (border) | Informational callout |

### Light/Dark Mode Support

Dark mode is applied via `data-theme="dark"` on `<html>`. CSS automatically inherits correct values:

```css
/* No theme-specific code needed - tokens handle it */
.ip-article-title {
  color: var(--text-primary);  /* #343A40 in light, #F8F9FA in dark */
}
```

### Help Icon: SVG Required

Per ADR-005, use inline SVG icons (not emoji or text "?"):

```html
<!-- Help icon SVG (question mark in circle) -->
<span class="help-icon" data-info-id="article.id" title="Learn more">
  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
  </svg>
</span>
```

**Icon styling:**
```css
.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.help-icon:hover {
  color: var(--accent-primary);
}
```

### Toggle Button Icon

Use SVG for panel toggle (book/info icon), matching sidebar toggle pattern:

```css
.ip-toggle {
  background-color: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.ip-toggle:hover {
  color: var(--accent-primary);
  border-color: var(--accent-muted);
}
```

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
    <!-- Book/help icon SVG per ADR-005 -->
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
    </svg>
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
- Verify light/dark mode (should work automatically via tokens)
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

### Functional
- [ ] Panel expands/collapses via toggle button
- [ ] Help icon click opens panel and shows correct article
- [ ] Search finds articles by title, summary, tags, body
- [ ] Search results rank correctly
- [ ] Glossary expands and shows all terms
- [ ] Clicking glossary term navigates to article
- [ ] "See Also" shows manual + auto-generated links
- [ ] Panel width matches sidebar (280px)

### Design System Compliance (ADR-005)
- [ ] No hardcoded colors in CSS (all use tokens)
- [ ] Light mode: all text readable, proper contrast
- [ ] Dark mode: all text readable, proper contrast
- [ ] Icons are SVG (not emoji/text)
- [ ] Hover states use `--accent-muted` or `--accent-hover`
- [ ] Panel styling mirrors sidebar visually
