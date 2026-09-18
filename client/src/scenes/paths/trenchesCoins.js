// client/src/scenes/paths/trenchesCoins.js
//
// The coins available in the Trenches room. Picking one to "ape" into IS
// the difficulty selection — each coin sets the run's whole character,
// not just its speed.
//
// FIELD MEANINGS (i4):
//   base    — starting scroll speed, in world units/second.
//   ramp    — how much speed is ADDED per second of elapsed run time.
//   rampCap — the maximum amount the ramp may ever add. This bounds the
//             RAMP, not the speed itself: top speed is `base + rampCap`,
//             which is what `maxSpeed()` below returns. The old name
//             (`cap`) read like a speed ceiling and caused exactly that
//             misreading.
//
// PROFILE FIELDS (i9) — these are what make each coin feel distinct
// beyond raw pace, so the choice is a real decision rather than a
// single slow-to-fast slider:
//   red        — chance a candle spawns already-red (a reading test).
//   fuseMul    — multiplies how long green candles last before flipping.
//                Below 1 means less time to commit to a landing.
//   payMul     — payout multiplier per successful green landing.
//   holeChance — per-lane chance a row has no platform at all (a void).
//   axis       — the one word describing what this coin actually tests.
//                Surfaced in the coin room so the player can see the axis
//                they're choosing between.

export const TRENCHES_COINS = [
  {
    id: 'stable', symbol: '$STABLE', name: 'Blue Chip Reserve', color: 0x50ff96,
    base: 3.2, ramp: 0.038, rampCap: 2.3,
    red: 0.12, fuseMul: 1.6, payMul: 1.0, holeChance: 0, axis: 'Forgiving',
  },
  {
    id: 'volt', symbol: '$VOLT', name: 'High Volatility', color: 0xffe066,
    base: 8.1, ramp: 0.108, rampCap: 6.3,
    // The reading test: slower than $APEMAX but punishing, because most
    // candles are red and green ones flip fast. Should feel HARDER than
    // $APEMAX for the opening ~20s despite the lower speed.
    red: 0.46, fuseMul: 0.55, payMul: 1.5, holeChance: 0.04, axis: 'Reading',
  },
  {
    id: 'moon', symbol: '$MOON', name: 'Moonshot Bet', color: 0xb79dff,
    base: 10.7, ramp: 0.14, rampCap: 8.2,
    // The gap test: frequent voids mean the danger is front-loaded — it's
    // hardest in the opening seconds, before the ramp has even started.
    red: 0.24, fuseMul: 1.0, payMul: 1.8, holeChance: 0.22, axis: 'Gaps',
  },
  {
    id: 'apemax', symbol: '$APEMAX', name: 'Maximum Ape', color: 0xff3355,
    base: 15.0, ramp: 0.2, rampCap: 11.5,
    // The pure speed test: fair colours and fuses, but very little time to
    // act on any of it.
    red: 0.28, fuseMul: 0.9, payMul: 2.2, holeChance: 0.06, axis: 'Speed',
  },
  {
    id: 'legend', symbol: '$LEGEND', name: 'Legendary Ape', color: 0xffd700,
    base: 17.0, ramp: 0.24, rampCap: 13.5,
    // Mastery unlock — every axis at once. Locked until the player has
    // actually earned it via repeated cash-outs.
    red: 0.34, fuseMul: 0.7, payMul: 2.6, holeChance: 0.14, axis: 'Everything',
    requiresMastery: 5,
  },
];

// Top speed a coin can ever reach: base plus the full ramp allowance.
export function maxSpeed(coin) {
  return coin.base + coin.rampCap;
}

const STORAGE_KEY = 'candlerider:trenchesLastCoin';

export function getLastCoinId() {
  return localStorage.getItem(STORAGE_KEY) || 'stable';
}

export function setLastCoinId(id) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* non-fatal */ }
}

// Falls back to index 0 ($STABLE) rather than index 1 — a returning player
// whose saved coin no longer exists should land on the gentlest option, not
// be dropped into whatever happens to sit second in the array.
export function getCoinById(id) {
  return TRENCHES_COINS.find((c) => c.id === id) || TRENCHES_COINS[0];
}
