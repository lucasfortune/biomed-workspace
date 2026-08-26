# autoStructN2V/masking/__init__.py
from .kernels import create_stage1_mask_kernel, create_blind_spot_kernel, create_stage1_mask_kernel_3d
from .utilities import create_full_mask, create_mask_for_training, create_full_mask_3d, create_random_mask_3d

__all__ = [
    # 2D masking functions
    'create_stage1_mask_kernel',
    'create_blind_spot_kernel',
    'create_full_mask',
    'create_mask_for_training',
    # 3D masking functions (for 2.5D mode)
    'create_stage1_mask_kernel_3d',
    'create_full_mask_3d',
    'create_random_mask_3d',
]