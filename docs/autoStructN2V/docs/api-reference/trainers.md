# Trainers API Reference

Training logic and callbacks.

## Module: `trainers.base`

### Class: `BaseTrainer`

Base trainer with common functionality.

**Constructor:**
```python
BaseTrainer(model, optimizer, scheduler, device, hparams, log_dir='logs')
```

**Parameters:**
- `model` (nn.Module): Model to train
- `optimizer` (torch.optim.Optimizer): Optimizer
- `scheduler` (lr_scheduler): Learning rate scheduler
- `device` (torch.device): Training device
- `hparams` (dict): Hyperparameters
- `log_dir` (str): Logging directory

**Methods:**

#### `train(train_loader, val_loader, test_loader=None)`
Main training loop (must be implemented by subclass).

#### `train_epoch(train_loader)`
Run one training epoch.
- **Returns:** float (average training loss)

#### `validate_epoch(val_loader)`
Run one validation epoch.
- **Returns:** float (average validation loss)

#### `calculate_loss(pred, target, mask)`
Calculate masked MSE loss.
- **Parameters:**
  - `pred` (torch.Tensor): Predictions
  - `target` (torch.Tensor): Targets
  - `mask` (torch.Tensor): Mask indicating pixels to include
- **Returns:** torch.Tensor (loss value)

#### `save_checkpoint(path)`
Save model checkpoint.

#### `load_checkpoint(path)`
Load model checkpoint.

---

## Module: `trainers.auto_struct_n2v`

### Class: `AutoStructN2VTrainer`

Trainer for 2-stage autoStructN2V approach.

**Constructor:**
```python
AutoStructN2VTrainer(model, optimizer, scheduler, device, hparams, 
                     stage, experiment_name='experiment')
```

**Parameters:**
- Inherits BaseTrainer parameters
- `stage` (str): 'stage1' or 'stage2'
- `experiment_name` (str): Experiment name for logging

**Methods:**

#### `train(train_loader, val_loader, test_loader=None)`

Main training loop with stage-specific logic.

**Returns:**
- Stage 1: numpy.ndarray (denoised patches for Stage 2 mask)
- Stage 2: None

**Features:**
- Early stopping with configurable patience
- Learning rate scheduling
- Periodic test image logging
- Best model checkpointing
- Stage-specific post-training actions

**Example:**
```python
from autoStructN2V.trainers import AutoStructN2VTrainer
import torch

trainer = AutoStructN2VTrainer(
    model=model,
    optimizer=optimizer,
    scheduler=scheduler,
    device=torch.device('cuda'),
    hparams=config,
    stage='stage1',
    experiment_name='my_experiment'
)

denoised_patches = trainer.train(train_loader, val_loader, test_loader)
```

#### `create_denoised_patches(data_loader)`

Create denoised patches from Stage 1 model.

**Parameters:**
- `data_loader` (DataLoader): Data loader

**Returns:**
- numpy.ndarray: Denoised patches for mask creation

---

## Module: `trainers.callbacks`

### Class: `EarlyStopping`

Early stopping callback to prevent overfitting.

**Constructor:**
```python
EarlyStopping(patience=10, min_delta=0.001)
```

**Parameters:**
- `patience` (int): Epochs without improvement before stopping
- `min_delta` (float): Minimum improvement threshold

**Methods:**

#### `__call__(val_loss)`

Check if training should stop.

**Parameters:**
- `val_loss` (float): Current validation loss

**Returns:**
- bool: True to stop training

**Example:**
```python
from autoStructN2V.trainers.callbacks import EarlyStopping

early_stopping = EarlyStopping(patience=15, min_delta=0.001)

for epoch in range(num_epochs):
    # Training...
    val_loss = validate()

    if early_stopping(val_loss):
        print(f"Early stopping at epoch {epoch}")
        break
```

---

**See Also:**
- [Training Guide](../user-guide/training.md)
- [Configuration Reference](../user-guide/configuration.md)
