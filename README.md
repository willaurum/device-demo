# Device Console — portable device-management demo

A small but complete device-management system you can run with one command. It
demonstrates the bidirectional control loop (an **LED output** you set, a
**switch input** you read), live **telemetry**, and a device **dashboard** —
built entirely on portable, vendor-neutral pieces so it runs unchanged on your
laptop, on an AWS EC2 VM, or on Azure.

Nothing here is an AWS product. That is the point: this is "AWS as a hosting
provider, not an application platform."

---

## Run it

You need Docker Desktop (or Docker Engine + the Compose plugin). Then:

```bash
docker compose up --build
```

Open the dashboard at **http://localhost** (the compose file maps it to port
80).

> **Upgrading from an older checkout?** The database schema changed. Postgres
> only runs the init script on a brand-new database, so wipe the old volume
> first: `docker compose down -v && docker compose up --build`.

This is a **single-instance** deployment: one customer runs their own copy of
the whole stack, so there's no login — the dashboard loads straight to the
fleet.

The fleet has simulated devices of **different types**: `NGI-3000`
environmental controllers (temperature + humidity, an LED you set, a switch you
read), `FLOW-200` water-flow meters (flow + pressure, a valve you open), and
`GPS-100` asset trackers (a moving vehicle reporting latitude/longitude/speed).
Click a row to open its detail panel and watch the live chart. Toggle a device's
LED or valve — the command travels device-ward over MQTT, the (simulated) device
actuates and reports back, and the row updates from what the device *actually*
did. Open the valve on a flow meter and watch its flow reading rise; open a
tracker and watch its coordinates drift as it drives.

Stop everything with `Ctrl+C`, or `docker compose down` to remove the
containers.

To change or grow the fleet, edit the `FLEET` array in `simulator/src/index.js`
(it lists each device's id, type, name, and location).

---

## How it fits together

```
  mock devices ──┐                        ┌── browser (React dashboard)
                 │   MQTT (pub/sub)        │   HTTP + WebSocket
                 ▼                         ▼
        ┌─────────────────────────────────────────────┐
        │  one VM, running docker compose               │
        │                                               │
        │   Mosquitto ──▶ Node backend ──▶ PostgreSQL   │
        │   (broker)      (REST + WS)      (registry +   │
        │                                   telemetry)   │
        └─────────────────────────────────────────────┘
```

Four services, defined in `docker-compose.yml`:

| Service     | What it is            | Role                                        |
|-------------|-----------------------|---------------------------------------------|
| `broker`    | Eclipse Mosquitto     | MQTT message bus between devices and server |
| `postgres`  | PostgreSQL            | Device registry + telemetry history         |
| `backend`   | Node (Express)        | MQTT client, REST API, WebSocket push       |
| `frontend`  | React via Vite        | The dashboard                               |
| `simulator` | Node                  | Fake device fleet (swap for real hardware)  |

---

## The MQTT contract (read this first)

Everything is built on a handful of topics following `devices/{id}/{channel}`:

| Topic                    | Direction         | Retained | Payload                            |
|--------------------------|-------------------|----------|------------------------------------|
| `devices/{id}/meta`      | device → server   | yes      | `{name, location, type, firmware}` |
| `devices/{id}/telemetry` | device → server   | no       | any metrics, e.g. `{flow_rate: 12}`|
| `devices/{id}/state`     | device → server   | yes      | any controls, e.g. `{valve: true}` |
| `devices/{id}/status`    | device → server   | yes      | `"online"` / `"offline"`           |
| `devices/{id}/cmd`       | server → device   | no       | one control, e.g. `{valve: true}`  |

Note the telemetry/state/cmd payloads are not a fixed shape — they carry
whatever metrics and controls the **device type** declares (see below).

Two ideas worth understanding, because they do a lot of work for free:

- **Retained messages** — the broker stores the last value on a topic and
  replays it to anyone who subscribes later. That is why the dashboard is
  correct the instant the backend connects, instead of blank until the next
  update.
- **Last Will & Testament** — each device tells the broker, at connect time, to
  publish `status = offline` if the device disappears without disconnecting
  cleanly. So crashed or unplugged devices show as offline automatically — no
  polling.

The full contract, with comments, is in `backend/src/topics.js`.

---

## Where to read, in order

1. `docker-compose.yml` — the whole system on one page.
2. `backend/src/topics.js` — the device/server contract.
3. `simulator/src/index.js` — how a device behaves (your future firmware).
4. `backend/src/mqtt.js` — how messages become DB writes + live pushes.
5. `backend/src/server.js` — the REST API surface.
6. `frontend/src/App.jsx` — how the dashboard holds state and stays live.

Every file is commented to explain the *why*, not just the *what*.

---

## Capability-driven device types (what makes it versatile)

The backend is designed to manage **any** telemetry device, not just the ones
in this demo. A device's abilities are **data, not code**. The `device_types`
table (seeded in `backend/db/init.sql`) describes each model with a
`capabilities` JSON blob in two lists:

```jsonc
{
  "telemetry": [ { "metric": "temperature", "label": "Temperature", "unit": "°C" } ],
  "controls":  [ { "key": "led", "label": "LED", "type": "boolean", "writable": true } ]
}
```

- The **backend** uses it to validate commands (`POST /command` only allows
  controls the type marks `writable`).
- The **dashboard** uses it to build columns and buttons. It never names
  `temperature` or `led` anywhere — it reads each device's `latest` (telemetry)
  and `state` (controls) blobs and renders whatever the capabilities declare.
- The **devices** table stores state and telemetry as generic JSON blobs, so no
  schema change is needed for a new kind of device.

So onboarding a new kind of device (a vibration sensor, a relay board, …) is
*insert one row* in `device_types` whose metric/control keys match what the
firmware publishes — **no application code changes**. The seeded `FLOW-200`
water-flow meter and `GPS-100` asset tracker exist purely to prove this: the app
handles a valve and live GPS coordinates without a single line that knows what a
"valve" or a "latitude" is. (Telemetry entries also carry an optional
`precision` hint — `5` for GPS coordinates, `1` for temperature — so the
dashboard shows the right number of decimals.)

Files to read: `backend/db/init.sql` (the `device_types` table + seeds),
`backend/src/server.js` (capability-checked command endpoint), and
`frontend/src/App.jsx` (columns built from capabilities).

> **Single instance per customer.** This stack is meant to be deployed once per
> customer, so there is no login, accounts, or multi-tenancy — every device in
> the database belongs to this one installation. If you ever need to gate access
> to a shared deployment, that's a separate concern you'd add in front of the
> backend (e.g. a reverse proxy with auth), not a rework of this code.

---

## What's deliberately left out (and why)

- **Authentication** — none. A single-instance deployment is expected to sit on
  a private network or behind a reverse proxy that handles access. Add auth
  there if a deployment is internet-facing.
- **Broker hardening** — the Mosquitto broker allows anonymous connections and
  stays internal. The production step is X.509 client certs over mTLS; because
  it's a config change, no application code changes.
- **Firmware / OTA updates** — shown in the UI as a disabled section. The
  portable answer for later is Mender or Eclipse hawkBit.

None of these require rethinking the architecture; they slot into the same
layered, adapter-friendly design.

---

## Deploying this to AWS (the next milestone)

The portability claim is only real if you prove it, and the cheapest proof is:
run this *same* `docker compose up` on an EC2 VM.

Rough steps:

1. Launch one Ubuntu EC2 instance (`t3.small` is plenty for the demo).
2. In its **security group**, allow inbound `22` (SSH, ideally only your IP)
   and `80` (the dashboard). You do **not** need to expose `1883` — the
   simulator runs on the same box, so the broker stays internal.
3. SSH in, install Docker + the Compose plugin, copy this folder up
   (`scp` or `git clone`), and run `docker compose up --build`.
4. Visit `http://<EC2-public-IP>`.

That's it — the application code does not change. Moving to Azure later is the
same exercise on an Azure VM. (For anything beyond a demo you'd put the
dashboard behind a proper web server / TLS and not expose the Vite dev server
directly, but the architecture is unchanged.)
