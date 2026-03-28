# Brain Tumor Segmentation App

## Project Overview
The Brain Tumor Segmentation App allows users to upload FLAIR and T1CE brain MRIs for tumor detection. It uses an AI model to predict where possible tumors are, overlaying a color segment that highlights the different tumor classes to see their location and shape. The main viewer page allows users to upload .nii files and scroll through slices of any view (axial, sagittal, coronal).

The app can be used as a teaching & learning aid, allowing radiologists and medical students to practice reading X-rays with AI guidance.

Main image viewer example:

<img width="1440" height="900" alt="Screenshot 2026-02-05 at 8 55 50 PM" src="https://github.com/user-attachments/assets/4919d68d-c7a9-4173-ace3-8c5e83ef7bf9" />

---

## Tech Stack
- **Frontend:** React + TypeScript + Vite
- **Backend:** Flask (Python 3.x)
- **Environment:** venv for Python, npm for Node

---

## Setup
### Backend (Flask)
Make venv
```
python -m venv venv
source venv/bin/activate
```

Install requirements
```
pip install -r requirements.txt
```

Run server 
```
python app.py
```

### Frontend
Install with
```
npm i
```

Then run the development server:

```
npm run dev
```
