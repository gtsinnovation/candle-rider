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
    ${window.innerWidth < 480 ? 'display:none;' : ''}
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
    position:absolute; top:40%; left:50%; transform:translate(-50%,-50%);
    font-size:16px; font-weight:700; color:#eef0ff; text-align:center; z-index:6;
    font-family: system-ui, sans-serif; pointer-events:none; text-shadow:0 0 10px rgba(0,0,0,.8);
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
    position:absolute; top:110px; right:22px; z-index:6; display:flex; gap:8px;
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
      ? '<div style="font-size:20px;margin-bottom:6px;">👆 SWIPE to change lanes<br/>👆 TAP to jump</div><div style="font-size:11px;color:#9a9ac0;">Use the ⏸ and CASH OUT buttons up top</div>'
      : '<div style="font-size:20px;margin-bottom:6px;">A/D or ←/→ to move · SPACE to jump</div><div style="font-size:11px;color:#9a9ac0;">ESC to cash out · P to pause</div>';
    controlsToast.style.opacity = '1';
    clearTimeout(showControlsToast._t);
    showControlsToast._t = setTimeout(() => (controlsToast.style.opacity = '0'), durationMs);
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

  const coinMeshes = TRENCHES_COINS.map((coin, i) => {
    const x = (i - (TRENCHES_COINS.length - 1) / 2) * 1.9;
    const group = new THREE.Group();
    group.position.set(x, 1.1, -3);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: coin.color, emissive: coin.color, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.4 })
    );
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

  LANES.forEach((x) => {
    const geo = new THREE.PlaneGeometry(0.05, 400);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2c2c55, transparent: true, opacity: 0.5 });
    const line = new THREE.Mesh(geo, mat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, -1.18, -150);
    scene.add(line);
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
  const GREEN = 0x00ff77;
  const RED = 0xff3355;

  function candleMaterial(color) {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.4 });
  }

  function spawnCandle(z, forcedLane) {
    const lane = forcedLane !== undefined ? forcedLane : Math.floor(Math.random() * 3);
    const height = (0.6 + Math.random() * 1.6) * WORLD_SCALE;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(CANDLE_W, height, CANDLE_D), candleMaterial(GREEN));
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

  // ---------- STATE ----------
  const keys = {};
  let velY = 0;
  let jumping = true;
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
  let lastInputTime = performance.now();
  let idleWarningShown = false;

  function apeIntoCoin(coin) {
    if (started) return; // already ape'd in, ignore repeat clicks/enters
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

  function tryJump() {
    if (jumping) return;
    jumping = true;
    velY = 7.5; // retuned alongside gravity — still clears the full candle height range, but with less airtime overshoot past the landing window
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

      if (c.color === 'green' && performance.now() > c.flipAt) {
        c.color = 'red';
        c.mesh.material.color.setHex(RED);
        c.mesh.material.emissive.setHex(RED);
        if (onCandle === c) {
          gameState.reportHealth(Math.max(0, gameState.state.health - 14));
          popCombo('RUG FLIP! -14 HP', '#ff5577');
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
        onCandle = c;

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
      c.disc.material.emissiveIntensity = isFocused ? 1.3 : 0.7;
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
