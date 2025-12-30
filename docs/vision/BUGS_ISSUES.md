# Bug Report

**Document Type:** Bug Report
**Status:** Living Document (Updated Regularly)
**Last Updated:** 2025-12-30
 
---


## Overview

This document contains bugs and/or issues reported by the developer and/or users in order of their discovery. The reports shoudl always include a descriptioin of errors, behaviour, problem and a priority rating out of 5 (0:lowest, fix whenever, 5: highest, critical, fix now) & estimated complexity (0:low, 5: high) as well. These bugs must get fixed in the future.

---

## open Bugs/Issues:

- issue: educational content: all modules that contain novel processesing methods should contain explanations
    - prio 3
    - compl. 4

- issue: documentation. many new things are created and documentation is not up to date
    - prio 3
    - compl. 3

- issue: new module: pipeline module
    - for setting up a pipeline and letting it run completely autonomously
    - prio 2
    - compl. 4

- issue: design: color scheme consistent with "Pyhsics of parasitism"-color scheme
    - include claude frontend skill
    - prio 1
    - compl. 3


## CLOSED

- bug: visualization module: deselecting class, then changing range sliders will make class reappear
    - FIXED: Added classVisibility state tracking; setClassSliceRange() now respects visibility state
    - prio 4

- issue: annotation module: auto saving would be great.
    - FIXED: Added autosave toggle in Tools section with 120s interval, only saves when dirty
    - prio 1

- issue: step navigation functions of image viewer module do not scroll up automatically
    - FIXED: Added scrollTop = 0 in goToStep() method
    - prio 3

- bug: mesh creation module: "back to hub" button does not always work and lead to error
    - FIXED: Added nested try-catch for non-configurable/non-writable window properties
    - prio 3

- bug: dl denoising module: selecting test data will save data in workspace/uploads/ instead of in workspace/uploads/raw/
    - FIXED: Changed path in denoising.routes.js to include 'raw' subdirectory
    - prio 3

- issue: filter denoising module: result is saved twice
    - FIXED: Was already resolved before this session
    - prio 3

- issue: dl denoising module: cleanup notification shows up for every file
    - FIXED: Removed notification in ProgressHandler.js handleCleanupProgress()
    - prio 2

- issue: module order on start page should be consistent with experiment data flow
    - FIXED: Reordered modules in registry.js to: denoising → annotation → segmentation → image viewer → mesh → visualization
    - prio 1

- bug: login button on welcome page has no css styling
    - FIXED: Added CSS for .login-btn and .login-button-container in welcome.css
    - prio 1

- issue: segmentation module: segmentation complete message is doubled
    - FIXED: Removed duplicate showSuccess() call in inference.js, added cleanup in navigation.js
    - prio 1

- issue: there are still legacy folders created in results/segmentation: /segmented not necessary anymore.
    - FIXED: Removed 'results/segmented' from WorkspaceManager.js directory creation
    - prio 1

- issue: main page: module cards layout is not the same for all cards
    - FIXED: Added flexbox to .module-card and margin-top:auto to buttons in workspace.css
    - prio 1

- issue: image viewer module step 1 not scrollable
    - FIXED: Changed overflow:hidden to overflow-y:auto in imageviewer.css .step-contents
    - prio 3

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


- 3d vis module: reset view does not reset range slider but should
    - prio 1 