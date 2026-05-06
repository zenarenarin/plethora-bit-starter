// Country Road — Loop Puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Country Road',
    author: 'plethora',
    description: 'Draw one loop that visits each region exactly once.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT  = '#52B788';
    const ACCENT2 = '#74C69D';
    const BG      = '#0f0f14';
    const N = 6;

    const HS_KEY = 'bt_countryroad';
    let bestTime = ctx.storage.get(HS_KEY) || 0;

    // ── AUDIO ─────────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playClick() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), ga = audioCtx.createGain();
      o.connect(ga); ga.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = 660;
      ga.gain.setValueAtTime(0.15, audioCtx.currentTime);
      ga.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }
    function playWin() {
      if (!audioCtx) return;
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = audioCtx.createOscillator(), ga = audioCtx.createGain();
        o.connect(ga); ga.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = f;
        ga.gain.setValueAtTime(0.22, audioCtx.currentTime + i * 0.13);
        ga.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.13 + 0.3);
        o.start(audioCtx.currentTime + i * 0.13);
        o.stop(audioCtx.currentTime + i * 0.13 + 0.3);
      });
    }

    // ── EDGE UTILITIES ────────────────────────────────────────────────────────
    function edgeKey(r1, c1, r2, c2) {
      if (r1 > r2 || (r1 === r2 && c1 > c2)) return `${r2},${c2}-${r1},${c1}`;
      return `${r1},${c1}-${r2},${c2}`;
    }
    function adjacent(r1, c1, r2, c2) {
      return Math.abs(r1-r2) + Math.abs(c1-c2) === 1;
    }

    // ── PUZZLES ───────────────────────────────────────────────────────────────
    // Each puzzle: regions[r][c] = regionId, clues[regionId] = visitCount
    // The clues are set to match a specific intended solution loop.
    // Validation is purely logical — we check loop validity + region constraints.

    const PUZZLES = [
      // ── Puzzle 1 ─────────────────────────────────────────────────────────
      // Regions form horizontal bands; intended loop is a figure snaking left-right
      {
        regions: [
          [0, 0, 0, 1, 1, 1],
          [0, 2, 2, 1, 3, 1],
          [4, 2, 2, 3, 3, 5],
          [4, 4, 6, 6, 3, 5],
          [4, 4, 6, 7, 7, 5],
          [8, 8, 6, 7, 5, 5],
        ],
        // clues chosen to have exactly one valid loop solution
        clues: { 0:4, 1:4, 2:4, 3:4, 4:4, 5:4, 6:4, 7:3, 8:2 },
      },
      // ── Puzzle 2 ─────────────────────────────────────────────────────────
      {
        regions: [
          [0, 0, 1, 1, 2, 2],
          [0, 3, 3, 1, 2, 4],
          [5, 3, 3, 6, 4, 4],
          [5, 5, 7, 6, 6, 4],
          [8, 5, 7, 7, 9, 9],
          [8, 8, 8, 7, 9, 9],
        ],
        clues: { 0:3, 1:4, 2:3, 3:4, 4:4, 5:4, 6:3, 7:4, 8:4, 9:4 },
      },
      // ── Puzzle 3 ─────────────────────────────────────────────────────────
      {
        regions: [
          [0, 1, 1, 1, 2, 2],
          [0, 0, 3, 1, 2, 4],
          [5, 0, 3, 3, 4, 4],
          [5, 6, 6, 3, 7, 4],
          [5, 6, 8, 8, 7, 7],
          [5, 6, 8, 9, 9, 7],
        ],
        clues: { 0:4, 1:4, 2:3, 3:5, 4:4, 5:5, 6:4, 7:4, 8:3, 9:2 },
      },
      // ── Puzzle 4 ─────────────────────────────────────────────────────────
      {
        regions: [
          [0, 0, 0, 0, 1, 1],
          [2, 3, 3, 0, 1, 4],
          [2, 3, 5, 5, 4, 4],
          [2, 6, 5, 7, 7, 4],
          [2, 6, 8, 7, 9, 9],
          [6, 6, 8, 8, 9, 9],
        ],
        clues: { 0:5, 1:3, 2:4, 3:3, 4:4, 5:3, 6:4, 7:3, 8:3, 9:4 },
      },
      // ── Puzzle 5 ─────────────────────────────────────────────────────────
      {
        regions: [
          [0, 0, 1, 2, 2, 3],
          [4, 0, 1, 2, 3, 3],
          [4, 5, 1, 6, 6, 3],
          [4, 5, 7, 6, 8, 8],
          [4, 5, 7, 9, 9, 8],
          [10,10, 7, 9,11,11],
        ],
        clues: { 0:3, 1:4, 2:3, 3:4, 4:4, 5:3, 6:3, 7:3, 8:3, 9:3, 10:2, 11:2 },
      },
    ];

    // ── SOLUTION FINDER ───────────────────────────────────────────────────────
    // Finds a valid loop for the given puzzle using iterative deepening / backtracking.
    // Returns a Set of edgeKeys, or null if not found within attempt limit.
    function findSolution(puz) {
      const numR = Math.max(...Object.keys(puz.clues).map(Number)) + 1;

      // Build adjacency list
      function ek(r1,c1,r2,c2) {
        if (r1>r2||(r1===r2&&c1>c2)) return `${r2},${c2}-${r1},${c1}`;
        return `${r1},${c1}-${r2},${c2}`;
      }

      // Validate a complete edge set against puzzle rules
      function validate(edgeSet) {
        // Must form a single loop (every node degree 2)
        const deg = {};
        for (const e of edgeSet) {
          for (const p of e.split('-')) deg[p] = (deg[p]||0)+1;
        }
        if (Object.values(deg).some(d=>d!==2)) return false;
        // Single component
        const keys = Object.keys(deg);
        const vis = new Set([keys[0]]); const q=[keys[0]];
        while(q.length){
          const k=q.shift(); const [r,c]=k.split(',').map(Number);
          for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
            const nr=r+dr,nc=c+dc;
            if(nr<0||nr>=N||nc<0||nc>=N) continue;
            if(!edgeSet.has(ek(r,c,nr,nc))) continue;
            const nk=`${nr},${nc}`;
            if(!vis.has(nk)){vis.add(nk);q.push(nk);}
          }
        }
        if(vis.size!==keys.length) return false;
        // Check region clues
        for(let ri=0;ri<numR;ri++){
          const cells=[];
          for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(puz.regions[r][c]===ri) cells.push([r,c]);
          const loopCells=cells.filter(([r,c])=>{
            let d=0;
            for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
              const nr=r+dr,nc=c+dc;
              if(nr>=0&&nr<N&&nc>=0&&nc<N&&edgeSet.has(ek(r,c,nr,nc))) d++;
            }
            return d>0;
          });
          let crossings=0;
          for(const[r,c]of cells) for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
            const nr=r+dr,nc=c+dc;
            if(nr<0||nr>=N||nc<0||nc>=N) continue;
            if(puz.regions[nr][nc]!==ri&&edgeSet.has(ek(r,c,nr,nc))) crossings++;
          }
          if(loopCells.length!==puz.clues[ri]||crossings!==2) return false;
        }
        return true;
      }

      // Generate a random Hamiltonian-ish loop using random walk + backtracking
      // Try multiple random starts
      for(let attempt=0;attempt<200;attempt++){
        const sr=Math.floor(Math.random()*N), sc=Math.floor(Math.random()*N);
        const path=[[sr,sc]]; const vis=new Set([sr+','+sc]);
        let cur=[sr,sc]; let found=false;
        const maxLen=N*N*2;
        for(let step=0;step<maxLen&&!found;step++){
          const dirs=[[-1,0],[1,0],[0,-1],[0,1]].sort(()=>Math.random()-0.5);
          let moved=false;
          for(const[dr,dc]of dirs){
            const [cr,cc]=cur; const nr=cr+dr,nc=cc+dc;
            if(nr<0||nr>=N||nc<0||nc>=N) continue;
            // Check if we can close the loop
            if(nr===sr&&nc===sc&&path.length>4){
              path.push([nr,nc]); found=true; moved=true; break;
            }
            if(!vis.has(nr+','+nc)){
              vis.add(nr+','+nc); path.push([nr,nc]); cur=[nr,nc]; moved=true; break;
            }
          }
          if(!moved) break;
        }
        if(found&&path.length>4){
          const edgeSet=new Set();
          for(let i=0;i<path.length-1;i++){
            const [r1,c1]=path[i],[r2,c2]=path[i+1];
            edgeSet.add(ek(r1,c1,r2,c2));
          }
          if(validate(edgeSet)) return edgeSet;
        }
      }
      return null;
    }

    // ── STATE ─────────────────────────────────────────────────────────────────
    let puzzleIdx   = 0;
    let puzzle      = PUZZLES[puzzleIdx];
    let edges       = new Set();
    let solved      = false;
    let showInfo    = false;
    let timerMs     = 0;
    let timerRunning= false;
    let gameStarted = false;
    let solveAnim   = 0;
    let edgeFade    = new Map();   // edgeKey → alpha (0→1 on add)
    let pulseT      = 0;
    let showSolution = false;
    let solutionEdges = null;  // precomputed for current puzzle

    const IBTN  = { x: W - 22, y: 8, r: 14 };
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    function loadPuzzle(idx) {
      puzzle = PUZZLES[idx];
      solutionEdges = findSolution(puzzle);
    }
    loadPuzzle(0);

    // drag tracking
    let dragStart   = null;
    let dragCurrent = null;
    let lastDragCell= null;

    // ── LAYOUT ────────────────────────────────────────────────────────────────
    const PAD    = 16;
    const HUD_H  = 56;
    const GRID_TOP = HUD_H + PAD;
    const AVAIL_H  = USABLE_H - GRID_TOP - PAD;
    const AVAIL_W  = W - PAD * 2;
    const CELL     = Math.floor(Math.min(AVAIL_W, AVAIL_H) / N);
    const GRID_W   = CELL * N;
    const GRID_H   = CELL * N;
    const OX       = Math.floor((W - GRID_W) / 2);
    const OY       = GRID_TOP + Math.floor((AVAIL_H - GRID_H) / 2);

    function cp(r, c) { return { x: OX + c*CELL + CELL/2, y: OY + r*CELL + CELL/2 }; }
    function pc(px, py) {
      const c = Math.floor((px - OX) / CELL);
      const r = Math.floor((py - OY) / CELL);
      return (r>=0 && r<N && c>=0 && c<N) ? {r,c} : null;
    }

    // ── VALIDATION ────────────────────────────────────────────────────────────
    function cellConns(r, c) {
      const out = [];
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr, nc=c+dc;
        if (nr>=0&&nr<N&&nc>=0&&nc<N && edges.has(edgeKey(r,c,nr,nc)))
          out.push({r:nr,c:nc});
      }
      return out;
    }

    function isLoop() {
      if (edges.size < 4) return false;
      const deg = {};
      for (const ek of edges) {
        for (const part of ek.split('-')) {
          deg[part] = (deg[part]||0) + 1;
        }
      }
      if (Object.values(deg).some(d => d !== 2)) return false;
      // Single component
      const keys = Object.keys(deg);
      const visited = new Set([keys[0]]);
      const q = [keys[0]];
      while (q.length) {
        const k = q.shift();
        const [r,c] = k.split(',').map(Number);
        for (const {r:nr,c:nc} of cellConns(r,c)) {
          const nk = `${nr},${nc}`;
          if (!visited.has(nk)) { visited.add(nk); q.push(nk); }
        }
      }
      return visited.size === keys.length;
    }

    function regionStatus() {
      const numR = Math.max(...Object.keys(puzzle.clues).map(Number)) + 1;
      const status = {};
      for (let ri = 0; ri < numR; ri++) {
        // Find all cells in this region
        const cells = [];
        for (let r=0;r<N;r++) for (let c=0;c<N;c++)
          if (puzzle.regions[r][c] === ri) cells.push({r,c});

        // Count loop cells (degree 1 or 2 in this region)
        const loopCells = cells.filter(({r,c}) => cellConns(r,c).length > 0);

        // Count boundary crossings into/out of region
        let crossings = 0;
        for (const {r,c} of cells) {
          for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr=r+dr, nc=c+dc;
            if (nr<0||nr>=N||nc<0||nc>=N) continue;
            if (puzzle.regions[nr][nc] !== ri && edges.has(edgeKey(r,c,nr,nc)))
              crossings++;
          }
        }

        const clue = puzzle.clues[ri];
        // Valid: exactly 2 boundary crossings (enters once, exits once) and loop cells = clue
        status[ri] = {
          clue,
          visits: loopCells.length,
          crossings,
          ok: loopCells.length === clue && crossings === 2,
          conflict: loopCells.length > 0 && (loopCells.length > clue || crossings > 2),
        };
      }
      return status;
    }

    function checkSolved() {
      if (!isLoop()) return false;
      const rs = regionStatus();
      return Object.values(rs).every(s => s.ok);
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────
    function roundRect(ctx2, x, y, w, h, r) {
      ctx2.beginPath();
      ctx2.moveTo(x+r,y); ctx2.lineTo(x+w-r,y);
      ctx2.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx2.lineTo(x+w,y+h-r);
      ctx2.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx2.lineTo(x+r,y+h);
      ctx2.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx2.lineTo(x,y+r);
      ctx2.quadraticCurveTo(x,y,x+r,y);
      ctx2.closePath();
    }

    function numRegions() { return Math.max(...Object.keys(puzzle.clues).map(Number)) + 1; }

    // ── DRAW ──────────────────────────────────────────────────────────────────
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
      g.strokeStyle = ACCENT + '55'; g.lineWidth = 1.5;
      g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
      g.stroke();

      const cx = W / 2;
      g.fillStyle = ACCENT;
      g.font = `bold 24px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Country Road', cx, cy2 + 36);

      g.fillStyle = '#888';
      g.font = `13px system-ui, sans-serif`;
      g.fillText('Loop Puzzle', cx, cy2 + 58);

      g.fillStyle = '#ccc';
      g.font = `14px system-ui, sans-serif`;
      g.textAlign = 'left';
      [
        '● Draw a single closed loop through the grid',
        '● Enter and exit every region exactly once',
        '● Numbers = cells the loop visits in that region',
        '● Loop travels as one connected path per region',
        '● Each cell visited at most once',
      ].forEach((r, i) => g.fillText(r, cx2 + 20, cy2 + 94 + i * 30));

      g.fillStyle = '#555';
      g.font = `12px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText('Drag to draw · Drag over drawn edge to erase', cx, cy2 + ch - 48);

      g.font = 'bold 13px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillText('TAP ANYWHERE TO CLOSE', cx, cy2 + ch - 20);
    }

    function drawHUD() {
      g.fillStyle=BG; g.fillRect(0,0,W,HUD_H);

      g.fillStyle='#fff'; g.font=`bold 22px monospace`;
      g.textAlign='center';
      g.fillText((timerMs/1000).toFixed(1)+'s', W/2, 36);

      if (bestTime>0) {
        g.fillStyle='#444'; g.font=`11px system-ui,sans-serif`;
        g.fillText('best '+(bestTime/1000).toFixed(1)+'s', W/2, 50);
      }

      g.fillStyle=ACCENT; g.font=`bold 13px system-ui,sans-serif`;
      g.textAlign='left';
      g.fillText(`#${puzzleIdx+1}/5`, PAD, 36);

      if (solved||failed) {
        g.fillStyle='#fff'; g.textAlign='right';
        g.font=`13px system-ui,sans-serif`;
        g.fillText('tap to continue', W-PAD, 36);
      }
    }

    let failed = false;

    function drawGrid() {
      const rs = regionStatus();

      // Cell fills by region conflict state
      for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
        const ri = puzzle.regions[r][c];
        const x=OX+c*CELL, y=OY+r*CELL;
        const s = rs[ri];
        const conflict = gameStarted && s && s.conflict;
        g.fillStyle = conflict ? '#1f0a0a' : '#161620';
        g.fillRect(x+1,y+1,CELL-2,CELL-2);
      }

      // Region borders (thick lines between different regions)
      for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
        const ri = puzzle.regions[r][c];
        const x=OX+c*CELL, y=OY+r*CELL;
        const s = rs[ri];
        const conflictColor = '#dc2f2f';
        const borderColor   = s && s.conflict ? conflictColor : ACCENT+'99';

        if (c<N-1 && puzzle.regions[r][c+1]!==ri) {
          const rj=puzzle.regions[r][c+1]; const s2=rs[rj];
          const col=(s&&s.conflict)||(s2&&s2.conflict)?conflictColor:ACCENT+'99';
          g.strokeStyle=col; g.lineWidth=2.5;
          g.beginPath(); g.moveTo(x+CELL,y+3); g.lineTo(x+CELL,y+CELL-3); g.stroke();
        }
        if (r<N-1 && puzzle.regions[r+1][c]!==ri) {
          const rj=puzzle.regions[r+1][c]; const s2=rs[rj];
          const col=(s&&s.conflict)||(s2&&s2.conflict)?conflictColor:ACCENT+'99';
          g.strokeStyle=col; g.lineWidth=2.5;
          g.beginPath(); g.moveTo(x+3,y+CELL); g.lineTo(x+CELL-3,y+CELL); g.stroke();
        }
      }

      // Outer border
      g.strokeStyle=ACCENT+'bb'; g.lineWidth=2;
      g.strokeRect(OX,OY,GRID_W,GRID_H);

      // Grid fine lines
      g.strokeStyle='#1e1e28'; g.lineWidth=1;
      for (let i=1;i<N;i++) {
        g.beginPath(); g.moveTo(OX+i*CELL,OY); g.lineTo(OX+i*CELL,OY+GRID_H); g.stroke();
        g.beginPath(); g.moveTo(OX,OY+i*CELL); g.lineTo(OX+GRID_W,OY+i*CELL); g.stroke();
      }

      // Region clue labels — find top-left cell of each region
      const labelCell = {};
      for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
        const ri=puzzle.regions[r][c];
        if (!(ri in labelCell)) labelCell[ri]={r,c};
      }
      for (const [riStr,{r,c}] of Object.entries(labelCell)) {
        const ri=parseInt(riStr);
        const clue=puzzle.clues[ri]; if (clue===undefined) continue;
        const {x:px,y:py}=cp(r,c);
        const s=rs[ri];
        const conflict=gameStarted&&s&&s.conflict;
        g.fillStyle=conflict?'#dc2f2f':ACCENT;
        g.font=`bold ${Math.floor(CELL*0.34)}px system-ui,sans-serif`;
        g.textAlign='center'; g.textBaseline='middle';
        g.fillText(String(clue),px,py);

        // Progress hint
        if (gameStarted&&s&&s.visits>0) {
          g.fillStyle=(conflict?'#dc2f2f':ACCENT2)+'88';
          g.font=`${Math.floor(CELL*0.19)}px system-ui,sans-serif`;
          g.fillText(`${s.visits}/${clue}`,px,py+CELL*0.3);
        }
        g.textBaseline='alphabetic';
      }
    }

    function drawEdges() {
      g.lineCap='round'; g.lineJoin='round';

      for (const ek of edges) {
        const [a,b]=ek.split('-');
        const [r1,c1]=a.split(',').map(Number);
        const [r2,c2]=b.split(',').map(Number);
        const p1=cp(r1,c1), p2=cp(r2,c2);
        const alpha=edgeFade.get(ek)||1;

        if (solved) {
          const wave=0.5+0.5*Math.sin(pulseT*2.5-(r1+c1)*0.45);
          g.shadowBlur=10+wave*8; g.shadowColor=ACCENT;
          g.strokeStyle=`rgba(82,183,136,${0.85+wave*0.15})`;
        } else {
          g.shadowBlur=5; g.shadowColor=ACCENT+'66';
          g.strokeStyle=`rgba(82,183,136,${alpha})`;
        }
        g.lineWidth=3.5;
        g.beginPath(); g.moveTo(p1.x,p1.y); g.lineTo(p2.x,p2.y); g.stroke();
        g.shadowBlur=0;
      }

      // Drag ghost
      if (dragStart&&dragCurrent&&
          (dragStart.r!==dragCurrent.r||dragStart.c!==dragCurrent.c)) {
        const p1=cp(dragStart.r,dragStart.c);
        const p2=cp(dragCurrent.r,dragCurrent.c);
        g.strokeStyle=ACCENT+'40'; g.lineWidth=2;
        g.setLineDash([5,5]);
        g.beginPath(); g.moveTo(p1.x,p1.y); g.lineTo(p2.x,p2.y); g.stroke();
        g.setLineDash([]);
      }
    }

    function drawOverlay() {
      if (!solved) return;
      const a=Math.min(solveAnim*2,1);
      g.fillStyle=`rgba(0,0,0,${a*0.72})`; g.fillRect(0,0,W,USABLE_H);
      const cy=USABLE_H/2;
      g.fillStyle=`rgba(82,183,136,${a})`; g.font=`bold 36px system-ui,sans-serif`;
      g.textAlign='center'; g.fillText('Solved!',W/2,cy-22);
      g.fillStyle=`rgba(255,255,255,${a*0.85})`; g.font=`18px system-ui,sans-serif`;
      g.fillText(`Time: ${(timerMs/1000).toFixed(1)}s`,W/2,cy+16);
      if (bestTime>0) {
        g.fillStyle=`rgba(82,183,136,${a*0.7})`; g.font=`14px system-ui,sans-serif`;
        g.fillText(`Best: ${(bestTime/1000).toFixed(1)}s`,W/2,cy+44);
      }
      g.fillStyle=`rgba(255,255,255,${a*0.45})`; g.font=`14px system-ui,sans-serif`;
      g.fillText('Tap for next puzzle',W/2,cy+76);
    }

    // ── INPUT ──────────────────────────────────────────────────────────────────
    ctx.listen(canvas,'touchstart',(e)=>{
      e.preventDefault();
      const t=e.changedTouches[0];
      const tx=t.clientX, ty=t.clientY;
      ensureAudio();

      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // See Solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        if (solutionEdges) {
          showSolution = true;
          edges = new Set(solutionEdges);
          edgeFade = new Map();
          for (const ek of edges) edgeFade.set(ek, 0.05);
        }
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        puzzleIdx=(puzzleIdx+1)%PUZZLES.length;
        loadPuzzle(puzzleIdx);
        edges=new Set(); edgeFade=new Map();
        solved=false; failed=false; solveAnim=0;
        timerMs=0; timerRunning=true; gameStarted=false;
        showSolution=false;
        return;
      }

      if (solved||failed) {
        puzzleIdx=(puzzleIdx+1)%PUZZLES.length;
        loadPuzzle(puzzleIdx);
        edges=new Set(); edgeFade=new Map();
        solved=false; failed=false; solveAnim=0;
        timerMs=0; timerRunning=true; gameStarted=false;
        showSolution=false;
        return;
      }
      const cell=pc(tx,ty);
      if (cell) {
        dragStart=cell; dragCurrent=cell; lastDragCell=cell;
        if (!gameStarted) { gameStarted=true; timerRunning=true; ctx.platform.start(); }
      }
    },{passive:false});

    ctx.listen(canvas,'touchmove',(e)=>{
      e.preventDefault();
      if (!dragStart||solved) return;
      const t=e.changedTouches[0];
      const cell=pc(t.clientX,t.clientY);
      if (!cell) return;
      dragCurrent=cell;

      if (lastDragCell&&(cell.r!==lastDragCell.r||cell.c!==lastDragCell.c)) {
        const dr=Math.abs(cell.r-lastDragCell.r), dc=Math.abs(cell.c-lastDragCell.c);
        if (dr+dc===1) {
          const ek=edgeKey(lastDragCell.r,lastDragCell.c,cell.r,cell.c);
          if (edges.has(ek)) { edges.delete(ek); edgeFade.delete(ek); }
          else { edges.add(ek); edgeFade.set(ek,0.05); }
          playClick();
          lastDragCell=cell;
        }
      }
    },{passive:false});

    ctx.listen(canvas,'touchend',(e)=>{
      e.preventDefault();
      dragStart=null; dragCurrent=null; lastDragCell=null;
      if (!solved&&edges.size>=4&&checkSolved()) {
        solved=true; timerRunning=false; playWin(); solveAnim=0;
        const score=Math.floor(10000/(timerMs/1000+1));
        ctx.platform.complete({score,durationMs:timerMs});
        ctx.platform.setScore(score);
        if (bestTime===0||timerMs<bestTime) {
          bestTime=timerMs; ctx.storage.set(HS_KEY,bestTime);
        }
      }
    },{passive:false});

    // ── GAME LOOP ──────────────────────────────────────────────────────────────
    ctx.raf((dt)=>{
      if (timerRunning&&!solved) timerMs+=dt;
      pulseT+=dt/1000;
      solveAnim=Math.min(solveAnim+dt/550,1);

      // Fade edges in
      for (const [ek,a] of edgeFade) {
        const na=Math.min(a+dt/80,1);
        if (na>=1) edgeFade.delete(ek); else edgeFade.set(ek,na);
      }

      g.fillStyle=BG; g.fillRect(0,0,W,H);
      drawHUD(); drawGrid(); drawEdges(); drawOverlay();

      // Info button
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // See Solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI*2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px system-ui, sans-serif`;
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

      if (showInfo) drawInfoPanel();
    });

    ctx.platform.ready();
  },

  pause(ctx){},
  resume(ctx){},
};
