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
  const iSets = islands.map(i=>new Set(i.cells.map(function(rc){return rc[0]+','+rc[1];})));
  for (const {cl,cells} of islands) {
    clues[cl[0]][cl[1]] = cells.length;
    for (const rc of cells) sol[rc[0]][rc[1]]=1;
  }
  for (let i=0; i<islands.length; i++) {
    for (const k of iSets[i]) {
      const parts = k.split(','); const r=+parts[0]; const c=+parts[1];
      for (let di=-1; di<=1; di++) for (let dj=-1; dj<=1; dj++) {
        if (Math.abs(di)+Math.abs(dj)!==1) continue;
        for (let j=i+1; j<islands.length; j++) {
          if (iSets[j].has((r+di)+','+(c+dj))) {
            console.log(name+': islands '+i+' and '+j+' touch at ('+r+','+c+')-('+(r+di)+','+(c+dj)+')');
            return;
          }
        }
      }
    }
  }
  const err = validateNurikabe(clues,sol,N);
  if (err) console.log(name+': '+err);
  else {
    console.log(name+': OK');
    console.log('  clues:'+JSON.stringify(clues));
    console.log('  sol:'+JSON.stringify(sol));
  }
}

const N=7;

// P1 from gen_nurikabe5 was OK but had islands touching - let me check which ones
// The original P1 result said OK! Let me recheck
test([
  {cl:[1,1], cells:[[0,0],[0,1],[1,1]]},
  {cl:[1,3], cells:[[1,3]]},
  {cl:[1,5], cells:[[0,5],[1,5]]},
  {cl:[3,1], cells:[[3,0],[3,1]]},
  {cl:[3,3], cells:[[3,3]]},
  {cl:[3,5], cells:[[3,5],[3,6]]},
  {cl:[5,1], cells:[[5,1],[6,1],[6,2]]},
  {cl:[5,3], cells:[[5,3]]},
  {cl:[5,5], cells:[[5,5],[6,5],[6,6]]},
], N, 'P1');

// P2
test([
  {cl:[0,0], cells:[[0,0],[0,1],[0,2]]},
  {cl:[0,5], cells:[[0,5],[0,6]]},
  {cl:[2,4], cells:[[2,4],[2,5]]},
  {cl:[4,0], cells:[[4,0],[4,1],[4,2]]},
  {cl:[2,2], cells:[[2,2]]},
  {cl:[5,4], cells:[[5,4],[5,5],[6,5]]},
  {cl:[6,0], cells:[[6,0],[6,1]]},
  {cl:[6,3], cells:[[6,3]]},
], N, 'P2');

// P3
test([
  {cl:[0,3], cells:[[0,3],[0,4],[1,4]]},
  {cl:[1,0], cells:[[1,0],[2,0]]},
  {cl:[1,6], cells:[[1,6],[2,6]]},
  {cl:[3,2], cells:[[3,2],[3,3]]},
  {cl:[4,5], cells:[[4,5],[3,5]]},
  {cl:[5,0], cells:[[5,0]]},
  {cl:[6,2], cells:[[6,2],[6,3]]},
  {cl:[6,5], cells:[[6,5]]},
], N, 'P3');

// P4
test([
  {cl:[0,0], cells:[[0,0],[0,1]]},
  {cl:[0,3], cells:[[0,3],[0,4],[0,5]]},
  {cl:[2,2], cells:[[2,2],[3,2]]},
  {cl:[2,6], cells:[[2,6],[3,6],[4,6]]},
  {cl:[4,0], cells:[[4,0],[5,0],[6,0],[6,1]]},
  {cl:[5,3], cells:[[5,3],[6,3]]},
  {cl:[5,5], cells:[[5,5]]},
], N, 'P4');

// P5
test([
  {cl:[0,1], cells:[[0,1],[0,2],[0,3],[0,4]]},
  {cl:[1,6], cells:[[1,6],[2,6]]},
  {cl:[3,0], cells:[[3,0],[4,0]]},
  {cl:[3,3], cells:[[3,3],[4,3]]},
  {cl:[3,5], cells:[[3,5]]},
  {cl:[5,1], cells:[[5,1],[6,1]]},
  {cl:[5,4], cells:[[5,4],[6,4],[6,5]]},
], N, 'P5');
