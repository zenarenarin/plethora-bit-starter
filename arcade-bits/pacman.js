// PAC-MAN — Arcade Classic (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Pac-Man',
    author: 'plethora',
    description: 'Hold and drag to steer. Chomp dots, dodge ghosts.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, vol = 0.25) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playDot() { playTone(800, 0.05, 0.15); }
    function playPellet() { playTone(400, 0.2, 0.3); }
    function playGhost() { playTone(300, 0.15, 0.3); }
    function playDie() { [400, 320, 240, 180].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 0.3), i * 100)); }
    function playWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 0.4), i * 150)); }

    const MAP = [
      '#####################',
      '#.........#.........#',
      '#.##.###.#.#.###.##.#',
      '#.#o..............#.#',
      '#.#.##.#.###.#.##.#.#',
      '#......#..#..#......#',
      '####.####.#.####.####',
      '   #.#.........#.#   ',
      '####.#.##---##.#.####',
      '.......# GGG #.......',
      '####.#.#######.#.####',
      '   #.#.........#.#   ',
      '####.#.#######.#.####',
      '#.........#.........#',
      '#.##.###..#..###.##.#',
      '#o.#.....P.......#.o#',
      '##.#.#.#######.#.#.##',
      '#....#....#....#....#',
      '#.######.###.######.#',
      '#...................#',
      '#####################',
    ];
    const ROWS = MAP.length, COLS = MAP[0].length;
    const SAFE = ctx.safeArea.bottom;

    let walls, dots, pellets, pac, ghosts, score, lives, powerT, running, win, particles, tick, started;

    function reset() {
      walls = []; dots = []; pellets = [];
      for (let y = 0; y < ROWS; y++) {
        walls[y] = []; dots[y] = []; pellets[y] = [];
        for (let x = 0; x < COLS; x++) {
          const c = MAP[y][x];
          walls[y][x] = c === '#';
          dots[y][x] = c === '.';
          pellets[y][x] = c === 'o';
        }
      }
      pac = { x: 10, y: 15, px: 10, py: 15, dir: 3, next: 3, t: 0 };
      ghosts = [
        { x: 9, y: 9, px: 9, py: 9, color: '#FF0000', t: 0, dx: 1, dy: 0, scared: 0 },
        { x: 10, y: 9, px: 10, py: 9, color: '#FFB8FF', t: 0, dx: -1, dy: 0, scared: 0 },
        { x: 11, y: 9, px: 11, py: 9, color: '#00FFFF', t: 0, dx: 0, dy: -1, scared: 0 },
        { x: 10, y: 7, px: 10, py: 7, color: '#FFB852', t: 0, dx: 0, dy: 1, scared: 0 },
      ];
      score = 0; lives = 3; powerT = 0; running = true; win = false; particles = []; tick = 0;
    }

    // Reserve bottom strip for D-pad zones
    const DPAD_H = 160;
    const DPAD_Y = H - SAFE - DPAD_H;
    const usable = Math.min(W, DPAD_Y - 40);
    const tile = Math.floor(usable / COLS);
    const offX = Math.floor((W - tile * COLS) / 2);
    const offY = 40;

    // Bottom strip split: left third=LEFT, right third=RIGHT, mid-top=UP, mid-bottom=DOWN
    let dpadActive = -1;
    const PCX = W / 2, PCY = DPAD_Y + DPAD_H / 2;

    function dpadHit(tx, ty) {
      if (ty < DPAD_Y) return -1;
      const dx = tx - PCX, dy = ty - PCY;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 1) : (dy < 0 ? 2 : 3);
    }

    const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1]];
    function canGo(x, y) {
      if (y < 0 || y >= ROWS) return false;
      if (x < 0) x += COLS; if (x >= COLS) x -= COLS;
      return !walls[y][x];
    }

    function step() {
      if (!running || !started) return;
      tick++;
      if (powerT > 0) powerT--;
      particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--; });
      particles = particles.filter(p => p.life > 0);

      pac.t++;
      if (pac.t >= 10) {
        pac.t = 0;
        const [nx, ny] = DIRS[pac.next];
        if (canGo(pac.x + nx, pac.y + ny)) pac.dir = pac.next;
        const [dx, dy] = DIRS[pac.dir];
        if (canGo(pac.x + dx, pac.y + dy)) {
          pac.x += dx; pac.y += dy;
          if (pac.x < 0) pac.x = COLS - 1;
          if (pac.x >= COLS) pac.x = 0;
          if (dots[pac.y][pac.x]) { dots[pac.y][pac.x] = false; score += 10; playDot(); ctx.platform.setScore(score); }
          if (pellets[pac.y][pac.x]) {
            pellets[pac.y][pac.x] = false; score += 50; powerT = 200;
            ghosts.forEach(gh => gh.scared = 200);
            playPellet();
          }
          let any = false;
          for (let yy = 0; yy < ROWS && !any; yy++) for (let xx = 0; xx < COLS && !any; xx++) if (dots[yy][xx] || pellets[yy][xx]) any = true;
          if (!any) { win = true; running = false; ctx.platform.complete({ score }); playWin(); }
        }
      }
      pac.px += (pac.x - pac.px) * 0.25;
      pac.py += (pac.y - pac.py) * 0.25;

      ghosts.forEach(gh => {
        gh.t++;
        const gs = 14;
        if (gh.scared > 0) gh.scared--;
        if (gh.t >= gs) {
          gh.t = 0;
          const opts = DIRS.filter(([dx, dy]) => canGo(gh.x + dx, gh.y + dy) && !(dx === -gh.dx && dy === -gh.dy));
          const choices = opts.length ? opts : DIRS.filter(([dx, dy]) => canGo(gh.x + dx, gh.y + dy));
          if (choices.length) {
            let best = choices[0], best_s = Infinity;
            choices.forEach(c => {
              const d = Math.hypot(gh.x + c[0] - pac.x, gh.y + c[1] - pac.y);
              const s = gh.scared > 0 ? -d : d;
              if (s < best_s) { best_s = s; best = c; }
            });
            if (Math.random() < 0.15) best = choices[(Math.random() * choices.length) | 0];
            gh.dx = best[0]; gh.dy = best[1];
            gh.x += gh.dx; gh.y += gh.dy;
            if (gh.x < 0) gh.x = COLS - 1;
            if (gh.x >= COLS) gh.x = 0;
          }
        }
        gh.px += (gh.x - gh.px) * 0.25;
        gh.py += (gh.y - gh.py) * 0.25;
        if (Math.abs(gh.px - pac.px) < 0.5 && Math.abs(gh.py - pac.py) < 0.5) {
          if (gh.scared > 0) {
            score += 200; gh.x = 10; gh.y = 9; gh.scared = 0;
            playGhost(); ctx.platform.setScore(score);
          } else {
            lives--; ctx.platform.haptic('heavy');
            pac.x = 10; pac.y = 15; pac.px = 10; pac.py = 15;
            playDie();
            if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'caught by ghost' }); }
          }
        }
      });
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
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

    ctx.raf(() => {
      step();

      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      // scanlines
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Maze
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const px = offX + x * tile, py = offY + y * tile;
        if (walls[y][x]) {
          g.fillStyle = '#0033CC';
          g.fillRect(px, py, tile, tile);
          g.fillStyle = '#1E90FF';
          g.fillRect(px + 2, py + 2, tile - 4, tile - 4);
          g.fillStyle = '#000';
          g.fillRect(px + 4, py + 4, tile - 8, tile - 8);
        } else if (dots[y][x]) {
          g.fillStyle = '#FFCC99';
          g.fillRect(px + tile / 2 - 1, py + tile / 2 - 1, 2, 2);
        } else if (pellets[y][x]) {
          const s = 2 + Math.sin(tick * 0.2) * 1.5;
          g.fillStyle = '#FFFF00';
          g.beginPath(); g.arc(px + tile / 2, py + tile / 2, s + 2, 0, Math.PI * 2); g.fill();
        }
      }

      // Ghosts
      ghosts.forEach(gh => {
        const cx = offX + gh.px * tile + tile / 2;
        const cy = offY + gh.py * tile + tile / 2;
        const r = tile * 0.45;
        const col = gh.scared > 0 ? (Math.floor(tick / 4) % 2 ? '#FFF' : '#00F') : gh.color;
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
        g.fillStyle = '#00F';
        g.fillRect(cx - r * 0.45 + (gh.dx > 0 ? r * 0.15 : 0), cy - r * 0.15, r * 0.18, r * 0.22);
        g.fillRect(cx + r * 0.25 + (gh.dx > 0 ? r * 0.15 : 0), cy - r * 0.15, r * 0.18, r * 0.22);
      });

      // Pac-Man
      {
        const cx = offX + pac.px * tile + tile / 2;
        const cy = offY + pac.py * tile + tile / 2;
        const r = tile * 0.45;
        const mouth = Math.abs(Math.sin(tick * 0.3)) * 0.5 + 0.05;
        const dirRot = { 0: 0, 1: Math.PI, 2: -Math.PI / 2, 3: Math.PI / 2 }[pac.dir] || 0;
        g.save(); g.translate(cx, cy); g.rotate(dirRot);
        g.fillStyle = '#FFFF00';
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, mouth, Math.PI * 2 - mouth); g.closePath(); g.fill();
        g.globalAlpha = 0.25; g.fillStyle = '#FFFF88';
        g.beginPath(); g.arc(0, 0, r + 3, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        g.restore();
      }

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 20);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // HUD
      g.fillStyle = '#FFFF00';
      g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left';
      g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'right';
      g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      // D-pad — 4 triangles from center
      if (started && running) {
        g.save();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const tl = { x: 0, y: DPAD_Y }, tr = { x: W, y: DPAD_Y };
        const bl = { x: 0, y: H - SAFE }, br = { x: W, y: H - SAFE };
        const cc = { x: PCX, y: PCY };
        const triangles = [
          { pts: [cc, tl, tr], dir: 2, label: '▲', lx: PCX,         ly: DPAD_Y + DPAD_H * 0.28 },
          { pts: [cc, bl, br], dir: 3, label: '▼', lx: PCX,         ly: DPAD_Y + DPAD_H * 0.72 },
          { pts: [cc, tl, bl], dir: 1, label: '◀', lx: W * 0.22,    ly: PCY },
          { pts: [cc, tr, br], dir: 0, label: '▶', lx: W * 0.78,    ly: PCY },
        ];
        triangles.forEach(t => {
          const lit = t.dir === dpadActive;
          g.beginPath();
          g.moveTo(t.pts[0].x, t.pts[0].y);
          g.lineTo(t.pts[1].x, t.pts[1].y);
          g.lineTo(t.pts[2].x, t.pts[2].y);
          g.closePath();
          g.fillStyle = lit ? 'rgba(255,255,0,0.22)' : 'rgba(255,255,255,0.06)';
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.12)';
          g.lineWidth = 1;
          g.stroke();
          g.fillStyle = lit ? '#FFFF00' : 'rgba(255,255,255,0.35)';
          g.font = 'bold 26px sans-serif';
          g.fillText(t.label, t.lx, t.ly);
        });
        g.restore();
      }

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#FFCC00';
        g.font = 'bold 28px "Courier New"';
        g.textAlign = 'center';
        g.fillText('PAC-MAN', W / 2, H / 2 - 20);
        g.fillStyle = '#FFF';
        g.font = '16px "Courier New"';
        g.fillText('TAP D-PAD to steer', W / 2, H / 2 + 20);
        g.fillText('TAP to start', W / 2, H / 2 + 50);
        g.textAlign = 'left';
      }

      if (!running && win) {
        g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FF00'; g.font = 'bold 32px "Courier New"'; g.textAlign = 'center';
        g.fillText('YOU WIN!', W / 2, H / 2 - 15);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"';
        g.fillText('SCORE ' + score, W / 2, H / 2 + 20);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 55);
        g.textAlign = 'left';
      }

      if (!running && !win) {
        g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF0000'; g.font = 'bold 32px "Courier New"'; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 15);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"';
        g.fillText('SCORE ' + score, W / 2, H / 2 + 20);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 55);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
