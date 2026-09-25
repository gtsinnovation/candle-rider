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
    // Sourcemaps were shipping a 2MB .js.map alongside a 564kB bundle —
    // roughly 4x the payload, for debug data no player benefits from.
    // 'hidden' still generates the map (so it can be uploaded to an error
    // reporter if one is ever added) but strips the comment that tells
    // browsers to fetch it. Delete dist/**/*.map before deploying, or set
    // this to false outright if you never want it produced.
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 700, // the 500kB warning is Three.js, not app code — 148kB gzipped over the wire is fine for a 3D game
  },
});
