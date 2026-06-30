// ============================================================================
// App.jsx  --  the application shell + state owner
// ----------------------------------------------------------------------------
// Responsibilities:
//   - load the device list, hold it in a map keyed by id, fold in live updates
//   - keep a rolling buffer of fleet-average telemetry for the live chart
//   - derive everything the UI needs (columns, KPIs, type counts, alerts)
//   - render the shell: Sidebar + Topbar + the active view, plus the detail
//     slide-over and the "add device" modal
//
// The heavy lifting (turning devices into numbers) lives in lib/derive.js and
// lib/alerts.js so this file stays about wiring and layout.
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { fetchDevices, connectWebSocket } from './api.js';
import { deriveColumns, computeKpis, typeCounts, fleetAverage, toCsv } from './lib/derive.js';
import { computeAlerts, mergeAlertLog } from './lib/alerts.js';

import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import DashboardView from './components/DashboardView.jsx';
import DeviceTable from './components/DeviceTable.jsx';
import MapView from './components/MapView.jsx';
import AlertsList from './components/AlertsList.jsx';
import DeviceDetail from './components/DeviceDetail.jsx';
import AddDeviceModal from './components/AddDeviceModal.jsx';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  devices: 'Devices',
  map: 'Map',
  alerts: 'Alerts',
  telemetry: 'Telemetry',
  reports: 'Reports',
  settings: 'Settings',
};

// How many fleet-average samples to keep on the live chart (~4 min at 3s each).
const HISTORY_CAP = 80;

export default function App() {
  const [devices, setDevices] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [livePoint, setLivePoint] = useState(null);     // newest telemetry point (for detail chart)
  const [history, setHistory] = useState([]);            // rolling fleet averages (for FleetChart)
  const [activeView, setActiveView] = useState('dashboard');
  const [addOpen, setAddOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // Persistent alert log: alerts stay here once fired (active or resolved) so
  // they can be reviewed in the Alerts tab. Seeded from localStorage so it
  // survives a refresh.
  const [alertLog, setAlertLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('alertLog')) || []; } catch { return []; }
  });

  // A ref mirror of `devices` so the sampling interval below always reads the
  // latest snapshot without re-subscribing every render.
  const devicesRef = useRef(devices);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  // Apply + remember the theme.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Load devices, then open the live WebSocket. Runs once on mount.
  useEffect(() => {
    fetchDevices()
      .then((list) => {
        const map = {};
        for (const d of list) map[d.id] = d;
        setDevices(map);
      })
      .catch((err) => console.error(err));

    const ws = connectWebSocket((msg) => {
      setConnected(true);
      if (msg.type === 'device') {
        setDevices((prev) => ({ ...prev, [msg.device.id]: msg.device }));
      } else if (msg.type === 'telemetry') {
        setLivePoint({ id: msg.id, metric: msg.metric, value: msg.value, ts: msg.ts });
      }
    });

    return () => ws.close();
  }, []);

  // Every 3s, snapshot the current fleet averages and append to the chart
  // buffer. Sampling on a timer (instead of per-message) keeps the line smooth
  // and the work bounded no matter how many devices are streaming.
  useEffect(() => {
    const tick = () => {
      const list = Object.values(devicesRef.current);
      if (list.length === 0) return;
      const { metrics } = deriveColumns(list);
      const avg = fleetAverage(list, metrics.map((m) => m.metric));
      if (Object.keys(avg).length === 0) return;
      setHistory((prev) => [...prev, { ts: Date.now(), ...avg }].slice(-HISTORY_CAP));
    };
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  // Fold currently-active alerts into the persistent log whenever devices change.
  useEffect(() => {
    const active = computeAlerts(Object.values(devices));
    setAlertLog((prev) => mergeAlertLog(prev, active, Date.now()));
  }, [devices]);

  // Persist the log so it survives a refresh.
  useEffect(() => {
    localStorage.setItem('alertLog', JSON.stringify(alertLog));
  }, [alertLog]);

  // Viewing the Alerts tab marks everything read (the badge clears) -- but the
  // alerts REMAIN in the log. Re-runs while on the tab so alerts that arrive
  // while you're looking get marked read too.
  useEffect(() => {
    if (activeView !== 'alerts') return;
    setAlertLog((prev) => (prev.some((r) => !r.read) ? prev.map((r) => ({ ...r, read: true })) : prev));
  }, [activeView, alertLog]);

  // ---- derive everything the views need ------------------------------------
  const deviceList = Object.values(devices);
  const { metrics, controls } = deriveColumns(deviceList);
  const activeAlerts = computeAlerts(deviceList);          // currently-true (for the KPI card)
  const kpis = computeKpis(deviceList, activeAlerts);
  const types = typeCounts(deviceList);
  const selected = selectedId ? devices[selectedId] : null;

  // Alert log for display: active first, then newest first.
  const sortedAlerts = [...alertLog].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.firstSeen - a.firstSeen;
  });
  const unreadCount = alertLog.filter((r) => !r.read).length;

  // ---- actions -------------------------------------------------------------
  const exportCsv = () => {
    const csv = toCsv(deviceList, metrics, controls);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devices.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shell">
      <Sidebar
        active={activeView}
        onNavigate={setActiveView}
        alertCount={unreadCount}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="main">
        <Topbar
          title={VIEW_TITLES[activeView]}
          connected={connected}
          onExport={exportCsv}
          onAddDevice={() => setAddOpen(true)}
        />

        <div className="view">
          {renderView()}
        </div>
      </div>

      {selected && (
        <DeviceDetail
          device={selected}
          livePoint={livePoint}
          onClose={() => setSelectedId(null)}
        />
      )}

      <AddDeviceModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );

  // Decide which view's content to show. The shell (sidebar/topbar) is the same
  // for all of them.
  function renderView() {
    if (deviceList.length === 0) {
      return (
        <div className="empty">
          Waiting for devices to report in. If this stays empty, check that the
          simulator container is running.
        </div>
      );
    }

    switch (activeView) {
      case 'devices':
        return (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Device Registry</h3>
                <p className="panel-sub">Click a row to inspect</p>
              </div>
            </div>
            <DeviceTable devices={deviceList} metrics={metrics} controls={controls} onOpen={setSelectedId} />
          </section>
        );

      case 'map':
        return <MapView devices={deviceList} onOpen={setSelectedId} theme={theme} />;

      case 'alerts':
        return (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Alerts</h3>
                <p className="panel-sub">Active and resolved · newest first</p>
              </div>
            </div>
            <AlertsList alerts={sortedAlerts} />
          </section>
        );

      case 'telemetry':
      case 'reports':
      case 'settings':
        return <Placeholder name={VIEW_TITLES[activeView]} />;

      case 'dashboard':
      default:
        return (
          <DashboardView
            devices={deviceList}
            metrics={metrics}
            controls={controls}
            alerts={sortedAlerts}
            kpis={kpis}
            types={types}
            history={history}
            onOpen={setSelectedId}
            onViewAll={() => setActiveView('alerts')}
          />
        );
    }
  }
}

// Honest stand-in for views we haven't built in this template.
function Placeholder({ name }) {
  return (
    <div className="placeholder panel">
      <h3>{name}</h3>
      <p className="muted">
        This view isn't built in the template yet. It's a natural next step —
        for example, {name} could live here. The shell, data layer, and live
        feed are already in place to support it.
      </p>
    </div>
  );
}
