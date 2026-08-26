"""
Output finalization for the denoising package (routed v1.0).

Copies the run's deliverables from the experiment directory into the
workspace results/models trees (keeping the DL_<trainingId> convention)
and deletes the intermediate experiment directory.
"""

import os
import json
import shutil

from tiff_validation_utils import safe_imread

from .utils import emit_progress


def finalize_routed_output(config: dict, dirs: dict, results: dict,
                           method: str, training_id: str):
    """
    Finalize a routed training run.

    Args:
        config: The resolved training configuration
        dirs: Directory structure from create_output_directories
        results: Results dictionary from train_and_predict
        method: 'n2v' or 'autostructn2v' (the user-chosen method; the
            trained branch may still be 'n2v' when the router abstained)
        training_id: Training ID for naming

    Returns:
        dict: outputFiles with keys denoised_stack, slice_count, model,
        routed_mask, route_decision, config, results
    """
    emit_progress('cleanup', {"training_id": training_id, "status": "starting"})

    workspace_dir = config.get('workspace_dir',
                               os.path.dirname(dirs['experiment']))
    results_output_dir = os.path.join(workspace_dir, 'results', 'denoising',
                                      f'DL_{training_id}')
    models_output_dir = os.path.join(workspace_dir, 'models', 'denoising',
                                     f'DL_{training_id}')
    os.makedirs(results_output_dir, exist_ok=True)
    os.makedirs(models_output_dir, exist_ok=True)

    output_files = {}

    # ---- Denoised stack ----------------------------------------------------
    denoised_src = results.get('denoised_path')
    if denoised_src and os.path.exists(denoised_src):
        prefix = 'n2v' if method == 'n2v' else 'asn2v'
        stack_output_path = os.path.join(
            results_output_dir, f'{prefix}_denoised_{training_id}.tif')
        shutil.copy2(denoised_src, stack_output_path)
        output_files['denoised_stack'] = stack_output_path

        stack = safe_imread(stack_output_path)
        output_files['slice_count'] = int(
            stack.shape[0] if stack.ndim == 3 else 1)

        emit_progress('cleanup', {
            "training_id": training_id,
            "status": "stack_created",
            "sliceCount": output_files['slice_count'],
            "outputPath": stack_output_path
        })

    # ---- Model + route artifacts + config ----------------------------------
    emit_progress('cleanup', {"training_id": training_id,
                              "status": "copying_models"})

    copies = [
        ('model_path', 'best_model.pth', 'model'),
        ('mask_path', 'routed_mask.npy', 'routed_mask'),
    ]
    for src_key, dest_name, out_key in copies:
        src = results.get(src_key)
        if src and os.path.exists(src):
            dest = os.path.join(models_output_dir, dest_name)
            shutil.copy2(src, dest)
            output_files[out_key] = dest

    for fname, out_key in (('route_decision.json', 'route_decision'),
                           ('config.json', 'config')):
        src = os.path.join(dirs['experiment'], fname)
        if os.path.exists(src):
            dest = os.path.join(models_output_dir, fname)
            shutil.copy2(src, dest)
            output_files[out_key] = dest

    # ---- results.json (training metrics summary) ---------------------------
    tr = results.get('training_results') or {}
    results_json = {
        'method': method,
        'branch': results.get('branch'),
        'route_reason': results.get('route_reason'),
        'mask_rho2': results.get('mask_rho2'),
        'final_train_loss': tr.get('final_train_loss'),
        'final_val_loss': tr.get('final_val_loss'),
        'best_val_loss': tr.get('best_val_loss'),
        'epochs_completed': tr.get('epochs_completed'),
        'total_epochs': tr.get('total_epochs'),
        'early_stopped': tr.get('early_stopped', False),
        'training_time_seconds': tr.get('training_time_seconds'),
    }
    results_json_path = os.path.join(models_output_dir, 'results.json')
    with open(results_json_path, 'w') as f:
        json.dump(results_json, f, indent=2)
    output_files['results'] = results_json_path

    # ---- Cleanup intermediates ---------------------------------------------
    emit_progress('cleanup', {"training_id": training_id,
                              "status": "cleaning_up"})
    experiment_dir = dirs['experiment']
    if os.path.exists(experiment_dir):
        try:
            shutil.rmtree(experiment_dir)
        except Exception as e:
            emit_progress('cleanup', {
                "training_id": training_id,
                "status": "cleanup_warning",
                "message": f"Could not fully delete experiment directory: {str(e)}"
            })

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "complete",
        "outputFiles": output_files
    })

    return output_files
