import json
import logging

import joblib
import numpy as np
import pandas as pd

from . import config
from . import custom_layers
from .custom_layers import LuongAttention, PriceHead

log = logging.getLogger("predictor")

DEFAULT_FEATURES = ["Open", "High", "Low", "Close", "Volume",
                    "RSI", "MACD", "EMA20", "month", "day", "weekday"]

# Models saved from Colab may carry any "<package>>PriceHead" registered name
# (e.g. aapl>PriceHead or msft>PriceHead). Map all of them to the same class.
CUSTOM_OBJECTS = {}
for _pkg in ("aapl", "msft"):
    CUSTOM_OBJECTS[f"{_pkg}>PriceHead"] = PriceHead
    CUSTOM_OBJECTS[f"{_pkg}>LuongAttention"] = LuongAttention
CUSTOM_OBJECTS.update({"PriceHead": PriceHead, "LuongAttention": LuongAttention})


class Predictor:
    def __init__(self, ticker: str):
        import tensorflow as tf

        self.ticker = ticker
        p = config.paths(ticker)
        self.model = tf.keras.models.load_model(p["model"], compile=False, custom_objects=CUSTOM_OBJECTS)
        self.scaler = joblib.load(p["scaler"])

        cfg = {}
        if p["meta"].exists():
            with open(p["meta"]) as fh:
                cfg = json.load(fh)
        self.features = list(cfg.get("features") or DEFAULT_FEATURES)
        self.window = int(cfg.get("lookback", 60))
        self.bounds = cfg.get("iqr_clip_bounds") or {}      # {"Volume": [lo, hi], "High": [lo, hi]}
        if not self.bounds:
            log.warning("%s: no iqr_clip_bounds in meta.json, inputs will not be clipped", ticker)

        nf = len(self.features)
        if getattr(self.scaler, "n_features_in_", nf) != nf:
            raise RuntimeError(f"{ticker}: scaler has {self.scaler.n_features_in_} columns, features list has {nf}.")
        shapes = self.model.input_shape
        if not isinstance(shapes, (list, tuple)) or len(shapes) != 2 or tuple(shapes[0][1:]) != (self.window, nf):
            raise RuntimeError(f"{ticker}: unexpected model input shape {shapes}; expected [(None,{self.window},{nf}), (None,1)]")
        log.info("Loaded %s: window=%s features=%s", ticker, self.window, self.features)

    def predict_next(self, feat: pd.DataFrame) -> float:
        if len(feat) < self.window:
            raise RuntimeError(f"Need {self.window} rows, have {len(feat)}")
        X = feat[self.features].to_numpy(dtype="float64").copy()
        for col, (lo, hi) in self.bounds.items():
            j = self.features.index(col)
            X[:, j] = np.clip(X[:, j], lo, hi)
        Xs = self.scaler.transform(X[-self.window:])
        window = Xs[None, :, :].astype("float32")
        prev_close = np.array([[feat["Close"].iloc[-1]]], dtype="float32")
        out = self.model.predict([window, prev_close], verbose=0)
        return float(np.ravel(out)[0])
