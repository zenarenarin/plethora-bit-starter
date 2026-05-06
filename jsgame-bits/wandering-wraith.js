// WANDERING WRAITH — Guide the lost spirit home (Plethora Bit)

function roundRectC(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
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
    title: 'Wandering Wraith',
    author: 'plethora',
    description: 'Guide the spirit to rest.',
    tags: ['creative'],
    permissions: ['audio', 'haptics'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom || 0;
    const PLAY_H = H - SAFE;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ─── Audio (lazy) ──────────────────────────────────────────────────────────
    let audioCtx = null;
    let ambientOsc = null, ambientGain = null;
    let dangerOsc = null, dangerGain = null;
    let audioStarted = false;

    function ensureAudio() {
      if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
      audioCtx = new AudioContext();

      // Ambient haunting pad — quiet sine drone
      ambientOsc = audioCtx.createOscillator();
      ambientGain = audioCtx.createGain();
      ambientOsc.type = 'sine';
      ambientOsc.frequency.value = 80;
      ambientGain.gain.value = 0.05;
      ambientOsc.connect(ambientGain);
      ambientGain.connect(audioCtx.destination);
      ambientOsc.start();

      // Danger hum (silent until near vortex)
      dangerOsc = audioCtx.createOscillator();
      dangerGain = audioCtx.createGain();
      dangerOsc.type = 'sawtooth';
      dangerOsc.frequency.value = 55;
      dangerGain.gain.value = 0;
      dangerOsc.connect(dangerGain);
      dangerGain.connect(audioCtx.destination);
      dangerOsc.start();
    }

    function setDangerLevel(t) { // 0..1
      if (!audioCtx || !dangerGain) return;
      dangerGain.gain.setTargetAtTime(t * 0.06, audioCtx.currentTime, 0.3);
      if (dangerOsc) dangerOsc.frequency.setTargetAtTime(55 + t * 80, audioCtx.currentTime, 0.3);
    }

    function playTone(freq, type, dur, vol, freqEnd) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (freqEnd !== undefined) o.frequency.linearRampToValueAtTime(freqEnd, audioCtx.currentTime + dur);
      gn.gain.setValueAtTime(vol || 0.15, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }

    function playCandleChime() {
      // Warm ascending chime
      playTone(523, 'sine', 0.6, 0.12);
      setTimeout(() => playTone(659, 'sine', 0.5, 0.10), 80);
      setTimeout(() => playTone(784, 'sine', 0.7, 0.08), 160);
    }

    function playWraithCaptured() {
      // Mournful descending tone
      playTone(300, 'sine', 1.2, 0.10, 80);
      setTimeout(() => playTone(200, 'sine', 1.0, 0.07, 60), 200);
    }

    function playGatewayReached() {
      // Transcendent bell chord
      playTone(523, 'sine', 2.0, 0.12);
      setTimeout(() => playTone(659, 'sine', 2.0, 0.10), 60);
      setTimeout(() => playTone(784, 'sine', 2.0, 0.09), 120);
      setTimeout(() => playTone(1047, 'sine', 2.5, 0.08), 180);
      setTimeout(() => playTone(1319, 'sine', 2.0, 0.06), 300);
    }

    // ─── Stars ─────────────────────────────────────────────────────────────────
    const STARS = [];
    for (let i = 0; i < 120; i++) {
      STARS.push({
        x: Math.random() * W,
        y: Math.random() * PLAY_H,
        r: Math.random() * 1.2 + 0.3,
        bright: Math.random(),
        twinkleSpeed: Math.random() * 0.002 + 0.0005,
        twinkleOff: Math.random() * Math.PI * 2,
      });
    }

    // ─── Level definitions ─────────────────────────────────────────────────────
    // Each level: { vortexes, candles, demons }
    // Positions as fractions of W/PLAY_H, resolved at runtime
    const LEVEL_DEFS = [
      // Level 1 — Tutorial: one vortex, two candles, no demons
      {
        vortexes: [
          { fx: 0.5, fy: 0.55, r: 55 },
        ],
        candles: [
          { fx: 0.25, fy: 0.65 },
          { fx: 0.75, fy: 0.65 },
        ],
        demons: [],
      },
      // Level 2 — Two vortexes, three candles, one demon
      {
        vortexes: [
          { fx: 0.3, fy: 0.50, r: 60 },
          { fx: 0.7, fy: 0.60, r: 55 },
        ],
        candles: [
          { fx: 0.15, fy: 0.70 },
          { fx: 0.85, fy: 0.68 },
          { fx: 0.50, fy: 0.40 },
        ],
        demons: [
          { path: [{ fx: 0.15, fy: 0.35 }, { fx: 0.85, fy: 0.35 }], speed: 0.6 },
        ],
      },
      // Level 3 — Three vortexes, four candles, two demons
      {
        vortexes: [
          { fx: 0.2,  fy: 0.55, r: 58 },
          { fx: 0.8,  fy: 0.50, r: 62 },
          { fx: 0.50, fy: 0.35, r: 50 },
        ],
        candles: [
          { fx: 0.08, fy: 0.72 },
          { fx: 0.92, fy: 0.72 },
          { fx: 0.50, fy: 0.72 },
          { fx: 0.50, fy: 0.22 },
        ],
        demons: [
          { path: [{ fx: 0.10, fy: 0.44 }, { fx: 0.42, fy: 0.44 }], speed: 0.7 },
          { path: [{ fx: 0.58, fy: 0.44 }, { fx: 0.90, fy: 0.44 }], speed: 0.7 },
        ],
      },
      // Level 4 — Four vortexes, four candles, three demons
      {
        vortexes: [
          { fx: 0.15, fy: 0.60, r: 60 },
          { fx: 0.85, fy: 0.60, r: 60 },
          { fx: 0.35, fy: 0.38, r: 55 },
          { fx: 0.65, fy: 0.38, r: 55 },
        ],
        candles: [
          { fx: 0.50, fy: 0.75 },
          { fx: 0.08, fy: 0.42 },
          { fx: 0.92, fy: 0.42 },
          { fx: 0.50, fy: 0.22 },
        ],
        demons: [
          { path: [{ fx: 0.15, fy: 0.25 }, { fx: 0.85, fy: 0.25 }], speed: 0.75 },
          { path: [{ fx: 0.10, fy: 0.50 }, { fx: 0.45, fy: 0.50 }], speed: 0.65 },
          { path: [{ fx: 0.55, fy: 0.50 }, { fx: 0.90, fy: 0.50 }], speed: 0.65 },
        ],
      },
      // Level 5 — Gauntlet: five vortexes, five candles, four demons, gateway guarded
      {
        vortexes: [
          { fx: 0.20, fy: 0.68, r: 62 },
          { fx: 0.80, fy: 0.68, r: 62 },
          { fx: 0.20, fy: 0.42, r: 58 },
          { fx: 0.80, fy: 0.42, r: 58 },
          { fx: 0.50, fy: 0.26, r: 65 }, // gateway guard
        ],
        candles: [
          { fx: 0.50, fy: 0.80 },
          { fx: 0.08, fy: 0.58 },
          { fx: 0.92, fy: 0.58 },
          { fx: 0.08, fy: 0.30 },
          { fx: 0.92, fy: 0.30 },
        ],
        demons: [
          { path: [{ fx: 0.10, fy: 0.78 }, { fx: 0.90, fy: 0.78 }], speed: 0.8 },
          { path: [{ fx: 0.35, fy: 0.55 }, { fx: 0.65, fy: 0.55 }], speed: 0.9 },
          { path: [{ fx: 0.10, fy: 0.34 }, { fx: 0.40, fy: 0.34 }], speed: 1.0 },
          { path: [{ fx: 0.60, fy: 0.34 }, { fx: 0.90, fy: 0.34 }], speed: 1.0 },
        ],
      },
    ];

    // ─── Game state ────────────────────────────────────────────────────────────
    let levelIndex = 0;
    let gamePhase = 'play'; // 'play' | 'dying' | 'levelwin' | 'gamewon'

    let wraith = { x: W * 0.5, y: PLAY_H * 0.85, vx: 0, vy: 0 };
    let energy = 100;
    let targetX = wraith.x, targetY = wraith.y;
    let isDragging = false;
    let dragX = wraith.x, dragY = wraith.y;

    // Particle trail
    const TRAIL_COUNT = 20;
    const trail = [];
    for (let i = 0; i < TRAIL_COUNT; i++) {
      trail.push({ x: wraith.x, y: wraith.y, age: 1.0 });
    }
    let trailTimer = 0;

    // Level objects (resolved from defs)
    let vortexes = [];
    let candles = [];
    let demons = [];

    // Vortex particles (spinning spirals)
    const vortexParticles = [];

    // Gateway
    const GATEWAY_Y = PLAY_H * 0.08;
    const GATEWAY_W = 80;
    let gatewayPulse = 0;

    // HUD
    const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
    let showInfo = false;
    let deathTimer = 0;
    let winTimer = 0;
    let deathAlpha = 0;
    let winAlpha = 0;

    // ─── Build level ───────────────────────────────────────────────────────────
    function buildLevel(idx) {
      const def = LEVEL_DEFS[idx];
      vortexes = def.vortexes.map(v => ({
        x: v.fx * W,
        y: v.fy * PLAY_H,
        r: v.r,
        angle: Math.random() * Math.PI * 2,
        particles: [],
      }));

      candles = def.candles.map(c => ({
        x: c.fx * W,
        y: c.fy * PLAY_H,
        lit: false,
        flicker: Math.random() * Math.PI * 2,
      }));

      demons = def.demons.map(d => {
        const pts = d.path.map(p => ({ x: p.fx * W, y: p.fy * PLAY_H }));
        return {
          pts,
          speed: d.speed,
          t: 0,
          dir: 1,
          x: pts[0].x,
          y: pts[0].y,
          hitTimer: 0,
        };
      });

      // Spawn vortex particles
      vortexParticles.length = 0;
      vortexes.forEach((v, vi) => {
        for (let i = 0; i < 18; i++) {
          const angle = (i / 18) * Math.PI * 2;
          const dist = v.r * (0.3 + Math.random() * 0.7);
          vortexParticles.push({
            vi,
            angle,
            dist,
            angSpeed: 0.012 + Math.random() * 0.008,
            size: 2 + Math.random() * 3,
            alpha: 0.4 + Math.random() * 0.5,
          });
        }
      });

      // Reset wraith
      wraith.x = W * 0.5;
      wraith.y = PLAY_H * 0.85;
      wraith.vx = 0; wraith.vy = 0;
      targetX = wraith.x; targetY = wraith.y;
      energy = 100;
      gamePhase = 'play';
      deathAlpha = 0; winAlpha = 0;

      // Reset trail
      for (let i = 0; i < TRAIL_COUNT; i++) {
        trail[i].x = wraith.x;
        trail[i].y = wraith.y;
        trail[i].age = 1.0;
      }
    }

    buildLevel(0);

    // ─── Touch handling ────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!audioStarted) {
        audioStarted = true;
        ctx.platform.start();
      }

      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      // Info button tap
      const ibx = W - 22, iby = 22;
      if (Math.hypot(tx - ibx, ty - iby) < 18) {
        showInfo = !showInfo;
        ctx.platform.haptic('light');
        return;
      }
      if (showInfo) { showInfo = false; return; }

      isDragging = true;
      dragX = tx; dragY = ty;
      targetX = tx; targetY = ty;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!isDragging) return;
      dragX = e.changedTouches[0].clientX;
      dragY = e.changedTouches[0].clientY;
      targetX = dragX; targetY = dragY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      isDragging = false;
    }, { passive: false });

    // ─── Update ────────────────────────────────────────────────────────────────
    function update(dt) {
      const s = dt / 1000;
      gatewayPulse += s * 1.8;

      // Update stars twinkle (handled in draw)

      // Update candle flicker
      candles.forEach(c => { c.flicker += s * (2 + Math.random()); });

      // Update vortex particles
      vortexParticles.forEach(p => {
        p.angle += p.angSpeed;
      });
      vortexes.forEach(v => { v.angle += s * 0.6; });

      if (gamePhase === 'dying') {
        deathTimer -= s;
        deathAlpha = Math.max(0, 1 - deathTimer / 1.5);
        if (deathTimer <= 0) {
          buildLevel(levelIndex);
        }
        return;
      }
      if (gamePhase === 'levelwin') {
        winTimer -= s;
        winAlpha = Math.max(0, 1 - winTimer / 1.5);
        if (winTimer <= 0) {
          levelIndex = Math.min(levelIndex + 1, LEVEL_DEFS.length - 1);
          buildLevel(levelIndex);
        }
        return;
      }
      if (gamePhase === 'gamewon') {
        winTimer -= s;
        return;
      }

      // Move demons
      demons.forEach(d => {
        const a = d.pts[0], b = d.pts[d.pts.length - 1];
        // Advance t along path
        const pathLen = Math.hypot(b.x - a.x, b.y - a.y);
        const step = d.speed * 60 * s / pathLen;
        d.t += step * d.dir;
        if (d.t >= 1) { d.t = 1; d.dir = -1; }
        if (d.t <= 0) { d.t = 0; d.dir = 1; }
        d.x = a.x + (b.x - a.x) * d.t;
        d.y = a.y + (b.y - a.y) * d.t;
        if (d.hitTimer > 0) d.hitTimer -= s;
      });

      // Wraith movement — lerp toward target if dragging
      if (isDragging) {
        const LERP = 0.04;
        wraith.vx = (targetX - wraith.x) * LERP;
        wraith.vy = (targetY - wraith.y) * LERP;
      } else {
        wraith.vx *= 0.85;
        wraith.vy *= 0.85;
      }

      // Vortex pull
      let dangerLevel = 0;
      let inSafeZone = false;

      // Check candle safe zones
      candles.forEach(c => {
        if (c.lit) {
          const d2 = Math.hypot(wraith.x - c.x, wraith.y - c.y);
          if (d2 < 50) inSafeZone = true;
        }
      });

      vortexes.forEach(v => {
        const dx = v.x - wraith.x;
        const dy = v.y - wraith.y;
        const dist = Math.hypot(dx, dy);
        if (dist < v.r * 2.5) {
          const danger = 1 - dist / (v.r * 2.5);
          dangerLevel = Math.max(dangerLevel, danger);
          if (!inSafeZone) {
            const force = 80 / Math.max(dist, 20);
            wraith.vx += (dx / dist) * force * s;
            wraith.vy += (dy / dist) * force * s;
          }
        }
      });

      setDangerLevel(dangerLevel);

      // Apply velocity
      wraith.x += wraith.vx;
      wraith.y += wraith.vy;

      // Clamp to play area (above safe zone, below HUD)
      wraith.x = Math.max(12, Math.min(W - 12, wraith.x));
      wraith.y = Math.max(48 + 12, Math.min(PLAY_H - 12, wraith.y));

      // Energy: drain in vortex, recover in candle zone
      if (!inSafeZone && dangerLevel > 0.15) {
        energy -= 100 * dangerLevel * s;
      } else if (inSafeZone) {
        energy = Math.min(100, energy + 50 * s);
      }

      // Demon collision
      demons.forEach(d => {
        if (d.hitTimer > 0) return;
        const dist = Math.hypot(wraith.x - d.x, wraith.y - d.y);
        if (dist < 28) {
          energy -= 30;
          d.hitTimer = 1.5;
          ctx.platform.haptic('heavy');
          if (audioCtx) playTone(120, 'sawtooth', 0.4, 0.08, 60);
        }
      });

      // Candle lighting
      candles.forEach(c => {
        if (!c.lit) {
          const dist = Math.hypot(wraith.x - c.x, wraith.y - c.y);
          if (dist < 22) {
            c.lit = true;
            ctx.platform.haptic('medium');
            playCandleChime();
          }
        }
      });

      // Trail
      trailTimer += dt;
      if (trailTimer > 30) {
        trailTimer = 0;
        trail.shift();
        trail.push({ x: wraith.x, y: wraith.y, age: 0 });
      }
      trail.forEach((p, i) => { p.age = i / TRAIL_COUNT; });

      // Energy death
      energy = Math.max(0, energy);
      if (energy <= 0) {
        gamePhase = 'dying';
        deathTimer = 1.8;
        deathAlpha = 0;
        ctx.platform.haptic('heavy');
        playWraithCaptured();
        ctx.platform.fail({ reason: 'spirit_dissipated' });
        return;
      }

      // Gateway check
      const gateDist = Math.hypot(wraith.x - W * 0.5, wraith.y - GATEWAY_Y);
      if (gateDist < 45) {
        if (levelIndex === LEVEL_DEFS.length - 1) {
          gamePhase = 'gamewon';
          winTimer = 3.5;
          ctx.platform.haptic('heavy');
          playGatewayReached();
          ctx.platform.complete({ score: Math.round(energy), result: 'transcended', durationMs: 0 });
        } else {
          gamePhase = 'levelwin';
          winTimer = 1.6;
          winAlpha = 0;
          ctx.platform.haptic('medium');
          playGatewayReached();
        }
      }

      // Progress
      const prog = 1 - (wraith.y - GATEWAY_Y) / (PLAY_H * 0.85 - GATEWAY_Y);
      ctx.platform.setProgress(Math.max(0, Math.min(1, prog)));
    }

    // ─── Draw helpers ──────────────────────────────────────────────────────────
    function drawGlow(gCtx, x, y, r, color, alpha) {
      const grad = gCtx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color.replace(')', `,${alpha})`).replace('rgb', 'rgba'));
      grad.addColorStop(1, color.replace(')', ',0)').replace('rgb', 'rgba'));
      gCtx.fillStyle = grad;
      gCtx.beginPath();
      gCtx.arc(x, y, r, 0, Math.PI * 2);
      gCtx.fill();
    }

    function drawGlowSimple(gCtx, x, y, r, color, alpha) {
      const grad = gCtx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${color},${alpha})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      gCtx.fillStyle = grad;
      gCtx.beginPath();
      gCtx.arc(x, y, r, 0, Math.PI * 2);
      gCtx.fill();
    }

    // ─── Draw ──────────────────────────────────────────────────────────────────
    function draw(t) {
      // Background
      g.fillStyle = '#0a0614';
      g.fillRect(0, 0, W, H);

      // Star field
      STARS.forEach(s => {
        const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinkleOff));
        g.save();
        g.shadowColor = '#aabbff';
        g.shadowBlur = s.r * 3;
        g.globalAlpha = twinkle * 0.8;
        g.fillStyle = '#c8d8ff';
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fill();
        g.restore();
      });

      // Subtle nebula clouds
      g.save();
      g.globalAlpha = 0.04;
      const neb1 = g.createRadialGradient(W * 0.3, PLAY_H * 0.4, 0, W * 0.3, PLAY_H * 0.4, W * 0.5);
      neb1.addColorStop(0, '#4422aa');
      neb1.addColorStop(1, 'transparent');
      g.fillStyle = neb1;
      g.fillRect(0, 0, W, PLAY_H);
      const neb2 = g.createRadialGradient(W * 0.75, PLAY_H * 0.6, 0, W * 0.75, PLAY_H * 0.6, W * 0.4);
      neb2.addColorStop(0, '#221155');
      neb2.addColorStop(1, 'transparent');
      g.fillStyle = neb2;
      g.fillRect(0, 0, W, PLAY_H);
      g.restore();

      // ── Gateway ──
      const gp = 0.5 + 0.5 * Math.sin(gatewayPulse);
      const gx = W * 0.5, gy = GATEWAY_Y;
      g.save();
      // Outer glow
      g.shadowColor = '#fffacc';
      g.shadowBlur = 30 + gp * 20;
      // Arc
      const archW = GATEWAY_W;
      const archH = 55;
      g.lineWidth = 4 + gp * 2;
      const archGrad = g.createLinearGradient(gx - archW / 2, gy, gx + archW / 2, gy);
      archGrad.addColorStop(0, '#ffee88');
      archGrad.addColorStop(0.5, '#ffffff');
      archGrad.addColorStop(1, '#ffee88');
      g.strokeStyle = archGrad;
      g.beginPath();
      g.moveTo(gx - archW / 2, gy + archH * 0.5);
      g.lineTo(gx - archW / 2, gy);
      g.arc(gx, gy, archW / 2, Math.PI, 0, false);
      g.lineTo(gx + archW / 2, gy + archH * 0.5);
      g.stroke();
      // Inner fill shimmer
      g.globalAlpha = 0.15 + 0.1 * gp;
      const shimGrad = g.createRadialGradient(gx, gy, 0, gx, gy, archW * 0.6);
      shimGrad.addColorStop(0, '#ffffee');
      shimGrad.addColorStop(1, 'transparent');
      g.fillStyle = shimGrad;
      g.beginPath();
      g.arc(gx, gy, archW * 0.6, 0, Math.PI * 2);
      g.fill();
      g.restore();

      // ── Candle safe zones ──
      candles.forEach(c => {
        if (!c.lit) return;
        g.save();
        g.globalAlpha = 0.12;
        const safeGrad = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, 50);
        safeGrad.addColorStop(0, '#ffaa44');
        safeGrad.addColorStop(1, 'transparent');
        g.fillStyle = safeGrad;
        g.beginPath();
        g.arc(c.x, c.y, 50, 0, Math.PI * 2);
        g.fill();
        g.restore();
      });

      // ── Vortexes ──
      vortexes.forEach((v) => {
        g.save();
        // Dark halo
        g.globalAlpha = 0.35;
        const vGrad = g.createRadialGradient(v.x, v.y, 0, v.x, v.y, v.r * 1.6);
        vGrad.addColorStop(0, '#550000');
        vGrad.addColorStop(0.5, '#220011');
        vGrad.addColorStop(1, 'transparent');
        g.fillStyle = vGrad;
        g.beginPath();
        g.arc(v.x, v.y, v.r * 1.6, 0, Math.PI * 2);
        g.fill();
        g.restore();

        // Spinning spiral strokes
        g.save();
        g.globalAlpha = 0.55;
        g.shadowColor = '#aa0022';
        g.shadowBlur = 8;
        g.strokeStyle = '#880011';
        g.lineWidth = 1.5;
        for (let arm = 0; arm < 3; arm++) {
          g.beginPath();
          const armAngle = v.angle + (arm / 3) * Math.PI * 2;
          for (let step = 0; step <= 40; step++) {
            const frac = step / 40;
            const a = armAngle + frac * Math.PI * 3;
            const r2 = frac * v.r;
            const px = v.x + Math.cos(a) * r2;
            const py = v.y + Math.sin(a) * r2;
            if (step === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.stroke();
        }
        g.restore();
      });

      // Vortex particles
      vortexParticles.forEach(p => {
        const v = vortexes[p.vi];
        const px = v.x + Math.cos(p.angle) * p.dist;
        const py = v.y + Math.sin(p.angle) * p.dist;
        g.save();
        g.globalAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.angle * 3));
        g.shadowColor = '#cc1122';
        g.shadowBlur = 5;
        g.fillStyle = '#661122';
        g.beginPath();
        g.arc(px, py, p.size * 0.5, 0, Math.PI * 2);
        g.fill();
        g.restore();
      });

      // ── Candles ──
      candles.forEach(c => {
        const flick = 0.85 + 0.15 * Math.sin(c.flicker * 7.3 + t * 0.01);
        const h = 18 * flick;

        g.save();
        // Candle body
        g.shadowColor = c.lit ? '#ffaa44' : '#443322';
        g.shadowBlur = c.lit ? 14 : 4;
        g.fillStyle = c.lit ? '#e8c080' : '#553322';
        roundRectC(g, c.x - 5, c.y + 4, 10, 18, 2);
        g.fill();

        // Wick
        g.strokeStyle = '#222';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(c.x, c.y + 4);
        g.lineTo(c.x, c.y + 2);
        g.stroke();

        if (c.lit) {
          // Flame outer
          g.globalAlpha = 0.8;
          const flameGrad = g.createRadialGradient(c.x, c.y - h * 0.3, 0, c.x, c.y, h);
          flameGrad.addColorStop(0, '#ffffff');
          flameGrad.addColorStop(0.3, '#ffcc44');
          flameGrad.addColorStop(0.7, '#ff6600');
          flameGrad.addColorStop(1, 'transparent');
          g.fillStyle = flameGrad;
          g.beginPath();
          g.ellipse(c.x, c.y - h * 0.3, 7 * flick, h, 0, 0, Math.PI * 2);
          g.fill();

          // Flame inner white
          g.globalAlpha = 0.9;
          g.fillStyle = '#fffde0';
          g.beginPath();
          g.ellipse(c.x, c.y - h * 0.2, 3 * flick, h * 0.4, 0, 0, Math.PI * 2);
          g.fill();
        } else {
          // Unlit smoke wisps
          g.globalAlpha = 0.2;
          g.strokeStyle = '#aaaaaa';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(c.x, c.y + 2);
          g.bezierCurveTo(c.x + 4, c.y - 5, c.x - 3, c.y - 12, c.x + 2, c.y - 18);
          g.stroke();
        }
        g.restore();

        // Candle label
        g.save();
        g.globalAlpha = 0.5;
        g.fillStyle = '#ffcc88';
        g.font = '10px serif';
        g.textAlign = 'center';
        g.fillText(c.lit ? '✦' : '○', c.x, c.y + 36);
        g.restore();
      });

      // ── Demon shadows ──
      demons.forEach(d => {
        g.save();
        const blinking = d.hitTimer > 0 && (Math.floor(d.hitTimer * 8) % 2 === 0);
        g.globalAlpha = blinking ? 0.3 : 0.85;
        g.shadowColor = '#660022';
        g.shadowBlur = 16;
        // Angular shadow shape
        g.fillStyle = '#1a0008';
        g.strokeStyle = '#880022';
        g.lineWidth = 1.5;
        const sz = 22;
        g.translate(d.x, d.y);
        const rot = Math.atan2(d.dir === 1 ? d.pts[1].y - d.pts[0].y : d.pts[0].y - d.pts[1].y,
                               d.dir === 1 ? d.pts[1].x - d.pts[0].x : d.pts[0].x - d.pts[1].x);
        g.rotate(rot);
        g.beginPath();
        g.moveTo(sz, 0);
        g.lineTo(-sz * 0.6, -sz * 0.7);
        g.lineTo(-sz * 0.3, 0);
        g.lineTo(-sz * 0.6, sz * 0.7);
        g.closePath();
        g.fill();
        g.stroke();
        // Eyes
        g.globalAlpha = 1;
        g.fillStyle = '#ff2244';
        g.shadowColor = '#ff0000';
        g.shadowBlur = 6;
        g.beginPath(); g.arc(-2, -6, 3, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(-2, 6, 3, 0, Math.PI * 2); g.fill();
        g.restore();
      });

      // ── Wraith trail ──
      trail.forEach((p, i) => {
        const alpha = (i / TRAIL_COUNT) * 0.5;
        const radius = 6 + (i / TRAIL_COUNT) * 4;
        drawGlowSimple(g, p.x, p.y, radius * 2, '140,180,255', alpha * 0.6);
        g.save();
        g.globalAlpha = alpha * 0.4;
        g.fillStyle = '#8ab0ff';
        g.beginPath();
        g.arc(p.x, p.y, radius * 0.4, 0, Math.PI * 2);
        g.fill();
        g.restore();
      });

      // ── Wraith ──
      if (gamePhase !== 'dying') {
        const energyFrac = energy / 100;
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.004);
        const wx = wraith.x, wy = wraith.y;

        // Outer aura
        g.save();
        g.globalAlpha = 0.12 + 0.08 * pulse;
        drawGlowSimple(g, wx, wy, 55, '180,200,255', 1);
        g.restore();

        // Mid glow
        g.save();
        g.globalAlpha = energyFrac * (0.35 + 0.15 * pulse);
        drawGlowSimple(g, wx, wy, 30, '160,190,255', 1);
        g.restore();

        // Core body — translucent wisp
        g.save();
        g.shadowColor = '#aaccff';
        g.shadowBlur = 18 + pulse * 8;
        g.globalAlpha = 0.65 + 0.15 * energyFrac;
        const bodyGrad = g.createRadialGradient(wx, wy - 4, 0, wx, wy, 14);
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.4, '#ccdeff');
        bodyGrad.addColorStop(1, 'rgba(150,190,255,0)');
        g.fillStyle = bodyGrad;
        g.beginPath();
        // Teardrop shape
        g.moveTo(wx, wy - 14);
        g.bezierCurveTo(wx + 10, wy - 8, wx + 10, wy + 6, wx, wy + 12);
        g.bezierCurveTo(wx - 10, wy + 6, wx - 10, wy - 8, wx, wy - 14);
        g.fill();

        // Eyes — two soft dots
        g.globalAlpha = 0.5 + 0.2 * pulse;
        g.fillStyle = '#88bbff';
        g.shadowBlur = 4;
        g.shadowColor = '#aaddff';
        g.beginPath(); g.arc(wx - 4, wy - 2, 2.5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(wx + 4, wy - 2, 2.5, 0, Math.PI * 2); g.fill();

        // Spectral wisps floating around
        for (let w2 = 0; w2 < 4; w2++) {
          const wAngle = t * 0.002 * (w2 % 2 === 0 ? 1 : -1) + (w2 / 4) * Math.PI * 2;
          const wDist = 16 + 4 * Math.sin(t * 0.003 + w2);
          const wpx = wx + Math.cos(wAngle) * wDist;
          const wpy = wy + Math.sin(wAngle) * wDist * 0.5;
          g.globalAlpha = 0.25 * energyFrac;
          g.fillStyle = '#b8d0ff';
          g.shadowBlur = 6;
          g.beginPath();
          g.arc(wpx, wpy, 3, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();

        // Energy flicker — low energy = red tinge
        if (energyFrac < 0.35) {
          const danger = 1 - energyFrac / 0.35;
          g.save();
          g.globalAlpha = danger * 0.4 * (0.5 + 0.5 * Math.sin(t * 0.02));
          drawGlowSimple(g, wx, wy, 30, '255,60,60', 1);
          g.restore();
        }
      } else {
        // Dying animation — expand and fade
        const frac = 1 - deathTimer / 1.8;
        g.save();
        g.globalAlpha = Math.max(0, 1 - frac * 1.2);
        const driftR = 20 + frac * 60;
        drawGlowSimple(g, wraith.x, wraith.y, driftR, '200,200,255', 1);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const pr = frac * 50;
          g.globalAlpha = Math.max(0, (1 - frac) * 0.6);
          g.fillStyle = '#aabbff';
          g.beginPath();
          g.arc(wraith.x + Math.cos(a) * pr, wraith.y + Math.sin(a) * pr, 3, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }

      // ── HUD ──
      const HUD_H = 48;

      // HUD background
      g.save();
      g.globalAlpha = 0.75;
      const hudGrad = g.createLinearGradient(0, 0, 0, HUD_H);
      hudGrad.addColorStop(0, '#0d091e');
      hudGrad.addColorStop(1, 'rgba(10,6,20,0)');
      g.fillStyle = hudGrad;
      g.fillRect(0, 0, W, HUD_H);
      g.restore();

      // Level
      g.save();
      g.font = 'bold 16px serif';
      g.fillStyle = '#ccd0ff';
      g.shadowColor = '#8899ff';
      g.shadowBlur = 8;
      g.textAlign = 'left';
      g.fillText(`Level ${ROMAN[levelIndex]}`, 16, 30);
      g.restore();

      // Candles lit
      const litCount = candles.filter(c => c.lit).length;
      g.save();
      g.font = '13px serif';
      g.fillStyle = '#ffcc88';
      g.shadowColor = '#ffaa44';
      g.shadowBlur = 6;
      g.textAlign = 'center';
      g.fillText(`✦ ${litCount}/${candles.length}`, W * 0.5, 28);
      g.restore();

      // Energy bar
      const barW = 80, barH = 8;
      const barX = W - 16 - barW - 20, barY = 20;
      g.save();
      g.globalAlpha = 0.6;
      g.fillStyle = '#221133';
      roundRectC(g, barX, barY, barW, barH, 4);
      g.fill();
      const eFrac = energy / 100;
      const eColor = eFrac > 0.5 ? '#66aaff' : eFrac > 0.25 ? '#ffaa22' : '#ff4422';
      g.globalAlpha = 0.9;
      g.shadowColor = eColor;
      g.shadowBlur = 6;
      g.fillStyle = eColor;
      roundRectC(g, barX, barY, barW * eFrac, barH, 4);
      g.fill();
      g.globalAlpha = 0.5;
      g.strokeStyle = '#446688';
      g.lineWidth = 1;
      roundRectC(g, barX, barY, barW, barH, 4);
      g.stroke();
      g.restore();

      // Info button
      g.save();
      g.globalAlpha = 0.7;
      g.fillStyle = '#221133';
      g.strokeStyle = '#8877aa';
      g.lineWidth = 1.5;
      g.shadowColor = '#9988bb';
      g.shadowBlur = 5;
      g.beginPath();
      g.arc(W - 22, 22, 14, 0, Math.PI * 2);
      g.fill(); g.stroke();
      g.fillStyle = '#ccbbff';
      g.font = 'bold 14px serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowBlur = 0;
      g.fillText('i', W - 22, 23);
      g.restore();

      // ── Info overlay ──
      if (showInfo) {
        g.save();
        g.globalAlpha = 0.88;
        g.fillStyle = '#0a0614';
        roundRectC(g, W * 0.08, PLAY_H * 0.2, W * 0.84, PLAY_H * 0.55, 18);
        g.fill();
        g.strokeStyle = '#6655aa';
        g.lineWidth = 1.5;
        g.globalAlpha = 0.6;
        roundRectC(g, W * 0.08, PLAY_H * 0.2, W * 0.84, PLAY_H * 0.55, 18);
        g.stroke();
        g.restore();

        g.save();
        g.globalAlpha = 1;
        g.textAlign = 'center';
        g.fillStyle = '#e8e0ff';
        g.font = 'bold 17px serif';
        g.fillText('The Wandering Wraith', W * 0.5, PLAY_H * 0.28);
        g.fillStyle = '#b0a8cc';
        g.font = '13px serif';
        const lines = [
          'Drag your finger to guide the spirit.',
          'Light candles for safe sanctuary.',
          'Avoid dark vortexes — they drain your',
          'energy. Demon shadows deal instant damage.',
          'Reach the golden gateway to ascend.',
        ];
        lines.forEach((ln, i) => {
          g.fillText(ln, W * 0.5, PLAY_H * 0.36 + i * 20);
        });
        g.fillStyle = '#ffcc88';
        g.font = '12px serif';
        g.fillText('tap anywhere to close', W * 0.5, PLAY_H * 0.70);
        g.restore();
      }

      // ── Level win flash ──
      if (gamePhase === 'levelwin') {
        g.save();
        g.globalAlpha = Math.min(0.6, winAlpha * 0.7);
        g.fillStyle = '#ffffcc';
        g.fillRect(0, 0, W, H);
        g.restore();
        g.save();
        g.globalAlpha = Math.min(1, winAlpha * 2);
        g.textAlign = 'center';
        g.fillStyle = '#fff8cc';
        g.font = 'bold 26px serif';
        g.shadowColor = '#ffee44';
        g.shadowBlur = 20;
        g.fillText('The spirit advances…', W * 0.5, PLAY_H * 0.5);
        g.restore();
      }

      // ── Death overlay ──
      if (gamePhase === 'dying') {
        g.save();
        g.globalAlpha = Math.min(0.5, deathAlpha * 0.5);
        g.fillStyle = '#220000';
        g.fillRect(0, 0, W, H);
        g.globalAlpha = Math.min(1, deathAlpha * 1.5);
        g.textAlign = 'center';
        g.fillStyle = '#ff7766';
        g.font = 'bold 22px serif';
        g.shadowColor = '#cc3322';
        g.shadowBlur = 16;
        g.fillText('The spirit dissipates…', W * 0.5, PLAY_H * 0.5);
        g.restore();
      }

      // ── Game won ──
      if (gamePhase === 'gamewon') {
        const fadeIn = Math.min(1, (3.5 - winTimer) / 1.5);
        g.save();
        g.globalAlpha = fadeIn * 0.85;
        const gwGrad = g.createRadialGradient(W * 0.5, PLAY_H * 0.4, 0, W * 0.5, PLAY_H * 0.4, W * 0.7);
        gwGrad.addColorStop(0, '#ffffe0');
        gwGrad.addColorStop(0.5, '#ffffcc88');
        gwGrad.addColorStop(1, 'rgba(10,6,20,0.9)');
        g.fillStyle = gwGrad;
        g.fillRect(0, 0, W, H);
        g.restore();

        g.save();
        g.globalAlpha = fadeIn;
        g.textAlign = 'center';
        g.fillStyle = '#fffde8';
        g.font = 'bold 28px serif';
        g.shadowColor = '#ffe866';
        g.shadowBlur = 24;
        g.fillText('The spirit finds rest.', W * 0.5, PLAY_H * 0.42);
        g.fillStyle = '#ccbbff';
        g.font = '16px serif';
        g.shadowBlur = 8;
        g.shadowColor = '#9988cc';
        g.fillText('All five lights, all five levels.', W * 0.5, PLAY_H * 0.52);
        g.fillText('Rest now, wanderer.', W * 0.5, PLAY_H * 0.60);
        g.restore();
      }

      // ── Safe-zone bottom barrier (visual) ──
      if (SAFE > 0) {
        g.save();
        g.globalAlpha = 0.18;
        g.fillStyle = '#110a22';
        g.fillRect(0, PLAY_H, W, SAFE);
        g.restore();
      }
    }

    // ─── Main loop ─────────────────────────────────────────────────────────────
    let elapsed = 0;
    ctx.raf((dt) => {
      elapsed += dt;
      update(dt);
      draw(elapsed);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
