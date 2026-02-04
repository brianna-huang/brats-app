import torch
import torch.nn.functional as F
import nibabel as nib
import numpy as np
import cv2
import os
import json
from PIL import Image

# OUR MODEL ARCHITECTURE
from model import UNet

IMG_SIZE = 128
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
METADATA_PATH = "case_metadata.json"

def load_model():
    model = UNet(in_channels=2, out_channels=4)
    model.load_state_dict(
        torch.load("models/final_model.pth", map_location=DEVICE)
    )
    model.to(DEVICE)
    model.eval()
    return model


def load_nifti(path):
    return nib.load(path).get_fdata()


def predict_single_slice(flair_slice, t1ce_slice, model):
    # Resize
    flair = cv2.resize(flair_slice, (IMG_SIZE, IMG_SIZE))
    t1ce = cv2.resize(t1ce_slice, (IMG_SIZE, IMG_SIZE))

    X = np.stack([flair, t1ce], axis=-1)
    X = X[np.newaxis, ...]

    X = X / np.max(X) if np.max(X) > 0 else X

    X_tensor = torch.FloatTensor(X).permute(0, 3, 1, 2).to(DEVICE)

    with torch.no_grad():
        pred = model(X_tensor)
        pred = F.softmax(pred, dim=1)

    return pred.cpu().numpy()[0]  # (C, H, W)


def create_overlay(prediction):
    """
    Creates an RGBA overlay where different tumor classes have different colors.
    SEGMENT_CLASSES = { 0 : 'NOT tumor', 1 : 'NECROTIC/CORE', 2 : 'EDEMA', 3 : 'ENHANCING' }
    """
    tumor_mask = np.argmax(prediction, axis=0)  # now include background as 0
    overlay = np.zeros((IMG_SIZE, IMG_SIZE, 4), dtype=np.uint8)

    # For 3 tumor classes:
    # 1 = red, 2 = green, 3 = blue
    colors = {
        1: (255, 0, 0),
        2: (0, 255, 0),
        3: (0, 0, 255)
    }

    for cls, (r, g, b) in colors.items():
        mask = tumor_mask == cls
        overlay[..., 0][mask] = r
        overlay[..., 1][mask] = g
        overlay[..., 2][mask] = b
        overlay[..., 3][mask] = 120  # alpha

    return overlay


def create_multiclass_overlay(pred):
    """
    pred shape: (4, H, W)
    """
    seg = np.argmax(pred, axis=0)

    overlay = np.zeros((IMG_SIZE, IMG_SIZE, 4), dtype=np.uint8)

    colors = {
        1: (255, 0, 0),    # NECROTIC - red
        2: (0, 255, 0),    # EDEMA - green
        3: (0, 0, 255),    # ENHANCING - blue
    }

    for cls, color in colors.items():
        mask = seg == cls
        overlay[mask, :3] = color
        overlay[mask, 3] = 120

    return overlay


def normalize_and_resize(slice_img):
    slice_img = slice_img - slice_img.min()
    if slice_img.max() > 0:
        slice_img = slice_img / slice_img.max() * 255
    slice_img = slice_img.astype(np.uint8)
    slice_img = cv2.resize(slice_img, (128, 128))  # or IMG_SIZE
    return slice_img


def nii_to_png_slices_all_views(nii_path, output_dir, modality_name):
    """
    Convert a NIfTI (.nii or .nii.gz) volume into PNG slices in all three views:
    axial (z), sagittal (x), coronal (y)
    Returns a dict:
    {
        "axial": [list of file paths],
        "sagittal": [...],
        "coronal": [...]
    }
    """
    os.makedirs(output_dir, exist_ok=True)
    img = nib.load(nii_path).get_fdata()

    views = {}

    # AXIAL (z-axis)
    axial_paths = []
    for i in range(img.shape[2]):
        slice_img = img[:, :, i]
        slice_img = normalize_and_resize(slice_img)
        filename = f"{modality_name}_axial_{i}.png"
        path = os.path.join(output_dir, filename)
        cv2.imwrite(path, slice_img)
        axial_paths.append(path)
    views["axial"] = axial_paths

    # SAGITTAL (x-axis)
    sagittal_paths = []
    for i in range(img.shape[0]):
        slice_img = img[i, :, :]
        slice_img = normalize_and_resize(slice_img)
        filename = f"{modality_name}_sagittal_{i}.png"
        path = os.path.join(output_dir, filename)
        cv2.imwrite(path, slice_img)
        sagittal_paths.append(path)
    views["sagittal"] = sagittal_paths

    # CORONAL (y-axis)
    coronal_paths = []
    for i in range(img.shape[1]):
        slice_img = img[:, i, :]
        slice_img = normalize_and_resize(slice_img)
        filename = f"{modality_name}_coronal_{i}.png"
        path = os.path.join(output_dir, filename)
        cv2.imwrite(path, slice_img)
        coronal_paths.append(path)
    views["coronal"] = coronal_paths

    return views


def load_metadata():
    if not os.path.exists(METADATA_PATH):
        return {}

    try:
        with open(METADATA_PATH, "r") as f:
            content = f.read().strip()
            if not content:
                return {}
            return json.loads(content)
    except (json.JSONDecodeError, IOError):
        return {}


def save_metadata(data):
    with open(METADATA_PATH, "w") as f:
        json.dump(data, f, indent=2)


# def logits_to_probabilities(logits):
#     """
#     logits: torch.Tensor [C, H, W] or [1, C, H, W]
#     returns: probs [C, H, W]
#     """
#     if logits.dim() == 4:
#         logits = logits.squeeze(0)

#     probs = F.softmax(logits, dim=0)
#     return probs

# def probabilities_to_segmentation(probs):
#     """
#     probs: [C, H, W]
#     returns: [H, W] int mask
#     """
#     seg = torch.argmax(probs, dim=0)
#     return seg

# def probabilities_to_confidence(probs):
#     """
#     probs: [C, H, W]
#     returns: [H, W] confidence in [0, 1]
#     """
#     confidence, _ = torch.max(probs, dim=0)
#     return confidence

# def segmentation_to_rgba(seg):
#     """
#     seg: [H, W] int
#     returns: [H, W, 4] uint8 RGBA
#     """
#     h, w = seg.shape
#     rgba = np.zeros((h, w, 4), dtype=np.uint8)

#     # Example: tumor = class 1
#     rgba[seg == 1] = [255, 0, 0, 255]  # red

#     return rgba

# def confidence_to_rgba(conf):
#     """
#     conf: [H, W] float in [0, 1]
#     returns: [H, W, 4] uint8 RGBA
#     """
#     conf = conf.cpu().numpy()
#     conf = (conf * 255).astype(np.uint8)

#     rgba = np.zeros((conf.shape[0], conf.shape[1], 4), dtype=np.uint8)
#     rgba[..., 0] = conf          # red channel
#     rgba[..., 3] = conf          # alpha tied to confidence

#     return rgba

# def build_overlay_slices(volume, overlay_volume):
#     """
#     volume: [D, H, W] (used only for slicing consistency)
#     overlay_volume: [D, H, W, 4]
#     """
#     return {
#         "axial":    [overlay_volume[i] for i in range(volume.shape[0])],
#         "coronal":  [overlay_volume[:, i, :] for i in range(volume.shape[1])],
#         "sagittal": [overlay_volume[:, :, i] for i in range(volume.shape[2])]
#     }
