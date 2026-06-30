-- ============================================================================
-- init.sql  --  database schema + seed data
-- ----------------------------------------------------------------------------
-- Postgres runs this file automatically the FIRST time the database is created
-- (because docker-compose mounts it into /docker-entrypoint-initdb.d/).
--
-- IMPORTANT FOR THE INTERN: this file ONLY runs on a brand-new database. If you
-- already ran the project before a schema change, Postgres will NOT re-run it.
-- To pick up a new schema you must wipe the old database volume first:
--
--     docker compose down -v        (the -v deletes the data volume)
--     docker compose up --build
--
-- ----------------------------------------------------------------------------
-- DESIGN NOTE: this is a SINGLE-INSTANCE deployment. Each customer runs their
-- own copy of the whole stack, so there is no notion of "tenants" or accounts
-- here -- every device in this database belongs to this one installation.
--
-- The one big idea that keeps the backend versatile is CAPABILITIES: a
-- "device_types" table describes what each kind of device can DO -- its
-- telemetry metrics and its controls -- as data (JSON), instead of those things
-- being hard-coded in the app. Adding a new kind of telemetry device becomes
-- "insert a row here," not "edit five source files."
-- ============================================================================


-- ============================================================================
-- DEVICE TYPES  (the capability model)
-- ----------------------------------------------------------------------------
-- This is the heart of "manage any telemetry device." A device TYPE declares
-- its capabilities as JSON, in two lists:
--
--   telemetry  the numeric readings the device streams. Each entry:
--                { "metric": "temperature", "label": "Temperature", "unit": "°C" }
--
--   controls   the on/off (or numeric) channels the device exposes. Each entry:
--                { "key": "led", "label": "LED", "type": "boolean", "writable": true }
--              "writable: true"  -> the server may SET it (an output we command)
--              "writable: false" -> read-only (an input the device reports)
--
-- The backend reads this to validate commands, and the dashboard reads it to
-- decide which columns and buttons to draw. So a brand-new device type needs NO
-- code change -- just a row here whose keys match what the firmware publishes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS device_types (
    id            TEXT PRIMARY KEY,          -- model id, e.g. "NGI-3000"
    name          TEXT,                      -- human description of the model
    capabilities  JSONB NOT NULL             -- the { telemetry, controls } shape above
);

-- An environmental controller: temperature + humidity, an LED we drive, and a
-- physical switch we can only read.
INSERT INTO device_types (id, name, capabilities) VALUES
    ('NGI-3000', 'Environmental controller', '{
        "telemetry": [
            { "metric": "temperature", "label": "Temperature", "unit": "°C" },
            { "metric": "humidity",    "label": "Humidity",    "unit": "%" }
        ],
        "controls": [
            { "key": "led",    "label": "LED",    "type": "boolean", "writable": true  },
            { "key": "switch", "label": "Switch", "type": "boolean", "writable": false }
        ]
    }'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- A completely DIFFERENT kind of device, to prove the point: a water-flow meter
-- with flow + pressure readings and a valve we open/close. Notice the app never
-- mentions "valve" or "flow" anywhere -- it all comes from this row.
INSERT INTO device_types (id, name, capabilities) VALUES
    ('FLOW-200', 'Water flow meter', '{
        "telemetry": [
            { "metric": "flow_rate", "label": "Flow",     "unit": "L/min" },
            { "metric": "pressure",  "label": "Pressure", "unit": "bar" }
        ],
        "controls": [
            { "key": "valve", "label": "Valve", "type": "boolean", "writable": true }
        ]
    }'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- A GPS asset tracker (e.g. a vehicle). This shows LOCATION telemetry, which
-- real GPS devices send as decimal-degree latitude + longitude (often with
-- speed/heading) -- here, plain numeric metrics just like any other reading.
-- It has NO controls: it's a read-only sensor, which the dashboard handles fine.
--
-- Note the "precision" hint: coordinates need ~5 decimal places (~1 metre),
-- unlike temperature where 1 decimal is plenty. The dashboard reads this to
-- decide how many decimals to display; the stored value is always full double
-- precision regardless.
INSERT INTO device_types (id, name, capabilities) VALUES
    ('GPS-100', 'Asset tracker', '{
        "telemetry": [
            { "metric": "latitude",  "label": "Latitude",  "unit": "°",    "precision": 5 },
            { "metric": "longitude", "label": "Longitude", "unit": "°",    "precision": 5 },
            { "metric": "speed",     "label": "Speed",     "unit": "km/h", "precision": 1 }
        ],
        "controls": []
    }'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- DEVICES  (the registry)
-- ----------------------------------------------------------------------------
-- One row per device: who it is + its latest known state. The state/latest
-- columns are generic JSON blobs instead of fixed led_state / switch_state /
-- temperature columns. "state" holds whatever controls the device reports
-- ({"led":true,"switch":false}); "latest" holds the most recent value of each
-- telemetry metric ({"temperature":21.4,...}). That is what lets one table
-- store ANY device type without schema changes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS devices (
    id            TEXT PRIMARY KEY,             -- unique device id, e.g. "ngi-001"
    name          TEXT,                         -- friendly name shown on dashboard
    location      TEXT,                         -- where the device physically lives
    type          TEXT REFERENCES device_types(id),  -- links to capabilities
    firmware      TEXT,                         -- firmware version string

    online        BOOLEAN     DEFAULT FALSE,    -- is the device currently connected?

    -- Generic "latest known" blobs (see the note above). Default to empty
    -- objects so we can always merge new keys into them with the || operator.
    state         JSONB       DEFAULT '{}'::jsonb,  -- current controls: {"led":true,...}
    latest        JSONB       DEFAULT '{}'::jsonb,  -- latest telemetry: {"temperature":21,...}

    config        JSONB       DEFAULT '{}'::jsonb,  -- arbitrary per-device config (unused yet)
    last_seen     TIMESTAMPTZ                       -- last time we heard anything from it
);


-- ============================================================================
-- TELEMETRY HISTORY
-- ----------------------------------------------------------------------------
-- Every sensor reading becomes one row ("long" format: one metric per row).
-- Storing it this way keeps it flexible: add a new sensor type later and
-- nothing here changes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS telemetry (
    id        BIGSERIAL   PRIMARY KEY,
    device_id TEXT        REFERENCES devices(id),
    metric    TEXT,                          -- e.g. "temperature", "flow_rate"
    value     DOUBLE PRECISION,
    ts        TIMESTAMPTZ DEFAULT now()      -- when the reading was recorded
);

-- Index that makes "recent readings for device X, metric Y" fast -- exactly
-- what the telemetry chart asks for.
CREATE INDEX IF NOT EXISTS idx_telemetry_lookup
    ON telemetry (device_id, metric, ts DESC);
