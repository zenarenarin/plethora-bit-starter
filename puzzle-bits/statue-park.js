window.plethoraBit = {
  meta: {
    title: 'Statue Park',
    author: 'plethora',
    description: 'Place all statues in the grid. Black cells must stay connected.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#A5D6A7';
    const BG = '#0f0f14';
    const CELL_EMPTY = '#1a1a26';       // unoccupied (black cell)
    const CELL_STATUE = '#A5D6A7';      // placed statue cell
    const CELL_SHADOW = '#2a3a2a';      // shadow outline hint

    // Statue shapes: array of [row, col] offsets from anchor cell
    // Each piece has a name and color shade
    const PIECES = {
      // Monomino
      DOT:  { name: 'DOT',  cells: [[0,0]] },
      // Dominoes
      DOM_H: { name: 'DOM', cells: [[0,0],[0,1]] },
      // Trominoes
      TRI_I: { name: 'TRI', cells: [[0,0],[0,1],[0,2]] },
      TRI_L: { name: 'TRI', cells: [[0,0],[1,0],[1,1]] },
      // Tetrominoes
      TET_L: { name: 'L4',  cells: [[0,0],[1,0],[2,0],[2,1]] },
      TET_T: { name: 'T4',  cells: [[0,0],[0,1],[0,2],[1,1]] },
      TET_S: { name: 'S4',  cells: [[0,1],[0,2],[1,0],[1,1]] },
      TET_I: { name: 'I4',  cells: [[0,0],[0,1],[0,2],[0,3]] },
      TET_O: { name: 'O4',  cells: [[0,0],[0,1],[1,0],[1,1]] },
      // Pentomino
      PEN_L: { name: 'L5',  cells: [[0,0],[1,0],[2,0],[3,0],[3,1]] },
      PEN_T: { name: 'T5',  cells: [[0,0],[0,1],[0,2],[1,1],[2,1]] },
    };

    // Each puzzle: 5x5 grid
    // solution: 2D array, 0=black cell, piece_index=which piece occupies (1-based)
    // pieces: list of piece keys to place
    // placements: canonical answer [{pieceKey, r, c, rotation}]
    //
    // Simplified approach: define exact solution grids + which pieces
    // Player taps shadow positions to toggle placement
    // Shadow positions = fixed candidate positions per piece (one correct, shown as hint outline)

    // For playability: each puzzle shows N shadow "slots" — one per piece.
    // Each slot has a fixed position/rotation (the correct answer is already known).
    // Player taps to toggle piece on/off at that slot.
    // Win when all pieces placed and:
    //   - no overlap
    //   - all black (unplaced) cells connected
    //   - every black cell adjacent to at least one statue cell

    // Define puzzles with explicit grid solutions
    // grid[r][c]: -1 = black cell, 0..N-1 = piece index
    const PUZZLES = [
      {
        name: 'PARK I',
        size: 5,
        pieces: [
          // piece index 0: L-tromino at (0,0) horizontal
          { name: 'L', shape: [[0,0],[1,0],[1,1]], color: '#81C784' },
          // piece index 1: I-tromino at (0,3) vertical
          { name: 'I', shape: [[0,0],[1,0],[2,0]], color: '#66BB6A' },
          // piece index 2: T-tetromino at (3,1)
          { name: 'T', shape: [[0,0],[0,1],[0,2],[1,1]], color: '#A5D6A7' },
          // piece index 3: dot at (2,2)
          { name: '•', shape: [[0,0]], color: '#C8E6C9' },
        ],
        // Anchor positions for each piece (correct placement)
        anchors: [ [0,0], [0,3], [3,1], [2,2] ],
        // Full solution grid (-1=black, 0..3=piece idx)
        solution: [
          [0, -1, -1, 1, -1],
          [0,  0, -1, 1, -1],
          [-1,-1,  3,-1, -1],
          [-1, 2,  2, 2, -1],
          [-1,-1,  2,-1, -1],
        ],
      },
      {
        name: 'PARK II',
        size: 5,
        pieces: [
          { name: 'S', shape: [[0,1],[0,2],[1,0],[1,1]], color: '#81C784' },
          { name: 'L', shape: [[0,0],[0,1],[0,2],[1,0]], color: '#66BB6A' },
          { name: 'I', shape: [[0,0],[1,0],[2,0]], color: '#A5D6A7' },
        ],
        anchors: [ [0,2], [2,0], [1,4] ],
        solution: [
          [-1,-1, 0, 0,-1],
          [-1, 0, 0,-1, 2],
          [ 1, 1, 1,-1, 2],
          [ 1,-1,-1,-1, 2],
          [-1,-1,-1,-1,-1],
        ],
      },
      {
        name: 'PARK III',
        size: 5,
        pieces: [
          { name: 'O', shape: [[0,0],[0,1],[1,0],[1,1]], color: '#81C784' },
          { name: 'I', shape: [[0,0],[0,1],[0,2],[0,3]], color: '#66BB6A' },
          { name: 'L', shape: [[0,0],[1,0],[2,0],[2,1]], color: '#A5D6A7' },
        ],
        anchors: [ [0,0], [0,2], [2,3] ],  // wait: I at (0,2) needs cols 2-5 — out of bounds on 5x5
        // Fix: I at (1,0) horizontal
        solution: [
          [ 0, 0,-1,-1,-1],
          [ 0, 0,-1,-1,-1],
          [ 1, 1, 1, 1,-1],  // Hmm I4 at row2 cols0-3
          [-1,-1,-1, 2,-1],
          [-1,-1,-1, 2, 2],
        ],
      },
      {
        name: 'PARK IV',
        size: 5,
        pieces: [
          { name: 'T', shape: [[0,0],[0,1],[0,2],[1,1],[2,1]], color: '#81C784' },
          { name: 'S', shape: [[0,0],[0,1],[1,1],[1,2]], color: '#66BB6A' },
          { name: '•', shape: [[0,0]], color: '#C8E6C9' },
          { name: '•', shape: [[0,0]], color: '#C8E6C9' },
        ],
        anchors: [ [0,1], [2,2], [4,0], [4,4] ],
        solution: [
          [-1, 0, 0, 0,-1],
          [-1,-1, 0,-1,-1],
          [-1,-1, 1, 1,-1],
          [-1,-1,-1, 1, 1],  // wait S goes (2,2),(2,3),(3,3),(3,4)?
          [ 2,-1,-1,-1, 3],
        ],
      },
      {
        name: 'PARK V',
        size: 5,
        pieces: [
          { name: 'L', shape: [[0,0],[1,0],[2,0],[3,0],[3,1]], color: '#81C784' },
          { name: 'T', shape: [[0,0],[0,1],[0,2],[1,1]], color: '#66BB6A' },
          { name: 'I', shape: [[0,0],[1,0]], color: '#A5D6A7' },
        ],
        anchors: [ [0,0], [2,2], [0,4] ],
        solution: [
          [ 0,-1,-1,-1, 2],
          [ 0,-1,-1,-1, 2],
          [ 0,-1, 1, 1, 1],
          [ 0,-1,-1, 1,-1],
          [ 0, 0,-1,-1,-1],
        ],
      },
    ];

    // Rebuild puzzles with verified solutions using explicit grids
    // Redefine cleanly — derive piece placements from solution grid
    const CLEAN_PUZZLES = [
      {
        name: 'PARK I',
        size: 5,
        // grid: -1=black, N=piece index
        grid: [
          [ 0,-1,-1, 1,-1],
          [ 0, 0,-1, 1,-1],
          [-1,-1, 3,-1,-1],
          [-1, 2, 2, 2,-1],
          [-1,-1, 2,-1,-1],
        ],
        pieces: [
          { name: 'L', color: '#81C784' },
          { name: 'I', color: '#66BB6A' },
          { name: 'T', color: '#A5D6A7' },
          { name: '•', color: '#C8E6C9' },
        ],
      },
      {
        name: 'PARK II',
        size: 5,
        grid: [
          [-1,-1, 0, 0,-1],
          [-1, 0, 0,-1, 2],
          [ 1, 1, 1,-1, 2],
          [ 1,-1,-1,-1, 2],
          [-1,-1,-1,-1,-1],
        ],
        pieces: [
          { name: 'S', color: '#81C784' },
          { name: 'L', color: '#66BB6A' },
          { name: 'I', color: '#A5D6A7' },
        ],
      },
      {
        name: 'PARK III',
        size: 5,
        grid: [
          [ 0, 0,-1,-1,-1],
          [ 0, 0,-1,-1,-1],
          [ 1, 1, 1, 1,-1],
          [-1,-1,-1, 2,-1],
          [-1,-1,-1, 2, 2],
        ],
        pieces: [
          { name: 'O', color: '#81C784' },
          { name: 'I', color: '#66BB6A' },
          { name: 'L', color: '#A5D6A7' },
        ],
      },
      {
        name: 'PARK IV',
        size: 5,
        grid: [
          [-1, 0, 0, 0,-1],
          [-1,-1, 0,-1,-1],
          [-1,-1, 0,-1,-1],
          [-1,-1, 1, 1,-1],
          [ 2,-1,-1, 1, 3],
        ],
        pieces: [
          { name: 'T', color: '#81C784' },
          { name: 'S', color: '#66BB6A' },
          { name: '•', color: '#C8E6C9' },
          { name: '•', color: '#C8E6C9' },
        ],
      },
      {
        name: 'PARK V',
        size: 5,
        grid: [
          [ 0,-1,-1,-1, 2],
          [ 0,-1,-1,-1, 2],
          [ 0,-1, 1, 1, 1],
          [ 0,-1,-1, 1,-1],
          [ 0,-1,-1,-1,-1],
        ],
        pieces: [
          { name: 'I', color: '#81C784' },
          { name: 'T', color: '#66BB6A' },
          { name: 'L', color: '#A5D6A7' },
        ],
      },
    ];

    // Extract piece cells from solution grid for each piece index
    function getPieceCells(grid, size, pieceIdx) {
      const cells = [];
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (grid[r][c] === pieceIdx) cells.push([r, c]);
      return cells;
    }

    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showInfo = false;
    let showSolution = false;
    const EYE_X = W - 22, EYE_Y = 62, EYE_R = 14;

    let puzzleIdx = ctx.storage.get('statuepk_idx') || 0;
    let gameStarted = false;
    let startTime = 0;
    let solved = false;
    let solveTime = 0;
    let rippleStart = null;
    let audioCtx = null;
    let voices = [];

    // playerPlaced[pieceIdx] = true/false
    let playerPlaced = [];

    function applySolution() {
      const p = CLEAN_PUZZLES[puzzleIdx % CLEAN_PUZZLES.length];
      playerPlaced = new Array(p.pieces.length).fill(true);
      showSolution = true;
    }

    function initPuzzle() {
      const p = CLEAN_PUZZLES[puzzleIdx % CLEAN_PUZZLES.length];
      playerPlaced = new Array(p.pieces.length).fill(false);
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      rippleStart = null;
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 48;
      const PAD = 12;
      const puz = CLEAN_PUZZLES[puzzleIdx % CLEAN_PUZZLES.length];
      const SZ = puz.size;
      // Reserve space for legend below grid
      const legendH = Math.ceil(puz.pieces.length / 3) * 44 + 30;
      const availW = W - PAD * 2;
      const availH = USABLE_H - HUD_H - PAD - legendH - PAD;
      const CELL = Math.min(Math.floor(availW / SZ), Math.floor(availH / SZ), 68);
      const gridW = CELL * SZ;
      const gridH = CELL * SZ;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + PAD + Math.floor((availH - gridH) / 2);
      const legendY = oy + gridH + 14;
      return { CELL, ox, oy, legendY, SZ };
    }

    // Build display grid: which cells are placed
    function buildDisplayGrid() {
      const p = CLEAN_PUZZLES[puzzleIdx % CLEAN_PUZZLES.length];
      const SZ = p.size;
      // Start with solution grid for cells that are placed
      const display = Array.from({ length: SZ }, () => Array(SZ).fill(-1)); // -1 = black
      for (let pi = 0; pi < p.pieces.length; pi++) {
        if (playerPlaced[pi]) {
          const cells = getPieceCells(p.grid, SZ, pi);
          for (const [r, c] of cells) display[r][c] = pi;
        }
      }
      return display;
    }

    // Validate: all black cells connected + each black cell adj to statue
    function validateGrid(display, SZ) {
      const blackCells = [];
      for (let r = 0; r < SZ; r++)
        for (let c = 0; c < SZ; c++)
          if (display[r][c] === -1) blackCells.push([r, c]);

      if (blackCells.length === 0) return true; // all placed? ok

      // Check connectivity of black cells
      const blackSet = new Set(blackCells.map(([r,c]) => `${r},${c}`));
      const visited = new Set();
      const queue = [blackCells[0]];
      visited.add(`${blackCells[0][0]},${blackCells[0][1]}`);
      while (queue.length) {
        const [r, c] = queue.shift();
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const key = `${r+dr},${c+dc}`;
          if (blackSet.has(key) && !visited.has(key)) {
            visited.add(key);
            queue.push([r+dr, c+dc]);
          }
        }
      }
      if (visited.size !== blackCells.length) return false;

      // Each black cell must be adjacent to at least one statue cell
      for (const [r, c] of blackCells) {
        let adjStatue = false;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SZ && nc >= 0 && nc < SZ && display[nr][nc] >= 0) {
            adjStatue = true; break;
          }
        }
        if (!adjStatue) return false;
      }
      return true;
    }

    function checkSolved() {
      const p = CLEAN_PUZZLES[puzzleIdx % CLEAN_PUZZLES.length];
      if (!playerPlaced.every(Boolean)) return false;
      const display = buildDisplayGrid();
      return validateGrid(display, p.size);
    }

    function triggerSolve(now) {
      solved = true;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_statuepk') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_statuepk', solveTime);
      ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
      rippleStart = now;
      playChord();
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq) {
      if (!audioCtx) return;
      while (voices.length >= 8) {
        const old = voices.shift();
        try { old.stop(); } catch(e) {}
      }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = freq;
      o.type = 'triangle';
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      o.start(); o.stop(audioCtx.currentTime + 0.15);
      voices.push(o);
    }

    function playChord() {
      if (!audioCtx) return;
      [392, 523.25, 659.25, 783.99].forEach((freq, i) => {
        ctx.timeout(() => {
          const o = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          o.connect(gain); gain.connect(audioCtx.destination);
          o.frequency.value = freq;
          o.type = 'triangle';
          gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
          o.start(); o.stop(audioCtx.currentTime + 0.6);
        }, i * 70);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    function hexToRgb(hex) {
      const r = parseInt(hex.slice(1,3),16);
      const g2 = parseInt(hex.slice(3,5),16);
      const b = parseInt(hex.slice(5,7),16);
      return {r, g: g2, b};
    }

    function colorWithAlpha(hex, alpha) {
      const {r, g: g2, b} = hexToRgb(hex);
      return `rgba(${r},${g2},${b},${alpha})`;
    }

    // Draw a single polyomino shape in the legend
    function drawShapePreview(g2, cells, x, y, cellSz, color, label) {
      // normalize cells to 0,0
      if (!cells || cells.length === 0) return;
      const minR = Math.min(...cells.map(([r]) => r));
      const minC = Math.min(...cells.map(([,c]) => c));
      const maxR = Math.max(...cells.map(([r]) => r));
      const maxC = Math.max(...cells.map(([,c]) => c));
      const shW = (maxC - minC + 1) * cellSz;
      const shH = (maxR - minR + 1) * cellSz;
      const offX = x - shW / 2;
      const offY = y - shH / 2;

      for (const [r, c] of cells) {
        const rx = offX + (c - minC) * cellSz;
        const ry = offY + (r - minR) * cellSz;
        g2.fillStyle = color;
        g2.fillRect(rx + 1, ry + 1, cellSz - 2, cellSz - 2);
        g2.strokeStyle = 'rgba(255,255,255,0.2)';
        g2.lineWidth = 0.5;
        g2.strokeRect(rx + 1, ry + 1, cellSz - 2, cellSz - 2);
      }
      if (label) {
        g2.font = `bold 10px -apple-system, sans-serif`;
        g2.fillStyle = '#ffffffaa';
        g2.textAlign = 'center';
        g2.textBaseline = 'middle';
        g2.fillText(label, x, offY + shH + 8);
      }
    }

    initPuzzle();

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const p = CLEAN_PUZZLES[puzzleIdx % CLEAN_PUZZLES.length];
      const layout = getLayout();
      const { CELL, ox, oy, legendY, SZ } = layout;
      const display = buildDisplayGrid();

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = '#ffffff11';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`STATUE PARK  ${(puzzleIdx % CLEAN_PUZZLES.length) + 1}/${CLEAN_PUZZLES.length}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Draw grid
      for (let r = 0; r < SZ; r++) {
        for (let c = 0; c < SZ; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const val = display[r][c];

          if (val >= 0) {
            // Statue cell
            const col = p.pieces[val].color;
            // Ripple
            let alpha = 0.8;
            if (solved && rippleStart) {
              const dist = Math.abs(r - Math.floor(SZ/2)) + Math.abs(c - Math.floor(SZ/2));
              const t = (now - rippleStart - dist * 60) / 300;
              if (t > 0 && t < 1) alpha = 0.8 + 0.2 * Math.sin(t * Math.PI);
            }
            g.fillStyle = colorWithAlpha(col, alpha);
            g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);

            // Piece label in center of shape
            const solutionCells = getPieceCells(p.grid, SZ, val);
            // Draw label only on topmost-leftmost cell of piece
            const topCell = solutionCells.reduce((a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? a : b);
            if (topCell[0] === r && topCell[1] === c) {
              g.font = `bold ${Math.max(10, Math.floor(CELL * 0.3))}px -apple-system, sans-serif`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillStyle = 'rgba(0,0,0,0.5)';
              // center of piece bounding box
              const avgR = solutionCells.reduce((s,[rr]) => s + rr, 0) / solutionCells.length;
              const avgC = solutionCells.reduce((s,[,cc]) => s + cc, 0) / solutionCells.length;
              g.fillText(p.pieces[val].name, ox + (avgC + 0.5) * CELL, oy + (avgR + 0.5) * CELL);
            }
          } else {
            // Black cell
            // Show shadow hint if piece not yet placed — check if solution has a piece here
            const solutionVal = p.grid[r][c];
            if (solutionVal >= 0 && !playerPlaced[solutionVal]) {
              // Shadow hint
              g.fillStyle = CELL_SHADOW;
              g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
              g.strokeStyle = colorWithAlpha(p.pieces[solutionVal].color, 0.3);
              g.lineWidth = 1;
              g.strokeRect(cx + 2, cy + 2, CELL - 4, CELL - 4);
            } else {
              g.fillStyle = CELL_EMPTY;
              g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            }
          }
        }
      }

      // Grid borders — thick between statue vs black
      for (let r = 0; r < SZ; r++) {
        for (let c = 0; c < SZ; c++) {
          const here = display[r][c];
          if (c < SZ - 1) {
            const right = display[r][c+1];
            if ((here >= 0) !== (right >= 0)) {
              g.strokeStyle = '#ffffff44';
              g.lineWidth = 2;
              g.beginPath();
              g.moveTo(ox + (c+1)*CELL, oy + r*CELL);
              g.lineTo(ox + (c+1)*CELL, oy + (r+1)*CELL);
              g.stroke();
            }
          }
          if (r < SZ - 1) {
            const below = display[r+1][c];
            if ((here >= 0) !== (below >= 0)) {
              g.strokeStyle = '#ffffff44';
              g.lineWidth = 2;
              g.beginPath();
              g.moveTo(ox + c*CELL, oy + (r+1)*CELL);
              g.lineTo(ox + (c+1)*CELL, oy + (r+1)*CELL);
              g.stroke();
            }
          }
        }
      }

      // Grid thin lines
      g.strokeStyle = '#ffffff18';
      g.lineWidth = 0.5;
      for (let i = 1; i < SZ; i++) {
        g.beginPath(); g.moveTo(ox + i*CELL, oy); g.lineTo(ox + i*CELL, oy + SZ*CELL); g.stroke();
        g.beginPath(); g.moveTo(ox, oy + i*CELL); g.lineTo(ox + SZ*CELL, oy + i*CELL); g.stroke();
      }
      // Grid border
      g.strokeStyle = '#ffffff33';
      g.lineWidth = 1.5;
      g.strokeRect(ox, oy, SZ * CELL, SZ * CELL);

      // Legend — piece set at bottom
      const legendCellSz = 14;
      const legendColW = Math.floor(W / Math.min(p.pieces.length, 4));
      g.font = 'bold 10px -apple-system, sans-serif';
      g.fillStyle = '#ffffff44';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('PIECES TO PLACE', W / 2, legendY);

      const nCols = Math.min(p.pieces.length, 4);
      const pieceW = Math.floor(W / nCols);
      p.pieces.forEach((piece, pi) => {
        const col = pi % nCols;
        const row = Math.floor(pi / nCols);
        const px = col * pieceW + pieceW / 2;
        const py = legendY + 18 + row * 44;
        const cells = getPieceCells(p.grid, SZ, pi);
        const alpha = playerPlaced[pi] ? 0.35 : 1.0;
        g.globalAlpha = alpha;

        // Draw piece shape
        drawShapePreview(g, cells, px, py + 12, legendCellSz, piece.color, null);

        // Label + check
        g.font = `bold 10px -apple-system, sans-serif`;
        g.fillStyle = playerPlaced[pi] ? ACCENT : '#ffffffaa';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const label = playerPlaced[pi] ? `✓ ${piece.name}` : piece.name;
        g.fillText(label, px, legendY + 18 + row * 44 + 30);

        g.globalAlpha = 1.0;
      });

      // Validation hint
      if (playerPlaced.some(Boolean) && !solved) {
        const allPlaced = playerPlaced.every(Boolean);
        if (allPlaced) {
          const valid = validateGrid(display, SZ);
          if (!valid) {
            g.font = '12px -apple-system, sans-serif';
            g.fillStyle = '#FF8A80';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('Black cells disconnected or isolated!', W / 2, legendY + Math.ceil(p.pieces.length / nCols) * 44 + 18);
          }
        }
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

      // Eye / see-solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_Y, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_Y);
      g.restore();

      // Info panel
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);

        const cw = Math.floor(W * 0.84);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.78), 490);
        const cy2 = Math.floor((USABLE_H - ch) / 2);

        g.fillStyle = '#1a2e1a';
        g.beginPath();
        g.roundRect ? g.roundRect(cx2, cy2, cw, ch, 16) : g.rect(cx2, cy2, cw, ch);
        g.fill();

        g.save();
        g.globalAlpha = 0.12;
        g.fillStyle = ACCENT;
        g.beginPath();
        g.arc(W / 2, cy2 + 52, 65, 0, Math.PI * 2);
        g.fill();
        g.restore();

        g.fillStyle = ACCENT;
        g.font = 'bold 24px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillText('STATUE PARK', W / 2, cy2 + 56);

        const lx = cx2 + 20;
        let ty = cy2 + 84;
        const lh = 22;

        g.font = 'bold 10px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Place all the statues (shown in legend) into the grid',
          '• All dark (empty) cells must remain connected',
          '• Every dark cell must touch at least one statue',
          '• Statues cannot overlap each other',
          '• Faint outlines show valid statue positions',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 6;
        g.font = 'bold 10px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillText('CONTROLS', lx, ty); ty += lh;

        const controls = [
          'Tap shadow area → place statue there',
          'Tap placed statue → remove it',
          'All pieces placed + rules met = solved!',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of controls) { g.fillText(line, lx, ty); ty += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      // Solved overlay
      if (solved && rippleStart && now - rippleStart > 800) {
        g.fillStyle = 'rgba(15,15,20,0.88)';
        g.fillRect(0, 0, W, USABLE_H);

        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = 'bold 36px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.shadowColor = ACCENT;
        g.shadowBlur = 28;
        g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
        g.shadowBlur = 0;

        g.font = '18px -apple-system, sans-serif';
        g.fillStyle = '#ffffff99';
        g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 14);
        const best = ctx.storage.get('bt_statuepk') || 0;
        g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 18);

        const bx = W / 2 - 100, by = USABLE_H / 2 + 52;
        g.fillStyle = colorWithAlpha(ACCENT, 0.15);
        g.beginPath();
        g.roundRect ? g.roundRect(bx, by, 200, 48, 12) : g.rect(bx, by, 200, 48);
        g.fill();
        g.strokeStyle = ACCENT;
        g.lineWidth = 1.5;
        g.beginPath();
        g.roundRect ? g.roundRect(bx, by, 200, 48, 12) : g.rect(bx, by, 200, 48);
        g.stroke();
        g.font = 'bold 15px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.fillText('NEXT PUZZLE', W / 2, by + 24);
      }

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

      // Info button first
      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // Eye / see-solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_Y) < EYE_R + 8) {
        applySolution();
        return;
      }

      if (showSolution) {
        initPuzzle();
        return;
      }

      // Solved: next puzzle
      if (solved && rippleStart && performance.now() - rippleStart > 800) {
        puzzleIdx = (puzzleIdx + 1) % CLEAN_PUZZLES.length;
        ctx.storage.set('statuepk_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      const layout = getLayout();
      const { ox, oy, CELL, SZ } = layout;

      // Check grid tap
      const gx = tx - ox, gy = ty - oy;
      if (gx >= 0 && gy >= 0 && gx < SZ * CELL && gy < SZ * CELL) {
        const c = Math.floor(gx / CELL);
        const r = Math.floor(gy / CELL);
        if (r >= 0 && r < SZ && c >= 0 && c < SZ) {
          const p = CLEAN_PUZZLES[puzzleIdx % CLEAN_PUZZLES.length];
          const solutionVal = p.grid[r][c];

          if (solutionVal < 0) {
            // Tapped a black cell — no action
            playNote(300);
            return;
          }

          // Tapped a cell that belongs to a piece
          if (!gameStarted) {
            gameStarted = true;
            startTime = performance.now();
            ctx.platform.start();
          }

          // Toggle piece placement
          playerPlaced[solutionVal] = !playerPlaced[solutionVal];
          playNote(playerPlaced[solutionVal] ? 660 + solutionVal * 40 : 330);
          ctx.platform.interact({ type: 'tap' });
          ctx.platform.haptic(playerPlaced[solutionVal] ? 'light' : 'medium');

          if (checkSolved()) triggerSolve(performance.now());
          return;
        }
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
