# models/factory.py
from .auto_struct_n2v import AutoStructN2VModel


def create_model(stage, use_resize_conv=True, upsampling_mode='bilinear',
                 remove_top_skip=False, use_blurpool=False, activation='elu',
                 norm_type='batch', num_groups=8, init_scale=1.0,
                 **kwargs):
    """
    Factory function to create appropriate model based on the stage.

    Args:
        stage (str): Training stage ('stage1' or 'stage2')
        use_resize_conv (bool, optional): Whether to use resize convolution instead
            of transposed convolution. Defaults to True (reduces checkerboard artifacts).
        upsampling_mode (str, optional): Upsampling mode for resize convolution.
            Options: 'bilinear', 'nearest', 'bicubic'. Defaults to 'bilinear'.
        remove_top_skip (bool, optional): Drop the topmost U-Net skip-connection
            (N2V2). Defaults to False.
        use_blurpool (bool, optional): Replace MaxPool with MaxBlurPool (N2V2).
            Defaults to False.
        activation (str, optional): 'elu' (legacy) or 'relu' (N2V/N2V2). Defaults
            to 'elu' for backward compatibility.
        norm_type (str, optional): Normalization layer in conv blocks: 'batch'
            (legacy default), 'group', 'instance', or 'none'. See FlexibleUNet.
        num_groups (int, optional): Number of groups for norm_type='group'.
            Defaults to 8.
        **kwargs: Keyword arguments to pass to the model constructor

    Returns:
        nn.Module: Instantiated model

    Raises:
        ValueError: If stage is not recognized
    """
    common = dict(
        use_resize_conv=use_resize_conv,
        upsampling_mode=upsampling_mode,
        remove_top_skip=remove_top_skip,
        use_blurpool=use_blurpool,
        activation=activation,
        norm_type=norm_type,
        num_groups=num_groups,
        init_scale=init_scale,
    )
    if stage.lower() == 'stage1':
        return AutoStructN2VModel.create_stage1_model(**common, **kwargs)
    elif stage.lower() == 'stage2':
        return AutoStructN2VModel.create_stage2_model(**common, **kwargs)
    else:
        raise ValueError(f"Unknown stage: {stage}. Must be 'stage1' or 'stage2'.")


def create_model_from_config(config, stage):
    """
    Create a model with channels automatically configured based on mode and stage.

    This is the recommended way to create models when using the pipeline config.
    It automatically determines the correct input/output channels based on:
    - mode: '2d' (1 channel) vs '2.5d' (3 channels input)
    - stage: 'stage1' vs 'stage2'
    - run_stage2: Determines Stage 1 output channels in 2.5D mode

    Args:
        config (dict): Validated configuration dictionary (from validate_config)
        stage (str): Training stage ('stage1' or 'stage2')

    Returns:
        nn.Module: Instantiated model with correct channel configuration

    Examples:
        # 2D mode: creates model with in_channels=1, out_channels=1
        config_2d = {'mode': '2d', 'run_stage2': True, ...}
        model = create_model_from_config(config_2d, 'stage1')

        # 2.5D mode Stage 1 with Stage 2: creates model with in_channels=3, out_channels=3
        config_25d = {'mode': '2.5d', 'run_stage2': True, ...}
        model = create_model_from_config(config_25d, 'stage1')

        # 2.5D mode Stage 2: creates model with in_channels=3, out_channels=1
        model = create_model_from_config(config_25d, 'stage2')
    """
    # Lazy import to avoid circular dependency
    from ..pipeline.config import get_model_channels

    # Get stage-specific config
    stage_config = config[stage]

    # Determine channels based on mode
    in_channels, out_channels = get_model_channels(config, stage)

    # Create model with appropriate channels
    model = create_model(
        stage=stage,
        features=stage_config['features'],
        num_layers=stage_config['num_layers'],
        in_channels=in_channels,
        out_channels=out_channels,
        use_resize_conv=stage_config.get('use_resize_conv', True),
        upsampling_mode=stage_config.get('upsampling_mode', 'bilinear'),
        remove_top_skip=stage_config.get('remove_top_skip', False),
        use_blurpool=stage_config.get('use_blurpool', False),
        activation=stage_config.get('activation', 'elu'),
        norm_type=stage_config.get('norm_type', 'batch'),
        num_groups=stage_config.get('num_groups', 8),
        init_scale=stage_config.get('init_scale', 1.0),
    )

    return model