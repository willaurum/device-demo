// ============================================================================
// api.js  --  all talking-to-the-backend lives here
// ----------------------------------------------------------------------------
// Keeping fetch/WebSocket details in one module means the React components stay
// about UI, not about URLs. Every path is relative ("/api/..."), so Vite's
// proxy sends it to the backend and there's no host to configure.
// ============================================================================

// Fetch the full device list (used once on load).
export async function fetchDevices() {
  const res = await fetch('/api/devices');
  if (!res.ok) throw new Error('failed to load devices');
  return res.json();
}

// Fetch recent readings for one device + metric (for the chart).
export async function fetchTelemetry(id, metric = 'temperature', limit = 60) {
  const res = await fetch(`/api/devices/${id}/telemetry?metric=${metric}&limit=${limit}`);
  if (!res.ok) throw new Error('failed to load telemetry');
  return res.json();
}

// Send an LED command to a device. The dashboard will then update when the
// device reports its new state back over the WebSocket (the closed loop).
export async function sendLedCommand(id, led) {
  const res = await fetch(`/api/devices/${id}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ led }),
  });
  if (!res.ok) throw new Error('failed to send command');
  return res.json();
}

// Open the live WebSocket and call onMessage for every pushed update. Returns
// the socket so the caller can close it on unmount. Auto-reconnects if dropped.
export function connectWebSocket(onMessage) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws`;

  let socket;
  let closedByUs = false;

  const open = () => {
    socket = new WebSocket(url);
    socket.onmessage = (event) => onMessage(JSON.parse(event.data));
    socket.onclose = () => {
      // If the backend restarts, try again shortly.
      if (!closedByUs) setTimeout(open, 1500);
    };
  };
  open();

  return {
    close() { closedByUs = true; socket && socket.close(); },
  };
}
