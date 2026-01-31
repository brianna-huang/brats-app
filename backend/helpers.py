import os
import io
import torch
import h5py
import numpy as np
import nibabel as nib
import cv2
import matplotlib.pyplot as plt
from flask import send_file

IMG_SIZE = 128  # adjust to your model input size

def load_h5_volume(h5_path: str):
    """Load 3D volume from HDF5 (.h5) file"""
    with h5py.File(h5_path, "r") as f:
        dataset_name = list(f.keys())[0]
        volume = np.array(f[dataset_name])
    return volume  # shape: (H, W, D)

def load_nii_volume(nii_path: str):
    """Load 3D volume from NIfTI (.nii) file"""
    volume = nib.load(nii_path).get_fdata()
    return np.array(volume)

def get_slice(flair_path, t1ce_path, slice_idx=0):
    """
    Load a single slice from FLAIR and T1CE volumes (supports .h5 or .nii)
    Returns a numpy array of shape (H, W, 2)
    """
    # Load volumes
    if flair_path.endswith(".h5"):
        flair_vol = load_h5_volume(flair_path)
    else:
        flair_vol = load_nii_volume(flair_path)

    if t1ce_path.endswith(".h5"):
        t1ce_vol = load_h5_volume(t1ce_path)
    else:
        t1ce_vol = load_nii_volume(t1ce_path)

    # Extract slice
    flair_slice = cv2.resize(flair_vol[:, :, slice_idx], (IMG_SIZE, IMG_SIZE)).astype("float32")
    t1ce_slice = cv2.resize(t1ce_vol[:, :, slice_idx], (IMG_SIZE, IMG_SIZE)).astype("float32")

    # Stack as channels
    slice_input = np.stack([flair_slice, t1ce_slice], axis=-1)

    # Normalize
    max_val = np.max(slice_input)
    if max_val > 0:
        slice_input = slice_input / max_val

    return slice_input  # shape: (H, W, 2)

def slice_to_tensor(slice_input, device="cpu"):
    """Convert (H, W, 2) slice to PyTorch tensor (1, 2, H, W)"""
    tensor = torch.FloatTensor(slice_input).permute(2, 0, 1).unsqueeze(0)
    return tensor.to(device)

def predict_slice_overlay(flair_path, t1ce_path, model, device="cpu", slice_idx=0):
    """
    Run model on a single slice and return an overlay PNG
    """
    slice_input = get_slice(flair_path, t1ce_path, slice_idx)
    tensor = slice_to_tensor(slice_input, device)

    model.eval()
    with torch.no_grad():
        pred = model(tensor)
        pred = torch.softmax(pred, dim=1)  # multi-class
        pred_np = pred.cpu().permute(0, 2, 3, 1).numpy()[0]  # (H, W, C)

    # Sum over all tumor classes (assumes class 0 = background)
    tumor_mask = np.sum(pred_np[:, :, 1:], axis=-1)

    # Convert mask to PNG overlay
    plt.figure(figsize=(4, 4))
    plt.imshow(tumor_mask, cmap="Reds", alpha=0.5)
    plt.axis("off")
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight", pad_inches=0)
    buf.seek(0)
    plt.close()

    return buf
