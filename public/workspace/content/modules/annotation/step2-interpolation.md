---
id: annotation.step2.interpolation
title: Slice Interpolation
category: tools
module: annotation
tags:
  - annotation
  - interpolation
  - classes
  - slices
  - keyframes
seeAlsoManual:
  - annotation.step2.classes
  - annotation.step2.history
seeAlsoTags:
  - classes
  - slices
---

# Slice Interpolation

Annotate a class on some slices and let the module fill the slices in between. Interpolation works per class, so you can run it for one structure while the others stay untouched.

## How it works

The slices on which a class already has pixels are its keyframes. Interpolation fills every gap between two neighbouring keyframes, as long as they are no further apart than the max gap. You choose how densely to annotate: every 5th slice where a structure changes quickly, every 10th where it does not. The spacing does not have to be regular.

For each gap the two keyframe shapes are morphed into each other (shape-based interpolation on signed distance fields, the same method ITK-SNAP uses). Before morphing, the two shapes are aligned by their centres, so a structure that drifts sideways through the stack stays connected.

## Running it

1. Paint the class on at least two slices.

2. Click the layers icon in the class row. The dialog lists the annotated slices and previews which gaps will be filled.

3. Set the max gap. It is the largest distance between two annotated slices that still gets connected (default 10). Gaps wider than that are skipped, so two separate objects of the same class far apart in the stack are not bridged. Lower it if unrelated structures get connected, raise it if you annotated sparsely on purpose.

4. Click Interpolate.

Only empty pixels are filled. Pixels that already belong to another class are never overwritten, so the order in which you interpolate classes does not matter. A locked class cannot be interpolated; unlock it first.

## Reviewing the result

- The strip above the slice slider marks the slices that carry the active class: solid marks are your own annotations, light marks were filled by interpolation and not edited since. Click a mark to jump there.

- The , and . keys jump to the previous and next annotated slice of the active class.

- Every filled slice gets its own undo step, and Revert interpolation in the History section restores all slices of the last run at once.

- Painting on an interpolated slice turns it into a keyframe. If a gap looks wrong, correct one slice in the middle of it and run the interpolation again: the gap is now two shorter gaps.

## Limits

- A structure that appears, ends, splits or merges between two keyframes is morphed smoothly, not topologically. Add a keyframe close to the event.

- Each filled slice is stored in memory like a painted one, so large stacks with many gaps use correspondingly more browser memory.
