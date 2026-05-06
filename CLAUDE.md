# Plethora Bit - AI Coding Guide

You are helping build a Plethora bit: a self-contained interactive experience that runs inside the Plethora mobile app feed.

## The Contract

A bit is either:

- a single JavaScript file that assigns `window.plethoraBit`, or
- a ZIP package with `main.js`, `manifest.json`, and optional `assets/`.

The contract is in `bitContractV1.json`. The important production rules:

- Max package size is 2 MB.
- Permissions are hard-enforced before bit source runs.
- Network access is blocked unless `networkFetch` is declared, and even then only approved CDN hosts work.
- Surfaces are runtime-owned: use `ctx.createRoot()`, `ctx.createCanvas2D()`, or `ctx.createCanvas()`.
- Raw JS uploads cannot declare assets.
- ZIP assets are described by `path`, `mime`, `size`, `sha256`, and optional `role`.
- Published packages are immutable by source + manifest + assets + runtime hash.

Run:

```bash
npm run build
npm run check
```

For ZIP package directories:

```bash
node scripts/check-package.js ./zip-build --write-manifest
```

## Bit Skeleton

```js
window.plethoraBit = {
  meta: {
    title: 'Your Bit Title',
    author: 'YourUsername',
    description: 'One line pitch.',
    tags: ['creative'],
    permissions: [],
  },

  async init(ctx) {
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    ctx.raf((dt) => {
      g.clearRect(0, 0, ctx.width, ctx.height);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
```

## Permissions

Declare exactly what the bit uses.

```js
permissions: ['audio', 'haptics', 'networkFetch']
```

Required mappings:

- `audio`: `AudioContext`, `new Audio()`, `ctx.audio`, `ctx.assets.audio()`
- `camera`: `ctx.camera`, video `getUserMedia`
- `haptics`: `ctx.platform.haptic()`
- `microphone`: `ctx.microphone`, audio `getUserMedia`
- `motion`: `ctx.motion`, device motion/orientation events
- `networkFetch`: `ctx.fetch`, `fetch`, `ctx.loadScript`, external script/image/media URLs
- `storage`: `ctx.storage`, `localStorage`, `sessionStorage`

If a bit uses `ctx.platform.haptic('light')`, the meta must include `haptics`. If it uses `ctx.loadScript(...)`, the meta must include `networkFetch`.

## The `ctx` Object

```js
ctx.width
ctx.height
ctx.dpr
ctx.safeArea
ctx.container

const root = ctx.createRoot(); // DOM UI root, auto-removed
const canvas = ctx.createCanvas2D();
const g = canvas.getContext('2d');

ctx.listen(canvas, 'touchstart', handler, { passive: false });
ctx.raf((dt) => {});
ctx.timeout(cb, ms);
ctx.interval(cb, ms);
ctx.onDestroy(cb);
```

## Surface Ownership

Do not create canvases manually or mount UI into global document nodes.

Use:

```js
const root = ctx.createRoot();
const canvas2d = ctx.createCanvas2D();
const webglCanvas = ctx.createCanvas({ touchAction: 'none' });
```

Avoid:

```js
document.createElement('canvas');
document.body.appendChild(node);
document.documentElement.appendChild(node);
requestAnimationFrame(loop);
window.addEventListener('resize', onResize);
document.addEventListener('touchstart', onTouch);
```

Use `ctx.raf()` for animation and `ctx.listen()` for listeners. Use `ctx.loadScript()` for CDN libraries.

Platform events:

```js
ctx.platform.ready();
ctx.platform.start();
ctx.platform.interact({ type: 'tap' });
ctx.platform.setScore(score);
ctx.platform.setProgress(0.5);
ctx.platform.complete({ score, durationMs });
ctx.platform.fail({ reason: 'hit' });
ctx.platform.haptic('light'); // requires haptics
```

## Camera

Declare `permissions: ['camera']`.

```js
const video = await ctx.camera.start({ facing: 'user' });
ctx.raf(() => {
  g.drawImage(video, 0, 0, ctx.width, ctx.height);
});
```

## Microphone

Declare `permissions: ['microphone']`.

```js
const mic = await ctx.microphone.start({ fftSize: 2048, smoothing: 0 });
const freq = mic.getFrequencyData();
ctx.microphone.stop();
```

## Audio

Declare `permissions: ['audio']`.

```js
let audioCtx;
ctx.listen(canvas, 'touchstart', () => {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    ctx.onDestroy(() => audioCtx.close());
  }
  audioCtx.resume();
}, { once: true });
```

## Network And Libraries

Declare `permissions: ['networkFetch']`.

Only approved CDN hosts from `bitContractV1.json` are allowed. Prefer:

```js
await ctx.loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
```

Do not call arbitrary APIs from a bit. Package data as an asset, or host static files on an approved CDN.

For CDN libraries that load secondary files, keep those secondary files on an
approved host too. MediaPipe, PlayCanvas, model loaders, Wasm bundles, workers,
and packed asset loaders often fetch `.wasm`, `.data`, graph, model, or worker
files after the first script has loaded. Use `locateFile` when a library
supports it:

```js
const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
await ctx.loadScript(MP_BASE + '/hands.js');
const hands = new window.Hands({
  locateFile: (file) => MP_BASE + '/' + file,
});
```

Old MediaPipe Solutions bundles can throw during packed asset download progress
inside mobile WebViews. If building a hand-tracking bit, copy the MediaPipe XHR
compatibility pattern from `creative-bits/hand_keypoints.js`.

## Storage

Declare `permissions: ['storage']`.

```js
ctx.storage.set('highScore', 42);
const highScore = ctx.storage.get('highScore');
ctx.storage.remove('highScore');
ctx.storage.clear();
```

## Motion

Declare `permissions: ['motion']`.

```js
await ctx.motion.start();
ctx.raf(() => {
  const x = ctx.motion.tilt.x;
});
```

## ZIP Packages

Package layout:

```text
my-bit/
  main.js
  manifest.json
  assets/
    background.webp
    tap.mp3
```

Manifest:

```json
{
  "schemaVersion": 1,
  "runtime": "plethora-bit@1",
  "entry": "main.js",
  "title": "My Bit",
  "description": "A tiny interactive scene.",
  "tags": ["creative"],
  "permissions": ["audio"],
  "assets": [
    {
      "path": "tap.mp3",
      "mime": "audio/mpeg",
      "size": 12345,
      "sha256": "sha256:...",
      "role": "sfx"
    }
  ]
}
```

Use assets like this:

```js
const img = await ctx.assets.image('background.webp');
const sfx = await ctx.assets.audio('tap.mp3');
const url = ctx.assets.url('background.webp');
```

## Touch Rules

- Use `ctx.listen()`, not raw `addEventListener`.
- Use `changedTouches[0]`, not `touches[0]`.
- Use `{ passive: false }` and `e.preventDefault()` when handling gestures.
- Keep important controls above `ctx.safeArea.bottom`.

```js
ctx.listen(canvas, 'touchstart', (e) => {
  e.preventDefault();
  ctx.platform.start();
  const t = e.changedTouches[0];
}, { passive: false });
```

## Quick Checklist

- [ ] `window.plethoraBit` is assigned at the top level
- [ ] Permissions match actual API usage
- [ ] UI is mounted only through `ctx.createRoot()`, `ctx.createCanvas2D()`, or `ctx.createCanvas()`
- [ ] No non-CDN network URLs
- [ ] Package is under 2 MB
- [ ] ZIP assets have descriptors
- [ ] `ctx.platform.ready()` runs at the end of `init`
- [ ] First interaction calls `ctx.platform.start()`
- [ ] Touch/RAF/listeners use ctx helpers
