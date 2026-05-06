window.plethoraBit = {
  meta: {
    title: 'Shinobi',
    author: 'plethora',
    description: 'Joe Musashi — rescue the hostages!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;
    const FLOOR = H - SB - 80;

    const PLATS = [
      { x: 0, y: FLOOR, w: W, h: 8 },
      { x: W*0.05, y: FLOOR - 90, w: W*0.3, h: 8 },
      { x: W*0.38, y: FLOOR - 130, w: W*0.28, h: 8 },
      { x: W*0.7, y: FLOOR - 90, w: W*0.28, h: 8 },
      { x: W*0.15, y: FLOOR - 200, w: W*0.35, h: 8 },
      { x: W*0.55, y: FLOOR - 180, w: W*0.35, h: 8 },
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
    function shurikenSnd() { beep(600, 0.05, 'sawtooth', 0.25); }
    function hitSnd() { beep(80, 0.1, 'square', 0.5); }
    function hostageRescueSnd() { [600,700,800,1000].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'sine',0.35),i*60)); }
    function ninjutsuSnd() { [200,400,600,800,1000,1200].forEach((f,i)=>setTimeout(()=>beep(f,0.15,'sine',0.4),i*50)); }
    function dieSnd() { [300,200,100].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'sawtooth',0.5),i*130)); }
    function jumpSnd() { beep(350, 0.06, 'sine', 0.18); }
    function bossHitSnd() { beep(100, 0.18, 'sawtooth', 0.6); }

    const HS_KEY = 'hs_shinobi';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'title';
    let started = false;
    let swipeStartX, swipeStartY, swipeT;

    let p, shurikens, enemies, hostages, score, level, ninjutsu, bgX;

    function resetGame() {
      p = { x: W*0.1, y: FLOOR, vx: 0, vy: 0, onGround: true, dir: 1,
        hp: 3, maxHp: 3, invincible: 0, jumpCount: 0, throwTimer: 0 };
      shurikens = []; enemies = []; hostages = [];
      score = 0; level = 1; ninjutsu = 2; bgX = 0;
      spawnLevel();
    }

    function spawnLevel() {
      enemies = []; hostages = [];
      const eCount = 3 + level * 2;
      for (let i = 0; i < eCount; i++) {
        const plat = PLATS[Math.floor(Math.random() * PLATS.length)];
        const type = Math.random() > 0.6 ? 'gunner' : Math.random() > 0.5 ? 'dog' : 'ninja';
        enemies.push({ x: plat.x + Math.random() * plat.w, y: plat.y,
          hp: type === 'dog' ? 1 : 2, maxHp: type === 'dog' ? 1 : 2,
          vx: (Math.random() > 0.5 ? 1 : -1) * 0.8,
          onGround: true, attackTimer: type === 'gunner' ? 1200 : 1800,
          hitFlash: 0, type,
          color: { ninja: '#333355', gunner: '#335533', dog: '#8b4513' }[type] });
      }
      const hCount = 2 + level;
      for (let i = 0; i < hCount; i++) {
        const plat = PLATS[Math.floor(Math.random() * PLATS.length)];
        hostages.push({ x: plat.x + Math.random() * plat.w, y: plat.y, rescued: false });
      }
    }

    function throwShuriken() {
      if (p.throwTimer > 0) return;
      p.throwTimer = 18; shurikenSnd();
      shurikens.push({ x: p.x + p.dir*14, y: p.y - 22, vx: p.dir*8, vy: 0, hit: false, spin: 0 });
    }

    function jump() {
      if (p.jumpCount >= 2) return;
      p.vy = p.jumpCount === 0 ? -14 : -11;
      p.onGround = false; p.jumpCount++;
      jumpSnd();
    }

    function doNinjutsu() {
      if (ninjutsu <= 0) return;
      ninjutsu--; ninjutsuSnd();
      ctx.platform.haptic('heavy');
      enemies.forEach(e => { e.hp = 0; e.hitFlash = 20; });
      enemies = [];
      score += 200; ctx.platform.setScore(score);
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
      if (ty > H - SB - 100) { doNinjutsu(); return; }
      if (tx > W * 0.6) { p.dir = 1; throwShuriken(); }
      else if (tx < W * 0.4) { p.dir = -1; throwShuriken(); }
      else jump();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStartX, dy = ty - swipeStartY;
      const elapsed = Date.now() - swipeT;
      if (elapsed < 300 && dy < -65 && Math.abs(dy) > Math.abs(dx) * 1.2) jump();
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'title') { drawTitle(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      bgX += 0.4 * s;
      if (p.throwTimer > 0) p.throwTimer -= dt;
      if (p.invincible > 0) p.invincible--;

      // physics
      p.vy += 0.65 * s;
      p.y += p.vy * s;
      p.onGround = false;
      PLATS.forEach(pl => {
        if (p.x > pl.x - 10 && p.x < pl.x + pl.w + 10 && p.y >= pl.y - 2 && p.y <= pl.y + 15 && p.vy >= 0) {
          p.y = pl.y; p.vy = 0; p.onGround = true; p.jumpCount = 0;
        }
      });

      // auto-walk toward nearest thing
      const allTargets = [...enemies, ...hostages.filter(h => !h.rescued)];
      if (allTargets.length > 0) {
        const near = allTargets.reduce((a, b) => Math.abs(b.x - p.x) < Math.abs(a.x - p.x) ? b : a);
        if (Math.abs(near.x - p.x) > 20) { p.x += Math.sign(near.x - p.x) * 1.5 * s; p.dir = Math.sign(near.x - p.x); }
      }
      p.x = Math.max(10, Math.min(W - 10, p.x));

      // shurikens
      shurikens.forEach(sh => {
        sh.x += sh.vx * s; sh.spin += 0.3 * s;
        enemies.forEach(e => {
          if (!sh.hit && Math.abs(sh.x - e.x) < 18 && Math.abs(sh.y - e.y) < 18) {
            sh.hit = true; e.hp--; e.hitFlash = 8; hitSnd();
            score += 20; ctx.platform.setScore(score);
            if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
          }
        });
      });
      shurikens = shurikens.filter(sh => !sh.hit && sh.x > -20 && sh.x < W + 20);

      // enemies update
      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        e.x += e.vx * s;
        if (e.x < 0 || e.x > W) e.vx *= -1;
        e.attackTimer -= dt;
        if (e.type === 'gunner' && e.attackTimer <= 0 && Math.abs(e.y - p.y) < 30) {
          e.attackTimer = 1200 + Math.random() * 600;
          shurikens.push({ x: e.x, y: e.y - 15, vx: (p.x - e.x) > 0 ? 5 : -5, vy: 0, hit: false, spin: 0, isEnemy: true });
        }
        if (Math.abs(e.x - p.x) < 22 && Math.abs(e.y - p.y) < 24 && p.invincible <= 0) {
          if (e.attackTimer <= 0 || e.type === 'dog') {
            e.attackTimer = 1500;
            p.hp--; p.invincible = 55; hitSnd();
            if (p.hp <= 0) { dieSnd(); state = 'gameover'; }
          }
        }
      });
      enemies = enemies.filter(e => e.hp > 0);

      // enemy shurikens hit player
      shurikens.forEach(sh => {
        if (sh.isEnemy && !sh.hit && Math.abs(sh.x - p.x) < 16 && Math.abs(sh.y - p.y) < 16 && p.invincible <= 0) {
          sh.hit = true; p.hp--; p.invincible = 50; hitSnd();
          if (p.hp <= 0) { dieSnd(); state = 'gameover'; }
        }
      });

      // hostages
      hostages.forEach(h => {
        if (!h.rescued && Math.abs(h.x - p.x) < 24 && Math.abs(h.y - p.y) < 24) {
          h.rescued = true; score += 100; ctx.platform.setScore(score); hostageRescueSnd();
          ctx.platform.haptic('medium');
        }
      });

      const remaining = hostages.filter(h => !h.rescued).length;
      if (remaining === 0 && enemies.length === 0) {
        score += level * 200; level++;
        p.hp = Math.min(p.maxHp, p.hp + 1);
        ctx.timeout(() => { if (state === 'playing') spawnLevel(); }, 1000);
      }

      drawBG();
      drawHostages();
      drawShurikens();
      drawEnemies();
      drawPlayer();
      drawHUD();
    });

    function drawBG() {
      g.fillStyle = '#0a0510'; g.fillRect(0, 0, W, H);
      // pagoda silhouettes
      [[0.1, 0.45], [0.5, 0.38], [0.82, 0.42]].forEach(([bx, bh], i) => {
        const x = ((bx*W - bgX*0.3) % (W+150) + W+150) % (W+150) - 60;
        g.fillStyle = '#1a0820';
        const base = FLOOR;
        const top = base - bh * H * 0.5;
        g.fillRect(x - 20, top, 40, base - top);
        // pagoda tiers
        for (let t = 0; t < 3; t++) {
          const ty = top + t * 40;
          g.fillStyle = '#2a1035';
          g.fillRect(x - 30 + t*5, ty - 8, 60 - t*10, 8);
        }
      });
      // platforms
      PLATS.forEach(pl => {
        g.fillStyle = '#2a1a3a';
        g.fillRect(pl.x, pl.y, pl.w, pl.h + 5);
        g.fillStyle = '#4a3a5a';
        g.fillRect(pl.x, pl.y, pl.w, pl.h);
      });
      // ground
      g.fillStyle = '#1a0a1a'; g.fillRect(0, FLOOR+55, W, H);
    }

    function drawHostages() {
      hostages.filter(h => !h.rescued).forEach(h => {
        g.save(); g.translate(h.x, h.y);
        g.fillStyle = '#ffcc88'; g.fillRect(-5, -28, 10, 18);
        g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -34, 7, 7, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = '#00ff88'; g.font = '9px monospace'; g.textAlign = 'center';
        g.fillText('SAVE', 0, -42);
        g.restore();
      });
    }

    function drawShurikens() {
      shurikens.forEach(sh => {
        g.save(); g.translate(sh.x, sh.y); g.rotate(sh.spin);
        g.fillStyle = sh.isEnemy ? '#ff4400' : '#aaaacc';
        for (let i = 0; i < 4; i++) {
          g.save(); g.rotate(i * Math.PI/2);
          g.fillRect(-2, -8, 4, 16);
          g.restore();
        }
        g.restore();
      });
    }

    function drawEnemies() {
      enemies.forEach(e => {
        g.save(); g.translate(e.x, e.y);
        const dir = e.vx >= 0 ? 1 : -1;
        g.scale(dir, 1);
        if (e.hitFlash > 0) g.globalAlpha = 0.5;
        if (e.type === 'dog') {
          g.fillStyle = e.color;
          g.fillRect(-12, -14, 24, 14);
          g.fillRect(-14, -10, 6, 10);
          g.beginPath(); g.ellipse(-16, -16, 8, 6, -0.3, 0, Math.PI*2); g.fill();
        } else {
          g.fillStyle = e.color; g.fillRect(-9, -38, 18, 38);
          g.fillStyle = e.type === 'ninja' ? '#555577' : '#336633';
          g.fillRect(-11, -40, 22, 8);
          g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -46, 9, 9, 0, 0, Math.PI*2); g.fill();
          if (e.type === 'ninja') {
            g.fillStyle = '#555577'; g.fillRect(-14, -44, 28, 6);
          }
        }
        g.restore();
      });
    }

    function drawPlayer() {
      if (p.invincible > 0 && Math.floor(p.invincible/4) % 2) return;
      g.save(); g.translate(p.x, p.y); g.scale(p.dir, 1);
      // legs
      g.fillStyle = '#111122'; g.fillRect(-8, -14, 7, 18); g.fillRect(1, -14, 7, 18);
      // body
      g.fillStyle = '#2222aa'; g.fillRect(-10, -42, 20, 28);
      // head
      g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -50, 9, 9, 0, 0, Math.PI*2); g.fill();
      // headband
      g.fillStyle = '#ff2200'; g.fillRect(-10, -55, 20, 6);
      // throw arm
      g.fillStyle = '#c8a888'; g.fillRect(12, -38, 7, 7);
      g.restore();
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, 26);
      g.textAlign = 'center'; g.fillText(`MISSION ${level}`, W/2, 26);
      // hp hearts
      for (let i = 0; i < p.maxHp; i++) {
        g.fillStyle = i < p.hp ? '#ff4444' : '#333';
        g.beginPath(); g.arc(14 + i * 22, 42, 8, 0, Math.PI*2); g.fill();
      }
      // hostages remaining
      const rem = hostages.filter(h => !h.rescued).length;
      g.fillStyle = '#00ff88'; g.font = '11px monospace'; g.textAlign = 'right';
      g.fillText(`HOSTAGES: ${rem}`, W-10, 44);
      // ninjutsu
      g.fillStyle = '#aaa'; g.font = '10px monospace'; g.textAlign = 'left';
      g.fillText(`NINJUTSU: ${ninjutsu}`, 10, H-SB-50);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '10px monospace'; g.textAlign = 'center';
      g.fillText('L/R=THROW  CTR=JUMP  SWIPE UP=HIGH JUMP  BOT=NINJUTSU', W/2, H-SB-25);
    }

    function drawTitle() {
      g.fillStyle = '#0a0510'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff2200'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
      g.fillText('SHINOBI', W/2, H*0.25);
      g.fillStyle = '#aaa'; g.font = '13px monospace';
      g.fillText('Joe Musashi — rescue hostages!', W/2, H*0.38);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.48);
      g.fillStyle = '#fff'; g.font = '14px monospace';
      g.fillText('TAP TO START', W/2, H*0.62);
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff2200'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('MISSION FAILED', W/2, H*0.37);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H*0.49);
      g.fillText(`HI: ${hs}`, W/2, H*0.58);
      g.fillStyle = '#00ff88'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.72);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
