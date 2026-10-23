# Multi-ticker update (AAPL + MSFT)

Artifacts layout (one folder per ticker, same 4 file names):

    backend/artifacts/AAPL/{model.keras, x_scaler.pkl, shap_results.npz, lime_results.npz}
    backend/artifacts/MSFT/{model.keras, x_scaler.pkl, shap_results.npz, lime_results.npz}

New API:  GET /api/tickers   GET /api/predict?ticker=MSFT   GET /api/explain?ticker=MSFT   GET /health
Add another stock later: add it to TICKERS in backend/app/config.py and drop its 4 files in artifacts/<TICKER>/.
