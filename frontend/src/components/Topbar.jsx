// ============================================================================
// Topbar.jsx  --  the header strip above each view
// ----------------------------------------------------------------------------
// Shows the current view's title, a live/connecting indicator (the real
// WebSocket state), and two actions:
//   - Export CSV   -> really downloads the current fleet as a CSV file
//   - + Add device -> opens an info modal (devices self-register over MQTT;
//                     there's no manual "create" — the modal explains how)
// ============================================================================

import React from 'react';

export default function Topbar({ title, connected, onExport, onAddDevice }) {
  return (
    <header className="app-topbar">
      <h1 className="view-title">{title}</h1>

      <div className="topbar-actions">
        <span className={`live-pill ${connected ? 'on' : 'off'}`}>
          <span className="dot" /> {connected ? 'Live feed' : 'Connecting'}
        </span>
        <button className="btn ghost" onClick={onExport}>Export CSV</button>
        <button className="btn primary" onClick={onAddDevice}>+ Add device</button>
      </div>
    </header>
  );
}
