// client/src/ui/ResultCard.js
//
// Renders a run result as a real downloadable/copyable IMAGE, not a text
// overlay. This is the actual viral artifact: a share button with nothing
// to share is just a link to a homepage, and nobody clicks those. The card
// carries the numbers worth bragging about (PNL, rank, streak, coin ridden)
// plus the Bag chart line, so it reads as evidence rather than a claim.
//
// Drawn on a 2D canvas at 2x for crisp output on retina/phone screens.

import { pickRunHighlight } from './runHighlight.js';

const CARD_W = 600;
const CARD_H = 380;
const SCALE = 2;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {object} data
 * @param {number} data.pnl            final banked PNL (or forfeited amount on a loss)
 * @param {boolean} data.survived      true = cashed out, false = wiped
 * @param {string} data.coinSymbol     e.g. "$APEMAX"
 * @param {string} data.coinAxis       e.g. "Speed"
 * @param {number} data.bestStreak     peak streak this run
 * @param {number} data.durationSec    run length
 * @param {number[]} data.bagHistory   rolling bag samples for the sparkline
 * @param {{rank:number,total:number}|null} data.rank
 * @param {boolean} data.isNewBest
 * @returns {HTMLCanvasElement}
 */
export function renderResultCard(data) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  const win = data.survived;
  const accent = win ? '#18ff6e' : '#ff3355';

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#0b1410');
  bg.addColorStop(1, '#04060a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // accent frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  roundRect(ctx, 8, 8, CARD_W - 16, CARD_H - 16, 14);
  ctx.stroke();

  // faint grid, echoes the in-game floor
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 30; x < CARD_W; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, CARD_H - 10); ctx.stroke();
  }
  for (let y = 30; y < CARD_H; y += 30) {
    ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(CARD_W - 10, y); ctx.stroke();
  }

  // header
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = '#7d7da0';
  ctx.fillText('CANDLE RIDER — THE TRENCHES', 30, 44);

  // verdict
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(win ? 'CASHED OUT' : 'REKT', 30, 82);

  // headline number
  ctx.font = 'bold 62px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  const amount = `$${Math.round(data.pnl).toLocaleString()}`;
  ctx.fillText(amount, 30, 150);

  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = win ? '#9fd8c8' : '#ff9aa8';
  // The loss subtitle is passed in per death type — hardcoding "held too
  // long" told players who missed a jump that they'd been greedy, which
  // is both wrong and undercuts the regret hook the card relies on.
  ctx.fillText(win ? 'banked' : (data.subtitle || 'forfeited'), 30, 174);

  // Highlight line — the run's most remarkable true fact, chosen by
  // runHighlight.js. This is the card's individuating payload: the same
  // layout every time, but the fact surfaced emerges from actual play, so
  // no two cards read identically.
  const highlight = pickRunHighlight(data);
  if (highlight && highlight.kind !== 'plain') {
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffe066';
    // manual wrap into the ~270px left column so long lines don't run
    // under the sparkline
    const words = highlight.text.split(' ');
    const lines = [];
    let cur = '';
    words.forEach((w) => {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > 268 && cur) { lines.push(cur); cur = w; }
      else cur = test;
    });
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, 30, 200 + i * 18));
  }

  // stat row
  const stats = [
    ['COIN', data.coinSymbol],
    ['AXIS', data.coinAxis],
    ['PEAK STREAK', `x${data.bestStreak}`],
    ['SURVIVED', `${Math.round(data.durationSec)}s`],
  ];
  let sx = 30;
  stats.forEach(([label, value]) => {
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#6f6f95';
    ctx.fillText(label, sx, CARD_H - 76);
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = '#eef0ff';
    ctx.fillText(value, sx, CARD_H - 54);
    sx += 128;
  });

  // rank — the line that turns a number into a brag
  if (data.rank) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffe066';
    ctx.fillText(
      `RANK #${data.rank.rank} of ${data.rank.total.toLocaleString()} degens`,
      30, CARD_H - 24
    );
  } else {
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#6f6f95';
    ctx.fillText('candlerider.degenwarrior.io', 30, CARD_H - 24);
  }

  // bag sparkline, right side
  const hist = (data.bagHistory || []).filter((n) => Number.isFinite(n));
  if (hist.length > 1) {
    const px = 330, py = 70, pw = 240, ph = 150;
    const min = Math.min(...hist), max = Math.max(...hist);
    const span = max - min || 1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = px + (i / (hist.length - 1)) * pw;
      const y = py + ph - ((v - min) / span) * ph;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // fill under the curve
    ctx.lineTo(px + pw, py + ph);
    ctx.lineTo(px, py + ph);
    ctx.closePath();
    ctx.fillStyle = win ? 'rgba(24,255,110,0.10)' : 'rgba(255,51,85,0.10)';
    ctx.fill();

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#6f6f95';
    ctx.textAlign = 'right';
    ctx.fillText('BAG OVER TIME', px + pw, py - 10);
    ctx.textAlign = 'left';
  }

  return canvas;
}

// Clipboard write can fail (permissions, http origin, older browsers), so
// callers get a boolean rather than an exception to handle.
export async function copyCardToClipboard(canvas) {
  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export function downloadCard(canvas, filename = 'candle-rider-run.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Deep link drops the recipient straight into the SAME coin — a concrete
// challenge ("beat my $APEMAX run") converts far better than a generic
// link to a homepage.
export function buildShareText(data, origin) {
  const base = origin || 'https://candlerider.degenwarrior.io';
  const link = `${base}/?coin=${encodeURIComponent(data.coinId)}`;
  const rankBit = data.rank ? ` #${data.rank.rank} globally.` : '';
  // Lead with the run's most remarkable TRUE fact rather than a fixed
  // sentence — see runHighlight.js for why that matters for reach.
  const highlight = pickRunHighlight(data);
  const line = `${highlight.text}${highlight.kind.startsWith('rank') ? '' : rankBit}`;
  return { text: `${line} Beat that 👇`, link, highlight };
}
