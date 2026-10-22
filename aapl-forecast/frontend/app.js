(() => {
  const API = window.APP_CONFIG.API_BASE;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const fmtDate = (iso) =>
    new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });

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

  function renderPrediction(d) {
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
    new Chart($("price-chart"), {
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
    new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: color }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }, y: { beginAtZero: true } } },
    });
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

  function renderExplain(d) {
    const grid = $("explain-grid");
    let shown = 0;
    [["shap", "SHAP", css("--teal")], ["lime", "LIME", css("--amber")]].forEach(([k, name, color]) => {
      const ex = d[k];
      if (!ex || !ex.available) return;
      if (ex.timestep_importance) {
        const n = ex.timestep_importance.values.length;
        const labels = ex.timestep_importance.values.map((_, i) => (i === n - 1 ? "latest day" : `${n - 1 - i} days ago`));
        barChart(addBlock(grid, `${name}: which past days mattered`, `Average absolute impact of each of the last ${n} days`),
          labels, ex.timestep_importance.values, color);
        shown++;
      }
      if (ex.feature_importance && Object.keys(ex.feature_importance.values).length > 1) {
        const f = ex.feature_importance.values;
        barChart(addBlock(grid, `${name}: which inputs mattered`, "Average absolute impact of each input"),
          Object.keys(f), Object.values(f), color);
        shown++;
      }
    });
    if (!shown) $("explain-note").textContent = "Explanation charts are not available for the saved SHAP/LIME arrays.";
  }

  (async () => {
    try {
      const pred = await getJSON("/api/predict", () => {
        $("status").textContent = "Waking the server. The first request after a quiet period can take up to a minute.";
      });
      renderPrediction(pred);
      getJSON("/api/explain").then(renderExplain).catch(() => {
        $("explain-note").textContent = "Could not load the explanation data.";
      });
    } catch (err) {
      $("price").textContent = "--";
      $("status").className = "status error";
      $("status").textContent = `Could not load the forecast: ${err.message}. Refresh to try again.`;
    }
  })();
})();
