// Minimal DOM-based HUD (stats panel) bound to GameState via the event bus.
// Intentionally framework-free — swap for a React/Canvas HUD later without
// touching GameState or SaveManager, they don't know this exists.
//
// Builds its DOM structure ONCE and keeps references to the value text
// nodes, so a state:changed event (which fires every frame during a run
// because addBag/reportEnergy mutate state continuously) only updates
// textContent — never rebuilds innerHTML 60×/sec.

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
  `;
  container.appendChild(el);

  // Static structure built once; only the <span> text nodes update per tick.
  el.innerHTML = `
    <div class="hud-title" style="font-size:16px;font-weight:700;margin-bottom:6px;">DEGEN WARRIOR LVL <span data-stat="level">1</span></div>
    <div>Bag: $<span data-stat="bag">0</span></div>
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
    pnl: el.querySelector('[data-stat="pnl"]'),
    health: el.querySelector('[data-stat="health"]'),
    energy: el.querySelector('[data-stat="energy"]'),
    conviction: el.querySelector('[data-stat="conviction"]'),
    reputation: el.querySelector('[data-stat="reputation"]'),
    convictionShards: el.querySelector('[data-stat="convictionShards"]'),
  };

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
  const unsubscribe = eventBus.on('state:changed', render);
  return () => {
    unsubscribe();
    el.remove();
  };
}
