window.plethoraBit = {
  meta: {
    title: 'Double Dragon',
    author: 'plethora',
    description: 'Beat-em-up street brawler!',
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

    const HS_KEY = 'hs_doubledragon';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'title';
    let started = false;
    let swipeStartX, swipeStartY, swipeT;

    let p, enemies, score, bgScroll, spawnTimer, wave, items;

    function resetGame() {
      p = { x: W * 0.2, y: FLOOR, hp: 6, maxHp: 6, vx: 0, vy: 0,
        onGround: true, attackTimer: 0, kickTimer: 0, jumpTimer: 0,
        grabTarget: null, grabTimer: 0, invincible: 0,
        punchFrame: 0, kickFrame: 0, jumpVy: 0, dir: 1,
        combo: 0, comboTimer: 0 };
      enemies = [];
      items = [];
      score = 0;
      bgScroll = 0;
      spawnTimer = 120;
      wave = 1;
    }

    function spawnEnemy() {
      const types = ['thug','bigGuy','knifeThrower'];
      const t = wave > 3 ? types[Math.floor(Math.random() * types.length)] : types[Math.floor(Math.random() * 2)];
      enemies.push({
        x: W + 40, y: FLOOR,
        hp: t === 'bigGuy' ? 5 : 3, maxHp: t === 'bigGuy' ? 5 : 3,
        vx: -(0.6 + wave * 0.08),
        type: t, dir: -1, attackTimer: 0,
        hitFlash: 0, throwTimer: 0,
        color: { thug: '#884422', bigGuy: '#553311', knifeThrower: '#226688' }[t],
      });
    }

    function spawnItem() {
      if (Math.random() > 0.3) return;
      items.push({ x: W + 20, y: FLOOR, type: Math.random() > 0.5 ? 'barrel' : 'bat', vx: 0 });
    }

    function punch() {
      p.attackTimer = 18; p.punchFrame = 15; p.dir = p.vx >= 0 ? 1 : -1;
      beep(200, 0.08, 'sawtooth', 0.4);
      enemies.forEach(e => {
        const dx = e.x - p.x;
        if (Math.sign(dx) === p.dir && Math.abs(dx) < 85 && Math.abs(e.y - p.y) < 40) {
          e.hp--; e.hitFlash = 10; e.vx = p.dir * 4;
          beep(90, 0.12, 'square', 0.5);
          p.combo++; p.comboTimer = 80;
          score += 10 * p.combo;
          if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
          ctx.platform.setScore(score);
          ctx.platform.haptic('light');
        }
      });
    }

    function kick(dir) {
      p.kickTimer = 22; p.kickFrame = 18; p.dir = dir;
      beep(150, 0.1, 'sawtooth', 0.4);
      enemies.forEach(e => {
        const dx = e.x - p.x;
        if (Math.sign(dx) === dir && Math.abs(dx) < 100 && Math.abs(e.y - p.y) < 40) {
          e.hp -= 2; e.hitFlash = 12; e.vx = dir * 6;
          beep(70, 0.15, 'square', 0.5);
          score += 25;
          ctx.platform.setScore(score);
          ctx.platform.haptic('medium');
        }
      });
    }

    function jump() {
      if (!p.onGround) return;
      p.onGround = false; p.jumpVy = -14;
      beep(300, 0.08, 'sine', 0.2);
    }

    function tryGrab() {
      if (p.grabTarget) return;
      const near = enemies.find(e => Math.abs(e.x - p.x) < 50 && Math.abs(e.y - p.y) < 30);
      if (near) {
        p.grabTarget = near; p.grabTimer = 90;
        beep(250, 0.1, 'square', 0.3);
      }
    }

    function throwGrab() {
      if (!p.grabTarget) return;
      p.grabTarget.vx = p.dir * 12; p.grabTarget.vy = -6;
      p.grabTarget.hp--; p.grabTarget.hitFlash = 15;
      p.grabTarget = null; p.grabTimer = 0;
      score += 30; ctx.platform.setScore(score);
      beep(120, 0.2, 'sawtooth', 0.5);
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
      if (state !== 'playing') return;
      if (!started) { started = true; ctx.platform.start(); }
      if (p.grabTarget) { throwGrab(); return; }
      if (tx < W / 2) { punch(); tryGrab(); }
      else { kick(1); }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStartX, dy = ty - swipeStartY;
      const dt2 = Date.now() - swipeT;
      if (dt2 < 300 && dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.2) jump();
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'title') { drawTitle(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      bgScroll += 0.8 * s;
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = Math.max(60, 200 - wave * 10);
        spawnEnemy(); spawnItem();
      }
      if (enemies.length > 5) spawnTimer = 300;

      // update player
      p.vy = p.jumpVy;
      if (!p.onGround) {
        p.jumpVy += 0.7 * s;
        p.y += p.jumpVy * s;
        if (p.y >= FLOOR) { p.y = FLOOR; p.onGround = true; p.jumpVy = 0; }
      }
      if (p.attackTimer > 0) p.attackTimer -= dt;
      if (p.kickTimer > 0) p.kickTimer -= dt;
      if (p.punchFrame > 0) p.punchFrame--;
      if (p.kickFrame > 0) p.kickFrame--;
      if (p.invincible > 0) p.invincible--;
      if (p.comboTimer > 0) p.comboTimer--; else p.combo = 0;
      if (p.grabTimer > 0) {
        p.grabTimer -= dt;
        if (p.grabTimer <= 0) { p.grabTarget = null; }
        if (p.grabTarget) { p.grabTarget.x = p.x + p.dir * 45; p.grabTarget.y = p.y; }
      }

      // move player
      const halfW = W / 2;
      if (enemies.length > 0) {
        const nearest = enemies.reduce((a, b) => Math.abs(b.x - p.x) < Math.abs(a.x - p.x) ? b : a);
        if (nearest.x > p.x + 20) { p.x += 1.5 * s; p.dir = 1; }
        else if (nearest.x < p.x - 20) { p.x -= 1.0 * s; p.dir = -1; }
      } else { p.x += 1.2 * s; }
      p.x = Math.max(30, Math.min(W - 30, p.x));

      // update enemies
      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        if (e.type === 'knifeThrower') {
          e.throwTimer -= dt;
          if (e.throwTimer <= 0 && Math.abs(e.x - p.x) < 250) {
            e.throwTimer = 2000;
            // knife projectile
            items.push({ x: e.x, y: e.y - 20, vx: (p.x - e.x) > 0 ? 4 : -4, type: 'knife', hurt: true });
          }
        }
        if (Math.abs(e.vx) > 0.3) e.vx *= 0.85;
        else {
          const dx = p.x - e.x;
          if (Math.abs(dx) > 55) e.x += Math.sign(dx) * (e.type === 'bigGuy' ? 0.8 : 1.1) * s;
          e.dir = dx > 0 ? 1 : -1;
        }
        e.x += e.vx * s;
        e.attackTimer -= dt;
        if (e.attackTimer <= 0 && Math.abs(e.x - p.x) < 60 && p.invincible <= 0 && !p.grabTarget) {
          e.attackTimer = e.type === 'bigGuy' ? 1000 : 1500;
          p.hp--; p.invincible = 50;
          beep(80, 0.15, 'square', 0.5);
          if (p.hp <= 0) {
            beep(60, 0.8, 'sawtooth', 0.6);
            if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
            state = 'gameover';
          }
        }
      });
      enemies = enemies.filter(e => e.hp > 0 && e.x > -100);

      // items
      items.forEach(item => { item.x -= (item.vx || 1.5) * s; });
      if (items.some(i => i.hurt && Math.abs(i.x - p.x) < 20 && Math.abs(i.y - p.y) < 30 && p.invincible <= 0)) {
        p.hp--; p.invincible = 40;
        beep(80, 0.1, 'square', 0.4);
        if (p.hp <= 0) { state = 'gameover'; }
      }
      items = items.filter(i => i.x > -50 && i.x < W + 50);

      if (score > wave * 500) wave++;

      drawBG();
      drawItems();
      drawEnemies();
      drawPlayerSprite();
      drawHUD();
    });

    function drawBG() {
      // sky
      const sky = g.createLinearGradient(0, 0, 0, FLOOR);
      sky.addColorStop(0, '#0a0015'); sky.addColorStop(1, '#1a0030');
      g.fillStyle = sky; g.fillRect(0, 0, W, FLOOR);
      // neon signs scroll
      const signs = ['DANGER','CHAOS','FIGHT','WARRIOR','BRAWL'];
      g.font = 'bold 14px monospace';
      signs.forEach((s2, i) => {
        const x = ((i * 200 - bgScroll * 0.5) % (W + 200) + W + 200) % (W + 200) - 100;
        g.fillStyle = `hsl(${i * 60},100%,60%)`;
        g.globalAlpha = 0.4;
        g.fillText(s2, x, H * 0.15 + (i % 2) * 30);
      });
      g.globalAlpha = 1;
      // buildings
      [[0, 0.4], [0.15, 0.3], [0.35, 0.35], [0.55, 0.28], [0.75, 0.32], [0.9, 0.38]].forEach(([bx, bh], i) => {
        const scrolled = ((bx * W - bgScroll * 0.3) % (W * 1.2) + W * 1.2) % (W * 1.2);
        g.fillStyle = `hsl(${250 + i * 10},20%,${15 + i % 2 * 5}%)`;
        g.fillRect(scrolled - 10, FLOOR - bh * FLOOR, 90, bh * FLOOR);
      });
      // ground
      g.fillStyle = '#2a1a0a';
      g.fillRect(0, FLOOR + 55, W, H);
      g.fillStyle = '#ff6600';
      g.globalAlpha = 0.3;
      for (let x = (-bgScroll * 0.8) % 60; x < W; x += 60) {
        g.fillRect(x, FLOOR + 56, 40, 3);
      }
      g.globalAlpha = 1;
    }

    function drawItems() {
      items.forEach(item => {
        g.fillStyle = item.type === 'barrel' ? '#8b5e3c' : item.type === 'bat' ? '#c8a850' : '#aaa';
        if (item.type === 'knife') {
          g.save(); g.translate(item.x, item.y);
          g.fillStyle = '#aaa'; g.fillRect(-12, -3, 24, 6);
          g.restore();
        } else if (item.type === 'barrel') {
          g.fillRect(item.x - 15, item.y - 30, 30, 30);
        } else if (item.type === 'bat') {
          g.save(); g.translate(item.x, item.y - 10);
          g.fillStyle = '#c8a850'; g.fillRect(-3, -20, 6, 25);
          g.restore();
        }
      });
    }

    function drawPlayerSprite() {
      if (p.invincible > 0 && Math.floor(p.invincible / 4) % 2 === 0) return;
      g.save(); g.translate(p.x, p.y); g.scale(p.dir, 1);
      // body
      g.fillStyle = '#3388ff';
      g.fillRect(-10, -50, 20, 35);
      // head
      g.fillStyle = '#c8a888';
      g.beginPath(); g.ellipse(0, -58, 11, 12, 0, 0, Math.PI * 2); g.fill();
      // bandana
      g.fillStyle = '#ff4400';
      g.fillRect(-12, -62, 24, 8);
      // punch arm
      const armX = p.punchFrame > 0 ? 22 : 14;
      g.fillStyle = '#c8a888';
      g.fillRect(armX - 8, -50, 8, 8);
      g.fillRect(-14, -50, 8, 8);
      // kick leg
      if (p.kickFrame > 0) {
        g.fillStyle = '#224488';
        g.save(); g.rotate(0.5); g.fillRect(0, -15, 8, 30); g.restore();
      } else {
        g.fillStyle = '#224488';
        g.fillRect(-10, -15, 9, 28); g.fillRect(1, -15, 9, 28);
      }
      if (!p.onGround) {
        g.fillStyle = '#224488';
        g.save(); g.rotate(-0.3); g.fillRect(-5, -15, 10, 25); g.restore();
      }
      g.restore();
    }

    function drawEnemies() {
      enemies.forEach(e => {
        g.save(); g.translate(e.x, e.y); g.scale(e.dir, 1);
        if (e.hitFlash > 0) g.globalAlpha = 0.5;
        const w = e.type === 'bigGuy' ? 24 : 18;
        const h = e.type === 'bigGuy' ? 60 : 50;
        g.fillStyle = e.color;
        g.fillRect(-w/2, -h, w, h);
        g.fillStyle = '#c8a888';
        g.beginPath(); g.ellipse(0, -h - 12, w/2 + 2, 12, 0, 0, Math.PI * 2); g.fill();
        if (e.type === 'knifeThrower') {
          g.fillStyle = '#aaa';
          g.fillRect(12, -h + 10, 20, 4);
        }
        g.fillStyle = '#600';
        g.fillRect(-18, -h - 22, 36, 4);
        g.fillStyle = '#f44';
        g.fillRect(-18, -h - 22, 36 * (e.hp / e.maxHp), 4);
        g.restore();
      });
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 17px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right';
      g.fillText(`HI: ${hs}`, W - 10, 26);
      g.textAlign = 'center';
      g.fillText(`LV ${wave}`, W/2, 26);
      g.fillStyle = '#333'; g.fillRect(10, 36, 100, 10);
      g.fillStyle = p.hp > 2 ? '#44ff44' : '#ff4444';
      g.fillRect(10, 36, 100 * (p.hp / p.maxHp), 10);
      if (p.combo > 1 && p.comboTimer > 0) {
        g.globalAlpha = p.comboTimer / 80;
        g.fillStyle = '#ffff00'; g.font = `bold ${20 + p.combo * 2}px monospace`; g.textAlign = 'center';
        g.fillText(`${p.combo}x COMBO!`, W/2, H * 0.42);
        g.globalAlpha = 1;
      }
      g.fillStyle = '#fff'; g.font = '10px monospace'; g.textAlign = 'left';
      g.fillText('L:PUNCH  R:KICK  SWIPE UP:JUMP', 10, H - SB - 25);
    }

    function drawTitle() {
      g.fillStyle = '#0a0015'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff4400'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
      g.fillText('DOUBLE', W/2, H * 0.28);
      g.fillText('DRAGON', W/2, H * 0.38);
      g.fillStyle = '#ffaa00'; g.font = '16px monospace';
      g.fillText('Street Brawler', W/2, H * 0.5);
      g.fillStyle = '#aaa'; g.font = '13px monospace';
      g.fillText(`HI-SCORE: ${hs}`, W/2, H * 0.62);
      g.fillStyle = '#fff'; g.font = '15px monospace';
      g.fillText('TAP TO START', W/2, H * 0.75);
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff4400'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
      g.fillText('GAME OVER', W/2, H * 0.38);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H * 0.5);
      g.fillText(`HI: ${hs}`, W/2, H * 0.59);
      g.fillStyle = '#ffaa00'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H * 0.72);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
