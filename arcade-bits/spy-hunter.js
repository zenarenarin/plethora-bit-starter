window.plethoraBit = {
  meta: {
    title: 'Spy Hunter',
    author: 'plethora',
    description: 'Spy car vs enemy fleet. Weapons hot.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null;
    function initAudio() { if (!audioCtx) audioCtx = new AudioContext(); }
    function beep(freq, dur, type='sine', vol=0.12) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function shootSound() { beep(800, 0.05, 'square', 0.1); }
    function explodeSound() { [400,250,150,80].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'sawtooth',0.15),i*50)); }
    function oilSound() { beep(180, 0.1, 'sine', 0.1); }
    function gameOverSound() { [400,300,200,100].forEach((f,i)=>setTimeout(()=>beep(f,0.25,'sawtooth',0.2),i*150)); }

    const SAFE = ctx.safeArea.bottom;
    const ROAD_LEFT = W * 0.1;
    const ROAD_RIGHT = W * 0.9;
    const ROAD_W = ROAD_RIGHT - ROAD_LEFT;
    const CAR_W = W * 0.12, CAR_H = H * 0.1;

    let carX, carVX, score, lives, gameOver, started, hs;
    let bullets, enemies, oils, smokes, bombs, explosions;
    let scrollY, speed, spawnTimer, fireTimer;
    let oilCooldown, smokeCooldown;
    let touchX = null;

    function reset() {
      carX = W / 2; carVX = 0; score = 0; lives = 3;
      gameOver = false; started = false;
      bullets = []; enemies = []; oils = []; smokes = []; bombs = []; explosions = [];
      scrollY = 0; speed = 3; spawnTimer = 0; fireTimer = 0;
      oilCooldown = 0; smokeCooldown = 0;
    }

    hs = ctx.storage.get('hs_spyhunter') || 0;
    reset();

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }
      touchX = t.clientX;
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', e => {
      e.preventDefault();
      touchX = e.changedTouches[0].clientX;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (!started || gameOver) return;
      const t = e.changedTouches[0];
      // Bottom buttons: left 33% = oil, right 33% = smoke (above safe area)
      if (t.clientY > H - SAFE - H * 0.18) {
        if (t.clientX < W * 0.33 && oilCooldown <= 0) {
          oils.push({ x: carX, y: H - SAFE - H * 0.22, r: 15, ttl: 300 });
          oilSound(); oilCooldown = 120;
          ctx.platform.haptic('light');
        } else if (t.clientX > W * 0.67 && smokeCooldown <= 0) {
          smokes.push({ x: carX, y: H - SAFE - H * 0.25, r: 20, ttl: 200, alpha: 0.7 });
          smokeCooldown = 90; beep(300, 0.1, 'sine', 0.08);
          ctx.platform.haptic('light');
        }
      }
      touchX = null;
    }, { passive: false });

    const ENEMY_TYPES = [
      { color: '#e44', w: CAR_W*0.9, h: CAR_H*0.85, speed: 2, score: 100, type: 'car' },
      { color: '#4e4', w: CAR_W*0.6, h: CAR_H*0.55, speed: 4, score: 150, type: 'moto' },
      { color: '#888', w: CAR_W*1.3, h: CAR_H, speed: 1.5, score: 200, type: 'truck' },
    ];

    function spawnEnemy() {
      const et = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
      const lane = ROAD_LEFT + Math.random() * (ROAD_W - et.w);
      enemies.push({ x: lane, y: -et.h, ...et, vx: (Math.random()-0.5)*1.5 });
      if (Math.random() < 0.25) {
        // helicopter drops bomb
        enemies.push({ x: lane + et.w/2 - 20, y: -H*0.3, color: '#888', w: 40, h: 25, speed: 2.5, score: 250, type: 'heli', vx: 0 });
      }
    }

    ctx.raf(dt => {
      const spd = dt / 16;
      g.fillStyle = '#2a2a2a';
      g.fillRect(0, 0, W, H);

      if (!started) {
        drawRoad();
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#0ff';
        g.font = `bold ${Math.floor(H*0.065)}px monospace`;
        g.textAlign = 'center';
        g.fillText('SPY HUNTER', W/2, H*0.34);
        g.fillStyle = '#ccc';
        g.font = `${Math.floor(H*0.028)}px monospace`;
        g.fillText('DRAG TO STEER', W/2, H*0.44);
        g.fillText('[OIL]  AUTO-GUN  [SMOKE]', W/2, H*0.51);
        g.fillText(`BEST: ${hs}`, W/2, H*0.59);
        return;
      }

      if (!gameOver) {
        // steer
        if (touchX !== null) {
          const diff = touchX - carX;
          carVX += diff * 0.015 * spd;
        }
        carVX *= 0.88;
        carX += carVX * spd;
        carX = Math.max(ROAD_LEFT + CAR_W/2, Math.min(ROAD_RIGHT - CAR_W/2, carX));

        scrollY = (scrollY + speed * spd) % 40;
        speed = 3 + score / 500;

        // auto fire
        fireTimer += dt;
        if (fireTimer > 200) {
          fireTimer = 0;
          const carY = H - SAFE - H*0.23;
          bullets.push({ x: carX - CAR_W*0.28, y: carY, vy: -10 });
          bullets.push({ x: carX + CAR_W*0.28, y: carY, vy: -10 });
          shootSound();
        }

        // spawn
        spawnTimer += dt;
        if (spawnTimer > Math.max(600, 1500 - score * 0.5)) {
          spawnTimer = 0;
          spawnEnemy();
        }

        // move bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
          bullets[i].y += bullets[i].vy * spd;
          if (bullets[i].y < 0) bullets.splice(i, 1);
        }

        // move enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
          const en = enemies[i];
          en.y += (en.speed + speed * 0.5) * spd;
          en.x += en.vx * spd;
          en.x = Math.max(ROAD_LEFT, Math.min(ROAD_RIGHT - en.w, en.x));

          if (en.type === 'heli') {
            // drop bomb
            if (Math.random() < 0.003 * spd) {
              bombs.push({ x: en.x + en.w/2, y: en.y + en.h, vy: 4 });
              beep(300, 0.1, 'sawtooth', 0.1);
            }
          }

          if (en.y > H + en.h) { enemies.splice(i, 1); continue; }

          // bullet hit
          let killed = false;
          for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (b.x > en.x && b.x < en.x + en.w && b.y > en.y && b.y < en.y + en.h) {
              explodeSound();
              explosions.push({ x: en.x + en.w/2, y: en.y + en.h/2, r: 0, maxR: en.w, ttl: 25 });
              score += en.score;
              ctx.platform.setScore(score);
              if (score > hs) { hs = score; ctx.storage.set('hs_spyhunter', hs); }
              ctx.platform.haptic('medium');
              enemies.splice(i, 1); bullets.splice(j, 1);
              killed = true; break;
            }
          }
          if (killed) continue;

          // oil hit (enemy skids out)
          for (const oil of oils) {
            if (en.x + en.w/2 > oil.x - oil.r && en.x + en.w/2 < oil.x + oil.r
                && en.y + en.h > oil.y - oil.r && en.y + en.h < oil.y + oil.r) {
              en.vx += (Math.random()-0.5) * 6;
            }
          }

          // player collision
          const carTopY = H - SAFE - H*0.33;
          const carBotY = H - SAFE - H*0.17;
          if (en.y + en.h > carTopY && en.y < carBotY &&
              en.x + en.w > carX - CAR_W/2 && en.x < carX + CAR_W/2) {
            lives--;
            explodeSound();
            ctx.platform.haptic('heavy');
            enemies.splice(i, 1);
            if (lives <= 0) {
              gameOver = true;
              gameOverSound();
              ctx.platform.fail({ reason: 'destroyed' });
            }
          }
        }

        // bombs
        for (let i = bombs.length - 1; i >= 0; i--) {
          bombs[i].y += bombs[i].vy * spd;
          if (bombs[i].y > H) { bombs.splice(i, 1); continue; }
          if (Math.abs(bombs[i].x - carX) < CAR_W*0.6 && Math.abs(bombs[i].y - (H - SAFE - H*0.23)) < CAR_H) {
            lives--;
            explodeSound();
            ctx.platform.haptic('heavy');
            bombs.splice(i, 1);
            if (lives <= 0) { gameOver = true; gameOverSound(); ctx.platform.fail({reason:'bombed'}); }
          }
        }

        // age oils/smokes/explosions
        for (let i = oils.length-1; i>=0; i--) { oils[i].ttl -= spd; if(oils[i].ttl<=0) oils.splice(i,1); }
        for (let i = smokes.length-1; i>=0; i--) { smokes[i].ttl -= spd; smokes[i].r += 0.3; smokes[i].alpha -= 0.003; if(smokes[i].ttl<=0) smokes.splice(i,1); }
        for (let i = explosions.length-1; i>=0; i--) { explosions[i].r += 2; explosions[i].ttl -= 1; if(explosions[i].ttl<=0) explosions.splice(i,1); }
        if (oilCooldown > 0) oilCooldown -= spd;
        if (smokeCooldown > 0) smokeCooldown -= spd;
      }

      drawRoad();

      // draw oils
      oils.forEach(o => {
        const grad = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        grad.addColorStop(0, 'rgba(0,0,0,0.8)');
        grad.addColorStop(0.5, 'rgba(80,0,80,0.6)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.beginPath(); g.ellipse(o.x, o.y, o.r, o.r*0.5, 0, 0, Math.PI*2); g.fill();
      });

      // smokes
      smokes.forEach(s => {
        g.fillStyle = `rgba(180,180,180,${s.alpha})`;
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI*2); g.fill();
      });

      // draw enemies
      enemies.forEach(en => {
        if (en.type === 'heli') {
          g.fillStyle = '#666';
          g.fillRect(en.x, en.y, en.w, en.h);
          g.fillStyle = '#888';
          g.fillRect(en.x - en.w*0.2, en.y + en.h*0.3, en.w*1.4, 4);
          g.fillStyle = 'rgba(150,200,255,0.5)';
          g.fillRect(en.x + en.w*0.1, en.y + en.h*0.1, en.w*0.8, en.h*0.35);
        } else {
          drawSimpleCar(en.x + en.w/2, en.y + en.h/2, en.w, en.h, en.color, true);
        }
      });

      // bullets
      g.fillStyle = '#ff0';
      bullets.forEach(b => g.fillRect(b.x-2, b.y-6, 4, 8));

      // bombs
      g.fillStyle = '#f80';
      bombs.forEach(b => {
        g.beginPath(); g.arc(b.x, b.y, 6, 0, Math.PI*2); g.fill();
      });

      // explosions
      explosions.forEach(ex => {
        const alpha = ex.ttl / 25;
        g.fillStyle = `rgba(255,${Math.floor(ex.ttl*8)},0,${alpha})`;
        g.beginPath(); g.arc(ex.x, ex.y, ex.r, 0, Math.PI*2); g.fill();
        g.fillStyle = `rgba(255,255,100,${alpha*0.6})`;
        g.beginPath(); g.arc(ex.x, ex.y, ex.r*0.5, 0, Math.PI*2); g.fill();
      });

      // player car
      drawSimpleCar(carX, H - SAFE - H*0.23, CAR_W, CAR_H, '#0af', false);

      // weapon buttons (above safe area)
      const BTN_TOP = H - SAFE - H * 0.16;
      const BTN_H = H * 0.16;
      g.fillStyle = `rgba(0,150,255,${oilCooldown > 0 ? 0.2 : 0.45})`;
      g.fillRect(0, BTN_TOP, W*0.28, BTN_H);
      g.fillStyle = `rgba(200,200,200,${smokeCooldown > 0 ? 0.2 : 0.45})`;
      g.fillRect(W*0.72, BTN_TOP, W*0.28, BTN_H);
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H*0.03)}px monospace`;
      g.textAlign = 'center';
      g.fillText('OIL', W*0.14, BTN_TOP + BTN_H * 0.5);
      g.fillText('SMOKE', W*0.86, BTN_TOP + BTN_H * 0.5);

      // HUD
      g.fillStyle = '#0ff';
      g.font = `bold ${Math.floor(H*0.032)}px monospace`;
      g.textAlign = 'left';
      g.fillText(`${score}`, 10, Math.floor(H*0.055));
      g.textAlign = 'right';
      g.fillStyle = '#aaa';
      g.fillText(`BEST:${hs}`, W-10, Math.floor(H*0.055));
      for (let i = 0; i < lives; i++) {
        g.fillStyle = '#0af';
        g.beginPath(); g.arc(W/2 + (i-1)*18, Math.floor(H*0.05), 6, 0, Math.PI*2); g.fill();
      }

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.78)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#0ff';
        g.font = `bold ${Math.floor(H*0.065)}px monospace`;
        g.textAlign = 'center';
        g.fillText('AGENT DOWN', W/2, H*0.4);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`SCORE: ${score}`, W/2, H*0.5);
        g.fillText(`BEST: ${hs}`, W/2, H*0.57);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.032)}px monospace`;
        g.fillText('TAP TO RESTART', W/2, H*0.67);
      }

      function drawRoad() {
        g.fillStyle = '#3a3a3a';
        g.fillRect(ROAD_LEFT, 0, ROAD_W, H);
        // edge strips
        g.fillStyle = '#c8a020';
        g.fillRect(ROAD_LEFT, 0, 5, H);
        g.fillRect(ROAD_RIGHT - 5, 0, 5, H);
        // center dashes
        const dash = H / 8;
        for (let dy = (scrollY % (dash*2)) - dash*2; dy < H; dy += dash*2) {
          g.fillStyle = 'rgba(255,255,255,0.3)';
          g.fillRect(W/2 - 2, dy, 4, dash);
        }
        // lane dashes
        for (let dy = (scrollY % (dash*2)) - dash*2; dy < H; dy += dash*2) {
          g.fillStyle = 'rgba(255,255,255,0.1)';
          g.fillRect(ROAD_LEFT + ROAD_W*0.33 - 2, dy, 3, dash*0.7);
          g.fillRect(ROAD_LEFT + ROAD_W*0.67 - 2, dy, 3, dash*0.7);
        }
      }

      function drawSimpleCar(cx, cy, cw, ch, color, enemy) {
        g.fillStyle = color;
        g.fillRect(cx - cw/2, cy - ch/2, cw, ch);
        if (enemy) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(cx - cw*0.35, cy - ch*0.45, cw*0.7, ch*0.38);
        } else {
          g.fillStyle = 'rgba(100,200,255,0.7)';
          g.fillRect(cx - cw*0.3, cy - ch*0.42, cw*0.6, ch*0.3);
        }
        g.fillStyle = '#111';
        [[-0.38,0.28],[0.28,0.28],[-0.42,-0.05],[0.32,-0.05]].forEach(([ox,oy]) => {
          g.fillRect(cx + ox*cw, cy + oy*ch, cw*0.14, ch*0.22);
        });
        // headlights
        if (!enemy) {
          g.fillStyle = '#ffffaa';
          g.fillRect(cx - cw*0.38, cy - ch/2 - 3, cw*0.12, 5);
          g.fillRect(cx + cw*0.26, cy - ch/2 - 3, cw*0.12, 5);
        }
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
