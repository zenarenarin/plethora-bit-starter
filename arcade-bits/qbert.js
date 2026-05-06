window.plethoraBit = {
  meta: {
    title: "Q*bert",
    author: 'plethora',
    description: 'Hop the pyramid, dodge Coily!',
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
    function hopSound() { beep(500, 0.05, 'square', 0.12); }
    function colorSound() { beep(800, 0.06, 'sine', 0.12); }
    function dieSound() { [400,300,200,100].forEach((f,i)=>setTimeout(()=>beep(f,0.12,'sawtooth',0.15),i*80)); }
    function levelSound() { [523,659,784,1047,1568].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'sine'),i*70)); }
    function gameOverSound() { [300,250,200,150,100].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'sawtooth',0.18),i*120)); }

    const ROWS = 6;
    const TILE_W = W * 0.13, TILE_H = TILE_W * 0.55;
    const TOP_X = W / 2, TOP_Y = H * 0.15;

    function tilePos(row, col) {
      const x = TOP_X + (col - row / 2) * TILE_W;
      const y = TOP_Y + row * TILE_H * 1.3;
      return { x, y };
    }

    function isoPos(row, col, z) {
      const p = tilePos(row, col);
      return { x: p.x, y: p.y - z * TILE_H * 0.6 };
    }

    // Pyramid: row 0 = 1 tile, row 5 = 6 tiles
    let cubes, qbert, coily, sam, score, lives, level, gameOver, started, hs;
    let moving, moveQueue;
    let coilyTimer, samTimer;

    function buildPyramid() {
      const arr = [];
      for (let r = 0; r < ROWS; r++) {
        arr.push([]);
        for (let c = 0; c <= r; c++) {
          arr[r].push({ colored: false, r, c });
        }
      }
      return arr;
    }

    function reset() {
      cubes = buildPyramid();
      qbert = { r: 0, c: 0, z: 0, animZ: 0 };
      coily = { r: 1, c: 0, z: 0, animZ: 0, timer: 0 };
      sam = { r: 2, c: 2, z: 0, animZ: 0, timer: 0, active: false };
      score = 0; lives = 3; level = 0;
      gameOver = false; started = false; moving = false; moveQueue = [];
      coilyTimer = 2000; samTimer = 4000;
      // Color top cube immediately
      cubes[0][0].colored = true;
    }

    hs = ctx.storage.get('hs_qbert') || 0;
    reset();

    function colorAt(row, col) {
      return cubes[row] && cubes[row][col] ? cubes[row][col].colored : false;
    }

    function allColored() {
      return cubes.every(row => row.every(c => c.colored));
    }

    function moveQbert(dr, dc) {
      const nr = qbert.r + dr, nc = qbert.c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc > nr) {
        // fell off
        dieSound(); lives--;
        ctx.platform.haptic('heavy');
        qbert = { r: 0, c: 0, z: 0, animZ: 0 };
        if (lives <= 0) { gameOver = true; gameOverSound(); ctx.platform.fail({ reason: 'fell off' }); }
        return;
      }
      qbert.r = nr; qbert.c = nc; qbert.animZ = 1;
      hopSound();

      if (!cubes[nr][nc].colored) {
        cubes[nr][nc].colored = true;
        score += 25;
        colorSound();
        ctx.platform.setScore(score);
        if (score > hs) { hs = score; ctx.storage.set('hs_qbert', hs); }
      }

      if (allColored()) {
        level++;
        score += 500;
        levelSound();
        ctx.platform.haptic('heavy');
        cubes = buildPyramid();
        cubes[0][0].colored = true;
        qbert = { r: 0, c: 0, z: 0, animZ: 0 };
        coily = { r: 1, c: 0, z: 0, animZ: 0, timer: 0 };
        sam = { r: 2, c: 2, z: 0, animZ: 0, timer: 0, active: false };
        coilyTimer = Math.max(800, 2000 - level * 100);
      }
    }

    function moveEnemy(en, targetR, targetC) {
      // move 1 step toward target (Coily chases Q*bert)
      const dr = Math.sign(targetR - en.r);
      const dc = Math.sign(targetC - en.c);
      const nr = en.r + (dr !== 0 ? dr : 0);
      const nc = en.c + (dc !== 0 ? dc : 0);

      if (nr >= 0 && nr < ROWS && nc >= 0 && nc <= nr) {
        en.r = nr; en.c = nc; en.animZ = 1;
      }

      if (en.r === qbert.r && en.c === qbert.c) {
        dieSound(); lives--;
        ctx.platform.haptic('heavy');
        qbert = { r: 0, c: 0, z: 0, animZ: 0 };
        if (lives <= 0) { gameOver = true; gameOverSound(); ctx.platform.fail({ reason: 'caught' }); }
      }
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }

      // 4-zone directional tap
      const cx = W / 2, cy = H * 0.5;
      const dx = t.clientX - cx, dy = t.clientY - cy;
      let dr = 0, dc = 0;

      // Upper-left = hop UL (-1, -1 in row/col perspective... actually UL=(-1,0), UR=(-1,+1... wait
      // Q*bert iso layout: UL = r-1,c-1? No. Row 0 is apex.
      // From row r, col c:
      //   UL = r-1, c-1 (if c>0)... actually in this pyramid UL = r-1, c  and UR = r-1, c+1... hmm
      // Let me define: top-left hop = go to parent-left = r-1, c-1 (but c must >= 0)
      //                top-right hop = r-1, c
      //                bottom-left = r+1, c
      //                bottom-right = r+1, c+1

      if (dy < 0) {
        // upper half
        if (dx < 0) { dr = -1; dc = -1; } // UL
        else { dr = -1; dc = 0; }          // UR
      } else {
        // lower half
        if (dx < 0) { dr = 1; dc = 0; }   // LL
        else { dr = 1; dc = 1; }           // LR
      }

      moveQbert(dr, dc);
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.raf(dt => {
      const spd = dt / 16;
      g.fillStyle = '#1a0a2e';
      g.fillRect(0, 0, W, H);

      // animate bounce
      qbert.animZ = Math.max(0, qbert.animZ - 0.1 * spd);
      coily.animZ = Math.max(0, coily.animZ - 0.08 * spd);
      sam.animZ = Math.max(0, sam.animZ - 0.08 * spd);

      if (!started) {
        drawPyramid();
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#ff8844';
        g.font = `bold ${Math.floor(H*0.065)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText("Q*BERT", W/2, H*0.32);
        g.fillStyle = '#eee';
        g.font = `${Math.floor(H*0.03)}px sans-serif`;
        g.fillText('TAP 4 DIRECTIONS TO HOP', W/2, H*0.43);
        g.fillText('COLOR ALL CUBES!', W/2, H*0.49);
        g.fillText(`BEST: ${hs}`, W/2, H*0.57);
        return;
      }

      if (!gameOver) {
        // enemies
        coilyTimer -= dt;
        if (coilyTimer <= 0) {
          coilyTimer = Math.max(700, 1800 - level * 80);
          moveEnemy(coily, qbert.r, qbert.c);
        }
        if (sam.active) {
          samTimer -= dt;
          if (samTimer <= 0) {
            samTimer = Math.max(900, 2000 - level * 80);
            // Sam moves randomly and uncolors
            const dr2 = Math.floor(Math.random()*2), dc2 = Math.floor(Math.random()*2);
            const nr = sam.r + (Math.random()<0.5 ? 1 : -1);
            const nc = sam.c + (Math.random()<0.5 ? 1 : 0);
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc <= nr) {
              sam.r = nr; sam.c = nc;
              if (cubes[nr][nc]) cubes[nr][nc].colored = false; // uncolor
              sam.animZ = 1;
            }
          }
        } else if (score > 200 + level * 100) {
          sam.active = true;
        }
      }

      drawPyramid();
      drawCharacters();
      drawHUD();
      drawDirectionGuide();

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f84';
        g.font = `bold ${Math.floor(H*0.065)}px monospace`;
        g.textAlign = 'center';
        g.fillText('GAME OVER', W/2, H*0.38);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`SCORE: ${score}`, W/2, H*0.48);
        g.fillText(`BEST: ${hs}`, W/2, H*0.55);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.032)}px monospace`;
        g.fillText('TAP TO RESTART', W/2, H*0.65);
      }

      function drawPyramid() {
        // Draw back to front
        for (let r = ROWS-1; r >= 0; r--) {
          for (let c = r; c >= 0; c--) {
            const cube = cubes[r][c];
            const { x, y } = tilePos(r, c);
            const colored = cube.colored;

            // top face
            g.beginPath();
            g.moveTo(x, y - TILE_H);
            g.lineTo(x + TILE_W/2, y - TILE_H*0.5);
            g.lineTo(x, y);
            g.lineTo(x - TILE_W/2, y - TILE_H*0.5);
            g.closePath();
            g.fillStyle = colored ? `hsl(${(r*50 + level*30) % 360},70%,50%)` : '#334';
            g.fill();
            g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();

            // left face
            g.beginPath();
            g.moveTo(x - TILE_W/2, y - TILE_H*0.5);
            g.lineTo(x, y);
            g.lineTo(x, y + TILE_H*0.45);
            g.lineTo(x - TILE_W/2, y - TILE_H*0.05);
            g.closePath();
            g.fillStyle = colored ? `hsl(${(r*50 + level*30) % 360},50%,30%)` : '#223';
            g.fill();
            g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();

            // right face
            g.beginPath();
            g.moveTo(x + TILE_W/2, y - TILE_H*0.5);
            g.lineTo(x, y);
            g.lineTo(x, y + TILE_H*0.45);
            g.lineTo(x + TILE_W/2, y - TILE_H*0.05);
            g.closePath();
            g.fillStyle = colored ? `hsl(${(r*50 + level*30) % 360},60%,40%)` : '#223';
            g.fill();
            g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();
          }
        }
      }

      function drawCharacters() {
        // Q*bert (orange, round with snout)
        const qp = isoPos(qbert.r, qbert.c, qbert.animZ + 0.5);
        const qr = TILE_W * 0.28;
        g.fillStyle = '#ff7700';
        g.beginPath(); g.arc(qp.x, qp.y - qr, qr, 0, Math.PI*2); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(qp.x - qr*0.3, qp.y - qr - qr*0.2, qr*0.22, 0, Math.PI*2); g.fill();
        g.fillStyle = '#ff7700';
        g.beginPath(); g.arc(qp.x, qp.y - qr + qr*0.35, qr*0.4, 0.3, Math.PI - 0.3); g.fill(); // snout

        // Coily (purple snake)
        const cp = isoPos(coily.r, coily.c, coily.animZ + 0.5);
        g.fillStyle = '#8844cc';
        g.beginPath(); g.arc(cp.x, cp.y - TILE_W*0.22, TILE_W*0.22, 0, Math.PI*2); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(cp.x - TILE_W*0.08, cp.y - TILE_W*0.26, TILE_W*0.07, 0, Math.PI*2); g.fill();
        // forked tongue
        g.strokeStyle = '#f44'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(cp.x, cp.y - TILE_W*0.13);
        g.lineTo(cp.x - 4, cp.y - TILE_W*0.05); g.stroke();
        g.beginPath(); g.moveTo(cp.x, cp.y - TILE_W*0.13);
        g.lineTo(cp.x + 4, cp.y - TILE_W*0.05); g.stroke();

        // Sam (green smiley)
        if (sam.active) {
          const sp = isoPos(sam.r, sam.c, sam.animZ + 0.4);
          g.fillStyle = '#44bb44';
          g.beginPath(); g.arc(sp.x, sp.y - TILE_W*0.2, TILE_W*0.2, 0, Math.PI*2); g.fill();
          g.fillStyle = '#fff';
          g.font = `${Math.floor(TILE_W*0.25)}px sans-serif`;
          g.textAlign = 'center';
          g.fillText('S', sp.x, sp.y - TILE_W*0.14);
        }
      }

      function drawHUD() {
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.032)}px monospace`;
        g.textAlign = 'left';
        g.fillText(`${score}`, 10, Math.floor(H*0.055));
        g.textAlign = 'right';
        g.fillText(`BEST:${hs}  LV${level+1}`, W-10, Math.floor(H*0.055));
        for (let i = 0; i < lives; i++) {
          g.fillStyle = '#ff7700';
          g.beginPath(); g.arc(W/2 + (i-1)*18, Math.floor(H*0.05), 7, 0, Math.PI*2); g.fill();
        }
      }

      function drawDirectionGuide() {
        const gx = W/2, gy = H*0.92;
        const r = H*0.04;
        g.fillStyle = 'rgba(255,255,255,0.12)';
        // UL arrow
        g.beginPath(); g.arc(gx - r*1.8, gy - r, r, 0, Math.PI*2); g.fill();
        g.beginPath(); g.arc(gx + r*1.8 - r*0.5, gy - r, r, 0, Math.PI*2); g.fill();
        g.beginPath(); g.arc(gx - r*1.3, gy + r, r, 0, Math.PI*2); g.fill();
        g.beginPath(); g.arc(gx + r*1.3, gy + r, r, 0, Math.PI*2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = `${Math.floor(H*0.022)}px monospace`;
        g.textAlign = 'center';
        g.fillText('↖', gx - r*1.8, gy - r + 5);
        g.fillText('↗', gx + r*1.3, gy - r + 5);
        g.fillText('↙', gx - r*1.3, gy + r + 5);
        g.fillText('↘', gx + r*1.3, gy + r + 5);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
