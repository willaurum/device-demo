-- ============================================================================
-- init.sql  --  database schema
-- ----------------------------------------------------------------------------
-- Postgres runs this file automatically the FIRST time the database is created
-- (because docker-compose mounts it into /docker-entrypoint-initdb.d/).
--
-- Two tables:
--   devices    one row per device: who it is + its latest known state
--   telemetry  an append-only log of sensor readings over time
-- ============================================================================

-- ---- DEVICE REGISTRY -------------------------------------------------------
-- This is the "device registry" from the architecture notes. It is deliberately
-- a plain table, not a cloud-specific device registry, so it travels with you.
CREATE TABLE IF NOT EXISTS devices (
    id            TEXT PRIMARY KEY,          -- unique device id, e.g. "ngi-001"
    name          TEXT,                      -- friendly name shown on dashboard
    location      TEXT,                      -- where the device physically lives
    type          TEXT,                      -- model/category, e.g. "NGI-3000"
    firmware      TEXT,                      -- firmware version string

    -- "Latest known" status. We keep these denormalized on the device row so
    -- the dashboard's main list is a single fast query.
    online        BOOLEAN     DEFAULT FALSE, -- is the device currently connected?
    led_state     BOOLEAN     DEFAULT FALSE, -- the OUTPUT we control (LED on/off)
    switch_state  BOOLEAN     DEFAULT FALSE, -- the INPUT we read (switch on/off)

    config        JSONB       DEFAULT '{}'::jsonb,  -- arbitrary per-device config
    last_seen     TIMESTAMPTZ                -- last time we heard anything from it
);

-- ---- TELEMETRY HISTORY -----------------------------------------------------
-- Every sensor reading becomes one row. Storing it "long" (one metric per row)
-- keeps it flexible: add a new sensor type later and nothing here changes.
CREATE TABLE IF NOT EXISTS telemetry (
    id        BIGSERIAL PRIMARY KEY,
    device_id TEXT        REFERENCES devices(id),
    metric    TEXT,                          -- e.g. "temperature", "humidity"
    value     DOUBLE PRECISION,
    ts        TIMESTAMPTZ DEFAULT now()      -- when the reading was recorded
);

-- Index that makes "give me the recent readings for device X" fast -- which is
-- exactly what the telemetry chart asks for.
CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts
    ON telemetry (device_id, metric, ts DESC);
