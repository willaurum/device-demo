-- ============================================================================
-- init.sql  --  database schema + demo seed data
-- ----------------------------------------------------------------------------
-- Postgres runs this file automatically the FIRST time the database is created
-- (because docker-compose mounts it into /docker-entrypoint-initdb.d/).
-- ----------------------------------------------------------------------------
-- This schema now supports the two new template features:
--
--   FEATURE 1 (capabilities)  A "device_types" table describes what each kind
--     of device can DO -- its telemetry metrics and its controls -- as data
--     (JSON), instead of those things being hard-coded in the app. Adding a new
--     kind of device becomes "insert a row here," not "edit five source files."
--
--   FEATURE 2 (multi-tenancy) A "tenants" table gives every client their own
--     isolated space. Every device and every reading belongs to exactly one
--     tenant, and the backend only ever returns data for the tenant whose API
--     key was presented. That is what lets one deployment serve many clients.
-- ============================================================================


-- ============================================================================
-- TENANTS  (FEATURE 2)
-- ----------------------------------------------------------------------------
-- A "tenant" is one client/organization. Each has a secret API key. The
-- dashboard and any API caller must present this key; the backend looks it up
-- here to decide WHICH tenant's data they are allowed to see.
--
-- In a real product these keys would be long random strings, stored hashed, and
-- created through an admin flow. For the demo we use readable fixed keys so you
-- can log in by hand and clearly see the isolation working.
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id       TEXT PRIMARY KEY,          -- short slug, e.g. "acme"
    name     TEXT NOT NULL,             -- friendly name shown in the dashboard
    api_key  TEXT UNIQUE NOT NULL       -- the secret a caller presents to log in
);

-- Two demo tenants so you can SEE the isolation: log in with one key and you
-- only ever see that client's devices.
INSERT INTO tenants (id, name, api_key) VALUES
    ('acme',   'Acme Manufacturing', 'acme-demo-key-001'),
    ('globex', 'Globex Logistics',   'globex-demo-key-002')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- DEVICE TYPES  (FEATURE 1)
-- ----------------------------------------------------------------------------
-- This is the heart of "manage anything." A device TYPE declares its
-- capabilities as JSON, in two lists:
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


-- ============================================================================
-- DEVICES  (the registry)
-- ----------------------------------------------------------------------------
-- One row per device: who it is + its latest known state. Two big changes from
-- the original demo:
--
--   * tenant_id   every device belongs to a tenant. The primary key is now
--                 (tenant_id, id), so two different clients can BOTH have a
--                 device called "ngi-001" without colliding.
--
--   * state/latest are now generic JSON blobs instead of fixed led_state /
--     switch_state / temperature columns. "state" holds whatever controls the
--     device reports ({"led":true,"switch":false}); "latest" holds the most
--     recent value of each telemetry metric ({"temperature":21.4,...}). This is
--     what lets one table store ANY device type without schema changes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS devices (
    tenant_id     TEXT        NOT NULL REFERENCES tenants(id),
    id            TEXT        NOT NULL,         -- device id, unique within a tenant
    name          TEXT,                         -- friendly name shown on dashboard
    location      TEXT,                         -- where the device physically lives
    type          TEXT        REFERENCES device_types(id),  -- links to capabilities
    firmware      TEXT,                         -- firmware version string

    online        BOOLEAN     DEFAULT FALSE,    -- is the device currently connected?

    -- Generic "latest known" blobs (see the note above). Default to empty
    -- objects so we can always merge new keys into them with the || operator.
    state         JSONB       DEFAULT '{}'::jsonb,  -- current controls: {"led":true,...}
    latest        JSONB       DEFAULT '{}'::jsonb,  -- latest telemetry: {"temperature":21,...}

    config        JSONB       DEFAULT '{}'::jsonb,  -- arbitrary per-device config (unused yet)
    last_seen     TIMESTAMPTZ,                      -- last time we heard anything from it

    PRIMARY KEY (tenant_id, id)
);


-- ============================================================================
-- TELEMETRY HISTORY
-- ----------------------------------------------------------------------------
-- Every sensor reading becomes one row ("long" format: one metric per row).
-- This was already generic in the original demo -- we only add tenant_id so
-- history is isolated per client too, and so the foreign key matches the new
-- composite device primary key.
-- ============================================================================
CREATE TABLE IF NOT EXISTS telemetry (
    id        BIGSERIAL   PRIMARY KEY,
    tenant_id TEXT        NOT NULL,
    device_id TEXT        NOT NULL,
    metric    TEXT,                          -- e.g. "temperature", "flow_rate"
    value     DOUBLE PRECISION,
    ts        TIMESTAMPTZ DEFAULT now(),      -- when the reading was recorded

    -- Point at the composite device key so a reading can't belong to a device
    -- that doesn't exist in that tenant.
    FOREIGN KEY (tenant_id, device_id) REFERENCES devices (tenant_id, id)
);

-- Index that makes "recent readings for device X, metric Y" fast -- exactly
-- what the telemetry chart asks for. tenant_id leads so each client's slice is
-- contiguous.
CREATE INDEX IF NOT EXISTS idx_telemetry_lookup
    ON telemetry (tenant_id, device_id, metric, ts DESC);
