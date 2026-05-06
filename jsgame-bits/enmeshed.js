// ENMESHED — Graph Untangling Puzzle (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Enmeshed',
    author: 'plethora',
    description: 'Drag nodes to untangle the graph. Zero crossings = solved!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SAFE = ctx.safeArea.bottom;
    const ACCENT = '#40C4FF';
    const BG = '#0f0f14';
    const HUD_H = 48;

    const IBTN = { x: W - 22, y: 8, r: 14 };
    let showInfo = false;

    // Web Audio — lazy init
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    const voices = [];
    function playTone(freq, type, dur, vol = 0.25) {
      if (!audioCtx) return;
      if (voices.length >= 8) { try { voices.shift().stop(); } catch(e){} }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
    }
    function playSolve() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        ctx.timeout(() => playTone(f, 'sine', 0.25, 0.35), i * 100);
      });
    }
    function playDrag() { playTone(440, 'sine', 0.05, 0.1); }
    function playSnap() { playTone(880, 'sine', 0.12, 0.2); }

    // Best time storage
    let bestTime = ctx.storage.get('hs_enmeshed') || null;

    // 5 hand-crafted graphs (nodes + edges)
    const GRAPHS = [
      // Level 1 — 6 nodes: K4 with 2 extra
      {
        nodes: 6,
        edges: [[0,1],[0,2],[0,3],[1,2],[1,4],[2,5],[3,4],[3,5],[4,5]],
      },
      // Level 2 — 8 nodes: Petersen-ish
      {
        nodes: 8,
        edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[0,4],[1,5],[2,6],[3,7]],
      },
      // Level 3 — 10 nodes
      {
        nodes: 10,
        edges: [[0,1],[1,2],[2,3],[3,4],[4,0],[0,5],[1,6],[2,7],[3,8],[4,9],[5,7],[6,8],[7,9],[8,5],[9,6]],
      },
      // Level 4 — 12 nodes
      {
        nodes: 12,
        edges: [[0,1],[1,2],[2,3],[3,0],[0,4],[1,5],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,10],[9,11],[4,6],[5,7],[8,9],[10,11],[0,6],[1,7]],
      },
      // Level 5 — 15 nodes
      {
        nodes: 15,
        edges: [[0,1],[1,2],[2,3],[3,4],[4,0],[0,5],[1,6],[2,7],[3,8],[4,9],[5,10],[6,11],[7,12],[8,13],[9,14],[10,12],[11,13],[12,14],[13,10],[14,11],[0,7],[1,8],[2,9],[5,12],[6,13]],
      },
    ];

    let level = 0;
    let nodes = [];
    let edges = [];
    let dragIdx = -1;
    let dragOffX = 0, dragOffY = 0;
    let crossings = 0;
    let solved = false;
    let solveAnim = 0; // 0..1
    let started = false;
    let startTime = 0;
    let elapsedTime = 0;
    let timerRunning = false;

    // Spring pull state
    const springVel = [];

    function buildLevel(lvl) {
      const gd = GRAPHS[lvl];
      const n = gd.nodes;
      const cx = W / 2;
      const cy = (H + HUD_H) / 2;
      const r = Math.min(W, H - HUD_H - SAFE) * 0.35;
      nodes = [];
      for (let i = 0; i < n; i++) {
        // Random scatter with slight radial bias
        const angle = (i / n) * Math.PI * 2 + Math.random() * 0.8;
        const dist = r * (0.4 + Math.random() * 0.8);
        nodes.push({
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: 0, vy: 0,
        });
      }
      edges = gd.edges.map(([a, b]) => ({ a, b, crossing: false }));
      solved = false;
      solveAnim = 0;
      elapsedTime = 0;
      timerRunning = false;
      computeCrossings();
    }

    function seg2seg(ax, ay, bx, by, cx2, cy2, dx, dy) {
      // Returns true if segments AB and CD properly intersect
      const d1x = bx - ax, d1y = by - ay;
      const d2x = dx - cx2, d2y = dy - cy2;
      const cross = d1x * d2y - d1y * d2x;
      if (Math.abs(cross) < 1e-10) return false;
      const t = ((cx2 - ax) * d2y - (cy2 - ay) * d2x) / cross;
      const u = ((cx2 - ax) * d1y - (cy2 - ay) * d1x) / cross;
      return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
    }

    function computeCrossings() {
      // Reset
      edges.forEach(e => { e.crossing = false; });
      let count = 0;
      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          const ei = edges[i], ej = edges[j];
          // Skip shared endpoints
          if (ei.a === ej.a || ei.a === ej.b || ei.b === ej.a || ei.b === ej.b) continue;
          const ni_a = nodes[ei.a], ni_b = nodes[ei.b];
          const nj_a = nodes[ej.a], nj_b = nodes[ej.b];
          if (seg2seg(ni_a.x, ni_a.y, ni_b.x, ni_b.y, nj_a.x, nj_a.y, nj_b.x, nj_b.y)) {
            ei.crossing = true;
            ej.crossing = true;
            count++;
          }
        }
      }
      crossings = count;
      return count;
    }

    function checkSolve() {
      if (crossings === 0 && !solved) {
        solved = true;
        solveAnim = 0;
        timerRunning = false;
        const t = elapsedTime / 1000;
        if (bestTime === null || t < bestTime) {
          bestTime = t;
          ctx.storage.set('hs_enmeshed', bestTime);
        }
        playSolve();
        ctx.platform.complete({ score: Math.round(10000 / Math.max(1, t)) });
        ctx.platform.haptic('heavy');
      }
    }

    buildLevel(0);

    // Touch handling
    const NODE_R = Math.max(18, Math.min(26, W * 0.045));

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // Info button
      const di = Math.hypot(tx - IBTN.x, ty - IBTN.y);
      if (di <= IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      // Dismiss info
      if (showInfo) { showInfo = false; return; }

      if (solved) {
        // Advance to next level or restart
        level = (level + 1) % GRAPHS.length;
        buildLevel(level);
        return;
      }

      // Find closest node
      let bestDist = NODE_R * 2.5;
      let bestI = -1;
      for (let i = 0; i < nodes.length; i++) {
        const d = Math.hypot(tx - nodes[i].x, ty - nodes[i].y);
        if (d < bestDist) { bestDist = d; bestI = i; }
      }
      if (bestI !== -1) {
        dragIdx = bestI;
        dragOffX = tx - nodes[bestI].x;
        dragOffY = ty - nodes[bestI].y;
        if (!started) {
          started = true;
          ctx.platform.start();
        }
        if (!timerRunning && !solved) {
          timerRunning = true;
          startTime = performance.now() - elapsedTime;
        }
        playDrag();
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (dragIdx === -1) return;
      const t = e.changedTouches[0];
      nodes[dragIdx].x = Math.max(NODE_R, Math.min(W - NODE_R, t.clientX - dragOffX));
      nodes[dragIdx].y = Math.max(HUD_H + NODE_R, Math.min(H - SAFE - NODE_R, t.clientY - dragOffY));
      computeCrossings();
      checkSolve();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (dragIdx !== -1) {
        playSnap();
        ctx.platform.interact({ type: 'drag' });
      }
      dragIdx = -1;
    }, { passive: false });

    ctx.raf((dt) => {
      if (timerRunning) {
        elapsedTime = performance.now() - startTime;
      }
      if (solved) solveAnim = Math.min(1, solveAnim + dt / 800);

      // Spring: dragged node slightly pulls connected nodes
      if (dragIdx !== -1) {
        const SPRING = 0.04;
        for (const edge of edges) {
          let pulled = -1;
          if (edge.a === dragIdx) pulled = edge.b;
          else if (edge.b === dragIdx) pulled = edge.a;
          if (pulled === -1) continue;
          const dx = nodes[dragIdx].x - nodes[pulled].x;
          const dy = nodes[dragIdx].y - nodes[pulled].y;
          const dist = Math.hypot(dx, dy);
          const target = Math.min(dist, 80);
          const force = (dist - target) * SPRING * (dt / 16);
          nodes[pulled].x += (dx / dist) * force * 0.15;
          nodes[pulled].y += (dy / dist) * force * 0.15;
          // Clamp
          nodes[pulled].x = Math.max(NODE_R, Math.min(W - NODE_R, nodes[pulled].x));
          nodes[pulled].y = Math.max(HUD_H + NODE_R, Math.min(H - SAFE - NODE_R, nodes[pulled].y));
        }
      }

      // BG
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // HUD bar
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, W, HUD_H);

      // Draw edges
      for (const edge of edges) {
        const na = nodes[edge.a], nb = nodes[edge.b];
        g.beginPath();
        g.moveTo(na.x, na.y);
        g.lineTo(nb.x, nb.y);
        if (edge.crossing) {
          g.strokeStyle = solved ? ACCENT : '#FF4444';
          g.lineWidth = 2.5;
          g.globalAlpha = solved ? (0.5 + 0.5 * Math.sin(solveAnim * Math.PI * 4)) : 1;
        } else {
          g.strokeStyle = 'rgba(200,200,220,0.25)';
          g.lineWidth = 1.5;
          g.globalAlpha = 1;
        }
        g.stroke();
      }
      g.globalAlpha = 1;

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const isDragging = i === dragIdx;
        const glowColor = solved ? ACCENT : (isDragging ? ACCENT : ACCENT);
        // Glow
        const grd = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, NODE_R * 2.2);
        grd.addColorStop(0, solved ? 'rgba(64,196,255,0.4)' : (isDragging ? 'rgba(64,196,255,0.35)' : 'rgba(64,196,255,0.12)'));
        grd.addColorStop(1, 'rgba(64,196,255,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(n.x, n.y, NODE_R * 2.2, 0, Math.PI * 2);
        g.fill();

        // Node circle
        g.beginPath();
        g.arc(n.x, n.y, NODE_R, 0, Math.PI * 2);
        g.fillStyle = isDragging ? ACCENT : (solved ? ACCENT : '#1a2840');
        g.fill();
        g.strokeStyle = glowColor;
        g.lineWidth = isDragging ? 3 : 2;
        g.stroke();

        // Inner dot
        g.beginPath();
        g.arc(n.x, n.y, NODE_R * 0.3, 0, Math.PI * 2);
        g.fillStyle = isDragging ? '#fff' : ACCENT;
        g.fill();
      }

      // Solve animation burst
      if (solved && solveAnim < 1) {
        const pulse = Math.sin(solveAnim * Math.PI);
        g.strokeStyle = ACCENT;
        g.lineWidth = 3 * pulse;
        g.globalAlpha = pulse * 0.6;
        g.beginPath();
        g.arc(W / 2, (H + HUD_H) / 2, W * 0.4 * solveAnim, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }

      // Overlays
      if (solved) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = ACCENT;
        g.font = 'bold 36px system-ui';
        g.textAlign = 'center';
        g.fillText('UNTANGLED!', W / 2, H / 2 - 30);
        const t = (elapsedTime / 1000).toFixed(1);
        g.fillStyle = '#fff';
        g.font = '20px system-ui';
        g.fillText(`Time: ${t}s`, W / 2, H / 2 + 10);
        if (bestTime !== null) {
          g.fillStyle = 'rgba(64,196,255,0.7)';
          g.font = '16px system-ui';
          g.fillText(`Best: ${bestTime.toFixed(1)}s`, W / 2, H / 2 + 38);
        }
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.font = '15px system-ui';
        g.fillText(level < GRAPHS.length - 1 ? 'TAP FOR NEXT PUZZLE' : 'TAP TO REPLAY', W / 2, H / 2 + 72);
        g.textAlign = 'left';
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.82)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 22px system-ui';
        g.textAlign = 'center';
        g.fillText('HOW TO PLAY', W / 2, H / 2 - 100);
        g.fillStyle = '#ccc';
        g.font = '16px system-ui';
        const lines = [
          'Drag nodes to move them.',
          'Red edges are CROSSING.',
          'Rearrange until NO edges cross.',
          'Zero crossings = SOLVED!',
          '',
          '5 puzzles, increasing size.',
          `Best time: ${bestTime !== null ? bestTime.toFixed(1) + 's' : '—'}`,
        ];
        lines.forEach((ln, i) => g.fillText(ln, W / 2, H / 2 - 50 + i * 28));
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.font = '14px system-ui';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, H / 2 + 150);
        g.textAlign = 'left';
      }

      // HUD text
      g.font = 'bold 18px system-ui';
      g.textAlign = 'left';
      g.fillStyle = ACCENT;
      g.fillText('Enmeshed', 16, 30);
      g.textAlign = 'right';
      g.fillStyle = crossings === 0 ? ACCENT : '#FF4444';
      g.fillText(crossings === 0 ? '✓ CLEAR' : `${crossings} cross`, W - 50, 30);
      g.textAlign = 'left';

      // Timer
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.font = '13px system-ui';
      g.textAlign = 'center';
      const secs = (elapsedTime / 1000).toFixed(1);
      g.fillText(timerRunning || solved ? secs + 's' : '', W / 2, 30);
      g.textAlign = 'left';

      // Level indicator
      g.fillStyle = 'rgba(64,196,255,0.5)';
      g.font = '12px system-ui';
      g.fillText(`LVL ${level + 1}/5`, 16, H - SAFE - 8);

      // Info button (drawn LAST)
      g.beginPath();
      g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2);
      g.fillStyle = 'rgba(64,196,255,0.18)';
      g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = ACCENT;
      g.font = 'bold 15px system-ui';
      g.textAlign = 'center';
      g.fillText('i', IBTN.x, IBTN.y + 5);
      g.textAlign = 'left';
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
