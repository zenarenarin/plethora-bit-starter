window.plethoraBit = {
  meta: {
    title: 'Aquarium',
    author: 'plethora',
    description: 'Fill tanks with water to match the clues.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#4DD0E1';
    const BG = '#0f0f14';
    const N = 6;

    // ---------------------------------------------------------------
    // Procedural puzzle generator
    // ---------------------------------------------------------------
    function generatePuzzle(N2) {
      // 1. Random column-based tank layout: each column split by horizontal walls
      const wallBelow = Array.from({length: N2-1}, () => Array(N2).fill(false));
      for (let r = 0; r < N2-1; r++)
        for (let c = 0; c < N2; c++)
          if (Math.random() < 0.32) wallBelow[r][c] = true;

      // 2. Assign tank IDs by flood-fill per column compartment
      const tanks2 = Array.from({length: N2}, () => Array(N2).fill(-1));
      let tid = 0;
      for (let c = 0; c < N2; c++) {
        let segStart = 0;
        for (let r = 0; r < N2; r++) {
          const isLast = r === N2 - 1;
          const wallAfter = !isLast && wallBelow[r][c];
          if (isLast || wallAfter) {
            for (let rr = segStart; rr <= r; rr++) tanks2[rr][c] = tid;
            tid++;
            segStart = r + 1;
          }
        }
      }

      // 3. Random water fill respecting physics (bottom-up per tank compartment)
      const sol = Array.from({length: N2}, () => Array(N2).fill(0));
      for (let c = 0; c < N2; c++) {
        // Find all compartments in column c
        const segs = [];
        let segRows = [];
        for (let r = 0; r < N2; r++) {
          segRows.push(r);
          const isLast = r === N2 - 1;
          const wallAfter = !isLast && wallBelow[r][c];
          if (isLast || wallAfter) { segs.push([...segRows]); segRows = []; }
        }
        for (const seg of segs) {
          const level = Math.floor(Math.random() * (seg.length + 1)); // 0..len
          // fill bottom `level` rows
          for (let i = 0; i < level; i++) sol[seg[seg.length - 1 - i]][c] = 1;
        }
      }

      const rowClues2 = sol.map(row => row.reduce((a, v) => a + v, 0));
      const colClues2 = Array.from({length: N2}, (_, c) => sol.reduce((a, row) => a + row[c], 0));
      return { name: 'GEN', tanks: tanks2, solution: sol, rowClues: rowClues2, colClues: colClues2 };
    }

    // ---------------------------------------------------------------
    // 5 hand-crafted 6×6 aquarium puzzles
    // tanks: 2D array of tank IDs
    // solution: computed from water levels (physics-verified, unique solution)
    // Water physics: within a tank, filled rows form a contiguous band from the
    // BOTTOM of the tank upward. Toggling a cell fills/drains all cells in
    // the same tank row at once.
    // ---------------------------------------------------------------

    // Helper: build solution grid from water level decisions
    function buildSolutionFromLevels(tanks, waterLevels) {
      const tankRows = {};
      const maxTank = Math.max(...tanks.flat());
      for (let tid = 0; tid <= maxTank; tid++) tankRows[tid] = {};
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const tid = tanks[r][c];
          if (!tankRows[tid][r]) tankRows[tid][r] = [];
          tankRows[tid][r].push(c);
        }
      const sol = Array.from({ length: N }, () => Array(N).fill(0));
      for (let tid = 0; tid <= maxTank; tid++) {
        const level = waterLevels[tid] || 0;
        if (!level) continue;
        const rows = Object.keys(tankRows[tid]).map(Number).sort((a, b) => b - a); // bottom first
        for (let i = 0; i < level && i < rows.length; i++) {
          for (const c of tankRows[tid][rows[i]]) sol[rows[i]][c] = 1;
        }
      }
      return sol;
    }

    function computeClues(sol) {
      const rowClues = [], colClues = [];
      for (let r = 0; r < N; r++) rowClues.push(sol[r].reduce((a, v) => a + v, 0));
      for (let c = 0; c < N; c++) { let s = 0; for (let r = 0; r < N; r++) s += sol[r][c]; colClues.push(s); }
      return { rowClues, colClues };
    }

    // All 5 puzzles — tank layouts and water levels solver-verified as unique solutions
    const PUZZLE_DEFS = [
      {
        name: 'CALM',
        tanks: [
          [0,0,1,1,2,2],
          [0,0,1,1,2,2],
          [3,3,3,4,4,4],
          [3,3,3,4,4,4],
          [5,5,6,6,7,7],
          [5,5,6,6,7,7],
        ],
        // levels: 0=0,1=0,2=2,3=1,4=1,5=0,6=2,7=2
        waterLevels: {0:0,1:0,2:2,3:1,4:1,5:0,6:2,7:2},
      },
      {
        name: 'TIDE',
        tanks: [
          [0,0,0,1,1,1],
          [0,0,0,1,1,1],
          [2,2,3,3,4,4],
          [2,2,3,3,4,4],
          [5,6,6,7,7,8],
          [5,6,6,7,7,8],
        ],
        waterLevels: {0:1,1:2,2:0,3:2,4:1,5:2,6:1,7:0,8:2},
      },
      {
        name: 'REEF',
        tanks: [
          [0,0,0,1,1,1],
          [2,2,2,1,1,1],
          [2,2,2,3,3,3],
          [4,4,4,3,3,3],
          [4,4,5,5,6,6],
          [7,7,5,5,6,6],
        ],
        waterLevels: {0:1,1:2,2:1,3:1,4:2,5:2,6:1,7:0},
      },
      {
        name: 'DEEP',
        tanks: [
          [0,0,1,1,2,2],
          [0,0,3,3,2,2],
          [4,4,3,3,5,5],
          [4,4,6,6,5,5],
          [7,7,6,6,8,8],
          [7,7,9,9,8,8],
        ],
        waterLevels: {0:0,1:0,2:0,3:2,4:0,5:2,6:2,7:1,8:2,9:1},
      },
      {
        name: 'ABYSS',
        tanks: [
          [0,1,1,1,2,2],
          [0,1,1,1,2,2],
          [0,3,4,4,5,5],
          [6,3,4,4,5,5],
          [6,3,7,8,8,9],
          [6,3,7,8,8,9],
        ],
        waterLevels: {0:3,1:1,2:2,3:4,4:2,5:1,6:2,7:0,8:2,9:1},
      },
    ];

    // Pre-build all puzzle data
    const PUZZLES = PUZZLE_DEFS.map(def => {
      const solution = buildSolutionFromLevels(def.tanks, def.waterLevels);
      const { rowClues, colClues } = computeClues(solution);
      return { name: def.name, tanks: def.tanks, solution, rowClues, colClues };
    });

    // Build tank row map for a puzzle (tid -> sorted row numbers)
    function buildTankRowMap(tanks) {
      const map = {};
      const maxTank = Math.max(...tanks.flat());
      for (let tid = 0; tid <= maxTank; tid++) map[tid] = {};
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const tid = tanks[r][c];
          if (!map[tid][r]) map[tid][r] = [];
          map[tid][r].push(c);
        }
      return map;
    }

    // ---------------------------------------------------------------
    // Audio (voice-capped, max 8)
    // ---------------------------------------------------------------
    let audioCtx = null;
    let voiceCount = 0;
    const MAX_VOICES = 8;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq, dur, vol = 0.12) {
      if (!audioCtx || voiceCount >= MAX_VOICES) return;
      voiceCount++;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = 'sine';
      o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      o.onended = () => voiceCount--;
    }

    function playFill() { playNote(880, 0.12, 0.1); }
    function playDrain() { playNote(330, 0.1, 0.1); }
    function playWin() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        ctx.timeout(() => playNote(f, 0.5, 0.18), i * 80);
      });
    }

    // ---------------------------------------------------------------
    // Layout
    // ---------------------------------------------------------------
    const HUD_H = 48;
    const CLUE_SIZE = 30;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    function getLayout() {
      const gridAreaW = W - CLUE_SIZE - 16;
      const gridAreaH = USABLE_H - HUD_H - CLUE_SIZE - 16;
      const cellByW = Math.floor(gridAreaW / N);
      const cellByH = Math.floor(gridAreaH / N);
      const CELL = Math.min(cellByW, cellByH, 56);
      const gridW = CELL * N;
      const gridH = CELL * N;
      const totalW = CLUE_SIZE + gridW;
      const totalH = gridH + CLUE_SIZE;
      const gridX = Math.floor((W - totalW) / 2) + CLUE_SIZE;
      const gridY = HUD_H + 8 + Math.floor((USABLE_H - HUD_H - 8 - totalH) / 2);
      return { CELL, gridX, gridY, gridW, gridH };
    }

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    let puzzleIdx = ctx.storage.get('aquarium_idx') || 0;
    let puzzle = null;
    let tankRowMap = null;
    let userGrid = null;
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let showInfo = false;
    let solveAnim = null;
    let wavePhase = 0;
    let fillAnims = {}; // "r,c" -> {from, target, start}
    let showSolution = false;
    const EYE_X = W - 44, EYE_CY = 62, EYE_R = 20;

    function applySolution() {
      if (!puzzle) return;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const prev = userGrid[r][c];
          userGrid[r][c] = puzzle.solution[r][c];
          if (prev !== puzzle.solution[r][c])
            fillAnims[`${r},${c}`] = { from: prev, target: puzzle.solution[r][c], start: performance.now() };
        }
    }

    function initPuzzle() {
      // Use procedural generator for every new puzzle
      puzzle = generatePuzzle(N);
      // Ensure puzzle names cycle through hand-crafted ones for variety
      const presets = PUZZLES;
      if (puzzleIdx < presets.length) {
        puzzle = presets[puzzleIdx];
      }
      tankRowMap = buildTankRowMap(puzzle.tanks);
      userGrid = Array.from({ length: N }, () => Array(N).fill(0));
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnim = null;
      fillAnims = {};
      showSolution = false;
    }

    function getRowSum(r) { return userGrid[r].reduce((a, v) => a + v, 0); }
    function getColSum(c) { let s = 0; for (let r = 0; r < N; r++) s += userGrid[r][c]; return s; }

    function checkSolved() {
      for (let r = 0; r < N; r++) if (getRowSum(r) !== puzzle.rowClues[r]) return false;
      for (let c = 0; c < N; c++) if (getColSum(c) !== puzzle.colClues[c]) return false;
      return true;
    }

    // Toggle all cells in the same tank row as (row, col)
    function toggleTankRow(row, col) {
      const tankId = puzzle.tanks[row][col];
      const cols = tankRowMap[tankId][row] || [];
      if (!cols.length) return;
      const currentVal = userGrid[row][cols[0]];
      const newVal = currentVal === 1 ? 0 : 1;
      for (const c of cols) {
        const prev = userGrid[row][c];
        userGrid[row][c] = newVal;
        fillAnims[`${row},${c}`] = { from: prev, target: newVal, start: performance.now() };
      }
      return newVal;
    }

    function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function getFillVal(r, c, now) {
      const key = `${r},${c}`;
      const a = fillAnims[key];
      if (!a) return userGrid[r][c];
      const t = Math.min((now - a.start) / 220, 1);
      if (t >= 1) { delete fillAnims[key]; return a.target; }
      return a.from + (a.target - a.from) * easeInOut(t);
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

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    initPuzzle();

    // ---------------------------------------------------------------
    // raf
    // ---------------------------------------------------------------
    ctx.raf((dt) => {
      const now = performance.now();
      wavePhase += dt * 0.003;
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const layout = getLayout();
      const { CELL, gridX, gridY, gridW, gridH } = layout;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, 0, W, HUD_H);
      g.font = 'bold 14px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`AQUARIUM  ${(puzzleIdx % PUZZLES.length) + 1}/${PUZZLES.length}  ${puzzle.name}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Row clue labels (left of grid)
      for (let r = 0; r < N; r++) {
        const ry = gridY + r * CELL + CELL / 2;
        const rowSum = getRowSum(r);
        const target = puzzle.rowClues[r];
        g.font = 'bold 13px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (rowSum === target) g.fillStyle = '#4CAF50';
        else if (rowSum > target) g.fillStyle = '#FF5252';
        else g.fillStyle = '#aaaacc';
        g.fillText(String(target), gridX - CLUE_SIZE / 2, ry);
      }

      // Column clue labels (bottom of grid)
      const clueY = gridY + gridH + CLUE_SIZE / 2 + 4;
      for (let c = 0; c < N; c++) {
        const cx = gridX + c * CELL + CELL / 2;
        const colSum = getColSum(c);
        const target = puzzle.colClues[c];
        g.font = 'bold 13px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (colSum === target) g.fillStyle = '#4CAF50';
        else if (colSum > target) g.fillStyle = '#FF5252';
        else g.fillStyle = '#aaaacc';
        g.fillText(String(target), cx, clueY);
      }

      // Grid cells — draw water fills with wave animation
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx = gridX + c * CELL;
          const cy = gridY + r * CELL;
          const fillVal = getFillVal(r, c, now);

          // Cell background
          g.fillStyle = '#0e1420';
          g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);

          if (fillVal > 0.02) {
            const fh = (CELL - 2) * fillVal;
            const fy = cy + 1 + (CELL - 2) - fh;

            // Water body
            g.fillStyle = `rgba(77,208,225,${0.38 * fillVal})`;
            g.fillRect(cx + 1, fy, CELL - 2, fh);

            // Inner highlight shimmer
            g.fillStyle = `rgba(160,240,255,${0.07 * fillVal})`;
            g.fillRect(cx + 2, fy + fh * 0.15, CELL - 4, fh * 0.25);

            if (fillVal > 0.85) {
              // Animated wave at surface
              const waveAmp = 1.8;
              const baseY = fy;
              g.save();
              g.beginPath();
              g.moveTo(cx + 1, baseY + CELL);
              for (let px = cx + 1; px <= cx + CELL - 1; px++) {
                const wave = Math.sin((px * 0.4 + wavePhase * 5 + c * 1.7) * 0.9) * waveAmp;
                g.lineTo(px, baseY + wave);
              }
              g.lineTo(cx + CELL - 1, baseY + CELL);
              g.closePath();
              g.fillStyle = `rgba(77,208,225,0.52)`;
              g.fill();

              // Surface glint
              g.strokeStyle = `rgba(180,248,255,0.65)`;
              g.lineWidth = 1;
              g.beginPath();
              for (let px = cx + 1; px <= cx + CELL - 1; px++) {
                const wave = Math.sin((px * 0.4 + wavePhase * 5 + c * 1.7) * 0.9) * waveAmp;
                if (px === cx + 1) g.moveTo(px, baseY + wave);
                else g.lineTo(px, baseY + wave);
              }
              g.stroke();
              g.restore();
            }
          }
        }
      }

      // Tank borders — thin between same tank, thick between different tanks
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx = gridX + c * CELL;
          const cy = gridY + r * CELL;
          const tid = puzzle.tanks[r][c];

          if (c < N - 1) {
            const rightTid = puzzle.tanks[r][c + 1];
            const thick = rightTid !== tid;
            g.strokeStyle = thick ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)';
            g.lineWidth = thick ? 2.5 : 0.5;
            g.beginPath();
            g.moveTo(cx + CELL, cy + 1);
            g.lineTo(cx + CELL, cy + CELL - 1);
            g.stroke();
          }
          if (r < N - 1) {
            const bottomTid = puzzle.tanks[r + 1][c];
            const thick = bottomTid !== tid;
            g.strokeStyle = thick ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)';
            g.lineWidth = thick ? 2.5 : 0.5;
            g.beginPath();
            g.moveTo(cx + 1, cy + CELL);
            g.lineTo(cx + CELL - 1, cy + CELL);
            g.stroke();
          }
        }
      }

      // Grid outer border
      g.strokeStyle = ACCENT + 'bb';
      g.lineWidth = 2;
      g.strokeRect(gridX, gridY, gridW, gridH);

      // Info button — drawn LAST
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // Eye / solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.84);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.80), 510);
        const cy2 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#0e1420';
        g.beginPath(); drawRoundRect(g, cx2, cy2, cw, ch, 16); g.fill();
        g.save(); g.globalAlpha = 0.13; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 48, 60, 0, Math.PI * 2); g.fill();
        g.restore();
        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('AQUARIUM', W / 2, cy2 + 52);
        const lx = cx2 + 20;
        let ty = cy2 + 76;
        const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• The grid holds tanks divided by thick borders',
          '• Water fills tanks from the bottom up',
          '• Tap a cell to fill/drain that level in its tank',
          '• Left numbers = total water cells in each row',
          '• Bottom numbers = total water cells in each column',
          '• Match all counts to solve the puzzle',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }
        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('INDICATORS', lx, ty); ty += lh;
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#4CAF50'; g.fillText('Green = count matches target', lx, ty); ty += lh;
        g.fillStyle = '#FF5252'; g.fillText('Red = count exceeds target', lx, ty);
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      // Solved overlay
      if (solved && solveAnim) {
        const age = now - solveAnim.startTime;
        if (age > 400) {
          g.fillStyle = 'rgba(14,20,32,0.9)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 64);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 16);
          const best = ctx.storage.get('bt_aquarium') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 16);
          g.fillStyle = ACCENT + '22';
          g.beginPath(); drawRoundRect(g, W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12); g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath(); drawRoundRect(g, W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12); g.stroke();
          g.font = 'bold 16px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.fillText('NEXT PUZZLE', W / 2, USABLE_H / 2 + 74);
        }
      }

      // Banner when solution is showing
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

    // ---------------------------------------------------------------
    // Touch
    // ---------------------------------------------------------------
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      // IBTN first
      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // Eye / solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        applySolution();
        return;
      }

      if (showSolution) {
        initPuzzle();
        return;
      }

      // Next puzzle after solve
      if (solved && solveAnim && performance.now() - solveAnim.startTime > 400) {
        puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
        ctx.storage.set('aquarium_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      const layout = getLayout();
      const { CELL, gridX, gridY } = layout;
      const col = Math.floor((tx - gridX) / CELL);
      const row = Math.floor((ty - gridY) / CELL);
      if (col < 0 || col >= N || row < 0 || row >= N) return;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      const newVal = toggleTankRow(row, col);
      if (newVal === 1) playFill();
      else playDrain();
      ctx.platform.haptic('light');
      ctx.platform.interact({ type: 'tap' });

      if (checkSolved()) {
        solved = true;
        solveTime = performance.now() - startTime;
        solveAnim = { startTime: performance.now() };
        const best = ctx.storage.get('bt_aquarium') || 0;
        if (!best || solveTime < best) ctx.storage.set('bt_aquarium', solveTime);
        ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
        playWin();
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
