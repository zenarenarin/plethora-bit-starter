// MS. PAC-MAN — Alternate maze, faster ghosts, fruit bonus (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Ms. Pac-Man',
    author: 'plethora',
    description: 'Faster ghosts, new maze, bonus fruits. Hold and drag to steer.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SAFE = ctx.safeArea.bottom;

    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type = 'square', vol = 0.2) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playDot() { playTone(440, 0.04, 'square', 0.1); }
    function playPellet() { playTone(880, 0.15, 'sine', 0.3); }
    function playGhostEat() { playTone(600, 0.12, 'sine', 0.25); }
    function playFruit() { playTone(1200, 0.12, 'sine', 0.25); }
    function playDie() { [600, 500, 400, 300, 200].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'sawtooth', 0.3), i * 80)); }
    function playWin() { [400, 500, 600, 700, 800].forEach((f, i) => setTimeout(() => playTone(f, 0.12, 'sine', 0.25), i * 80)); }
    function playGameOver() { [300, 240, 180].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.3), i * 120)); }

    // Ms. Pac-Man maze — different from regular Pac-Man
    const MAP = [
      '#####################',
      '#o.......#.#.......o#',
      '#.###.##...#.##.###.#',
      '#.#...#..###..#...#.#',
      '#.#.#.#.........#.#.#',
      '#...#.....#.....#...#',
      '###.#.###.#.###.#.###',
      '    #.#...#...#.#    ',
      '#####.##.---.##.#####',
      '.....#.# GGGG #.#.....',
      '#####.##-----##.#####',
      '    #.#.......#.#    ',
      '###.#.#######.#.#.###',
      '#.........P.........#',
      '#.#.##.#######.##.#.#',
      '#o..#...........#..o#',
      '##.#.#.#######.#.#.##',
      '#....##.........##..#',
      '#.##.##.##.##.##.##.#',
      '#...................#',
      '#####################',
    ];

    const MROWS = MAP.length, MCOLS = MAP[0].length;

    const DPAD_H = 160;
    const DPAD_Y = H - SAFE - DPAD_H;
    const tileW = Math.floor(W / MCOLS);
    const tileH = Math.floor((DPAD_Y - 40) / MROWS);
    const TILE = Math.min(tileW, tileH);
    const OX = Math.floor((W - TILE * MCOLS) / 2);
    const OY = 40;

    let dpadActive = -1;
    const PCX = W / 2, PCY = DPAD_Y + DPAD_H / 2;

    function dpadHit(tx, ty) {
      if (ty < DPAD_Y) return -1;
      const dx = tx - PCX, dy = ty - PCY;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 1) : (dy < 0 ? 2 : 3);
    }

    let walls, dots, pellets, pac, ghosts, score, lives, powerT, running, win, particles, tick, fruit, started;

    const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1]]; // R, L, U, D

    function canGo(x, y) {
      if (y < 0 || y >= MROWS) return false;
      if (x < 0) x += MCOLS;
      if (x >= MCOLS) x -= MCOLS;
      const c = MAP[y][x];
      return c !== '#' && c !== '-';
    }

    function reset() {
      walls = []; dots = []; pellets = [];
      for (let y = 0; y < MROWS; y++) {
        walls[y] = []; dots[y] = []; pellets[y] = [];
        for (let x = 0; x < MCOLS; x++) {
          const c = MAP[y][x];
          walls[y][x] = (c === '#');
          dots[y][x] = (c === '.' || c === ' ' || c === 'G' || c === 'P') ? false : (c === '.');
          pellets[y][x] = (c === 'o');
        }
        // re-parse for dots carefully
        for (let x = 0; x < MCOLS; x++) {
          const c = MAP[y][x];
          dots[y][x] = (c === '.');
          pellets[y][x] = (c === 'o');
        }
      }

      // Ms. Pac-Man starts at col 10, row 13
      pac = { x: 10, y: 13, px: 10, py: 13, dir: 0, next: 0, t: 0, dead: false };

      ghosts = [
        { x: 9, y: 9, px: 9, py: 9, color: '#FF0000', t: 0, dx: 1, dy: 0, scared: 0 },
        { x: 10, y: 9, px: 10, py: 9, color: '#FFB8FF', t: 0, dx: -1, dy: 0, scared: 0 },
        { x: 11, y: 9, px: 11, py: 9, color: '#00FFFF', t: 0, dx: 0, dy: -1, scared: 0 },
        { x: 10, y: 8, px: 10, py: 8, color: '#FF8844', t: 0, dx: 0, dy: 1, scared: 0 },
      ];

      score = 0; lives = 3; powerT = 0; running = true; win = false;
      particles = []; tick = 0; fruit = null;
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); return; }
      const t = e.changedTouches[0];
      const d = dpadHit(t.clientX, t.clientY);
      if (d >= 0) { pac.next = d; dpadActive = d; ctx.platform.haptic('light'); }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const d = dpadHit(t.clientX, t.clientY);
      if (d >= 0 && d !== dpadActive) { pac.next = d; dpadActive = d; ctx.platform.haptic('light'); }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      dpadActive = -1;
    }, { passive: false });

    reset();

    function addParticles(x, y, c, n = 10) {
      for (let i = 0; i < n; i++) {
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 120,
          vy: (Math.random() - 0.5) * 120,
          c, life: 0.5
        });
      }
    }

    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      if (running && started) {
        if (powerT > 0) powerT -= dt;

        // Particles
        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec;
          p.vy += 100 * sec;
          p.life -= sec;
          return p.life > 0;
        });

        // Ms. Pac-Man movement — slightly faster than standard (t >= 4 instead of 5)
        pac.t++;
        if (pac.t >= 10) {
          pac.t = 0;
          const [nx, ny] = DIRS[pac.next];
          if (canGo(pac.x + nx, pac.y + ny)) pac.dir = pac.next;
          const [dx, dy] = DIRS[pac.dir];
          if (canGo(pac.x + dx, pac.y + dy)) {
            pac.x += dx; pac.y += dy;
            if (pac.x < 0) pac.x = MCOLS - 1;
            if (pac.x >= MCOLS) pac.x = 0;

            if (dots[pac.y] && dots[pac.y][pac.x]) {
              dots[pac.y][pac.x] = false;
              score += 10;
              ctx.platform.setScore(score);
              playDot();
            }
            if (pellets[pac.y] && pellets[pac.y][pac.x]) {
              pellets[pac.y][pac.x] = false;
              score += 50;
              powerT = 7000; // Ms. Pac-Man power lasts slightly less
              ghosts.forEach(gh => gh.scared = 200);
              addParticles(OX + pac.x * TILE + TILE / 2, OY + pac.y * TILE + TILE / 2, '#FF66CC', 16);
              ctx.platform.setScore(score);
              playPellet();
            }
            if (fruit && pac.x === fruit.x && pac.y === fruit.y) {
              score += fruit.value;
              addParticles(OX + pac.x * TILE + TILE / 2, OY + pac.y * TILE + TILE / 2, '#FF0000', 20);
              ctx.platform.setScore(score);
              playFruit();
              fruit = null;
            }

            // Check win
            let anyLeft = false;
            for (let y = 0; y < MROWS && !anyLeft; y++)
              for (let x = 0; x < MCOLS && !anyLeft; x++)
                if ((dots[y] && dots[y][x]) || (pellets[y] && pellets[y][x])) anyLeft = true;
            if (!anyLeft) { win = true; running = false; ctx.platform.complete({ score }); playWin(); }
          }
        }

        pac.px += (pac.x - pac.px) * 0.35;
        pac.py += (pac.y - pac.py) * 0.35;

        // Spawn fruit occasionally
        if (!fruit && Math.random() < 0.003) {
          const fruits = [
            { value: 100, color: '#FF0000', shape: 'cherry' },
            { value: 200, color: '#FF6600', shape: 'orange' },
            { value: 300, color: '#FF00FF', shape: 'pretzel' },
          ];
          for (let tries = 0; tries < 20; tries++) {
            const fx = (Math.random() * MCOLS) | 0;
            const fy = (Math.random() * MROWS) | 0;
            if (MAP[fy] && !walls[fy][fx] && !dots[fy][fx]) {
              const pick = fruits[(Math.random() * fruits.length) | 0];
              fruit = { x: fx, y: fy, ...pick, life: 8000 };
              break;
            }
          }
        }
        if (fruit) {
          fruit.life -= dt;
          if (fruit.life <= 0) fruit = null;
        }

        // Ghosts — faster than standard Pac-Man (t >= 6 instead of 8)
        ghosts.forEach(gh => {
          gh.t++;
          if (gh.scared > 0) gh.scared--;
          if (gh.t >= 14) {
            gh.t = 0;
            const opts = DIRS.filter(([dx, dy]) =>
              canGo(gh.x + dx, gh.y + dy) && !(dx === -gh.dx && dy === -gh.dy)
            );
            const choices = opts.length ? opts : DIRS.filter(([dx, dy]) => canGo(gh.x + dx, gh.y + dy));
            if (choices.length) {
              let best = choices[0], bestScore = Infinity;
              choices.forEach(c => {
                const d = Math.hypot(gh.x + c[0] - pac.x, gh.y + c[1] - pac.y);
                const s = gh.scared > 0 ? -d : d;
                if (s < bestScore) { bestScore = s; best = c; }
              });
              // 25% random to make them less deterministic
              if (Math.random() < 0.25) best = choices[(Math.random() * choices.length) | 0];
              gh.dx = best[0]; gh.dy = best[1];
              gh.x += gh.dx; gh.y += gh.dy;
              if (gh.x < 0) gh.x = MCOLS - 1;
              if (gh.x >= MCOLS) gh.x = 0;
            }
          }
          gh.px += (gh.x - gh.px) * 0.35;
          gh.py += (gh.y - gh.py) * 0.35;

          // Collision with Ms. Pac-Man
          if (Math.abs(gh.px - pac.px) < 0.5 && Math.abs(gh.py - pac.py) < 0.5) {
            if (gh.scared > 0) {
              score += 200;
              ctx.platform.setScore(score);
              addParticles(OX + gh.px * TILE + TILE / 2, OY + gh.py * TILE + TILE / 2, gh.color, 20);
              gh.x = 10; gh.y = 9; gh.scared = 0;
              playGhostEat();
            } else {
              lives--;
              addParticles(OX + pac.px * TILE + TILE / 2, OY + pac.py * TILE + TILE / 2, '#FFFF00', 30);
              ctx.platform.haptic('heavy');
              pac.x = 10; pac.y = 13; pac.px = 10; pac.py = 13;
              playDie();
              if (lives <= 0) {
                running = false;
                ctx.platform.fail({ reason: 'caught by ghost' });
                playGameOver();
              }
            }
          }
        });
      }

      // Draw
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

      // Grid tint
      g.strokeStyle = 'rgba(255,0,150,0.06)'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

      // Maze
      for (let y = 0; y < MROWS; y++) {
        for (let x = 0; x < MCOLS; x++) {
          if (!walls[y] || walls[y][x] === undefined) continue;
          if (walls[y][x]) {
            g.fillStyle = '#FF00AA';
            g.fillRect(OX + x * TILE, OY + y * TILE, TILE, TILE);
            g.fillStyle = '#AA0066';
            g.fillRect(OX + x * TILE + 1, OY + y * TILE + 1, TILE - 2, TILE - 2);
            g.fillStyle = '#000';
            g.fillRect(OX + x * TILE + 3, OY + y * TILE + 3, TILE - 6, TILE - 6);
          } else if (dots[y] && dots[y][x]) {
            g.fillStyle = '#FFCC99';
            g.fillRect(OX + x * TILE + TILE / 2 - 1, OY + y * TILE + TILE / 2 - 1, 2, 2);
          } else if (pellets[y] && pellets[y][x]) {
            const s = 2 + Math.sin(tick * 0.2) * 1.5;
            g.fillStyle = '#FFFF00';
            g.beginPath(); g.arc(OX + x * TILE + TILE / 2, OY + y * TILE + TILE / 2, s + 2, 0, Math.PI * 2); g.fill();
          }
        }
      }

      // Fruit
      if (fruit) {
        const fx = OX + fruit.x * TILE + TILE / 2;
        const fy = OY + fruit.y * TILE + TILE / 2;
        g.fillStyle = fruit.color;
        g.beginPath(); g.arc(fx, fy, TILE * 0.35, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#008800';
        g.fillRect(fx - 1, fy - TILE * 0.5, 2, 4);
      }

      // Ghosts
      ghosts.forEach(gh => {
        const cx = OX + gh.px * TILE + TILE / 2;
        const cy = OY + gh.py * TILE + TILE / 2;
        const r = TILE * 0.45;
        const col = gh.scared > 0 ? (Math.floor(tick / 4) % 2 ? '#FFF' : '#0000FF') : gh.color;
        g.fillStyle = col;
        g.beginPath();
        g.arc(cx, cy - 1, r, Math.PI, 0);
        g.lineTo(cx + r, cy + r);
        const n = 4, w = (2 * r) / n;
        for (let i = 0; i < n; i++) {
          g.lineTo(cx + r - w * (i + 0.5), cy + r - (i % 2 ? 4 : 0));
          g.lineTo(cx + r - w * (i + 1), cy + r);
        }
        g.closePath(); g.fill();
        g.fillStyle = '#FFF';
        g.fillRect(cx - r * 0.55, cy - r * 0.3, r * 0.4, r * 0.5);
        g.fillRect(cx + r * 0.15, cy - r * 0.3, r * 0.4, r * 0.5);
        g.fillStyle = '#0033FF';
        g.fillRect(cx - r * 0.45, cy - r * 0.15, r * 0.18, r * 0.22);
        g.fillRect(cx + r * 0.25, cy - r * 0.15, r * 0.18, r * 0.22);
      });

      // Ms. Pac-Man
      {
        const cx = OX + pac.px * TILE + TILE / 2;
        const cy = OY + pac.py * TILE + TILE / 2;
        const r = TILE * 0.45;
        const mouthOpen = Math.abs(Math.sin(tick * 0.3)) * 0.5 + 0.05;
        const dirRot = [0, Math.PI, -Math.PI / 2, Math.PI / 2][pac.dir] || 0;
        g.save();
        g.translate(cx, cy);
        g.rotate(dirRot);
        g.fillStyle = '#FFFF00';
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, r, mouthOpen, Math.PI * 2 - mouthOpen);
        g.closePath();
        g.fill();
        g.restore();

        // Bow (Ms. Pac-Man signature)
        g.fillStyle = '#FF0066';
        // left wing
        g.beginPath();
        g.moveTo(cx - r * 0.15, cy - r * 0.85);
        g.lineTo(cx - r * 0.65, cy - r * 1.35);
        g.lineTo(cx - r * 0.4, cy - r * 0.65);
        g.closePath(); g.fill();
        // right wing
        g.beginPath();
        g.moveTo(cx + r * 0.15, cy - r * 0.85);
        g.lineTo(cx + r * 0.65, cy - r * 1.35);
        g.lineTo(cx + r * 0.4, cy - r * 0.65);
        g.closePath(); g.fill();
        // center knot
        g.fillStyle = '#FF0066';
        g.beginPath(); g.arc(cx, cy - r * 0.8, r * 0.12, 0, Math.PI * 2); g.fill();
      }

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // Scanlines
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // HUD
      g.fillStyle = '#FF66CC'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'right'; g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      // D-pad — 4 triangles from center
      if (started && running) {
        g.save();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const tl = { x: 0, y: DPAD_Y }, tr = { x: W, y: DPAD_Y };
        const bl = { x: 0, y: H - SAFE }, br = { x: W, y: H - SAFE };
        const cc = { x: PCX, y: PCY };
        const triangles = [
          { pts: [cc, tl, tr], dir: 2, label: '▲', lx: PCX,      ly: DPAD_Y + DPAD_H * 0.28 },
          { pts: [cc, bl, br], dir: 3, label: '▼', lx: PCX,      ly: DPAD_Y + DPAD_H * 0.72 },
          { pts: [cc, tl, bl], dir: 1, label: '◀', lx: W * 0.22, ly: PCY },
          { pts: [cc, tr, br], dir: 0, label: '▶', lx: W * 0.78, ly: PCY },
        ];
        triangles.forEach(t => {
          const lit = t.dir === dpadActive;
          g.beginPath();
          g.moveTo(t.pts[0].x, t.pts[0].y);
          g.lineTo(t.pts[1].x, t.pts[1].y);
          g.lineTo(t.pts[2].x, t.pts[2].y);
          g.closePath();
          g.fillStyle = lit ? 'rgba(255,100,200,0.25)' : 'rgba(255,100,200,0.07)';
          g.fill();
          g.strokeStyle = 'rgba(255,100,200,0.15)';
          g.lineWidth = 1;
          g.stroke();
          g.fillStyle = lit ? '#FF66CC' : 'rgba(255,150,210,0.4)';
          g.font = 'bold 26px sans-serif';
          g.fillText(t.label, t.lx, t.ly);
        });
        g.restore();
      }

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.88)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF66CC'; g.font = 'bold 26px "Courier New"'; g.textAlign = 'center';
        g.fillText('MS. PAC-MAN', W / 2, H / 2 - 40);
        g.fillStyle = '#FFF'; g.font = '15px "Courier New"';
        g.fillText('TAP D-PAD to steer', W / 2, H / 2 + 5);
        g.fillText('Eat all dots to win!', W / 2, H / 2 + 28);
        g.fillText('Power pellets = eat ghosts', W / 2, H / 2 + 51);
        g.fillStyle = '#FFFF00'; g.font = 'bold 16px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 88);
        g.textAlign = 'left';
      }

      if (!running && started) {
        g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, W, H);
        g.fillStyle = win ? '#FFFF00' : '#FF2244';
        g.font = 'bold 30px "Courier New"'; g.textAlign = 'center';
        g.fillText(win ? 'YOU WIN!' : 'GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFF'; g.font = '20px "Courier New"';
        g.fillText('SCORE ' + score, W / 2, H / 2 + 18);
        g.fillStyle = '#AAA'; g.font = '16px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
