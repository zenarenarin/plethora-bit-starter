window.plethoraBit = {
  meta: {
    title: 'Nagenawa',
    author: 'plethora',
    description: 'Draw loops connecting colored pairs through required regions.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;

    const ACCENT = '#CE93D8';
    const BG = '#0f0f14';

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // 6×6 grid. Tap between cells to draw/erase edge segments.
    // Each pair = two circles of same color; path must pass through required regions.
    // Edge types:
    //   V_r_c — vertical wall between cell(r,c) and cell(r,c+1), runs top→bottom at x=ox+(c+1)*CELL
    //   H_r_c — horizontal wall between cell(r,c) and cell(r+1,c), runs left→right at y=oy+(r+1)*CELL

    const N = 6;
    const COLORS = ['#CE93D8', '#80CBC4', '#FFB74D', '#81C784', '#F48FB1'];

    const PUZZLES = [
      {
        name: 'DAWN',
        regions: [
          { id: 0, label: 'A', cells: [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]] },
          { id: 1, label: 'B', cells: [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3]] },
          { id: 2, label: 'C', cells: [[1,4],[1,5],[2,2],[2,3],[2,4],[2,5]] },
          { id: 3, label: 'D', cells: [[3,0],[3,1],[3,2],[4,0],[4,1],[4,2]] },
          { id: 4, label: 'E', cells: [[3,3],[3,4],[3,5],[4,3],[4,4],[4,5]] },
          { id: 5, label: 'F', cells: [[5,0],[5,1],[5,2],[5,3],[5,4],[5,5]] },
        ],
        pairs: [
          { colorIdx: 0, cells: [[0,0],[3,0]], requiredRegions: [0, 3] },
          { colorIdx: 1, cells: [[0,5],[2,5]], requiredRegions: [1, 2] },
          { colorIdx: 2, cells: [[4,2],[5,5]], requiredRegions: [3, 5] },
          { colorIdx: 3, cells: [[3,4],[5,1]], requiredRegions: [4, 5] },
        ],
      },
      {
        name: 'MIST',
        regions: [
          { id: 0, label: 'A', cells: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]] },
          { id: 1, label: 'B', cells: [[0,3],[0,4],[0,5],[1,3],[1,4],[1,5]] },
          { id: 2, label: 'C', cells: [[2,0],[2,1],[2,2],[3,0],[3,1]] },
          { id: 3, label: 'D', cells: [[2,3],[2,4],[2,5],[3,4],[3,5]] },
          { id: 4, label: 'E', cells: [[3,2],[3,3],[4,0],[4,1],[4,2]] },
          { id: 5, label: 'F', cells: [[4,3],[4,4],[4,5],[5,0],[5,1],[5,2],[5,3],[5,4],[5,5]] },
        ],
        pairs: [
          { colorIdx: 0, cells: [[0,1],[2,1]], requiredRegions: [0, 2] },
          { colorIdx: 1, cells: [[0,4],[2,4]], requiredRegions: [1, 3] },
          { colorIdx: 2, cells: [[3,0],[5,3]], requiredRegions: [2, 5] },
          { colorIdx: 3, cells: [[3,5],[5,5]], requiredRegions: [3, 5] },
        ],
      },
      {
        name: 'TIDE',
        regions: [
          { id: 0, label: 'A', cells: [[0,0],[0,1],[0,2],[0,3],[1,0],[1,1]] },
          { id: 1, label: 'B', cells: [[0,4],[0,5],[1,4],[1,5],[2,4],[2,5]] },
          { id: 2, label: 'C', cells: [[1,2],[1,3],[2,2],[2,3],[3,2],[3,3]] },
          { id: 3, label: 'D', cells: [[2,0],[2,1],[3,0],[3,1],[4,0],[4,1]] },
          { id: 4, label: 'E', cells: [[3,4],[3,5],[4,4],[4,5],[5,4],[5,5]] },
          { id: 5, label: 'F', cells: [[4,2],[4,3],[5,0],[5,1],[5,2],[5,3]] },
        ],
        pairs: [
          { colorIdx: 0, cells: [[0,0],[3,0]], requiredRegions: [0, 3] },
          { colorIdx: 1, cells: [[0,5],[3,5]], requiredRegions: [1, 4] },
          { colorIdx: 2, cells: [[2,2],[5,2]], requiredRegions: [2, 5] },
          { colorIdx: 3, cells: [[2,0],[4,3]], requiredRegions: [3, 5] },
        ],
      },
      {
        name: 'GLOW',
        regions: [
          { id: 0, label: 'A', cells: [[0,0],[0,1],[1,0],[1,1],[2,0]] },
          { id: 1, label: 'B', cells: [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3]] },
          { id: 2, label: 'C', cells: [[1,4],[1,5],[2,4],[2,5],[3,4],[3,5]] },
          { id: 3, label: 'D', cells: [[2,1],[2,2],[2,3],[3,1],[3,2],[3,3]] },
          { id: 4, label: 'E', cells: [[3,0],[4,0],[4,1],[5,0],[5,1]] },
          { id: 5, label: 'F', cells: [[4,2],[4,3],[4,4],[4,5],[5,2],[5,3],[5,4],[5,5]] },
        ],
        pairs: [
          { colorIdx: 0, cells: [[0,0],[3,0]], requiredRegions: [0, 4] },
          { colorIdx: 1, cells: [[0,3],[2,3]], requiredRegions: [1, 3] },
          { colorIdx: 2, cells: [[1,5],[4,5]], requiredRegions: [2, 5] },
          { colorIdx: 3, cells: [[3,2],[5,4]], requiredRegions: [3, 5] },
        ],
      },
      {
        name: 'DUSK',
        regions: [
          { id: 0, label: 'A', cells: [[0,0],[0,1],[0,2],[1,0],[2,0],[2,1]] },
          { id: 1, label: 'B', cells: [[0,3],[0,4],[0,5],[1,3],[1,4],[1,5]] },
          { id: 2, label: 'C', cells: [[1,1],[1,2],[2,2],[2,3],[3,2],[3,3]] },
          { id: 3, label: 'D', cells: [[2,4],[2,5],[3,4],[3,5],[4,4],[4,5]] },
          { id: 4, label: 'E', cells: [[3,0],[3,1],[4,0],[4,1],[4,2],[4,3]] },
          { id: 5, label: 'F', cells: [[5,0],[5,1],[5,2],[5,3],[5,4],[5,5]] },
        ],
        pairs: [
          { colorIdx: 0, cells: [[0,0],[4,0]], requiredRegions: [0, 4] },
          { colorIdx: 1, cells: [[0,4],[2,4]], requiredRegions: [1, 3] },
          { colorIdx: 2, cells: [[1,2],[3,2]], requiredRegions: [2, 4] },
          { colorIdx: 3, cells: [[3,5],[5,5]], requiredRegions: [3, 5] },
        ],
      },
    ];

    let showInfo = false;
    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showSolution = false;
    const EYE_X = W - 22, EYE_Y = 62, EYE_R = 14;

    let puzzleIdx = ctx.storage.get('naga_idx') || 0;
    let edges = new Set();
    let solved = false;
    let solveTime = 0;
    let startTime = 0;
    let gameStarted = false;
    let audioCtx = null;
    let voices = [];
    let solveAnim = 0;

    function currentPuzzle() { return PUZZLES[puzzleIdx % PUZZLES.length]; }

    // Build edge keys for an L-shaped path between two cells
    function pathToEdgeKeys(a, b) {
      const keys = new Set();
      const [r1, c1] = a;
      const [r2, c2] = b;
      const dr = r2 >= r1 ? 1 : -1;
      const dc = c2 >= c1 ? 1 : -1;
      let cr = r1, cc = c1;
      // walk rows first
      while (cr !== r2) {
        const nr = cr + dr;
        if (dr > 0) keys.add(`H_${cr}_${cc}`);
        else keys.add(`H_${nr}_${cc}`);
        cr = nr;
      }
      // then walk cols
      while (cc !== c2) {
        const nc = cc + dc;
        if (dc > 0) keys.add(`V_${cr}_${cc}`);
        else keys.add(`V_${cr}_${nc}`);
        cc = nc;
      }
      return keys;
    }

    function applySolution() {
      const puzzle = currentPuzzle();
      edges = new Set();
      for (const pair of puzzle.pairs) {
        const [a, b] = pair.cells;
        const keys = pathToEdgeKeys(a, b);
        for (const k of keys) edges.add(k);
      }
      showSolution = true;
    }

    function initPuzzle() {
      edges = new Set();
      solved = false;
      solveTime = 0;
      startTime = 0;
      gameStarted = false;
      solveAnim = 0;
      showSolution = false;
    }

    function getLayout() {
      const HUD_H = 56;
      const availW = W - 32;
      const availH = USABLE_H - HUD_H - 20;
      const CELL = Math.min(Math.floor(availW / N), Math.floor(availH / N), 58);
      const gridW = CELL * N;
      const gridH = CELL * N;
      const ox = Math.floor((W - gridW) / 2);
      const oy = HUD_H + Math.floor((availH - gridH) / 2) + 4;
      return { CELL, ox, oy };
    }

    function nearestEdge(px, py, layout) {
      const { CELL, ox, oy } = layout;
      const THRESH = CELL * 0.40;
      let best = null, bestDist = Infinity;

      // V_r_c: vertical segment between cell(r,c) and cell(r,c+1)
      // drawn at x=ox+(c+1)*CELL, y from oy+r*CELL to oy+(r+1)*CELL
      // hit test: midpoint of that segment
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N - 1; c++) {
          const ex = ox + (c + 1) * CELL;
          const ey = oy + r * CELL + CELL / 2;
          const d = Math.hypot(px - ex, py - ey);
          if (d < THRESH && d < bestDist) { bestDist = d; best = `V_${r}_${c}`; }
        }
      }
      // H_r_c: horizontal segment between cell(r,c) and cell(r+1,c)
      // drawn at y=oy+(r+1)*CELL, x from ox+c*CELL to ox+(c+1)*CELL
      for (let r = 0; r < N - 1; r++) {
        for (let c = 0; c < N; c++) {
          const ex = ox + c * CELL + CELL / 2;
          const ey = oy + (r + 1) * CELL;
          const d = Math.hypot(px - ex, py - ey);
          if (d < THRESH && d < bestDist) { bestDist = d; best = `H_${r}_${c}`; }
        }
      }
      return best;
    }

    function edgeEndpoints(key, layout) {
      const { CELL, ox, oy } = layout;
      const [type, rs, cs] = key.split('_');
      const r = parseInt(rs), c = parseInt(cs);
      if (type === 'V') {
        const x = ox + (c + 1) * CELL;
        return [[x, oy + r * CELL], [x, oy + (r + 1) * CELL]];
      } else {
        const y = oy + (r + 1) * CELL;
        return [[ox + c * CELL, y], [ox + (c + 1) * CELL, y]];
      }
    }

    function regionFillColor(id) {
      const hues = [270, 180, 30, 130, 330, 200];
      return `hsla(${hues[id % hues.length]}, 40%, 28%, 0.22)`;
    }

    function regionLabelColor(id) {
      const hues = [270, 180, 30, 130, 330, 200];
      return `hsla(${hues[id % hues.length]}, 55%, 65%, 0.50)`;
    }

    function cellRegion(r, c, puzzle) {
      for (const reg of puzzle.regions) {
        if (reg.cells.some(([rr, cc]) => rr === r && cc === c)) return reg.id;
      }
      return -1;
    }

    // BFS from pair endpoint a through edges, track which region cells visited
    function pairReachesB(pair, puzzle) {
      const [a, b] = pair.cells;
      const visitedCells = new Set();
      const queue = [`${a[0]},${a[1]}`];
      visitedCells.add(queue[0]);
      const regionsVisited = new Set();
      const startReg = cellRegion(a[0], a[1], puzzle);
      if (startReg >= 0) regionsVisited.add(startReg);

      while (queue.length) {
        const [cr, cc] = queue.shift().split(',').map(Number);
        const neighbors = [
          { nr: cr, nc: cc+1, ek: `V_${cr}_${cc}` },
          { nr: cr, nc: cc-1, ek: `V_${cr}_${cc-1}` },
          { nr: cr+1, nc: cc, ek: `H_${cr}_${cc}` },
          { nr: cr-1, nc: cc, ek: `H_${cr-1}_${cc}` },
        ];
        for (const { nr, nc, ek } of neighbors) {
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          if (!edges.has(ek)) continue;
          const nk = `${nr},${nc}`;
          if (visitedCells.has(nk)) continue;
          visitedCells.add(nk);
          queue.push(nk);
          const reg = cellRegion(nr, nc, puzzle);
          if (reg >= 0) regionsVisited.add(reg);
        }
      }

      const reached = visitedCells.has(`${b[0]},${b[1]}`);
      if (!reached) return false;
      for (const reqR of pair.requiredRegions) {
        if (!regionsVisited.has(reqR)) return false;
      }
      return true;
    }

    function checkSolved() {
      const puzzle = currentPuzzle();
      return puzzle.pairs.every(pair => pairReachesB(pair, puzzle));
    }

    function triggerSolve(now) {
      solved = true;
      solveAnim = now;
      solveTime = now - startTime;
      const best = ctx.storage.get('bt_nagenawa') || 0;
      if (!best || solveTime < best) ctx.storage.set('bt_nagenawa', solveTime);
      ctx.platform.complete({ score: Math.floor(solveTime), result: 'solved', durationMs: solveTime });
      playChord();
    }

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
    }

    function playNote(freq, dur, vol) {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      if (voices.length >= 8) { try { voices.shift().stop(t); } catch(e) {} }
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur);
      voices.push(o);
      o.onended = () => { voices = voices.filter(v => v !== o); };
    }

    function playChord() {
      if (!audioCtx) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const t = audioCtx.currentTime + i * 0.06;
        if (voices.length >= 8) { try { voices.shift().stop(t); } catch(e) {} }
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = f;
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(0.15, t + 0.04);
        gn.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.start(t); o.stop(t + 0.5);
        voices.push(o);
        o.onended = () => { voices = voices.filter(v => v !== o); };
      });
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, '0')}`;
    }

    initPuzzle();

    ctx.raf(() => {
      const now = performance.now();
      const elapsed = gameStarted && !solved ? now - startTime : solveTime;
      const layout = getLayout();
      const { CELL, ox, oy } = layout;
      const puzzle = currentPuzzle();

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD
      g.fillStyle = '#ffffff14';
      g.fillRect(0, 0, W, 48);
      g.font = 'bold 15px -apple-system, sans-serif';
      g.fillStyle = ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`NAGENAWA  ${(puzzleIdx % PUZZLES.length) + 1}/${PUZZLES.length}  ${puzzle.name}`, 16, 24);
      g.textAlign = 'right';
      g.fillStyle = '#aaaacc';
      g.fillText(formatTime(gameStarted ? elapsed : 0), W - 50, 24);

      // Region fills
      for (const reg of puzzle.regions) {
        g.fillStyle = regionFillColor(reg.id);
        for (const [r, c] of reg.cells) {
          g.fillRect(ox + c * CELL + 1, oy + r * CELL + 1, CELL - 2, CELL - 2);
        }
      }

      // Region labels (centered in each region)
      for (const reg of puzzle.regions) {
        let sumR = 0, sumC = 0;
        for (const [r, c] of reg.cells) { sumR += r; sumC += c; }
        const avgR = sumR / reg.cells.length;
        const avgC = sumC / reg.cells.length;
        g.font = `bold ${Math.max(11, CELL * 0.30)}px -apple-system, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = regionLabelColor(reg.id);
        g.fillText(reg.label, ox + avgC * CELL + CELL / 2, oy + avgR * CELL + CELL / 2);
      }

      // Grid lines
      g.strokeStyle = '#ffffff18';
      g.lineWidth = 1;
      for (let r = 0; r <= N; r++) {
        g.beginPath();
        g.moveTo(ox, oy + r * CELL);
        g.lineTo(ox + N * CELL, oy + r * CELL);
        g.stroke();
      }
      for (let c = 0; c <= N; c++) {
        g.beginPath();
        g.moveTo(ox + c * CELL, oy);
        g.lineTo(ox + c * CELL, oy + N * CELL);
        g.stroke();
      }

      // Drawn edges
      g.lineWidth = 3.5;
      g.lineCap = 'round';
      for (const key of edges) {
        const pts = edgeEndpoints(key, layout);
        g.strokeStyle = ACCENT + 'cc';
        g.shadowColor = ACCENT;
        g.shadowBlur = 6;
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        g.lineTo(pts[1][0], pts[1][1]);
        g.stroke();
      }
      g.shadowBlur = 0;

      // Circle pair endpoints
      for (const pair of puzzle.pairs) {
        const col = COLORS[pair.colorIdx];
        for (const [r, c] of pair.cells) {
          const cx2 = ox + c * CELL + CELL / 2;
          const cy2 = oy + r * CELL + CELL / 2;
          const rad = CELL * 0.28;
          g.beginPath();
          g.arc(cx2, cy2, rad, 0, Math.PI * 2);
          g.fillStyle = col;
          g.shadowColor = col;
          g.shadowBlur = 10;
          g.fill();
          g.shadowBlur = 0;
          g.strokeStyle = '#ffffff44';
          g.lineWidth = 1.5;
          g.stroke();
        }
      }

      // Info button — drawn LAST
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // Eye / see-solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_Y, EYE_R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_Y);
      g.restore();

      // Info panel
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const cw = Math.floor(W * 0.84);
        const cx2 = Math.floor((W - cw) / 2);
        const ch = Math.min(Math.floor(USABLE_H * 0.76), 480);
        const cy2 = Math.floor((USABLE_H - ch) / 2);
        g.fillStyle = '#1a1a2e';
        g.beginPath();
        if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16);
        else g.rect(cx2, cy2, cw, ch);
        g.fill();
        g.save(); g.globalAlpha = 0.12; g.fillStyle = ACCENT;
        g.beginPath(); g.arc(W / 2, cy2 + 52, 64, 0, Math.PI * 2); g.fill();
        g.restore();
        g.fillStyle = ACCENT;
        g.font = 'bold 26px -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('NAGENAWA', W / 2, cy2 + 54);
        const lx = cx2 + 20;
        let ty2 = cy2 + 80;
        const lh = 22;
        g.font = 'bold 11px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'left';
        g.fillText('HOW TO PLAY', lx, ty2); ty2 += lh;
        const rules = [
          '• Tap between cells to draw or erase segments',
          '• Connect each same-color circle pair with a path',
          '• Each path must pass through its labeled regions',
          '• Colored zones show regions (A, B, C…)',
          '• Connect all pairs correctly to solve!',
        ];
        g.font = '13px -apple-system, sans-serif';
        g.fillStyle = '#ffffff';
        for (const line of rules) { g.fillText(line, lx, ty2); ty2 += lh; }
        g.font = 'bold 13px -apple-system, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.textAlign = 'center';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, cy2 + ch - 20);
      }

      // Solved overlay
      if (solved && solveAnim > 0 && now - solveAnim > 400) {
        g.fillStyle = 'rgba(15,15,20,0.88)';
        g.fillRect(0, 0, W, USABLE_H);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 38px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.shadowColor = ACCENT; g.shadowBlur = 28;
        g.fillText('SOLVED!', W / 2, USABLE_H / 2 - 56);
        g.shadowBlur = 0;
        g.font = '18px -apple-system, sans-serif';
        g.fillStyle = '#ffffff99';
        g.fillText(`Time: ${formatTime(solveTime)}`, W / 2, USABLE_H / 2 - 12);
        const best = ctx.storage.get('bt_nagenawa') || 0;
        g.fillText(`Best: ${formatTime(best)}`, W / 2, USABLE_H / 2 + 20);
        g.fillStyle = ACCENT + '22';
        g.strokeStyle = ACCENT;
        g.lineWidth = 1.5;
        g.beginPath();
        if (g.roundRect) g.roundRect(W / 2 - 100, USABLE_H / 2 + 52, 200, 48, 12);
        else g.rect(W / 2 - 100, USABLE_H / 2 + 52, 200, 48);
        g.fill(); g.stroke();
        g.font = 'bold 15px -apple-system, sans-serif';
        g.fillStyle = ACCENT;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('NEXT PUZZLE', W / 2, USABLE_H / 2 + 76);
      }

      if (showSolution) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, USABLE_H - 48, W, 48);
        g.fillStyle = ACCENT;
        g.font = 'bold 15px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TAP ANYWHERE FOR NEW PUZZLE', W / 2, USABLE_H - 24);
      }
    });

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // Eye / see-solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_Y) < EYE_R + 8) {
        applySolution();
        return;
      }

      if (showSolution) {
        initPuzzle();
        return;
      }

      if (solved && solveAnim > 0 && performance.now() - solveAnim > 400) {
        puzzleIdx = (puzzleIdx + 1) % PUZZLES.length;
        ctx.storage.set('naga_idx', puzzleIdx);
        initPuzzle();
        return;
      }

      if (ty >= H - SAFE) return;

      if (!gameStarted) {
        gameStarted = true;
        startTime = performance.now();
        ctx.platform.start();
      }

      const layout = getLayout();
      const ekey = nearestEdge(tx, ty, layout);
      if (!ekey) return;

      if (edges.has(ekey)) {
        edges.delete(ekey);
      } else {
        edges.add(ekey);
        playNote(640 + edges.size * 10, 0.09, 0.10);
        ctx.platform.interact({ type: 'draw' });
        ctx.platform.haptic('light');
      }

      if (!solved && checkSolved()) triggerSolve(performance.now());
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
