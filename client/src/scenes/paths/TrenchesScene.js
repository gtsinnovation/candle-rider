// client/src/scenes/paths/TrenchesScene.js
//
// Path 1 — Memecoin & Trenches Degen. Endless-runner platforming: jump
// between lanes of candle platforms, riding green ones for Bag and getting
// punished for standing on ones that flip red. Ported from the standalone
// Three.js prototype into the real game — same mechanics, now reading/
// writing through GameState instead of a local `stats` object, and reusing
// the global HUD (bag/health/energy/conviction) instead of drawing its own.
//
// Manual cash-out is bound to Escape (Space is taken by Jump here, unlike
// the other four paths where Space is free for cash-out).

import * as THREE from 'three';
import { eventBus } from '../../core/EventBus.js';

const LANES = [-2.4, 0, 2.4];
const CANDLE_W = 1.5;
const CANDLE_D = 1.6;
const DESPAWN_Z = 6;
const GRAVITY = -18; // partial rollback from -16 — that was floatier than the candle spacing/timing could actually support, causing jumps to overshoot past the landing window

// Speed tiers, scaled off the original tuned baseline (base 9 / ramp 0.12 /
// cap 7). Beginner is 50% of that baseline and is the default — new
// players (or anyone re-learning the mechanic) start here. Master is
// stacked-on-top for players who've already gotten comfortable and want
// the original-and-then-some pace back. "Selectable by player" per design,
// not tied to actual player level/mastery — a run-start choice, not a gate.
const DIFFICULTY_PRESETS = {
  // All three tiers dropped an additional 10% (on top of Beginner's
  // original 50%-of-baseline) after playtesting felt too fast overall.
  beginner: { label: 'Beginner', base: 4.05, ramp: 0.054, cap: 3.15 },
  middle:   { label: 'Middle',   base: 8.1,  ramp: 0.108, cap: 6.3 },
  master:   { label: 'Master',   base: 12.15, ramp: 0.162, cap: 9.45 },
};

const DIFFICULTY_STORAGE_KEY = 'candlerider:trenchesDifficulty';

function getLastDifficulty() {
  return localStorage.getItem(DIFFICULTY_STORAGE_KEY) || 'beginner';
}
function setLastDifficulty(id) {
  try { localStorage.setItem(DIFFICULTY_STORAGE_KEY, id); } catch { /* non-fatal */ }
}

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
  hint.innerHTML = 'A / D or ← → : change lane<br/>SPACE : jump<br/>ESC : cash out';
  root.appendChild(hint);

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

  const difficultyOverlay = document.createElement('div');
  difficultyOverlay.style.cssText = `
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    flex-direction:column; background:rgba(3,3,10,.9); text-align:center; z-index:15;
    font-family: system-ui, sans-serif;
  `;
  const lastDifficulty = getLastDifficulty();
  difficultyOverlay.innerHTML = `
    <h2 style="font-size:22px;color:#7dffcf;margin:0 0 6px;text-shadow:0 0 16px rgba(125,255,207,.5);">SET YOUR PACE</h2>
    <p style="color:#c9c9e6;font-size:13px;margin:4px 0 20px;max-width:360px;">Candle approach speed. You can change this every run — start slow while you learn the timing.</p>
    <div id="tr-diff-btns" style="display:flex; gap:10px;"></div>
  `;
  const diffBtnRow = difficultyOverlay.querySelector('#tr-diff-btns');
  Object.entries(DIFFICULTY_PRESETS).forEach(([id, preset]) => {
    const btn = document.createElement('button');
    const isDefault = id === lastDifficulty;
    btn.textContent = preset.label + (id === 'beginner' ? ' (Recommended)' : '');
    btn.style.cssText = `
      background:${isDefault ? '#7dffcf' : '#1a1a34'}; color:${isDefault ? '#05100c' : '#eef0ff'};
      border:1px solid #3a3a6f; padding:10px 18px; border-radius:7px; font-size:13px;
      font-weight:700; cursor:pointer;
    `;
    btn.addEventListener('click', () => startWithDifficulty(id));
    diffBtnRow.appendChild(btn);
  });
  root.appendChild(difficultyOverlay);

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
  resize();
  window.addEventListener('resize', resize);
  camera.position.set(1.4, 3.4, 7.5);
  camera.lookAt(0, 0.6, -4);

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
  const GROUND_CELL_SIZE = 5; // world units per texture repeat, matches old GridHelper's cell size
  groundTexture.repeat.set(400 / GROUND_CELL_SIZE, 400 / GROUND_CELL_SIZE);

  const groundMat = new THREE.MeshBasicMaterial({ map: groundTexture, transparent: true, opacity: 0.6 });
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -1.2;
  scene.add(groundMesh);

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
    const height = 0.6 + Math.random() * 1.6;
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
  // startWithDifficulty() rather than relying on the normal landing check
  // to catch a mid-air faller.
  const startCandle = spawnCandle(0, 1); // lane 1 = LANES[1] = 0, matches player's starting lane

  let cursorZ = -4;
  for (let i = 0; i < 24; i++) {
    spawnCandle(cursorZ);
    cursorZ -= 3.4 + Math.random() * 1.4;
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
  let difficulty = DIFFICULTY_PRESETS[lastDifficulty] || DIFFICULTY_PRESETS.beginner;
  let animId = null;
  let landSquashTimer = 0; // counts down after landing, drives the squash/rebound animation

  function startWithDifficulty(id) {
    difficulty = DIFFICULTY_PRESETS[id] || DIFFICULTY_PRESETS.beginner;
    setLastDifficulty(id);

    // Defense-in-depth: force the player back to the guaranteed starting
    // lane/position even though input is now also gated by `started` above
    // — belt and suspenders against any other future path that might move
    // laneIndex before this point.
    laneIndex = 1;
    player.position.x = LANES[1];

    // Land the player on the guaranteed starting candle instead of letting
    // physics begin mid-air — this is what actually fixes the "falls into
    // the void within the first second" bug, independent of how slow the
    // chosen difficulty's candle-approach speed is.
    const topY = startCandle.mesh.position.y + startCandle.height / 2; // true top surface (mesh.position.y already includes the ground-offset)
    player.position.y = topY;
    velY = 0;
    jumping = false;
    onCandle = startCandle;

    // Refresh every currently-spawned candle's flip timer relative to NOW —
    // without this, a candle's red-flip timer (set at mount time, in real
    // wall-clock ms) could already be expired if the player spent a while
    // on this difficulty-select screen, causing an instant "unfair" flip/
    // damage the moment gameplay begins.
    const now = performance.now();
    candles.forEach((c) => {
      c.flipAt = now + 1800 + Math.random() * 2600;
    });

    started = true;
    difficultyOverlay.style.display = 'none';
  }

  function keydown(e) {
    keys[e.code] = true;
    if (ended || !started) return; // ignore all gameplay input until a difficulty is actually chosen
    if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && laneIndex > 0) laneIndex--;
    if ((e.code === 'ArrowRight' || e.code === 'KeyD') && laneIndex < 2) laneIndex++;
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !jumping) {
      jumping = true;
      velY = 7.5; // retuned alongside gravity — still clears the full candle height range, but with less airtime overshoot past the landing window
    }
    if (e.code === 'Escape') cashOut();
  }
  function keyup(e) { keys[e.code] = false; }
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);

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
      cursorZ = (nextCursorZ !== null ? nextCursorZ : -4) - (3.4 + Math.random() * 1.4);
      spawnCandle(cursorZ);
      nextCursorZ = cursorZ;
    }

    onCandle = null;
    for (const c of candles) {
      const sameLane = Math.abs(c.mesh.position.x - player.position.x) < CANDLE_W / 2;
      const nearZ = Math.abs(c.mesh.position.z - player.position.z) < CANDLE_D / 2 + 0.5; // widened from +0.15 — jump airtime now often outlasts how long a single candle stays in range, so the landing window needed to be more forgiving
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

    const camTarget = new THREE.Vector3(player.position.x * 0.6, player.position.y + 3.4, player.position.z + 7.5);
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
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (started && !ended) update(dt);
    renderer.render(scene, camera);
  }
  animate();

  // ---------- TEARDOWN ----------
  function teardown() {
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('resize', resize);
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
