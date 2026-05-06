window.plethoraBit = {
  meta: {
    title: 'Hidato',
    author: 'plethora',
    description: 'Fill 1–36 in a connected path through the grid.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#26A69A';
    const ACCENT_DIM = '#1a7a74';
    const BG = '#0f0f14';
    const CELL_BG = '#1a1a26';
    const BLOCKED_BG = '#111118';
    const GIVEN_BG = '#1e2e2c';
    const SELECTED_BG = '#2a3f3d';

    const GRID_ROWS = 6;
    const GRID_COLS = 6;
    const HUD_H = 48;
    const NUMPAD_H = 80;

    // ── Procedural generator ──────────────────────────────────────────────────
    function generatePuzzle(N = 6) {
      const sol = Array.from({length:N}, () => Array(N).fill(0));
      const pos = Array(N*N+1);
      const mode = Math.floor(Math.random() * 8);
      function transform(r, c) {
        switch (mode) {
          case 1: return [c, N - 1 - r];
          case 2: return [N - 1 - r, N - 1 - c];
          case 3: return [N - 1 - c, r];
          case 4: return [r, N - 1 - c];
          case 5: return [N - 1 - r, c];
          case 6: return [c, r];
          case 7: return [N - 1 - c, N - 1 - r];
          default: return [r, c];
        }
      }

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const snakeC = r % 2 === 0 ? c : N - 1 - c;
          const k = r * N + c + 1;
          const [tr, tc] = transform(r, snakeC);
          sol[tr][tc] = k;
          pos[k] = [tr, tc];
        }
      }

      // Show ~25% of numbers as clues, always show 1 and N*N
      const given = Array.from({length:N}, () => Array(N).fill(0));
      for (let k = 1; k <= N*N; k++) {
        if (k === 1 || k === N*N || Math.random() < 0.25) {
          const [r, c] = pos[k];
          given[r][c] = k;
        }
      }

      // Build clues array as [[r,c], ...] for cells that are given
      const clues = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (given[r][c] > 0) clues.push([r, c]);
      }

      return { solution: sol, given, clues, blocked: [] };
    }

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    // See-solution button
    let showSolution = false;
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let puzzle = null;
    let userGrid = null;
    let selectedCell = null;
    let selectedNum = null;
    let gameStarted = false;
    let startTime = 0;
    let solveTime = 0;
    let solved = false;
    let solvedAt = 0;
    let audioCtx = null;
    let voices = [];
    let numPage = 0;

    function initPuzzle() {
      puzzle = generatePuzzle(GRID_ROWS);
      userGrid = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(0));
      for (const [r, c] of puzzle.clues) {
        userGrid[r][c] = puzzle.solution[r][c];
      }
      selectedCell = null;
      selectedNum = null;
      gameStarted = false;
      startTime = 0;
      solveTime = 0;
      solved = false;
      solvedAt = 0;
      numPage = 0;
      showSolution = false;
    }

    function isBlocked(r, c) {
      return puzzle.blocked.some(([br, bc]) => br === r && bc === c);
    }

    function isClue(r, c) {
      return puzzle.clues.some(([cr, cc]) => cr === r && cc === c);
    }

    function getLayout() {
      const availH = USABLE_H - HUD_H - NUMPAD_H - 16;
      const availW = W - 24;
      const cellByW = Math.floor(availW / GRID_COLS);
      const cellByH = Math.floor(availH / GRID_ROWS);
      const CELL = Math.min(cellByW, cellByH, 58);
      const gridW = CELL * GRID_COLS;
      const gridH = CELL * GRID_ROWS;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + 8 + Math.floor((availH - gridH) / 2);
      return { CELL, gridW, gridH, ox, oy };
    }

    function cellAt(x, y, layout) {
      const { CELL, ox, oy } = layout;
      const gx = x - ox;
      const gy = y - oy;
      if (gx < 0 || gy < 0) return null;
      const c = Math.floor(gx / CELL);
      const r = Math.floor(gy / CELL);
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return null;
      if (isBlocked(r, c)) return null;
      return { r, c };
    }

    function isAdjacent(r1, c1, r2, c2) {
      return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && !(r1 === r2 && c1 === c2);
    }

    function findCellWithNum(num) {
      for (let r = 0; r < GRID_ROWS; r++)
        for (let c = 0; c < GRID_COLS; c++)
          if (userGrid[r][c] === num) return { r, c };
      return null;
    }

    function getValidNextCells() {
      if (!selectedCell) return [];
      const val = userGrid[selectedCell.r][selectedCell.c];
      if (!val) return [];
      const neighbors = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = selectedCell.r + dr, nc = selectedCell.c + dc;
          if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS && !isBlocked(nr, nc))
            neighbors.push({ r: nr, c: nc });
        }
      return neighbors;
    }

    function checkSolved() {
      const maxN = GRID_ROWS * GRID_COLS - puzzle.blocked.length;
      const placed = new Map();
      for (let r = 0; r < GRID_ROWS; r++)
        for (let c = 0; c < GRID_COLS; c++) {
          if (isBlocked(r, c)) continue;
          if (userGrid[r][c] === 0) return false;
          placed.set(userGrid[r][c], { r, c });
        }
      for (let n = 1; n < maxN; n++) {
        const a = placed.get(n), b = placed.get(n + 1);
        if (!a || !b) return false;
        if (!isAdjacent(a.r, a.c, b.r, b.c)) return false;
      }
      return true;
    }

    function placeNumber(r, c, num) {
      if (isClue(r, c)) return;
      if (isBlocked(r, c)) return;
      for (let rr = 0; rr < GRID_ROWS; rr++)
        for (let cc = 0; cc < GRID_COLS; cc++)
          if (!isClue(rr, cc) && userGrid[rr][cc] === num) userGrid[rr][cc] = 0;
      userGrid[r][c] = num;
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq, dur = 0.1, vol = 0.12) {
      if (!audioCtx) return;
      if (voices.length >= 8) voices.shift();
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = freq;
      o.type = 'sine';
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
    }

    function playPlace() { playNote(660, 0.08, 0.1); }
    function playError() { playNote(220, 0.12, 0.1); }
    function playSolve() {
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((f, i) => { ctx.timeout(() => playNote(f, 0.5, 0.15), i * 80); });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    function drawRoundRect(g2, x, y, w, h, r2) {
      g2.beginPath();
      if (g2.roundRect) {
        g2.roundRect(x, y, w, h, r2);
      } else {
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
      const { CELL, gridW, gridH, ox, oy } = layout;

      // HUD
      g.fillStyle = '#ffffff12';
      g.fillRect(0, 0, W, HUD_H);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('HIDATO', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Chain path lines
      const positions = {};
      for (let r = 0; r < GRID_ROWS; r++)
        for (let c = 0; c < GRID_COLS; c++)
          if (userGrid[r][c] > 0) positions[userGrid[r][c]] = { r, c };

      const maxN = GRID_ROWS * GRID_COLS - puzzle.blocked.length;
      g.save();
      g.strokeStyle = ACCENT + '66';
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      for (let n = 1; n < maxN; n++) {
        const a = positions[n], b = positions[n + 1];
        if (!a || !b) continue;
        const ax = ox + a.c * CELL + CELL / 2;
        const ay = oy + a.r * CELL + CELL / 2;
        const bx = ox + b.c * CELL + CELL / 2;
        const by = oy + b.r * CELL + CELL / 2;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
      g.restore();

      // Highlighted adjacent cells
      const highlighted = getValidNextCells();
      for (const { r, c } of highlighted) {
        const cx = ox + c * CELL;
        const cy = oy + r * CELL;
        g.save();
        g.globalAlpha = 0.25;
        drawRoundRect(g, cx + 2, cy + 2, CELL - 4, CELL - 4, 8);
        g.fillStyle = ACCENT;
        g.fill();
        g.restore();
      }

      // Grid cells
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const val = userGrid[r][c];
          const blocked = isBlocked(r, c);
          const clue = isClue(r, c);
          const isSelected = selectedCell && selectedCell.r === r && selectedCell.c === c;

          drawRoundRect(g, cx + 2, cy + 2, CELL - 4, CELL - 4, 8);
          if (blocked) {
            g.fillStyle = BLOCKED_BG;
            g.fill();
            g.strokeStyle = '#ffffff08';
            g.lineWidth = 1;
            g.stroke();
          } else if (isSelected) {
            g.fillStyle = SELECTED_BG;
            g.fill();
            g.strokeStyle = ACCENT;
            g.lineWidth = 2;
            g.stroke();
          } else if (clue && val > 0) {
            g.fillStyle = GIVEN_BG;
            g.fill();
            g.strokeStyle = ACCENT_DIM;
            g.lineWidth = 1.5;
            g.stroke();
          } else {
            g.fillStyle = CELL_BG;
            g.fill();
            g.strokeStyle = '#ffffff12';
            g.lineWidth = 1;
            g.stroke();
          }

          if (!blocked && val > 0) {
            const isEndpoint = val === 1 || val === maxN;
            g.font = `${clue ? 'bold' : ''} ${Math.floor(CELL * 0.38)}px -apple-system, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            if (isEndpoint) {
              g.fillStyle = '#ffffff';
              g.shadowColor = ACCENT;
              g.shadowBlur = 10;
            } else if (clue) {
              g.fillStyle = ACCENT;
              g.shadowBlur = 0;
            } else {
              g.fillStyle = '#cce8e6';
              g.shadowBlur = 0;
            }
            g.fillText(String(val), cx + CELL / 2, cy + CELL / 2);
            g.shadowBlur = 0;
          }
        }
      }

      // Grid border
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 1;
      g.strokeRect(ox, oy, gridW, gridH);

      // Numpad — two pages: 1-18, 19-36
      const NUMPAD_Y = oy + gridH + 12;
      const numsPerPage = 18;
      const numsBtnW = Math.floor((W - 24) / 9);
      const numsBtnH = Math.floor((USABLE_H - NUMPAD_Y - 4) / 2);
      const npStartX = 12;

      for (let i = 0; i < numsPerPage; i++) {
        const num = numPage * numsPerPage + i + 1;
        if (num > maxN) break;
        const row = Math.floor(i / 9);
        const col = i % 9;
        const nx = npStartX + col * numsBtnW;
        const ny = NUMPAD_Y + row * numsBtnH;
        const placed = findCellWithNum(num);
        const isGivenBtn = placed && isClue(placed.r, placed.c);

        drawRoundRect(g, nx + 1, ny + 1, numsBtnW - 2, numsBtnH - 2, 6);
        if (selectedNum === num) {
          g.fillStyle = ACCENT;
          g.fill();
        } else if (placed) {
          g.fillStyle = isGivenBtn ? GIVEN_BG : '#1a2e2c';
          g.fill();
        } else {
          g.fillStyle = '#1a1a26';
          g.fill();
        }

        g.font = `bold ${Math.floor(numsBtnH * 0.48)}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = selectedNum === num ? '#000' : (placed ? ACCENT : '#666688');
        g.fillText(String(num), nx + numsBtnW / 2, ny + numsBtnH / 2);
      }

      // Page toggle
      const arrowY = NUMPAD_Y + numsBtnH;
      if (NUMPAD_Y + numsBtnH * 2 < USABLE_H - 4) {
        g.fillStyle = numPage === 0 ? ACCENT : '#444466';
        g.fillRect(npStartX, arrowY + numsBtnH + 2, (W - 24) / 2 - 4, 4);
        g.fillStyle = numPage === 1 ? ACCENT : '#444466';
        g.fillRect(npStartX + (W - 24) / 2 + 4, arrowY + numsBtnH + 2, (W - 24) / 2 - 4, 4);
      }

      const best = ctx.storage.get('bt_hidato');
      if (best && !gameStarted) {
        g.font = '11px -apple-system, sans-serif';
        g.fillStyle = '#ffffff44';
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H - 4);
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

      // See-solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI*2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
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

      // Info panel
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.88);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.78), 480);
        const cy2 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        drawRoundRect(g, cx2, cy2, cw, ch, 16);
        g.fill();
        g.save(); g.globalAlpha = 0.12; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 50, 70, 0, Math.PI * 2); g.fill();
        g.restore();
        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('HIDATO', W / 2, cy2 + 52);
        const lx = cx2 + 20;
        let ty = cy2 + 74;
        const lh = 24;
        g.font = 'bold 10px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• Fill every open cell with numbers 1 to 36',
          '• Each number must be adjacent (including diagonal)',
          '  to the next number in sequence',
          '• Teal cells are pre-given clues — do not change',
          '• Teal lines show your current connected path',
          '• Tap ? to reveal the full solution',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh - 2; }
        ty += 6;
        g.font = 'bold 10px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        const controls = [
          'Tap a cell → select it',
          'Tap a number in pad → place it in selected cell',
          'Swipe left/right on numpad → page 1-18 / 19-36',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of controls) { g.fillText(line, lx, ty); ty += lh - 2; }
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 18);
      }

      // Solved overlay
      if (solved) {
        const fadeT = Math.min((now - solvedAt) / 600, 1);
        g.globalAlpha = fadeT;
        g.fillStyle = 'rgba(15,15,20,0.9)';
        g.fillRect(0, 0, W, USABLE_H);
        g.globalAlpha = 1;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 40px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.shadowColor = ACCENT; g.shadowBlur = 30;
        g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 70);
        g.shadowBlur = 0;
        g.font = '18px -apple-system, sans-serif';
        g.fillStyle = '#ffffff99';
        g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 20);
        const best2 = ctx.storage.get('bt_hidato');
        g.fillText(`Best: ${formatTime(best2)}`, W / 2, USABLE_H / 2 + 16);
        drawRoundRect(g, W / 2 - 110, USABLE_H / 2 + 52, 220, 50, 12);
        g.fillStyle = ACCENT + '22';
        g.fill();
        drawRoundRect(g, W / 2 - 110, USABLE_H / 2 + 52, 220, 50, 12);
        g.strokeStyle = ACCENT; g.lineWidth = 1.5;
        g.stroke();
        g.font = 'bold 16px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.fillText('NEW PUZZLE', W / 2, USABLE_H / 2 + 77);
      }
    });

    let numpadSwipeStartX = null;

    function numpadNumAt(x, y) {
      const layout = getLayout();
      const { gridH, oy } = layout;
      const maxN = GRID_ROWS * GRID_COLS - puzzle.blocked.length;
      const NUMPAD_Y = oy + gridH + 12;
      const numsPerPage = 18;
      const numsBtnW = Math.floor((W - 24) / 9);
      const numsBtnH = Math.floor((USABLE_H - NUMPAD_Y - 4) / 2);
      const npStartX = 12;
      const relY = y - NUMPAD_Y;
      const relX = x - npStartX;
      if (relX < 0 || relX >= numsBtnW * 9) return null;
      if (relY < 0 || relY >= numsBtnH * 2) return null;
      const row = Math.floor(relY / numsBtnH);
      const col = Math.floor(relX / numsBtnW);
      const i = row * 9 + col;
      const num = numPage * numsPerPage + i + 1;
      if (num < 1 || num > maxN) return null;
      return num;
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

      // See-solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        for (let r = 0; r < GRID_ROWS; r++)
          for (let c = 0; c < GRID_COLS; c++)
            if (!isBlocked(r, c) && !isClue(r, c)) userGrid[r][c] = puzzle.solution[r][c];
        if (!solved) {
          solved = true;
          solvedAt = performance.now();
          solveTime = gameStarted ? performance.now() - startTime : 0;
          const best = ctx.storage.get('bt_hidato') || 0;
          if (!best || (solveTime > 0 && solveTime < best)) ctx.storage.set('bt_hidato', solveTime);
          ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
          playSolve();
        }
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved) {
        initPuzzle();
        return;
      }

      const layout = getLayout();
      const cell = cellAt(tx, ty, layout);

      if (cell) {
        if (!gameStarted) {
          ctx.platform.start();
          gameStarted = true;
          startTime = performance.now();
        }
        ctx.platform.interact({ type: 'tap' });
        ctx.platform.haptic('light');

        if (selectedNum !== null) {
          if (!isClue(cell.r, cell.c)) {
            placeNumber(cell.r, cell.c, selectedNum);
            playPlace();
            selectedCell = cell;
            selectedNum = null;
            if (checkSolved()) {
              solved = true;
              solvedAt = performance.now();
              solveTime = performance.now() - startTime;
              const best = ctx.storage.get('bt_hidato') || 0;
              if (!best || solveTime < best) ctx.storage.set('bt_hidato', solveTime);
              ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
              playSolve();
            }
          }
        } else {
          if (selectedCell && selectedCell.r === cell.r && selectedCell.c === cell.c) {
            selectedCell = null;
          } else {
            selectedCell = cell;
          }
        }
        numpadSwipeStartX = null;
        return;
      }

      const num = numpadNumAt(tx, ty);
      if (num !== null) {
        if (!gameStarted) {
          ctx.platform.start();
          gameStarted = true;
          startTime = performance.now();
        }
        ctx.platform.interact({ type: 'tap' });
        ctx.platform.haptic('light');

        if (selectedCell) {
          if (!isClue(selectedCell.r, selectedCell.c)) {
            placeNumber(selectedCell.r, selectedCell.c, num);
            playPlace();
            if (checkSolved()) {
              solved = true;
              solvedAt = performance.now();
              solveTime = performance.now() - startTime;
              const best = ctx.storage.get('bt_hidato') || 0;
              if (!best || solveTime < best) ctx.storage.set('bt_hidato', solveTime);
              ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
              playSolve();
            }
          }
        } else {
          selectedNum = selectedNum === num ? null : num;
        }
        numpadSwipeStartX = tx;
        return;
      }

      numpadSwipeStartX = tx;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      const tx = e.changedTouches[0].clientX;
      if (numpadSwipeStartX !== null) {
        const dx = tx - numpadSwipeStartX;
        if (Math.abs(dx) > 40) {
          numPage = dx < 0 ? 1 : 0;
          numpadSwipeStartX = null;
        }
      }
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
