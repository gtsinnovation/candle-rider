// client/src/core/SaveManager.js
//
// Owns persistence for a GameState instance. The backend (SQLite via the
// native Node server) is the source of truth; localStorage is a fast local
// mirror so the game can boot instantly offline and isn't blocked on a
// network round-trip. No wallet, no login — identity is just a
// client-generated UUID stored in localStorage.

import { api } from '../api/client.js';
import { eventBus } from './EventBus.js';
import { DEFAULT_PLAYER_STATE } from '@candle-rider/shared';

const PLAYER_ID_KEY = 'candlerider:playerId';
const DISPLAY_NAME_KEY = 'candlerider:displayName';
const STATE_MIRROR_KEY = 'candlerider:stateMirror';
const SAVE_DEBOUNCE_MS = 4000;

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // crypto.randomUUID only exists in "secure contexts" (HTTPS, or
  // localhost specifically) — a LAN IP over plain HTTP (e.g. phone testing
  // against a dev server) doesn't qualify, so the browser removes the
  // function entirely rather than throwing. This fallback produces a
  // valid-format v4 UUID via Math.random() instead. It doesn't need to be
  // cryptographically unpredictable — it's just an anonymous local
  // save-slot identifier, not a security token.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = generateUUID();
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
  // boots offline; falls back to DEFAULT_PLAYER_STATE if there's no mirror
  // either (first-ever visit on this device, API unreachable) — without
  // this last fallback, a brand-new device with no network left gameState
  // as null, which crashed the HUD/War Room with nothing on screen and no
  // visible error.
  async load() {
    try {
      const { state } = await api.getSave(this.playerId);
      this.gameState.replaceState(state);
      this._writeMirror(state);
      return state;
    } catch (err) {
      console.warn('[SaveManager] backend load failed, falling back to local mirror:', err.message);
      const mirrored = this._readMirror() || DEFAULT_PLAYER_STATE;
      this.gameState.replaceState(mirrored);
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
      // Send the display name too — the API always accepted one but the
      // client never sent it, so every leaderboard row read 'Degen'.
      await api.postSave(this.playerId, { state, displayName: getDisplayName() });
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

// Leaderboard identity. Deliberately local and anonymous — no account, no
// login, consistent with the game having no wallet or auth anywhere.
//
// Every player is auto-assigned a handle on first play so the board never
// shows a wall of identical "Degen" rows. They can override it with a
// custom name from the leaderboard panel at any time.

// Excludes 0/O/1/I/5/S — ambiguous glyphs make a handle hard to read back
// from a screenshot, which is exactly how these get shared.
const HANDLE_ALPHABET = '23456789ABCDEFGHJKLMNPQRTUVWXYZ';
const HANDLE_LENGTH = 4;

function randomHandleSuffix() {
  const bytes = new Uint8Array(HANDLE_LENGTH);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Non-secure context (LAN/HTTP testing) — Math.random is fine here,
    // this is a display handle, not a security token.
    for (let i = 0; i < HANDLE_LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < HANDLE_LENGTH; i++) out += HANDLE_ALPHABET[bytes[i] % HANDLE_ALPHABET.length];
  return out;
}

// ~923k combinations at 4 chars, so collisions stay negligible well past
// any realistic player count. Generated once and persisted — regenerating
// per session would detach a player from their own leaderboard history.
export function getDisplayName() {
  let name = localStorage.getItem(DISPLAY_NAME_KEY);
  if (!name) {
    name = `Degen-${randomHandleSuffix()}`;
    try { localStorage.setItem(DISPLAY_NAME_KEY, name); } catch { /* non-fatal */ }
  }
  return name;
}

export function setDisplayName(name) {
  const clean = String(name || '').trim().slice(0, 20);
  // An empty submission regenerates a fresh handle rather than collapsing
  // the player back to a bare "Degen" shared with everyone else.
  const finalName = clean || `Degen-${randomHandleSuffix()}`;
  try { localStorage.setItem(DISPLAY_NAME_KEY, finalName); } catch { /* non-fatal */ }
  return finalName;
}
