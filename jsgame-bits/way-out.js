// WAY OUT — Maze Navigation Game (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Way Out',
    author: 'plethora',
    description: 'Navigate the maze from top-left to bottom-right.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#B388FF';
    const BG = '#0f0f14';
    const HUD_H = 48;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    // --- Audio ---
    let audioCtx = null;
    const voices = [];
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol = 0.2) {
      if (!audioCtx) return;
      while (voices.length >= 8) { try { voices.shift().stop(); } catch(e){} }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
    }
    function playStep() { playTone(300 + Math.random() * 100, 'sine', 0.05, 0.1); }
    function playWin()  { [523, 659, 784, 1047].forEach((f,i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.3), i * 90)); }
    function playBump() { playTone(180, 'sawtooth', 0.08, 0.15); }

    // --- Difficulty ---
    const DIFFS = [
      { name: 'EASY',  cols:  8, rows:  8, key: 'hs_wayout_easy' },
      { name: 'MED',   cols: 12, rows: 12, key: 'hs_wayout_med'  },
      { name: 'HARD',  cols: 16, rows: 16, key: 'hs_wayout_hard' },
    ];
    let diffIdx = 0;

    // --- State ---
    let maze = [];       // maze[r][c] = { n,s,e,w } walls (true=wall)
    let player = { r: 0, c: 0 };
    let trail = [];      // [{r,c}]
    let timer = 0;
    let running = false;
    let won = false;
    let showInfo = false;
    let started = false;
    let winAnim = 0;

    // pathfinding for tap-to-move
    let movePath = [];   // queued steps
    let moveT = 0;
    const MOVE_INTERVAL = 0.07; // seconds per step

    // touch for swipe
    let touchStart = null;

    function diffName() { return DIFFS[diffIdx].name; }
    function diffKey()  { return DIFFS[diffIdx].key; }
    function mazeSize() { return { cols: DIFFS[diffIdx].cols, rows: DIFFS[diffIdx].rows }; }

    // --- Maze generation: recursive backtracking ---
    function generateMaze(cols, rows) {
      // Init all cells with all walls
      const cells = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ({ n: true, s: true, e: true, w: true, visited: false }))
      );
      function inBounds(r, c) { return r >= 0 && r < rows && c >= 0 && c < cols; }
      const DIRS = [
        { dr: -1, dc:  0, from: 'n', to: 's' },
        { dr:  1, dc:  0, from: 's', to: 'n' },
        { dr:  0, dc: -1, from: 'w', to: 'e' },
        { dr:  0, dc:  1, from: 'e', to: 'w' },
      ];
      function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }
      // Iterative DFS to avoid stack overflow on large grids
      const stack = [[0, 0]];
      cells[0][0].visited = true;
      while (stack.length) {
        const [r, c] = stack[stack.length - 1];
        const dirs = shuffle([...DIRS]);
        let moved = false;
        for (const d of dirs) {
          const nr = r + d.dr, nc = c + d.dc;
          if (inBounds(nr, nc) && !cells[nr][nc].visited) {
            cells[r][c][d.from] = false;
            cells[nr][nc][d.to] = false;
            cells[nr][nc].visited = true;
            stack.push([nr, nc]);
            moved = true;
            break;
          }
        }
        if (!moved) stack.pop();
      }
      return cells;
    }

    function startGame() {
      const { cols, rows } = mazeSize();
      maze = generateMaze(cols, rows);
      player = { r: 0, c: 0 };
      trail = [{ r: 0, c: 0 }];
      timer = 0;
      running = false;
      won = false;
      winAnim = 0;
      movePath = [];
      moveT = 0;
    }

    // BFS pathfinding within maze
    function findMazePath(sr, sc, er, ec) {
      const { cols, rows } = mazeSize();
      const prev = Array.from({ length: rows }, () => Array(cols).fill(null));
      const queue = [[sr, sc]];
      prev[sr][sc] = 'start';
      const DIRS = [
        { dr: -1, dc: 0, wall: 'n' },
        { dr:  1, dc: 0, wall: 's' },
        { dr:  0, dc:-1, wall: 'w' },
        { dr:  0, dc: 1, wall: 'e' },
      ];
      while (queue.length) {
        const [r, c] = queue.shift();
        if (r === er && c === ec) {
          // reconstruct
          const path = [];
          let cr = er, cc = ec;
          while (!(cr === sr && cc === sc)) {
            path.unshift([cr, cc]);
            const [pr, pc] = prev[cr][cc];
            cr = pr; cc = pc;
          }
          return path;
        }
        for (const d of DIRS) {
          const nr = r + d.dr, nc = c + d.dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (maze[r][c][d.wall]) continue; // wall
          if (prev[nr][nc] !== null) continue;
          prev[nr][nc] = [r, c];
          queue.push([nr, nc]);
        }
      }
      return [];
    }

    // Grid display
    function mazeLayout() {
      const { cols, rows } = mazeSize();
      const DIFF_BTN_H = 36;
      const TOP = HUD_H + DIFF_BTN_H + 8;
      const AVAIL_W = W - 32;
      const AVAIL_H = H - TOP - SAFE - 16;
      const cellSize = Math.min(Math.floor(AVAIL_W / cols), Math.floor(AVAIL_H / rows));
      const ox = Math.floor((W - cellSize * cols) / 2);
      const oy = TOP;
      return { cellSize, ox, oy };
    }

    function cellCenter(r, c) {
      const { cellSize, ox, oy } = mazeLayout();
      return { x: ox + c * cellSize + cellSize / 2, y: oy + r * cellSize + cellSize / 2 };
    }

    startGame();

    // --- Touch ---
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      if (Math.hypot(tx - IBTN.x, ty - IBTN.y) <= IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (won) {
        startGame();
        started = false;
        return;
      }

      // Difficulty buttons
      const { cols, rows } = mazeSize();
      const DIFF_BTN_H = 36;
      const btnY = HUD_H + 2;
      const btnW = (W - 32) / DIFFS.length;
      for (let i = 0; i < DIFFS.length; i++) {
        const bx = 16 + i * btnW;
        if (tx >= bx && tx <= bx + btnW - 4 && ty >= btnY && ty <= btnY + DIFF_BTN_H - 4) {
          if (diffIdx !== i) {
            diffIdx = i;
            startGame();
            started = false;
          }
          return;
        }
      }

      touchStart = { x: tx, y: ty };

      if (!started) {
        started = true;
        running = true;
        ctx.platform.start();
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!touchStart || won || showInfo) { touchStart = null; return; }
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;
      const dx = tx - touchStart.x, dy = ty - touchStart.y;
      const dist = Math.hypot(dx, dy);
      touchStart = null;

      if (!running) return;

      const { cols, rows } = mazeSize();
      const { cellSize, ox, oy } = mazeLayout();

      if (dist >= 20) {
        // swipe direction
        let dr = 0, dc = 0;
        if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1;
        else dr = dy > 0 ? 1 : -1;
        const wall = dr === -1 ? 'n' : dr === 1 ? 's' : dc === -1 ? 'w' : 'e';
        if (!maze[player.r][player.c][wall]) {
          const nr = player.r + dr, nc = player.c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            movePath = [[nr, nc]];
            moveT = 0;
          }
        } else {
          playBump();
          ctx.platform.haptic('light');
        }
      } else {
        // tap — pathfind to tapped cell
        const tc = Math.floor((tx - ox) / cellSize);
        const tr = Math.floor((ty - oy) / cellSize);
        if (tr >= 0 && tr < rows && tc >= 0 && tc < cols) {
          movePath = findMazePath(player.r, player.c, tr, tc);
          moveT = 0;
        }
      }
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    // Format time mm:ss.t
    function fmtTime(s) {
      const m = Math.floor(s / 60);
      const ss = (s % 60).toFixed(1).padStart(4, '0');
      return `${m}:${ss}`;
    }

    // --- Draw ---
    ctx.raf((dt) => {
      const sec = dt / 1000;
      if (running && !won) timer += sec;

      // Move player along path
      if (movePath.length > 0 && running) {
        moveT += sec;
        while (moveT >= MOVE_INTERVAL && movePath.length > 0) {
          moveT -= MOVE_INTERVAL;
          const [nr, nc] = movePath.shift();
          player.r = nr; player.c = nc;
          // add to trail
          if (!trail.some(p => p.r === nr && p.c === nc)) {
            trail.push({ r: nr, c: nc });
          }
          playStep();
          const { cols, rows } = mazeSize();
          if (nr === rows - 1 && nc === cols - 1) {
            won = true;
            winAnim = 1;
            running = false;
            movePath = [];
            playWin();
            ctx.platform.haptic('heavy');
            ctx.platform.complete({ durationMs: timer * 1000 });
            // save best time
            const best = ctx.storage.get(diffKey());
            if (!best || timer < best) ctx.storage.set(diffKey(), timer);
          }
        }
      }

      if (winAnim > 0) winAnim = Math.max(0, winAnim - sec * 1.5);

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const { cols, rows } = mazeSize();
      const { cellSize, ox, oy } = mazeLayout();
      const wallW = Math.max(1, Math.round(cellSize * 0.08));

      // Draw maze
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = ox + c * cellSize;
          const y = oy + r * cellSize;
          const cell = maze[r][c];

          // Trail cells
          const inTrail = trail.some(p => p.r === r && p.c === c);
          if (inTrail) {
            g.fillStyle = 'rgba(179,136,255,0.08)';
            g.fillRect(x, y, cellSize, cellSize);
          }

          // Walls
          g.strokeStyle = 'rgba(179,136,255,0.5)';
          g.lineWidth = wallW;
          g.lineCap = 'square';

          if (cell.n) {
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + cellSize, y); g.stroke();
          }
          if (cell.s && r === rows - 1) {
            g.beginPath(); g.moveTo(x, y + cellSize); g.lineTo(x + cellSize, y + cellSize); g.stroke();
          }
          if (cell.w) {
            g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + cellSize); g.stroke();
          }
          if (cell.e && c === cols - 1) {
            g.beginPath(); g.moveTo(x + cellSize, y); g.lineTo(x + cellSize, y + cellSize); g.stroke();
          }
        }
      }

      // Draw trail dots
      const trailColor = 'rgba(179,136,255,0.35)';
      for (const tp of trail) {
        if (tp.r === player.r && tp.c === player.c) continue;
        const { x, y } = cellCenter(tp.r, tp.c);
        g.fillStyle = trailColor;
        g.beginPath(); g.arc(x, y, Math.max(2, cellSize * 0.12), 0, Math.PI * 2); g.fill();
      }

      // Exit glow
      const exitCenter = cellCenter(rows - 1, cols - 1);
      const exitGlow = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
      const exitGrad = g.createRadialGradient(exitCenter.x, exitCenter.y, 0, exitCenter.x, exitCenter.y, cellSize);
      exitGrad.addColorStop(0, `rgba(179,136,255,${(0.5 * exitGlow).toFixed(2)})`);
      exitGrad.addColorStop(1, 'rgba(179,136,255,0)');
      g.fillStyle = exitGrad;
      g.fillRect(exitCenter.x - cellSize, exitCenter.y - cellSize, cellSize * 2, cellSize * 2);
      g.fillStyle = ACCENT;
      g.font = `bold ${Math.max(8, cellSize * 0.4)}px monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('X', exitCenter.x, exitCenter.y);

      // Player
      const pc = cellCenter(player.r, player.c);
      const pr = Math.max(4, cellSize * 0.28);
      // glow
      const pGrad = g.createRadialGradient(pc.x, pc.y, 0, pc.x, pc.y, pr * 2.5);
      pGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
      pGrad.addColorStop(1, 'rgba(179,136,255,0)');
      g.fillStyle = pGrad;
      g.beginPath(); g.arc(pc.x, pc.y, pr * 2.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(pc.x, pc.y, pr, 0, Math.PI * 2); g.fill();

      // Win pulse overlay
      if (winAnim > 0) {
        g.fillStyle = `rgba(179,136,255,${(winAnim * 0.2).toFixed(3)})`;
        g.fillRect(0, 0, W, H);
      }

      // Difficulty buttons
      const DIFF_BTN_H = 30;
      const btnY = HUD_H + 6;
      const btnW = (W - 32) / DIFFS.length;
      for (let i = 0; i < DIFFS.length; i++) {
        const bx = 16 + i * btnW;
        const active = i === diffIdx;
        g.fillStyle = active ? 'rgba(179,136,255,0.25)' : 'rgba(255,255,255,0.05)';
        g.beginPath(); g.roundRect(bx, btnY, btnW - 4, DIFF_BTN_H, 6); g.fill();
        g.strokeStyle = active ? ACCENT : 'rgba(255,255,255,0.15)';
        g.lineWidth = active ? 1.5 : 1;
        g.beginPath(); g.roundRect(bx, btnY, btnW - 4, DIFF_BTN_H, 6); g.stroke();
        g.fillStyle = active ? ACCENT : 'rgba(255,255,255,0.4)';
        g.font = `bold ${active ? 12 : 11}px monospace`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(DIFFS[i].name, bx + (btnW - 4) / 2, btnY + DIFF_BTN_H / 2);
        const bestT = ctx.storage.get(DIFFS[i].key);
        if (bestT) {
          g.fillStyle = 'rgba(255,255,255,0.3)';
          g.font = '9px monospace';
          g.fillText(fmtTime(bestT), bx + (btnW - 4) / 2, btnY + DIFF_BTN_H - 4);
        }
      }

      // HUD
      g.fillStyle = 'rgba(15,15,20,0.92)';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = ACCENT;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      g.fillStyle = ACCENT;
      g.font = 'bold 16px monospace';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('WAY OUT', 16, 24);

      g.textAlign = 'right';
      g.fillStyle = running || won ? '#fff' : '#555';
      g.fillText(fmtTime(timer), W - 50, 24);

      // Start prompt
      if (!started && !won) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = ACCENT;
        g.font = 'bold 22px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TAP TO START', W/2, H/2);
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = '13px monospace';
        g.fillText('Tap a cell or swipe to move', W/2, H/2 + 32);
      }

      // Won overlay
      if (won) {
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 30px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('YOU ESCAPED!', W/2, H/2 - 40);
        g.fillStyle = '#fff';
        g.font = '18px monospace';
        g.fillText(fmtTime(timer), W/2, H/2 + 0);
        const bestT = ctx.storage.get(diffKey());
        if (bestT) {
          g.fillStyle = 'rgba(255,255,255,0.5)';
          g.font = '13px monospace';
          g.fillText('BEST: ' + fmtTime(bestT), W/2, H/2 + 28);
        }
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = '13px monospace';
        g.fillText('TAP TO PLAY AGAIN', W/2, H/2 + 58);
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.9)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 20px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('HOW TO PLAY', W/2, H/2 - 100);
        g.fillStyle = '#ccc';
        g.font = '14px monospace';
        const lines = [
          'Navigate from top-left to X.',
          'Tap a cell: auto-pathfind there.',
          'Swipe: move one step that way.',
          'Beat your best time per difficulty.',
          'New maze generated each game.',
        ];
        lines.forEach((l, i) => g.fillText(l, W/2, H/2 - 45 + i * 28));
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = '13px monospace';
        g.fillText('TAP ANYWHERE TO CLOSE', W/2, H/2 + 110);
      }

      // IBTN — drawn LAST
      g.fillStyle = 'rgba(179,136,255,0.12)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ACCENT;
      g.font = 'bold 14px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y);
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
