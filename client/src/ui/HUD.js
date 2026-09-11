// client/src/ui/HUD.js
// Minimal DOM-based HUD (stats panel) bound to GameState via the event bus.
// Intentionally framework-free — swap for a React/Canvas HUD later without
// touching GameState or SaveManager, they don't know this exists.

import { eventBus } from '../core/EventBus.js';
import { levelFromTotalXp } from '@candle-rider/shared';

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
  `;
  container.appendChild(el);

  function render(state) {
    // XP bar: players previously had NO visible indication of progress
    // toward anything — raw numbers only. Seeing a bar move every single
    // run is the cheapest, most effective retention mechanic there is.
    const { xpIntoLevel, xpForNextLevel } = levelFromTotalXp(state.xp ?? 0);
    const xpPct = Math.min(100, (xpIntoLevel / xpForNextLevel) * 100);
    const best = state.bestPnlRun ?? 0;
    el.innerHTML = `
      <div class="hud-title" style="font-size:16px;font-weight:700;margin-bottom:4px;">DEGEN WARRIOR LVL ${state.level}</div>
      <div style="height:6px;background:#1c1c34;border-radius:3px;overflow:hidden;margin-bottom:2px;">
        <div style="height:100%;width:${xpPct}%;background:linear-gradient(90deg,#7dffcf,#ffe066);border-radius:3px;transition:width .3s;"></div>
      </div>
      <div style="font-size:10px;color:#7d7da0;margin-bottom:8px;">${Math.round(xpIntoLevel)} / ${xpForNextLevel} XP</div>
      <div>Bag: $${Math.round(state.bag ?? 0).toLocaleString()}</div>
      <div>PNL: ${(state.pnl ?? 0).toFixed(2)}</div>
      <div>Health: ${Math.round(state.health)}%</div>
      <div>Energy: ${Math.round(state.energy)}%</div>
      <div>Conviction: ${Math.round(state.conviction)}%</div>
      <div>Reputation: ${(state.reputation ?? 0).toLocaleString()}</div>
      <div>Conviction Shards: ${state.convictionShards ?? 0}</div>
      ${best > 0 ? `<div style="margin-top:6px;color:#ffe066;">Best run: $${best.toLocaleString()}</div>` : ''}
    `;
  }

  render(gameState.snapshot());
  const unsubscribe = eventBus.on('state:changed', render);
  return () => {
    unsubscribe();
    el.remove();
  };
}
