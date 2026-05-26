# models/unet.py
import torch
import torch.nn as nn
import torch.nn.functional as F


class MaxBlurPool2d(nn.Module):
    """Anti-aliased max-pool (Zhang 2019, "Making convolutional networks
    shift-invariant again"). N2V2 (Höck 2023) recommends this in place of
    plain MaxPool to reduce checkerboard artifacts.

    Splits ``MaxPool2d(2, 2)`` into:
      1. ``MaxPool2d(kernel=2, stride=1)`` — local max with no downsampling.
      2. Reflect-pad + fixed binomial blur conv (depthwise) at stride=2 —
         low-pass anti-aliased downsampling.

    The blur kernel is fixed (not learnable). For an input of spatial size
    H × W with H, W even, the output is (H/2) × (W/2), matching the
    ``MaxPool2d(2, 2)`` it replaces.

    Args:
        channels (int): Number of feature channels (kernel is depthwise).
        blur_size (int): Side length of the blur kernel. 3 (1-2-1) or
            5 (1-4-6-4-1). Default 3.
    """

    def __init__(self, channels: int, blur_size: int = 3):
        super().__init__()
        if blur_size == 3:
            k = torch.tensor([1.0, 2.0, 1.0])
        elif blur_size == 5:
            k = torch.tensor([1.0, 4.0, 6.0, 4.0, 1.0])
        else:
            raise ValueError(f"blur_size must be 3 or 5, got {blur_size}")
        kernel_2d = k[:, None] * k[None, :]
        kernel_2d = kernel_2d / kernel_2d.sum()
        kernel_2d = kernel_2d.expand(channels, 1, blur_size, blur_size).contiguous()
        self.register_buffer("blur_kernel", kernel_2d)
        self.channels = channels
        self.pad = blur_size // 2

    def forward(self, x):
        x = F.max_pool2d(x, kernel_size=2, stride=1, padding=0)
        x = F.pad(x, [self.pad] * 4, mode="reflect")
        x = F.conv2d(x, self.blur_kernel, stride=2, groups=self.channels)
        return x


class FlexibleUNet(nn.Module):
    """
    Flexible U-Net with resize-convolution upsampling and optional N2V2-style
    architectural fixes (top-skip removal, MaxBlurPool, ReLU activation).

    Architecture overview:
    - Encoder: conv block then downsampling (MaxPool or MaxBlurPool).
    - Bottleneck: deepest conv block.
    - Decoder: upsample (resize-conv or transposed) + concat skip + conv block.
    - Each conv block: Conv2D → BN → activation → Conv2D → BN → activation,
      with reflection padding around each conv.

    Args:
        features (int): Number of features in the first encoder layer.
        num_layers (int): Number of down/up-sampling layers.
        in_channels (int): Number of input image channels. Defaults to 1.
        out_channels (int): Number of output channels. Defaults to 1.
        upsampling_mode (str): 'bilinear', 'nearest', or 'bicubic'.
        use_transposed_conv (bool): If True, classical transposed convolution
            in the decoder. If False (default), resize-then-conv.
        remove_top_skip (bool): If True, the topmost (highest-resolution)
            U-Net skip-connection is dropped (per N2V2). Removing it
            prevents the network from copying high-frequency content from
            input to output, which is important for blind-spot training
            (otherwise the model can learn near-identity). Defaults to False.
        use_blurpool (bool): If True, replace plain MaxPool with
            ``MaxBlurPool2d`` (per N2V2). Defaults to False.
        activation (str): 'elu' (legacy default) or 'relu' (N2V/N2V2).
            Determines the activation in conv blocks AND the He-init
            nonlinearity hint (relu → 'relu' gain; elu → 'leaky_relu' gain).
            Defaults to 'elu' for backward compatibility.

    Note: input H, W must be divisible by 2^num_layers.
    """
    def __init__(self, features, num_layers, in_channels=1, out_channels=1,
                 upsampling_mode='bilinear', use_transposed_conv=False,
                 remove_top_skip=False, use_blurpool=False, activation='elu'):
        super(FlexibleUNet, self).__init__()

        if features <= 0 or num_layers <= 0:
            raise ValueError("features and num_layers must be positive integers")
        if in_channels <= 0 or out_channels <= 0:
            raise ValueError("in_channels and out_channels must be positive integers")
        if upsampling_mode not in ['bilinear', 'nearest', 'bicubic']:
            raise ValueError("upsampling_mode must be 'bilinear', 'nearest', or 'bicubic'")
        if activation not in ('elu', 'relu'):
            raise ValueError(f"activation must be 'elu' or 'relu', got {activation!r}")

        self.num_layers = num_layers
        self.upsampling_mode = upsampling_mode
        self.use_transposed_conv = use_transposed_conv
        self.remove_top_skip = remove_top_skip
        self.use_blurpool = use_blurpool
        self.activation = activation
        self._init_nonlinearity = 'relu' if activation == 'relu' else 'leaky_relu'

        # Encoder pathway
        self.encoder_layers = nn.ModuleList()
        in_features = in_channels
        out_features = features
        for _ in range(num_layers):
            self.encoder_layers.append(
                self.conv_block(in_features, out_features, name=f"encoder_block_{_}")
            )
            if self.use_blurpool:
                self.encoder_layers.append(MaxBlurPool2d(out_features))
            else:
                self.encoder_layers.append(nn.MaxPool2d(kernel_size=2, stride=2))
            in_features = out_features
            out_features *= 2

        # Bottleneck
        self.bottleneck = self.conv_block(in_features, out_features, name="bottleneck")

        # Decoder pathway
        self.decoder_layers = nn.ModuleList()
        for i in range(num_layers):
            if self.use_transposed_conv:
                self.decoder_layers.append(
                    nn.ConvTranspose2d(
                        out_features,
                        out_features // 2,
                        kernel_size=2,
                        stride=2
                    )
                )
            else:
                self.decoder_layers.append(
                    ResizeConvolution(
                        out_features,
                        out_features // 2,
                        upsampling_mode=upsampling_mode,
                        init_nonlinearity=self._init_nonlinearity,
                    )
                )

            # Decoder conv block — input channels depend on whether the
            # corresponding skip is concatenated. The topmost decoder
            # block (i = num_layers - 1) has its skip dropped when
            # remove_top_skip=True.
            is_topmost = (i == num_layers - 1)
            if self.remove_top_skip and is_topmost:
                decoder_in = out_features // 2  # only upsampled features
            else:
                decoder_in = out_features  # upsampled + skip
            self.decoder_layers.append(
                self.conv_block(decoder_in, out_features // 2, name=f"decoder_block_{i}")
            )
            out_features //= 2

        # Final 1×1 conv to produce output
        self.final_conv = nn.Conv2d(features, out_channels, kernel_size=1)

        # Initialize weights
        self.apply(self._init_weights)

    def forward(self, x):
        """
        Forward pass of the U-Net.

        Args:
            x (torch.Tensor): Input tensor of shape (batch_size, in_channels, H, W)

        Returns:
            torch.Tensor: Output tensor of shape (batch_size, out_channels, H, W)
        """
        skip_connections = []

        # Encoder. The topmost skip is omitted when remove_top_skip=True.
        for i in range(0, len(self.encoder_layers), 2):
            x = self.encoder_layers[i](x)
            level = i // 2  # 0 = topmost (highest-res), num_layers-1 = deepest encoder block
            if not (self.remove_top_skip and level == 0):
                skip_connections.append(x)
            x = self.encoder_layers[i + 1](x)  # downsample

        # Bottleneck
        x = self.bottleneck(x)

        # Decoder. Pop a skip only when one was pushed for that level.
        for i in range(0, len(self.decoder_layers), 2):
            x = self.decoder_layers[i](x)  # upsample
            decoder_idx = i // 2  # 0 = first (deepest) decoder block, num_layers-1 = topmost
            is_topmost = (decoder_idx == self.num_layers - 1)
            if not (self.remove_top_skip and is_topmost):
                skip = skip_connections.pop()
                if x.shape[-2:] != skip.shape[-2:]:
                    raise RuntimeError(
                        f"Shape mismatch in decoder spatial dimensions: "
                        f"upsampled={x.shape[-2:]} vs skip={skip.shape[-2:]}"
                    )
                x = torch.cat([x, skip], dim=1)
            x = self.decoder_layers[i + 1](x)  # conv block

        return self.final_conv(x)

    def conv_block(self, in_channels, out_channels, name=None):
        """Double-conv block with reflection padding and BN.

        Activation is selected by ``self.activation`` ('elu' or 'relu').
        """
        if self.activation == 'relu':
            act1, act2 = nn.ReLU(inplace=True), nn.ReLU(inplace=True)
        else:  # 'elu'
            act1, act2 = nn.ELU(inplace=True), nn.ELU(inplace=True)
        return nn.Sequential(
            nn.ReflectionPad2d(1),
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=0),
            nn.BatchNorm2d(out_channels),
            act1,
            nn.ReflectionPad2d(1),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=0),
            nn.BatchNorm2d(out_channels),
            act2,
        )

    def _init_weights(self, m):
        """He init. The nonlinearity hint follows ``self.activation``:
        'relu' for ReLU activations, 'leaky_relu' for ELU (closest match
        in PyTorch's :func:`torch.nn.init.calculate_gain`)."""
        if isinstance(m, (nn.Conv2d, nn.ConvTranspose2d)):
            nn.init.kaiming_normal_(m.weight, nonlinearity=self._init_nonlinearity)
            if m.bias is not None:
                nn.init.constant_(m.bias, 0)


class ResizeConvolution(nn.Module):
    """
    Resize convolution module that separates upsampling from convolution.

    This approach reduces checkerboard artifacts by using deterministic interpolation
    for upsampling followed by learnable convolution for feature transformation.

    Args:
        in_channels (int): Number of input channels
        out_channels (int): Number of output channels
        upsampling_mode (str): Interpolation mode ('bilinear', 'nearest', 'bicubic')
        scale_factor (int): Factor by which to upsample (default: 2)
        init_nonlinearity (str): Nonlinearity hint for ``kaiming_normal_``
            initialization. Defaults to 'relu' for backward compatibility.
    """
    def __init__(self, in_channels, out_channels, upsampling_mode='bilinear',
                 scale_factor=2, init_nonlinearity='relu'):
        super(ResizeConvolution, self).__init__()

        self.upsampling_mode = upsampling_mode
        self.scale_factor = scale_factor

        # Convolution to reduce channels after upsampling
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1)

        # Initialize weights
        nn.init.kaiming_normal_(self.conv.weight, nonlinearity=init_nonlinearity)
        if self.conv.bias is not None:
            nn.init.constant_(self.conv.bias, 0)

    def forward(self, x):
        """
        Forward pass: upsample then convolve.

        Args:
            x (torch.Tensor): Input tensor

        Returns:
            torch.Tensor: Upsampled and convolved tensor
        """
        # Step 1: Upsample using interpolation with proper align_corners
        if self.upsampling_mode in ['bilinear', 'bicubic']:
            # For bilinear and bicubic, align_corners=True often works better
            x = F.interpolate(
                x,
                scale_factor=self.scale_factor,
                mode=self.upsampling_mode,
                align_corners=True  # FIXED: Use True for both bilinear and bicubic
            )
        else:  # nearest neighbor
            x = F.interpolate(
                x,
                scale_factor=self.scale_factor,
                mode=self.upsampling_mode
                # align_corners not used for nearest neighbor
            )

        # Step 2: Apply convolution
        x = self.conv(x)

        return x


# Convenience functions for creating UNets with specific configurations

def create_standard_unet(features=64, num_layers=3, in_channels=1, out_channels=1):
    """Create a UNet with classical transposed convolution (may have checkerboard artifacts)."""
    return FlexibleUNet(
        features=features,
        num_layers=num_layers,
        in_channels=in_channels,
        out_channels=out_channels,
        use_transposed_conv=True
    )

def create_resize_conv_unet(features=64, num_layers=3, in_channels=1, out_channels=1,
                           upsampling_mode='bilinear'):
    """Create a UNet with resize convolution (reduces checkerboard artifacts)."""
    return FlexibleUNet(
        features=features,
        num_layers=num_layers,
        in_channels=in_channels,
        out_channels=out_channels,
        use_transposed_conv=False,
        upsampling_mode=upsampling_mode
    )
