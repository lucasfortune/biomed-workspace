#!/usr/bin/env python3
"""
Generate 3D surface meshes from segmented TIFF stacks.

Uses marching cubes algorithm to extract isosurfaces from segmentation data.
Outputs meshes in multiple formats: Three.js JSON, OBJ, and STL.

Usage:
    python generate_mesh.py --input <tiff_path> --output_dir <dir> --mesh_id <id> --formats json,obj,stl [--classes 1,2,3]

Output Protocol:
    MESH_PROGRESS:{"class": 1, "total_classes": 3, "progress_percent": 33, "status": "processing"}
    MESH_RESULT:{"success": true, "output_dir": "...", "formats": [...], "statistics": {...}}
"""

import sys
import os
import json
import argparse
import numpy as np
import tifffile
from datetime import datetime

# Marching cubes from scikit-image
try:
    from skimage import measure
except ImportError:
    print("MESH_RESULT:" + json.dumps({
        "success": False,
        "error": "scikit-image not installed. Run: pip install scikit-image"
    }))
    sys.exit(1)


def emit_progress(class_num, total_classes, status="processing"):
    """Emit progress update to stdout for Socket.IO."""
    progress = {
        "class": class_num,
        "total_classes": total_classes,
        "progress_percent": round((class_num / total_classes) * 100) if total_classes > 0 else 0,
        "status": status
    }
    print(f"MESH_PROGRESS:{json.dumps(progress)}", flush=True)


def emit_result(success, **kwargs):
    """Emit final result to stdout."""
    result = {"success": success, **kwargs}
    print(f"MESH_RESULT:{json.dumps(result)}", flush=True)


def load_segmentation(input_path):
    """
    Load segmentation TIFF stack.

    Returns:
        tuple: (data array, unique classes excluding background)
    """
    print(f"Loading segmentation from: {input_path}", flush=True)
    data = tifffile.imread(input_path)

    # Ensure 3D
    if len(data.shape) == 2:
        data = data[np.newaxis, :, :]

    # Find unique classes (excluding 0 which is typically background)
    unique_values = np.unique(data)
    classes = [int(v) for v in unique_values if v > 0]

    print(f"Data shape: {data.shape}", flush=True)
    print(f"Found classes: {classes}", flush=True)

    return data, classes


def generate_mesh_for_class(data, class_id, spacing=(1.0, 1.0, 1.0)):
    """
    Generate mesh for a single class using marching cubes.

    Args:
        data: 3D numpy array of segmentation
        class_id: Class ID to extract
        spacing: Voxel spacing (z, y, x)

    Returns:
        tuple: (vertices, faces, normals) or None if no voxels found
    """
    # Create binary mask for this class
    mask = (data == class_id).astype(np.float32)

    # Check if there are any voxels
    if not mask.any():
        return None

    # Apply slight smoothing for better mesh quality (optional)
    # Could use scipy.ndimage.gaussian_filter here

    try:
        # Run marching cubes
        # level=0.5 for binary mask
        verts, faces, normals, values = measure.marching_cubes(
            mask,
            level=0.5,
            spacing=spacing,
            step_size=1,
            allow_degenerate=False
        )

        return verts, faces, normals

    except Exception as e:
        print(f"Warning: Marching cubes failed for class {class_id}: {e}", flush=True)
        return None


def compute_vertex_normals(vertices, faces):
    """
    Compute smooth vertex normals from face normals.

    Args:
        vertices: Nx3 array of vertex positions
        faces: Mx3 array of face indices

    Returns:
        Nx3 array of vertex normals
    """
    # Initialize vertex normals
    vertex_normals = np.zeros_like(vertices)

    # Compute face normals and accumulate to vertices
    for face in faces:
        v0, v1, v2 = vertices[face[0]], vertices[face[1]], vertices[face[2]]
        edge1 = v1 - v0
        edge2 = v2 - v0
        face_normal = np.cross(edge1, edge2)

        # Add face normal to each vertex of the face
        for idx in face:
            vertex_normals[idx] += face_normal

    # Normalize
    norms = np.linalg.norm(vertex_normals, axis=1, keepdims=True)
    norms[norms == 0] = 1  # Avoid division by zero
    vertex_normals = vertex_normals / norms

    return vertex_normals


def export_threejs_json(meshes, output_path, mesh_id):
    """
    Export meshes to Three.js BufferGeometry JSON format.

    Args:
        meshes: dict of class_id -> (vertices, faces, normals)
        output_path: Path to output JSON file
        mesh_id: Mesh ID for metadata
    """
    export_data = {
        "metadata": {
            "version": "1.0",
            "type": "BufferGeometry",
            "generator": "viz_app mesh generator",
            "mesh_id": mesh_id,
            "timestamp": datetime.now().isoformat()
        },
        "meshes": {}
    }

    for class_id, (verts, faces, normals) in meshes.items():
        # Flatten arrays for Three.js
        # Three.js expects: positions as flat array [x,y,z,x,y,z,...]
        # indices as flat array [i,j,k,i,j,k,...]

        export_data["meshes"][str(class_id)] = {
            "class_id": class_id,
            "attributes": {
                "position": {
                    "itemSize": 3,
                    "type": "Float32Array",
                    "array": verts.flatten().tolist()
                },
                "normal": {
                    "itemSize": 3,
                    "type": "Float32Array",
                    "array": normals.flatten().tolist()
                }
            },
            "index": {
                "type": "Uint32Array",
                "array": faces.flatten().tolist()
            },
            "statistics": {
                "vertices": len(verts),
                "faces": len(faces)
            }
        }

    with open(output_path, 'w') as f:
        json.dump(export_data, f)

    return output_path


def export_obj(meshes, output_path):
    """
    Export meshes to Wavefront OBJ format.

    Args:
        meshes: dict of class_id -> (vertices, faces, normals)
        output_path: Path to output OBJ file
    """
    mtl_path = output_path.replace('.obj', '.mtl')
    mtl_name = os.path.basename(mtl_path)

    # Predefined colors for different classes
    class_colors = {
        1: (0.8, 0.2, 0.2),   # Red
        2: (0.2, 0.8, 0.2),   # Green
        3: (0.2, 0.2, 0.8),   # Blue
        4: (0.8, 0.8, 0.2),   # Yellow
        5: (0.8, 0.2, 0.8),   # Magenta
        6: (0.2, 0.8, 0.8),   # Cyan
        7: (0.8, 0.5, 0.2),   # Orange
        8: (0.5, 0.2, 0.8),   # Purple
    }

    # Write MTL file
    with open(mtl_path, 'w') as f:
        f.write("# Material file for mesh\n")
        for class_id in meshes.keys():
            color = class_colors.get(class_id, (0.7, 0.7, 0.7))
            f.write(f"\nnewmtl class_{class_id}\n")
            f.write(f"Kd {color[0]:.3f} {color[1]:.3f} {color[2]:.3f}\n")
            f.write("Ka 0.1 0.1 0.1\n")
            f.write("Ks 0.3 0.3 0.3\n")
            f.write("Ns 50.0\n")
            f.write("d 1.0\n")

    # Write OBJ file
    with open(output_path, 'w') as f:
        f.write("# OBJ file generated by viz_app mesh generator\n")
        f.write(f"mtllib {mtl_name}\n\n")

        vertex_offset = 0
        normal_offset = 0

        for class_id, (verts, faces, normals) in meshes.items():
            f.write(f"# Class {class_id}\n")
            f.write(f"o class_{class_id}\n")
            f.write(f"usemtl class_{class_id}\n")

            # Write vertices
            for v in verts:
                f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")

            # Write normals
            for n in normals:
                f.write(f"vn {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n")

            # Write faces (OBJ uses 1-based indexing)
            for face in faces:
                v1 = face[0] + 1 + vertex_offset
                v2 = face[1] + 1 + vertex_offset
                v3 = face[2] + 1 + vertex_offset
                n1 = face[0] + 1 + normal_offset
                n2 = face[1] + 1 + normal_offset
                n3 = face[2] + 1 + normal_offset
                f.write(f"f {v1}//{n1} {v2}//{n2} {v3}//{n3}\n")

            vertex_offset += len(verts)
            normal_offset += len(normals)
            f.write("\n")

    return output_path


def export_stl(meshes, output_path):
    """
    Export meshes to binary STL format.

    Args:
        meshes: dict of class_id -> (vertices, faces, normals)
        output_path: Path to output STL file
    """
    # Count total triangles
    total_triangles = sum(len(faces) for _, (_, faces, _) in meshes.items())

    with open(output_path, 'wb') as f:
        # Header (80 bytes)
        header = b'Binary STL generated by viz_app mesh generator'
        header = header.ljust(80, b'\0')
        f.write(header)

        # Number of triangles (4 bytes, uint32)
        f.write(np.uint32(total_triangles).tobytes())

        # Write triangles
        for class_id, (verts, faces, normals) in meshes.items():
            for face in faces:
                # Compute face normal
                v0, v1, v2 = verts[face[0]], verts[face[1]], verts[face[2]]
                edge1 = v1 - v0
                edge2 = v2 - v0
                face_normal = np.cross(edge1, edge2)
                norm = np.linalg.norm(face_normal)
                if norm > 0:
                    face_normal = face_normal / norm

                # Normal (12 bytes, 3 x float32)
                f.write(np.float32(face_normal).tobytes())

                # Vertices (36 bytes, 9 x float32)
                f.write(np.float32(v0).tobytes())
                f.write(np.float32(v1).tobytes())
                f.write(np.float32(v2).tobytes())

                # Attribute byte count (2 bytes, uint16) - can encode class ID
                f.write(np.uint16(class_id).tobytes())

    return output_path


def export_metadata(meshes, output_path, mesh_id, input_path, data_shape, formats):
    """
    Export mesh metadata as JSON.

    Args:
        meshes: dict of class_id -> (vertices, faces, normals)
        output_path: Path to output metadata file
        mesh_id: Mesh ID
        input_path: Source file path
        data_shape: Shape of source data
        formats: List of exported formats
    """
    # Calculate statistics
    total_vertices = 0
    total_faces = 0
    class_stats = {}

    for class_id, (verts, faces, _) in meshes.items():
        class_stats[str(class_id)] = {
            "vertices": len(verts),
            "faces": len(faces)
        }
        total_vertices += len(verts)
        total_faces += len(faces)

    metadata = {
        "mesh_id": mesh_id,
        "source_file": os.path.basename(input_path),
        "source_dimensions": list(data_shape),
        "generated_at": datetime.now().isoformat(),
        "formats_exported": formats,
        "statistics": {
            "total_vertices": total_vertices,
            "total_faces": total_faces,
            "classes_processed": len(meshes),
            "per_class": class_stats
        }
    }

    with open(output_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    return metadata


def main():
    parser = argparse.ArgumentParser(description='Generate 3D meshes from segmented TIFF stacks')
    parser.add_argument('--input', required=True, help='Path to input TIFF file')
    parser.add_argument('--output_dir', required=True, help='Output directory for mesh files')
    parser.add_argument('--mesh_id', required=True, help='Unique mesh ID')
    parser.add_argument('--formats', default='json,obj', help='Output formats (comma-separated: json,obj,stl)')
    parser.add_argument('--classes', default=None, help='Classes to process (comma-separated, or "all")')
    parser.add_argument('--spacing', default='1,1,1', help='Voxel spacing z,y,x')

    args = parser.parse_args()

    try:
        # Parse formats
        formats = [f.strip().lower() for f in args.formats.split(',')]
        valid_formats = {'json', 'obj', 'stl'}
        formats = [f for f in formats if f in valid_formats]

        if not formats:
            emit_result(False, error="No valid output formats specified")
            return

        # Parse spacing
        spacing = tuple(float(s) for s in args.spacing.split(','))

        # Create output directory
        os.makedirs(args.output_dir, exist_ok=True)

        # Load data
        data, available_classes = load_segmentation(args.input)

        # Determine which classes to process
        if args.classes and args.classes != 'all':
            target_classes = [int(c) for c in args.classes.split(',')]
            # Filter to only available classes
            target_classes = [c for c in target_classes if c in available_classes]
        else:
            target_classes = available_classes

        if not target_classes:
            emit_result(False, error="No classes found in segmentation data")
            return

        print(f"Processing classes: {target_classes}", flush=True)

        # Generate meshes for each class
        meshes = {}
        total_classes = len(target_classes)

        for i, class_id in enumerate(target_classes):
            emit_progress(i + 1, total_classes, f"Processing class {class_id}")

            result = generate_mesh_for_class(data, class_id, spacing)

            if result is not None:
                verts, faces, normals = result

                # Compute smooth vertex normals if needed
                if normals is None or len(normals) != len(verts):
                    normals = compute_vertex_normals(verts, faces)

                meshes[class_id] = (verts, faces, normals)
                print(f"Class {class_id}: {len(verts)} vertices, {len(faces)} faces", flush=True)
            else:
                print(f"Class {class_id}: No mesh generated (empty or error)", flush=True)

        if not meshes:
            emit_result(False, error="No meshes could be generated from the data")
            return

        # Export in requested formats
        exported_formats = []

        if 'json' in formats:
            json_path = os.path.join(args.output_dir, 'mesh_data.json')
            export_threejs_json(meshes, json_path, args.mesh_id)
            exported_formats.append('json')
            print(f"Exported: {json_path}", flush=True)

        if 'obj' in formats:
            obj_path = os.path.join(args.output_dir, 'mesh.obj')
            export_obj(meshes, obj_path)
            exported_formats.append('obj')
            print(f"Exported: {obj_path}", flush=True)

        if 'stl' in formats:
            stl_path = os.path.join(args.output_dir, 'mesh.stl')
            export_stl(meshes, stl_path)
            exported_formats.append('stl')
            print(f"Exported: {stl_path}", flush=True)

        # Export metadata
        metadata_path = os.path.join(args.output_dir, 'metadata.json')
        metadata = export_metadata(
            meshes, metadata_path, args.mesh_id,
            args.input, data.shape, exported_formats
        )

        # Calculate total statistics
        total_vertices = sum(len(v) for v, _, _ in meshes.values())
        total_faces = sum(len(f) for _, f, _ in meshes.values())

        # Emit success result
        emit_result(
            True,
            output_dir=args.output_dir,
            formats=exported_formats,
            statistics={
                "totalVertices": total_vertices,
                "totalFaces": total_faces,
                "classesProcessed": len(meshes)
            }
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        emit_result(False, error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
