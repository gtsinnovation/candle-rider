// server/src/db/client.js
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

const schemaPath = path.join(__dirname, 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf8'));

// Migration: add google_id/email to an EXISTING players table that
// predates those columns. SQLite has no "ADD COLUMN IF NOT EXISTS", so we
// check what's actually there via PRAGMA table_info first — this is what
// CREATE TABLE IF NOT EXISTS in schema.sql can't do, since it's a no-op
// against a table that already exists from before this migration was added.
const existingColumns = db.prepare("PRAGMA table_info(players)").all().map((c) => c.name);
if (!existingColumns.includes('google_id')) {
  db.exec('ALTER TABLE players ADD COLUMN google_id TEXT');
}
if (!existingColumns.includes('email')) {
  db.exec('ALTER TABLE players ADD COLUMN email TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_players_google_id ON players(google_id) WHERE google_id IS NOT NULL');

export default db;
