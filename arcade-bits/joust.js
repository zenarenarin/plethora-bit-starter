// JOUST — Flap and lance (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Joust',
    author: 'plethora',
    description: 'Tap to flap. Tap L or R half to steer. Hit enemies from above!',
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
    function playFlap() { playTone(400, 0.06, 'square', 0.18); }
    function playKill() { playTone(880, 0.15, 'sine', 0.3); }
    function playDie() { [400, 300, 200].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'sawtooth', 0.3), i * 100)); }
    function playEgg() { playTone(600, 0.1, 'sine', 0.2); }
    function playWave() { playTone(1000, 0.2, 'sine', 0.3); }

    const GH = H - SAFE;

    let player, enemies, eggs, platforms, particles, score, lives, running, tick, wave, started;

    function spawnEnemy() {
      const ex = Math.random() < 0.5 ? 30 : W - 30;
      const types = ['bounder', 'hunter', 'shadow'];
      const t = types[Math.min(types.length - 1, Math.floor(wave / 2))];
      enemies.push({ x: ex, y: GH * 0.25, vx: (Math.random() - 0.5) * 60, vy: 0, face: ex < W / 2 ? 1 : -1, type: t, flapT: 0, alive: true });
    }

    function reset() {
      platforms = [
        { x: W * 0.05, y: GH * 0.3, w: W * 0.34 },
        { x: W * 0.61, y: GH * 0.3, w: W * 0.34 },
        { x: W * 0.24, y: GH * 0.55, w: W * 0.52 },
        { x: W * 0.05, y: GH * 0.77, w: W * 0.24 },
        { x: W * 0.71, y: GH * 0.77, w: W * 0.24 },
        { x: 0, y: GH - 30, w: W },
      ];
      player = { x: W / 2, y: GH * 0.55, vx: 0, vy: 0, face: 1, flapT: 0, onGround: false };
      enemies = []; eggs = []; particles = [];
      wave = 1; score = 0; lives = 3; running = true; tick = 0;
      spawnEnemy(); spawnEnemy(); spawnEnemy();
    }

    function landOnPlatform(o) {
      for (const p of platforms) {
        if (o.x > p.x && o.x < p.x + p.w && o.vy >= 0 && Math.abs(o.y - p.y) < 10) {
          o.y = p.y; o.vy = 0; return true;
        }
      }
      return false;
    }

    function flap() {
      if (!running) return;
      player.vy = -280; player.flapT = 10;
      playFlap(); ctx.platform.haptic('light');
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
      const t = e.changedTouches[0];
      const x = t.clientX;
      if (x < W / 2) { player.vx = Math.max(player.vx - 120, -300); player.face = -1; }
      else { player.vx = Math.min(player.vx + 120, 300); player.face = 1; }
      flap();
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    reset();

    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      if (running && started) {
        const G = 480;

        // Player physics
        player.vy = Math.min(player.vy + G * sec, 400);
        player.x += player.vx * sec;
        player.y += player.vy * sec;
        player.vx *= Math.pow(0.92, 60 * sec);
        if (player.x < 0) player.x += W;
        if (player.x > W) player.x -= W;
        player.onGround = landOnPlatform(player);
        if (player.flapT > 0) player.flapT--;

        // Lava
        if (player.y > GH - 15) {
          lives--; ctx.platform.haptic('heavy');
          for (let i = 0; i < 14; i++) particles.push({ x: player.x, y: GH - 15, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 200, c: '#FF6600', life: 0.5 });
          player.x = W / 2; player.y = GH * 0.5; player.vy = 0; player.vx = 0;
          playDie();
          if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'fell in lava' }); }
        }

        // Enemies
        enemies.forEach(e => {
          if (!e.alive) return;
          e.vy = Math.min(e.vy + G * 0.7 * sec, 350);
          if (tick % 45 === 0 && e.y > player.y + 30) { e.vy = -240; e.flapT = 8; }
          if (Math.random() < 0.015) { e.vx += Math.sign(player.x - e.x) * 30; e.face = Math.sign(player.x - e.x) || 1; }
          e.vx *= Math.pow(0.95, 60 * sec);
          e.x += e.vx * sec; e.y += e.vy * sec;
          if (e.x < 0) e.x += W; if (e.x > W) e.x -= W;
          landOnPlatform(e);
          if (e.y > GH - 15) { e.alive = false; score += 50; ctx.platform.setScore(score); }
          if (e.flapT > 0) e.flapT--;
          // Collide with player
          if (Math.abs(e.x - player.x) < 18 && Math.abs(e.y - player.y) < 16) {
            if (player.y < e.y - 5) {
              e.alive = false; score += 250; ctx.platform.setScore(score);
              eggs.push({ x: e.x, y: e.y, vy: 0, hatch: 0 });
              for (let i = 0; i < 14; i++) particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, c: '#FFFF00', life: 0.5 });
              player.vy = -200; playKill();
            } else if (e.y < player.y - 5) {
              lives--; ctx.platform.haptic('heavy');
              for (let i = 0; i < 14; i++) particles.push({ x: player.x, y: player.y, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180, c: '#FF4444', life: 0.5 });
              player.x = W / 2; player.y = GH * 0.35; player.vy = 0; playDie();
              if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'jousted from below' }); }
            } else {
              const dx = Math.sign(player.x - e.x) || 1;
              player.vx = dx * 200; e.vx = -dx * 120;
            }
          }
        });
        enemies = enemies.filter(e => e.alive);

        // Eggs
        eggs.forEach(e => {
          if (!landOnPlatform(e)) { e.vy = Math.min(e.vy + G * sec, 300); e.y += e.vy * sec; }
          e.hatch += dt;
          if (e.y > GH - 15) e.hatch = 9999;
          if (e.hatch > 3000) {
            e.done = true;
            if (e.y < GH - 20) enemies.push({ x: e.x, y: e.y, vx: 0, vy: 0, face: 1, type: 'bounder', flapT: 0, alive: true });
          }
          if (Math.abs(e.x - player.x) < 14 && Math.abs(e.y - player.y) < 16) { e.done = true; score += 50; ctx.platform.setScore(score); playEgg(); }
        });
        eggs = eggs.filter(e => !e.done);

        if (enemies.length === 0 && eggs.length === 0) {
          wave++; score += 200; ctx.platform.setScore(score); playWave();
          for (let i = 0; i < Math.min(5, 2 + wave); i++) spawnEnemy();
        }

        particles = particles.filter(p => { p.x += p.vx * sec; p.y += p.vy * sec; p.vy += 200 * sec; p.life -= sec; return p.life > 0; });
      }

      // Draw
      g.fillStyle = '#000030'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 60; i++) { const sx = (i * 97) % W, sy = (i * 53) % GH; g.fillStyle = '#FFF'; g.fillRect(sx, sy, 1, 1); }

      // Lava
      const lgrad = g.createLinearGradient(0, GH - 30, 0, GH);
      lgrad.addColorStop(0, '#FF6600'); lgrad.addColorStop(0.5, '#FFAA00'); lgrad.addColorStop(1, '#FF0000');
      g.fillStyle = lgrad; g.fillRect(0, GH - 30, W, 30);
      for (let i = 0; i < 6; i++) {
        const bx = (i * 167 + tick * 1.5) % W;
        const by = GH - 10 - Math.sin(tick * 0.08 + i) * 4;
        g.fillStyle = '#FFFF00'; g.fillRect(bx, by, 3, 3);
      }

      // Platforms
      platforms.forEach(p => {
        if (p.y > GH - 35) return;
        g.fillStyle = '#4488FF'; g.fillRect(p.x, p.y, p.w, 9);
        g.fillStyle = '#88CCFF'; g.fillRect(p.x, p.y, p.w, 2);
        g.fillStyle = '#002266'; g.fillRect(p.x, p.y + 7, p.w, 2);
      });

      // Eggs
      eggs.forEach(e => {
        g.fillStyle = '#FFFFCC';
        g.beginPath(); g.ellipse(e.x, e.y, 6, 8, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#886600'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(e.x, e.y, 6, 8, 0, 0, Math.PI * 2); g.stroke();
      });

      // Draw a rider (bird + knight)
      function drawRider(x, y, face, color, flapping) {
        const fw = flapping ? (Math.sin(tick * 0.4) > 0 ? 1 : 0) : 0;
        g.save(); g.translate(x, y); g.scale(face, 1);
        g.fillStyle = color;
        g.fillRect(-10, -5, 20, 12);
        g.fillRect(-14, -8 - fw * 5, 10, 5);
        g.fillRect(4, -8 - fw * 5, 10, 5);
        g.fillRect(7, -10, 5, 7);
        g.fillStyle = '#FFAA00'; g.fillRect(12, -8, 4, 2);
        g.fillStyle = '#C0C0C0'; g.fillRect(12, -14, 14, 2);
        g.fillStyle = '#FF0000'; g.fillRect(-3, -18, 8, 10);
        g.fillStyle = '#FFFF00'; g.fillRect(-4, -22, 10, 5);
        g.restore();
      }

      // Enemies
      enemies.forEach(e => {
        if (!e.alive) return;
        const col = e.type === 'bounder' ? '#AAAAAA' : e.type === 'hunter' ? '#FF2222' : '#AA00AA';
        drawRider(e.x, e.y, e.face, col, e.flapT > 0);
      });

      // Player
      drawRider(player.x, player.y, player.face, '#FFFF00', player.flapT > 0);

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // HUD
      g.fillStyle = '#FFAA00'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'center'; g.fillText('WAVE ' + wave, W / 2, 28);
      g.textAlign = 'right'; g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,50,0.85)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FFAA00'; g.font = 'bold 28px "Courier New"'; g.textAlign = 'center';
        g.fillText('JOUST', W / 2, H / 2 - 40);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('TAP LEFT half = fly left', W / 2, H / 2 + 5);
        g.fillText('TAP RIGHT half = fly right', W / 2, H / 2 + 30);
        g.fillText('Hit enemies from ABOVE!', W / 2, H / 2 + 55);
        g.fillStyle = '#FFFF00'; g.font = 'bold 16px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 90);
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
