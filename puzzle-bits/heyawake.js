window.plethoraBit = {
  meta: {
    title: 'Heyawake',
    author: 'plethora',
    description: 'Shade rooms — no two adjacent, no long white runs.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FFD93D';
    const BG = '#0f0f14';
    const N = 6;

    // Room alternating bg tints
    const ROOM_TINTS = ['#1a1a28', '#1e1e2e', '#1c1c2a', '#201f2d', '#1a1d2a', '#1e1c28', '#1d2030', '#1b1f2b'];

    function generatePuzzle(size) {
      size = size || N;
      // Step 1: Create a 4- or 5-room partition
      const rooms = [];
      const rSplit = 2 + Math.floor(Math.random() * (size - 3));
      const cSplit = 2 + Math.floor(Math.random() * (size - 3));
      rooms.push({ r1: 0, c1: 0, r2: rSplit - 1, c2: cSplit - 1 });
      rooms.push({ r1: 0, c1: cSplit, r2: rSplit - 1, c2: size - 1 });
      rooms.push({ r1: rSplit, c1: 0, r2: size - 1, c2: cSplit - 1 });
      rooms.push({ r1: rSplit, c1: cSplit, r2: size - 1, c2: size - 1 });
      // Optionally add a 5th room by splitting one
      if (Math.random() < 0.5) {
        const idx = Math.floor(Math.random() * 4);
        const rm = rooms[idx];
        if (rm.r2 - rm.r1 >= 2) {
          const mid = rm.r1 + 1 + Math.floor(Math.random() * (rm.r2 - rm.r1 - 1));
          rooms.push({ r1: mid, c1: rm.c1, r2: rm.r2, c2: rm.c2 });
          rooms[idx] = { r1: rm.r1, c1: rm.c1, r2: mid - 1, c2: rm.c2 };
        }
      }

      // Step 2: Generate a valid shading (no two adjacent shaded)
      const sol = Array.from({ length: size }, () => Array(size).fill(0));
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (Math.random() < 0.28) {
            const adj = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
            if (!adj.some(([ar, ac]) => ar >= 0 && ar < size && ac >= 0 && ac < size && sol[ar][ac])) {
              sol[r][c] = 1;
            }
          }
        }
      }

      // Step 3: Compute room shading counts for clues
      const roomsWithCounts = rooms.map(rm => {
        let count = 0;
        for (let r = rm.r1; r <= rm.r2; r++)
          for (let c = rm.c1; c <= rm.c2; c++)
            if (sol[r][c]) count++;
        return { ...rm, num: count };
      });

      return { solution: sol, rooms: roomsWithCounts };
    }

    let showInfo = false;
    let showSolution = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let currentPuzzle = generatePuzzle();
    let cells; // 0=white, 1=shaded, 2=dotted(confirmed white)
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let rippleAnim = null;
    let cellAnims = {};
    let longPressTimer = null;
    let touchStartCell = null;
    let audioCtx = null;

    function initPuzzle() {
      cells = Array.from({ length: N }, () => Array(N).fill(0));
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      rippleAnim = null;
      cellAnims = {};
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 56;
      const pad = 20;
      const avail = Math.min(W - pad * 2, USABLE_H - HUD_H - pad * 2);
      const CELL = Math.floor(avail / N);
      const gridW = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + Math.floor((USABLE_H - HUD_H - gridW) / 2);
      return { CELL, ox, oy };
    }

    function cellAt(x, y) {
      const { CELL, ox, oy } = getLayout();
      const c = Math.floor((x - ox) / CELL);
      const r = Math.floor((y - oy) / CELL);
      if (r < 0 || r >= N || c < 0 || c >= N) return null;
      return { r, c };
    }

    function animCell(r, c) {
      cellAnims[`${r},${c}`] = { start: performance.now() };
    }

    function easeOutBack(t) {
      const s = 1.70158;
      return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
    }

    function getCellScale(r, c, now) {
      const key = `${r},${c}`;
      const a = cellAnims[key];
      if (!a) return 1;
      const t = Math.min((now - a.start) / 120, 1);
      if (t >= 1) { delete cellAnims[key]; return 1; }
      return 0.6 + 0.4 * easeOutBack(t);
    }

    // Conflict detection
    function getConflicts() {
      const p = currentPuzzle;
      const bad = new Set();

      // Adjacency: two shaded touching
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (cells[r][c] !== 1) continue;
        if (r > 0 && cells[r-1][c] === 1) { bad.add(`${r},${c}`); bad.add(`${r-1},${c}`); }
        if (c > 0 && cells[r][c-1] === 1) { bad.add(`${r},${c}`); bad.add(`${r},${c-1}`); }
      }

      // Room count exceeded
      p.rooms.forEach((rm) => {
        if (rm.num === null) return;
        let count = 0;
        for (let r = rm.r1; r <= rm.r2; r++)
          for (let c = rm.c1; c <= rm.c2; c++)
            if (cells[r][c] === 1) count++;
        if (count > rm.num) {
          for (let r = rm.r1; r <= rm.r2; r++)
            for (let c = rm.c1; c <= rm.c2; c++)
              if (cells[r][c] === 1) bad.add(`${r},${c}`);
        }
      });

      return bad;
    }

    function checkSolved() {
      const p = currentPuzzle;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const have = cells[r][c] === 1 ? 1 : 0;
        if (have !== p.solution[r][c]) return false;
      }
      if (getConflicts().size > 0) return false;
      return true;
    }

    function triggerSolve(now) {
      solved = true;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_heyawake') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_heyawake', solveTime);
      ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
      const cellList = [];
      for (let d = 0; d < N * 2; d++)
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
          if (Math.abs(r - 2) + Math.abs(c - 2) === d)
            cellList.push({ r, c, delay: d * 55 });
      rippleAnim = { cells: cellList, startTime: now };
      playChord();
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 720;
      o.type = 'triangle';
      gn.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);
      o.start(); o.stop(audioCtx.currentTime + 0.09);
    }

    function playBuzz() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 120;
      o.type = 'sawtooth';
      gn.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
      o.start(); o.stop(audioCtx.currentTime + 0.18);
    }

    function playChord() {
      if (!audioCtx) return;
      [440, 554.37, 659.25, 880].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        gn.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.05);
        gn.gain.linearRampToValueAtTime(0.17, audioCtx.currentTime + i * 0.05 + 0.05);
        gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.05 + 0.7);
        o.start(audioCtx.currentTime + i * 0.05);
        o.stop(audioCtx.currentTime + i * 0.05 + 0.7);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function drawRoundRect(g2, x, y, w, h, r2) {
      if (g2.roundRect) { g2.roundRect(x, y, w, h, r2); return; }
      g2.beginPath();
      g2.moveTo(x + r2, y); g2.lineTo(x + w - r2, y); g2.arcTo(x + w, y, x + w, y + r2, r2);
      g2.lineTo(x + w, y + h - r2); g2.arcTo(x + w, y + h, x + w - r2, y + h, r2);
      g2.lineTo(x + r2, y + h); g2.arcTo(x, y + h, x, y + h - r2, r2);
      g2.lineTo(x, y + r2); g2.arcTo(x, y, x + r2, y, r2);
      g2.closePath();
    }

    initPuzzle();

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const p = currentPuzzle;
      const { CELL, ox, oy } = getLayout();
      const conflicts = getConflicts();

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = '#ffffff11';
      g.fillRect(0, 0, W, 48);
      g.font = `bold 15px -apple-system, sans-serif`;
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('HEYAWAKE', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Room backgrounds
      p.rooms.forEach((rm, idx) => {
        const rx = ox + rm.c1 * CELL;
        const ry = oy + rm.r1 * CELL;
        const rw = (rm.c2 - rm.c1 + 1) * CELL;
        const rh = (rm.r2 - rm.r1 + 1) * CELL;
        g.fillStyle = ROOM_TINTS[idx % ROOM_TINTS.length];
        g.fillRect(rx, ry, rw, rh);
      });

      // Cells
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const x = ox + c * CELL;
          const y = oy + r * CELL;
          const val = cells[r][c];
          const isConflict = conflicts.has(`${r},${c}`);
          const scale = getCellScale(r, c, now);
          const pad2 = CELL * (1 - scale) / 2;
          const sz = CELL - 2;

          let rippleAlpha = 0;
          if (rippleAnim) {
            const entry = rippleAnim.cells.find(e => e.r === r && e.c === c);
            if (entry) {
              const t = (now - rippleAnim.startTime - entry.delay) / 320;
              if (t > 0 && t < 1) rippleAlpha = Math.sin(t * Math.PI);
            }
          }

          g.save();
          g.translate(x + pad2, y + pad2);

          if (val === 1) {
            g.beginPath();
            drawRoundRect(g, 0, 0, sz * scale, sz * scale, 3);
            if (isConflict) {
              const flash = 0.5 + 0.5 * Math.sin(now * 0.009);
              g.fillStyle = `rgba(255,80,80,${0.7 + flash * 0.3})`;
            } else {
              g.fillStyle = rippleAlpha > 0 ? `rgba(255,230,100,${0.7 + rippleAlpha * 0.3})` : ACCENT;
            }
            g.fill();
            g.shadowColor = ACCENT;
            g.shadowBlur = 14 * scale;
            g.fill();
            g.shadowBlur = 0;
          } else if (val === 2) {
            // dot marker
            g.beginPath();
            drawRoundRect(g, 0, 0, sz * scale, sz * scale, 3);
            g.fillStyle = 'transparent';
            g.fill();
            g.fillStyle = ACCENT + '99';
            g.beginPath();
            g.arc(sz * scale / 2, sz * scale / 2, sz * scale * 0.1, 0, Math.PI * 2);
            g.fill();
          }

          g.restore();
        }
      }

      // Thin grid lines
      g.strokeStyle = '#ffffff0f';
      g.lineWidth = 0.5;
      for (let i = 1; i < N; i++) {
        g.beginPath(); g.moveTo(ox + i * CELL, oy); g.lineTo(ox + i * CELL, oy + N * CELL); g.stroke();
        g.beginPath(); g.moveTo(ox, oy + i * CELL); g.lineTo(ox + N * CELL, oy + i * CELL); g.stroke();
      }

      // Room borders (thick accent-colored)
      g.strokeStyle = ACCENT;
      g.lineWidth = 2.5;
      p.rooms.forEach((rm) => {
        const rx = ox + rm.c1 * CELL;
        const ry = oy + rm.r1 * CELL;
        const rw = (rm.c2 - rm.c1 + 1) * CELL;
        const rh = (rm.r2 - rm.r1 + 1) * CELL;
        g.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

        // Room number in top-left corner
        if (rm.num !== null) {
          g.font = `bold ${Math.floor(CELL * 0.36)}px -apple-system, sans-serif`;
          g.fillStyle = ACCENT;
          g.textAlign = 'left';
          g.textBaseline = 'top';
          g.fillText(String(rm.num), rx + 5, ry + 4);
        }
      });

      // Outer border
      g.strokeStyle = ACCENT + '66';
      g.lineWidth = 2;
      g.strokeRect(ox, oy, N * CELL, N * CELL);

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

      // Eye / solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
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
        g.fillText('HEYAWAKE', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty = cy2 + 80;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Grid is divided into rooms',
          '• Rooms with numbers must have exactly that many shaded cells',
          '• No two shaded cells can be side-by-side anywhere',
          '• No straight line of white cells can cross more than 2 rooms',
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
      if (solved && rippleAnim) {
        const elapsed2 = now - rippleAnim.startTime;
        if (elapsed2 > 900) {
          g.fillStyle = 'rgba(15,15,20,0.88)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `bold 36px -apple-system, sans-serif`;
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT;
          g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = `18px -apple-system, sans-serif`;
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 16);
          const best = ctx.storage.get('bt_heyawake') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 16);
          g.fillStyle = ACCENT + '22';
          drawRoundRect(g, W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          g.fill();
          g.strokeStyle = ACCENT;
          g.lineWidth = 1.5;
          g.beginPath();
          drawRoundRect(g, W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          g.stroke();
          g.font = `bold 16px -apple-system, sans-serif`;
          g.fillStyle = ACCENT;
          g.fillText('TAP TO PLAY AGAIN', W / 2, USABLE_H / 2 + 74);
        }
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

      // Eye / solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        const sol = currentPuzzle.solution;
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++)
            cells[r][c] = sol[r][c];
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        currentPuzzle = generatePuzzle();
        initPuzzle();
        return;
      }

      if (solved && rippleAnim && performance.now() - rippleAnim.startTime > 900) {
        currentPuzzle = generatePuzzle();
        initPuzzle();
        return;
      }

      const touch = e.changedTouches[0];
      const cell = cellAt(touch.clientX, touch.clientY);
      if (!cell) return;
      touchStartCell = cell;

      longPressTimer = ctx.timeout(() => {
        if (touchStartCell) {
          const { r, c } = touchStartCell;
          cells[r][c] = cells[r][c] === 2 ? 0 : 2; // dot toggle
          animCell(r, c);
          ctx.platform.haptic('medium');
          touchStartCell = null;
        }
      }, 300);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!touchStartCell) return;
      const { r, c } = touchStartCell;
      touchStartCell = null;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      const v = cells[r][c];
      if (v === 0) cells[r][c] = 1;
      else if (v === 1) cells[r][c] = 0;
      else if (v === 2) cells[r][c] = 1;

      animCell(r, c);

      const newConflicts = getConflicts();
      if (newConflicts.has(`${r},${c}`)) {
        playBuzz();
        ctx.platform.haptic('light');
      } else {
        playTap();
      }
      ctx.platform.interact({ type: 'tap' });

      if (checkSolved()) triggerSolve(performance.now());
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
