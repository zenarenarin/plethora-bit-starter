window.plethoraBit = {
  meta: {
    title: 'Fillomino',
    author: 'plethora',
    description: 'Fill the grid with polyomino numbers.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#26C6DA';
    const BG = '#0f0f14';

    const N = 6;

    // Procedural puzzle generator
    function generatePuzzle(gridN) {
      gridN = gridN || N;
      const sol = Array.from({length:gridN},()=>Array(gridN).fill(0));
      const regionId = Array.from({length:gridN},()=>Array(gridN).fill(-1));
      const regions = []; // [{cells:[...], size:n}]

      // Flood fill with random region sizes 1-4
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++){
        if(regionId[r][c]>=0) continue;
        const size=1+Math.floor(Math.random()*4);
        const id=regions.length;
        const cells=[[r,c]];
        regionId[r][c]=id;
        // BFS grow
        const q=[[r,c]];
        while(q.length&&cells.length<size){
          const[cr,cc]=q.shift();
          const dirs=[[0,1],[0,-1],[1,0],[-1,0]].sort(()=>Math.random()-0.5);
          for(const[dr,dc]of dirs){
            const nr=cr+dr,nc=cc+dc;
            if(nr>=0&&nr<gridN&&nc>=0&&nc<gridN&&regionId[nr][nc]<0&&cells.length<size){
              regionId[nr][nc]=id; cells.push([nr,nc]); q.push([nr,nc]);
            }
          }
        }
        const actualSize=cells.length;
        for(const[cr,cc]of cells) sol[cr][cc]=actualSize;
        regions.push({cells,size:actualSize});
      }

      // Show ~40% of cells as given clues
      const given=Array.from({length:gridN},()=>Array(gridN).fill(0));
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++) if(Math.random()<0.4) given[r][c]=sol[r][c];

      return { solution:sol, clues:given, regionId };
    }

    let currentPuzzle = generatePuzzle(N);
    let showSolution = false;
    const EYE_X = W - 44, EYE_CY = 62, EYE_R = 20;

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let selectedCell = null; // {r, c}
    let userGrid = null; // 6x6 of numbers entered by user (0=empty)
    let audioCtx = null;
    let solveAnimStart = 0;
    let cellFlash = {}; // key "r,c" -> startMs

    function applySolution() {
      const p = currentPuzzle;
      for(let r=0;r<N;r++) for(let c=0;c<N;c++) userGrid[r][c]=p.solution[r][c];
    }

    function initPuzzle() {
      currentPuzzle = generatePuzzle(N);
      const p = currentPuzzle;
      userGrid = Array.from({ length: N }, (_, r) =>
        Array.from({ length: N }, (_, c) => p.clues[r][c])
      );
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      selectedCell = null;
      cellFlash = {};
      solveAnimStart = 0;
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 48;
      const PAD_TOP = HUD_H + 12;
      const numPadH = 56;
      const PAD_BOT = numPadH + 16;
      const avail = Math.min(W - 32, USABLE_H - PAD_TOP - PAD_BOT);
      const CELL = Math.floor(avail / N);
      const gridW = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = PAD_TOP + Math.floor((USABLE_H - PAD_TOP - PAD_BOT - gridW) / 2);
      const padY = USABLE_H - PAD_BOT + 8;
      return { CELL, ox, oy, padY, numPadH };
    }

    function cellAt(tx, ty, layout) {
      const { CELL, ox, oy } = layout;
      const c = Math.floor((tx - ox) / CELL);
      const r = Math.floor((ty - oy) / CELL);
      if (r < 0 || r >= N || c < 0 || c >= N) return null;
      return { r, c };
    }

    function numPadAt(tx, ty, layout) {
      const { padY, numPadH, CELL, ox } = layout;
      if (ty < padY || ty > padY + numPadH) return null;
      // digits 1-6 arranged centered
      const btnW = Math.min(Math.floor((W - 32) / 7), 52);
      const totalW = btnW * 6 + 8 * 5;
      const startX = Math.floor((W - totalW) / 2);
      for (let d = 1; d <= 6; d++) {
        const bx = startX + (d - 1) * (btnW + 8);
        if (tx >= bx && tx <= bx + btnW) return d;
      }
      return null;
    }

    // Check whether polyominoes in userGrid match the rules
    function checkSolved() {
      // Every cell must be filled
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (!userGrid[r][c]) return false;

      // BFS flood-fill to find connected regions
      const visited = Array.from({ length: N }, () => Array(N).fill(false));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (visited[r][c]) continue;
          const val = userGrid[r][c];
          // BFS
          const queue = [{ r, c }];
          visited[r][c] = true;
          const region = [{ r, c }];
          while (queue.length) {
            const { r: cr, c: cc } = queue.shift();
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nr = cr + dr, nc = cc + dc;
              if (nr >= 0 && nr < N && nc >= 0 && nc < N && !visited[nr][nc] && userGrid[nr][nc] === val) {
                visited[nr][nc] = true;
                queue.push({ r: nr, c: nc });
                region.push({ r: nr, c: nc });
              }
            }
          }
          if (region.length !== val) return false;
        }
      }
      return true;
    }

    function isSameRegion(r1, c1, r2, c2) {
      return userGrid[r1][c1] !== 0 &&
             userGrid[r1][c1] === userGrid[r2][c2] &&
             areCellsConnected(r1, c1, r2, c2, userGrid[r1][c1]);
    }

    function areCellsConnected(r1, c1, r2, c2, val) {
      const visited = Array.from({ length: N }, () => Array(N).fill(false));
      const queue = [{ r: r1, c: c1 }];
      visited[r1][c1] = true;
      while (queue.length) {
        const { r, c } = queue.shift();
        if (r === r2 && c === c2) return true;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < N && nc >= 0 && nc < N && !visited[nr][nc] && userGrid[nr][nc] === val) {
            visited[nr][nc] = true;
            queue.push({ r: nr, c: nc });
          }
        }
      }
      return false;
    }

    // Returns true if two adjacent cells should have a thick border between them
    function thickBorder(r1, c1, r2, c2) {
      const v1 = userGrid[r1][c1];
      const v2 = userGrid[r2][c2];
      if (v1 === 0 || v2 === 0) return true;
      if (v1 !== v2) return true;
      return !areCellsConnected(r1, c1, r2, c2, v1);
    }

    function triggerSolve(now) {
      solved = true;
      solveAnimStart = now;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_fillomino') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_fillomino', solveTime);
      ctx.platform.complete({ score: Math.floor(10000 - solveTime / 100), durationMs: solveTime });
      playChord();
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap(freq) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = freq || 660;
      o.type = 'sine';
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    }

    function playChord() {
      if (!audioCtx) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        gain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.06);
        gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + i * 0.06 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.06 + 0.5);
        o.start(audioCtx.currentTime + i * 0.06);
        o.stop(audioCtx.currentTime + i * 0.06 + 0.5);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    // Soft colors per number value 1-6
    const NUM_COLORS = ['', '#26C6DA44', '#EC407A44', '#FFA72644', '#66BB6A44', '#AB47BC44', '#EF535044'];
    const NUM_TEXT   = ['', '#26C6DA',   '#EC407A',   '#FFA726',   '#66BB6A',   '#AB47BC',   '#EF5350'];

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const layout = getLayout();
      const { CELL, ox, oy, padY, numPadH } = layout;

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('FILLOMINO', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Grid background
      g.fillStyle = '#161620';
      g.beginPath();
      if (g.roundRect) g.roundRect(ox - 4, oy - 4, N * CELL + 8, N * CELL + 8, 10);
      else g.rect(ox - 4, oy - 4, N * CELL + 8, N * CELL + 8);
      g.fill();

      // Draw cells
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const val = userGrid[r][c];
          const isLocked = currentPuzzle.clues[r][c] !== 0;
          const isSelected = selectedCell && selectedCell.r === r && selectedCell.c === c;

          // Cell background
          const flashKey = `${r},${c}`;
          let flashAlpha = 0;
          if (cellFlash[flashKey]) {
            const t = (now - cellFlash[flashKey]) / 300;
            if (t > 1) delete cellFlash[flashKey];
            else flashAlpha = (1 - t);
          }

          g.fillStyle = val > 0 ? NUM_COLORS[Math.min(val, 6)] : '#1a1a26';
          if (isSelected) g.fillStyle = ACCENT + '33';
          g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);

          if (flashAlpha > 0) {
            g.fillStyle = `rgba(38,198,218,${flashAlpha * 0.3})`;
            g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
          }

          // Number
          if (val > 0) {
            g.font = `bold ${Math.floor(CELL * 0.44)}px -apple-system, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = isLocked ? '#ffffff' : NUM_TEXT[Math.min(val, 6)];
            if (isLocked) {
              g.fillStyle = '#ffffff';
              g.globalAlpha = 1;
            }
            g.fillText(String(val), cx + CELL / 2, cy + CELL / 2);
          }

          // Selection ring
          if (isSelected) {
            g.strokeStyle = ACCENT;
            g.lineWidth = 2;
            g.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
          }
        }
      }

      // Draw thick borders between different polyomino regions
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;

          // Right border
          if (c < N - 1 && thickBorder(r, c, r, c + 1)) {
            g.strokeStyle = BG;
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(cx + CELL, cy + 1);
            g.lineTo(cx + CELL, cy + CELL - 1);
            g.stroke();
          }
          // Bottom border
          if (r < N - 1 && thickBorder(r, c, r + 1, c)) {
            g.strokeStyle = BG;
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(cx + 1, cy + CELL);
            g.lineTo(cx + CELL - 1, cy + CELL);
            g.stroke();
          }
        }
      }

      // Thin grid lines
      g.strokeStyle = '#ffffff11';
      g.lineWidth = 0.5;
      for (let i = 0; i <= N; i++) {
        g.beginPath();
        g.moveTo(ox + i * CELL, oy);
        g.lineTo(ox + i * CELL, oy + N * CELL);
        g.stroke();
        g.beginPath();
        g.moveTo(ox, oy + i * CELL);
        g.lineTo(ox + N * CELL, oy + i * CELL);
        g.stroke();
      }

      // Outer border
      g.strokeStyle = ACCENT + '55';
      g.lineWidth = 1.5;
      g.strokeRect(ox, oy, N * CELL, N * CELL);

      // Number pad
      const btnW = Math.min(Math.floor((W - 32) / 7), 52);
      const totalBtnW = btnW * 6 + 8 * 5;
      const startX = Math.floor((W - totalBtnW) / 2);
      for (let d = 1; d <= 6; d++) {
        const bx = startX + (d - 1) * (btnW + 8);
        const by = padY;
        const isActive = selectedCell && userGrid[selectedCell.r][selectedCell.c] === d;

        g.fillStyle = isActive ? ACCENT + '33' : '#1e1e2e';
        g.beginPath();
        if (g.roundRect) g.roundRect(bx, by, btnW, 44, 8);
        else g.rect(bx, by, btnW, 44);
        g.fill();

        g.strokeStyle = isActive ? ACCENT : '#ffffff22';
        g.lineWidth = 1.5;
        g.beginPath();
        if (g.roundRect) g.roundRect(bx, by, btnW, 44, 8);
        else g.rect(bx, by, btnW, 44);
        g.stroke();

        g.font = `bold ${Math.floor(btnW * 0.45)}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = isActive ? ACCENT : NUM_TEXT[d];
        g.fillText(String(d), bx + btnW / 2, by + 22);
      }

      // Eye/solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      // Info button
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 13px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);

        const cw = Math.floor(W * 0.85);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.78), 480);
        const cy2 = Math.floor((USABLE_H - ch) / 2);

        g.fillStyle = '#1a1a2e';
        g.beginPath();
        if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
        g.fill();

        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('FILLOMINO', W / 2, cy2 + 50);

        const lx = cx2 + 20;
        let ty = cy2 + 72;
        const lh = 24;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Fill every empty cell with a number',
          '• Cells with the same number must form',
          '  connected groups (polyominoes)',
          '• Each group\'s size must exactly equal',
          '  the number it contains',
          '• White numbers are locked clues',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffffcc';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillText('Tap a cell → select it', lx, ty); ty += lh;
        g.fillText('Tap a number pad button → fill cell', lx, ty); ty += lh;
        g.fillText('Tap same number again → clear cell', lx, ty);

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      // Solved overlay
      if (solved) {
        const elapsed2 = now - solveAnimStart;
        if (elapsed2 > 400) {
          g.fillStyle = 'rgba(15,15,20,0.88)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 16);
          const best = ctx.storage.get('bt_fillomino') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 16);

          g.fillStyle = ACCENT + '22';
          g.beginPath();
          if (g.roundRect) g.roundRect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          else g.rect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48);
          g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath();
          if (g.roundRect) g.roundRect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          else g.rect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48);
          g.stroke();
          g.font = 'bold 16px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.fillText('NEW PUZZLE', W / 2, USABLE_H / 2 + 74);
        }
      }

      // Banner when solution is showing
      if (showSolution) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, USABLE_H - 48, W, 48);
        g.fillStyle = ACCENT;
        g.font = 'bold 15px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TAP ANYWHERE FOR NEW PUZZLE', W / 2, USABLE_H - 24);
      }
    });

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      // Eye/solution button check
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R) {
        showSolution = true;
        applySolution();
        return;
      }

      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo; return;
      }
      if (showInfo) { showInfo = false; return; }

      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved) {
        if (performance.now() - solveAnimStart > 400) {
          initPuzzle();
        }
        return;
      }

      const layout = getLayout();

      // Check number pad
      const padNum = numPadAt(tx, ty, layout);
      if (padNum !== null) {
        if (!gameStarted) { gameStarted = true; startTime = performance.now(); ctx.platform.start(); }
        if (selectedCell) {
          const { r, c } = selectedCell;
          if (currentPuzzle.clues[r][c] !== 0) return; // locked
          if (userGrid[r][c] === padNum) {
            userGrid[r][c] = 0;
          } else {
            userGrid[r][c] = padNum;
            cellFlash[`${r},${c}`] = performance.now();
          }
          ctx.platform.haptic('light');
          playTap(440 + padNum * 55);
          ctx.platform.interact({ type: 'tap' });
          if (checkSolved()) triggerSolve(performance.now());
        }
        return;
      }

      // Check grid cell
      const cell = cellAt(tx, ty, layout);
      if (cell) {
        if (!gameStarted) { gameStarted = true; startTime = performance.now(); ctx.platform.start(); }
        selectedCell = cell;
        ctx.platform.haptic('light');
        playTap(550);
        return;
      }

      selectedCell = null;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });
    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
