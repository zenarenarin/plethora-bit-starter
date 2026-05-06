// GOKIGEN NANAME — Diagonal slant puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Gokigen',
    author: 'plethora',
    description: "Fill every cell with / or \\ — no closed loops.",
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FFB703';
    const ACCENT_DIM = '#8B6400';
    const BG = '#0f0f14';
    const CARD_BG = '#1a1a2e';
    const ERROR_COL = '#FF4D6D';
    const COLS = 6, ROWS = 6;

    function generatePuzzle(N) {
      N = N || 6;
      const parent = Array.from({length:(N+1)*(N+1)}, function(_,i){ return i; });
      function find(x) { while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];} return x; }
      function union(a,b) { a=find(a);b=find(b); if(a===b) return false; parent[a]=b; return true; }
      function id(r,c) { return r*(N+1)+c; }

      const sol = Array.from({length:N}, function(){ return new Array(N).fill(0); });
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const options = Math.random() < 0.5 ? [1,2] : [2,1];
          let placed = false;
          for (let oi = 0; oi < options.length; oi++) {
            const v = options[oi];
            const a = v===1 ? id(r+1,c) : id(r,c);
            const b = v===1 ? id(r,c+1) : id(r+1,c+1);
            if (find(a) !== find(b)) {
              union(a,b);
              sol[r][c] = v;
              placed = true;
              break;
            }
          }
          if (!placed) {
            // both create cycle; pick first option anyway (allow cycle, fallback)
            const v = options[0];
            const a = v===1 ? id(r+1,c) : id(r,c);
            const b = v===1 ? id(r,c+1) : id(r+1,c+1);
            union(a,b);
            sol[r][c] = v;
          }
        }
      }

      // Compute corner clues: show ~35% of corners
      const corners = Array.from({length:N+1}, function(){ return new Array(N+1).fill(null); });
      for (let r = 0; r <= N; r++) {
        for (let c = 0; c <= N; c++) {
          if (Math.random() > 0.35) continue;
          let count = 0;
          // cell (r,c) below-right: \ touches top-left corner (r,c)
          if (r<N && c<N && sol[r][c]===2) count++;
          // cell (r,c-1) below-left: / touches top-right corner = (r,c)
          if (r<N && c>0 && sol[r][c-1]===1) count++;
          // cell (r-1,c) above-right: / touches bottom-left corner = (r,c)
          if (r>0 && c<N && sol[r-1][c]===1) count++;
          // cell (r-1,c-1) above-left: \ touches bottom-right corner = (r,c)
          if (r>0 && c>0 && sol[r-1][c-1]===2) count++;
          corners[r][c] = count;
        }
      }
      return { solution: sol, cornerNums: corners };
    }

    let currentPuzzle = generatePuzzle(ROWS);
    // grid[r][c]: 0=empty, 1=forward(/), 2=back(\)
    let grid;
    let cellAnims = []; // [{r,c,t,maxT}]
    let showInfo = false;
    let showSolution = false;
    let solved = false;
    let solveTime = 0;
    let timer = 0;
    let timerActive = false;
    let solveGlow = 0, solveGlowDir = 1;
    let gameStarted = false;

    const IBTN = { x: W - 22, y: 8, r: 14 };
    // Solution button — center at (W-22, 62), well below info button (center at 22)
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    const BT_KEY = 'bt_gokigen';
    let bestTime = ctx.storage.get(BT_KEY) || 0;

    // Union-Find for loop detection
    function makeUF(n) {
      const parent = Array.from({length:n},function(_,i){return i;});
      const rank = new Array(n).fill(0);
      function find(x) { while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x; }
      function union(a,b) {
        a=find(a); b=find(b);
        if(a===b) return false;
        if(rank[a]<rank[b]){var t=a;a=b;b=t;}
        parent[b]=a; if(rank[a]===rank[b]) rank[a]++;
        return true;
      }
      return {find,union};
    }

    function nodeId(r, c) { return r * (COLS + 1) + c; }

    function hasCycle() {
      const N = (ROWS + 1) * (COLS + 1);
      const uf = makeUF(N);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = grid[r][c];
          if (v === 0) continue;
          let n1, n2;
          if (v === 1) {
            n1 = nodeId(r + 1, c);
            n2 = nodeId(r, c + 1);
          } else {
            n1 = nodeId(r, c);
            n2 = nodeId(r + 1, c + 1);
          }
          if (!uf.union(n1, n2)) return true;
        }
      }
      return false;
    }

    function cornerCount(r, c) {
      let cnt = 0;
      if (r > 0 && c > 0 && grid[r-1][c-1] === 2) cnt++;
      if (r > 0 && c < COLS && grid[r-1][c] === 1) cnt++;
      if (r < ROWS && c > 0 && grid[r][c-1] === 1) cnt++;
      if (r < ROWS && c < COLS && grid[r][c] === 2) cnt++;
      return cnt;
    }

    function isCornerConflict(r, c) {
      const cn = currentPuzzle.cornerNums[r][c];
      if (cn === null) return false;
      return cornerCount(r, c) > cn;
    }

    function isCornerSatisfied(r, c) {
      const cn = currentPuzzle.cornerNums[r][c];
      if (cn === null) return true;
      return cornerCount(r, c) === cn;
    }

    function validateAll() {
      if (hasCycle()) return false;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (grid[r][c] === 0) return false;
      for (let r = 0; r <= ROWS; r++)
        for (let c = 0; c <= COLS; c++)
          if (!isCornerSatisfied(r, c)) return false;
      return true;
    }

    // Audio
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playClick() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = 'triangle'; o.frequency.value = 750;
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      o.start(); o.stop(audioCtx.currentTime + 0.05);
    }
    function playBuzz() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = 'sawtooth'; o.frequency.value = 90;
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      o.start(); o.stop(audioCtx.currentTime + 0.12);
    }
    function playArpeggio() {
      if (!audioCtx) return;
      [349, 440, 523, 659, 784, 1047].forEach((f, i) => {
        ctx.timeout(() => {
          const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
          o.connect(gain); gain.connect(audioCtx.destination);
          o.type = 'sine'; o.frequency.value = f;
          gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
          o.start(); o.stop(audioCtx.currentTime + 0.2);
        }, i * 90);
      });
    }

    // Layout
    const PAD = 32;
    const TOP_HUD = 60;
    const CORNER_PAD = 18;
    const AVAILABLE_W = W - PAD * 2 - CORNER_PAD * 2;
    const AVAILABLE_H = USABLE_H - TOP_HUD - PAD * 2 - CORNER_PAD * 2;
    const CELL = Math.min(AVAILABLE_W / COLS, AVAILABLE_H / ROWS);
    const GRID_X = (W - CELL * COLS) / 2;
    const GRID_Y = TOP_HUD + CORNER_PAD + (USABLE_H - TOP_HUD - CORNER_PAD * 2 - CELL * ROWS) / 2;

    function cellCenter(r, c) {
      return { x: GRID_X + (c + 0.5) * CELL, y: GRID_Y + (r + 0.5) * CELL };
    }
    function cornerXY(r, c) {
      return { x: GRID_X + c * CELL, y: GRID_Y + r * CELL };
    }
    function hitCell(px, py) {
      const c = Math.floor((px - GRID_X) / CELL);
      const r = Math.floor((py - GRID_Y) / CELL);
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return {r, c};
      return null;
    }

    function initPuzzle() {
      grid = Array.from({length:ROWS}, () => new Array(COLS).fill(0));
      cellAnims = [];
      solved = false; timer = 0; timerActive = false;
      showSolution = false;
    }

    function applySolution() {
      const sol = currentPuzzle.solution;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          grid[r][c] = sol[r][c];
      cellAnims = [];
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    }

    function drawInfoPanel() {
      g.fillStyle = 'rgba(0,0,0,0.88)';
      g.fillRect(0, 0, W, H);
      const cw = Math.floor(W * 0.82);
      const cx2 = Math.floor((W - cw) / 2);
      const ch = Math.min(Math.floor(USABLE_H * 0.72), 460);
      const cy2 = Math.floor((USABLE_H - ch) / 2);
      g.fillStyle = '#1a1a2e';
      g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
      g.fill();
      g.strokeStyle = ACCENT; g.lineWidth = 1.5;
      g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
      g.stroke();

      const cx = W / 2;
      g.fillStyle = ACCENT;
      g.font = `bold 24px -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('GOKIGEN', cx, cy2 + 40);

      const rules = [
        '· Fill every cell with / or \\',
        '· Corner numbers show how many diagonals meet there',
        '· No closed loops may form in the diagonal network',
        '· Tap a cell to toggle between / and \\',
        '· Long-press to clear a cell',
      ];
      g.fillStyle = '#ccd6f6';
      g.font = `14px -apple-system, sans-serif`;
      g.textAlign = 'left';
      rules.forEach((r, i) => g.fillText(r, cx2 + 20, cy2 + 86 + i * 38));

      if (bestTime > 0) {
        g.fillStyle = '#ffb703';
        g.font = `13px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.fillText(`Best: ${formatTime(bestTime)}`, cx, cy2 + ch - 48);
      }

      g.font = 'bold 13px -apple-system, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.textAlign = 'center';
      g.fillText('TAP ANYWHERE TO CLOSE', cx, cy2 + ch - 20);
    }

    function drawSolveOverlay() {
      g.fillStyle='rgba(0,0,0,0.72)'; g.fillRect(0,0,W,USABLE_H);
      const cx=W/2, cy=USABLE_H/2;
      g.shadowColor=ACCENT; g.shadowBlur=32;
      g.fillStyle=ACCENT; g.font=`bold 36px -apple-system,sans-serif`;
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText('SOLVED!', cx, cy-36);
      g.shadowBlur=0;
      g.fillStyle='#ccd6f6'; g.font=`20px -apple-system,sans-serif`;
      g.fillText(formatTime(solveTime), cx, cy+10);
      if (bestTime>0&&solveTime===bestTime) {
        g.fillStyle='#FFD700'; g.font=`bold 16px -apple-system,sans-serif`;
        g.fillText('NEW BEST!', cx, cy+42);
      }
      g.fillStyle=ACCENT; g.font=`bold 17px -apple-system,sans-serif`;
      g.fillText('TAP TO PLAY AGAIN', cx, cy+82);
    }

    function drawHUD() {
      g.fillStyle='#ccd6f6'; g.font=`bold 18px -apple-system,sans-serif`;
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText(timerActive?formatTime(timer):'0:00', W/2, 32);
      g.fillStyle=ACCENT; g.font=`bold 13px -apple-system,sans-serif`;
      g.textAlign='left'; g.fillText('GOKIGEN', 16, 32);
      if (bestTime>0) {
        g.fillStyle='#ffb703'; g.font=`12px -apple-system,sans-serif`;
        g.textAlign='right'; g.fillText(`Best ${formatTime(bestTime)}`, W-50, 32);
      }
    }

    function findCycleCells() {
      const N = (ROWS+1)*(COLS+1);
      const adj = Array.from({length:N},()=>[]);
      for (let r=0;r<ROWS;r++) {
        for (let c=0;c<COLS;c++) {
          const v=grid[r][c];
          if (v===0) continue;
          let n1,n2;
          if (v===1) { n1=nodeId(r+1,c); n2=nodeId(r,c+1); }
          else { n1=nodeId(r,c); n2=nodeId(r+1,c+1); }
          adj[n1].push({to:n2,r,c});
          adj[n2].push({to:n1,r,c});
        }
      }
      const visited=new Set(), inStack=new Set();
      const cycleCells=new Set();
      function dfs(node, parent) {
        visited.add(node); inStack.add(node);
        for (const {to,r,c} of adj[node]) {
          if (to===parent) continue;
          if (inStack.has(to)) { cycleCells.add(`${r},${c}`); continue; }
          if (!visited.has(to)) dfs(to,node);
        }
        inStack.delete(node);
      }
      for (let i=0;i<N;i++) if (!visited.has(i)) dfs(i,-1);
      return cycleCells;
    }

    function drawGrid() {
      const p = currentPuzzle;
      const cycleCells = hasCycle() ? findCycleCells() : new Set();
      const glowAmt = solved ? solveGlow : 0;

      for (let r=0;r<ROWS;r++) {
        for (let c=0;c<COLS;c++) {
          const cx2=GRID_X+c*CELL, cy2=GRID_Y+r*CELL;
          const isCycle = cycleCells.has(`${r},${c}`);
          g.fillStyle = isCycle ? 'rgba(255,77,109,0.12)' : '#141420';
          g.fillRect(cx2+1,cy2+1,CELL-2,CELL-2);
        }
      }

      g.strokeStyle='rgba(255,255,255,0.06)'; g.lineWidth=1;
      for (let r=0;r<=ROWS;r++) {
        g.beginPath(); g.moveTo(GRID_X,GRID_Y+r*CELL); g.lineTo(GRID_X+COLS*CELL,GRID_Y+r*CELL); g.stroke();
      }
      for (let c=0;c<=COLS;c++) {
        g.beginPath(); g.moveTo(GRID_X+c*CELL,GRID_Y); g.lineTo(GRID_X+c*CELL,GRID_Y+ROWS*CELL); g.stroke();
      }

      if (glowAmt>0) { g.shadowColor=ACCENT; g.shadowBlur=glowAmt; }
      g.lineCap='round'; g.lineWidth=3;

      for (let r=0;r<ROWS;r++) {
        for (let c=0;c<COLS;c++) {
          const v=grid[r][c];
          if (v===0) continue;
          const isCycle = cycleCells.has(`${r},${c}`);
          const anim = cellAnims.find(a=>a.r===r&&a.c===c);
          const prog = anim ? Math.min(1,anim.t/anim.maxT) : 1;

          const x1 = GRID_X + c*CELL + 6;
          const y1 = GRID_Y + r*CELL + 6;
          const x2 = GRID_X + (c+1)*CELL - 6;
          const y2 = GRID_Y + (r+1)*CELL - 6;

          g.strokeStyle = isCycle ? ERROR_COL : ACCENT;

          if (v===1) {
            const sx=x1, sy=y2, ex=x2, ey=y1;
            g.beginPath();
            g.moveTo(sx,sy);
            g.lineTo(sx+(ex-sx)*prog, sy+(ey-sy)*prog);
            g.stroke();
          } else {
            g.beginPath();
            g.moveTo(x1,y1);
            g.lineTo(x1+(x2-x1)*prog, y1+(y2-y1)*prog);
            g.stroke();
          }
        }
      }
      g.shadowBlur=0;

      for (let r=0;r<=ROWS;r++) {
        for (let c=0;c<=COLS;c++) {
          const cn=p.cornerNums[r][c];
          if (cn===null) {
            const {x,y}=cornerXY(r,c);
            g.beginPath(); g.arc(x,y,2.5,0,Math.PI*2);
            g.fillStyle='rgba(255,255,255,0.25)'; g.fill();
            continue;
          }
          const {x,y}=cornerXY(r,c);
          const conflict=isCornerConflict(r,c);
          const actual=cornerCount(r,c);
          g.beginPath(); g.arc(x,y,8,0,Math.PI*2);
          g.fillStyle=conflict?'rgba(255,77,109,0.3)':actual>0?'rgba(255,183,3,0.2)':'rgba(255,255,255,0.06)';
          g.fill();
          g.strokeStyle=conflict?ERROR_COL:ACCENT; g.lineWidth=1.5; g.stroke();
          g.font=`bold 11px -apple-system,sans-serif`;
          g.textAlign='center'; g.textBaseline='middle';
          g.fillStyle=conflict?ERROR_COL:actual===cn?ACCENT:'#ccd6f6';
          g.fillText(String(cn),x,y);
        }
      }
    }

    let touchDownCell = null;
    let longTimer = null;

    ctx.raf((dt) => {
      g.fillStyle=BG; g.fillRect(0,0,W,H);
      if (timerActive&&!solved) timer+=dt;
      cellAnims=cellAnims.filter(a=>{a.t+=dt;return a.t<a.maxT*2;});
      if (solved) {
        solveGlow+=dt*0.05*solveGlowDir;
        if (solveGlow>24) solveGlowDir=-1;
        if (solveGlow<0) {solveGlow=0;solveGlowDir=1;}
      }
      drawHUD(); drawGrid();
      if (solved) drawSolveOverlay();

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

      // Solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI*2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      if (showInfo) drawInfoPanel();
    });

    ctx.listen(canvas,'touchstart',(e)=>{
      e.preventDefault(); ensureAudio();
      const t=e.changedTouches[0];
      const tx=t.clientX, ty=t.clientY;

      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // Solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        applySolution();
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        currentPuzzle = generatePuzzle(ROWS);
        initPuzzle();
        return;
      }

      if (solved) {
        currentPuzzle = generatePuzzle(ROWS);
        initPuzzle();
        timerActive = true;
        return;
      }
      const cell=hitCell(tx,ty);
      if (!cell) return;
      touchDownCell=cell;
      longTimer=ctx.timeout(()=>{
        if (grid[cell.r][cell.c]!==0) {
          grid[cell.r][cell.c]=0;
          ctx.platform.haptic('light');
          playClick();
        }
        touchDownCell=null;
      },400);
    },{passive:false});

    ctx.listen(canvas,'touchend',(e)=>{
      e.preventDefault();
      if (solved) {touchDownCell=null;return;}
      if (longTimer) {longTimer=null;}
      if (!touchDownCell) return;
      const {r,c}=touchDownCell;
      touchDownCell=null;

      const prev=grid[r][c];
      if (prev===0) grid[r][c]=1;
      else if (prev===1) grid[r][c]=2;
      else grid[r][c]=1;

      cellAnims=cellAnims.filter(a=>!(a.r===r&&a.c===c));
      cellAnims.push({r,c,t:0,maxT:80});
      playClick();
      if (!gameStarted) { gameStarted = true; ctx.platform.start(); }
      if (!timerActive) timerActive=true;

      if (hasCycle()) { playBuzz(); }

      if (validateAll()) {
        solved=true; timerActive=false; solveTime=timer;
        if (!bestTime||timer<bestTime) { bestTime=timer; ctx.storage.set(BT_KEY,bestTime); }
        ctx.platform.setScore(Math.floor(300000/Math.max(timer,1000)));
        ctx.platform.complete({score:Math.floor(300000/Math.max(timer,1000)),durationMs:timer});
        playArpeggio();
      }
    },{passive:false});

    ctx.listen(canvas,'touchmove',(e)=>{e.preventDefault();},{passive:false});

    initPuzzle();
    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
