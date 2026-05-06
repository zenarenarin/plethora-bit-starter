---
name: plethora-bit-making
description: Create, modify, debug, validate, upload, publish, or republish Plethora bits. Use for standalone Plethora bit source files, ZIP bit packages, runtime contract errors, permission declarations, CDN/Wasm/library loading, WebView startup failures, and Plethora CLI publishing workflows.
---

# Plethora Bit Making

Use this skill to create and ship Plethora bits that satisfy the runtime contract. A bit is either a single JavaScript file assigning `window.plethoraBit`, or a ZIP package with `main.js`, `manifest.json`, and optional `assets/`.

For details beyond the quick workflow, read `references/contract-and-shipping.md`.

## Workflow

1. Identify whether the task is creating a new bit, editing an existing source file, fixing a runtime error, packaging assets, or publishing.
2. Inspect the bit source or package manifest before editing.
3. For bugs, trace the reported runtime error to the exact API or expression that produced it.
4. Apply the smallest source or manifest change that satisfies the contract.
5. Validate with the available Plethora checker or CLI before calling the bit ready.
6. Publish only when the user explicitly asks.

## Contract Checklist

Before calling a bit fixed, verify:

- `window.plethoraBit` is assigned at top level.
- `meta.title`, `description`, `tags`, and `permissions` are present.
- Permissions match actual API usage.
- Canvas and DOM surfaces use `ctx.createCanvas2D()`, `ctx.createCanvas()`, or `ctx.createRoot()`.
- Animation uses `ctx.raf()`, not raw `requestAnimationFrame`.
- Event listeners use `ctx.listen()` when possible, especially for global listeners.
- CDN scripts use `ctx.loadScript()` and only approved hosts from the active contract.
- ZIP package assets are described in `manifest.json`; raw JS uploads do not declare assets.
- Package size stays under the active contract limit, usually 2 MB.

## Permission Map

- `audio`: `AudioContext`, `new Audio()`, `ctx.audio`, `ctx.assets.audio()`
- `camera`: `ctx.camera`, video `getUserMedia`
- `haptics`: `ctx.platform.haptic()`, `navigator.vibrate()`
- `microphone`: `ctx.microphone`, audio `getUserMedia`
- `motion`: `ctx.motion`, device motion/orientation
- `networkFetch`: `fetch`, `ctx.fetch`, `ctx.loadScript`, external script/image/media URLs
- `storage`: `ctx.storage`, `localStorage`, `sessionStorage`

## Common Runtime Bugs

- Web Audio automation belongs on `AudioParam`s: use `gain.gain.setValueAtTime(...)`, not `gain.setValueAtTime(...)`.
- Start or resume `AudioContext` from a real user gesture, and close custom contexts with `ctx.onDestroy()`.
- Libraries with secondary downloads (`.wasm`, `.data`, model, graph, worker files) must keep every follow-up URL on an approved CDN host.
- MediaPipe Hands needs `camera` and `networkFetch`, plus a `locateFile` callback that points secondary files to the same approved CDN base.
- If a fixed bit still fails in the app, the live package may be stale and need upload/publish.

## Validation Commands

Use whatever Plethora validation command is available in the user's environment. Common commands are:

```sh
node scripts/check-package.js path/to/bit.js
npm run build
npm run check
node plethora.js check path/to/bit.js
```

For ZIP package directories, use the checker's manifest-writing mode when available:

```sh
node scripts/check-package.js ./my-bit --write-manifest
```

If no checker is available, manually validate against the checklist and state that automated validation could not be run.

## Upload And Publish

When the Plethora CLI is available, validate first:

```sh
node plethora.js check path/to/bit.js
```

Upload as a draft or draft revision:

```sh
node plethora.js upload path/to/bit.js --title "Bit Title" --tags game
```

Publish only when the user explicitly asks:

```sh
node plethora.js publish <bit-id>
```

If upload returns `Invalid JWT` or `UNAUTHORIZED_ASYMMETRIC_JWT`, refresh or re-login before retrying. Do not print tokens in final responses.

## Completion

- Report the source/package changes made.
- Report the validation commands run.
- If validation could not run, say why.
- If published, include the bit id and the command or status used to confirm it.
