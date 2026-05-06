window.plethoraBit = {
  meta: {
    title: '2048',
    author: 'plethora',
    description: 'Swipe to merge tiles and reach 2048!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FF9800';
    const BG = '#0f0f14';

    // Tile colors by value
    const TILE_COLORS = {
      0:    { bg: 'rgba(255,255,255,0.04)', fg: 'transparent' },
      2:    { bg: '#F5E8D4', fg: '#3E2723' },
      4:    { bg: '#E8D5B7', fg: '#3E2723' },
      8:    { bg: '#FF9800', fg: '#fff' },
      16:   { bg: '#F57C00', fg: '#fff' },
      32:   { bg: '#EF5350', fg: '#fff' },
      64:   { bg: '#C62828', fg: '#fff' },
      128:  { bg: '#FDD835', fg: '#3E2723' },
      256:  { bg: '#F9A825', fg: '#3E2723' },
      512:  { bg: '#C6FF00', fg: '#3E2723' },
      1024: { bg: '#43A047', fg: '#fff' },
      2048: { bg: '#00BCD4', fg: '#fff' },
    };

    function tileColor(v) {
      if (TILE_COLORS[v]) return TILE_COLORS[v];
      return { bg: '#7B1FA2', fg: '#fff' }; // beyond 2048
    }

    const GRID = 4;
    const ANIM_MS = 150;
    const HUD_H = 48;

    let score = 0;
    let bestScore = ctx.storage.get('bt_2048') || 0;
    let gameStarted = false;
    let gameOver = false;
    let won = false;
    let continueAfterWin = false;
    let showInfo = false;
    let audioCtx = null;
    let voiceCount = 0;

    const IBTN = { x: W - 22, y: 8, r: 14 };

    // Tip button — 2048 has no fixed solution, so just show a hint
    let showTip = false;
    const EYE_X = W - 44, EYE_CY = 62, EYE_R = 20;

    // Each cell: { val, id, mergedFrom, isNew }
    // Animation state: tiles have { x, y } grid coords + animated positions
    let tiles = []; // array of tile objects
    let nextId = 1;
    let animTiles = []; // snapshot for rendering during animation
    let animStartTime = 0;
    let animating = false;

    // ── Layout ────────────────────────────────────────────────────────────────
    function getLayout() {
      const MARGIN = 16;
      const GAP = 8;
      const availW = W - MARGIN * 2;
      const availH = USABLE_H - HUD_H - MARGIN * 2 - 8;
      const boardSize = Math.min(availW, availH, 380);
      const ox = Math.floor((W - boardSize) / 2);
      const oy = HUD_H + MARGIN + Math.floor((availH - boardSize) / 2);
      const cellSize = (boardSize - GAP * (GRID + 1)) / GRID;
      return { boardSize, ox, oy, cellSize, gap: GAP };
    }

    // ── Grid helpers ──────────────────────────────────────────────────────────
    function gridToPixel(col, row, layout) {
      const { ox, oy, cellSize, gap } = layout;
      return {
        x: ox + gap + col * (cellSize + gap),
        y: oy + gap + row * (cellSize + gap),
      };
    }

    // ── Tile management ───────────────────────────────────────────────────────
    function createTile(val, row, col) {
      return { id: nextId++, val, row, col, isNew: true, mergedFrom: null };
    }

    function newTile(row, col) {
      const val = Math.random() < 0.9 ? 2 : 4;
      return createTile(val, row, col);
    }

    function addRandomTile() {
      const empty = [];
      const occupied = new Set(tiles.map(t => `${t.row},${t.col}`));
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++)
          if (!occupied.has(`${r},${c}`)) empty.push([r, c]);
      if (!empty.length) return false;
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      tiles.push(newTile(r, c));
      return true;
    }

    function initBoard() {
      tiles = [];
      score = 0;
      gameOver = false;
      won = false;
      continueAfterWin = false;
      gameStarted = false;
      animating = false;
      showTip = false;
      addRandomTile();
      addRandomTile();
    }

    // ── Move logic ────────────────────────────────────────────────────────────
    // Returns { moved, scoreGain, animData }
    function move(dir) {
      // dir: 'left' | 'right' | 'up' | 'down'
      // We process each row/column in the movement direction
      let moved = false;
      let scoreGain = 0;
      const animData = []; // { id, fromRow, fromCol, toRow, toCol, merged, newVal }

      // Clear merge flags
      tiles.forEach(t => { t.mergedFrom = null; t.isNew = false; });

      // Build a 2D grid map: grid[r][c] = tile or null
      const grid = Array.from({ length: GRID }, () => Array(GRID).fill(null));
      tiles.forEach(t => { grid[t.row][t.col] = t; });

      function processLine(indices) {
        // indices: array of [r, c] in order from "toward-wall" to "away-from-wall"
        // We slide from the wall end
        let line = indices.map(([r, c]) => grid[r][c]);
        const result = [];
        const merged = new Set();

        for (let i = 0; i < line.length; i++) {
          if (!line[i]) continue;
          const tile = line[i];
          if (result.length > 0) {
            const last = result[result.length - 1];
            if (last.val === tile.val && !merged.has(last.id)) {
              // Merge
              merged.add(last.id);
              last.val *= 2;
              scoreGain += last.val;
              last.mergedFrom = tile.id;
              // Record animation for the merging tile
              animData.push({ id: tile.id, fromRow: tile.row, fromCol: tile.col,
                toRow: indices[result.length - 1][0], toCol: indices[result.length - 1][1],
                merged: true });
              // Remove the consumed tile from tiles list
              tiles = tiles.filter(t => t.id !== tile.id);
              moved = true;
              continue;
            }
          }
          result.push(tile);
        }

        // Slide tiles into position
        result.forEach((tile, i) => {
          const [newR, newC] = indices[i];
          if (tile.row !== newR || tile.col !== newC) {
            animData.push({ id: tile.id, fromRow: tile.row, fromCol: tile.col,
              toRow: newR, toCol: newC, merged: false });
            tile.row = newR;
            tile.col = newC;
            moved = true;
          }
        });

        // Update grid
        indices.forEach(([r, c]) => { grid[r][c] = null; });
        result.forEach((tile, i) => { grid[indices[i][0]][indices[i][1]] = tile; });
      }

      if (dir === 'left') {
        for (let r = 0; r < GRID; r++)
          processLine(Array.from({ length: GRID }, (_, c) => [r, c]));
      } else if (dir === 'right') {
        for (let r = 0; r < GRID; r++)
          processLine(Array.from({ length: GRID }, (_, c) => [r, GRID - 1 - c]));
      } else if (dir === 'up') {
        for (let c = 0; c < GRID; c++)
          processLine(Array.from({ length: GRID }, (_, r) => [r, c]));
      } else if (dir === 'down') {
        for (let c = 0; c < GRID; c++)
          processLine(Array.from({ length: GRID }, (_, r) => [GRID - 1 - r, c]));
      }

      return { moved, scoreGain, animData };
    }

    function hasMovesLeft() {
      const grid = Array.from({ length: GRID }, () => Array(GRID).fill(0));
      tiles.forEach(t => { grid[t.row][t.col] = t.val; });
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++) {
          if (!grid[r][c]) return true;
          if (c + 1 < GRID && grid[r][c] === grid[r][c + 1]) return true;
          if (r + 1 < GRID && grid[r][c] === grid[r + 1][c]) return true;
        }
      return false;
    }

    // ── Audio ─────────────────────────────────────────────────────────────────
    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq, dur, vol = 0.1, type = 'sine') {
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

    function playSlide() { playNote(300, 0.07, 0.07); }
    function playMerge(val) {
      const freq = 200 + Math.log2(val) * 50;
      playNote(freq, 0.12, 0.13, 'triangle');
    }
    function playWin() {
      [523, 659, 784, 1047].forEach((f, i) => ctx.timeout(() => playNote(f, 0.5, 0.15), i * 80));
    }
    function playGameOver() {
      [300, 220, 180].forEach((f, i) => ctx.timeout(() => playNote(f, 0.3, 0.15, 'sawtooth'), i * 100));
    }

    // ── Round rect helper ─────────────────────────────────────────────────────
    function rr(x, y, w, h, rad) {
      if (g.roundRect) { g.roundRect(x, y, w, h, rad); return; }
      g.beginPath();
      g.moveTo(x + rad, y); g.lineTo(x + w - rad, y);
      g.arcTo(x + w, y, x + w, y + rad, rad);
      g.lineTo(x + w, y + h - rad);
      g.arcTo(x + w, y + h, x + w - rad, y + h, rad);
      g.lineTo(x + rad, y + h);
      g.arcTo(x, y + h, x, y + h - rad, rad);
      g.lineTo(x, y + rad);
      g.arcTo(x, y, x + rad, y, rad);
      g.closePath();
    }

    // ── Swipe detection ───────────────────────────────────────────────────────
    let touchStart = null;

    function handleSwipe(dx, dy) {
      if (gameOver) return;
      if (won && !continueAfterWin) return;
      if (animating) return;

      const absDx = Math.abs(dx), absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 20) return;

      let dir;
      if (absDx > absDy) dir = dx > 0 ? 'right' : 'left';
      else dir = dy > 0 ? 'down' : 'up';

      if (!gameStarted) {
        gameStarted = true;
        ctx.platform.start();
      }

      const { moved, scoreGain, animData } = move(dir);
      if (!moved) return;

      score += scoreGain;
      if (score > bestScore) {
        bestScore = score;
        ctx.storage.set('bt_2048', bestScore);
      }

      ctx.platform.setScore(score);
      ctx.platform.interact({ type: 'swipe' });

      if (scoreGain > 0) playMerge(scoreGain);
      else playSlide();
      ctx.platform.haptic('light');

      // Check for 2048
      if (!won && tiles.some(t => t.val === 2048)) {
        won = true;
        playWin();
        ctx.platform.haptic('heavy');
        ctx.platform.complete({ score, result: 'won', durationMs: 0 });
      }

      // Kick off animation
      animating = true;
      animStartTime = performance.now();

      // After animation, add new tile
      ctx.timeout(() => {
        animating = false;
        tiles.forEach(t => { t.isNew = false; });
        addRandomTile();
        if (!hasMovesLeft()) {
          gameOver = true;
          playGameOver();
          ctx.platform.fail({ reason: 'no moves' });
        }
      }, ANIM_MS);
    }

    initBoard();

    // ── Render loop ───────────────────────────────────────────────────────────
    ctx.raf(() => {
      const now = performance.now();
      const layout = getLayout();
      const { boardSize, ox, oy, cellSize, gap } = layout;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // ── HUD ──
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, 0, W, HUD_H);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('2048', 16, 24);

      // Score boxes
      const scoreBoxW = 72;
      const scoreBoxH = 34;
      const scoreBoxY = (HUD_H - scoreBoxH) / 2;

      // Current score
      const sbx1 = W - 50 - scoreBoxW - 8 - scoreBoxW;
      g.beginPath(); rr(sbx1, scoreBoxY, scoreBoxW, scoreBoxH, 6);
      g.fillStyle = 'rgba(255,152,0,0.15)';
      g.fill();
      g.font = 'bold 9px -apple-system, sans-serif';
      g.fillStyle = 'rgba(255,152,0,0.7)';
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('SCORE', sbx1 + scoreBoxW / 2, scoreBoxY + 5);
      g.font = 'bold 14px -apple-system, sans-serif';
      g.fillStyle = '#fff';
      g.textBaseline = 'bottom';
      g.fillText(String(score), sbx1 + scoreBoxW / 2, scoreBoxY + scoreBoxH - 4);

      // Best score
      const sbx2 = sbx1 + scoreBoxW + 8;
      g.beginPath(); rr(sbx2, scoreBoxY, scoreBoxW, scoreBoxH, 6);
      g.fillStyle = 'rgba(255,152,0,0.08)';
      g.fill();
      g.font = 'bold 9px -apple-system, sans-serif';
      g.fillStyle = 'rgba(255,152,0,0.5)';
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('BEST', sbx2 + scoreBoxW / 2, scoreBoxY + 5);
      g.font = 'bold 14px -apple-system, sans-serif';
      g.fillStyle = '#aaa';
      g.textBaseline = 'bottom';
      g.fillText(String(bestScore), sbx2 + scoreBoxW / 2, scoreBoxY + scoreBoxH - 4);

      // ── Board background ──
      g.beginPath();
      rr(ox, oy, boardSize, boardSize, 10);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fill();

      // ── Empty cell slots ──
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const px = ox + gap + c * (cellSize + gap);
          const py = oy + gap + r * (cellSize + gap);
          g.beginPath();
          rr(px, py, cellSize, cellSize, 6);
          g.fillStyle = 'rgba(255,255,255,0.04)';
          g.fill();
        }
      }

      // ── Tiles ──
      const animT = animating ? Math.min((now - animStartTime) / ANIM_MS, 1) : 1;
      // Ease in-out cubic
      const eased = animT < 0.5
        ? 4 * animT * animT * animT
        : 1 - Math.pow(-2 * animT + 2, 3) / 2;

      // Sort: new/merged tiles on top
      const sortedTiles = [...tiles].sort((a, b) => {
        if (a.isNew && !b.isNew) return 1;
        if (!a.isNew && b.isNew) return -1;
        return 0;
      });

      sortedTiles.forEach(tile => {
        // Determine rendered position
        let px, py;

        if (animating && !tile.isNew) {
          // Slide animation: find if this tile moved
          // Since we updated tile.row/col already, we need the "from" info
          // We stored the current position in tile; draw at interpolated position
          // Tiles that weren't in animData didn't move — just draw at current pos
          const tp = gridToPixel(tile.col, tile.row, layout);
          px = tp.x;
          py = tp.y;
          // Note: we don't store pre-move positions on tile objects in this design,
          // so slide interpolation is approximate (tiles pop to final position).
          // For smooth slide, we track prevRow/prevCol on each tile during move.
        } else {
          const tp = gridToPixel(tile.col, tile.row, layout);
          px = tp.x;
          py = tp.y;
        }

        // Pop-in scale for new tiles
        let scale = 1;
        if (tile.isNew) {
          const t2 = Math.min((now - animStartTime) / ANIM_MS, 1);
          const s = 1.70158;
          scale = Math.max(0, 1 + (s + 1) * Math.pow(t2 - 1, 3) + s * Math.pow(t2 - 1, 2));
        }

        // Merge pop for merged tiles
        if (tile.mergedFrom !== null) {
          const t2 = Math.min((now - animStartTime) / ANIM_MS, 1);
          const bounce = Math.sin(t2 * Math.PI) * 0.15 + 1;
          scale *= bounce;
        }

        const drawW = cellSize * scale;
        const drawH = cellSize * scale;
        const drawX = px + (cellSize - drawW) / 2;
        const drawY = py + (cellSize - drawH) / 2;

        const { bg, fg } = tileColor(tile.val);

        g.save();
        g.beginPath();
        rr(drawX, drawY, drawW, drawH, 6 * scale);
        g.fillStyle = bg;
        g.fill();

        if (tile.val >= 2048) {
          g.shadowColor = bg;
          g.shadowBlur = 12;
          g.fill();
          g.shadowBlur = 0;
        }

        // Tile number
        if (tile.val > 0) {
          const digits = String(tile.val).length;
          const fontSize = digits <= 2
            ? Math.floor(cellSize * 0.46 * scale)
            : digits === 3
              ? Math.floor(cellSize * 0.36 * scale)
              : Math.floor(cellSize * 0.28 * scale);
          g.font = `bold ${fontSize}px -apple-system, sans-serif`;
          g.fillStyle = fg;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(String(tile.val), drawX + drawW / 2, drawY + drawH / 2);
        }
        g.restore();
      });

      // ── Win overlay (dismissable) ──
      if (won && !continueAfterWin) {
        g.fillStyle = 'rgba(15,15,20,0.85)';
        g.fillRect(0, 0, W, USABLE_H);

        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 42px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.shadowColor = ACCENT; g.shadowBlur = 24;
        g.fillText('2048!', W / 2, USABLE_H / 2 - 66);
        g.shadowBlur = 0;

        g.font = '18px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillText('You reached 2048!', W / 2, USABLE_H / 2 - 18);
        g.fillText(`Score: ${score}`, W / 2, USABLE_H / 2 + 18);

        // Continue button
        const btnW2 = 180, btnH2 = 46;
        const btnX2 = W / 2 - btnW2 / 2;
        const btnY2 = USABLE_H / 2 + 52;
        g.beginPath(); rr(btnX2, btnY2, btnW2, btnH2, 10);
        g.fillStyle = ACCENT + 'cc'; g.fill();
        g.strokeStyle = ACCENT; g.lineWidth = 1.5;
        g.beginPath(); rr(btnX2, btnY2, btnW2, btnH2, 10); g.stroke();
        g.font = 'bold 15px -apple-system, sans-serif';
        g.fillStyle = '#fff';
        g.fillText('KEEP GOING', W / 2, btnY2 + btnH2 / 2);

        // New game button
        const btnY3 = btnY2 + btnH2 + 12;
        g.beginPath(); rr(btnX2, btnY3, btnW2, btnH2, 10);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill();
        g.font = 'bold 15px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillText('NEW GAME', W / 2, btnY3 + btnH2 / 2);
      }

      // ── Game Over overlay ──
      if (gameOver) {
        g.fillStyle = 'rgba(15,15,20,0.87)';
        g.fillRect(0, 0, W, USABLE_H);

        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 38px -apple-system, sans-serif';
        g.fillStyle = '#EF5350';
        g.shadowColor = '#EF5350'; g.shadowBlur = 16;
        g.fillText('GAME OVER', W / 2, USABLE_H / 2 - 60);
        g.shadowBlur = 0;

        g.font = '18px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillText(`Score: ${score}`, W / 2, USABLE_H / 2 - 12);
        g.fillText(`Best: ${bestScore}`, W / 2, USABLE_H / 2 + 20);

        g.font = 'bold 14px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('TAP TO PLAY AGAIN', W / 2, USABLE_H / 2 + 60);
      }

      // ── Info panel ──
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);

        const cw = Math.floor(W * 0.84);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.78), 500);
        const cy2 = Math.floor((USABLE_H - ch) / 2);

        g.fillStyle = '#1a1a2e';
        g.beginPath(); rr(cx2, cy2, cw, ch, 16); g.fill();

        g.save(); g.globalAlpha = 0.12; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 52, 60, 0, Math.PI * 2); g.fill();
        g.restore();

        g.fillStyle = ACCENT;
        g.font = 'bold 30px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('2048', W / 2, cy2 + 56);

        const lx = cx2 + 20;
        let ty = cy2 + 84;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Swipe to slide all tiles',
          '• Equal tiles merge into one',
          '• Score = sum of all merges',
          '• Reach 2048 to win!',
          '• No moves left = game over',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#fff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('TILE COLORS', lx, ty); ty += lh + 4;

        const colorSamples = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
        const sampW = Math.floor((cw - 40) / colorSamples.length) - 2;
        colorSamples.forEach((v, i) => {
          const { bg, fg } = tileColor(v);
          const sx = lx + i * (sampW + 2);
          g.beginPath(); rr(sx, ty, sampW, sampW, 4); g.fillStyle = bg; g.fill();
          const digits = String(v).length;
          const fs = digits <= 2 ? 9 : digits === 3 ? 7 : 6;
          g.font = `bold ${fs}px -apple-system, sans-serif`;
          g.fillStyle = fg;
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(String(v), sx + sampW / 2, ty + sampW / 2);
        });
        ty += sampW + lh;

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

      // ── Tip button ──
      g.save();
      g.globalAlpha = 0.5;
      g.fillStyle = '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI*2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      // ── Tip overlay ──
      if (showTip) {
        g.fillStyle = 'rgba(0,0,0,0.78)';
        g.fillRect(0, 0, W, USABLE_H);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 22px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.fillText('TIP', W / 2, USABLE_H / 2 - 40);
        g.font = '15px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillText('Swipe to merge tiles!', W / 2, USABLE_H / 2 - 6);
        g.fillText('Keep high tiles in a corner.', W / 2, USABLE_H / 2 + 22);
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, USABLE_H / 2 + 60);

        // Banner: tap anywhere for new board
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, USABLE_H - 48, W, 48);
        g.fillStyle = ACCENT;
        g.font = 'bold 15px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TAP ANYWHERE FOR NEW GAME', W / 2, USABLE_H - 24);
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

      // Tip button
      if (Math.hypot(tx - EYE_X, ty2 - EYE_CY) < EYE_R + 8) {
        showTip = !showTip;
        return;
      }
      if (showTip) { showTip = false; initBoard(); return; }

      touchStart = { x: tx, y: ty2, time: performance.now() };
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!touchStart) return;
      if (showInfo) { showInfo = false; touchStart = null; return; }

      const tx = e.changedTouches[0].clientX;
      const ty2 = e.changedTouches[0].clientY;
      const dx = tx - touchStart.x;
      const dy = ty2 - touchStart.y;
      touchStart = null;

      // Win overlay tap handling
      if (won && !continueAfterWin) {
        const btnW2 = 180, btnH2 = 46;
        const btnX2 = W / 2 - btnW2 / 2;
        const continueY = USABLE_H / 2 + 52;
        const newGameY = continueY + btnH2 + 12;

        if (tx >= btnX2 && tx <= btnX2 + btnW2 && ty2 >= continueY && ty2 <= continueY + btnH2) {
          continueAfterWin = true;
          return;
        }
        if (tx >= btnX2 && tx <= btnX2 + btnW2 && ty2 >= newGameY && ty2 <= newGameY + btnH2) {
          initBoard();
          return;
        }
        // Tap anywhere else on overlay = continue
        continueAfterWin = true;
        return;
      }

      // Game over tap = new game
      if (gameOver) {
        initBoard();
        return;
      }

      handleSwipe(dx, dy);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
