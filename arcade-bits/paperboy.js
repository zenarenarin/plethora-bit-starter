window.plethoraBit = {
  meta: {
    title: 'Paperboy',
    author: 'plethora',
    description: 'Deliver papers, dodge obstacles!',
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
    function throwSound() { beep(500, 0.06, 'square', 0.1); }
    function hitSound() { beep(800, 0.08, 'sine'); setTimeout(()=>beep(600,0.08,'sine'),80); }
    function missSound() { beep(200, 0.15, 'sawtooth', 0.15); }
    function crashSound() { [400,250,150].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'sawtooth',0.2),i*80)); }
    function gameOverSound() { [300,220,160,100].forEach((f,i)=>setTimeout(()=>beep(f,0.25,'sawtooth',0.18),i*140)); }

    const BIKE_X = W * 0.35;
    const BIKE_Y_BASE = H * 0.62;
    const HOUSE_W = W * 0.22, HOUSE_H = H * 0.18;
    const ROAD_TOP = H * 0.45, ROAD_BOT = H * 0.85;
    const MAILBOX_Y = H * 0.58;

    let scrollY, speed, score, lives, gameOver, started, hs;
    let papers, houses, obstacles, bikeY, bikeVY;
    let lastTouchX, lastTouchY, throwCooldown;

    function reset() {
      scrollY = 0; speed = 2; score = 0; lives = 3;
      gameOver = false; started = false;
      papers = []; obstacles = [];
      bikeY = BIKE_Y_BASE; bikeVY = 0;
      throwCooldown = 0; lastTouchX = null; lastTouchY = null;
      houses = genHouses();
    }

    function genHouses() {
      const out = [];
      for (let i = 0; i < 30; i++) {
        const sub = Math.random() < 0.65;
        out.push({
          id: i, y: -i * H * 0.22, subscriber: sub,
          delivered: false, hit: false,
          color: `hsl(${Math.floor(Math.random()*360)},40%,55%)`,
          roofColor: `hsl(${Math.floor(Math.random()*360)},50%,35%)`
        });
      }
      return out;
    }

    function genObstacles() {
      // cars, dogs, people
      return [
        { x: W*0.4 + Math.random()*W*0.25, y: -Math.random()*H*0.5 - H*0.5,
          type: ['car','dog','person'][Math.floor(Math.random()*3)],
          vx: (Math.random()-0.5)*2, vy: 1+Math.random()*2, w:W*0.09, h:H*0.06 }
      ];
    }

    hs = ctx.storage.get('hs_paperboy') || 0;
    reset();

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }
      lastTouchX = t.clientX; lastTouchY = t.clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (!started || gameOver) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - (lastTouchX || t.clientX);
      const dy = t.clientY - (lastTouchY || t.clientY);

      // swipe left = throw left, swipe right = throw right, swipe up = dodge
      if (Math.abs(dy) > 30 && dy < 0) {
        bikeVY = -4; // dodge up
      } else if (Math.abs(dx) > 20) {
        if (throwCooldown <= 0) {
          const dir = dx < 0 ? -1 : 1;
          papers.push({ x: BIKE_X, y: bikeY - H*0.03, vx: dir * 6, vy: -3, r: W*0.02, landed: false });
          throwSound();
          throwCooldown = 15;
          ctx.platform.interact({ type: 'throw' });
        }
      }
      lastTouchX = null; lastTouchY = null;
    }, { passive: false });

    let obSpawnTimer = 0;

    ctx.raf(dt => {
      const spd = dt / 16;
      g.fillStyle = '#7ab';
      g.fillRect(0, 0, W, H);

      if (!started) {
        drawBackground();
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.065)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('PAPERBOY', W/2, H*0.35);
        g.fillStyle = '#eee';
        g.font = `${Math.floor(H*0.03)}px sans-serif`;
        g.fillText('SWIPE LEFT/RIGHT TO THROW', W/2, H*0.46);
        g.fillText('SWIPE UP TO DODGE', W/2, H*0.52);
        g.fillText(`BEST: ${hs}`, W/2, H*0.6);
        return;
      }

      if (!gameOver) {
        scrollY += speed * spd;
        speed = 2 + score * 0.008;
        if (throwCooldown > 0) throwCooldown -= spd;

        // bike physics
        bikeVY += 0.3 * spd;
        bikeY += bikeVY * spd;
        bikeY = Math.min(BIKE_Y_BASE + H*0.04, Math.max(BIKE_Y_BASE - H*0.1, bikeY));
        if (bikeY >= BIKE_Y_BASE) { bikeY = BIKE_Y_BASE; bikeVY = 0; }

        // move papers
        for (let i = papers.length - 1; i >= 0; i--) {
          const p = papers[i];
          p.x += p.vx * spd; p.y += p.vy * spd; p.vy += 0.2 * spd;
          if (p.y > H * 0.65) { p.landed = true; }

          if (p.landed || p.x < 0 || p.x > W || p.y > H) {
            // check if landed on a mailbox
            let scored = false;
            for (const h of houses) {
              const wy = h.y + scrollY;
              const mx = W * 0.215;
              if (wy > MAILBOX_Y - H*0.04 && wy < MAILBOX_Y + H*0.04 && !h.delivered) {
                if (Math.abs(p.x - mx) < W*0.07) {
                  h.delivered = true;
                  if (h.subscriber) { score += 10; hitSound(); ctx.platform.haptic('light'); }
                  else { score -= 5; missSound(); }
                  ctx.platform.setScore(score);
                  if (score > hs) { hs = score; ctx.storage.set('hs_paperboy', hs); }
                  scored = true; break;
                }
              }
            }
            papers.splice(i, 1);
          }
        }

        // spawn obstacles
        obSpawnTimer += dt;
        if (obSpawnTimer > Math.max(800, 2000 - score*10)) {
          obSpawnTimer = 0;
          obstacles.push({ x: W*0.3+Math.random()*W*0.35, y: -H*0.1,
            type: ['car','dog','person'][Math.floor(Math.random()*3)],
            vx:(Math.random()-0.5)*1.5, vy:speed*0.7+Math.random()*2, w:W*0.1, h:H*0.07 });
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
          const ob = obstacles[i];
          ob.y += ob.vy * spd; ob.x += ob.vx * spd;
          if (ob.y > H) { obstacles.splice(i, 1); continue; }

          // collision with bike
          if (Math.abs(ob.x - BIKE_X) < ob.w*0.7 && Math.abs(ob.y - bikeY) < ob.h*0.8) {
            obstacles.splice(i, 1);
            lives--;
            crashSound();
            ctx.platform.haptic('heavy');
            if (lives <= 0) {
              gameOver = true;
              gameOverSound();
              ctx.platform.fail({ reason: 'crashed' });
            }
          }
        }

        // check missed subscribers
        for (const h of houses) {
          const wy = h.y + scrollY;
          if (wy > H*0.7 && !h.delivered && h.subscriber && !h.hit) {
            h.hit = true;
            score = Math.max(0, score - 3);
          }
        }
      }

      drawBackground();
      drawHouses();
      drawObstacles();
      drawPapers();
      drawBike();
      drawHUD();

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f84';
        g.font = `bold ${Math.floor(H*0.065)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('ROUTE OVER', W/2, H*0.4);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`SCORE: ${score}`, W/2, H*0.5);
        g.fillText(`BEST: ${hs}`, W/2, H*0.57);
        g.fillStyle = '#ccc';
        g.font = `${Math.floor(H*0.033)}px monospace`;
        g.fillText('TAP TO RESTART', W/2, H*0.67);
      }

      function drawBackground() {
        // sky
        const sky = g.createLinearGradient(0, 0, 0, ROAD_TOP);
        sky.addColorStop(0, '#4488cc'); sky.addColorStop(1, '#88bbee');
        g.fillStyle = sky; g.fillRect(0, 0, W, ROAD_TOP);

        // sidewalk (left)
        g.fillStyle = '#c8b89a';
        g.fillRect(0, ROAD_TOP, W*0.28, ROAD_BOT - ROAD_TOP);

        // road
        g.fillStyle = '#555';
        g.fillRect(W*0.28, ROAD_TOP, W*0.72, ROAD_BOT - ROAD_TOP);

        // road lines
        const lineY0 = ROAD_TOP + (scrollY % 40) * ((ROAD_BOT - ROAD_TOP) / 100);
        for (let ly = lineY0; ly < ROAD_BOT; ly += (ROAD_BOT-ROAD_TOP)/8) {
          g.fillStyle = 'rgba(255,255,255,0.3)';
          g.fillRect(W*0.55, ly, W*0.02, (ROAD_BOT-ROAD_TOP)/16);
        }

        // curb
        g.fillStyle = '#888';
        g.fillRect(W*0.27, ROAD_TOP, 4, ROAD_BOT - ROAD_TOP);

        // lawn (right side background)
        g.fillStyle = '#5a8a3a';
        g.fillRect(W*0.82, ROAD_TOP, W*0.18, ROAD_BOT - ROAD_TOP);

        // ground beyond
        g.fillStyle = '#4a7a2a';
        g.fillRect(0, ROAD_BOT, W, H - ROAD_BOT);
      }

      function drawHouses() {
        houses.forEach(h => {
          const wy = h.y + scrollY;
          if (wy < -HOUSE_H || wy > H + HOUSE_H) return;
          const hx = W * 0.01, hy = wy - HOUSE_H;

          // house body
          g.fillStyle = h.color;
          g.fillRect(hx, hy, HOUSE_W, HOUSE_H);

          // roof
          g.fillStyle = h.roofColor;
          g.beginPath();
          g.moveTo(hx - HOUSE_W*0.05, hy);
          g.lineTo(hx + HOUSE_W/2, hy - HOUSE_H*0.45);
          g.lineTo(hx + HOUSE_W*1.05, hy);
          g.closePath(); g.fill();

          // door
          g.fillStyle = '#663300';
          g.fillRect(hx + HOUSE_W*0.38, hy + HOUSE_H*0.55, HOUSE_W*0.24, HOUSE_H*0.45);

          // window
          g.fillStyle = 'rgba(150,200,255,0.8)';
          g.fillRect(hx + HOUSE_W*0.1, hy + HOUSE_H*0.25, HOUSE_W*0.25, HOUSE_H*0.25);

          // subscriber indicator
          if (h.subscriber) {
            g.fillStyle = h.delivered ? '#0f0' : '#ff0';
            g.font = `${Math.floor(H*0.025)}px monospace`;
            g.textAlign = 'center';
            g.fillText('★', hx + HOUSE_W/2, hy - HOUSE_H*0.5);
          }

          // mailbox
          const mx = W * 0.215;
          g.fillStyle = '#888';
          g.fillRect(mx - W*0.015, wy - H*0.055, W*0.03, H*0.035);
          g.fillStyle = '#aaa';
          g.fillRect(mx - W*0.02, wy - H*0.065, W*0.04, H*0.02);
        });
      }

      function drawObstacles() {
        obstacles.forEach(ob => {
          const COLORS = { car:'#e44', dog:'#c84', person:'#f9c' };
          g.fillStyle = COLORS[ob.type] || '#f00';
          if (ob.type === 'car') {
            g.fillRect(ob.x - ob.w/2, ob.y - ob.h, ob.w, ob.h);
            g.fillStyle = '#adf';
            g.fillRect(ob.x - ob.w*0.35, ob.y - ob.h*0.85, ob.w*0.7, ob.h*0.35);
          } else if (ob.type === 'dog') {
            g.fillRect(ob.x - ob.w/2, ob.y - ob.h*0.4, ob.w, ob.h*0.4);
            g.beginPath(); g.arc(ob.x + ob.w*0.3, ob.y - ob.h*0.5, ob.h*0.25, 0, Math.PI*2); g.fill();
          } else {
            g.fillRect(ob.x - ob.w*0.2, ob.y - ob.h, ob.w*0.4, ob.h);
            g.fillStyle = '#f9c';
            g.beginPath(); g.arc(ob.x, ob.y - ob.h*1.15, ob.h*0.22, 0, Math.PI*2); g.fill();
          }
        });
      }

      function drawPapers() {
        papers.forEach(p => {
          g.fillStyle = '#eee';
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI*2); g.fill();
          g.strokeStyle = '#888'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(p.x - p.r*0.5, p.y); g.lineTo(p.x + p.r*0.5, p.y); g.stroke();
        });
      }

      function drawBike() {
        const bx = BIKE_X, by = bikeY;
        // wheels
        g.strokeStyle = '#333'; g.lineWidth = 3;
        g.beginPath(); g.arc(bx - W*0.06, by, H*0.035, 0, Math.PI*2); g.stroke();
        g.beginPath(); g.arc(bx + W*0.06, by, H*0.035, 0, Math.PI*2); g.stroke();
        // frame
        g.strokeStyle = '#c00'; g.lineWidth = 3;
        g.beginPath();
        g.moveTo(bx - W*0.06, by); g.lineTo(bx, by - H*0.06); g.lineTo(bx + W*0.06, by);
        g.moveTo(bx, by - H*0.06); g.lineTo(bx - W*0.02, by - H*0.1);
        g.stroke();
        // rider
        g.fillStyle = '#ffcc99';
        g.beginPath(); g.arc(bx - W*0.01, by - H*0.15, H*0.028, 0, Math.PI*2); g.fill();
        g.fillStyle = '#2244aa';
        g.fillRect(bx - W*0.04, by - H*0.13, W*0.08, H*0.07);
        // paper bag
        g.fillStyle = '#c8a060';
        g.fillRect(bx + W*0.04, by - H*0.1, W*0.04, H*0.05);
      }

      function drawHUD() {
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.032)}px monospace`;
        g.textAlign = 'left';
        g.fillText(`${score}`, 10, Math.floor(H*0.055));
        g.textAlign = 'right';
        g.fillText(`BEST:${hs}`, W-10, Math.floor(H*0.055));
        for (let i = 0; i < lives; i++) {
          g.fillStyle = '#f44';
          g.beginPath(); g.arc(W/2 + (i-1)*18, Math.floor(H*0.05), 6, 0, Math.PI*2); g.fill();
        }
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
