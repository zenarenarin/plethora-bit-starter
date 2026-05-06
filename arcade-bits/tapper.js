window.plethoraBit = {
  meta: {
    title: 'Tapper',
    author: 'plethora',
    description: 'Slide beers, catch empties, satisfy customers!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null;
    function initAudio() { if (!audioCtx) audioCtx = new AudioContext(); }
    function beep(freq, dur, type='sine', vol=0.15) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function serveSound() { beep(600, 0.06, 'sine'); setTimeout(()=>beep(800,0.06,'sine'),70); }
    function catchSound() { beep(400, 0.08, 'square', 0.1); }
    function failSound() { [300,220,150].forEach((f,i)=>setTimeout(()=>beep(f,0.15,'sawtooth'),i*100)); }
    function gameOverSound() { [400,300,200,100].forEach((f,i)=>setTimeout(()=>beep(f,0.25,'sawtooth',0.2),i*150)); }

    const NUM_BARS = 4;
    const BAR_MARGIN_TOP = H * 0.1;
    const BAR_SPACING = (H * 0.82) / NUM_BARS;
    const BAR_Y = Array.from({length:NUM_BARS}, (_,i) => BAR_MARGIN_TOP + i * BAR_SPACING + BAR_SPACING * 0.6);
    const TAP_X = W * 0.06;
    const MUG_W = W * 0.08, MUG_H = H * 0.045;

    let mugs, returnMugs, customers, score, lives, gameOver, started, hs;
    let spawnTimer, spawnInterval, level;

    function reset() {
      mugs = []; returnMugs = []; customers = [];
      score = 0; lives = 3; gameOver = false; started = false;
      spawnTimer = 0; spawnInterval = 2200; level = 0;
      for (let i = 0; i < NUM_BARS; i++) {
        customers.push({ lane: i, x: W * 0.85, thirst: 100, speed: 0.4 + Math.random()*0.3, active: true });
      }
    }

    hs = ctx.storage.get('hs_tapper') || 0;
    reset();

    function slideBeer(lane) {
      // check if lane already has a mug on it
      const existing = mugs.filter(m => m.lane === lane && !m.returning);
      if (existing.length >= 2) return;
      mugs.push({ lane, x: TAP_X + MUG_W, y: BAR_Y[lane] - MUG_H, vx: 5 + level * 0.5, returning: false, empty: false });
      serveSound();
      ctx.platform.haptic('light');
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }

      // determine lane from Y position
      const ty = t.clientY;
      let closestLane = 0, closestDist = Infinity;
      for (let i = 0; i < NUM_BARS; i++) {
        const dist = Math.abs(ty - BAR_Y[i]);
        if (dist < closestDist) { closestDist = dist; closestLane = i; }
      }
      if (closestDist < BAR_SPACING * 0.55) {
        slideBeer(closestLane);
        ctx.platform.interact({ type: 'tap' });
      }
    }, { passive: false });

    ctx.raf(dt => {
      const spd = dt / 16;
      g.fillStyle = '#1a0a00';
      g.fillRect(0, 0, W, H);

      if (!started) {
        // Draw bar background
        for (let i = 0; i < NUM_BARS; i++) {
          g.fillStyle = '#3a1a00';
          g.fillRect(0, BAR_Y[i] - MUG_H*1.5, W, MUG_H * 2);
        }
        g.fillStyle = '#f8d060';
        g.font = `bold ${Math.floor(H*0.06)}px monospace`;
        g.textAlign = 'center';
        g.fillText('TAPPER', W/2, H*0.33);
        g.fillStyle = '#ccc';
        g.font = `${Math.floor(H*0.03)}px monospace`;
        g.fillText('TAP A BAR TO SERVE BEER', W/2, H*0.44);
        g.fillText(`BEST: ${hs}`, W/2, H*0.52);
        return;
      }

      if (!gameOver) {
        spawnTimer += dt;
        if (spawnTimer >= spawnInterval) {
          spawnTimer = 0;
          spawnInterval = Math.max(1200, 2200 - level * 80);
          // add new customer to a random lane
          const lane = Math.floor(Math.random() * NUM_BARS);
          const existing = customers.filter(c => c.lane === lane);
          if (existing.length < 3) {
            customers.push({ lane, x: W * 0.92, thirst: 100, speed: 0.5 + level*0.12 + Math.random()*0.3, active: true });
          }
        }

        // move customers
        for (let i = customers.length - 1; i >= 0; i--) {
          const c = customers[i];
          c.thirst -= dt * 0.006;
          c.x -= c.speed * spd * 0.3; // slow drift left

          if (c.x < TAP_X + W*0.05) {
            // reached the bar — life lost
            customers.splice(i, 1);
            lives--;
            failSound();
            ctx.platform.haptic('heavy');
            if (lives <= 0) {
              gameOver = true;
              gameOverSound();
              ctx.platform.fail({ reason: 'customer reached bar' });
            }
            continue;
          }

          // check if a mug reaches this customer
          for (let j = mugs.length - 1; j >= 0; j--) {
            const m = mugs[j];
            if (m.lane !== c.lane || m.returning) continue;
            if (m.x + MUG_W >= c.x && m.x <= c.x + MUG_W*1.5) {
              // beer delivered!
              score += 10;
              ctx.platform.setScore(score);
              if (score > hs) { hs = score; ctx.storage.set('hs_tapper', hs); }
              if (score % 50 === 0) level++;
              beep(880, 0.08, 'sine');
              // turn into return mug
              mugs[j].returning = true;
              mugs[j].empty = true;
              mugs[j].vx = -(4 + level * 0.4);
              customers.splice(i, 1);
              break;
            }
          }
        }

        // move mugs
        for (let i = mugs.length - 1; i >= 0; i--) {
          const m = mugs[i];
          m.x += m.vx * spd;

          if (!m.returning) {
            // hit right wall (missed customer)
            if (m.x > W + MUG_W) {
              mugs.splice(i, 1);
            }
          } else {
            // returning mug — must be caught before it falls off left
            if (m.x + MUG_W < TAP_X) {
              // missed catch
              mugs.splice(i, 1);
              lives--;
              failSound();
              if (lives <= 0) {
                gameOver = true;
                gameOverSound();
                ctx.platform.fail({ reason: 'missed return mug' });
              }
            } else if (m.x <= TAP_X + MUG_W * 2) {
              // caught at tap!
              mugs.splice(i, 1);
              catchSound();
              score += 2;
            }
          }
        }
      }

      // DRAW bars
      for (let i = 0; i < NUM_BARS; i++) {
        const by = BAR_Y[i];
        g.fillStyle = '#5a2a00';
        g.fillRect(0, by - MUG_H*0.3, W, MUG_H * 0.5);
        g.fillStyle = '#8B4513';
        g.fillRect(0, by - MUG_H*0.3, W, 3);
        // tap
        g.fillStyle = '#aaa';
        g.fillRect(TAP_X - 4, by - MUG_H*2, 8, MUG_H*2);
        g.fillStyle = '#888';
        g.beginPath(); g.arc(TAP_X, by - MUG_H*2, 10, 0, Math.PI*2); g.fill();
      }

      // draw mugs
      function drawMug(mx, my, empty) {
        g.fillStyle = empty ? 'rgba(200,180,100,0.3)' : 'rgba(255,220,50,0.85)';
        g.fillRect(mx, my, MUG_W, MUG_H);
        g.strokeStyle = '#aa8800';
        g.lineWidth = 1.5;
        g.strokeRect(mx, my, MUG_W, MUG_H);
        if (!empty) {
          g.fillStyle = 'rgba(255,255,255,0.3)';
          g.fillRect(mx + 2, my + 2, MUG_W * 0.3, MUG_H - 4);
        }
        // handle
        g.strokeStyle = empty ? '#665500' : '#aa8800';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(mx + MUG_W + 4, my + MUG_H/2, MUG_H*0.35, -Math.PI*0.5, Math.PI*0.5);
        g.stroke();
      }

      mugs.forEach(m => drawMug(m.x, m.y, m.empty));

      // draw customers
      customers.forEach(c => {
        const cx = c.x, cy = BAR_Y[c.lane] - MUG_H * 2.5;
        // body
        g.fillStyle = `hsl(${c.lane * 60}, 70%, 55%)`;
        g.fillRect(cx, cy, W*0.06, MUG_H * 2);
        // head
        g.fillStyle = '#ffcc99';
        g.beginPath(); g.arc(cx + W*0.03, cy - W*0.025, W*0.025, 0, Math.PI*2); g.fill();
        // thirst bar
        g.fillStyle = '#300';
        g.fillRect(cx, cy + MUG_H*2.1, W*0.06, 5);
        g.fillStyle = `hsl(${c.thirst},90%,50%)`;
        g.fillRect(cx, cy + MUG_H*2.1, W*0.06 * (c.thirst/100), 5);
      });

      // HUD
      g.fillStyle = '#f8d060';
      g.font = `bold ${Math.floor(H*0.032)}px monospace`;
      g.textAlign = 'left';
      g.fillText(`${score}`, 10, Math.floor(H*0.065));
      g.textAlign = 'right';
      g.fillText(`BEST:${hs}`, W-10, Math.floor(H*0.065));
      for (let i = 0; i < lives; i++) {
        g.fillStyle = '#f44';
        g.beginPath(); g.arc(W/2 + (i-1)*18, Math.floor(H*0.06), 6, 0, Math.PI*2); g.fill();
      }

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.78)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f8d060';
        g.font = `bold ${Math.floor(H*0.07)}px monospace`;
        g.textAlign = 'center';
        g.fillText('LAST CALL!', W/2, H*0.4);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`SCORE: ${score}`, W/2, H*0.5);
        g.fillText(`BEST: ${hs}`, W/2, H*0.57);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.033)}px monospace`;
        g.fillText('TAP TO RESTART', W/2, H*0.67);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
