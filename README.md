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

> **Upgrading from an older checkout?** The database schema changed (tenants +
> device types). Postgres only runs the init script on a brand-new database, so
> wipe the old volume first: `docker compose down -v && docker compose up --build`.

**Sign in.** The dashboard now asks for an API key — this is the multi-tenancy
gate. Two demo tenants are seeded, and their keys are shown right on the login
screen so you can try each:

| Tenant              | API key              |
|---------------------|----------------------|
| Acme Manufacturing  | `acme-demo-key-001`  |
| Globex Logistics    | `globex-demo-key-002`|

Sign in as Acme and you'll see *only* Acme's devices; sign out and sign in as
Globex to see a completely separate fleet. That isolation is enforced on the
backend — neither tenant's key can read the other's data.

Each tenant has a few simulated devices of **different types**: `NGI-3000`
environmental controllers (temperature + humidity, an LED you set, a switch you
read) and a `FLOW-200` water-flow meter (flow + pressure, a valve you open).
Click a row to open its detail panel and watch the live chart. Toggle a device's
LED or valve — the command travels device-ward over MQTT, the (simulated) device
actuates and reports back, and the row updates from what the device *actually*
did. Open the valve on a flow meter and watch its flow reading rise.

Stop everything with `Ctrl+C`, or `docker compose down` to remove the
containers.

To change or grow the fleet, edit the `FLEET` array in `simulator/src/index.js`
(it lists each device's tenant, id, and type).

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

Everything is built on a handful of topics. The tenant now leads the topic, so
the pattern is `tenants/{tenant}/devices/{id}/{channel}`:

| Topic (per tenant + device)             | Direction        | Retained | Payload                            |
|-----------------------------------------|------------------|----------|------------------------------------|
| `tenants/{t}/devices/{id}/meta`         | device → server  | yes      | `{name, location, type, firmware}` |
| `tenants/{t}/devices/{id}/telemetry`    | device → server  | no       | any metrics, e.g. `{flow_rate: 12}`|
| `tenants/{t}/devices/{id}/state`        | device → server  | yes      | any controls, e.g. `{valve: true}` |
| `tenants/{t}/devices/{id}/status`       | device → server  | yes      | `"online"` / `"offline"`           |
| `tenants/{t}/devices/{id}/cmd`          | server → device  | no       | one control, e.g. `{valve: true}`  |

Note the telemetry/state/cmd payloads are no longer a fixed shape — they carry
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

## Device types & multi-tenancy (the template features)

Two pieces were added to turn this from a fixed demo into a reusable template.

### 1. Capability-driven device types

A device's abilities are now **data, not code**. The `device_types` table
(seeded in `backend/db/init.sql`) describes each model with a `capabilities`
JSON blob in two lists:

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

So onboarding a new kind of device (a vibration sensor, a relay board, …) is
*insert one row* in `device_types` whose metric/control keys match what the
firmware publishes — **no application code changes**. The seeded `FLOW-200`
water-flow meter exists purely to prove this: the app handles it without a
single line that knows what a "valve" is.

### 2. Multi-tenancy + API-key auth

Every device and reading belongs to a **tenant** (a client). Isolation is
enforced end to end:

- **MQTT** topics are namespaced by tenant: `tenants/{tenant}/devices/...`.
- **Database** rows carry `tenant_id`; the device primary key is `(tenant_id,
  id)`, and *every* query in `backend/src/db.js` filters by tenant.
- **API** calls require a key (`Authorization: Bearer <key>`), resolved to a
  tenant in `backend/src/auth.js`; the WebSocket authenticates via `?token=` and
  only receives its own tenant's pushes.
- **Dashboard** shows a login screen and the signed-in tenant's name.

The relevant files to read: `backend/src/auth.js` (the gate), `backend/db/
init.sql` (tenants + device_types tables), and `frontend/src/components/
Login.jsx`.

---

## What's deliberately left out (and why)

- **Broker-level auth** — the Mosquitto broker still allows anonymous
  connections. Tenant isolation today is enforced at the backend (the only thing
  the dashboard talks to), and the broker stays internal. The production
  hardening step is X.509 client certs over mTLS plus per-tenant topic ACLs;
  because topics are already tenant-namespaced, that's a config change, not a
  code change.
- **Real key management** — demo API keys are fixed, readable strings stored in
  plaintext. A real product would issue long random keys, store them hashed, and
  manage them through an admin flow.
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
