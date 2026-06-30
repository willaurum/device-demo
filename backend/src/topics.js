// ============================================================================
// topics.js  --  the MQTT "contract"
// ----------------------------------------------------------------------------
// This file is the single source of truth for how the server and devices talk.
//
// WHAT CHANGED FOR MULTI-TENANCY (FEATURE 2):
// Topics used to be   devices/{id}/{channel}.
// They are now        tenants/{tenant}/devices/{id}/{channel}.
//
// Putting the tenant at the FRONT of the topic means the broker namespaces
// every client's traffic separately, and the backend learns which tenant a
// message belongs to just by reading the topic. A device for "acme" publishes
// under tenants/acme/...; a device for "globex" under tenants/globex/...; they
// can never see or impersonate each other's topics.
//
// DIRECTION MATTERS. Each channel is a one-way pipe:
//
//   device  -> server   meta       (retained)  who the device is
//   device  -> server   telemetry              sensor readings (temp, flow, ...)
//   device  -> server   state      (retained)  current controls (led, valve, ...)
//   device  -> server   status     (retained)  "online" / "offline"
//   server  -> device   cmd                    instructions, e.g. {"led":true}
//
// WHY "retained"?  The broker stores the last retained message per topic and
// replays it to anyone who subscribes later, so the dashboard is correct the
// instant the backend connects. Telemetry is NOT retained -- it's a stream.
//
// WHY a separate "status" channel + Last Will?  A device registers a "Last Will"
// when it connects: a message the broker publishes automatically if the device
// drops without saying goodbye. Our devices set their will to status="offline",
// so crashed/unplugged devices show offline for free -- no polling.
// ============================================================================

// The shared prefix for one device. Everything else builds on this.
const base = (tenant, id) => `tenants/${tenant}/devices/${id}`;

// ---- Topic builders (name one specific device's channel) -------------------
const telemetryTopic = (tenant, id) => `${base(tenant, id)}/telemetry`;
const stateTopic     = (tenant, id) => `${base(tenant, id)}/state`;
const statusTopic    = (tenant, id) => `${base(tenant, id)}/status`;
const metaTopic      = (tenant, id) => `${base(tenant, id)}/meta`;
const cmdTopic       = (tenant, id) => `${base(tenant, id)}/cmd`;

// ---- Wildcard subscriptions (server listens to ALL tenants + devices) ------
// "+" matches exactly one topic level, so "tenants/+/devices/+/telemetry"
// matches every device of every tenant. The backend is the trusted component,
// so it is allowed to listen across tenants; it then tags each message with the
// tenant it came from and keeps the data separate from there on.
const SUB_TELEMETRY = 'tenants/+/devices/+/telemetry';
const SUB_STATE     = 'tenants/+/devices/+/state';
const SUB_STATUS    = 'tenants/+/devices/+/status';
const SUB_META      = 'tenants/+/devices/+/meta';

// ---- Helpers to pull a topic string back apart -----------------------------
// "tenants/acme/devices/ngi-001/telemetry" splits into:
//   [0]="tenants" [1]="acme" [2]="devices" [3]="ngi-001" [4]="telemetry"
const tenantFromTopic   = (topic) => topic.split('/')[1];
const deviceIdFromTopic = (topic) => topic.split('/')[3];
const channelFromTopic  = (topic) => topic.split('/')[4];

module.exports = {
  telemetryTopic, stateTopic, statusTopic, metaTopic, cmdTopic,
  SUB_TELEMETRY, SUB_STATE, SUB_STATUS, SUB_META,
  tenantFromTopic, deviceIdFromTopic, channelFromTopic,
};
