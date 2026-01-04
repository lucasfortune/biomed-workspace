# autoStructN2V/pipeline/runner.py
import os
import torch
import numpy as np
from datetime import datetime
from tqdm import tqdm
import glob

from ..utils.training import set_seed
from ..models import create_model, create_model_from_config
from ..trainers import AutoStructN2VTrainer
from ..inference import AutoStructN2VPredictor
from ..masking import (
    StructuralNoiseExtractor,
    create_full_mask,
    create_full_mask_3d,
    create_stage1_mask_kernel,
    create_stage1_mask_kernel_3d
)
from ..utils.image import get_image_paths, load_tiff_stack, save_tiff_stack

from .config import validate_config, create_output_directories
from .data import split_dataset, split_stack_indices, create_dataloaders

def load_mask_from_file(mask_file_path, verbose=False):
    """
    Load a masking kernel from an external .npy file.
    
    Args:
        mask_file_path (str): Path to the .npy file containing the mask
        verbose (bool): Whether to print verbose output
        
    Returns:
        numpy.ndarray: Loaded masking kernel
    """
    if not os.path.exists(mask_file_path):
        raise FileNotFoundError(f"Mask file not found: {mask_file_path}")
    
    try:
        mask = np.load(mask_file_path)
        if mask.dtype != bool:
            print(f"Warning: Converting mask from {mask.dtype} to bool")
            mask = mask.astype(bool)
        
        if verbose:
            print(f"Loaded mask from {mask_file_path}")
            print(f"Mask shape: {mask.shape}")
            print(f"True pixels: {np.sum(mask)} ({np.sum(mask)/mask.size*100:.2f}%)")
            
            # Visualize loaded mask
            import matplotlib.pyplot as plt
            plt.figure(figsize=(6, 6))
            plt.imshow(mask, cmap='gray')
            plt.title(f"Loaded Mask: {os.path.basename(mask_file_path)}")
            plt.axis('off')
            plt.show()
        
        return mask
        
    except Exception as e:
        raise ValueError(f"Failed to load mask from {mask_file_path}: {str(e)}")

def create_mask_from_original_images(image_paths, config, verbose=False):
    """
    Create a structured mask using StructuralNoiseExtractor on original noisy images.
    
    Args:
        image_paths (tuple): (train_paths, val_paths, test_paths)
        config (dict): Configuration dictionary
        verbose (bool): Whether to print verbose output
        
    Returns:
        numpy.ndarray: Created masking kernel
    """
    # Get extractor config
    extractor_config = config['stage2']['extractor']
    
    # Create extractor with config parameters
    extractor = StructuralNoiseExtractor(
        norm_autocorr=extractor_config.get('norm_autocorr', True),
        log_autocorr=extractor_config.get('log_autocorr', True),
        crop_autocorr=extractor_config.get('crop_autocorr', True),
        adapt_autocorr=extractor_config.get('adapt_autocorr', True),
        adapt_CB=extractor_config.get('adapt_CB', 50.0),
        adapt_DF=extractor_config.get('adapt_DF', 0.95),
        center_size=extractor_config.get('center_size', 10),
        base_percentile=extractor_config.get('base_percentile', 50),
        percentile_decay=extractor_config.get('percentile_decay', 1.15),
        center_ratio_threshold=extractor_config.get('center_ratio_threshold', 0.3),
        use_center_proximity=extractor_config.get('use_center_proximity', True),
        center_proximity_threshold=extractor_config.get('center_proximity_threshold', 0.95),
        keep_center_component_only=extractor_config.get('keep_center_component_only', True),
        max_true_pixels=extractor_config.get('max_true_pixels', 25)
    )
    
    # Load some original images for mask creation
    train_paths, _, _ = image_paths
    
    # Limit number of images to process for mask creation
    max_images_for_mask = min(len(train_paths), 10)  # Use up to 10 images
    selected_paths = train_paths[:max_images_for_mask]
    
    if verbose:
        print(f"Creating mask from {len(selected_paths)} original noisy images...")
    
    # Load images and create patches
    from ..utils.image import load_and_normalize_image
    
    image_patches = []
    patch_size = config['stage2']['patch_size']
    patches_per_image = min(config['stage2']['patches_per_image'], 100)  # Limit for mask creation
    
    for img_path in selected_paths:
        img_array = load_and_normalize_image(img_path)
        h, w = img_array.shape
        
        # Extract random patches from this image
        for _ in range(patches_per_image // len(selected_paths)):
            if h >= patch_size and w >= patch_size:
                top = np.random.randint(0, h - patch_size + 1)
                left = np.random.randint(0, w - patch_size + 1)
                patch = img_array[top:top+patch_size, left:left+patch_size]
                image_patches.append(patch)
    
    if not image_patches:
        raise ValueError("No valid patches could be extracted from the original images")
    
    # Convert to numpy array
    noise_patterns = np.array(image_patches)
    
    if verbose:
        print(f"Extracted {len(noise_patterns)} patches for mask creation")
    
    # Extract structured mask
    struct_mask, _ = extractor.extract_mask(noise_patterns, verbose)
    
    return struct_mask

def create_stage2_mask(config, image_paths=None, denoised_patches=None, verbose=False):
    """
    Create a structured mask for stage 2 based on the configured mask source.

    Supports both 2D and 2.5D modes:
    - 2D mode: Creates 2D mask (H, W)
    - 2.5D mode: Creates 3D mask (3, H, W) using 3D autocorrelation

    Args:
        config (dict): Configuration dictionary
        image_paths (tuple, optional): (train_paths, val_paths, test_paths) for 'extractor' source
        denoised_patches (numpy.ndarray, optional): Denoised patches for 'stage1' source
            - 2D: shape (N, 1, H, W)
            - 2.5D: shape (N, 3, H, W)
        verbose (bool): Whether to print verbose output

    Returns:
        tuple: (full_mask, prediction_kernel)
            - 2D: shapes (H, W)
            - 2.5D: shapes (3, H, W)
    """
    mask_source = config['stage2']['mask_source']
    mode = config.get('mode', '2d')

    # Create extractor with config parameters
    extractor_config = config['stage2']['extractor']
    extractor = StructuralNoiseExtractor(
        norm_autocorr=extractor_config.get('norm_autocorr', True),
        log_autocorr=extractor_config.get('log_autocorr', True),
        crop_autocorr=extractor_config.get('crop_autocorr', True),
        adapt_autocorr=extractor_config.get('adapt_autocorr', True),
        adapt_CB=extractor_config.get('adapt_CB', 50.0),
        adapt_DF=extractor_config.get('adapt_DF', 0.95),
        center_size=extractor_config.get('center_size', 10),
        base_percentile=extractor_config.get('base_percentile', 50),
        percentile_decay=extractor_config.get('percentile_decay', 1.15),
        center_ratio_threshold=extractor_config.get('center_ratio_threshold', 0.3),
        use_center_proximity=extractor_config.get('use_center_proximity', True),
        center_proximity_threshold=extractor_config.get('center_proximity_threshold', 0.95),
        keep_center_component_only=extractor_config.get('keep_center_component_only', True),
        max_true_pixels=extractor_config.get('max_true_pixels', 25)
    )

    if mask_source == 'stage1':
        if denoised_patches is None:
            raise ValueError("denoised_patches must be provided when mask_source is 'stage1'")

        # Extract mask based on mode
        if mode == '2.5d':
            # denoised_patches shape: (N, 3, H, W)
            struct_mask, _ = extractor.extract_mask_3d(denoised_patches, verbose)
        else:
            # denoised_patches shape: (N, 1, H, W)
            struct_mask, _ = extractor.extract_mask(denoised_patches, verbose)

    elif mask_source == 'file':
        mask_file_path = config['stage2']['mask_file_path']
        struct_mask = load_mask_from_file(mask_file_path, verbose)
        # Validate mask dimensions match mode
        if mode == '2.5d' and struct_mask.ndim != 3:
            raise ValueError(f"2.5D mode requires 3D mask, got shape {struct_mask.shape}")
        if mode == '2d' and struct_mask.ndim != 2:
            raise ValueError(f"2D mode requires 2D mask, got shape {struct_mask.shape}")

    elif mask_source == 'extractor':
        if image_paths is None:
            raise ValueError("image_paths must be provided when mask_source is 'extractor'")
        # Note: create_mask_from_original_images needs updating for 2.5D
        # For now, only supports 2D mode with 'extractor' source
        if mode == '2.5d':
            raise ValueError("mask_source='extractor' not yet supported for 2.5D mode. "
                           "Use 'stage1' or 'file' instead.")
        struct_mask = create_mask_from_original_images(image_paths, config, verbose)

    else:
        raise ValueError(f"Unknown mask_source: {mask_source}")

    # Create full mask and prediction kernel based on mode
    if mode == '2.5d':
        full_mask, prediction_kernel = create_full_mask_3d(
            struct_mask,
            config['stage2']['patch_size'],
            config['stage2']['mask_percentage'],
            verbose
        )
    else:
        full_mask, prediction_kernel = create_full_mask(
            struct_mask,
            config['stage2']['patch_size'],
            config['stage2']['mask_percentage'],
            verbose
        )

    return full_mask, prediction_kernel

def denoise_directory(model, input_dir, output_dir, config, stage):
    """
    Denoise all images in a directory.
    
    Args:
        model (nn.Module): Trained denoising model
        input_dir (str): Directory containing input images
        output_dir (str): Directory to save denoised images
        config (dict): Configuration dictionary
        stage (str): 'stage1' or 'stage2'
        
    Returns:
        list: Paths to denoised images
    """
    # Create predictor
    predictor = AutoStructN2VPredictor(
        model=model,
        patch_size=config[stage]['patch_size']
    )
    
    # Process all images
    result_paths = predictor.process_directory(
        input_dir=input_dir,
        output_dir=output_dir,
        show=False
    )
    
    return result_paths

def save_mask_to_file(mask, filepath, verbose=False):
    """
    Save a mask to a .npy file for future use.
    
    Args:
        mask (numpy.ndarray): Mask to save
        filepath (str): Path to save the mask
        verbose (bool): Whether to print verbose output
    """
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    np.save(filepath, mask)
    
    if verbose:
        print(f"Saved mask to {filepath}")
        print(f"Mask shape: {mask.shape}")
        print(f"True pixels: {np.sum(mask)} ({np.sum(mask)/mask.size*100:.2f}%)")

def run_pipeline(config):
    """
    Run the autoStructN2V pipeline with optional stage control.

    Supports two input modes:
    - **Path mode (legacy)**: `input_dir` - directory of individual TIFF files
    - **Stack mode (2.5D)**: `input_data` - path to single multi-page TIFF stack

    Args:
        config (dict): Configuration dictionary

    Returns:
        dict: Summary of results
    """
    # Validate configuration
    config = validate_config(config)
    verbose = config.get('verbose', False)
    mode = config.get('mode', '2d')

    # Create output directories
    dirs = create_output_directories(config)

    # Set random seed for reproducibility
    set_seed(config['random_seed'])

    # Set device
    device = torch.device(config['device'] if torch.cuda.is_available() and config['device'] == 'cuda' else 'cpu')
    print(f"Using device: {device}")

    # Print stage execution plan
    print(f"\nPipeline configuration:")
    print(f"  Mode: {mode}")
    print(f"  Stage 1: {'ENABLED' if config['run_stage1'] else 'DISABLED'}")
    print(f"  Stage 2: {'ENABLED' if config['run_stage2'] else 'DISABLED'}")
    if config['run_stage2']:
        print(f"  Stage 2 mask source: {config['stage2']['mask_source']}")
        print(f"  Stage 2 training data: Original noisy images")
        print(f"  Stage 2 final application: Original noisy images")

    # Determine input mode: stack-based or path-based
    use_stack_input = config.get('input_data') is not None

    if use_stack_input:
        # Stack mode: Load TIFF stack and split z-indices
        print(f"\nLoading TIFF stack from: {config['input_data']}")
        stack = load_tiff_stack(config['input_data'])
        print(f"Stack shape: {stack.shape} (slices, height, width)")

        # Split z-indices into train/val/test
        print("Splitting stack indices...")
        slice_indices = split_stack_indices(
            num_slices=stack.shape[0],
            split_ratio=config['split_ratio'],
            seed=config['random_seed'],
            verbose=verbose
        )
        image_paths = None  # Not used in stack mode
    else:
        # Path mode (legacy): Split files into directories
        print("\nSplitting dataset...")
        image_paths = split_dataset(
            config['input_dir'],
            dirs,
            config['split_ratio'],
            config['image_extension'],
            config['random_seed'],
            verbose=verbose
        )
        stack = None
        slice_indices = None
    
    # Save a copy of the configuration
    import json
    with open(os.path.join(dirs['experiment'], 'config.json'), 'w') as f:
        # Convert any non-serializable objects to strings
        config_serializable = {k: (str(v) if not isinstance(v, (dict, list, str, int, float, bool, type(None))) else v) 
                             for k, v in config.items()}
        json.dump(config_serializable, f, indent=4)
    
    # Initialize result summary
    summary = {
        'experiment_dir': dirs['experiment'],
        'config': config,
        'stages_run': []
    }
    
    # Variables to track intermediate results
    stage1_denoised_dir = None
    denoised_patches = None
    
    #------------------------------------------------------------------------
    # Stage 1: Standard Noise2Void (if enabled)
    #------------------------------------------------------------------------
    if config['run_stage1']:
        print("\n" + "="*40)
        print("Stage 1: Standard Noise2Void Training")
        print("="*40)

        # Create dataloaders for stage 1
        print("Creating dataloaders...")
        if use_stack_input:
            train_loader, val_loader, test_loader = create_dataloaders(
                config=config,
                stage="stage1",
                stack=stack,
                slice_indices=slice_indices,
                verbose=verbose
            )
        else:
            train_loader, val_loader, test_loader = create_dataloaders(
                image_paths=image_paths,
                config=config,
                stage="stage1",
                verbose=verbose
            )

        # Create stage 1 model with mode-aware channels
        stage1_model = create_model_from_config(config, 'stage1')

        if verbose:
            print(f"\nStage 1 Model Architecture:")
            print("-" * 40)
            print(stage1_model)
            total_params = sum(p.numel() for p in stage1_model.parameters())
            print(f"\nTotal parameters: {total_params:,}")
            print("-" * 40)
        
        # Create optimizer and scheduler
        optimizer = torch.optim.Adam(stage1_model.parameters(), lr=config['stage1']['learning_rate'])
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, mode='min', factor=0.5, patience=5, verbose=True
        )
        
        # Create trainer
        stage1_trainer = AutoStructN2VTrainer(
            model=stage1_model,
            optimizer=optimizer,
            scheduler=scheduler,
            device=device,
            hparams=config,
            stage='stage1',
            experiment_name=os.path.join(dirs['stage1']['logs'], datetime.now().strftime("%Y%m%d-%H%M%S"))
        )
        
        # Train stage 1 model
        print("Training stage 1 model...")
        denoised_patches = stage1_trainer.train(train_loader, val_loader, test_loader)
        
        # Save stage 1 model
        stage1_checkpoint_path = os.path.join(dirs['stage1']['model'], 'stage1_model.pth')
        stage1_trainer.save_checkpoint(stage1_checkpoint_path)
        print(f"Saved stage 1 model to {stage1_checkpoint_path}")
        
        # Load trained model from checkpoint for inference
        print("Loading trained Stage 1 model for inference...")
        stage1_trained_model = create_model_from_config(config, 'stage1').to(device)

        # Load the trained weights
        checkpoint = torch.load(stage1_checkpoint_path, map_location=device)
        stage1_trained_model.load_state_dict(checkpoint['model_state_dict'])
        stage1_trained_model.eval()

        # Denoise images with stage 1 model
        if use_stack_input:
            # Stack mode: Use denoise_stack() for full volume processing
            print("Denoising TIFF stack with trained stage 1 model...")
            stage1_denoised_dir = os.path.join(dirs['data'], 'stage1_denoised')
            os.makedirs(stage1_denoised_dir, exist_ok=True)

            # Create predictor with mode support
            stage1_predictor = AutoStructN2VPredictor(
                model=stage1_trained_model,
                patch_size=config['stage1']['patch_size'],
                mode=mode
            )

            # Denoise the full stack
            stage1_output_path = os.path.join(stage1_denoised_dir, 'stage1_denoised_stack.tif')
            stage1_predictor.denoise_stack(
                input_path=config['input_data'],
                output_path=stage1_output_path,
                dtype='float32'
            )
            print(f"Stage 1 denoised stack saved to: {stage1_output_path}")
        else:
            # Path mode: Denoise each split separately
            print("Denoising original images with trained stage 1 model...")
            stage1_denoised_dir = os.path.join(dirs['data'], 'stage1_denoised')
            os.makedirs(stage1_denoised_dir, exist_ok=True)

            # Denoise each split separately
            for split_name, split_paths in zip(['train', 'val', 'test'], image_paths):
                split_output_dir = os.path.join(stage1_denoised_dir, split_name)
                os.makedirs(split_output_dir, exist_ok=True)

                # Get directory of the current split
                input_split_dir = os.path.dirname(split_paths[0])

                print(f"Denoising {split_name} images...")
                denoise_directory(stage1_trained_model, input_split_dir, split_output_dir, config, 'stage1')
        
        # Update summary
        summary['stage1_model_path'] = stage1_checkpoint_path
        summary['stage1_denoised_dir'] = stage1_denoised_dir
        summary['stages_run'].append('stage1')
        
        # If only stage 1 is requested, save single kernel for potential future stage 2 use
        if not config['run_stage2'] and denoised_patches is not None:
            print("Saving stage 1 single masking kernel for potential future use...")

            # Create extractor with stage2 config
            extractor_config = config['stage2']['extractor']
            extractor = StructuralNoiseExtractor(
                norm_autocorr=extractor_config.get('norm_autocorr', True),
                log_autocorr=extractor_config.get('log_autocorr', True),
                crop_autocorr=extractor_config.get('crop_autocorr', True),
                adapt_autocorr=extractor_config.get('adapt_autocorr', True),
                adapt_CB=extractor_config.get('adapt_CB', 50.0),
                adapt_DF=extractor_config.get('adapt_DF', 0.95),
                center_size=extractor_config.get('center_size', 10),
                base_percentile=extractor_config.get('base_percentile', 50),
                percentile_decay=extractor_config.get('percentile_decay', 1.15),
                center_ratio_threshold=extractor_config.get('center_ratio_threshold', 0.3),
                use_center_proximity=extractor_config.get('use_center_proximity', True),
                center_proximity_threshold=extractor_config.get('center_proximity_threshold', 0.95),
                keep_center_component_only=extractor_config.get('keep_center_component_only', True),
                max_true_pixels=extractor_config.get('max_true_pixels', 25)
            )

            # Extract kernel based on mode
            if mode == '2.5d':
                # Use 3D autocorrelation for 2.5D mode
                single_kernel, _ = extractor.extract_mask_3d(denoised_patches, verbose)
            else:
                # Use 2D autocorrelation for 2D mode
                single_kernel, _ = extractor.extract_mask(denoised_patches, verbose)

            mask_save_path = os.path.join(dirs['experiment'], 'stage1_generated_kernel.npy')
            save_mask_to_file(single_kernel, mask_save_path, verbose)
            summary['stage1_generated_mask_path'] = mask_save_path

            if verbose:
                print(f"Saved single masking kernel (shape: {single_kernel.shape})")
                print("This kernel can be used as 'mask_file_path' for independent stage 2 execution")
                print("Note: Only the single kernel is saved (not the full mask with multiple kernels)")
                print("The full mask will be created during stage 2 training")
        
        # Clean up stage1 variables to free memory
        del stage1_model, stage1_trainer, optimizer, scheduler
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
    
    #------------------------------------------------------------------------
    # Stage 2: Structured Noise2Void (if enabled)
    #------------------------------------------------------------------------
    if config['run_stage2']:
        print("\n" + "="*40)
        print("Stage 2: Structured Noise2Void Training")
        print("="*40)

        # Create structured mask based on configuration
        print(f"Creating structured mask using source: {config['stage2']['mask_source']}")
        stage2_mask, stage2_prediction_kernel = create_stage2_mask(
            config,
            image_paths=image_paths,
            denoised_patches=denoised_patches,
            verbose=verbose
        )

        # Save the mask for future reference
        mask_save_path = os.path.join(dirs['stage2']['model'], 'stage2_mask.npy')
        save_mask_to_file(stage2_mask, mask_save_path, verbose)

        # Create dataloaders for stage 2 with structured mask
        print("Creating dataloaders for stage 2...")
        print("Stage 2 will train on original noisy data (not Stage 1 denoised)")

        if use_stack_input:
            stage2_train_loader, stage2_val_loader, stage2_test_loader = create_dataloaders(
                config=config,
                stage="stage2",
                stack=stack,
                slice_indices=slice_indices,
                structured_mask=stage2_mask,
                prediction_kernel=stage2_prediction_kernel,
                verbose=verbose
            )
        else:
            stage2_train_loader, stage2_val_loader, stage2_test_loader = create_dataloaders(
                image_paths=image_paths,  # Use original images
                config=config,
                stage="stage2",
                structured_mask=stage2_mask,
                prediction_kernel=stage2_prediction_kernel,
                verbose=verbose
            )

        # Create stage 2 model with mode-aware channels
        stage2_model = create_model_from_config(config, 'stage2')

        if verbose:
            print(f"\nStage 2 Model Architecture:")
            print("-" * 40)
            print(stage2_model)
            total_params = sum(p.numel() for p in stage2_model.parameters())
            print(f"\nTotal parameters: {total_params:,}")
            print("-" * 40)
        
        # Create optimizer and scheduler
        stage2_optimizer = torch.optim.Adam(stage2_model.parameters(), lr=config['stage2']['learning_rate'])
        stage2_scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            stage2_optimizer, mode='min', factor=0.5, patience=5, verbose=True
        )
        
        # Create trainer
        stage2_trainer = AutoStructN2VTrainer(
            model=stage2_model,
            optimizer=stage2_optimizer,
            scheduler=stage2_scheduler,
            device=device,
            hparams=config,
            stage='stage2',
            experiment_name=os.path.join(dirs['stage2']['logs'], datetime.now().strftime("%Y%m%d-%H%M%S"))
        )
        
        # Train stage 2 model
        print("Training stage 2 model...")
        stage2_trainer.train(stage2_train_loader, stage2_val_loader, stage2_test_loader)
        
        # Save stage 2 model
        stage2_checkpoint_path = os.path.join(dirs['stage2']['model'], 'stage2_model.pth')
        stage2_trainer.save_checkpoint(stage2_checkpoint_path)
        print(f"Saved stage 2 model to {stage2_checkpoint_path}")
        
        # Load trained model from checkpoint for inference
        print("Loading trained Stage 2 model for inference...")
        stage2_trained_model = create_model_from_config(config, 'stage2').to(device)

        # Load the trained weights
        checkpoint = torch.load(stage2_checkpoint_path, map_location=device)
        stage2_trained_model.load_state_dict(checkpoint['model_state_dict'])
        stage2_trained_model.eval()

        # Apply stage 2 to original images for final results
        if use_stack_input:
            # Stack mode: Use denoise_stack() for full volume processing
            print("Applying trained stage 2 model to original TIFF stack...")
            os.makedirs(dirs['final_results'], exist_ok=True)

            # Create predictor with mode support
            stage2_predictor = AutoStructN2VPredictor(
                model=stage2_trained_model,
                patch_size=config['stage2']['patch_size'],
                mode=mode
            )

            # Denoise the full stack
            final_output_path = os.path.join(dirs['final_results'], 'final_denoised_stack.tif')
            stage2_predictor.denoise_stack(
                input_path=config['input_data'],
                output_path=final_output_path,
                dtype='float32'
            )
            print(f"Final denoised stack saved to: {final_output_path}")
        else:
            # Path mode: Apply to each split's original images
            print("Applying trained stage 2 model to original noisy images...")
            final_input_base = dirs['data']  # Always use original images

            # Denoise images with trained stage 2 model
            for split_name in ['train', 'val', 'test']:
                input_dir = os.path.join(final_input_base, split_name)
                output_dir = os.path.join(dirs['final_results'], split_name)
                os.makedirs(output_dir, exist_ok=True)

                if os.path.exists(input_dir):
                    print(f"Denoising {split_name} images with trained stage 2...")
                    denoise_directory(stage2_trained_model, input_dir, output_dir, config, 'stage2')
        
        # Update summary
        summary['stage2_model_path'] = stage2_checkpoint_path
        summary['stage2_mask_path'] = mask_save_path
        summary['stages_run'].append('stage2')
        
        # Clean up stage2 variables to free memory
        del stage2_model, stage2_trainer, stage2_optimizer, stage2_scheduler
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
    
    # Set final results directory
    if config['run_stage2']:
        summary['final_results_dir'] = dirs['final_results']
    elif config['run_stage1']:
        summary['final_results_dir'] = stage1_denoised_dir
    else:
        summary['final_results_dir'] = None
    
    # Final summary
    print("\n" + "="*40)
    print("Pipeline Complete")
    print("="*40)
    print(f"Experiment name: {config['experiment_name']}")
    print(f"Output directory: {dirs['experiment']}")
    print(f"Stages executed: {', '.join(summary['stages_run'])}")
    
    if 'stage1' in summary['stages_run']:
        print(f"Stage 1 model saved to: {summary['stage1_model_path']}")
    if 'stage2' in summary['stages_run']:
        print(f"Stage 2 model saved to: {summary['stage2_model_path']}")
        print(f"Stage 2 mask saved to: {summary['stage2_mask_path']}")
    
    if summary['final_results_dir']:
        print(f"Final results saved to: {summary['final_results_dir']}")
    
    # Optional visualization for completed pipeline
    if verbose and summary['final_results_dir']:
        _visualize_pipeline_results(summary, config)
    
    return summary

def _visualize_pipeline_results(summary, config):
    """
    Visualize the final results of the pipeline with zoomed-in regions and full-image autocorrelation comparison.
    
    Args:
        summary (dict): Pipeline results summary
        config (dict): Configuration dictionary
    """
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches
    from glob import glob
    import numpy as np
    from ..utils.image import load_and_normalize_image, calculate_autocorrelation
    
    print("\n=== Pipeline Results Visualization ===")
    
    # Get result files
    result_files = []
    for split in ['train', 'val', 'test']:
        split_dir = os.path.join(summary['final_results_dir'], split)
        if os.path.exists(split_dir):
            files = glob(os.path.join(split_dir, '*_denoised.tif'))
            if files:
                result_files.extend(files)
                break
    
    if result_files:
        # Use the first result file
        result_file = result_files[0]
        print(f"Visualizing: {os.path.basename(result_file)}")
        
        # Find corresponding original file
        original_basename = os.path.basename(result_file).replace('_denoised.tif', '.tif')
        while '_denoised' in original_basename:
            original_basename = original_basename.replace('_denoised', '')
        if not original_basename.endswith('.tif'):
            original_basename += '.tif'
        
        # Search for original file in data directories
        original_file_path = None
        for split in ['train', 'val', 'test']:
            potential_path = os.path.join(summary['experiment_dir'], 'data', split, original_basename)
            if os.path.exists(potential_path):
                original_file_path = potential_path
                break
        
        if original_file_path:
            # Load images
            original = load_and_normalize_image(original_file_path)
            denoised = load_and_normalize_image(result_file)
            
            # Find interesting region for zooming
            crop_coords, crop_size = find_interesting_region(original, denoised)
            
            # Extract crops
            y, x = crop_coords
            original_crop = original[y:y+crop_size, x:x+crop_size]
            denoised_crop = denoised[y:y+crop_size, x:x+crop_size]
            
            # Calculate autocorrelations of the FULL images (not crops)
            print("Calculating autocorrelations of full images...")
            original_autocorr = calculate_autocorrelation(original[1:, 1:], crop_size = 32)
            denoised_autocorr = calculate_autocorrelation(denoised[1:, 1:], crop_size = 32)
            
            # Create visualization with 3x2 layout
            fig, axes = plt.subplots(3, 2, figsize=(12, 18))
            
            # Row 1: Full images
            axes[0, 0].imshow(original, cmap='gray')
            axes[0, 0].set_title("Original (Full Image)", fontsize=14)
            axes[0, 0].axis('off')
            
            # Add rectangle showing crop region
            rect = patches.Rectangle((x, y), crop_size, crop_size, 
                                   linewidth=2, edgecolor='red', facecolor='none')
            axes[0, 0].add_patch(rect)
            
            axes[0, 1].imshow(denoised, cmap='gray')
            axes[0, 1].set_title("Denoised (Full Image)", fontsize=14)
            axes[0, 1].axis('off')
            
            # Add rectangle showing crop region
            rect2 = patches.Rectangle((x, y), crop_size, crop_size, 
                                    linewidth=2, edgecolor='red', facecolor='none')
            axes[0, 1].add_patch(rect2)
            
            # Row 2: Zoomed regions
            axes[1, 0].imshow(original_crop, cmap='gray')
            axes[1, 0].set_title("Original (Zoomed Region)", fontsize=14)
            axes[1, 0].axis('off')
            
            axes[1, 1].imshow(denoised_crop, cmap='gray')
            axes[1, 1].set_title("Denoised (Zoomed Region)", fontsize=14)
            axes[1, 1].axis('off')
            
            # Row 3: Autocorrelations of full images (cropped to central region)
            im3 = axes[2, 0].imshow(original_autocorr, cmap='viridis')
            axes[2, 0].set_title("Original Autocorrelation (Center)", fontsize=14)
            axes[2, 0].axis('off')
            plt.colorbar(im3, ax=axes[2, 0], fraction=0.046, pad=0.04)
            
            im4 = axes[2, 1].imshow(denoised_autocorr, cmap='viridis')
            axes[2, 1].set_title("Denoised Autocorrelation (Center)", fontsize=14)
            axes[2, 1].axis('off')
            plt.colorbar(im4, ax=axes[2, 1], fraction=0.046, pad=0.04)
            
            stages_run = ' + '.join([s.capitalize() for s in summary['stages_run']])
            plt.suptitle(f"Pipeline Results ({stages_run})\nRed boxes show zoomed region", fontsize=16)
            plt.tight_layout()
            plt.show()
            
        else:
            print("Could not find corresponding original file for visualization")
    else:
        print("No result files found for visualization")


def find_interesting_region(original, denoised, crop_size=None, min_structure_ratio=0.1):
    """
    Find an interesting region in the image for detailed visualization.
    
    This function looks for regions with:
    1. High variance (indicating structure/details)
    2. Significant denoising effect
    3. Good contrast
    
    Args:
        original (numpy.ndarray): Original image
        denoised (numpy.ndarray): Denoised image  
        crop_size (int, optional): Size of crop region. Auto-calculated if None.
        min_structure_ratio (float): Minimum ratio of variance to consider a region interesting
        
    Returns:
        tuple: ((y, x), crop_size) - coordinates and size of interesting region
    """
    import numpy as np
    
    h, w = original.shape
    
    # Auto-calculate crop size if not provided (roughly 1/4 to 1/6 of image)
    if crop_size is None:
        crop_size = min(h, w) // 5
        crop_size = max(crop_size, 64)  # Minimum 64 pixels
        crop_size = min(crop_size, 256)  # Maximum 256 pixels
    
    # Ensure crop size doesn't exceed image dimensions
    crop_size = min(crop_size, h-10, w-10)
    
    best_score = -1
    best_coords = (h//2 - crop_size//2, w//2 - crop_size//2)  # Default to center
    
    # Calculate step size for sampling (don't check every pixel)
    step = max(crop_size // 4, 10)
    
    # Sample potential crop regions
    for y in range(0, h - crop_size, step):
        for x in range(0, w - crop_size, step):
            # Extract crop regions
            orig_crop = original[y:y+crop_size, x:x+crop_size]
            denoised_crop = denoised[y:y+crop_size, x:x+crop_size]
            
            # Calculate metrics for this region
            
            # 1. Variance (indicates structure/detail)
            variance_score = np.var(orig_crop)
            
            # 2. Denoising effect (how much the image changed)
            diff_score = np.mean(np.abs(orig_crop - denoised_crop))
            
            # 3. Edge density (indicates interesting structures)
            from skimage import filters
            edges = filters.sobel(orig_crop)
            edge_score = np.mean(edges)
            
            # 4. Avoid mostly background regions (very low or very high intensity)
            mean_intensity = np.mean(orig_crop)
            intensity_score = 1.0 - abs(mean_intensity - 0.5) * 2  # Prefer middle intensities
            
            # 5. Local contrast
            local_contrast = np.std(orig_crop)
            
            # Combine scores (weighted combination)
            combined_score = (
                variance_score * 0.3 +
                diff_score * 10.0 +  # Amplify difference effect
                edge_score * 2.0 +
                intensity_score * 0.2 +
                local_contrast * 0.3
            )
            
            # Only consider regions with minimum structure
            if variance_score > min_structure_ratio * np.var(original):
                if combined_score > best_score:
                    best_score = combined_score
                    best_coords = (y, x)
    
    print(f"Selected interesting region at {best_coords} with score {best_score:.4f}")
    return best_coords, crop_size