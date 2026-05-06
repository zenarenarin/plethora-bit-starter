window.plethoraBit = {
  meta: {
    title: 'Numberlink',
    author: 'plethora',
    description: 'Connect matching numbers with non-crossing paths.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#00BCD4';
    const BG = '#0f0f14';
    const GRID_SIZE = 7;

    // Distinct bright colors per pair index
    const PAIR_COLORS = [
      '#FF5252', // red
      '#69F0AE', // green
      '#FFD740', // yellow
      '#40C4FF', // blue
      '#EA80FC', // purple
      '#FF6D00', // orange
      '#F50057', // pink
      '#00E5FF', // cyan
    ];

    // Procedural puzzle generator
    function generatePuzzle(GS) {
      GS = GS || GRID_SIZE;
      const numPairs = 4 + Math.floor(Math.random() * 3);
      const groupPath = Array.from({length:numPairs},()=>[]);
      const assigned = Array.from({length:GS},()=>Array(GS).fill(-1));

      // Place pair seeds
      const usedPos = new Set();
      for(let gIdx=0;gIdx<numPairs;gIdx++){
        let r,c;
        do{r=Math.floor(Math.random()*GS);c=Math.floor(Math.random()*GS);}while(usedPos.has(r+','+c));
        usedPos.add(r+','+c);
        assigned[r][c]=gIdx;
        groupPath[gIdx].push([r,c]);
      }

      // BFS expand each group to fill the grid
      const queue=[];
      for(let gIdx=0;gIdx<numPairs;gIdx++) queue.push([groupPath[gIdx][0][0],groupPath[gIdx][0][1],gIdx]);
      let qIdx=0;
      while(qIdx<queue.length){
        const[r,c,gIdx]=queue[qIdx++];
        const dirs=[[0,1],[0,-1],[1,0],[-1,0]].sort(()=>Math.random()-0.5);
        for(const[dr,dc]of dirs){
          const nr=r+dr,nc=c+dc;
          if(nr>=0&&nr<GS&&nc>=0&&nc<GS&&assigned[nr][nc]<0){
            assigned[nr][nc]=gIdx;
            groupPath[gIdx].push([nr,nc]);
            queue.push([nr,nc,gIdx]);
          }
        }
      }

      // Fill any remaining unassigned cells (fallback)
      for(let r=0;r<GS;r++) for(let c=0;c<GS;c++){
        if(assigned[r][c]<0){
          // Find nearest assigned neighbor
          for(const[dr,dc]of[[0,1],[0,-1],[1,0],[-1,0]]){
            const nr=r+dr,nc=c+dc;
            if(nr>=0&&nr<GS&&nc>=0&&nc<GS&&assigned[nr][nc]>=0){
              assigned[r][c]=assigned[nr][nc];
              groupPath[assigned[r][c]].push([r,c]);
              break;
            }
          }
          if(assigned[r][c]<0){ assigned[r][c]=0; groupPath[0].push([r,c]); }
        }
      }

      // Endpoints: first and last cell in each group's path
      const endpoints = groupPath.map((path,gIdx)=>({
        num:gIdx+1,
        r1:path[0][0],c1:path[0][1],
        r2:path[path.length-1][0],c2:path[path.length-1][1]
      }));

      return { endpoints, solution: assigned, N: GS };
    }

    let currentPuzzle = generatePuzzle(GRID_SIZE);
    let showSolution = false;
    const EYE_X = W - 44, EYE_CY = 62, EYE_R = 20;

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    let gameStarted = false;
    let solved = false;
    let startTime = 0;
    let solveTime = 0;
    let solveAnim = null; // { startTime }

    // State per puzzle
    let paths = []; // paths[pairIdx] = array of {r,c} cells in order
    let activePair = -1; // which pair is being drawn now
    let grid = []; // grid[r][c] = pairIdx (1-based) or 0

    // Audio
    let audioCtx = null;
    let voiceCount = 0;
    const MAX_VOICES = 8;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq, dur = 0.08) {
      if (!audioCtx || voiceCount >= MAX_VOICES) return;
      voiceCount++;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.start(); osc.stop(audioCtx.currentTime + dur);
      osc.onended = () => { voiceCount--; };
    }

    function playChord() {
      if (!audioCtx) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        ctx.timeout(() => playNote(freq, 0.5), i * 60);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    function applySolution() {
      const p = currentPuzzle;
      // Reconstruct paths from solution grid
      paths = p.endpoints.map(() => []);
      grid = Array.from({length:GRID_SIZE},()=>Array(GRID_SIZE).fill(0));
      // Fill grid from solution
      for(let r=0;r<GRID_SIZE;r++) for(let c=0;c<GRID_SIZE;c++){
        const g2 = p.solution[r][c];
        if(g2>=0) grid[r][c]=g2+1;
      }
      // Build simple paths: endpoint1 -> ... -> endpoint2 per group
      // Just use the raw assigned cells as the path (no ordering needed for rendering)
      for(let pi=0;pi<p.endpoints.length;pi++){
        const ep = p.endpoints[pi];
        const cells = [];
        for(let r=0;r<GRID_SIZE;r++) for(let c=0;c<GRID_SIZE;c++) if(p.solution[r][c]===pi) cells.push({r,c});
        // Sort path: start from ep1, BFS to ep2
        const visited = new Set();
        const path = [];
        let cur = {r:ep.r1,c:ep.c1};
        visited.add(cur.r+','+cur.c);
        path.push(cur);
        let found = false;
        for(let step=0;step<cells.length+2;step++){
          if(cur.r===ep.r2&&cur.c===ep.c2){found=true;break;}
          let moved=false;
          for(const[dr,dc]of[[0,1],[1,0],[0,-1],[-1,0]]){
            const nr=cur.r+dr,nc=cur.c+dc;
            const key=nr+','+nc;
            if(!visited.has(key)&&nr>=0&&nr<GRID_SIZE&&nc>=0&&nc<GRID_SIZE&&p.solution[nr][nc]===pi){
              visited.add(key);
              cur={r:nr,c:nc};
              path.push(cur);
              moved=true;
              break;
            }
          }
          if(!moved) break;
        }
        paths[pi] = path;
      }
    }

    function initPuzzle() {
      currentPuzzle = generatePuzzle(GRID_SIZE);
      const p = currentPuzzle;
      paths = p.endpoints.map(() => []);
      grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
      activePair = -1;
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnim = null;
      showSolution = false;
      // Place endpoints in grid
      p.endpoints.forEach((ep, i) => {
        grid[ep.r1][ep.c1] = i + 1;
        grid[ep.r2][ep.c2] = i + 1;
      });
    }

    function getLayout() {
      const HUD_H = 48;
      const PAD = 16;
      const avail = Math.min(W - PAD * 2, USABLE_H - HUD_H - PAD * 2);
      const CELL = Math.floor(avail / GRID_SIZE);
      const gridW = CELL * GRID_SIZE;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + Math.floor((USABLE_H - HUD_H - gridW) / 2);
      return { CELL, ox, oy };
    }

    function cellAt(x, y) {
      const { CELL, ox, oy } = getLayout();
      const c = Math.floor((x - ox) / CELL);
      const r = Math.floor((y - oy) / CELL);
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return null;
      return { r, c };
    }

    function isEndpoint(r, c) {
      const p = currentPuzzle;
      return p.endpoints.findIndex(ep =>
        (ep.r1 === r && ep.c1 === c) || (ep.r2 === r && ep.c2 === c)
      );
    }

    function getPairOfCell(r, c) {
      // returns 1-based pair index or 0
      return grid[r][c];
    }

    function clearPath(pairIdx0) {
      // pairIdx0 is 0-based
      const p = currentPuzzle;
      const ep = p.endpoints[pairIdx0];
      // Clear grid cells belonging to this path (non-endpoint)
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          if (grid[r][c] === pairIdx0 + 1)
            if (!((r === ep.r1 && c === ep.c1) || (r === ep.r2 && c === ep.c2)))
              grid[r][c] = 0;
      paths[pairIdx0] = [];
    }

    function countFilledCells() {
      let filled = 0;
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          if (grid[r][c] > 0) filled++;
      return filled;
    }

    function completionPct() {
      return Math.round((countFilledCells() / (GRID_SIZE * GRID_SIZE)) * 100);
    }

    function checkSolved() {
      // All cells filled and all pairs have both endpoints connected
      if (countFilledCells() < GRID_SIZE * GRID_SIZE) return false;
      const p = currentPuzzle;
      for (let i = 0; i < p.endpoints.length; i++) {
        const ep = p.endpoints[i];
        // Path must start from one endpoint and reach the other
        const path = paths[i];
        if (path.length < 2) return false;
        const head = path[0], tail = path[path.length - 1];
        const startsOk =
          (head.r === ep.r1 && head.c === ep.c1 && tail.r === ep.r2 && tail.c === ep.c2) ||
          (head.r === ep.r2 && head.c === ep.c2 && tail.r === ep.r1 && tail.c === ep.c1);
        if (!startsOk) return false;
      }
      return true;
    }

    function triggerSolve(now) {
      solved = true;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_numberlink') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_numberlink', solveTime);
      ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
      solveAnim = { startTime: now };
      playChord();
    }

    // Long-press to erase
    let longPressTimer = null;
    let touchCell = null;
    let touchStartTime2 = 0;
    let dragging = false;
    let dragPath = []; // cells visited in current drag

    initPuzzle();

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const { CELL, ox, oy } = getLayout();
      const p = currentPuzzle;

      // HUD
      g.fillStyle = '#ffffff14';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('NUMBERLINK', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(gameStarted ? formatTime(elapsed) : '0:00', W - 50, 24);

      // Grid background
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const x = ox + c * CELL;
          const y = oy + r * CELL;
          g.fillStyle = '#1a1a26';
          g.beginPath();
          g.roundRect ? g.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 6)
            : g.rect(x + 2, y + 2, CELL - 4, CELL - 4);
          g.fill();
        }
      }

      // Draw paths as thick rounded lines
      for (let pi = 0; pi < p.endpoints.length; pi++) {
        const path = paths[pi];
        if (path.length < 2) continue;
        const color = PAIR_COLORS[pi % PAIR_COLORS.length];
        g.strokeStyle = color;
        g.lineWidth = CELL * 0.45;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.globalAlpha = 0.85;
        g.beginPath();
        path.forEach((cell, idx) => {
          const cx = ox + cell.c * CELL + CELL / 2;
          const cy = oy + cell.r * CELL + CELL / 2;
          if (idx === 0) g.moveTo(cx, cy);
          else g.lineTo(cx, cy);
        });
        g.stroke();
        g.globalAlpha = 1;
      }

      // Draw endpoint circles with numbers
      p.endpoints.forEach((ep, pi) => {
        const color = PAIR_COLORS[pi % PAIR_COLORS.length];
        const drawEndpoint = (r, c) => {
          const cx = ox + c * CELL + CELL / 2;
          const cy = oy + r * CELL + CELL / 2;
          const rad = CELL * 0.38;
          g.fillStyle = color;
          g.shadowColor = color;
          g.shadowBlur = 10;
          g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
          g.shadowBlur = 0;
          g.fillStyle = '#ffffff';
          g.font = `bold ${Math.max(10, CELL * 0.38)}px -apple-system, sans-serif`;
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(String(ep.num), cx, cy + 1);
        };
        drawEndpoint(ep.r1, ep.c1);
        drawEndpoint(ep.r2, ep.c2);
      });

      // Completion percentage indicator
      if (gameStarted && !solved) {
        const pct = completionPct();
        g.fillStyle = '#ffffff22';
        g.fillRect(16, USABLE_H - 28, W - 32, 6);
        g.fillStyle = ACCENT;
        g.fillRect(16, USABLE_H - 28, Math.round((W - 32) * pct / 100), 6);
        g.font = '11px -apple-system, sans-serif';
        g.fillStyle = '#aaaacc';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(`${pct}%`, W / 2, USABLE_H - 36);
      }

      // Eye/solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      // i button — drawn LAST after everything else
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.85);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.75), 480);
        const cy2 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath();
        g.roundRect ? g.roundRect(cx2, cy2, cw, ch, 16) : g.rect(cx2, cy2, cw, ch);
        g.fill();

        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('NUMBERLINK', W / 2, cy2 + 50);

        const lx = cx2 + 20;
        let ty = cy2 + 76;
        const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• Connect each pair of matching numbers',
          '• Paths must not cross each other',
          '• Every cell must be filled by a path',
          '• Complete when all pairs are connected',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#fff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }
        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;
        const ctrls = [
          'Tap a number to start drawing',
          'Drag through cells to route the path',
          'Tap same number to complete',
          'Long-press a path cell to erase it',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of ctrls) { g.fillText(line, lx, ty); ty += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      // Solved overlay
      if (solved && solveAnim) {
        const elapsed2 = now - solveAnim.startTime;
        if (elapsed2 > 600) {
          g.fillStyle = 'rgba(15,15,20,0.88)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 28;
          g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 56);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 14);
          const best = ctx.storage.get('bt_numberlink') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 18);
          // Next button
          const bx = W / 2 - 100, by = USABLE_H / 2 + 50;
          g.fillStyle = ACCENT + '22';
          g.beginPath();
          g.roundRect ? g.roundRect(bx, by, 200, 48, 12) : g.rect(bx, by, 200, 48);
          g.fill();
          g.strokeStyle = ACCENT; g.lineWidth = 1.5;
          g.beginPath();
          g.roundRect ? g.roundRect(bx, by, 200, 48, 12) : g.rect(bx, by, 200, 48);
          g.stroke();
          g.font = 'bold 16px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.fillText('NEW PUZZLE', W / 2, by + 24);
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

      // i button check first
      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (showSolution) {
        initPuzzle();
        return;
      }

      // Solved tap → new puzzle
      if (solved && solveAnim && performance.now() - solveAnim.startTime > 600) {
        initPuzzle();
        return;
      }

      const cell = cellAt(tx, ty);
      if (!cell) return;

      touchCell = cell;
      touchStartTime2 = performance.now();
      dragging = false;
      dragPath = [cell];

      const pairIdx0 = grid[cell.r][cell.c] - 1; // 0-based
      const epIdx = isEndpoint(cell.r, cell.c);

      if (epIdx >= 0) {
        // Starting a new path from an endpoint
        activePair = epIdx;
        clearPath(epIdx);
        paths[epIdx] = [cell];
        grid[cell.r][cell.c] = epIdx + 1;
        if (!gameStarted) {
          gameStarted = true;
          startTime = performance.now();
          ctx.platform.start();
        }
        playNote(440 + epIdx * 40);
        ctx.platform.interact({ type: 'tap' });
      } else if (pairIdx0 >= 0 && paths[pairIdx0].length > 0) {
        // Tapping a path cell — maybe long press to erase
        activePair = pairIdx0;
        longPressTimer = ctx.timeout(() => {
          clearPath(pairIdx0);
          activePair = -1;
          ctx.platform.haptic('medium');
          playNote(220, 0.12);
        }, 350);
      } else {
        activePair = -1;
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const cell = cellAt(tx, ty);
      if (!cell) return;
      if (!dragging && touchCell &&
          (Math.abs(cell.r - touchCell.r) > 0 || Math.abs(cell.c - touchCell.c) > 0)) {
        dragging = true;
        longPressTimer = null; // ctx auto-clears
      }
      if (!dragging || activePair < 0) return;

      const last = paths[activePair][paths[activePair].length - 1];
      if (!last || (cell.r === last.r && cell.c === last.c)) return;

      // Only allow adjacent (non-diagonal) moves
      if (Math.abs(cell.r - last.r) + Math.abs(cell.c - last.c) !== 1) return;

      // Check if this cell is the second-to-last in path (backtracking)
      const pathLen = paths[activePair].length;
      if (pathLen >= 2) {
        const prev = paths[activePair][pathLen - 2];
        if (prev.r === cell.r && prev.c === cell.c) {
          // Backtrack: remove last cell
          const removed = paths[activePair].pop();
          if (grid[removed.r][removed.c] === activePair + 1) {
            const ep = currentPuzzle.endpoints[activePair];
            const isEp = (removed.r === ep.r1 && removed.c === ep.c1) ||
                         (removed.r === ep.r2 && removed.c === ep.c2);
            if (!isEp) grid[removed.r][removed.c] = 0;
          }
          return;
        }
      }

      // Check if cell is occupied by another pair — clear that pair
      const existingPair = grid[cell.r][cell.c];
      if (existingPair > 0 && existingPair !== activePair + 1) {
        const ep = currentPuzzle.endpoints[existingPair - 1];
        const isEp = (cell.r === ep.r1 && cell.c === ep.c1) ||
                     (cell.r === ep.r2 && cell.c === ep.c2);
        if (isEp) return; // can't overwrite another endpoint
        clearPath(existingPair - 1);
      }

      // Check if this is the matching endpoint → complete path
      const ep = currentPuzzle.endpoints[activePair];
      const isMatchingEndpoint =
        (cell.r === ep.r1 && cell.c === ep.c1 && paths[activePair][0].r === ep.r2 && paths[activePair][0].c === ep.c2) ||
        (cell.r === ep.r2 && cell.c === ep.c2 && paths[activePair][0].r === ep.r1 && paths[activePair][0].c === ep.c1);

      paths[activePair].push(cell);
      grid[cell.r][cell.c] = activePair + 1;
      playNote(330 + activePair * 30 + paths[activePair].length * 5, 0.05);

      if (isMatchingEndpoint) {
        ctx.platform.haptic('light');
        activePair = -1;
        if (checkSolved()) triggerSolve(performance.now());
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      longPressTimer = null;
      dragging = false;
      touchCell = null;

      if (activePair >= 0 && !solved) {
        // Check if path ends at opposite endpoint
        const path = paths[activePair];
        if (path.length >= 2) {
          const ep = currentPuzzle.endpoints[activePair];
          const tail = path[path.length - 1];
          const isComplete =
            (tail.r === ep.r1 && tail.c === ep.c1) ||
            (tail.r === ep.r2 && tail.c === ep.c2);
          if (!isComplete) {
            // Path is incomplete — leave it as-is (partial path ok)
          }
        }
        activePair = -1;
        if (checkSolved()) triggerSolve(performance.now());
      }
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
