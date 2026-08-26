"""
Model wrappers for the denoising package.

Only CenterChannelWrapper remains: it is needed to run inference with
LEGACY 2.5D checkpoints (pre-routed two-stage trainings). New routed
models are plain 1-in/1-out 2D models and never need wrapping.
"""

import torch.nn as nn


class CenterChannelWrapper(nn.Module):
    """
    Wrapper that extracts only the center channel from a 3-channel output model.

    In the retired 2.5D mode, Stage 1 models were trained with out_channels=3
    (for 3D autocorrelation analysis). During inference only the center
    channel (index 1), which predicts the center slice of the triplet, is
    needed. This wrapper makes such a legacy model compatible with the
    predictor, which expects 1-channel output.

    Args:
        model: The underlying model to wrap
        output_channels: Expected number of output channels (default: 3)
    """

    def __init__(self, model, output_channels=3):
        super().__init__()
        self.model = model
        self.output_channels = output_channels

    def forward(self, x):
        output = self.model(x)
        # If model outputs 3 channels, extract only the center channel (index 1)
        if output.shape[1] == 3:
            return output[:, 1:2, :, :]  # Keep dims: (B, 1, H, W)
        return output
