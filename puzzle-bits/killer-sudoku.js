window.plethoraBit = {
  meta: {
    title: 'Killer Sudoku',
    author: 'plethora',
    description: 'Sudoku with cage sums — no repeats in any cage.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#AB47BC';
    const BG = '#0f0f14';

    // Cage palette — distinct soft colors for visual separation
    const CAGE_COLORS = [
      'rgba(171,71,188,0.13)', 'rgba(79,195,247,0.12)', 'rgba(255,112,67,0.12)',
      'rgba(102,187,106,0.12)','rgba(255,213,79,0.10)', 'rgba(38,198,218,0.12)',
      'rgba(240,98,146,0.12)', 'rgba(156,204,101,0.11)','rgba(255,171,64,0.11)',
      'rgba(121,134,203,0.13)','rgba(77,182,172,0.12)', 'rgba(229,115,115,0.12)',
    ];

    // Each puzzle: solution (81 chars), cages array
    // cage: { sum, cells: [index, ...] }  index = row*9+col
    // Standard Sudoku rules + cages must sum + no repeat in cage

    const PUZZLES = [
      // ── Puzzle 1 ── Easy (few cages, large cells)
      {
        name: 'EASY',
        solution: '974632158368175294125489673241896537697351842583724961856947312732518469419263785',
        cages: [
          { sum: 16, cells: [0,1] },         // r0c0+r0c1 = 9+7
          { sum: 4,  cells: [2,3] },          // 4+0? => 4+6=10 nope
          // Corrected — derive from solution above
          // solution[0]=9, [1]=7, [2]=4, [3]=6, [4]=3, [5]=2, [6]=1, [7]=5, [8]=8
          { sum: 16, cells: [0,1] },          // 9+7=16
          { sum: 10, cells: [2,3] },          // 4+6=10
          { sum: 5,  cells: [4,5] },          // 3+2=5
          { sum: 14, cells: [6,7,8] },        // 1+5+8=14
          { sum: 9,  cells: [9,18] },         // [1][0]=3+[2][0]=1  => 3+... let me redo
        ],
      },
    ];

    // Clean hand-verified puzzles
    // solution strings verified to be valid Sudoku
    // cages sum verified against solution

    function makeSolution(str) { return str.split('').map(Number); }

    function makeCages(sol, specs) {
      // specs: array of cell-index arrays; sum auto-computed from solution
      return specs.map((cells, i) => ({
        id: i,
        cells,
        sum: cells.reduce((acc, ci) => acc + sol[ci], 0),
      }));
    }

    // idx helper
    const I = (r, c) => r * 9 + c;

    const CLEAN_PUZZLES = (() => {
      const pzls = [];

      // ── Puzzle 1 ── Easy ──────────────────────────────────────────────────
      const sol1 = makeSolution('974632158368175294125489673241896537697351842583724961856947312732518469419263785');
      pzls.push({
        name: 'EASY',
        solution: sol1,
        cages: makeCages(sol1, [
          [I(0,0),I(0,1)],            // 9+7=16
          [I(0,2),I(0,3)],            // 4+6=10
          [I(0,4),I(0,5)],            // 3+2=5
          [I(0,6),I(0,7),I(0,8)],    // 1+5+8=14
          [I(1,0),I(2,0)],            // 3+1=4
          [I(1,1),I(1,2)],            // 6+8=14  (wait: sol1[9]=3,sol1[10]=6,sol1[11]=8) => I(1,0)=sol1[9]=3,I(1,1)=6,I(1,2)=8
          [I(1,3),I(2,3)],            // sol1[12]=1, sol1[21]=4 => 5
          [I(1,4),I(1,5)],            // sol1[13]=7, sol1[14]=5 => 12
          [I(1,6),I(1,7),I(1,8)],    // 2+9+4 = 15
          [I(2,1),I(2,2)],            // sol1[19]=2, sol1[20]=5 => 7
          [I(2,4),I(2,5)],            // sol1[22]=8, sol1[23]=9 => 17
          [I(2,6),I(2,7),I(2,8)],    // 6+7+3 = 16
          [I(3,0),I(4,0)],
          [I(3,1),I(3,2)],
          [I(3,3),I(3,4),I(3,5)],
          [I(3,6),I(4,6)],
          [I(3,7),I(3,8)],
          [I(4,1),I(4,2)],
          [I(4,3),I(4,4),I(4,5)],
          [I(4,7),I(4,8)],
          [I(5,0),I(6,0)],
          [I(5,1),I(5,2)],
          [I(5,3),I(5,4),I(5,5)],
          [I(5,6),I(6,6)],
          [I(5,7),I(5,8)],
          [I(6,1),I(6,2)],
          [I(6,3),I(6,4),I(6,5)],
          [I(6,7),I(6,8)],
          [I(7,0),I(8,0)],
          [I(7,1),I(7,2)],
          [I(7,3),I(7,4),I(7,5)],
          [I(7,6),I(8,6)],
          [I(7,7),I(7,8)],
          [I(8,1),I(8,2)],
          [I(8,3),I(8,4),I(8,5)],
          [I(8,7),I(8,8)],
        ]),
      });

      // ── Puzzle 2 ── Medium ────────────────────────────────────────────────
      const sol2 = makeSolution('153862479826479531479531826248756913365918247917243658534127896692385714781694532' );
      // Verify: just use it (hand-checked Sudoku)
      // Actually use a known valid puzzle
      const sol2b = makeSolution('123456789456789123789123456214365897365897214897214365531642978642978531978531642');
      pzls.push({
        name: 'MEDIUM',
        solution: sol2b,
        cages: makeCages(sol2b, [
          [I(0,0),I(1,0)],
          [I(0,1),I(0,2),I(0,3)],
          [I(0,4),I(0,5)],
          [I(0,6),I(0,7),I(0,8)],
          [I(1,1),I(2,1)],
          [I(1,2),I(1,3)],
          [I(1,4),I(1,5),I(1,6)],
          [I(1,7),I(1,8)],
          [I(2,0),I(3,0)],
          [I(2,2),I(2,3),I(3,3)],
          [I(2,4),I(2,5)],
          [I(2,6),I(2,7),I(2,8)],
          [I(3,1),I(3,2)],
          [I(3,4),I(3,5),I(3,6)],
          [I(3,7),I(3,8)],
          [I(4,0),I(5,0)],
          [I(4,1),I(4,2),I(4,3)],
          [I(4,4),I(4,5)],
          [I(4,6),I(4,7),I(4,8)],
          [I(5,1),I(6,1)],
          [I(5,2),I(5,3)],
          [I(5,4),I(5,5),I(5,6)],
          [I(5,7),I(5,8)],
          [I(6,0),I(7,0)],
          [I(6,2),I(6,3),I(7,3)],
          [I(6,4),I(6,5)],
          [I(6,6),I(6,7),I(6,8)],
          [I(7,1),I(7,2)],
          [I(7,4),I(7,5),I(7,6)],
          [I(7,7),I(7,8)],
          [I(8,0),I(8,1),I(8,2)],
          [I(8,3),I(8,4)],
          [I(8,5),I(8,6)],
          [I(8,7),I(8,8)],
        ]),
      });

      // ── Puzzle 3 ── Medium-Hard ───────────────────────────────────────────
      const sol3 = makeSolution('317849625428653791659271348195734862743268519862195473571386924234917856986542137');
      pzls.push({
        name: 'TRICKY',
        solution: sol3,
        cages: makeCages(sol3, [
          [I(0,0),I(1,0),I(2,0)],
          [I(0,1),I(0,2)],
          [I(0,3),I(0,4),I(0,5)],
          [I(0,6),I(1,6)],
          [I(0,7),I(0,8)],
          [I(1,1),I(2,1)],
          [I(1,2),I(1,3)],
          [I(1,4),I(1,5)],
          [I(1,7),I(1,8)],
          [I(2,2),I(3,2)],
          [I(2,3),I(2,4)],
          [I(2,5),I(2,6)],
          [I(2,7),I(2,8)],
          [I(3,0),I(4,0)],
          [I(3,1),I(3,3)],
          [I(3,4),I(3,5)],
          [I(3,6),I(3,7),I(3,8)],
          [I(4,1),I(4,2)],
          [I(4,3),I(5,3)],
          [I(4,4),I(4,5)],
          [I(4,6),I(5,6)],
          [I(4,7),I(4,8)],
          [I(5,0),I(6,0)],
          [I(5,1),I(5,2)],
          [I(5,4),I(5,5)],
          [I(5,7),I(5,8)],
          [I(6,1),I(6,2)],
          [I(6,3),I(6,4),I(6,5)],
          [I(6,6),I(7,6)],
          [I(6,7),I(6,8)],
          [I(7,0),I(8,0)],
          [I(7,1),I(7,2)],
          [I(7,3),I(7,4)],
          [I(7,5),I(8,5)],
          [I(7,7),I(7,8)],
          [I(8,1),I(8,2),I(8,3)],
          [I(8,4),I(8,6)],
          [I(8,7),I(8,8)],
        ]),
      });

      // ── Puzzle 4 ── Hard ─────────────────────────────────────────────────
      const sol4 = makeSolution('295741386164389572873526941518293764427865193936174825652437819741958632389612457');
      pzls.push({
        name: 'HARD',
        solution: sol4,
        cages: makeCages(sol4, [
          [I(0,0),I(0,1),I(1,1)],
          [I(0,2),I(0,3)],
          [I(0,4),I(0,5),I(0,6)],
          [I(0,7),I(0,8)],
          [I(1,0),I(2,0)],
          [I(1,2),I(1,3)],
          [I(1,4),I(2,4)],
          [I(1,5),I(1,6)],
          [I(1,7),I(1,8)],
          [I(2,1),I(3,1)],
          [I(2,2),I(2,3)],
          [I(2,5),I(2,6)],
          [I(2,7),I(2,8)],
          [I(3,0),I(4,0)],
          [I(3,2),I(3,3),I(3,4)],
          [I(3,5),I(3,6)],
          [I(3,7),I(3,8)],
          [I(4,1),I(4,2)],
          [I(4,3),I(4,4)],
          [I(4,5),I(5,5)],
          [I(4,6),I(4,7)],
          [I(4,8),I(5,8)],
          [I(5,0),I(6,0)],
          [I(5,1),I(5,2)],
          [I(5,3),I(5,4)],
          [I(5,6),I(5,7)],
          [I(6,1),I(7,1)],
          [I(6,2),I(6,3)],
          [I(6,4),I(6,5)],
          [I(6,6),I(6,7),I(6,8)],
          [I(7,0),I(8,0)],
          [I(7,2),I(7,3)],
          [I(7,4),I(7,5)],
          [I(7,6),I(7,7),I(7,8)],
          [I(8,1),I(8,2),I(8,3)],
          [I(8,4),I(8,5)],
          [I(8,6),I(8,7),I(8,8)],
        ]),
      });

      // ── Puzzle 5 ── Expert ────────────────────────────────────────────────
      const sol5 = makeSolution('693784512487512369512369487235978641741635928968241735356127894874956213129843576');
      pzls.push({
        name: 'EXPERT',
        solution: sol5,
        cages: makeCages(sol5, [
          [I(0,0),I(1,0)],
          [I(0,1),I(0,2),I(0,3)],
          [I(0,4),I(0,5)],
          [I(0,6),I(0,7),I(0,8)],
          [I(1,1),I(1,2)],
          [I(1,3),I(2,3)],
          [I(1,4),I(1,5),I(1,6)],
          [I(1,7),I(1,8)],
          [I(2,0),I(3,0)],
          [I(2,1),I(2,2)],
          [I(2,4),I(2,5)],
          [I(2,6),I(2,7),I(2,8)],
          [I(3,1),I(3,2),I(4,2)],
          [I(3,3),I(3,4)],
          [I(3,5),I(3,6)],
          [I(3,7),I(3,8)],
          [I(4,0),I(5,0)],
          [I(4,1),I(5,1)],
          [I(4,3),I(4,4),I(4,5)],
          [I(4,6),I(4,7)],
          [I(4,8),I(5,8)],
          [I(5,2),I(5,3)],
          [I(5,4),I(5,5)],
          [I(5,6),I(5,7)],
          [I(6,0),I(7,0)],
          [I(6,1),I(6,2),I(7,2)],
          [I(6,3),I(6,4)],
          [I(6,5),I(6,6)],
          [I(6,7),I(6,8)],
          [I(7,1),I(8,1)],
          [I(7,3),I(7,4),I(7,5)],
          [I(7,6),I(7,7),I(7,8)],
          [I(8,0),I(8,2)],
          [I(8,3),I(8,4),I(8,5)],
          [I(8,6),I(8,7),I(8,8)],
        ]),
      });

      return pzls;
    })();

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showSolution = false;
    const EYE_X = W - 44, EYE_CY = 62, EYE_R = 20;

    let puzzleIdx = ctx.storage.get('killersudoku_idx') || 0;
    let board = [];
    let selected = -1;
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let solveAnimStart = 0;
    let audioCtx = null;
    let score = 0;
    let errors = new Set();

    function applySolution() {
      const p = curPuzzle();
      board = [...p.solution];
      errors = new Set();
    }

    function initPuzzle() {
      board = Array(81).fill(0);
      selected = -1;
      errors = new Set();
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnimStart = 0;
      score = 0;
      showSolution = false;
    }

    function curPuzzle() { return CLEAN_PUZZLES[puzzleIdx % CLEAN_PUZZLES.length]; }

    function checkErrors() {
      errors = new Set();
      const p = curPuzzle();
      for (let i = 0; i < 81; i++) {
        if (board[i] !== 0 && board[i] !== p.solution[i]) errors.add(i);
      }
    }

    function checkSolved() {
      const p = curPuzzle();
      for (let i = 0; i < 81; i++) {
        if (board[i] !== p.solution[i]) return false;
      }
      return true;
    }

    function getLayout() {
      const HUD_H = 48;
      const numpadH = 56;
      const PAD = 8;
      const availW = W - PAD * 2;
      const availH = USABLE_H - HUD_H - numpadH - PAD * 2;
      const CELL = Math.min(Math.floor(availW / 9), Math.floor(availH / 9), 42);
      const gridW = CELL * 9, gridH = CELL * 9;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + PAD + Math.floor((availH - gridH) / 2);
      const numpadY = USABLE_H - numpadH - 4;
      return { CELL, ox, oy, numpadY, numpadH, HUD_H };
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playBlip(freq = 880) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = freq; o.type = 'sine';
      gn.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }

    function playError() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 160; o.type = 'sawtooth';
      gn.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      o.start(); o.stop(audioCtx.currentTime + 0.2);
    }

    function playArpeggio() {
      if (!audioCtx) return;
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
        const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = freq; o.type = 'sine';
        const t = audioCtx.currentTime + i * 0.1;
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(0.16, t + 0.05);
        gn.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.start(t); o.stop(t + 0.5);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    function drawRR(x, y, w, h, r2) {
      if (g.roundRect) { g.roundRect(x, y, w, h, r2); return; }
      g.beginPath();
      g.moveTo(x + r2, y); g.lineTo(x + w - r2, y);
      g.arcTo(x + w, y, x + w, y + r2, r2);
      g.lineTo(x + w, y + h - r2);
      g.arcTo(x + w, y + h, x + w - r2, y + h, r2);
      g.lineTo(x + r2, y + h);
      g.arcTo(x, y + h, x, y + h - r2, r2);
      g.lineTo(x, y + r2);
      g.arcTo(x, y, x + r2, y, r2);
      g.closePath();
    }

    // Build cage membership lookup: cageOf[i] = cage index
    function buildCageLookup(cages) {
      const map = new Array(81).fill(-1);
      cages.forEach((cage, ci) => {
        cage.cells.forEach(idx => { map[idx] = ci; });
      });
      return map;
    }

    // Determine which edges of a cell are cage boundaries
    function getCageEdges(r, c, cageOf) {
      const i = r * 9 + c;
      const myId = cageOf[i];
      return {
        top:    r === 0 || cageOf[(r-1)*9+c] !== myId,
        bottom: r === 8 || cageOf[(r+1)*9+c] !== myId,
        left:   c === 0 || cageOf[r*9+(c-1)] !== myId,
        right:  c === 8 || cageOf[r*9+(c+1)] !== myId,
      };
    }

    // Is this cell the top-left of its cage (min row, then min col)?
    function isCageLabel(r, c, cageOf, cages) {
      const ci = cageOf[r * 9 + c];
      if (ci < 0) return false;
      const cage = cages[ci];
      const minCell = Math.min(...cage.cells);
      return r * 9 + c === minCell;
    }

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const p = curPuzzle();
      const cageOf = buildCageLookup(p.cages);

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const { CELL, ox, oy, numpadY, numpadH, HUD_H } = getLayout();

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, W, HUD_H);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`KILLER  ${(puzzleIdx % CLEAN_PUZZLES.length) + 1}/5  ${p.name}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#8899bb';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      const selR = selected >= 0 ? Math.floor(selected / 9) : -1;
      const selC = selected >= 0 ? selected % 9 : -1;
      const selBox = selected >= 0 ? Math.floor(selR / 3) * 3 + Math.floor(selC / 3) : -1;
      const selVal = selected >= 0 ? board[selected] : 0;

      // Draw cage fills first
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c;
          const ci = cageOf[i];
          const cx = ox + c * CELL, cy = oy + r * CELL;
          const isSelected = i === selected;
          const isPeer = selected >= 0 && (Math.floor(i/9) === selR || i%9 === selC || (Math.floor(i/9)/3|0)*3+(i%9/3|0) === selBox);
          const isSameVal = selVal > 0 && board[i] === selVal && i !== selected;

          // Base cage color
          const cageColor = ci >= 0 ? CAGE_COLORS[ci % CAGE_COLORS.length] : 'rgba(255,255,255,0.02)';

          g.fillStyle = isSelected ? ACCENT + '35' : isSameVal ? ACCENT + '1a' : isPeer ? 'rgba(255,255,255,0.05)' : cageColor;
          g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
        }
      }

      // Draw cage dashed borders
      g.save();
      g.setLineDash([3, 3]);
      g.lineWidth = 1.5;

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c;
          const cx = ox + c * CELL, cy = oy + r * CELL;
          const edges = getCageEdges(r, c, cageOf);

          g.strokeStyle = ACCENT + 'aa';
          if (edges.top)    { g.beginPath(); g.moveTo(cx+1, cy+1); g.lineTo(cx+CELL-1, cy+1); g.stroke(); }
          if (edges.bottom) { g.beginPath(); g.moveTo(cx+1, cy+CELL-1); g.lineTo(cx+CELL-1, cy+CELL-1); g.stroke(); }
          if (edges.left)   { g.beginPath(); g.moveTo(cx+1, cy+1); g.lineTo(cx+1, cy+CELL-1); g.stroke(); }
          if (edges.right)  { g.beginPath(); g.moveTo(cx+CELL-1, cy+1); g.lineTo(cx+CELL-1, cy+CELL-1); g.stroke(); }
        }
      }
      g.restore();

      // Draw cage sum labels
      const labelSize = Math.max(7, Math.floor(CELL * 0.23));
      g.font = `bold ${labelSize}px -apple-system, sans-serif`;
      g.textAlign = 'left'; g.textBaseline = 'top';

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c;
          const cx = ox + c * CELL, cy = oy + r * CELL;
          if (isCageLabel(r, c, cageOf, p.cages)) {
            const ci = cageOf[i];
            const sumStr = String(p.cages[ci].sum);
            g.fillStyle = ACCENT + 'cc';
            g.fillText(sumStr, cx + 3, cy + 2);
          }
        }
      }

      // Draw cell numbers
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c;
          const cx = ox + c * CELL, cy = oy + r * CELL;
          if (board[i] !== 0) {
            g.font = `bold ${Math.floor(CELL * 0.52)}px -apple-system, sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillStyle = errors.has(i) ? '#FF5252' : ACCENT;
            g.fillText(String(board[i]), cx + CELL / 2, cy + CELL / 2);
          }
        }
      }

      // Grid lines
      for (let i = 0; i <= 9; i++) {
        const isBold = i % 3 === 0;
        g.strokeStyle = isBold ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.07)';
        g.lineWidth = isBold ? 1.5 : 0.5;
        g.beginPath(); g.moveTo(ox + i * CELL, oy); g.lineTo(ox + i * CELL, oy + 9 * CELL); g.stroke();
        g.beginPath(); g.moveTo(ox, oy + i * CELL); g.lineTo(ox + 9 * CELL, oy + i * CELL); g.stroke();
      }

      // Outer glow
      g.strokeStyle = ACCENT + '55'; g.lineWidth = 2;
      g.strokeRect(ox, oy, 9 * CELL, 9 * CELL);

      // Number pad
      const btnW = Math.floor((W - 32) / 9);
      const btnH = Math.min(numpadH - 8, 44);
      const padX = Math.floor((W - btnW * 9) / 2);
      const padY2 = numpadY + Math.floor((numpadH - btnH) / 2);

      for (let d = 1; d <= 9; d++) {
        const bx = padX + (d - 1) * btnW;
        const usedCount = board.filter(v => v === d).length;
        const full = usedCount >= 9;
        g.fillStyle = full ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)';
        g.beginPath(); drawRR(bx + 2, padY2, btnW - 4, btnH, 8); g.fill();
        if (!full) {
          g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1;
          g.beginPath(); drawRR(bx + 2, padY2, btnW - 4, btnH, 8); g.stroke();
        }
        g.font = `bold ${Math.floor(btnH * 0.44)}px -apple-system, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = full ? 'rgba(255,255,255,0.2)' : selVal === d ? ACCENT : 'rgba(255,255,255,0.75)';
        g.fillText(String(d), bx + btnW / 2, padY2 + btnH / 2);
      }

      // Info button
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
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
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.9)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.86), ch = Math.min(Math.floor(USABLE_H * 0.75), 460);
        const cxp = Math.floor((W - cw) / 2), cyp = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath(); drawRR(cxp, cyp, cw, ch, 16); g.fill();

        g.fillStyle = ACCENT;
        g.font = 'bold 22px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('KILLER SUDOKU', W / 2, cyp + 50);

        const lx = cxp + 22; let ty = cyp + 72; const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Standard Sudoku: 1–9 in each row, col & box',
          '• Cells are grouped into colored "cages"',
          '• Each cage has a sum in its top-left corner',
          '• Digits in a cage must add up to that sum',
          '• No digit repeats within a cage',
        ];
        g.font = '13px -apple-system, sans-serif'; g.fillStyle = '#fff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        const ctrls = ['Tap a cell to select it', 'Tap a number below to fill it in', 'Tap same number again to erase'];
        g.font = '13px -apple-system, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of ctrls) { g.fillText(line, lx, ty); ty += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cyp + ch - 18);
      }

      if (solved) {
        const t = Math.min((now - solveAnimStart) / 600, 1);
        if (t > 0.3) {
          g.fillStyle = `rgba(15,15,20,${0.88 * ((t - 0.3) / 0.7)})`;
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT; g.shadowColor = ACCENT; g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 12);
          const best = ctx.storage.get('bt_killersudoku') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 18);
          g.fillStyle = ACCENT + '1a';
          g.beginPath(); drawRR(W / 2 - 110, USABLE_H / 2 + 52, 220, 50, 12); g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath(); drawRR(W / 2 - 110, USABLE_H / 2 + 52, 220, 50, 12); g.stroke();
          g.font = 'bold 15px -apple-system, sans-serif'; g.fillStyle = ACCENT;
          g.fillText('NEXT PUZZLE', W / 2, USABLE_H / 2 + 77);
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

      const tx = e.changedTouches[0].clientX, ty = e.changedTouches[0].clientY;
      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) { showInfo = !showInfo; return; }
      if (showInfo) { showInfo = false; return; }

      // Eye / solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        applySolution();
        return;
      }

      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved && performance.now() - solveAnimStart > 800) {
        puzzleIdx = (puzzleIdx + 1) % CLEAN_PUZZLES.length;
        ctx.storage.set('killersudoku_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      const { CELL, ox, oy, numpadY, numpadH } = getLayout();

      // Numpad
      const btnW = Math.floor((W - 32) / 9);
      const btnH = Math.min(numpadH - 8, 44);
      const padX = Math.floor((W - btnW * 9) / 2);
      const padY2 = numpadY + Math.floor((numpadH - btnH) / 2);

      if (ty >= padY2 - 8 && ty <= padY2 + btnH + 8) {
        for (let d = 1; d <= 9; d++) {
          const bx = padX + (d - 1) * btnW;
          if (tx >= bx && tx <= bx + btnW) {
            if (selected >= 0 && !solved) {
              if (!gameStarted) { gameStarted = true; startTime = performance.now(); ctx.platform.start(); }
              if (board[selected] === d) {
                board[selected] = 0;
              } else {
                board[selected] = d;
                score += 10;
                ctx.platform.setScore(score);
              }
              checkErrors();
              ctx.platform.haptic('light');
              if (errors.has(selected)) playError();
              else playBlip(440 + d * 40);
              if (checkSolved()) {
                solved = true;
                solveTime = performance.now() - startTime;
                solveAnimStart = performance.now();
                const best = ctx.storage.get('bt_killersudoku') || 0;
                if (!best || solveTime < best) ctx.storage.set('bt_killersudoku', solveTime);
                ctx.platform.complete({ score, durationMs: solveTime });
                playArpeggio();
              }
            }
            return;
          }
        }
      }

      // Grid tap
      const gx = tx - ox, gy = ty - oy;
      if (gx >= 0 && gy >= 0 && gx < 9 * CELL && gy < 9 * CELL) {
        const c = Math.floor(gx / CELL), r = Math.floor(gy / CELL);
        const i = r * 9 + c;
        selected = (selected === i) ? -1 : i;
        ctx.platform.haptic('light');
        playBlip(660);
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
