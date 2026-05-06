window.plethoraBit = {
  meta: {
    title: 'Balance Loop',
    author: 'plethora',
    description: 'Draw a closed loop — balanced numbers keep both sides equal.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#B39DDB';
    const BG = '#0f0f14';
    const CELL_BG = '#1a1a26';
    const LOOP_COLOR = '#B39DDB';
    const N = 6; // 6x6 grid of cells, edges between them

    // Segments are stored as a set. An edge between cell (r,c) and (r,c+1) is 'h_r_c' (horizontal).
    // An edge between cell (r,c) and (r+1,c) is 'v_r_c' (vertical).
    // There are (N) * (N-1) horizontal edges and (N-1) * (N) vertical edges.
    // Actually we model it as: each CELL has a right edge (h) and a bottom edge (v).
    // h[r][c] = edge between (r,c) and (r,c+1), for c in 0..N-2
    // v[r][c] = edge between (r,c) and (r+1,c), for r in 0..N-2

    // 5 hand-crafted 6×6 Balance Loop puzzles
    // numbers[r][c]: -1 = no number, >=0 = balanced number
    // solution_h[r][c], solution_v[r][c]: 1 if that edge is in the solution loop
    const PUZZLES = [
      {
        name: 'PUZZLE 1',
        numbers: [
          [-1,-1,-1,-1,-1,-1],
          [-1, 2,-1,-1, 2,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1, 2,-1,-1, 2,-1],
          [-1,-1,-1,-1,-1,-1],
        ],
        // A rectangle loop going around the inner 4x4
        solution_h: [
          [0,0,0,0,0],
          [0,1,1,1,0],
          [0,0,0,0,0],
          [0,0,0,0,0],
          [0,1,1,1,0],
          [0,0,0,0,0],
        ],
        solution_v: [
          [0,1,0,0,1,0],
          [0,1,0,0,1,0],
          [0,1,0,0,1,0],
          [0,1,0,0,1,0],
          [0,1,0,0,1,0],
        ],
      },
      {
        name: 'PUZZLE 2',
        numbers: [
          [-1,-1,-1,-1,-1,-1],
          [-1,-1, 3,-1,-1,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1,-1,-1,-1, 3,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1,-1,-1,-1,-1,-1],
        ],
        solution_h: [
          [1,1,1,1,1],
          [0,0,0,0,0],
          [0,0,1,1,1],
          [0,0,1,0,0],
          [0,0,0,0,0],
          [1,1,1,1,1],
        ],
        solution_v: [
          [1,0,0,0,0,1],
          [1,0,0,0,0,1],
          [1,0,1,0,0,1],
          [1,0,1,0,0,1],
          [1,0,0,0,0,1],
        ],
      },
      {
        name: 'PUZZLE 3',
        numbers: [
          [-1,-1, 2,-1,-1,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1,-1,-1,-1, 2,-1],
          [-1, 2,-1,-1,-1,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1,-1,-1, 2,-1,-1],
        ],
        solution_h: [
          [0,1,1,1,0],
          [0,1,0,0,0],
          [0,0,0,1,1],
          [0,0,0,0,1],
          [0,0,0,0,0],
          [1,1,1,1,0],
        ],
        solution_v: [
          [0,1,0,0,0,0],
          [0,1,0,0,0,1],
          [0,0,0,0,0,1],
          [0,0,0,0,0,1],
          [1,0,0,0,0,1],
        ],
      },
      {
        name: 'PUZZLE 4',
        numbers: [
          [-1,-1,-1,-1,-1,-1],
          [-1, 3,-1,-1, 3,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1, 3,-1,-1, 3,-1],
          [-1,-1,-1,-1,-1,-1],
        ],
        solution_h: [
          [1,1,1,1,1],
          [1,0,0,0,1],
          [1,0,0,0,1],
          [1,0,0,0,1],
          [1,0,0,0,1],
          [1,1,1,1,1],
        ],
        solution_v: [
          [1,0,0,0,0,1],
          [0,0,0,0,0,0],
          [0,0,0,0,0,0],
          [0,0,0,0,0,0],
          [1,0,0,0,0,1],
        ],
      },
      {
        name: 'PUZZLE 5',
        numbers: [
          [-1,-1,-1,-1,-1,-1],
          [-1,-1, 2,-1,-1,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1,-1,-1,-1,-1,-1],
          [-1,-1,-1, 2,-1,-1],
          [-1,-1,-1,-1,-1,-1],
        ],
        solution_h: [
          [1,1,1,1,0],
          [1,0,0,0,0],
          [1,0,1,1,1],
          [0,0,1,0,0],
          [0,0,0,0,0],
          [1,1,1,1,1],
        ],
        solution_v: [
          [1,0,0,0,0,0],
          [1,0,0,0,0,1],
          [0,0,1,0,0,1],
          [0,0,1,0,0,1],
          [1,0,0,0,0,1],
        ],
      },
    ];

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    let showSolution = false;
    const EYE_X = W - 44, EYE_CY = 62, EYE_R = 20;

    let puzzleIdx = ctx.storage.get('balanceloop_idx') || 0;
    // Current edges drawn by user
    let h_edges = []; // h_edges[r][c] = 0|1, r in 0..N-1, c in 0..N-2
    let v_edges = []; // v_edges[r][c] = 0|1, r in 0..N-2, c in 0..N-1
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let audioCtx = null;
    let activeVoices = 0;
    let solveAnim = null;
    let flashAnims = {}; // key -> { start, color }

    function applySolution() {
      const puz = PUZZLES[puzzleIdx % PUZZLES.length];
      h_edges = puz.solution_h.map(row => [...row]);
      v_edges = puz.solution_v.map(row => [...row]);
    }

    function initPuzzle() {
      h_edges = Array.from({ length: N }, () => Array(N - 1).fill(0));
      v_edges = Array.from({ length: N - 1 }, () => Array(N).fill(0));
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnim = null;
      flashAnims = {};
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

    // Determine which edge was tapped.
    // Returns { type: 'h'|'v', r, c } or null.
    function edgeAt(tx, ty, layout) {
      const { CELL, ox, oy } = layout;
      const THRESH = CELL * 0.3;

      // Check horizontal edges (between (r,c) and (r,c+1))
      // Center of h-edge at (ox + c*CELL + CELL, oy + r*CELL + CELL/2)
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N - 1; c++) {
          const ex = ox + (c + 1) * CELL;
          const ey = oy + r * CELL + CELL / 2;
          if (Math.abs(tx - ex) < THRESH && Math.abs(ty - ey) < THRESH) {
            return { type: 'h', r, c };
          }
        }
      }
      // Check vertical edges (between (r,c) and (r+1,c))
      for (let r = 0; r < N - 1; r++) {
        for (let c = 0; c < N; c++) {
          const ex = ox + c * CELL + CELL / 2;
          const ey = oy + (r + 1) * CELL;
          if (Math.abs(tx - ex) < THRESH && Math.abs(ty - ey) < THRESH) {
            return { type: 'v', r, c };
          }
        }
      }
      return null;
    }

    // Get the degree of a cell node (number of active edges)
    function nodeDegree(r, c) {
      let d = 0;
      // left horizontal edge: h[r][c-1]
      if (c > 0 && h_edges[r][c - 1]) d++;
      // right horizontal edge: h[r][c]
      if (c < N - 1 && h_edges[r][c]) d++;
      // top vertical edge: v[r-1][c]
      if (r > 0 && v_edges[r - 1][c]) d++;
      // bottom vertical edge: v[r][c]
      if (r < N - 1 && v_edges[r][c]) d++;
      return d;
    }

    // Walk the loop from a starting node, return visited nodes and length
    function traceLoop() {
      // Find any edge that is active
      let startR = -1, startC = -1, entryDir = null;
      outer: for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (nodeDegree(r, c) >= 1) { startR = r; startC = c; break outer; }
        }
      }
      if (startR === -1) return { valid: false, nodes: [] };

      // BFS/walk: follow the loop
      const nodes = [];
      let r = startR, c = startC;
      let prevR = -1, prevC = -1;
      let steps = 0;
      do {
        nodes.push([r, c]);
        // Determine next node (not going back to prev)
        let nextR = -1, nextC = -1;
        // left
        if (c > 0 && h_edges[r][c - 1] && !(prevR === r && prevC === c - 1)) {
          nextR = r; nextC = c - 1;
        } else if (c < N - 1 && h_edges[r][c] && !(prevR === r && prevC === c + 1)) {
          nextR = r; nextC = c + 1;
        } else if (r > 0 && v_edges[r - 1][c] && !(prevR === r - 1 && prevC === c)) {
          nextR = r - 1; nextC = c;
        } else if (r < N - 1 && v_edges[r][c] && !(prevR === r + 1 && prevC === c)) {
          nextR = r + 1; nextC = c;
        }
        if (nextR === -1) break;
        prevR = r; prevC = c;
        r = nextR; c = nextC;
        steps++;
        if (steps > N * N + 2) break;
      } while (r !== startR || c !== startC);

      return { nodes, valid: r === startR && c === startC };
    }

    // Validate a numbered cell on the current loop.
    // num = balance value: the loop length on both sides of this cell must equal num.
    // Returns 'ok', 'bad', or 'partial'.
    function validateNumber(r, c, num) {
      const deg = nodeDegree(r, c);
      if (deg < 2) return 'partial'; // not on loop yet

      // Trace the full loop
      const { valid, nodes } = traceLoop();
      if (!valid || nodes.length === 0) return 'partial';

      // Find the position of this cell in the loop
      const idx = nodes.findIndex(([nr, nc]) => nr === r && nc === c);
      if (idx === -1) return 'partial'; // not on the traced loop

      const total = nodes.length;
      // The two sides: from idx going forward vs backward
      // forward length until we hit the next numbered cell or the cell itself
      // Actually for Balance Loop: count segments to the next number/corner in each direction
      // Simplified: the TWO half-lengths around this cell. If total is even and idx splits evenly:
      const half = total / 2;
      // Forward (clockwise) distance to return = total - 1
      // Side A = going forward: min(idx, total-idx) — no, we need the actual split
      // The loop has 'total' nodes = 'total' edges. From this node,
      // going one way you travel some distance d, going the other way: total - d.
      // We don't know d without knowing the two incident directions.
      // Instead: sideA = idx positions clockwise = idx steps back to start going forward
      // Since we traced starting from startR which may not be this cell,
      // sideA and sideB from this node's perspective = idx and (total - idx)
      const sideA = idx;
      const sideB = total - idx;

      if (num === 0) {
        // Degenerate: shouldn't appear in our puzzles with this meaning
        return sideA === sideB ? 'ok' : 'bad';
      }
      if (sideA === num && sideB === num) return 'ok';
      if (sideA > num || sideB > num) return 'bad';
      return 'partial';
    }

    // Check if the current state is a valid solved loop
    function checkSolved() {
      // All nodes on the loop must have degree exactly 2
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const d = nodeDegree(r, c);
          if (d !== 0 && d !== 2) return false;
        }
      }
      // The loop must visit ALL N*N cells
      const { valid, nodes } = traceLoop();
      if (!valid || nodes.length !== N * N) return false;

      // All numbered cells must be validated as 'ok'
      const puz = PUZZLES[puzzleIdx % PUZZLES.length];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (puz.numbers[r][c] >= 0) {
            if (validateNumber(r, c, puz.numbers[r][c]) !== 'ok') return false;
          }
        }
      }
      return true;
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playClick(on) {
      if (!audioCtx || activeVoices >= 8) return;
      activeVoices++;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = on ? 740 : 480;
      o.type = 'triangle';
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
      o.start(); o.stop(audioCtx.currentTime + 0.06);
      o.onended = () => { activeVoices--; };
    }

    function playSuccess() {
      if (!audioCtx) return;
      [440, 554, 659, 880].forEach((f, i) => {
        if (activeVoices >= 8) return;
        activeVoices++;
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.frequency.value = f;
        o.type = 'sine';
        const t = audioCtx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.14, t + 0.04);
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
      const puz = PUZZLES[puzzleIdx % PUZZLES.length];
      const { CELL, ox, oy } = getLayout();

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = ACCENT;
      g.fillText('BALANCE LOOP', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Draw cell dots (nodes)
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const nx = ox + c * CELL + CELL / 2;
          const ny = oy + r * CELL + CELL / 2;
          const deg = nodeDegree(r, c);

          // Cell background square
          g.fillStyle = CELL_BG;
          g.beginPath();
          g.roundRect
            ? g.roundRect(ox + c * CELL + 2, oy + r * CELL + 2, CELL - 4, CELL - 4, 5)
            : g.rect(ox + c * CELL + 2, oy + r * CELL + 2, CELL - 4, CELL - 4);
          g.fill();

          // Node dot
          g.beginPath();
          g.arc(nx, ny, deg > 0 ? 4 : 3, 0, Math.PI * 2);
          g.fillStyle = deg > 0 ? ACCENT : '#444466';
          g.fill();

          // Number display
          const num = puz.numbers[r][c];
          if (num >= 0) {
            const status = validateNumber(r, c, num);
            let numColor;
            if (status === 'ok') {
              numColor = '#66BB6A';
            } else if (status === 'bad') {
              numColor = '#EF5350';
              // Flash effect
              if (!flashAnims[`${r},${c}`]) {
                flashAnims[`${r},${c}`] = { start: now };
              }
            } else {
              delete flashAnims[`${r},${c}`];
              numColor = ACCENT;
            }

            const rad = CELL * 0.34;
            g.beginPath();
            g.arc(nx, ny, rad, 0, Math.PI * 2);
            g.fillStyle = '#0f0f14';
            g.fill();
            g.strokeStyle = numColor;
            g.lineWidth = 2;
            if (status === 'ok') {
              g.shadowColor = '#66BB6A';
              g.shadowBlur = 10;
            } else if (status === 'bad') {
              // Pulse red
              const fa = flashAnims[`${r},${c}`];
              const ft = fa ? ((now - fa.start) % 600) / 600 : 0;
              g.shadowColor = '#EF5350';
              g.shadowBlur = 6 + 10 * Math.abs(Math.sin(ft * Math.PI));
            }
            g.stroke();
            g.shadowBlur = 0;

            g.font = `bold ${Math.max(11, Math.floor(CELL * 0.36))}px -apple-system, sans-serif`;
            g.fillStyle = numColor;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(String(num), nx, ny);
          }
        }
      }

      // Draw active loop segments
      g.strokeStyle = LOOP_COLOR;
      g.lineWidth = Math.max(3, CELL * 0.14);
      g.lineCap = 'round';
      g.shadowColor = ACCENT;
      g.shadowBlur = 8;

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N - 1; c++) {
          if (h_edges[r][c]) {
            const x1 = ox + c * CELL + CELL / 2;
            const y1 = oy + r * CELL + CELL / 2;
            const x2 = ox + (c + 1) * CELL + CELL / 2;
            const y2 = y1;
            g.beginPath();
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
            g.stroke();
          }
        }
      }
      for (let r = 0; r < N - 1; r++) {
        for (let c = 0; c < N; c++) {
          if (v_edges[r][c]) {
            const x1 = ox + c * CELL + CELL / 2;
            const y1 = oy + r * CELL + CELL / 2;
            const x2 = x1;
            const y2 = oy + (r + 1) * CELL + CELL / 2;
            g.beginPath();
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
            g.stroke();
          }
        }
      }
      g.shadowBlur = 0;

      // Edge tap targets (faint dots)
      g.fillStyle = 'rgba(179,157,219,0.12)';
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N - 1; c++) {
          if (!h_edges[r][c]) {
            const ex = ox + (c + 1) * CELL;
            const ey = oy + r * CELL + CELL / 2;
            g.beginPath();
            g.arc(ex, ey, 4, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      for (let r = 0; r < N - 1; r++) {
        for (let c = 0; c < N; c++) {
          if (!v_edges[r][c]) {
            const ex = ox + c * CELL + CELL / 2;
            const ey = oy + (r + 1) * CELL;
            g.beginPath();
            g.arc(ex, ey, 4, 0, Math.PI * 2);
            g.fill();
          }
        }
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
          const best = ctx.storage.get('bt_balanceloop') || 0;
          g.fillText(`Best: ${best ? formatTime(best) : '--'}`, W / 2, USABLE_H / 2 + 18);

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
        const ch = Math.min(Math.floor(USABLE_H * 0.76), 500);
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
        g.font = 'bold 22px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillText('BALANCE LOOP', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty = cy2 + 78;
        const lh = 23;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.38)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Connect ALL dots with a single closed loop',
          '• Tap between two dots to draw/erase a segment',
          '• Numbered dots: the loop must be split equally',
          '  — same number of steps on each side of the dot',
          '• Numbers glow green when balanced',
          '• Numbers flash red when unbalanced',
          '• Every dot must be visited exactly once',
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
        g.fillText('Tap between two dots → toggle segment', lx, ty);

        g.font = 'bold 12px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.38)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 18);
      }

      // Eye/solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', EYE_X, EYE_CY);
      g.restore();

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
      const ty2 = e.changedTouches[0].clientY;

      // Eye/solution button check
      if (Math.hypot(tx - EYE_X, ty2 - EYE_CY) < EYE_R) {
        showSolution = true;
        applySolution();
        return;
      }

      // IBTN hit check first
      if (Math.hypot(tx - IBTN.x, ty2 - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (showSolution) {
        initPuzzle();
        return;
      }

      // Solved screen — tap to advance
      if (solved && solveAnim && performance.now() - solveAnim.startTime > 600) {
        puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
        ctx.storage.set('balanceloop_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      const layout = getLayout();
      const edge = edgeAt(tx, ty2, layout);
      if (!edge) return;

      if (!gameStarted) {
        ctx.platform.start();
        gameStarted = true;
        startTime = performance.now();
      }

      if (edge.type === 'h') {
        const was = h_edges[edge.r][edge.c];
        h_edges[edge.r][edge.c] = was ? 0 : 1;
        playClick(!was);
      } else {
        const was = v_edges[edge.r][edge.c];
        v_edges[edge.r][edge.c] = was ? 0 : 1;
        playClick(!was);
      }

      ctx.platform.interact({ type: 'tap' });
      ctx.platform.haptic('light');

      if (checkSolved()) {
        solved = true;
        solveTime = performance.now() - startTime;
        const best = ctx.storage.get('bt_balanceloop') || 0;
        if (!best || solveTime < best) ctx.storage.set('bt_balanceloop', solveTime);
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
