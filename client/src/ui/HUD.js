// client/src/ui/HUD.js
// Minimal DOM-based HUD (stats panel) bound to GameState via the event bus.
// Intentionally framework-free — swap for a React/Canvas HUD later without
// touching GameState or SaveManager, they don't know this exists.

import { eventBus } from '../core/EventBus.js';

export function mountHUD(container, gameState) {
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
    el.innerHTML = `
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">DEGEN WARRIOR LVL ${state.level}</div>
      <div>Bag: $${Math.round(state.bag ?? 0).toLocaleString()}</div>
      <div>PNL: ${(state.pnl ?? 0).toFixed(2)}</div>
      <div>Health: ${Math.round(state.health)}%</div>
      <div>Energy: ${Math.round(state.energy)}%</div>
      <div>Conviction: ${Math.round(state.conviction)}%</div>
      <div>Reputation: ${(state.reputation ?? 0).toLocaleString()}</div>
      <div>Conviction Shards: ${state.convictionShards ?? 0}</div>
    `;
  }

  render(gameState.snapshot());
  const unsubscribe = eventBus.on('state:changed', render);
  return () => {
    unsubscribe();
    el.remove();
  };
}
