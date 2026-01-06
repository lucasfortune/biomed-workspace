"""
Output processing functions for the denoising package.

Handles:
- Collecting denoised slices from train/val/test directories
- Creating TIFF stacks from individual slices
- Finalizing training output (model copying, cleanup)
"""

import os
import re
import json
import shutil

import numpy as np
import tifffile

from .utils import emit_progress


def collect_denoised_slices(denoised_dir: str) -> list:
    """
    Collect all denoised slice TIFF files from train/val/test directories.

    Args:
        denoised_dir: Path to directory containing train/val/test subdirs with denoised slices

    Returns:
        List of (slice_number, file_path) tuples, sorted by slice number
    """
    slices = []

    print(f"[DEBUG] Looking for denoised slices in: {denoised_dir}")

    # Check for train/val/test subdirectories
    for split in ['train', 'val', 'test']:
        split_dir = os.path.join(denoised_dir, split)
        if not os.path.exists(split_dir):
            print(f"[DEBUG] Split directory does not exist: {split_dir}")
            continue

        files_in_dir = os.listdir(split_dir)
        print(f"[DEBUG] Found {len(files_in_dir)} files in {split}: {files_in_dir[:5]}{'...' if len(files_in_dir) > 5 else ''}")

        for filename in files_in_dir:
            if filename.endswith('_denoised.tif') or filename.endswith('.tif'):
                # Extract slice number from filename (e.g., slice_0042_denoised.tif -> 42)
                match = re.search(r'slice_(\d+)', filename)
                if match:
                    slice_num = int(match.group(1))
                    file_path = os.path.join(split_dir, filename)
                    slices.append((slice_num, file_path))
                else:
                    print(f"[DEBUG] Could not extract slice number from: {filename}")

    print(f"[DEBUG] Total slices collected: {len(slices)}")

    # Sort by slice number
    slices.sort(key=lambda x: x[0])

    return slices


def create_tiff_stack(slices: list, output_path: str) -> int:
    """
    Combine individual slice TIFFs into an ordered TIFF stack.

    Args:
        slices: List of (slice_number, file_path) tuples, sorted by slice number
        output_path: Path to save the combined TIFF stack

    Returns:
        Number of slices in the stack
    """
    if not slices:
        return 0

    # Read all slices and ensure consistent shapes
    stack_list = []
    expected_shape = None

    for i, (slice_num, file_path) in enumerate(slices):
        img = tifffile.imread(file_path)

        # Ensure 2D
        if img.ndim == 3 and img.shape[0] == 1:
            img = img.squeeze(0)
        elif img.ndim > 2:
            print(f"[DEBUG] Warning: slice {slice_num} has unexpected shape {img.shape}, taking first frame")
            img = img[0] if img.ndim == 3 else img.reshape(img.shape[-2], img.shape[-1])

        if i == 0:
            expected_shape = img.shape
            print(f"[DEBUG] First slice (#{slice_num}) shape: {img.shape}, dtype: {img.dtype}")
        elif img.shape != expected_shape:
            print(f"[DEBUG] Warning: slice {slice_num} shape {img.shape} differs from expected {expected_shape}")

        if i < 5 or i >= len(slices) - 2:
            print(f"[DEBUG] Slice {i} (orig #{slice_num}): shape={img.shape}")

        stack_list.append(img)

    print(f"[DEBUG] Collected {len(stack_list)} slices into list")

    # Stack into 3D array (Z, H, W)
    stack = np.stack(stack_list, axis=0)
    print(f"[DEBUG] np.stack result shape: {stack.shape}, dtype: {stack.dtype}")

    # Ensure output directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    # Write as standard multi-page TIFF (avoid imagej=True which can cause slice count issues)
    print(f"[DEBUG] Writing to: {output_path}")
    tifffile.imwrite(output_path, stack)

    # Verify the written file
    verification = tifffile.imread(output_path)
    print(f"[DEBUG] Verification - saved file shape: {verification.shape}, dtype: {verification.dtype}")

    if verification.ndim == 2:
        print(f"[DEBUG] ERROR: Written file is 2D instead of 3D! Something went wrong.")
    elif verification.shape[0] != len(stack_list):
        print(f"[DEBUG] ERROR: Written file has {verification.shape[0]} slices but expected {len(stack_list)}")

    return len(stack_list)


def finalize_training_output(config: dict, dirs: dict, results: dict, method: str, training_id: str):
    """
    Finalize training output by creating TIFF stacks and cleaning up intermediate files.

    This function:
    1. Collects all denoised slices from train/val/test directories
    2. Combines them into single TIFF stacks (sorted by original order)
    3. Copies model files to final locations
    4. Saves config to models directory
    5. Deletes all intermediate files and directories

    Args:
        config: Training configuration
        dirs: Directory structure from create_output_directories
        results: Results dictionary with paths
        method: 'n2v' or 'autostructn2v'
        training_id: Training ID for naming

    Returns:
        dict: Output files dictionary with paths to final outputs
    """
    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "starting"
    })

    # Get workspace paths from config
    workspace_dir = config.get('workspace_dir', os.path.dirname(dirs['experiment']))

    # Create final output directories
    results_output_dir = os.path.join(workspace_dir, 'results', 'denoising', f'DL_{training_id}')
    models_output_dir = os.path.join(workspace_dir, 'models', 'denoising', f'DL_{training_id}')
    os.makedirs(results_output_dir, exist_ok=True)
    os.makedirs(models_output_dir, exist_ok=True)

    output_files = {}

    # =========================================================================
    # Stage 1 Output (N2V or autoStructN2V Stage 1)
    # =========================================================================

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "creating_stage1_stack"
    })

    mode = config.get('mode', '2d')
    stage1_stack_created = False

    # Check for 2.5D mode: we already have a complete stack file
    stage1_denoised_stack_path = results.get('stage1_denoised_stack_path')
    if mode == '2.5d' and stage1_denoised_stack_path and os.path.exists(stage1_denoised_stack_path):
        # Read the stack to get slice count
        stack = tifffile.imread(stage1_denoised_stack_path)
        slice_count = stack.shape[0] if stack.ndim == 3 else 1

        # Determine output filename based on method
        if method == 'n2v':
            stack_filename = f'n2v_denoised_{training_id}.tif'
        else:
            stack_filename = f'asn2v_stage1_denoised_{training_id}.tif'

        # Copy to final results directory
        stack_output_path = os.path.join(results_output_dir, stack_filename)
        shutil.copy2(stage1_denoised_stack_path, stack_output_path)

        output_files['stage1_stack'] = stack_output_path
        output_files['stage1_slice_count'] = slice_count
        stage1_stack_created = True

        print(f"[DEBUG] 2.5D Stage 1 stack copied: {stack_output_path} ({slice_count} slices)")

        emit_progress('cleanup', {
            "training_id": training_id,
            "status": "stage1_stack_created",
            "sliceCount": slice_count,
            "outputPath": stack_output_path
        })

    # 2D mode: collect individual slices from directories
    if not stage1_stack_created:
        stage1_denoised_dir = results.get('stage1_denoised_dir')
        if stage1_denoised_dir and os.path.exists(stage1_denoised_dir):
            # Collect and sort slices
            slices = collect_denoised_slices(stage1_denoised_dir)

            if slices:
                # Determine output filename based on method
                if method == 'n2v':
                    stack_filename = f'n2v_denoised_{training_id}.tif'
                else:
                    stack_filename = f'asn2v_stage1_denoised_{training_id}.tif'

                stack_output_path = os.path.join(results_output_dir, stack_filename)
                slice_count = create_tiff_stack(slices, stack_output_path)

                output_files['stage1_stack'] = stack_output_path
                output_files['stage1_slice_count'] = slice_count

                emit_progress('cleanup', {
                    "training_id": training_id,
                    "status": "stage1_stack_created",
                    "sliceCount": slice_count,
                    "outputPath": stack_output_path
                })

    # =========================================================================
    # Stage 2 Output (autoStructN2V only)
    # =========================================================================

    if method == 'autostructn2v' and 'stage2' in results.get('stages_run', []):
        emit_progress('cleanup', {
            "training_id": training_id,
            "status": "creating_stage2_stack"
        })

        mode = config.get('mode', '2d')
        stage2_stack_created = False

        # Check for 2.5D mode: we already have a complete stack file
        stage2_denoised_stack_path = results.get('stage2_denoised_stack_path')
        if mode == '2.5d' and stage2_denoised_stack_path and os.path.exists(stage2_denoised_stack_path):
            # Read the stack to get slice count
            stack = tifffile.imread(stage2_denoised_stack_path)
            slice_count = stack.shape[0] if stack.ndim == 3 else 1

            # Copy to final results directory
            stack_filename = f'asn2v_stage2_denoised_{training_id}.tif'
            stack_output_path = os.path.join(results_output_dir, stack_filename)
            shutil.copy2(stage2_denoised_stack_path, stack_output_path)

            output_files['stage2_stack'] = stack_output_path
            output_files['stage2_slice_count'] = slice_count
            stage2_stack_created = True

            print(f"[DEBUG] 2.5D Stage 2 stack copied: {stack_output_path} ({slice_count} slices)")

            emit_progress('cleanup', {
                "training_id": training_id,
                "status": "stage2_stack_created",
                "sliceCount": slice_count,
                "outputPath": stack_output_path
            })

        # 2D mode: collect individual slices from directories
        if not stage2_stack_created:
            stage2_denoised_dir = results.get('stage2_denoised_dir')

            if stage2_denoised_dir and os.path.exists(stage2_denoised_dir):
                slices = collect_denoised_slices(stage2_denoised_dir)

                if slices:
                    stack_filename = f'asn2v_stage2_denoised_{training_id}.tif'
                    stack_output_path = os.path.join(results_output_dir, stack_filename)
                    slice_count = create_tiff_stack(slices, stack_output_path)

                    output_files['stage2_stack'] = stack_output_path
                    output_files['stage2_slice_count'] = slice_count

                    emit_progress('cleanup', {
                        "training_id": training_id,
                        "status": "stage2_stack_created",
                        "sliceCount": slice_count,
                        "outputPath": stack_output_path
                    })

    # =========================================================================
    # Copy Model Files
    # =========================================================================

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "copying_models"
    })

    # Copy stage 1 model
    stage1_model_path = results.get('stage1_model_path')
    if stage1_model_path and os.path.exists(stage1_model_path):
        if method == 'n2v':
            dest_model_path = os.path.join(models_output_dir, 'best_model.pth')
        else:
            dest_model_path = os.path.join(models_output_dir, 'stage1_best_model.pth')
        shutil.copy2(stage1_model_path, dest_model_path)
        output_files['stage1_model'] = dest_model_path

    # Copy stage 2 model (autoStructN2V only)
    stage2_model_path = results.get('stage2_model_path')
    if stage2_model_path and os.path.exists(stage2_model_path):
        dest_model_path = os.path.join(models_output_dir, 'stage2_best_model.pth')
        shutil.copy2(stage2_model_path, dest_model_path)
        output_files['stage2_model'] = dest_model_path

    # Copy structural mask (autoStructN2V only - for documentation/reproducibility)
    mask_path = results.get('mask_path')
    if mask_path and os.path.exists(mask_path):
        dest_mask_path = os.path.join(models_output_dir, 'structural_mask.npy')
        shutil.copy2(mask_path, dest_mask_path)
        output_files['structural_mask'] = dest_mask_path

        # Also save mask info as JSON for easy inspection
        mask_info = results.get('mask_info', {})
        if mask_info:
            mask_info_path = os.path.join(models_output_dir, 'mask_info.json')
            with open(mask_info_path, 'w') as f:
                json.dump(mask_info, f, indent=2)
            output_files['mask_info'] = mask_info_path

    # =========================================================================
    # Save Config to Models Directory
    # =========================================================================

    config_src = os.path.join(dirs['experiment'], 'config.json')
    if os.path.exists(config_src):
        # Add output file info to config
        config_copy = config.copy() if isinstance(config, dict) else {}
        config_copy['outputs'] = {
            'stage1_stack': output_files.get('stage1_stack', ''),
            'stage2_stack': output_files.get('stage2_stack', ''),
            'sliceCount': output_files.get('stage1_slice_count', 0)
        }

        config_dest = os.path.join(models_output_dir, 'config.json')
        with open(config_dest, 'w') as f:
            # Make config JSON serializable
            config_serializable = {}
            for k, v in config_copy.items():
                if isinstance(v, (dict, list, str, int, float, bool, type(None))):
                    config_serializable[k] = v
                else:
                    config_serializable[k] = str(v)
            json.dump(config_serializable, f, indent=4)
        output_files['config'] = config_dest

    # =========================================================================
    # Save Results JSON (Training Metrics)
    # =========================================================================

    training_results = results.get('training_results', {})
    if training_results:
        # Build results.json similar to segmentation module format
        results_json = {
            'method': method,
            'stages_run': results.get('stages_run', []),
            'mode': config.get('mode', '2d')
        }

        # Add Stage 1 metrics if present
        if 'stage1' in training_results:
            stage1_metrics = training_results['stage1']
            results_json['stage1'] = {
                'final_train_loss': stage1_metrics.get('final_train_loss'),
                'final_val_loss': stage1_metrics.get('final_val_loss'),
                'best_val_loss': stage1_metrics.get('best_val_loss'),
                'epochs_completed': stage1_metrics.get('epochs_completed'),
                'total_epochs': stage1_metrics.get('total_epochs'),
                'early_stopped': stage1_metrics.get('early_stopped', False),
                'training_time_seconds': stage1_metrics.get('training_time_seconds')
            }

        # Add Stage 2 metrics if present
        if 'stage2' in training_results:
            stage2_metrics = training_results['stage2']
            results_json['stage2'] = {
                'final_train_loss': stage2_metrics.get('final_train_loss'),
                'final_val_loss': stage2_metrics.get('final_val_loss'),
                'best_val_loss': stage2_metrics.get('best_val_loss'),
                'epochs_completed': stage2_metrics.get('epochs_completed'),
                'total_epochs': stage2_metrics.get('total_epochs'),
                'early_stopped': stage2_metrics.get('early_stopped', False),
                'training_time_seconds': stage2_metrics.get('training_time_seconds')
            }

        # Save results.json to models directory
        results_json_path = os.path.join(models_output_dir, 'results.json')
        with open(results_json_path, 'w') as f:
            json.dump(results_json, f, indent=2)
        output_files['results'] = results_json_path

        print(f"[DEBUG] Saved training results to {results_json_path}")

    # =========================================================================
    # Cleanup Intermediate Files
    # =========================================================================

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "cleaning_up"
    })

    # Delete the experiment directory (contains all intermediate files)
    experiment_dir = dirs['experiment']
    if os.path.exists(experiment_dir):
        try:
            shutil.rmtree(experiment_dir)
            print(f"[DEBUG] Deleted experiment directory: {experiment_dir}")
        except Exception as e:
            emit_progress('cleanup', {
                "training_id": training_id,
                "status": "cleanup_warning",
                "message": f"Could not fully delete experiment directory: {str(e)}"
            })

    # Delete the extracted_images directory (created during TIFF stack extraction)
    extracted_images_dir = results.get('extracted_images_dir')
    if extracted_images_dir and os.path.exists(extracted_images_dir):
        try:
            shutil.rmtree(extracted_images_dir)
            print(f"[DEBUG] Deleted extracted_images directory: {extracted_images_dir}")
        except Exception as e:
            emit_progress('cleanup', {
                "training_id": training_id,
                "status": "cleanup_warning",
                "message": f"Could not delete extracted_images directory: {str(e)}"
            })

    # =========================================================================
    # Emit Final Result
    # =========================================================================

    emit_progress('cleanup', {
        "training_id": training_id,
        "status": "complete",
        "outputFiles": output_files
    })

    return output_files
