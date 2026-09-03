# Candle Rider — Technical Features

A running inventory of implemented systems, kept up to date as the project grows.
Last updated: alongside the full event-bus wiring pass (all game events now drive real-time HUD feedback).

---

## Architecture & Stack

- **Monorepo** via npm workspaces: `shared`, `server`, `client`
- **Client**: Vite + vanilla ES modules + Three.js r169 — no framework
- **Server**: Node/Express + SQLite (`better-sqlite3`, WAL journal mode)
- **`shared/economy.js`**: single source of truth for currencies, XP curve, all 5 path/boss definitions (theme, lore, art paths), and server-side sanity bounds — imported by both client and server so game-balance numbers can never drift out of sync between them

## Core Client Systems

- **EventBus** — pub/sub decoupling `GameState` from UI/scenes; nobody holds direct references to anybody else. `emit` iterates a snapshot of handlers so a handler that unsubscribes mid-emit can't break iteration. Every emitted event (`state:changed`, `run:started`, `run:bagChanged`, `run:lost`, `run:cashout`, `player:levelUp`) has at least one subscriber — no orphaned events
- **GameState** — run lifecycle (`startRun` / `addBag` / `reportHealth` / `reportEnergy` / `cashOut` / `loseRun`), XP/leveling curve, per-path mastery tracking. Health and Energy reset to full at the start of every run (run-scoped resources, not persistent damage)
- **SaveManager** — backend-primary persistence with a localStorage mirror fallback; debounced saves (4s) plus an immediate save on cash-out; anonymous UUID player identity with a manual fallback generator for non-secure contexts (e.g. LAN/HTTP testing, where `crypto.randomUUID` is unavailable); falls back to `DEFAULT_PLAYER_STATE` when both the backend and the local mirror are unavailable (first-ever visit + offline)
- **API client** — fetch wrapper with a hard 5-second timeout on every request, so a hung network call can never silently block app startup

## Server / Backend

- REST API: save/load (`GET`/`POST /api/save/:playerId`), run-result logging, leaderboard, health check
- Server-side delta validation rejects implausible save submissions — protects leaderboard integrity, explicitly **not** a claim that client-side state can't be edited locally (it always can, for any browser game; this only stops a tampered client from getting a inflated result to *persist*)
- Programmatic schema migration (`PRAGMA table_info` + conditional `ALTER TABLE`) — safe to run against both a brand-new database and an existing one from an earlier schema version
- `google_id` / `email` columns present (nullable) anticipating a future "Sign in with Google" option — not yet implemented, no OAuth flow exists yet
- Binds `0.0.0.0:3001` — required for the production Caddy/Docker-gateway routing (see Deployment)

## War Room Hub

- DOM-rendered path-select cards, generated from `shared/economy.js` path data
- Hero art per card; locked paths shown grayscale and non-interactive
- Live mastery level per path

## HUD

- Global stats panel: Level, Bag, PNL, Health, Energy, Conviction, Reputation, Conviction Shards
- Responsive: narrower/more compact on mobile viewports
- Built once on mount; only the value text nodes update on `state:changed` (which fires every frame during a run) — no per-frame `innerHTML` rebuild, so the HUD stays cheap even while Bag/Energy tick continuously
- **Event-driven real-time feedback** — subscribes to every game event, not just `state:changed`:
  - `run:started` → cyan panel flash
  - `run:bagChanged` → Bag line tints green while gaining, red on a loss (stays green during a green-candle streak, flashes red on a rug)
  - `run:lost` → red panel flash + "RUN OVER" banner
  - `run:cashout` → green panel flash + "PNL BANKED" banner with the amount
  - `player:levelUp` → gold panel flash + "LEVEL UP!" banner
  - All subscriptions are collected and torn down on HUD unmount

## Trenches Path (Path 1 — Memecoin & Trenches Degen)

### Core loop
- 3-lane candle-jumping endless runner; candles flip green→red on a timer
- Guaranteed starting platform (fixes an early "instant void-fall" class of bug)
- The run begins when the player apes into a coin (ape-in), **not** on the War Room card click — so the run clock and the Health/Energy reset happen at the moment gameplay starts, not while browsing the coin room
- Cash out banks the run's Bag as permanent PNL/Reputation; any loss (rug, void-fall, burnout, liquidation, mid-run exit) forfeits it — the core risk/reward tension

### Step jump
- Tapping jump again *while already airborne* applies an additional smaller upward boost, letting the player climb higher mid-jump
- Capped at 3 total activations per airborne phase (1 launch + 2 step-ups) — resets the instant the player lands, so it can't be used to just fly over the whole mechanic
- Launch velocity 7.5, step-up boost 5.5, gravity -18

### Responsiveness & feel
- **Jump buffering** — a jump press made within 120ms of touchdown is buffered and re-fired as a fresh launch the instant the player lands, instead of being eaten. Removes the "I pressed jump a hair too early and nothing happened" frustration that makes runners feel unresponsive. Only engages once the step-up cap is reached, so it never conflicts with the mid-air boost mechanic.
- **Snappier lane transitions** — the hero lerps to the target lane at `dt * 16` (~100ms to settle), tightened from `dt * 12` so dodging between candle lanes feels immediate rather than floaty. The banking-lean animation lags slightly behind the snap, which reads as natural weight shift.
- **Tab-hidden handling via RAF suspension** — the explicit `visibilitychange` auto-pause was removed (it fired spuriously inside embedded/iframe contexts where `document.hidden` is unreliable, freezing the run mid-play). A hidden tab already suspends `requestAnimationFrame`, and `clock.getDelta()` is capped at 0.05s, so the game freezes naturally while away and resumes cleanly without a time-jump when the tab returns.
- **WebGL context-loss recovery** — a `webglcontextlost` listener cancels the animation loop and surfaces a reload prompt, so a mobile GPU context drop under memory pressure is a visible, recoverable state rather than a silent dead screen.
- **GPU memory hygiene** — all candles share a single unit-cube geometry and two shared materials (green/red); height varies via `mesh.scale.y`. The previous per-candle geometry/material allocations were never disposed on despawn, leaking video memory for the whole session. Shared resources are disposed in teardown.

### Entry flow (coin room)
- Split-curtain door animation on entry
- Free-look orbit camera: drag to orbit, scroll/pinch to zoom, around a row of 10 floating memecoins
- Coins are labeled (canvas-texture sprites), gently bob/rotate, highlight on hover/focus
- Picking a coin (click, tap, or `←/→` + `Enter`) sets the run's full speed/risk profile — **replaced** the old Beginner/Middle/Master tier system entirely
- 10 coins spanning `$STABLE` (safest) to `$APEMAX` (fastest/riskiest), each with its own base speed / ramp rate / speed cap
- Last-picked coin remembered via localStorage, pre-selected next visit

### Visuals
- Back-view hero sprite (alpha-cutout art, background removed programmatically), matching the rear-chase camera direction
- Procedural animation: landing squash/rebound, jump stretch, running bob (speed-synced), lane-change lean
- Scrolling ground texture (canvas-drawn grid, UV-offset animated) synced to candle scroll speed
- World-scale constant (`WORLD_SCALE = 0.75`) applied uniformly to candle dimensions, lane spacing, ground grid cell size, spawn gaps, despawn distance, and camera framing distance — hero size deliberately excluded, so it reads larger/more prominent against the shrunk environment

### Bag Value HUD chart
- Left-aligned, vertically-centered canvas overlay, positioned away from the play area's center
- Rolling 40-tick buffer, sampled on a fixed 350ms interval (not per-frame, to avoid flooding the buffer with near-identical continuous-accrual values)
- Per-segment coloring — green for gains, red for drops between consecutive ticks
- Floating peak-value label (`$X MCAP`) rendered at the highest point currently in the visible window

### Pause / idle / exit
- `P` key or on-screen ⏸ button toggles pause
- Idle warning at 9 minutes of inactivity, auto-pause at 10 minutes
- Exit-to-hub available mid-run (forfeits the Bag, same rule as any other loss)

### Input
- Keyboard: `A`/`D` or `←`/`→` (lane change), `Space` (jump), `Escape` (cash out), `P` (pause)
- Mouse: left-click to jump during gameplay, drag-orbit in the coin room
- Touch: swipe left/right for lanes, tap to jump, dedicated on-screen Pause/Cash-Out buttons (mobile has no keyboard)
- Context-aware controls toast — shown once at run start, bottom-left, auto-dismissing; text adapts to touch vs. keyboard/mouse
- Lane changes register instantly on keydown (the visual lerp follows); jumps are buffered (see Responsiveness & feel) so input never feels lost

### Debug tooling
- Live physics readout (lane, grounded state, vertical velocity, speed, current candle color) in the corner — auto-hidden on narrow mobile viewports since it's a dev tool, not player-facing

## Mobile / PWA

- `manifest.json` + service worker (cache-first for the app shell, network-only for `/api` — save data must never be served stale)
- Service worker registers in production builds only (skipped in dev to avoid fighting Vite's hot-reload)
- Install prompt: native `beforeinstallprompt` flow on Android/Chrome, manual "tap Share → Add to Home Screen" instructions on iOS Safari (which has no install API at all); dismissible, not a hard block
- Dynamic viewport height fix (`100dvh` + JS-computed `--app-height` fallback) for the classic mobile address-bar height bug
- Meta-tag hardening: pinch-zoom disabled, pull-to-refresh disabled, safe-area insets for notched devices, `touch-action: none` on the game canvas specifically

## Deployment

- Native Ubuntu via `systemd` — **explicitly not containerized**
- Reverse-proxied through the existing Dockerized Caddy stack (which serves `degenwarrior.io`) via `host.docker.internal`, on the `candlerider.degenwarrior.io` subdomain
- `deploy.sh` (pull/build/restart) and `backup-db.sh` (cron-able SQLite snapshots)
- Vite dev server LAN-accessible (`host: true`) for real-device testing over the local network

---

## Known limitations / honest caveats

- PWA install and service-worker behavior **cannot** be fully tested over LAN/HTTP — both require a secure context (HTTPS, or `localhost` specifically). Will work automatically once deployed behind Caddy's HTTPS.
- Only Trenches (Path 1) is built. Leverage, Yield, Narrative, and Systematic exist as standalone prototypes but aren't ported into the real client architecture yet.
- PWA icons are placeholder crops of hero art, not properly designed maskable icons.
- Google OAuth is schema-anticipated only — no actual login flow exists.
