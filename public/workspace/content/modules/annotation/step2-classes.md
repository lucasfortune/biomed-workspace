---
id: annotation.step2.classes
title: Annotation Classes
category: tools
module: annotation
tags:
  - annotation
  - classes
  - labels
  - multi-class
seeAlsoManual:
  - annotation.step2.tools
  - annotation.step2.interpolation
  - annotation
seeAlsoTags:
  - classes
  - labels
---

# Annotation Classes

Define multiple classes for different structures in your images. Each class has a unique color and label.

Classes represent different categories of structures you want to segment. For example:

- Class 1: Cell membrane

- Class 2: Nucleus

- Class 3: Background organelles

## Managing Classes

- Add Class (+): Creates a new class with an auto-assigned color

- Select Class: Click a class to make it active for painting, or press its number key (1 to 9), or Alt+click a painted pixel of it on the canvas

- Rename: Double-click the class name, type the new name, press Enter (Escape cancels). Names are saved with the annotation.

- Colour: Click the colour swatch to open a colour picker

- Toggle Visibility: Hide/show annotations of a specific class. A hidden class is protected: neither the brush nor the eraser changes its pixels, so hide a class to paint right up to and around it. Painting with a hidden class shows it again.

- Lock (padlock icon): A locked class is protected even while visible. No brush or eraser stroke changes its pixels, painting with it is refused until you unlock it, and it cannot be interpolated. Use it once a structure is finished so later work on neighbouring classes cannot damage it. The lock is saved with the annotation.

- Interpolate (layers icon): Fill the slices between the slices you annotated for this class. See Slice Interpolation.

- Delete Class: Remove a class and all its annotations

- Background class ("bg" badge): the class marked in the Suggest section as background examples for the classifier. It behaves like any other class while you work, but Create Annotation writes its pixels as unlabeled (0) and leaves it out of the class list, because the background is never a label in this workspace. See Suggestions.

- Show/hide all and lock/unlock all: The two buttons in the section header act on every class at once. Hide all then show one class to inspect it alone; lock all then unlock one to work on a single structure safely.

## Overlay

The Overlay slider at the top of the section sets how opaque the painted classes are drawn over the image. Hold V to peek at the raw image with all overlays hidden; release to bring them back. This changes only the display, not the annotation.

## Class Colors

Each class is assigned a distinct color for visibility. Colors are chosen automatically to maximize contrast between classes, and can be changed by clicking the swatch.

## Best Practices

- Create all needed classes before starting to annotate

- Use consistent class assignments across all slices

- The active class is highlighted in the class list
