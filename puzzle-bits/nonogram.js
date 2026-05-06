window.plethoraBit = {
  meta: {
    title: 'Picross',
    author: 'plethora',
    description: 'Shade cells to reveal the hidden picture.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#64FFDA';
    const BG = '#0f0f14';
    const CELL_EMPTY = '#1a1a26';
    const CELL_FILLED = ACCENT;
    const CELL_CROSSED = '#2a2a3a';

    const N = 10;

    function generatePuzzle() {
      // Generate random solution grid (~40% filled)
      const sol = Array.from({length: N}, () =>
        Array.from({length: N}, () => Math.random() < 0.4 ? 1 : 0)
      );
      function clues(line) {
        const runs = []; let c = 0;
        for (const v of line) { if (v) c++; else { if (c) { runs.push(c); c = 0; } } }
        if (c) runs.push(c);
        return runs.length ? runs : [0];
      }
      const rowClues = sol.map(row => clues(row));
      const colClues = Array.from({length: N}, (_, c) => clues(sol.map(r => r[c])));
      return { solution: sol, rowClues, colClues };
    }

    function computeClues(grid) {
      const rowClues = [], colClues = [];
      for (let r = 0; r < N; r++) {
        const clue = [];
        let run = 0;
        for (let c = 0; c < N; c++) {
          if (grid[r][c]) run++;
          else { if (run) { clue.push(run); run = 0; } }
        }
        if (run) clue.push(run);
        rowClues.push(clue.length ? clue : [0]);
      }
      for (let c = 0; c < N; c++) {
        const clue = [];
        let run = 0;
        for (let r = 0; r < N; r++) {
          if (grid[r][c]) run++;
          else { if (run) { clue.push(run); run = 0; } }
        }
        if (run) clue.push(run);
        colClues.push(clue.length ? clue : [0]);
      }
      return { rowClues, colClues };
    }

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    // Eye/solution button
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let currentPuzzle = generatePuzzle();
    let state = null;
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let gameOver = false;
    let audioCtx = null;
    let rippleAnim = null;
    let cellAnims = {};
    let longPressTimer = null;
    let dragFillMode = null;
    let lastDragCell = null;
    let touchStartCell = null;
    let touchStartTime = 0;
    let showSolution = false;

    function initPuzzle() {
      currentPuzzle = generatePuzzle();
      state = {
        rowClues: currentPuzzle.rowClues,
        colClues: currentPuzzle.colClues,
        cells: Array.from({ length: N }, () => Array(N).fill(0)), // 0=empty,1=filled,2=crossed
      };
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      gameOver = false;
      rippleAnim = null;
      cellAnims = {};
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 56;
      const maxRowClueLen = Math.max(...state.rowClues.map(c => c.length));
      const maxColClueLen = Math.max(...state.colClues.map(c => c.length));
      const availW = W - 24;
      const availH = USABLE_H - HUD_H - 16;
      const totalCols = N + maxRowClueLen;
      const totalRows = N + maxColClueLen;
      const cellByW = Math.floor(availW / totalCols);
      const cellByH = Math.floor(availH / totalRows);
      const CELL = Math.min(cellByW, cellByH, 34);
      const clueW = CELL * maxRowClueLen;
      const clueH = CELL * maxColClueLen;
      const gridW = CELL * N;
      const gridH = CELL * N;
      const totalW = clueW + gridW;
      const totalH = clueH + gridH;
      const ox = Math.floor((W - totalW) / 2);
      const oy = HUD_H + Math.floor((availH - totalH) / 2);
      return { CELL, clueW, clueH, gridW, gridH, ox, oy, maxRowClueLen, maxColClueLen };
    }

    function cellAt(x, y, layout) {
      const { CELL, clueW, clueH, ox, oy } = layout;
      const gx = x - (ox + clueW);
      const gy = y - (oy + clueH);
      if (gx < 0 || gy < 0) return null;
      const c = Math.floor(gx / CELL);
      const r = Math.floor(gy / CELL);
      if (r < 0 || r >= N || c < 0 || c >= N) return null;
      return { r, c };
    }

    function animCell(r, c) {
      cellAnims[`${r},${c}`] = { start: performance.now(), from: 0.6, to: 1.0 };
    }

    function easeOutBack(t) {
      const s = 1.70158;
      return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
    }

    function getCellScale(r, c, now) {
      const key = `${r},${c}`;
      const a = cellAnims[key];
      if (!a) return 1;
      const t = Math.min((now - a.start) / 120, 1);
      if (t >= 1) { delete cellAnims[key]; return 1; }
      return a.from + (a.to - a.from) * easeOutBack(t);
    }

    function checkSolved() {
      const sol = currentPuzzle.solution;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const want = sol[r][c];
          const have = state.cells[r][c] === 1 ? 1 : 0;
          if (want !== have) return false;
        }
      return true;
    }

    function triggerSolve(now) {
      solved = true;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_picross') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_picross', solveTime);
      ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
      const cells = [];
      for (let d = 0; d < N * 2; d++) {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const dist = Math.abs(r - 4) + Math.abs(c - 4);
          if (dist === d) cells.push({ r, c, delay: d * 40 });
        }
      }
      rippleAnim = { cells, startTime: now };
      playChord();
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      o.connect(g2); g2.connect(audioCtx.destination);
      o.frequency.value = 880;
      o.type = 'sine';
      g2.gain.setValueAtTime(0.12, audioCtx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.start(); o.stop(audioCtx.currentTime + 0.08);
    }

    function playChord() {
      if (!audioCtx) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g2 = audioCtx.createGain();
        o.connect(g2); g2.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        g2.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.05);
        g2.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + i * 0.05 + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.05 + 0.6);
        o.start(audioCtx.currentTime + i * 0.05);
        o.stop(audioCtx.currentTime + i * 0.05 + 0.6);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '00')}`;
    }

    function drawRoundRect(g2, x, y, w, h, r2) {
      if (g2.roundRect) {
        g2.roundRect(x, y, w, h, r2);
      } else {
        g2.beginPath();
        g2.moveTo(x + r2, y);
        g2.lineTo(x + w - r2, y);
        g2.arcTo(x + w, y, x + w, y + r2, r2);
        g2.lineTo(x + w, y + h - r2);
        g2.arcTo(x + w, y + h, x + w - r2, y + h, r2);
        g2.lineTo(x + r2, y + h);
        g2.arcTo(x, y + h, x, y + h - r2, r2);
        g2.lineTo(x, y + r2);
        g2.arcTo(x, y, x + r2, y, r2);
        g2.closePath();
      }
    }

    initPuzzle();

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const layout = getLayout();
      const { CELL, clueW, clueH, ox, oy, maxRowClueLen, maxColClueLen } = layout;

      // HUD
      g.fillStyle = '#ffffff22';
      g.fillRect(0, 0, W, 48);
      g.font = `bold 15px -apple-system, sans-serif`;
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('PICROSS', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Draw col clues
      g.font = `bold ${Math.max(9, CELL * 0.45)}px -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let c = 0; c < N; c++) {
        const clue = state.colClues[c];
        const cx = ox + clueW + c * CELL + CELL / 2;
        const startY = oy + clueH - clue.length * CELL;
        clue.forEach((num, i) => {
          const isSatisfied = checkColClue(c, i);
          g.fillStyle = isSatisfied ? '#44664466' : '#aaaacc';
          if (num === 0) g.fillStyle = '#44444466';
          g.fillText(num === 0 ? '' : String(num), cx, startY + i * CELL + CELL / 2);
        });
      }

      // Draw row clues
      for (let r = 0; r < N; r++) {
        const clue = state.rowClues[r];
        const ry = oy + clueH + r * CELL + CELL / 2;
        const startX = ox + clueW - clue.length * CELL;
        clue.forEach((num, i) => {
          const isSatisfied = checkRowClue(r, i);
          g.fillStyle = isSatisfied ? '#44664466' : '#aaaacc';
          if (num === 0) g.fillStyle = '#44444466';
          g.textAlign = 'center';
          g.fillText(num === 0 ? '' : String(num), startX + i * CELL + CELL / 2, ry);
        });
      }

      // Draw grid cells
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx = ox + clueW + c * CELL;
          const cy = oy + clueH + r * CELL;
          const val = state.cells[r][c];
          const scale = getCellScale(r, c, now);
          const pad = CELL * (1 - scale) / 2;
          const sz = CELL - 2;

          // ripple glow
          let rippleAlpha = 0;
          if (rippleAnim) {
            const entry = rippleAnim.cells.find(e => e.r === r && e.c === c);
            if (entry) {
              const t = (now - rippleAnim.startTime - entry.delay) / 300;
              if (t > 0 && t < 1) rippleAlpha = Math.sin(t * Math.PI);
            }
          }

          g.save();
          g.translate(cx + pad, cy + 1 + pad);
          g.beginPath();
          drawRoundRect(g, 0, 0, sz * scale, sz * scale, 4);
          if (val === 1) {
            g.fillStyle = ACCENT;
            g.fill();
            if (rippleAlpha > 0) {
              g.fillStyle = `rgba(255,255,255,${rippleAlpha * 0.4})`;
              g.fill();
            }
            g.shadowColor = ACCENT;
            g.shadowBlur = 8 * scale;
            g.fill();
            g.shadowBlur = 0;
          } else if (val === 2) {
            g.fillStyle = CELL_CROSSED;
            g.fill();
            g.strokeStyle = '#ffffff55';
            g.lineWidth = 1.5;
            const m = sz * scale * 0.25;
            const s2 = sz * scale;
            g.beginPath();
            g.moveTo(m, m); g.lineTo(s2 - m, s2 - m);
            g.moveTo(s2 - m, m); g.lineTo(m, s2 - m);
            g.stroke();
          } else {
            g.fillStyle = CELL_EMPTY;
            g.fill();
            if (rippleAlpha > 0) {
              g.fillStyle = `rgba(100,255,218,${rippleAlpha * 0.15})`;
              g.fill();
            }
          }
          g.restore();

          // grid line separators every 5
          if (c % 5 === 0 && c > 0) {
            g.strokeStyle = '#ffffff22';
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(ox + clueW + c * CELL, oy + clueH);
            g.lineTo(ox + clueW + c * CELL, oy + clueH + N * CELL);
            g.stroke();
          }
        }
        if (r % 5 === 0 && r > 0) {
          g.strokeStyle = '#ffffff22';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(ox + clueW, oy + clueH + r * CELL);
          g.lineTo(ox + clueW + N * CELL, oy + clueH + r * CELL);
          g.stroke();
        }
      }

      // Grid border
      g.strokeStyle = '#ffffff33';
      g.lineWidth = 1;
      g.strokeRect(ox + clueW, oy + clueH, N * CELL, N * CELL);

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

      // Eye/solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      // Info panel
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);

        const cw = Math.floor(W * 0.82);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.72), 460);
        const cy2 = Math.floor((USABLE_H - ch) / 2);

        g.fillStyle = '#1a1a2e';
        g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch); g.fill();

        g.save(); g.globalAlpha = 0.15; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 48, 60, 0, Math.PI * 2); g.fill();
        g.restore();

        g.fillStyle = ACCENT;
        g.font = 'bold 28px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('PICROSS', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty = cy2 + 80;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Each row and column has number clues',
          '• Numbers show lengths of consecutive shaded groups',
          '• Groups must appear in order with gaps between',
          '• Shade all cells to match every clue exactly',
          '• Reveal the hidden pixel-art picture!',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;

        const controls = [
          'Tap cell → shade it',
          'Long-press → mark as empty (✕)',
          'Drag → shade multiple cells',
          '? button → reveal solution',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of controls) { g.fillText(line, lx, ty); ty += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      // Solved overlay
      if (solved && rippleAnim) {
        const elapsed2 = now - rippleAnim.startTime;
        if (elapsed2 > 800) {
          g.fillStyle = 'rgba(15,15,20,0.85)';
          g.fillRect(0, 0, W, H - SAFE);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `bold 36px -apple-system, sans-serif`;
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT;
          g.shadowBlur = 24;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = `18px -apple-system, sans-serif`;
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 16);
          const best = ctx.storage.get('bt_picross') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 16);
          g.fillStyle = ACCENT + '22';
          drawRoundRect(g, W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          g.fill();
          g.strokeStyle = ACCENT;
          g.lineWidth = 1.5;
          g.beginPath();
          drawRoundRect(g, W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          g.stroke();
          g.font = `bold 16px -apple-system, sans-serif`;
          g.fillStyle = ACCENT;
          g.fillText('TAP TO PLAY AGAIN', W / 2, USABLE_H / 2 + 74);
        }
      }
    });

    function checkRowClue(r, clueIdx) {
      const clue = state.rowClues[r];
      const row = state.cells[r].map(v => v === 1 ? 1 : 0);
      const runs = getRuns(row);
      if (runs.length !== clue.filter(x => x > 0).length) return false;
      return runs[clueIdx] === clue[clueIdx];
    }

    function checkColClue(c, clueIdx) {
      const clue = state.colClues[c];
      const col = state.cells.map(row => row[c] === 1 ? 1 : 0);
      const runs = getRuns(col);
      if (runs.length !== clue.filter(x => x > 0).length) return false;
      return runs[clueIdx] === clue[clueIdx];
    }

    function getRuns(arr) {
      const runs = [];
      let run = 0;
      for (const v of arr) {
        if (v) run++;
        else { if (run) { runs.push(run); run = 0; } }
      }
      if (run) runs.push(run);
      return runs;
    }

    function toggleCell(r, c, mode) {
      if (solved) return;
      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
      }
      if (mode === 'cross') {
        state.cells[r][c] = state.cells[r][c] === 2 ? 0 : 2;
      } else {
        state.cells[r][c] = state.cells[r][c] === 1 ? 0 : 1;
      }
      animCell(r, c);
      playTap();
      ctx.platform.interact({ type: 'tap' });
      if (checkSolved()) triggerSolve(performance.now());
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // Eye button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        // Fill player state with solution
        const sol = currentPuzzle.solution;
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++)
            state.cells[r][c] = sol[r][c] === 1 ? 1 : 0;
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved && rippleAnim && performance.now() - rippleAnim.startTime > 800) {
        initPuzzle();
        return;
      }

      const touch = e.changedTouches[0];
      const layout = getLayout();
      const cell = cellAt(touch.clientX, touch.clientY, layout);
      if (!cell) return;
      if (!gameStarted) {
        ctx.platform.start();
      }

      touchStartCell = cell;
      touchStartTime = performance.now();
      lastDragCell = cell;
      dragFillMode = null;

      longPressTimer = ctx.timeout(() => {
        if (touchStartCell) {
          dragFillMode = 'cross';
          toggleCell(touchStartCell.r, touchStartCell.c, 'cross');
          ctx.platform.haptic('medium');
          touchStartCell = null;
        }
      }, 300);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!touchStartCell && dragFillMode !== 'cross') {
        // dragging after initial tap
      }
      const touch = e.changedTouches[0];
      const layout = getLayout();
      const cell = cellAt(touch.clientX, touch.clientY, layout);
      if (!cell) return;
      if (lastDragCell && (cell.r !== lastDragCell.r || cell.c !== lastDragCell.c)) {
        if (longPressTimer) { longPressTimer = null; }
        if (dragFillMode === null) {
          dragFillMode = 'fill';
          toggleCell(touchStartCell.r, touchStartCell.c, 'fill');
          touchStartCell = null;
        }
        toggleCell(cell.r, cell.c, dragFillMode || 'fill');
        lastDragCell = cell;
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (touchStartCell) {
        toggleCell(touchStartCell.r, touchStartCell.c, 'fill');
        touchStartCell = null;
      }
      dragFillMode = null;
      lastDragCell = null;
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
