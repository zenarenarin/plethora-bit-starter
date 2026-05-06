window.plethoraBit = {
  meta: {
    title: 'Tron Light Cycles',
    author: 'plethora',
    description: 'Leave trails, trap your opponent.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null;
    function initAudio() { if (!audioCtx) audioCtx = new AudioContext(); }
    function beep(freq, dur, type='square', vol=0.12) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function crashSound() { [300,200,150,80].forEach((f,i)=>setTimeout(()=>beep(f,0.15,'sawtooth',0.2),i*80)); }

    const SAFE = ctx.safeArea.bottom;
    const CELL = Math.floor(Math.min(W, H) / 80);
    const COLS = Math.floor(W / CELL);
    const ROWS = Math.floor((H - SAFE - H * 0.12) / CELL);
    const OY = Math.floor(H * 0.06);

    let player, ai, grid, round, score, gameOver, started, hs;
    let aiDifficulty = 0;

    function initState() {
      grid = new Uint8Array(COLS * ROWS); // 0=empty, 1=player, 2=ai
      const px = Math.floor(COLS * 0.25), py = Math.floor(ROWS * 0.5);
      const ax = Math.floor(COLS * 0.75), ay = Math.floor(ROWS * 0.5);
      player = { x: px, y: py, dx: 1, dy: 0, alive: true };
      ai = { x: ax, y: ay, dx: -1, dy: 0, alive: true };
      grid[py * COLS + px] = 1;
      grid[ay * COLS + ax] = 2;
    }

    function reset() {
      round = 0; score = 0; gameOver = false; started = false; aiDifficulty = 0;
      initState();
    }

    hs = ctx.storage.get('hs_tron') || 0;
    reset();

    function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }
    function blocked(x, y) { return !inBounds(x, y) || grid[y * COLS + x] !== 0; }

    function aiMove() {
      const { x, y, dx, dy } = ai;
      const dirs = [
        { dx: -dy, dy: dx },  // turn left rel
        { dx, dy },           // straight
        { dx: dy, dy: -dx },  // turn right rel
        { dx: -dx, dy: -dy }, // reverse (last resort)
      ];

      // Score each move by flood-fill reachable space
      let best = null, bestScore = -1;
      for (const d of dirs) {
        const nx = x + d.dx, ny = y + d.dy;
        if (blocked(nx, ny)) continue;
        let space = 0;
        if (aiDifficulty >= 1) {
          // BFS flood fill
          const visited = new Set();
          const q = [`${nx},${ny}`];
          visited.add(q[0]);
          let limit = 200;
          while (q.length && limit-- > 0) {
            const [cx, cy] = q.shift().split(',').map(Number);
            space++;
            for (const dd of [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}]) {
              const fx = cx+dd.dx, fy = cy+dd.dy;
              const key = `${fx},${fy}`;
              if (!visited.has(key) && !blocked(fx, fy)) { visited.add(key); q.push(key); }
            }
          }
          // also bias toward chasing player if hard
          if (aiDifficulty >= 2) {
            const distToPlayer = Math.abs(nx - player.x) + Math.abs(ny - player.y);
            space -= distToPlayer * 0.5;
          }
        } else {
          space = Math.random() * 100;
        }
        if (space > bestScore) { bestScore = space; best = d; }
      }
      if (best) { ai.dx = best.dx; ai.dy = best.dy; }
    }

    let moveTimer = 0;
    const MOVE_INTERVAL = Math.max(60, 110 - aiDifficulty * 10);

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }
      const tx = t.clientX;
      // left half = turn left, right half = turn right
      if (tx < W/2) {
        const ndx = player.dy, ndy = -player.dx;
        player.dx = ndx; player.dy = ndy;
      } else {
        const ndx = -player.dy, ndy = player.dx;
        player.dx = ndx; player.dy = ndy;
      }
      beep(400, 0.04);
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.raf(dt => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);

      if (!started) {
        g.fillStyle = '#0ff';
        g.font = `bold ${Math.floor(H*0.07)}px monospace`;
        g.textAlign = 'center';
        g.fillText('TRON', W/2, H*0.35);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.033)}px monospace`;
        g.fillText('TAP LEFT/RIGHT TO TURN', W/2, H*0.48);
        g.fillText(`BEST: ${hs}`, W/2, H*0.56);
        // draw grid lines faintly
        g.strokeStyle = 'rgba(0,255,255,0.05)';
        g.lineWidth = 0.5;
        for (let c = 0; c < COLS; c++) { g.beginPath(); g.moveTo(c*CELL, OY); g.lineTo(c*CELL, OY+ROWS*CELL); g.stroke(); }
        for (let r = 0; r < ROWS; r++) { g.beginPath(); g.moveTo(0, OY+r*CELL); g.lineTo(COLS*CELL, OY+r*CELL); g.stroke(); }
        return;
      }

      if (!gameOver) {
        moveTimer += dt;
        const interval = Math.max(50, 110 - round * 8);
        if (moveTimer >= interval) {
          moveTimer = 0;
          aiMove();

          const pnx = player.x + player.dx, pny = player.y + player.dy;
          const anx = ai.x + ai.dx, any = ai.y + ai.dy;

          if (blocked(pnx, pny)) { player.alive = false; }
          if (blocked(anx, any)) { ai.alive = false; }

          if (player.alive) { grid[pny * COLS + pnx] = 1; player.x = pnx; player.y = pny; }
          if (ai.alive) { grid[any * COLS + anx] = 2; ai.x = anx; ai.y = any; }

          if (!player.alive || !ai.alive) {
            if (!player.alive && ai.alive) {
              crashSound();
              gameOver = true;
              ctx.platform.fail({ reason: 'crashed' });
            } else if (!ai.alive) {
              score += 10 + round * 5;
              ctx.platform.setScore(score);
              if (score > hs) { hs = score; ctx.storage.set('hs_tron', hs); }
              beep(880, 0.1, 'sine'); beep(1100, 0.1, 'sine');
              ctx.platform.haptic('medium');
              round++;
              aiDifficulty = Math.min(3, Math.floor(round / 2));
              initState();
            } else {
              crashSound(); gameOver = true;
              ctx.platform.fail({ reason: 'mutual crash' });
            }
          }
        }
      }

      // Draw grid trails
      g.strokeStyle = 'rgba(0,255,255,0.08)';
      g.lineWidth = 0.5;

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = grid[r * COLS + c];
          if (v === 0) continue;
          const px2 = c * CELL, py2 = OY + r * CELL;
          if (v === 1) {
            g.fillStyle = '#0ff';
            g.shadowColor = '#0ff'; g.shadowBlur = 6;
          } else {
            g.fillStyle = '#f0f';
            g.shadowColor = '#f0f'; g.shadowBlur = 6;
          }
          g.fillRect(px2 + 1, py2 + 1, CELL - 1, CELL - 1);
          g.shadowBlur = 0;
        }
      }

      // Draw heads
      if (player.alive) {
        g.fillStyle = '#fff';
        g.shadowColor = '#0ff'; g.shadowBlur = 12;
        g.fillRect(player.x*CELL+1, OY+player.y*CELL+1, CELL-1, CELL-1);
        g.shadowBlur = 0;
      }
      if (ai.alive) {
        g.fillStyle = '#fff';
        g.shadowColor = '#f0f'; g.shadowBlur = 12;
        g.fillRect(ai.x*CELL+1, OY+ai.y*CELL+1, CELL-1, CELL-1);
        g.shadowBlur = 0;
      }

      // HUD
      g.font = `bold ${Math.floor(H*0.032)}px monospace`;
      g.textAlign = 'left';
      g.fillStyle = '#0ff';
      g.fillText(`${score}`, 10, Math.floor(H*0.05));
      g.textAlign = 'right';
      g.fillStyle = '#aaa';
      g.fillText(`BEST:${hs}  RND:${round+1}`, W-10, Math.floor(H*0.05));

      // tap guides
      g.fillStyle = 'rgba(0,255,255,0.1)';
      g.fillRect(0, OY + ROWS*CELL + 4, W/2 - 2, H - OY - ROWS*CELL - 4);
      g.fillStyle = 'rgba(255,0,255,0.1)';
      g.fillRect(W/2 + 2, OY + ROWS*CELL + 4, W/2 - 2, H - OY - ROWS*CELL - 4);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.font = `${Math.floor(H*0.025)}px monospace`;
      g.textAlign = 'center';
      g.fillText('◄ TURN LEFT', W/4, OY + ROWS*CELL + Math.floor(H*0.04));
      g.fillText('TURN RIGHT ►', W*3/4, OY + ROWS*CELL + Math.floor(H*0.04));

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f0f';
        g.font = `bold ${Math.floor(H*0.07)}px monospace`;
        g.textAlign = 'center';
        g.fillText('DEREZZED', W/2, H*0.4);
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
