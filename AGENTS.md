# Candle Rider — Base44 dev environment

## What this is
3D web game (Vite + Three.js client, Node/Express + SQLite API server). npm workspaces: `shared`, `server`, `client`. Entertainment only — no wallets, no external services, **no secrets required**.

## Running here
`docker compose -f docker-compose.base44.yml up -d` — single container runs both dev processes:
- **client**: Vite dev server on container port 5173, mapped to host **3000** (the preview entry point).
- **server**: Express API on container port 3001 (not exposed to host; the Vite dev server proxies `/api` → `localhost:3001` inside the container — single-origin wiring).

Source is bind-mounted at `/app`; edits hot-reload. `node_modules` lives in a named volume so installs persist.

## Key setup notes
- **Shell precedence gotcha**: the start command groups the two dev servers in a subshell `(… & … & wait)` so they only launch *after* `npm install` finishes. Without the parens, `&` binds tighter than `&&` and the client starts before vite is installed.
- `client/vite.config.js` has `allowedHosts: true` so the preview's external hostname is accepted (required addition for the Base44 preview; the repo's native deploy uses Caddy instead).
- `better-sqlite3` installs via prebuilt binaries on `node:22` — no build tools needed.
- SQLite DB lives at `/app/data/candlerider.db` (gitignored; auto-created on first boot via `schema.sql`).

## Verifying it works
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` → the Vite-served HTML (contains `/@vite/client`).
- `curl -sf http://localhost:3000/api/health` → `{"status":"ok",...}` (proxied to the API).
- Preview iframe loads the game's title screen.
