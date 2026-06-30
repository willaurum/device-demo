// ============================================================================
// db.js  --  everything that touches Postgres
// ----------------------------------------------------------------------------
// All SQL lives in this one file so the rest of the app never writes queries
// inline. If you ever swapped Postgres for something else, THIS is the only
// file that would change -- the "adapter" idea, applied in miniature.
//
// THE KEY IDEA FOR THE INTERN: device state and telemetry are stored as generic
// JSON blobs ("state" and "latest"), not fixed columns. So we never name "led"
// or "temperature" in SQL -- any device type just works. That's what makes this
// backend usable for any telemetry device without code changes.
// ============================================================================

const { Pool } = require('pg');

// A connection pool reuses a small set of DB connections instead of opening a
// new one per query. DATABASE_URL comes from docker-compose.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---- Startup readiness -----------------------------------------------------
// docker-compose starts Postgres and the backend at roughly the same time, but
// Postgres needs a few seconds to accept connections. So we retry the first
// connection instead of crashing. A common, important pattern.
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
// Each uses INSERT ... ON CONFLICT ("upsert") on the device id: if the row
// doesn't exist yet we create it, otherwise we update it. That means messages
// can arrive in any order and we never crash on a missing row.

// Make sure a device row exists before we attach data to it. Used by telemetry,
// which has a foreign key to devices -- if a reading somehow arrives before the
// device's meta/state, this stops the insert from failing.
async function ensureDevice(id) {
  await pool.query(
    `INSERT INTO devices (id, last_seen)
     VALUES ($1, now())
     ON CONFLICT (id) DO NOTHING`,
    [id]
  );
}

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

// Device reported its controls. `controls` is an arbitrary object such as
// { led: true, switch: false } or { valve: true } -- we don't care which keys.
// The `||` operator MERGES the new keys into the existing JSON, so a device can
// report just the one channel that changed and the rest is preserved.
async function setState(id, controls) {
  await pool.query(
    `INSERT INTO devices (id, state, last_seen)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE
       SET state = devices.state || EXCLUDED.state, last_seen = now()`,
    [id, JSON.stringify(controls)]
  );
}

// One sensor reading. Stores the point in the history table AND updates the
// device's "latest" blob so the dashboard list can show the current value
// without scanning history. Note we never hard-code metric names: whatever
// metric the device sent becomes a key in `latest`.
async function insertTelemetry(id, metric, value) {
  await ensureDevice(id);                    // satisfy the telemetry foreign key
  await pool.query(
    `INSERT INTO telemetry (device_id, metric, value) VALUES ($1, $2, $3)`,
    [id, metric, value]
  );
  // Merge { metric: value } into the device's latest-values object.
  await pool.query(
    `UPDATE devices
        SET latest = latest || jsonb_build_object($2::text, to_jsonb($3::double precision)),
            last_seen = now()
      WHERE id = $1`,
    [id, metric, value]
  );
}

// ---- Reads (driven by the dashboard / REST API) ---------------------------
// We LEFT JOIN device_types so each device row carries its type's
// `capabilities` -- that's how the frontend knows which columns/controls to
// draw without us hard-coding them here.

async function getDevice(id) {
  const { rows } = await pool.query(
    `SELECT d.*, dt.capabilities
       FROM devices d
       LEFT JOIN device_types dt ON dt.id = d.type
      WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Every device. Powers the main dashboard grid.
async function listDevices() {
  const { rows } = await pool.query(
    `SELECT d.*, dt.capabilities
       FROM devices d
       LEFT JOIN device_types dt ON dt.id = d.type
      ORDER BY d.id`
  );
  return rows;
}

// Recent readings for one device + metric, oldest-first so a chart can draw
// them left to right.
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
  ensureDevice, upsertMeta, setOnline, setState, insertTelemetry,
  getDevice, listDevices, getTelemetry,
};
