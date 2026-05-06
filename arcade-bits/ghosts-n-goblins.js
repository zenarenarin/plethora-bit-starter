window.plethoraBit = {
  meta: {
    title: "Ghosts 'n Goblins",
    author: 'plethora',
    description: 'Knight Arthur vs the undead!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;

    const PLAT1 = H * 0.55;
    const PLAT2 = H * 0.75;
    const FLOOR = H - SB - 60;
    const platforms = [
      { x: 0, y: FLOOR, w: W, h: 10 },
      { x: W * 0.1, y: PLAT2, w: W * 0.35, h: 8 },
      { x: W * 0.55, y: PLAT2, w: W * 0.4, h: 8 },
      { x: W * 0.05, y: PLAT1, w: W * 0.28, h: 8 },
      { x: W * 0.38, y: PLAT1, w: W * 0.3, h: 8 },
      { x: W * 0.72, y: PLAT1, w: W * 0.24, h: 8 },
    ];

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
    function throwSnd() { beep(400, 0.06, 'sawtooth', 0.25); }
    function hitSnd() { beep(80, 0.12, 'square', 0.5); }
    function dieSnd() { [300,200,100,50].forEach((f,i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.5), i*100)); }
    function armorSnd() { beep(600, 0.15, 'square', 0.4); beep(300, 0.15, 'square', 0.4); }
    function scoreSnd() { beep(880, 0.07, 'sine', 0.3); }

    const HS_KEY = 'hs_ghostsngoblins';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'title';
    let started = false;
    let swipeStartX, swipeStartY, swipeT;

    let p, lances, enemies, score, spawnT, wave, bgX;

    function resetGame() {
      p = { x: W * 0.15, y: FLOOR, vx: 0, vy: 0, onGround: false,
        dir: 1, armor: true, invincible: 0, jumpCount: 0,
        throwTimer: 0, dead: false };
      lances = []; enemies = [];
      score = 0; spawnT = 80; wave = 1; bgX = 0;
    }

    function playerLand(py) {
      p.y = py; p.vy = 0; p.onGround = true; p.jumpCount = 0;
    }

    function throwLance() {
      if (p.throwTimer > 0) return;
      p.throwTimer = 25;
      throwSnd();
      lances.push({ x: p.x + p.dir * 18, y: p.y - 28, vx: p.dir * 7, vy: 0, hit: false });
    }

    function jump() {
      if (p.jumpCount >= 2) return;
      p.vy = -13; p.onGround = false; p.jumpCount++;
      beep(350, 0.08, 'sine', 0.2);
    }

    function spawnEnemy() {
      const types = ['zombie','demon','flyingDemon'];
      const t = types[Math.min(Math.floor(Math.random() * (1 + wave * 0.5)), 2)];
      const side = Math.random() > 0.5 ? 1 : 0;
      enemies.push({
        x: side ? W + 30 : -30, y: t === 'flyingDemon' ? PLAT1 - 40 : FLOOR,
        vx: side ? -(0.8 + wave * 0.1) : (0.8 + wave * 0.1),
        vy: 0, type: t, hp: t === 'demon' ? 3 : 2, maxHp: t === 'demon' ? 3 : 2,
        hitFlash: 0,
        color: { zombie: '#558855', demon: '#880022', flyingDemon: '#662288' }[t],
        attackTimer: t === 'flyingDemon' ? 0 : 0,
      });
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      swipeStartX = tx; swipeStartY = ty; swipeT = Date.now();
      if (state === 'title' || state === 'gameover') { state = 'playing'; resetGame(); if (!started) { started = true; ctx.platform.start(); } return; }
      if (!started) { started = true; ctx.platform.start(); }
      // right side = throw, left = move/jump
      if (tx > W * 0.6) { p.dir = 1; throwLance(); }
      else if (tx < W * 0.4) { p.dir = -1; throwLance(); }
      else jump();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStartX, dy = ty - swipeStartY;
      const elapsed = Date.now() - swipeT;
      if (elapsed < 250 && dy < -55 && Math.abs(dy) > Math.abs(dx)) jump();
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'title') { drawTitle(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      bgX += 0.5 * s;
      spawnT -= dt;
      if (spawnT <= 0 && enemies.length < 6) { spawnT = Math.max(50, 180 - wave * 12); spawnEnemy(); }

      // physics
      p.vy += 0.65 * s;
      p.y += p.vy * s;
      if (p.throwTimer > 0) p.throwTimer -= dt;
      if (p.invincible > 0) p.invincible--;

      // platform collision
      p.onGround = false;
      platforms.forEach(pl => {
        if (p.x > pl.x && p.x < pl.x + pl.w &&
            p.y >= pl.y - 2 && p.y <= pl.y + 12 && p.vy >= 0) {
          playerLand(pl.y);
        }
      });
      if (p.y > FLOOR + 30) { p.y = FLOOR; p.vy = 0; p.onGround = true; p.jumpCount = 0; }

      // move player left/right auto
      p.x += p.dir * 0.8 * s;
      p.x = Math.max(15, Math.min(W - 15, p.x));

      // lances
      lances.forEach(l => {
        l.x += l.vx * s;
        l.vy += 0.2 * s;
        l.y += l.vy * s;
        // check enemy hit
        enemies.forEach(e => {
          if (!l.hit && Math.abs(l.x - e.x) < 22 && Math.abs(l.y - e.y) < 22) {
            l.hit = true; e.hp--; e.hitFlash = 10; hitSnd();
            score += 20; ctx.platform.setScore(score);
            if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
            scoreSnd();
          }
        });
      });
      lances = lances.filter(l => !l.hit && l.x > -20 && l.x < W + 20 && l.y < FLOOR + 50);

      // enemies
      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        e.x += e.vx * s;
        if (e.type === 'flyingDemon') {
          e.y += Math.sin(Date.now() / 300 + e.x * 0.01) * 1.5 * s;
        } else {
          e.vy += 0.5 * s;
          e.y += e.vy * s;
          platforms.forEach(pl => {
            if (e.x > pl.x && e.x < pl.x + pl.w && e.y >= pl.y - 2 && e.y <= pl.y + 12 && e.vy >= 0) {
              e.y = pl.y; e.vy = 0;
            }
          });
          if (e.y > FLOOR) { e.y = FLOOR; e.vy = 0; }
        }
        // attack player
        if (Math.abs(e.x - p.x) < 30 && Math.abs(e.y - p.y) < 35 && p.invincible <= 0) {
          if (p.armor) { p.armor = false; p.invincible = 80; armorSnd(); ctx.platform.haptic('medium'); }
          else { dieSnd(); state = 'gameover'; }
        }
      });
      enemies = enemies.filter(e => e.hp > 0 && e.x > -80 && e.x < W + 80);

      if (score > wave * 600) wave++;

      drawBG();
      drawLances();
      drawEnemies();
      drawPlayer();
      drawHUD();
    });

    function drawBG() {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#050010'); sky.addColorStop(1, '#1a0830');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // moon
      g.fillStyle = 'rgba(220,220,180,0.8)';
      g.beginPath(); g.arc(W * 0.8, H * 0.12, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.beginPath(); g.arc(W * 0.8 + 8, H * 0.12, 28, 0, Math.PI * 2); g.fill();
      // tombstones
      for (let i = 0; i < 5; i++) {
        const tx = ((i * 180 - bgX * 0.4) % (W + 150) + W + 150) % (W + 150) - 60;
        g.fillStyle = '#3a3a5a'; g.fillRect(tx, FLOOR - 45, 28, 45);
        g.beginPath(); g.ellipse(tx + 14, FLOOR - 45, 14, 12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#555'; g.font = '10px monospace'; g.textAlign = 'center';
        g.fillText('RIP', tx + 14, FLOOR - 30);
      }
      // platforms
      platforms.forEach(pl => {
        g.fillStyle = '#4a3a2a';
        g.fillRect(pl.x, pl.y, pl.w, pl.h + 6);
        g.fillStyle = '#6a5a4a';
        g.fillRect(pl.x, pl.y, pl.w, pl.h);
      });
      // ground
      g.fillStyle = '#1a0a00'; g.fillRect(0, FLOOR + 55, W, H);
    }

    function drawLances() {
      g.fillStyle = '#ddddaa';
      lances.forEach(l => {
        g.save(); g.translate(l.x, l.y);
        const angle = Math.atan2(l.vy, l.vx);
        g.rotate(angle);
        g.fillRect(-14, -3, 28, 6);
        g.fillStyle = '#888'; g.fillRect(14, -5, 6, 10);
        g.restore();
      });
    }

    function drawEnemies() {
      enemies.forEach(e => {
        g.save(); g.translate(e.x, e.y);
        const dir = e.vx < 0 ? 1 : -1;
        g.scale(dir, 1);
        if (e.hitFlash > 0) g.globalAlpha = 0.5;
        if (e.type === 'zombie') {
          g.fillStyle = e.color; g.fillRect(-10, -40, 20, 40);
          g.fillStyle = '#8a8'; g.beginPath(); g.ellipse(0, -50, 10, 10, 0, 0, Math.PI*2); g.fill();
          g.fillStyle = '#888'; g.fillRect(-12, -42, 10, 6); g.fillRect(2, -42, 10, 6);
        } else if (e.type === 'demon') {
          g.fillStyle = e.color; g.fillRect(-14, -48, 28, 48);
          g.fillStyle = '#aa2244'; g.beginPath(); g.ellipse(0, -56, 13, 12, 0, 0, Math.PI*2); g.fill();
          // horns
          g.fillStyle = '#ff2200'; g.fillRect(-10, -70, 6, 18); g.fillRect(4, -70, 6, 18);
        } else {
          g.fillStyle = e.color; g.beginPath();
          g.ellipse(0, -28, 18, 24, 0, 0, Math.PI*2); g.fill();
          g.fillStyle = '#ffaaff'; g.beginPath(); g.ellipse(0, -28, 6, 8, 0, 0, Math.PI*2); g.fill();
          // wings
          g.fillStyle = e.color; g.fillRect(-28, -34, 12, 14); g.fillRect(16, -34, 12, 14);
        }
        g.restore();
      });
    }

    function drawPlayer() {
      if (p.invincible > 0 && Math.floor(p.invincible / 4) % 2) return;
      g.save(); g.translate(p.x, p.y); g.scale(p.dir, 1);
      if (!p.armor) {
        // underwear
        g.fillStyle = '#fff'; g.fillRect(-8, -20, 16, 18);
        g.fillStyle = '#c8a888'; g.fillRect(-8, -42, 16, 22);
        g.beginPath(); g.ellipse(0, -50, 10, 10, 0, 0, Math.PI*2); g.fill();
      } else {
        g.fillStyle = '#888'; g.fillRect(-8, -20, 16, 18);
        g.fillStyle = '#aaa'; g.fillRect(-12, -44, 24, 26);
        g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -52, 10, 11, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = '#888'; g.beginPath(); g.ellipse(0, -60, 10, 7, 0, 0, Math.PI, true); g.fill();
      }
      // throw arm pose
      g.fillStyle = p.armor ? '#aaa' : '#c8a888';
      g.fillRect(12, -40, 8, 8);
      g.restore();
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 17px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, 26);
      g.textAlign = 'center'; g.fillText(`WAVE ${wave}`, W/2, 26);
      // armor indicator
      g.fillStyle = p.armor ? '#44aaff' : '#ff4444';
      g.fillRect(10, 35, 90, 10);
      g.fillStyle = '#fff'; g.font = '9px monospace'; g.textAlign = 'left';
      g.fillText(p.armor ? 'ARMOR: ON' : 'NO ARMOR!', 12, 44);
      // controls
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.font = '10px monospace'; g.textAlign = 'center';
      g.fillText('L/R=THROW  CENTER=JUMP  SWIPE UP=JUMP', W/2, H-SB-22);
    }

    function drawTitle() {
      g.fillStyle = '#050010'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffaa00'; g.font = 'bold 22px monospace'; g.textAlign = 'center';
      g.fillText("GHOSTS 'N GOBLINS", W/2, H*0.25);
      g.fillStyle = '#888'; g.font = '13px monospace';
      g.fillText('Knight Arthur vs Undead', W/2, H*0.36);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.46);
      g.fillStyle = '#fff'; g.font = '14px monospace';
      g.fillText('TAP TO START', W/2, H*0.6);
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff4400'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('GAME OVER', W/2, H*0.38);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H*0.5);
      g.fillText(`HI: ${hs}`, W/2, H*0.59);
      g.fillStyle = '#ffaa00'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.72);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
