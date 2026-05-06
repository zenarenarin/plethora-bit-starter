window.plethoraBit = {
  meta: {
    title: 'Time Pilot',
    author: 'plethora',
    description: 'Fly through time. Biplanes to UFOs.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_timepilot';

    let state = 'title';
    let score = 0, highScore = ctx.storage.get(HS_KEY) || 0;
    let audioCtx = null;

    function initAudio() { if (audioCtx) return; audioCtx = new AudioContext(); }
    function beep(f, type, dur, vol = 0.2) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = f;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { beep(700, 'square', 0.06, 0.12); }
    function playExplode() { beep(130, 'sawtooth', 0.3, 0.45); }
    function playEraAdvance() { [400,600,900,1200,1600].forEach((f,i) => setTimeout(() => beep(f,'sine',0.15,0.35), i*80)); }
    function playGameOver() { [400,300,200,100].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.3), i*160)); }

    const ERAS = [
      { name: '1910s BIPLANES', bg1: '#6ad', bg2: '#4a8', enemies: 'biplane', killsNeeded: 20, spawnRate: 1200, enemySpeed: 0.8 },
      { name: '1940s WWII', bg1: '#48a', bg2: '#362', enemies: 'wwii', killsNeeded: 25, spawnRate: 1000, enemySpeed: 1.2 },
      { name: '1970s JETS', bg1: '#248', bg2: '#124', enemies: 'jet', killsNeeded: 30, spawnRate: 800, enemySpeed: 1.8 },
      { name: '1980s CHOPPERS', bg1: '#136', bg2: '#013', enemies: 'chopper', killsNeeded: 35, spawnRate: 700, enemySpeed: 1.4 },
      { name: '2001 UFOS', bg1: '#003', bg2: '#020', enemies: 'ufo', killsNeeded: 40, spawnRate: 600, enemySpeed: 2.0 },
    ];

    let era = 0;
    let eraKills = 0;
    let ship = { x: W / 2, y: H / 2, angle: 0, vx: 0, vy: 0 };
    let bullets = [], enemies = [], particles = [], enemyBullets = [];
    let autoFireTimer = 0, spawnTimer = 0;
    let clouds = [], stars = [];
    let joystickOrigin = null, joystickPos = null;
    let bgScroll = { x: 0, y: 0 };

    for (let i = 0; i < 8; i++) clouds.push({ x: Math.random() * W * 3, y: Math.random() * H * 3, w: 80 + Math.random() * 120 });
    for (let i = 0; i < 80; i++) stars.push({ x: Math.random() * W * 3, y: Math.random() * H * 3, s: Math.random() * 2 + 0.5 });

    function resetGame() {
      score = 0; era = 0; eraKills = 0;
      ship = { x: W / 2, y: H / 2, angle: 0, vx: 0, vy: 0 };
      bullets = []; enemies = []; particles = []; enemyBullets = [];
      spawnTimer = 0; autoFireTimer = 0;
      bgScroll = { x: 0, y: 0 };
    }

    function spawnEnemy() {
      const e = ERAS[era];
      const a = Math.random() * Math.PI * 2;
      const dist = 200 + Math.random() * 150;
      enemies.push({ x: ship.x + Math.cos(a) * dist, y: ship.y + Math.sin(a) * dist, angle: a + Math.PI, hp: 1 + Math.floor(era / 2), fireTimer: 60 + Math.random() * 80, era: era });
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 5 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    function drawEnemyShip(x, y, angle, eraIdx) {
      g.save(); g.translate(x, y); g.rotate(angle + Math.PI / 2);
      if (eraIdx === 0) { // Biplane
        g.fillStyle = '#c84'; g.fillRect(-10, -14, 20, 28);
        g.fillStyle = '#a62'; g.fillRect(-18, -4, 36, 8); g.fillRect(-14, 8, 28, 6);
      } else if (eraIdx === 1) { // WWII
        g.fillStyle = '#668'; g.fillRect(-8, -16, 16, 32);
        g.fillStyle = '#446'; g.fillRect(-20, -2, 40, 10);
      } else if (eraIdx === 2) { // Jet
        g.fillStyle = '#aaa'; g.beginPath(); g.moveTo(0, -18); g.lineTo(6, 12); g.lineTo(-6, 12); g.closePath(); g.fill();
        g.fillStyle = '#888'; g.fillRect(-16, 4, 32, 8);
      } else if (eraIdx === 3) { // Chopper
        g.fillStyle = '#484'; g.beginPath(); g.ellipse(0, 0, 10, 16, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#6a6'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(-22, -14); g.lineTo(22, -14); g.stroke();
      } else { // UFO
        g.fillStyle = '#80c'; g.beginPath(); g.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c4f'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#40a'; g.lineWidth = 1;
        for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(Math.cos(i * Math.PI / 4) * 6, Math.sin(i * Math.PI / 4) * 3); g.lineTo(Math.cos(i * Math.PI / 4) * 18, Math.sin(i * Math.PI / 4) * 8); g.stroke(); }
      }
      g.restore();
    }

    function drawPlayerShip(x, y, angle, eraIdx) {
      g.save(); g.translate(x, y); g.rotate(angle + Math.PI / 2);
      g.fillStyle = '#4af';
      if (eraIdx >= 4) {
        g.beginPath(); g.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#aef'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
      } else {
        g.beginPath(); g.moveTo(0, -18); g.lineTo(12, 10); g.lineTo(0, 4); g.lineTo(-12, 10); g.closePath(); g.fill();
        g.fillStyle = '#f84'; g.beginPath(); g.ellipse(0, 8, 5, 8, 0, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }
      joystickOrigin = { x: t.clientX, y: t.clientY };
      joystickPos = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (state !== 'play' || !joystickOrigin) return;
      joystickPos = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      const dx = joystickPos.x - joystickOrigin.x, dy = joystickPos.y - joystickOrigin.y;
      if (Math.hypot(dx, dy) > 12) ship.angle = Math.atan2(dy, dx) - Math.PI / 2;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); joystickOrigin = null; joystickPos = null; }, { passive: false });

    ctx.raf((dt) => {
      const spd = dt / 16;
      const currentEra = ERAS[Math.min(era, ERAS.length - 1)];

      // Thrust
      if (joystickOrigin && joystickPos) {
        const dx = joystickPos.x - joystickOrigin.x, dy = joystickPos.y - joystickOrigin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 12) {
          const thrust = Math.min(dist / 40, 1) * 0.25;
          ship.vx += Math.cos(ship.angle + Math.PI / 2) * thrust * spd;
          ship.vy += Math.sin(ship.angle + Math.PI / 2) * thrust * spd;
        }
      }
      ship.vx *= Math.pow(0.97, spd); ship.vy *= Math.pow(0.97, spd);
      const sv = Math.hypot(ship.vx, ship.vy);
      if (sv > 4) { ship.vx = (ship.vx / sv) * 4; ship.vy = (ship.vy / sv) * 4; }
      ship.x += ship.vx * spd; ship.y += ship.vy * spd;
      bgScroll.x = ship.x; bgScroll.y = ship.y;

      // BG
      const g1 = currentEra.bg1, g2 = currentEra.bg2;
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, g1); grad.addColorStop(1, g2);
      g.fillStyle = grad; g.fillRect(0, 0, W, H);

      // Era-specific BG
      if (era >= 4) {
        // Stars for UFO era
        for (const s of stars) {
          const sx = ((s.x - bgScroll.x * 0.2) % (W * 2) + W * 2) % (W * 2);
          const sy = ((s.y - bgScroll.y * 0.2) % (H * 2) + H * 2) % (H * 2);
          if (sx < W && sy < H) { g.fillStyle = `rgba(255,255,255,0.7)`; g.fillRect(sx - W / 2, sy - H / 2, s.s, s.s); }
        }
      } else {
        // Clouds
        for (const c of clouds) {
          const cx = ((c.x - bgScroll.x * 0.15) % (W * 2.5) + W * 2.5) % (W * 2.5) - W * 0.25;
          const cy = ((c.y - bgScroll.y * 0.15) % (H * 2.5) + H * 2.5) % (H * 2.5) - H * 0.25;
          g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.ellipse(cx, cy, c.w / 2, 22, 0, 0, Math.PI * 2); g.fill();
        }
      }

      if (state === 'title') {
        g.fillStyle = '#ff8'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('TIME PILOT', W / 2, H * 0.35);
        g.fillStyle = '#fff'; g.font = `${W * 0.038}px monospace`;
        g.fillText('DRAG to steer  AUTO fires', W / 2, H * 0.5);
        g.fillText('Destroy enemies to advance era', W / 2, H * 0.58);
        g.fillStyle = '#ff8'; g.font = `${W * 0.05}px monospace`;
        g.fillText('TAP TO START', W / 2, H * 0.72);
        g.fillStyle = '#888'; g.font = `${W * 0.04}px monospace`;
        g.fillText(`HI: ${highScore}`, W / 2, H * 0.82);
        return;
      }

      if (state === 'over') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H * 0.38);
        g.fillStyle = '#fff'; g.font = `${W * 0.05}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H * 0.52);
        g.fillStyle = '#ff8'; g.fillText(`BEST: ${highScore}`, W / 2, H * 0.62);
        g.fillStyle = '#ff8'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      const ox = W / 2 - ship.x, oy = H / 2 - ship.y;

      // Spawn enemies
      spawnTimer -= dt;
      if (spawnTimer <= 0) { spawnTimer = currentEra.spawnRate; spawnEnemy(); }

      // Auto fire
      autoFireTimer -= dt;
      if (autoFireTimer <= 0) {
        autoFireTimer = 250;
        bullets.push({ x: ship.x + Math.cos(ship.angle + Math.PI / 2) * 20, y: ship.y + Math.sin(ship.angle + Math.PI / 2) * 20, vx: Math.cos(ship.angle + Math.PI / 2) * 10 + ship.vx, vy: Math.sin(ship.angle + Math.PI / 2) * 10 + ship.vy, life: 1.5 });
        playShoot();
      }

      // Bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd; b.life -= 0.02 * spd;
        if (b.life <= 0) { bullets.splice(i, 1); continue; }
        const bsx = b.x + ox, bsy = b.y + oy;
        g.fillStyle = '#ff8'; g.beginPath(); g.arc(bsx, bsy, 4, 0, Math.PI * 2); g.fill();
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
          if (Math.hypot(b.x - enemies[j].x, b.y - enemies[j].y) < 16) {
            enemies[j].hp--;
            bullets.splice(i, 1); hit = true;
            spawnParticles(enemies[j].x + ox, enemies[j].y + oy, '#f84', 6);
            if (enemies[j].hp <= 0) {
              score += 100 * (era + 1); ctx.platform.setScore(score);
              eraKills++;
              spawnParticles(enemies[j].x + ox, enemies[j].y + oy, '#ff8', 12); playExplode();
              enemies.splice(j, 1);
              if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
              if (eraKills >= currentEra.killsNeeded) {
                era = Math.min(era + 1, ERAS.length - 1); eraKills = 0;
                playEraAdvance(); ctx.platform.haptic('heavy');
              }
            }
            break;
          }
        }
        if (hit) continue;
      }

      // Enemy bullets
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd; b.life -= 0.015 * spd;
        if (b.life <= 0) { enemyBullets.splice(i, 1); continue; }
        g.fillStyle = '#f44'; g.beginPath(); g.arc(b.x + ox, b.y + oy, 4, 0, Math.PI * 2); g.fill();
        if (Math.hypot(b.x - ship.x, b.y - ship.y) < 14) {
          spawnParticles(W / 2, H / 2, '#4af', 14); playGameOver();
          ctx.platform.haptic('heavy'); state = 'over'; return;
        }
      }

      // Enemies
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        const dx = ship.x - en.x, dy = ship.y - en.y, dist = Math.hypot(dx, dy);
        en.angle = Math.atan2(dy, dx) - Math.PI / 2;
        en.x += Math.cos(en.angle + Math.PI / 2) * currentEra.enemySpeed * spd;
        en.y += Math.sin(en.angle + Math.PI / 2) * currentEra.enemySpeed * spd;
        const esx = en.x + ox, esy = en.y + oy;
        if (esx < -100 || esx > W + 100 || esy < -100 || esy > H + 100) continue;
        drawEnemyShip(esx, esy, en.angle, en.era);
        en.fireTimer -= dt;
        if (en.fireTimer <= 0) {
          en.fireTimer = 1200 + Math.random() * 600;
          enemyBullets.push({ x: en.x, y: en.y, vx: (dx / dist) * 4.5, vy: (dy / dist) * 4.5, life: 1.8 });
        }
        if (dist < 18) {
          spawnParticles(W / 2, H / 2, '#4af', 14); playGameOver();
          ctx.platform.haptic('heavy'); state = 'over'; return;
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.04 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life; g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      drawPlayerShip(W / 2, H / 2, ship.angle, era);

      // Joystick
      if (joystickOrigin) {
        g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2;
        g.beginPath(); g.arc(joystickOrigin.x, joystickOrigin.y, 35, 0, Math.PI * 2); g.stroke();
        if (joystickPos) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(joystickPos.x, joystickPos.y, 14, 0, Math.PI * 2); g.fill(); }
      }

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, 36);
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 24);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 24);
      g.textAlign = 'center'; g.fillStyle = '#4af';
      g.fillText(currentEra.name, W / 2, 24);
      // Era kill progress
      const ep = eraKills / currentEra.killsNeeded;
      g.fillStyle = '#222'; g.fillRect(10, 36, W - 20, 6);
      g.fillStyle = '#ff8'; g.fillRect(10, 36, (W - 20) * ep, 6);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
