---
id: annotation.step1.source-image
title: Source Image Selection
category: data
module: annotation
tags:
  - annotation
  - upload
  - tiff
  - source-image
seeAlsoManual:
  - annotation
  - annotation.step2.tools
seeAlsoTags:
  - upload
  - tiff
---

# Source Image Selection

Select the image stack you want to annotate. You can start fresh, resume unfinished work, or edit an existing annotation. The tool decides the mode from the file you pick.

## Data Sources

- Source Image: Raw image stacks from your workspace, or a new upload

- Recent Results: Denoised stacks you may want to annotate

- Unfinished annotations (resume): Work-in-progress files saved earlier with "Save Progress"

- Existing annotations (edit): Completed annotation masks

- Segmentation results (correct): U-Net inference results and Segmentation Cleanup outputs, opened as labels to correct

You can also load the built-in test dataset when you have no files of your own yet.

## File Requirements

- Format: Multi-page TIFF (.tif, .tiff)

- Bit Depth: 8-bit or 16-bit grayscale

- Dimensions: Any size (very large files may affect performance)

## Modes

- New Annotation: Start from a raw or processed image with no existing labels.

- Resume: Continue an unfinished annotation. Further saves keep updating that same WIP file.

- Edit: Load a finished annotation to modify it. Saving never overwrites the original; it creates a new file.

- Correct: Load a segmentation result as labels over the stack it was predicted on. It works like edit: the result is never touched, Create Annotation writes a new annotation that the Segmentation module can train on. "Correct in Annotation" at the end of a segmentation run opens the result here directly.

## Matching a Source Image

Resume, edit and correct all need the original image behind the labels. The tool finds it automatically through the file's lineage, following the chain as far as needed (a cleanup output points at the segmentation it cleaned, which points at the raw stack). When the source cannot be found (for example, an uploaded mask with no lineage, or a source that was deleted), a picker appears so you can choose it. The image you pick must have the same width, height, and slice count as the annotation, or it is rejected.
