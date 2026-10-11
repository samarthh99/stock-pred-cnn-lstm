import json
import logging

import joblib
import numpy as np
import pandas as pd

from . import config
from . import custom_layers  # noqa: F401  (registers PriceHead / LuongAttention)

log = logging.getLogger("predictor")


class Predictor:
    def __init__(self):
        import tensorflow as tf

        self.model = tf.keras.models.load_model(config.MODEL_PATH, compile=False)
        self.scaler = joblib.load(config.SCALER_PATH)
        with open(config.CONFIG_PATH) as fh:
            cfg = json.load(fh)

        default_features = ["Open", "High", "Low", "Close", "Volume",
                           "RSI", "MACD", "EMA20", "month", "day", "weekday"]
        self.features = list(cfg.get("features") or default_features)
        self.window = int(cfg.get("lookback", 60))
        self.bounds = cfg.get("iqr_clip_bounds") or {}
        if not self.bounds:
            log.warning("config.json has no iqr_clip_bounds: High/Volume will not be clipped")   # {"Volume": [lo, hi], "High": [lo, hi]}

        nf = len(self.features)
        if getattr(self.scaler, "n_features_in_", nf) != nf:
            raise RuntimeError(f"Scaler has {self.scaler.n_features_in_} columns, config lists {nf}.")
        shapes = self.model.input_shape
        if not isinstance(shapes, (list, tuple)) or len(shapes) != 2 or tuple(shapes[0][1:]) != (self.window, nf):
            raise RuntimeError(f"Unexpected model input shape {shapes}; expected [(None,{self.window},{nf}), (None,1)]")
        log.info("Loaded model: window=%s features=%s", self.window, self.features)

    def predict_next(self, feat: pd.DataFrame) -> float:
        if len(feat) < self.window:
            raise RuntimeError(f"Need {self.window} rows, have {len(feat)}")
        X = feat[self.features].to_numpy(dtype="float64").copy()
        for col, (lo, hi) in self.bounds.items():       # IQR clipping used in training
            j = self.features.index(col)
            X[:, j] = np.clip(X[:, j], lo, hi)
        Xs = self.scaler.transform(X[-self.window:])
        window = Xs[None, :, :].astype("float32")                        # (1, 60, F)
        prev_close = np.array([[feat["Close"].iloc[-1]]], dtype="float32")  # raw last close
        out = self.model.predict([window, prev_close], verbose=0)
        return float(np.ravel(out)[0])                                  # already a price in USD
