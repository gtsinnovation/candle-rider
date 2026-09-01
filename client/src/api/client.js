// client/src/api/client.js
// Thin wrapper around the backend API. Relative paths only — works
// identically in local dev (proxied by Vite to :3001) and in production
// (same-origin behind Caddy on candlerider.degenwarrior.io).

const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
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
};
