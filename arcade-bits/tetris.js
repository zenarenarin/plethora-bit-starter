window.plethoraBit = {
  meta: {
    title: 'Tetris',
    author: 'plethora',
    description: 'Classic block-stacking puzzle game.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const COLS = 10, ROWS = 20;
    const CELL = Math.floor(Math.min(W * 0.9 / COLS, (H * 0.85) / ROWS));
    const OX = Math.floor((W - COLS * CELL) / 2);
    const OY = Math.floor(H * 0.08);

    const PIECES = [
      { shape: [[1,1,1,1]], color: '#00f0f0' },
      { shape: [[1,1],[1,1]], color: '#f0f000' },
      { shape: [[0,1,1],[1,1,0]], color: '#00f000' },
      { shape: [[1,1,0],[0,1,1]], color: '#f00000' },
      { shape: [[1,0,0],[1,1,1]], color: '#f0a000' },
      { shape: [[0,0,1],[1,1,1]], color: '#0000f0' },
      { shape: [[0,1,0],[1,1,1]], color: '#a000f0' },
    ];

    let board, piece, next, score, level, lines, gameOver, started, dropTimer, dropInterval, hs;
    let audioCtx = null;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function beep(freq, dur, type = 'square', vol = 0.15) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      o.connect(g2); g2.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      g2.gain.setValueAtTime(vol, audioCtx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }

    function gameOverSound() {
      [400, 300, 200, 100].forEach((f, i) => {
        setTimeout(() => beep(f, 0.3, 'sawtooth', 0.2), i * 150);
      });
    }

    function lineClear(n) {
      const freqs = [523, 659, 784, 1047];
      for (let i = 0; i < n; i++) setTimeout(() => beep(freqs[i] || 1047, 0.1), i * 80);
    }

    function newBoard() { return Array.from({length: ROWS}, () => new Array(COLS).fill(0)); }

    function randPiece() {
      const p = PIECES[Math.floor(Math.random() * PIECES.length)];
      return { shape: p.shape.map(r => [...r]), color: p.color, x: Math.floor(COLS/2) - Math.floor(p.shape[0].length/2), y: 0 };
    }

    function rotate(shape) {
      const R = shape.length, C = shape[0].length;
      return Array.from({length: C}, (_, c) => Array.from({length: R}, (_, r) => shape[R-1-r][c]));
    }

    function valid(s, x, y) {
      for (let r = 0; r < s.length; r++)
        for (let c = 0; c < s[r].length; c++)
          if (s[r][c]) {
            const nx = x + c, ny = y + r;
            if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
            if (ny >= 0 && board[ny][nx]) return false;
          }
      return true;
    }

    function lock() {
      piece.shape.forEach((row, r) => row.forEach((v, c) => {
        if (v) board[piece.y + r][piece.x + c] = piece.color;
      }));
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(v => v)) { board.splice(r, 1); board.unshift(new Array(COLS).fill(0)); cleared++; r++; }
      }
      if (cleared) {
        const pts = [0,100,300,500,800][cleared] * (level + 1);
        score += pts; lines += cleared;
        level = Math.floor(lines / 10);
        dropInterval = Math.max(100, 800 - level * 70);
        lineClear(cleared);
        ctx.platform.setScore(score);
        if (score > hs) { hs = score; ctx.storage.set('hs_tetris', hs); }
      }
      beep(200, 0.05);
      piece = next;
      next = randPiece();
      if (!valid(piece.shape, piece.x, piece.y)) {
        gameOver = true;
        gameOverSound();
        ctx.platform.fail({ reason: 'topped out' });
      }
    }

    function reset() {
      board = newBoard();
      piece = randPiece();
      next = randPiece();
      score = 0; level = 0; lines = 0;
      gameOver = false; started = false;
      dropTimer = 0; dropInterval = 800;
    }

    hs = ctx.storage.get('hs_tetris') || 0;
    reset();

    function drawCell(cx, cy, color) {
      g.fillStyle = color;
      g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(cx + 1, cy + 1, CELL - 2, 4);
    }

    function drawBoard() {
      g.fillStyle = '#111';
      g.fillRect(OX, OY, COLS * CELL, ROWS * CELL);
      g.strokeStyle = '#222';
      g.lineWidth = 0.5;
      for (let r = 0; r <= ROWS; r++) { g.beginPath(); g.moveTo(OX, OY + r*CELL); g.lineTo(OX + COLS*CELL, OY + r*CELL); g.stroke(); }
      for (let c = 0; c <= COLS; c++) { g.beginPath(); g.moveTo(OX + c*CELL, OY); g.lineTo(OX + c*CELL, OY + ROWS*CELL); g.stroke(); }

      board.forEach((row, r) => row.forEach((v, c) => {
        if (v) drawCell(OX + c*CELL, OY + r*CELL, v);
      }));

      // ghost
      let gy = piece.y;
      while (valid(piece.shape, piece.x, gy + 1)) gy++;
      piece.shape.forEach((row, r) => row.forEach((v, c) => {
        if (v) {
          g.fillStyle = 'rgba(255,255,255,0.15)';
          g.fillRect(OX + (piece.x+c)*CELL+1, OY + (gy+r)*CELL+1, CELL-2, CELL-2);
        }
      }));

      // active piece
      piece.shape.forEach((row, r) => row.forEach((v, c) => {
        if (v) drawCell(OX + (piece.x+c)*CELL, OY + (piece.y+r)*CELL, piece.color);
      }));

      // border
      g.strokeStyle = '#444';
      g.lineWidth = 2;
      g.strokeRect(OX, OY, COLS*CELL, ROWS*CELL);
    }

    function drawNext() {
      const nx = OX + COLS*CELL + 10, ny = OY + 10;
      g.fillStyle = '#333';
      g.fillRect(nx, ny, CELL*4, CELL*4);
      g.strokeStyle = '#555';
      g.lineWidth = 1;
      g.strokeRect(nx, ny, CELL*4, CELL*4);
      const ph = next.shape.length, pw = next.shape[0].length;
      const offX = Math.floor((4 - pw)/2), offY = Math.floor((4 - ph)/2);
      next.shape.forEach((row, r) => row.forEach((v, c) => {
        if (v) drawCell(nx + (offX+c)*CELL, ny + (offY+r)*CELL, next.color);
      }));
      g.fillStyle = '#aaa';
      g.font = `${CELL * 0.7}px monospace`;
      g.textAlign = 'center';
      g.fillText('NEXT', nx + CELL*2, ny - 5);
    }

    function drawHUD() {
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H*0.03)}px monospace`;
      g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, OX, OY - 8);
      g.textAlign = 'right';
      g.fillText(`BEST: ${hs}`, OX + COLS*CELL, OY - 8);
      g.textAlign = 'left';
      g.fillStyle = '#aaa';
      g.font = `${Math.floor(H*0.025)}px monospace`;
      g.fillText(`LVL ${level+1}  LN ${lines}`, OX, OY + ROWS*CELL + CELL*0.8);
    }

    let touchStartX = 0, touchStartY = 0, touchStartTime = 0;

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      touchStartX = t.clientX; touchStartY = t.clientY; touchStartTime = Date.now();

      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (!started || gameOver) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const dt2 = Date.now() - touchStartTime;

      if (dy > 60 && Math.abs(dx) < 60) {
        // hard drop
        while (valid(piece.shape, piece.x, piece.y + 1)) piece.y++;
        lock(); dropTimer = 0;
        beep(150, 0.1, 'square', 0.2);
      } else if (Math.abs(dx) < 30 && Math.abs(dy) < 30 && dt2 < 300) {
        // tap: check zone
        const tx = t.clientX;
        if (tx < W * 0.35) {
          if (valid(piece.shape, piece.x - 1, piece.y)) { piece.x--; beep(300, 0.04); }
        } else if (tx > W * 0.65) {
          if (valid(piece.shape, piece.x + 1, piece.y)) { piece.x++; beep(300, 0.04); }
        } else {
          const rot = rotate(piece.shape);
          if (valid(rot, piece.x, piece.y)) { piece.shape = rot; beep(500, 0.05); }
          else if (valid(rot, piece.x - 1, piece.y)) { piece.shape = rot; piece.x--; beep(500, 0.05); }
          else if (valid(rot, piece.x + 1, piece.y)) { piece.shape = rot; piece.x++; beep(500, 0.05); }
        }
      } else if (Math.abs(dx) > 40 && Math.abs(dy) < 40) {
        const dir = dx > 0 ? 1 : -1;
        if (valid(piece.shape, piece.x + dir, piece.y)) { piece.x += dir; beep(300, 0.04); }
      }
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.raf(dt => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);

      if (!started) {
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.06)}px monospace`;
        g.textAlign = 'center';
        g.fillText('TETRIS', W/2, H*0.4);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.035)}px monospace`;
        g.fillText('TAP TO START', W/2, H*0.5);
        g.fillText(`BEST: ${hs}`, W/2, H*0.58);
        return;
      }

      if (!gameOver) {
        dropTimer += dt;
        if (dropTimer >= dropInterval) {
          dropTimer = 0;
          if (valid(piece.shape, piece.x, piece.y + 1)) piece.y++;
          else lock();
        }
      }

      drawBoard();
      drawNext();
      drawHUD();

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f00';
        g.font = `bold ${Math.floor(H*0.07)}px monospace`;
        g.textAlign = 'center';
        g.fillText('GAME OVER', W/2, H*0.4);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`SCORE: ${score}`, W/2, H*0.5);
        g.fillText(`BEST: ${hs}`, W/2, H*0.57);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.035)}px monospace`;
        g.fillText('TAP TO RESTART', W/2, H*0.67);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
