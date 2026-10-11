import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = Path(os.getenv("ARTIFACT_DIR", BASE_DIR / "artifacts"))

MODEL_PATH = ARTIFACT_DIR / "aapl_cnn_lstm_model.keras"
SCALER_PATH = ARTIFACT_DIR / "scaler.pkl"
SHAP_PATH = ARTIFACT_DIR / "shap_results.npz"
LIME_PATH = ARTIFACT_DIR / "lime_results.npz"

TICKER = os.getenv("TICKER", "AAPL")

# Columns fed to the model, IN THE SAME ORDER used when the scaler was fitted.
# Close-only model -> "Close".  Multi-feature -> e.g. "Open,High,Low,Close,Volume"
FEATURES = [f.strip() for f in os.getenv("FEATURES", "Close").split(",") if f.strip()]
TARGET = os.getenv("TARGET", "Close")  # which feature the model predicts

DATA_CACHE_SECONDS = int(os.getenv("DATA_CACHE_SECONDS", "900"))
HISTORY_DAYS = int(os.getenv("HISTORY_DAYS", "90"))
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
