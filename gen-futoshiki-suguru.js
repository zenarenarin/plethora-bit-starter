#!/usr/bin/env node
'use strict';

// ── FUTOSHIKI verification ─────────────────────────────────────────────────
function verifyFutoshiki(name, sol, inequalities, givens) {
  const N = 5;
  let errs = [];
  for (let i = 0; i < N; i++) {
    const rowSet = new Set(sol[i]);
    const colSet = new Set();
    for (let j = 0; j < N; j++) colSet.add(sol[j][i]);
    if (rowSet.size !== N) errs.push(`Row ${i} not permutation`);
    if (colSet.size !== N) errs.push(`Col ${i} not permutation`);
  }
  for (const ineq of inequalities) {
    const {r1,c1,r2,c2,rel} = ineq;
    const v1 = sol[r1][c1], v2 = sol[r2][c2];
    if (rel==='lt' && !(v1<v2)) errs.push(`ineq(${r1},${c1})<(${r2},${c2}) failed:${v1}<${v2}`);
    if (rel==='gt' && !(v1>v2)) errs.push(`ineq(${r1},${c1})>(${r2},${c2}) failed:${v1}>${v2}`);
  }
  for (const g of givens) {
    if (sol[g.r][g.c] !== g.v) errs.push(`given(${g.r},${g.c})=${g.v} but sol=${sol[g.r][g.c]}`);
  }
  if (errs.length === 0) console.log(`FUTOSHIKI ${name}: OK`);
  else console.error(`FUTOSHIKI ${name} FAILED: ${errs.join('; ')}`);
}

const futPuzzles = [
  {
    name: 'BEGINNER',
    sol: [[1,2,3,4,5],[2,3,4,5,1],[3,4,5,1,2],[4,5,1,2,3],[5,1,2,3,4]],
    inequalities: [
      {r1:0,c1:0,r2:0,c2:1,rel:'lt'},
      {r1:0,c1:2,r2:0,c2:3,rel:'lt'},
      {r1:0,c1:3,r2:1,c2:3,rel:'lt'},
      {r1:1,c1:1,r2:1,c2:2,rel:'lt'},
      {r1:2,c1:3,r2:2,c2:4,rel:'lt'},
      {r1:3,c1:0,r2:4,c2:0,rel:'lt'},
      {r1:4,c1:1,r2:4,c2:2,rel:'lt'},
    ],
    givens: [{r:0,c:0,v:1},{r:1,c:4,v:1},{r:2,c:2,v:5},{r:3,c:1,v:5},{r:4,c:3,v:3}],
  },
  {
    name: 'EASY',
    sol: [[3,1,4,2,5],[1,4,2,5,3],[4,2,5,3,1],[2,5,3,1,4],[5,3,1,4,2]],
    inequalities: [
      {r1:0,c1:0,r2:0,c2:1,rel:'gt'},
      {r1:0,c1:3,r2:0,c2:4,rel:'lt'},
      {r1:0,c1:1,r2:1,c2:1,rel:'lt'},
      {r1:1,c1:2,r2:1,c2:3,rel:'lt'},
      {r1:2,c1:0,r2:2,c2:1,rel:'gt'},
      {r1:2,c1:1,r2:3,c2:1,rel:'lt'},
      {r1:3,c1:2,r2:4,c2:2,rel:'gt'},
      {r1:4,c1:2,r2:4,c2:3,rel:'lt'},
    ],
    givens: [{r:0,c:2,v:4},{r:1,c:0,v:1},{r:2,c:4,v:1},{r:3,c:3,v:1},{r:4,c:1,v:3}],
  },
  {
    name: 'MEDIUM',
    sol: [[5,4,3,2,1],[4,3,2,1,5],[3,2,1,5,4],[2,1,5,4,3],[1,5,4,3,2]],
    inequalities: [
      {r1:0,c1:0,r2:0,c2:1,rel:'gt'},
      {r1:0,c1:2,r2:0,c2:3,rel:'gt'},
      {r1:0,c1:0,r2:1,c2:0,rel:'gt'},
      {r1:1,c1:1,r2:1,c2:2,rel:'gt'},
      {r1:1,c1:2,r2:2,c2:2,rel:'gt'},
      {r1:2,c1:3,r2:3,c2:3,rel:'gt'},
      {r1:3,c1:1,r2:3,c2:2,rel:'lt'},
      {r1:3,c1:2,r2:4,c2:2,rel:'gt'},
      {r1:4,c1:0,r2:4,c2:1,rel:'lt'},
    ],
    givens: [{r:0,c:0,v:5},{r:1,c:4,v:5},{r:2,c:2,v:1},{r:3,c:1,v:1},{r:4,c:3,v:3}],
  },
  {
    name: 'HARD',
    sol: [[2,4,1,3,5],[4,1,3,5,2],[1,3,5,2,4],[3,5,2,4,1],[5,2,4,1,3]],
    inequalities: [
      {r1:0,c1:0,r2:0,c2:1,rel:'lt'},
      {r1:0,c1:2,r2:0,c2:3,rel:'lt'},
      {r1:0,c1:3,r2:0,c2:4,rel:'lt'},
      {r1:0,c1:0,r2:1,c2:0,rel:'lt'},
      {r1:0,c1:4,r2:1,c2:4,rel:'gt'},
      {r1:1,c1:1,r2:2,c2:1,rel:'lt'},
      {r1:2,c1:2,r2:2,c2:3,rel:'gt'},
      {r1:2,c1:3,r2:3,c2:3,rel:'lt'},
      {r1:3,c1:0,r2:3,c2:1,rel:'lt'},
      {r1:3,c1:4,r2:4,c2:4,rel:'lt'},
      {r1:4,c1:0,r2:4,c2:1,rel:'gt'},
    ],
    givens: [{r:0,c:1,v:4},{r:1,c:4,v:2},{r:2,c:0,v:1},{r:3,c:3,v:4},{r:4,c:2,v:4}],
  },
  {
    name: 'EXPERT',
    sol: [[4,2,5,1,3],[2,5,1,3,4],[5,1,3,4,2],[1,3,4,2,5],[3,4,2,5,1]],
    inequalities: [
      {r1:0,c1:0,r2:0,c2:1,rel:'gt'},
      {r1:0,c1:2,r2:0,c2:3,rel:'gt'},
      {r1:0,c1:3,r2:0,c2:4,rel:'lt'},
      {r1:0,c1:0,r2:1,c2:0,rel:'gt'},
      {r1:0,c1:1,r2:1,c2:1,rel:'lt'},
      {r1:1,c1:3,r2:2,c2:3,rel:'lt'},
      {r1:1,c1:4,r2:2,c2:4,rel:'gt'},
      {r1:2,c1:1,r2:2,c2:2,rel:'lt'},
      {r1:2,c1:2,r2:3,c2:2,rel:'lt'},
      {r1:3,c1:0,r2:3,c2:1,rel:'lt'},
      {r1:3,c1:2,r2:3,c2:3,rel:'gt'},
      {r1:3,c1:4,r2:4,c2:4,rel:'gt'},
      {r1:4,c1:0,r2:4,c2:1,rel:'lt'},
      {r1:4,c1:2,r2:4,c2:3,rel:'lt'},
    ],
    givens: [{r:0,c:4,v:3},{r:1,c:2,v:1},{r:2,c:0,v:5},{r:3,c:3,v:2},{r:4,c:1,v:4}],
  },
];

for (const p of futPuzzles) {
  verifyFutoshiki(p.name, p.sol, p.inequalities, p.givens);
}

// ── SUGURU verification ─────────────────────────────────────────────────────
function verifySuguru(name, regions, solution) {
  const N = 5;
  let errs = [];
  const regionCells = {};
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const rid = regions[r][c];
    if (!regionCells[rid]) regionCells[rid] = [];
    regionCells[rid].push(solution[r][c]);
  }
  for (const [rid, cells] of Object.entries(regionCells)) {
    const sz = cells.length;
    const expected = new Set(); for (let i=1;i<=sz;i++) expected.add(i);
    const actual = new Set(cells);
    if (actual.size !== expected.size || [...expected].some(v=>!actual.has(v))) {
      errs.push(`Region ${rid} [${[...cells].sort().join(',')}] not 1..${sz}`);
    }
  }
  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
    const v = solution[r][c];
    for (const [dr,dc] of dirs) {
      const nr=r+dr, nc=c+dc;
      if (nr<0||nr>=N||nc<0||nc>=N) continue;
      if (nr > r || (nr===r&&nc>c)) {
        if (solution[nr][nc]===v) errs.push(`8-adj (${r},${c})&(${nr},${nc}) both=${v}`);
      }
    }
  }
  if (errs.length===0) console.log(`SUGURU ${name}: OK`);
  else console.error(`SUGURU ${name} FAILED: ${errs.join('; ')}`);
}

// Hand-designed Suguru puzzles
// Each region must contain 1..size, no 8-adjacent same value

const suguruPuzzles = [
  {
    name: 'PATCHWORK',
    // region sizes: 0→3, 1→4, 2→3, 3→4, 4→4, 5→4, 6→2, 7→1
    regions: [
      [0,0,1,1,1],
      [0,2,2,1,3],
      [4,2,5,3,3],
      [4,4,5,5,3],
      [4,6,6,5,7],
    ],
    solution: [
      [1,3,1,2,4],
      [2,1,2,3,1],
      [1,3,1,4,2],
      [3,2,2,1,3],
      [4,1,2,3,1],
    ],
  },
  {
    name: 'MOSAIC',
    // region sizes: 0→4, 1→3, 2→3, 3→3, 4→3, 5→3, 6→3, 7→1, 8→3
    regions: [
      [0,0,0,1,1],
      [2,0,3,1,4],
      [2,3,3,4,4],
      [2,5,5,6,6],
      [7,5,8,8,6],
    ],
    solution: [
      [1,2,3,1,2],
      [2,4,1,3,1],
      [1,2,3,2,3],
      [3,1,2,1,2],
      [1,3,2,3,3],
    ],
  },
  {
    name: 'TILES',
    // region sizes: 0→3, 1→3, 2→3, 3→4, 4→3, 5→4, 6→1, 7→2
    regions: [
      [0,1,1,2,2],
      [0,0,1,3,2],
      [4,0,3,3,5],
      [4,4,3,5,5],
      [6,4,7,7,5],
    ],
    solution: [
      [1,1,2,1,2],
      [2,3,3,2,3],
      [1,1,4,1,1],
      [3,2,3,2,2],
      [1,3,1,2,4],
    ],
  },
  {
    name: 'QUILT',
    // region sizes: 0→3, 1→3, 2→4, 3→4, 4→3, 5→3, 6→2, 7→2
    regions: [
      [0,0,1,1,2],
      [0,3,1,2,2],
      [3,3,3,4,2],
      [3,5,5,4,6],
      [7,7,5,4,6],
    ],
    solution: [
      [1,2,1,2,1],
      [3,1,3,3,2],
      [2,4,1,1,4],
      [4,2,3,2,1],
      [1,2,1,3,2],
    ],
  },
  {
    name: 'WEAVE',
    // region sizes: 0→3, 1→4, 2→3, 3→4, 4→4, 5→4, 6→2, 7→1
    regions: [
      [0,0,1,2,2],
      [0,1,1,3,2],
      [4,1,5,3,3],
      [4,4,5,5,3],
      [4,6,6,5,7],
    ],
    solution: [
      [1,2,1,1,2],
      [3,1,3,2,3],
      [2,3,1,4,1],
      [1,2,2,3,2],
      [4,1,2,4,1],
    ],
  },
];

for (const p of suguruPuzzles) {
  verifySuguru(p.name, p.regions, p.solution);
}
