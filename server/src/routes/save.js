// server/src/routes/save.js
import { Router } from 'express';
import db from '../db/client.js';
import {
  DEFAULT_PLAYER_STATE,
  SANITY_BOUNDS,
} from '@candle-rider/shared';

export const saveRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidPlayerId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

function newSaveToken() {
  // 32 random bytes, hex. global crypto (Web Crypto) is available in Node 18+.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// GET /api/save/:playerId
// Returns the saved state, or a fresh DEFAULT_PLAYER_STATE (200, not 404) so
// the client can always bootstrap a new save without special-casing errors.
saveRouter.get('/save/:playerId', (req, res) => {
  const { playerId } = req.params;
  if (!isValidPlayerId(playerId)) {
    return res.status(400).json({ error: 'invalid playerId' });
  }

  const row = db.prepare('SELECT display_name, state_json, updated_at FROM players WHERE id = ?').get(playerId);

  if (!row) {
    return res.status(200).json({
      playerId,
      displayName: 'Degen',
      state: DEFAULT_PLAYER_STATE,
      isNew: true,
    });
  }

  return res.status(200).json({
    playerId,
    displayName: row.display_name,
    state: JSON.parse(row.state_json),
    updatedAt: row.updated_at,
    isNew: false,
  });
});

// POST /api/save/:playerId
// Body: { displayName?: string, state: PlayerState }
// Upserts the full state blob with coarse sanity bounds against the previous
// saved state. Auth: a save token issued by the server on the player's first
// save; the client stores it and sends it back as `x-save-token` on every
// subsequent save, so a third party who only knows the playerId can't
// overwrite the save. Legacy players (pre-token) get a one-time claim: their
// first tokenless POST mints and stores the token.
saveRouter.post('/save/:playerId', (req, res) => {
  const { playerId } = req.params;
  if (!isValidPlayerId(playerId)) {
    return res.status(400).json({ error: 'invalid playerId' });
  }

  const { state, displayName } = req.body || {};
  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'missing state' });
  }

  const existingRow = db.prepare('SELECT state_json, save_token FROM players WHERE id = ?').get(playerId);
  const previousState = existingRow ? JSON.parse(existingRow.state_json) : DEFAULT_PLAYER_STATE;

  // Save-token authorization.
  if (existingRow && existingRow.save_token) {
    const presented = req.get('x-save-token');
    if (!presented || presented !== existingRow.save_token) {
      return res.status(403).json({ error: 'invalid save token' });
    }
  }

  const pnlDelta = (state.pnl ?? 0) - (previousState.pnl ?? 0);
  const repDelta = (state.reputation ?? 0) - (previousState.reputation ?? 0);
  const xpDelta = (state.xp ?? 0) - (previousState.xp ?? 0);
  const shardDelta = (state.convictionShards ?? 0) - (previousState.convictionShards ?? 0);

  const violations = [];
  if (pnlDelta > SANITY_BOUNDS.MAX_PNL_DELTA_PER_SAVE) violations.push('pnl');
  if (repDelta > SANITY_BOUNDS.MAX_REPUTATION_DELTA_PER_SAVE) violations.push('reputation');
  if (xpDelta > SANITY_BOUNDS.MAX_XP_DELTA_PER_SAVE) violations.push('xp');
  if (shardDelta > SANITY_BOUNDS.MAX_CONVICTION_SHARDS_DELTA_PER_SAVE) violations.push('convictionShards');

  if (violations.length > 0) {
    return res.status(400).json({ error: 'implausible state delta rejected', fields: violations });
  }

  const nowDisplayName = (displayName && String(displayName).slice(0, 40)) || 'Degen';
  const stateJson = JSON.stringify(state);
  const token = (existingRow && existingRow.save_token) || newSaveToken();

  db.prepare(`
    INSERT INTO players (id, display_name, state_json, save_token, updated_at)
    VALUES (@id, @displayName, @stateJson, @token, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(id) DO UPDATE SET
      display_name = @displayName,
      state_json = @stateJson,
      save_token = COALESCE(save_token, @token),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).run({ id: playerId, displayName: nowDisplayName, stateJson, token });

  return res.status(200).json({ ok: true, playerId, saveToken: token });
});

// POST /api/save/:playerId/run-result
// Logs a completed run (feeds the leaderboard) separately from the save
// blob. Requires the save token (once claimed) and is per-player rate-limited
// so a compromised client can't flood the leaderboard with fake runs.
saveRouter.post('/save/:playerId/run-result', (req, res) => {
  const { playerId } = req.params;
  if (!isValidPlayerId(playerId)) {
    return res.status(400).json({ error: 'invalid playerId' });
  }

  const player = db.prepare('SELECT save_token FROM players WHERE id = ?').get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'player not found' });
  }
  if (player.save_token) {
    const presented = req.get('x-save-token');
    if (!presented || presented !== player.save_token) {
      return res.status(403).json({ error: 'invalid save token' });
    }
  }

  const { pathId, pnlEarned, reputationEarned, bossDefeated, flawless } = req.body || {};
  if (typeof pathId !== 'string') {
    return res.status(400).json({ error: 'missing pathId' });
  }

  const recent = db
    .prepare(`SELECT COUNT(*) AS n FROM run_results WHERE player_id = ? AND created_at >= datetime('now', '-1 minute')`)
    .get(playerId);
  if (recent.n >= 6) {
    return res.status(429).json({ error: 'too many run submissions' });
  }

  const boundedPnl = Math.max(0, Math.min(Number(pnlEarned) || 0, SANITY_BOUNDS.MAX_BAG_PER_RUN));
  const boundedRep = Math.max(0, Math.min(Number(reputationEarned) || 0, SANITY_BOUNDS.MAX_REPUTATION_DELTA_PER_SAVE));

  db.prepare(`
    INSERT INTO run_results (player_id, path_id, pnl_earned, reputation_earned, boss_defeated, flawless)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(playerId, pathId, boundedPnl, boundedRep, bossDefeated ? 1 : 0, flawless ? 1 : 0);

  return res.status(201).json({ ok: true });
});
