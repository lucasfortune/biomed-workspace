# inference/predictor.py
import os
import torch
import numpy as np
from tqdm import tqdm
from PIL import Image
import matplotlib.pyplot as plt

from ..utils.image import load_and_normalize_image, load_tiff_stack, save_tiff_stack
from ..utils.patching import image_to_patches, patches_to_image

class AutoStructN2VPredictor:
    """
    Predictor class for applying trained AutoStructN2V models to denoise images.

    This class handles loading trained models and applying them to new images
    for denoising, with support for both stages of the AutoStructN2V pipeline.

    Supports both 2D and 2.5D modes:
    - 2D mode: Process each slice independently
    - 2.5D mode: Use 3-slice triplets as input, predict center slice only

    Args:
        model (nn.Module): Trained denoising model
        device (torch.device, optional): Device to run inference on.
            Defaults to CUDA if available, otherwise CPU.
        patch_size (int, optional): Size of patches for processing. Defaults to 64.
        stride (int, optional): Stride for patch extraction. Defaults to patch_size//2.
        mode (str, optional): Processing mode, either '2d' or '2.5d'. Defaults to '2d'.
    """
    def __init__(self, model, device=None, patch_size=64, stride=None, mode='2d',
                 norm_stats=None, overlap_tile_pad=0):
        self.model = model
        # ``patch_size`` is the loss-region / valid-output size. Under
        # overlap_tile_pad > 0 the actual extracted/processed patches are
        # (patch_size + 2*pad), but only the central patch_size of the output
        # contributes to the reconstruction (option (d) — eliminates the
        # reflection-padding × UNet bottleneck regime mismatch at patch edges).
        self.patch_size = patch_size
        self.overlap_tile_pad = max(0, int(overlap_tile_pad))
        self.extract_size = patch_size + 2 * self.overlap_tile_pad
        # Stride is between extraction starts. Default = patch_size // 2 so
        # central tiles overlap 50% (matches training-time semantics).
        self.stride = stride if stride is not None else patch_size // 2
        self.mode = mode

        if mode not in ['2d', '2.5d']:
            raise ValueError(f"Invalid mode '{mode}'. Must be '2d' or '2.5d'")

        # CAREamics-style z-score stats. When set, denoise_stack normalizes the
        # input slice before patch extraction and denormalizes the reconstructed
        # slice. Inference must use the SAME (mean, std) the model was trained
        # under — these are train-derived stats stashed by pipeline/runner.py.
        self.norm_stats = norm_stats

        # Set device
        if device is None:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = device

        self.model.to(self.device)
        self.model.eval()
    
    def denoise_image(self, image_path, output_path=None, show=False):
        """
        Denoise a single image using the trained model.
        
        Args:
            image_path (str): Path to the input image
            output_path (str, optional): Path to save the denoised image.
                If None, will use input_filename_denoised.tif
            show (bool, optional): Whether to display the result. Defaults to False.
            
        Returns:
            numpy.ndarray: Denoised image array
        """
        # Generate default output path if not provided
        if output_path is None:
            base_path, ext = os.path.splitext(image_path)
            output_path = f"{base_path}_denoised.tif"
        
        # Load and normalize the image
        img_array = load_and_normalize_image(image_path)

        # Calculate padding needed
        h, w = img_array.shape
        pad_h = (self.patch_size - h % self.stride) % self.stride
        pad_w = (self.patch_size - w % self.stride) % self.stride
        
        # Pad image (using reflection padding to avoid border artifacts)
        padded_img = np.pad(img_array, ((0, pad_h), (0, pad_w)), mode='reflect')
        
        # Convert to tensor (add batch and channel dimensions)
        img_tensor = torch.from_numpy(padded_img).float().unsqueeze(0).unsqueeze(0)
        
        # Denoise using patch-based approach
        denoised_tensor = self.denoise_tensor(img_tensor)
        
        # Convert back to numpy array
        denoised_array = denoised_tensor.squeeze().cpu().numpy()[:h, :w]
        
        # Save the result
        self._save_image(denoised_array, output_path)
        
        # Show results if requested
        if show:
            self._show_comparison(img_array, denoised_array)
        
        return denoised_array
    
    def denoise_tensor(self, img_tensor):
        """
        Denoise an image tensor using patch-based processing.
        
        Args:
            img_tensor (torch.Tensor): Input image tensor of shape (B, C, H, W)
            
        Returns:
            torch.Tensor: Denoised image tensor of same shape
        """
        with torch.no_grad():
            batch_size, channels, height, width = img_tensor.shape
            
            if batch_size != 1:
                raise ValueError("This method only supports single image processing (batch_size=1)")
            
            # Process each image in the batch
            denoised_batch = []
            for b in range(batch_size):
                # Extract patches at extract_size (= patch_size + 2*pad).
                patches = image_to_patches(img_tensor[b], self.extract_size, self.stride)

                # Process patches in batches to avoid OOM
                batch_size = 16
                output_patches = []

                for i in range(0, len(patches), batch_size):
                    batch = patches[i:i+batch_size].to(self.device)
                    outputs = self.model(batch)
                    output_patches.append(outputs.cpu())

                # Concatenate batch results
                output_patches = torch.cat(output_patches, dim=0)

                # Reconstruct image from patches. When overlap_tile_pad > 0,
                # only the central patch_size of each output contributes (the
                # rest is the trained model's edge-band region).
                denoised = patches_to_image(
                    output_patches, img_tensor[b].shape,
                    self.extract_size, self.stride,
                    valid_size=self.patch_size if self.overlap_tile_pad > 0 else None)

                denoised_batch.append(denoised)

            # Stack the denoised images back into a batch
            return torch.stack(denoised_batch)

    def denoise_stack(self, input_path, output_path=None, dtype='float32'):
        """
        Denoise a TIFF stack and save the result.

        Supports both 2D and 2.5D modes:
        - 2D mode: Process each slice independently
        - 2.5D mode: Use 3-slice triplets as input, predict center slice only.
                     First and last slices are copied from the original.

        Args:
            input_path (str): Path to input TIFF stack file
            output_path (str, optional): Path to save denoised TIFF stack.
                If None, will use input_filename_denoised.tif
            dtype (str, optional): Output data type for saved TIFF.
                Options: 'float32', 'uint16', 'uint8'. Defaults to 'float32'.

        Returns:
            numpy.ndarray: Denoised stack of shape (num_slices, H, W)
        """
        # Generate default output path if not provided
        if output_path is None:
            base_path, ext = os.path.splitext(input_path)
            output_path = f"{base_path}_denoised.tif"

        # Load the TIFF stack
        stack = load_tiff_stack(input_path)

        # Denoise based on mode
        if self.mode == '2.5d':
            denoised = self._predict_2_5d(stack)
        else:
            denoised = self._predict_2d(stack)

        # Save the result
        save_tiff_stack(output_path, denoised, dtype=dtype)

        return denoised

    def _predict_2d(self, stack):
        """
        Process each slice of the stack independently using patch-based denoising.

        Under overlap_tile_pad > 0 (option d): the slice is reflect-padded by
        ``pad`` on each side and patches of ``extract_size = patch_size + 2*pad``
        are extracted with stride ``patch_size // 2``. Only the central
        ``patch_size`` of each output contributes to the reconstruction (via the
        weight mask in patches_to_image), eliminating the trained model's
        edge-band artifact from the final output.

        Args:
            stack (numpy.ndarray): Input stack of shape (num_slices, H, W)

        Returns:
            numpy.ndarray: Denoised stack of shape (num_slices, H, W)
        """
        num_slices, h, w = stack.shape
        output = np.zeros_like(stack)

        # Dimension-fit padding: pad slice so (padded_dim - extract_size) is a
        # multiple of stride, ensuring all original pixels are covered.
        pad_h_fit = (self.stride - (h - self.patch_size) % self.stride) % self.stride
        pad_w_fit = (self.stride - (w - self.patch_size) % self.stride) % self.stride
        # Outer pad of `overlap_tile_pad` extends each side so the central
        # tiles of border patches still receive in-distribution context.
        outer = self.overlap_tile_pad

        for z in tqdm(range(num_slices), desc="Denoising slices (2D)"):
            # Get the slice
            slice_data = stack[z]

            # Pad slice: dimension-fit + outer (overlap-tile context).
            padded_slice = np.pad(
                slice_data,
                ((outer, outer + pad_h_fit), (outer, outer + pad_w_fit)),
                mode='reflect')

            # Normalize at the slice level (before patching) so all patches
            # share the same train-derived stats — matching CAREamics' Normalize
            # transform being applied before any patch-time transforms.
            if self.norm_stats is not None:
                m_, s_, eps_ = self.norm_stats['mean'], self.norm_stats['std'], self.norm_stats['eps']
                padded_slice = ((padded_slice - m_) / (s_ + eps_)).astype(np.float32)

            # Convert to tensor (add batch and channel dimensions)
            slice_tensor = torch.from_numpy(padded_slice).float().unsqueeze(0).unsqueeze(0)

            # Denoise using patch-based approach
            denoised_tensor = self.denoise_tensor(slice_tensor)

            # Denormalize the reconstructed slice before crop.
            denoised_slice = denoised_tensor.squeeze().cpu().numpy()
            if self.norm_stats is not None:
                denoised_slice = denoised_slice * (s_ + eps_) + m_

            # Strip outer overlap-tile pad first, then the dimension-fit pad.
            if outer:
                denoised_slice = denoised_slice[outer:-outer or None, outer:-outer or None]
            output[z] = denoised_slice[:h, :w]

        return output

    def _predict_2_5d(self, stack):
        """
        Slide through the volume with a 3-slice window.
        Output center slice prediction only.
        First and last slices are copied from the original (no prediction).

        Args:
            stack (numpy.ndarray): Input stack of shape (num_slices, H, W)

        Returns:
            numpy.ndarray: Denoised stack of shape (num_slices, H, W)
        """
        num_slices, h, w = stack.shape
        output = np.zeros_like(stack)

        # First and last slices: copy original (no prediction possible)
        output[0] = stack[0]
        output[-1] = stack[-1]

        # Dimension-fit + overlap-tile outer padding (see _predict_2d).
        pad_h_fit = (self.stride - (h - self.patch_size) % self.stride) % self.stride
        pad_w_fit = (self.stride - (w - self.patch_size) % self.stride) % self.stride
        outer = self.overlap_tile_pad

        # Middle slices: predict with triplet input
        for z in tqdm(range(1, num_slices - 1), desc="Denoising slices (2.5D)"):
            # Get triplet (3 consecutive slices)
            triplet = stack[z-1:z+2]  # Shape: (3, H, W)

            # Pad each slice in the triplet (dim-fit + outer overlap-tile).
            padded_triplet = np.stack([
                np.pad(triplet[i],
                       ((outer, outer + pad_h_fit), (outer, outer + pad_w_fit)),
                       mode='reflect')
                for i in range(3)
            ], axis=0)

            # z-score normalize the triplet (per train stats) before patching.
            if self.norm_stats is not None:
                m_, s_, eps_ = self.norm_stats['mean'], self.norm_stats['std'], self.norm_stats['eps']
                padded_triplet = ((padded_triplet - m_) / (s_ + eps_)).astype(np.float32)

            # Predict center slice from triplet
            prediction = self._predict_triplet(padded_triplet)

            # Denormalize the reconstructed center slice.
            if self.norm_stats is not None:
                prediction = prediction * (s_ + eps_) + m_

            # Strip outer overlap-tile pad, then dim-fit pad.
            if outer:
                prediction = prediction[outer:-outer or None, outer:-outer or None]
            output[z] = prediction[:h, :w]

        return output

    def _predict_triplet(self, triplet):
        """
        Predict the center slice from a 3-slice triplet using patch-based processing.

        The model takes 3-channel input (triplet) and produces 1-channel output
        (center slice prediction).

        Args:
            triplet (numpy.ndarray): Input triplet of shape (3, H, W), already padded

        Returns:
            numpy.ndarray: Predicted center slice of shape (H, W)
        """
        _, height, width = triplet.shape

        # Convert to tensor: add batch dimension -> (1, 3, H, W)
        triplet_tensor = torch.from_numpy(triplet).float().unsqueeze(0)

        with torch.no_grad():
            # Extract patches at extract_size from the 3-channel input.
            patches = image_to_patches(triplet_tensor[0], self.extract_size, self.stride)
            # patches shape: (num_patches, 3, extract_size, extract_size)

            # Process patches in batches to avoid OOM
            batch_size = 16
            output_patches = []

            for i in range(0, len(patches), batch_size):
                batch = patches[i:i+batch_size].to(self.device)
                outputs = self.model(batch)  # (batch, 1, extract_size, extract_size)
                output_patches.append(outputs.cpu())

            # Concatenate batch results
            output_patches = torch.cat(output_patches, dim=0)

            # Reconstruct via central-region weight when overlap_tile_pad > 0.
            target_shape = (1, height, width)
            denoised = patches_to_image(
                output_patches, target_shape,
                self.extract_size, self.stride,
                valid_size=self.patch_size if self.overlap_tile_pad > 0 else None)

        return denoised.squeeze(0).numpy()  # Shape: (H, W)

    def process_directory(self, input_dir, output_dir=None, show=False):
        """
        Process all TIFF images in a directory.
        
        Args:
            input_dir (str): Directory containing input images
            output_dir (str, optional): Directory to save output images.
                If None, will use input_dir/denoised/
            show (bool, optional): Whether to display results. Defaults to False.
            
        Returns:
            list: Paths to denoised images
        """
        # Get all TIFF files in the input directory
        image_paths = []
        for ext in ['.tif', '.tiff']:
            image_paths.extend([os.path.join(input_dir, f) for f in os.listdir(input_dir) 
                               if f.lower().endswith(ext)])
        
        if not image_paths:
            raise ValueError(f"No TIFF images found in {input_dir}")
        
        # Create output directory if not provided
        if output_dir is None:
            output_dir = os.path.join(input_dir, 'denoised')
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Process each image
        output_paths = []
        for img_path in tqdm(image_paths, desc="Processing images"):
            filename = os.path.basename(img_path)
            base_name, ext = os.path.splitext(filename)
            output_path = os.path.join(output_dir, f"{base_name}_denoised.tif")
            
            self.denoise_image(img_path, output_path, show=show)
            output_paths.append(output_path)
        
        return output_paths
    
    def _save_image(self, img_array, output_path):
        """
        Save an image array to disk.
        
        Args:
            img_array (numpy.ndarray): Image array to save
            output_path (str): Path to save the image
        """
        # Ensure directory exists
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        
        # Normalize to 16-bit range
        img_scaled = np.clip(img_array * 65535, 0, 65535).astype(np.uint16)
        
        # Save as TIFF
        Image.fromarray(img_scaled).save(output_path)
    
    def _show_comparison(self, original, denoised):
        """
        Display original and denoised images side by side.
        
        Args:
            original (numpy.ndarray): Original image array
            denoised (numpy.ndarray): Denoised image array
        """
        fig, axes = plt.subplots(1, 2, figsize=(12, 6))
        
        denoised_scaled = np.clip(denoised * 65535, 0, 65535).astype(np.uint16)
        original_scaled = np.clip(original * 65535, 0, 65535).astype(np.uint16)
        
        # Display with proper normalization
        axes[0].imshow(original_scaled, cmap='gray')
        axes[0].set_title('Original')
        axes[0].axis('off')
        
        axes[1].imshow(denoised_scaled, cmap='gray')
        axes[1].set_title('Denoised')
        axes[1].axis('off')
        
        plt.tight_layout()
        plt.show()
    
    @classmethod
    def from_checkpoint(cls, checkpoint_path, model_class, stage, **kwargs):
        """
        Create a predictor from a model checkpoint.

        Args:
            checkpoint_path (str): Path to the model checkpoint
            model_class: Model class to instantiate
            stage (str): Stage of the model ('stage1' or 'stage2')
            **kwargs: Additional arguments for predictor initialization.
                      mode (str): '2d' or '2.5d' - if not provided, extracted from hparams

        Returns:
            AutoStructN2VPredictor: Initialized predictor with loaded model
        """
        # Load checkpoint
        checkpoint = torch.load(checkpoint_path, map_location='cpu')

        # Extract hyperparameters
        if 'hparams' in checkpoint:
            hparams = checkpoint['hparams']
        else:
            hparams = {}

        # Extract mode from hparams if not provided in kwargs
        mode = kwargs.get('mode', hparams.get('mode', '2d'))

        # Create model based on stage and mode
        if stage == 'stage1':
            features = hparams.get('n2v_features', 64)
            num_layers = hparams.get('n2v_num_layers', 4)
            patch_size = hparams.get('n2v_patch_size', 64)
        else:  # stage2
            features = hparams.get('structn2v_features', 64)
            num_layers = hparams.get('structn2v_num_layers', 4)
            patch_size = hparams.get('structn2v_patch_size', 64)

        # Determine in/out channels based on mode and stage
        # Note: For inference, Stage 2 always outputs 1 channel (center slice)
        if mode == '2.5d':
            in_channels = 3
            out_channels = 1  # Always predict center slice for inference
        else:
            in_channels = 1
            out_channels = 1

        # Create model with correct channel dimensions
        model = model_class(
            features=features,
            num_layers=num_layers,
            stage=stage,
            in_channels=in_channels,
            out_channels=out_channels
        )

        # Load model weights
        if 'model_state_dict' in checkpoint:
            model.load_state_dict(checkpoint['model_state_dict'])
        else:
            model.load_state_dict(checkpoint)

        # Set patch size if not provided in kwargs
        if 'patch_size' not in kwargs:
            kwargs['patch_size'] = patch_size

        # Set mode if not provided in kwargs
        if 'mode' not in kwargs:
            kwargs['mode'] = mode

        # Create predictor
        return cls(model=model, **kwargs)