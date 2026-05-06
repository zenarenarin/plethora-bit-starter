// SLITHERLINK — Loop-drawing puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Slitherlink',
    author: 'plethora',
    description: 'Draw a single loop along the grid edges.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#00B4D8';
    const ACCENT2 = '#0077A8';
    const BG = '#0f0f14';
    const CARD_BG = '#1a1a2e';
    const ERROR_COL = '#FF4D6D';
    const COLS = 6, ROWS = 6;

    // Generate a random slitherlink puzzle.
    // Returns { clues: [[r,c,n],...], hedges: [[r,c],...], vedges: [[r,c],...] }
    // hedges[i] = [r,c] means horizontal edge at row r, col c is active
    // vedges[i] = [r,c] means vertical edge at row r, col c is active
    function generatePuzzle(R, C) {
      R = R || 6; C = C || 6;

      // Build a random loop on the dot grid (dots are at intersections 0..R x 0..C)
      // We'll do a random walk forming a cycle
      function tryBuildLoop() {
        const path = [[0, 0]];
        const visited = new Set(['0,0']);
        let cr = 0, cc = 0;

        for (let step = 0; step < 80; step++) {
          const dirs = [[-1,0],[1,0],[0,-1],[0,1]].sort(() => Math.random() - 0.5);
          let moved = false;
          for (const [dr, dc] of dirs) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr > R || nc < 0 || nc > C) continue;
            // Can we close the loop?
            if (nr === 0 && nc === 0 && path.length > 5) {
              path.push([0, 0]);
              return path;
            }
            if (!visited.has(nr + ',' + nc)) {
              visited.add(nr + ',' + nc);
              path.push([nr, nc]);
              cr = nr; cc = nc; moved = true; break;
            }
          }
          if (!moved) break;
        }
        return null;
      }

      let path = null;
      for (let t = 0; t < 30; t++) {
        path = tryBuildLoop();
        if (path && path.length > 7) break;
      }
      if (!path) {
        // Fallback: simple rectangle around full grid
        path = [];
        for (let c = 0; c < C; c++) path.push([0, c]);
        for (let r = 0; r < R; r++) path.push([r, C]);
        for (let c = C; c > 0; c--) path.push([R, c]);
        for (let r = R; r > 0; r--) path.push([r, 0]);
        path.push([0, 0]);
      }

      // Convert path (sequence of dot coords) to edge sets
      // hedges: horizontal edge between dot (r,c) and (r,c+1) → stored as [r, c] (top of cell row r)
      // vedges: vertical edge between dot (r,c) and (r+1,c) → stored as [r, c] (left of cell col c)
      const hedgeSet = new Set();
      const vedgeSet = new Set();

      for (let i = 0; i < path.length - 1; i++) {
        const [r1, c1] = path[i];
        const [r2, c2] = path[i + 1];
        if (r1 === r2) {
          // horizontal move: vertical edge at column boundary
          // moving from (r,c1) to (r,c2) → vedge at row r, col min(c1,c2)+... wait
          // same row move = horizontal dot move = vertical edge segment
          // Dot (r,c) to dot (r,c+1) is a horizontal segment = hEdge at [r, min(c1,c2)]
          // Actually: horizontal dot-to-dot = horizontal edge
          const minC = Math.min(c1, c2);
          hedgeSet.add(r1 + ',' + minC);
        } else {
          // vertical move: dot (r1,c) to (r2,c) = vertical edge at [min(r1,r2), c]
          const minR = Math.min(r1, r2);
          vedgeSet.add(minR + ',' + c1);
        }
      }

      const hedges = Array.from(hedgeSet).map(s => s.split(',').map(Number));
      const vedges = Array.from(vedgeSet).map(s => s.split(',').map(Number));

      // Build boolean grids for clue computation
      const hActive = Array.from({length: R + 1}, () => new Array(C).fill(false));
      const vActive = Array.from({length: R}, () => new Array(C + 1).fill(false));
      for (const [r, c] of hedges) if (r >= 0 && r <= R && c >= 0 && c < C) hActive[r][c] = true;
      for (const [r, c] of vedges) if (r >= 0 && r < R && c >= 0 && c <= C) vActive[r][c] = true;

      // Compute cell clues (~50% of cells)
      const clues = [];
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          if (Math.random() > 0.5) continue;
          let n = 0;
          if (hActive[r][c]) n++;
          if (hActive[r + 1][c]) n++;
          if (vActive[r][c]) n++;
          if (vActive[r][c + 1]) n++;
          clues.push([r, c, n]);
        }
      }

      return { clues, hedges, vedges };
    }

    let currentPuzzle = generatePuzzle(ROWS, COLS);

    let hEdges, vEdges; // 0=none, 1=loop, 2=crossed
    let edgeAnims = [];
    let showInfo = false;
    let showSolution = false;
    let solved = false;
    let solveTime = 0;
    let timer = 0;
    let timerActive = false;
    let touchStart = null;
    let longPressTimer = null;

    // Audio
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playClick() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
      o.start(); o.stop(audioCtx.currentTime + 0.06);
    }
    function playBuzz() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = 'sawtooth'; o.frequency.value = 120;
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      o.start(); o.stop(audioCtx.currentTime + 0.12);
    }
    function playArpeggio() {
      if (!audioCtx) return;
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => {
        ctx.timeout(() => {
          const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
          o.connect(gain); gain.connect(audioCtx.destination);
          o.type = 'sine'; o.frequency.value = f;
          gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
          o.start(); o.stop(audioCtx.currentTime + 0.25);
        }, i * 120);
      });
    }

    // Grid layout
    const PAD = 28;
    const TOP_HUD = 60;
    const GRID_W = W - PAD * 2;
    const GRID_H = USABLE_H - TOP_HUD - PAD * 2;
    const CELL = Math.min(GRID_W / COLS, GRID_H / ROWS);
    const GRID_X = (W - CELL * COLS) / 2;
    const GRID_Y = TOP_HUD + (USABLE_H - TOP_HUD - CELL * ROWS) / 2;
    const DOT_R = 3.5;
    const EDGE_THRESH = CELL * 0.45;

    function initPuzzle() {
      hEdges = Array.from({length: ROWS + 1}, () => new Array(COLS).fill(0));
      vEdges = Array.from({length: ROWS}, () => new Array(COLS + 1).fill(0));
      edgeAnims = [];
      solved = false;
      timer = 0;
      timerActive = false;
      showSolution = false;
    }

    function applySolution() {
      // Reset edges first
      hEdges = Array.from({length: ROWS + 1}, () => new Array(COLS).fill(0));
      vEdges = Array.from({length: ROWS}, () => new Array(COLS + 1).fill(0));
      edgeAnims = [];
      for (const [r, c] of currentPuzzle.hedges) {
        if (r >= 0 && r <= ROWS && c >= 0 && c < COLS) hEdges[r][c] = 1;
      }
      for (const [r, c] of currentPuzzle.vedges) {
        if (r >= 0 && r < ROWS && c >= 0 && c <= COLS) vEdges[r][c] = 1;
      }
    }

    function dotXY(r, c) {
      return { x: GRID_X + c * CELL, y: GRID_Y + r * CELL };
    }

    function nearestEdge(px, py) {
      let best = null, bestD = Infinity;
      for (let r = 0; r <= ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const mx = GRID_X + (c + 0.5) * CELL;
          const my = GRID_Y + r * CELL;
          const d = Math.hypot(px - mx, py - my);
          if (d < bestD && d < EDGE_THRESH) { bestD = d; best = {type:'h', r, c}; }
        }
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c <= COLS; c++) {
          const mx = GRID_X + c * CELL;
          const my = GRID_Y + (r + 0.5) * CELL;
          const d = Math.hypot(px - mx, py - my);
          if (d < bestD && d < EDGE_THRESH) { bestD = d; best = {type:'v', r, c}; }
        }
      }
      return best;
    }

    function toggleEdge(e, long) {
      if (!e) return false;
      let cur;
      if (e.type === 'h') cur = hEdges[e.r][e.c];
      else cur = vEdges[e.r][e.c];

      let next;
      if (long) {
        next = cur === 2 ? 0 : 2;
      } else {
        if (cur === 0) next = 1;
        else if (cur === 1) next = 0;
        else next = 0;
      }

      if (e.type === 'h') hEdges[e.r][e.c] = next;
      else vEdges[e.r][e.c] = next;

      if (next === 1) {
        edgeAnims.push({type: e.type, r: e.r, c: e.c, t: 0, maxT: 80});
      }
      return true;
    }

    function clueAt(r, c) {
      for (const [cr, cc, val] of currentPuzzle.clues) {
        if (cr === r && cc === c) return val;
      }
      return null;
    }

    function edgesAroundCell(r, c) {
      return [
        hEdges[r][c],
        hEdges[r+1][c],
        vEdges[r][c],
        vEdges[r][c+1],
      ];
    }

    function edgesAtDot(r, c) {
      const res = [];
      if (r > 0) res.push(vEdges[r-1][c]);
      if (r < ROWS) res.push(vEdges[r][c]);
      if (c > 0) res.push(hEdges[r][c-1]);
      if (c < COLS) res.push(hEdges[r][c]);
      return res;
    }

    function loopEdgeCount(arr) { return arr.filter(v => v === 1).length; }

    function isCellConflict(r, c) {
      const clue = clueAt(r, c);
      if (clue === null) return false;
      const edges = edgesAroundCell(r, c).map(v => v === 1 ? 1 : 0);
      const count = edges.reduce((a, b) => a + b, 0);
      return count > clue;
    }

    function isClueSatisfied(r, c) {
      const clue = clueAt(r, c);
      if (clue === null) return true;
      const count = loopEdgeCount(edgesAroundCell(r, c));
      return count === clue;
    }

    function isDotConflict(r, c) {
      const count = loopEdgeCount(edgesAtDot(r, c));
      return count > 2 || count === 1;
    }

    function validateLoop() {
      const loopEdges = [];
      for (let r = 0; r <= ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (hEdges[r][c] === 1) loopEdges.push({type:'h', r, c});
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c <= COLS; c++)
          if (vEdges[r][c] === 1) loopEdges.push({type:'v', r, c});

      if (loopEdges.length === 0) return false;

      function edgeDots(e) {
        if (e.type === 'h') return [{r: e.r, c: e.c}, {r: e.r, c: e.c + 1}];
        return [{r: e.r, c: e.c}, {r: e.r + 1, c: e.c}];
      }

      const dotMap = {};
      for (const e of loopEdges) {
        for (const d of edgeDots(e)) {
          const k = `${d.r},${d.c}`;
          dotMap[k] = (dotMap[k] || 0) + 1;
        }
      }
      for (const k in dotMap) {
        if (dotMap[k] !== 2) return false;
      }

      const dotAdj = {};
      for (const e of loopEdges) {
        const [d1, d2] = edgeDots(e);
        const k1 = `${d1.r},${d1.c}`, k2 = `${d2.r},${d2.c}`;
        if (!dotAdj[k1]) dotAdj[k1] = [];
        if (!dotAdj[k2]) dotAdj[k2] = [];
        dotAdj[k1].push(k2);
        dotAdj[k2].push(k1);
      }
      const keys = Object.keys(dotAdj);
      if (keys.length === 0) return false;
      const visited = new Set();
      const queue = [keys[0]];
      while (queue.length) {
        const k = queue.shift();
        if (visited.has(k)) continue;
        visited.add(k);
        for (const nb of (dotAdj[k] || [])) queue.push(nb);
      }
      if (visited.size !== keys.length) return false;

      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (!isClueSatisfied(r, c)) return false;

      return true;
    }

    const IBTN = { x: W - 22, y: 8, r: 14 };
    // Solution button
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let solveGlow = 0;
    let solveGlowDir = 1;

    const BT_KEY = 'bt_slitherlink';
    let bestTime = ctx.storage.get(BT_KEY) || 0;

    initPuzzle();

    function drawInfoPanel() {
      g.fillStyle = 'rgba(0,0,0,0.88)';
      g.fillRect(0, 0, W, H);
      const cw = Math.floor(W * 0.82);
      const cx2 = Math.floor((W - cw) / 2);
      const ch = Math.min(Math.floor(USABLE_H * 0.72), 460);
      const cy2 = Math.floor((USABLE_H - ch) / 2);
      g.fillStyle = '#1a1a2e';
      g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
      g.fill();
      g.strokeStyle = ACCENT; g.lineWidth = 1.5;
      g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
      g.stroke();

      const cx = W / 2;
      g.fillStyle = ACCENT;
      g.font = `bold 24px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('SLITHERLINK', cx, cy2 + 40);

      const rules = [
        '· Draw a single closed loop using grid edges',
        '· Numbers show how many edges around that cell',
        '· Loop never crosses or branches',
        '· Tap edge to toggle on/off',
        '· Long-press edge to mark as ✕ (not loop)',
      ];
      g.fillStyle = '#ccd6f6';
      g.font = `14px -apple-system, sans-serif`;
      g.textAlign = 'left';
      rules.forEach((r, i) => {
        g.fillText(r, cx2 + 20, cy2 + 86 + i * 34);
      });

      if (bestTime > 0) {
        g.fillStyle = '#7ec8e3';
        g.font = `13px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.fillText(`Best: ${formatTime(bestTime)}`, cx, cy2 + ch - 48);
      }

      g.font = 'bold 13px -apple-system, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.textAlign = 'center';
      g.fillText('TAP ANYWHERE TO CLOSE', cx, cy2 + ch - 20);
    }

    function drawSolveOverlay() {
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillRect(0, 0, W, USABLE_H);
      const cx = W / 2, cy = USABLE_H / 2;

      g.shadowColor = ACCENT;
      g.shadowBlur = 30;
      g.fillStyle = ACCENT;
      g.font = `bold 36px -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SOLVED!', cx, cy - 36);
      g.shadowBlur = 0;

      g.fillStyle = '#ccd6f6';
      g.font = `20px -apple-system, sans-serif`;
      g.fillText(formatTime(solveTime), cx, cy + 10);

      if (bestTime > 0 && solveTime === bestTime) {
        g.fillStyle = '#FFD700';
        g.font = `bold 16px -apple-system, sans-serif`;
        g.fillText('NEW BEST!', cx, cy + 42);
      }

      g.fillStyle = ACCENT;
      g.font = `bold 17px -apple-system, sans-serif`;
      g.fillText('TAP TO PLAY AGAIN', cx, cy + 82);
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2,'0')}`;
    }

    function drawHUD() {
      g.fillStyle = '#ccd6f6';
      g.font = `bold 18px -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const timeStr = timerActive ? formatTime(timer) : '0:00';
      g.fillText(timeStr, W / 2, 32);

      g.fillStyle = ACCENT;
      g.font = `bold 13px -apple-system, sans-serif`;
      g.textAlign = 'left';
      g.fillText('SLITHERLINK', 16, 32);

      if (bestTime > 0) {
        g.fillStyle = '#7ec8e3';
        g.font = `12px -apple-system, sans-serif`;
        g.textAlign = 'right';
        g.fillText(`Best ${formatTime(bestTime)}`, W - 50, 32);
      }
    }

    function drawGrid() {
      const p = currentPuzzle;

      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      for (let r = 0; r <= ROWS; r++) {
        g.beginPath();
        g.moveTo(GRID_X, GRID_Y + r * CELL);
        g.lineTo(GRID_X + COLS * CELL, GRID_Y + r * CELL);
        g.stroke();
      }
      for (let c = 0; c <= COLS; c++) {
        g.beginPath();
        g.moveTo(GRID_X + c * CELL, GRID_Y);
        g.lineTo(GRID_X + c * CELL, GRID_Y + ROWS * CELL);
        g.stroke();
      }

      for (const [cr, cc, val] of p.clues) {
        const conflict = isCellConflict(cr, cc);
        g.font = `bold 18px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = conflict ? ERROR_COL : '#ccd6f6';
        g.fillText(String(val), GRID_X + (cc + 0.5) * CELL, GRID_Y + (cr + 0.5) * CELL);
      }

      g.strokeStyle = '#444466';
      g.lineWidth = 1.5;
      for (let r = 0; r <= ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (hEdges[r][c] === 2) {
            const x1 = GRID_X + c * CELL + CELL * 0.3;
            const x2 = GRID_X + (c + 1) * CELL - CELL * 0.3;
            const y = GRID_Y + r * CELL;
            g.beginPath(); g.moveTo(x1, y - 6); g.lineTo(x2, y + 6); g.stroke();
            g.beginPath(); g.moveTo(x1, y + 6); g.lineTo(x2, y - 6); g.stroke();
          }
        }
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c <= COLS; c++) {
          if (vEdges[r][c] === 2) {
            const x = GRID_X + c * CELL;
            const y1 = GRID_Y + r * CELL + CELL * 0.3;
            const y2 = GRID_Y + (r + 1) * CELL - CELL * 0.3;
            g.beginPath(); g.moveTo(x - 6, y1); g.lineTo(x + 6, y2); g.stroke();
            g.beginPath(); g.moveTo(x + 6, y1); g.lineTo(x - 6, y2); g.stroke();
          }
        }
      }

      const glowAmt = solved ? solveGlow : 0;
      g.lineCap = 'round';
      g.lineWidth = 3.5;

      if (glowAmt > 0) {
        g.shadowColor = ACCENT;
        g.shadowBlur = glowAmt;
      }

      for (let r = 0; r <= ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (hEdges[r][c] === 1) {
            const anim = edgeAnims.find(a => a.type === 'h' && a.r === r && a.c === c);
            const progress = anim ? Math.min(1, anim.t / anim.maxT) : 1;
            const x1 = GRID_X + c * CELL;
            const x2 = GRID_X + c * CELL + (CELL * progress);
            const y = GRID_Y + r * CELL;
            g.strokeStyle = ACCENT;
            g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
          }
        }
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c <= COLS; c++) {
          if (vEdges[r][c] === 1) {
            const anim = edgeAnims.find(a => a.type === 'v' && a.r === r && a.c === c);
            const progress = anim ? Math.min(1, anim.t / anim.maxT) : 1;
            const x = GRID_X + c * CELL;
            const y1 = GRID_Y + r * CELL;
            const y2 = GRID_Y + r * CELL + (CELL * progress);
            g.strokeStyle = ACCENT;
            g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y2); g.stroke();
          }
        }
      }
      g.shadowBlur = 0;

      for (let r = 0; r <= ROWS; r++) {
        for (let c = 0; c <= COLS; c++) {
          const conflict = isDotConflict(r, c);
          const { x, y } = dotXY(r, c);
          g.beginPath();
          g.arc(x, y, conflict ? 5 : DOT_R, 0, Math.PI * 2);
          g.fillStyle = conflict ? ERROR_COL : '#ffffff';
          g.fill();
        }
      }
    }

    let gameStarted = false;

    ctx.raf((dt) => {
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      if (timerActive && !solved) timer += dt;

      edgeAnims = edgeAnims.filter(a => {
        a.t += dt;
        return a.t < a.maxT * 2;
      });

      if (solved) {
        solveGlow += dt * 0.05 * solveGlowDir;
        if (solveGlow > 22) solveGlowDir = -1;
        if (solveGlow < 0) { solveGlow = 0; solveGlowDir = 1; }
      }

      drawHUD();
      drawGrid();

      if (solved) drawSolveOverlay();

      if (showSolution) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, USABLE_H - 48, W, 48);
        g.fillStyle = ACCENT;
        g.font = 'bold 15px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TAP ANYWHERE FOR NEW PUZZLE', W / 2, USABLE_H - 24);
      }

      // Info button
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // Solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI*2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      if (showInfo) drawInfoPanel();
    });

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // Solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        applySolution();
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        currentPuzzle = generatePuzzle(ROWS, COLS);
        initPuzzle();
        return;
      }

      if (solved) {
        currentPuzzle = generatePuzzle(ROWS, COLS);
        initPuzzle();
        timerActive = true;
        return;
      }

      touchStart = { x: tx, y: ty, time: Date.now() };
      const edge = nearestEdge(tx, ty);

      if (!edge) return;

      longPressTimer = ctx.timeout(() => {
        if (!gameStarted) { gameStarted = true; ctx.platform.start(); }
        playClick();
        toggleEdge(edge, true);
        touchStart = null;
      }, 400);

    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (solved || !touchStart) return;

      const t = e.changedTouches[0];
      const elapsed = Date.now() - touchStart.time;

      if (longPressTimer) {
        longPressTimer = null;
      }

      if (elapsed < 400) {
        const edge = nearestEdge(t.clientX, t.clientY);
        if (edge) {
          if (!gameStarted) { gameStarted = true; ctx.platform.start(); }
          playClick();
          toggleEdge(edge, false);
          if (!timerActive) { timerActive = true; }

          if (validateLoop()) {
            solved = true;
            timerActive = false;
            solveTime = timer;
            if (!bestTime || timer < bestTime) {
              bestTime = timer;
              ctx.storage.set(BT_KEY, bestTime);
            }
            ctx.platform.setScore(Math.floor(300000 / Math.max(timer, 1000)));
            ctx.platform.complete({ score: Math.floor(300000 / Math.max(timer, 1000)), durationMs: timer });
            playArpeggio();
          }
        }
      }
      touchStart = null;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
