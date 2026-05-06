// SWAGSHOT — Space Station Reclamation Shooter (Plethora Bit)

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
    title: 'SWAGSHOT',
    author: 'plethora',
    description: 'Reclaim your station. Shoot everything.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea ? ctx.safeArea.bottom : 0;
    const CX = W / 2, CY = H / 2;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ─── Audio ───────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function noise(dur, vol = 0.3, freq = 0) {
      if (!audioCtx) return;
      const sr = audioCtx.sampleRate;
      const buf = audioCtx.createBuffer(1, Math.ceil(sr * dur), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      src.buffer = buf;
      src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      if (freq) {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        src.disconnect(); src.connect(filter); filter.connect(gain);
      }
      src.start();
    }

    function tone(freq, type, dur, vol = 0.3, bend = 0) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(10, freq + bend), audioCtx.currentTime + dur);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }

    function playSFXShoot() {
      tone(1400, 'sawtooth', 0.07, 0.18, -900);
    }
    function playSFXEnemyDeath() {
      noise(0.18, 0.35, 2200);
      tone(300, 'square', 0.12, 0.1, -150);
    }
    function playSFXWaveClear() {
      [440, 554, 659, 880].forEach((f, i) => {
        ctx.timeout(() => tone(f, 'sine', 0.25, 0.22), i * 110);
      });
    }
    function playSFXGameOver() {
      [440, 330, 220, 110].forEach((f, i) => {
        ctx.timeout(() => tone(f, 'sawtooth', 0.3, 0.28), i * 140);
      });
    }
    function playSFXHit() {
      tone(180, 'square', 0.09, 0.15, -60);
    }

    // Ambient hum
    let ambientNode = null;
    function startAmbient() {
      if (!audioCtx || ambientNode) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 55;
      gain.gain.value = 0.04;
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start();
      ambientNode = { osc, gain };
    }

    // ─── State ────────────────────────────────────────────────────────────────
    const MAX_AMMO = 12;
    const AMMO_REFILL_MS = 2000;

    let state = 'title'; // title | playing | waveclear | gameover
    let started = false;
    let wave = 0;
    let score = 0;
    let highScore = ctx.storage.get('swagshot_hs') || 0;
    let enemies = [];
    let bullets = [];
    let particles = [];
    let scorchMarks = [];
    let turretAngle = -Math.PI / 2;
    let ammo = MAX_AMMO;
    let ammoRefillingAt = null;
    let waveClearTimer = 0;
    let waveClearPhase = 0; // 0=fade-in text, 1=hold, 2=fade out
    let showInfo = false;
    let gameOverTimer = 0;
    let frameTime = 0;

    // Blueprint room layout — corridor lines per wave (cycling)
    const LAYOUTS = [
      // Wave 1: simple cross
      [
        [0.2, 0.1, 0.8, 0.1], [0.2, 0.9, 0.8, 0.9],
        [0.1, 0.2, 0.1, 0.8], [0.9, 0.2, 0.9, 0.8],
        [0.5, 0.1, 0.5, 0.4], [0.5, 0.6, 0.5, 0.9],
        [0.1, 0.5, 0.4, 0.5], [0.6, 0.5, 0.9, 0.5],
      ],
      // Wave 2: offset corridors
      [
        [0.15, 0.15, 0.85, 0.15], [0.15, 0.85, 0.85, 0.85],
        [0.15, 0.15, 0.15, 0.85], [0.85, 0.15, 0.85, 0.85],
        [0.35, 0.15, 0.35, 0.5],  [0.65, 0.5, 0.65, 0.85],
        [0.15, 0.35, 0.5, 0.35],  [0.5, 0.65, 0.85, 0.65],
      ],
      // Wave 3: hexagonal
      [
        [0.3, 0.1, 0.7, 0.1], [0.7, 0.1, 0.95, 0.5],
        [0.95, 0.5, 0.7, 0.9], [0.7, 0.9, 0.3, 0.9],
        [0.3, 0.9, 0.05, 0.5], [0.05, 0.5, 0.3, 0.1],
        [0.3, 0.1, 0.5, 0.35], [0.7, 0.1, 0.5, 0.35],
        [0.05, 0.5, 0.35, 0.5], [0.95, 0.5, 0.65, 0.5],
      ],
      // Wave 4: grid
      [
        [0.1, 0.1, 0.9, 0.1], [0.1, 0.5, 0.9, 0.5], [0.1, 0.9, 0.9, 0.9],
        [0.1, 0.1, 0.1, 0.9], [0.5, 0.1, 0.5, 0.9], [0.9, 0.1, 0.9, 0.9],
      ],
    ];

    function getLayout() {
      return LAYOUTS[(wave - 1) % LAYOUTS.length];
    }

    // ─── Enemy factory ────────────────────────────────────────────────────────
    const ENEMY_TYPES = {
      walker: { hp: 1, speed: 60,  size: 14, color: '#FF4422', scoreVal: 100, sides: 4 },
      rusher: { hp: 1, speed: 130, size: 10, color: '#FF8800', scoreVal: 150, sides: 3 },
      tank:   { hp: 3, speed: 38,  size: 20, color: '#CC2200', scoreVal: 300, sides: 6 },
      splitter: { hp: 2, speed: 70, size: 16, color: '#FF2288', scoreVal: 200, sides: 5 },
    };

    function spawnEnemy(type, x, y) {
      const cfg = ENEMY_TYPES[type];
      return {
        type, x, y,
        hp: cfg.hp, maxHp: cfg.hp,
        speed: cfg.speed * (1 + (wave - 1) * 0.08),
        size: cfg.size,
        color: cfg.color,
        scoreVal: cfg.scoreVal,
        sides: cfg.sides,
        angle: Math.atan2(CY - y, CX - x),
        hitFlash: 0,
        wobble: Math.random() * Math.PI * 2,
      };
    }

    function edgeSpawn() {
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      const M = 30;
      if (edge === 0) { x = Math.random() * W; y = -M; }
      else if (edge === 1) { x = W + M; y = Math.random() * H; }
      else if (edge === 2) { x = Math.random() * W; y = H + M; }
      else { x = -M; y = Math.random() * H; }
      return { x, y };
    }

    function waveEnemyCount() { return 5 + wave * 3; }

    function buildWave() {
      enemies = [];
      bullets = [];
      const count = waveEnemyCount();
      const typePool = ['walker', 'walker', 'rusher', 'rusher'];
      if (wave >= 2) typePool.push('tank');
      if (wave >= 3) typePool.push('splitter', 'splitter');

      for (let i = 0; i < count; i++) {
        const pos = edgeSpawn();
        const type = typePool[Math.floor(Math.random() * typePool.length)];
        enemies.push(spawnEnemy(type, pos.x, pos.y));
      }
    }

    function startWave() {
      wave++;
      buildWave();
      state = 'playing';
      ammo = MAX_AMMO;
      ammoRefillingAt = null;
    }

    // ─── Particles ────────────────────────────────────────────────────────────
    function spawnExplosion(x, y, color, n = 14) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 160;
        particles.push({
          kind: 'spark',
          x, y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          life: 0.4 + Math.random() * 0.4,
          maxLife: 0.8,
          color,
          size: 2 + Math.random() * 3,
        });
      }
      // debris squares
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 30 + Math.random() * 80;
        particles.push({
          kind: 'debris',
          x, y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          life: 0.6 + Math.random() * 0.5,
          maxLife: 1.1,
          color,
          size: 3 + Math.random() * 4,
          rot: Math.random() * Math.PI,
          rotV: (Math.random() - 0.5) * 8,
        });
      }
      // scorch mark
      scorchMarks.push({ x, y, r: 8 + Math.random() * 8, alpha: 0.55 });
      if (scorchMarks.length > 40) scorchMarks.shift();
    }

    function spawnBulletHit(x, y) {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          kind: 'spark', x, y,
          vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
          life: 0.2, maxLife: 0.2,
          color: '#FFFFAA', size: 2,
        });
      }
    }

    // ─── Shooting ─────────────────────────────────────────────────────────────
    const AIM_ASSIST_DEG = 15;
    const AIM_ASSIST_RAD = AIM_ASSIST_DEG * Math.PI / 180;
    const AIM_ASSIST_RANGE = Math.max(W, H) * 0.9;

    function fireAt(tx, ty) {
      if (ammo <= 0) return;
      ammo--;
      if (ammo === 0) ammoRefillingAt = null; // will be set in update

      let angle = Math.atan2(ty - CY, tx - CX);
      turretAngle = angle;

      // Auto-aim snap
      let bestDelta = AIM_ASSIST_RAD;
      let bestAngle = angle;
      for (const en of enemies) {
        const dx = en.x - CX, dy = en.y - CY;
        const dist = Math.hypot(dx, dy);
        if (dist > AIM_ASSIST_RANGE) continue;
        const ea = Math.atan2(dy, dx);
        let delta = Math.abs(ea - angle);
        if (delta > Math.PI) delta = Math.PI * 2 - delta;
        if (delta < bestDelta) { bestDelta = delta; bestAngle = ea; }
      }

      const BSPD = 600;
      bullets.push({
        x: CX + Math.cos(bestAngle) * 18,
        y: CY + Math.sin(bestAngle) * 18,
        vx: Math.cos(bestAngle) * BSPD,
        vy: Math.sin(bestAngle) * BSPD,
        angle: bestAngle,
        life: 1.5,
      });
      playSFXShoot();
    }

    // ─── Input ────────────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) {
        started = true;
        ctx.platform.start();
        startAmbient();
      }

      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // Info button tap
      const di = Math.hypot(tx - (W - 22), ty - 22);
      if (di < 20) { showInfo = !showInfo; return; }
      if (showInfo) { showInfo = false; return; }

      if (state === 'title') {
        state = 'waveclear';
        waveClearTimer = 0;
        waveClearPhase = 0;
        wave = 0;
        score = 0;
        scorchMarks = [];
        return;
      }
      if (state === 'gameover') {
        if (gameOverTimer > 600) {
          state = 'title';
          wave = 0; score = 0; scorchMarks = [];
        }
        return;
      }
      if (state === 'waveclear') return;
      if (state === 'playing') {
        fireAt(tx, ty);
        ctx.platform.haptic('light');
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    // ─── Update helpers ───────────────────────────────────────────────────────
    function updateEnemies(dt) {
      const dtS = dt / 1000;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        // Move toward center
        en.angle = Math.atan2(CY - en.y, CX - en.x);
        en.x += Math.cos(en.angle) * en.speed * dtS;
        en.y += Math.sin(en.angle) * en.speed * dtS;
        en.wobble += dtS * 3;
        if (en.hitFlash > 0) en.hitFlash -= dtS * 4;

        // Reached center — game over
        if (Math.hypot(en.x - CX, en.y - CY) < 22) {
          spawnExplosion(CX, CY, '#FF4422', 22);
          playSFXGameOver();
          ctx.platform.fail({ reason: 'overrun' });
          state = 'gameover';
          gameOverTimer = 0;
          ctx.platform.setScore(score);
          if (score > highScore) {
            highScore = score;
            ctx.storage.set('swagshot_hs', highScore);
          }
          return;
        }
      }
    }

    function updateBullets(dt) {
      const dtS = dt / 1000;
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dtS;
        b.y += b.vy * dtS;
        b.life -= dtS;
        if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
          bullets.splice(i, 1);
          continue;
        }
        // Collision with enemies
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (Math.hypot(b.x - en.x, b.y - en.y) < en.size + 4) {
            spawnBulletHit(b.x, b.y);
            en.hp--;
            en.hitFlash = 1;
            playSFXHit();
            bullets.splice(i, 1);
            hit = true;
            if (en.hp <= 0) {
              spawnExplosion(en.x, en.y, en.color, 16);
              playSFXEnemyDeath();
              // Splitter spawns two small walkers
              if (en.type === 'splitter') {
                for (let k = 0; k < 2; k++) {
                  const off = k === 0 ? -0.4 : 0.4;
                  const se = spawnEnemy('rusher', en.x + Math.cos(en.angle + off) * 20, en.y + Math.sin(en.angle + off) * 20);
                  se.size = 7;
                  se.speed *= 1.3;
                  se.scoreVal = 60;
                  enemies.push(se);
                }
              }
              score += en.scoreVal * wave;
              ctx.platform.setScore(score);
              enemies.splice(j, 1);
              ctx.platform.haptic('medium');
            }
            break;
          }
        }
        if (hit) continue;
      }
    }

    function updateParticles(dt) {
      const dtS = dt / 1000;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dtS;
        p.y += p.vy * dtS;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= dtS;
        if (p.kind === 'debris') p.rot += p.rotV * dtS;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }

    function updateAmmoRefill(dt) {
      if (ammo < MAX_AMMO) {
        if (ammoRefillingAt === null) ammoRefillingAt = frameTime + AMMO_REFILL_MS;
        if (frameTime >= ammoRefillingAt) {
          ammo = MAX_AMMO;
          ammoRefillingAt = null;
        }
      }
    }

    // ─── Draw helpers ─────────────────────────────────────────────────────────
    function drawBlueprint() {
      const layout = getLayout();
      const now = frameTime / 1000;

      // Scorch marks on floor
      for (const sm of scorchMarks) {
        const grad = g.createRadialGradient(sm.x, sm.y, 0, sm.x, sm.y, sm.r);
        grad.addColorStop(0, `rgba(80,20,0,${sm.alpha})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(sm.x, sm.y, sm.r, 0, Math.PI * 2);
        g.fill();
      }

      // Glow corridor lines
      g.save();
      g.shadowColor = '#00CFFF';
      g.shadowBlur = 8;
      g.strokeStyle = '#00CFFF';
      g.lineWidth = 1.5;
      g.globalAlpha = 0.55 + 0.1 * Math.sin(now * 1.3);
      for (const ln of layout) {
        g.beginPath();
        g.moveTo(ln[0] * W, ln[1] * H);
        g.lineTo(ln[2] * W, ln[3] * H);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.restore();

      // Corner nodes
      g.save();
      g.shadowColor = '#00CFFF';
      g.shadowBlur = 12;
      g.fillStyle = '#00CFFF';
      for (const ln of layout) {
        g.beginPath(); g.arc(ln[0] * W, ln[1] * H, 3, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(ln[2] * W, ln[3] * H, 3, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    function drawEnemies() {
      const now = frameTime / 1000;
      for (const en of enemies) {
        g.save();
        g.translate(en.x, en.y);
        g.rotate(en.wobble);

        const flash = en.hitFlash > 0 ? en.hitFlash : 0;
        const col = flash > 0.5 ? '#FFFFFF' : en.color;

        g.shadowColor = col;
        g.shadowBlur = 10 + flash * 10;

        // Draw polygon
        g.beginPath();
        for (let i = 0; i <= en.sides; i++) {
          const a = (i / en.sides) * Math.PI * 2 - Math.PI / en.sides;
          const r = en.size;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.stroke();

        // HP bar (only for tanks)
        if (en.maxHp > 1) {
          const bw = en.size * 2, bh = 4;
          const bx = -bw / 2, by = en.size + 4;
          g.fillStyle = '#330000';
          roundRectC(g, bx, by, bw, bh, 2);
          g.fill();
          g.fillStyle = '#FF4422';
          roundRectC(g, bx, by, bw * (en.hp / en.maxHp), bh, 2);
          g.fill();
        }

        g.restore();
      }
    }

    function drawBullets() {
      for (const b of bullets) {
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.angle);

        g.shadowColor = '#FFFFAA';
        g.shadowBlur = 8;

        // Streak
        g.strokeStyle = '#FFFFFF';
        g.lineWidth = 2.5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-14, 0);
        g.lineTo(4, 0);
        g.stroke();

        // Hot tip
        g.fillStyle = '#FFD740';
        g.beginPath();
        g.arc(4, 0, 3, 0, Math.PI * 2);
        g.fill();

        g.restore();
      }
    }

    function drawParticles() {
      for (const p of particles) {
        const alpha = Math.max(0, p.life / p.maxLife);
        g.save();
        g.globalAlpha = alpha;
        if (p.kind === 'spark') {
          g.shadowColor = p.color;
          g.shadowBlur = 6;
          g.fillStyle = p.color;
          g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else {
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        }
        g.restore();
      }
      g.globalAlpha = 1;
    }

    function drawTurret() {
      g.save();
      g.translate(CX, CY);

      // Base ring
      g.shadowColor = '#00CFFF';
      g.shadowBlur = 16;
      g.strokeStyle = '#00CFFF';
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.stroke();

      g.strokeStyle = 'rgba(0,207,255,0.25)';
      g.lineWidth = 1;
      g.beginPath(); g.arc(0, 0, 28, 0, Math.PI * 2); g.stroke();

      // Barrel
      g.rotate(turretAngle);
      g.strokeStyle = '#00CFFF';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.shadowBlur = 12;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(22, 0);
      g.stroke();

      // Core dot
      g.fillStyle = '#FFD740';
      g.shadowColor = '#FFD740';
      g.shadowBlur = 10;
      g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();

      g.restore();
    }

    function drawEdgeIndicators() {
      // Show arrows at edges where enemies will enter / are approaching from
      const DIST_THRESH = Math.max(W, H) * 0.55;
      const indicatorSet = new Set();
      for (const en of enemies) {
        const dx = en.x - CX, dy = en.y - CY;
        const dist = Math.hypot(dx, dy);
        if (dist < DIST_THRESH) continue; // already on screen
        const angle = Math.atan2(dy, dx);
        const sector = Math.round(angle / (Math.PI / 4));
        indicatorSet.add(sector);
      }

      const PAD = 18;
      g.save();
      g.fillStyle = '#FF4422';
      g.shadowColor = '#FF4422';
      g.shadowBlur = 8;
      for (const sector of indicatorSet) {
        const a = sector * (Math.PI / 4);
        const ca = Math.cos(a), sa = Math.sin(a);
        // Clamp to edge
        let ex, ey;
        const absX = Math.abs(ca), absY = Math.abs(sa);
        if (absX > absY) {
          ex = ca > 0 ? W - PAD : PAD;
          ey = CY + sa / absX * (CY - PAD);
        } else {
          ey = sa > 0 ? H - PAD - SAFE : PAD;
          ex = CX + ca / absY * (CX - PAD);
        }
        ex = Math.max(PAD, Math.min(W - PAD, ex));
        ey = Math.max(PAD, Math.min(H - PAD - SAFE, ey));

        // Draw small triangle arrow pointing inward
        g.save();
        g.translate(ex, ey);
        g.rotate(a + Math.PI); // point inward
        g.beginPath();
        g.moveTo(7, 0); g.lineTo(-5, 5); g.lineTo(-5, -5);
        g.closePath(); g.fill();
        g.restore();
      }
      g.restore();
    }

    function drawHUD() {
      const HH = 48;
      const py = H - SAFE - HH - 4;

      // HUD background bar
      g.save();
      g.globalAlpha = 0.75;
      g.fillStyle = '#050518';
      roundRectC(g, 8, py, W - 16, HH, 8);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = '#00CFFF';
      g.lineWidth = 1;
      roundRectC(g, 8, py, W - 16, HH, 8);
      g.stroke();
      g.restore();

      // Wave
      g.font = 'bold 11px "Courier New"';
      g.fillStyle = '#00CFFF';
      g.textAlign = 'left';
      g.fillText('WAVE', 18, py + 16);
      g.font = 'bold 22px "Courier New"';
      g.fillStyle = '#FFD740';
      g.fillText(wave, 18, py + 40);

      // Enemies remaining
      const remaining = enemies.length;
      g.font = 'bold 11px "Courier New"';
      g.fillStyle = '#00CFFF';
      g.textAlign = 'center';
      g.fillText('ENEMIES', W / 2, py + 16);
      g.font = 'bold 22px "Courier New"';
      g.fillStyle = remaining > 0 ? '#FF4422' : '#44FF88';
      g.fillText(remaining, W / 2, py + 40);

      // Score
      g.font = 'bold 11px "Courier New"';
      g.fillStyle = '#00CFFF';
      g.textAlign = 'right';
      g.fillText('SCORE', W - 18, py + 16);
      g.font = 'bold 18px "Courier New"';
      g.fillStyle = '#FFD740';
      g.fillText(score, W - 18, py + 40);

      // Ammo bar
      const ammoY = py - 14;
      const ammoW = W - 32;
      const ammoH = 7;
      g.fillStyle = '#111130';
      roundRectC(g, 16, ammoY, ammoW, ammoH, 3);
      g.fill();

      // Refill progress or ammo segments
      if (ammoRefillingAt !== null) {
        const elapsed = Math.max(0, ammoRefillingAt - frameTime);
        const prog = 1 - elapsed / AMMO_REFILL_MS;
        g.fillStyle = '#FFD740';
        g.globalAlpha = 0.6 + 0.4 * Math.sin(frameTime / 100);
        roundRectC(g, 16, ammoY, ammoW * prog, ammoH, 3);
        g.fill();
        g.globalAlpha = 1;
        g.font = 'bold 9px "Courier New"';
        g.fillStyle = '#FFD740';
        g.textAlign = 'center';
        g.fillText('RELOADING', W / 2, ammoY - 2);
      } else {
        const segW = (ammoW - (MAX_AMMO - 1) * 2) / MAX_AMMO;
        for (let i = 0; i < MAX_AMMO; i++) {
          const sx = 16 + i * (segW + 2);
          g.fillStyle = i < ammo ? '#00CFFF' : '#1A1A3A';
          roundRectC(g, sx, ammoY, segW, ammoH, 2);
          g.fill();
        }
      }

      g.textAlign = 'left';

      // Info button
      g.save();
      g.shadowColor = '#00CFFF';
      g.shadowBlur = 8;
      g.strokeStyle = '#00CFFF';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(W - 22, 22, 14, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#00CFFF';
      g.font = 'bold 14px serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', W - 22, 22);
      g.textBaseline = 'alphabetic';
      g.restore();
    }

    function drawInfoOverlay() {
      g.save();
      g.fillStyle = 'rgba(5,5,24,0.92)';
      roundRectC(g, 20, 50, W - 40, H - 100 - SAFE, 12);
      g.fill();
      g.strokeStyle = '#00CFFF';
      g.lineWidth = 1.5;
      roundRectC(g, 20, 50, W - 40, H - 100 - SAFE, 12);
      g.stroke();

      g.fillStyle = '#FFD740';
      g.font = 'bold 18px "Courier New"';
      g.textAlign = 'center';
      g.fillText('SWAGSHOT', W / 2, 80);

      g.fillStyle = '#00CFFF';
      g.font = '13px "Courier New"';
      const lines = [
        '• TAP to fire at target',
        '• 15° auto-aim assist',
        '• 12 shots — reloads in 2s',
        '',
        'ENEMIES:',
        '  WALKER  — standard, 1 HP',
        '  RUSHER  — fast, 1 HP',
        '  TANK    — slow, 3 HP',
        '  SPLITTER— splits on death',
        '',
        'Kill all enemies to reclaim',
        'the station section.',
        '',
        '5 + wave×3 enemies per wave',
      ];
      lines.forEach((ln, i) => {
        g.fillStyle = ln.startsWith('ENEMIES') ? '#FFD740' : '#00CFFF';
        g.fillText(ln, W / 2, 106 + i * 18);
      });

      g.fillStyle = '#FF4422';
      g.font = 'bold 12px "Courier New"';
      g.fillText('TAP ANYWHERE TO CLOSE', W / 2, H - 95 - SAFE);
      g.restore();
    }

    function drawWaveClear(alpha) {
      g.save();
      g.globalAlpha = alpha;
      // Vignette flash
      const grad = g.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.7);
      grad.addColorStop(0, 'rgba(0,60,80,0.0)');
      grad.addColorStop(1, `rgba(0,207,255,${alpha * 0.35})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);

      g.shadowColor = '#00CFFF';
      g.shadowBlur = 24;
      g.fillStyle = '#00CFFF';
      g.font = 'bold 28px "Courier New"';
      g.textAlign = 'center';
      g.fillText('SECTION RECLAIMED', W / 2, H / 2 - 20);

      g.shadowColor = '#FFD740';
      g.shadowBlur = 16;
      g.fillStyle = '#FFD740';
      g.font = 'bold 22px "Courier New"';
      g.fillText('WAVE ' + wave + ' CLEAR', W / 2, H / 2 + 16);

      if (wave > 0) {
        g.font = '14px "Courier New"';
        g.fillStyle = '#AAFFEE';
        g.shadowBlur = 0;
        g.fillText('SCORE  ' + score, W / 2, H / 2 + 46);
      }
      g.restore();
      g.textAlign = 'left';
    }

    function drawTitle() {
      // Dim overlay
      g.fillStyle = 'rgba(5,5,24,0.82)';
      g.fillRect(0, 0, W, H);

      g.save();
      g.shadowColor = '#00CFFF';
      g.shadowBlur = 30;
      g.fillStyle = '#00CFFF';
      g.font = 'bold 40px "Courier New"';
      g.textAlign = 'center';
      g.fillText('SWAGSHOT', W / 2, H / 2 - 70);
      g.restore();

      g.save();
      g.shadowColor = '#FFD740';
      g.shadowBlur = 12;
      g.fillStyle = '#FFD740';
      g.font = '16px "Courier New"';
      g.textAlign = 'center';
      g.fillText('Reclaim your station.', W / 2, H / 2 - 34);
      g.fillText('Shoot everything.', W / 2, H / 2 - 12);
      g.restore();

      g.fillStyle = '#00CFFF';
      g.font = '13px "Courier New"';
      g.textAlign = 'center';
      g.fillText('Tap anywhere to begin', W / 2, H / 2 + 30);

      if (highScore > 0) {
        g.fillStyle = '#FF4422';
        g.font = 'bold 13px "Courier New"';
        g.fillText('HIGH SCORE: ' + highScore, W / 2, H / 2 + 56);
      }

      g.textAlign = 'left';
    }

    function drawGameOver() {
      const alpha = Math.min(1, gameOverTimer / 400);
      g.save();
      g.globalAlpha = alpha * 0.85;
      g.fillStyle = '#050518';
      g.fillRect(0, 0, W, H);
      g.globalAlpha = alpha;

      g.shadowColor = '#FF4422';
      g.shadowBlur = 28;
      g.fillStyle = '#FF4422';
      g.font = 'bold 36px "Courier New"';
      g.textAlign = 'center';
      g.fillText('OVERRUN', W / 2, H / 2 - 50);

      g.shadowColor = '#FFD740';
      g.shadowBlur = 12;
      g.fillStyle = '#FFD740';
      g.font = 'bold 20px "Courier New"';
      g.fillText('SCORE  ' + score, W / 2, H / 2);

      if (score >= highScore && score > 0) {
        g.fillStyle = '#00CFFF';
        g.font = 'bold 15px "Courier New"';
        g.fillText('NEW HIGH SCORE!', W / 2, H / 2 + 28);
      } else if (highScore > 0) {
        g.fillStyle = '#00CFFF';
        g.font = '14px "Courier New"';
        g.fillText('BEST: ' + highScore, W / 2, H / 2 + 28);
      }

      if (gameOverTimer > 600) {
        g.fillStyle = '#FFFFFF';
        g.font = '14px "Courier New"';
        g.fillText('TAP TO RETURN', W / 2, H / 2 + 60);
      }
      g.restore();
      g.textAlign = 'left';
    }

    // ─── Main loop ────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      frameTime += dt;
      const dtCapped = Math.min(dt, 80);

      // ── Update ──
      if (state === 'playing') {
        updateEnemies(dtCapped);
        if (state !== 'gameover') { // might have changed above
          updateBullets(dtCapped);
          updateParticles(dtCapped);
          updateAmmoRefill(dtCapped);

          // Refill starts when ammo hits 0
          if (ammo === 0 && ammoRefillingAt === null) {
            ammoRefillingAt = frameTime + AMMO_REFILL_MS;
          }

          if (enemies.length === 0) {
            playSFXWaveClear();
            ctx.platform.complete({ score, result: 'wave_clear', durationMs: frameTime });
            state = 'waveclear';
            waveClearTimer = 0;
            waveClearPhase = 0;
          }
        }
      } else if (state === 'waveclear') {
        waveClearTimer += dt;
        updateParticles(dtCapped);
        if (waveClearPhase === 0 && waveClearTimer > 600) waveClearPhase = 1;
        if (waveClearPhase === 1 && waveClearTimer > 2400) waveClearPhase = 2;
        if (waveClearPhase === 2 && waveClearTimer > 3200) {
          startWave();
        }
      } else if (state === 'gameover') {
        gameOverTimer += dt;
        updateParticles(dtCapped);
      }

      // ── Draw ──
      g.fillStyle = '#0a0a18';
      g.fillRect(0, 0, W, H);

      // Blueprint grid / background static grid
      g.strokeStyle = 'rgba(0,60,100,0.18)';
      g.lineWidth = 0.5;
      const GRID = 40;
      for (let x = 0; x < W; x += GRID) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      }
      for (let y = 0; y < H; y += GRID) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }

      if (state !== 'title') {
        drawBlueprint();
      }

      drawParticles();

      if (state === 'playing' || state === 'waveclear' || state === 'gameover') {
        drawEnemies();
        drawBullets();
        drawTurret();
        if (state === 'playing') drawEdgeIndicators();
        drawHUD();
      }

      if (state === 'title') {
        drawTitle();
        drawHUD(); // show info button
      }

      if (state === 'waveclear') {
        let alpha = 0;
        if (waveClearPhase === 0) alpha = Math.min(1, waveClearTimer / 400);
        else if (waveClearPhase === 1) alpha = 1;
        else alpha = Math.max(0, 1 - (waveClearTimer - 2400) / 800);
        drawWaveClear(alpha);
      }

      if (state === 'gameover') {
        drawGameOver();
      }

      if (showInfo) {
        drawInfoOverlay();
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {
    // Audio pause handled via ambient node if needed
  },
  resume(ctx) {},
};
