window.plethoraBit = {
  meta: {
    title: 'Aqre',
    author: 'plethora',
    description: 'Shade cells — no four in a row, regions have equal shading.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const ACCENT = '#fd79a8';
    const BG = '#110a0e';
    const CELL_BG = '#1e1218';
    const SHADED_BASE = '#7d1a3a';
    const SHADED_TOP = '#fd79a8';

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const USABLE_H = H - SAFE;

    function generatePuzzle(size) {
      size = size || 6;
      const numRegions = 4 + Math.floor(Math.random() * 3); // 4–6
      const regionId = Array.from({ length: size }, () => Array(size).fill(-1));
      const regionCells2 = Array.from({ length: numRegions }, () => []);

      // Random seeds
      const taken = new Set();
      for (let i = 0; i < numRegions; i++) {
        let r, c, tries = 0;
        do {
          r = Math.floor(Math.random() * size);
          c = Math.floor(Math.random() * size);
          tries++;
        } while (taken.has(r + ',' + c) && tries < 100);
        taken.add(r + ',' + c);
        regionId[r][c] = i;
        regionCells2[i].push([r, c]);
      }

      // BFS expansion
      let changed = true;
      while (changed) {
        changed = false;
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
          if (regionId[r][c] >= 0) continue;
          for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && regionId[nr][nc] >= 0) {
              regionId[r][c] = regionId[nr][nc];
              regionCells2[regionId[nr][nc]].push([r, c]);
              changed = true; break;
            }
          }
        }
      }

      // For each region, shade a random subset (no 4 in a row/col)
      const sol = Array.from({ length: size }, () => Array(size).fill(0));
      const regionShadeCount = [];

      for (let i = 0; i < numRegions; i++) {
        const cells2 = regionCells2[i];
        const target = Math.max(1, Math.floor(cells2.length * 0.4));
        const shuffled = cells2.slice().sort(() => Math.random() - 0.5);
        let shaded = 0;
        for (const [r, c] of shuffled) {
          if (shaded >= target) break;
          sol[r][c] = 1; shaded++;
          // Check no 4 in a row/col
          let bad = false;
          for (const [dr, dc] of [[0, 1], [1, 0]]) {
            let run = 1;
            for (const s of [-1, -2, -3]) {
              const nr = r + dr * s, nc = c + dc * s;
              if (nr >= 0 && nr < size && nc >= 0 && nc < size && sol[nr][nc]) run++;
              else break;
            }
            for (const s of [1, 2, 3]) {
              const nr = r + dr * s, nc = c + dc * s;
              if (nr >= 0 && nr < size && nc >= 0 && nc < size && sol[nr][nc]) run++;
              else break;
            }
            if (run >= 4) bad = true;
          }
          if (bad) { sol[r][c] = 0; shaded--; }
        }
        regionShadeCount.push(shaded);
      }

      // Build regionCounts object
      const regionCounts = {};
      for (let i = 0; i < numRegions; i++) regionCounts[i] = regionShadeCount[i];

      return { size, regions: regionId, regionCounts, solution: sol.map(row => row.slice()) };
    }

    let showInfo = false;
    let showSolution = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    let currentPuzzle = generatePuzzle(6);
    let GRID = 6;
    let cells = [];
    let dots = [];
    let animT = [];
    let animTarget = [];
    let ripple = [];
    let flashCells = {};
    let solved = false;
    let showOverlay = false;
    let overlayAlpha = 0;
    let timerActive = false;
    let elapsed = 0;
    let startTime = 0;
    let firstTouch = false;
    let bestTime = ctx.storage.get('bt_aqre') || 0;
    let longPressTimer = null;
    let longPressCell = null;
    let audioCtx = null;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playTap() {
      if (!audioCtx) return;
      const o=audioCtx.createOscillator(), gn=audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value=440; o.type='sine';
      gn.gain.setValueAtTime(0.1,audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.07);
      o.start(); o.stop(audioCtx.currentTime+0.07);
    }

    function playError() {
      if (!audioCtx) return;
      const o=audioCtx.createOscillator(), gn=audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.frequency.value=100; o.type='sawtooth';
      gn.gain.setValueAtTime(0.15,audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.09);
      o.start(); o.stop(audioCtx.currentTime+0.09);
    }

    function playSolve() {
      if (!audioCtx) return;
      [523,659,784,1047].forEach((freq,i)=>{
        const o=audioCtx.createOscillator(), gn=audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.frequency.value=freq; o.type='sine';
        const t=audioCtx.currentTime+i*0.11;
        gn.gain.setValueAtTime(0,t);
        gn.gain.linearRampToValueAtTime(0.18,t+0.02);
        gn.gain.exponentialRampToValueAtTime(0.001,t+0.32);
        o.start(t); o.stop(t+0.32);
      });
    }

    function initPuzzle() {
      GRID=currentPuzzle.size;
      cells=Array.from({length:GRID},()=>Array(GRID).fill(0));
      dots=Array.from({length:GRID},()=>Array(GRID).fill(false));
      animT=Array.from({length:GRID},()=>Array(GRID).fill(0));
      animTarget=Array.from({length:GRID},()=>Array(GRID).fill(0));
      ripple=Array.from({length:GRID},()=>Array(GRID).fill(0));
      flashCells={};
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

    function drawRR(g2,x,y,w,h,r) {
      g2.beginPath();
      if (g2.roundRect){g2.roundRect(x,y,w,h,r);return;}
      g2.moveTo(x+r,y);g2.lineTo(x+w-r,y);g2.arcTo(x+w,y,x+w,y+r,r);
      g2.lineTo(x+w,y+h-r);g2.arcTo(x+w,y+h,x+w-r,y+h,r);
      g2.lineTo(x+r,y+h);g2.arcTo(x,y+h,x,y+h-r,r);
      g2.lineTo(x,y+r);g2.arcTo(x,y,x+r,y,r);g2.closePath();
    }

    function check4InRow(state) {
      const bad = new Set();
      // Horizontal
      for (let r=0;r<GRID;r++) {
        let run=0, start=0;
        for (let c=0;c<=GRID;c++) {
          if (c<GRID&&state[r][c]===1) {
            run++;
          } else {
            if (run>=4) for(let k=start;k<c;k++) bad.add(`${r},${k}`);
            run=1; start=c;
          }
        }
      }
      // Vertical
      for (let c=0;c<GRID;c++) {
        let run=0, start=0;
        for (let r=0;r<=GRID;r++) {
          if (r<GRID&&state[r][c]===1) {
            run++;
          } else {
            if (run>=4) for(let k=start;k<r;k++) bad.add(`${k},${c}`);
            run=1; start=r;
          }
        }
      }
      return bad;
    }

    function getRegionCounts(state) {
      const counts={};
      for (let r=0;r<GRID;r++)
        for (let c=0;c<GRID;c++) {
          const id=currentPuzzle.regions[r][c];
          if (!counts[id]) counts[id]=0;
          if (state[r][c]===1) counts[id]++;
        }
      return counts;
    }

    // Find top-left cell of each region (for label placement)
    function getRegionTopLeft() {
      const tl={};
      for (let r=0;r<GRID;r++)
        for (let c=0;c<GRID;c++) {
          const id=currentPuzzle.regions[r][c];
          if (!tl[id]) tl[id]=[r,c];
        }
      return tl;
    }

    function checkConnected(state) {
      const shaded=[];
      for (let r=0;r<GRID;r++)
        for (let c=0;c<GRID;c++)
          if (state[r][c]===1) shaded.push([r,c]);
      if (shaded.length===0) return true;
      const vis=new Set([`${shaded[0][0]},${shaded[0][1]}`]);
      const q=[shaded[0]];
      while(q.length) {
        const [r,c]=q.shift();
        for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr=r+dr,nc=c+dc;
          const k=`${nr},${nc}`;
          if(nr>=0&&nr<GRID&&nc>=0&&nc<GRID&&state[nr][nc]===1&&!vis.has(k)) {
            vis.add(k); q.push([nr,nc]);
          }
        }
      }
      return vis.size===shaded.length;
    }

    function isSolved() {
      return currentPuzzle.solution.every((row,r)=>row.every((v,c)=>v===cells[r][c]));
    }

    function triggerSolve() {
      solved=true;
      timerActive=false;
      playSolve();
      const cr=Math.floor(GRID/2),cc=Math.floor(GRID/2);
      for(let r=0;r<GRID;r++)
        for(let c=0;c<GRID;c++) {
          const d=Math.abs(r-cr)+Math.abs(c-cc);
          ctx.timeout(()=>{ripple[r][c]=1.0;},d*55);
        }
      ctx.timeout(()=>{showOverlay=true;},GRID*55+400);
      if(bestTime===0||elapsed<bestTime){
        bestTime=elapsed;
        ctx.storage.set('bt_aqre',bestTime);
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

      if(showOverlay){
        currentPuzzle = generatePuzzle(6);
        initPuzzle();
        return;
      }

      const touch=e.changedTouches[0];
      const {cs,offX,offY}=getLayout();
      const col=Math.floor((touch.clientX-offX)/cs);
      const row=Math.floor((touch.clientY-offY)/cs);
      if(row<0||row>=GRID||col<0||col>=GRID) return;

      if(!firstTouch){
        firstTouch=true;
        timerActive=true;
        startTime=Date.now();
        ctx.platform.start();
      }

      longPressCell=[row,col];
      longPressTimer=ctx.timeout(()=>{
        if(longPressCell){
          const[lr,lc]=longPressCell;
          dots[lr][lc]=!dots[lr][lc];
          if(dots[lr][lc]) cells[lr][lc]=0;
          ctx.platform.haptic('light');
        }
        longPressCell=null;
      },400);
    },{passive:false});

    ctx.listen(canvas,'touchend',(e)=>{
      e.preventDefault();
      if(!longPressCell) return;
      clearTimeout(longPressTimer);
      const[row,col]=longPressCell;
      longPressCell=null;

      if(solved||showOverlay) return;

      cells[row][col]=cells[row][col]?0:1;
      if(cells[row][col]) dots[row][col]=false;
      animTarget[row][col]=cells[row][col];
      playTap();
      ctx.platform.haptic('light');

      const bad4=check4InRow(cells);
      if(bad4.size>0) {
        playError();
        for(const k of bad4) flashCells[k]=300;
      }

      const regionCounts=getRegionCounts(cells);
      let overShaded=false;
      for(const[id,req]of Object.entries(currentPuzzle.regionCounts))
        if((regionCounts[id]||0)>req) overShaded=true;
      if(overShaded) playError();

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
          animT[r][c]+=(animTarget[r][c]-animT[r][c])*0.22;
          if(ripple[r][c]>0) ripple[r][c]=Math.max(0,ripple[r][c]-dt/480);
        }

      // Update flash timers
      for(const k of Object.keys(flashCells)){
        flashCells[k]-=dt;
        if(flashCells[k]<=0) delete flashCells[k];
      }

      if(showOverlay&&overlayAlpha<1) overlayAlpha=Math.min(1,overlayAlpha+dt/300);

      const {cs,offX,offY}=getLayout();
      const pad=Math.max(1,Math.floor(cs*0.05));
      const size=cs-pad*2;

      g.fillStyle=BG;
      g.fillRect(0,0,W,H);

      // Title
      g.fillStyle=ACCENT;
      g.font=`bold ${Math.floor(cs*0.48)}px -apple-system, sans-serif`;
      g.textAlign='center';g.textBaseline='middle';
      g.fillText('AQRE',W/2,28);

      g.fillStyle='#777';
      g.font=`${Math.floor(cs*0.36)}px -apple-system, sans-serif`;
      g.fillText(formatTime(elapsed),W/2,50);

      if(bestTime>0){
        g.fillStyle='#444';
        g.textAlign='right';
        g.font=`${Math.floor(cs*0.28)}px -apple-system, sans-serif`;
        g.fillText(`Best: ${formatTime(bestTime)}`,W-16,50);
      }

      const regionCounts=getRegionCounts(cells);
      const regionTL=getRegionTopLeft();
      const bad4=check4InRow(cells);

      // Region fills (subtle bg tint per region)
      const regionColors=['#1e1214','#1a1418','#16181e','#1a161e','#1e161a','#161e18','#181e16'];

      // Draw cells
      for(let r=0;r<GRID;r++){
        for(let c=0;c<GRID;c++){
          const x=offX+c*cs+pad,y=offY+r*cs+pad;
          const t=animT[r][c];
          const rip=ripple[r][c];
          const isShaded=cells[r][c]===1;
          const isDot=dots[r][c];
          const rid=currentPuzzle.regions[r][c];
          const isFlash=flashCells[`${r},${c}`]>0;
          const flashA=isFlash?(flashCells[`${r},${c}`]||0)/300:0;

          const scale=isShaded?0.78+0.22*t:1;
          g.save();
          g.translate(x+size/2,y+size/2);
          g.scale(scale,scale);

          if(isShaded){
            const grad=g.createLinearGradient(-size/2,-size/2,size/2,size/2);
            grad.addColorStop(0,SHADED_TOP+'88');
            grad.addColorStop(1,SHADED_BASE);
            g.fillStyle=grad;
            drawRR(g,-size/2,-size/2,size,size,5);
            g.fill();

            g.strokeStyle=ACCENT;
            g.lineWidth=1.5;
            g.globalAlpha=0.5+t*0.5;
            drawRR(g,-size/2,-size/2,size,size,5);
            g.stroke();
            g.globalAlpha=1;

            if(isFlash){
              g.globalAlpha=flashA*0.8;
              g.fillStyle='#ff4444';
              drawRR(g,-size/2,-size/2,size,size,5);
              g.fill();
              g.globalAlpha=1;
            }
          } else {
            g.fillStyle=regionColors[rid%regionColors.length];
            drawRR(g,-size/2,-size/2,size,size,5);
            g.fill();

            if(isDot){
              g.fillStyle=ACCENT+'80';
              g.beginPath();
              g.arc(0,0,size*0.1,0,Math.PI*2);
              g.fill();
            }
          }

          if(rip>0){
            g.globalAlpha=rip*0.5;
            g.fillStyle=ACCENT;
            drawRR(g,-size/2,-size/2,size,size,5);
            g.fill();
            g.globalAlpha=1;
          }

          g.restore();
        }
      }

      // Region borders & labels
      for(let r=0;r<GRID;r++){
        for(let c=0;c<GRID;c++){
          const rid=currentPuzzle.regions[r][c];
          // Right border
          if(c<GRID-1&&currentPuzzle.regions[r][c+1]!==rid){
            g.strokeStyle=ACCENT;
            g.lineWidth=2;
            g.globalAlpha=0.7;
            g.beginPath();
            g.moveTo(offX+(c+1)*cs,offY+r*cs+2);
            g.lineTo(offX+(c+1)*cs,offY+(r+1)*cs-2);
            g.stroke();
            g.globalAlpha=1;
          }
          // Bottom border
          if(r<GRID-1&&currentPuzzle.regions[r+1][c]!==rid){
            g.strokeStyle=ACCENT;
            g.lineWidth=2;
            g.globalAlpha=0.7;
            g.beginPath();
            g.moveTo(offX+c*cs+2,offY+(r+1)*cs);
            g.lineTo(offX+(c+1)*cs-2,offY+(r+1)*cs);
            g.stroke();
            g.globalAlpha=1;
          }
        }
      }

      // Region count labels in top-left of each region
      for(const[idStr,[tlr,tlc]]of Object.entries(regionTL)){
        const id=parseInt(idStr);
        const req=currentPuzzle.regionCounts[id];
        const cur=regionCounts[id]||0;
        const x=offX+tlc*cs, y=offY+tlr*cs;
        const over=cur>req;
        g.font=`bold ${Math.floor(cs*0.28)}px -apple-system, sans-serif`;
        g.textAlign='left';g.textBaseline='top';
        g.fillStyle=over?'#ff6b6b':ACCENT;
        g.fillText(`${cur}/${req}`,x+4,y+3);
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
        g.font = 'bold 28px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('AQRE', W / 2, cy2 + 52);

        const lx = cx2 + 20;
        let ty2 = cy2 + 80;
        const lh = 22;

        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty2); ty2 += lh;

        const rules = [
          '• Each region has a number — shade exactly that many cells in it',
          '• No 4 or more shaded cells in a row or column anywhere',
          '• All shaded cells across the grid form one connected group',
        ];
        g.font = '14px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty2); ty2 += lh; }

        ty2 += 8;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillText('CONTROLS', lx, ty2); ty2 += lh;

        const controls = [
          'Tap → toggle shade',
          'Long-press → dot (mark as unshaded)',
          'Watch the x/N counter on each region',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const line of controls) { g.fillText(line, lx, ty2); ty2 += lh; }

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

        const big=Math.floor(W*0.11);
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
