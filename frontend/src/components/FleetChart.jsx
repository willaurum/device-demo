// ============================================================================
// FleetChart.jsx  --  multi-series area chart for fleet telemetry
// ----------------------------------------------------------------------------
// Like Sparkline, we hand-draw this with plain SVG (no charting library). It
// plots one filled area + line per series on a SHARED y-axis, so the lines can
// cross (e.g. temperature and humidity) just like the mockup.
//
// Input:
//   history : [{ ts, <metricKey>: value, ... }]  -- one sample per time tick
//   series  : [{ key, label, color }]            -- which metrics to draw
//
// The x-axis time labels are rendered as HTML beneath the SVG (not inside it),
// so they stay crisp even though the SVG itself stretches to fill its width.
// ============================================================================

import React from 'react';

const W = 1000;       // viewBox width  (the SVG scales to its container)
const H = 320;        // viewBox height
const PAD_Y = 12;     // vertical breathing room so lines aren't flush to edges

export default function FleetChart({ history, series }) {
  // Need at least two points to draw a line.
  if (!history || history.length < 2) {
    return <div className="chart-empty">collecting live telemetry…</div>;
  }

  // Shared y-range across every value of every series.
  const allValues = [];
  for (const s of series) {
    for (const p of history) {
      if (typeof p[s.key] === 'number') allValues.push(p[s.key]);
    }
  }
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;                       // avoid divide-by-zero

  const x = (i) => (i / (history.length - 1)) * W;
  const y = (v) => PAD_Y + (1 - (v - min) / span) * (H - 2 * PAD_Y);

  // Build the line + filled-area path strings for one series.
  const buildPaths = (key) => {
    const pts = history
      .map((p, i) => ({ i, v: p[key] }))
      .filter((p) => typeof p.v === 'number');
    if (pts.length < 2) return null;

    const line = pts
      .map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`)
      .join(' ');
    // The area is the same line, then down to the baseline and back to start.
    const first = x(pts[0].i).toFixed(1);
    const last = x(pts[pts.length - 1].i).toFixed(1);
    const area = `${line} L ${last} ${H} L ${first} ${H} Z`;
    return { line, area };
  };

  // A few evenly-spaced time labels for the x-axis.
  const labelCount = Math.min(6, history.length);
  const labels = Array.from({ length: labelCount }, (_, k) => {
    const idx = Math.round((k / (labelCount - 1)) * (history.length - 1));
    return hhmm(history[idx].ts);
  });

  return (
    <div className="fleetchart">
      <div className="fleetchart-legend">
        {series.map((s) => (
          <span key={s.key} className="legend-item">
            <span className="legend-dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <svg className="fleetchart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          {/* a soft top-down gradient under each line */}
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {series.map((s) => {
          const paths = buildPaths(s.key);
          if (!paths) return null;
          return (
            <g key={s.key}>
              <path d={paths.area} fill={`url(#grad-${s.key})`} stroke="none" />
              <path
                d={paths.line}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"  /* keep line width even when stretched */
              />
            </g>
          );
        })}
      </svg>

      <div className="fleetchart-axis">
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

// Format a timestamp (ms) as HH:MM in the browser's local time.
function hhmm(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
