# Brain Tumor Segmentation App

## Project Overview
The Brain Tumor Segmentation App allows users to upload FLAIR and T1CE brain MRIs for tumor detection. It uses an AI model to predict where possible tumors are, overlaying a color segment that highlights the different tumor classes to see their location and shape. The main viewer page allows users to upload .nii files and scroll through slices of any view (axial, sagittal, coronal).

The app can be used as a teaching & learning aid, allowing radiologists and medical students to practice reading X-rays with AI guidance.

## Demo

<video width="600" controls>
  <source src="brats-demo.mp4" type="video/mp4">
</video>

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
