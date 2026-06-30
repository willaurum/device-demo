// ============================================================================
// vite.config.js
// ----------------------------------------------------------------------------
// Vite serves the React app on port 5173 with hot-reload. The important bit is
// the PROXY: requests the browser makes to /api or /ws are forwarded to the
// backend. So from the browser's point of view everything is on one origin --
// which means no CORS configuration anywhere.
//
// The proxy TARGET is configurable so the same app works in two places:
//   - in Docker compose, the backend is reachable at the service name
//     "backend" (set via VITE_PROXY_TARGET in docker-compose.yml)
//   - running `npm run dev` on your host, it falls back to localhost:5000
// ============================================================================

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use 127.0.0.1 (not "localhost") for the host fallback: on some systems
// "localhost" resolves to IPv6 ::1 first, but Docker publishes the backend port
// on IPv4, so ::1 would refuse the connection.
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // listen on 0.0.0.0 so the container is reachable
    port: 5173,
    proxy: {
      // REST calls -> backend
      '/api': { target: proxyTarget, changeOrigin: true },
      // WebSocket -> backend (ws:true is what makes the upgrade work)
      '/ws': { target: proxyTarget, ws: true, changeOrigin: true },
    },
  },
});
