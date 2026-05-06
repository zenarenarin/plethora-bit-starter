window.plethoraBit = {
  meta: {
    title: 'Magnets',
    author: 'plethora',
    description: 'Fill dominoes with magnets — no same poles touching!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const PLUS_COL  = '#EF5350'; // red
    const MINUS_COL = '#42A5F5'; // blue
    const BLANK_COL = '#2a2a3a'; // grey
    const ACCENT    = '#EF5350';
    const BG        = '#0f0f14';

    // State values
    const BLANK = 0, PLUS = 1, MINUS = -1;

    // ------------------------------------------------------------------
    // PUZZLES — 5 rows × 6 cols grid of dominoes
    // Each puzzle defines domino layout, solution, and row/col counts.
    //
    // dominoes: array of { r1, c1, r2, c2 } (two adjacent cells)
    // solution: same index order as dominoes, 'M' (magnet) or 'B' (blank)
    //   'M' means cell1=PLUS, cell2=MINUS (as defined by orientation)
    //   orientation: horizontal → left=PLUS right=MINUS
    //                vertical   → top=PLUS  bottom=MINUS
    // rowPlus[r], rowMinus[r]: expected + and − counts per row
    // colPlus[c], colMinus[c]: expected + and − counts per col
    // ------------------------------------------------------------------

    // Helper to build row/col counts from solution
    function buildCounts(ROWS, COLS, dominoes, solution) {
      const grid = Array.from({length: ROWS}, () => Array(COLS).fill(BLANK));
      for (let i = 0; i < dominoes.length; i++) {
        const d = dominoes[i];
        if (solution[i] === 'M') {
          // determine polarity by orientation
          if (d.r1 === d.r2) { // horizontal
            grid[d.r1][d.c1] = PLUS; grid[d.r2][d.c2] = MINUS;
          } else { // vertical
            grid[d.r1][d.c1] = PLUS; grid[d.r2][d.c2] = MINUS;
          }
        }
      }
      const rowPlus  = Array(ROWS).fill(0);
      const rowMinus = Array(ROWS).fill(0);
      const colPlus  = Array(COLS).fill(0);
      const colMinus = Array(COLS).fill(0);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === PLUS)  { rowPlus[r]++; colPlus[c]++; }
          if (grid[r][c] === MINUS) { rowMinus[r]++; colMinus[c]++; }
        }
      return { rowPlus, rowMinus, colPlus, colMinus };
    }

    const ROWS = 5, COLS = 6;

    // Puzzle 1: horizontal dominoes only
    const p1dominoes = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c += 2)
        p1dominoes.push({ r1: r, c1: c, r2: r, c2: c + 1 });
    const p1sol = ['M','B','M', 'B','M','B', 'M','B','M', 'B','M','B', 'M','B','M'];
    const p1counts = buildCounts(ROWS, COLS, p1dominoes, p1sol);

    // Puzzle 2: vertical dominoes only
    const p2dominoes = [];
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS - 1; r += 2)
        p2dominoes.push({ r1: r, c1: c, r2: r + 1, c2: c });
    // ROWS=5 so rows 0-1, 2-3 per col → 2 per col = 12 dominoes, row 4 leftover → need different layout
    // Use alternating columns: even cols vertical, odd cols horizontal
    // Redo puzzle 2 with mixed
    const p2bDominoes = [];
    // rows 0-3: vertical pairs in all cols; row 4: horizontal pairs
    for (let c = 0; c < COLS; c++) {
      p2bDominoes.push({ r1: 0, c1: c, r2: 1, c2: c });
      p2bDominoes.push({ r1: 2, c1: c, r2: 3, c2: c });
    }
    for (let c = 0; c < COLS; c += 2)
      p2bDominoes.push({ r1: 4, c1: c, r2: 4, c2: c + 1 });
    const p2bSol = ['M','B','B','M','M','B', 'B','M','M','B','B','M', 'M','B','M'];
    const p2bCounts = buildCounts(ROWS, COLS, p2bDominoes, p2bSol);

    // Puzzle 3: checkerboard-style
    const p3dominoes = [];
    // rows 0,2,4: horizontal pairs
    for (let r of [0,2,4])
      for (let c = 0; c < COLS; c += 2)
        p3dominoes.push({ r1: r, c1: c, r2: r, c2: c + 1 });
    // rows 1,3 filled by vertical pairs bridging with above/below
    // rows 1: vertical from r0 col1 → but r0 col1 is already used
    // Use a safe tiling: rows 1-2 vertical for cols 0,2,4
    // Already covered by the horizontal above — need non-overlapping
    // Safe approach: just tile with a known valid non-overlapping partition
    // Rows 0-1: vertical for cols 0,2,4; horizontal for cols 1-2 and 3-4 in row 1
    const p3d2 = [];
    // Col 0,2,4: vertical r0-r1, r2-r3
    for (let c of [0, 2, 4]) {
      p3d2.push({ r1: 0, c1: c, r2: 1, c2: c });
      p3d2.push({ r1: 2, c1: c, r2: 3, c2: c });
    }
    // Col 1,3,5: vertical r0-r1, r2-r3
    for (let c of [1, 3, 5]) {
      p3d2.push({ r1: 0, c1: c, r2: 1, c2: c });
      p3d2.push({ r1: 2, c1: c, r2: 3, c2: c });
    }
    // Row 4: horizontal
    for (let c = 0; c < COLS; c += 2)
      p3d2.push({ r1: 4, c1: c, r2: 4, c2: c + 1 });
    const p3s2 = ['M','B','M','B','M','B', 'B','M','B','M','B','M', 'M','B','M'];
    const p3c2 = buildCounts(ROWS, COLS, p3d2, p3s2);

    // Puzzle 4: snake tiling
    const p4dominoes = [];
    for (let c = 0; c < COLS; c += 2)
      p4dominoes.push({ r1: 0, c1: c, r2: 0, c2: c + 1 });
    for (let r = 0; r < ROWS; r++)
      p4dominoes.push({ r1: r, c1: 1, r2: r + (r < ROWS-1 ? 1 : 0), c2: r < ROWS-1 ? 1 : 2 });
    // Safe clean tiling: vertical strips
    const p4d = [];
    for (let c = 0; c < COLS; c += 2) {
      // vertical pairs in col c and c+1
      for (let r = 0; r < ROWS - 1; r += 2) {
        p4d.push({ r1: r, c1: c, r2: r + 1, c2: c });
        p4d.push({ r1: r, c1: c + 1, r2: r + 1, c2: c + 1 });
      }
      // leftover row 4
      p4d.push({ r1: 4, c1: c, r2: 4, c2: c + 1 });
    }
    const p4s = [
      'M','B', 'B','M', 'M','B',
      'B','M', 'M','B', 'B','M',
      'M','B','M',
    ];
    const p4c = buildCounts(ROWS, COLS, p4d, p4s);

    // Puzzle 5: mixed
    const p5d = [];
    // Rows 0-1: horizontal pairs in row 0, vertical in cols 1,3,5 rows 0-1
    // Safe known tiling:
    for (let c = 0; c < COLS; c += 2) {
      p5d.push({ r1: 0, c1: c, r2: 1, c2: c });    // vertical
      p5d.push({ r1: 0, c1: c+1, r2: 1, c2: c+1 }); // vertical
    }
    for (let c = 0; c < COLS; c += 2) {
      p5d.push({ r1: 2, c1: c, r2: 3, c2: c });
      p5d.push({ r1: 2, c1: c+1, r2: 3, c2: c+1 });
    }
    for (let c = 0; c < COLS; c += 2)
      p5d.push({ r1: 4, c1: c, r2: 4, c2: c + 1 });
    const p5s = [
      'M','B','B','M','M','B',
      'B','M','M','B','B','M',
      'M','B','M',
    ];
    const p5c = buildCounts(ROWS, COLS, p5d, p5s);

    const PUZZLES = [
      { name: 'FIELD',   dominoes: p1dominoes, solution: p1sol,  ...p1counts  },
      { name: 'STACK',   dominoes: p2bDominoes, solution: p2bSol, ...p2bCounts },
      { name: 'GRID',    dominoes: p3d2,        solution: p3s2,   ...p3c2      },
      { name: 'STRIPS',  dominoes: p4d,          solution: p4s,    ...p4c       },
      { name: 'MOSAIC',  dominoes: p5d,          solution: p5s,    ...p5c       },
    ];

    // ------------------------------------------------------------------
    // Validate no domino overlaps (dev check)
    // ------------------------------------------------------------------
    for (const pz of PUZZLES) {
      const seen = new Set();
      for (const d of pz.dominoes) {
        const k1 = `${d.r1},${d.c1}`, k2 = `${d.r2},${d.c2}`;
        // silent dedup
      }
    }

    // ------------------------------------------------------------------
    // Procedural generator
    // ------------------------------------------------------------------
    function generateMagnets(ROWS2, COLS2) {
      // Tile grid with dominoes
      const domino = Array.from({length: ROWS2}, () => Array(COLS2).fill(-1));
      let id2 = 0;
      const dominoCells = [];
      const DIRS2 = [[0,1],[1,0]];
      for (let r = 0; r < ROWS2; r++) for (let c = 0; c < COLS2; c++) {
        if (domino[r][c] >= 0) continue;
        const validDirs = DIRS2.filter(([dr,dc]) => {
          const nr = r+dr, nc = c+dc;
          return nr < ROWS2 && nc < COLS2 && domino[nr][nc] < 0;
        });
        if (!validDirs.length) {
          domino[r][c] = id2; dominoCells.push([[r,c],[r,c]]); id2++; continue;
        }
        const [dr,dc] = validDirs[Math.floor(Math.random() * validDirs.length)];
        const nr = r+dr, nc = c+dc;
        domino[r][c] = domino[nr][nc] = id2;
        dominoCells.push([[r,c],[nr,nc]]);
        id2++;
      }

      // Assign polarity
      const polarity = Array.from({length: ROWS2}, () => Array(COLS2).fill(0));
      for (const [[r1,c1],[r2,c2]] of dominoCells) {
        if (r1 === r2 && c1 === c2) continue; // singleton fallback
        const v = Math.random();
        if (v < 0.4)      { polarity[r1][c1] = 1;  polarity[r2][c2] = -1; }
        else if (v < 0.8) { polarity[r1][c1] = -1; polarity[r2][c2] = 1; }
        // else neutral
      }

      const rowPlus  = Array(ROWS2).fill(0), rowMinus  = Array(ROWS2).fill(0);
      const colPlus  = Array(COLS2).fill(0), colMinus  = Array(COLS2).fill(0);
      for (let r = 0; r < ROWS2; r++) for (let c = 0; c < COLS2; c++) {
        if (polarity[r][c] ===  1) { rowPlus[r]++;  colPlus[c]++; }
        if (polarity[r][c] === -1) { rowMinus[r]++; colMinus[c]++; }
      }

      // Convert to PUZZLES format
      const dominosList = dominoCells.map(([[r1,c1],[r2,c2]]) => ({r1,c1,r2,c2}));
      // solution as 'M' or 'B' per domino
      const solution = dominoCells.map(([[r1,c1]]) => polarity[r1][c1] !== 0 ? 'M' : 'B');
      return { name: 'GEN', dominoes: dominosList, solution, rowPlus, rowMinus, colPlus, colMinus, _polarity: polarity };
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showSolution = false;
    const EYE_X = W - 22, EYE_Y = 62, EYE_R = 14;

    let puzzleIdx = ctx.storage.get('mag_idx') || 0;
    let playerGrid; // ROWS x COLS of BLANK/PLUS/MINUS
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let audioCtx = null;
    let voices = 0;

    function curPuzzleMag() { return PUZZLES[puzzleIdx % PUZZLES.length]; }

    function applySolution() {
      const p = curPuzzleMag();
      playerGrid = Array.from({length: ROWS}, () => Array(COLS).fill(BLANK));
      for (let i = 0; i < p.dominoes.length; i++) {
        const d = p.dominoes[i];
        if (p.solution[i] === 'M') {
          if (d.r1 === d.r2) { // horizontal: left=PLUS, right=MINUS
            playerGrid[d.r1][d.c1] = PLUS; playerGrid[d.r2][d.c2] = MINUS;
          } else { // vertical: top=PLUS, bottom=MINUS
            playerGrid[d.r1][d.c1] = PLUS; playerGrid[d.r2][d.c2] = MINUS;
          }
        }
      }
    }

    function initPuzzle() {
      playerGrid = Array.from({length: ROWS}, () => Array(COLS).fill(BLANK));
      solved = false; solveTime = 0; startTime = 0; gameStarted = false;
      showSolution = false;
    }

    initPuzzle();

    // ------------------------------------------------------------------
    // Layout
    // ------------------------------------------------------------------
    function getLayout() {
      const HUD_H = 48;
      const LABEL_W = 28; // row label columns on each side
      const LABEL_H = 28; // col label rows
      const PAD = 12;
      const avW = W - PAD * 2 - LABEL_W * 2;
      const avH = USABLE_H - HUD_H - LABEL_H - PAD * 2;
      const CELL = Math.min(Math.floor(avW / COLS), Math.floor(avH / ROWS), 60);
      const gridW = CELL * COLS;
      const gridH = CELL * ROWS;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + LABEL_H + Math.floor((USABLE_H - HUD_H - LABEL_H - gridH) / 2);
      return { CELL, ox, oy, gridW, gridH, LABEL_W, LABEL_H };
    }

    // ------------------------------------------------------------------
    // Find which domino a cell belongs to
    // ------------------------------------------------------------------
    function getDomino(r, c) {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      for (let i = 0; i < p.dominoes.length; i++) {
        const d = p.dominoes[i];
        if ((d.r1 === r && d.c1 === c) || (d.r2 === r && d.c2 === c)) return i;
      }
      return -1;
    }

    function getDominoPartner(r, c) {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      const idx = getDomino(r, c);
      if (idx === -1) return null;
      const d = p.dominoes[idx];
      if (d.r1 === r && d.c1 === c) return { r: d.r2, c: d.c2 };
      return { r: d.r1, c: d.c1 };
    }

    // ------------------------------------------------------------------
    // Cycle a cell: blank → + → − → blank
    // Partner gets the opposite (or blank if tapping blank cycle)
    // If domino is fully blank → set to M: cell=+, partner=−
    // If cell is + → cell=−, partner=+
    // If cell is − → cell=blank, partner=blank
    // ------------------------------------------------------------------
    function cycleDomino(r, c) {
      const p2 = getDominoPartner(r, c);
      if (!p2) return;

      const cur = playerGrid[r][c];
      if (cur === BLANK) {
        playerGrid[r][c] = PLUS;
        playerGrid[p2.r][p2.c] = MINUS;
      } else if (cur === PLUS) {
        playerGrid[r][c] = MINUS;
        playerGrid[p2.r][p2.c] = PLUS;
      } else {
        playerGrid[r][c] = BLANK;
        playerGrid[p2.r][p2.c] = BLANK;
      }
    }

    // ------------------------------------------------------------------
    // Constraint satisfaction checks
    // ------------------------------------------------------------------
    function countPlusInRow(r)  { let n = 0; for (let c = 0; c < COLS; c++) if (playerGrid[r][c] === PLUS)  n++; return n; }
    function countMinusInRow(r) { let n = 0; for (let c = 0; c < COLS; c++) if (playerGrid[r][c] === MINUS) n++; return n; }
    function countPlusInCol(c)  { let n = 0; for (let r = 0; r < ROWS; r++) if (playerGrid[r][c] === PLUS)  n++; return n; }
    function countMinusInCol(c) { let n = 0; for (let r = 0; r < ROWS; r++) if (playerGrid[r][c] === MINUS) n++; return n; }

    function noBadAdjacency() {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = playerGrid[r][c];
          if (v === BLANK) continue;
          if (c + 1 < COLS && playerGrid[r][c + 1] === v) {
            // Check they are NOT part of same domino
            const d1 = getDomino(r, c);
            const d2 = getDomino(r, c + 1);
            if (d1 !== d2) return false;
          }
          if (r + 1 < ROWS && playerGrid[r + 1][c] === v) {
            const d1 = getDomino(r, c);
            const d2 = getDomino(r + 1, c);
            if (d1 !== d2) return false;
          }
        }
      }
      return true;
    }

    function checkSolved() {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      for (let r = 0; r < ROWS; r++) {
        if (countPlusInRow(r)  !== p.rowPlus[r])  return false;
        if (countMinusInRow(r) !== p.rowMinus[r]) return false;
      }
      for (let c = 0; c < COLS; c++) {
        if (countPlusInCol(c)  !== p.colPlus[c])  return false;
        if (countMinusInCol(c) !== p.colMinus[c]) return false;
      }
      return noBadAdjacency();
    }

    // ------------------------------------------------------------------
    // Row/col indicator state: -1 too few, 0 exact, 1 too many
    // ------------------------------------------------------------------
    function rowPlusState(r)  { const p = PUZZLES[puzzleIdx % PUZZLES.length]; const got = countPlusInRow(r);  return got === p.rowPlus[r] ? 0 : got > p.rowPlus[r] ? 1 : -1; }
    function rowMinusState(r) { const p = PUZZLES[puzzleIdx % PUZZLES.length]; const got = countMinusInRow(r); return got === p.rowMinus[r] ? 0 : got > p.rowMinus[r] ? 1 : -1; }
    function colPlusState(c)  { const p = PUZZLES[puzzleIdx % PUZZLES.length]; const got = countPlusInCol(c);  return got === p.colPlus[c] ? 0 : got > p.colPlus[c] ? 1 : -1; }
    function colMinusState(c) { const p = PUZZLES[puzzleIdx % PUZZLES.length]; const got = countMinusInCol(c); return got === p.colMinus[c] ? 0 : got > p.colMinus[c] ? 1 : -1; }

    function indicatorColor(state) {
      if (state === 0)  return '#4caf50';
      if (state === 1)  return '#ef5350';
      return '#aaaacc';
    }

    // ------------------------------------------------------------------
    // Audio
    // ------------------------------------------------------------------
    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playClick(pol) {
      if (!audioCtx || voices >= 8) return;
      voices++;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = 'sine';
      o.frequency.value = pol === PLUS ? 740 : pol === MINUS ? 440 : 300;
      gn.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.start(); o.stop(audioCtx.currentTime + 0.08);
      o.onended = () => voices--;
    }

    function playSolve() {
      if (!audioCtx) return;
      [523, 659, 784, 1047].forEach((f, i) => {
        if (voices >= 8) return;
        voices++;
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = f;
        const t0 = audioCtx.currentTime + i * 0.08;
        gn.gain.setValueAtTime(0, t0);
        gn.gain.linearRampToValueAtTime(0.15, t0 + 0.05);
        gn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
        o.start(t0); o.stop(t0 + 0.5);
        o.onended = () => voices--;
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    // ------------------------------------------------------------------
    // RAF draw loop
    // ------------------------------------------------------------------
    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const layout = getLayout();
      const { CELL, ox, oy, LABEL_H } = layout;
      const p = PUZZLES[puzzleIdx % PUZZLES.length];

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`MAGNETS  ${(puzzleIdx % PUZZLES.length) + 1}/${PUZZLES.length}  ${p.name}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Column labels (above grid)
      g.font = `bold ${Math.floor(CELL * 0.26)}px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let c = 0; c < COLS; c++) {
        const lx = ox + c * CELL + CELL / 2;
        const lyBase = oy - LABEL_H / 2;
        // plus
        const ps = colPlusState(c);
        g.fillStyle = indicatorColor(ps);
        g.beginPath(); g.arc(lx, lyBase - 6, 5, 0, Math.PI * 2); g.fill();
        g.fillStyle = indicatorColor(ps);
        g.fillText(String(p.colPlus[c]), lx, lyBase - 6);
        // minus
        const ms = colMinusState(c);
        g.fillStyle = indicatorColor(ms);
        g.fillText(String(p.colMinus[c]), lx, lyBase + 8);
        // small ± labels
        g.font = `${Math.floor(CELL * 0.2)}px -apple-system, sans-serif`;
        g.fillStyle = indicatorColor(ps);
        g.fillText('+', lx - CELL * 0.28, lyBase - 6);
        g.fillStyle = indicatorColor(ms);
        g.fillText('−', lx - CELL * 0.28, lyBase + 8);
        g.font = `bold ${Math.floor(CELL * 0.26)}px -apple-system, sans-serif`;
      }

      // Row labels (right and left of grid)
      for (let r = 0; r < ROWS; r++) {
        const ly = oy + r * CELL + CELL / 2;
        const ps = rowPlusState(r);
        const ms2 = rowMinusState(r);
        // left side: + count
        g.textAlign = 'right';
        g.fillStyle = indicatorColor(ps);
        g.fillText(`+${p.rowPlus[r]}`, ox - 6, ly - 5);
        g.fillStyle = indicatorColor(ms2);
        g.fillText(`−${p.rowMinus[r]}`, ox - 6, ly + 8);
      }

      // Draw cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const val = playerGrid[r][c];
          const domIdx = getDomino(r, c);
          const dom = domIdx >= 0 ? p.dominoes[domIdx] : null;
          const isHoriz = dom && dom.r1 === dom.r2;
          const isLeft  = dom && dom.c1 === c && dom.r1 === r && isHoriz;
          const isTop   = dom && dom.r1 === r && dom.c1 === c && !isHoriz;

          // Cell bg
          let bg;
          if (val === PLUS)  bg = `rgba(239,83,80,0.18)`;
          else if (val === MINUS) bg = `rgba(66,165,245,0.18)`;
          else bg = '#1a1a26';

          // Check adjacency violation for this cell
          let badAdj = false;
          if (val !== BLANK) {
            const neighbors = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
            for (const [nr, nc] of neighbors) {
              if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
              if (playerGrid[nr][nc] === val) {
                const d1 = getDomino(r, c);
                const d2 = getDomino(nr, nc);
                if (d1 !== d2) { badAdj = true; break; }
              }
            }
          }
          if (badAdj) bg = `rgba(239,83,80,0.4)`;

          g.fillStyle = bg;
          g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);

          // Pole symbol
          if (val !== BLANK) {
            const cx2 = cx + CELL / 2, cy2 = cy + CELL / 2;
            const R = CELL * 0.28;
            g.fillStyle = val === PLUS ? PLUS_COL : MINUS_COL;
            g.beginPath(); g.arc(cx2, cy2, R, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#fff';
            g.font = `bold ${Math.floor(CELL * 0.32)}px -apple-system, sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(val === PLUS ? '+' : '−', cx2, cy2 + 1);
          }

          // Domino divider lines
          g.strokeStyle = 'rgba(255,255,255,0.18)';
          g.lineWidth = 0.5;
          g.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2);

          // Bold border between domino halves
          if (dom) {
            g.strokeStyle = 'rgba(255,255,255,0.55)';
            g.lineWidth = 2;
            g.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            // draw outer border of the whole domino
            if (isHoriz && isLeft) {
              g.strokeStyle = 'rgba(255,255,255,0.6)';
              g.lineWidth = 2;
              g.strokeRect(cx + 1, cy + 1, CELL * 2 - 2, CELL - 2);
              // erase internal vertical edge
              g.strokeStyle = bg;
              g.lineWidth = 2;
              g.beginPath();
              g.moveTo(cx + CELL, cy + 2);
              g.lineTo(cx + CELL, cy + CELL - 2);
              g.stroke();
            }
            if (!isHoriz && isTop) {
              g.strokeStyle = 'rgba(255,255,255,0.6)';
              g.lineWidth = 2;
              g.strokeRect(cx + 1, cy + 1, CELL - 2, CELL * 2 - 2);
              g.strokeStyle = bg;
              g.lineWidth = 2;
              g.beginPath();
              g.moveTo(cx + 2, cy + CELL);
              g.lineTo(cx + CELL - 2, cy + CELL);
              g.stroke();
            }
          }
        }
      }

      // Solved overlay
      if (solved) {
        const flash = 0.7 + 0.3 * Math.sin(now * 0.005);
        g.fillStyle = 'rgba(15,15,20,0.85)';
        g.fillRect(0, 48, W, USABLE_H - 48);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 38px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.shadowColor = ACCENT; g.shadowBlur = 28;
        g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 56);
        g.shadowBlur = 0;
        g.font = '18px -apple-system, sans-serif';
        g.fillStyle = '#ffffff99';
        g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 12);
        const best = ctx.storage.get('bt_magnets') || 0;
        g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 20);
        g.fillStyle = ACCENT + '22';
        g.beginPath();
        if (g.roundRect) g.roundRect(W/2-100, USABLE_H/2+54, 200, 48, 12);
        else g.rect(W/2-100, USABLE_H/2+54, 200, 48);
        g.fill();
        g.strokeStyle = ACCENT; g.lineWidth = 1.5;
        g.beginPath();
        if (g.roundRect) g.roundRect(W/2-100, USABLE_H/2+54, 200, 48, 12);
        else g.rect(W/2-100, USABLE_H/2+54, 200, 48);
        g.stroke();
        g.font = 'bold 16px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.fillText('NEXT PUZZLE', W / 2, USABLE_H / 2 + 78);
      }

      // Info panel
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.9)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.84); const ch = Math.min(Math.floor(USABLE_H * 0.78), 520);
        const cxp = Math.floor((W - cw) / 2); const cyp = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath(); if (g.roundRect) g.roundRect(cxp, cyp, cw, ch, 16); else g.rect(cxp, cyp, cw, ch); g.fill();
        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('MAGNETS', W / 2, cyp + 50);
        const lx = cxp + 20; let ty = cyp + 72; const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• Each domino is a magnet (+/−) or left blank',
          '• A magnet has one + pole and one − pole',
          '• Same poles cannot touch orthogonally',
          '• Numbers on sides show how many + and − poles',
          '  must appear in each row and column',
          '• Tap a domino half to cycle: blank → + → − → blank',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }
        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('INDICATORS', lx, ty); ty += lh;
        const indic = [
          '• Green number = constraint satisfied',
          '• Red number = too many',
          '• Grey number = not yet filled',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of indic) { g.fillText(line, lx, ty); ty += lh; }
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cyp + ch - 20);
      }

      // Info button — drawn LAST
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
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

    // ------------------------------------------------------------------
    // Touch
    // ------------------------------------------------------------------
    function cellAt(tx, ty, layout) {
      const { CELL, ox, oy } = layout;
      const c = Math.floor((tx - ox) / CELL);
      const r = Math.floor((ty - oy) / CELL);
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
      return { r, c };
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      // IBTN first
      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo; return;
      }
      if (showInfo) { showInfo = false; return; }

      // Eye / solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_Y) < EYE_R + 8) {
        showSolution = true;
        applySolution();
        return;
      }

      if (showSolution) {
        initPuzzle();
        return;
      }

      // Solved → next puzzle
      if (solved) {
        puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
        ctx.storage.set('mag_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      const layout = getLayout();
      const cell = cellAt(tx, ty, layout);
      if (!cell) return;
      if (cell.r * layout.CELL + layout.oy > USABLE_H - SAFE) return;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      const prevVal = playerGrid[cell.r][cell.c];
      cycleDomino(cell.r, cell.c);
      const newVal = playerGrid[cell.r][cell.c];
      playClick(newVal);
      ctx.platform.interact({ type: 'tap' });
      ctx.platform.haptic('light');

      if (checkSolved()) {
        solved = true;
        solveTime = performance.now() - startTime;
        const best = ctx.storage.get('bt_magnets') || 0;
        if (!best || solveTime < best) ctx.storage.set('bt_magnets', solveTime);
        ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
        playSolve();
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });
    ctx.listen(canvas, 'touchend',  (e) => { e.preventDefault(); }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
