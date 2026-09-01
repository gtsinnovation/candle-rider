// server/src/routes/leaderboard.js
import { Router } from 'express';
import db from '../db/client.js';

export const leaderboardRouter = Router();

const SORTABLE_FIELDS = {
  reputation: "CAST(json_extract(state_json, '$.reputation') AS INTEGER)",
  pnl: "CAST(json_extract(state_json, '$.pnl') AS REAL)",
  level: "CAST(json_extract(state_json, '$.level') AS INTEGER)",
};

// GET /api/leaderboard?sort=reputation|pnl|level&limit=20
leaderboardRouter.get('/leaderboard', (req, res) => {
  const sortKey = SORTABLE_FIELDS[req.query.sort] ? req.query.sort : 'reputation';
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));
  const column = SORTABLE_FIELDS[sortKey];

  const rows = db.prepare(`
    SELECT
      id AS playerId,
      display_name AS displayName,
      ${column} AS value,
      updated_at AS updatedAt
    FROM players
    ORDER BY value DESC
    LIMIT ?
  `).all(limit);

  res.status(200).json({ sort: sortKey, entries: rows });
});
