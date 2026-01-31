from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask import send_from_directory
import torch
import os
import pandas as pd
from helpers import predict_slice_overlay

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

MODEL_PATH = os.path.join("models", "final_model.pth")
model = torch.load(MODEL_PATH, map_location="cpu")
model.eval()

@app.route("/api/upload", methods=["POST"])
def upload_files():
    if "files" not in request.files:
        return jsonify({"error": "No files uploaded"}), 400
    
    uploaded_files = request.files.getlist("files")

    saved_files = []
    for file in uploaded_files:
        filename = file.filename
        save_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(save_path)
        saved_files.append(filename)

    return jsonify({"message": "Files uploaded successfully!", "files": saved_files})

@app.route("/api/uploads/<filename>")
def get_uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route("/api/delete/<filename>", methods=["DELETE"])
def delete_file(filename):
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return jsonify({"message": "File deleted"})
    return jsonify({"error": "File not found"}), 404

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"})

@app.route("/")
def index():
    return jsonify({
        "message": "Flask backend is running",
        "endpoints": [
            "/api/health",
            "/api/upload",
            "/api/uploads/<filename>"
        ]
    })

@app.route("/api/predict", methods=["POST"])
def predict():
    # Expect two files: FLAIR and T1CE
    if "flair" not in request.files or "t1ce" not in request.files:
        return {"error": "Missing files"}, 400

    flair_file = request.files["flair"]
    t1ce_file = request.files["t1ce"]

    # Save temporarily
    flair_path = os.path.join(UPLOAD_FOLDER, flair_file.filename)
    t1ce_path = os.path.join(UPLOAD_FOLDER, t1ce_file.filename)
    flair_file.save(flair_path)
    t1ce_file.save(t1ce_path)

    # Optionally allow client to specify slice index
    slice_idx = int(request.form.get("slice", 0))

    # Predict overlay
    overlay_buf = predict_slice_overlay(flair_path, t1ce_path, model, device="cpu", slice_idx=slice_idx)

    return send_file(overlay_buf, mimetype="image/png")

if __name__ == "__main__":
    app.run(debug=True, port=5000)