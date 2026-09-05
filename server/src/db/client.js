import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DB file lives outside the repo checkout so `git pull` / redeploys never
// touch player data. Overridable via env for local dev.
const DB_PATH = process.env.CANDLE_RIDER_DB_PATH || path.join(__dirname, '../../data/candlerider.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // safer under concurrent reads/writes, standard for sqlite servers
db.pragma('foreign_keys = ON'); // enforce FK constraints — ON DELETE CASCADE on run_results now fires

const schemaPath = path.join(__dirname, 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf8'));

// Migration: add columns to an EXISTING players table that predates them.
// SQLite has no "ADD COLUMN IF NOT EXISTS", so we check what's actually
// there via PRAGMA table_info first — CREATE TABLE IF NOT EXISTS in
// schema.sql is a no-op against a table that already exists.
const existingColumns = db.prepare("PRAGMA table_info(players)").all().map((c) => c.name);
if (!existingColumns.includes('google_id')) {
  db.exec('ALTER TABLE players ADD COLUMN google_id TEXT');
}
if (!existingColumns.includes('email')) {
  db.exec('ALTER TABLE players ADD COLUMN email TEXT');
}
if (!existingColumns.includes('save_token')) {
  db.exec('ALTER TABLE players ADD COLUMN save_token TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_players_google_id ON players(google_id) WHERE google_id IS NOT NULL');

export default db;
