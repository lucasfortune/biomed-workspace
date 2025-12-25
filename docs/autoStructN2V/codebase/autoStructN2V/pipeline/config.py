# autoStructN2V/pipeline/config.py
import os
import copy

def validate_config(config):
    """
    Validate and complete configuration with default values.
    
    Args:
        config (dict): User-provided configuration
        
    Returns:
        dict: Validated and completed configuration
    """
    # Create deep copy to avoid modifying original
    cfg = copy.deepcopy(config)
    
    # Set defaults for missing values
    defaults = {
        # General parameters (existing ones remain the same)
        'experiment_name': 'autoStructN2V_experiment',
        'output_dir': './results',
        'random_seed': 42,
        'device': 'cuda',
        'split_ratio': (0.7, 0.15, 0.15),
        'image_extension': '.tif',
        'verbose': False,
        'run_stage1': True,
        'run_stage2': True,
        'num_epochs': 100,
        'early_stopping': True,
        'early_stopping_patience': 10,
        
        # First stage parameters
        'stage1': {
            'features': 64,
            'num_layers': 2,
            'patch_size': 32,
            'batch_size': 4,
            'learning_rate': 1e-4,
            'patches_per_image': 100,
            'mask_percentage': 15.0,
            'mask_center_size': 1,
            'masking_strategy': 0, # 0: local mean, 1: zeros, 2: random values
            'use_roi': True,
            'roi_threshold': 0.5,
            'scale_factor': 0.25,
            'select_background': True,
            'use_augmentation': True,
            
            # New parameters for controlling checkerboard artifacts
            'use_resize_conv': True,      # Use resize convolution (reduces artifacts)
            'upsampling_mode': 'bilinear' # Upsampling interpolation mode: bilinear, nearest or bicubic
        },
        
        # Second stage parameters
        'stage2': {
            'features': 64,
            'num_layers': 2,
            'patch_size': 64,
            'batch_size': 2,
            'learning_rate': 1e-5,
            'patches_per_image': 200,
            'mask_percentage': 10.0,
            'masking_strategy': 0, # 0: local mean, 1: zeros, 2: random values
            'use_roi': False,
            'roi_threshold': 0.5,
            'scale_factor': 0.25,
            'select_background': False,
            'use_augmentation': True,
            
            # New parameters for controlling checkerboard artifacts
            'use_resize_conv': True,      # Use resize convolution (reduces artifacts)
            'upsampling_mode': 'bilinear', # Upsampling interpolation mode
            
            # Mask source configuration
            'mask_source': 'stage1',
            'mask_file_path': None,
            
            'extractor': {
                'norm_autocorr': True,
                'log_autocorr': True,
                'crop_autocorr': True,
                'adapt_autocorr': True,
                'adapt_CB': 50.0,
                'adapt_DF': 0.95,
                'center_size': 10,
                'base_percentile': 50,
                'percentile_decay': 1.15,
                'center_ratio_threshold': 0.3,
                'use_center_proximity': True,
                'center_proximity_threshold': 0.95,
                'keep_center_component_only': True,
                'max_true_pixels': 25
            }
        }
    }
    
    # Merge defaults with provided config (existing merge logic remains the same)
    for key, value in defaults.items():
        if key not in cfg:
            cfg[key] = value
        elif isinstance(value, dict) and isinstance(cfg[key], dict):
            for subkey, subvalue in value.items():
                if subkey not in cfg[key]:
                    cfg[key][subkey] = subvalue
    
    # Validate new upsampling parameters
    _validate_upsampling_configuration(cfg)
    
    # Existing validation
    _validate_stage_configuration(cfg)
    
    if 'input_dir' not in cfg:
        raise ValueError("input_dir must be specified in the configuration")
    
    for key in ['input_dir', 'output_dir']:
        if key in cfg and not cfg[key].endswith('/'):
            cfg[key] = cfg[key] + '/'
    
    return cfg

def _validate_upsampling_configuration(cfg):
    """
    Validate upsampling-related configuration options.
    
    Args:
        cfg (dict): Configuration dictionary
        
    Raises:
        ValueError: If upsampling configuration is invalid
    """
    valid_modes = ['bilinear', 'nearest', 'bicubic']
    
    for stage in ['stage1', 'stage2']:
        if stage in cfg and cfg['run_' + stage]:
            stage_cfg = cfg[stage]
            
            # Validate upsampling mode
            if 'upsampling_mode' in stage_cfg:
                mode = stage_cfg['upsampling_mode']
                if mode not in valid_modes:
                    raise ValueError(
                        f"Invalid upsampling_mode '{mode}' for {stage}. "
                        f"Must be one of: {valid_modes}"
                    )
            
            # Validate use_resize_conv
            if 'use_resize_conv' in stage_cfg:
                use_resize = stage_cfg['use_resize_conv']
                if not isinstance(use_resize, bool):
                    raise ValueError(
                        f"use_resize_conv for {stage} must be boolean, got {type(use_resize)}"
                    )
                
                # Warn if using transposed convolution
                if not use_resize:
                    print(f"Warning: {stage} is using transposed convolution which may "
                          f"cause checkerboard artifacts. Consider setting use_resize_conv=True.")


def _validate_stage_configuration(cfg):
    """
    Validate stage-specific configuration options.
    
    Args:
        cfg (dict): Configuration dictionary
        
    Raises:
        ValueError: If configuration is invalid
    """
    # Check that at least one stage is enabled
    if not cfg['run_stage1'] and not cfg['run_stage2']:
        raise ValueError("At least one of run_stage1 or run_stage2 must be True")
    
    # Validate stage 2 mask source configuration
    if cfg['run_stage2']:
        mask_source = cfg['stage2']['mask_source']
        
        if mask_source not in ['stage1', 'file', 'extractor']:
            raise ValueError(f"Invalid mask_source '{mask_source}'. Must be 'stage1', 'file', or 'extractor'")
        
        # If stage 2 is enabled but stage 1 is not, mask_source cannot be 'stage1'
        if not cfg['run_stage1'] and mask_source == 'stage1':
            raise ValueError(
                "mask_source cannot be 'stage1' when run_stage1 is False. "
                "Use 'file' or 'extractor' instead."
            )
        
        # If mask_source is 'file', mask_file_path must be provided
        if mask_source == 'file':
            mask_file_path = cfg['stage2']['mask_file_path']
            if mask_file_path is None:
                raise ValueError("mask_file_path must be provided when mask_source is 'file'")
            if not os.path.exists(mask_file_path):
                raise ValueError(f"Mask file not found: {mask_file_path}")
            if not mask_file_path.endswith('.npy'):
                raise ValueError("Mask file must be a .npy file")

def create_output_directories(config):
    """
    Create all necessary directories for the pipeline.
    
    Args:
        config (dict): Validated configuration
        
    Returns:
        dict: Dictionary with paths to all output directories
    """
    base_dir = config['output_dir']
    experiment_name = config['experiment_name']
    
    # Create experiment directory
    experiment_dir = os.path.join(base_dir, experiment_name)
    os.makedirs(experiment_dir, exist_ok=True)
    
    # Create subdirectories based on which stages are enabled
    dirs = {
        'experiment': experiment_dir,
        'data': os.path.join(experiment_dir, 'data'),
        'final_results': os.path.join(experiment_dir, 'final_results')
    }
    
    # Create stage-specific directories only if stages are enabled
    if config['run_stage1']:
        dirs['stage1'] = {
            'model': os.path.join(experiment_dir, 'stage1', 'model'),
            'logs': os.path.join(experiment_dir, 'stage1', 'logs'),
            'results': os.path.join(experiment_dir, 'stage1', 'results')
        }
    
    if config['run_stage2']:
        dirs['stage2'] = {
            'model': os.path.join(experiment_dir, 'stage2', 'model'),
            'logs': os.path.join(experiment_dir, 'stage2', 'logs'),
            'results': os.path.join(experiment_dir, 'stage2', 'results')
        }
    
    # Create each directory
    for _, path in dirs.items():
        if isinstance(path, dict):
            for _, subpath in path.items():
                os.makedirs(subpath, exist_ok=True)
        else:
            os.makedirs(path, exist_ok=True)
    
    # Create specific data subdirectories
    data_subdirs = ['train', 'val', 'test']
    if config['run_stage1']:
        data_subdirs.append('stage1_denoised')
    
    for subdir in data_subdirs:
        os.makedirs(os.path.join(dirs['data'], subdir), exist_ok=True)
    
    return dirs