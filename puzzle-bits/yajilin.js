// YAJILIN — Arrow clue loop puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Yajilin',
    author: 'plethora',
    description: 'Draw a loop — arrows show how many black cells lie ahead.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#F72585';
    const ACCENT_DIM = '#8B1648';
    const BG = '#0f0f14';
    const CARD_BG = '#1a1a2e';
    const ERROR_COL = '#FF9F1C';
    const COLS = 6, ROWS = 6;

    // Generate a random Yajilin puzzle.
    // Returns { arrows: [{r,c,dir,n},...], blacks: [{r,c},...], loopCells: [[r,c],...] }
    function generatePuzzle(N) {
      N = N || 6;

      // Step 1: Choose arrow cell positions first (these are fixed clue cells)
      // ~10-15% of cells become arrow cells, well-spread
      const arrowGrid = Array.from({length:N}, () => new Array(N).fill(false));
      const potentialArrows = [];
      // Use a sparse pattern: every other row/col region
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (Math.random() < 0.13) potentialArrows.push([r, c]);
        }
      }
      // Limit to 4-6 arrows
      const maxArrows = 4 + Math.floor(Math.random() * 3);
      const selectedArrows = potentialArrows.slice(0, maxArrows);
      for (const [r, c] of selectedArrows) arrowGrid[r][c] = true;

      // Step 2: Choose black cells (~10% of non-arrow cells, no two adjacent)
      const blackGrid = Array.from({length:N}, () => new Array(N).fill(false));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (arrowGrid[r][c]) continue;
          if (Math.random() < 0.10) {
            const adj = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
            if (!adj.some(([ar,ac]) => ar>=0&&ar<N&&ac>=0&&ac<N&&blackGrid[ar][ac])) {
              blackGrid[r][c] = true;
            }
          }
        }
      }

      // Step 3: Build loop on non-black, non-arrow cells
      function buildLoop() {
        let startR = -1, startC = -1;
        for (let r = 0; r < N && startR < 0; r++)
          for (let c = 0; c < N && startR < 0; c++)
            if (!arrowGrid[r][c] && !blackGrid[r][c]) { startR = r; startC = c; }
        if (startR < 0) return null;

        const path = [[startR, startC]];
        const visited = new Set([startR + ',' + startC]);
        let cr = startR, cc = startC;

        for (let step = 0; step < 80; step++) {
          const dirs = [[0,1],[0,-1],[1,0],[-1,0]].sort(() => Math.random() - 0.5);
          let moved = false;
          for (const [dr, dc] of dirs) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
            if (arrowGrid[nr][nc] || blackGrid[nr][nc]) continue;
            if (nr === startR && nc === startC && path.length > 5) {
              path.push([startR, startC]);
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
      for (let t = 0; t < 40; t++) {
        path = buildLoop();
        if (path && path.length > 5) break;
      }

      // If no loop found, remove all blacks and try again
      if (!path) {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) blackGrid[r][c] = false;
        for (let t = 0; t < 20; t++) {
          path = buildLoop();
          if (path && path.length > 5) break;
        }
      }
      if (!path) {
        // Absolute fallback: small loop in top-left
        path = [[0,0],[0,1],[0,2],[1,2],[1,1],[1,0],[0,0]];
      }

      const loopCells = path.slice(0, path.length - 1);
      const loopSet = new Set(loopCells.map(([r,c]) => r+','+c));

      // Step 4: Build arrow clue data
      // For each arrow cell, pick a direction and count blacks in that direction
      const DIRS = [
        { dir: 'right', dr: 0, dc: 1 },
        { dir: 'left',  dr: 0, dc: -1 },
        { dir: 'down',  dr: 1, dc: 0 },
        { dir: 'up',    dr: -1, dc: 0 },
      ];
      const arrows = [];
      for (const [ar, ac] of selectedArrows) {
        const dirObj = DIRS[Math.floor(Math.random() * DIRS.length)];
        let count = 0;
        let tr = ar + dirObj.dr, tc = ac + dirObj.dc;
        while (tr >= 0 && tr < N && tc >= 0 && tc < N) {
          if (blackGrid[tr][tc]) count++;
          tr += dirObj.dr; tc += dirObj.dc;
        }
        arrows.push({ r: ar, c: ac, dir: dirObj.dir, n: count });
      }

      // blacks list
      const blacks = [];
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (blackGrid[r][c]) blacks.push({ r, c });

      return { arrows, blacks, loopCells };
    }

    let currentPuzzle = generatePuzzle(ROWS);

    // State per cell: 0=empty, 1=black
    let cellState;
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

    const BT_KEY = 'bt_yajilin';
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
      o.type = 'sine'; o.frequency.value = 700;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }
    function playBuzz() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = 'sawtooth'; o.frequency.value = 110;
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      o.start(); o.stop(audioCtx.currentTime + 0.12);
    }
    function playArpeggio() {
      if (!audioCtx) return;
      [440, 554, 659, 880, 1108].forEach((f, i) => {
        ctx.timeout(() => {
          const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
          o.connect(gain); gain.connect(audioCtx.destination);
          o.type = 'sine'; o.frequency.value = f;
          gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
          o.start(); o.stop(audioCtx.currentTime + 0.22);
        }, i * 110);
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

    function isArrow(r, c) {
      return currentPuzzle.arrows.some(a => a.r === r && a.c === c);
    }

    function initPuzzle() {
      cellState = Array.from({length:ROWS}, () => new Array(COLS).fill(0));
      connections = Array.from({length:ROWS}, () =>
        Array.from({length:COLS}, () => ({N:false, S:false, E:false, W:false}))
      );
      edgeAnims = [];
      solved = false; timer = 0; timerActive = false; dragFrom = null;
      showSolution = false;
    }

    function applySolution() {
      // Reset state
      cellState = Array.from({length:ROWS}, () => new Array(COLS).fill(0));
      connections = Array.from({length:ROWS}, () =>
        Array.from({length:COLS}, () => ({N:false, S:false, E:false, W:false}))
      );
      edgeAnims = [];

      // Apply black cells
      for (const {r, c} of currentPuzzle.blacks) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) cellState[r][c] = 1;
      }

      // Apply loop connections from loopCells
      const lc = currentPuzzle.loopCells;
      const L = lc.length;
      for (let i = 0; i < L; i++) {
        const [r1, c1] = lc[i];
        const [r2, c2] = lc[(i + 1) % L];
        if (r1 < 0||r1>=ROWS||c1<0||c1>=COLS||r2<0||r2>=ROWS||c2<0||c2>=COLS) continue;
        const dr = r2 - r1, dc = c2 - c1;
        let dir1, dir2;
        if (dr === -1) { dir1='N'; dir2='S'; }
        else if (dr === 1) { dir1='S'; dir2='N'; }
        else if (dc === -1) { dir1='W'; dir2='E'; }
        else { dir1='E'; dir2='W'; }
        connections[r1][c1][dir1] = true;
        connections[r2][c2][dir2] = true;
      }
    }

    function connCount(r, c) {
      const cn = connections[r][c];
      return (cn.N?1:0)+(cn.S?1:0)+(cn.E?1:0)+(cn.W?1:0);
    }

    function arrowCount(arrow) {
      const {r, c, dir} = arrow;
      let cnt = 0;
      if (dir === 'right') for (let cc = c+1; cc < COLS; cc++) if (cellState[r][cc] === 1) cnt++;
      if (dir === 'left')  for (let cc = c-1; cc >= 0; cc--) if (cellState[r][cc] === 1) cnt++;
      if (dir === 'down')  for (let rr = r+1; rr < ROWS; rr++) if (cellState[rr][c] === 1) cnt++;
      if (dir === 'up')    for (let rr = r-1; rr >= 0; rr--) if (cellState[rr][c] === 1) cnt++;
      return cnt;
    }

    function isArrowConflict(arrow) {
      return arrowCount(arrow) > arrow.n;
    }

    function isArrowSatisfied(arrow) {
      return arrowCount(arrow) === arrow.n;
    }

    function hasAdjacentBlacks() {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (cellState[r][c] === 1) {
            if (r < ROWS-1 && cellState[r+1][c] === 1) return true;
            if (c < COLS-1 && cellState[r][c+1] === 1) return true;
          }
        }
      }
      return false;
    }

    function isSingleLoop() {
      const visited = Array.from({length:ROWS}, () => new Array(COLS).fill(false));
      let start = null, total = 0;
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
          if (!visited[nb.r][nb.c]) { visited[nb.r][nb.c] = true; count++; queue.push(nb); }
        }
      }
      return count === total;
    }

    function loopCoversAllNonBlackNonArrow() {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (isArrow(r, c)) continue;
          if (cellState[r][c] === 1) continue;
          if (connCount(r, c) !== 2) return false;
        }
      }
      return true;
    }

    function validateAll() {
      if (hasAdjacentBlacks()) return false;
      for (const arrow of currentPuzzle.arrows) if (!isArrowSatisfied(arrow)) return false;
      if (!isSingleLoop()) return false;
      if (!loopCoversAllNonBlackNonArrow()) return false;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (isArrow(r, c) || cellState[r][c] === 1) {
            if (connCount(r, c) > 0) return false;
          }
        }
      }
      return true;
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    }

    function drawArrow(x, y, dir, sz) {
      g.save();
      g.translate(x, y);
      if (dir === 'right') g.rotate(0);
      else if (dir === 'down') g.rotate(Math.PI / 2);
      else if (dir === 'left') g.rotate(Math.PI);
      else g.rotate(-Math.PI / 2);
      g.beginPath();
      g.moveTo(sz * 0.5, 0);
      g.lineTo(-sz * 0.3, -sz * 0.3);
      g.lineTo(-sz * 0.1, 0);
      g.lineTo(-sz * 0.3, sz * 0.3);
      g.closePath();
      g.fill();
      g.restore();
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
      g.fillText('YAJILIN', cx, cy2 + 40);

      const rules = [
        '· Arrow cells show how many blacks lie ahead',
        '· Arrow cells are never black or in the loop',
        '· Black cells cannot touch each other',
        '· Draw a loop through ALL other cells',
        '· Short tap = toggle black | Drag = draw loop',
      ];
      g.fillStyle = '#ccd6f6';
      g.font = `14px -apple-system, sans-serif`;
      g.textAlign = 'left';
      rules.forEach((r, i) => g.fillText(r, cx2 + 20, cy2 + 86 + i * 38));

      if (bestTime > 0) {
        g.fillStyle = '#f72585';
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
      g.fillStyle='rgba(0,0,0,0.72)'; g.fillRect(0,0,W,USABLE_H);
      const cx=W/2, cy=USABLE_H/2;
      g.shadowColor=ACCENT; g.shadowBlur=32;
      g.fillStyle=ACCENT;
      g.font=`bold 36px -apple-system,sans-serif`;
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText('SOLVED!', cx, cy-36);
      g.shadowBlur=0;
      g.fillStyle='#ccd6f6'; g.font=`20px -apple-system,sans-serif`;
      g.fillText(formatTime(solveTime), cx, cy+10);
      if (bestTime>0 && solveTime===bestTime) {
        g.fillStyle='#FFD700'; g.font=`bold 16px -apple-system,sans-serif`;
        g.fillText('NEW BEST!', cx, cy+42);
      }
      g.fillStyle=ACCENT; g.font=`bold 17px -apple-system,sans-serif`;
      g.fillText('TAP TO PLAY AGAIN', cx, cy+82);
    }

    function drawHUD() {
      g.fillStyle='#ccd6f6'; g.font=`bold 18px -apple-system,sans-serif`;
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText(timerActive?formatTime(timer):'0:00', W/2, 32);
      g.fillStyle=ACCENT; g.font=`bold 13px -apple-system,sans-serif`;
      g.textAlign='left'; g.fillText('YAJILIN', 16, 32);
      if (bestTime>0) {
        g.fillStyle='#f72585'; g.font=`12px -apple-system,sans-serif`;
        g.textAlign='right'; g.fillText(`Best ${formatTime(bestTime)}`, W-50, 32);
      }
    }

    function drawGrid() {
      const p = currentPuzzle;

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const {x, y} = cellCenter(r, c);
          const cx2 = GRID_X + c * CELL, cy2 = GRID_Y + r * CELL;

          if (isArrow(r, c)) {
            g.fillStyle = '#1a1a2e';
            g.fillRect(cx2+1, cy2+1, CELL-2, CELL-2);
          } else if (cellState[r][c] === 1) {
            const adj = (r>0&&cellState[r-1][c]===1)||(r<ROWS-1&&cellState[r+1][c]===1)||
                        (c>0&&cellState[r][c-1]===1)||(c<COLS-1&&cellState[r][c+1]===1);
            g.fillStyle = adj ? ERROR_COL : '#1e1e3a';
            g.fillRect(cx2+2, cy2+2, CELL-4, CELL-4);
            g.fillStyle = adj ? 'rgba(255,77,109,0.2)' : 'rgba(199,125,255,0.06)';
            g.fillRect(cx2+4, cy2+4, CELL-8, CELL-8);
          } else {
            g.fillStyle = '#141420';
            g.fillRect(cx2+1, cy2+1, CELL-2, CELL-2);
          }
        }
      }

      g.strokeStyle='rgba(255,255,255,0.07)'; g.lineWidth=1;
      for (let r=0;r<=ROWS;r++) {
        g.beginPath(); g.moveTo(GRID_X,GRID_Y+r*CELL); g.lineTo(GRID_X+COLS*CELL,GRID_Y+r*CELL); g.stroke();
      }
      for (let c=0;c<=COLS;c++) {
        g.beginPath(); g.moveTo(GRID_X+c*CELL,GRID_Y); g.lineTo(GRID_X+c*CELL,GRID_Y+ROWS*CELL); g.stroke();
      }

      for (const arrow of p.arrows) {
        const {r,c,dir,n} = arrow;
        const {x,y} = cellCenter(r,c);
        const conflict = isArrowConflict(arrow);
        g.fillStyle = conflict ? ERROR_COL : ACCENT;
        drawArrow(x+2, y, dir, CELL*0.22);
        g.font = `bold ${Math.floor(CELL*0.3)}px -apple-system,sans-serif`;
        g.textAlign='center'; g.textBaseline='middle';
        g.fillStyle = conflict ? ERROR_COL : '#ccd6f6';
        let nx = x, ny = y;
        if (dir==='right') nx = x - CELL*0.22;
        else if (dir==='left') nx = x + CELL*0.22;
        else if (dir==='down') ny = y - CELL*0.22;
        else ny = y + CELL*0.22;
        g.fillText(String(n), nx, ny);
      }

      const glowAmt = solved ? solveGlow : 0;
      g.lineCap='round'; g.lineWidth=4; g.strokeStyle=ACCENT;
      if (glowAmt>0) { g.shadowColor=ACCENT; g.shadowBlur=glowAmt; }

      for (let r=0;r<ROWS;r++) {
        for (let c=0;c<COLS;c++) {
          const cn = connections[r][c];
          const {x,y} = cellCenter(r,c);
          if (cn.E && c<COLS-1) {
            const {x:x2} = cellCenter(r,c+1);
            const anim = edgeAnims.find(a=>a.r1===r&&a.c1===c&&a.r2===r&&a.c2===c+1);
            const prog = anim ? Math.min(1,anim.t/anim.maxT) : 1;
            g.beginPath(); g.moveTo(x,y); g.lineTo(x+(x2-x)*prog,y); g.stroke();
          }
          if (cn.S && r<ROWS-1) {
            const {y:y2} = cellCenter(r+1,c);
            const anim = edgeAnims.find(a=>a.r1===r&&a.c1===c&&a.r2===r+1&&a.c2===c);
            const prog = anim ? Math.min(1,anim.t/anim.maxT) : 1;
            g.beginPath(); g.moveTo(x,y); g.lineTo(x,y+(y2-y)*prog); g.stroke();
          }
        }
      }
      g.shadowBlur=0;
    }

    let tapCell = null;
    let tapTime = 0;

    ctx.raf((dt) => {
      g.fillStyle=BG; g.fillRect(0,0,W,H);
      if (timerActive && !solved) timer += dt;
      edgeAnims = edgeAnims.filter(a => { a.t+=dt; return a.t<a.maxT*2; });
      if (solved) {
        solveGlow += dt*0.05*solveGlowDir;
        if (solveGlow>24) solveGlowDir=-1;
        if (solveGlow<0) { solveGlow=0; solveGlowDir=1; }
      }
      drawHUD(); drawGrid();
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
      e.preventDefault(); ensureAudio();
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
      if (cell) {
        tapCell = cell;
        tapTime = Date.now();
        if (!isArrow(cell.r, cell.c) && cellState[cell.r][cell.c] !== 2) {
          dragFrom = cell;
        }
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (solved||!dragFrom) return;
      const t = e.changedTouches[0];
      const cell = hitCell(t.clientX, t.clientY);
      if (!cell) return;
      if (cell.r===dragFrom.r && cell.c===dragFrom.c) return;
      const dr=Math.abs(cell.r-dragFrom.r), dc=Math.abs(cell.c-dragFrom.c);
      if (dr+dc!==1) { dragFrom=cell; return; }

      if (isArrow(cell.r,cell.c)||cellState[cell.r][cell.c]===1) {
        playBuzz(); dragFrom=cell; return;
      }
      if (isArrow(dragFrom.r,dragFrom.c)||cellState[dragFrom.r][dragFrom.c]===1) {
        dragFrom=cell; return;
      }

      const cnt1=connCount(dragFrom.r,dragFrom.c);
      const cnt2=connCount(cell.r,cell.c);
      const cn1=connections[dragFrom.r][dragFrom.c];
      const cn2=connections[cell.r][cell.c];
      let dir1,dir2;
      if (cell.r<dragFrom.r){dir1='N';dir2='S';}
      else if(cell.r>dragFrom.r){dir1='S';dir2='N';}
      else if(cell.c<dragFrom.c){dir1='W';dir2='E';}
      else{dir1='E';dir2='W';}

      tapCell = null;

      if (cn1[dir1]) {
        cn1[dir1]=false; cn2[dir2]=false; playClick();
      } else if (cnt1<2 && cnt2<2) {
        cn1[dir1]=true; cn2[dir2]=true;
        edgeAnims.push({r1:dragFrom.r,c1:dragFrom.c,r2:cell.r,c2:cell.c,t:0,maxT:80});
        playClick();
        if (!gameStarted) { gameStarted = true; ctx.platform.start(); }
        if (!timerActive) timerActive=true;
        if (validateAll()) {
          solved=true; timerActive=false; solveTime=timer;
          if (!bestTime||timer<bestTime) { bestTime=timer; ctx.storage.set(BT_KEY,bestTime); }
          ctx.platform.setScore(Math.floor(300000/Math.max(timer,1000)));
          ctx.platform.complete({score:Math.floor(300000/Math.max(timer,1000)),durationMs:timer});
          playArpeggio();
        }
      } else {
        playBuzz();
      }
      dragFrom=cell;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (solved) { dragFrom=null; tapCell=null; return; }
      const elapsed = Date.now() - tapTime;
      if (tapCell && elapsed < 250) {
        const {r,c} = tapCell;
        if (!isArrow(r,c)) {
          if (connCount(r,c)===0) {
            if (!gameStarted) { gameStarted = true; ctx.platform.start(); }
            cellState[r][c] = cellState[r][c]===1 ? 0 : 1;
            playClick();
            if (!timerActive) timerActive=true;
          }
        }
      }
      dragFrom=null; tapCell=null;
    }, { passive: false });

    initPuzzle();
    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
