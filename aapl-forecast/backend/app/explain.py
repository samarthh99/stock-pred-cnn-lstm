"""Turns shap_results.npz / lime_results.npz (as saved by the Colab script) into chart-ready JSON."""
import logging
from functools import lru_cache

import numpy as np

from . import config

log = logging.getLogger("explain")


def _share(v):
    v = np.asarray(v, dtype=float)
    t = v.sum()
    return (100.0 * v / t) if t > 0 else v * 0.0


def _pack(labels, values, rank=True):
    values = np.asarray(values, dtype=float)
    idx = np.argsort(values)[::-1] if rank else np.arange(len(values))
    labels = [str(labels[i]) for i in idx]
    values = values[idx]
    return {"labels": labels, "mean_abs": values.round(6).tolist(), "share_pct": _share(values).round(2).tolist()}


@lru_cache(maxsize=8)
def get_explanations(ticker: str) -> dict:
    p = config.paths(ticker)
    out = {"shap": {"available": False}, "lime": {"available": False}}

    if p["shap"].exists():
        z = np.load(p["shap"], allow_pickle=False)
        sv = np.abs(z["shap_values"].astype(float))                 # (windows, features)
        names = [str(n) for n in z["feature_names"]]
        out["shap"] = {
            "available": True,
            "n_windows": int(sv.shape[0]),
            "feature_importance": _pack(names, sv.mean(axis=0)),
        }

    if p["lime"].exists():
        z = np.load(p["lime"], allow_pickle=False)
        w = z["lime_weights"].astype(float)                         # (windows, blocks, features)
        names = [str(n) for n in z["feature_names"]]
        blocks = [str(b) for b in z["block_labels"]]
        out["lime"] = {
            "available": True,
            "n_windows": int(w.shape[0]),
            "local_r2": round(float(np.mean(z["lime_local_r2"])), 3),
            "feature_importance": _pack(names, np.abs(w.sum(axis=1)).mean(axis=0)),
            "time_block_importance": _pack(blocks, np.abs(w).sum(axis=2).mean(axis=0), rank=False),
        }
    return out
