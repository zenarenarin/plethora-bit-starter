window.plethoraBit = {
  meta: {
    title: 'Hakoiri',
    author: 'plethora',
    description: 'Pack all shapes into the box.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FFCC02';
    const BG = '#0f0f14';
    const PIECE_COLORS = ['#FF6B6B', '#4ECDC4', '#A8E6CF', '#FFD93D', '#C77DFF', '#FF9A3C'];

    // ---------------------------------------------------------------
    // Rotation helpers
    // ---------------------------------------------------------------
    function rotateCells(cells, rot) {
      let c = cells.map(([r, co]) => [r, co]);
      for (let i = 0; i < rot; i++) c = c.map(([r, co]) => [co, -r]);
      const minR = Math.min(...c.map(([r]) => r));
      const minC = Math.min(...c.map(([, co]) => co));
      return c.map(([r, co]) => [r - minR, co - minC]);
    }

    function pieceBounds(cells) {
      return {
        rows: Math.max(...cells.map(([r]) => r)) + 1,
        cols: Math.max(...cells.map(([, c]) => c)) + 1,
      };
    }

    // ---------------------------------------------------------------
    // 5 verified puzzles — solutions solver-confirmed, no overlaps, full coverage
    // ---------------------------------------------------------------
    const PUZZLES = [
      {
        name: 'BOX 4×4',
        box: { rows: 4, cols: 4 },
        // 4 T-tetrominoes — solution: pi0 rot0, pi1 rot1, pi2 rot3, pi3 rot2
        pieces: [
          [[0,0],[0,1],[0,2],[1,1]],
          [[0,0],[0,1],[0,2],[1,1]],
          [[0,0],[0,1],[0,2],[1,1]],
          [[0,0],[0,1],[0,2],[1,1]],
        ],
        solution: [
          { pi: 0, r: 0, c: 0, rot: 0 },
          { pi: 1, r: 0, c: 2, rot: 1 },
          { pi: 2, r: 1, c: 0, rot: 3 },
          { pi: 3, r: 2, c: 1, rot: 2 },
        ],
      },
      {
        name: 'BOX 3×4',
        box: { rows: 3, cols: 4 },
        // I3 + I3 + L4 + domino
        pieces: [
          [[0,0],[0,1],[0,2]],         // I3
          [[0,0],[0,1],[0,2]],         // I3
          [[0,0],[1,0],[2,0],[2,1]],   // L4
          [[0,0],[1,0]],               // domino
        ],
        solution: [
          { pi: 0, r: 0, c: 0, rot: 0 },
          { pi: 1, r: 0, c: 3, rot: 1 },
          { pi: 2, r: 1, c: 0, rot: 1 },
          { pi: 3, r: 2, c: 1, rot: 1 },
        ],
      },
      {
        name: 'BOX 5×4',
        box: { rows: 5, cols: 4 },
        // I4 + L5 + O + L4rev + L3
        pieces: [
          [[0,0],[0,1],[0,2],[0,3]],           // I4
          [[0,0],[1,0],[2,0],[3,0],[3,1]],     // L5
          [[0,0],[0,1],[1,0],[1,1]],           // O
          [[0,0],[0,1],[0,2],[1,2]],           // L4-rev
          [[0,0],[1,0],[1,1]],                 // L3
        ],
        solution: [
          { pi: 0, r: 0, c: 0, rot: 0 },
          { pi: 1, r: 1, c: 0, rot: 1 },
          { pi: 2, r: 2, c: 1, rot: 0 },
          { pi: 3, r: 2, c: 2, rot: 1 },
          { pi: 4, r: 3, c: 0, rot: 0 },
        ],
      },
      {
        name: 'BOX 5×5',
        box: { rows: 5, cols: 5 },
        // 4x L5 + I5
        pieces: [
          [[0,0],[1,0],[2,0],[3,0],[3,1]],
          [[0,0],[1,0],[2,0],[3,0],[3,1]],
          [[0,0],[1,0],[2,0],[3,0],[3,1]],
          [[0,0],[1,0],[2,0],[3,0],[3,1]],
          [[0,0],[0,1],[0,2],[0,3],[0,4]],
        ],
        solution: [
          { pi: 0, r: 0, c: 0, rot: 1 },
          { pi: 1, r: 0, c: 1, rot: 3 },
          { pi: 2, r: 2, c: 0, rot: 1 },
          { pi: 3, r: 2, c: 1, rot: 3 },
          { pi: 4, r: 4, c: 0, rot: 0 },
        ],
      },
      {
        name: 'BOX 4×6',
        box: { rows: 4, cols: 6 },
        // 4x I4 + 2x O
        pieces: [
          [[0,0],[0,1],[0,2],[0,3]],
          [[0,0],[0,1],[0,2],[0,3]],
          [[0,0],[0,1],[0,2],[0,3]],
          [[0,0],[0,1],[0,2],[0,3]],
          [[0,0],[0,1],[1,0],[1,1]],
          [[0,0],[0,1],[1,0],[1,1]],
        ],
        solution: [
          { pi: 0, r: 0, c: 0, rot: 0 },
          { pi: 1, r: 0, c: 4, rot: 1 },
          { pi: 2, r: 0, c: 5, rot: 1 },
          { pi: 3, r: 1, c: 0, rot: 0 },
          { pi: 4, r: 2, c: 0, rot: 0 },
          { pi: 5, r: 2, c: 2, rot: 0 },
        ],
      },
    ];

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

    function playNote(freq, dur, vol = 0.14) {
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

    function playPlace() { playNote(660, 0.1); }
    function playPickup() { playNote(440, 0.08, 0.1); }
    function playRotate() { playNote(550, 0.07, 0.08); }
    function playError() { playNote(200, 0.15, 0.1); }
    function playWin() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        ctx.timeout(() => playNote(f, 0.5, 0.18), i * 80);
      });
    }

    // ---------------------------------------------------------------
    // Layout
    // ---------------------------------------------------------------
    const HUD_H = 48;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    function getLayout(box) {
      const PALETTE_W = Math.floor(W * 0.30);
      const gridAreaW = W - PALETTE_W - 20;
      const gridAreaH = USABLE_H - HUD_H - 20;
      const cellByW = Math.floor(gridAreaW / box.cols);
      const cellByH = Math.floor(gridAreaH / box.rows);
      const CELL = Math.min(cellByW, cellByH, 56);
      const gridW = CELL * box.cols;
      const gridH = CELL * box.rows;
      const gridX = PALETTE_W + 12 + Math.floor((gridAreaW - gridW) / 2);
      const gridY = HUD_H + 8 + Math.floor((gridAreaH - gridH) / 2);
      return { CELL, gridX, gridY, gridW, gridH, PALETTE_W };
    }

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    let puzzleIdx = ctx.storage.get('hakoiri_idx') || 0;
    let puzzle = null;
    let board = null;
    let placedRots = {};
    let placedOrigins = {};
    let selectedPiece = null;
    let selectedRot = 0;
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let showInfo = false;
    let solveAnim = null;
    let ghostCell = null;
    let showSolution = false;
    const EYE_X = W - 22, EYE_Y = 62, EYE_R = 14;

    function applySolution() {
      const sol = puzzle.solution;
      for (const { pi, r, c, rot } of sol) {
        liftFromBoard(pi);
        placeOnBoard(pi, rot, r, c);
      }
      showSolution = true;
    }

    function initPuzzle() {
      puzzle = PUZZLES[puzzleIdx % PUZZLES.length];
      board = Array.from({ length: puzzle.box.rows }, () => Array(puzzle.box.cols).fill(null));
      placedRots = {};
      placedOrigins = {};
      selectedPiece = null;
      selectedRot = 0;
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnim = null;
      ghostCell = null;
      showSolution = false;
    }

    function isPlaced(pi) { return placedOrigins[pi] !== undefined; }

    function canPlace(pi, rot, r, c) {
      const cells = rotateCells(puzzle.pieces[pi], rot);
      for (const [dr, dc] of cells) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= puzzle.box.rows || nc < 0 || nc >= puzzle.box.cols) return false;
        if (board[nr][nc] !== null && board[nr][nc] !== pi) return false;
      }
      return true;
    }

    function placeOnBoard(pi, rot, r, c) {
      liftFromBoard(pi);
      const cells = rotateCells(puzzle.pieces[pi], rot);
      for (const [dr, dc] of cells) board[r + dr][c + dc] = pi;
      placedRots[pi] = rot;
      placedOrigins[pi] = { r, c };
    }

    function liftFromBoard(pi) {
      if (!isPlaced(pi)) return;
      for (let r = 0; r < puzzle.box.rows; r++)
        for (let c = 0; c < puzzle.box.cols; c++)
          if (board[r][c] === pi) board[r][c] = null;
      delete placedRots[pi];
      delete placedOrigins[pi];
    }

    function checkSolved() {
      for (let r = 0; r < puzzle.box.rows; r++)
        for (let c = 0; c < puzzle.box.cols; c++)
          if (board[r][c] === null) return false;
      return true;
    }

    function gridCellAt(tx, ty, layout) {
      const { CELL, gridX, gridY } = layout;
      const col = Math.floor((tx - gridX) / CELL);
      const row = Math.floor((ty - gridY) / CELL);
      if (col < 0 || col >= puzzle.box.cols || row < 0 || row >= puzzle.box.rows) return null;
      return { r: row, c: col };
    }

    function getPaletteItems(layout) {
      const { PALETTE_W, CELL } = layout;
      const unplaced = puzzle.pieces.map((_, i) => i).filter(i => !isPlaced(i) && i !== selectedPiece);
      const maxCell = Math.min(Math.floor((PALETTE_W - 12) / 4), 28);
      const items = [];
      let y = HUD_H + 28;
      for (const pi of unplaced) {
        const cells = rotateCells(puzzle.pieces[pi], 0);
        const b = pieceBounds(cells);
        const cell = Math.min(maxCell, Math.floor((PALETTE_W - 12) / b.cols));
        const pw = cell * b.cols;
        const ph = cell * b.rows;
        const x = Math.floor((PALETTE_W - pw) / 2);
        items.push({ pi, cells, cell, x, y, pw, ph, b });
        y += ph + 16;
      }
      return items;
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
    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const layout = getLayout(puzzle.box);
      const { CELL, gridX, gridY, gridW, gridH, PALETTE_W } = layout;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, 0, W, HUD_H);
      g.font = 'bold 14px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`HAKOIRI  ${(puzzleIdx % PUZZLES.length) + 1}/${PUZZLES.length}  ${puzzle.name}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Palette separator
      g.strokeStyle = 'rgba(255,255,255,0.1)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(PALETTE_W, HUD_H);
      g.lineTo(PALETTE_W, USABLE_H);
      g.stroke();

      // Palette label
      g.font = 'bold 10px -apple-system, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText('PIECES', PALETTE_W / 2, HUD_H + 4);

      // Palette unplaced pieces
      const paletteItems = getPaletteItems(layout);
      for (const { pi, cells, cell, x, y } of paletteItems) {
        const col = PIECE_COLORS[pi % PIECE_COLORS.length];
        g.save();
        g.translate(x, y);
        for (const [dr, dc] of cells) {
          g.fillStyle = col;
          g.fillRect(dc * cell + 1, dr * cell + 1, cell - 2, cell - 2);
          g.fillStyle = 'rgba(255,255,255,0.13)';
          g.fillRect(dc * cell + 2, dr * cell + 2, cell - 4, 4);
        }
        g.restore();
      }

      // Selected piece preview in palette
      if (selectedPiece !== null) {
        const cells = rotateCells(puzzle.pieces[selectedPiece], selectedRot);
        const b = pieceBounds(cells);
        const maxCell = Math.min(Math.floor((PALETTE_W - 12) / 4), 28);
        const cell2 = Math.min(maxCell, Math.floor((PALETTE_W - 12) / b.cols));
        const pw = cell2 * b.cols;
        const sx = Math.floor((PALETTE_W - pw) / 2);
        const sy = HUD_H + 28;
        const col = PIECE_COLORS[selectedPiece % PIECE_COLORS.length];
        g.save();
        g.translate(sx, sy);
        for (const [dr, dc] of cells) {
          g.fillStyle = col;
          g.fillRect(dc * cell2 + 1, dr * cell2 + 1, cell2 - 2, cell2 - 2);
          g.fillStyle = 'rgba(255,255,255,0.15)';
          g.fillRect(dc * cell2 + 2, dr * cell2 + 2, cell2 - 4, 4);
          // Selected ring
          g.strokeStyle = ACCENT;
          g.lineWidth = 2;
          g.strokeRect(dc * cell2 + 1, dr * cell2 + 1, cell2 - 2, cell2 - 2);
        }
        g.restore();

        // Rotate button
        const rbx = PALETTE_W / 2;
        const rby = sy + pieceBounds(cells).rows * cell2 + 24;
        if (rby < USABLE_H - 24) {
          g.save();
          g.fillStyle = 'rgba(255,204,2,0.18)';
          g.beginPath(); g.arc(rbx, rby, 18, 0, Math.PI * 2); g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath(); g.arc(rbx, rby, 18, 0, Math.PI * 2); g.stroke();
          g.fillStyle = ACCENT;
          g.font = '18px -apple-system, sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('↻', rbx, rby);
          g.restore();
        }
      }

      // Grid cells
      for (let r = 0; r < puzzle.box.rows; r++) {
        for (let c = 0; c < puzzle.box.cols; c++) {
          const cx = gridX + c * CELL;
          const cy = gridY + r * CELL;
          const pi = board[r][c];

          if (pi !== null) {
            const col = PIECE_COLORS[pi % PIECE_COLORS.length];
            g.fillStyle = col;
            g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            g.fillStyle = 'rgba(255,255,255,0.12)';
            g.fillRect(cx + 2, cy + 2, CELL - 4, 6);
          } else if (selectedPiece !== null && ghostCell) {
            const cells = rotateCells(puzzle.pieces[selectedPiece], selectedRot);
            const isGhost = cells.some(([dr, dc]) => dr + ghostCell.r === r && dc + ghostCell.c === c);
            if (isGhost) {
              const valid = canPlace(selectedPiece, selectedRot, ghostCell.r, ghostCell.c);
              const col = PIECE_COLORS[selectedPiece % PIECE_COLORS.length];
              g.fillStyle = valid ? col + '55' : 'rgba(255,80,80,0.22)';
              g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            } else {
              g.fillStyle = '#15151f';
              g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            }
          } else {
            g.fillStyle = '#15151f';
            g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
          }
        }
      }

      // Grid lines
      g.strokeStyle = 'rgba(255,255,255,0.1)';
      g.lineWidth = 0.5;
      for (let r = 0; r <= puzzle.box.rows; r++) {
        g.beginPath(); g.moveTo(gridX, gridY + r * CELL); g.lineTo(gridX + gridW, gridY + r * CELL); g.stroke();
      }
      for (let c = 0; c <= puzzle.box.cols; c++) {
        g.beginPath(); g.moveTo(gridX + c * CELL, gridY); g.lineTo(gridX + c * CELL, gridY + gridH); g.stroke();
      }

      // Box border
      g.strokeStyle = ACCENT + 'bb';
      g.lineWidth = 2;
      g.strokeRect(gridX, gridY, gridW, gridH);

      // Info button — LAST
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // Eye / see-solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_Y, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_Y);
      g.restore();

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.84);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.78), 490);
        const cy2 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath(); drawRoundRect(g, cx2, cy2, cw, ch, 16); g.fill();
        g.save(); g.globalAlpha = 0.13; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 48, 60, 0, Math.PI * 2); g.fill();
        g.restore();
        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('HAKOIRI', W / 2, cy2 + 52);
        const lx = cx2 + 20;
        let ty = cy2 + 76;
        const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• Pack all coloured shapes into the box',
          '• No overlaps — every cell must be filled',
          '• Tap a piece in the left palette to select it',
          '• Tap the grid to place it at that position',
          '• Tap ↻ button to rotate the selected piece',
          '• Tap a placed piece to pick it back up',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      // Solved overlay
      if (solved && solveAnim) {
        const age = now - solveAnim.startTime;
        if (age > 500) {
          g.fillStyle = 'rgba(15,15,20,0.9)';
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
          const best = ctx.storage.get('bt_hakoiri') || 0;
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

      // Eye / see-solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_Y) < EYE_R + 8) {
        applySolution();
        return;
      }

      if (showSolution) {
        initPuzzle();
        return;
      }

      // Solved: next puzzle
      if (solved && solveAnim && performance.now() - solveAnim.startTime > 500) {
        puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
        ctx.storage.set('hakoiri_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      const layout = getLayout(puzzle.box);
      const { PALETTE_W } = layout;

      // Rotate button
      if (selectedPiece !== null) {
        const cells0 = rotateCells(puzzle.pieces[selectedPiece], 0);
        const b0 = pieceBounds(cells0);
        const maxCell = Math.min(Math.floor((PALETTE_W - 12) / 4), 28);
        const cell2 = Math.min(maxCell, Math.floor((PALETTE_W - 12) / b0.cols));
        const sy = (HUD_H + 28) + pieceBounds(rotateCells(puzzle.pieces[selectedPiece], selectedRot)).rows * cell2 + 24;
        const rbx = PALETTE_W / 2;
        if (sy < USABLE_H - 24 && Math.hypot(tx - rbx, ty - sy) < 26) {
          selectedRot = (selectedRot + 1) % 4;
          ghostCell = null;
          playRotate();
          return;
        }
      }

      // Grid tap
      const cell = gridCellAt(tx, ty, layout);
      if (cell) {
        if (!gameStarted) {
          gameStarted = true;
          startTime = performance.now();
          ctx.platform.start();
        }
        const { r, c } = cell;
        const occupant = board[r][c];
        if (occupant !== null && selectedPiece === null) {
          liftFromBoard(occupant);
          selectedPiece = occupant;
          selectedRot = placedRots[occupant] !== undefined ? placedRots[occupant] : 0;
          ghostCell = cell;
          playPickup();
          ctx.platform.haptic('light');
          return;
        }
        if (selectedPiece !== null) {
          if (canPlace(selectedPiece, selectedRot, r, c)) {
            placeOnBoard(selectedPiece, selectedRot, r, c);
            playPlace();
            ctx.platform.haptic('light');
            ctx.platform.interact({ type: 'tap' });
            const wasSel = selectedPiece;
            selectedPiece = null;
            ghostCell = null;
            if (checkSolved()) {
              solved = true;
              solveTime = performance.now() - startTime;
              solveAnim = { startTime: performance.now() };
              const best = ctx.storage.get('bt_hakoiri') || 0;
              if (!best || solveTime < best) ctx.storage.set('bt_hakoiri', solveTime);
              ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
              playWin();
            }
          } else {
            playError();
            ctx.platform.haptic('medium');
          }
          return;
        }
      }

      // Palette tap
      if (tx < PALETTE_W) {
        const paletteItems = getPaletteItems(layout);
        for (const { pi, x, y, pw, ph } of paletteItems) {
          if (tx >= x && tx <= x + pw && ty >= y && ty <= y + ph) {
            if (selectedPiece === pi) { selectedPiece = null; ghostCell = null; }
            else { selectedPiece = pi; selectedRot = 0; ghostCell = null; playPickup(); }
            return;
          }
        }
        selectedPiece = null;
        ghostCell = null;
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (selectedPiece === null) return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      ghostCell = gridCellAt(tx, ty, getLayout(puzzle.box));
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
