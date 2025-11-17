/**
 * SegmentationModule - U-Net Segmentation Module
 * Phase 1: Basic placeholder
 * Phase 2: Will integrate existing segmentation workflow
 */
class SegmentationModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;
  }

  /**
   * Activate the module
   */
  async activate() {
    console.log('[SegmentationModule] Activating...');

    // Get the module view container
    this.container = document.getElementById('module-view');

    if (!this.container) {
      console.error('[SegmentationModule] Module container not found');
      return;
    }

    // Render the module UI
    this.render();
  }

  /**
   * Render the module interface
   */
  render() {
    this.container.innerHTML = `
      <div class="segmentation-module">
        <div class="module-header">
          <button class="btn-back" onclick="workspace.returnToHub()">← Back to Hub</button>
          <h2>🧩 U-Net Segmentation Pipeline</h2>
        </div>

        <div class="module-content" style="padding: 40px; max-width: 800px; margin: 0 auto;">
          <div style="background: rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 32px; text-align: center;">
            <h3 style="margin-bottom: 20px; font-size: 24px;">Module Integration in Progress</h3>

            <p style="margin-bottom: 24px; line-height: 1.6; opacity: 0.9;">
              The U-Net segmentation module is currently being integrated into the workspace interface.
              This is <strong>Phase 2</strong> work that will wrap the existing segmentation pipeline.
            </p>

            <div style="background: rgba(74, 144, 226, 0.2); border-left: 4px solid #4A90E2; padding: 16px; margin: 24px 0; text-align: left;">
              <h4 style="margin-bottom: 12px;">📋 What's Included (Phase 2):</h4>
              <ul style="margin-left: 20px; line-height: 1.8;">
                <li>Upload TIFF image stacks and annotations</li>
                <li>Configure U-Net architecture and training parameters</li>
                <li>Real-time training progress monitoring</li>
                <li>Model saving and import functionality</li>
                <li>Batch inference on new data</li>
                <li>3D visualization of results</li>
              </ul>
            </div>

            <div style="margin-top: 32px;">
              <h4 style="margin-bottom: 16px;">Use the classic version in the meantime:</h4>
              <a href="/classic" class="btn-primary" style="
                display: inline-block;
                padding: 16px 32px;
                background: #4CAF50;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                transition: all 0.3s;
              ">
                Launch Classic Segmentation App
              </a>
            </div>

            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.2);">
              <p style="font-size: 14px; opacity: 0.7;">
                <strong>Current Status:</strong> Phase 1 Complete ✅ | Phase 2 Next 🚧
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Deactivate the module
   */
  async deactivate() {
    console.log('[SegmentationModule] Deactivating...');

    // Clear the container
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('[SegmentationModule] Cleaning up...');
    this.deactivate();
  }
}

// Export as default
export default SegmentationModule;
