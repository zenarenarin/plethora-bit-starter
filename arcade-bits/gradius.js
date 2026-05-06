window.plethoraBit = {
  meta: {
    title: 'Gradius',
    author: 'plethora',
    description: 'Collect capsules. Power up. Survive.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_gradius';

    let state = 'title';
    let score = 0, highScore = ctx.storage.get(HS_KEY) || 0;
    let audioCtx = null;

    function initAudio() { if (audioCtx) return; audioCtx = new AudioContext(); }
    function beep(freq, type, dur, vol = 0.25) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { beep(900, 'square', 0.07, 0.12); }
    function playPowerup() { [400,600,800,1000].forEach((f,i) => setTimeout(() => beep(f,'sine',0.12,0.3), i*60)); }
    function playExplode() { beep(120, 'sawtooth', 0.35, 0.5); }
    function playGameOver() { [500,400,300,200,100].forEach((f,i) => setTimeout(() => beep(f,'sine',0.18,0.3), i*180)); }

    // Power-up system
    const POWERS = ['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION', 'SHIELD'];
    let powerMeter = 0; // 0-5 active index
    let powers = { speed: 0, missile: false, double: false, laser: false, options: 0, shield: false };
    let capsules = [];
    let options = []; // trailing ships

    let ship = { x: W * 0.15, y: H / 2, vy: 0 };
    let bullets = [], missiles = [], enemyBullets = [];
    let enemies = [], particles = [], stars = [];
    let bgScroll = 0, groundObstacles = [];

    for (let i = 0; i < 50; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 + 0.5, spd: Math.random() + 0.5 });

    let wave = 0, spawnTimer = 0, autoFireTimer = 0;
    let powerButtonY = 0;
    let powerPulse = 0;

    function resetGame() {
      score = 0; wave = 0; spawnTimer = 0; autoFireTimer = 0; powerMeter = 0;
      powers = { speed: 0, missile: false, double: false, laser: false, options: 0, shield: false };
      options = [];
      ship = { x: W * 0.15, y: H / 2, vy: 0 };
      bullets = []; missiles = []; enemyBullets = []; enemies = []; capsules = []; particles = [];
    }

    let dragging = false;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }
      // Power button
      if (tx > W * 0.7 && ty > H * 0.8 - ctx.safeArea.bottom) {
        activatePower(); return;
      }
      dragging = true;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!dragging || state !== 'play') return;
      const t = e.changedTouches[0];
      ship.y = Math.max(30, Math.min(H - ctx.safeArea.bottom - 40, t.clientY));
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); dragging = false; }, { passive: false });

    function activatePower() {
      const p = POWERS[powerMeter];
      if (p === 'SPEED') powers.speed = Math.min(powers.speed + 1, 3);
      else if (p === 'MISSILE') powers.missile = true;
      else if (p === 'DOUBLE') powers.double = true;
      else if (p === 'LASER') powers.laser = true;
      else if (p === 'OPTION') { if (powers.options < 2) powers.options++; }
      else if (p === 'SHIELD') powers.shield = true;
      // Rebuild options
      options = [];
      for (let i = 0; i < powers.options; i++) options.push({ x: ship.x - 40 * (i + 1), y: ship.y, hist: [] });
      playPowerup();
      ctx.platform.haptic('medium');
      powerMeter = Math.min(powerMeter + 1, POWERS.length - 1);
    }

    function fireBullet(x, y) {
      bullets.push({ x, y, vx: 13, vy: 0 });
      if (powers.double) bullets.push({ x, y: y - 12, vx: 12, vy: -0.5 });
      if (powers.laser) bullets.push({ x, y, vx: 18, vy: 0, laser: true });
      if (powers.missile) missiles.push({ x, y: y + 10, vx: 6, vy: 3, homing: false });
      playShoot();
    }

    function spawnEnemy() {
      const types = ['grunt', 'dive', 'orbit'];
      const t = types[Math.floor(Math.random() * Math.min(types.length, 1 + Math.floor(wave / 2)))];
      enemies.push({ x: W + 20, y: Math.random() * (H * 0.7) + H * 0.1, vx: -(1.5 + wave * 0.15), vy: 0, hp: 1 + Math.floor(wave / 4), type: t, phase: Math.random() * Math.PI * 2, fireTimer: 60 + Math.random() * 80 });
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    function drawVic(x, y, optionShip = false) {
      g.save(); g.translate(x, y);
      g.fillStyle = optionShip ? '#f84' : '#4f8';
      g.beginPath(); g.moveTo(20, 0); g.lineTo(-14, -10); g.lineTo(-8, 0); g.lineTo(-14, 10); g.closePath(); g.fill();
      g.fillStyle = optionShip ? '#ff8' : '#afa';
      g.beginPath(); g.ellipse(4, 0, 7, 4, 0, 0, Math.PI * 2); g.fill();
      if (powers.shield && !optionShip) {
        g.strokeStyle = 'rgba(100,180,255,0.6)'; g.lineWidth = 3;
        g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }

    // Ship position history for options
    let shipHist = [];

    ctx.raf((dt) => {
      const spd = dt / 16;

      g.fillStyle = '#00010a'; g.fillRect(0, 0, W, H);

      // Parallax stars
      for (const s of stars) {
        s.x -= s.spd * spd; if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
        g.fillStyle = `rgba(255,255,255,${0.5 + s.s * 0.2})`; g.fillRect(s.x, s.y, s.s, s.s);
      }

      if (state === 'title') {
        g.fillStyle = '#f84'; g.font = `bold ${W * 0.12}px monospace`; g.textAlign = 'center';
        g.fillText('GRADIUS', W / 2, H * 0.36);
        g.fillStyle = '#4f8'; g.font = `${W * 0.042}px monospace`;
        g.fillText('DRAG to move  COLLECT capsules', W / 2, H * 0.52);
        g.fillStyle = '#ff8'; g.font = `${W * 0.05}px monospace`;
        g.fillText('TAP TO START', W / 2, H * 0.68);
        g.fillStyle = '#888'; g.font = `${W * 0.04}px monospace`;
        g.fillText(`HI: ${highScore}`, W / 2, H * 0.8);
        return;
      }

      if (state === 'over') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H * 0.38);
        g.fillStyle = '#fff'; g.font = `${W * 0.05}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H * 0.52);
        g.fillStyle = '#ff8'; g.fillText(`BEST: ${highScore}`, W / 2, H * 0.62);
        g.fillStyle = '#4f8'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      // Track ship history for options
      shipHist.push({ x: ship.x, y: ship.y });
      if (shipHist.length > 200) shipHist.shift();

      // Update options
      for (let i = 0; i < options.length; i++) {
        const idx = Math.max(0, shipHist.length - 1 - (i + 1) * 30);
        options[i].x = shipHist[idx].x;
        options[i].y = shipHist[idx].y;
      }

      // Auto fire
      autoFireTimer -= dt;
      if (autoFireTimer <= 0) {
        autoFireTimer = powers.laser ? 180 : 220;
        fireBullet(ship.x + 20, ship.y);
        for (const op of options) fireBullet(op.x + 20, op.y);
      }

      // Spawn enemies
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = Math.max(40, 90 - wave * 3);
        spawnEnemy();
        if (Math.random() < 0.15) {
          capsules.push({ x: W + 10, y: Math.random() * H * 0.7 + H * 0.1 });
        }
        if (spawnTimer < 60 && Math.random() < 0.02) wave++;
      }
      wave = Math.min(wave + dt * 0.0001, 12);

      // Move + draw bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * spd;
        if (b.x > W + 20) { bullets.splice(i, 1); continue; }
        if (b.laser) { g.strokeStyle = '#0ff'; g.lineWidth = 3; g.beginPath(); g.moveTo(b.x - 18, b.y); g.lineTo(b.x, b.y); g.stroke(); }
        else { g.fillStyle = '#ff8'; g.fillRect(b.x - 8, b.y - 2, 10, 3); }
        // Hit
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (Math.abs(b.x - en.x) < 18 && Math.abs(b.y - en.y) < 16) {
            en.hp--; spawnParticles(en.x, en.y, '#f84', 4);
            if (!b.laser) { bullets.splice(i, 1); hit = true; }
            if (en.hp <= 0) {
              score += 150; ctx.platform.setScore(score);
              spawnParticles(en.x, en.y, '#ff8', 10);
              playExplode();
              if (Math.random() < 0.3) capsules.push({ x: en.x, y: en.y });
              enemies.splice(j, 1);
              if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
            }
            break;
          }
        }
        if (hit) continue;
      }

      // Missiles
      for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i];
        m.x += m.vx * spd; m.y += m.vy * spd;
        if (m.y > H || m.x > W) { missiles.splice(i, 1); continue; }
        // Home on nearest
        let nearest = null, nd = 9999;
        for (const en of enemies) {
          const d = Math.hypot(en.x - m.x, en.y - m.y);
          if (d < nd) { nd = d; nearest = en; }
        }
        if (nearest && nd < 200) {
          const dx = nearest.x - m.x, dy = nearest.y - m.y, dist = Math.hypot(dx, dy);
          m.vx += (dx / dist) * 0.3 * spd; m.vy += (dy / dist) * 0.3 * spd;
        }
        g.fillStyle = '#f0a'; g.beginPath(); g.arc(m.x, m.y, 4, 0, Math.PI * 2); g.fill();
      }

      // Capsules
      for (let i = capsules.length - 1; i >= 0; i--) {
        const c = capsules[i];
        c.x -= 1.5 * spd;
        if (c.x < -20) { capsules.splice(i, 1); continue; }
        // Draw
        g.fillStyle = '#ff0';
        g.beginPath(); g.arc(c.x, c.y, 10, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#000'; g.font = `bold 10px monospace`; g.textAlign = 'center';
        g.fillText('P', c.x, c.y + 4);
        // Collect
        if (Math.hypot(c.x - ship.x, c.y - ship.y) < 24) {
          powerMeter = Math.min(powerMeter + 1, POWERS.length - 1);
          capsules.splice(i, 1);
          playPowerup(); ctx.platform.haptic('light');
        }
      }

      // Enemy bullets
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) { enemyBullets.splice(i, 1); continue; }
        g.fillStyle = '#f44'; g.beginPath(); g.arc(b.x, b.y, 4, 0, Math.PI * 2); g.fill();
        if (!powers.shield && Math.hypot(b.x - ship.x, b.y - ship.y) < 18) {
          powers.shield = false;
          spawnParticles(ship.x, ship.y, '#4f8', 14); playExplode(); playGameOver();
          ctx.platform.haptic('heavy');
          state = 'over'; return;
        }
      }

      // Enemies
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        en.x += en.vx * spd;
        if (en.type === 'dive') en.y += Math.sin(Date.now() * 0.003 + en.phase) * 1.5 * spd;
        if (en.type === 'orbit') en.y = H / 2 + Math.sin(Date.now() * 0.002 + en.phase) * H * 0.35;
        if (en.x < -30) { enemies.splice(i, 1); continue; }
        en.fireTimer -= dt;
        if (en.fireTimer <= 0) {
          en.fireTimer = 1000 + Math.random() * 600;
          const dx = ship.x - en.x, dy = ship.y - en.y, dist = Math.hypot(dx, dy);
          enemyBullets.push({ x: en.x, y: en.y, vx: (dx / dist) * 3.5, vy: (dy / dist) * 3.5 });
        }
        // Draw
        g.save(); g.translate(en.x, en.y);
        const ecol = en.type === 'grunt' ? '#c44' : en.type === 'dive' ? '#c4c' : '#c84';
        g.fillStyle = ecol;
        g.beginPath(); g.moveTo(-14, 0); g.lineTo(6, -12); g.lineTo(14, 0); g.lineTo(6, 12); g.closePath(); g.fill();
        g.fillStyle = '#f88'; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
        g.restore();
        // Collision with ship
        if (!powers.shield && Math.hypot(en.x - ship.x, en.y - ship.y) < 22) {
          spawnParticles(ship.x, ship.y, '#4f8', 14); playExplode(); playGameOver();
          ctx.platform.haptic('heavy'); state = 'over'; return;
        }
      }

      // Particles
      g.globalAlpha = 1;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.04 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life;
        g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      // Options
      for (const op of options) drawVic(op.x, op.y, true);
      drawVic(ship.x, ship.y, false);

      // HUD
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 28);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 28);

      // Power meter bar
      const barW = W * 0.55, barX = W * 0.05, barY = H - ctx.safeArea.bottom - 52;
      g.fillStyle = '#222'; g.fillRect(barX, barY, barW, 20);
      for (let i = 0; i < POWERS.length; i++) {
        const px = barX + (barW / POWERS.length) * i;
        const pw = barW / POWERS.length - 2;
        g.fillStyle = i < powerMeter ? '#4f8' : (i === powerMeter ? '#ff8' : '#444');
        g.fillRect(px + 1, barY + 1, pw, 18);
        g.fillStyle = '#000'; g.font = `9px monospace`; g.textAlign = 'center';
        g.fillText(POWERS[i].substring(0, 3), px + pw / 2 + 1, barY + 13);
      }

      // Power button
      const btnX = W * 0.72, btnY = H - ctx.safeArea.bottom - 50;
      g.fillStyle = '#ff8';
      g.beginPath(); g.roundRect(btnX, btnY, W * 0.22, 40, 8); g.fill();
      g.fillStyle = '#000'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'center';
      g.fillText('POWER', btnX + W * 0.11, btnY + 26);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
