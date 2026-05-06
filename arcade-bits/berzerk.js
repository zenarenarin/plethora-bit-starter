window.plethoraBit = {
  meta: {
    title: 'Berzerk',
    author: 'plethora',
    description: 'Escape the maze. Evil Otto hunts you.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_berzerk';

    let state = 'title';
    let score = 0, highScore = ctx.storage.get(HS_KEY) || 0;
    let audioCtx = null;

    function initAudio() { if (audioCtx) return; audioCtx = new AudioContext(); }
    function beep(f, type, dur, vol = 0.2) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = f;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { beep(900, 'square', 0.07, 0.12); }
    function playExplode() { beep(120, 'sawtooth', 0.3, 0.45); }
    function playOtto() { beep(300 + Math.random() * 200, 'sine', 0.1, 0.35); }
    function playDie() { [500,350,200,80].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.4), i*150)); }
    function playNextRoom() { beep(800,'sine',0.1,0.3); setTimeout(() => beep(1200,'sine',0.1,0.3), 100); }

    const CELL = Math.min(W, H * 0.85) / 7;
    const COLS = Math.floor(W / CELL);
    const ROWS = Math.floor((H * 0.82) / CELL);
    let maze = [], robots = [], bullets = [], robotBullets = [], particles = [];
    let player = { x: 0, y: 0, facing: { x: 1, y: 0 } };
    let otto = null, ottoTimer = 0;
    let room = 0, dragStart = null, fireStart = null;
    let shootTimer = 0;

    function buildMaze() {
      // Generate random maze walls
      maze = [];
      for (let r = 0; r < ROWS; r++) {
        maze.push([]);
        for (let c = 0; c < COLS; c++) {
          // Border always wall; interior random with exits
          const isBorder = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
          if (isBorder) {
            // Create exits: top center, bottom center, left center, right center
            const topExit = r === 0 && c === Math.floor(COLS / 2);
            const botExit = r === ROWS - 1 && c === Math.floor(COLS / 2);
            const leftExit = c === 0 && r === Math.floor(ROWS / 2);
            const rightExit = c === COLS - 1 && r === Math.floor(ROWS / 2);
            maze[r].push(!(topExit || botExit || leftExit || rightExit));
          } else {
            maze[r].push(Math.random() < 0.25);
          }
        }
      }
      // Ensure player start is clear
      const pr = Math.floor(ROWS / 2), pc = Math.floor(COLS / 2);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = pr + dr, rc = pc + dc;
        if (rr >= 0 && rr < ROWS && rc >= 0 && rc < COLS) maze[rr][rc] = false;
      }
    }

    function spawnRobots() {
      robots = [];
      const n = 4 + Math.floor(room / 2);
      let placed = 0;
      while (placed < n) {
        const rc = Math.floor(Math.random() * COLS);
        const rr = Math.floor(Math.random() * ROWS);
        const px = (rc + 0.5) * CELL + (W - COLS * CELL) / 2;
        const py = (rr + 0.5) * CELL + 44;
        if (!maze[rr] || maze[rr][rc]) continue;
        if (Math.hypot(px - player.x, py - player.y) < CELL * 3) continue;
        robots.push({ x: px, y: py, hp: 1, fireTimer: 60 + Math.random() * 80, moveTimer: 40 + Math.random() * 60, vx: 0, vy: 0 });
        placed++;
      }
    }

    function resetGame() {
      score = 0; room = 0; otto = null; ottoTimer = 0;
      const offX = (W - COLS * CELL) / 2;
      player = { x: W / 2, y: H * 0.5, facing: { x: 1, y: 0 } };
      bullets = []; robotBullets = []; particles = [];
      buildMaze(); spawnRobots();
    }

    function cellAt(wx, wy) {
      const offX = (W - COLS * CELL) / 2;
      const c = Math.floor((wx - offX) / CELL);
      const r = Math.floor((wy - 44) / CELL);
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
      return maze[r][c];
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    function checkExit() {
      const offX = (W - COLS * CELL) / 2;
      const offY = 44;
      const ec = COLS / 2, er = ROWS / 2;
      // Check exits
      if (player.y < offY - 4) { nextRoom(); return; }
      if (player.y > offY + ROWS * CELL + 4) { nextRoom(); return; }
      if (player.x < offX - 4) { nextRoom(); return; }
      if (player.x > offX + COLS * CELL + 4) { nextRoom(); return; }
    }

    function nextRoom() {
      room++;
      score += 100 * (robots.length === 0 ? 2 : 1);
      ctx.platform.setScore(score);
      if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
      playNextRoom();
      player.x = W / 2; player.y = H / 2;
      otto = null; ottoTimer = 0;
      buildMaze(); spawnRobots();
      bullets = []; robotBullets = []; particles = [];
    }

    let joystickOrigin = null, joystickPos = null;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }
      joystickOrigin = { x: t.clientX, y: t.clientY };
      joystickPos = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (state !== 'play' || !joystickOrigin) return;
      const t = e.changedTouches[0];
      joystickPos = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      // Fire toward drag direction
      if (joystickOrigin && joystickPos && state === 'play') {
        const dx = joystickPos.x - joystickOrigin.x;
        const dy = joystickPos.y - joystickOrigin.y;
        if (Math.hypot(dx, dy) > 8) {
          const dist = Math.hypot(dx, dy);
          bullets.push({ x: player.x, y: player.y, vx: (dx / dist) * 10, vy: (dy / dist) * 10 });
          player.facing = { x: dx / dist, y: dy / dist };
          playShoot(); ctx.platform.interact({ type: 'tap' });
        }
      }
      joystickOrigin = null; joystickPos = null;
    }, { passive: false });

    ctx.raf((dt) => {
      const spd = dt / 16;

      g.fillStyle = '#080818'; g.fillRect(0, 0, W, H);

      if (state === 'title') {
        g.fillStyle = '#4f4'; g.font = `bold ${W * 0.11}px monospace`; g.textAlign = 'center';
        g.fillText('BERZERK', W / 2, H * 0.35);
        g.fillStyle = '#fff'; g.font = `${W * 0.038}px monospace`;
        g.fillText('DRAG to move  RELEASE to fire', W / 2, H * 0.5);
        g.fillStyle = '#f88'; g.font = `${W * 0.036}px monospace`;
        g.fillText('Evil Otto hunts you — MOVE FAST', W / 2, H * 0.58);
        g.fillStyle = '#ff8'; g.font = `${W * 0.05}px monospace`;
        g.fillText('TAP TO START', W / 2, H * 0.72);
        g.fillStyle = '#888'; g.font = `${W * 0.04}px monospace`;
        g.fillText(`HI: ${highScore}`, W / 2, H * 0.82);
        return;
      }

      if (state === 'over') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H * 0.38);
        g.fillStyle = '#fff'; g.font = `${W * 0.05}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H * 0.52);
        g.fillStyle = '#ff8'; g.fillText(`BEST: ${highScore}`, W / 2, H * 0.62);
        g.fillStyle = '#4f4'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      // Move player from joystick
      if (joystickOrigin && joystickPos) {
        const dx = joystickPos.x - joystickOrigin.x;
        const dy = joystickPos.y - joystickOrigin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 10) {
          const speed = Math.min(dist / 30, 1) * 3;
          const nx = player.x + (dx / dist) * speed * spd;
          const ny = player.y + (dy / dist) * speed * spd;
          if (!cellAt(nx, player.y)) player.x = nx;
          if (!cellAt(player.x, ny)) player.y = ny;
          if (dist > 5) player.facing = { x: dx / dist, y: dy / dist };
        }
      }
      player.x = Math.max(10, Math.min(W - 10, player.x));
      player.y = Math.max(50, Math.min(H - ctx.safeArea.bottom - 10, player.y));

      checkExit();

      // Wall death
      if (cellAt(player.x, player.y)) {
        spawnParticles(player.x, player.y, '#4f4', 14);
        playDie(); ctx.platform.haptic('heavy'); state = 'over'; return;
      }

      // Otto timer
      ottoTimer += dt;
      if (ottoTimer > 6000 && !otto) {
        otto = { x: -30, y: player.y };
        playOtto();
      }
      if (otto) {
        const dx = player.x - otto.x, dy = player.y - otto.y, dist = Math.hypot(dx, dy);
        otto.x += (dx / dist) * 1.8 * spd;
        otto.y += (dy / dist) * 1.8 * spd;
        if (dist < 16) {
          spawnParticles(player.x, player.y, '#ff0', 14);
          playDie(); ctx.platform.haptic('heavy'); state = 'over'; return;
        }
      }

      // Draw maze
      const offX = (W - COLS * CELL) / 2;
      const offY = 44;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (maze[r][c]) {
            const wx = offX + c * CELL, wy = offY + r * CELL;
            g.fillStyle = '#1a6a1a';
            g.fillRect(wx + 1, wy + 1, CELL - 2, CELL - 2);
            g.strokeStyle = '#2aaa2a'; g.lineWidth = 2;
            g.strokeRect(wx + 1, wy + 1, CELL - 2, CELL - 2);
          }
        }
      }

      // Robot logic
      for (const rob of robots) {
        rob.moveTimer -= dt;
        if (rob.moveTimer <= 0) {
          rob.moveTimer = 60 + Math.random() * 60;
          const dx = player.x - rob.x, dy = player.y - rob.y, dist = Math.hypot(dx, dy);
          rob.vx = (dx / dist) * 1.2; rob.vy = (dy / dist) * 1.2;
        }
        const nx = rob.x + rob.vx * spd, ny = rob.y + rob.vy * spd;
        if (!cellAt(nx, rob.y)) rob.x = nx;
        if (!cellAt(rob.x, ny)) rob.y = ny;

        rob.fireTimer -= dt;
        if (rob.fireTimer <= 0) {
          rob.fireTimer = 1200 + Math.random() * 600;
          const dx = player.x - rob.x, dy = player.y - rob.y, dist = Math.hypot(dx, dy);
          robotBullets.push({ x: rob.x, y: rob.y, vx: (dx / dist) * 5, vy: (dy / dist) * 5 });
        }

        // Draw robot
        g.save(); g.translate(rob.x, rob.y);
        g.fillStyle = '#4a8'; g.fillRect(-8, -14, 16, 20);
        g.fillStyle = '#2f6'; g.fillRect(-6, -20, 12, 10); // head
        g.fillStyle = '#f84'; g.fillRect(-3, -16, 3, 3); // eye
        g.fillRect(2, -16, 3, 3);
        g.restore();

        // Robot-wall death
        if (cellAt(rob.x, rob.y)) {
          score += 150; ctx.platform.setScore(score);
          spawnParticles(rob.x, rob.y, '#4a8', 10); playExplode();
          robots.splice(robots.indexOf(rob), 1);
          if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
        }

        // Robot contact kill
        if (Math.hypot(rob.x - player.x, rob.y - player.y) < 18) {
          spawnParticles(player.x, player.y, '#4f4', 14); playDie();
          ctx.platform.haptic('heavy'); state = 'over'; return;
        }
      }

      // Player bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.x < 0 || b.x > W || b.y < 44 || b.y > H) { bullets.splice(i, 1); continue; }
        if (cellAt(b.x, b.y)) { spawnParticles(b.x, b.y, '#ff8', 4); bullets.splice(i, 1); continue; }
        g.fillStyle = '#ff8'; g.beginPath(); g.arc(b.x, b.y, 4, 0, Math.PI * 2); g.fill();
        for (let j = robots.length - 1; j >= 0; j--) {
          if (Math.hypot(b.x - robots[j].x, b.y - robots[j].y) < 16) {
            score += 100; ctx.platform.setScore(score);
            spawnParticles(robots[j].x, robots[j].y, '#4a8', 10); playExplode();
            robots.splice(j, 1); bullets.splice(i, 1);
            if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
            break;
          }
        }
      }

      // Robot bullets
      for (let i = robotBullets.length - 1; i >= 0; i--) {
        const b = robotBullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.x < 0 || b.x > W || b.y < 44 || b.y > H) { robotBullets.splice(i, 1); continue; }
        if (cellAt(b.x, b.y)) { robotBullets.splice(i, 1); continue; }
        g.fillStyle = '#f44'; g.beginPath(); g.arc(b.x, b.y, 4, 0, Math.PI * 2); g.fill();
        if (Math.hypot(b.x - player.x, b.y - player.y) < 14) {
          spawnParticles(player.x, player.y, '#4f4', 14); playDie();
          ctx.platform.haptic('heavy'); state = 'over'; return;
        }
      }

      // Otto
      if (otto) {
        g.save(); g.translate(otto.x, otto.y);
        const osc = Math.sin(Date.now() * 0.01) * 0.2;
        g.fillStyle = '#ff0'; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#000'; g.beginPath(); g.arc(-6, -4, 4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(6, -4, 4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(0, 6, 8, 0, Math.PI, false); g.stroke();
        g.restore();
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.04 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life; g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      // Player
      g.save(); g.translate(player.x, player.y);
      const fa = Math.atan2(player.facing.y, player.facing.x);
      g.rotate(fa - Math.PI / 2);
      g.fillStyle = '#4f4';
      g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 10); g.lineTo(0, 6); g.lineTo(-10, 10); g.closePath(); g.fill();
      g.restore();

      // Joystick visual
      if (joystickOrigin) {
        g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 2;
        g.beginPath(); g.arc(joystickOrigin.x, joystickOrigin.y, 30, 0, Math.PI * 2); g.stroke();
        if (joystickPos) {
          g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(joystickPos.x, joystickPos.y, 12, 0, Math.PI * 2); g.fill();
        }
      }

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, 40);
      g.fillStyle = '#4f4'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 26);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 26);
      g.fillStyle = '#fff'; g.textAlign = 'center';
      g.fillText(`ROOM ${room + 1}  ROBOTS:${robots.length}`, W / 2, 26);
      if (otto) {
        g.fillStyle = '#ff0'; g.font = `bold ${W * 0.038}px monospace`;
        g.fillText('EVIL OTTO!', W / 2, 48);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
