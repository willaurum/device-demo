// ============================================================================
// simulator/src/index.js  --  fake device fleet
// ----------------------------------------------------------------------------
// Spins up DEVICE_COUNT pretend devices. Each one behaves exactly like a real
// embedded node would, speaking the same MQTT "contract" as the backend:
//
//   on connect:   announce meta (retained), publish online (retained),
//                 publish initial state (retained), subscribe to its cmd topic
//   every ~3s:    publish a telemetry reading (temperature, humidity)
//   occasionally: flip its physical switch and republish state
//   on command:   set its LED and republish state (closing the loop)
//
// Because each device sets a Last Will, if this process is killed the broker
// automatically marks every device offline -- just like pulling power on real
// hardware. THIS is the file you'd swap for actual firmware later; nothing
// else in the system would change.
// ============================================================================

const mqtt = require('mqtt');

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const DEVICE_COUNT = Number(process.env.DEVICE_COUNT) || 6;

// Some flavor so the dashboard looks like a real product, not "device 1..6".
const LOCATIONS = ['Plant A - Line 1', 'Plant A - Line 2', 'Plant B - Dock',
                   'Warehouse North', 'Warehouse South', 'R&D Lab'];
const TYPES = ['NGI-3000', 'NGI-3000', 'NGI-1500', 'NGI-3000', 'NGI-1500', 'NGI-3000'];

// Topic builders -- a local copy of the same contract the backend uses.
const t = {
  meta:      (id) => `devices/${id}/meta`,
  telemetry: (id) => `devices/${id}/telemetry`,
  state:     (id) => `devices/${id}/state`,
  status:    (id) => `devices/${id}/status`,
  cmd:       (id) => `devices/${id}/cmd`,
};

// ---- One simulated device --------------------------------------------------
function startDevice(index) {
  const id = `ngi-${String(index + 1).padStart(3, '0')}`;     // ngi-001, ngi-002...
  const location = LOCATIONS[index % LOCATIONS.length];
  const type = TYPES[index % TYPES.length];

  // The device's own little world: its current physical reality.
  const self = {
    led: false,                                  // OUTPUT  we control
    sw: Math.random() > 0.5,                      // INPUT   it senses
    baseTemp: 18 + Math.random() * 8,             // gives each device its own feel
  };

  // Connect, and register the Last Will: if we vanish, the broker publishes
  // "offline" (retained) on our status topic for us.
  const client = mqtt.connect(MQTT_URL, {
    clientId: `sim-${id}`,
    will: { topic: t.status(id), payload: 'offline', retain: true, qos: 1 },
  });

  // Helper: publish our current binary channels, retained so the backend
  // always sees the latest even after a reconnect.
  const publishState = () =>
    client.publish(t.state(id), JSON.stringify({ led: self.led, switch: self.sw }),
                   { retain: true });

  client.on('connect', () => {
    // 1. Announce who we are (retained).
    client.publish(t.meta(id), JSON.stringify({
      name: `Node ${index + 1}`, location, type, firmware: '1.0.0',
    }), { retain: true });

    // 2. We're alive (retained).
    client.publish(t.status(id), 'online', { retain: true });

    // 3. Initial state (retained).
    publishState();

    // 4. Listen for commands aimed at us.
    client.subscribe(t.cmd(id));

    console.log(`[sim] ${id} online @ ${location}`);
  });

  // React to a command from the server, e.g. {"led":true}. A real device would
  // drive a GPIO pin here. We update our LED and report the real result back.
  client.on('message', (topic, payload) => {
    try {
      const cmd = JSON.parse(payload.toString());
      if (typeof cmd.led === 'boolean') {
        self.led = cmd.led;
        console.log(`[sim] ${id} LED -> ${self.led ? 'ON' : 'OFF'}`);
        publishState();          // closes the loop: dashboard shows the truth
      }
    } catch (_) { /* ignore malformed commands */ }
  });

  // Stream telemetry every 3 seconds: a gently wandering temperature plus a
  // correlated humidity, with a little noise so the charts look alive.
  setInterval(() => {
    const temperature = +(self.baseTemp + Math.sin(Date.now() / 20000) * 2
                          + (Math.random() - 0.5)).toFixed(1);
    const humidity = +(45 + Math.cos(Date.now() / 25000) * 10
                       + (Math.random() - 0.5) * 2).toFixed(1);
    client.publish(t.telemetry(id), JSON.stringify({ temperature, humidity }));
  }, 3000);

  // Every so often the physical switch flips (someone toggled it on site).
  setInterval(() => {
    if (Math.random() < 0.3) {
      self.sw = !self.sw;
      console.log(`[sim] ${id} switch -> ${self.sw ? 'ON' : 'OFF'}`);
      publishState();
    }
  }, 7000);
}

console.log(`[sim] starting ${DEVICE_COUNT} devices against ${MQTT_URL}`);
for (let i = 0; i < DEVICE_COUNT; i++) startDevice(i);
