import logging

import joblib
import numpy as np
import pandas as pd

from . import config

log = logging.getLogger("predictor")


class Predictor:
    def __init__(self):
        import tensorflow as tf  # imported here so startup errors are readable

        self.model = tf.keras.models.load_model(config.MODEL_PATH, compile=False)
        self.scaler = joblib.load(config.SCALER_PATH)

        shape = self.model.input_shape  # (None, window, n_features)
        self.window = int(shape[1])
        self.n_features = int(shape[2])
        self.features = config.FEATURES

        if len(self.features) != self.n_features:
            raise RuntimeError(
                f"Model expects {self.n_features} feature(s) but FEATURES={self.features}. "
                "Set the FEATURES env var to the exact columns/order used in training."
            )
        n_scaler = getattr(self.scaler, "n_features_in_", self.n_features)
        if n_scaler != self.n_features:
            raise RuntimeError(f"Scaler was fitted on {n_scaler} columns, model expects {self.n_features}.")
        if config.TARGET not in self.features:
            raise RuntimeError(f"TARGET={config.TARGET} is not in FEATURES={self.features}")
        self.target_idx = self.features.index(config.TARGET)
        log.info("Loaded model window=%s features=%s", self.window, self.features)

    def predict_next(self, df: pd.DataFrame) -> float:
        if len(df) < self.window:
            raise RuntimeError(f"Need {self.window} rows, have {len(df)}")
        raw = df[self.features].to_numpy(dtype="float64")[-self.window:]
        scaled = self.scaler.transform(raw)
        x = scaled.reshape(1, self.window, self.n_features).astype("float32")
        y = float(np.ravel(self.model.predict(x, verbose=0))[0])

        # inverse-transform only the target column
        row = np.zeros((1, self.n_features))
        row[0, self.target_idx] = y
        return float(self.scaler.inverse_transform(row)[0, self.target_idx])
