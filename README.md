# Candle Rider (Degen Warrior)

A 3D web game gamifying the daily grind of a memecoin degen trader.
**Entertainment only — no wallets, no real assets, no financial functionality.**

Five gameplay paths, each a distinct genre, sharing one persistent character
(Bag → PNL, XP, Reputation, Conviction, Conviction Shards):

| Path | Genre | Boss |
|---|---|---|
| Memecoin & Trenches Degen | endless-runner platforming | Soft Rug Titan |
| Leverage & Chaos Traders | tightrope balance | Liquidation Cascade |
| DeFi & Yield Farmers Degen | base-building / resource management | Impermanent Loss Hydra |
| Community & Narrative Degen | tower-defense / rhythm hybrid | Attention Vampire |
| Systematic & Tooling Degen | automation / pattern-matching puzzle | Market Adaptation AI |

## Repo layout

```
shared/   economy.js — single source of truth for currencies/rates, used by BOTH client and server
server/   Node/Express API + SQLite — save sync and leaderboard only
client/   Vite + Three.js game client
deploy/   native Ubuntu deployment (systemd unit, env template, scripts) — NOT containerized
```

## Local development

```bash
npm install          # installs all three workspaces
npm run dev:server   # starts the API on :3001
npm run dev:client   # starts Vite dev server on :5173 (proxies /api to :3001)
```

## Production deployment (Hetzner CX23, native Ubuntu — no Docker)

This app runs natively via systemd, **not** in a container. It sits behind
the existing Dockerized Caddy reverse proxy already serving
`degenwarrior.io` on this box — Caddy routes `candlerider.degenwarrior.io`
to this app via `host.docker.internal:3001`, so this server must bind
`0.0.0.0`, not `127.0.0.1`.

### One-time server setup

1. Create the app user and directory:
   ```bash
   sudo useradd --system --home /opt/candle-rider --shell /usr/sbin/nologin candlerider
   sudo mkdir -p /opt/candle-rider
   sudo chown candlerider:candlerider /opt/candle-rider
   ```
2. Clone the repo into `/opt/candle-rider` and run `npm ci && npm run build:client` as that user (or root, then `chown -R`).
3. Copy `deploy/env/candle-rider-api.env.example` → `deploy/env/candle-rider-api.env` and fill in real values. This file is gitignored — never commit it.
4. Install the systemd unit:
   ```bash
   sudo cp deploy/systemd/candle-rider-api.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now candle-rider-api
   ```
5. **Lock down port 3001 with ufw** so it's only reachable from localhost and the Docker bridge subnet (where Caddy's traffic comes from) — never expose it to the public internet directly:
   ```bash
   sudo ufw deny 3001
   sudo ufw allow from 172.16.0.0/12 to any port 3001   # covers default Docker bridge ranges
   sudo ufw allow from 127.0.0.1 to any port 3001
   ```
   Confirm the actual Docker bridge subnet first with `docker network inspect bridge | grep Subnet` and narrow the rule to that specific range rather than the whole 172.16.0.0/12 block if you want it tighter.
6. Confirm the Caddyfile on the existing stack (`/root/degenwarrior/Caddyfile`) has the `candlerider.degenwarrior.io` block reverse-proxying to `host.docker.internal:3001`, and that the `caddy` service in `docker-compose.yml` has `extra_hosts: ["host.docker.internal:host-gateway"]`.

### Subsequent deploys

```bash
/opt/candle-rider/deploy/scripts/deploy.sh
```

Pulls latest, installs deps, rebuilds the client, restarts the systemd
service. No image builds, no registry, no container restarts of the
existing `degenwarrior.io` stack.

### Backups

```bash
crontab -e
# add:
0 3 * * * /opt/candle-rider/deploy/scripts/backup-db.sh
```

## Day-to-day ops

```bash
systemctl status candle-rider-api
systemctl restart candle-rider-api
journalctl -u candle-rider-api -f
```
