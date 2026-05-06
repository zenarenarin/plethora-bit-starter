'use strict';

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
      if (clueCount !== 1) return 'island has '+clueCount+' clues at '+r+','+c;
      if (cells.length !== clueSize) return 'size mismatch at '+r+','+c+' got '+cells.length+' need '+clueSize;
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
        if (nr>=0&&nr<N&&nc>=0&&nc<N&&sol[nr][nc]===0&&!bVis.has(nr+','+nc)) { bVis.add(nr+','+nc); stack.push([nr,nc]); }
      }
    }
    if (bVis.size!==blacks.length) return 'river not connected '+bVis.size+'/'+blacks.length;
  }
  for (let r=0; r<N-1; r++) for (let c=0; c<N-1; c++) {
    if (sol[r][c]===0&&sol[r+1][c]===0&&sol[r][c+1]===0&&sol[r+1][c+1]===0) return '2x2 black at '+r+','+c;
  }
  return null;
}

// Key insight: the "checker" pattern (whites at odd-row, odd-col positions)
// prevents any 2x2 blocks and keeps river connected.
// Positions: (1,1),(1,3),(1,5),(3,1),(3,3),(3,5),(5,1),(5,3),(5,5)
// We can EXTEND some of these white cells to form larger islands,
// as long as we don't connect two "checker" whites (that would merge islands).

// Checker whites: separated by 2+ black cells, so they're safely isolated.
// Each checker white is a size-1 island.
// We can add extra whites adjacent to a checker white to grow it,
// but the extra white must not touch any other checker white.

// Strategy: group checker positions and grow some of them into larger islands.

// Checker positions in 7x7: (1,1),(1,3),(1,5),(3,1),(3,3),(3,5),(5,1),(5,3),(5,5)
// Adjacent black cells to each:
// (1,1) -> can grow to (0,1),(2,1),(1,0),(1,2) - but (1,0) and (1,2) might interfere
// Growing (1,1) to (0,1): (0,1) is not adjacent to any other checker position -> SAFE
// Growing (1,1) to (0,1),(0,0): (0,0) not adj to other checkers -> also SAFE

// Plan for puzzle 1:
// Use checker whites as base, merge some into multi-cell islands:
// (1,1) size 1 -> clue=1
// (1,3) + (0,3) size 2 -> clue at (1,3)=2
// (1,5) + (0,5) + (0,6) size 3 -> clue at (1,5)=3
// (3,1) + (2,1) size 2 -> clue at (3,1)=2
// (3,3) + (4,3) + (4,4) size 3 -> clue at (3,3)=3
// (3,5) + (3,6) size 2 -> clue at (3,5)=2
// (5,1) + (6,1) + (6,2) + (6,3) size 4 -> clue at (5,1)=4
// (5,3) + (6,3)?? Wait (6,3) already used by (5,1)...
// Use (5,3) size 1
// (5,5) + (6,5) + (6,6) size 3? No (5,5) adj (6,5) adj (6,6) -> SAFE if not adj other islands
//   (6,3) is in island(5,1). (6,5) adj (6,4) which is black. (6,5) not adj (6,3)?
//   (6,4) is black. (6,5) is not adjacent to (6,3). SAFE.
// But (5,3) size 1: (5,3) adjacent to (4,3)? (4,3) is in island(3,3)! BAD.

// Let me just manually verify by building the exact grid:

const N = 7;

// Island 1: (1,1)=1 cell, clue at (1,1)
// Island 2: (0,3),(1,3) size 2, clue at (1,3)
// Island 3: (0,5),(0,6),(1,5) size 3, clue at (1,5)
// Island 4: (2,1),(3,1) size 2, clue at (3,1)
// Island 5: (3,3),(4,3),(4,4) size 3, clue at (3,3)
// Island 6: (3,5),(3,6) size 2, clue at (3,5)
// Island 7: (5,1),(6,1),(6,2),(6,3) size 4, clue at (5,1)
// Island 8: (5,5),(6,5),(6,6) size 3, clue at (5,5)
// Island 9: (5,3) size 1, clue at (5,3)

// Check adjacency between islands (can't touch each other):
// Island 1 (1,1) adj Island 2? (1,1) adj (1,3)? No (distance 2). (1,1) adj (0,3)? No. SAFE.
// Island 1 (1,1) adj Island 4? (1,1) adj (2,1)? YES! (2,1) is in Island 4. BAD!
// So change Island 4: move clue, don't use (2,1). Use (3,1),(4,1) instead.

// Island 4: (3,1),(4,1) size 2, clue at (3,1)
// Check: (3,1) adj (1,1)? No. (3,1) adj (2,1)? (2,1) is not in any island now. SAFE.
// (4,1) adj (5,1)? YES - (5,1) is Island 7! BAD.

// So can't have (4,1) and (5,1) in different islands.
// Island 4: (3,1),(3,0) size 2, clue at (3,1)
// Check: (3,0) adj any island? (3,1) adj (1,1)? No. (3,0) adj (2,0)? (2,0) is black. SAFE.

// Island 7: (5,1) adj (4,1)? (4,1) is black. (5,1) adj (6,1). OK.
// Island 4: (3,0),(3,1). (3,1) adj (5,1)? No (distance 2). SAFE.

// Now Island 5: (3,3),(4,3),(4,4).
// (3,3) adj (3,1)? distance 2. SAFE.
// (4,4) adj (5,5)? distance=(1,1) diagonal, not adjacent. SAFE.
// (4,3) adj (5,3)? YES - (5,3) is Island 9! BAD.

// Change Island 9: use (5,3),(6,3)? But (6,3) is in Island 7...
// Change Island 9: use just (5,3) but not adj to (4,3)...
// Wait, (5,3) IS adjacent to (4,3) vertically. Can't avoid.
// Either change Island 5 or Island 9.

// Change Island 5: (3,3),(2,3),(2,4) size 3, clue at (3,3)
// (2,3) adj (1,3)? YES - (1,3) is in Island 2! BAD.

// Change Island 5: (3,3),(4,3),(4,2) size 3, clue at (3,3)
// (4,2) adj (5,1)? No. (4,2) adj (5,3)? No (diagonal). SAFE.
// (4,3) adj (5,3)? Still YES! Need (5,3) to not be an island or change position.

// Remove Island 9 (5,3) and instead add a cell to existing island.
// Actually let me just redesign fully:

// 7 islands total:
// A(2): cells (0,0),(0,1)
// B(3): cells (0,3),(0,4),(0,5)
// C(2): cells (2,1),(2,2)
// D(3): cells (2,5),(2,6),(3,6)
// E(4): cells (4,0),(5,0),(6,0),(6,1)
// F(3): cells (4,3),(4,4),(4,5)
// G(1): cells (6,6)

// Check adjacency between islands:
// A-B: (0,1) adj (0,3)? No (gap at 0,2). SAFE.
// A-C: (0,0) adj (2,1)? No. (0,1) adj (2,1)? No (row diff 2). SAFE.
// B-D: (0,5) adj (2,5)? No (row diff 2). SAFE.
// C-E: (2,1) adj (4,0)? No. SAFE.
// C-D: (2,2) adj (2,5)? No. SAFE.
// D-F: (3,6) adj (4,5)? diagonal, not adjacent. SAFE. (3,6) adj (4,6)? (4,6) not in F. SAFE.
// E-F: (5,0) adj (4,3)? No. SAFE. (6,1) adj (4,3)? No. SAFE.
// E-G: (6,1) adj (6,6)? No. SAFE.
// F-G: (4,5) adj (6,6)? No. SAFE.

// Total white = 2+3+2+3+4+3+1 = 18
// Black cells = 49 - 18 = 31

// Build the grid
const sol_a = Array.from({length:N},()=>new Array(N).fill(0));
const clues_a = Array.from({length:N},()=>new Array(N).fill(0));

const islands_a = [
  {clueR:0,clueC:0, cells:[[0,0],[0,1]]},        // A size 2
  {clueR:0,clueC:3, cells:[[0,3],[0,4],[0,5]]},   // B size 3
  {clueR:2,clueC:1, cells:[[2,1],[2,2]]},         // C size 2
  {clueR:2,clueC:5, cells:[[2,5],[2,6],[3,6]]},   // D size 3
  {clueR:4,clueC:0, cells:[[4,0],[5,0],[6,0],[6,1]]}, // E size 4
  {clueR:4,clueC:3, cells:[[4,3],[4,4],[4,5]]},   // F size 3
  {clueR:6,clueC:6, cells:[[6,6]]},               // G size 1
];

for (const {clueR,clueC,cells} of islands_a) {
  clues_a[clueR][clueC] = cells.length;
  for (const [r,c] of cells) sol_a[r][c] = 1;
}

const err_a = validateNurikabe(clues_a, sol_a, N);
console.log('Puzzle A:', err_a || 'OK');
if (!err_a) {
  console.log('clues:', JSON.stringify(clues_a));
  console.log('sol:', JSON.stringify(sol_a));
}

// Puzzle 2:
// A(3): (0,1),(0,2),(0,3)
// B(2): (0,5),(1,5)
// C(2): (2,0),(3,0)
// D(4): (2,3),(2,4),(3,4),(3,3) -- 2x2 white? No, these are connected but 2x2 black rule is for black cells only. white 2x2 is allowed.
// Wait, Nurikabe doesn't forbid white 2x2 - only black 2x2. So D(4) square is fine.
// E(3): (5,2),(5,3),(5,4)
// F(1): (4,6)
// G(2): (6,4),(6,5)

const islands_b = [
  {clueR:0,clueC:1, cells:[[0,1],[0,2],[0,3]]},   // A size 3
  {clueR:0,clueC:5, cells:[[0,5],[1,5]]},          // B size 2
  {clueR:2,clueC:0, cells:[[2,0],[3,0]]},          // C size 2
  {clueR:2,clueC:3, cells:[[2,3],[2,4],[3,3],[3,4]]}, // D size 4
  {clueR:5,clueC:2, cells:[[5,2],[5,3],[5,4]]},    // E size 3
  {clueR:4,clueC:6, cells:[[4,6]]},                // F size 1
  {clueR:6,clueC:4, cells:[[6,4],[6,5]]},          // G size 2
];

// Check adjacencies:
// D(3,4) adj E(5,2)? row diff = 2 SAFE. D(3,4) adj F(4,6)? col diff=2. SAFE.
// F(4,6) adj B(1,5)? row diff=3. SAFE. F(4,6) adj G(6,5)? row diff=2. SAFE.
// E(5,4) adj G(6,4)? (5,4) adj (6,4)? YES! BAD.

// Change G: (6,5),(6,6) instead
const islands_b2 = [
  {clueR:0,clueC:1, cells:[[0,1],[0,2],[0,3]]},   // A size 3
  {clueR:0,clueC:5, cells:[[0,5],[1,5]]},          // B size 2
  {clueR:2,clueC:0, cells:[[2,0],[3,0]]},          // C size 2
  {clueR:2,clueC:3, cells:[[2,3],[2,4],[3,3],[3,4]]}, // D size 4
  {clueR:5,clueC:2, cells:[[5,2],[5,3],[5,4]]},    // E size 3
  {clueR:4,clueC:6, cells:[[4,6]]},                // F size 1
  {clueR:6,clueC:5, cells:[[6,5],[6,6]]},          // G size 2
];
// E(5,4) adj G(6,5)? diagonal, not adjacent. SAFE.
// F(4,6) adj G(6,5)? row diff=2. SAFE.
// F(4,6) adj D(3,4)? (4,6) adj (3,6)? (3,6) is black. (4,6) adj (3,6)? wait (3,4) is in D... (4,6) not adj (3,4). SAFE.

const sol_b2 = Array.from({length:N},()=>new Array(N).fill(0));
const clues_b2 = Array.from({length:N},()=>new Array(N).fill(0));
for (const {clueR,clueC,cells} of islands_b2) {
  clues_b2[clueR][clueC] = cells.length;
  for (const [r,c] of cells) sol_b2[r][c] = 1;
}
const err_b2 = validateNurikabe(clues_b2, sol_b2, N);
console.log('\nPuzzle B:', err_b2 || 'OK');
if (!err_b2) {
  console.log('clues:', JSON.stringify(clues_b2));
  console.log('sol:', JSON.stringify(sol_b2));
}

// Puzzle 3:
const islands_c = [
  {clueR:0,clueC:2, cells:[[0,2],[0,3],[0,4]]},   // size 3
  {clueR:1,clueC:6, cells:[[1,6],[0,6]]},          // size 2
  {clueR:2,clueC:0, cells:[[2,0],[3,0],[4,0]]},    // size 3
  {clueR:3,clueC:5, cells:[[3,5],[4,5],[4,6],[5,6]]}, // size 4
  {clueR:5,clueC:2, cells:[[5,2],[5,3]]},          // size 2
  {clueR:6,clueC:0, cells:[[6,0],[6,1]]},          // size 2
  {clueR:6,clueC:4, cells:[[6,4]]},                // size 1
];
// Check:
// (3,5) adj (3,0)? col diff=5. SAFE.
// (4,0) adj (4,5)? No. (4,0) adj (5,2)? No. SAFE.
// (5,3) adj (6,4)? diagonal. SAFE.
// (6,1) adj (5,2)? diagonal. SAFE.
// (5,6) adj (6,4)? diagonal. SAFE.
const sol_c = Array.from({length:N},()=>new Array(N).fill(0));
const clues_c = Array.from({length:N},()=>new Array(N).fill(0));
for (const {clueR,clueC,cells} of islands_c) {
  clues_c[clueR][clueC] = cells.length;
  for (const [r,c] of cells) sol_c[r][c] = 1;
}
const err_c = validateNurikabe(clues_c, sol_c, N);
console.log('\nPuzzle C:', err_c || 'OK');
if (!err_c) {
  console.log('clues:', JSON.stringify(clues_c));
  console.log('sol:', JSON.stringify(sol_c));
}

// Puzzle 4:
const islands_d = [
  {clueR:0,clueC:0, cells:[[0,0],[1,0],[2,0]]},   // size 3, vertical
  {clueR:0,clueC:4, cells:[[0,4],[0,5]]},          // size 2
  {clueR:1,clueC:3, cells:[[1,3],[1,4],[1,5]]}, // size 3 -- (1,4) adj (0,4)? YES! Bad.
];

// Fix:
const islands_d2 = [
  {clueR:0,clueC:0, cells:[[0,0],[1,0],[2,0]]},    // size 3 vertical
  {clueR:0,clueC:4, cells:[[0,4],[0,5]]},           // size 2
  {clueR:2,clueC:3, cells:[[2,3],[3,3]]},           // size 2
  {clueR:1,clueC:6, cells:[[1,6],[2,6],[3,6]]},     // size 3
  {clueR:4,clueC:1, cells:[[4,1],[5,1],[6,1],[6,2]]}, // size 4
  {clueR:5,clueC:4, cells:[[5,4],[5,5]]},           // size 2
  {clueR:6,clueC:5, cells:[[6,5]]},                 // size 1 -- (6,5) adj (5,4)? diagonal, SAFE. (6,5) adj (5,5)? YES! Bad
];
// Fix: G=(6,6) instead
const islands_d3 = [
  {clueR:0,clueC:0, cells:[[0,0],[1,0],[2,0]]},    // size 3 vertical
  {clueR:0,clueC:4, cells:[[0,4],[0,5]]},           // size 2
  {clueR:2,clueC:3, cells:[[2,3],[3,3]]},           // size 2
  {clueR:1,clueC:6, cells:[[1,6],[2,6],[3,6]]},     // size 3
  {clueR:4,clueC:1, cells:[[4,1],[5,1],[6,1],[6,2]]}, // size 4
  {clueR:5,clueC:4, cells:[[5,4],[5,5]]},           // size 2
  {clueR:6,clueC:6, cells:[[6,6]]},                 // size 1
];
// Check: (6,2) adj (6,6)? No. (5,5) adj (6,6)? diagonal. SAFE.
// (5,5) adj (6,5)? (6,5) is black. SAFE.
// (3,6) adj (3,3)? col diff=3. SAFE.
// (4,1) adj (3,3)? No. SAFE.
const sol_d3 = Array.from({length:N},()=>new Array(N).fill(0));
const clues_d3 = Array.from({length:N},()=>new Array(N).fill(0));
for (const {clueR,clueC,cells} of islands_d3) {
  clues_d3[clueR][clueC] = cells.length;
  for (const [r,c] of cells) sol_d3[r][c] = 1;
}
const err_d3 = validateNurikabe(clues_d3, sol_d3, N);
console.log('\nPuzzle D:', err_d3 || 'OK');
if (!err_d3) {
  console.log('clues:', JSON.stringify(clues_d3));
  console.log('sol:', JSON.stringify(sol_d3));
}

// Puzzle 5:
const islands_e = [
  {clueR:0,clueC:1, cells:[[0,1],[0,2],[0,3],[0,4]]}, // size 4 horizontal
  {clueR:1,clueC:6, cells:[[1,6],[2,6]]},              // size 2
  {clueR:3,clueC:1, cells:[[3,1],[3,2]]},              // size 2
  {clueR:3,clueC:4, cells:[[3,4],[4,4],[5,4]]},        // size 3
  {clueR:5,clueC:0, cells:[[5,0],[6,0],[6,1]]},        // size 3
  {clueR:6,clueC:5, cells:[[6,5],[6,6]]},              // size 2
  {clueR:4,clueC:2, cells:[[4,2]]},                    // size 1
];
// Check adjacency:
// (0,4) adj (1,6)? diagonal+. No.
// (3,2) adj (4,2)? YES! Bad.
// Fix: F(size1) at (4,3) instead
const islands_e2 = [
  {clueR:0,clueC:1, cells:[[0,1],[0,2],[0,3],[0,4]]}, // size 4 horizontal
  {clueR:1,clueC:6, cells:[[1,6],[2,6]]},              // size 2
  {clueR:3,clueC:1, cells:[[3,1],[3,2]]},              // size 2
  {clueR:3,clueC:4, cells:[[3,4],[4,4],[5,4]]},        // size 3
  {clueR:5,clueC:0, cells:[[5,0],[6,0],[6,1]]},        // size 3
  {clueR:6,clueC:5, cells:[[6,5],[6,6]]},              // size 2
  {clueR:5,clueC:2, cells:[[5,2]]},                    // size 1
];
// (5,2) adj (3,2)? row diff=2. SAFE. (5,2) adj (5,4)? col diff=2. SAFE.
// (5,2) adj (5,0)? col diff=2. SAFE.
// (5,4) adj (6,5)? diagonal. SAFE. (5,4) adj (6,6)? No. SAFE.
const sol_e2 = Array.from({length:N},()=>new Array(N).fill(0));
const clues_e2 = Array.from({length:N},()=>new Array(N).fill(0));
for (const {clueR,clueC,cells} of islands_e2) {
  clues_e2[clueR][clueC] = cells.length;
  for (const [r,c] of cells) sol_e2[r][c] = 1;
}
const err_e2 = validateNurikabe(clues_e2, sol_e2, N);
console.log('\nPuzzle E:', err_e2 || 'OK');
if (!err_e2) {
  console.log('clues:', JSON.stringify(clues_e2));
  console.log('sol:', JSON.stringify(sol_e2));
}
