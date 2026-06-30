// ============================================================================
// FleetChart.jsx  --  multi-series live telemetry chart (plain SVG)
// ----------------------------------------------------------------------------
// Plots fleet-average telemetry over time. Because a fleet can report wildly
// different metrics (°C, %, L/min, bar, km/h, GPS degrees), we make the values
// READABLE in three ways instead of cramming them onto one misleading axis:
//
//   1. Metric chips  -> toggle which data types are drawn.
//   2. Legend values -> each series shows its current (latest) value + unit.
//   3. Hover readout -> move the mouse to see every series' value at that time.
//
// Each series is auto-scaled to its OWN min/max over the window, so differently
// -scaled metrics are all visible; you read the real numbers from the legend
// and the hover readout rather than from a shared y-axis.
// ============================================================================

import React, { useState } from "react";
import { PALETTE } from "../lib/derive.js";

const W = 1000; // viewBox width  (SVG stretches to its container)
const H = 300; // viewBox height
const PAD_Y = 14;

// Temperature/humidity get the classic green/blue; everything else cycles the
// shared palette so any metric gets a stable colour.
const PREFERRED = { temperature: "#3fd1a3", humidity: "#4aa3ff" };

// Allowlist: ONLY these metric keys appear on the trend chart (chips + plotting).
// Being an include-list, a brand-new metric won't clutter the chart until you
// add its key here. (GPS latitude/longitude are intentionally absent -- view
// those on the Map; a fleet-average of coordinates isn't meaningful.)
const CHART_INCLUDE = new Set([
  "temperature",
  "humidity",
  "flow_rate",
  "pressure",
]);

export default function FleetChart({ history, metrics }) {
  // Build a series descriptor for each ALLOWED metric the fleet reports.
  const allSeries = metrics
    .filter((m) => CHART_INCLUDE.has(m.metric))
    .map((m, i) => ({
      key: m.metric,
      label: m.label,
      unit: m.unit || "",
      precision: m.precision ?? 1,
      color: PREFERRED[m.metric] || PALETTE[i % PALETTE.length],
    }));

  // Default to temperature + humidity if present, else the first two metrics.
  const [selected, setSelected] = useState(() => {
    const pref = allSeries.filter((s) => s.key in PREFERRED).map((s) => s.key);
    return pref.length ? pref : allSeries.slice(0, 2).map((s) => s.key);
  });
  const [hover, setHover] = useState(null); // hovered sample index, or null

  const toggle = (key) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const shown = allSeries.filter((s) => selected.includes(s.key));
  const fmt = (v, p, u) =>
    typeof v === "number" ? `${v.toFixed(p)}${u}` : "—";
  const latestVal = (key) => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (typeof history[i][key] === "number") return history[i][key];
    }
    return null;
  };

  const chips = (
    <div className="metric-chips">
      {allSeries.map((s) => {
        const on = selected.includes(s.key);
        return (
          <button
            key={s.key}
            className={`metric-chip ${on ? "active" : ""}`}
            onClick={() => toggle(s.key)}
            style={on ? { borderColor: s.color, color: s.color } : undefined}
          >
            <span className="legend-dot" style={{ background: s.color }} />
            {s.label}
          </button>
        );
      })}
    </div>
  );

  if (!history || history.length < 2) {
    return (
      <div>
        {chips}
        <div className="chart-empty">collecting live telemetry…</div>
      </div>
    );
  }

  const x = (i) => (i / (history.length - 1)) * W;

  // Build line + area paths for each shown series, each on its OWN scale. We
  // keep the scale's y() function around so the hover dots can reuse it.
  const seriesPaths = shown
    .map((s) => {
      const vals = history
        .map((p) => p[s.key])
        .filter((v) => typeof v === "number");
      if (vals.length < 2) return null;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min || 1;
      const y = (v) => PAD_Y + (1 - (v - min) / span) * (H - 2 * PAD_Y);

      const pts = history
        .map((p, i) => ({ i, v: p[s.key] }))
        .filter((p) => typeof p.v === "number");
      const line = pts
        .map(
          (p, k) =>
            `${k === 0 ? "M" : "L"} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`,
        )
        .join(" ");
      const area = `${line} L ${x(pts[pts.length - 1].i).toFixed(1)} ${H} L ${x(pts[0].i).toFixed(1)} ${H} Z`;
      return { ...s, line, area, y };
    })
    .filter(Boolean);

  // Mouse -> nearest sample index (use the element's pixel width directly so we
  // don't have to convert into the stretched viewBox coordinate space).
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / rect.width),
    );
    setHover(Math.round(ratio * (history.length - 1)));
  };

  // x-axis time labels.
  const labelCount = Math.min(6, history.length);
  const labels = Array.from({ length: labelCount }, (_, k) => {
    const idx = Math.round((k / (labelCount - 1)) * (history.length - 1));
    return hhmm(history[idx].ts);
  });

  const hoverPct = hover != null ? (hover / (history.length - 1)) * 100 : 0;

  return (
    <div className="fleetchart">
      {chips}

      <div className="fleetchart-legend">
        {shown.map((s) => (
          <span key={s.key} className="legend-item">
            <span className="legend-dot" style={{ background: s.color }} />
            {s.label}
            <span className="legend-value">
              {fmt(latestVal(s.key), s.precision, s.unit)}
            </span>
          </span>
        ))}
      </div>

      <div
        className="fleetchart-plot"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          className="fleetchart-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
        >
          <defs>
            {shown.map((s) => (
              <linearGradient
                key={s.key}
                id={`grad-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.color} stopOpacity="0.26" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* faint horizontal gridlines for structure */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={f * H}
              y2={f * H}
              className="grid-line"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {seriesPaths.map((s) => (
            <g key={s.key}>
              <path d={s.area} fill={`url(#grad-${s.key})`} stroke="none" />
              <path
                d={s.line}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {hover != null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1="0"
              y2={H}
              className="hover-guide"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* hover dots (HTML, so they stay round even though the SVG stretches) */}
        {hover != null &&
          seriesPaths.map((s) => {
            const v = history[hover][s.key];
            if (typeof v !== "number") return null;
            return (
              <span
                key={s.key}
                className="hover-dot"
                style={{
                  left: `${hoverPct}%`,
                  top: `${(s.y(v) / H) * 100}%`,
                  background: s.color,
                }}
              />
            );
          })}

        {/* hover readout: every shown series' value at the hovered time */}
        {hover != null && shown.length > 0 && (
          <div
            className="hover-tip"
            style={{
              left: `${hoverPct}%`,
              transform:
                hoverPct > 50
                  ? "translateX(calc(-100% - 10px))"
                  : "translateX(10px)",
            }}
          >
            <div className="hover-time">{hhmm(history[hover].ts)}</div>
            {shown.map((s) => (
              <div key={s.key} className="hover-row">
                <span className="legend-dot" style={{ background: s.color }} />
                <span className="hover-name">{s.label}</span>
                <span className="hover-val">
                  {fmt(history[hover][s.key], s.precision, s.unit)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fleetchart-axis">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// Format a timestamp (ms) as HH:MM in the browser's local time.
function hhmm(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
