'use strict';

function validateNurikabe(clues, sol, N) {
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
    if (clues[r][c]>0 && sol[r][c]!==1) return `clue cell not white at ${r},${c}`;
  }
  const visited = Array.from({length:N},()=>new Array(N).fill(false));
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
    if (sol[r][c]===1 && !visited[r][c]) {
      const cells = []; const stack = [[r,c]]; visited[r][c] = true;
      let clueCount = 0, clueSize = 0;
      while (stack.length) {
        const [cr,cc] = stack.pop(); cells.push([cr,cc]);
        if (clues[cr][cc]>0) { clueCount++; clueSize = clues[cr][cc]; }
        for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr=cr+dr, nc=cc+dc;
          if (nr>=0&&nr<N&&nc>=0&&nc<N&&sol[nr][nc]===1&&!visited[nr][nc]) { visited[nr][nc]=true; stack.push([nr,nc]); }
        }
      }
      if (clueCount !== 1) return `island has ${clueCount} clues at ${r},${c}`;
      if (cells.length !== clueSize) return `size mismatch at ${r},${c} got ${cells.length} need ${clueSize}`;
    }
  }
  const blacks = [];
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (sol[r][c]===0) blacks.push([r,c]);
  if (blacks.length>0) {
    const bVis = new Set(); const stack = [blacks[0]]; bVis.add(blacks[0].join(','));
    while (stack.length) {
      const [r,c]=stack.pop();
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr,nc=c+dc;
        if (nr>=0&&nr<N&&nc>=0&&nc<N&&sol[nr][nc]===0&&!bVis.has(`${nr},${nc}`)) { bVis.add(`${nr},${nc}`); stack.push([nr,nc]); }
      }
    }
    if (bVis.size!==blacks.length) return `river not connected ${bVis.size}/${blacks.length}`;
  }
  for (let r=0; r<N-1; r++) for (let c=0; c<N-1; c++) {
    if (sol[r][c]===0&&sol[r+1][c]===0&&sol[r][c+1]===0&&sol[r+1][c+1]===0) return `2x2 black at ${r},${c}`;
  }
  return null;
}

// The KEY problem: island cells in different islands must not be adjacent to each other
// Also: white cells placed at (row, col) must only form one connected component per island

// I'll use a direct solver approach: explicitly list ALL white cells for ALL islands
// Then verify the grid manually

// Using the staggered base pattern: whites at (1,1),(1,3),(1,5),(3,1),(3,3),(3,5),(5,1),(5,3),(5,5)
// Each is isolated from others (minimum distance 2 via any path through whites)
// These 9 cells are all size-1 islands.

// Now I'll carefully grow only some of them, checking connectivity through whites

function buildPuzzle(whiteSets, N) {
  // whiteSets: array of {clueCell:[r,c], cells:[[r,c],...]}
  // All cells in each set form one island. Islands must not touch.
  const sol = Array.from({length:N},()=>new Array(N).fill(0));
  const clues = Array.from({length:N},()=>new Array(N).fill(0));
  const allWhites = new Set();

  for (const {clueCell, cells} of whiteSets) {
    const [cr,cc] = clueCell;
    clues[cr][cc] = cells.length;
    for (const [r,c] of cells) {
      if (allWhites.has(`${r},${c}`)) {
        console.log(`  OVERLAP: cell ${r},${c}`);
        return null;
      }
      allWhites.add(`${r},${c}`);
      sol[r][c] = 1;
    }
  }

  // Verify each island is connected
  for (const {clueCell, cells} of whiteSets) {
    const set = new Set(cells.map(([r,c])=>`${r},${c}`));
    const visited = new Set();
    const stack = [cells[0]]; visited.add(`${cells[0][0]},${cells[0][1]}`);
    while (stack.length) {
      const [r,c] = stack.pop();
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr=r+dr,nc=c+dc;
        const k = `${nr},${nc}`;
        if (set.has(k) && !visited.has(k)) { visited.add(k); stack.push([nr,nc]); }
      }
    }
    if (visited.size !== cells.length) {
      console.log(`  Island at ${clueCell} is disconnected`);
      return null;
    }
  }

  // Verify islands don't touch each other
  for (let i=0; i<whiteSets.length; i++) {
    const setI = new Set(whiteSets[i].cells.map(([r,c])=>`${r},${c}`));
    for (let j=i+1; j<whiteSets.length; j++) {
      const setJ = new Set(whiteSets[j].cells.map(([r,c])=>`${r},${c}`));
      // Check if any cell in i is adjacent to any cell in j
      for (const k of setI) {
        const [r,c] = k.split(',').map(Number);
        for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          if (setJ.has(`${r+dr},${c+dc}`)) {
            console.log(`  Islands ${i} and ${j} touch at (${r},${c})-(${r+dr},${c+dc})`);
            return null;
          }
        }
      }
    }
  }

  return {clues, sol};
}

function test(whiteSets, N, name) {
  const res = buildPuzzle(whiteSets, N);
  if (!res) { console.log(`${name}: BUILD FAILED`); return; }
  const err = validateNurikabe(res.clues, res.sol, N);
  if (err) { console.log(`${name}: ${err}`); return; }
  console.log(`${name}: OK`);
  console.log(`  clues: ${JSON.stringify(res.clues)}`);
  console.log(`  sol: ${JSON.stringify(res.sol)}`);
}

const N = 7;

// Design each puzzle with explicit cell lists, verified by hand for isolation:

// P1: Use staggered-base pattern, grow a few islands
// Base isolated positions: (1,1),(1,3),(1,5),(3,1),(3,3),(3,5),(5,1),(5,3),(5,5)
// Grow (1,1) by adding (0,1),(0,0): size=3 (none of these adj to (1,3))
// Keep (1,3) size=1
// Grow (1,5) by adding (0,5): size=2
// Grow (3,1) by adding (3,0): size=2
// Grow (3,3) by adding (2,3),(2,4): size=3 - check (2,3) not adj (1,3)? (2,3) adj (1,3)=yes! BAD.
// Grow (3,3) by adding (4,3): size=2 - check (4,3) not adj (5,3)? yes adjacent! BAD.
// Grow (3,3) by adding (3,2): size=2 - check (3,2) not adj (3,1)? yes adjacent! BAD.
// Just keep (3,3) size=1
// Grow (3,5) by adding (2,5): size=2 - (2,5) not adj (1,5)? (2,5) adj (1,5)=yes! BAD.
// Grow (3,5) by adding (3,6): size=2 - (3,6) not adj any others? Check (3,6) adj (1,5)? No. adj (3,1)? No. adj (3,3)? col diff=3. SAFE.
// Grow (5,1) by adding (6,1),(6,2): size=3 - (6,2) not adj (5,3)? (6,2) adj (5,3)? diagonal. SAFE. (6,2) not adj (5,1)? wait (6,2) adj (5,2) only. SAFE.
// Keep (5,3) size=1
// Grow (5,5) by adding (6,5),(6,6): size=3 - (6,5) adj (6,2)? col diff=3. SAFE. (6,5) adj (5,3)? No.

test([
  {clueCell:[1,1], cells:[[0,0],[0,1],[1,1]]},  // size 3
  {clueCell:[1,3], cells:[[1,3]]},               // size 1
  {clueCell:[1,5], cells:[[0,5],[1,5]]},         // size 2
  {clueCell:[3,1], cells:[[3,0],[3,1]]},         // size 2
  {clueCell:[3,3], cells:[[3,3]]},               // size 1
  {clueCell:[3,5], cells:[[3,5],[3,6]]},         // size 2
  {clueCell:[5,1], cells:[[5,1],[6,1],[6,2]]},   // size 3
  {clueCell:[5,3], cells:[[5,3]]},               // size 1
  {clueCell:[5,5], cells:[[5,5],[6,5],[6,6]]},   // size 3
], N, 'P1');

// P2: different arrangement
// Start: (1,1),(1,3),(1,5),(3,1),(3,3),(3,5),(5,1),(5,3),(5,5)
// Grow (1,1) + (0,1): size=2
// Grow (1,5) + (0,5) + (0,6): size=3 - (0,6) adj (1,5)? No, (0,6) adj (0,5). SAFE.
// Grow (3,1) + (4,1): wait (4,1) adj (5,1)? YES. BAD.
// Grow (3,1) + (2,1): (2,1) adj (1,1)? YES. BAD.
// Keep (3,1) size=1
// Grow (3,3) + (2,3) + (2,2): (2,3) adj (1,3)? YES. BAD.
// Grow (3,3) + (4,3) + (4,2): (4,3) adj (5,3)? YES. BAD.
// Hmm, (3,3) is really hard to grow without hitting adjacents.
// Grow (3,3) + (3,2): adj (3,1)? YES. BAD.
// Grow (3,3) + (3,4): adj (3,5)? YES. BAD.
// (3,3) is boxed in by other islands! Can only keep size 1.
// Grow (3,5) + (4,5): (4,5) adj (5,5)? YES. BAD. adj (5,3)? No (diagonal).
// Grow (3,5) + (2,5) + (2,6): (2,5) adj (1,5)? YES. BAD.
// The (3,5) position is also tricky.
// Grow (5,3) + (6,3): (6,3) adj (6,2)? If (6,2) is in island(5,1), YES. BAD.
// Grow (5,3) + (4,3): adj (3,3)? YES. BAD.
// (5,3) boxed in!
// So the middle positions are very constrained. Use different layout.

// Try layout where islands are NOT on the checker pattern:
test([
  {clueCell:[0,0], cells:[[0,0],[0,1],[0,2],[0,3]]}, // size 4 top row
  {clueCell:[0,5], cells:[[0,5],[0,6]]},             // size 2
  {clueCell:[2,2], cells:[[2,2],[2,3]]},             // size 2 - (2,3) adj (0,3)? row diff=2 SAFE
  {clueCell:[2,5], cells:[[2,5],[3,5],[3,6]]},       // size 3
  {clueCell:[4,0], cells:[[4,0],[5,0],[6,0]]},       // size 3 - (4,0) adj (2,2)? No
  {clueCell:[4,3], cells:[[4,3]]},                   // size 1 - adj (4,0)? No. adj (2,3)? row diff=2 SAFE
  {clueCell:[6,3], cells:[[6,3],[6,4]]},             // size 2 - adj (4,3)? row diff=2 SAFE
  {clueCell:[5,5], cells:[[5,5],[6,5],[6,6]]},       // size 3
], N, 'P2');

test([
  {clueCell:[0,1], cells:[[0,1],[0,2]]},             // size 2
  {clueCell:[0,4], cells:[[0,4],[0,5],[0,6]]},       // size 3
  {clueCell:[2,0], cells:[[2,0],[3,0],[4,0]]},       // size 3
  {clueCell:[2,3], cells:[[2,3],[2,4]]},             // size 2 - (2,3) adj (2,0)? col diff=3 SAFE. (2,4) adj (0,4)? row diff=2 SAFE.
  {clueCell:[4,4], cells:[[4,4],[4,5],[5,5]]},       // size 3 - (4,4) adj (2,4)? row diff=2 SAFE. (4,5) adj (0,5)? No.
  {clueCell:[4,2], cells:[[4,2]]},                   // size 1 - adj (4,4)? col diff=2 SAFE. adj (4,0)? col diff=2 SAFE. adj (2,3)? diagonal SAFE.
  {clueCell:[6,1], cells:[[6,1],[6,2]]},             // size 2
  {clueCell:[6,5], cells:[[6,5],[6,6]]},             // size 2 - (6,6) adj (5,5)? YES! BAD.
], N, 'P3v1');

test([
  {clueCell:[0,1], cells:[[0,1],[0,2]]},             // size 2
  {clueCell:[0,4], cells:[[0,4],[0,5],[0,6]]},       // size 3
  {clueCell:[2,0], cells:[[2,0],[3,0],[4,0]]},       // size 3
  {clueCell:[2,3], cells:[[2,3],[2,4]]},             // size 2
  {clueCell:[4,4], cells:[[4,4],[4,5],[5,5]]},       // size 3 - (5,5) adj (6,5)? (6,5) not in any island yet. FINE.
  {clueCell:[4,2], cells:[[4,2]]},                   // size 1
  {clueCell:[6,1], cells:[[6,1],[6,2]]},             // size 2
  {clueCell:[6,4], cells:[[6,4]]},                   // size 1 - adj (5,5)? diagonal SAFE. adj (6,2)? col diff=2 SAFE.
], N, 'P3v2');

test([
  {clueCell:[0,0], cells:[[0,0],[1,0]]},             // size 2
  {clueCell:[0,3], cells:[[0,3],[0,4],[0,5]]},       // size 3
  {clueCell:[2,2], cells:[[2,2],[3,2],[4,2]]},       // size 3
  {clueCell:[2,5], cells:[[2,5],[2,6]]},             // size 2
  {clueCell:[4,5], cells:[[4,5],[5,5],[6,5]]},       // size 3 - (4,5) adj (2,5)? row diff=2 SAFE. adj (4,2)? col diff=3 SAFE.
  {clueCell:[5,1], cells:[[5,1],[6,1]]},             // size 2 - adj (4,2)? diagonal SAFE. adj (6,5)? No.
  {clueCell:[6,3], cells:[[6,3]]},                   // size 1 - adj (6,1)? col diff=2 SAFE. adj (6,5)? col diff=2 SAFE.
], N, 'P4');

test([
  {clueCell:[0,2], cells:[[0,2],[0,3],[1,3]]},       // size 3 - L shape
  {clueCell:[0,5], cells:[[0,5],[0,6],[1,6]]},       // size 3
  {clueCell:[2,0], cells:[[2,0],[2,1]]},             // size 2
  {clueCell:[3,4], cells:[[3,4],[4,4],[5,4]]},       // size 3 vertical
  {clueCell:[4,1], cells:[[4,1],[5,1]]},             // size 2 - (4,1) adj (2,1)? row diff=2 SAFE. (5,1) adj (5,4)? col diff=3 SAFE.
  {clueCell:[6,0], cells:[[6,0],[6,1],[6,2]]},       // size 3 - (6,1) adj (5,1)? YES! BAD.
], N, 'P5v1');

test([
  {clueCell:[0,2], cells:[[0,2],[0,3],[1,3]]},       // size 3
  {clueCell:[0,5], cells:[[0,5],[0,6],[1,6]]},       // size 3
  {clueCell:[2,0], cells:[[2,0],[2,1]]},             // size 2
  {clueCell:[3,4], cells:[[3,4],[4,4],[5,4]]},       // size 3
  {clueCell:[4,1], cells:[[4,1]]},                   // size 1 - adj (2,1)? row diff=2 SAFE.
  {clueCell:[6,0], cells:[[6,0],[6,1],[6,2]]},       // size 3 - (6,1) adj (4,1)? row diff=2 SAFE.
  {clueCell:[6,5], cells:[[6,5]]},                   // size 1 - adj (5,4)? diagonal SAFE. adj (6,2)? col diff=3 SAFE.
], N, 'P5');
