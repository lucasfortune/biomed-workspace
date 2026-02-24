"""
U-Net model architectures for biomedical image segmentation.

UNet: Standard 2D single-head model (class labels).
UNet25D: Direction-aware 2.5D dual-head model (segmentation + direction vectors).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class UNet(nn.Module):
    def __init__(self, features, num_layers, in_channels=1, num_classes=3):
        super(UNet, self).__init__()

        # Input validation
        if features <= 0 or num_layers <= 0:
            raise ValueError("features and num_layers must be positive integers")
        if in_channels <= 0 or num_classes <= 0:
            raise ValueError("in_channels and num_classes must be positive integers")

        self.num_layers = num_layers

        # Encoder pathway
        self.encoder_layers = nn.ModuleList()
        in_features = in_channels
        out_features = features
        for _ in range(num_layers):
            self.encoder_layers.append(
                self.conv_block(in_features, out_features, name=f"encoder_block_{_}")
            )
            self.encoder_layers.append(
                nn.MaxPool2d(kernel_size=2, stride=2)
            )
            in_features = out_features
            out_features *= 2

        # Bottleneck
        self.bottleneck = self.conv_block(in_features, out_features, name="bottleneck")

        # Decoder pathway
        self.decoder_layers = nn.ModuleList()
        for i in range(num_layers):
            self.decoder_layers.append(
                nn.ConvTranspose2d(
                    out_features,
                    out_features // 2,
                    kernel_size=2,
                    stride=2
                )
            )
            self.decoder_layers.append(
                self.conv_block(out_features, out_features // 2, name=f"decoder_block_{i}")
            )
            out_features //= 2

        # Final convolution to produce output with num_classes channels
        self.final_conv = nn.Conv2d(features, num_classes, kernel_size=1)

        # Initialize weights
        self.apply(self._init_weights)

    def forward(self, x):
        # Store skip connections
        skip_connections = []

        # Encoder pathway with skip connections
        for i in range(0, len(self.encoder_layers), 2):
            # Convolution block
            x = self.encoder_layers[i](x)
            skip_connections.append(x)
            # Max pooling
            x = self.encoder_layers[i + 1](x)

        # Bottleneck
        x = self.bottleneck(x)

        # Decoder pathway with skip connections
        for i in range(0, len(self.decoder_layers), 2):
            # Upsampling
            x = self.decoder_layers[i](x)
            # Get corresponding skip connection
            skip = skip_connections.pop()

            # Ensure shapes match for concatenation
            if x.shape[-2:] != skip.shape[-2:]:
                raise RuntimeError(
                    f"Shape mismatch in decoder spatial dimensions: "
                    f"upsampled={x.shape[-2:]} vs skip={skip.shape[-2:]}"
                )

            # Concatenate skip connection
            x = torch.cat([x, skip], dim=1)
            # Convolution block
            x = self.decoder_layers[i + 1](x)

        # Final convolution
        x = self.final_conv(x)

        return x

    def conv_block(self, in_channels, out_channels, name=None):
        return nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def _init_weights(self, m):
        if isinstance(m, (nn.Conv2d, nn.ConvTranspose2d)):
            nn.init.kaiming_normal_(m.weight, nonlinearity='relu')
            if m.bias is not None:
                nn.init.constant_(m.bias, 0)


class UNet25D(nn.Module):
    """
    Direction-aware 2.5D U-Net with dual output heads.

    Identical encoder-decoder structure to UNet, but with:
    - seg_head: segmentation logits (replaces final_conv)
    - dir_head: unit-normalized direction vectors (3 components)

    Args:
        features: Base number of feature channels.
        num_layers: Number of encoder/decoder levels.
        in_channels: Number of input channels (default 3 for triplet input).
        num_classes: Number of segmentation classes.
        has_direction_head: When False, returns single tensor (same API as UNet).
    """

    def __init__(self, features, num_layers, in_channels=3, num_classes=3,
                 has_direction_head=True):
        super(UNet25D, self).__init__()

        if features <= 0 or num_layers <= 0:
            raise ValueError("features and num_layers must be positive integers")
        if in_channels <= 0 or num_classes <= 0:
            raise ValueError("in_channels and num_classes must be positive integers")

        self.num_layers = num_layers
        self.has_direction_head = has_direction_head

        # Encoder pathway
        self.encoder_layers = nn.ModuleList()
        in_features = in_channels
        out_features = features
        for _ in range(num_layers):
            self.encoder_layers.append(
                self._conv_block(in_features, out_features)
            )
            self.encoder_layers.append(
                nn.MaxPool2d(kernel_size=2, stride=2)
            )
            in_features = out_features
            out_features *= 2

        # Bottleneck
        self.bottleneck = self._conv_block(in_features, out_features)

        # Decoder pathway
        self.decoder_layers = nn.ModuleList()
        for i in range(num_layers):
            self.decoder_layers.append(
                nn.ConvTranspose2d(
                    out_features,
                    out_features // 2,
                    kernel_size=2,
                    stride=2
                )
            )
            self.decoder_layers.append(
                self._conv_block(out_features, out_features // 2)
            )
            out_features //= 2

        # Segmentation head (replaces final_conv)
        self.seg_head = nn.Conv2d(features, num_classes, kernel_size=1)

        # Direction head: extra conv block for regression → 3-component unit vector
        if self.has_direction_head:
            mid_ch = max(features // 2, 8)
            self.dir_head = nn.Sequential(
                nn.Conv2d(features, mid_ch, kernel_size=3, padding=1),
                nn.BatchNorm2d(mid_ch),
                nn.ReLU(inplace=True),
                nn.Conv2d(mid_ch, 3, kernel_size=1)
            )

        # Initialize weights
        self.apply(self._init_weights)

    def _shared_forward(self, x):
        """Shared encoder-decoder pass returning decoder feature map."""
        skip_connections = []

        # Encoder
        for i in range(0, len(self.encoder_layers), 2):
            x = self.encoder_layers[i](x)
            skip_connections.append(x)
            x = self.encoder_layers[i + 1](x)

        # Bottleneck
        x = self.bottleneck(x)

        # Decoder
        for i in range(0, len(self.decoder_layers), 2):
            x = self.decoder_layers[i](x)
            skip = skip_connections.pop()
            if x.shape[-2:] != skip.shape[-2:]:
                raise RuntimeError(
                    f"Shape mismatch in decoder: upsampled={x.shape[-2:]} vs skip={skip.shape[-2:]}"
                )
            x = torch.cat([x, skip], dim=1)
            x = self.decoder_layers[i + 1](x)

        return x

    def forward(self, x):
        features = self._shared_forward(x)

        seg_logits = self.seg_head(features)

        if not self.has_direction_head:
            return seg_logits

        dir_raw = self.dir_head(features)
        dir_norm = F.normalize(dir_raw, p=2, dim=1, eps=1e-6)

        return seg_logits, dir_norm

    def _conv_block(self, in_channels, out_channels):
        return nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def _init_weights(self, m):
        if isinstance(m, (nn.Conv2d, nn.ConvTranspose2d)):
            nn.init.kaiming_normal_(m.weight, nonlinearity='relu')
            if m.bias is not None:
                nn.init.constant_(m.bias, 0)
