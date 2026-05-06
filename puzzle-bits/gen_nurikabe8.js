'use strict';

function validateNurikabe(clues, sol, N) {
  for (var r=0; r<N; r++) for (var c=0; c<N; c++) {
    if (clues[r][c]>0 && sol[r][c]!==1) return 'clue not white at '+r+','+c;
  }
  var visited = [];
  for (var r=0; r<N; r++) { visited.push([]); for (var c=0; c<N; c++) visited[r].push(false); }
  for (var r=0; r<N; r++) for (var c=0; c<N; c++) {
    if (sol[r][c]===1 && !visited[r][c]) {
      var cells = [], stack = [[r,c]]; visited[r][c] = true;
      var clueCount = 0, clueSize = 0;
      while (stack.length) {
        var pos = stack.pop(); var cr = pos[0], cc = pos[1];
        cells.push([cr,cc]);
        if (clues[cr][cc]>0) { clueCount++; clueSize = clues[cr][cc]; }
        var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (var di=0; di<dirs.length; di++) {
          var nr=cr+dirs[di][0], nc=cc+dirs[di][1];
          if (nr>=0&&nr<N&&nc>=0&&nc<N&&sol[nr][nc]===1&&!visited[nr][nc]) { visited[nr][nc]=true; stack.push([nr,nc]); }
        }
      }
      if (clueCount !== 1) return 'island '+clueCount+' clues at '+r+','+c;
      if (cells.length !== clueSize) return 'size mismatch at '+r+','+c+' got '+cells.length+' need '+clueSize;
    }
  }
  var blacks = [];
  for (var r=0; r<N; r++) for (var c=0; c<N; c++) if (sol[r][c]===0) blacks.push([r,c]);
  if (blacks.length>0) {
    var bVis = new Set(), stack2 = [blacks[0]]; bVis.add(blacks[0][0]+','+blacks[0][1]);
    while (stack2.length) {
      var pos = stack2.pop(); var r2=pos[0], c2=pos[1];
      var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (var di=0; di<dirs.length; di++) {
        var nr=r2+dirs[di][0], nc=c2+dirs[di][1];
        if (nr>=0&&nr<N&&nc>=0&&nc<N&&sol[nr][nc]===0&&!bVis.has(nr+','+nc)) { bVis.add(nr+','+nc); stack2.push([nr,nc]); }
      }
    }
    if (bVis.size!==blacks.length) return 'river not connected '+bVis.size+'/'+blacks.length;
  }
  for (var r=0; r<N-1; r++) for (var c=0; c<N-1; c++) {
    if (sol[r][c]===0&&sol[r+1][c]===0&&sol[r][c+1]===0&&sol[r+1][c+1]===0) return '2x2 black at '+r+','+c;
  }
  return null;
}

// P1 works: same solution grid, just vary clue positions
var baseSol = [
  [1,1,0,0,0,1,0],
  [0,1,0,1,0,1,0],
  [0,0,0,0,0,0,0],
  [1,1,0,1,0,1,1],
  [0,0,0,0,0,0,0],
  [0,1,0,1,0,1,0],
  [0,1,1,0,0,1,1]
];

// Islands in this solution:
// A: (0,0),(0,1),(1,1) - size 3 - possible clue cells: any of these
// B: (1,3) - size 1
// C: (0,5),(1,5) - size 2 - possible clue: 0,5 or 1,5
// D: (3,0),(3,1) - size 2 - possible clue: 3,0 or 3,1
// E: (3,3) - size 1
// F: (3,5),(3,6) - size 2 - possible clue: 3,5 or 3,6
// G: (5,1),(6,1),(6,2) - size 3 - possible clue: any
// H: (5,3) - size 1
// I: (5,5),(6,5),(6,6) - size 3 - possible clue: any

// 5 different clue configurations:
var puzzleClues = [
  // P1: original
  {A:[1,1], B:[1,3], C:[1,5], D:[3,1], E:[3,3], F:[3,5], G:[5,1], H:[5,3], I:[5,5]},
  // P2: shift some
  {A:[0,0], B:[1,3], C:[0,5], D:[3,0], E:[3,3], F:[3,6], G:[6,1], H:[5,3], I:[6,5]},
  // P3
  {A:[0,1], B:[1,3], C:[0,5], D:[3,1], E:[3,3], F:[3,5], G:[6,2], H:[5,3], I:[6,6]},
  // P4
  {A:[1,1], B:[1,3], C:[1,5], D:[3,0], E:[3,3], F:[3,6], G:[5,1], H:[5,3], I:[5,5]},
  // P5
  {A:[0,0], B:[1,3], C:[1,5], D:[3,1], E:[3,3], F:[3,5], G:[6,2], H:[5,3], I:[6,6]},
];

for (var pi=0; pi<puzzleClues.length; pi++) {
  var pc = puzzleClues[pi];
  var clues = [];
  for (var r=0; r<7; r++) { clues.push([]); for (var c=0; c<7; c++) clues[r].push(0); }

  // A size 3
  clues[pc.A[0]][pc.A[1]] = 3;
  // B size 1
  clues[pc.B[0]][pc.B[1]] = 1;
  // C size 2
  clues[pc.C[0]][pc.C[1]] = 2;
  // D size 2
  clues[pc.D[0]][pc.D[1]] = 2;
  // E size 1
  clues[pc.E[0]][pc.E[1]] = 1;
  // F size 2
  clues[pc.F[0]][pc.F[1]] = 2;
  // G size 3
  clues[pc.G[0]][pc.G[1]] = 3;
  // H size 1
  clues[pc.H[0]][pc.H[1]] = 1;
  // I size 3
  clues[pc.I[0]][pc.I[1]] = 3;

  var err = validateNurikabe(clues, baseSol, 7);
  console.log('P'+(pi+1)+': '+(err||'OK'));
  if (!err) {
    console.log('  clues:'+JSON.stringify(clues));
  }
}
console.log('sol:'+JSON.stringify(baseSol));
