window.plethoraBit = {
  meta: {
    title: 'Contra',
    author: 'plethora',
    description: 'Run. Gun. Never stop moving.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_contra';

    const SAFE = ctx.safeArea.bottom;
    let state = 'title';
    let score = 0, highScore = ctx.storage.get(HS_KEY) || 0;
    let audioCtx = null;

    function initAudio() { if (audioCtx) return; audioCtx = new AudioContext(); }
    function beep(freq, type, dur, vol = 0.2) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { beep(700, 'square', 0.06, 0.1); }
    function playSpread() { [700,900,1100].forEach((f,i) => setTimeout(() => beep(f,'square',0.05,0.08), i*15)); }
    function playExplode() { beep(150, 'sawtooth', 0.3, 0.45); }
    function playPickup() { beep(1000, 'sine', 0.2, 0.3); setTimeout(() => beep(1400, 'sine', 0.15, 0.3), 100); }
    function playGameOver() { [400,320,240,160,80].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.3), i*160)); }

    const WEAPONS = ['DEFAULT', 'SPREAD', 'LASER', 'FLAME'];
    let weapon = 'DEFAULT';
    let lives = 3;

    let camX = 0;
    let player = { x: 80, y: 0, vy: 0, onGround: false, facing: 1 };
    let bullets = [], enemyBullets = [], enemies = [], pickups = [], particles = [];
    let terrain = []; // segments: { x, y, w, h }
    let autoFireTimer = 0;
    let worldLen = 0;
    let stars = [];

    for (let i = 0; i < 40; i++) stars.push({ x: Math.random() * 3000, y: Math.random() * H * 0.5, s: Math.random() * 2 + 0.5 });

    function buildTerrain() {
      terrain = [];
      let x = 0;
      // Ground floor
      while (x < 4000) {
        const gapChance = x > 300 && Math.random() < 0.2;
        const segW = gapChance ? 60 + Math.random() * 80 : 120 + Math.random() * 120;
        if (!gapChance) terrain.push({ x, y: H - 60, w: segW, h: 60 });
        x += segW + (gapChance ? 40 + Math.random() * 60 : 0);
        // Platforms
        if (Math.random() < 0.4 && x < 3800) terrain.push({ x: x - segW + 20, y: H - 120 - Math.random() * 80, w: 60 + Math.random() * 60, h: 16 });
      }
      worldLen = x;
      // Goal wall
      terrain.push({ x: worldLen - 80, y: H - 200, w: 80, h: 200 });
    }

    function spawnEnemies() {
      for (let ex = 200; ex < worldLen - 200; ex += 180 + Math.floor(Math.random() * 120)) {
        // Find ground under this x
        let ey = H - 80;
        for (const t of terrain) { if (ex > t.x && ex < t.x + t.w && t.y < ey) ey = t.y - 32; }
        enemies.push({ x: ex, y: ey, vx: 0, vy: 0, hp: 2, fireTimer: 60 + Math.random() * 80, alive: true, type: Math.random() < 0.2 ? 'heavy' : 'grunt' });
        // Pickups scattered
        if (Math.random() < 0.15) pickups.push({ x: ex + 40, y: ey - 30, type: ['SPREAD','LASER','FLAME'][Math.floor(Math.random() * 3)] });
      }
    }

    function resetGame() {
      score = 0; lives = 3; weapon = 'DEFAULT'; camX = 0;
      player = { x: 80, y: H - 120, vy: 0, onGround: false, facing: 1 };
      bullets = []; enemyBullets = []; enemies = []; pickups = []; particles = [];
      buildTerrain(); spawnEnemies();
    }

    function getGroundY(x) {
      let best = H + 100;
      for (const t of terrain) {
        if (x + 12 > t.x && x - 12 < t.x + t.w) { if (t.y < best && t.y > player.y - 10) best = t.y; }
      }
      return best;
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    let dragY = null;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }
      dragY = t.clientY;
      // Tap to fire
      fireBullet();
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (state !== 'play') return;
      const t = e.changedTouches[0];
      const dy = t.clientY - dragY;
      player.y = Math.max(40, Math.min(H - SAFE - 100, player.y + dy * 0.4));
      dragY = t.clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); dragY = null; }, { passive: false });

    function fireBullet() {
      const bx = player.x + player.facing * 18, by = player.y - 4;
      if (weapon === 'SPREAD') {
        [-0.3, 0, 0.3].forEach(angle => {
          bullets.push({ x: bx, y: by, vx: Math.cos(angle) * 12 * player.facing, vy: Math.sin(angle) * 12, weapon: 'SPREAD' });
        });
        playSpread();
      } else if (weapon === 'LASER') {
        bullets.push({ x: bx, y: by, vx: 18 * player.facing, vy: 0, weapon: 'LASER', len: 30 });
        beep(1200, 'sawtooth', 0.1, 0.15);
      } else if (weapon === 'FLAME') {
        for (let i = 0; i < 5; i++) bullets.push({ x: bx, y: by, vx: (8 + Math.random() * 4) * player.facing, vy: (Math.random() - 0.5) * 3, weapon: 'FLAME', life: 0.8 });
        beep(200, 'sawtooth', 0.15, 0.2);
      } else {
        bullets.push({ x: bx, y: by, vx: 13 * player.facing, vy: 0, weapon: 'DEFAULT' });
        playShoot();
      }
    }

    ctx.raf((dt) => {
      const spd = dt / 16;

      g.fillStyle = '#1a0808'; g.fillRect(0, 0, W, H);

      if (state === 'title') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.14}px monospace`; g.textAlign = 'center';
        g.fillText('CONTRA', W / 2, H * 0.35);
        g.fillStyle = '#fff'; g.font = `${W * 0.042}px monospace`;
        g.fillText('DRAG up/down to move', W / 2, H * 0.5);
        g.fillText('TAP to fire', W / 2, H * 0.58);
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
        g.fillStyle = '#aef'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      // Auto scroll + auto fire
      camX += 1.2 * spd;
      player.x = camX + W * 0.2;

      autoFireTimer -= dt;
      if (autoFireTimer <= 0) { autoFireTimer = weapon === 'FLAME' ? 120 : 200; fireBullet(); }

      // Gravity on player
      player.vy += 0.4 * spd;
      player.y += player.vy * spd;
      const gy = getGroundY(player.x);
      if (player.y >= gy - 28) { player.y = gy - 28; player.vy = 0; player.onGround = true; }
      else player.onGround = false;

      // Win check
      if (player.x > worldLen - 100) {
        score += 5000; ctx.platform.setScore(score); ctx.platform.complete({ score });
        if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
        buildTerrain(); spawnEnemies(); camX = 0; player = { x: 80, y: H - 120, vy: 0, onGround: false, facing: 1 };
      }

      const sx = -camX + W * 0.2;

      // Stars
      for (const s of stars) {
        const rx = ((s.x - camX * 0.3) % W + W) % W;
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(rx, s.y, s.s, s.s);
      }

      // Terrain
      g.fillStyle = '#3a2010';
      for (const t of terrain) {
        const tx = t.x + sx;
        if (tx > W + 20 || tx + t.w < -20) continue;
        g.fillRect(tx, t.y, t.w, t.h);
        g.fillStyle = '#5a3018'; g.fillRect(tx, t.y, t.w, 6); g.fillStyle = '#3a2010';
      }

      // Pickups
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        const px = p.x + sx;
        if (Math.abs(p.x - player.x) < 24 && Math.abs(p.y - player.y) < 24) {
          weapon = p.type; playPickup(); ctx.platform.haptic('light');
          pickups.splice(i, 1); continue;
        }
        g.fillStyle = '#ff0';
        g.beginPath(); g.arc(px, p.y, 10, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#000'; g.font = `bold 9px monospace`; g.textAlign = 'center';
        g.fillText(p.type[0], px, p.y + 4);
      }

      // Bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.weapon === 'FLAME') { b.life -= 0.04 * spd; if (b.life <= 0) { bullets.splice(i, 1); continue; } }
        if (b.x < camX - 50 || b.x > camX + W + 50 || b.y > H) { bullets.splice(i, 1); continue; }
        const bsx = b.x + sx;
        if (b.weapon === 'LASER') { g.strokeStyle = '#0ff'; g.lineWidth = 4; g.beginPath(); g.moveTo(bsx - b.len, b.y); g.lineTo(bsx, b.y); g.stroke(); }
        else if (b.weapon === 'FLAME') { g.globalAlpha = b.life; g.fillStyle = '#f84'; g.beginPath(); g.arc(bsx, b.y, 5, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
        else { g.fillStyle = '#ff8'; g.fillRect(bsx - 6, b.y - 2, 8, 4); }

        // Hit enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (!en.alive) continue;
          if (Math.abs(b.x - en.x) < 20 && Math.abs(b.y - en.y) < 24) {
            en.hp--; spawnParticles(en.x + sx, en.y, '#f84', 5);
            if (b.weapon !== 'LASER' && b.weapon !== 'FLAME') { bullets.splice(i, 1); }
            if (en.hp <= 0) {
              en.alive = false; score += en.type === 'heavy' ? 500 : 200;
              ctx.platform.setScore(score);
              spawnParticles(en.x + sx, en.y, '#ff4', 12); playExplode();
              if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
            }
            break;
          }
        }
      }

      // Enemy bullets
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.x < camX - 50 || b.x > camX + W + 50 || b.y > H || b.y < 0) { enemyBullets.splice(i, 1); continue; }
        g.fillStyle = '#f44'; g.beginPath(); g.arc(b.x + sx, b.y, 4, 0, Math.PI * 2); g.fill();
        if (Math.abs(b.x - player.x) < 16 && Math.abs(b.y - player.y) < 20) {
          lives--;
          spawnParticles(player.x + sx, player.y, '#4af', 14);
          enemyBullets.splice(i, 1);
          ctx.platform.haptic('heavy');
          if (lives <= 0) { playGameOver(); state = 'over'; return; }
          else { playExplode(); camX = Math.max(0, camX - 80); player.x = camX + W * 0.2; }
        }
      }

      // Enemies
      for (const en of enemies) {
        if (!en.alive) continue;
        const esx = en.x + sx;
        if (esx < -40 || esx > W + 40) continue;
        en.fireTimer -= dt;
        if (en.fireTimer <= 0) {
          en.fireTimer = 1200 + Math.random() * 800;
          const dx = player.x - en.x, dy = player.y - en.y, dist = Math.hypot(dx, dy);
          if (dist < W) enemyBullets.push({ x: en.x, y: en.y - 10, vx: (dx / dist) * 4, vy: (dy / dist) * 4 });
        }
        // Draw
        g.save(); g.translate(esx, en.y);
        g.fillStyle = en.type === 'heavy' ? '#844' : '#a44';
        g.fillRect(-12, -28, 24, 28);
        g.fillStyle = '#f88'; g.fillRect(-8, -28, 16, 12); // head
        g.fillStyle = '#c44'; g.fillRect(-4, -10, 8, 14); // gun
        g.restore();
        // Contact kill
        if (Math.abs(en.x - player.x) < 22 && Math.abs(en.y - player.y) < 28) {
          lives--; spawnParticles(player.x + sx, player.y, '#f44', 14);
          ctx.platform.haptic('heavy');
          if (lives <= 0) { playGameOver(); state = 'over'; return; }
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.04 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life;
        g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      // Player
      const psx = player.x + sx;
      g.save(); g.translate(psx, player.y);
      if (player.facing < 0) g.scale(-1, 1);
      g.fillStyle = '#4af';
      g.fillRect(-8, -28, 16, 20); // body
      g.fillStyle = '#fca'; g.fillRect(-6, -36, 12, 12); // head
      g.fillStyle = '#888'; g.fillRect(8, -22, 16, 5); // gun
      g.restore();

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, 36);
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 24);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 24);
      g.fillStyle = '#f44'; g.textAlign = 'center';
      g.fillText('♥'.repeat(lives), W / 2, 24);
      g.fillStyle = '#4f8'; g.textAlign = 'right';
      g.fillText(weapon, W - 10, 46);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
