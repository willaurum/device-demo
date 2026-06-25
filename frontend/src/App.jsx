// ============================================================================
// App.jsx  --  the dashboard's brain
// ----------------------------------------------------------------------------
// Responsibilities:
//   - load the device list once on startup
//   - hold every device in a map keyed by id, so updates are easy to apply
//   - open the live WebSocket and fold each pushed update into that map
//   - render the fleet grid, and a detail panel for the selected device
//
// The mental model for live updates: the backend re-sends a device's full row
// whenever anything about it changes, so our handler is just "replace my copy."
// No diffing, no guessing.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { fetchDevices, connectWebSocket } from './api.js';
import DeviceRow from './components/DeviceRow.jsx';
import DeviceDetail from './components/DeviceDetail.jsx';

export default function App() {
  // devices: { [id]: deviceObject }. A map (not an array) so a single update
  // is just devices[id] = newDevice, no searching.
  const [devices, setDevices] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [connected, setConnected] = useState(false);

  // The most recent telemetry point we've seen. The detail panel watches this
  // and appends it to its chart when it matches the open device.
  const [livePoint, setLivePoint] = useState(null);

  useEffect(() => {
    // 1. Initial load: seed the map from the REST list.
    fetchDevices()
      .then((list) => {
        const map = {};
        for (const d of list) map[d.id] = d;
        setDevices(map);
      })
      .catch((err) => console.error(err));

    // 2. Live updates over the WebSocket.
    const ws = connectWebSocket((msg) => {
      setConnected(true);
      if (msg.type === 'device') {
        // Replace our copy of this one device.
        setDevices((prev) => ({ ...prev, [msg.device.id]: msg.device }));
      } else if (msg.type === 'telemetry') {
        // Surface the point for the detail chart.
        setLivePoint({ id: msg.id, metric: msg.metric, value: msg.value, ts: msg.ts });
      }
    });

    // 3. Clean up the socket if this component ever unmounts.
    return () => ws.close();
  }, []);

  const deviceList = Object.values(devices);
  const online = deviceList.filter((d) => d.online).length;
  const selected = selectedId ? devices[selectedId] : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <h1>Device Console</h1>
            <p className="brand-sub">ColeDD fleet monitor</p>
          </div>
        </div>
        <div className="fleet-stats">
          <Stat label="devices" value={deviceList.length} />
          <Stat label="online" value={online} accent />
          <span className={`link-pill ${connected ? 'on' : 'off'}`}>
            <span className="dot" /> {connected ? 'live' : 'connecting'}
          </span>
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
                <th>Device</th>
                <th>Location</th>
                <th>Type</th>
                <th>Temp</th>
                <th>Humidity</th>
                <th>LED</th>
                <th>Switch</th>
              </tr>
            </thead>
            <tbody>
              {deviceList.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
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

// Small labelled number used in the header.
function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <span className={`stat-value ${accent ? 'accent' : ''}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
