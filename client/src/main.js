// client/src/main.js
// Boot sequence: load/create save -> mount HUD -> mount War Room hub.
// Path scenes (Trenches, Leverage, Yield, Narrative, Systematic) get wired
// in here as they're ported from the standalone prototypes — each becomes
// a mount function like mountWarRoom, swapped in on path selection and
// torn down (via its returned unsubscribe fn) on cash-out/return-to-hub.

import { GameState } from './core/GameState.js';
import { SaveManager } from './core/SaveManager.js';
import { mountHUD } from './ui/HUD.js';
import { mountWarRoom } from './scenes/WarRoomScene.js';
import { eventBus } from './core/EventBus.js';

async function boot() {
  const container = document.getElementById('app');

  const gameState = new GameState();
  const saveManager = new SaveManager(gameState);
  await saveManager.load(); // populates gameState from backend/local mirror

  mountHUD(container, gameState);

  let teardownScene = mountWarRoom(container, gameState, (pathId) => {
    console.log(`[main] TODO: mount path scene for "${pathId}" (ported from prototype)`);
    // Once a path scene module exists, e.g.:
    //   teardownScene?.();
    //   teardownScene = mountTrenchesScene(container, gameState, () => {
    //     const result = gameState.cashOut();
    //     saveManager.reportRunResult(result);
    //     teardownScene?.();
    //     teardownScene = mountWarRoom(container, gameState, onSelectPath);
    //   });
  });

  eventBus.on('player:levelUp', ({ level }) => {
    console.log(`[main] Level up! Now level ${level}.`);
  });

  // Save on tab close so the last few seconds of state aren't lost to the
  // debounce window.
  window.addEventListener('beforeunload', () => {
    saveManager.saveNow();
  });
}

boot();
