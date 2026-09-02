// client/src/scenes/paths/trenchesCoins.js
//
// The 10 memecoins available in the Trenches room. Picking one to "ape"
// into IS the difficulty selection now — each coin sets the run's full
// candle-approach speed profile (base/ramp/cap), replacing the old
// Beginner/Middle/Master tier system entirely. Scaled across the same
// numeric range the old tiers used, just spread across 10 thematic steps
// instead of 3 generic ones.
//
// color is used for the coin mesh material AND its floating label.

export const TRENCHES_COINS = [
  { id: 'stable',   symbol: '$STABLE',  name: 'Blue Chip Reserve', color: 0x50ff96, base: 3.2,  ramp: 0.038, cap: 2.3 },
  { id: 'safu',     symbol: '$SAFU',    name: 'Established Project', color: 0x6dffb0, base: 4.05, ramp: 0.054, cap: 3.15 },
  { id: 'growth',   symbol: '$GROWTH',  name: 'Steady Riser', color: 0x9dff7d, base: 5.2,  ramp: 0.068, cap: 4.0 },
  { id: 'trend',    symbol: '$TREND',   name: 'Trending Now', color: 0xd6ff5c, base: 6.4,  ramp: 0.082, cap: 4.9 },
  { id: 'volt',     symbol: '$VOLT',    name: 'High Volatility', color: 0xffe066, base: 8.1,  ramp: 0.108, cap: 6.3 },
  { id: 'pump',     symbol: '$PUMP',    name: 'Pump Signal', color: 0xffc24d, base: 9.4,  ramp: 0.124, cap: 7.3 },
  { id: 'moon',     symbol: '$MOON',    name: 'Moonshot Bet', color: 0xff9955, color2: true, base: 10.7, ramp: 0.14,  cap: 8.2 },
  { id: 'fresh',    symbol: '$FRESH',   name: 'Fresh Launch', color: 0xff7766, base: 12.15, ramp: 0.162, cap: 9.45 },
  { id: 'degen',    symbol: '$DEGEN',   name: 'Pure Degen Play', color: 0xff5577, base: 13.5, ramp: 0.18,  cap: 10.5 },
  { id: 'apemax',   symbol: '$APEMAX',  name: 'Maximum Ape', color: 0xff3355, base: 15.0, ramp: 0.2,   cap: 11.5 },
];

const STORAGE_KEY = 'candlerider:trenchesLastCoin';

export function getLastCoinId() {
  return localStorage.getItem(STORAGE_KEY) || 'safu';
}

export function setLastCoinId(id) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* non-fatal */ }
}

export function getCoinById(id) {
  return TRENCHES_COINS.find((c) => c.id === id) || TRENCHES_COINS[1];
}
