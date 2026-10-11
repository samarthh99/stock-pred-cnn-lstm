import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = Path(os.getenv("ARTIFACT_DIR", BASE_DIR / "artifacts"))

MODEL_PATH = ARTIFACT_DIR / "aapl_cnn_lstm_model.keras"
SCALER_PATH = ARTIFACT_DIR / "x_scaler.pkl"       # saved by your Colab script
CONFIG_PATH = ARTIFACT_DIR / "config.json"        # lookback, features, IQR clip bounds
SHAP_PATH = ARTIFACT_DIR / "shap_results.npz"
LIME_PATH = ARTIFACT_DIR / "lime_results.npz"

TICKER = os.getenv("TICKER", "AAPL")
DATA_START = "2020-01-01"   # same start as training (EMA/RSI/MACD are recursive)
WARMUP = 30                 # rows dropped while indicators warm up (same as training)

DATA_CACHE_SECONDS = int(os.getenv("DATA_CACHE_SECONDS", "900"))
HISTORY_DAYS = int(os.getenv("HISTORY_DAYS", "90"))
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
