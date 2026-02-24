#!/usr/bin/env python3
"""
Synthetic test script for direction-aware 2.5D U-Net pipeline.

Four test suites:
1. Model shapes — UNet / UNet25D output shapes and direction norms
2. Loss functions — equivalence checks and edge cases
3. Training convergence — synthetic filaments, loss decreases over epochs
4. Backward compatibility — standard UNet forward/backward still works

Usage:
    python python/test_direction_training.py [--epochs 5] [--device cpu]
"""

import argparse
import sys
import traceback

import numpy as np
import torch
import torch.nn as nn

# Ensure the python/ directory is on the path so 'models' package resolves
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))

from models.unet import UNet, UNet25D
from train_model import (
    OrientationWeightedCELoss,
    SignInvariantDirectionLoss,
    CombinedDirectionAwareLoss,
    Imagedataset25D,
    calculate_dice_score,
)
from torch.utils.data import DataLoader


# =============================================================================
# Helpers
# =============================================================================

def make_synthetic_data(Z=20, H=128, W=128, num_classes=3):
    """Create synthetic stacks with filament-like structures and direction vectors."""
    raw = np.random.rand(Z, H, W).astype(np.float32)
    mask = np.zeros((Z, H, W), dtype=np.uint8)
    direction = np.zeros((Z, H, W, 3), dtype=np.float32)

    # Draw diagonal filaments (class 2) with direction vectors
    for z in range(Z):
        for i in range(10, min(H, W) - 10):
            y, x = i, i
            mask[z, y, x] = 2
            mask[z, y+1, x] = 2
            # Direction along the diagonal, normalized
            d = np.array([1.0, 1.0, 0.1], dtype=np.float32)
            d /= np.linalg.norm(d)
            if d[2] < 0:
                d *= -1
            direction[z, y, x] = d
            direction[z, y+1, x] = d

    # Some background noise class 1
    mask[:, 0:5, 0:5] = 1

    return raw, mask, direction


class Result:
    def __init__(self, name):
        self.name = name
        self.passed = 0
        self.failed = 0
        self.errors = []

    def check(self, condition, msg):
        if condition:
            self.passed += 1
        else:
            self.failed += 1
            self.errors.append(msg)

    def summary(self):
        status = "PASS" if self.failed == 0 else "FAIL"
        s = f"  [{status}] {self.name}: {self.passed} passed, {self.failed} failed"
        for err in self.errors:
            s += f"\n         - {err}"
        return s


# =============================================================================
# Suite 1: Model shapes
# =============================================================================

def test_model_shapes(device):
    r = Result("Model shapes")

    B, H, W, C = 2, 64, 64, 3
    features, layers, num_classes = 16, 2, 3

    # Standard UNet
    unet = UNet(features, layers, in_channels=1, num_classes=num_classes).to(device)
    x_2d = torch.randn(B, 1, H, W, device=device)
    out = unet(x_2d)
    r.check(out.shape == (B, num_classes, H, W),
            f"UNet output shape: expected {(B, num_classes, H, W)}, got {tuple(out.shape)}")

    # UNet25D with direction head
    unet25d = UNet25D(features, layers, in_channels=C, num_classes=num_classes,
                       has_direction_head=True).to(device)
    x_25d = torch.randn(B, C, H, W, device=device)
    seg, dir_out = unet25d(x_25d)
    r.check(seg.shape == (B, num_classes, H, W),
            f"UNet25D seg shape: expected {(B, num_classes, H, W)}, got {tuple(seg.shape)}")
    r.check(dir_out.shape == (B, 3, H, W),
            f"UNet25D dir shape: expected {(B, 3, H, W)}, got {tuple(dir_out.shape)}")

    # Direction norms: mean should be ~1.0 (individual pixels with near-zero
    # raw output can have norms < 1 due to F.normalize eps clamping)
    norms = dir_out.norm(dim=1)
    r.check(norms.mean().item() > 0.95,
            f"Direction norms mean: {norms.mean().item():.4f} (expected > 0.95)")
    r.check(norms.max().item() < 1.01,
            f"Direction norms max: {norms.max().item():.4f} (expected < 1.01)")

    # UNet25D without direction head → single tensor output
    unet25d_no_dir = UNet25D(features, layers, in_channels=C, num_classes=num_classes,
                              has_direction_head=False).to(device)
    out_no_dir = unet25d_no_dir(x_25d)
    r.check(isinstance(out_no_dir, torch.Tensor),
            "UNet25D(has_direction_head=False) should return single tensor")
    r.check(out_no_dir.shape == (B, num_classes, H, W),
            f"UNet25D no-dir shape: expected {(B, num_classes, H, W)}, got {tuple(out_no_dir.shape)}")

    return r


# =============================================================================
# Suite 2: Loss functions
# =============================================================================

def test_loss_functions(device):
    r = Result("Loss functions")

    B, H, W, num_classes = 2, 32, 32, 3

    # Random data
    seg_logits = torch.randn(B, num_classes, H, W, device=device, requires_grad=True)
    target = torch.randint(0, num_classes, (B, H, W), device=device)
    dir_pred = torch.randn(B, 3, H, W, device=device)
    dir_pred = torch.nn.functional.normalize(dir_pred, dim=1)
    dir_gt = torch.randn(B, 3, H, W, device=device)
    dir_gt = torch.nn.functional.normalize(dir_gt, dim=1)

    # Test 1: alpha=0 should match standard CE
    ce_standard = nn.CrossEntropyLoss()(seg_logits, target)
    ow_loss = OrientationWeightedCELoss(alpha=0.0)
    ce_ow = ow_loss(seg_logits, target, dir_gt)
    diff = abs(ce_standard.item() - ce_ow.item())
    r.check(diff < 1e-5, f"alpha=0 CE difference: {diff:.6f} (expected < 1e-5)")

    # Test 2: sign-invariant loss = 0 for parallel vectors
    parallel = torch.randn(B, 3, H, W, device=device)
    parallel = torch.nn.functional.normalize(parallel, dim=1)
    target_all_filament = torch.full((B, H, W), 2, dtype=torch.long, device=device)
    si_loss = SignInvariantDirectionLoss(filament_classes=[2])
    l_parallel = si_loss(parallel, parallel, target_all_filament)
    r.check(l_parallel.item() < 1e-5,
            f"Parallel vectors loss: {l_parallel.item():.6f} (expected ~0)")

    # Test 3: sign-invariant loss = 0 for antiparallel vectors
    l_anti = si_loss(parallel, -parallel, target_all_filament)
    r.check(l_anti.item() < 1e-5,
            f"Antiparallel vectors loss: {l_anti.item():.6f} (expected ~0)")

    # Test 4: sign-invariant loss = 1 for orthogonal vectors
    v1 = torch.zeros(B, 3, H, W, device=device)
    v1[:, 0] = 1.0  # (1, 0, 0)
    v2 = torch.zeros(B, 3, H, W, device=device)
    v2[:, 1] = 1.0  # (0, 1, 0)
    l_ortho = si_loss(v1, v2, target_all_filament)
    r.check(abs(l_ortho.item() - 1.0) < 1e-5,
            f"Orthogonal vectors loss: {l_ortho.item():.6f} (expected 1.0)")

    # Test 5: no filament voxels → dir loss = 0
    target_no_filament = torch.zeros(B, H, W, dtype=torch.long, device=device)
    l_no_fil = si_loss(dir_pred, dir_gt, target_no_filament)
    r.check(l_no_fil.item() == 0.0,
            f"No-filament dir loss: {l_no_fil.item():.6f} (expected 0)")

    # Test 6: lambda_dir=0 → combined loss matches pure CE
    combined_no_dir = CombinedDirectionAwareLoss(alpha=0.0, lambda_dir=0.0)
    total, seg_l, dir_l = combined_no_dir(seg_logits, dir_pred, target, dir_gt)
    diff2 = abs(total.item() - ce_standard.item())
    r.check(diff2 < 1e-5,
            f"lambda_dir=0 total vs CE: {diff2:.6f} (expected < 1e-5)")

    # Test 7: gradients flow through combined loss
    seg_logits2 = torch.randn(B, num_classes, H, W, device=device, requires_grad=True)
    dir_pred2 = torch.randn(B, 3, H, W, device=device, requires_grad=True)
    dir_pred2_norm = torch.nn.functional.normalize(dir_pred2, dim=1)
    combined = CombinedDirectionAwareLoss(alpha=1.0, lambda_dir=0.3)
    total2, _, _ = combined(seg_logits2, dir_pred2_norm, target, dir_gt)
    total2.backward()
    r.check(seg_logits2.grad is not None, "Gradients flow to seg_logits")

    return r


# =============================================================================
# Suite 3: Training convergence
# =============================================================================

def test_training_convergence(device, epochs=5):
    r = Result("Training convergence")

    raw, mask, direction = make_synthetic_data(Z=20, H=128, W=128)

    dataset = Imagedataset25D(
        raw_stack=raw, mask_stack=mask, direction_volume=direction,
        patch_size=64, patches_per_slice=4, context_slices=3,
        augment=True, num_classes=3
    )
    loader = DataLoader(dataset, batch_size=4, shuffle=True, num_workers=0)

    model = UNet25D(features=16, num_layers=2, in_channels=3, num_classes=3,
                     has_direction_head=True).to(device)
    criterion = CombinedDirectionAwareLoss(alpha=1.0, lambda_dir=0.3)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    losses = []
    for ep in range(epochs):
        model.train()
        epoch_loss = 0.0
        n_batches = 0
        for inputs, masks, dirs in loader:
            inputs = inputs.to(device)
            masks = masks.to(device)
            dirs = dirs.to(device)

            optimizer.zero_grad()
            seg_logits, dir_pred = model(inputs)
            total, _, _ = criterion(seg_logits, dir_pred, masks.argmax(dim=1), dirs)
            total.backward()
            optimizer.step()

            epoch_loss += total.item()
            n_batches += 1

        avg_loss = epoch_loss / max(n_batches, 1)
        losses.append(avg_loss)
        print(f"  Epoch {ep+1}/{epochs}: loss={avg_loss:.4f}", flush=True)

    # Loss should decrease
    r.check(losses[-1] < losses[0],
            f"Loss did not decrease: first={losses[0]:.4f}, last={losses[-1]:.4f}")

    # Check that we can do inference with the trained model
    model.eval()
    with torch.no_grad():
        test_input = torch.randn(1, 3, 64, 64, device=device)
        seg_out, dir_out = model(test_input)
        r.check(seg_out.shape == (1, 3, 64, 64),
                f"Inference seg shape after training: {tuple(seg_out.shape)}")
        norms = dir_out.norm(dim=1)
        r.check(norms.min().item() > 0.99,
                f"Post-training direction norms min: {norms.min().item():.4f}")

    return r


# =============================================================================
# Suite 4: Backward compatibility
# =============================================================================

def test_backward_compatibility(device):
    r = Result("Backward compatibility")

    B, H, W = 2, 64, 64
    features, layers, num_classes = 16, 2, 3

    # Standard UNet forward + backward
    model = UNet(features, layers, in_channels=1, num_classes=num_classes).to(device)
    x = torch.randn(B, 1, H, W, device=device)
    target = torch.randint(0, num_classes, (B, H, W), device=device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    model.train()
    optimizer.zero_grad()
    out = model(x)
    loss = criterion(out, target)
    loss.backward()
    optimizer.step()

    r.check(True, "Standard UNet forward + backward succeeds")

    # Verify Dice score calculation still works
    model.eval()
    with torch.no_grad():
        pred = model(x)
        target_onehot = torch.nn.functional.one_hot(target, num_classes).permute(0, 3, 1, 2).float()
        dice = calculate_dice_score(pred, target_onehot, num_classes)
        r.check(isinstance(dice, float) and 0 <= dice <= 1,
                f"Dice score: {dice:.4f} (expected float in [0, 1])")

    # Verify checkpoint format compatibility
    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix='.pth', delete=False) as f:
        tmp_path = f.name

    try:
        checkpoint = {
            'model_state_dict': model.state_dict(),
            'model_config': {
                'features': features,
                'num_layers': layers,
                'in_channels': 1,
                'num_classes': num_classes
            }
        }
        torch.save(checkpoint, tmp_path)

        loaded = torch.load(tmp_path, map_location=device, weights_only=False)
        model2 = UNet(features, layers, 1, num_classes).to(device)
        model2.load_state_dict(loaded['model_state_dict'])
        r.check(True, "Standard UNet checkpoint save/load succeeds")

        # No model_type key → should default to 'standard'
        r.check(loaded['model_config'].get('model_type', 'standard') == 'standard',
                "Standard checkpoint has no model_type (defaults to 'standard')")
    finally:
        os.unlink(tmp_path)

    return r


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='Test direction-aware training pipeline')
    parser.add_argument('--epochs', type=int, default=5, help='Epochs for convergence test')
    parser.add_argument('--device', type=str, default='cpu', help='Device (cpu or cuda)')
    args = parser.parse_args()

    device = torch.device(args.device)
    print(f"Running tests on device: {device}\n", flush=True)

    results = []
    suites = [
        ("1. Model shapes", lambda: test_model_shapes(device)),
        ("2. Loss functions", lambda: test_loss_functions(device)),
        ("3. Training convergence", lambda: test_training_convergence(device, args.epochs)),
        ("4. Backward compatibility", lambda: test_backward_compatibility(device)),
    ]

    for name, fn in suites:
        print(f"Running suite: {name}", flush=True)
        try:
            r = fn()
            results.append(r)
        except Exception as e:
            r = Result(name)
            r.failed = 1
            r.errors.append(f"EXCEPTION: {e}\n{traceback.format_exc()}")
            results.append(r)
        print(r.summary(), flush=True)
        print()

    # Summary
    total_passed = sum(r.passed for r in results)
    total_failed = sum(r.failed for r in results)
    print("=" * 60)
    print(f"Total: {total_passed} passed, {total_failed} failed")

    if total_failed > 0:
        print("\nFAILED TESTS:")
        for r in results:
            if r.failed > 0:
                print(r.summary())
        sys.exit(1)
    else:
        print("\nAll tests passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
