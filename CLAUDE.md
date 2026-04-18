# Plethora Bit — AI Coding Guide

You are helping build a **Plethora bit**: a self-contained interactive experience
that runs inside the Plethora app (a TikTok-style mobile feed).

## What a bit is

A bit is a single JavaScript file that exports one global object: `window.scrollerApp`.
It runs inside a full-screen WebView on Android/iOS with no framework, no bundler
magic, and no network access. Think of it as a tiny game, animation, story, or
educational widget that a user scrolls past and interacts with for ~20–60 seconds.

---

## The only contract that matters

```js
window.scrollerApp = {
  meta: {
    title: 'Your Bit Title',        // shown in the feed overlay
    author: 'YourUsername',         // your handle
    description: 'One line pitch.', // shown under the title
    tags: ['game'],                 // pick from: game, design, stories, education, creative
  },

  // Called every time the bit scrolls into view.
  // container: a full-screen <div> you own — completely empty each call.
  init(container) {
    // Build your UI here. Attach event listeners. Start animation loops.
  },

  // Called when the bit scrolls off screen.
  // MUST cancel all timers, animation frames, and event listeners.
  // Failure to clean up causes audio/animation bleed into the next card.
  destroy() {
  },
};
```

---

## Execution environment

| Feature | Detail |
|---|---|
| Container size | 100 % viewport width × 100 % viewport height |
| Background | `#000` by default |
| DOM APIs | Full access — canvas, SVG, Web Audio, Pointer Events, Touch Events |
| External URLs | **Not allowed** — no fetch, no CDN scripts, no images from the web |
| ES version | ES6+ (arrow functions, classes, template literals — all fine) |
| Frameworks | None — vanilla JS only |
| `window.scrollerApp` | Must be assigned at the **top level**, not inside a function |

---

## Messages the shell sends into your bit

The host app may send these strings via `window.postMessage`:

| Message | When |
|---|---|
| `init` | Bit scrolls into view (after first load) |
| `destroy` | Bit scrolls out of view |
| `restart` | User taps the ↺ restart button (games only) |

You do **not** need to handle these yourself — the shell calls `init(container)` and
`destroy()` for you. Only handle `restart` if you want custom reset logic beyond
a full re-init.

---

## Navigation

The shell intercepts vertical swipes and posts `nav:next` / `nav:prev` to the parent.
Do **not** call `window.parent.postMessage` yourself unless you have a specific reason.
Horizontal swipes and taps are passed through to your bit normally.

---

## Patterns and tips

### Canvas bit skeleton
```js
window.scrollerApp = {
  meta: { title: '…', author: '…', description: '…', tags: ['game'] },

  init(container) {
    const canvas = document.createElement('canvas');
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let raf;

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // draw here
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // store refs for destroy
    this._raf = raf;
    this._canvas = canvas;

    // touch example
    canvas.addEventListener('pointerdown', this._onTap = (e) => {
      const x = e.offsetX, y = e.offsetY;
      // handle tap
    });
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    this._canvas?.removeEventListener('pointerdown', this._onTap);
    this._canvas = null;
  },
};
```

### Touch on mobile: use `changedTouches`, not `touches`
```js
// WRONG — touches[0] gives the oldest finger, not the newly landed one
canvas.addEventListener('touchstart', e => hit(e.touches[0].clientX));

// RIGHT — changedTouches[0] is the finger that just touched down
canvas.addEventListener('touchstart', e => hit(e.changedTouches[0].clientX));
```

### Prevent double-fire (touchstart + click)
```js
let _lt = 0;
canvas.addEventListener('touchstart', e => { _lt = Date.now(); onTap(e.changedTouches[0]); }, { passive: true });
canvas.addEventListener('click',      e => { if (Date.now() - _lt < 500) return; onTap(e); });
```

### Web Audio — must be resumed on first user gesture
```js
init(container) {
  this._ctx = new AudioContext();
  container.addEventListener('pointerdown', () => this._ctx.resume(), { once: true });
},
destroy() {
  this._ctx?.close();
  this._ctx = null;
},
```

### Timed game pattern (20-second countdown)
```js
let startTime, raf;
const DURATION = 20;

const loop = (now) => {
  const elapsed = (now - startTime) / 1000;
  const left = Math.max(0, DURATION - elapsed);
  if (left === 0) { endGame(); return; }
  // draw frame
  raf = requestAnimationFrame(loop);
};

startTime = performance.now();
raf = requestAnimationFrame(loop);
```

---

## What makes a good bit

- **One clear mechanic** — a user should understand what to do in under 3 seconds.
- **Immediate feedback** — every tap/swipe should produce a visible/audio response instantly.
- **Graceful loop** — when time runs out or the game ends, show a score/result and let the user restart.
- **No text walls** — if instructions are needed, show them as a short overlay that disappears on first tap.
- **Dark background** — bits look best on `#111` or `#000`; bright backgrounds feel jarring in the dark feed.

---

## Build and upload

```bash
npm install          # first time only
npm run build        # outputs dist/bit.js
```

**CLI upload (recommended):**
```bash
# First time: from inside plethora-bit-starter
npm install
npm link             # makes `plethora` available globally

plethora login       # enter email + password once
```

```bash
# Each time you want to upload
npm run build
plethora upload dist/bit.js --title "My Bit" --tags game

# The bit appears as a DRAFT in your Plethora profile.
# Tap it to preview. Tap Publish to go live, or:
plethora publish <bit-id>
```

```bash
plethora list        # see all your bits + IDs
plethora logout      # clear saved credentials
```

---

## Quick checklist before uploading

- [ ] `window.scrollerApp` assigned at top level (not inside `init`)
- [ ] `meta.title`, `meta.author`, `meta.description`, `meta.tags` all filled in
- [ ] `destroy()` cancels every `requestAnimationFrame` and `setInterval`
- [ ] No `fetch`, no external script tags, no CDN URLs
- [ ] `npm run build` completes without errors
- [ ] The bit makes sense without sound (some users have silent mode on)
