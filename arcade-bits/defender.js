// DEFENDER — Scrolling shooter, rescue humanoids (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Defender',
    author: 'plethora',
    description: 'Drag to steer, tap to fire. Rescue the humans!',
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
    function playTone(freq, dur, type = 'square', vol = 0.2) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { playTone(1000, 0.06, 'square', 0.15); }
    function playExplode() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      src.start();
    }
    function playScore() { playTone(800, 0.1, 'sine', 0.2); }
    function playGameOver() { [300, 240, 180].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.3), i * 120)); }

    const WORLD = 1600;
    const GH = H - SAFE;

    let ship, bullets, enemies, humans, particles, score, lives, running, tick, cameraX, started;

    function reset() {
      ship = { x: WORLD / 2, y: GH / 2, vx: 0, vy: 0, face: 1, cool: 0 };
      bullets = []; enemies = []; humans = []; particles = [];
      for (let i = 0; i < 5; i++) humans.push({ x: 200 + i * 260, y: GH - 40, vy: 0, captured: null, alive: true });
      for (let i = 0; i < 8; i++) enemies.push({ x: Math.random() * WORLD, y: Math.random() * GH * 0.5 + 40, vx: 0, vy: 0, type: 'lander', alive: true, t: 0, target: null });
      score = 0; lives = 3; running = true; tick = 0; cameraX = 0;
    }

    function WX(x) { return ((x - cameraX) % WORLD + WORLD) % WORLD; }

    function fire() {
      if (!running || ship.cool > 0) return;
      bullets.push({ x: ship.x + ship.face * 16, y: ship.y, vx: ship.face * 600, friendly: true, life: 0.6 });
      ship.cool = 120;
      playShoot();
    }

    let dragStart = null, isDragging = false;
    let leftD = false, rightD = false, upD = false, downD = false;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
      const t = e.changedTouches[0];
      dragStart = { x: t.clientX, y: t.clientY };
      isDragging = false;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!dragStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - dragStart.x, dy = t.clientY - dragStart.y;
      const thresh = 15;
      leftD = dx < -thresh; rightD = dx > thresh;
      upD = dy < -thresh; downD = dy > thresh;
      if (Math.hypot(dx, dy) > thresh) isDragging = true;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!isDragging) fire();
      leftD = rightD = upD = downD = false;
      dragStart = null; isDragging = false;
    }, { passive: false });

    reset();

    let autoFireT = 0;
    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      if (running && started) {
        // Ship control
        if (leftD) { ship.vx -= 250 * sec; ship.face = -1; }
        if (rightD) { ship.vx += 250 * sec; ship.face = 1; }
        if (upD) ship.vy -= 200 * sec;
        if (downD) ship.vy += 200 * sec;

        ship.vx = Math.max(-400, Math.min(400, ship.vx * Math.pow(0.93, 60 * sec)));
        ship.vy = Math.max(-250, Math.min(250, ship.vy * Math.pow(0.9, 60 * sec)));
        ship.x = (ship.x + ship.vx * sec + WORLD) % WORLD;
        ship.y = Math.max(55, Math.min(GH - 40, ship.y + ship.vy * sec));
        cameraX = (ship.x - W / 2 + WORLD) % WORLD;
        if (ship.cool > 0) ship.cool -= dt;

        // Auto-fire while dragging
        if (isDragging) {
          autoFireT -= dt;
          if (autoFireT <= 0) { fire(); autoFireT = 200; }
        } else autoFireT = 0;

        bullets.forEach(b => { b.x = (b.x + b.vx * sec + WORLD) % WORLD; b.life -= sec; });
        bullets = bullets.filter(b => b.life > 0);

        enemies.forEach(e => {
          if (!e.alive) return;
          e.t++;
          if (e.type === 'lander') {
            if (!e.target) {
              const avail = humans.filter(h => h.alive && !h.captured);
              if (avail.length) e.target = avail[(Math.random() * avail.length) | 0];
            }
            if (e.target && e.target.alive && !e.target.captured) {
              let dx = e.target.x - e.x;
              if (dx > WORLD / 2) dx -= WORLD; if (dx < -WORLD / 2) dx += WORLD;
              const dy = e.target.y - e.y - 20;
              e.vx = Math.sign(dx) * 50 * sec;
              e.vy = Math.sign(dy) * 35 * sec;
              if (Math.abs(dx) < 5 && Math.abs(dy) < 6) e.target.captured = e;
            }
            if (e.target && e.target.captured === e) {
              e.vy = -60 * sec;
              e.target.x = e.x; e.target.y = e.y + 14;
              if (e.y < 50) { e.type = 'mutant'; e.target.alive = false; e.target.captured = null; e.target = null; }
            }
            if (tick % 80 === 0) {
              let dx = ship.x - e.x; if (dx > WORLD / 2) dx -= WORLD; if (dx < -WORLD / 2) dx += WORLD;
              const dy = ship.y - e.y;
              const d = Math.hypot(dx, dy) || 1;
              if (Math.abs(dx) < W) bullets.push({ x: e.x, y: e.y, vx: dx / d * 180, vy: dy / d * 180, friendly: false, life: 2 });
            }
          } else {
            let dx = ship.x - e.x; if (dx > WORLD / 2) dx -= WORLD; if (dx < -WORLD / 2) dx += WORLD;
            const dy = ship.y - e.y;
            const d = Math.hypot(dx, dy) || 1;
            e.vx = dx / d * 80 * sec; e.vy = dy / d * 80 * sec;
          }
          e.x = (e.x + e.vx + WORLD) % WORLD;
          e.y = Math.max(40, Math.min(GH - 30, e.y + e.vy));
        });

        // Bullet hits enemy
        bullets.forEach(b => {
          if (!b.friendly) return;
          enemies.forEach(e => {
            if (!e.alive) return;
            let dx = e.x - b.x; if (dx > WORLD / 2) dx -= WORLD; if (dx < -WORLD / 2) dx += WORLD;
            if (Math.abs(dx) < 14 && Math.abs(e.y - b.y) < 12) {
              e.alive = false; b.life = 0;
              score += e.type === 'mutant' ? 150 : 50;
              ctx.platform.setScore(score);
              if (e.target) e.target.captured = null;
              for (let i = 0; i < 14; i++) particles.push({ x: WX(e.x), y: e.y, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, c: e.type === 'mutant' ? '#FF00FF' : '#FF2222', life: 0.5 });
              playExplode(); playScore();
            }
          });
        });

        // Enemy bullet hits ship
        bullets.forEach(b => {
          if (b.friendly) return;
          let dx = ship.x - b.x; if (dx > WORLD / 2) dx -= WORLD; if (dx < -WORLD / 2) dx += WORLD;
          if (Math.abs(dx) < 14 && Math.abs(ship.y - b.y) < 10) {
            b.life = 0; lives--;
            for (let i = 0; i < 14; i++) particles.push({ x: WX(ship.x), y: ship.y, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, c: '#00FFFF', life: 0.5 });
            ctx.platform.haptic('heavy'); playExplode();
            if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'ship destroyed' }); playGameOver(); }
          }
        });

        // Respawn wave
        if (enemies.every(e => !e.alive)) {
          for (let i = 0; i < 6; i++) enemies.push({ x: Math.random() * WORLD, y: 60 + Math.random() * 100, vx: 0, vy: 0, type: 'lander', alive: true, t: 0, target: null });
        }

        particles = particles.filter(p => { p.x += p.vx * sec; p.y += p.vy * sec; p.life -= sec; return p.life > 0; });
      }

      // Draw
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 80; i++) {
        const sx = ((i * 127 - cameraX * 0.3) % W + W) % W;
        const sy = (i * 67) % GH;
        g.fillStyle = (i % 3 === 0) ? '#FFF' : '#AACCFF';
        g.fillRect(sx, sy, 1, 1);
      }

      // Terrain
      g.strokeStyle = '#00FF00'; g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x < W + 20; x += 10) {
        const wx = (x + cameraX) % WORLD;
        const y = GH - 30 + Math.sin(wx * 0.03) * 8 + Math.sin(wx * 0.1) * 4;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();

      // Radar
      g.fillStyle = 'rgba(0,40,0,0.8)'; g.fillRect(W * 0.2, 32, W * 0.6, 12);
      g.strokeStyle = '#00FF00'; g.lineWidth = 1; g.strokeRect(W * 0.2, 32, W * 0.6, 12);
      const rw = W * 0.6;
      g.fillStyle = '#FFFF00'; g.fillRect(W * 0.2 + (ship.x / WORLD) * rw - 1, 34, 2, 8);
      enemies.forEach(e => { if (!e.alive) return; g.fillStyle = '#FF2222'; g.fillRect(W * 0.2 + (e.x / WORLD) * rw - 1, 34, 2, 8); });
      humans.forEach(h => { if (!h.alive) return; g.fillStyle = '#00FFFF'; g.fillRect(W * 0.2 + (h.x / WORLD) * rw - 1, 38, 1, 4); });

      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Humans
      humans.forEach(h => {
        if (!h.alive) return;
        const x = WX(h.x);
        if (x > W + 10 || x < -10) return;
        g.fillStyle = '#00FFFF'; g.fillRect(x - 3, h.y - 9, 6, 6);
        g.fillStyle = '#FFCC99'; g.fillRect(x - 3, h.y - 14, 6, 5);
        g.fillStyle = '#FFF'; g.fillRect(x - 4, h.y - 3, 3, 4); g.fillRect(x + 1, h.y - 3, 3, 4);
        if (h.captured) {
          g.strokeStyle = '#FF00FF'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x, h.y - 14); g.lineTo(WX(h.captured.x), h.captured.y + 5); g.stroke();
        }
      });

      // Enemies
      enemies.forEach(e => {
        if (!e.alive) return;
        const x = WX(e.x);
        if (x > W + 10 || x < -10) return;
        if (e.type === 'lander') {
          g.fillStyle = '#FF2222'; g.fillRect(x - 7, e.y - 6, 14, 12);
          g.fillStyle = '#FFFF00'; g.fillRect(x - 3, e.y - 4, 6, 5);
          g.strokeStyle = '#FF2222'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x - 7, e.y + 6); g.lineTo(x - 10, e.y + 10); g.moveTo(x + 7, e.y + 6); g.lineTo(x + 10, e.y + 10); g.stroke();
        } else {
          g.fillStyle = '#FF00FF'; g.fillRect(x - 7, e.y - 7, 14, 14);
          g.fillStyle = '#FFFF00'; g.fillRect(x - 4, e.y - 5, 3, 3); g.fillRect(x + 1, e.y - 5, 3, 3);
        }
      });

      // Bullets
      bullets.forEach(b => {
        const x = WX(b.x);
        g.fillStyle = b.friendly ? '#FFFF00' : '#FF4444';
        g.fillRect(x - 5, b.y - 2, 10, 4);
        g.fillStyle = '#FFF'; g.fillRect(x - 2, b.y - 1, 4, 2);
      });

      // Ship
      if (running) {
        const sx = WX(ship.x);
        g.save(); g.translate(sx, ship.y); g.scale(ship.face, 1);
        g.fillStyle = '#00FFFF'; g.fillRect(-12, -5, 24, 10);
        g.fillRect(9, -3, 7, 6);
        g.fillStyle = '#FFFF00'; g.fillRect(-16, -3, 5, 6);
        g.fillStyle = '#FFF'; g.fillRect(0, -4, 5, 3);
        if (Math.abs(ship.vx) > 50) { g.fillStyle = tick % 4 < 2 ? '#FF6600' : '#FFFF00'; g.fillRect(-18, -2, -4, 4); }
        g.restore();
      }

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // HUD
      g.fillStyle = '#00FF00'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'center'; g.fillText('HUMANS ' + humans.filter(h => h.alive).length, W / 2, 28);
      g.textAlign = 'right'; g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FF00'; g.font = 'bold 26px "Courier New"'; g.textAlign = 'center';
        g.fillText('DEFENDER', W / 2, H / 2 - 40);
        g.fillStyle = '#FFF'; g.font = '15px "Courier New"';
        g.fillText('DRAG to steer', W / 2, H / 2 + 5);
        g.fillText('TAP (no drag) = fire', W / 2, H / 2 + 30);
        g.fillText('Save the humans!', W / 2, H / 2 + 55);
        g.fillStyle = '#FFFF00'; g.font = 'bold 16px "Courier New"'; g.fillText('TAP TO START', W / 2, H / 2 + 90);
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
