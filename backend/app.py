from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import nibabel as nib
import numpy as np
import matplotlib.pyplot as plt
import shutil
from werkzeug.utils import safe_join

from helpers import predict_single_slice, load_model, create_overlay, nii_to_png_slices, create_multiclass_overlay

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
    case_id = f"case_{len(cases) + 1}"
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

    # Convert NIfTI -> PNG slices in png_dir
    flair_slices = nii_to_png_slices(flair_path, png_dir, "flair")
    t1ce_slices = nii_to_png_slices(t1ce_path, png_dir, "t1ce")

    cases[case_id] = {
        "id": case_id,
        "name": case_id,
        "folder": case_folder,
        "flair_slices": [
            f"{BACKEND_URL}/uploads/{os.path.basename(case_folder)}/png/{os.path.basename(p)}"
            for p in flair_slices
        ],
        "t1ce_slices": [
            f"{BACKEND_URL}/uploads/{os.path.basename(case_folder)}/png/{os.path.basename(p)}"
            for p in t1ce_slices
        ],
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
    return jsonify(list(cases.values()))

@app.route("/api/cases/<case_id>", methods=["DELETE"])
def delete_case(case_id):
    case = cases.get(case_id)
    if not case:
        return {"error": "Case not found"}, 404

    case_folder = os.path.join(UPLOAD_DIR, f"case_{case_id}")
    if os.path.exists(case_folder):
        shutil.rmtree(case_folder)

    del cases[case_id]
    return {"message": "Case deleted"}

@app.route("/api/detect", methods=["POST"])
def detect():
    case_id = request.json["caseId"] # ex: case_1
    slice_index = request.json.get("sliceIndex")

    case_dir = os.path.join(UPLOAD_DIR, case_id)
    if not os.path.exists(case_dir):
        return jsonify({"error": "Case not found"}), 404

    flair_file = next(f for f in os.listdir(case_dir) if "flair" in f.lower())
    t1ce_file = next(f for f in os.listdir(case_dir) if "t1ce" in f.lower())

    flair_vol = nib.load(os.path.join(case_dir, flair_file)).get_fdata()
    t1ce_vol = nib.load(os.path.join(case_dir, t1ce_file)).get_fdata()

    z = slice_index if slice_index is not None else flair_vol.shape[2] // 2

    pred = predict_single_slice(
        flair_vol[:, :, z],
        t1ce_vol[:, :, z],
        model
    )

    overlay = create_multiclass_overlay(pred)

    # Save overlay PNG
    out_dir = os.path.join(OVERLAY_DIR, case_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"slice_{z}.png")
    plt.imsave(out_path, overlay)

    # Return overlay URL for this specific slice
    return jsonify({
        "overlayUrl": f"/api/overlay/{case_id}/slice_{z}.png"
    })

@app.route("/api/overlay/<case_id>/<slice_file>")
def get_overlay(case_id, slice_file):
    """
    Serve a specific overlay PNG
    slice_file must include the '.png' extension
    """
    file_path = os.path.join(OVERLAY_DIR, case_id, slice_file)
    if not os.path.exists(file_path):
        return "Overlay not found", 404
    return send_file(file_path, mimetype="image/png")

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)