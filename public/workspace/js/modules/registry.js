/**
 * Module Registry - Configuration for all available modules
 */
const moduleRegistry = [
  {
    id: 'denoising',
    name: 'Denoising',
    description: 'Remove noise from images using filter-based or deep learning methods',
    icon: '🔊',
    inputs: ['image_stack'],
    outputs: ['denoised_stack'],
    color: '#50C878',
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
    icon: '✏️',
    path: '/workspace/js/modules/annotation/AnnotationModule.js',
    inputs: ['image_stack'],
    outputs: ['annotations'],
    color: '#FF6B6B',
    status: 'available'
  },
  {
    id: 'segmentation',
    name: 'U-Net Segmentation',
    description: 'Complete ML pipeline: Data Upload → Training → Inference',
    icon: '🧩',
    path: '/workspace/js/modules/segmentation/SegmentationModule.js',
    inputs: ['image_stack', 'annotations'],
    outputs: ['segmented_stack', 'trained_model'],
    color: '#4A90E2',
    status: 'available'
  },
  {
    id: 'imageviewer',
    name: 'Image Viewer',
    description: 'View TIFF image stacks with gallery and thumbnail modes',
    icon: '🖼️',
    path: '/workspace/js/modules/imageviewer/ImageViewerModule.js',
    inputs: ['image_stack', 'segmented_stack'],
    outputs: [],
    color: '#17A2B8',
    status: 'available'
  },
  {
    id: 'mesh',
    name: 'Surface Mesh Generation',
    description: 'Convert segmented volumes to 3D surface meshes for visualization and export (OBJ, STL, Three.js)',
    icon: '🎯',
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
    icon: '👁️',
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
