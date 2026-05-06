window.plethoraBit = {
  meta: {
    title: 'Moon Patrol',
    author: 'plethora',
    description: 'Lunar buggy battles UFOs and tanks!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;
    const GROUND_Y = H - SB - 80;

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
    function shootFwdSnd() { beep(500, 0.07, 'sawtooth', 0.3); }
    function shootUpSnd() { beep(700, 0.07, 'sine', 0.3); }
    function jumpSnd() { beep(400, 0.08, 'sine', 0.2); }
    function explosionSnd() { beep(80, 0.2, 'sawtooth', 0.5); beep(40, 0.3, 'square', 0.4); }
    function hitSnd() { beep(60, 0.2, 'square', 0.6); }

    const HS_KEY = 'hs_moonpatrol';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'title';
    let started = false;
    let swipeStartX, swipeStartY, swipeT;

    const BUGGY_X = W * 0.2;
    let buggy, bullets, enemies, craters, score, speed, spawnT, bgX, stars;
    let explosions = [];

    function resetGame() {
      buggy = { x: BUGGY_X, y: GROUND_Y, vy: 0, onGround: true, jumpCount: 0,
        hp: 3, maxHp: 3, invincible: 0, shootFwdT: 0, shootUpT: 0 };
      bullets = []; enemies = []; craters = []; score = 0; speed = 2.5; spawnT = 100; bgX = 0;
      stars = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.5, size: Math.random() * 2 + 0.5 }));
      // initial craters
      for (let i = 0; i < 3; i++) craters.push({ x: W * (0.4 + i * 0.25), w: 30 + Math.random() * 20, depth: 15 + Math.random() * 10 });
    }

    function shootForward() {
      if (buggy.shootFwdT > 0) return;
      buggy.shootFwdT = 14; shootFwdSnd();
      bullets.push({ x: BUGGY_X + 28, y: buggy.y - 18, vx: 9, vy: 0, type: 'fwd' });
    }

    function shootUp() {
      if (buggy.shootUpT > 0) return;
      buggy.shootUpT = 14; shootUpSnd();
      bullets.push({ x: BUGGY_X + 4, y: buggy.y - 28, vx: 0, vy: -8, type: 'up' });
    }

    function jump() {
      if (buggy.jumpCount >= 1) return;
      buggy.vy = -13; buggy.onGround = false; buggy.jumpCount++; jumpSnd();
    }

    function addExplosion(x, y) {
      explosions.push({ x, y, r: 5, life: 20, maxLife: 20 });
      explosionSnd();
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
      // left = forward shoot, right = upward shoot, center = jump
      if (tx < W * 0.33) { shootForward(); }
      else if (tx > W * 0.67) { shootUp(); }
      else { jump(); }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dy = ty - swipeStartY, dx = tx - swipeStartX;
      if (Date.now() - swipeT < 300 && dy < -50 && Math.abs(dy) > Math.abs(dx)) jump();
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'title') { drawTitle(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      bgX += speed * s;
      speed = Math.min(5, 2.5 + score / 2000);
      spawnT -= dt;

      if (spawnT <= 0) {
        spawnT = Math.max(40, 160 - score / 100);
        const roll = Math.random();
        if (roll < 0.35) {
          craters.push({ x: W + 20, w: 28 + Math.random() * 22, depth: 14 + Math.random() * 12 });
        } else if (roll < 0.6) {
          enemies.push({ x: W + 30, y: GROUND_Y - 10, type: 'mine', vx: -speed * 0.3, hp: 1, hitFlash: 0 });
        } else if (roll < 0.8) {
          enemies.push({ x: W + 20, y: GROUND_Y - 80 - Math.random() * 80, type: 'ufo', vx: -2, vy: 0, hp: 2, hitFlash: 0, shootT: 600 });
        } else {
          enemies.push({ x: W + 30, y: GROUND_Y, type: 'tank', vx: -speed * 0.5, hp: 3, hitFlash: 0, shootT: 1000 });
        }
      }

      // buggy physics
      if (buggy.shootFwdT > 0) buggy.shootFwdT -= dt;
      if (buggy.shootUpT > 0) buggy.shootUpT -= dt;
      if (buggy.invincible > 0) buggy.invincible--;
      buggy.vy += 0.7 * s;
      buggy.y += buggy.vy * s;
      if (buggy.y >= GROUND_Y) {
        buggy.y = GROUND_Y; buggy.vy = 0; buggy.onGround = true; buggy.jumpCount = 0;
      }

      // check crater fall
      craters.forEach(c => {
        if (c.x < BUGGY_X && c.x + c.w > BUGGY_X - 10 && buggy.y >= GROUND_Y - 2 && buggy.onGround) {
          if (buggy.invincible <= 0) { buggy.hp--; buggy.invincible = 60; hitSnd(); addExplosion(BUGGY_X, GROUND_Y); }
        }
      });

      // move craters
      craters.forEach(c => { c.x -= speed * s; });
      craters = craters.filter(c => c.x + c.w > -10);

      // move bullets
      bullets.forEach(b => { b.x += b.vx * s; b.y += b.vy * s; });

      // update enemies
      enemies.forEach(e => {
        if (e.hitFlash > 0) e.hitFlash--;
        e.x += e.vx * s;
        if (e.type === 'ufo') {
          e.y += Math.sin(Date.now() / 400 + e.x * 0.01) * 1.2 * s;
          e.shootT -= dt;
          if (e.shootT <= 0 && e.x < W) {
            e.shootT = 1200 + Math.random() * 600;
            bullets.push({ x: e.x, y: e.y + 14, vx: -3, vy: 2, type: 'enemy' });
          }
        }
        if (e.type === 'tank') {
          e.shootT -= dt;
          if (e.shootT <= 0 && e.x < W - 20) {
            e.shootT = 1500;
            bullets.push({ x: e.x - 20, y: e.y - 18, vx: -5, vy: 0, type: 'enemy' });
          }
        }
      });

      // bullet-enemy collisions
      bullets.forEach(b => {
        if (b.type === 'enemy') return;
        enemies.forEach(e => {
          const ex = b.type === 'up' ? (Math.abs(b.x - e.x) < 25) : (Math.abs(b.x - e.x) < 22 && b.x < e.x + 20);
          const ey = Math.abs(b.y - e.y) < 25;
          if (ex && ey && !b.hit) {
            b.hit = true; e.hp--; e.hitFlash = 10;
            if (e.hp <= 0) { addExplosion(e.x, e.y); score += e.type === 'ufo' ? 50 : e.type === 'tank' ? 80 : 30; ctx.platform.setScore(score); if(score>hs){hs=score;ctx.storage.set(HS_KEY,hs);} }
          }
        });
      });
      bullets = bullets.filter(b => !b.hit && b.x > -10 && b.x < W + 10 && b.y > -20 && b.y < H);
      enemies = enemies.filter(e => e.hp > 0 && e.x > -60);

      // enemy bullets hit buggy
      bullets.forEach(b => {
        if (b.type !== 'enemy') return;
        if (Math.abs(b.x - BUGGY_X) < 25 && Math.abs(b.y - buggy.y) < 25 && buggy.invincible <= 0) {
          b.hit = true; buggy.hp--; buggy.invincible = 60; hitSnd(); addExplosion(BUGGY_X, buggy.y);
        }
      });
      bullets = bullets.filter(b => !b.hit);

      // enemy contact
      enemies.forEach(e => {
        if ((e.type === 'mine' || e.type === 'tank') && Math.abs(e.x - BUGGY_X) < 32 && buggy.invincible <= 0) {
          e.hp = 0; buggy.hp--; buggy.invincible = 60; hitSnd(); addExplosion(e.x, e.y);
        }
      });

      score += s * 0.2;

      if (buggy.hp <= 0) {
        addExplosion(BUGGY_X, buggy.y);
        if(score>hs){hs=score|0;ctx.storage.set(HS_KEY,hs);}
        ctx.timeout(() => { state = 'gameover'; }, 600);
        buggy.hp = 0; buggy.invincible = 9999;
      }

      // explosions
      explosions.forEach(ex => { ex.r += 3 * s; ex.life -= s; });
      explosions = explosions.filter(ex => ex.life > 0);

      drawBG();
      drawCraters();
      drawEnemies();
      drawBullets();
      drawBuggy();
      drawExplosions();
      drawHUD();
    });

    function drawBG() {
      // sky
      const sky = g.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, '#000008'); sky.addColorStop(1, '#0a0520');
      g.fillStyle = sky; g.fillRect(0, 0, W, GROUND_Y);
      // stars
      stars.forEach(s2 => {
        const x = ((s2.x - bgX * 0.05) % W + W) % W;
        g.fillStyle = `rgba(255,255,255,${0.4+Math.random()*0.4})`;
        g.beginPath(); g.arc(x, s2.y, s2.size, 0, Math.PI*2); g.fill();
      });
      // earth
      g.fillStyle = '#224488'; g.beginPath(); g.arc(W*0.85, H*0.12, 35, 0, Math.PI*2); g.fill();
      g.fillStyle = '#336699'; g.beginPath(); g.ellipse(W*0.85-8, H*0.1, 18, 12, -0.3, 0, Math.PI*2); g.fill();
      g.fillStyle = '#33aa33'; g.beginPath(); g.ellipse(W*0.88, H*0.15, 10, 7, 0.4, 0, Math.PI*2); g.fill();
      // mountains
      [[0.05,0.2],[0.3,0.15],[0.55,0.18],[0.78,0.16]].forEach(([mx, mh]) => {
        const x = ((mx*W - bgX*0.12) % (W+120)+W+120)%(W+120) - 40;
        g.fillStyle = '#1a1a2e';
        g.beginPath(); g.moveTo(x-50,GROUND_Y); g.lineTo(x,GROUND_Y-mh*H*0.5); g.lineTo(x+50,GROUND_Y); g.fill();
      });
      // ground
      g.fillStyle = '#2a2a3a'; g.fillRect(0, GROUND_Y, W, H);
      g.fillStyle = '#3a3a4a'; g.fillRect(0, GROUND_Y, W, 8);
      // ground texture scrolling
      g.strokeStyle = 'rgba(80,80,100,0.4)'; g.lineWidth = 1;
      for (let x = (-bgX % 40 + 40) % 40; x < W; x += 40) {
        g.beginPath(); g.moveTo(x, GROUND_Y); g.lineTo(x + 20, GROUND_Y); g.stroke();
      }
    }

    function drawCraters() {
      craters.forEach(c => {
        g.fillStyle = '#1a1a2a';
        g.beginPath();
        g.ellipse(c.x + c.w/2, GROUND_Y + c.depth*0.3, c.w/2, c.depth, 0, 0, Math.PI);
        g.fill();
        g.fillStyle = '#0a0a1a';
        g.beginPath();
        g.ellipse(c.x + c.w/2, GROUND_Y + c.depth*0.5, c.w/2 - 4, c.depth * 0.7, 0, 0, Math.PI);
        g.fill();
      });
    }

    function drawEnemies() {
      enemies.forEach(e => {
        g.save(); g.translate(e.x, e.y);
        if (e.hitFlash > 0 && Math.floor(e.hitFlash/2)%2) { g.globalAlpha = 0.3; }
        if (e.type === 'ufo') {
          g.fillStyle = '#448844'; g.beginPath(); g.ellipse(0, 0, 24, 10, 0, 0, Math.PI*2); g.fill();
          g.fillStyle = '#88ff88'; g.beginPath(); g.ellipse(0, -5, 14, 10, 0, Math.PI, 0, true); g.fill();
          g.fillStyle = '#44ff44'; g.beginPath(); g.arc(0, -5, 5, 0, Math.PI*2); g.fill();
        } else if (e.type === 'tank') {
          g.fillStyle = '#445522'; g.fillRect(-25, -20, 50, 20);
          g.fillStyle = '#556633'; g.fillRect(-20, -28, 40, 10);
          g.fillStyle = '#778844'; g.fillRect(18, -22, 20, 5);
          g.fillStyle = '#222'; g.beginPath(); g.arc(-18, 0, 8, 0, Math.PI*2); g.fill();
          g.beginPath(); g.arc(18, 0, 8, 0, Math.PI*2); g.fill();
        } else if (e.type === 'mine') {
          g.fillStyle = '#aa2200';
          g.beginPath(); g.arc(0, 0, 10, 0, Math.PI*2); g.fill();
          g.strokeStyle = '#ff4400'; g.lineWidth = 2;
          [0,60,120,180,240,300].forEach(ang => {
            const r = ang * Math.PI / 180;
            g.beginPath(); g.moveTo(Math.cos(r)*10, Math.sin(r)*10); g.lineTo(Math.cos(r)*16, Math.sin(r)*16); g.stroke();
          });
        }
        g.restore();
      });
    }

    function drawBullets() {
      bullets.forEach(b => {
        g.fillStyle = b.type === 'enemy' ? '#ff4400' : '#ffff00';
        g.fillRect(b.x - 5, b.y - 2, 10, 4);
        if (b.type === 'up') { g.fillRect(b.x - 2, b.y - 5, 4, 10); }
      });
    }

    function drawBuggy() {
      if (buggy.invincible > 5 && Math.floor(buggy.invincible/4)%2) return;
      g.save(); g.translate(BUGGY_X, buggy.y);
      // wheels
      g.fillStyle = '#555'; g.beginPath(); g.arc(-16, 4, 10, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(16, 4, 10, 0, Math.PI*2); g.fill();
      g.fillStyle = '#888'; g.beginPath(); g.arc(-16, 4, 5, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(16, 4, 5, 0, Math.PI*2); g.fill();
      // body
      g.fillStyle = '#4a4a2a'; g.fillRect(-22, -16, 44, 20);
      g.fillStyle = '#6a6a3a'; g.fillRect(-18, -26, 36, 12);
      // cockpit
      g.fillStyle = '#44aaff'; g.fillRect(-12, -28, 24, 14);
      // cannon
      g.fillStyle = '#888'; g.fillRect(18, -20, 18, 5);
      g.fillRect(-2, -30, 5, 18);
      g.restore();
    }

    function drawExplosions() {
      explosions.forEach(ex => {
        const alpha = ex.life / ex.maxLife;
        g.save(); g.globalAlpha = alpha;
        g.fillStyle = '#ff6600'; g.beginPath(); g.arc(ex.x, ex.y, ex.r, 0, Math.PI*2); g.fill();
        g.fillStyle = '#ffcc00'; g.beginPath(); g.arc(ex.x, ex.y, ex.r*0.6, 0, Math.PI*2); g.fill();
        g.restore();
      });
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score|0}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, 26);
      for (let i = 0; i < buggy.maxHp; i++) {
        g.fillStyle = i < buggy.hp ? '#ff4444' : '#333';
        g.fillRect(10 + i*20, 35, 16, 12);
      }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '10px monospace'; g.textAlign = 'center';
      g.fillText('L=SHOOT FWD  R=SHOOT UP  CTR=JUMP  SWIPE UP=JUMP', W/2, H-SB-24);
    }

    function drawTitle() {
      g.fillStyle = '#000008'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#44aaff'; g.font = 'bold 26px monospace'; g.textAlign = 'center';
      g.fillText('MOON PATROL', W/2, H*0.25);
      g.fillStyle = '#aaa'; g.font = '13px monospace';
      g.fillText('Lunar Buggy vs Alien Invasion', W/2, H*0.37);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.47);
      g.fillStyle = '#fff'; g.font = '14px monospace';
      g.fillText('TAP TO START', W/2, H*0.62);
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#44aaff'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('BUGGY DESTROYED', W/2, H*0.38);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score|0}`, W/2, H*0.5);
      g.fillText(`HI: ${hs}`, W/2, H*0.59);
      g.fillStyle = '#44aaff'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.72);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
