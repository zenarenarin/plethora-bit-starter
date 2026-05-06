window.plethoraBit = {
  meta: {
    title: 'Gauntlet',
    author: 'plethora',
    description: 'Dungeon crawl — destroy generators!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;

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
    function attackSnd() { beep(300, 0.06, 'sawtooth', 0.3); }
    function hitSnd() { beep(80, 0.1, 'square', 0.5); }
    function magicSnd() { [300,500,700,900].forEach((f,i) => setTimeout(() => beep(f,0.12,'sine',0.35),i*55)); }
    function eatSnd() { beep(600,0.1,'sine',0.3); }
    function genDestroySnd() { [400,300,200,100].forEach((f,i) => setTimeout(() => beep(f,0.15,'sawtooth',0.5),i*80)); }
    function deathSnd() { [200,150,100].forEach((f,i) => setTimeout(() => beep(f,0.25,'sawtooth',0.6),i*150)); }

    const CLASSES = [
      { name: 'Warrior',  color: '#4488cc', speed: 2.0, atkRange: 40, atkDmg: 2, magicPow: 1, symbol: 'W' },
      { name: 'Valkyrie', color: '#cc8844', speed: 1.8, atkRange: 35, atkDmg: 2, magicPow: 1, symbol: 'V' },
      { name: 'Wizard',   color: '#cc44cc', speed: 1.5, atkRange: 90, atkDmg: 3, magicPow: 3, symbol: 'M' },
      { name: 'Elf',      color: '#44cc88', speed: 2.5, atkRange: 75, atkDmg: 1, magicPow: 2, symbol: 'E' },
    ];

    const TILE = 40;
    const COLS = Math.floor(W / TILE);
    const ROWS = Math.floor((H - SB - 60) / TILE);

    const HS_KEY = 'hs_gauntlet';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'select';
    let chosen = 0;
    let started = false;
    let dragX = 0, dragY = 0, dragging = false;

    let p, enemies, projectiles, generators, foods, score, level, hpDecayT;

    function resetGame() {
      const cl = CLASSES[chosen];
      p = { x: TILE * 2 + TILE / 2, y: TILE * 2 + TILE / 2, hp: 800, maxHp: 800,
        speed: cl.speed, atkRange: cl.atkRange, atkDmg: cl.atkDmg, magicPow: cl.magicPow,
        magic: 3, maxMagic: 3, attackTimer: 0, magicTimer: 0,
        color: cl.color, invincible: 0, dir: { x: 1, y: 0 } };
      enemies = []; projectiles = []; generators = []; foods = [];
      score = 0; level = 1; hpDecayT = 0;
      buildLevel();
    }

    function buildLevel() {
      generators = [];
      foods = [];
      const genCount = 2 + Math.min(level, 4);
      for (let i = 0; i < genCount; i++) {
        let gx, gy;
        do {
          gx = (Math.floor(Math.random() * (COLS - 4)) + 2) * TILE + TILE / 2;
          gy = (Math.floor(Math.random() * (ROWS - 4)) + 2) * TILE + TILE / 2;
        } while (Math.hypot(gx - p.x, gy - p.y) < TILE * 4);
        generators.push({ x: gx, y: gy, hp: 5, maxHp: 5, spawnT: 80, hitFlash: 0 });
      }
      for (let i = 0; i < 4; i++) {
        foods.push({ x: (Math.floor(Math.random() * (COLS - 2)) + 1) * TILE + TILE / 2,
          y: (Math.floor(Math.random() * (ROWS - 2)) + 1) * TILE + TILE / 2, hp: 100 });
      }
    }

    function doMagic() {
      if (p.magic <= 0 || p.magicTimer > 0) return;
      p.magic--; p.magicTimer = 200;
      magicSnd(); ctx.platform.haptic('heavy');
      enemies.forEach(e => {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist < 120) { e.hp -= p.magicPow * 2; e.hitFlash = 15; }
      });
      enemies = enemies.filter(e => e.hp > 0);
      // AOE visual
      projectiles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 25, aoe: true, r: 10 });
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      if (state === 'select') {
        chosen = Math.min(3, Math.floor(tx / (W / 2)) + Math.floor((ty - H * 0.3) / ((H * 0.45) / 2)) * 2);
        state = 'playing'; resetGame();
        if (!started) { started = true; ctx.platform.start(); }
        return;
      }
      if (state === 'gameover') { state = 'select'; return; }
      if (!started) { started = true; ctx.platform.start(); }
      dragging = true; dragX = tx; dragY = ty;
      // magic: bottom area
      if (ty > H - SB - 90) { doMagic(); return; }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      dragX = e.changedTouches[0].clientX;
      dragY = e.changedTouches[0].clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      dragging = false;
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'select') { drawSelect(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      // move player via drag
      if (dragging) {
        const dx = dragX - p.x, dy = dragY - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 12) {
          p.x += (dx / dist) * p.speed * s;
          p.y += (dy / dist) * p.speed * s;
          p.dir = { x: dx / dist, y: dy / dist };
        }
      }
      p.x = Math.max(TILE / 2, Math.min(W - TILE / 2, p.x));
      p.y = Math.max(TILE / 2, Math.min(H - SB - 90 - TILE / 2, p.y));

      if (p.attackTimer > 0) p.attackTimer -= dt;
      if (p.magicTimer > 0) p.magicTimer -= dt;
      if (p.invincible > 0) p.invincible--;

      // hp drain
      hpDecayT += dt;
      if (hpDecayT >= 1200) { hpDecayT = 0; p.hp -= level; }

      // auto-attack nearest enemy
      if (p.attackTimer <= 0) {
        const target = enemies.reduce((best, e) => {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          return (!best || d < Math.hypot(best.x - p.x, best.y - p.y)) ? e : best;
        }, null);
        if (target) {
          const dist = Math.hypot(target.x - p.x, target.y - p.y);
          if (dist < p.atkRange) {
            p.attackTimer = 400;
            attackSnd();
            if (chosen === 2 || chosen === 3) {
              // ranged
              const dx = target.x - p.x, dy = target.y - p.y, len = Math.hypot(dx, dy);
              projectiles.push({ x: p.x, y: p.y, vx: dx/len*5, vy: dy/len*5, life: 40, aoe: false, r: 6, dmg: p.atkDmg });
            } else {
              target.hp -= p.atkDmg; target.hitFlash = 8; hitSnd();
              score += 10; ctx.platform.setScore(score);
              if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
            }
          }
        }
        // also attack generators in range
        generators.forEach(gen => {
          const dist = Math.hypot(gen.x - p.x, gen.y - p.y);
          if (dist < p.atkRange + 10 && p.attackTimer <= 0) {
            p.attackTimer = 400;
            gen.hp--; gen.hitFlash = 8; attackSnd();
            if (gen.hp <= 0) { score += 200; genDestroySnd(); ctx.platform.haptic('heavy'); ctx.platform.setScore(score); }
          }
        });
      }

      // generators spawn enemies
      generators.forEach(gen => {
        if (gen.hitFlash > 0) gen.hitFlash--;
        gen.spawnT -= dt;
        if (gen.spawnT <= 0 && enemies.length < 20) {
          gen.spawnT = Math.max(40, 120 - level * 8);
          const angle = Math.random() * Math.PI * 2;
          enemies.push({ x: gen.x + Math.cos(angle) * 24, y: gen.y + Math.sin(angle) * 24,
            hp: 1, maxHp: 1, vx: 0, vy: 0, hitFlash: 0, attackTimer: 0,
            type: ['ghost','grunt','skeleton'][Math.floor(Math.random() * 3)],
            color: ['#88aaff','#aa6622','#aaaaaa'][Math.floor(Math.random() * 3)] });
        }
      });
      generators = generators.filter(gen => gen.hp > 0);

      // update enemies
      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        const dx = p.x - e.x, dy = p.y - e.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 18) { e.x += dx / dist * (0.9 + level * 0.05) * s; e.y += dy / dist * (0.9 + level * 0.05) * s; }
        e.attackTimer -= dt;
        if (e.attackTimer <= 0 && dist < 22 && p.invincible <= 0) {
          e.attackTimer = 800; p.hp -= 8 + level; p.invincible = 20; hitSnd();
          if (p.hp <= 0) { deathSnd(); state = 'gameover'; }
        }
      });
      enemies = enemies.filter(e => e.hp > 0);

      // projectiles
      projectiles.forEach(proj => {
        if (proj.aoe) { proj.r += 4 * s; proj.life -= s; return; }
        proj.x += proj.vx * s; proj.y += proj.vy * s; proj.life -= s;
        enemies.forEach(e => {
          if (Math.hypot(proj.x - e.x, proj.y - e.y) < proj.r + 12) {
            e.hp -= proj.dmg || 1; e.hitFlash = 8; hitSnd(); proj.life = 0;
            score += 10; ctx.platform.setScore(score);
          }
        });
      });
      projectiles = projectiles.filter(pr => pr.life > 0);
      enemies = enemies.filter(e => e.hp > 0);

      // food
      foods.forEach(food => {
        if (Math.hypot(food.x - p.x, food.y - p.y) < 25) { p.hp = Math.min(p.maxHp, p.hp + food.hp); eatSnd(); food.eaten = true; }
      });
      foods = foods.filter(f => !f.eaten);

      // next level
      if (generators.length === 0 && enemies.length === 0) {
        score += 300; level++;
        foods.push({ x: p.x + 60, y: p.y, hp: 200 });
        buildLevel();
      }

      drawGame();
    });

    function drawGame() {
      // dungeon bg
      g.fillStyle = '#1a1008'; g.fillRect(0, 0, W, H);
      // grid
      g.strokeStyle = 'rgba(80,50,20,0.3)'; g.lineWidth = 1;
      for (let col = 0; col < COLS; col++) {
        g.beginPath(); g.moveTo(col * TILE, 0); g.lineTo(col * TILE, H); g.stroke();
      }
      for (let row = 0; row < ROWS; row++) {
        g.beginPath(); g.moveTo(0, row * TILE); g.lineTo(W, row * TILE); g.stroke();
      }
      // food
      foods.forEach(f => {
        g.fillStyle = '#ffcc44';
        g.beginPath(); g.arc(f.x, f.y, 10, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ff8800'; g.font = '14px monospace'; g.textAlign = 'center';
        g.fillText('🍖', f.x, f.y + 5);
      });
      // generators
      generators.forEach(gen => {
        if (gen.hitFlash > 0 && Math.floor(gen.hitFlash/2) % 2) { g.fillStyle = '#fff'; }
        else { g.fillStyle = '#cc2200'; }
        g.fillRect(gen.x - 16, gen.y - 16, 32, 32);
        g.fillStyle = '#ff6600';
        g.fillRect(gen.x - 10, gen.y - 10, 20, 20);
        g.fillStyle = '#fff'; g.font = 'bold 11px monospace'; g.textAlign = 'center';
        g.fillText('GEN', gen.x, gen.y + 4);
        g.fillStyle = '#500'; g.fillRect(gen.x - 14, gen.y - 22, 28, 5);
        g.fillStyle = '#f44'; g.fillRect(gen.x - 14, gen.y - 22, 28 * (gen.hp / gen.maxHp), 5);
      });
      // AOE magic
      projectiles.forEach(pr => {
        if (pr.aoe) {
          g.save(); g.globalAlpha = pr.life / 25 * 0.5;
          g.fillStyle = CLASSES[chosen].color;
          g.beginPath(); g.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); g.fill();
          g.restore();
        } else {
          g.fillStyle = '#ffdd00';
          g.beginPath(); g.arc(pr.x, pr.y, pr.r / 2, 0, Math.PI * 2); g.fill();
        }
      });
      // enemies
      enemies.forEach(e => {
        if (e.hitFlash > 0 && Math.floor(e.hitFlash / 2) % 2) return;
        g.save(); g.translate(e.x, e.y);
        g.fillStyle = e.color;
        if (e.type === 'ghost') {
          g.globalAlpha = 0.7;
          g.beginPath(); g.ellipse(0, -8, 11, 14, 0, 0, Math.PI * 2); g.fill();
          g.fillRect(-11, -8, 22, 10);
        } else if (e.type === 'skeleton') {
          g.fillRect(-7, -28, 14, 28);
          g.beginPath(); g.ellipse(0, -34, 8, 8, 0, 0, Math.PI * 2); g.fill();
        } else {
          g.fillRect(-8, -24, 16, 24);
          g.beginPath(); g.ellipse(0, -30, 9, 9, 0, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      });
      // player
      if (p.invincible === 0 || Math.floor(p.invincible / 4) % 2 === 0) {
        g.save(); g.translate(p.x, p.y);
        g.fillStyle = CLASSES[chosen].color;
        g.fillRect(-10, -30, 20, 30);
        g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -38, 11, 11, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = CLASSES[chosen].color;
        g.font = 'bold 12px monospace'; g.textAlign = 'center';
        g.fillText(CLASSES[chosen].symbol, 0, -34);
        g.restore();
      }
      // HUD
      g.fillStyle = '#1a1008'; g.fillRect(0, H - SB - 75, W, 75 + SB);
      g.fillStyle = '#fff'; g.font = 'bold 15px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, H - SB - 52);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, H - SB - 52);
      g.textAlign = 'center'; g.fillText(`FLOOR ${level}`, W/2, H - SB - 52);
      g.fillStyle = '#333'; g.fillRect(10, H - SB - 42, W - 20, 12);
      g.fillStyle = p.hp > 300 ? '#44ff44' : p.hp > 100 ? '#ffaa00' : '#ff4444';
      g.fillRect(10, H - SB - 42, (W - 20) * (p.hp / p.maxHp), 12);
      g.fillStyle = '#fff'; g.font = '9px monospace'; g.textAlign = 'left';
      g.fillText(`HP: ${p.hp}`, 12, H - SB - 32);
      for (let i = 0; i < p.maxMagic; i++) {
        g.fillStyle = i < p.magic ? '#cc44cc' : '#333';
        g.beginPath(); g.arc(W/2 + (i - 1) * 22, H - SB - 28, 8, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.font = '9px monospace'; g.textAlign = 'center';
      g.fillText('DRAG=MOVE  TAP BOTTOM=MAGIC', W/2, H - SB - 10);
    }

    function drawSelect() {
      g.fillStyle = '#1a1008'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffcc44'; g.font = 'bold 24px monospace'; g.textAlign = 'center';
      g.fillText('GAUNTLET', W/2, H * 0.1);
      g.fillStyle = '#aaa'; g.font = '12px monospace';
      g.fillText('CHOOSE YOUR CLASS', W/2, H * 0.2);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H * 0.27);
      CLASSES.forEach((cl, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const cx = W * (col === 0 ? 0.28 : 0.72);
        const cy = H * (0.4 + row * 0.25);
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.roundRect(cx-52, cy-55, 104, 90, 8); g.fill();
        g.fillStyle = cl.color; g.fillRect(cx-10, cy-30, 20, 30);
        g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(cx, cy-38, 11, 11, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = cl.color; g.font = 'bold 13px monospace'; g.textAlign = 'center';
        g.fillText(cl.name, cx, cy+18);
        g.fillStyle = '#aaa'; g.font = '10px monospace';
        g.fillText(`SPD:${cl.speed}  DMG:${cl.atkDmg}`, cx, cy+32);
      });
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffcc44'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('GAME OVER', W/2, H*0.38);
      g.fillStyle = '#ff4444'; g.font = '14px monospace';
      g.fillText(`${CLASSES[chosen].name} has fallen!`, W/2, H*0.47);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H*0.55);
      g.fillText(`HI: ${hs}`, W/2, H*0.63);
      g.fillStyle = '#ffcc44'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.76);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
