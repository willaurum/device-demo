// ============================================================================
// AlertsList.jsx  --  the "Recent Alerts" feed
// ----------------------------------------------------------------------------
// Renders the computed alerts (see lib/alerts.js). Each row has a severity
// marker, a title, a sub-line (device id + detail), and a relative time. Used
// both in the dashboard's side panel (with a limit) and the full Alerts view.
// ============================================================================

import React from 'react';

export default function AlertsList({ alerts, limit }) {
  const shown = limit ? alerts.slice(0, limit) : alerts;

  if (shown.length === 0) {
    return <div className="alerts-empty">No alerts yet — all clear.</div>;
  }

  return (
    <ul className="alerts-list">
      {shown.map((a) => (
        // `resolved` dims alerts whose condition has cleared; `unread` bolds the
        // ones the user hasn't reviewed yet. Both default off for plain alerts.
        <li
          key={a.key}
          className={`alert-item sev-${a.severity}` +
            (a.active === false ? ' resolved' : '') +
            (a.read === false ? ' unread' : '')}
        >
          <span className="alert-rail" />
          <span className="alert-icon">{ICON[a.severity]}</span>
          <div className="alert-body">
            <div className="alert-title">
              {a.read === false && <span className="unread-dot" />}
              {a.title}
              {a.active === false && <span className="resolved-tag">resolved</span>}
            </div>
            <div className="alert-sub">{a.sub}</div>
          </div>
          <span className="alert-time">{timeAgo(a.firstSeen ?? a.ts)}</span>
        </li>
      ))}
    </ul>
  );
}

// A glyph per severity (kept simple; no icon library).
const ICON = { critical: '⛔', warning: '⚠', info: 'ℹ' };

// Render a timestamp as a short relative string ("3m ago"). Falls back to a
// dash if we don't have a timestamp.
function timeAgo(ts) {
  if (!ts) return '—';
  const secs = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
