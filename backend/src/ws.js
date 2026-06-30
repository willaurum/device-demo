// ============================================================================
// ws.js  --  the live-update hub (WebSocket), now tenant-aware
// ----------------------------------------------------------------------------
// REST is request/response: the browser asks, the server answers. A dashboard
// also needs the opposite -- the SERVER pushing updates the instant a device
// reports something. That is what a WebSocket gives us: a persistent two-way
// connection.
//
// TWO RESPONSIBILITIES NOW:
//   1. Authenticate each connection (FEATURE 2). A dashboard must present its
//      API key as a "?token=" query param when it opens the socket; we reject
//      the connection if the key is invalid.
//   2. Remember which TENANT each socket belongs to, and only ever push a
//      device's update to sockets of that same tenant. Acme's dashboard must
//      never receive Globex's data.
// ============================================================================

const { WebSocketServer } = require('ws');
const auth = require('./auth');

// Each connected socket gets a `_tenantId` property stamped on it (below), so
// broadcast() can filter by tenant.
let clients = new Set();

// Attach a WebSocket server to the existing HTTP server, on the path "/ws".
// Sharing the HTTP server keeps REST and WebSocket on the same port (5000).
function attach(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    // verifyClient runs DURING the handshake, before the socket is established.
    // We authenticate here so a bad key is rejected with an HTTP 401 and the
    // connection never opens at all (cleaner than opening then closing it).
    //
    // The token rides in the URL ("?token=...") because browsers can't set
    // custom headers when opening a WebSocket. If it resolves to a tenant we
    // stash that tenant on the request so the 'connection' handler can read it.
    verifyClient: (info, done) => {
      let token = '';
      try {
        token = new URL(info.req.url, 'http://localhost').searchParams.get('token') || '';
      } catch (_) { /* malformed URL -> token stays empty -> rejected below */ }

      auth.resolveApiKey(token)
        .then((tenant) => {
          if (!tenant) return done(false, 401, 'Unauthorized');  // reject handshake
          info.req._tenant = tenant;                              // pass to connection
          done(true);                                             // accept handshake
        })
        .catch(() => done(false, 500, 'Server error'));
    },
  });

  wss.on('connection', (socket, req) => {
    // By the time we get here, verifyClient has already authenticated the
    // request and attached the tenant. Remember it and start tracking the socket.
    const tenant = req._tenant;
    socket._tenantId = tenant.id;
    clients.add(socket);
    console.log(`[ws] ${tenant.id} dashboard connected (${clients.size} open)`);

    socket.on('close', () => {
      clients.delete(socket);
      console.log(`[ws] ${tenant.id} dashboard disconnected (${clients.size} open)`);
    });
  });
}

// Send a message to every connected dashboard FOR ONE TENANT. The tenantId
// comes from the MQTT topic the message originated on, so a device update only
// ever reaches that device's own tenant.
function broadcast(tenantId, message) {
  const data = JSON.stringify(message);
  for (const socket of clients) {
    // readyState 1 === OPEN. Also gate on tenant so data never crosses clients.
    if (socket.readyState === 1 && socket._tenantId === tenantId) {
      socket.send(data);
    }
  }
}

module.exports = { attach, broadcast };
