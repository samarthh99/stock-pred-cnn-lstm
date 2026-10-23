"""Run from the backend/ folder:  python scripts/check_artifacts.py
Verifies every ticker's model, scaler and npz files load, and prints what the API will use."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from app import config
from app.predictor import Predictor

for t in config.TICKERS:
    print(f"\n=========== {t}")
    p = config.paths(t)
    for k in ("model", "scaler", "shap", "lime"):
        print(("OK      " if p[k].exists() else "MISSING ") + str(p[k]))
    pred = Predictor(t)
    print("window   :", pred.window)
    print("features :", pred.features)
    print("scaler   :", type(pred.scaler).__name__, "n_features_in_ =", getattr(pred.scaler, "n_features_in_", "?"))
    print("clip     :", pred.bounds or "none")
    for name in ("shap", "lime"):
        if p[name].exists():
            z = np.load(p[name], allow_pickle=True)
            print(f"{name.upper()} keys:", {k: tuple(z[k].shape) for k in z.files})
