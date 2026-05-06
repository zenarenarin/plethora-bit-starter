window.plethoraBit = {
  meta: {
    title: 'Sudoku',
    author: 'plethora',
    description: 'Fill the 9×9 grid — every row, col & box uses 1–9.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#4FC3F7';
    const BG = '#0f0f14';

    // ── Procedural generator ──────────────────────────────────────────────────
    function generatePuzzle() {
      const sol = Array.from({length:9}, () => Array(9).fill(0));
      function possible(r, c, n) {
        for (let i = 0; i < 9; i++) if (sol[r][i] === n || sol[i][c] === n) return false;
        const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (sol[br+i][bc+j] === n) return false;
        return true;
      }
      function fill(pos = 0) {
        if (pos === 81) return true;
        const r = Math.floor(pos/9), c = pos%9;
        const nums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random()-0.5);
        for (const n of nums) { if (possible(r,c,n)) { sol[r][c]=n; if (fill(pos+1)) return true; sol[r][c]=0; } }
        return false;
      }
      fill();
      const puzzle = sol.map(r => [...r]);
      let removed = 0;
      const cells = Array.from({length:81}, (_,i) => i).sort(() => Math.random()-0.5);
      for (const idx of cells) {
        if (removed >= 50) break;
        puzzle[Math.floor(idx/9)][idx%9] = 0;
        removed++;
      }
      // Return as flat arrays to match existing board/solution format
      return {
        board: puzzle.flat(),
        solution: sol.flat(),
      };
    }

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    // See-solution button
    let showSolution = false;
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let board = [];        // 81 numbers, current user input (0=empty)
    let givens = [];       // bool array — which cells are pre-filled
    let solution = [];     // 81 numbers — correct solution
    let selected = -1;     // index 0–80
    let errors = new Set();
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let audioCtx = null;
    let solveAnimStart = 0;
    let score = 0;

    function initPuzzle() {
      const p = generatePuzzle();
      board = p.board;
      givens = board.map(v => v !== 0);
      solution = p.solution;
      selected = -1;
      errors = new Set();
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnimStart = 0;
      score = 0;
      showSolution = false;
    }

    function idx(r, c) { return r * 9 + c; }
    function row(i) { return Math.floor(i / 9); }
    function col(i) { return i % 9; }
    function box(i) { return Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3); }

    function checkErrors() {
      errors = new Set();
      for (let i = 0; i < 81; i++) {
        if (board[i] === 0) continue;
        if (board[i] !== solution[i]) errors.add(i);
      }
    }

    function checkSolved() {
      for (let i = 0; i < 81; i++) {
        if (board[i] !== solution[i]) return false;
      }
      return true;
    }

    function triggerSolve(now) {
      solved = true;
      solveTime = now - startTime;
      solveAnimStart = now;
      const best = ctx.storage.get('bt_sudoku') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_sudoku', solveTime);
      ctx.platform.complete({ score: score, durationMs: solveTime });
      playArpeggio();
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    function getLayout() {
      const HUD_H = 48;
      const PAD_H = 8;
      const numpadH = 56;
      const availH = USABLE_H - HUD_H - PAD_H - numpadH - 16;
      const availW = W - 24;
      const CELL = Math.min(Math.floor(availW / 9), Math.floor(availH / 9), 44);
      const gridW = CELL * 9;
      const gridH = CELL * 9;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + PAD_H + Math.floor((availH - gridH) / 2);
      const numpadY = USABLE_H - numpadH - 8;
      return { CELL, gridW, gridH, ox, oy, numpadY, numpadH, HUD_H };
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playBlip(freq = 880) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = freq;
      o.type = 'sine';
      gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }

    function playError() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = 160;
      o.type = 'sawtooth';
      gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
      o.start(); o.stop(audioCtx.currentTime + 0.18);
    }

    function playArpeggio() {
      if (!audioCtx) return;
      const freqs = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      freqs.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        const t = audioCtx.currentTime + i * 0.1;
        gain.setValueAtTime(0, t);
        gain.linearRampToValueAtTime(0.16, t + 0.05);
        gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.start(t); o.stop(t + 0.5);
      });
    }

    function drawRoundRect(x, y, w, h, r2) {
      if (g.roundRect) { g.roundRect(x, y, w, h, r2); return; }
      g.beginPath();
      g.moveTo(x + r2, y);
      g.lineTo(x + w - r2, y);
      g.arcTo(x + w, y, x + w, y + r2, r2);
      g.lineTo(x + w, y + h - r2);
      g.arcTo(x + w, y + h, x + w - r2, y + h, r2);
      g.lineTo(x + r2, y + h);
      g.arcTo(x, y + h, x, y + h - r2, r2);
      g.lineTo(x, y + r2);
      g.arcTo(x, y, x + r2, y, r2);
      g.closePath();
    }

    initPuzzle();

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const { CELL, ox, oy, numpadY, numpadH, HUD_H } = getLayout();

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, W, HUD_H);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('SUDOKU', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#8899bb';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Grid background
      const sel = selected;
      const selRow = sel >= 0 ? row(sel) : -1;
      const selCol = sel >= 0 ? col(sel) : -1;
      const selBox = sel >= 0 ? box(sel) : -1;
      const selVal = sel >= 0 ? board[sel] : 0;

      for (let i = 0; i < 81; i++) {
        const r = row(i), c = col(i);
        const x = ox + c * CELL, y = oy + r * CELL;
        const isSelected = i === sel;
        const isPeer = sel >= 0 && (row(i) === selRow || col(i) === selCol || box(i) === selBox);
        const isSameVal = selVal > 0 && board[i] === selVal && i !== sel;
        const isGiven = givens[i];
        const isError = errors.has(i);

        // Cell background
        let bg;
        if (isSelected) bg = ACCENT + '40';
        else if (isSameVal) bg = ACCENT + '22';
        else if (isPeer) bg = 'rgba(255,255,255,0.04)';
        else bg = 'rgba(255,255,255,0.02)';

        g.fillStyle = bg;
        g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

        // Number
        if (board[i] !== 0) {
          g.font = `${isGiven ? 'bold' : ''} ${Math.floor(CELL * 0.55)}px -apple-system, sans-serif`;
          g.textAlign = 'center'; g.textBaseline = 'middle';
          if (isError) g.fillStyle = '#FF5252';
          else if (isGiven) g.fillStyle = '#e0e8ff';
          else g.fillStyle = ACCENT;
          g.fillText(String(board[i]), x + CELL / 2, y + CELL / 2);
        }
      }

      // Grid lines
      for (let i = 0; i <= 9; i++) {
        const isBold = i % 3 === 0;
        g.strokeStyle = isBold ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)';
        g.lineWidth = isBold ? 1.5 : 0.5;
        // vertical
        g.beginPath();
        g.moveTo(ox + i * CELL, oy);
        g.lineTo(ox + i * CELL, oy + 9 * CELL);
        g.stroke();
        // horizontal
        g.beginPath();
        g.moveTo(ox, oy + i * CELL);
        g.lineTo(ox + 9 * CELL, oy + i * CELL);
        g.stroke();
      }

      // Outer border glow
      g.strokeStyle = ACCENT + '55';
      g.lineWidth = 2;
      g.strokeRect(ox, oy, 9 * CELL, 9 * CELL);

      // Number pad
      const digits = [1,2,3,4,5,6,7,8,9];
      const btnW = Math.floor((W - 32) / 9);
      const btnH = Math.min(numpadH - 8, 44);
      const padStartX = Math.floor((W - btnW * 9) / 2);

      for (let d = 0; d < 9; d++) {
        const bx = padStartX + d * btnW;
        const by = numpadY + Math.floor((numpadH - btnH) / 2);

        // Count remaining uses of this digit
        const used = board.filter(v => v === digits[d]).length;
        const full = used >= 9;

        g.fillStyle = full ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)';
        g.beginPath();
        drawRoundRect(bx + 2, by, btnW - 4, btnH, 8);
        g.fill();

        if (!full) {
          g.strokeStyle = 'rgba(255,255,255,0.1)';
          g.lineWidth = 1;
          g.beginPath();
          drawRoundRect(bx + 2, by, btnW - 4, btnH, 8);
          g.stroke();
        }

        g.font = `bold ${Math.floor(btnH * 0.44)}px -apple-system, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = full ? 'rgba(255,255,255,0.2)' : (selVal === digits[d] ? ACCENT : 'rgba(255,255,255,0.75)');
        g.fillText(String(digits[d]), bx + btnW / 2, by + btnH / 2);
      }

      // Info button
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 13px -apple-system, sans-serif';
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

      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.84), ch = Math.min(Math.floor(USABLE_H * 0.72), 420);
        const cx2 = Math.floor((W - cw) / 2), cy2 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath(); drawRoundRect(cx2, cy2, cw, ch, 16); g.fill();

        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('SUDOKU', W / 2, cy2 + 50);

        const lx = cx2 + 22; let ty = cy2 + 72; const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Fill every row with digits 1–9, no repeats',
          '• Fill every column with digits 1–9, no repeats',
          '• Fill each 3×3 box with digits 1–9, no repeats',
          '• Gray numbers are given — they cannot change',
        ];
        g.font = '13px -apple-system, sans-serif'; g.fillStyle = '#fff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        const controls = ['Tap a white cell to select it', 'Tap a number below to fill it in', 'Tap ? to reveal the solution'];
        g.font = '13px -apple-system, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of controls) { g.fillText(line, lx, ty); ty += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 18);
      }

      // Solve overlay
      if (solved) {
        const t = Math.min((now - solveAnimStart) / 600, 1);
        if (t > 0.3) {
          g.fillStyle = `rgba(15,15,20,${0.88 * ((t - 0.3) / 0.7)})`;
          g.fillRect(0, 0, W, USABLE_H);

          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;

          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 12);
          const best = ctx.storage.get('bt_sudoku') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 18);

          g.fillStyle = ACCENT + '1a';
          g.beginPath(); drawRoundRect(W / 2 - 110, USABLE_H / 2 + 52, 220, 50, 12); g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath(); drawRoundRect(W / 2 - 110, USABLE_H / 2 + 52, 220, 50, 12); g.stroke();
          g.font = 'bold 15px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.fillText('NEW PUZZLE', W / 2, USABLE_H / 2 + 77);
        }
      }
    });

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX, ty = e.changedTouches[0].clientY;
      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) { showInfo = !showInfo; return; }
      if (showInfo) { showInfo = false; return; }

      // See-solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        for (let i = 0; i < 81; i++) {
          if (!givens[i]) board[i] = solution[i];
        }
        errors = new Set();
        if (!solved) triggerSolve(performance.now());
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved && performance.now() - solveAnimStart > 800) {
        initPuzzle();
        return;
      }

      const { CELL, ox, oy, numpadY, numpadH } = getLayout();

      // Check numpad tap
      const btnW = Math.floor((W - 32) / 9);
      const btnH = Math.min(numpadH - 8, 44);
      const padStartX = Math.floor((W - btnW * 9) / 2);
      const padTopY = numpadY + Math.floor((numpadH - btnH) / 2);

      if (ty >= padTopY - 8 && ty <= padTopY + btnH + 8) {
        for (let d = 0; d < 9; d++) {
          const bx = padStartX + d * btnW;
          if (tx >= bx && tx <= bx + btnW) {
            const digit = d + 1;
            if (selected >= 0 && !givens[selected] && !solved) {
              if (!gameStarted) { gameStarted = true; startTime = performance.now(); ctx.platform.start(); }
              if (board[selected] === digit) {
                board[selected] = 0;
              } else {
                board[selected] = digit;
                score += 10;
                ctx.platform.setScore(score);
              }
              checkErrors();
              ctx.platform.haptic('light');
              if (errors.has(selected)) {
                playError();
              } else {
                playBlip(440 + digit * 40);
              }
              if (checkSolved()) triggerSolve(performance.now());
            }
            return;
          }
        }
      }

      // Check grid tap
      const gx = tx - ox, gy = ty - oy;
      if (gx >= 0 && gy >= 0 && gx < 9 * CELL && gy < 9 * CELL) {
        const c = Math.floor(gx / CELL), r = Math.floor(gy / CELL);
        const i = r * 9 + c;
        selected = (selected === i) ? -1 : i;
        ctx.platform.haptic('light');
        playBlip(660);
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
