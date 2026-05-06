# Plethora Bit Contract And Shipping

Use this reference when a bit task needs more detail than the quick checklist in `SKILL.md`.

## Single JS Bit Shape

```js
window.plethoraBit = {
  meta: {
    title: 'My Bit',
    author: 'plethora',
    description: 'One line description.',
    tags: ['game'],
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

## ZIP Package Shape

```text
my-bit/
  main.js
  manifest.json
  assets/
    background.webp
    tap.mp3
```

The manifest should describe the entry, metadata, permissions, and assets:

```json
{
  "schemaVersion": 1,
  "runtime": "plethora-bit@1",
  "entry": "main.js",
  "title": "My Bit",
  "description": "A tiny interactive scene.",
  "tags": ["game"],
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

Use `ctx.assets.url()`, `ctx.assets.image()`, `ctx.assets.audio()`, `ctx.assets.json()`, or `ctx.assets.text()` for package assets.

## Approved CDN Hosts

Read the current allowlist from the active contract when available. Do not rely on memory. Common approved hosts may include:

- `ajax.googleapis.com`
- `code.playcanvas.com`
- `cdn.jsdelivr.net`
- `cdn.skypack.dev`
- `cdnjs.cloudflare.com`
- `esm.sh`
- `fonts.googleapis.com`
- `fonts.gstatic.com`
- `ga.jspm.io`
- `jspm.dev`
- `unpkg.com`

If a library loads secondary files from a host not present in the contract, choose a different CDN URL, update the contract if you control it, or package the asset locally in a ZIP bit.

## Debugging Startup Failures

1. Read the exact WebView error text.
2. Search the bit source for the named function, property, URL, or API.
3. Validate the source against the permission map.
4. If source-level validation passes, inspect runtime-only surfaces:
   - external script secondary downloads
   - Wasm CSP needs
   - WebView browser compatibility
   - stale published package/source

## MediaPipe Pattern

Use an approved CDN base and force secondary files through the same base:

```js
const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';

await ctx.loadScript(MP_BASE + '/hands.js');
const hands = new window.Hands({
  locateFile: (file) => MP_BASE + '/' + file,
});
```

Old MediaPipe Solutions bundles can be brittle in mobile WebViews while downloading packed assets. If packed-asset progress throws, add a narrow XMLHttpRequest compatibility shim around the MediaPipe asset download rather than weakening the whole sandbox.

## Web Audio Pattern

```js
const osc = audioCtx.createOscillator();
const gain = audioCtx.createGain();
osc.connect(gain);
gain.connect(audioCtx.destination);

gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
osc.start();
osc.stop(audioCtx.currentTime + 0.1);
```

The `GainNode` is `gain`; the automatable `AudioParam` is `gain.gain`.

## Publishing Notes

The CLI may store auth in a user config file. Never expose access tokens or refresh tokens in final output.

Useful commands:

```sh
node plethora.js login
node plethora.js list
node plethora.js check path/to/bit.js
node plethora.js upload path/to/bit.js --title "Bit Title" --tags game
node plethora.js publish <bit-id>
```

At login, enter a password or leave the password blank to receive an email code. If Supabase still sends a magic link, paste the full link at the code prompt. Use the email-code path for accounts created with Google sign-in.

For an already-live title, upload usually creates a draft revision on the existing published bit; publishing promotes that revision.

If `UNAUTHORIZED_ASYMMETRIC_JWT` or `Invalid JWT` appears, the saved session expired. Refresh the session or run `node plethora.js login`, then retry.
