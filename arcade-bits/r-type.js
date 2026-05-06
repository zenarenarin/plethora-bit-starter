window.plethoraBit = {
  meta: {
    title: 'R-Type',
    author: 'plethora',
    description: 'Charge your orb. Blast alien formations.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_rtype';

    let state = 'title';
    let score = 0, highScore = ctx.storage.get(HS_KEY) || 0;
    let audioCtx = null;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }
    function playTone(freq, type, dur, vol = 0.3, startFreq = null) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      o.connect(g2); g2.connect(audioCtx.destination);
      o.type = type;
      if (startFreq) { o.frequency.setValueAtTime(startFreq, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(freq, audioCtx.currentTime + dur); }
      else o.frequency.value = freq;
      g2.gain.setValueAtTime(vol, audioCtx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { playTone(800, 'square', 0.08, 0.15); }
    function playExplode() { playTone(80, 'sawtooth', 0.3, 0.4, 400); }
    function playScore() { playTone(1200, 'sine', 0.15, 0.2); }
    function playGameOver() {
      if (!audioCtx) return;
      [600, 450, 300, 150].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = f; o.type = 'sine';
        gn.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.2);
        gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.2 + 0.18);
        o.start(audioCtx.currentTime + i * 0.2);
        o.stop(audioCtx.currentTime + i * 0.2 + 0.2);
      });
    }

    // Ship
    let ship = { x: W * 0.15, y: H * 0.5, w: 44, h: 22, alive: true };
    let dragging = false, dragOffY = 0;
    let chargeStart = 0, charging = false, chargeLevel = 0;
    let orb = null; // attached orb: { attached: true/false, x, y, angle }

    // Bullets
    let bullets = [];    // { x, y, vx, vy, charged }
    let enemyBullets = [];

    // Enemies
    let enemies = [];
    let particles = [];
    let stars = [];
    let wave = 0;
    let waveTimer = 0;
    let bossHP = 0, boss = null;
    let autoFireTimer = 0;
    let bgScroll = 0;

    for (let i = 0; i < 60; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 + 0.5, speed: Math.random() * 1.5 + 0.5 });

    function resetGame() {
      score = 0; wave = 0; waveTimer = 0; bossHP = 0;
      ship = { x: W * 0.15, y: H * 0.5, w: 44, h: 22, alive: true };
      bullets = []; enemyBullets = []; enemies = []; particles = [];
      orb = null; charging = false; chargeLevel = 0;
      autoFireTimer = 0;
      spawnWave();
    }

    function spawnWave() {
      wave++;
      if (wave % 5 === 0) {
        // Boss
        boss = { x: W - 60, y: H / 2, w: 60, h: 80, hp: 20 + wave * 3, maxHp: 20 + wave * 3, fireTimer: 0, dy: 1 };
        bossHP = boss.hp;
      } else {
        const rows = 3, cols = 6;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            enemies.push({
              x: W * 0.55 + c * 55,
              y: H * 0.15 + r * (H * 0.55 / rows),
              vx: -(0.8 + wave * 0.1),
              vy: 0,
              w: 28, h: 20,
              hp: 1 + Math.floor(wave / 3),
              fireTimer: Math.random() * 120,
              type: r % 3,
              phase: Math.random() * Math.PI * 2,
            });
          }
        }
      }
    }

    function spawnParticles(x, y, color, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * 3 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
      }
    }

    function drawShip(x, y, charged) {
      g.save();
      g.translate(x, y);
      // Body
      g.fillStyle = charged ? '#8af' : '#4af';
      g.beginPath();
      g.moveTo(22, 0); g.lineTo(-18, -11); g.lineTo(-12, 0); g.lineTo(-18, 11); g.closePath();
      g.fill();
      // Engine glow
      g.fillStyle = charged ? '#ff8' : '#f84';
      g.beginPath(); g.ellipse(-18, 0, 6, 4, 0, 0, Math.PI * 2); g.fill();
      // Cockpit
      g.fillStyle = '#aef';
      g.beginPath(); g.ellipse(6, 0, 8, 5, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    function drawEnemy(e) {
      g.save(); g.translate(e.x, e.y);
      const colors = ['#f44', '#f84', '#a4f'];
      g.fillStyle = colors[e.type];
      if (e.type === 0) {
        g.beginPath(); g.moveTo(-14, 0); g.lineTo(8, -10); g.lineTo(14, 0); g.lineTo(8, 10); g.closePath(); g.fill();
      } else if (e.type === 1) {
        g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#800'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
      } else {
        g.beginPath(); g.moveTo(-10, -10); g.lineTo(10, -10); g.lineTo(14, 0); g.lineTo(10, 10); g.lineTo(-10, 10); g.closePath(); g.fill();
      }
      g.restore();
    }

    function drawBoss(b) {
      g.save(); g.translate(b.x, b.y);
      g.fillStyle = '#c44';
      g.beginPath(); g.moveTo(30, 0); g.lineTo(-20, -40); g.lineTo(-30, -20); g.lineTo(-20, 0); g.lineTo(-30, 20); g.lineTo(-20, 40); g.closePath(); g.fill();
      g.fillStyle = '#f88'; g.beginPath(); g.ellipse(10, 0, 12, 8, 0, 0, Math.PI * 2); g.fill();
      // HP bar
      g.fillStyle = '#400'; g.fillRect(-30, -50, 60, 8);
      g.fillStyle = '#f44'; g.fillRect(-30, -50, 60 * (b.hp / b.maxHp), 8);
      g.restore();
    }

    let gameOverRestart = false;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }

      dragging = true;
      dragOffY = ty - ship.y;
      charging = true;
      chargeStart = Date.now();
      chargeLevel = 0;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!dragging || state !== 'play') return;
      const t = e.changedTouches[0];
      ship.y = Math.max(ship.h, Math.min(H - ctx.safeArea.bottom - ship.h, t.clientY - dragOffY));
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      dragging = false;
      if (state !== 'play') return;
      // Release charge
      if (charging && chargeLevel > 0.3) {
        const power = Math.min(chargeLevel, 1);
        bullets.push({ x: ship.x + 22, y: ship.y, vx: 12 + power * 8, vy: 0, charged: true, power, r: 4 + power * 8 });
        playTone(200 + power * 600, 'sawtooth', 0.2, 0.4);
        ctx.platform.haptic('medium');
      }
      charging = false; chargeLevel = 0;
    }, { passive: false });

    ctx.raf((dt) => {
      const spd = dt / 16;

      // BG
      bgScroll += spd * 1.5;
      g.fillStyle = '#000510';
      g.fillRect(0, 0, W, H);
      // Stars
      for (const s of stars) {
        s.x -= s.speed * spd;
        if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
        g.fillStyle = `rgba(255,255,255,${0.4 + s.s / 3})`;
        g.fillRect(s.x, s.y, s.s, s.s);
      }
      // Nebula streaks
      g.fillStyle = 'rgba(80,0,120,0.03)';
      g.fillRect(0, 0, W, H);

      if (state === 'title') {
        g.fillStyle = '#4af'; g.font = `bold ${W * 0.12}px monospace`; g.textAlign = 'center';
        g.fillText('R-TYPE', W / 2, H * 0.38);
        g.fillStyle = '#aef'; g.font = `${W * 0.045}px monospace`;
        g.fillText('DRAG to move  HOLD to charge', W / 2, H * 0.52);
        g.fillText('RELEASE to fire charged shot', W / 2, H * 0.59);
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
        g.fillStyle = '#ff8';
        g.fillText(`BEST: ${highScore}`, W / 2, H * 0.62);
        g.fillStyle = '#aef'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      // Charge update
      if (charging) {
        chargeLevel = Math.min(1, (Date.now() - chargeStart) / 1200);
      }

      // Auto fire
      autoFireTimer -= dt;
      if (autoFireTimer <= 0 && ship.alive) {
        autoFireTimer = 280;
        bullets.push({ x: ship.x + 22, y: ship.y, vx: 11, vy: 0, charged: false, r: 3 });
        if (orb) bullets.push({ x: orb.x + 16, y: orb.y, vx: 11, vy: 0, charged: false, r: 3 });
        playShoot();
      }

      // Orb follow ship
      if (orb) {
        orb.angle += 0.04 * spd;
        orb.x = ship.x + Math.cos(orb.angle) * 28;
        orb.y = ship.y + Math.sin(orb.angle) * 28;
      }

      // Move bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.x > W + 20 || b.y < 0 || b.y > H) { bullets.splice(i, 1); continue; }

        // Hit enemies
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (Math.abs(b.x - en.x) < en.w && Math.abs(b.y - en.y) < en.h) {
            en.hp -= b.charged ? Math.ceil((b.power || 1) * 3) : 1;
            spawnParticles(en.x, en.y, '#f84', 5);
            bullets.splice(i, 1); hit = true;
            if (en.hp <= 0) {
              score += 100 * wave;
              ctx.platform.setScore(score);
              spawnParticles(en.x, en.y, '#ff8', 12);
              playExplode(); playScore();
              enemies.splice(j, 1);
              if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
            }
            break;
          }
        }
        if (hit) continue;

        // Hit boss
        if (boss) {
          if (Math.abs(b.x - boss.x) < boss.w && Math.abs(b.y - boss.y) < boss.h) {
            boss.hp -= b.charged ? Math.ceil((b.power || 1) * 3) : 1;
            bullets.splice(i, 1);
            spawnParticles(boss.x, boss.y, '#f88', 6);
            if (boss.hp <= 0) {
              score += 2000 * wave;
              ctx.platform.setScore(score);
              spawnParticles(boss.x, boss.y, '#ff0', 20);
              playExplode();
              boss = null;
              waveTimer = 120;
              if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
            }
          }
        }
      }

      // Move enemies
      waveTimer -= dt;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        en.x += en.vx * spd;
        en.y += Math.sin(Date.now() * 0.002 + en.phase) * 0.8 * spd;
        if (en.x < -40) en.x = W + 40;

        // Enemy fire
        en.fireTimer -= dt;
        if (en.fireTimer <= 0) {
          en.fireTimer = 1200 + Math.random() * 800;
          const dx = ship.x - en.x, dy = ship.y - en.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          enemyBullets.push({ x: en.x, y: en.y, vx: (dx / dist) * 4, vy: (dy / dist) * 4 });
        }
      }

      // Boss logic
      if (boss) {
        boss.y += boss.dy * 1.5 * spd;
        if (boss.y < 60 || boss.y > H - 60) boss.dy *= -1;
        boss.fireTimer -= dt;
        if (boss.fireTimer <= 0) {
          boss.fireTimer = 600;
          for (let a = -1; a <= 1; a++) {
            enemyBullets.push({ x: boss.x - 30, y: boss.y + a * 30, vx: -5, vy: a * 1.5 });
          }
        }
      }

      // Enemy bullets
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.x < -10 || b.x > W + 10 || b.y < 0 || b.y > H) { enemyBullets.splice(i, 1); continue; }
        if (ship.alive && Math.abs(b.x - ship.x) < 20 && Math.abs(b.y - ship.y) < 12) {
          ship.alive = false;
          spawnParticles(ship.x, ship.y, '#4af', 16);
          playExplode(); playGameOver();
          ctx.platform.haptic('heavy');
          ctx.timeout(() => { state = 'over'; }, 1200);
          enemyBullets.splice(i, 1); continue;
        }
      }

      // Spawn next wave
      if (enemies.length === 0 && !boss && waveTimer <= 0) {
        waveTimer = 200;
        spawnWave();
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.03 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life;
        g.fillStyle = p.color;
        g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      // Draw enemy bullets
      g.fillStyle = '#f88';
      for (const b of enemyBullets) { g.beginPath(); g.arc(b.x, b.y, 4, 0, Math.PI * 2); g.fill(); }

      // Draw player bullets
      for (const b of bullets) {
        if (b.charged) {
          const r = b.r || 6;
          const grad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
          grad.addColorStop(0, '#fff');
          grad.addColorStop(0.5, '#8af');
          grad.addColorStop(1, 'rgba(0,100,255,0)');
          g.fillStyle = grad;
          g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.fill();
        } else {
          g.fillStyle = '#8ff';
          g.fillRect(b.x - 8, b.y - 2, 10, 4);
        }
      }

      // Draw enemies
      for (const en of enemies) drawEnemy(en);
      if (boss) drawBoss(boss);

      // Orb
      if (orb) {
        g.save(); g.translate(orb.x, orb.y);
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, 16);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.4, '#4af');
        grad.addColorStop(1, 'rgba(0,80,200,0)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fill();
        g.restore();
      }

      // Charge orb on ship
      if (charging && chargeLevel > 0.1) {
        const r = 6 + chargeLevel * 20;
        const grad = g.createRadialGradient(ship.x, ship.y, 0, ship.x, ship.y, r);
        grad.addColorStop(0, `rgba(255,255,255,${chargeLevel})`);
        grad.addColorStop(1, `rgba(0,100,255,0)`);
        g.fillStyle = grad;
        g.beginPath(); g.arc(ship.x, ship.y, r, 0, Math.PI * 2); g.fill();
      }

      // Ship
      if (ship.alive) drawShip(ship.x, ship.y, charging && chargeLevel > 0.5);

      // HUD
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.042}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 12, 28);
      g.textAlign = 'right';
      g.fillStyle = '#ff8';
      g.fillText(`HI:${highScore}`, W - 12, 28);
      g.textAlign = 'center';
      g.fillStyle = '#4af';
      g.fillText(`WAVE ${wave}`, W / 2, 28);

      // Charge meter
      if (charging) {
        g.fillStyle = '#333'; g.fillRect(20, H - ctx.safeArea.bottom - 30, W - 40, 12);
        const cg = g.createLinearGradient(20, 0, W - 20, 0);
        cg.addColorStop(0, '#48f'); cg.addColorStop(1, '#fff');
        g.fillStyle = cg;
        g.fillRect(20, H - ctx.safeArea.bottom - 30, (W - 40) * chargeLevel, 12);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
