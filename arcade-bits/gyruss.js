// GYRUSS — Tube shooter, orbit around the ring (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Gyruss',
    author: 'plethora',
    description: 'Drag around the circle. Auto-fires. Blast space waves!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type = 'square', vol = 0.2) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { playTone(1200, 0.06, 'square', 0.12); }
    function playExplode() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.18, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
      src.start();
    }
    function playScore() { playTone(880, 0.1, 'sine', 0.2); }
    function playGameOver() { [300, 240, 180, 120].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.3), i * 120)); }

    const cx = W / 2, cy = H / 2 + 10;
    const R = Math.min(W, H) * 0.42;

    let ship, enemies, bullets, eBullets, particles, score, lives, running, tick, wave, spawnT, stars, started;

    function reset() {
      ship = { a: Math.PI / 2, invul: 90 };
      enemies = []; bullets = []; eBullets = []; particles = [];
      stars = [];
      for (let i = 0; i < 70; i++) stars.push({ a: Math.random() * Math.PI * 2, r: Math.random() * R, v: 40 + Math.random() * 80 });
      score = 0; lives = 3; running = true; tick = 0; wave = 1; spawnT = 0;
    }

    function fire() {
      if (!running) return;
      bullets.push({ a: ship.a, r: R - 12, life: 1.5 });
      playShoot();
    }

    function setAngleFromPoint(px, py) {
      const dx = px - cx, dy = py - cy;
      ship.a = Math.atan2(dy, dx);
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
      const t = e.changedTouches[0];
      setAngleFromPoint(t.clientX, t.clientY);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      setAngleFromPoint(t.clientX, t.clientY);
    }, { passive: false });

    reset();

    let autoFireT = 0;
    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      // Stars animation
      stars.forEach(s => {
        s.r += s.v * sec;
        if (s.r > R) { s.r = 2; s.a = Math.random() * Math.PI * 2; }
      });

      if (running && started) {
        if (ship.invul > 0) ship.invul--;

        // Auto-fire
        autoFireT -= dt;
        if (autoFireT <= 0) { fire(); autoFireT = 200; }

        // Spawn enemies
        spawnT += dt;
        const spawnInterval = Math.max(300, 1800 - wave * 100);
        if (spawnT > spawnInterval && enemies.length < 18) {
          spawnT = 0;
          enemies.push({ a: Math.random() * Math.PI * 2, r: 8, vr: 40 + wave * 8, va: (Math.random() - 0.5) * 0.03, type: Math.random() < 0.7 ? 'fighter' : 'saucer', cool: 2000 + Math.random() * 2000 });
        }

        enemies.forEach(e => {
          e.r += e.vr * sec;
          e.a += e.va;
          e.cool -= dt;
          if (e.cool <= 0 && e.r > R * 0.3) {
            eBullets.push({ a: e.a, r: e.r, vr: 120, life: 1.5 });
            e.cool = 2500 + Math.random() * 2000;
          }
          if (e.r > R + 18) e.done = true;
        });

        // Enemy hit ship at rim
        enemies.forEach(e => {
          if (e.done) return;
          const da = ((e.a - ship.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (Math.abs(e.r - R) < 16 && Math.abs(da) < 0.3) {
            e.done = true;
            const ex = cx + Math.cos(e.a) * e.r, ey = cy + Math.sin(e.a) * e.r;
            for (let i = 0; i < 14; i++) particles.push({ x: ex, y: ey, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, c: '#FF2222', life: 0.5 });
            playExplode();
            if (ship.invul <= 0) {
              lives--; ctx.platform.haptic('heavy');
              ship.invul = 90;
              if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'ship hit' }); playGameOver(); }
            }
          }
        });
        enemies = enemies.filter(e => !e.done);

        // Bullets inward
        bullets.forEach(b => { b.r -= 300 * sec; b.life -= sec; });
        bullets = bullets.filter(b => b.r > 5 && b.life > 0);

        // Enemy bullets outward
        eBullets.forEach(b => { b.r += b.vr * sec; b.life -= sec; });
        eBullets = eBullets.filter(b => b.r < R + 30 && b.life > 0);

        // Friendly bullet hits enemy
        bullets.forEach(b => {
          enemies.forEach(e => {
            if (e.done) return;
            const da = ((e.a - b.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            if (Math.abs(da) < 0.2 && Math.abs(e.r - b.r) < 14) {
              e.done = true; b.life = 0;
              score += e.type === 'saucer' ? 100 : 50;
              ctx.platform.setScore(score);
              const ex = cx + Math.cos(e.a) * e.r, ey = cy + Math.sin(e.a) * e.r;
              for (let i = 0; i < 14; i++) particles.push({ x: ex, y: ey, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, c: e.type === 'saucer' ? '#FF00FF' : '#FF2222', life: 0.5 });
              playExplode(); playScore();
            }
          });
        });

        // Enemy bullet hits ship
        eBullets.forEach(b => {
          const da = ((b.a - ship.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (Math.abs(da) < 0.22 && Math.abs(b.r - R) < 16 && ship.invul <= 0) {
            b.life = 0; lives--; ctx.platform.haptic('heavy');
            ship.invul = 90;
            const sx = cx + Math.cos(ship.a) * R, sy = cy + Math.sin(ship.a) * R;
            for (let i = 0; i < 14; i++) particles.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, c: '#00FFFF', life: 0.5 });
            playExplode();
            if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'ship hit' }); playGameOver(); }
          }
        });

        if (score > wave * 1500) wave++;

        particles = particles.filter(p => { p.x += p.vx * sec; p.y += p.vy * sec; p.life -= sec; return p.life > 0; });
      }

      // Draw
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

      // Starfield
      stars.forEach(s => {
        const x = cx + Math.cos(s.a) * s.r;
        const y = cy + Math.sin(s.a) * s.r;
        const sz = 0.5 + s.r / R * 2.5;
        const br = 100 + s.r / R * 155 | 0;
        g.fillStyle = `rgba(${br},${br},255,${0.3 + s.r / R * 0.7})`;
        g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      });

      // Outer ring
      g.strokeStyle = 'rgba(0,255,255,0.25)'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      for (let i = 1; i <= 5; i++) {
        g.strokeStyle = `rgba(0,${80 + i * 20},255,${0.03 + i * 0.03})`;
        g.beginPath(); g.arc(cx, cy, R * i / 6, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Enemies
      enemies.forEach(e => {
        const ex = cx + Math.cos(e.a) * e.r;
        const ey = cy + Math.sin(e.a) * e.r;
        const sc = 0.3 + e.r / R * 0.9;
        g.save(); g.translate(ex, ey); g.scale(sc, sc); g.rotate(e.a + Math.PI / 2);
        if (e.type === 'fighter') {
          g.fillStyle = '#FF2222'; g.fillRect(-9, -7, 18, 14);
          g.fillStyle = '#FFFF00'; g.fillRect(-5, -5, 10, 5);
          g.fillStyle = '#FFF'; g.fillRect(-1, -3, 2, 2);
        } else {
          g.fillStyle = '#FF00FF';
          g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#FFFF00'; g.fillRect(-6, -4, 4, 4); g.fillRect(2, -4, 4, 4);
        }
        g.restore();
      });

      // Enemy bullets
      eBullets.forEach(b => {
        const bx = cx + Math.cos(b.a) * b.r, by = cy + Math.sin(b.a) * b.r;
        const sc = 0.3 + b.r / R * 0.9;
        g.fillStyle = '#FF4444'; g.fillRect(bx - 3 * sc, by - 6 * sc, 6 * sc, 12 * sc);
      });

      // Player bullets
      bullets.forEach(b => {
        const bx = cx + Math.cos(b.a) * b.r, by = cy + Math.sin(b.a) * b.r;
        const sc = 0.3 + b.r / R * 0.9;
        g.fillStyle = '#FFFF00'; g.fillRect(bx - 2.5 * sc, by - 6 * sc, 5 * sc, 12 * sc);
        g.fillStyle = '#FFF'; g.fillRect(bx - 1 * sc, by - 4 * sc, 2 * sc, 6 * sc);
      });

      // Ship
      if (!running || ship.invul <= 0 || tick % 6 < 3) {
        const sx = cx + Math.cos(ship.a) * R;
        const sy = cy + Math.sin(ship.a) * R;
        g.save(); g.translate(sx, sy); g.rotate(ship.a + Math.PI / 2);
        g.fillStyle = '#00FFFF';
        g.beginPath(); g.moveTo(0, -11); g.lineTo(-9, 9); g.lineTo(0, 5); g.lineTo(9, 9); g.closePath(); g.fill();
        g.fillStyle = '#FFF'; g.fillRect(-2, -9, 4, 4);
        g.fillStyle = '#FFFF00'; g.fillRect(-7, -2, 2, 7); g.fillRect(5, -2, 2, 7);
        g.fillStyle = tick % 4 < 2 ? '#FF9900' : '#FFFF00'; g.fillRect(-3, 9, 6, 5);
        g.restore();
      }

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // HUD
      g.fillStyle = '#00FFFF'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'center'; g.fillText('WAVE ' + wave, W / 2, 28);
      g.textAlign = 'right'; g.fillText('LIVES ' + '▲'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FFFF'; g.font = 'bold 28px "Courier New"'; g.textAlign = 'center';
        g.fillText('GYRUSS', W / 2, H / 2 - 30);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('DRAG around the ring', W / 2, H / 2 + 10);
        g.fillText('Auto-fires! Dodge enemies.', W / 2, H / 2 + 38);
        g.textAlign = 'left';
      }

      if (!running) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF2244'; g.font = 'bold 30px "Courier New"'; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"'; g.fillText('SCORE ' + score, W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"'; g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
