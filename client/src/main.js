// client/src/main.js
// Boot sequence: load/create save -> mount HUD -> mount War Room hub.
// Path scenes mount into the same #app container as the hub and hand
// control back via their returned teardown fn + an onRunEnd callback that
// remounts the War Room.

import { GameState } from './core/GameState.js';
import { SaveManager } from './core/SaveManager.js';
import { mountHUD } from './ui/HUD.js';
import { mountWarRoom } from './scenes/WarRoomScene.js';
import { mountTrenchesScene } from './scenes/paths/TrenchesScene.js';
import { eventBus } from './core/EventBus.js';

// Only Trenches is ported so far. Add each path scene here as it's built —
// the War Room already renders cards for all 5 from shared/economy.js, it
// just falls back to a console warning for paths not in this map yet.
const PATH_SCENES = {
  trenches: mountTrenchesScene,
};

async function boot() {
  const container = document.getElementById('app');

  const gameState = new GameState();
  const saveManager = new SaveManager(gameState);
  await saveManager.load(); // populates gameState from backend/local mirror

  mountHUD(container, gameState);

  // Logs every voluntary cash-out to the backend for the leaderboard.
  // Losses (rug/liquidation/burnout) aren't logged as run results — they
  // still update permanent state via GameState.loseRun (bag resets to 0),
  // which the debounced save picks up regardless.
  eventBus.on('run:cashout', (result) => {
    saveManager.reportRunResult(result);
  });

  eventBus.on('player:levelUp', ({ level }) => {
    console.log(`[main] Level up! Now level ${level}.`);
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
}

boot();
