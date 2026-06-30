// ============================================================================
// mqtt.js  --  the backend's MQTT client
// ----------------------------------------------------------------------------
// This is where device messages turn into database writes and live dashboard
// updates. The flow for every incoming message is the same four steps:
//
//   1. figure out which device + channel it is (from the topic)
//   2. write the new value to Postgres
//   3. read the updated device row back
//   4. broadcast that row to every open dashboard over the WebSocket
//
// It also exposes publishCommand(), which the REST API calls to send an
// instruction DOWN to a device (the only server -> device direction).
// ============================================================================

const mqtt = require('mqtt');
const db = require('./db');
const ws = require('./ws');
const T = require('./topics');

let client;

function start() {
  // The mqtt library reconnects automatically if the broker restarts, so we
  // don't need our own retry loop here (unlike the DB).
  client = mqtt.connect(process.env.MQTT_URL);

  client.on('connect', () => {
    console.log('[mqtt] connected to broker');
    // Subscribe to every device's meta/telemetry/state/status using wildcards.
    client.subscribe([T.SUB_META, T.SUB_TELEMETRY, T.SUB_STATE, T.SUB_STATUS]);
  });

  client.on('message', handleMessage);
  client.on('error', (err) => console.error('[mqtt] error:', err.message));
}

// Called for EVERY message on any subscribed topic.
async function handleMessage(topic, payloadBuffer) {
  const id = T.deviceIdFromTopic(topic);
  const channel = T.channelFromTopic(topic);
  const payload = payloadBuffer.toString(); // bytes -> string

  try {
    if (channel === 'status') {
      // Plain text "online"/"offline" (also our Last Will value).
      await db.setOnline(id, payload === 'online');

    } else if (channel === 'meta') {
      // JSON: who the device is.
      const meta = JSON.parse(payload);
      await db.upsertMeta(id, meta);

    } else if (channel === 'state') {
      // JSON of the device's controls, e.g. { led: true, switch: false } or
      // { valve: true }. We store the whole object as-is -- we don't need to
      // know which controls a given device type has; the DB merges the keys.
      const controls = JSON.parse(payload);
      await db.setState(id, controls);

    } else if (channel === 'telemetry') {
      // JSON: { temperature: 21.4, humidity: 50, ... } -- any set of metrics.
      // Store each key/value as its own telemetry row, and stream each point live.
      const reading = JSON.parse(payload);
      for (const [metric, value] of Object.entries(reading)) {
        await db.insertTelemetry(id, metric, value);
        ws.broadcast({ type: 'telemetry', id, metric, value, ts: Date.now() });
      }
    }

    // Steps 3 + 4: read the fresh row and push it to all dashboards. Doing
    // this after every message keeps the frontend logic dead simple -- it just
    // replaces its copy of the device whenever one arrives.
    const device = await db.getDevice(id);
    if (device) ws.broadcast({ type: 'device', device });

  } catch (err) {
    // A malformed payload should never take down the whole backend.
    console.error(`[mqtt] failed to handle ${topic}: ${err.message}`);
  }
}

// ---- The one server -> device direction ------------------------------------
// The REST API calls this when a user toggles a control. We publish to the
// device's private "cmd" topic; the device is subscribed to it, actuates, and
// republishes its "state" -- which comes back through the handler above and
// updates the dashboard. That round trip is the "closed loop": the dashboard
// shows what the device ACTUALLY did, not just what we asked. `command` is a
// plain object like { led: true } or { valve: false }.
function publishCommand(id, command) {
  client.publish(T.cmdTopic(id), JSON.stringify(command));
}

module.exports = { start, publishCommand };
