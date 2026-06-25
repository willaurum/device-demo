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

Open the dashboard at **http://localhost:5173**.

You should see six simulated devices appear within a few seconds, streaming
temperature and humidity, with their switch state changing on its own. Click a
card to open its detail panel and watch the live chart. Click **LED output** to
turn a device's LED on or off — the command travels device-ward over MQTT, the
(simulated) device actuates and reports back, and the card updates from what the
device *actually* did.

Stop everything with `Ctrl+C`, or `docker compose down` to remove the
containers.

To simulate a bigger fleet, raise the device count in `docker-compose.yml`:

```yaml
  simulator:
    environment:
      DEVICE_COUNT: "100"   # or 1000 — MQTT and a single broker handle it easily
```

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

| Topic                    | Direction         | Retained | Payload                       |
|--------------------------|-------------------|----------|-------------------------------|
| `devices/{id}/meta`      | device → server   | yes      | `{name, location, type, firmware}` |
| `devices/{id}/telemetry` | device → server   | no       | `{temperature, humidity}`     |
| `devices/{id}/state`     | device → server   | yes      | `{led, switch}`               |
| `devices/{id}/status`    | device → server   | yes      | `"online"` / `"offline"`      |
| `devices/{id}/cmd`       | server → device   | no       | `{led: true}`                 |

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

## What's deliberately left out (and why)

Matching the "baby steps" scope from the meeting:

- **Firmware / OTA updates** — shown in the UI as a disabled section. The
  portable answer for later is Mender or Eclipse hawkBit, neither of which
  changes the topic design above.
- **Authentication** — the broker allows anonymous connections for the demo.
  The portable, cloud-neutral production answer is X.509 client certificates
  over mutual TLS (mTLS), which works identically on any cloud.
- **User management / multi-tenancy** — not in this pass.

None of these require rethinking the architecture; they slot into the same
layered, adapter-friendly design.

---

## Deploying this to AWS (the next milestone)

The portability claim is only real if you prove it, and the cheapest proof is:
run this *same* `docker compose up` on an EC2 VM.

Rough steps:

1. Launch one Ubuntu EC2 instance (`t3.small` is plenty for the demo).
2. In its **security group**, allow inbound `22` (SSH, ideally only your IP)
   and `5173` (the dashboard). You do **not** need to expose `1883` — the
   simulator runs on the same box, so the broker stays internal.
3. SSH in, install Docker + the Compose plugin, copy this folder up
   (`scp` or `git clone`), and run `docker compose up --build`.
4. Visit `http://<EC2-public-IP>:5173`.

That's it — the application code does not change. Moving to Azure later is the
same exercise on an Azure VM. (For anything beyond a demo you'd put the
dashboard behind a proper web server / TLS and not expose the Vite dev server
directly, but the architecture is unchanged.)
