window.plethoraBit = {
  meta: {
    title: 'LITS',
    author: 'plethora',
    description: 'Place one tetromino in each region. Same shapes can\'t touch.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const ACCENT = '#26de81';
    const BG = '#0a0f0a';
    const CELL_BG = '#141f14';

    // Tetromino colors
    const TCOLORS = { L: '#fd9644', I: '#45aaf2', T: '#26de81', S: '#fc5c65' };

    // Region tints (subtle)
    const REGION_TINTS = ['#1a2016','#16201a','#1a1620','#201a16','#161a1a','#1a1a16'];

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const USABLE_H = H - SAFE;

    function generatePuzzle(size) {
      size = size || 6;
      const regionId = Array.from({ length: size }, () => Array(size).fill(-1));
      const numRegions = 5 + Math.floor(Math.random() * 2); // 5 or 6 regions
      const regionCells = Array.from({ length: numRegions }, () => []);

      // Place random seeds
      const taken = new Set();
      for (let i = 0; i < numRegions; i++) {
        let r, c;
        let tries = 0;
        do {
          r = Math.floor(Math.random() * size);
          c = Math.floor(Math.random() * size);
          tries++;
        } while (taken.has(r + ',' + c) && tries < 100);
        taken.add(r + ',' + c);
        regionId[r][c] = i;
        regionCells[i].push([r, c]);
      }

      // BFS expansion
      let changed = true;
      while (changed) {
        changed = false;
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
          if (regionId[r][c] >= 0) continue;
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && regionId[nr][nc] >= 0) {
              regionId[r][c] = regionId[nr][nc];
              regionCells[regionId[nr][nc]].push([r, c]);
              changed = true; break;
            }
          }
        }
      }

      // For each region, pick 4 cells that form a connected group and shade them
      const sol = Array.from({ length: size }, () => Array(size).fill(0));
      const TTYPE_KEYS = ['L', 'I', 'T', 'S'];

      for (let i = 0; i < numRegions; i++) {
        const cells2 = regionCells[i];
        if (cells2.length < 4) continue;

        // Try to pick a connected 4-cell subset
        let picked = null;
        for (let attempt = 0; attempt < 20; attempt++) {
          const seed = cells2[Math.floor(Math.random() * cells2.length)];
          const group = [seed];
          const inGroup = new Set([seed[0] + ',' + seed[1]]);
          const frontier = [seed];
          while (group.length < 4 && frontier.length > 0) {
            const idx2 = Math.floor(Math.random() * frontier.length);
            const [fr, fc] = frontier[idx2];
            frontier.splice(idx2, 1);
            for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
              const nr = fr + dr, nc = fc + dc;
              const k = nr + ',' + nc;
              if (!inGroup.has(k) && cells2.some(([r2, c2]) => r2 === nr && c2 === nc)) {
                inGroup.add(k);
                group.push([nr, nc]);
                frontier.push([nr, nc]);
                if (group.length >= 4) break;
              }
            }
          }
          if (group.length === 4) {
            // Check no 2x2 with existing shading
            let ok = true;
            for (const [r2, c2] of group) sol[r2][c2] = 1;
            for (let r2 = 0; r2 < size - 1 && ok; r2++)
              for (let c2 = 0; c2 < size - 1 && ok; c2++)
                if (sol[r2][c2] && sol[r2][c2 + 1] && sol[r2 + 1][c2] && sol[r2 + 1][c2 + 1]) ok = false;
            if (!ok) {
              for (const [r2, c2] of group) sol[r2][c2] = 0;
            } else {
              picked = group;
              break;
            }
          }
        }
        if (!picked) {
          // Fallback: just use first 4 cells
          const fallback = cells2.slice(0, 4);
          for (const [r2, c2] of fallback) sol[r2][c2] = 1;
        }
      }

      // Build shaded array from sol
      const shaded = sol.map(row => row.map(v => v));

      return { size, regions: regionId, regionCount: numRegions, solution: null, shaded };
    }

    let showInfo = false;
    let showSolution = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let currentPuzzle = generatePuzzle(6);
    let GRID = 6;

    let cells = [];
    let animT = [];
    let animTarget = [];
    let ripple = [];
    let solved = false;
    let showOverlay = false;
    let overlayAlpha = 0;
    let timerActive = false;
    let elapsed = 0;
    let startTime = 0;
    let firstTouch = false;
    let bestTime = ctx.storage.get('bt_lits') || 0;
    let audioCtx = null;
    let violations = { badTouch: [], badBlock: [] };

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 523; o.type = 'sine';
      gn.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }

    function playError() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 120; o.type = 'sawtooth';
      gn.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    }

    function playSolve() {
      if (!audioCtx) return;
      [523,659,784,1047].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = freq; o.type = 'sine';
        const t = audioCtx.currentTime + i * 0.12;
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(0.18, t + 0.03);
        gn.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.start(t); o.stop(t + 0.35);
      });
    }

    function initPuzzle() {
      GRID = currentPuzzle.size;
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
      violations = { badTouch: [], badBlock: [] };
    }

    initPuzzle();

    const TOP_BAR = 64;

    function getLayout() {
      const availH = H - SAFE - TOP_BAR - 16;
      const cs = Math.floor(Math.min(W - 40, availH) / GRID);
      const gridW = cs * GRID;
      const gridH = cs * GRID;
      const offX = Math.floor((W - gridW) / 2);
      const offY = TOP_BAR + Math.floor((availH - gridH) / 2);
      return { cs, offX, offY, gridW, gridH };
    }

    function drawRR(g2, x, y, w, h, r) {
      g2.beginPath();
      if (g2.roundRect) { g2.roundRect(x, y, w, h, r); return; }
      g2.moveTo(x+r,y); g2.lineTo(x+w-r,y); g2.arcTo(x+w,y,x+w,y+r,r);
      g2.lineTo(x+w,y+h-r); g2.arcTo(x+w,y+h,x+w-r,y+h,r);
      g2.lineTo(x+r,y+h); g2.arcTo(x,y+h,x,y+h-r,r);
      g2.lineTo(x,y+r); g2.arcTo(x,y,x+r,y,r); g2.closePath();
    }

    function getRegionColor(rid) {
      return REGION_TINTS[rid % REGION_TINTS.length];
    }

    // Detect which type of tetromino is formed in a region
    function detectTetromino(regionCells2, shadedSet) {
      const shaded = regionCells2.filter(([r,c]) => shadedSet.has(`${r},${c}`));
      if (shaded.length !== 4) return null;

      const minR = Math.min(...shaded.map(([r])=>r));
      const minC = Math.min(...shaded.map(([,c])=>c));
      const norm = shaded.map(([r,c]) => [r-minR, c-minC]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const key = norm.map(([r,c])=>`${r},${c}`).join('|');

      const TETROMINOES = {
        'I': ['0,0|0,1|0,2|0,3','0,0|1,0|2,0|3,0'],
        'L': ['0,0|0,1|0,2|1,0','0,0|0,1|0,2|1,2','0,0|1,0|1,1|1,2','0,2|1,0|1,1|1,2',
               '0,0|1,0|2,0|2,1','0,0|0,1|1,0|2,0','0,1|1,1|2,0|2,1','0,0|0,1|1,1|2,1'],
        'T': ['0,0|0,1|0,2|1,1','0,0|1,0|1,1|2,0','0,1|1,0|1,1|2,1','0,0|0,1|1,0|1,0',
               '0,1|1,0|1,1|1,2','0,0|1,0|2,0|1,1','0,0|1,0|1,1|2,0'],
        'S': ['0,0|0,1|1,1|1,2','0,1|0,2|1,0|1,1','0,0|1,0|1,1|2,1','0,1|1,0|1,1|2,0'],
      };

      for (const [type, patterns] of Object.entries(TETROMINOES)) {
        if (patterns.includes(key)) return type;
      }
      return 'L'; // default
    }

    function check2x2(state) {
      const bad = [];
      for (let r = 0; r < GRID-1; r++)
        for (let c = 0; c < GRID-1; c++)
          if (state[r][c]&&state[r+1][c]&&state[r][c+1]&&state[r+1][c+1])
            bad.push([r,c]);
      return bad;
    }

    function checkSameTetroTouch(regionTetros) {
      const bad = [];
      const types = Object.entries(regionTetros);
      for (let i = 0; i < types.length; i++) {
        for (let j = i+1; j < types.length; j++) {
          if (types[i][1] === types[j][1]) {
            const ri = parseInt(types[i][0]);
            const rj = parseInt(types[j][0]);
            let touch = false;
            for (let r = 0; r < GRID && !touch; r++)
              for (let c = 0; c < GRID && !touch; c++)
                if (currentPuzzle.regions[r][c] === ri) {
                  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                    const nr=r+dr, nc=c+dc;
                    if (nr>=0&&nr<GRID&&nc>=0&&nc<GRID&&currentPuzzle.regions[nr][nc]===rj) {
                      touch = true; break;
                    }
                  }
                }
            if (touch) { bad.push(ri); bad.push(rj); }
          }
        }
      }
      return bad;
    }

    function isSolved() {
      return currentPuzzle.shaded.every((row,r) => row.every((v,c) => v === cells[r][c]));
    }

    function triggerSolve() {
      solved = true;
      timerActive = false;
      playSolve();
      const cr = Math.floor(GRID/2), cc = Math.floor(GRID/2);
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++) {
          const dist = Math.abs(r-cr)+Math.abs(c-cc);
          ctx.timeout(() => { ripple[r][c] = 1.0; }, dist * 55);
        }
      ctx.timeout(() => { showOverlay = true; }, GRID * 55 + 400);
      if (bestTime === 0 || elapsed < bestTime) {
        bestTime = elapsed;
        ctx.storage.set('bt_lits', bestTime);
      }
    }

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

      // Eye / solution button
      if (Math.hypot(touchX - EYE_X, touchY - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        const sol = currentPuzzle.shaded;
        for (let r = 0; r < GRID; r++)
          for (let c = 0; c < GRID; c++)
            cells[r][c] = sol[r][c];
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        currentPuzzle = generatePuzzle(6);
        initPuzzle();
        return;
      }

      if (showOverlay) {
        currentPuzzle = generatePuzzle(6);
        initPuzzle();
        return;
      }

      const touch = e.changedTouches[0];
      const { cs, offX, offY } = getLayout();
      const col = Math.floor((touch.clientX - offX) / cs);
      const row = Math.floor((touch.clientY - offY) / cs);
      if (row < 0 || row >= GRID || col < 0 || col >= GRID) return;

      if (!firstTouch) {
        firstTouch = true;
        timerActive = true;
        startTime = Date.now();
        ctx.platform.start();
      }

      cells[row][col] = cells[row][col] ? 0 : 1;
      animTarget[row][col] = cells[row][col];
      playTap();
      ctx.platform.haptic('light');

      const bad2x2 = check2x2(cells);
      violations.badBlock = bad2x2;

      if (bad2x2.length > 0) playError();
      if (isSolved()) triggerSolve();
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    function formatTime(ms) {
      const s = Math.floor(ms/1000), m = Math.floor(s/60);
      return `${m}:${String(s%60).padStart(2,'0')}`;
    }

    // Build region cell lists
    function buildRegionCells() {
      const map = {};
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++) {
          const id = currentPuzzle.regions[r][c];
          if (!map[id]) map[id] = [];
          map[id].push([r,c]);
        }
      return map;
    }

    ctx.raf((dt) => {
      if (timerActive) elapsed = Date.now() - startTime;

      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++) {
          animT[r][c] += (animTarget[r][c] - animT[r][c]) * 0.22;
          if (ripple[r][c] > 0) ripple[r][c] = Math.max(0, ripple[r][c] - dt/500);
        }

      if (showOverlay && overlayAlpha < 1) overlayAlpha = Math.min(1, overlayAlpha + dt/300);

      const { cs, offX, offY } = getLayout();
      const pad = Math.max(1, Math.floor(cs * 0.05));

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // Title
      g.fillStyle = ACCENT;
      g.font = `bold ${Math.floor(cs * 0.5)}px -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('LITS', W/2, 28);

      g.fillStyle = '#777';
      g.font = `${Math.floor(cs * 0.38)}px -apple-system, sans-serif`;
      g.fillText(formatTime(elapsed), W/2, 50);

      if (bestTime > 0) {
        g.fillStyle = '#444';
        g.textAlign = 'right';
        g.font = `${Math.floor(cs * 0.3)}px -apple-system, sans-serif`;
        g.fillText(`Best: ${formatTime(bestTime)}`, W - 16, 50);
      }

      const regionCells = buildRegionCells();
      const shadedSet = new Set();
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++)
          if (cells[r][c]) shadedSet.add(`${r},${c}`);

      // Region tetromino detection
      const regionTetros = {};
      for (const [id, rcells] of Object.entries(regionCells)) {
        const type = detectTetromino(rcells, shadedSet);
        if (type) regionTetros[id] = type;
      }

      // Draw cells
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const x = offX + c * cs + pad;
          const y = offY + r * cs + pad;
          const size = cs - pad * 2;
          const t = animT[r][c];
          const rip = ripple[r][c];
          const rid = currentPuzzle.regions[r][c];
          const regionType = regionTetros[rid];
          const isShaded = cells[r][c] === 1;
          const in2x2 = violations.badBlock.some(([vr,vc]) =>
            (r===vr||r===vr+1) && (c===vc||c===vc+1));

          const scale = isShaded ? 0.75 + 0.25 * t : 1;
          g.save();
          g.translate(x + size/2, y + size/2);
          g.scale(scale, scale);

          if (isShaded) {
            const color = regionType ? TCOLORS[regionType] : ACCENT;

            // Glow
            g.shadowColor = in2x2 ? '#ff4444' : color;
            g.shadowBlur = 8 * t;
            g.fillStyle = in2x2 ? '#2a0808' : color + '44';
            drawRR(g, -size/2, -size/2, size, size, 5);
            g.fill();
            g.shadowBlur = 0;

            g.strokeStyle = in2x2 ? '#ff4444' : color;
            g.lineWidth = 2;
            drawRR(g, -size/2, -size/2, size, size, 5);
            g.stroke();

            // Type label
            if (regionType) {
              g.fillStyle = color;
              g.font = `bold ${Math.floor(size*0.38)}px -apple-system, sans-serif`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.globalAlpha = 0.6 + t * 0.4;
              g.fillText(regionType, 0, 0);
              g.globalAlpha = 1;
            }
          } else {
            // Unshaded - region tinted bg
            g.fillStyle = getRegionColor(rid);
            drawRR(g, -size/2, -size/2, size, size, 5);
            g.fill();
          }

          if (rip > 0) {
            g.globalAlpha = rip * 0.5;
            g.fillStyle = ACCENT;
            drawRR(g, -size/2, -size/2, size, size, 5);
            g.fill();
            g.globalAlpha = 1;
          }

          g.restore();

          // Region borders
          const dirs = [[0,1],[1,0]];
          for (const [dr,dc] of dirs) {
            const nr=r+dr, nc=c+dc;
            if (nr < GRID && nc < GRID) {
              const sameRegion = currentPuzzle.regions[nr][nc] === rid;
              if (!sameRegion) {
                g.strokeStyle = ACCENT;
                g.lineWidth = 2.5;
                g.globalAlpha = 0.6;
                g.beginPath();
                if (dc) {
                  g.moveTo(offX+(c+1)*cs, offY+r*cs+pad*0.5);
                  g.lineTo(offX+(c+1)*cs, offY+(r+1)*cs-pad*0.5);
                } else {
                  g.moveTo(offX+c*cs+pad*0.5, offY+(r+1)*cs);
                  g.lineTo(offX+(c+1)*cs-pad*0.5, offY+(r+1)*cs);
                }
                g.stroke();
                g.globalAlpha = 1;
              }
            }
          }
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
        g.fillText('LITS', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty2 = cy2 + 80;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty2); ty2 += lh;

        const rules = [
          '• Shade exactly 4 cells in each region to form a tetromino',
          '• Valid shapes: L, I, T or S',
          '• Two touching regions cannot have the same tetromino shape',
          '• All shaded cells across the grid form one connected group',
          '• No 2×2 block of shaded cells allowed',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty2); ty2 += lh; }

        ty2 += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty2); ty2 += lh;

        const controls = [
          'Tap → toggle shade a cell',
          'Each region needs exactly 4 shaded in an L/I/T/S shape',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of controls) { g.fillText(line, lx, ty2); ty2 += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      // Solved overlay
      if (showOverlay) {
        g.globalAlpha = overlayAlpha * 0.88;
        g.fillStyle = BG;
        g.fillRect(0, 0, W, H);
        g.globalAlpha = overlayAlpha;

        const big = Math.floor(W * 0.11);
        g.font = `bold ${big}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = ACCENT;
        g.fillText('SOLVED!', W/2, H/2 - big*1.2);

        g.font = `${Math.floor(big*0.5)}px -apple-system, sans-serif`;
        g.fillStyle = '#ccc';
        g.fillText(formatTime(elapsed), W/2, H/2);

        g.fillStyle = bestTime === elapsed ? ACCENT : '#555';
        g.fillText(bestTime === elapsed ? 'New Best!' : `Best: ${formatTime(bestTime)}`, W/2, H/2+big*0.7);

        g.fillStyle = '#444';
        g.font = `${Math.floor(big*0.38)}px -apple-system, sans-serif`;
        g.fillText('→ Next Puzzle', W/2, H/2+big*1.5);

        g.globalAlpha = 1;
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
