# Documentation Guides Plan

## Overview

Create documentation guides for the image processing workspace stored in `/docs/user_guides/`.

**Target Audience:** Intermediate users with some technical background
**Link Format:** Custom protocol `info:article-id` for help article references
**Visuals:** Screenshot placeholders with descriptions
**Parameters:** Brief summaries, defer to help articles for details
**Versioning:** Include changelog section in each guide

---

## Proposed Templates

### 1. General Guide Template

```markdown
---
title: [Guide Title]
lastUpdated: YYYY-MM-DD
audience: Intermediate users
module: [module-name or "workspace"]
---

# [Guide Title]

[1-2 sentence introduction explaining what this guide covers and what the user will accomplish]

![Screenshot: Overview of the feature/module interface](screenshots/placeholder-overview.png)
*Caption: Brief description of what the screenshot shows*

---

## Prerequisites (if applicable)

> **Before you start**, ensure you have:
> - [Prerequisite 1]
> - [Prerequisite 2]

---

## Quick Start

[Brief 3-5 step summary for users who want to get started quickly]

1. **Step name** — One-line description
2. **Step name** — One-line description
3. **Step name** — One-line description

---

## Detailed Guide

### [Section 1: First Major Task]

[Explanation of this section's purpose]

![Screenshot: Relevant UI element](screenshots/placeholder-section1.png)

#### [Subsection if needed]

[Detailed instructions with UI element references]

| UI Element | Description |
|------------|-------------|
| **Button/Field Name** | What it does |
| **Button/Field Name** | What it does |

> **Tip:** [Helpful tip for this section]

For more details, see [Article Title](info:article-id).

---

### [Section 2: Next Major Task]

[Continue pattern...]

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| [Common problem] | [How to resolve] |
| [Common problem] | [How to resolve] |

---

## Related Help Articles

- [Article Title](info:article-id) — Brief description of relevance
- [Article Title](info:article-id) — Brief description of relevance

---

## Next Steps

After completing this guide, you may want to:
- [Suggested next action with link]
- [Suggested next action with link]

---

## Changelog

| Date | Changes |
|------|---------|
| YYYY-MM-DD | Initial version |
```

---

### 2. Module Guide Template

```markdown
---
title: [Module Name] Module Guide
lastUpdated: YYYY-MM-DD
audience: Intermediate users
module: [module-id]
---

# [Module Name] Module Guide

[1-2 sentence description of the module's purpose and what users will accomplish]

For a conceptual overview, see [Module Overview](info:module-id).

![Screenshot: Module interface overview](screenshots/placeholder-module-overview.png)
*Caption: The [Module Name] module interface showing [key areas]*

---

## Prerequisites (if applicable)

> **Before using this module**, ensure you have:
> - [Required input files/data]
> - [Prior steps completed]

---

## Quick Start

1. **Launch module** — Click "[Module Name]" from the workspace hub
2. **[Key step]** — Brief description
3. **[Key step]** — Brief description
4. **[Key step]** — Brief description
5. **Review results** — Brief description

---

## Step-by-Step Guide

### Step 1: [Step Name]

[Purpose of this step]

![Screenshot: Step 1 interface](screenshots/placeholder-step1.png)

#### Input Options

| Option | Description | When to Use |
|--------|-------------|-------------|
| **[Option 1]** | What it does | Use case |
| **[Option 2]** | What it does | Use case |

#### Actions

- **[Button/Action]** — What it does
- **[Button/Action]** — What it does

> **Note:** [Important consideration for this step]

For more details, see [Relevant Article](info:module.step1).

**Click "Next" to proceed to Step 2.**

---

### Step 2: [Step Name]

[Purpose of this step]

![Screenshot: Step 2 interface](screenshots/placeholder-step2.png)

#### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| **[Param Name]** | Brief description. See [Param Article](info:module.config.param-name). | [value] |
| **[Param Name]** | Brief description. See [Param Article](info:module.config.param-name). | [value] |

#### Decisions

**[Decision Point]:**
- **Option A** — Choose when [condition]. Results in [outcome].
- **Option B** — Choose when [condition]. Results in [outcome].

> **Tip:** [Practical advice for this step]

**Click "Start [Process]" to begin.**

---

### Step 3: [Processing/Progress Step]

[What happens during processing]

![Screenshot: Progress interface](screenshots/placeholder-progress.png)

#### Progress Indicators

- **[Indicator]** — What it shows
- **[Indicator]** — What it shows

#### What to Expect

- Processing time: [typical duration/factors]
- [Other expectations]

> **Warning:** [Any cautions, e.g., "Do not close the browser during processing"]

---

### Step 4: [Results Step]

[What the results show]

![Screenshot: Results interface](screenshots/placeholder-results.png)

#### Understanding Your Results

| Result Element | Description |
|----------------|-------------|
| **[Element]** | What it shows/means |
| **[Element]** | What it shows/means |

#### Actions Available

- **[Action]** — What it does (e.g., "Download" — saves results to your computer)
- **[Action]** — What it does

For interpreting results, see [Results Article](info:module.results).

---

## Output Files

| File | Description | Location |
|------|-------------|----------|
| **[filename.ext]** | What it contains | Where to find it |
| **[filename.ext]** | What it contains | Where to find it |

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| [Problem description] | [Why it happens] | [How to fix] |
| [Problem description] | [Why it happens] | [How to fix] |

---

## Related Help Articles

**Module Concepts:**
- [Article Title](info:article-id)

**Parameters:**
- [Article Title](info:article-id)

**Data & Results:**
- [Article Title](info:article-id)

---

## Next Steps

After using this module, you can:
- **[Next module/action]** — [Why/when to do this]
- **[Next module/action]** — [Why/when to do this]

---

## Changelog

| Date | Changes |
|------|---------|
| YYYY-MM-DD | Initial version |
```

---

## File Structure Plan

```
/docs/user_guides/
├── README.md                      # Index of all guides
├── TEMPLATE_GENERAL.md            # General guide template
├── TEMPLATE_MODULE.md             # Module guide template
├── modules/
│   ├── segmentation.md            # Segmentation module guide
│   ├── denoising-dl.md            # DL Denoising module guide
│   ├── denoising-filter.md        # Filter Denoising module guide
│   ├── annotation.md              # Annotation module guide
│   ├── mesh.md                    # Mesh generation module guide
│   ├── visualization.md           # 3D Visualization module guide
│   └── imageviewer.md             # Image Viewer module guide
├── file-browser.md                # File Browser guide
└── help-navigation.md             # Help & Info panel navigation guide
```

---

## Implementation Order

### Phase 1 (Current Focus)
1. Create templates (TEMPLATE_GENERAL.md, TEMPLATE_MODULE.md)
2. Write File Browser guide (using general template)
3. **Review checkpoint** — User reviews templates and guide, makes adaptations

### Phase 2 (After Review)
4. Create README.md index
5. Write Help Navigation guide (using general template)
6. Write module guides (order by complexity):
   - Image Viewer (simplest)
   - Visualization
   - Annotation
   - Filter Denoising
   - Mesh Generation
   - DL Denoising
   - Segmentation (most complex)

---

## Guide-Specific Notes

### File Browser Guide
Will use the **General Template** with sections covering:
- Interface overview (file tree, toolbar, details panel)
- Navigation (expanding folders, selecting files)
- File operations (upload, download, delete, rename)
- Batch operations (multi-select, bulk download as ZIP)
- File metadata display
- Thumbnail previews
- Context menus

### Help Navigation Guide
Will use the **General Template** with sections covering:
- Opening the help panel
- Using the search bar (full-text search)
- Browsing the glossary (alphabetical navigation)
- Reading articles (formatting, sections)
- Using "See Also" links for related content
- Context-sensitive help (clicking help icons)

### Module Guides
Each will use the **Module Template** with customizations:
- **Segmentation**: 4-5 steps (upload, config, train, inference, results)
- **DL Denoising**: 3-4 steps (upload, config, process, results)
- **Filter Denoising**: 2-3 steps (upload, config+process, results)
- **Annotation**: 3 steps (load image, annotate, save)
- **Mesh**: 3 steps (select segmentation, generate, view)
- **Visualization**: 2 steps (load mesh, interact)
- **Image Viewer**: 2 steps (select file, browse)

---

## Verification Plan

After writing guides:
1. Verify all `info:article-id` references match actual article IDs in manifest.json
2. Check screenshot placeholder paths are consistent
3. Ensure all modules are covered
4. Cross-reference with actual UI to confirm accuracy
