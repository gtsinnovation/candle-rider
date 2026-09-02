// server/src/index.js

// Native (non-Docker) Node server for Candle Rider. Runs under systemd on
// the Hetzner box, listens on 0.0.0.0:3001, and is reverse-proxied by the
// existing Caddy container via `host.docker.internal:3001` for
// candlerider.degenwarrior.io.
//
// IMPORTANT: this MUST bind 0.0.0.0, not 127.0.0.1 — traffic from the Caddy
// container arrives via the Docker bridge gateway, not localhost. Port 3001
// is locked down at the host firewall level (ufw) to only accept
// connections from localhost + the Docker bridge subnet, not the public
// internet directly. See docs/DEPLOYMENT.md.

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { saveRouter } from './routes/save.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';
import './db/client.js'; // side effect: opens db + applies schema on boot

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH || path.join(__dirname, '../../client/dist');

const app = express();

app.use(cors()); // same-origin in production via Caddy; permissive for local dev across ports
app.use(express.json({ limit: '256kb' })); // save payloads are small; guard against abuse

app.use('/api', healthRouter);
app.use('/api', saveRouter);
app.use('/api', leaderboardRouter);

// Serve the built Vite client if it exists (production). In local dev,
// `npm run dev --workspace=client` serves the client separately on its own
// Vite dev port, so this block is a no-op until you run `npm run build:client`.
if (fs.existsSync(CLIENT_DIST_PATH)) {
  app.use(express.static(CLIENT_DIST_PATH));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
  });
} else {
  console.warn(`[candle-rider-api] client build not found at ${CLIENT_DIST_PATH} — API-only mode.`);
}

app.use(errorHandler);

app.listen(PORT, HOST, () => {
  console.log(`[candle-rider-api] listening on http://${HOST}:${PORT}`);
});
