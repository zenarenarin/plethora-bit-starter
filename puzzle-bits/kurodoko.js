window.plethoraBit = {
  meta: {
    title: 'Kurodoko',
    author: 'plethora',
    description: 'Numbers see exactly that many white cells in their row and column.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const ACCENT = '#a29bfe';
    const BG = '#0d0d18';
    const WHITE_CELL = '#f0ede8';
    const BLACK_CELL = '#1a1a2e';
    const CELL_EMPTY = '#1c1c2e';

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const USABLE_H = H - SAFE;

    function generatePuzzle(size) {
      size = size || 6;
      // Step 1: Place black cells (~18%, no two adjacent)
      const black = Array.from({ length: size }, () => Array(size).fill(false));
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (Math.random() < 0.18) {
            const adj = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
            if (!adj.some(([ar,ac]) => ar >= 0 && ar < size && ac >= 0 && ac < size && black[ar][ac])) {
              black[r][c] = true;
            }
          }
        }
      }

      // Step 2: For each white cell compute visibility
      function visibility(r, c) {
        let count = 1;
        for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          let nr = r + dr, nc = c + dc;
          while (nr >= 0 && nr < size && nc >= 0 && nc < size && !black[nr][nc]) {
            count++;
            nr += dr; nc += dc;
          }
        }
        return count;
      }

      // Step 3: Show ~40% of white cells as numbered clues
      const clues = Array.from({ length: size }, () => Array(size).fill(null));
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!black[r][c] && Math.random() < 0.4) {
            clues[r][c] = visibility(r, c);
          }
        }
      }

      // Build solution array (1=black, 0=white)
      const solution = black.map(row => row.map(v => v ? 1 : 0));

      return { size, clues, solution };
    }

    let showInfo = false;
    let showSolution = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let currentPuzzle = generatePuzzle(6);
    let GRID = 6;
    let cells = []; // 0=white, 1=black, 2=circled(locked white)
    let animT = [];
    let animTarget = [];
    let ripple = [];
    let rayCell = null;
    let rayTimer = 0;
    let shakeCell = null;
    let shakeT = 0;
    let solved = false;
    let showOverlay = false;
    let overlayAlpha = 0;
    let timerActive = false;
    let elapsed = 0;
    let startTime = 0;
    let firstTouch = false;
    let bestTime = ctx.storage.get('bt_kurodoko') || 0;
    let longPressTimer = null;
    let longPressCell = null;
    let audioCtx = null;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 440; o.type = 'sine';
      gn.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.start(); o.stop(audioCtx.currentTime + 0.08);
    }

    function playError() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value = 120; o.type = 'square';
      gn.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.start(); o.stop(audioCtx.currentTime + 0.08);
    }

    function playSolve() {
      if (!audioCtx) return;
      [523,659,784,1047].forEach((freq, i) => {
        const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value = freq; o.type = 'sine';
        const t = audioCtx.currentTime + i * 0.1;
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.start(t); o.stop(t + 0.3);
      });
    }

    function initPuzzle() {
      GRID = currentPuzzle.size;
      cells = Array.from({length:GRID}, () => Array(GRID).fill(0));
      animT = Array.from({length:GRID}, () => Array(GRID).fill(0));
      animTarget = Array.from({length:GRID}, () => Array(GRID).fill(0));
      ripple = Array.from({length:GRID}, () => Array(GRID).fill(0));
      solved = false;
      showOverlay = false;
      overlayAlpha = 0;
      timerActive = false;
      elapsed = 0;
      startTime = 0;
      firstTouch = false;
      showSolution = false;
      rayCell = null;
      shakeCell = null;
    }

    initPuzzle();

    const TOP_BAR = 64;

    function getLayout() {
      const availH = H - SAFE - TOP_BAR - 16;
      const cs = Math.floor(Math.min(W - 40, availH) / GRID);
      const offX = Math.floor((W - cs*GRID) / 2);
      const offY = TOP_BAR + Math.floor((availH - cs*GRID) / 2);
      return { cs, offX, offY };
    }

    function drawRR(g2, x, y, w, h, r) {
      g2.beginPath();
      if (g2.roundRect) { g2.roundRect(x,y,w,h,r); return; }
      g2.moveTo(x+r,y); g2.lineTo(x+w-r,y); g2.arcTo(x+w,y,x+w,y+r,r);
      g2.lineTo(x+w,y+h-r); g2.arcTo(x+w,y+h,x+w-r,y+h,r);
      g2.lineTo(x+r,y+h); g2.arcTo(x,y+h,x,y+h-r,r);
      g2.lineTo(x,y+r); g2.arcTo(x,y,x+r,y,r); g2.closePath();
    }

    // Count visible white cells from (r,c) in 4 directions including self
    function countVisible(r, c, state) {
      let count = 1;
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr,dc] of dirs) {
        let nr=r+dr, nc=c+dc;
        while (nr>=0&&nr<GRID&&nc>=0&&nc<GRID&&state[nr][nc]!==1) {
          count++;
          nr+=dr; nc+=dc;
        }
      }
      return count;
    }

    function getVisibleCells(r, c, state) {
      const visible = [[r,c]];
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr,dc] of dirs) {
        let nr=r+dr, nc=c+dc;
        while (nr>=0&&nr<GRID&&nc>=0&&nc<GRID&&state[nr][nc]!==1) {
          visible.push([nr,nc]);
          nr+=dr; nc+=dc;
        }
      }
      return visible;
    }

    function checkBlackTouch(state) {
      for (let r=0;r<GRID;r++)
        for (let c=0;c<GRID;c++)
          if (state[r][c]===1) {
            for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nr=r+dr, nc=c+dc;
              if (nr>=0&&nr<GRID&&nc>=0&&nc<GRID&&state[nr][nc]===1) return true;
            }
          }
      return false;
    }

    function isSolved() {
      return currentPuzzle.solution.every((row,r) => row.every((v,c) => {
        if (v===1) return cells[r][c]===1;
        return cells[r][c]!==1;
      }));
    }

    function triggerSolve() {
      solved = true;
      timerActive = false;
      playSolve();
      const cr=Math.floor(GRID/2), cc=Math.floor(GRID/2);
      for (let r=0;r<GRID;r++)
        for (let c=0;c<GRID;c++) {
          const d = Math.abs(r-cr)+Math.abs(c-cc);
          ctx.timeout(()=>{ ripple[r][c]=1.0; }, d*60);
        }
      ctx.timeout(()=>{ showOverlay=true; }, GRID*60+400);
      if (bestTime===0||elapsed<bestTime) {
        bestTime=elapsed;
        ctx.storage.set('bt_kurodoko',bestTime);
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
        const sol = currentPuzzle.solution;
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
      const col = Math.floor((touch.clientX-offX)/cs);
      const row = Math.floor((touch.clientY-offY)/cs);
      if (row<0||row>=GRID||col<0||col>=GRID) return;

      if (!firstTouch) {
        firstTouch=true;
        timerActive=true;
        startTime=Date.now();
        ctx.platform.start();
      }

      // If tapping a clue cell, show visibility ray
      if (currentPuzzle.clues[row][col] !== null) {
        rayCell = [row,col];
        rayTimer = 200;
        return;
      }

      longPressCell = [row,col];
      longPressTimer = ctx.timeout(() => {
        if (longPressCell) {
          const [lr,lc] = longPressCell;
          cells[lr][lc] = cells[lr][lc]===2 ? 0 : 2;
          animTarget[lr][lc] = cells[lr][lc]===2 ? 0.5 : 0;
          ctx.platform.haptic('light');
        }
        longPressCell = null;
      }, 400);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!longPressCell) return;
      clearTimeout(longPressTimer);
      const [row,col] = longPressCell;
      longPressCell = null;

      if (solved||showOverlay) return;
      if (currentPuzzle.clues[row][col]!==null) return;

      // Toggle black
      if (cells[row][col]===0) cells[row][col]=1;
      else if (cells[row][col]===1) cells[row][col]=0;
      else cells[row][col]=0;

      animTarget[row][col] = cells[row][col]===1 ? 1 : 0;
      playTap();
      ctx.platform.haptic('light');

      // Validate clues
      let hasConflict = false;
      for (let r=0;r<GRID;r++)
        for (let c=0;c<GRID;c++)
          if (currentPuzzle.clues[r][c]!==null && cells[r][c]!==1) {
            const vis = countVisible(r,c,cells);
            if (vis > currentPuzzle.clues[r][c]) { hasConflict=true; break; }
          }

      if (checkBlackTouch(cells)) hasConflict = true;
      if (hasConflict) playError();

      if (isSolved()) triggerSolve();
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    function formatTime(ms) {
      const s=Math.floor(ms/1000), m=Math.floor(s/60);
      return `${m}:${String(s%60).padStart(2,'0')}`;
    }

    ctx.raf((dt) => {
      if (timerActive) elapsed=Date.now()-startTime;

      for (let r=0;r<GRID;r++)
        for (let c=0;c<GRID;c++) {
          animT[r][c] += (animTarget[r][c]-animT[r][c])*0.22;
          if (ripple[r][c]>0) ripple[r][c]=Math.max(0,ripple[r][c]-dt/500);
        }
      if (rayTimer>0) { rayTimer-=dt; if(rayTimer<=0) rayCell=null; }
      if (showOverlay&&overlayAlpha<1) overlayAlpha=Math.min(1,overlayAlpha+dt/300);

      const { cs, offX, offY } = getLayout();
      const pad = Math.max(1,Math.floor(cs*0.05));
      const size = cs-pad*2;

      g.fillStyle = BG;
      g.fillRect(0,0,W,H);

      // Ray overlay
      if (rayCell) {
        const [rr,rc] = rayCell;
        const visCells = getVisibleCells(rr,rc,cells);
        for (const [vr,vc] of visCells) {
          const vx=offX+vc*cs+pad, vy=offY+vr*cs+pad;
          g.fillStyle = ACCENT+'22';
          drawRR(g,vx,vy,size,size,4);
          g.fill();
        }
      }

      // Title
      g.fillStyle = ACCENT;
      g.font = `bold ${Math.floor(cs*0.44)}px -apple-system, sans-serif`;
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText('KURODOKO', W/2, 28);

      g.fillStyle='#777';
      g.font=`${Math.floor(cs*0.36)}px -apple-system, sans-serif`;
      g.fillText(formatTime(elapsed), W/2, 50);

      if (bestTime>0) {
        g.fillStyle='#444';
        g.textAlign='right';
        g.font=`${Math.floor(cs*0.28)}px -apple-system, sans-serif`;
        g.fillText(`Best: ${formatTime(bestTime)}`, W-16, 50);
      }

      // Cells
      for (let r=0;r<GRID;r++) {
        for (let c=0;c<GRID;c++) {
          const x=offX+c*cs+pad, y=offY+r*cs+pad;
          const t=animT[r][c];
          const rip=ripple[r][c];
          const isBlack=cells[r][c]===1;
          const isCircle=cells[r][c]===2;
          const clue=currentPuzzle.clues[r][c];
          const isRayCell = rayCell && rayCell[0]===r && rayCell[1]===c;

          // Check clue conflict
          let clueConflict = false;
          if (clue!==null && !isBlack) {
            const vis=countVisible(r,c,cells);
            clueConflict = vis!==clue;
          }

          // Check black touching
          let blackConflict = false;
          if (isBlack) {
            for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nr=r+dr,nc=c+dc;
              if (nr>=0&&nr<GRID&&nc>=0&&nc<GRID&&cells[nr][nc]===1) { blackConflict=true; break; }
            }
          }

          const scale = isBlack ? 0.8+0.2*t : 1;
          g.save();
          g.translate(x+size/2,y+size/2);
          g.scale(scale,scale);

          if (isBlack) {
            g.fillStyle = blackConflict ? '#3a0808' : BLACK_CELL;
            drawRR(g,-size/2,-size/2,size,size,5);
            g.fill();
            if (blackConflict) {
              g.strokeStyle='#ff4444';
              g.lineWidth=2;
              drawRR(g,-size/2,-size/2,size,size,5);
              g.stroke();
            }
            g.strokeStyle='#0a0a18';
            g.lineWidth=3;
            g.globalAlpha=0.5;
            drawRR(g,-size/2+3,-size/2+3,size-6,size-6,3);
            g.stroke();
            g.globalAlpha=1;
          } else {
            g.fillStyle = isRayCell ? ACCENT+'33' : CELL_EMPTY;
            drawRR(g,-size/2,-size/2,size,size,5);
            g.fill();

            if (clue!==null) {
              g.fillStyle = '#2a2a40';
              drawRR(g,-size/2,-size/2,size,size,5);
              g.fill();

              g.font=`bold ${Math.floor(size*0.52)}px -apple-system, sans-serif`;
              g.textAlign='center'; g.textBaseline='middle';
              g.fillStyle = clueConflict ? '#ff6b6b' : ACCENT;
              if (clueConflict) {
                const shk = Math.sin(Date.now()*0.03)*2;
                g.fillText(String(clue), shk, 0);
              } else {
                g.fillText(String(clue), 0, 0);
              }
            } else if (isCircle) {
              g.strokeStyle=ACCENT;
              g.lineWidth=2;
              g.globalAlpha=0.7;
              g.beginPath();
              g.arc(0,0,size*0.22,0,Math.PI*2);
              g.stroke();
              g.globalAlpha=1;
            }
          }

          if (rip>0) {
            g.globalAlpha=rip*0.55;
            g.fillStyle=ACCENT;
            drawRR(g,-size/2,-size/2,size,size,5);
            g.fill();
            g.globalAlpha=1;
          }

          g.restore();

          // Grid lines
          g.strokeStyle='#222233';
          g.lineWidth=1;
          g.strokeRect(offX+c*cs, offY+r*cs, cs, cs);
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
        g.fillText('KURODOKO', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty2 = cy2 + 80;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty2); ty2 += lh;

        const rules = [
          '• Shade cells black',
          '• Each number = total white cells it can see (including itself)',
          '• Vision travels in all 4 directions until blocked by black',
          '• Black cells cannot touch each other side-by-side',
          '• All white cells must stay connected',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty2); ty2 += lh; }

        ty2 += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty2); ty2 += lh;

        const controls = [
          'Tap → toggle black',
          'Long-press → circle (lock as white)',
          'Tap a number → flash its line of sight',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of controls) { g.fillText(line, lx, ty2); ty2 += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      if (showOverlay) {
        g.globalAlpha=overlayAlpha*0.88;
        g.fillStyle=BG;
        g.fillRect(0,0,W,H);
        g.globalAlpha=overlayAlpha;

        const big=Math.floor(W*0.1);
        g.font=`bold ${big}px -apple-system, sans-serif`;
        g.textAlign='center'; g.textBaseline='middle';
        g.fillStyle=ACCENT;
        g.fillText('SOLVED!',W/2,H/2-big*1.2);

        g.font=`${Math.floor(big*0.5)}px -apple-system, sans-serif`;
        g.fillStyle='#ccc';
        g.fillText(formatTime(elapsed),W/2,H/2);

        g.fillStyle=bestTime===elapsed?ACCENT:'#555';
        g.fillText(bestTime===elapsed?'New Best!':`Best: ${formatTime(bestTime)}`,W/2,H/2+big*0.7);

        g.fillStyle='#444';
        g.font=`${Math.floor(big*0.38)}px -apple-system, sans-serif`;
        g.fillText('→ Next Puzzle',W/2,H/2+big*1.5);

        g.globalAlpha=1;
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
