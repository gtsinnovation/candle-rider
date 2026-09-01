// client/src/core/SaveManager.js
//
// Owns persistence for a GameState instance. The backend (SQLite via the
// native Node server) is the source of truth; localStorage is a fast local
// mirror so the game can boot instantly offline and isn't blocked on a
// network round-trip. No wallet, no login — identity is just a
// client-generated UUID stored in localStorage.

import { api } from '../api/client.js';
import { eventBus } from './EventBus.js';

const PLAYER_ID_KEY = 'candlerider:playerId';
const STATE_MIRROR_KEY = 'candlerider:stateMirror';
const SAVE_DEBOUNCE_MS = 4000;

function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export class SaveManager {
  constructor(gameState) {
    this.gameState = gameState;
    this.playerId = getOrCreatePlayerId();
    this._saveTimer = null;

    // Any state change queues a debounced backend save, so we're not
    // hammering the API on every frame-level stat tick.
    eventBus.on('state:changed', () => this.queueSave());
    eventBus.on('run:cashout', () => this.saveNow()); // cash-out saves immediately, no debounce
  }

  // Loads from backend first (source of truth); falls back to the
  // localStorage mirror if the network is unavailable so the game still
  // boots offline.
  async load() {
    try {
      const { state } = await api.getSave(this.playerId);
      this.gameState.replaceState(state);
      this._writeMirror(state);
      return state;
    } catch (err) {
      console.warn('[SaveManager] backend load failed, falling back to local mirror:', err.message);
      const mirrored = this._readMirror();
      if (mirrored) this.gameState.replaceState(mirrored);
      return mirrored;
    }
  }

  queueSave() {
    this._writeMirror(this.gameState.snapshot()); // mirror is synchronous/instant
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), SAVE_DEBOUNCE_MS);
  }

  async saveNow() {
    clearTimeout(this._saveTimer);
    const state = this.gameState.snapshot();
    this._writeMirror(state);
    try {
      await api.postSave(this.playerId, { state });
    } catch (err) {
      // Backend save failed (offline, server down) — the localStorage
      // mirror still has the latest state, so nothing is lost; it'll sync
      // on the next successful save.
      console.warn('[SaveManager] backend save failed, mirror retained:', err.message);
    }
  }

  async reportRunResult(runResult) {
    try {
      await api.postRunResult(this.playerId, runResult);
    } catch (err) {
      console.warn('[SaveManager] failed to log run result (non-fatal):', err.message);
    }
  }

  _writeMirror(state) {
    try {
      localStorage.setItem(STATE_MIRROR_KEY, JSON.stringify(state));
    } catch (err) {
      // localStorage can throw in private-browsing/quota-exceeded cases —
      // non-fatal, the game just relies on the backend more heavily.
      console.warn('[SaveManager] failed to write local mirror:', err.message);
    }
  }

  _readMirror() {
    const raw = localStorage.getItem(STATE_MIRROR_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
