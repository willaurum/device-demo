import React, { useState } from 'react';
import { sendLedCommand } from '../api.js';

export default function DeviceRow({ device, onOpen }) {
  const [sending, setSending] = useState(false);

  const toggleLed = async (e) => {
    e.stopPropagation();
    setSending(true);
    try {
      await sendLedCommand(device.id, !device.led_state);
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setSending(false), 800);
    }
  };

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
      <td className="num">{fmt(device.temperature, '°C')}</td>
      <td className="num">{fmt(device.humidity, '%')}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <button
          className={`led-btn ${device.led_state ? 'on' : 'off'}`}
          onClick={toggleLed}
          disabled={sending || !device.online}
        >
          {sending ? 'sending…' : device.led_state ? 'on' : 'off'}
        </button>
      </td>
      <td>
        <span className={`pill ${device.switch_state ? 'on' : 'off'}`}>
          {device.switch_state ? 'on' : 'off'}
        </span>
      </td>
    </tr>
  );
}

function fmt(n, unit) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(1)}${unit}`;
}
