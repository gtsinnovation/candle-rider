// client/src/ui/runHighlight.js
//
// Picks the single most REMARKABLE TRUE fact about a run, to headline the
// shareable card and its share text.
//
// Why this exists: a fixed share sentence means 5,000 players post ~5
// identical strings. Platforms actively deduplicate near-identical text,
// so templated copy suppresses its own reach — that's a distribution
// problem, not an aesthetic one. Wordle's share works despite being fully
// templated because the grid encodes YOUR specific solve; the wrapper is
// fixed, the payload is unique. This is our equivalent: the phrasing is
// authored, but which fact gets surfaced emerges from actual play, so it
// varies naturally run to run.
//
// Each candidate carries a rarity score. Higher = more worth leading with.
// Near-misses beat round numbers: "$12 short of my best" is a better story
// than "$1,600 banked", and it can only happen to one player at a time.

function pct(a, b) {
  return b > 0 ? (a / b) * 100 : 0;
}

/**
 * @returns {{text: string, score: number, kind: string}}
 */
export function pickRunHighlight(d) {
  const candidates = [];
  const amount = `$${Math.round(d.pnl).toLocaleString()}`;
  const add = (score, kind, text) => candidates.push({ score, kind, text });

  // --- Near-miss on personal best: the single most dramatic outcome ---
  if (!d.isNewBest && d.previousBest > 0 && d.pnl > 0) {
    const shortBy = d.previousBest - d.pnl;
    const shortPct = pct(shortBy, d.previousBest);
    if (shortBy > 0 && shortPct <= 2) {
      add(100, 'agonising-near-miss', `${amount} — $${Math.round(shortBy).toLocaleString()} short of my best. ${shortPct < 1 ? 'One candle.' : 'Agonising.'}`);
    } else if (shortBy > 0 && shortPct <= 8) {
      add(80, 'near-miss', `${amount}, just $${Math.round(shortBy).toLocaleString()} off my personal best.`);
    }
  }

  // --- New personal best, scaled by how decisively it beat the old one ---
  if (d.isNewBest && d.survived) {
    if (d.previousBest > 0) {
      const mult = d.pnl / d.previousBest;
      if (mult >= 2) add(95, 'best-smashed', `New best — ${amount}, more than double my last record.`);
      else add(78, 'best', `New personal best: ${amount}.`);
    } else {
      add(60, 'first-best', `First cash-out on ${d.coinSymbol}: ${amount} banked.`);
    }
  }

  // --- Cashed out on fumes: nerve, and rare ---
  if (d.survived && d.energyAtEnd <= 8) {
    add(92, 'fumes', `Cashed out ${amount} with ${Math.round(d.energyAtEnd)}% conviction left. Any longer and it was gone.`);
  } else if (d.survived && d.energyAtEnd <= 18) {
    add(70, 'low-fumes', `Held to ${Math.round(d.energyAtEnd)}% conviction, then took ${amount}.`);
  }

  // --- Died with a big streak running: the fall from height ---
  if (!d.survived && d.bestStreak >= 12) {
    add(90, 'streak-death', `x${d.bestStreak} streak on ${d.coinSymbol}, then it all went. ${amount} gone.`);
  } else if (!d.survived && d.bestStreak >= 7) {
    add(68, 'streak-death-small', `x${d.bestStreak} streak, then ${amount} evaporated.`);
  }

  // --- Died mid-event: names a specific dramatic moment ---
  if (!d.survived && d.eventAtEnd === 'fud') {
    add(85, 'died-in-fud', `The FUD wave took me and ${amount} with it.`);
  } else if (!d.survived && d.eventAtEnd === 'pump') {
    add(75, 'died-in-pump', `Died mid-pump. ${amount} on the table.`);
  }

  // --- Rank milestones ---
  if (d.rank && d.rank.total >= 10) {
    if (d.rank.rank === 1) add(98, 'rank-1', `${amount} on ${d.coinSymbol}. Currently #1 in the trenches.`);
    else if (d.rank.rank <= 3) add(88, 'rank-podium', `${amount} — #${d.rank.rank} globally.`);
    else if (d.rank.rank <= 10) add(76, 'rank-top10', `${amount}, good for #${d.rank.rank} of ${d.rank.total.toLocaleString()}.`);
  }

  // --- Flawless: never took damage ---
  if (d.survived && d.minHealthSeen >= 100 && d.greenLandings >= 10) {
    add(82, 'flawless', `${amount} on ${d.coinSymbol} without taking a single hit.`);
  }

  // --- Perfect read: lots of greens, almost no reds ---
  if (d.greenLandings >= 12 && d.redLandings === 0) {
    add(80, 'clean-read', `${d.greenLandings} green landings, zero reds. ${amount}.`);
  }

  // --- Died almost immediately: funny, and very shareable ---
  if (!d.survived && d.durationSec <= 6) {
    add(72, 'instant-death', `Lasted ${Math.round(d.durationSec)} seconds on ${d.coinSymbol}. Humbling.`);
  }

  // --- Marathon run ---
  if (d.durationSec >= 40) {
    add(66, 'marathon', `${Math.round(d.durationSec)}s on ${d.coinSymbol} for ${amount}.`);
  }

  // --- Hardest coins carry their own bragging rights ---
  if (d.survived && (d.coinId === 'legend' || d.coinId === 'apemax') && d.pnl > 0) {
    add(64, 'hard-coin', `Cashed ${amount} out of ${d.coinSymbol}. ${d.coinAxis} is no joke.`);
  }

  // --- Fallback: always return something true ---
  add(10, 'plain', d.survived
    ? `Rode ${d.coinSymbol} to ${amount} and cashed out.`
    : `Rode ${d.coinSymbol} to ${amount} before it went.`);

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/** All candidates, highest first — useful for debugging the scoring. */
export function debugHighlights(d) {
  const top = pickRunHighlight(d);
  return { chosen: top };
}
