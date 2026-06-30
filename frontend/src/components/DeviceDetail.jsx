// ============================================================================
// DeviceDetail.jsx  --  slide-over panel for one device
// ----------------------------------------------------------------------------
// Opens when you click a row. Capability-driven like the rest (FEATURE 1):
//   - it reads the device's capabilities to know which telemetry metrics and
//     controls exist, instead of assuming temperature/LED/switch
//   - it lets you pick which metric to chart (when there's more than one) and
//     draws a live sparkline for it
//   - it lists every control, and lets you toggle the writable ones right here
//
// On the firmware section: OTA updates are deferred, so it's shown but
// intentionally not wired up -- a placeholder for the Mender/hawkBit milestone.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { fetchTelemetry, sendCommand } from '../api.js';
import Sparkline from './Sparkline.jsx';

export default function DeviceDetail({ device, livePoint, onClose }) {
  const caps = device.capabilities || {};
  const metrics = caps.telemetry || [];
  const controls = caps.controls || [];

  // Which metric is being charted. Default to the device's first metric (if it
  // has any). This makes the panel work for a flow meter just as well as a
  // temperature sensor.
  const [metric, setMetric] = useState(metrics[0]?.metric || null);
  const metricDef = metrics.find((m) => m.metric === metric);

  const [history, setHistory] = useState([]);

  // Load the chosen metric's history whenever the device or metric changes.
  useEffect(() => {
    if (!metric) return;
    let active = true;
    fetchTelemetry(device.id, metric, 60)
      .then((rows) => active && setHistory(rows))
      .catch((err) => console.error(err));
    return () => { active = false; };
  }, [device.id, metric]);

  // Append a live point if it's for THIS device and the metric we're charting.
  useEffect(() => {
    if (!livePoint || !metric) return;
    if (livePoint.id === device.id && livePoint.metric === metric) {
      setHistory((prev) => [...prev, { value: livePoint.value, ts: livePoint.ts }].slice(-60));
    }
  }, [livePoint, device.id, metric]);

  return (
    <div className="backdrop" onClick={onClose}>
      <aside className="detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div>
            <h2>{device.name || device.id}</h2>
            <span className="card-id">{device.id}</span>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <dl className="meta">
          <Meta label="Location" value={device.location} />
          <Meta label="Type" value={device.type} />
          <Meta label="Firmware" value={device.firmware} />
          <Meta label="Status" value={device.online ? 'online' : 'offline'} />
        </dl>

        {/* Telemetry chart -- only if this device type reports any metrics. */}
        {metrics.length > 0 && (
          <section className="panel">
            <h3>Telemetry</h3>
            {/* metric picker appears only when there's more than one choice */}
            {metrics.length > 1 && (
              <select
                className="metric-select"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                {metrics.map((m) => (
                  <option key={m.metric} value={m.metric}>{m.label}</option>
                ))}
              </select>
            )}
            <div className="chart-wrap">
              <Sparkline points={history} unit={metricDef?.unit || ''} />
            </div>
          </section>
        )}

        {/* Controls -- one entry per control; writable ones are toggleable. */}
        {controls.length > 0 && (
          <section className="panel">
            <h3>Controls</h3>
            <div className="detail-channels">
              {controls.map((c) => (
                <DetailControl key={c.key} device={device} control={c} />
              ))}
            </div>
          </section>
        )}

        <section className="panel firmware">
          <h3>Firmware updates</h3>
          <p className="muted">
            Running {device.firmware || 'unknown'}. Over-the-air updates are a
            planned milestone (Mender / hawkBit) and are not enabled yet.
          </p>
          <button className="ghost" disabled>Check for updates</button>
        </section>
      </aside>
    </div>
  );
}

// A single control inside the detail panel. Mirrors the row: writable controls
// get a toggle button, read-only ones a pill.
function DetailControl({ device, control }) {
  const [sending, setSending] = useState(false);
  const value = device.state?.[control.key];
  const label = control.label || control.key;

  const toggle = async () => {
    setSending(true);
    try {
      await sendCommand(device.id, control.key, !value);
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setSending(false), 800);
    }
  };

  return (
    <div className="dc">
      <span className="channel-label">{label}{control.writable ? ' (output)' : ' (input)'}</span>
      {control.writable ? (
        <button
          className={`ctrl-btn ${value ? 'on' : 'off'}`}
          onClick={toggle}
          disabled={sending || !device.online}
        >
          {sending ? 'sending…' : value ? 'on' : 'off'}
        </button>
      ) : (
        <span className={`pill ${value ? 'on' : 'off'}`}>{value ? 'on' : 'off'}</span>
      )}
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="meta-row">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}
