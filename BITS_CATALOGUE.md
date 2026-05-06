# Bits Catalogue

All bits built in this session, with their Supabase bit IDs.

---

## ZIP / Asset Bits

| Title | Bit ID | File | Notes |
|---|---|---|---|
| explore | `e79ca190-2681-433e-b1c0-54b307b4d83b` | `zip-build/main.js` | Dystopian city panorama — 2× zoom, swipe to pan, water ripple effect |
| surrealutopia | `828173e7-3b72-43fd-9d4c-d04db932d333` | `zip-build/surrealutopia.js` | Surreal utopia image — pinch to zoom (2–5×), pan, water ripple effect |

## WebGPU Bits

| Title | Bit ID | File | Notes |
|---|---|---|---|
| pylons | `82f3120d-e23b-4f3c-b828-80d30a7d1cd4` | `webgpu-bits/pylons.js` → `dist/pylons.js` | WebGPU instanced mesh, simplex noise, GTAO + bloom, drag to pan noise field |
| mercury | `c4620a45-84b8-4495-8c5b-a6251fc88737` | `webgpu-bits/mercury.js` | VFX-JS ray-marched liquid mercury orb, orbiting bubbles, tap to cycle shapes |

## ASCII / Camera Bits

| Title | Bit ID | File | Notes |
|---|---|---|---|
| ascii.you | `1ebff514-5e87-426c-a1f4-97d096ee68c6` | `ascii-art/ascii_you.js` | Real-time front camera → ASCII art, BT.709 luminance, colored chars |
| braille.you | _(uploaded as ascii.you v2)_ | `ascii-art/ascii_braille.js` | Braille Unicode, Atkinson dithering, ripple on touch, Gaussian color noise |
| hand keypoints | `7b258f54-b2aa-4bc8-8cee-157fa7c2d3a0` | `creative-bits/hand_keypoints.js` | Front camera → MediaPipe Hands CDN, mirrored landmark overlay, fist intensity + top-to-bottom brightness/lead EDM loop |

## Education Bits

| Title | File | Notes |
|---|---|---|
| pitch finder | `education_bits/pitch_finder.js` | Mic → autocorrelation pitch detection, note name + cents meter |
| bayes trap | `education_bits/bayes_trap.js` | |
| binary counter | `education_bits/binary_counter.js` | |
| breathing guide | `education_bits/breathing_guide.js` | |
| compound interest | `education_bits/compound_interest.js` | |
| prime sieve | `education_bits/prime_sieve.js` | |
| sorting race | `education_bits/sorting_race.js` | |
| _(+ 9 more)_ | `education_bits/` | See folder |

## Arcade Bits

| Title | File | Notes |
|---|---|---|
| qix | `arcade-bits/qix.js` | Territory-claiming arcade game |
| pacman | `arcade-bits/pacman.js` | |
| galaga | `arcade-bits/galaga.js` | |
| _(+ 13 more)_ | `arcade-bits/` | See folder |

---

## Build Commands

```bash
# ZIP bits (explore / surrealutopia)
# Edit zip-build/main.js or zip-build/surrealutopia.js, then:
node build-zip.js   # (inline script in session — see CLAUDE.md for the builder)
plethora upload explore.zip --title "explore" --tags creative
plethora upload surrealutopia.zip --title "surrealutopia" --tags creative

# JS bits (single file)
plethora upload ascii-art/ascii_braille.js --title "braille.you" --tags creative
plethora upload education_bits/pitch_finder.js --title "pitch finder" --tags education

# WebGPU bits (need bundling)
node -e "require('esbuild').build({ entryPoints:['webgpu-bits/pylons.js'], bundle:true, format:'iife', outfile:'dist/pylons.js', target:['es2020'], minify:true, conditions:['import','module'] })"
plethora upload dist/pylons.js --title "pylons" --tags creative
```
