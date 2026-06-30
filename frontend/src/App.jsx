// ============================================================================
// App.jsx  --  the dashboard's brain
// ----------------------------------------------------------------------------
// Responsibilities:
//   - gate the whole app behind an API key (show <Login> until we have one)
//   - load the device list for the logged-in tenant
//   - hold every device in a map keyed by id and fold live updates into it
//   - build the table COLUMNS dynamically from each device type's capabilities
//   - render the fleet table and a detail panel for the selected device
//
// TWO TEMPLATE FEATURES SHOW UP HERE:
//
//   FEATURE 2 (auth): if there's no key (or the backend returns 401) we render
//     <Login>. Once authenticated we show the tenant's name + a Sign out button.
//
//   FEATURE 1 (capabilities): we DON'T hard-code "Temp / Humidity / LED /
//     Switch" columns anymore. We look at every device's `capabilities` and
//     build one column per telemetry metric and per control found across the
//     fleet. Add a new device type in the DB and its columns appear here with
//     zero changes to this file.
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  fetchMe, fetchDevices, connectWebSocket,
  getApiKey, setApiKey, clearApiKey,
} from './api.js';
import Login from './components/Login.jsx';
import DeviceRow from './components/DeviceRow.jsx';
import DeviceDetail from './components/DeviceDetail.jsx';

export default function App() {
  // ---- auth state ----------------------------------------------------------
  // `apiKey` drives everything: empty -> show login; set -> try to load data.
  const [apiKey, setKey] = useState(() => getApiKey());
  const [tenant, setTenant] = useState(null);     // { id, name } once verified
  const [authError, setAuthError] = useState('');

  // ---- data state ----------------------------------------------------------
  const [devices, setDevices] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [livePoint, setLivePoint] = useState(null);  // newest telemetry point
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  // Apply the theme to the document and remember it.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // ---- login / logout helpers ----------------------------------------------
  const handleLogin = (key) => {
    setAuthError('');
    setApiKey(key);     // persist to localStorage
    setKey(key);        // trigger the data-loading effect below
  };
  const handleLogout = () => {
    clearApiKey();
    setKey('');
    setTenant(null);
    setDevices({});
    setSelectedId(null);
  };

  // ---- load data once we have a key ----------------------------------------
  // Re-runs whenever the key changes (i.e. right after login). If the key is
  // bad, fetchMe throws a 401 and we drop back to the login screen.
  useEffect(() => {
    if (!apiKey) return;

    let ws;
    let cancelled = false;

    (async () => {
      try {
        // 1. Confirm the key and learn who we are.
        const me = await fetchMe();
        if (cancelled) return;
        setTenant(me);

        // 2. Seed the device map from the REST list.
        const list = await fetchDevices();
        if (cancelled) return;
        const map = {};
        for (const d of list) map[d.id] = d;
        setDevices(map);

        // 3. Live updates over the WebSocket (scoped to our tenant server-side).
        ws = connectWebSocket((msg) => {
          setConnected(true);
          if (msg.type === 'device') {
            setDevices((prev) => ({ ...prev, [msg.device.id]: msg.device }));
          } else if (msg.type === 'telemetry') {
            setLivePoint({ id: msg.id, metric: msg.metric, value: msg.value, ts: msg.ts });
          }
        });
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401) {
          // Bad/expired key: clear it and show the login screen with a message.
          clearApiKey();
          setKey('');
          setTenant(null);
          setAuthError('That API key was not accepted. Please try again.');
        } else {
          console.error(err);
        }
      }
    })();

    // Clean up the socket if the key changes or the component unmounts.
    return () => { cancelled = true; if (ws) ws.close(); };
  }, [apiKey]);

  // ---- no key yet -> show the login gate -----------------------------------
  if (!apiKey) {
    return <Login onSubmit={handleLogin} error={authError} />;
  }

  // ---- derive table columns from capabilities (FEATURE 1) ------------------
  const deviceList = Object.values(devices);
  const { metrics, controls } = deriveColumns(deviceList);
  const online = deviceList.filter((d) => d.online).length;
  const selected = selectedId ? devices[selectedId] : null;

  // Sorting works for the fixed columns (name/location/type) AND for any
  // metric or control column. We encode metric columns as "m:<metric>" and
  // control columns as "c:<key>" so one handler covers them all.
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedDevices = [...deviceList].sort((a, b) => {
    let av = valueForSort(a, sortKey);
    let bv = valueForSort(b, sortKey);
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <h1>Device Console</h1>
            {/* Show the logged-in client so the isolation is obvious. */}
            <p className="brand-sub">{tenant ? tenant.name : 'loading…'}</p>
          </div>
        </div>
        <div className="fleet-stats">
          <Stat label="devices" value={deviceList.length} />
          <Stat label="online" value={online} accent />
          <span className={`link-pill ${connected ? 'on' : 'off'}`}>
            <span className="dot" /> {connected ? 'live' : 'connecting'}
          </span>
          <button className="theme-btn" onClick={toggleTheme}>
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main className="table-wrap">
        {deviceList.length === 0 ? (
          <div className="empty">
            Waiting for devices to report in. If this stays empty, check that the
            simulator container is running.
          </div>
        ) : (
          <table className="device-table">
            <thead>
              <tr>
                <th></th>
                <SortTh label="Device"   col="name"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Location" col="location" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Type"     col="type"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                {/* one column per telemetry metric found across the fleet */}
                {metrics.map((m) => (
                  <SortTh key={m.metric} label={m.label} col={`m:${m.metric}`}
                          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                ))}
                {/* one column per control found across the fleet */}
                {controls.map((c) => (
                  <SortTh key={c.key} label={c.label} col={`c:${c.key}`}
                          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedDevices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  metrics={metrics}
                  controls={controls}
                  onOpen={() => setSelectedId(device.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </main>

      {selected && (
        <DeviceDetail
          device={selected}
          livePoint={livePoint}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------

// Walk every device's capabilities and collect the distinct telemetry metrics
// and controls across the whole fleet. Different device types contribute
// different columns; a device simply shows "—" where it lacks one. First
// definition of a metric/control wins (for its label/unit).
function deriveColumns(devices) {
  const metrics = [];
  const controls = [];
  const seenMetric = new Set();
  const seenControl = new Set();

  for (const d of devices) {
    const caps = d.capabilities || {};
    for (const m of caps.telemetry || []) {
      if (!seenMetric.has(m.metric)) { seenMetric.add(m.metric); metrics.push(m); }
    }
    for (const c of caps.controls || []) {
      if (!seenControl.has(c.key)) { seenControl.add(c.key); controls.push(c); }
    }
  }
  return { metrics, controls };
}

// Pull the sortable value for a device given a column key. Understands the
// fixed columns plus the "m:<metric>" (telemetry) and "c:<key>" (control)
// encodings. Missing values sort as empty string; booleans as 0/1.
function valueForSort(device, key) {
  if (key.startsWith('m:')) {
    const v = device.latest?.[key.slice(2)];
    return v ?? '';
  }
  if (key.startsWith('c:')) {
    const v = device.state?.[key.slice(2)];
    return v === undefined ? '' : (v ? 1 : 0);
  }
  return device[key] ?? '';
}

function SortTh({ label, col, sortKey, sortDir, onSort }) {
  const active = sortKey === col;
  return (
    <th className={`sortable ${active ? 'sorted' : ''}`} onClick={() => onSort(col)}>
      {label}
      <span className="sort-indicator">
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </span>
    </th>
  );
}

// Small labelled number used in the header.
function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <span className={`stat-value ${accent ? 'accent' : ''}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
