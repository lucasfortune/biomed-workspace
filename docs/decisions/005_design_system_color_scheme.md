# ADR-005: Design System and Physics of Parasitism Color Scheme

**Date:** 2024-12-31
**Status:** Accepted
**Deciders:** Development Team
**Tags:** design, ui, theming, accessibility, branding

---

## Context

### Problem Statement

The Workspace version lacked visual consistency and brand alignment. The application needed:
- **Brand alignment** with Physics of Parasitism (PoP) visual identity
- **Light/dark mode** support with user preference persistence
- **Consistent color tokens** across all modules and components
- **Professional iconography** replacing emoji icons for better visual consistency
- **Accessible color contrasts** in both light and dark themes

### Background

**Original State:**
- Mixed colors without clear system
- Dark theme only (no light mode option)
- Emoji icons on module cards (inconsistent rendering across platforms)
- Per-module card colors on hover (no unified system)
- Inconsistent styling across modules

**Requirements:**
- Align with Physics of Parasitism branding (Red #EB1F17, Green #1DA924)
- Support both light (default) and dark modes
- Use CSS custom properties for maintainability
- Replace emojis with SVG icons for consistency
- Only change colors and icons - NO layout changes
- Apply to Workspace version only (not Classic)

---

## Decision

**We have decided to implement a comprehensive design token system using CSS custom properties, with Physics of Parasitism brand colors and light/dark theme support.**

### Color Palette

**Brand Colors (Primary):**
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--accent-primary` | #EB1F17 | #EB1F17 | Primary actions, active states, branding |
| `--accent-secondary` | #1DA924 | #28A745 | Success states, secondary accents |
| `--accent-hover` | #C91810 | #FF3B30 | Primary color hover state |
| `--accent-muted` | #E88A86 | #E88A86 | Subtle accents, disabled-like states, card hovers |

**Background Colors:**
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--bg-primary` | #FFFFFF | #1A1A1A | Main content background |
| `--bg-secondary` | #F8F9FA | #2D2D2D | Cards, panels |
| `--bg-tertiary` | #E9ECEF | #3D3D3D | Sidebar, nested panels |

**Text Colors:**
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--text-primary` | #343A40 | #F8F9FA | Main text, headings |
| `--text-secondary` | #6C757D | #ADB5BD | Secondary text, labels |
| `--text-muted` | #ADB5BD | #6C757D | Placeholder text, hints |
| `--text-on-accent` | #FFFFFF | #FFFFFF | Text on accent backgrounds |

**Border Colors:**
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--border-color` | #DEE2E6 | #4D4D4D | Default borders |
| `--border-light` | #E9ECEF | #3D3D3D | Subtle dividers |

**Semantic Colors:**
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--success-color` | #1DA924 | #28A745 | Success messages, completed states |
| `--warning-color` | #FFC107 | #FFD93D | Warnings, pending states |
| `--danger-color` | #DC3545 | #FF6B6B | Errors, destructive actions |
| `--info-color` | #17A2B8 | #4ECDC4 | Information, hints |

### Theme Implementation

**Default Theme:** Light mode (better for scientific/medical applications)

**Theme Toggle:**
- Persisted in `localStorage` under key `workspace-theme`
- Applied via `data-theme="dark"` attribute on `<html>` element
- Toggle button in sidebar with sun/moon icons

```css
/* Light mode (default) */
:root {
  --accent-primary: #EB1F17;
  --bg-primary: #FFFFFF;
  --text-primary: #343A40;
  /* ... */
}

/* Dark mode */
[data-theme="dark"] {
  --bg-primary: #1A1A1A;
  --text-primary: #F8F9FA;
  /* ... */
}
```

### Icon System

**Decision:** Replace emojis with inline SVG icons

**Rationale:**
- Consistent rendering across all platforms and browsers
- Can be styled with CSS (inherits `currentColor`)
- Better visual weight and professional appearance
- Accessible (screen reader compatible)

**Icon Style Guidelines:**
- Use filled/solid icons (not outline)
- 24x24 viewBox, scaled to 48x48 display
- Single color using `fill="currentColor"`
- Default fill: `--accent-primary`
- Hover fill: `--accent-muted`

**Module Icons:**
| Module | Icon | Description |
|--------|------|-------------|
| Denoising | Speaker/volume | Noise reduction concept |
| Annotation | Pencil/edit | Manual labeling |
| Segmentation | Puzzle piece | Image segmentation |
| Mesh Generation | 3D cube | 3D mesh creation |
| Visualization | Eye | 3D viewing |
| Image Viewer | Image/photo | Image display |

---

## Specific Design Decisions

### 1. Module Card Hover States

**Decision:** All module cards use the same muted accent color on hover

**Before:** Each card had unique hover color (inconsistent, not from palette)
**After:** All cards use `--accent-muted` (#E88A86) for:
- Border color on hover
- Top accent bar
- Icon color change

**Rationale:** Creates unified, cohesive appearance; reduces visual noise

### 2. Step Navigation Completed State

**Decision:** Completed steps use grey (#6a737d) instead of green

**Before:** Completed steps were dark green (`--module-success-text`)
**After:** Completed steps are grey (#6a737d)

**Rationale:**
- Green implies "success/good" which isn't the right semantic for "visited"
- Grey indicates "done/past" more neutrally
- Reserves green for actual success messages
- Creates cleaner visual hierarchy (active step stands out more)

### 3. Range Input Sliders

**Decision:** Consistent slider styling across all modules

**Implementation:**
- Track background: Gradient from primary color (filled portion) to border color (empty portion)
- Thumb: Circular, primary color with white border
- Dynamic fill: JavaScript updates gradient based on slider value

```css
.range-slider {
  background: linear-gradient(
    to right,
    var(--module-primary) 0%,
    var(--module-primary) 50%,  /* filled portion */
    var(--module-border) 50%,
    var(--module-border) 100%   /* empty portion */
  );
}
```

### 4. Title Text Colors

**Decision:** Titles use `--text-primary` (not `--text-on-accent`)

**Issue Found:** Titles were white in light mode (invisible on white background)
**Fix:** Changed from `--text-on-primary` to `--text-primary`

**Affected Elements:**
- `.welcome-header h1`
- `.module-card h3`

### 5. Theme Toggle Placement

**Decision:** Theme toggle button positioned beside "Back to Hub" button

**Implementation:** Flex row container with gap
```css
.quick-actions-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
```

---

## Files Modified

### Core Style Files

| File | Changes |
|------|---------|
| `workspace/css/workspace.css` | Complete color token system, theme toggle styles |
| `workspace/js/core/css/module-base.css` | Module-specific tokens aligned with main palette |

### Module-Specific Styles

| File | Changes |
|------|---------|
| `workspace/js/modules/visualization/css/visualization.css` | Opacity slider styling |

### JavaScript Files

| File | Changes |
|------|---------|
| `workspace/js/workspace.js` | Theme init/toggle methods |
| `workspace/js/modules/registry.js` | SVG icons replacing emojis |
| `workspace/js/modules/visualization/VisualizationModule.js` | Dynamic slider fill updates |

### HTML Files

| File | Changes |
|------|---------|
| `workspace/index.html` | Theme toggle button, quick-actions-row wrapper |

### Other Style Files

| File | Changes |
|------|---------|
| `css/welcome.css` | Dark gradient background, PoP button colors |
| `css/auth.css` | Dark gradient background, PoP accent colors |

---

## Consequences

### Positive

- **Brand Consistency:** Visual alignment with Physics of Parasitism identity
- **Accessibility:** Proper contrast ratios in both themes
- **Maintainability:** Single source of truth for colors (CSS variables)
- **User Preference:** Light/dark mode with persistence
- **Professional Appearance:** SVG icons render consistently everywhere
- **Extensibility:** New modules automatically inherit color system

### Negative

- **Migration Effort:** Existing custom colors in modules needed updating
  - **Mitigation:** Documented all token names for future reference

- **Browser Support:** CSS custom properties require modern browsers
  - **Acceptance:** Already targeting modern browsers (see ADR-001)

### Neutral

- **Light Mode Default:** Scientific/medical users may prefer light mode for accuracy
- **Color Token Learning:** Developers must learn token names
  - **Mitigation:** This documentation provides reference

---

## Usage Guidelines

### For New Modules

**Always use design tokens, never hardcode colors:**

```css
/* Good */
.my-element {
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

/* Bad */
.my-element {
  background-color: #F8F9FA;
  color: #343A40;
  border: 1px solid #DEE2E6;
}
```

### Token Selection Guide

| Need | Token |
|------|-------|
| Primary action button | `--accent-primary` |
| Button hover state | `--accent-hover` |
| Subtle/disabled accent | `--accent-muted` |
| Success message | `--success-color` |
| Error message | `--danger-color` |
| Main text | `--text-primary` |
| Secondary/label text | `--text-secondary` |
| Placeholder text | `--text-muted` |
| Text on colored backgrounds | `--text-on-accent` |
| Card/panel background | `--bg-secondary` |
| Sidebar background | `--bg-tertiary` |
| Default border | `--border-color` |

### Adding Theme Support to New Components

```javascript
// Check current theme
const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

// Listen for theme changes (if needed)
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === 'data-theme') {
      // Handle theme change
    }
  });
});
observer.observe(document.documentElement, { attributes: true });
```

---

## Validation

### Success Criteria

- [x] **Brand colors applied** - PoP Red/Green used throughout
- [x] **Light mode works** - All text readable, proper contrasts
- [x] **Dark mode works** - All text readable, proper contrasts
- [x] **Theme persists** - Preference saved in localStorage
- [x] **Icons consistent** - SVG icons render identically everywhere
- [x] **Module cards unified** - Same hover color on all cards
- [x] **Sliders styled** - Range inputs show filled portion
- [x] **No layout changes** - Only colors and icons changed

### Browser Testing

- [x] Chrome/Chromium
- [x] Firefox
- [ ] Safari (not tested, expected to work)
- [ ] Edge (not tested, expected to work)

---

## References

### Related ADRs

- [ADR-001](001_vanilla_js_over_framework.md) - Vanilla JS (CSS variables work natively)
- [ADR-004](004_module_system_design.md) - Module system (modules inherit design tokens)

### External Resources

- [CSS Custom Properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [WCAG Color Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [prefers-color-scheme Media Query](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)

---

## Notes

### Future Considerations

**System Theme Detection:**
```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Auto-apply dark mode if user hasn't set preference */
  }
}
```

**Additional Semantic Tokens:**
- `--focus-ring` for accessibility focus states
- `--disabled-opacity` for disabled elements
- `--transition-duration` for consistent animations

**Color Variants:**
Consider adding alpha variants for overlays:
- `--accent-primary-10` (10% opacity)
- `--accent-primary-20` (20% opacity)

### Color Accessibility Notes

**Contrast Ratios (approximate):**
- Light mode: `--text-primary` on `--bg-primary` = 11.5:1 (AAA)
- Dark mode: `--text-primary` on `--bg-primary` = 15.3:1 (AAA)
- Accent on white: `--accent-primary` on white = 4.5:1 (AA for large text)

---

**Navigation:**
← [ADR-004](004_module_system_design.md) | [All ADRs](.) | [Documentation Index](../INDEX.md) →

---

**Decision Lifecycle:**
- **Proposed:** December 2024
- **Accepted:** December 2024
- **Deprecated:** N/A
- **Superseded:** N/A

**Last Updated:** 2024-12-31
