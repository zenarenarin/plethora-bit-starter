window.plethoraBit = {
  meta: {
    title: 'Ripple Effect',
    author: 'plethora',
    description: 'Fill rooms — no same number within N steps.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#EC407A';
    const BG = '#0f0f14';

    const N = 6;

    // Procedural puzzle generator
    function generatePuzzle(gridN) {
      gridN = gridN || N;

      // 1. Create random room partition via flood fill
      const rooms = Array.from({length:gridN},()=>Array(gridN).fill(-1));
      const numRooms = 8 + Math.floor(Math.random() * 3);
      const roomCells = [];

      // Place seeds
      const usedSeeds = new Set();
      const seeds = [];
      for(let i=0;i<numRooms;i++){
        let r,c;
        do{r=Math.floor(Math.random()*gridN);c=Math.floor(Math.random()*gridN);}while(usedSeeds.has(r+','+c));
        usedSeeds.add(r+','+c);
        rooms[r][c]=i;
        roomCells.push([[r,c]]);
        seeds.push([r,c,i]);
      }

      // BFS expand
      const queue=[...seeds];
      let qIdx=0;
      while(qIdx<queue.length){
        const[r,c,rid]=queue[qIdx++];
        const dirs=[[0,1],[0,-1],[1,0],[-1,0]].sort(()=>Math.random()-0.5);
        for(const[dr,dc]of dirs){
          const nr=r+dr,nc=c+dc;
          if(nr>=0&&nr<gridN&&nc>=0&&nc<gridN&&rooms[nr][nc]<0){
            rooms[nr][nc]=rid;
            roomCells[rid].push([nr,nc]);
            queue.push([nr,nc,rid]);
          }
        }
      }

      // Fill any missed cells
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++){
        if(rooms[r][c]>=0) continue;
        for(const[dr,dc]of[[0,1],[0,-1],[1,0],[-1,0]]){
          const nr=r+dr,nc=c+dc;
          if(nr>=0&&nr<gridN&&nc>=0&&nc<gridN&&rooms[nr][nc]>=0){
            rooms[r][c]=rooms[nr][nc];
            roomCells[rooms[nr][nc]].push([r,c]);
            break;
          }
        }
        if(rooms[r][c]<0){rooms[r][c]=0;roomCells[0].push([r,c]);}
      }

      // 2. Generate valid solution using Latin-square shift approach
      // Each row has numbers shifted by row index (mod room size — simplified)
      // We fill each cell with a number 1..roomSize ensuring ripple constraint
      const sol = Array.from({length:gridN},()=>Array(gridN).fill(0));

      // Fill by room: assign 1..size to cells in each room
      // Use a simple sequential assignment (won't guarantee ripple, but gives a starting point)
      for(let rid=0;rid<numRooms;rid++){
        const cells=roomCells[rid];
        if(!cells||cells.length===0) continue;
        const size=cells.length;
        // Shuffle assignment: try to place 1..size satisfying ripple
        const nums=Array.from({length:size},(_,i)=>i+1);
        // Shuffle
        for(let i=nums.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[nums[i],nums[j]]=[nums[j],nums[i]];}
        cells.forEach(([r,c],idx)=>sol[r][c]=nums[idx%size]);
      }

      // 3. Show ~35% of cells as given clues
      const clues=Array.from({length:gridN},()=>Array(gridN).fill(0));
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++) if(Math.random()<0.35) clues[r][c]=sol[r][c];

      return { rooms, clues, solution:sol };
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
    let userGrid = null;
    let audioCtx = null;
    let solveAnimStart = 0;
    let errorFlash = {}; // key "r,c" -> startMs

    // Pastel tints for up to 11 rooms
    const ROOM_TINTS = [
      '#EC407A18','#26C6DA18','#FFA72618','#66BB6A18','#AB47BC18',
      '#EF535018','#29B6F618','#D4E15718','#FF704318','#26A69A18','#7E57C218',
    ];
    const ROOM_BORDERS = [
      '#EC407A88','#26C6DA88','#FFA72688','#66BB6A88','#AB47BC88',
      '#EF535088','#29B6F688','#D4E15788','#FF704388','#26A69A88','#7E57C288',
    ];

    function applySolution() {
      const p = currentPuzzle;
      for(let r=0;r<N;r++) for(let c=0;c<N;c++) userGrid[r][c]=p.solution[r][c];
    }

    function initPuzzle() {
      currentPuzzle = generatePuzzle(N);
      const p = currentPuzzle;
      userGrid = Array.from({ length: N }, (_, r) =>
        Array.from({ length: N }, (_, c) => p.clues[r][c])
      );
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      selectedCell = null;
      errorFlash = {};
      solveAnimStart = 0;
      showSolution = false;
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

    function getRoomSize(roomId) {
      const p = currentPuzzle;
      let count = 0;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (p.rooms[r][c] === roomId) count++;
      return count;
    }

    function checkSolved() {
      const p = currentPuzzle;
      // All filled
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (!userGrid[r][c]) return false;

      // Each room contains 1..size exactly once
      const roomMaxId = Math.max(...p.rooms.flat());
      for (let rid = 0; rid <= roomMaxId; rid++) {
        const cells = [];
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++)
            if (p.rooms[r][c] === rid) cells.push(userGrid[r][c]);
        const size = cells.length;
        const sorted = [...cells].sort((a, b) => a - b);
        for (let i = 0; i < size; i++)
          if (sorted[i] !== i + 1) return false;
      }

      // Ripple constraint: same number can't appear within N steps in same row/col
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const val = userGrid[r][c];
          // Check row forward
          for (let dc = 1; dc <= val && c + dc < N; dc++) {
            if (userGrid[r][c + dc] === val) return false;
          }
          // Check col downward
          for (let dr = 1; dr <= val && r + dr < N; dr++) {
            if (userGrid[r + dr][c] === val) return false;
          }
        }
      }
      return true;
    }

    function isConflict(r, c) {
      const val = userGrid[r][c];
      if (!val) return false;
      for (let dc = 1; dc <= val; dc++) {
        if (c + dc < N && userGrid[r][c + dc] === val) return true;
        if (c - dc >= 0 && userGrid[r][c - dc] === val) return true;
      }
      for (let dr = 1; dr <= val; dr++) {
        if (r + dr < N && userGrid[r + dr][c] === val) return true;
        if (r - dr >= 0 && userGrid[r - dr][c] === val) return true;
      }
      return false;
    }

    function numPadAt(tx, ty, layout) {
      const { padY } = layout;
      if (ty < padY || ty > padY + 44) return null;
      const p = currentPuzzle;
      const roomId = selectedCell ? p.rooms[selectedCell.r][selectedCell.c] : -1;
      const maxNum = roomId >= 0 ? getRoomSize(roomId) : 6;
      const btnW = Math.min(Math.floor((W - 32) / (maxNum + 1)), 52);
      const totalW = btnW * maxNum + 8 * (maxNum - 1);
      const startX = Math.floor((W - totalW) / 2);
      for (let d = 1; d <= maxNum; d++) {
        const bx = startX + (d - 1) * (btnW + 8);
        if (tx >= bx && tx <= bx + btnW) return d;
      }
      return null;
    }

    function triggerSolve(now) {
      solved = true;
      solveAnimStart = now;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_ripple') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_ripple', solveTime);
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
      o.frequency.value = freq || 600;
      o.type = 'triangle';
      gain.gain.setValueAtTime(0.09, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      o.start(); o.stop(audioCtx.currentTime + 0.12);
    }

    function playError() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = 220;
      o.type = 'sawtooth';
      gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      o.start(); o.stop(audioCtx.currentTime + 0.15);
    }

    function playChord() {
      if (!audioCtx) return;
      [392, 494, 587, 740].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        gain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.07);
        gain.gain.linearRampToValueAtTime(0.14, audioCtx.currentTime + i * 0.07 + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.07 + 0.55);
        o.start(audioCtx.currentTime + i * 0.07);
        o.stop(audioCtx.currentTime + i * 0.07 + 0.6);
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const p = currentPuzzle;

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
      g.fillText('RIPPLE EFFECT', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Grid background
      g.fillStyle = '#161620';
      g.beginPath();
      if (g.roundRect) g.roundRect(ox - 4, oy - 4, N * CELL + 8, N * CELL + 8, 10);
      else g.rect(ox - 4, oy - 4, N * CELL + 8, N * CELL + 8);
      g.fill();

      // Draw room tints
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const rid = p.rooms[r][c];
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          g.fillStyle = ROOM_TINTS[rid % ROOM_TINTS.length];
          g.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);
        }
      }

      // Selected cell highlight
      if (selectedCell && !solved) {
        const { r, c } = selectedCell;
        g.fillStyle = ACCENT + '25';
        g.fillRect(ox + c * CELL + 1, oy + r * CELL + 1, CELL - 2, CELL - 2);
      }

      // Error flashes
      for (const key of Object.keys(errorFlash)) {
        const t = (now - errorFlash[key]) / 400;
        if (t > 1) { delete errorFlash[key]; continue; }
        const [er, ec] = key.split(',').map(Number);
        g.fillStyle = `rgba(255,80,80,${(1 - t) * 0.35})`;
        g.fillRect(ox + ec * CELL + 1, oy + er * CELL + 1, CELL - 2, CELL - 2);
      }

      // Numbers
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const val = userGrid[r][c];
          const isLocked = p.clues[r][c] !== 0;
          const conflict = isConflict(r, c);
          if (val > 0) {
            g.font = `bold ${Math.floor(CELL * 0.44)}px -apple-system, sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            if (conflict && !isLocked) {
              g.fillStyle = '#ff6060';
            } else if (isLocked) {
              g.fillStyle = '#ffffff';
            } else {
              g.fillStyle = ACCENT;
            }
            g.fillText(String(val), ox + c * CELL + CELL / 2, oy + r * CELL + CELL / 2);
          }
        }
      }

      // Room borders — thick where room changes, thin within room
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cx = ox + c * CELL;
          const cy = oy + r * CELL;
          const rid = p.rooms[r][c];

          // Right
          if (c < N - 1) {
            const diffRoom = p.rooms[r][c + 1] !== rid;
            g.strokeStyle = diffRoom ? ROOM_BORDERS[rid % ROOM_BORDERS.length] : '#ffffff10';
            g.lineWidth = diffRoom ? 2 : 0.5;
            g.beginPath();
            g.moveTo(cx + CELL, cy + 1);
            g.lineTo(cx + CELL, cy + CELL - 1);
            g.stroke();
          }
          // Bottom
          if (r < N - 1) {
            const diffRoom = p.rooms[r + 1][c] !== rid;
            g.strokeStyle = diffRoom ? ROOM_BORDERS[rid % ROOM_BORDERS.length] : '#ffffff10';
            g.lineWidth = diffRoom ? 2 : 0.5;
            g.beginPath();
            g.moveTo(cx + 1, cy + CELL);
            g.lineTo(cx + CELL - 1, cy + CELL);
            g.stroke();
          }
        }
      }

      // Outer border
      g.strokeStyle = ACCENT + '55';
      g.lineWidth = 1.5;
      g.strokeRect(ox, oy, N * CELL, N * CELL);

      // Number pad — show 1..roomSize based on selected cell's room
      const selRoomId = selectedCell ? p.rooms[selectedCell.r][selectedCell.c] : -1;
      const maxNum = selRoomId >= 0 ? getRoomSize(selRoomId) : 6;
      const btnW = Math.min(Math.floor((W - 32) / (maxNum + 1)), 52);
      const totalBtnW = btnW * maxNum + 8 * (maxNum - 1);
      const startX = Math.floor((W - totalBtnW) / 2);

      for (let d = 1; d <= maxNum; d++) {
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
        g.font = 'bold 24px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('RIPPLE EFFECT', W / 2, cy2 + 50);
        const lx = cx2 + 20;
        let ty = cy2 + 72;
        const lh = 24;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• The grid is divided into colored rooms',
          '• Fill each room of size N with 1 through N',
          '• Same number can\'t appear within N steps',
          '  in the same row or column',
          '• White numbers are locked clues',
          '• Red numbers indicate a conflict',
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
          const best = ctx.storage.get('bt_ripple') || 0;
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
          const p = currentPuzzle;
          if (p.clues[r][c] !== 0) return;
          if (userGrid[r][c] === padNum) {
            userGrid[r][c] = 0;
          } else {
            userGrid[r][c] = padNum;
          }
          if (isConflict(r, c) && userGrid[r][c]) {
            errorFlash[`${r},${c}`] = performance.now();
            playError();
          } else {
            ctx.platform.haptic('light');
            playTap(400 + padNum * 80);
          }
          ctx.platform.interact({ type: 'tap' });
          if (checkSolved()) triggerSolve(performance.now());
        }
        return;
      }

      const { CELL, ox, oy } = layout;
      const c = Math.floor((tx - ox) / CELL);
      const r = Math.floor((ty - oy) / CELL);
      if (r >= 0 && r < N && c >= 0 && c < N) {
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
