# models/auto_struct_n2v.py
import torch
import torch.nn as nn

from .unet import FlexibleUNet


class AutoStructN2VModel(nn.Module):
    """
    AutoStructN2V model implementing the 2-stage autoStructNoise2Void approach.

    This model implements a specialized denoising pipeline that combines single-pixel
    denoising (Stage 1: N2V) with structured denoising (Stage 2: StructN2V) into a
    unified approach. Both stages utilize the same UNet architecture but differ in
    how they are trained.

    Args:
        features (int): Number of features in the first UNet layer
        num_layers (int): Number of down/up-sampling layers in the UNet
        in_channels (int, optional): Number of input channels. Defaults to 1.
        out_channels (int, optional): Number of output channels. Defaults to 1.
        stage (str, optional): The stage this model represents ('stage1' or 'stage2').
            Defaults to None.
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
    """
    def __init__(self, features, num_layers, in_channels=1, out_channels=1, stage=None,
                 use_resize_conv=True, upsampling_mode='bilinear',
                 remove_top_skip=False, use_blurpool=False, activation='elu',
                 norm_type='batch', num_groups=8, init_scale=1.0):
        super(AutoStructN2VModel, self).__init__()

        # The core UNet architecture
        self.unet = FlexibleUNet(
            features=features,
            num_layers=num_layers,
            in_channels=in_channels,
            out_channels=out_channels,
            use_transposed_conv=not use_resize_conv,
            upsampling_mode=upsampling_mode,
            remove_top_skip=remove_top_skip,
            use_blurpool=use_blurpool,
            activation=activation,
            norm_type=norm_type,
            num_groups=num_groups,
            init_scale=init_scale,
        )

        # Track which stage this model represents
        self.stage = stage

    def forward(self, x):
        """
        Forward pass through the AutoStructN2V model.

        Args:
            x (torch.Tensor): Input noisy tensor of shape (batch_size, in_channels, H, W)

        Returns:
            torch.Tensor: Denoised output tensor of shape (batch_size, out_channels, H, W)
        """
        # Both stages use the same UNet architecture for forward pass
        return self.unet(x)

    @classmethod
    def create_stage1_model(cls, features, num_layers, in_channels=1, out_channels=1,
                           use_resize_conv=True, upsampling_mode='bilinear',
                           remove_top_skip=False, use_blurpool=False, activation='elu',
                           norm_type='batch', num_groups=8, init_scale=1.0):
        """Factory method to create a Stage 1 model (standard N2V)."""
        return cls(features, num_layers, in_channels, out_channels, stage='stage1',
                  use_resize_conv=use_resize_conv, upsampling_mode=upsampling_mode,
                  remove_top_skip=remove_top_skip, use_blurpool=use_blurpool,
                  activation=activation, norm_type=norm_type, num_groups=num_groups,
                  init_scale=init_scale)

    @classmethod
    def create_stage2_model(cls, features, num_layers, in_channels=1, out_channels=1,
                           use_resize_conv=True, upsampling_mode='bilinear',
                           remove_top_skip=False, use_blurpool=False, activation='elu',
                           norm_type='batch', num_groups=8, init_scale=1.0):
        """Factory method to create a Stage 2 model (structured N2V)."""
        return cls(features, num_layers, in_channels, out_channels, stage='stage2',
                  use_resize_conv=use_resize_conv, upsampling_mode=upsampling_mode,
                  remove_top_skip=remove_top_skip, use_blurpool=use_blurpool,
                  activation=activation, norm_type=norm_type, num_groups=num_groups,
                  init_scale=init_scale)
