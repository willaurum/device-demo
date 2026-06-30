// ============================================================================
// simulator/src/index.js  --  fake device fleet
// ----------------------------------------------------------------------------
// Spins up a set of pretend devices. Each one behaves like a real embedded node
// would, speaking the same MQTT "contract" as the backend:
//
//   on connect:   announce meta (retained), publish online (retained),
//                 publish initial state (retained), subscribe to its cmd topic
//   every ~3s:    publish a telemetry reading
//   occasionally: flip an input (e.g. a switch) and republish state
//   on command:   set the named control and republish state (closing the loop)
//
// THIS IS THE FILE YOU'D SWAP FOR REAL FIRMWARE later; nothing else changes.
//
// TWO THINGS DEMONSTRATED FOR THE TEMPLATE:
//
//   FEATURE 1 (capabilities)  We define device TYPES (NGI-3000, FLOW-200) with
//     different telemetry and controls. The keys here MUST match the
//     capabilities seeded in backend/db/init.sql for the same type id -- that
//     shared vocabulary is the contract between firmware and server.
//
//   FEATURE 2 (multi-tenancy) Every device belongs to a tenant and publishes
//     under tenants/{tenant}/devices/{id}/... . The tenant ids below MUST match
//     rows in the tenants table in init.sql. Notice "acme" and "globex" can
//     both own a device called "ngi-001" without any conflict.
// ============================================================================

const mqtt = require("mqtt");

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";

// ---- tiny math helpers -----------------------------------------------------
const round = (n) => Math.round(n * 10) / 10; // one decimal place
const noise = () => Math.random() - 0.5; // small +/- jitter

// ---- Device type behaviors -------------------------------------------------
// One entry per device type. Each defines:
//   firmware          version string reported in meta
//   initialControls() the starting control values (state)
//   writable          controls the SERVER may set (must match capabilities)
//   inputs            controls that wander on their own (read-only sensors)
//   telemetry(self)   produces one reading object each tick
//
// These keys (metrics + control names) are the same ones declared in
// device_types.capabilities in init.sql. Keep the two in sync.
const TYPE_DEFS = {
  // Environmental controller: temp + humidity, an LED we drive, a switch we read.
  "NGI-3000": {
    firmware: "1.0.0",
    initialControls: () => ({ led: false, switch: Math.random() > 0.5 }),
    writable: ["led"],
    inputs: ["switch"],
    telemetry: (self) => ({
      temperature: round(
        self.base.temp + Math.sin(Date.now() / 20000) * 2 + noise(),
      ),
      humidity: round(45 + Math.cos(Date.now() / 25000) * 10 + noise() * 2),
    }),
  },

  // Water flow meter: flow + pressure, a valve we open/close. Nice detail: flow
  // only happens when the valve is open, so toggling the valve from the
  // dashboard visibly changes the chart -- the closed loop with a non-LED control.
  "FLOW-200": {
    firmware: "2.1.0",
    initialControls: () => ({ valve: false }),
    writable: ["valve"],
    inputs: [],
    telemetry: (self) => ({
      flow_rate: round(
        self.controls.valve
          ? self.base.flow + Math.sin(Date.now() / 15000) * 3 + noise()
          : 0,
      ),
      pressure: round(2.5 + Math.cos(Date.now() / 30000) * 0.4 + noise() * 0.2),
    }),
  },
};

// ---- The fleet -------------------------------------------------------------
// An explicit list so it's obvious what's running and who owns what. Both
// tenants exist in init.sql; both deliberately reuse the id "ngi-001" to show
// that ids only need to be unique WITHIN a tenant.
const FLEET = [
  {
    tenant: "acme",
    id: "ngi-001",
    type: "NGI-3000",
    name: "Line 1 Controller",
    location: "Plant A - Line 1",
  },
  {
    tenant: "acme",
    id: "ngi-002",
    type: "NGI-3000",
    name: "Line 2 Controller",
    location: "Plant A - Line 2",
  },
  {
    tenant: "acme",
    id: "flow-001",
    type: "FLOW-200",
    name: "Coolant Loop",
    location: "Plant A - Utilities",
  },
  {
    tenant: "globex",
    id: "ngi-001",
    type: "NGI-3000",
    name: "Dock Sensor",
    location: "Warehouse North",
  },
  {
    tenant: "globex",
    id: "ngi-002",
    type: "NGI-3000",
    name: "Cold Storage",
    location: "Warehouse South",
  },
  {
    tenant: "globex",
    id: "flow-001",
    type: "FLOW-200",
    name: "Sprinkler Main",
    location: "Warehouse Roof",
  },
];

// ---- One simulated device --------------------------------------------------
function startDevice(spec) {
  const def = TYPE_DEFS[spec.type];

  // The device's own little world: its current controls + per-device baselines
  // so each one feels slightly different.
  const self = {
    controls: def.initialControls(),
    base: { temp: 18 + Math.random() * 8, flow: 10 + Math.random() * 5 },
  };

  // Topic builder including the tenant: tenants/{tenant}/devices/{id}/{channel}.
  const topic = (channel) =>
    `tenants/${spec.tenant}/devices/${spec.id}/${channel}`;

  // Connect, registering the Last Will: if we vanish, the broker publishes
  // "offline" (retained) on our status topic for us.
  const client = mqtt.connect(MQTT_URL, {
    clientId: `sim-${spec.tenant}-${spec.id}`,
    will: { topic: topic("status"), payload: "offline", retain: true, qos: 1 },
  });

  // Publish our current controls, retained so the backend always sees the
  // latest even after a reconnect.
  const publishState = () =>
    client.publish(topic("state"), JSON.stringify(self.controls), {
      retain: true,
    });

  client.on("connect", () => {
    // 1. Announce who we are (retained).
    client.publish(
      topic("meta"),
      JSON.stringify({
        name: spec.name,
        location: spec.location,
        type: spec.type,
        firmware: def.firmware,
      }),
      { retain: true },
    );

    // 2. We're alive (retained).
    client.publish(topic("status"), "online", { retain: true });

    // 3. Initial state (retained).
    publishState();

    // 4. Listen for commands aimed at us.
    client.subscribe(topic("cmd"));

    console.log(
      `[sim] ${spec.tenant}/${spec.id} (${spec.type}) online @ ${spec.location}`,
    );
  });

  // React to a command, e.g. { led: true } or { valve: false }. A real device
  // would drive a GPIO pin here. We only honor controls this type marks
  // writable, then report the real result back (closing the loop).
  client.on("message", (_topic, payload) => {
    try {
      const cmd = JSON.parse(payload.toString());
      let changed = false;
      for (const key of def.writable) {
        if (key in cmd) {
          self.controls[key] = cmd[key];
          changed = true;
          console.log(`[sim] ${spec.tenant}/${spec.id} ${key} -> ${cmd[key]}`);
        }
      }
      if (changed) publishState();
    } catch (_) {
      /* ignore malformed commands */
    }
  });

  // Stream telemetry every 3 seconds.
  setInterval(() => {
    client.publish(topic("telemetry"), JSON.stringify(def.telemetry(self)));
  }, 3000);

  // Every so often, wander any "input" controls (like a switch someone flipped
  // on site) and republish state. Types with no inputs skip this entirely.
  if (def.inputs.length > 0) {
    setInterval(() => {
      let changed = false;
      for (const key of def.inputs) {
        if (Math.random() < 0.3) {
          self.controls[key] = !self.controls[key];
          changed = true;
          console.log(
            `[sim] ${spec.tenant}/${spec.id} ${key} -> ${self.controls[key]}`,
          );
        }
      }
      if (changed) publishState();
    }, 7000);
  }
}

console.log(`[sim] starting ${FLEET.length} devices against ${MQTT_URL}`);
FLEET.forEach(startDevice);
