# Plethora Bit — Best Practices

Living document. Updated whenever a non-obvious pattern is discovered.

---

## Lifecycle

- `window.plethoraBit` must be assigned at the **top level**, not inside `init()` or any function.
- No `destroy()` needed. All ctx helpers (`ctx.raf`, `ctx.listen`, `ctx.timeout`, `ctx.interval`) auto-cleanup when the bit scrolls away.
- Use `ctx.onDestroy(cb)` to register any teardown that ctx doesn't automatically handle (e.g. closing an AudioContext).
- Always call `ctx.platform.ready()` at the end of `init` — this signals the platform the bit loaded successfully.
- Always call `ctx.platform.start()` on the first real user interaction (first touch that starts gameplay).

## Canvas (Blessed Canvas)

- Use `ctx.createCanvas2D()` — never create or size a canvas manually. It's DPR-correct, auto-sized, auto-appended, and auto-removed on destroy.
- The 2D context returned is **pre-scaled for DPR** — draw in CSS pixels (`ctx.width` × `ctx.height`), not raw pixels.
- Name the 2D context `g` (not `ctx`, which is the platform context): `const g = canvas.getContext('2d')`.
- For WebGL or custom-sized canvases, use `ctx.createCanvas(opts)` instead.

## Touch & Pointer Events

- Use `ctx.listen()` — never call `addEventListener` directly. Ctx-registered listeners auto-remove on destroy.
- Use `changedTouches[0]`, not `touches[0]` — `touches[0]` gives the oldest active finger, not the newly landed one.
- Always `e.preventDefault()` in touchstart/touchmove with `{ passive: false }` to prevent the WebView from scrolling:
  ```js
  ctx.listen(canvas, 'touchstart', (e) => {
    e.preventDefault();
    // your logic
  }, { passive: false });
  ```
- Prevent double-fire (touchstart + click synthetic) with a timestamp guard:
  ```js
  let _lt = 0;
  ctx.listen(canvas, 'touchstart', (e) => { _lt = Date.now(); onTap(e.changedTouches[0]); }, { passive: true });
  ctx.listen(canvas, 'click',      (e) => { if (Date.now() - _lt < 500) return; onTap(e); });
  ```
- Always map pointer coordinates with DPR: `const x = e.offsetX * ctx.dpr`.

## Animation Loop

- Use `ctx.raf(cb)` — never call `requestAnimationFrame` directly. The loop auto-cancels on destroy and pauses when the bit is backgrounded.
- `cb` receives `dt` in **milliseconds** since the last frame. Convert to seconds when needed: `const dtSec = Math.min(dt / 1000, 0.05)`.
- When the bit resumes after being paused, the first `dt` is 0 (not the full gap) — the platform handles this automatically.

## Web Audio

- `AudioContext` must be resumed on the first user gesture — the browser blocks it otherwise:
  ```js
  async init(ctx) {
    const audioCtx = new AudioContext();
    ctx.listen(canvas, 'touchstart', () => audioCtx.resume(), { once: true });
    ctx.onDestroy(() => audioCtx.close());
  }
  ```
- Design for silent mode — many mobile users have sound off. Never make audio the only feedback channel.

## Safe Zone

- Keep all interactive controls above `ctx.safeArea.bottom` — the bottom strip is reserved for Plethora's swipe-up gesture.
- `ctx.safeArea.bottom` is in CSS px; subtract it from `ctx.height` for the usable area.

## Game / Timer Pattern

- Use `dt` from `ctx.raf` for game loops, not frame counting — frame rate varies.
- Standard countdown pattern:
  ```js
  const DURATION = 20; // seconds
  let elapsed = 0;
  ctx.raf((dt) => {
    elapsed += dt / 1000;
    const left = Math.max(0, DURATION - elapsed);
    if (left === 0) { endGame(); return; }
    // draw frame
  });
  ```
- Always show a result screen when the game ends; let the user restart without needing to scroll away.

## Platform Events

Call these to report meaningful moments:
```js
ctx.platform.ready()                             // end of init — REQUIRED
ctx.platform.start()                             // first real user interaction
ctx.platform.interact({ type: 'tap' })           // each interaction
ctx.platform.setScore(n)                         // current score
ctx.platform.setProgress(0.0–1.0)               // how far through the bit
ctx.platform.complete({ score, durationMs })     // natural ending
ctx.platform.fail({ reason })                    // game-over
ctx.platform.haptic('light' | 'medium' | 'heavy') // vibration
```

## UX / Design

- Dark backgrounds (#000 or #111) — bright backgrounds jar against the dark feed.
- One clear mechanic — a user should know what to do in under 3 seconds.
- Every tap/swipe must produce an immediate visible + haptic response.
- Keep text minimal; if instructions are needed, show a short overlay that disappears on first tap.

## CDN / External Libraries

- Load external libraries via dynamic `<script>` injection, not ES `import`:
  ```js
  const s = document.createElement('script');
  s.src = 'https://cdn.example.com/lib.min.js';
  s.onload = () => startBit();
  document.head.appendChild(s);
  ```
- Cache the CDN script reference in a flag so re-init doesn't double-inject.

## Assets (ZIP bits)

- Only use `ctx.assets` when the bit was uploaded as a ZIP with an `assets/` folder.
- All assets must be flat inside `assets/` — no subdirectories.
- Cache loaded assets in variables; `ctx.assets.image()` and `ctx.assets.audio()` cache internally but avoiding redundant awaits is good practice.
- `ctx.assets.url(filename)` returns the full URL — use it for Three.js texture loaders or `<img>` elements.

## Three.js ShaderMaterial

- `THREE.Vector3` and `THREE.Color` are different types — don't call `.setRGB()` on a `Vector3`. Use `.set(r, g, b)` on `Vector3`.
- Don't pass `envMap` to a `ShaderMaterial` constructor unless your GLSL actually samples it.
- `ShaderMaterial` is unlit — Three.js lights have zero effect. Pass light positions/colors as explicit uniforms.

## Particle Systems

- When particles orbit a movable anchor, write positions as `anchor + cos(angle)*r` — not just `cos(angle)*r`.
- Keep physics state (angle, radius) separate from world position. Compute world position at the end of the update loop by adding the anchor offset.

## Upload Workflow

- `npm run build` → `dist/bit.js` (esbuild IIFE, minified).
- `plethora upload dist/bit.js --title "..." --tags game` creates a **draft** — visible only in your profile.
- For ZIP bits: `plethora upload my-bit.zip --title "..."`.
- Preview in the app before `plethora publish <bit-id>`.

## Pre-Upload Checklist

- [ ] `window.plethoraBit` assigned at top level
- [ ] `meta.title`, `meta.author`, `meta.description`, `meta.tags`, `meta.permissions` filled in
- [ ] `ctx.platform.ready()` called at end of `init`
- [ ] `ctx.platform.start()` called on first user touch
- [ ] Using `ctx.listen()` not raw `addEventListener`
- [ ] Using `ctx.raf()` not raw `requestAnimationFrame`
- [ ] No `destroy()` — ctx cleans up automatically
- [ ] CDN scripts loaded via `<script>` injection (not ES `import`)
- [ ] `npm run build` completes without errors
- [ ] Bit makes sense without sound
