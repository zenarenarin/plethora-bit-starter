// ROBOTRON: 2084 — Twin stick blaster (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Robotron: 2084',
    author: 'plethora',
    description: 'Left half = move, Right half = shoot direction. Save humans!',
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
    function playShoot() { playTone(1100, 0.05, 'square', 0.12); }
    function playExplode() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.15, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      src.start();
    }
    function playRescue() { playTone(1047, 0.18, 'sine', 0.3); }
    function playGameOver() { [280, 220, 160, 110].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.3), i * 120)); }

    const GH = H - SAFE;
    const ARENA = { l: 8, r: W - 8, t: 52, b: GH - 8 };

    let player, enemies, humans, bullets, particles, score, lives, wave, running, tick, spawnT, started;
    let mvx = 0, mvy = 0, shx = 0, shy = 0;

    function spawnEnemy(type) {
      const edge = (Math.random() * 4) | 0;
      let x, y;
      if (edge === 0) { x = Math.random() * W; y = ARENA.t + 5; }
      else if (edge === 1) { x = Math.random() * W; y = ARENA.b - 5; }
      else if (edge === 2) { x = ARENA.l + 5; y = ARENA.t + Math.random() * (ARENA.b - ARENA.t); }
      else { x = ARENA.r - 5; y = ARENA.t + Math.random() * (ARENA.b - ARENA.t); }
      enemies.push({ x, y, type, alive: true, t: Math.random() * 60, cool: 60 + Math.random() * 60 });
    }

    function reset() {
      player = { x: W / 2, y: GH / 2, cool: 0, invul: 90 };
      enemies = []; humans = []; bullets = []; particles = [];
      for (let i = 0; i < 3; i++) humans.push({ x: Math.random() * (W - 100) + 50, y: ARENA.t + Math.random() * (ARENA.b - ARENA.t - 40) + 20, alive: true });
      for (let i = 0; i < 6; i++) spawnEnemy('grunt');
      wave = 1; score = 0; lives = 3; running = true; tick = 0; spawnT = 0;
      mvx = 0; mvy = 0; shx = 0; shy = 0;
    }

    function hit() {
      lives--;
      for (let i = 0; i < 16; i++) particles.push({ x: player.x, y: player.y, vx: (Math.random() - 0.5) * 250, vy: (Math.random() - 0.5) * 250, c: '#00FFFF', life: 0.5 });
      ctx.platform.haptic('heavy'); playExplode();
      player.x = W / 2; player.y = GH / 2; player.invul = 90;
      if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'player destroyed' }); playGameOver(); }
    }

    // Multi-touch: left half of screen = move joystick, right half = shoot direction
    let leftId = null, leftOrig = { x: 0, y: 0 };
    let rightId = null, rightOrig = { x: 0, y: 0 };

    function handleTouchStart(e) {
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
      for (const t of e.changedTouches) {
        if (t.clientX < W / 2 && leftId === null) {
          leftId = t.identifier; leftOrig = { x: t.clientX, y: t.clientY }; mvx = 0; mvy = 0;
        } else if (t.clientX >= W / 2 && rightId === null) {
          rightId = t.identifier; rightOrig = { x: t.clientX, y: t.clientY }; shx = 0; shy = 0;
        }
      }
    }
    function handleTouchMove(e) {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === leftId) {
          const dx = t.clientX - leftOrig.x, dy = t.clientY - leftOrig.y;
          const d = Math.hypot(dx, dy), max = 55;
          if (d > max) { mvx = dx / d; mvy = dy / d; } else { mvx = dx / max; mvy = dy / max; }
        } else if (t.identifier === rightId) {
          const dx = t.clientX - rightOrig.x, dy = t.clientY - rightOrig.y;
          const d = Math.hypot(dx, dy), max = 55;
          if (d > max) { shx = dx / d; shy = dy / d; } else { shx = dx / max; shy = dy / max; }
        }
      }
    }
    function handleTouchEnd(e) {
      for (const t of e.changedTouches) {
        if (t.identifier === leftId) { leftId = null; mvx = 0; mvy = 0; }
        if (t.identifier === rightId) { rightId = null; shx = 0; shy = 0; }
      }
    }

    ctx.listen(canvas, 'touchstart', (e) => { e.preventDefault(); handleTouchStart(e); }, { passive: false });
    ctx.listen(canvas, 'touchmove', (e) => { handleTouchMove(e); }, { passive: false });
    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); handleTouchEnd(e); }, { passive: false });

    reset();

    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      if (running && started) {
        if (player.invul > 0) player.invul--;

        // Move player
        const spd = 280;
        player.x = Math.max(ARENA.l + 8, Math.min(ARENA.r - 8, player.x + mvx * spd * sec));
        player.y = Math.max(ARENA.t + 8, Math.min(ARENA.b - 8, player.y + mvy * spd * sec));

        // Auto-fire in shoot direction
        if ((Math.abs(shx) > 0.15 || Math.abs(shy) > 0.15) && player.cool <= 0) {
          const m = Math.hypot(shx, shy);
          bullets.push({ x: player.x, y: player.y, vx: shx / m * 500, vy: shy / m * 500, life: 0.7, friendly: true });
          player.cool = 100;
          playShoot();
        }
        if (player.cool > 0) player.cool -= dt;

        // Spawn enemies
        spawnT += dt;
        if (spawnT > Math.max(1500, 4000 - wave * 200) && enemies.filter(e => e.alive).length < 10 + wave) {
          spawnT = 0;
          const type = wave > 2 && Math.random() < 0.25 ? 'brain' : Math.random() < 0.18 ? 'hulk' : 'grunt';
          spawnEnemy(type);
        }

        enemies.forEach(e => {
          if (!e.alive) return;
          const dx = player.x - e.x, dy = player.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = (e.type === 'hulk' ? 60 : e.type === 'brain' ? 80 : 100) * sec;
          e.x += dx / d * sp; e.y += dy / d * sp;
          if (e.type === 'brain') {
            e.cool -= dt;
            if (e.cool <= 0 && Math.random() < 0.012) {
              bullets.push({ x: e.x, y: e.y, vx: dx / d * 160, vy: dy / d * 160, life: 1.5, friendly: false });
              e.cool = 1500;
            }
          }
          if (e.type === 'hulk') {
            humans.forEach(h => { if (h.alive && Math.abs(h.x - e.x) < 14 && Math.abs(h.y - e.y) < 16) { h.alive = false; for (let i = 0; i < 10; i++) particles.push({ x: h.x, y: h.y, vx: (Math.random() - 0.5) * 150, vy: (Math.random() - 0.5) * 150, c: '#FFCC99', life: 0.4 }); } });
          }
        });

        bullets.forEach(b => { b.x += b.vx * sec; b.y += b.vy * sec; b.life -= sec; });
        bullets = bullets.filter(b => b.life > 0 && b.x > 0 && b.x < W && b.y > ARENA.t && b.y < ARENA.b);

        // Friendly bullet hits enemy
        bullets.forEach(b => {
          if (!b.friendly) return;
          enemies.forEach(e => {
            if (!e.alive) return;
            if (Math.abs(b.x - e.x) < 12 && Math.abs(b.y - e.y) < 14) {
              if (e.type === 'hulk') { e.x += b.vx * 0.05; e.y += b.vy * 0.05; b.life = 0; }
              else {
                e.alive = false; b.life = 0;
                score += e.type === 'brain' ? 500 : 100;
                ctx.platform.setScore(score);
                for (let i = 0; i < 14; i++) particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, c: e.type === 'brain' ? '#FF00FF' : '#FF2222', life: 0.5 });
                playExplode();
              }
            }
          });
        });

        // Enemy/bullet hits player
        if (player.invul <= 0) {
          bullets.forEach(b => { if (!b.friendly && Math.abs(b.x - player.x) < 10 && Math.abs(b.y - player.y) < 10) { b.life = 0; hit(); } });
          enemies.forEach(e => { if (!e.alive) return; if (Math.abs(e.x - player.x) < 12 && Math.abs(e.y - player.y) < 14) hit(); });
        }

        // Rescue humans
        humans.forEach(h => {
          if (!h.alive) return;
          if (Math.abs(h.x - player.x) < 16 && Math.abs(h.y - player.y) < 18) {
            h.alive = false; score += 1000; ctx.platform.setScore(score);
            for (let i = 0; i < 14; i++) particles.push({ x: h.x, y: h.y, vx: (Math.random() - 0.5) * 150, vy: (Math.random() - 0.5) * 150, c: '#00FFFF', life: 0.5 });
            playRescue();
          }
        });

        if (enemies.filter(e => e.alive && e.type !== 'hulk').length === 0) {
          wave++; score += 500; ctx.platform.setScore(score);
          for (let i = 0; i < 3; i++) humans.push({ x: Math.random() * (W - 100) + 50, y: ARENA.t + Math.random() * (ARENA.b - ARENA.t - 40) + 20, alive: true });
          for (let i = 0; i < 6 + wave; i++) spawnEnemy(Math.random() < 0.2 ? 'hulk' : Math.random() < 0.15 && wave > 1 ? 'brain' : 'grunt');
          playTone(880, 0.2, 'sine', 0.3);
        }

        particles = particles.filter(p => { p.x += p.vx * sec; p.y += p.vy * sec; p.life -= sec; return p.life > 0; });
      }

      // Draw
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(0,200,255,0.07)'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.strokeStyle = '#00FFFF'; g.lineWidth = 2; g.strokeRect(ARENA.l, ARENA.t, ARENA.r - ARENA.l, ARENA.b - ARENA.t);
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Humans
      humans.forEach(h => {
        if (!h.alive) return;
        g.fillStyle = '#FFCC99'; g.fillRect(h.x - 3, h.y - 10, 6, 5);
        g.fillStyle = '#00FFFF'; g.fillRect(h.x - 3, h.y - 5, 6, 6);
        g.fillStyle = '#FFF'; g.fillRect(h.x - 4, h.y + 1, 3, 4); g.fillRect(h.x + 1, h.y + 1, 3, 4);
      });

      // Enemies
      enemies.forEach(e => {
        if (!e.alive) return;
        if (e.type === 'grunt') {
          g.fillStyle = '#FF2222'; g.fillRect(e.x - 7, e.y - 9, 14, 18);
          g.fillStyle = '#FFFF00'; g.fillRect(e.x - 5, e.y - 7, 4, 4); g.fillRect(e.x + 1, e.y - 7, 4, 4);
          g.fillStyle = '#000'; g.fillRect(e.x - 4, e.y - 6, 2, 2); g.fillRect(e.x + 2, e.y - 6, 2, 2);
        } else if (e.type === 'hulk') {
          g.fillStyle = '#00FF00'; g.fillRect(e.x - 10, e.y - 12, 20, 24);
          g.fillStyle = '#FFFF00'; g.fillRect(e.x - 7, e.y - 9, 5, 5); g.fillRect(e.x + 2, e.y - 9, 5, 5);
          g.fillStyle = '#F00'; g.fillRect(e.x - 5, e.y - 7, 2, 2); g.fillRect(e.x + 3, e.y - 7, 2, 2);
        } else {
          g.fillStyle = '#FF00FF';
          g.beginPath(); g.arc(e.x, e.y - 2, 9, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#FFAAFF'; g.lineWidth = 1;
          g.beginPath(); g.arc(e.x - 2, e.y - 2, 2, 0, Math.PI * 2); g.stroke();
          g.fillStyle = '#FFFF00'; g.fillRect(e.x - 1, e.y + 1, 2, 2);
        }
      });

      // Bullets
      bullets.forEach(b => {
        g.fillStyle = b.friendly ? '#FFF' : '#FF4444';
        g.fillRect(b.x - 3, b.y - 3, 6, 6);
        g.globalAlpha = 0.35;
        g.fillStyle = b.friendly ? '#00FFFF' : '#FF0000';
        g.fillRect(b.x - 5, b.y - 5, 10, 10);
        g.globalAlpha = 1;
      });

      // Player
      if (player.invul <= 0 || tick % 6 < 3) {
        g.fillStyle = '#FFF'; g.fillRect(player.x - 7, player.y - 9, 14, 18);
        g.fillStyle = '#00FFFF'; g.fillRect(player.x - 7, player.y - 9, 14, 5);
        g.fillStyle = '#FF00FF'; g.fillRect(player.x - 5, player.y - 4, 10, 5);
        g.fillStyle = '#000'; g.fillRect(player.x - 4, player.y - 8, 2, 2); g.fillRect(player.x + 2, player.y - 8, 2, 2);
      }

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // Joystick UI indicators
      if (started && running) {
        g.strokeStyle = 'rgba(0,255,255,0.3)'; g.lineWidth = 2;
        g.beginPath(); g.arc(80, GH - 80, 40, 0, Math.PI * 2); g.stroke();
        g.fillStyle = 'rgba(0,255,255,0.6)';
        g.beginPath(); g.arc(80 + mvx * 30, GH - 80 + mvy * 30, 12, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,0,255,0.3)'; g.lineWidth = 2;
        g.beginPath(); g.arc(W - 80, GH - 80, 40, 0, Math.PI * 2); g.stroke();
        g.fillStyle = 'rgba(255,0,255,0.6)';
        g.beginPath(); g.arc(W - 80 + shx * 30, GH - 80 + shy * 30, 12, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,255,255,0.5)'; g.font = '10px "Courier New"'; g.textAlign = 'center';
        g.fillText('MOVE', 80, GH - 25);
        g.fillStyle = 'rgba(255,0,255,0.5)';
        g.fillText('SHOOT', W - 80, GH - 25);
        g.textAlign = 'left';
      }

      // HUD
      g.fillStyle = '#00FFFF'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'center'; g.fillText('WAVE ' + wave, W / 2, 28);
      g.textAlign = 'right'; g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FFFF'; g.font = 'bold 22px "Courier New"'; g.textAlign = 'center';
        g.fillText('ROBOTRON: 2084', W / 2, H / 2 - 50);
        g.fillStyle = '#FFF'; g.font = '14px "Courier New"';
        g.fillText('LEFT half drag = move', W / 2, H / 2 - 5);
        g.fillText('RIGHT half drag = shoot direction', W / 2, H / 2 + 20);
        g.fillText('Touch RIGHT and drag to fire!', W / 2, H / 2 + 45);
        g.fillStyle = '#FFFF00'; g.font = 'bold 16px "Courier New"'; g.fillText('TAP TO START', W / 2, H / 2 + 85);
        g.textAlign = 'left';
      }

      if (!running) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF2244'; g.font = 'bold 30px "Courier New"'; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"'; g.fillText('SCORE ' + score + ' · WAVE ' + wave, W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"'; g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
