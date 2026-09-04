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
  - save
seeAlsoManual:
  - annotation.step2.tools
seeAlsoTags:
  - undo
  - autosave
---

# History & Autosave

Undo and redo strokes on each slice. Autosave protects your work from accidental loss.

## Undo/Redo

Each slice keeps its own history stack of up to 20 states. Use undo to revert the last brush stroke, and redo to restore it.

- Undo (Ctrl+Z / Cmd+Z): Reverts the most recent stroke on the current slice

- Redo (Ctrl+Y or Ctrl+Shift+Z, and the Cmd equivalents): Restores a previously undone stroke

- History is per-slice: changing slices doesn't affect undo/redo state

## Autosave

When enabled, your work is automatically saved every 2 minutes if changes have been made. This protects against browser crashes or accidental navigation.

- Toggle autosave on/off using the switch in the History section

- The status indicator shows when autosave is in progress

- Autosave uses the same "Save Progress" action, so it only runs once you have painted something

## Saving vs Creating

- Save Progress writes a work-in-progress file you can reopen later to resume. It becomes available after your first stroke.

- Create Annotation writes the final annotation TIFF for training. Both actions are disabled until at least one stroke exists, and creating an annotation with no painted pixels asks for confirmation first.
