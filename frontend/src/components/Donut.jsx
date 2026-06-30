// ============================================================================
// Donut.jsx  --  device-type breakdown as a donut chart (plain SVG)
// ----------------------------------------------------------------------------
// We draw the ring as a series of stroked circle arcs. The trick: a circle's
// stroke can be dashed with `stroke-dasharray`, so each segment is one dash of
// length (fraction × circumference), nudged around the ring with
// `stroke-dashoffset`. Rotating the whole thing -90° starts the first segment
// at the top (12 o'clock) instead of 3 o'clock.
//
// Input: segments = [{ type, count, color }]  (from derive.js typeCounts)
// ============================================================================

import React from 'react';

export default function Donut({ segments }) {
  const size = 132;
  const stroke = 16;
  const r = (size - stroke) / 2;          // radius that leaves room for the stroke
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;              // circumference

  const total = segments.reduce((sum, s) => sum + s.count, 0);

  // Running fraction so each segment starts where the previous ended.
  let acc = 0;

  return (
    <svg className="donut" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* faint track behind the segments */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />

      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {segments.map((s) => {
          const frac = total ? s.count / total : 0;
          const dash = frac * C;
          const seg = (
            <circle
              key={s.type}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-acc * C}
            />
          );
          acc += frac;
          return seg;
        })}
      </g>

      {/* center total */}
      <text x={cx} y={cy - 2} textAnchor="middle" className="donut-total">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="donut-sub">devices</text>
    </svg>
  );
}
