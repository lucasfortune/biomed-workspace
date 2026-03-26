# utils/image.py
import os
import numpy as np
from PIL import Image
from glob import glob
from skimage import exposure
from skimage.transform import resize
from skimage.filters import gaussian
from scipy.ndimage import gaussian_filter
import tifffile

def get_image_paths(directory):
    """
    Get all TIFF image file paths in a directory.
    
    This function searches for TIFF files (*.tif) in the specified directory. It ensures
    the directory exists and contains valid image files before returning the paths.
    
    Args:
        directory (str): Path to the directory containing TIFF images.
        
    Returns:
        list: List of absolute paths to TIFF image files.
        
    Raises:
        FileNotFoundError: If the directory doesn't exist
        ValueError: If no TIFF files are found in the directory
    """
    if not os.path.exists(directory):
        raise FileNotFoundError(f"Directory not found: {directory}")
        
    image_paths = glob(os.path.join(directory, '*.tif'))
    
    if not image_paths:
        raise ValueError(f"No TIFF files found in directory: {directory}")

    folder_name = os.path.basename(os.path.normpath(directory))
    
    if os.path.exists(directory) and image_paths:
        print(f"{len(image_paths)} images found in {folder_name}.")
    return [os.path.abspath(path) for path in image_paths]

def verify_image(image_path):
    """
    Verify that a file is a valid, readable image.
    
    Args:
        image_path (str): Path to the image file to verify
        
    Returns:
        tuple: (is_valid, message) where is_valid is a boolean and message describes the result
    """
    if not os.path.exists(image_path):
        return False, "File does not exist"
    
    if not os.access(image_path, os.R_OK):
        return False, "File is not readable"
    
    try:
        with Image.open(image_path) as img:
            img.verify()  # Verify it's a valid image
        return True, "Valid image file"
    except (IOError, SyntaxError) as e:
        return False, f"Invalid image: {e}"

def load_and_normalize_image(img_path):
    """
    Load and normalize an image to floating point values between 0 and 1.
    
    This function handles various image types and bit depths:
    - 8-bit images (uint8): normalized from 0-255 to 0-1
    - 16-bit images (uint16): normalized from 0-65535 to 0-1
    - Float images: clipped to 0-1 range
    - Other types: normalized using min-max scaling
    
    Args:
        img_path (str): Path to the image file.
        
    Returns:
        numpy.ndarray: Normalized 2D image array as float32, values in [0,1]
        
    Raises:
        FileNotFoundError: If the image file doesn't exist
        ValueError: If the image can't be opened or processed
    """
    if not os.path.exists(img_path):
        raise FileNotFoundError(f"Image not found: {img_path}")
        
    try:
        # Open the image
        with Image.open(img_path) as img:
            # Convert to numpy array
            img_array = np.array(img)

            # Handle different data types
            if img_array.dtype == np.uint8:
                # 8-bit image, already in 0-255 range
                img_normalized = img_array.astype(np.float32) / 255.0
            elif img_array.dtype == np.uint16:
                # 16-bit image, normalize from 0-65535 to 0-1
                img_normalized = img_array.astype(np.float32) / 65535.0
            elif img_array.dtype in [np.float32, np.float64]:
                # Floating point image, assume it's already normalized but clip to be safe
                img_normalized = np.clip(img_array, 0, 1).astype(np.float32)
            else:
                # For any other data type, normalize min-max to 0-1 range
                img_min, img_max = img_array.min(), img_array.max()
                img_normalized = (img_array - img_min) / (img_max - img_min)
                img_normalized = img_normalized.astype(np.float32)

            # Ensure the image is 2D (grayscale)
            if img_normalized.ndim > 2:
                img_normalized = img_normalized[:,:,0]  # Take first channel if it's somehow multi-channel
    except Exception as e:
        raise ValueError(f"Failed to process image {img_path}: {str(e)}")
    
    if img_normalized.size == 0:
        raise ValueError(f"Empty image after normalization: {img_path}")
        
    return img_normalized

def load_and_preprocess_image(img_path, sigma=300, scale_factor=0.25):
    """
    Load, preprocess, and enhance an image for training patch preselection.
    
    This function performs several steps to prepare an image for ROI detection:
    1. Loads and scales down the image to reduce computation
    2. Applies Gaussian filtering to reduce noise and smooth the image
    3. Enhances contrast using histogram equalization
    
    Args:
        img_path (str): Path to the image file
        sigma (float, optional): Standard deviation for Gaussian filter. Higher values
            create more smoothing. Scaled automatically with image size. Defaults to 300.
        scale_factor (float, optional): Factor to reduce image size. Must be between 
            0 and 1. Defaults to 0.25 (quarter size).
            
    Returns:
        numpy.ndarray: Preprocessed image array with values in [0,1]
        
    Raises:
        ValueError: If scale_factor is not between 0 and 1
        FileNotFoundError: If image file doesn't exist
    """
    # Validate inputs
    if not 0 < scale_factor <= 1:
        raise ValueError("scale_factor must be between 0 and 1")
    if not os.path.exists(img_path):
        raise FileNotFoundError(f"Image not found: {img_path}")
    
    # Load image and ensure it's 2D
    img = Image.open(img_path)
    original_img = np.array(img)
    if original_img.ndim > 2:
        original_img = original_img[:,:,0]  # Take first channel if multi-channel

    # Scale down while preserving image characteristics
    h, w = original_img.shape
    scaled_img = resize(original_img, 
                       (int(h * scale_factor), int(w * scale_factor)),
                       anti_aliasing=True,
                       preserve_range=True).astype(np.float32)
    
    # Apply Gaussian filter with scaled sigma
    filtered_img = gaussian_filter(scaled_img, sigma=sigma * scale_factor)
    
    # Normalize and enhance contrast
    try:
        enhanced_img = exposure.equalize_hist(filtered_img)
    except ValueError:
        # equalize_hist fails when the data range is too narrow for 256 bins
        # (e.g., low-contrast 16-bit images after heavy gaussian smoothing).
        # Fall back to simple min-max normalization.
        fmin, fmax = filtered_img.min(), filtered_img.max()
        if fmax > fmin:
            enhanced_img = (filtered_img - fmin) / (fmax - fmin)
        else:
            enhanced_img = np.zeros_like(filtered_img, dtype=np.float64)

    return enhanced_img

def calculate_autocorrelation(image, normalize=True, log_transform=True, crop_size=None):
    """
    Calculate the autocorrelation of an image patch and return the central region.
    
    This function computes the normalized autocorrelation function which reveals
    spatial correlations and periodic patterns in the image. Useful for analyzing
    structural noise patterns and their removal.
    
    Args:
        image (numpy.ndarray): 2D image array
        normalize (bool, optional): Whether to normalize by the zero-lag value. 
            Defaults to True.
        log_transform (bool, optional): Whether to apply log transform for better 
            visualization of small values. Defaults to True.
        crop_size (int, optional): Size of central region to return. If None, 
            uses the size of the original image. Defaults to None.
        
    Returns:
        numpy.ndarray: Central region of the autocorrelation function
        
    Notes:
        - The input image is mean-centered before autocorrelation calculation
        - Uses FFT-based convolution for efficient computation
        - Log transform helps visualize weak correlation patterns
        - Central cropping focuses on the most relevant correlation information
    """
    from scipy import signal
    
    # Center the image (remove mean)
    image_centered = image - np.mean(image)
    
    # Calculate autocorrelation using FFT convolution
    # This is equivalent to correlating the image with itself
    autocorr = signal.fftconvolve(image_centered, np.flip(np.flip(image_centered, 0), 1), mode='full')
    
    if normalize:
        # Normalize by the center value (zero-lag autocorrelation)
        center_y, center_x = autocorr.shape[0]//2, autocorr.shape[1]//2
        center_value = autocorr[center_y, center_x]
        if center_value != 0:
            autocorr = autocorr / center_value
    
    if log_transform:
        # Apply log transform for better visualization of small values
        # log1p handles the case where autocorr values might be zero
        autocorr = np.log1p(np.abs(autocorr))
    
    # Crop to central region
    if crop_size is None:
        # Default: crop to same size as original image
        crop_size = min(image.shape)
    
    center_y, center_x = autocorr.shape[0]//2, autocorr.shape[1]//2
    half_crop = crop_size // 2
    
    y_start = max(0, center_y - half_crop)
    y_end = min(autocorr.shape[0], center_y + half_crop + 1)
    x_start = max(0, center_x - half_crop) 
    x_end = min(autocorr.shape[1], center_x + half_crop + 1)
    
    autocorr_cropped = autocorr[y_start:y_end, x_start:x_end]

    return autocorr_cropped


def load_tiff_stack(path):
    """
    Load a multi-page TIFF as a 3D numpy array.

    Args:
        path (str): Path to the TIFF stack file (.tif or .tiff)

    Returns:
        numpy.ndarray: 3D array of shape (num_slices, height, width), dtype float32,
                       with each slice normalized independently to [0, 1]

    Raises:
        FileNotFoundError: If the file doesn't exist
        ValueError: If the file is not a valid TIFF or has fewer than 2 pages
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"TIFF stack not found: {path}")

    if not path.lower().endswith(('.tif', '.tiff')):
        raise ValueError(f"File must be a TIFF file (.tif or .tiff): {path}")

    try:
        # Load the TIFF stack using tifffile
        stack = tifffile.imread(path)
    except Exception as e:
        raise ValueError(f"Failed to read TIFF file {path}: {str(e)}")

    # Ensure we have a 3D stack
    if stack.ndim == 2:
        raise ValueError(f"TIFF file contains only a single image, not a stack: {path}")
    elif stack.ndim > 3:
        # If there are extra dimensions (e.g., channels), take the first
        stack = stack[..., 0] if stack.shape[-1] < stack.shape[0] else stack[:, 0]
        if stack.ndim > 3:
            raise ValueError(f"TIFF file has unexpected dimensions {stack.shape}: {path}")

    if stack.shape[0] < 2:
        raise ValueError(f"TIFF stack must have at least 2 slices, got {stack.shape[0]}: {path}")

    # Normalize each slice independently to [0, 1]
    stack_normalized = np.zeros(stack.shape, dtype=np.float32)

    for z in range(stack.shape[0]):
        slice_data = stack[z].astype(np.float32)

        # Normalize based on dtype
        if stack.dtype == np.uint8:
            slice_normalized = slice_data / 255.0
        elif stack.dtype == np.uint16:
            slice_normalized = slice_data / 65535.0
        elif stack.dtype in [np.float32, np.float64]:
            # Clip to [0, 1] for float data
            slice_normalized = np.clip(slice_data, 0, 1)
        else:
            # Min-max normalization for other dtypes
            s_min, s_max = slice_data.min(), slice_data.max()
            if s_max - s_min > 0:
                slice_normalized = (slice_data - s_min) / (s_max - s_min)
            else:
                slice_normalized = np.zeros_like(slice_data)

        stack_normalized[z] = slice_normalized

    print(f"Loaded TIFF stack: {stack.shape[0]} slices, {stack.shape[1]}x{stack.shape[2]} pixels")

    return stack_normalized


def save_tiff_stack(path, stack, dtype='float32'):
    """
    Save a 3D numpy array as a multi-page TIFF.

    Args:
        path (str): Output file path (.tif or .tiff)
        stack (numpy.ndarray): 3D array of shape (num_slices, height, width)
        dtype (str): Output data type. Options:
                     - 'float32': Save as 32-bit float (preserves precision)
                     - 'uint16': Scale to 16-bit unsigned integer (0-65535)
                     - 'uint8': Scale to 8-bit unsigned integer (0-255)

    Raises:
        ValueError: If stack is not 3D or dtype is invalid
    """
    if stack.ndim != 3:
        raise ValueError(f"Stack must be 3D, got shape {stack.shape}")

    # Ensure parent directory exists
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    # Convert to the appropriate dtype
    if dtype == 'float32':
        output = stack.astype(np.float32)
    elif dtype == 'uint16':
        # Clip to [0, 1] then scale to [0, 65535]
        output = (np.clip(stack, 0, 1) * 65535).astype(np.uint16)
    elif dtype == 'uint8':
        # Clip to [0, 1] then scale to [0, 255]
        output = (np.clip(stack, 0, 1) * 255).astype(np.uint8)
    else:
        raise ValueError(f"Invalid dtype '{dtype}'. Must be 'float32', 'uint16', or 'uint8'")

    # Save using tifffile
    tifffile.imwrite(path, output, photometric='minisblack')

    print(f"Saved TIFF stack: {stack.shape[0]} slices to {path}")