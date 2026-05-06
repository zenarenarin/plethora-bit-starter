// NANO WIREBOT — Micro Platformer (Plethora Bit)

function roundRectC(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

window.plethoraBit = {
  meta: {
    title: 'Nano Wirebot',
    author: 'plethora',
    description: 'Repair the circuit. Fix all the broken wires.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom || 0;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ────────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol, startFreq) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type;
      if (startFreq) {
        o.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(freq, audioCtx.currentTime + dur * 0.5);
      } else {
        o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      }
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playNoise(dur, vol) {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      src.start();
    }
    function sfxFootstep() { playTone(180, 'square', 0.04, 0.08); }
    function sfxJump() { playTone(520, 'sine', 0.18, 0.2, 260); }
    function sfxFix() {
      playTone(660, 'sine', 0.1, 0.25);
      setTimeout(() => playTone(880, 'sine', 0.1, 0.2), 80);
      setTimeout(() => playTone(1100, 'sine', 0.15, 0.3), 160);
      playNoise(0.08, 0.15);
    }
    function sfxHit() {
      playNoise(0.15, 0.3);
      playTone(80, 'sawtooth', 0.15, 0.25);
    }
    function sfxLevelComplete() {
      [262, 330, 392, 523, 659, 784].forEach((f, i) => {
        setTimeout(() => playTone(f, 'sine', 0.18, 0.3), i * 70);
      });
    }
    function sfxGameOver() {
      [440, 370, 311, 262].forEach((f, i) => {
        setTimeout(() => playTone(f, 'sawtooth', 0.22, 0.3), i * 130);
      });
    }

    // ── Level data ───────────────────────────────────────────────────────────
    // Each level: { platforms, nodes, sparks }
    // Platform: { x, y, w, h }
    // Node: { x, y, fixed }
    // Spark: { x, y, vx, vy, phase }  — static hazards, animate in place
    // Coordinates are in a 360×640 logical space, scaled to fit screen

    const LW = 360, LH = 640;
    const scaleX = W / LW, scaleY = H / LH;
    const SC = Math.min(scaleX, scaleY);
    const OX = (W - LW * SC) / 2;
    const OY = (H - LH * SC) / 2;

    // Ground floor for all levels
    const FLOOR = { x: 0, y: LH - 60, w: LW, h: 60 };
    const PLAYER_W = 12, PLAYER_H = 16;

    function lp(x, y, w, h = 10) { return { x, y, w, h }; }
    function ln(x, y) { return { x, y, fixed: false, pulseT: 0 }; }
    function ls(x, y) { return { x, y, phase: Math.random() * Math.PI * 2 }; }

    const LEVELS = [
      // Level 1 — intro, 3 nodes, gentle layout
      {
        platforms: [
          FLOOR,
          lp(60, 480, 80), lp(220, 480, 80),
          lp(140, 380, 80),
          lp(60, 280, 100), lp(200, 280, 100),
        ],
        nodes: [ln(100, 470), ln(260, 470), ln(180, 370)],
        sparks: [],
        spawnX: 30, spawnY: LH - 80,
      },
      // Level 2 — 4 nodes, first spark
      {
        platforms: [
          FLOOR,
          lp(40, 500, 70), lp(180, 500, 70), lp(280, 490, 60),
          lp(100, 400, 80), lp(220, 390, 80),
          lp(160, 290, 80),
          lp(60, 190, 70), lp(230, 190, 70),
        ],
        nodes: [ln(75, 490), ln(215, 490), ln(138, 390), ln(193, 280)],
        sparks: [ls(260, 300)],
        spawnX: 30, spawnY: LH - 80,
      },
      // Level 3 — staircase, 4 nodes, 2 sparks
      {
        platforms: [
          FLOOR,
          lp(20, 520, 80), lp(130, 470, 80), lp(240, 420, 80),
          lp(160, 340, 80),
          lp(60, 260, 80), lp(240, 250, 80),
          lp(140, 170, 80),
        ],
        nodes: [ln(60, 510), ln(170, 460), ln(196, 330), ln(180, 160)],
        sparks: [ls(290, 350), ls(80, 200)],
        spawnX: 30, spawnY: LH - 80,
      },
      // Level 4 — 5 nodes, moving-ish gaps
      {
        platforms: [
          FLOOR,
          lp(20, 500, 60), lp(120, 480, 60), lp(220, 500, 60), lp(300, 470, 50),
          lp(70, 380, 80), lp(210, 360, 80),
          lp(140, 270, 80),
          lp(30, 170, 70), lp(260, 180, 70),
        ],
        nodes: [ln(50, 490), ln(150, 470), ln(230, 490), ln(175, 360), ln(175, 260)],
        sparks: [ls(200, 280), ls(310, 390), ls(50, 260)],
        spawnX: 30, spawnY: LH - 80,
      },
      // Level 5 — floating islands, 5 nodes, 3 sparks
      {
        platforms: [
          FLOOR,
          lp(50, 530, 60), lp(250, 530, 60),
          lp(150, 450, 60),
          lp(40, 360, 70), lp(260, 360, 70),
          lp(150, 270, 70),
          lp(40, 180, 70), lp(250, 185, 70),
          lp(140, 100, 80),
        ],
        nodes: [ln(80, 520), ln(280, 520), ln(180, 440), ln(175, 260), ln(170, 92)],
        sparks: [ls(155, 370), ls(45, 270), ls(260, 280)],
        spawnX: 160, spawnY: LH - 80,
      },
      // Level 6 — zigzag, 6 nodes, 4 sparks
      {
        platforms: [
          FLOOR,
          lp(20, 510, 70), lp(160, 490, 70), lp(280, 510, 60),
          lp(90, 400, 60), lp(230, 395, 60),
          lp(30, 300, 70), lp(180, 290, 70),
          lp(100, 200, 60), lp(250, 195, 60),
          lp(150, 110, 70),
        ],
        nodes: [ln(55, 500), ln(195, 480), ln(310, 500), ln(60, 290), ln(210, 280), ln(180, 102)],
        sparks: [ls(260, 310), ls(130, 310), ls(45, 200), ls(270, 200)],
        spawnX: 30, spawnY: LH - 80,
      },
      // Level 7 — tower + base, 6 nodes, 5 sparks
      {
        platforms: [
          FLOOR,
          lp(10, 520, 60), lp(290, 520, 60),
          lp(80, 440, 60), lp(220, 440, 60),
          lp(10, 360, 60), lp(290, 360, 60),
          lp(140, 280, 80),
          lp(80, 190, 60), lp(220, 190, 60),
          lp(140, 110, 80),
        ],
        nodes: [ln(40, 510), ln(320, 510), ln(110, 430), ln(250, 430), ln(175, 270), ln(175, 100)],
        sparks: [ls(180, 450), ls(175, 370), ls(50, 280), ls(310, 280), ls(175, 200)],
        spawnX: 160, spawnY: LH - 80,
      },
      // Level 8 — hardest, 7 nodes, 6 sparks
      {
        platforms: [
          FLOOR,
          lp(10, 540, 50), lp(90, 510, 50), lp(180, 530, 50), lp(280, 510, 50),
          lp(40, 430, 50), lp(150, 410, 50), lp(270, 430, 50),
          lp(80, 330, 60), lp(220, 320, 60),
          lp(150, 230, 70),
          lp(40, 140, 60), lp(270, 145, 60),
          lp(145, 65, 70),
        ],
        nodes: [ln(35, 530), ln(105, 500), ln(295, 500), ln(65, 420), ln(173, 400), ln(163, 220), ln(173, 57)],
        sparks: [ls(180, 440), ls(310, 350), ls(50, 350), ls(170, 310), ls(180, 150), ls(50, 160)],
        spawnX: 160, spawnY: LH - 80,
      },
    ];

    // ── State ────────────────────────────────────────────────────────────────
    let currentLevel = 0;
    let bestLevel = ctx.storage.get('nwBestLevel') || 0;
    let gameState = 'playing'; // 'playing' | 'levelComplete' | 'gameover' | 'win'
    let started = false;
    let score = 0;
    let timer = 30;
    let timerFrac = 0;
    let levelCompleteT = 0;
    let gameoverT = 0;
    let infoOpen = false;

    // Player
    let px, py, pvx, pvy, onGround, facingRight, footT;
    let invincibleT = 0; // frames of invincibility after hit
    let lives = 3;

    // Particles
    let particles = [];
    // Repair pulse rings
    let repairPulses = [];
    // Level flash
    let levelFlashT = 0;

    // Deep-clone current level
    let platforms, nodes, sparks;

    function loadLevel(idx) {
      const L = LEVELS[idx];
      platforms = L.platforms.map(p => ({ ...p }));
      nodes = L.nodes.map(n => ({ ...n, fixed: false, pulseT: 0 }));
      sparks = L.sparks.map(s => ({ ...s }));
      px = L.spawnX; py = L.spawnY - PLAYER_H;
      pvx = 0; pvy = 0; onGround = false; facingRight = true; footT = 0;
      timer = 30; timerFrac = 0;
      invincibleT = 0;
      particles = [];
      repairPulses = [];
      levelFlashT = 0;
      gameState = 'playing';
    }

    loadLevel(currentLevel);

    // ── Input ─────────────────────────────────────────────────────────────────
    let touchLeft = false, touchRight = false, jumpPending = false;
    let lastTapX = -1, lastTapY = -1;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) {
        started = true;
        ctx.platform.start();
      }

      const t = e.changedTouches[0];
      const rx = (t.clientX - OX) / SC;
      const ry = (t.clientY - OY) / SC;

      // Info button: top-right, logical ~338,22 r=14
      if (Math.hypot(rx - 338, ry - 22) < 20) {
        infoOpen = !infoOpen;
        return;
      }
      if (infoOpen) { infoOpen = false; return; }

      if (gameState === 'levelComplete') { advanceLevel(); return; }
      if (gameState === 'gameover') { restartGame(); return; }
      if (gameState === 'win') { restartGame(); return; }

      lastTapX = rx; lastTapY = ry;

      // Control zones: left-third = move left, right-third = move right, middle = jump
      if (rx < LW * 0.33) { touchLeft = true; }
      else if (rx > LW * 0.67) { touchRight = true; }
      else { jumpPending = true; }

    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const rx = (t.clientX - OX) / SC;
      if (rx < LW * 0.33) touchLeft = false;
      else if (rx > LW * 0.67) touchRight = false;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    function advanceLevel() {
      currentLevel++;
      if (currentLevel >= LEVELS.length) {
        gameState = 'win';
        sfxLevelComplete();
        return;
      }
      if (currentLevel > bestLevel) {
        bestLevel = currentLevel;
        ctx.storage.set('nwBestLevel', bestLevel);
      }
      loadLevel(currentLevel);
    }

    function restartGame() {
      currentLevel = 0; lives = 3; score = 0;
      loadLevel(0);
    }

    function spawnFixParticles(nx, ny) {
      for (let i = 0; i < 14; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 80;
        particles.push({
          x: nx, y: ny,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 1, maxLife: 0.6 + Math.random() * 0.4,
          r: 2 + Math.random() * 2,
          color: Math.random() < 0.5 ? '#00ffcc' : '#ffff00',
        });
      }
      repairPulses.push({ x: nx, y: ny, r: 0, maxR: 50, t: 0 });
    }

    function spawnHitParticles(x, y) {
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 50 + Math.random() * 60;
        particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 1, maxLife: 0.4,
          r: 2,
          color: '#ff4444',
        });
      }
    }

    // ── Physics helpers ───────────────────────────────────────────────────────
    const GRAVITY = 1200;
    const JUMP_V = -480;
    const MOVE_SPD = 160;

    function collidesRect(ax, ay, aw, ah, bx, by, bw, bh) {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function resolvePlayerPlatforms(dt) {
      // Apply gravity
      pvy += GRAVITY * dt;

      // Move X
      px += pvx * dt;
      // Clamp to level bounds
      if (px < 0) { px = 0; pvx = 0; }
      if (px + PLAYER_W > LW) { px = LW - PLAYER_W; pvx = 0; }

      // Move Y, check platforms
      py += pvy * dt;
      onGround = false;

      for (const plat of platforms) {
        if (collidesRect(px, py, PLAYER_W, PLAYER_H, plat.x, plat.y, plat.w, plat.h)) {
          // From above (landing)
          if (pvy >= 0 && py + PLAYER_H - pvy * dt <= plat.y + 2) {
            py = plat.y - PLAYER_H;
            pvy = 0;
            onGround = true;
          }
          // From below (head bump)
          else if (pvy < 0 && py - pvy * dt >= plat.y + plat.h - 2) {
            py = plat.y + plat.h;
            pvy = 0;
          }
          // Side collisions
          else {
            const overlapLeft = (px + PLAYER_W) - plat.x;
            const overlapRight = (plat.x + plat.w) - px;
            if (overlapLeft < overlapRight) { px = plat.x - PLAYER_W; }
            else { px = plat.x + plat.w; }
            pvx = 0;
          }
        }
      }

      // Death floor (fell off bottom)
      if (py > LH + 50) {
        loseLife();
      }
    }

    function loseLife() {
      lives--;
      sfxHit();
      ctx.platform.haptic('medium');
      if (lives <= 0) {
        gameState = 'gameover';
        gameoverT = 0;
        sfxGameOver();
      } else {
        // Respawn at level start
        const L = LEVELS[currentLevel];
        px = L.spawnX; py = L.spawnY - PLAYER_H;
        pvx = 0; pvy = 0;
        invincibleT = 2.5;
        timer = 30; timerFrac = 0;
      }
    }

    // ── Main loop ─────────────────────────────────────────────────────────────
    let footStepAcc = 0;

    ctx.raf((dt) => {
      const dts = dt / 1000;

      // ── Update ──────────────────────────────────────────────────────────────
      if (gameState === 'playing') {
        // Timer
        timerFrac += dts;
        if (timerFrac >= 1) { timerFrac -= 1; timer--; }
        if (timer <= 0) { loseLife(); }

        // Player movement
        pvx = 0;
        if (touchLeft) { pvx = -MOVE_SPD; facingRight = false; }
        if (touchRight) { pvx = MOVE_SPD; facingRight = true; }
        if (jumpPending && onGround) {
          pvy = JUMP_V;
          sfxJump();
          ctx.platform.haptic('light');
          jumpPending = false;
        } else {
          jumpPending = false;
        }

        // Footstep sounds
        if (onGround && Math.abs(pvx) > 0) {
          footStepAcc += dts;
          if (footStepAcc > 0.22) { footStepAcc = 0; sfxFootstep(); }
        } else { footStepAcc = 0; }

        resolvePlayerPlatforms(dts);

        // Invincibility countdown
        if (invincibleT > 0) invincibleT -= dts;

        // Check node repairs
        for (const node of nodes) {
          if (node.fixed) continue;
          if (collidesRect(px, py, PLAYER_W, PLAYER_H, node.x - 8, node.y - 8, 16, 16)) {
            node.fixed = true;
            node.pulseT = 0;
            score += 100 + timer * 5;
            ctx.platform.setScore(score);
            ctx.platform.haptic('medium');
            sfxFix();
            spawnFixParticles(node.x, node.y);
          }
          if (node.fixed) node.pulseT += dts;
        }

        // Check spark hazards
        if (invincibleT <= 0) {
          for (const spark of sparks) {
            if (collidesRect(px, py, PLAYER_W, PLAYER_H, spark.x - 10, spark.y - 10, 20, 20)) {
              invincibleT = 1.8;
              spawnHitParticles(px + PLAYER_W / 2, py + PLAYER_H / 2);
              loseLife();
              break;
            }
          }
        }

        // Check level complete
        if (nodes.every(n => n.fixed)) {
          score += timer * 20;
          ctx.platform.setScore(score);
          levelFlashT = 0;
          gameState = 'levelComplete';
          levelCompleteT = 0;
          sfxLevelComplete();
          ctx.platform.haptic('heavy');
        }
      }

      if (gameState === 'levelComplete') { levelCompleteT += dts; }
      if (gameState === 'gameover') { gameoverT += dts; }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dts;
        p.y += p.vy * dts;
        p.vy += 400 * dts;
        p.life -= dts / p.maxLife;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Update repair pulses
      for (let i = repairPulses.length - 1; i >= 0; i--) {
        const rp = repairPulses[i];
        rp.t += dts * 1.8;
        rp.r = rp.maxR * rp.t;
        if (rp.t >= 1) repairPulses.splice(i, 1);
      }

      // ── Draw ────────────────────────────────────────────────────────────────
      g.clearRect(0, 0, W, H);

      // Transform to logical space
      g.save();
      g.translate(OX, OY);
      g.scale(SC, SC);

      // Background — PCB green
      g.fillStyle = '#001a00';
      g.fillRect(0, 0, LW, LH);

      // PCB grid dots (decorative vias)
      g.fillStyle = '#002800';
      const GRID = 36;
      for (let gx = GRID; gx < LW; gx += GRID) {
        for (let gy = GRID; gy < LH; gy += GRID) {
          g.beginPath();
          g.arc(gx, gy, 2.5, 0, Math.PI * 2);
          g.fill();
        }
      }
      // Via holes (gold rings)
      g.strokeStyle = '#c8a00055';
      g.lineWidth = 1;
      for (let gx = GRID * 2; gx < LW; gx += GRID * 3) {
        for (let gy = GRID * 2; gy < LH; gy += GRID * 3) {
          g.beginPath();
          g.arc(gx, gy, 4, 0, Math.PI * 2);
          g.stroke();
        }
      }

      // Level complete flash
      if (gameState === 'levelComplete' && levelCompleteT < 0.6) {
        const alpha = Math.sin(levelCompleteT * Math.PI / 0.6) * 0.35;
        g.fillStyle = `rgba(200,255,200,${alpha})`;
        g.fillRect(0, 0, LW, LH);
      }

      // ── Platforms (circuit traces) ──
      const now = Date.now() / 1000;
      for (const plat of platforms) {
        // Main trace body
        g.fillStyle = '#c8a000';
        g.fillRect(plat.x, plat.y, plat.w, plat.h);
        // Highlight top edge
        g.fillStyle = '#e8c840';
        g.fillRect(plat.x + 2, plat.y, plat.w - 4, 2);
        // Via dots on platform ends
        g.fillStyle = '#ffdd66';
        g.beginPath(); g.arc(plat.x + 5, plat.y + plat.h / 2, 3, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(plat.x + plat.w - 5, plat.y + plat.h / 2, 3, 0, Math.PI * 2); g.fill();
        // Level complete glow
        if (gameState === 'levelComplete' && levelCompleteT < 1.5) {
          const glow = Math.max(0, 1 - levelCompleteT / 1.5);
          g.fillStyle = `rgba(255,255,255,${glow * 0.35})`;
          g.fillRect(plat.x, plat.y, plat.w, plat.h);
        }
      }

      // ── Repair pulses ──
      for (const rp of repairPulses) {
        const alpha = 1 - rp.t;
        g.strokeStyle = `rgba(0,255,204,${alpha})`;
        g.lineWidth = 3 * (1 - rp.t);
        g.beginPath(); g.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); g.stroke();
      }

      // ── Nodes ──
      for (const node of nodes) {
        if (node.fixed) {
          // Fixed: green glow
          const pulse = Math.sin(node.pulseT * 4) * 0.3 + 0.7;
          g.fillStyle = `rgba(0,200,80,${pulse * 0.25})`;
          g.beginPath(); g.arc(node.x, node.y, 14, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#00cc50';
          g.beginPath(); g.arc(node.x, node.y, 6, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#00ff80';
          g.lineWidth = 2;
          g.beginPath(); g.arc(node.x, node.y, 9, 0, Math.PI * 2); g.stroke();
          // Cross mark
          g.strokeStyle = '#00ff80';
          g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(node.x - 4, node.y); g.lineTo(node.x + 4, node.y); g.stroke();
          g.beginPath(); g.moveTo(node.x, node.y - 4); g.lineTo(node.x, node.y + 4); g.stroke();
        } else {
          // Broken: red sparking
          const flicker = Math.sin(now * 18 + node.x) * 0.4 + 0.6;
          g.fillStyle = `rgba(255,40,0,${flicker * 0.2})`;
          g.beginPath(); g.arc(node.x, node.y, 14, 0, Math.PI * 2); g.fill();
          g.fillStyle = `rgba(255,60,0,${flicker})`;
          g.beginPath(); g.arc(node.x, node.y, 6, 0, Math.PI * 2); g.fill();
          g.strokeStyle = `rgba(255,160,0,${flicker})`;
          g.lineWidth = 2;
          g.beginPath(); g.arc(node.x, node.y, 9, 0, Math.PI * 2); g.stroke();
          // Spark lines
          for (let si = 0; si < 3; si++) {
            const sa = now * 7 + si * 2.1;
            const sr = 8 + Math.sin(now * 13 + si) * 4;
            g.strokeStyle = `rgba(255,220,0,${flicker * 0.7})`;
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(node.x, node.y);
            g.lineTo(node.x + Math.cos(sa) * sr, node.y + Math.sin(sa) * sr);
            g.stroke();
          }
        }
      }

      // ── Spark hazards ──
      for (const spark of sparks) {
        const t = now * 6 + spark.phase;
        const flicker = Math.sin(t) * 0.5 + 0.5;
        // Glow
        const grd = g.createRadialGradient(spark.x, spark.y, 2, spark.x, spark.y, 16);
        grd.addColorStop(0, `rgba(255,255,180,${0.7 * flicker})`);
        grd.addColorStop(1, 'rgba(255,255,0,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(spark.x, spark.y, 16, 0, Math.PI * 2); g.fill();
        // Bolt lines
        for (let si = 0; si < 5; si++) {
          const angle = (si / 5) * Math.PI * 2 + t * 0.4;
          const len = 8 + Math.sin(t + si * 1.2) * 5;
          const jx = spark.x + Math.cos(angle + 0.3) * len * 0.5;
          const jy = spark.y + Math.sin(angle + 0.3) * len * 0.5;
          g.strokeStyle = `rgba(255,255,100,${(0.5 + 0.5 * flicker)})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(spark.x, spark.y);
          g.lineTo(jx, jy);
          g.lineTo(spark.x + Math.cos(angle) * len, spark.y + Math.sin(angle) * len);
          g.stroke();
        }
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(spark.x, spark.y, 2.5, 0, Math.PI * 2); g.fill();
      }

      // ── Particles ──
      for (const p of particles) {
        g.globalAlpha = Math.max(0, p.life);
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;

      // ── Player ──
      if (gameState === 'playing') {
        const showPlayer = invincibleT <= 0 || Math.floor(invincibleT * 10) % 2 === 0;
        if (showPlayer) {
          const bx = px, by = py;
          const cx = bx + PLAYER_W / 2, cy = by + PLAYER_H / 2;

          // Body glow
          const pgrd = g.createRadialGradient(cx, cy, 2, cx, cy, 14);
          pgrd.addColorStop(0, 'rgba(0,255,204,0.3)');
          pgrd.addColorStop(1, 'rgba(0,255,204,0)');
          g.fillStyle = pgrd;
          g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fill();

          // Bot body
          g.fillStyle = '#00FFCC';
          roundRectC(g, bx + 1, by + 2, PLAYER_W - 2, PLAYER_H - 4, 3);
          g.fill();

          // Bot head dome
          g.fillStyle = '#00eebb';
          g.beginPath(); g.arc(cx, by + 4, 5, Math.PI, 0); g.fill();

          // Eyes
          g.fillStyle = '#001a00';
          const eyeOff = facingRight ? 1 : -1;
          g.beginPath(); g.arc(cx + eyeOff * 2.5, by + 5, 1.5, 0, Math.PI * 2); g.fill();

          // Legs (animated)
          footT += dts * (Math.abs(pvx) > 0 ? 12 : 0);
          const legSwing = Math.sin(footT) * 2;
          g.strokeStyle = '#00FFCC';
          g.lineWidth = 2;
          // Left leg
          g.beginPath();
          g.moveTo(bx + 3, by + PLAYER_H - 4);
          g.lineTo(bx + 3 - legSwing, by + PLAYER_H);
          g.stroke();
          // Right leg
          g.beginPath();
          g.moveTo(bx + PLAYER_W - 3, by + PLAYER_H - 4);
          g.lineTo(bx + PLAYER_W - 3 + legSwing, by + PLAYER_H);
          g.stroke();
        }
      }

      g.restore();

      // ── HUD ─────────────────────────────────────────────────────────────────
      const hudH = 44;
      g.fillStyle = 'rgba(0,12,0,0.85)';
      roundRectC(g, 8, 8, W - 16, hudH, 8);
      g.fill();
      g.strokeStyle = '#c8a000';
      g.lineWidth = 1.5;
      roundRectC(g, 8, 8, W - 16, hudH, 8);
      g.stroke();

      // Level
      g.fillStyle = '#c8a000';
      g.font = `bold ${Math.round(11 * SC)}px monospace`;
      g.textAlign = 'left';
      g.fillText(`LVL ${currentLevel + 1}/8`, 18, 28);

      // Wires fixed
      const fixedCount = nodes.filter(n => n.fixed).length;
      g.fillStyle = '#00ffcc';
      g.textAlign = 'center';
      g.fillText(`NODES ${fixedCount}/${nodes.length}`, W / 2, 28);

      // Timer
      const timerColor = timer <= 10 ? (Math.floor(Date.now() / 200) % 2 === 0 ? '#ff4444' : '#ff8888') : '#c8a000';
      g.fillStyle = timerColor;
      g.textAlign = 'right';
      g.fillText(`${String(timer).padStart(2, '0')}s`, W - 50, 28);

      // Lives (dots)
      for (let li = 0; li < 3; li++) {
        g.fillStyle = li < lives ? '#00ffcc' : '#224422';
        g.beginPath();
        g.arc(W - 30 + li * 10 - 10, 24, 3.5, 0, Math.PI * 2);
        g.fill();
      }

      // Score
      g.fillStyle = '#88cc88';
      g.font = `${Math.round(9 * SC)}px monospace`;
      g.textAlign = 'left';
      g.fillText(`${score}`, 18, 42);

      // HUD timer bar
      const barW = (W - 16 - 80) * (timer / 30);
      const barX = 60;
      g.fillStyle = timer > 10 ? '#336633' : '#663333';
      g.fillRect(barX, 38, W - 16 - 60 - 36, 3);
      g.fillStyle = timer > 10 ? '#00ff88' : '#ff4444';
      g.fillRect(barX, 38, barW, 3);

      // Info button
      g.fillStyle = 'rgba(0,30,0,0.8)';
      g.beginPath(); g.arc(W - 22, 22, 14, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c8a000';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(W - 22, 22, 14, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#c8a000';
      g.font = `bold ${Math.round(11 * SC)}px serif`;
      g.textAlign = 'center';
      g.fillText('i', W - 22, 27);

      // Info panel
      if (infoOpen) {
        const pw = W * 0.82, ph = 220 * SC;
        const ipx = (W - pw) / 2, ipy = H / 2 - ph / 2;
        g.fillStyle = 'rgba(0,20,0,0.95)';
        roundRectC(g, ipx, ipy, pw, ph, 12);
        g.fill();
        g.strokeStyle = '#c8a000';
        g.lineWidth = 2;
        roundRectC(g, ipx, ipy, pw, ph, 12);
        g.stroke();
        g.fillStyle = '#00ffcc';
        g.font = `bold ${Math.round(13 * SC)}px monospace`;
        g.textAlign = 'center';
        g.fillText('NANO WIREBOT', W / 2, ipy + 26);
        g.fillStyle = '#88cc88';
        g.font = `${Math.round(10 * SC)}px monospace`;
        const lines = [
          'You are a nanobot on a circuit board.',
          'Repair broken wire nodes (red) by',
          'walking over them. Avoid sparks!',
          '',
          '< Left tap: move left',
          '> Right tap: move right',
          'Center tap: jump',
          '',
          'Fix all nodes before time runs out.',
          'Best level: ' + (bestLevel + 1),
        ];
        lines.forEach((line, i) => {
          g.fillText(line, W / 2, ipy + 52 + i * 16 * SC);
        });
        g.fillStyle = '#c8a000';
        g.fillText('Tap to close', W / 2, ipy + ph - 18);
      }

      // ── Overlay states ────────────────────────────────────────────────────
      if (gameState === 'levelComplete') {
        const alpha = Math.min(1, (levelCompleteT - 0.5) * 2);
        if (alpha > 0) {
          g.fillStyle = `rgba(0,20,0,${alpha * 0.88})`;
          g.fillRect(0, 0, W, H);

          g.fillStyle = `rgba(0,255,204,${alpha})`;
          g.font = `bold ${Math.round(28 * SC)}px monospace`;
          g.textAlign = 'center';
          g.fillText('CIRCUIT REPAIRED', W / 2, H / 2 - 30 * SC);

          g.fillStyle = `rgba(200,160,0,${alpha})`;
          g.font = `${Math.round(14 * SC)}px monospace`;
          g.fillText(`+${timer * 20} TIME BONUS`, W / 2, H / 2 + 5 * SC);

          if (currentLevel + 1 < LEVELS.length) {
            g.fillStyle = `rgba(0,255,150,${alpha * (Math.floor(levelCompleteT * 3) % 2 === 0 ? 1 : 0.4)})`;
            g.font = `${Math.round(12 * SC)}px monospace`;
            g.fillText('TAP TO CONTINUE →', W / 2, H / 2 + 40 * SC);
          } else {
            g.fillStyle = `rgba(255,220,0,${alpha})`;
            g.font = `bold ${Math.round(16 * SC)}px monospace`;
            g.fillText('ALL LEVELS COMPLETE!', W / 2, H / 2 + 40 * SC);
          }
        }
      }

      if (gameState === 'gameover') {
        const alpha = Math.min(1, gameoverT * 2.5);
        g.fillStyle = `rgba(10,0,0,${alpha * 0.9})`;
        g.fillRect(0, 0, W, H);
        g.fillStyle = `rgba(255,60,60,${alpha})`;
        g.font = `bold ${Math.round(28 * SC)}px monospace`;
        g.textAlign = 'center';
        g.fillText('SYSTEM FAULT', W / 2, H / 2 - 30 * SC);
        g.fillStyle = `rgba(200,100,100,${alpha})`;
        g.font = `${Math.round(13 * SC)}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H / 2 + 5 * SC);
        if (gameoverT > 1) {
          g.fillStyle = `rgba(255,180,180,${alpha * (Math.floor(gameoverT * 3) % 2 === 0 ? 1 : 0.4)})`;
          g.font = `${Math.round(12 * SC)}px monospace`;
          g.fillText('TAP TO RESTART', W / 2, H / 2 + 40 * SC);
        }
      }

      if (gameState === 'win') {
        const alpha = Math.min(1, levelCompleteT * 2.5);
        g.fillStyle = `rgba(0,20,0,${alpha * 0.93})`;
        g.fillRect(0, 0, W, H);
        g.fillStyle = `rgba(0,255,204,${alpha})`;
        g.font = `bold ${Math.round(24 * SC)}px monospace`;
        g.textAlign = 'center';
        g.fillText('BOARD COMPLETE!', W / 2, H / 2 - 50 * SC);
        g.fillStyle = `rgba(200,160,0,${alpha})`;
        g.font = `${Math.round(14 * SC)}px monospace`;
        g.fillText(`FINAL SCORE: ${score}`, W / 2, H / 2 - 10 * SC);
        g.fillStyle = `rgba(0,255,130,${alpha})`;
        g.font = `${Math.round(12 * SC)}px monospace`;
        g.fillText(`ALL 8 CIRCUITS REPAIRED`, W / 2, H / 2 + 20 * SC);
        if (levelCompleteT > 1) {
          g.fillStyle = `rgba(0,200,100,${alpha * (Math.floor(levelCompleteT * 2) % 2 === 0 ? 1 : 0.4)})`;
          g.fillText('TAP TO PLAY AGAIN', W / 2, H / 2 + 55 * SC);
        }
        ctx.platform.complete({ score, result: 'win', durationMs: Date.now() });
      }

      // Control hint (first level, not started interaction)
      if (!started) {
        g.fillStyle = 'rgba(0,255,204,0.7)';
        g.font = `${Math.round(10 * SC)}px monospace`;
        g.textAlign = 'center';
        g.fillText('← tap left   |   center jump   |   tap right →', W / 2, H - SAFE - 18);
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
