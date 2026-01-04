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
        'mode': '2d',  # '2d' or '2.5d' - processing mode
        
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

    # Validate mode parameter
    _validate_mode_configuration(cfg)

    # Existing validation
    _validate_stage_configuration(cfg)

    # Validate input data - accept either input_data (TIFF stack) or input_dir (directory)
    _validate_input_configuration(cfg)

    # Add trailing slash to output_dir if needed
    if 'output_dir' in cfg and not cfg['output_dir'].endswith('/'):
        cfg['output_dir'] = cfg['output_dir'] + '/'

    # Add trailing slash to input_dir if it's being used (backwards compat)
    if 'input_dir' in cfg and cfg['input_dir'] and not cfg['input_dir'].endswith('/'):
        cfg['input_dir'] = cfg['input_dir'] + '/'

    return cfg


def _validate_input_configuration(cfg):
    """
    Validate input data configuration.

    Accepts either:
    - input_data: Path to a single TIFF stack file (new mode)
    - input_dir: Path to a directory of individual TIFF files (backwards compat)

    Args:
        cfg (dict): Configuration dictionary

    Raises:
        ValueError: If input configuration is invalid
    """
    has_input_data = 'input_data' in cfg and cfg['input_data'] is not None
    has_input_dir = 'input_dir' in cfg and cfg['input_dir'] is not None

    if has_input_data and has_input_dir:
        raise ValueError(
            "Cannot specify both 'input_data' and 'input_dir'. "
            "Use 'input_data' for TIFF stacks or 'input_dir' for directories of individual files."
        )

    if not has_input_data and not has_input_dir:
        raise ValueError(
            "Must specify either 'input_data' (path to TIFF stack) or "
            "'input_dir' (directory of individual TIFF files)"
        )

    if has_input_data:
        # Validate input_data is a valid file path
        input_path = cfg['input_data']
        if not os.path.exists(input_path):
            raise ValueError(f"Input file not found: {input_path}")
        if not input_path.lower().endswith(('.tif', '.tiff')):
            raise ValueError(f"Input file must be a TIFF file (.tif or .tiff): {input_path}")

    if has_input_dir:
        # Validate input_dir exists
        input_dir = cfg['input_dir']
        if not os.path.exists(input_dir):
            raise ValueError(f"Input directory not found: {input_dir}")
        if not os.path.isdir(input_dir):
            raise ValueError(f"Input path is not a directory: {input_dir}")


def _validate_mode_configuration(cfg):
    """
    Validate the processing mode configuration.

    Args:
        cfg (dict): Configuration dictionary

    Raises:
        ValueError: If mode is invalid or incompatible with input type
    """
    valid_modes = ['2d', '2.5d']
    mode = cfg.get('mode', '2d')

    if mode not in valid_modes:
        raise ValueError(
            f"Invalid mode '{mode}'. Must be one of: {valid_modes}"
        )

    # 2.5D mode requires input_data (TIFF stack), not input_dir
    if mode == '2.5d':
        has_input_data = 'input_data' in cfg and cfg['input_data'] is not None
        if not has_input_data:
            raise ValueError(
                "mode='2.5d' requires 'input_data' (TIFF stack). "
                "Directory-based input (input_dir) is not supported for 2.5D mode."
            )


def derive_edge_slice_params(base_params):
    """
    Derive edge slice (dz=-1, dz=+1) extractor parameters from base (center slice) parameters.

    In 2.5D mode, the structural noise extractor analyzes 3D autocorrelation.
    The edge slices (dz != 0) typically need more aggressive thresholding since
    the correlation signal is weaker than at the center slice.

    Based on empirical findings from notebook experiments.

    Args:
        base_params (dict): Base extractor parameters for the center slice (dz=0).
                           Expected keys: adapt_CB, adapt_DF, base_percentile,
                           percentile_decay, max_true_pixels

    Returns:
        dict: Modified parameters for edge slices with adjustments:
              - adapt_CB: +10 (more aggressive threshold)
              - adapt_DF: -0.04 (faster decay)
              - base_percentile: -10 (fewer pixels per ring)
              - percentile_decay: +0.15 (faster ring decay)
              - max_true_pixels: ×0.6 (smaller kernel)
    """
    edge_params = base_params.copy()

    # Apply additive/multiplicative adjustments
    edge_params['adapt_CB'] = base_params.get('adapt_CB', 50.0) + 10
    edge_params['adapt_DF'] = base_params.get('adapt_DF', 0.95) - 0.04
    edge_params['base_percentile'] = base_params.get('base_percentile', 50) - 10
    edge_params['percentile_decay'] = base_params.get('percentile_decay', 1.15) + 0.15
    edge_params['max_true_pixels'] = int(base_params.get('max_true_pixels', 25) * 0.6)

    return edge_params


def get_model_channels(config, stage):
    """
    Determine input and output channels for a model based on mode and stage.

    Channel logic:
    - 2D mode: Always 1 input, 1 output
    - 2.5D mode:
      - Always 3 input channels (triplet of z-1, z, z+1)
      - Stage 1 with run_stage2=True: 3 output channels (for noise analysis)
      - Stage 1 with run_stage2=False: 1 output channel (center slice only)
      - Stage 2: 1 output channel (center slice only)

    Args:
        config (dict): Validated configuration dictionary
        stage (str): 'stage1' or 'stage2'

    Returns:
        tuple: (in_channels, out_channels)
    """
    mode = config.get('mode', '2d')

    if mode == '2d':
        return 1, 1

    # 2.5D mode
    in_channels = 3

    if stage == 'stage1' and config.get('run_stage2', False):
        # Stage 1 needs 3 outputs for noise analysis in Stage 2
        out_channels = 3
    else:
        # Stage 2 or Stage 1-only: predict center slice
        out_channels = 1

    return in_channels, out_channels


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