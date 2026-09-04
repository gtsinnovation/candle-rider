// client/src/scenes/paths/TrenchesScene.js
//
// Path 1 — Memecoin & Trenches Degen. Endless-runner platforming: jump
// between lanes of candle platforms, riding green ones for Bag and getting
// punished for standing on ones that flip red. Ported from the standalone
// Three.js prototype into the real game — same mechanics, now reading/
// writing through GameState instead of a local `stats` object, and reusing
// the global HUD (bag/health/energy/conviction) instead of drawing its own.
//
// Entry flow: a split-door intro reveals a free-look "trenches room" where
// the player orbits the camera around a row of 10 memecoins and apes into
// one to set the run's risk/speed profile — this REPLACES the old
// Beginner/Middle/Master text-button difficulty select entirely.
//
// Manual cash-out is bound to Escape (Space is taken by Jump here, unlike
// the other four paths where Space is free for cash-out). P pauses.

import * as THREE from 'three';
import { eventBus } from '../../core/EventBus.js';
import { TRENCHES_COINS, getLastCoinId, setLastCoinId, getCoinById } from './trenchesCoins.js';
import { sfx } from '../../core/AudioEngine.js';

// World scale: candle blocks, lane spacing, and everything spatial except
// the hero were reduced 25% (0.75x) — the hero's own size (HERO_HEIGHT
// below) is deliberately left untouched, so it now reads as proportionally
// larger/more prominent against the shrunk environment.
const WORLD_SCALE = 0.75;
const LANES = [-2.4 * WORLD_SCALE, 0, 2.4 * WORLD_SCALE];
const CANDLE_W = 1.5 * WORLD_SCALE;
const CANDLE_D = 1.6 * WORLD_SCALE;
const DESPAWN_Z = 6 * WORLD_SCALE;
const GRAVITY = -18; // partial rollback from -16 — that was floatier than the candle spacing/timing could actually support, causing jumps to overshoot past the landing window
const IDLE_WARNING_MS = 9 * 60 * 1000;  // show a warning at 9 minutes of inactivity
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // auto-pause at 10 minutes of inactivity

export function mountTrenchesScene(container, gameState, onRunEnd) {
  gameState.startRun('trenches');

  // ---------- DOM scaffold (scene-specific UI only; global HUD covers
  // bag/health/energy/conviction/reputation already) ----------
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute; inset:0;';
  container.appendChild(root);

  const canvasHost = document.createElement('div');
  canvasHost.style.cssText = 'position:absolute; inset:0;';
  root.appendChild(canvasHost);

  const laneIndicator = document.createElement('div');
  laneIndicator.style.cssText = `
    position:absolute; bottom:26px; left:50%; transform:translateX(-50%);
    display:flex; gap:8px; z-index:5;
  `;
  laneIndicator.innerHTML = `
    <div class="lane-dot" data-lane="0"></div>
    <div class="lane-dot" data-lane="1"></div>
    <div class="lane-dot" data-lane="2"></div>
  `;
  root.appendChild(laneIndicator);

  const streakDisplay = document.createElement('div');
  streakDisplay.style.cssText = `
    position:absolute; bottom:56px; left:50%; transform:translateX(-50%);
    font-family:system-ui,sans-serif; font-weight:800; z-index:5;
    opacity:0; transition:opacity .25s, transform .25s; pointer-events:none;
    text-shadow:0 0 12px currentColor;
  `;
  root.appendChild(streakDisplay);
  function updateStreakDisplay() {
    if (streak <= 1) {
      streakDisplay.style.opacity = '0';
      return;
    }
    // escalating size/color the longer the streak runs — a small, cheap
    // way to make a long streak feel increasingly exciting rather than
    // just being a static number.
    const size = Math.min(28, 15 + streak * 1.3);
    const color = streak >= 8 ? '#ff9955' : streak >= 4 ? '#ffe066' : '#7dffcf';
    streakDisplay.style.fontSize = `${size}px`;
    streakDisplay.style.color = color;
    streakDisplay.textContent = `🔥 x${streak} STREAK`;
    streakDisplay.style.opacity = '1';
    streakDisplay.style.transform = 'translateX(-50%) scale(1.15)';
    clearTimeout(updateStreakDisplay._t);
    updateStreakDisplay._t = setTimeout(() => (streakDisplay.style.transform = 'translateX(-50%) scale(1)'), 150);
  }

  const style = document.createElement('style');
  style.textContent = `
    .lane-dot { width:34px; height:6px; border-radius:3px; background:#24243f; border:1px solid #3a3a5f; }
    .lane-dot.active { background:#7dffcf; box-shadow:0 0 10px #7dffcf; }
  `;
  root.appendChild(style);

  const combo = document.createElement('div');
  combo.style.cssText = `
    position:absolute; top:90px; left:50%; transform:translateX(-50%);
    font-size:13px; color:#ffd166; opacity:0; transition:opacity .2s;
    text-shadow:0 0 10px rgba(255,209,102,.6); pointer-events:none; z-index:5;
    font-family: system-ui, sans-serif;
  `;
  root.appendChild(combo);

  const hint = document.createElement('div');
  hint.style.cssText = `
    position:absolute; bottom:20px; right:22px; font-size:11px; color:#6f6f95;
    text-align:right; line-height:1.5; font-family: system-ui, sans-serif; z-index:5;
  `;
  const isTouchDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 0;
  hint.innerHTML = isTouchDevice
    ? 'Swipe ← / → : change lane<br/>Tap : jump'
    : 'A / D or ← → : change lane<br/>SPACE or LEFT CLICK : jump<br/>ESC : cash out';
  root.appendChild(hint);

  // Debug readout — shows live physics state so a single screenshot can
  // pinpoint exactly what was happening at the moment of any future issue
  // (grounded or falling, which lane, current velocity/speed) instead of
  // needing to reverse-engineer it from gameplay video.
  const debugBox = document.createElement('div');
  debugBox.style.cssText = `
    position:absolute; top:20px; right:22px; z-index:5;
    background:rgba(0,0,0,.55); border:1px solid #333; border-radius:6px;
    padding:6px 10px; font-family:monospace; font-size:11px; color:#9f9;
    line-height:1.5; pointer-events:none;
    display:none;
  `;
  root.appendChild(debugBox);

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:absolute; inset:0; display:none; align-items:center; justify-content:center;
    flex-direction:column; background:rgba(3,3,10,.82); text-align:center; z-index:10;
    font-family: system-ui, sans-serif;
  `;
  overlay.innerHTML = `
    <h2 id="tr-overlay-title" style="font-size:26px;color:#ff6688;margin:0 0 6px;text-shadow:0 0 16px rgba(255,102,136,.6);">RUGPULLED</h2>
    <p id="tr-overlay-reason" style="color:#c9c9e6;font-size:13px;margin:4px 0 18px;max-width:360px;"></p>
    <div style="display:flex; gap:10px;">
      <button id="tr-retry-btn" style="background:#7dffcf;color:#05100c;border:none;padding:10px 22px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">RUN IT BACK</button>
      <button id="tr-hub-btn" style="background:#3a3a6f;color:#eef0ff;border:none;padding:10px 22px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">RETURN TO HUB</button>
    </div>
  `;
  root.appendChild(overlay);

  // ---------- Door curtains (DOM) — split open on entry ----------
  const doorLeft = document.createElement('div');
  const doorRight = document.createElement('div');
  [doorLeft, doorRight].forEach((d) => {
    d.style.cssText = `
      position:absolute; top:0; bottom:0; width:50%; z-index:20;
      background:
        repeating-linear-gradient(90deg, #0a0a18 0px, #12122a 3px, #0a0a18 6px),
        linear-gradient(180deg, #1a1a34, #050510);
      border-right:2px solid #3a3a6f; box-shadow: 0 0 40px rgba(125,255,207,.15);
      transition: transform 1.3s cubic-bezier(.7,0,.2,1);
    `;
  });
  doorLeft.style.left = '0';
  doorRight.style.left = '50%';
  doorRight.style.borderRight = 'none';
  doorRight.style.borderLeft = '2px solid #3a3a6f';
  root.appendChild(doorLeft);
  root.appendChild(doorRight);
  // Open on next frame so the CSS transition actually plays.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    doorLeft.style.transform = 'translateX(-100%)';
    doorRight.style.transform = 'translateX(100%)';
  }));

  // ---------- Coin-room instructions + focus indicator (DOM) ----------
  const roomHint = document.createElement('div');
  roomHint.style.cssText = `
    position:absolute; bottom:20px; left:50%; transform:translateX(-50%);
    font-size:12px; color:#9a9ac0; text-align:center; z-index:6;
    font-family: system-ui, sans-serif; pointer-events:none;
  `;
  roomHint.innerHTML = isTouchDevice
    ? 'Drag to look around · Tap a coin to ape in and start the run'
    : 'Drag to look around · Click a coin (or ←/→ + Enter) to ape in and start the run';
  root.appendChild(roomHint);

  const coinLabel = document.createElement('div');
  coinLabel.style.cssText = `
    position:absolute; top:18px; left:50%; transform:translateX(-50%);
    font-size:16px; font-weight:700; color:#eef0ff; text-align:center; z-index:6;
    font-family: system-ui, sans-serif; pointer-events:none; text-shadow:0 0 10px rgba(0,0,0,.8);
    background:rgba(8,8,20,.55); padding:6px 16px; border-radius:8px; border:1px solid #2a2a4a;
  `;
  root.appendChild(coinLabel);

  // ---------- Pause overlay (DOM) ----------
  const pauseOverlay = document.createElement('div');
  pauseOverlay.style.cssText = `
    position:absolute; inset:0; display:none; align-items:center; justify-content:center;
    flex-direction:column; background:rgba(3,3,10,.88); text-align:center; z-index:25;
    font-family: system-ui, sans-serif;
  `;
  pauseOverlay.innerHTML = `
    <h2 id="tr-pause-title" style="font-size:24px;color:#7dffcf;margin:0 0 6px;">PAUSED</h2>
    <p id="tr-pause-reason" style="color:#c9c9e6;font-size:13px;margin:4px 0 18px;max-width:360px;"></p>
    <div style="display:flex; gap:10px;">
      <button id="tr-resume-btn" style="background:#7dffcf;color:#05100c;border:none;padding:10px 22px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">RESUME</button>
      <button id="tr-exit-btn" style="background:#3a3a6f;color:#eef0ff;border:none;padding:10px 22px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">EXIT TO HUB</button>
    </div>
  `;
  root.appendChild(pauseOverlay);

  const pauseHint = document.createElement('div');
  pauseHint.style.cssText = `
    position:absolute; top:20px; left:50%; transform:translateX(-50%);
    font-size:11px; color:#6f6f95; z-index:5; font-family: system-ui, sans-serif; pointer-events:none;
  `;
  pauseHint.textContent = 'P — pause';
  root.appendChild(pauseHint);

  // Real on-screen buttons for Pause and Cash Out — mobile has no P/Escape
  // keys at all, so these aren't just a mobile nicety, they're required for
  // the game to be usable there. Desktop keyboard shortcuts still work too.
  const touchButtonRow = document.createElement('div');
  touchButtonRow.style.cssText = `
    position:absolute; top:110px; right:22px; z-index:6; display:none; gap:8px;
  `;
  touchButtonRow.innerHTML = `
    <button id="tr-pause-btn" style="background:rgba(20,20,40,.75);color:#eef0ff;border:1px solid #3a3a6f;border-radius:7px;padding:8px 12px;font-size:16px;cursor:pointer;font-family:system-ui,sans-serif;">⏸</button>
    <button id="tr-cashout-btn" style="background:rgba(125,255,207,.15);color:#7dffcf;border:1px solid #7dffcf;border-radius:7px;padding:8px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;">CASH OUT</button>
  `;
  root.appendChild(touchButtonRow);
  touchButtonRow.querySelector('#tr-pause-btn').addEventListener('click', () => {
    if (!started || ended) return;
    paused ? resumeGame() : pauseGame();
  });
  touchButtonRow.querySelector('#tr-cashout-btn').addEventListener('click', () => {
    if (!started || paused || ended) return;
    cashOut();
  });

  const idleWarning = document.createElement('div');
  idleWarning.style.cssText = `
    position:absolute; top:60px; left:50%; transform:translateX(-50%);
    font-size:12px; color:#ffd166; background:rgba(0,0,0,.6); padding:6px 14px;
    border-radius:6px; z-index:6; font-family: system-ui, sans-serif;
    display:none; pointer-events:none;
  `;
  root.appendChild(idleWarning);

  // ---------- Market events (Pump Wave / FUD Wave) ----------
  // Gives a run an actual shape/rhythm instead of flat, undifferentiated
  // repetition — periodic alternating windows of "safer and better" vs
  // "riskier and tenser," each clearly announced.
  const eventBanner = document.createElement('div');
  eventBanner.style.cssText = `
    position:absolute; top:130px; left:50%; transform:translate(-50%,-10px);
    font-family:system-ui,sans-serif; font-weight:800; font-size:22px; text-align:center;
    z-index:20; opacity:0; transition:opacity .3s, transform .3s; pointer-events:none;
    text-shadow:0 0 16px currentColor;
  `;
  root.appendChild(eventBanner);

  const eventVignette = document.createElement('div');
  eventVignette.style.cssText = `
    position:absolute; inset:0; z-index:4; pointer-events:none; opacity:0; transition:opacity .5s;
  `;
  root.appendChild(eventVignette);

  function showEventBanner(text, color) {
    eventBanner.textContent = text;
    eventBanner.style.color = color;
    eventBanner.style.opacity = '1';
    eventBanner.style.transform = 'translate(-50%,0)';
    setTimeout(() => {
      eventBanner.style.opacity = '0';
      eventBanner.style.transform = 'translate(-50%,-10px)';
    }, 2200);
  }

  // Prominent controls toast — shown once, right as gameplay begins.
  // The small corner hint text stays up the whole run for reference, but
  // it's easy to miss entirely on a phone; this makes sure the controls
  // are actually seen at the moment they matter.
  const controlsToast = document.createElement('div');
  controlsToast.style.cssText = `
    position:absolute; bottom:56px; left:12px; transform:none;
    background:rgba(10,10,24,.85); border:1px solid #3a3a6f; border-radius:12px;
    padding:14px 18px; z-index:30; font-family:system-ui,sans-serif; text-align:left;
    color:#eef0ff; opacity:0; transition:opacity .4s; pointer-events:none; max-width:60vw;
  `;
  root.appendChild(controlsToast);
  function showControlsToast(durationMs = 3200) {
    controlsToast.innerHTML = isTouchDevice
      ? '<div style="font-size:20px;margin-bottom:6px;">👆 SWIPE to change lanes<br/>👆 TAP to jump — tap again mid-air to climb higher</div><div style="font-size:11px;color:#9a9ac0;">Use the ⏸ and CASH OUT buttons up top</div>'
      : '<div style="font-size:20px;margin-bottom:6px;">A/D or ←/→ to move · SPACE to jump — tap again mid-air to climb higher</div><div style="font-size:11px;color:#9a9ac0;">ESC to cash out · P to pause</div>';
    controlsToast.style.opacity = '1';
    clearTimeout(showControlsToast._t);
    showControlsToast._t = setTimeout(() => (controlsToast.style.opacity = '0'), durationMs);
  }

  // ---------- Bag Value HUD chart ----------
  // Positioned far-left, vertically centered, deliberately away from the
  // center of the screen so it never obscures the play area. Rolling
  // 40-tick buffer, sampled on a fixed time interval (not per-frame) so
  // continuous candle-riding accrual doesn't flood the buffer with 60
  // near-identical points a second — see note above.
  const CHART_MAX_POINTS = 40;
  const CHART_SAMPLE_INTERVAL = 0.35; // seconds between ticks
  const CHART_W = 130;
  const CHART_H = 190;

  const chartCanvas = document.createElement('canvas');
  chartCanvas.width = CHART_W;
  chartCanvas.height = CHART_H;
  chartCanvas.style.cssText = `
    position:absolute; left:14px; top:50%; transform:translateY(-50%);
    z-index:6; background:rgba(8,8,20,.55); border:1px solid #2a2a4a; border-radius:8px;
    pointer-events:none; display:none;
  `;
  root.appendChild(chartCanvas);
  const chartCtx = chartCanvas.getContext('2d');

  let bagHistory = [0];
  let chartSampleTimer = 0;

  function formatMcap(value) {
    const v = Math.round(value);
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}K MCAP`;
    return `$${v} MCAP`;
  }

  function pushChartSample(value) {
    bagHistory.push(value);
    if (bagHistory.length > CHART_MAX_POINTS) bagHistory.shift();
    drawChart();
  }

  function drawChart() {
    const ctx = chartCtx;
    ctx.clearRect(0, 0, CHART_W, CHART_H);

    const padding = 18;
    const plotH = CHART_H - padding * 2;
    const plotW = CHART_W - 10;
    let min = Math.min(...bagHistory);
    let max = Math.max(...bagHistory);
    if (min === max) { min -= 1; max += 1; } // avoid a divide-by-zero flat-line edge case

    const toXY = (i, v) => {
      const x = 5 + (bagHistory.length === 1 ? 0 : (i / (bagHistory.length - 1)) * plotW);
      const y = padding + plotH - ((v - min) / (max - min)) * plotH;
      return [x, y];
    };

    // Draw each segment colored by direction — green for gains, red for drops.
    for (let i = 1; i < bagHistory.length; i++) {
      const [x1, y1] = toXY(i - 1, bagHistory[i - 1]);
      const [x2, y2] = toXY(i, bagHistory[i]);
      ctx.strokeStyle = bagHistory[i] >= bagHistory[i - 1] ? '#00ff77' : '#ff3355';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Peak label — the highest local maximum currently in the buffer.
    let peakIdx = 0;
    for (let i = 1; i < bagHistory.length; i++) {
      if (bagHistory[i] > bagHistory[peakIdx]) peakIdx = i;
    }
    const [px, py] = toXY(peakIdx, bagHistory[peakIdx]);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#ffe066';
    ctx.textAlign = 'center';
    ctx.fillText(formatMcap(bagHistory[peakIdx]), px, Math.max(12, py - 8));
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe066';
    ctx.fill();
  }

  drawChart(); // initial flat line at $0 before the run properly gets moving

  function popCombo(text, color) {
    combo.textContent = text;
    combo.style.color = color || '#ffd166';
    combo.style.opacity = '1';
    clearTimeout(popCombo._t);
    popCombo._t = setTimeout(() => (combo.style.opacity = '0'), 550);
  }

  // ---------- THREE SETUP ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050510, 0.028);
  scene.background = new THREE.Color(0x050510);

  const camera = new THREE.PerspectiveCamera(62, canvasHost.clientWidth / canvasHost.clientHeight || 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  function resize() {
    const w = canvasHost.clientWidth || window.innerWidth;
    const h = canvasHost.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  canvasHost.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';
  resize();
  window.addEventListener('resize', resize);

  // ---------- Free-look orbit camera (room-preview phase only) ----------
  // Hand-rolled drag-to-orbit rather than importing OrbitControls — this
  // phase only needs yaw/pitch/zoom around a fixed room-center point, not
  // a general-purpose controls library.
  const orbitTarget = new THREE.Vector3(0, 1.1, -3);
  let orbitAzimuth = 0.15;   // radians around Y
  let orbitElevation = 0.55; // radians up from horizontal
  let orbitRadius = 9;
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let roomActive = true; // true until the player apes into a coin

  function updateOrbitCamera() {
    const clampedElev = Math.max(0.15, Math.min(1.3, orbitElevation));
    camera.position.set(
      orbitTarget.x + orbitRadius * Math.sin(orbitAzimuth) * Math.cos(clampedElev),
      orbitTarget.y + orbitRadius * Math.sin(clampedElev),
      orbitTarget.z + orbitRadius * Math.cos(orbitAzimuth) * Math.cos(clampedElev)
    );
    camera.lookAt(orbitTarget);
  }
  updateOrbitCamera();

  function onPointerDown(e) {
    if (!roomActive) return;
    dragging = true;
    lastPointer = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e) {
    if (!roomActive) return;
    if (dragging) {
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      lastPointer = { x: e.clientX, y: e.clientY };
      orbitAzimuth -= dx * 0.006;
      orbitElevation = Math.max(0.15, Math.min(1.3, orbitElevation + dy * 0.005));
      updateOrbitCamera();
    }
    updateCoinHover(e);
  }
  function onPointerUp() { dragging = false; }
  function onWheel(e) {
    if (!roomActive) return;
    orbitRadius = Math.max(4, Math.min(16, orbitRadius + e.deltaY * 0.01));
    updateOrbitCamera();
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

  scene.add(new THREE.AmbientLight(0x30304a, 1.1));
  const dirLight = new THREE.DirectionalLight(0x9fb4ff, 0.6);
  dirLight.position.set(4, 10, 6);
  scene.add(dirLight);
  const rimLight = new THREE.PointLight(0x7dffcf, 1.4, 20);
  rimLight.position.set(0, 3, 2);
  scene.add(rimLight);

  // Scrolling ground plane — a canvas-drawn grid texture on a flat plane,
  // with the texture's UV offset animated each frame in sync with `speed`.
  // A static GridHelper (the previous approach) gave no visual sense of
  // forward travel, so the fast-moving candles read as disorienting
  // vertical motion with nothing else to anchor against. Scrolling the
  // floor texture toward the player at the same rate as the candles fixes
  // that — the ground now reads as a smooth horizontal plane moving
  // toward you, matching the candle motion instead of fighting it.
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = 128;
  gridCanvas.height = 128;
  const gctx = gridCanvas.getContext('2d');
  gctx.fillStyle = '#0a0a18';
  gctx.fillRect(0, 0, 128, 128);
  gctx.strokeStyle = '#3a2a6a';
  gctx.lineWidth = 2;
  gctx.strokeRect(0, 0, 128, 128);

  const groundTexture = new THREE.CanvasTexture(gridCanvas);
  groundTexture.wrapS = THREE.RepeatWrapping;
  groundTexture.wrapT = THREE.RepeatWrapping;
  const GROUND_CELL_SIZE = 5 * WORLD_SCALE; // world units per texture repeat, scaled to match the shrunk candle/lane world
  groundTexture.repeat.set(400 / GROUND_CELL_SIZE, 400 / GROUND_CELL_SIZE);

  const groundMat = new THREE.MeshBasicMaterial({ map: groundTexture, transparent: true, opacity: 0.6 });
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -1.2;
  scene.add(groundMesh);

  // ---------- Memecoin room — the ape-in selector that replaced the old
  // Beginner/Middle/Master text buttons ----------
  function makeCoinLabelTexture(coin, locked) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillStyle = locked ? '#555566' : '#' + coin.color.toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.shadowBlur = 10;
    ctx.fillText(locked ? '🔒 ' + coin.symbol : coin.symbol, 128, 60);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = locked ? '#7a7a90' : '#c9c9e6';
    ctx.fillText(locked ? `Mastery Lv.${coin.requiresMastery} required` : coin.name, 128, 95);
    return new THREE.CanvasTexture(c);
  }

  // Coins arranged on a curved arc around orbitTarget, all equidistant —
  // scales to any screen width naturally (unlike a straight row, which
  // either runs off-screen or needs constant re-tuning per viewport).
  const ARC_RADIUS = 6.2;
  const ARC_SPAN = Math.PI * 0.75; // ~135° total spread

  const trenchesMastery = gameState.state.pathMastery?.trenches ?? 0;

  const coinMeshes = TRENCHES_COINS.map((coin, i) => {
    const isLocked = (coin.requiresMastery ?? 0) > trenchesMastery;
    const t = TRENCHES_COINS.length === 1 ? 0 : i / (TRENCHES_COINS.length - 1);
    const angle = -ARC_SPAN / 2 + t * ARC_SPAN;
    const x = orbitTarget.x + Math.sin(angle) * ARC_RADIUS;
    const z = orbitTarget.z - Math.cos(angle) * ARC_RADIUS;

    const group = new THREE.Group();
    group.position.set(x, 1.1, z);
    group.lookAt(orbitTarget.x, group.position.y, orbitTarget.z); // each coin faces the center of the arc, not just whichever way it happened to spawn

    const coinTexture = new THREE.TextureLoader().load(`/assets/coins/${coin.id}.png`);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 32), // matches the original placeholder disc's radius exactly
      new THREE.MeshBasicMaterial({
        map: coinTexture,
        color: isLocked ? 0x444455 : 0xffffff, // multiplies with the texture — dims/desaturates locked coins without needing a separate grayscale asset
        transparent: true,
        side: THREE.DoubleSide, // the player freely orbits the camera around the whole arc, so the coin must be visible from either face regardless of exact angle
      })
    );
    // No extra rotation needed — CircleGeometry already faces forward by
    // default, unlike the CylinderGeometry this replaced (which needed a
    // 90° tip to stand upright). Carrying that old rotation over here was
    // the actual bug: it pointed the disc's face away from the camera
    // entirely, leaving only the auto-facing label sprite visible.
    group.add(disc);

    const labelMat = new THREE.SpriteMaterial({ map: makeCoinLabelTexture(coin, isLocked), transparent: true });
    const label = new THREE.Sprite(labelMat);
    label.scale.set(1.6, 0.8, 1);
    label.position.y = 0.95;
    group.add(label);

    scene.add(group);
    return { coin, group, disc, baseY: 1.1, bobPhase: Math.random() * Math.PI * 2, locked: isLocked };
  });

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let hoveredCoinIndex = -1;
  let focusedCoinIndex = Math.max(0, TRENCHES_COINS.findIndex((c) => c.id === getLastCoinId()));

  function setFocusedCoin(index) {
    focusedCoinIndex = Math.max(0, Math.min(TRENCHES_COINS.length - 1, index));
    coinLabel.textContent = TRENCHES_COINS[focusedCoinIndex].symbol + ' — ' + TRENCHES_COINS[focusedCoinIndex].name;
  }
  setFocusedCoin(focusedCoinIndex);

  function updateCoinHover(e) {
    if (!roomActive) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(coinMeshes.map((c) => c.disc));
    hoveredCoinIndex = hits.length ? coinMeshes.findIndex((c) => c.disc === hits[0].object) : -1;
    if (hoveredCoinIndex >= 0) setFocusedCoin(hoveredCoinIndex);
  }

  function onCoinClick(e) {
    if (!roomActive) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(coinMeshes.map((c) => c.disc));
    if (hits.length) {
      const idx = coinMeshes.findIndex((c) => c.disc === hits[0].object);
      apeIntoCoin(TRENCHES_COINS[idx]);
    }
  }
  renderer.domElement.addEventListener('click', onCoinClick);

  const laneGuides = [];
  LANES.forEach((x) => {
    const geo = new THREE.PlaneGeometry(0.05, 400);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2c2c55, transparent: true, opacity: 0.5 });
    const line = new THREE.Mesh(geo, mat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, -1.18, -150);
    line.visible = false; // hidden during the coin room — the track shouldn't compete visually with coin selection
    scene.add(line);
    laneGuides.push(line);
  });

  let laneIndex = 1;
  const player = new THREE.Group();

  // The player is the actual Trenches Degen Warrior hero art (not a
  // generic placeholder shape) — same asset used on the War Room card,
  // run through an alpha cutout so it billboards cleanly against the 3D
  // scene instead of showing as a black rectangle. Sprites always face
  // the camera automatically, which suits an endless-runner viewed from
  // a mostly-fixed chase angle.
  const heroTexture = new THREE.TextureLoader().load('/assets/heroes/trenches-back-cutout.png');
  const heroMat = new THREE.SpriteMaterial({ map: heroTexture, transparent: true });
  const heroSprite = new THREE.Sprite(heroMat);
  const HERO_HEIGHT = 2.1;
  const HERO_ASPECT = 841 / 1406; // back-view walking pose, matches the rear-chase camera direction
  heroSprite.scale.set(HERO_HEIGHT * HERO_ASPECT, HERO_HEIGHT, 1);
  heroSprite.position.y = HERO_HEIGHT / 2; // anchor the sprite's bottom edge at the player's ground-contact point
  player.add(heroSprite);

  player.position.set(LANES[laneIndex], 0, 0);
  scene.add(player);
  const playerGlow = new THREE.PointLight(0x18ffcf, 1.2, 6);
  playerGlow.position.set(0, 1, 0.5);
  player.add(playerGlow);

  const candles = [];
  let speed = 6; // base scroll speed — lowered from 9 for a gentler start; declared here (not in the later STATE block) so spawnCandle can reference it below
  const GREEN = 0x00ff77;
  const RED = 0xff3355;
  const GREEN_COLOR = new THREE.Color(GREEN);
  const WARN_COLOR = new THREE.Color(0xffaa33);
  const FLIP_WARNING_MS = 650; // candles flicker amber for this long before actually flipping to red
  let activeEvent = null; // null | 'pump' | 'fud' — set by the periodic market-event system below, read by spawnCandle
  const recentSpawnColors = []; // last few spawn colors, used to prevent long monochrome streaks
  const MAX_COLOR_STREAK = 3; // after this many consecutive same-color spawns, the next one is forced to flip
  const RED_SPAWN_CHANCE = 0.28; // baseline chance a candle spawns already-red instead of green

  function candleMaterial(color) {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.4 });
  }

  function spawnCandle(z, forcedLane, forcedColor) {
    const lane = forcedLane !== undefined ? forcedLane : Math.floor(Math.random() * 3);
    const height = (0.6 + Math.random() * 1.6) * WORLD_SCALE;

    // Decide the starting color BEFORE the candle is visible to the
    // player — some candles are born red (an immediate, visible hazard
    // the player can choose to avoid from a distance), not just green
    // ones that flip later. An anti-streak rule guarantees the sequence
    // can never run all-green or all-red for long: after MAX_COLOR_STREAK
    // consecutive same-color spawns, the next one is forced to the
    // opposite color. forcedColor bypasses all of this — used only for
    // the guaranteed starting platform, which must always be safe.
    let startColor = forcedColor || (Math.random() < RED_SPAWN_CHANCE ? 'red' : 'green');
    if (!forcedColor) {
      const streakLen = recentSpawnColors.length;
      if (streakLen >= MAX_COLOR_STREAK && recentSpawnColors.slice(-MAX_COLOR_STREAK).every((c) => c === startColor)) {
        startColor = startColor === 'green' ? 'red' : 'green';
      }
      recentSpawnColors.push(startColor);
      if (recentSpawnColors.length > MAX_COLOR_STREAK) recentSpawnColors.shift();
    }

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(CANDLE_W, height, CANDLE_D), candleMaterial(startColor === 'red' ? RED : GREEN));
    mesh.position.set(LANES[lane], height / 2 - 1.2, z);
    scene.add(mesh);
    // Fuse length depends on the active market event: Pump Waves give
    // candles a long, safe fuse (a reward window); FUD Waves give them a
    // very short one (a tense, high-risk window). Normal spawns in between.
    let fuseMin = 1800, fuseRange = 2600;
    if (activeEvent === 'pump') { fuseMin = 6000; fuseRange = 2000; }
    else if (activeEvent === 'fud') { fuseMin = 400; fuseRange = 600; }

    // The fuse must start counting from when the candle actually becomes
    // REACHABLE, not from the moment it's created far away — otherwise a
    // candle spawned deep in the queue (which can take 10+ seconds to
    // scroll into range) has already flipped red long before the player
    // could ever land on it, since the fuse itself is only ~2-4.4s. This
    // was a real structural bug: virtually every candle arrived pre-flipped.
    // Candles born red skip the fuse entirely — they're already in their
    // final state, nothing left to flip.
    const travelSeconds = Math.abs(z) / Math.max(speed, 0.1);
    const candle = {
      mesh, lane, height, color: startColor,
      flipAt: startColor === 'red' ? Infinity : performance.now() + travelSeconds * 1000 + fuseMin + Math.random() * fuseRange,
      scored: false,
      warningPlayed: false,
    };
    candles.push(candle);
    return candle;
  }

  // Guaranteed starting platform, directly under the player's spawn lane at
  // z=0. Without this, the nearest candle from the random seed loop below
  // starts at z=-4 and the player free-falls with nothing to land on until
  // it scrolls into range — fine at high speed, but at lower difficulty
  // speeds the player falls past the void threshold before it arrives.
  // The player is snapped onto this candle explicitly in
  // apeIntoCoin() rather than relying on the normal landing check
  // to catch a mid-air faller.
  const startCandle = spawnCandle(0, 1, 'green'); // lane 1 = LANES[1] = 0, matches player's starting lane — always forced green, must be safe

  let cursorZ = -4 * WORLD_SCALE;
  for (let i = 0; i < 24; i++) {
    spawnCandle(cursorZ);
    cursorZ -= (3.4 + Math.random() * 1.4) * WORLD_SCALE;
  }
  // Hide the track candles during the coin room — only the platform the
  // hero is already standing on (startCandle) stays visible, so the scene
  // reads as "you and a coin vault," not a half-visible obstacle course.
  candles.forEach((c) => { if (c !== startCandle) c.mesh.visible = false; });

  // ---------- STATE ----------
  const keys = {};
  let velY = 0;
  let jumping = true;
  let jumpChainCount = 0; // resets to 0 on every landing — tracks taps within the current airborne phase
  let onCandle = null;
  let elapsed = 0;
  let streak = 0;
  let ended = false;
  let started = false;
  let paused = false;
  let difficulty = getCoinById(getLastCoinId());
  let animId = null;
  let landSquashTimer = 0; // counts down after landing, drives the squash/rebound animation
  const MARKET_EVENT_INTERVAL = 22; // seconds between events
  const MARKET_EVENT_DURATION = 6;  // seconds each event lasts
  let nextEventAt = 15;   // first event fires at 15s in — gives a little runway before the first hit
  let eventEndsAt = 0;
  let eventCount = 0;     // used to alternate pump/fud, starting with pump
  let lastInputTime = performance.now();
  let idleWarningShown = false;

  function apeIntoCoin(coin) {
    if (started) return; // already ape'd in, ignore repeat clicks/enters
    if ((coin.requiresMastery ?? 0) > trenchesMastery) {
      coinLabel.textContent = `🔒 Requires Trenches Mastery Lv.${coin.requiresMastery} (currently Lv.${trenchesMastery})`;
      coinLabel.style.color = '#ff9955';
      sfx.warning();
      return;
    }
    difficulty = coin;
    setLastCoinId(coin.id);

    // Close the room: stop orbit control, hide the coin meshes and room UI.
    // The camera does NOT need an explicit transition — once `started`
    // flips true, the existing per-frame chase-cam lerp in update() will
    // smoothly carry it from wherever the orbit left it to the normal
    // gameplay framing on its own.
    roomActive = false;
    coinMeshes.forEach((c) => { c.group.visible = false; });
    roomHint.style.display = 'none';
    coinLabel.style.display = 'none';

    // Reveal the track (previously hidden so it didn't compete visually
    // with coin selection) and the gameplay-only UI (pause/cash-out/chart
    // make no sense before a run has actually begun).
    candles.forEach((c) => { c.mesh.visible = true; });
    laneGuides.forEach((line) => { line.visible = true; });
    touchButtonRow.style.display = 'flex';
    chartCanvas.style.display = 'block';
    if (window.innerWidth >= 480) debugBox.style.display = 'block';

    // Defense-in-depth: force the player back to the guaranteed starting
    // lane/position regardless of any other state.
    laneIndex = 1;
    player.position.x = LANES[1];

    // Land the player on the guaranteed starting candle instead of letting
    // physics begin mid-air.
    const topY = startCandle.mesh.position.y + startCandle.height / 2; // true top surface (mesh.position.y already includes the ground-offset)
    player.position.y = topY;
    velY = 0;
    jumping = false;
    jumpChainCount = 0;
    onCandle = startCandle;

    // Refresh every currently-spawned candle's flip timer relative to NOW —
    // avoids an unfair instant flip if the player spent a while in the room.
    // Also applies the same travel-time-aware fuse as spawnCandle (see the
    // comment there) using the coin's chosen base speed, since the whole
    // initial queue spans far more distance than a flat 2-4.4s fuse could
    // ever survive intact.
    const now = performance.now();
    candles.forEach((c) => {
      if (c.color !== 'green') return; // red-born candles have no fuse to refresh
      const travelSeconds = Math.abs(c.mesh.position.z) / Math.max(coin.base, 0.1);
      c.flipAt = now + travelSeconds * 1000 + 1800 + Math.random() * 2600;
    });

    lastInputTime = performance.now();
    started = true;
    showControlsToast();
  }

  function pauseGame(reason) {
    if (!started || ended || paused) return;
    paused = true;
    sfx.pause();
    pauseOverlay.querySelector('#tr-pause-title').textContent = reason ? 'AUTO-PAUSED' : 'PAUSED';
    pauseOverlay.querySelector('#tr-pause-reason').textContent = reason || 'Take your time — your run is safely frozen.';
    pauseOverlay.style.display = 'flex';
  }
  function resumeGame() {
    if (!paused) return;
    paused = false;
    sfx.pause();
    idleWarningShown = false;
    lastInputTime = performance.now();
    pauseOverlay.style.display = 'none';
  }
  pauseOverlay.querySelector('#tr-resume-btn').addEventListener('click', resumeGame);
  pauseOverlay.querySelector('#tr-exit-btn').addEventListener('click', () => {
    gameState.loseRun('exited-mid-run'); // leaving mid-run without cashing out forfeits the Bag, same as any other loss
    teardown();
    onRunEnd();
  });

  function keydown(e) {
    keys[e.code] = true;
    lastInputTime = performance.now();

    if (roomActive) {
      // Coin-room keyboard alternative to mouse click — full parity, not
      // just a mouse-only interaction.
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') setFocusedCoin(focusedCoinIndex - 1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') setFocusedCoin(focusedCoinIndex + 1);
      if (e.code === 'Enter') apeIntoCoin(TRENCHES_COINS[focusedCoinIndex]);
      return;
    }

    if (e.code === 'KeyP' && started && !ended) {
      paused ? resumeGame() : pauseGame();
      return;
    }
    if (paused || ended || !started) return;

    if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && laneIndex > 0) laneIndex--;
    if ((e.code === 'ArrowRight' || e.code === 'KeyD') && laneIndex < 2) laneIndex++;
    if (e.code === 'Space' || e.code === 'ArrowUp') tryJump();
    if (e.code === 'Escape') cashOut();
  }
  function keyup(e) { keys[e.code] = false; }
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);

  const MAX_JUMP_TAPS = 3;   // 1 launch + up to 2 step-up boosts per airborne phase
  const JUMP_LAUNCH_VEL = 7.5; // unchanged from the original tuned jump
  const JUMP_BOOST_VEL = 5.5;  // smaller "step up" kick for each extra tap while airborne

  function tryJump() {
    if (!jumping) {
      // fresh jump from solid ground
      jumping = true;
      jumpChainCount = 1;
      velY = JUMP_LAUNCH_VEL;
      sfx.jump();
      return;
    }
    // Already airborne — each additional tap gives one more incremental
    // step up, capped so repeated tapping can't just fly over everything.
    // Resets to 0 the moment the player actually lands (see landing checks
    // below), so it's per-jump, not a global resource.
    if (jumpChainCount < MAX_JUMP_TAPS) {
      jumpChainCount++;
      velY = JUMP_BOOST_VEL;
      sfx.jump();
    }
  }

  // Left-click also jumps during gameplay — mirrors Space exactly via the
  // shared tryJump(). Gated the same way keyboard jump input is (must be
  // started, not paused/ended, and not still in the coin room — clicking
  // in the room is for apeing into a coin, not jumping).
  function onGameplayClick() {
    if (!started || paused || ended || roomActive) return;
    tryJump();
  }
  renderer.domElement.addEventListener('mousedown', onGameplayClick);

  // Touch controls — mobile has no keyboard, so lane-change and jump need
  // real gesture equivalents: swipe left/right for lanes, tap for jump.
  // Gated the same way keyboard/mouse gameplay input is (must be started,
  // not paused/ended, and not still in the coin room — touch-drag in the
  // room is for orbiting the camera via the existing pointer events).
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  const SWIPE_THRESHOLD = 40;   // px — shorter swipes don't count, avoids misreads from a shaky tap
  const TAP_MAX_MOVEMENT = 15;  // px — more movement than this isn't a tap, it's a swipe attempt
  const TAP_MAX_DURATION = 250; // ms — longer holds aren't treated as a tap

  function onTouchStart(e) {
    if (!started || paused || ended || roomActive) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = performance.now();
    lastInputTime = performance.now();
  }
  function onTouchEnd(e) {
    if (!started || paused || ended || roomActive) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const duration = performance.now() - touchStartTime;
    const dist = Math.hypot(dx, dy);

    if (dist < TAP_MAX_MOVEMENT && duration < TAP_MAX_DURATION) {
      tryJump();
    } else if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && laneIndex > 0) laneIndex--;
      if (dx > 0 && laneIndex < 2) laneIndex++;
    }
  }
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
  renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: true });

  function updateLaneDots() {
    laneIndicator.querySelectorAll('.lane-dot').forEach((d, i) => d.classList.toggle('active', i === laneIndex));
  }

  function showOverlay(title, reason, color) {
    ended = true;
    overlay.querySelector('#tr-overlay-title').textContent = title;
    overlay.querySelector('#tr-overlay-title').style.color = color || '#ff6688';
    overlay.querySelector('#tr-overlay-reason').textContent = reason;
    overlay.style.display = 'flex';
  }

  function cashOut() {
    if (ended) return;
    const result = gameState.cashOut();
    sfx.cashOut();
    showOverlay('CASHED OUT', `Banked $${result.pnlEarned.toLocaleString()} PNL and ${result.reputationEarned} Reputation.`, '#7dffcf');
  }

  function lose(title, reason) {
    if (ended) return;
    gameState.loseRun(reason);
    sfx.loss();
    showOverlay(title, reason, '#ff5577');
  }

  overlay.querySelector('#tr-retry-btn').addEventListener('click', () => {
    teardown();
    mountTrenchesScene(container, gameState, onRunEnd);
    // Note: main.js's outer teardown reference now points at this now-torn-
    // down instance. That's harmless — teardown() is idempotent (all its
    // calls are no-ops on an already-cleaned-up scene) — but if main.js
    // ever needs to force-close a scene mid-retry, it should track scenes
    // by a mount generation rather than a single stale reference.
  });
  overlay.querySelector('#tr-hub-btn').addEventListener('click', () => {
    teardown();
    onRunEnd();
  });

  // ---------- LOOP ----------
  const clock = new THREE.Clock();

  function triggerMarketEvent() {
    const type = eventCount % 2 === 0 ? 'pump' : 'fud'; // always starts with a Pump Wave first
    eventCount++;
    activeEvent = type;
    eventEndsAt = elapsed + MARKET_EVENT_DURATION;
    if (type === 'pump') {
      sfx.pumpWave();
      showEventBanner('🚀 PUMP WAVE!', '#7dffcf');
      eventVignette.style.background = 'radial-gradient(ellipse at center, transparent 55%, rgba(125,255,207,.22) 100%)';
    } else {
      sfx.fudWave();
      showEventBanner('😱 FUD WAVE!', '#ff5577');
      eventVignette.style.background = 'radial-gradient(ellipse at center, transparent 45%, rgba(255,85,119,.28) 100%)';
    }
    eventVignette.style.opacity = '1';
  }

  function endMarketEvent() {
    activeEvent = null;
    eventVignette.style.opacity = '0';
    nextEventAt = elapsed + MARKET_EVENT_INTERVAL;
  }

  function update(dt) {
    elapsed += dt;

    // Idle-timeout: warn at 9 minutes, auto-pause at 10. Any keydown resets
    // lastInputTime (see keydown()), so active players never see this.
    const idleMs = performance.now() - lastInputTime;
    if (idleMs > IDLE_TIMEOUT_MS) {
      pauseGame("You've been inactive for 10 minutes — auto-paused so you don't lose progress.");
      idleWarning.style.display = 'none';
      return;
    } else if (idleMs > IDLE_WARNING_MS) {
      const secsLeft = Math.ceil((IDLE_TIMEOUT_MS - idleMs) / 1000);
      idleWarning.textContent = `Still there? Auto-pausing in ${secsLeft}s due to inactivity.`;
      idleWarning.style.display = 'block';
    } else if (idleWarning.style.display !== 'none') {
      idleWarning.style.display = 'none';
    }

    speed = difficulty.base + Math.min(elapsed * difficulty.ramp, difficulty.cap);

    if (!activeEvent && elapsed >= nextEventAt) triggerMarketEvent();
    if (activeEvent && elapsed >= eventEndsAt) endMarketEvent();

    chartSampleTimer += dt;
    if (chartSampleTimer >= CHART_SAMPLE_INTERVAL) {
      chartSampleTimer = 0;
      pushChartSample(gameState.currentRun ? gameState.currentRun.bag : 0);
    }

    // Scroll the ground texture toward the player in lockstep with the
    // candle speed — the plane's V axis runs along world Z after the -90°
    // rotation, so offsetting texture.offset.y creates the "floor sliding
    // toward you" effect at the exact same rate everything else moves.
    groundTexture.offset.y -= (speed * dt) / GROUND_CELL_SIZE;

    const targetX = LANES[laneIndex];
    player.position.x += (targetX - player.position.x) * Math.min(1, dt * 12);
    updateLaneDots();

    velY += GRAVITY * dt;
    player.position.y += velY * dt;

    let nextCursorZ = null;
    for (let i = candles.length - 1; i >= 0; i--) {
      const c = candles[i];
      c.mesh.position.z += speed * dt;

      if (c.color === 'green') {
        const msUntilFlip = c.flipAt - performance.now();
        if (msUntilFlip > 0 && msUntilFlip < FLIP_WARNING_MS) {
          if (!c.warningPlayed && onCandle === c) {
            c.warningPlayed = true;
            sfx.warning();
          }
          // Pulsing amber warning, speeding up the closer it gets to
          // actually flipping — gives the player a real, readable window
          // to jump away or brace for the hit, instead of a silent flip.
          const warningProgress = 1 - msUntilFlip / FLIP_WARNING_MS; // 0 -> 1 as flip approaches
          const pulseRate = 8 + warningProgress * 14;
          const pulse = (Math.sin(performance.now() * 0.001 * pulseRate) + 1) / 2; // 0..1
          c.mesh.material.emissive.copy(GREEN_COLOR).lerp(WARN_COLOR, pulse * 0.7);
          c.mesh.material.emissiveIntensity = 0.55 + pulse * 0.6;
        }
        if (performance.now() > c.flipAt) {
          c.color = 'red';
          c.mesh.material.color.setHex(RED);
          c.mesh.material.emissive.setHex(RED);
          c.mesh.material.emissiveIntensity = 0.55;
          if (onCandle === c) {
            gameState.reportHealth(Math.max(0, gameState.state.health - 14));
            sfx.damage();
            streak = 0;
            updateStreakDisplay();
            popCombo('RUG FLIP! -14 HP', '#ff5577');
          }
        }
      }

      if (c.mesh.position.z > DESPAWN_Z) {
        if (onCandle === c && !jumping) {
          lose('RUGPULLED', 'The candle vanished under you.');
        }
        scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.material.dispose();
        candles.splice(i, 1);
        continue;
      }
      if (nextCursorZ === null || c.mesh.position.z < nextCursorZ) nextCursorZ = c.mesh.position.z;
    }
    while (candles.length < 24 && !ended) {
      cursorZ = (nextCursorZ !== null ? nextCursorZ : -4 * WORLD_SCALE) - (3.4 + Math.random() * 1.4) * WORLD_SCALE;
      spawnCandle(cursorZ);
      nextCursorZ = cursorZ;
    }

    onCandle = null;
    for (const c of candles) {
      const sameLane = Math.abs(c.mesh.position.x - player.position.x) < CANDLE_W / 2;
      // Tolerance scales with current scroll speed rather than a fixed
      // distance — a fixed buffer only gives a fixed TIME window (buffer /
      // speed), which shrinks as speed increases and didn't reliably
      // outlast jump airtime (~0.83s) even at Beginner. Scaling by speed
      // keeps the in-range TIME window consistent (~1.1s) regardless of
      // difficulty tier or the speed ramp within a run, so jumping straight
      // up reliably lands back on the same candle you took off from.
      const nearZ = Math.abs(c.mesh.position.z - player.position.z) < CANDLE_D / 2 + speed * 0.55;
      const topY = c.mesh.position.y + c.height / 2; // true top surface (mesh.position.y already includes the ground-offset — was double-subtracting 1.2 before)
      const playerFeetY = player.position.y;
      if (sameLane && nearZ && velY <= 0 && playerFeetY <= topY + 0.35 && playerFeetY >= topY - 0.6) {
        player.position.y = topY;
        if (jumping) landSquashTimer = 0.18; // was airborne, now landing — fire the squash
        velY = 0;
        jumping = false;
        jumpChainCount = 0;
        onCandle = c;

        if (!c.scored) {
          c.scored = true;
          if (c.color === 'green') {
            const baseGain = 8 + Math.floor(Math.random() * 10);
            const gain = activeEvent === 'pump' ? Math.round(baseGain * 1.5) : baseGain;
            gameState.addBag(gain);
            streak += 1;
            sfx.landGreen();
            if (streak > 1) sfx.streak(streak);
            popCombo(streak > 1 ? `+$${gain} LANDED (x${streak} STREAK!)` : `+$${gain} LANDED`, '#7dffcf');
          } else {
            gameState.addBag(-6);
            streak = 0;
            sfx.landRed();
            popCombo('LANDED ON RED', '#ff9955');
          }
          updateStreakDisplay();
        }
        break;
      }
    }

    if (onCandle && onCandle.color === 'green') {
      gameState.addBag(6 * dt);
    }

    if (player.position.y < -6) {
      lose('LIQUIDITY VOID', 'You fell off the trenches entirely.');
    }

    gameState.reportEnergy(gameState.state.energy - 2.2 * dt);
    if (gameState.state.energy <= 0) {
      lose('BURNED OUT', 'Energy hit zero — even degens need sleep.');
    }
    if (gameState.state.health <= 0) {
      lose('LIQUIDATED', 'Health hit zero after one too many rugs.');
    }

    const camTarget = new THREE.Vector3(player.position.x * 0.6, player.position.y + 3.4 * WORLD_SCALE, player.position.z + 7.5 * WORLD_SCALE);
    camera.position.lerp(camTarget, Math.min(1, dt * 5));
    camera.lookAt(player.position.x * 0.6, player.position.y + 0.6, player.position.z - 4);
    // ---------- Procedural sprite animation ("juice") ----------
    // Sprites always billboard to face the camera and ignore the parent
    // Group's rotation.y, so a plain rotation-based lean (what was here
    // before) had no visible effect. Real motion feedback instead comes
    // from animating the sprite's own scale (squash/stretch) and its
    // material's in-plane rotation (banking lean) — no new art needed.
    const baseW = HERO_HEIGHT * HERO_ASPECT;
    const baseH = HERO_HEIGHT;

    if (landSquashTimer > 0) {
      landSquashTimer = Math.max(0, landSquashTimer - dt);
      // eased squash → rebound: compressed at impact, bounces slightly
      // taller than normal on the way out, settles back to baseline.
      const t = 1 - landSquashTimer / 0.18; // 0 at impact -> 1 as it settles
      const squash = t < 0.4
        ? 1 - 0.22 * (t / 0.4)          // compress
        : 0.78 + 0.28 * ((t - 0.4) / 0.6); // rebound past 1.0 briefly, then settle
      heroSprite.scale.set(baseW * (2 - squash), baseH * squash, 1);
      heroSprite.position.y = HERO_HEIGHT / 2;
    } else if (jumping) {
      // airborne stretch, proportional to how fast it's currently moving
      // vertically — snappier at the top of a jump's push, gentler near
      // the peak/fall.
      const stretch = 1 + Math.min(0.16, Math.abs(velY) * 0.01);
      heroSprite.scale.set(baseW / stretch, baseH * stretch, 1);
      heroSprite.position.y = HERO_HEIGHT / 2;
    } else {
      // grounded running bob — small rhythmic bounce tied to elapsed time
      // and current scroll speed, so the bob visually speeds up as the
      // run gets faster.
      const bobRate = 6 + speed * 0.35;
      const bob = Math.sin(elapsed * bobRate) * 0.035;
      heroSprite.scale.set(baseW, baseH * (1 + bob), 1);
      heroSprite.position.y = HERO_HEIGHT / 2 + Math.abs(bob) * 0.4;
    }

    // Bank/lean into lane changes — SpriteMaterial.rotation is an in-plane
    // (view-axis) roll, the one rotation a billboard sprite actually
    // respects.
    const leanTarget = (targetX - player.position.x) * -0.35;
    heroMat.rotation += (leanTarget - heroMat.rotation) * Math.min(1, dt * 8);

    debugBox.textContent =
      `lane: ${laneIndex}  grounded: ${!jumping}\n` +
      `velY: ${velY.toFixed(2)}  y: ${player.position.y.toFixed(2)}\n` +
      `speed: ${speed.toFixed(2)}  onCandle: ${onCandle ? onCandle.color : 'none'}\n` +
      `elapsed: ${elapsed.toFixed(1)}s`;
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    // Coin bob animation runs regardless of game state — visible during
    // the room phase, harmless (just hidden) once ape'd in.
    const t = clock.getElapsedTime();
    coinMeshes.forEach((c) => {
      c.group.position.y = c.baseY + Math.sin(t * 1.4 + c.bobPhase) * 0.08;
      c.group.rotation.y += dt * 0.4;
      const isFocused = coinMeshes.indexOf(c) === focusedCoinIndex || coinMeshes.indexOf(c) === hoveredCoinIndex;
      if (!c.locked) {
        // MeshBasicMaterial has no emissive property — brighten the color
        // multiplier itself for the focus highlight instead.
        const brightness = isFocused ? 1.25 : 1;
        c.disc.material.color.setRGB(brightness, brightness, brightness);
      }
      c.group.scale.setScalar(isFocused ? 1.12 : 1);
    });

    if (started && !ended && !paused) update(dt);
    renderer.render(scene, camera);
  }
  animate();

  // ---------- TEARDOWN ----------
  function teardown() {
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('wheel', onWheel);
    renderer.domElement.removeEventListener('click', onCoinClick);
    renderer.domElement.removeEventListener('mousedown', onGameplayClick);
    renderer.domElement.removeEventListener('touchstart', onTouchStart);
    renderer.domElement.removeEventListener('touchend', onTouchEnd);
    coinMeshes.forEach((c) => {
      c.disc.geometry.dispose();
      c.disc.material.dispose();
      c.group.children.forEach((child) => {
        if (child.material?.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
      });
    });
    candles.forEach((c) => {
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
    });
    groundTexture.dispose();
    groundMat.dispose();
    groundMesh.geometry.dispose();
    heroTexture.dispose();
    heroMat.dispose();
    renderer.dispose();
    root.remove();
  }

  return teardown;
}
