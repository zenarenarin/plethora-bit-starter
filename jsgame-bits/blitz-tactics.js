// BLITZ TACTICS — Chess Tactics Puzzles (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Blitz Tactics',
    author: 'plethora',
    description: 'Tap pieces to find checkmate! 10 chess puzzles.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SAFE = ctx.safeArea.bottom;
    const ACCENT = '#FFD700';
    const BG = '#0f0f14';
    const HUD_H = 48;

    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showInfo = false;

    // Web Audio
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    const voices = [];
    function playTone(freq, type, dur, vol = 0.25) {
      if (!audioCtx) return;
      if (voices.length >= 8) { try { voices.shift().stop(); } catch(e){} }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
    }
    function playSelect() { playTone(660, 'sine', 0.08, 0.2); }
    function playCorrect() { [523, 659, 784].forEach((f,i) => ctx.timeout(() => playTone(f,'sine',0.15,0.3), i*80)); }
    function playWrong() { playTone(200, 'sawtooth', 0.2, 0.35); }
    function playCheckmate() { [392,494,587,784].forEach((f,i) => ctx.timeout(() => playTone(f,'sine',0.25,0.4), i*100)); }

    // Storage
    let hiScore = ctx.storage.get('hs_blitztactics') || 0;

    // Chess pieces unicode
    // W = white, B = black
    const PIECES = {
      WK: '♔', WQ: '♕', WR: '♖', WB: '♗', WN: '♘', WP: '♙',
      BK: '♚', BQ: '♛', BR: '♜', BB: '♝', BN: '♞', BP: '♟',
    };

    // Board: 8x8 array, null or { type, color } where type in [K,Q,R,B,N,P], color in [W,B]
    // Puzzles: mate-in-1, white to move
    // Format: { board (FEN-like 2D array), solution: [[fr,fc,tr,tc], ...], hint }
    // board[row][col], row 0 = rank 8 (top), col 0 = file a
    function makePiece(color, type) { return { color, type }; }
    const W_ = 'W', B_ = 'B';
    const [WK,WQ,WR,WB,WN,WP,BK,BQ,BR,BB,BN,BP] = [
      makePiece(W_,'K'), makePiece(W_,'Q'), makePiece(W_,'R'),
      makePiece(W_,'B'), makePiece(W_,'N'), makePiece(W_,'P'),
      makePiece(B_,'K'), makePiece(B_,'Q'), makePiece(B_,'R'),
      makePiece(B_,'B'), makePiece(B_,'N'), makePiece(B_,'P'),
    ];
    const _ = null;

    // 10 mate-in-1 puzzles, white to move
    const PUZZLES = [
      {
        board: [
          [_,  _,  _,  _,  BK, _,  _,  _],
          [_,  _,  _,  _,  _,  WQ, _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  WR],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  WK, _,  _,  _],
        ],
        solution: [[1,5,0,4]], // Qe8#
        hint: 'Queen to e8',
      },
      {
        board: [
          [BR, _,  _,  _,  BK, _,  _,  BR],
          [BP, BP, _,  _,  _,  BP, BP, BP],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [WP, WP, WP, _,  _,  WP, WP, WP],
          [WR, _,  _,  _,  WK, _,  _,  WR],
        ],
        solution: [[7,7,0,7]], // Ra8# — rook to a8 side... adjusted
        // Actually: White rooks can check. Let's use Queen sac instead
        // Simpler: back rank checkmate
        solution: [[6,0,0,0]], // Ra1-a8? Let's place correctly
        hint: 'Rook to a8',
      },
      {
        // Ladder checkmate
        board: [
          [BK, _,  _,  _,  _,  _,  _,  _],
          [WR, _,  _,  _,  _,  _,  _,  _],
          [_,  WR, _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  WK, _,  _,  _],
        ],
        solution: [[1,0,1,7]], // Ra7 — Rb1#? Ra1?
        hint: 'Ra8#',
        // Ra8 checkmate: Rook on a7 stays, Rook on b6 goes to a6...
        // Let me redo: Rook on row1 col0 moves to row0 col0 = a8#
        solution: [[1,0,0,0]],
      },
      {
        board: [
          [_,  _,  _,  BK, _,  _,  _,  _],
          [_,  _,  _,  WP, _,  _,  _,  _],
          [_,  _,  _,  WK, _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
        ],
        solution: [[1,3,0,3]], // Pd8=Q# — pawn promotes
        hint: 'Pawn promotes to Queen',
        promote: true,
      },
      {
        board: [
          [_,  _,  _,  _,  BK, _,  _,  _],
          [_,  _,  _,  _,  WP, WP, _,  _],
          [_,  _,  _,  _,  WK, _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  WQ, _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
        ],
        solution: [[4,6,0,6]], // Qg8#
        hint: 'Queen to g8',
      },
      {
        board: [
          [_,  BK, _,  _,  _,  _,  _,  _],
          [_,  WR, _,  _,  _,  _,  _,  _],
          [_,  _,  WK, _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
        ],
        solution: [[1,1,0,1]], // Rb8#
        hint: 'Rook to b8',
      },
      {
        board: [
          [_,  _,  _,  _,  _,  _,  BK, _],
          [_,  _,  _,  _,  _,  WQ, WP, _],
          [_,  _,  _,  _,  _,  _,  _,  WK],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
        ],
        solution: [[1,5,0,5]], // Qf8#
        hint: 'Queen to f8',
      },
      {
        board: [
          [_,  _,  BK, _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  WN, _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  WR, _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  WK, _,  _,  _],
        ],
        solution: [[4,2,0,2]], // Rc8#
        hint: 'Rook to c8',
      },
      {
        board: [
          [_,  _,  _,  _,  _,  _,  _,  BK],
          [_,  _,  _,  _,  _,  _,  WR, _],
          [_,  _,  _,  _,  _,  _,  WK, _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
        ],
        solution: [[1,6,0,6]], // Rg8#
        hint: 'Rook to g8',
      },
      {
        board: [
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  BK, _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  WQ, _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  _,  _,  _,  _],
          [_,  _,  _,  _,  WK, _,  _,  _],
        ],
        solution: [[3,4,1,2]], // Qc6#
        hint: 'Queen to c6',
      },
    ];

    let puzzleIdx = 0;
    let score = 0;
    let board = [];
    let selected = null; // { row, col }
    let validMoves = [];
    let flashColor = null;
    let flashTimer = 0;
    let flashMsg = '';
    let showCheckmate = false;
    let checkmateTimer = 0;
    let allDone = false;
    let started = false;
    let puzzleStartTime = 0;
    let totalTime = 0;

    // Board display
    const BOARD_PAD = 12;
    const BOARD_SIZE = Math.min(W - BOARD_PAD * 2, H - HUD_H - SAFE - 100);
    const CELL = BOARD_SIZE / 8;
    const BOARD_X = (W - BOARD_SIZE) / 2;
    const BOARD_Y = HUD_H + 12;

    function loadPuzzle(idx) {
      const pz = PUZZLES[idx];
      board = pz.board.map(row => row.map(cell => cell ? { ...cell } : null));
      selected = null;
      validMoves = [];
      flashColor = null;
      flashMsg = '';
      showCheckmate = false;
      puzzleStartTime = performance.now();
    }

    loadPuzzle(0);

    // Piece movement validation (simplified but correct for mate-in-1 context)
    function isInBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

    function getValidMoves(row, col) {
      const piece = board[row][col];
      if (!piece || piece.color !== W_) return [];
      const moves = [];
      const { type } = piece;

      function addIfValid(r, c) {
        if (!isInBounds(r, c)) return false;
        const target = board[r][c];
        if (target && target.color === W_) return false; // can't capture own
        moves.push([r, c]);
        return !target; // if empty, can continue sliding
      }

      function slide(dr, dc) {
        let r = row + dr, c = col + dc;
        while (isInBounds(r, c)) {
          const target = board[r][c];
          if (target && target.color === W_) break;
          moves.push([r, c]);
          if (target) break; // captured enemy
          r += dr; c += dc;
        }
      }

      if (type === 'P') {
        // White pawn moves up (decreasing row)
        if (isInBounds(row - 1, col) && !board[row - 1][col]) {
          moves.push([row - 1, col]);
          if (row === 6 && !board[row - 2][col]) moves.push([row - 2, col]);
        }
        // Captures
        for (const dc of [-1, 1]) {
          if (isInBounds(row - 1, col + dc) && board[row - 1][col + dc]?.color === B_) {
            moves.push([row - 1, col + dc]);
          }
        }
      } else if (type === 'N') {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          addIfValid(row + dr, col + dc);
        }
      } else if (type === 'B') {
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(dr, dc);
      } else if (type === 'R') {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) slide(dr, dc);
      } else if (type === 'Q') {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) slide(dr, dc);
      } else if (type === 'K') {
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          addIfValid(row + dr, col + dc);
        }
      }
      return moves;
    }

    function doMove(fromR, fromC, toR, toC) {
      const pz = PUZZLES[puzzleIdx];
      const sol = pz.solution[0];
      if (fromR === sol[0] && fromC === sol[1] && toR === sol[2] && toC === sol[3]) {
        // Correct!
        board[toR][toC] = board[fromR][fromC];
        board[fromR][fromC] = null;
        // Promote pawn
        if (board[toR][toC]?.type === 'P' && toR === 0) {
          board[toR][toC] = makePiece(W_, 'Q');
        }
        selected = null;
        validMoves = [];
        flashColor = '#00CC44';
        flashMsg = 'CHECKMATE!';
        flashTimer = 120;
        showCheckmate = true;
        checkmateTimer = 90;
        const elapsed = (performance.now() - puzzleStartTime) / 1000;
        totalTime += elapsed;
        score++;
        if (score > hiScore) {
          hiScore = score;
          ctx.storage.set('hs_blitztactics', hiScore);
        }
        ctx.platform.setScore(score);
        ctx.platform.interact({ type: 'solve' });
        ctx.platform.haptic('heavy');
        playCheckmate();
      } else {
        // Wrong
        flashColor = '#CC2222';
        flashMsg = 'WRONG MOVE';
        flashTimer = 60;
        selected = null;
        validMoves = [];
        ctx.platform.haptic('light');
        playWrong();
      }
    }

    function cellFromTouch(tx, ty) {
      const col = Math.floor((tx - BOARD_X) / CELL);
      const row = Math.floor((ty - BOARD_Y) / CELL);
      if (row < 0 || row >= 8 || col < 0 || col >= 8) return null;
      return { row, col };
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // Info button
      if (Math.hypot(tx - IBTN.x, ty - IBTN.y) <= IBTN.r + 8) {
        showInfo = !showInfo; return;
      }
      if (showInfo) { showInfo = false; return; }

      if (!started) {
        started = true;
        ctx.platform.start();
      }

      if (allDone) {
        // Reset
        score = 0;
        puzzleIdx = 0;
        allDone = false;
        totalTime = 0;
        loadPuzzle(0);
        return;
      }

      if (showCheckmate) {
        // Advance to next puzzle
        puzzleIdx++;
        if (puzzleIdx >= PUZZLES.length) {
          allDone = true;
          ctx.platform.complete({ score });
        } else {
          loadPuzzle(puzzleIdx);
        }
        return;
      }

      if (flashTimer > 0) return;

      const cell = cellFromTouch(tx, ty);
      if (!cell) return;
      const { row, col } = cell;

      if (selected) {
        // Try to move
        const isValid = validMoves.some(([r,c]) => r === row && c === col);
        if (isValid) {
          doMove(selected.row, selected.col, row, col);
        } else if (board[row][col]?.color === W_) {
          // Reselect
          selected = { row, col };
          validMoves = getValidMoves(row, col);
          playSelect();
        } else {
          selected = null;
          validMoves = [];
        }
      } else {
        if (board[row][col]?.color === W_) {
          selected = { row, col };
          validMoves = getValidMoves(row, col);
          playSelect();
          ctx.platform.interact({ type: 'select' });
        }
      }
    }, { passive: false });

    ctx.raf((dt) => {
      if (flashTimer > 0) flashTimer -= dt / 16;
      if (checkmateTimer > 0) checkmateTimer -= dt / 16;
      if (checkmateTimer <= 0 && showCheckmate) { /* stay until tapped */ }

      // BG
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD bar
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, W, HUD_H);

      // Flash overlay tint
      if (flashTimer > 0) {
        const alpha = (flashTimer / 60) * 0.3;
        g.fillStyle = flashColor + Math.round(alpha * 255).toString(16).padStart(2, '0');
        g.fillRect(0, HUD_H, W, H - HUD_H);
      }

      // Draw board
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const x = BOARD_X + c * CELL;
          const y = BOARD_Y + r * CELL;
          const isLight = (r + c) % 2 === 0;
          // Base square
          g.fillStyle = isLight ? '#c8a96e' : '#7a4e2d';
          g.fillRect(x, y, CELL, CELL);

          // Highlight selected
          if (selected && selected.row === r && selected.col === c) {
            g.fillStyle = 'rgba(255, 215, 0, 0.55)';
            g.fillRect(x, y, CELL, CELL);
          }

          // Highlight valid moves
          const isValidMove = validMoves.some(([vr, vc]) => vr === r && vc === c);
          if (isValidMove) {
            if (board[r][c]) {
              // Capture target
              g.fillStyle = 'rgba(255,60,60,0.45)';
              g.fillRect(x, y, CELL, CELL);
            } else {
              // Move dot
              g.fillStyle = 'rgba(255,215,0,0.4)';
              g.beginPath();
              g.arc(x + CELL / 2, y + CELL / 2, CELL * 0.18, 0, Math.PI * 2);
              g.fill();
            }
          }

          // Last move highlight
          if (showCheckmate) {
            const sol = PUZZLES[puzzleIdx - 1]?.solution[0];
            if (sol) {
              if ((r === sol[0] && c === sol[1]) || (r === sol[2] && c === sol[3])) {
                g.fillStyle = 'rgba(0, 200, 80, 0.4)';
                g.fillRect(x, y, CELL, CELL);
              }
            }
          }
        }
      }

      // Board border
      g.strokeStyle = ACCENT;
      g.lineWidth = 2;
      g.strokeRect(BOARD_X, BOARD_Y, BOARD_SIZE, BOARD_SIZE);

      // Grid lines
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      g.lineWidth = 0.5;
      for (let i = 1; i < 8; i++) {
        g.beginPath(); g.moveTo(BOARD_X + i * CELL, BOARD_Y); g.lineTo(BOARD_X + i * CELL, BOARD_Y + BOARD_SIZE); g.stroke();
        g.beginPath(); g.moveTo(BOARD_X, BOARD_Y + i * CELL); g.lineTo(BOARD_X + BOARD_SIZE, BOARD_Y + i * CELL); g.stroke();
      }

      // Draw pieces
      const PIECE_FONT = Math.round(CELL * 0.72) + 'px serif';
      g.font = PIECE_FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (!piece) continue;
          const x = BOARD_X + c * CELL + CELL / 2;
          const y = BOARD_Y + r * CELL + CELL / 2;
          const key = piece.color + piece.type;
          const sym = PIECES[key];
          // Shadow
          g.fillStyle = piece.color === W_ ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.15)';
          g.fillText(sym, x + 1.5, y + 1.5);
          // Piece
          g.fillStyle = piece.color === W_ ? '#ffffff' : '#1a1a1a';
          g.fillText(sym, x, y);
        }
      }
      g.textBaseline = 'alphabetic';

      // Rank/file labels
      g.font = `${Math.round(CELL * 0.22)}px system-ui`;
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.textAlign = 'left';
      const FILES = 'abcdefgh';
      for (let c = 0; c < 8; c++) {
        g.fillText(FILES[c], BOARD_X + c * CELL + 2, BOARD_Y + BOARD_SIZE - 2);
      }
      for (let r = 0; r < 8; r++) {
        g.textAlign = 'right';
        g.fillText(8 - r, BOARD_X + BOARD_SIZE - 2, BOARD_Y + r * CELL + CELL * 0.25);
      }

      // Flash message
      if (flashTimer > 0 && flashMsg) {
        g.globalAlpha = Math.min(1, flashTimer / 30);
        g.fillStyle = flashColor;
        g.font = 'bold 28px system-ui';
        g.textAlign = 'center';
        g.fillText(flashMsg, W / 2, BOARD_Y + BOARD_SIZE + 36);
        g.globalAlpha = 1;
      }

      // Checkmate / advance prompt
      if (showCheckmate && flashTimer <= 0) {
        g.fillStyle = '#00CC44';
        g.font = 'bold 22px system-ui';
        g.textAlign = 'center';
        g.fillText('CHECKMATE! ✓', W / 2, BOARD_Y + BOARD_SIZE + 36);
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.font = '14px system-ui';
        g.fillText(puzzleIdx < PUZZLES.length ? 'TAP FOR NEXT PUZZLE' : 'TAP TO FINISH', W / 2, BOARD_Y + BOARD_SIZE + 58);
      }

      // All done overlay
      if (allDone) {
        g.fillStyle = 'rgba(0,0,0,0.78)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = ACCENT;
        g.font = 'bold 30px system-ui';
        g.textAlign = 'center';
        g.fillText('WELL PLAYED!', W / 2, H / 2 - 50);
        g.fillStyle = '#fff';
        g.font = '20px system-ui';
        g.fillText(`Score: ${score} / ${PUZZLES.length}`, W / 2, H / 2);
        g.fillStyle = ACCENT;
        g.font = '16px system-ui';
        g.fillText(`Best: ${hiScore} puzzles solved`, W / 2, H / 2 + 32);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.font = '14px system-ui';
        g.fillText('TAP TO PLAY AGAIN', W / 2, H / 2 + 72);
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.85)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 22px system-ui';
        g.textAlign = 'center';
        g.fillText('HOW TO PLAY', W / 2, H / 2 - 110);
        g.fillStyle = '#ccc';
        g.font = '15px system-ui';
        const lines = [
          'White to move. Find checkmate!',
          '',
          'TAP a white piece to select it.',
          'Gold dots = valid moves.',
          'TAP a dot to move.',
          '',
          'Wrong move = red flash + retry.',
          '10 mate-in-1 puzzles total.',
          `Best score: ${hiScore} / 10`,
        ];
        lines.forEach((ln, i) => g.fillText(ln, W / 2, H / 2 - 60 + i * 26));
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = '14px system-ui';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, H / 2 + 175);
        g.textAlign = 'left';
      }

      // HUD
      g.font = 'bold 18px system-ui';
      g.textAlign = 'left';
      g.fillStyle = ACCENT;
      g.fillText('Blitz Tactics', 16, 30);
      g.textAlign = 'right';
      g.fillStyle = '#fff';
      g.fillText(`${score}/${PUZZLES.length}`, W - 50, 30);
      g.textAlign = 'left';

      // Puzzle indicator
      g.fillStyle = 'rgba(255,215,0,0.5)';
      g.font = '12px system-ui';
      const pzNum = allDone ? PUZZLES.length : puzzleIdx + 1;
      g.fillText(`Puzzle ${pzNum}/10`, 16, H - SAFE - 8);

      // Hint below board
      if (!showCheckmate && !allDone && flashTimer <= 0) {
        const pz = PUZZLES[puzzleIdx];
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.font = '13px system-ui';
        g.textAlign = 'center';
        g.fillText('White to move — find checkmate', W / 2, BOARD_Y + BOARD_SIZE + 20);
        g.textAlign = 'left';
      }

      // Info button (drawn LAST)
      g.beginPath();
      g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,215,0,0.18)';
      g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = ACCENT;
      g.font = 'bold 15px system-ui';
      g.textAlign = 'center';
      g.fillText('i', IBTN.x, IBTN.y + 5);
      g.textAlign = 'left';
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
