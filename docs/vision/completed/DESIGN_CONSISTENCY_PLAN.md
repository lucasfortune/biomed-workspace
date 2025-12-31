# Design Consistency Plan: Physics of Parasitism Color Scheme

**Document Type:** Design Plan
**Status:** Ready for Implementation
**Created:** 2025-12-31

---

## Overview

Unify the workspace version's visual identity with the "Physics of Parasitism" branding while maintaining a clean, professional biomedical imaging aesthetic.

**Scope:** Workspace version only (`/public/workspace/`)
**Constraint:** Colors and icons ONLY - NO layout changes

---

## Color Palette

### Primary Brand Colors (from PoP Logo)
| Color | Hex | Usage |
|-------|-----|-------|
| PoP Red | `#EB1F17` | Primary accent, CTAs, important actions |
| PoP Green | `#1DA924` | Success states, secondary accent |
| PoP Black | `#000000` | Text (dark mode backgrounds) |

### Extended Palette (Biomedical/Clinical)
| Color | Hex | Usage |
|-------|-----|-------|
| Clinical White | `#FFFFFF` | Light mode background |
| Off-White | `#F8F9FA` | Light mode secondary background |
| Light Gray | `#E9ECEF` | Borders, dividers (light mode) |
| Medium Gray | `#6C757D` | Secondary text |
| Dark Gray | `#343A40` | Primary text (light mode) |
| Near Black | `#1A1A1A` | Dark mode background |
| Dark Surface | `#2D2D2D` | Dark mode cards/panels |

### Semantic Colors
| State | Light Mode | Dark Mode |
|-------|------------|-----------|
| Primary Action | `#EB1F17` (PoP Red) | `#EB1F17` |
| Success | `#1DA924` (PoP Green) | `#28A745` |
| Warning | `#FFC107` | `#FFD93D` |
| Error | `#DC3545` | `#FF6B6B` |
| Info | `#17A2B8` | `#4ECDC4` |

---

## CSS Custom Properties Structure

### Theme Variables (workspace.css)

```css
:root {
  /* Light mode (default) */
  --bg-primary: #FFFFFF;
  --bg-secondary: #F8F9FA;
  --bg-tertiary: #E9ECEF;

  --text-primary: #343A40;
  --text-secondary: #6C757D;
  --text-muted: #ADB5BD;

  --border-color: #DEE2E6;
  --border-light: #E9ECEF;

  --accent-primary: #EB1F17;    /* PoP Red */
  --accent-secondary: #1DA924;  /* PoP Green */
  --accent-hover: #C91810;      /* Darker red for hover */

  --success: #1DA924;
  --warning: #FFC107;
  --error: #DC3545;
  --info: #17A2B8;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
}

[data-theme="dark"] {
  --bg-primary: #1A1A1A;
  --bg-secondary: #2D2D2D;
  --bg-tertiary: #3D3D3D;

  --text-primary: #F8F9FA;
  --text-secondary: #ADB5BD;
  --text-muted: #6C757D;

  --border-color: #4D4D4D;
  --border-light: #3D3D3D;

  --accent-primary: #EB1F17;
  --accent-secondary: #28A745;
  --accent-hover: #FF3B30;

  --success: #28A745;
  --warning: #FFD93D;
  --error: #FF6B6B;
  --info: #4ECDC4;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.3);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.4);
}
```

---

## Icon Replacement Plan

### Module Icons (registry.js)

Replace emojis with filled/solid SVG icons:

| Module | Current Emoji | New Icon | Icon Description |
|--------|---------------|----------|------------------|
| Denoising | 🔊 | `<svg>` | Sound wave / signal processing icon |
| Annotation | ✏️ | `<svg>` | Pencil / pen icon |
| Segmentation | 🧩 | `<svg>` | Puzzle piece / grid segments icon |
| Image Viewer | 🖼️ | `<svg>` | Image frame / picture icon |
| Mesh Generation | 🎯 | `<svg>` | 3D cube / mesh wireframe icon |
| Visualization | 👁️ | `<svg>` | Eye / view icon |

### Icon Style Guidelines
- **Style:** Filled/solid (not outlined)
- **Size:** 24x24px base, scales with CSS
- **Color:** Inherit from CSS (`currentColor`)
- **Format:** Inline SVG in registry.js or separate SVG files

### SVG Icons (to be created)

```javascript
// Example icon definitions for registry.js
const moduleIcons = {
  denoising: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,

  annotation: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,

  segmentation: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zm-9 9h7v7H4v-7zm9 0h7v7h-7v-7z"/></svg>`,

  imageviewer: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,

  mesh: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,

  visualization: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
};
```

---

## Files to Modify

### 1. CSS Files

| File | Changes |
|------|---------|
| `public/workspace/css/workspace.css` | Add CSS custom properties, update all color values |
| `public/workspace/css/modules/*.css` | Update to use CSS variables |
| `public/welcome.css` | Update to match new color scheme |
| `public/login.css` | Update to match new color scheme |

### 2. JavaScript Files

| File | Changes |
|------|---------|
| `public/workspace/js/modules/registry.js` | Replace emoji icons with SVG strings |
| `public/workspace/js/workspace.js` | Add theme toggle functionality |

### 3. HTML Files

| File | Changes |
|------|---------|
| `public/workspace/index.html` | Add theme toggle button, set default theme |
| `public/welcome.html` | Update to use new color scheme |

---

## Implementation Steps

### Phase 1: CSS Foundation
1. Add CSS custom properties to workspace.css (light mode as default)
2. Add dark mode variables under `[data-theme="dark"]`
3. Replace all hardcoded colors with CSS variables

### Phase 2: Icon Replacement
1. Create/source SVG icons for all 6 modules
2. Update registry.js to use SVG strings instead of emojis
3. Update module card rendering to display SVG icons

### Phase 3: Theme Toggle
1. Add theme toggle button to workspace header
2. Implement JavaScript for theme switching
3. Persist theme preference in localStorage

### Phase 4: Entry Pages
1. Update welcome.html colors
2. Update login.css colors
3. Ensure consistency across all entry points

---

## Theme Toggle Implementation

### HTML (workspace/index.html header)
```html
<button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme">
  <svg class="sun-icon">...</svg>
  <svg class="moon-icon">...</svg>
</button>
```

### JavaScript (workspace.js)
```javascript
initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}
```

---

## Notes

- Light mode is the DEFAULT (no `data-theme` attribute needed for light)
- Dark mode activated via `data-theme="dark"` on `<html>` element
- All module-specific CSS files should inherit from workspace.css variables
- SVG icons use `currentColor` to inherit text color automatically
- NO layout changes - preserve all existing positioning, spacing, sizing
