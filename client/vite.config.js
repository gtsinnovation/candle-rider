// client/vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true, // binds 0.0.0.0 instead of just localhost — lets other devices on the same LAN (e.g. a phone) reach the dev server
    proxy: {
      // In local dev, the Vite dev server proxies API calls to the native
      // Node server running on 3001, so the client can always call
      // relative '/api/...' paths — matching production behind Caddy.
      // This proxy runs inside Vite's own Node process on the dev machine,
      // so 'localhost:3001' here is always correct regardless of which
      // device/IP the browser itself connected to Vite from.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
