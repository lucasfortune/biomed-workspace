# models/unet.py
import torch
import torch.nn as nn
import torch.nn.functional as F

class FlexibleUNet(nn.Module):
    """ 
    Flexible U-Net architecture with resize convolution to reduce checkerboard artifacts.
    
    This U-Net implementation uses resize convolution instead of transposed convolution
    in the decoder pathway to minimize checkerboard artifacts. Resize convolution 
    separates upsampling (via interpolation) from feature learning (via convolution).
    
    Architecture Overview:
    - Encoder: Series of convolutional blocks followed by max pooling
    - Bottleneck: Deepest layer connecting encoder and decoder
    - Decoder: Series of upsampling (interpolation) + convolution + concatenation with skip connections
    - Each conv block: Conv2D -> BatchNorm -> ReLU -> Conv2D -> BatchNorm -> ReLU
    
    Args:
        features (int): Number of features in the first encoder layer. Each subsequent
            layer doubles the number of features.
        num_layers (int): Number of down/up-sampling layers. Determines the depth
            of the U-Net and how much context it can capture.
        in_channels (int, optional): Number of input image channels. Defaults to 1
            for grayscale images.
        out_channels (int, optional): Number of output channels. Defaults to 1
            for single-channel denoised output.
        upsampling_mode (str, optional): Upsampling mode for resize convolution.
            Options: 'bilinear', 'nearest', 'bicubic'. Defaults to 'bilinear'.
        use_transposed_conv (bool, optional): If True, uses classical transposed 
            convolution. If False, uses resize convolution. Defaults to False.
            
    Input Shape:
        - Input: (batch_size, in_channels, height, width)
        - Output: (batch_size, out_channels, height, width)
        
    Note: Input dimensions should be divisible by 2^num_layers to avoid size
    mismatches in the decoder path.
    """
    def __init__(self, features, num_layers, in_channels=1, out_channels=1, 
                 upsampling_mode='bilinear', use_transposed_conv=False):
        super(FlexibleUNet, self).__init__() 
        
        # Input validation
        if features <= 0 or num_layers <= 0:
            raise ValueError("features and num_layers must be positive integers")
        if in_channels <= 0 or out_channels <= 0:
            raise ValueError("in_channels and out_channels must be positive integers")
        if upsampling_mode not in ['bilinear', 'nearest', 'bicubic']:
            raise ValueError("upsampling_mode must be 'bilinear', 'nearest', or 'bicubic'")
            
        self.num_layers = num_layers
        self.upsampling_mode = upsampling_mode
        self.use_transposed_conv = use_transposed_conv
        
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
            if self.use_transposed_conv:
                # Classical transposed convolution (may cause checkerboard artifacts)
                self.decoder_layers.append(
                    nn.ConvTranspose2d(
                        out_features, 
                        out_features//2, 
                        kernel_size=2, 
                        stride=2
                    )
                )
            else:
                # Resize convolution approach (reduces checkerboard artifacts)
                self.decoder_layers.append(
                    ResizeConvolution(
                        out_features, 
                        out_features//2, 
                        upsampling_mode=upsampling_mode
                    )
                )
            
            self.decoder_layers.append(
                self.conv_block(out_features, out_features//2, name=f"decoder_block_{i}")
            )
            out_features //= 2

        # Final convolution to produce output
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
            # Upsampling (either transposed conv or resize conv)
            x = self.decoder_layers[i](x)
            # Get corresponding skip connection
            skip = skip_connections.pop()
            
            # Ensure shapes match for concatenation
            if x.shape[-2:] != skip.shape[-2:]:  # Compare only spatial dimensions
                raise RuntimeError(
                    f"Shape mismatch in decoder spatial dimensions: "
                    f"upsampled={x.shape[-2:]} vs skip={skip.shape[-2:]}"
                )
            
            # Concatenate skip connection
            x = torch.cat([x, skip], dim=1)
            # Convolution block
            x = self.decoder_layers[i + 1](x)
    
        return self.final_conv(x)

    def conv_block(self, in_channels, out_channels, name=None):
        """
        Creates a convolutional block with double convolution.
        
        Each convolution is followed by batch normalization and ReLU activation.
        This block maintains the spatial dimensions of the input.
        
        Args:
            in_channels (int): Number of input channels
            out_channels (int): Number of output channels
            name (str, optional): Name for the block, useful for debugging
            
        Returns:
            nn.Sequential: A sequential container of layers
        """
        return nn.Sequential(
            nn.ReflectionPad2d(1),  # Replace standard padding with reflection padding
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=0),  # No padding in Conv2d
            nn.BatchNorm2d(out_channels),
            #nn.ReLU(inplace=True),
            nn.ELU(inplace=True),
            #nn.Dropout2d(p=0.1),
            nn.ReflectionPad2d(1),  # Replace standard padding with reflection padding
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=0),  # No padding in Conv2d
            nn.BatchNorm2d(out_channels),
            #nn.ReLU(inplace=True)
            nn.ELU(inplace=True),
        )

    def _init_weights(self, m):
        """
        Initialize the weights using He initialization.
        
        This initialization is suitable for ReLU-based networks and helps
        maintain good gradient flow through the network.
        
        Args:
            m (nn.Module): Module whose weights need to be initialized
        """
        if isinstance(m, (nn.Conv2d, nn.ConvTranspose2d)):
            nn.init.kaiming_normal_(m.weight, nonlinearity='relu')
            if m.bias is not None:
                nn.init.constant_(m.bias, 0)


# Fixed ResizeConvolution class in autoStructN2V/models/unet.py

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
    """
    def __init__(self, in_channels, out_channels, upsampling_mode='bilinear', scale_factor=2):
        super(ResizeConvolution, self).__init__()
        
        self.upsampling_mode = upsampling_mode
        self.scale_factor = scale_factor
        
        # Convolution to reduce channels after upsampling
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1)
        
        # Initialize weights
        nn.init.kaiming_normal_(self.conv.weight, nonlinearity='relu')
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