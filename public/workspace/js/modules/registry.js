/**
 * Module Registry - Configuration for all available modules
 * Icons are inline SVGs for filled/solid style
 */

// Module ID constants for type-safe references
const MODULE_IDS = {
  DENOISING: 'denoising',
  DENOISING_DL: 'denoising-dl',
  DENOISING_FILTER: 'denoising-filter',
  ANNOTATION: 'annotation',
  SEGMENTATION: 'segmentation',
  IMAGEVIEWER: 'imageviewer',
  MESH: 'mesh',
  VISUALIZATION: 'visualization',
  STITCHING: 'stitching',
  PREPROCESS: 'preprocess',
  SEGCLEANUP: 'segcleanup'
};

// SVG Icon definitions (filled/solid style)
const moduleIcons = {
  denoising: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,

  annotation: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,

  segmentation: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg>`,

  imageviewer: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,

  mesh: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18.5 7 12 9.5 5.5 7 12 4.5zM4 8.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/></svg>`,

  visualization: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,

  stitching: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h7v7H4V3zm9 0h7v7h-7V3zm-9 11h7v7H4v-7zm12.5 0c.83 0 1.5.67 1.5 1.5V17h1.5c.83 0 1.5.67 1.5 1.5S20.33 20 19.5 20H18v1.5c0 .83-.67 1.5-1.5 1.5S15 22.33 15 21.5V20h-1.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5H15v-1.5c0-.83.67-1.5 1.5-1.5z"/></svg>`,

  preprocess: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z"/></svg>`,

  segcleanup: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29c-.39-.39-1.02-.39-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"/></svg>`
};

const moduleRegistry = [
  {
    id: 'preprocess',
    name: 'Preprocessing',
    description: 'Prepare image stacks: crop, z-trim, flip/rotate, downscale, intensity windowing, gamma and bit-depth conversion',
    icon: moduleIcons.preprocess,
    path: '/workspace/js/modules/preprocess/PreprocessModule.js',
    inputs: ['image_stack'],
    outputs: ['image_stack'],
    color: '#C29B0C',
    status: 'available'
  },
  {
    id: 'denoising',
    name: 'Denoising',
    description: 'Remove noise from images using filter-based or deep learning methods',
    icon: moduleIcons.denoising,
    inputs: ['image_stack'],
    outputs: ['denoised_stack'],
    color: '#1DA924',
    cardType: 'multi-launch',
    helpArticleId: 'denoising',
    launchOptions: [
      {
        id: 'denoising-dl',
        label: 'Deep Learning',
        sublabel: 'N2V / asN2V',
        path: '/workspace/js/modules/denoising-dl/DLDenoisingModule.js',
        status: 'available',
        helpArticleId: 'denoising-dl'
      },
      {
        id: 'denoising-filter',
        label: 'Filter-Based',
        sublabel: 'Gaussian / NLM',
        path: '/workspace/js/modules/denoising-filter/FilterDenoisingModule.js',
        status: 'available',
        helpArticleId: 'denoising-filter'
      }
    ]
  },
  {
    id: 'annotation',
    name: 'Quick Annotation Tool',
    description: 'Simple brush-based annotation tool for creating training data with multi-class support',
    icon: moduleIcons.annotation,
    path: '/workspace/js/modules/annotation/AnnotationModule.js',
    inputs: ['image_stack'],
    outputs: ['annotations'],
    color: '#EB1F17',
    status: 'available',
    helpArticleId: 'annotation'
  },
  {
    id: 'segmentation',
    name: 'U-Net Segmentation',
    description: 'Segment annotated image volumes with a U-Net annotation algorithm',
    icon: moduleIcons.segmentation,
    path: '/workspace/js/modules/segmentation/SegmentationModule.js',
    inputs: ['image_stack', 'annotations'],
    outputs: ['segmented_stack', 'trained_model'],
    color: '#17A2B8',
    status: 'available',
    helpArticleId: 'segmentation'
  },
  {
    id: 'imageviewer',
    name: 'Image Viewer',
    description: 'View TIFF image stacks with gallery and thumbnail modes',
    icon: moduleIcons.imageviewer,
    path: '/workspace/js/modules/imageviewer/ImageViewerModule.js',
    inputs: ['image_stack', 'segmented_stack'],
    outputs: [],
    color: '#6C757D',
    status: 'available',
    helpArticleId: 'imageviewer'
  },
  {
    id: 'mesh',
    name: 'Surface Mesh Generation',
    description: 'Convert segmented volumes to 3D surface meshes for visualization and export (OBJ, STL, Three.js)',
    icon: moduleIcons.mesh,
    path: '/workspace/js/modules/mesh/MeshModule.js',
    inputs: ['segmented_stack', 'annotations'],
    outputs: ['mesh_file'],
    color: '#9B59B6',
    status: 'available',
    helpArticleId: 'mesh'
  },
  {
    id: 'segcleanup',
    name: 'Segmentation Cleanup',
    description: 'Fix and measure segmentations: fill holes, remove specks, smooth, merge classes, manual touch-up painting, and quantification reports',
    icon: moduleIcons.segcleanup,
    path: '/workspace/js/modules/segcleanup/SegcleanupModule.js',
    inputs: ['segmented_stack', 'annotations'],
    outputs: ['segmented_stack'],
    color: '#C2185B',
    status: 'available'
  },
  {
    id: 'stitching',
    name: 'Stack Stitching',
    description: 'Join multiple stacks into one volume: z-concatenation and mosaics with overlay alignment and reusable stitch recipes',
    icon: moduleIcons.stitching,
    path: '/workspace/js/modules/stitching/StitchingModule.js',
    inputs: ['image_stack', 'segmented_stack'],
    outputs: ['image_stack', 'segmented_stack'],
    color: '#0FA3B1',
    status: 'available'
  },
  {
    id: 'visualization',
    name: '3D Visualization',
    description: 'Interactive 3D viewer for mesh data with per-class controls and slicing',
    icon: moduleIcons.visualization,
    path: '/workspace/js/modules/visualization/VisualizationModule.js',
    inputs: ['mesh_file'],
    outputs: [],
    color: '#E67E22',
    status: 'available',
    helpArticleId: 'visualization'
  }
];

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { moduleRegistry, MODULE_IDS };
}

// Also make available globally for browser use
if (typeof window !== 'undefined') {
  window.MODULE_IDS = MODULE_IDS;
}
