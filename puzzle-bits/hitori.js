window.plethoraBit = {
  meta: {
    title: 'Hitori',
    author: 'plethora',
    description: 'Shade numbers so none repeat in any row or column.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FF6B6B';
    const BG = '#0f0f14';
    const N = 6;

    function generatePuzzle(size) {
      size = size || N;
      function shuffleArr(a) {
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }

      // Build a Latin square by row-shifting a shuffled base row
      const row0 = shuffleArr(Array.from({length: size}, (_, i) => i + 1));
      const latin = Array.from({length: size}, (_, r) =>
        Array.from({length: size}, (_, c) => row0[(c + r) % size])
      );

      // Solution starts all-unshaded
      const solution = Array.from({length: size}, () => Array(size).fill(0));
      const grid = latin.map(r => [...r]);

      // Try to shade ~size*1.5 cells by injecting duplicates
      const tries = size * 3;
      for (let t = 0; t < tries; t++) {
        const r = Math.floor(Math.random() * size);
        const c = Math.floor(Math.random() * size);
        if (solution[r][c]) continue;

        // Find a candidate to duplicate from same row or col
        const sameRow = Array.from({length: size}, (_, i) => i).filter(i => i !== c && !solution[r][i]);
        const sameCol = Array.from({length: size}, (_, i) => i).filter(i => i !== r && !solution[i][c]);
        const targets = [
          ...sameRow.map(i => [r, i]),
          ...sameCol.map(i => [i, c]),
        ];
        if (!targets.length) continue;

        const [tr, tc] = targets[Math.floor(Math.random() * targets.length)];
        const origVal = grid[r][c];
        grid[r][c] = grid[tr][tc]; // make r,c a duplicate
        solution[r][c] = 1;

        // Check no two adjacent shaded cells
        const adj = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
        if (adj.some(([ar, ac]) => ar >= 0 && ar < size && ac >= 0 && ac < size && solution[ar][ac])) {
          // Undo
          grid[r][c] = origVal;
          solution[r][c] = 0;
        }
      }

      return { grid, solution };
    }

    // Eye/solution button — positioned below info button
    const IBTN = { x: W - 22, y: 8, r: 14 };
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let showInfo = false;
    let showSolution = false;
    let currentPuzzle = generatePuzzle();

    let cells; // 0=normal, 1=shaded, 2=circled
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let rippleAnim = null;
    let cellAnims = {};
    let conflictFlash = {};
    let longPressTimer = null;
    let touchStartCell = null;
    let audioCtx = null;

    function initPuzzle() {
      currentPuzzle = generatePuzzle();
      cells = Array.from({ length: N }, () => Array(N).fill(0));
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      rippleAnim = null;
      cellAnims = {};
      conflictFlash = {};
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 56;
      const pad = 24;
      const avail = Math.min(W - pad * 2, USABLE_H - HUD_H - pad * 2);
      const CELL = Math.floor(avail / N);
      const gridW = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + Math.floor((USABLE_H - HUD_H - gridW) / 2);
      return { CELL, ox, oy };
    }

    function cellAt(x, y) {
      const { CELL, ox, oy } = getLayout();
      const c = Math.floor((x - ox) / CELL);
      const r = Math.floor((y - oy) / CELL);
      if (r < 0 || r >= N || c < 0 || c >= N) return null;
      return { r, c };
    }

    function animCell(r, c) {
      cellAnims[`${r},${c}`] = { start: performance.now() };
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
      return 0.6 + 0.4 * easeOutBack(t);
    }

    function getConflicts() {
      const p = currentPuzzle;
      const conflicted = new Set();
      for (let r = 0; r < N; r++) {
        const seen = {};
        for (let c = 0; c < N; c++) {
          if (cells[r][c] === 1) continue;
          const num = p.grid[r][c];
          if (seen[num] !== undefined) {
            conflicted.add(`${r},${seen[num]}`);
            conflicted.add(`${r},${c}`);
          } else {
            seen[num] = c;
          }
        }
      }
      for (let c = 0; c < N; c++) {
        const seen = {};
        for (let r = 0; r < N; r++) {
          if (cells[r][c] === 1) continue;
          const num = p.grid[r][c];
          if (seen[num] !== undefined) {
            conflicted.add(`${seen[num]},${c}`);
            conflicted.add(`${r},${c}`);
          } else {
            seen[num] = r;
          }
        }
      }
      return conflicted;
    }

    function getAdjacencyConflicts() {
      const bad = new Set();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (cells[r][c] !== 1) continue;
        if (r > 0 && cells[r-1][c] === 1) { bad.add(`${r},${c}`); bad.add(`${r-1},${c}`); }
        if (r < N-1 && cells[r+1][c] === 1) { bad.add(`${r},${c}`); bad.add(`${r+1},${c}`); }
        if (c > 0 && cells[r][c-1] === 1) { bad.add(`${r},${c}`); bad.add(`${r},${c-1}`); }
        if (c < N-1 && cells[r][c+1] === 1) { bad.add(`${r},${c}`); bad.add(`${r},${c+1}`); }
      }
      return bad;
    }

    function checkSolved() {
      const p = currentPuzzle;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (cells[r][c] !== p.solution[r][c]) return false;
      }
      if (getConflicts().size > 0) return false;
      if (getAdjacencyConflicts().size > 0) return false;
      return true;
    }

    function triggerSolve(now) {
      solved = true;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_hitori') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_hitori', solveTime);
      ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
      const cellList = [];
      for (let d = 0; d < N * 2; d++)
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
          if (Math.abs(r - 2) + Math.abs(c - 2) === d)
            cellList.push({ r, c, delay: d * 55 });
      rippleAnim = { cells: cellList, startTime: now };
      playChord();
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 660;
      o.type = 'square';
      gn.gain.setValueAtTime(0.07, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }

    function playBuzz() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 150;
      o.type = 'sawtooth';
      gn.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      o.start(); o.stop(audioCtx.currentTime + 0.15);
    }

    function playChord() {
      if (!audioCtx) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        gn.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.05);
        gn.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + i * 0.05 + 0.05);
        gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.05 + 0.7);
        o.start(audioCtx.currentTime + i * 0.05);
        o.stop(audioCtx.currentTime + i * 0.05 + 0.7);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function drawRoundRect(g2, x, y, w, h, r2) {
      if (g2.roundRect) { g2.roundRect(x, y, w, h, r2); return; }
      g2.beginPath();
      g2.moveTo(x + r2, y);
      g2.lineTo(x + w - r2, y); g2.arcTo(x + w, y, x + w, y + r2, r2);
      g2.lineTo(x + w, y + h - r2); g2.arcTo(x + w, y + h, x + w - r2, y + h, r2);
      g2.lineTo(x + r2, y + h); g2.arcTo(x, y + h, x, y + h - r2, r2);
      g2.lineTo(x, y + r2); g2.arcTo(x, y, x + r2, y, r2);
      g2.closePath();
    }

    initPuzzle();

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const p = currentPuzzle;
      const { CELL, ox, oy } = getLayout();
      const conflicts = getConflicts();
      const adjConflicts = getAdjacencyConflicts();
      const allConflicts = new Set([...conflicts, ...adjConflicts]);

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = '#ffffff11';
      g.fillRect(0, 0, W, 48);
      g.font = `bold 15px -apple-system, sans-serif`;
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('HITORI', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Grid cells
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const x = ox + c * CELL;
          const y = oy + r * CELL;
          const val = cells[r][c];
          const num = p.grid[r][c];
          const isConflict = allConflicts.has(`${r},${c}`);
          const scale = getCellScale(r, c, now);
          const pad2 = CELL * (1 - scale) / 2;
          const sz = CELL - 2;

          let rippleAlpha = 0;
          if (rippleAnim) {
            const entry = rippleAnim.cells.find(e => e.r === r && e.c === c);
            if (entry) {
              const t = (now - rippleAnim.startTime - entry.delay) / 300;
              if (t > 0 && t < 1) rippleAlpha = Math.sin(t * Math.PI);
            }
          }

          g.save();
          g.translate(x + pad2, y + pad2);

          g.beginPath();
          drawRoundRect(g, 0, 0, sz * scale, sz * scale, 4);

          if (val === 1) {
            if (isConflict) {
              const flash = 0.5 + 0.5 * Math.sin(now * 0.008);
              g.fillStyle = `rgba(255,60,60,${0.7 + flash * 0.3})`;
            } else {
              g.fillStyle = ACCENT;
              if (rippleAlpha > 0) {
                g.fillStyle = `rgba(255, 180, 180, ${0.7 + rippleAlpha * 0.3})`;
              }
            }
            g.fill();
            g.shadowColor = ACCENT;
            g.shadowBlur = 12 * scale;
            g.fill();
            g.shadowBlur = 0;
          } else {
            if (isConflict) {
              const flash = 0.5 + 0.5 * Math.sin(now * 0.008);
              g.fillStyle = `rgba(60,10,10,${0.8 + flash * 0.2})`;
            } else {
              g.fillStyle = '#21213a';
            }
            g.fill();

            if (val === 2) {
              g.strokeStyle = ACCENT + 'aa';
              g.lineWidth = 2;
              g.beginPath();
              const m = sz * scale * 0.15;
              const d = sz * scale - m * 2;
              g.arc(m + d / 2, m + d / 2, d / 2, 0, Math.PI * 2);
              g.stroke();
            }

            g.font = `bold ${Math.floor(CELL * 0.44)}px -apple-system, sans-serif`;
            g.fillStyle = isConflict ? '#ff8888' : '#e8e8f0';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(String(num), sz * scale / 2, sz * scale / 2);
          }

          g.restore();
        }
      }

      // Grid lines
      g.strokeStyle = '#ffffff18';
      g.lineWidth = 0.5;
      for (let i = 0; i <= N; i++) {
        g.beginPath();
        g.moveTo(ox + i * CELL, oy);
        g.lineTo(ox + i * CELL, oy + N * CELL);
        g.stroke();
        g.beginPath();
        g.moveTo(ox, oy + i * CELL);
        g.lineTo(ox + N * CELL, oy + i * CELL);
        g.stroke();
      }

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
        g.fillText('HITORI', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty = cy2 + 80;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Shade cells so no number repeats in any row',
          '• Shade cells so no number repeats in any column',
          '• Two shaded cells cannot be side-by-side',
          '• All unshaded cells must stay connected',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;

        const controls = [
          'Tap → toggle shade',
          'Long-press → circle (lock as unshaded)',
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
        if (elapsed2 > 900) {
          g.fillStyle = 'rgba(15,15,20,0.88)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `bold 36px -apple-system, sans-serif`;
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT;
          g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = `18px -apple-system, sans-serif`;
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 16);
          const best = ctx.storage.get('bt_hitori') || 0;
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
        const sol = currentPuzzle.solution;
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++)
            cells[r][c] = sol[r][c]; // 0=unshaded, 1=shaded
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved && rippleAnim && performance.now() - rippleAnim.startTime > 900) {
        initPuzzle();
        return;
      }

      const touch = e.changedTouches[0];
      const cell = cellAt(touch.clientX, touch.clientY);
      if (!cell) return;
      touchStartCell = cell;

      longPressTimer = ctx.timeout(() => {
        if (touchStartCell) {
          const { r, c } = touchStartCell;
          cells[r][c] = cells[r][c] === 2 ? 0 : 2;
          animCell(r, c);
          ctx.platform.haptic('medium');
          touchStartCell = null;
        }
      }, 300);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!touchStartCell) return;
      const { r, c } = touchStartCell;
      touchStartCell = null;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      const v = cells[r][c];
      if (v === 0) cells[r][c] = 1;
      else if (v === 1) cells[r][c] = 0;
      else if (v === 2) cells[r][c] = 1;

      animCell(r, c);

      const newConflicts = getConflicts();
      const newAdj = getAdjacencyConflicts();
      if (newConflicts.size > 0 || newAdj.size > 0) {
        playBuzz();
      } else {
        playTap();
      }
      ctx.platform.interact({ type: 'tap' });

      if (checkSolved()) triggerSolve(performance.now());
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
