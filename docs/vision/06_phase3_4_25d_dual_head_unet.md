# Phase 3+4: Direction-Aware 2.5D U-Net — Implementation Plan

## Context

Phases 1 (centerpoint annotation) and 2 (direction volume generation) are complete. The app can now produce `_filaments.json` sidecar files and generate float32 direction volumes `(Z, Y, X, 3)` from them. Phase 3+4 extends the ML pipeline to use these direction volumes during training and inference, combining the model architecture (Phase 3) and loss function (Phase 4) into one implementation.

**Goal:** A 2.5D dual-head U-Net that takes multi-slice input, predicts both class labels and direction vectors, and trains with an orientation-weighted combined loss — while keeping the existing 2D single-head pipeline fully functional.

**Prerequisites:** Phase 1 + Phase 2 complete.

**Related Documents:**
- [01_overall_idea_and_planning.md](01_overall_idea_and_planning.md) — Problem statement and core idea
- [02_annotation_pipeline.md](02_annotation_pipeline.md) — Annotation workflow design
- [03_loss_function_design.md](03_loss_function_design.md) — Loss function mathematics
- [04_implementation_roadmap.md](04_implementation_roadmap.md) — Full roadmap (Phases 1-5)

---

## Step 1: Extract UNet to shared module

**Create** `python/models/__init__.py` and `python/models/unet.py`

- Copy the existing `UNet` class verbatim from `python/train_model.py:145-249` into `python/models/unet.py`
- Add `UNet25D` class in the same file with:
  - Identical encoder-decoder structure to `UNet`
  - `in_channels` default of 3 (for triplet input) instead of 1
  - `seg_head`: `Conv2d(features, num_classes, 1)` — replaces `final_conv`
  - `dir_head`: `Conv2d(features, features//2, 3, padding=1) → BN → ReLU → Conv2d(features//2, 3, 1)` — extra conv block for regression capacity
  - `F.normalize(dir_raw, p=2, dim=1, eps=1e-6)` constrains direction output to unit sphere
  - `has_direction_head` flag: when `False`, returns single tensor (same API as `UNet`)
  - `forward()` returns `(seg_logits, dir_norm)` when direction head is active, single tensor otherwise

**Files:**
- Create: `python/models/__init__.py`
- Create: `python/models/unet.py`

---

## Step 2: Add loss classes to `train_model.py`

Replace inline `UNet` class with `from models.unet import UNet, UNet25D`. Add three loss classes:

**`OrientationWeightedCELoss`** — Cross-entropy with per-voxel weight `w = 1 + alpha * (1 - |dz|)` for filament voxels. When `alpha=0`, identical to standard CE. Non-filament voxels always get weight 1.

**`SignInvariantDirectionLoss`** — `1 - |v_pred · v_gt|`, masked to filament voxels only. Returns 0 when no filament voxels in batch. Sign-invariant: parallel and antiparallel vectors both yield loss 0.

**`CombinedDirectionAwareLoss`** — `L_seg + lambda_dir * L_dir`. Returns `(total, seg, dir)` tuple for separate tracking.

All classes accept `filament_classes` parameter (default `[2]` for microtubules).

**Hyperparameters:**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `alpha` | 1.0 | 0.0-5.0 | Orientation weight strength |
| `lambda_dir` | 0.3 | 0.0-2.0 | Direction loss weight |
| `filament_classes` | [2] | list of ints | Which classes represent filaments |

**File:** `python/train_model.py`

---

## Step 3: Add `Imagedataset25D` to `train_model.py`

Unlike `Imagedataset` which reads pre-split individual slice files, `Imagedataset25D` operates directly on TIFF stacks (following the denoising 2.5D pattern from `python/denoising/models.py:extract_triplet_patches`).

- Constructor takes `raw_stack (Z,H,W)`, `mask_stack (Z,H,W)`, optional `direction_volume (Z,H,W,3)`
- `context_slices` param (must be odd: 3 or 5). Valid center slices: `[half, Z-half)`
- Global normalization of raw stack to [0,1]
- Random spatial patch extraction
- Returns `(image [context_slices, pH, pW], mask_onehot [C, pH, pW], direction [3, pH, pW])`

### Direction-aware augmentation

This is one of the most critical correctness requirements:

| Transform | Image/Mask | Direction vector `(dx, dy, dz)` |
|-----------|-----------|--------------------------------|
| Horizontal flip | Flip left-right | Negate `dx` |
| Vertical flip | Flip top-bottom | Negate `dy` |
| 90° CCW rotation | Rotate CCW | `(dx, dy) → (-dy, dx)` |
| 180° rotation | Rotate 180 | `(dx, dy) → (-dx, -dy)` |
| 270° CW rotation | Rotate CW | `(dx, dy) → (dy, -dx)` |

The `dz` component is **never** affected by XY augmentations.

After any transform, re-apply the sign convention (`dz >= 0`, with secondary tie-breaks on `dy` then `dx`).

**File:** `python/train_model.py`

---

## Step 4: Add `prepare_data_25d` and update `main()` in `train_model.py`

**`prepare_data_25d(raw_path, ann_path, dir_vol_path)`** — loads TIFF stacks directly, splits by z-index (70/15/15 train/val/test), returns dict of numpy arrays. No temp files or individual slice writing needed (unlike the existing `prepare_data_from_tiff_stacks`).

**`main()` changes:**
- Add `--direction_volume` CLI argument (optional)
- Branch: if direction volume provided and exists → 2.5D path; else → existing 2D path (completely unchanged)
- 2.5D path uses: `prepare_data_25d` → `Imagedataset25D` → `UNet25D` → `CombinedDirectionAwareLoss`
- New config fields read from JSON: `context_slices` (default 3), `alpha` (default 1.0), `lambda_dir` (default 0.3), `filament_classes` (default [2])

### Updated checkpoint format (2.5D path)

```python
'model_config': {
    'features': ...,
    'num_layers': ...,
    'in_channels': context_slices,     # 3 or 5 instead of 1
    'num_classes': ...,
    'model_type': 'direction_aware',   # NEW — signals inference to use UNet25D
    'has_direction_head': True,         # NEW
    'context_slices': context_slices    # NEW
}
```

Standard 2D path continues to save `model_type: 'standard'` (or omits the field).

**File:** `python/train_model.py`

---

## Step 5: Modify training loop for direction-aware mode

In `train_model_with_progress`, add `direction_aware` parameter. When active:

- Unpack `(inputs, masks, directions)` from dataloader (use `for inputs, masks, *extra in loader` pattern for backward compat)
- Call `seg_logits, dir_pred = model(inputs)` instead of `outputs = model(inputs)`
- Compute `total, seg_loss, dir_loss = criterion(seg_logits, dir_pred, target_classes, directions)`
- Track `seg_loss` and `dir_loss` separately per epoch
- Add extra fields to `PROGRESS:` JSON: `train_seg_loss`, `train_dir_loss`, `val_seg_loss`, `val_dir_loss`
- Best model selection remains based on `val_dice` (segmentation quality is the primary metric)

The extra progress fields are simply ignored by the existing frontend parser (backward compatible).

**File:** `python/train_model.py`

---

## Step 6: Update `run_inference.py` for 2.5D + direction output

- Replace inline UNet class with `from models.unet import UNet, UNet25D`
- Modify `load_model()`: check `model_config.model_type` → instantiate `UNet25D` if `'direction_aware'`, otherwise `UNet` as before
- Add `run_inference_25d()`:
  - Reflect-pad stack at boundaries (following denoising 2.5D pattern)
  - Sliding window: for each center slice z, stack `[z-k, ..., z, ..., z+k]` as input
  - Normalize entire stack to [0,1] globally (not per-slice)
  - Produce `segmented_stack (Z, H, W, uint8)` and `direction_stack (Z, H, W, 3, float32)`
- Modify `main()`: branch based on model type
- Save direction volume as additional TIFF output
- Extend `FINAL_RESULT:` JSON with optional `direction_output_path`

**File:** `python/run_inference.py`

---

## Step 7: Update model import validation

In `python/validate_imported_model.py`, the key check currently looks for `['encoder_layers', 'bottleneck', 'decoder_layers', 'final_conv']`. UNet25D uses `seg_head` and `dir_head` instead of `final_conv`.

Update to accept either head pattern: check for `final_conv` OR `seg_head` alongside the standard encoder/bottleneck/decoder keys.

**File:** `python/validate_imported_model.py`

---

## Step 8: Minimal backend changes

### 8a. Process spawning — `src/helpers/pythonRunner.js` (line ~177)
Add `--direction_volume` arg to `spawn()` call when `params.direction_volume` is truthy:
```javascript
if (params.direction_volume) {
    args.push('--direction_volume', params.direction_volume);
}
```

### 8b. Training params — `src/routes/ml.routes.js` (line ~372)
Add `direction_volume` to `trainingParams` object, resolving path from `config.direction_volume_path` relative to workspace:
```javascript
direction_volume: config.direction_volume_path
    ? path.join(workspacePath, config.direction_volume_path)
    : null
```

### 8c. Config validation — `src/app.js` (line ~150)
Add optional range checks in `validateTrainingConfig` for `alpha` (0-10), `lambda_dir` (0-5), `context_slices` (must be 1, 3, or 5). These are non-required fields — validation only fires if they are present.

### 8d. Inference result handling
When `FINAL_RESULT` includes `direction_output_path`, track it as a workspace file with tags `['direction_volume', 'inference']`.

---

## Step 9: Synthetic test script

**Create** `python/test_direction_training.py` — standalone test that verifies the entire pipeline without requiring real data.

### Test 1: Model output shapes
- UNet: `(B, C, H, W)` single output
- UNet25D: dual output `(B, C, H, W)` seg + `(B, 3, H, W)` dir
- Direction norms in `[0.99, 1.01]`
- UNet25D with `has_direction_head=False`: single output (same as UNet)

### Test 2: Loss function correctness
- `OrientationWeightedCELoss(alpha=0)` matches standard `nn.CrossEntropyLoss`
- `SignInvariantDirectionLoss` returns 0 for parallel vectors AND antiparallel vectors
- `CombinedDirectionAwareLoss(alpha=0, lambda_dir=0)` matches standard CE

### Test 3: Training convergence
- Generate synthetic filaments (known orientations, bright lines in noisy volume)
- Train UNet25D for 5 epochs
- Verify loss decreases

### Test 4: Backward compatibility
- Standard UNet forward/backward works unchanged

**Run:** `python python/test_direction_training.py [--epochs 5] [--device cpu]`

**File:** Create `python/test_direction_training.py`

---

## File Summary

| File | Action | Step |
|------|--------|------|
| `python/models/__init__.py` | Create | 1 |
| `python/models/unet.py` | Create | 1 |
| `python/train_model.py` | Modify | 2-5 |
| `python/run_inference.py` | Modify | 6 |
| `python/validate_imported_model.py` | Modify | 7 |
| `src/helpers/pythonRunner.js` | Modify | 8a |
| `src/routes/ml.routes.js` | Modify | 8b |
| `src/app.js` | Modify | 8c-8d |
| `python/test_direction_training.py` | Create | 9 |

## Build Order

```
Step 1 (shared models package)
  ├── Steps 2-5 (training pipeline — sequential, each depends on previous)
  ├── Step 6 (inference — depends on Step 1 only)
  ├── Step 7 (validation — depends on Step 1 only)
  └── Step 8 (backend — depends on Steps 4-6 for correct arg/result formats)
Step 9 (test script — after all above)
```

## Verification Criteria

1. `python python/test_direction_training.py` — all 4 test suites pass
2. Existing 2D training via CLI (no direction volume arg) — identical behavior to before
3. 2.5D training via CLI with direction volume — loss decreases over epochs, checkpoint contains `model_type: 'direction_aware'`
4. 2.5D inference on saved checkpoint — produces both segmentation TIFF and direction volume TIFF with correct shapes
5. Model import validation passes for both standard and dual-head checkpoints
6. Backend: `/configure-training` accepts new optional fields; `/start-training` passes `--direction_volume` to Python process

## Backward Compatibility Guarantees

- The `UNet` class imported from `python/models/unet.py` is byte-for-byte identical to the removed inline version
- When no direction volume is provided, the training path is completely unchanged (same data prep, same dataset, same model, same loss)
- Checkpoints without `model_type` field default to `'standard'` — all existing saved models continue to work
- The `PROGRESS:` protocol adds optional fields that existing frontend parsers ignore
- The `FINAL_RESULT:` protocol adds optional `direction_output_path` that existing result handlers ignore
