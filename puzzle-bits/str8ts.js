window.plethoraBit = {
  meta: {
    title: 'Str8ts',
    author: 'plethora',
    description: 'Fill straights in every compartment.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#8D6E63';
    const ACCENT_BRIGHT = '#BCAAA4';
    const BG = '#0f0f14';

    // Str8ts 9x9 puzzles
    // cell types: 0=white-empty, 1-9=white-given, -1=black-empty, -2 through -10=black-given(abs-1)
    // Convention: positive = white cell (given if >0 in clues); negative = black cell
    // clues: layout of cells (B=black, 0=white-empty, 1-9=white-given)
    // solution: full solved grid (0 for black cells)
    const PUZZLES = [
      { // Puzzle 1 — easy
        clues: [
          [ 0,  0,  0,  -1,  0,  0,  0,  -1,  0],
          [ 0,  5,  0,   0,  0,  3,  0,   0,  0],
          [-1,  0,  3,   0,  0,  0,  7,   0, -1],
          [ 0,  0,  0,  -1,  6,  0,  0,   0,  0],
          [ 0,  0, -1,   4,  0,  5, -1,   0,  0],
          [ 0,  0,  0,   0,  3, -1,  0,   0,  0],
          [-1,  0,  5,   0,  0,  0,  4,   0, -1],
          [ 0,  0,  0,   0,  2,  0,  0,  6,   0],
          [ 0, -1,  0,   0,  0, -1,  0,   0,  0],
        ],
        solution: [
          [3, 4, 2, 0, 1, 2, 3, 0, 5],
          [4, 5, 3, 2, 3, 3, 2, 1, 6],
          [0, 3, 3, 1, 2, 4, 7, 8, 0],
          [2, 1, 4, 0, 6, 5, 8, 7, 9],
          [1, 2, 0, 4, 5, 5, 0, 6, 7],
          [5, 6, 7, 3, 3, 0, 1, 2, 4],
          [0, 7, 5, 6, 4, 3, 4, 3, 0],
          [6, 8, 6, 5, 2, 2, 3, 6, 3],
          [7, 0, 8, 7, 1, 0, 5, 4, 2],
        ],
      },
      { // Puzzle 2
        clues: [
          [ 0,  0, -1,  0,  0,  0, -1,  0,  0],
          [ 0,  3,  0,  0, -1,  0,  0,  5,  0],
          [ 0,  0,  0, -1,  2,  0,  4,  0,  0],
          [-1,  4,  0,  0,  0,  0,  0,  3, -1],
          [ 0,  0,  5, -1,  0, -1,  6,  0,  0],
          [-1,  0,  0,  0,  0,  0,  0,  2, -1],
          [ 0,  0,  7,  0,  3, -1,  0,  0,  0],
          [ 0,  4,  0,  0, -1,  0,  0,  6,  0],
          [ 0,  0, -1,  0,  0,  0, -1,  0,  0],
        ],
        solution: [
          [1, 2, 0, 3, 4, 5, 0, 7, 8],
          [2, 3, 1, 4, 0, 6, 7, 5, 9],
          [3, 1, 2, 0, 2, 7, 4, 6, 5],
          [0, 4, 3, 2, 1, 8, 5, 3, 0],
          [4, 5, 5, 0, 3, 0, 6, 4, 3],
          [0, 6, 4, 1, 2, 9, 8, 2, 0],
          [5, 7, 7, 6, 3, 0, 9, 8, 4],
          [6, 4, 8, 5, 0, 4, 3, 6, 7],
          [7, 8, 0, 7, 5, 3, 0, 1, 6],
        ],
      },
      { // Puzzle 3 — medium
        clues: [
          [ 9,  0, -1,  0,  0, -1,  0,  0,  1],
          [ 0,  0,  0, -1,  5, -1,  0,  0,  0],
          [ 0,  7,  0,  3,  0,  4,  0,  2,  0],
          [-1,  0,  0,  0, -1,  0,  0,  0, -1],
          [ 0,  0,  4, -1,  0, -1,  6,  0,  0],
          [-1,  0,  0,  0, -1,  0,  0,  0, -1],
          [ 0,  3,  0,  6,  0,  7,  0,  5,  0],
          [ 0,  0,  0, -1,  4, -1,  0,  0,  0],
          [ 1,  0, -1,  0,  0, -1,  0,  0,  9],
        ],
        solution: [
          [9, 8, 0, 1, 2, 0, 3, 4, 1],
          [8, 9, 7, 0, 5, 0, 2, 3, 2],
          [7, 7, 6, 3, 4, 4, 1, 2, 3],
          [0, 6, 5, 4, 0, 3, 4, 1, 0],
          [6, 5, 4, 0, 3, 0, 6, 7, 8],
          [0, 4, 3, 2, 0, 2, 5, 6, 0],
          [5, 3, 2, 6, 1, 7, 4, 5, 7],
          [4, 2, 1, 0, 4, 0, 3, 4, 8],
          [1, 1, 0, 5, 3, 0, 2, 3, 9],
        ],
      },
      { // Puzzle 4 — harder
        clues: [
          [-1,  0,  4,  0, -1,  0,  3,  0, -1],
          [ 0,  0,  0,  5,  0,  6,  0,  0,  0],
          [ 0,  3, -1,  0,  0,  0, -1,  7,  0],
          [ 0,  0,  0, -1,  4, -1,  0,  0,  0],
          [-1,  0,  0,  6,  0,  5,  0,  0, -1],
          [ 0,  0,  0, -1,  3, -1,  0,  0,  0],
          [ 0,  6, -1,  0,  0,  0, -1,  4,  0],
          [ 0,  0,  0,  4,  0,  3,  0,  0,  0],
          [-1,  0,  5,  0, -1,  0,  6,  0, -1],
        ],
        solution: [
          [0, 1, 4, 3, 0, 2, 3, 4, 0],
          [1, 2, 3, 5, 4, 6, 4, 5, 6],
          [2, 3, 0, 4, 5, 5, 0, 7, 8],
          [3, 4, 2, 0, 4, 0, 5, 6, 7],
          [0, 5, 1, 6, 3, 5, 6, 7, 0],
          [4, 6, 3, 0, 3, 0, 7, 8, 9],
          [5, 6, 0, 3, 2, 4, 0, 4, 5],
          [6, 7, 4, 4, 1, 3, 2, 3, 4],
          [0, 8, 5, 2, 0, 1, 6, 5, 0],
        ],
      },
      { // Puzzle 5 — hardest, fewest givens
        clues: [
          [ 0,  0,  0, -1,  8, -1,  0,  0,  0],
          [ 0, -1,  0,  0,  0,  0,  0, -1,  0],
          [ 0,  6,  0, -1,  0, -1,  0,  4,  0],
          [-1,  0,  0,  7,  0,  3,  0,  0, -1],
          [ 5,  0,  0,  0, -1,  0,  0,  0,  2],
          [-1,  0,  0,  4,  0,  6,  0,  0, -1],
          [ 0,  3,  0, -1,  0, -1,  0,  5,  0],
          [ 0, -1,  0,  0,  0,  0,  0, -1,  0],
          [ 0,  0,  0, -1,  2, -1,  0,  0,  0],
        ],
        solution: [
          [1, 2, 3, 0, 8, 0, 7, 8, 9],
          [2, 0, 4, 3, 7, 6, 8, 0, 8],
          [3, 6, 5, 0, 6, 0, 9, 4, 7],
          [0, 5, 6, 7, 5, 3, 4, 3, 0],
          [5, 4, 7, 6, 0, 4, 3, 2, 2],
          [0, 3, 8, 4, 4, 6, 2, 1, 0],
          [4, 3, 9, 0, 3, 0, 1, 5, 6],
          [6, 0, 2, 1, 2, 5, 6, 0, 5],
          [7, 1, 1, 0, 2, 0, 5, 6, 4],
        ],
      },
    ];

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showSolution = false;
    const EYE_X = W - 22, EYE_Y = 62, EYE_R = 14;

    let puzzleIdx = ctx.storage.get('str8ts_idx') || 0;
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let selectedCell = null;
    let userGrid = null; // 9x9 of user-entered numbers; black cells = -1
    let audioCtx = null;
    let solveAnimStart = 0;
    let conflictCells = new Set();

    const N = 9;

    function applySolution() {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          if (p.clues[r][c] < 0) {
            userGrid[r][c] = -1; // black cell
          } else {
            userGrid[r][c] = p.solution[r][c]; // fill white cell with solution value
          }
        }
      conflictCells = new Set();
    }

    function initPuzzle() {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      userGrid = Array.from({ length: N }, (_, r) =>
        Array.from({ length: N }, (_, c) => {
          const v = p.clues[r][c];
          if (v < 0) return -1; // black
          return v; // 0=empty white, 1-9=given white
        })
      );
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      selectedCell = null;
      conflictCells = new Set();
      solveAnimStart = 0;
      showSolution = false;
    }

    function isBlack(r, c) {
      return userGrid[r][c] === -1;
    }

    function isGiven(r, c) {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      return p.clues[r][c] > 0;
    }

    // Get compartments: consecutive white cells in a row/col
    function getCompartments(line) {
      const segs = [];
      let seg = [];
      for (let i = 0; i < N; i++) {
        if (line[i] !== -1) {
          seg.push({ idx: i, val: line[i] });
        } else {
          if (seg.length) { segs.push(seg); seg = []; }
        }
      }
      if (seg.length) segs.push(seg);
      return segs;
    }

    function isStraight(vals) {
      // Vals must form a consecutive sequence (any order, no repeats)
      const nonZero = vals.filter(v => v > 0);
      if (nonZero.length !== vals.length) return false; // not all filled
      const unique = new Set(nonZero);
      if (unique.size !== nonZero.length) return false; // duplicates
      const mn = Math.min(...nonZero), mx = Math.max(...nonZero);
      return mx - mn === nonZero.length - 1;
    }

    function checkSolved() {
      // All white cells filled
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (userGrid[r][c] === 0) return false;

      // No repeated number in any full row (white cells only)
      for (let r = 0; r < N; r++) {
        const row = userGrid[r].filter(v => v > 0);
        if (new Set(row).size !== row.length) return false;
      }
      // No repeated in full col
      for (let c = 0; c < N; c++) {
        const col = userGrid.map(row => row[c]).filter(v => v > 0);
        if (new Set(col).size !== col.length) return false;
      }

      // Every compartment is a straight
      for (let r = 0; r < N; r++) {
        const row = userGrid[r];
        for (const seg of getCompartments(row)) {
          if (!isStraight(seg.map(s => s.val))) return false;
        }
      }
      for (let c = 0; c < N; c++) {
        const col = { };
        const line = userGrid.map(row => ({ idx: 0, val: row[c] === -1 ? -1 : row[c] }));
        for (const seg of getCompartments(line.map((x, i) => x.val === -1 ? -1 : x.val))) {
          if (!isStraight(seg.map(s => s.val))) return false;
        }
      }
      return true;
    }

    function computeConflicts() {
      const bad = new Set();
      // Row conflicts
      for (let r = 0; r < N; r++) {
        const seen = {};
        for (let c = 0; c < N; c++) {
          const v = userGrid[r][c];
          if (v <= 0) continue;
          if (seen[v] !== undefined) { bad.add(`${r},${c}`); bad.add(`${r},${seen[v]}`); }
          else seen[v] = c;
        }
      }
      // Col conflicts
      for (let c = 0; c < N; c++) {
        const seen = {};
        for (let r = 0; r < N; r++) {
          const v = userGrid[r][c];
          if (v <= 0) continue;
          if (seen[v] !== undefined) { bad.add(`${r},${c}`); bad.add(`${seen[v]},${c}`); }
          else seen[v] = r;
        }
      }
      // Compartment non-straight
      for (let r = 0; r < N; r++) {
        const row = userGrid[r];
        for (const seg of getCompartments(row)) {
          const vals = seg.map(s => s.val);
          if (vals.every(v => v > 0)) {
            const unique = new Set(vals);
            const mn = Math.min(...vals), mx = Math.max(...vals);
            if (unique.size !== vals.length || mx - mn !== vals.length - 1) {
              seg.forEach(s => bad.add(`${r},${s.idx}`));
            }
          }
        }
      }
      for (let c = 0; c < N; c++) {
        const colLine = userGrid.map(row => row[c] === -1 ? -1 : row[c]);
        for (const seg of getCompartments(colLine)) {
          const vals = seg.map(s => s.val);
          if (vals.every(v => v > 0)) {
            const unique = new Set(vals);
            const mn = Math.min(...vals), mx = Math.max(...vals);
            if (unique.size !== vals.length || mx - mn !== vals.length - 1) {
              seg.forEach(s => bad.add(`${s.idx},${c}`));
            }
          }
        }
      }
      conflictCells = bad;
    }

    function getLayout() {
      const HUD_H = 48;
      const PAD_TOP = HUD_H + 8;
      const numPadH = 56;
      const PAD_BOT = numPadH + 12;
      const avail = Math.min(W - 24, USABLE_H - PAD_TOP - PAD_BOT);
      const CELL = Math.floor(avail / N);
      const gridW = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = PAD_TOP + Math.floor((USABLE_H - PAD_TOP - PAD_BOT - gridW) / 2);
      const padY = USABLE_H - PAD_BOT + 8;
      return { CELL, ox, oy, padY };
    }

    function numPadAt(tx, ty, layout) {
      const { padY } = layout;
      if (ty < padY || ty > padY + 44) return null;
      const btnW = Math.min(Math.floor((W - 24) / 10), 40);
      const totalW = btnW * 9 + 6 * 8;
      const startX = Math.floor((W - totalW) / 2);
      for (let d = 1; d <= 9; d++) {
        const bx = startX + (d - 1) * (btnW + 6);
        if (tx >= bx && tx <= bx + btnW) return d;
      }
      return null;
    }

    function triggerSolve(now) {
      solved = true;
      solveAnimStart = now;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_str8ts') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_str8ts', solveTime);
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
      o.frequency.value = freq || 600;
      o.type = 'sine';
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    }

    function playChord() {
      if (!audioCtx) return;
      [349, 440, 523, 698].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        gain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.14, audioCtx.currentTime + i * 0.08 + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.08 + 0.6);
        o.start(audioCtx.currentTime + i * 0.08);
        o.stop(audioCtx.currentTime + i * 0.08 + 0.65);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    // Draw subtle diagonal hatch for black cells
    function drawBlackCell(cx, cy, size, hasNum, num) {
      g.fillStyle = '#1a1410';
      g.fillRect(cx, cy, size, size);

      // Diagonal texture
      g.save();
      g.beginPath();
      g.rect(cx, cy, size, size);
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 1;
      const step = Math.max(5, Math.floor(size / 4));
      for (let d = -size; d < size * 2; d += step) {
        g.beginPath();
        g.moveTo(cx + d, cy);
        g.lineTo(cx + d + size, cy + size);
        g.stroke();
      }
      g.restore();

      if (hasNum) {
        g.font = `bold ${Math.floor(size * 0.42)}px -apple-system, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = ACCENT_BRIGHT + 'aa';
        g.fillText(String(num), cx + size / 2, cy + size / 2);
      }
    }

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const p = PUZZLES[puzzleIdx % PUZZLES.length];

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const layout = getLayout();
      const { CELL, ox, oy, padY } = layout;

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT_BRIGHT;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`STR8TS  ${(puzzleIdx % PUZZLES.length) + 1}/${PUZZLES.length}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Grid background
      g.fillStyle = '#161614';
      g.beginPath();
      if (g.roundRect) g.roundRect(ox - 3, oy - 3, N * CELL + 6, N * CELL + 6, 8);
      else g.rect(ox - 3, oy - 3, N * CELL + 6, N * CELL + 6);
      g.fill();

      // Draw cells
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const val = userGrid[r][c];
          const isBlackCell = val === -1;
          const clueVal = p.clues[r][c];
          const blackGiven = clueVal < -1 ? Math.abs(clueVal) - 1 : 0;

          if (isBlackCell) {
            drawBlackCell(cx, cy, CELL, blackGiven > 0, blackGiven);
          } else {
            const isSelected = selectedCell && selectedCell.r === r && selectedCell.c === c;
            const isGiv = isGiven(r, c);
            const hasConflict = conflictCells.has(`${r},${c}`);

            g.fillStyle = isSelected ? ACCENT + '22' : '#1e1c18';
            g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);

            if (isSelected) {
              g.strokeStyle = ACCENT_BRIGHT;
              g.lineWidth = 1.5;
              g.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            }

            if (val > 0) {
              g.font = `bold ${Math.floor(CELL * 0.48)}px -apple-system, sans-serif`;
              g.textAlign = 'center'; g.textBaseline = 'middle';
              if (hasConflict && !isGiv) {
                g.fillStyle = '#ff6060';
              } else if (isGiv) {
                g.fillStyle = '#ffffff';
              } else {
                g.fillStyle = ACCENT_BRIGHT;
              }
              g.fillText(String(val), cx + CELL / 2, cy + CELL / 2);
            }
          }
        }
      }

      // Grid lines — subtle, with bold lines every 3 cells
      for (let i = 0; i <= N; i++) {
        const bold = (i % 3 === 0);
        g.strokeStyle = bold ? '#ffffff22' : '#ffffff0d';
        g.lineWidth = bold ? 1 : 0.5;
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
      g.strokeStyle = ACCENT + '66';
      g.lineWidth = 1.5;
      g.strokeRect(ox, oy, N * CELL, N * CELL);

      // Number pad 1-9
      const btnW = Math.min(Math.floor((W - 24) / 10), 40);
      const totalBtnW = btnW * 9 + 6 * 8;
      const startX = Math.floor((W - totalBtnW) / 2);
      for (let d = 1; d <= 9; d++) {
        const bx = startX + (d - 1) * (btnW + 6);
        const by = padY;
        const isActive = selectedCell && userGrid[selectedCell.r][selectedCell.c] === d;

        g.fillStyle = isActive ? ACCENT + '44' : '#1e1c18';
        g.beginPath();
        if (g.roundRect) g.roundRect(bx, by, btnW, 44, 7); else g.rect(bx, by, btnW, 44);
        g.fill();
        g.strokeStyle = isActive ? ACCENT_BRIGHT : '#ffffff1a';
        g.lineWidth = 1.5;
        g.beginPath();
        if (g.roundRect) g.roundRect(bx, by, btnW, 44, 7); else g.rect(bx, by, btnW, 44);
        g.stroke();

        g.font = `bold ${Math.min(16, Math.floor(btnW * 0.5))}px -apple-system, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = isActive ? ACCENT_BRIGHT : '#ffffffaa';
        g.fillText(String(d), bx + btnW / 2, by + 22);
      }

      // Info button
      g.save();
      g.fillStyle = showInfo ? ACCENT_BRIGHT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 13px -apple-system, sans-serif';
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

      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.85);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.82), 530);
        const cy2 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1814';
        g.beginPath();
        if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
        g.fill();
        g.fillStyle = ACCENT_BRIGHT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('STR8TS', W / 2, cy2 + 50);
        const lx = cx2 + 20;
        let ty = cy2 + 72;
        const lh = 24;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• Black cells block rows and columns',
          '• White cells must contain 1–9',
          '• A "compartment" = consecutive white cells',
          '  in a row or column',
          '• Numbers in each compartment must form',
          '  a straight (consecutive, any order)',
          '• No number repeats in the full row or col',
          '• Numbers on black cells are fixed clues',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffffcc';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }
        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillText('Tap a white cell → select it', lx, ty); ty += lh;
        g.fillText('Tap a number → fill selected cell', lx, ty); ty += lh;
        g.fillText('Tap same number again → clear cell', lx, ty);
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      if (solved) {
        const elapsed2 = now - solveAnimStart;
        if (elapsed2 > 400) {
          g.fillStyle = 'rgba(15,15,12,0.88)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT_BRIGHT;
          g.shadowColor = ACCENT_BRIGHT; g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 16);
          const best = ctx.storage.get('bt_str8ts') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 16);
          g.fillStyle = ACCENT + '33';
          g.beginPath();
          if (g.roundRect) g.roundRect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          else g.rect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48);
          g.fill();
          g.strokeStyle = ACCENT_BRIGHT; g.lineWidth = 1.5;
          g.beginPath();
          if (g.roundRect) g.roundRect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          else g.rect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48);
          g.stroke();
          g.font = 'bold 16px -apple-system, sans-serif';
          g.fillStyle = ACCENT_BRIGHT;
          g.fillText('NEXT PUZZLE', W / 2, USABLE_H / 2 + 74);
        }
      }

      if (showSolution) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, USABLE_H - 48, W, 48);
        g.fillStyle = ACCENT_BRIGHT;
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

      if (solved) {
        if (performance.now() - solveAnimStart > 400) {
          puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
          ctx.storage.set('str8ts_idx', puzzleIdx);
          initPuzzle();
        }
        return;
      }

      const layout = getLayout();
      const padNum = numPadAt(tx, ty, layout);
      if (padNum !== null) {
        if (!gameStarted) { gameStarted = true; startTime = performance.now(); ctx.platform.start(); }
        if (selectedCell) {
          const { r, c } = selectedCell;
          if (isBlack(r, c) || isGiven(r, c)) return;
          if (userGrid[r][c] === padNum) {
            userGrid[r][c] = 0;
          } else {
            userGrid[r][c] = padNum;
          }
          computeConflicts();
          ctx.platform.haptic('light');
          playTap(350 + padNum * 40);
          ctx.platform.interact({ type: 'tap' });
          if (checkSolved()) triggerSolve(performance.now());
        }
        return;
      }

      const { CELL, ox, oy } = layout;
      const c = Math.floor((tx - ox) / CELL);
      const r = Math.floor((ty - oy) / CELL);
      if (r >= 0 && r < N && c >= 0 && c < N) {
        if (isBlack(r, c)) { selectedCell = null; return; }
        if (!gameStarted) { gameStarted = true; startTime = performance.now(); ctx.platform.start(); }
        selectedCell = { r, c };
        ctx.platform.haptic('light');
        playTap(500);
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
