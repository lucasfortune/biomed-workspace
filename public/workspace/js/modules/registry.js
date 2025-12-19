/**
 * Module Registry - Configuration for all available modules
 */
const moduleRegistry = [
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
    id: 'denoising',
    name: 'Deep Learning Denoising',
    description: 'Remove noise from electron microscopy images using advanced denoising algorithms',
    icon: '🔊',
    path: '/workspace/js/modules/denoising/DenoisingModule.js',
    inputs: ['image_stack'],
    outputs: ['denoised_stack'],
    color: '#50C878',
    status: 'coming_soon'
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
    status: 'coming_soon'
  },
  {
    id: 'mesh',
    name: 'Surface Mesh Generation',
    description: 'Convert segmented volumes to 3D surface meshes for simulation with multiple export formats',
    icon: '🎯',
    path: '/workspace/js/modules/mesh/MeshModule.js',
    inputs: ['segmented_stack'],
    outputs: ['mesh_file'],
    color: '#9B59B6',
    status: 'coming_soon'
  },
  {
    id: 'visualization',
    name: '3D Visualization',
    description: 'Interactive 3D viewer for segmentation results with per-class controls and slicing',
    icon: '👁️',
    path: '/workspace/js/modules/visualization/VisualizationModule.js',
    inputs: ['segmented_stack', 'volume_data'],
    outputs: ['screenshot', 'export'],
    color: '#E67E22',
    status: 'coming_soon'
  }
];

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = moduleRegistry;
}
