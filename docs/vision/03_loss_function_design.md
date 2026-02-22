# Loss Function Design for Direction-Aware Segmentation

## Overview

The network is trained with a combined loss consisting of three components:

```
L_total = L_segmentation_weighted + λ × L_direction
```

Where:

- `L_segmentation_weighted` is the standard segmentation loss, enhanced with orientation-based per-voxel weighting.
- `L_direction` is the direction prediction loss, applied only at filament voxels.
- `λ` is a scalar weighting factor balancing the two tasks.

## Component 1: Segmentation Loss (Weighted)

### Base loss

Use whatever segmentation loss is currently in place (cross-entropy, Dice, or a combination). This remains the primary training objective.

### Orientation-based weighting

The ground-truth direction vectors provide information about which voxels are hardest to segment due to the missing wedge. Voxels where filaments run parallel to the imaging plane (small `|dz|` component) suffer the most resolution degradation and should receive higher loss weight.

Per-voxel weight for filament voxels:

```
w(voxel) = 1 + α × (1 - |dz|)
```

Where:

- `dz` is the Z component of the ground-truth unit tangent vector at that voxel.
- `α` controls how much extra emphasis is placed on hard orientations. Start with `α = 1.0–2.0`.
- When `|dz| ≈ 1` (filament runs along Z, well-resolved): weight ≈ 1 (normal).
- When `|dz| ≈ 0` (filament runs in XY, poorly resolved): weight ≈ 1 + α (boosted).

Non-filament voxels (background, cell body) retain a weight of 1.

### Behavior

This directly targets the original problem: the network is penalized more heavily for misclassifying voxels at orientations where the missing wedge causes the most degradation, pushing it to work harder on exactly those cases.

## Component 2: Direction Loss

### What the network predicts

The direction head outputs a 3-component vector `(vx, vy, vz)` per voxel — shape `(Z, Y, X, 3)`.

### Normalization

Before loss computation, L2-normalize the predicted vectors to unit length:

```
v_pred_normalized = v_pred / ||v_pred||
```

This prevents the network from minimizing loss by shrinking vector magnitudes toward zero at difficult locations. A small epsilon (e.g., `1e-8`) should be added to the denominator to avoid division by zero.

### Masking

The direction loss is computed **only at filament voxels** (microtubule, and later flagellum). A binary mask is derived from the class label volume:

```
mask = (class_label == microtubule) | (class_label == flagellum)  # extend as needed
```

All non-filament voxels are excluded from the direction loss. They contribute zero to this loss term.

### Loss function: sign-invariant cosine loss

Filamentous structures are bidirectional — a tangent vector and its negation represent the same orientation. The loss must be invariant to sign flips.

Per-voxel direction loss:

```
L_direction(voxel) = 1 - |v_pred · v_gt|
```

Where:

- `v_pred` is the L2-normalized predicted vector.
- `v_gt` is the ground-truth unit tangent vector.
- `·` is the dot product.
- The absolute value makes the loss invariant to sign: parallel vectors (same or opposite direction) yield loss = 0; perpendicular vectors yield loss = 1.

Full direction loss term (mean over all filament voxels):

```
L_direction = (1 / N_filament) × Σ_filament_voxels [ 1 - |v_pred · v_gt| ]
```

Where `N_filament` is the number of filament voxels in the batch.

## Combined Loss

```
L_total = L_segmentation_weighted + λ × L_direction
```

### Tuning λ

- Start with `λ = 0.1–0.5`.
- Monitor both loss components during training.
- If direction loss dominates and segmentation quality degrades, reduce `λ`.
- If direction predictions are not converging (loss stays high), increase `λ`.
- The two losses should ideally be in a similar numerical range; adjust `λ` to achieve this.

## Pseudocode

```python
def compute_total_loss(pred_classes, pred_vectors, gt_classes, gt_vectors, alpha, lam):
    """
    pred_classes: (B, Z, Y, X, num_classes) — raw logits from segmentation head
    pred_vectors: (B, Z, Y, X, 3) — raw output from direction head
    gt_classes:   (B, Z, Y, X) — integer class labels
    gt_vectors:   (B, Z, Y, X, 3) — unit tangent vectors (zero for non-filament)
    alpha: float — orientation weighting strength
    lam: float — direction loss weight (λ)
    """

    # --- Direction loss ---

    # Normalize predicted vectors to unit length
    pred_vectors_norm = pred_vectors / (||pred_vectors|| + 1e-8)

    # Mask: only filament voxels
    filament_mask = (gt_classes == MICROTUBULE) | (gt_classes == FLAGELLUM)  # boolean

    # Cosine similarity, sign-invariant
    dot_products = sum(pred_vectors_norm * gt_vectors, dim=-1)  # (B, Z, Y, X)
    direction_loss_per_voxel = 1.0 - abs(dot_products)

    # Apply mask and average
    direction_loss = mean(direction_loss_per_voxel[filament_mask])

    # --- Segmentation loss with orientation weighting ---

    # Compute per-voxel weight
    dz = abs(gt_vectors[..., 2])  # Z component of ground-truth direction
    weight = ones_like(gt_classes, dtype=float)
    weight[filament_mask] = 1.0 + alpha * (1.0 - dz[filament_mask])

    # Weighted segmentation loss (e.g., cross-entropy)
    seg_loss = weighted_cross_entropy(pred_classes, gt_classes, weight)

    # --- Combined loss ---
    total_loss = seg_loss + lam * direction_loss

    return total_loss, seg_loss, direction_loss
```

## Summary

| Component | Applies to | Purpose |
|---|---|---|
| Segmentation loss | All voxels | Primary task: classify each voxel |
| Orientation weighting | Filament voxels in segmentation loss | Emphasize voxels at difficult orientations (missing wedge) |
| Direction loss | Filament voxels only | Auxiliary task: predict local filament direction |

The direction loss serves as both a useful output and a regularizer that forces the shared encoder to learn geometrically meaningful features, improving segmentation quality overall.
