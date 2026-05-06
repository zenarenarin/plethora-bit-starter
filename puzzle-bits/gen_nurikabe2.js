'use strict';

// Valid Nurikabe puzzles: Instead of generating, use known-valid hand-designed ones
// that have been carefully crafted to satisfy all constraints.
// The key constraint: any 2x2 block of all-black is forbidden.
// In a 7x7 grid with 15-20 white cells (islands), this is achievable with careful placement.

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
      if (clueCount !== 1) return 'island has '+clueCount+' clues at '+r+','+c+' ('+clueCount+')';
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

// Build solution from explicit island specs
// islands: array of {clueR,clueC, cells:[...]}
// All non-island cells = river (black)
function buildSol(islands, N) {
  const sol = Array.from({length:N},()=>new Array(N).fill(0));
  const clues = Array.from({length:N},()=>new Array(N).fill(0));
  for (const {clueR,clueC,cells} of islands) {
    clues[clueR][clueC] = cells.length;
    for (const [r,c] of cells) sol[r][c] = 1;
  }
  return {clues, sol};
}

// Systematic design: create a white cell pattern where:
// 1. No 2x2 of all-black (white cells break all potential 2x2 blocks)
// 2. River is connected (white cells don't disconnect river)
// 3. Each white component is its own island
// 4. Islands don't touch each other

// Pattern strategy: place white cells in a checkerboard-like pattern
// but grouped into islands. Use "cross" pattern to break 2x2 blocks.

// For a 7x7 grid: place whites such that every 2x2 block has at least one white.
// Minimum whites needed = ceil(36/4) = 9, but islands must be distinct connected components.

// Safe pattern: whites at every 3rd cell in staggered rows
// Row 0: w at cols 0,3,6
// Row 1: w at cols 1,4  (offset)
// Row 2: w at cols 0,3,6
// etc. But then adjacent whites in same row could connect islands

// Let's try a specific known-valid arrangement:
// 7x7 grid, white cells as follows (designed to never have 2x2 black):

// Approach: start with all black, add white cells systematically
// scanning row by row, whenever a 2x2 black is about to form, add a white there

function autoPlace(N, sizes) {
  // Start with all black
  const grid = Array.from({length:N},()=>new Array(N).fill(0));

  // Add white cells at positions that prevent 2x2 blocks
  // Check each 2x2 from top-left, if all black, add white at bottom-right
  for (let r=0; r<N-1; r++) {
    for (let c=0; c<N-1; c++) {
      if (!grid[r][c]&&!grid[r][c+1]&&!grid[r+1][c]&&!grid[r+1][c+1]) {
        grid[r+1][c+1] = 1; // Add white to prevent 2x2
      }
    }
  }
  return grid;
}

// This gives us a valid no-2x2-black grid but with many whites
// Let's see the pattern
const baseGrid = autoPlace(7, []);
console.log('Auto-placed grid (no 2x2 black):');
for (const row of baseGrid) console.log(row.join(''));

const whiteCount = baseGrid.flat().filter(x=>x).length;
console.log('White cells:', whiteCount);

// Now check connectivity of black cells
const blacks = [];
const N = 7;
for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (!baseGrid[r][c]) blacks.push([r,c]);
const bVis = new Set(); const stack = [blacks[0]]; bVis.add(blacks[0].join(','));
while(stack.length){
  const [r,c]=stack.pop();
  for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
    const nr=r+dr,nc=c+dc;
    if(nr>=0&&nr<N&&nc>=0&&nc<N&&!baseGrid[nr][nc]&&!bVis.has(nr+','+nc)){bVis.add(nr+','+nc);stack.push([nr,nc]);}
  }
}
console.log('River connected:', bVis.size === blacks.length, bVis.size, '/', blacks.length);

// Check 2x2
let has2x2=false;
for (let r=0; r<N-1; r++) for (let c=0; c<N-1; c++) {
  if (!baseGrid[r][c]&&!baseGrid[r+1][c]&&!baseGrid[r][c+1]&&!baseGrid[r+1][c+1]) { has2x2=true; console.log('2x2 at',r,c); }
}
console.log('Has 2x2:', has2x2);
