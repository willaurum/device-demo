// ============================================================================
// DeviceRow.jsx  --  one row in the fleet table
// ----------------------------------------------------------------------------
// Capability-driven (FEATURE 1): the row is handed the fleet-wide list of
// telemetry `metrics` and `controls` (computed in App) and renders one cell per
// column. It never mentions "temperature" or "led" by name -- it reads each
// device's `latest` (telemetry values) and `state` (control values) blobs.
//
//   * a telemetry cell shows the latest value + unit, or "—" if this device
//     doesn't have that metric.
//   * a control cell shows a toggle BUTTON if the control is writable (an
//     output we command, like an LED or valve), or a read-only PILL otherwise
//     (an input we only observe, like a switch).
// ============================================================================

import React, { useState } from 'react';
import { sendCommand } from '../api.js';

export default function DeviceRow({ device, metrics, controls, onOpen }) {
  return (
    <tr
      className={`device-row ${device.online ? '' : 'is-offline'}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <td>
        <span className={`status ${device.online ? 'online' : 'offline'}`}>
          <span className="dot" />
        </span>
      </td>
      <td>
        <div className="row-name">{device.name || device.id}</div>
        <div className="row-id">{device.id}</div>
      </td>
      <td>{device.location || '—'}</td>
      <td>{device.type || '—'}</td>

      {/* telemetry columns: read from device.latest */}
      {metrics.map((m) => (
        <td key={m.metric} className="num">
          {fmt(device.latest?.[m.metric], m.unit)}
        </td>
      ))}

      {/* control columns: read from device.state */}
      {controls.map((c) => (
        <td key={c.key} onClick={(e) => e.stopPropagation()}>
          <ControlCell device={device} control={c} />
        </td>
      ))}
    </tr>
  );
}

// One control: a clickable toggle if writable, otherwise a read-only pill.
function ControlCell({ device, control }) {
  const [sending, setSending] = useState(false);
  const value = device.state?.[control.key];          // current on/off (or undefined)

  // Device types that don't have this control show nothing.
  if (value === undefined) return <span className="muted">—</span>;

  // Read-only input (e.g. a switch): just display its state.
  if (!control.writable) {
    return <span className={`pill ${value ? 'on' : 'off'}`}>{value ? 'on' : 'off'}</span>;
  }

  // Writable output (e.g. LED, valve): clicking sends a command. We don't flip
  // the UI ourselves -- the device reports its real new state back over the
  // WebSocket, which updates this row (the closed loop).
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
    <button
      className={`ctrl-btn ${value ? 'on' : 'off'}`}
      onClick={toggle}
      disabled={sending || !device.online}
    >
      {sending ? 'sending…' : value ? 'on' : 'off'}
    </button>
  );
}

// Format a numeric reading with its unit, or "—" if we have no value.
function fmt(n, unit) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(1)}${unit || ''}`;
}
