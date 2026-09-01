-- server/src/db/schema.sql
-- SQLite is the source of truth for Candle Rider saves. Applied once at
-- server boot (see db/client.js) — safe to run repeatedly (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,        -- client-generated UUID, no login/wallet
  display_name  TEXT NOT NULL DEFAULT 'Degen',
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
