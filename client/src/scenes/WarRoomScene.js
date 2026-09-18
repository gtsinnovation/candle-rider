// client/src/scenes/WarRoomScene.js
//
// The hub / path-select screen (matches the "CANDLE RIDER — SELECT YOUR
// DEGEN WARRIOR" mock). Renders a card per path from the shared PATHS list,
// and hands off to a path scene on selection.
//
// The 5 path scenes themselves (Trenches, Leverage, Yield, Narrative,
// Systematic) are ported in from the standalone Three.js prototypes — this
// file only owns navigation, not gameplay.

import { PATHS, heroArtUrl } from '@candle-rider/shared';
import { eventBus } from '../core/EventBus.js';
import { mountLeaderboard } from '../ui/Leaderboard.js';

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
    padding: 40px 300px 40px 40px; box-sizing: border-box;
    font-family: system-ui, sans-serif;
  `;
  container.appendChild(el);

  // Standings entry point. The leaderboard API existed for a while with no
  // UI at all — rank showed on result cards but players couldn't browse or
  // see who to chase, which is most of the competitive pull.
  const lbButton = document.createElement('button');
  lbButton.textContent = '🏆 TOP DEGEN TRENCHER';
  lbButton.style.cssText = `
    position:absolute; top:16px; right:18px; z-index:20;
    background:linear-gradient(90deg,rgba(255,215,0,.14),rgba(24,255,110,.14));
    color:#ffe066; border:1px solid rgba(255,215,0,.65);
    border-radius:8px; padding:9px 15px; font-size:12px; font-weight:800;
    letter-spacing:1px; cursor:pointer; font-family:system-ui,sans-serif;
  `;
  lbButton.addEventListener('click', () => {
    mountLeaderboard(container, { playerId: localStorage.getItem('candlerider:playerId') });
  });
  container.appendChild(lbButton);

  // i7: cards are built ONCE. The previous version cleared innerHTML and
  // rebuilt all five cards — including their <img> tags — on every
  // state:changed event. Those five hero images total ~18.8MB, so each
  // update forced the browser to tear down and re-decode all of them.
  // Only the mastery line actually changes, so that's all we repaint.
  const masteryFields = {};

  function buildCards() {
    const state = gameState.snapshot();
    el.innerHTML = '';
    PATHS.forEach((path) => {
      const unlocked = state.unlockedPaths.includes(path.id);

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
          style="width:100%; height:200px; object-fit:contain; background:#050510; ${unlocked ? '' : 'filter:grayscale(1);'}" />
        <div style="padding:12px 14px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:2px;">${path.name}</div>
          <div style="font-size:10px;color:#9a9ac0;margin-bottom:6px;">${path.theme}</div>
          <div style="font-size:11px;color:#9a9ac0;margin-bottom:10px;">${path.genre}</div>
          <div data-mastery style="font-size:11px;margin-bottom:4px;"></div>
          <div style="font-size:10px;color:#7d7da0;">Boss: ${path.boss.name}</div>
        </div>
      `;
      masteryFields[path.id] = card.querySelector('[data-mastery]');

      if (unlocked) {
        card.addEventListener('click', () => {
          gameState.startRun(path.id);
          onSelectPath(path.id);
        });
      }

      el.appendChild(card);
    });
  }

  function paintMastery() {
    const state = gameState.snapshot();
    PATHS.forEach((path) => {
      const field = masteryFields[path.id];
      if (!field) return;
      const text = `Mastery Lv. ${state.pathMastery[path.id] ?? 0}`;
      if (field.textContent !== text) field.textContent = text;
    });
  }

  buildCards();
  paintMastery();
  const unsubscribe = eventBus.on('state:changed', paintMastery);
  return () => {
    unsubscribe();
    lbButton.remove();
    el.remove();
  };
}
