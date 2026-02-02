import torch
import torch.nn.functional as F
import nibabel as nib
import numpy as np
import cv2
import os

IMG_SIZE = 128
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 🔹 OUR MODEL ARCHITECTURE
from model import UNet

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

# def create_overlay(prediction):
    # """
    # Creates an overlay where all tumor classes are same color
    # """
#     tumor_mask = np.argmax(prediction, axis=0)
#     overlay = np.zeros((IMG_SIZE, IMG_SIZE, 4), dtype=np.uint8)
#     mask = tumor_mask > 0  # any tumor
#     overlay[..., 0][mask] = 255  # red
#     overlay[..., 3][mask] = 120  # alpha
#     return overlay

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


def nii_to_png_slices(nii_path, output_dir, modality_name):
    """
    Convert a NIfTI (.nii or .nii.gz) volume into individual PNG slices.
    Returns a list of PNG file paths.
    """
    os.makedirs(output_dir, exist_ok=True)

    img = nib.load(nii_path).get_fdata()
    num_slices = img.shape[2]

    slice_paths = []

    for i in range(num_slices):
        slice_img = img[:, :, i]
        # normalize to 0-255
        slice_img = slice_img - slice_img.min()
        if slice_img.max() > 0:
            slice_img = slice_img / slice_img.max() * 255
        slice_img = slice_img.astype(np.uint8)

        # resize to OUTPUT_SIZE
        slice_img = cv2.resize(slice_img, (IMG_SIZE, IMG_SIZE))

        filename = f"{modality_name}_slice_{i}.png"
        path = os.path.join(output_dir, filename)
        cv2.imwrite(path, slice_img)
        slice_paths.append(path)

    return slice_paths