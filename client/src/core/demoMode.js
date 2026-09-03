// client/src/core/demoMode.js
//
// Admin-controlled flag for automated "demo" (autopilot) play. The admin
// dashboard flips this on; the Trenches scene reads it each frame and, when
// enabled, an autopilot drives the run hands-free (ape-in, lane/jump
// decisions, cash-out at a target, auto-retry) so the game plays itself
// end-to-end — meant for hands-off teaser/cast footage pre-launch.
//
// Persisted to localStorage so the setting survives reloads; the live
// in-memory `enabled` variable is what callers read, so a same-tab toggle
// from the dashboard takes effect immediately without a reload.

const KEY = 'cd_demo_mode';
let enabled = localStorage.getItem(KEY) === '1';

export function isDemoMode() {
  return enabled;
}

export function setDemoMode(on) {
  enabled = !!on;
  localStorage.setItem(KEY, enabled ? '1' : '0');
}
