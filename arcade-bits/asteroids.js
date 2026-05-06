// ASTEROIDS — Arcade Classic (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Asteroids',
    author: 'plethora',
    description: 'Thrust toward touch, auto-fire. Blast the rocks.',
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
    function playTone(freq, type, dur, vol = 0.3) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { playTone(880, 'square', 0.08, 0.2); }
    function playExplosion() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.25, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      src.start();
    }
    function playScore() { playTone(440, 'sine', 0.15, 0.25); }
    function playGameOver() {
      if (!audioCtx) return;
      [400, 320, 260, 200].forEach((f, i) => {
        setTimeout(() => playTone(f, 'sawtooth', 0.2, 0.3), i * 120);
      });
    }

    let player, bullets, asteroids, particles, score, gameOver, level, started, autoFireT;

    function initGame() {
      player = { x: W / 2, y: H / 2, angle: -Math.PI / 2, vx: 0, vy: 0 };
      bullets = []; asteroids = []; particles = [];
      score = 0; gameOver = false; level = 1; started = false; autoFireT = 0;
      spawnAsteroids();
    }

    function spawnAsteroids() {
      asteroids = [];
      for (let i = 0; i < 3 + level; i++) {
        let x, y;
        do {
          x = Math.random() * W;
          y = Math.random() * H;
        } while (Math.hypot(x - player.x, y - player.y) < 100);
        asteroids.push({ x, y, size: 3, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80 });
      }
    }

    function shoot() {
      bullets.push({
        x: player.x + Math.cos(player.angle) * 14,
        y: player.y + Math.sin(player.angle) * 14,
        vx: Math.cos(player.angle) * 400,
        vy: Math.sin(player.angle) * 400,
        life: 1.2,
      });
      playShoot();
    }

    function explode(x, y, n = 12) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        particles.push({ x, y, vx: Math.cos(a) * (50 + Math.random() * 80), vy: Math.sin(a) * (50 + Math.random() * 80), life: 0.6 + Math.random() * 0.4 });
      }
    }

    let touchTarget = null;
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); }
      if (gameOver) { initGame(); return; }
      const t = e.changedTouches[0];
      touchTarget = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchTarget = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      touchTarget = null;
    }, { passive: false });

    initGame();

    ctx.raf((dt) => {
      const s = dt / 16;

      // Update
      if (!gameOver && started) {
        // Aim and thrust toward touch
        if (touchTarget) {
          const dx = touchTarget.x - player.x;
          const dy = touchTarget.y - player.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 20) {
            player.angle = Math.atan2(dy, dx);
            const thrust = 180;
            player.vx += Math.cos(player.angle) * thrust * dt / 1000;
            player.vy += Math.sin(player.angle) * thrust * dt / 1000;
          }
          // Auto-fire
          autoFireT -= dt;
          if (autoFireT <= 0) { shoot(); autoFireT = 300; }
        } else {
          autoFireT = 0;
        }

        const fric = Math.pow(0.985, s);
        player.vx *= fric; player.vy *= fric;
        player.x = (player.x + player.vx * dt / 1000 + W) % W;
        player.y = (player.y + player.vy * dt / 1000 + H) % H;

        // Bullets
        bullets = bullets.filter(b => {
          b.x = (b.x + b.vx * dt / 1000 + W) % W;
          b.y = (b.y + b.vy * dt / 1000 + H) % H;
          b.life -= dt / 1000;
          return b.life > 0;
        });

        // Asteroids
        asteroids.forEach(a => {
          a.x = (a.x + a.vx * dt / 1000 + W) % W;
          a.y = (a.y + a.vy * dt / 1000 + H) % H;
        });

        // Bullet-asteroid collisions
        for (let i = bullets.length - 1; i >= 0; i--) {
          for (let j = asteroids.length - 1; j >= 0; j--) {
            const b = bullets[i], a = asteroids[j];
            const r = 8 + a.size * 10;
            if (Math.hypot(b.x - a.x, b.y - a.y) < r) {
              bullets.splice(i, 1);
              score += (4 - a.size) * 100;
              ctx.platform.setScore(score);
              explode(a.x, a.y, 10);
              playExplosion();
              if (a.size > 1) {
                for (let k = 0; k < 2; k++) {
                  asteroids.push({ x: a.x, y: a.y, size: a.size - 1, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120 });
                }
              } else { playScore(); }
              asteroids.splice(j, 1);
              break;
            }
          }
        }

        // Player-asteroid collision
        for (const a of asteroids) {
          const r = 8 + a.size * 10;
          if (Math.hypot(player.x - a.x, player.y - a.y) < r + 8) {
            gameOver = true;
            explode(player.x, player.y, 20);
            playGameOver();
            ctx.platform.fail({ reason: 'hit asteroid' });
            break;
          }
        }

        // Level complete
        if (asteroids.length === 0) { level++; spawnAsteroids(); playScore(); }

        // Particles
        particles = particles.filter(p => {
          p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.life -= dt / 1000;
          return p.life > 0;
        });
      }

      // Draw
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);

      // Stars (static)
      g.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < 60; i++) {
        g.fillRect((i * 127 + 3) % W, (i * 83 + 7) % H, 1, 1);
      }

      // Asteroids
      asteroids.forEach(a => {
        const r = 8 + a.size * 10;
        g.strokeStyle = '#00FF00';
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i <= 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const rr = r + Math.sin(ang * 3 + a.size) * r * 0.25;
          const x = a.x + Math.cos(ang) * rr;
          const y = a.y + Math.sin(ang) * rr;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath(); g.stroke();
      });

      // Bullets
      g.fillStyle = '#FFFF00';
      bullets.forEach(b => { g.fillRect(b.x - 2, b.y - 2, 4, 4); });

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.6);
        g.fillStyle = '#FFAA00';
        g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // Player ship
      if (!gameOver) {
        g.save();
        g.translate(player.x, player.y);
        g.rotate(player.angle);
        g.strokeStyle = '#00FF00';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(14, 0); g.lineTo(-10, -8); g.lineTo(-5, 0); g.lineTo(-10, 8);
        g.closePath(); g.stroke();
        if (touchTarget) {
          g.fillStyle = tick % 6 < 3 ? '#FF6600' : '#FFFF00';
          g.beginPath(); g.moveTo(-5, 0); g.lineTo(-14, -4); g.lineTo(-18, 0); g.lineTo(-14, 4); g.closePath(); g.fill();
        }
        g.restore();
      }

      // HUD
      g.fillStyle = '#00FF00';
      g.font = 'bold 18px "Courier New"';
      g.textAlign = 'left';
      g.fillText('SCORE: ' + score, 12, 32);
      g.textAlign = 'right';
      g.fillText('LVL: ' + level, W - 12, 32);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FF00';
        g.font = 'bold 28px "Courier New"';
        g.textAlign = 'center';
        g.fillText('ASTEROIDS', W / 2, H / 2 - 30);
        g.font = '18px "Courier New"';
        g.fillText('TOUCH to aim & thrust', W / 2, H / 2 + 10);
        g.fillText('AUTO-FIRES while touching', W / 2, H / 2 + 40);
        g.textAlign = 'left';
      }

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF0000';
        g.font = 'bold 36px "Courier New"';
        g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00';
        g.font = '20px "Courier New"';
        g.fillText('SCORE: ' + score, W / 2, H / 2 + 20);
        g.fillStyle = '#00FF00';
        g.font = '16px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 55);
        g.textAlign = 'left';
      }
    });

    let tick = 0;
    ctx.interval(() => tick++, 100);

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
