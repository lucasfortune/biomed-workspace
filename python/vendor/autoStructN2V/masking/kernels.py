# autoStructN2V/masking/kernels.py
import numpy as np

def create_stage1_mask_kernel(center_size):
    """
    Create a square boolean kernel of shape ``(center_size, center_size)``,
    all True. Used as the per-placement pattern in :func:`create_full_mask`.

    Spacing between placements is enforced by the 8-connectivity dilation of
    ``forbidden`` after each placement (see ``masking/utilities.py``), not by
    the kernel geometry itself. The pre-2026-05-13 implementation returned a
    ``(center_size + 2)`` kernel with a False border serving as that spacing
    guard — but the border was redundant with the post-placement dilation
    AND prevented prediction centers from reaching the outer 1 px of the
    patch, producing an untrained edge band whose corruption swamped the
    autocorrelation used by the Stage-2 mask extractor.

    Args:
        center_size (int): Side length of the True square. Must be odd so
            ``pattern_size // 2`` is the geometric center.

    Returns:
        np.ndarray: ``(center_size, center_size)`` all-True boolean kernel.
    """
    if center_size < 1:
        raise ValueError("center_size must be at least 1")
    if center_size % 2 == 0:
        raise ValueError("center_size must be odd")
    return np.ones((center_size, center_size), dtype=bool)

def create_blind_spot_kernel(kernel_size=3):
    """
    Create a typical blind-spot kernel used in Noise2Void.
    This is a 2D array with True values everywhere except the center.

    Args:
        kernel_size (int): Size of the kernel (must be odd)

    Returns:
        numpy.ndarray: Boolean kernel with False only at the center
    """
    if kernel_size % 2 == 0:
        raise ValueError("kernel_size must be odd")

    kernel = np.ones((kernel_size, kernel_size), dtype=bool)
    center = kernel_size // 2
    kernel[center, center] = False

    return kernel


def create_stage1_mask_kernel_3d(center_size=1):
    """
    Create a 3D boolean kernel of shape ``(3, center_size, center_size)``,
    all True, for 2.5D Stage 1 masking.

    For 2.5D mode:
    - The mask is applied across all 3 input slices
    - But prediction/loss is only computed on the center slice (dz=0)
    - The prediction kernel (created by ``create_full_mask_3d``) will only
      mark center slice positions as True

    Spacing between placements is enforced by the dilation step in
    ``create_full_mask_3d``, not by the kernel geometry. See the 2D
    :func:`create_stage1_mask_kernel` docstring for the rationale behind
    dropping the False border that the pre-2026-05-13 implementation added.

    Args:
        center_size (int): Side length of the True square per slice. Must be
            odd.

    Returns:
        np.ndarray: ``(3, center_size, center_size)`` all-True boolean kernel.
    """
    if center_size < 1:
        raise ValueError("center_size must be at least 1")
    if center_size % 2 == 0:
        raise ValueError("center_size must be odd")
    return np.ones((3, center_size, center_size), dtype=bool)