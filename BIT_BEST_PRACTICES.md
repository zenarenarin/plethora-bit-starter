# Plethora Bit - Best Practices

Living document. Update this whenever a non-obvious pattern is discovered.

## Contract First

- The app enforces the contract in `bitContractV1.json`.
- Every built bit package must stay under 2 MB.
- For ZIP bits, the upload function checks compressed ZIP size, extracted file size, and canonical source + manifest size.
- A published version is immutable: `source + manifest + assets + runtime` produces a package hash. Updating a bit creates a new package/version.
- Run `npm run build` for single-file bits and `npm run check` before upload.
- For package directories, run `node scripts/check-package.js ./zip-build --write-manifest` to fill asset descriptors.
- Bits do not own global document surfaces. Mount DOM with `ctx.createRoot()` and canvases with `ctx.createCanvas2D()` or `ctx.createCanvas()`.

## Permissions

Permissions are not decoration. If a bit does not declare a permission, that API is blocked at runtime.

| Permission | Required for |
|---|---|
| `audio` | `AudioContext`, `new Audio()`, `ctx.audio`, `ctx.assets.audio()` |
| `camera` | `ctx.camera`, video `getUserMedia` |
| `haptics` | `ctx.platform.haptic()`, `navigator.vibrate()` |
| `microphone` | `ctx.microphone`, audio `getUserMedia` |
| `motion` | `ctx.motion`, device motion/orientation events |
| `networkFetch` | `ctx.fetch`, `fetch`, `ctx.loadScript`, external script/image/media URLs |
| `storage` | `ctx.storage`, `localStorage`, `sessionStorage` |

Declare only what the bit actually uses:

```js
window.plethoraBit = {
  meta: {
    title: 'Tap Bloom',
    author: 'you',
    description: 'Tap to grow a tiny garden.',
    tags: ['creative'],
    permissions: ['haptics'],
  },
  async init(ctx) {
    ctx.platform.ready();
  },
};
```

## Network

- Network access requires `permissions: ['networkFetch']`.
- Runtime network access is limited to approved CDN hosts from `bitContractV1.json`.
- Do not call random APIs from bits. If the bit needs data, package it as an asset or host static data on an approved CDN.
- Use `ctx.loadScript(url)` for CDN libraries. It is deduped and auto-managed by the runtime.
- Approved hosts currently include `ajax.googleapis.com`, `code.playcanvas.com`, `cdn.jsdelivr.net`, `cdn.skypack.dev`, `cdnjs.cloudflare.com`, `esm.sh`, `fonts.googleapis.com`, `fonts.gstatic.com`, `ga.jspm.io`, `jspm.dev`, and `unpkg.com`.

## CDN Libraries With Wasm Or Secondary Downloads

Some libraries load more files after the first script tag, such as `.wasm`,
`.data`, model, graph, worker, or packed asset files. MediaPipe and PlayCanvas
fall into this category.

- Declare `networkFetch` for the loader script and every secondary fetch.
- Keep every secondary URL on an approved CDN host. A library loaded from
  `cdn.jsdelivr.net` may still fail if it later fetches from another host.
- Prefer `ctx.loadScript()` for the first script, and pass the library a
  `locateFile` option when it supports one so follow-up files stay on the same
  approved CDN.
- Declare the runtime permissions the library actually uses. For example, a
  hand-tracking bit usually needs `camera` and `networkFetch`; add `audio` or
  `haptics` only if the bit uses those APIs too.
- Old MediaPipe Solutions bundles can be brittle in mobile WebViews while
  downloading packed assets. If you use `@mediapipe/hands`, copy the
  compatibility pattern from `creative-bits/hand_keypoints.js` instead of
  loading `hands.js` raw.

```js
const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';

await ctx.loadScript(MP_BASE + '/hands.js');
const hands = new window.Hands({
  locateFile: (file) => MP_BASE + '/' + file,
});
```

## Lifecycle

- Assign `window.plethoraBit` at the top level, not inside `init()` or another function.
- No custom `destroy()` is needed for new bits. Ctx helpers auto-clean when the bit scrolls away.
- Use `ctx.onDestroy(cb)` only for resources the ctx cannot infer, such as closing a custom `AudioContext`.
- Call `ctx.platform.ready()` at the end of `init`.
- Call `ctx.platform.start()` on the first real user interaction.

## Surface Ownership

- Use `ctx.createRoot()` for HTML UI. It is appended inside the bit container and removed automatically.
- Use `ctx.createCanvas2D()` for normal 2D canvas work.
- Use `ctx.createCanvas({ touchAction: 'none' })` for WebGL, shader work, Three.js, or custom renderers.
- Do not call `document.createElement('canvas')`.
- Do not append to `document.body` or `document.documentElement`.
- Do not create script tags manually. Use `ctx.loadScript()` for approved CDN libraries.
- Do not call raw `requestAnimationFrame`; use `ctx.raf()`.
- Do not add global listeners directly; use `ctx.listen(window, ...)` or `ctx.listen(document, ...)` when a global listener is truly needed.

## Canvas

- Prefer `ctx.createCanvas2D()` for 2D. It is DPR-correct, auto-sized, auto-appended, and auto-removed.
- The returned 2D context is already scaled for DPR. Draw in CSS pixels: `ctx.width` by `ctx.height`.
- Name the canvas rendering context `g`, not `ctx`.
- For WebGL or custom canvases, use `ctx.createCanvas()`.

## Touch

- Use `ctx.listen()`, not raw `addEventListener`, so listeners clean up automatically.
- Use `changedTouches[0]`, not `touches[0]`, for newly landed fingers.
- Use `{ passive: false }` and `e.preventDefault()` when a touch should not scroll the WebView.
- Keep controls above `ctx.safeArea.bottom`. The bottom strip belongs to the feed gesture.
- If the bit uses haptics, declare `permissions: ['haptics']`.

## Animation

- Use `ctx.raf(cb)`, not raw `requestAnimationFrame`.
- `cb` receives `dt` in milliseconds. Convert with `dt / 1000`.
- Clamp simulation deltas for games: `const dtSec = Math.min(dt / 1000, 0.05)`.
- The runtime cancels loops on destroy and pauses them when the bit is backgrounded.

## Audio

- Declare `permissions: ['audio']` before using audio.
- Resume `AudioContext` on the first user gesture.
- Design for silent mode. Audio should never be the only feedback channel.

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

## Assets

Use ZIP packages for local images, audio, JSON, shaders, or models.

```text
my-bit/
  main.js
  manifest.json
  assets/
    background.webp
    tap.mp3
```

The manifest should describe every asset:

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

- Asset paths are relative to `assets/`.
- Use `ctx.assets.url('background.webp')` for URLs.
- Use `ctx.assets.image()`, `ctx.assets.audio()`, `ctx.assets.json()`, or `ctx.assets.text()` for loaded assets.
- Raw JavaScript uploads cannot declare assets.

## Platform Events

```js
ctx.platform.ready();                              // required at end of init
ctx.platform.start();                              // first real interaction
ctx.platform.interact({ type: 'tap' });            // each interaction
ctx.platform.setScore(42);                         // games
ctx.platform.setProgress(0.5);                     // progress 0..1
ctx.platform.complete({ score, durationMs });      // natural ending
ctx.platform.fail({ reason: 'hit' });              // game-over
ctx.platform.haptic('light');                      // requires haptics permission
```

## Upload Workflow

Single JS file:

```bash
npm install
npm run build
npm run check
plethora upload dist/bit.js --title "My Bit" --tags creative
```

ZIP package:

```bash
node scripts/check-package.js ./zip-build --write-manifest
cd zip-build
Compress-Archive -Path main.js,manifest.json,assets -DestinationPath ../my-bit.zip -Force
cd ..
plethora upload my-bit.zip --title "My Bit"
```

## Pre-Upload Checklist

- [ ] `window.plethoraBit` assigned at top level
- [ ] `meta.title`, `meta.author`, `meta.description`, `meta.tags`, `meta.permissions` filled in
- [ ] Permissions match actual API usage
- [ ] UI is mounted only through ctx surface helpers
- [ ] External URLs use approved CDN hosts only
- [ ] Package is under 2 MB
- [ ] ZIP assets have `path`, `mime`, `size`, `sha256`, and optional `role`
- [ ] `ctx.platform.ready()` called at end of `init`
- [ ] `ctx.platform.start()` called on first user touch
- [ ] Using `ctx.listen()` and `ctx.raf()`
- [ ] Bit makes sense without sound
