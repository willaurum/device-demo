// ============================================================================
// server.js  --  backend entry point
// ----------------------------------------------------------------------------
// Ties the pieces together and exposes the REST API the dashboard calls:
//
//   GET  /api/health                        is the backend up? (no auth)
//   GET  /api/me                            who am I? -> the logged-in tenant
//   GET  /api/devices                       list THIS tenant's devices
//   GET  /api/devices/:id/telemetry?metric= recent readings for a chart
//   POST /api/devices/:id/command           set a control on a device
//
// Plus a WebSocket at /ws for live pushes (handled in ws.js).
//
// AUTH (FEATURE 2): every /api route except /health is behind requireAuth, so
// the caller must present a valid API key. That middleware attaches req.tenant,
// and every handler below scopes its work to req.tenant.id. There is no way to
// reach another tenant's data through these routes.
//
// CAPABILITIES (FEATURE 1): the command route no longer hard-codes "led". It
// looks up the device's type capabilities and only allows commands that the
// type declares as writable controls -- so the SAME endpoint drives an LED, a
// valve, or anything a future device type adds.
//
// Startup order is deliberate: wait for the DB, then start MQTT (so handlers
// can write to a ready DB), then start listening for HTTP/WebSocket.
// ============================================================================

const http = require('http');
const express = require('express');
const db = require('./db');
const ws = require('./ws');
const mqttClient = require('./mqtt');
const { requireAuth } = require('./auth');

const app = express();
app.use(express.json()); // parse JSON request bodies (for POST command)

// ---- REST routes -----------------------------------------------------------

// Health check -- handy for "is the backend up?" and for load balancers later.
// Intentionally NOT behind auth so a probe doesn't need a key.
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Everything below this line requires a valid API key. requireAuth resolves it
// to a tenant and hangs it on req.tenant; if the key is bad it answers 401 and
// the handler never runs.
app.use('/api', requireAuth);

// "Who am I?" The dashboard calls this right after login to confirm the key is
// valid and to show the client's name in the header.
app.get('/api/me', (req, res) => res.json(req.tenant));

// List every device for THIS tenant (the main dashboard grid).
app.get('/api/devices', async (req, res) => {
  try {
    res.json(await db.listDevices(req.tenant.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent telemetry for one device + metric, used by the detail view's chart.
// The metric is whatever the caller asks for (temperature, flow_rate, ...);
// nothing here is specific to a device type.
app.get('/api/devices/:id/telemetry', async (req, res) => {
  try {
    const metric = req.query.metric || 'temperature';
    const limit = Math.min(Number(req.query.limit) || 60, 500);
    res.json(await db.getTelemetry(req.tenant.id, req.params.id, metric, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set a control on a device. Body: { "control": "led", "value": true }.
//
// This is the capability-driven command path. Instead of accepting only an LED,
// we:
//   1. load the device (and its type's capabilities),
//   2. check the requested control exists, is writable, and the value's type
//      matches what the capability declares,
//   3. publish { <control>: <value> } down to the device.
// The device actuates and reports its real state back over MQTT (closed loop).
app.post('/api/devices/:id/command', async (req, res) => {
  try {
    const { control, value } = req.body || {};

    const device = await db.getDevice(req.tenant.id, req.params.id);
    if (!device) return res.status(404).json({ error: 'device not found' });

    // capabilities comes from the joined device_types row. controls is the list
    // of channels this device type exposes.
    const controls = (device.capabilities && device.capabilities.controls) || [];
    const spec = controls.find((c) => c.key === control);

    if (!spec) {
      return res.status(400).json({ error: `unknown control "${control}" for this device type` });
    }
    if (!spec.writable) {
      return res.status(400).json({ error: `control "${control}" is read-only` });
    }
    if (!valueMatchesType(value, spec.type)) {
      return res.status(400).json({ error: `value for "${control}" must be a ${spec.type}` });
    }

    mqttClient.publishCommand(req.tenant.id, req.params.id, { [control]: value });
    res.json({ ok: true, sent: { [control]: value } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tiny helper: does `value` match the type a control declared in capabilities?
// We only support boolean and number controls for now; add cases here as new
// control types appear.
function valueMatchesType(value, type) {
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'number') return typeof value === 'number';
  return false;
}

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
