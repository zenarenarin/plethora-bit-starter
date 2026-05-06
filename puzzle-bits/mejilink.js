// Mejilink — Crossing Loop Puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Mejilink',
    author: 'plethora',
    description: 'Draw a loop that crosses only at marked cells.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#EF476F';
    const ACCENT2 = '#FF6B9D';
    const BG = '#0f0f14';
    const N = 6;

    const HS_KEY = 'bt_mejilink';
    let bestTime = ctx.storage.get(HS_KEY) || 0;

    // ── AUDIO ────────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playClick() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), ga = audioCtx.createGain();
      o.connect(ga); ga.connect(audioCtx.destination);
      o.type = 'triangle'; o.frequency.value = 700;
      ga.gain.setValueAtTime(0.15, audioCtx.currentTime);
      ga.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }
    function playCross() {
      if (!audioCtx) return;
      [440, 660].forEach((f, i) => {
        const o = audioCtx.createOscillator(), ga = audioCtx.createGain();
        o.connect(ga); ga.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = f;
        ga.gain.setValueAtTime(0.18, audioCtx.currentTime + i*0.05);
        ga.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i*0.05 + 0.1);
        o.start(audioCtx.currentTime + i*0.05);
        o.stop(audioCtx.currentTime + i*0.05 + 0.1);
      });
    }
    function playError() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), ga = audioCtx.createGain();
      o.connect(ga); ga.connect(audioCtx.destination);
      o.type = 'sawtooth'; o.frequency.value = 150;
      ga.gain.setValueAtTime(0.2, audioCtx.currentTime);
      ga.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      o.start(); o.stop(audioCtx.currentTime + 0.15);
    }
    function playWin() {
      if (!audioCtx) return;
      [523, 659, 784, 988, 1047].forEach((f, i) => {
        const o = audioCtx.createOscillator(), ga = audioCtx.createGain();
        o.connect(ga); ga.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = f;
        ga.gain.setValueAtTime(0.22, audioCtx.currentTime + i*0.1);
        ga.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i*0.1 + 0.25);
        o.start(audioCtx.currentTime + i*0.1);
        o.stop(audioCtx.currentTime + i*0.1 + 0.25);
      });
    }

    // ── PUZZLES ──────────────────────────────────────────────────────────────
    // crossCells: array of {r,c} that must be crossed
    // For validation: each cross cell needs exactly 2 horizontal + 2 vertical connections
    // Regular cells: exactly 0 or 2 connections total
    const PUZZLES = [
      {
        // Puzzle 1 — simple figure-8 style
        crossCells: [{r:1,c:2},{r:3,c:3}],
      },
      {
        // Puzzle 2
        crossCells: [{r:0,c:3},{r:2,c:1},{r:4,c:4}],
      },
      {
        // Puzzle 3 — more complex
        crossCells: [{r:1,c:1},{r:1,c:4},{r:4,c:1},{r:4,c:4}],
      },
      {
        // Puzzle 4
        crossCells: [{r:0,c:2},{r:2,c:5},{r:3,c:0},{r:5,c:3}],
      },
      {
        // Puzzle 5 — hardest
        crossCells: [{r:1,c:2},{r:1,c:4},{r:3,c:1},{r:3,c:5},{r:5,c:3}],
      },
    ];

    // Build cross cell lookup
    function buildCrossSet(puz) {
      const s = new Set();
      for (const {r,c} of puz.crossCells) s.add(`${r},${c}`);
      return s;
    }

    // ── SOLUTION FINDER ──────────────────────────────────────────────────────
    // Finds a valid Mejilink solution using random traversal + backtracking.
    function findMejiSolution(puz) {
      const cs = buildCrossSet(puz);

      function ek(r1,c1,r2,c2) {
        if(r1>r2||(r1===r2&&c1>c2)) return `${r2},${c2}-${r1},${c1}`;
        return `${r1},${c1}-${r2},${c2}`;
      }

      // Validate against checkSolved logic
      function validate(edgeSet) {
        if(edgeSet.size===0) return false;
        const degree={}, hDeg={}, vDeg={};
        for(const e of edgeSet){
          const[a,b]=e.split('-');
          const[r1,c1]=a.split(',').map(Number);
          const[r2,c2]=b.split(',').map(Number);
          const k1=`${r1},${c1}`,k2=`${r2},${c2}`;
          degree[k1]=(degree[k1]||0)+1; degree[k2]=(degree[k2]||0)+1;
          if(r1===r2){hDeg[k1]=(hDeg[k1]||0)+1;hDeg[k2]=(hDeg[k2]||0)+1;}
          else{vDeg[k1]=(vDeg[k1]||0)+1;vDeg[k2]=(vDeg[k2]||0)+1;}
        }
        for(let r=0;r<N;r++) for(let c=0;c<N;c++){
          const k=`${r},${c}`,d=degree[k]||0,hd=hDeg[k]||0,vd=vDeg[k]||0;
          if(cs.has(k)){if(d!==4||hd!==2||vd!==2)return false;}
          else{if(d!==0&&d!==2)return false;if(hd>0&&vd>0)return false;}
        }
        for(const k of cs) if((degree[k]||0)!==4)return false;
        // Connectivity trace
        const startKey=Object.keys(degree).find(k=>!cs.has(k)&&(degree[k]||0)===2);
        if(!startKey){return edgeSet.size>0;}
        const[sr,sc]=startKey.split(',').map(Number);
        let pr=-1,pc2=-1,cr=sr,cc=sc,steps=0;
        do{
          const k=`${cr},${cc}`,isCr=cs.has(k);
          let nr=-1,nc2=-1;
          if(isCr){
            const dR=cr-pr,dC=cc-pc2;
            if(dR!==0||dC!==0){
              const tr=cr+dR,tc=cc+dC;
              if(tr>=0&&tr<N&&tc>=0&&tc<N&&edgeSet.has(ek(cr,cc,tr,tc))){nr=tr;nc2=tc;}
            }
          }else{
            for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
              const tr=cr+dr,tc=cc+dc;
              if(tr===pr&&tc===pc2)continue;
              if(tr<0||tr>=N||tc<0||tc>=N)continue;
              if(edgeSet.has(ek(cr,cc,tr,tc))){nr=tr;nc2=tc;break;}
            }
          }
          if(nr===-1)break;
          pr=cr;pc2=cc;cr=nr;cc=nc2;steps++;
          if(steps>edgeSet.size*2+10)return false;
        }while(cr!==sr||cc!==sc);
        return steps>=4;
      }

      // Try multiple random loop approaches
      for(let attempt=0;attempt<400;attempt++){
        // Build a loop that must pass through all cross cells
        // Strategy: build a path that visits all cross cells, then close it
        const crossList=[...cs].map(k=>k.split(',').map(Number));
        if(crossList.length===0) continue;

        // Start from first cross cell, try random walk
        const [sr,sc]=crossList[Math.floor(Math.random()*crossList.length)];
        const edgeSet=new Set();
        // Track per-cell H/V usage
        const hUsed={},vUsed={},totalDeg={};
        function addEdge(r1,c1,r2,c2){
          const e=ek(r1,c1,r2,c2);
          const k1=`${r1},${c1}`,k2=`${r2},${c2}`;
          edgeSet.add(e);
          if(r1===r2){hUsed[k1]=(hUsed[k1]||0)+1;hUsed[k2]=(hUsed[k2]||0)+1;}
          else{vUsed[k1]=(vUsed[k1]||0)+1;vUsed[k2]=(vUsed[k2]||0)+1;}
          totalDeg[k1]=(totalDeg[k1]||0)+1; totalDeg[k2]=(totalDeg[k2]||0)+1;
        }
        function canAdd(r1,c1,r2,c2){
          const e=ek(r1,c1,r2,c2);
          if(edgeSet.has(e)) return false;
          const k1=`${r1},${c1}`,k2=`${r2},${c2}`;
          const isH=(r1===r2);
          // Check from cell
          if(cs.has(k1)){if(isH&&(hUsed[k1]||0)>=2)return false;if(!isH&&(vUsed[k1]||0)>=2)return false;}
          else{if((totalDeg[k1]||0)>=2)return false;if(isH&&(vUsed[k1]||0)>0)return false;if(!isH&&(hUsed[k1]||0)>0)return false;}
          if(cs.has(k2)){if(isH&&(hUsed[k2]||0)>=2)return false;if(!isH&&(vUsed[k2]||0)>=2)return false;}
          else{if((totalDeg[k2]||0)>=2)return false;if(isH&&(vUsed[k2]||0)>0)return false;if(!isH&&(hUsed[k2]||0)>0)return false;}
          return true;
        }

        // Walk randomly, preferring cross cells
        const path=[[sr,sc]]; let cur=[sr,sc]; let ok=true;
        for(let step=0;step<N*N*3&&ok;step++){
          const[cr,cc]=cur;
          const k=`${cr},${cc}`;
          const dirs=[[-1,0],[1,0],[0,-1],[0,1]].sort(()=>Math.random()-0.5);
          // Try to close loop back to start if path is long enough and all crosses visited
          const crossesHit=crossList.every(([xr,xc])=>path.some(([pr,pc2])=>pr===xr&&pc2===xc)||cr===xr&&cc===xc);
          let closed=false;
          if(path.length>4&&crossesHit&&canAdd(cr,cc,sr,sc)&&Math.random()<0.15){
            addEdge(cr,cc,sr,sc); closed=true; break;
          }
          let moved=false;
          for(const[dr,dc]of dirs){
            const nr=cr+dr,nc=cc+dc;
            if(nr<0||nr>=N||nc<0||nc>=N)continue;
            if(nr===sr&&nc===sc&&path.length>4&&crossesHit&&canAdd(cr,cc,nr,nc)){
              addEdge(cr,cc,nr,nc); closed=true; break;
            }
            const nk=`${nr},${nc}`;
            if(path.some(([pr,pc2])=>pr===nr&&pc2===nc))continue;
            if(!canAdd(cr,cc,nr,nc))continue;
            addEdge(cr,cc,nr,nc); path.push([nr,nc]); cur=[nr,nc]; moved=true; break;
          }
          if(closed) break;
          if(!moved){ok=false;break;}
        }
        if(validate(edgeSet)) return edgeSet;
      }
      return null;
    }

    // ── STATE ────────────────────────────────────────────────────────────────
    let puzzleIdx = 0;
    let puzzle = PUZZLES[puzzleIdx];
    let crossSet = buildCrossSet(puzzle);
    let showSolution = false;
    let solutionEdges = null;

    function loadPuzzle(idx) {
      puzzle = PUZZLES[idx];
      crossSet = buildCrossSet(puzzle);
      solutionEdges = findMejiSolution(puzzle);
    }
    loadPuzzle(0);

    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    // Edges: stored as "r1,c1-r2,c2" canonical form
    // For cross cells we allow up to 4 connections
    let edges = new Set();
    let solved = false;
    let showInfo = false;
    let timerMs = 0;
    let timerRunning = false;
    let gameStarted = false;
    let solveAnim = 0;
    let edgeAnim = new Map();
    let pulseT = 0;
    let shakeCells = new Map(); // key -> time remaining for shake anim

    const IBTN = { x: W - 22, y: 8, r: 14 };

    // Layout
    const PAD = 16;
    const HUD_H = 56;
    const GRID_TOP = HUD_H + PAD;
    const AVAILABLE_H = USABLE_H - GRID_TOP - PAD;
    const AVAILABLE_W = W - PAD * 2;
    const CELL = Math.floor(Math.min(AVAILABLE_W, AVAILABLE_H) / N);
    const GRID_W = CELL * N;
    const GRID_H = CELL * N;
    const OX = Math.floor((W - GRID_W) / 2);
    const OY = GRID_TOP + Math.floor((AVAILABLE_H - GRID_H) / 2);

    function cellToPixel(r, c) {
      return { x: OX + c * CELL + CELL / 2, y: OY + r * CELL + CELL / 2 };
    }
    function pixelToCell(px, py) {
      const c = Math.floor((px - OX) / CELL);
      const r = Math.floor((py - OY) / CELL);
      if (r < 0 || r >= N || c < 0 || c >= N) return null;
      return { r, c };
    }

    function edgeKey(r1, c1, r2, c2) {
      if (r1 > r2 || (r1 === r2 && c1 > c2)) return `${r2},${c2}-${r1},${c1}`;
      return `${r1},${c1}-${r2},${c2}`;
    }

    function isHorizontalEdge(ek) {
      const [a, b] = ek.split('-');
      const [r1] = a.split(',').map(Number);
      const [r2] = b.split(',').map(Number);
      return r1 === r2;
    }

    // ── VALIDATION ───────────────────────────────────────────────────────────
    function getCellEdges(r, c) {
      const result = { h: [], v: [] }; // horizontal and vertical edges touching this cell
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr,dc] of dirs) {
        const nr = r+dr, nc = c+dc;
        if (nr<0||nr>=N||nc<0||nc>=N) continue;
        const ek = edgeKey(r,c,nr,nc);
        if (edges.has(ek)) {
          if (dr === 0) result.h.push({r:nr,c:nc,ek});
          else result.v.push({r:nr,c:nc,ek});
        }
      }
      return result;
    }

    function cellDegree(r, c) {
      const {h, v} = getCellEdges(r, c);
      return h.length + v.length;
    }

    // Check if current edges form a valid Mejilink solution
    function checkSolved() {
      if (edges.size === 0) return false;

      // Build degree map
      const degree = {};
      const hDeg = {}, vDeg = {};
      for (const ek of edges) {
        const [a,b] = ek.split('-');
        const [r1,c1] = a.split(',').map(Number);
        const [r2,c2] = b.split(',').map(Number);
        const k1 = `${r1},${c1}`, k2 = `${r2},${c2}`;
        degree[k1] = (degree[k1]||0)+1;
        degree[k2] = (degree[k2]||0)+1;
        if (r1 === r2) { // horizontal
          hDeg[k1] = (hDeg[k1]||0)+1;
          hDeg[k2] = (hDeg[k2]||0)+1;
        } else { // vertical
          vDeg[k1] = (vDeg[k1]||0)+1;
          vDeg[k2] = (vDeg[k2]||0)+1;
        }
      }

      // Validate each cell
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const k = `${r},${c}`;
          const d = degree[k] || 0;
          const hd = hDeg[k] || 0;
          const vd = vDeg[k] || 0;
          const isCross = crossSet.has(k);

          if (isCross) {
            if (d !== 4 || hd !== 2 || vd !== 2) return false;
          } else {
            if (d !== 0 && d !== 2) return false;
            if (hd > 0 && vd > 0) return false; // crossing at non-cross cell
          }
        }
      }

      // Check all cross cells are visited
      for (const k of crossSet) {
        if ((degree[k]||0) !== 4) return false;
      }

      // For loop connectivity: trace the loop through cross cells
      // At a cross cell we treat horizontal and vertical paths as separate strands
      // Simplified: check that the non-cross cells form proper path segments
      // and the whole thing is a single connected entity
      // Use tracing: start from any degree-2 node, trace until back to start
      const startKey = Object.keys(degree).find(k => !crossSet.has(k) && (degree[k]||0) === 2);
      if (!startKey) {
        // all cells are crosses — edge case, just check connectivity
        return edges.size > 0;
      }

      // Trace the loop
      const [sr, sc] = startKey.split(',').map(Number);
      let prevR = -1, prevC = -1;
      let curR = sr, curC = sc;
      let steps = 0;
      const maxSteps = edges.size * 2 + 10;

      do {
        const k = `${curR},${curC}`;
        const isCross = crossSet.has(k);
        // Find next cell (not where we came from)
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        let nextR = -1, nextC = -1;

        if (isCross) {
          // At cross: continue in same direction
          const dR = curR - prevR, dC = curC - prevC;
          if (dR !== 0 || dC !== 0) {
            const nr = curR + dR, nc = curC + dC;
            if (nr>=0&&nr<N&&nc>=0&&nc<N && edges.has(edgeKey(curR,curC,nr,nc))) {
              nextR = nr; nextC = nc;
            }
          }
        } else {
          for (const [dr,dc] of dirs) {
            const nr = curR+dr, nc = curC+dc;
            if (nr===prevR&&nc===prevC) continue;
            if (nr<0||nr>=N||nc<0||nc>=N) continue;
            if (edges.has(edgeKey(curR,curC,nr,nc))) {
              nextR = nr; nextC = nc; break;
            }
          }
        }

        if (nextR === -1) break;
        prevR = curR; prevC = curC;
        curR = nextR; curC = nextC;
        steps++;
        if (steps > maxSteps) return false;
      } while (curR !== sr || curC !== sc);

      // All edges should have been traversed (each once, cross cells twice — once per strand)
      return steps >= 4;
    }

    // ── DRAW ─────────────────────────────────────────────────────────────────
    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x+r,y); g.lineTo(x+w-r,y);
      g.quadraticCurveTo(x+w,y,x+w,y+r);
      g.lineTo(x+w,y+h-r);
      g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      g.lineTo(x+r,y+h);
      g.quadraticCurveTo(x,y+h,x,y+h-r);
      g.lineTo(x,y+r);
      g.quadraticCurveTo(x,y,x+r,y);
      g.closePath();
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
      g.strokeStyle = ACCENT + '55'; g.lineWidth = 1.5;
      g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
      g.stroke();

      const cx = W / 2;
      g.fillStyle = ACCENT;
      g.font = `bold 24px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Mejilink', cx, cy2 + 36);

      g.fillStyle = '#888';
      g.font = `13px system-ui, sans-serif`;
      g.fillText('Crossing Loop', cx, cy2 + 58);

      g.fillStyle = '#ccc';
      g.font = `14px system-ui, sans-serif`;
      g.textAlign = 'left';
      const rules = [
        '● Draw a single closed loop',
        '● Loop may ONLY cross at ✕ marked cells',
        '● At ✕ cells: two straight paths must cross',
        '● Loop must pass through every ✕ cell',
        '● Regular cells: max 2 connections, no cross',
      ];
      rules.forEach((r, i) => g.fillText(r, cx2 + 20, cy2 + 94 + i * 30));

      g.fillStyle = '#666';
      g.font = `13px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText('Drag between cells to draw', cx, cy2 + ch - 48);

      g.font = 'bold 13px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillText('TAP ANYWHERE TO CLOSE', cx, cy2 + ch - 20);
    }

    function drawHUD() {
      g.fillStyle = BG;
      g.fillRect(0,0,W,HUD_H);

      const secs = (timerMs/1000).toFixed(1);
      g.fillStyle = '#fff';
      g.font = `bold 22px monospace`;
      g.textAlign = 'center';
      g.fillText(secs+'s', W/2, 36);

      if (bestTime > 0) {
        g.fillStyle = '#555';
        g.font = `11px system-ui, sans-serif`;
        g.fillText('best '+(bestTime/1000).toFixed(1)+'s', W/2, 50);
      }

      g.fillStyle = ACCENT;
      g.font = `bold 13px system-ui, sans-serif`;
      g.textAlign = 'left';
      g.fillText(`#${puzzleIdx+1}/5`, PAD, 36);

      if (solved) {
        g.fillStyle = '#fff';
        g.textAlign = 'right';
        g.font = `13px system-ui, sans-serif`;
        g.fillText('tap to continue', W-PAD, 36);
      }
    }

    function drawGrid() {
      // Cell backgrounds
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const x = OX+c*CELL, y = OY+r*CELL;
          const isCross = crossSet.has(`${r},${c}`);
          if (isCross) {
            g.fillStyle = '#1f0d14';
          } else {
            g.fillStyle = '#16161f';
          }
          g.fillRect(x+1,y+1,CELL-2,CELL-2);
        }
      }

      // Grid lines
      g.strokeStyle = '#2a2a3a';
      g.lineWidth = 1;
      for (let i = 0; i <= N; i++) {
        g.beginPath(); g.moveTo(OX+i*CELL,OY); g.lineTo(OX+i*CELL,OY+GRID_H); g.stroke();
        g.beginPath(); g.moveTo(OX,OY+i*CELL); g.lineTo(OX+GRID_W,OY+i*CELL); g.stroke();
      }

      // Cross cell markers
      for (const key of crossSet) {
        const [r,c] = key.split(',').map(Number);
        const {x:px,y:py} = cellToPixel(r,c);
        const size = CELL * 0.28;
        const deg = cellDegree(r,c);
        const {h,v} = getCellEdges(r,c);

        // Conflict: cross cell without all 4 connections
        const isConflict = gameStarted && deg > 0 && deg < 4;
        const col = isConflict ? '#ff4444' : ACCENT;

        // Glow
        const grd = g.createRadialGradient(px,py,0,px,py,size*2);
        grd.addColorStop(0, col+'33');
        grd.addColorStop(1, col+'00');
        g.fillStyle = grd;
        g.fillRect(px-size*2,py-size*2,size*4,size*4);

        // ✕ symbol
        g.strokeStyle = col+'cc';
        g.lineWidth = 2.5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(px-size, py-size); g.lineTo(px+size, py+size); g.stroke();
        g.beginPath();
        g.moveTo(px+size, py-size); g.lineTo(px-size, py+size); g.stroke();
      }
    }

    function drawEdges() {
      g.lineCap = 'round';
      g.lineJoin = 'round';

      for (const ek of edges) {
        const [a,b] = ek.split('-');
        const [r1,c1] = a.split(',').map(Number);
        const [r2,c2] = b.split(',').map(Number);
        const p1 = cellToPixel(r1,c1);
        const p2 = cellToPixel(r2,c2);
        const alpha = edgeAnim.get(ek) || 1;

        // Check if this edge goes through a cross cell (for crossing visual)
        // The edge connects adjacent cells; midpoint is the cell center
        const isHoriz = r1 === r2;

        // For cross cells, draw with a gap at the crossing point
        const midR = (r1+r2)/2, midC = (c1+c2)/2;
        // Check if the midpoint is NOT at a cell center (it isn't for adjacent cells)
        // Actually edges between adjacent cells: midpoint is cell border
        // Crossing visual is handled per-cell below

        if (solved) {
          const wave = 0.5 + 0.5 * Math.sin(pulseT * 3 - (r1+c1) * 0.4);
          g.shadowBlur = 10 + wave * 6;
          g.shadowColor = ACCENT;
          g.strokeStyle = `rgba(239,71,111,${0.85 + wave * 0.15})`;
        } else {
          g.shadowBlur = 4;
          g.shadowColor = ACCENT+'88';
          g.strokeStyle = `rgba(239,71,111,${alpha})`;
        }
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(p1.x, p1.y);
        g.lineTo(p2.x, p2.y);
        g.stroke();
        g.shadowBlur = 0;
      }

      // Draw crossing visual at cross cells that have 4 connections
      for (const key of crossSet) {
        const [r,c] = key.split(',').map(Number);
        const {h,v} = getCellEdges(r,c);
        if (h.length === 2 && v.length === 2) {
          const {x:px,y:py} = cellToPixel(r,c);
          const gap = 5;
          // Redraw vertical edge with gap (horizontal is "on top")
          g.strokeStyle = BG;
          g.lineWidth = 7;
          g.lineCap = 'butt';
          g.beginPath();
          g.moveTo(px, py-gap); g.lineTo(px, py+gap); g.stroke();

          g.strokeStyle = solved ? ACCENT2 : ACCENT;
          g.lineWidth = 3;
          g.lineCap = 'round';
          // redraw short segments
          const topP = cellToPixel(r-1,c), botP = cellToPixel(r+1,c);
          g.beginPath(); g.moveTo(px,topP.y); g.lineTo(px,py-gap); g.stroke();
          g.beginPath(); g.moveTo(px,py+gap); g.lineTo(px,botP.y); g.stroke();
        }
      }

      // Drag preview
      if (dragStart && dragCurrent) {
        const p1 = cellToPixel(dragStart.r,dragStart.c);
        const p2 = cellToPixel(dragCurrent.r,dragCurrent.c);
        g.strokeStyle = ACCENT+'44';
        g.lineWidth = 2;
        g.setLineDash([4,4]);
        g.beginPath(); g.moveTo(p1.x,p1.y); g.lineTo(p2.x,p2.y); g.stroke();
        g.setLineDash([]);
      }
    }

    function drawSolvedOverlay() {
      if (!solved) return;
      const a = Math.min(solveAnim * 2, 1);
      g.fillStyle = `rgba(0,0,0,${a*0.7})`;
      g.fillRect(0,0,W,USABLE_H);

      const cy = USABLE_H/2;
      g.fillStyle = `rgba(239,71,111,${a})`;
      g.font = `bold 36px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText('Solved!', W/2, cy-20);

      g.fillStyle = `rgba(255,255,255,${a*0.8})`;
      g.font = `18px system-ui, sans-serif`;
      g.fillText(`Time: ${(timerMs/1000).toFixed(1)}s`, W/2, cy+20);

      if (bestTime > 0) {
        g.fillStyle = `rgba(239,71,111,${a*0.7})`;
        g.font = `14px system-ui, sans-serif`;
        g.fillText(`Best: ${(bestTime/1000).toFixed(1)}s`, W/2, cy+50);
      }

      g.fillStyle = `rgba(255,255,255,${a*0.5})`;
      g.font = `14px system-ui, sans-serif`;
      g.fillText('Tap for next puzzle', W/2, cy+80);
    }

    // ── INPUT ─────────────────────────────────────────────────────────────────
    let dragStart = null;
    let dragCurrent = null;
    let lastDragCell = null;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;
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
          edgeAnim = new Map();
          for (const e of edges) edgeAnim.set(e, 0.1);
        }
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        puzzleIdx = (puzzleIdx+1) % PUZZLES.length;
        loadPuzzle(puzzleIdx);
        edges = new Set();
        edgeAnim = new Map();
        solved = false;
        solveAnim = 0;
        timerMs = 0;
        timerRunning = true;
        gameStarted = false;
        showSolution = false;
        return;
      }

      if (solved) {
        puzzleIdx = (puzzleIdx+1) % PUZZLES.length;
        loadPuzzle(puzzleIdx);
        edges = new Set();
        edgeAnim = new Map();
        solved = false;
        solveAnim = 0;
        timerMs = 0;
        timerRunning = true;
        gameStarted = false;
        showSolution = false;
        return;
      }

      const cell = pixelToCell(tx, ty);
      if (cell) {
        dragStart = cell;
        dragCurrent = cell;
        lastDragCell = cell;
        if (!gameStarted) { gameStarted = true; timerRunning = true; ctx.platform.start(); }
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!dragStart) return;
      const t = e.changedTouches[0];
      const cell = pixelToCell(t.clientX, t.clientY);
      if (!cell) return;
      dragCurrent = cell;

      if (lastDragCell && (cell.r !== lastDragCell.r || cell.c !== lastDragCell.c)) {
        const dr = Math.abs(cell.r-lastDragCell.r), dc = Math.abs(cell.c-lastDragCell.c);
        if (dr+dc === 1) {
          const ek = edgeKey(lastDragCell.r,lastDragCell.c,cell.r,cell.c);

          // Check if adding this edge would violate constraints
          // At non-cross cells: can't add edge if already 2 connections from same axis or it would cross
          const fromKey = `${lastDragCell.r},${lastDragCell.c}`;
          const toKey = `${cell.r},${cell.c}`;
          const fromCross = crossSet.has(fromKey);
          const toCross = crossSet.has(toKey);

          if (edges.has(ek)) {
            edges.delete(ek);
            edgeAnim.delete(ek);
            playClick();
          } else {
            const isH = lastDragCell.r === cell.r;
            // Check from cell
            let canAdd = true;
            if (!fromCross) {
              const fd = cellDegree(lastDragCell.r, lastDragCell.c);
              const {h:fh,v:fv} = getCellEdges(lastDragCell.r,lastDragCell.c);
              if (fd >= 2) canAdd = false;
              if (isH && fv.length > 0) canAdd = false;
              if (!isH && fh.length > 0) canAdd = false;
            } else {
              // cross cell: max 2h + 2v
              const {h:fh,v:fv} = getCellEdges(lastDragCell.r,lastDragCell.c);
              if (isH && fh.length >= 2) canAdd = false;
              if (!isH && fv.length >= 2) canAdd = false;
            }
            if (!toCross) {
              const td = cellDegree(cell.r, cell.c);
              const {h:th,v:tv} = getCellEdges(cell.r,cell.c);
              if (td >= 2) canAdd = false;
              if (isH && tv.length > 0) canAdd = false;
              if (!isH && th.length > 0) canAdd = false;
            } else {
              const {h:th,v:tv} = getCellEdges(cell.r,cell.c);
              if (isH && th.length >= 2) canAdd = false;
              if (!isH && tv.length >= 2) canAdd = false;
            }

            if (canAdd) {
              edges.add(ek);
              edgeAnim.set(ek, 0.1);
              const isCrossEdge = crossSet.has(fromKey) || crossSet.has(toKey);
              if (isCrossEdge) playCross(); else playClick();
            } else {
              playError();
            }
          }
          lastDragCell = cell;
        }
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      dragStart = null;
      dragCurrent = null;
      lastDragCell = null;

      if (!solved && edges.size > 0 && checkSolved()) {
        solved = true;
        timerRunning = false;
        playWin();
        solveAnim = 0;
        ctx.platform.complete({ score: Math.floor(10000/(timerMs/1000+1)), durationMs: timerMs });
        if (bestTime === 0 || timerMs < bestTime) {
          bestTime = timerMs;
          ctx.storage.set(HS_KEY, bestTime);
        }
        ctx.platform.setScore(Math.floor(10000/(timerMs/1000+1)));
      }
    }, { passive: false });

    // ── GAME LOOP ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      if (timerRunning && !solved) timerMs += dt;
      pulseT += dt/1000;
      solveAnim = Math.min(solveAnim + dt/600, 1);

      for (const [ek, alpha] of edgeAnim) {
        const na = Math.min(alpha + dt/80, 1);
        if (na >= 1) edgeAnim.delete(ek);
        else edgeAnim.set(ek, na);
      }

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      drawHUD();
      drawGrid();
      drawEdges();
      drawSolvedOverlay();

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

  pause(ctx) {},
  resume(ctx) {},
};
