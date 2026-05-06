window.plethoraBit = {
  meta: {
    title: 'Akari',
    author: 'plethora',
    description: 'Place light bulbs to illuminate every cell.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FFD54F';
    const BG = '#0f0f14';
    const N = 7; // 7x7 grid

    // Cell types
    const EMPTY = 0;    // white cell, no bulb
    const BLACK = -1;   // black cell, no number
    const BULB = 1;     // white cell with bulb

    // Procedural puzzle generator
    function generatePuzzle(gridN) {
      gridN = gridN || N;
      // 1. Place black cells (~15%)
      const black = Array.from({length:gridN},()=>Array(gridN).fill(false));
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++) if(Math.random()<0.15) black[r][c]=true;

      // 2. Find a valid bulb placement via greedy+random
      const bulbsArr = Array.from({length:gridN},()=>Array(gridN).fill(false));
      const lit = Array.from({length:gridN},()=>Array(gridN).fill(false));

      function illuminate(r,c) {
        lit[r][c]=true;
        for(const[dr,dc]of[[0,1],[0,-1],[1,0],[-1,0]]){
          let nr=r+dr,nc=c+dc;
          while(nr>=0&&nr<gridN&&nc>=0&&nc<gridN&&!black[nr][nc]){lit[nr][nc]=true;nr+=dr;nc+=dc;}
        }
      }

      const cells=[];
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++) if(!black[r][c]) cells.push([r,c]);
      cells.sort(()=>Math.random()-0.5);
      for(const[r,c] of cells){
        if(lit[r][c]) continue;
        let conflict=false;
        for(const[dr,dc]of[[0,1],[0,-1],[1,0],[-1,0]]){
          let nr=r+dr,nc=c+dc;
          while(nr>=0&&nr<gridN&&nc>=0&&nc<gridN&&!black[nr][nc]){
            if(bulbsArr[nr][nc]){conflict=true;break;}
            nr+=dr;nc+=dc;
          }
          if(conflict)break;
        }
        if(!conflict){bulbsArr[r][c]=true;illuminate(r,c);}
      }

      // 3. Compute black cell number clues (~50% of black cells get a number)
      const clues = Array.from({length:gridN},()=>Array(gridN).fill(null));
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++){
        if(!black[r][c]) continue;
        if(Math.random()>0.5) continue;
        let count=0;
        [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([ar,ac])=>{if(ar>=0&&ar<gridN&&ac>=0&&ac<gridN&&bulbsArr[ar][ac])count++;});
        clues[r][c]=count;
      }

      // Build grid in old format: 'W' = white, 'B' = black (no num), 0-4 = black with number
      const grid = Array.from({length:gridN},(_,r)=>Array.from({length:gridN},(_,c)=>{
        if(!black[r][c]) return 'W';
        if(clues[r][c]===null) return 'B';
        return clues[r][c];
      }));

      // Build solution array of [r,c] for each bulb
      const solution = [];
      for(let r=0;r<gridN;r++) for(let c=0;c<gridN;c++) if(bulbsArr[r][c]) solution.push([r,c]);

      return { grid, solution };
    }

    let currentPuzzle = generatePuzzle(N);
    let showSolution = false;
    const EYE_X = W - 44, EYE_CY = 62, EYE_R = 20;

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    let gameStarted = false;
    let solved = false;
    let startTime = 0;
    let solveTime = 0;
    let solveAnim = null;

    // Player state: which white cells have bulbs
    let bulbs = []; // Set of "r,c" strings
    // Conflict animation: "r,c" -> flash start time
    let conflictFlash = {};

    // Audio
    let audioCtx = null;
    let voiceCount = 0;
    const MAX_VOICES = 8;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq, dur = 0.1, type = 'sine') {
      if (!audioCtx || voiceCount >= MAX_VOICES) return;
      voiceCount++;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = type;
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
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

    function isBlack(r, c) {
      const v = currentPuzzle.grid[r][c];
      return v === 'B' || typeof v === 'number';
    }

    function isNumbered(r, c) {
      const v = currentPuzzle.grid[r][c];
      return typeof v === 'number';
    }

    function cellNumber(r, c) {
      return currentPuzzle.grid[r][c];
    }

    function hasBulb(r, c) {
      return bulbs.indexOf(`${r},${c}`) >= 0;
    }

    // Compute illuminated cells from current bulbs
    function computeIllum() {
      const illum = Array.from({ length: N }, () => Array(N).fill(false));
      bulbs.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        illum[r][c] = true;
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        dirs.forEach(([dr, dc]) => {
          let nr = r + dr, nc = c + dc;
          while (nr >= 0 && nr < N && nc >= 0 && nc < N && !isBlack(nr, nc)) {
            illum[nr][nc] = true;
            nr += dr; nc += dc;
          }
        });
      });
      return illum;
    }

    // Returns set of bulb keys that have conflicts (see each other)
    function computeConflicts() {
      const conflicts = new Set();
      bulbs.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        dirs.forEach(([dr, dc]) => {
          let nr = r + dr, nc = c + dc;
          while (nr >= 0 && nr < N && nc >= 0 && nc < N && !isBlack(nr, nc)) {
            if (hasBulb(nr, nc)) {
              conflicts.add(key);
              conflicts.add(`${nr},${nc}`);
            }
            nr += dr; nc += dc;
          }
        });
      });
      return conflicts;
    }

    // Returns count of adjacent bulbs for a numbered black cell
    function adjacentBulbs(r, c) {
      let count = 0;
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      dirs.forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N && hasBulb(nr, nc)) count++;
      });
      return count;
    }

    // Check full solve condition
    function checkSolved() {
      const illum = computeIllum();
      const conflicts = computeConflicts();
      if (conflicts.size > 0) return false;
      // All white cells illuminated
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (!isBlack(r, c) && !illum[r][c]) return false;
      // All numbered constraints met exactly
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (isNumbered(r, c)) {
            const num = cellNumber(r, c);
            if (adjacentBulbs(r, c) !== num) return false;
          }
      return true;
    }

    function triggerSolve(now) {
      solved = true;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_akari') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_akari', solveTime);
      ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
      solveAnim = { startTime: now };
      playChord();
    }

    function applySolution() {
      bulbs = currentPuzzle.solution.map(([r,c]) => `${r},${c}`);
    }

    function initPuzzle() {
      currentPuzzle = generatePuzzle(N);
      bulbs = [];
      conflictFlash = {};
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnim = null;
      showSolution = false;
    }

    initPuzzle();

    function getLayout() {
      const HUD_H = 48;
      const PAD = 16;
      const avail = Math.min(W - PAD * 2, USABLE_H - HUD_H - PAD * 2);
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

    // Draw a star/bulb icon
    function drawBulb(cx, cy, size, color, alpha) {
      g.save();
      g.globalAlpha = alpha;
      // Outer glow
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, size * 1.1);
      grad.addColorStop(0, color + 'ff');
      grad.addColorStop(0.5, color + 'aa');
      grad.addColorStop(1, color + '00');
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cy, size * 1.1, 0, Math.PI * 2); g.fill();
      // Star shape
      g.fillStyle = '#fff';
      const spikes = 8;
      const outerR = size * 0.52;
      const innerR = size * 0.22;
      g.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const r2 = i % 2 === 0 ? outerR : innerR;
        const px = cx + Math.cos(angle) * r2;
        const py = cy + Math.sin(angle) * r2;
        i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.fill();
      g.restore();
    }

    ctx.raf((dt) => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      const { CELL, ox, oy } = getLayout();
      const illum = computeIllum();
      const conflicts = computeConflicts();

      // HUD
      g.fillStyle = '#ffffff14';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('AKARI', 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(gameStarted ? formatTime(elapsed) : '0:00', W - 50, 24);

      // Draw grid cells
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const x = ox + c * CELL;
          const y = oy + r * CELL;
          const cx2 = x + CELL / 2;
          const cy2 = y + CELL / 2;
          const key = `${r},${c}`;
          const blk = isBlack(r, c);
          const numbered = isNumbered(r, c);
          const hasBulbHere = hasBulb(r, c);
          const isIllum = illum[r][c];
          const isConflict = conflicts.has(key);

          // Cell background
          if (blk) {
            // Black cell
            g.fillStyle = '#1e1e28';
            g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

            if (numbered) {
              const num = cellNumber(r, c);
              const adjCount = adjacentBulbs(r, c);
              const satisfied = adjCount === num;
              const violated = adjCount > num;

              // Border glow for constraint state
              if (satisfied) {
                g.strokeStyle = '#4CAF50';
                g.lineWidth = 2.5;
                g.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
              } else if (violated) {
                g.strokeStyle = '#F44336';
                g.lineWidth = 2.5;
                g.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
              }

              // Number
              g.fillStyle = satisfied ? '#4CAF50' : violated ? '#F44336' : '#aaaacc';
              g.font = `bold ${Math.max(12, CELL * 0.44)}px -apple-system, sans-serif`;
              g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText(String(num), cx2, cy2 + 1);
            }
          } else {
            // White cell
            let bg;
            if (isConflict) {
              // Pulsing red for conflict
              const flash = (now % 600) / 600;
              const alpha = 0.4 + 0.4 * Math.sin(flash * Math.PI * 2);
              bg = `rgba(244,67,54,${alpha})`;
            } else if (isIllum) {
              // Warm yellow glow when illuminated
              bg = '#2a2208';
            } else {
              bg = '#242432';
            }
            g.fillStyle = bg;
            g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

            // Yellow overlay for illuminated
            if (isIllum && !isConflict) {
              const grad = g.createRadialGradient(cx2, cy2, 0, cx2, cy2, CELL * 0.7);
              grad.addColorStop(0, 'rgba(255,213,79,0.22)');
              grad.addColorStop(1, 'rgba(255,213,79,0.04)');
              g.fillStyle = grad;
              g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
            }

            // Draw bulb
            if (hasBulbHere) {
              const bulbColor = isConflict ? '#F44336' : ACCENT;
              drawBulb(cx2, cy2, CELL * 0.38, bulbColor, 1.0);
            }
          }

          // Cell border
          g.strokeStyle = '#ffffff0a';
          g.lineWidth = 0.5;
          g.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
        }
      }

      // Grid outer border
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 1.5;
      g.strokeRect(ox, oy, CELL * N, CELL * N);

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

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.85);
        const cx3 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.78), 500);
        const cy3 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath();
        g.roundRect ? g.roundRect(cx3, cy3, cw, ch, 16) : g.rect(cx3, cy3, cw, ch);
        g.fill();

        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('AKARI', W / 2, cy3 + 50);

        const lx = cx3 + 20;
        let ty = cy3 + 76;
        const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;
        const rules = [
          '• Place bulbs in white cells to light them up',
          '• Bulbs shine in all 4 directions until blocked',
          '• No two bulbs may see each other',
          '• Numbers on black cells = adjacent bulbs required',
          '• All white cells must be illuminated to win',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#fff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }
        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('VISUAL HINTS', lx, ty); ty += lh;
        const hints = [
          'Yellow glow = illuminated cell',
          'Red flash = conflicting bulbs',
          'Green border on number = constraint met',
          'Red border = too many adjacent bulbs',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of hints) { g.fillText(line, lx, ty); ty += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy3 + ch - 20);
      }

      // Solved overlay
      if (solved && solveAnim) {
        const elapsed2 = now - solveAnim.startTime;
        if (elapsed2 > 500) {
          g.fillStyle = 'rgba(15,15,20,0.88)';
          g.fillRect(0, 0, W, USABLE_H);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = 'bold 38px -apple-system, sans-serif';
          g.fillStyle = ACCENT;
          g.shadowColor = ACCENT; g.shadowBlur = 28;
          g.fillText('LIGHTS OUT!', W / 2, USABLE_H / 2 - 56);
          g.shadowBlur = 0;
          g.font = '18px -apple-system, sans-serif';
          g.fillStyle = '#ffffff99';
          g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 14);
          const best = ctx.storage.get('bt_akari') || 0;
          g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 18);
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
      const ty2 = e.changedTouches[0].clientY;

      // Eye/solution button check
      if (Math.hypot(tx - EYE_X, ty2 - EYE_CY) < EYE_R) {
        showSolution = true;
        applySolution();
        return;
      }

      // i button check first
      if (Math.hypot(tx - IBTN.x, ty2 - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (showSolution) {
        initPuzzle();
        return;
      }

      // Solved tap → new puzzle
      if (solved && solveAnim && performance.now() - solveAnim.startTime > 500) {
        initPuzzle();
        return;
      }

      const cell = cellAt(tx, ty2);
      if (!cell) return;
      if (isBlack(cell.r, cell.c)) return;
      if (cell.r >= N || cell.c >= N) return;

      // First real game interaction
      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      // Toggle bulb
      const key = `${cell.r},${cell.c}`;
      const idx = bulbs.indexOf(key);
      if (idx >= 0) {
        bulbs.splice(idx, 1);
        playNote(330, 0.08);
        ctx.platform.haptic('light');
      } else {
        bulbs.push(key);
        playNote(660, 0.1);
        ctx.platform.haptic('light');
      }

      ctx.platform.interact({ type: 'tap' });

      // Check conflicts for flash
      const newConflicts = computeConflicts();
      if (newConflicts.size > 0) {
        ctx.platform.haptic('medium');
        playNote(110, 0.15, 'sawtooth');
      }

      if (checkSolved()) {
        triggerSolve(performance.now());
        ctx.platform.haptic('heavy');
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
