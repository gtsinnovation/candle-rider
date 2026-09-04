// client/src/core/EventBus.js
// Minimal pub/sub so GameState, SaveManager, HUD, and scenes stay decoupled —
// nobody needs a direct reference to anybody else, they just listen for
// events like 'state:changed' or 'run:cashout'.

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler); // returns an unsubscribe fn
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }
}

// One shared bus for the whole app — simplest thing that works for a
// single-player client. If this ever needs multiple isolated instances
// (e.g. a test harness), swap call sites to `new EventBus()` instead.
export const eventBus = new EventBus();
