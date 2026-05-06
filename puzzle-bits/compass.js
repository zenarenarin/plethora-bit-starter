window.plethoraBit = {
  meta: {
    title: 'Compass',
    author: 'plethora',
    description: 'Place numbers to satisfy compass clues.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FFA726';
    const BG = '#0f0f14';

    const N = 6;

    // Procedural puzzle generator
    function generatePuzzle(gridN) {
      gridN = gridN || N;
      // 1. Random region partition (flood fill from random seeds)
      const regionId = Array.from({length:gridN},()=>Array(gridN).fill(-1));
      const numRegions = 5 + Math.floor(Math.random() * 3);
      const regionCells = Array.from({length:numRegions},()=>[]);
      const used = new Set();

      for(let i=0;i<numRegions;i++){
        let r,c;
        do{r=Math.floor(Math.random()*gridN);c=Math.floor(Math.random()*gridN);}while(used.has(r+','+c));
        used.add(r+','+c);
        regionId[r][c]=i;
        regionCells[i].push([r,c]);
      }

      // BFS expand to fill remaining cells
      let changed=true;
      while(changed){
        changed=false;
        for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++){
          if(regionId[r][c]>=0) continue;
          for(const[dr,dc]of[[0,1],[0,-1],[1,0],[-1,0]]){
            const nr=r+dr,nc=c+dc;
            if(nr>=0&&nr<gridN&&nc>=0&&nc<gridN&&regionId[nr][nc]>=0){
              regionId[r][c]=regionId[nr][nc];
              regionCells[regionId[nr][nc]].push([r,c]);
              changed=true;
              break;
            }
          }
        }
      }

      // 2. For each region, pick one cell as compass clue cell
      const compasses = [];
      for(let i=0;i<numRegions;i++){
        const cells = regionCells[i];
        if(cells.length===0) continue;
        const [r,c] = cells[Math.floor(Math.random()*cells.length)];
        let nCount=0,eCount=0,sCount=0,wCount=0;
        for(const[cr,cc]of cells){
          if(cr<r) nCount++;
          else if(cr>r) sCount++;
          if(cc<c) wCount++;
          else if(cc>c) eCount++;
        }
        compasses.push({r,c,region:i,n:nCount,e:eCount,s:sCount,w:wCount});
      }

      // 3. Build solution: fill non-compass cells with region index + 1 (1-based)
      // givens: show ~40% of non-compass cells as pre-filled
      const compassSet = new Set(compasses.map(cp=>`${cp.r},${cp.c}`));
      const givens = [];
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++){
        if(compassSet.has(`${r},${c}`)) continue;
        if(Math.random()<0.35){
          // give them a number = region index + 1
          givens.push({r,c,v:regionId[r][c]+1});
        }
      }

      // Build full solution grid: compass cells = 0, others = regionId+1
      const solution = Array.from({length:gridN},(_,r)=>Array.from({length:gridN},(_,c)=>{
        if(compassSet.has(`${r},${c}`)) return 0;
        return regionId[r][c]+1;
      }));

      return { compasses, givens, solution, regionId };
    }

    let currentPuzzle = generatePuzzle(N);
    let showSolution = false;
    const EYE_X = W - 44, EYE_CY = 62, EYE_R = 20;

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let selectedCell = null;
    let userGrid = null; // 6x6, compass cells stay 0
    let audioCtx = null;
    let solveAnimStart = 0;
    let cellFlash = {};

    function getCompassMap() {
      const map = {};
      for (const cp of currentPuzzle.compasses) map[`${cp.r},${cp.c}`] = cp;
      return map;
    }

    function applySolution() {
      const p = currentPuzzle;
      for(let r=0;r<N;r++) for(let c=0;c<N;c++) userGrid[r][c]=p.solution[r][c];
    }

    function initPuzzle() {
      currentPuzzle = generatePuzzle(N);
      const p = currentPuzzle;
      userGrid = Array.from({ length: N }, () => Array(N).fill(0));
      // Lock in givens
      for (const gv of p.givens) userGrid[gv.r][gv.c] = gv.v;
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      selectedCell = null;
      cellFlash = {};
      solveAnimStart = 0;
      showSolution = false;
    }

    function isCompassCell(r, c) {
      return !!getCompassMap()[`${r},${c}`];
    }

    function isGiven(r, c) {
      return currentPuzzle.givens.some(gv => gv.r === r && gv.c === c);
    }

    function countDir(r, c, dr, dc) {
      let count = 0;
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < N && nc >= 0 && nc < N) {
        if (userGrid[nr][nc] > 0) count++;
        nr += dr; nc += dc;
      }
      return count;
    }

    function checkSolved() {
      const p = currentPuzzle;
      // All non-compass cells must be filled
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (!isCompassCell(r, c) && userGrid[r][c] === 0) return false;

      // All compass clues satisfied
      for (const cp of p.compasses) {
        if (countDir(cp.r, cp.c, -1, 0) !== cp.n) return false;
        if (countDir(cp.r, cp.c, 0, 1) !== cp.e) return false;
        if (countDir(cp.r, cp.c, 1, 0) !== cp.s) return false;
        if (countDir(cp.r, cp.c, 0, -1) !== cp.w) return false;
      }
      return true;
    }

    function getLayout() {
      const HUD_H = 48;
      const PAD_TOP = HUD_H + 12;
      const numPadH = 56;
      const PAD_BOT = numPadH + 16;
      const avail = Math.min(W - 32, USABLE_H - PAD_TOP - PAD_BOT);
      const CELL = Math.floor(avail / N);
      const gridW = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = PAD_TOP + Math.floor((USABLE_H - PAD_TOP - PAD_BOT - gridW) / 2);
      const padY = USABLE_H - PAD_BOT + 8;
      return { CELL, ox, oy, padY };
    }

    function numPadAt(tx, ty, layout) {
      const { padY } = layout;
      if (ty < padY || ty > padY + 44) return null;
      const btnW = Math.min(Math.floor((W - 32) / 7), 48);
      const totalW = btnW * 6 + 8 * 5;
      const startX = Math.floor((W - totalW) / 2);
      for (let d = 1; d <= 6; d++) {
        const bx = startX + (d - 1) * (btnW + 8);
        if (tx >= bx && tx <= bx + btnW) return d;
      }
      return null;
    }

    function triggerSolve(now) {
      solved = true;
      solveAnimStart = now;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_compass') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_compass', solveTime);
      ctx.platform.complete({ score: Math.floor(10000 - solveTime / 100), durationMs: solveTime });
      playChord();
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap(freq) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = freq || 660;
      o.type = 'sine';
      gain.gain.setValueAtTime(0.09, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    }

    function playChord() {
      if (!audioCtx) return;
      [440, 554, 659, 880].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        gain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.07);
        gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + i * 0.07 + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.07 + 0.6);
        o.start(audioCtx.currentTime + i * 0.07);
        o.stop(audioCtx.currentTime + i * 0.07 + 0.65);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    // Draw a compass rose clue cell
    function drawCompassCell(cx, cy, size, cp, accent) {
      const mid = size / 2;
      const inset = size * 0.18;

      // Background
      g.fillStyle = '#1e1820';
      g.fillRect(cx, cy, size, size);

      // Subtle circle
      g.strokeStyle = accent + '44';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx + mid, cy + mid, size * 0.3, 0, Math.PI * 2);
      g.stroke();

      // Cross lines
      g.strokeStyle = accent + '33';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(cx + mid, cy + inset); g.lineTo(cx + mid, cy + size - inset);
      g.moveTo(cx + inset, cy + mid); g.lineTo(cx + size - inset, cy + mid);
      g.stroke();

      const fontSize = Math.max(8, Math.floor(size * 0.22));
      g.font = `bold ${fontSize}px -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      // N
      g.fillStyle = accent;
      g.fillText(String(cp.n), cx + mid, cy + inset * 0.7);
      // S
      g.fillText(String(cp.s), cx + mid, cy + size - inset * 0.7);
      // W
      g.fillText(String(cp.w), cx + inset * 0.65, cy + mid);
      // E
      g.fillText(String(cp.e), cx + size - inset * 0.65, cy + mid);
    }

    // Check if compass clue is satisfied
    function compassSatisfied(cp) {
      return countDir(cp.r, cp.c, -1, 0) === cp.n &&
             countDir(cp.r, cp.c, 0, 1) === cp.e &&
             countDir(cp.r, cp.c, 1, 0) === cp.s &&
             countDir(cp.r, cp.c, 0, -1) === cp.w;
    }

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const compassMap = getCompassMap();

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const layout = getLayout();
      const { CELL, ox, oy, padY } = layout;

      // HUD
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('COMPASS', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Grid background
      g.fillStyle = '#161620';
      g.beginPath();
      if (g.roundRect) g.roundRect(ox - 4, oy - 4, N * CELL + 8, N * CELL + 8, 10);
      else g.rect(ox - 4, oy - 4, N * CELL + 8, N * CELL + 8);
      g.fill();

      // Draw cells
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const key = `${r},${c}`;
          const cp = compassMap[key];

          if (cp) {
            const sat = compassSatisfied(cp);
            drawCompassCell(cx, cy, CELL, cp, sat ? '#66BB6A' : ACCENT);
            if (sat) {
              g.strokeStyle = '#66BB6A55';
              g.lineWidth = 2;
              g.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            }
          } else {
            const isSelected = selectedCell && selectedCell.r === r && selectedCell.c === c;
            const isGiv = isGiven(r, c);
            const val = userGrid[r][c];

            // Flash
            let flashA = 0;
            if (cellFlash[key]) {
              const t = (now - cellFlash[key]) / 300;
              if (t > 1) delete cellFlash[key];
              else flashA = 1 - t;
            }

            g.fillStyle = isSelected ? ACCENT + '22' : '#1a1a26';
            g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);

            if (flashA > 0) {
              g.fillStyle = `rgba(255,167,38,${flashA * 0.3})`;
              g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            }

            if (isSelected) {
              g.strokeStyle = ACCENT;
              g.lineWidth = 2;
              g.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
            }

            if (val > 0) {
              g.font = `bold ${Math.floor(CELL * 0.44)}px -apple-system, sans-serif`;
              g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillStyle = isGiv ? '#ffffff' : ACCENT;
              g.fillText(String(val), cx + CELL / 2, cy + CELL / 2);
            }
          }
        }
      }

      // Grid lines
      g.strokeStyle = '#ffffff11';
      g.lineWidth = 0.5;
      for (let i = 0; i <= N; i++) {
        g.beginPath();
        g.moveTo(ox + i * CELL, oy);
        g.lineTo(ox + i * CELL, oy + N * CELL);
        g.stroke();
        g.beginPath();
        g.moveTo(ox, oy + i * CELL);
        g.lineTo(ox + N * CELL, oy + i * CELL);
        g.stroke();
      }

      // Outer border
      g.strokeStyle = ACCENT + '55';
      g.lineWidth = 1.5;
      g.strokeRect(ox, oy, N * CELL, N * CELL);

      // Number pad 1-6
      const btnW = Math.min(Math.floor((W - 32) / 7), 48);
      const totalBtnW = btnW * 6 + 8 * 5;
      const startX = Math.floor((W - totalBtnW) / 2);
      for (let d = 1; d <= 6; d++) {
        const bx = startX + (d - 1) * (btnW + 8);
        const by = padY;
        const isActive = selectedCell && userGrid[selectedCell.r][selectedCell.c] === d;

        g.fillStyle = isActive ? ACCENT + '33' : '#1e1e2e';
        g.beginPath();
        if (g.roundRect) g.roundRect(bx, by, btnW, 44, 8); else g.rect(bx, by, btnW, 44);
        g.fill();
        g.strokeStyle = isActive ? ACCENT : '#ffffff22';
        g.lineWidth = 1.5;
        g.beginPath();
        if (g.roundRect) g.roundRect(bx, by, btnW, 44, 8); else g.rect(bx, by, btnW, 44);
        g.stroke();

        g.font = `bold ${Math.floor(btnW * 0.45)}px -apple-system, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = isActive ? ACCENT : '#ffffffbb';
        g.fillText(String(d), bx + btnW / 2, by + 22);
      }

      // Eye/solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      // Info button
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 13px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.85);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.78), 500);
        const cy2 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath();
        if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
        g.fill();
        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('COMPASS', W / 2, cy2 + 50);
        const lx = cx2 + 20;
        let ty = cy2 + 72;
        const lh = 24;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• Fill empty cells with numbers 1-6',
          '• Compass cells show N/E/S/W counts:',
          '  how many filled cells exist in each direction',
          '• Satisfy all compass clues to solve',
          '• White numbers are locked givens',
          '• Green compass = clue satisfied',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffffcc';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }
        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillText('Tap a cell → select it', lx, ty); ty += lh;
        g.fillText('Tap a number → fill selected cell', lx, ty); ty += lh;
        g.fillText('Tap same number again → clear cell', lx, ty);
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      if (solved) {
        const elapsed2 = now - solveAnimStart;
        if (elapsed2 > 400) {
          g.fillStyle = 'rgba(15,15,20,0.88)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 60);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 16);
          const best = ctx.storage.get('bt_compass') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 16);
          g.fillStyle = ACCENT + '22';
          g.beginPath();
          if (g.roundRect) g.roundRect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          else g.rect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48);
          g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath();
          if (g.roundRect) g.roundRect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48, 12);
          else g.rect(W / 2 - 100, USABLE_H / 2 + 50, 200, 48);
          g.stroke();
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

      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo; return;
      }
      if (showInfo) { showInfo = false; return; }

      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved) {
        if (performance.now() - solveAnimStart > 400) {
          initPuzzle();
        }
        return;
      }

      const layout = getLayout();
      const padNum = numPadAt(tx, ty, layout);
      if (padNum !== null) {
        if (!gameStarted) { gameStarted = true; startTime = performance.now(); ctx.platform.start(); }
        if (selectedCell) {
          const { r, c } = selectedCell;
          if (isCompassCell(r, c) || isGiven(r, c)) return;
          if (userGrid[r][c] === padNum) {
            userGrid[r][c] = 0;
          } else {
            userGrid[r][c] = padNum;
            cellFlash[`${r},${c}`] = performance.now();
          }
          ctx.platform.haptic('light');
          playTap(380 + padNum * 70);
          ctx.platform.interact({ type: 'tap' });
          if (checkSolved()) triggerSolve(performance.now());
        }
        return;
      }

      const { CELL, ox, oy } = layout;
      const c = Math.floor((tx - ox) / CELL);
      const r = Math.floor((ty - oy) / CELL);
      if (r >= 0 && r < N && c >= 0 && c < N && !isCompassCell(r, c)) {
        if (!gameStarted) { gameStarted = true; startTime = performance.now(); ctx.platform.start(); }
        selectedCell = { r, c };
        ctx.platform.haptic('light');
        playTap(550);
        return;
      }
      selectedCell = null;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });
    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
