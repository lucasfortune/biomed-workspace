---
id: annotation.step2.history
title: History & Autosave
category: tools
module: annotation
tags:
  - annotation
  - undo
  - redo
  - autosave
  - history
seeAlsoManual:
  - annotation.step2.tools
seeAlsoTags:
  - undo
  - autosave
---

# History & Autosave

Undo and redo strokes on each slice. Autosave protects your work from accidental loss.

## Undo/Redo

Each slice maintains its own history stack. Use undo to revert the last brush stroke, and redo to restore it.

- Undo (Ctrl+Z): Reverts the most recent stroke on the current slice

- Redo (Ctrl+Y): Restores a previously undone stroke

- History is per-slice: changing slices doesn't affect undo/redo state

## Autosave

When enabled, your work is automatically saved every 2 minutes if changes have been made. This protects against browser crashes or accidental navigation.

- Toggle autosave on/off using the switch in the History section

- The status indicator shows when autosave is in progress

- Manual saves are still available via the "Save Progress" button
