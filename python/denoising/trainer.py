"""
Custom trainer class for web integration (routed v1.0).

WebRoutedTrainer extends the library trainer with per-epoch progress
callbacks and returns a training-metrics dictionary for results.json.
"""

import os
import time

from autoStructN2V.trainers import AutoStructN2VTrainer
from autoStructN2V.trainers.callbacks import EarlyStopping


class WebRoutedTrainer(AutoStructN2VTrainer):
    """
    Extended trainer with web progress callbacks.

    Overrides train() to emit progress after each epoch and to return
    training metrics. Mirrors the library loop (masked val_loss drives
    scheduling, checkpointing and early stopping; the aux-PSNR path is
    omitted because the webapp never has a clean reference stack).

    Args:
        *args: Arguments passed to AutoStructN2VTrainer
        progress_callback: Optional callable
            (epoch, total_epochs, train_loss, val_loss, lr, early_stopped)
        **kwargs: Keyword arguments passed to AutoStructN2VTrainer
    """

    def __init__(self, *args, progress_callback=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.progress_callback = progress_callback

    def train(self, train_loader, val_loader, test_loader=None):
        """
        Training loop with progress emission.

        Returns:
            dict: training metrics (losses, epochs, timing, histories)
        """
        patience = self.hparams.get('early_stopping_patience', 10)
        min_delta = self.hparams.get('early_stopping_min_delta', 0.001)
        early_stopping = EarlyStopping(patience=patience, min_delta=min_delta)

        os.makedirs(self.log_dir, exist_ok=True)
        best_model_path = os.path.join(self.log_dir, 'best_model.pth')

        num_epochs = self.hparams.get('num_epochs', 100)
        start_time = time.time()

        print(f"Training {self.stage} model...")
        best_val_loss = float('inf')
        train_loss_history = []
        val_loss_history = []
        # Track termination explicitly: inferring it from EarlyStopping.counter
        # after the loop is wrong when the last `patience` epochs happen not to
        # improve but the loop ran to completion.
        early_stopped_flag = False

        for epoch in range(num_epochs):
            train_loss = self.train_epoch(train_loader)
            self.writer.add_scalar('Loss/train', train_loss, epoch)
            train_loss_history.append(float(train_loss))

            val_loss = self.validate_epoch(val_loader)
            self.writer.add_scalar('Loss/val', val_loss, epoch)
            val_loss_history.append(float(val_loss))

            self.scheduler.step(val_loss)
            current_lr = self.optimizer.param_groups[0]['lr']
            self.writer.add_scalar('LR', current_lr, epoch)

            if self.progress_callback:
                self.progress_callback(epoch + 1, num_epochs, train_loss,
                                       val_loss, current_lr)

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                self.save_checkpoint(best_model_path)

            # Short-circuit so the predicate (which mutates EarlyStopping.counter)
            # only runs when early stopping is enabled.
            if self.hparams.get('early_stopping', True) and early_stopping(val_loss):
                print(f"Early stopping triggered at epoch {epoch}")
                early_stopped_flag = True
                if self.progress_callback:
                    self.progress_callback(epoch + 1, num_epochs, train_loss,
                                           val_loss, current_lr, early_stopped=True)
                break

        elapsed = time.time() - start_time
        print(f"Training completed. Final losses - Training: {train_loss:.4f}, "
              f"Validation: {val_loss:.4f}")
        print(f"Total training time: {elapsed/60:.1f} minutes")

        # Load best weights so the checkpoint the caller saves is the best
        # model, matching the library trainer's behavior.
        self.load_checkpoint(best_model_path)
        self.writer.close()

        return {
            'final_train_loss': float(train_loss),
            'final_val_loss': float(val_loss),
            'best_val_loss': float(best_val_loss),
            'epochs_completed': epoch + 1,
            'total_epochs': num_epochs,
            'early_stopped': early_stopped_flag,
            'training_time_seconds': elapsed,
            'train_loss_history': train_loss_history,
            'val_loss_history': val_loss_history,
        }
