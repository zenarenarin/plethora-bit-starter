window.plethoraBit = {
  meta: {
    title: 'Suguru',
    author: 'plethora',
    description: 'Fill regions with numbers — no touching duplicates.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#8D6E63';
    const ACCENT_LIGHT = '#BCAAA4';
    const BG = '#0f0f14';
    const CELL_BG = '#1a1a26';
    const CONFLICT_COLOR = '#ef5350';

    const REGION_TINTS = [
      'rgba(141,110, 99, 0.13)',
      'rgba(161,136,127, 0.13)',
      'rgba(255,204,128, 0.10)',
      'rgba(165,214,167, 0.10)',
      'rgba(129,212,250, 0.10)',
      'rgba(240,186,236, 0.10)',
      'rgba(255,171,145, 0.10)',
      'rgba(224,242,241, 0.10)',
    ];

    // ── Procedural generator ──────────────────────────────────────────────────
    function generatePuzzle(N = 5) {
      // Step 1: random region partition via flood fill
      const regionId = Array.from({length:N}, () => Array(N).fill(-1));
      const numRegions = 5 + Math.floor(Math.random() * 4);
      const regionCells = Array.from({length:numRegions}, () => []);
      // Random seeds
      const used = new Set();
      for (let i = 0; i < numRegions; i++) {
        let r, c;
        do { r = Math.floor(Math.random()*N); c = Math.floor(Math.random()*N); } while (used.has(r+','+c));
        used.add(r+','+c); regionId[r][c] = i; regionCells[i].push([r, c]);
      }
      // Flood-fill remaining cells
      let changed = true;
      while (changed) {
        changed = false;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (regionId[r][c] >= 0) continue;
          for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nr = r+dr, nc = c+dc;
            if (nr >= 0 && nr < N && nc >= 0 && nc < N && regionId[nr][nc] >= 0) {
              regionId[r][c] = regionId[nr][nc];
              regionCells[regionId[nr][nc]].push([r, c]);
              changed = true;
              break;
            }
          }
        }
      }

      // Step 2: fill numbers with backtracking
      const sol = Array.from({length:N}, () => Array(N).fill(0));
      const cells = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cells.push([r, c]);

      function canPlace(r, c, n) {
        const rid = regionId[r][c];
        if (n > regionCells[rid].length) return false;
        for (const [rr, rc] of regionCells[rid]) if (sol[rr][rc] === n) return false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r+dr, nc = c+dc;
          if (nr >= 0 && nr < N && nc >= 0 && nc < N && sol[nr][nc] === n) return false;
        }
        return true;
      }
      function solve(i = 0) {
        if (i === cells.length) return true;
        const [r, c] = cells[i];
        const rid = regionId[r][c];
        const sz = regionCells[rid].length;
        const nums = Array.from({length:sz}, (_, k) => k+1).sort(() => Math.random()-0.5);
        for (const n of nums) { if (canPlace(r, c, n)) { sol[r][c] = n; if (solve(i+1)) return true; sol[r][c] = 0; } }
        return false;
      }
      solve();

      // Generate clues (~30% of cells, but at least 1 per region)
      const clueSet = new Set();
      // Ensure at least one clue per region
      for (let rid = 0; rid < numRegions; rid++) {
        const rc = regionCells[rid];
        if (rc.length > 0) {
          const pick = rc[Math.floor(Math.random() * rc.length)];
          clueSet.add(pick[0] + ',' + pick[1]);
        }
      }
      // Random additional clues
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (Math.random() < 0.25) clueSet.add(r + ',' + c);
      }
      const clues = [...clueSet].map(k => k.split(',').map(Number));

      return { solution: sol, regionId, regionCells, clues, numRegions };
    }

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    // See-solution button
    let showSolution = false;
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let puzzle = null;
    let userGrid = null;
    let selectedCell = null;
    let gameStarted = false;
    let startTime = 0;
    let solveTime = 0;
    let solved = false;
    let solvedAt = 0;
    let audioCtx = null;
    let voices = [];

    const GRID_SIZE = 5;
    const HUD_H = 48;
    const NUMPAD_H = 72;

    function initPuzzle() {
      const p = generatePuzzle(GRID_SIZE);
      puzzle = p;
      userGrid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
      for (const [r, c] of puzzle.clues) {
        if (r < GRID_SIZE && c < GRID_SIZE) userGrid[r][c] = puzzle.solution[r][c];
      }
      selectedCell = null;
      gameStarted = false;
      startTime = 0;
      solveTime = 0;
      solved = false;
      solvedAt = 0;
      showSolution = false;
    }

    function isClue(r, c) {
      return puzzle.clues.some(([cr, cc]) => cr === r && cc === c);
    }

    function getRegionSize(regionId) {
      return puzzle.regionCells[regionId] ? puzzle.regionCells[regionId].length : 0;
    }

    function getRegionCells(regionId) {
      return (puzzle.regionCells[regionId] || []).map(([r, c]) => ({ r, c }));
    }

    function getMaxRegionId() {
      return puzzle.numRegions - 1;
    }

    function getConflicts() {
      const conflicts = new Set();
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const val = userGrid[r][c];
          if (!val) continue;
          const rid = puzzle.regionId[r][c];

          for (let r2 = 0; r2 < GRID_SIZE; r2++)
            for (let c2 = 0; c2 < GRID_SIZE; c2++) {
              if (r2 === r && c2 === c) continue;
              if (puzzle.regionId[r2][c2] === rid && userGrid[r2][c2] === val) {
                conflicts.add(`${r},${c}`);
                conflicts.add(`${r2},${c2}`);
              }
            }

          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              if (!dr && !dc) continue;
              const nr = r + dr, nc = c + dc;
              if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
              if (userGrid[nr][nc] === val) {
                conflicts.add(`${r},${c}`);
                conflicts.add(`${nr},${nc}`);
              }
            }
        }
      }
      return conflicts;
    }

    function checkSolved() {
      const maxRid = getMaxRegionId();
      for (let rid = 0; rid <= maxRid; rid++) {
        const cells = getRegionCells(rid);
        const size = cells.length;
        const nums = new Set();
        for (const { r, c } of cells) {
          if (!userGrid[r][c]) return false;
          nums.add(userGrid[r][c]);
        }
        if (nums.size !== size) return false;
        for (const n of nums) if (n < 1 || n > size) return false;
      }
      if (getConflicts().size > 0) return false;
      return true;
    }

    function getLayout() {
      const availH = USABLE_H - HUD_H - NUMPAD_H - 20;
      const availW = W - 24;
      const cellByW = Math.floor(availW / GRID_SIZE);
      const cellByH = Math.floor(availH / GRID_SIZE);
      const CELL = Math.min(cellByW, cellByH, 66);
      const gridW = CELL * GRID_SIZE;
      const gridH = CELL * GRID_SIZE;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + 10 + Math.floor((availH - gridH) / 2);
      return { CELL, gridW, gridH, ox, oy };
    }

    function cellAt(x, y, layout) {
      const { CELL, ox, oy } = layout;
      const gx = x - ox, gy = y - oy;
      if (gx < 0 || gy < 0) return null;
      const c = Math.floor(gx / CELL), r = Math.floor(gy / CELL);
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return null;
      return { r, c };
    }

    function isRegionBorder(r, c, side) {
      const rid = puzzle.regionId[r][c];
      if (side === 'top')    return r === 0 || puzzle.regionId[r-1][c] !== rid;
      if (side === 'bottom') return r === GRID_SIZE-1 || puzzle.regionId[r+1][c] !== rid;
      if (side === 'left')   return c === 0 || puzzle.regionId[r][c-1] !== rid;
      if (side === 'right')  return c === GRID_SIZE-1 || puzzle.regionId[r][c+1] !== rid;
      return false;
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

    function playPlace() { playNote(550, 0.08, 0.1); }
    function playConflict() { playNote(200, 0.1, 0.08); }
    function playSolve() {
      [440, 554, 659, 880].forEach((f, i) => ctx.timeout(() => playNote(f, 0.5, 0.15), i * 80));
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
      const conflicts = getConflicts();

      // HUD
      g.fillStyle = '#ffffff12';
      g.fillRect(0, 0, W, HUD_H);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('SUGURU', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Draw region tints
      const maxRid = getMaxRegionId();
      for (let rid = 0; rid <= maxRid; rid++) {
        const cells = getRegionCells(rid);
        g.fillStyle = REGION_TINTS[rid % REGION_TINTS.length];
        for (const { r, c } of cells) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          g.fillRect(cx, cy, CELL, CELL);
        }
      }

      // Draw cells
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const val = userGrid[r][c];
          const clue = isClue(r, c);
          const isSelected = selectedCell && selectedCell.r === r && selectedCell.c === c;
          const hasConflict = conflicts.has(`${r},${c}`);

          if (isSelected) {
            g.fillStyle = '#2a2040';
            g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            g.strokeStyle = ACCENT;
            g.lineWidth = 2;
            g.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
          }

          if (val > 0) {
            g.font = `${clue ? 'bold' : ''} ${Math.floor(CELL * 0.44)}px -apple-system, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            if (hasConflict) {
              g.fillStyle = CONFLICT_COLOR;
            } else if (clue) {
              g.fillStyle = ACCENT_LIGHT;
            } else {
              g.fillStyle = '#e0d0cc';
            }
            g.fillText(String(val), cx + CELL / 2, cy + CELL / 2);

            if (hasConflict) {
              g.shadowColor = CONFLICT_COLOR;
              g.shadowBlur = 8;
              g.fillText(String(val), cx + CELL / 2, cy + CELL / 2);
              g.shadowBlur = 0;
            }
          }
        }
      }

      // Draw region borders and inner grid lines
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;

          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + CELL, cy);
          if (isRegionBorder(r, c, 'top')) {
            g.strokeStyle = '#bcaaa4cc';
            g.lineWidth = 3;
          } else {
            g.strokeStyle = '#ffffff18';
            g.lineWidth = 1;
          }
          g.stroke();

          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx, cy + CELL);
          if (isRegionBorder(r, c, 'left')) {
            g.strokeStyle = '#bcaaa4cc';
            g.lineWidth = 3;
          } else {
            g.strokeStyle = '#ffffff18';
            g.lineWidth = 1;
          }
          g.stroke();

          if (r === GRID_SIZE - 1) {
            g.beginPath();
            g.moveTo(cx, cy + CELL);
            g.lineTo(cx + CELL, cy + CELL);
            g.strokeStyle = '#bcaaa4cc';
            g.lineWidth = 3;
            g.stroke();
          }

          if (c === GRID_SIZE - 1) {
            g.beginPath();
            g.moveTo(cx + CELL, cy);
            g.lineTo(cx + CELL, cy + CELL);
            g.strokeStyle = '#bcaaa4cc';
            g.lineWidth = 3;
            g.stroke();
          }
        }
      }

      // Numpad 1-5
      const NUMPAD_Y = oy + gridH + 14;
      const numCount = 5;
      const btnGap = 10;
      const totalBtnW = W - 48;
      const btnW = Math.floor((totalBtnW - btnGap * (numCount - 1)) / numCount);
      const btnH = Math.min(Math.floor(USABLE_H - NUMPAD_Y - 8), 54);
      const npStartX = Math.floor((W - (btnW * numCount + btnGap * (numCount - 1))) / 2);

      const selRid = selectedCell ? puzzle.regionId[selectedCell.r][selectedCell.c] : -1;
      const selMaxNum = selRid >= 0 ? getRegionSize(selRid) : 0;

      for (let i = 0; i < numCount; i++) {
        const num = i + 1;
        const nx = npStartX + i * (btnW + btnGap);
        const ny = NUMPAD_Y;
        const active = selectedCell && num <= selMaxNum;

        drawRoundRect(g, nx, ny, btnW, btnH, 10);
        if (active) {
          g.fillStyle = '#2a2030';
          g.fill();
          g.strokeStyle = ACCENT + '88';
          g.lineWidth = 1.5;
          g.stroke();
        } else {
          g.fillStyle = '#181820';
          g.fill();
          g.strokeStyle = '#ffffff10';
          g.lineWidth = 1;
          g.stroke();
        }

        g.font = `bold ${Math.floor(btnH * 0.48)}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = active ? ACCENT_LIGHT : '#555570';
        g.fillText(String(num), nx + btnW / 2, ny + btnH / 2);
      }

      const best = ctx.storage.get('bt_suguru');
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
        const ch = Math.min(Math.floor(USABLE_H * 0.80), 490);
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
        g.fillText('SUGURU', W / 2, cy2 + 52);
        const lx = cx2 + 20;
        let ty = cy2 + 74;
        const lh = 24;
        g.font = 'bold 10px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• The grid is divided into colored regions',
          '• Each region of size N must contain 1 to N once',
          '• No two touching cells (even diagonal) can share',
          '  the same number — across any region',
          '• Warm-tinted cells are given clues',
          '• Red numbers indicate a conflict',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh - 2; }
        ty += 6;
        g.font = 'bold 10px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        const controls = [
          'Tap a cell → select it (highlights valid numbers)',
          'Tap a number 1-5 → place it in selected cell',
          'Tap ? → reveal the solution',
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
        const best2 = ctx.storage.get('bt_suguru');
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
        for (let r = 0; r < GRID_SIZE; r++)
          for (let c = 0; c < GRID_SIZE; c++)
            userGrid[r][c] = puzzle.solution[r][c];
        if (!solved) {
          solved = true;
          solvedAt = performance.now();
          solveTime = gameStarted ? performance.now() - startTime : 0;
          const best = ctx.storage.get('bt_suguru') || 0;
          if (!best || (solveTime > 0 && solveTime < best)) ctx.storage.set('bt_suguru', solveTime);
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
      const { gridH, oy } = layout;

      // Numpad check
      const NUMPAD_Y = oy + gridH + 14;
      const numCount = 5;
      const btnGap = 10;
      const totalBtnW = W - 48;
      const btnW = Math.floor((totalBtnW - btnGap * (numCount - 1)) / numCount);
      const btnH = Math.min(Math.floor(USABLE_H - NUMPAD_Y - 8), 54);
      const npStartX = Math.floor((W - (btnW * numCount + btnGap * (numCount - 1))) / 2);

      if (ty >= NUMPAD_Y && ty <= NUMPAD_Y + btnH) {
        for (let i = 0; i < numCount; i++) {
          const num = i + 1;
          const nx = npStartX + i * (btnW + btnGap);
          if (tx >= nx && tx <= nx + btnW) {
            if (!selectedCell) return;
            if (isClue(selectedCell.r, selectedCell.c)) return;
            const maxNum = getRegionSize(puzzle.regionId[selectedCell.r][selectedCell.c]);
            if (num > maxNum) { playConflict(); return; }

            if (!gameStarted) {
              ctx.platform.start();
              gameStarted = true;
              startTime = performance.now();
            }
            ctx.platform.interact({ type: 'tap' });
            ctx.platform.haptic('light');

            if (userGrid[selectedCell.r][selectedCell.c] === num) {
              userGrid[selectedCell.r][selectedCell.c] = 0;
              playPlace();
            } else {
              userGrid[selectedCell.r][selectedCell.c] = num;
              playPlace();
              if (checkSolved()) {
                solved = true;
                solvedAt = performance.now();
                solveTime = performance.now() - startTime;
                const best = ctx.storage.get('bt_suguru') || 0;
                if (!best || solveTime < best) ctx.storage.set('bt_suguru', solveTime);
                ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
                playSolve();
              }
            }
            return;
          }
        }
      }

      const cell = cellAt(tx, ty, layout);
      if (cell) {
        ctx.platform.haptic('light');
        if (selectedCell && selectedCell.r === cell.r && selectedCell.c === cell.c) {
          selectedCell = null;
        } else {
          selectedCell = cell;
        }
        return;
      }

      selectedCell = null;
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
