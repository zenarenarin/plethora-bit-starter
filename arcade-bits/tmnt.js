window.plethoraBit = {
  meta: {
    title: 'TMNT Brawler',
    author: 'plethora',
    description: 'Pick a turtle, smash Foot Clan!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;
    const FLOOR = H - SB - 80;

    let ac = null;
    function initAudio() { if (!ac) ac = new AudioContext(); }
    function beep(freq, dur, type = 'square', vol = 0.3) {
      if (!ac) return;
      const o = ac.createOscillator(), gn = ac.createGain();
      o.connect(gn); gn.connect(ac.destination);
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, ac.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.start(); o.stop(ac.currentTime + dur);
    }
    function punchSound() { beep(180, 0.08, 'sawtooth', 0.4); }
    function hitSound() { beep(80, 0.15, 'square', 0.5); }
    function deathSound() { beep(60, 0.5, 'sawtooth', 0.6); }
    function scoreChime() { beep(880, 0.1, 'sine', 0.3); setTimeout(() => beep(1100, 0.1, 'sine', 0.3), 100); }
    function gameOverTone() {
      [400,300,200,100].forEach((f,i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.4), i*150));
    }

    const TURTLES = [
      { name: 'Leonardo',  color: '#4488ff', belt: '#4444cc', weapon: 'Twin Katana',   special: 'Spin Slash' },
      { name: 'Donatello', color: '#8844cc', belt: '#662299', weapon: 'Bo Staff',      special: 'Pole Vault' },
      { name: 'Raphael',   color: '#ff4444', belt: '#cc2222', weapon: 'Sai',           special: 'Fury Mode'  },
      { name: 'Michelangelo', color: '#ff8800', belt: '#cc6600', weapon: 'Nunchaku', special: 'Party Time' },
    ];

    const HS_KEY = 'hs_tmnt';
    let hs = ctx.storage.get(HS_KEY) || 0;

    let state = 'select'; // select, playing, gameover
    let chosen = 0;
    let player, enemies, score, wave, bossActive, comboTimer, comboCount;
    let swipeStartX = 0, swipeStartY = 0;
    let started = false;

    function resetGame() {
      const t = TURTLES[chosen];
      player = { x: W * 0.25, y: FLOOR, hp: 5, maxHp: 5, vx: 0, vy: 0,
        onGround: true, attackTimer: 0, attackDir: 1, specialTimer: 0,
        color: t.color, belt: t.belt, name: t.name, invincible: 0,
        punchAnim: 0, walking: false };
      enemies = [];
      score = 0;
      wave = 1;
      bossActive = false;
      comboTimer = 0;
      comboCount = 0;
      spawnWave();
    }

    function spawnWave() {
      const count = Math.min(3 + wave, 6);
      const isBossWave = wave % 3 === 0;
      bossActive = isBossWave;
      if (isBossWave) {
        enemies.push(createEnemy(true));
      } else {
        for (let i = 0; i < count; i++) {
          ctx.timeout(() => { if (state === 'playing') enemies.push(createEnemy(false)); }, i * 800);
        }
      }
    }

    function createEnemy(isBoss) {
      const side = Math.random() > 0.5 ? 1 : -1;
      return {
        x: side > 0 ? W + 40 : -40, y: FLOOR,
        hp: isBoss ? 8 : 2, maxHp: isBoss ? 8 : 2,
        vx: side > 0 ? -(0.8 + wave * 0.1) : (0.8 + wave * 0.1),
        attackTimer: 0, isBoss,
        width: isBoss ? 50 : 32, height: isBoss ? 70 : 55,
        color: isBoss ? '#ff2200' : `hsl(${Math.random()*60+10},60%,40%)`,
        hitFlash: 0, weaponType: isBoss ? 'katana' : ['fist','nunchaku','knife'][Math.floor(Math.random()*3)],
      };
    }

    function doSpecial() {
      if (player.specialTimer > 0) return;
      player.specialTimer = 180;
      punchSound(); beep(440, 0.3, 'sine', 0.4);
      enemies.forEach(e => {
        const dx = Math.abs(e.x - player.x);
        if (dx < 180) {
          e.hp -= 3; e.hitFlash = 10;
          e.vx = (e.x > player.x ? 1 : -1) * 8;
          hitSound();
        }
      });
      cleanEnemies();
    }

    function attack(dir) {
      player.attackDir = dir;
      player.attackTimer = 20;
      player.punchAnim = 15;
      punchSound();
      enemies.forEach(e => {
        const ex = e.x - player.x;
        if (Math.sign(ex) === dir && Math.abs(ex) < 90 && Math.abs(e.y - player.y) < 50) {
          e.hp -= 1; e.hitFlash = 8;
          e.vx = dir * 5;
          hitSound();
          comboCount++;
          comboTimer = 90;
          score += 10 * comboCount;
          ctx.platform.setScore(score);
          if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
          scoreChime();
        }
      });
      cleanEnemies();
    }

    function cleanEnemies() {
      enemies = enemies.filter(e => {
        if (e.hp <= 0) { score += e.isBoss ? 200 : 50; ctx.platform.setScore(score); return false; }
        return true;
      });
      if (enemies.length === 0 && state === 'playing') {
        wave++;
        ctx.timeout(() => { if (state === 'playing') spawnWave(); }, 1500);
      }
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      swipeStartX = tx; swipeStartY = ty;

      if (state === 'select') {
        // pick turtle by quadrant
        const col = Math.floor(tx / (W / 2));
        const row = Math.floor((ty - H * 0.3) / ((H * 0.5) / 2));
        chosen = Math.max(0, Math.min(3, row * 2 + col));
        state = 'playing';
        started = false;
        resetGame();
        return;
      }
      if (state === 'gameover') {
        state = 'select';
        return;
      }
      if (!started) { started = true; ctx.platform.start(); }
      // special: two-finger
      if (e.touches.length >= 2) { doSpecial(); return; }
      const dir = tx < W / 2 ? -1 : 1;
      attack(dir);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStartX, dy = ty - swipeStartY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        // swipe = special
        doSpecial();
      }
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);

      if (state === 'select') { drawSelect(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      // bg
      drawBG();

      // update enemies
      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        e.x += e.vx * s;
        // slow to stop
        if (Math.abs(e.vx) > 0.5) e.vx *= 0.88;
        else e.vx = 0;
        // approach player
        const dx = player.x - e.x;
        if (Math.abs(dx) > (e.isBoss ? 60 : 45)) {
          e.x += Math.sign(dx) * (e.isBoss ? 1.5 : 1.2) * s;
        }
        e.attackTimer -= dt;
        if (e.attackTimer <= 0 && Math.abs(dx) < 60 && player.invincible <= 0) {
          e.attackTimer = e.isBoss ? 1200 : 1800;
          player.hp--;
          player.invincible = 60;
          hitSound();
          if (player.hp <= 0) {
            deathSound(); gameOverTone();
            if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
            state = 'gameover';
          }
        }
      });

      if (player.invincible > 0) player.invincible--;
      if (player.attackTimer > 0) player.attackTimer -= dt;
      if (player.specialTimer > 0) player.specialTimer -= dt;
      if (player.punchAnim > 0) player.punchAnim--;
      if (comboTimer > 0) comboTimer--;
      else comboCount = 0;

      drawEnemies();
      drawPlayer();
      drawHUD();
    });

    function drawBG() {
      // City night
      g.fillStyle = '#0a0a1a';
      g.fillRect(0, 0, W, H);
      // Buildings
      const bldgs = [[0.05,0.35,0.12,0.55],[0.2,0.25,0.15,0.45],[0.38,0.3,0.13,0.5],[0.55,0.2,0.18,0.45],[0.76,0.28,0.14,0.5],[0.92,0.32,0.1,0.48]];
      bldgs.forEach(([bx,by,bw,bh]) => {
        g.fillStyle = '#1a1a2e';
        g.fillRect(bx*W, by*H, bw*W, bh*H);
        // windows
        g.fillStyle = 'rgba(255,220,100,0.6)';
        for (let wy = by*H+8; wy < (by+bh)*H - 20; wy += 18) {
          for (let wx = bx*W+6; wx < (bx+bw)*W - 6; wx += 16) {
            if (Math.random() > 0.4) g.fillRect(wx, wy, 7, 9);
          }
        }
      });
      // ground
      g.fillStyle = '#1a1a1a';
      g.fillRect(0, FLOOR + 55, W, H);
      g.fillStyle = '#333';
      g.fillRect(0, FLOOR + 55, W, 3);
    }

    function drawTurtle(x, y, color, belt, punchAnim, dir, invincible, scale = 1) {
      if (invincible > 0 && Math.floor(invincible / 4) % 2 === 0) return;
      g.save();
      g.translate(x, y);
      g.scale(dir * scale, scale);
      // shell
      g.fillStyle = '#3a7a30';
      g.beginPath(); g.ellipse(0, -30, 20, 16, 0, 0, Math.PI * 2); g.fill();
      // body
      g.fillStyle = color;
      g.fillRect(-12, -28, 24, 30);
      // head
      g.fillStyle = '#5a9a40';
      g.beginPath(); g.ellipse(0, -38, 12, 12, 0, 0, Math.PI * 2); g.fill();
      // eye
      g.fillStyle = '#fff';
      g.fillRect(3, -42, 6, 4);
      g.fillStyle = '#000';
      g.fillRect(5, -42, 3, 4);
      // mask
      g.fillStyle = color;
      g.fillRect(-14, -44, 28, 8);
      // belt
      g.fillStyle = belt;
      g.fillRect(-12, -12, 24, 6);
      // legs
      g.fillStyle = '#5a9a40';
      g.fillRect(-12, 2, 10, 14); g.fillRect(2, 2, 10, 14);
      // arms + punch
      const punchX = punchAnim > 0 ? 18 : 12;
      g.fillRect(-punchX, -22, 10, 8);
      g.fillRect(punchX - 10, -22, 10, 8);
      g.restore();
    }

    function drawEnemy(e) {
      g.save();
      g.translate(e.x, e.y);
      const dir = e.vx <= 0 ? 1 : -1;
      g.scale(dir, 1);
      if (e.hitFlash > 0) { g.globalAlpha = 0.5 + Math.sin(e.hitFlash * 0.8) * 0.5; }
      // body
      g.fillStyle = e.isBoss ? '#cc2200' : e.color;
      g.fillRect(-e.width/2, -e.height, e.width, e.height);
      // head
      g.fillStyle = '#c8a888';
      g.beginPath(); g.ellipse(0, -e.height - 12, e.isBoss ? 22 : 14, e.isBoss ? 22 : 14, 0, 0, Math.PI * 2); g.fill();
      // mask
      g.fillStyle = '#333';
      g.fillRect(-8, -e.height - 18, 16, 8);
      // hp bar
      g.fillStyle = '#600';
      g.fillRect(-20, -e.height - 30, 40, 5);
      g.fillStyle = '#f44';
      g.fillRect(-20, -e.height - 30, 40 * (e.hp / e.maxHp), 5);
      if (e.isBoss) {
        g.fillStyle = '#ff0';
        g.font = 'bold 11px monospace';
        g.textAlign = 'center';
        g.fillText('BOSS', 0, -e.height - 34);
      }
      g.restore();
    }

    function drawEnemies() { enemies.forEach(drawEnemy); }
    function drawPlayer() {
      drawTurtle(player.x, player.y, player.color, player.belt, player.punchAnim, player.attackDir, player.invincible);
    }

    function drawHUD() {
      // score
      g.fillStyle = '#fff';
      g.font = 'bold 18px monospace';
      g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 12, 28);
      g.textAlign = 'right';
      g.fillText(`HI: ${hs}`, W - 12, 28);
      g.textAlign = 'center';
      g.fillText(`WAVE ${wave}`, W / 2, 28);
      // hp
      g.fillStyle = '#333';
      g.fillRect(12, 40, 120, 12);
      g.fillStyle = player.hp > 2 ? '#44ff44' : '#ff4444';
      g.fillRect(12, 40, 120 * (player.hp / player.maxHp), 12);
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      g.strokeRect(12, 40, 120, 12);
      g.fillStyle = '#fff';
      g.font = '10px monospace';
      g.textAlign = 'left';
      g.fillText('HP', 14, 51);
      // combo
      if (comboCount > 1 && comboTimer > 0) {
        g.save();
        const alpha = comboTimer / 90;
        g.globalAlpha = alpha;
        g.fillStyle = '#ffff00';
        g.font = `bold ${24 + comboCount * 2}px monospace`;
        g.textAlign = 'center';
        g.fillText(`${comboCount}x COMBO!`, W / 2, H * 0.4);
        g.restore();
      }
      // special
      g.fillStyle = player.specialTimer > 0 ? '#555' : '#00aaff';
      g.fillRect(W / 2 - 50, FLOOR + 62, 100, 22);
      g.fillStyle = '#fff';
      g.font = '11px monospace';
      g.textAlign = 'center';
      g.fillText(player.specialTimer > 0 ? 'SPECIAL RECHARGE' : 'SWIPE = SPECIAL', W / 2, FLOOR + 77);
      // turtle name
      g.fillStyle = TURTLES[chosen].color;
      g.font = 'bold 13px monospace';
      g.textAlign = 'left';
      g.fillText(TURTLES[chosen].name.toUpperCase(), 12, H - SB - 30);
    }

    function drawSelect() {
      g.fillStyle = '#0a0a1a';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#44ff44';
      g.font = 'bold 26px monospace';
      g.textAlign = 'center';
      g.fillText('TMNT BRAWLER', W/2, H * 0.12);
      g.fillStyle = '#aaa';
      g.font = '14px monospace';
      g.fillText('CHOOSE YOUR TURTLE', W/2, H * 0.22);
      g.fillStyle = '#fff';
      g.font = '12px monospace';
      g.fillText(`HI-SCORE: ${hs}`, W/2, H * 0.28);

      TURTLES.forEach((t, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const cx = W * (col === 0 ? 0.28 : 0.72);
        const cy = H * (0.38 + row * 0.26);
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.beginPath(); g.roundRect(cx - 60, cy - 50, 120, 90, 8); g.fill();
        drawTurtle(cx, cy + 20, t.color, t.belt, 0, 1, 0, 1.3);
        g.fillStyle = t.color;
        g.font = 'bold 13px monospace';
        g.textAlign = 'center';
        g.fillText(t.name.toUpperCase(), cx, cy + 52);
        g.fillStyle = '#aaa';
        g.font = '10px monospace';
        g.fillText(t.weapon, cx, cy + 65);
      });
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.85)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff4444';
      g.font = 'bold 32px monospace';
      g.textAlign = 'center';
      g.fillText('GAME OVER', W/2, H*0.38);
      g.fillStyle = '#fff';
      g.font = '20px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H*0.5);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.58);
      g.fillStyle = '#44ff44';
      g.font = '16px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.7);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
