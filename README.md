# Brain Tumor Segmentation App

**Work in Progress**

---

## Project Overview
The Brain Tumor Segmentation App allows users to upload FLAIR and T1CE brain MRI images for tumor detection. It uses an AI model to predict where possible tumors are, overlaying a color segment that highlights the different tumor classes to see their location and shape. The main viewer page allows users to scroll through slices of any view (axial, sagittal, coronal).

The app can be used as a teaching & learning aid, allowing radiologists and medical students to practice reading X-rays with AI guidance.

Main image viewer example:
<img width="1440" height="900" alt="Screenshot 2026-02-03 at 7 45 01 PM" src="https://github.com/user-attachments/assets/99e1ccf2-f6b9-4a50-af20-3c8780c69fc3" />

---

## Tech Stack
- **Frontend:** React + TypeScript + Vite
- **Backend:** Flask (Python 3.x)
- **Environment:** venv for Python, npm for Node

---

## Setup (In Progress)
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

Run flask server 
```
export FLASK_APP=app.py
flask run
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
