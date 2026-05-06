// REWIRE — Circuit Connection Puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Rewire',
    author: 'plethora',
    description: 'Connect source to target by toggling wire segments.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#00E5FF';
    const BG = '#0f0f14';
    const HUD_H = 48;
    const IBTN = { x: W - 22, y: 8, r: 14 };

    // --- Audio ---
    let audioCtx = null;
    const voices = [];
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol = 0.25) {
      if (!audioCtx) return;
      while (voices.length >= 8) { try { voices.shift().stop(); } catch(e){} }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
    }
    function playClick() { playTone(440, 'square', 0.06, 0.2); }
    function playConnect() { [523, 659, 784].forEach((f,i) => setTimeout(() => playTone(f, 'sine', 0.15, 0.3), i * 80)); }
    function playWin() { [523, 659, 784, 1047].forEach((f,i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.35), i * 100)); }
    function playError() { playTone(200, 'sawtooth', 0.12, 0.2); }

    // --- Storage ---
    const bestKey = 'hs_rewire';
    let bestScores = ctx.storage.get(bestKey) || {};

    // --- Levels ---
    // Each level: nodes {id, c, r, type:'source'|'target'|'node'},
    //             wires [{a, b, on}] (a/b are node ids)
    // 6x6 grid, node positions col/row
    const LEVELS = [
      // Level 1 — simple straight line, 2 cuts
      {
        nodes: [
          { id:'S', c:0, r:2, type:'source' },
          { id:'A', c:2, r:2, type:'node' },
          { id:'B', c:4, r:2, type:'node' },
          { id:'T', c:5, r:2, type:'target' },
        ],
        wires: [
          { id:'w0', a:'S', b:'A', on:false },
          { id:'w1', a:'A', b:'B', on:true },
          { id:'w2', a:'B', b:'T', on:false },
          // decoys
          { id:'w3', a:'A', b:'A2', on:true },  // orphan, ignored visually below
        ].filter(w => w.a && w.b),
        extra_nodes: [],
        solution_wires: 3,
      },
      // Level 2 — L-shape with one decoy branch
      {
        nodes: [
          { id:'S', c:0, r:0, type:'source' },
          { id:'A', c:2, r:0, type:'node' },
          { id:'B', c:2, r:3, type:'node' },
          { id:'T', c:5, r:3, type:'target' },
          { id:'D', c:4, r:0, type:'node' },
        ],
        wires: [
          { id:'w0', a:'S', b:'A', on:false },
          { id:'w1', a:'A', b:'B', on:true },
          { id:'w2', a:'B', b:'T', on:false },
          { id:'w3', a:'A', b:'D', on:true },
        ],
        solution_wires: 3,
      },
      // Level 3 — two paths, pick shorter
      {
        nodes: [
          { id:'S', c:0, r:2, type:'source' },
          { id:'A', c:2, r:1, type:'node' },
          { id:'B', c:2, r:3, type:'node' },
          { id:'C', c:4, r:2, type:'node' },
          { id:'T', c:5, r:2, type:'target' },
        ],
        wires: [
          { id:'w0', a:'S', b:'A', on:false },
          { id:'w1', a:'A', b:'C', on:false },
          { id:'w2', a:'S', b:'B', on:false },
          { id:'w3', a:'B', b:'C', on:true },
          { id:'w4', a:'C', b:'T', on:false },
        ],
        solution_wires: 3,
      },
      // Level 4 — cross grid
      {
        nodes: [
          { id:'S', c:0, r:0, type:'source' },
          { id:'A', c:2, r:0, type:'node' },
          { id:'B', c:0, r:3, type:'node' },
          { id:'C', c:2, r:3, type:'node' },
          { id:'D', c:4, r:1, type:'node' },
          { id:'T', c:5, r:4, type:'target' },
        ],
        wires: [
          { id:'w0', a:'S', b:'A', on:true },
          { id:'w1', a:'A', b:'D', on:false },
          { id:'w2', a:'D', b:'T', on:false },
          { id:'w3', a:'S', b:'B', on:false },
          { id:'w4', a:'B', b:'C', on:true },
          { id:'w5', a:'C', b:'D', on:true },
        ],
        solution_wires: 3,
      },
      // Level 5 — dense, many decoys
      {
        nodes: [
          { id:'S', c:0, r:0, type:'source' },
          { id:'A', c:1, r:2, type:'node' },
          { id:'B', c:3, r:0, type:'node' },
          { id:'C', c:3, r:3, type:'node' },
          { id:'D', c:5, r:1, type:'node' },
          { id:'E', c:4, r:4, type:'node' },
          { id:'T', c:5, r:5, type:'target' },
        ],
        wires: [
          { id:'w0', a:'S', b:'A', on:true },
          { id:'w1', a:'A', b:'C', on:false },
          { id:'w2', a:'S', b:'B', on:false },
          { id:'w3', a:'B', b:'D', on:false },
          { id:'w4', a:'D', b:'T', on:false },
          { id:'w5', a:'C', b:'E', on:true },
          { id:'w6', a:'E', b:'T', on:true },
          { id:'w7', a:'B', b:'C', on:true },
        ],
        solution_wires: 3,
      },
    ];

    // --- State ---
    let level = 0;
    let nodes = [];
    let wires = [];
    let solved = false;
    let won = false;
    let showInfo = false;
    let started = false;
    let flowT = 0;
    let flowPath = [];
    let solveAnim = 0;  // 0..1 pulse on solve
    let tapCount = 0;

    // Grid layout
    const GRID_COLS = 6, GRID_ROWS = 6;
    const PAD = 32;
    const GRID_X = PAD;
    const GRID_Y = HUD_H + 20;
    const GRID_W = W - PAD * 2;
    const GRID_H = H - GRID_Y - SAFE - 40;
    const CW = GRID_W / (GRID_COLS - 1);
    const CH = GRID_H / (GRID_ROWS - 1);

    function nodePos(n) {
      return { x: GRID_X + n.c * CW, y: GRID_Y + n.r * CH };
    }

    function loadLevel(idx) {
      const def = LEVELS[idx];
      // deep clone
      nodes = def.nodes.map(n => ({ ...n }));
      wires = def.wires.map(w => ({ ...w }));
      solved = false;
      flowPath = [];
      flowT = 0;
      solveAnim = 0;
      tapCount = 0;
      checkSolve();
    }

    function nodeById(id) { return nodes.find(n => n.id === id); }

    // BFS to find path from S to T using only on wires
    function findPath() {
      const source = nodes.find(n => n.type === 'source');
      const target = nodes.find(n => n.type === 'target');
      if (!source || !target) return null;
      const adj = {};
      nodes.forEach(n => { adj[n.id] = []; });
      wires.forEach(w => {
        if (w.on) {
          if (adj[w.a]) adj[w.a].push(w.b);
          if (adj[w.b]) adj[w.b].push(w.a);
        }
      });
      const queue = [[source.id]];
      const visited = new Set([source.id]);
      while (queue.length) {
        const path = queue.shift();
        const cur = path[path.length - 1];
        if (cur === target.id) return path;
        for (const nb of (adj[cur] || [])) {
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push([...path, nb]);
          }
        }
      }
      return null;
    }

    function checkSolve() {
      const path = findPath();
      if (path) {
        // build point path
        flowPath = path.map(id => {
          const n = nodeById(id);
          return nodePos(n);
        });
        if (!solved) {
          solved = true;
          const onCount = wires.filter(w => w.on).length;
          const def = LEVELS[level];
          ctx.platform.haptic('medium');
          playConnect();
          if (onCount <= def.solution_wires) {
            // optimal
            ctx.platform.haptic('heavy');
          }
          // save best
          const prev = bestScores[level] || Infinity;
          if (onCount < prev) {
            bestScores[level] = onCount;
            ctx.storage.set(bestKey, bestScores);
          }
          solveAnim = 1;
        }
      } else {
        flowPath = [];
        if (solved) solved = false;
      }
    }

    function wireHitTest(wx, wy, w) {
      const na = nodeById(w.a), nb = nodeById(w.b);
      if (!na || !nb) return false;
      const pa = nodePos(na), pb = nodePos(nb);
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      // hit segment
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) return false;
      const ux = dx / len, uy = dy / len;
      const tx = wx - pa.x, ty = wy - pa.y;
      const proj = tx * ux + ty * uy;
      const perp = Math.abs(tx * uy - ty * ux);
      return proj >= -8 && proj <= len + 8 && perp <= 16;
    }

    loadLevel(0);

    // --- Touch ---
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // IBTN first
      if (Math.hypot(tx - IBTN.x, ty - IBTN.y) <= IBTN.r + 8) {
        showInfo = !showInfo;
        playClick();
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (won) {
        // restart from level 1
        level = 0;
        won = false;
        loadLevel(0);
        started = false;
        return;
      }

      if (solved) {
        // advance level
        if (level < LEVELS.length - 1) {
          level++;
          loadLevel(level);
        } else {
          won = true;
          playWin();
          ctx.platform.complete({ score: Object.values(bestScores).reduce((a,b) => a+b, 0) });
        }
        return;
      }

      if (!started) {
        started = true;
        ctx.platform.start();
      }

      // tap wire
      let hit = false;
      for (const w of wires) {
        if (wireHitTest(tx, ty, w)) {
          w.on = !w.on;
          tapCount++;
          playClick();
          checkSolve();
          ctx.platform.interact({ type: 'tap' });
          hit = true;
          break;
        }
      }
      if (!hit) playError();
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    // --- Draw ---
    ctx.raf((dt) => {
      const sec = dt / 1000;
      flowT = (flowT + sec * 0.6) % 1;
      if (solveAnim > 0) solveAnim = Math.max(0, solveAnim - sec * 1.5);

      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // Grid dots
      g.fillStyle = 'rgba(0,229,255,0.06)';
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const x = GRID_X + c * CW, y = GRID_Y + r * CH;
          g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
        }
      }

      // Draw wires
      for (const w of wires) {
        const na = nodeById(w.a), nb = nodeById(w.b);
        if (!na || !nb) continue;
        const pa = nodePos(na), pb = nodePos(nb);

        // shadow
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 8;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();

        if (w.on) {
          // glow
          g.strokeStyle = `rgba(0,229,255,0.18)`;
          g.lineWidth = 12;
          g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();

          g.strokeStyle = ACCENT;
          g.lineWidth = 3;
          g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
        } else {
          // cut wire — dashed gap
          g.strokeStyle = 'rgba(0,229,255,0.3)';
          g.lineWidth = 2;
          g.setLineDash([6, 10]);
          g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
          g.setLineDash([]);

          // cut mark at midpoint
          const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
          const dx = pb.x - pa.x, dy = pb.y - pa.y;
          const len = Math.hypot(dx, dy);
          const px = -dy / len * 6, py = dx / len * 6;
          g.strokeStyle = '#FF4444';
          g.lineWidth = 2;
          g.beginPath(); g.moveTo(mx - px, my - py); g.lineTo(mx + px, my + py); g.stroke();
        }
      }

      // Flow animation on solved path
      if (solved && flowPath.length >= 2) {
        const totalSegs = flowPath.length - 1;
        const DASH = 14, GAP = 10;
        const period = DASH + GAP;

        for (let s = 0; s < totalSegs; s++) {
          const pa = flowPath[s], pb = flowPath[s + 1];
          const dx = pb.x - pa.x, dy = pb.y - pa.y;
          const len = Math.hypot(dx, dy);
          const ux = dx / len, uy = dy / len;

          // Moving dashes
          const offset = flowT * period * 2;
          let d = -offset % period;
          g.strokeStyle = '#FFFFFF';
          g.lineWidth = 2.5;
          g.lineCap = 'round';
          while (d < len) {
            const start = Math.max(0, d);
            const end = Math.min(len, d + DASH);
            if (end > start) {
              g.beginPath();
              g.moveTo(pa.x + ux * start, pa.y + uy * start);
              g.lineTo(pa.x + ux * end, pa.y + uy * end);
              g.stroke();
            }
            d += period;
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        const p = nodePos(n);
        const isSource = n.type === 'source';
        const isTarget = n.type === 'target';
        const color = isSource ? '#00FF88' : isTarget ? '#FF4444' : ACCENT;
        const pulse = (isSource || isTarget) ? (0.7 + 0.3 * Math.sin(Date.now() * 0.004)) : 1;

        // glow
        g.fillStyle = color.replace('#', 'rgba(').replace(')', '') + `${Math.round(pulse * 80)})`;
        // simpler:
        if (isSource) g.fillStyle = `rgba(0,255,136,${(0.15 + 0.1 * Math.sin(Date.now() * 0.004)).toFixed(2)})`;
        else if (isTarget) g.fillStyle = `rgba(255,68,68,${(0.15 + 0.1 * Math.sin(Date.now() * 0.004)).toFixed(2)})`;
        else g.fillStyle = 'rgba(0,229,255,0.1)';
        g.beginPath(); g.arc(p.x, p.y, 16 * pulse, 0, Math.PI * 2); g.fill();

        g.fillStyle = color;
        g.beginPath(); g.arc(p.x, p.y, 8, 0, Math.PI * 2); g.fill();

        g.fillStyle = BG;
        g.font = 'bold 9px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(isSource ? 'S' : isTarget ? 'T' : '', p.x, p.y);
      }

      // Solve pulse overlay
      if (solveAnim > 0) {
        g.fillStyle = `rgba(0,229,255,${(solveAnim * 0.12).toFixed(3)})`;
        g.fillRect(0, 0, W, H);
      }

      // HUD
      g.fillStyle = 'rgba(15,15,20,0.92)';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = ACCENT;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      g.fillStyle = ACCENT;
      g.font = 'bold 16px monospace';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('REWIRE', 16, 24);

      g.textAlign = 'right';
      g.fillStyle = solved ? '#00FF88' : '#888';
      g.fillText(`LV ${level+1}  TAPS ${tapCount}`, W - 50, 24);

      // Level indicators
      for (let i = 0; i < LEVELS.length; i++) {
        const x = W / 2 - (LEVELS.length - 1) * 10 + i * 20;
        g.fillStyle = i < level ? '#00FF88' : i === level ? ACCENT : 'rgba(255,255,255,0.2)';
        g.beginPath(); g.arc(x, 24, 5, 0, Math.PI * 2); g.fill();
      }

      // Solved / Won overlay
      if (solved && !won) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = '#00FF88';
        g.font = 'bold 28px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('CIRCUIT CLOSED', W/2, H/2 - 28);
        const onCount = wires.filter(w => w.on).length;
        const best = bestScores[level] || onCount;
        g.fillStyle = ACCENT;
        g.font = '18px monospace';
        g.fillText(`Wires: ${onCount}  Best: ${best}`, W/2, H/2 + 8);
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.font = '14px monospace';
        g.fillText(level < LEVELS.length - 1 ? 'TAP TO NEXT LEVEL' : 'TAP TO FINISH', W/2, H/2 + 40);
      }

      if (won) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 32px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('ALL WIRED UP!', W/2, H/2 - 30);
        g.fillStyle = '#00FF88';
        g.font = '16px monospace';
        g.fillText('TAP TO PLAY AGAIN', W/2, H/2 + 20);
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 20px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('HOW TO PLAY', W/2, H/2 - 100);
        g.fillStyle = '#ccc';
        g.font = '14px monospace';
        const lines = [
          'Tap wire segments to toggle ON/OFF.',
          'Connect SOURCE (green) to TARGET (red).',
          'A flowing path = circuit complete!',
          'Fewer active wires = better score.',
          '5 levels of increasing complexity.',
        ];
        lines.forEach((l, i) => g.fillText(l, W/2, H/2 - 50 + i * 28));
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = '13px monospace';
        g.fillText('TAP ANYWHERE TO CLOSE', W/2, H/2 + 110);
      }

      // IBTN — drawn LAST
      g.fillStyle = 'rgba(0,229,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ACCENT;
      g.font = 'bold 14px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y);
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
