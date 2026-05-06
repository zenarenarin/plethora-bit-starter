window.plethoraBit = {
  meta: {
    title: 'Operation Wolf',
    author: 'plethora',
    description: 'Light-gun shooter. Protect hostages.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_opwolf';

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
    function playShoot() { beep(600, 'square', 0.07, 0.15); }
    function playGrenade() { beep(200, 'sawtooth', 0.4, 0.6); }
    function playHit() { beep(300, 'sawtooth', 0.15, 0.35); }
    function playHostageHit() { beep(1200, 'sine', 0.2, 0.3); setTimeout(() => beep(900, 'sine', 0.15, 0.3), 100); }
    function playAmmoPickup() { beep(800, 'sine', 0.1, 0.25); setTimeout(() => beep(1100, 'sine', 0.1, 0.25), 100); }
    function playMissionClear() { [400,600,800,1200,1600].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.35), i*80)); }
    function playGameOver() { [400,300,200,100].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.3), i*160)); }

    const MISSIONS = [
      { name: 'JUNGLE', bg: '#1a3a10', enemyCount: 15, waves: 3 },
      { name: 'VILLAGE', bg: '#3a2a10', enemyCount: 20, waves: 3 },
      { name: 'HARBOR', bg: '#102040', enemyCount: 25, waves: 4 },
      { name: 'AIRPORT', bg: '#202020', enemyCount: 30, waves: 4 },
      { name: 'PRISON', bg: '#181818', enemyCount: 35, waves: 5 },
      { name: 'HELI', bg: '#003', enemyCount: 40, waves: 5 },
    ];

    let mission = 0, wave = 0;
    let ammo = 99, grenades = 3, lives = 3;
    let enemies = [], projectiles = [], particles = [], crates = [];
    let crosshair = { x: W / 2, y: H / 2 };
    let bgObjects = [];
    let missionTimer = 0, waveTimer = 0;
    let spawnTimer = 0;
    let touchActive = false;
    let grenadeButton = { x: W - 56, y: H - ctx.safeArea.bottom - 56, r: 36 };

    function buildBg() {
      bgObjects = [];
      const m = MISSIONS[Math.min(mission, MISSIONS.length - 1)];
      if (m.bg.includes('3a')) {
        for (let i = 0; i < 12; i++) bgObjects.push({ type: 'tree', x: Math.random() * W, y: 60 + Math.random() * H * 0.3, scale: 0.5 + Math.random() * 0.6 });
      }
      for (let i = 0; i < 6; i++) bgObjects.push({ type: 'building', x: Math.random() * W, y: 80 + Math.random() * H * 0.25, w: 40 + Math.random() * 60, h: 40 + Math.random() * 80 });
    }

    function resetGame() {
      score = 0; mission = 0; wave = 0; ammo = 99; grenades = 3; lives = 3;
      enemies = []; projectiles = []; particles = []; crates = [];
      crosshair = { x: W / 2, y: H / 2 };
      buildBg();
      spawnWave();
    }

    function spawnWave() {
      const m = MISSIONS[Math.min(mission, MISSIONS.length - 1)];
      const n = m.enemyCount + wave * 3;
      for (let i = 0; i < n; i++) {
        const fromLeft = Math.random() < 0.5;
        const isHostage = Math.random() < 0.12;
        const row = Math.floor(Math.random() * 3);
        const baseY = H * 0.35 + row * H * 0.12;
        enemies.push({
          x: fromLeft ? -60 : W + 60,
          y: baseY + (Math.random() - 0.5) * 30,
          vx: fromLeft ? (1.5 + Math.random() * 1.5) : -(1.5 + Math.random() * 1.5),
          hp: isHostage ? 1 : (1 + Math.floor(mission / 2)),
          isHostage,
          fireTimer: isHostage ? 99999 : 80 + Math.random() * 120,
          delay: i * 60,
          alive: true,
          type: isHostage ? 'hostage' : (Math.random() < 0.1 ? 'tank' : (Math.random() < 0.2 ? 'heli' : 'soldier')),
          oscillate: Math.random() * Math.PI * 2,
        });
      }
      // Crates
      crates.push({ x: 40 + Math.random() * (W - 80), y: H * 0.4 + Math.random() * H * 0.2, type: 'ammo', alive: true });
      if (Math.random() < 0.5) crates.push({ x: 40 + Math.random() * (W - 80), y: H * 0.4 + Math.random() * H * 0.2, type: 'grenade', alive: true });
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 5 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    function shoot(tx, ty) {
      if (ammo <= 0) { beep(100, 'square', 0.1, 0.2); return; }
      ammo--;
      playShoot(); ctx.platform.interact({ type: 'tap' });
      // Check hits
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        if (!en.alive || en.delay > 0) continue;
        const enW = en.type === 'tank' ? 50 : (en.type === 'heli' ? 42 : 22);
        const enH = en.type === 'tank' ? 28 : (en.type === 'heli' ? 28 : 40);
        if (Math.abs(tx - en.x) < enW && Math.abs(ty - en.y) < enH) {
          if (en.isHostage) {
            playHostageHit(); lives--;
            ctx.platform.haptic('heavy');
            spawnParticles(en.x, en.y, '#ff0', 8);
            en.alive = false;
            if (lives <= 0) { playGameOver(); state = 'over'; return; }
            return;
          }
          en.hp--;
          ctx.platform.haptic('light');
          spawnParticles(en.x, en.y, '#f84', 5);
          if (en.hp <= 0) {
            en.alive = false;
            score += en.type === 'tank' ? 600 : (en.type === 'heli' ? 400 : 100);
            ctx.platform.setScore(score);
            spawnParticles(en.x, en.y, '#ff8', 10); playHit();
            if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
          }
          return; // one bullet = one hit
        }
      }
      // Check crates
      for (let i = crates.length - 1; i >= 0; i--) {
        const c = crates[i];
        if (!c.alive) continue;
        if (Math.abs(tx - c.x) < 22 && Math.abs(ty - c.y) < 18) {
          c.alive = false;
          if (c.type === 'ammo') { ammo = Math.min(99, ammo + 20); playAmmoPickup(); }
          else { grenades = Math.min(9, grenades + 1); playAmmoPickup(); ctx.platform.haptic('medium'); }
          spawnParticles(c.x, c.y, '#ff8', 8);
        }
      }
    }

    function grenadeAttack() {
      if (grenades <= 0) return;
      grenades--; playGrenade(); ctx.platform.haptic('heavy');
      // Area damage
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        if (!en.alive || en.isHostage || en.delay > 0) continue;
        en.hp -= 3;
        if (en.hp <= 0) { en.alive = false; score += 50; spawnParticles(en.x, en.y, '#f80', 10); }
      }
      ctx.platform.setScore(score);
      // Big explosion
      for (let i = 0; i < 3; i++) spawnParticles(W * 0.2 + Math.random() * W * 0.6, H * 0.4 + Math.random() * H * 0.2, '#f80', 12);
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }
      if (state === 'missionclear') { state = 'play'; return; }
      touchActive = true;
      crosshair.x = tx; crosshair.y = ty;
      // Grenade button
      if (Math.hypot(tx - grenadeButton.x, ty - grenadeButton.y) < grenadeButton.r) { grenadeAttack(); return; }
      shoot(tx, ty);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (state !== 'play') return;
      const t = e.changedTouches[0];
      crosshair.x = t.clientX; crosshair.y = t.clientY;
      if (Math.hypot(t.clientX - grenadeButton.x, t.clientY - grenadeButton.y) > grenadeButton.r) shoot(t.clientX, t.clientY);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); touchActive = false; }, { passive: false });

    function drawSoldier(x, y) {
      g.save(); g.translate(x, y);
      g.fillStyle = '#686'; g.fillRect(-8, -20, 16, 20);
      g.fillStyle = '#ca8'; g.fillRect(-6, -30, 12, 12);
      g.fillStyle = '#484'; g.fillRect(-3, -14, 6, 8);
      g.fillStyle = '#888'; g.fillRect(6, -16, 14, 4);
      g.restore();
    }
    function drawTank(x, y) {
      g.save(); g.translate(x, y);
      g.fillStyle = '#484'; g.fillRect(-25, -10, 50, 20);
      g.fillStyle = '#686'; g.fillRect(-16, -18, 32, 12);
      g.fillStyle = '#555'; g.fillRect(-4, -22, 8, 14);
      g.restore();
    }
    function drawHeli(x, y, t2) {
      g.save(); g.translate(x, y);
      g.fillStyle = '#688'; g.fillRect(-18, -10, 36, 20);
      g.fillStyle = '#4aa';
      g.fillRect(-30, -14 + Math.sin(t2 * 0.01) * 2, 60, 4);
      g.restore();
    }
    function drawHostage(x, y) {
      g.save(); g.translate(x, y);
      g.fillStyle = '#fc8'; g.fillRect(-6, -28, 12, 20);
      g.fillStyle = '#fca'; g.fillRect(-7, -38, 14, 12);
      g.strokeStyle = '#fc8'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, -30); g.lineTo(0, -42); g.stroke(); // "help" arms up
      g.restore();
    }

    ctx.raf((dt) => {
      const spd = dt / 16;
      const m = MISSIONS[Math.min(mission, MISSIONS.length - 1)];

      // BG
      const bgGrad = g.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#112'); bgGrad.addColorStop(0.4, m.bg); bgGrad.addColorStop(1, '#000');
      g.fillStyle = bgGrad; g.fillRect(0, 0, W, H);

      if (state === 'title') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.09}px monospace`; g.textAlign = 'center';
        g.fillText('OPERATION WOLF', W / 2, H * 0.32);
        g.fillStyle = '#fff'; g.font = `${W * 0.038}px monospace`;
        g.fillText('TAP to shoot  DRAG to aim', W / 2, H * 0.47);
        g.fillStyle = '#ff0';
        g.fillText('DON\'T shoot YELLOW hostages!', W / 2, H * 0.54);
        g.fillStyle = '#f84'; g.font = `${W * 0.036}px monospace`;
        g.fillText('GRENADE button = area bomb', W / 2, H * 0.61);
        g.fillStyle = '#ff8'; g.font = `${W * 0.05}px monospace`;
        g.fillText('TAP TO START', W / 2, H * 0.75);
        g.fillStyle = '#888'; g.font = `${W * 0.04}px monospace`;
        g.fillText(`HI: ${highScore}`, W / 2, H * 0.85);
        return;
      }

      if (state === 'over') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H * 0.38);
        g.fillStyle = '#fff'; g.font = `${W * 0.05}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H * 0.52);
        g.fillStyle = '#ff8'; g.fillText(`BEST: ${highScore}`, W / 2, H * 0.62);
        g.fillStyle = '#f84'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      if (state === 'missionclear') {
        g.fillStyle = '#ff8'; g.font = `bold ${W * 0.08}px monospace`; g.textAlign = 'center';
        g.fillText('MISSION CLEAR!', W / 2, H * 0.4);
        g.fillStyle = '#fff'; g.font = `${W * 0.046}px monospace`;
        g.fillText(m.name + ' LIBERATED', W / 2, H * 0.52);
        g.fillStyle = '#4af'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO CONTINUE', W / 2, H * 0.7);
        return;
      }

      // BG objects
      for (const obj of bgObjects) {
        if (obj.type === 'tree') {
          g.fillStyle = '#1a4a10'; g.beginPath(); g.arc(obj.x, obj.y, 20 * obj.scale, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#3a1a00'; g.fillRect(obj.x - 5 * obj.scale, obj.y, 10 * obj.scale, 20 * obj.scale);
        } else {
          g.fillStyle = '#332'; g.fillRect(obj.x - obj.w / 2, obj.y - obj.h, obj.w, obj.h);
          g.fillStyle = '#445'; g.fillRect(obj.x - obj.w / 2, obj.y - obj.h, obj.w, 6);
        }
      }

      // Ground
      g.fillStyle = m.bg; g.fillRect(0, H * 0.72, W, H * 0.28);
      g.fillStyle = '#000'; g.fillRect(0, H * 0.72, W, 2);

      // Crates
      for (const c of crates) {
        if (!c.alive) continue;
        g.fillStyle = c.type === 'ammo' ? '#884' : '#f84';
        g.fillRect(c.x - 18, c.y - 14, 36, 28);
        g.fillStyle = '#fff'; g.font = `bold 10px monospace`; g.textAlign = 'center';
        g.fillText(c.type === 'ammo' ? 'AMO' : 'GRN', c.x, c.y + 4);
      }

      // Enemies
      let aliveCount = 0;
      for (const en of enemies) {
        if (!en.alive) continue;
        if (en.delay > 0) { en.delay -= dt; continue; }
        aliveCount++;
        en.x += en.vx * spd;
        if (en.type === 'heli') en.y += Math.sin(Date.now() * 0.002 + en.oscillate) * 0.6 * spd;
        // Wrap or remove
        if (en.x < -100 || en.x > W + 100) { en.alive = false; continue; }
        // Fire
        en.fireTimer -= dt;
        if (en.fireTimer <= 0) {
          en.fireTimer = 1000 + Math.random() * 600;
          projectiles.push({ x: en.x, y: en.y, vx: en.vx > 0 ? 2 : -2, vy: 2.5, life: 1.5 });
        }
        if (en.type === 'tank') drawTank(en.x, en.y);
        else if (en.type === 'heli') drawHeli(en.x, en.y, Date.now());
        else if (en.isHostage) drawHostage(en.x, en.y);
        else drawSoldier(en.x, en.y);
      }

      // Enemy projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.02 * spd;
        if (p.life <= 0 || p.y > H * 0.85) { projectiles.splice(i, 1); continue; }
        g.fillStyle = '#f44'; g.beginPath(); g.arc(p.x, p.y, 4, 0, Math.PI * 2); g.fill();
        if (p.y > H * 0.78 && Math.abs(p.x - W / 2) < W * 0.6) {
          lives--; projectiles.splice(i, 1); ctx.platform.haptic('heavy');
          spawnParticles(p.x, p.y, '#f44', 8);
          if (lives <= 0) { playGameOver(); state = 'over'; return; }
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.04 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life; g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 5, 5);
      }
      g.globalAlpha = 1;

      // Check wave/mission clear
      if (aliveCount === 0) {
        wave++;
        if (wave >= m.waves) {
          mission++;
          wave = 0;
          if (mission >= MISSIONS.length) { score += 10000; ctx.platform.complete({ score }); playMissionClear(); state = 'win'; }
          else { playMissionClear(); state = 'missionclear'; buildBg(); spawnWave(); }
        } else spawnWave();
      }

      // Crosshair
      g.strokeStyle = '#ff0'; g.lineWidth = 2.5;
      const cr = 18;
      g.beginPath(); g.moveTo(crosshair.x - cr, crosshair.y); g.lineTo(crosshair.x + cr, crosshair.y); g.stroke();
      g.beginPath(); g.moveTo(crosshair.x, crosshair.y - cr); g.lineTo(crosshair.x, crosshair.y + cr); g.stroke();
      g.strokeStyle = '#ff0'; g.lineWidth = 2;
      g.beginPath(); g.arc(crosshair.x, crosshair.y, 10, 0, Math.PI * 2); g.stroke();

      // Grenade button
      g.fillStyle = grenades > 0 ? '#f84' : '#444';
      g.beginPath(); g.arc(grenadeButton.x, grenadeButton.y, grenadeButton.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'center';
      g.fillText('GRN', grenadeButton.x, grenadeButton.y - 5);
      g.fillText(`×${grenades}`, grenadeButton.x, grenadeButton.y + 14);

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, 40);
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.038}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 26);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 26);
      g.fillStyle = '#ff8'; g.textAlign = 'left';
      g.fillText(`AMMO:${ammo}`, 10, 50);
      g.fillStyle = '#f44';
      g.fillText('♥'.repeat(lives), W * 0.5, 26);
      g.fillStyle = '#4af'; g.textAlign = 'center';
      g.fillText(`${m.name}  W${wave + 1}/${m.waves}`, W / 2, 50);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
