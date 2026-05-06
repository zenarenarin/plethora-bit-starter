window.plethoraBit = {
  meta: {
    title: 'BurgerTime',
    author: 'plethora',
    description: 'Drop burgers, squish enemies!',
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
    function stepSound() { beep(300 + Math.random()*100, 0.03, 'square', 0.07); }
    function dropSound() { beep(200, 0.1, 'sawtooth', 0.15); }
    function squishSound() { [300,200,100].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'sawtooth',0.15),i*60)); }
    function pepperSound() { beep(700, 0.1, 'sine', 0.12); }
    function completeSound() { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'sine'),i*80)); }
    function gameOverSound() { [400,300,200,100].forEach((f,i)=>setTimeout(()=>beep(f,0.22,'sawtooth',0.18),i*130)); }

    const FLOORS = 5;
    const FLOOR_H = H * 0.14;
    const FLOOR_Y = Array.from({length: FLOORS}, (_,i) => H*0.16 + i * FLOOR_H);
    const CHEF_W = W * 0.07, CHEF_H = H * 0.065;
    const PLAT_W = W * 0.35;

    // Platforms per floor: each floor has 2-3 platforms
    const PLATFORMS = [
      [{ x: W*0.05, w: W*0.35 }, { x: W*0.55, w: W*0.4 }],
      [{ x: W*0.0,  w: W*0.25 }, { x: W*0.35, w: W*0.3 }, { x: W*0.75, w: W*0.25 }],
      [{ x: W*0.08, w: W*0.4  }, { x: W*0.58, w: W*0.38 }],
      [{ x: W*0.0,  w: W*0.3  }, { x: W*0.4, w: W*0.25 }, { x: W*0.72, w: W*0.28 }],
      [{ x: W*0.1,  w: W*0.8  }],
    ];

    // Ladders connect floors
    const LADDERS = [
      { x: W*0.38, f1: 0, f2: 1 },
      { x: W*0.7,  f1: 0, f2: 1 },
      { x: W*0.25, f1: 1, f2: 2 },
      { x: W*0.65, f1: 1, f2: 2 },
      { x: W*0.45, f1: 2, f2: 3 },
      { x: W*0.72, f1: 2, f2: 3 },
      { x: W*0.18, f1: 3, f2: 4 },
      { x: W*0.55, f1: 3, f2: 4 },
    ];

    // Burger ingredients: top bun, patty, lettuce, tomato, patty, bottom bun
    const INGR_TYPES = ['bun-top','patty','lettuce','tomato','patty','bun-bot'];
    const INGR_COLORS = { 'bun-top':'#c87800','patty':'#6a3200','lettuce':'#44bb44','tomato':'#ee3322','bun-bot':'#c87800' };

    let chef, enemies, ingredients, peppers, score, lives, gameOver, started, hs, level;
    let ingredientsLeft, touchX, touchY, pepperCooldown;

    function buildIngredients() {
      return INGR_TYPES.map((type, i) => {
        const floor = Math.floor(i * FLOORS / INGR_TYPES.length);
        const plats = PLATFORMS[floor];
        const plat = plats[Math.floor(Math.random()*plats.length)];
        return {
          type, floor, x: plat.x + plat.w*0.3 + Math.random()*plat.w*0.3,
          y: FLOOR_Y[floor] - H*0.025,
          falling: false, fallSpeed: 0, walkCount: 0, landed: false, bounceTimer: 0
        };
      });
    }

    function spawnEnemy() {
      const type = ['hotdog','egg','pickle'][Math.floor(Math.random()*3)];
      const floor = Math.floor(Math.random()*(FLOORS-1));
      const side = Math.random() < 0.5 ? 0 : W;
      return { type, floor, x: side, y: FLOOR_Y[floor] - CHEF_H*0.5,
               vx: side === 0 ? 1.2+level*0.2 : -(1.2+level*0.2), vy: 0, stunTimer: 0 };
    }

    function reset() {
      chef = { x: W*0.15, floor: 0, y: FLOOR_Y[0] - CHEF_H, vx: 0, vy: 0, onLadder: false, ladderX: 0, facing: 1 };
      enemies = [spawnEnemy(), spawnEnemy()];
      ingredients = buildIngredients();
      peppers = []; score = 0; lives = 3; level = 0;
      gameOver = false; started = false;
      ingredientsLeft = INGR_TYPES.length;
      touchX = null; touchY = null; pepperCooldown = 0;
    }

    const SAFE = ctx.safeArea.bottom;
    hs = ctx.storage.get('hs_burgertime') || 0;
    reset();

    let tapX = null, tapY2 = null;

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      tapX = t.clientX; tapY2 = t.clientY;
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }
      touchX = t.clientX; touchY = t.clientY;
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', e => {
      e.preventDefault();
      touchX = e.changedTouches[0].clientX;
      touchY = e.changedTouches[0].clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      // Pepper button in bottom right
      const t = e.changedTouches[0];
      if (t.clientX > W*0.75 && t.clientY > H - SAFE - H*0.15 && pepperCooldown <= 0) {
        peppers.push({ x: chef.x + chef.facing*CHEF_W, y: chef.y, vx: chef.facing*5, vy: 0, ttl: 30 });
        pepperSound();
        ctx.platform.haptic('light');
        pepperCooldown = 120;
      }
      touchX = null; touchY = null;
    }, { passive: false });

    ctx.raf(dt => {
      const spd = dt / 16;
      g.fillStyle = '#111';
      g.fillRect(0, 0, W, H);

      if (!started) {
        drawLevel();
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f84';
        g.font = `bold ${Math.floor(H*0.065)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('BurgerTime', W/2, H*0.32);
        g.fillStyle = '#eee';
        g.font = `${Math.floor(H*0.03)}px sans-serif`;
        g.fillText('DRAG TO WALK & CLIMB', W/2, H*0.42);
        g.fillText('PEPPER BUTTON → STUN', W/2, H*0.48);
        g.fillText(`BEST: ${hs}`, W/2, H*0.57);
        return;
      }

      if (!gameOver) {
        // Chef movement
        if (touchX !== null) {
          const dx = touchX - chef.x;
          const dy = touchY - chef.y;

          // check nearby ladder
          const nearLadder = LADDERS.find(l => Math.abs(chef.x - l.x) < W*0.06 &&
            ((l.f1 === chef.floor && dy < -H*0.03) || (l.f2 === chef.floor && dy > H*0.03)));

          if (nearLadder && Math.abs(dy) > Math.abs(dx)) {
            // climb
            chef.onLadder = true; chef.ladderX = nearLadder.x;
            chef.x = nearLadder.x;
            chef.y += Math.sign(dy) * 2.5 * spd;
            const f1y = FLOOR_Y[nearLadder.f1] - CHEF_H;
            const f2y = FLOOR_Y[nearLadder.f2] - CHEF_H;
            if (chef.y <= f2y) { chef.y = f2y; chef.floor = nearLadder.f2; chef.onLadder = false; }
            if (chef.y >= f1y) { chef.y = f1y; chef.floor = nearLadder.f1; chef.onLadder = false; }
            if ((Date.now() % 300) < 150) stepSound();
          } else if (Math.abs(dx) > 15) {
            chef.onLadder = false;
            const dir = Math.sign(dx);
            chef.facing = dir;
            chef.x += dir * 2.8 * spd;
            chef.x = Math.max(0, Math.min(W - CHEF_W, chef.x));
            chef.y = FLOOR_Y[chef.floor] - CHEF_H;

            // walk over ingredient
            for (const ingr of ingredients) {
              if (!ingr.falling && !ingr.landed && ingr.floor === chef.floor &&
                  Math.abs(chef.x - ingr.x) < W*0.06) {
                ingr.walkCount++;
                if (ingr.walkCount >= 20) {
                  ingr.falling = true; ingr.fallSpeed = 2;
                  dropSound();
                }
              }
            }
            if ((Date.now() % 200) < 100) stepSound();
          }
        }

        // ingredients fall
        for (const ingr of ingredients) {
          if (ingr.falling) {
            ingr.fallSpeed += 0.3 * spd;
            ingr.y += ingr.fallSpeed * spd;

            // check floor
            for (let f = ingr.floor + 1; f < FLOORS; f++) {
              if (ingr.y >= FLOOR_Y[f] - H*0.025) {
                ingr.y = FLOOR_Y[f] - H*0.025;
                ingr.floor = f;
                ingr.falling = false;
                ingr.fallSpeed = 0;
                ingr.bounceTimer = 10;
                // squish enemies
                for (const en of enemies) {
                  if (en.floor === f && Math.abs(en.x - ingr.x) < W*0.12) {
                    en.stunTimer = 200; squishSound();
                    score += 200; ctx.platform.setScore(score);
                    if (score > hs) { hs = score; ctx.storage.set('hs_burgertime', hs); }
                    ctx.platform.haptic('medium');
                  }
                }
                break;
              }
            }
            if (ingr.y > H*0.95) {
              ingr.y = H*0.92; ingr.falling = false; ingr.landed = true;
              ingredientsLeft--;
              score += 50;
              beep(600, 0.08, 'sine');
            }
          }
          if (ingr.bounceTimer > 0) ingr.bounceTimer -= spd;
        }

        // enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
          const en = enemies[i];
          if (en.stunTimer > 0) { en.stunTimer -= dt; continue; }

          // chase chef (simplified)
          const dxE = chef.x - en.x;
          en.x += Math.sign(dxE) * (1.2 + level*0.15) * spd;
          en.x = Math.max(0, Math.min(W, en.x));

          // collision
          if (en.floor === chef.floor && Math.abs(en.x - chef.x) < CHEF_W && Math.abs(en.y - chef.y) < CHEF_H) {
            lives--;
            ctx.platform.haptic('heavy');
            gameOverSound();
            if (lives <= 0) { gameOver = true; ctx.platform.fail({ reason: 'caught' }); }
            else {
              chef = { x: W*0.15, floor: 0, y: FLOOR_Y[0]-CHEF_H, vx:0, vy:0, onLadder:false, ladderX:0, facing:1 };
              enemies.splice(i, 1);
            }
          }
        }

        // peppers
        for (let i = peppers.length-1; i>=0; i--) {
          peppers[i].x += peppers[i].vx * spd;
          peppers[i].ttl -= spd;
          if (peppers[i].ttl <= 0) { peppers.splice(i, 1); continue; }
          for (const en of enemies) {
            if (Math.abs(en.x - peppers[i].x) < W*0.08 && en.floor === chef.floor) {
              en.stunTimer = 2000; peppers.splice(i, 1); break;
            }
          }
        }

        if (pepperCooldown > 0) pepperCooldown -= spd;

        // spawn more enemies
        if (enemies.length < 2 + level) enemies.push(spawnEnemy());

        // level complete
        if (ingredientsLeft <= 0) {
          level++;
          completeSound();
          ctx.platform.haptic('heavy');
          score += 1000;
          ingredients = buildIngredients();
          ingredientsLeft = INGR_TYPES.length;
          enemies = [spawnEnemy()];
        }
      }

      drawLevel();

      // draw ingredients
      ingredients.forEach(ingr => {
        const iy = ingr.y + (ingr.bounceTimer > 0 ? Math.sin(ingr.bounceTimer*0.5)*6 : 0);
        g.fillStyle = INGR_COLORS[ingr.type] || '#888';
        g.fillRect(ingr.x - W*0.09, iy, W*0.18, H*0.025);
        // details
        if (ingr.type === 'bun-top') {
          g.fillStyle = 'rgba(255,200,100,0.4)';
          g.fillRect(ingr.x - W*0.07, iy + H*0.003, W*0.14, H*0.008);
        } else if (ingr.type === 'lettuce') {
          for (let lx = 0; lx < 5; lx++) {
            g.fillStyle = '#66dd66';
            g.beginPath(); g.arc(ingr.x - W*0.06 + lx*W*0.03, iy, H*0.012, 0, Math.PI*2); g.fill();
          }
        }
        // walk progress bar
        if (!ingr.falling && !ingr.landed) {
          const pct = ingr.walkCount / 20;
          g.fillStyle = 'rgba(255,255,0,0.5)';
          g.fillRect(ingr.x - W*0.09, iy - 4, W*0.18 * pct, 3);
        }
      });

      // draw enemies
      const EN_COLORS = { hotdog:'#e86030', egg:'#ffffcc', pickle:'#44aa44' };
      enemies.forEach(en => {
        const ey = FLOOR_Y[en.floor] - CHEF_H*0.8;
        const stunned = en.stunTimer > 0;
        g.fillStyle = stunned ? '#88f' : (EN_COLORS[en.type] || '#f44');
        g.fillRect(en.x - CHEF_W*0.6, ey, CHEF_W*1.2, CHEF_H*0.8);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(CHEF_W*0.8)}px sans-serif`;
        g.textAlign = 'center';
        const emojis = { hotdog:'🌭', egg:'🥚', pickle:'🥒' };
        g.fillText(stunned ? '💫' : (en.type[0].toUpperCase()), en.x, ey + CHEF_H*0.7);
        if (stunned) {
          g.fillStyle = '#ff0';
          g.font = `${Math.floor(CHEF_W*0.6)}px sans-serif`;
          g.fillText('★', en.x, ey - 5);
        }
      });

      // peppers
      peppers.forEach(p => {
        g.fillStyle = '#ff0';
        g.font = `${Math.floor(W*0.06)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('✦', p.x, chef.y);
      });

      // chef
      drawChef(chef.x, chef.y, chef.facing);

      // pepper button
      g.fillStyle = `rgba(255,100,0,${pepperCooldown > 0 ? 0.25 : 0.55})`;
      const pepBtnY = H - SAFE - H*0.1;
      g.beginPath(); g.arc(W*0.88, pepBtnY, H*0.04, 0, Math.PI*2); g.fill();
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H*0.028)}px monospace`;
      g.textAlign = 'center';
      g.fillText('PEPPER', W*0.88, pepBtnY + 4);

      // HUD
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H*0.032)}px monospace`;
      g.textAlign = 'left';
      g.fillText(`${score}`, 10, Math.floor(H*0.055));
      g.textAlign = 'right';
      g.fillText(`BEST:${hs}  LV${level+1}`, W-10, Math.floor(H*0.055));
      for (let i = 0; i < lives; i++) {
        g.fillStyle = '#f84';
        g.beginPath(); g.arc(W/2 + (i-1)*18, Math.floor(H*0.05), 6, 0, Math.PI*2); g.fill();
      }
      // ingredient progress
      const rem = ingredients.filter(i => !i.landed).length;
      g.fillStyle = '#aaa';
      g.font = `${Math.floor(H*0.025)}px monospace`;
      g.textAlign = 'center';
      g.fillText(`${rem} left`, W/2, H*0.085);

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f84';
        g.font = `bold ${Math.floor(H*0.065)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('GAME OVER', W/2, H*0.38);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`SCORE: ${score}`, W/2, H*0.48);
        g.fillText(`BEST: ${hs}`, W/2, H*0.55);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.033)}px monospace`;
        g.fillText('TAP TO RESTART', W/2, H*0.65);
      }

      function drawLevel() {
        // platforms
        PLATFORMS.forEach((plats, fi) => {
          plats.forEach(plat => {
            g.fillStyle = '#4455aa';
            g.fillRect(plat.x, FLOOR_Y[fi] - 4, plat.w, 8);
            g.fillStyle = '#6677cc';
            g.fillRect(plat.x, FLOOR_Y[fi] - 4, plat.w, 3);
          });
        });
        // ladders
        LADDERS.forEach(l => {
          const y1 = FLOOR_Y[l.f1], y2 = FLOOR_Y[l.f2];
          g.fillStyle = '#886644';
          g.fillRect(l.x - 3, y2, 6, y1 - y2);
          for (let ry = y2; ry < y1; ry += 12) {
            g.fillStyle = '#aa8855';
            g.fillRect(l.x - W*0.025, ry, W*0.05, 4);
          }
        });
        // ground
        g.fillStyle = '#333';
        g.fillRect(0, H - SAFE - H*0.07, W, H*0.07 + SAFE);
      }

      function drawChef(cx, cy, facing) {
        // hat
        g.fillStyle = '#fff';
        g.fillRect(cx - CHEF_W*0.35, cy - CHEF_H*0.25, CHEF_W*0.7, CHEF_H*0.22);
        g.fillRect(cx - CHEF_W*0.25, cy - CHEF_H*0.5, CHEF_W*0.5, CHEF_H*0.28);
        // body
        g.fillStyle = '#eee';
        g.fillRect(cx - CHEF_W*0.35, cy, CHEF_W*0.7, CHEF_H*0.75);
        // face
        g.fillStyle = '#ffcc99';
        g.fillRect(cx - CHEF_W*0.22, cy - CHEF_H*0.02, CHEF_W*0.44, CHEF_H*0.28);
        // arms
        g.fillStyle = '#eee';
        g.fillRect(cx + facing*CHEF_W*0.25, cy + CHEF_H*0.1, CHEF_W*0.35, CHEF_H*0.2);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
