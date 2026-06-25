// ============================================================================
// topics.js  --  the MQTT "contract"
// ----------------------------------------------------------------------------
// This file is the single source of truth for how the server and devices talk.
// Everything is built on a small set of topic names with a clear convention:
//
//     devices/{id}/{channel}
//
// DIRECTION MATTERS. Think of each channel as a one-way pipe:
//
//   device  -> server   meta       (retained)  who the device is
//   device  -> server   telemetry              sensor readings (temp, humidity)
//   device  -> server   state      (retained)  led + switch on/off
//   device  -> server   status     (retained)  "online" / "offline"
//   server  -> device   cmd                    instructions, e.g. {"led":true}
//
// WHY "retained"?  A retained message is stored by the broker as the "last
// known value" for that topic. When the backend (re)connects and subscribes,
// the broker instantly replays the latest meta/state/status for every device,
// so the dashboard is correct immediately instead of waiting for the next
// update. Telemetry is NOT retained -- it's a stream, not a current value.
//
// WHY a separate "status" channel + Last Will?  MQTT lets a client register a
// "Last Will and Testament" when it connects: a message the broker publishes
// automatically if the client drops without saying goodbye. Our devices set
// their will to status="offline". So crashed/unplugged devices show as offline
// for free -- we don't have to poll them.
//
// In a larger codebase you'd publish this file as a shared package so the
// device firmware and the server literally import the same definitions. Here
// the simulator keeps its own copy; just keep the two in sync.
// ============================================================================

// ---- Topic builders (server -> a specific device, or naming one device) ----
const telemetryTopic = (id) => `devices/${id}/telemetry`;
const stateTopic     = (id) => `devices/${id}/state`;
const statusTopic    = (id) => `devices/${id}/status`;
const metaTopic      = (id) => `devices/${id}/meta`;
const cmdTopic       = (id) => `devices/${id}/cmd`;

// ---- Wildcard subscriptions (server listens to ALL devices at once) --------
// "+" matches exactly one topic level, so "devices/+/telemetry" matches
// "devices/ngi-001/telemetry", "devices/ngi-002/telemetry", and so on.
const SUB_TELEMETRY = 'devices/+/telemetry';
const SUB_STATE     = 'devices/+/state';
const SUB_STATUS    = 'devices/+/status';
const SUB_META      = 'devices/+/meta';

// ---- Helpers to read a topic string back apart -----------------------------
// "devices/ngi-001/telemetry" -> id "ngi-001", channel "telemetry"
const deviceIdFromTopic = (topic) => topic.split('/')[1];
const channelFromTopic  = (topic) => topic.split('/')[2];

module.exports = {
  telemetryTopic, stateTopic, statusTopic, metaTopic, cmdTopic,
  SUB_TELEMETRY, SUB_STATE, SUB_STATUS, SUB_META,
  deviceIdFromTopic, channelFromTopic,
};
