# Plethora Bit Starter

Canonical starter files:

- `src/index.js` is the bit you edit.
- `npm run build` writes `dist/bit.js`.
- `npm run check` validates the built bit against the current Plethora contract.
- `node plethora.js login` signs you in for uploads. Enter your password, or leave it blank to receive an email code. If Supabase still sends a magic link, paste the full link at the code prompt. The email-code path is best if your Plethora account was created with Google sign-in.
- `CLAUDE.md` and `BIT_BEST_PRACTICES.md` are the creator/AI guidance.
- `.agents/skills/plethora-bit-making/` is a portable Claude/Codex skill for creating, fixing, validating, uploading, and publishing Plethora bits.

Important contract rules:

- Package size limit: 2 MB.
- Declare every permission you use.
- Network access only works with `networkFetch`, and only for approved CDN hosts.
- CDN libraries that load `.wasm`, `.data`, models, workers, or other secondary files must keep those secondary URLs on approved CDN hosts too. Use library `locateFile` hooks when available.
- Use `ctx.createCanvas2D()` for 2D, `ctx.createCanvas()` for WebGL/custom renderers, and `ctx.createRoot()` for DOM UI.
- Use `ctx.listen()` for listeners and `ctx.raf()` for animation loops.
- Use `ctx.loadScript()` for CDN libraries.

Legacy catalogue folders in this repo are reference material, not guaranteed current-contract starter templates. Before uploading any copied bit, run `npm run build` and `npm run check`.
