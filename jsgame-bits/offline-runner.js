// OFFLINE RUNNER — Endless Side-Scrolling Runner (Plethora Bit)

function roundRectC(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
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
    title: 'Offline Runner',
    author: 'plethora',
    description: 'Run forever. Jump over everything.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom || 0;

    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ─── Colours ───────────────────────────────────────────────────────────────
    const BG       = '#0f0f14';
    const CYAN     = '#00E5FF';
    const ORANGE   = '#FF6B35';
    const YELLOW   = '#FFD740';
    const GROUND_C = '#1a1a24';
    const GLOW_C   = '#00E5FF';
    const GRID_C   = 'rgba(0,229,255,0.07)';

    // ─── Layout ────────────────────────────────────────────────────────────────
    const HUD_H  = 52;
    const GROUND_Y = H * 0.70;          // top of ground surface
    const GROUND_H = H - GROUND_Y;
    const ROBOT_W  = 28;
    const ROBOT_H  = 28;
    const ROBOT_X  = W * 0.22;          // fixed horizontal position

    // ─── Audio ─────────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    const voices = [];
    function playTone(freq, type, dur, vol = 0.25, freqEnd) {
      if (!audioCtx) return;
      if (voices.length >= 10) { try { voices[0].stop(); } catch (e) {} voices.shift(); }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (freqEnd !== undefined) o.frequency.linearRampToValueAtTime(freqEnd, audioCtx.currentTime + dur);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
      o.onended = () => { const i = voices.indexOf(o); if (i !== -1) voices.splice(i, 1); };
    }
    function playJump() { playTone(440, 'sine', 0.18, 0.2, 660); }
    function playDoubleJump() { playTone(660, 'sine', 0.15, 0.2, 880); }
    function playLand() { playTone(120, 'triangle', 0.12, 0.2, 80); }
    function playDeath() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.5), audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.8;
      const src = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      src.start();
      [400, 300, 200, 150].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.15, 0.25), i * 80));
    }
    function playMilestone() {
      if (!audioCtx) return;
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.18, 0.22), i * 90));
    }

    // ─── State ─────────────────────────────────────────────────────────────────
    let started, gameOver, showInfo;
    let score, highScore, meters;
    let speed, speedTimer, spawnTimer, obstacleGap;
    let jumpCount, vy, robotY, isDucking, wasOnGround;
    let lastMilestone;
    let obstacles, particles, speedLines, stars;
    let touchDown, touchDownTime;
    let deathFlash;
    let bgScrollX, midScrollX, nearScrollX;

    // ─── Parallax grid state ────────────────────────────────────────────────────
    const GRID_COLS = 12;
    const GRID_ROWS = 8;

    // ─── Init game ─────────────────────────────────────────────────────────────
    function initGame() {
      highScore   = ctx.storage.get('hs_offline_runner') || 0;
      started     = false;
      gameOver    = false;
      showInfo    = false;
      score       = 0;
      meters      = 0;
      speed       = 200;
      speedTimer  = 0;
      spawnTimer  = 0;
      obstacleGap = 1.8;
      jumpCount   = 0;
      vy          = 0;
      robotY      = GROUND_Y - ROBOT_H;
      isDucking   = false;
      wasOnGround = true;
      lastMilestone = 0;
      deathFlash  = 0;
      touchDown   = false;
      obstacles   = [];
      particles   = [];
      speedLines  = [];
      bgScrollX   = 0;
      midScrollX  = 0;
      nearScrollX = 0;

      // Generate static stars for bg layer
      stars = [];
      for (let i = 0; i < 60; i++) {
        stars.push({
          x: Math.random() * W,
          y: HUD_H + Math.random() * (GROUND_Y - HUD_H),
          r: Math.random() * 1.2 + 0.3,
          bri: Math.random(),
        });
      }
    }

    initGame();

    // ─── Obstacle spawning ──────────────────────────────────────────────────────
    const OBS_TYPES = ['wall', 'gap', 'beam'];

    function spawnObstacle() {
      const type = OBS_TYPES[Math.floor(Math.random() * OBS_TYPES.length)];
      let obs;
      if (type === 'wall') {
        const h = 32 + Math.random() * 24;
        obs = { type, x: W + 20, y: GROUND_Y - h, w: 20, h };
      } else if (type === 'gap') {
        const gw = 40 + Math.random() * 30;
        obs = { type, x: W + 20, y: GROUND_Y, w: gw, h: GROUND_H };
      } else { // beam
        const bh = 16;
        const by = GROUND_Y - ROBOT_H * 2.2 - bh; // low enough to need duck
        obs = { type, x: W + 20, y: by, w: 60 + Math.random() * 30, h: bh };
      }
      obs.passed = false;
      obstacles.push(obs);
    }

    // ─── Particles ──────────────────────────────────────────────────────────────
    function spawnParticles(x, y, color, count, vxBase, vyBase, spread) {
      for (let i = 0; i < count; i++) {
        particles.push({
          x, y,
          vx: vxBase + (Math.random() - 0.5) * spread,
          vy: vyBase + (Math.random() - 0.5) * spread,
          life: 1,
          decay: 0.04 + Math.random() * 0.04,
          r: 2 + Math.random() * 3,
          color,
        });
      }
    }

    function spawnTrailParticle() {
      const cx = ROBOT_X + ROBOT_W * 0.5;
      const cy = robotY + ROBOT_H * 0.5;
      particles.push({
        x: cx - ROBOT_W * 0.4 + (Math.random() - 0.5) * 6,
        y: cy + (Math.random() - 0.5) * 6,
        vx: -speed * 0.015 - Math.random() * 1,
        vy: (Math.random() - 0.5) * 0.8,
        life: 1,
        decay: 0.07 + Math.random() * 0.06,
        r: 1.5 + Math.random() * 2,
        color: CYAN,
      });
    }

    // ─── Speed lines ────────────────────────────────────────────────────────────
    function spawnSpeedLine() {
      speedLines.push({
        x: W * 0.5 + Math.random() * W * 0.5,
        y: HUD_H + Math.random() * (GROUND_Y - HUD_H - 20),
        len: 30 + Math.random() * 60,
        life: 1,
        decay: 0.06 + Math.random() * 0.06,
        vy: (Math.random() - 0.5) * 0.3,
      });
    }

    // ─── Hit detection ──────────────────────────────────────────────────────────
    function robotRect() {
      const dh = isDucking ? ROBOT_H * 0.45 : 0;
      return {
        x: ROBOT_X + 3,
        y: robotY + dh + 3,
        w: ROBOT_W - 6,
        h: ROBOT_H - dh - 6,
      };
    }

    function rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x &&
             a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function checkCollisions() {
      const rr = robotRect();
      for (const obs of obstacles) {
        if (obs.type === 'gap') {
          // gap: player must be in the air when the gap passes under them
          // check if robot foot is below ground level while over the gap x range
          const footY = rr.y + rr.h;
          const robotCX = rr.x + rr.w * 0.5;
          if (robotCX > obs.x && robotCX < obs.x + obs.w && footY >= GROUND_Y - 2) {
            return true;
          }
        } else {
          if (rectsOverlap(rr, obs)) return true;
        }
      }
      return false;
    }

    // ─── Jump / duck logic ──────────────────────────────────────────────────────
    const JUMP_VY  = -480;
    const GRAVITY  = 900;

    function doJump() {
      if (jumpCount < 2) {
        if (jumpCount === 0) playJump();
        else playDoubleJump();
        vy = JUMP_VY;
        jumpCount++;
        spawnParticles(ROBOT_X + ROBOT_W * 0.5, robotY + ROBOT_H, CYAN, 8, -1, -2, 4);
        ctx.platform.haptic('light');
      }
    }

    // ─── Touch handling ─────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();

      // Info button hit?
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const ibx = W - 22, iby = 22;
      if (Math.hypot(tx - ibx, ty - iby) < 14) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (gameOver) {
        initGame();
        return;
      }

      if (!started) {
        started = true;
        ctx.platform.start();
      }

      touchDown = true;
      touchDownTime = performance.now();
      doJump();
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      touchDown = false;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    // ─── Draw helpers ────────────────────────────────────────────────────────────

    function drawBackground(dt) {
      // Solid bg
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // Radial glow near robot
      const grd = g.createRadialGradient(ROBOT_X + ROBOT_W * 0.5, GROUND_Y, 10, ROBOT_X + ROBOT_W * 0.5, GROUND_Y, 160);
      grd.addColorStop(0, 'rgba(0,229,255,0.06)');
      grd.addColorStop(1, 'rgba(0,229,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // ── Layer 1: distant grid (slowest, 0.2x) ──────────────────────────────
      const bgOff = bgScrollX % (W / GRID_COLS);
      g.strokeStyle = GRID_C;
      g.lineWidth = 0.5;
      // Vertical lines
      for (let col = -1; col <= GRID_COLS + 1; col++) {
        const lx = col * (W / GRID_COLS) - bgOff;
        g.beginPath(); g.moveTo(lx, HUD_H); g.lineTo(lx, GROUND_Y - 4); g.stroke();
      }
      // Horizontal lines
      const rowH = (GROUND_Y - HUD_H) / GRID_ROWS;
      for (let row = 0; row <= GRID_ROWS; row++) {
        const ly = HUD_H + row * rowH;
        g.beginPath(); g.moveTo(0, ly); g.lineTo(W, ly); g.stroke();
      }

      // ── Layer 2: mid stars (0.5x) ──────────────────────────────────────────
      for (const s of stars) {
        const sx = ((s.x - midScrollX) % W + W) % W;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.002 + s.bri * 10);
        g.fillStyle = `rgba(0,229,255,${0.15 + 0.3 * pulse * s.bri})`;
        g.beginPath();
        g.arc(sx, s.y, s.r, 0, Math.PI * 2);
        g.fill();
      }
    }

    function drawGround() {
      // Ground fill
      g.fillStyle = GROUND_C;
      g.fillRect(0, GROUND_Y, W, GROUND_H);

      // Glowing top edge
      const edgeGrd = g.createLinearGradient(0, GROUND_Y - 2, 0, GROUND_Y + 8);
      edgeGrd.addColorStop(0, 'rgba(0,229,255,0.7)');
      edgeGrd.addColorStop(1, 'rgba(0,229,255,0)');
      g.fillStyle = edgeGrd;
      g.fillRect(0, GROUND_Y - 2, W, 10);

      // Scrolling ground tiles
      g.strokeStyle = 'rgba(0,229,255,0.08)';
      g.lineWidth = 1;
      const tileW = 48;
      const tOff = nearScrollX % tileW;
      for (let tx = -tileW + tOff; tx < W + tileW; tx += tileW) {
        g.beginPath(); g.moveTo(tx, GROUND_Y); g.lineTo(tx, GROUND_Y + GROUND_H); g.stroke();
      }
    }

    function drawRobot() {
      const dh = isDucking ? ROBOT_H * 0.45 : 0;
      const rx = ROBOT_X;
      const ry = robotY + dh;
      const rw = ROBOT_W;
      const rh = ROBOT_H - dh;

      // Glow shadow
      g.save();
      g.shadowColor = CYAN;
      g.shadowBlur = 14;

      // Body
      g.fillStyle = '#003d4d';
      roundRectC(g, rx, ry, rw, rh, 4);
      g.fill();

      // Body outline
      g.strokeStyle = CYAN;
      g.lineWidth = 1.5;
      roundRectC(g, rx, ry, rw, rh, 4);
      g.stroke();

      if (!isDucking) {
        // Head section (top third)
        g.fillStyle = '#004d5e';
        roundRectC(g, rx + 3, ry + 2, rw - 6, rh * 0.38, 3);
        g.fill();
        g.strokeStyle = 'rgba(0,229,255,0.5)';
        g.lineWidth = 1;
        roundRectC(g, rx + 3, ry + 2, rw - 6, rh * 0.38, 3);
        g.stroke();

        // Eye LEDs
        g.fillStyle = CYAN;
        g.beginPath();
        g.arc(rx + rw * 0.35, ry + rh * 0.16, 2.5, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(rx + rw * 0.65, ry + rh * 0.16, 2.5, 0, Math.PI * 2);
        g.fill();

        // Chest circuit lines
        g.strokeStyle = 'rgba(0,229,255,0.35)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(rx + 6, ry + rh * 0.55);
        g.lineTo(rx + rw - 6, ry + rh * 0.55);
        g.stroke();
        g.beginPath();
        g.moveTo(rx + 8, ry + rh * 0.70);
        g.lineTo(rx + rw - 8, ry + rh * 0.70);
        g.stroke();

        // Chest core dot
        g.fillStyle = YELLOW;
        g.shadowColor = YELLOW;
        g.shadowBlur = 8;
        g.beginPath();
        g.arc(rx + rw * 0.5, ry + rh * 0.62, 3, 0, Math.PI * 2);
        g.fill();

        // Legs (animated)
        const legPhase = Date.now() * 0.012;
        g.strokeStyle = CYAN;
        g.lineWidth = 3;
        g.lineCap = 'round';
        // Left leg
        const l1y = ry + rh;
        const l1ox = Math.sin(legPhase) * 4;
        g.beginPath();
        g.moveTo(rx + rw * 0.3, l1y);
        g.lineTo(rx + rw * 0.3 + l1ox, l1y + 6);
        g.stroke();
        // Right leg
        const l2ox = Math.sin(legPhase + Math.PI) * 4;
        g.beginPath();
        g.moveTo(rx + rw * 0.7, l1y);
        g.lineTo(rx + rw * 0.7 + l2ox, l1y + 6);
        g.stroke();
      } else {
        // Ducking: just show visor line
        g.strokeStyle = CYAN;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(rx + 4, ry + rh * 0.5);
        g.lineTo(rx + rw - 4, ry + rh * 0.5);
        g.stroke();
      }

      g.restore();
    }

    function drawObstacles() {
      for (const obs of obstacles) {
        if (obs.type === 'wall') {
          // Neon wall
          g.save();
          g.shadowColor = ORANGE;
          g.shadowBlur = 12;
          g.fillStyle = '#3d1500';
          roundRectC(g, obs.x, obs.y, obs.w, obs.h, 3);
          g.fill();
          g.strokeStyle = ORANGE;
          g.lineWidth = 2;
          roundRectC(g, obs.x, obs.y, obs.w, obs.h, 3);
          g.stroke();
          // Warning stripes
          g.fillStyle = 'rgba(255,107,53,0.18)';
          for (let i = 0; i < obs.h; i += 10) {
            g.fillRect(obs.x + 3, obs.y + i, obs.w - 6, 5);
          }
          g.restore();
        } else if (obs.type === 'gap') {
          // Dark abyss with glowing edges
          g.fillStyle = '#050508';
          g.fillRect(obs.x, GROUND_Y, obs.w, GROUND_H);
          // Left edge glow
          const lg = g.createLinearGradient(obs.x, 0, obs.x + 8, 0);
          lg.addColorStop(0, 'rgba(255,107,53,0.5)');
          lg.addColorStop(1, 'rgba(255,107,53,0)');
          g.fillStyle = lg;
          g.fillRect(obs.x, GROUND_Y, 8, GROUND_H);
          // Right edge glow
          const rg = g.createLinearGradient(obs.x + obs.w - 8, 0, obs.x + obs.w, 0);
          rg.addColorStop(0, 'rgba(255,107,53,0)');
          rg.addColorStop(1, 'rgba(255,107,53,0.5)');
          g.fillStyle = rg;
          g.fillRect(obs.x + obs.w - 8, GROUND_Y, 8, GROUND_H);
          // Warning text
          g.fillStyle = 'rgba(255,107,53,0.5)';
          g.font = 'bold 9px monospace';
          g.textAlign = 'center';
          g.fillText('GAP', obs.x + obs.w * 0.5, GROUND_Y + 20);
        } else { // beam
          // Low flying laser beam
          g.save();
          g.shadowColor = ORANGE;
          g.shadowBlur = 16;
          g.fillStyle = 'rgba(255,107,53,0.15)';
          g.fillRect(obs.x, obs.y, obs.w, obs.h);
          // Beam core
          g.fillStyle = ORANGE;
          g.fillRect(obs.x, obs.y + obs.h * 0.3, obs.w, obs.h * 0.4);
          // Animated flicker
          g.strokeStyle = '#ff9a70';
          g.lineWidth = 1;
          g.setLineDash([4, 3]);
          g.beginPath();
          g.moveTo(obs.x, obs.y + obs.h * 0.5);
          g.lineTo(obs.x + obs.w, obs.y + obs.h * 0.5);
          g.stroke();
          g.setLineDash([]);
          // Left emitter
          g.fillStyle = YELLOW;
          g.shadowColor = YELLOW;
          g.shadowBlur = 10;
          g.beginPath();
          g.arc(obs.x + 4, obs.y + obs.h * 0.5, 4, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
    }

    function drawParticles() {
      for (const p of particles) {
        g.save();
        g.globalAlpha = p.life * 0.9;
        g.shadowColor = p.color;
        g.shadowBlur = 6;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }

    function drawSpeedLines() {
      if (speed < 300) return;
      const alpha = Math.min(1, (speed - 300) / 200) * 0.4;
      g.save();
      g.strokeStyle = `rgba(0,229,255,${alpha})`;
      g.lineWidth = 1;
      for (const sl of speedLines) {
        g.globalAlpha = sl.life * alpha;
        g.beginPath();
        g.moveTo(sl.x, sl.y);
        g.lineTo(sl.x - sl.len * sl.life, sl.y);
        g.stroke();
      }
      g.restore();
    }

    function drawHUD() {
      // HUD bar
      const hudGrd = g.createLinearGradient(0, 0, 0, HUD_H);
      hudGrd.addColorStop(0, 'rgba(0,15,20,0.97)');
      hudGrd.addColorStop(1, 'rgba(0,15,20,0.0)');
      g.fillStyle = hudGrd;
      g.fillRect(0, 0, W, HUD_H + 10);

      // Title
      g.fillStyle = CYAN;
      g.font = 'bold 14px monospace';
      g.textAlign = 'left';
      g.shadowColor = CYAN;
      g.shadowBlur = 8;
      g.fillText('OFFLINE RUNNER', 14, 26);
      g.shadowBlur = 0;

      // Score
      const m = Math.floor(meters);
      g.fillStyle = YELLOW;
      g.font = 'bold 16px monospace';
      g.textAlign = 'right';
      g.fillText(`${m}m`, W - 50, 26);

      // Best
      g.fillStyle = 'rgba(255,215,64,0.55)';
      g.font = '11px monospace';
      g.fillText(`BEST ${highScore}m`, W - 50, 40);

      // Speed indicator
      const spd = Math.floor(speed);
      g.fillStyle = speed > 380 ? ORANGE : 'rgba(0,229,255,0.5)';
      g.font = '10px monospace';
      g.textAlign = 'left';
      g.fillText(`${spd}px/s`, 14, 42);

      // Info button
      const ibx = W - 22, iby = 22;
      g.save();
      g.shadowColor = CYAN;
      g.shadowBlur = 8;
      g.strokeStyle = 'rgba(0,229,255,0.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(ibx, iby, 13, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(0,229,255,0.7)';
      g.font = 'bold 13px serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', ibx, iby);
      g.textBaseline = 'alphabetic';
      g.restore();
    }

    function drawStartOverlay() {
      // Dimmed center
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, HUD_H, W, GROUND_Y - HUD_H);

      // Title
      g.save();
      g.shadowColor = CYAN;
      g.shadowBlur = 20;
      g.fillStyle = CYAN;
      g.font = 'bold 30px monospace';
      g.textAlign = 'center';
      g.fillText('OFFLINE RUNNER', W * 0.5, H * 0.38);
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(0,229,255,0.6)';
      g.font = '13px monospace';
      g.fillText('TAP TO START', W * 0.5, H * 0.48);
      g.fillStyle = 'rgba(255,215,64,0.7)';
      g.font = '11px monospace';
      g.fillText('TAP = JUMP   HOLD = DUCK   DBL-TAP = DOUBLE JUMP', W * 0.5, H * 0.55);
      g.restore();
    }

    function drawDeathOverlay() {
      g.fillStyle = 'rgba(0,0,0,0.72)';
      g.fillRect(0, 0, W, H);

      // Flash
      if (deathFlash > 0) {
        g.fillStyle = `rgba(255,107,53,${deathFlash * 0.35})`;
        g.fillRect(0, 0, W, H);
      }

      const cx = W * 0.5;
      const cy = H * 0.38;

      g.save();
      g.shadowColor = ORANGE;
      g.shadowBlur = 18;
      g.fillStyle = ORANGE;
      g.font = 'bold 26px monospace';
      g.textAlign = 'center';
      g.fillText('SYSTEM CRASH', cx, cy);
      g.restore();

      g.fillStyle = YELLOW;
      g.font = 'bold 20px monospace';
      g.textAlign = 'center';
      g.fillText(`${Math.floor(meters)}m`, cx, cy + 40);

      g.fillStyle = 'rgba(255,215,64,0.55)';
      g.font = '13px monospace';
      g.fillText(`BEST  ${highScore}m`, cx, cy + 62);

      const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.004);
      g.fillStyle = `rgba(0,229,255,${pulse})`;
      g.font = '14px monospace';
      g.fillText('TAP TO RESTART', cx, cy + 98);
    }

    function drawInfoOverlay() {
      const pw = W * 0.82, ph = 220;
      const px = (W - pw) * 0.5, py = H * 0.5 - ph * 0.5;
      g.save();
      g.fillStyle = 'rgba(5,8,16,0.95)';
      roundRectC(g, px, py, pw, ph, 12);
      g.fill();
      g.strokeStyle = 'rgba(0,229,255,0.5)';
      g.lineWidth = 1.5;
      roundRectC(g, px, py, pw, ph, 12);
      g.stroke();

      g.fillStyle = CYAN;
      g.font = 'bold 15px monospace';
      g.textAlign = 'center';
      g.fillText('HOW TO PLAY', W * 0.5, py + 30);

      const lines = [
        '▶  Character runs automatically',
        '↑  TAP = Jump (tap twice mid-air)',
        '▼  HOLD = Duck under laser beams',
        '⚡  Avoid walls, gaps, and beams',
        '▲  Speed increases over time',
        '★  Score = distance in metres',
      ];
      g.fillStyle = 'rgba(0,229,255,0.8)';
      g.font = '12px monospace';
      g.textAlign = 'left';
      lines.forEach((ln, i) => g.fillText(ln, px + 18, py + 60 + i * 25));
      g.restore();
    }

    // ─── Main loop ──────────────────────────────────────────────────────────────
    let trailTimer = 0;
    let speedLineTimer = 0;

    ctx.raf((dt) => {
      const dts = Math.min(dt, 50) / 1000; // seconds, capped

      // ── Scroll parallax offsets ──────────────────────────────────────────────
      if (started && !gameOver) {
        bgScrollX  += speed * 0.20 * dts;
        midScrollX += speed * 0.50 * dts;
        nearScrollX += speed * 1.0 * dts;
      }

      // ── Physics ──────────────────────────────────────────────────────────────
      if (started && !gameOver) {
        // Duck = hold touch after landing
        const onGround = robotY >= GROUND_Y - ROBOT_H - 1;
        isDucking = touchDown && onGround;

        // Gravity
        vy += GRAVITY * dts;
        robotY += vy * dts;

        // Land
        if (robotY >= GROUND_Y - ROBOT_H) {
          robotY = GROUND_Y - ROBOT_H;
          if (vy > 80 && !wasOnGround) {
            spawnParticles(ROBOT_X + ROBOT_W * 0.5, GROUND_Y, CYAN, 6, 0, -3, 5);
            playLand();
          }
          vy = 0;
          jumpCount = 0;
          wasOnGround = true;
        } else {
          wasOnGround = false;
        }

        // Score
        meters += speed * dts * 0.06; // 1 metre per ~16px travelled
        const m = Math.floor(meters);
        ctx.platform.setScore(m);

        // Milestone every 100m
        if (Math.floor(meters / 100) > Math.floor(lastMilestone / 100)) {
          lastMilestone = meters;
          playMilestone();
          ctx.platform.haptic('medium');
        }

        // Speed increase
        speedTimer += dts;
        if (speedTimer >= 2) {
          speedTimer = 0;
          speed = Math.min(500, speed + 10);
        }

        // Obstacle spawn
        spawnTimer += dts;
        const spawnInterval = Math.max(1.2, obstacleGap - (speed - 200) * 0.002);
        if (spawnTimer >= spawnInterval) {
          spawnTimer = 0;
          spawnObstacle();
        }

        // Move obstacles
        for (const obs of obstacles) {
          obs.x -= speed * dts;
        }
        // Remove off-screen
        for (let i = obstacles.length - 1; i >= 0; i--) {
          if (obstacles[i].x + obstacles[i].w < -10) obstacles.splice(i, 1);
        }

        // Collision
        if (checkCollisions()) {
          gameOver = true;
          deathFlash = 1;
          const finalScore = Math.floor(meters);
          if (finalScore > highScore) {
            highScore = finalScore;
            ctx.storage.set('hs_offline_runner', highScore);
          }
          playDeath();
          spawnParticles(ROBOT_X + ROBOT_W * 0.5, robotY + ROBOT_H * 0.5, ORANGE, 20, 0, -4, 8);
          ctx.platform.haptic('heavy');
        }
      }

      // ── Particles ────────────────────────────────────────────────────────────
      if (started && !gameOver) {
        trailTimer += dt;
        if (trailTimer >= 40) {
          trailTimer = 0;
          spawnTrailParticle();
        }

        speedLineTimer += dt;
        const slInterval = Math.max(30, 200 - (speed - 200) * 0.5);
        if (speedLineTimer >= slInterval) {
          speedLineTimer = 0;
          if (speed > 280) spawnSpeedLine();
        }
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dts * 60;
        p.y += p.vy * dts * 60;
        p.vy += 0.15;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Update speed lines
      for (let i = speedLines.length - 1; i >= 0; i--) {
        const sl = speedLines[i];
        sl.x -= speed * dts;
        sl.y += sl.vy;
        sl.life -= sl.decay;
        if (sl.life <= 0 || sl.x < -sl.len) speedLines.splice(i, 1);
      }

      // Death flash decay
      if (deathFlash > 0) deathFlash = Math.max(0, deathFlash - dts * 3);

      // ── Draw ─────────────────────────────────────────────────────────────────
      drawBackground(dts);
      drawSpeedLines();
      drawGround();
      drawObstacles();
      drawParticles();
      drawRobot();
      drawHUD();

      if (!started) drawStartOverlay();
      if (gameOver) drawDeathOverlay();
      if (showInfo) drawInfoOverlay();
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
