// PEST CONTROL — Tap-to-Zap Exterminator (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Pest Control',
    author: 'plethora',
    description: 'Zap the bugs before they escape! Hold for area spray.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom + 10;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FFEB3B';
    const BG = '#0f0f14';
    const HUD_H = 48;
    const PLAY_TOP = HUD_H + 4;
    const PLAY_BOT = H - SAFE - 4;
    const PLAY_H = PLAY_BOT - PLAY_TOP;

    // Web Audio
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    const voices = [];
    function playTone(freq, type, dur, vol = 0.3) {
      if (!audioCtx) return;
      if (voices.length >= 8) { try { voices[0].stop(); } catch(e){} voices.shift(); }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
      o.onended = () => { const i = voices.indexOf(o); if (i !== -1) voices.splice(i, 1); };
    }
    function playZap(combo) {
      const f = 200 + Math.min(combo * 80, 600);
      playTone(f, 'square', 0.07, 0.3);
    }
    function playSpray() { playTone(180, 'sawtooth', 0.3, 0.25); }
    function playEscape() { playTone(160, 'sawtooth', 0.25, 0.25); }
    function playGameOver() {
      if (!audioCtx) return;
      [350, 280, 220, 160].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.22, 0.3), i * 110));
    }
    function playWave() {
      if (!audioCtx) return;
      [440, 550, 660].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.12, 0.2), i * 60));
    }

    // Pest types
    const PEST_TYPES = [
      { name: 'bug',    r: 14, speed: 55,  hp: 1, color: '#8BC34A', pts: 10 },
      { name: 'spider', r: 16, speed: 70,  hp: 1, color: '#9E9E9E', pts: 15 },
      { name: 'mouse',  r: 18, speed: 90,  hp: 2, color: '#BDBDBD', pts: 25 },
    ];

    let pests, particles, splats, sprays, score, lives, highScore;
    let gameOver, started, wave, waveTimer, nextWaveTimer, wavePestsLeft, spawnTimer, combo, comboTimer;
    let sprayActive = false, sprayX = 0, sprayY = 0, sprayCharge = 100, sprayTimer = 0;

    function initGame() {
      highScore = ctx.storage.get('hs_pestcontrol') || 0;
      pests = []; particles = []; splats = []; sprays = [];
      score = 0; lives = 3; gameOver = false; started = false;
      wave = 1; waveTimer = 0; nextWaveTimer = 0; wavePestsLeft = 0; spawnTimer = 0;
      combo = 0; comboTimer = 0;
      sprayActive = false; sprayCharge = 100;
      startWave();
    }

    function startWave() {
      wavePestsLeft = 4 + wave * 2;
      spawnTimer = 0;
      playWave();
    }

    function spawnPest() {
      if (wavePestsLeft <= 0) return;
      wavePestsLeft--;
      // Pick type weighted by wave
      const r = Math.random();
      let type;
      if (wave <= 2 || r < 0.5) type = PEST_TYPES[0];
      else if (r < 0.8) type = PEST_TYPES[1];
      else type = PEST_TYPES[2];

      // Spawn from edges
      let x, y;
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { x = -type.r; y = PLAY_TOP + Math.random() * PLAY_H; }
      else if (edge === 1) { x = W + type.r; y = PLAY_TOP + Math.random() * PLAY_H; }
      else if (edge === 2) { x = Math.random() * W; y = PLAY_TOP - type.r; }
      else { x = Math.random() * W; y = PLAY_BOT + type.r; }

      // Target: random point on screen
      const tx = W * 0.15 + Math.random() * W * 0.7;
      const ty = PLAY_TOP + 20 + Math.random() * (PLAY_H - 40);
      const ang = Math.atan2(ty - y, tx - x);
      const spd = type.speed * (1 + wave * 0.1);

      pests.push({
        x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        ...type, hp: type.hp,
        angle: ang,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 1.5 + Math.random() * 1.5,
        escapedTimer: 0,
        alive: true,
      });
    }

    function addSplat(x, y, col, n = 12) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 100;
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.4, col, r: 2 + Math.random() * 3 });
      }
      // Persistent splat mark
      splats.push({ x, y, r: 12 + Math.random() * 8, col, alpha: 0.5 });
    }

    function addSprayEffect(x, y) {
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 30 + Math.random() * 120;
        sprays.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.3 });
      }
    }

    function zapPest(pest) {
      pest.alive = false;
      combo++;
      comboTimer = 1500;
      const pts = pest.pts * Math.max(1, combo);
      score += pts;
      if (score > highScore) highScore = score;
      ctx.platform.setScore(score);
      addSplat(pest.x, pest.y, pest.color, 14);
      playZap(combo);
      ctx.platform.haptic(combo >= 5 ? 'heavy' : combo >= 3 ? 'medium' : 'light');
      // Floating score text via particle
      particles.push({ x: pest.x, y: pest.y - 20, vx: 0, vy: -40, life: 1.0, col: '#fff', isText: true, text: '+' + pts });
    }

    function areaZap(cx, cy, radius) {
      pests.forEach(p => {
        if (!p.alive) return;
        if (Math.hypot(p.x - cx, p.y - cy) < radius + p.r) {
          zapPest(p);
        }
      });
    }

    let holdTimer = 0;
    let holdX = 0, holdY = 0;
    let showInfo = false;
    const IBTN = { x: W - 22, y: 8 + HUD_H / 2, r: 14 };

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      if (Math.hypot(tx - IBTN.x, ty - IBTN.y) < IBTN.r + 6) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }
      if (gameOver) { initGame(); return; }
      if (!started) { started = true; ctx.platform.start(); }

      holdTimer = 0;
      holdX = tx; holdY = ty;

      // Tap zap: check pests
      let zapped = false;
      for (const pest of pests) {
        if (!pest.alive) continue;
        if (Math.hypot(tx - pest.x, ty - pest.y) < pest.r + 12) {
          pest.hp--;
          if (pest.hp <= 0) zapPest(pest);
          zapped = true;
          break;
        }
      }
      if (!zapped) {
        // miss — tiny effect
        particles.push({ x: tx, y: ty, vx: 0, vy: 0, life: 0.2, col: '#555', isText: true, text: 'miss' });
      }
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      holdX = t.clientX; holdY = t.clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      holdTimer = 0;
      sprayActive = false;
    }, { passive: false });

    initGame();

    ctx.raf((dt) => {
      const sec = dt / 1000;

      if (!gameOver && started) {
        // Hold-to-spray
        holdTimer += dt;
        if (holdTimer >= 500 && sprayCharge > 0) {
          if (!sprayActive) {
            sprayActive = true;
            playSpray();
          }
          const sprayRadius = 55;
          sprayX = holdX; sprayY = holdY;
          sprayCharge -= sec * 50; // depletes in 2s
          if (sprayCharge < 0) sprayCharge = 0;
          areaZap(holdX, holdY, sprayRadius);
          addSprayEffect(holdX, holdY);
        } else if (holdTimer < 500) {
          sprayActive = false;
        }
        // Spray recharges when not in use
        if (!sprayActive && sprayCharge < 100) {
          sprayCharge = Math.min(100, sprayCharge + sec * 20);
        }

        // Combo timer
        if (comboTimer > 0) {
          comboTimer -= dt;
          if (comboTimer <= 0) { combo = 0; }
        }

        // Wave management
        const spawnInterval = Math.max(600, 1800 - wave * 100);
        spawnTimer -= dt;
        if (spawnTimer <= 0 && wavePestsLeft > 0) {
          spawnPest();
          spawnTimer = spawnInterval;
        }

        // Check wave complete
        if (wavePestsLeft === 0 && pests.filter(p => p.alive).length === 0) {
          // Next wave after brief delay
          nextWaveTimer -= dt;
          if (nextWaveTimer <= 0) {
            wave++;
            nextWaveTimer = 2500;
            startWave();
          }
        } else {
          nextWaveTimer = 2500;
        }

        // Update pests
        for (const pest of pests) {
          if (!pest.alive) continue;
          pest.wobble += pest.wobbleSpeed * sec;
          // Sine-wave path wobble
          const perpX = -Math.sin(pest.angle);
          const perpY = Math.cos(pest.angle);
          const wobbleAmt = Math.sin(pest.wobble) * 20;
          pest.x += (pest.vx + perpX * wobbleAmt) * sec;
          pest.y += (pest.vy + perpY * wobbleAmt) * sec;

          // Check if escaped (left the playfield)
          const escaped =
            pest.x < -pest.r * 3 || pest.x > W + pest.r * 3 ||
            pest.y < PLAY_TOP - pest.r * 3 || pest.y > PLAY_BOT + pest.r * 3;
          if (escaped) {
            pest.alive = false;
            lives--;
            combo = 0;
            playEscape();
            ctx.platform.haptic('medium');
            if (lives <= 0) {
              lives = 0;
              gameOver = true;
              ctx.storage.set('hs_pestcontrol', highScore);
              playGameOver();
              ctx.platform.fail({ reason: 'all lives lost' });
            }
          }
        }
        pests = pests.filter(p => p.alive || p._keepFrames > 0);

        // Update particles
        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec;
          if (!p.isText) p.vy += 120 * sec;
          p.life -= sec; return p.life > 0;
        });
        sprays = sprays.filter(sp => {
          sp.x += sp.vx * sec; sp.y += sp.vy * sec;
          sp.life -= sec; return sp.life > 0;
        });
        splats = splats.filter(s => { s.alpha -= sec * 0.15; return s.alpha > 0; });

        ctx.platform.setScore(score);
        ctx.platform.setProgress(Math.min(1, wave / 12));
      }

      // ===== DRAW =====
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // Subtle grid floor
      g.strokeStyle = 'rgba(255,235,59,0.05)';
      g.lineWidth = 1;
      for (let gx = 0; gx < W; gx += 40) {
        g.beginPath(); g.moveTo(gx, PLAY_TOP); g.lineTo(gx, PLAY_BOT); g.stroke();
      }
      for (let gy = PLAY_TOP; gy < PLAY_BOT; gy += 40) {
        g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke();
      }

      // Splats (persistent marks)
      splats.forEach(s => {
        g.globalAlpha = s.alpha;
        g.fillStyle = s.col;
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
        // Splatter lines
        for (let i = 0; i < 5; i++) {
          const sa = (i / 5) * Math.PI * 2;
          const sl = s.r * (0.8 + Math.sin(i * 7) * 0.4);
          g.fillRect(s.x + Math.cos(sa) * s.r * 0.8 - 2, s.y + Math.sin(sa) * s.r * 0.8 - 2, 4, 4);
        }
      });
      g.globalAlpha = 1;

      // Spray effect
      sprays.forEach(sp => {
        g.globalAlpha = Math.max(0, sp.life / 0.4) * 0.5;
        g.fillStyle = '#AAFFEE';
        g.fillRect(sp.x - 2, sp.y - 2, 4, 4);
      });
      g.globalAlpha = 1;

      // Spray area indicator
      if (sprayActive) {
        const sprayRadius = 55;
        g.globalAlpha = 0.18;
        g.fillStyle = '#AAFFEE';
        g.beginPath(); g.arc(sprayX, sprayY, sprayRadius, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 0.5;
        g.strokeStyle = '#AAFFEE';
        g.lineWidth = 2;
        g.beginPath(); g.arc(sprayX, sprayY, sprayRadius, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }

      // Draw pests
      pests.forEach(pest => {
        if (!pest.alive) return;
        g.save();
        g.translate(pest.x, pest.y);
        g.rotate(pest.angle + Math.PI / 2);

        switch (pest.name) {
          case 'bug': {
            // Body
            g.fillStyle = pest.color;
            g.beginPath(); g.ellipse(0, 0, pest.r * 0.6, pest.r, 0, 0, Math.PI * 2); g.fill();
            // Stripes
            g.fillStyle = 'rgba(0,0,0,0.3)';
            for (let i = -1; i <= 1; i++) {
              g.fillRect(-pest.r * 0.5, i * pest.r * 0.3 - 2, pest.r, 4);
            }
            // Legs
            g.strokeStyle = pest.color;
            g.lineWidth = 2;
            for (let side = -1; side <= 1; side += 2) {
              for (let j = -1; j <= 1; j++) {
                g.beginPath();
                g.moveTo(side * pest.r * 0.5, j * pest.r * 0.4);
                g.lineTo(side * pest.r * 1.1, j * pest.r * 0.55 + side * 3);
                g.stroke();
              }
            }
            // Eyes
            g.fillStyle = '#ff4444';
            g.fillRect(-4, -pest.r + 2, 3, 3);
            g.fillRect(1, -pest.r + 2, 3, 3);
            break;
          }
          case 'spider': {
            // Body
            g.fillStyle = pest.color;
            g.beginPath(); g.arc(0, 0, pest.r * 0.7, 0, Math.PI * 2); g.fill();
            // Head
            g.beginPath(); g.arc(0, -pest.r * 0.85, pest.r * 0.45, 0, Math.PI * 2); g.fill();
            // 8 legs
            g.strokeStyle = pest.color;
            g.lineWidth = 1.5;
            for (let li = 0; li < 8; li++) {
              const la = (li / 8) * Math.PI * 2;
              g.beginPath();
              g.moveTo(Math.cos(la) * pest.r * 0.6, Math.sin(la) * pest.r * 0.6);
              g.lineTo(Math.cos(la) * pest.r * 1.4, Math.sin(la) * pest.r * 1.2);
              g.stroke();
            }
            // Eyes
            g.fillStyle = '#ff0';
            g.fillRect(-5, -pest.r * 1.1, 3, 3);
            g.fillRect(2, -pest.r * 1.1, 3, 3);
            break;
          }
          case 'mouse': {
            // Body
            g.fillStyle = pest.color;
            g.beginPath(); g.ellipse(0, 3, pest.r * 0.65, pest.r * 0.85, 0, 0, Math.PI * 2); g.fill();
            // Head
            g.beginPath(); g.ellipse(0, -pest.r * 0.75, pest.r * 0.5, pest.r * 0.55, 0, 0, Math.PI * 2); g.fill();
            // Ears
            g.fillStyle = '#FF8A80';
            g.beginPath(); g.arc(-pest.r * 0.5, -pest.r * 1.15, pest.r * 0.3, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.arc(pest.r * 0.5, -pest.r * 1.15, pest.r * 0.3, 0, Math.PI * 2); g.fill();
            // Eyes
            g.fillStyle = '#333';
            g.fillRect(-5, -pest.r * 0.85, 4, 4);
            g.fillRect(2, -pest.r * 0.85, 4, 4);
            // Tail
            g.strokeStyle = pest.color;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(0, pest.r * 0.85);
            g.quadraticCurveTo(pest.r * 1.2, pest.r * 1.2, pest.r * 0.8, pest.r * 1.8);
            g.stroke();
            // HP pips for 2hp
            if (pest.hp === 1) {
              g.fillStyle = 'rgba(255,50,50,0.6)';
              g.beginPath(); g.arc(0, 0, pest.r * 0.4, 0, Math.PI * 2); g.fill();
            }
            break;
          }
        }
        g.restore();
      });

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.6);
        if (p.isText) {
          g.fillStyle = p.col;
          g.font = 'bold 14px "Courier New"';
          g.textAlign = 'center';
          g.fillText(p.text, p.x, p.y);
        } else {
          g.fillStyle = p.col;
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
        }
      });
      g.globalAlpha = 1;

      // HUD
      g.fillStyle = '#13131a';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      g.fillStyle = ACCENT;
      g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left';
      g.fillText('PEST', 16, 24);

      // Lives
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < lives ? '#FF1744' : '#333';
        g.beginPath(); g.arc(70 + i * 20, 19, 7, 0, Math.PI * 2); g.fill();
      }

      // Wave indicator
      g.fillStyle = '#888';
      g.font = '11px "Courier New"';
      g.textAlign = 'left';
      g.fillText('W' + wave, 16, 40);

      // Spray charge bar
      const chargeBarW = 50;
      g.fillStyle = '#333';
      g.fillRect(35, 32, chargeBarW, 7);
      g.fillStyle = sprayCharge > 50 ? '#AAFFEE' : '#55AACC';
      g.fillRect(35, 32, chargeBarW * (sprayCharge / 100), 7);
      g.fillStyle = '#888';
      g.font = '9px monospace';
      g.fillText('SPRAY', 90, 39);

      // Score
      g.fillStyle = '#fff';
      g.font = 'bold 16px "Courier New"';
      g.textAlign = 'right';
      g.fillText(score, W - 50, 24);

      // Combo indicator
      if (combo >= 2 && comboTimer > 0) {
        g.fillStyle = ACCENT;
        g.font = 'bold 13px "Courier New"';
        g.textAlign = 'right';
        g.fillText('x' + combo + ' COMBO!', W - 50, 40);
      } else {
        g.fillStyle = '#888';
        g.font = '10px "Courier New"';
        g.textAlign = 'right';
        g.fillText('BEST ' + highScore, W - 50, 40);
      }

      // IBTN drawn LAST
      g.fillStyle = '#222';
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ACCENT;
      g.font = 'bold 14px "Courier New"';
      g.textAlign = 'center';
      g.fillText('i', IBTN.x, IBTN.y + 5);

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 22px "Courier New"';
        g.textAlign = 'center';
        g.fillText('HOW TO PLAY', W / 2, H / 2 - 120);
        g.fillStyle = '#fff';
        g.font = '15px "Courier New"';
        const lines = [
          'TAP pests to zap them.',
          'HOLD to charge spray can',
          '(area zap around finger).',
          '',
          'Quick zaps = COMBO bonus!',
          '',
          'Pest escapes = lose a life.',
          '3 lives total.',
          '',
          'BROWN = crumbles  GREEN = bouncy',
          'Waves get harder each round.',
        ];
        lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 - 75 + i * 24));
        g.fillStyle = '#888';
        g.font = '13px "Courier New"';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, H / 2 + 190);
        g.textAlign = 'left';
        return;
      }

      // Start overlay
      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.68)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = ACCENT;
        g.font = 'bold 26px "Courier New"';
        g.textAlign = 'center';
        g.fillText('PEST CONTROL', W / 2, H / 2 - 30);
        g.fillStyle = '#fff';
        g.font = '15px "Courier New"';
        g.fillText('Tap to zap bugs!', W / 2, H / 2 + 10);
        g.fillText('Hold to spray an area.', W / 2, H / 2 + 34);
        g.fillStyle = ACCENT;
        g.font = 'bold 14px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 70);
        g.textAlign = 'left';
      }

      // Game over
      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.78)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = '#FF1744';
        g.font = 'bold 34px "Courier New"';
        g.textAlign = 'center';
        g.fillText('INFESTED!', W / 2, H / 2 - 40);
        g.fillStyle = ACCENT;
        g.font = 'bold 20px "Courier New"';
        g.fillText('SCORE: ' + score, W / 2, H / 2);
        g.fillStyle = '#FFD740';
        g.font = '16px "Courier New"';
        g.fillText('BEST: ' + highScore, W / 2, H / 2 + 28);
        g.fillStyle = '#fff';
        g.font = '15px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 65);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
