// ============================================================================
// db.js  --  everything that touches Postgres
// ----------------------------------------------------------------------------
// We keep all SQL in this one file so the rest of the app never writes queries
// inline. If you ever swapped Postgres for something else, THIS is the only
// file that would change -- the "adapter" idea from the architecture notes,
// applied in miniature.
// ============================================================================

const { Pool } = require('pg');

// A connection pool reuses a small set of DB connections instead of opening a
// new one per query. DATABASE_URL comes from docker-compose.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---- Startup readiness -----------------------------------------------------
// docker-compose starts Postgres and the backend at roughly the same time, but
// Postgres needs a few seconds to accept connections. So we retry the first
// connection instead of crashing. This is a common, important pattern.
async function waitForDb(retries = 15, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');           // cheapest possible "are you up?"
      console.log('[db] connected to Postgres');
      return;
    } catch (err) {
      console.log(`[db] not ready (attempt ${attempt}/${retries}): ${err.code || err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('[db] could not connect to Postgres after several retries');
}

// ---- Writes (driven by incoming MQTT messages) ----------------------------
// Each uses INSERT ... ON CONFLICT ("upsert"): if the device row doesn't exist
// yet we create it, otherwise we update it. That means messages can arrive in
// any order -- a telemetry reading before the device's meta, say -- and we
// never crash on a missing row.

// Device announced who it is.
async function upsertMeta(id, { name, location, type, firmware }) {
  await pool.query(
    `INSERT INTO devices (id, name, location, type, firmware, last_seen)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           location = EXCLUDED.location,
           type = EXCLUDED.type,
           firmware = EXCLUDED.firmware,
           last_seen = now()`,
    [id, name, location, type, firmware]
  );
}

// Device connected/disconnected (online flag).
async function setOnline(id, online) {
  await pool.query(
    `INSERT INTO devices (id, online, last_seen)
     VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE
       SET online = EXCLUDED.online, last_seen = now()`,
    [id, online]
  );
}

// Device reported its binary channels (LED output + switch input).
async function setState(id, { led, sw }) {
  await pool.query(
    `INSERT INTO devices (id, led_state, switch_state, last_seen)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE
       SET led_state = EXCLUDED.led_state,
           switch_state = EXCLUDED.switch_state,
           last_seen = now()`,
    [id, led, sw]
  );
}

// One sensor reading. Also bumps last_seen on the device.
async function insertTelemetry(id, metric, value) {
  await pool.query(
    `INSERT INTO telemetry (device_id, metric, value) VALUES ($1, $2, $3)`,
    [id, metric, value]
  );
  await pool.query(`UPDATE devices SET last_seen = now() WHERE id = $1`, [id]);
}

// ---- Reads (driven by the dashboard / REST API) ---------------------------

// One device row, with its latest temperature + humidity folded in. The
// scalar sub-selects keep this readable; at demo scale it is plenty fast.
async function getDevice(id) {
  const { rows } = await pool.query(
    `SELECT d.*,
            (SELECT value FROM telemetry t
              WHERE t.device_id = d.id AND t.metric = 'temperature'
              ORDER BY ts DESC LIMIT 1) AS temperature,
            (SELECT value FROM telemetry t
              WHERE t.device_id = d.id AND t.metric = 'humidity'
              ORDER BY ts DESC LIMIT 1) AS humidity
       FROM devices d
      WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Every device, newest-seen first. Powers the main dashboard grid.
async function listDevices() {
  const { rows } = await pool.query(
    `SELECT d.*,
            (SELECT value FROM telemetry t
              WHERE t.device_id = d.id AND t.metric = 'temperature'
              ORDER BY ts DESC LIMIT 1) AS temperature,
            (SELECT value FROM telemetry t
              WHERE t.device_id = d.id AND t.metric = 'humidity'
              ORDER BY ts DESC LIMIT 1) AS humidity
       FROM devices d
      ORDER BY d.id`
  );
  return rows;
}

// Recent readings for one device + metric, oldest-first so a chart can just
// draw them left to right.
async function getTelemetry(id, metric, limit = 60) {
  const { rows } = await pool.query(
    `SELECT value, ts FROM telemetry
      WHERE device_id = $1 AND metric = $2
      ORDER BY ts DESC LIMIT $3`,
    [id, metric, limit]
  );
  return rows.reverse();
}

module.exports = {
  waitForDb,
  upsertMeta, setOnline, setState, insertTelemetry,
  getDevice, listDevices, getTelemetry,
};
