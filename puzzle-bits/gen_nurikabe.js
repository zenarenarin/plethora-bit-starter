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

function randInt(n) { return Math.floor(Math.random()*n); }

function genValid(N, sizes) {
  const totalWhite = sizes.reduce((a,b)=>a+b,0);

  for (let attempt=0; attempt<500000; attempt++) {
    const sol = Array.from({length:N},()=>new Array(N).fill(0));
    const allCells = [];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) allCells.push([r,c]);
    for (let i=allCells.length-1; i>0; i--) {
      const j=randInt(i+1); [allCells[i],allCells[j]]=[allCells[j],allCells[i]];
    }
    for (let i=0; i<totalWhite; i++) sol[allCells[i][0]][allCells[i][1]]=1;

    let ok=true;
    for (let r=0; r<N-1&&ok; r++) for (let c=0; c<N-1&&ok; c++) {
      if (!sol[r][c]&&!sol[r+1][c]&&!sol[r][c+1]&&!sol[r+1][c+1]) ok=false;
    }
    if (!ok) continue;

    const blacks=[];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) if (!sol[r][c]) blacks.push([r,c]);
    if (blacks.length===0) continue;
    const bVis=new Set(); const stack=[blacks[0]]; bVis.add(blacks[0].join(','));
    while(stack.length){
      const [r,c]=stack.pop();
      for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<N&&nc>=0&&nc<N&&!sol[nr][nc]&&!bVis.has(nr+','+nc)){bVis.add(nr+','+nc);stack.push([nr,nc]);}
      }
    }
    if(bVis.size!==blacks.length) continue;

    const clues = Array.from({length:N},()=>new Array(N).fill(0));
    const visited2 = Array.from({length:N},()=>new Array(N).fill(false));
    const islands = [];
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
      if (sol[r][c]===1&&!visited2[r][c]) {
        const cells=[]; const st=[[r,c]]; visited2[r][c]=true;
        while(st.length){
          const [cr,cc]=st.pop(); cells.push([cr,cc]);
          for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
            const nr=cr+dr,nc=cc+dc;
            if(nr>=0&&nr<N&&nc>=0&&nc<N&&sol[nr][nc]===1&&!visited2[nr][nc]){visited2[nr][nc]=true;st.push([nr,nc]);}
          }
        }
        islands.push(cells);
      }
    }

    const actualSizes = islands.map(i=>i.length).sort((a,b)=>a-b);
    const targetSizes = [...sizes].sort((a,b)=>a-b);
    if (JSON.stringify(actualSizes)!==JSON.stringify(targetSizes)) continue;

    for (const cells of islands) {
      cells.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      clues[cells[0][0]][cells[0][1]] = cells.length;
    }

    return {clues, sol};
  }
  return null;
}

const N=7;
const allSizes = [
  [1,2,2,3,3,4],
  [1,2,3,3,4],
  [1,2,2,3,3,4],
  [1,2,2,3,3,4],
  [2,2,3,3,4],
];

for (let i=0; i<allSizes.length; i++) {
  const res = genValid(N, allSizes[i]);
  if (res) {
    console.log('Puzzle '+(i+1)+': OK sizes='+allSizes[i].join(','));
    console.log('clues:'+JSON.stringify(res.clues));
    console.log('sol:'+JSON.stringify(res.sol));
  } else {
    console.log('Puzzle '+(i+1)+': FAILED');
  }
}
