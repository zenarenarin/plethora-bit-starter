window.plethoraBit = {
  meta: {
    title: 'Sudoku X',
    author: 'plethora',
    description: 'Sudoku where both diagonals must also contain 1-9.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#7E57C2';
    const BG = '#0f0f14';
    const DIAG_TINT = 'rgba(126,87,194,0.13)';
    const DIAG_TINT_SEL = 'rgba(126,87,194,0.28)';
    const CELL_BG = '#1a1a26';
    const SEL_BG = 'rgba(126,87,194,0.35)';
    const HIGHLIGHT_BG = 'rgba(126,87,194,0.12)';
    const CONFLICT_COLOR = '#EF5350';
    const GIVEN_COLOR = '#e0e0ff';
    const PLAYER_COLOR = ACCENT;

    const N = 9;

    // ── Procedural generator with diagonal constraints ────────────────────────
    function generatePuzzle() {
      const sol = Array.from({length:N}, () => Array(N).fill(0));
      function possible(r, c, n) {
        for (let i = 0; i < N; i++) if (sol[r][i] === n || sol[i][c] === n) return false;
        const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (sol[br+i][bc+j] === n) return false;
        // main diagonal
        if (r === c) for (let i = 0; i < N; i++) if (i !== r && sol[i][i] === n) return false;
        // anti-diagonal
        if (r + c === N - 1) for (let i = 0; i < N; i++) if (i !== r && sol[i][N-1-i] === n) return false;
        return true;
      }
      function fill(pos = 0) {
        if (pos === N*N) return true;
        const r = Math.floor(pos/N), c = pos%N;
        const nums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random()-0.5);
        for (const n of nums) { if (possible(r,c,n)) { sol[r][c]=n; if (fill(pos+1)) return true; sol[r][c]=0; } }
        return false;
      }
      fill();
      const puzzle = sol.map(r => [...r]);
      let removed = 0;
      const cells = Array.from({length:N*N}, (_,i) => i).sort(() => Math.random()-0.5);
      for (const idx of cells) {
        if (removed >= 50) break;
        puzzle[Math.floor(idx/N)][idx%N] = 0;
        removed++;
      }
      return { givens: puzzle, solution: sol };
    }

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    // See-solution button
    let showSolution = false;
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let givens = null;      // 9x9 of given digits (0 = empty)
    let cells = null;       // 9x9 player entries
    let solution = null;    // 9x9 solution
    let selected = null;    // { r, c }
    let conflicts = null;   // Set of "r,c" strings
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let audioCtx = null;
    let voices = [];
    let solveFlash = 0;

    function initPuzzle() {
      const p = generatePuzzle();
      givens = p.givens;
      solution = p.solution;
      cells = Array.from({ length: N }, (_, r) =>
        Array.from({ length: N }, (_, c) => givens[r][c])
      );
      selected = null;
      conflicts = new Set();
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveFlash = 0;
      showSolution = false;
    }

    function isOnDiag(r, c) {
      return r === c || r + c === N - 1;
    }

    function getBox(r, c) { return Math.floor(r / 3) * 3 + Math.floor(c / 3); }

    function computeConflicts() {
      conflicts = new Set();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const v = cells[r][c];
          if (!v) continue;
          for (let c2 = 0; c2 < N; c2++) {
            if (c2 !== c && cells[r][c2] === v) { conflicts.add(`${r},${c}`); conflicts.add(`${r},${c2}`); }
          }
          for (let r2 = 0; r2 < N; r2++) {
            if (r2 !== r && cells[r2][c] === v) { conflicts.add(`${r},${c}`); conflicts.add(`${r2},${c}`); }
          }
          const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
          for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
            const r2 = br + dr, c2 = bc + dc;
            if ((r2 !== r || c2 !== c) && cells[r2][c2] === v) { conflicts.add(`${r},${c}`); conflicts.add(`${r2},${c2}`); }
          }
          if (r === c) {
            for (let i = 0; i < N; i++) {
              if (i !== r && cells[i][i] === v) { conflicts.add(`${r},${c}`); conflicts.add(`${i},${i}`); }
            }
          }
          if (r + c === N - 1) {
            for (let i = 0; i < N; i++) {
              const j = N - 1 - i;
              if ((i !== r || j !== c) && cells[i][j] === v) { conflicts.add(`${r},${c}`); conflicts.add(`${i},${j}`); }
            }
          }
        }
      }
    }

    function checkSolved() {
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (cells[r][c] !== solution[r][c]) return false;
      return conflicts.size === 0;
    }

    function getGridLayout() {
      const HUD_H = 56;
      const NP_BTN = Math.min(Math.floor((W - 40) / 9), 44);
      const NP_H = NP_BTN * 3 + 16;
      const available = USABLE_H - HUD_H - NP_H - 16;
      const CELL = Math.min(Math.floor(available / N), Math.floor((W - 16) / N));
      const gridW = CELL * N;
      const gridH = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + Math.floor((available - gridH) / 2) + 4;
      return { CELL, ox, oy, gridW, gridH, NP_BTN, NP_H };
    }

    function getNumpadLayout(layout) {
      const { NP_BTN } = layout;
      const gap = 6;
      const totalW = 9 * NP_BTN + 8 * gap;
      const startX = Math.floor((W - totalW) / 2);
      const startY = USABLE_H - NP_BTN * 3 - gap * 2 - 8;
      const flat = [];
      const flatY = USABLE_H - NP_BTN - 8;
      const flatTotalW = 9 * NP_BTN + 8 * gap;
      const flatStartX = Math.floor((W - flatTotalW) / 2);
      for (let n = 1; n <= 9; n++) {
        flat.push({ n, x: flatStartX + (n - 1) * (NP_BTN + gap), y: flatY, w: NP_BTN, h: NP_BTN });
      }
      return flat;
    }

    function drawRoundRect(g2, x, y, w, h, r2) {
      if (g2.roundRect) { g2.roundRect(x, y, w, h, r2); return; }
      g2.beginPath();
      g2.moveTo(x + r2, y); g2.lineTo(x + w - r2, y);
      g2.arcTo(x + w, y, x + w, y + r2, r2);
      g2.lineTo(x + w, y + h - r2);
      g2.arcTo(x + w, y + h, x + w - r2, y + h, r2);
      g2.lineTo(x + r2, y + h);
      g2.arcTo(x, y + h, x, y + h - r2, r2);
      g2.lineTo(x, y + r2);
      g2.arcTo(x, y, x + r2, y, r2);
      g2.closePath();
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq, dur = 0.08, vol = 0.1) {
      if (!audioCtx) return;
      voices = voices.filter(v => !v.done);
      if (voices.length >= 8) {
        try { voices[0].gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.01); } catch(e) {}
        voices.shift();
      }
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = freq;
      o.type = 'sine';
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      const v = { gain: gn, done: false };
      setTimeout(() => { v.done = true; }, (dur + 0.05) * 1000);
      voices.push(v);
    }

    function playChord() {
      if (!audioCtx) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        gn.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.06);
        gn.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + i * 0.06 + 0.05);
        gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.06 + 0.8);
        o.start(audioCtx.currentTime + i * 0.06);
        o.stop(audioCtx.currentTime + i * 0.06 + 0.8);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    function enterDigit(n) {
      if (!selected || solved) return;
      const { r, c } = selected;
      if (givens[r][c] !== 0) return;
      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }
      cells[r][c] = n;
      computeConflicts();
      playNote(220 + n * 40, 0.09, 0.1);
      ctx.platform.interact({ type: 'tap' });
      if (n !== 0 && checkSolved()) {
        solved = true;
        solveTime = performance.now() - startTime;
        const best = ctx.storage.get('bt_sudokux') || 0;
        if (!best || solveTime < best) ctx.storage.set('bt_sudokux', solveTime);
        ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
        solveFlash = performance.now();
        playChord();
      }
    }

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const layout = getGridLayout();
      const { CELL, ox, oy, gridW, gridH } = layout;
      const numpad = getNumpadLayout(layout);

      // HUD
      g.fillStyle = '#ffffff11';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('SUDOKU X', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      const best = ctx.storage.get('bt_sudokux');
      if (best) {
        g.font = '11px -apple-system, sans-serif';
        g.fillStyle = '#666688';
        g.textAlign = 'right';
        g.fillText(`Best ${formatTime(best)}`, W - 50, 38);
      }

      let hlRows = new Set(), hlCols = new Set(), hlBoxes = new Set();
      let hlDiagMain = false, hlDiagAnti = false;
      if (selected) {
        hlRows.add(selected.r);
        hlCols.add(selected.c);
        hlBoxes.add(getBox(selected.r, selected.c));
        if (selected.r === selected.c) hlDiagMain = true;
        if (selected.r + selected.c === N - 1) hlDiagAnti = true;
      }

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx2 = ox + c * CELL;
          const cy2 = oy + r * CELL;
          const isSelected = selected && selected.r === r && selected.c === c;
          const isDiag = isOnDiag(r, c);
          const isHighlighted = hlRows.has(r) || hlCols.has(c) || hlBoxes.has(getBox(r, c))
            || (hlDiagMain && r === c)
            || (hlDiagAnti && r + c === N - 1);
          const isConflict = conflicts.has(`${r},${c}`);

          let bg = CELL_BG;
          if (isSelected) bg = SEL_BG;
          else if (isHighlighted) bg = HIGHLIGHT_BG;

          g.fillStyle = bg;
          g.fillRect(cx2 + 1, cy2 + 1, CELL - 2, CELL - 2);

          if (isDiag) {
            g.fillStyle = isHighlighted ? DIAG_TINT_SEL : DIAG_TINT;
            g.fillRect(cx2 + 1, cy2 + 1, CELL - 2, CELL - 2);

            g.save();
            g.globalAlpha = 0.18;
            g.strokeStyle = ACCENT;
            g.lineWidth = 1;
            const m = CELL * 0.22;
            g.beginPath();
            g.moveTo(cx2 + m, cy2 + m); g.lineTo(cx2 + CELL - m, cy2 + CELL - m);
            g.moveTo(cx2 + CELL - m, cy2 + m); g.lineTo(cx2 + m, cy2 + CELL - m);
            g.stroke();
            g.restore();
          }

          const v = cells[r][c];
          if (v !== 0) {
            g.font = `bold ${Math.floor(CELL * 0.52)}px -apple-system, sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            if (isConflict) g.fillStyle = CONFLICT_COLOR;
            else if (givens[r][c]) g.fillStyle = GIVEN_COLOR;
            else g.fillStyle = PLAYER_COLOR;
            g.fillText(String(v), cx2 + CELL / 2, cy2 + CELL / 2);
          }
        }
      }

      g.strokeStyle = '#ffffff18';
      g.lineWidth = 1;
      for (let i = 0; i <= N; i++) {
        g.beginPath();
        g.moveTo(ox + i * CELL, oy); g.lineTo(ox + i * CELL, oy + gridH); g.stroke();
        g.beginPath();
        g.moveTo(ox, oy + i * CELL); g.lineTo(ox + gridW, oy + i * CELL); g.stroke();
      }
      g.strokeStyle = '#ffffff44';
      g.lineWidth = 2;
      for (let i = 0; i <= N; i += 3) {
        g.beginPath();
        g.moveTo(ox + i * CELL, oy); g.lineTo(ox + i * CELL, oy + gridH); g.stroke();
        g.beginPath();
        g.moveTo(ox, oy + i * CELL); g.lineTo(ox + gridW, oy + i * CELL); g.stroke();
      }

      g.save();
      g.globalAlpha = 0.2;
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.setLineDash([4, 6]);
      g.beginPath();
      g.moveTo(ox, oy); g.lineTo(ox + gridW, oy + gridH); g.stroke();
      g.beginPath();
      g.moveTo(ox + gridW, oy); g.lineTo(ox, oy + gridH); g.stroke();
      g.setLineDash([]);
      g.restore();

      const npFontSize = Math.floor(layout.NP_BTN * 0.48);
      numpad.forEach(btn => {
        g.save();
        const isActive = selected && !givens[selected.r]?.[selected.c] && cells[selected.r]?.[selected.c] === btn.n && btn.n !== 0;
        g.fillStyle = isActive ? ACCENT + '44' : '#1e1e2e';
        g.beginPath();
        drawRoundRect(g, btn.x, btn.y, btn.w, btn.h, 8);
        g.fill();
        g.strokeStyle = isActive ? ACCENT : '#ffffff22';
        g.lineWidth = isActive ? 1.5 : 1;
        g.beginPath();
        drawRoundRect(g, btn.x, btn.y, btn.w, btn.h, 8);
        g.stroke();
        g.fillStyle = isActive ? ACCENT : '#aaaacc';
        g.font = `bold ${npFontSize}px -apple-system, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(btn.n), btn.x + btn.w / 2, btn.y + btn.h / 2);
        g.restore();
      });

      // Solve flash overlay
      if (solved && solveFlash) {
        const flashT = Math.min((now - solveFlash) / 400, 1);
        if (flashT < 1) {
          g.fillStyle = `rgba(126,87,194,${0.35 * (1 - flashT)})`;
          g.fillRect(0, 0, W, USABLE_H);
        } else {
          g.fillStyle = 'rgba(15,15,20,0.88)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 36px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 24;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 16);
          const bestNow = ctx.storage.get('bt_sudokux') || 0;
          g.fillText(`Best: ${formatTime(bestNow)}`, W / 2, USABLE_H / 2 + 16);
          g.fillStyle = ACCENT + '22';
          g.beginPath(); drawRoundRect(g, W / 2 - 110, USABLE_H / 2 + 50, 220, 48, 12); g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath(); drawRoundRect(g, W / 2 - 110, USABLE_H / 2 + 50, 220, 48, 12); g.stroke();
          g.font = 'bold 16px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.fillText('NEW PUZZLE', W / 2, USABLE_H / 2 + 74);
        }
      }

      // Info panel
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);

        const cw = Math.floor(W * 0.88);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.82), 540);
        const cy2 = Math.floor((USABLE_H - ch) / 2);

        g.fillStyle = '#1a1a2e';
        g.beginPath(); drawRoundRect(g, cx2, cy2, cw, ch, 16); g.fill();

        g.save(); g.globalAlpha = 0.1; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 48, 60, 0, Math.PI * 2); g.fill();
        g.restore();

        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('SUDOKU X', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty = cy2 + 76;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Fill every cell with digits 1-9',
          '• Each row must contain 1-9 (no repeats)',
          '• Each column must contain 1-9 (no repeats)',
          '• Each 3×3 box must contain 1-9 (no repeats)',
          '• BONUS: both main diagonals must also contain 1-9',
          '• The × diagonals are tinted purple',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillText('Tap a cell → select it', lx, ty); ty += lh;
        g.fillText('Tap numpad → enter digit', lx, ty); ty += lh;
        g.fillText('Tap same digit again → erase', lx, ty); ty += lh;
        g.fillText('Tap ? → reveal the solution', lx, ty); ty += lh;

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);

        g.save();
        g.fillStyle = ACCENT;
        g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#000';
        g.font = 'bold 14px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
        g.restore();
        return;
      }

      // i button — drawn LAST
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
    });

    function hitCell(tx, ty) {
      const layout = getGridLayout();
      const { CELL, ox, oy } = layout;
      const gx = tx - ox, gy = ty - oy;
      if (gx < 0 || gy < 0 || gx >= N * CELL || gy >= N * CELL) return null;
      return { r: Math.floor(gy / CELL), c: Math.floor(gx / CELL) };
    }

    function hitNumpad(tx, ty) {
      const layout = getGridLayout();
      const btns = getNumpadLayout(layout);
      for (const btn of btns) {
        if (tx >= btn.x && tx <= btn.x + btn.w && ty >= btn.y && ty <= btn.y + btn.h) return btn.n;
      }
      return null;
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
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++)
            if (!givens[r][c]) cells[r][c] = solution[r][c];
        conflicts = new Set();
        if (!solved) {
          solved = true;
          solveTime = gameStarted ? performance.now() - startTime : 0;
          solveFlash = performance.now();
          const best = ctx.storage.get('bt_sudokux') || 0;
          if (!best || (solveTime > 0 && solveTime < best)) ctx.storage.set('bt_sudokux', solveTime);
          ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
          playChord();
        }
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved && solveFlash && performance.now() - solveFlash > 400) {
        initPuzzle();
        return;
      }

      const n = hitNumpad(tx, ty);
      if (n !== null) {
        if (selected) {
          const { r, c } = selected;
          if (givens[r][c] === 0) {
            const newVal = (cells[r][c] === n && n !== 0) ? 0 : n;
            if (!gameStarted && newVal !== 0) {
              gameStarted = true;
              startTime = performance.now();
              ctx.platform.start();
            }
            cells[r][c] = newVal;
            computeConflicts();
            playNote(220 + n * 40, 0.09, 0.1);
            ctx.platform.interact({ type: 'tap' });
            ctx.platform.haptic('light');
            if (newVal !== 0 && checkSolved()) {
              solved = true;
              solveTime = performance.now() - startTime;
              const best = ctx.storage.get('bt_sudokux') || 0;
              if (!best || solveTime < best) ctx.storage.set('bt_sudokux', solveTime);
              ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
              solveFlash = performance.now();
              playChord();
            }
          }
        }
        return;
      }

      const cell = hitCell(tx, ty);
      if (cell) {
        selected = cell;
        ctx.platform.haptic('light');
        return;
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
