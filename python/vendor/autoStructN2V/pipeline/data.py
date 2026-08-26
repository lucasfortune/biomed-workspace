# autoStructN2V/pipeline/data.py
"""Data splitting and loader construction for the ROUTED pipeline.

Stack mode only (a single multi-page TIFF split on z-indices). The legacy
path mode (directories of single TIFFs, file copying) and the stage-based
``create_dataloaders`` were retired with the 2026-07-31 restructure
(implemented 2026-08-25).
"""
import random

import numpy as np
import torch
from torch.utils.data import DataLoader

from ..datasets import TrainingDataset, ValidationDataset, TestDataset


def split_stack_indices(num_slices, split_ratio=(0.7, 0.15, 0.15), seed=None, verbose=False):
    """Split z-indices of a TIFF stack into training, validation, and test sets.

    Args:
        num_slices (int): Total number of slices in the stack
        split_ratio (tuple): Ratio for (train, val, test) split
        seed (int, optional): Random seed for reproducibility
        verbose (bool): Whether to print split details

    Returns:
        dict: {'train': [...], 'val': [...], 'test': [...]} sorted z-indices
    """
    if seed is not None:
        random.seed(seed)

    all_indices = list(range(num_slices))
    random.shuffle(all_indices)

    n_train = int(num_slices * split_ratio[0])
    n_val = int(num_slices * split_ratio[1])

    train_indices = sorted(all_indices[:n_train])
    val_indices = sorted(all_indices[n_train:n_train + n_val])
    test_indices = sorted(all_indices[n_train + n_val:])

    if verbose:
        print("\n=== Stack Split Details ===")
        print(f"Total slices: {num_slices}")
        print(f"Training: {len(train_indices)} | Validation: {len(val_indices)} "
              f"| Testing: {len(test_indices)}")
    else:
        print(f"Stack split: {len(train_indices)} training, {len(val_indices)} "
              f"validation, {len(test_indices)} test slices")

    return {'train': train_indices, 'val': val_indices, 'test': test_indices}


def create_routed_dataloaders(config, recipe, single_kernel, stack, slice_indices,
                              verbose=False):
    """Build train/val/test loaders for ONE routed training run.

    Args:
        config (dict): the validated top-level config (normalize stats etc.).
        recipe (dict): the branch recipe (``config['recipes'][branch]``).
        single_kernel (np.ndarray): small bool mask kernel from the
            ``RouteDecision`` (1x1 for the N2V branch — mechanically the same
            code path; ``create_full_mask`` on a 1x1 kernel reproduces the
            plain-N2V blind-spot masking).
        stack (np.ndarray): the loaded noisy stack (N, H, W).
        slice_indices (dict): from :func:`split_stack_indices`.

    Returns:
        (train_loader, val_loader, test_loader)
    """
    norm_stats = config.get('_norm_stats')
    common = dict(
        stack=stack,
        mode='2d',
        patch_size=recipe['patch_size'],
        single_kernel=single_kernel,
        mask_percentage=recipe['mask_percentage'],
        mask_strat=recipe['masking_strategy'],
        mask_pool_size=recipe.get('mask_pool_size', 32),
        local_mean_window=recipe.get('local_mean_window', 5),
        ups_window_size=recipe.get('ups_window_size', 5),
        use_roi=False,
        norm_stats=norm_stats,
        overlap_tile_pad=recipe.get('overlap_tile_pad', 0),
    )

    if verbose:
        print(f"\n=== DataLoader configuration ===")
        print(f"Kernel: {single_kernel.shape}, {int(single_kernel.sum())} true px")
        print(f"Patch {recipe['patch_size']}, batch {recipe['batch_size']}, "
              f"ppi {recipe['patches_per_image']}, "
              f"mask% {recipe['mask_percentage']}, strat {recipe['masking_strategy']}")

    train_dataset = TrainingDataset(
        slice_indices=slice_indices['train'],
        patches_per_image=recipe['patches_per_image'],
        use_augmentation=recipe['use_augmentation'],
        **common)
    val_dataset = ValidationDataset(
        slice_indices=slice_indices['val'],
        patches_per_image=max(1, recipe['patches_per_image'] // 2),
        **common)
    test_dataset = TestDataset(stack=stack, slice_indices=slice_indices['test'], mode='2d')

    pin = torch.cuda.is_available()
    workers = recipe.get('num_workers', 4)
    train_loader = DataLoader(train_dataset, batch_size=recipe['batch_size'],
                              shuffle=True, num_workers=workers, pin_memory=pin,
                              worker_init_fn=_worker_init_fn)
    val_loader = DataLoader(val_dataset, batch_size=recipe['batch_size'],
                            shuffle=False, num_workers=workers, pin_memory=pin,
                            worker_init_fn=_worker_init_fn)
    test_loader = DataLoader(test_dataset, batch_size=1, shuffle=False)
    return train_loader, val_loader, test_loader


def _worker_init_fn(worker_id):
    """Independent per-worker RNG so the mask-pool sampling stays diverse across
    DataLoader workers (A1 fix). MODULE-LEVEL on purpose: platforms whose
    multiprocessing start method is 'spawn' (macOS, Windows) must pickle this
    function -- a closure inside the factory raises PicklingError there (the
    pre-restructure code had the same latent bug; it only ever ran under
    Linux/'fork')."""
    seed = torch.initial_seed() % (2 ** 32) + worker_id
    np.random.seed(seed)
    random.seed(seed)
