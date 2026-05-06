'use strict';
function validateNurikabe(clues, sol, N) {
  for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
    if (clues[r][c]>0 && sol[r][c]!==1) return 'clue not white at '+r+','+c;
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
      if (clueCount !== 1) return 'island '+clueCount+' clues at '+r+','+c;
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

function test(islands, N, name) {
  const sol = Array.from({length:N},()=>new Array(N).fill(0));
  const clues = Array.from({length:N},()=>new Array(N).fill(0));
  const iSets = islands.map(function(i){ return new Set(i.cells.map(function(rc){ return rc[0]+','+rc[1]; })); });
  for (let idx=0; idx<islands.length; idx++) {
    const island = islands[idx];
    clues[island.cl[0]][island.cl[1]] = island.cells.length;
    for (let ci=0; ci<island.cells.length; ci++) sol[island.cells[ci][0]][island.cells[ci][1]]=1;
  }
  for (let i=0; i<islands.length; i++) {
    for (const k of iSets[i]) {
      const parts = k.split(','); const r=+parts[0]; const c=+parts[1];
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (let di=0; di<dirs.length; di++) {
        const nr=r+dirs[di][0], nc=c+dirs[di][1];
        for (let j=i+1; j<islands.length; j++) {
          if (iSets[j].has(nr+','+nc)) { console.log(name+': islands '+i+' and '+j+' touch'); return null; }
        }
      }
    }
  }
  const err = validateNurikabe(clues,sol,N);
  if (err) { console.log(name+': '+err); return null; }
  console.log(name+': OK');
  console.log('  clues:'+JSON.stringify(clues));
  console.log('  sol:'+JSON.stringify(sol));
  return {clues:clues, sol:sol};
}

const N=7;

// P2: vary from P1 pattern
var r2 = test([
  {cl:[1,1], cells:[[0,0],[0,1],[1,1]]},
  {cl:[0,4], cells:[[0,4],[1,4]]},
  {cl:[0,6], cells:[[0,6],[1,6]]},
  {cl:[3,0], cells:[[3,0],[3,1]]},
  {cl:[3,3], cells:[[3,3]]},
  {cl:[3,5], cells:[[3,5],[3,6]]},
  {cl:[5,1], cells:[[5,1],[6,1],[6,2]]},
  {cl:[5,3], cells:[[5,3]]},
  {cl:[5,5], cells:[[5,5],[6,5],[6,6]]},
], N, 'P2');

// P3
var r3 = test([
  {cl:[0,1], cells:[[0,1],[1,1],[0,2]]},
  {cl:[0,5], cells:[[0,5],[0,6]]},
  {cl:[1,3], cells:[[1,3]]},
  {cl:[3,0], cells:[[3,0],[3,1]]},
  {cl:[3,3], cells:[[3,3],[3,4]]},
  {cl:[2,6], cells:[[2,6],[3,6]]},
  {cl:[5,1], cells:[[5,1],[6,1],[6,2]]},
  {cl:[5,4], cells:[[5,4]]},
  {cl:[5,6], cells:[[5,6],[6,6]]},
], N, 'P3');

// P4
var r4 = test([
  {cl:[0,0], cells:[[0,0],[0,1],[1,1]]},
  {cl:[0,4], cells:[[0,4],[1,4]]},
  {cl:[0,6], cells:[[0,6]]},
  {cl:[3,0], cells:[[3,0],[2,0]]},
  {cl:[3,3], cells:[[3,3],[3,2]]},
  {cl:[3,5], cells:[[3,5],[3,6]]},
  {cl:[5,0], cells:[[5,0],[6,0],[6,1]]},
  {cl:[5,3], cells:[[5,3]]},
  {cl:[5,5], cells:[[5,5],[6,5],[6,6]]},
], N, 'P4');

// P5
var r5 = test([
  {cl:[0,0], cells:[[0,0],[1,0],[0,1]]},
  {cl:[0,4], cells:[[0,4],[0,3]]},
  {cl:[0,6], cells:[[0,6],[1,6]]},
  {cl:[3,1], cells:[[3,1],[2,1]]},
  {cl:[3,3], cells:[[3,3]]},
  {cl:[3,5], cells:[[3,5],[3,6]]},
  {cl:[5,0], cells:[[5,0],[6,0],[6,1]]},
  {cl:[5,3], cells:[[5,3]]},
  {cl:[5,5], cells:[[5,5],[6,5],[6,6]]},
], N, 'P5');
