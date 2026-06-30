// ============================================================================
// Sidebar.jsx  --  the left navigation rail
// ----------------------------------------------------------------------------
// Groups the app's views into sections (Monitoring / Analytics / System) and
// highlights the active one. Clicking an item switches the view (handled in
// App via the `onNavigate` callback). The Alerts item shows a live count badge.
//
// Icons are simple unicode glyphs to avoid pulling in an icon library -- swap
// them for SVGs later if you want a more polished look.
// ============================================================================

import React from 'react';

// The nav, as data. `id` matches the view keys App knows how to render.
const SECTIONS = [
  {
    title: 'Monitoring',
    items: [
      { id: 'dashboard', label: 'Dashboard', glyph: '▦' },
      { id: 'devices',   label: 'Devices',   glyph: '▤' },
      { id: 'map',       label: 'Map',       glyph: '◉' },
      { id: 'alerts',    label: 'Alerts',    glyph: '⚠', badgeKey: 'alerts' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { id: 'telemetry', label: 'Telemetry', glyph: '∿' },
      { id: 'reports',   label: 'Reports',   glyph: '▣' },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'settings', label: 'Settings', glyph: '⚙' },
    ],
  },
];

export default function Sidebar({ active, onNavigate, alertCount, theme, onToggleTheme }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark" />
        <div>
          <div className="brand-name">FleetOS</div>
          <div className="brand-tag">Connected Device Platform</div>
        </div>
      </div>

      <nav className="nav">
        {SECTIONS.map((section) => (
          <div className="nav-section" key={section.title}>
            <div className="nav-section-title">{section.title}</div>
            {section.items.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${active === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="nav-glyph">{item.glyph}</span>
                <span className="nav-label">{item.label}</span>
                {item.badgeKey === 'alerts' && alertCount > 0 && (
                  <span className="nav-badge">{alertCount}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* theme toggle pinned to the bottom */}
      <button className="sidebar-theme" onClick={onToggleTheme}>
        {theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}
      </button>
    </aside>
  );
}
