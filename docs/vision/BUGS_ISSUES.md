# Bug Report

  

**Document Type:** Bug Report

**Status:** Living Document (Updated Regularly)

**Last Updated:** 2025-12-23

  

---

  

## Overview

  

This document contains bugs and/or issues reported by the developer and/or users in order of their discovery. The reports shoudl always include a descriptioin of errors, behaviour, problem and a priority rating out of 5 (0:lowest, fix whenever, 5: highest, critical, fix now) as well. These bugs must get fixed in the future.

  

---

  
  

## open Bugs/Issues:

  

- Image Viewer: image icon too small

- image icons size was coosen too small and needs to be increased

- doesnt look good

- prio 2

  

- segmentation moule: visualization data

- after inference visualization data is created (leftover from before module was split)

- should not be created in this module but in 3d vis module (coming with future update)

- prio 2

  

- module order on start page should be consistent with experiment data flow

- denoising -> annotation -> segmentation -> image viewer -> mesh generation -> visualization

- prio 1

  

- design: color scheme consistent with "Pyhsics of parasitism"-color scheme

- include claude frontend skill

- prio 1

  

- educational content: all modules that contain novel processesing methods should contain explanations

- prio 3

  

- login button on welcome page has no css styling

- probably not loaded correctly somewhere

- prio 1

  

- mesh creation module: "back to hub" button does not always work and lead to error

- [ModuleLoader] Error deactivating module mesh: TypeError: property "nextStep" is non-configurable and can't be deleted

- prio 3

  

- legacy folder in workspace are still being created

- /results/segmented & /results/visualizations

prio 1

  
  
  

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