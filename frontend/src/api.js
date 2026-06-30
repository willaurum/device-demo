// ============================================================================
// api.js  --  all talking-to-the-backend lives here
// ----------------------------------------------------------------------------
// Keeping fetch/WebSocket details in one module means the React components stay
// about UI, not about URLs. Every path is relative ("/api/..."), so Vite's
// proxy sends it to the backend and there's no host to configure.
//
// AUTH (FEATURE 2): the backend now requires an API key on every call. We store
// the key in localStorage (so it survives a page refresh) and attach it to
// every request -- as an "Authorization: Bearer" header for REST, and as a
// "?token=" query param for the WebSocket (browsers can't set headers on a WS).
// ============================================================================

const TOKEN_KEY = 'apiKey';

// ---- API key storage (the "session") ---------------------------------------
export function getApiKey() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setApiKey(key) { localStorage.setItem(TOKEN_KEY, key); }
export function clearApiKey() { localStorage.removeItem(TOKEN_KEY); }

// Build the auth header for REST calls (empty object if we have no key yet).
function authHeaders() {
  const key = getApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

// Small wrapper around fetch that adds auth and turns failures into errors.
// A 401 gets a marked error (err.status === 401) so the app can log the user
// out and show the login screen again.
async function request(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), ...authHeaders() },
  });
  if (res.status === 401) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(`request to ${path} failed: ${res.status}`);
  return res.json();
}

// Confirm the key and find out which tenant we are. Used right after login.
export function fetchMe() {
  return request('/api/me');
}

// Fetch the full device list for the logged-in tenant (used once on load).
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
// The API key rides along as ?token= so the backend can authenticate us.
export function connectWebSocket(onMessage) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws?token=${encodeURIComponent(getApiKey())}`;

  let socket;
  let closedByUs = false;

  const open = () => {
    socket = new WebSocket(url);
    socket.onmessage = (event) => onMessage(JSON.parse(event.data));
    socket.onclose = () => {
      // If the backend restarts (or we got rejected), try again shortly.
      if (!closedByUs) setTimeout(open, 1500);
    };
  };
  open();

  return {
    close() { closedByUs = true; socket && socket.close(); },
  };
}
