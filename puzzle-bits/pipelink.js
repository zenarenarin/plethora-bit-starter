// Pipelink — Pipe Rotation Puzzle (Plethora Bit)
// Pipe openings bitmask: N=1, E=2, S=4, W=8.
// Rotation: each +1 CW rotates all openings CW.
//   elbow(0)=NE  (1)=ES  (2)=SW  (3)=WN
//   straight(0)=NS  (1)=EW
//   tee(0)=NES  (1)=ESW  (2)=SWN  (3)=WNE
//   cross: always NESW (rotationally invariant)
//   end(0)=N  (1)=E  (2)=S  (3)=W
//
// All puzzles use a "cross-grid" topology:
//   corners=elbow, edges=tee, interior=cross.
// This guarantees: single connected component, no boundary openings,
// all adjacent pairs match. Cross tiles are rotationally invariant so
// scrambleGrid() skips them — only frame cells (elbows, tees) get shuffled.

window.plethoraBit = {
  meta: {
    title: 'Pipelink',
    author: 'plethora',
    description: 'Rotate pipe tiles to connect the whole network.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const USABLE_H = H - SAFE;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#4CC9F0';
    const BG     = '#0f0f14';
    const N      = 6;

    const HS_KEY = 'bt_pipelink';
    let bestTime = ctx.storage.get(HS_KEY) || 0;

    // ── AUDIO ─────────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playRotate() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), ga = audioCtx.createGain();
      o.connect(ga); ga.connect(audioCtx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(480, audioCtx.currentTime);
      o.frequency.linearRampToValueAtTime(720, audioCtx.currentTime + 0.09);
      ga.gain.setValueAtTime(0.11, audioCtx.currentTime);
      ga.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.11);
      o.start(); o.stop(audioCtx.currentTime + 0.11);
    }
    function playLocked() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), ga = audioCtx.createGain();
      o.connect(ga); ga.connect(audioCtx.destination);
      o.type = 'square'; o.frequency.value = 110;
      ga.gain.setValueAtTime(0.08, audioCtx.currentTime);
      ga.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    }
    function playWin() {
      if (!audioCtx) return;
      [523, 659, 784, 988, 1047, 1319].forEach((f, i) => {
        const o = audioCtx.createOscillator(), ga = audioCtx.createGain();
        o.connect(ga); ga.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = f;
        ga.gain.setValueAtTime(0.18, audioCtx.currentTime + i*0.09);
        ga.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i*0.09 + 0.25);
        o.start(audioCtx.currentTime + i*0.09);
        o.stop(audioCtx.currentTime + i*0.09 + 0.25);
      });
    }

    // ── PIPE LOGIC ─────────────────────────────────────────────────────────────
    const N_BIT=1, E_BIT=2, S_BIT=4, W_BIT=8;
    const BASE_OPEN = {
      straight: N_BIT|S_BIT,
      elbow:    N_BIT|E_BIT,
      tee:      N_BIT|E_BIT|S_BIT,
      cross:    15,
      end:      N_BIT,
    };

    function rotateOpenings(open, rot) {
      let o = open;
      for (let i = 0; i < (rot & 3); i++) {
        o = ((o&1)?2:0)|((o&2)?4:0)|((o&4)?8:0)|((o&8)?1:0);
      }
      return o;
    }
    function getOpen(cell) { return rotateOpenings(BASE_OPEN[cell.type], cell.rot); }
    function C(type, rot, locked=false) { return { type, rot: rot & 3, locked }; }

    // ── PUZZLE DEFINITIONS ─────────────────────────────────────────────────────
    // All 5 puzzles use cross-grid topology (verified: single connected component,
    // no boundary openings). Solved rotation shown; scrambleGrid() randomises frame cells.
    //
    // Cross-grid frame rotations:
    //   corner (0,0)=elbow(1)=ES  (0,5)=elbow(2)=SW  (5,0)=elbow(0)=NE  (5,5)=elbow(3)=WN
    //   top edge    (0,c)=tee(1)=ESW
    //   bottom edge (5,c)=tee(3)=WNE
    //   left edge   (r,0)=tee(0)=NES
    //   right edge  (r,5)=tee(2)=SWN
    //   interior         =cross(0)

    const PUZZLES_DEF = [
      // P1 — no locks, all frame tiles shuffled
      { grid: [
        [C('elbow',1),      C('tee',1),      C('tee',1),      C('tee',1),      C('tee',1),      C('elbow',2)    ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('elbow',0),      C('tee',3),      C('tee',3),      C('tee',3),      C('tee',3),      C('elbow',3)    ],
      ]},

      // P2 — locked corners only
      { grid: [
        [C('elbow',1,true), C('tee',1),      C('tee',1),      C('tee',1),      C('tee',1),      C('elbow',2,true)],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('elbow',0,true), C('tee',3),      C('tee',3),      C('tee',3),      C('tee',3),      C('elbow',3,true)],
      ]},

      // P3 — locked corners + locked top/bottom edges (centre strip free)
      { grid: [
        [C('elbow',1,true), C('tee',1,true), C('tee',1,true), C('tee',1,true), C('tee',1,true), C('elbow',2,true)],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('elbow',0,true), C('tee',3,true), C('tee',3,true), C('tee',3,true), C('tee',3,true), C('elbow',3,true)],
      ]},

      // P4 — locked corners + locked row-1 and row-4 left/right edges
      { grid: [
        [C('elbow',1,true), C('tee',1,true), C('tee',1),      C('tee',1),      C('tee',1,true), C('elbow',2,true)],
        [C('tee',0,true),   C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2,true) ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0),        C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2)      ],
        [C('tee',0,true),   C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2,true) ],
        [C('elbow',0,true), C('tee',3,true), C('tee',3),      C('tee',3),      C('tee',3,true), C('elbow',3,true)],
      ]},

      // P5 — locked corners + all edges locked (only interior crosses remain, trivially solved)
      // Hardest: all frame tiles locked → puzzle is already solved on load, but scramble skips
      // crosses, so the frame tiles start in wrong positions and must all be found.
      // Actually: only frame tiles get scrambled, so let's lock just the entire frame.
      { grid: [
        [C('elbow',1,true), C('tee',1,true), C('tee',1,true), C('tee',1,true), C('tee',1,true), C('elbow',2,true)],
        [C('tee',0,true),   C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2,true) ],
        [C('tee',0,true),   C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2,true) ],
        [C('tee',0,true),   C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2,true) ],
        [C('tee',0,true),   C('cross',0),    C('cross',0),    C('cross',0),    C('cross',0),    C('tee',2,true) ],
        [C('elbow',0,true), C('tee',3,true), C('tee',3,true), C('tee',3,true), C('tee',3,true), C('elbow',3,true)],
      ]},
    ];

    // ── STATE ──────────────────────────────────────────────────────────────────
    function cloneGrid(gr) { return gr.map(row => row.map(c => ({...c}))); }

    function scrambleGrid(gr) {
      const g2 = cloneGrid(gr);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const cell = g2[r][c];
        if (cell.locked || cell.type === 'cross') continue;
        const sol = cell.rot;
        const opts = [0,1,2,3].filter(rv => {
          if (rv === sol) return false;
          if (cell.type === 'straight') return (rv & 1) !== (sol & 1);
          return true;
        });
        cell.rot = opts.length ? opts[Math.floor(Math.random() * opts.length)] : (sol + 1) & 3;
      }
      return g2;
    }

    const PLAY_GRIDS = PUZZLES_DEF.map(p => scrambleGrid(p.grid));

    let puzzleIdx    = 0;
    let grid         = cloneGrid(PLAY_GRIDS[puzzleIdx]);
    let solved       = false;
    let showInfo     = false;
    let timerMs      = 0;
    let timerRunning = false;
    let gameStarted  = false;
    let solveAnim    = 0;
    let pulseT       = 0;
    let rotAnim      = Array.from({length:N}, () => Array(N).fill(null));
    let touchCell    = null, longPressTriggered = false, longPressSeq = 0;
    let showSolution = false;

    const IBTN  = { x: W - 22, y: 8, r: 14 };
    const EYE_X = W - 22, EYE_CY = 62, EYE_R = 14;

    // ── LAYOUT ─────────────────────────────────────────────────────────────────
    const PAD     = 16;
    const HUD_H   = 56;
    const GRID_TOP= HUD_H + PAD;
    const AVAIL_H = USABLE_H - GRID_TOP - PAD;
    const AVAIL_W = W - PAD * 2;
    const CELL    = Math.floor(Math.min(AVAIL_W, AVAIL_H) / N);
    const GRID_W  = CELL * N;
    const GRID_H  = CELL * N;
    const OX      = Math.floor((W - GRID_W) / 2);
    const OY      = GRID_TOP + Math.floor((AVAIL_H - GRID_H) / 2);

    function cp(r, c) { return { x: OX + c*CELL + CELL/2, y: OY + r*CELL + CELL/2 }; }
    function pc(px, py) {
      const c = Math.floor((px - OX) / CELL), r = Math.floor((py - OY) / CELL);
      return (r >= 0 && r < N && c >= 0 && c < N) ? {r, c} : null;
    }

    // ── CONNECTIVITY CHECK ─────────────────────────────────────────────────────
    function checkConnectivity() {
      let mismatch = false;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const o = getOpen(grid[r][c]);
        if ((o & N_BIT) && r === 0)   mismatch = true;
        if ((o & S_BIT) && r === N-1) mismatch = true;
        if ((o & W_BIT) && c === 0)   mismatch = true;
        if ((o & E_BIT) && c === N-1) mismatch = true;
        for (const [dr,dc,m,tm] of [[-1,0,N_BIT,S_BIT],[1,0,S_BIT,N_BIT],[0,-1,W_BIT,E_BIT],[0,1,E_BIT,W_BIT]]) {
          const nr=r+dr, nc=c+dc;
          if (nr<0||nr>=N||nc<0||nc>=N) continue;
          if (!!(o & m) !== !!(getOpen(grid[nr][nc]) & tm)) mismatch = true;
        }
      }
      const visited = new Set(['0,0']), q = [[0,0]];
      while (q.length) {
        const [r,c] = q.shift();
        const o = getOpen(grid[r][c]);
        for (const [dr,dc,m] of [[-1,0,N_BIT],[1,0,S_BIT],[0,-1,W_BIT],[0,1,E_BIT]]) {
          const nr=r+dr, nc=c+dc;
          if (nr<0||nr>=N||nc<0||nc>=N||!(o&m)) continue;
          const k = `${nr},${nc}`;
          if (!visited.has(k)) { visited.add(k); q.push([nr,nc]); }
        }
      }
      return { connected: visited, allConnected: visited.size === N*N && !mismatch };
    }

    // ── ROTATION ───────────────────────────────────────────────────────────────
    function rotateCW(r, c) {
      if (grid[r][c].locked) { playLocked(); return; }
      if (rotAnim[r][c] && rotAnim[r][c].t < 0.75) return;
      const from = grid[r][c].rot;
      grid[r][c].rot = (from + 1) & 3;
      rotAnim[r][c] = { from, t: 0, dir: 1 };
      playRotate();
      if (checkConnectivity().allConnected && !solved) triggerSolve();
    }
    function rotateCCW(r, c) {
      if (grid[r][c].locked) { playLocked(); return; }
      if (rotAnim[r][c] && rotAnim[r][c].t < 0.75) return;
      const from = grid[r][c].rot;
      grid[r][c].rot = (from + 3) & 3;
      rotAnim[r][c] = { from, t: 0, dir: -1 };
      playRotate();
      if (checkConnectivity().allConnected && !solved) triggerSolve();
    }
    function triggerSolve() {
      ctx.timeout(() => {
        if (!checkConnectivity().allConnected || solved) return;
        solved = true; timerRunning = false; solveAnim = 0;
        playWin();
        const score = Math.floor(10000 / (timerMs/1000 + 1));
        ctx.platform.complete({ score, durationMs: timerMs });
        ctx.platform.setScore(score);
        if (bestTime === 0 || timerMs < bestTime) {
          bestTime = timerMs;
          ctx.storage.set(HS_KEY, bestTime);
        }
      }, 180);
    }

    // ── DRAW ───────────────────────────────────────────────────────────────────
    function roundRect(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x+r,y); g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
      g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
      g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y);
      g.closePath();
    }

    function drawInfoPanel() {
      g.fillStyle = 'rgba(0,0,0,0.88)';
      g.fillRect(0, 0, W, H);
      const cw = Math.floor(W * 0.82);
      const cx2 = Math.floor((W - cw) / 2);
      const ch = Math.min(Math.floor(USABLE_H * 0.72), 460);
      const cy2 = Math.floor((USABLE_H - ch) / 2);
      g.fillStyle = '#1a1a2e';
      g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
      g.fill();
      g.strokeStyle = ACCENT + '55'; g.lineWidth = 1.5;
      g.beginPath(); if (g.roundRect) g.roundRect(cx2, cy2, cw, ch, 16); else g.rect(cx2, cy2, cw, ch);
      g.stroke();

      const cx = W / 2;
      g.fillStyle = ACCENT;
      g.font = `bold 24px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Pipelink', cx, cy2 + 36);

      g.fillStyle = '#888';
      g.font = `13px system-ui, sans-serif`;
      g.fillText('Pipe Rotation Puzzle', cx, cy2 + 58);

      g.fillStyle = '#ccc';
      g.font = `14px system-ui, sans-serif`;
      g.textAlign = 'left';
      ['● Tap a tile to rotate it 90° clockwise',
       '● Hold to rotate counter-clockwise',
       '● All pipe openings must connect to neighbors',
       '● No dead ends — every opening must match',
       '● 🔒 Locked tiles cannot be rotated',
       '● Solve: the whole network is one connected flow',
      ].forEach((r, i) => g.fillText(r, cx2 + 20, cy2 + 94 + i * 28));

      g.font = 'bold 13px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.textAlign = 'center';
      g.fillText('TAP ANYWHERE TO CLOSE', cx, cy2 + ch - 20);
    }

    function drawHUD() {
      g.fillStyle=BG; g.fillRect(0,0,W,HUD_H);
      g.fillStyle='#fff'; g.font=`bold 22px monospace`; g.textAlign='center';
      g.fillText((timerMs/1000).toFixed(1)+'s',W/2,36);
      if (bestTime>0) {
        g.fillStyle='#444'; g.font=`11px system-ui,sans-serif`;
        g.fillText('best '+(bestTime/1000).toFixed(1)+'s',W/2,50);
      }
      g.fillStyle=ACCENT; g.font=`bold 13px system-ui,sans-serif`; g.textAlign='left';
      g.fillText(`#${puzzleIdx+1}/5`,PAD,36);
      if (solved) {
        g.fillStyle='#fff'; g.textAlign='right'; g.font=`13px system-ui,sans-serif`;
        g.fillText('tap to continue',W-PAD,36);
      }
    }

    function drawPipeShape(px, py, openings, color, lw, extraRot) {
      const half = CELL * 0.45;
      const pts = [];
      if (openings & N_BIT) pts.push([0,-half]);
      if (openings & E_BIT) pts.push([half,0]);
      if (openings & S_BIT) pts.push([0,half]);
      if (openings & W_BIT) pts.push([-half,0]);
      g.save();
      g.translate(px, py);
      if (extraRot) g.rotate(extraRot);
      g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
      if (pts.length === 1) {
        g.beginPath(); g.moveTo(0,0); g.lineTo(pts[0][0],pts[0][1]); g.stroke();
        g.beginPath(); g.arc(0,0,lw*0.65,0,Math.PI*2); g.fillStyle=color; g.fill();
      } else if (pts.length === 2) {
        g.beginPath(); g.moveTo(pts[0][0],pts[0][1]); g.lineTo(pts[1][0],pts[1][1]); g.stroke();
      } else {
        g.beginPath(); g.arc(0,0,lw*0.75,0,Math.PI*2); g.fillStyle=color; g.fill();
        for (const [ex,ey] of pts) { g.beginPath(); g.moveTo(0,0); g.lineTo(ex,ey); g.stroke(); }
      }
      g.restore();
    }

    function drawGrid() {
      const { connected } = checkConnectivity();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const cell = grid[r][c];
        const {x:px,y:py} = cp(r,c);
        const x = OX+c*CELL, y = OY+r*CELL;
        const isConn = connected.has(`${r},${c}`);

        g.fillStyle = cell.locked ? '#1c1c30' : '#15151f';
        roundRect(x+2,y+2,CELL-4,CELL-4,6); g.fill();
        g.strokeStyle = cell.locked ? '#343460' : '#222230'; g.lineWidth = 1;
        roundRect(x+2,y+2,CELL-4,CELL-4,6); g.stroke();

        const anim = rotAnim[r][c];
        let extraRot = 0;
        if (anim && anim.t < 1) {
          const ease = 1 - Math.pow(1 - anim.t, 3);
          extraRot = anim.dir * (1 - ease) * (-Math.PI/2);
        }

        let pipeColor;
        if (solved) {
          const wave = 0.6 + 0.4 * Math.sin(pulseT*2 - (r+c)*0.45);
          pipeColor = `rgba(76,201,240,${wave})`;
        } else if (isConn) {
          pipeColor = ACCENT;
        } else {
          pipeColor = '#2a4e5e';
        }

        if (solved && isConn) {
          g.shadowBlur = 8 + 4*Math.sin(pulseT*2-(r+c)*0.45);
          g.shadowColor = ACCENT;
        }
        drawPipeShape(px, py, getOpen(cell), pipeColor, Math.max(3, CELL*0.14), extraRot);
        g.shadowBlur = 0;

        if (cell.locked) {
          g.fillStyle = 'rgba(100,100,160,0.5)';
          g.font = `${Math.floor(CELL*0.2)}px system-ui,sans-serif`;
          g.textAlign = 'center'; g.textBaseline = 'top';
          g.fillText('🔒', px, y+4); g.textBaseline = 'alphabetic';
        }
      }
      g.strokeStyle = '#0f0f14'; g.lineWidth = 2;
      for (let i = 0; i <= N; i++) {
        g.beginPath(); g.moveTo(OX+i*CELL,OY); g.lineTo(OX+i*CELL,OY+GRID_H); g.stroke();
        g.beginPath(); g.moveTo(OX,OY+i*CELL); g.lineTo(OX+GRID_W,OY+i*CELL); g.stroke();
      }
    }

    function drawOverlay() {
      if (!solved) return;
      const a = Math.min(solveAnim*2, 1);
      g.fillStyle = `rgba(0,0,0,${a*0.72})`; g.fillRect(0,0,W,USABLE_H);
      const cy = USABLE_H/2;
      g.fillStyle = `rgba(76,201,240,${a})`; g.font = `bold 36px system-ui,sans-serif`;
      g.textAlign = 'center'; g.fillText('Connected!',W/2,cy-22);
      g.fillStyle = `rgba(255,255,255,${a*0.85})`; g.font = `18px system-ui,sans-serif`;
      g.fillText(`Time: ${(timerMs/1000).toFixed(1)}s`,W/2,cy+16);
      if (bestTime>0) {
        g.fillStyle=`rgba(76,201,240,${a*0.7})`; g.font=`14px system-ui,sans-serif`;
        g.fillText(`Best: ${(bestTime/1000).toFixed(1)}s`,W/2,cy+44);
      }
      g.fillStyle=`rgba(255,255,255,${a*0.45})`; g.font=`14px system-ui,sans-serif`;
      g.fillText('Tap for next puzzle',W/2,cy+76);
    }

    // ── INPUT ──────────────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;
      ensureAudio();

      if (Math.hypot(tx - IBTN.x, ty - (IBTN.y + IBTN.r)) < IBTN.r + 8) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      // See Solution button
      if (Math.hypot(tx - EYE_X, ty - EYE_CY) < EYE_R + 8) {
        showSolution = true;
        const solGrid = PUZZLES_DEF[puzzleIdx].grid;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (!grid[r][c].locked) {
            const fromRot = grid[r][c].rot;
            grid[r][c].rot = solGrid[r][c].rot;
            rotAnim[r][c] = { from: fromRot, t: 0, dir: 1 };
          }
        }
        return;
      }

      // If solution is visible, any tap outside the ? button starts a new puzzle
      if (showSolution) {
        puzzleIdx = (puzzleIdx+1) % PUZZLES_DEF.length;
        grid = cloneGrid(PLAY_GRIDS[puzzleIdx]);
        rotAnim = Array.from({length:N}, () => Array(N).fill(null));
        solved=false; solveAnim=0; timerMs=0; timerRunning=true; gameStarted=false;
        showSolution=false;
        return;
      }

      if (solved) {
        puzzleIdx = (puzzleIdx+1) % PUZZLES_DEF.length;
        grid = cloneGrid(PLAY_GRIDS[puzzleIdx]);
        rotAnim = Array.from({length:N}, () => Array(N).fill(null));
        solved=false; solveAnim=0; timerMs=0; timerRunning=true; gameStarted=false;
        showSolution=false;
        return;
      }
      const cell = pc(tx, ty);
      if (!cell) return;
      touchCell=cell; longPressTriggered=false; longPressSeq++;
      if (!gameStarted) { gameStarted=true; timerRunning=true; ctx.platform.start(); }
      const mySeq = longPressSeq;
      ctx.timeout(() => {
        if (mySeq !== longPressSeq || !touchCell) return;
        longPressTriggered = true;
        rotateCCW(touchCell.r, touchCell.c);
        ctx.platform.haptic('light');
      }, 350);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      longPressSeq++;
      if (touchCell && !longPressTriggered) {
        rotateCW(touchCell.r, touchCell.c);
        ctx.platform.haptic('light');
      }
      touchCell=null; longPressTriggered=false;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const cell = pc(t.clientX, t.clientY);
      if (cell && touchCell && (cell.r !== touchCell.r || cell.c !== touchCell.c)) {
        longPressSeq++; touchCell=null;
      }
    }, { passive: false });

    // ── GAME LOOP ──────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      if (timerRunning && !solved) timerMs += dt;
      pulseT += dt/1000;
      solveAnim = Math.min(solveAnim + dt/550, 1);
      for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
        if (rotAnim[r][c]) {
          rotAnim[r][c].t = Math.min(rotAnim[r][c].t + dt/150, 1);
          if (rotAnim[r][c].t >= 1) rotAnim[r][c] = null;
        }
      }
      g.fillStyle=BG; g.fillRect(0,0,W,H);
      drawHUD(); drawGrid(); drawOverlay();

      // Info button
      g.save();
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.arc(IBTN.x, IBTN.y + IBTN.r, IBTN.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = showInfo ? '#000' : 'rgba(255,255,255,0.7)';
      g.font = 'bold 14px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y + IBTN.r);
      g.restore();

      // See Solution button
      g.save();
      g.globalAlpha = showSolution ? 1 : 0.5;
      g.fillStyle = showSolution ? ACCENT : '#555';
      g.beginPath(); g.arc(EYE_X, EYE_CY, EYE_R, 0, Math.PI*2); g.fill();
      g.fillStyle = '#000';
      g.font = `bold ${EYE_R}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', EYE_X, EYE_CY);
      g.restore();

      if (showSolution) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, USABLE_H - 48, W, 48);
        g.fillStyle = ACCENT;
        g.font = 'bold 15px -apple-system, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TAP ANYWHERE FOR NEW PUZZLE', W / 2, USABLE_H - 24);
      }

      if (showInfo) drawInfoPanel();
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
