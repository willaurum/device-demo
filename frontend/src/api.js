// ============================================================================
// api.js  --  all talking-to-the-backend lives here
// ----------------------------------------------------------------------------
// Keeping fetch/WebSocket details in one module means the React components stay
// about UI, not about URLs. Every path is relative ("/api/..."), so Vite's
// proxy sends it to the backend and there's no host to configure.
// ============================================================================

// Small wrapper around fetch that turns a failure into a thrown error.
async function request(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`request to ${path} failed: ${res.status}`);
  return res.json();
}

// Fetch the full device list (used once on load).
export function fetchDevices() {
  return request('/api/devices');
}

// Fetch recent readings for one device + metric (for the chart).
export function fetchTelemetry(id, metric = 'temperature', limit = 60) {
  return request(`/api/devices/${id}/telemetry?metric=${encodeURIComponent(metric)}&limit=${limit}`);
}

// Set a control on a device, e.g. sendCommand(id, 'led', true) or
// sendCommand(id, 'valve', false). The dashboard updates when the device
// reports its new state back over the WebSocket (the closed loop).
export function sendCommand(id, control, value) {
  return request(`/api/devices/${id}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ control, value }),
  });
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
