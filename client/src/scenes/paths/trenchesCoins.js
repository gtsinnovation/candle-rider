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
  { id: 'fomo',     symbol: '$FOMO',    name: 'FOMO Entry',        color: 0xff4dd2, base: 16.2,  ramp: 0.21,  cap: 12.3 },
  { id: 'wagmi',    symbol: '$WAGMI',   name: 'WAGMI Ser',         color: 0xb14dff, base: 17.4,  ramp: 0.225, cap: 13.0 },
  { id: 'cope',     symbol: '$COPE',    name: 'Cope Reserve',      color: 0x4dd2ff, base: 18.6,  ramp: 0.24,  cap: 13.8 },
  { id: 'rekt',     symbol: '$REKT',    name: 'Rekt Casino',       color: 0xff8a3d, base: 19.8,  ramp: 0.255, cap: 14.6 },
  { id: 'ngmi',     symbol: '$NGMI',    name: 'NGMI Death Spiral',  color: 0x8a3dff, base: 21.0,  ramp: 0.27,  cap: 15.4 },
  // Mastery unlock — invisible/locked until the player has actually earned
  // it via repeated cash-outs (see requiresMastery, checked against
  // gameState.state.pathMastery.trenches in TrenchesScene's coin room).
  // Gives path mastery an actual payoff instead of being a background
  // number nobody sees the point of.
  { id: 'legend',   symbol: '$LEGEND',  name: 'Legendary Ape', color: 0xffd700, base: 17.0, ramp: 0.24, cap: 13.5, requiresMastery: 5 },
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
