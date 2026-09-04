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

- Recent Results: Denoising and segmentation outputs you may want to annotate

- Unfinished annotations (resume): Work-in-progress files saved earlier with "Save Progress"

- Existing annotations (edit): Completed annotation masks

You can also load the built-in test dataset when you have no files of your own yet.

## File Requirements

- Format: Multi-page TIFF (.tif, .tiff)

- Bit Depth: 8-bit or 16-bit grayscale

- Dimensions: Any size (very large files may affect performance)

## Modes

- New Annotation: Start from a raw or processed image with no existing labels.

- Resume: Continue an unfinished annotation. Further saves keep updating that same WIP file.

- Edit: Load a finished annotation to modify it. Saving never overwrites the original; it creates a new file.

## Matching a Source Image

Resume and edit both need the original image behind the annotation. The tool finds it automatically through the file's lineage. When the source cannot be found (for example, an uploaded mask with no lineage, or a source that was deleted), a picker appears so you can choose it. The image you pick must have the same width, height, and slice count as the annotation, or it is rejected.
