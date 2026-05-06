// LOST TREASURE — Retro puzzle platformer (Plethora Bit)

function roundRectC(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

window.plethoraBit = {
  meta: {
    title: 'Lost Treasure',
    author: 'plethora',
    description: 'Find the treasure. Avoid the traps.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ──────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function tone(freq, type, dur, vol = 0.2, delay = 0) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      const t = audioCtx.currentTime + delay;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur);
    }
    function noise(dur, vol = 0.3) {
      if (!audioCtx) return;
      const sr = audioCtx.sampleRate;
      const buf = audioCtx.createBuffer(1, sr * dur, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      src.start();
    }
    function sndFootstep() { tone(180, 'triangle', 0.06, 0.08); }
    function sndJump()     { tone(320, 'sine', 0.1, 0.18); tone(480, 'sine', 0.08, 0.1, 0.05); }
    function sndGem()      { [880, 1100, 1320].forEach((f, i) => tone(f, 'sine', 0.12, 0.15, i * 0.06)); }
    function sndKey()      { tone(660, 'square', 0.06, 0.12); tone(990, 'sine', 0.15, 0.15, 0.07); }
    function sndDoor()     { tone(200, 'sawtooth', 0.18, 0.18); tone(160, 'sawtooth', 0.12, 0.12, 0.12); }
    function sndTreasure() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.25, 0.22, i * 0.1)); }
    function sndDeath()    { noise(0.25, 0.35); tone(120, 'sawtooth', 0.3, 0.2); }
    function sndAlert()    { tone(880, 'square', 0.08, 0.2); tone(1100, 'square', 0.08, 0.2, 0.1); }

    // ── Tile constants ─────────────────────────────────────────────────
    const T = {
      EMPTY: 0,
      PLATFORM: 1,
      SPIKE: 2,
      GEM: 3,
      KEY: 4,
      DOOR: 5,
      TREASURE: 6,
      GUARD: 7,
      CRUMBLE: 8,
    };

    // ── Level definitions (20 cols × 28 rows) ─────────────────────────
    // Each row = top-to-bottom, each col = left-to-right
    const LEVELS = [
      // Level 1: Tutorial — simple, 1 gem, one jump to treasure
      [
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      // Level 2: Keys and doors
      [
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      // Level 3: Spikes
      [
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0],
        [1,1,1,1,0,0,0,1,1,1,1,1,1,0,0,1,1,1,1,1],
        [0,0,0,0,0,2,2,0,0,0,0,0,0,2,2,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      // Level 4: Guards patrol
      [
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,7,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,0,0,0,1,1,1,1,1,1,0,0,0,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      // Level 5: Crumbling platforms
      [
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,8,8,8,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,8,8,8,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,8,8,8,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,0,0,0,1,1,1,0,0,0,1,1,1,0,0,0,1,1],
        [0,0,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      // Level 6: Combined hazards
      [
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,8,8,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,1,1,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      // Level 7: Final challenge — all mechanics
      [
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,8,8,8,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,7,0,0,0,0,0,0,0,0,0],
        [0,0,0,1,1,1,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
        [0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,2,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,2,2,2,2,2,2,2,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
    ];

    // ── Grid sizing ────────────────────────────────────────────────────
    const COLS = 20, ROWS = 28;
    const HUD_H = 48;
    const PLAY_H = H - HUD_H - SAFE;
    const TW = W / COLS;
    const TH = PLAY_H / ROWS;
    const OY = HUD_H; // y offset for tile grid

    function tileX(col) { return col * TW; }
    function tileY(row) { return OY + row * TH; }

    // ── State ──────────────────────────────────────────────────────────
    let levelIdx, lives, totalScore, levelGems, started;
    let player, guards, gems, keys, doors, crumbleTiles, dynamicTiles;
    let phase; // 'play' | 'dead' | 'win' | 'gameover' | 'levelwin' | 'title'
    let phaseTimer = 0;
    let levelComplete = false;
    let hasKey = false;
    let footstepTimer = 0;
    let touchLeft = false, touchRight = false, touchJump = false;
    let jumpReleased = true;
    let lastDoubleTap = 0;

    // Touch zones
    const LEFT_ZONE  = W * 0.35;
    const RIGHT_ZONE = W * 0.65;

    // Physics
    const GRAVITY   = TH * 0.045;
    const JUMP_VEL  = -TH * 1.22;
    const WALK_SPD  = TW * 0.13;

    // ── Level loading ──────────────────────────────────────────────────
    function loadLevel(idx) {
      const map = LEVELS[idx];
      guards = [];
      gems = [];
      keys = [];
      doors = [];
      crumbleTiles = {}; // key = "row,col" → { timer, state }
      dynamicTiles = JSON.parse(JSON.stringify(map)); // mutable copy

      let spawnCol = 1, spawnRow = ROWS - 2;

      // Find floor under col 1
      for (let r = 1; r < ROWS; r++) {
        if (map[r][1] === T.PLATFORM || map[r][1] === T.CRUMBLE) {
          spawnRow = r - 1;
          break;
        }
      }

      // Scan map for entities
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const t = map[r][c];
          if (t === T.GEM) {
            gems.push({ col: c, row: r, alive: true, sparkTimer: Math.random() * Math.PI * 2 });
          } else if (t === T.KEY) {
            keys.push({ col: c, row: r, alive: true });
          } else if (t === T.DOOR) {
            doors.push({ col: c, row: r, open: false });
          } else if (t === T.GUARD) {
            // Find patrol bounds on this row's platform
            let pLeft = c, pRight = c;
            while (pLeft > 0 && (map[r + 1][pLeft - 1] === T.PLATFORM || map[r + 1][pLeft - 1] === T.CRUMBLE)) pLeft--;
            while (pRight < COLS - 1 && (map[r + 1][pRight + 1] === T.PLATFORM || map[r + 1][pRight + 1] === T.CRUMBLE)) pRight++;
            guards.push({
              col: c, row: r,
              x: tileX(c) + TW / 2,
              y: tileY(r),
              vx: TW * 0.055, vy: 0,
              onGround: false,
              patrolLeft: tileX(pLeft),
              patrolRight: tileX(pRight + 1),
              alive: true,
              dir: 1,
            });
            dynamicTiles[r][c] = T.EMPTY;
          }
          if (t === T.CRUMBLE) {
            crumbleTiles[`${r},${c}`] = { state: 'solid', timer: 0 };
          }
        }
      }

      hasKey = false;
      levelGems = 0;
      levelComplete = false;

      player = {
        x: tileX(spawnCol) + TW / 2,
        y: tileY(spawnRow),
        vx: 0, vy: 0,
        onGround: false,
        w: TW * 0.7,
        h: TH * 0.85,
        dir: 1,
        deathTimer: -1,
        deathAngle: 0,
        deathAlpha: 1,
      };

      phase = 'play';
      phaseTimer = 0;
    }

    function initGame() {
      levelIdx = ctx.storage.get('ltLastLevel') || 0;
      lives = 3;
      totalScore = 0;
      started = false;
      loadLevel(levelIdx);
      phase = 'title';
    }

    // ── Tile query helpers ─────────────────────────────────────────────
    function tileAt(col, row) {
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return T.PLATFORM;
      return dynamicTiles[row][col];
    }
    function isSolid(col, row) {
      const t = tileAt(col, row);
      if (t === T.PLATFORM) return true;
      if (t === T.CRUMBLE) {
        const key = `${row},${col}`;
        const ct = crumbleTiles[key];
        return ct ? ct.state === 'solid' || ct.state === 'crumbling' : true;
      }
      if (t === T.DOOR) {
        const d = doors.find(dd => dd.col === col && dd.row === row);
        return d ? !d.open : true;
      }
      return false;
    }

    function resolvePhysics(obj, dt) {
      const dtF = dt / 16.67;
      obj.vy += GRAVITY * dtF;
      if (obj.vy > TH * 0.9) obj.vy = TH * 0.9;

      obj.x += obj.vx * dtF;
      obj.y += obj.vy * dtF;

      const hw = (obj.w || TW * 0.7) / 2;
      const hh = obj.h || TH * 0.85;

      // Horizontal collision
      const colL = Math.floor((obj.x - hw) / TW);
      const colR = Math.floor((obj.x + hw - 1) / TW);
      const rowT = Math.floor((obj.y) / TH - OY / TH);
      const rowB = Math.floor((obj.y + hh - 1) / TH - OY / TH);

      for (let r = rowT; r <= rowB; r++) {
        if (isSolid(colL, r)) {
          obj.x = (colL + 1) * TW + hw;
          obj.vx = 0;
        }
        if (isSolid(colR, r)) {
          obj.x = colR * TW - hw;
          obj.vx = 0;
        }
      }

      // Vertical collision
      const colL2 = Math.floor((obj.x - hw + 2) / TW);
      const colR2 = Math.floor((obj.x + hw - 3) / TW);
      const rowT2 = Math.floor((obj.y) / TH - OY / TH);
      const rowB2 = Math.floor((obj.y + hh) / TH - OY / TH);

      obj.onGround = false;
      // Bottom
      for (let c = colL2; c <= colR2; c++) {
        if (isSolid(c, rowB2)) {
          obj.y = rowB2 * TH + OY - hh;
          obj.vy = 0;
          obj.onGround = true;
          // Crumble trigger
          const key2 = `${rowB2},${c}`;
          if (crumbleTiles[key2] && crumbleTiles[key2].state === 'solid' && obj === player) {
            crumbleTiles[key2].state = 'crumbling';
            crumbleTiles[key2].timer = 0;
          }
        }
      }
      // Top
      const rowT3 = Math.floor((obj.y) / TH - OY / TH);
      for (let c = colL2; c <= colR2; c++) {
        if (isSolid(c, rowT3)) {
          obj.y = (rowT3 + 1) * TH + OY;
          obj.vy = 0;
        }
      }

      // Screen bounds
      if (obj.x - hw < 0) { obj.x = hw; obj.vx = 0; }
      if (obj.x + hw > W) { obj.x = W - hw; obj.vx = 0; }
      // Kill if fell off
      if (obj.y > H + TH * 2) {
        if (obj === player) killPlayer();
      }
    }

    // ── Player death ───────────────────────────────────────────────────
    function killPlayer() {
      if (phase !== 'play') return;
      sndDeath();
      ctx.platform.haptic('heavy');
      phase = 'dead';
      phaseTimer = 0;
      player.deathTimer = 0;
      player.deathAlpha = 1;
    }

    // ── Game update ────────────────────────────────────────────────────
    function update(dt) {
      if (phase === 'title' || phase === 'gameover') return;
      if (phase === 'levelwin') {
        phaseTimer += dt;
        if (phaseTimer > 1800) {
          levelIdx++;
          if (levelIdx >= LEVELS.length) {
            phase = 'win';
            phaseTimer = 0;
            ctx.platform.complete({ score: totalScore });
          } else {
            ctx.storage.set('ltLastLevel', levelIdx);
            loadLevel(levelIdx);
          }
        }
        return;
      }
      if (phase === 'dead') {
        phaseTimer += dt;
        player.deathAngle += dt * 0.01;
        player.deathAlpha = Math.max(0, 1 - phaseTimer / 800);
        if (phaseTimer > 1000) {
          lives--;
          if (lives <= 0) {
            phase = 'gameover';
            phaseTimer = 0;
          } else {
            loadLevel(levelIdx);
          }
        }
        return;
      }
      if (phase === 'win') {
        phaseTimer += dt;
        return;
      }

      const dtF = dt / 16.67;

      // Crumble timers
      for (const key in crumbleTiles) {
        const ct = crumbleTiles[key];
        if (ct.state === 'crumbling') {
          ct.timer += dt;
          if (ct.timer > 600) {
            ct.state = 'gone';
            const [r, c] = key.split(',').map(Number);
            dynamicTiles[r][c] = T.EMPTY;
          }
        }
      }

      // Player input
      const moving = touchLeft || touchRight;
      if (touchLeft) {
        player.vx = -WALK_SPD;
        player.dir = -1;
      } else if (touchRight) {
        player.vx = WALK_SPD;
        player.dir = 1;
      } else {
        player.vx *= 0.6;
        if (Math.abs(player.vx) < 0.5) player.vx = 0;
      }

      if (touchJump && player.onGround && jumpReleased) {
        player.vy = JUMP_VEL;
        player.onGround = false;
        jumpReleased = false;
        sndJump();
        ctx.platform.haptic('light');
      }
      if (!touchJump) jumpReleased = true;

      // Footstep sound
      if (player.onGround && moving) {
        footstepTimer -= dt;
        if (footstepTimer <= 0) {
          sndFootstep();
          footstepTimer = 300;
        }
      } else {
        footstepTimer = 0;
      }

      resolvePhysics(player, dt);

      // Guard update
      for (const g of guards) {
        if (!g.alive) continue;
        g.vy += GRAVITY * dtF;
        g.x += g.vx * dtF;
        g.y += g.vy * dtF;

        // Ground check
        const gc = Math.floor(g.x / TW);
        const gr = Math.floor((g.y + TH) / TH - OY / TH);
        if (isSolid(gc, gr)) {
          g.y = gr * TH + OY - TH;
          g.vy = 0;
          g.onGround = true;
        } else {
          g.onGround = false;
        }

        // Patrol reversal
        if (g.x <= g.patrolLeft) { g.x = g.patrolLeft; g.vx = Math.abs(g.vx); g.dir = 1; }
        if (g.x + TW >= g.patrolRight) { g.x = g.patrolRight - TW; g.vx = -Math.abs(g.vx); g.dir = -1; }
        // Edge detection
        const frontC = Math.floor((g.x + (g.dir > 0 ? TW : 0)) / TW);
        if (!isSolid(frontC, gr)) { g.vx = -g.vx; g.dir = -g.dir; }

        // Player collision with guard
        if (Math.abs(player.x - (g.x + TW / 2)) < TW * 0.7 &&
            Math.abs(player.y + (player.h / 2) - (g.y + TH / 2)) < TH * 0.9) {
          sndAlert();
          killPlayer();
        }
      }

      // Gem collection
      for (const gem of gems) {
        if (!gem.alive) continue;
        gem.sparkTimer += dt * 0.004;
        const gx = tileX(gem.col) + TW / 2;
        const gy = tileY(gem.row) + TH / 2;
        if (Math.abs(player.x - gx) < TW && Math.abs(player.y + player.h / 2 - gy) < TH) {
          gem.alive = false;
          dynamicTiles[gem.row][gem.col] = T.EMPTY;
          levelGems++;
          totalScore += 50;
          ctx.platform.setScore(totalScore);
          sndGem();
          ctx.platform.haptic('light');
        }
      }

      // Key collection
      for (const key of keys) {
        if (!key.alive) continue;
        const kx = tileX(key.col) + TW / 2;
        const ky = tileY(key.row) + TH / 2;
        if (Math.abs(player.x - kx) < TW && Math.abs(player.y + player.h / 2 - ky) < TH) {
          key.alive = false;
          dynamicTiles[key.row][key.col] = T.EMPTY;
          hasKey = true;
          totalScore += 100;
          ctx.platform.setScore(totalScore);
          sndKey();
          ctx.platform.haptic('medium');
          // Open doors
          for (const d of doors) {
            d.open = true;
            const dRow = d.row, dCol = d.col;
            dynamicTiles[dRow][dCol] = T.EMPTY;
            sndDoor();
          }
        }
      }

      // Spike collision
      const pc = Math.floor(player.x / TW);
      const pr = Math.floor((player.y + player.h * 0.9) / TH - OY / TH);
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const tc = pc + dc, tr = pr + dr;
          if (tileAt(tc, tr) === T.SPIKE) {
            const sx = tileX(tc) + TW / 2, sy = tileY(tr) + TH * 0.7;
            if (Math.abs(player.x - sx) < TW * 0.45 && Math.abs(player.y + player.h * 0.7 - sy) < TH * 0.5) {
              killPlayer();
            }
          }
        }
      }

      // Treasure
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (dynamicTiles[r][c] === T.TREASURE) {
            const tx2 = tileX(c) + TW / 2, ty2 = tileY(r) + TH / 2;
            if (Math.abs(player.x - tx2) < TW && Math.abs(player.y + player.h / 2 - ty2) < TH * 1.1) {
              totalScore += 500 + levelGems * 25;
              ctx.platform.setScore(totalScore);
              ctx.platform.setProgress((levelIdx + 1) / LEVELS.length);
              sndTreasure();
              ctx.platform.haptic('heavy');
              phase = 'levelwin';
              phaseTimer = 0;
            }
          }
        }
      }
    }

    // ── Drawing helpers ────────────────────────────────────────────────
    function pixelText(str, x, y, size, color, align = 'left') {
      g.save();
      g.font = `bold ${size}px monospace`;
      g.fillStyle = color;
      g.textAlign = align;
      g.textBaseline = 'top';
      // shadow for pixel feel
      g.shadowColor = '#000';
      g.shadowBlur = 0;
      g.shadowOffsetX = 2;
      g.shadowOffsetY = 2;
      g.fillText(str, x, y);
      g.restore();
    }

    function drawHUD() {
      g.fillStyle = '#0a0a10';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = '#2a2a3a';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      pixelText(`LVL ${levelIdx + 1}/7`, 10, 8, 13, '#aaaacc');
      pixelText(`SCORE ${totalScore}`, W / 2, 8, 13, '#FFD740', 'center');

      // Lives (hearts)
      for (let i = 0; i < 3; i++) {
        const hx = W - 18 - i * 22;
        const hy = 8;
        g.fillStyle = i < lives ? '#FF4444' : '#333344';
        g.beginPath();
        g.arc(hx - 4, hy + 5, 4, Math.PI, 0);
        g.arc(hx + 4, hy + 5, 4, Math.PI, 0);
        g.lineTo(hx, hy + 18);
        g.closePath();
        g.fill();
      }

      // Gems collected this level
      const gemStr = `♦ ${levelGems}`;
      pixelText(gemStr, 10, 28, 11, '#FF6666');

      // Key indicator
      if (hasKey) {
        pixelText('KEY', W / 2, 28, 11, '#00CCFF', 'center');
      }

      // Info button
      g.strokeStyle = '#444466';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(W - 22, 22, 10, 0, Math.PI * 2); g.stroke();
      pixelText('i', W - 22, 14, 14, '#888899', 'center');
    }

    function drawPlatformTexture(x, y, w, h) {
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 0.5;
      const spacing = 6;
      for (let xi = x; xi < x + w; xi += spacing) {
        g.beginPath(); g.moveTo(xi, y); g.lineTo(xi, y + h); g.stroke();
      }
      for (let yi = y; yi < y + h; yi += spacing) {
        g.beginPath(); g.moveTo(x, yi); g.lineTo(x + w, yi); g.stroke();
      }
    }

    function drawSpike(x, y) {
      const n = 3;
      const sw = TW / n;
      g.fillStyle = '#FF4444';
      for (let i = 0; i < n; i++) {
        g.beginPath();
        g.moveTo(x + i * sw, y + TH);
        g.lineTo(x + i * sw + sw / 2, y + TH * 0.2);
        g.lineTo(x + (i + 1) * sw, y + TH);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = '#FF2222';
      g.lineWidth = 0.5;
      for (let i = 0; i < n; i++) {
        g.beginPath();
        g.moveTo(x + i * sw, y + TH);
        g.lineTo(x + i * sw + sw / 2, y + TH * 0.2);
        g.lineTo(x + (i + 1) * sw, y + TH);
        g.closePath();
        g.stroke();
      }
    }

    function drawGem(gem, tx, ty, now) {
      if (!gem.alive) return;
      const cx = tx + TW / 2, cy = ty + TH / 2;
      const r = TW * 0.28;
      const pulse = 0.85 + 0.15 * Math.sin(gem.sparkTimer);
      const colors = ['#FF5555', '#5599FF', '#55FF88'];
      const idx2 = (gem.col + gem.row) % 3;
      g.save();
      g.translate(cx, cy);
      g.scale(pulse, pulse);
      g.fillStyle = colors[idx2];
      g.shadowColor = colors[idx2];
      g.shadowBlur = 8;
      g.beginPath();
      g.moveTo(0, -r * 1.3);
      g.lineTo(r, 0);
      g.lineTo(0, r * 0.8);
      g.lineTo(-r, 0);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath();
      g.moveTo(-r * 0.3, -r * 0.7);
      g.lineTo(r * 0.2, -r * 0.2);
      g.lineTo(-r * 0.1, -r * 0.2);
      g.closePath();
      g.fill();
      g.restore();
    }

    function drawKey(kx, ky) {
      const cx = kx + TW / 2, cy = ky + TH / 2;
      g.save();
      g.strokeStyle = '#00CCFF';
      g.fillStyle = '#00CCFF';
      g.shadowColor = '#00CCFF';
      g.shadowBlur = 6;
      g.lineWidth = 2;
      // Circle head
      g.beginPath(); g.arc(cx - TW * 0.05, cy - TH * 0.1, TW * 0.2, 0, Math.PI * 2);
      g.stroke();
      // Shaft
      g.beginPath(); g.moveTo(cx + TW * 0.15, cy - TH * 0.1); g.lineTo(cx + TW * 0.35, cy - TH * 0.1); g.stroke();
      g.beginPath(); g.moveTo(cx + TW * 0.22, cy - TH * 0.1); g.lineTo(cx + TW * 0.22, cy + TH * 0.12); g.stroke();
      g.beginPath(); g.moveTo(cx + TW * 0.3, cy - TH * 0.1); g.lineTo(cx + TW * 0.3, cy + TH * 0.06); g.stroke();
      g.restore();
    }

    function drawDoor(dx, dy, open) {
      if (open) {
        g.strokeStyle = 'rgba(0,204,255,0.3)';
        g.lineWidth = 1;
        g.strokeRect(dx, dy, TW, TH);
        return;
      }
      g.fillStyle = '#1a3a5a';
      g.fillRect(dx, dy, TW, TH);
      g.strokeStyle = '#00CCFF';
      g.lineWidth = 1.5;
      g.strokeRect(dx + 1, dy + 1, TW - 2, TH - 2);
      // Keyhole
      g.fillStyle = '#00CCFF';
      g.beginPath(); g.arc(dx + TW / 2, dy + TH * 0.4, TW * 0.1, 0, Math.PI * 2); g.fill();
      g.beginPath();
      g.moveTo(dx + TW / 2 - TW * 0.07, dy + TH * 0.4);
      g.lineTo(dx + TW / 2 - TW * 0.04, dy + TH * 0.72);
      g.lineTo(dx + TW / 2 + TW * 0.04, dy + TH * 0.72);
      g.lineTo(dx + TW / 2 + TW * 0.07, dy + TH * 0.4);
      g.closePath(); g.fill();
    }

    function drawTreasure(tx2, ty2, tick) {
      const cx = tx2 + TW / 2, cy = ty2 + TH * 0.6;
      const glow = 8 + 4 * Math.sin(tick * 0.004);
      g.save();
      g.shadowColor = '#FFD740';
      g.shadowBlur = glow;
      // Chest body
      g.fillStyle = '#8B6914';
      roundRectC(g, tx2 + TW * 0.1, ty2 + TH * 0.35, TW * 0.8, TH * 0.55, 3);
      g.fill();
      // Lid
      g.fillStyle = '#A0791C';
      roundRectC(g, tx2 + TW * 0.08, ty2 + TH * 0.15, TW * 0.84, TH * 0.3, 3);
      g.fill();
      // Gold trim
      g.strokeStyle = '#FFD740';
      g.lineWidth = 1.5;
      roundRectC(g, tx2 + TW * 0.1, ty2 + TH * 0.35, TW * 0.8, TH * 0.55, 3);
      g.stroke();
      roundRectC(g, tx2 + TW * 0.08, ty2 + TH * 0.15, TW * 0.84, TH * 0.3, 3);
      g.stroke();
      // Lock
      g.fillStyle = '#FFD740';
      g.beginPath(); g.arc(cx, ty2 + TH * 0.48, TW * 0.1, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    function drawGuard(grd, tick) {
      if (!grd.alive) return;
      const cx = grd.x, cy = grd.y;
      const dir = grd.dir;
      const bob = Math.sin(tick * 0.01) * 1.5;

      g.save();
      g.fillStyle = '#cc3333';
      // Body
      g.fillRect(cx - TW * 0.25, cy + bob, TW * 0.5, TH * 0.55);
      // Head
      g.fillStyle = '#e07060';
      g.beginPath(); g.arc(cx, cy - TH * 0.08 + bob, TW * 0.22, 0, Math.PI * 2); g.fill();
      // Eyes (glow red)
      g.fillStyle = '#FF0000';
      g.shadowColor = '#FF0000'; g.shadowBlur = 4;
      g.fillRect(cx + dir * TW * 0.06 - 2, cy - TH * 0.1 + bob, 4, 3);
      g.shadowBlur = 0;
      // Weapon
      g.strokeStyle = '#888';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + dir * TW * 0.22, cy - TH * 0.15 + bob);
      g.lineTo(cx + dir * TW * 0.44, cy - TH * 0.42 + bob);
      g.stroke();
      g.restore();
    }

    function drawPlayer(p, tick) {
      if (p.deathTimer >= 0) {
        g.save();
        g.globalAlpha = p.deathAlpha;
        g.translate(p.x, p.y + p.h / 2);
        g.rotate(p.deathAngle);
        drawPlayerShape(0, -p.h / 2, p.dir, tick);
        g.restore();
        return;
      }
      drawPlayerShape(p.x, p.y, p.dir, tick);
    }

    function drawPlayerShape(px, py, dir, tick) {
      const bob = (player.onGround && (touchLeft || touchRight)) ? Math.sin(tick * 0.018) * 2 : 0;
      const pw = TW * 0.5;
      const ph = TH * 0.82;

      g.save();
      // Body
      g.fillStyle = '#4466cc';
      roundRectC(g, px - pw / 2, py + bob, pw, ph * 0.5, 2);
      g.fill();

      // Legs
      g.fillStyle = '#2244aa';
      if (touchLeft || touchRight) {
        const legPhase = Math.sin(tick * 0.018);
        g.fillRect(px - pw / 2, py + ph * 0.5 + bob, pw * 0.4, ph * 0.35 + legPhase * 3);
        g.fillRect(px + pw * 0.1, py + ph * 0.5 + bob, pw * 0.4, ph * 0.35 - legPhase * 3);
      } else {
        g.fillRect(px - pw / 2, py + ph * 0.5 + bob, pw * 0.4, ph * 0.35);
        g.fillRect(px + pw * 0.1, py + ph * 0.5 + bob, pw * 0.4, ph * 0.35);
      }

      // Head
      g.fillStyle = '#ffcc99';
      g.beginPath();
      g.arc(px, py - ph * 0.12 + bob, pw * 0.45, 0, Math.PI * 2);
      g.fill();

      // Eye
      g.fillStyle = '#111';
      g.fillRect(px + dir * pw * 0.12, py - ph * 0.15 + bob, 3, 3);

      // Sword
      g.strokeStyle = '#ccccee';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px + dir * pw * 0.3, py + ph * 0.08 + bob);
      g.lineTo(px + dir * pw * 0.7, py - ph * 0.22 + bob);
      g.stroke();
      // Sword hilt
      g.strokeStyle = '#aa8833';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(px + dir * pw * 0.22, py + ph * 0.16 + bob);
      g.lineTo(px + dir * pw * 0.48, py + ph * 0.16 + bob);
      g.stroke();

      g.restore();
    }

    // ── Main render ────────────────────────────────────────────────────
    let tick = 0;
    function render(dt) {
      tick += dt;
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);

      if (phase === 'title') {
        drawTitle();
        return;
      }
      if (phase === 'gameover') {
        drawGameOver();
        return;
      }
      if (phase === 'win') {
        drawWin();
        return;
      }

      // Draw tiles
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const t = dynamicTiles[r][c];
          const tx2 = tileX(c), ty2 = tileY(r);
          if (t === T.PLATFORM) {
            g.fillStyle = '#3a3a4a';
            g.fillRect(tx2, ty2, TW, TH);
            drawPlatformTexture(tx2, ty2, TW, TH);
            g.strokeStyle = '#555568';
            g.lineWidth = 0.5;
            g.strokeRect(tx2, ty2, TW, TH);
          } else if (t === T.CRUMBLE) {
            const key2 = `${r},${c}`;
            const ct = crumbleTiles[key2];
            const crumbleAlpha = ct && ct.state === 'crumbling'
              ? Math.max(0.15, 1 - ct.timer / 600)
              : ct && ct.state === 'gone' ? 0 : 1;
            if (crumbleAlpha > 0) {
              g.save();
              g.globalAlpha = crumbleAlpha;
              g.fillStyle = '#5a4a3a';
              g.fillRect(tx2, ty2, TW, TH);
              drawPlatformTexture(tx2, ty2, TW, TH);
              // Crack lines
              g.strokeStyle = '#FF9900';
              g.lineWidth = 0.7;
              g.beginPath(); g.moveTo(tx2 + TW * 0.2, ty2); g.lineTo(tx2 + TW * 0.5, ty2 + TH); g.stroke();
              g.beginPath(); g.moveTo(tx2 + TW * 0.6, ty2); g.lineTo(tx2 + TW * 0.3, ty2 + TH); g.stroke();
              g.restore();
            }
          } else if (t === T.SPIKE) {
            drawSpike(tx2, ty2);
          } else if (t === T.TREASURE) {
            drawTreasure(tx2, ty2, tick);
          } else if (t === T.DOOR) {
            const d = doors.find(dd => dd.col === c && dd.row === r);
            drawDoor(tx2, ty2, d ? d.open : false);
          }
        }
      }

      // Gems
      for (const gem of gems) {
        if (gem.alive) drawGem(gem, tileX(gem.col), tileY(gem.row), tick);
      }

      // Keys
      for (const key of keys) {
        if (key.alive) drawKey(tileX(key.col), tileY(key.row));
      }

      // Guards
      for (const grd of guards) {
        drawGuard(grd, tick);
      }

      // Player
      drawPlayer(player, tick);

      // Level win overlay
      if (phase === 'levelwin') {
        const alpha = Math.min(1, phaseTimer / 400);
        g.save();
        g.globalAlpha = alpha * 0.6;
        g.fillStyle = '#FFD740';
        g.fillRect(0, 0, W, H);
        g.restore();
        g.save();
        g.globalAlpha = alpha;
        pixelText('TREASURE FOUND!', W / 2, H / 2 - 30, 22, '#1a1a2a', 'center');
        pixelText(`+${500 + levelGems * 25}`, W / 2, H / 2 + 4, 18, '#1a1a2a', 'center');
        if (levelIdx < LEVELS.length - 1) {
          pixelText('Next level...', W / 2, H / 2 + 36, 14, '#3a3a5a', 'center');
        }
        g.restore();
      }

      // Dead overlay
      if (phase === 'dead') {
        const alpha = Math.min(0.6, phaseTimer / 600 * 0.6);
        g.save();
        g.globalAlpha = alpha;
        g.fillStyle = '#FF0000';
        g.fillRect(0, 0, W, H);
        g.restore();
        if (phaseTimer > 200) {
          g.save();
          g.globalAlpha = Math.min(1, (phaseTimer - 200) / 300);
          pixelText('YOU DIED', W / 2, H / 2 - 16, 24, '#fff', 'center');
          pixelText(`${lives - 1} lives left`, W / 2, H / 2 + 16, 14, '#ffaaaa', 'center');
          g.restore();
        }
      }

      drawHUD();
    }

    function drawTitle() {
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);

      // Stars
      g.fillStyle = 'rgba(255,255,255,0.5)';
      const starSeed = [3,17,29,41,53,7,19,31,43,5,11,23,37];
      for (let i = 0; i < 40; i++) {
        const sx = (starSeed[i % 13] * (i + 1) * 37) % W;
        const sy = (starSeed[i % 13] * (i + 3) * 59) % (H * 0.7);
        g.fillRect(sx, sy, 1 + (i % 2), 1 + (i % 2));
      }

      const cy = H * 0.28;
      g.save();
      g.shadowColor = '#FFD740'; g.shadowBlur = 20;
      pixelText('LOST', W / 2, cy, 42, '#FFD740', 'center');
      pixelText('TREASURE', W / 2, cy + 50, 36, '#FFD740', 'center');
      g.restore();

      pixelText('Puzzle Platformer', W / 2, cy + 100, 14, '#aaaacc', 'center');

      // Chest icon
      const cx2 = W / 2, chestY = H * 0.55;
      g.save();
      g.shadowColor = '#FFD740'; g.shadowBlur = 12 + 4 * Math.sin(tick * 0.003);
      g.fillStyle = '#8B6914';
      roundRectC(g, cx2 - 28, chestY, 56, 36, 4); g.fill();
      g.fillStyle = '#A0791C';
      roundRectC(g, cx2 - 30, chestY - 18, 60, 24, 4); g.fill();
      g.strokeStyle = '#FFD740'; g.lineWidth = 2;
      roundRectC(g, cx2 - 28, chestY, 56, 36, 4); g.stroke();
      roundRectC(g, cx2 - 30, chestY - 18, 60, 24, 4); g.stroke();
      g.fillStyle = '#FFD740';
      g.beginPath(); g.arc(cx2, chestY + 16, 7, 0, Math.PI * 2); g.fill();
      g.restore();

      const savedLevel = ctx.storage.get('ltLastLevel') || 0;
      if (savedLevel > 0) {
        pixelText(`Continue: Level ${savedLevel + 1}`, W / 2, H * 0.72, 13, '#88aacc', 'center');
        pixelText('Tap to continue', W / 2, H * 0.72 + 22, 11, '#556688', 'center');
        pixelText('Double-tap to restart', W / 2, H * 0.72 + 40, 11, '#556688', 'center');
      } else {
        pixelText('Tap to begin', W / 2, H * 0.76, 16, '#aaaacc', 'center');
      }

      pixelText(`Collected so far: ${ctx.storage.get('ltScore') || 0} pts`, W / 2, H - SAFE - 20, 11, '#555577', 'center');
    }

    function drawGameOver() {
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);
      g.save();
      g.shadowColor = '#FF4444'; g.shadowBlur = 18;
      pixelText('GAME OVER', W / 2, H * 0.3, 34, '#FF4444', 'center');
      g.restore();
      pixelText(`Score: ${totalScore}`, W / 2, H * 0.46, 18, '#FFD740', 'center');
      pixelText(`Level reached: ${levelIdx + 1}`, W / 2, H * 0.56, 14, '#aaaacc', 'center');
      pixelText('Tap to try again', W / 2, H * 0.7, 14, '#8888aa', 'center');
    }

    function drawWin() {
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);
      const pulse = 10 + 6 * Math.sin(tick * 0.003);
      g.save();
      g.shadowColor = '#FFD740'; g.shadowBlur = pulse;
      pixelText('YOU WIN!', W / 2, H * 0.22, 38, '#FFD740', 'center');
      g.restore();
      pixelText('All treasures found!', W / 2, H * 0.36, 15, '#ffffcc', 'center');
      pixelText(`Final Score: ${totalScore}`, W / 2, H * 0.48, 22, '#FFD740', 'center');
      pixelText('Tap to play again', W / 2, H * 0.68, 14, '#8888aa', 'center');
    }

    // ── Touch handling ─────────────────────────────────────────────────
    const activeTouches = {};

    function updateTouchState() {
      touchLeft = false; touchRight = false; touchJump = false;
      for (const id in activeTouches) {
        const tx2 = activeTouches[id].x;
        const ty2 = activeTouches[id].y;
        if (ty2 < HUD_H) continue; // ignore HUD area
        if (tx2 < LEFT_ZONE) touchLeft = true;
        else if (tx2 > RIGHT_ZONE) touchRight = true;
        else touchJump = true;
      }
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();

      const now2 = Date.now();
      for (const touch of e.changedTouches) {
        activeTouches[touch.identifier] = { x: touch.clientX, y: touch.clientY };
      }
      updateTouchState();

      // Double-tap detection for jump (anywhere)
      if (now2 - lastDoubleTap < 300) {
        touchJump = true;
        lastDoubleTap = 0;
      } else {
        lastDoubleTap = now2;
      }

      if (!started) {
        started = true;
        ctx.platform.start();
      }

      if (phase === 'title') {
        // Double-tap restarts from 0
        if (now2 - lastDoubleTap < 300 || e.changedTouches.length >= 2) {
          ctx.storage.set('ltLastLevel', 0);
          levelIdx = 0;
        }
        lives = 3; totalScore = 0;
        loadLevel(levelIdx);
        phase = 'play';
        return;
      }
      if (phase === 'gameover') {
        ctx.storage.set('ltLastLevel', 0);
        ctx.storage.set('ltScore', totalScore);
        levelIdx = 0; lives = 3; totalScore = 0;
        loadLevel(0);
        phase = 'play';
        return;
      }
      if (phase === 'win') {
        ctx.storage.set('ltLastLevel', 0);
        ctx.storage.set('ltScore', totalScore);
        levelIdx = 0; lives = 3; totalScore = 0;
        loadLevel(0);
        phase = 'play';
        return;
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (activeTouches[touch.identifier]) {
          activeTouches[touch.identifier] = { x: touch.clientX, y: touch.clientY };
        }
      }
      updateTouchState();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        delete activeTouches[touch.identifier];
      }
      updateTouchState();
    }, { passive: false });

    ctx.listen(canvas, 'touchcancel', (e) => {
      for (const touch of e.changedTouches) {
        delete activeTouches[touch.identifier];
      }
      updateTouchState();
    }, { passive: false });

    // ── Game loop ──────────────────────────────────────────────────────
    initGame();

    ctx.raf((dt) => {
      update(dt);
      render(dt);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
