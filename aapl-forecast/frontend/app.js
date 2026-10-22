// =========================================================================
// Config + small helpers
// =========================================================================
// Strip trailing slashes so API + "/api/x" never becomes "//api/x".
const API = (
  window.API_BASE || "https://stock-pred-cnn-lstm.onrender.com"
).replace(/\/+$/, "");

const $ = (id) => document.getElementById(id);
const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

async function getJSON(path) {
  const url = API + path;
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (e) {
    throw new Error(
      `Network error → ${url} ` +
        `[${e.name}: ${
          e.message || "no message — usually CORS, mixed content, or host down"
        }]`
    );
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && body.detail) detail += ` — ${body.detail}`;
    } catch (_) {}
    throw new Error(`${detail} (${url})`);
  }
  try {
    return await res.json();
  } catch (_) {
    throw new Error(`Response from ${url} was not valid JSON`);
  }
}

// =========================================================================
// THEME
// =========================================================================
const root = document.documentElement;
const charts = [];
const track = (chart) => (charts.push(chart), chart);

// Chart colours are stored as variable *names*, not resolved values, so a
// theme switch can re-read the palette instead of keeping whatever was
// captured at chart construction time.
function themeCharts() {
  if (typeof Chart === "undefined") return;

  Chart.defaults.color = css("--muted");
  Chart.defaults.borderColor = css("--rule");
  if (Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
    Chart.defaults.plugins.tooltip.backgroundColor = css("--ink");
    Chart.defaults.plugins.tooltip.titleColor = css("--paper");
    Chart.defaults.plugins.tooltip.bodyColor = css("--paper");
  }

  for (const chart of charts) {
    for (const ds of chart.data.datasets) {
      if (!ds._colorVar) continue;
      const c = css(ds._colorVar);
      if (chart.config.type === "bar") {
        ds.backgroundColor = c;
      } else {
        ds.borderColor = c;
        if (ds.pointBackgroundColor) ds.pointBackgroundColor = c;
      }
    }
    // Chart.js resolves grid/tick colours once, so set them explicitly here.
    const scales = chart.options && chart.options.scales;
    if (scales) {
      for (const scale of Object.values(scales)) {
        if (scale.ticks) scale.ticks.color = css("--muted");
        if (scale.grid) scale.grid.color = css("--rule");
      }
    }
    chart.update("none");
  }
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  const dark = theme === "dark";
  const btn = $("theme-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", String(dark));
    btn.setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme"
    );
    const label = btn.querySelector(".theme-toggle-label");
    if (label) label.textContent = dark ? "Light" : "Dark";
  }
  themeCharts();
}

(function initTheme() {
  const btn = $("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("theme", next);
      } catch (_) {}
      applyTheme(next);
    });
  }
  // Follow the OS only while the user has not made an explicit choice.
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (mq && typeof mq.addEventListener === "function") {
    mq.addEventListener("change", (e) => {
      let saved = null;
      try {
        saved = localStorage.getItem("theme");
      } catch (_) {}
      if (!saved) applyTheme(e.matches ? "dark" : "light");
    });
  }
  applyTheme(root.dataset.theme || "light");
})();

// =========================================================================
// DOM helpers
// =========================================================================
function addBlock(grid, title, sub) {
  const wrap = document.createElement("div");
  const h = document.createElement("h3");
  h.textContent = title;
  const s = document.createElement("p");
  s.className = "sub";
  s.textContent = sub;
  const box = document.createElement("div");
  box.className = "chart-box";
  const canvas = document.createElement("canvas");
  box.appendChild(canvas);
  wrap.append(h, s, box);
  grid.appendChild(wrap);
  return canvas;
}

// colorVar is a CSS variable *name* (e.g. "--series-a"), not a value.
function barChart(canvas, labels, values, colorVar) {
  track(
    new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: css(colorVar),
            _colorVar: colorVar,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
          y: { beginAtZero: true },
        },
      },
    })
  );
}

// =========================================================================
// Render: prediction
// =========================================================================
function renderPrediction(p) {
  const hist = Array.isArray(p.hist) ? p.hist : [];
  const lastHist = hist.length ? hist[hist.length - 1] : null;
  const lastClose =
    (isNum(p.last_close) && p.last_close) ||
    (lastHist && isNum(lastHist.close) && lastHist.close) ||
    (isNum(lastHist) && lastHist) ||
    null;

  $("price").textContent = lastClose != null ? usd.format(lastClose) : "—";

  const delta = $("delta");
  const change = isNum(p.change) ? p.change : 0;
  const pct = isNum(p.change_pct) ? p.change_pct : 0;
  delta.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${pct.toFixed(2)}%)`;
  delta.classList.toggle("up", change >= 0);
  delta.classList.toggle("down", change < 0);

  const status = $("status");
  if (isNum(p.forecast)) {
    status.textContent = `Forecast for next session: ${usd.format(p.forecast)}`;
    status.classList.remove("error");
  }

  // Expecting p.labels, p.hist, p.fc. If your backend uses different keys,
  // adjust these three lines — the rest of the chart config stays the same.
  const labels = Array.isArray(p.labels) ? [...p.labels] : [];
  const histValues = hist.map((h) => (isNum(h) ? h : h && h.close));
  const fcValues = Array.isArray(p.fc) ? [...p.fc] : [];

  track(
    new Chart($("price-chart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Close",
            data: histValues,
            borderColor: css("--series-a"),
            _colorVar: "--series-a",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.15,
          },
          {
            label: "Forecast",
            data: fcValues,
            borderColor: css("--series-b"),
            _colorVar: "--series-b",
            borderDash: [6, 5],
            borderWidth: 2,
            pointRadius: (c) =>
              c.dataIndex === labels.length - 1 ? 6 : 0,
            pointBackgroundColor: css("--series-b"),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (c) =>
                c.parsed.y == null
                  ? null
                  : `${c.dataset.label}: ${usd.format(c.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } },
          y: { ticks: { callback: (v) => "$" + v } },
        },
      },
    })
  );
}

// =========================================================================
// Render: explanations
// =========================================================================
// Handles both response shapes we might see:
//   A) { feature_importance: { labels:[…], mean_abs:[…], share_pct:[…] } }
//   B) { shap: {…}, lime: {…} }   (values either array-parallel to labels,
//                                  or a { featureName: number } map)
function renderExplain(ex) {
  const grid = $("explain-grid");
  grid.innerHTML = "";
  let shown = 0;

  // Shape A — one combined importance object.
  const fi = ex && ex.feature_importance;
  if (fi && Array.isArray(fi.labels) && fi.labels.length) {
    const vals = Array.isArray(fi.share_pct)
      ? fi.share_pct
      : Array.isArray(fi.mean_abs)
      ? fi.mean_abs
      : null;
    if (vals && vals.length === fi.labels.length) {
      const canvas = addBlock(
        grid,
        "Feature importance",
        "Average absolute impact of each input on the forecast."
      );
      barChart(canvas, fi.labels, vals, "--series-a");
      shown++;
    }
  }

  // Shape B — separate SHAP / LIME blocks.
  [["shap", "SHAP", "--series-a"], ["lime", "LIME", "--series-b"]].forEach(
    ([key, name, colorVar]) => {
      const block = ex && ex[key];
      if (!block) return;

      let labels = null;
      let values = null;

      if (Array.isArray(block.labels) && Array.isArray(block.values)) {
        labels = block.labels;
        values = block.values;
      } else if (
        block.values &&
        typeof block.values === "object" &&
        !Array.isArray(block.values)
      ) {
        labels = Object.keys(block.values);
        values = labels.map((k) => block.values[k]);
      }

      if (!labels || !values) return;

      const canvas = addBlock(
        grid,
        `${name} feature importance`,
        `Per-feature contribution from the ${name} explainer.`
      );
      barChart(canvas, labels, values, colorVar);
      shown++;
    }
  );

  // Optional per-timestep chart, if the backend ever returns it.
  const ti = ex && ex.timestep_importance;
  if (ti && Array.isArray(ti.values) && ti.values.length > 1) {
    const tiLabels = Array.isArray(ti.labels)
      ? ti.labels
      : ti.values.map((_, i) => String(i + 1));
    const canvas = addBlock(
      grid,
      "Timestep importance",
      "Contribution of each of the last N sessions."
    );
    barChart(canvas, tiLabels, ti.values, "--series-a");
    shown++;
  }

  if (!shown) {
    const p = document.createElement("p");
    p.className = "sub";
    p.textContent = "Explanation artifacts not available.";
    grid.appendChild(p);
  }
}

// =========================================================================
// Boot
// =========================================================================
async function boot() {
  const status = $("status");

  if (!API) {
    status.textContent = "API base URL is not configured.";
    status.classList.add("error");
    return;
  }

  try {
    const prediction = await getJSON("/api/predict");
    renderPrediction(prediction);
  } catch (err) {
    status.textContent = `Could not load the forecast: ${err.message}`;
    status.classList.add("error");
    return;
  }

  try {
    const explain = await getJSON("/api/explain");
    renderExplain(explain);
  } catch (err) {
    const grid = $("explain-grid");
    if (grid) {
      grid.innerHTML = "";
      const p = document.createElement("p");
      p.className = "sub";
      p.textContent = `Could not load the explanation data: ${err.message}`;
      grid.appendChild(p);
    }
  }
}

boot();
