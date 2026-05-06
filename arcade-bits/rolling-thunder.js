window.plethoraBit = {
  meta: {
    title: 'Rolling Thunder',
    author: 'plethora',
    description: 'Agent Albatross — rescue Leila!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;

    const UPPER_FLOOR = H * 0.42;
    const LOWER_FLOOR = H - SB - 80;
    const PLATS = [
      { x: 0, y: LOWER_FLOOR, w: W, h: 8, level: 0 },
      { x: 0, y: UPPER_FLOOR, w: W, h: 8, level: 1 },
    ];
    // doors to upper floor
    const DOORS = [W * 0.25, W * 0.55, W * 0.78];

    let ac = null;
    function initAudio() { if (!ac) ac = new AudioContext(); }
    function beep(f, d, type = 'square', v = 0.3) {
      if (!ac) return;
      const o = ac.createOscillator(), gn = ac.createGain();
      o.connect(gn); gn.connect(ac.destination);
      o.type = type; o.frequency.value = f;
      gn.gain.setValueAtTime(v, ac.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
      o.start(); o.stop(ac.currentTime + d);
    }
    function shootSnd() { beep(500, 0.06, 'sawtooth', 0.3); }
    function hitSnd() { beep(80, 0.1, 'square', 0.5); }
    function duckSnd() { beep(200, 0.05, 'square', 0.2); }
    function jumpSnd() { beep(350, 0.07, 'sine', 0.2); }
    function ammoSnd() { [600, 800, 1000].forEach((f, i) => setTimeout(() => beep(f, 0.08, 'sine', 0.3), i * 55)); }
    function dieSnd() { [300, 200, 100].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.5), i * 120)); }

    const HS_KEY = 'hs_rollingthunder';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'title';
    let started = false;
    let swipeStartX, swipeStartY, swipeT;

    let p, bullets, enemies, ammoCrates, score, wave, bgX;

    function resetGame() {
      p = { x: W*0.12, y: LOWER_FLOOR, floor: 0, vx: 0, vy: 0,
        onGround: true, dir: 1, hp: 3, maxHp: 3,
        ammo: 20, maxAmmo: 20, invincible: 0,
        shootTimer: 0, duckTimer: 0, isDucking: false, jumpTimer: 0 };
      bullets = []; enemies = []; ammoCrates = [];
      score = 0; wave = 1; bgX = 0;
      spawnWave();
    }

    function spawnWave() {
      enemies = [];
      const count = 2 + Math.min(wave, 5);
      for (let i = 0; i < count; i++) {
        const floor = Math.floor(Math.random() * 2);
        const y = floor === 0 ? LOWER_FLOOR : UPPER_FLOOR;
        enemies.push({
          x: W + 60 + i * 80, y, floor, vx: -(0.7 + wave * 0.08),
          hp: 2, maxHp: 2, dir: -1, shootTimer: 1500 + Math.random() * 1000,
          hitFlash: 0, isDucking: false, duckTimer: 0,
          type: Math.random() > 0.4 ? 'soldier' : 'masked',
          color: Math.random() > 0.5 ? '#224422' : '#442222',
        });
      }
      // ammo crate
      if (Math.random() > 0.3) {
        const floor = Math.floor(Math.random() * 2);
        ammoCrates.push({ x: W*0.7 + Math.random()*W*0.2, y: floor === 0 ? LOWER_FLOOR : UPPER_FLOOR, floor });
      }
    }

    function shoot() {
      if (p.shootTimer > 0 || p.ammo <= 0) { if (p.ammo <= 0) beep(100, 0.1, 'square', 0.2); return; }
      p.shootTimer = 12; p.ammo--;
      shootSnd();
      const by = p.y - (p.isDucking ? 10 : 22);
      bullets.push({ x: p.x + p.dir * 16, y: by, vx: p.dir * 9, fromPlayer: true });
    }

    function jump(dir = 0) {
      if (!p.onGround) return;
      p.vy = dir !== 0 ? -14 : -12;
      p.onGround = false;
      if (dir !== 0) p.floor = 1 - p.floor; // switch floor
      jumpSnd();
    }

    function duck() {
      p.isDucking = true; p.duckTimer = 45; duckSnd();
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      swipeStartX = tx; swipeStartY = ty; swipeT = Date.now();
      if (state === 'title' || state === 'gameover') {
        state = 'playing'; resetGame();
        if (!started) { started = true; ctx.platform.start(); }
        return;
      }
      if (!started) { started = true; ctx.platform.start(); }
      p.dir = 1;
      shoot();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStartX, dy = ty - swipeStartY;
      const elapsed = Date.now() - swipeT;
      if (elapsed < 300 && Math.abs(dx) < 40 && Math.abs(dy) < 40) return;
      if (dy < -55 && Math.abs(dy) > Math.abs(dx)) { jump(1); return; }
      if (dy > 55 && Math.abs(dy) > Math.abs(dx)) { duck(); return; }
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'title') { drawTitle(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      bgX += 0.8 * s;
      if (p.shootTimer > 0) p.shootTimer -= dt;
      if (p.invincible > 0) p.invincible--;
      if (p.duckTimer > 0) { p.duckTimer -= dt; if (p.duckTimer <= 0) p.isDucking = false; }

      // physics
      p.vy += 0.65 * s; p.y += p.vy * s;
      p.onGround = false;
      const targetY = p.floor === 0 ? LOWER_FLOOR : UPPER_FLOOR;
      if (p.y >= targetY && p.vy >= 0) { p.y = targetY; p.vy = 0; p.onGround = true; }
      if (p.y > LOWER_FLOOR) { p.y = LOWER_FLOOR; p.vy = 0; p.onGround = true; p.floor = 0; }

      // auto-walk right
      p.x += 1.4 * s;
      p.x = Math.max(10, Math.min(W - 10, p.x));

      // bullets
      bullets.forEach(b => { b.x += b.vx * s; });
      bullets = bullets.filter(b => b.x > -10 && b.x < W + 10);

      // check bullet-enemy collisions
      bullets.forEach(b => {
        if (!b.fromPlayer) return;
        enemies.forEach(e => {
          if (Math.abs(b.x - e.x) < 18 && Math.abs(b.y - (e.y - (e.isDucking ? 8 : 22))) < 18) {
            e.hp--; e.hitFlash = 8; hitSnd(); b.hit = true;
            score += 20; ctx.platform.setScore(score);
            if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
          }
        });
      });
      bullets = bullets.filter(b => !b.hit);
      enemies = enemies.filter(e => e.hp > 0);

      // enemies
      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        e.x += e.vx * s;
        e.duckTimer -= dt;
        if (e.duckTimer <= 0) { e.isDucking = Math.random() > 0.97; e.duckTimer = 300; }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && Math.abs(e.x - p.x) < 280 && e.floor === p.floor) {
          e.shootTimer = 1200 + Math.random() * 800;
          if (!e.isDucking) {
            const by = e.y - 22;
            bullets.push({ x: e.x - 14, y: by, vx: -4.5, fromEnemy: true });
          }
        }
        // enemy bullets hit player
      });
      bullets.forEach(b => {
        if (!b.fromEnemy) return;
        if (Math.abs(b.x - p.x) < 16 && Math.abs(b.y - (p.y - (p.isDucking ? 10 : 22))) < 16 && p.invincible <= 0) {
          b.hit = true; p.hp--; p.invincible = 55; hitSnd();
          if (p.hp <= 0) { dieSnd(); state = 'gameover'; }
        }
      });
      bullets = bullets.filter(b => !b.hit);

      // ammo crates
      ammoCrates.forEach(c => {
        if (Math.abs(c.x - p.x) < 22 && Math.abs(c.y - p.y) < 22) {
          p.ammo = p.maxAmmo; ammoSnd(); c.picked = true;
          ctx.platform.haptic('light');
        }
      });
      ammoCrates = ammoCrates.filter(c => !c.picked);

      if (enemies.length === 0) {
        score += wave * 100; wave++;
        ctx.timeout(() => { if (state === 'playing') spawnWave(); }, 1000);
      }

      drawBG();
      drawAmmoCrates();
      drawBullets();
      drawEnemies();
      drawPlayer();
      drawHUD();
    });

    function drawBG() {
      g.fillStyle = '#0a0510'; g.fillRect(0, 0, W, H);
      // upper platform
      g.fillStyle = '#1a1a2e'; g.fillRect(0, 0, W, UPPER_FLOOR + 8);
      g.fillStyle = '#2a2a4e'; g.fillRect(0, UPPER_FLOOR, W, 8);
      // lower floor
      g.fillStyle = '#151025'; g.fillRect(0, UPPER_FLOOR + 8, W, LOWER_FLOOR - UPPER_FLOOR - 8);
      g.fillStyle = '#2a1a3a'; g.fillRect(0, LOWER_FLOOR, W, 8);
      g.fillStyle = '#0a0520'; g.fillRect(0, LOWER_FLOOR + 8, W, H);
      // neon signs
      const signs = [['GELDRA', '#ff0088'], ['ENEMY', '#ff4400'], ['DANGER', '#0088ff']];
      signs.forEach(([txt, col], i) => {
        const x = ((i*250 - bgX*0.4) % (W+250)+W+250)%(W+250) - 80;
        g.fillStyle = col; g.globalAlpha = 0.3; g.font = 'bold 16px monospace'; g.textAlign = 'left';
        g.fillText(txt, x, UPPER_FLOOR - 20);
      });
      g.globalAlpha = 1;
      // doors
      DOORS.forEach(dx => {
        const x = ((dx - bgX*0.3) % (W+200)+W+200)%(W+200) - 50;
        g.fillStyle = '#2a1a2a'; g.fillRect(x - 16, LOWER_FLOOR - 50, 32, 50);
        g.fillStyle = '#4a3a4a'; g.fillRect(x - 14, LOWER_FLOOR - 48, 28, 46);
        g.fillStyle = '#886688'; g.fillRect(x - 2, LOWER_FLOOR - 30, 4, 8);
      });
    }

    function drawAmmoCrates() {
      ammoCrates.forEach(c => {
        g.fillStyle = '#8b6933'; g.fillRect(c.x - 12, c.y - 20, 24, 20);
        g.strokeStyle = '#c8a050'; g.lineWidth = 1;
        g.strokeRect(c.x - 12, c.y - 20, 24, 20);
        g.fillStyle = '#ffcc44'; g.font = 'bold 9px monospace'; g.textAlign = 'center';
        g.fillText('AMMO', c.x, c.y - 8);
      });
    }

    function drawBullets() {
      bullets.forEach(b => {
        g.fillStyle = b.fromPlayer ? '#ffff00' : '#ff4400';
        g.fillRect(b.x - 5, b.y - 2, 10, 4);
      });
    }

    function drawEnemies() {
      enemies.forEach(e => {
        g.save(); g.translate(e.x, e.y);
        g.scale(e.dir, 1);
        if (e.hitFlash > 0) g.globalAlpha = 0.5;
        const h = e.isDucking ? 28 : 48;
        const headY = e.isDucking ? -h - 8 : -h - 12;
        g.fillStyle = e.color; g.fillRect(-9, -h, 18, h);
        g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, headY, 9, 10, 0, 0, Math.PI*2); g.fill();
        if (e.type === 'masked') { g.fillStyle = '#000'; g.fillRect(-9, headY - 2, 18, 8); }
        g.fillStyle = '#aaa'; g.fillRect(10, -h + 8, 14, 5);
        g.restore();
      });
    }

    function drawPlayer() {
      if (p.invincible > 0 && Math.floor(p.invincible/4)%2) return;
      g.save(); g.translate(p.x, p.y); g.scale(p.dir, 1);
      const bodyH = p.isDucking ? 20 : 42;
      const headY = p.isDucking ? -bodyH - 7 : -bodyH - 12;
      g.fillStyle = '#3333aa'; g.fillRect(-9, -bodyH, 18, bodyH);
      g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, headY, 9, 10, 0, 0, Math.PI*2); g.fill();
      g.fillStyle = '#3333aa'; g.fillRect(-10, headY - 2, 20, 8);
      g.fillStyle = '#c8a888'; g.fillRect(10, -bodyH + 8, 12, 5);
      g.restore();
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, 26);
      g.textAlign = 'center'; g.fillText(`WAVE ${wave}`, W/2, 26);
      for (let i = 0; i < p.maxHp; i++) {
        g.fillStyle = i < p.hp ? '#ff4444' : '#333';
        g.fillRect(10 + i*20, 35, 16, 12);
      }
      g.fillStyle = p.ammo > 5 ? '#ffcc44' : '#ff4444';
      g.font = '12px monospace'; g.textAlign = 'right';
      g.fillText(`AMMO: ${p.ammo}`, W-10, 44);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '10px monospace'; g.textAlign = 'center';
      g.fillText('TAP=SHOOT  SWIPE UP=JUMP PLATFORM  SWIPE DOWN=DUCK', W/2, H-SB-24);
    }

    function drawTitle() {
      g.fillStyle = '#0a0510'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#4488ff'; g.font = 'bold 24px monospace'; g.textAlign = 'center';
      g.fillText('ROLLING THUNDER', W/2, H*0.25);
      g.fillStyle = '#aaa'; g.font = '13px monospace';
      g.fillText('Agent Albatross vs GELDRA', W/2, H*0.37);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.47);
      g.fillStyle = '#fff'; g.font = '14px monospace';
      g.fillText('TAP TO START', W/2, H*0.62);
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#4488ff'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('MISSION FAILED', W/2, H*0.38);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H*0.5);
      g.fillText(`HI: ${hs}`, W/2, H*0.59);
      g.fillStyle = '#4488ff'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.72);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
