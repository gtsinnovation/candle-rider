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
// Lifetime-total leaderboard (career standings).
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

// GET /api/leaderboard/best-runs?pathId=trenches&limit=20
// Best SINGLE RUN leaderboard. This is the one that matters for sharing:
// "I hit $4,200 in one run" is a brag; "my lifetime total is $50,000" just
// means you played a lot. Reads run_results rather than aggregate state.
leaderboardRouter.get('/leaderboard/best-runs', (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));
  const pathId = typeof req.query.pathId === 'string' ? req.query.pathId : null;

  const rows = db.prepare(`
    SELECT
      r.player_id AS playerId,
      COALESCE(p.display_name, 'Degen') AS displayName,
      MAX(r.pnl_earned) AS bestRun,
      r.path_id AS pathId
    FROM run_results r
    LEFT JOIN players p ON p.id = r.player_id
    ${pathId ? 'WHERE r.path_id = ?' : ''}
    GROUP BY r.player_id
    ORDER BY bestRun DESC
    LIMIT ?
  `).all(...(pathId ? [pathId, limit] : [limit]));

  res.status(200).json({ entries: rows });
});

// GET /api/leaderboard/rank?pnl=4200&pathId=trenches
// Where a given single-run score places globally. Powers the result card's
// "#47 of 1,203 degens" line — a raw number isn't brag-worthy on its own,
// a rank is.
leaderboardRouter.get('/leaderboard/rank', (req, res) => {
  const pnl = Number(req.query.pnl);
  if (!Number.isFinite(pnl)) {
    return res.status(400).json({ error: 'pnl must be a number' });
  }
  const pathId = typeof req.query.pathId === 'string' ? req.query.pathId : null;

  // Rank across each player's personal best, so one player can't occupy
  // the whole board with repeated good runs.
  const bestPerPlayer = `
    SELECT player_id, MAX(pnl_earned) AS best
    FROM run_results
    ${pathId ? 'WHERE path_id = ?' : ''}
    GROUP BY player_id
  `;
  const params = pathId ? [pathId] : [];

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM (${bestPerPlayer})`).get(...params);
  const { ahead } = db.prepare(
    `SELECT COUNT(*) AS ahead FROM (${bestPerPlayer}) WHERE best > ?`
  ).get(...params, pnl);

  // The score being ranked may not be in run_results at all — losses are
  // never logged there, and a fresh cash-out may not have been written yet.
  // Without accounting for that you get impossible output like "#2 of 1".
  // Treat the population as "everyone on the board, plus this run if it
  // isn't already represented".
  const { alreadyOnBoard } = db.prepare(
    `SELECT COUNT(*) AS alreadyOnBoard FROM (${bestPerPlayer}) WHERE best = ?`
  ).get(...params, pnl);
  const population = total + (alreadyOnBoard > 0 ? 0 : 1);
  const rank = ahead + 1;

  res.status(200).json({
    rank,
    total: Math.max(population, rank),
    percentile: population > 0 ? Math.round((1 - ahead / population) * 100) : 100,
  });
});
