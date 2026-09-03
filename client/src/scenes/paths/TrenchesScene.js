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
import { isDemoMode } from '../../core/demoMode.js';

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
  // The run starts when the player apes into a coin (apeIntoCoin), not on
  // card click — so the run clock and resource resets begin at the moment
  // gameplay actually begins, not while browsing the coin room.

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

  // Damage vignette — a red radial-gradient overlay that flashes the screen
  // edges when the player takes a hit (rug flip / red-candle landing), so
  // damage reads as a visceral screen-space punch on top of the HUD number
  // change and combo text.
  const damageVignette = document.createElement('div');
  damageVignette.style.cssText = `
    position:absolute; inset:0; z-index:8; pointer-events:none;
    background: radial-gradient(ellipse at center, transparent 35%, rgba(255,40,60,0.6) 100%);
    opacity:0; transition:opacity .1s ease-out;
  `;
  root.appendChild(damageVignette);

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

  // Combat hit feedback — fires a camera shake impulse, a red screen-edge
  // vignette flash, and a brief hero red-tint, so taking damage feels like a
  // punch rather than just a number ticking down. `intensity` scales all
  // three (rug flip = 0.5, red-candle landing = 0.3).
  function triggerHit(intensity) {
    shakeAmount = Math.max(shakeAmount, intensity);
    hitFlashTimer = Math.max(hitFlashTimer, 0.25);
    damageVignette.style.opacity = String(Math.min(0.9, intensity * 1.4));
    clearTimeout(triggerHit._t);
    triggerHit._t = setTimeout(() => { damageVignette.style.opacity = '0'; }, 130);
  }

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
  function makeCoinLabelTexture(coin) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillStyle = '#' + coin.color.toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.shadowBlur = 10;
    ctx.fillText(coin.symbol, 128, 60);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#c9c9e6';
    ctx.fillText(coin.name, 128, 95);
    return new THREE.CanvasTexture(c);
  }

  // Coins arranged on a curved arc around orbitTarget, all equidistant —
  // scales to any screen width naturally (unlike a straight row, which
  // either runs off-screen or needs constant re-tuning per viewport).
  const ARC_RADIUS = 6.2;
  const ARC_SPAN = Math.PI * 0.75; // ~135° total spread

  const coinMeshes = TRENCHES_COINS.map((coin, i) => {
    const t = TRENCHES_COINS.length === 1 ? 0 : i / (TRENCHES_COINS.length - 1);
    const angle = -ARC_SPAN / 2 + t * ARC_SPAN;
    const x = orbitTarget.x + Math.sin(angle) * ARC_RADIUS;
    const z = orbitTarget.z - Math.cos(angle) * ARC_RADIUS;

    const group = new THREE.Group();
    group.position.set(x, 1.1, z);
    group.lookAt(orbitTarget.x, group.position.y, orbitTarget.z); // each coin faces the center of the arc, not just whichever way it happened to spawn

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: coin.color, emissive: coin.color, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.4 })
    );
    disc.rotation.x = Math.PI / 2; // stand the coin upright, flat face toward the viewer, instead of lying flat like a hockey puck
    group.add(disc);

    const labelMat = new THREE.SpriteMaterial({ map: makeCoinLabelTexture(coin), transparent: true });
    const label = new THREE.Sprite(labelMat);
    label.scale.set(1.6, 0.8, 1);
    label.position.y = 0.95;
    group.add(label);

    scene.add(group);
    return { coin, group, disc, baseY: 1.1, bobPhase: Math.random() * Math.PI * 2 };
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
  const heroTexture = new THREE.TextureLoader().load(
    '/assets/heroes/trenches-back-cutout.png',
    undefined, undefined,
    (err) => console.error('[trenches] hero texture failed to load:', err?.message || err)
  );
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
  const GREEN = 0x00ff77;
  const RED = 0xff3355;

  // Shared geometry + two shared materials for ALL candles. Candles spawn
  // and despawn continuously throughout a run, so per-candle geometry/
  // material allocations would leak GPU memory for the whole session (the
  // old code removed the mesh on despawn but never disposed its geometry/
  // material). Height varies per candle via mesh.scale.y instead of a
  // per-candle BoxGeometry, so a single shared unit cube suffices.
  const candleGeo = new THREE.BoxGeometry(1, 1, 1);
  const greenMat = new THREE.MeshStandardMaterial({ color: GREEN, emissive: GREEN, emissiveIntensity: 0.55, roughness: 0.4 });
  const redMat = new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.55, roughness: 0.4 });

  function spawnCandle(z, forcedLane) {
    const lane = forcedLane !== undefined ? forcedLane : Math.floor(Math.random() * 3);
    const height = (0.6 + Math.random() * 1.6) * WORLD_SCALE;
    const mesh = new THREE.Mesh(candleGeo, greenMat);
    mesh.scale.set(CANDLE_W, height, CANDLE_D);
    mesh.position.set(LANES[lane], height / 2 - 1.2, z);
    scene.add(mesh);
    const candle = {
      mesh, lane, height, color: 'green',
      flipAt: performance.now() + 1800 + Math.random() * 2600,
      scored: false,
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
  const startCandle = spawnCandle(0, 1); // lane 1 = LANES[1] = 0, matches player's starting lane

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
  let speed = 6; // base scroll speed — lowered from 9 for a gentler start
  let elapsed = 0;
  let streak = 0;
  let ended = false;
  let started = false;
  let paused = false;
  let difficulty = getCoinById(getLastCoinId());
  let animId = null;
  let landSquashTimer = 0; // counts down after landing, drives the squash/rebound animation
  let jumpBufferTimer = 0; // counts down; a jump press made just before landing is buffered and re-fired on touchdown
  let shakeAmount = 0;     // camera shake impulse, decays each frame — set on combat hits
  let hitFlashTimer = 0;   // counts down after a hit, drives the hero red-tint flash
  let lastInputTime = performance.now();
  let idleWarningShown = false;

  function apeIntoCoin(coin) {
    if (started) return; // already ape'd in, ignore repeat clicks/enters
    gameState.startRun('trenches'); // run begins here, not on the card click
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
    const now = performance.now();
    candles.forEach((c) => {
      c.flipAt = now + 1800 + Math.random() * 2600;
    });

    lastInputTime = performance.now();
    started = true;
    showControlsToast();
  }

  function pauseGame(reason) {
    if (!started || ended || paused) return;
    paused = true;
    pauseOverlay.querySelector('#tr-pause-title').textContent = reason ? 'AUTO-PAUSED' : 'PAUSED';
    pauseOverlay.querySelector('#tr-pause-reason').textContent = reason || 'Take your time — your run is safely frozen.';
    pauseOverlay.style.display = 'flex';
  }
  function resumeGame() {
    if (!paused) return;
    paused = false;
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
  const JUMP_BUFFER_WINDOW = 0.12; // seconds — a jump press within this long before landing is buffered

  function tryJump() {
    if (!jumping) {
      // fresh jump from solid ground
      jumping = true;
      jumpChainCount = 1;
      velY = JUMP_LAUNCH_VEL;
      jumpBufferTimer = 0;
      return;
    }
    // Already airborne — each additional tap gives one more incremental
    // step up, capped so repeated tapping can't just fly over everything.
    // Resets to 0 the moment the player actually lands (see landing checks
    // below), so it's per-jump, not a global resource.
    if (jumpChainCount < MAX_JUMP_TAPS) {
      jumpChainCount++;
      velY = JUMP_BOOST_VEL;
    } else {
      // At the step-up cap — buffer the press so that if the player lands
      // within the buffer window, a fresh launch fires immediately on
      // touchdown. This removes the "I pressed jump a hair too early and
      // nothing happened" frustration that makes runners feel unresponsive.
      jumpBufferTimer = JUMP_BUFFER_WINDOW;
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
    showOverlay('CASHED OUT', `Banked $${result.pnlEarned.toLocaleString()} PNL and ${result.reputationEarned} Reputation.`, '#7dffcf');
  }

  function lose(title, reason) {
    if (ended) return;
    gameState.loseRun(reason);
    showOverlay(title, reason, '#ff5577');
  }

  // ---------- Demo / autopilot mode (admin-controlled) ----------
  // When the admin dashboard flips demo mode on, an autopilot drives the
  // whole run hands-free: apes into a coin, picks the safest lane each
  // frame (nearest green candle not about to flip), jumps to bridge gaps /
  // escape rugs, cashes out at a target bag (or time limit), then
  // auto-retries — looping for teaser/cast footage. Driven from animate()
  // so it runs in every phase (coin room, play, ended), not just update().
  const DEMO_BAG_TARGET = 200;
  const DEMO_MAX_RUN_SEC = 42;
  let demoApeInDelay = 0;
  let demoEndedDelay = 0;
  let demoRetryQueued = false;

  // Score each lane by its best candle near the landing zone: green candles
  // close to z=0 that aren't about to flip rank highest.
  // Pick the safest lane to be in. Only candles that are arriving or at
  // the landing zone (z <= 1.2) count — a candle past that is leaving and
  // will despawn before it can be ridden. `avoidLane` penalizes the lane
  // we're trying to leave so the autopilot switches away from a bad candle
  // rather than jumping straight back onto it.
  // Pick the safest lane to be in. Only candles at or before the landing
  // zone (z <= 1.2) count; a candle past that is leaving and will despawn
  // before it can be ridden. Fresh candles still near z=0 score highest —
  // the autopilot slides sideways onto them instead of jumping into gaps.
  // `avoidLane` penalizes the lane we're leaving so we switch away from a
  // bad candle rather than re-selecting it.
  // Pick the lane with the best candle to escape to. Only candles that are
  // arriving or at center (z <= 0.5) count — a candle past that is leaving
  // and will despawn before it can be ridden. The filter reaches back to
  // z=-5 so it includes candles that arrive at the landing zone during a
  // jump's ~0.83s airtime (~speed*0.83 ≈ 3 units of travel). `avoidLane`
  // lightly penalizes the lane we're leaving so we prefer a fresh lane.
  function bestEscapeLane(now, avoidLane) {
    const laneBest = [-Infinity, -Infinity, -Infinity];
    for (const c of candles) {
      const z = c.mesh.position.z;
      if (z < -5 || z > 0.5) continue;
      const flippingSoon = c.color === 'green' && (c.flipAt - now) < 1000;
      const green = c.color === 'green' && !flippingSoon;
      let score = (green ? 100 : (c.color === 'green' ? 45 : 8)) - Math.abs(z) * 5;
      if (c.lane === avoidLane) score -= 25;
      if (score > laneBest[c.lane]) laneBest[c.lane] = score;
    }
    let targetLane = laneIndex, top = -Infinity;
    for (let l = 0; l < 3; l++) {
      if (laneBest[l] > top) { top = laneBest[l]; targetLane = l; }
    }
    return targetLane;
  }

  function demoAutopilot() {
    const now = performance.now();
    if (onCandle) {
      const cz = onCandle.mesh.position.z;
      // Ride the current candle until it's near despawn, then jump to the
      // next arriving candle. One jump per candle keeps the autopilot
      // stable — jumping for red/flips causes chaos, and the flip damage is
      // already done by the time we'd react anyway.
      if (cz > DESPAWN_Z * 0.25 && !jumping) {
        const target = bestEscapeLane(now, laneIndex);
        if (target !== laneIndex) laneIndex = target;
        tryJump();
      }
    } else {
      // Airborne — steer toward the best landing lane, and step-jump to
      // extend airtime only when there's no candle at all under us (landing
      // on red is survivable, so don't waste a step-jump then).
      const target = bestEscapeLane(now, -1);
      if (target !== laneIndex) laneIndex = target;
      if (velY < 0) {
        const hasLanding = candles.some((c) => c.lane === laneIndex && Math.abs(c.mesh.position.z) < 2.0);
        if (!hasLanding && jumpChainCount < MAX_JUMP_TAPS) tryJump();
      }
    }
  }

  function demoTick(dt) {
    if (!isDemoMode()) return;
    // Coin room → ape in after a beat so the door animation reads
    if (roomActive && !started) {
      demoApeInDelay += dt;
      if (demoApeInDelay > 1.1) apeIntoCoin(TRENCHES_COINS[focusedCoinIndex]);
      return;
    }
    // Playing → autopilot + cash out at target/time
    if (started && !ended && !paused) {
      demoAutopilot();
      const bag = gameState.currentRun ? gameState.currentRun.bag : 0;
      if (bag >= DEMO_BAG_TARGET || elapsed > DEMO_MAX_RUN_SEC) cashOut();
      return;
    }
    // Ended → auto-retry after a pause so the result overlay is visible
    if (ended && !demoRetryQueued) {
      demoEndedDelay += dt;
      if (demoEndedDelay > 2.2) {
        demoRetryQueued = true;
        // Defer to after this frame so teardown (triggered by the retry
        // click) doesn't run mid-render.
        setTimeout(() => {
          const btn = overlay.querySelector('#tr-retry-btn');
          if (btn && isDemoMode()) btn.click();
        }, 0);
      }
    }
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
    player.position.x += (targetX - player.position.x) * Math.min(1, dt * 20); // snappier lane transitions (~75ms) so dodging between lanes feels immediate
    updateLaneDots();

    // Tick down the jump buffer; consumed on landing below.
    if (jumpBufferTimer > 0) jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);

    velY += GRAVITY * dt;
    player.position.y += velY * dt;

    let nextCursorZ = null;
    for (let i = candles.length - 1; i >= 0; i--) {
      const c = candles[i];
      c.mesh.position.z += speed * dt;

      if (c.color === 'green' && performance.now() > c.flipAt) {
        c.color = 'red';
        c.mesh.material = redMat; // swap to the shared red material (no per-candle alloc)
        if (onCandle === c) {
          gameState.reportHealth(Math.max(0, gameState.state.health - 14));
          popCombo('RUG FLIP! -14 HP', '#ff5577');
          triggerHit(0.5);
        }
      }

      if (c.mesh.position.z > DESPAWN_Z) {
        if (onCandle === c && !jumping) {
          lose('RUGPULLED', 'The candle vanished under you.');
        }
        scene.remove(c.mesh);
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

        // Buffered jump: if the player pressed jump within the buffer window
        // before touchdown, fire a fresh launch immediately instead of
        // eating the input — keeps the bounce rhythm feeling tight.
        if (jumpBufferTimer > 0) {
          jumping = true;
          jumpChainCount = 1;
          velY = JUMP_LAUNCH_VEL;
          jumpBufferTimer = 0;
          landSquashTimer = 0; // skipping the squash — going straight back up
        }

        if (!c.scored) {
          c.scored = true;
          if (c.color === 'green') {
            const gain = 8 + Math.floor(Math.random() * 10);
            gameState.addBag(gain);
            streak += 1;
            popCombo('+$' + gain + ' LANDED', '#7dffcf');
          } else {
            gameState.addBag(-6);
            streak = 0;
            popCombo('LANDED ON RED', '#ff9955');
            triggerHit(0.3);
          }
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
    camera.position.lerp(camTarget, Math.min(1, dt * 8)); // tighter camera follow so the view feels connected to movement
    camera.lookAt(player.position.x * 0.6, player.position.y + 0.6, player.position.z - 4);

    // Camera shake on combat hits — jitter the camera position around the
    // look-at target, decaying over ~0.3s. Applied after lookAt so the
    // aim point stays steady while the viewpoint punches.
    if (shakeAmount > 0) {
      shakeAmount = Math.max(0, shakeAmount - dt * 1.7);
      const s = shakeAmount * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
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

    // Hero hit flash — tint the sprite red on a combat hit, easing back to
    // white as the hitFlashTimer runs out. SpriteMaterial.color multiplies
    // the texture, so this reads as a red wash over the hero art.
    if (hitFlashTimer > 0) {
      hitFlashTimer = Math.max(0, hitFlashTimer - dt);
      const f = hitFlashTimer / 0.25; // 1 at impact → 0 as it fades
      heroMat.color.setRGB(1, 1 - 0.7 * f, 1 - 0.7 * f);
    } else {
      heroMat.color.setRGB(1, 1, 1);
    }

    // Bank/lean into lane changes — SpriteMaterial.rotation is an in-plane
    // (view-axis) roll, the one rotation a billboard sprite actually
    // respects. Tightened (dt * 12) so the lean catches up to the snappier
    // lane transitions instead of lagging behind them.
    const leanTarget = (targetX - player.position.x) * -0.35;
    heroMat.rotation += (leanTarget - heroMat.rotation) * Math.min(1, dt * 12);

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
      c.disc.material.emissiveIntensity = isFocused ? 1.3 : 0.7;
      c.group.scale.setScalar(isFocused ? 1.12 : 1);
    });

    if (started && !ended && !paused) update(dt);
    demoTick(dt); // admin autopilot — no-op unless demo mode is on
    renderer.render(scene, camera);
  }
  animate();

  // ---------- Robustness: recover on context loss
  // Note: an explicit `visibilitychange` auto-pause was removed — in the
  // preview iframe (and some embedded contexts) `document.hidden` is
  // unreliable and fired spuriously, freezing the run mid-play. A hidden
  // tab already suspends `requestAnimationFrame`, and `clock.getDelta()`
  // is capped at 0.05s, so the game naturally freezes while the tab is
  // away and resumes cleanly when it returns — no explicit pause needed.
  function onContextLost(e) {
    e.preventDefault();
    cancelAnimationFrame(animId);
    if (started && !ended) {
      ended = true;
      overlay.querySelector('#tr-overlay-title').textContent = 'GRAPHICS CONTEXT LOST';
      overlay.querySelector('#tr-overlay-title').style.color = '#ff6688';
      overlay.querySelector('#tr-overlay-reason').textContent = 'The graphics context was lost (common on mobile under memory pressure). Reload the page to resume.';
      overlay.style.display = 'flex';
    }
  }
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  // ---------- TEARDOWN ----------
  function teardown() {
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
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
    groundTexture.dispose();
    groundMat.dispose();
    groundMesh.geometry.dispose();
    candleGeo.dispose();
    greenMat.dispose();
    redMat.dispose();
    heroTexture.dispose();
    heroMat.dispose();
    renderer.dispose();
    root.remove();
  }

  return teardown;
}
