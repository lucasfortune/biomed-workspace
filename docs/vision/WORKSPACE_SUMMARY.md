# Biomedical Image Processing Workspace

A comprehensive overview for researchers and scientists

---

## Introduction

The Biomedical Image Processing Workspace is a web-based platform that brings advanced machine learning and image analysis tools to researchers without requiring programming expertise. Whether you work with confocal microscopy, light-sheet imaging, or electron microscopy data, this workspace provides a complete pipeline for processing 3D image stacks from raw data to publication-ready visualizations.

The platform is designed around three core principles:

**Accessibility** - All functionality is available through an intuitive web interface. No installation, no coding, no command line. Upload your data and start processing immediately.

**Guided Workflows** - Each processing module walks you through the necessary steps with validation, progress tracking, and helpful explanations. Built-in test data lets you explore features before committing your own samples.

**Research-Grade Quality** - The underlying algorithms (U-Net segmentation, Noise2Void denoising, marching cubes mesh generation) represent current best practices in biomedical image analysis. Results include complete metadata for reproducibility and publication.

---

## Who Is This For?

### Practical Imaging Scientists

If your work involves acquiring and analyzing microscopy images, the workspace handles the computational heavy lifting. You can train segmentation models on your specific samples, denoise noisy acquisitions, create 3D visualizations of your structures, and manage all your data in one place. The step-by-step workflows guide you through each stage without requiring you to understand the underlying machine learning.

### Computational and Theoretical Researchers

If you work on quantitative analysis, modelling, or method development, the workspace provides a complete ML pipeline with full transparency. You have access to training metrics, loss curves, model configurations, and data provenance tracking. The modular architecture lets you chain processing steps together and export results in standard formats for further analysis in Python, R, or MATLAB.

---

## Processing Modules

The workspace organizes functionality into self-contained modules. Each module handles a specific processing task and can be used independently or as part of a larger workflow.

### U-Net Segmentation

Train deep learning models to automatically segment structures in your images. This module implements the U-Net architecture, which excels at biomedical image segmentation. You provide training images and corresponding annotation masks, configure parameters like patch size and learning rate, and monitor training progress in real-time with loss curves and validation metrics. Once trained, run inference on new images to generate segmentation masks. You can also import pretrained models to skip the training step entirely.

### Deep Learning Denoising

Remove noise from your images using self-supervised deep learning. This module implements Noise2Void (N2V) and autoStructN2V algorithms, which learn to denoise images without requiring paired clean/noisy training data. Simply provide your noisy images, select a denoising method, and the model learns the noise characteristics from your data itself. This is particularly valuable for microscopy where acquiring clean reference images is often impossible.

### Filter-Based Denoising

Apply classical signal processing filters for quick noise reduction. Choose between Gaussian smoothing for general noise reduction or Non-Local Means (NLM) filtering for preserving edges while removing noise. Unlike deep learning approaches, filter denoising runs instantly without training, making it useful for quick preprocessing or when computational resources are limited.

### Quick Annotation

Create ground-truth segmentation masks directly in your browser. This painting tool lets you label structures in your images using brush and eraser tools with adjustable sizes. Support for multiple classes means you can label different structure types in different colors. Navigate through slices of your stack, save progress at any point, and resume unfinished annotations later. The resulting masks can be used directly for training segmentation models.

### Mesh Generation

Convert segmented image stacks into 3D surface meshes. After you have a segmentation (either from the segmentation module or imported), this module generates polygon meshes representing each segmented class. Output formats include Three.js JSON for web visualization, OBJ for general 3D software, and STL for 3D printing. Mesh generation runs with real-time progress tracking so you can monitor large jobs.

### 3D Visualization

Explore your mesh data interactively in three dimensions. The built-in viewer renders meshes with orbit controls (rotate, zoom, pan), per-class visibility toggles, opacity controls, and clipping planes for slicing through your structures. You can overlay the original image data to compare segmentation results against the source. This module provides immediate visual feedback on your processing results without needing external software.

### Image Viewer

Browse TIFF image stacks in a gallery format. Navigate through slices one at a time in full resolution or view the entire stack as a thumbnail grid for quick overview. Zoom and pan controls let you examine details. This module is useful for quality checking your data at any stage of processing.

---

## File Browser and Workspace Management

All your data lives in a personal workspace that persists across sessions. The file browser provides a visual tree structure showing your uploads, results, and generated files organized by category.

### File Organization

Files are automatically categorized as you work:
- **Raw Images** - Your uploaded source data and inference inputs
- **Annotations** - Ground truth masks created or uploaded for training
- **Segmentation Results** - Output from inference runs
- **Denoised Images** - Results from denoising modules
- **Meshes** - Generated 3D surface files
- **Models** - Trained neural network weights and configurations

### Core Operations

Upload files by dragging them into the browser or using the upload button. Download individual files or select multiple files for batch download as a ZIP archive. Delete files you no longer need, with batch delete for clearing multiple items at once. Search across all files by name or category using natural language keywords like "mesh", "segmentation", or "model".

### Thumbnails and Previews

TIFF files display thumbnail previews directly in the file browser, letting you visually identify your data without opening each file. Thumbnails are generated automatically on upload.

### Workspace Backup

Export your entire workspace as a ZIP archive to back up your work or transfer it to another machine. Restore from a backup to continue where you left off. The export includes all files, folder structure, and metadata while excluding temporary cache data to keep file sizes manageable.

### Data Lineage

The workspace tracks how files relate to each other through processing. When you run inference on an image, the resulting segmentation is linked back to its source. When you generate a mesh from a segmentation, that link is recorded too. This provenance tracking lets you trace any output back to its original input, which is essential for reproducibility and debugging.

---

## Help and Information System

Integrated educational resources help you understand what each feature does and how to use it effectively.

### Context-Sensitive Help

Throughout the interface, question mark icons appear next to parameters and features. Clicking these icons opens relevant help articles explaining what the setting does, how it affects results, and recommended values for common use cases.

### Article Library

Over 80 help articles cover topics across all modules, from basic concepts like "What is a TIFF stack?" to detailed parameter explanations like "How patch size affects training memory and context". Articles are organized by module and include cross-references to related topics.

### Searchable Glossary

A glossary of over 150 terms provides quick definitions for technical vocabulary. Terms link to their full article explanations for deeper reading. The glossary is organized alphabetically and searchable.

### Full-Text Search

Search across all help content to find information quickly. Results show matching articles ranked by relevance with highlighted snippets showing where your search terms appear.

---

## Value for Different Research Approaches

### For Practical Imaging Work

The workspace removes the technical barriers to applying machine learning to your microscopy data.

**Start Immediately** - Built-in test data lets you explore every feature before uploading your own samples. See exactly what the output looks like and verify the workflow makes sense for your application.

**No Programming** - The entire workflow from data upload through 3D visualization happens through the web interface. Parameters are explained in context, and sensible defaults work for most cases.

**Guided Process** - Each module presents a step-by-step workflow with validation at each stage. The system prevents common errors like mismatched dimensions or incompatible file formats before they waste your time.

**Visual Results** - Examine your outputs immediately through the built-in visualization tools. Compare segmentation against original data, rotate 3D meshes to check surface quality, flip through image stacks to verify denoising preserved important features.

**Publication Ready** - Export high-quality visualizations and complete metadata documenting your processing pipeline. The provenance tracking provides the information needed for methods sections.

### For Computational and Quantitative Work

The workspace provides a transparent ML pipeline with full access to training dynamics and results.

**Complete Training Visibility** - Monitor loss curves, validation metrics, and training progress in real-time. Training configurations are saved alongside model weights for complete reproducibility.

**Standard Outputs** - Results export in standard formats (TIFF for images, JSON/OBJ/STL for meshes, PyTorch for models) compatible with downstream analysis in Python, R, MATLAB, or specialized tools.

**Reproducible Pipeline** - Data lineage tracking records every processing step with timestamps, parameters, and input/output relationships. You can trace any result back to its source data and exact configuration.

**Configurable Parameters** - While defaults work for common cases, advanced users can adjust network architecture parameters, training hyperparameters, and processing options to match specific requirements.

**Modular Architecture** - Process steps are independent modules that can be combined in different sequences. Skip denoising if your data is clean. Import pretrained models to skip training. The workflow adapts to your needs.

---

## Processing Pipeline: Putting It Together

Modules chain together to form complete analysis workflows. A typical pipeline might proceed as follows:

```
Raw Image Stack
      |
      v
  [Denoise] -----> Cleaner image with reduced noise
      |
      v
  [Annotate] ----> Ground truth masks for training (or import existing)
      |
      v
   [Train] ------> Trained U-Net model
      |
      v
  [Segment] -----> Segmentation masks for new images
      |
      v
[Generate Mesh] -> 3D surface representation
      |
      v
 [Visualize] ----> Interactive 3D exploration
```

Not every workflow needs every step. You might:
- Import a pretrained model and jump straight to inference
- Skip denoising if your signal-to-noise ratio is adequate
- Stop at segmentation if you only need the masks for quantification
- Start from existing annotations if you already have ground truth

The modular design supports whatever combination makes sense for your research question.

---

## Getting Started

1. **Create an account** - Register on the welcome page and wait for admin approval
2. **Explore with test data** - Launch any module and use built-in test data to see how it works
3. **Upload your data** - Once comfortable, upload your own TIFF stacks
4. **Process step by step** - Follow the guided workflows in each module
5. **Export and analyze** - Download results for publication or further analysis

---

**Document Version:** 1.0
**Last Updated:** 2026-01-09

---