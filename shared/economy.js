// shared/economy.js
//
// Single source of truth for Candle Rider's economy/progression numbers.
// Imported by BOTH client (real-time gameplay math) and server (validating
// that a submitted run's PNL/Reputation/XP deltas are plausible before
// persisting them). If you tune a rate, tune it here — nowhere else.
//
// This is pure data + pure functions. No side effects, no I/O, so it's safe
// to import from either an ES module client bundle or a Node server process.

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------
// Bag      — soft, in-run currency. Resets/partially banks each run.
// PNL      — meta currency. Bag converts to PNL on cash-out; spent on
//            permanent upgrades, gear, path unlocks.
// XP       — levels up the Degen Warrior; unlocks skill tree nodes.
// Reputation — social/flex currency; cosmetics, leaderboard standing.
// Conviction Shards — rare; only from boss kills or flawless runs; spent on
//            prestige-tier upgrades and cross-path abilities.
export const CURRENCIES = Object.freeze({
  BAG: 'bag',
  PNL: 'pnl',
  XP: 'xp',
  REPUTATION: 'reputation',
  CONVICTION_SHARDS: 'convictionShards',
});

// ---------------------------------------------------------------------------
// Player defaults — the shape of a brand-new save
// ---------------------------------------------------------------------------
export const DEFAULT_PLAYER_STATE = Object.freeze({
  level: 1,
  xp: 0,
  bag: 0,
  pnl: 0,
  reputation: 0,
  convictionShards: 0,
  health: 100,
  energy: 100,
  conviction: 50,
  unlockedPaths: ['trenches'], // path ids unlocked from the start
  pathMastery: {
    trenches: 0,
    leverage: 0,
    yield: 0,
    narrative: 0,
    systematic: 0,
  },
  tools: [], // equipped tool ids, max 3 per run (enforced client-side)
});

// ---------------------------------------------------------------------------
// XP / Leveling curve
// ---------------------------------------------------------------------------
// XP required to reach the NEXT level from the current one. Mild exponential
// curve — keeps early levels fast (hook the player) and later levels a grind
// (retention), without needing a lookup table per level.
export function xpToNextLevel(currentLevel) {
  return Math.round(500 * Math.pow(currentLevel, 1.35));
}

export function levelFromTotalXp(totalXp) {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: xpToNextLevel(level) };
}

// ---------------------------------------------------------------------------
// Path & boss definitions
// ---------------------------------------------------------------------------
// id must be stable — used as a save-data key and API param, never rename
// without a migration.
// Hero/boss art lives in client/public/assets/{heroes,bosses}/<id>.png —
// filenames match path.id and path.boss.id exactly, so the client can
// build the URL as `/assets/heroes/${path.id}.png` with no lookup table.
export const PATHS = Object.freeze([
  {
    id: 'trenches',
    name: 'Memecoin & Trenches Degen',
    genre: 'endless-runner platforming',
    theme: 'Chaos, Speed, Snipes',
    identity:
      "These Warriors live in \"The Trenches\" — the raw, unfiltered launch zone where new pairs are born and die in minutes. They're gamblers of pure velocity: no thesis, no chart, just reflexes and gut. Trenches Degens worship the bonding curve like a rising sun and treat every new contract deploy as a coin flip they can win through speed alone.",
    loreBlurb:
      "In the Trenches, there's no time to think. A new pair goes live, the curve starts climbing, and you have maybe forty seconds before it's either a moonshot or a graveyard. Trenches Degens don't read whitepapers — there usually isn't one. They read momentum. They've been rugged more times than they can count, and every time, they come back faster, meaner, and a little more numb to the pain. Speed isn't their strategy. It's the only thing standing between them and becoming someone else's exit liquidity.",
    boss: {
      id: 'soft-rug-titan',
      name: 'Soft Rug Titan',
      represents:
        "The slow-bleed rug — not an instant honeypot, but a project that quietly drains liquidity while everyone's still holding, hoping.",
      loreBlurb:
        "The Soft Rug Titan doesn't strike fast. It smiles, it posts roadmap updates, it even airdrops a little hope right before it walks. By the time holders realize the liquidity is gone, the Titan is already three contracts away, wearing a new logo. It's not the biggest threat in the Trenches — it's the most patient one. And patience, in the Trenches, is a weapon nobody sees coming.",
    },
    masteryXpPerLevel: 400,
  },
  {
    id: 'leverage',
    name: 'Leverage & Chaos Traders',
    genre: 'tightrope balance',
    theme: 'Risk, Leverage, Gamble',
    identity:
      "These Warriors don't multiply their bags — they multiply their fate. Leverage Traders strap rocket fuel to every position, chasing 20x-100x outcomes with full knowledge that one wrong candle liquidates everything. They are addicted not to money, but to the feeling of being right at maximum stakes.",
    loreBlurb:
      'Leverage Traders speak a different language — funding rates, liquidation lines, cascades. To them, a normal trade without leverage feels like standing still. They chase the multiplier because the multiplier is the only thing loud enough to feel real anymore. Some call it addiction. They call it "sizing appropriately." Every Leverage Trader carries the memory of at least one position that went to zero in seconds — and every one of them went right back in the next day.',
    boss: {
      id: 'liquidation-cascade',
      name: 'Liquidation Cascade',
      represents:
        'The domino-effect wipeout — one big position gets liquidated, triggers the next, and the whole market convulses in seconds.',
      loreBlurb:
        "The Cascade doesn't fight you directly. It waits until leverage is stacked high across a thousand overconfident positions, then pulls one thread. What follows isn't a battle — it's an avalanche. Positions liquidate into positions, funding rates spike, and for a few brutal minutes the whole market seems to fall at once. Survivors don't say they beat the Cascade. They say they were lucky enough to be under-leveraged when it came.",
    },
    masteryXpPerLevel: 450,
  },
  {
    id: 'yield',
    name: 'DeFi & Yield Farmers Degen',
    genre: 'base-building / resource management',
    theme: 'Yield, Strategy, Chains',
    identity:
      "The strategists of the Mempool. While others gamble on candles, Yield Farmers build machines — staking, LPing, rebalancing across chains, hunting APY the way old-world traders hunted alpha. They believe patience and system design beat chaos every time, and they're usually right — until the system itself turns against them.",
    loreBlurb:
      "Yield Farmers don't chase pumps — they build pipelines. Stake here, LP there, hop chains before the emissions dry up, rebalance before the pool goes underwater. It's slow, methodical, almost peaceful work — right up until impermanent loss shows up and reminds you that even the smartest machine can bleed quietly for months before you notice. Farmers don't fear volatility. They fear the storm you don't see coming because you were staring at your dashboard instead of the horizon.",
    boss: {
      id: 'impermanent-loss-hydra',
      name: 'Impermanent Loss Hydra',
      represents:
        'IL — the silent multi-headed threat where every LP position bleeds value in a different way depending on which asset moves.',
      loreBlurb:
        "Cut off one head of the Hydra — rebalance one pool — and two more problems grow in its place. The Hydra doesn't attack with a single strike; it attacks with math, quietly compounding losses across every position you thought was \"passive income.\" Farmers who fight it well don't destroy it completely — they just learn to keep it fed just enough that it doesn't notice how much it's actually taking.",
    },
    masteryXpPerLevel: 500,
  },
  {
    id: 'narrative',
    name: 'Community & Narrative Degen',
    genre: 'tower-defense / rhythm hybrid',
    theme: 'Conviction, Memes, Tribe',
    identity:
      "These Warriors understand something the charts can't measure: a coin is only as strong as the story people believe about it. Narrative Degens build tribes, spread memes like wildfire, rally diamond hands during dumps, and defend the vibe itself as if it were the asset. They don't trade charts — they trade belief.",
    loreBlurb:
      "Long before a coin pumps, someone has to make people care. Narrative Degens are the ones posting at 3am, defending the project in replies nobody asked them to reply to, turning a joke into a movement. They know the real battle isn't on the chart — it's in the group chat, when the price is down 60% and half the room wants to leave. A Narrative Degen's real skill isn't calling tops. It's making sure the tribe doesn't fall apart when it matters most.",
    boss: {
      id: 'attention-vampire',
      name: 'Attention Vampire',
      represents:
        "FUD, hype cycles, and burnout — the thing that drains a community's belief until the tribe scatters.",
      loreBlurb:
        "The Attention Vampire doesn't attack the price. It attacks the story. It spreads doubt in the replies, exhausts the loudest believers, and waits for the moment conviction runs thin so it can drain what's left of the tribe's faith. Narrative Degens who beat it don't do it with better memes — they do it by refusing to let the group chat go quiet when it matters most.",
    },
    masteryXpPerLevel: 450,
  },
  {
    id: 'systematic',
    name: 'Systematic & Tooling Degen',
    genre: 'automation / pattern-matching puzzle',
    theme: 'Systems, Bots, Edge',
    identity:
      "The engineers of the Mempool. These Warriors don't trust feelings — they trust data, automation, and repeatable edge. They build bots, monitor cross-chain flows, and treat the entire market as a system to be optimized rather than a story to be believed. Cold, precise, and quietly the most feared path by everyone else, because systems don't panic.",
    loreBlurb:
      "While everyone else argues about vibes and narratives, Systematic Degens are watching the data feed scroll by, building the next edge before anyone else even notices the pattern exists. They don't get emotional about a dump — they get curious about why it happened, then automate the response for next time. Other Warriors think they're soulless. The Systematic Degens don't disagree. They just point out that their bots don't get rekt from FOMO.",
    boss: {
      id: 'market-adaptation-ai',
      name: 'Market Adaptation AI',
      represents:
        'The market itself evolving faster than your strategy — an edge that decays because everyone eventually copies it.',
      loreBlurb:
        "Every edge dies the moment enough people find it. The Market Adaptation AI isn't malicious — it's just the market itself, learning your patterns and pricing them out. Beat it once with a clever bot, and it studies exactly what you did. Systematic Degens don't defeat the Adaptation AI permanently. They just stay one iteration ahead of it, forever.",
    },
    masteryXpPerLevel: 550,
  },
]);

export function heroArtUrl(pathId) {
  return `/assets/heroes/${pathId}.png`;
}

export function bossArtUrl(pathId) {
  return `/assets/bosses/${getPath(pathId).boss.id}.png`;
}

export function getPath(pathId) {
  const path = PATHS.find((p) => p.id === pathId);
  if (!path) throw new Error(`Unknown path id: ${pathId}`);
  return path;
}

export const ALL_PATHS_MASTERED_ENDGAME_LEVEL = 10;

export function hasMasteredAllPaths(pathMastery) {
  return PATHS.every((p) => (pathMastery[p.id] ?? 0) >= ALL_PATHS_MASTERED_ENDGAME_LEVEL);
}

// ---------------------------------------------------------------------------
// Run economy — end-of-run conversion rules
// ---------------------------------------------------------------------------
// Bag earned in a run converts to PNL at cash-out. Keeping this as an
// explicit named function (not a bare multiplier) so both client preview
// UI and server-side validation call the exact same rule.
export function bagToPnl(bagAmount) {
  return Math.max(0, Math.round(bagAmount));
}

// Reputation gained per run is a function of PNL earned and whether a boss
// was defeated in that run — kept generous but capped so a single lucky run
// can't trivially outweigh consistent play.
export function reputationForRun({ pnlEarned, bossDefeated }) {
  const base = Math.min(400, Math.round(pnlEarned * 0.05));
  return base + (bossDefeated ? 150 : 0);
}

// Conviction Shards: rare currency, only from boss kills or a "flawless" run
// (health never dropped below 90 for the whole run).
export function convictionShardsForRun({ bossDefeated, flawless }) {
  let shards = 0;
  if (bossDefeated) shards += 1;
  if (flawless) shards += 1;
  return shards;
}

// ---------------------------------------------------------------------------
// Server-side sanity bounds — used to reject implausible save submissions
// (defense against a tampered client, not a full anti-cheat system).
// ---------------------------------------------------------------------------
export const SANITY_BOUNDS = Object.freeze({
  MAX_BAG_PER_RUN: 50000,        // generous ceiling for a single run's Bag
  MAX_PNL_DELTA_PER_SAVE: 50000,
  MAX_REPUTATION_DELTA_PER_SAVE: 600,
  MAX_XP_DELTA_PER_SAVE: 5000,
  MAX_CONVICTION_SHARDS_DELTA_PER_SAVE: 3,
});
