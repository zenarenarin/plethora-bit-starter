# Plethora Bit — AI Coding Guide

You are helping build a **Plethora bit**: a self-contained interactive experience
that runs inside the Plethora app (a TikTok-style mobile feed).

## What a bit is

A bit is a single JavaScript file that exports one global object: `window.plethoraBit`.
It runs inside a full-screen WebView on Android/iOS with no framework, no bundler
magic. Think of it as a tiny game, animation, story, or educational widget that a
user scrolls past and interacts with for ~20–60 seconds.

---

## The only contract that matters

```js
window.plethoraBit = {
  meta: {
    title: 'Your Bit Title',        // shown in the feed overlay (under 30 chars)
    author: 'YourUsername',         // your handle
    description: 'One line pitch.', // shown under the title
    tags: ['game'],                 // pick from: game, design, stories, education, creative
    permissions: [],                // add 'camera' or 'microphone' only if actually needed
  },

  // Called every time the bit scrolls into view.
  // ctx — rich context object (see below). No need to manage cleanup manually.
  async init(ctx) {
    // Build your UI here using ctx helpers.
    ctx.platform.ready(); // REQUIRED — call at the end of init
  },

  // Optional lifecycle hooks
  pause(ctx)  {},  // bit backgrounded — stop audio, heavy processing
  resume(ctx) {},  // bit foregrounded again
};
```

---

## The ctx object

```js
// Size & display
ctx.width        // container CSS width in px
ctx.height       // container CSS height in px
ctx.dpr          // device pixel ratio
ctx.safeArea     // { top, bottom, left, right } — keep controls above safeArea.bottom

// Blessed Canvas — DPR-correct, sized to container, auto-removed on destroy
const canvas = ctx.createCanvas2D();
const g = canvas.getContext('2d');  // already pre-scaled for DPR

// ctx.listen() — addEventListener that auto-removes on destroy
ctx.listen(canvas, 'touchstart', (e) => { ... }, { passive: false });

// ctx.raf() — requestAnimationFrame loop that auto-cancels on destroy + respects pause
ctx.raf((dt) => {
  // dt = milliseconds since last frame
});

// ctx.timeout / ctx.interval — auto-cleared on destroy
ctx.timeout(cb, ms);
ctx.interval(cb, ms);

// Platform events — report meaningful moments to the platform
ctx.platform.ready()                            // end of init — REQUIRED
ctx.platform.start()                            // first real user interaction
ctx.platform.interact({ type: 'tap' })          // each interaction
ctx.platform.setScore(n)                        // current score (games)
ctx.platform.setProgress(0.0–1.0)              // how far through the bit
ctx.platform.complete({ score, result, durationMs })  // natural ending
ctx.platform.fail({ reason })                   // game-over / failure
ctx.platform.haptic('light' | 'medium' | 'heavy')     // phone vibration

// Camera — declare permissions: ['camera'] in meta, then:
const video = await ctx.camera.start({ facing: 'user' }); // or 'environment'
// video is a ready-to-draw HTMLVideoElement (auto-cleaned on destroy)
ctx.raf(() => {
  g.drawImage(video, 0, 0, W, H);
});

ctx.camera.stop();                  // release stream + remove video element
ctx.camera.pause();                 // freeze frame (stream stays alive)
ctx.camera.resume();                // resume playback after pause
const video2 = await ctx.camera.flip();  // toggle front↔back, returns new video element
const snap = ctx.camera.snapshot(); // returns Canvas with current frame (or null)
ctx.camera.facing                   // 'user' | 'environment' — current active camera
ctx.camera.ready                    // boolean — video frame is available to draw
ctx.camera.width                    // native stream width in px (0 before start)
ctx.camera.height                   // native stream height in px (0 before start)
ctx.camera.zoom(1.5);               // zoom level (1.0 = no zoom; silently ignored if unsupported)
// The video element is inserted at opacity:0.001 so Android can decode frames for drawImage().
// To show the raw feed directly (no canvas):
video.style.opacity = '1';
// To hide it again:
video.style.opacity = '0.001';

// Microphone — declare permissions: ['microphone'] in meta, then:
const mic = await ctx.microphone.start({ fftSize: 2048, smoothing: 0 });
const timeBuf = mic.getTimeDomainData();  // Float32Array — time domain (pitch detection)
const freqBuf = mic.getFrequencyData();   // Uint8Array  — frequency bins (spectrum)
mic.sampleRate   // AudioContext sample rate (e.g. 44100)
mic.fftSize      // get/set — must be power of 2
mic.smoothing    // get/set — 0.0–1.0 smoothing constant
mic.analyser     // raw AnalyserNode for advanced use
ctx.microphone.stop();  // release stream early (auto-called on destroy)

// Audio — play sounds from URLs (no permissions needed)
const sfx = ctx.audio.play('https://…/tap.mp3');        // one-shot
const bgm = ctx.audio.loop('https://…/theme.mp3', { volume: 0.4 });  // looping
sfx.pause();   sfx.resume();   sfx.stop();  // per-sound control
sfx.volume = 0.8;              // 0.0–1.0
sfx.paused;                    // boolean
ctx.audio.stopAll();           // kill everything at once
// All sounds auto-stop when the bit scrolls away.

// Fetch — auto-aborts when the bit scrolls away (no leaked requests)
const res = await ctx.fetch('https://api.example.com/data');
const json = await res.json();
// Supports all standard fetch options: method, headers, body, etc.
// Silently swallows AbortError on destroy — no try/catch needed.

// Storage — persists across sessions, namespaced per bit
ctx.storage.set('highScore', 42);
ctx.storage.get('highScore');   // 42 (or null if not set)
ctx.storage.remove('highScore');
ctx.storage.clear();            // wipe all keys for this bit

// Script loader — deduped, Promise-based
await ctx.loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
// THREE is now available globally

// Motion — device tilt and acceleration
await ctx.motion.start();       // call on first user gesture (iOS 13+ needs permission)
ctx.raf(() => {
  ctx.motion.tilt.x   // front-back tilt, degrees  (-180..180)
  ctx.motion.tilt.y   // left-right tilt, degrees   (-90..90)
  ctx.motion.accel.x  // m/s² x-axis
});

// Assets — only if the bit was uploaded as a ZIP with an assets/ folder
const img  = await ctx.assets.image('player.png');
const sfx  = await ctx.assets.audio('tap.mp3');
const data = await ctx.assets.json('level.json');
const url  = ctx.assets.url('bg.webp');
```

No `destroy()` needed — all ctx helpers auto-cleanup when the bit scrolls away.

---

## Execution environment

| Feature | Detail |
|---|---|
| Container size | 100% viewport width × 100% viewport height |
| Background | `#000` by default |
| DOM APIs | Full access — canvas, SVG, Web Audio, Touch Events |
| External URLs | Allowed — fetch, CDN scripts, images all work |
| ES version | ES6+ |
| Frameworks | None — vanilla JS only |
| `window.plethoraBit` | Must be assigned at the **top level**, not inside a function |

---

## Canvas bit skeleton

```js
window.plethoraBit = {
  meta: { title: '…', author: '…', description: '…', tags: ['game'], permissions: [] },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ctx.platform.start();
      ctx.platform.haptic('light');
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      // handle tap
    }, { passive: false });

    ctx.raf((dt) => {
      g.clearRect(0, 0, W, H);
      // draw here
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
```

---

## Touch guidance

### Use `changedTouches[0]`, not `touches[0]`
```js
// WRONG — touches[0] gives the oldest active finger
canvas.addEventListener('touchstart', e => hit(e.touches[0].clientX));

// RIGHT — changedTouches[0] is the finger that just touched down
ctx.listen(canvas, 'touchstart', e => hit(e.changedTouches[0].clientX));
```

### Prevent WebView scroll during touch interaction
```js
ctx.listen(canvas, 'touchstart', (e) => {
  e.preventDefault();
  // your logic
}, { passive: false });

ctx.listen(canvas, 'touchmove', (e) => {
  e.preventDefault();
}, { passive: false });
```

### Bottom safe zone
Keep all interactive controls above `ctx.safeArea.bottom` — the bottom strip is
reserved for the swipe-up gesture that advances to the next card.

---

## CDN / External Libraries

```js
// Preferred — ctx.loadScript() is deduped and Promise-based
await ctx.loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
// THREE is now available globally
```

## Web Audio (advanced)

`ctx.audio` covers playback and `ctx.microphone` covers analysis. If you need raw Web Audio (custom effects, synthesis):
```js
async init(ctx) {
  const audioCtx = new AudioContext();
  ctx.listen(canvas, 'touchstart', () => audioCtx.resume(), { once: true });
  ctx.onDestroy(() => audioCtx.close());
}
```

---

## ZIP upload (bits with assets)

If your bit uses local images, audio, or data files, structure it as a ZIP:

```
my-bit.zip
├── main.js          ← your bit source (window.plethoraBit = {...})
├── manifest.json    ← { "entry": "main.js", "title": "...", "tags": [...] }
└── assets/
    ├── player.png
    ├── tap.mp3
    └── level.json
```

Then in your bit:
```js
const img  = await ctx.assets.image('player.png');
const sfx  = await ctx.assets.audio('tap.mp3');
const data = await ctx.assets.json('level.json');
```

Upload:
```bash
plethora upload my-bit.zip --title "My Bit"
```

---

## Build and upload

```bash
npm install          # first time only
npm run build        # outputs dist/bit.js (single JS file bits)
```

**CLI upload:**
```bash
# First time:
npm install
npm link             # makes `plethora` available globally
plethora login       # enter email + password once
```

```bash
# Each upload
npm run build
plethora upload dist/bit.js --title "My Bit" --tags game

# ZIP bits with assets:
plethora upload my-bit.zip --title "My Bit"

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

- [ ] `window.plethoraBit` assigned at top level (not inside `init`)
- [ ] `meta.title`, `meta.author`, `meta.description`, `meta.tags` all filled in
- [ ] `ctx.platform.ready()` called at end of `init`
- [ ] `ctx.platform.start()` called on first user touch
- [ ] Using `ctx.listen()` — not raw `addEventListener`
- [ ] Using `ctx.raf()` — not raw `requestAnimationFrame`
- [ ] No `destroy()` needed — ctx cleans up automatically
- [ ] CDN scripts loaded via `ctx.loadScript(url)` or dynamic `<script>` injection (not ES `import`)
- [ ] `npm run build` completes without errors
- [ ] Bit makes sense without sound (some users have silent mode on)

---

## Best practices maintenance

A living best-practices file lives at `BIT_BEST_PRACTICES.md` in this repo.

**When to update it:** Any time you notice a non-obvious pattern, gotcha, or technique
while writing or reviewing bit code — add it immediately. Do not wait to be asked.

**How to update it:** Append to the relevant section (or add a new section). Keep
entries concise — one paragraph or a short code snippet max.
