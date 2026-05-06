// BACKCOUNTRY — Wild West Tap-to-Shoot Bounty Hunter (Plethora Bit)

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
    title: 'Backcountry',
    author: 'plethora',
    description: 'Shoot outlaws before they shoot you.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom + 10;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Palette ──────────────────────────────────────────────────────────────
    const BG       = '#1a1008';
    const SKY_TOP  = '#3d2b1a';
    const SKY_BOT  = '#7a4a20';
    const GROUND   = '#c8922a';
    const SAND_LT  = '#e8b560';
    const ACCENT   = '#FFD740';
    const RED      = '#FF3B3B';
    const HUD_H    = 52;
    const PLAY_TOP = HUD_H + 4;
    const PLAY_BOT = H - SAFE - 4;
    const GROUND_Y = PLAY_BOT - 55;   // horizon

    // ── Audio (lazy) ─────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Gunshot: white-noise burst
    function sfxShoot() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.12, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      src.buffer = buf;
      // slight low-pass to get that muffled crack
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 1200; filt.Q.value = 0.6;
      src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      src.start(); src.stop(audioCtx.currentTime + 0.12);
    }

    // Enemy death: low thud
    function sfxDeath() {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.setValueAtTime(120, audioCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
      o.start(); o.stop(audioCtx.currentTime + 0.18);
    }

    // Enemy fires: tension sting
    function sfxEnemyFire() {
      if (!audioCtx) return;
      [380, 320, 260].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.type = 'sawtooth'; o.frequency.value = f;
        const t = audioCtx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.start(t); o.stop(t + 0.12);
      });
    }

    // Reload click
    function sfxReload() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.04, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      src.start(); src.stop(audioCtx.currentTime + 0.04);
    }

    // Game over dramatic sting
    function sfxGameOver() {
      if (!audioCtx) return;
      [440, 370, 310, 220, 165].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.type = 'sawtooth'; o.frequency.value = f;
        const t = audioCtx.currentTime + i * 0.14;
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        o.start(t); o.stop(t + 0.28);
      });
    }

    // Bounty jingle (ascending tones)
    function sfxBounty() {
      if (!audioCtx) return;
      [440, 554, 659].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.type = 'triangle'; o.frequency.value = f;
        const t = audioCtx.currentTime + i * 0.07;
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.start(t); o.stop(t + 0.14);
      });
    }

    // ── Cover positions ───────────────────────────────────────────────────────
    // 7 positions spread across the scene
    // type: 'barrel'|'rock'|'window'|'crate'
    const COVER_DEFS = [
      { x: 0.08, type: 'barrel' },
      { x: 0.20, type: 'crate'  },
      { x: 0.33, type: 'rock'   },
      { x: 0.50, type: 'window' },
      { x: 0.65, type: 'rock'   },
      { x: 0.78, type: 'barrel' },
      { x: 0.91, type: 'window' },
    ];
    // Resolved at runtime
    const covers = COVER_DEFS.map(def => ({
      x: def.x * W,
      y: GROUND_Y,
      type: def.type,
    }));

    // ── Enemy types ───────────────────────────────────────────────────────────
    // aimTime: seconds before they fire; bounty: $ reward
    const ENEMY_TYPES = [
      { id: 'outlaw',    bounty: 10,  aimTime: 3.2, hatColor: '#5c3d1e', color: '#8B6540', fast: false, boss: false },
      { id: 'gunslinger',bounty: 50,  aimTime: 1.8, hatColor: '#2a1a05', color: '#6B4520', fast: true,  boss: false },
      { id: 'boss',      bounty: 250, aimTime: 2.4, hatColor: '#cc2200', color: '#7a3010', fast: false, boss: true  },
    ];

    // ── State ─────────────────────────────────────────────────────────────────
    let enemies, bulletHoles, floaters, particles;
    let score, highScore, lives, combo, comboTimer, multiplier;
    let gameOver, started, waveSec, waveNum;
    let shakeX, shakeY, shakeTimer;
    let redFlash;        // 0..1 fade
    let wantedPosters;   // appear after 30s
    let showInfo;
    let missFX;          // [{ x, y, life }]

    const IBTN = { x: W - 22, y: 8 + HUD_H / 2, r: 14 };

    function initGame() {
      highScore    = ctx.storage.get('hs_backcountry') || 0;
      enemies      = [];
      bulletHoles  = [];
      floaters     = [];
      particles    = [];
      missFX       = [];
      wantedPosters = [];
      score        = 0;
      lives        = 5;
      combo        = 0;
      comboTimer   = 0;
      multiplier   = 1;
      gameOver     = false;
      started      = false;
      waveSec      = 0;
      waveNum      = 1;
      shakeX       = 0; shakeY = 0; shakeTimer = 0;
      redFlash     = 0;
      showInfo     = false;
    }

    // ── Spawn helpers ─────────────────────────────────────────────────────────
    let spawnTimer = 0;
    function maxSimultaneous() { return Math.min(3 + Math.floor(waveNum / 2), 6); }
    function spawnInterval()   { return Math.max(700, 2000 - waveNum * 120); }

    function pickEnemyType() {
      const r = Math.random();
      if (waveNum >= 4 && r < 0.12) return ENEMY_TYPES[2];  // boss
      if (waveNum >= 2 && r < 0.35) return ENEMY_TYPES[1];  // gunslinger
      return ENEMY_TYPES[0];                                  // outlaw
    }

    function trySpawnEnemy() {
      const active = enemies.filter(e => e.alive).length;
      if (active >= maxSimultaneous()) return;
      // Pick a free cover
      const free = covers.filter(c => !enemies.some(e => e.alive && e.coverIdx === covers.indexOf(c)));
      if (free.length === 0) return;
      const cover = free[Math.floor(Math.random() * free.length)];
      const coverIdx = covers.indexOf(cover);
      const type = pickEnemyType();

      // Aim time gets shorter each wave
      const aimTime = type.aimTime * Math.max(0.5, 1 - (waveNum - 1) * 0.06);

      enemies.push({
        coverIdx,
        x: cover.x,
        y: cover.y,
        type,
        aimTime,
        aimFill: 0,    // 0..1
        alive: true,
        popTimer: 0,
        fired: false,
      });
    }

    function spawnWantedPoster() {
      wantedPosters.push({
        x: W * 0.1 + Math.random() * W * 0.8,
        y: PLAY_TOP + 30 + Math.random() * (GROUND_Y - PLAY_TOP - 80),
        life: 3.5,
        maxLife: 3.5,
        value: 100 + Math.floor(Math.random() * 4) * 100, // 100/200/300/400
      });
    }

    // ── Hit test ──────────────────────────────────────────────────────────────
    function headPos(enemy) {
      // Head peeks above cover
      const yOff = enemy.type.boss ? 44 : 32;
      return { x: enemy.x, y: enemy.y - yOff };
    }

    function hitRadius(enemy) {
      return enemy.type.boss ? 26 : 20;
    }

    // ── Effects ───────────────────────────────────────────────────────────────
    function addBulletHole(x, y) {
      bulletHoles.push({ x, y, r: 4 + Math.random() * 3, life: 4.0 });
    }

    function addFloater(x, y, text, color) {
      floaters.push({ x, y, text, color, life: 1.2, vy: -50 });
    }

    function addBloodParticles(x, y) {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 80;
        particles.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
          life: 0.5 + Math.random() * 0.4,
          r: 2 + Math.random() * 3,
          col: '#8B0000',
        });
      }
    }

    function addDustParticles(x, y) {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI;
        const sp = 20 + Math.random() * 50;
        particles.push({
          x, y,
          vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp,
          life: 0.4 + Math.random() * 0.3,
          r: 3 + Math.random() * 4,
          col: '#c8922a',
        });
      }
    }

    function doScreenShake() {
      shakeTimer = 350;
    }

    // ── Kill enemy ────────────────────────────────────────────────────────────
    function killEnemy(enemy, tx, ty) {
      enemy.alive = false;
      combo++;
      comboTimer = 1800;
      multiplier = combo >= 3 ? 2 : 1;

      const pts = Math.round(enemy.type.bounty * multiplier);
      score += pts;
      if (score > highScore) highScore = score;
      ctx.platform.setScore(score);

      addBulletHole(tx, ty);
      const hp = headPos(enemy);
      addBloodParticles(hp.x, hp.y);
      addFloater(hp.x, hp.y - 10, '$' + pts, ACCENT);

      sfxShoot();
      sfxDeath();
      ctx.platform.haptic(enemy.type.boss ? 'heavy' : combo >= 3 ? 'medium' : 'light');
    }

    // ── Enemy fires at player ─────────────────────────────────────────────────
    function enemyFires(enemy) {
      enemy.fired = true;
      enemy.alive = false;
      lives--;
      combo = 0;
      multiplier = 1;
      redFlash = 1.0;
      doScreenShake();
      sfxEnemyFire();
      ctx.platform.haptic('heavy');

      const hp = headPos(enemy);
      addFloater(hp.x, hp.y - 10, 'OUCH!', RED);
      addDustParticles(W / 2, GROUND_Y + 10);

      if (lives <= 0) {
        lives = 0;
        gameOver = true;
        ctx.storage.set('hs_backcountry', highScore);
        sfxGameOver();
        ctx.platform.fail({ reason: 'out of HP' });
      }
    }

    // ── Touch handling ────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();

      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // Info button
      if (Math.hypot(tx - IBTN.x, ty - IBTN.y) < IBTN.r + 8) {
        showInfo = !showInfo; return;
      }
      if (showInfo) { showInfo = false; return; }

      if (gameOver) { initGame(); sfxReload(); return; }
      if (!started) { started = true; ctx.platform.start(); sfxReload(); }

      ctx.platform.interact({ type: 'tap' });

      // Check wanted posters first
      let hitPoster = false;
      for (let i = wantedPosters.length - 1; i >= 0; i--) {
        const p = wantedPosters[i];
        if (Math.abs(tx - p.x) < 36 && Math.abs(ty - p.y) < 48) {
          const pts = p.value * multiplier;
          score += pts;
          if (score > highScore) highScore = score;
          ctx.platform.setScore(score);
          addBulletHole(tx, ty);
          addFloater(p.x, p.y, '$' + pts, '#FFD740');
          sfxBounty();
          ctx.platform.haptic('medium');
          wantedPosters.splice(i, 1);
          hitPoster = true;
          break;
        }
      }
      if (hitPoster) return;

      // Check enemies
      let hit = false;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const hp = headPos(enemy);
        if (Math.hypot(tx - hp.x, ty - hp.y) < hitRadius(enemy) + 10) {
          killEnemy(enemy, tx, ty);
          hit = true;
          break;
        }
      }

      if (!hit) {
        // Miss: bullet hole where they tapped
        addBulletHole(tx, ty);
        missFX.push({ x: tx, y: ty, life: 0.5 });
        sfxShoot();
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    // ── Init ──────────────────────────────────────────────────────────────────
    initGame();

    // ── RAF loop ──────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      const sec = dt / 1000;

      if (!gameOver && started) {
        waveSec += sec;

        // Wave escalation
        waveNum = 1 + Math.floor(waveSec / 12);

        // Spawn enemies
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          trySpawnEnemy();
          spawnTimer = spawnInterval();
        }

        // Wanted posters appear after 30s
        if (waveSec >= 30 && wantedPosters.length < 2 && Math.random() < sec * 0.4) {
          spawnWantedPoster();
        }

        // Update enemies
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          enemy.popTimer += sec;
          enemy.aimFill += sec / enemy.aimTime;
          if (enemy.aimFill >= 1.0 && !enemy.fired) {
            enemyFires(enemy);
          }
        }
        enemies = enemies.filter(e => e.alive);

        // Combo decay
        if (comboTimer > 0) {
          comboTimer -= dt;
          if (comboTimer <= 0) { combo = 0; multiplier = 1; }
        }

        // Screen shake
        if (shakeTimer > 0) {
          shakeTimer -= dt;
          const intensity = (shakeTimer / 350) * 7;
          shakeX = (Math.random() * 2 - 1) * intensity;
          shakeY = (Math.random() * 2 - 1) * intensity;
        } else {
          shakeX = 0; shakeY = 0;
        }

        // Red flash decay
        if (redFlash > 0) redFlash = Math.max(0, redFlash - sec * 2.5);

        // Update particles
        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec;
          p.vy += 200 * sec; // gravity
          p.life -= sec; return p.life > 0;
        });

        // Bullet holes decay
        bulletHoles = bulletHoles.filter(b => { b.life -= sec; return b.life > 0; });

        // Floaters
        floaters = floaters.filter(f => {
          f.y += f.vy * sec; f.life -= sec; return f.life > 0;
        });

        // Miss FX
        missFX = missFX.filter(m => { m.life -= sec; return m.life > 0; });

        // Wanted posters
        wantedPosters = wantedPosters.filter(p => { p.life -= sec; return p.life > 0; });

        ctx.platform.setProgress(Math.min(1, waveSec / 90));
      }

      // ══════════════════════════════════════════════════════════════════════
      //  DRAW
      // ══════════════════════════════════════════════════════════════════════
      g.save();
      g.translate(shakeX, shakeY);

      // ── Sky gradient ──────────────────────────────────────────────────────
      const skyGrad = g.createLinearGradient(0, PLAY_TOP, 0, GROUND_Y);
      skyGrad.addColorStop(0, SKY_TOP);
      skyGrad.addColorStop(1, SKY_BOT);
      g.fillStyle = skyGrad;
      g.fillRect(0, PLAY_TOP, W, GROUND_Y - PLAY_TOP);

      // ── Distant mesas ─────────────────────────────────────────────────────
      g.fillStyle = '#4a2e10';
      // Mesa 1 (left)
      g.beginPath();
      g.moveTo(0, GROUND_Y - 5);
      g.lineTo(0, GROUND_Y - 60);
      g.lineTo(40, GROUND_Y - 75);
      g.lineTo(90, GROUND_Y - 75);
      g.lineTo(130, GROUND_Y - 50);
      g.lineTo(W * 0.25, GROUND_Y - 5);
      g.closePath(); g.fill();
      // Mesa 2 (right)
      g.beginPath();
      g.moveTo(W * 0.62, GROUND_Y - 5);
      g.lineTo(W * 0.66, GROUND_Y - 85);
      g.lineTo(W * 0.72, GROUND_Y - 92);
      g.lineTo(W * 0.82, GROUND_Y - 88);
      g.lineTo(W * 0.88, GROUND_Y - 65);
      g.lineTo(W, GROUND_Y - 40);
      g.lineTo(W, GROUND_Y - 5);
      g.closePath(); g.fill();

      // ── Sun ───────────────────────────────────────────────────────────────
      const sunGrad = g.createRadialGradient(W * 0.82, PLAY_TOP + 28, 4, W * 0.82, PLAY_TOP + 28, 22);
      sunGrad.addColorStop(0, '#FFE080');
      sunGrad.addColorStop(1, 'rgba(255,160,40,0)');
      g.fillStyle = sunGrad;
      g.beginPath(); g.arc(W * 0.82, PLAY_TOP + 28, 22, 0, Math.PI * 2); g.fill();

      // ── Saloon facade (mid-ground) ────────────────────────────────────────
      const salX = W * 0.35, salW = W * 0.30, salY = GROUND_Y - 100, salH = 100;
      g.fillStyle = '#7a4a1e';
      g.fillRect(salX, salY, salW, salH);
      // Front board
      g.fillStyle = '#9c6030';
      g.fillRect(salX + 5, salY + 5, salW - 10, 20);
      g.fillStyle = '#5c3010';
      g.fillRect(salX, salY, salW, 8);
      // Sign
      g.fillStyle = '#c8922a';
      roundRectC(g, salX + salW * 0.2, salY + 6, salW * 0.6, 16, 3);
      g.fill();
      g.fillStyle = '#2a1a05';
      g.font = 'bold 10px serif';
      g.textAlign = 'center';
      g.fillText('SALOON', salX + salW / 2, salY + 17);
      // Windows (cover type: window)
      const winW = 30, winH = 26;
      [salX + 18, salX + salW - 18 - winW].forEach(wx => {
        g.fillStyle = '#1a3050';
        g.fillRect(wx, salY + 32, winW, winH);
        g.strokeStyle = '#7a4a1e';
        g.lineWidth = 3;
        g.strokeRect(wx, salY + 32, winW, winH);
        // Cross bar
        g.beginPath();
        g.moveTo(wx + winW / 2, salY + 32);
        g.lineTo(wx + winW / 2, salY + 32 + winH);
        g.moveTo(wx, salY + 32 + winH / 2);
        g.lineTo(wx + winW, salY + 32 + winH / 2);
        g.stroke();
      });
      // Door
      g.fillStyle = '#3a2010';
      g.fillRect(salX + salW / 2 - 12, salY + salH - 38, 24, 38);

      // ── Ground ────────────────────────────────────────────────────────────
      const groundGrad = g.createLinearGradient(0, GROUND_Y, 0, PLAY_BOT);
      groundGrad.addColorStop(0, GROUND);
      groundGrad.addColorStop(1, '#7a4a10');
      g.fillStyle = groundGrad;
      g.fillRect(0, GROUND_Y, W, PLAY_BOT - GROUND_Y + 10);

      // Dust texture lines
      g.strokeStyle = 'rgba(200,150,80,0.15)';
      g.lineWidth = 1;
      for (let gy = GROUND_Y + 10; gy < PLAY_BOT; gy += 12) {
        g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke();
      }

      // ── Cactus silhouettes ────────────────────────────────────────────────
      function drawCactus(cx, cy, scale) {
        g.fillStyle = '#3a5a20';
        // Trunk
        g.fillRect(cx - 5 * scale, cy - 55 * scale, 10 * scale, 55 * scale);
        // Left arm
        g.fillRect(cx - 22 * scale, cy - 38 * scale, 12 * scale, 8 * scale);
        g.fillRect(cx - 22 * scale, cy - 55 * scale, 8 * scale, 20 * scale);
        // Right arm
        g.fillRect(cx + 10 * scale, cy - 30 * scale, 12 * scale, 8 * scale);
        g.fillRect(cx + 14 * scale, cy - 48 * scale, 8 * scale, 22 * scale);
      }
      drawCactus(W * 0.07, GROUND_Y, 0.85);
      drawCactus(W * 0.94, GROUND_Y, 0.7);
      drawCactus(W * 0.27, GROUND_Y, 0.55);

      // ── Draw cover objects ─────────────────────────────────────────────────
      covers.forEach(cover => {
        const cx = cover.x, cy = cover.y;
        switch (cover.type) {
          case 'barrel': {
            g.fillStyle = '#5c3a10';
            roundRectC(g, cx - 16, cy - 40, 32, 40, 4);
            g.fill();
            g.strokeStyle = '#2a1a05';
            g.lineWidth = 2.5;
            g.beginPath(); g.moveTo(cx - 16, cy - 28); g.lineTo(cx + 16, cy - 28); g.stroke();
            g.beginPath(); g.moveTo(cx - 16, cy - 16); g.lineTo(cx + 16, cy - 16); g.stroke();
            // Metal rings
            g.strokeStyle = '#888';
            g.lineWidth = 2;
            g.strokeRect(cx - 16, cy - 40, 32, 40);
            break;
          }
          case 'rock': {
            g.fillStyle = '#7a6a58';
            g.beginPath();
            g.moveTo(cx - 28, cy);
            g.bezierCurveTo(cx - 32, cy - 10, cx - 24, cy - 42, cx, cy - 44);
            g.bezierCurveTo(cx + 24, cy - 42, cx + 32, cy - 10, cx + 28, cy);
            g.closePath(); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.08)';
            g.beginPath();
            g.moveTo(cx - 14, cy - 36);
            g.bezierCurveTo(cx - 6, cy - 44, cx + 4, cy - 42, cx + 8, cy - 34);
            g.closePath(); g.fill();
            break;
          }
          case 'window': {
            // These map to the saloon windows — drawn already above
            // Draw a sill / ledge
            g.fillStyle = '#7a4a1e';
            g.fillRect(cx - 20, cy - 2, 40, 6);
            break;
          }
          case 'crate': {
            g.fillStyle = '#9c7a3a';
            g.fillRect(cx - 20, cy - 38, 40, 38);
            g.strokeStyle = '#5c3a10';
            g.lineWidth = 2;
            g.strokeRect(cx - 20, cy - 38, 40, 38);
            // X brace
            g.beginPath();
            g.moveTo(cx - 20, cy - 38); g.lineTo(cx + 20, cy);
            g.moveTo(cx + 20, cy - 38); g.lineTo(cx - 20, cy);
            g.stroke();
            break;
          }
        }
      });

      // ── Bullet holes ──────────────────────────────────────────────────────
      bulletHoles.forEach(b => {
        const a = Math.min(1, b.life / 1.0);
        g.globalAlpha = a * 0.85;
        g.fillStyle = '#111';
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
        // Crack ring
        g.strokeStyle = '#5c3a10';
        g.lineWidth = 1.5;
        g.globalAlpha = a * 0.5;
        g.beginPath(); g.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      });

      // ── Wanted posters ─────────────────────────────────────────────────────
      wantedPosters.forEach(p => {
        const fade = Math.min(1, p.life / 0.5) * Math.min(1, (p.maxLife - p.life + 0.3) / 0.3);
        g.globalAlpha = fade;
        // Paper
        g.fillStyle = '#e8d090';
        roundRectC(g, p.x - 36, p.y - 48, 72, 96, 4);
        g.fill();
        g.strokeStyle = '#8B6010';
        g.lineWidth = 2;
        roundRectC(g, p.x - 36, p.y - 48, 72, 96, 4);
        g.stroke();
        // Title
        g.fillStyle = '#8B0000';
        g.font = 'bold 10px serif';
        g.textAlign = 'center';
        g.fillText('WANTED', p.x, p.y - 33);
        // Silhouette (simple bust)
        g.fillStyle = '#5c3010';
        g.beginPath(); g.arc(p.x, p.y - 14, 12, 0, Math.PI * 2); g.fill();
        g.fillRect(p.x - 14, p.y - 3, 28, 22);
        // Value
        g.fillStyle = '#8B0000';
        g.font = 'bold 9px serif';
        g.fillText('$' + p.value, p.x, p.y + 36);
        // Pulse border
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
        g.strokeStyle = `rgba(255,100,0,${pulse * 0.8})`;
        g.lineWidth = 3;
        roundRectC(g, p.x - 36, p.y - 48, 72, 96, 4);
        g.stroke();
        g.globalAlpha = 1;
        g.textAlign = 'left';
      });

      // ── Draw enemies ──────────────────────────────────────────────────────
      enemies.forEach(enemy => {
        if (!enemy.alive) return;
        const hp = headPos(enemy);
        const hx = hp.x, hy = hp.y;
        const type = enemy.type;

        // Aim arc (red danger meter)
        if (enemy.aimFill > 0) {
          const arcR = hitRadius(enemy) + 8;
          const startA = -Math.PI / 2;
          const endA   = startA + enemy.aimFill * Math.PI * 2;

          // Background arc
          g.strokeStyle = 'rgba(60,20,10,0.5)';
          g.lineWidth = 4;
          g.beginPath(); g.arc(hx, hy, arcR, 0, Math.PI * 2); g.stroke();

          // Fill arc
          const danger = enemy.aimFill;
          const r = Math.floor(220 + 35 * danger);
          const gb = Math.floor(60 * (1 - danger));
          g.strokeStyle = `rgb(${r},${gb},${gb})`;
          g.lineWidth = 4;
          g.lineCap = 'round';
          g.beginPath(); g.arc(hx, hy, arcR, startA, endA); g.stroke();
          g.lineCap = 'butt';
        }

        // Head shadow
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.ellipse(hx, hy + 3, 16, 6, 0, 0, Math.PI * 2); g.fill();

        // Neck/shirt peek
        g.fillStyle = type.color;
        g.fillRect(hx - 7, hy + 10, 14, 12);

        // Head
        g.fillStyle = type.color;
        g.beginPath();
        g.arc(hx, hy, type.boss ? 20 : 16, 0, Math.PI * 2);
        g.fill();

        // Eyes (white + black dot)
        g.fillStyle = '#fff';
        g.fillRect(hx - 8, hy - 5, 6, 5);
        g.fillRect(hx + 2, hy - 5, 6, 5);
        g.fillStyle = '#111';
        g.fillRect(hx - 6, hy - 4, 3, 3);
        g.fillRect(hx + 4, hy - 4, 3, 3);

        // Angry brow for high-danger
        if (enemy.aimFill > 0.5) {
          g.strokeStyle = '#111';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(hx - 9, hy - 7); g.lineTo(hx - 3, hy - 5);
          g.moveTo(hx + 9, hy - 7); g.lineTo(hx + 3, hy - 5);
          g.stroke();
        }

        // Stubble for boss
        if (type.boss) {
          g.fillStyle = 'rgba(0,0,0,0.3)';
          for (let i = 0; i < 6; i++) {
            g.fillRect(hx - 14 + i * 5, hy + 4, 2, 4);
          }
        }

        // Hat
        const hatH = type.boss ? 28 : 22;
        const hatW = type.boss ? 46 : 36;
        const brimH = 5;
        // Brim
        g.fillStyle = type.hatColor;
        g.beginPath();
        g.ellipse(hx, hy - (type.boss ? 16 : 12), hatW / 2 + 4, brimH, 0, 0, Math.PI * 2);
        g.fill();
        // Crown
        roundRectC(g, hx - hatW / 2, hy - (type.boss ? 16 : 12) - hatH, hatW, hatH, 3);
        g.fill();
        // Hat band
        g.fillStyle = type.boss ? '#cc0000' : '#8B6010';
        g.fillRect(hx - hatW / 2, hy - (type.boss ? 16 : 12) - 8, hatW, 5);

        // Gunslinger badge (fast type): white star
        if (type.id === 'gunslinger') {
          g.fillStyle = '#FFD740';
          g.font = '10px sans-serif';
          g.textAlign = 'center';
          g.fillText('★', hx, hy + 20);
        }

        // Boss skull on hat band
        if (type.boss) {
          g.fillStyle = '#fff';
          g.font = '9px sans-serif';
          g.textAlign = 'center';
          g.fillText('☠', hx, hy - (type.boss ? 16 : 12) - 4);
        }
        g.textAlign = 'left';
      });

      // ── Particles ─────────────────────────────────────────────────────────
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5) * 0.85;
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      });
      g.globalAlpha = 1;

      // ── Miss FX ────────────────────────────────────────────────────────────
      missFX.forEach(m => {
        const a = m.life / 0.5;
        g.globalAlpha = a * 0.7;
        g.fillStyle = '#fff';
        g.font = '13px serif';
        g.textAlign = 'center';
        g.fillText('miss', m.x, m.y - 8);
        g.textAlign = 'left';
      });
      g.globalAlpha = 1;

      // ── Floaters ──────────────────────────────────────────────────────────
      floaters.forEach(f => {
        const a = Math.min(1, f.life / 0.4);
        g.globalAlpha = a;
        g.fillStyle = f.color;
        g.font = 'bold 18px serif';
        g.textAlign = 'center';
        g.fillText(f.text, f.x, f.y);
        g.textAlign = 'left';
      });
      g.globalAlpha = 1;

      // ── Red hit flash ─────────────────────────────────────────────────────
      if (redFlash > 0) {
        g.fillStyle = `rgba(180,0,0,${redFlash * 0.35})`;
        g.fillRect(0, PLAY_TOP, W, PLAY_BOT - PLAY_TOP);
      }

      // ── HUD ───────────────────────────────────────────────────────────────
      g.fillStyle = '#100a04';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = '#7a4a1e';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      // Score ($ amount)
      g.fillStyle = ACCENT;
      g.font = 'bold 18px serif';
      g.textAlign = 'left';
      g.fillText('$' + score, 14, 24);

      // High score
      g.fillStyle = '#8B6010';
      g.font = '11px serif';
      g.fillText('BEST $' + highScore, 14, 42);

      // Lives (sheriff stars)
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i < lives ? '#FFD740' : '#3a2010';
        g.font = '18px sans-serif';
        g.textAlign = 'center';
        g.fillText('★', W / 2 - 44 + i * 22, 30);
      }

      // Bounty multiplier
      if (multiplier > 1) {
        g.fillStyle = RED;
        g.font = 'bold 14px serif';
        g.textAlign = 'center';
        g.fillText(multiplier + 'x BOUNTY', W / 2, 46);
      } else if (combo >= 2 && comboTimer > 0) {
        g.fillStyle = '#cc8800';
        g.font = '11px serif';
        g.textAlign = 'center';
        g.fillText(combo + ' KILLS', W / 2, 46);
      }

      // Wave indicator
      g.fillStyle = '#7a4a1e';
      g.font = '11px serif';
      g.textAlign = 'right';
      g.fillText('WAVE ' + waveNum, W - 50, 42);

      // Info button
      g.fillStyle = '#1e1008';
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a4a1e';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ACCENT;
      g.font = 'bold 14px serif';
      g.textAlign = 'center';
      g.fillText('i', IBTN.x, IBTN.y + 5);
      g.textAlign = 'left';

      g.restore(); // end shake transform

      // ── Info overlay ────────────────────────────────────────────────────────
      if (showInfo) {
        g.fillStyle = 'rgba(10,5,0,0.92)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 22px serif';
        g.textAlign = 'center';
        g.fillText('BACKCOUNTRY', W / 2, H / 2 - 130);
        g.fillStyle = '#e8d090';
        g.font = '15px serif';
        const lines = [
          'TAP outlaws before they shoot!',
          '',
          'Aim meter fills around enemy head.',
          'If it fills → they shoot you!',
          '',
          '★ = sheriff stars (HP)',
          '$ = bounty earned',
          '',
          'Kill 3+ fast = 2x BOUNTY multiplier',
          '',
          'After 30s: WANTED POSTERS appear.',
          'Tap them for bonus $$$!',
          '',
          'Enemies get faster each wave.',
        ];
        lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 - 85 + i * 22));
        g.fillStyle = '#8B6010';
        g.font = '13px serif';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, H / 2 + 180);
        g.textAlign = 'left';
        return;
      }

      // ── Start overlay ──────────────────────────────────────────────────────
      if (!started) {
        g.fillStyle = 'rgba(10,5,0,0.72)';
        g.fillRect(0, HUD_H, W, H - HUD_H);

        // Title plate
        g.fillStyle = '#7a4a1e';
        roundRectC(g, W / 2 - 130, H / 2 - 65, 260, 55, 8);
        g.fill();
        g.strokeStyle = ACCENT;
        g.lineWidth = 2;
        roundRectC(g, W / 2 - 130, H / 2 - 65, 260, 55, 8);
        g.stroke();

        g.fillStyle = ACCENT;
        g.font = 'bold 30px serif';
        g.textAlign = 'center';
        g.fillText('BACKCOUNTRY', W / 2, H / 2 - 30);

        g.fillStyle = '#e8d090';
        g.font = '15px serif';
        g.fillText('Tap the outlaws — fast!', W / 2, H / 2 + 10);
        g.fillText('Don\'t let them aim at you.', W / 2, H / 2 + 32);

        // Pulsing tap prompt
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
        g.fillStyle = `rgba(255,215,64,${0.6 + 0.4 * pulse})`;
        g.font = 'bold 16px serif';
        g.fillText('★  TAP TO DRAW  ★', W / 2, H / 2 + 76);
        g.textAlign = 'left';
      }

      // ── Game over overlay ───────────────────────────────────────────────────
      if (gameOver) {
        g.fillStyle = 'rgba(10,5,0,0.82)';
        g.fillRect(0, HUD_H, W, H - HUD_H);

        g.fillStyle = RED;
        g.font = 'bold 36px serif';
        g.textAlign = 'center';
        g.fillText('SHOT DOWN!', W / 2, H / 2 - 55);

        g.fillStyle = '#e8d090';
        g.font = '14px serif';
        g.fillText('The outlaws got you, partner.', W / 2, H / 2 - 20);

        g.fillStyle = ACCENT;
        g.font = 'bold 22px serif';
        g.fillText('BOUNTY: $' + score, W / 2, H / 2 + 16);

        g.fillStyle = '#c8922a';
        g.font = '15px serif';
        g.fillText('BEST: $' + highScore, W / 2, H / 2 + 44);

        const pulse2 = 0.5 + 0.5 * Math.sin(Date.now() / 500);
        g.fillStyle = `rgba(232,208,144,${0.6 + 0.4 * pulse2})`;
        g.font = 'bold 15px serif';
        g.fillText('TAP TO RIDE AGAIN', W / 2, H / 2 + 85);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
