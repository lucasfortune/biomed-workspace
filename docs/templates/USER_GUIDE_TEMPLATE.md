<!-- This File contains two templates for User Guides -->
<!-- 1. General User Guide (File Browser, Inof&Help Section, General Navigation, ...): -->
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

<!--
IMPORTANT: Verify all article references before publishing!

1. Check that each article ID exists in: public/workspace/content/manifest.json
2. Use the exact article ID from the manifest (e.g., "annotation.step2.classes" not "annotation.step2.class-management")
3. Use the exact title from the manifest's "title" or "displayTitle" field
4. You can list all article IDs with: grep '"id":' public/workspace/content/manifest.json

Common article ID patterns:
- Module overview: [module-id] (e.g., "annotation", "mesh", "segmentation")
- Step articles: [module-id].step[N].[topic] (e.g., "annotation.step1.source-image")
- Config/params: [module-id].config.[param] (e.g., "segmentation.config.patch-size")
- File browser: file-browser.[topic] (e.g., "file-browser.upload", "file-browser.categories")
-->

- [Article Title](info:article-id) — Brief description of relevance
- [Article Title](info:article-id) — Brief description of relevance

---

## Next Steps

After completing this guide, you may want to:
- [Suggested next action with link]
- [Suggested next action with link]

---

*Written for Workspace Version X.X.X*

<!-- 2. Module User Guide (For all existing and future modules):) -->
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

<!--
IMPORTANT: Verify all article references before publishing!

1. Check that each article ID exists in: public/workspace/content/manifest.json
2. Use the exact article ID from the manifest (e.g., "annotation.step2.classes" not "annotation.step2.class-management")
3. Use the exact title from the manifest's "title" or "displayTitle" field
4. You can list all article IDs with: grep '"id":' public/workspace/content/manifest.json

Common article ID patterns:
- Module overview: [module-id] (e.g., "annotation", "mesh", "segmentation")
- Step articles: [module-id].step[N].[topic] (e.g., "annotation.step1.source-image")
- Config/params: [module-id].config.[param] (e.g., "segmentation.config.patch-size")
-->

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

*Written for Workspace Version X.X.X*
