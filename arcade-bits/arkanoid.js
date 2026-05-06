window.plethoraBit = {
  meta: {
    title: 'Arkanoid',
    author: 'plethora',
    description: 'Break bricks with power-ups.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null;
    function initAudio() { if (!audioCtx) audioCtx = new AudioContext(); }
    function beep(freq, dur, type = 'sine', vol = 0.15) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function gameOverSound() { [300,250,200,150,100].forEach((f,i) => setTimeout(()=>beep(f,0.2,'sawtooth'),i*120)); }
    function scoreChime() { beep(880, 0.08, 'sine'); setTimeout(()=>beep(1100,0.08,'sine'),80); }

    const SAFE = ctx.safeArea.bottom;
    const ROWS = 8, BCOLS = 8;
    const BW = Math.floor(W * 0.9 / BCOLS), BH = Math.floor(H * 0.04);
    const BX0 = Math.floor((W - BCOLS*BW)/2);
    const BY0 = Math.floor(H * 0.1);
    const PRAD = Math.floor(W * 0.015);
    const PADDLE_H = Math.floor(H * 0.02);

    const BRICK_COLORS = ['#ff4444','#ff8844','#ffcc44','#88ff44','#44ffcc','#4488ff','#8844ff','#ff44cc'];
    const PWUP_TYPES = ['expand','laser','slow','multi'];
    const PWUP_COLORS = { expand:'#0ff', laser:'#f80', slow:'#0f8', multi:'#f0f' };

    let paddle, balls, bricks, pwups, lasers, score, lives, gameOver, started, hs;
    let laserActive = 0, expandActive = 0, slowActive = 0, laserTimer = 0;

    function makeBricks() {
      const b = [];
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < BCOLS; c++) {
          const hits = r < 2 ? 3 : r < 4 ? 2 : 1;
          b.push({ x: BX0 + c*BW, y: BY0 + r*BH, w: BW-2, h: BH-2, hits, maxHits: hits, alive: true,
                   pwup: Math.random() < 0.12 ? PWUP_TYPES[Math.floor(Math.random()*4)] : null });
        }
      return b;
    }

    function reset() {
      const PW = W * 0.18 + (expandActive > 0 ? W*0.08 : 0);
      paddle = { x: W/2 - PW/2, y: H - SAFE - 60, w: PW, h: PADDLE_H };
      balls = [{ x: W/2, y: H - SAFE - 80, vx: (Math.random()*2-1)*3, vy: -5, r: PRAD }];
      bricks = makeBricks();
      pwups = []; lasers = [];
      score = 0; lives = 3; gameOver = false; started = false;
      laserActive = 0; expandActive = 0; slowActive = 0;
    }

    hs = ctx.storage.get('hs_arkanoid') || 0;
    reset();

    let dragX = null;

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }
      dragX = t.clientX;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', e => {
      e.preventDefault();
      if (!started || gameOver) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - dragX;
      dragX = t.clientX;
      paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x + dx));
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      dragX = null;
    }, { passive: false });

    function fireLaser() {
      if (laserActive <= 0) return;
      lasers.push({ x: paddle.x + paddle.w*0.25, y: paddle.y, vy: -12 });
      lasers.push({ x: paddle.x + paddle.w*0.75, y: paddle.y, vy: -12 });
      beep(600, 0.1, 'square', 0.1);
    }

    ctx.interval(() => { if (laserActive > 0) fireLaser(); }, 400);

    function applyPwup(type) {
      if (type === 'expand') { expandActive = 500; paddle.w = W * 0.26; scoreChime(); }
      if (type === 'laser') { laserActive = 500; beep(700, 0.1, 'sawtooth'); }
      if (type === 'slow') { slowActive = 500; beep(400, 0.15, 'sine'); }
      if (type === 'multi') {
        const b = balls[0] || { x:W/2, y:H - SAFE - 80, r: PRAD };
        balls.push({ x:b.x, y:b.y, vx:b.vx+2, vy:b.vy, r:PRAD });
        balls.push({ x:b.x, y:b.y, vx:b.vx-2, vy:b.vy, r:PRAD });
        scoreChime();
      }
    }

    ctx.raf(dt => {
      const spd = dt / 16;
      g.fillStyle = '#000814';
      g.fillRect(0, 0, W, H);

      if (!started) {
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.06)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('ARKANOID', W/2, H*0.38);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.032)}px sans-serif`;
        g.fillText('DRAG PADDLE TO PLAY', W/2, H*0.48);
        g.fillText(`BEST: ${hs}`, W/2, H*0.55);
        // draw paddle preview
        g.fillStyle = '#4ff';
        g.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
        // draw ball
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(W/2, H - SAFE - 100, PRAD, 0, Math.PI*2); g.fill();
        return;
      }

      if (!gameOver) {
        if (expandActive > 0) { expandActive -= dt; if (expandActive <= 0) { paddle.w = W*0.18; } }
        if (laserActive > 0) laserActive -= dt;
        if (slowActive > 0) slowActive -= dt;

        const slowMult = slowActive > 0 ? 0.5 : 1;

        // update balls
        for (let i = balls.length - 1; i >= 0; i--) {
          const b = balls[i];
          b.x += b.vx * spd * slowMult;
          b.y += b.vy * spd * slowMult;

          if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); beep(200,0.03); }
          if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); beep(200,0.03); }
          if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); beep(200,0.03); }

          // paddle collision
          if (b.y + b.r >= paddle.y && b.y + b.r <= paddle.y + paddle.h + Math.abs(b.vy)*2
              && b.x >= paddle.x && b.x <= paddle.x + paddle.w && b.vy > 0) {
            b.vy = -Math.abs(b.vy);
            const rel = (b.x - (paddle.x + paddle.w/2)) / (paddle.w/2);
            b.vx = rel * 6;
            beep(300, 0.04, 'square');
          }

          // brick collision
          for (const br of bricks) {
            if (!br.alive) continue;
            if (b.x+b.r > br.x && b.x-b.r < br.x+br.w && b.y+b.r > br.y && b.y-b.r < br.y+br.h) {
              br.hits--;
              if (br.hits <= 0) {
                br.alive = false;
                score += 10 * br.maxHits;
                ctx.platform.setScore(score);
                if (score > hs) { hs = score; ctx.storage.set('hs_arkanoid', hs); }
                if (br.pwup) pwups.push({ x: br.x + br.w/2, y: br.y, type: br.pwup, vy: 3 });
                beep(440, 0.06, 'square', 0.2);
              } else {
                beep(220, 0.04, 'sine');
              }
              const fromLeft = Math.abs(b.x+b.r - br.x), fromRight = Math.abs(b.x-b.r - (br.x+br.w));
              const fromTop = Math.abs(b.y+b.r - br.y), fromBot = Math.abs(b.y-b.r - (br.y+br.h));
              const minH = Math.min(fromLeft, fromRight), minV = Math.min(fromTop, fromBot);
              if (minV < minH) b.vy = -b.vy; else b.vx = -b.vx;
              break;
            }
          }

          if (b.y - b.r > H) {
            balls.splice(i, 1);
            if (balls.length === 0) {
              lives--;
              if (lives <= 0) {
                gameOver = true; gameOverSound();
                ctx.platform.fail({ reason: 'no lives' });
              } else {
                balls.push({ x: paddle.x + paddle.w/2, y: paddle.y - PRAD*2, vx: (Math.random()*2-1)*3, vy: -5, r: PRAD });
                beep(150, 0.3, 'sawtooth');
              }
            }
          }
        }

        // lasers
        for (let i = lasers.length - 1; i >= 0; i--) {
          lasers[i].y += lasers[i].vy * spd;
          if (lasers[i].y < 0) { lasers.splice(i, 1); continue; }
          let hit = false;
          for (const br of bricks) {
            if (!br.alive) continue;
            if (lasers[i] && lasers[i].x > br.x && lasers[i].x < br.x+br.w && lasers[i].y > br.y && lasers[i].y < br.y+br.h) {
              br.hits--; hit = true;
              if (br.hits <= 0) { br.alive = false; score += 10*br.maxHits; if (br.pwup) pwups.push({x:br.x+br.w/2,y:br.y,type:br.pwup,vy:3}); }
              lasers.splice(i, 1); break;
            }
          }
        }

        // power-ups
        for (let i = pwups.length - 1; i >= 0; i--) {
          pwups[i].y += pwups[i].vy * spd;
          if (pwups[i].y > H) { pwups.splice(i, 1); continue; }
          if (pwups[i].y + 10 > paddle.y && pwups[i].x > paddle.x && pwups[i].x < paddle.x+paddle.w) {
            applyPwup(pwups[i].type); pwups.splice(i, 1);
            ctx.platform.haptic('light');
          }
        }

        if (bricks.every(b => !b.alive)) {
          bricks = makeBricks();
          balls = [{ x: W/2, y: H - SAFE - 80, vx: (Math.random()*2-1)*3, vy: -5, r: PRAD }];
          scoreChime(); beep(1200, 0.2, 'sine', 0.2);
        }
      }

      // DRAW
      // bricks
      bricks.forEach((br, idx) => {
        if (!br.alive) return;
        const row = Math.floor(idx / BCOLS);
        const alpha = 0.4 + 0.6 * (br.hits / br.maxHits);
        g.globalAlpha = alpha;
        g.fillStyle = BRICK_COLORS[row % BRICK_COLORS.length];
        g.fillRect(br.x, br.y, br.w, br.h);
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(br.x, br.y, br.w, 3);
        g.globalAlpha = 1;
        if (br.pwup) {
          g.fillStyle = PWUP_COLORS[br.pwup];
          g.fillRect(br.x+br.w-6, br.y+2, 4, 4);
        }
      });

      // power-ups falling
      pwups.forEach(p => {
        g.fillStyle = PWUP_COLORS[p.type];
        g.beginPath(); g.arc(p.x, p.y, 8, 0, Math.PI*2); g.fill();
        g.fillStyle = '#000';
        g.font = '8px sans-serif'; g.textAlign = 'center';
        g.fillText(p.type[0].toUpperCase(), p.x, p.y+3);
      });

      // lasers
      g.fillStyle = '#f80';
      lasers.forEach(l => g.fillRect(l.x-2, l.y, 4, 14));

      // paddle
      const pgrd = g.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y+paddle.h);
      pgrd.addColorStop(0, laserActive > 0 ? '#ff8' : expandActive > 0 ? '#0ff' : '#4af');
      pgrd.addColorStop(1, laserActive > 0 ? '#f80' : expandActive > 0 ? '#08f' : '#048');
      g.fillStyle = pgrd;
      g.beginPath();
      g.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, paddle.h/2);
      g.fill();

      // balls
      balls.forEach(b => {
        const bgrd = g.createRadialGradient(b.x-b.r*0.3, b.y-b.r*0.3, b.r*0.1, b.x, b.y, b.r);
        bgrd.addColorStop(0, '#fff');
        bgrd.addColorStop(1, '#8af');
        g.fillStyle = bgrd;
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI*2); g.fill();
      });

      // HUD
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H*0.03)}px monospace`;
      g.textAlign = 'left';
      g.fillText(`${score}`, 10, Math.floor(H*0.055));
      g.textAlign = 'right';
      g.fillText(`BEST:${hs}`, W-10, Math.floor(H*0.055));
      for (let i = 0; i < lives; i++) {
        g.fillStyle = '#f44';
        g.beginPath(); g.arc(W/2 + (i-1)*18, Math.floor(H*0.05), 5, 0, Math.PI*2); g.fill();
      }

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f44';
        g.font = `bold ${Math.floor(H*0.07)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('GAME OVER', W/2, H*0.42);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`SCORE: ${score}`, W/2, H*0.52);
        g.fillText(`BEST: ${hs}`, W/2, H*0.59);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.033)}px sans-serif`;
        g.fillText('TAP TO RESTART', W/2, H*0.68);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
