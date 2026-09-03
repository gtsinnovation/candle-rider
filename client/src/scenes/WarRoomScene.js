// client/src/scenes/WarRoomScene.js
//
// The hub / path-select screen (matches the "CANDLE RIDER — SELECT YOUR
// DEGEN WARRIOR" mock). Renders a card per path from the shared PATHS list,
// and hands off to a path scene on selection.
//
// The 5 path scenes themselves (Trenches, Leverage, Yield, Narrative,
// Systematic) are ported in from the standalone Three.js prototypes — this
// file only owns navigation, not gameplay.

import { PATHS, heroArtUrl, bossArtUrl } from '@candle-rider/shared';
import { eventBus } from '../core/EventBus.js';

let stylesInjected = false;
function injectResponsiveStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 768px) {
      #war-room {
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        justify-content: flex-start !important;
        padding: 20px 20px 20px 170px !important;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
      }
      #war-room > div { scroll-snap-align: center; flex-shrink: 0; }
    }
  `;
  document.head.appendChild(style);
}

export function mountWarRoom(container, gameState, onSelectPath) {
  injectResponsiveStyles();
  const el = document.createElement('div');
  el.id = 'war-room';
  el.style.cssText = `
    position: absolute; inset: 0; display: flex; gap: 12px;
    align-items: center; justify-content: center; flex-wrap: wrap;
    padding: 40px 40px 40px 300px; box-sizing: border-box;
    font-family: system-ui, sans-serif;
  `;
  container.appendChild(el);

  function render() {
    const state = gameState.snapshot();
    el.innerHTML = '';
    PATHS.forEach((path) => {
      const unlocked = state.unlockedPaths.includes(path.id);
      const mastery = state.pathMastery[path.id] ?? 0;

      const card = document.createElement('div');
      card.style.cssText = `
        width: 220px; min-height: 360px; border-radius: 10px; overflow: hidden;
        background: linear-gradient(180deg, #101024, #06060f);
        border: 1px solid ${unlocked ? '#3a3a6f' : '#222'};
        color: ${unlocked ? '#eef0ff' : '#555'};
        opacity: ${unlocked ? '1' : '0.5'};
        cursor: ${unlocked ? 'pointer' : 'not-allowed'};
      `;
      card.innerHTML = `
        <img src="${heroArtUrl(path.id)}" alt="${path.name}"
          style="width:100%; height:auto; display:block; ${unlocked ? '' : 'filter:grayscale(1);'}" />
        <div style="padding:12px 14px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:2px;">${path.name}</div>
          <div style="font-size:10px;color:#9a9ac0;margin-bottom:6px;">${path.theme}</div>
          <div style="font-size:11px;color:#9a9ac0;margin-bottom:10px;">${path.genre}</div>
          <div style="font-size:11px;margin-bottom:8px;">Mastery Lv. ${mastery}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <img src="${bossArtUrl(path.id)}" alt="${path.boss.name}"
              style="width:48px;height:48px;object-fit:cover;border-radius:6px;${unlocked ? '' : 'filter:grayscale(1);'}" />
            <div>
              <div style="font-size:9px;color:#7d7da0;text-transform:uppercase;letter-spacing:.5px;">Nemesis</div>
              <div style="font-size:10px;color:#eef0ff;font-weight:600;">${path.boss.name}</div>
            </div>
          </div>
        </div>
      `;

      if (unlocked) {
        card.addEventListener('click', () => {
          onSelectPath(path.id); // the scene starts the run itself at ape-in
        });
      }

      el.appendChild(card);
    });
  }

  render();
  const unsubscribe = eventBus.on('state:changed', render);
  return () => {
    unsubscribe();
    el.remove();
  };
}
