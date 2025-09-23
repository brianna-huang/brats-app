# BRaTS Tumor Segmentation App

**Work in Progress**
I’m building a full-stack web app using **React (Vite)** on the frontend and **Flask (Python)** on the backend.

---

## Project Overview
The goal of this app is to allow users to upload FLAIR and T1CE brain MRI images, and run an AI model on them that predict where possible tumors are, along with their tumor classes. It should overlay a color segment that highlights the tumor to see its location and shape. 

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
