window.plethoraBit = {
  meta: {
    title: 'Golden Axe',
    author: 'plethora',
    description: 'Fantasy brawler — defeat Death Adder!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;
    const FLOOR = H - SB - 85;

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
    function swordSwing() { beep(600, 0.05, 'sawtooth', 0.3); setTimeout(() => beep(300, 0.08, 'sawtooth', 0.4), 50); }
    function hitSnd() { beep(100, 0.1, 'square', 0.5); }
    function magicSnd() { [200,400,600,800,1000].forEach((f,i) => setTimeout(() => beep(f, 0.15, 'sine', 0.4), i*60)); }
    function deathSnd() { [200,150,100,60].forEach((f,i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.5), i*120)); }
    function scoreSnd() { beep(880, 0.08, 'sine', 0.3); setTimeout(() => beep(1100, 0.08, 'sine', 0.3), 80); }

    const HEROES = [
      { name: 'Ax Battler', color: '#cc6633', magic: 'Earth Quake', magicColor: '#8b4513', weapon: 'Broad Sword' },
      { name: 'Tyris Flare', color: '#cc4488', magic: 'Dragon Fire', magicColor: '#ff4400', weapon: 'Long Sword' },
      { name: 'Gilius', color: '#448844', magic: 'Thunder', magicColor: '#ffdd00', weapon: 'Battle Axe' },
    ];

    const HS_KEY = 'hs_goldenaxe';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'select';
    let chosen = 0;
    let started = false;
    let swipeStartX, swipeStartY, swipeT;

    let p, enemies, score, wave, potions, bossActive, bgScroll;

    function resetGame() {
      const h = HEROES[chosen];
      p = { x: W * 0.22, y: FLOOR, hp: 5, maxHp: 5, magic: 3, maxMagic: 3,
        invincible: 0, attackTimer: 0, jumpVy: 0, onGround: true,
        dir: 1, swingAnim: 0, color: h.color, magicColor: h.magicColor,
        mount: null, mountTimer: 0 };
      enemies = []; potions = [];
      score = 0; wave = 1; bossActive = false; bgScroll = 0;
      spawnWave();
    }

    function spawnWave() {
      const count = Math.min(2 + wave, 5);
      bossActive = (wave % 4 === 0);
      if (bossActive) {
        enemies.push(createEnemy(true));
      } else {
        for (let i = 0; i < count; i++) {
          ctx.timeout(() => {
            if (state === 'playing') enemies.push(createEnemy(false));
          }, i * 700);
        }
      }
    }

    function createEnemy(isBoss) {
      return {
        x: W + 50, y: FLOOR, hp: isBoss ? 10 : 2, maxHp: isBoss ? 10 : 2,
        vx: isBoss ? -0.8 : -1.2, dir: -1,
        attackTimer: isBoss ? 1000 : 1600, hitFlash: 0,
        isBoss, width: isBoss ? 55 : 32, height: isBoss ? 75 : 52,
        color: isBoss ? '#220066' : `hsl(${30+Math.random()*40},50%,35%)`,
        hasPotion: Math.random() > 0.6,
      };
    }

    function doAttack() {
      p.swingAnim = 20; p.attackTimer = 16;
      swordSwing();
      enemies.forEach(e => {
        const dx = e.x - p.x;
        if (Math.sign(dx) === p.dir && Math.abs(dx) < 95 && Math.abs(e.y - p.y) < 45) {
          e.hp -= 1; e.hitFlash = 10; e.vx = p.dir * 5;
          hitSnd(); score += 10; ctx.platform.setScore(score);
          if (e.hp <= 0 && e.hasPotion) {
            potions.push({ x: e.x, y: e.y });
          }
          if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
          scoreSnd();
        }
      });
      enemies = enemies.filter(e => e.hp > 0);
      if (enemies.length === 0 && state === 'playing') {
        score += wave * 50;
        wave++;
        ctx.timeout(() => { if (state === 'playing') spawnWave(); }, 1500);
      }
    }

    function doMagic() {
      if (p.magic <= 0) { beep(100, 0.1, 'square', 0.2); return; }
      p.magic--;
      magicSnd();
      ctx.platform.haptic('heavy');
      enemies.forEach(e => {
        e.hp -= p.magic === 0 ? 4 : 2;
        e.hitFlash = 20; e.vx = (e.x > p.x ? 1 : -1) * 8;
      });
      enemies = enemies.filter(e => e.hp > 0);
      if (enemies.length === 0 && state === 'playing') {
        score += wave * 50; wave++;
        ctx.timeout(() => { if (state === 'playing') spawnWave(); }, 1500);
      }
    }

    function doJump() {
      if (!p.onGround) return;
      p.onGround = false; p.jumpVy = -13;
      beep(400, 0.06, 'sine', 0.2);
      // jump attack
      doAttack();
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      swipeStartX = tx; swipeStartY = ty; swipeT = Date.now();
      if (state === 'select') {
        chosen = Math.min(2, Math.floor(tx / (W / 3)));
        state = 'playing'; resetGame();
        if (!started) { started = true; ctx.platform.start(); }
        return;
      }
      if (state === 'gameover') { state = 'select'; return; }
      if (!started) { started = true; ctx.platform.start(); }
      // magic: bottom area
      if (ty > H - SB - 80) { doMagic(); return; }
      p.dir = tx > p.x ? 1 : -1;
      doAttack();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStartX, dy = ty - swipeStartY;
      const elapsed = Date.now() - swipeT;
      if (elapsed < 300 && dy < -55 && Math.abs(dy) > Math.abs(dx) * 1.2) doJump();
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'select') { drawSelect(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      bgScroll += 0.7 * s;
      if (p.attackTimer > 0) p.attackTimer -= dt;
      if (p.swingAnim > 0) p.swingAnim--;
      if (p.invincible > 0) p.invincible--;
      if (!p.onGround) {
        p.jumpVy += 0.65 * s;
        p.y += p.jumpVy * s;
        if (p.y >= FLOOR) { p.y = FLOOR; p.onGround = true; p.jumpVy = 0; }
      }
      // move toward nearest enemy
      if (enemies.length > 0) {
        const near = enemies.reduce((a, b) => Math.abs(b.x - p.x) < Math.abs(a.x - p.x) ? b : a);
        if (near.x > p.x + 25) p.x += 1.2 * s;
        else if (near.x < p.x - 25) p.x -= 0.8 * s;
      } else { p.x += 1 * s; }
      p.x = Math.max(25, Math.min(W - 25, p.x));

      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        if (Math.abs(e.vx) > 0.3) e.vx *= 0.86; else e.vx = 0;
        e.x += e.vx * s;
        if (e.vx === 0) {
          const dx = p.x - e.x;
          if (Math.abs(dx) > 60) e.x += Math.sign(dx) * (e.isBoss ? 0.7 : 1.0) * s;
          e.dir = dx > 0 ? 1 : -1;
        }
        e.attackTimer -= dt;
        if (e.attackTimer <= 0 && Math.abs(e.x - p.x) < 65 && p.invincible <= 0) {
          e.attackTimer = e.isBoss ? 900 : 1600;
          p.hp--; p.invincible = 45; hitSnd();
          if (p.hp <= 0) { deathSnd(); state = 'gameover'; }
        }
      });

      potions.forEach(pot => {
        const dx = Math.abs(pot.x - p.x), dy2 = Math.abs(pot.y - p.y);
        if (dx < 30 && dy2 < 30 && p.magic < p.maxMagic) {
          p.magic = Math.min(p.maxMagic, p.magic + 1);
          scoreSnd(); pot.collected = true;
        }
      });
      potions = potions.filter(pot => !pot.collected);

      drawBG();
      drawPotions();
      drawEnemies();
      drawPlayerSprite();
      drawHUD();
    });

    function drawBG() {
      const sky = g.createLinearGradient(0, 0, 0, FLOOR);
      sky.addColorStop(0, '#0d0022'); sky.addColorStop(1, '#3d1a50');
      g.fillStyle = sky; g.fillRect(0, 0, W, FLOOR + 55);
      // mountains
      [[0, 0.5], [0.2, 0.4], [0.45, 0.55], [0.65, 0.42], [0.85, 0.5]].forEach(([mx, mh], i) => {
        const x = ((mx * W - bgScroll * 0.2) % (W + 100) + W + 100) % (W + 100);
        g.fillStyle = `hsl(270,30%,${20 + i % 2 * 8}%)`;
        g.beginPath(); g.moveTo(x - 70, FLOOR); g.lineTo(x, FLOOR - mh * FLOOR * 0.55); g.lineTo(x + 70, FLOOR); g.fill();
      });
      // ground
      g.fillStyle = '#3a2a1a';
      g.fillRect(0, FLOOR + 55, W, H);
      g.fillStyle = '#5a3a1a';
      g.fillRect(0, FLOOR + 55, W, 4);
      // torches
      for (let tx2 = (-bgScroll * 0.6 % 200 + 200) % 200; tx2 < W; tx2 += 200) {
        g.fillStyle = '#884400';
        g.fillRect(tx2 - 3, FLOOR, 6, 25);
        g.fillStyle = `rgba(255,140,0,${0.6 + Math.sin(Date.now() / 100 + tx2) * 0.3})`;
        g.beginPath(); g.ellipse(tx2, FLOOR - 4, 8, 12, 0, 0, Math.PI * 2); g.fill();
      }
    }

    function drawPotions() {
      potions.forEach(pot => {
        g.fillStyle = '#aa44ff'; g.beginPath(); g.ellipse(pot.x, pot.y - 10, 8, 12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#cc88ff'; g.beginPath(); g.ellipse(pot.x, pot.y - 16, 4, 5, 0, 0, Math.PI * 2); g.fill();
      });
    }

    function drawEnemies() {
      enemies.forEach(e => {
        g.save(); g.translate(e.x, e.y); g.scale(e.dir, 1);
        if (e.hitFlash > 0) g.globalAlpha = 0.5;
        g.fillStyle = e.color;
        g.fillRect(-e.width/2, -e.height, e.width, e.height * 0.65);
        g.fillStyle = '#c8a888';
        g.beginPath(); g.ellipse(0, -e.height - 12, e.isBoss ? 22 : 13, e.isBoss ? 22 : 13, 0, 0, Math.PI * 2); g.fill();
        if (e.isBoss) {
          g.fillStyle = '#440088';
          g.fillRect(-e.width/2 - 5, -e.height, e.width + 10, e.height * 0.35);
          g.fillStyle = '#ffdd00'; g.font = 'bold 11px monospace'; g.textAlign = 'center';
          g.fillText('DEATH ADDER', 0, -e.height - 30);
        }
        // hp
        g.fillStyle = '#600'; g.fillRect(-18, -e.height - 22, 36, 4);
        g.fillStyle = '#f44'; g.fillRect(-18, -e.height - 22, 36 * (e.hp / e.maxHp), 4);
        g.restore();
      });
    }

    function drawPlayerSprite() {
      if (p.invincible > 0 && Math.floor(p.invincible / 4) % 2 === 0) return;
      const h = HEROES[chosen];
      g.save(); g.translate(p.x, p.y); g.scale(p.dir, 1);
      // legs
      g.fillStyle = '#888'; g.fillRect(-9, -15, 8, 22); g.fillRect(1, -15, 8, 22);
      // body + armor
      g.fillStyle = p.color;
      g.fillRect(-12, -52, 24, 37);
      g.fillStyle = '#aaa';
      g.fillRect(-14, -52, 28, 10);
      // head
      g.fillStyle = '#c8a888';
      g.beginPath(); g.ellipse(0, -60, 11, 12, 0, 0, Math.PI * 2); g.fill();
      // helmet
      g.fillStyle = '#888';
      g.beginPath(); g.ellipse(0, -67, 11, 8, 0, 0, Math.PI, true); g.fill();
      // weapon arm
      const weaponX = p.swingAnim > 0 ? 28 : 18;
      g.fillStyle = p.magicColor;
      g.fillRect(weaponX - 5, -58, 5, 26);
      g.restore();
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 17px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W - 10, 26);
      g.textAlign = 'center'; g.fillText(`WAVE ${wave}`, W/2, 26);
      // hp
      g.fillStyle = '#333'; g.fillRect(10, 35, 100, 10);
      g.fillStyle = p.hp > 2 ? '#44ff44' : '#ff4444';
      g.fillRect(10, 35, 100 * (p.hp / p.maxHp), 10);
      // magic potions
      for (let i = 0; i < p.maxMagic; i++) {
        g.fillStyle = i < p.magic ? '#aa44ff' : '#333';
        g.beginPath(); g.ellipse(120 + i * 22, 40, 7, 10, 0, 0, Math.PI * 2); g.fill();
      }
      // controls hint
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '10px monospace'; g.textAlign = 'center';
      g.fillText('TAP=ATTACK  SWIPE UP=JUMP  TAP BOTTOM=MAGIC', W/2, H - SB - 20);
    }

    function drawSelect() {
      g.fillStyle = '#0d0022'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffdd00'; g.font = 'bold 26px monospace'; g.textAlign = 'center';
      g.fillText('GOLDEN AXE', W/2, H * 0.1);
      g.fillStyle = '#aaa'; g.font = '12px monospace';
      g.fillText('CHOOSE YOUR WARRIOR', W/2, H * 0.2);
      g.fillStyle = '#fff'; g.font = '12px monospace';
      g.fillText(`HI-SCORE: ${hs}`, W/2, H * 0.26);
      HEROES.forEach((h, i) => {
        const x = W * (0.2 + i * 0.3);
        const y = H * 0.55;
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.beginPath(); g.roundRect(x - 50, y - 80, 100, 120, 8); g.fill();
        g.fillStyle = h.color;
        g.fillRect(x - 14, y - 55, 28, 38);
        g.fillStyle = '#c8a888';
        g.beginPath(); g.ellipse(x, y - 62, 12, 13, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#888'; g.fillRect(x - 15, y - 65, 30, 8);
        g.fillStyle = h.color; g.font = 'bold 12px monospace'; g.textAlign = 'center';
        g.fillText(h.name, x, y + 20);
        g.fillStyle = '#aaa'; g.font = '10px monospace';
        g.fillText(h.magic, x, y + 34);
      });
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffdd00'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
      g.fillText('GAME OVER', W/2, H * 0.38);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H * 0.5);
      g.fillText(`HI: ${hs}`, W/2, H * 0.59);
      g.fillStyle = '#ffdd00'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H * 0.72);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
