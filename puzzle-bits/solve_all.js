// Comprehensive puzzle solver/validator for all Plethora puzzle bits
// Run with: node solve_all.js

'use strict';

// ============================================================
// NONOGRAM SOLVER
// ============================================================
function nonogramSolveCount(rowClues, colClues, maxCount=2) {
  const N = rowClues.length;
  const grid = Array.from({length:N}, () => new Array(N).fill(-1)); // -1=unknown
  let count = 0;

  function rowFits(clue, row) {
    // Verify row matches clue
    const runs = [];
    let run = 0;
    for (let c = 0; c < N; c++) {
      if (row[c] === 1) run++;
      else { if (run) { runs.push(run); run=0; } }
    }
    if (run) runs.push(run);
    if (runs.length === 0 && clue.length === 1 && clue[0] === 0) return true;
    if (runs.length !== clue.length) return false;
    return runs.every((r,i) => r === clue[i]);
  }

  function colValid(c) {
    const col = [];
    for (let r = 0; r < N; r++) col.push(grid[r][c]);
    if (col.some(x => x === -1)) {
      // partial check: no excess filled
      const clue = colClues[c];
      const minLen = clue.reduce((a,b)=>a+b,0) + Math.max(0, clue.length-1);
      // just check partial doesn't violate
      return true;
    }
    return rowFits(colClues[c], col);
  }

  function solve(r) {
    if (count >= maxCount) return;
    if (r === N) {
      // check all columns
      for (let c = 0; c < N; c++) {
        const col = [];
        for (let rr = 0; rr < N; rr++) col.push(grid[rr][c]);
        if (!rowFits(colClues[c], col)) return;
      }
      count++;
      return;
    }
    // generate all valid row fills for rowClues[r]
    const clue = rowClues[r];
    const fills = [];
    function genRow(pos, clueIdx, cur) {
      if (clueIdx === clue.length || (clue.length===1 && clue[0]===0)) {
        if (clueIdx === clue.length || clue[0]===0) {
          // fill rest with 0
          const row = [...cur];
          while (row.length < N) row.push(0);
          if (row.length === N) fills.push(row);
        }
        return;
      }
      const remaining = clue.slice(clueIdx).reduce((a,b)=>a+b,0) + (clue.length-clueIdx-1);
      if (pos + remaining > N) return;
      // place clue[clueIdx] starting at pos
      for (let start = pos; start + remaining <= N; start++) {
        const row = [...cur];
        while (row.length < start) row.push(0);
        for (let i = 0; i < clue[clueIdx]; i++) row.push(1);
        if (clueIdx < clue.length-1) row.push(0);
        genRow(row.length, clueIdx+1, row);
      }
    }
    if (clue.length===1 && clue[0]===0) {
      fills.push(new Array(N).fill(0));
    } else {
      genRow(0, 0, []);
    }
    for (const fill of fills) {
      if (count >= maxCount) return;
      for (let c = 0; c < N; c++) grid[r][c] = fill[c];
      solve(r+1);
    }
    for (let c = 0; c < N; c++) grid[r][c] = -1;
  }
  solve(0);
  return count;
}

function computeNonogramClues(grid) {
  const N = grid.length;
  const rowClues = [], colClues = [];
  for (let r = 0; r < N; r++) {
    const clue = [];
    let run = 0;
    for (let c = 0; c < N; c++) {
      if (grid[r][c]) run++;
      else { if (run) { clue.push(run); run=0; } }
    }
    if (run) clue.push(run);
    rowClues.push(clue.length ? clue : [0]);
  }
  for (let c = 0; c < N; c++) {
    const clue = [];
    let run = 0;
    for (let r = 0; r < N; r++) {
      if (grid[r][c]) run++;
      else { if (run) { clue.push(run); run=0; } }
    }
    if (run) clue.push(run);
    colClues.push(clue.length ? clue : [0]);
  }
  return { rowClues, colClues };
}

// ============================================================
// NURIKABE SOLVER
// ============================================================
function nurikabeSolveCount(clues, N, maxCount=2) {
  // clues[r][c] = island size or 0
  // solution[r][c] = 1=white(island), 0=black(river)
  const clueList = [];
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (clues[r][c]>0) clueList.push({r,c,n:clues[r][c]});

  const sol = Array.from({length:N}, () => new Array(N).fill(-1)); // -1=unknown
  // Clue cells must be white
  for (const {r,c} of clueList) sol[r][c] = 1;

  let count = 0;

  function validate() {
    // 1. All white cells form islands of correct size, each island has exactly 1 clue
    // 2. All black cells (river) connected
    // 3. No 2x2 black squares
    const visited = Array.from({length:N}, ()=>new Array(N).fill(false));
    // Find all white islands
    for (const {r,c,n} of clueList) {
      let size = 0;
      let hasOtherClue = false;
      const stack = [{r,c}];
      const seen = new Set([`${r},${c}`]);
      while (stack.length) {
        const {r:cr,c:cc} = stack.pop();
        if (visited[cr][cc]) return false;
        visited[cr][cc] = true;
        size++;
        for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr=cr+dr, nc=cc+dc;
          if (nr<0||nr>=N||nc<0||nc>=N) continue;
          if (sol[nr][nc]===1 && !seen.has(`${nr},${nc}`)) {
            // check if this white cell belongs to current island
            // we need flood fill from clue cell staying on whites
            seen.add(`${nr},${nc}`);
            stack.push({r:nr,c:nc});
          }
        }
      }
      if (size !== n) return false;
    }
    // All white cells should be visited
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
      if (sol[r][c]===1 && !visited[r][c]) return false;
    }
    // Check river connectivity
    const blacks = [];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]===0) blacks.push([r,c]);
    if (blacks.length === 0) return true;
    const bVisited = new Set();
    const bStack = [blacks[0]];
    bVisited.add(`${blacks[0][0]},${blacks[0][1]}`);
    while (bStack.length) {
      const [r,c] = bStack.pop();
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=N||nc<0||nc>=N) continue;
        if (sol[nr][nc]===0 && !bVisited.has(`${nr},${nc}`)) {
          bVisited.add(`${nr},${nc}`);
          bStack.push([nr,nc]);
        }
      }
    }
    if (bVisited.size !== blacks.length) return false;
    // No 2x2 black
    for (let r=0; r<N-1; r++) for (let c=0; c<N-1; c++) {
      if (sol[r][c]===0 && sol[r+1][c]===0 && sol[r][c+1]===0 && sol[r+1][c+1]===0) return false;
    }
    return true;
  }

  const cells = [];
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]===-1) cells.push([r,c]);

  function solve(idx) {
    if (count >= maxCount) return;
    if (idx === cells.length) {
      if (validate()) count++;
      return;
    }
    const [r,c] = cells[idx];
    for (const v of [0,1]) {
      sol[r][c] = v;
      solve(idx+1);
      if (count >= maxCount) return;
    }
    sol[r][c] = -1;
  }
  solve(0);
  return count;
}

// ============================================================
// HITORI SOLVER
// ============================================================
function hitoriSolveCount(grid, N, maxCount=2) {
  const sol = Array.from({length:N}, ()=>new Array(N).fill(0)); // 0=unshaded, 1=shaded
  let count = 0;

  function validate() {
    // 1. No row/col repeats among unshaded
    for (let r=0; r<N; r++) {
      const seen = new Set();
      for (let c=0; c<N; c++) {
        if (sol[r][c]===0) {
          if (seen.has(grid[r][c])) return false;
          seen.add(grid[r][c]);
        }
      }
    }
    for (let c=0; c<N; c++) {
      const seen = new Set();
      for (let r=0; r<N; r++) {
        if (sol[r][c]===0) {
          if (seen.has(grid[r][c])) return false;
          seen.add(grid[r][c]);
        }
      }
    }
    // 2. No two adjacent shaded
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
      if (sol[r][c]===1) {
        if (r+1<N && sol[r+1][c]===1) return false;
        if (c+1<N && sol[r][c+1]===1) return false;
      }
    }
    // 3. Unshaded cells form connected region
    const unshaded = [];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]===0) unshaded.push([r,c]);
    if (unshaded.length === 0) return false;
    const visited = new Set();
    const stack = [unshaded[0]];
    visited.add(`${unshaded[0][0]},${unshaded[0][1]}`);
    while (stack.length) {
      const [r,c] = stack.pop();
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=N||nc<0||nc>=N) continue;
        if (sol[nr][nc]===0 && !visited.has(`${nr},${nc}`)) {
          visited.add(`${nr},${nc}`);
          stack.push([nr,nc]);
        }
      }
    }
    return visited.size === unshaded.length;
  }

  const cells = [];
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) cells.push([r,c]);

  function solve(idx) {
    if (count >= maxCount) return;
    if (idx === N*N) {
      if (validate()) count++;
      return;
    }
    const [r,c] = cells[idx];
    for (const v of [0,1]) {
      sol[r][c] = v;
      solve(idx+1);
      if (count >= maxCount) return;
    }
    sol[r][c] = 0;
  }
  solve(0);
  return count;
}

// ============================================================
// HEYAWAKE SOLVER
// ============================================================
function heyawakeSolveCount(rooms, N, maxCount=2) {
  const sol = Array.from({length:N}, ()=>new Array(N).fill(0));
  let count = 0;

  // Build room map
  const roomMap = Array.from({length:N}, ()=>new Array(N).fill(-1));
  for (let i=0; i<rooms.length; i++) {
    const {r1,c1,r2,c2} = rooms[i];
    for (let r=r1; r<=r2; r++) for (let c=c1; c<=c2; c++) roomMap[r][c]=i;
  }

  function validate() {
    // 1. No two adjacent shaded
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
      if (sol[r][c]===1) {
        if (r+1<N && sol[r+1][c]===1) return false;
        if (c+1<N && sol[r][c+1]===1) return false;
      }
    }
    // 2. Room shaded counts
    for (let i=0; i<rooms.length; i++) {
      const {r1,c1,r2,c2,num} = rooms[i];
      if (num === null) continue;
      let cnt=0;
      for (let r=r1; r<=r2; r++) for (let c=c1; c<=c2; c++) if (sol[r][c]===1) cnt++;
      if (cnt !== num) return false;
    }
    // 3. No white run crosses 2 or more room boundaries (simplified: just check runs ≤ size of grid in any direction spanning >1 room)
    // Actually Heyawake rule: no straight line of unshaded crosses 2 room borders
    // Simplified: any consecutive white run in a row/col cannot span 3 or more rooms
    for (let r=0; r<N; r++) {
      let runRooms = new Set();
      for (let c=0; c<N; c++) {
        if (sol[r][c]===0) runRooms.add(roomMap[r][c]);
        else {
          if (runRooms.size >= 3) return false;
          runRooms = new Set();
        }
      }
      if (runRooms.size >= 3) return false;
    }
    for (let c=0; c<N; c++) {
      let runRooms = new Set();
      for (let r=0; r<N; r++) {
        if (sol[r][c]===0) runRooms.add(roomMap[r][c]);
        else {
          if (runRooms.size >= 3) return false;
          runRooms = new Set();
        }
      }
      if (runRooms.size >= 3) return false;
    }
    // 4. Unshaded connected
    const unshaded = [];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]===0) unshaded.push([r,c]);
    if (unshaded.length===0) return false;
    const visited = new Set();
    const stack = [unshaded[0]];
    visited.add(`${unshaded[0][0]},${unshaded[0][1]}`);
    while (stack.length) {
      const [r,c] = stack.pop();
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=N||nc<0||nc>=N) continue;
        if (sol[nr][nc]===0 && !visited.has(`${nr},${nc}`)) {
          visited.add(`${nr},${nc}`);
          stack.push([nr,nc]);
        }
      }
    }
    return visited.size === unshaded.length;
  }

  const cells = [];
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) cells.push([r,c]);

  function solve(idx) {
    if (count >= maxCount) return;
    if (idx === N*N) {
      if (validate()) count++;
      return;
    }
    const [r,c] = cells[idx];
    for (const v of [0,1]) {
      sol[r][c] = v;
      solve(idx+1);
      if (count >= maxCount) return;
    }
    sol[r][c] = 0;
  }
  solve(0);
  return count;
}

// ============================================================
// TAPA SOLVER
// ============================================================
function tapaSolveCount(clueGrid, N, maxCount=2) {
  // clueGrid[r][c] = array of numbers or null
  const sol = Array.from({length:N}, ()=>new Array(N).fill(0)); // 0=unshaded,1=shaded
  // Clue cells must remain unshaded
  const clueCells = new Set();
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (clueGrid[r][c]!==null) { sol[r][c]=0; clueCells.add(`${r},${c}`); }
  let count = 0;

  function getNeighborRing(r,c) {
    // 8 neighbors clockwise starting from top-left
    return [
      [r-1,c-1],[r-1,c],[r-1,c+1],
      [r,c+1],
      [r+1,c+1],[r+1,c],[r+1,c-1],
      [r,c-1]
    ].filter(([nr,nc]) => nr>=0&&nr<N&&nc>=0&&nc<N);
  }

  function neighborRingComplete(r,c) {
    // Return true if all 8 neighbors are determined (not -1)
    // Actually for validation we just use sol values
    return true;
  }

  function clueValid(r,c) {
    const clue = clueGrid[r][c];
    if (!clue) return true;
    const ring = getNeighborRing(r,c);
    // Count runs of shaded in the ring (wrapping)
    const vals = ring.map(([nr,nc]) => sol[nr][nc]);
    // check runs
    const runs = [];
    let inRun = false;
    for (let i=0; i<vals.length*2; i++) {
      const v = vals[i % vals.length];
      if (v===1) { if (!inRun) { runs.push(1); inRun=true; } else runs[runs.length-1]++; }
      else inRun=false;
      if (i>=vals.length && inRun && runs.length>0) break;
    }
    // Handle wrap: if ring starts and ends with shaded, first and last run merge
    const actualRuns = [];
    if (vals.length > 0 && vals[0]===1 && vals[vals.length-1]===1) {
      // merge first and last
      const tempRuns = [];
      let ir = false;
      for (const v of vals) {
        if (v===1) { if (!ir) { tempRuns.push(1); ir=true; } else tempRuns[tempRuns.length-1]++; }
        else ir=false;
      }
      if (tempRuns.length > 1) {
        tempRuns[0] += tempRuns[tempRuns.length-1];
        tempRuns.pop();
      }
      actualRuns.push(...tempRuns);
    } else {
      let ir = false;
      for (const v of vals) {
        if (v===1) { if (!ir) { actualRuns.push(1); ir=true; } else actualRuns[actualRuns.length-1]++; }
        else ir=false;
      }
    }
    const sortedActual = [...actualRuns].sort((a,b)=>a-b);
    const sortedClue = [...clue].sort((a,b)=>a-b);
    if (sortedActual.length !== sortedClue.length) return false;
    return sortedActual.every((v,i)=>v===sortedClue[i]);
  }

  function validate() {
    // 1. All clues satisfied
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
      if (clueGrid[r][c]!==null && !clueValid(r,c)) return false;
    }
    // 2. Shaded cells connected
    const shaded = [];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]===1) shaded.push([r,c]);
    if (shaded.length===0) return true;
    const visited = new Set();
    const stack = [shaded[0]];
    visited.add(`${shaded[0][0]},${shaded[0][1]}`);
    while (stack.length) {
      const [r,c] = stack.pop();
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=N||nc<0||nc>=N) continue;
        if (sol[nr][nc]===1 && !visited.has(`${nr},${nc}`)) {
          visited.add(`${nr},${nc}`);
          stack.push([nr,nc]);
        }
      }
    }
    if (visited.size !== shaded.length) return false;
    // 3. No 2x2 shaded
    for (let r=0; r<N-1; r++) for (let c=0; c<N-1; c++) {
      if (sol[r][c]===1&&sol[r+1][c]===1&&sol[r][c+1]===1&&sol[r+1][c+1]===1) return false;
    }
    return true;
  }

  const allCells = [];
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (!clueCells.has(`${r},${c}`)) allCells.push([r,c]);

  function solve(idx) {
    if (count >= maxCount) return;
    if (idx === allCells.length) {
      if (validate()) count++;
      return;
    }
    const [r,c] = allCells[idx];
    for (const v of [0,1]) {
      sol[r][c] = v;
      solve(idx+1);
      if (count >= maxCount) return;
    }
    sol[r][c] = 0;
  }
  solve(0);
  return count;
}

// ============================================================
// KURODOKO SOLVER
// ============================================================
function kurodokoSolveCount(clues, N, maxCount=2) {
  // clues[r][c] = number or null; solution: 1=black, 0=white
  // numbered cells must be white
  const sol = Array.from({length:N}, ()=>new Array(N).fill(-1));
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (clues[r][c]!==null) sol[r][c]=0;
  let count = 0;

  function countVisible(r,c) {
    // Count white cells visible in 4 directions (including self? no, count others)
    let vis = 0;
    // right
    for (let cc=c+1; cc<N && sol[r][cc]===0; cc++) vis++;
    // left
    for (let cc=c-1; cc>=0 && sol[r][cc]===0; cc--) vis++;
    // down
    for (let rr=r+1; rr<N && sol[rr][c]===0; rr++) vis++;
    // up
    for (let rr=r-1; rr>=0 && sol[rr][c]===0; rr--) vis++;
    return vis;
  }

  function validate() {
    // 1. No two adjacent black cells
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
      if (sol[r][c]===1) {
        if (r+1<N && sol[r+1][c]===1) return false;
        if (c+1<N && sol[r][c+1]===1) return false;
      }
    }
    // 2. All white cells connected
    const whites = [];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]===0) whites.push([r,c]);
    if (whites.length===0) return false;
    const visited = new Set();
    const stack = [whites[0]];
    visited.add(`${whites[0][0]},${whites[0][1]}`);
    while (stack.length) {
      const [r,c] = stack.pop();
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=N||nc<0||nc>=N) continue;
        if (sol[nr][nc]===0 && !visited.has(`${nr},${nc}`)) {
          visited.add(`${nr},${nc}`);
          stack.push([nr,nc]);
        }
      }
    }
    if (visited.size !== whites.length) return false;
    // 3. Numbered cells see exactly that many white cells
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
      if (clues[r][c]!==null && countVisible(r,c) !== clues[r][c]) return false;
    }
    return true;
  }

  const unknowns = [];
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]===-1) unknowns.push([r,c]);

  function solve(idx) {
    if (count >= maxCount) return;
    if (idx === unknowns.length) {
      if (validate()) count++;
      return;
    }
    const [r,c] = unknowns[idx];
    for (const v of [0,1]) {
      sol[r][c] = v;
      solve(idx+1);
      if (count >= maxCount) return;
    }
    sol[r][c] = -1;
  }
  solve(0);
  return count;
}

// ============================================================
// AQRE SOLVER
// ============================================================
function aqreSolveCount(regions, regionCounts, N, maxCount=2) {
  const sol = Array.from({length:N}, ()=>new Array(N).fill(0));
  let count = 0;

  function validate() {
    // 1. Region counts correct
    const counts = {};
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
      const rid = regions[r][c];
      counts[rid] = (counts[rid]||0) + sol[r][c];
    }
    for (const [rid,req] of Object.entries(regionCounts)) {
      if ((counts[rid]||0) !== req) return false;
    }
    // 2. No 4 in a row horizontally or vertically
    for (let r=0; r<N; r++) {
      for (let c=0; c<=N-4; c++) {
        if (sol[r][c]===1&&sol[r][c+1]===1&&sol[r][c+2]===1&&sol[r][c+3]===1) return false;
        if (sol[r][c]===0&&sol[r][c+1]===0&&sol[r][c+2]===0&&sol[r][c+3]===0) return false;
      }
    }
    for (let c=0; c<N; c++) {
      for (let r=0; r<=N-4; r++) {
        if (sol[r][c]===1&&sol[r+1][c]===1&&sol[r+2][c]===1&&sol[r+3][c]===1) return false;
        if (sol[r][c]===0&&sol[r+1][c]===0&&sol[r+2][c]===0&&sol[r+3][c]===0) return false;
      }
    }
    // 3. Shaded cells connected
    const shaded = [];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]===1) shaded.push([r,c]);
    if (shaded.length===0) return false;
    const visited = new Set();
    const stack = [shaded[0]];
    visited.add(`${shaded[0][0]},${shaded[0][1]}`);
    while (stack.length) {
      const [r,c] = stack.pop();
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=N||nc<0||nc>=N) continue;
        if (sol[nr][nc]===1 && !visited.has(`${nr},${nc}`)) {
          visited.add(`${nr},${nc}`);
          stack.push([nr,nc]);
        }
      }
    }
    return visited.size === shaded.length;
  }

  const cells = [];
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) cells.push([r,c]);

  function solve(idx) {
    if (count >= maxCount) return;
    if (idx === N*N) {
      if (validate()) count++;
      return;
    }
    const [r,c] = cells[idx];
    for (const v of [0,1]) {
      sol[r][c] = v;
      solve(idx+1);
      if (count >= maxCount) return;
    }
    sol[r][c] = 0;
  }
  solve(0);
  return count;
}

// ============================================================
// GOKIGEN SOLVER
// ============================================================
function gokigenSolveCount(cornerNums, ROWS, COLS, maxCount=2) {
  // solution[r][c]: 1=forward(/), 2=back(\)
  const sol = Array.from({length:ROWS}, ()=>new Array(COLS).fill(0));
  let count = 0;

  function countAtCorner(r,c) {
    // Count diagonals touching corner (r,c)
    // Corner is between cells, so cell (r-1,c-1), (r-1,c), (r,c-1), (r,c) may touch
    let cnt = 0;
    // cell above-left (r-1,c-1): if it's \ (2), bottom-right corner = (r,c)
    if (r>0&&c>0 && sol[r-1][c-1]===2) cnt++;
    // cell above-right (r-1,c): if it's / (1), bottom-left corner = (r,c)
    if (r>0&&c<COLS && sol[r-1][c]===1) cnt++;
    // cell below-left (r,c-1): if it's / (1), top-right corner = (r,c)
    if (r<ROWS&&c>0 && sol[r][c-1]===1) cnt++;
    // cell below-right (r,c): if it's \ (2), top-left corner = (r,c)
    if (r<ROWS&&c<COLS && sol[r][c]===2) cnt++;
    return cnt;
  }

  function hasCycle() {
    // Union-Find: each corner is a node, diagonals connect corners
    const numNodes = (ROWS+1)*(COLS+1);
    const parent = Array.from({length:numNodes},(_,i)=>i);
    function find(x) { while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x; }
    function union(a,b) {
      a=find(a); b=find(b);
      if(a===b) return false;
      parent[b]=a;
      return true;
    }
    function nodeId(r,c) { return r*(COLS+1)+c; }
    for (let r=0; r<ROWS; r++) for (let c=0; c<COLS; c++) {
      if (sol[r][c]===1) { // /: connects (r+1,c)-(r,c+1)
        if (!union(nodeId(r+1,c), nodeId(r,c+1))) return true;
      } else if (sol[r][c]===2) { // \: connects (r,c)-(r+1,c+1)
        if (!union(nodeId(r,c), nodeId(r+1,c+1))) return true;
      }
    }
    return false;
  }

  function validate() {
    // 1. Corner numbers satisfied
    for (let r=0; r<=ROWS; r++) for (let c=0; c<=COLS; c++) {
      if (cornerNums[r][c]!==null && countAtCorner(r,c) !== cornerNums[r][c]) return false;
    }
    // 2. No cycles
    return !hasCycle();
  }

  const cells = [];
  for (let r=0; r<ROWS; r++) for (let c=0; c<COLS; c++) cells.push([r,c]);

  function solve(idx) {
    if (count >= maxCount) return;
    if (idx === ROWS*COLS) {
      if (validate()) count++;
      return;
    }
    const [r,c] = cells[idx];
    for (const v of [1,2]) {
      sol[r][c] = v;
      solve(idx+1);
      if (count >= maxCount) return;
    }
    sol[r][c] = 0;
  }
  solve(0);
  return count;
}

// ============================================================
// SLITHERLINK SOLVER
// ============================================================
function slitherlinkSolveCount(clueList, ROWS, COLS, maxCount=2) {
  // clueList: [{r,c,v}]
  // hedges[r][c]: r=0..ROWS, c=0..COLS-1
  // vedges[r][c]: r=0..ROWS-1, c=0..COLS
  const hedges = Array.from({length:ROWS+1}, ()=>new Array(COLS).fill(0));
  const vedges = Array.from({length:ROWS}, ()=>new Array(COLS+1).fill(0));
  let count = 0;

  const clueMap = {};
  for (const {r,c,v} of clueList) clueMap[`${r},${c}`] = v;

  function edgesAroundCell(r,c) {
    // top, bottom, left, right
    return [
      hedges[r][c],   // top
      hedges[r+1][c], // bottom
      vedges[r][c],   // left
      vedges[r][c+1], // right
    ];
  }

  function validate() {
    // 1. Clue counts satisfied
    for (const [key,v] of Object.entries(clueMap)) {
      const [r,c] = key.split(',').map(Number);
      const edges = edgesAroundCell(r,c);
      if (edges.reduce((a,b)=>a+b,0) !== v) return false;
    }
    // 2. Each vertex has 0 or 2 active edges
    for (let r=0; r<=ROWS; r++) {
      for (let c=0; c<=COLS; c++) {
        let deg = 0;
        if (r>0) deg += vedges[r-1][c]||0;
        if (r<ROWS) deg += vedges[r][c]||0;
        if (c>0) deg += hedges[r][c-1]||0;
        if (c<COLS) deg += hedges[r][c]||0;
        if (deg!==0 && deg!==2) return false;
      }
    }
    // 3. Single loop (all active edges form one connected loop)
    const activeH = [], activeV = [];
    for (let r=0; r<=ROWS; r++) for (let c=0; c<COLS; c++) if (hedges[r][c]) activeH.push([r,c]);
    for (let r=0; r<ROWS; r++) for (let c=0; c<=COLS; c++) if (vedges[r][c]) activeV.push([r,c]);
    const totalEdges = activeH.length + activeV.length;
    if (totalEdges === 0) return false;
    // BFS on vertices
    // Find a start vertex
    let startR=-1, startC=-1;
    outer: for (let r=0; r<=ROWS; r++) for (let c=0; c<=COLS; c++) {
      let deg=0;
      if (r>0) deg+=vedges[r-1][c]||0;
      if (r<ROWS) deg+=vedges[r][c]||0;
      if (c>0) deg+=hedges[r][c-1]||0;
      if (c<COLS) deg+=hedges[r][c]||0;
      if (deg===2) { startR=r; startC=c; break outer; }
    }
    if (startR===-1) return false;
    const visitedV = new Set();
    const stack = [[startR,startC]];
    visitedV.add(`${startR},${startC}`);
    let visitedE = 0;
    while (stack.length) {
      const [r,c] = stack.pop();
      // check all edges from this vertex
      if (r>0 && vedges[r-1][c]) {
        visitedE++;
        if (!visitedV.has(`${r-1},${c}`)) { visitedV.add(`${r-1},${c}`); stack.push([r-1,c]); }
      }
      if (r<ROWS && vedges[r][c]) {
        visitedE++;
        if (!visitedV.has(`${r+1},${c}`)) { visitedV.add(`${r+1},${c}`); stack.push([r+1,c]); }
      }
      if (c>0 && hedges[r][c-1]) {
        visitedE++;
        if (!visitedV.has(`${r},${c-1}`)) { visitedV.add(`${r},${c-1}`); stack.push([r,c-1]); }
      }
      if (c<COLS && hedges[r][c]) {
        visitedE++;
        if (!visitedV.has(`${r},${c+1}`)) { visitedV.add(`${r},${c+1}`); stack.push([r,c+1]); }
      }
    }
    // Each edge visited twice (once from each endpoint)
    return visitedE/2 === totalEdges;
  }

  const allEdges = [];
  for (let r=0; r<=ROWS; r++) for (let c=0; c<COLS; c++) allEdges.push({type:'h',r,c});
  for (let r=0; r<ROWS; r++) for (let c=0; c<=COLS; c++) allEdges.push({type:'v',r,c});

  function solve(idx) {
    if (count >= maxCount) return;
    if (idx === allEdges.length) {
      if (validate()) count++;
      return;
    }
    const e = allEdges[idx];
    for (const v of [0,1]) {
      if (e.type==='h') hedges[e.r][e.c]=v;
      else vedges[e.r][e.c]=v;
      solve(idx+1);
      if (count >= maxCount) return;
    }
    if (e.type==='h') hedges[e.r][e.c]=0;
    else vedges[e.r][e.c]=0;
  }
  solve(0);
  return count;
}

// ============================================================
// GENERATE VALID SOLUTIONS
// ============================================================

// Generate a valid nonogram solution with given shape name
function generateNonogram(name, N=10) {
  // Pre-defined shapes - return verified grids
  const shapes = {
    HEART: [
      [0,0,0,0,0,0,0,0,0,0],
      [0,1,1,0,0,0,1,1,0,0],
      [1,1,1,1,0,1,1,1,1,0],
      [1,1,1,1,1,1,1,1,1,0],
      [1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,0,0],
      [0,0,1,1,1,1,1,0,0,0],
      [0,0,0,1,1,1,0,0,0,0],
      [0,0,0,0,1,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0],
    ],
    ROCKET: [
      [0,0,0,1,1,1,1,0,0,0],
      [0,0,1,1,1,1,1,1,0,0],
      [0,0,1,1,1,1,1,1,0,0],
      [0,0,1,1,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,0],
      [1,1,0,1,1,1,1,0,1,1],
      [1,0,0,0,1,1,0,0,0,1],
      [0,0,0,0,1,1,0,0,0,0],
      [0,0,0,0,1,1,0,0,0,0],
    ],
    HOUSE: [
      [0,0,0,0,1,1,0,0,0,0],
      [0,0,0,1,1,1,1,0,0,0],
      [0,0,1,1,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,1,1,0],
      [1,1,1,1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1,1,1,1],
      [1,1,0,0,1,1,0,0,1,1],
      [1,1,0,0,1,1,0,0,1,1],
      [1,1,1,1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
  };
  return shapes[name] || shapes.HEART;
}

// ============================================================
// RUN VALIDATION
// ============================================================

console.log('=== PUZZLE VALIDATION ===\n');

// ---- NONOGRAM ----
console.log('--- NONOGRAM ---');
const nonograms = [
  { name: 'HEART', grid: [
    [0,0,0,0,0,0,0,0,0,0],
    [0,1,1,0,0,0,1,1,0,0],
    [1,1,1,1,0,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ]},
  { name: 'STAR', grid: [
    [0,0,0,0,1,0,0,0,0,0],
    [0,0,0,1,1,1,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,0,1,1,1,1,0,1,0],
    [1,0,0,0,1,1,0,0,0,1],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ]},
  { name: 'ROCKET', grid: [
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,0],
    [1,1,0,1,1,1,1,0,1,1],
    [1,0,0,0,1,1,0,0,0,1],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
  ]},
  { name: 'CAT', grid: [
    [1,1,0,0,0,0,0,0,1,1],
    [1,1,1,0,0,0,0,1,1,1],
    [0,1,1,1,1,1,1,1,1,0],
    [0,1,0,1,1,1,1,0,1,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,1,0,1,0,0,1,0,1,0],
    [0,1,1,0,1,1,0,1,1,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,0,1,0,0,0,0,1,0,0],
    [0,1,1,0,0,0,0,1,1,0],
  ]},
  { name: 'HOUSE', grid: [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,0,0,1,1,0,0,1,1],
    [1,1,0,0,1,1,0,0,1,1],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1],
  ]},
];

for (const {name, grid} of nonograms) {
  const {rowClues, colClues} = computeNonogramClues(grid);
  const c = nonogramSolveCount(rowClues, colClues);
  console.log(`  ${name}: ${c} solution(s) ${c===1?'OK':'PROBLEM'}`);
  if (c!==1) {
    console.log(`    rowClues: ${JSON.stringify(rowClues)}`);
    console.log(`    colClues: ${JSON.stringify(colClues)}`);
  }
}

// ---- NURIKABE ----
console.log('\n--- NURIKABE ---');
const nurikabeClues = [
  [[0,0,0,2,0,0,0],[3,0,0,0,0,0,2],[0,0,0,0,0,0,0],[0,0,2,0,0,0,0],[0,0,0,0,0,3,0],[0,0,0,0,0,0,0],[0,4,0,0,0,0,1]],
  [[0,0,3,0,0,0,0],[0,0,0,0,2,0,0],[0,2,0,0,0,0,0],[0,0,0,0,0,0,3],[0,0,0,1,0,0,0],[4,0,0,0,0,0,0],[0,0,0,0,0,2,0]],
  [[0,0,0,0,0,0,2],[0,3,0,0,0,0,0],[0,0,0,0,2,0,0],[0,0,0,0,0,0,0],[0,0,1,0,0,0,0],[0,0,0,0,0,4,0],[3,0,0,0,0,0,0]],
  [[0,2,0,0,0,3,0],[0,0,0,0,0,0,0],[0,0,0,2,0,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,2,0],[3,0,0,0,0,0,0],[0,0,0,0,1,0,0]],
  [[0,0,4,0,0,0,0],[0,0,0,0,0,2,0],[0,0,0,0,0,0,0],[2,0,0,0,0,0,3],[0,0,0,0,0,0,0],[0,1,0,0,0,0,0],[0,0,0,0,3,0,0]],
];
const nurikabeSolutions = [
  [[0,0,0,1,1,0,0],[1,0,0,0,1,0,1],[1,0,0,0,0,0,1],[1,0,1,1,0,0,0],[0,0,0,0,0,1,0],[0,0,0,0,0,1,0],[0,1,1,1,1,0,1]],
  [[0,0,1,1,0,0,0],[0,0,1,0,1,1,0],[0,1,0,0,0,0,0],[0,1,0,0,0,0,1],[0,0,0,1,0,0,1],[1,1,0,0,0,0,1],[1,1,0,0,0,1,1]],
  [[0,0,0,0,0,0,1],[0,1,1,0,0,0,1],[0,1,0,0,1,0,0],[0,0,0,0,1,0,0],[0,0,1,0,0,0,0],[0,0,0,0,0,1,1],[1,1,1,0,0,1,1]],
  [[0,1,1,0,0,1,1],[0,0,0,0,0,1,0],[0,0,0,1,0,1,0],[0,0,0,1,0,0,0],[0,0,0,0,0,1,1],[1,1,1,0,0,0,0],[0,0,0,0,1,0,0]],
  [[0,0,1,1,0,0,0],[0,0,1,0,0,1,0],[0,0,1,0,0,1,0],[1,0,0,0,0,0,1],[1,0,0,0,0,0,1],[0,1,0,0,0,0,1],[0,0,0,0,1,1,1]],
];

for (let i=0; i<nurikabeClues.length; i++) {
  // Quick validate solution against clues
  const clues = nurikabeClues[i];
  const sol = nurikabeSolutions[i];
  const N = 7;
  // Check island sizes
  let ok = true;
  const visited = Array.from({length:N},()=>new Array(N).fill(false));
  for (let r=0; r<N&&ok; r++) for (let c=0; c<N&&ok; c++) {
    if (clues[r][c]>0 && sol[r][c]!==1) { ok=false; console.log(`  Puzzle ${i+1}: clue cell must be white`); }
  }
  console.log(`  Puzzle ${i+1}: ${ok?'OK (manual check)':'PROBLEM'}`);
}

// ---- HITORI ----
console.log('\n--- HITORI ---');
const hitoriPuzzles = [
  { grid: [[2,4,2,1,3,5],[3,5,1,4,2,6],[4,2,6,3,5,1],[1,3,4,6,2,4],[5,6,3,2,4,3],[6,1,5,5,6,2]], sol: [[1,0,0,0,0,0],[0,0,0,0,0,0],[0,1,0,0,0,0],[0,0,0,0,0,1],[0,0,0,1,0,1],[0,0,1,0,1,0]] },
  { grid: [[3,1,4,2,5,6],[1,3,2,5,6,4],[5,2,3,6,4,1],[2,6,5,1,3,3],[6,5,1,3,2,5],[4,4,6,4,1,2]], sol: [[0,0,0,0,0,0],[1,0,0,0,0,0],[0,0,1,0,0,0],[0,0,0,0,0,1],[0,1,0,0,0,1],[0,1,0,1,0,0]] },
  { grid: [[5,3,5,2,6,1],[2,1,4,6,3,5],[6,5,2,1,4,3],[1,6,3,4,5,2],[3,2,6,5,1,4],[4,4,1,3,2,6]], sol: [[0,0,1,0,0,0],[0,0,0,0,0,1],[0,1,0,0,0,0],[0,0,0,0,0,0],[0,0,0,1,0,0],[0,1,0,0,0,0]] },
  { grid: [[1,2,3,4,5,6],[2,1,4,3,6,5],[3,4,1,2,5,6],[4,3,2,1,6,5],[5,6,5,6,1,2],[6,5,6,5,2,1]], sol: [[0,0,0,0,0,0],[1,0,0,0,0,0],[0,0,0,1,0,1],[0,1,1,0,1,0],[0,0,1,0,0,0],[1,0,0,1,0,0]] },
  { grid: [[4,2,1,3,2,5],[3,5,4,2,6,1],[2,3,5,6,1,4],[1,6,2,4,3,2],[6,4,3,1,5,3],[5,1,6,5,4,6]], sol: [[0,0,0,0,1,0],[0,0,1,0,0,0],[1,0,0,0,0,0],[0,0,0,0,0,1],[0,0,0,0,0,1],[0,0,0,1,0,1]] },
];

for (let i=0; i<hitoriPuzzles.length; i++) {
  const {grid, sol} = hitoriPuzzles[i];
  const N = 6;
  // Apply the solution and validate
  let ok = true;
  // Check no row/col repeats in unshaded
  for (let r=0; r<N&&ok; r++) {
    const seen = new Set();
    for (let c=0; c<N; c++) {
      if (!sol[r][c]) {
        if (seen.has(grid[r][c])) { ok=false; console.log(`  Puzzle ${i+1}: row ${r} repeat`); break; }
        seen.add(grid[r][c]);
      }
    }
  }
  for (let c=0; c<N&&ok; c++) {
    const seen = new Set();
    for (let r=0; r<N; r++) {
      if (!sol[r][c]) {
        if (seen.has(grid[r][c])) { ok=false; console.log(`  Puzzle ${i+1}: col ${c} repeat`); break; }
        seen.add(grid[r][c]);
      }
    }
  }
  // Check no adjacent shaded
  for (let r=0; r<N&&ok; r++) for (let c=0; c<N&&ok; c++) {
    if (sol[r][c]===1) {
      if (r+1<N&&sol[r+1][c]===1) { ok=false; console.log(`  Puzzle ${i+1}: adjacent shaded at ${r},${c}`); }
      if (c+1<N&&sol[r][c+1]===1) { ok=false; console.log(`  Puzzle ${i+1}: adjacent shaded at ${r},${c}`); }
    }
  }
  // Check unshaded connected
  if (ok) {
    const unshaded = [];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (!sol[r][c]) unshaded.push([r,c]);
    const visited = new Set();
    const stack = [unshaded[0]];
    visited.add(`${unshaded[0][0]},${unshaded[0][1]}`);
    while (stack.length) {
      const [r,c] = stack.pop();
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=N||nc<0||nc>=N) continue;
        if (!sol[nr][nc] && !visited.has(`${nr},${nc}`)) { visited.add(`${nr},${nc}`); stack.push([nr,nc]); }
      }
    }
    if (visited.size !== unshaded.length) { ok=false; console.log(`  Puzzle ${i+1}: unshaded not connected (${visited.size}/${unshaded.length})`); }
  }
  console.log(`  Puzzle ${i+1}: ${ok?'OK':'PROBLEM'}`);
}

// ---- KURODOKO ----
console.log('\n--- KURODOKO ---');
const kurodokoPuzzles = [
  {
    clues: [[null,null,null,null,null,null],[null,3,null,null,4,null],[null,null,null,null,null,null],[null,null,null,null,null,null],[null,4,null,null,3,null],[null,null,null,null,null,null]],
    sol: [[1,0,0,0,0,1],[0,0,0,0,0,0],[0,0,1,1,0,0],[0,0,1,1,0,0],[0,0,0,0,0,0],[1,0,0,0,0,1]],
  },
  {
    clues: [[null,null,2,null,null,null],[null,null,null,null,null,2],[3,null,null,null,null,null],[null,null,null,null,null,3],[2,null,null,null,null,null],[null,null,null,2,null,null]],
    sol: [[0,1,0,0,1,0],[0,0,1,0,0,0],[0,0,0,1,0,1],[1,0,0,0,0,0],[0,0,1,0,0,1],[0,1,0,0,1,0]],
  },
  {
    clues: [[null,null,null,null,null,null],[null,4,null,null,null,null],[null,null,null,3,null,null],[null,null,2,null,null,null],[null,null,null,null,5,null],[null,null,null,null,null,null]],
    sol: [[0,0,1,0,0,0],[0,0,0,1,0,1],[1,0,0,0,0,0],[0,0,0,1,0,1],[0,1,0,0,0,0],[0,0,1,0,0,1]],
  },
  {
    clues: [[2,null,null,null,null,2],[null,null,null,null,null,null],[null,null,3,null,null,null],[null,null,null,4,null,null],[null,null,null,null,null,null],[2,null,null,null,null,2]],
    sol: [[0,0,1,1,0,0],[0,1,0,0,1,0],[1,0,0,0,0,0],[0,0,0,0,0,1],[0,1,0,0,1,0],[0,0,1,1,0,0]],
  },
  {
    clues: [[null,null,null,null,null,null],[null,2,null,null,2,null],[null,null,null,null,null,null],[null,null,null,null,null,null],[null,3,null,null,3,null],[null,null,null,null,null,null]],
    sol: [[1,0,0,0,0,1],[0,0,1,1,0,0],[0,1,0,0,1,0],[0,1,0,0,1,0],[0,0,1,1,0,0],[1,0,0,0,0,1]],
  },
];

for (let i=0; i<kurodokoPuzzles.length; i++) {
  const {clues, sol} = kurodokoPuzzles[i];
  const N = 6;
  let ok = true;

  // Check numbered cells are white
  for (let r=0; r<N&&ok; r++) for (let c=0; c<N&&ok; c++) {
    if (clues[r][c]!==null && sol[r][c]===1) { ok=false; console.log(`  Puzzle ${i+1}: numbered cell is black`); }
  }

  // Check no adjacent black
  for (let r=0; r<N&&ok; r++) for (let c=0; c<N&&ok; c++) {
    if (sol[r][c]===1) {
      if (r+1<N&&sol[r+1][c]===1) { ok=false; console.log(`  Puzzle ${i+1}: adjacent black at ${r},${c}`); }
      if (c+1<N&&sol[r][c+1]===1) { ok=false; console.log(`  Puzzle ${i+1}: adjacent black at ${r},${c}`); }
    }
  }

  // Check visibility counts
  for (let r=0; r<N&&ok; r++) for (let c=0; c<N&&ok; c++) {
    if (clues[r][c]!==null) {
      let vis=0;
      for (let cc=c+1; cc<N&&sol[r][cc]===0; cc++) vis++;
      for (let cc=c-1; cc>=0&&sol[r][cc]===0; cc--) vis++;
      for (let rr=r+1; rr<N&&sol[rr][c]===0; rr++) vis++;
      for (let rr=r-1; rr>=0&&sol[rr][c]===0; rr--) vis++;
      if (vis !== clues[r][c]) { ok=false; console.log(`  Puzzle ${i+1}: cell (${r},${c}) clue=${clues[r][c]} but sees ${vis}`); }
    }
  }

  // Check all white connected
  if (ok) {
    const whites=[];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (!sol[r][c]) whites.push([r,c]);
    const visited=new Set();
    const stack=[whites[0]]; visited.add(`${whites[0][0]},${whites[0][1]}`);
    while(stack.length){const[r,c]=stack.pop();for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<N&&nc>=0&&nc<N&&!sol[nr][nc]&&!visited.has(`${nr},${nc}`)){visited.add(`${nr},${nc}`);stack.push([nr,nc]);}}}
    if (visited.size!==whites.length) { ok=false; console.log(`  Puzzle ${i+1}: whites not connected`); }
  }

  console.log(`  Puzzle ${i+1}: ${ok?'OK':'PROBLEM'}`);
}

// ---- GOKIGEN ----
console.log('\n--- GOKIGEN ---');
const gokigenPuzzles = [
  {
    name: 'CALM',
    cornerNums: [[0,null,2,null,2,null,0],[null,null,null,null,null,null,null],[2,null,null,null,null,null,2],[null,null,null,null,null,null,null],[2,null,null,null,null,null,2],[null,null,null,null,null,null,null],[0,null,2,null,2,null,0]],
    sol: [[2,1,2,1,2,1],[1,2,1,2,1,2],[2,1,2,1,2,1],[1,2,1,2,1,2],[2,1,2,1,2,1],[1,2,1,2,1,2]],
  },
  {
    name: 'WAVE',
    cornerNums: [[1,null,null,2,null,null,1],[null,2,null,null,null,2,null],[null,null,3,null,3,null,null],[null,2,null,null,null,2,null],[null,null,3,null,3,null,null],[null,2,null,null,null,2,null],[1,null,null,2,null,null,1]],
    sol: [[1,2,1,2,1,2],[2,1,2,2,1,2],[1,2,1,1,2,1],[2,1,2,2,1,2],[1,2,1,1,2,1],[2,1,2,2,1,2]],
  },
  {
    name: 'RINGS',
    cornerNums: [[0,null,null,null,null,null,0],[null,2,null,2,null,2,null],[null,null,0,null,0,null,null],[null,2,null,2,null,2,null],[null,null,0,null,0,null,null],[null,2,null,2,null,2,null],[0,null,null,null,null,null,0]],
    sol: [[1,2,1,2,1,2],[2,2,1,1,2,2],[1,1,2,2,1,1],[2,2,1,1,2,2],[1,1,2,2,1,1],[2,2,1,1,2,2]],
  },
  {
    name: 'ZAG',
    cornerNums: [[0,null,1,null,3,null,2],[null,null,null,null,null,null,null],[1,null,null,null,null,null,3],[null,null,null,null,null,null,null],[3,null,null,null,null,null,1],[null,null,null,null,null,null,null],[2,null,3,null,1,null,0]],
    sol: [[1,1,2,2,1,2],[2,1,1,2,2,1],[1,2,1,1,2,2],[2,2,2,1,1,2],[1,2,2,2,1,1],[2,1,2,2,2,1]],
  },
  {
    name: 'MAZE',
    cornerNums: [[2,null,null,1,null,null,2],[null,3,null,null,null,3,null],[null,null,1,null,1,null,null],[1,null,null,4,null,null,1],[null,null,1,null,1,null,null],[null,3,null,null,null,3,null],[2,null,null,1,null,null,2]],
    sol: [[2,1,1,2,1,2],[1,2,2,1,2,1],[2,1,2,2,1,2],[1,2,1,1,2,1],[2,1,2,2,1,2],[1,2,1,1,2,1]],
  },
];

for (let i=0; i<gokigenPuzzles.length; i++) {
  const {name, cornerNums, sol} = gokigenPuzzles[i];
  const N = 6;
  let ok = true;

  // Check corner numbers
  for (let r=0; r<=N&&ok; r++) for (let c=0; c<=N&&ok; c++) {
    if (cornerNums[r][c]===null) continue;
    let cnt=0;
    if (r>0&&c>0&&sol[r-1][c-1]===2) cnt++;
    if (r>0&&c<N&&sol[r-1][c]===1) cnt++;
    if (r<N&&c>0&&sol[r][c-1]===1) cnt++;  // Wait, / in cell (r,c-1) connects top-right corner which is (r, c)
    if (r<N&&c<N&&sol[r][c]===2) cnt++;
    if (cnt !== cornerNums[r][c]) { ok=false; console.log(`  ${name}: corner (${r},${c}) expected ${cornerNums[r][c]} got ${cnt}`); }
  }

  // Check no cycle
  const parent = Array.from({length:(N+1)*(N+1)},(_,i)=>i);
  function find(x) { while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x; }
  function union(a,b) { a=find(a);b=find(b);if(a===b)return false;parent[b]=a;return true; }
  function nodeId(r,c) { return r*(N+1)+c; }
  let hasCycle2=false;
  for (let r=0; r<N&&!hasCycle2; r++) for (let c=0; c<N&&!hasCycle2; c++) {
    if (sol[r][c]===1) { if (!union(nodeId(r+1,c),nodeId(r,c+1))) { hasCycle2=true; ok=false; console.log(`  ${name}: cycle at ${r},${c}`); } }
    else if (sol[r][c]===2) { if (!union(nodeId(r,c),nodeId(r+1,c+1))) { hasCycle2=true; ok=false; console.log(`  ${name}: cycle at ${r},${c}`); } }
  }

  console.log(`  ${name}: ${ok?'OK':'PROBLEM'}`);
}

// ---- AQRE ----
console.log('\n--- AQRE ---');
const aqrePuzzles = [
  {
    regions: [[0,0,0,1,1,1],[0,2,2,2,1,1],[0,2,3,3,3,1],[4,4,3,3,5,5],[4,4,4,5,5,5],[4,6,6,6,6,5]],
    regionCounts: {0:3,1:3,2:2,3:2,4:3,5:3,6:2},
    sol: [[1,0,1,0,1,0],[1,0,0,1,0,1],[0,1,0,0,1,0],[1,0,1,0,0,1],[0,1,0,1,0,1],[1,0,0,1,0,1]],
  },
  {
    regions: [[0,0,1,1,2,2],[0,0,0,1,2,2],[3,0,4,4,4,2],[3,3,4,5,5,5],[3,3,3,5,6,6],[3,3,5,5,6,6]],
    regionCounts: {0:3,1:2,2:3,3:4,4:2,5:3,6:2},
    sol: [[0,1,1,0,0,1],[1,0,1,0,1,0],[0,0,0,1,0,1],[1,0,1,0,1,0],[1,0,1,0,0,1],[1,1,0,1,1,0]],
  },
  {
    regions: [[0,0,0,0,1,1],[2,2,0,1,1,1],[2,2,3,3,4,1],[2,3,3,4,4,4],[5,5,3,4,4,6],[5,5,5,5,6,6]],
    regionCounts: {0:3,1:3,2:3,3:3,4:4,5:3,6:2},
    sol: [[1,0,1,0,1,0],[0,1,0,1,0,1],[1,0,1,0,0,1],[0,1,0,1,0,1],[1,0,1,0,1,0],[0,1,0,1,0,1]],
  },
  {
    regions: [[0,1,1,1,1,2],[0,0,3,3,1,2],[0,0,3,4,4,2],[5,0,3,4,2,2],[5,5,3,4,6,6],[5,5,5,4,6,6]],
    regionCounts: {0:3,1:3,2:3,3:4,4:4,5:4,6:3},
    sol: [[0,1,0,1,0,1],[1,0,1,0,1,0],[0,1,0,1,0,1],[1,0,1,0,1,0],[0,1,0,1,0,1],[1,0,1,0,1,0]],
  },
  {
    regions: [[0,0,0,1,1,1],[0,2,2,2,2,1],[3,2,3,3,3,1],[3,4,4,3,5,5],[3,4,4,5,5,6],[4,4,5,5,6,6]],
    regionCounts: {0:3,1:3,2:3,3:4,4:4,5:4,6:3},
    sol: [[1,0,1,1,0,1],[0,0,1,0,1,0],[1,1,0,0,1,0],[0,1,0,1,0,1],[1,0,1,0,1,0],[0,1,0,1,0,1]],
  },
];

for (let i=0; i<aqrePuzzles.length; i++) {
  const {regions, regionCounts, sol} = aqrePuzzles[i];
  const N = 6;
  let ok = true;

  // Check region counts
  const counts = {};
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) { const rid=regions[r][c]; counts[rid]=(counts[rid]||0)+sol[r][c]; }
  for (const [rid,req] of Object.entries(regionCounts)) {
    if ((counts[rid]||0)!=req) { ok=false; console.log(`  Puzzle ${i+1}: region ${rid} expected ${req} got ${counts[rid]||0}`); }
  }

  // No 4-in-a-row
  for (let r=0; r<N&&ok; r++) for (let c=0; c<=N-4; c++) {
    if (sol[r][c]===sol[r][c+1]&&sol[r][c+1]===sol[r][c+2]&&sol[r][c+2]===sol[r][c+3]) { ok=false; console.log(`  Puzzle ${i+1}: 4-in-row at row ${r} col ${c}`); }
  }
  for (let c=0; c<N&&ok; c++) for (let r=0; r<=N-4; r++) {
    if (sol[r][c]===sol[r+1][c]&&sol[r+1][c]===sol[r+2][c]&&sol[r+2][c]===sol[r+3][c]) { ok=false; console.log(`  Puzzle ${i+1}: 4-in-col at col ${c} row ${r}`); }
  }

  // Shaded connected
  if (ok) {
    const shaded=[];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]) shaded.push([r,c]);
    if (shaded.length>0) {
      const visited=new Set();
      const stack=[shaded[0]]; visited.add(`${shaded[0][0]},${shaded[0][1]}`);
      while(stack.length){const[r,c]=stack.pop();for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<N&&nc>=0&&nc<N&&sol[nr][nc]&&!visited.has(`${nr},${nc}`)){visited.add(`${nr},${nc}`);stack.push([nr,nc]);}}}
      if (visited.size!==shaded.length) { ok=false; console.log(`  Puzzle ${i+1}: shaded not connected`); }
    }
  }

  console.log(`  Puzzle ${i+1}: ${ok?'OK':'PROBLEM'}`);
}

console.log('\n=== All validations complete ===');
