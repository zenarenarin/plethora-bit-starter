// GALAGA — Blast alien squadrons (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Galaga',
    author: 'plethora',
    description: 'Drag ship left/right. Auto-fires. Destroy the swarm!',
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
    function playTone(freq, type, dur, vol = 0.25) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { playTone(1200, 'square', 0.06, 0.15); }
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
    function playScore() { playTone(880, 'sine', 0.12, 0.2); }
    function playGameOver() { [300, 240, 180, 120].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.2, 0.3), i * 110)); }

    let stars, ship, bullets, enemies, eBullets, particles, score, wave, lives, running, tick, swoopT, started;

    function spawnWave() {
      enemies = [];
      const rows = 4, cols = 8;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const spacing = Math.min(W / (cols + 1), 44);
          const type = r === 0 ? 'boss' : r === 1 ? 'alien1' : 'alien2';
          enemies.push({
            x: (c + 1) * spacing + (W - (cols + 1) * spacing) / 2,
            y: 80 + r * 34,
            baseX: (c + 1) * spacing + (W - (cols + 1) * spacing) / 2,
            baseY: 80 + r * 34,
            type, alive: true, swoop: false, t: 0, sx: 0, sy: 0,
          });
        }
      }
    }

    function reset() {
      stars = [];
      for (let i = 0; i < 80; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.5, v: Math.random() * 80 + 40 });
      ship = { x: W / 2, y: H - SAFE - 60, cool: 0 };
      bullets = []; eBullets = []; particles = [];
      score = 0; wave = 1; lives = 3; running = true; tick = 0; swoopT = 0;
      spawnWave();
    }

    let touchX = null;
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
      touchX = e.changedTouches[0].clientX;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      touchX = e.changedTouches[0].clientX;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      touchX = null;
    }, { passive: false });

    reset();

    let autoFireT = 0;
    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      // Stars
      stars.forEach(s => { s.y += s.v * sec; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } });

      if (running && started) {
        // Ship movement
        if (touchX !== null) {
          ship.x += (touchX - ship.x) * Math.min(1, dt / 80);
          ship.x = Math.max(20, Math.min(W - 20, ship.x));
        }

        // Auto-fire
        if (ship.cool > 0) ship.cool -= dt;
        autoFireT -= dt;
        if (autoFireT <= 0 && touchX !== null) {
          if (ship.cool <= 0) {
            bullets.push({ x: ship.x, y: ship.y - 16 });
            ship.cool = 200;
            playShoot();
          }
          autoFireT = 200;
        } else if (ship.cool <= 0 && autoFireT <= 0) {
          bullets.push({ x: ship.x, y: ship.y - 16 });
          ship.cool = 250;
          autoFireT = 250;
          playShoot();
        }

        // Enemy sway
        const sway = Math.sin(tick * 0.02) * Math.min(W * 0.08, 20);
        enemies.forEach(e => {
          if (!e.alive) return;
          if (e.swoop) {
            e.t++;
            e.x += e.sx * sec * 60; e.y += e.sy * sec * 60;
            e.sy += 0.05;
            if (tick % 30 === 0 && Math.random() < 0.2) eBullets.push({ x: e.x, y: e.y + 6, vy: 220 });
            if (e.y > H + 20) { e.x = e.baseX; e.y = -20; e.swoop = false; e.t = 0; }
          } else {
            e.x = e.baseX + sway;
          }
        });

        // Swoop trigger
        swoopT += dt;
        if (swoopT > 1800) {
          swoopT = 0;
          const alive = enemies.filter(e => e.alive && !e.swoop);
          if (alive.length) {
            const e = alive[(Math.random() * alive.length) | 0];
            e.swoop = true;
            e.sx = (ship.x - e.x) * 0.003;
            e.sy = 0.8;
          }
        }

        // Bullets
        bullets.forEach(b => b.y -= 500 * sec);
        bullets = bullets.filter(b => b.y > -20);
        eBullets.forEach(b => b.y += b.vy * sec);
        eBullets = eBullets.filter(b => b.y < H + 20);

        // Hit detection
        bullets.forEach(b => {
          enemies.forEach(e => {
            if (!e.alive) return;
            if (Math.abs(b.x - e.x) < 14 && Math.abs(b.y - e.y) < 12) {
              e.alive = false; b.y = -1000;
              score += e.type === 'boss' ? 150 : e.type === 'alien1' ? 80 : 50;
              ctx.platform.setScore(score);
              for (let i = 0; i < 16; i++) particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, c: e.type === 'boss' ? '#00FF00' : e.type === 'alien1' ? '#FF0066' : '#00CCFF', life: 0.5 });
              playExplode(); playScore();
            }
          });
        });

        if (enemies.every(e => !e.alive)) { wave++; spawnWave(); playScore(); }

        eBullets.forEach(b => {
          if (Math.abs(b.x - ship.x) < 14 && Math.abs(b.y - ship.y) < 14) {
            b.y = H + 100; lives--;
            for (let i = 0; i < 16; i++) particles.push({ x: ship.x, y: ship.y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, c: '#FFFF00', life: 0.6 });
            ctx.platform.haptic('heavy');
            if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'ship destroyed' }); playGameOver(); }
          }
        });

        enemies.forEach(e => {
          if (!e.alive || !e.swoop) return;
          if (Math.abs(e.x - ship.x) < 16 && Math.abs(e.y - ship.y) < 16) {
            e.alive = false; lives--;
            ctx.platform.haptic('heavy');
            if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'ship destroyed' }); playGameOver(); }
          }
        });

        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec; p.vy += 20 * sec; p.life -= sec;
          return p.life > 0;
        });
      }

      // Draw
      g.fillStyle = '#000008'; g.fillRect(0, 0, W, H);
      stars.forEach(s => { g.fillStyle = s.s > 1.2 ? '#FFF' : '#AACCFF'; g.fillRect(s.x, s.y, s.s, s.s); });
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Draw enemies
      enemies.forEach(e => {
        if (!e.alive) return;
        const ex = e.x, ey = e.y;
        if (e.type === 'boss') {
          g.fillStyle = '#00FF00'; g.fillRect(ex - 10, ey - 5, 20, 10);
          g.fillStyle = '#FFFF00'; g.fillRect(ex - 7, ey - 8, 14, 5);
          g.fillStyle = '#FF00FF'; g.fillRect(ex - 5, ey + 3, 10, 3);
          g.fillStyle = '#000'; g.fillRect(ex - 6, ey - 2, 3, 3); g.fillRect(ex + 3, ey - 2, 3, 3);
        } else if (e.type === 'alien1') {
          g.fillStyle = '#FF0066'; g.fillRect(ex - 8, ey - 6, 16, 12);
          g.fillStyle = '#FFFF00'; g.fillRect(ex - 5, ey - 4, 5, 5); g.fillRect(ex + 1, ey - 4, 5, 5);
          g.fillStyle = '#000'; g.fillRect(ex - 4, ey - 2, 2, 2); g.fillRect(ex + 2, ey - 2, 2, 2);
        } else {
          g.fillStyle = '#00CCFF'; g.fillRect(ex - 7, ey - 5, 14, 10);
          g.fillStyle = '#FF00FF'; g.fillRect(ex - 4, ey - 2, 8, 4);
          g.fillStyle = '#FFF'; g.fillRect(ex - 2, ey - 5, 4, 2);
        }
      });

      // Draw bullets
      bullets.forEach(b => {
        g.fillStyle = '#FFFF00'; g.fillRect(b.x - 2, b.y - 6, 4, 12);
        g.fillStyle = '#FFF'; g.fillRect(b.x - 1, b.y - 4, 2, 6);
      });
      eBullets.forEach(b => {
        g.fillStyle = '#FF4444'; g.fillRect(b.x - 2, b.y - 5, 4, 10);
      });

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // Ship
      if (running) {
        g.fillStyle = '#FFF'; g.fillRect(ship.x - 2, ship.y - 14, 4, 14);
        g.fillStyle = '#00FFFF'; g.fillRect(ship.x - 10, ship.y - 5, 20, 5);
        g.fillStyle = '#FFF'; g.fillRect(ship.x - 12, ship.y, 24, 5);
        g.fillStyle = '#FF0000'; g.fillRect(ship.x - 1, ship.y - 12, 2, 2);
        g.fillStyle = tick % 4 < 2 ? '#FF6600' : '#FFFF00';
        g.fillRect(ship.x - 4, ship.y + 5, 8, 7);
      }

      // HUD
      g.fillStyle = '#FF2222';
      g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'center'; g.fillText('WAVE ' + wave, W / 2, 28);
      g.textAlign = 'right'; g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,10,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF2222'; g.font = 'bold 28px "Courier New"'; g.textAlign = 'center';
        g.fillText('GALAGA', W / 2, H / 2 - 30);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('DRAG to move ship', W / 2, H / 2 + 10);
        g.fillText('AUTO-FIRES while touching', W / 2, H / 2 + 40);
        g.textAlign = 'left';
      }

      if (!running) {
        g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF2222'; g.font = 'bold 32px "Courier New"'; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"';
        g.fillText('SCORE ' + score, W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
