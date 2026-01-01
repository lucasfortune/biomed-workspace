# Article List

**Document Type:** Article List
**Status:** Living Document (Updated Regularly)
**Last Updated:** 2026-01-01
 
---


## Overview

This document contains a list of all proposed elements that should be documented in the info panel feature.

- ✅ **UNET SEGMENTATION MODULE**
- ⏳ **DL DENOISING MODULE**
- ⏳ **FILTER BASED  DENOISING MODULE**
- ⏳ **ANNOTATION MODULE**
- ✅ **IMAGE VIEWER MODULE**
- ⏳ **SURFACE MESH GENERATION MODULE**
- ⏳ **3D VISUALIZATION MOULE**

## IMPORTANT:

Keep icon placement conisstant. Check completed implementations for placing. 

---

# unet segmentation module (COMPLETE ✅)

## main page:
- where: module card top right corner
- what: overview of what this module does and how it works

## step 1
- general: 
	- where: next to "choose workflow" 
	- what: briefly explain the two options: "train from scratch" and "use preitrained model"

- all upload options:
	- where: next to upload options: "Raw images", "Annotation", "select config", "select model"
	- what: explain what these files are and what the requirements are


## step 2: (this is already done)
- all parameters:
	- where: next to parameter name
	- what: explanation + parameter impact

## step 3:
- general: 
	- where: next to top "step 3: training progress" title
	- what: brief explanation of model training

- loss & dice
	- where: in graphs next to "loss curves" and "dice score"
	- what: explain what each number means, what u might see during training progress and what it might mean

## step 4:
- general: 
	- where: next to top "step 4: run inference" title
	- what: brief explanation of inference

- inference upload:
	- where: next to "inference Data"
	- what:  explain what these files are and what the requirements are

# denoising module (PENDING ⏳)

the denoising module is a special case since it basically houses 2 modules: the dl denoising and the filter based denoising. i will handle these seperately. the module should (just like all modules) have a info icon on the module card in the top right corner that explains the module other then the other modules the denoising methods (especially autostructn2v) will have more detailed detailed articles.

### main page:
- where: module card top right corner
- what: overview of what this module does and how it works

I will handle the info article list for the denoising modules separately:

## Filter based denoising
### step 1
- input image stack data:
	- where: right next to the "input image stack" in the file selector/upload section
	- what: explain what these files are and what the requirements are
	
### step 2
- methods overview:
	- where: in the configuration section next to the header saying "select method"
	- what: explain the two methods
- parameters:
	- where: in the parameter section next to the two headers saying "Gaussian parameters" and "Non local means parameters"
	- what: explain all availbal parameters

### step 3
- needs none.

## Deep learning based denoising
### step 1
- denoising method: 
	- where: in the "select denoising method" section next to the "1. select denoising method" header
	- what: explain the two methods (briefly)
	- addition: for the autostructN2V method i would like to add an additional aritcle that explains the method in more detail. thes article should be reachable through the "see also" section in the brief method explanation article here!
- choose workflow:
	-  where: next to "choose workflow" header
	- what: briefly explain the two options: "train from scratch" and "use pretrained model"
- data upload:
	- where: next to all headers in the data upload sections (train from scratch: "input image stack", import previously trained model: "select config" and "select model" (2x for autostructn2v: stage 1 and stage 2))
### step 2
- all parameters:
	- where: next to parameter name
	- what: explanation + parameter impact
### step 3
- general: 
	- where: next to top "run denoising" title
	- what: brief explanation of model training
	- addition: this should be 2 seperate articles here for n2v and autostructn2v since the training is quite different
	- addition 2: also should mention that this can be the final step since the images are being fully denoised during training. step 4 is in fact optioinal

- loss 
	- where: in graphsnext to "loss curves" 
	- what: explain what each number means, what u might see during training progress and what it might mean
- best val loss:
	- where: in the best val loss value section:
	- what: explain why the best validation loss is shown here 
### step 4
- data selection:
	- where: in file selector next to "select data to process" header
	- what: explain what these files are and what the requirements are
	- addition: crucial to remind here that this only works if the images are from the same recording as the images that the model was trained on. 


# annotation module (PENDING ⏳)
## main page:
- where: module card top right corner
- what: overview of what this module does and how it works

## step 1
- source image data:
	- where: right next to the "source image" in the file selector/upload section
	- what: explain what these files are and what the requirements are
## step 2
- tool section:
	- where: tool section has 4 sub sections: tools, brush size, history and classes. ? icons should be placed in the top right corner of all subsections.
	- what: explain each element in the sections

# image viewer module (COMPLETE ✅)
## main page:
- where: module card top right corner
- what: overview of what this module does and how it works

## step 1
- image stack selection
	- where: right next to the "image stack" in the file selector/upload section
	- what: explain what these files are and what the requirements are

## step 2
- ui explanation:
	- where: in the top section above the filename & slice count
	- what: explain the ui

# surface mesh generation module (PENDING ⏳)
## main page:
- where: module card top right corner
- what: overview of what this module does and how it works

## step 1
- segmentation data selection
	- where: right next to the "image stack" in the file selector/upload section
	- what: explain what these files are and what the requirements are

## step 2
- output options
	- where: right next to the "output options" header in the output options section
	- what: explain each option

# 3d visualization module  (PENDING ⏳)
## main page:
- where: module card top right corner
- what: overview of what this module does and how it works

## step 1
- mesh data selection
	- where: right next to the "mesh data" in the file selector/upload section
	- what: explain what these files are and what the requirements are

## step 2
- ui explanation:
	- where: in the visualization controls section at the top next to the "visualization controls" header
	- what: explain each ui element


# File browser  (PENDING ⏳)
- general: 
    - where: below the user section, next to the "workspace" header
    - what: explanation of the file browser panel functionality (all, in detail)