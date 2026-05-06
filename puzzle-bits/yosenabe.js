window.plethoraBit = {
  meta: {
    title: 'Yosenabe',
    author: 'plethora',
    description: 'Slide numbers into matching target zones. Make the sums work!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FFAB40';
    const BG = '#0f0f14';

    // Puzzle format:
    //   grid: 6x6. Cell types:
    //     null = empty floor
    //     { num: n } = free numbered cell (can slide)
    //     { zone: z, total: t } = target zone cell (label z, sum target t)
    //     { wall: true } = wall (blocks slides)
    //   Numbers slide orthogonally until hitting a wall, edge, or another number.
    //   Numbers in the same zone must sum exactly to the zone's total.
    //   Zone cells can span multiple grid squares (same zone label).

    // Grid legend: N=null, W=wall, #n=free number n, Zz_t=zone z (first cell carries total)
    // We encode as objects in a flat array then reshape.

    const $ = null; // empty floor
    const W_ = {wall:true};

    // Zone helper
    const Z = (z, t=0) => ({zone: z, total: t});
    const Zn = (z) => ({zone: z, total: 0}); // zone continuation (no total shown)

    // Free number
    const F = (n) => ({num: n});

    // 5 hand-crafted 6x6 puzzles
    // Zones are labeled A-E, free numbers slide into matching zone.
    const PUZZLES = [
      { // Puzzle 1
        // 2 zones: A (sum 6), B (sum 9)
        // Free: 1,2,3 -> A; 4,5 -> B
        name: 'P1',
        grid: [
          [$,    $,    F(2), $,    $,    $   ],
          [$,    $,    $,    $,    F(4), $   ],
          [F(1), $,    $,    $,    $,    F(5)],
          [$,    $,    W_,   $,    $,    $   ],
          [$,    Z('A',6), Zn('A'), $, Z('B',9), Zn('B')],
          [F(3), $,    $,    $,    $,    $   ],
        ],
        zoneInfo: { A: 6, B: 9 },
      },
      { // Puzzle 2
        // 3 zones: A (sum 5), B (sum 7), C (sum 3)
        name: 'P2',
        grid: [
          [F(3), $,    $,    $,    F(2), $   ],
          [$,    $,    W_,   $,    $,    $   ],
          [$,    F(5), $,    $,    $,    F(3)],
          [$,    $,    $,    W_,   $,    $   ],
          [Z('A',5), Zn('A'), $, $, Z('B',7), Zn('B')],
          [$,    $,    F(2), Z('C',3), $, $  ],
        ],
        zoneInfo: { A: 5, B: 7, C: 3 },
      },
      { // Puzzle 3
        // 3 zones: A (sum 8), B (sum 6), C (sum 4)
        name: 'P3',
        grid: [
          [$,    F(3), $,    $,    F(4), $   ],
          [F(5), $,    $,    $,    $,    $   ],
          [$,    $,    W_,   $,    $,    F(2)],
          [Z('A',8), Zn('A'), $, Z('B',6), Zn('B'), $],
          [$,    $,    $,    $,    $,    $   ],
          [F(3), $,    Z('C',4), $, $,    F(1)],
        ],
        zoneInfo: { A: 8, B: 6, C: 4 },
      },
      { // Puzzle 4
        // 3 zones: A (sum 9), B (sum 4), C (sum 5) total=18
        // Free: 4+3+4+3+2+2=18 ✓
        name: 'P4',
        grid: [
          [$,    F(4), $,    $,    F(3), $   ],
          [F(4), $,    $,    W_,   $,    $   ],
          [$,    $,    F(3), $,    $,    F(2)],
          [$,    Z('A',9), Zn('A'), $, $, $ ],
          [$,    $,    $,    $,    Z('B',4), Zn('B')],
          [Z('C',5), Zn('C'), $, $, $,  F(2)],
        ],
        zoneInfo: { A: 9, B: 4, C: 5 },
      },
      { // Puzzle 5 - harder
        // 4 zones: A (sum 6), B (sum 8), C (sum 5), D (sum 3) total=22
        // Free: 4+3+5+5+3+2=22 ✓
        name: 'P5',
        grid: [
          [F(4), $,    $,    F(3), $,    $   ],
          [$,    F(5), $,    $,    $,    F(5)],
          [$,    $,    W_,   $,    W_,   $   ],
          [Z('A',6), Zn('A'), $, Z('B',8), Zn('B'), $],
          [$,    $,    F(3), $,    $,    $   ],
          [Z('C',5), Zn('C'), $, Z('D',3), $, F(2)],
        ],
        zoneInfo: { A: 6, B: 8, C: 5, D: 3 },
      },
    ];

    const N = 6;
    let puzzleIdx = ctx.storage.get('yosenabe_idx') || 0;
    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showSolution = false;
    const EYE_X = W - 22, EYE_Y = 62, EYE_R = 14;

    let gameStarted = false;
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let solveAnim = null;
    let audioCtx = null;
    let voices = 0;

    // Live grid state (mutable copy of cells)
    let grid = [];
    // Selected cell {r,c} or null
    let selected = null;
    // Ghost trail: [{r,c}] for current slide preview
    let ghostTrail = [];
    // Slide anim: {from:{r,c}, to:{r,c}, t, cell}
    let slideAnim = null;

    function deepCloneGrid(src) {
      return src.map(row => row.map(cell => cell ? Object.assign({}, cell) : null));
    }

    // Apply solution: for each free number in original puzzle, slide it into its
    // correct zone by directly writing the final grid state.
    function applySolution() {
      const puzzle = PUZZLES[puzzleIdx % PUZZLES.length];
      // Start from a fresh clone so we can compute slides cleanly
      const solGrid = deepCloneGrid(puzzle.grid);
      // Collect free numbers from original
      const freeNums = [];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = solGrid[r][c];
          if (cell && cell.num !== undefined && !cell.zone) {
            freeNums.push({ r, c, num: cell.num });
          }
        }
      }
      // Remove all free numbers from solGrid
      for (const { r, c } of freeNums) solGrid[r][c] = null;
      // For each zone, compute how much it needs; greedily assign numbers
      // Use a simple strategy: for each zone find adjacent free num spots and fill
      // Actually: simulate slides along row/col toward the zone cells
      // Simplest correct approach: rebuild grid to match solved state by
      // depositing each number directly into the nearest zone cell that needs it.
      const zones = puzzle.zoneInfo;
      // Track remaining needed per zone
      const needed = {};
      for (const [z, t] of Object.entries(zones)) needed[z] = t;
      // Find zone cells (take first cell with total > 0 as anchor)
      const zoneCells = {};
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = solGrid[r][c];
          if (cell && cell.zone && !zoneCells[cell.zone]) zoneCells[cell.zone] = { r, c };
        }
      }
      // Assign each free number to a zone that still needs value
      for (const { num } of freeNums) {
        for (const [z] of Object.entries(needed)) {
          if (needed[z] >= num) {
            // Place this number on the first available zone cell
            const zc = zoneCells[z];
            if (zc) {
              const dest = solGrid[zc.r][zc.c];
              solGrid[zc.r][zc.c] = Object.assign({}, dest, { num: (dest.num || 0) + num });
              needed[z] -= num;
              break;
            }
          }
        }
      }
      grid = solGrid;
      selected = null;
      ghostTrail = [];
      slideAnim = null;
      showSolution = true;
    }

    function initPuzzle() {
      const puzzle = PUZZLES[puzzleIdx % PUZZLES.length];
      grid = deepCloneGrid(puzzle.grid);
      selected = null;
      ghostTrail = [];
      slideAnim = null;
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnim = null;
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 48;
      const PAD = 18;
      const availW = W - PAD * 2;
      const availH = USABLE_H - HUD_H - PAD * 2;
      const CELL = Math.min(Math.floor(availW / N), Math.floor(availH / N), 62);
      const gridW = CELL * N;
      const gridH = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + Math.floor((USABLE_H - HUD_H - gridH) / 2);
      return { CELL, ox, oy, gridW, gridH };
    }

    function cellAt(tx, ty, layout) {
      const {CELL, ox, oy} = layout;
      const c = Math.floor((tx - ox) / CELL);
      const r = Math.floor((ty - oy) / CELL);
      if (r < 0 || r >= N || c < 0 || c >= N) return null;
      return {r, c};
    }

    function getArrowBounds(r, c, layout) {
      // Returns 4 arrow hitboxes [{dir,cx,cy}] around cell (r,c)
      // Arrows must stay above USABLE_H - SAFE
      const {CELL, ox, oy} = layout;
      const ccx = ox + c * CELL + CELL / 2;
      const ccy = oy + r * CELL + CELL / 2;
      const off = CELL * 0.75;
      const arrows = [];
      const dirs = [
        {dir:'up',    dx: 0,    dy: -off},
        {dir:'down',  dx: 0,    dy:  off},
        {dir:'left',  dx: -off, dy: 0   },
        {dir:'right', dx:  off, dy: 0   },
      ];
      for (const {dir, dx, dy} of dirs) {
        const ax = ccx + dx;
        const ay = ccy + dy;
        if (ay >= USABLE_H - SAFE) continue; // below safe zone
        if (ax < 0 || ax > W || ay < 0) continue;
        arrows.push({dir, cx: ax, cy: ay});
      }
      return arrows;
    }

    // Find slide destination for cell at (r,c) in direction dir
    function slideDestination(r, c, dir) {
      let dr = 0, dc = 0;
      if (dir === 'up') dr = -1;
      else if (dir === 'down') dr = 1;
      else if (dir === 'left') dc = -1;
      else if (dir === 'right') dc = 1;

      const path = [];
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < N && nc >= 0 && nc < N) {
        const cell = grid[nr][nc];
        if (cell && cell.wall) break;
        if (cell && cell.num !== undefined) break; // another number blocks
        path.push({r: nr, c: nc});
        nr += dr; nc += dc;
      }
      return path; // last element is destination, empty means can't move
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playSlide() {
      if (!audioCtx || voices >= 8) return;
      voices++;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = 440;
      o.type = 'triangle';
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
      o.start(); o.stop(audioCtx.currentTime + 0.22);
      ctx.timeout(() => { voices = Math.max(0, voices - 1); }, 250);
    }

    function playSelect() {
      if (!audioCtx || voices >= 8) return;
      voices++;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = 660;
      o.type = 'sine';
      gain.gain.setValueAtTime(0.09, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.start(); o.stop(audioCtx.currentTime + 0.08);
      ctx.timeout(() => { voices = Math.max(0, voices - 1); }, 100);
    }

    function playWin() {
      if (!audioCtx) return;
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        ctx.timeout(() => {
          if (voices >= 8) return;
          voices++;
          const o = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          o.connect(gain); gain.connect(audioCtx.destination);
          o.frequency.value = f;
          o.type = 'sine';
          gain.gain.setValueAtTime(0.14, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
          o.start(); o.stop(audioCtx.currentTime + 0.45);
          ctx.timeout(() => { voices = Math.max(0, voices - 1); }, 500);
        }, i * 75);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function checkSolved() {
      const puzzle = PUZZLES[puzzleIdx % PUZZLES.length];
      const zones = puzzle.zoneInfo;
      // For each zone, find zone cells and free numbers that landed on them
      for (const [zLabel, target] of Object.entries(zones)) {
        let sum = 0;
        let hasNumber = false;
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const cell = grid[r][c];
            if (cell && cell.zone === zLabel && cell.num !== undefined) {
              sum += cell.num;
              hasNumber = true;
            }
          }
        }
        if (!hasNumber) return false;
        if (sum !== target) return false;
      }
      // All free numbers must be in a zone
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = grid[r][c];
          if (cell && cell.num !== undefined && !cell.zone) return false;
        }
      }
      return true;
    }

    // Perform slide: move number from (r,c) along path, merge with zone at destination
    function doSlide(r, c, path) {
      if (!path.length) return;
      const dest = path[path.length - 1];
      const moving = grid[r][c];
      const destCell = grid[dest.r][dest.c];

      // Move the number
      grid[r][c] = null;

      if (destCell && destCell.zone) {
        // Land on zone cell — merge num into zone cell
        grid[dest.r][dest.c] = Object.assign({}, destCell, { num: (destCell.num || 0) + moving.num });
      } else {
        // Empty floor
        grid[dest.r][dest.c] = { num: moving.num };
      }

      selected = null;
      ghostTrail = [];

      // Anim
      slideAnim = {
        from: {r, c},
        to: dest,
        path,
        startTime: performance.now(),
        cell: moving,
      };
    }

    // Zone sum display helper
    function getZoneCurrentSum(zLabel) {
      let sum = 0;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = grid[r][c];
          if (cell && cell.zone === zLabel && cell.num !== undefined) sum += cell.num;
        }
      }
      return sum;
    }

    // Zone total lookup (from first cell that has it)
    function getZoneTotal(zLabel) {
      const puzzle = PUZZLES[puzzleIdx % PUZZLES.length];
      return puzzle.zoneInfo[zLabel] || 0;
    }

    initPuzzle();

    const ZONE_COLORS = {
      A: 'rgba(255,171,64,0.18)',
      B: 'rgba(100,255,218,0.14)',
      C: 'rgba(225,190,231,0.16)',
      D: 'rgba(179,229,252,0.14)',
      E: 'rgba(200,230,201,0.15)',
    };
    const ZONE_BORDER = {
      A: '#FFAB40',
      B: '#64FFDA',
      C: '#CE93D8',
      D: '#80DEEA',
      E: '#A5D6A7',
    };

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const layout = getLayout();
      const {CELL, ox, oy, gridW, gridH} = layout;

      // HUD bar
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`YOSENABE  ${(puzzleIdx % PUZZLES.length) + 1}/${PUZZLES.length}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Draw ghost trail
      if (ghostTrail.length) {
        g.fillStyle = `rgba(255,171,64,0.12)`;
        for (const {r, c} of ghostTrail) {
          g.fillRect(ox + c * CELL + 2, oy + r * CELL + 2, CELL - 4, CELL - 4);
        }
        // Arrow at end of trail
        if (ghostTrail.length) {
          const last = ghostTrail[ghostTrail.length - 1];
          const prev = ghostTrail.length > 1 ? ghostTrail[ghostTrail.length - 2] : selected;
          if (prev) {
            const dx = last.c - prev.c;
            const dy = last.r - prev.r;
            const tx2 = ox + last.c * CELL + CELL / 2;
            const ty2 = oy + last.r * CELL + CELL / 2;
            g.save();
            g.fillStyle = ACCENT;
            g.globalAlpha = 0.5;
            g.beginPath();
            g.translate(tx2, ty2);
            g.rotate(Math.atan2(dy, dx));
            g.moveTo(8, 0); g.lineTo(-6, -6); g.lineTo(-6, 6);
            g.closePath(); g.fill();
            g.restore();
          }
        }
      }

      // Draw cells
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = grid[r][c];
          const cx = ox + c * CELL;
          const cy2 = oy + r * CELL;

          // Cell background
          if (cell && cell.wall) {
            g.fillStyle = '#2a2a3a';
            g.fillRect(cx, cy2, CELL, CELL);
            // Hatch pattern
            g.save();
            g.strokeStyle = 'rgba(255,255,255,0.07)';
            g.lineWidth = 1;
            g.beginPath();
            for (let i = -CELL; i < CELL * 2; i += 8) {
              g.moveTo(cx + i, cy2);
              g.lineTo(cx + i + CELL, cy2 + CELL);
            }
            g.stroke();
            g.restore();
          } else if (cell && cell.zone) {
            const color = ZONE_COLORS[cell.zone] || 'rgba(255,255,255,0.08)';
            g.fillStyle = color;
            g.fillRect(cx, cy2, CELL, CELL);
          } else {
            g.fillStyle = 'rgba(255,255,255,0.04)';
            g.fillRect(cx, cy2, CELL, CELL);
          }

          // Cell border
          g.strokeStyle = 'rgba(255,255,255,0.1)';
          g.lineWidth = 1;
          g.strokeRect(cx, cy2, CELL, CELL);

          // Zone label/total in zone cells (first cell only — has total)
          if (cell && cell.zone && cell.total > 0) {
            const bc = ZONE_BORDER[cell.zone] || '#ffffff';
            // Corner label
            g.font = `bold 10px -apple-system, sans-serif`;
            g.fillStyle = bc;
            g.textAlign = 'left';
            g.textBaseline = 'top';
            const curSum = getZoneCurrentSum(cell.zone);
            const target = cell.total;
            const done = curSum === target;
            g.fillStyle = done ? '#aaffaa' : bc;
            g.fillText(`${cell.zone}=${target}`, cx + 4, cy2 + 3);
          }

          // Number on free cell or number landed in zone
          if (cell && cell.num !== undefined) {
            const isFree = !cell.zone;
            const isSelected = selected && selected.r === r && selected.c === c;

            // Skip if sliding
            if (slideAnim && slideAnim.from.r === r && slideAnim.from.c === c) {
              // don't draw, the anim handles it
            } else {
              if (isSelected) {
                g.fillStyle = `rgba(255,171,64,0.25)`;
                g.beginPath();
                if (g.roundRect) g.roundRect(cx + 4, cy2 + 4, CELL - 8, CELL - 8, 8);
                else g.rect(cx + 4, cy2 + 4, CELL - 8, CELL - 8);
                g.fill();
                g.strokeStyle = ACCENT;
                g.lineWidth = 2;
                g.beginPath();
                if (g.roundRect) g.roundRect(cx + 4, cy2 + 4, CELL - 8, CELL - 8, 8);
                else g.rect(cx + 4, cy2 + 4, CELL - 8, CELL - 8);
                g.stroke();
              } else if (isFree) {
                g.fillStyle = 'rgba(255,171,64,0.12)';
                g.beginPath();
                if (g.roundRect) g.roundRect(cx + 4, cy2 + 4, CELL - 8, CELL - 8, 8);
                else g.rect(cx + 4, cy2 + 4, CELL - 8, CELL - 8);
                g.fill();
                g.strokeStyle = `rgba(255,171,64,0.5)`;
                g.lineWidth = 1.5;
                g.beginPath();
                if (g.roundRect) g.roundRect(cx + 4, cy2 + 4, CELL - 8, CELL - 8, 8);
                else g.rect(cx + 4, cy2 + 4, CELL - 8, CELL - 8);
                g.stroke();
              }

              g.font = `bold ${Math.floor(CELL * 0.42)}px -apple-system, sans-serif`;
              g.fillStyle = isFree ? ACCENT : (cell.zone ? ZONE_BORDER[cell.zone] || '#fff' : '#fff');
              if (isSelected) g.fillStyle = ACCENT;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText(String(cell.num), cx + CELL / 2, cy2 + CELL / 2);
            }
          }
        }
      }

      // Zone border outlines
      const puzzle = PUZZLES[puzzleIdx % PUZZLES.length];
      for (const [zLabel] of Object.entries(puzzle.zoneInfo)) {
        const bc = ZONE_BORDER[zLabel] || '#ffffff';
        g.strokeStyle = bc;
        g.lineWidth = 2;
        g.globalAlpha = 0.4;
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const cell = grid[r][c];
            if (cell && cell.zone === zLabel) {
              // Draw border sides not shared with same zone
              const neighbors = [
                {dr:-1,dc:0, sx:0,sy:0,ex:CELL,ey:0},
                {dr:1, dc:0, sx:0,sy:CELL,ex:CELL,ey:CELL},
                {dr:0, dc:-1,sx:0,sy:0,ex:0,ey:CELL},
                {dr:0, dc:1, sx:CELL,sy:0,ex:CELL,ey:CELL},
              ];
              const cx = ox + c * CELL;
              const cy2 = oy + r * CELL;
              for (const {dr,dc,sx,sy,ex,ey} of neighbors) {
                const nr = r+dr, nc = c+dc;
                let sameZone = false;
                if (nr>=0&&nr<N&&nc>=0&&nc<N) {
                  const nc2 = grid[nr][nc];
                  if (nc2 && nc2.zone === zLabel) sameZone = true;
                }
                if (!sameZone) {
                  g.beginPath();
                  g.moveTo(cx+sx, cy2+sy);
                  g.lineTo(cx+ex, cy2+ey);
                  g.stroke();
                }
              }
            }
          }
        }
        g.globalAlpha = 1;
      }

      // Draw direction arrows for selected cell
      if (selected && !slideAnim) {
        const {r, c} = selected;
        const cell = grid[r][c];
        if (cell && cell.num !== undefined && !cell.zone) {
          const arrows = getArrowBounds(r, c, layout);
          for (const {dir, cx: ax, cy: ay} of arrows) {
            const path = slideDestination(r, c, dir);
            if (!path.length) continue; // can't slide this way
            g.save();
            g.fillStyle = ACCENT;
            g.globalAlpha = 0.85;
            g.beginPath();
            g.arc(ax, ay, CELL * 0.22, 0, Math.PI * 2);
            g.fill();
            // Arrow glyph
            g.fillStyle = '#000';
            g.font = `bold ${Math.floor(CELL * 0.28)}px -apple-system, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            const glyphs = {up:'▲', down:'▼', left:'◀', right:'▶'};
            g.fillText(glyphs[dir], ax, ay);
            g.restore();
          }
        }
      }

      // Slide animation
      if (slideAnim) {
        const animDur = 200;
        const t = Math.min((now - slideAnim.startTime) / animDur, 1);
        const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease in-out quad
        const {from, path} = slideAnim;
        const dest = path[path.length - 1];
        const ax = ox + (from.c + (dest.c - from.c) * ease) * CELL + CELL / 2;
        const ay = oy + (from.r + (dest.r - from.r) * ease) * CELL + CELL / 2;
        const sz = CELL - 8;

        g.fillStyle = `rgba(255,171,64,0.2)`;
        g.beginPath();
        if (g.roundRect) g.roundRect(ax - sz/2, ay - sz/2, sz, sz, 8);
        else g.rect(ax - sz/2, ay - sz/2, sz, sz);
        g.fill();
        g.strokeStyle = ACCENT;
        g.lineWidth = 2;
        g.beginPath();
        if (g.roundRect) g.roundRect(ax - sz/2, ay - sz/2, sz, sz, 8);
        else g.rect(ax - sz/2, ay - sz/2, sz, sz);
        g.stroke();
        g.font = `bold ${Math.floor(CELL * 0.42)}px -apple-system, sans-serif`;
        g.fillStyle = ACCENT;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(slideAnim.cell.num), ax, ay);

        if (t >= 1) {
          slideAnim = null;
          // Check win
          if (!solved && checkSolved()) {
            solved = true;
            solveTime = performance.now() - startTime;
            solveAnim = performance.now();
            const best = ctx.storage.get('bt_yosenabe') || 0;
            if (!best || solveTime < best) ctx.storage.set('bt_yosenabe', solveTime);
            ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
            ctx.platform.haptic('heavy');
            playWin();
          }
        }
      }

      // Zone sum indicators (shown on left of each zone label)
      for (const [zLabel] of Object.entries(puzzle.zoneInfo)) {
        const target = getZoneTotal(zLabel);
        const cur = getZoneCurrentSum(zLabel);
        if (cur > 0) {
          // Find first zone cell
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              const cell = grid[r][c];
              if (cell && cell.zone === zLabel && cell.total > 0) {
                const cx = ox + c * CELL;
                const cy2 = oy + r * CELL;
                const ok = cur === target;
                g.font = 'bold 9px -apple-system, sans-serif';
                g.fillStyle = ok ? '#aaffaa' : (cur > target ? '#ff6666' : '#ffcc66');
                g.textAlign = 'left';
                g.textBaseline = 'bottom';
                g.fillText(`${cur}/${target}`, cx + 4, cy2 + CELL - 3);
              }
            }
          }
        }
      }

      // Solve overlay
      if (solved && solveAnim) {
        const t = (now - solveAnim) / 500;
        if (t < 1) {
          g.fillStyle = `rgba(255,171,64,${0.18 * Math.sin(t * Math.PI)})`;
          g.fillRect(0, 0, W, H);
        } else {
          g.fillStyle = 'rgba(15,15,20,0.9)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 64);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.6)';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 18);
          const best = ctx.storage.get('bt_yosenabe') || 0;
          if (best) g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 18);
          const bx = W/2 - 110, by = USABLE_H/2 + 52, bw = 220, bh = 50;
          g.fillStyle = ACCENT + '22';
          g.beginPath(); if (g.roundRect) g.roundRect(bx, by, bw, bh, 12); else g.rect(bx, by, bw, bh); g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath(); if (g.roundRect) g.roundRect(bx, by, bw, bh, 12); else g.rect(bx, by, bw, bh); g.stroke();
          g.font = 'bold 15px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.fillText('NEXT PUZZLE', W / 2, by + bh / 2);
        }
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
        g.fillStyle = 'rgba(0,0,0,0.9)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.84);
        const cx3 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.80), 520);
        const cy3 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath(); if (g.roundRect) g.roundRect(cx3, cy3, cw, ch, 16); else g.rect(cx3, cy3, cw, ch); g.fill();
        g.save(); g.globalAlpha = 0.12; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W/2, cy3+52, 70, 0, Math.PI*2); g.fill(); g.restore();
        g.fillStyle = ACCENT;
        g.font = 'bold 22px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('YOSENABE', W/2, cy3 + 54);
        const lx = cx3 + 22;
        let ty2 = cy3 + 76;
        const lh = 24;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty2); ty2 += lh;
        const rules = [
          '• Slide numbered tiles into their matching zones',
          '• Numbers slide until blocked by a wall or tile',
          '• Numbers in a zone must sum to the zone target',
          '• Zone labels show A=6 (target sum)',
          '• Current/target shown as 4/6 once a number lands',
          '• Land all numbers correctly to win',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty2); ty2 += lh - 2; }
        ty2 += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty2); ty2 += lh;
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillText('Tap a number tile to select it', lx, ty2); ty2 += lh - 2;
        g.fillText('Tap an arrow or swipe to slide it', lx, ty2); ty2 += lh - 2;
        g.fillText('Tap elsewhere to deselect', lx, ty2);
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W/2, cy3 + ch - 20);
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

    // Swipe tracking
    let swipeStart = null;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      // IBTN check first
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

      // Solved overlay
      if (solved && solveAnim && performance.now() - solveAnim > 500) {
        puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
        ctx.storage.set('yosenabe_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      if (ty >= USABLE_H - SAFE) return;
      swipeStart = {tx, ty, time: performance.now()};

      if (slideAnim) return; // ignore during anim

      const layout = getLayout();

      // Check if tapping an arrow button while something is selected
      if (selected) {
        const {r, c} = selected;
        const cell = grid[r][c];
        if (cell && cell.num !== undefined && !cell.zone) {
          const arrows = getArrowBounds(r, c, layout);
          for (const {dir, cx: ax, cy: ay} of arrows) {
            if (Math.hypot(tx - ax, ty - ay) < CELL * 0.3) {
              const path = slideDestination(r, c, dir);
              if (path.length) {
                if (!gameStarted) {
                  gameStarted = true;
                  startTime = performance.now();
                  ctx.platform.start();
                }
                ctx.platform.interact({ type: 'tap' });
                ctx.platform.haptic('light');
                playSlide();
                doSlide(r, c, path);
                return;
              }
            }
          }
        }
      }

      // Check if tapping a free number
      const hitCell = cellAt(tx, ty, layout);
      if (hitCell) {
        const cell = grid[hitCell.r][hitCell.c];
        if (cell && cell.num !== undefined && !cell.zone) {
          if (selected && selected.r === hitCell.r && selected.c === hitCell.c) {
            selected = null;
            ghostTrail = [];
          } else {
            selected = hitCell;
            ghostTrail = [];
            playSelect();
            ctx.platform.haptic('light');
          }
        } else {
          selected = null;
          ghostTrail = [];
        }
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!swipeStart || !selected || slideAnim) return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStart.tx;
      const dy = ty - swipeStart.ty;
      if (Math.hypot(dx, dy) < 12) return;
      let dir;
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
      else dir = dy > 0 ? 'down' : 'up';
      // Show ghost trail for current swipe direction
      const layout = getLayout();
      const {r, c} = selected;
      const path = slideDestination(r, c, dir);
      ghostTrail = path;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!swipeStart || !selected || slideAnim) { swipeStart = null; return; }
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStart.tx;
      const dy = ty - swipeStart.ty;
      swipeStart = null;

      if (Math.hypot(dx, dy) < 20) { ghostTrail = []; return; }

      let dir;
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
      else dir = dy > 0 ? 'down' : 'up';

      const layout = getLayout();
      const {r, c} = selected;
      const path = slideDestination(r, c, dir);
      ghostTrail = [];
      if (!path.length) return;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }
      ctx.platform.interact({ type: 'swipe' });
      ctx.platform.haptic('light');
      playSlide();
      doSlide(r, c, path);
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
