window.plethoraBit = {
  meta: {
    title: 'Rez',
    author: 'plethora',
    description: 'Lock on. Destroy. Build the track.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ────────────────────────────────────────────────────────────
    let audioCtx = null;
    // Active looping layers
    const layers = [];

    function ensureAudio() {
      if (!audioCtx) {
        audioCtx = new AudioContext();
        ctx.onDestroy(() => {
          layers.forEach(l => { try { l.osc.stop(); } catch(_) {} });
          audioCtx.close();
        });
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Synth shot — brief laser-like tone
    function shot(freq) {
      if (!audioCtx) return;
      const now  = audioCtx.currentTime;
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * 2, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.1);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.15);
    }

    // Add a new looping synth layer (Rez's core mechanic)
    const LAYER_DEFS = [
      { freq: 55,    type: 'sine',     vol: 0.18, label: 'bass'    },
      { freq: 110,   type: 'square',   vol: 0.09, label: 'sub'     },
      { freq: 220,   type: 'sawtooth', vol: 0.07, label: 'lead'    },
      { freq: 440,   type: 'triangle', vol: 0.07, label: 'melody'  },
      { freq: 880,   type: 'sine',     vol: 0.05, label: 'shimmer' },
    ];

    function addLayer(idx) {
      if (!audioCtx || idx >= LAYER_DEFS.length) return;
      const def  = LAYER_DEFS[idx];
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = def.type;
      osc.frequency.value = def.freq;
      // Pulse the gain rhythmically using a slow LFO feel
      gain.gain.value = def.vol;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      layers.push({ osc, gain, def });
    }

    // ── Enemy helpers ─────────────────────────────────────────────────────
    let enemyId = 0;
    function makeEnemy(wave) {
      const angle  = Math.random() * Math.PI * 2;
      const dist   = Math.max(W, H) * 0.75;
      const sides  = 3 + Math.floor(Math.random() * 5);
      const speed  = 0.25 + wave * 0.08 + Math.random() * 0.15;
      return {
        id: enemyId++,
        x: W/2 + Math.cos(angle) * dist,
        y: H/2 + Math.sin(angle) * dist,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        r: 16 + Math.random() * 18,
        sides,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.02,
        hue: (angle / (Math.PI*2)) * 360,
        locked: false,
        lockTime: 0,
        alive: true,
      };
    }

    // ── State ─────────────────────────────────────────────────────────────
    const LOCK_TIME = 400;    // ms to hold lock before auto-fire
    const MAX_ENEMIES = 12;
    let enemies   = [];
    let kills     = 0;
    let wave      = 0;
    let particles = [];
    let started   = false;
    let touchPos  = null;

    function spawnWave() {
      const n = 4 + wave * 1;
      for (let i = 0; i < n; i++) enemies.push(makeEnemy(wave));
    }
    spawnWave();

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      ctx.platform.start();
      started = true;
      const t = e.changedTouches[0];
      touchPos = { x: t.clientX, y: t.clientY };
      lockNearest();
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchPos = { x: t.clientX, y: t.clientY };
      lockNearest();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      touchPos = null;
    }, { passive: false });

    function lockNearest() {
      if (!touchPos) return;
      let best = null, bestD = 80; // lock radius
      for (const en of enemies) {
        if (!en.alive) continue;
        const d = Math.hypot(en.x - touchPos.x, en.y - touchPos.y);
        if (d < bestD) { bestD = d; best = en; }
      }
      // Unlock all then lock best
      enemies.forEach(en => { if (en !== best) { en.locked = false; en.lockTime = 0; } });
      if (best && !best.locked) {
        best.locked = true;
        best.lockTime = 0;
      }
    }

    function destroyEnemy(en) {
      // Explosion particles
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
        const spd   = 2 + Math.random() * 4;
        particles.push({
          x: en.x, y: en.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 1.0,
          hue: en.hue,
          r: 2 + Math.random() * 4,
        });
      }
      shot(110 + kills * 55);
      ctx.platform.haptic('medium');
      ctx.platform.interact({ type: 'destroy' });
      kills++;
      ctx.platform.setScore(kills);

      // Add a new synth layer every 3 kills
      const layerIdx = Math.floor(kills / 3);
      if (kills % 3 === 0 && layerIdx <= LAYER_DEFS.length) addLayer(layerIdx - 1);

      en.alive = false;
    }

    // ── Polygon draw helper ───────────────────────────────────────────────
    function polygon(cx, cy, r, sides, rot) {
      g.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
    }

    // ── Render ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      const s = Math.min(dt, 32) / 16;

      g.fillStyle = '#020210';
      g.fillRect(0, 0, W, H);

      // Subtle grid
      g.strokeStyle = 'rgba(80,80,180,0.07)';
      g.lineWidth = 0.5;
      const gStep = W / 8;
      for (let x = 0; x < W; x += gStep) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += gStep) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

      // Centre target
      g.beginPath();
      g.arc(W/2, H/2, 12, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(100,100,255,0.3)';
      g.lineWidth = 1;
      g.stroke();

      // Update + draw enemies
      let living = 0;
      for (const en of enemies) {
        if (!en.alive) continue;
        living++;
        en.x += en.vx * s * 4;
        en.y += en.vy * s * 4;
        en.rot += en.rotV * s * 4;

        // Auto-fire when locked long enough
        if (en.locked) {
          en.lockTime += dt;
          if (en.lockTime >= LOCK_TIME) destroyEnemy(en);
        }

        // Pulse size when locked
        const pulse = en.locked ? 1 + 0.12 * Math.sin(Date.now() * 0.02) : 1;
        const er    = en.r * pulse;

        // Wireframe body
        polygon(en.x, en.y, er, en.sides, en.rot);
        g.strokeStyle = en.locked
          ? `hsla(${en.hue},90%,75%,0.95)`
          : `hsla(${en.hue},70%,60%,0.55)`;
        g.lineWidth = en.locked ? 2 : 1;
        g.stroke();

        // Inner filled polygon (dimmer)
        polygon(en.x, en.y, er * 0.55, en.sides, en.rot + Math.PI / en.sides);
        g.fillStyle = `hsla(${en.hue},60%,40%,0.2)`;
        g.fill();

        // Lock ring
        if (en.locked) {
          const progress = en.lockTime / LOCK_TIME;
          g.beginPath();
          g.arc(en.x, en.y, er + 6, -Math.PI/2, -Math.PI/2 + progress * Math.PI * 2);
          g.strokeStyle = `hsla(${en.hue},100%,85%,0.9)`;
          g.lineWidth = 2.5;
          g.stroke();

          // Glow
          g.save();
          g.shadowColor = `hsl(${en.hue},90%,70%)`;
          g.shadowBlur  = 12;
          polygon(en.x, en.y, er, en.sides, en.rot);
          g.strokeStyle = `hsla(${en.hue},90%,75%,0.6)`;
          g.lineWidth = 1.5;
          g.stroke();
          g.restore();
        }
      }

      // Respawn wave when all dead
      enemies = enemies.filter(e => e.alive);
      if (living === 0) { wave++; spawnWave(); }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * s * 4; p.y += p.vy * s * 4;
        p.vx *= Math.pow(0.92, s * 4); p.vy *= Math.pow(0.92, s * 4);
        p.life -= s * 0.025;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.beginPath();
        g.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        g.fillStyle = `hsla(${p.hue},90%,70%,${p.life})`;
        g.fill();
      }

      // Track layer indicator
      if (layers.length > 0) {
        const barW = W * 0.5, barH = 3;
        const bx   = (W - barW) / 2;
        const by   = H - ctx.safeArea.bottom - 20;
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(bx, by, barW, barH);
        g.fillStyle = `hsla(220,80%,70%,0.7)`;
        g.fillRect(bx, by, barW * (layers.length / LAYER_DEFS.length), barH);
      }

      if (!started) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.font = `300 ${W * 0.042}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('touch to lock on', W/2, H * 0.88);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
