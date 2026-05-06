window.plethoraBit = {
  meta: {
    title: 'Mario Bros',
    author: 'plethora',
    description: 'Stun enemies from below — classic!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;

    const FLOOR = H - SB - 55;
    const PLAT1 = FLOOR - 110;
    const PLAT2 = FLOOR - 220;
    const PLATS = [
      { x: 0, y: FLOOR, w: W, id: 0 },
      { x: 0, y: PLAT1, w: W * 0.4, id: 1 },
      { x: W * 0.6, y: PLAT1, w: W * 0.4, id: 2 },
      { x: W * 0.15, y: PLAT2, w: W * 0.35, id: 3 },
      { x: W * 0.5, y: PLAT2, w: W * 0.35, id: 4 },
    ];
    const PIPES = [
      { x: 0, y: FLOOR, w: 28, fromFloor: true },
      { x: W - 28, y: FLOOR, w: 28, fromFloor: true },
      { x: 0, y: PLAT1, w: 22, fromFloor: false },
      { x: W - 22, y: PLAT1, w: 22, fromFloor: false },
      { x: 0, y: PLAT2, w: 18, fromFloor: false },
      { x: W - 18, y: PLAT2, w: 18, fromFloor: false },
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
    function bumpSnd() { beep(200, 0.06, 'square', 0.4); beep(350, 0.06, 'square', 0.3); }
    function stunSnd() { beep(600, 0.1, 'sine', 0.4); }
    function kickSnd() { beep(400, 0.08, 'sawtooth', 0.4); }
    function dieSnd() { [300, 200, 100].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.5), i * 100)); }
    function jumpSnd() { beep(500, 0.07, 'sine', 0.2); }
    function powSnd() { [200, 400, 200].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'sawtooth', 0.4), i * 80)); }
    function scoreSnd() { beep(880, 0.06, 'sine', 0.3); }

    const HS_KEY = 'hs_mariobros';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'title';
    let started = false;
    let swipeStartX, swipeStartY, swipeT;

    let player, enemies, score, lives, wave, spawnT, powBlock, powHits;
    let particles = [];

    function resetGame() {
      player = { x: W * 0.5, y: FLOOR, vx: 0, vy: 0, onGround: true, dir: 1,
        invincible: 0, runFrame: 0, runTimer: 0 };
      enemies = []; score = 0; lives = 3; wave = 1; spawnT = 60;
      powBlock = { x: W/2 - 16, y: PLAT2 - 40, uses: 3, maxUses: 3, flash: 0 };
      powHits = 0;
      particles = [];
      spawnWave();
    }

    function spawnWave() {
      const count = 2 + wave;
      for (let i = 0; i < count; i++) {
        ctx.timeout(() => {
          if (state !== 'playing') return;
          const types = ['shellcreeper', 'sidestepper', 'fighterfly'];
          const t = types[Math.min(Math.floor(Math.random() * (1 + wave * 0.4)), 2)];
          const side = Math.random() > 0.5;
          const pipe = PIPES[Math.floor(Math.random() * 4) + 2];
          enemies.push({
            x: side ? 0 : W, y: pipe.y - 5, vx: side ? 1.5 : -1.5,
            vy: 0, onGround: false, type: t, stunned: false, stunTimer: 0,
            hp: t === 'sidestepper' ? 2 : 1, hitFlash: 0,
            color: { shellcreeper: '#ff6600', sidestepper: '#ff2266', fighterfly: '#8844ff' }[t],
            flying: t === 'fighterfly',
          });
        }, i * 900);
      }
    }

    function doBump(bx, by) {
      // bump enemies on platforms above
      PLATS.forEach(pl => {
        if (Math.abs(pl.y - by) < 20) { // we're jumping from below this platform
          enemies.forEach(e => {
            if (e.onGround && Math.abs(e.x - bx) < 40 && Math.abs(e.y - pl.y) < 10) {
              if (!e.stunned) {
                if (e.type === 'sidestepper' && e.hp > 1) { e.hp--; e.hitFlash = 10; bumpSnd(); }
                else { e.stunned = true; e.stunTimer = 240; e.vx = 0; stunSnd(); score += 20; ctx.platform.setScore(score); scoreSnd(); }
              }
            }
          });
          // bump POW block
          if (Math.abs(bx - powBlock.x - 16) < 40 && Math.abs(by - powBlock.y - 16) < 30 && powBlock.uses > 0) {
            powBlock.uses--; powBlock.flash = 15; powSnd(); ctx.platform.haptic('heavy');
            enemies.forEach(e => { if (!e.stunned) { e.stunned = true; e.stunTimer = 300; e.vx = 0; } });
          }
        }
      });
    }

    function kickEnemy(enemy) {
      kickSnd();
      enemy.vx = enemy.x > player.x ? 6 : -6;
      enemy.stunned = false; enemy.stunTimer = 0;
      score += 50; ctx.platform.setScore(score); scoreSnd();
      if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const tx = e.changedTouches[0].clientX;
      swipeStartX = tx; swipeStartY = e.changedTouches[0].clientY; swipeT = Date.now();
      if (state === 'title' || state === 'gameover') { state = 'playing'; resetGame(); if (!started) { started = true; ctx.platform.start(); } return; }
      if (!started) { started = true; ctx.platform.start(); }
      // jump on tap
      if (player.onGround) {
        player.vy = -14; player.onGround = false; jumpSnd();
      }
      // move direction
      player.dir = tx > W / 2 ? 1 : -1;
      player.vx = player.dir * 2.8;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      player.vx = 0;
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'title') { drawTitle(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      // player physics
      player.vy += 0.65 * s; player.y += player.vy * s;
      player.x += player.vx * s;
      player.x = ((player.x % W) + W) % W; // wrap
      if (player.invincible > 0) player.invincible--;

      // platform collisions
      player.onGround = false;
      PLATS.forEach(pl => {
        if (player.x >= pl.x && player.x <= pl.x + pl.w && player.y >= pl.y - 2 && player.y <= pl.y + 18 && player.vy >= 0) {
          player.y = pl.y; player.vy = 0; player.onGround = true;
        }
      });
      // bump from below
      PLATS.forEach(pl => {
        if (player.x >= pl.x - 10 && player.x <= pl.x + pl.w + 10 && player.y <= pl.y + 2 && player.y >= pl.y - 20 && player.vy < 0) {
          player.vy = 2; doBump(player.x, pl.y + 1);
        }
      });
      // top ceiling bounce
      if (player.y < 10) { player.y = 10; player.vy = Math.abs(player.vy); }
      if (player.y > FLOOR) { player.y = FLOOR; player.vy = 0; player.onGround = true; }

      // player run animation
      if (player.vx !== 0) { player.runTimer += dt; if (player.runTimer > 120) { player.runFrame = 1 - player.runFrame; player.runTimer = 0; } }
      else player.runFrame = 0;

      spawnT -= dt;
      if (spawnT <= 0 && enemies.length === 0) { wave++; spawnT = 200; spawnWave(); }

      // enemies
      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        if (e.stunned) {
          e.stunTimer -= dt;
          if (e.stunTimer <= 0) { e.stunned = false; e.vx = (Math.random() > 0.5 ? 1 : -1) * (1.5 + wave * 0.15); }
        } else {
          e.x += e.vx * s;
          if (e.flying) {
            e.y += Math.sin(Date.now() / 400 + e.x * 0.02) * 1.5 * s;
          }
        }
        // wrap
        e.x = ((e.x % W) + W) % W;
        if (e.x < 0) e.x += W;

        // gravity
        if (!e.flying) {
          e.vy += 0.6 * s; e.y += e.vy * s;
          e.onGround = false;
          PLATS.forEach(pl => {
            if (e.x >= pl.x && e.x <= pl.x + pl.w && e.y >= pl.y - 2 && e.y <= pl.y + 18 && e.vy >= 0) {
              e.y = pl.y; e.vy = 0; e.onGround = true;
            }
          });
          if (e.y > FLOOR + 30) { e.stunned = false; e.y = 10; e.vy = 0; e.vx = (Math.random()>0.5?1:-1) * (1.5+wave*0.15); }
        }
        // hit stunned enemy: kick
        if (e.stunned && Math.abs(e.x - player.x) < 25 && Math.abs(e.y - player.y) < 30) kickEnemy(e);

        // hit player
        if (!e.stunned && Math.abs(e.x - player.x) < 24 && Math.abs(e.y - player.y) < 28 && player.invincible <= 0) {
          lives--; player.invincible = 90; dieSnd();
          if (lives <= 0) { state = 'gameover'; if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); } }
        }
      });
      enemies = enemies.filter(e => !(e.stunned && e.stunTimer < -1 && e.hitFlash === 0) && e.hp > 0);

      if (powBlock.flash > 0) powBlock.flash--;

      // particles
      particles.forEach(p => { p.x += p.vx * s; p.y += p.vy * s; p.vy += 0.2 * s; p.life -= s; });
      particles = particles.filter(p => p.life > 0);

      drawBG();
      drawPipes();
      drawPowBlock();
      drawEnemies();
      drawPlayer();
      drawHUD();
    });

    function drawBG() {
      g.fillStyle = '#000022'; g.fillRect(0, 0, W, H);
      // platforms
      PLATS.forEach(pl => {
        g.fillStyle = '#cc6600'; g.fillRect(pl.x, pl.y, pl.w, 10);
        g.fillStyle = '#ff8800'; g.fillRect(pl.x, pl.y, pl.w, 4);
      });
      g.fillStyle = '#3a2a1a'; g.fillRect(0, FLOOR + 55, W, H);
    }

    function drawPipes() {
      PIPES.forEach(pipe => {
        g.fillStyle = '#228844'; g.fillRect(pipe.x, pipe.y - 35, pipe.w, 35);
        g.fillStyle = '#33aa55'; g.fillRect(pipe.x + 2, pipe.y - 35, pipe.w - 4, 35);
        g.fillStyle = '#33aa55'; g.fillRect(pipe.x - 3, pipe.y - 42, pipe.w + 6, 10);
        g.fillStyle = '#44cc66'; g.fillRect(pipe.x - 3, pipe.y - 42, pipe.w + 6, 4);
      });
    }

    function drawPowBlock() {
      if (powBlock.uses <= 0) {
        g.fillStyle = '#555'; g.fillRect(powBlock.x, powBlock.y, 32, 28);
        g.fillStyle = '#888'; g.font = 'bold 11px monospace'; g.textAlign = 'center';
        g.fillText('POW', powBlock.x + 16, powBlock.y + 19);
        return;
      }
      g.fillStyle = powBlock.flash > 0 ? '#ffffff' : '#4488ff';
      g.fillRect(powBlock.x, powBlock.y, 32, 28);
      g.fillStyle = '#fff'; g.font = 'bold 13px monospace'; g.textAlign = 'center';
      g.fillText('POW', powBlock.x + 16, powBlock.y + 19);
      g.fillStyle = '#ffcc00'; g.font = '9px monospace';
      g.fillText(`x${powBlock.uses}`, powBlock.x + 16, powBlock.y - 4);
    }

    function drawEnemies() {
      enemies.forEach(e => {
        g.save(); g.translate(e.x, e.y);
        const dir = e.vx >= 0 ? 1 : -1;
        g.scale(dir, 1);
        if (e.hitFlash > 0) g.globalAlpha = 0.5;
        if (e.stunned) { g.globalAlpha *= 0.8; g.rotate(0.2); }
        if (e.type === 'shellcreeper') {
          g.fillStyle = e.color; g.beginPath(); g.ellipse(0, -10, 14, 10, 0, 0, Math.PI*2); g.fill();
          g.fillStyle = '#ffaa00'; g.beginPath(); g.ellipse(0, -10, 8, 6, 0, 0, Math.PI*2); g.fill();
          g.fillStyle = e.color; g.fillRect(-10, -4, 20, 10);
          g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(12, -16, 7, 7, 0, 0, Math.PI*2); g.fill();
          if (e.stunned) { g.fillStyle = '#fff'; g.fillRect(-5, -8, 3, 3); g.fillRect(2, -8, 3, 3); }
        } else if (e.type === 'sidestepper') {
          g.fillStyle = e.color; g.fillRect(-12, -22, 24, 22);
          g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -28, 9, 9, 0, 0, Math.PI*2); g.fill();
          g.fillStyle = e.color; g.fillRect(-16, -18, 8, 10); g.fillRect(8, -18, 8, 10);
          if (e.stunned) { g.fillStyle = '#fff'; g.fillRect(-3, -30, 3, 3); g.fillRect(1, -30, 3, 3); }
        } else { // fighterfly
          g.fillStyle = e.color;
          g.beginPath(); g.ellipse(0, -14, 10, 12, 0, 0, Math.PI*2); g.fill();
          g.fillStyle = 'rgba(200,200,255,0.6)';
          g.beginPath(); g.ellipse(-14, -16, 14, 6, -0.3, 0, Math.PI*2); g.fill();
          g.beginPath(); g.ellipse(14, -16, 14, 6, 0.3, 0, Math.PI*2); g.fill();
          g.fillStyle = e.color; g.beginPath(); g.ellipse(0, -22, 7, 7, 0, 0, Math.PI*2); g.fill();
        }
        g.restore();
      });
    }

    function drawPlayer() {
      if (player.invincible > 0 && Math.floor(player.invincible/4)%2) return;
      g.save(); g.translate(player.x, player.y); g.scale(player.dir, 1);
      // legs
      const legOff = player.runFrame * 4;
      g.fillStyle = '#cc4422'; g.fillRect(-9, -14, 8, 18 - legOff); g.fillRect(1, -14, 8, 14 + legOff);
      // body
      g.fillStyle = '#cc4422'; g.fillRect(-11, -42, 22, 28);
      g.fillStyle = '#4444cc'; g.fillRect(-11, -36, 22, 20);
      // head
      g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -50, 11, 11, 0, 0, Math.PI*2); g.fill();
      // hat
      g.fillStyle = '#cc4422';
      g.fillRect(-12, -57, 24, 9);
      g.fillRect(-8, -66, 16, 10);
      // mustache
      g.fillStyle = '#8b4513'; g.fillRect(-9, -47, 8, 4); g.fillRect(1, -47, 8, 4);
      g.restore();
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, 26);
      g.textAlign = 'center'; g.fillText(`PHASE ${wave}`, W/2, 26);
      // lives
      for (let i = 0; i < lives; i++) {
        g.fillStyle = '#ff4444'; g.beginPath(); g.arc(12 + i*22, 42, 7, 0, Math.PI*2); g.fill();
        g.fillStyle = '#cc4422'; g.font = '9px monospace'; g.textAlign = 'center';
        g.fillText('M', 12 + i*22, 45);
      }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '10px monospace'; g.textAlign = 'center';
      g.fillText('TAP=JUMP (HOLD L/R=MOVE)  BUMP FROM BELOW=STUN', W/2, H-SB-24);
    }

    function drawTitle() {
      g.fillStyle = '#000022'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#cc4422'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('MARIO BROS', W/2, H*0.25);
      g.fillStyle = '#ffcc00'; g.font = '14px monospace';
      g.fillText('Classic Sewer Brawler', W/2, H*0.37);
      g.fillStyle = '#aaa'; g.font = '13px monospace';
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.47);
      g.fillStyle = '#fff'; g.font = '14px monospace';
      g.fillText('TAP TO START', W/2, H*0.62);
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#cc4422'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('GAME OVER', W/2, H*0.38);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H*0.5);
      g.fillText(`HI: ${hs}`, W/2, H*0.59);
      g.fillStyle = '#ffcc00'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.72);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
