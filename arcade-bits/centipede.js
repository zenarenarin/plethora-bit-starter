// CENTIPEDE — Arcade Classic (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Centipede',
    author: 'plethora',
    description: 'Drag to move shooter. Tap to fire. Blast the centipede!',
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
    function playHit() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.12, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      src.start();
    }
    function playScore() { playTone(800, 0.1, 'sine', 0.2); }
    function playGameOver() { [300, 240, 180].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.3), i * 120)); }

    const GH = H - SAFE;
    const CELL = Math.min(W / 14, GH / 22);
    const GCOLS = Math.floor(W / CELL);
    const GROWS = Math.floor(GH / CELL);
    const OX = (W - GCOLS * CELL) / 2;
    const OY = 50;

    let player, bullets, segments, mushrooms, particles, score, gameOver, level, started;
    let autoFireT = 0;

    function initGame() {
      player = { x: W / 2, y: GH - CELL * 2 };
      bullets = []; particles = []; score = 0; gameOver = false; level = 1; started = false;
      createCentipede();
      createMushrooms();
    }

    function createCentipede() {
      segments = [];
      const len = 8 + level;
      for (let i = 0; i < len; i++) {
        segments.push({ x: OX + i * CELL, y: OY + CELL, dx: CELL * 2.5, dy: 0, head: i === 0 });
      }
    }

    function createMushrooms() {
      if (!mushrooms) mushrooms = [];
      const count = 10 + level * 2;
      for (let i = 0; i < count; i++) {
        const col = (Math.random() * GCOLS) | 0;
        const row = 1 + (Math.random() * (GROWS - 5)) | 0;
        mushrooms.push({ x: OX + col * CELL + CELL / 2, y: OY + row * CELL + CELL / 2, hits: 4 });
      }
    }

    function explode(x, y, c) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        particles.push({ x, y, vx: Math.cos(a) * (50 + Math.random() * 80), vy: Math.sin(a) * (50 + Math.random() * 80), c, life: 0.5 });
      }
    }

    let touchStartX = null, touchStartY = null, isDragging = false;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { initGame(); return; }
      const t = e.changedTouches[0];
      touchStartX = t.clientX; touchStartY = t.clientY;
      isDragging = false;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (touchStartX !== null) {
        const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
        if (Math.hypot(dx, dy) > 8) isDragging = true;
      }
      player.x = Math.max(CELL / 2, Math.min(W - CELL / 2, t.clientX));
      player.y = Math.max(GH - GROWS * 0.35 * CELL, Math.min(GH - CELL * 1.5, t.clientY));
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!isDragging && !gameOver && started) {
        // Tap = fire
        if (autoFireT <= 0) {
          bullets.push({ x: player.x, y: player.y - CELL * 0.7, vy: -450 });
          autoFireT = 150;
          playShoot();
        }
      }
      touchStartX = null; isDragging = false;
    }, { passive: false });

    initGame();

    ctx.raf((dt) => {
      const sec = dt / 1000;

      if (!gameOver && started) {
        // Auto-fire while dragging
        if (isDragging) {
          autoFireT -= dt;
          if (autoFireT <= 0) {
            bullets.push({ x: player.x, y: player.y - CELL * 0.7, vy: -450 });
            autoFireT = 200;
            playShoot();
          }
        } else if (autoFireT > 0) autoFireT -= dt;

        // Bullets
        bullets = bullets.filter(b => { b.y += b.vy * sec; return b.y > 0; });

        // Centipede movement
        segments.forEach(s => {
          s.x += s.dx * sec;
        });

        // Check wall hits and turn
        let turned = false;
        segments.forEach(s => {
          if ((s.x <= OX + CELL / 2 && s.dx < 0) || (s.x >= OX + GCOLS * CELL - CELL / 2 && s.dx > 0)) {
            if (!turned) { turned = true; }
          }
        });
        if (turned) {
          segments.forEach(s => {
            s.dx = -s.dx;
            s.y += CELL;
          });
        }

        // Mushroom collision with centipede
        segments.forEach(s => {
          mushrooms.forEach(m => {
            if (Math.abs(s.x - m.x) < CELL * 0.7 && Math.abs(s.y - m.y) < CELL * 0.7) {
              s.dx = -s.dx;
              s.y += CELL;
            }
          });
        });

        // Bullet-segment collision
        for (let i = bullets.length - 1; i >= 0; i--) {
          for (let j = segments.length - 1; j >= 0; j--) {
            const b = bullets[i], s = segments[j];
            if (Math.abs(b.x - s.x) < CELL * 0.6 && Math.abs(b.y - s.y) < CELL * 0.6) {
              bullets.splice(i, 1);
              score += s.head ? 100 : 10;
              ctx.platform.setScore(score);
              explode(s.x, s.y, s.head ? '#FFFF00' : '#FF00FF');
              mushrooms.push({ x: s.x, y: s.y, hits: 4 });
              segments.splice(j, 1);
              playHit(); playScore();
              break;
            }
          }
        }

        // Bullet-mushroom collision
        for (let i = bullets.length - 1; i >= 0; i--) {
          for (let j = mushrooms.length - 1; j >= 0; j--) {
            const b = bullets[i], m = mushrooms[j];
            if (Math.abs(b.x - m.x) < CELL * 0.55 && Math.abs(b.y - m.y) < CELL * 0.55) {
              bullets.splice(i, 1);
              m.hits--;
              if (m.hits <= 0) { mushrooms.splice(j, 1); score += 5; }
              break;
            }
          }
        }

        // Player-segment collision
        for (const s of segments) {
          if (Math.abs(s.x - player.x) < CELL * 0.6 && Math.abs(s.y - player.y) < CELL * 0.6) {
            gameOver = true;
            explode(player.x, player.y, '#00FF00');
            ctx.platform.fail({ reason: 'hit by centipede' }); playGameOver();
            break;
          }
        }

        // Level complete
        if (segments.length === 0) { level++; createCentipede(); createMushrooms(); playScore(); }

        particles = particles.filter(p => { p.x += p.vx * sec; p.y += p.vy * sec; p.life -= sec; return p.life > 0; });
      }

      // Draw
      g.fillStyle = '#001133'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(0,200,200,0.08)'; g.lineWidth = 1;
      for (let y = OY; y < GH; y += CELL) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Mushrooms
      mushrooms.forEach(m => {
        const alpha = m.hits / 4;
        g.fillStyle = `rgba(255,${100 + alpha * 100 | 0},0,${0.4 + alpha * 0.6})`;
        g.beginPath(); g.arc(m.x, m.y, CELL * 0.42, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#FF00FF'; g.lineWidth = 1;
        g.beginPath(); g.arc(m.x, m.y, CELL * 0.42, 0, Math.PI * 2); g.stroke();
      });

      // Centipede
      segments.forEach((s, i) => {
        const isHead = s.head;
        g.fillStyle = isHead ? '#FFFF00' : '#FF00FF';
        g.beginPath(); g.arc(s.x, s.y, CELL * 0.45, 0, Math.PI * 2); g.fill();
        g.fillStyle = isHead ? '#FF8800' : '#AA0066';
        g.beginPath(); g.arc(s.x, s.y, CELL * 0.28, 0, Math.PI * 2); g.fill();
        if (isHead) {
          g.fillStyle = '#000';
          g.fillRect(s.x - CELL * 0.25, s.y - CELL * 0.15, CELL * 0.1, CELL * 0.1);
          g.fillRect(s.x + CELL * 0.15, s.y - CELL * 0.15, CELL * 0.1, CELL * 0.1);
        }
      });

      // Bullets
      g.fillStyle = '#00FFFF';
      bullets.forEach(b => { g.fillRect(b.x - 2, b.y - 6, 4, 12); });

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
      g.globalAlpha = 1;

      // Player
      if (!gameOver) {
        g.fillStyle = '#00FF00'; g.fillRect(player.x - CELL * 0.5, player.y - CELL * 0.5, CELL, CELL);
        g.fillStyle = '#FFFFFF'; g.fillRect(player.x - CELL * 0.15, player.y - CELL * 0.5 - CELL * 0.4, CELL * 0.12, CELL * 0.4);
        g.fillRect(player.x + CELL * 0.04, player.y - CELL * 0.5 - CELL * 0.4, CELL * 0.12, CELL * 0.4);
      }

      // HUD
      g.fillStyle = '#00DDDD'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 32);
      g.textAlign = 'right'; g.fillText('LVL ' + level, W - 12, 32);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,30,0.85)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#00DDDD'; g.font = 'bold 28px "Courier New"'; g.textAlign = 'center';
        g.fillText('CENTIPEDE', W / 2, H / 2 - 30);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('DRAG to move + auto-fire', W / 2, H / 2 + 10);
        g.fillText('TAP to shoot', W / 2, H / 2 + 38);
        g.textAlign = 'left';
      }

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF0000'; g.font = 'bold 32px "Courier New"'; g.textAlign = 'center';
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
