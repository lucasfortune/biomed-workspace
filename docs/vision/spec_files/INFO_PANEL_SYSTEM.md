# 📋 Product Specification: Educational Info Panel System

**Version:** 1.0.0  
**Author:** Lucas
**Date:** 2025-12-31  



## 📋 Document Overview

This specification defines a context-sensitive educational help system for the biomedical image processing workspace. The system provides accessible explanations for all methods, parameters, and concepts — targeting biologists who need to use advanced image processing tools without deep technical backgrounds.

---

## 🎯 Goals & Objectives

### Primary Goals

- Provide in-context educational content for ~200+ explainable elements across all workspace modules
- Make complex image processing concepts accessible to non-technical users
- Explain parameter impacts clearly (e.g., "Increasing this value sharpens edges but may amplify noise")
- Create a consistent, discoverable help experience throughout the workspace

### Target Users

Biologists and researchers who:
- Understand *what* they want to achieve (e.g., segment cells, denoise an image)
- May not understand *how* methods work or *why* parameters matter
- Need guidance on parameter selection and method trade-offs

---

## 🖼️ User Interface Specification

### Panel Layout & Position

The info panel appears on the **right side** of the workspace, mirroring the file browser on the left. Both panels should have matching width and visual styling for symmetry.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Top Toolbar                             │
├──────────┬────────────────────────────────────┬─────────────────┤
│          │                                    │                 │
│  File    │                                    │     Info        │
│  Browser │       Main Workspace Area          │     Panel       │
│  (left)  │                                    │     (right)     │
│          │      [Modules, Viewer, etc.]       │                 │
│          │                                    │                 │
│ [collap- │                                    │   [collapsible] │
│  sible]  │                                    │                 │
└──────────┴────────────────────────────────────┴─────────────────┘
```

### Panel Structure (Top to Bottom)

#### 1. Header Section
- Collapse/expand toggle button
- Panel title: "Info" or similar
- Minimal height, always visible when panel is open

#### 2. Navigation Section

**Glossary Component:**
- Collapsed by default
- Expandable downward when clicked
- Alphabetical listing of all terms (A-Z sections or flat list)
- Clicking any term loads its article in the content area below
- Should collapse automatically when an article is loaded (optional, evaluate during implementation)

**Search Bar:**
- Always visible below glossary
- Placeholder text: "Search topics..."
- Search results appear in a dropdown/list below the search bar as user types
- Results should search both titles and full content text
- Title matches should rank higher than content-only matches
- Clicking a result loads that article and clears search

#### 3. Content Area

**Article Display:**
- Scrollable container for article content
- Supports three content depths:
  - **Short**: 1-2 sentences (tooltip-level)
  - **Medium**: 1-3 paragraphs, possibly with images (most common)
  - **Full**: Multiple sections, detailed explanations (rare)

**"See Also" Section:**
- Appears at bottom of article content
- Header: "See Also" or "Related Topics"
- List of clickable links to related articles
- Links are a combination of:
  - Manually curated references (defined per article)
  - Auto-generated suggestions (based on shared tags/categories)
- Clicking a link replaces current article with the linked article

### Default/Empty State

When the info panel is open but no ? icon has been clicked:
- Display a "Getting Started" overview article
- This article should introduce the info system itself
- Explain how to use ? icons throughout the workspace
- Optionally highlight key concepts or link to fundamental topics

### Panel Behavior

| Trigger | Behavior |
|---------|----------|
| Click ? icon anywhere in workspace | Panel auto-expands (if collapsed) and displays relevant article |
| Click collapse button | Panel collapses to minimal width or hides entirely |
| Click glossary term | Loads term's article in content area |
| Click search result | Loads article, clears search input |
| Click "See Also" link | Replaces current article with linked article |
| Panel already open + click new ? icon | Content replaces (no stacking/history) |

---

## 🔘 Question Mark Icon Specification

### Placement

Question mark icons should appear adjacent to any explainable element:

- **Module level**: Next to module titles/headers (e.g., "Denoising Module (?)")
- **Method level**: Next to method names within modules (e.g., "Gaussian Blur (?)")
- **Parameter level**: Next to parameter labels (e.g., "Kernel Size (?)")
- **Process level**: Next to process steps or workflow stages
- **UI elements**: Next to any non-obvious interface elements

### Icon Design

- Small, unobtrusive, consistent size throughout workspace
- Visually distinct but not distracting (e.g., muted color, subtle outline)
- Hover state should indicate clickability
- Should not interfere with primary interactions

### Icon Data Attribute

Each ? icon must carry an identifier linking it to its corresponding article:

```
[? icon] data-info-id="denoising.gaussian-blur.kernel-size"
```

The identifier structure should follow a consistent naming convention (see Content Schema below).

---

## 📚 Content Schema

### Article Data Structure

Each article should be stored as a structured object (JSON or equivalent):

```json
{
  "id": "denoising.gaussian-blur.kernel-size",
  "title": "Kernel Size",
  "category": "parameters",
  "tags": ["denoising", "gaussian-blur", "filter", "spatial"],
  "parentModule": "denoising",
  "contentType": "medium",
  "content": {
    "summary": "Controls the size of the neighborhood used for averaging pixel values.",
    "body": "The kernel size determines how many neighboring pixels...",
    "parameterImpact": "Larger values = stronger smoothing but more detail loss. Smaller values = subtle smoothing, preserves edges better."
  },
  "seeAlsoManual": ["denoising.gaussian-blur", "concepts.convolution-kernels"],
  "seeAlsoTags": ["filter", "kernel"]
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier, used by ? icons to reference this article |
| `title` | string | Yes | Display title shown in panel and search results |
| `category` | string | Yes | Classification: "module", "method", "parameter", "concept", "process" |
| `tags` | array | Yes | Keywords for search and auto-generating "See Also" links |
| `parentModule` | string | No | Which module this belongs to (for organization) |
| `contentType` | string | Yes | "short", "medium", or "full" — indicates expected content depth |
| `content.summary` | string | Yes | 1-2 sentence overview (always shown) |
| `content.body` | string | No | Extended explanation (for medium/full types) |
| `content.parameterImpact` | string | No | For parameters: what changing this value does |
| `content.images` | array | No | Paths to illustrative images if needed |
| `seeAlsoManual` | array | No | Manually curated related article IDs |
| `seeAlsoTags` | array | No | Tags used to auto-find related articles |

### ID Naming Convention

Use dot-notation hierarchy:

```
{module}.{method}.{parameter}
{module}.{method}
{module}
concepts.{concept-name}
processes.{process-name}
```

**Examples:**
- `denoising` — The denoising module itself
- `denoising.gaussian-blur` — Gaussian blur method
- `denoising.gaussian-blur.kernel-size` — Kernel size parameter
- `denoising.deep-learning.model-selection` — Model selection parameter
- `concepts.segmentation-fundamentals` — General concept article
- `processes.annotation-workflow` — Process explanation

### Content Storage

All articles stored in JSON or Markdown files:

```
/content/
  /modules/
    denoising.json
    segmentation.json
    annotation.json
    viewer.json
    mesh-generation.json
    visualization-3d.json
  /concepts/
    fundamentals.json
    image-processing-basics.json
  /processes/
    workflows.json
  glossary-index.json
  getting-started.json
```

Alternative: Single large JSON file if preferred for simplicity during authoring.

---

## 🔍 Search Specification

### Search Behavior

- **Trigger**: User types in search bar
- **Debounce**: Wait ~200-300ms after typing stops before searching
- **Minimum characters**: 2-3 characters before search activates

### Search Scope & Ranking

Search should query:
1. Article titles
2. Article summaries
3. Article body content
4. Tags

**Ranking priority (highest to lowest):**
1. Exact title match
2. Title contains search term
3. Summary contains search term
4. Tags contain search term
5. Body contains search term

### Results Display

- Show below search bar as a dropdown list
- Display: Title + category badge + brief snippet (if match is in body)
- Limit visible results (e.g., 10-15 max, scrollable if more)
- Highlight matching text in results
- "No results found" message if empty

---

## 🔗 "See Also" Generation

### Manual Links

Defined per article in `seeAlsoManual` array. These are explicit editorial choices for what's most relevant.

### Auto-Generated Links

Based on `seeAlsoTags` array:
1. Find all articles sharing at least one tag
2. Rank by number of shared tags
3. Exclude current article
4. Take top N results (e.g., 3-5)

### Combined Display

- Show manual links first (if any)
- Then show auto-generated links
- Deduplicate (if a manual link would also appear in auto-generated)
- Cap total "See Also" links at reasonable number (e.g., 5-8)

---

## 📝 Content Guidelines

### Writing Style

- **Audience**: Assume no prior image processing knowledge
- **Tone**: Clear, helpful, non-condescending
- **Voice**: Second person ("You can adjust..." not "The user can adjust...")
- **Length**: As short as possible while still being complete

### Parameter Impact Format

For parameter explanations, include a clear cause-effect statement:

**Format**: "[Increasing/Decreasing] this value [causes what effect]. [Trade-off or consideration]."

**Examples:**
- "Increasing the kernel size produces stronger smoothing but may blur fine details and edges."
- "Lower threshold values will detect more edges but may include noise artifacts."
- "Higher iteration counts improve accuracy but significantly increase processing time."

### Content Types Guide

**Short (tooltip-level):**
- Use for: Simple parameters, self-explanatory elements
- Length: 1-2 sentences
- Example: "The output format for exported files. PNG preserves transparency, JPEG reduces file size."

**Medium (standard explanation):**
- Use for: Most methods, important parameters, concepts
- Length: 1-3 paragraphs
- Include: What it is, why it matters, how to use it, parameter impact if applicable

**Full (detailed article):**
- Use for: Complex methods, fundamental concepts, module overviews
- Length: Multiple sections
- Include: Background, detailed explanation, examples, common pitfalls, related concepts

---

## ✅ Acceptance Criteria

### Functional Requirements

- [ ] Clicking any ? icon opens info panel and displays correct article
- [ ] Panel auto-expands when collapsed and ? icon is clicked
- [ ] Panel collapse/expand works correctly
- [ ] Glossary displays all terms alphabetically
- [ ] Clicking glossary term loads its article
- [ ] Search returns relevant results ranked appropriately
- [ ] Search matches titles, summaries, body text, and tags
- [ ] "See Also" displays both manual and auto-generated links
- [ ] Clicking "See Also" link replaces current article
- [ ] Default state shows "Getting Started" article
- [ ] Panel width matches file browser width

### Content Requirements

- [ ] All modules have overview articles
- [ ] All methods have explanation articles
- [ ] All parameters have articles with impact descriptions
- [ ] Key concepts have standalone articles
- [ ] All articles have appropriate tags for search and "See Also"
- [ ] "Getting Started" article exists and introduces the system

---

## 📎 Additional Notes

- Content authoring will be done directly in JSON/Markdown files — no CMS interface needed
- No offline support required
- Panel does not maintain navigation history — each click replaces content

---
