// client/src/ui/HUD.js
// Minimal DOM-based HUD (stats panel) bound to GameState via the event bus.
// Intentionally framework-free — swap for a React/Canvas HUD later without
// touching GameState or SaveManager, they don't know this exists.
//
// i7: the markup is built ONCE and thereafter only `textContent` is
// written. The previous version rebuilt the entire innerHTML on every
// `state:changed` event — which fires on every energy tick, i.e. up to
// 60x/second during a run — forcing a full parse + layout each time.
// Paints are also coalesced to one per animation frame, so a burst of
// state changes within a single frame costs exactly one repaint.

import { eventBus } from '../core/EventBus.js';
import { levelFromTotalXp } from '@candle-rider/shared';

let stylesInjected = false;
function injectResponsiveStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    /* Cyberpunk gold wordmark. The gradient is painted onto the text via
       background-clip; a layered drop-shadow does the neon bleed — a single
       flat glow reads dull, whereas a tight warm halo under a wider amber
       one gives it the lit-sign look. */
    #hud .hud-name {
      font-size: 19px; font-weight: 900; letter-spacing: 2.5px; line-height: 1.05;
      background: linear-gradient(180deg,#fff6cf 0%,#ffd700 42%,#e8a317 72%,#a86b00 100%);
      -webkit-background-clip: text; background-clip: text;
      color: transparent; -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 0 6px rgba(255,200,60,.55)) drop-shadow(0 0 16px rgba(255,160,0,.3));
    }
    #hud .hud-sub {
      font-size: 10px; font-weight: 700; letter-spacing: 5.5px; margin-top: 2px;
      color: #ffe9a8; text-shadow: 0 0 7px rgba(255,205,80,.75), 0 0 18px rgba(255,150,0,.35);
    }
    #hud .hud-lvl {
      font-size: 11px; font-weight: 700; letter-spacing: 2px; margin-top: 5px;
      color: #7dffcf; text-shadow: 0 0 8px rgba(125,255,207,.5);
    }
    @media (max-width: 480px) {
      #hud { width: 150px !important; padding: 10px !important; font-size: 10px !important; }
      #hud .hud-name { font-size: 14px !important; letter-spacing: 1.5px !important; }
      #hud .hud-sub { font-size: 8px !important; letter-spacing: 3.5px !important; }
      #hud .hud-lvl { font-size: 10px !important; }
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
  `;

  // ---- built once ----
  el.innerHTML = `
    <div class="hud-title" style="margin-bottom:6px;">
      <div class="hud-name">DEGEN WARRIOR</div>
      <div class="hud-sub">CANDLE RIDER</div>
      <div class="hud-lvl">LVL <span data-f="level">1</span></div>
    </div>
    <div style="height:6px;background:#1c1c34;border-radius:3px;overflow:hidden;margin-bottom:2px;">
      <div data-bar="xp" style="height:100%;width:0%;background:linear-gradient(90deg,#7dffcf,#ffe066);border-radius:3px;transition:width .3s;"></div>
    </div>
    <div style="font-size:10px;color:#7d7da0;margin-bottom:8px;"><span data-f="xpText">0 / 0</span> XP</div>
    <div>Bag: $<span data-f="bag">0</span></div>
    <div>PNL: <span data-f="pnl">0.00</span></div>
    <div>Health: <span data-f="health">100</span>%</div>
    <div>Energy: <span data-f="energy">100</span>%</div>
    <div>Conviction: <span data-f="conviction">50</span>%</div>
    <div>Reputation: <span data-f="reputation">0</span></div>
    <div>Conviction Shards: <span data-f="shards">0</span></div>
    <div data-row="best" style="margin-top:6px;color:#ffe066;display:none;">Best run: $<span data-f="best">0</span></div>
  `;
  container.appendChild(el);

  // Cache node references once so paint() never queries the DOM.
  const fields = {};
  el.querySelectorAll('[data-f]').forEach((node) => { fields[node.dataset.f] = node; });
  const xpBar = el.querySelector('[data-bar="xp"]');
  const bestRow = el.querySelector('[data-row="best"]');

  // Only write when the value actually changed — avoids touching the DOM
  // at all for the many ticks where a given field is unchanged.
  const shown = {};
  function set(key, value) {
    if (shown[key] === value) return;
    shown[key] = value;
    fields[key].textContent = value;
  }

  function paint(state) {
    const { xpIntoLevel, xpForNextLevel } = levelFromTotalXp(state.xp ?? 0);
    const xpPct = Math.min(100, (xpIntoLevel / xpForNextLevel) * 100);
    if (shown.xpPct !== xpPct) {
      shown.xpPct = xpPct;
      xpBar.style.width = `${xpPct}%`;
    }
    set('level', state.level);
    set('xpText', `${Math.round(xpIntoLevel)} / ${xpForNextLevel}`);
    set('bag', Math.round(state.bag ?? 0).toLocaleString());
    set('pnl', (state.pnl ?? 0).toFixed(2));
    set('health', Math.round(state.health));
    set('energy', Math.round(state.energy));
    set('conviction', Math.round(state.conviction));
    set('reputation', (state.reputation ?? 0).toLocaleString());
    set('shards', state.convictionShards ?? 0);

    const best = state.bestPnlRun ?? 0;
    if (shown.bestVisible !== (best > 0)) {
      shown.bestVisible = best > 0;
      bestRow.style.display = best > 0 ? 'block' : 'none';
    }
    if (best > 0) set('best', best.toLocaleString());
  }

  // Coalesce to one paint per frame regardless of how many state:changed
  // events fire in between.
  let queued = null;
  let latest = null;
  function schedule(state) {
    latest = state;
    if (queued !== null) return;
    queued = requestAnimationFrame(() => {
      queued = null;
      paint(latest);
    });
  }

  paint(gameState.snapshot());
  const unsubscribe = eventBus.on('state:changed', schedule);
  return () => {
    unsubscribe();
    if (queued !== null) cancelAnimationFrame(queued);
    el.remove();
  };
}
