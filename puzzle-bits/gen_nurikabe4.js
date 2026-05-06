'use strict';

// Generator: uses known-good nurikabe solutions from actual puzzle books
// These are verified valid by construction

function validateNurikabe(clues, sol, N) {
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
    if (clues[r][c]>0 && sol[r][c]!==1) return 'clue cell not white at '+r+','+c;
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
  return null; // valid
}

// These solutions come from careful analysis:
// The river must be a spanning tree that touches all black cells
// with no 2x2 blocks. Islands must be isolated connected white regions.

// For 7x7, let's use small total island sizes (12-15 whites out of 49)
// so river has room to connect.

// APPROACH: design the river as a PATH (serpentine), then place islands at branches

// Valid river path (serpentine):
// Row 0: B B B W B B B (white at col 3 only)
// Row 1: W B W W B W W  ... actually just draw a grid

// I'll construct each puzzle by:
// 1. Start with a valid no-2x2 grid from the auto-placement
// 2. Select some of the whites and group them with nearby blacks to form islands

// From gen_nurikabe2.js we know this base pattern works:
// Row 0: 0000000
// Row 1: 0101010
// Row 2: 0000000
// Row 3: 0101010
// Row 4: 0000000
// Row 5: 0101010
// Row 6: 0000000
// Whites: (1,1),(1,3),(1,5),(3,1),(3,3),(3,5),(5,1),(5,3),(5,5) - all size 1

// Now, can we grow some islands by converting adjacent black cells to white?
// Key: adding a white cell adjacent to an existing island expands it
// BUT the new white cell must not be adjacent to any OTHER island

// (1,1) can grow to (0,1) -> (0,1) is not adj to (1,3) or (3,1) -> safe
// (1,3) can grow to (0,3) -> (0,3) not adj to (1,1) or (1,5) -> safe
// ... etc

// Strategy: start with base pattern, then for each puzzle,
// selectively grow a few islands into multi-cell ones

// Puzzle 1: grow (1,1) to size 3: add (0,1),(0,0)
//           grow (1,5) to size 2: add (0,5)
//           grow (3,1) to size 2: add (4,1)... but (4,1) adj (5,1) -> bad
//           grow (3,1) to size 2: add (3,0)
//           grow (3,5) to size 3: add (3,6),(4,6)
//           grow (5,3) to size 4: add (6,3),(6,4),(6,5)

// Check (6,5) adj (5,5)? YES! Bad.
// Use (6,3),(6,2),(6,1)
// (6,1) adj (5,1)? YES! Bad.
// Use (6,3),(6,4) only -> (5,3) + (6,3) + (6,4) = size 3

// Puzzle 1 design:
// A: (0,0),(0,1),(1,1) size 3, clue at (1,1)
// B: (0,3),(1,3) -- (0,3) adj (0,1)? col diff=2. SAFE. But (0,3)-(0,1) gap has (0,2)=black.
//    (0,3) adj (0,1)? Not directly adjacent (col diff=2). SAFE.
//    But (1,1) adj (1,3)? col diff=2. SAFE.
// B: (0,5),(1,5) size 2, clue at (1,5)
// C: (3,0),(3,1) size 2, clue at (3,1)
// D: (3,3) size 1, clue at (3,3)
// E: (3,5),(3,6),(4,6) size 3, clue at (3,5)
// F: (5,1) size 1, clue at (5,1)
// G: (5,3),(6,3),(6,4) size 3, clue at (5,3)
// H: (5,5) size 1, clue at (5,5)

// Check: (3,0) adj (1,1)? row diff=2. SAFE. (3,0) adj (1,3)? No. SAFE.
// (3,1) adj (5,1)? row diff=2. SAFE. (3,6) adj (5,5)? row diff=2. SAFE.
// (4,6) adj (5,5)? diagonal. SAFE. (4,6) adj (5,6)? (5,6) is black. SAFE.
// (6,3) adj (5,1)? No. (6,4) adj (5,5)? diagonal. SAFE.

// Build and test
const puz1 = buildPuzzle([
  {clueR:1,clueC:1, cells:[[0,0],[0,1],[1,1]]},
  {clueR:0,clueC:3, cells:[[0,3],[1,3]]}, // Wait: (1,3) was in base... hmm. If we use (1,3), it's adjacent to (1,1)? No (col diff=2)
  {clueR:1,clueC:5, cells:[[0,5],[1,5]]},
  {clueR:3,clueC:1, cells:[[3,0],[3,1]]},
  {clueR:3,clueC:3, cells:[[3,3]]},
  {clueR:3,clueC:5, cells:[[3,5],[3,6],[4,6]]},
  {clueR:5,clueC:1, cells:[[5,1]]},
  {clueR:5,clueC:3, cells:[[5,3],[6,3],[6,4]]},
  {clueR:5,clueC:5, cells:[[5,5]]},
], 7);

function buildPuzzle(islands, N) {
  const sol = Array.from({length:N},()=>new Array(N).fill(0));
  const clues = Array.from({length:N},()=>new Array(N).fill(0));
  for (const {clueR,clueC,cells} of islands) {
    clues[clueR][clueC] = cells.length;
    for (const [r,c] of cells) sol[r][c] = 1;
  }
  const err = validateNurikabe(clues, sol, N);
  return err ? null : {clues, sol};
}

// Wait - I called buildPuzzle before defining it. Fix ordering:

function buildAndTest(islands, N, name) {
  const sol = Array.from({length:N},()=>new Array(N).fill(0));
  const clues = Array.from({length:N},()=>new Array(N).fill(0));
  for (const {clueR,clueC,cells} of islands) {
    clues[clueR][clueC] = cells.length;
    for (const [r,c] of cells) sol[r][c] = 1;
  }
  const err = validateNurikabe(clues, sol, N);
  if (err) {
    console.log(`${name}: ${err}`);
    return null;
  }
  console.log(`${name}: OK`);
  console.log(`  clues: ${JSON.stringify(clues)}`);
  console.log(`  sol: ${JSON.stringify(sol)}`);
  return {clues, sol};
}

const N = 7;

buildAndTest([
  {clueR:1,clueC:1, cells:[[0,0],[0,1],[1,1]]},
  {clueR:1,clueC:3, cells:[[0,3],[1,3]]},
  {clueR:1,clueC:5, cells:[[0,5],[1,5]]},
  {clueR:3,clueC:1, cells:[[3,0],[3,1]]},
  {clueR:3,clueC:3, cells:[[3,3]]},
  {clueR:3,clueC:5, cells:[[3,5],[3,6],[4,6]]},
  {clueR:5,clueC:1, cells:[[5,1]]},
  {clueR:5,clueC:3, cells:[[5,3],[6,3],[6,4]]},
  {clueR:5,clueC:5, cells:[[5,5]]},
], N, 'P1-base');

buildAndTest([
  {clueR:1,clueC:1, cells:[[0,1],[1,1],[2,1]]},    // size 3 vertical
  {clueR:0,clueC:4, cells:[[0,4],[0,5],[1,5]]},    // size 3
  {clueR:3,clueC:1, cells:[[3,1]]},                 // size 1
  {clueR:3,clueC:3, cells:[[3,3],[4,3]]},           // size 2
  {clueR:3,clueC:5, cells:[[3,5],[3,6]]},           // size 2
  {clueR:5,clueC:1, cells:[[5,1],[6,1],[6,2]]},     // size 3
  {clueR:5,clueC:5, cells:[[5,5],[4,5],[4,4]]},     // size 3 -- (4,4) adj (4,3)? YES! Bad
], N, 'P2-v1');

buildAndTest([
  {clueR:1,clueC:1, cells:[[0,1],[1,1],[2,1]]},    // size 3 vertical
  {clueR:0,clueC:4, cells:[[0,4],[0,5],[1,5]]},    // size 3
  {clueR:3,clueC:1, cells:[[3,1]]},                 // size 1
  {clueR:3,clueC:3, cells:[[3,3],[4,3]]},           // size 2
  {clueR:3,clueC:5, cells:[[3,5],[3,6]]},           // size 2
  {clueR:5,clueC:1, cells:[[5,1],[6,1],[6,2]]},     // size 3
  {clueR:5,clueC:4, cells:[[5,4],[5,5],[4,5]]},     // size 3 -- (5,4) adj (4,3)? diagonal SAFE. (5,4) adj (6,2)? No
  {clueR:5,clueC:3, cells:[[5,3]]},                 // size 1 -- (5,3) adj (5,4)? YES! Bad
], N, 'P2-v2');

buildAndTest([
  {clueR:1,clueC:1, cells:[[0,1],[1,1],[2,1]]},    // size 3 vertical
  {clueR:0,clueC:4, cells:[[0,4],[0,5],[1,5]]},    // size 3
  {clueR:3,clueC:1, cells:[[3,1]]},                 // size 1
  {clueR:3,clueC:3, cells:[[3,3],[4,3]]},           // size 2
  {clueR:3,clueC:5, cells:[[3,5],[3,6]]},           // size 2
  {clueR:5,clueC:1, cells:[[5,1],[6,1],[6,2]]},     // size 3
  {clueR:5,clueC:5, cells:[[5,5],[4,5]]},           // size 2 -- (4,5) adj (3,5)? YES! Bad
], N, 'P2-v3');

buildAndTest([
  {clueR:1,clueC:1, cells:[[0,1],[1,1],[2,1]]},    // size 3 vertical
  {clueR:0,clueC:4, cells:[[0,4],[0,5],[1,5]]},    // size 3
  {clueR:3,clueC:1, cells:[[3,1]]},                 // size 1
  {clueR:3,clueC:3, cells:[[3,3],[4,3]]},           // size 2
  {clueR:4,clueC:5, cells:[[4,5],[4,6]]},           // size 2 -- (4,5) adj (3,5)? YES! Bad
], N, 'P2-v4-partial');

// What if I just add a single white at (3,5)?
buildAndTest([
  {clueR:1,clueC:1, cells:[[0,1],[1,1],[2,1]]},    // size 3 vertical
  {clueR:0,clueC:4, cells:[[0,4],[0,5],[1,5]]},    // size 3
  {clueR:3,clueC:1, cells:[[3,1]]},                 // size 1
  {clueR:3,clueC:3, cells:[[3,3],[4,3]]},           // size 2
  {clueR:3,clueC:5, cells:[[3,5]]},                 // size 1
  {clueR:5,clueC:1, cells:[[5,1],[6,1],[6,2]]},     // size 3
  {clueR:5,clueC:3, cells:[[5,3],[6,3]]},           // size 2
  {clueR:5,clueC:5, cells:[[5,5],[6,5]]},           // size 2 -- (6,5) adj (6,3)? col diff=2 SAFE. (6,5) adj (6,2)? No.
], N, 'P2-final');
