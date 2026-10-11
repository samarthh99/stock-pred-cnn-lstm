import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import config, data, explain
from .predictor import Predictor

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("api")

state: dict = {"predictor": None, "pred_cache": {}}


@asynccontextmanager
async def lifespan(app: FastAPI):
    state["predictor"] = Predictor()
    yield


app = FastAPI(title="AAPL next-day close API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"service": "aapl-forecast-api", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    p = state["predictor"]
    return {"status": "ok" if p else "loading", "window": getattr(p, "window", None)}


@app.get("/api/predict")
def predict():
    p: Predictor = state["predictor"]
    if p is None:
        raise HTTPException(503, "Model is still loading")
    try:
        df = data.completed_bars(data.get_daily())
    except Exception as exc:
        log.exception("data error")
        raise HTTPException(502, f"Could not fetch market data: {exc}")

    last_date = df.index[-1].date()
    key = str(last_date)
    if key not in state["pred_cache"]:
        try:
            state["pred_cache"] = {key: p.predict_next(df)}
        except Exception as exc:
            log.exception("prediction error")
            raise HTTPException(500, f"Prediction failed: {exc}")
    predicted = state["pred_cache"][key]

    last_close = float(df[config.TARGET].iloc[-1])
    tail = df[config.TARGET].tail(config.HISTORY_DAYS)
    return {
        "ticker": config.TICKER,
        "as_of": key,
        "target_date": str(data.next_trading_day(last_date)),
        "last_close": round(last_close, 2),
        "predicted_close": round(predicted, 2),
        "change": round(predicted - last_close, 2),
        "change_pct": round((predicted - last_close) / last_close * 100, 2),
        "window": p.window,
        "features": p.features,
        "history": [{"date": d.strftime("%Y-%m-%d"), "close": round(float(v), 2)} for d, v in tail.items()],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/explain")
def explanations():
    p: Predictor = state["predictor"]
    if p is None:
        raise HTTPException(503, "Model is still loading")
    return explain.get_explanations(p.window, tuple(p.features))
