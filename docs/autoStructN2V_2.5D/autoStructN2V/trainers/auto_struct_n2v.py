# autoStructN2V/trainers/auto_struct_n2v.py
import os
import torch
import torch.nn as nn
from torch.utils.tensorboard import SummaryWriter
from tqdm import tqdm
import numpy as np
import torchvision.utils as vutils  # Add this import

from .base import BaseTrainer
from .callbacks import EarlyStopping
from ..utils.patching import image_to_patches, patches_to_image
from ..utils.image import calculate_autocorrelation

class AutoStructN2VTrainer(BaseTrainer):
    """
    Trainer for the AutoStructN2V model.
    
    This trainer implements the 2-stage autoStructNoise2Void approach, with stage 1
    focusing on standard Noise2Void denoising and stage 2 on structured denoising.
    
    Args:
        model (nn.Module): Model to train
        optimizer (torch.optim.Optimizer): Optimizer for training
        scheduler (torch.optim.lr_scheduler._LRScheduler): Learning rate scheduler
        device (torch.device): Device to use for training
        hparams (dict): Hyperparameters for training
        stage (str): Training stage ('stage1' or 'stage2')
        experiment_name (str): Name of the experiment for logging
    """
    def __init__(self, model, optimizer, scheduler, device, hparams, stage,
                 experiment_name='experiment', clean_stack=None, val_indices=None,
                 aux_psnr_indices=None, norm_stats=None):
        super().__init__(model, optimizer, scheduler, device, hparams)

        self.stage = stage
        if stage not in ['stage1', 'stage2']:
            raise ValueError(f"Invalid stage: {stage}. Must be 'stage1' or 'stage2'.")

        self.experiment_name = experiment_name

        # A4 fix: optional clean reference + validation slice indices for the
        # auxiliary PSNR(model_output, clean) metric. When provided, this PSNR
        # drives ReduceLROnPlateau and EarlyStopping decisions (negated to
        # remain on min-mode). When not provided, the trainer falls back to
        # masked val_loss (which is itself meaningful post-A4).
        self.clean_stack = clean_stack
        self.val_indices = val_indices
        # S4b extension (2026-05-14 session 03): the indices used for the aux
        # PSNR computation are decoupled from the validation-loader indices.
        # The model never trains on clean labels (training uses noisy
        # masked-pixel reconstruction), so computing aux PSNR over a larger
        # set of slices than just val is leakage-free and gives the scheduler
        # a much less noisy signal. Default to val_indices for back-compat;
        # the runner passes train+val (e.g. 17/20 slices) for stack mode,
        # mirroring Broaddus 2020's "no split" convention for the eval metric
        # while keeping test slices truly held out for the final report.
        self.aux_psnr_indices = aux_psnr_indices if aux_psnr_indices is not None else val_indices

        # Train-derived z-score stats. When set, the auxiliary PSNR path
        # normalizes the noisy slice before forwarding it through the model
        # and denormalizes the output before per-stack rescale + PSNR.
        self.norm_stats = norm_stats

        # Set up logging based on stage
        stage_name = 'n2v' if stage == 'stage1' else 'structn2v'
        os.makedirs(experiment_name, exist_ok=True)  # Ensure experiment directory exists
        self.log_dir = os.path.join(experiment_name, stage_name, self.current_time)
        self.writer = SummaryWriter(self.log_dir)

        # Log hyperparameters - convert dict to string for TensorBoard
        hparams_str = self._format_hparams_for_logging(hparams)
        self.writer.add_text("Hyperparameters", hparams_str)

        self.verbose=hparams['verbose']
    
    def _format_hparams_for_logging(self, hparams):
        """Format hyperparameters for TensorBoard logging."""
        lines = []
        for k, v in hparams.items():
            if isinstance(v, dict):
                lines.append(f"{k}:")
                for sub_k, sub_v in v.items():
                    lines.append(f"  {sub_k}: {sub_v}")
            else:
                lines.append(f"{k}: {v}")
        return "\n".join(lines)
    
    def _get_param(self, param_name, default_value=None):
        """
        Get a parameter from hparams, supporting both structured and flat config formats.
        
        Args:
            param_name (str): Parameter name without prefix
            default_value: Default value if parameter is not found
            
        Returns:
            Parameter value
        """
        # Check structured format first
        if self.stage == 'stage1':
            if 'stage1' in self.hparams and param_name in self.hparams['stage1']:
                return self.hparams['stage1'][param_name]
            # Fall back to flat format with n2v_ prefix
            return self.hparams.get(f'n2v_{param_name}', default_value)
        else:  # stage2
            if 'stage2' in self.hparams and param_name in self.hparams['stage2']:
                return self.hparams['stage2'][param_name]
            # Fall back to flat format with structn2v_ prefix
            return self.hparams.get(f'structn2v_{param_name}', default_value)
    
    def train(self, train_loader, val_loader, test_loader=None):
        """
        Main training loop for AutoStructN2V.
        
        Args:
            train_loader (DataLoader): Training data loader
            val_loader (DataLoader): Validation data loader
            test_loader (DataLoader, optional): Test data loader. Required for stage2. Defaults to None.
            
        Returns:
            For stage1: numpy.ndarray - denoised patches for custom mast creation for stage2
            For stage2: None
        """
        # Validate inputs based on stage
        if self.stage == 'stage2' and test_loader is None:
            raise ValueError("test_loader is required for stage2 training")

        # Set up early stopping
        patience = self.hparams.get('early_stopping_patience', 10)
        min_delta = self.hparams.get('early_stopping_min_delta', 0.001)
        early_stopping = EarlyStopping(patience=patience, min_delta=min_delta)
        
        # Path to save best model
        os.makedirs(self.log_dir, exist_ok=True)  # Ensure log directory exists
        best_model_path = os.path.join(self.log_dir, 'best_model.pth')
        
        # Get number of epochs - check in both locations
        num_epochs = self.hparams.get('num_epochs', 100)
        
        # Aux PSNR-against-clean routing:
        #   - ``compute_aux_psnr`` controls whether the metric is computed
        #     and logged each epoch (diagnostic value in the synthetic regime).
        #   - ``drive_scheduling_with_aux_psnr`` additionally requires the
        #     ``use_aux_psnr_for_scheduling`` config flag to be True. Default
        #     is False (paper-faithful: masked val_loss drives the scheduler /
        #     early-stopping / checkpoint selection — Krull 2019, Broaddus 2020,
        #     Höck 2022, CAREamics 0.1.0). Reverted from default-True on
        #     2026-05-15 session 01; see SHARED_HPARAMS comment.
        compute_aux_psnr = (self.clean_stack is not None
                            and self.aux_psnr_indices is not None)
        flag_use_aux = bool(self.hparams.get('use_aux_psnr_for_scheduling', False))

        if compute_aux_psnr:
            # Pull the noisy stack reference from the training dataset (stack
            # mode only). Fall back gracefully for path mode — the aux metric
            # requires indexable z-slices.
            train_ds = train_loader.dataset
            if getattr(train_ds, 'stack', None) is not None:
                self._noisy_stack_ref = train_ds.stack
                if flag_use_aux:
                    print(f"Auxiliary PSNR-against-clean metric DRIVES scheduling / "
                          f"early-stopping / checkpoint selection "
                          f"({len(self.aux_psnr_indices)} aux-PSNR slices).")
                else:
                    print(f"Auxiliary PSNR-against-clean metric LOGGED but does NOT drive "
                          f"scheduling decisions (masked val_loss is used; paper-faithful). "
                          f"{len(self.aux_psnr_indices)} aux-PSNR slices computed each epoch.")
            else:
                print("Warning: clean_stack provided but training dataset is in path mode "
                      "(no indexable noisy stack). Aux PSNR will not be computed.")
                compute_aux_psnr = False
                self._noisy_stack_ref = None
        else:
            self._noisy_stack_ref = None

        drive_scheduling_with_aux_psnr = compute_aux_psnr and flag_use_aux

        # Main training loop
        print(f"Training {self.stage} model...")
        with tqdm(total=num_epochs, desc="Training Progress", ncols=100) as pbar:
            for epoch in range(num_epochs):
                # Training phase
                train_loss = self.train_epoch(train_loader)
                self.writer.add_scalar('Loss/train', train_loss, epoch)

                # Validation phase (masked val loss — meaningful post-A4)
                val_loss = self.validate_epoch(val_loader)
                self.writer.add_scalar('Loss/val', val_loss, epoch)

                # Auxiliary PSNR-against-clean — computed + logged whenever a
                # clean reference is available, but only drives the scheduler /
                # early-stopping / checkpoint selection when the explicit
                # use_aux_psnr_for_scheduling flag is enabled. Paper-faithful
                # default (False) uses the masked val_loss.
                if compute_aux_psnr:
                    val_psnr = self.validate_psnr_against_clean()
                    self.writer.add_scalar('Val/psnr_clean', val_psnr, epoch)
                else:
                    val_psnr = None

                if drive_scheduling_with_aux_psnr and val_psnr is not None:
                    # Negate so the (min-mode) scheduler / early-stopping
                    # treat increasing PSNR as "improvement".
                    metric_for_decisions = -val_psnr
                else:
                    metric_for_decisions = val_loss

                # Learning rate scheduling
                self.scheduler.step(metric_for_decisions)
                self.writer.add_scalar('LR', self.optimizer.param_groups[0]['lr'], epoch)

                # Log test images periodically
                if test_loader and epoch % 5 == 0:
                    # Get patch_size from config using helper method
                    patch_size = self._get_param('patch_size', 64)
                    stride = patch_size // 2
                    self.log_test_images(test_loader, self.writer, epoch, patch_size, stride)

                # Model saving and early stopping (driven by metric_for_decisions)
                if metric_for_decisions < early_stopping.best_loss:
                    self.save_checkpoint(best_model_path)

                if early_stopping(metric_for_decisions) and self.hparams.get('early_stopping', True):
                    print(f"Early stopping triggered at epoch {epoch}")
                    break

                pbar.update(1)

        if val_psnr is not None:
            scheduling_note = ("driving scheduling" if drive_scheduling_with_aux_psnr
                               else "diagnostic only; masked val_loss drove scheduling")
            print(f"Training completed. Final - Train loss: {train_loss:.4f}, "
                  f"Val loss: {val_loss:.4f}, Val PSNR (vs clean): {val_psnr:.2f} dB "
                  f"[{scheduling_note}]")
        else:
            print(f"Training completed. Final losses - Training: {train_loss:.4f}, Validation: {val_loss:.4f}")
        
        # Load best model for inference
        self.load_checkpoint(best_model_path)
        
        # Stage-specific post-training actions
        if self.stage == 'stage1':
            print("Using Model to denoise patches for Stage 2...")
            denoised_patches = self.create_denoised_patches(train_loader)

            if self.verbose:
                import matplotlib.pyplot as plt
                import numpy as np
                
                print("\n=== Stage 1 Denoising Results ===")
                
                # Get a batch of original patches and process them through the model
                self.model.eval()
                with torch.no_grad():
                    batch = next(iter(train_loader))
                    original_inputs = batch[0]  # Original noisy patches
                    original_inputs_device = original_inputs.to(self.device)
                    
                    # Process the same patches through the model
                    corresponding_denoised = self.model(original_inputs_device)
                    
                    # Convert to numpy for visualization
                    original_numpy = original_inputs.cpu().numpy()
                    denoised_numpy = corresponding_denoised.cpu().numpy()
                
                # Show corresponding patches (same patches before and after denoising)
                num_samples = min(3, len(original_numpy))
                fig, axes = plt.subplots(2, num_samples, figsize=(4*num_samples, 8))
                
                # Handle case where we only have one sample
                if num_samples == 1:
                    axes = axes.reshape(2, 1)
                
                for i in range(num_samples):
                    # Original noisy patch
                    axes[0, i].imshow(original_numpy[i, 0], cmap='gray')
                    axes[0, i].set_title(f"Original Noisy {i+1}")
                    axes[0, i].axis('off')
                    
                    # Same patch after denoising
                    axes[1, i].imshow(denoised_numpy[i, 0], cmap='gray')
                    axes[1, i].set_title(f"Denoised {i+1}")
                    axes[1, i].axis('off')
                
                plt.tight_layout()
                plt.show()
                
                # Show autocorrelations of the same corresponding patches
                if num_samples > 0:
                    fig, axes = plt.subplots(2, num_samples, figsize=(4*num_samples, 6))
                    
                    # Handle case where we only have one sample
                    if num_samples == 1:
                        axes = axes.reshape(2, 1)
                    
                    for i in range(num_samples):
                        # Calculate autocorrelations (central region)
                        original_patch = original_numpy[i, 0]
                        denoised_patch = denoised_numpy[i, 0]
                        
                        original_autocorr = calculate_autocorrelation(original_patch, crop_size = 16)
                        denoised_autocorr = calculate_autocorrelation(denoised_patch, crop_size = 16)
                        
                        # Show autocorrelations
                        im1 = axes[0, i].imshow(original_autocorr, cmap='viridis')
                        axes[0, i].set_title(f"Original {i+1} Autocorrelation (Center)")
                        #axes[0, i].axis('off')
                        #plt.colorbar(im1, ax=axes[0, i], fraction=0.046, pad=0.04)
                        
                        im2 = axes[1, i].imshow(denoised_autocorr, cmap='viridis')
                        axes[1, i].set_title(f"Denoised {i+1} Autocorrelation (Center)")
                        #axes[1, i].axis('off')
                        #plt.colorbar(im2, ax=axes[1, i], fraction=0.046, pad=0.04)
                    
                    plt.tight_layout()
                    plt.show()
            
            self.writer.close()
            return denoised_patches
        else:  # stage2
            print("Starting testing phase...")
            patch_size = self._get_param('patch_size', 64)
            stride = patch_size // 2
            test_loss = self.test_model(test_loader, self.writer, patch_size, stride)
                
            
            print(f"Testing completed. Test Loss: {test_loss:.4f}")
            self.writer.close()
            return None
    
    def validate_psnr_against_clean(self):
        """
        Compute mean PSNR(model(noisy_slice), clean_slice) across validation slices.

        Auxiliary metric for the A4 fix — provides an objective denoising
        signal for early-stopping / LR-scheduling decisions when ground-truth
        clean data is available (synthetic regime). Distinct from the masked
        val_loss (which is computed against the noisy target via the blind-
        spot masking scheme).

        Implementation notes:
        - Runs the model on each FULL validation slice (no patching) — assumes
          the slice fits in GPU memory at inference. For our 512² confocal /
          200²–256² COSEM stacks this is fine.
        - Pads to a multiple of ``2 ** num_layers`` to satisfy U-Net pooling
          shape requirements; crops back to the original H, W after.
        - Tier B2 (2026-05-14 session 03): rescales the denoised slices
          using a SINGLE per-stack min/max computed across all validation
          slices' outputs, then computes PSNR per slice. This matches
          ``shared.metrics.evaluate_stack(renormalize_denoised=True)`` exactly,
          which uses ``stack.min() / stack.max()`` (the global min/max).
          The pre-B2 path used per-slice min/max — diverged from the
          production metric and biased early-stopping/LR decisions toward a
          metric the model was not actually being scored on at the end.
          See diagnostic finding S4.
        - Reads the noisy reference from ``self.clean_stack`` indices —
          we use the same z-indices as the training/validation split, looking
          up the noisy slice in the dataset's ``stack`` and the clean slice
          in ``self.clean_stack``.

        Returns:
            float: Mean PSNR (dB) across validation slices.
        """
        from skimage.metrics import peak_signal_noise_ratio

        # Determine padding divisor from U-Net depth
        num_layers = self._get_param('num_layers', 2)
        divisor = 2 ** num_layers

        # Find the noisy stack — set in train() at startup. If not threaded
        # (e.g. real-data run with no clean reference), skip the metric.
        if not hasattr(self, '_noisy_stack_ref') or self._noisy_stack_ref is None:
            return float('nan')
        noisy_stack = self._noisy_stack_ref

        # Pass 1: forward all aux-PSNR slices, collect (denoised, clean) pairs
        # in unrescaled (denormalised) space so we can do a single global rescale
        # afterwards (per-stack semantics matching shared.metrics.evaluate_stack).
        # S4b extension (2026-05-14 session 03): aux_psnr_indices may include
        # train slices in addition to val — leakage-free since the model never
        # trains on clean labels. Gives the scheduler a 5–6× less noisy signal
        # than the legacy 3-val-slice path. See diagnostic finding S4 + Tier B2.
        denoised_slices = []
        clean_slices = []
        self.model.eval()
        with torch.no_grad():
            for z in self.aux_psnr_indices:
                noisy = np.asarray(noisy_stack[z], dtype=np.float32)
                clean = np.asarray(self.clean_stack[z], dtype=np.float32)

                h, w = noisy.shape
                pad_h = (-h) % divisor
                pad_w = (-w) % divisor
                if pad_h or pad_w:
                    padded = np.pad(noisy, ((0, pad_h), (0, pad_w)), mode='reflect')
                else:
                    padded = noisy

                # z-score normalization (CAREamics-style) — keep model input in
                # the same space as training when norm_stats is set.
                if self.norm_stats is not None:
                    m_, s_, eps_ = self.norm_stats['mean'], self.norm_stats['std'], self.norm_stats['eps']
                    padded = ((padded - m_) / (s_ + eps_)).astype(np.float32)

                t = torch.from_numpy(padded).float().unsqueeze(0).unsqueeze(0).to(self.device)
                out = self.model(t).squeeze().cpu().numpy()

                # Denormalize output before crop.
                if self.norm_stats is not None:
                    out = out * (s_ + eps_) + m_

                denoised_slices.append(out[:h, :w])
                clean_slices.append(clean)

        if not denoised_slices:
            return float('nan')

        # Pass 2: per-stack min-max rescale (single global min/max across the
        # entire validation stack of denoised outputs), then PSNR per slice.
        # Matches shared.metrics.evaluate_stack: it stacks all slices, calls
        # renormalize_to_unit_range (global rescale), then computes PSNR
        # per slice and returns the mean.
        d_stack = np.stack(denoised_slices, axis=0)
        d_min, d_max = float(d_stack.min()), float(d_stack.max())
        if d_max > d_min:
            d_stack = (d_stack - d_min) / (d_max - d_min)
        else:
            d_stack = np.zeros_like(d_stack)

        psnrs = []
        for i in range(d_stack.shape[0]):
            clean_n = np.clip(clean_slices[i], 0.0, 1.0)
            denoised_n = np.clip(d_stack[i], 0.0, 1.0)
            psnrs.append(peak_signal_noise_ratio(clean_n, denoised_n, data_range=1.0))

        return float(np.mean(psnrs))

    def create_denoised_patches(self, data_loader):
        """
        Create denoised patches using the trained Stage 1 model.

        These patches will be used to extract structural noise patterns
        for the Stage 2 model mask.

        Works for both 2D and 2.5D modes:
        - 2D mode: Returns shape (N, 1, H, W)
        - 2.5D mode with run_stage2=True: Returns shape (N, 3, H, W)
          The 3 channels represent denoised triplets which will be used
          for 3D autocorrelation analysis in mask extraction.
        - 2.5D mode with run_stage2=False: Returns shape (N, 1, H, W)
          Only center slice prediction.

        Args:
            data_loader (DataLoader): Data loader with patches

        Returns:
            numpy.ndarray: Denoised patches with shape depending on mode:
                - 2D: (N, 1, H, W)
                - 2.5D with Stage 2: (N, 3, H, W)
                - 2.5D without Stage 2: (N, 1, H, W)
        """
        self.model.eval()
        denoised_patches = []

        with torch.no_grad():
            # Get max patches to process from config
            max_patches = self._get_param('max_denoised_patches', 1000)

            for inputs, targets, _ in data_loader:
                # Use unmasked ``targets`` (raw noisy patches) for inference,
                # NOT the N2V-masked ``inputs``. Feeding masked patches at
                # patch-extraction time produces a quasi-grid artifact at the
                # ~15% mask positions (smooth predictions vs. noisy unmasked
                # surroundings) which corrupts the autocorrelation analysis
                # used for mask discovery in Stage 2.
                noisy = targets.to(self.device)
                outputs = self.model(noisy)

                # Move outputs to CPU and convert to numpy
                # Shape will be (B, C, H, W) where C depends on mode and stage config
                denoised_np = outputs.cpu().numpy()
                denoised_patches.extend([patch for patch in denoised_np])

                # Limit the number of patches to process
                if len(denoised_patches) >= max_patches:
                    break

        return np.array(denoised_patches)