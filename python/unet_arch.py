"""
Workspace U-Net (2D) used by training, inference and the bioimage.io export.

This file is self-contained on purpose: the bioimage.io exporter copies it
into the package as the architecture source, where only torch may be
imported. Keep module attribute names stable (encoder_layers, bottleneck,
decoder_layers, final_conv): they are the state-dict keys of every model
trained in the workspace.
"""

import torch
import torch.nn as nn


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
                    out_features//2, 
                    kernel_size=2, 
                    stride=2
                )
            )
            self.decoder_layers.append(
                self.conv_block(out_features, out_features//2, name=f"decoder_block_{i}")
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
            
            # Reflect-pad to match skip connection dimensions.
            # Assumes x <= skip on both spatial dims (true for this encoder:
            # skip is saved pre-MaxPool, so ConvTranspose2d stride 2 can only
            # under-shoot odd skip dims). Negative pad would break reflect mode.
            if x.shape[-2:] != skip.shape[-2:]:
                diff_h = skip.shape[-2] - x.shape[-2]
                diff_w = skip.shape[-1] - x.shape[-1]
                x = nn.functional.pad(x, [
                    diff_w // 2, diff_w - diff_w // 2,
                    diff_h // 2, diff_h - diff_h // 2
                ], mode='reflect')
            
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
