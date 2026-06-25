// ============================================================================
// DeviceDetail.jsx  --  slide-over panel for one device
// ----------------------------------------------------------------------------
// Opens when you click a card. It:
//   - fetches the recent temperature history once and draws a sparkline
//   - appends live telemetry points as they stream in (via the livePoint prop)
//   - shows config + a firmware section
//
// On the firmware section: Chris deferred OTA updates for now, so it's shown
// but intentionally not wired up -- a placeholder for the Mender/hawkBit
// milestone from the architecture notes. It keeps the feature visible without
// pretending it works.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { fetchTelemetry } from '../api.js';
import Sparkline from './Sparkline.jsx';

export default function DeviceDetail({ device, livePoint, onClose }) {
  const [history, setHistory] = useState([]);

  // Load temperature history whenever the selected device changes.
  useEffect(() => {
    let active = true;
    fetchTelemetry(device.id, 'temperature', 60)
      .then((rows) => active && setHistory(rows))
      .catch((err) => console.error(err));
    return () => { active = false; };
  }, [device.id]);

  // Append a live point if it's for THIS device and the temperature metric.
  useEffect(() => {
    if (!livePoint) return;
    if (livePoint.id === device.id && livePoint.metric === 'temperature') {
      setHistory((prev) => {
        const next = [...prev, { value: livePoint.value, ts: livePoint.ts }];
        return next.slice(-60);          // keep only the most recent 60 points
      });
    }
  }, [livePoint, device.id]);

  return (
    // The backdrop closes the panel when clicked; the panel itself stops the
    // click from bubbling up to it.
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

        <section className="panel">
          <h3>Temperature</h3>
          <div className="chart-wrap">
            <Sparkline points={history} unit="°C" />
          </div>
        </section>

        <section className="panel">
          <h3>Channels</h3>
          <div className="detail-channels">
            <div className="dc">
              <span className="channel-label">LED output</span>
              <span className={`pill ${device.led_state ? 'on' : 'off'}`}>
                {device.led_state ? 'on' : 'off'}
              </span>
            </div>
            <div className="dc">
              <span className="channel-label">switch input</span>
              <span className={`pill ${device.switch_state ? 'on' : 'off'}`}>
                {device.switch_state ? 'on' : 'off'}
              </span>
            </div>
          </div>
        </section>

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

function Meta({ label, value }) {
  return (
    <div className="meta-row">
      <dt>{label}</dt>
      <dd>{value || '\u2014'}</dd>
    </div>
  );
}
