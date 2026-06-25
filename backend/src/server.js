// ============================================================================
// index.js  --  backend entry point
// ----------------------------------------------------------------------------
// Ties the pieces together and exposes the REST API the dashboard calls:
//
//   GET  /api/devices                       list all devices
//   GET  /api/devices/:id/telemetry?metric= recent readings for a chart
//   POST /api/devices/:id/command           send an LED command to a device
//
// Plus a WebSocket at /ws for live pushes (handled in ws.js).
//
// Startup order is deliberate: wait for the DB, then start MQTT (so handlers
// can write to a ready DB), then start listening for HTTP/WebSocket.
// ============================================================================

const http = require('http');
const express = require('express');
const db = require('./db');
const ws = require('./ws');
const mqttClient = require('./mqtt');

const app = express();
app.use(express.json()); // parse JSON request bodies (for POST command)

// ---- REST routes -----------------------------------------------------------

// Health check -- handy for "is the backend up?" and for load balancers later.
app.get('/api/health', (req, res) => res.json({ ok: true }));

// List every device for the main dashboard grid.
app.get('/api/devices', async (req, res) => {
  try {
    res.json(await db.listDevices());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent telemetry for one device + metric (defaults to temperature), used by
// the detail view's sparkline chart.
app.get('/api/devices/:id/telemetry', async (req, res) => {
  try {
    const metric = req.query.metric || 'temperature';
    const limit = Math.min(Number(req.query.limit) || 60, 500);
    res.json(await db.getTelemetry(req.params.id, metric, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a command down to a device. Body: { "led": true }  (or false)
// We only publish here; the device will actuate and report its real state back
// over MQTT, which is what actually updates the dashboard (the closed loop).
app.post('/api/devices/:id/command', (req, res) => {
  const { led } = req.body;
  if (typeof led !== 'boolean') {
    return res.status(400).json({ error: 'body must be { "led": true|false }' });
  }
  mqttClient.publishCommand(req.params.id, { led });
  res.json({ ok: true, sent: { led } });
});

// ---- Boot sequence ---------------------------------------------------------
async function main() {
  await db.waitForDb();          // 1. block until Postgres accepts connections
  mqttClient.start();            // 2. connect to broker + start handling messages

  const server = http.createServer(app);
  ws.attach(server);             // 3a. mount the WebSocket on the same server
  const port = process.env.PORT || 5000;
  server.listen(port, () => console.log(`[http] listening on :${port}`)); // 3b.
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
