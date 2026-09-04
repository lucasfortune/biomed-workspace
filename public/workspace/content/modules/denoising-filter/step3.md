---
id: denoising-filter.step3
title: Processing & Results
category: process
module: denoising-filter
tags:
  - denoising
  - processing
  - results
  - output
seeAlsoManual:
  - denoising-filter.step2.methods
  - denoising-filter.step1.input
seeAlsoTags:
  - denoising
  - output
---

# Processing & Results

Review your settings, run the filter, and open the denoised output.

This final step applies the method and parameters you configured to the input stack and saves the result to your workspace.

## Configuration Summary

Before processing, a summary shows the choices you are about to run — the selected method (Gaussian or NLM) and its parameters (for example, sigma and kernel for Gaussian, or filter strength and window sizes for NLM). Use it to confirm everything looks right, or go Back to adjust.

## Running the Filter

Select Start Denoising to process the stack. A progress indicator is shown while each slice is filtered. Processing time depends on the method (NLM is slower than Gaussian), the image size, and the number of slices.

## Results

When processing finishes, a "Denoising Complete" card appears with details of the saved output file. From there you can:

- Open in Image Viewer: View the denoised stack in the Image Viewer module to inspect the result.

- Start New Run: Reset the module to denoise another image or try different settings.

The denoised stack is written to your workspace as a new TIFF file, leaving your original input untouched.
