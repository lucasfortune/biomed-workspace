# Welcome Page Redesign Plan

**Date:** 2026-01-01
**Status:** Approved for Implementation

## Overview

Rework the welcome page to a brutally minimal, Swiss-style clinical interface with embedded login/register forms, replacing the current version selection and legacy content.

## Design Direction

- **Aesthetic**: Clinical precision - ultra-clean, Swiss-style typography, stark whites
- **Focal Point**: Simplicity itself - dramatic contrast to the complex workspace
- **Theme**: Light mode default with dark mode toggle, using ADR-005 design tokens

## Final Structure

```
+-----------------------------------------------------------+
| [Theme Toggle]                        [PoP] [DFG]         |
|                                                           |
|                                                           |
|           Biomedical image processing platform            |
|    A complete web-based machine learning pipeline         |
|         for biomedical image analysis                     |
|                                                           |
|              +-------------------------+                  |
|              |  [Login] [Register]     |  <- tabs         |
|              +-------------------------+                  |
|              |  Username               |                  |
|              |  [____________________] |                  |
|              |  Password               |                  |
|              |  [____________________] |                  |
|              |                         |                  |
|              |  [ LOGIN BUTTON ]       |                  |
|              +-------------------------+                  |
|                                                           |
|   (When authenticated: "Welcome back, [Name]"             |
|    + Launch Workspace button + Logout)                    |
|                                                           |
+-----------------------------------------------------------+
```

## Files Modified

| File | Action |
|------|--------|
| `public/welcome.html` | Complete restructure - remove all legacy content |
| `public/css/welcome.css` | Complete restyle with design tokens |
| `public/js/welcome.js` | Refactor for embedded auth + theme toggle |

## Files Kept (no changes)

- `public/login.html` - Keep as fallback for direct URL access
- `public/register.html` - Keep as fallback for direct URL access
- Classic version codebase - Keep but not linked from welcome

## Design Tokens (from ADR-005)

### Light Mode (default)
- `--accent-primary`: #EB1F17 (PoP Red)
- `--bg-primary`: #FFFFFF
- `--text-primary`: #343A40
- `--border-color`: #DEE2E6

### Dark Mode
- `--bg-primary`: #1A1A1A
- `--text-primary`: #F8F9FA
- `--border-color`: #4D4D4D

## Typography

- **Title**: 2.5rem, weight 400, letter-spacing -0.02em
- **Tagline**: 1rem, weight 400, color secondary
- **Labels**: 0.75rem, weight 500, UPPERCASE, letter-spacing 0.05em
- **Buttons**: 0.875rem, weight 600, UPPERCASE
- **Font stack**: `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif`

## Logo Assets

- PoP: `/public/imgs/pop_transpBG.svg`
- DFG: `/public/imgs/dfg_transpBG.svg`
- Both at 64px height (48px on mobile)
- Link to respective websites with `target="_blank"`

## Auth Behavior

| State | Display |
|-------|---------|
| Not authenticated | Login/Register tabbed forms |
| Authenticated (pending) | "Welcome back, [Name]" + Launch Workspace + Logout |
| Authenticated (approved) | "Welcome back, [Name]" + Launch Workspace + Logout |

Both pending and approved users see the same interface - restrictions apply within the workspace.

## Related Documents

- [ADR-005: Design System and Color Scheme](../decisions/005_design_system_color_scheme.md)
