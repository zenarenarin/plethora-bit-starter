// MASYU — Loop through circles puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Masyu',
    author: 'plethora',
    description: 'Guide the loop through every circle.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#C77DFF';
    const ACCENT_DIM = '#7B3FBF';
    const BG = '#0f0f14';
    const CARD_BG = '#1a1a2e';
    const ERROR_COL = '#FF4D6D';
    const COLS = 6, ROWS = 6;

    // Generate a random Masyu puzzle.
    // Returns { circles: [{r,c,type},...], solEdges: [[r1,c1,r2,c2],...] }
    function generatePuzzle(N) {
      N = N || 6;

      // Build a random loop visiting a subset of cells
      function buildLoop() {
        const path = [[0, 0]];
        const visited = new Set(['0,0']);
        let cr = 0, cc = 0;
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

        for (let step = 0; step < 60; step++) {
          const shuffled = dirs.slice().sort(() => Math.random() - 0.5);
          let moved = false;
          for (const [dr, dc] of shuffled) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
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
      for (let t = 0; t < 50; t++) {
        path = buildLoop();
        if (path && path.length > 7) break;
      }
      if (!path) {
        // Fallback: rectangle
        path = [];
        for (let c = 0; c < N; c++) path.push([0, c]);
        for (let r = 1; r < N; r++) path.push([r, N - 1]);
        for (let c = N - 2; c >= 0; c--) path.push([N - 1, c]);
        for (let r = N - 2; r > 0; r--) path.push([r, 0]);
        path.push([0, 0]);
      }

      const L = path.length - 1; // number of unique loop cells (path[0]===path[L])

      // Build direction map for each cell on the loop
      // inDir = direction we came FROM (prev cell to this cell)
      // outDir = direction we go TO (this cell to next cell)
      const cellInfo = new Map();
      for (let i = 0; i < L; i++) {
        const prev = path[(i - 1 + L) % L];
        const cur = path[i];
        const next = path[i + 1];
        const inDir = [cur[0] - prev[0], cur[1] - prev[1]];
        const outDir = [next[0] - cur[0], next[1] - cur[1]];
        cellInfo.set(cur[0] + ',' + cur[1], { inDir, outDir });
      }

      // Place circles on ~30% of loop cells
      const circles = [];
      const loopSet = new Set();
      for (let i = 0; i < L; i++) loopSet.add(path[i][0] + ',' + path[i][1]);

      for (let i = 0; i < L; i++) {
        const [r, c] = path[i];
        if (Math.random() > 0.30) continue;
        const info = cellInfo.get(r + ',' + c);
        if (!info) continue;
        const { inDir, outDir } = info;
        const straight = inDir[0] === outDir[0] && inDir[1] === outDir[1];
        // White = goes straight; Black = turns
        circles.push({ r, c, type: straight ? 'white' : 'black' });
      }

      // Ensure at least a couple of circles
      if (circles.length < 2) {
        // Force add two
        for (let i = 0; i < L && circles.length < 2; i++) {
          const [r, c] = path[i];
          if (!circles.some(ci => ci.r === r && ci.c === c)) {
            const info = cellInfo.get(r + ',' + c);
            const straight = info.inDir[0] === info.outDir[0] && info.inDir[1] === info.outDir[1];
            circles.push({ r, c, type: straight ? 'white' : 'black' });
          }
        }
      }

      // Build solEdges: [[r1,c1,r2,c2],...] — one per adjacent cell pair on loop
      const solEdges = [];
      const edgeSet = new Set();
      for (let i = 0; i < L; i++) {
        const [r1, c1] = path[i];
        const [r2, c2] = path[(i + 1) % L];
        const key = Math.min(r1,r2) + ',' + Math.min(c1,c2) + ',' + Math.max(r1,r2) + ',' + Math.max(c1,c2);
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          solEdges.push([r1, c1, r2, c2]);
        }
      }

      return { circles, solEdges };
    }

    let currentPuzzle = generatePuzzle(ROWS);

    // connections[r][c] = {N,S,E,W} booleans
    let connections;
    let dragFrom = null;
    let edgeAnims = [];
    let showInfo = false;
    let showSolution = false;
    let solved = false;
    let solveTime = 0;
    let timer = 0;
    let timerActive = false;
    let solveGlow = 0, solveGlowDir = 1;
    let gameStarted = false;

    const IBTN = { x: W - 22, y: 8, r: 14 };
    // Solution button
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    const BT_KEY = 'bt_masyu';
    let bestTime = ctx.storage.get(BT_KEY) || 0;

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
      o.type = 'sine'; o.frequency.value = 660;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }
    function playBuzz() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = 'sawtooth'; o.frequency.value = 100;
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    }
    function playArpeggio() {
      if (!audioCtx) return;
      [392, 523, 659, 784, 1047].forEach((f, i) => {
        ctx.timeout(() => {
          const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
          o.connect(gain); gain.connect(audioCtx.destination);
          o.type = 'sine'; o.frequency.value = f;
          gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
          o.start(); o.stop(audioCtx.currentTime + 0.2);
        }, i * 100);
      });
    }

    // Layout
    const PAD = 28;
    const TOP_HUD = 60;
    const GRID_W = W - PAD * 2;
    const GRID_H = USABLE_H - TOP_HUD - PAD * 2;
    const CELL = Math.min(GRID_W / COLS, GRID_H / ROWS);
    const GRID_X = (W - CELL * COLS) / 2;
    const GRID_Y = TOP_HUD + (USABLE_H - TOP_HUD - CELL * ROWS) / 2;

    function cellCenter(r, c) {
      return { x: GRID_X + (c + 0.5) * CELL, y: GRID_Y + (r + 0.5) * CELL };
    }

    function hitCell(px, py) {
      const c = Math.floor((px - GRID_X) / CELL);
      const r = Math.floor((py - GRID_Y) / CELL);
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return {r, c};
      return null;
    }

    function initPuzzle() {
      connections = Array.from({length: ROWS}, () =>
        Array.from({length: COLS}, () => ({N:false, S:false, E:false, W:false}))
      );
      edgeAnims = [];
      solved = false;
      timer = 0;
      timerActive = false;
      dragFrom = null;
      showSolution = false;
    }

    function applySolution() {
      // Reset
      connections = Array.from({length: ROWS}, () =>
        Array.from({length: COLS}, () => ({N:false, S:false, E:false, W:false}))
      );
      edgeAnims = [];
      for (const [r1, c1, r2, c2] of currentPuzzle.solEdges) {
        if (r1 < 0 || r1 >= ROWS || c1 < 0 || c1 >= COLS) continue;
        if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) continue;
        const dr = r2 - r1, dc = c2 - c1;
        let dir1, dir2;
        if (dr === -1) { dir1 = 'N'; dir2 = 'S'; }
        else if (dr === 1) { dir1 = 'S'; dir2 = 'N'; }
        else if (dc === -1) { dir1 = 'W'; dir2 = 'E'; }
        else { dir1 = 'E'; dir2 = 'W'; }
        connections[r1][c1][dir1] = true;
        connections[r2][c2][dir2] = true;
      }
    }

    function toggleEdge(r1, c1, r2, c2) {
      const dr = r2 - r1, dc = c2 - c1;
      const conn1 = connections[r1][c1];
      const conn2 = connections[r2][c2];
      let dir1, dir2;
      if (dr === -1) { dir1 = 'N'; dir2 = 'S'; }
      else if (dr === 1) { dir1 = 'S'; dir2 = 'N'; }
      else if (dc === -1) { dir1 = 'W'; dir2 = 'E'; }
      else { dir1 = 'E'; dir2 = 'W'; }

      const was = conn1[dir1];
      conn1[dir1] = !was;
      conn2[dir2] = !was;

      if (!was) {
        edgeAnims.push({r1, c1, r2, c2, t: 0, maxT: 80});
      }
      return !was;
    }

    function connCount(r, c) {
      const cn = connections[r][c];
      return (cn.N?1:0)+(cn.S?1:0)+(cn.E?1:0)+(cn.W?1:0);
    }

    function isSingleLoop() {
      const visited = Array.from({length:ROWS}, () => new Array(COLS).fill(false));
      let start = null;
      let total = 0;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (connCount(r, c) === 2) { if (!start) start = {r, c}; total++; }

      if (!start || total === 0) return false;

      const queue = [start];
      visited[start.r][start.c] = true;
      let count = 1;
      while (queue.length) {
        const {r, c} = queue.shift();
        const cn = connections[r][c];
        const nbrs = [];
        if (cn.N && r > 0) nbrs.push({r:r-1,c});
        if (cn.S && r < ROWS-1) nbrs.push({r:r+1,c});
        if (cn.W && c > 0) nbrs.push({r,c:c-1});
        if (cn.E && c < COLS-1) nbrs.push({r,c:c+1});
        for (const nb of nbrs) {
          if (!visited[nb.r][nb.c]) {
            visited[nb.r][nb.c] = true;
            count++;
            queue.push(nb);
          }
        }
      }
      return count === total;
    }

    function checkWhiteCircle(r, c) {
      const cn = connections[r][c];
      const horiz = cn.E && cn.W;
      const vert = cn.N && cn.S;
      if (!horiz && !vert) return false;
      if (horiz) {
        const leftOk = c === 0 || (() => { const n = connections[r][c-1]; return (n.N || n.S) && n.E; })();
        const rightOk = c === COLS-1 || (() => { const n = connections[r][c+1]; return (n.N || n.S) && n.W; })();
        return leftOk || rightOk;
      } else {
        const upOk = r === 0 || (() => { const n = connections[r-1][c]; return (n.E || n.W) && n.S; })();
        const downOk = r === ROWS-1 || (() => { const n = connections[r+1][c]; return (n.E || n.W) && n.N; })();
        return upOk || downOk;
      }
    }

    function checkBlackCircle(r, c) {
      const cn = connections[r][c];
      const turnsNE = cn.N && cn.E;
      const turnsNW = cn.N && cn.W;
      const turnsSE = cn.S && cn.E;
      const turnsSW = cn.S && cn.W;
      if (!turnsNE && !turnsNW && !turnsSE && !turnsSW) return false;
      if (turnsNE) {
        const upOk = r === 0 || (connections[r-1][c].N && connections[r-1][c].S);
        const rightOk = c === COLS-1 || (connections[r][c+1].E && connections[r][c+1].W);
        return upOk && rightOk;
      }
      if (turnsNW) {
        const upOk = r === 0 || (connections[r-1][c].N && connections[r-1][c].S);
        const leftOk = c === 0 || (connections[r][c-1].E && connections[r][c-1].W);
        return upOk && leftOk;
      }
      if (turnsSE) {
        const downOk = r === ROWS-1 || (connections[r+1][c].N && connections[r+1][c].S);
        const rightOk = c === COLS-1 || (connections[r][c+1].E && connections[r][c+1].W);
        return downOk && rightOk;
      }
      if (turnsSW) {
        const downOk = r === ROWS-1 || (connections[r+1][c].N && connections[r+1][c].S);
        const leftOk = c === 0 || (connections[r][c-1].E && connections[r][c-1].W);
        return downOk && leftOk;
      }
      return false;
    }

    function isCircleConflict(circ) {
      const {r, c, type} = circ;
      const cnt = connCount(r, c);
      if (cnt !== 2) return cnt > 2;
      if (type === 'white') return !checkWhiteCircle(r, c);
      return !checkBlackCircle(r, c);
    }

    function validateAll() {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const cnt = connCount(r, c);
          if (cnt !== 0 && cnt !== 2) return false;
        }
      if (!isSingleLoop()) return false;
      for (const circ of currentPuzzle.circles) {
        const {r, c, type} = circ;
        if (connCount(r, c) !== 2) return false;
        if (type === 'white' && !checkWhiteCircle(r, c)) return false;
        if (type === 'black' && !checkBlackCircle(r, c)) return false;
      }
      return true;
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    }

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
      g.fillText('MASYU', cx, cy2 + 40);

      const rules = [
        '· Draw a single loop through the grid',
        '· Loop must pass through EVERY circle',
        '· WHITE ○: go straight, turn at neighbor',
        '· BLACK ●: turn here, go straight at neighbor',
        '· Drag between cells to draw path segments',
      ];
      g.fillStyle = '#ccd6f6';
      g.font = `14px -apple-system, sans-serif`;
      g.textAlign = 'left';
      rules.forEach((r, i) => g.fillText(r, cx2 + 20, cy2 + 86 + i * 36));

      if (bestTime > 0) {
        g.fillStyle = '#c77dff';
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
      g.fillStyle = 'rgba(0,0,0,0.72)';
      g.fillRect(0, 0, W, USABLE_H);
      const cx = W / 2, cy = USABLE_H / 2;
      g.shadowColor = ACCENT; g.shadowBlur = 32;
      g.fillStyle = ACCENT;
      g.font = `bold 36px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
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

    function drawHUD() {
      g.fillStyle = '#ccd6f6';
      g.font = `bold 18px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(timerActive ? formatTime(timer) : '0:00', W / 2, 32);
      g.fillStyle = ACCENT;
      g.font = `bold 13px -apple-system, sans-serif`;
      g.textAlign = 'left';
      g.fillText('MASYU', 16, 32);
      if (bestTime > 0) {
        g.fillStyle = '#c77dff';
        g.font = `12px -apple-system, sans-serif`;
        g.textAlign = 'right';
        g.fillText(`Best ${formatTime(bestTime)}`, W - 50, 32);
      }
    }

    function drawGrid() {
      const p = currentPuzzle;

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          g.fillStyle = '#141420';
          g.fillRect(GRID_X + c * CELL + 1, GRID_Y + r * CELL + 1, CELL - 2, CELL - 2);
        }
      }

      g.strokeStyle = 'rgba(255,255,255,0.08)';
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

      const glowAmt = solved ? solveGlow : 0;
      g.lineCap = 'round';
      g.lineWidth = 4;
      g.strokeStyle = ACCENT;
      if (glowAmt > 0) { g.shadowColor = ACCENT; g.shadowBlur = glowAmt; }

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cn = connections[r][c];
          const {x, y} = cellCenter(r, c);
          if (cn.E && c < COLS - 1) {
            const {x: x2} = cellCenter(r, c + 1);
            const anim = edgeAnims.find(a => a.r1 === r && a.c1 === c && a.r2 === r && a.c2 === c + 1);
            const prog = anim ? Math.min(1, anim.t / anim.maxT) : 1;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + (x2 - x) * prog, y);
            g.stroke();
          }
          if (cn.S && r < ROWS - 1) {
            const {y: y2} = cellCenter(r + 1, c);
            const anim = edgeAnims.find(a => a.r1 === r && a.c1 === c && a.r2 === r + 1 && a.c2 === c);
            const prog = anim ? Math.min(1, anim.t / anim.maxT) : 1;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x, y + (y2 - y) * prog);
            g.stroke();
          }
        }
      }
      g.shadowBlur = 0;

      if (dragFrom) {
        const {x: dx, y: dy} = cellCenter(dragFrom.r, dragFrom.c);
        g.strokeStyle = 'rgba(199,125,255,0.4)';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(dx, dy, CELL * 0.22, 0, Math.PI * 2);
        g.stroke();
      }

      for (const circ of p.circles) {
        const {r, c, type} = circ;
        const {x, y} = cellCenter(r, c);
        const conflict = isCircleConflict(circ);
        const circR = CELL * 0.22;

        if (type === 'black') {
          g.beginPath();
          g.arc(x, y, circR, 0, Math.PI * 2);
          g.fillStyle = conflict ? ERROR_COL : '#ffffff';
          g.fill();
        } else {
          g.beginPath();
          g.arc(x, y, circR, 0, Math.PI * 2);
          g.fillStyle = conflict ? 'rgba(255,77,109,0.2)' : 'rgba(199,125,255,0.1)';
          g.fill();
          g.strokeStyle = conflict ? ERROR_COL : '#ffffff';
          g.lineWidth = 2.5;
          g.stroke();
        }
      }
    }

    ctx.raf((dt) => {
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      if (timerActive && !solved) timer += dt;

      edgeAnims = edgeAnims.filter(a => { a.t += dt; return a.t < a.maxT * 2; });

      if (solved) {
        solveGlow += dt * 0.05 * solveGlowDir;
        if (solveGlow > 24) solveGlowDir = -1;
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
        currentPuzzle = generatePuzzle(ROWS);
        initPuzzle();
        return;
      }

      if (solved) {
        currentPuzzle = generatePuzzle(ROWS);
        initPuzzle();
        timerActive = true;
        return;
      }
      const cell = hitCell(tx, ty);
      if (cell) dragFrom = cell;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (solved || !dragFrom) return;
      const t = e.changedTouches[0];
      const cell = hitCell(t.clientX, t.clientY);
      if (!cell) return;
      if (cell.r === dragFrom.r && cell.c === dragFrom.c) return;
      const dr = Math.abs(cell.r - dragFrom.r), dc = Math.abs(cell.c - dragFrom.c);
      if (dr + dc !== 1) { dragFrom = cell; return; }

      const cnt1 = connCount(dragFrom.r, dragFrom.c);
      const cnt2 = connCount(cell.r, cell.c);
      const cn1 = connections[dragFrom.r][dragFrom.c];
      const cn2 = connections[cell.r][cell.c];
      let dir1, dir2;
      if (cell.r < dragFrom.r) { dir1='N'; dir2='S'; }
      else if (cell.r > dragFrom.r) { dir1='S'; dir2='N'; }
      else if (cell.c < dragFrom.c) { dir1='W'; dir2='E'; }
      else { dir1='E'; dir2='W'; }

      if (cn1[dir1]) {
        cn1[dir1] = false; cn2[dir2] = false;
        playClick();
      } else if (cnt1 < 2 && cnt2 < 2) {
        cn1[dir1] = true; cn2[dir2] = true;
        edgeAnims.push({r1:dragFrom.r,c1:dragFrom.c,r2:cell.r,c2:cell.c,t:0,maxT:80});
        playClick();
        if (!gameStarted) { gameStarted = true; ctx.platform.start(); }
        if (!timerActive) timerActive = true;

        if (validateAll()) {
          solved = true; timerActive = false; solveTime = timer;
          if (!bestTime || timer < bestTime) { bestTime = timer; ctx.storage.set(BT_KEY, bestTime); }
          ctx.platform.setScore(Math.floor(300000 / Math.max(timer, 1000)));
          ctx.platform.complete({ score: Math.floor(300000 / Math.max(timer, 1000)), durationMs: timer });
          playArpeggio();
        }
      } else {
        playBuzz();
      }
      dragFrom = cell;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      dragFrom = null;
    }, { passive: false });

    initPuzzle();
    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
