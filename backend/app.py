from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import nibabel as nib
import numpy as np
import matplotlib.pyplot as plt
import shutil
from werkzeug.utils import safe_join
import matplotlib.cm as cm
import uuid

from helpers import (predict_single_slice, load_model, 
                     nii_to_png_slices_all_views,
                     create_multiclass_overlay, load_metadata, 
                     save_metadata)

app = Flask(__name__)
CORS(app)

BACKEND_URL = "http://localhost:5050"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
OVERLAY_DIR = os.path.abspath("overlays")

for d in [UPLOAD_DIR, OVERLAY_DIR]:
    os.makedirs(d, exist_ok=True)

# Load model ONCE
model = load_model()

cases = {}

@app.route("/api/upload", methods=["POST"])
def upload_files():
    """
    Expecting exactly 2 .nii files per case: flair and t1ce
    Upload files and converts all slices to png
    """
    files = request.files.getlist("files")
    if len(files) != 2:
        return jsonify({"error": "Please upload exactly 2 files: FLAIR and T1CE"}), 400

    # Create a unique case folder
    case_id = case_id = f"case_{uuid.uuid4().hex[:8]}"
    case_folder = os.path.join(UPLOAD_DIR, case_id)
    os.makedirs(case_folder, exist_ok=True)

    png_dir = os.path.join(case_folder, "png")
    os.makedirs(png_dir, exist_ok=True)

    flair_path = t1ce_path = None

    for f in files:
        filename = f.filename
        save_path = os.path.join(case_folder, filename)
        f.save(save_path)

        if "flair" in filename.lower():
            flair_path = save_path
        elif "t1ce" in filename.lower():
            t1ce_path = save_path

    if not flair_path or not t1ce_path:
        return jsonify({"error": "Files must include flair and t1ce"}), 400

    flair_views = nii_to_png_slices_all_views(flair_path, png_dir, "flair")
    t1ce_views = nii_to_png_slices_all_views(t1ce_path, png_dir, "t1ce")

    metadata = load_metadata()

    cases[case_id] = {
        "id": case_id,
        "name": metadata.get(case_id, {}).get("name", case_id),
        "folder": case_folder,
        "flair_slices": {
            "axial": [f"{BACKEND_URL}/uploads/{case_id}/png/{os.path.basename(p)}" for p in flair_views["axial"]],
            "sagittal": [f"{BACKEND_URL}/uploads/{case_id}/png/{os.path.basename(p)}" for p in flair_views["sagittal"]],
            "coronal": [f"{BACKEND_URL}/uploads/{case_id}/png/{os.path.basename(p)}" for p in flair_views["coronal"]],
        },
        "t1ce_slices": {
            "axial": [f"{BACKEND_URL}/uploads/{case_id}/png/{os.path.basename(p)}" for p in t1ce_views["axial"]],
            "sagittal": [f"{BACKEND_URL}/uploads/{case_id}/png/{os.path.basename(p)}" for p in t1ce_views["sagittal"]],
            "coronal": [f"{BACKEND_URL}/uploads/{case_id}/png/{os.path.basename(p)}" for p in t1ce_views["coronal"]],
        },
    }

    return jsonify({"message": "Files uploaded", "case": cases[case_id]})

@app.route("/uploads/<case_folder>/png/<filename>")
def serve_png(case_folder, filename):
    """
    Serves PNG slices for a given case.
    """
    folder_path = os.path.join(UPLOAD_DIR, case_folder, "png")
    safe_path = safe_join(folder_path, filename)
    if not os.path.exists(safe_path):
        return "File not found", 404
    return send_file(safe_path, mimetype="image/png")

@app.route("/api/cases")
def get_cases():
    metadata = load_metadata()

    result = []
    for case_id, case in cases.items():
        result.append({
            "id": case_id,
            "folder": case["folder"],
            "name": metadata.get(case_id, {}).get("name", case_id),
            "flair_slices": case["flair_slices"],
            "t1ce_slices": case["t1ce_slices"],
        })

    return jsonify(result)

@app.route("/api/cases/<case_id>", methods=["DELETE"])
def delete_case(case_id):
    case_dir = os.path.join(UPLOAD_DIR, case_id)
    overlay_dir = os.path.join(OVERLAY_DIR, case_id)

    if os.path.exists(case_dir):
        shutil.rmtree(case_dir)

    if os.path.exists(overlay_dir):
        shutil.rmtree(overlay_dir)

    metadata = load_metadata()

    if case_id in cases:
        del cases[case_id]

    if case_id in metadata:
        del metadata[case_id]
        save_metadata(metadata)

    return jsonify({"status": "ok"})

@app.route("/api/cases/<case_id>/rename", methods=["POST"])
def rename_case(case_id):
    new_name = request.json.get("name")
    if not new_name:
        return {"error": "Missing name"}, 400

    metadata = load_metadata()
    metadata.setdefault(case_id, {})
    metadata[case_id]["name"] = new_name
    save_metadata(metadata)

    return {"status": "ok"}

@app.route("/api/detect", methods=["POST"])
def detect():
    case_id = request.json["caseId"]

    case_dir = os.path.join(UPLOAD_DIR, case_id)
    flair_file = next(f for f in os.listdir(case_dir) if "flair" in f.lower())
    t1ce_file = next(f for f in os.listdir(case_dir) if "t1ce" in f.lower())

    flair_vol = nib.load(os.path.join(case_dir, flair_file)).get_fdata()
    t1ce_vol = nib.load(os.path.join(case_dir, t1ce_file)).get_fdata()

    out_base = os.path.join(OVERLAY_DIR, case_id)
    os.makedirs(out_base, exist_ok=True)

    segmentation = {"axial": [], "sagittal": [], "coronal": []}
    confidence = {"axial": [], "sagittal": [], "coronal": []}

    for view in ["axial", "sagittal", "coronal"]:
        os.makedirs(os.path.join(out_base, view), exist_ok=True)

        if view == "axial":
            indices = range(flair_vol.shape[2])
            get_slice = lambda i: (flair_vol[:, :, i], t1ce_vol[:, :, i])
        elif view == "sagittal":
            indices = range(flair_vol.shape[0])
            get_slice = lambda i: (np.rot90(flair_vol[i,:,:]), np.rot90(t1ce_vol[i,:,:]))
        else:
            indices = range(flair_vol.shape[1])
            get_slice = lambda i: (np.rot90(flair_vol[:,i,:]), np.rot90(t1ce_vol[:,i,:]))

        for i in indices:
            flair_slice, t1ce_slice = get_slice(i)
            pred = predict_single_slice(flair_slice, t1ce_slice, model)

            # --- Segmentation overlay ---
            seg_overlay = create_multiclass_overlay(pred)

            # --- CConfidence overlay (only on tumor) ---
            tumor_mask = np.argmax(pred, axis=0) > 0  # True for any tumor class
            conf = np.max(pred[1:], axis=0)           # only take tumor class probabilities
            
            conf_overlay = np.zeros((*conf.shape, 4), dtype=np.uint8)
            # conf_overlay[..., 0] = (conf * 255).astype(np.uint8)   # red
            # conf_overlay[..., 3] = (conf * 255 * tumor_mask).astype(np.uint8)  # alpha only on tumor
            conf_overlay[..., 0] = tumor_mask * 255  # red channel
            conf_overlay[..., 1] = tumor_mask * (conf * 255).astype(np.uint8)  # green channel
            conf_overlay[..., 2] = tumor_mask * (conf * 255).astype(np.uint8)  # blue channel
            conf_overlay[..., 3] = tumor_mask * (conf * 255).astype(np.uint8)  # alpha

            if view in ["sagittal", "coronal"]:
                conf_overlay = np.rot90(conf_overlay, k=-1)
                seg_overlay = np.rot90(seg_overlay, k=-1)

            # --- Save PNGs ---
            seg_path = os.path.join(out_base, view, f"seg_{i}.png")
            conf_path = os.path.join(out_base, view, f"conf_{i}.png")

            plt.imsave(seg_path, seg_overlay)
            plt.imsave(conf_path, conf_overlay)

            segmentation[view].append(f"/api/overlay/{case_id}/{view}/seg_{i}.png")
            confidence[view].append(f"/api/overlay/{case_id}/{view}/conf_{i}.png")

    return jsonify({
        "segmentation_slices": segmentation,
        "confidence_slices": confidence,
        "legend": {
            "segmentation": {
                "1": "Necrotic / Core",
                "2": "Edema",
                "3": "Enhancing"
            },
            "confidence": "Red → Yellow → White indicates increasing AI certainty (only where tumor exists)"
        }
    })

@app.route("/api/overlay/<case_id>/<view>/<slice_file>")
def get_overlay(case_id, view, slice_file):
    file_path = os.path.join(OVERLAY_DIR, case_id, view, slice_file)
    if not os.path.exists(file_path):
        return "Overlay not found", 404
    return send_file(file_path, mimetype="image/png")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)