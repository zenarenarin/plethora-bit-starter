window.plethoraBit = {
  meta: {
    title: 'Moon Cresta',
    author: 'plethora',
    description: 'Dock your ship sections. Rule the skies.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_mooncresta';

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
    function playShoot() { beep(800, 'square', 0.06, 0.12); }
    function playExplode() { beep(100, 'sawtooth', 0.3, 0.45); }
    function playDock() { [400,600,900,1200].forEach((f,i) => setTimeout(() => beep(f,'sine',0.12,0.3), i*70)); }
    function playGameOver() { [500,400,300,200,100].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.3), i*160)); }

    // Ship has up to 3 sections. Section 0 = active, rest = waiting at bottom to dock
    let sections = 3; // total sections collected
    let dockedSections = 1; // how many currently docked (active)
    let ship = { x: W / 2, y: H - 80 - ctx.safeArea.bottom, sections: 1 };
    let waitingSection = null; // section floating up waiting to dock
    let dockMode = false;

    let bullets = [], enemies = [], enemyBullets = [], particles = [], stars = [];
    let autoFireTimer = 0, wave = 0, spawnTimer = 0;
    let invaders = [];
    let invDir = 1, invDropTimer = 0;

    for (let i = 0; i < 60; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 + 0.5 });

    function resetGame() {
      score = 0; wave = 0; sections = 3; dockedSections = 1;
      ship = { x: W / 2, y: H - 80 - ctx.safeArea.bottom, sections: 1 };
      waitingSection = null; dockMode = false;
      bullets = []; enemies = []; enemyBullets = []; particles = [];
      invaders = []; invDir = 1; invDropTimer = 0;
      spawnWave();
    }

    function spawnWave() {
      wave++;
      invaders = [];
      const rows = 3, cols = 7;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          invaders.push({ x: W * 0.1 + c * (W * 0.8 / (cols - 1)), y: 80 + r * 44, hp: 1 + Math.floor(wave / 4), type: r });
        }
      }
      invDir = 1;
      // Maybe release a waiting section
      if (sections > dockedSections) {
        ctx.timeout(() => {
          if (state === 'play' && !dockMode && !waitingSection) {
            waitingSection = { x: W / 2, y: H + 40, vy: -1.5 };
            dockMode = true;
          }
        }, 2000);
      }
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    function drawShipSection(x, y, idx, ghost = false) {
      g.save(); g.translate(x, y);
      if (ghost) g.globalAlpha = 0.5;
      const cols = ['#4af', '#8af', '#acf'];
      g.fillStyle = cols[idx % cols.length];
      // Each section slightly different shape
      if (idx === 0) {
        g.beginPath(); g.moveTo(0, -16); g.lineTo(12, 8); g.lineTo(0, 4); g.lineTo(-12, 8); g.closePath(); g.fill();
        g.fillStyle = '#aef'; g.fillRect(-2, -10, 4, 8);
      } else if (idx === 1) {
        g.fillRect(-14, -10, 28, 20);
        g.fillStyle = '#68f'; g.fillRect(-6, -10, 12, 8);
      } else {
        g.beginPath(); g.moveTo(0, -8); g.lineTo(16, 12); g.lineTo(-16, 12); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
      g.restore();
    }

    let dragging = false;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }
      dragging = true;
      ship.x = Math.max(20, Math.min(W - 20, t.clientX));
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!dragging || state !== 'play') return;
      const t = e.changedTouches[0];
      ship.x = Math.max(20, Math.min(W - 20, t.clientX));
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); dragging = false; }, { passive: false });

    ctx.raf((dt) => {
      const spd = dt / 16;

      g.fillStyle = '#000010'; g.fillRect(0, 0, W, H);
      for (const s of stars) {
        g.fillStyle = `rgba(255,255,255,${0.3 + s.s * 0.2})`; g.fillRect(s.x, s.y, s.s, s.s);
      }

      if (state === 'title') {
        g.fillStyle = '#4af'; g.font = `bold ${W * 0.09}px monospace`; g.textAlign = 'center';
        g.fillText('MOON CRESTA', W / 2, H * 0.35);
        g.fillStyle = '#fff'; g.font = `${W * 0.038}px monospace`;
        g.fillText('DRAG to move  AUTO fires', W / 2, H * 0.5);
        g.fillText('Dock sections for more power!', W / 2, H * 0.57);
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
        g.fillStyle = '#4af'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      // Invader movement
      let hitEdge = false;
      for (const inv of invaders) {
        inv.x += invDir * (0.5 + wave * 0.1) * spd;
        if (inv.x > W - 20 || inv.x < 20) hitEdge = true;
      }
      invDropTimer -= dt;
      if (hitEdge && invDropTimer <= 0) {
        invDir *= -1;
        invDropTimer = 200;
        for (const inv of invaders) inv.y += 18;
      }

      // Auto fire
      autoFireTimer -= dt;
      if (autoFireTimer <= 0) {
        autoFireTimer = 300 - dockedSections * 40;
        for (let s = 0; s < dockedSections; s++) {
          const bx = ship.x + (s - (dockedSections - 1) / 2) * 16;
          bullets.push({ x: bx, y: ship.y - 20, vy: -13 });
        }
        playShoot();
      }

      // Waiting section dock
      if (waitingSection) {
        waitingSection.x += (ship.x - waitingSection.x) * 0.05 * spd;
        waitingSection.y += waitingSection.vy * spd;
        // Check dock
        if (Math.abs(waitingSection.x - ship.x) < 15 && Math.abs(waitingSection.y - ship.y) < 30) {
          dockedSections++;
          ship.sections = dockedSections;
          waitingSection = null; dockMode = false;
          playDock(); ctx.platform.haptic('medium');
        } else if (waitingSection.y < 60) {
          // Missed — comes back
          waitingSection.vy = 2;
        }
        drawShipSection(waitingSection.x, waitingSection.y, dockedSections, true);
      }

      // Spawn invader bullets
      spawnTimer -= dt;
      if (spawnTimer <= 0 && invaders.length > 0) {
        spawnTimer = 800 + Math.random() * 600;
        const inv = invaders[Math.floor(Math.random() * invaders.length)];
        const dx = ship.x - inv.x, dy = ship.y - inv.y, dist = Math.hypot(dx, dy);
        enemyBullets.push({ x: inv.x, y: inv.y, vx: (dx / dist) * 3.5, vy: (dy / dist) * 3.5 });
      }

      // Player bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.y += b.vy * spd;
        if (b.y < 0) { bullets.splice(i, 1); continue; }
        g.fillStyle = '#ff8'; g.fillRect(b.x - 2, b.y - 6, 4, 8);
        let hit = false;
        for (let j = invaders.length - 1; j >= 0; j--) {
          const inv = invaders[j];
          if (Math.abs(b.x - inv.x) < 16 && Math.abs(b.y - inv.y) < 16) {
            inv.hp--; spawnParticles(inv.x, inv.y, '#f84', 5);
            bullets.splice(i, 1); hit = true;
            if (inv.hp <= 0) {
              score += 100 * (inv.type + 1) * wave;
              ctx.platform.setScore(score);
              spawnParticles(inv.x, inv.y, '#ff8', 10); playExplode();
              invaders.splice(j, 1);
              if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
            }
            break;
          }
        }
        if (hit) continue;
      }

      // Enemy bullets
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd;
        if (b.x < 0 || b.x > W || b.y > H) { enemyBullets.splice(i, 1); continue; }
        g.fillStyle = '#f44'; g.beginPath(); g.arc(b.x, b.y, 4, 0, Math.PI * 2); g.fill();
        if (Math.abs(b.x - ship.x) < 16 && Math.abs(b.y - ship.y) < 16) {
          if (dockedSections > 1) {
            dockedSections--; ship.sections = dockedSections;
            spawnParticles(ship.x, ship.y, '#4af', 8); playExplode();
            ctx.platform.haptic('medium');
          } else {
            spawnParticles(ship.x, ship.y, '#4af', 14); playGameOver();
            ctx.platform.haptic('heavy'); state = 'over'; return;
          }
          enemyBullets.splice(i, 1);
        }
      }

      // Draw invaders
      for (const inv of invaders) {
        g.save(); g.translate(inv.x, inv.y);
        const cols = ['#f44', '#f84', '#ff8'];
        g.fillStyle = cols[inv.type % cols.length];
        if (inv.type === 0) {
          g.beginPath(); g.moveTo(-12, 8); g.lineTo(0, -12); g.lineTo(12, 8); g.closePath(); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(-5, 2, 3, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(5, 2, 3, 0, Math.PI * 2); g.fill();
        } else if (inv.type === 1) {
          g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#800'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
        } else {
          g.fillRect(-12, -8, 24, 16); g.fillStyle = '#f00'; g.fillRect(-4, -8, 8, 8);
        }
        g.restore();
        // Contact kill
        if (Math.abs(inv.x - ship.x) < 18 && Math.abs(inv.y - ship.y) < 18) {
          spawnParticles(ship.x, ship.y, '#4af', 14); playGameOver();
          ctx.platform.haptic('heavy'); state = 'over'; return;
        }
        // Reached bottom
        if (inv.y > ship.y - 20) { state = 'over'; playGameOver(); return; }
      }

      // Next wave
      if (invaders.length === 0) spawnWave();

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.04 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life; g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      // Draw ship (multi-section)
      for (let s = 0; s < dockedSections; s++) {
        drawShipSection(ship.x, ship.y - s * 22, s);
      }

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, 36);
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 24);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 24);
      g.textAlign = 'center'; g.fillStyle = '#4af';
      g.fillText(`WAVE ${wave}  SECTIONS:${dockedSections}`, W / 2, 24);
      if (dockMode && waitingSection) {
        g.fillStyle = '#ff0'; g.font = `bold ${W * 0.04}px monospace`;
        g.fillText('DOCK INCOMING!', W / 2, 50);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
