"""Run from the backend/ folder:  python scripts/check_artifacts.py
Verifies the model, scaler and npz files load and prints what the API will use."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from app import config
from app.predictor import Predictor

for p in (config.MODEL_PATH, config.SCALER_PATH, config.SHAP_PATH, config.LIME_PATH):
    print(("OK      " if p.exists() else "MISSING ") + str(p))

pred = Predictor()
print("\nmodel input window :", pred.window)
print("model n_features   :", pred.n_features)
print("FEATURES used      :", pred.features, "| target:", config.TARGET)
print("scaler             :", type(pred.scaler).__name__)

for name, path in (("SHAP", config.SHAP_PATH), ("LIME", config.LIME_PATH)):
    if path.exists():
        z = np.load(path, allow_pickle=True)
        print(f"\n{name} keys:")
        for k in z.files:
            print(f"  {k}: shape={z[k].shape} dtype={z[k].dtype}")
