// THE CHROMA INCIDENT — Color-restoration shooter (Plethora Bit)

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
    title: 'Chroma Incident',
    author: 'plethora',
    description: 'Restore color. Defeat the Achromats.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom + 10;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FFD740';
    const HUD_H = 52;
    const PLAY_TOP = HUD_H + 4;
    const PLAY_BOT = H - SAFE - 4;
    const PLAY_H = PLAY_BOT - PLAY_TOP;

    // 6 colors: R, G, B, Y, P, O
    const COLORS = [
      { id: 'R', hex: '#FF3B3B', name: 'Red',    freq: 261.6, hue: 0   },
      { id: 'G', hex: '#3BFF5A', name: 'Green',  freq: 329.6, hue: 120 },
      { id: 'B', hex: '#3B8FFF', name: 'Blue',   freq: 392.0, hue: 210 },
      { id: 'Y', hex: '#FFE03B', name: 'Yellow', freq: 440.0, hue: 55  },
      { id: 'P', hex: '#CF3BFF', name: 'Purple', freq: 523.3, hue: 280 },
      { id: 'O', hex: '#FF8C3B', name: 'Orange', freq: 349.2, hue: 30  },
    ];

    // ─── Audio ────────────────────────────────────────────────────────────────
    let audioCtx = null;
    const voices = [];

    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function tone(freq, type, dur, vol = 0.25, detune = 0) {
      if (!audioCtx) return;
      if (voices.length >= 12) { try { voices[0].stop(); } catch (e) {} voices.shift(); }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (detune) o.detune.setValueAtTime(detune, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
      o.onended = () => { const i = voices.indexOf(o); if (i !== -1) voices.splice(i, 1); };
    }

    function playShoot(colorIdx) {
      tone(COLORS[colorIdx].freq, 'sine', 0.08, 0.18);
    }

    function playMatch(colorIdx) {
      // Satisfying harmonic chord
      const f = COLORS[colorIdx].freq;
      tone(f,         'sine',     0.25, 0.22);
      tone(f * 1.25,  'sine',     0.22, 0.15);
      tone(f * 1.5,   'triangle', 0.20, 0.10);
    }

    function playWrongColor() {
      tone(90, 'sawtooth', 0.12, 0.18);
    }

    function playChain(level) {
      if (!audioCtx) return;
      const notes = [261.6, 329.6, 392, 523.3, 659.3];
      for (let i = 0; i <= Math.min(level, 4); i++) {
        setTimeout(() => tone(notes[i], 'sine', 0.18, 0.22), i * 80);
      }
    }

    function playGameOver() {
      if (!audioCtx) return;
      [400, 320, 240, 180].forEach((f, i) => setTimeout(() => tone(f, 'sawtooth', 0.22, 0.28), i * 120));
    }

    // Ambient drone (starts subtle)
    let droneNode = null, droneGain = null;
    function startAmbient() {
      if (!audioCtx || droneNode) return;
      droneNode = audioCtx.createOscillator();
      droneGain = audioCtx.createGain();
      droneNode.connect(droneGain); droneGain.connect(audioCtx.destination);
      droneNode.type = 'sine';
      droneNode.frequency.setValueAtTime(55, audioCtx.currentTime);
      droneGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
      droneGain.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + 2);
      droneNode.start();
    }

    // ─── Game state ───────────────────────────────────────────────────────────
    let enemies, bullets, particles, splats, floatTexts;
    let score, highScore, lives, wave, started, gameOver;
    let colorIdx;         // current selected color (0-5)
    let colorPulse;       // for ring animation
    let autoFireTimer;    // ms until next auto-fire
    let waveSpawnTimer, waveSpawnInterval, waveEnemiesLeft;
    let maxEnemies;
    let colorfulness;     // 0→1: how much color has been restored
    let screenFlash;      // {r,g,b,a,decay}
    let totalKills;

    // Slide-to-change color (right half of screen, vertical)
    let slideStartY = null, slideColorStart = null;

    const IBTN = { x: W - 22, y: 8 + HUD_H / 2, r: 14 };
    let showInfo = false;

    function initGame() {
      highScore = ctx.storage.get('hs_chroma') || 0;
      enemies = []; bullets = []; particles = []; splats = []; floatTexts = [];
      score = 0; lives = 3; wave = 1; started = false; gameOver = false;
      colorIdx = 0; colorPulse = 0; autoFireTimer = 0;
      waveSpawnTimer = 0; waveSpawnInterval = 1600; waveEnemiesLeft = 0;
      maxEnemies = 5;
      colorfulness = 0;
      screenFlash = null;
      totalKills = 0;
      startWave();
    }

    function startWave() {
      waveEnemiesLeft = 4 + wave * 2;
      waveSpawnInterval = Math.max(500, 1600 - wave * 80);
      waveSpawnTimer = 400;
      maxEnemies = Math.min(5 + Math.floor(wave / 2), 10);
    }

    // ─── Enemy ────────────────────────────────────────────────────────────────
    const SHAPES = ['circle', 'triangle', 'hexagon', 'diamond', 'square'];

    function spawnEnemy() {
      if (waveEnemiesLeft <= 0) return;
      waveEnemiesLeft--;
      const colorAssign = Math.floor(Math.random() * 6);
      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      const r = 18 + Math.random() * 12;
      const x = r + Math.random() * (W - r * 2);
      const y = PLAY_TOP - r - 10;
      const spd = 22 + wave * 4 + Math.random() * 15;
      const wobbleOffset = Math.random() * Math.PI * 2;
      const wobbleAmt = 25 + Math.random() * 25;
      const wobbleFreq = 0.8 + Math.random() * 0.8;
      enemies.push({
        x, y, r, shape,
        colorKey: colorAssign,          // which color kills it
        hp: 3,
        maxHp: 3,
        absorbedColors: {},             // colorKey → count
        speed: spd,
        wobbleOffset, wobbleAmt, wobbleFreq,
        age: 0,
        alive: true,
        deathAnim: 0,
        hitFlash: 0,
        hitColor: null,
      });
    }

    function drawShape(g2, shape, r) {
      switch (shape) {
        case 'circle':
          g2.beginPath(); g2.arc(0, 0, r, 0, Math.PI * 2); break;
        case 'triangle': {
          g2.beginPath();
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            i === 0 ? g2.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                    : g2.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          g2.closePath(); break;
        }
        case 'hexagon': {
          g2.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
            i === 0 ? g2.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                    : g2.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          g2.closePath(); break;
        }
        case 'diamond': {
          g2.beginPath();
          g2.moveTo(0, -r); g2.lineTo(r * 0.65, 0);
          g2.lineTo(0, r);  g2.lineTo(-r * 0.65, 0);
          g2.closePath(); break;
        }
        case 'square': {
          const s = r * 0.85;
          g2.beginPath();
          g2.rect(-s, -s, s * 2, s * 2); break;
        }
      }
    }

    // ─── Bullets ──────────────────────────────────────────────────────────────
    function fireBullet(targetEnemy) {
      if (!targetEnemy) return;
      const px = W / 2;
      const py = PLAY_BOT - 30;
      const dx = targetEnemy.x - px;
      const dy = targetEnemy.y - py;
      const dist = Math.hypot(dx, dy) || 1;
      const spd = 480;
      bullets.push({
        x: px, y: py,
        vx: (dx / dist) * spd,
        vy: (dy / dist) * spd,
        colorIdx,
        trail: [],
        alive: true,
        r: 5,
      });
      playShoot(colorIdx);
    }

    function findNearestEnemy() {
      let best = null, bestDist = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - W / 2, e.y - (PLAY_BOT - 30));
        if (d < bestDist) { bestDist = d; best = e; }
      }
      return best;
    }

    // ─── Effects ──────────────────────────────────────────────────────────────
    function addSplat(x, y, colorKey, big) {
      const col = COLORS[colorKey].hex;
      const n = big ? 18 : 8;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (big ? 70 : 35) + Math.random() * (big ? 130 : 60);
        particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.6 + Math.random() * 0.5,
          maxLife: 1.1,
          col, r: (big ? 4 : 2) + Math.random() * (big ? 5 : 3),
        });
      }
      // Persistent color splat on background
      const splR = (big ? 28 : 12) + Math.random() * (big ? 20 : 10);
      splats.push({ x, y, r: splR, col, alpha: big ? 0.72 : 0.48 });

      // Extra mini drops for chain kills
      if (big) {
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 20 + Math.random() * 55;
          splats.push({
            x: x + Math.cos(a) * d,
            y: y + Math.sin(a) * d,
            r: 4 + Math.random() * 10,
            col,
            alpha: 0.3 + Math.random() * 0.3,
          });
        }
      }
    }

    function addFloat(x, y, text, col) {
      floatTexts.push({ x, y, text, col, life: 1.2, vy: -50 });
    }

    function triggerChainExplosion(cx, cy, colorKey, radius) {
      addSplat(cx, cy, colorKey, true);
      screenFlash = { col: COLORS[colorKey].hex, alpha: 0.38, decay: 2.4 };
      ctx.platform.haptic('heavy');
      playChain(wave);
      // Kill nearby enemies
      for (const e of enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - cx, e.y - cy) < radius + e.r) {
          killEnemy(e, colorKey, true);
        }
      }
    }

    function killEnemy(e, killedByColor, isChain) {
      if (!e.alive) return;
      e.alive = false;
      totalKills++;
      colorfulness = Math.min(1, colorfulness + 0.04 + (isChain ? 0.08 : 0));
      const pts = isChain ? 500 : 100;
      score += pts;
      if (score > highScore) { highScore = score; ctx.storage.set('hs_chroma', highScore); }
      ctx.platform.setScore(score);
      addSplat(e.x, e.y, killedByColor, isChain);
      addFloat(e.x, e.y - e.r - 8, (isChain ? '⚡ ' : '+') + pts, COLORS[killedByColor].hex);
      ctx.platform.haptic(isChain ? 'heavy' : 'medium');
      if (!isChain) playMatch(killedByColor);
    }

    // ─── Input ────────────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!droneNode) startAmbient();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // Info button
      if (Math.hypot(tx - IBTN.x, ty - IBTN.y) < IBTN.r + 8) {
        showInfo = !showInfo; return;
      }
      if (showInfo) { showInfo = false; return; }
      if (gameOver) { initGame(); return; }
      if (!started) { started = true; ctx.platform.start(); }

      ctx.platform.interact({ type: 'tap' });

      // Left half: cycle color backward; right half: cycle forward
      // But if right side, also start slide tracking
      if (tx < W / 2) {
        colorIdx = (colorIdx + COLORS.length - 1) % COLORS.length;
        colorPulse = 1;
        ctx.platform.haptic('light');
      } else {
        slideStartY = ty;
        slideColorStart = colorIdx;
        colorIdx = (colorIdx + 1) % COLORS.length;
        colorPulse = 1;
        ctx.platform.haptic('light');
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (slideStartY === null) return;
      const t = e.changedTouches[0];
      if (t.clientX < W / 2) return; // only right side for slide
      const dy = slideStartY - t.clientY;   // positive = swipe up
      const step = 40;                       // px per color step
      const delta = Math.round(dy / step);
      colorIdx = ((slideColorStart + delta) % COLORS.length + COLORS.length) % COLORS.length;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      slideStartY = null;
      slideColorStart = null;
    }, { passive: false });

    // ─── Init game ────────────────────────────────────────────────────────────
    initGame();

    // ─── Main loop ────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      const sec = dt / 1000;

      if (!gameOver && started) {
        colorPulse = Math.max(0, colorPulse - sec * 3);

        // ── Spawning
        waveSpawnTimer -= dt;
        if (waveSpawnTimer <= 0 && waveEnemiesLeft > 0 && enemies.filter(e => e.alive).length < maxEnemies) {
          spawnEnemy();
          waveSpawnTimer = waveSpawnInterval;
        }

        // Wave complete?
        if (waveEnemiesLeft === 0 && enemies.filter(e => e.alive).length === 0) {
          wave++;
          startWave();
          addFloat(W / 2, H / 2, 'WAVE ' + wave, ACCENT);
          ctx.platform.haptic('medium');
        }

        // ── Auto-fire
        autoFireTimer -= dt;
        if (autoFireTimer <= 0) {
          autoFireTimer = 200;
          const target = findNearestEnemy();
          if (target) fireBullet(target);
        }

        // ── Update enemies
        for (const e of enemies) {
          if (!e.alive) continue;
          e.age += sec;
          e.hitFlash = Math.max(0, e.hitFlash - sec * 4);
          // Weave down
          const wobble = Math.sin(e.age * e.wobbleFreq * Math.PI * 2 + e.wobbleOffset) * e.wobbleAmt;
          e.x += wobble * sec * 0.8;
          e.y += e.speed * sec;

          // Clamp x in bounds
          e.x = Math.max(e.r, Math.min(W - e.r, e.x));

          // Enemy reached bottom → lose a life
          if (e.y > PLAY_BOT + e.r * 2) {
            e.alive = false;
            lives--;
            ctx.platform.haptic('medium');
            addFloat(e.x, PLAY_BOT - 10, '-1 LIFE', '#FF3B3B');
            tone(100, 'sawtooth', 0.3, 0.3);
            if (lives <= 0) {
              lives = 0; gameOver = true;
              playGameOver();
              ctx.platform.fail({ reason: 'all lives lost' });
            }
          }
        }

        // ── Update bullets
        for (const b of bullets) {
          if (!b.alive) continue;
          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 10) b.trail.shift();
          b.x += b.vx * sec;
          b.y += b.vy * sec;

          // Out of bounds
          if (b.x < 0 || b.x > W || b.y < PLAY_TOP || b.y > PLAY_BOT) {
            b.alive = false; continue;
          }

          // Hit test
          for (const e of enemies) {
            if (!e.alive) continue;
            if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + b.r) {
              b.alive = false;
              const matchColor = b.colorIdx === e.colorKey;

              if (matchColor) {
                // Record hit
                const ck = b.colorIdx;
                e.absorbedColors[ck] = (e.absorbedColors[ck] || 0) + 1;
                e.hp--;
                e.hitFlash = 0.5;
                e.hitColor = ck;

                if (e.hp <= 0) {
                  // Check chain: 3+ same-color hits
                  if (e.absorbedColors[ck] >= 3) {
                    // Chain explosion
                    triggerChainExplosion(e.x, e.y, ck, 80);
                    killEnemy(e, ck, false); // also kill self (already inside chain)
                  } else {
                    killEnemy(e, ck, false);
                  }
                }
              } else {
                // Wrong color: absorb hit, show colored mark
                const ck = b.colorIdx;
                e.absorbedColors[ck] = (e.absorbedColors[ck] || 0) + 1;
                e.hitFlash = 0.35;
                e.hitColor = ck;
                playWrongColor();
                ctx.platform.haptic('light');

                // 3 same wrong color → chain explosion
                if (e.absorbedColors[ck] >= 3) {
                  triggerChainExplosion(e.x, e.y, ck, 80);
                  killEnemy(e, ck, true);
                }
              }
              break;
            }
          }
        }

        // ── Particles
        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec; p.vy += 80 * sec;
          p.life -= sec; return p.life > 0;
        });

        // ── Float texts
        floatTexts = floatTexts.filter(f => {
          f.y += f.vy * sec; f.life -= sec; return f.life > 0;
        });

        // ── Screen flash decay
        if (screenFlash) {
          screenFlash.alpha -= screenFlash.decay * sec;
          if (screenFlash.alpha <= 0) screenFlash = null;
        }

        // Fade old splats slowly
        for (const s of splats) s.alpha = Math.max(0, s.alpha - sec * 0.006);
        ctx.platform.setProgress(Math.min(1, totalKills / 60));
      }

      // ═══════════════════════════════════════════════════════════════
      // DRAW
      // ═══════════════════════════════════════════════════════════════

      // ── Background: desaturated → colorful
      // Blend from solid gray to a gradient based on colorfulness
      const grayLvl = Math.round(22 + colorfulness * 8);
      g.fillStyle = `rgb(${grayLvl},${grayLvl},${grayLvl})`;
      g.fillRect(0, 0, W, H);

      // Color tint overlay as colorfulness grows
      if (colorfulness > 0.02) {
        const now = Date.now() / 1000;
        const grad = g.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, H * 0.8);
        const hue1 = (now * 15) % 360;
        const hue2 = (hue1 + 120) % 360;
        grad.addColorStop(0, `hsla(${hue1},80%,35%,${colorfulness * 0.28})`);
        grad.addColorStop(1, `hsla(${hue2},80%,20%,${colorfulness * 0.18})`);
        g.fillStyle = grad;
        g.fillRect(0, PLAY_TOP, W, PLAY_H);
      }

      // ── Persistent color splats on background
      for (const s of splats) {
        if (s.alpha <= 0.01) continue;
        g.globalAlpha = s.alpha;
        g.fillStyle = s.col;
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;

      // ── Particles
      for (const p of particles) {
        g.globalAlpha = Math.max(0, p.life / 1.1);
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;

      // ── Bullets (glowing trails)
      for (const b of bullets) {
        if (!b.alive) continue;
        const col = COLORS[b.colorIdx].hex;
        // Trail
        for (let ti = 0; ti < b.trail.length; ti++) {
          const frac = ti / b.trail.length;
          g.globalAlpha = frac * 0.65;
          g.fillStyle = col;
          g.beginPath();
          g.arc(b.trail[ti].x, b.trail[ti].y, b.r * (0.4 + frac * 0.6), 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
        // Bullet head glow
        const grd = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.5);
        grd.addColorStop(0, col);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(b.x, b.y, b.r * 2.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(b.x, b.y, b.r * 0.6, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;

      // ── Enemies (grayscale silhouettes with color marks)
      const now2 = Date.now() / 1000;
      for (const e of enemies) {
        if (!e.alive) continue;
        g.save();
        g.translate(e.x, e.y);

        const pulse = 0.5 + 0.5 * Math.sin(now2 * 2.5 + e.wobbleOffset);

        // Grayscale body
        g.fillStyle = `rgb(60,60,60)`;
        g.strokeStyle = `rgb(${90 + Math.round(pulse * 30)},${90 + Math.round(pulse * 30)},${90 + Math.round(pulse * 30)})`;
        g.lineWidth = 2;
        drawShape(g, e.shape, e.r);
        g.fill();
        g.stroke();

        // Color absorption marks (small colored dots)
        const absKeys = Object.keys(e.absorbedColors);
        if (absKeys.length > 0) {
          absKeys.forEach((ck, idx) => {
            const count = e.absorbedColors[ck];
            const col = COLORS[parseInt(ck)].hex;
            const dotR = 4 + count * 1.2;
            const angle = (idx / absKeys.length) * Math.PI * 2;
            const dotX = Math.cos(angle) * (e.r * 0.55);
            const dotY = Math.sin(angle) * (e.r * 0.55);
            g.fillStyle = col;
            g.globalAlpha = 0.85 + 0.15 * Math.sin(now2 * 4);
            g.beginPath(); g.arc(dotX, dotY, dotR, 0, Math.PI * 2); g.fill();
            g.globalAlpha = 1;
          });
        }

        // Hit flash
        if (e.hitFlash > 0 && e.hitColor !== null) {
          g.globalAlpha = e.hitFlash * 0.6;
          g.fillStyle = COLORS[e.hitColor].hex;
          drawShape(g, e.shape, e.r);
          g.fill();
          g.globalAlpha = 1;
        }

        // HP bar
        const barW = e.r * 2;
        const barH = 4;
        const barX = -e.r;
        const barY = e.r + 5;
        g.fillStyle = '#111';
        g.fillRect(barX, barY, barW, barH);
        g.fillStyle = e.hp === e.maxHp ? '#4ade80' : e.hp === 2 ? '#facc15' : '#f87171';
        g.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);

        g.restore();
      }

      // ── Player ship (white sleek shape at center-bottom)
      const px = W / 2;
      const py = PLAY_BOT - 26;
      g.save();
      g.translate(px, py);

      // Color ring around player
      const ringR = 26;
      const selCol = COLORS[colorIdx].hex;
      const ringAlpha = 0.55 + 0.35 * Math.sin(now2 * 5);
      const ringPulse = ringR + colorPulse * 8;
      g.strokeStyle = selCol;
      g.lineWidth = 2.5;
      g.globalAlpha = ringAlpha;
      g.beginPath(); g.arc(0, 0, ringPulse, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;

      // Outer glow fill
      g.fillStyle = selCol;
      g.globalAlpha = 0.08 + colorPulse * 0.08;
      g.beginPath(); g.arc(0, 0, ringR * 1.7, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;

      // Ship body
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(0, -18);
      g.lineTo(12, 10);
      g.lineTo(6, 6);
      g.lineTo(0, 12);
      g.lineTo(-6, 6);
      g.lineTo(-12, 10);
      g.closePath();
      g.fill();

      // Engine glow
      g.fillStyle = selCol;
      g.globalAlpha = 0.7 + 0.3 * Math.sin(now2 * 8);
      g.beginPath(); g.arc(0, 10, 5, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;

      // Ship accent lines
      g.strokeStyle = selCol;
      g.lineWidth = 1.5;
      g.globalAlpha = 0.8;
      g.beginPath(); g.moveTo(0, -14); g.lineTo(0, 6); g.stroke();
      g.globalAlpha = 1;

      g.restore();

      // ── Screen flash overlay
      if (screenFlash && screenFlash.alpha > 0) {
        g.globalAlpha = Math.min(0.38, screenFlash.alpha);
        g.fillStyle = screenFlash.col;
        g.fillRect(0, PLAY_TOP, W, PLAY_H);
        g.globalAlpha = 1;
      }

      // ── Float texts
      for (const f of floatTexts) {
        g.globalAlpha = Math.min(1, f.life);
        g.fillStyle = f.col;
        g.font = 'bold 15px "Courier New"';
        g.textAlign = 'center';
        g.fillText(f.text, f.x, f.y);
      }
      g.globalAlpha = 1;

      // ── HUD bar
      g.fillStyle = '#0e0e0e';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      // Score
      g.fillStyle = '#fff';
      g.font = 'bold 15px "Courier New"';
      g.textAlign = 'left';
      g.fillText(score, 14, 22);
      g.fillStyle = '#666';
      g.font = '10px "Courier New"';
      g.fillText('BEST ' + highScore, 14, 38);

      // Wave
      g.fillStyle = ACCENT;
      g.font = 'bold 13px "Courier New"';
      g.textAlign = 'center';
      g.fillText('WAVE ' + wave, W / 2, 20);

      // Color dots selector (6 dots)
      const dotSpacing = 20;
      const dotsTotal = COLORS.length * dotSpacing;
      const dotsStart = W / 2 - dotsTotal / 2 + dotSpacing / 2;
      for (let i = 0; i < COLORS.length; i++) {
        const dx = dotsStart + i * dotSpacing;
        const dy = 37;
        const isActive = i === colorIdx;
        const dotR2 = isActive ? 7 : 4.5;
        if (isActive) {
          // Glow ring
          g.fillStyle = COLORS[i].hex;
          g.globalAlpha = 0.28;
          g.beginPath(); g.arc(dx, dy, dotR2 + 5, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        }
        g.fillStyle = COLORS[i].hex;
        g.globalAlpha = isActive ? 1 : 0.45;
        g.beginPath(); g.arc(dx, dy, dotR2, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        if (isActive) {
          g.strokeStyle = '#fff';
          g.lineWidth = 1.5;
          g.beginPath(); g.arc(dx, dy, dotR2, 0, Math.PI * 2); g.stroke();
        }
      }

      // Lives (hearts)
      const lx = W - 110;
      const ly = 14;
      for (let i = 0; i < 3; i++) {
        const hx = lx + i * 22;
        g.fillStyle = i < lives ? '#FF3B3B' : '#333';
        g.beginPath();
        // Simple heart
        g.moveTo(hx, ly + 5);
        g.bezierCurveTo(hx, ly + 2, hx - 6, ly + 2, hx - 6, ly + 7);
        g.bezierCurveTo(hx - 6, ly + 12, hx, ly + 16, hx, ly + 16);
        g.bezierCurveTo(hx, ly + 16, hx + 6, ly + 12, hx + 6, ly + 7);
        g.bezierCurveTo(hx + 6, ly + 2, hx, ly + 2, hx, ly + 5);
        g.fill();
      }

      // Colorfulness progress bar
      const pbarW = 60, pbarH = 5;
      const pbarX = W - 115;
      const pbarY = 38;
      g.fillStyle = '#222';
      g.fillRect(pbarX, pbarY, pbarW, pbarH);
      if (colorfulness > 0) {
        const cgrad = g.createLinearGradient(pbarX, 0, pbarX + pbarW, 0);
        cgrad.addColorStop(0, '#FF3B3B');
        cgrad.addColorStop(0.33, '#FFE03B');
        cgrad.addColorStop(0.66, '#3BFF5A');
        cgrad.addColorStop(1, '#CF3BFF');
        g.fillStyle = cgrad;
        g.fillRect(pbarX, pbarY, pbarW * colorfulness, pbarH);
      }
      g.fillStyle = '#555';
      g.font = '8px monospace';
      g.textAlign = 'left';
      g.fillText('CHROMA', pbarX, pbarY - 2);

      // Info button
      g.fillStyle = '#1a1a1a';
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ACCENT;
      g.font = 'bold 13px "Courier New"';
      g.textAlign = 'center';
      g.fillText('i', IBTN.x, IBTN.y + 5);

      // ── Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.92)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 20px "Courier New"';
        g.textAlign = 'center';
        g.fillText('THE CHROMA INCIDENT', W / 2, H / 2 - 150);
        g.fillStyle = '#fff';
        g.font = '13px "Courier New"';
        const lines = [
          'Achromats drain color from the world.',
          'Shoot them with the matching color',
          'to destroy them!',
          '',
          'TAP LEFT  — cycle color back',
          'TAP RIGHT — cycle color forward',
          'SLIDE UP/DOWN on right — rotate wheel',
          '',
          'Hit enemy 3x with same color = CHAIN!',
          'Chain explosion kills nearby enemies.',
          '',
          'Wrong color: enemy absorbs the hit.',
          '3 wrong hits of one color = CHAIN!',
          '',
          'Color match kill: 100 pts',
          'Chain explosion:  500 pts',
        ];
        lines.forEach((l, i) => {
          g.fillStyle = l.startsWith('TAP') || l.startsWith('SLIDE') ? ACCENT : '#ccc';
          g.fillText(l, W / 2, H / 2 - 100 + i * 20);
        });
        g.fillStyle = '#555';
        g.font = '12px "Courier New"';
        g.fillText('TAP TO CLOSE', W / 2, H / 2 + 190);
        return;
      }

      // ── Start overlay
      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = ACCENT;
        g.font = 'bold 24px "Courier New"';
        g.textAlign = 'center';
        g.fillText('CHROMA INCIDENT', W / 2, H / 2 - 50);
        g.fillStyle = '#aaa';
        g.font = '13px "Courier New"';
        g.fillText('Match colors. Restore the world.', W / 2, H / 2 - 15);
        g.fillText('Tap left/right to change ammo color.', W / 2, H / 2 + 10);
        g.fillStyle = ACCENT;
        g.font = 'bold 15px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 55);
      }

      // ── Game over overlay
      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.82)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = '#FF3B3B';
        g.font = 'bold 30px "Courier New"';
        g.textAlign = 'center';
        g.fillText('DARKNESS WINS', W / 2, H / 2 - 60);
        g.fillStyle = ACCENT;
        g.font = 'bold 20px "Courier New"';
        g.fillText('SCORE: ' + score, W / 2, H / 2 - 14);
        g.fillStyle = '#aaa';
        g.font = '14px "Courier New"';
        g.fillText('BEST: ' + highScore, W / 2, H / 2 + 16);
        g.fillStyle = '#fff';
        g.font = '14px "Courier New"';
        g.fillText('TAP TO TRY AGAIN', W / 2, H / 2 + 55);
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
