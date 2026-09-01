// client/vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // In local dev, the Vite dev server proxies API calls to the native
      // Node server running on 3001, so the client can always call
      // relative '/api/...' paths — matching production behind Caddy.
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
