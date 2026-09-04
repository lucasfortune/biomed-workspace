---
id: workspace-basics
title: Workspace Basics
category: guide
module: null
tags:
  - workspace
  - hub
  - navigation
  - theme
  - sidebar
  - getting-started
seeAlsoManual:
  - getting-started
  - file-browser
seeAlsoTags:
  - workspace
  - navigation
---

# Workspace Basics

The workspace is an IDE-like environment where each processing task is a module you launch from a central hub. This article covers the parts of the interface you use everywhere: the hub, the sidebar, the theme toggle, your account status, and the help panel.

## The Hub

When you open the workspace you land on the hub (the welcome view), which shows a grid of module cards. Each card lists the module's name, a short description, and its **Inputs** and **Outputs** so you can see how modules chain together. Click **Launch Module** to open one.

The **Denoising** card is a multi-launch card with two buttons: **Deep Learning** (N2V / asN2V) and **Filter-Based** (Gaussian / NLM) — pick the approach you want and it opens the matching module.

Below the grid, a **Resources** footer links to the Guides & Documentation site and the GitHub repository, along with the workspace version and partner logos.

Once inside a module, the **Back to Hub** button (in the sidebar) returns you to the module grid.

## The Sidebar

The sidebar on the left is collapsible — click the ☰ toggle to expand or collapse it. It contains:

- Your account (name and status)

- Workspace stats — the **Files** count and total **Size**, which update as you add or remove files

- A **Refresh** (🔄) control to re-read the file list from the server

- Quick actions, including Back to Hub and the theme toggle

## Theme Toggle

A theme toggle switches the interface between light and dark mode. Your choice is saved in your browser under the localStorage key `workspace-theme`, so it persists across sessions. Light is the default.

## Account Approval

Your status appears in the sidebar as a badge: **✓ Approved** for an active account or **⏳ Pending** while you wait for approval.

Pending users can explore every module and use the built-in test data, but custom actions are gated: uploading your own files or restoring a workspace ZIP returns an "account approval" error (HTTP 403) until an administrator approves your account.

## Logging Out

Logging out permanently deletes your workspace. Because storage is session-based, the logout button first shows a confirmation dialog listing your current file count and total size, and warns that the action cannot be undone. Download your workspace first if you want to keep your work (see Workspace Backup & Restore).

## The Help Panel

The Help & Info panel gives you contextual explanations throughout the workspace. Click any question-mark icon to open the relevant article. The panel also offers:

- **Search** — type at least 2 characters to search; the panel shows up to the top 15 matching articles

- **Glossary** — a collapsible A–Z list of terms; click a term to open its article

- **See Also** — related-article links at the bottom of each article, so you can move between connected topics
