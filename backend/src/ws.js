// ============================================================================
// ws.js  --  the live-update hub (WebSocket)
// ----------------------------------------------------------------------------
// REST is request/response: the browser asks, the server answers. But a
// dashboard needs the opposite too -- the SERVER must push updates the instant
// a device reports something, without the browser asking. That is what a
// WebSocket gives us: a persistent two-way connection.
//
// This module keeps the set of currently-connected dashboards and exposes a
// broadcast() that fans a message out to all of them. Since this is a
// single-instance deployment (one customer per stack), every connected
// dashboard is allowed to see every device, so there's no per-connection
// filtering to do here.
// ============================================================================

const { WebSocketServer } = require('ws');

let clients = new Set();

// Attach a WebSocket server to the existing HTTP server, on the path "/ws".
// Sharing the HTTP server means REST and WebSocket live on the same port (5000)
// -- simpler to reason about and to proxy.
function attach(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    clients.add(socket);
    console.log(`[ws] dashboard connected (${clients.size} open)`);

    // When a dashboard tab closes, drop it so we don't try to send to a dead
    // socket later.
    socket.on('close', () => {
      clients.delete(socket);
      console.log(`[ws] dashboard disconnected (${clients.size} open)`);
    });
  });
}

// Send a plain JS object (we JSON-encode it) to every connected dashboard.
function broadcast(message) {
  const data = JSON.stringify(message);
  for (const socket of clients) {
    // readyState 1 === OPEN. Skip any socket that is mid-close.
    if (socket.readyState === 1) socket.send(data);
  }
}

module.exports = { attach, broadcast };
