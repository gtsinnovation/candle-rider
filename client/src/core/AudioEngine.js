// client/src/core/AudioEngine.js
//
// Synthesized sound effects via the Web Audio API — no external audio
// files to source, host, or load. Every effect is a short oscillator +
// gain-envelope "blip," which is enough to give real feedback (landing,
// damage, cash-out, level-up) without needing an asset pipeline.
//
// Browsers require a real user gesture before audio can play at all —
// the AudioContext is created lazily on first use, which naturally lines
// up with the first real click/keypress in the game (e.g. apeing into a
// coin), so this never needs special "tap to enable sound" handling.

let ctx = null;
function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null; // Web Audio unsupported — sfx calls become silent no-ops
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, freqEnd = null, duration = 0.15, type = 'sine', gain = 0.2, delay = 0 }) {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const startAt = audioCtx.currentTime + delay;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), startAt + duration);
    }

    gainNode.gain.setValueAtTime(gain, startAt);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  } catch (err) {
    // Audio is an enhancement, never load-bearing — fail silently rather
    // than ever risk breaking gameplay over a sound glitch.
    console.warn('[AudioEngine] playback failed (non-fatal):', err.message);
  }
}

export const sfx = {
  jump: () => tone({ freq: 340, freqEnd: 520, duration: 0.14, type: 'triangle', gain: 0.15 }),
  landGreen: () => tone({ freq: 660, freqEnd: 880, duration: 0.12, type: 'sine', gain: 0.2 }),
  landRed: () => tone({ freq: 160, freqEnd: 70, duration: 0.25, type: 'sawtooth', gain: 0.2 }),
  damage: () => tone({ freq: 180, freqEnd: 60, duration: 0.3, type: 'square', gain: 0.2 }),
  cashOut: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, duration: 0.18, type: 'sine', gain: 0.18, delay: i * 0.08 }));
  },
  loss: () => {
    [400, 300, 220, 140].forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'sawtooth', gain: 0.18, delay: i * 0.1 }));
  },
  levelUp: () => {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, duration: 0.15, type: 'triangle', gain: 0.16, delay: i * 0.06 }));
  },
  streak: (level) => tone({ freq: 500 + Math.min(level, 10) * 40, duration: 0.1, type: 'sine', gain: 0.12 }),
  pause: () => tone({ freq: 300, freqEnd: 220, duration: 0.1, type: 'sine', gain: 0.1 }),
  warning: () => tone({ freq: 700, duration: 0.08, type: 'square', gain: 0.1 }),
  pumpWave: () => {
    [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, duration: 0.2, type: 'triangle', gain: 0.17, delay: i * 0.09 }));
  },
  fudWave: () => {
    [300, 220, 160].forEach((f, i) => tone({ freq: f, freqEnd: f * 0.7, duration: 0.35, type: 'sawtooth', gain: 0.16, delay: i * 0.12 }));
  },
};
