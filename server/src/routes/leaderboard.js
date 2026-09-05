// server/src/routes/leaderboard.js
import { Router } from 'express';
import db from '../db/client.js';

export const leaderboardRouter = Router();

// Leaderboard values are derived from server-recorded run_results (bounded
// at submit time) rather than the client-controlled save blob, so a
// tampered state_json can't pollute the pnl/reputation rankings. Level is
// still read from state_json (meta progression, not a per-run earning).
const RUN_AGG = {
  reputation: 'COALESCE(SUM(r.reputation_earned), 0)',
  pnl: 'COALESCE(SUM(r.pnl_earned), 0)',
};

// GET /api/leaderboard?sort=reputation|pnl|level&limit=20
leaderboardRouter.get('/leaderboard', (req, res) => {
  const sortKey = RUN_AGG[req.query.sort] ? req.query.sort : 'reputation';
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));

  let rows;
  if (RUN_AGG[sortKey]) {
    const agg = RUN_AGG[sortKey];
    rows = db.prepare(`
      SELECT
        p.id AS playerId,
        p.display_name AS displayName,
        ${agg} AS value,
        p.updated_at AS updatedAt
      FROM players p
      LEFT JOIN run_results r ON r.player_id = p.id
      GROUP BY p.id
      ORDER BY value DESC
      LIMIT ?
    `).all(limit);
  } else {
    rows = db.prepare(`
      SELECT
        id AS playerId,
        display_name AS displayName,
        CAST(json_extract(state_json, '$.level') AS INTEGER) AS value,
        updated_at AS updatedAt
      FROM players
      ORDER BY value DESC
      LIMIT ?
    `).all(limit);
  }

  res.status(200).json({ sort: sortKey, entries: rows });
});
