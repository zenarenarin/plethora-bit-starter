window.plethoraBit = {
  meta: {
    title: 'Final Fight',
    author: 'plethora',
    description: 'Metro City brawler — save Jessica!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;
    const FLOOR = H - SB - 90;

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
    function punchSnd() { beep(220, 0.07, 'sawtooth'); setTimeout(() => beep(150, 0.05, 'square'), 60); }
    function hitSnd() { beep(90, 0.12, 'square', 0.5); }
    function grabSnd() { beep(300, 0.08, 'square', 0.3); }
    function eatSnd() { [600, 800, 1000].forEach((f, i) => setTimeout(() => beep(f, 0.06, 'sine', 0.25), i * 50)); }
    function deathSnd() { [300, 200, 100].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.5), i * 150)); }

    const FIGHTERS = [
      { name: 'Haggar', color: '#3366cc', skin: '#c8a050', style: 'Grappler', comboMax: 2, damage: 2, speed: 0.8 },
      { name: 'Cody',   color: '#cc8833', skin: '#d4a870', style: 'Balanced', comboMax: 3, damage: 1, speed: 1.0 },
      { name: 'Guy',    color: '#cc2222', skin: '#d4a870', style: 'Fast',     comboMax: 4, damage: 1, speed: 1.3 },
    ];

    const HS_KEY = 'hs_finalfight';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'select';
    let chosen = 0;
    let started = false;
    let holdTimer = 0, isHolding = false;
    let lastTap = 0, fingerCount = 0;

    let p, enemies, foods, score, wave, comboCount, comboTimer, bgX, spawnT;

    function resetGame() {
      const f = FIGHTERS[chosen];
      p = { x: W * 0.2, y: FLOOR, hp: 6, maxHp: 6, vx: 0,
        invincible: 0, attackTimer: 0, punchFrame: 0, comboHit: 0,
        grabTarget: null, grabTimer: 0, jumpVy: 0, onGround: true,
        color: f.color, skin: f.skin, speed: f.speed, comboMax: f.comboMax,
        dmg: f.damage, dir: 1, chargeAnim: 0 };
      enemies = []; foods = [];
      score = 0; wave = 1; comboCount = 0; comboTimer = 0; bgX = 0; spawnT = 100;
    }

    function spawnEnemy() {
      const types = ['punk', 'andore', 'roxy'];
      const t = types[Math.floor(Math.random() * (wave > 2 ? 3 : 2))];
      enemies.push({
        x: W + 50, y: FLOOR,
        hp: t === 'andore' ? 6 : 3, maxHp: t === 'andore' ? 6 : 3,
        vx: -(0.7 + wave * 0.07), dir: -1, type: t,
        attackTimer: t === 'andore' ? 1200 : 1800,
        hitFlash: 0,
        color: { punk: '#aa3322', andore: '#556633', roxy: '#cc4466' }[t],
      });
      if (Math.random() > 0.6) {
        foods.push({ x: W + 80, y: FLOOR, type: Math.random() > 0.5 ? 'chicken' : 'pizza', hp: t === 'andore' ? 2 : 1 });
      }
    }

    function doPunch() {
      if (p.grabTarget) { doPileDriver(); return; }
      p.attackTimer = 14; p.punchFrame = 12;
      p.comboHit = (p.comboHit + 1) % p.comboMax;
      punchSnd();
      enemies.forEach(e => {
        const dx = e.x - p.x;
        if (Math.sign(dx) === p.dir && Math.abs(dx) < 88 && Math.abs(e.y - p.y) < 42) {
          e.hp -= p.dmg; e.hitFlash = 10; e.vx = p.dir * (p.comboHit === p.comboMax - 1 ? 7 : 3);
          hitSnd();
          comboCount++; comboTimer = 70;
          score += 10 * comboCount; ctx.platform.setScore(score);
          if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
        }
      });
      enemies = enemies.filter(e => e.hp > 0);
      if (enemies.length === 0) nextWave();
    }

    function doCharge() {
      p.chargeAnim = 25; p.attackTimer = 22;
      beep(300, 0.08, 'sawtooth', 0.5); beep(150, 0.15, 'sawtooth', 0.6);
      enemies.forEach(e => {
        const dx = e.x - p.x;
        if (Math.sign(dx) === p.dir && Math.abs(dx) < 120) {
          e.hp -= 3; e.hitFlash = 15; e.vx = p.dir * 10;
          hitSnd();
          score += 40; ctx.platform.setScore(score);
          ctx.platform.haptic('heavy');
        }
      });
      enemies = enemies.filter(e => e.hp > 0);
      if (enemies.length === 0) nextWave();
    }

    function doGrab() {
      const near = enemies.find(e => Math.abs(e.x - p.x) < 55 && Math.abs(e.y - p.y) < 30);
      if (near && !p.grabTarget) { p.grabTarget = near; p.grabTimer = 100; grabSnd(); }
    }

    function doPileDriver() {
      if (!p.grabTarget) return;
      p.grabTarget.hp -= 4; p.grabTarget.hitFlash = 20;
      p.grabTarget.vx = (Math.random() - 0.5) * 8;
      hitSnd(); beep(60, 0.3, 'sawtooth', 0.6);
      score += 60; ctx.platform.setScore(score);
      ctx.platform.haptic('heavy');
      p.grabTarget = null; p.grabTimer = 0;
      enemies = enemies.filter(e => e.hp > 0);
      if (enemies.length === 0) nextWave();
    }

    function doJumpAttack() {
      if (!p.onGround) return;
      p.onGround = false; p.jumpVy = -12;
      beep(400, 0.06, 'sine', 0.2);
      setTimeout(() => doPunch(), 150);
    }

    function nextWave() {
      score += wave * 50;
      wave++;
      ctx.timeout(() => { if (state === 'playing') spawnEnemy(); }, 1500);
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      fingerCount = e.touches.length;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      if (state === 'select') {
        chosen = Math.min(2, Math.floor(tx / (W / 3)));
        state = 'playing'; resetGame();
        if (!started) { started = true; ctx.platform.start(); }
        return;
      }
      if (state === 'gameover') { state = 'select'; return; }
      if (!started) { started = true; ctx.platform.start(); }
      if (fingerCount >= 2) { doJumpAttack(); return; }
      p.dir = tx > p.x ? 1 : -1;
      isHolding = true; holdTimer = 0;
      doGrab();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      isHolding = false;
      if (holdTimer > 0 && holdTimer < 20) doPunch();
      else if (holdTimer >= 20) doCharge();
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'select') { drawSelect(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      bgX += 0.6 * s;
      spawnT -= dt;
      if (spawnT <= 0 && enemies.length < 5) { spawnT = Math.max(80, 220 - wave * 15); spawnEnemy(); }

      if (isHolding) holdTimer++;
      if (p.attackTimer > 0) p.attackTimer -= dt;
      if (p.punchFrame > 0) p.punchFrame--;
      if (p.chargeAnim > 0) p.chargeAnim--;
      if (p.invincible > 0) p.invincible--;
      if (p.comboTimer > 0) p.comboTimer--; else comboCount = 0;
      if (p.grabTimer > 0) {
        p.grabTimer -= dt;
        if (p.grabTimer <= 0) p.grabTarget = null;
        if (p.grabTarget) { p.grabTarget.x = p.x + p.dir * 48; p.grabTarget.y = p.y; }
      }
      if (!p.onGround) {
        p.jumpVy += 0.7 * s;
        p.y += p.jumpVy * s;
        if (p.y >= FLOOR) { p.y = FLOOR; p.onGround = true; p.jumpVy = 0; }
      }
      // walk toward enemies
      if (enemies.length > 0 && !p.grabTarget) {
        const near = enemies.reduce((a, b) => Math.abs(b.x - p.x) < Math.abs(a.x - p.x) ? b : a);
        const dx = near.x - p.x;
        if (Math.abs(dx) > 30) { p.x += Math.sign(dx) * p.speed * s; p.dir = Math.sign(dx); }
      } else if (!p.grabTarget) { p.x += p.speed * 0.8 * s; }
      p.x = Math.max(25, Math.min(W - 25, p.x));

      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        if (Math.abs(e.vx) > 0.3) e.vx *= 0.85; else e.vx = 0;
        e.x += e.vx * s;
        const dx2 = p.x - e.x;
        if (e.vx === 0 && Math.abs(dx2) > 58) e.x += Math.sign(dx2) * (e.type === 'andore' ? 0.7 : 1.0) * s;
        e.dir = dx2 > 0 ? 1 : -1;
        e.attackTimer -= dt;
        if (e.attackTimer <= 0 && Math.abs(e.x - p.x) < 62 && p.invincible <= 0 && !p.grabTarget) {
          e.attackTimer = e.type === 'andore' ? 1200 : 1800;
          p.hp--; p.invincible = 50; hitSnd();
          if (p.hp <= 0) { deathSnd(); state = 'gameover'; }
        }
      });

      // food
      foods.forEach(food => {
        if (Math.abs(food.x - p.x) < 28 && Math.abs(food.y - p.y) < 28) {
          p.hp = Math.min(p.maxHp, p.hp + food.hp);
          eatSnd(); food.eaten = true;
          ctx.platform.haptic('light');
        }
      });
      foods = foods.filter(f => !f.eaten);

      drawBG();
      drawFoods();
      drawEnemies();
      drawPlayerSprite();
      drawHUD();
    });

    function drawBG() {
      g.fillStyle = '#1a0a05'; g.fillRect(0, 0, W, H);
      // metro city backdrop
      [[0.05,0.25],[0.22,0.32],[0.4,0.22],[0.58,0.3],[0.78,0.26],[0.9,0.28]].forEach(([bx,bh], i) => {
        const x = ((bx*W - bgX*0.25) % (W*1.3) + W*1.3) % (W*1.3) - 60;
        g.fillStyle = `hsl(20,${15+i*3}%,${12+i%2*5}%)`;
        g.fillRect(x, FLOOR - bh*FLOOR, 85, bh*FLOOR);
        g.fillStyle = 'rgba(255,200,50,0.5)';
        for (let wy = FLOOR - bh*FLOOR + 10; wy < FLOOR - 10; wy += 16)
          for (let wx = x + 6; wx < x + 80; wx += 14)
            if (Math.random() > 0.5) g.fillRect(wx, wy, 6, 8);
      });
      // ground
      g.fillStyle = '#2a1505';
      g.fillRect(0, FLOOR + 55, W, H);
      // lane marks
      g.strokeStyle = 'rgba(255,100,0,0.3)'; g.lineWidth = 2;
      for (let lx = (-bgX % 80 + 80) % 80; lx < W; lx += 80) {
        g.beginPath(); g.moveTo(lx, FLOOR + 60); g.lineTo(lx + 40, FLOOR + 60); g.stroke();
      }
    }

    function drawFoods() {
      foods.forEach(f => {
        g.save(); g.translate(f.x, f.y - 15);
        if (f.type === 'chicken') {
          g.fillStyle = '#ffcc55'; g.beginPath(); g.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#cc8822'; g.fillRect(-5, -12, 10, 14);
        } else {
          g.fillStyle = '#cc4422'; g.beginPath(); g.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#ffaa00'; g.beginPath(); g.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      });
    }

    function drawEnemies() {
      enemies.forEach(e => {
        if (e.hitFlash > 0 && Math.floor(e.hitFlash / 3) % 2) { return; }
        g.save(); g.translate(e.x, e.y); g.scale(e.dir, 1);
        const w = e.type === 'andore' ? 28 : 20;
        const h = e.type === 'andore' ? 65 : 52;
        g.fillStyle = e.color; g.fillRect(-w/2, -h, w, h);
        g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -h-13, w/2+2, 13, 0, 0, Math.PI*2); g.fill();
        if (e.type === 'roxy') { g.fillStyle = '#ff88cc'; g.fillRect(-w/2, -h, w, 20); }
        g.fillStyle = '#500'; g.fillRect(-17, -h-24, 34, 4);
        g.fillStyle = '#f44'; g.fillRect(-17, -h-24, 34*(e.hp/e.maxHp), 4);
        g.restore();
      });
    }

    function drawPlayerSprite() {
      if (p.invincible > 0 && Math.floor(p.invincible / 4) % 2) return;
      const f = FIGHTERS[chosen];
      g.save(); g.translate(p.x, p.y); g.scale(p.dir, 1);
      g.fillStyle = '#888'; g.fillRect(-10, -15, 9, 22); g.fillRect(1, -15, 9, 22);
      g.fillStyle = p.color; g.fillRect(-13, -54, 26, 39);
      g.fillStyle = p.skin; g.beginPath(); g.ellipse(0, -62, 12, 13, 0, 0, Math.PI*2); g.fill();
      if (f.style === 'Grappler') {
        g.fillStyle = p.color; g.fillRect(-20, -54, 8, 10); g.fillRect(12, -54, 8, 10);
      }
      const armX = p.punchFrame > 0 ? 24 : (p.chargeAnim > 0 ? 28 : 15);
      g.fillStyle = p.skin; g.fillRect(armX - 8, -52, 8, 9);
      g.restore();
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 17px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, 26);
      g.textAlign = 'center'; g.fillText(`STAGE ${wave}`, W/2, 26);
      g.fillStyle = '#333'; g.fillRect(10, 35, 110, 10);
      g.fillStyle = p.hp > 2 ? '#44ff44' : '#ff4444';
      g.fillRect(10, 35, 110*(p.hp/p.maxHp), 10);
      if (comboCount > 1) {
        g.fillStyle = '#ffff00'; g.font = `bold ${18+comboCount*2}px monospace`; g.textAlign = 'center';
        g.fillText(`${comboCount}x COMBO!`, W/2, H*0.42);
      }
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.font = '10px monospace'; g.textAlign = 'center';
      g.fillText('L:PUNCH  R:KICK  HOLD=CHARGE  2-FINGER=JUMP ATK', W/2, H-SB-22);
    }

    function drawSelect() {
      g.fillStyle = '#1a0a05'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff4400'; g.font = 'bold 26px monospace'; g.textAlign = 'center';
      g.fillText('FINAL FIGHT', W/2, H*0.1);
      g.fillStyle = '#aaa'; g.font = '12px monospace';
      g.fillText('CHOOSE YOUR FIGHTER', W/2, H*0.2);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.26);
      FIGHTERS.forEach((f, i) => {
        const x = W*(0.2 + i*0.3);
        const y = H*0.55;
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.beginPath(); g.roundRect(x-52, y-80, 104, 115, 8); g.fill();
        g.fillStyle = f.color; g.fillRect(x-13, y-58, 26, 38);
        g.fillStyle = f.skin; g.beginPath(); g.ellipse(x, y-66, 12, 13, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = f.color; g.font = 'bold 12px monospace'; g.textAlign = 'center';
        g.fillText(f.name, x, y+18);
        g.fillStyle = '#aaa'; g.font = '10px monospace';
        g.fillText(f.style, x, y+32);
      });
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff4400'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
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
