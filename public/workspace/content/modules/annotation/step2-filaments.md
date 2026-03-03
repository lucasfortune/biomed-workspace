---
id: annotation.step2.filaments
title: Filament Annotation
category: tools
module: annotation
tags:
  - annotation
  - filaments
  - centerpoints
  - tracking
  - direction
seeAlsoManual:
  - annotation.step2.tools
  - annotation.step2.classes
seeAlsoTags:
  - annotation
  - tools
---

# Filament Annotation

Filaments allow you to annotate tubular structures (such as microtubules or cytoskeletal filaments) by placing centerpoints along their path through the image stack. Each filament tracks a single structure across multiple slices.

## What Are Filaments?

Unlike brush-based class annotations that label pixel regions, filaments mark the centerline of elongated structures. Each filament stores one centerpoint per slice, tracing the structure's path through the 3D volume. This data is used for direction-aware segmentation training, enabling the model to predict both segmentation masks and local orientation of filamentous structures.

## Adding and Removing Filaments

Click the + button in the Filaments section header to create a new filament. Each filament is automatically named using the pattern MT-1, MT-2, MT-3, and so on. Filaments are assigned a distinct color from a 10-color palette for easy visual identification.

To delete a filament, click the x button on its entry in the filament list. This removes the filament and all its placed centerpoints.

## Placing Centerpoints

Select a filament from the list by clicking on it (the active filament is highlighted). Then click on the canvas to place a centerpoint for that filament on the current slice. Each filament can have at most one centerpoint per slice.

If you click again on the same slice with the same filament selected, the point is repositioned to the new location. To remove a placed point, right-click near it on the canvas.

Navigate between slices using the left/right arrow keys or the slice slider, placing points on each slice where the structure is visible. The point count badge next to each filament name shows how many slices have a centerpoint placed.

## Class Association

Each filament is associated with an annotation class. When you create a new filament, it is linked to whichever class is currently selected in the Classes section. This determines which segmentation class the filament belongs to. Make sure to select the appropriate class before adding a filament.

## The Filament List

The filament list shows all created filaments with:

- A colored dot indicating the filament's unique color
- The filament name (e.g., MT-1)
- A numeric badge showing how many centerpoints have been placed
- A delete button to remove the filament

Click on a filament entry to make it the active filament. The active filament is highlighted and any new centerpoint placement applies to it.

## Tips

- Place centerpoints as accurately as possible at the center of the structure on each slice for best results.
- You can skip slices where the structure is not clearly visible.
- All filament centerpoints are visible on the canvas at all times, regardless of which tool is active. The active filament's points appear slightly larger.
- Filament data is saved automatically alongside your annotation when autosave is enabled or when you finalize the annotation.
