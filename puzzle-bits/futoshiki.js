window.plethoraBit = {
  meta: {
    title: 'Futoshiki',
    author: 'plethora',
    description: 'Place 1–5 while satisfying the inequality signs.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#66BB6A';
    const BG = '#0f0f14';

    // ── Procedural generator ──────────────────────────────────────────────────
    function generatePuzzle(N = 5) {
      // 1. Build a valid Latin square by shuffling a cyclic base
      const base = Array.from({length:N}, (_,i) => i+1);
      // Shuffle row 0
      for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [base[i], base[j]] = [base[j], base[i]];
      }
      const sol = [];
      for (let r = 0; r < N; r++) {
        sol.push(base.map((v, c) => ((v - 1 + r) % N) + 1));
      }
      // Shuffle rows (keep row 0, permute rows 1..N-1 among themselves)
      for (let i = N - 1; i > 1; i--) {
        const j = 1 + Math.floor(Math.random() * i);
        [sol[i], sol[j]] = [sol[j], sol[i]];
      }
      // Shuffle columns
      const colPerm = Array.from({length:N}, (_,i) => i);
      for (let i = N - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [colPerm[i], colPerm[j]] = [colPerm[j], colPerm[i]];
      }
      const shuffled = sol.map(row => colPerm.map(c => row[c]));

      // 2. Generate inequality clues (~30% chance each adjacent pair)
      const hClues = []; // horizontal: between (r,c) and (r,c+1)
      const vClues = []; // vertical: between (r,c) and (r+1,c)
      for (let r = 0; r < N; r++) for (let c = 0; c < N-1; c++) {
        if (Math.random() < 0.30) {
          hClues.push({ r1: r, c1: c, r2: r, c2: c+1, rel: shuffled[r][c] > shuffled[r][c+1] ? 'gt' : 'lt' });
        }
      }
      for (let r = 0; r < N-1; r++) for (let c = 0; c < N; c++) {
        if (Math.random() < 0.30) {
          vClues.push({ r1: r, c1: c, r2: r+1, c2: c, rel: shuffled[r][c] > shuffled[r+1][c] ? 'gt' : 'lt' });
        }
      }

      // 3. Punch holes — show ~30% of cells as given
      const given = Array.from({length:N}, () => Array(N).fill(0));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (Math.random() < 0.30) given[r][c] = shuffled[r][c];
      }

      // Merge hClues and vClues into a single inequalities array matching existing format
      const inequalities = [...hClues, ...vClues];

      return { solution: shuffled, given, inequalities };
    }

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    // See-solution button
    let showSolution = false;
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let currentPuzzle = null;
    let board = [];
    let selected = null;
    let errors = new Set();
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let solveAnimStart = 0;
    let audioCtx = null;
    let score = 0;

    function initPuzzle() {
      currentPuzzle = generatePuzzle(5);
      board = Array.from({length:5}, () => Array(5).fill(0));
      currentPuzzle.given.forEach((row, r) => row.forEach((v, c) => { board[r][c] = v; }));
      selected = null;
      errors = new Set();
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnimStart = 0;
      score = 0;
      showSolution = false;
    }

    function isGiven(r, c) {
      return currentPuzzle.given[r][c] !== 0;
    }

    function checkErrors() {
      errors = new Set();
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (board[r][c] === 0) continue;
          if (board[r][c] !== currentPuzzle.solution[r][c]) errors.add(`${r},${c}`);
        }
      }
    }

    function checkSolved() {
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 5; c++)
          if (board[r][c] !== currentPuzzle.solution[r][c]) return false;
      return true;
    }

    function getLayout() {
      const HUD_H = 48;
      const numpadH = 60;
      const PAD = 12;
      const ineqGap = 0.35;
      const availW = W - PAD * 2;
      const availH = USABLE_H - HUD_H - numpadH - PAD * 2;
      const factor = 5 + 4 * ineqGap;
      const CELL = Math.min(
        Math.floor(availW / factor),
        Math.floor(availH / factor),
        52
      );
      const IGAP = Math.floor(CELL * ineqGap);
      const rowW = 5 * CELL + 4 * IGAP;
      const rowH = 5 * CELL + 4 * IGAP;
      const ox = Math.floor((W - rowW) / 2);
      const oy = HUD_H + PAD + Math.floor((availH - rowH) / 2);
      const numpadY = USABLE_H - numpadH - 4;
      return { CELL, IGAP, ox, oy, numpadY, numpadH, HUD_H };
    }

    function cellPos(r, c, layout) {
      const { CELL, IGAP, ox, oy } = layout;
      return {
        x: ox + c * (CELL + IGAP),
        y: oy + r * (CELL + IGAP),
      };
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playBlip(freq = 880) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = freq; o.type = 'sine';
      gn.setValueAtTime(0.1, audioCtx.currentTime);
      gn.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }

    function playError() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 160; o.type = 'sawtooth';
      gn.setValueAtTime(0.12, audioCtx.currentTime);
      gn.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      o.start(); o.stop(audioCtx.currentTime + 0.2);
    }

    function playArpeggio() {
      if (!audioCtx) return;
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
        const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = freq; o.type = 'sine';
        const t = audioCtx.currentTime + i * 0.1;
        gn.setValueAtTime(0, t);
        gn.linearRampToValueAtTime(0.16, t + 0.05);
        gn.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.start(t); o.stop(t + 0.5);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    function drawRR(x, y, w, h, r2) {
      if (g.roundRect) { g.roundRect(x, y, w, h, r2); return; }
      g.beginPath();
      g.moveTo(x + r2, y); g.lineTo(x + w - r2, y);
      g.arcTo(x + w, y, x + w, y + r2, r2);
      g.lineTo(x + w, y + h - r2);
      g.arcTo(x + w, y + h, x + w - r2, y + h, r2);
      g.lineTo(x + r2, y + h);
      g.arcTo(x, y + h, x, y + h - r2, r2);
      g.lineTo(x, y + r2);
      g.arcTo(x, y, x + r2, y, r2);
      g.closePath();
    }

    function drawInequality(ineq, layout) {
      const { CELL, IGAP } = layout;
      const p1 = cellPos(ineq.r1, ineq.c1, layout);

      const isHoriz = ineq.r1 === ineq.r2;
      const fontSize = Math.max(10, Math.floor(IGAP * 0.7));

      g.save();
      g.font = `bold ${fontSize}px -apple-system, sans-serif`;
      g.fillStyle = ACCENT + 'cc';
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      if (isHoriz) {
        const gx = p1.x + CELL + IGAP / 2;
        const gy = p1.y + CELL / 2;
        g.fillText(ineq.rel === 'lt' ? '<' : '>', gx, gy);
      } else {
        const gx = p1.x + CELL / 2;
        const gy = p1.y + CELL + IGAP / 2;
        g.fillText(ineq.rel === 'lt' ? '∧' : '∨', gx, gy);
      }
      g.restore();
    }

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const p = currentPuzzle;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const layout = getLayout();
      const { CELL, IGAP, numpadY, numpadH, HUD_H } = layout;

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, W, HUD_H);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('FUTOSHIKI', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#8899bb';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Draw cells
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const pos = cellPos(r, c, layout);
          const isSelected = selected && selected.r === r && selected.c === c;
          const given = isGiven(r, c);
          const hasError = errors.has(`${r},${c}`);
          const isPeer = selected && (selected.r === r || selected.c === c);
          const val = board[r][c];
          const selVal2 = selected ? board[selected.r][selected.c] : 0;
          const isSameVal = selVal2 > 0 && val === selVal2 && !(selected && selected.r === r && selected.c === c);

          let bg;
          if (isSelected) bg = ACCENT + '35';
          else if (isSameVal) bg = ACCENT + '1a';
          else if (isPeer) bg = 'rgba(255,255,255,0.05)';
          else bg = 'rgba(255,255,255,0.04)';

          g.fillStyle = bg;
          g.beginPath();
          drawRR(pos.x + 1, pos.y + 1, CELL - 2, CELL - 2, 6);
          g.fill();

          if (isSelected) {
            g.strokeStyle = ACCENT;
            g.lineWidth = 2;
            g.beginPath();
            drawRR(pos.x + 1, pos.y + 1, CELL - 2, CELL - 2, 6);
            g.stroke();
          } else {
            g.strokeStyle = 'rgba(255,255,255,0.1)';
            g.lineWidth = 0.5;
            g.beginPath();
            drawRR(pos.x + 1, pos.y + 1, CELL - 2, CELL - 2, 6);
            g.stroke();
          }

          if (val > 0) {
            g.font = `${given ? 'bold' : ''} ${Math.floor(CELL * 0.5)}px -apple-system, sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            if (hasError) g.fillStyle = '#FF5252';
            else if (given) g.fillStyle = '#e0e8ff';
            else g.fillStyle = ACCENT;
            g.fillText(String(val), pos.x + CELL / 2, pos.y + CELL / 2);
          }
        }
      }

      // Draw inequalities
      for (const ineq of p.inequalities) {
        drawInequality(ineq, layout);
      }

      // Number pad 1–5
      const btnCount = 5;
      const btnW = Math.floor((W - 32) / btnCount);
      const btnH = Math.min(numpadH - 10, 48);
      const padX = Math.floor((W - btnW * btnCount) / 2);
      const padYC = numpadY + Math.floor((numpadH - btnH) / 2);
      const selVal3 = selected ? board[selected.r][selected.c] : 0;

      for (let d = 1; d <= 5; d++) {
        const bx = padX + (d - 1) * btnW;
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.beginPath(); drawRR(bx + 4, padYC, btnW - 8, btnH, 10); g.fill();
        g.strokeStyle = selVal3 === d ? ACCENT : 'rgba(255,255,255,0.12)';
        g.lineWidth = selVal3 === d ? 1.5 : 1;
        g.beginPath(); drawRR(bx + 4, padYC, btnW - 8, btnH, 10); g.stroke();
        g.font = `bold ${Math.floor(btnH * 0.46)}px -apple-system, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = selVal3 === d ? ACCENT : 'rgba(255,255,255,0.8)';
        g.fillText(String(d), bx + btnW / 2, padYC + btnH / 2);
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
        g.fillStyle = 'rgba(0,0,0,0.9)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.86), ch = Math.min(Math.floor(USABLE_H * 0.75), 460);
        const cxp = Math.floor((W - cw) / 2), cyp = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath(); drawRR(cxp, cyp, cw, ch, 16); g.fill();

        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('FUTOSHIKI', W / 2, cyp + 50);

        const lx = cxp + 22; let ty = cyp + 72; const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Place 1–5 in every row (no repeats)',
          '• Place 1–5 in every column (no repeats)',
          '• < and > between cells: the smaller side',
          '  must hold a smaller number',
          '• ∧ means the top cell is smaller',
          '• ∨ means the bottom cell is smaller',
        ];
        g.font = '13px -apple-system, sans-serif'; g.fillStyle = '#fff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        const ctrls = ['Tap a cell to select it', 'Tap a number (1–5) to fill it in', 'Tap ? to reveal the solution'];
        g.font = '13px -apple-system, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of ctrls) { g.fillText(line, lx, ty); ty += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cyp + ch - 18);
      }

      if (solved) {
        const t = Math.min((now - solveAnimStart) / 600, 1);
        if (t > 0.3) {
          g.fillStyle = `rgba(15,15,20,${0.88 * ((t - 0.3) / 0.7)})`;
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT; g.shadowColor = ACCENT; g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 12);
          const best = ctx.storage.get('bt_futoshiki') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 18);
          g.fillStyle = ACCENT + '1a';
          g.beginPath(); drawRR(W / 2 - 110, USABLE_H / 2 + 52, 220, 50, 12); g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath(); drawRR(W / 2 - 110, USABLE_H / 2 + 52, 220, 50, 12); g.stroke();
          g.font = 'bold 15px -apple-system, sans-serif'; g.fillStyle = ACCENT;
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
        for (let r = 0; r < 5; r++)
          for (let c = 0; c < 5; c++)
            if (!isGiven(r, c)) board[r][c] = currentPuzzle.solution[r][c];
        errors = new Set();
        if (!solved) {
          solved = true;
          solveTime = gameStarted ? performance.now() - startTime : 0;
          solveAnimStart = performance.now();
          const best = ctx.storage.get('bt_futoshiki') || 0;
          if (!best || (solveTime > 0 && solveTime < best)) ctx.storage.set('bt_futoshiki', solveTime);
          ctx.platform.complete({ score, durationMs: solveTime });
          playArpeggio();
        }
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

      const layout = getLayout();
      const { CELL, IGAP, numpadY, numpadH } = layout;

      // Numpad
      const btnCount = 5;
      const btnW = Math.floor((W - 32) / btnCount);
      const btnH = Math.min(numpadH - 10, 48);
      const padX = Math.floor((W - btnW * btnCount) / 2);
      const padYC = numpadY + Math.floor((numpadH - btnH) / 2);

      if (ty >= padYC - 8 && ty <= padYC + btnH + 8) {
        for (let d = 1; d <= 5; d++) {
          const bx = padX + (d - 1) * btnW;
          if (tx >= bx && tx <= bx + btnW) {
            if (selected && !isGiven(selected.r, selected.c) && !solved) {
              if (!gameStarted) { gameStarted = true; startTime = performance.now(); ctx.platform.start(); }
              if (board[selected.r][selected.c] === d) {
                board[selected.r][selected.c] = 0;
              } else {
                board[selected.r][selected.c] = d;
                score += 10;
                ctx.platform.setScore(score);
              }
              checkErrors();
              ctx.platform.haptic('light');
              if (errors.has(`${selected.r},${selected.c}`)) playError();
              else playBlip(440 + d * 60);
              if (checkSolved()) {
                solved = true;
                solveTime = performance.now() - startTime;
                solveAnimStart = performance.now();
                const best = ctx.storage.get('bt_futoshiki') || 0;
                if (!best || solveTime < best) ctx.storage.set('bt_futoshiki', solveTime);
                ctx.platform.complete({ score, durationMs: solveTime });
                playArpeggio();
              }
            }
            return;
          }
        }
      }

      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const pos = cellPos(r, c, layout);
          if (tx >= pos.x && tx <= pos.x + CELL && ty >= pos.y && ty <= pos.y + CELL) {
            selected = (selected && selected.r === r && selected.c === c) ? null : { r, c };
            ctx.platform.haptic('light');
            playBlip(660);
            return;
          }
        }
      }
      selected = null;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
