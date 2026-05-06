window.plethoraBit = {
  meta: {
    title: 'Tapa',
    author: 'plethora',
    description: 'Shade cells around the clues to build a connected wall.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const ACCENT = '#FF9F43';
    const ACCENT_DIM = '#cc7a2a';
    const BG = '#0f0f14';
    const CELL_BG = '#1c1c28';
    const SHADED = '#2d1f0a';
    const SHADED_BORDER = '#FF9F43';

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const GRID = 7;

    function generatePuzzle(size) {
      size = size || GRID;

      // Generate random connected shading (~35% of cells), no 2x2
      const sol = Array.from({length: size}, () => Array(size).fill(0));
      const totalTarget = Math.floor(size * size * 0.35);
      const startR = Math.floor(size / 2), startC = Math.floor(size / 2);

      const queue = [[startR, startC]];
      sol[startR][startC] = 1;
      let count = 1;

      while (count < totalTarget && queue.length) {
        const idx = Math.floor(Math.random() * queue.length);
        const [r, c] = queue[idx];
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]].filter(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size || sol[nr][nc]) return false;
          // Check: would adding [nr,nc] create a 2x2 block?
          const corners = [[0,0],[0,-1],[-1,0],[-1,-1]];
          for (const [cr, cc] of corners) {
            const r1 = nr + cr, c1 = nc + cc;
            if (r1 < 0 || r1 + 1 >= size || c1 < 0 || c1 + 1 >= size) continue;
            let cnt = 0;
            if (sol[r1][c1] || (r1 === nr && c1 === nc)) cnt++;
            if (sol[r1][c1+1] || (r1 === nr && c1+1 === nc)) cnt++;
            if (sol[r1+1][c1] || (r1+1 === nr && c1 === nc)) cnt++;
            if (sol[r1+1][c1+1] || (r1+1 === nr && c1+1 === nc)) cnt++;
            if (cnt >= 4) return false;
          }
          return true;
        });
        if (dirs.length) {
          const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
          sol[r + dr][c + dc] = 1;
          queue.push([r + dr, c + dc]);
          count++;
        } else {
          queue.splice(idx, 1);
        }
      }

      // Compute TAPA clues for each white cell
      // clue = consecutive runs of shaded cells in the 8 clockwise neighbors
      function tapaClue(r, c) {
        const dirs8 = [[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1],[0,-1]];
        const ring = dirs8.map(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          return (nr >= 0 && nr < size && nc >= 0 && nc < size) ? sol[nr][nc] : 0;
        });
        const groups = [];
        let run = 0;
        for (let i = 0; i < 8; i++) {
          if (ring[i]) run++;
          else { if (run) { groups.push(run); run = 0; } }
        }
        // Handle wrap-around: if ring starts and ends with shaded, merge
        if (run > 0) {
          if (groups.length > 0 && ring[0] === 1) {
            groups[0] += run; // merge with first group
          } else {
            groups.push(run);
          }
        }
        return groups.sort((a, b) => a - b);
      }

      // Place clue cells: white cells that have at least 1 shaded neighbor
      // We want roughly 4-6 clue cells — pick white cells with non-empty clues
      const candidates = [];
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (!sol[r][c]) {
            const clue = tapaClue(r, c);
            if (clue.length > 0 && clue[0] > 0) candidates.push({ r, c, clue });
          }

      // Shuffle and pick ~5 well-spaced candidates
      candidates.sort(() => Math.random() - 0.5);
      const chosen = [];
      for (const cand of candidates) {
        // Keep candidate if it's not too close to existing chosen clues
        const tooClose = chosen.some(ch => Math.abs(ch.r - cand.r) + Math.abs(ch.c - cand.c) < 2);
        if (!tooClose) {
          chosen.push(cand);
          if (chosen.length >= 5) break;
        }
      }

      // Build clues grid: null = no clue (playable), array = clue numbers
      const clues = Array.from({length: size}, () => Array(size).fill(null));
      for (const { r, c, clue } of chosen) {
        clues[r][c] = clue;
      }

      return { size, clues, solution: sol };
    }

    // Eye/solution button — top right, below info button
    const IBTN = { x: W - 22, y: 8, r: 14 };
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let showInfo = false;
    let showSolution = false;
    let puzzle = generatePuzzle();

    // State
    let cells = []; // 0=unshaded, 1=shaded, 2=dot
    let animT = [];
    let animTarget = [];
    let startTime = 0;
    let timerActive = false;
    let elapsed = 0;
    let solved = false;
    let showOverlay = false;
    let overlayAlpha = 0;
    let ripple = [];
    let firstTouch = false;
    let bestTime = ctx.storage.get('bt_tapa') || 0;
    let longPressTimer = null;
    let longPressCell = null;
    let audioCtx = null;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      o.connect(g2); g2.connect(audioCtx.destination);
      o.frequency.value = 440;
      o.type = 'sine';
      g2.gain.setValueAtTime(0.12, audioCtx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.start(); o.stop(audioCtx.currentTime + 0.08);
    }

    function playError() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      o.connect(g2); g2.connect(audioCtx.destination);
      o.frequency.value = 120;
      o.type = 'square';
      g2.gain.setValueAtTime(0.15, audioCtx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.start(); o.stop(audioCtx.currentTime + 0.08);
    }

    function playSolve() {
      if (!audioCtx) return;
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g2 = audioCtx.createGain();
        o.connect(g2); g2.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        const t = audioCtx.currentTime + i * 0.1;
        g2.gain.setValueAtTime(0.0, t);
        g2.gain.linearRampToValueAtTime(0.18, t + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.start(t); o.stop(t + 0.3);
      });
    }

    function initPuzzle() {
      puzzle = generatePuzzle();
      cells = Array.from({length: GRID}, () => Array(GRID).fill(0));
      animT = Array.from({length: GRID}, () => Array(GRID).fill(0));
      animTarget = Array.from({length: GRID}, () => Array(GRID).fill(0));
      ripple = Array.from({length: GRID}, () => Array(GRID).fill(0));
      solved = false;
      showOverlay = false;
      overlayAlpha = 0;
      timerActive = false;
      elapsed = 0;
      startTime = 0;
      firstTouch = false;
      showSolution = false;
    }

    initPuzzle();

    const TOP_BAR = 64;

    function getLayout() {
      const availH = H - SAFE - TOP_BAR - 16;
      const cs = Math.floor(Math.min(W - 48, availH) / GRID);
      const gridW = cs * GRID;
      const gridH = cs * GRID;
      const offX = Math.floor((W - gridW) / 2);
      const offY = TOP_BAR + Math.floor((availH - gridH) / 2);
      return { cs, offX, offY, gridW, gridH };
    }

    function drawRoundRect(ctx2d, x, y, w, h, r) {
      ctx2d.beginPath();
      if (ctx2d.roundRect) {
        ctx2d.roundRect(x, y, w, h, r);
      } else {
        ctx2d.moveTo(x + r, y);
        ctx2d.lineTo(x + w - r, y);
        ctx2d.arcTo(x + w, y, x + w, y + r, r);
        ctx2d.lineTo(x + w, y + h - r);
        ctx2d.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx2d.lineTo(x + r, y + h);
        ctx2d.arcTo(x, y + h, x, y + h - r, r);
        ctx2d.lineTo(x, y + r);
        ctx2d.arcTo(x, y, x + r, y, r);
        ctx2d.closePath();
      }
    }

    function checkConnected(state) {
      const shadedCells = [];
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++)
          if (state[r][c] === 1) shadedCells.push([r, c]);
      if (shadedCells.length === 0) return { connected: true, groups: [] };

      const visited = Array.from({length: GRID}, () => Array(GRID).fill(false));
      const queue = [shadedCells[0]];
      visited[shadedCells[0][0]][shadedCells[0][1]] = true;
      let count = 1;
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      while (queue.length > 0) {
        const [r, c] = queue.shift();
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !visited[nr][nc] && state[nr][nc] === 1) {
            visited[nr][nc] = true;
            count++;
            queue.push([nr, nc]);
          }
        }
      }
      const groups = [];
      for (const [r, c] of shadedCells) {
        if (!visited[r][c]) {
          const comp = [[r, c]];
          visited[r][c] = true;
          const q2 = [[r, c]];
          while (q2.length > 0) {
            const [rr, cc] = q2.shift();
            for (const [dr, dc] of dirs) {
              const nr = rr + dr, nc = cc + dc;
              if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !visited[nr][nc] && state[nr][nc] === 1) {
                visited[nr][nc] = true;
                comp.push([nr, nc]);
                q2.push([nr, nc]);
              }
            }
          }
          groups.push(comp);
        }
      }
      return { connected: count === shadedCells.length, groups };
    }

    function check2x2(state) {
      const violations = [];
      for (let r = 0; r < GRID - 1; r++)
        for (let c = 0; c < GRID - 1; c++)
          if (state[r][c] === 1 && state[r+1][c] === 1 && state[r][c+1] === 1 && state[r+1][c+1] === 1)
            violations.push([r, c]);
      return violations;
    }

    function isSolved() {
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++) {
          if (puzzle.solution[r][c] === 1 && cells[r][c] !== 1) return false;
          if (puzzle.solution[r][c] === 0 && cells[r][c] === 1) return false;
        }
      return true;
    }

    function triggerSolve() {
      solved = true;
      timerActive = false;
      playSolve();
      const cr = Math.floor(GRID / 2), cc = Math.floor(GRID / 2);
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++) {
          const dist = Math.abs(r - cr) + Math.abs(c - cc);
          ctx.timeout(() => { ripple[r][c] = 1.0; }, dist * 60);
        }
      ctx.timeout(() => { showOverlay = true; }, GRID * 60 + 400);
      if (bestTime === 0 || elapsed < bestTime) {
        bestTime = elapsed;
        ctx.storage.set('bt_tapa', bestTime);
      }
    }

    let violations2x2 = [];
    let disconnectedGroups = [];

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();

      const touchX = e.changedTouches[0].clientX;
      const touchY = e.changedTouches[0].clientY;

      if (Math.hypot(touchX - IBTN.x, touchY - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // Eye button
      if (Math.hypot(touchX - EYE_X, touchY - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        // Apply solution to cells
        for (let r = 0; r < GRID; r++)
          for (let c = 0; c < GRID; c++) {
            if (puzzle.clues[r][c] !== null) continue; // don't override clue cells
            cells[r][c] = puzzle.solution[r][c] === 1 ? 1 : 0;
            animTarget[r][c] = puzzle.solution[r][c] === 1 ? 1 : 0;
          }
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        initPuzzle();
        return;
      }

      if (showOverlay) {
        initPuzzle();
        return;
      }

      const touch = e.changedTouches[0];
      const { cs, offX, offY } = getLayout();
      const tx = touch.clientX - offX;
      const ty = touch.clientY - offY;
      const col = Math.floor(tx / cs);
      const row = Math.floor(ty / cs);

      if (row < 0 || row >= GRID || col < 0 || col >= GRID) return;
      if (puzzle.clues[row][col] !== null) return;

      if (!firstTouch) {
        firstTouch = true;
        timerActive = true;
        startTime = Date.now();
        ctx.platform.start();
      }

      longPressCell = [row, col];
      longPressTimer = ctx.timeout(() => {
        if (longPressCell) {
          const [lr, lc] = longPressCell;
          cells[lr][lc] = cells[lr][lc] === 2 ? 0 : 2;
          animTarget[lr][lc] = cells[lr][lc] === 2 ? 0.5 : 0;
          ctx.platform.haptic('light');
        }
        longPressCell = null;
      }, 400);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!longPressCell) return;
      clearTimeout(longPressTimer);

      const [row, col] = longPressCell;
      longPressCell = null;

      if (solved || showOverlay) return;

      const prev = cells[row][col];
      if (prev === 0) {
        cells[row][col] = 1;
        animTarget[row][col] = 1;
      } else if (prev === 1) {
        cells[row][col] = 0;
        animTarget[row][col] = 0;
      } else {
        cells[row][col] = 0;
        animTarget[row][col] = 0;
      }

      playTap();
      ctx.platform.haptic('light');

      violations2x2 = check2x2(cells);
      const conn = checkConnected(cells);
      disconnectedGroups = conn.groups;

      if (violations2x2.length > 0 || !conn.connected) {
        playError();
      }

      if (isSolved()) triggerSolve();
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    ctx.raf((dt) => {
      if (timerActive) elapsed = Date.now() - startTime;

      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++) {
          animT[r][c] += (animTarget[r][c] - animT[r][c]) * 0.22;
          if (ripple[r][c] > 0) ripple[r][c] -= dt / 600;
        }

      if (showOverlay && overlayAlpha < 1) overlayAlpha = Math.min(1, overlayAlpha + dt / 300);

      const { cs, offX, offY } = getLayout();
      const pad = Math.max(2, Math.floor(cs * 0.06));
      const radius = 5;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // Top bar
      g.fillStyle = ACCENT;
      g.font = `bold ${Math.floor(cs * 0.45)}px -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('TAPA', W / 2, 28);

      g.fillStyle = '#888';
      g.font = `${Math.floor(cs * 0.35)}px -apple-system, sans-serif`;
      g.fillText(formatTime(elapsed), W / 2, 50);

      if (bestTime > 0) {
        g.fillStyle = '#555';
        g.font = `${Math.floor(cs * 0.3)}px -apple-system, sans-serif`;
        g.textAlign = 'right';
        g.fillText(`Best: ${formatTime(bestTime)}`, W - 16, 50);
      }

      // Draw cells
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const x = offX + c * cs + pad;
          const y = offY + r * cs + pad;
          const size = cs - pad * 2;
          const t = animT[r][c];
          const rip = Math.max(0, ripple[r][c]);
          const isClue = puzzle.clues[r][c] !== null;
          const isShaded = cells[r][c] === 1;
          const isDot = cells[r][c] === 2;

          const in2x2 = violations2x2.some(([vr, vc]) =>
            (r === vr || r === vr + 1) && (c === vc || c === vc + 1));
          const inDisconn = disconnectedGroups.some(grp => grp.some(([gr, gc]) => gr === r && gc === c));

          let scale = 1;
          if (isShaded) {
            const overshoot = 1 + 0.15 * Math.sin(t * Math.PI);
            scale = 0.7 + 0.3 * t * overshoot;
          }

          g.save();
          g.translate(x + size / 2, y + size / 2);
          g.scale(scale, scale);

          if (isClue) {
            g.fillStyle = '#1a1520';
            drawRoundRect(g, -size/2, -size/2, size, size, radius);
            g.fill();
            g.strokeStyle = ACCENT_DIM;
            g.lineWidth = 1.5;
            drawRoundRect(g, -size/2, -size/2, size, size, radius);
            g.stroke();

            const nums = puzzle.clues[r][c];
            g.fillStyle = ACCENT;
            if (nums.length === 1) {
              g.font = `bold ${Math.floor(size * 0.5)}px -apple-system, sans-serif`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText(String(nums[0]), 0, 0);
            } else if (nums.length === 2) {
              g.font = `bold ${Math.floor(size * 0.32)}px -apple-system, sans-serif`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText(String(nums[0]), 0, -size * 0.18);
              g.fillText(String(nums[1]), 0, size * 0.18);
            } else {
              g.font = `bold ${Math.floor(size * 0.26)}px -apple-system, sans-serif`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              const cols2 = nums.length <= 2 ? 1 : 2;
              nums.forEach((n, i) => {
                const col2 = i % cols2 - (cols2 - 1) / 2;
                const row2 = Math.floor(i / cols2) - Math.floor((Math.ceil(nums.length / cols2) - 1) / 2);
                g.fillText(String(n), col2 * size * 0.28, row2 * size * 0.28);
              });
            }
          } else if (isShaded) {
            const fillColor = in2x2 ? '#4a1010' : inDisconn ? '#3a1010' : SHADED;
            g.fillStyle = fillColor;
            drawRoundRect(g, -size/2, -size/2, size, size, radius);
            g.fill();

            const glowColor = in2x2 ? '#ff4444' : inDisconn ? '#ff6666' : SHADED_BORDER;
            g.strokeStyle = glowColor;
            g.lineWidth = in2x2 || inDisconn ? 2.5 : 1.5;
            g.globalAlpha = in2x2 || inDisconn ? 0.9 : 0.5 + t * 0.5;
            drawRoundRect(g, -size/2, -size/2, size, size, radius);
            g.stroke();
            g.globalAlpha = 1;

            if (rip > 0) {
              g.globalAlpha = rip * 0.6;
              g.fillStyle = ACCENT;
              drawRoundRect(g, -size/2, -size/2, size, size, radius);
              g.fill();
              g.globalAlpha = 1;
            }
          } else if (isDot) {
            g.fillStyle = CELL_BG;
            drawRoundRect(g, -size/2, -size/2, size, size, radius);
            g.fill();
            g.strokeStyle = '#444';
            g.lineWidth = 1;
            drawRoundRect(g, -size/2, -size/2, size, size, radius);
            g.stroke();
            g.fillStyle = '#666';
            g.beginPath();
            g.arc(0, 0, size * 0.1, 0, Math.PI * 2);
            g.fill();
          } else {
            g.fillStyle = CELL_BG;
            drawRoundRect(g, -size/2, -size/2, size, size, radius);
            g.fill();
            g.strokeStyle = '#2a2a3a';
            g.lineWidth = 1;
            drawRoundRect(g, -size/2, -size/2, size, size, radius);
            g.stroke();
          }

          g.restore();
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
        g.fillText('TAPA', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty = cy2 + 80;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Numbers in clue cells describe shaded groups in their 8 neighbours',
          '• e.g. "2 3" means one group of 2 and one group of 3 around that cell',
          '• All shaded cells must form one connected group',
          '• No 2×2 block of shaded cells allowed',
          '• Clue cells are never shaded',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;

        const controls = [
          'Tap → toggle shade',
          'Long-press → dot (mark as unshaded)',
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
      if (showOverlay) {
        g.globalAlpha = overlayAlpha * 0.85;
        g.fillStyle = '#0f0f14';
        g.fillRect(0, 0, W, H);
        g.globalAlpha = overlayAlpha;

        const big = Math.floor(W * 0.12);
        g.font = `bold ${big}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = ACCENT;
        g.fillText('SOLVED!', W / 2, H / 2 - big * 1.2);

        g.font = `${Math.floor(big * 0.5)}px -apple-system, sans-serif`;
        g.fillStyle = '#ccc';
        g.fillText(formatTime(elapsed), W / 2, H / 2);

        if (bestTime === elapsed) {
          g.fillStyle = ACCENT;
          g.fillText('New Best!', W / 2, H / 2 + big * 0.7);
        } else if (bestTime > 0) {
          g.fillStyle = '#666';
          g.fillText(`Best: ${formatTime(bestTime)}`, W / 2, H / 2 + big * 0.7);
        }

        g.fillStyle = '#555';
        g.font = `${Math.floor(big * 0.4)}px -apple-system, sans-serif`;
        g.fillText('Tap for new puzzle', W / 2, H / 2 + big * 1.5);

        g.globalAlpha = 1;
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
