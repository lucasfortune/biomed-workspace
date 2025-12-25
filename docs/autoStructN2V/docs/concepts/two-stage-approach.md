# Two-Stage Approach

Detailed explanation of Stage 1 and Stage 2 training in autoStructN2V.

## Overview

autoStructN2V uses a two-stage approach to handle different types of noise:

- **Stage 1 (Noise2Void)**: Removes random, uncorrelated noise
- **Stage 2 (Structured Noise2Void)**: Removes structured, correlated noise

This separation allows each stage to specialize in a specific noise type.

## Noise Types in Microscopy

### Random Noise

**Characteristics**:
- Independent across pixels
- No spatial correlation
- Examples: photon shot noise, read noise, thermal noise

**Visual appearance**: Grainy texture, salt-and-pepper

**Why Stage 1 works**: Random noise is unpredictable from neighbors, so masking random pixels forces the network to learn denoising.

### Structured Noise

**Characteristics**:
- Correlated across pixels
- Regular patterns
- Examples: scan lines, camera artifacts, periodic interference

**Visual appearance**: Lines, grids, periodic patterns

**Why Stage 2 is needed**: Standard N2V can't handle correlated noise because nearby pixels contain the same noise pattern.

## Stage 1: Standard Noise2Void

### Objective

Remove random noise by training a network to predict masked pixels from unmasked neighbors.

### Training Process

#### 1. Patch Extraction

Extract random patches from training images:
```python
patch_size = 32  # Typically smaller for Stage 1
patches_per_image = 100
```

Patches selected from:
- Background regions (if `use_roi=True, select_background=True`)
- Random locations (if `use_roi=False`)

#### 2. Blind-Spot Masking

Create single-pixel blind spots:
```
Mask kernel (3x3, center_size=1):
[T T T]
[T F T]  ← F = blind spot (center pixel)
[T T T]
```

Random pixels masked across the patch:
- Default: 15% of pixels
- Ensures sufficient training signal

#### 3. Masking Strategy

Masked pixel replaced with:
- **Strategy 0 (default)**: Local mean of unmasked neighbors
- **Strategy 1**: Zero value
- **Strategy 2**: Random unmasked value

Local mean works best for preserving structure.

#### 4. Training Objective

```python
loss = MSE(prediction[masked_pixels], original[masked_pixels])
```

Network learns to predict original pixel value from surrounding context.

#### 5. Key Insight

Random noise is different at each pixel, so neighbors don't contain the same noise. The network learns to average out noise while preserving structure.

### Stage 1 Output

1. **Trained Model**: Removes random noise
2. **Denoised Patches**: Used to extract structural patterns for Stage 2

### Limitations

Stage 1 **cannot** remove structured noise because:
- Structured noise is present in neighboring pixels
- Network learns to preserve the pattern (thinks it's signal)
- Averaging doesn't help when noise is correlated

**Example**: If a scan line affects pixels [i-1, i, i+1], masking pixel [i] and predicting from [i-1, i+1] won't work—they all contain the line.

## Stage 2: Structured Noise2Void

### Objective

Remove structured noise by using a learned spatial masking pattern.

### Key Idea

If we know the noise pattern's spatial structure, we can mask it strategically:
- Mask positions that are spatially correlated
- Predict from positions that are independent

### Training Process

#### 1. Structural Mask Extraction

Three options:

**Option A: From Stage 1 Output (Default)**
```python
Stage 1 Denoised Patches
        ↓
Autocorrelation Analysis
        ↓
Ring-Based Thresholding
        ↓
Structural Mask (e.g., 11x11)
```

**Option B: From Pre-saved Mask**
```python
Load .npy file
```

**Option C: From Original Images**
```python
Original Noisy Images
        ↓
Extract Patches
        ↓
Autocorrelation Analysis
        ↓
Structural Mask
```

#### 2. Full Mask Creation

Single kernel → Full patch mask:
```python
Single kernel (11x11):
[F F F F F F F F F F F]
[F F F F F T F F F F F]
[F F F F T T T F F F F]
[F F F T T T T T F F F]
[F F F F T T T F F F F]
[F F F F F T F F F F F]
[F F F F F F F F F F F]
...

Full mask (64x64):
Tile kernel across patch
Add random pixels to reach mask_percentage
Ensure no adjacent True pixels
```

#### 3. Patch Extraction

Extract patches from **original noisy images** (not Stage 1 output):
- Typically larger patches (64-128 pixels)
- More patches per image (200-300)
- Focus on structure regions (if `use_roi=True, select_background=False`)

#### 4. Training Objective

Same as Stage 1, but with structured mask:
```python
loss = MSE(prediction[prediction_kernel], original[prediction_kernel])
```

The structured mask ensures:
- Masked positions are spatially related
- Unmasked context doesn't contain same noise pattern
- Network learns to remove correlated noise

#### 5. Key Insight

By masking the structural pattern spatially, we force the network to interpolate from regions without the pattern, effectively removing it.

### Stage 2 Output

1. **Trained Model**: Removes structured noise (and further reduces random noise)
2. **Learned Mask**: Can be reused on similar datasets

### Why Original Images?

Stage 2 trains on original noisy images because:
1. Structural patterns are still present (Stage 1 doesn't remove them)
2. Additional random noise is reduced as a side effect
3. Final output has both noise types removed

## Comparison: Stage 1 vs Stage 2

| Aspect | Stage 1 | Stage 2 |
|--------|---------|---------|
| **Target** | Random noise | Structured noise |
| **Masking** | Random single pixels | Spatial pattern |
| **Mask Creation** | Simple (blind spot) | Complex (autocorrelation) |
| **Training Data** | Original images | Original images |
| **Patch Size** | Smaller (32-64) | Larger (64-128) |
| **Mask %** | Higher (15-20%) | Lower (8-12%) |
| **Learning Rate** | Higher (1e-4) | Lower (1e-5) |
| **ROI Selection** | Background | Structures |
| **Output** | Partially denoised + patches for mask | Fully denoised |

## Why Two Stages?

### Advantages of Separation

1. **Specialization**: Each stage focuses on one noise type
2. **Mask Quality**: Stage 1 denoising improves structural mask extraction
3. **Flexibility**: Can run stages independently
4. **Reusability**: Stage 2 mask can be applied to new datasets
5. **Debugging**: Easier to identify which stage needs tuning

### Could We Do One Stage?

**No**, because:
- Random masking doesn't handle structured noise
- Structured masking without knowing the pattern doesn't work
- Learning both simultaneously is difficult

### Could We Do Stage 2 Only?

**Yes**, if:
- You already have a structural mask
- Structural noise is dominant
- Random noise is minimal

But usually Stage 1 improves results.

## Execution Modes

### Mode 1: Full Pipeline (Recommended)

```python
config = {
    'run_stage1': True,
    'run_stage2': True,
    'stage2': {'mask_source': 'stage1'},
}
```

**Process**:
1. Stage 1 removes random noise
2. Denoised patches analyzed for structural patterns
3. Stage 2 removes structured noise
4. Final output has both types removed

### Mode 2: Stage 1 Only

```python
config = {
    'run_stage1': True,
    'run_stage2': False,
}
```

**Use case**: Only random noise present, or quick baseline

### Mode 3: Stage 2 with Pre-saved Mask

```python
config = {
    'run_stage1': False,
    'run_stage2': True,
    'stage2': {
        'mask_source': 'file',
        'mask_file_path': './mask.npy',
    }
}
```

**Use case**: Apply learned mask to new similar datasets

### Mode 4: Stage 2 with Direct Extraction

```python
config = {
    'run_stage1': False,
    'run_stage2': True,
    'stage2': {'mask_source': 'extractor'},
}
```

**Use case**: Known structured noise, skip Stage 1

## Mathematical Formulation

### Stage 1 Loss

Let:
- $x$: noisy image
- $M_1$: random mask (1 at masked positions)
- $f_{\theta_1}$: Stage 1 network
- $\hat{x}$: predicted image

Blind-spot constraint: $f_{\theta_1}$ cannot see $x[M_1=1]$

Loss:
```
L_1 = MSE(f_θ₁(x ⊙ (1-M₁))[M₁], x[M₁])
```

### Stage 2 Loss

Let:
- $x$: original noisy image
- $M_2$: structured mask (learned)
- $f_{\theta_2}$: Stage 2 network

Loss:
```
L_2 = MSE(f_θ₂(x ⊙ (1-M₂))[M₂], x[M₂])
```

## Practical Considerations

### When to Use Full Pipeline

- General microscopy images
- Unknown noise characteristics
- Want best quality results
- Have computational resources

### When to Use Stage 1 Only

- Quick baseline
- Primarily random noise
- Limited time/compute
- Experimentation phase

### When to Use Stage 2 Only

- Known structured noise pattern
- Have pre-computed mask
- Applying to similar datasets
- Structured noise dominant

## Hyperparameter Guidelines

### Stage 1

Focus on learning general denoising:
```python
'stage1': {
    'patch_size': 32,          # Smaller for local noise
    'mask_percentage': 15.0,   # More training signal
    'learning_rate': 1e-4,     # Aggressive learning
    'select_background': True, # Learn from clean regions
}
```

### Stage 2

Focus on structural patterns:
```python
'stage2': {
    'patch_size': 96,          # Larger to capture patterns
    'mask_percentage': 10.0,   # Sparse structural patterns
    'learning_rate': 1e-5,     # Careful fine-tuning
    'select_background': False,# Learn from structures
}
```

## Common Questions

### Q: Why train Stage 2 on original images?

**A**: Stage 1 only removes random noise. Structured noise remains in original images, so Stage 2 must train on them.

### Q: Can I apply Stage 2 model directly to original images?

**A**: Yes! Stage 2 model is trained on original images, so it removes both structured noise and some random noise.

### Q: Do I need both stages?

**A**: For best results, yes. But if you only have one noise type, you can use one stage.

### Q: Can I train stages with different architectures?

**A**: Yes, configure `features` and `num_layers` independently for each stage.

### Q: How do I know if I need Stage 2?

**A**: Visually inspect Stage 1 output. If you see patterns (lines, grids), you need Stage 2.

## See Also

- [Structural Mask Extraction](structural-mask-extraction.md) - How masks are created
- [Architecture Overview](architecture.md) - System design
- [Training Guide](../user-guide/training.md) - Training best practices
- [Configuration Reference](../user-guide/configuration.md) - Stage-specific parameters

---

**Next**: [Structural Mask Extraction](structural-mask-extraction.md) for mask creation details.
