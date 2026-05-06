// OFF THE LINE — Twitchy one-tap arcade survival (Plethora Bit)

function roundRectC(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

window.plethoraBit = {
  meta: {
    title: 'Off The Line',
    author: 'plethora',
    description: 'Tap to steer — survive as long as you can!',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea ? ctx.safeArea.bottom : 0;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol, freqEnd) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (freqEnd !== undefined) {
        o.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + dur);
      }
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playTurn() {
      playTone(660, 'square', 0.07, 0.18);
    }
    function playDeath() {
      if (!audioCtx) return;
      [400, 300, 220, 150].forEach((f, i) => {
        setTimeout(() => playTone(f, 'sawtooth', 0.18, 0.28), i * 90);
      });
    }
    function playHighScore() {
      if (!audioCtx) return;
      [523, 659, 784, 1046].forEach((f, i) => {
        setTimeout(() => playTone(f, 'sine', 0.25, 0.3), i * 100);
      });
    }

    // ── Constants ────────────────────────────────────────────────────────
    const CELL = 20;
    const HUD_H = 52;
    const PLAY_TOP = HUD_H;
    const PLAY_BOT = H - SAFE - 8;
    const COLS = Math.floor(W / CELL);
    const ROWS = Math.floor((PLAY_BOT - PLAY_TOP) / CELL);
    const OX = Math.floor((W - COLS * CELL) / 2);   // x offset to center grid
    const OY = PLAY_TOP + Math.floor(((PLAY_BOT - PLAY_TOP) - ROWS * CELL) / 2);

    const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];

    // ── State ────────────────────────────────────────────────────────────
    let trail, head, dir, speed, tickAcc, score, elapsed, started, dead, gameOver;
    let particles = [];
    let deathOverlayAlpha = 0;
    let deathScore = 0, deathTime = 0;
    let highScore = ctx.storage.get('offtheline_hs') || 0;
    let highTime = ctx.storage.get('offtheline_ht') || 0;
    let newHigh = false;
    let showInfo = false;
    let blinkT = 0;

    // speed-o-meter glow
    let speedGlow = 0;

    function cellKey(cx, cy) { return cx * 1000 + cy; }

    function initGame() {
      trail = [];
      const startCX = Math.floor(COLS / 2);
      const startCY = Math.floor(ROWS / 2);
      head = { cx: startCX, cy: startCY };
      dir = DIR.RIGHT;
      speed = 8;          // cells/sec
      tickAcc = 0;
      score = 0;
      elapsed = 0;
      started = false;
      dead = false;
      gameOver = false;
      deathOverlayAlpha = 0;
      newHigh = false;
      particles = [];
      speedGlow = 0;
      // seed trail with starting cell
      trail.push({ cx: startCX, cy: startCY, age: 0 });
    }

    initGame();

    // ── Input ─────────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();

      const tx = e.changedTouches[0].clientX;

      if (showInfo) { showInfo = false; return; }

      // info button tap: top-right corner circle (W-22, 22, r=14)
      const ty = e.changedTouches[0].clientY;
      if (!gameOver && !dead && Math.hypot(tx - (W - 22), ty - 22) <= 18) {
        showInfo = true;
        return;
      }

      if (gameOver) {
        initGame();
        return;
      }

      if (!started) {
        started = true;
        ctx.platform.start();
      }

      if (dead) return;

      // Left half = turn left (counter-clockwise), Right half = turn right (clockwise)
      const turnCW = tx >= W / 2;
      if (turnCW) {
        dir = (dir + 1) % 4;
      } else {
        dir = (dir + 3) % 4;
      }

      ctx.platform.haptic('light');
      playTurn();

      // speed glow flash
      speedGlow = 1.0;

    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    // ── Burst particles ──────────────────────────────────────────────────
    function burst(px, py, n, col) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 160;
        particles.push({
          x: px, y: py,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          life: 0.5 + Math.random() * 0.5,
          maxLife: 0.5 + Math.random() * 0.5,
          r: 2 + Math.random() * 3,
          col,
        });
      }
    }

    // ── Grid to canvas coords ────────────────────────────────────────────
    function cellPx(cx) { return OX + cx * CELL + CELL / 2; }
    function cellPy(cy) { return OY + cy * CELL + CELL / 2; }

    // ── Glow helper ──────────────────────────────────────────────────────
    function setGlow(g, color, blur) {
      g.shadowColor = color;
      g.shadowBlur = blur;
    }
    function clearGlow(g) {
      g.shadowBlur = 0;
    }

    // ── Draw trail segment ───────────────────────────────────────────────
    function trailColor(age, maxAge) {
      // age=0 is head, maxAge is tail — fade from cyan to dark teal
      const t = Math.min(age / Math.max(maxAge, 1), 1);
      const r = Math.round(0   + t * 0);
      const gr = Math.round(255 - t * 180);
      const b  = Math.round(255 - t * 200);
      const a  = Math.max(0.08, 1 - t * 0.85);
      return `rgba(${r},${gr},${b},${a})`;
    }

    // ── Main loop ────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      // clamp dt to avoid huge jumps
      const dtS = Math.min(dt, 80) / 1000;

      blinkT += dt;
      speedGlow = Math.max(0, speedGlow - dtS * 3);

      // ── Update ─────────────────────────────────────────────────────────
      if (started && !dead) {
        elapsed += dtS;
        // Speed ramp: 8 → 20 over ~24 seconds, plateau at 20
        speed = Math.min(8 + elapsed * 0.5, 20);

        tickAcc += speed * dtS;

        while (tickAcc >= 1) {
          tickAcc -= 1;
          // Step head
          const nx = head.cx + DX[dir];
          const ny = head.cy + DY[dir];

          // Wall collision
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
            triggerDeath();
            break;
          }

          // Self collision (check trail, skip the very last tail cell to allow
          // tight turns without false-positives one tick behind)
          const occupied = new Set(trail.slice(0, trail.length - 1).map(t => cellKey(t.cx, t.cy)));
          if (occupied.has(cellKey(nx, ny))) {
            triggerDeath();
            break;
          }

          head = { cx: nx, cy: ny };
          trail.push({ cx: nx, cy: ny, age: 0 });
          // Age all trail cells
          for (let i = 0; i < trail.length; i++) trail[i].age++;

          score = Math.floor(elapsed * 10) + trail.length;
          ctx.platform.setScore(score);
        }
      }

      if (dead) {
        deathOverlayAlpha = Math.min(1, deathOverlayAlpha + dtS * 3);
        if (deathOverlayAlpha >= 0.95 && !gameOver) {
          gameOver = true;
        }
      }

      // ── Update particles ─────────────────────────────────────────────
      particles = particles.filter(p => {
        p.x += p.vx * dtS;
        p.y += p.vy * dtS;
        p.vy += 200 * dtS; // gravity
        p.life -= dtS;
        return p.life > 0;
      });

      // ── Draw ──────────────────────────────────────────────────────────
      // Background
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);

      // Subtle radial yellow glow at center
      const grd = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
      grd.addColorStop(0, 'rgba(255,215,64,0.04)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Grid dots (subtle)
      g.fillStyle = 'rgba(255,255,255,0.04)';
      for (let cy = 0; cy < ROWS; cy++) {
        for (let cx = 0; cx < COLS; cx++) {
          const px = OX + cx * CELL + CELL / 2;
          const py = OY + cy * CELL + CELL / 2;
          g.fillRect(px - 1, py - 1, 2, 2);
        }
      }

      // Trail
      const maxAge = trail.length;
      for (let i = 0; i < trail.length - 1; i++) {
        const seg = trail[i];
        const next = trail[i + 1];
        const col = trailColor(seg.age, maxAge);
        g.strokeStyle = col;
        g.lineWidth = 5;
        g.lineCap = 'round';
        setGlow(g, '#00FFFF', seg.age < 5 ? 12 : 0);
        g.beginPath();
        g.moveTo(cellPx(seg.cx), cellPy(seg.cy));
        g.lineTo(cellPx(next.cx), cellPy(next.cy));
        g.stroke();
      }
      clearGlow(g);

      // Head glow pulse
      if (!dead && trail.length > 0) {
        const hx = cellPx(head.cx);
        const hy = cellPy(head.cy);
        const pulse = 0.6 + 0.4 * Math.sin(blinkT / 120);

        // outer glow ring
        setGlow(g, '#00FFFF', 24 * pulse);
        g.fillStyle = `rgba(0,255,255,${0.15 * pulse})`;
        g.beginPath();
        g.arc(hx, hy, 10, 0, Math.PI * 2);
        g.fill();

        // inner bright dot
        g.fillStyle = '#ffffff';
        setGlow(g, '#00FFFF', 16);
        g.beginPath();
        g.arc(hx, hy, 4, 0, Math.PI * 2);
        g.fill();
        clearGlow(g);

        // Direction arrow ahead
        const ax = hx + DX[dir] * 10;
        const ay = hy + DY[dir] * 10;
        g.strokeStyle = 'rgba(0,255,255,0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(hx, hy);
        g.lineTo(ax, ay);
        g.stroke();
      }

      // Particles
      particles.forEach(p => {
        const a = p.life / p.maxLife;
        g.globalAlpha = Math.max(0, a);
        g.fillStyle = p.col;
        setGlow(g, p.col, 8);
        g.beginPath();
        g.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;
      clearGlow(g);

      // ── HUD ─────────────────────────────────────────────────────────
      drawHUD(g);

      // ── Overlays ─────────────────────────────────────────────────────
      if (!started && !dead) {
        drawStartOverlay(g);
      }

      if (gameOver) {
        drawGameOverOverlay(g);
      }

      if (showInfo) {
        drawInfoOverlay(g);
      }
    });

    // ── Death trigger ────────────────────────────────────────────────────
    function triggerDeath() {
      if (dead) return;
      dead = true;
      deathScore = score;
      deathTime = elapsed;

      ctx.platform.haptic('heavy');
      playDeath();

      // Burst from head
      const hx = cellPx(head.cx);
      const hy = cellPy(head.cy);
      burst(hx, hy, 32, '#00FFFF');
      burst(hx, hy, 16, '#FFD740');
      burst(hx, hy, 8, '#ffffff');

      // Check high score
      const newScoreHigh = deathScore > highScore;
      const newTimeHigh = deathTime > highTime;
      if (newScoreHigh || newTimeHigh) {
        newHigh = true;
        if (newScoreHigh) { highScore = deathScore; ctx.storage.set('offtheline_hs', highScore); }
        if (newTimeHigh) { highTime = deathTime; ctx.storage.set('offtheline_ht', highTime); }
        setTimeout(() => playHighScore(), 600);
      }

      ctx.platform.complete({ score: deathScore, durationMs: Math.round(deathTime * 1000) });
    }

    // ── HUD drawing ──────────────────────────────────────────────────────
    function drawHUD(g) {
      // HUD background
      g.fillStyle = 'rgba(15,15,20,0.88)';
      g.fillRect(0, 0, W, HUD_H);

      // bottom separator line
      g.strokeStyle = 'rgba(255,215,64,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, HUD_H); g.lineTo(W, HUD_H);
      g.stroke();

      // Title
      g.fillStyle = '#FFD740';
      g.font = 'bold 13px "Courier New", monospace';
      g.textAlign = 'left';
      g.fillText('OFF THE LINE', 14, 20);

      // Score
      g.fillStyle = '#00FFFF';
      g.font = 'bold 20px "Courier New", monospace';
      g.fillText(score.toString().padStart(5, '0'), 14, 44);

      // Best label + value
      g.fillStyle = 'rgba(255,255,255,0.38)';
      g.font = '11px "Courier New", monospace';
      g.textAlign = 'right';
      g.fillText('BEST', W / 2 - 4, 20);
      g.fillStyle = 'rgba(255,215,64,0.7)';
      g.font = 'bold 14px "Courier New", monospace';
      g.fillText(highScore.toString().padStart(5, '0'), W / 2 - 4, 36);

      // Speed bar
      const barW = 80;
      const barX = W / 2 + 4;
      const barY = 16;
      const barH = 8;
      const speedFrac = (speed - 8) / 12; // 0..1

      // label
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.font = '10px "Courier New", monospace';
      g.textAlign = 'left';
      g.fillText('SPD', barX, barY - 2);

      // track
      roundRectC(g, barX, barY, barW, barH, 4);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fill();

      // fill
      if (speedFrac > 0) {
        const fillCol = speedFrac < 0.5
          ? `rgba(0,255,180,${0.7 + speedGlow * 0.3})`
          : `rgba(255,${Math.round(215 - speedFrac * 215)},0,${0.85 + speedGlow * 0.15})`;
        roundRectC(g, barX, barY, barW * speedFrac, barH, 4);
        g.fillStyle = fillCol;
        if (speedGlow > 0.1) setGlow(g, fillCol, 12 * speedGlow);
        g.fill();
        clearGlow(g);
      }

      // Time display
      const tSec = Math.floor(elapsed);
      const tMs = Math.floor((elapsed - tSec) * 10);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.font = '11px "Courier New", monospace';
      g.textAlign = 'left';
      g.fillText(`${tSec}.${tMs}s`, barX, barY + barH + 13);

      // Info button
      const ibx = W - 22, iby = 22;
      g.beginPath();
      g.arc(ibx, iby, 14, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.font = 'bold 14px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', ibx, iby + 1);
      g.textBaseline = 'alphabetic';
    }

    // ── Start overlay ────────────────────────────────────────────────────
    function drawStartOverlay(g) {
      g.fillStyle = 'rgba(15,15,20,0.72)';
      g.fillRect(0, HUD_H, W, H - HUD_H);

      const cy = H / 2 + 10;

      // Pulsing title
      const pulse = 0.8 + 0.2 * Math.sin(blinkT / 400);
      g.globalAlpha = pulse;
      setGlow(g, '#00FFFF', 18);
      g.fillStyle = '#00FFFF';
      g.font = 'bold 36px "Courier New", monospace';
      g.textAlign = 'center';
      g.fillText('OFF THE LINE', W / 2, cy - 50);
      clearGlow(g);
      g.globalAlpha = 1;

      g.fillStyle = 'rgba(255,215,64,0.9)';
      g.font = 'bold 16px "Courier New", monospace';
      g.textAlign = 'center';
      g.fillText('TAP TO START', W / 2, cy);

      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.font = '13px "Courier New", monospace';
      g.fillText('left half = turn left', W / 2, cy + 28);
      g.fillText('right half = turn right', W / 2, cy + 48);
    }

    // ── Game over overlay ────────────────────────────────────────────────
    function drawGameOverOverlay(g) {
      // Semi-transparent cover
      g.fillStyle = `rgba(15,15,20,${0.82 * deathOverlayAlpha})`;
      g.fillRect(0, HUD_H, W, H - HUD_H);

      if (deathOverlayAlpha < 0.6) return;

      const alpha = Math.min(1, (deathOverlayAlpha - 0.6) / 0.4);
      g.globalAlpha = alpha;

      const bx = W / 2 - 130, bw = 260;
      const by = H / 2 - 110, bh = 200;

      // Card
      roundRectC(g, bx, by, bw, bh, 14);
      g.fillStyle = 'rgba(20,20,30,0.96)';
      g.fill();
      g.strokeStyle = newHigh ? '#FFD740' : 'rgba(0,255,255,0.4)';
      g.lineWidth = newHigh ? 2 : 1;
      if (newHigh) setGlow(g, '#FFD740', 12);
      g.stroke();
      clearGlow(g);

      g.textAlign = 'center';

      // Title
      g.fillStyle = newHigh ? '#FFD740' : '#FF4455';
      g.font = 'bold 26px "Courier New", monospace';
      setGlow(g, g.fillStyle, 10);
      g.fillText(newHigh ? 'NEW BEST!' : 'DEAD', W / 2, by + 44);
      clearGlow(g);

      // Score
      g.fillStyle = '#00FFFF';
      g.font = 'bold 38px "Courier New", monospace';
      setGlow(g, '#00FFFF', 14);
      g.fillText(deathScore, W / 2, by + 92);
      clearGlow(g);

      // Time survived
      const tSec = deathTime.toFixed(1);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = '14px "Courier New", monospace';
      g.fillText(`survived ${tSec}s`, W / 2, by + 118);

      // Best
      g.fillStyle = 'rgba(255,215,64,0.7)';
      g.font = '13px "Courier New", monospace';
      g.fillText(`best: ${highScore}`, W / 2, by + 142);

      // Tap to restart
      const blink = Math.sin(blinkT / 350) > 0;
      if (blink) {
        g.fillStyle = '#FFD740';
        g.font = 'bold 14px "Courier New", monospace';
        g.fillText('TAP TO RESTART', W / 2, by + 174);
      }

      g.globalAlpha = 1;
    }

    // ── Info overlay ─────────────────────────────────────────────────────
    function drawInfoOverlay(g) {
      g.fillStyle = 'rgba(15,15,20,0.92)';
      g.fillRect(0, 0, W, H);

      const lines = [
        ['OFF THE LINE', 'title'],
        ['', ''],
        ['Tap LEFT half', 'body'],
        ['to turn left.', 'body'],
        ['', ''],
        ['Tap RIGHT half', 'body'],
        ['to turn right.', 'body'],
        ['', ''],
        ["Don't hit walls", 'body'],
        ['or your own trail!', 'body'],
        ['', ''],
        ['Speed increases over', 'body'],
        ['time. Survive!', 'body'],
        ['', ''],
        ['TAP TO CLOSE', 'cta'],
      ];

      let yy = H / 2 - lines.length * 10;
      g.textAlign = 'center';
      lines.forEach(([text, type]) => {
        if (type === 'title') {
          g.fillStyle = '#00FFFF'; g.font = 'bold 22px "Courier New", monospace'; yy += 28;
        } else if (type === 'cta') {
          g.fillStyle = '#FFD740'; g.font = 'bold 15px "Courier New", monospace'; yy += 28;
        } else {
          g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '14px "Courier New", monospace'; yy += 20;
        }
        g.fillText(text, W / 2, yy);
      });
    }

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
