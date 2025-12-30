/**
 * FileHandler.js - File Management for DL Denoising Module
 *
 * Handles file selection, upload, validation, and method selection.
 */

class FileHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Handle denoising method change
   * @param {string} method - Selected method ('n2v' or 'autostructn2v')
   */
  onMethodChange(method) {
    console.log('[FileHandler] Method changed:', method);
    this.module.selectedMethod = method;
    this.module.methodSelected = true;
    this.updateNextButton();
  }

  /**
   * Handle file selection from file selector component
   * @param {Object|null} fileInfo - Selected file info or null for deselection
   */
  async onFileSelected(fileInfo) {
    console.log('[FileHandler] File selected:', fileInfo);

    if (!fileInfo) {
      // Deselection
      this.module.uploadedFile = null;
      this.module.fileValidated = false;
      this.module.validationResult = null;
      this.updateNextButton();
      return;
    }

    // Handle test data - load it via API endpoint
    if (fileInfo.isTestData) {
      try {
        this.module.validationDisplay.showLoading('Loading test data...');

        const result = await this.module.api.loadTestData();

        if (result.success && result.file) {
          this.module.uploadedFile = {
            id: result.file.id,
            name: result.file.name,
            path: result.file.path,
            isTestData: true
          };

          // Validate the test data file
          await this.validateFile(result.file.path);
        } else {
          throw new Error(result.error || 'Failed to load test data');
        }
      } catch (error) {
        console.error('[FileHandler] Error loading test data:', error);
        this.module.validationDisplay.showError('Error', error.message);
        this.module.state.notify('error', `Failed to load test data: ${error.message}`);
      }
      return;
    }

    // Regular file selection - validate the file
    this.module.uploadedFile = fileInfo;
    await this.validateFile(fileInfo.path);
  }

  /**
   * Handle file upload completion
   * @param {File} file - Original file object
   * @param {Object} uploadedFile - Upload result from server
   */
  async onFileUploaded(file, uploadedFile) {
    console.log('[FileHandler] File uploaded:', uploadedFile);

    this.module.uploadedFile = {
      id: uploadedFile.id,
      name: uploadedFile.name || file.name,
      path: uploadedFile.path,
      isTestData: false
    };

    // Validate the uploaded file
    await this.validateFile(uploadedFile.path);
  }

  /**
   * Validate a file for DL denoising
   * @param {string} filePath - Path to the file to validate
   */
  async validateFile(filePath) {
    console.log('[FileHandler] Validating file:', filePath);

    this.module.validationDisplay.showLoading('Validating file for DL denoising...');
    this.module.fileValidated = false;
    this.module.validationResult = null;

    try {
      const result = await this.module.api.validateFile(filePath);
      console.log('[FileHandler] Validation result:', result);

      this.module.validationResult = result;

      if (result.valid) {
        // Build details array
        const details = [
          { label: 'Filename', value: result.info?.filename || this.module.uploadedFile?.name },
          { label: 'Dimensions', value: `${result.info?.dimensions?.width} x ${result.info?.dimensions?.height}` },
          { label: 'Slices', value: result.info?.num_slices?.toString() },
          { label: 'Bit Depth', value: `${result.info?.bit_depth}-bit` },
          { label: 'File Size', value: result.info?.file_size_formatted }
        ];

        // Add warnings if any
        if (result.warnings && result.warnings.length > 0) {
          this.module.validationDisplay.showSuccess('File Valid (with warnings)', details);
          result.warnings.forEach(warning => {
            this.module.state.notify('warning', warning, 8000);
          });
        } else {
          this.module.validationDisplay.showSuccess('File Valid', details);
        }

        this.module.fileValidated = true;
      } else {
        // Show errors
        const errorMessages = result.errors?.join('; ') || 'Unknown validation error';
        this.module.validationDisplay.showError('Validation Failed', errorMessages);
        this.module.state.notify('error', errorMessages);
      }

    } catch (error) {
      console.error('[FileHandler] Validation error:', error);
      this.module.validationDisplay.showError('Validation Error', error.message);
      this.module.state.notify('error', `Validation failed: ${error.message}`);
    }

    this.updateNextButton();
  }

  /**
   * Update the Next button state based on file and method selection
   */
  updateNextButton() {
    const step1Next = document.getElementById('step1Next');
    if (step1Next) {
      // Both file and method must be selected
      step1Next.disabled = !(this.module.fileValidated && this.module.methodSelected);
    }
  }
}

export default FileHandler;
