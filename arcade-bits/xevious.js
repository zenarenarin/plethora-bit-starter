window.plethoraBit = {
  meta: {
    title: 'Xevious',
    author: 'plethora',
    description: 'Air laser. Ground bomb. Two weapons.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_xevious';

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
    function playLaser() { beep(1400, 'square', 0.05, 0.15); }
    function playBomb() { beep(150, 'sawtooth', 0.25, 0.4); }
    function playExplode() { beep(80, 'sawtooth', 0.3, 0.5); }
    function playMothership() { [300,400,600,800].forEach((f,i) => setTimeout(() => beep(f,'sine',0.25,0.35), i*80)); }
    function playGameOver() { [500,350,250,100].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.3), i*180)); }

    let ship = { x: W / 2, y: H * 0.65 };
    let lasers = [], bombs = [], airEnemies = [], groundTargets = [], particles = [];
    let bgTiles = [], trees = [], roads = [];
    let bgScroll = 0, wave = 0, spawnAirTimer = 0, spawnGroundTimer = 0;
    let mothershipTimer = 5000, mothership = null;
    let dragging = false, lastTouchY = 0;
    let bombReticle = null;

    // Generate terrain tiles
    function makeTerrain() {
      bgTiles = [];
      trees = [];
      roads = [];
      for (let i = 0; i < 20; i++) trees.push({ x: Math.random() * W, y: -Math.random() * H * 2, r: 8 + Math.random() * 8, type: Math.random() < 0.3 ? 'dark' : 'green' });
      for (let i = 0; i < 4; i++) roads.push({ x: (i / 4) * W + Math.random() * W * 0.2, y: -Math.random() * H * 2, w: 18, h: 200 });
    }
    makeTerrain();

    function resetGame() {
      score = 0; wave = 0;
      ship = { x: W / 2, y: H * 0.65 };
      lasers = []; bombs = []; airEnemies = []; groundTargets = []; particles = [];
      bgScroll = 0; spawnAirTimer = 0; spawnGroundTimer = 0;
      mothershipTimer = 5000; mothership = null; bombReticle = null;
      makeTerrain();
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }
      dragging = true;
      lastTouchY = ty;
      // Top half = laser, bottom half = bomb
      if (ty < H / 2) {
        lasers.push({ x: ship.x, y: ship.y - 20, vy: -14 });
        playLaser();
      } else {
        // Bomb drops to ground at touch x
        bombReticle = { x: tx, y: ship.y + 40, targetX: tx };
        bombs.push({ x: ship.x, y: ship.y + 10, targetX: tx, vy: 5, phase: 0 });
        playBomb();
      }
      ctx.platform.start();
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!dragging || state !== 'play') return;
      const t = e.changedTouches[0];
      ship.x = Math.max(20, Math.min(W - 20, t.clientX));
      ship.y = Math.max(60, Math.min(H - ctx.safeArea.bottom - 80, t.clientY));
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); dragging = false; }, { passive: false });

    function drawSolvalou(x, y) {
      g.save(); g.translate(x, y);
      g.fillStyle = '#6af';
      g.beginPath(); g.moveTo(0, -18); g.lineTo(16, 8); g.lineTo(8, 4); g.lineTo(0, 12); g.lineTo(-8, 4); g.lineTo(-16, 8); g.closePath(); g.fill();
      g.fillStyle = '#aef'; g.beginPath(); g.ellipse(0, -2, 6, 4, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    ctx.raf((dt) => {
      const spd = dt / 16;
      bgScroll += 1.5 * spd;
      wave = Math.min(10, wave + dt * 0.00005);

      // Terrain
      g.fillStyle = '#1a3a1a'; g.fillRect(0, 0, W, H);
      // Ground grid
      g.strokeStyle = 'rgba(40,80,40,0.4)'; g.lineWidth = 1;
      const gridY = ((bgScroll * 0.5) % 40);
      for (let y = -gridY; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let x = 0; x < W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }

      // Trees scroll
      for (const t of trees) {
        t.y += 1.5 * spd;
        if (t.y > H + 20) { t.y = -20; t.x = Math.random() * W; }
        g.fillStyle = t.type === 'dark' ? '#0a2a0a' : '#1a4a1a';
        g.beginPath(); g.arc(t.x, t.y, t.r, 0, Math.PI * 2); g.fill();
      }
      // Roads
      for (const r of roads) {
        r.y += 1.5 * spd;
        if (r.y > H + 200) { r.y = -200; }
        g.fillStyle = '#2a2a3a';
        g.fillRect(r.x - r.w / 2, r.y, r.w, r.h);
        // Road markings
        g.fillStyle = '#3a3a4a';
        for (let dy = 0; dy < r.h; dy += 30) g.fillRect(r.x - 1, r.y + dy, 2, 15);
      }

      if (state === 'title') {
        g.fillStyle = '#4f8'; g.font = `bold ${W * 0.11}px monospace`; g.textAlign = 'center';
        g.fillText('XEVIOUS', W / 2, H * 0.35);
        g.fillStyle = '#fff'; g.font = `${W * 0.038}px monospace`;
        g.fillText('TAP upper half = laser (air)', W / 2, H * 0.5);
        g.fillText('TAP lower half = bomb (ground)', W / 2, H * 0.57);
        g.fillStyle = '#ff8'; g.font = `${W * 0.05}px monospace`;
        g.fillText('TAP TO START', W / 2, H * 0.72);
        g.fillStyle = '#888'; g.font = `${W * 0.04}px monospace`;
        g.fillText(`HI: ${highScore}`, W / 2, H * 0.82);
        return;
      }

      if (state === 'over') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('DESTROYED', W / 2, H * 0.38);
        g.fillStyle = '#fff'; g.font = `${W * 0.05}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H * 0.52);
        g.fillStyle = '#ff8'; g.fillText(`BEST: ${highScore}`, W / 2, H * 0.62);
        g.fillStyle = '#4f8'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      // Spawn air enemies
      spawnAirTimer -= dt;
      if (spawnAirTimer <= 0) {
        spawnAirTimer = Math.max(600, 1400 - wave * 60);
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          airEnemies.push({ x: Math.random() * W, y: -30, vx: (Math.random() - 0.5) * 2, vy: 1.2 + wave * 0.1, hp: 1, fireTimer: 60 + Math.random() * 80 });
        }
      }
      // Spawn ground targets
      spawnGroundTimer -= dt;
      if (spawnGroundTimer <= 0) {
        spawnGroundTimer = Math.max(800, 2000 - wave * 80);
        groundTargets.push({ x: Math.random() * (W - 40) + 20, y: -20, vy: 1.2 + wave * 0.1, hp: 2, type: Math.random() < 0.5 ? 'turret' : 'bunker', fireTimer: 100 });
      }

      // Mothership
      mothershipTimer -= dt;
      if (mothershipTimer <= 0 && !mothership) {
        mothershipTimer = 8000 + Math.random() * 6000;
        mothership = { x: -100, y: H * 0.15, vx: 1.5, hp: 8 };
        playMothership();
      }
      if (mothership) {
        mothership.x += mothership.vx * spd;
        // Glow
        g.save();
        const mg = g.createRadialGradient(mothership.x, mothership.y, 0, mothership.x, mothership.y, 60);
        mg.addColorStop(0, 'rgba(200,100,255,0.3)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = mg; g.beginPath(); g.arc(mothership.x, mothership.y, 60, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c0f'; g.beginPath(); g.ellipse(mothership.x, mothership.y, 50, 20, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e8e'; g.beginPath(); g.arc(mothership.x, mothership.y, 14, 0, Math.PI * 2); g.fill();
        g.restore();
        if (mothership.x > W + 100) mothership = null;
      }

      // Ground targets
      for (let i = groundTargets.length - 1; i >= 0; i--) {
        const t = groundTargets[i];
        t.y += t.vy * spd;
        if (t.y > H + 30) { groundTargets.splice(i, 1); continue; }
        t.fireTimer -= dt;
        if (t.fireTimer <= 0 && t.type === 'turret') {
          t.fireTimer = 1500;
          const dx = ship.x - t.x, dy = ship.y - t.y, dist = Math.hypot(dx, dy);
          // Ground targets fire upward
          airEnemies.push({ x: t.x, y: t.y, vx: (dx / dist) * 3, vy: (dy / dist) * 3, hp: 1, bullet: true, fireTimer: 9999 });
        }
        if (t.type === 'turret') {
          g.fillStyle = '#556'; g.fillRect(t.x - 10, t.y - 8, 20, 16);
          g.fillStyle = '#778'; g.fillRect(t.x - 3, t.y - 18, 6, 12);
        } else {
          g.fillStyle = '#446'; g.fillRect(t.x - 14, t.y - 10, 28, 20);
          g.fillStyle = '#668'; g.fillRect(t.x - 8, t.y - 18, 16, 10);
        }
      }

      // Lasers (air weapons)
      for (let i = lasers.length - 1; i >= 0; i--) {
        const b = lasers[i];
        b.y += b.vy * spd;
        if (b.y < -10) { lasers.splice(i, 1); continue; }
        g.strokeStyle = '#0ff'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x, b.y + 12); g.stroke();
        // Hit air enemies
        let hit = false;
        for (let j = airEnemies.length - 1; j >= 0; j--) {
          const en = airEnemies[j];
          if (Math.abs(b.x - en.x) < 16 && Math.abs(b.y - en.y) < 16) {
            en.hp--; spawnParticles(en.x, en.y, '#0ff', 5);
            lasers.splice(i, 1); hit = true;
            if (en.hp <= 0) { score += 200; ctx.platform.setScore(score); spawnParticles(en.x, en.y, '#ff8', 10); playExplode(); airEnemies.splice(j, 1); if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); } }
            break;
          }
        }
        if (hit) continue;
        // Hit mothership
        if (mothership && Math.abs(b.x - mothership.x) < 50 && Math.abs(b.y - mothership.y) < 20) {
          mothership.hp--; lasers.splice(i, 1);
          if (mothership.hp <= 0) { score += 3000; spawnParticles(mothership.x, mothership.y, '#c0f', 20); playExplode(); mothership = null; }
        }
      }

      // Bombs (ground weapons)
      for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i];
        b.x += (b.targetX - b.x) * 0.06 * spd;
        b.y += b.vy * spd;
        if (b.y > H + 20) { bombs.splice(i, 1); continue; }
        // Draw bomb shadow + bomb
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(b.x, H - 10, 14, 5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f80';
        g.beginPath(); g.arc(b.x, b.y, 7, 0, Math.PI * 2); g.fill();
        // Hit ground targets
        for (let j = groundTargets.length - 1; j >= 0; j--) {
          const t = groundTargets[j];
          if (Math.abs(b.x - t.x) < 22 && Math.abs(b.y - t.y) < 18) {
            t.hp--; spawnParticles(t.x, t.y, '#f80', 6);
            bombs.splice(i, 1);
            if (t.hp <= 0) { score += 400; ctx.platform.setScore(score); spawnParticles(t.x, t.y, '#ff4', 12); playExplode(); groundTargets.splice(j, 1); if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); } }
            break;
          }
        }
      }

      // Air enemies
      for (let i = airEnemies.length - 1; i >= 0; i--) {
        const en = airEnemies[i];
        en.x += en.vx * spd; en.y += en.vy * spd;
        if (en.y > H + 20 || en.y < -20) { airEnemies.splice(i, 1); continue; }
        if (!en.bullet) {
          g.save(); g.translate(en.x, en.y);
          g.fillStyle = '#c44';
          g.beginPath(); g.moveTo(0, -12); g.lineTo(12, 8); g.lineTo(-12, 8); g.closePath(); g.fill();
          g.restore();
          if (Math.abs(en.x - ship.x) < 18 && Math.abs(en.y - ship.y) < 18) {
            spawnParticles(ship.x, ship.y, '#6af', 14); playExplode(); playGameOver();
            ctx.platform.haptic('heavy'); state = 'over'; return;
          }
        } else {
          g.fillStyle = '#f44'; g.beginPath(); g.arc(en.x, en.y, 4, 0, Math.PI * 2); g.fill();
          if (Math.abs(en.x - ship.x) < 16 && Math.abs(en.y - ship.y) < 16) {
            spawnParticles(ship.x, ship.y, '#6af', 14); playExplode(); playGameOver();
            ctx.platform.haptic('heavy'); state = 'over'; return;
          }
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

      // Ship
      drawSolvalou(ship.x, ship.y);

      // Bomb reticle
      if (bombReticle) {
        bombReticle.y += 2 * spd;
        if (bombReticle.y > H) bombReticle = null;
        else {
          g.strokeStyle = 'rgba(255,140,0,0.6)'; g.lineWidth = 2;
          g.beginPath(); g.arc(bombReticle.x, bombReticle.y, 14, 0, Math.PI * 2); g.stroke();
        }
      }

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, 36);
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 24);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 24);
      g.textAlign = 'center'; g.fillStyle = '#4f8';
      g.fillText(`WAVE ${Math.ceil(wave)}`, W / 2, 24);
      // Divider line (tap hint)
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.font = `${W * 0.03}px monospace`; g.textAlign = 'left';
      g.fillText('LASER zone', 8, H / 2 - 6);
      g.fillText('BOMB zone', 8, H / 2 + 16);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
