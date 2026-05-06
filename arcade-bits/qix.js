// QIX — Claim territory with line drawing (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Qix',
    author: 'plethora',
    description: 'Drag to draw. Claim 75% while dodging the Qix!',
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
    function playMove() { playTone(300, 0.03, 'square', 0.08); }
    function playClaim() {
      [400, 600, 800].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'sine', 0.25), i * 60));
    }
    function playDie() {
      [500, 400, 300, 200].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'sawtooth', 0.3), i * 80));
    }
    function playWin() {
      [400, 500, 600, 800, 1000].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.3), i * 80));
    }
    function playGameOver() {
      [300, 240, 180].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.3), i * 120));
    }

    const GH = H - SAFE;
    const TOP = 50;
    const GRID = 28;
    const FX = Math.floor((W - GRID * Math.floor(W / GRID)) / 2);
    const FY = TOP;
    const gw = Math.floor((W - FX * 2) / GRID);
    const gh = Math.floor((GH - TOP - 10) / GRID);

    function CX(x) { return FX + x * GRID; }
    function CY(y) { return FY + y * GRID; }

    let cells, player, trail, drawing, qix, particles, score, lives, claimed, running, tick, started, level;
    let lastMoveT = 0;

    function reset() {
      cells = [];
      for (let y = 0; y < gh; y++) { cells[y] = []; for (let x = 0; x < gw; x++) cells[y][x] = 0; }
      player = { x: 0, y: 0 };
      trail = []; drawing = false;
      // Qix starts in middle, random velocity
      const speed = 0.18 + level * 0.02;
      const angle = Math.random() * Math.PI * 2;
      qix = {
        x: gw / 2, y: gh / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        t: 0,
      };
      particles = []; tick = 0;
      score = 0; lives = 3; claimed = 0; running = true;
    }

    function onBorder(x, y) {
      if (x === 0 || x === gw - 1 || y === 0 || y === gh - 1) return true;
      if (cells[y][x] === 1) return true;
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of adj) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) return true;
        if (cells[ny][nx] === 1) return true;
      }
      return false;
    }

    function tryMove(dc, dr) {
      if (!running) return;
      const nx = player.x + dc, ny = player.y + dr;
      if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) return;

      // Self-trail crossing = die
      if (cells[ny][nx] === 2) { die(); return; }

      // Start drawing if we step off the border into empty space
      if (!drawing) {
        if (!onBorder(nx, ny)) {
          drawing = true;
          trail = [{ x: player.x, y: player.y }];
          cells[player.y][player.x] = 2;
        }
      }

      player.x = nx; player.y = ny;
      playMove();

      if (drawing) {
        if (onBorder(nx, ny)) {
          completeTrail();
        } else {
          cells[ny][nx] = 2;
          trail.push({ x: nx, y: ny });
        }
      }
    }

    function completeTrail() {
      drawing = false;

      // Flood fill from Qix to find which side has it
      const qx = Math.floor(qix.x), qy = Math.floor(qix.y);
      const safeQx = Math.max(0, Math.min(gw - 1, qx));
      const safeQy = Math.max(0, Math.min(gh - 1, qy));

      const visited = [];
      for (let y = 0; y < gh; y++) { visited[y] = []; for (let x = 0; x < gw; x++) visited[y][x] = false; }

      const stack = [[safeQx, safeQy]];
      while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= gw || y < 0 || y >= gh) continue;
        if (visited[y][x]) continue;
        if (cells[y][x] === 1 || cells[y][x] === 2) continue;
        visited[y][x] = true;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }

      // Fill unvisited empty cells as claimed
      let filled = 0;
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          if (cells[y][x] === 2) { cells[y][x] = 1; filled++; }
          else if (cells[y][x] === 0 && !visited[y][x]) { cells[y][x] = 1; filled++; }
        }
      }

      trail = [];

      let total = 0;
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (cells[y][x] === 1) total++;
      claimed = (total / (gw * gh)) * 100;
      score += filled * 5 * level;
      ctx.platform.setScore(score);

      // Boom at claim area center
      boom(CX(gw / 2), CY(gh / 2), '#00FFFF');
      playClaim();

      if (claimed >= 75) {
        running = false;
        ctx.platform.complete({ score });
        playWin();
      }
    }

    function die() {
      lives--;
      ctx.platform.haptic('heavy');
      trail.forEach(t => { cells[t.y][t.x] = 0; });
      trail = []; drawing = false;
      boom(CX(player.x), CY(player.y), '#FFFF00');
      player.x = 0; player.y = 0;
      playDie();
      if (lives <= 0) {
        running = false;
        ctx.platform.fail({ reason: 'caught by Qix' });
        playGameOver();
      }
    }

    function boom(x, y, c) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        particles.push({
          x, y,
          vx: Math.cos(a) * (60 + Math.random() * 80),
          vy: Math.sin(a) * (60 + Math.random() * 80),
          c, life: 0.5
        });
      }
    }

    // Touch drag controls — preserve original drag-to-move mechanic
    let heldDir = null;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { level = (level || 1); reset(); return; }
      const t = e.changedTouches[0];
      heldDir = { sx: t.clientX, sy: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!heldDir || !running) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - heldDir.sx;
      const dy = t.clientY - heldDir.sy;
      if (Math.hypot(dx, dy) < 10) return;
      const now = Date.now();
      if (now - lastMoveT < 45) return;
      lastMoveT = now;
      if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0);
      else tryMove(0, dy > 0 ? 1 : -1);
      heldDir.sx = t.clientX;
      heldDir.sy = t.clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      heldDir = null;
    }, { passive: false });

    level = 1;
    reset();

    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      if (running && started) {
        // Qix movement
        qix.t++;
        qix.x += qix.vx;
        qix.y += qix.vy;

        // Bounce off walls
        if (qix.x < 0) { qix.vx = Math.abs(qix.vx); qix.x = 0; }
        if (qix.x >= gw) { qix.vx = -Math.abs(qix.vx); qix.x = gw - 0.01; }
        if (qix.y < 0) { qix.vy = Math.abs(qix.vy); qix.y = 0; }
        if (qix.y >= gh) { qix.vy = -Math.abs(qix.vy); qix.y = gh - 0.01; }

        // Bounce off claimed cells
        const qcx = Math.floor(qix.x), qcy = Math.floor(qix.y);
        if (cells[qcy] && cells[qcy][qcx] === 1) {
          qix.vx = -qix.vx; qix.vy = -qix.vy;
          qix.x += qix.vx * 2; qix.y += qix.vy * 2;
          qix.x = Math.max(0, Math.min(gw - 0.01, qix.x));
          qix.y = Math.max(0, Math.min(gh - 0.01, qix.y));
        }

        // Qix hits active trail = die
        if (cells[qcy] && cells[qcy][qcx] === 2) die();

        // Slight random direction drift
        if (Math.random() < 0.015) {
          qix.vx += (Math.random() - 0.5) * 0.08;
          qix.vy += (Math.random() - 0.5) * 0.08;
          const spd = Math.hypot(qix.vx, qix.vy);
          const target = 0.18 + level * 0.02;
          qix.vx = (qix.vx / spd) * target;
          qix.vy = (qix.vy / spd) * target;
        }

        // Qix collides with player
        const pdx = Math.abs(Math.floor(qix.x) - player.x);
        const pdy = Math.abs(Math.floor(qix.y) - player.y);
        if (pdx <= 1 && pdy <= 1) die();

        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec;
          p.life -= sec;
          return p.life > 0;
        });
      }

      // Draw
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

      // Grid cells
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          if (cells[y][x] === 1) {
            const hue = (x * 5 + y * 4 + tick) % 360;
            g.fillStyle = `hsl(${hue}, 80%, 35%)`;
            g.fillRect(CX(x), CY(y), GRID + 1, GRID + 1);
          } else if (cells[y][x] === 2) {
            g.fillStyle = '#FFFF00';
            g.fillRect(CX(x), CY(y), GRID + 1, GRID + 1);
          }
        }
      }

      // Border
      g.strokeStyle = '#00FFFF'; g.lineWidth = 3;
      g.strokeRect(CX(0) - 1, CY(0) - 1, gw * GRID + 2, gh * GRID + 2);

      // Scanlines
      g.fillStyle = 'rgba(0,0,0,0.2)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Qix — sparkly line creature
      const qixPx = CX(qix.x), qixPy = CY(qix.y);
      g.save();
      g.translate(qixPx, qixPy);
      for (let i = 0; i < 6; i++) {
        const a = tick * 0.05 + i * Math.PI / 3;
        const r1 = 8 + i * 2;
        const r2 = 20 + Math.sin(tick * 0.1 + i) * 6;
        g.strokeStyle = `hsl(${(tick * 5 + i * 60) % 360}, 100%, 60%)`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        g.lineTo(Math.cos(a + Math.PI) * r2, Math.sin(a + Math.PI) * r2);
        g.stroke();
      }
      g.restore();

      // Player
      const ppx = CX(player.x), ppy = CY(player.y);
      g.fillStyle = '#FFFF00';
      g.fillRect(ppx - 5, ppy - 5, 10, 10);
      g.fillStyle = '#FF0000';
      g.fillRect(ppx - 3, ppy - 3, 6, 6);

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
      g.globalAlpha = 1;

      // HUD
      g.fillStyle = '#00FFFF'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 32);
      g.textAlign = 'center'; g.fillText(Math.floor(claimed) + '% CLAIMED', W / 2, 32);
      g.textAlign = 'right'; g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 32);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.88)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FFFF'; g.font = 'bold 30px "Courier New"'; g.textAlign = 'center';
        g.fillText('QIX', W / 2, H / 2 - 40);
        g.fillStyle = '#FFF'; g.font = '15px "Courier New"';
        g.fillText('DRAG to draw territory', W / 2, H / 2 + 5);
        g.fillText('Claim 75% to win!', W / 2, H / 2 + 28);
        g.fillText('Avoid the Qix creature!', W / 2, H / 2 + 51);
        g.fillStyle = '#FFFF00'; g.font = 'bold 16px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 90);
        g.textAlign = 'left';
      }

      if (!running && started) {
        g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, W, H);
        const won = claimed >= 75;
        g.fillStyle = won ? '#00FF00' : '#FF2244';
        g.font = 'bold 30px "Courier New"'; g.textAlign = 'center';
        g.fillText(won ? 'YOU WIN!' : 'GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '18px "Courier New"';
        g.fillText('SCORE ' + score + ' · ' + Math.floor(claimed) + '%', W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
