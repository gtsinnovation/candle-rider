// client/src/ui/Leaderboard.js
//
// Browsable standings. The rank number on a result card tells a player
// where they landed; this tells them who's ahead and by how much, which is
// the part that actually drives another run. "You're #47, #46 is $180
// ahead" is a concrete, closeable gap — a bare rank is just a fact.
//
// Ranks BEST SINGLE RUN, not lifetime totals: "$4,200 in one run" is a
// brag, "lifetime $50,000" only means you played a lot.

import { api } from '../api/client.js';
import { getDisplayName, setDisplayName } from '../core/SaveManager.js';

const PANEL_ID = 'cr-leaderboard';

export function mountLeaderboard(container, { playerId, onClose }) {
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = `
    position:absolute; inset:0; z-index:60; display:flex; align-items:center;
    justify-content:center; background:rgba(3,3,10,.92); font-family:system-ui,sans-serif;
    padding:20px; box-sizing:border-box;
  `;
  panel.innerHTML = `
    <div style="width:min(520px,94vw); max-height:86vh; overflow-y:auto; background:linear-gradient(180deg,#0f1a14,#05070a);
                border:1px solid #18ff6e; border-radius:14px; padding:22px 20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <div style="font-size:19px; font-weight:800; color:#18ff6e; letter-spacing:1px;">TOP DEGENS</div>
        <button id="cr-lb-close" style="background:transparent;border:none;color:#6f6f95;font-size:22px;cursor:pointer;line-height:1;">×</button>
      </div>
      <div style="font-size:11px; color:#7d7da0; margin-bottom:16px;">Best single run in the Trenches</div>
      <div id="cr-lb-body" style="font-size:13px; color:#9a9ac0;">Loading standings…</div>
      <div style="margin-top:18px; padding-top:14px; border-top:1px solid #1c2a22;">
        <div style="font-size:10px; letter-spacing:1.5px; color:#6f6f95; margin-bottom:6px;">YOUR NAME ON THE BOARD</div>
        <div style="display:flex; gap:8px;">
          <input id="cr-lb-name" maxlength="20" placeholder="Degen"
            style="flex:1; background:#0d0d1c; color:#eef0ff; border:1px solid #2a2a4a; border-radius:7px;
                   padding:8px 10px; font-family:system-ui,sans-serif; font-size:12px;" />
          <button id="cr-lb-save" style="background:#18ff6e; color:#04140a; border:none; border-radius:7px;
                   padding:8px 16px; font-size:12px; font-weight:800; cursor:pointer;">SAVE</button>
        </div>
        <div id="cr-lb-name-note" style="font-size:10px; color:#6f6f95; margin-top:6px;">Applies to your next cash-out.</div>
      </div>
    </div>
  `;
  container.appendChild(panel);

  panel.querySelector('#cr-lb-close').addEventListener('click', close);
  function onKey(e) { if (e.code === 'Escape') close(); }
  window.addEventListener('keydown', onKey);

  function close() {
    window.removeEventListener('keydown', onKey);
    panel.remove();
    onClose?.();
  }

  const body = panel.querySelector('#cr-lb-body');

  // Name entry lives here because this is where a player first sees the
  // board and realises they're an anonymous "Degen" on it.
  const nameInput = panel.querySelector('#cr-lb-name');
  const nameNote = panel.querySelector('#cr-lb-name-note');
  nameInput.value = getDisplayName();
  panel.querySelector('#cr-lb-save').addEventListener('click', () => {
    const saved = setDisplayName(nameInput.value);
    nameInput.value = saved;
    nameNote.textContent = `Saved — you'll show as "${saved}" after your next cash-out.`;
    nameNote.style.color = '#18ff6e';
  });

  api.getBestRuns('trenches', 25)
    .then(({ entries }) => {
      if (!entries || entries.length === 0) {
        body.innerHTML = `
          <div style="color:#7d7da0; line-height:1.6;">
            No runs banked yet. Cash out once and you're on the board —
            first name up there sets the mark everyone else has to beat.
          </div>`;
        return;
      }

      const rows = entries.map((e, i) => {
        const isYou = e.playerId === playerId;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        return `
          <div style="display:flex; align-items:center; gap:10px; padding:7px 9px; border-radius:7px;
                      ${isYou ? 'background:rgba(24,255,110,.12); border:1px solid rgba(24,255,110,.5);' : ''}
                      margin-bottom:3px;">
            <div style="width:26px; text-align:center; color:${i < 3 ? '#ffe066' : '#6f6f95'}; font-weight:700;">${medal}</div>
            <div style="flex:1; color:${isYou ? '#18ff6e' : '#eef0ff'}; font-weight:${isYou ? '700' : '400'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${escapeHtml(e.displayName || 'Degen')}${isYou ? ' <span style="font-size:10px;opacity:.8;">(you)</span>' : ''}
            </div>
            <div style="color:#ffe066; font-weight:700;">$${Math.round(e.bestRun).toLocaleString()}</div>
          </div>`;
      }).join('');

      // Name the gap to the player directly ahead — a closeable target is
      // far more motivating than an abstract position.
      const meIndex = entries.findIndex((e) => e.playerId === playerId);
      let gapNote = '';
      if (meIndex > 0) {
        const gap = entries[meIndex - 1].bestRun - entries[meIndex].bestRun;
        gapNote = `<div style="margin-top:14px; font-size:12px; color:#ffe066; text-align:center;">
          $${Math.round(gap).toLocaleString()} from passing #${meIndex}. One good run.
        </div>`;
      } else if (meIndex === 0) {
        gapNote = `<div style="margin-top:14px; font-size:12px; color:#18ff6e; text-align:center;">
          You're #1. Everyone else is chasing your number.
        </div>`;
      } else {
        gapNote = `<div style="margin-top:14px; font-size:12px; color:#7d7da0; text-align:center;">
          You're not on the board yet — cash out a run to claim a spot.
        </div>`;
      }

      body.innerHTML = rows + gapNote;
    })
    .catch(() => {
      body.innerHTML = `<div style="color:#ff9aa8;">Couldn't reach the leaderboard. Check your connection and try again.</div>`;
    });

  return close;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
