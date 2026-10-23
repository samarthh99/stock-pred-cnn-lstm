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

# predictors: ticker -> Predictor ; errors: ticker -> message ; pred_cache: (ticker, date) -> price
state: dict = {"predictors": {}, "errors": {}, "pred_cache": {}}


def _load_all():
    for t in config.TICKERS:
        try:
            state["predictors"][t] = Predictor(t)
        except Exception as exc:
            log.exception("model load failed for %s", t)
            state["errors"][t] = f"{type(exc).__name__}: {exc}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_load_all, daemon=True).start()   # port opens immediately; errors show at /health
    yield


app = FastAPI(title="Stock next-day close API", version="3.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])


def _norm(ticker: Optional[str]) -> str:
    t = (ticker or config.DEFAULT_TICKER).upper()
    if t not in config.TICKERS:
        raise HTTPException(404, f"Unsupported ticker '{t}'. Available: {', '.join(config.TICKERS)}")
    return t


def _ready(t: str) -> Predictor:
    p = state["predictors"].get(t)
    if p is None:
        raise HTTPException(503, state["errors"].get(t) or "Model is still loading")
    return p


@app.get("/")
def root():
    return {"service": "stock-forecast-api", "docs": "/docs", "health": "/health", "tickers": "/api/tickers"}


@app.get("/health")
def health():
    status = {}
    for t in config.TICKERS:
        if t in state["errors"]:
            status[t] = {"status": "error", "detail": state["errors"][t]}
        elif t in state["predictors"]:
            status[t] = {"status": "ok", "window": state["predictors"][t].window}
        else:
            status[t] = {"status": "loading"}
    overall = "ok" if all(v["status"] == "ok" for v in status.values()) else (
        "error" if any(v["status"] == "error" for v in status.values()) else "loading")
    return {"status": overall, "tickers": status}


@app.get("/api/tickers")
def tickers():
    return {"default": config.DEFAULT_TICKER,
            "tickers": [{"symbol": s, "name": n} for s, n in config.TICKERS.items()]}


@app.get("/api/predict")
def predict(ticker: Optional[str] = None, as_of: Optional[str] = None):
    """ticker=AAPL|MSFT. as_of=YYYY-MM-DD is for verification: forecast as if that day were the latest close."""
    t = _norm(ticker)
    p = _ready(t)
    try:
        raw = data.completed_bars(data.get_daily(t))
        if as_of:
            raw = raw[raw.index <= pd.Timestamp(as_of)]
            if raw.empty:
                raise ValueError("as_of is before the data starts")
    except Exception as exc:
        log.exception("data error")
        raise HTTPException(502, f"Could not fetch market data: {exc}")

    feat = data.build_features(raw)
    last_date = feat.index[-1].date()
    key = (t, str(last_date))
    if key not in state["pred_cache"]:
        try:
            state["pred_cache"][key] = p.predict_next(feat)
            if len(state["pred_cache"]) > 100:
                state["pred_cache"].pop(next(iter(state["pred_cache"])))
        except Exception as exc:
            log.exception("prediction error")
            raise HTTPException(500, f"Prediction failed: {exc}")
    predicted = state["pred_cache"][key]

    last_close = float(raw["Close"].iloc[-1])
    tail = raw["Close"].tail(config.HISTORY_DAYS)
    return {
        "ticker": t,
        "name": config.TICKERS[t],
        "as_of": str(last_date),
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
def explanations(ticker: Optional[str] = None):
    t = _norm(ticker)
    _ready(t)
    try:
        return explain.get_explanations(t)
    except Exception as exc:
        log.exception("explain error")
        raise HTTPException(500, f"Could not read explanation files: {exc}")
