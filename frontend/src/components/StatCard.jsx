// ============================================================================
// StatCard.jsx  --  one KPI card (the row of four across the top)
// ----------------------------------------------------------------------------
// Each card has a coloured top border + value, a label, and a small sub-line.
// The accent colour is passed in so the same component can be blue / green /
// red / amber. We set it via inline style because it's a per-instance value,
// not something worth a CSS class each.
// ============================================================================

import React from 'react';

export default function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card" style={{ borderTopColor: accent }}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value" style={{ color: accent }}>{value}</div>
      <div className="stat-card-sub">{sub}</div>
    </div>
  );
}
