window.plethoraBit = {
  meta: {
    title: 'Kurotto',
    author: 'plethora',
    description: 'Shade cells so every circle sum is satisfied.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FF7043';
    const BG = '#0f0f14';
    const CELL_EMPTY = '#1a1a26';
    const CELL_SHADED = '#FF7043';
    const GRID_LINE = '#ffffff18';
    const N = 6;

    // ---------------------------------------------------------------
    // Procedural generator
    // ---------------------------------------------------------------
    function generateKurotto(N2) {
      const black = Array.from({length: N2}, () => Array(N2).fill(false));
      for (let r = 0; r < N2; r++)
        for (let c = 0; c < N2; c++)
          if (Math.random() < 0.22) black[r][c] = true;

      // Compute connected component sizes
      const groupSize = Array.from({length: N2}, () => Array(N2).fill(0));
      const visited = Array.from({length: N2}, () => Array(N2).fill(false));
      const DIRS = [[0,1],[0,-1],[1,0],[-1,0]];
      for (let sr = 0; sr < N2; sr++) for (let sc = 0; sc < N2; sc++) {
        if (!black[sr][sc] || visited[sr][sc]) continue;
        const cells = [];
        const q = [[sr,sc]];
        while (q.length) {
          const [r, c] = q.shift();
          if (visited[r][c]) continue;
          visited[r][c] = true;
          cells.push([r,c]);
          for (const [dr,dc] of DIRS) {
            const nr = r+dr, nc = c+dc;
            if (nr>=0&&nr<N2&&nc>=0&&nc<N2&&black[nr][nc]&&!visited[nr][nc]) q.push([nr,nc]);
          }
        }
        for (const [r,c] of cells) groupSize[r][c] = cells.length;
      }

      // Assign clues to ~60% of black cells
      const clues = Array.from({length: N2}, () => Array(N2).fill(-1));
      for (let r = 0; r < N2; r++) for (let c = 0; c < N2; c++) {
        if (!black[r][c]) continue;
        if (Math.random() > 0.6) continue;
        const seen = new Set();
        let sum = 0;
        for (const [dr,dc] of DIRS) {
          const nr = r+dr, nc = c+dc;
          if (nr>=0&&nr<N2&&nc>=0&&nc<N2&&black[nr][nc]) {
            const key = `${nr},${nc}`;
            if (!seen.has(key)) { seen.add(key); sum += groupSize[nr][nc]; }
          }
        }
        clues[r][c] = sum;
      }

      // Build solution grid (black=1)
      const solution = Array.from({length: N2}, (_, r) => Array.from({length: N2}, (__, c) => black[r][c] ? 1 : 0));
      return { name: 'GEN', solution, clues };
    }

    // 5 hand-crafted 6x6 Kurotto puzzles
    // solution[r][c]: 1=shaded, 0=unshaded
    // clues[r][c]: number (>=0) means circle with that value, -1 means no circle
    // Empty circles (value 0) mean no adjacent shaded groups.
    const PUZZLES = [
      {
        name: 'PUZZLE 1',
        solution: [
          [1,0,1,1,0,1],
          [1,0,0,1,0,0],
          [0,0,1,0,0,1],
          [1,0,1,0,0,1],
          [1,0,0,0,1,0],
          [1,1,0,1,1,0],
        ],
        clues: [
          [-1, 3,-1,-1, 2,-1],
          [-1,-1,-1,-1,-1, 0],
          [ 3,-1,-1, 2,-1,-1],
          [-1,-1,-1,-1, 0,-1],
          [-1, 0,-1,-1,-1, 3],
          [-1,-1, 5,-1,-1,-1],
        ],
      },
      {
        name: 'PUZZLE 2',
        solution: [
          [0,1,1,0,1,1],
          [0,0,1,0,0,1],
          [1,0,0,0,1,0],
          [1,1,0,1,1,0],
          [0,1,0,0,1,0],
          [0,1,1,0,0,1],
        ],
        clues: [
          [ 0,-1,-1, 4,-1,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1, 2,-1,-1,-1, 4],
          [-1,-1,-1,-1,-1,-1],
          [ 3,-1,-1, 0,-1,-1],
          [-1,-1,-1,-1, 3,-1],
        ],
      },
      {
        name: 'PUZZLE 3',
        solution: [
          [1,1,0,0,1,0],
          [0,1,0,1,1,0],
          [0,0,0,1,0,1],
          [1,0,1,0,0,1],
          [1,0,1,1,0,0],
          [0,1,0,1,1,0],
        ],
        clues: [
          [-1,-1, 2,-1,-1, 0],
          [-1,-1,-1,-1,-1,-1],
          [ 2,-1,-1,-1, 3,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1, 3,-1,-1,-1, 3],
          [-1,-1,-1,-1,-1,-1],
        ],
      },
      {
        name: 'PUZZLE 4',
        solution: [
          [0,0,1,1,0,0],
          [1,0,0,1,0,1],
          [1,1,0,0,1,1],
          [0,1,1,0,1,0],
          [0,0,1,0,1,0],
          [1,1,0,0,0,1],
        ],
        clues: [
          [ 0,-1,-1,-1, 3,-1],
          [-1,-1, 4,-1,-1,-1],
          [-1,-1,-1, 4,-1,-1],
          [-1,-1,-1,-1,-1, 2],
          [ 4,-1,-1,-1,-1,-1],
          [-1,-1, 2,-1, 0,-1],
        ],
      },
      {
        name: 'PUZZLE 5',
        solution: [
          [1,0,0,1,0,1],
          [1,1,0,1,0,0],
          [0,1,0,0,1,0],
          [0,0,0,1,1,0],
          [1,0,1,0,0,1],
          [1,0,1,1,0,1],
        ],
        clues: [
          [-1,-1, 3,-1,-1,-1],
          [-1,-1,-1,-1, 0,-1],
          [-1,-1,-1, 3,-1,-1],
          [ 2,-1,-1,-1,-1, 2],
          [-1,-1,-1,-1,-1,-1],
          [-1, 5,-1,-1,-1,-1],
        ],
      },
    ];

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showSolution = false;
    const EYE_X = W - 22, EYE_Y = 62, EYE_R = 14;

    let puzzleIdx = ctx.storage.get('kurotto_idx') || 0;
    let currentPuzzle = null;  // the active puzzle (preset or generated)
    let cells = [];      // current shaded state: 1 or 0
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let audioCtx = null;
    let activeVoices = 0;
    let solveAnim = null; // { startTime }
    let cellAnims = {};   // key "r,c" -> { start }

    function applySolution() {
      if (!currentPuzzle) return;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const prev = cells[r][c];
          cells[r][c] = currentPuzzle.solution[r][c];
          if (prev !== cells[r][c]) cellAnims[`${r},${c}`] = performance.now();
        }
    }

    function initPuzzle() {
      // Use hand-crafted presets for the first 5 slots, then procedural
      if (puzzleIdx < PUZZLES.length) {
        currentPuzzle = PUZZLES[puzzleIdx];
      } else {
        currentPuzzle = generateKurotto(N);
      }
      cells = Array.from({ length: N }, () => Array(N).fill(0));
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnim = null;
      cellAnims = {};
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 56;
      const PAD = 20;
      const avail = Math.min(W - PAD * 2, USABLE_H - HUD_H - PAD * 2);
      const CELL = Math.floor(avail / N);
      const gridW = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + Math.floor((USABLE_H - HUD_H - gridW) / 2);
      return { CELL, ox, oy };
    }

    function cellAt(x, y, layout) {
      const { CELL, ox, oy } = layout;
      const c = Math.floor((x - ox) / CELL);
      const r = Math.floor((y - oy) / CELL);
      if (r < 0 || r >= N || c < 0 || c >= N) return null;
      return { r, c };
    }

    // Find all connected components of shaded cells
    function getComponents() {
      const visited = Array.from({ length: N }, () => Array(N).fill(false));
      const components = [];
      const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (cells[r][c] && !visited[r][c]) {
            const comp = [];
            const queue = [[r, c]];
            visited[r][c] = true;
            while (queue.length) {
              const [cr, cc] = queue.shift();
              comp.push([cr, cc]);
              for (const [dr, dc] of dirs) {
                const nr = cr + dr, nc = cc + dc;
                if (nr >= 0 && nr < N && nc >= 0 && nc < N && cells[nr][nc] && !visited[nr][nc]) {
                  visited[nr][nc] = true;
                  queue.push([nr, nc]);
                }
              }
            }
            components.push(comp);
          }
        }
      }
      return components;
    }

    // For a circle at (r,c) with value v, validate it
    // Returns 'ok', 'bad', or 'partial'
    function validateCircle(r, c, v) {
      const comps = getComponents();
      const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
      // Find which components are orthogonally adjacent
      const adjCompIndices = new Set();
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N && cells[nr][nc]) {
          for (let i = 0; i < comps.length; i++) {
            if (comps[i].some(([cr2, cc2]) => cr2 === nr && cc2 === nc)) {
              adjCompIndices.add(i);
            }
          }
        }
      }
      const sum = [...adjCompIndices].reduce((acc, i) => acc + comps[i].length, 0);
      if (v === 0) {
        if (adjCompIndices.size === 0) return 'ok';
        return 'bad';
      }
      if (sum === v) return 'ok';
      if (sum > v) return 'bad';
      return 'partial'; // under-filled so far
    }

    function checkSolved() {
      const puz = currentPuzzle;
      if (!puz) return false;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (puz.clues[r][c] >= 0) {
            if (validateCircle(r, c, puz.clues[r][c]) !== 'ok') return false;
          }
        }
      }
      // Also ensure exact shading matches solution to avoid degenerate states
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (cells[r][c] !== puz.solution[r][c]) return false;
        }
      }
      return true;
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap(shading) {
      if (!audioCtx || activeVoices >= 8) return;
      activeVoices++;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = shading ? 660 : 440;
      o.type = 'sine';
      gain.gain.setValueAtTime(0.10, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
      o.onended = () => { activeVoices--; };
    }

    function playSuccess() {
      if (!audioCtx) return;
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((f, i) => {
        if (activeVoices >= 8) return;
        activeVoices++;
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.frequency.value = f;
        o.type = 'sine';
        const t = audioCtx.currentTime + i * 0.07;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.15, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        o.start(t); o.stop(t + 0.55);
        o.onended = () => { activeVoices--; };
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const puz = currentPuzzle;
      const { CELL, ox, oy } = getLayout();

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD bar
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = ACCENT;
      g.fillText(`KUROTTO`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Grid cells
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const shaded = cells[r][c] === 1;
          const isCircle = puz.clues[r][c] >= 0;

          // Animate scale on toggle
          let scale = 1;
          const key = `${r},${c}`;
          if (cellAnims[key]) {
            const t = Math.min((now - cellAnims[key]) / 140, 1);
            if (t >= 1) { delete cellAnims[key]; }
            else {
              // easeOutBack
              const s = 1.70158;
              scale = 0.7 + 0.3 * (1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2));
            }
          }

          const pad = CELL * (1 - scale) / 2;
          const sz = CELL - 3;

          g.save();
          g.translate(cx + pad, cy + pad);

          // Cell background
          g.beginPath();
          g.roundRect
            ? g.roundRect(1, 1, sz * scale, sz * scale, 5)
            : (g.rect(1, 1, sz * scale, sz * scale));
          g.fillStyle = shaded ? CELL_SHADED : CELL_EMPTY;
          if (shaded) {
            g.shadowColor = ACCENT;
            g.shadowBlur = 10 * scale;
          }
          g.fill();
          g.shadowBlur = 0;

          // Circle overlay
          if (isCircle) {
            const v = puz.clues[r][c];
            const status = validateCircle(r, c, v);
            const centerX = (sz * scale) / 2 + 1;
            const centerY = (sz * scale) / 2 + 1;
            const rad = (sz * scale) * 0.36;

            let circleColor;
            if (status === 'ok') circleColor = '#66BB6A';
            else if (status === 'bad') circleColor = '#EF5350';
            else circleColor = shaded ? '#fff' : '#aaaacc';

            g.beginPath();
            g.arc(centerX, centerY, rad, 0, Math.PI * 2);
            g.fillStyle = shaded ? 'rgba(0,0,0,0.55)' : 'rgba(15,15,20,0.85)';
            g.fill();
            g.strokeStyle = circleColor;
            g.lineWidth = 1.5 * scale;
            if (status === 'ok') {
              g.shadowColor = '#66BB6A';
              g.shadowBlur = 8 * scale;
            } else if (status === 'bad') {
              g.shadowColor = '#EF5350';
              g.shadowBlur = 8 * scale;
            }
            g.stroke();
            g.shadowBlur = 0;

            if (v >= 0) {
              g.font = `bold ${Math.max(10, Math.floor(CELL * 0.38 * scale))}px -apple-system, sans-serif`;
              g.fillStyle = circleColor;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText(String(v), centerX, centerY);
            }
          }

          g.restore();
        }
      }

      // Grid lines
      g.strokeStyle = GRID_LINE;
      g.lineWidth = 1;
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

      // Solve overlay
      if (solved && solveAnim) {
        const elapsed2 = now - solveAnim.startTime;
        if (elapsed2 > 600) {
          g.fillStyle = 'rgba(15,15,20,0.87)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT;
          g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 56);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 12);
          const best = ctx.storage.get('bt_kurotto') || 0;
          g.fillText(`Best: ${best ? formatTime(best) : '--'}`, W / 2, USABLE_H / 2 + 18);

          // Next button
          const bx = W / 2 - 110, by = USABLE_H / 2 + 52, bw = 220, bh = 48;
          g.fillStyle = ACCENT + '22';
          g.beginPath();
          g.roundRect ? g.roundRect(bx, by, bw, bh, 12) : g.rect(bx, by, bw, bh);
          g.fill();
          g.strokeStyle = ACCENT;
          g.lineWidth = 1.5;
          g.beginPath();
          g.roundRect ? g.roundRect(bx, by, bw, bh, 12) : g.rect(bx, by, bw, bh);
          g.stroke();
          g.font = 'bold 15px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.fillText('NEXT PUZZLE', W / 2, by + bh / 2);
        }
      }

      // Info panel
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.90)';
        g.fillRect(0, 0, W, H);

        const cw = Math.floor(W * 0.84);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.74), 480);
        const cy2 = Math.floor((USABLE_H - ch) / 2);

        g.fillStyle = '#1a1a2e';
        g.beginPath();
        g.roundRect ? g.roundRect(cx2, cy2, cw, ch, 16) : g.rect(cx2, cy2, cw, ch);
        g.fill();

        g.save();
        g.globalAlpha = 0.12;
        g.fillStyle = ACCENT;
        g.beginPath();
        g.arc(W / 2, cy2 + 50, 60, 0, Math.PI * 2);
        g.fill();
        g.restore();

        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillText('KUROTTO', W / 2, cy2 + 54);

        const lx = cx2 + 20;
        let ty = cy2 + 80;
        const lh = 23;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.38)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Tap cells to shade them dark',
          '• Each circle shows a target number',
          '• The number = total cells in ALL shaded',
          '  groups touching that circle\'s sides',
          '• A circle with 0 means no adjacent shading',
          '• Circles glow green when satisfied',
          '• Circles glow red when the sum is wrong',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.38)';
        g.fillText('CONTROLS', lx, ty); ty += lh;

        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillText('Tap any cell → shade / unshade', lx, ty);

        g.font = 'bold 12px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.38)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 18);
      }

      // Info button — drawn LAST
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath();
      g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // Eye / solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_Y, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_Y);
      g.restore();

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
      const ty2 = e.changedTouches[0].clientY;

      // IBTN hit check first
      if (Math.hypot(tx - IBTN.x, ty2 - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // Eye / solution button
      if (Math.hypot(tx - EYE_X, ty2 - EYE_Y) < EYE_R + 8) {
        showSolution = true;
        applySolution();
        return;
      }

      if (showSolution) {
        initPuzzle();
        return;
      }

      // Solved screen — tap to advance
      if (solved && solveAnim && performance.now() - solveAnim.startTime > 600) {
        puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
        ctx.storage.set('kurotto_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      const layout = getLayout();
      const cell = cellAt(tx, ty2, layout);
      if (!cell) return;

      if (!gameStarted) {
        ctx.platform.start();
        gameStarted = true;
        startTime = performance.now();
      }

      const { r, c } = cell;
      cells[r][c] = cells[r][c] ? 0 : 1;
      cellAnims[`${r},${c}`] = performance.now();
      playTap(cells[r][c] === 1);
      ctx.platform.interact({ type: 'tap' });
      ctx.platform.haptic('light');

      if (checkSolved()) {
        solved = true;
        solveTime = performance.now() - startTime;
        const best = ctx.storage.get('bt_kurotto') || 0;
        if (!best || solveTime < best) ctx.storage.set('bt_kurotto', solveTime);
        ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
        solveAnim = { startTime: performance.now() };
        playSuccess();
        ctx.platform.haptic('heavy');
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
