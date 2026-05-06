// ONOFF — Light Switch Puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'ONOFF',
    author: 'plethora',
    description: 'Tap lights to toggle them off. Turn all lights OFF!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#69F0AE';
    const BG = '#0f0f14';
    const HUD_H = 48;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    const GRID = 5;

    // --- Audio ---
    let audioCtx = null;
    const voices = [];
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol = 0.25) {
      if (!audioCtx) return;
      while (voices.length >= 8) { try { voices.shift().stop(); } catch(e){} }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
    }
    function playOn()  { playTone(600, 'sine',  0.08, 0.2); }
    function playOff() { playTone(300, 'sine',  0.08, 0.2); }
    function playWin() { [784, 988, 1175, 1568].forEach((f,i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.35), i * 90)); }

    // --- Storage ---
    const bestKey = 'hs_onoff';
    let bestScores = ctx.storage.get(bestKey) || {};

    // --- Levels: 5x5 grid, toggle mask per cell ---
    // mask[r][c] = list of [dr,dc] to also flip when (r,c) tapped
    // state[r][c] = 1=ON, 0=OFF
    // solved initial state (given) is produced by randomly applying taps to all-OFF

    // Predefined initial states + toggle patterns (hand crafted)
    // Each level: { state: 5x5 array, toggle: 'ortho'|'diag'|'all'|custom, minTaps }
    // We'll just define state directly and toggle pattern
    const LEVELS = [
      {
        // Level 1 — orthogonal, simple 4-tap solution
        state: [
          [1,0,1,0,0],
          [0,1,0,0,0],
          [1,0,1,0,0],
          [0,0,0,0,0],
          [0,0,0,0,0],
        ],
        toggle: 'ortho',
        minTaps: 4,
        name: 'INTRO',
      },
      {
        // Level 2 — orthogonal, 5-tap
        state: [
          [1,1,0,1,1],
          [1,0,0,0,1],
          [0,0,0,0,0],
          [1,0,0,0,1],
          [1,1,0,1,1],
        ],
        toggle: 'ortho',
        minTaps: 4,
        name: 'RING',
      },
      {
        // Level 3 — diagonal toggles
        state: [
          [1,0,1,0,1],
          [0,1,0,1,0],
          [1,0,0,0,1],
          [0,1,0,1,0],
          [1,0,1,0,1],
        ],
        toggle: 'diag',
        minTaps: 5,
        name: 'DIAG',
      },
      {
        // Level 4 — ortho + self (plus pattern)
        state: [
          [0,1,0,1,0],
          [1,1,1,1,1],
          [0,1,0,1,0],
          [1,1,1,1,1],
          [0,1,0,1,0],
        ],
        toggle: 'plus',
        minTaps: 5,
        name: 'CROSS',
      },
      {
        // Level 5 — all neighbors (king's move + self)
        state: [
          [1,1,0,1,1],
          [1,0,1,0,1],
          [0,1,1,1,0],
          [1,0,1,0,1],
          [1,1,0,1,1],
        ],
        toggle: 'all',
        minTaps: 5,
        name: 'KING',
      },
    ];

    // Toggle patterns
    function getNeighbors(r, c, pattern) {
      const dirs = {
        ortho: [[0,0],[-1,0],[1,0],[0,-1],[0,1]],
        diag:  [[0,0],[-1,-1],[-1,1],[1,-1],[1,1]],
        plus:  [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-2,0],[2,0],[0,-2],[0,2]],
        all:   [[0,0],[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
      };
      return (dirs[pattern] || dirs.ortho).map(([dr,dc]) => [r+dr, c+dc])
        .filter(([nr,nc]) => nr >= 0 && nr < GRID && nc >= 0 && nc < GRID);
    }

    // --- State ---
    let level = 0;
    let grid = [];
    let taps = 0;
    let solved = false;
    let won = false;
    let showInfo = false;
    let started = false;
    let solveAnim = 0;  // pulse on win
    let pulseT = 0;

    function loadLevel(idx) {
      const def = LEVELS[idx];
      grid = def.state.map(row => [...row]);
      taps = 0;
      solved = false;
      solveAnim = 0;
      pulseT = 0;
    }

    function applyTap(r, c) {
      const def = LEVELS[level];
      const neighbors = getNeighbors(r, c, def.toggle);
      neighbors.forEach(([nr, nc]) => {
        grid[nr][nc] = grid[nr][nc] ? 0 : 1;
      });
      taps++;
    }

    function checkSolved() {
      return grid.every(row => row.every(v => v === 0));
    }

    // Grid drawing area
    const PAD = 20;
    const GRID_TOP = HUD_H + 20;
    const AVAIL = Math.min(W - PAD * 2, H - GRID_TOP - SAFE - 60);
    const CELL = Math.floor(AVAIL / GRID);
    const GRID_X = (W - CELL * GRID) / 2;
    const GRID_Y = GRID_TOP + 10;
    const GAP = 4;

    function cellRect(r, c) {
      return {
        x: GRID_X + c * CELL + GAP / 2,
        y: GRID_Y + r * CELL + GAP / 2,
        w: CELL - GAP,
        h: CELL - GAP,
      };
    }

    loadLevel(0);

    // --- Touch ---
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      if (Math.hypot(tx - IBTN.x, ty - IBTN.y) <= IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (won) {
        level = 0;
        won = false;
        loadLevel(0);
        started = false;
        return;
      }

      if (solved) {
        if (level < LEVELS.length - 1) {
          level++;
          loadLevel(level);
        } else {
          won = true;
          playWin();
          ctx.platform.complete({ score: taps });
        }
        return;
      }

      // hit test grid
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const rect = cellRect(r, c);
          if (tx >= rect.x && tx <= rect.x + rect.w && ty >= rect.y && ty <= rect.y + rect.h) {
            if (!started) { started = true; ctx.platform.start(); }
            const wasOn = grid[r][c] === 1;
            applyTap(r, c);
            wasOn ? playOff() : playOn();
            ctx.platform.interact({ type: 'tap' });
            ctx.platform.haptic('light');

            if (checkSolved()) {
              solved = true;
              solveAnim = 1;
              ctx.platform.haptic('heavy');
              playWin();
              const prev = bestScores[level] || Infinity;
              if (taps < prev) {
                bestScores[level] = taps;
                ctx.storage.set(bestKey, bestScores);
              }
              ctx.platform.setScore(taps);
            }
            return;
          }
        }
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    // --- Draw ---
    ctx.raf((dt) => {
      const sec = dt / 1000;
      pulseT += sec;
      if (solveAnim > 0) solveAnim = Math.max(0, solveAnim - sec * 1.2);

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // Draw grid
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const rect = cellRect(r, c);
          const on = grid[r][c] === 1;
          const cx = rect.x + rect.w / 2;
          const cy = rect.y + rect.h / 2;

          // Glow for on cells
          if (on) {
            const glow = audioCtx ? 0.35 : 0.3;
            const pulse = 0.8 + 0.2 * Math.sin(pulseT * 4 + r * 0.7 + c * 1.1);
            // outer glow
            const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rect.w * 0.8);
            grad.addColorStop(0, `rgba(105,240,174,${(glow * pulse).toFixed(2)})`);
            grad.addColorStop(1, 'rgba(105,240,174,0)');
            g.fillStyle = grad;
            g.fillRect(rect.x - 8, rect.y - 8, rect.w + 16, rect.h + 16);
          }

          // Cell body
          if (on) {
            const pulse = 0.85 + 0.15 * Math.sin(pulseT * 3 + r + c);
            g.fillStyle = `rgba(105,240,174,${pulse.toFixed(2)})`;
          } else {
            g.fillStyle = 'rgba(255,255,255,0.04)';
          }
          g.beginPath();
          g.roundRect(rect.x, rect.y, rect.w, rect.h, 6);
          g.fill();

          // Border
          g.strokeStyle = on ? 'rgba(105,240,174,0.6)' : 'rgba(255,255,255,0.08)';
          g.lineWidth = on ? 1.5 : 1;
          g.beginPath();
          g.roundRect(rect.x, rect.y, rect.w, rect.h, 6);
          g.stroke();

          // Shine on ON
          if (on) {
            g.fillStyle = 'rgba(255,255,255,0.25)';
            g.fillRect(rect.x + 4, rect.y + 4, rect.w * 0.4, 3);
          }
        }
      }

      // Solve pulse flash
      if (solveAnim > 0) {
        g.fillStyle = `rgba(105,240,174,${(solveAnim * 0.18).toFixed(3)})`;
        g.fillRect(0, 0, W, H);
      }

      // HUD
      g.fillStyle = 'rgba(15,15,20,0.92)';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = ACCENT;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      g.fillStyle = ACCENT;
      g.font = 'bold 16px monospace';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('ONOFF', 16, 24);

      g.textAlign = 'right';
      g.fillStyle = solved ? '#00FF88' : '#888';
      g.fillText(`LV ${level+1}  TAPS ${taps}`, W - 50, 24);

      // Level dots
      for (let i = 0; i < LEVELS.length; i++) {
        const x = W / 2 - (LEVELS.length - 1) * 10 + i * 20;
        g.fillStyle = i < level ? '#00FF88' : i === level ? ACCENT : 'rgba(255,255,255,0.2)';
        g.beginPath(); g.arc(x, 24, 5, 0, Math.PI * 2); g.fill();
      }

      // Level name subtitle
      g.fillStyle = 'rgba(105,240,174,0.5)';
      g.font = '11px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(LEVELS[level].name, W / 2, GRID_Y + CELL * GRID + 8);

      // Stats below grid
      if (!solved) {
        const best = bestScores[level];
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.font = '12px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'top';
        const remaining = grid.reduce((s,row) => s + row.reduce((a,b) => a+b,0), 0);
        g.fillText(`ON: ${remaining}  ${best ? 'BEST: '+best : 'MIN: '+LEVELS[level].minTaps}`, W / 2, GRID_Y + CELL * GRID + 28);
      }

      // Solved overlay
      if (solved && !won) {
        g.fillStyle = 'rgba(0,0,0,0.65)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = ACCENT;
        g.font = 'bold 30px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('ALL DARK!', W/2, H/2 - 28);
        g.fillStyle = '#fff';
        g.font = '16px monospace';
        const best = bestScores[level];
        g.fillText(`Taps: ${taps}   Best: ${best}`, W/2, H/2 + 8);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.font = '13px monospace';
        g.fillText(level < LEVELS.length - 1 ? 'TAP FOR NEXT LEVEL' : 'TAP TO FINISH', W/2, H/2 + 40);
      }

      if (won) {
        g.fillStyle = 'rgba(0,0,0,0.8)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 30px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('LIGHTS OUT!', W/2, H/2 - 28);
        g.fillStyle = '#fff';
        g.font = '16px monospace';
        g.fillText('All 5 levels cleared!', W/2, H/2 + 10);
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.font = '13px monospace';
        g.fillText('TAP TO PLAY AGAIN', W/2, H/2 + 44);
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.9)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 20px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('HOW TO PLAY', W/2, H/2 - 110);
        g.fillStyle = '#ccc';
        g.font = '14px monospace';
        const lines = [
          'Tap a cell to toggle it + neighbors.',
          'Goal: turn ALL lights OFF.',
          'Each level has a different',
          'toggle pattern (ortho, diag, etc).',
          'Fewer taps = better score.',
        ];
        lines.forEach((l, i) => g.fillText(l, W/2, H/2 - 55 + i * 28));
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = '13px monospace';
        g.fillText('TAP ANYWHERE TO CLOSE', W/2, H/2 + 110);
      }

      // IBTN — drawn LAST
      g.fillStyle = 'rgba(105,240,174,0.12)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ACCENT;
      g.font = 'bold 14px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y);
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
