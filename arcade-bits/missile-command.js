// MISSILE COMMAND — Defend the cities (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Missile Command',
    author: 'plethora',
    description: 'Tap to launch counter-missiles. Protect the cities!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SAFE = ctx.safeArea.bottom;

    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type = 'square', vol = 0.22) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playLaunch() { playTone(800, 0.08, 'square', 0.2); }
    function playExplosion() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.25, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      src.start();
    }
    function playInterceptScore() { playTone(660, 0.12, 'sine', 0.25); }
    function playGameOver() { [300, 240, 180, 120].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.3), i * 110)); }

    const GH = H - SAFE;

    let cities, bases, incoming, counter, explosions, particles, score, wave, running, tick, spawnT, enemiesLeft, started;

    function reset() {
      cities = [];
      for (let i = 0; i < 6; i++) cities.push({ x: W * (0.1 + i * 0.14 + (i >= 3 ? 0.1 : 0)), alive: true });
      bases = [{ x: W * 0.08, ammo: 10 }, { x: W * 0.5, ammo: 10 }, { x: W * 0.92, ammo: 10 }];
      incoming = []; counter = []; explosions = []; particles = [];
      score = 0; wave = 1; running = true; tick = 0; spawnT = 0; enemiesLeft = 12;
    }

    function shoot(tx, ty) {
      if (!running) return;
      const avail = bases.filter(b => b.ammo > 0);
      if (!avail.length) return;
      let best = avail[0], bd = Infinity;
      avail.forEach(b => { const d = Math.abs(b.x - tx); if (d < bd) { bd = d; best = b; } });
      best.ammo--;
      counter.push({ x: best.x, y: GH - 45, sx: best.x, sy: GH - 45, tx, ty, done: false });
      playLaunch();
    }

    function addExplosion(x, y, r = 50) { explosions.push({ x, y, life: 1, max: 1, maxR: r }); }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
      const t = e.changedTouches[0];
      shoot(t.clientX, t.clientY);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    reset();

    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      if (running && started) {
        spawnT += dt;
        const spawnInterval = Math.max(400, 1800 - wave * 100);
        if (spawnT > spawnInterval && enemiesLeft > 0) {
          spawnT = 0;
          const sx = Math.random() * W;
          const targets = cities.filter(c => c.alive);
          if (targets.length) {
            const target = targets[(Math.random() * targets.length) | 0];
            const angle = Math.atan2(GH - 60, target.x - sx);
            const spd = 60 + wave * 15;
            incoming.push({ x: sx, y: 0, sx, sy: 0, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, target });
            enemiesLeft--;
          }
        }

        incoming.forEach(m => { m.x += m.vx * sec; m.y += m.vy * sec; });
        counter.forEach(m => {
          const dx = m.tx - m.x, dy = m.ty - m.y;
          const d = Math.hypot(dx, dy);
          if (d < 5) { addExplosion(m.tx, m.ty, 55); m.done = true; playExplosion(); }
          else { const spd = 200 * sec; m.x += dx / d * spd; m.y += dy / d * spd; }
        });
        counter = counter.filter(m => !m.done);

        // Explosions kill missiles
        explosions.forEach(e => {
          const r = (1 - e.life / e.max) * e.maxR;
          for (let i = incoming.length - 1; i >= 0; i--) {
            const m = incoming[i];
            if (Math.hypot(m.x - e.x, m.y - e.y) < r) {
              incoming.splice(i, 1); score += 25; ctx.platform.setScore(score);
              for (let k = 0; k < 10; k++) particles.push({ x: m.x, y: m.y, vx: (Math.random() - 0.5) * 150, vy: (Math.random() - 0.5) * 150, c: '#FFFF00', life: 0.4 });
              playInterceptScore();
            }
          }
          e.life -= sec * 1.5;
        });
        explosions = explosions.filter(e => e.life > 0);

        // Missiles hit ground
        for (let i = incoming.length - 1; i >= 0; i--) {
          const m = incoming[i];
          if (m.y >= GH - 45) {
            addExplosion(m.x, m.y, 40); playExplosion();
            cities.forEach(c => { if (c.alive && Math.abs(c.x - m.x) < 20) { c.alive = false; ctx.platform.haptic('heavy'); } });
            incoming.splice(i, 1);
          }
        }

        // Wave complete
        if (incoming.length === 0 && enemiesLeft <= 0) {
          wave++; enemiesLeft = 12 + wave * 2;
          bases.forEach(b => b.ammo = 10);
          score += 100 + cities.filter(c => c.alive).length * 100;
          ctx.platform.setScore(score);
        }

        if (cities.every(c => !c.alive)) { running = false; ctx.platform.fail({ reason: 'all cities destroyed' }); playGameOver(); }

        particles = particles.filter(p => { p.x += p.vx * sec; p.y += p.vy * sec; p.life -= sec; return p.life > 0; });
      }

      // Draw
      g.fillStyle = '#000010'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 50; i++) {
        const sx = (i * 131) % W, sy = (i * 79) % GH;
        g.fillStyle = (tick + i) % 100 < 50 ? '#FFF' : '#88AACC';
        g.fillRect(sx, sy, 1, 1);
      }
      // Ground
      g.fillStyle = '#222244'; g.fillRect(0, GH - 45, W, 45);
      g.fillStyle = '#001133'; g.fillRect(0, GH - 49, W, 4);
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Cities
      cities.forEach(c => {
        if (!c.alive) return;
        const x = c.x, y = GH - 45;
        g.fillStyle = '#44AAFF'; g.fillRect(x - 10, y - 22, 20, 22);
        g.fillStyle = '#0066CC'; g.fillRect(x - 13, y - 25, 26, 5);
        g.fillStyle = '#FFFF00';
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
          if ((tick + i + j) % 70 < 35) g.fillRect(x - 7 + i * 6, y - 17 + j * 7, 2, 4);
        }
      });

      // Bases
      bases.forEach(b => {
        const x = b.x, y = GH - 45;
        g.fillStyle = b.ammo > 0 ? '#00FF66' : '#555';
        g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x - 14, y); g.lineTo(x + 14, y); g.closePath(); g.fill();
        g.fillStyle = '#FFF'; g.font = 'bold 11px "Courier New"'; g.textAlign = 'center';
        g.fillText(b.ammo, x, y - 7);
      });
      g.textAlign = 'left';

      // Incoming missiles (draw trails)
      incoming.forEach(m => {
        g.strokeStyle = '#FF4444'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(m.sx, m.sy); g.lineTo(m.x, m.y); g.stroke();
        g.fillStyle = '#FFFF00'; g.beginPath(); g.arc(m.x, m.y, 3, 0, Math.PI * 2); g.fill();
      });

      // Counter missiles
      counter.forEach(m => {
        g.strokeStyle = '#00FFFF'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(m.sx, m.sy); g.lineTo(m.x, m.y); g.stroke();
        g.fillStyle = '#FFF'; g.beginPath(); g.arc(m.x, m.y, 2, 0, Math.PI * 2); g.fill();
      });

      // Explosions
      explosions.forEach(e => {
        const r = (1 - e.life / e.max) * e.maxR;
        g.fillStyle = `rgba(255,${(200 * e.life + 55) | 0},0,${e.life * 0.8})`;
        g.beginPath(); g.arc(e.x, e.y, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#FFF'; g.lineWidth = 1;
        g.beginPath(); g.arc(e.x, e.y, r, 0, Math.PI * 2); g.stroke();
      });

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.4);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // HUD
      g.fillStyle = '#FFFF00'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'center'; g.fillText('WAVE ' + wave, W / 2, 28);
      g.textAlign = 'right'; g.fillText('CITIES ' + cities.filter(c => c.alive).length, W - 12, 28);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,20,0.85)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FFFF00'; g.font = 'bold 24px "Courier New"'; g.textAlign = 'center';
        g.fillText('MISSILE COMMAND', W / 2, H / 2 - 40);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('TAP anywhere to fire', W / 2, H / 2 + 5);
        g.fillText('Protect the 6 cities!', W / 2, H / 2 + 33);
        g.fillStyle = '#FFFF00'; g.font = 'bold 16px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 75);
        g.textAlign = 'left';
      }

      if (!running) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF2244'; g.font = 'bold 30px "Courier New"'; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"';
        g.fillText('SCORE ' + score + ' · WAVE ' + wave, W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"'; g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
