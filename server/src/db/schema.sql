-- server/src/db/schema.sql
-- SQLite is the source of truth for Candle Rider saves. Applied once at
-- server boot (see db/client.js) — safe to run repeatedly (IF NOT EXISTS).
--
-- AUTH PLAN (not yet implemented): identity is currently just a
-- client-generated UUID stored in the browser, no login required. google_id
-- and email below are nullable placeholders anticipating a future
-- "Sign in with Google" option for usage tracking across devices — a
-- signed-in player's anonymous UUID would be linked to their google_id
-- (merging any existing anonymous save), rather than replacing the id
-- scheme entirely. Not built yet: needs real Google OAuth credentials and
-- a /api/auth/google callback route, out of scope until requested.

CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,        -- client-generated UUID, no login/wallet
  display_name  TEXT NOT NULL DEFAULT 'Degen',
  google_id     TEXT,                    -- nullable; set once Google sign-in is implemented
  email         TEXT,                    -- nullable; from Google profile once linked
  state_json    TEXT NOT NULL,           -- full PlayerState blob, see shared/economy.js
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- NOTE: the google_id/email columns above only apply to a BRAND NEW
-- database file. CREATE TABLE IF NOT EXISTS is a no-op against an existing
-- players table from before these columns were added — that migration
-- (ALTER TABLE ADD COLUMN + the unique index) happens programmatically in
-- db/client.js instead, since SQLite has no "ADD COLUMN IF NOT EXISTS".

CREATE TABLE IF NOT EXISTS run_results (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  path_id           TEXT NOT NULL,
  pnl_earned        REAL NOT NULL DEFAULT 0,
  reputation_earned INTEGER NOT NULL DEFAULT 0,
  boss_defeated     INTEGER NOT NULL DEFAULT 0,  -- 0/1
  flawless          INTEGER NOT NULL DEFAULT 0,  -- 0/1
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_run_results_player ON run_results(player_id);
CREATE INDEX IF NOT EXISTS idx_players_updated ON players(updated_at);
