(() => {
  const API = window.APP_CONFIG.API_BASE;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const fmtDate = (iso) =>
    new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });

  let current = null;          // selected ticker symbol
  let tickers = [];            // [{symbol, name}]
  let priceChart = null;       // Chart instances, destroyed on every ticker switch
  let explainCharts = [];
  let token = 0;               // ignores responses from a ticker the user already switched away from

  async function getJSON(path, onSlow) {
    const ctrl = new AbortController();
    const abort = setTimeout(() => ctrl.abort(), 120000);
    const slow = setTimeout(() => onSlow && onSlow(), 5000);
    try {
      const res = await fetch(API + path, { signal: ctrl.signal });
      if (!res.ok) {
        let msg = res.statusText;
        try { msg = (await res.json()).detail || msg; } catch (_) {}
        throw new Error(msg);
      }
      return await res.json();
    } finally {
      clearTimeout(abort); clearTimeout(slow);
    }
  }

  function renderTabs() {
    const nav = $("ticker-tabs");
    nav.innerHTML = "";
    tickers.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab" + (t.symbol === current ? " active" : "");
      b.textContent = t.symbol;
      b.title = t.name;
      b.setAttribute("aria-pressed", String(t.symbol === current));
      b.addEventListener("click", () => select(t.symbol));
      nav.appendChild(b);
    });
  }

  function resetView() {
    if (priceChart) { priceChart.destroy(); priceChart = null; }
    explainCharts.forEach((c) => c.destroy());
    explainCharts = [];
    $("explain-grid").innerHTML = "";
    $("explain-note").textContent = "";
    $("price").textContent = "--";
    $("delta").textContent = "";
    $("delta").className = "delta";
    $("meta").textContent = "";
    $("status").className = "status";
    $("status").textContent = "Loading forecast…";
    $("target-label").textContent = "Forecast closing price";
  }

  function renderPrediction(d) {
    document.title = `${d.ticker} next-day close forecast`;
    $("target-label").textContent = `${d.ticker} forecast close for ${fmtDate(d.target_date)}`;
    $("price").textContent = usd.format(d.predicted_close);
    const up = d.change >= 0;
    const el = $("delta");
    el.className = "delta " + (up ? "up" : "down");
    el.textContent = `${up ? "+" : "−"}${usd.format(Math.abs(d.change))} (${up ? "+" : "−"}${Math.abs(d.change_pct).toFixed(2)}%) from the last close of ${usd.format(d.last_close)}`;
    $("status").textContent = `Based on the close of ${fmtDate(d.as_of)} and the previous ${d.window} trading days.`;
    $("meta").textContent = `Generated ${new Date(d.generated_at).toLocaleString()} · Price data from Yahoo Finance`;

    const labels = d.history.map((h) => h.date).concat(d.target_date);
    const hist = d.history.map((h) => h.close).concat(null);
    const fc = new Array(d.history.length - 1).fill(null).concat(d.last_close, d.predicted_close);
    priceChart = new Chart($("price-chart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Close", data: hist, borderColor: css("--teal"), borderWidth: 2, pointRadius: 0, tension: 0.15 },
          { label: "Forecast", data: fc, borderColor: css("--amber"), borderDash: [6, 5], borderWidth: 2,
            pointRadius: (c) => (c.dataIndex === labels.length - 1 ? 6 : 0), pointBackgroundColor: css("--amber") },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" },
          tooltip: { callbacks: { label: (c) => (c.parsed.y == null ? null : `${c.dataset.label}: ${usd.format(c.parsed.y)}`) } } },
        scales: { x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } },
                  y: { ticks: { callback: (v) => "$" + v } } },
      },
    });
  }

  function barChart(canvas, labels, values, color) {
    const c = new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: color }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }, y: { beginAtZero: true } } },
    });
    explainCharts.push(c);
  }

  function addBlock(grid, title, sub) {
    const box = document.createElement("div");
    const h = document.createElement("h3"); h.textContent = title;
    const p = document.createElement("p"); p.className = "sub"; p.textContent = sub;
    const wrap = document.createElement("div"); wrap.className = "chart-box";
    const canvas = document.createElement("canvas");
    wrap.appendChild(canvas); box.append(h, p, wrap); grid.appendChild(box);
    return canvas;
  }

  // The API returns { labels: [...], mean_abs: [...], share_pct: [...] } for each importance block.
  function renderExplain(d) {
    const grid = $("explain-grid");
    let shown = 0;
    [["shap", "SHAP", css("--teal")], ["lime", "LIME", css("--amber")]].forEach(([k, name, color]) => {
      const ex = d[k];
      if (!ex || !ex.available) return;
      if (ex.feature_importance && ex.feature_importance.labels.length > 1) {
        barChart(addBlock(grid, `${name}: which inputs mattered`, "Average absolute impact of each input"),
          ex.feature_importance.labels, ex.feature_importance.mean_abs, color);
        shown++;
      }
      if (ex.time_block_importance && ex.time_block_importance.labels.length > 1) {
        barChart(addBlock(grid, `${name}: which past days mattered`, "Average absolute impact of each block of days (t = latest day)"),
          ex.time_block_importance.labels, ex.time_block_importance.mean_abs, color);
        shown++;
      }
    });
    if (!shown) $("explain-note").textContent = "Explanation charts are not available for the saved SHAP/LIME arrays.";
  }

  async function select(symbol) {
    current = symbol;
    const my = ++token;
    history.replaceState(null, "", "#" + symbol);
    renderTabs();
    resetView();
    try {
      const q = `?ticker=${encodeURIComponent(symbol)}`;
      const pred = await getJSON("/api/predict" + q, () => {
        if (my === token) $("status").textContent = "Waking the server. The first request after a quiet period can take up to a minute.";
      });
      if (my !== token) return;
      renderPrediction(pred);
      getJSON("/api/explain" + q).then((ex) => { if (my === token) renderExplain(ex); }).catch(() => {
        if (my === token) $("explain-note").textContent = "Could not load the explanation data.";
      });
    } catch (err) {
      if (my !== token) return;
      $("price").textContent = "--";
      $("status").className = "status error";
      $("status").textContent = `Could not load the ${symbol} forecast: ${err.message}. Refresh to try again.`;
    }
  }

  (async () => {
    try {
      const info = await getJSON("/api/tickers", () => {
        $("status").textContent = "Waking the server. The first request after a quiet period can take up to a minute.";
      });
      tickers = info.tickers;
    } catch (_) {
      tickers = [{ symbol: "AAPL", name: "Apple" }, { symbol: "MSFT", name: "Microsoft" }];   // fallback
    }
    const fromHash = location.hash.replace("#", "").toUpperCase();
    const start = tickers.some((t) => t.symbol === fromHash) ? fromHash : (tickers[0] && tickers[0].symbol);
    select(start);
  })();
})();
