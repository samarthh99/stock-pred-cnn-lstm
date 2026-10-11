# AAPL next-day close forecast

CNN-LSTM model (with SHAP and LIME results) served by a FastAPI backend on Render,
with a static frontend on Vercel.

```
aapl-forecast/
├── README.md
├── render.yaml                  # optional Render blueprint
├── .gitignore
├── backend/                     # Render "Root Directory" = backend
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py            # paths + env settings
│   │   ├── data.py              # Yahoo Finance data, market-day logic
│   │   ├── predictor.py         # loads model + scaler, predicts, inverse-scales
│   │   ├── explain.py           # reads shap_results.npz / lime_results.npz
│   │   └── main.py              # FastAPI app: /health /api/predict /api/explain
│   ├── artifacts/               # YOU add these 4 files
│   │   ├── aapl_cnn_lstm_model.keras
│   │   ├── scaler.pkl
│   │   ├── shap_results.npz
│   │   └── lime_results.npz
│   └── scripts/check_artifacts.py
└── frontend/                    # Vercel "Root Directory" = frontend
    ├── index.html
    ├── style.css
    ├── app.js
    ├── config.js                # put your Render URL here
    └── vercel.json
```

## 0. Match versions with Colab (most common failure)
In Colab: `import tensorflow as tf, sklearn, numpy; print(tf.__version__, sklearn.__version__, numpy.__version__)`
and put the same versions in `backend/requirements.txt`. Use Python 3.11 locally.
Set `FEATURES` (env var) to the exact columns and order used when you fitted `scaler.pkl`
(default `Close`; for five inputs: `Open,High,Low,Close,Volume`).

## 1. Run the backend locally
```
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/check_artifacts.py
uvicorn app.main:app --reload --port 8000
```
Open http://localhost:8000/api/predict and http://localhost:8000/docs

## 2. Run the frontend locally
```
cd frontend
python -m http.server 5500
```
Open http://localhost:5500 (config.js auto-uses http://localhost:8000).
Local CORS: the default `CORS_ORIGINS=*` allows it.

## 3. Push to GitHub
```
git init && git add . && git commit -m "AAPL forecast site"
git branch -M main
git remote add origin https://github.com/<you>/aapl-forecast.git
git push -u origin main
```

## 4. Deploy backend on Render
New > Web Service > connect repo, then:
- Root Directory: `backend`
- Runtime: Python 3
- Build Command: `pip install --upgrade pip && pip install -r requirements.txt`
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health Check Path: `/health`
- Environment: `PYTHON_VERSION=3.11.9`, `FEATURES=Close`, `TF_CPP_MIN_LOG_LEVEL=2`,
  `TF_ENABLE_ONEDNN_OPTS=0`, `CORS_ORIGINS=*` (tighten after step 6)
Copy the service URL, e.g. `https://aapl-forecast-api.onrender.com`.

## 5. Deploy frontend on Vercel
- Edit `frontend/config.js`, replace `YOUR-RENDER-SERVICE` with your Render URL, commit and push.
- Vercel > Add New Project > import repo.
- Framework Preset: Other. Root Directory: `frontend`. Build Command and Output Directory: leave empty.
- Deploy.

## 6. Lock CORS
In Render set `CORS_ORIGINS=https://<your-app>.vercel.app` (comma-separate extra domains) and redeploy.

## Notes
- Render free plan sleeps after ~15 min idle (first request takes up to a minute) and has 512 MB RAM;
  TensorFlow can exceed that. If the service restarts or is killed, use the Starter plan.
- The latest bar is dropped while the US market is open, so the forecast is always for the next
  trading day after the last completed close.
- Holidays use a built-in NYSE calendar; unscheduled closures are not handled.
