window.plethoraBit = {
  meta: {
    title: 'Minesweeper',
    author: 'plethora',
    description: 'Classic mine-finding puzzle. Long-press to flag.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#EF5350';
    const BG = '#0f0f14';

    // Number colors 1–8
    const NUM_COLORS = [
      null,
      '#64B5F6', // 1 blue
      '#81C784', // 2 green
      '#EF5350', // 3 red
      '#9C27B0', // 4 purple
      '#FF7043', // 5 deep orange
      '#26C6DA', // 6 cyan
      '#EC407A', // 7 pink
      '#BDBDBD', // 8 grey
    ];

    const DIFFICULTIES = [
      { label: 'EASY',   cols: 8,  rows: 8,  mines: 10, key: 'bt_mine_easy' },
      { label: 'MEDIUM', cols: 10, rows: 10, mines: 20, key: 'bt_mine_med'  },
      { label: 'HARD',   cols: 12, rows: 12, mines: 30, key: 'bt_mine_hard' },
    ];

    let diffIdx = 0;
    let board = null;
    let gameState = 'idle'; // 'idle' | 'playing' | 'won' | 'dead'
    let startTime = 0;
    let endTime = 0;
    let gameStarted = false;
    let flagCount = 0;
    let showInfo = false;
    let audioCtx = null;
    let voiceCount = 0;
    let explosionAnim = null; // { x, y, startTime }
    let longPressTimer = null;
    let longPressFired = false;
    let winAnim = null;

    const IBTN = { x: W - 22, y: 8, r: 14 };
    const HUD_H = 48;
    const DIFF_BTN_H = 40;
    const DIFF_BTN_Y = HUD_H + 8;

    // See-solution button — reveals all mines
    let showSolution = false;
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    function getDiff() { return DIFFICULTIES[diffIdx]; }

    // ── Layout ────────────────────────────────────────────────────────────────
    function getLayout() {
      const d = getDiff();
      const topReserve = HUD_H + DIFF_BTN_H + 16; // hud + difficulty buttons + margin
      const availW = W - 16;
      const availH = USABLE_H - topReserve - 8;
      const cellByW = Math.floor(availW / d.cols);
      const cellByH = Math.floor(availH / d.rows);
      const CELL = Math.min(cellByW, cellByH, 44);
      const gridW = CELL * d.cols;
      const gridH = CELL * d.rows;
      const ox = Math.floor((W - gridW) / 2);
      const oy = topReserve + Math.floor((availH - gridH) / 2);
      return { CELL, gridW, gridH, ox, oy, cols: d.cols, rows: d.rows };
    }

    function cellAt(x, y) {
      const { CELL, ox, oy, cols, rows } = getLayout();
      const c = Math.floor((x - ox) / CELL);
      const r = Math.floor((y - oy) / CELL);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
      return { r, c };
    }

    // ── Board generation ──────────────────────────────────────────────────────
    function createBoard(safeR, safeC) {
      const d = getDiff();
      const { rows, cols, mines } = d;
      const cells = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ({
          mine: false, revealed: false, flagged: false,
          num: 0, animScale: 1, animStart: 0,
        }))
      );

      // Place mines avoiding safe zone (3x3 around first tap)
      const forbidden = new Set();
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = safeR + dr, nc = safeC + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols)
            forbidden.add(nr * cols + nc);
        }

      let placed = 0;
      while (placed < mines) {
        const idx = Math.floor(Math.random() * rows * cols);
        if (!forbidden.has(idx) && !cells[Math.floor(idx / cols)][idx % cols].mine) {
          cells[Math.floor(idx / cols)][idx % cols].mine = true;
          placed++;
        }
      }

      // Compute numbers
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          if (cells[r][c].mine) continue;
          let n = 0;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && cells[nr][nc].mine) n++;
            }
          cells[r][c].num = n;
        }

      return cells;
    }

    function resetGame() {
      board = null;
      gameState = 'idle';
      startTime = 0;
      endTime = 0;
      gameStarted = false;
      flagCount = 0;
      explosionAnim = null;
      winAnim = null;
      showSolution = false;
    }

    // ── Flood-fill reveal ─────────────────────────────────────────────────────
    function floodReveal(startR, startC) {
      const d = getDiff();
      const { rows, cols } = d;
      const queue = [[startR, startC]];
      const visited = new Set();
      visited.add(startR * cols + startC);

      while (queue.length) {
        const [r, c] = queue.shift();
        const cell = board[r][c];
        if (cell.revealed || cell.flagged) continue;
        cell.revealed = true;
        cell.animStart = performance.now();
        cell.animScale = 0;

        if (cell.num === 0 && !cell.mine) {
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr, nc = c + dc;
              const key = nr * cols + nc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited.has(key)) {
                visited.add(key);
                queue.push([nr, nc]);
              }
            }
        }
      }
    }

    // ── Win check ─────────────────────────────────────────────────────────────
    function checkWin() {
      const d = getDiff();
      const { rows, cols } = d;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const cell = board[r][c];
          if (!cell.mine && !cell.revealed) return false;
        }
      return true;
    }

    // ── Audio ─────────────────────────────────────────────────────────────────
    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq, dur, type = 'sine', vol = 0.12) {
      if (!audioCtx || voiceCount >= 8) return;
      voiceCount++;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type;
      o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      o.onended = () => voiceCount--;
    }

    function playReveal() { playNote(600 + Math.random() * 200, 0.06); }
    function playFlag()   { playNote(440, 0.1, 'triangle', 0.1); }

    function playExplosion() {
      if (!audioCtx) return;
      [100, 80, 60].forEach((f, i) => {
        ctx.timeout(() => playNote(f, 0.3, 'sawtooth', 0.2), i * 60);
      });
    }

    function playWin() {
      if (!audioCtx) return;
      [523, 659, 784, 1047].forEach((f, i) => {
        ctx.timeout(() => playNote(f, 0.5, 'sine', 0.15), i * 80);
      });
    }

    // ── Tap reveal ────────────────────────────────────────────────────────────
    function revealCell(r, c) {
      const d = getDiff();
      if (!board) {
        board = createBoard(r, c);
      }
      const cell = board[r][c];
      if (cell.revealed || cell.flagged) return;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      if (cell.mine) {
        // Reveal all mines
        cell.revealed = true;
        explosionAnim = { r, c, startTime: performance.now() };
        for (let rr = 0; rr < d.rows; rr++)
          for (let cc = 0; cc < d.cols; cc++)
            if (board[rr][cc].mine) board[rr][cc].revealed = true;
        gameState = 'dead';
        endTime = performance.now();
        playExplosion();
        ctx.platform.haptic('heavy');
        ctx.platform.fail({ reason: 'mine' });
      } else {
        floodReveal(r, c);
        playReveal();
        ctx.platform.interact({ type: 'tap' });
        if (checkWin()) {
          gameState = 'won';
          endTime = performance.now();
          const elapsed = endTime - startTime;
          const key = getDiff().key;
          const best = ctx.storage.get(key) || 0;
          if (!best || elapsed < best) ctx.storage.set(key, elapsed);
          winAnim = { startTime: performance.now() };
          playWin();
          ctx.platform.haptic('medium');
          ctx.platform.complete({ score: Math.floor(elapsed), result: 'won', durationMs: elapsed });
        }
      }
    }

    function toggleFlag(r, c) {
      if (!board) return;
      const cell = board[r][c];
      if (cell.revealed) return;
      cell.flagged = !cell.flagged;
      flagCount += cell.flagged ? 1 : -1;
      playFlag();
      ctx.platform.haptic('light');
      ctx.platform.interact({ type: 'flag' });
    }

    // ── Round rect helper ─────────────────────────────────────────────────────
    function rr(x, y, w, h, rad) {
      if (g.roundRect) { g.roundRect(x, y, w, h, rad); return; }
      g.beginPath();
      g.moveTo(x + rad, y);
      g.lineTo(x + w - rad, y);
      g.arcTo(x + w, y, x + w, y + rad, rad);
      g.lineTo(x + w, y + h - rad);
      g.arcTo(x + w, y + h, x + w - rad, y + h, rad);
      g.lineTo(x + rad, y + h);
      g.arcTo(x, y + h, x, y + h - rad, rad);
      g.lineTo(x, y + rad);
      g.arcTo(x, y, x + rad, y, rad);
      g.closePath();
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    resetGame();

    // ── Render loop ───────────────────────────────────────────────────────────
    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted
        ? (gameState === 'playing' ? now - startTime : endTime - startTime)
        : 0;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const d = getDiff();
      const mineLeft = d.mines - flagCount;

      // ── HUD ──
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, 0, W, HUD_H);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`MINESWEEPER  \u{1F4A3}${Math.max(0, mineLeft)}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(elapsed), W - 50, 24);

      // ── Difficulty buttons ──
      const btnW = Math.floor((W - 32) / 3) - 4;
      DIFFICULTIES.forEach((diff, i) => {
        const bx = 16 + i * (btnW + 6);
        const by = DIFF_BTN_Y;
        const active = i === diffIdx;
        g.beginPath();
        rr(bx, by, btnW, DIFF_BTN_H - 4, 8);
        g.fillStyle = active ? ACCENT + 'cc' : 'rgba(255,255,255,0.07)';
        g.fill();
        if (active) {
          g.strokeStyle = ACCENT;
          g.lineWidth = 1.5;
          g.beginPath(); rr(bx, by, btnW, DIFF_BTN_H - 4, 8); g.stroke();
        }
        g.font = `bold 11px -apple-system, sans-serif`;
        g.fillStyle = active ? '#fff' : '#aaaacc';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(diff.label, bx + btnW / 2, by + (DIFF_BTN_H - 4) / 2);
      });

      // ── Grid ──
      const layout = getLayout();
      const { CELL, ox, oy, cols, rows } = layout;

      // Grid background
      g.fillStyle = 'rgba(255,255,255,0.03)';
      g.beginPath();
      rr(ox - 4, oy - 4, cols * CELL + 8, rows * CELL + 8, 8);
      g.fill();

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const PAD = 2;
          const cell = board ? board[r][c] : null;

          // Pop-in animation
          let scale = 1;
          if (cell && cell.animStart) {
            const t = Math.min((now - cell.animStart) / 180, 1);
            if (t < 1) {
              const s = 1.70158;
              scale = 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
              scale = Math.max(0, scale);
            } else {
              cell.animStart = 0;
            }
          }

          const bx = cx + PAD + (CELL - PAD * 2) * (1 - scale) / 2;
          const by = cy + PAD + (CELL - PAD * 2) * (1 - scale) / 2;
          const bw = (CELL - PAD * 2) * scale;
          const bh = (CELL - PAD * 2) * scale;

          if (!cell || !cell.revealed) {
            // Unrevealed
            g.beginPath(); rr(bx, by, bw, bh, 5);
            g.fillStyle = 'rgba(255,255,255,0.1)';
            g.fill();

            if (cell && cell.flagged) {
              // Flag
              g.font = `${Math.floor(CELL * 0.55)}px -apple-system, sans-serif`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText('\u{1F6A9}', cx + CELL / 2, cy + CELL / 2);
            }
          } else if (cell.mine) {
            // Exploded mine
            const isEpicenter = explosionAnim && explosionAnim.r === r && explosionAnim.c === c;
            g.beginPath(); rr(bx, by, bw, bh, 5);
            g.fillStyle = isEpicenter ? ACCENT : 'rgba(239,83,80,0.35)';
            g.fill();
            if (isEpicenter) {
              g.shadowColor = ACCENT;
              g.shadowBlur = 20;
              g.fill();
              g.shadowBlur = 0;
            }
            g.font = `${Math.floor(CELL * 0.52)}px -apple-system, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('\u{1F4A3}', cx + CELL / 2, cy + CELL / 2);
          } else {
            // Revealed safe cell
            g.beginPath(); rr(bx, by, bw, bh, 5);
            g.fillStyle = 'rgba(255,255,255,0.04)';
            g.fill();

            if (cell.num > 0) {
              g.font = `bold ${Math.floor(CELL * 0.52)}px -apple-system, sans-serif`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillStyle = NUM_COLORS[cell.num] || '#fff';
              g.fillText(String(cell.num), cx + CELL / 2, cy + CELL / 2);
            }
          }
        }
      }

      // Explosion ring animation
      if (explosionAnim) {
        const t = (now - explosionAnim.startTime) / 400;
        if (t < 1) {
          const { CELL: CS, ox: GOX, oy: GOY } = layout;
          const ex = GOX + explosionAnim.c * CS + CS / 2;
          const ey = GOY + explosionAnim.r * CS + CS / 2;
          const radius = t * CS * 4;
          const alpha = (1 - t) * 0.6;
          g.beginPath();
          g.arc(ex, ey, radius, 0, Math.PI * 2);
          g.strokeStyle = `rgba(239,83,80,${alpha})`;
          g.lineWidth = 3 * (1 - t) + 1;
          g.stroke();
        }
      }

      // Win sparkles
      if (winAnim) {
        const t = (now - winAnim.startTime) / 1200;
        if (t < 1) {
          const count = 16;
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + t * 3;
            const dist = t * Math.min(W, USABLE_H) * 0.4;
            const px = W / 2 + Math.cos(angle) * dist;
            const py = USABLE_H / 2 + Math.sin(angle) * dist;
            const alpha = (1 - t);
            g.beginPath();
            g.arc(px, py, 4 * (1 - t) + 2, 0, Math.PI * 2);
            g.fillStyle = `rgba(239,83,80,${alpha})`;
            g.fill();
          }
        }
      }

      // ── Game Over overlay ──
      if (gameState === 'dead') {
        const t = explosionAnim ? Math.min((now - explosionAnim.startTime) / 500, 1) : 1;
        g.fillStyle = `rgba(15,15,20,${0.82 * t})`;
        g.fillRect(0, 0, W, USABLE_H);
        if (t > 0.6) {
          const ft = (t - 0.6) / 0.4;
          g.globalAlpha = ft;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 20;
          g.fillText('BOOM!', W / 2, USABLE_H / 2 - 56);
          g.shadowBlur = 0;
          g.font = '16px -apple-system, sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.fillText('Time: ' + formatTime(endTime - startTime), W / 2, USABLE_H / 2 - 12);
          g.font = 'bold 14px -apple-system, sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.45)';
          g.fillText('TAP TO TRY AGAIN', W / 2, USABLE_H / 2 + 20);
          g.globalAlpha = 1;
        }
      }

      // ── Win overlay ──
      if (gameState === 'won') {
        const t = winAnim ? Math.min((now - winAnim.startTime) / 500, 1) : 1;
        g.fillStyle = `rgba(15,15,20,${0.82 * t})`;
        g.fillRect(0, 0, W, USABLE_H);
        if (t > 0.5) {
          const ft = (t - 0.5) / 0.5;
          g.globalAlpha = ft;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = 'bold 36px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 20;
          g.fillText('CLEARED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = '16px -apple-system, sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.fillText('Time: ' + formatTime(endTime - startTime), W / 2, USABLE_H / 2 - 16);
          const best = ctx.storage.get(getDiff().key) || 0;
          g.fillText('Best: ' + formatTime(best), W / 2, USABLE_H / 2 + 16);
          g.font = 'bold 14px -apple-system, sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.45)';
          g.fillText('TAP TO PLAY AGAIN', W / 2, USABLE_H / 2 + 50);
          g.globalAlpha = 1;
        }
      }

      // ── Info panel ──
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);

        const cw = Math.floor(W * 0.84);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.75), 480);
        const cy2 = Math.floor((USABLE_H - ch) / 2);

        g.fillStyle = '#1a1a2e';
        g.beginPath(); rr(cx2, cy2, cw, ch, 16); g.fill();

        g.save(); g.globalAlpha = 0.12; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 50, 64, 0, Math.PI * 2); g.fill();
        g.restore();

        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('MINESWEEPER', W / 2, cy2 + 54);

        const lx = cx2 + 20;
        let ty = cy2 + 82;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Tap a cell to reveal it',
          '• Numbers show adjacent mine count',
          '• Long-press (300ms) to plant a flag',
          '• Reveal all safe cells to win',
          '• First tap is always safe!',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#fff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('TILE COLORS', lx, ty); ty += lh;
        [
          ['#64B5F6', '1'], ['#81C784', '2'], ['#EF5350', '3'], ['#9C27B0', '4'],
          ['#FF7043', '5'], ['#26C6DA', '6'], ['#EC407A', '7'], ['#BDBDBD', '8'],
        ].forEach(([col, num], i) => {
          const px = lx + i * (cw - 40) / 8;
          g.fillStyle = col;
          g.font = 'bold 14px -apple-system, sans-serif';
          g.textAlign = 'center';
          g.fillText(num, px + 10, ty);
        });
        ty += lh;

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      // ── i button — drawn LAST ──
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // ── See-solution button ──
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI*2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      if (showSolution && gameState !== 'dead' && gameState !== 'won') {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, USABLE_H - 48, W, 48);
        g.fillStyle = ACCENT;
        g.font = 'bold 15px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TAP ANYWHERE FOR NEW PUZZLE', W / 2, USABLE_H - 24);
      }
    });

    // ── Touch handling ────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX;
      const ty2 = e.changedTouches[0].clientY;

      // i button hit check first
      if (Math.hypot(tx - IBTN.x, ty2 - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // See-solution button — reveal all mine positions
      if (Math.hypot(tx - EYE_X, ty2 - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        if (board && (gameState === 'playing' || gameState === 'idle')) {
          const d = getDiff();
          for (let r = 0; r < d.rows; r++)
            for (let c = 0; c < d.cols; c++)
              if (board[r][c].mine) board[r][c].revealed = true;
          gameState = 'dead';
          endTime = performance.now();
          ctx.platform.fail({ reason: 'revealed' });
        }
        return;
      }

      // If solution is visible (mines shown, game dead), any tap starts a new puzzle
      if (showSolution) {
        resetGame();
        return;
      }

      // Game over / win: any tap restarts
      if (gameState === 'dead' || gameState === 'won') {
        resetGame();
        return;
      }

      // Difficulty buttons
      if (ty2 >= DIFF_BTN_Y && ty2 <= DIFF_BTN_Y + DIFF_BTN_H) {
        const btnW = Math.floor((W - 32) / 3) - 4;
        DIFFICULTIES.forEach((_, i) => {
          const bx = 16 + i * (btnW + 6);
          if (tx >= bx && tx <= bx + btnW) {
            if (i !== diffIdx) {
              diffIdx = i;
              resetGame();
            }
          }
        });
        return;
      }

      // Grid tap
      const cell = cellAt(tx, ty2);
      if (!cell) return;

      longPressFired = false;
      longPressTimer = ctx.timeout(() => {
        longPressFired = true;
        toggleFlag(cell.r, cell.c);
      }, 300);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      const tx = e.changedTouches[0].clientX;
      const ty2 = e.changedTouches[0].clientY;

      if (longPressFired) { longPressFired = false; return; }
      // Cancel pending long press (ctx cleans the timer, we just flag it)
      longPressTimer = null;

      if (showInfo || gameState === 'dead' || gameState === 'won') return;

      // Check difficulty buttons
      if (ty2 >= DIFF_BTN_Y && ty2 <= DIFF_BTN_Y + DIFF_BTN_H) return;

      const cell = cellAt(tx, ty2);
      if (!cell) return;

      if (gameState === 'idle' || gameState === 'playing') {
        revealCell(cell.r, cell.c);
        if (gameState === 'playing' || gameState === 'idle') gameState = 'playing';
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
