// ============================================================================
// Login.jsx  --  the API-key gate (FEATURE 2)
// ----------------------------------------------------------------------------
// The dashboard shows this when there's no valid API key yet. The user pastes
// their key, we hand it to the parent (App) which stores it and tries to load
// data. If the backend rejects it, App sends us back here with an error.
//
// For the DEMO we list the two seeded keys right on the screen so you can click
// to try each tenant and watch the isolation. A real product would obviously
// NOT print keys here -- this is a teaching convenience.
// ============================================================================

import React, { useState } from 'react';

// The demo keys come straight from backend/db/init.sql (the tenants table).
const DEMO_KEYS = [
  { label: 'Acme Manufacturing', key: 'acme-demo-key-001' },
  { label: 'Globex Logistics',   key: 'globex-demo-key-002' },
];

export default function Login({ onSubmit, error }) {
  const [value, setValue] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>Device Console</h1>
        <p>Enter your API key to view your fleet.</p>

        <input
          type="text"
          placeholder="API key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <button type="submit">Sign in</button>

        {error && <div className="login-error">{error}</div>}

        {/* Demo convenience: click a key to fill it in. */}
        <div className="login-hint">
          Demo keys (click to use):
          {DEMO_KEYS.map((d) => (
            <div key={d.key}>
              <code onClick={() => setValue(d.key)}>{d.key}</code> — {d.label}
            </div>
          ))}
        </div>
      </form>
    </div>
  );
}
