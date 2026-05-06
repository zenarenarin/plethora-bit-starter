window.plethoraBit = {
  meta: {
    title: 'Garden',
    author: 'plethora',
    description: 'Touch to grow flowers. Touch again to burst them.',
    tags: ['creative'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) {
        audioCtx = new AudioContext();
        ctx.onDestroy(() => audioCtx.close());
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Pentatonic — C major
    const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00,
                   523.25, 587.33, 659.25, 783.99, 880.00];

    // Soft harp pluck on bloom
    function harp(freq) {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      [[1, 0.22], [2, 0.08], [3, 0.03]].forEach(([h, vol]) => {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * h;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5 / h);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 3.5 / h + 0.05);
      });
    }

    // Burst shimmer
    function shimmer(freq) {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      for (let i = 0; i < 5; i++) {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const t    = now + i * 0.06;
        osc.type = 'sine';
        osc.frequency.value = freq * (1 + i * 0.5);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t); osc.stop(t + 0.55);
      }
    }

    // ── Flower & petal helpers ────────────────────────────────────────────
    let flowerPad = 0;
    function makeFlower(x, y) {
      const noteIdx = flowerPad % SCALE.length;
      flowerPad++;
      return {
        x, y,
        hue: Math.random() * 360,
        note: SCALE[noteIdx],
        age: 0,         // 0 → 1 (growth)
        maxAge: 1,
        petals: 5 + Math.floor(Math.random() * 4),
        size: W * 0.065 + Math.random() * W * 0.04,
        alive: true,
      };
    }

    function makePetal(x, y, hue, angle) {
      const spd = 1.5 + Math.random() * 3;
      return {
        x, y, hue,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 1.5,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.15,
        life: 1.0,
        size: 4 + Math.random() * 8,
      };
    }

    // ── State ─────────────────────────────────────────────────────────────
    const MAX_FLOWERS = 14;
    let flowers = [];
    let petals  = [];

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      ctx.platform.start();

      const t  = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // Check if touching an existing flower
      let hit = false;
      for (let i = flowers.length - 1; i >= 0; i--) {
        const f = flowers[i];
        if (!f.alive) continue;
        const dx = tx - f.x, dy = ty - f.y;
        if (f.age >= 0.8 && Math.sqrt(dx*dx + dy*dy) < f.size * 1.2) {
          // Burst into petals
          const n = f.petals * 4;
          for (let j = 0; j < n; j++) {
            const angle = (j / n) * Math.PI * 2 + Math.random() * 0.3;
            petals.push(makePetal(f.x, f.y, f.hue, angle));
          }
          shimmer(f.note);
          ctx.platform.haptic('medium');
          ctx.platform.interact({ type: 'burst' });
          flowers.splice(i, 1);
          hit = true;
          break;
        }
      }

      if (!hit) {
        if (flowers.length >= MAX_FLOWERS) flowers.shift();
        const f = makeFlower(tx, ty);
        flowers.push(f);
        harp(f.note);
        ctx.platform.haptic('light');
        ctx.platform.interact({ type: 'bloom' });
      }
    }, { passive: false });

    // Draw a single flower at a given growth fraction
    function drawFlower(f) {
      const t    = Math.min(1, f.age);
      const sz   = f.size * t;
      const stemH = sz * 1.8 * t;

      g.save();
      g.translate(f.x, f.y);

      // Stem
      const stemAlpha = Math.min(1, t * 2);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(sz * 0.15, -stemH * 0.5, 0, -stemH);
      g.strokeStyle = `hsla(120,50%,38%,${stemAlpha * 0.85})`;
      g.lineWidth = Math.max(1, sz * 0.07);
      g.lineCap = 'round';
      g.stroke();

      if (t > 0.3) {
        const petalT = Math.min(1, (t - 0.3) / 0.7);
        g.translate(0, -stemH);

        // Petals
        for (let i = 0; i < f.petals; i++) {
          const angle = (i / f.petals) * Math.PI * 2;
          const px = Math.cos(angle) * sz * 0.55 * petalT;
          const py = Math.sin(angle) * sz * 0.55 * petalT;
          g.beginPath();
          g.ellipse(px, py, sz * 0.28 * petalT, sz * 0.18 * petalT, angle, 0, Math.PI * 2);
          g.fillStyle = `hsla(${f.hue},75%,70%,${petalT * 0.85})`;
          g.fill();
          g.strokeStyle = `hsla(${f.hue},80%,80%,${petalT * 0.4})`;
          g.lineWidth = 0.8;
          g.stroke();
        }

        // Centre
        g.beginPath();
        g.arc(0, 0, sz * 0.18 * petalT, 0, Math.PI * 2);
        g.fillStyle = `hsla(${(f.hue + 40) % 360},80%,75%,${petalT * 0.9})`;
        g.fill();
      }

      g.restore();
    }

    // ── Render ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      const s = Math.min(dt, 32) / 16;

      // Deep blue-black sky
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#03021a');
      bg.addColorStop(1, '#000510');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // Subtle ground line
      g.fillStyle = 'rgba(60,120,60,0.08)';
      g.fillRect(0, H * 0.9, W, H * 0.1);

      if (!flowers.length && !petals.length) {
        g.fillStyle = 'rgba(255,255,255,0.32)';
        g.font = `300 ${W * 0.042}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('touch to grow', W/2, H/2);
      }

      // Grow flowers
      for (const f of flowers) {
        f.age += s * 0.022;
        drawFlower(f);
      }

      // Update & draw petals
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.x   += p.vx * s * 4;
        p.y   += p.vy * s * 4;
        p.vy  += 0.06 * s * 4;   // gravity
        p.vx  *= Math.pow(0.98, s * 4);
        p.rot += p.rotV * s * 4;
        p.life -= s * 0.012;
        if (p.life <= 0) { petals.splice(i, 1); continue; }

        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = Math.min(1, p.life * 2);
        g.beginPath();
        g.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
        g.fillStyle = `hsl(${p.hue},75%,70%)`;
        g.fill();
        g.restore();
        g.globalAlpha = 1;
      }
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
