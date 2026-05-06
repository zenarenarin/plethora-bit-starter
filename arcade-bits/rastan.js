window.plethoraBit = {
  meta: {
    title: 'Rastan',
    author: 'plethora',
    description: 'Barbarian warrior — conquer the realm!',
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
      { x: 0, y: FLOOR, w: W, h: 8, type: 'ground' },
      { x: W*0.08, y: FLOOR - 100, w: W*0.25, h: 8, type: 'stone' },
      { x: W*0.4, y: FLOOR - 80, w: W*0.25, h: 8, type: 'stone' },
      { x: W*0.7, y: FLOOR - 110, w: W*0.28, h: 8, type: 'stone' },
      { x: W*0.15, y: FLOOR - 190, w: W*0.3, h: 8, type: 'rope' },
      { x: W*0.55, y: FLOOR - 170, w: W*0.32, h: 8, type: 'rope' },
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
    function swordSnd() { beep(500, 0.06, 'sawtooth', 0.3); setTimeout(() => beep(250, 0.08, 'sawtooth', 0.35), 55); }
    function hitSnd() { beep(80, 0.12, 'square', 0.5); }
    function jumpSnd() { beep(300, 0.07, 'sine', 0.2); }
    function dieSnd() { [300, 200, 100, 50].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.5), i * 110)); }
    function powerupSnd() { [400, 600, 800].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'sine', 0.4), i * 70)); }

    const HS_KEY = 'hs_rastan';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'title';
    let started = false;
    let swipeStartX, swipeStartY, swipeT;

    let p, enemies, powerups, score, wave, bgX;
    const WEAPONS = ['Sword', 'Fire Sword', 'Battle Axe'];
    let weaponIdx = 0;

    function resetGame() {
      p = { x: W*0.12, y: FLOOR, vx: 0, vy: 0, onGround: true,
        hp: 5, maxHp: 5, invincible: 0, jumpCount: 0,
        dir: 1, swingAnim: 0, attackTimer: 0 };
      enemies = []; powerups = [];
      score = 0; wave = 1; bgX = 0; weaponIdx = 0;
      spawnWave();
    }

    function spawnWave() {
      const isBoss = wave % 4 === 0;
      const count = isBoss ? 1 : 2 + Math.min(wave, 4);
      for (let i = 0; i < count; i++) {
        const plat = PLATS[Math.floor(Math.random() * PLATS.length)];
        const type = isBoss ? 'boss' : ['lizardman', 'dragon', 'skeleton'][Math.floor(Math.random() * (wave > 2 ? 3 : 2))];
        enemies.push({
          x: plat.x + plat.w, y: plat.y, vx: -(0.9 + wave * 0.08),
          vy: 0, onGround: true,
          hp: isBoss ? 10 : (type === 'dragon' ? 4 : 2),
          maxHp: isBoss ? 10 : (type === 'dragon' ? 4 : 2),
          type, hitFlash: 0, attackTimer: 0,
          color: { lizardman: '#446644', dragon: '#aa2200', skeleton: '#8a8a8a', boss: '#220055' }[type] || '#444',
          isBoss,
        });
      }
      if (Math.random() > 0.5) spawnPowerup();
    }

    function spawnPowerup() {
      const plat = PLATS[1 + Math.floor(Math.random() * (PLATS.length - 1))];
      powerups.push({ x: plat.x + Math.random() * plat.w, y: plat.y - 15, type: Math.floor(Math.random() * 3) });
    }

    function doSwing() {
      if (p.attackTimer > 0) return;
      p.swingAnim = 18; p.attackTimer = 15;
      swordSnd();
      const range = weaponIdx === 0 ? 70 : weaponIdx === 1 ? 90 : 75;
      const dmg = weaponIdx === 0 ? 1 : weaponIdx === 1 ? 2 : 2;
      enemies.forEach(e => {
        const dx = e.x - p.x;
        if (Math.sign(dx) === p.dir && Math.abs(dx) < range && Math.abs(e.y - p.y) < 45) {
          e.hp -= dmg; e.hitFlash = 10; e.vx = p.dir * 5;
          hitSnd(); score += 15; ctx.platform.setScore(score);
          if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
        }
      });
      enemies = enemies.filter(e => e.hp > 0);
      if (enemies.length === 0) { score += wave * 50; wave++; ctx.timeout(() => { if(state==='playing') spawnWave(); }, 1200); }
    }

    function doJump() {
      if (p.jumpCount >= 2) return;
      p.vy = p.jumpCount === 0 ? -13 : -10;
      p.onGround = false; p.jumpCount++;
      jumpSnd();
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
      p.dir = tx > p.x ? 1 : -1;
      if (tx < W * 0.15) { doJump(); return; }
      doSwing();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStartX, dy = ty - swipeStartY;
      if (Date.now() - swipeT < 300 && dy < -55 && Math.abs(dy) > Math.abs(dx)) doJump();
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'title') { drawTitle(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      bgX += 0.5 * s;
      if (p.attackTimer > 0) p.attackTimer -= dt;
      if (p.swingAnim > 0) p.swingAnim--;
      if (p.invincible > 0) p.invincible--;

      p.vy += 0.68 * s; p.y += p.vy * s;
      p.onGround = false;
      PLATS.forEach(pl => {
        if (p.x > pl.x - 8 && p.x < pl.x + pl.w + 8 && p.y >= pl.y - 2 && p.y <= pl.y + 16 && p.vy >= 0) {
          p.y = pl.y; p.vy = 0; p.onGround = true; p.jumpCount = 0;
        }
      });

      // walk toward enemies
      if (enemies.length > 0) {
        const near = enemies.reduce((a, b) => Math.abs(b.x - p.x) < Math.abs(a.x - p.x) ? b : a);
        const dx = near.x - p.x;
        if (Math.abs(dx) > 20) { p.x += Math.sign(dx) * 1.6 * s; p.dir = Math.sign(dx); }
      } else { p.x += 1.0 * s; }
      p.x = Math.max(12, Math.min(W - 12, p.x));

      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        if (Math.abs(e.vx) > 0.3) e.vx *= 0.87; else e.vx = 0;
        e.x += e.vx * s;
        e.vy += 0.5 * s; e.y += e.vy * s;
        PLATS.forEach(pl => {
          if (e.x > pl.x && e.x < pl.x + pl.w && e.y >= pl.y - 2 && e.y <= pl.y + 14 && e.vy >= 0) {
            e.y = pl.y; e.vy = 0; e.onGround = true;
          }
        });
        if (e.y > FLOOR) { e.y = FLOOR; e.vy = 0; }
        if (e.vx === 0) {
          const dx = p.x - e.x;
          if (Math.abs(dx) > 60) e.x += Math.sign(dx) * (e.isBoss ? 0.7 : 1.1) * s;
          e.dir = dx > 0 ? 1 : -1;
        }
        e.attackTimer -= dt;
        if (e.attackTimer <= 0 && Math.abs(e.x - p.x) < 58 && Math.abs(e.y - p.y) < 35 && p.invincible <= 0) {
          e.attackTimer = e.isBoss ? 900 : 1500;
          p.hp--; p.invincible = 50; hitSnd();
          if (p.hp <= 0) { dieSnd(); state = 'gameover'; }
        }
      });

      powerups.forEach(pu => {
        if (Math.abs(pu.x - p.x) < 25 && Math.abs(pu.y - p.y) < 25) {
          if (pu.type === 0) { p.hp = Math.min(p.maxHp, p.hp + 2); }
          else { weaponIdx = Math.min(2, pu.type); }
          powerupSnd(); pu.taken = true;
          ctx.platform.haptic('light');
        }
      });
      powerups = powerups.filter(pu => !pu.taken);

      drawBG();
      drawPowerups();
      drawEnemies();
      drawPlayer();
      drawHUD();
    });

    function drawBG() {
      const sky = g.createLinearGradient(0, 0, 0, FLOOR);
      sky.addColorStop(0, '#0e0818'); sky.addColorStop(1, '#3a2050');
      g.fillStyle = sky; g.fillRect(0, 0, W, FLOOR + 55);
      // lava river
      g.fillStyle = '#330800';
      g.fillRect(0, FLOOR + 30, W, 30);
      const t = Date.now() / 300;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `rgba(255,${50+i*15},0,${0.3+Math.sin(t+i)*0.2})`;
        g.fillRect(i * W/7, FLOOR + 32, W/7 - 4, 10);
      }
      // stone ruins
      [[0.05,0.4],[0.3,0.35],[0.6,0.42],[0.85,0.38]].forEach(([bx,bh], i) => {
        const x = ((bx*W - bgX*0.25) % (W+120)+W+120)%(W+120) - 50;
        g.fillStyle = `hsl(30,${12+i*3}%,${14+i%2*5}%)`;
        g.fillRect(x, FLOOR - bh*H*0.5, 70, bh*H*0.5);
        // battlements
        for (let b = 0; b < 3; b++) {
          g.fillRect(x + b*25, FLOOR - bh*H*0.5 - 12, 14, 12);
        }
      });
      PLATS.forEach(pl => {
        g.fillStyle = pl.type === 'rope' ? '#5a3a1a' : '#4a3a2a';
        g.fillRect(pl.x, pl.y, pl.w, pl.h + 5);
        g.fillStyle = pl.type === 'rope' ? '#8a6030' : '#6a5040';
        g.fillRect(pl.x, pl.y, pl.w, pl.h);
        if (pl.type === 'rope') {
          g.strokeStyle = '#6a4010'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(pl.x + pl.w/2, pl.y);
          g.lineTo(pl.x + pl.w/2, pl.y - 80); g.stroke();
        }
      });
      g.fillStyle = '#1a0a05'; g.fillRect(0, FLOOR+55, W, H);
    }

    function drawPowerups() {
      powerups.forEach(pu => {
        g.save(); g.translate(pu.x, pu.y);
        const colors = ['#ff4444','#ff8800','#4488ff'];
        const labels = ['HP','FIRE','AXE'];
        g.fillStyle = colors[pu.type];
        g.beginPath(); g.arc(0, 0, 12, 0, Math.PI*2); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold 8px monospace'; g.textAlign = 'center';
        g.fillText(labels[pu.type], 0, 4);
        g.restore();
      });
    }

    function drawEnemies() {
      enemies.forEach(e => {
        g.save(); g.translate(e.x, e.y);
        const dir = e.vx <= 0 ? 1 : -1;
        g.scale(dir, 1);
        if (e.hitFlash > 0) g.globalAlpha = 0.5;
        const h = e.isBoss ? 75 : e.type === 'dragon' ? 55 : 50;
        const w = e.isBoss ? 35 : 22;
        g.fillStyle = e.color; g.fillRect(-w/2, -h, w, h);
        g.fillStyle = e.isBoss ? '#330066' : e.color;
        g.beginPath(); g.ellipse(0, -h - 13, w/2+4, 14, 0, 0, Math.PI*2); g.fill();
        if (e.type === 'dragon') {
          g.fillStyle = '#ff4400'; g.fillRect(w/2, -h+10, 20, 6);
          g.fillStyle = '#ff6600'; g.fillRect(w/2+18, -h+10, 12, 8);
        }
        if (e.isBoss) {
          g.fillStyle = '#ffdd00'; g.font = 'bold 10px monospace'; g.textAlign = 'center';
          g.fillText('BOSS', 0, -h - 28);
        }
        g.fillStyle = '#500'; g.fillRect(-18, -h-24, 36, 4);
        g.fillStyle = '#f44'; g.fillRect(-18, -h-24, 36*(e.hp/e.maxHp), 4);
        g.restore();
      });
    }

    function drawPlayer() {
      if (p.invincible > 0 && Math.floor(p.invincible/4)%2) return;
      g.save(); g.translate(p.x, p.y); g.scale(p.dir, 1);
      g.fillStyle = '#8b4513'; g.fillRect(-8, -18, 7, 22); g.fillRect(1, -18, 7, 22);
      g.fillStyle = '#c8a888'; g.fillRect(-11, -52, 22, 34);
      g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -60, 11, 12, 0, 0, Math.PI*2); g.fill();
      g.fillStyle = '#8b4513'; g.fillRect(-12, -56, 24, 10);
      // weapon
      const WEAPON_COLORS = ['#aaaaaa', '#ff6600', '#888855'];
      g.fillStyle = WEAPON_COLORS[weaponIdx];
      const swingR = p.swingAnim > 0 ? -0.5 : 0;
      g.save(); g.translate(14, -48); g.rotate(swingR);
      g.fillRect(0, -22, 5, 38);
      if (weaponIdx === 1) { g.fillStyle = '#ff2200'; g.fillRect(-3, -22, 11, 12); }
      if (weaponIdx === 2) { g.fillStyle = '#aaa'; g.fillRect(-6, -28, 17, 10); }
      g.restore();
      g.restore();
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, 26);
      g.textAlign = 'center'; g.fillText(`WAVE ${wave}`, W/2, 26);
      for (let i = 0; i < p.maxHp; i++) {
        g.fillStyle = i < p.hp ? '#ff4444' : '#333';
        g.fillRect(10 + i * 18, 35, 14, 12);
      }
      const wColors = ['#aaa', '#ff8800', '#8a8844'];
      g.fillStyle = wColors[weaponIdx]; g.font = 'bold 11px monospace'; g.textAlign = 'left';
      g.fillText(`WEAPON: ${WEAPONS[weaponIdx]}`, 10, H-SB-45);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '10px monospace'; g.textAlign = 'center';
      g.fillText('TAP=SWORD  LEFT EDGE=JUMP  SWIPE UP=JUMP', W/2, H-SB-24);
    }

    function drawTitle() {
      g.fillStyle = '#0e0818'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#c8a050'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
      g.fillText('RASTAN', W/2, H*0.25);
      g.fillStyle = '#888'; g.font = '13px monospace';
      g.fillText('Barbarian Warrior', W/2, H*0.37);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.47);
      g.fillStyle = '#fff'; g.font = '14px monospace';
      g.fillText('TAP TO START', W/2, H*0.62);
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#c8a050'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('GAME OVER', W/2, H*0.37);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H*0.49);
      g.fillText(`HI: ${hs}`, W/2, H*0.58);
      g.fillStyle = '#c8a050'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.72);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
