# Applying i4–i9 — step-by-step for VS Code + GitHub Desktop

Written for the GUI workflow. The only terminal you need is the one built
into VS Code, and only for `npm` commands.

**Why the order matters:** `i4` renames a field that `i5` and `i9` then use,
and `i9` needs a function that `i6` introduces. Do the phases in order. Each
one ends with a check you can see on screen — if a check fails, fix it there
rather than stacking the next patch on top.

Instead of line numbers (which shift as you edit) each step gives you a
**search string**. In VS Code, `Ctrl+F` (`Cmd+F` on Mac) and paste it.

---

## 0. Setup — do this once

### 0.1 Open the repo in VS Code

1. VS Code → **File → Open Folder…**
2. Pick your `candle-rider` folder → **Open**.
3. The file tree appears on the left. If you don't see it: **View → Explorer**
   (`Ctrl+Shift+E`).

### 0.2 Make a branch in GitHub Desktop

1. Open GitHub Desktop. Confirm the top-left **Current Repository** says
   `candle-rider`. If not, click it and pick the repo.
2. Click **Current Branch** (top middle) → make sure you're on `main`.
3. Click **Fetch origin** (top right), then **Pull origin** if it appears.
4. Click **Current Branch → New Branch**.
5. Name it: `chore/trenches-audit-i4-i9`
6. Click **Create Branch**. Top middle should now show your new branch name.

> Everything from here happens on this branch. `main` stays untouched, so
> nothing you do below can break your live site until you choose to merge.

### 0.3 Copy the patch files in (optional but handy)

Unzip the download and drag the `audit-fixes` folder into `docs/` in VS
Code's file tree. Then you can read each patch side-by-side with the code
you're editing (right-click a file tab → **Split Right**).

### 0.4 Install and start the dev servers

1. In VS Code: **Terminal → New Terminal** (`Ctrl+` ` — the backtick key).
2. Type and press Enter:

   ```
   node -v
   ```

   You want v20 or higher (the project's Docker setup uses Node 22). If this
   errors, install Node from nodejs.org first.
3. Install dependencies:

   ```
   npm install
   ```

   This takes a minute or two. It's normal for it to print warnings.
4. Start the API. In the same terminal:

   ```
   npm run dev:server
   ```

   Wait for `[candle-rider-api] listening on http://0.0.0.0:3001`.
   **Leave this pane running** — don't close it or press Ctrl+C.
5. Split the terminal so you can watch both servers at once:
   press `Ctrl+Shift+5` (`Cmd+\` on Mac), or right-click inside the terminal
   → **Split Terminal**. A second pane opens beside the first.
6. In the **new right-hand pane**:

   ```
   npm run dev:client
   ```

   Wait for Vite to print a `Local: http://localhost:5173/` line.

> You now have the API on the left and Vite on the right. Click a pane to
> type in it. Both must stay running the whole session — if the game stops
> loading, glance here first: a crashed server prints a red error, and
> Vite prints a fresh line every time it hot-reloads a file you saved.
>
> Handy while you work: `Ctrl+Shift+5` again adds a third pane for one-off
> commands like `npm run build:client`, so you never have to stop a server.
> `Ctrl+\`` hides and shows the whole panel to reclaim screen space.
6. Open `http://localhost:5173` in Chrome.
7. Press **F12** to open DevTools. Click the **Console** tab and leave it
   open — every check below assumes you'd notice a red error appearing.

### 0.5 The reset snippet (you'll use this a lot)

Several patches change coin data and onboarding, which the game remembers in
your browser. To get a clean first-run state: in DevTools **Console**, paste
this and press Enter:

```js
localStorage.removeItem('candlerider:trenchesLastCoin');
localStorage.removeItem('candlerider:hasSeenOnboarding');
sessionStorage.removeItem('candlerider:hasEnteredTrenchesSession');
location.reload();
```

Keep it somewhere you can re-paste — you'll need it before most playtests.

---

## Phase 1 — i4: rename `cap` to `rampCap`

A pure rename with no gameplay change. **It has to be finished completely
before you test** — a half-done rename makes the game read `undefined` for
the ramp and the speed becomes `NaN` (the game will look frozen or fling you
into the void).

### 1.1 Rename the field on every coin

1. In the file tree, open
   `client/src/scenes/paths/trenchesCoins.js`
   (Explorer → `client` → `src` → `scenes` → `paths`).
2. Press `Ctrl+H` (`Cmd+H`) to open **Find & Replace** in this file.
3. In the **Find** box type: `cap:`
4. In the **Replace** box type: `rampCap:`
5. Click **Replace All** (the icon with two arrows, or `Ctrl+Alt+Enter`).
   VS Code will tell you how many it changed — at this point it should be
   **16**.

### 1.2 Add the helper and the comment

Open `docs/audit-fixes/i4.md` and copy in:

- the `base / ramp / rampCap` explanation comment near the top of the file
- the `maxSpeed(coin)` export at the bottom

Paste them into `trenchesCoins.js` where the diff shows.

### 1.3 Fix the one place that reads it

1. Open `client/src/scenes/paths/TrenchesScene.js`.
2. `Ctrl+F` and search for: `difficulty.cap`
3. You should get exactly **one** hit. Change that line to:

   ```js
   speed = difficulty.base + Math.min(elapsed * difficulty.ramp, difficulty.rampCap);
   ```

4. Add the comment above it from `i4.md` (it explains that the ramp is
   capped, not the speed — the whole point of the patch).

### 1.4 Prove you didn't miss any

1. Press `Ctrl+Shift+F` (`Cmd+Shift+F`) — **Search across all files**.
2. Click the **`.*` icon** on the right of the search box to turn on regex
   (tooltip: "Use Regular Expression").
3. Search for: `\.cap\b`
4. Look at the results:
   - Hits in `client/src` → **you missed one.** Go fix it.
   - Hits in `README.md` or `docs/FEATURES.md` → expected. `i4.md` asks you
     to update that wording too; do it now while you're here.

### 1.5 Check it works

1. In Chrome, run the reset snippet (0.5).
2. Click **ENTER THE TRENCHES**, dismiss the intro, click any coin.
3. Look at the debug readout in the **top-right corner** of the game.
4. Find the `speed:` value. It must be a **number** that starts near the
   coin's base and climbs as the run goes on.
5. If it says `NaN` — a coin definition still says `cap:`. Redo 1.1.

### 1.6 Commit

1. Switch to GitHub Desktop. The **Changes** tab lists your edited files.
2. Click a file to see the diff and sanity-check it.
3. Bottom left, in the **Summary** box, type:

   ```
   i4: rename coin cap -> rampCap; cap bounds the ramp, not speed
   ```

4. Click **Commit to chore/trenches-audit-i4-i9**.

> **If a phase goes wrong:** in GitHub Desktop's **Changes** tab,
> right-click the file → **Discard Changes** to throw away uncommitted
> edits. If you already committed, go to the **History** tab, right-click
> the commit → **Revert Changes**.

---

## Phase 2 — i5: trim the roster to 5 coins

### 2.1 Replace the coin list

1. Open `client/src/scenes/paths/trenchesCoins.js`.
2. Select the entire `TRENCHES_COINS` array — from `export const
   TRENCHES_COINS = [` down to and including the closing `];`.
   (Click at the start, then shift-click at the end.)
3. Delete it and paste the 5-entry version from `i5.md` in its place.
   It already uses `rampCap`, which is why Phase 1 came first.

### 2.2 Soften the fallback (recommended)

1. `Ctrl+F` for: `TRENCHES_COINS[1]`
2. That's the coin a returning player gets if their saved coin no longer
   exists. With the new list, index 1 is `$VOLT` — the second-hardest coin.
   Change it to return the `stable` entry instead:

   ```js
   export function getCoinById(id) {
     return TRENCHES_COINS.find((c) => c.id === id) || TRENCHES_COINS[0];
   }
   ```

### 2.3 Check it works

1. Reset snippet, then enter the Trenches.
2. **Count the coins on the arc — there should be 5.**
3. In DevTools, click the **Network** tab.
4. In its filter box type: `assets/coins`
5. Reload the page and re-enter the coin room.
6. Every row's **Status** must be **200**. A **404** means a removed coin is
   still being referenced somewhere.

### 2.4 Commit

Summary:

```
i5: trim roster to 5 coins; drop art-less entries, restore $LEGEND as fastest
```

---

## Phase 3 — i7: stop rebuilding innerHTML

Two files. The HUD part is a copy-paste diff; the War Room part needs a
small refactor you write yourself.

### 3.1 The HUD (copy-paste)

1. Open `client/src/ui/HUD.js`.
2. Apply the diffs from `i7.md` in order:
   - replace the `render(state)` function with the static `el.innerHTML`
     block plus the `fields` / `shown` / `paint(state)` code
   - add the `queued` / `latest` / `schedule(state)` block
   - change the subscription from `eventBus.on('state:changed', render)` to
     `...('state:changed', schedule)`
   - add `cancelAnimationFrame` to the returned teardown function

The rule to keep in mind: **build the markup once, then only ever write
`textContent`.**

### 3.2 The War Room (small refactor)

1. Open `client/src/scenes/WarRoomScene.js`.
2. Find `function render()`. It currently starts with `el.innerHTML = '';`
   and rebuilds all five cards, `<img>` tags included.
3. Split it in two:
   - **`buildCards()`** — the existing card-building code, called **once**.
     While building each card, save a reference to its mastery `<div>`:
     `masteryFields[path.id] = <that div>`.
   - **`paintMastery()`** — loops the paths and sets
     `masteryFields[path.id].textContent = \`Mastery Lv. ${...}\``.
4. Call `buildCards()` once, then subscribe `paintMastery` to
   `state:changed` instead of `render`.
5. **Do not recreate the `<img>` elements.** That's the whole point — those
   five hero images are 18.8MB and were being re-decoded every update.

### 3.3 Keep the HUD's teardown

1. Open `client/src/main.js`.
2. `Ctrl+F` for: `mountHUD(container, gameState);`
3. Change it to:

   ```js
   const teardownHUD = mountHUD(container, gameState);
   ```

### 3.4 Check it works

1. Reload and start a run.
2. The HUD's **Bag** figure must still tick up smoothly. (If it froze, the
   `schedule` wiring is wrong.)
3. In DevTools click **Elements**, find `<div id="hud">`, and expand it.
4. Watch it during play: individual numbers should change. The whole block
   should **not** flash/collapse-and-reopen every frame — that flashing is
   what you just removed.
5. Go back to the hub, expand a card in Elements, and trigger a state change
   (cash out a run). The `<img>` element should stay put, not be replaced.

### 3.5 Commit

```
i7: build HUD/War Room once, coalesce paints to one per frame
```

### 3.6 Stop and play for five minutes

Phases 1–3 should be **completely invisible** to a player. If the game looks
or feels different, something was applied wrong. This is the natural place
to push and open a PR for the safe work if you want it reviewed separately
(see **Merging** below).

---

## Phase 4 — i6: fix the landing-window inversion

This one **changes how the game plays**. Both halves must land together —
either one alone makes things worse.

### 4.1 Constant-time landing grace

1. Open `client/src/scenes/paths/TrenchesScene.js`.
2. `Ctrl+F` for: `const FLIP_WARNING_MS`
3. On a new line near it, add:

   ```js
   const LANDING_GRACE_SECONDS = 0.10; // ~100ms of timing slack at any speed
   ```

4. `Ctrl+F` for: `speed * 0.55`
5. Replace that expression with `speed * LANDING_GRACE_SECONDS`, and paste
   the explanatory comment from `i6.md` above the line.

### 4.2 Write `spawnRow` (you author this one)

`i6.md` describes this rather than giving you a diff, because it depends on
how you want voids to feel.

1. `Ctrl+F` for: `function spawnCandle(`
2. **Below** that whole function, add a new one:

   ```js
   // One candle per LANE per step, so the decision is which colour to ride
   // rather than whether a platform exists in your lane at all.
   function spawnRow(z, holeChance = 0) {
     const kinds = [];
     for (let lane = 0; lane < 3; lane++) {
       kinds.push(Math.random() < holeChance ? 'hole' : null);
     }
     // never leave all three empty
     if (kinds.every((k) => k === 'hole')) kinds[1] = null;
     const spawned = [];
     kinds.forEach((k, lane) => {
       if (k === 'hole') return;
       spawned.push(spawnCandle(z, lane));
     });
     // guarantee at least one green in the row
     if (spawned.length && !spawned.some((c) => c.color === 'green')) {
       const c = spawned[Math.floor(Math.random() * spawned.length)];
       c.color = 'green';
       c.mesh.material.color.set(GREEN);
       c.flipAt = performance.now() + 1800 + Math.random() * 2600;
     }
     return spawned;
   }
   ```

   `spawnCandle` already handles the anti-streak colour rule, so calling it
   per lane keeps that behaviour.

### 4.3 Use it in both spawn loops

1. `Ctrl+F` for: `spawnCandle(cursorZ)` — there are **two** places (the
   initial 24-candle seed loop, and the respawn during play).
2. Change **both** to `spawnRow(cursorZ)`.
3. **Leave the spacing maths alone** — `(3.4 + Math.random() * 1.4) *
   WORLD_SCALE` stays exactly as-is. Fixed spacing is what makes fast coins
   hard; reachability now comes from having a platform in every lane.

### 4.4 Check it works — this is the important test

Play each coin for about 30 seconds:

| Coin | Before the patch | Expected after |
|---|---|---|
| `$STABLE` | you fall into the void with nothing you could have done | you never fall by accident |
| `$APEMAX` | you literally cannot fall | falling is possible again |

- `$STABLE` still dying with nothing reachable → **4.2/4.3 didn't take.**
- `$APEMAX` still un-fallable → **4.1 didn't take.**

### 4.5 Commit

```
i6: constant-time landing grace + per-lane rows; fixes inverted difficulty
```

---

## Phase 5 — i9: per-coin profiles

### 5.1 Add the fields

Open `trenchesCoins.js` and add `red`, `fuseMul`, `payMul` and `holeChance`
to each of the 5 entries, using the values in `i9.md`.

### 5.2 Wire up the four read sites

All in `TrenchesScene.js`. Search for each string:

| Search for | Change |
|---|---|
| `RED_SPAWN_CHANCE ? 'red'` | use `difficulty.red ?? RED_SPAWN_CHANCE` |
| `let fuseMin = 1800` | multiply `fuseMin` and `fuseRange` by `difficulty.fuseMul ?? 1` **after** the pump/fud event lines |
| `gameState.addBag(gain)` | `gameState.addBag(gain * (difficulty.payMul ?? 1))` |
| `spawnRow(cursorZ)` | `spawnRow(cursorZ, difficulty.holeChance ?? 0)` (both places) |

### 5.3 The step everyone skips

The 24-candle seed loop runs when the scene mounts — **before** a coin is
chosen — so those candles use the previously-picked coin's red rate. Without
this fix the opening seconds of every run use the wrong profile.

1. `Ctrl+F` for: `red-born candles have no fuse to refresh`
2. That's inside `apeIntoCoin`'s `candles.forEach(...)`. Add the colour
   re-roll from `i9.md` at the top of that callback.
3. Make sure `startCandle` is **excluded** — it must stay green, it's the
   platform you spawn on.

### 5.4 Show the axis to the player

1. `Ctrl+F` for: `coinLabel.textContent`
2. It currently shows `symbol — name`. Add the coin's `axis` — that's what
   the player is now choosing between. Without this the profiles exist in
   code and nowhere the player can see them.

### 5.5 Check it works

- `$VOLT` should feel **harder than `$APEMAX` for the first ~20 seconds**,
  despite being much slower. That's the reading axis working.
- `$MOON` should be hardest in its **opening** seconds, not its last.
- If `$MOON`'s voids feel like the whole game, change its `holeChance` from
  `0.22` to `0.15` and try again.

### 5.6 Commit

```
i9: per-coin profiles (red rate, fuse, payout, voids)
```

---

## Phase 6 — i8: assets

Not a code patch — real image work. Nothing depends on it, so it's last.

1. Re-encode everything in `client/public/assets/` at display resolution as
   WebP (targets in `i8.md`). Use Squoosh (squoosh.app) or ImageMagick.
   Keep the big PNG originals **outside** `client/public/` — they're source
   art, not something users should download.
2. Cut out `bosses/soft-rug-titan.png`. It has **no transparency**, so
   anything that billboards it in 3D draws a visible dark rectangle.
3. Open `client/public/sw.js` and apply the cache changes from `i8.md`:
   split shell and art into separate caches, cap the art cache, and
   **change `CACHE_NAME`** in the same commit. Cache-first never
   re-checks the network, so without that bump every returning player keeps
   the old 46MB files forever.

### Check it works

1. DevTools → **Network** tab. Tick **Disable cache**.
2. Hard-reload (`Ctrl+Shift+R`) and let the hub load.
3. Look at the **Transferred** column total for the hero images — should be
   a few hundred KB, not 18.8MB.
4. DevTools → **Application** tab → **Cache Storage** (left sidebar).
   Confirm the new cache names appear, and that the art cache stops growing
   once it hits its cap.

### Commit

```
i8: re-encode art at display resolution; bound and version SW caches
```

---

## Merging

### Build first

In a spare terminal pane (`Ctrl+Shift+5` to split off a new one — leave the
servers running):

```
npm run build:client
```

**This must finish without errors.** If it fails, the PR will fail too —
read the error, it names the file and line.

### Push and open the PR

1. GitHub Desktop → **Push origin** (top right).
2. A **Create Pull Request** button appears — click it (or **Branch →
   Create Pull Request**). This opens github.com in your browser.
3. Title: `Trenches audit fixes i4–i9`
4. In the description, paste the patch list so a reviewer knows the order:

   ```
   i4 rename cap -> rampCap (no behaviour change)
   i5 trim roster to 5 coins
   i7 stop innerHTML rebuilds in HUD / War Room
   i6 fix inverted landing window  <-- gameplay change
   i9 per-coin profiles            <-- gameplay change
   i8 asset re-encode + SW caches
   ```

5. **Create pull request**, then **Merge pull request** when you're happy.

### Splitting it up (optional, and what I'd do)

Phases 1–3 are invisible to players; 4–6 change how the game feels. To keep
review easy, push Phases 1–3 as one PR, merge it, then create a second
branch off updated `main` for Phases 4–6. In GitHub Desktop: **Current
Branch → main → Pull origin → New Branch**.

## Deploying

Once merged to `main`, on the server (per `README.md`):

```
/opt/candle-rider/deploy/scripts/deploy.sh
systemctl status candle-rider-api
journalctl -u candle-rider-api -f
```

After deploying `i8`, **load the site on a real phone** before calling it
done. That's the case the patch exists for, and the only place the service
worker's caching behaviour is fully live.
