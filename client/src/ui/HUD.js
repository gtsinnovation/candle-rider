// DOM-based HUD (stats panel) bound to GameState via the event bus.
// Intentionally framework-free — swap for a React/Canvas HUD later without
// touching GameState or SaveManager, they don't know this exists.
//
// The HUD subscribes to EVERY game event so the interface reacts in
// real-time to gameplay, not just stat ticks:
//   state:changed  → update the stat text nodes (fires every frame during a run)
//   run:started    → cyan panel flash (a new run began)
//   run:bagChanged → Bag line tints green while gaining, red on a loss
//   run:lost       → red panel flash (rug / void / burnout / liquidation)
//   run:cashout    → green panel flash + "banked" banner
//   player:levelUp → gold panel flash + level-up banner
// All subscriptions are returned for clean teardown.

import { eventBus } from '../core/EventBus.js';

let stylesInjected = false;
function injectResponsiveStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 480px) {
      #hud { width: 150px !important; padding: 10px !important; font-size: 10px !important; }
      #hud .hud-title { font-size: 12px !important; }
    }
  `;
  document.head.appendChild(style);
}

export function mountHUD(container, gameState) {
  injectResponsiveStyles();
  const el = document.createElement('div');
  el.id = 'hud';
  el.style.cssText = `
    position: absolute; top: 0; left: 0; width: 260px; padding: 16px;
    color: #f5f5ff; font-family: system-ui, sans-serif; font-size: 12px;
    background: radial-gradient(circle at top, #181830 0, #050510 60%);
    box-sizing: border-box; z-index: 10;
    transition: box-shadow .15s ease, border-color .15s ease;
    border: 1px solid transparent;
  `;
  container.appendChild(el);

  // Static structure built once; only the <span> text nodes update per tick.
  el.innerHTML = `
    <div class="hud-title" style="font-size:16px;font-weight:700;margin-bottom:6px;">DEGEN WARRIOR LVL <span data-stat="level">1</span></div>
    <div data-line="bag">Bag: $<span data-stat="bag">0</span></div>
    <div>PNL: <span data-stat="pnl">0.00</span></div>
    <div>Health: <span data-stat="health">100</span>%</div>
    <div>Energy: <span data-stat="energy">100</span>%</div>
    <div>Conviction: <span data-stat="conviction">50</span>%</div>
    <div>Reputation: <span data-stat="reputation">0</span></div>
    <div>Conviction Shards: <span data-stat="convictionShards">0</span></div>
  `;
  const nodes = {
    level: el.querySelector('[data-stat="level"]'),
    bag: el.querySelector('[data-stat="bag"]'),
    bagLine: el.querySelector('[data-line="bag"]'),
    pnl: el.querySelector('[data-stat="pnl"]'),
    health: el.querySelector('[data-stat="health"]'),
    energy: el.querySelector('[data-stat="energy"]'),
    conviction: el.querySelector('[data-stat="conviction"]'),
    reputation: el.querySelector('[data-stat="reputation"]'),
    convictionShards: el.querySelector('[data-stat="convictionShards"]'),
  };

  // ---- Event-driven visual feedback -----------------------------------
  let flashTimer = null;
  function flash(color, ms = 600) {
    el.style.boxShadow = `0 0 26px ${color}, inset 0 0 20px ${color}`;
    el.style.borderColor = color;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      el.style.boxShadow = '';
      el.style.borderColor = 'transparent';
    }, ms);
  }

  // Bag line tints green while gaining, red on a loss. run:bagChanged fires
  // every frame while riding a green candle, so the line stays green during
  // a gain streak and flashes red the instant a red candle drains Bag.
  let lastBag = gameState.snapshot().bag ?? 0;
  let bagTintTimer = null;
  function tintBag(bag) {
    if (bag > lastBag) nodes.bagLine.style.color = '#7dffcf';
    else if (bag < lastBag) nodes.bagLine.style.color = '#ff5577';
    lastBag = bag;
    clearTimeout(bagTintTimer);
    bagTintTimer = setTimeout(() => { nodes.bagLine.style.color = ''; }, 450);
  }

  // Transient banner for level-up / cash-out milestones.
  let bannerTimer = null;
  function showBanner(text, color) {
    let banner = el.querySelector('.hud-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'hud-banner';
      banner.style.cssText = 'font-size:14px;font-weight:700;margin-top:8px;opacity:0;transition:opacity .3s;';
      el.appendChild(banner);
    }
    banner.textContent = text;
    banner.style.color = color;
    banner.style.opacity = '1';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner.style.opacity = '0'; }, 1800);
  }

  // ---- Stat text updates (every state:changed) ------------------------
  function render(state) {
    nodes.level.textContent = state.level;
    nodes.bag.textContent = Math.round(state.bag ?? 0).toLocaleString();
    nodes.pnl.textContent = (state.pnl ?? 0).toFixed(2);
    nodes.health.textContent = Math.round(state.health);
    nodes.energy.textContent = Math.round(state.energy);
    nodes.conviction.textContent = Math.round(state.conviction);
    nodes.reputation.textContent = (state.reputation ?? 0).toLocaleString();
    nodes.convictionShards.textContent = state.convictionShards ?? 0;
  }

  render(gameState.snapshot());

  const unsubs = [
    eventBus.on('state:changed', render),
    eventBus.on('run:started', () => flash('#7dffcf', 600)),
    eventBus.on('run:bagChanged', ({ bag }) => tintBag(bag)),
    eventBus.on('run:lost', () => {
      flash('#ff3355', 800);
      showBanner('RUN OVER', '#ff5577');
    }),
    eventBus.on('run:cashout', (r) => {
      flash('#7dffcf', 1000);
      showBanner(`+$${(r?.pnlEarned ?? 0).toLocaleString()} PNL BANKED`, '#7dffcf');
    }),
    eventBus.on('player:levelUp', ({ level }) => {
      flash('#ffd166', 1000);
      showBanner(`LEVEL UP! → ${level}`, '#ffd166');
    }),
  ];

  return () => {
    unsubs.forEach((u) => u && u());
    clearTimeout(flashTimer);
    clearTimeout(bagTintTimer);
    clearTimeout(bannerTimer);
    el.remove();
  };
}
