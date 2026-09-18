// client/src/api/client.js
// Thin wrapper around the backend API. Relative paths only — works
// identically in local dev (proxied by Vite to :3001) and in production
// (same-origin behind Caddy on candlerider.degenwarrior.io).

const BASE = '/api';
const REQUEST_TIMEOUT_MS = 5000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  getSave: (playerId) => request(`/save/${playerId}`),

  postSave: (playerId, { state, displayName }) =>
    request(`/save/${playerId}`, {
      method: 'POST',
      body: JSON.stringify({ state, displayName }),
    }),

  postRunResult: (playerId, runResult) =>
    request(`/save/${playerId}/run-result`, {
      method: 'POST',
      body: JSON.stringify(runResult),
    }),

  getLeaderboard: (sort = 'reputation', limit = 20) =>
    request(`/leaderboard?sort=${sort}&limit=${limit}`),

  // Best SINGLE run standings — the shareable kind.
  getBestRuns: (pathId = 'trenches', limit = 20) =>
    request(`/leaderboard/best-runs?pathId=${encodeURIComponent(pathId)}&limit=${limit}`),

  // Where a given single-run score places globally. Powers the result
  // card's rank line.
  getRank: (pnl, pathId = 'trenches') =>
    request(`/leaderboard/rank?pnl=${encodeURIComponent(pnl)}&pathId=${encodeURIComponent(pathId)}`),
};
