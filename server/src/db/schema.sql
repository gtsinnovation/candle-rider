-- server/src/db/schema.sql
-- SQLite is the source of truth for Candle Rider saves. Applied once at
-- server boot (see db/client.js) — safe to run repeatedly (IF NOT EXISTS).
--
-- NOTE: foreign_keys is enabled at runtime in db/client.js (PRAGMA
-- foreign_keys = ON), so the ON DELETE CASCADE on run_results below is
-- actually enforced. SQLite does not persist this pragma in the file.
--
-- AUTH PLAN (not yet implemented): identity is currently just a
-- client-generated UUID stored in the browser, no login required. google_id
-- and email below are nullable placeholders anticipating a future
-- "Sign in with Google" option. save_token is a server-issued secret that
-- authorizes writes for a player (anti-hijack); see routes/save.js.

CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,        -- client-generated UUID, no login/wallet
  display_name  TEXT NOT NULL DEFAULT 'Degen',
  google_id     TEXT,                    -- nullable; set once Google sign-in is implemented
  email         TEXT,                    -- nullable; from Google profile once linked
  save_token    TEXT,                    -- server-issued secret; required header x-save-token to write saves
  state_json    TEXT NOT NULL,           -- full PlayerState blob, see shared/economy.js
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

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
