window.plethoraBit = {
  meta: {
    title: 'Shakashaka',
    author: 'plethora',
    description: 'Fill cells with triangles to form white rectangles.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const ACCENT = '#00cec9';
    const BG = '#090e0e';
    const BLACK_CELL_COLOR = '#1a1a2a';
    const WHITE_CELL_COLOR = '#e8e4df';
    const TRI_COLOR = '#00cec9';
    const TRI_SHADOW = '#007c78';

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // Triangle states: 0=empty, 1=UL(upper-left), 2=UR, 3=LR, 4=LL
    // UL: triangle fills top-left corner (diagonal from top-right to bottom-left)
    // UR: fills top-right corner
    // LR: fills bottom-right corner
    // LL: fills bottom-left corner

    // 6x6 puzzles — generated procedurally
    // black[r][c] = true/false, numbers[r][c] = number or null
    // solution[r][c] = 0-4

    function generatePuzzle(N) {
      N = N || 6;
      // Step 1: Place black cells (~15%, no two adjacent)
      const black = Array.from({length:N}, () => Array(N).fill(false));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (Math.random() < 0.15) {
          const adj = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
          if (!adj.some(([ar,ac]) => ar>=0&&ar<N&&ac>=0&&ac<N&&black[ar][ac]))
            black[r][c] = true;
        }
      }

      // Step 2: Assign triangles to white cells (0=none, 1=UL, 2=UR, 3=LR, 4=LL)
      const sol = Array.from({length:N}, () => Array(N).fill(0));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!black[r][c]) sol[r][c] = Math.floor(Math.random() * 5);
      }

      // Step 3: Compute black cell clue numbers
      const numbers = Array.from({length:N}, () => Array(N).fill(null));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!black[r][c]) continue;
        let count = 0;
        [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([ar,ac]) => {
          if (ar>=0&&ar<N&&ac>=0&&ac<N&&!black[ar][ac]&&sol[ar][ac]>0) count++;
        });
        if (Math.random() < 0.7) numbers[r][c] = count;
      }

      return { size: N, black, numbers, solution: sol };
    }

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    const USABLE_H = H - SAFE;

    let puzzle = generatePuzzle(6);
    let GRID = 6;
    let cells = []; // triangle state 0-4
    let animT = []; // 0->1 for each cell
    let animPrev = []; // previous state for transition
    let ripple = [];
    let glowRects = []; // list of rectangles to glow {cells:[], t:1->0}
    let solved = false;
    let showOverlay = false;
    let overlayAlpha = 0;
    let timerActive = false;
    let elapsed = 0;
    let startTime = 0;
    let firstTouch = false;
    let bestTime = ctx.storage.get('bt_shakashaka') || 0;
    let audioCtx = null;
    let showSolution = false;
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap() {
      if (!audioCtx) return;
      const o=audioCtx.createOscillator(), gn=audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value=480; o.type='sine';
      gn.gain.setValueAtTime(0.1,audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.07);
      o.start(); o.stop(audioCtx.currentTime+0.07);
    }

    function playError() {
      if (!audioCtx) return;
      const o=audioCtx.createOscillator(), gn=audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value=110; o.type='square';
      gn.gain.setValueAtTime(0.12,audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.08);
      o.start(); o.stop(audioCtx.currentTime+0.08);
    }

    function playSolve() {
      if (!audioCtx) return;
      [523,659,784,1047].forEach((freq,i)=>{
        const o=audioCtx.createOscillator(), gn=audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value=freq; o.type='sine';
        const t=audioCtx.currentTime+i*0.1;
        gn.gain.setValueAtTime(0,t);
        gn.gain.linearRampToValueAtTime(0.18,t+0.02);
        gn.gain.exponentialRampToValueAtTime(0.001,t+0.3);
        o.start(t); o.stop(t+0.3);
      });
    }

    function initPuzzle() {
      puzzle=generatePuzzle(6);
      GRID=puzzle.size;
      cells=Array.from({length:GRID},()=>Array(GRID).fill(0));
      animT=Array.from({length:GRID},()=>Array(GRID).fill(1));
      animPrev=Array.from({length:GRID},()=>Array(GRID).fill(0));
      ripple=Array.from({length:GRID},()=>Array(GRID).fill(0));
      glowRects=[];
      solved=false;
      showOverlay=false;
      overlayAlpha=0;
      timerActive=false;
      elapsed=0;
      startTime=0;
      firstTouch=false;
      showSolution=false;
    }

    initPuzzle();

    const TOP_BAR = 64;

    function getLayout() {
      const availH=H-SAFE-TOP_BAR-16;
      const cs=Math.floor(Math.min(W-40,availH)/GRID);
      const offX=Math.floor((W-cs*GRID)/2);
      const offY=TOP_BAR+Math.floor((availH-cs*GRID)/2);
      return {cs,offX,offY};
    }

    // Draw a right triangle in a cell
    // type: 1=UL, 2=UR, 3=LR, 4=LL
    function drawTriangle(g2, x, y, size, type, color) {
      g2.beginPath();
      if (type===1) { // upper-left: corners at TL, TR, BL
        g2.moveTo(x,y);
        g2.lineTo(x+size,y);
        g2.lineTo(x,y+size);
      } else if (type===2) { // upper-right: TL, TR, BR
        g2.moveTo(x,y);
        g2.lineTo(x+size,y);
        g2.lineTo(x+size,y+size);
      } else if (type===3) { // lower-right: TR, BR, BL
        g2.moveTo(x+size,y);
        g2.lineTo(x+size,y+size);
        g2.lineTo(x,y+size);
      } else { // lower-left: TL, BR, BL
        g2.moveTo(x,y);
        g2.lineTo(x+size,y+size);
        g2.lineTo(x,y+size);
      }
      g2.closePath();
      g2.fillStyle=color;
      g2.fill();
    }

    // Count adjacent triangles to a black cell
    function countAdjacentTri(r, c) {
      let count=0;
      const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
      for(const[dr,dc]of dirs){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<GRID&&nc>=0&&nc<GRID&&!puzzle.black[nr][nc]&&cells[nr][nc]!==0) count++;
      }
      return count;
    }

    function isSolved() {
      // Check all number clues satisfied
      for(let r=0;r<GRID;r++)
        for(let c=0;c<GRID;c++)
          if(puzzle.numbers[r][c]!==null){
            if(countAdjacentTri(r,c)!==puzzle.numbers[r][c]) return false;
          }
      // Check solution matches
      for(let r=0;r<GRID;r++)
        for(let c=0;c<GRID;c++)
          if(!puzzle.black[r][c]&&cells[r][c]!==puzzle.solution[r][c]) return false;
      return true;
    }

    function triggerSolve() {
      solved=true;
      timerActive=false;
      playSolve();
      const cr=Math.floor(GRID/2),cc=Math.floor(GRID/2);
      for(let r=0;r<GRID;r++)
        for(let c=0;c<GRID;c++){
          const d=Math.abs(r-cr)+Math.abs(c-cc);
          ctx.timeout(()=>{ripple[r][c]=1.0;},d*55);
        }
      ctx.timeout(()=>{showOverlay=true;},GRID*55+400);
      if(bestTime===0||elapsed<bestTime){
        bestTime=elapsed;
        ctx.storage.set('bt_shakashaka',bestTime);
      }
    }

    ctx.listen(canvas,'touchstart',(e)=>{
      e.preventDefault();
      initAudio();

      const touchX=e.changedTouches[0].clientX;
      const touchY=e.changedTouches[0].clientY;
      if(Math.hypot(touchX-IBTN.x,touchY-(IBTN.y+IBTN.r))<IBTN.r+8){
        showInfo=!showInfo;
        return;
      }
      if(showInfo){showInfo=false;return;}

      // See Solution button
      if(Math.hypot(touchX-EYE_X,touchY-EYE_CY)<EYE_R+8){
        showSolution=true;
        for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++){
          if(!puzzle.black[r][c]){
            animPrev[r][c]=cells[r][c];
            cells[r][c]=puzzle.solution[r][c];
            animT[r][c]=0;
          }
        }
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        initPuzzle();
        return;
      }

      if(showOverlay){
        initPuzzle();
        return;
      }

      const touch=e.changedTouches[0];
      const {cs,offX,offY}=getLayout();
      const col=Math.floor((touch.clientX-offX)/cs);
      const row=Math.floor((touch.clientY-offY)/cs);
      if(row<0||row>=GRID||col<0||col>=GRID) return;
      if(puzzle.black[row][col]) return;

      if(!firstTouch){
        firstTouch=true;
        timerActive=true;
        startTime=Date.now();
        ctx.platform.start();
      }

      // Cycle: 0->1->2->3->4->0
      animPrev[row][col]=cells[row][col];
      cells[row][col]=(cells[row][col]+1)%5;
      animT[row][col]=0; // reset transition

      playTap();
      ctx.platform.haptic('light');

      // Check number conflicts
      let hasConflict=false;
      for(let r=0;r<GRID;r++)
        for(let c=0;c<GRID;c++)
          if(puzzle.numbers[r][c]!==null){
            const adj=countAdjacentTri(r,c);
            if(adj>puzzle.numbers[r][c]) hasConflict=true;
          }
      if(hasConflict) playError();

      if(isSolved()) triggerSolve();
    },{passive:false});

    ctx.listen(canvas,'touchmove',(e)=>{e.preventDefault();},{passive:false});

    function formatTime(ms){
      const s=Math.floor(ms/1000),m=Math.floor(s/60);
      return `${m}:${String(s%60).padStart(2,'0')}`;
    }

    ctx.raf((dt)=>{
      if(timerActive) elapsed=Date.now()-startTime;

      for(let r=0;r<GRID;r++)
        for(let c=0;c<GRID;c++){
          if(animT[r][c]<1) animT[r][c]=Math.min(1,animT[r][c]+dt/120);
          if(ripple[r][c]>0) ripple[r][c]=Math.max(0,ripple[r][c]-dt/480);
        }

      for(const gr of glowRects) gr.t=Math.max(0,gr.t-dt/400);
      glowRects=glowRects.filter(gr=>gr.t>0);

      if(showOverlay&&overlayAlpha<1) overlayAlpha=Math.min(1,overlayAlpha+dt/300);

      const {cs,offX,offY}=getLayout();
      const pad=Math.max(1,Math.floor(cs*0.04));
      const size=cs-pad*2;

      g.fillStyle=BG;
      g.fillRect(0,0,W,H);

      // Title
      g.fillStyle=ACCENT;
      g.font=`bold ${Math.floor(cs*0.42)}px -apple-system, sans-serif`;
      g.textAlign='center';g.textBaseline='middle';
      g.fillText('SHAKASHAKA',W/2,28);

      g.fillStyle='#666';
      g.font=`${Math.floor(cs*0.34)}px -apple-system, sans-serif`;
      g.fillText(formatTime(elapsed),W/2,50);

      if(bestTime>0){
        g.fillStyle='#444';
        g.textAlign='right';
        g.font=`${Math.floor(cs*0.27)}px -apple-system, sans-serif`;
        g.fillText(`Best: ${formatTime(bestTime)}`,W-16,50);
      }
      g.fillStyle='#333';
      g.textAlign='left';
      g.font=`${Math.floor(cs*0.27)}px -apple-system, sans-serif`;
      g.fillText('',16,50);

      // Draw cells
      for(let r=0;r<GRID;r++){
        for(let c=0;c<GRID;c++){
          const cx=offX+c*cs, cy=offY+r*cs;
          const x=cx+pad, y=cy+pad;
          const rip=ripple[r][c];
          const t=animT[r][c];
          const state=cells[r][c];
          const isBlack=puzzle.black[r][c];
          const clue=puzzle.numbers[r][c];

          if(isBlack){
            // Black cell
            g.fillStyle=BLACK_CELL_COLOR;
            g.fillRect(cx,cy,cs,cs);

            if(clue!==null){
              const adj=countAdjacentTri(r,c);
              const conflict=adj!==clue;
              g.font=`bold ${Math.floor(size*0.52)}px -apple-system, sans-serif`;
              g.textAlign='center';g.textBaseline='middle';
              g.fillStyle=conflict?'#ff6b6b':ACCENT;
              g.fillText(String(clue),cx+cs/2,cy+cs/2);
            }
          } else {
            // White/triangle cell
            g.fillStyle=WHITE_CELL_COLOR;
            g.fillRect(cx,cy,cs,cs);

            if(state!==0){
              // Ease-out-back scale effect
              const ease = t < 1 ? (1 + 1.7*(t-1)*(t-1)*(t-1) + 1.7*(t-1)*(t-1)) : 1;
              const sc = 0.5 + 0.5*ease;

              g.save();
              g.translate(cx+cs/2,cy+cs/2);
              g.scale(sc,sc);

              // Draw triangle
              drawTriangle(g,-(size/2),-(size/2),size,state,TRI_COLOR);

              // Subtle inner edge
              g.strokeStyle=TRI_SHADOW;
              g.lineWidth=1;
              g.globalAlpha=0.4;
              g.beginPath();
              if(state===1){g.moveTo(-size/2,-size/2);g.lineTo(size/2,-size/2);g.lineTo(-size/2,size/2);}
              else if(state===2){g.moveTo(-size/2,-size/2);g.lineTo(size/2,-size/2);g.lineTo(size/2,size/2);}
              else if(state===3){g.moveTo(size/2,-size/2);g.lineTo(size/2,size/2);g.lineTo(-size/2,size/2);}
              else{g.moveTo(-size/2,-size/2);g.lineTo(size/2,size/2);g.lineTo(-size/2,size/2);}
              g.closePath();
              g.stroke();
              g.globalAlpha=1;

              g.restore();
            }

            if(rip>0){
              g.globalAlpha=rip*0.45;
              g.fillStyle=ACCENT;
              g.fillRect(cx,cy,cs,cs);
              g.globalAlpha=1;
            }
          }

          // Grid lines
          g.strokeStyle='#1e2a2a';
          g.lineWidth=0.8;
          g.strokeRect(cx,cy,cs,cs);
        }
      }

      // Number conflict highlight
      for(let r=0;r<GRID;r++)
        for(let c=0;c<GRID;c++)
          if(puzzle.numbers[r][c]!==null){
            const adj=countAdjacentTri(r,c);
            if(adj>puzzle.numbers[r][c]){
              const cx=offX+c*cs,cy=offY+r*cs;
              g.strokeStyle='#ff4444';
              g.lineWidth=2.5;
              g.globalAlpha=0.8;
              g.strokeRect(cx+1,cy+1,cs-2,cs-2);
              g.globalAlpha=1;
            }
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

      // See Solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI*2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      if (showSolution) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, USABLE_H - 48, W, 48);
        g.fillStyle = ACCENT;
        g.font = 'bold 15px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TAP ANYWHERE FOR NEW PUZZLE', W / 2, USABLE_H - 24);
      }

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
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('SHAKASHAKA', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty = cy2 + 80;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty); ty += lh;

        const rules = [
          '• Some cells are black — numbers show adjacent triangle count',
          '• Fill white cells with right-angle triangles or leave them empty',
          '• The remaining white space must form perfect rectangles',
          '• All number clues must be satisfied',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty); ty += lh; }

        ty += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty); ty += lh;

        const controls = [
          'Tap → cycle triangle orientation (↖ ↗ ↘ ↙) or empty',
          'Black cells with numbers count adjacent triangles',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of controls) { g.fillText(line, lx, ty); ty += lh; }

        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      if(showOverlay){
        g.globalAlpha=overlayAlpha*0.88;
        g.fillStyle=BG;
        g.fillRect(0,0,W,H);
        g.globalAlpha=overlayAlpha;

        const big=Math.floor(W*0.1);
        g.font=`bold ${big}px -apple-system, sans-serif`;
        g.textAlign='center';g.textBaseline='middle';
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
