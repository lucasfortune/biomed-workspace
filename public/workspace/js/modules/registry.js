/**
 * Module Registry - Configuration for all available modules
 * Icons are inline SVGs for filled/solid style
 */

// SVG Icon definitions (filled/solid style)
const moduleIcons = {
  denoising: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,

  annotation: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,

  segmentation: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg>`,

  imageviewer: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,

  mesh: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18.5 7 12 9.5 5.5 7 12 4.5zM4 8.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/></svg>`,

  visualization: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
};

const moduleRegistry = [
  {
    id: 'denoising',
    name: 'Denoising',
    description: 'Remove noise from images using filter-based or deep learning methods',
    icon: moduleIcons.denoising,
    inputs: ['image_stack'],
    outputs: ['denoised_stack'],
    color: '#1DA924',
    cardType: 'multi-launch',
    launchOptions: [
      {
        id: 'denoising-dl',
        label: 'Deep Learning',
        sublabel: 'N2V / autoN2V',
        path: '/workspace/js/modules/denoising-dl/DLDenoisingModule.js',
        status: 'available'
      },
      {
        id: 'denoising-filter',
        label: 'Filter-Based',
        sublabel: 'Gaussian / NLM',
        path: '/workspace/js/modules/denoising-filter/FilterDenoisingModule.js',
        status: 'available'
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
    description: 'Complete ML pipeline: Data Upload, Training, Inference',
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
    status: 'available'
  }
];

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = moduleRegistry;
}
