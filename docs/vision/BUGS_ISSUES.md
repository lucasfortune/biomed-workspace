# Bug Report

**Document Type:** Bug Report
**Status:** Living Document (Updated Regularly)
**Last Updated:** 2025-12-23
 
---


## Overview

This document contains bugs and/or issues reported by the developer and/or users in order of their discovery. The reports shoudl always include a descriptioin of errors, behaviour, problem and a priority rating out of 5 (0:lowest, fix whenever, 5: highest, critical, fix now) as well. These bugs must get fixed in the future.

---

## open Bugs/Issues:

- visualization module: deselecting class, then changing range sliders will make class reappear (even though still deselected)
    - should stay hidden
    - prio 4

- step navigation functions of base module do not scroll up automatically
    - should scroll up automatically
    - prio 3

- mesh creation module: "back to hub" button does not always work and lead to error
    - [ModuleLoader] Error deactivating module mesh: TypeError: property "nextStep" is non-configurable and can't be deleted
    - prio 3
  
- educational content: all modules that contain novel processesing methods should contain explanations
    - prio 3

- documentation. many new things are created and documentation is not up to date
    - prio 3
  
- Image Viewer: image icon too small
    - image icons size was coosen too small and needs to be increased
    - doesnt look good
    - prio 2

- filter denoising module: result is saved twice, once in result folder (correct) and once in upload folder (incorrect)
    - should only be saved in appropriate results folder
    - prio 3

- new module: pipeline module
    - for setting up a pipeline and letting it run completely autonomously
    - prio 2
  
- module order on start page should be consistent with experiment data flow
    - denoising -> annotation -> segmentation -> image viewer -> mesh generation -> visualization
    - prio 1

- design: color scheme consistent with "Pyhsics of parasitism"-color scheme
    - include claude frontend skill
    - prio 1

- login button on welcome page has no css styling
    - probably not loaded correctly somewhere
    - prio 1

- legacy folder in workspace are still being created
    - /results/segmented & /results/visualizations
    - prio 1

- 3d vis module: reset view does not reset range slider but should
    - prio 1 

- annotaion module: auto saving would be great.
    - prio 1
  
- segmentation module: segmentation complete message is doubled
    - opaque one line message from earlier version below new green container can be removed
    - and it also persists after starting new analysis!
    - also there are still legacy folders created in results/segmentation: /segmented not necessary anymore.
    - prio 1

- main page: module cards layout is not the same for all cards
    - launch buttons not aligned
    - prio 1

## CLOSED

- Segmentation module inference testdata not working
    - choosing test data for the inference does not work currently
    - when choosing test data and starting inference error message: "File not found"
    - prio 3

- segmentation module training annotation test data issue
    - cant choose custom data for one and test for the other
    - doesnt trigger validation so cant advance to next step
    - prio 3

- module look and design
    - look and design should be consistent
    - create reusable module element
    - with variable step number
    - with custom content for each step
    - prio 4

- result file metadata must include reference to original data
    - importsant because: in 3d viewer original data overlay
    - prio 3

- mesh creation module: file selector drop down does not show segmentation result files, only annotation upload files.
    - should show all valid files
    - prio 4

- segmentation moule: visualization data
    - after inference visualization data is created (leftover from before module was split)
    - should not be created in this module but in 3d vis module (coming with future update)
    - prio 2