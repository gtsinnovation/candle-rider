// client/src/ui/AdminDashboard.js
//
// Admin-only control panel, mounted on the hidden `#admin` route and
// passphrase-gated so it isn't reachable by regular players. Currently
// hosts the Demo Play (autopilot) toggle: when on, the Trenches path runs
// an autopilot that plays, cashes out at a target, and auto-restarts —
// for hands-off teaser/cast footage pre-launch.
//
// Auth is client-side only (a passphrase + a sessionStorage flag). This is
// NOT real security — the bundle is public — it just keeps the panel off
// the normal player path. Change ADMIN_PASSPHRASE below to restrict access.

import { isDemoMode, setDemoMode } from '../core/demoMode.js';

const ADMIN_PASSPHRASE = 'degen-admin'; // change me to restrict dashboard access
const SESSION_KEY = 'cd_admin_auth';

export function mountAdminDashboard(container, onExit) {
  const root = document.createElement('div');
  root.style.cssText = `
    position:absolute; inset:0; z-index:100; background:#050510; color:#eef0ff;
    font-family:system-ui,sans-serif; display:flex; align-items:center; justify-content:center;
  `;
  container.appendChild(root);

  function renderPanel() {
    const demoOn = isDemoMode();
    root.innerHTML = `
      <div style="width:440px; max-width:92vw; background:#0c0c1a; border:1px solid #2a2a4a; border-radius:14px; padding:30px; box-sizing:border-box;">
        <div style="font-size:12px; color:#6f6f95; letter-spacing:1.5px; margin-bottom:4px;">ADMIN DASHBOARD</div>
        <h1 style="font-size:22px; margin:0 0 24px; color:#7dffcf; font-weight:700;">Candle Rider Controls</h1>

        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px; background:#13132a; border:1px solid #2a2a4a; border-radius:10px; margin-bottom:14px;">
          <div>
            <div style="font-size:15px; font-weight:700;">Demo Play (Autopilot)</div>
            <div style="font-size:12px; color:#9a9ac0; margin-top:4px; line-height:1.4;">Trenches plays itself, cashes out, and loops — for teaser/cast footage.</div>
          </div>
          <label style="position:relative; display:inline-block; width:52px; height:28px; flex:0 0 52px; cursor:pointer;">
            <input id="admin-demo-toggle" type="checkbox" ${demoOn ? 'checked' : ''} style="opacity:0; width:0; height:0;">
            <span style="position:absolute; inset:0; border-radius:28px; transition:background .2s; background:${demoOn ? '#7dffcf' : '#3a3a5f'};"></span>
            <span style="position:absolute; top:3px; left:${demoOn ? '27px' : '3px'}; width:22px; height:22px; border-radius:50%; background:#fff; transition:left .2s;"></span>
          </label>
        </div>

        <div style="font-size:12px; color:#9a9ac0; margin-bottom:24px;">
          Status: <span style="color:${demoOn ? '#7dffcf' : '#ff6688'}; font-weight:700;">${demoOn ? 'ON — autopilot active' : 'OFF — user play'}</span>
        </div>

        <button id="admin-open-game" style="width:100%; background:#7dffcf; color:#05100c; border:none; padding:12px; border-radius:9px; font-size:14px; font-weight:700; cursor:pointer;">Open Game</button>
        <button id="admin-lock" style="margin-top:10px; width:100%; background:transparent; color:#6f6f95; border:1px solid #2a2a4a; padding:10px; border-radius:9px; font-size:12px; cursor:pointer;">Lock dashboard</button>
      </div>
    `;
    root.querySelector('#admin-demo-toggle').addEventListener('change', (e) => {
      setDemoMode(e.target.checked);
      renderPanel(); // refresh the status + toggle visuals
    });
    root.querySelector('#admin-open-game').addEventListener('click', onExit);
    root.querySelector('#admin-lock').addEventListener('click', () => {
      sessionStorage.removeItem(SESSION_KEY);
      renderGate();
    });
  }

  function renderGate() {
    root.innerHTML = `
      <div style="width:340px; max-width:92vw; background:#0c0c1a; border:1px solid #2a2a4a; border-radius:14px; padding:30px; text-align:center; box-sizing:border-box;">
        <div style="font-size:12px; color:#6f6f95; letter-spacing:1.5px; margin-bottom:4px;">ADMIN</div>
        <h1 style="font-size:20px; margin:0 0 18px; color:#eef0ff; font-weight:700;">Dashboard locked</h1>
        <input id="admin-pass" type="password" placeholder="Passphrase" style="width:100%; box-sizing:border-box; background:#13132a; border:1px solid #2a2a4a; border-radius:8px; padding:11px; color:#eef0ff; font-size:14px; margin-bottom:10px; outline:none;">
        <div id="admin-pass-err" style="font-size:12px; color:#ff6688; margin-bottom:8px; min-height:14px;"></div>
        <button id="admin-unlock" style="width:100%; background:#7dffcf; color:#05100c; border:none; padding:11px; border-radius:9px; font-size:14px; font-weight:700; cursor:pointer;">Unlock</button>
        <button id="admin-back" style="margin-top:10px; width:100%; background:transparent; color:#6f6f95; border:1px solid #2a2a4a; padding:10px; border-radius:9px; font-size:12px; cursor:pointer;">Back to game</button>
      </div>
    `;
    const pass = root.querySelector('#admin-pass');
    pass.focus();
    const submit = () => {
      if (pass.value === ADMIN_PASSPHRASE) {
        sessionStorage.setItem(SESSION_KEY, '1');
        renderPanel();
      } else {
        root.querySelector('#admin-pass-err').textContent = 'Incorrect passphrase.';
      }
    };
    root.querySelector('#admin-unlock').addEventListener('click', submit);
    pass.addEventListener('keydown', (e) => { if (e.code === 'Enter') submit(); });
    root.querySelector('#admin-back').addEventListener('click', onExit);
  }

  if (sessionStorage.getItem(SESSION_KEY) === '1') renderPanel();
  else renderGate();

  return () => root.remove();
}
