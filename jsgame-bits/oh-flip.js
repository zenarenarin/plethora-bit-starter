// OH FLIP — Grid Flip Puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Oh Flip',
    author: 'plethora',
    description: 'Flip cells so all are the same color!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const ACCENT = '#FFD740';

    // --- Audio ---
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    let voices = 0;
    function playTone(freq, type, dur, vol = 0.25) {
      if (!audioCtx || voices >= 8) return;
      voices++;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      o.onended = () => voices--;
    }
    function playFlip()  { playTone(500 + Math.random() * 100, 'sine', 0.08, 0.22); }
    function playSolve() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.35), i * 80)); }
    function playWin()   { [784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.25, 0.4), i * 90)); }

    const IBTN = { x: W - 22, y: 8, r: 14 };
    const HUD_H = 48;
    const GRID_N = 5;
    const PAD = 12;

    // Grid layout
    const GRID_AVAIL = Math.min(W, H - HUD_H - SAFE - 100) - PAD * 2;
    const CELL_SIZE = (GRID_AVAIL - PAD * (GRID_N - 1)) / GRID_N;
    const GRID_W = CELL_SIZE * GRID_N + PAD * (GRID_N - 1);
    const GRID_X = (W - GRID_W) / 2;
    const GRID_Y = HUD_H + PAD + (H - HUD_H - SAFE - GRID_W) / 2;

    // 5 hand-crafted puzzles: 0=black 1=white, optimal move count
    // Each puzzle has a known solution via the "lights-out" pattern
    const PUZZLES = [
      {
        grid: [
          1,0,1,0,1,
          0,1,0,1,0,
          1,0,1,0,1,
          0,1,0,1,0,
          1,0,1,0,1,
        ],
        optimal: 9,
        name: 'Checkers',
      },
      {
        grid: [
          0,0,0,0,0,
          0,1,1,1,0,
          0,1,0,1,0,
          0,1,1,1,0,
          0,0,0,0,0,
        ],
        optimal: 8,
        name: 'Frame',
      },
      {
        grid: [
          1,1,1,1,1,
          1,0,0,0,1,
          1,0,1,0,1,
          1,0,0,0,1,
          1,1,1,1,1,
        ],
        optimal: 7,
        name: 'Border',
      },
      {
        grid: [
          0,1,0,1,0,
          0,0,0,0,0,
          1,0,1,0,1,
          0,0,0,0,0,
          0,1,0,1,0,
        ],
        optimal: 6,
        name: 'Diamonds',
      },
      {
        grid: [
          1,0,0,0,1,
          0,1,0,1,0,
          0,0,1,0,0,
          0,1,0,1,0,
          1,0,0,0,1,
        ],
        optimal: 5,
        name: 'X-Cross',
      },
    ];

    // --- State ---
    let grid, cells, moves, bestMoves, gameOver, started, showInfo;
    let puzzleIdx = 0;
    let solveAnim = 0;
    let levelSelectAnim = 0;

    // Cell flip animation state
    function makeCell(val) {
      return {
        val,          // 0 or 1
        flipAngle: 0, // 0 = settled, during flip goes through 0..PI
        flipping: false,
        flipTo: val,
      };
    }

    function initPuzzle(idx) {
      puzzleIdx = idx % PUZZLES.length;
      const p = PUZZLES[puzzleIdx];
      grid = [...p.grid];
      cells = grid.map(v => makeCell(v));
      moves = 0;
      gameOver = false;
      started = false;
      showInfo = false;
      solveAnim = 0;
      bestMoves = ctx.storage.get('hs_ohflip_' + puzzleIdx) || null;
    }

    function cellXY(idx) {
      const col = idx % GRID_N;
      const row = Math.floor(idx / GRID_N);
      return {
        x: GRID_X + col * (CELL_SIZE + PAD) + CELL_SIZE / 2,
        y: GRID_Y + row * (CELL_SIZE + PAD) + CELL_SIZE / 2,
      };
    }

    function tapCell(idx) {
      // Flip cell + orthogonal neighbors
      const col = idx % GRID_N;
      const row = Math.floor(idx / GRID_N);
      const toFlip = [idx];
      if (col > 0) toFlip.push(idx - 1);
      if (col < GRID_N - 1) toFlip.push(idx + 1);
      if (row > 0) toFlip.push(idx - GRID_N);
      if (row < GRID_N - 1) toFlip.push(idx + GRID_N);

      toFlip.forEach((i, delay) => {
        const c = cells[i];
        const newVal = 1 - grid[i];
        grid[i] = newVal;
        c.flipTo = newVal;
        c.flipping = true;
        c.flipAngle = 0;
        c._delay = delay * 0.04;
        c._delayTimer = delay * 0.04;
      });

      moves++;
      playFlip();
      ctx.platform.haptic('light');
      ctx.platform.interact({ type: 'tap' });

      // Check win (deferred to after anim)
      ctx.timeout(() => {
        const allSame = grid.every(v => v === grid[0]);
        if (allSame) {
          gameOver = true;
          solveAnim = 0.001;
          playSolve();
          ctx.timeout(() => playWin(), 500);
          ctx.platform.complete({ score: moves });
          if (!bestMoves || moves < bestMoves) {
            bestMoves = moves;
            ctx.storage.set('hs_ohflip_' + puzzleIdx, bestMoves);
          }
        }
      }, 350);
    }

    function hitTestCell(px, py) {
      for (let i = 0; i < GRID_N * GRID_N; i++) {
        const col = i % GRID_N;
        const row = Math.floor(i / GRID_N);
        const x = GRID_X + col * (CELL_SIZE + PAD);
        const y = GRID_Y + row * (CELL_SIZE + PAD);
        if (px >= x && px <= x + CELL_SIZE && py >= y && py <= y + CELL_SIZE) {
          return i;
        }
      }
      return -1;
    }

    // Next/prev puzzle buttons
    const NEXT_BTN = { x: W - 50, y: H - SAFE - 28, w: 44, h: 28 };
    const PREV_BTN = { x: 6, y: H - SAFE - 28, w: 44, h: 28 };

    initPuzzle(0);

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const px = t.clientX, py = t.clientY;

      // Info button first
      const dx = px - IBTN.x, dy = py - IBTN.y;
      if (dx * dx + dy * dy <= IBTN.r * IBTN.r) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (gameOver) {
        // Tap to go to next puzzle
        initPuzzle(puzzleIdx + 1);
        return;
      }

      // Prev/Next buttons
      if (px >= PREV_BTN.x && px <= PREV_BTN.x + PREV_BTN.w &&
          py >= PREV_BTN.y && py <= PREV_BTN.y + PREV_BTN.h) {
        initPuzzle((puzzleIdx - 1 + PUZZLES.length) % PUZZLES.length);
        return;
      }
      if (px >= NEXT_BTN.x && px <= NEXT_BTN.x + NEXT_BTN.w &&
          py >= NEXT_BTN.y && py <= NEXT_BTN.y + NEXT_BTN.h) {
        initPuzzle(puzzleIdx + 1);
        return;
      }

      // First real interaction
      if (!started) {
        started = true;
        ctx.platform.start();
      }

      const idx = hitTestCell(px, py);
      if (idx >= 0) {
        tapCell(idx);
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    const CELL_R = 8;
    const FLIP_SPEED = 10; // radians/sec (half flip = PI)

    ctx.raf((dt) => {
      const sec = dt / 1000;

      // Update cell flip animations
      cells.forEach(c => {
        if (!c.flipping) return;
        if (c._delayTimer > 0) { c._delayTimer -= sec; return; }
        c.flipAngle += sec * FLIP_SPEED;
        if (c.flipAngle >= Math.PI) {
          c.flipAngle = 0;
          c.flipping = false;
          c.val = c.flipTo;
        }
      });

      // Win wave
      if (solveAnim > 0) {
        solveAnim += sec * 1.8;
        if (solveAnim > 8) solveAnim = 0;
      }

      // Background
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);

      // Subtle radial glow
      const radGrad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      radGrad.addColorStop(0, 'rgba(255,215,64,0.04)');
      radGrad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = radGrad;
      g.fillRect(0, 0, W, H);

      // Draw cells
      for (let i = 0; i < GRID_N * GRID_N; i++) {
        const c = cells[i];
        const col = i % GRID_N;
        const row = Math.floor(i / GRID_N);
        const cx = GRID_X + col * (CELL_SIZE + PAD) + CELL_SIZE / 2;
        const cy_base = GRID_Y + row * (CELL_SIZE + PAD) + CELL_SIZE / 2;

        // Wave offset
        let waveOff = 0;
        if (solveAnim > 0) {
          const dist = (col + row) * 0.5;
          waveOff = Math.sin((solveAnim - dist) * Math.PI) * 8;
        }
        const cy = cy_base + waveOff;

        // Flip animation: scale X as cos of flip angle
        let scaleX, displayVal;
        if (c.flipping && c._delayTimer <= 0) {
          scaleX = Math.abs(Math.cos(c.flipAngle));
          displayVal = c.flipAngle < Math.PI / 2 ? c.val : c.flipTo;
        } else {
          scaleX = 1;
          displayVal = c.val;
        }

        g.save();
        g.translate(cx, cy);
        g.scale(scaleX, 1);

        const hw = CELL_SIZE / 2;

        if (displayVal === 1) {
          // White cell
          const wGrad = g.createLinearGradient(-hw, -hw, hw, hw);
          wGrad.addColorStop(0, '#e8e8e8');
          wGrad.addColorStop(1, '#c0c0c0');
          g.fillStyle = wGrad;
          g.shadowColor = 'rgba(255,215,64,0.3)';
          g.shadowBlur = 8;
          roundRectC(g, -hw, -hw, CELL_SIZE, CELL_SIZE, CELL_R);
          g.fill();
          g.shadowBlur = 0;
          // Highlight
          g.fillStyle = 'rgba(255,255,255,0.5)';
          roundRectC(g, -hw + 2, -hw + 2, CELL_SIZE - 4, 6, 3);
          g.fill();
        } else {
          // Black cell
          const bGrad = g.createLinearGradient(-hw, -hw, hw, hw);
          bGrad.addColorStop(0, '#2a2a2a');
          bGrad.addColorStop(1, '#111111');
          g.fillStyle = bGrad;
          roundRectC(g, -hw, -hw, CELL_SIZE, CELL_SIZE, CELL_R);
          g.fill();
          g.strokeStyle = 'rgba(255,215,64,0.2)';
          g.lineWidth = 1;
          roundRectC(g, -hw, -hw, CELL_SIZE, CELL_SIZE, CELL_R);
          g.stroke();
        }

        g.restore();
      }

      // HUD
      g.fillStyle = 'rgba(15,15,20,0.92)';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = 'rgba(255,215,64,0.15)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = ACCENT;
      g.font = 'bold 15px system-ui';
      g.fillText('Oh Flip', 16, 24);

      g.textAlign = 'right';
      g.fillStyle = '#ffffff';
      const p = PUZZLES[puzzleIdx];
      const hsText = bestMoves ? ` · Best:${bestMoves}` : '';
      g.fillText(`Moves:${moves} / Target:${p.optimal}${hsText}`, W - 50, 24);

      // Puzzle name + level dots
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.font = '11px system-ui';
      g.fillText(p.name, W / 2, GRID_Y + GRID_W + 8);

      // Level dots
      const dotY = GRID_Y + GRID_W + 26;
      const dotSpacing = 14;
      const dotsX = W / 2 - ((PUZZLES.length - 1) * dotSpacing) / 2;
      for (let i = 0; i < PUZZLES.length; i++) {
        g.beginPath();
        g.arc(dotsX + i * dotSpacing, dotY, i === puzzleIdx ? 5 : 3, 0, Math.PI * 2);
        g.fillStyle = i === puzzleIdx ? ACCENT : 'rgba(255,255,255,0.2)';
        g.fill();
      }

      // Prev/Next buttons
      if (H - SAFE - 28 > GRID_Y + GRID_W + 40) {
        // Prev
        g.fillStyle = 'rgba(255,215,64,0.12)';
        roundRectC(g, PREV_BTN.x, PREV_BTN.y, PREV_BTN.w, PREV_BTN.h, 8);
        g.fill();
        g.strokeStyle = 'rgba(255,215,64,0.3)';
        g.lineWidth = 1;
        roundRectC(g, PREV_BTN.x, PREV_BTN.y, PREV_BTN.w, PREV_BTN.h, 8);
        g.stroke();
        g.fillStyle = ACCENT;
        g.font = 'bold 14px system-ui';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('‹ Prev', PREV_BTN.x + PREV_BTN.w / 2, PREV_BTN.y + PREV_BTN.h / 2);

        // Next
        g.fillStyle = 'rgba(255,215,64,0.12)';
        roundRectC(g, NEXT_BTN.x, NEXT_BTN.y, NEXT_BTN.w, NEXT_BTN.h, 8);
        g.fill();
        g.strokeStyle = 'rgba(255,215,64,0.3)';
        g.lineWidth = 1;
        roundRectC(g, NEXT_BTN.x, NEXT_BTN.y, NEXT_BTN.w, NEXT_BTN.h, 8);
        g.stroke();
        g.fillStyle = ACCENT;
        g.font = 'bold 14px system-ui';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('Next ›', NEXT_BTN.x + NEXT_BTN.w / 2, NEXT_BTN.y + NEXT_BTN.h / 2);
      }

      // Solve overlay
      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.82)';
        g.fillRect(0, 0, W, H);

        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = 'bold 34px system-ui';
        g.fillStyle = ACCENT;
        g.fillText('Solved!', W / 2, H / 2 - 55);

        g.font = '17px system-ui';
        g.fillStyle = '#ffffff';
        g.fillText(`Your moves: ${moves}`, W / 2, H / 2 - 10);
        g.fillText(`Target: ${p.optimal}`, W / 2, H / 2 + 18);

        if (bestMoves) {
          g.fillStyle = ACCENT;
          g.font = '14px system-ui';
          g.fillText(`Best: ${bestMoves}`, W / 2, H / 2 + 48);
        }

        const rating = moves <= p.optimal ? '⭐⭐⭐' : moves <= p.optimal + 2 ? '⭐⭐' : '⭐';
        g.font = '22px system-ui';
        g.fillText(rating, W / 2, H / 2 + 78);

        g.font = '13px system-ui';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('TAP FOR NEXT PUZZLE', W / 2, H / 2 + 115);
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const boxW = W - 60, boxH = 260;
        const bx = 30, by = H / 2 - boxH / 2;
        g.fillStyle = '#1a1a1a';
        roundRectC(g, bx, by, boxW, boxH, 16);
        g.fill();
        g.strokeStyle = ACCENT;
        g.lineWidth = 1.5;
        roundRectC(g, bx, by, boxW, boxH, 16);
        g.stroke();

        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillStyle = ACCENT;
        g.font = 'bold 20px system-ui';
        g.fillText('How to Play', W / 2, by + 22);

        g.fillStyle = '#cccccc';
        g.font = '13px system-ui';
        const lines = [
          'Tap any cell to flip it',
          'AND all its neighbors.',
          'Goal: make ALL cells the',
          'same color (all ■ or all □).',
          'Beat the target move count!',
        ];
        lines.forEach((l, i) => g.fillText(l, W / 2, by + 60 + i * 27));

        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.font = '12px system-ui';
        g.textBaseline = 'bottom';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, by + boxH - 14);
      }

      // Info button (drawn LAST)
      g.save();
      g.beginPath();
      g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2);
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,215,64,0.15)';
      g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = showInfo ? '#0f0f14' : ACCENT;
      g.font = 'bold 14px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y);
      g.restore();
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};

function roundRectC(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
