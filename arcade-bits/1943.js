window.plethoraBit = {
  meta: {
    title: '1943',
    author: 'plethora',
    description: 'WWII dogfight. Sink the fleet.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_1943';

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
    function playShoot() { beep(800, 'square', 0.06, 0.1); }
    function playExplode() { beep(100, 'sawtooth', 0.35, 0.5); }
    function playLoop() { beep(600, 'sine', 0.15, 0.3); setTimeout(() => beep(900, 'sine', 0.12, 0.2), 150); }
    function playGameOver() { [500,400,300,200].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.3), i*160)); }

    let ship = { x: W / 2, y: H * 0.75, energy: 100, looping: false, loopTimer: 0 };
    let bullets = [], enemyBullets = [], enemies = [], particles = [], formations = [];
    let autoFireTimer = 0, spawnTimer = 0, formTimer = 0;
    let wave = 0, bossHP = 0, boss = null;
    let ocean = [], clouds = [];
    let dragging = false;
    let dragStartX = 0, dragStartY = 0;
    let shipTargetX = W / 2, shipTargetY = H * 0.75;
    let specialBtn = false;

    // Ocean waves
    for (let i = 0; i < 8; i++) ocean.push({ x: Math.random() * W, y: Math.random() * H, w: 60 + Math.random() * 120, spd: 0.3 + Math.random() * 0.5 });
    for (let i = 0; i < 5; i++) clouds.push({ x: Math.random() * W, y: Math.random() * H * 0.5, w: 80 + Math.random() * 100, spd: 0.2 + Math.random() * 0.3 });

    function resetGame() {
      score = 0; wave = 0; bossHP = 0; boss = null;
      ship = { x: W / 2, y: H * 0.75, energy: 100, looping: false, loopTimer: 0 };
      bullets = []; enemyBullets = []; enemies = []; particles = []; formations = [];
      autoFireTimer = 0; spawnTimer = 0; formTimer = 0;
      shipTargetX = W / 2; shipTargetY = H * 0.75;
    }

    function spawnFormation() {
      const n = 4 + Math.floor(Math.random() * 4);
      const startX = W + 20;
      const fy = 60 + Math.random() * H * 0.4;
      for (let i = 0; i < n; i++) {
        enemies.push({ x: startX + i * 45, y: fy + Math.sin(i) * 30, vx: -(1.4 + wave * 0.1), vy: 0, hp: 1 + Math.floor(wave / 3), type: 'plane', fireTimer: 80 + Math.random() * 60, phase: i * 0.8 });
      }
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    function drawPlane(x, y, isPlayer = false) {
      g.save(); g.translate(x, y);
      if (!isPlayer) g.scale(-1, 1);
      g.fillStyle = isPlayer ? '#4af' : '#8a4';
      // Fuselage
      g.fillRect(-16, -5, 32, 10);
      // Wings
      g.fillStyle = isPlayer ? '#28f' : '#6a2';
      g.beginPath(); g.moveTo(-4, 0); g.lineTo(-20, 14); g.lineTo(-8, 0); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-4, 0); g.lineTo(-20, -14); g.lineTo(-8, 0); g.closePath(); g.fill();
      // Tail
      g.fillStyle = isPlayer ? '#06d' : '#4a0';
      g.beginPath(); g.moveTo(-16, 0); g.lineTo(-26, -8); g.lineTo(-20, 0); g.closePath(); g.fill();
      // Propeller
      g.fillStyle = '#aaa';
      g.fillRect(14, -10, 4, 20);
      g.restore();
    }

    function drawBattleship(b) {
      g.save(); g.translate(b.x, b.y);
      g.fillStyle = '#556';
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      // Superstructure
      g.fillStyle = '#778';
      g.fillRect(-20, -b.h / 2 - 20, 40, 24);
      // Guns
      g.fillStyle = '#aaa';
      g.fillRect(-b.w / 2 + 10, -b.h / 2 - 8, 30, 8);
      g.fillRect(b.w / 2 - 40, -b.h / 2 - 8, 30, 8);
      // HP bar
      g.fillStyle = '#400'; g.fillRect(-b.w / 2, -b.h / 2 - 36, b.w, 10);
      g.fillStyle = '#f44'; g.fillRect(-b.w / 2, -b.h / 2 - 36, b.w * (b.hp / b.maxHp), 10);
      g.restore();
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }
      // Loop button
      if (tx > W * 0.7 && ty > H * 0.8 - ctx.safeArea.bottom) {
        if (!ship.looping && ship.energy >= 20) {
          ship.looping = true; ship.loopTimer = 1200; ship.energy -= 20;
          playLoop(); ctx.platform.haptic('heavy');
        }
        return;
      }
      dragging = true;
      dragStartX = tx; dragStartY = ty;
      shipTargetX = ship.x; shipTargetY = ship.y;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!dragging || state !== 'play') return;
      const t = e.changedTouches[0];
      shipTargetX = Math.max(30, Math.min(W - 30, ship.x + (t.clientX - dragStartX)));
      shipTargetY = Math.max(60, Math.min(H - ctx.safeArea.bottom - 60, ship.y + (t.clientY - dragStartY)));
      dragStartX = t.clientX; dragStartY = t.clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); dragging = false; }, { passive: false });

    ctx.raf((dt) => {
      const spd = dt / 16;

      // Ocean background
      g.fillStyle = '#003855'; g.fillRect(0, 0, W, H);
      // Ocean pattern
      g.fillStyle = '#004468';
      for (let row = 0; row < H; row += 40) {
        for (let col = (row / 40 % 2) * 20; col < W; col += 40) g.fillRect(col, row, 20, 40);
      }
      // Ocean waves
      for (const ow of ocean) {
        ow.x -= ow.spd * spd;
        if (ow.x + ow.w < 0) ow.x = W;
        g.fillStyle = 'rgba(100,200,255,0.12)';
        g.fillRect(ow.x, ow.y, ow.w, 3);
      }
      // Clouds
      for (const c of clouds) {
        c.x -= c.spd * spd; if (c.x + c.w < 0) c.x = W;
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.beginPath(); g.ellipse(c.x, c.y, c.w / 2, 20, 0, 0, Math.PI * 2); g.fill();
      }

      if (state === 'title') {
        g.fillStyle = '#4af'; g.font = `bold ${W * 0.14}px monospace`; g.textAlign = 'center';
        g.fillText('1943', W / 2, H * 0.35);
        g.fillStyle = '#fff'; g.font = `${W * 0.042}px monospace`;
        g.fillText('DRAG to fly  LOOP button=evade', W / 2, H * 0.52);
        g.fillStyle = '#ff8'; g.font = `${W * 0.05}px monospace`;
        g.fillText('TAP TO START', W / 2, H * 0.68);
        g.fillStyle = '#888'; g.font = `${W * 0.04}px monospace`;
        g.fillText(`HI: ${highScore}`, W / 2, H * 0.8);
        return;
      }

      if (state === 'over') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('SHOT DOWN', W / 2, H * 0.38);
        g.fillStyle = '#fff'; g.font = `${W * 0.05}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H * 0.52);
        g.fillStyle = '#ff8'; g.fillText(`BEST: ${highScore}`, W / 2, H * 0.62);
        g.fillStyle = '#4af'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      // Move ship toward target
      ship.x += (shipTargetX - ship.x) * 0.15 * spd;
      ship.y += (shipTargetY - ship.y) * 0.15 * spd;
      ship.energy = Math.min(100, ship.energy + 0.04 * spd);

      // Loop invincibility
      if (ship.looping) {
        ship.loopTimer -= dt;
        if (ship.loopTimer <= 0) ship.looping = false;
      }

      // Auto fire
      autoFireTimer -= dt;
      if (autoFireTimer <= 0) {
        autoFireTimer = 200;
        bullets.push({ x: ship.x, y: ship.y - 20, vx: 0, vy: -13 });
        bullets.push({ x: ship.x - 10, y: ship.y - 10, vx: -1, vy: -12 });
        bullets.push({ x: ship.x + 10, y: ship.y - 10, vx: 1, vy: -12 });
        playShoot();
      }

      // Spawn enemies / boss
      formTimer -= dt; spawnTimer -= dt;
      if (formTimer <= 0) { formTimer = 2500 - wave * 80; spawnFormation(); }
      if (spawnTimer <= 0) {
        spawnTimer = 4000 + Math.random() * 2000;
        wave = Math.min(wave + 1, 10);
        if (wave % 4 === 0 && !boss) {
          boss = { x: W / 2, y: -100, vy: 0.4, w: 160, h: 60, hp: 30 + wave * 5, maxHp: 30 + wave * 5, fireTimer: 0, dx: 1 };
        }
      }

      // Boss
      if (boss) {
        boss.y += boss.vy * spd;
        if (boss.y > H * 0.25) boss.vy = 0;
        boss.x += boss.dx * 0.8 * spd;
        if (boss.x > W - boss.w / 2) boss.dx = -1;
        if (boss.x < boss.w / 2) boss.dx = 1;
        boss.fireTimer -= dt;
        if (boss.fireTimer <= 0) {
          boss.fireTimer = 800;
          for (let i = -2; i <= 2; i++) enemyBullets.push({ x: boss.x + i * 30, y: boss.y + boss.h / 2, vx: i * 0.8, vy: 5 });
        }
        drawBattleship(boss);
      }

      // Player bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.y < -10 || b.x < 0 || b.x > W) { bullets.splice(i, 1); continue; }
        g.fillStyle = '#ff8'; g.fillRect(b.x - 2, b.y - 6, 4, 8);
        // Hit enemies
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (Math.abs(b.x - en.x) < 20 && Math.abs(b.y - en.y) < 16) {
            en.hp--; spawnParticles(en.x, en.y, '#f84', 4);
            bullets.splice(i, 1); hit = true;
            if (en.hp <= 0) { score += 300 * Math.ceil(wave / 2); ctx.platform.setScore(score); spawnParticles(en.x, en.y, '#ff4', 10); playExplode(); enemies.splice(j, 1); if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); } }
            break;
          }
        }
        if (hit) continue;
        if (boss && Math.abs(b.x - boss.x) < boss.w / 2 && Math.abs(b.y - boss.y) < boss.h / 2) {
          boss.hp--; spawnParticles(b.x, b.y, '#f88', 4);
          bullets.splice(i, 1);
          if (boss.hp <= 0) { score += 5000; spawnParticles(boss.x, boss.y, '#ff0', 20); playExplode(); boss = null; if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); } }
        }
      }

      // Enemy bullets
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.y > H + 10 || b.x < 0 || b.x > W) { enemyBullets.splice(i, 1); continue; }
        g.fillStyle = '#f84'; g.beginPath(); g.arc(b.x, b.y, 4, 0, Math.PI * 2); g.fill();
        if (!ship.looping && Math.abs(b.x - ship.x) < 18 && Math.abs(b.y - ship.y) < 16) {
          ship.energy -= 25; spawnParticles(ship.x, ship.y, '#4af', 8);
          enemyBullets.splice(i, 1); ctx.platform.haptic('medium');
          if (ship.energy <= 0) { playGameOver(); state = 'over'; return; }
        }
      }

      // Enemies
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        en.x += en.vx * spd;
        en.y += Math.sin(Date.now() * 0.003 + en.phase) * 1.2 * spd;
        if (en.x < -40) { enemies.splice(i, 1); continue; }
        en.fireTimer -= dt;
        if (en.fireTimer <= 0) {
          en.fireTimer = 1400 + Math.random() * 600;
          const dx = ship.x - en.x, dy = ship.y - en.y, dist = Math.hypot(dx, dy);
          enemyBullets.push({ x: en.x, y: en.y, vx: (dx / dist) * 4, vy: (dy / dist) * 4 });
        }
        drawPlane(en.x, en.y, false);
        if (!ship.looping && Math.abs(en.x - ship.x) < 22 && Math.abs(en.y - ship.y) < 18) {
          ship.energy -= 30; spawnParticles(en.x, en.y, '#f84', 8); playExplode();
          enemies.splice(i, 1); ctx.platform.haptic('heavy');
          if (ship.energy <= 0) { playGameOver(); state = 'over'; return; }
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

      // Loop effect
      if (ship.looping) {
        g.strokeStyle = `rgba(100,200,255,${0.5 + 0.5 * Math.sin(Date.now() * 0.01)})`;
        g.lineWidth = 3; g.beginPath(); g.arc(ship.x, ship.y, 28, 0, Math.PI * 2); g.stroke();
      }

      drawPlane(ship.x, ship.y, true);

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, 36);
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 24);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 24);
      // Energy bar
      g.fillStyle = '#300'; g.fillRect(10, 36, W * 0.5, 10);
      const ec = ship.energy / 100;
      g.fillStyle = ec > 0.5 ? '#4f8' : ec > 0.25 ? '#ff8' : '#f44';
      g.fillRect(10, 36, W * 0.5 * ec, 10);
      g.fillStyle = '#fff'; g.font = `${W * 0.035}px monospace`; g.textAlign = 'left';
      g.fillText(`EN: ${Math.round(ship.energy)}`, 12, 46);

      // Loop button
      const btnX = W * 0.7, btnY = H - ctx.safeArea.bottom - 55;
      g.fillStyle = ship.energy >= 20 && !ship.looping ? '#4af' : '#444';
      g.beginPath(); g.roundRect(btnX, btnY, W * 0.26, 45, 8); g.fill();
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.038}px monospace`; g.textAlign = 'center';
      g.fillText('LOOP', btnX + W * 0.13, btnY + 28);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
