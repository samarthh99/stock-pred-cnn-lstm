// After deploying the backend on Render, put its URL here (no trailing slash).
window.APP_CONFIG = {
  API_BASE:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:8000"
      : "https://stock-pred-cnn-lstm.onrender.com",
};
