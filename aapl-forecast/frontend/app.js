// =========================================================================
// Config + small helpers
// =========================================================================
const API = window.API_BASE || "";
const $ = (id) => document.getElementById(id);
const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

async function getJSON(path) {
  const res = await fetch(API + path, { cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

// =========================================================================
// THEME  (new)
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
  Chart.defaults.plugins.tooltip.backgroundColor = css("--ink");
  Chart.defaults.plugins.tooltip.titleColor = css("--paper");
  Chart.defaults.plugins.tooltip.bodyColor = css("--paper");

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
    for (const scale of Object.values(chart.options.scales || {})) {
      if (scale.ticks) scale.ticks.color = css("--muted");
      if (scale.grid) scale.grid.color = css("--rule");
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
  if (mq.addEventListener) {
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
  const lastClose = p.last_close ?? p.hist?.[p.hist.length - 1]?.close;
  $("price").textContent = lastClose != null ? usd.format(lastClose) : "—";

  const delta = $("delta");
  const change = p.change ?? 0;
  const pct = p.change_pct ?? 0;
  delta.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${pct.toFixed(2)}%)`;
  delta.classList.toggle("up", change >= 0);
  delta.classList.toggle("down", change < 0);

  const status = $("status");
  if (p.forecast != null) {
    status.textContent = `Forecast for next session: ${usd.format(p.forecast)}`;
    status.classList.remove("error");
  }

  // Expecting p.labels, p.hist, p.fc from the backend.
  // Adjust these three lines if your response uses different field names.
  const labels = [...(p.labels || [])];
  const histValues = [...(p.hist || [])];
  const fcValues = [...(p.fc || [])];

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
// NOTE: this block is unchanged from the repo on purpose — it still reads
// `ex.timestep_importance` / `ex.feature_importance.values`, which the
// backend does not return. Flagged separately; not part of the theme change.
function renderExplain(ex) {
  const grid = $("explain-grid");
  grid.innerHTML = "";
  let shown = 0;

  if (
    ex.timestep_importance &&
    Array.isArray(ex.timestep_importance.values) &&
    ex.timestep_importance.values.length > 1
  ) {
    const canvas = addBlock(
      grid,
      "Timestep importance",
      "Contribution of each of the last N sessions."
    );
    barChart(canvas, ["1", "2", "3", "4", "5"], ex.timestep_importance.values, "--series-a");
    shown++;
  }

  [["shap", "SHAP", "--series-a"], ["lime", "LIME", "--series-b"]].forEach(
    ([key, name, colorVar]) => {
      const block = ex[key];
      if (!block || !block.values) return;
      const labels = Object.keys(block.values);
      const values = labels.map((k) => block.values[k]);
      const canvas = addBlock(
        grid,
        `${name} feature importance`,
        `Per-feature contribution from the ${name} explainer.`
      );
      barChart(canvas, labels, values, colorVar);
      shown++;
    }
  );

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
      p.textContent = "Could not load the explanation data.";
      grid.appendChild(p);
    }
  }
}

boot();
