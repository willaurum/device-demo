// ============================================================================
// DeviceCard.jsx  --  one device in the fleet grid
// ----------------------------------------------------------------------------
// Shows identity (name, id, location), live status, the two sensor readings,
// and the two binary channels that are the heart of the demo:
//
//   LED    = the OUTPUT we control  -> a button that sends a command
//   Switch = the INPUT we read      -> a read-only indicator
//
// Clicking anywhere on the card (except the LED button) opens the detail view.
// ============================================================================

import React, { useState } from 'react';
import { sendLedCommand } from '../api.js';

export default function DeviceCard({ device, onOpen }) {
  // Brief "sending" state purely for feedback. The REAL state still arrives
  // from the device over the WebSocket; this just acknowledges the click.
  const [sending, setSending] = useState(false);

  const toggleLed = async (e) => {
    e.stopPropagation();          // don't also trigger the card's onOpen
    setSending(true);
    try {
      await sendLedCommand(device.id, !device.led_state);
    } catch (err) {
      console.error(err);
    } finally {
      // Clear after a moment; by then the device has usually reported back.
      setTimeout(() => setSending(false), 800);
    }
  };

  const temp = fmt(device.temperature, '\u00B0C');   // °C
  const hum = fmt(device.humidity, '%');

  return (
    <article
      className={`card ${device.online ? '' : 'is-offline'}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' ? onOpen() : null)}
    >
      <div className="card-head">
        <div>
          <h2 className="card-name">{device.name || device.id}</h2>
          <span className="card-id">{device.id}</span>
        </div>
        <span className={`status ${device.online ? 'online' : 'offline'}`}>
          <span className="dot" />
          {device.online ? 'online' : 'offline'}
        </span>
      </div>

      <p className="card-loc">{device.location || '\u2014'}</p>

      <div className="readings">
        <Reading label="temp" value={temp} />
        <Reading label="humidity" value={hum} />
      </div>

      <div className="channels">
        {/* OUTPUT: LED we control */}
        <div className="channel">
          <span className="channel-label">LED output</span>
          <button
            className={`led-btn ${device.led_state ? 'on' : 'off'}`}
            onClick={toggleLed}
            disabled={sending || !device.online}
          >
            {sending ? 'sending\u2026' : device.led_state ? 'on' : 'off'}
          </button>
        </div>

        {/* INPUT: switch we read */}
        <div className="channel">
          <span className="channel-label">switch input</span>
          <span className={`pill ${device.switch_state ? 'on' : 'off'}`}>
            {device.switch_state ? 'on' : 'off'}
          </span>
        </div>
      </div>
    </article>
  );
}

function Reading({ label, value }) {
  return (
    <div className="reading">
      <span className="reading-value">{value}</span>
      <span className="reading-label">{label}</span>
    </div>
  );
}

// Format a possibly-null number with a unit. Telemetry may not have arrived yet.
function fmt(n, unit) {
  if (n === null || n === undefined) return '\u2014';
  return `${Number(n).toFixed(1)}${unit}`;
}
