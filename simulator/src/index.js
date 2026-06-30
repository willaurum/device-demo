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
// THE TEMPLATE IDEA IT DEMONSTRATES: we define device TYPES (NGI-3000,
// FLOW-200, GPS-100) with different telemetry and controls. The keys here MUST
// match the capabilities seeded in backend/db/init.sql for the same type id --
// that shared vocabulary is the contract between firmware and server. The
// backend never hard-codes any of these, so a brand-new device type is just a
// new entry here plus a row in device_types.
// ============================================================================

const mqtt = require('mqtt');

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';

// ---- tiny math helpers -----------------------------------------------------
const round  = (n) => Math.round(n * 10) / 10;       // one decimal place
const round5 = (n) => Math.round(n * 1e5) / 1e5;     // five decimals (GPS-grade)
const noise  = () => Math.random() - 0.5;            // small +/- jitter

// Metres per degree of latitude (good enough everywhere). Longitude degrees get
// shorter toward the poles, so we scale them by cos(latitude) below.
const METRES_PER_DEG = 111320;

// ---- Device type behaviors -------------------------------------------------
// One entry per device type. Each defines:
//   firmware          version string reported in meta
//   initialControls() the starting control values (state)
//   writable          controls the SERVER may set (must match capabilities)
//   inputs            controls that wander on their own (read-only sensors)
//   init(self)        optional: set up per-device state (baselines, position)
//   telemetry(self)   produces one reading object each tick
//
// These keys (metrics + control names) are the same ones declared in
// device_types.capabilities in init.sql. Keep the two in sync.
const TYPE_DEFS = {
  // Environmental controller: temp + humidity, an LED we drive, a switch we read.
  'NGI-3000': {
    firmware: '1.0.0',
    initialControls: () => ({ led: false, switch: Math.random() > 0.5 }),
    writable: ['led'],
    inputs: ['switch'],
    init: (self) => { self.baseTemp = 18 + Math.random() * 8; },  // each device's own feel
    telemetry: (self) => ({
      temperature: round(self.baseTemp + Math.sin(Date.now() / 20000) * 2 + noise()),
      humidity:    round(45 + Math.cos(Date.now() / 25000) * 10 + noise() * 2),
    }),
  },

  // Water flow meter: flow + pressure, a valve we open/close. Nice detail: flow
  // only happens when the valve is open, so toggling the valve from the
  // dashboard visibly changes the chart -- the closed loop with a non-LED control.
  'FLOW-200': {
    firmware: '2.1.0',
    initialControls: () => ({ valve: false }),
    writable: ['valve'],
    inputs: [],
    init: (self) => { self.baseFlow = 10 + Math.random() * 5; },
    telemetry: (self) => ({
      flow_rate: round(self.controls.valve
        ? self.baseFlow + Math.sin(Date.now() / 15000) * 3 + noise()
        : 0),
      pressure:  round(2.5 + Math.cos(Date.now() / 30000) * 0.4 + noise() * 0.2),
    }),
  },

  // GPS asset tracker (e.g. a delivery vehicle). This is LOCATION telemetry the
  // way real trackers send it: decimal-degree latitude + longitude, plus speed.
  // (Other common wire formats exist -- GeoJSON [lon,lat], or raw NMEA strings
  // from the GPS chip -- but flat decimal degrees over MQTT is the typical IoT
  // shape, and it drops straight into our per-metric telemetry model.)
  //
  // It has NO controls -- a tracker only reports. We simulate movement: the
  // device starts near a point, then each tick drives a short distance along a
  // gently-turning heading, exactly like a vehicle following streets.
  'GPS-100': {
    firmware: '3.0.0',
    initialControls: () => ({}),
    writable: [],
    inputs: [],
    init: (self) => {
      // Start somewhere around downtown San Francisco, scattered a little so the
      // two trackers don't sit on top of each other.
      self.lat = 37.7749 + noise() * 0.04;
      self.lon = -122.4194 + noise() * 0.04;
      self.heading = Math.random() * 2 * Math.PI;   // radians, 0 = due north
      self.speedKmh = 25 + Math.random() * 20;       // a sensible city speed
    },
    telemetry: (self) => {
      // Turn the wheel a little and nudge the speed, so the track looks organic.
      self.heading += (Math.random() - 0.5) * 0.6;
      self.speedKmh = Math.max(0, self.speedKmh + (Math.random() - 0.5) * 10);

      // Advance the position for one 3-second tick. Convert speed to the metres
      // travelled, then metres to degrees (longitude shrinks by cos(latitude)).
      const metres = self.speedKmh * (1000 / 3600) * 3;
      const latRad = (self.lat * Math.PI) / 180;
      self.lat += (metres * Math.cos(self.heading)) / METRES_PER_DEG;
      self.lon += (metres * Math.sin(self.heading)) / (METRES_PER_DEG * Math.cos(latRad));

      return {
        latitude:  round5(self.lat),
        longitude: round5(self.lon),
        speed:     round(self.speedKmh),
      };
    },
  },
};

// ---- The fleet -------------------------------------------------------------
// An explicit list so it's obvious what's running. Ids must be unique (they're
// the device primary key). A mix of types proves the dashboard adapts to
// whatever capabilities each device declares.
const FLEET = [
  { id: 'ngi-001',  type: 'NGI-3000', name: 'Line 1 Controller', location: 'Plant A - Line 1' },
  { id: 'ngi-002',  type: 'NGI-3000', name: 'Line 2 Controller', location: 'Plant A - Line 2' },
  { id: 'ngi-003',  type: 'NGI-3000', name: 'Cold Storage',      location: 'Warehouse North' },
  { id: 'ngi-004',  type: 'NGI-3000', name: 'Dock Sensor',       location: 'Warehouse South' },
  { id: 'flow-001', type: 'FLOW-200', name: 'Coolant Loop',      location: 'Plant A - Utilities' },
  { id: 'flow-002', type: 'FLOW-200', name: 'Sprinkler Main',    location: 'Warehouse Roof' },
  { id: 'gps-001',  type: 'GPS-100',  name: 'Delivery Van 7',    location: 'Metro Route A' },
  { id: 'gps-002',  type: 'GPS-100',  name: 'Service Truck 3',   location: 'Metro Route B' },
];

// ---- One simulated device --------------------------------------------------
function startDevice(spec) {
  const def = TYPE_DEFS[spec.type];

  // The device's own little world: its current controls, plus any per-type
  // state its init() sets up (temperature baseline, GPS position, etc.).
  const self = { controls: def.initialControls() };
  if (def.init) def.init(self);

  // Topic builder: devices/{id}/{channel}.
  const topic = (channel) => `devices/${spec.id}/${channel}`;

  // Connect, registering the Last Will: if we vanish, the broker publishes
  // "offline" (retained) on our status topic for us.
  const client = mqtt.connect(MQTT_URL, {
    clientId: `sim-${spec.id}`,
    will: { topic: topic('status'), payload: 'offline', retain: true, qos: 1 },
  });

  // Publish our current controls, retained so the backend always sees the
  // latest even after a reconnect.
  const publishState = () =>
    client.publish(topic('state'), JSON.stringify(self.controls), { retain: true });

  client.on('connect', () => {
    // 1. Announce who we are (retained).
    client.publish(topic('meta'), JSON.stringify({
      name: spec.name, location: spec.location, type: spec.type, firmware: def.firmware,
    }), { retain: true });

    // 2. We're alive (retained).
    client.publish(topic('status'), 'online', { retain: true });

    // 3. Initial state (retained).
    publishState();

    // 4. Listen for commands aimed at us.
    client.subscribe(topic('cmd'));

    console.log(`[sim] ${spec.id} (${spec.type}) online @ ${spec.location}`);
  });

  // React to a command, e.g. { led: true } or { valve: false }. A real device
  // would drive a GPIO pin here. We only honor controls this type marks
  // writable, then report the real result back (closing the loop).
  client.on('message', (_topic, payload) => {
    try {
      const cmd = JSON.parse(payload.toString());
      let changed = false;
      for (const key of def.writable) {
        if (key in cmd) {
          self.controls[key] = cmd[key];
          changed = true;
          console.log(`[sim] ${spec.id} ${key} -> ${cmd[key]}`);
        }
      }
      if (changed) publishState();
    } catch (_) { /* ignore malformed commands */ }
  });

  // Stream telemetry every 3 seconds.
  setInterval(() => {
    client.publish(topic('telemetry'), JSON.stringify(def.telemetry(self)));
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
          console.log(`[sim] ${spec.id} ${key} -> ${self.controls[key]}`);
        }
      }
      if (changed) publishState();
    }, 7000);
  }
}

console.log(`[sim] starting ${FLEET.length} devices against ${MQTT_URL}`);
FLEET.forEach(startDevice);
