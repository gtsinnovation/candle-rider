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

export default db;
