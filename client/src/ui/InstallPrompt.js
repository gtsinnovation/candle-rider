// client/src/ui/InstallPrompt.js
//
// "Enforce PWA on mobile" in practice means: actively nudge mobile visitors
// to install rather than passively waiting for them to discover it. This is
// a dismissible banner, not a hard block — trapping users behind a mandatory
// install screen is hostile UX and would just bounce people. Once dismissed
// it stays quiet for the rest of that browser (localStorage flag).
//
// Two different platforms, two different mechanisms:
// - Android Chrome/Edge: fires a real 'beforeinstallprompt' event we can
//   trigger programmatically.
// - iOS Safari: has NO install API at all. The only way to install a PWA
//   there is the user manually tapping Share -> Add to Home Screen — so we
//   just show instructions telling them to do that.

const DISMISS_KEY = 'candlerider:installPromptDismissed';

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function mountInstallPrompt(container) {
  if (!isMobile() || isStandalone() || localStorage.getItem(DISMISS_KEY)) {
    return () => {}; // nothing to show — desktop, already installed, or previously dismissed
  }

  let deferredPrompt = null; // Android's captured beforeinstallprompt event

  const banner = document.createElement('div');
  banner.style.cssText = `
    position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 50;
    background: linear-gradient(180deg, #141428, #0a0a18);
    border: 1px solid #3a3a6f; border-radius: 10px; padding: 12px 14px;
    display: none; align-items: center; gap: 10px;
    font-family: system-ui, sans-serif; color: #eef0ff;
    box-shadow: 0 8px 24px rgba(0,0,0,.5);
  `;
  banner.innerHTML = `
    <img src="/icon-192.png" style="width:36px;height:36px;border-radius:8px;flex-shrink:0;" />
    <div style="flex:1; font-size:12px; line-height:1.4;">
      <div style="font-weight:700; margin-bottom:2px;">Install Candle Rider</div>
      <div id="install-prompt-text" style="color:#9a9ac0;">Add to your home screen for the full-screen app experience.</div>
    </div>
    <button id="install-prompt-action" style="background:#7dffcf;color:#05100c;border:none;padding:8px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Install</button>
    <button id="install-prompt-dismiss" style="background:transparent;color:#6f6f95;border:none;font-size:18px;cursor:pointer;padding:0 4px;">×</button>
  `;
  container.appendChild(banner);

  function dismiss() {
    banner.style.display = 'none';
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* non-fatal */ }
  }
  banner.querySelector('#install-prompt-dismiss').addEventListener('click', dismiss);

  if (isIOS()) {
    // No programmatic install on iOS — show manual instructions instead of
    // an "Install" button that would have nothing to do.
    banner.querySelector('#install-prompt-text').textContent =
      'Tap the Share button, then "Add to Home Screen" for the full-screen app experience.';
    banner.querySelector('#install-prompt-action').style.display = 'none';
    banner.style.display = 'flex';
  } else {
    // Android/Chrome: wait for the real install event before showing
    // anything — if the browser never fires it (already installed,
    // unsupported browser, etc.), the banner simply never appears.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      banner.style.display = 'flex';
    });
    banner.querySelector('#install-prompt-action').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice; // resolves once the user accepts/dismisses the native dialog
      deferredPrompt = null;
      dismiss();
    });
  }

  return () => banner.remove();
}
