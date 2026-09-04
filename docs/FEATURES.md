# Candle Rider — Technical Features

A running inventory of implemented systems, kept up to date as the project grows.
Last updated: alongside the Trenches step-jump + Bag Value chart additions.

---

## Architecture & Stack

- **Monorepo** via npm workspaces: `shared`, `server`, `client`
- **Client**: Vite + vanilla ES modules + Three.js r169 — no framework
- **Server**: Node/Express + SQLite (`better-sqlite3`, WAL journal mode)
- **`shared/economy.js`**: single source of truth for currencies, XP curve, all 5 path/boss definitions (theme, lore, art paths), and server-side sanity bounds — imported by both client and server so game-balance numbers can never drift out of sync between them

## Core Client Systems

- **EventBus** — pub/sub decoupling `GameState` from UI/scenes; nobody holds direct references to anybody else
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
- Hero art per card, `object-fit: contain` (shows the full portrait image consistently across all 5 paths — `cover` was cropping inconsistently since each piece of art has a different composition)
- Locked paths shown grayscale and non-interactive
- Live mastery level per path

## HUD

- Global stats panel: Level, Bag, PNL, Health, Energy, Conviction, Reputation, Conviction Shards
- Responsive: narrower/more compact on mobile viewports

## Trenches Path (Path 1 — Memecoin & Trenches Degen)

### Core loop
- 3-lane candle-jumping endless runner; candles flip green→red on a timer
- Guaranteed starting platform (fixes an early "instant void-fall" class of bug)
- Cash out banks the run's Bag as permanent PNL/Reputation; any loss (rug, void-fall, burnout, liquidation, mid-run exit) forfeits it — the core risk/reward tension

### Step jump
- Tapping jump again *while already airborne* applies an additional smaller upward boost, letting the player climb higher mid-jump
- Capped at 3 total activations per airborne phase (1 launch + 2 step-ups) — resets the instant the player lands, so it can't be used to just fly over the whole mechanic
- Launch velocity 7.5, step-up boost 5.5, gravity -18

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

### Debug tooling
- Live physics readout (lane, grounded state, vertical velocity, speed, current candle color) in the corner — auto-hidden on narrow mobile viewports since it's a dev tool, not player-facing

### Audio
- Synthesized sound effects via the Web Audio API (`core/AudioEngine.js`) — no external audio files. Lazily creates the `AudioContext` on first real user interaction, respecting browser autoplay policy automatically
- Effects: jump (launch + step-up boosts), landing (green/red distinct tones), rug-flip damage, cash-out fanfare, loss sting, level-up chime, streak ping, pause/resume cue

### Streak feedback
- Consecutive green landings tracked and now **displayed** (previously tracked but invisible) — escalating size/color the longer the streak runs, resets on any red landing or rug-flip damage
- Combo popup text includes streak count once above 1 (e.g. "+$15 LANDED (x3 STREAK!)")

### Level-up celebration
- `player:levelUp` previously only logged to console — now shows a real on-screen banner (global, works regardless of active scene) plus a chime, so leveling up is an actual visible moment instead of invisible background state

### Market events (mid-run escalation)
- A run previously had no shape — flat repetition until the player chose to stop or died. Now, every ~22 seconds, an alternating event fires (always starting with a Pump Wave, so new players see the rewarding version first)
- **Pump Wave** (~6s): newly-spawned candles get a much longer, safer fuse before flipping red, plus a 1.5× Bag multiplier on green landings — a clear reward window
- **FUD Wave** (~6s): newly-spawned candles flip almost immediately — a tense, high-risk window that punishes careless play
- Each event is announced with a banner, distinct sound, and a persistent color-tinted screen-edge vignette for the event's duration

### Red-flip warning telegraph
- Candles now flicker amber (pulsing faster as the flip approaches) for ~650ms before actually turning red, instead of flipping silently with no warning
- A subtle audio tick fires once, only for the candle the player is currently standing on (not every candle in every lane, which would be noisy)
- Turns rug-flip damage from a "gotcha" into a readable, reactable hazard — same underlying odds, meaningfully fairer *feel*

### New-player onboarding
- A brand-new player was previously dropped straight into free-look camera controls and 11 unlabeled-risk coins with no guidance beyond a small persistent hint
- Now: a one-time welcome modal (genuinely first visit only, tracked via localStorage, never shown again after) explains the core loop — green vs. red candles, how coin choice sets pace, controls (adapted to touch vs. keyboard/mouse), and the cash-out risk/reward — before the room becomes interactive
- Doesn't restrict coin choice or force a "training wheels" mode — informs, then respects the player's own decision, consistent with how the rest of the game treats difficulty as a fully player-owned choice
- Dismissible by click or Enter key

### Coin art
- Replaced the flat solid-color placeholder discs with real textured coin art (11 images derived from 5 source designs)
- Since only 5 unique designs existed for 11 coin slots, most were generated as hue-shifted variants of the originals (measured each source's actual dominant hue numerically first, rather than guessing, since a couple of the images turned out more amber/multicolor than they first appeared) — gives each coin a genuinely distinct look while keeping a coherent shared art style
- Locked coins (currently just `$LEGEND`) are dimmed via a material color multiply on the same texture, rather than needing a separate grayscale asset per coin
- Coin geometry switched from a solid cylinder to a flat circle with the texture mapped on — the source art is already a complete circular coin illustration, so a flat plane reads correctly without needing 3D bevel geometry

### Mastery payoff
- Path mastery previously leveled up in the background with nothing tied to it — a number that went up for no visible reason
- Now: an 11th coin, **$LEGEND** (the strongest speed/risk profile in the game), sits visibly locked in the coin room — grayed out, padlocked label — until the player reaches Trenches Mastery Lv. 5 via repeated cash-outs
- Attempting to select it while locked gives clear rejection feedback (message + sound) rather than silently failing or being hidden entirely, so players know exactly what they're working toward

### Candle color variety + anti-streak guarantee
- Candles can now spawn already-red (~28% chance), not just green candles that flip later — gives the player a genuine, immediately visible choice from a distance, not just a timing puzzle
- An anti-streak rule guarantees the spawn sequence can never run more than 3 consecutive same-color candles — prevents the degenerate "wall of red" or "wall of green" case entirely
- The guaranteed starting platform is always forced green regardless of this randomization — it must stay safe, since the player has zero reaction time on the very first frame

### Fixed: candles arriving pre-flipped (critical)
- The red-flip timer counted down from **spawn time**, not from when a candle actually became reachable. Since the candle queue spans ~74 units of depth but travel time from spawn to the player (11-18s at typical speeds) was far longer than the flip fuse itself (1.8-4.4s), **virtually every candle had already flipped red long before it was ever landable** — a player could go tens of seconds seeing almost no green candles at all
- Fixed by adding each candle's estimated travel time (distance ÷ current speed) to its flip timer, so the "green window" now actually starts once the candle is near enough to matter
- Applied to both live spawning during a run and the initial queue's timer refresh in `apeIntoCoin`

### Fixed: candle memory leak
- Candle geometry/material were never disposed on despawn — every spawn/despawn cycle over a long session leaked GPU resources. Now disposed both on despawn and on scene teardown (for any candles still active when a run ends)



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
