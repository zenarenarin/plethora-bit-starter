// 1024 MOVES — Swipe-to-merge 5×5 puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: '1024 Moves',
    author: 'plethora',
    description: 'Swipe to slide & merge tiles. Reach 1024!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SAFE = ctx.safeArea.bottom;
    const ACCENT = '#E040FB';
    const BG = '#0f0f14';
    const HUD_H = 48;
    const SIZE = 5;

    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showInfo = false;

    // Web Audio
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    const voices = [];
    function playTone(freq, type, dur, vol = 0.2) {
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
    function playSlide() { playTone(220, 'sine', 0.07, 0.15); }
    function playMerge(val) { const f = 200 + Math.log2(val) * 40; playTone(f, 'sine', 0.15, 0.25); }
    function playWin() { [523,659,784,1047,1319].forEach((f,i) => ctx.timeout(() => playTone(f,'sine',0.2,0.35), i*90)); }
    function playOver() { [300,240,180,120].forEach((f,i) => ctx.timeout(() => playTone(f,'sawtooth',0.2,0.3), i*110)); }

    // Storage
    let hiScore = ctx.storage.get('hs_1024') || 0;

    // Tile colors per value
    const TILE_COLORS = {
      2:    { bg: ['#2d1845', '#3d2060'], fg: '#c0a0e0' },
      4:    { bg: ['#3d1a6e', '#5a2a9e'], fg: '#d0b0f0' },
      8:    { bg: ['#6a1fa8', '#8a3fd0'], fg: '#f0d0ff' },
      16:   { bg: ['#a020a0', '#c030c8'], fg: '#ffe0ff' },
      32:   { bg: ['#cc2060', '#e0408a'], fg: '#fff0f5' },
      64:   { bg: ['#e0305a', '#f05080'], fg: '#ffffff' },
      128:  { bg: ['#e06020', '#f08030'], fg: '#ffffff' },
      256:  { bg: ['#d4a000', '#ffd700'], fg: '#3a2a00' },
      512:  { bg: ['#60c820', '#90e840'], fg: '#1a3a00' },
      1024: { bg: ['#00d0e8', '#80f0ff'], fg: '#003040' },
      2048: { bg: ['#ffffff', '#ffffcc'], fg: '#000000' },
    };

    function getTileColor(val) {
      if (TILE_COLORS[val]) return TILE_COLORS[val];
      return { bg: ['#888', '#aaa'], fg: '#fff' };
    }

    // Grid state
    let grid = []; // SIZE x SIZE, 0 = empty
    let score = 0;
    let gameOver = false;
    let won = false;
    let continueAfterWin = false;
    let started = false;

    // Animation state
    let animating = false;
    let animProgress = 0; // 0..1
    const ANIM_DUR = 100; // ms
    let moveVectors = []; // { fromR, fromC, toR, toC, value, merged } per tile
    let prevGrid = [];
    let newMerges = []; // { r, c } cells that just merged (for pop anim)
    let newTile = null; // { r, c } newly spawned tile

    // Board layout
    const GAP = 7;
    const BOARD_PAD = 12;
    const BOARD_SIZE = Math.min(W - BOARD_PAD * 2, H - HUD_H - SAFE - 90);
    const CELL = (BOARD_SIZE - GAP * (SIZE + 1)) / SIZE;
    const BOARD_X = (W - BOARD_SIZE) / 2;
    const BOARD_Y = HUD_H + 20;

    function cellX(c) { return BOARD_X + GAP + c * (CELL + GAP); }
    function cellY(r) { return BOARD_Y + GAP + r * (CELL + GAP); }

    function makeGrid() {
      return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    }

    function spawnTile(gr) {
      const empties = [];
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (gr[r][c] === 0) empties.push([r, c]);
      if (!empties.length) return null;
      const [r, c] = empties[Math.floor(Math.random() * empties.length)];
      gr[r][c] = Math.random() < 0.85 ? 2 : 4;
      return { r, c };
    }

    function cloneGrid(gr) { return gr.map(row => [...row]); }

    function initGame() {
      grid = makeGrid();
      score = 0;
      gameOver = false;
      won = false;
      continueAfterWin = false;
      started = false;
      animating = false;
      moveVectors = [];
      newMerges = [];
      newTile = null;
      spawnTile(grid);
      spawnTile(grid);
    }

    function hasValidMoves(gr) {
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
          if (gr[r][c] === 0) return true;
          if (c + 1 < SIZE && gr[r][c] === gr[r][c + 1]) return true;
          if (r + 1 < SIZE && gr[r][c] === gr[r + 1][c]) return true;
        }
      return false;
    }

    // Move logic — returns { newGrid, moved, scoreGain, vectors, merges, newTile }
    function slideRow(row) {
      // Slide left: filter non-zero, merge adjacent equals, pad
      const tiles = row.filter(v => v !== 0);
      const merged = [];
      const result = [];
      let i = 0;
      while (i < tiles.length) {
        if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
          result.push(tiles[i] * 2);
          merged.push(result.length - 1);
          i += 2;
        } else {
          result.push(tiles[i]);
          i++;
        }
      }
      while (result.length < SIZE) result.push(0);
      return { result, merged };
    }

    function applyMove(direction) {
      // direction: 0=left, 1=right, 2=up, 3=down
      const newGrid = makeGrid();
      let scoreGain = 0;
      let moved = false;
      const vectors = [];
      const merges = [];

      // We track original positions
      // For each resulting cell, record where it came from
      if (direction === 0 || direction === 1) {
        // Row-wise
        for (let r = 0; r < SIZE; r++) {
          let row = grid[r].slice();
          if (direction === 1) row = row.reverse();
          const { result, merged } = slideRow(row);
          let origRow = grid[r].slice();
          if (direction === 1) origRow = origRow.reverse();
          // Track movements
          const origIdxs = origRow.map((v, i) => v !== 0 ? i : null).filter(i => i !== null);
          let used = 0;
          for (let c = 0; c < SIZE; c++) {
            if (result[c] !== 0) {
              const origC = direction === 1 ? (SIZE - 1 - c) : c;
              const fromC1 = direction === 1 ? (SIZE - 1 - origIdxs[used]) : origIdxs[used];
              const isMerge = merged.includes(c);
              if (isMerge) {
                const fromC2 = direction === 1 ? (SIZE - 1 - origIdxs[used + 1]) : origIdxs[used + 1];
                vectors.push({ fromR: r, fromC: fromC1, toR: r, toC: origC, value: result[c], merged: true });
                vectors.push({ fromR: r, fromC: fromC2, toR: r, toC: origC, value: result[c], merged: true, secondary: true });
                merges.push({ r, c: origC });
                scoreGain += result[c];
                used += 2;
              } else {
                vectors.push({ fromR: r, fromC: fromC1, toR: r, toC: origC, value: result[c], merged: false });
                used++;
              }
            }
          }
          if (direction === 1) result.reverse();
          for (let c = 0; c < SIZE; c++) {
            newGrid[r][c] = result[c];
            if (newGrid[r][c] !== grid[r][c]) moved = true;
          }
        }
      } else {
        // Column-wise
        for (let c = 0; c < SIZE; c++) {
          let col = grid.map(row => row[c]);
          if (direction === 3) col = col.reverse();
          const { result, merged } = slideRow(col);
          let origCol = grid.map(row => row[c]);
          if (direction === 3) origCol = origCol.reverse();
          const origIdxs = origCol.map((v, i) => v !== 0 ? i : null).filter(i => i !== null);
          let used = 0;
          for (let r = 0; r < SIZE; r++) {
            if (result[r] !== 0) {
              const origR = direction === 3 ? (SIZE - 1 - r) : r;
              const fromR1 = direction === 3 ? (SIZE - 1 - origIdxs[used]) : origIdxs[used];
              const isMerge = merged.includes(r);
              if (isMerge) {
                const fromR2 = direction === 3 ? (SIZE - 1 - origIdxs[used + 1]) : origIdxs[used + 1];
                vectors.push({ fromR: fromR1, fromC: c, toR: origR, toC: c, value: result[r], merged: true });
                vectors.push({ fromR: fromR2, fromC: c, toR: origR, toC: c, value: result[r], merged: true, secondary: true });
                merges.push({ r: origR, c });
                scoreGain += result[r];
                used += 2;
              } else {
                vectors.push({ fromR: fromR1, fromC: c, toR: origR, toC: c, value: result[r], merged: false });
                used++;
              }
            }
          }
          if (direction === 3) result.reverse();
          for (let r = 0; r < SIZE; r++) {
            newGrid[r][c] = result[r];
            if (newGrid[r][c] !== grid[r][c]) moved = true;
          }
        }
      }
      return { newGrid, moved, scoreGain, vectors, merges };
    }

    function doMove(direction) {
      if (animating) return;
      const { newGrid, moved, scoreGain, vectors, merges } = applyMove(direction);
      if (!moved) return;

      prevGrid = cloneGrid(grid);
      moveVectors = vectors;
      newMerges = merges;
      animating = true;
      animProgress = 0;

      score += scoreGain;
      if (score > hiScore) {
        hiScore = score;
        ctx.storage.set('hs_1024', hiScore);
      }
      ctx.platform.setScore(score);

      if (scoreGain > 0) {
        merges.forEach(({ r, c }) => playMerge(newGrid[r][c]));
      } else {
        playSlide();
      }
      ctx.platform.haptic('light');
      ctx.platform.interact({ type: 'swipe' });

      // After anim: commit
      ctx.timeout(() => {
        grid = newGrid;
        const nt = spawnTile(grid);
        newTile = nt;
        animating = false;
        animProgress = 0;

        if (!won && !continueAfterWin) {
          for (let r = 0; r < SIZE; r++)
            for (let c = 0; c < SIZE; c++)
              if (grid[r][c] >= 1024) {
                won = true;
                playWin();
                ctx.platform.complete({ score });
                ctx.platform.haptic('heavy');
              }
        }

        if (!hasValidMoves(grid)) {
          gameOver = true;
          playOver();
          ctx.platform.fail({ reason: 'no moves' });
        }
      }, ANIM_DUR);
    }

    initGame();

    // Touch handling for swipe
    let touchStart = null;
    const SWIPE_MIN = 30;

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

      if (gameOver || (won && !continueAfterWin)) {
        if (won && !continueAfterWin) {
          continueAfterWin = true;
          return;
        }
        initGame();
        return;
      }

      touchStart = { x: tx, y: ty };

      if (!started) {
        started = true;
        ctx.platform.start();
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!touchStart || showInfo) { touchStart = null; return; }
      if (gameOver || (won && !continueAfterWin)) { touchStart = null; return; }
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
      if (Math.abs(dx) >= Math.abs(dy)) {
        doMove(dx > 0 ? 1 : 0); // right=1, left=0
      } else {
        doMove(dy > 0 ? 3 : 2); // down=3, up=2
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    function drawTile(x, y, size, value, alpha = 1, scale = 1) {
      const tc = getTileColor(value);
      const cx = x + size / 2;
      const cy = y + size / 2;
      const s = size * scale;
      const tx = cx - s / 2;
      const ty = cy - s / 2;

      g.globalAlpha = alpha;
      // Gradient fill
      const grd = g.createLinearGradient(tx, ty, tx + s, ty + s);
      grd.addColorStop(0, tc.bg[0]);
      grd.addColorStop(1, tc.bg[1]);

      const rad = Math.max(4, s * 0.12);
      g.beginPath();
      g.moveTo(tx + rad, ty);
      g.lineTo(tx + s - rad, ty);
      g.quadraticCurveTo(tx + s, ty, tx + s, ty + rad);
      g.lineTo(tx + s, ty + s - rad);
      g.quadraticCurveTo(tx + s, ty + s, tx + s - rad, ty + s);
      g.lineTo(tx + rad, ty + s);
      g.quadraticCurveTo(tx, ty + s, tx, ty + s - rad);
      g.lineTo(tx, ty + rad);
      g.quadraticCurveTo(tx, ty, tx + rad, ty);
      g.closePath();
      g.fillStyle = grd;
      g.fill();

      // Glow for 1024+
      if (value >= 1024) {
        g.shadowColor = '#80f0ff';
        g.shadowBlur = 18;
        g.fill();
        g.shadowBlur = 0;
      }

      // Text
      const txt = value.toString();
      const fontSize = txt.length <= 2 ? s * 0.42 : txt.length === 3 ? s * 0.32 : s * 0.26;
      g.font = `bold ${Math.round(fontSize)}px system-ui`;
      g.fillStyle = tc.fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, cx, cy + 1);
      g.textBaseline = 'alphabetic';
      g.globalAlpha = 1;
    }

    ctx.raf((dt) => {
      if (animating) {
        animProgress = Math.min(1, animProgress + dt / ANIM_DUR);
      }

      // BG
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD bar
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, W, HUD_H);

      // Board background
      const bRad = 12;
      g.fillStyle = '#1a1025';
      g.beginPath();
      g.moveTo(BOARD_X + bRad, BOARD_Y);
      g.lineTo(BOARD_X + BOARD_SIZE - bRad, BOARD_Y);
      g.quadraticCurveTo(BOARD_X + BOARD_SIZE, BOARD_Y, BOARD_X + BOARD_SIZE, BOARD_Y + bRad);
      g.lineTo(BOARD_X + BOARD_SIZE, BOARD_Y + BOARD_SIZE - bRad);
      g.quadraticCurveTo(BOARD_X + BOARD_SIZE, BOARD_Y + BOARD_SIZE, BOARD_X + BOARD_SIZE - bRad, BOARD_Y + BOARD_SIZE);
      g.lineTo(BOARD_X + bRad, BOARD_Y + BOARD_SIZE);
      g.quadraticCurveTo(BOARD_X, BOARD_Y + BOARD_SIZE, BOARD_X, BOARD_Y + BOARD_SIZE - bRad);
      g.lineTo(BOARD_X, BOARD_Y + bRad);
      g.quadraticCurveTo(BOARD_X, BOARD_Y, BOARD_X + bRad, BOARD_Y);
      g.closePath();
      g.fill();

      // Empty cell slots
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const x = cellX(c), y = cellY(r);
          const rad = CELL * 0.1;
          g.fillStyle = '#2a1840';
          g.beginPath();
          g.moveTo(x + rad, y);
          g.lineTo(x + CELL - rad, y);
          g.quadraticCurveTo(x + CELL, y, x + CELL, y + rad);
          g.lineTo(x + CELL, y + CELL - rad);
          g.quadraticCurveTo(x + CELL, y + CELL, x + CELL - rad, y + CELL);
          g.lineTo(x + rad, y + CELL);
          g.quadraticCurveTo(x, y + CELL, x, y + CELL - rad);
          g.lineTo(x, y + rad);
          g.quadraticCurveTo(x, y, x + rad, y);
          g.closePath();
          g.fill();
        }
      }

      // Render tiles
      const t = animating ? animProgress : 1;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      if (animating) {
        // Draw animating tiles
        const drawn = new Set();
        for (const v of moveVectors) {
          if (v.secondary) continue; // draw only primary for merged (show destination)
          const fromX = cellX(v.fromC);
          const fromY = cellY(v.fromR);
          const toX = cellX(v.toC);
          const toY = cellY(v.toR);
          const x = fromX + (toX - fromX) * ease;
          const y = fromY + (toY - fromY) * ease;

          const mergeScale = v.merged ? (1 + 0.2 * Math.sin(ease * Math.PI)) : 1;
          drawTile(x, y, CELL, v.merged ? v.value : v.value, 1, mergeScale);
          drawn.add(`${v.toR},${v.toC}`);
        }
      } else {
        // Draw static grid
        for (let r = 0; r < SIZE; r++) {
          for (let c = 0; c < SIZE; c++) {
            const val = grid[r][c];
            if (!val) continue;
            const x = cellX(c), y = cellY(r);
            const isMerge = newMerges.some(m => m.r === r && m.c === c);
            const isNew = newTile && newTile.r === r && newTile.c === c;
            let scale = 1;
            if (isMerge) scale = 1.08;
            if (isNew) scale = 0.92;
            drawTile(x, y, CELL, val, 1, scale);
          }
        }
      }

      // Win overlay
      if (won && !continueAfterWin) {
        g.fillStyle = 'rgba(0,0,0,0.72)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = '#80f0ff';
        g.font = 'bold 36px system-ui';
        g.textAlign = 'center';
        g.fillText('1024!', W / 2, H / 2 - 50);
        g.fillStyle = ACCENT;
        g.font = 'bold 22px system-ui';
        g.fillText('YOU WIN!', W / 2, H / 2 - 10);
        g.fillStyle = '#fff';
        g.font = '18px system-ui';
        g.fillText(`Score: ${score}`, W / 2, H / 2 + 24);
        g.fillStyle = ACCENT;
        g.font = '15px system-ui';
        g.fillText(`Best: ${hiScore}`, W / 2, H / 2 + 52);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.font = '14px system-ui';
        g.fillText('TAP TO CONTINUE', W / 2, H / 2 + 84);
        g.textAlign = 'left';
      }

      // Game over overlay
      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.78)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = '#ff6060';
        g.font = 'bold 30px system-ui';
        g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 40);
        g.fillStyle = '#fff';
        g.font = '20px system-ui';
        g.fillText(`Score: ${score}`, W / 2, H / 2 + 2);
        g.fillStyle = ACCENT;
        g.font = '16px system-ui';
        g.fillText(`Best: ${hiScore}`, W / 2, H / 2 + 32);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.font = '14px system-ui';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 68);
        g.textAlign = 'left';
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.85)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 22px system-ui';
        g.textAlign = 'center';
        g.fillText('HOW TO PLAY', W / 2, H / 2 - 120);
        g.fillStyle = '#ccc';
        g.font = '15px system-ui';
        const lines = [
          'SWIPE in any direction.',
          'All tiles slide that way.',
          'Equal tiles MERGE & double.',
          '',
          '5×5 grid. Target: 1024.',
          'Score = sum of all merges.',
          '',
          `High score: ${hiScore}`,
        ];
        lines.forEach((ln, i) => g.fillText(ln, W / 2, H / 2 - 68 + i * 28));
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = '14px system-ui';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, H / 2 + 160);
        g.textAlign = 'left';
      }

      // HUD
      g.font = 'bold 18px system-ui';
      g.textAlign = 'left';
      g.fillStyle = ACCENT;
      g.fillText('1024 Moves', 16, 30);
      g.textAlign = 'right';
      g.fillStyle = '#fff';
      g.fillText(score.toString(), W - 50, 30);
      g.textAlign = 'left';

      // Best score under HUD
      g.fillStyle = 'rgba(224,64,251,0.5)';
      g.font = '12px system-ui';
      g.fillText(`Best: ${hiScore}`, 16, H - SAFE - 8);

      // Info button (drawn LAST)
      g.beginPath();
      g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2);
      g.fillStyle = 'rgba(224,64,251,0.18)';
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
