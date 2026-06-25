// ============================================================================
// vite.config.js
// ----------------------------------------------------------------------------
// Vite serves the React app on port 5173 with hot-reload. The important bit is
// the PROXY: requests the browser makes to /api or /ws are forwarded to the
// backend container. So from the browser's point of view everything is on one
// origin (localhost:5173) -- which means no CORS configuration anywhere.
// ============================================================================

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // listen on 0.0.0.0 so the container is reachable
    port: 5173,
    proxy: {
      // REST calls -> backend
      '/api': { target: 'http://backend:5000', changeOrigin: true },
      // WebSocket -> backend (ws:true is what makes the upgrade work)
      '/ws': { target: 'http://backend:5000', ws: true, changeOrigin: true },
    },
  },
});
