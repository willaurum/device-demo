// ============================================================================
// Sparkline.jsx  --  a tiny hand-drawn line chart
// ----------------------------------------------------------------------------
// We draw this ourselves with plain SVG instead of pulling in a charting
// library -- it's only a few lines and it shows exactly how the data maps to
// pixels. Input is an array of { value, ts }; we plot value over its index.
// ============================================================================

import React from 'react';

export default function Sparkline({ points, width = 520, height = 120, unit = '', precision = 1 }) {
  if (!points || points.length < 2) {
    return <div className="chart-empty">collecting data…</div>;
  }

  const values = points.map((p) => Number(p.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 8;                            // inner padding so the line isn't flush

  // Map a data point to an (x, y) pixel. x is spread evenly across the width;
  // y is flipped because SVG's y grows downward, and scaled to the value range.
  const span = max - min || 1;              // avoid divide-by-zero on a flat line
  const x = (i) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v) => pad + (1 - (v - min) / span) * (height - pad * 2);

  // Build the "M x y L x y L x y ..." path string.
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');

  const last = values[values.length - 1];

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="none">
      {/* the line */}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
      {/* a dot on the most recent reading */}
      <circle cx={x(values.length - 1)} cy={y(last)} r="3" fill="currentColor" />
      {/* min / max labels (decimals come from the metric's precision hint) */}
      <text x={pad} y={14} className="chart-tick">{max.toFixed(precision)}{unit}</text>
      <text x={pad} y={height - 4} className="chart-tick">{min.toFixed(precision)}{unit}</text>
    </svg>
  );
}
