// client/src/core/GameState.js
//
// Single in-memory store for everything that persists about the Degen
// Warrior character. This is the runtime object every scene reads from and
// writes to; SaveManager is responsible for getting it in and out of
// localStorage/the backend — GameState itself doesn't know about persistence.

import {
  DEFAULT_PLAYER_STATE,
  xpToNextLevel,
  levelFromTotalXp,
  bagToPnl,
  reputationForRun,
  convictionShardsForRun,
  getPath,
} from '@candle-rider/shared';
import { eventBus } from './EventBus.js';

export class GameState {
  constructor(initial = DEFAULT_PLAYER_STATE) {
    // Deep-ish clone so mutations here never accidentally mutate the shared
    // DEFAULT_PLAYER_STATE constant.
    this.state = JSON.parse(JSON.stringify(initial));
    // Per-run scratch values reset every time a run starts; not persisted
    // until cash-out converts them into the permanent state above.
    this.currentRun = null;
  }

  // ---- run lifecycle -------------------------------------------------

  startRun(pathId) {
    getPath(pathId); // throws if unknown — fail loudly during dev
    this.currentRun = {
      pathId,
      bag: 0,
      bossDefeated: false,
      minHealthSeen: 100,
      startedAt: Date.now(),
    };
    // state.bag is a LIVE MIRROR of currentRun.bag for HUD display only —
    // the permanent record. It's zeroed at the start/end of every run;
    // the real "did this run's earnings survive" answer is whether
    // cashOut() or loseRun() ran, which is what actually moves pnl/reputation.
    this.state.bag = 0;
    eventBus.emit('run:started', { pathId });
    eventBus.emit('state:changed', this.snapshot());
  }

  addBag(amount) {
    if (!this.currentRun) return;
    this.currentRun.bag += amount;
    this.state.bag = this.currentRun.bag; // keep HUD live during the run
    eventBus.emit('run:bagChanged', { bag: this.currentRun.bag });
    eventBus.emit('state:changed', this.snapshot());
  }

  reportHealth(health) {
    if (!this.currentRun) return;
    this.currentRun.minHealthSeen = Math.min(this.currentRun.minHealthSeen, health);
    this.state.health = health;
    eventBus.emit('state:changed', this.snapshot());
  }

  reportEnergy(energy) {
    this.state.energy = Math.max(0, Math.min(100, energy));
    eventBus.emit('state:changed', this.snapshot());
  }

  reportBossDefeated() {
    if (!this.currentRun) return;
    this.currentRun.bossDefeated = true;
  }

  // Ends the run WITHOUT converting Bag to permanent currency — used when
  // the player dies/gets rugged rather than voluntarily cashing out. This
  // is the actual risk in "risk vs. reward": walk away with nothing if you
  // don't cash out before the run ends badly.
  loseRun(reason) {
    if (!this.currentRun) return null;
    const { pathId } = this.currentRun;
    this.state.bag = 0;
    this.currentRun = null;
    const result = { pathId, reason };
    eventBus.emit('run:lost', result);
    eventBus.emit('state:changed', this.snapshot());
    return result;
  }

  // Ends the run, converts Bag -> PNL/Reputation/Shards using the shared
  // economy rules, and folds the results into the permanent state.
  cashOut() {
    if (!this.currentRun) return null;
    const { pathId, bag, bossDefeated, minHealthSeen } = this.currentRun;
    const flawless = minHealthSeen >= 90;

    const pnlEarned = bagToPnl(bag);
    const reputationEarned = reputationForRun({ pnlEarned, bossDefeated });
    const shardsEarned = convictionShardsForRun({ bossDefeated, flawless });

    this.state.pnl += pnlEarned;
    this.state.reputation += reputationEarned;
    this.state.convictionShards += shardsEarned;
    this.addXp(Math.round(pnlEarned * 0.2));
    this.bumpPathMastery(pathId, bossDefeated ? 2 : 1);

    const result = { pathId, pnlEarned, reputationEarned, shardsEarned, bossDefeated, flawless };
    this.state.bag = 0;
    this.currentRun = null;
    eventBus.emit('run:cashout', result);
    eventBus.emit('state:changed', this.snapshot());
    return result;
  }

  // ---- progression -----------------------------------------------------

  addXp(amount) {
    if (amount <= 0) return;
    this.state.xp += amount;
    const { level } = levelFromTotalXp(this.state.xp);
    if (level > this.state.level) {
      this.state.level = level;
      eventBus.emit('player:levelUp', { level });
    }
  }

  bumpPathMastery(pathId, amount) {
    this.state.pathMastery[pathId] = (this.state.pathMastery[pathId] ?? 0) + amount;
  }

  xpProgress() {
    return levelFromTotalXp(this.state.xp);
  }

  // ---- misc --------------------------------------------------------

  snapshot() {
    // Shallow-safe copy for consumers (UI, SaveManager) — never hand out
    // the live mutable object.
    return JSON.parse(JSON.stringify(this.state));
  }

  replaceState(newState) {
    this.state = JSON.parse(JSON.stringify(newState));
    eventBus.emit('state:changed', this.snapshot());
  }
}
