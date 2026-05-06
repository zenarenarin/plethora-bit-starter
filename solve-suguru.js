#!/usr/bin/env node
'use strict';

// Backtracking Suguru solver
function solveSuguru(regions) {
  const N = 5;
  const regionSize = {};
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const rid = regions[r][c];
    regionSize[rid] = (regionSize[rid] || 0) + 1;
  }

  const adj = Array.from({length:N}, () => Array.from({length:N}, () => []));
  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    for (const [dr,dc] of dirs) {
      const nr=r+dr, nc=c+dc;
      if (nr>=0&&nr<N&&nc>=0&&nc<N) adj[r][c].push([nr,nc]);
    }
  }

  const sol = Array.from({length:N}, () => Array(N).fill(0));
  const regionUsed = {};
  for (const rid of Object.keys(regionSize)) regionUsed[rid] = new Set();

  function bt(pos) {
    if (pos === N*N) return true;
    const r = Math.floor(pos/N), c = pos%N;
    const rid = regions[r][c];
    const maxVal = regionSize[rid];

    for (let v = 1; v <= maxVal; v++) {
      if (regionUsed[rid].has(v)) continue;
      let ok = true;
      for (const [nr,nc] of adj[r][c]) {
        if (sol[nr][nc] === v) { ok = false; break; }
      }
      if (!ok) continue;
      sol[r][c] = v;
      regionUsed[rid].add(v);
      if (bt(pos+1)) return true;
      sol[r][c] = 0;
      regionUsed[rid].delete(v);
    }
    return false;
  }

  if (bt(0)) return sol;
  return null;
}

function verify(name, regions, sol) {
  const N = 5;
  const regionCells = {};
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const rid = regions[r][c];
    if (!regionCells[rid]) regionCells[rid] = [];
    regionCells[rid].push(sol[r][c]);
  }
  let errs = [];
  for (const [rid, cells] of Object.entries(regionCells)) {
    const sz = cells.length;
    const s = new Set(cells);
    if (s.size !== sz) errs.push(`Reg${rid} dups`);
    for (let v = 1; v <= sz; v++) if (!s.has(v)) errs.push(`Reg${rid} miss ${v}`);
  }
  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    for (const [dr,dc] of dirs) {
      const nr=r+dr, nc=c+dc;
      if (nr<0||nr>=N||nc<0||nc>=N) continue;
      if (nr > r || (nr===r&&nc>c)) {
        if (sol[nr][nc]===sol[r][c]) errs.push(`8-adj(${r},${c})&(${nr},${nc})=${sol[r][c]}`);
      }
    }
  }
  if (errs.length === 0) process.stdout.write(`${name}: OK\n`);
  else process.stdout.write(`${name}: FAIL - ${errs.join('; ')}\n`);
  return errs.length === 0;
}

// Simpler region maps with smaller max region size = easier for solver
// Max region size = 4. Regions must be 4-connected polyominoes.

// PATCHWORK: 25 cells, sizes 1-4
// 0:2, 1:2, 2:3, 3:3, 4:3, 5:3, 6:4, 7:3, 8:2 = 25
const maps = [
  {
    name: 'PATCHWORK',
    regions: [
      [0,1,2,2,3],
      [0,1,2,4,3],
      [5,5,6,4,3],
      [7,5,6,4,8],
      [7,7,6,6,8],
    ],
    // 0:2, 1:2, 2:3, 3:3, 4:3, 5:3, 6:4, 7:3, 8:2 = 2+2+3+3+3+3+4+3+2 = 25 ✓
  },
  {
    name: 'MOSAIC',
    regions: [
      [0,0,1,2,2],
      [3,0,1,4,2],
      [3,5,1,4,6],
      [3,5,7,4,6],
      [8,5,7,9,6],
    ],
    // 0:3, 1:3, 2:3, 3:3, 4:3, 5:3, 6:3, 7:2, 8:1, 9:1 = 3+3+3+3+3+3+3+2+1+1 = 25 ✓
  },
  {
    name: 'TILES',
    regions: [
      [0,1,1,2,3],
      [0,4,1,2,3],
      [0,4,5,2,3],
      [6,4,5,7,7],
      [6,6,5,8,8],
    ],
    // 0:3, 1:3, 2:3, 3:3, 4:3, 5:3, 6:3, 7:2, 8:2 = 25 ✓
  },
  {
    name: 'QUILT',
    regions: [
      [0,0,1,2,2],
      [3,0,1,1,2],
      [3,4,4,5,6],
      [3,7,4,5,6],
      [8,7,9,5,6],
    ],
    // 0:3, 1:3, 2:3, 3:3, 4:3, 5:3, 6:3, 7:2, 8:1, 9:1 = 25 ✓
  },
  {
    name: 'WEAVE',
    regions: [
      [0,1,2,2,3],
      [0,1,4,2,3],
      [0,1,4,5,5],
      [6,7,4,5,8],
      [6,7,7,9,8],
    ],
    // 0:3, 1:3, 2:3, 3:2, 4:3, 5:3, 6:2, 7:3, 8:2, 9:1 = 3+3+3+2+3+3+2+3+2+1 = 25 ✓
  },
];

// Validate then solve
for (const {name, regions} of maps) {
  const sizes = {};
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const rid = regions[r][c];
    sizes[rid] = (sizes[rid] || 0) + 1;
  }
  const total = Object.values(sizes).reduce((a,b)=>a+b,0);
  if (total !== 25) { process.stdout.write(`${name}: total=${total} WRONG\n`); continue; }

  const sol = solveSuguru(regions);
  if (!sol) {
    process.stdout.write(`${name}: NO SOLUTION\n`);
  } else {
    const ok = verify(name, regions, sol);
    if (ok) {
      // Pick one clue per region (corner-ish cells for visual interest)
      const rids = Object.keys(sizes).map(Number);
      // For each region pick a random mid-cell
      const regionCells = {};
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const rid = regions[r][c];
        if (!regionCells[rid]) regionCells[rid] = [];
        regionCells[rid].push([r,c]);
      }
      // pick first cell of each region as clue
      const clues = rids.map(rid => regionCells[rid][0]);

      process.stdout.write(`  regions: ${JSON.stringify(regions)}\n`);
      process.stdout.write(`  solution: ${JSON.stringify(sol)}\n`);
      process.stdout.write(`  clues: ${JSON.stringify(clues)}\n`);
      process.stdout.write(`  sizes: ${JSON.stringify(sizes)}\n`);
    }
  }
}
