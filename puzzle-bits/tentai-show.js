window.plethoraBit = {
  meta: {
    title: 'Tentai Show',
    author: 'plethora',
    description: 'Draw lines to make rotationally-symmetric star regions.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#80DEEA';
    const BG = '#0f0f14';

    // 6x6 grids. Stars: [{r,c}]. Solutions: set of edges that divide regions.
    // Edge format: 'H:r,c-r,c+1' (horizontal edge between rows) or 'V:r,c-r+1,c'
    // We store region membership in solution as array of region IDs per cell.
    // For hand-crafted puzzles we store the star positions and the solution cell-region map.
    // region map: 6x6 array of region IDs (0-based). Regions must be rotationally symmetric.

    function generatePuzzle(Ng = 6) {
      const regionId = Array.from({length: Ng}, () => Array(Ng).fill(-1));
      const centers = [];
      const numCenters = 7 + Math.floor(Math.random() * 4);

      for (let attempt = 0; attempt < 400 && centers.length < numCenters; attempt++) {
        const r = Math.floor(Math.random() * Ng);
        const c = Math.floor(Math.random() * Ng);
        if (regionId[r][c] >= 0) continue;
        centers.push([r, c]);
        const id = centers.length - 1;
        regionId[r][c] = id;
      }

      // Grow symmetric regions
      const dirs = [[0,1],[1,0],[1,1],[1,-1],[0,2],[2,0]];
      for (let i = 0; i < centers.length; i++) {
        const [cr, cc] = centers[i];
        const shuffled = dirs.slice().sort(() => Math.random() - 0.5);
        for (const [dr, dc] of shuffled) {
          const r1 = cr + dr, c1 = cc + dc, r2 = cr - dr, c2 = cc - dc;
          if (r1 < 0 || r1 >= Ng || c1 < 0 || c1 >= Ng) continue;
          if (r2 < 0 || r2 >= Ng || c2 < 0 || c2 >= Ng) continue;
          if (regionId[r1][c1] >= 0 || regionId[r2][c2] >= 0) continue;
          regionId[r1][c1] = i;
          regionId[r2][c2] = i;
        }
      }

      // Flood-fill remaining unassigned cells to nearest assigned neighbour
      let changed = true;
      while (changed) {
        changed = false;
        for (let r = 0; r < Ng; r++) {
          for (let c = 0; c < Ng; c++) {
            if (regionId[r][c] >= 0) continue;
            for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < Ng && nc >= 0 && nc < Ng && regionId[nr][nc] >= 0) {
                regionId[r][c] = regionId[nr][nc];
                changed = true;
                break;
              }
            }
          }
        }
      }

      return { regionId, centers };
    }

    const PUZZLES = [
      { // Puzzle 1 - simple 5 stars
        stars: [{r:1,c:1},{r:1,c:4},{r:3,c:2},{r:4,c:4},{r:2,c:3}],
        solution: [
          [0,0,1,1,2,2],
          [0,0,1,1,2,2],
          [0,0,3,3,3,2],
          [4,4,3,3,3,2],
          [4,4,4,3,2,2],
          [4,4,4,4,2,2],
        ],
      },
      { // Puzzle 2
        stars: [{r:0,c:0},{r:0,c:4},{r:2,c:2},{r:4,c:1},{r:5,c:5}],
        solution: [
          [0,0,1,1,1,1],
          [0,0,2,2,1,1],
          [0,0,2,2,1,1],
          [3,3,2,2,4,4],
          [3,3,3,2,4,4],
          [3,3,3,4,4,4],
        ],
      },
      { // Puzzle 3
        stars: [{r:0,c:2},{r:2,c:0},{r:2,c:5},{r:4,c:3},{r:3,c:1}],
        solution: [
          [0,0,0,1,1,1],
          [0,0,0,1,1,1],
          [2,2,0,1,1,3],
          [2,4,4,1,3,3],
          [2,4,4,3,3,3],
          [2,2,4,4,3,3],
        ],
      },
      { // Puzzle 4
        stars: [{r:0,c:1},{r:1,c:4},{r:3,c:0},{r:3,c:5},{r:5,c:2}],
        solution: [
          [0,0,0,1,1,1],
          [0,0,0,1,1,1],
          [2,2,0,1,1,3],
          [2,2,0,3,3,3],
          [2,2,4,4,3,3],
          [4,4,4,4,3,3],
        ],
      },
      { // Puzzle 5 - 7 stars
        stars: [{r:0,c:0},{r:0,c:3},{r:1,c:5},{r:2,c:1},{r:3,c:4},{r:4,c:2},{r:5,c:5}],
        solution: [
          [0,0,0,1,1,2],
          [0,3,0,1,2,2],
          [3,3,3,1,2,2],
          [3,3,4,4,4,2],
          [5,5,4,4,4,6],
          [5,5,5,6,6,6],
        ],
      },
    ];

    const N = 6;
    let puzzleIdx = ctx.storage.get('tentai_idx') || 0;
    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showSolution = false;
    const EYE_X = W - 22, EYE_Y = 62, EYE_R = 14;

    let gameStarted = false;
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    // Horizontal edges: hEdges[r][c] = true means line between row r and r+1, at column band c..c+1
    // hEdges[row 0..N-1][col 0..N-1] — edge below cell (r,c) / above cell (r+1,c)
    let hEdges = []; // hEdges[r][c]: line between (r,c) and (r+1,c), r=0..N-2
    let vEdges = []; // vEdges[r][c]: line between (r,c) and (r,c+1), c=0..N-2
    let regionFill = []; // regionFill[r][c] = region color string or null
    let solveAnim = null;
    let audioCtx = null;
    let voices = 0;

    // Derive edge state from a solution region map
    function edgesFromSolution(sol) {
      const newH = Array.from({length: N-1}, () => Array(N).fill(false));
      const newV = Array.from({length: N}, () => Array(N-1).fill(false));
      for (let r = 0; r < N-1; r++) {
        for (let c = 0; c < N; c++) {
          if (sol[r][c] !== sol[r+1][c]) newH[r][c] = true;
        }
      }
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N-1; c++) {
          if (sol[r][c] !== sol[r][c+1]) newV[r][c] = true;
        }
      }
      return { newH, newV };
    }

    function applySolution() {
      const puzzle = PUZZLES[puzzleIdx % PUZZLES.length];
      const { newH, newV } = edgesFromSolution(puzzle.solution);
      hEdges = newH;
      vEdges = newV;
      validateAndFill();
      showSolution = true;
    }

    function initPuzzle() {
      hEdges = Array.from({length: N-1}, () => Array(N).fill(false));
      vEdges = Array.from({length: N}, () => Array(N-1).fill(false));
      regionFill = Array.from({length: N}, () => Array(N).fill(null));
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnim = null;
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 48;
      const PAD = 20;
      const availW = W - PAD * 2;
      const availH = USABLE_H - HUD_H - PAD * 2;
      const CELL = Math.min(Math.floor(availW / N), Math.floor(availH / N), 60);
      const gridW = CELL * N;
      const gridH = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + Math.floor((USABLE_H - HUD_H - gridH) / 2);
      return { CELL, ox, oy, gridW, gridH };
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playClick(freq) {
      if (!audioCtx || voices >= 8) return;
      voices++;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = freq;
      o.type = 'sine';
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
      ctx.timeout(() => { voices = Math.max(0, voices - 1); }, 120);
    }

    function playWin() {
      if (!audioCtx) return;
      const freqs = [523, 659, 784, 1047, 1319];
      freqs.forEach((f, i) => {
        ctx.timeout(() => {
          if (voices >= 8) return;
          voices++;
          const o = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          o.connect(gain); gain.connect(audioCtx.destination);
          o.frequency.value = f;
          o.type = 'sine';
          gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
          o.start(); o.stop(audioCtx.currentTime + 0.5);
          ctx.timeout(() => { voices = Math.max(0, voices - 1); }, 550);
        }, i * 80);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    // Flood-fill to find connected region of cells
    function floodFill(startR, startC, edgesH, edgesV) {
      const visited = Array.from({length: N}, () => Array(N).fill(false));
      const queue = [{r: startR, c: startC}];
      visited[startR][startC] = true;
      const cells = [{r: startR, c: startC}];
      while (queue.length) {
        const {r, c} = queue.shift();
        // up: blocked by hEdges[r-1][c]
        if (r > 0 && !edgesH[r-1][c] && !visited[r-1][c]) {
          visited[r-1][c] = true; queue.push({r:r-1,c}); cells.push({r:r-1,c});
        }
        // down: blocked by hEdges[r][c]
        if (r < N-1 && !edgesH[r][c] && !visited[r+1][c]) {
          visited[r+1][c] = true; queue.push({r:r+1,c}); cells.push({r:r+1,c});
        }
        // left: blocked by vEdges[r][c-1]
        if (c > 0 && !edgesV[r][c-1] && !visited[r][c-1]) {
          visited[r][c-1] = true; queue.push({r,c:c-1}); cells.push({r,c:c-1});
        }
        // right: blocked by vEdges[r][c]
        if (c < N-1 && !edgesV[r][c] && !visited[r][c+1]) {
          visited[r][c+1] = true; queue.push({r,c:c+1}); cells.push({r,c:c+1});
        }
      }
      return cells;
    }

    function checkSymmetry(cells, starR, starC) {
      // 180° rotation around star center
      const cellSet = new Set(cells.map(({r,c}) => `${r},${c}`));
      for (const {r, c} of cells) {
        const rr = 2 * starR - r;
        const rc = 2 * starC - c;
        if (rr < 0 || rr >= N || rc < 0 || rc >= N) return false;
        if (!cellSet.has(`${rr},${rc}`)) return false;
      }
      return true;
    }

    function validateAndFill() {
      const puzzle = PUZZLES[puzzleIdx % PUZZLES.length];
      const newFill = Array.from({length: N}, () => Array(N).fill(null));
      const visited = Array.from({length: N}, () => Array(N).fill(false));
      let allValid = true;
      const regions = [];

      // Find all regions by flood fill
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (!visited[r][c]) {
            const cells = floodFill(r, c, hEdges, vEdges);
            cells.forEach(({r:rr,c:cc}) => visited[rr][cc] = true);
            // Count stars in this region
            const starsInRegion = puzzle.stars.filter(s => cells.some(cl => cl.r === s.r && cl.c === s.c));
            if (starsInRegion.length === 1) {
              const star = starsInRegion[0];
              const valid = checkSymmetry(cells, star.r, star.c);
              regions.push({cells, valid, star});
            } else {
              regions.push({cells, valid: false, star: null});
              allValid = false;
            }
          }
        }
      }

      // Fill valid regions
      regions.forEach(({cells, valid}, i) => {
        if (valid) {
          cells.forEach(({r,c}) => newFill[r][c] = i % 6);
        }
      });
      regionFill = newFill;

      // Check if all regions valid
      const allRegionsValid = regions.every(rg => rg.valid);
      // All stars must be in exactly one region each
      const starCovered = puzzle.stars.every(s =>
        regions.some(rg => rg.valid && rg.cells.some(cl => cl.r === s.r && cl.c === s.c))
      );
      return allRegionsValid && starCovered;
    }

    initPuzzle();

    // Region fill colors (subtle tints)
    const REGION_COLORS = [
      'rgba(128,222,234,0.18)',
      'rgba(100,255,218,0.14)',
      'rgba(179,229,252,0.16)',
      'rgba(200,230,201,0.13)',
      'rgba(255,236,179,0.14)',
      'rgba(225,190,231,0.15)',
    ];

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const {CELL, ox, oy, gridW, gridH} = getLayout();
      const puzzle = PUZZLES[puzzleIdx % PUZZLES.length];

      // HUD bar
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`TENTAI  ${(puzzleIdx % PUZZLES.length) + 1}/${PUZZLES.length}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Region fills
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const fill = regionFill[r][c];
          if (fill !== null) {
            g.fillStyle = REGION_COLORS[fill % REGION_COLORS.length];
            g.fillRect(ox + c * CELL + 1, oy + r * CELL + 1, CELL - 1, CELL - 1);
          }
        }
      }

      // Grid base lines (faint)
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      for (let r = 0; r <= N; r++) {
        g.beginPath();
        g.moveTo(ox, oy + r * CELL);
        g.lineTo(ox + gridW, oy + r * CELL);
        g.stroke();
      }
      for (let c = 0; c <= N; c++) {
        g.beginPath();
        g.moveTo(ox + c * CELL, oy);
        g.lineTo(ox + c * CELL, oy + gridH);
        g.stroke();
      }

      // Draw placed edges (bright)
      g.strokeStyle = ACCENT;
      g.lineWidth = 3;
      g.lineCap = 'round';
      for (let r = 0; r < N-1; r++) {
        for (let c = 0; c < N; c++) {
          if (hEdges[r][c]) {
            g.beginPath();
            g.moveTo(ox + c * CELL, oy + (r+1) * CELL);
            g.lineTo(ox + (c+1) * CELL, oy + (r+1) * CELL);
            g.stroke();
          }
        }
      }
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N-1; c++) {
          if (vEdges[r][c]) {
            g.beginPath();
            g.moveTo(ox + (c+1) * CELL, oy + r * CELL);
            g.lineTo(ox + (c+1) * CELL, oy + (r+1) * CELL);
            g.stroke();
          }
        }
      }

      // Outer border
      g.strokeStyle = 'rgba(255,255,255,0.3)';
      g.lineWidth = 2;
      g.strokeRect(ox, oy, gridW, gridH);

      // Stars
      for (const {r, c} of puzzle.stars) {
        const cx = ox + c * CELL + CELL / 2;
        const cy = oy + r * CELL + CELL / 2;
        // glow
        g.save();
        g.shadowColor = ACCENT;
        g.shadowBlur = 10;
        g.fillStyle = ACCENT;
        g.font = `bold ${Math.floor(CELL * 0.55)}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('★', cx, cy);
        g.restore();
      }

      // Solve animation
      if (solved && solveAnim) {
        const t = (now - solveAnim) / 600;
        if (t < 1) {
          g.fillStyle = `rgba(128,222,234,${0.15 * Math.sin(t * Math.PI)})`;
          g.fillRect(0, 0, W, H);
        } else {
          // Show solved overlay
          g.fillStyle = 'rgba(15,15,20,0.88)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT;
          g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 64);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.6)';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 18);
          const best = ctx.storage.get('bt_tentai') || 0;
          if (best) g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 18);
          // Next button
          const bx = W / 2 - 110, by = USABLE_H / 2 + 52, bw = 220, bh = 50;
          g.fillStyle = ACCENT + '22';
          g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, 12) : g.rect(bx, by, bw, bh); g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, 12) : g.rect(bx, by, bw, bh); g.stroke();
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
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.78), 500);
        const cy2 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch); g.fill();
        g.save(); g.globalAlpha = 0.12; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 52, 70, 0, Math.PI * 2); g.fill();
        g.restore();
        g.fillStyle = ACCENT;
        g.font = 'bold 22px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('TENTAI SHOW', W / 2, cy2 + 54);
        const lx = cx2 + 22;
        let ty = cy2 + 76;
        const lh = 24;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• Draw lines to divide the grid into regions',
          '• Each region must contain exactly one ★ star',
          '• Each region must be 180° rotationally symmetric',
          '  around its star (rotation center)',
          '• Valid regions glow with a tint when formed',
          '• All cells must belong to a valid region',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh - 2; }
        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillText('Tap a grid edge (between cells) to draw/erase it', lx, ty); ty += lh - 2;
        g.fillText('Lines snap to the nearest internal edge', lx, ty);
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
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

    // Hit test: which internal edge is near the tap?
    function hitEdge(tx, ty, layout) {
      const {CELL, ox, oy} = layout;
      const gx = tx - ox;
      const gy = ty - oy;
      const SNAP = CELL * 0.38;

      // Check horizontal internal edges (between rows r and r+1)
      for (let r = 0; r < N-1; r++) {
        for (let c = 0; c < N; c++) {
          const ex = ox + c * CELL + CELL / 2;
          const ey = oy + (r+1) * CELL;
          if (Math.abs(tx - ex) < SNAP && Math.abs(ty - ey) < SNAP) {
            return {type: 'h', r, c};
          }
        }
      }
      // Check vertical internal edges (between cols c and c+1)
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N-1; c++) {
          const ex = ox + (c+1) * CELL;
          const ey = oy + r * CELL + CELL / 2;
          if (Math.abs(tx - ex) < SNAP && Math.abs(ty - ey) < SNAP) {
            return {type: 'v', r, c};
          }
        }
      }
      return null;
    }

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

      // Solved overlay tap
      if (solved && solveAnim && performance.now() - solveAnim > 600) {
        puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
        ctx.storage.set('tentai_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      if (ty >= USABLE_H - SAFE) return;

      const layout = getLayout();
      const edge = hitEdge(tx, ty, layout);
      if (!edge) return;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      ctx.platform.interact({ type: 'tap' });

      if (edge.type === 'h') {
        hEdges[edge.r][edge.c] = !hEdges[edge.r][edge.c];
      } else {
        vEdges[edge.r][edge.c] = !vEdges[edge.r][edge.c];
      }

      playClick(hEdges[edge.r] ? 660 : 440);

      const win = validateAndFill();
      if (win && !solved) {
        solved = true;
        solveTime = performance.now() - startTime;
        solveAnim = performance.now();
        const best = ctx.storage.get('bt_tentai') || 0;
        if (!best || solveTime < best) ctx.storage.set('bt_tentai', solveTime);
        ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
        ctx.platform.haptic('heavy');
        playWin();
      } else {
        ctx.platform.haptic('light');
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
