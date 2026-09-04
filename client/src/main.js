// client/src/main.js
// Boot sequence: load/create save -> mount HUD -> mount War Room hub.
// Path scenes mount into the same #app container as the hub and hand
// control back via their returned teardown fn + an onRunEnd callback that
// remounts the War Room.

import { GameState } from './core/GameState.js';
import { SaveManager } from './core/SaveManager.js';
import { mountHUD } from './ui/HUD.js';
import { mountInstallPrompt } from './ui/InstallPrompt.js';
import { mountWarRoom } from './scenes/WarRoomScene.js';
import { mountTrenchesScene } from './scenes/paths/TrenchesScene.js';
import { eventBus } from './core/EventBus.js';
import { sfx } from './core/AudioEngine.js';

// Fallback for mobile browsers that don't support the CSS `dvh` unit yet —
// sets an --app-height custom property from the actual visible viewport
// (window.innerHeight already correctly excludes the address bar on most
// mobile browsers). Re-measured on resize/orientation change since the
// address bar showing/hiding changes this value live.
function updateAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}
updateAppHeight();
window.addEventListener('resize', updateAppHeight);
window.addEventListener('orientationchange', updateAppHeight);

// Only Trenches is ported so far. Add each path scene here as it's built —
// the War Room already renders cards for all 5 from shared/economy.js, it
// just falls back to a console warning for paths not in this map yet.
const PATH_SCENES = {
  trenches: mountTrenchesScene,
};

async function boot() {
  const container = document.getElementById('app');

  try {
    const gameState = new GameState();
    const saveManager = new SaveManager(gameState);
    await saveManager.load(); // populates gameState from backend/local mirror; now has a 5s timeout, can no longer hang forever

    mountHUD(container, gameState);
    mountInstallPrompt(container);

    // Logs every voluntary cash-out to the backend for the leaderboard.
    // Losses (rug/liquidation/burnout) aren't logged as run results — they
    // still update permanent state via GameState.loseRun (bag resets to 0),
    // which the debounced save picks up regardless.
    eventBus.on('run:cashout', (result) => {
      saveManager.reportRunResult(result);
    });

    eventBus.on('player:levelUp', ({ level }) => {
      sfx.levelUp();
      showLevelUpBanner(container, level);
    });

    let teardownScene = null;

    function showHub() {
      teardownScene?.();
      teardownScene = mountWarRoom(container, gameState, (pathId) => {
        const mountScene = PATH_SCENES[pathId];
        if (!mountScene) {
          console.warn(`[main] No scene ported yet for path "${pathId}" -- staying in hub.`);
          gameState.loseRun('scene-not-implemented'); // undo the startRun() the card click triggered
          return;
        }
        teardownScene?.();
        teardownScene = mountScene(container, gameState, showHub);
      });
    }

    showHub();

    // Save on tab close so the last few seconds of state aren't lost to the
    // debounce window.
    window.addEventListener('beforeunload', () => {
      saveManager.saveNow();
    });
  } catch (err) {
    // Never leave a silent blank screen — this is what let the mobile
    // black-screen bug go undiagnosed. Any startup failure now shows a
    // visible message with the actual error, plus a retry button.
    console.error('[main] boot failed:', err);
    showBootError(container, err);
  }
}

function showLevelUpBanner(container, level) {
  const banner = document.createElement('div');
  banner.style.cssText = `
    position:absolute; top:22%; left:50%; transform:translate(-50%,-50%) scale(0.85);
    z-index:100; text-align:center; font-family:system-ui,sans-serif;
    pointer-events:none; opacity:0; transition:opacity .3s, transform .3s;
  `;
  banner.innerHTML = `
    <div style="font-size:14px; letter-spacing:3px; color:#ffe066; text-shadow:0 0 10px rgba(255,224,102,.6);">LEVEL UP</div>
    <div style="font-size:44px; font-weight:800; color:#7dffcf; text-shadow:0 0 20px rgba(125,255,207,.7);">LVL ${level}</div>
  `;
  container.appendChild(banner);
  requestAnimationFrame(() => {
    banner.style.opacity = '1';
    banner.style.transform = 'translate(-50%,-50%) scale(1)';
  });
  setTimeout(() => {
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 350);
  }, 2200);
}

function showBootError(container, err) {
  container.innerHTML = `
    <div style="
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      flex-direction:column; background:#050510; color:#eef0ff; text-align:center;
      font-family: system-ui, sans-serif; padding:24px; box-sizing:border-box;
    ">
      <div style="font-size:20px; font-weight:700; color:#ff6688; margin-bottom:8px;">Couldn't start Candle Rider</div>
      <div style="font-size:12px; color:#9a9ac0; max-width:400px; margin-bottom:6px;">
        ${err?.message ? String(err.message).slice(0, 200) : 'Unknown error during startup.'}
      </div>
      <div style="font-size:11px; color:#6f6f95; max-width:400px; margin-bottom:18px;">
        This is most likely a network issue reaching the game server. Check your connection and try again.
      </div>
      <button onclick="location.reload()" style="
        background:#7dffcf; color:#05100c; border:none; padding:10px 24px;
        border-radius:7px; font-size:13px; font-weight:700; cursor:pointer;
      ">RETRY</button>
    </div>
  `;
}

boot();

// Register the PWA service worker (production only — skip in Vite dev mode
// where hot-reload and a stale cache actively fight each other).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[main] service worker registration failed (non-fatal):', err.message);
    });
  });
}
