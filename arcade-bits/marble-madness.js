window.plethoraBit = {
  meta: {
    title: 'Marble Madness',
    author: 'plethora',
    description: 'Race your marble to the goal!',
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
    function rollSound(speed) { if(!audioCtx) return; beep(80+speed*5, 0.04, 'sine', 0.04); }
    function goalSound() { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,0.12,'sine'),i*80)); }
    function failSound() { [400,300,200,100].forEach((f,i)=>setTimeout(()=>beep(f,0.15,'sawtooth',0.15),i*100)); }

    // isometric transform
    const ISO_ANGLE = Math.PI / 6;
    const ISO_SCALE_X = Math.cos(ISO_ANGLE);
    const ISO_SCALE_Y = Math.sin(ISO_ANGLE);
    const TILE_W = W * 0.12, TILE_H = TILE_W * 0.5;

    function isoX(gx, gy) { return W/2 + (gx - gy) * TILE_W * 0.5; }
    function isoY(gz, gx, gy) { return H*0.18 + (gx + gy) * TILE_H * 0.5 - gz * TILE_H * 1.2; }

    // Stages: grid of tiles. 0=void, 1=flat, 2=ramp up (toward +x), 3=hole
    const STAGES = [
      {
        name: 'STAGE 1', time: 40000, score: 500,
        tiles: [
          [0,1,1,1,1,0,0],
          [0,1,0,0,1,0,0],
          [0,1,1,1,1,1,0],
          [0,0,0,0,1,1,0],
          [0,0,0,0,1,1,0],
          [0,0,0,0,1,0,0],
        ],
        start: [1, 0], goal: [5, 4],
        obstacles: [{ x: 3.5, y: 2, r: 0.3, bounce: true }],
      },
      {
        name: 'STAGE 2', time: 35000, score: 800,
        tiles: [
          [1,1,1,1,1,1,1],
          [1,0,0,0,0,0,1],
          [1,0,1,1,1,0,1],
          [1,0,1,0,1,0,1],
          [1,0,1,1,1,0,1],
          [1,0,0,0,0,0,1],
          [1,1,1,1,1,1,1],
        ],
        start: [0, 0], goal: [6, 6],
        obstacles: [{ x: 3, y: 3, r: 0.35, bounce: true }],
      },
    ];

    let marble, stageIdx, timeLeft, score, gameOver, started, hs, won;
    let forceX, forceY, touchActive, touchSX, touchSY;
    let currentTX, currentTY;

    function getStage() { return STAGES[stageIdx % STAGES.length]; }

    function tileAt(tx, ty) {
      const st = getStage();
      const row = st.tiles[Math.floor(ty)];
      if (!row) return 0;
      return row[Math.floor(tx)] ?? 0;
    }

    function reset() {
      stageIdx = 0; score = 0; gameOver = false; started = false; won = false;
      const st = getStage();
      marble = { x: st.start[1] + 0.5, y: st.start[0] + 0.5, z: 0, vx: 0, vy: 0 };
      timeLeft = st.time;
      forceX = 0; forceY = 0; touchActive = false;
    }

    hs = ctx.storage.get('hs_marble') || 0;
    reset();

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }
      if (won) { stageIdx++; const st=getStage(); marble={x:st.start[1]+0.5,y:st.start[0]+0.5,z:0,vx:0,vy:0}; timeLeft=st.time; won=false; return; }
      touchActive = true;
      touchSX = t.clientX; touchSY = t.clientY;
      currentTX = t.clientX; currentTY = t.clientY;
      ctx.platform.interact({ type: 'drag' });
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', e => {
      e.preventDefault();
      currentTX = e.changedTouches[0].clientX;
      currentTY = e.changedTouches[0].clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      touchActive = false; forceX = 0; forceY = 0;
    }, { passive: false });

    ctx.raf(dt => {
      const spd = dt / 16;
      g.fillStyle = '#1a1a2e';
      g.fillRect(0, 0, W, H);

      if (!started) {
        drawLevel(0, 0);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#0ff';
        g.font = `bold ${Math.floor(H*0.065)}px monospace`;
        g.textAlign = 'center';
        g.fillText('MARBLE MADNESS', W/2, H*0.35);
        g.fillStyle = '#eee';
        g.font = `${Math.floor(H*0.03)}px monospace`;
        g.fillText('DRAG TO APPLY FORCE', W/2, H*0.45);
        g.fillText('REACH THE GOLD TILE', W/2, H*0.51);
        g.fillText(`BEST: ${hs}`, W/2, H*0.59);
        return;
      }

      if (!gameOver && !won) {
        // apply force from drag
        if (touchActive) {
          forceX = (currentTX - touchSX) * 0.0015;
          forceY = (currentTY - touchSY) * 0.0015;
        }

        // physics in grid space
        // iso X drag → grid X+Y, iso Y drag → grid Y-X (approximate)
        const gfx = forceX - forceY * 0.5;
        const gfy = forceX + forceY * 0.5;

        marble.vx += gfx * spd * 0.8;
        marble.vy += gfy * spd * 0.8;

        // friction
        marble.vx *= Math.pow(0.92, spd);
        marble.vy *= Math.pow(0.92, spd);

        // clamp speed
        const spd2 = Math.sqrt(marble.vx*marble.vx + marble.vy*marble.vy);
        if (spd2 > 0.18) { marble.vx *= 0.18/spd2; marble.vy *= 0.18/spd2; }

        marble.x += marble.vx * spd * 3;
        marble.y += marble.vy * spd * 3;

        // tile check
        const tx = marble.x, ty = marble.y;
        const tile = tileAt(tx, ty);

        if (tile === 0) {
          // fell off
          marble.z -= 0.08 * spd;
          if (marble.z < -1.5) {
            failSound();
            const st = getStage();
            marble = { x: st.start[1]+0.5, y: st.start[0]+0.5, z: 0, vx: 0, vy: 0 };
            timeLeft -= 5000;
            ctx.platform.haptic('heavy');
            if (timeLeft <= 0) { gameOver = true; ctx.platform.fail({ reason: 'time' }); }
          }
        } else if (tile === 3) {
          failSound();
          const st = getStage();
          marble = { x: st.start[1]+0.5, y: st.start[0]+0.5, z: 0, vx: 0, vy: 0 };
          timeLeft -= 5000;
        } else {
          marble.z = Math.max(0, marble.z + 0.15 * spd);
        }

        // wall bounce
        const st = getStage();
        for (const ob of (st.obstacles || [])) {
          const dx = marble.x - ob.x, dy = marble.y - ob.y;
          const dist = Math.sqrt(dx*dx+dy*dy);
          if (dist < ob.r + 0.18) {
            marble.vx += (dx/dist) * 0.12;
            marble.vy += (dy/dist) * 0.12;
            beep(300, 0.05, 'square', 0.08);
          }
        }

        // roll sound
        if (spd2 > 0.02) rollSound(spd2 * 40);

        // goal check
        const goal = st.goal;
        if (Math.abs(marble.x - (goal[1]+0.5)) < 0.4 && Math.abs(marble.y - (goal[0]+0.5)) < 0.4) {
          score += Math.floor(timeLeft / 100) + st.score;
          if (score > hs) { hs = score; ctx.storage.set('hs_marble', hs); }
          ctx.platform.setScore(score);
          goalSound();
          ctx.platform.haptic('heavy');
          won = true;
        }

        timeLeft -= dt;
        if (timeLeft <= 0 && !won) {
          gameOver = true; failSound();
          ctx.platform.fail({ reason: 'time out' });
        }
      }

      drawLevel(marble.x, marble.y);
      drawMarble();
      drawHUD();

      if (won) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#0f0';
        g.font = `bold ${Math.floor(H*0.065)}px monospace`;
        g.textAlign = 'center';
        g.fillText('STAGE CLEAR!', W/2, H*0.38);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`+${Math.floor(timeLeft/100)} pts`, W/2, H*0.48);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.032)}px monospace`;
        g.fillText('TAP FOR NEXT STAGE', W/2, H*0.58);
      }

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f44';
        g.font = `bold ${Math.floor(H*0.065)}px monospace`;
        g.textAlign = 'center';
        g.fillText('TIME\'S UP!', W/2, H*0.4);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`SCORE: ${score}`, W/2, H*0.5);
        g.fillText(`BEST: ${hs}`, W/2, H*0.57);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.032)}px monospace`;
        g.fillText('TAP TO RESTART', W/2, H*0.67);
      }

      function drawLevel(mx, my) {
        const st = getStage();
        const rows = st.tiles.length, cols = st.tiles[0].length;

        // draw tiles back-to-front
        for (let r = rows-1; r >= 0; r--) {
          for (let c = 0; c < cols; c++) {
            const tile = st.tiles[r][c];
            if (tile === 0) continue;
            const tx2 = isoX(c+0.5, r+0.5);
            const ty2 = isoY(0, c+0.5, r+0.5);
            const tw = TILE_W, th = TILE_H;

            const isGoal = (r === st.goal[0] && c === st.goal[1]);
            const isStart = (r === st.start[0] && c === st.start[1]);

            // top face
            g.beginPath();
            g.moveTo(tx2, ty2 - th);
            g.lineTo(tx2 + tw/2, ty2 - th*0.5);
            g.lineTo(tx2, ty2);
            g.lineTo(tx2 - tw/2, ty2 - th*0.5);
            g.closePath();
            g.fillStyle = isGoal ? '#ffd700' : isStart ? '#4488ff' : tile === 3 ? '#331111' : '#2a4a6a';
            g.fill();
            g.strokeStyle = '#1a3a5a'; g.lineWidth = 1;
            g.stroke();

            // left face
            g.beginPath();
            g.moveTo(tx2 - tw/2, ty2 - th*0.5);
            g.lineTo(tx2, ty2);
            g.lineTo(tx2, ty2 + th*0.4);
            g.lineTo(tx2 - tw/2, ty2 - th*0.1);
            g.closePath();
            g.fillStyle = '#1a3050';
            g.fill();

            // right face
            g.beginPath();
            g.moveTo(tx2 + tw/2, ty2 - th*0.5);
            g.lineTo(tx2, ty2);
            g.lineTo(tx2, ty2 + th*0.4);
            g.lineTo(tx2 + tw/2, ty2 - th*0.1);
            g.closePath();
            g.fillStyle = '#243858';
            g.fill();

            if (isGoal) {
              g.fillStyle = 'rgba(255,215,0,0.3)';
              g.beginPath(); g.arc(tx2, ty2 - th*0.5, tw*0.15, 0, Math.PI*2); g.fill();
            }
          }
        }

        // obstacles
        for (const ob of (st.obstacles || [])) {
          const ox = isoX(ob.x, ob.y);
          const oy2 = isoY(0.3, ob.x, ob.y);
          g.fillStyle = 'rgba(255,80,80,0.85)';
          g.beginPath(); g.arc(ox, oy2, TILE_W*ob.r, 0, Math.PI*2); g.fill();
          g.strokeStyle = '#f00'; g.lineWidth = 2; g.stroke();
        }
      }

      function drawMarble() {
        const sx = isoX(marble.x, marble.y);
        const sy = isoY(marble.z, marble.x, marble.y);
        const r = TILE_W * 0.18;

        // shadow
        const shadowY = isoY(0, marble.x, marble.y);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.beginPath(); g.ellipse(sx, shadowY, r, r*0.5, 0, 0, Math.PI*2); g.fill();

        // marble
        const grad = g.createRadialGradient(sx - r*0.3, sy - r*0.3, r*0.05, sx, sy, r);
        grad.addColorStop(0, '#e8f8ff');
        grad.addColorStop(0.3, '#88ccff');
        grad.addColorStop(0.7, '#2266aa');
        grad.addColorStop(1, '#001133');
        g.fillStyle = grad;
        g.beginPath(); g.arc(sx, sy, r, 0, Math.PI*2); g.fill();

        // shine
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.beginPath(); g.arc(sx - r*0.3, sy - r*0.3, r*0.22, 0, Math.PI*2); g.fill();
      }

      function drawHUD() {
        const st = getStage();
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.032)}px monospace`;
        g.textAlign = 'left';
        g.fillText(`${score}`, 10, Math.floor(H*0.055));
        g.textAlign = 'right';
        g.fillText(`BEST:${hs}`, W-10, Math.floor(H*0.055));
        g.textAlign = 'center';
        g.fillStyle = timeLeft < 10000 ? '#f44' : '#ff0';
        g.fillText(`${(timeLeft/1000).toFixed(1)}s`, W/2, Math.floor(H*0.055));
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.025)}px monospace`;
        g.fillText(st.name, W/2, Math.floor(H*0.085));

        // force indicator
        if (touchActive) {
          g.strokeStyle = 'rgba(0,255,255,0.4)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(touchSX, touchSY);
          g.lineTo(currentTX, currentTY);
          g.stroke();
        }
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
