# Models API Reference

Technical reference for the `models` module.

## Module: `models.unet`

### Class: `FlexibleUNet`

Flexible U-Net with configurable depth and resize convolution.

**Constructor:**
```python
FlexibleUNet(features, num_layers, in_channels=1, out_channels=1, 
             upsampling_mode='bilinear', use_transposed_conv=False)
```

**Parameters:**
- `features` (int): Initial number of feature channels
- `num_layers` (int): Number of down/upsampling layers
- `in_channels` (int): Input channels (default: 1)
- `out_channels` (int): Output channels (default: 1)
- `upsampling_mode` (str): 'bilinear', 'nearest', or 'bicubic'
- `use_transposed_conv` (bool): Use transposed conv vs resize conv

**Methods:**
- `forward(x)`: Forward pass
  - **Input:** (B, C, H, W) tensor
  - **Output:** (B, C, H, W) tensor

**Example:**
```python
model = FlexibleUNet(features=64, num_layers=3)
output = model(input_tensor)
```

---

### Class: `ResizeConvolution`

Resize convolution module for artifact-free upsampling.

**Constructor:**
```python
ResizeConvolution(in_channels, out_channels, upsampling_mode='bilinear', scale_factor=2)
```

---

## Module: `models.auto_struct_n2v`

### Class: `AutoStructN2VModel`

Unified model wrapper for both stages.

**Constructor:**
```python
AutoStructN2VModel(features, num_layers, in_channels=1, out_channels=1, 
                   stage='stage1', use_resize_conv=True, upsampling_mode='bilinear')
```

**Class Methods:**
- `create_stage1_model(features, num_layers, **kwargs)`
- `create_stage2_model(features, num_layers, **kwargs)`

---

## Module: `models.factory`

### Function: `create_model`

Factory function for creating models.

**Signature:**
```python
create_model(stage, features=64, num_layers=2, use_resize_conv=True, 
             upsampling_mode='bilinear', **kwargs)
```

**Parameters:**
- `stage` (str): 'stage1' or 'stage2'
- `features` (int): Base feature count
- `num_layers` (int): Network depth
- `use_resize_conv` (bool): Use resize convolution
- `upsampling_mode` (str): Upsampling mode

**Returns:**
- AutoStructN2VModel instance

**Example:**
```python
from autoStructN2V.models import create_model

model = create_model('stage2', features=96, num_layers=3)
```

---

**See Also:**
- [Training Guide](../user-guide/training.md)
- [Architecture](../concepts/architecture.md)
