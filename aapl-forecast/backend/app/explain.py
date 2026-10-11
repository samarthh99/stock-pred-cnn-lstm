import logging
from functools import lru_cache

import numpy as np

from . import config

log = logging.getLogger("explain")


def _cube(a: np.ndarray, window: int, nf: int):
    """Try to view an array as (samples, window, features)."""
    if a.ndim >= 2 and a.shape[-2:] == (window, nf):
        return a.reshape(-1, window, nf)
    if a.shape and a.shape[-1] == window * nf:
        return a.reshape(-1, window, nf)
    return None


def _summarise(path, window: int, features: list) -> dict:
    if not path.exists():
        return {"available": False, "arrays": {}}
    nf = len(features)
    out = {"available": True, "arrays": {}, "feature_importance": None, "timestep_importance": None}
    z = np.load(path, allow_pickle=True)
    for key in z.files:
        a = z[key]
        out["arrays"][key] = {"shape": list(a.shape), "dtype": str(a.dtype)}
        if a.dtype.kind not in "fiu" or a.size == 0:
            continue
        a = np.abs(a.astype("float64"))
        cube = _cube(a, window, nf)
        if cube is not None and out["timestep_importance"] is None:
            out["timestep_importance"] = {"source": key, "values": cube.mean(axis=(0, 2)).round(6).tolist()}
            out["feature_importance"] = {
                "source": key,
                "values": dict(zip(features, cube.mean(axis=(0, 1)).round(6).tolist())),
            }
        elif a.ndim == 1 and a.size == nf and out["feature_importance"] is None:
            out["feature_importance"] = {"source": key, "values": dict(zip(features, a.round(6).tolist()))}
    return out


@lru_cache(maxsize=1)
def get_explanations(window: int, features: tuple) -> dict:
    feats = list(features)
    return {
        "window": window,
        "features": feats,
        "shap": _summarise(config.SHAP_PATH, window, feats),
        "lime": _summarise(config.LIME_PATH, window, feats),
    }
