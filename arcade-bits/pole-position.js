window.plethoraBit = {
  meta: {
    title: 'Pole Position',
    author: 'plethora',
    description: 'Dodge traffic at insane speed.',
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
    function crashSound() { [500,350,200,100].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'sawtooth',0.2),i*80)); }
    function nitroSound() { beep(200,0.1,'sawtooth',0.15); setTimeout(()=>beep(400,0.15,'sawtooth',0.1),80); }

    const ROAD_W = W * 0.78;
    const HORIZON_Y = H * 0.38;
    const CAR_W = W * 0.13, CAR_H = H * 0.1;
    const CAR_Y = H * 0.75;
    const ROAD_COLORS = ['#555', '#666'];
    const STRIPE_COLORS = ['#fff', '#888'];

    const ENEMY_COLORS = ['#e44','#4e4','#44e','#ee4','#e4e','#4ee','#e84'];

    let carX, speed, distance, score, gameOver, started, hs;
    let enemies, roadOffset, nitro, nitroTimer, nitroCooldown, touchX;
    let crashed, crashTimer;

    function reset() {
      carX = W / 2;
      speed = 3; distance = 0; score = 0;
      gameOver = false; started = false;
      enemies = []; roadOffset = 0;
      nitro = 3; nitroTimer = 0; nitroCooldown = 0; touchX = null;
      crashed = false; crashTimer = 0;
    }

    hs = ctx.storage.get('hs_poleposition') || 0;
    reset();

    let dragStartX = null;

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }
      dragStartX = t.clientX;
      touchX = t.clientX;

      // Double-tap right side = nitro
      if (t.clientX > W*0.7 && nitro > 0 && nitroCooldown <= 0) {
        nitro--;
        nitroTimer = 80;
        nitroCooldown = 120;
        nitroSound();
        ctx.platform.haptic('heavy');
      }
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', e => {
      e.preventDefault();
      if (!started || gameOver) return;
      touchX = e.changedTouches[0].clientX;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      touchX = null; dragStartX = null;
    }, { passive: false });

    function spawnEnemy() {
      const laneX = W*0.12 + Math.random() * (ROAD_W - W*0.12);
      enemies.push({
        x: laneX, y: HORIZON_Y + 10, vy: speed * 0.6 + Math.random() * 2,
        color: ENEMY_COLORS[Math.floor(Math.random()*ENEMY_COLORS.length)],
        w: CAR_W * 0.8, h: CAR_H * 0.7
      });
    }

    let spawnTimer = 0;
    const BASE_SPAWN = 900;

    ctx.raf(dt => {
      const spd = dt / 16;
      g.fillStyle = '#87ceeb';
      g.fillRect(0, 0, W, HORIZON_Y);

      // sky gradient
      const sky = g.createLinearGradient(0, 0, 0, HORIZON_Y);
      sky.addColorStop(0, '#4488cc');
      sky.addColorStop(1, '#aaddff');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, HORIZON_Y);

      // mountains
      g.fillStyle = '#556677';
      g.beginPath(); g.moveTo(0, HORIZON_Y);
      for (let mx = 0; mx <= W; mx += W*0.12) {
        g.lineTo(mx, HORIZON_Y - H*0.1 - Math.sin(mx*0.01)*H*0.06);
      }
      g.lineTo(W, HORIZON_Y); g.closePath(); g.fill();

      if (!started) {
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.06)}px monospace`;
        g.textAlign = 'center';
        g.fillText('POLE POSITION', W/2, H*0.55);
        g.fillStyle = '#eee';
        g.font = `${Math.floor(H*0.03)}px monospace`;
        g.fillText('DRAG TO STEER', W/2, H*0.65);
        g.fillText('TAP RIGHT = NITRO', W/2, H*0.71);
        g.fillText(`BEST: ${hs}`, W/2, H*0.78);
        // draw road
        drawRoad();
        drawPlayerCar(carX);
        return;
      }

      if (!gameOver) {
        if (nitroTimer > 0) nitroTimer -= spd;
        if (nitroCooldown > 0) nitroCooldown -= spd;

        const curSpeed = speed + (nitroTimer > 0 ? 4 : 0);

        if (touchX !== null) {
          const diff = touchX - carX;
          carX += diff * 0.08 * spd;
        }
        carX = Math.max(W*0.1 + CAR_W/2, Math.min(W*0.9 - CAR_W/2, carX));

        roadOffset = (roadOffset + curSpeed * spd) % 40;
        distance += curSpeed * spd;
        score = Math.floor(distance / 10);
        if (score > hs) { hs = score; ctx.storage.set('hs_poleposition', hs); }
        ctx.platform.setScore(score);

        speed = 3 + distance / 800;

        spawnTimer += dt;
        const spawnInt = Math.max(400, BASE_SPAWN - distance / 8);
        if (spawnTimer >= spawnInt) {
          spawnTimer = 0;
          spawnEnemy();
          if (Math.random() < 0.3) spawnEnemy();
        }

        // move enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
          const en = enemies[i];
          en.y += (en.vy + curSpeed) * spd;

          // road narrowing toward bottom perspective
          const t2 = (en.y - HORIZON_Y) / (H - HORIZON_Y);
          en.screenX = W/2 + (en.x - W/2) * t2;
          en.screenW = en.w * t2 * 1.4;
          en.screenH = en.h * t2 * 1.4;

          if (en.y > H + en.h) { enemies.splice(i, 1); continue; }

          // collision (near bottom)
          if (en.y > H * 0.65) {
            const ex = en.screenX || en.x;
            if (Math.abs(ex - carX) < (CAR_W * 0.5 + en.screenW * 0.4)) {
              crashed = true; crashTimer = 60;
              crashSound();
              ctx.platform.haptic('heavy');
              gameOver = true;
              ctx.platform.fail({ reason: 'crash' });
            }
          }
        }

        // regen nitro
        if (nitro < 3 && nitroCooldown <= 0) {
          nitro = Math.min(3, nitro + dt / 5000);
        }
      }

      drawRoad();

      // enemies
      enemies.forEach(en => {
        const t2 = Math.max(0.01, (en.y - HORIZON_Y) / (H - HORIZON_Y));
        const ex = W/2 + (en.x - W/2) * t2;
        const ew = en.w * t2 * 1.4, eh = en.h * t2 * 1.4;
        drawEnemy(ex - ew/2, en.y - eh, ew, eh, en.color);
      });

      drawPlayerCar(carX);

      // HUD
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H*0.03)}px monospace`;
      g.textAlign = 'left';
      g.fillText(`${score}`, 10, Math.floor(H*0.055));
      g.textAlign = 'right';
      g.fillText(`BEST:${hs}`, W-10, Math.floor(H*0.055));
      // nitro pips
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < Math.floor(nitro) ? '#ff8800' : '#333';
        g.beginPath(); g.arc(W/2 - 18 + i*18, Math.floor(H*0.05), 7, 0, Math.PI*2); g.fill();
      }
      if (nitroTimer > 0) {
        g.fillStyle = '#ff8800';
        g.font = `bold ${Math.floor(H*0.04)}px monospace`;
        g.textAlign = 'center';
        g.fillText('NITRO!', W/2, H*0.92);
      }

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f44';
        g.font = `bold ${Math.floor(H*0.07)}px monospace`;
        g.textAlign = 'center';
        g.fillText('CRASH!', W/2, H*0.4);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`DIST: ${score}`, W/2, H*0.5);
        g.fillText(`BEST: ${hs}`, W/2, H*0.57);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.033)}px monospace`;
        g.fillText('TAP TO RESTART', W/2, H*0.67);
      }

      function drawRoad() {
        // perspective road
        g.fillStyle = '#555';
        g.beginPath();
        g.moveTo(W*0.1, H);
        g.lineTo(W*0.9, H);
        g.lineTo(W*0.5 + ROAD_W*0.02, HORIZON_Y);
        g.lineTo(W*0.5 - ROAD_W*0.02, HORIZON_Y);
        g.closePath(); g.fill();

        // road lines
        const numStripes = 10;
        for (let i = 0; i < numStripes; i++) {
          const t2 = (i / numStripes + (roadOffset / 40) / numStripes) % 1;
          const y1 = HORIZON_Y + t2 * (H - HORIZON_Y);
          const y2 = HORIZON_Y + ((t2 + 1/numStripes)) * (H - HORIZON_Y);
          const scale1 = (y1 - HORIZON_Y) / (H - HORIZON_Y);
          const scale2 = (y2 - HORIZON_Y) / (H - HORIZON_Y);
          const roadWAt1 = ROAD_W * scale1 * 0.5;
          const roadWAt2 = ROAD_W * scale2 * 0.5;

          // center stripe
          g.fillStyle = i % 2 === 0 ? '#fff' : 'transparent';
          if (i % 2 === 0) {
            g.beginPath();
            g.moveTo(W/2 - roadWAt1*0.05, y1);
            g.lineTo(W/2 + roadWAt1*0.05, y1);
            g.lineTo(W/2 + roadWAt2*0.05, y2);
            g.lineTo(W/2 - roadWAt2*0.05, y2);
            g.closePath(); g.fill();
          }
        }

        // road edge lines
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(W*0.1, H);
        g.lineTo(W*0.5 - ROAD_W*0.02, HORIZON_Y);
        g.stroke();
        g.beginPath();
        g.moveTo(W*0.9, H);
        g.lineTo(W*0.5 + ROAD_W*0.02, HORIZON_Y);
        g.stroke();
      }

      function drawPlayerCar(cx) {
        const cw = CAR_W, ch = CAR_H;
        const cx2 = cx - cw/2;
        // body
        g.fillStyle = nitroTimer > 0 ? '#ffaa00' : '#cc0000';
        g.fillRect(cx2, CAR_Y - ch, cw, ch);
        // windshield
        g.fillStyle = 'rgba(120,200,255,0.7)';
        g.fillRect(cx2 + cw*0.15, CAR_Y - ch*0.85, cw*0.7, ch*0.35);
        // wheels
        g.fillStyle = '#111';
        g.fillRect(cx2 - cw*0.05, CAR_Y - ch*0.35, cw*0.15, ch*0.3);
        g.fillRect(cx2 + cw*0.9, CAR_Y - ch*0.35, cw*0.15, ch*0.3);
        // exhaust if nitro
        if (nitroTimer > 0) {
          g.fillStyle = '#ff8800';
          for (let fi = 0; fi < 3; fi++) {
            const fy = CAR_Y + fi * 5;
            g.globalAlpha = 1 - fi*0.3;
            g.fillRect(cx2 + cw*0.3, fy, cw*0.15, 8);
            g.fillRect(cx2 + cw*0.55, fy, cw*0.15, 8);
          }
          g.globalAlpha = 1;
        }
      }

      function drawEnemy(ex, ey, ew, eh, color) {
        g.fillStyle = color;
        g.fillRect(ex, ey, ew, eh);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(ex + ew*0.1, ey + eh*0.1, ew*0.8, eh*0.3);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
