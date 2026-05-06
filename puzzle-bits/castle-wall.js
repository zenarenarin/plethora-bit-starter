window.plethoraBit = {
  meta: {
    title: 'Castle Wall',
    author: 'plethora',
    description: 'Draw a single closed loop obeying the castle clues.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT  = '#78909C';
    const BG      = '#0f0f14';
    const COLS    = 6;
    const ROWS    = 6;

    // ------------------------------------------------------------------
    // PUZZLES  — 6×6 grids
    // Each cell: { black?: bool, inside?: bool, outside?: bool,
    //              arrow?: 'U'|'D'|'L'|'R', count?: number }
    // Edges: horizontal edges indexed [row][col] — bottom of row, between (row,col) and (row+1,col)
    //        vertical edges indexed [row][col]   — right of col, between (row,col) and (row,col+1)
    // ------------------------------------------------------------------
    const PUZZLES = [
      { // Puzzle 1 — simple ring
        name: 'MOAT',
        cells: [
          [{ black:true },{},{black:true},{black:true},{},{black:true}],
          [{},{},{},{},{},{}],
          [{black:true},{},{inside:true},{inside:true},{},{black:true}],
          [{black:true},{},{inside:true},{inside:true},{},{black:true}],
          [{},{},{},{},{},{}],
          [{black:true},{},{black:true},{black:true},{},{black:true}],
        ],
        // solution edges — hEdges[r][c] = segment below row r at col c (0..ROWS-1, 0..COLS-1)
        // vEdges[r][c] = segment right of col c at row r
        solution: (() => {
          const h = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          const v = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          // outer loop: top row (between r-1 and r0 doesn't exist; use r=0..ROWS)
          // We'll define edges top of row 1 = hEdge[0][c]
          // Full ring at border of inner 4×4 (rows 1-4, cols 1-4)
          for (let c = 1; c <= 4; c++) { h[0][c] = 1; h[4][c] = 1; }
          for (let r = 1; r <= 4; r++) { v[r][0] = 1; v[r][4] = 1; }
          return { h, v };
        })(),
      },
      { // Puzzle 2
        name: 'TOWER',
        cells: [
          [{},{arrow:'R',count:2},{},{},{arrow:'L',count:2},{}],
          [{},{},{},{},{},{}],
          [{outside:true},{},{},{},{},{outside:true}],
          [{outside:true},{},{},{},{},{outside:true}],
          [{},{},{},{},{},{}],
          [{},{arrow:'R',count:2},{},{},{arrow:'L',count:2},{}],
        ],
        solution: (() => {
          const h = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          const v = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          for (let c = 1; c <= 4; c++) { h[0][c] = 1; h[5][c] = 1; }
          for (let r = 0; r < ROWS; r++) { v[r][0] = 1; v[r][4] = 1; }
          return { h, v };
        })(),
      },
      { // Puzzle 3
        name: 'PARAPET',
        cells: [
          [{black:true},{},{black:true},{black:true},{},{black:true}],
          [{},{arrow:'D',count:3},{},{},{arrow:'D',count:3},{}],
          [{},{},{},{},{},{}],
          [{},{},{},{},{},{}],
          [{},{arrow:'U',count:3},{},{},{arrow:'U',count:3},{}],
          [{black:true},{},{black:true},{black:true},{},{black:true}],
        ],
        solution: (() => {
          const h = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          const v = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          for (let c = 0; c < COLS; c++) { h[0][c] = 1; h[5][c] = 1; }
          for (let r = 0; r < ROWS; r++) { v[r][0] = 1; v[r][5] = 1; }
          return { h, v };
        })(),
      },
      { // Puzzle 4
        name: 'KEEP',
        cells: [
          [{},{},{inside:true},{inside:true},{},{}],
          [{},{black:true},{},{},{black:true},{}],
          [{inside:true},{},{},{},{},{inside:true}],
          [{inside:true},{},{},{},{},{inside:true}],
          [{},{black:true},{},{},{black:true},{}],
          [{},{},{inside:true},{inside:true},{},{}],
        ],
        solution: (() => {
          const h = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          const v = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          // rectangle rows 0-5, cols 0-5 minus corners
          for (let c = 1; c <= 4; c++) { h[0][c] = 1; h[5][c] = 1; }
          for (let r = 1; r <= 4; r++) { v[r][0] = 1; v[r][5] = 1; }
          h[0][0] = 0; h[0][5] = 0; h[5][0] = 0; h[5][5] = 0;
          v[0][0] = 0; v[0][5] = 0; v[5][0] = 0; v[5][5] = 0;
          // add corner diagonals as L-shapes
          v[0][0] = 1; h[0][1] = 1;
          v[0][4] = 1; h[0][4] = 1;
          h[5][1] = 1; v[5][0] = 1;
          h[5][4] = 1; v[5][4] = 1;
          return { h, v };
        })(),
      },
      { // Puzzle 5
        name: 'WALLS',
        cells: [
          [{},{arrow:'R',count:1},{},{},{arrow:'L',count:1},{}],
          [{arrow:'D',count:1},{},{},{},{},{arrow:'D',count:1}],
          [{},{},{black:true},{black:true},{},{}],
          [{},{},{black:true},{black:true},{},{}],
          [{arrow:'U',count:1},{},{},{},{},{arrow:'U',count:1}],
          [{},{arrow:'R',count:1},{},{},{arrow:'L',count:1},{}],
        ],
        solution: (() => {
          const h = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          const v = Array.from({length: ROWS}, () => Array(COLS).fill(0));
          // Simple border loop
          for (let c = 0; c < COLS; c++) { h[0][c] = 1; h[5][c] = 1; }
          for (let r = 0; r < ROWS; r++) { v[r][0] = 1; v[r][5] = 1; }
          return { h, v };
        })(),
      },
    ];

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showSolution = false;
    const EYE_X = W - 22, EYE_Y = 62, EYE_R = 14;

    let puzzleIdx = ctx.storage.get('cw_idx') || 0;
    let hEdges, vEdges; // player's drawn edges
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let audioCtx = null;
    let voices = 0;

    function applySolution() {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      const sol = p.solution;
      // Reset all player edges
      topEdges    = Array(COLS).fill(0);
      bottomEdges = Array(COLS).fill(0);
      leftEdges   = Array(ROWS).fill(0);
      rightEdges  = Array(ROWS).fill(0);
      hEdges = Array.from({length: ROWS}, () => Array(COLS).fill(0));
      vEdges = Array.from({length: ROWS}, () => Array(COLS).fill(0));

      // Solution h[r][c]: horizontal edges. The solution IIFEs use r=0..ROWS-1.
      // In solutions, h[0][c] means the edge at top of grid (above row 0) = topEdges,
      // h[ROWS-1][c] = bottomEdges, and interior h[r][c] (1..ROWS-2) = hEdges[r-1][c]
      // (edge between row r-1 and row r in player storage hEdges[r][c] = below row r).
      // Actually looking at solutions: h[0][c] is used for top edges and h[4]/h[5]
      // for bottom. The player hEdges[r][c] = edge between row r and r+1 (interior only).
      // Mapping: sol.h[r][c] where r < ROWS → if it's on top border row use topEdges,
      // if interior use hEdges, if bottom border use bottomEdges.
      // The solution arrays are ROWS=6 in size (0..5). Row 0 = top border region,
      // row 5 = bottom border region. Rows 1..4 = interior below row (r-1).
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const hv = sol.h[r][c];
          if (!hv) continue;
          if (r === 0) {
            topEdges[c] = 1;
          } else if (r === ROWS - 1) {
            bottomEdges[c] = 1;
          } else {
            hEdges[r - 1][c] = 1;
          }
        }
      }
      // Solution v[r][c]: vertical edges. v[r][0] = leftEdges, v[r][COLS-1] = rightEdges,
      // interior v[r][c] (1..COLS-2) = vEdges[r][c-1].
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const vv = sol.v[r][c];
          if (!vv) continue;
          if (c === 0) {
            leftEdges[r] = 1;
          } else if (c === COLS - 1) {
            rightEdges[r] = 1;
          } else {
            vEdges[r][c - 1] = 1;
          }
        }
      }
    }

    function initPuzzle() {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      hEdges = Array.from({length: ROWS}, () => Array(COLS).fill(0));
      vEdges = Array.from({length: ROWS}, () => Array(COLS).fill(0));
      solved = false; solveTime = 0; startTime = 0; gameStarted = false;
      showSolution = false;
    }

    initPuzzle();

    // ------------------------------------------------------------------
    // Layout
    // ------------------------------------------------------------------
    function getLayout() {
      const HUD_H = 48;
      const PAD = 20;
      const avW = W - PAD * 2;
      const avH = USABLE_H - HUD_H - PAD * 2;
      const CELL = Math.min(Math.floor(avW / COLS), Math.floor(avH / ROWS), 64);
      const gridW = CELL * COLS;
      const gridH = CELL * ROWS;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + Math.floor((USABLE_H - HUD_H - gridH) / 2);
      return { CELL, ox, oy, gridW, gridH };
    }

    // ------------------------------------------------------------------
    // Edge hit-testing — returns { type:'h'|'v', r, c } or null
    // h edge: segment on bottom edge of cell (r,c) = top edge of (r+1,c)
    //   drawn at y = oy + (r+1)*CELL,  x from ox+c*CELL to ox+(c+1)*CELL
    // v edge: segment on right edge of cell (r,c)
    //   drawn at x = ox + (c+1)*CELL,  y from oy+r*CELL to oy+(r+1)*CELL
    // ------------------------------------------------------------------
    function hitEdge(tx, ty, layout) {
      const { CELL, ox, oy } = layout;
      const THRESH = CELL * 0.28;
      // Check all horizontal edges (between row r and r+1), r from 0..ROWS-1
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const ex = ox + c * CELL + CELL / 2;
          const ey = oy + (r + 1) * CELL;
          if (Math.abs(tx - ex) < CELL / 2 - 2 && Math.abs(ty - ey) < THRESH) {
            return { type: 'h', r, c };
          }
        }
      }
      // Check all vertical edges (between col c and c+1)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const ex = ox + (c + 1) * CELL;
          const ey = oy + r * CELL + CELL / 2;
          if (Math.abs(tx - ex) < THRESH && Math.abs(ty - ey) < CELL / 2 - 2) {
            return { type: 'v', r, c };
          }
        }
      }
      // Also check top border (above row 0)
      for (let c = 0; c < COLS; c++) {
        const ex = ox + c * CELL + CELL / 2;
        const ey = oy;
        if (Math.abs(tx - ex) < CELL / 2 - 2 && Math.abs(ty - ey) < THRESH) {
          return { type: 'htop', r: -1, c };
        }
      }
      // Left border
      for (let r = 0; r < ROWS; r++) {
        const ex = ox;
        const ey = oy + r * CELL + CELL / 2;
        if (Math.abs(tx - ex) < THRESH && Math.abs(ty - ey) < CELL / 2 - 2) {
          return { type: 'vleft', r, c: -1 };
        }
      }
      return null;
    }

    // ------------------------------------------------------------------
    // Inside/outside by ray-casting from cell centre
    // We build a full edge map including borders
    // ------------------------------------------------------------------
    function isInsideLoop(cr, cc, layout) {
      // Shoot a ray left from cell centre (cr,cc), count h-crossings
      // Vertical edges to the left of column cc
      let crossings = 0;
      for (let c = -1; c < cc; c++) {
        if (getVEdge(cr, c) === 1) crossings++;
      }
      return crossings % 2 === 1;
    }

    function getHEdge(r, c) {
      // r=-1 means top border
      if (r === -1) return hEdges[0] ? 0 : 0; // not used here
      return hEdges[r] && hEdges[r][c] !== undefined ? hEdges[r][c] : 0;
    }

    function getVEdge(r, c) {
      if (c === -1) return vEdges[r] && vEdges[r][-1] !== undefined ? vEdges[r][-1] : 0;
      return vEdges[r] && vEdges[r][c] !== undefined ? vEdges[r][c] : 0;
    }

    // Extend edge storage to include border edges (col -1 and col COLS-1 virtual)
    // We use a flat map approach: hFull[r][c] for r in -1..ROWS-1, c in 0..COLS-1
    //                             vFull[r][c] for r in 0..ROWS-1, c in -1..COLS-1
    // For simplicity we store them as offsets
    let hFull, vFull;

    function buildFullEdges() {
      // hFull[r+1][c] = edge above row r (r: 0..ROWS, c: 0..COLS-1)
      hFull = Array.from({length: ROWS + 1}, () => Array(COLS).fill(0));
      // vFull[r][c+1] = edge left of col c (r: 0..ROWS-1, c: -1..COLS-1)
      vFull = Array.from({length: ROWS}, () => Array(COLS + 1).fill(0));

      // Copy player edges
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          hFull[r + 1][c] = hEdges[r][c];
          vFull[r][c + 1] = vEdges[r][c];
        }
      // Border edges from separate storage
      for (let c = 0; c < COLS; c++) hFull[0][c] = hEdges.topBorder ? hEdges.topBorder[c] : 0;
      for (let r = 0; r < ROWS; r++) vFull[r][0] = vEdges.leftBorder ? vEdges.leftBorder[r] : 0;
    }

    // Simpler: use dedicated arrays for all 4 borders
    let topEdges   = Array(COLS).fill(0);  // above row 0
    let bottomEdges= Array(COLS).fill(0);  // below row ROWS-1
    let leftEdges  = Array(ROWS).fill(0);  // left of col 0
    let rightEdges = Array(ROWS).fill(0);  // right of col COLS-1

    function getEdgeState(type, r, c) {
      if (type === 'h')      return hEdges[r][c];
      if (type === 'v')      return vEdges[r][c];
      if (type === 'htop')   return topEdges[c];
      if (type === 'hbot')   return bottomEdges[c];
      if (type === 'vleft')  return leftEdges[r];
      if (type === 'vright') return rightEdges[r];
      return 0;
    }

    function toggleEdge(type, r, c) {
      if (type === 'h')      hEdges[r][c]     = hEdges[r][c] ? 0 : 1;
      if (type === 'v')      vEdges[r][c]     = vEdges[r][c] ? 0 : 1;
      if (type === 'htop')   topEdges[c]      = topEdges[c] ? 0 : 1;
      if (type === 'hbot')   bottomEdges[c]   = bottomEdges[c] ? 0 : 1;
      if (type === 'vleft')  leftEdges[r]     = leftEdges[r] ? 0 : 1;
      if (type === 'vright') rightEdges[r]    = rightEdges[r] ? 0 : 1;
    }

    // Ray-cast for cell (cr,cc): count vertical edges strictly to left
    function cellIsInside(cr, cc) {
      let count = 0;
      // leftEdges
      if (leftEdges[cr]) count++;
      // vEdges[cr][0..cc-1]
      for (let c = 0; c < cc; c++) if (vEdges[cr][c]) count++;
      return count % 2 === 1;
    }

    // Also need top border hit detection
    function hitEdgeFull(tx, ty, layout) {
      const { CELL, ox, oy } = layout;
      const THRESH = CELL * 0.28;

      // top border edges
      for (let c = 0; c < COLS; c++) {
        const ex = ox + c * CELL + CELL / 2;
        const ey = oy;
        if (Math.abs(tx - ex) < CELL / 2 - 2 && Math.abs(ty - ey) < THRESH)
          return { type: 'htop', r: 0, c };
      }
      // bottom border edges
      for (let c = 0; c < COLS; c++) {
        const ex = ox + c * CELL + CELL / 2;
        const ey = oy + ROWS * CELL;
        if (Math.abs(tx - ex) < CELL / 2 - 2 && Math.abs(ty - ey) < THRESH)
          return { type: 'hbot', r: ROWS - 1, c };
      }
      // left border edges
      for (let r = 0; r < ROWS; r++) {
        const ex = ox;
        const ey = oy + r * CELL + CELL / 2;
        if (Math.abs(tx - ex) < THRESH && Math.abs(ty - ey) < CELL / 2 - 2)
          return { type: 'vleft', r, c: 0 };
      }
      // right border edges
      for (let r = 0; r < ROWS; r++) {
        const ex = ox + COLS * CELL;
        const ey = oy + r * CELL + CELL / 2;
        if (Math.abs(tx - ex) < THRESH && Math.abs(ty - ey) < CELL / 2 - 2)
          return { type: 'vright', r, c: COLS - 1 };
      }
      // interior horizontal edges (between rows)
      for (let r = 0; r < ROWS - 1; r++) {
        for (let c = 0; c < COLS; c++) {
          const ex = ox + c * CELL + CELL / 2;
          const ey = oy + (r + 1) * CELL;
          if (Math.abs(tx - ex) < CELL / 2 - 2 && Math.abs(ty - ey) < THRESH)
            return { type: 'h', r, c };
        }
      }
      // interior vertical edges (between cols)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 1; c++) {
          const ex = ox + (c + 1) * CELL;
          const ey = oy + r * CELL + CELL / 2;
          if (Math.abs(tx - ex) < THRESH && Math.abs(ty - ey) < CELL / 2 - 2)
            return { type: 'v', r, c };
        }
      }
      return null;
    }

    // ------------------------------------------------------------------
    // Count segments in a direction from a cell
    // ------------------------------------------------------------------
    function countSegments(r, c, dir) {
      let count = 0;
      if (dir === 'R') {
        for (let cc = c; cc < COLS - 1; cc++) if (vEdges[r][cc]) count++;
        if (vEdges[r][COLS - 1] !== undefined && vEdges[r][COLS - 1]) count++;
        if (rightEdges[r]) count++;
      }
      if (dir === 'L') {
        if (leftEdges[r]) count++;
        for (let cc = 0; cc < c; cc++) if (vEdges[r][cc]) count++;
      }
      if (dir === 'D') {
        for (let rr = r; rr < ROWS - 1; rr++) if (hEdges[rr][c]) count++;
        if (bottomEdges[c]) count++;
      }
      if (dir === 'U') {
        if (topEdges[c]) count++;
        for (let rr = 0; rr < r; rr++) if (hEdges[rr][c]) count++;
      }
      return count;
    }

    // ------------------------------------------------------------------
    // Check if loop is a single closed loop
    // ------------------------------------------------------------------
    function isClosedLoop() {
      // Build adjacency from vertex grid (ROWS+1) x (COLS+1)
      // Each vertex can connect to up to 4 edges
      const deg = Array.from({length: (ROWS+1)*(COLS+1)}, () => 0);
      function vid(r, c) { return r * (COLS + 1) + c; }
      let totalEdges = 0;

      // top/bottom border
      for (let c = 0; c < COLS; c++) {
        if (topEdges[c])    { deg[vid(0,c)]++; deg[vid(0,c+1)]++; totalEdges++; }
        if (bottomEdges[c]) { deg[vid(ROWS,c)]++; deg[vid(ROWS,c+1)]++; totalEdges++; }
      }
      // left/right border
      for (let r = 0; r < ROWS; r++) {
        if (leftEdges[r])  { deg[vid(r,0)]++; deg[vid(r+1,0)]++; totalEdges++; }
        if (rightEdges[r]) { deg[vid(r,COLS)]++; deg[vid(r+1,COLS)]++; totalEdges++; }
      }
      // interior h
      for (let r = 0; r < ROWS - 1; r++)
        for (let c = 0; c < COLS; c++)
          if (hEdges[r][c]) { deg[vid(r+1,c)]++; deg[vid(r+1,c+1)]++; totalEdges++; }
      // interior v
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS - 1; c++)
          if (vEdges[r][c]) { deg[vid(r,c+1)]++; deg[vid(r+1,c+1)]++; totalEdges++; }

      if (totalEdges === 0) return false;
      // Every vertex must have degree 0 or 2
      for (const d of deg) if (d !== 0 && d !== 2) return false;

      // BFS/DFS connectivity of edge vertices
      const startV = deg.findIndex(d => d > 0);
      const visited = new Set();
      const stack = [startV];
      // Build edge adjacency
      const adj = Array.from({length: (ROWS+1)*(COLS+1)}, () => []);
      function addE(a, b) { adj[a].push(b); adj[b].push(a); }
      for (let c = 0; c < COLS; c++) {
        if (topEdges[c])    addE(vid(0,c), vid(0,c+1));
        if (bottomEdges[c]) addE(vid(ROWS,c), vid(ROWS,c+1));
      }
      for (let r = 0; r < ROWS; r++) {
        if (leftEdges[r])  addE(vid(r,0), vid(r+1,0));
        if (rightEdges[r]) addE(vid(r,COLS), vid(r+1,COLS));
      }
      for (let r = 0; r < ROWS - 1; r++)
        for (let c = 0; c < COLS; c++)
          if (hEdges[r][c]) addE(vid(r+1,c), vid(r+1,c+1));
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS - 1; c++)
          if (vEdges[r][c]) addE(vid(r,c+1), vid(r+1,c+1));

      while (stack.length) {
        const v = stack.pop();
        if (visited.has(v)) continue;
        visited.add(v);
        for (const nb of adj[v]) if (!visited.has(nb)) stack.push(nb);
      }
      const edgeVerts = deg.filter(d => d > 0).length;
      return visited.size === edgeVerts;
    }

    // ------------------------------------------------------------------
    // Check puzzle constraints
    // ------------------------------------------------------------------
    function checkConstraints() {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = p.cells[r][c];
          if (!cell) continue;
          const inside = cellIsInside(r, c);
          if (cell.inside  && !inside)  return false;
          if (cell.outside && inside)   return false;
          if (cell.black   && inside)   return false;
          if (cell.arrow) {
            const got = countSegments(r, c, cell.arrow);
            if (got !== cell.count) return false;
          }
        }
      }
      return true;
    }

    function checkSolved() {
      return isClosedLoop() && checkConstraints();
    }

    // ------------------------------------------------------------------
    // Cell glow: is this constraint currently satisfied?
    // ------------------------------------------------------------------
    function cellConstraintMet(r, c) {
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      const cell = p.cells[r][c];
      if (!cell || Object.keys(cell).length === 0) return null;
      const inside = cellIsInside(r, c);
      if (cell.inside  !== undefined && cell.inside  && !inside)  return false;
      if (cell.outside !== undefined && cell.outside && inside)   return false;
      if (cell.black   !== undefined && cell.black   && inside)   return false;
      if (cell.arrow) {
        const got = countSegments(r, c, cell.arrow);
        return got === cell.count;
      }
      if (cell.inside)  return inside;
      if (cell.outside) return !inside;
      if (cell.black)   return !inside;
      return null;
    }

    // ------------------------------------------------------------------
    // Audio
    // ------------------------------------------------------------------
    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playClick() {
      if (!audioCtx || voices >= 8) return;
      voices++;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = 660;
      gn.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
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

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function drawArrow(g2, x, y, dir, size) {
      g2.save();
      g2.translate(x, y);
      const r2 = ({ U: -Math.PI/2, D: Math.PI/2, L: Math.PI, R: 0 })[dir];
      g2.rotate(r2);
      g2.beginPath();
      g2.moveTo(size * 0.5, 0);
      g2.lineTo(-size * 0.3, -size * 0.35);
      g2.lineTo(-size * 0.3,  size * 0.35);
      g2.closePath();
      g2.fill();
      g2.restore();
    }

    // ------------------------------------------------------------------
    // Solve flash state
    // ------------------------------------------------------------------
    let solveFlash = 0;

    // ------------------------------------------------------------------
    // RAF draw loop
    // ------------------------------------------------------------------
    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const layout = getLayout();
      const { CELL, ox, oy } = layout;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(0, 0, W, 48);
      const p = PUZZLES[puzzleIdx % PUZZLES.length];
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`CASTLE WALL  ${(puzzleIdx % PUZZLES.length) + 1}/${PUZZLES.length}  ${p.name}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Grid background + cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const cell = p.cells[r][c];

          // cell fill
          if (cell && cell.black) {
            g.fillStyle = '#2a2a38';
          } else {
            const inside = cellIsInside(r, c);
            const met = cellConstraintMet(r, c);
            if (inside) {
              g.fillStyle = met === false ? 'rgba(239,83,80,0.18)' :
                            met === true  ? 'rgba(120,144,156,0.22)' :
                                            'rgba(120,144,156,0.12)';
            } else {
              g.fillStyle = met === false ? 'rgba(239,83,80,0.10)' : '#1a1a26';
            }
          }
          g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);

          // cell content
          if (cell) {
            const cx2 = cx + CELL / 2, cy2 = cy + CELL / 2;
            if (cell.black) {
              // hatching
              g.strokeStyle = '#ffffff12';
              g.lineWidth = 1;
              for (let i = -CELL; i < CELL * 2; i += 8) {
                g.beginPath();
                g.moveTo(cx + i, cy);
                g.lineTo(cx + i + CELL, cy + CELL);
                g.stroke();
              }
            }
            if (cell.inside) {
              // filled circle
              g.fillStyle = ACCENT;
              g.beginPath(); g.arc(cx2, cy2, CELL * 0.2, 0, Math.PI * 2); g.fill();
            }
            if (cell.outside) {
              // hollow circle
              g.strokeStyle = ACCENT;
              g.lineWidth = 2;
              g.beginPath(); g.arc(cx2, cy2, CELL * 0.2, 0, Math.PI * 2); g.stroke();
            }
            if (cell.arrow) {
              const met2 = cellConstraintMet(r, c);
              g.fillStyle = met2 === true ? '#aed6af' : met2 === false ? '#ef5350aa' : 'rgba(255,255,255,0.7)';
              g.font = `bold ${Math.floor(CELL * 0.3)}px -apple-system, sans-serif`;
              g.textAlign = 'center'; g.textBaseline = 'middle';
              // offset number and arrow
              const offsets = { U:[0,6], D:[0,-6], L:[6,0], R:[-6,0] };
              const [ox2, oy2] = offsets[cell.arrow];
              g.fillText(String(cell.count), cx2 + ox2, cy2 + oy2 + 2);
              g.fillStyle = met2 === true ? '#aed6af' : met2 === false ? '#ef5350aa' : 'rgba(255,255,255,0.55)';
              drawArrow(g, cx2 - ox2 * 0.5, cy2 - oy2 * 0.5, cell.arrow, CELL * 0.22);
            }
          }
        }
      }

      // Grid lines
      g.strokeStyle = 'rgba(255,255,255,0.1)';
      g.lineWidth = 0.5;
      for (let r = 0; r <= ROWS; r++) {
        g.beginPath(); g.moveTo(ox, oy + r * CELL); g.lineTo(ox + COLS * CELL, oy + r * CELL); g.stroke();
      }
      for (let c = 0; c <= COLS; c++) {
        g.beginPath(); g.moveTo(ox + c * CELL, oy); g.lineTo(ox + c * CELL, oy + ROWS * CELL); g.stroke();
      }

      // Draw player edges
      const flash = solved ? (0.7 + 0.3 * Math.sin(now * 0.005)) : 1;
      g.strokeStyle = solved ? `rgba(120,144,156,${flash})` : ACCENT;
      g.lineWidth = 3.5;
      g.lineCap = 'round';

      // Top border
      for (let c = 0; c < COLS; c++) {
        if (topEdges[c]) {
          g.beginPath();
          g.moveTo(ox + c * CELL + 2, oy);
          g.lineTo(ox + (c + 1) * CELL - 2, oy);
          g.stroke();
        }
      }
      // Bottom border
      for (let c = 0; c < COLS; c++) {
        if (bottomEdges[c]) {
          g.beginPath();
          g.moveTo(ox + c * CELL + 2, oy + ROWS * CELL);
          g.lineTo(ox + (c + 1) * CELL - 2, oy + ROWS * CELL);
          g.stroke();
        }
      }
      // Left border
      for (let r = 0; r < ROWS; r++) {
        if (leftEdges[r]) {
          g.beginPath();
          g.moveTo(ox, oy + r * CELL + 2);
          g.lineTo(ox, oy + (r + 1) * CELL - 2);
          g.stroke();
        }
      }
      // Right border
      for (let r = 0; r < ROWS; r++) {
        if (rightEdges[r]) {
          g.beginPath();
          g.moveTo(ox + COLS * CELL, oy + r * CELL + 2);
          g.lineTo(ox + COLS * CELL, oy + (r + 1) * CELL - 2);
          g.stroke();
        }
      }
      // Interior h
      for (let r = 0; r < ROWS - 1; r++) {
        for (let c = 0; c < COLS; c++) {
          if (hEdges[r][c]) {
            g.beginPath();
            g.moveTo(ox + c * CELL + 2, oy + (r + 1) * CELL);
            g.lineTo(ox + (c + 1) * CELL - 2, oy + (r + 1) * CELL);
            g.stroke();
          }
        }
      }
      // Interior v
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 1; c++) {
          if (vEdges[r][c]) {
            g.beginPath();
            g.moveTo(ox + (c + 1) * CELL, oy + r * CELL + 2);
            g.lineTo(ox + (c + 1) * CELL, oy + (r + 1) * CELL - 2);
            g.stroke();
          }
        }
      }

      // Solved overlay
      if (solved) {
        g.fillStyle = 'rgba(15,15,20,0.82)';
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
        const best = ctx.storage.get('bt_castlewall') || 0;
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
        const cw = Math.floor(W * 0.84); const ch = Math.min(Math.floor(USABLE_H * 0.76), 500);
        const cxp = Math.floor((W - cw) / 2); const cyp = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath(); if (g.roundRect) g.roundRect(cxp, cyp, cw, ch, 16); else g.rect(cxp, cyp, cw, ch); g.fill();
        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('CASTLE WALL', W / 2, cyp + 50);
        const lx = cxp + 20; let ty = cyp + 72; const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• Draw a single closed loop on the grid edges',
          '• Black cells must be OUTSIDE the loop',
          '• Filled circle (●) = cell must be inside the loop',
          '• Hollow circle (○) = cell must be outside the loop',
          '• Arrow + number: that many loop segments in',
          '  that direction from the cell',
          '• Tap edges between cells to draw/erase segments',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }
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
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX;
      const ty2 = e.changedTouches[0].clientY;

      // IBTN first
      if (Math.hypot(tx - IBTN.x, ty2 - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo; return;
      }
      if (showInfo) { showInfo = false; return; }

      // Eye / solution button
      if (Math.hypot(tx - EYE_X, ty2 - EYE_Y) < EYE_R + 8) {
        showSolution = true;
        applySolution();
        return;
      }

      if (showSolution) {
        topEdges   = Array(COLS).fill(0);
        bottomEdges= Array(COLS).fill(0);
        leftEdges  = Array(ROWS).fill(0);
        rightEdges = Array(ROWS).fill(0);
        initPuzzle();
        return;
      }

      // Solved → next puzzle
      if (solved) {
        puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
        ctx.storage.set('cw_idx', puzzleIdx);
        topEdges   = Array(COLS).fill(0);
        bottomEdges= Array(COLS).fill(0);
        leftEdges  = Array(ROWS).fill(0);
        rightEdges = Array(ROWS).fill(0);
        initPuzzle();
        return;
      }

      const layout = getLayout();
      const edge = hitEdgeFull(tx, ty2, layout);
      if (!edge) return;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      toggleEdge(edge.type, edge.r, edge.c);
      playClick();
      ctx.platform.interact({ type: 'tap' });
      ctx.platform.haptic('light');

      if (checkSolved()) {
        solved = true;
        solveTime = performance.now() - startTime;
        const best = ctx.storage.get('bt_castlewall') || 0;
        if (!best || solveTime < best) ctx.storage.set('bt_castlewall', solveTime);
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
