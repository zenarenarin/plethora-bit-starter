window.plethoraBit = {
  meta: {
    title: 'Color Picross',
    author: 'plethora',
    description: 'Solve color nonograms to reveal pixel art.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#F06292';
    const BG = '#0f0f14';
    const CELL_EMPTY = '#1a1a26';

    const N = 8;

    // Procedural puzzle generator
    function generatePuzzle(gridN) {
      gridN = gridN || N;
      const COLORS = ['#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#FF922B'];
      const sol = Array.from({length:gridN},()=>Array.from({length:gridN},()=>
        Math.random()<0.55 ? COLORS[Math.floor(Math.random()*COLORS.length)] : null
      ));

      function colorClues(line){
        const runs=[]; let prev=null, count=0;
        for(const v of line){
          if(v&&v===prev) count++;
          else{if(count) runs.push({color:prev,count});prev=v;count=v?1:0;}
        }
        if(count) runs.push({color:prev,count});
        return runs;
      }

      const rowClues = sol.map(row=>colorClues(row));
      const colClues = Array.from({length:gridN},(_,c)=>colorClues(sol.map(r=>r[c])));

      // Build palette: unique colors used
      const colorSet = new Set();
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++) if(sol[r][c]) colorSet.add(sol[r][c]);
      const palette = Array.from(colorSet);
      if(palette.length===0) palette.push(COLORS[0]);

      // Convert solution to index grid (1-based, 0=empty) for checkSolved compatibility
      const colorToIdx = {};
      palette.forEach((c,i)=>colorToIdx[c]=i+1);
      const grid = sol.map(row=>row.map(v=>v?colorToIdx[v]:0));

      return { grid, palette, rowClues, colClues };
    }

    let currentPuzzle = generatePuzzle(N);
    let showSolution = false;
    const EYE_X = W - 44, EYE_CY = 62, EYE_R = 20;

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    let state = null;
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let rippleAnim = null;
    let cellAnims = {};
    let activeColor = 1; // 1-indexed into palette
    let dragCell = null;
    let audioCtx = null;
    let voices = [];

    // palette swatch layout
    const SWATCH_Y_BOTTOM = USABLE_H - 12; // bottom of swatches
    const SWATCH_SIZE = 36;
    const SWATCH_GAP = 12;

    function applySolution() {
      const p = currentPuzzle;
      for(let r=0;r<N;r++) for(let c=0;c<N;c++) state.cells[r][c]=p.grid[r][c];
    }

    function initPuzzle() {
      currentPuzzle = generatePuzzle(N);
      const p = currentPuzzle;
      state = {
        puzzle: p,
        rowClues: p.rowClues,
        colClues: p.colClues,
        cells: Array.from({ length: N }, () => Array(N).fill(0)),
      };
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      rippleAnim = null;
      cellAnims = {};
      activeColor = 1;
      showSolution = false;
    }

    function getPaletteColor(idx) {
      if (idx === 0) return CELL_EMPTY;
      const p = state.puzzle.palette;
      return p[idx - 1] || CELL_EMPTY;
    }

    function getSwatchRects() {
      const p = state.puzzle.palette;
      const totalW = p.length * SWATCH_SIZE + (p.length - 1) * SWATCH_GAP;
      const startX = (W - totalW) / 2;
      return p.map((color, i) => ({
        x: startX + i * (SWATCH_SIZE + SWATCH_GAP),
        y: SWATCH_Y_BOTTOM - SWATCH_SIZE,
        w: SWATCH_SIZE,
        h: SWATCH_SIZE,
        colorIdx: i + 1,
        color,
      }));
    }

    function getLayout() {
      const HUD_H = 56;
      const PALETTE_H = SWATCH_SIZE + SWATCH_GAP * 2;
      const maxRowClueLen = Math.max(...state.rowClues.map(c => c.length));
      const maxColClueLen = Math.max(...state.colClues.map(c => c.length));
      const availW = W - 20;
      const availH = USABLE_H - HUD_H - PALETTE_H - 8;
      const totalCols = N + maxRowClueLen;
      const totalRows = N + maxColClueLen;
      const cellByW = Math.floor(availW / totalCols);
      const cellByH = Math.floor(availH / totalRows);
      const CELL = Math.min(cellByW, cellByH, 34);
      const clueW = CELL * maxRowClueLen;
      const clueH = CELL * maxColClueLen;
      const gridW = CELL * N;
      const gridH = CELL * N;
      const totalW = clueW + gridW;
      const totalH = clueH + gridH;
      const ox = Math.floor((W - totalW) / 2);
      const oy = HUD_H + Math.floor((availH - totalH) / 2) + 4;
      return { CELL, clueW, clueH, gridW, gridH, ox, oy, maxRowClueLen, maxColClueLen };
    }

    function cellAt(x, y, layout) {
      const { CELL, clueW, clueH, ox, oy } = layout;
      const gx = x - (ox + clueW);
      const gy = y - (oy + clueH);
      if (gx < 0 || gy < 0) return null;
      const c = Math.floor(gx / CELL);
      const r = Math.floor(gy / CELL);
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

    function checkSolved() {
      const p = currentPuzzle;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (state.cells[r][c] !== p.grid[r][c]) return false;
      return true;
    }

    function triggerSolve(now) {
      solved = true;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_color_picross') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_color_picross', solveTime);
      ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
      const cells = [];
      for (let d = 0; d < N * 2; d++)
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
          if (Math.abs(r - 3) + Math.abs(c - 3) === d) cells.push({ r, c, delay: d * 45 });
      rippleAnim = { cells, startTime: now };
      playChord();
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq) {
      if (!audioCtx) return;
      // cap voices
      voices = voices.filter(v => !v.done);
      if (voices.length >= 8) { voices[0].gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.01); voices.shift(); }
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = freq;
      o.type = 'sine';
      gn.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
      const v = { gain: gn, done: false };
      setTimeout(() => { v.done = true; }, 120);
      voices.push(v);
    }

    function playChord() {
      if (!audioCtx) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        gn.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.06);
        gn.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + i * 0.06 + 0.05);
        gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.06 + 0.7);
        o.start(audioCtx.currentTime + i * 0.06);
        o.stop(audioCtx.currentTime + i * 0.06 + 0.7);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
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

    function checkLineClues(cells, clues) {
      // returns array of booleans per clue block — uses color index matching
      // cells are numeric indices; clues use color strings from palette
      // We need to match by palette index
      const palette = state.puzzle.palette;
      // Convert cells (indices) to color strings
      const cellColors = cells.map(v => v > 0 ? palette[v-1] : null);

      const runs = [];
      let run = 0, col = null;
      for (let i = 0; i <= cellColors.length; i++) {
        const v = i < cellColors.length ? cellColors[i] : null;
        if (v && v === col) { run++; }
        else {
          if (run > 0) runs.push({ n: run, color: col });
          run = v ? 1 : 0; col = v;
        }
      }
      const satisfied = [];
      for (let i = 0; i < clues.length; i++) {
        const cl = clues[i];
        if (cl.count === 0) { satisfied.push(true); continue; }
        satisfied.push(runs[i] && runs[i].n === cl.count && runs[i].color === cl.color);
      }
      return satisfied;
    }

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const layout = getLayout();
      const { CELL, clueW, clueH, ox, oy } = layout;

      // HUD bar
      g.fillStyle = '#ffffff11';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('COLOR PICROSS', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Col clues
      const clueFont = `bold ${Math.max(9, CELL * 0.44)}px -apple-system, sans-serif`;
      g.font = clueFont;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let c = 0; c < N; c++) {
        const clue = state.colClues[c];
        const cx2 = ox + clueW + c * CELL + CELL / 2;
        const sat = checkLineClues(state.cells.map(row => row[c]), clue);
        const startY = oy + clueH - clue.length * CELL;
        clue.forEach(({ color, count }, i) => {
          const col = color || '#555577';
          g.fillStyle = sat[i] ? col + '55' : col;
          g.fillText(count === 0 ? '' : String(count), cx2, startY + i * CELL + CELL / 2);
        });
      }

      // Row clues
      for (let r = 0; r < N; r++) {
        const clue = state.rowClues[r];
        const ry = oy + clueH + r * CELL + CELL / 2;
        const startX = ox + clueW - clue.length * CELL;
        const sat = checkLineClues(state.cells[r], clue);
        clue.forEach(({ color, count }, i) => {
          const col = color || '#555577';
          g.fillStyle = sat[i] ? col + '55' : col;
          g.textAlign = 'center';
          g.fillText(count === 0 ? '' : String(count), startX + i * CELL + CELL / 2, ry);
        });
      }

      // Grid
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx2 = ox + clueW + c * CELL;
          const cy2 = oy + clueH + r * CELL;
          const val = state.cells[r][c];
          const scale = getCellScale(r, c, now);
          const pad = CELL * (1 - scale) / 2;
          const sz = CELL - 2;

          let rippleAlpha = 0;
          if (rippleAnim) {
            const entry = rippleAnim.cells.find(e => e.r === r && e.c === c);
            if (entry) {
              const t = (now - rippleAnim.startTime - entry.delay) / 300;
              if (t > 0 && t < 1) rippleAlpha = Math.sin(t * Math.PI);
            }
          }

          g.save();
          g.translate(cx2 + pad, cy2 + 1 + pad);
          g.beginPath();
          drawRoundRect(g, 0, 0, sz * scale, sz * scale, 4);
          if (val !== 0) {
            g.fillStyle = getPaletteColor(val);
            g.fill();
            if (rippleAlpha > 0) {
              g.fillStyle = `rgba(255,255,255,${rippleAlpha * 0.4})`;
              g.fill();
            }
            g.shadowColor = getPaletteColor(val);
            g.shadowBlur = 6 * scale;
            g.fill();
            g.shadowBlur = 0;
          } else {
            g.fillStyle = CELL_EMPTY;
            g.fill();
          }
          g.restore();
        }
        if (r % 4 === 0 && r > 0) {
          g.strokeStyle = '#ffffff22';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(ox + clueW, oy + clueH + r * CELL);
          g.lineTo(ox + clueW + N * CELL, oy + clueH + r * CELL);
          g.stroke();
        }
      }
      for (let c = 1; c < N; c++) {
        if (c % 4 === 0) {
          g.strokeStyle = '#ffffff22';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(ox + clueW + c * CELL, oy + clueH);
          g.lineTo(ox + clueW + c * CELL, oy + clueH + N * CELL);
          g.stroke();
        }
      }

      // Grid border
      g.strokeStyle = '#ffffff33';
      g.lineWidth = 1;
      g.strokeRect(ox + clueW, oy + clueH, N * CELL, N * CELL);

      // Palette swatches
      const swatches = getSwatchRects();
      swatches.forEach(sw => {
        const isActive = sw.colorIdx === activeColor;
        g.save();
        if (isActive) {
          g.shadowColor = sw.color;
          g.shadowBlur = 12;
        }
        g.beginPath();
        drawRoundRect(g, sw.x, sw.y, sw.w, sw.h, 8);
        g.fillStyle = sw.color;
        g.fill();
        if (isActive) {
          g.strokeStyle = '#fff';
          g.lineWidth = 2.5;
          g.stroke();
          // checkmark
          g.strokeStyle = '#000';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(sw.x + sw.w * 0.25, sw.y + sw.h * 0.5);
          g.lineTo(sw.x + sw.w * 0.45, sw.y + sw.h * 0.7);
          g.lineTo(sw.x + sw.w * 0.75, sw.y + sw.h * 0.3);
          g.stroke();
        }
        g.shadowBlur = 0;
        g.restore();
      });

      // Eye/solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      // i button — drawn LAST
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // Info panel
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);

        const cw = Math.floor(W * 0.85);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.78), 500);
        const cy2 = Math.floor((USABLE_H - ch) / 2);

        g.fillStyle = '#1a1a2e';
        g.beginPath(); drawRoundRect(g, cx2, cy2, cw, ch, 16); g.fill();

        g.save(); g.globalAlpha = 0.12; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 48, 60, 0, Math.PI * 2); g.fill();
        g.restore();

        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('COLOR PICROSS', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty = cy2 + 78;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Each clue block shows a color and run length',
          '• Fill cells with matching color to satisfy clues',
          '• Different colors in same row/col are allowed',
          '• Color runs of same color must be separated by gaps',
          '• Tap palette to pick active color',
          '• Reveal the colorful pixel-art picture!',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 6;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillText('Tap palette swatch → pick color', lx, ty); ty += lh;
        g.fillText('Tap/drag cells → paint active color', lx, ty); ty += lh;
        g.fillText('Tap filled cell with same color → erase', lx, ty); ty += lh;

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);

        // draw IBTN on top of info panel too
        g.save();
        g.fillStyle = ACCENT;
        g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#000';
        g.font = 'bold 14px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
        g.restore();
      }

      // Solved overlay
      if (solved && rippleAnim) {
        const elapsed2 = now - rippleAnim.startTime;
        if (elapsed2 > 800) {
          g.fillStyle = 'rgba(15,15,20,0.85)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 36px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 24;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 16);
          const best = ctx.storage.get('bt_color_picross') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 16);
          g.fillStyle = ACCENT + '22';
          g.beginPath(); drawRoundRect(g, W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12); g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath(); drawRoundRect(g, W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12); g.stroke();
          g.font = 'bold 16px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.fillText('NEW PUZZLE', W / 2, USABLE_H / 2 + 74);
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

    function paintCell(r, c) {
      if (solved) return;
      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }
      // toggle: same color = erase, diff color = paint
      state.cells[r][c] = state.cells[r][c] === activeColor ? 0 : activeColor;
      animCell(r, c);
      // note pitch varies by color
      const freqs = [440, 554, 659, 880, 990];
      playNote(freqs[(activeColor - 1) % 5]);
      ctx.platform.interact({ type: 'tap' });
      if (checkSolved()) triggerSolve(performance.now());
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      // Eye/solution button check
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R) {
        showSolution = true;
        applySolution();
        return;
      }

      // IBTN check first
      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (showSolution) {
        initPuzzle();
        return;
      }

      // solved → new puzzle
      if (solved && rippleAnim && performance.now() - rippleAnim.startTime > 800) {
        initPuzzle();
        return;
      }

      // palette swatch check
      const swatches = getSwatchRects();
      for (const sw of swatches) {
        if (tx >= sw.x && tx <= sw.x + sw.w && ty >= sw.y && ty <= sw.y + sw.h) {
          activeColor = sw.colorIdx;
          ctx.platform.haptic('light');
          return;
        }
      }

      // grid tap
      const layout = getLayout();
      const cell = cellAt(tx, ty, layout);
      if (!cell) return;
      dragCell = cell;
      paintCell(cell.r, cell.c);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const layout = getLayout();
      const cell = cellAt(tx, ty, layout);
      if (!cell) return;
      if (!dragCell || cell.r !== dragCell.r || cell.c !== dragCell.c) {
        dragCell = cell;
        if (state.cells[cell.r][cell.c] !== activeColor) {
          state.cells[cell.r][cell.c] = activeColor;
          animCell(cell.r, cell.c);
          const freqs = [440, 554, 659, 880, 990];
          playNote(freqs[(activeColor - 1) % 5]);
          if (!gameStarted) {
            gameStarted = true;
            startTime = performance.now();
            ctx.platform.start();
          }
          ctx.platform.interact({ type: 'tap' });
          if (checkSolved()) triggerSolve(performance.now());
        }
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      dragCell = null;
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
