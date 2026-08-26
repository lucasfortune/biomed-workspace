"""
Training orchestration for the denoising package (routed v1.0).

run_training implements the web flavor of the routed pipeline:

    load raw stack -> resolve mask/route (seconds, BEFORE any training)
        -> [pause for user approval when pauseAfterMask]
        -> train ONE branch model -> predict full stack -> finalize

The mask-approval pause therefore costs seconds, not a Stage 1 training
(the old two-stage flow extracted the mask from Stage 1 denoised patches;
the published method extracts it from the raw stack).
"""

import os
import json
import time
import traceback
from datetime import datetime

import torch
import numpy as np
import tifffile
from tiff_validation_utils import safe_imread

from autoStructN2V.pipeline.config import validate_config, create_output_directories
from autoStructN2V.pipeline.data import split_stack_indices, create_routed_dataloaders
from autoStructN2V.pipeline.runner import (
    load_mask_from_file,
    _automask_kwargs,
    _create_branch_model,
)
from autoStructN2V.masking.autoextract import AutoMaskExtractor, RouteDecision
from autoStructN2V.inference import AutoStructN2VPredictor
from autoStructN2V.utils.image import load_tiff_stack
from autoStructN2V.utils.training import set_seed

from .utils import emit_progress, emit_result, emit_error, detect_pattern
from .trainer import WebRoutedTrainer
from .output import finalize_routed_output


def create_progress_callback(stage: str, training_id: str):
    """
    Create a per-epoch progress callback emitting to the given stage.

    Args:
        stage: Stage name for the stdout protocol (the routed flow uses 'train')
        training_id: Unique training session ID
    """
    start_time = time.time()

    def callback(epoch, total_epochs, train_loss, val_loss, lr, early_stopped=False):
        elapsed = time.time() - start_time
        remaining = (elapsed / epoch) * (total_epochs - epoch) if epoch > 0 else 0

        emit_progress(stage, {
            "training_id": training_id,
            "epoch": epoch,
            "totalEpochs": total_epochs,
            "trainLoss": float(train_loss),
            "valLoss": float(val_loss),
            "learningRate": float(lr),
            "timeElapsed": elapsed,
            "timeRemaining": remaining,
            "earlyStopped": early_stopped
        })

    return callback


def _resolve_route_web(config, stack, verbose=False):
    """Resolve the mask source into (RouteDecision, mask_rho2 | None).

    Mirrors autoStructN2V.pipeline.runner.resolve_route but keeps the
    extractor's info dict so mask_rho2 (fraction of center-pixel noise
    variance the mask plugs) can be surfaced in the approval UI.
    """
    mask_cfg = config['mask']
    source = mask_cfg['source']

    if source == 'center':
        kernel = RouteDecision.center_kernel(mask_cfg['center_size'])
        return RouteDecision('n2v', kernel, 'center_only'), None

    if source == 'file':
        kernel = load_mask_from_file(mask_cfg['file_path'], verbose)
        return RouteDecision('structn2v', kernel, 'manual'), None

    # source == 'extractor' (the method; webapp always uses extractor_input='raw')
    extractor = AutoMaskExtractor(**_automask_kwargs(mask_cfg['extractor']))
    decision, info = extractor.route(stack, verbose=verbose)
    mask_rho2 = info.get('mask_rho2')
    return decision, (float(mask_rho2) if mask_rho2 is not None else None)


def route_payload(training_id, decision, mask_path, mask_rho2=None):
    """Build the mask/route payload consumed by the approval UI."""
    kernel = decision.mask
    kh, kw = int(kernel.shape[0]), int(kernel.shape[1])
    m = decision.metrics

    def _f(v):
        return float(v) if v is not None else None

    return {
        "training_id": training_id,
        "maskPath": mask_path,
        "maskArray": kernel.astype(int).tolist(),
        "kernelSize": max(kh, kw),
        "kernelHeight": kh,
        "kernelWidth": kw,
        "activePixels": int(kernel.sum()),
        "pattern": detect_pattern(kernel),
        "isEmpty": bool(kernel.sum() <= 1),
        "branch": decision.branch,
        "routeReason": decision.reason,
        "routeMessage": decision.message,
        "dmax": _f(m.get('dmax')),
        "dmaxThreshold": _f(m.get('dmax_thr')),
        "coherence": _f(m.get('coherence')),
        "maskRho2": mask_rho2,
    }


def save_route_artifacts(dirs, decision, mask_rho2=None):
    """Save routed_mask.npy + route_decision.json (mirrors the library runner).

    Returns the mask path.
    """
    mask_path = os.path.join(dirs['model'], 'routed_mask.npy')
    np.save(mask_path, decision.mask)
    with open(os.path.join(dirs['experiment'], 'route_decision.json'), 'w') as fh:
        json.dump({
            'branch': decision.branch,
            'reason': decision.reason,
            'mask_px': int(decision.mask.sum()),
            'mask_shape': list(decision.mask.shape),
            'mask_rho2': mask_rho2,
            'metrics': {k: (float(v) if isinstance(v, (int, float, np.floating)) else v)
                        for k, v in decision.metrics.items()},
        }, fh, indent=2)
    return mask_path


def _save_config_json(config, dirs):
    """Persist the resolved config to <experiment>/config.json (JSON-safe)."""
    def _json_safe(v):
        if isinstance(v, tuple):
            return list(v)
        if isinstance(v, dict):
            return {k: _json_safe(x) for k, x in v.items()}
        if isinstance(v, (list, str, int, float, bool, type(None))):
            return v
        return str(v)
    config_path = os.path.join(dirs['experiment'], 'config.json')
    with open(config_path, 'w') as f:
        json.dump({k: _json_safe(v) for k, v in config.items()}, f, indent=4)
    return config_path


def prepare_stack_and_stats(config, verbose=False):
    """Load the normalized stack and compute split indices + zscore stats.

    Uses the library's load_tiff_stack (per-slice [0,1] normalization; the
    validated input domain of the method) and mirrors the library runner's
    zscore-stat computation, with the web adapter's NaN / zero-std guards.

    Returns (stack, slice_indices); stores '_norm_stats' on config when
    normalize_method == 'zscore'.
    """
    stack = load_tiff_stack(config['input_data'])

    slice_indices = split_stack_indices(
        num_slices=stack.shape[0], split_ratio=config['split_ratio'],
        seed=config['random_seed'], verbose=verbose)

    if config['normalize_method'] == 'zscore' and not config.get('_norm_stats'):
        train_slices = stack[slice_indices['train']]
        if np.isnan(train_slices).any():
            raise ValueError(
                "Training stack contains NaN values; cannot compute zscore "
                "statistics. Clean the input or switch normalize_method to 'unit'.")
        mean = float(train_slices.mean())
        std = float(train_slices.std())
        # Near-zero std (constant-intensity stack) makes (x - mean) / (std + eps)
        # blow up and the model converges to a near-constant output.
        if std < 1e-8:
            raise ValueError(
                "Training data has near-zero standard deviation; cannot zscore "
                "normalize. Use normalize_method='unit' or check the input data.")
        config['_norm_stats'] = {'mean': mean, 'std': std, 'eps': 1e-6}
        print(f"[zscore] Train stats computed: mean={mean:.6f}, std={std:.6f}")

    return stack, slice_indices


def predict_full_stack(config, recipe, branch, checkpoint_path, device,
                       training_id, dirs):
    """Predict the full input stack with the trained branch model.

    Runs slice by slice so the UI gets per-slice progress, and round-trips
    each slice through the same per-slice [0,1] normalization the model was
    trained on (load_tiff_stack convention), writing the output in the
    input's native dtype.

    Returns the output path.
    """
    trained = _create_branch_model(recipe, branch).to(device)
    checkpoint = torch.load(checkpoint_path, map_location=device)
    trained.load_state_dict(checkpoint['model_state_dict'])
    trained.eval()

    patch_size = recipe['patch_size']
    # stride=patch_size//4 (library default is //2): each pixel is averaged
    # over ~4 patches, softening stride-boundary seams from constant-weight
    # overlap-tile blending. Cost: ~4x slower inference.
    predictor = AutoStructN2VPredictor(
        model=trained,
        patch_size=patch_size,
        stride=max(1, patch_size // 4),
        mode='2d',
        norm_stats=config.get('_norm_stats'),
        overlap_tile_pad=recipe.get('overlap_tile_pad', 0),
    )

    raw_stack = safe_imread(config['input_data'])
    if raw_stack.ndim == 2:
        raw_stack = raw_stack[np.newaxis, ...]
    original_dtype = raw_stack.dtype
    total_slices = raw_stack.shape[0]

    emit_progress('predict', {
        "training_id": training_id,
        "status": "starting",
        "total_slices": total_slices
    })

    output_stack = np.zeros_like(raw_stack)
    is_float = np.issubdtype(original_dtype, np.floating)
    for z in range(total_slices):
        slice_data = raw_stack[z].astype(np.float32)
        smin, smax = float(slice_data.min()), float(slice_data.max())
        slice_norm = (slice_data - smin) / (smax - smin + 1e-8)
        out_norm = predictor._predict_2d(slice_norm[np.newaxis, ...])[0]
        out_dn = np.clip(out_norm, 0.0, 1.0) * (smax - smin) + smin
        output_stack[z] = out_dn if is_float else np.round(out_dn)
        emit_progress('predict', {
            "training_id": training_id,
            "current_slice": z + 1,
            "total_slices": total_slices,
            "progress_percent": ((z + 1) / total_slices) * 100.0,
        })

    output_path = os.path.join(dirs['final_results'], 'denoised_stack.tif')
    tifffile.imwrite(output_path, output_stack.astype(original_dtype))
    print(f"[predict] Denoised stack saved to {output_path} "
          f"(dtype: {original_dtype})")

    del trained, predictor
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return output_path


def train_and_predict(config, dirs, stack, slice_indices, decision,
                      training_id, method, mask_rho2=None):
    """Steps 2+3 of the routed pipeline: train the branch, predict, finalize.

    Shared by run_training (no-pause path) and operations.continue_training
    (after mask approval).
    """
    branch = decision.branch
    recipe = config['recipes'][branch]

    device = torch.device(config['device'] if torch.cuda.is_available()
                          and config['device'] == 'cuda' else 'cpu')

    # The trainer reads loop-control knobs from the TOP level of hparams;
    # presets/UI may specify them per recipe. Recipe-level values win.
    loop_keys = ('num_epochs', 'early_stopping', 'early_stopping_patience',
                 'early_stopping_min_delta')
    loop_overrides = {k: recipe[k] for k in loop_keys if k in recipe}
    total_epochs = loop_overrides.get('num_epochs', config.get('num_epochs', 100))

    emit_progress('train', {
        "training_id": training_id,
        "status": "starting",
        "branch": branch,
        "routeReason": decision.reason,
        "totalEpochs": total_epochs,
        "device": str(device)
    })

    train_loader, val_loader, test_loader = create_routed_dataloaders(
        config, recipe, decision.mask, stack, slice_indices,
        verbose=config.get('verbose', False))

    model = _create_branch_model(recipe, branch)
    optimizer = torch.optim.Adam(model.parameters(), lr=recipe['learning_rate'])
    # Scheduler settings mirror the library runner (wide patience + LR floor).
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', factor=0.1, patience=20, min_lr=1e-6)

    hparams = dict(config)
    hparams[branch] = recipe  # trainer reads hparams[<stage key>]
    hparams.update(loop_overrides)
    trainer = WebRoutedTrainer(
        model=model, optimizer=optimizer, scheduler=scheduler, device=device,
        hparams=hparams, stage=branch,
        experiment_name=os.path.join(
            dirs['logs'], datetime.now().strftime('%Y%m%d-%H%M%S')),
        norm_stats=config.get('_norm_stats'),
        progress_callback=create_progress_callback('train', training_id),
    )
    training_results = trainer.train(train_loader, val_loader, test_loader)

    checkpoint_path = os.path.join(dirs['model'], 'model.pth')
    trainer.save_checkpoint(checkpoint_path)

    emit_result('train', {
        "training_id": training_id,
        "modelPath": checkpoint_path,
        "branch": branch
    })

    del model, trainer, optimizer, scheduler
    del train_loader, val_loader, test_loader
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    denoised_path = predict_full_stack(
        config, recipe, branch, checkpoint_path, device, training_id, dirs)

    results = {
        'experiment_dir': dirs['experiment'],
        'training_id': training_id,
        'method': method,
        'branch': branch,
        'route_reason': decision.reason,
        'mask_rho2': mask_rho2,
        'model_path': checkpoint_path,
        'mask_path': os.path.join(dirs['model'], 'routed_mask.npy'),
        'denoised_path': denoised_path,
        'training_results': training_results,
    }

    output_files = finalize_routed_output(config, dirs, results, method, training_id)
    results['output_files'] = output_files

    emit_result('complete', {
        "training_id": training_id,
        "method": method,
        "branch": branch,
        "routeReason": decision.reason,
        "outputFiles": output_files
    })

    return results


def prepare_web_config(config):
    """Map the web config onto the routed schema and validate it.

    - 'input_dir' pointing at a TIFF file (historic Node misnomer) becomes
      'input_data'.
    - method 'n2v' forces mask.source='center' (plain N2V through the same
      routed machinery); method 'autostructn2v' uses the extractor.
    - The publication default normalize_method='zscore' is applied unless
      the caller explicitly set one.
    """
    method = config.get('method', 'autostructn2v')

    if not config.get('input_data') and config.get('input_dir'):
        config['input_data'] = config.pop('input_dir')
    config.pop('input_dir', None)

    config.setdefault('normalize_method', 'zscore')

    mask = config.setdefault('mask', {})
    if method == 'n2v':
        mask['source'] = 'center'
        mask.setdefault('center_size', 1)
    else:
        mask.setdefault('source', 'extractor')

    return validate_config(config)


def run_training(config: dict):
    """
    Run the routed web training flow.

    Args:
        config: Web training configuration. Expected keys beyond the routed
            schema: training_id, method ('n2v'|'autostructn2v'), workspace_dir,
            pauseAfterMask (bool; only honored for method 'autostructn2v').

    Behavior:
        method 'autostructn2v' + pauseAfterMask: resolve the route (seconds),
        emit 'mask' + 'paused' results and exit; training is triggered
        separately via continue_training after user approval.
        Otherwise: route -> train -> predict -> finalize in one run.
    """
    training_id = config.get('training_id', f'train_{int(time.time())}')
    method = config.get('method', 'autostructn2v')

    try:
        cfg = prepare_web_config(config)
        verbose = cfg.get('verbose', False)

        dirs = create_output_directories(cfg)
        set_seed(cfg['random_seed'])

        emit_progress('init', {
            "training_id": training_id,
            "method": method,
            "mode": "routed",
            "device": cfg['device'],
            "gpuAvailable": torch.cuda.is_available()
        })

        emit_progress('data', {"training_id": training_id, "status": "splitting"})
        stack, slice_indices = prepare_stack_and_stats(cfg, verbose=verbose)
        emit_progress('data', {
            "training_id": training_id,
            "status": "loaded",
            "numSlices": int(stack.shape[0])
        })

        _save_config_json(cfg, dirs)

        # ---- Step 1: resolve mask -> route (seconds, before any training) ----
        emit_progress('mask', {"training_id": training_id, "status": "extracting"})
        decision, mask_rho2 = _resolve_route_web(cfg, stack, verbose=verbose)
        mask_path = save_route_artifacts(dirs, decision, mask_rho2)
        print(decision.message)

        payload = route_payload(training_id, decision, mask_path, mask_rho2)
        payload['experimentDir'] = dirs['experiment']
        emit_result('mask', payload)

        if method == 'autostructn2v' and cfg.get('pauseAfterMask', False):
            emit_result('paused', {
                **payload,
                "reason": "awaiting_mask_approval",
            })
            # Exit cleanly; continue_training runs after user approval.
            return {'paused_at_mask': True, 'experiment_dir': dirs['experiment'],
                    'mask_path': mask_path}

        # ---- Steps 2+3: train the branch, predict, finalize ------------------
        return train_and_predict(cfg, dirs, stack, slice_indices, decision,
                                 training_id, method, mask_rho2)

    except Exception as e:
        emit_error('training', str(e), traceback.format_exc())
        raise
