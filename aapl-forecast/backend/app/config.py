import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = Path(os.getenv("ARTIFACT_DIR", BASE_DIR / "artifacts"))

# One folder per ticker: artifacts/<TICKER>/{model.keras, x_scaler.pkl, shap_results.npz, lime_results.npz}
# To add a new stock later: add it here and drop its 4 files in artifacts/<TICKER>/.
TICKERS = {
    "AAPL": "Apple",
    "MSFT": "Microsoft",
}
DEFAULT_TICKER = os.getenv("DEFAULT_TICKER", "AAPL")


def paths(ticker: str) -> dict:
    d = ARTIFACT_DIR / ticker
    return {
        "model": d / "model.keras",
        "scaler": d / "x_scaler.pkl",
        "meta": d / "meta.json",      # optional: {"features": [...], "lookback": 60, "iqr_clip_bounds": {...}}
        "shap": d / "shap_results.npz",
        "lime": d / "lime_results.npz",
    }


DATA_START = "2020-01-01"   # same start as training (EMA/RSI/MACD are recursive)
WARMUP = 30                 # rows dropped while indicators warm up (same as training)

DATA_CACHE_SECONDS = int(os.getenv("DATA_CACHE_SECONDS", "900"))
HISTORY_DAYS = int(os.getenv("HISTORY_DAYS", "90"))
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
