#!/usr/bin/env python3
"""
File format conversion for the file browser's "Convert to..." action
(module roadmap item 4; see ADR-008 header).

Supported conversions (detected from the input/output extensions):
    .tif/.tiff -> .mrc   (voxel size written to the MRC header when known)
    .mrc       -> .tif   (voxel size read from the MRC header)
    .obj       -> .stl / .ply / .glb

stdout protocol:
    CONVERT_RESULT:{...}
    CONVERT_ERROR:{"message": ...}

The OBJ parser understands the mesh generator's output (v / vn lines,
f v//n faces, one object per class) plus the common v and v/t/n face
forms; polygons are fan-triangulated.
"""

import argparse
import json
import os
import struct
import sys

import numpy as np

ANGSTROM_PER_UNIT = {"um": 1e4, "nm": 10.0, "mm": 1e7, "px": 0.0}


def emit(prefix, payload):
    print(f"{prefix}:{json.dumps(payload)}", flush=True)


def fail(message):
    emit("CONVERT_ERROR", {"message": str(message)})
    sys.exit(1)


# =============================================================================
# Image conversions
# =============================================================================

def tif_to_mrc(input_path, output_path, voxel_size=None):
    import tifffile
    import mrcfile

    data = tifffile.imread(input_path)
    if data.ndim == 2:
        data = data[np.newaxis, ...]

    # Map to MRC-supported modes losslessly
    if data.dtype == np.uint8 or data.dtype == np.uint16:
        data = data.astype(np.uint16)   # mode 6
    elif data.dtype == np.int8 or data.dtype == np.int16:
        data = data.astype(np.int16)    # mode 1
    else:
        data = data.astype(np.float32)  # mode 2

    with mrcfile.new(output_path, overwrite=True) as mrc:
        mrc.set_data(data)
        if voxel_size and voxel_size.get("x"):
            scale = ANGSTROM_PER_UNIT.get(voxel_size.get("unit") or "um", 0.0)
            if scale > 0:
                z = voxel_size.get("z") or voxel_size["x"]
                mrc.voxel_size = (voxel_size["x"] * scale,
                                  voxel_size["y"] * scale,
                                  z * scale)
        mrc.update_header_stats()

    return {"slices": int(data.shape[0]), "dtype": str(data.dtype)}


def mrc_to_tif(input_path, output_path):
    import tifffile
    import mrcfile

    with mrcfile.open(input_path, permissive=True) as mrc:
        data = np.asarray(mrc.data)
        if data.ndim == 2:
            data = data[np.newaxis, ...]
        vs = mrc.voxel_size

    bigtiff = data.nbytes > 2**31 - 2**16
    tifffile.imwrite(output_path, data, bigtiff=bigtiff)

    result = {"slices": int(data.shape[0]), "dtype": str(data.dtype)}
    # MRC voxel sizes are in Angstrom; report in nm (or um when large)
    try:
        x = float(vs.x)
        if x > 0:
            y, z = float(vs.y), float(vs.z)
            if x / 10.0 >= 1000.0:
                unit, div = "um", 1e4
            else:
                unit, div = "nm", 10.0
            result["voxelSize"] = {
                "x": round(x / div, 6), "y": round(y / div, 6),
                "z": round(z / div, 6) if z > 0 else None, "unit": unit
            }
    except Exception:
        pass
    return result


# =============================================================================
# Mesh conversions
# =============================================================================

def parse_obj(input_path):
    """Return (vertices Nx3 f32, normals Nx3 f32 per-vertex, faces Mx3 i32)."""
    verts = []
    norms = []
    faces = []
    vert_normal_idx = {}

    with open(input_path) as fh:
        for line in fh:
            parts = line.split()
            if not parts:
                continue
            if parts[0] == "v":
                verts.append([float(parts[1]), float(parts[2]), float(parts[3])])
            elif parts[0] == "vn":
                norms.append([float(parts[1]), float(parts[2]), float(parts[3])])
            elif parts[0] == "f":
                idx = []
                for token in parts[1:]:
                    fields = token.split("/")
                    vi = int(fields[0])
                    vi = vi - 1 if vi > 0 else len(verts) + vi
                    idx.append(vi)
                    if len(fields) == 3 and fields[2]:
                        ni = int(fields[2])
                        vert_normal_idx[vi] = ni - 1 if ni > 0 else len(norms) + ni
                for k in range(1, len(idx) - 1):  # fan triangulation
                    faces.append([idx[0], idx[k], idx[k + 1]])

    vertices = np.asarray(verts, dtype=np.float32)
    face_arr = np.asarray(faces, dtype=np.int32)
    if not len(vertices) or not len(face_arr):
        raise ValueError("OBJ contains no triangle geometry")

    # Per-vertex normals: from vn indices when present, else area-weighted
    normals = np.zeros_like(vertices)
    if norms and len(vert_normal_idx) == len(vertices):
        src = np.asarray(norms, dtype=np.float32)
        for vi, ni in vert_normal_idx.items():
            normals[vi] = src[ni]
    else:
        v0 = vertices[face_arr[:, 0]]
        v1 = vertices[face_arr[:, 1]]
        v2 = vertices[face_arr[:, 2]]
        fn = np.cross(v1 - v0, v2 - v0)
        for i in range(3):
            np.add.at(normals, face_arr[:, i], fn)
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    lengths[lengths == 0] = 1.0
    normals = (normals / lengths).astype(np.float32)

    return vertices, normals, face_arr


def write_stl(vertices, normals, faces, output_path):
    with open(output_path, "wb") as f:
        f.write(b"Binary STL converted by viz_app".ljust(80, b"\0"))
        f.write(np.uint32(len(faces)).tobytes())
        v0 = vertices[faces[:, 0]]
        v1 = vertices[faces[:, 1]]
        v2 = vertices[faces[:, 2]]
        fn = np.cross(v1 - v0, v2 - v0)
        lengths = np.linalg.norm(fn, axis=1, keepdims=True)
        lengths[lengths == 0] = 1.0
        fn = (fn / lengths).astype(np.float32)
        for i in range(len(faces)):
            f.write(fn[i].tobytes())
            f.write(np.float32(v0[i]).tobytes())
            f.write(np.float32(v1[i]).tobytes())
            f.write(np.float32(v2[i]).tobytes())
            f.write(struct.pack("<H", 0))


def write_ply(vertices, normals, faces, output_path):
    with open(output_path, "wb") as f:
        header = (
            "ply\n"
            "format binary_little_endian 1.0\n"
            "comment converted by viz_app\n"
            f"element vertex {len(vertices)}\n"
            "property float x\nproperty float y\nproperty float z\n"
            "property float nx\nproperty float ny\nproperty float nz\n"
            f"element face {len(faces)}\n"
            "property list uchar int vertex_indices\n"
            "end_header\n"
        )
        f.write(header.encode("ascii"))
        interleaved = np.hstack([vertices, normals]).astype("<f4")
        f.write(interleaved.tobytes())
        for face in faces:
            f.write(struct.pack("<B3i", 3, int(face[0]), int(face[1]), int(face[2])))


def write_glb(vertices, normals, faces, output_path):
    """Minimal valid glTF 2.0 binary: positions + normals + u32 indices."""
    indices = faces.astype("<u4").ravel()
    pos = vertices.astype("<f4")
    nrm = normals.astype("<f4")

    def pad4(b, char=b"\0"):
        return b + char * ((4 - len(b) % 4) % 4)

    idx_bytes = pad4(indices.tobytes())
    pos_bytes = pad4(pos.tobytes())
    nrm_bytes = pad4(nrm.tobytes())
    bin_chunk = idx_bytes + pos_bytes + nrm_bytes

    gltf = {
        "asset": {"version": "2.0", "generator": "viz_app converter"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{
            "attributes": {"POSITION": 1, "NORMAL": 2},
            "indices": 0, "mode": 4
        }]}],
        "buffers": [{"byteLength": len(bin_chunk)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(idx_bytes), "target": 34963},
            {"buffer": 0, "byteOffset": len(idx_bytes), "byteLength": len(pos_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(idx_bytes) + len(pos_bytes), "byteLength": len(nrm_bytes), "target": 34962},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5125, "count": int(indices.size), "type": "SCALAR"},
            {"bufferView": 1, "componentType": 5126, "count": int(len(pos)), "type": "VEC3",
             "min": [float(v) for v in pos.min(axis=0)],
             "max": [float(v) for v in pos.max(axis=0)]},
            {"bufferView": 2, "componentType": 5126, "count": int(len(nrm)), "type": "VEC3"},
        ],
    }
    json_chunk = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")

    with open(output_path, "wb") as f:
        total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
        f.write(struct.pack("<III", 0x46546C67, 2, total))          # glTF header
        f.write(struct.pack("<II", len(json_chunk), 0x4E4F534A))    # JSON chunk
        f.write(json_chunk)
        f.write(struct.pack("<II", len(bin_chunk), 0x004E4942))     # BIN chunk
        f.write(bin_chunk)


def convert_mesh(input_path, output_path, target):
    vertices, normals, faces = parse_obj(input_path)
    if target == "stl":
        write_stl(vertices, normals, faces, output_path)
    elif target == "ply":
        write_ply(vertices, normals, faces, output_path)
    elif target == "glb":
        write_glb(vertices, normals, faces, output_path)
    else:
        raise ValueError(f"Unsupported mesh target: {target}")
    return {"vertices": int(len(vertices)), "triangles": int(len(faces))}


# =============================================================================
# main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="File format conversion")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--voxel-size", help="Voxel size JSON for tif->mrc")
    args = parser.parse_args()

    src = os.path.splitext(args.input)[1].lower().lstrip(".")
    dst = os.path.splitext(args.output)[1].lower().lstrip(".")
    src = "tif" if src == "tiff" else src

    try:
        if src == "tif" and dst == "mrc":
            voxel_size = json.loads(args.voxel_size) if args.voxel_size else None
            extra = tif_to_mrc(args.input, args.output, voxel_size)
        elif src == "mrc" and dst in ("tif", "tiff"):
            extra = mrc_to_tif(args.input, args.output)
        elif src == "obj" and dst in ("stl", "ply", "glb"):
            extra = convert_mesh(args.input, args.output, dst)
        else:
            raise ValueError(f"Unsupported conversion: .{src} -> .{dst}")

        emit("CONVERT_RESULT", {
            "output_path": args.output,
            "size": os.path.getsize(args.output),
            **extra
        })
    except Exception as e:
        fail(e)


if __name__ == "__main__":
    main()
