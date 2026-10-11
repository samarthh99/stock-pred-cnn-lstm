import logging
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import config, data, explain
from .predictor import Predictor

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("api")

state: dict = {"predictor": None, "error": None, "pred_cache": {}}


def _load():
    try:
        state["predictor"] = Predictor()
    except Exception as exc:
        log.exception("model load failed")
        state["error"] = f"{type(exc).__name__}: {exc}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_load, daemon=True).start()   # port opens immediately; errors show at /health
    yield


app = FastAPI(title="AAPL next-day close API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])


def _ready() -> Predictor:
    p = state["predictor"]
    if p is None:
        raise HTTPException(503, state["error"] or "Model is still loading")
    return p


@app.get("/")
def root():
    return {"service": "aapl-forecast-api", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    if state["error"]:
        return {"status": "error", "detail": state["error"]}
    p = state["predictor"]
    return {"status": "ok" if p else "loading", "window": getattr(p, "window", None)}


@app.get("/api/predict")
def predict(as_of: Optional[str] = None):
    """as_of=YYYY-MM-DD is for verification: forecast as if that day were the latest close."""
    p = _ready()
    try:
        raw = data.completed_bars(data.get_daily())
        if as_of:
            raw = raw[raw.index <= pd.Timestamp(as_of)]
            if raw.empty:
                raise ValueError("as_of is before the data starts")
    except Exception as exc:
        log.exception("data error")
        raise HTTPException(502, f"Could not fetch market data: {exc}")

    feat = data.build_features(raw)
    last_date = feat.index[-1].date()
    key = str(last_date)
    if key not in state["pred_cache"]:
        try:
            state["pred_cache"][key] = p.predict_next(feat)
            if len(state["pred_cache"]) > 50:
                state["pred_cache"].pop(next(iter(state["pred_cache"])))
        except Exception as exc:
            log.exception("prediction error")
            raise HTTPException(500, f"Prediction failed: {exc}")
    predicted = state["pred_cache"][key]

    last_close = float(raw["Close"].iloc[-1])
    tail = raw["Close"].tail(config.HISTORY_DAYS)
    return {
        "ticker": config.TICKER,
        "as_of": key,
        "target_date": str(data.next_trading_day(last_date)),
        "last_close": round(last_close, 2),
        "predicted_close": round(predicted, 2),
        "change": round(predicted - last_close, 2),
        "change_pct": round((predicted - last_close) / last_close * 100, 2),
        "window": p.window,
        "history": [{"date": d.strftime("%Y-%m-%d"), "close": round(float(v), 2)} for d, v in tail.items()],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/explain")
def explanations():
    _ready()
    try:
        return explain.get_explanations()
    except Exception as exc:
        log.exception("explain error")
        raise HTTPException(500, f"Could not read explanation files: {exc}")
