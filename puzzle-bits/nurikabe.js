window.plethoraBit = {
  meta: {
    title: 'Nurikabe',
    author: 'plethora',
    description: 'Divide the grid into islands and river.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#7C83FD';
    const BG = '#0f0f14';

    const N = 7;

    function generatePuzzle(size) {
      size = size || N;
      const ISLAND_CONFIGS = [
        [2, 2, 2, 3],
        [2, 3, 3, 2],
        [3, 2, 2, 3],
        [2, 2, 3, 3],
        [2, 3, 2, 2],
        [3, 3, 2, 2],
      ];
      const sizes = ISLAND_CONFIGS[Math.floor(Math.random() * ISLAND_CONFIGS.length)];

      // grid: -1=river(unplaced), >=0 will be island
      const gridState = Array.from({length: size}, () => Array(size).fill(-1));
      const islandId = Array.from({length: size}, () => Array(size).fill(-1));

      for (let s = 0; s < sizes.length; s++) {
        let placed = false;
        for (let attempt = 0; attempt < 80 && !placed; attempt++) {
          const r = Math.floor(Math.random() * size);
          const c = Math.floor(Math.random() * size);
          if (gridState[r][c] !== -1) continue;

          const cells = [[r, c]];
          const visited = new Set([r * size + c]);
          let ok = true;

          for (let i = 0; i < sizes[s] - 1 && ok; i++) {
            // Try to expand from a random existing cell
            let expanded = false;
            const shuffled = [...cells].sort(() => Math.random() - 0.5);
            for (const [cr, cc] of shuffled) {
              const dirs = [[0,1],[0,-1],[1,0],[-1,0]].filter(([dr, dc]) => {
                const nr = cr + dr, nc = cc + dc;
                return nr >= 0 && nr < size && nc >= 0 && nc < size &&
                  !visited.has(nr * size + nc) && gridState[nr][nc] === -1;
              });
              if (dirs.length) {
                const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
                cells.push([cr + dr, cc + dc]);
                visited.add((cr + dr) * size + (cc + dc));
                expanded = true;
                break;
              }
            }
            if (!expanded) { ok = false; }
          }
          if (!ok) continue;

          // Check no adjacency to existing islands
          let adjOk = true;
          for (const [cr, cc] of cells) {
            for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
              const nr = cr + dr, nc = cc + dc;
              if (nr >= 0 && nr < size && nc >= 0 && nc < size &&
                  islandId[nr][nc] >= 0 && !visited.has(nr * size + nc)) {
                adjOk = false;
                break;
              }
            }
            if (!adjOk) break;
          }
          if (!adjOk) continue;

          // Place island
          for (const [cr, cc] of cells) {
            gridState[cr][cc] = 0; // white island cell (non-numbered)
            islandId[cr][cc] = s;
          }
          // First cell holds the number
          gridState[cells[0][0]][cells[0][1]] = sizes[s];
          placed = true;
        }
      }

      // solution: 0=white(island), 1=black(river)
      const solution = gridState.map(row => row.map(v => v === -1 ? 1 : 0));
      // clues: positive number = island seed, 0 = plain white island cell, -1 = river
      const clues = gridState.map(row => row.map(v => v > 0 ? v : (v === 0 ? 0 : -1)));

      return { clues, solution };
    }

    // Eye/solution button
    const IBTN = { x: W - 22, y: 8, r: 14 };
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let showInfo = false;
    let showSolution = false;
    let currentPuzzle = generatePuzzle();

    let cells; // 0=unknown, 1=white, 2=black, 3=locked-white, 4=locked-black
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let rippleAnim = null;
    let cellAnims = {};
    let longPressTimer = null;
    let touchStartCell = null;
    let audioCtx = null;

    function initPuzzle() {
      currentPuzzle = generatePuzzle();
      cells = Array.from({ length: N }, (_, r) =>
        Array.from({ length: N }, (_, c) =>
          currentPuzzle.clues[r][c] > 0 ? 1 : 0 // numbered cells start white
        )
      );
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      rippleAnim = null;
      cellAnims = {};
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 56;
      const pad = 20;
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

    function checkSolved() {
      const p = currentPuzzle;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const want = p.solution[r][c];
          const have = (cells[r][c] === 1 || cells[r][c] === 3) ? 1 : (cells[r][c] === 2 || cells[r][c] === 4) ? 0 : -1;
          if (have === -1 || want !== have) return false;
        }
      for (let r = 0; r < N - 1; r++)
        for (let c = 0; c < N - 1; c++) {
          const isBlack = (v) => v === 2 || v === 4;
          if (isBlack(cells[r][c]) && isBlack(cells[r][c+1]) && isBlack(cells[r+1][c]) && isBlack(cells[r+1][c+1])) return false;
        }
      return true;
    }

    function triggerSolve(now) {
      solved = true;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_nurikabe') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_nurikabe', solveTime);
      ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
      const cellList = [];
      for (let d = 0; d < N * 2; d++)
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
          if (Math.abs(r - 3) + Math.abs(c - 3) === d)
            cellList.push({ r, c, delay: d * 50 });
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
      o.frequency.value = 440;
      o.type = 'triangle';
      gn.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    }

    function playChord() {
      if (!audioCtx) return;
      [392, 493.88, 587.33, 783.99].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        gn.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.06);
        gn.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + i * 0.06 + 0.06);
        gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.06 + 0.7);
        o.start(audioCtx.currentTime + i * 0.06);
        o.stop(audioCtx.currentTime + i * 0.06 + 0.7);
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

    function drawRiverDots(g2, x, y, w, h) {
      g2.fillStyle = 'rgba(124,131,253,0.07)';
      const spacing = 6;
      for (let dx = spacing; dx < w - 2; dx += spacing) {
        for (let dy = spacing; dy < h - 2; dy += spacing) {
          g2.beginPath();
          g2.arc(x + dx, y + dy, 0.8, 0, Math.PI * 2);
          g2.fill();
        }
      }
    }

    function getConflicts() {
      const conflicted = new Set();
      for (let r = 0; r < N - 1; r++)
        for (let c = 0; c < N - 1; c++) {
          const isBlack = (v) => v === 2 || v === 4;
          if (isBlack(cells[r][c]) && isBlack(cells[r][c+1]) && isBlack(cells[r+1][c]) && isBlack(cells[r+1][c+1])) {
            [`${r},${c}`, `${r},${c+1}`, `${r+1},${c}`, `${r+1},${c+1}`].forEach(k => conflicted.add(k));
          }
        }
      return conflicted;
    }

    initPuzzle();

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const p = currentPuzzle;
      const { CELL, ox, oy } = getLayout();
      const conflicts = getConflicts();

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = '#ffffff11';
      g.fillRect(0, 0, W, 48);
      g.font = `bold 15px -apple-system, sans-serif`;
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('NURIKABE', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Grid
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const x = ox + c * CELL;
          const y = oy + r * CELL;
          const val = cells[r][c];
          const clue = p.clues[r][c];
          const isBlack = val === 2 || val === 4;
          const isWhite = val === 1 || val === 3;
          const isConflict = conflicts.has(`${r},${c}`);
          const scale = getCellScale(r, c, now);
          const pad2 = CELL * (1 - scale) / 2;
          const sz = CELL - 1;

          let rippleAlpha = 0;
          if (rippleAnim) {
            const entry = rippleAnim.cells.find(e => e.r === r && e.c === c);
            if (entry) {
              const t = (now - rippleAnim.startTime - entry.delay) / 350;
              if (t > 0 && t < 1) rippleAlpha = Math.sin(t * Math.PI);
            }
          }

          g.save();
          g.translate(x + pad2, y + pad2);
          g.beginPath();
          drawRoundRect(g, 0, 0, sz * scale, sz * scale, 3);

          if (isBlack) {
            g.fillStyle = isConflict ? '#4a1010' : '#1a1a2e';
            g.fill();
            drawRiverDots(g, 0, 0, sz * scale, sz * scale);
            if (val === 4) {
              g.strokeStyle = ACCENT + '88';
              g.lineWidth = 1.5;
              g.stroke();
            }
          } else if (isWhite || clue > 0) {
            if (rippleAlpha > 0) {
              g.fillStyle = `rgba(124,131,253,${0.15 + rippleAlpha * 0.3})`;
            } else {
              g.fillStyle = clue > 0 ? '#e8e8f0' : '#c8c8d8';
            }
            g.fill();
            if (val === 3) {
              g.strokeStyle = ACCENT;
              g.lineWidth = 1.5;
              g.stroke();
            }
          } else {
            g.fillStyle = '#252535';
            g.fill();
          }

          if (clue > 0) {
            g.font = `bold ${Math.floor(CELL * 0.42)}px -apple-system, sans-serif`;
            g.fillStyle = ACCENT;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(String(clue), sz * scale / 2, sz * scale / 2);
          }

          g.restore();
        }
      }

      // Grid border
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 1;
      g.strokeRect(ox, oy, N * CELL, N * CELL);

      g.strokeStyle = '#ffffff11';
      g.lineWidth = 0.5;
      for (let i = 1; i < N; i++) {
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
        g.fillText('NURIKABE', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty = cy2 + 80;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Numbered cells are island seeds',
          '• Each island has exactly as many white cells as its number',
          '• Islands cannot touch each other side by side',
          '• All black cells form one connected river',
          '• No 2×2 block of black cells allowed',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;

        const controls = [
          'Tap → cycle unknown / black / white',
          'Long-press → lock a cell',
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
        if (elapsed2 > 1000) {
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
          const best = ctx.storage.get('bt_nurikabe') || 0;
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
        // Fill cells with solution values
        // solution: 1=white island, 0=black river
        // cells: 1=white, 2=black
        const sol = currentPuzzle.solution;
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++) {
            if (currentPuzzle.clues[r][c] > 0) continue; // skip numbered cells
            cells[r][c] = sol[r][c] === 1 ? 1 : 2;
          }
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved && rippleAnim && performance.now() - rippleAnim.startTime > 1000) {
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
          const p = currentPuzzle;
          if (p.clues[r][c] > 0) return;
          const v = cells[r][c];
          if (v === 1) cells[r][c] = 3;
          else if (v === 3) cells[r][c] = 1;
          else if (v === 2) cells[r][c] = 4;
          else if (v === 4) cells[r][c] = 2;
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

      const p = currentPuzzle;
      if (p.clues[r][c] > 0) return;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      const v = cells[r][c];
      if (v === 0) cells[r][c] = 2;
      else if (v === 2) cells[r][c] = 1;
      else if (v === 1) cells[r][c] = 0;
      else if (v === 3) cells[r][c] = 0;
      else if (v === 4) cells[r][c] = 0;

      animCell(r, c);
      playTap();
      ctx.platform.interact({ type: 'tap' });

      if (checkSolved()) triggerSolve(performance.now());
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
