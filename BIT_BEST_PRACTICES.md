# Plethora Bit — Best Practices

Living document. Updated whenever a non-obvious pattern is discovered.

---

## Lifecycle

- Always store RAF handles and listener refs on `this` so `destroy()` can clean them up.
- `destroy()` must cancel **every** `requestAnimationFrame`, `setInterval`, `setTimeout`, and remove every event listener — failure causes audio/animation bleed into the next card.
- `window.scrollerApp` must be assigned at the **top level**, not inside `init()` or any function.

## Touch & Pointer Events

- Use `changedTouches[0]`, not `touches[0]` — `touches[0]` gives the oldest active finger, not the newly landed one.
- Prevent double-fire (touchstart + click synthetic) with a timestamp guard:
  ```js
  let _lt = 0;
  el.addEventListener('touchstart', e => { _lt = Date.now(); onTap(e.changedTouches[0]); }, { passive: true });
  el.addEventListener('click', e => { if (Date.now() - _lt < 500) return; onTap(e); });
  ```
- Use `pointerdown`/`pointermove`/`pointerup` when you don't need multi-touch — simpler than touch + mouse split.
- Always map pointer coordinates with DPR: `const x = e.offsetX * dpr`.

## Canvas

- Scale for Retina/high-DPR screens:
  ```js
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = container.clientWidth  * dpr;
  canvas.height = container.clientHeight * dpr;
  canvas.style.width  = container.clientWidth  + 'px';
  canvas.style.height = container.clientHeight + 'px';
  ctx.scale(dpr, dpr);
  ```
- Use motion trails (semi-transparent fillRect over the frame) instead of clearing — cheaper than a full redraw and creates a smear effect for free.
- Throttle particle spawning; uncapped spawning on every frame kills 60 FPS on low-end phones.

## Web Audio

- `AudioContext` must be resumed on the first user gesture — the browser blocks it otherwise:
  ```js
  container.addEventListener('pointerdown', () => this._ctx.resume(), { once: true });
  ```
- Call `this._ctx?.close()` in `destroy()`.
- Design for silent mode — many mobile users have sound off. Never make audio the only feedback channel.

## Game / Timer Pattern

- Use `performance.now()` + delta time for game loops, not frame counting — frame rate varies.
- Standard 20-second countdown:
  ```js
  const DURATION = 20;
  const loop = (now) => {
    const left = Math.max(0, DURATION - (now - startTime) / 1000);
    if (left === 0) { endGame(); return; }
    raf = requestAnimationFrame(loop);
  };
  startTime = performance.now();
  raf = requestAnimationFrame(loop);
  ```
- Always show a result screen when the game ends; let the user restart without needing to scroll away.

## UX / Design

- Dark backgrounds (#000 or #111) — bright backgrounds jar against the dark feed.
- One clear mechanic — a user should know what to do in under 3 seconds.
- Every tap/swipe must produce an immediate visible response.
- Keep text minimal; if instructions are needed, show a short overlay that disappears on first tap.
- Never wall of text — users scroll past bits in seconds.

## CDN / External Resources

- Load external libraries via dynamic `<script>` injection, not ES `import`:
  ```js
  const s = document.createElement('script');
  s.src = 'https://cdn.example.com/lib.min.js';
  s.onload = () => startBit();
  document.head.appendChild(s);
  ```
- Cache the CDN script reference in a module-level flag so re-init (when the bit scrolls back in) doesn't double-inject.
- The WebView has full network access — fetch, CDN scripts, and images all work.

## Three.js ShaderMaterial

- `THREE.Vector3` and `THREE.Color` are different types — don't call `.setRGB()` on a `Vector3` (that's a `Color` method). Use `.set(r, g, b)` on `Vector3`. A TypeError here crashes the RAF loop silently, leaving a black screen with no visible error.
- Don't pass `envMap` to a `ShaderMaterial` constructor unless your GLSL actually samples it. Three.js activates env map machinery (defines, texture binding) based on `material.envMap` being set, even for custom shaders.
- `ShaderMaterial` is unlit — Three.js `PointLight` / `DirectionalLight` objects in the scene have zero effect. Pass light world positions and colors as explicit uniforms and compute shading manually in GLSL.
- Update animated values (e.g. light positions) *before* copying them into uniforms each frame, not after.

## Particle Systems

- When particles orbit a movable anchor, write positions as `anchor + cos(angle)*r` / `anchor + sin(angle)*r` — not just `cos(angle)*r`. If you forget the offset, the anchor glow moves but the particle disc stays pinned to the origin.
- Keep physics state (angle, radius) separate from world position. Compute world position at the end of the update loop by adding the anchor offset; never bake the offset into the orbital state variables.

## Upload Workflow

- `npm run build` → `dist/bit.js` (esbuild IIFE, minified).
- `plethora upload dist/bit.js --title "..." --tags game` creates a **draft** — visible only in your profile.
- Preview in the app before `plethora publish <bit-id>`.
- The upload CLI validates that `window.scrollerApp` is present in the built file.

## Pre-Upload Checklist

- [ ] `window.scrollerApp` assigned at top level
- [ ] `meta.title`, `meta.author`, `meta.description`, `meta.tags` filled in
- [ ] `destroy()` cancels every RAF and interval
- [ ] CDN scripts loaded via `<script>` injection
- [ ] `npm run build` completes without errors
- [ ] Bit makes sense without sound
