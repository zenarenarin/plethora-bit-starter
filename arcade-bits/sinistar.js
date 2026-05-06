window.plethoraBit = {
  meta: {
    title: 'Sinistar',
    author: 'plethora',
    description: 'Mine crystite. Build bombs. Fear Sinistar.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_sinistar';

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
    function playShoot() { beep(1000, 'square', 0.07, 0.12); }
    function playCrystite() { beep(1400, 'sine', 0.12, 0.25); }
    function playBomb() { beep(200, 'sawtooth', 0.35, 0.6); }
    function playSiniBuild() { beep(80 + Math.random() * 40, 'sawtooth', 0.2, 0.4); }
    function playSinistarLive() {
      if (!audioCtx) return;
      [200,300,250,200,150].forEach((f,i) => setTimeout(() => beep(f,'square',0.2,0.5), i*120));
    }
    function playGameOver() { [500,350,200,100].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.3), i*160)); }

    let ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, facing: 0 };
    let bullets = [], crystites = [], enemies = [], particles = [], asteroids = [];
    let siniBombs = 0, siniProgress = 0; // sinistar build progress 0-20
    let sinistar = null, sinistarComplete = false;
    let wave = 0;
    let joystickOrigin = null, joystickPos = null;
    let stars = [];
    let fireTimer = 0;

    for (let i = 0; i < 80; i++) stars.push({ x: Math.random() * W * 3, y: Math.random() * H * 3, s: Math.random() * 2 + 0.5 });

    function resetGame() {
      score = 0; wave = 1; siniBombs = 0; siniProgress = 0;
      sinistar = null; sinistarComplete = false;
      ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, facing: 0 };
      bullets = []; crystites = []; enemies = []; particles = [];
      asteroids = [];
      for (let i = 0; i < 16; i++) spawnAsteroid();
      for (let i = 0; i < 4; i++) spawnEnemy();
    }

    function spawnAsteroid() {
      const a = Math.random() * Math.PI * 2;
      const dist = 200 + Math.random() * 300;
      asteroids.push({ x: ship.x + Math.cos(a) * dist, y: ship.y + Math.sin(a) * dist, r: 20 + Math.random() * 20, hp: 3, crystite: Math.floor(Math.random() * 3) + 1 });
    }

    function spawnEnemy() {
      const a = Math.random() * Math.PI * 2;
      const dist = 250 + Math.random() * 200;
      enemies.push({ x: ship.x + Math.cos(a) * dist, y: ship.y + Math.sin(a) * dist, vx: 0, vy: 0, hp: 2, fireTimer: 60 + Math.random() * 80, mineTimer: 120, type: Math.random() < 0.3 ? 'bomber' : 'grunt' });
    }

    function spawnParticles(x, y, col, n = 8, sx = 0, sy = 0) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
        particles.push({ x, y, vx: sx + Math.cos(a) * s, vy: sy + Math.sin(a) * s, life: 1, color: col });
      }
    }

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
      joystickPos = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      const dx = joystickPos.x - joystickOrigin.x, dy = joystickPos.y - joystickOrigin.y;
      if (Math.hypot(dx, dy) > 8) ship.facing = Math.atan2(dy, dx);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (state !== 'play') return;
      // Fire bomb if near sinistar and have bombs
      if (sinistar && siniBombs > 0) {
        const dist = Math.hypot(sinistar.x - ship.x, sinistar.y - ship.y);
        if (dist < 200) {
          siniBombs--;
          playBomb(); ctx.platform.haptic('heavy');
          sinistar.hp -= 3;
          spawnParticles(sinistar.x, sinistar.y, '#f80', 15);
          if (sinistar.hp <= 0) {
            score += 5000; spawnParticles(sinistar.x, sinistar.y, '#ff0', 25);
            sinistar = null; siniProgress = 0; sinistarComplete = false;
            wave++;
            for (let i = 0; i < 4 + wave; i++) spawnEnemy();
            ctx.platform.setScore(score);
          }
          joystickOrigin = null; joystickPos = null; return;
        }
      }
      // Otherwise fire bullet
      const bvx = Math.cos(ship.facing) * 10 + ship.vx * 0.3;
      const bvy = Math.sin(ship.facing) * 10 + ship.vy * 0.3;
      bullets.push({ x: ship.x, y: ship.y, vx: bvx, vy: bvy, life: 1.2 });
      playShoot();
      joystickOrigin = null; joystickPos = null;
    }, { passive: false });

    // Auto thrust from joystick while held
    ctx.raf((dt) => {
      const spd = dt / 16;
      const FRICTION = 0.98;
      const MAX_SPD = 5;

      // BG
      g.fillStyle = '#000008'; g.fillRect(0, 0, W, H);
      // Parallax stars
      for (const s of stars) {
        const sx = ((s.x - ship.x * 0.3) % (W * 2) + W * 2) % (W * 2);
        const sy = ((s.y - ship.y * 0.3) % (H * 2) + H * 2) % (H * 2);
        if (sx < W && sy < H) {
          g.fillStyle = `rgba(255,255,255,${0.3 + s.s * 0.2})`; g.fillRect(sx, sy, s.s, s.s);
        }
      }

      if (state === 'title') {
        g.fillStyle = '#f84'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('SINISTAR', W / 2, H * 0.35);
        g.fillStyle = '#fff'; g.font = `${W * 0.038}px monospace`;
        g.fillText('DRAG=thrust  RELEASE=fire', W / 2, H * 0.5);
        g.fillText('Mine asteroids → collect crystite', W / 2, H * 0.57);
        g.fillText('Bomb Sinistar when he appears!', W / 2, H * 0.64);
        g.fillStyle = '#ff8'; g.font = `${W * 0.05}px monospace`;
        g.fillText('TAP TO START', W / 2, H * 0.78);
        g.fillStyle = '#888'; g.font = `${W * 0.04}px monospace`;
        g.fillText(`HI: ${highScore}`, W / 2, H * 0.88);
        return;
      }

      if (state === 'over') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('BEWARE', W / 2, H * 0.35);
        g.fillStyle = '#f84'; g.font = `${W * 0.05}px monospace`;
        g.fillText('I LIVE!', W / 2, H * 0.46);
        g.fillStyle = '#fff'; g.font = `${W * 0.046}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H * 0.58);
        g.fillStyle = '#ff8'; g.fillText(`BEST: ${highScore}`, W / 2, H * 0.68);
        g.fillStyle = '#f84'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.8);
        return;
      }

      // Thrust
      if (joystickOrigin && joystickPos) {
        const dx = joystickPos.x - joystickOrigin.x, dy = joystickPos.y - joystickOrigin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 12) {
          const thrust = Math.min(dist / 50, 1) * 0.3;
          ship.vx += Math.cos(ship.facing) * thrust * spd;
          ship.vy += Math.sin(ship.facing) * thrust * spd;
        }
      }
      ship.vx *= Math.pow(FRICTION, spd); ship.vy *= Math.pow(FRICTION, spd);
      const sv = Math.hypot(ship.vx, ship.vy);
      if (sv > MAX_SPD) { ship.vx = (ship.vx / sv) * MAX_SPD; ship.vy = (ship.vy / sv) * MAX_SPD; }
      ship.x += ship.vx * spd; ship.y += ship.vy * spd;

      // World-space offset for drawing
      const ox = W / 2 - ship.x, oy = H / 2 - ship.y;

      // Asteroids
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        const sx = a.x + ox, sy = a.y + oy;
        if (sx < -100 || sx > W + 100 || sy < -100 || sy > H + 100) continue;
        g.fillStyle = '#554433'; g.beginPath(); g.arc(sx, sy, a.r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#887766'; g.lineWidth = 2; g.stroke();
        // Crystite glints
        for (let c = 0; c < a.crystite; c++) {
          const ca = (c / a.crystite) * Math.PI * 2;
          g.fillStyle = '#4ff'; g.beginPath(); g.arc(sx + Math.cos(ca) * a.r * 0.6, sy + Math.sin(ca) * a.r * 0.6, 4, 0, Math.PI * 2); g.fill();
        }
      }

      // Enemies
      for (const en of enemies) {
        const ex = en.x + ox, ey = en.y + oy;
        // Move toward player or mine asteroid
        const dx = ship.x - en.x, dy = ship.y - en.y, dist = Math.hypot(dx, dy);
        en.vx += (dx / dist) * 0.05 * spd; en.vy += (dy / dist) * 0.05 * spd;
        const ev = Math.hypot(en.vx, en.vy);
        if (ev > 2) { en.vx = (en.vx / ev) * 2; en.vy = (en.vy / ev) * 2; }
        en.x += en.vx * spd; en.y += en.vy * spd;

        if (ex < -60 || ex > W + 60 || ey < -60 || ey > H + 60) continue;
        g.save(); g.translate(ex, ey);
        g.fillStyle = '#a44';
        g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f88'; g.beginPath(); g.arc(-4, -4, 4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(4, -4, 4, 0, Math.PI * 2); g.fill();
        g.restore();

        // Enemy mines asteroid → builds sinistar
        en.mineTimer -= dt;
        if (en.mineTimer <= 0) {
          en.mineTimer = 180 + Math.random() * 120;
          for (const ast of asteroids) {
            if (Math.hypot(en.x - ast.x, en.y - ast.y) < ast.r + 20) {
              siniProgress = Math.min(20, siniProgress + 0.5);
              playSiniBuild();
              break;
            }
          }
        }

        // Fire
        en.fireTimer -= dt;
        if (en.fireTimer <= 0 && dist < 400) {
          en.fireTimer = 1200 + Math.random() * 600;
          bullets.push({ x: en.x, y: en.y, vx: (dx / dist) * (-4), vy: (dy / dist) * (-4), life: 1.5, enemy: true });
        }

        // Contact
        if (dist < 20) {
          spawnParticles(W / 2, H / 2, '#4af', 14); playGameOver();
          ctx.platform.haptic('heavy'); state = 'over'; return;
        }
      }

      // Sinistar formation
      if (!sinistar && siniProgress >= 20) {
        sinistar = { x: ship.x - W, y: ship.y, hp: 15 + wave * 3, maxHp: 15 + wave * 3 };
        sinistarComplete = true;
        playSinistarLive(); ctx.platform.haptic('heavy');
      }
      if (sinistar) {
        const sdx = ship.x - sinistar.x, sdy = ship.y - sinistar.y, sdist = Math.hypot(sdx, sdy);
        sinistar.x += (sdx / sdist) * 2.5 * spd; sinistar.y += (sdy / sdist) * 2.5 * spd;
        const ssx = sinistar.x + ox, ssy = sinistar.y + oy;
        // Draw skull
        g.save(); g.translate(ssx, ssy);
        const pulse = 1 + 0.1 * Math.sin(Date.now() * 0.005);
        g.scale(pulse, pulse);
        g.fillStyle = '#c44'; g.beginPath(); g.arc(0, -10, 32, Math.PI, Math.PI * 2); g.lineTo(28, 20); g.lineTo(-28, 20); g.closePath(); g.fill();
        g.fillStyle = '#200'; g.beginPath(); g.arc(-10, -8, 10, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(10, -8, 10, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f00'; g.beginPath(); g.arc(-10, -8, 5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(10, -8, 5, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c44';
        for (let t = 0; t < 6; t++) g.fillRect(-24 + t * 8, 8, 6, 12);
        g.restore();
        if (sdist < 28) {
          spawnParticles(W / 2, H / 2, '#f44', 16); playGameOver();
          ctx.platform.haptic('heavy'); state = 'over'; return;
        }
      }

      // Bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * spd; b.y += b.vy * spd; b.life -= 0.015 * spd;
        if (b.life <= 0) { bullets.splice(i, 1); continue; }
        const bsx = b.x + ox, bsy = b.y + oy;
        if (b.enemy) {
          g.fillStyle = '#f44'; g.beginPath(); g.arc(bsx, bsy, 4, 0, Math.PI * 2); g.fill();
          if (Math.hypot(b.x - ship.x, b.y - ship.y) < 14) {
            spawnParticles(W / 2, H / 2, '#4af', 12); playGameOver();
            ctx.platform.haptic('heavy'); state = 'over'; return;
          }
        } else {
          g.fillStyle = '#ff8'; g.beginPath(); g.arc(bsx, bsy, 4, 0, Math.PI * 2); g.fill();
          // Hit asteroid
          for (let j = asteroids.length - 1; j >= 0; j--) {
            const a = asteroids[j];
            if (Math.hypot(b.x - a.x, b.y - a.y) < a.r + 6) {
              a.hp--;
              bullets.splice(i, 1);
              if (a.hp <= 0) {
                // Drop crystite
                for (let c = 0; c < a.crystite; c++) {
                  const ca = Math.random() * Math.PI * 2;
                  crystites.push({ x: a.x + Math.cos(ca) * 20, y: a.y + Math.sin(ca) * 20, life: 4 });
                }
                spawnParticles(a.x + ox, a.y + oy, '#887766', 10);
                asteroids.splice(j, 1);
                score += 50; ctx.platform.setScore(score);
                if (asteroids.length < 8) spawnAsteroid();
              }
              break;
            }
          }
          // Hit enemy
          for (let j = enemies.length - 1; j >= 0; j--) {
            if (Math.hypot(b.x - enemies[j].x, b.y - enemies[j].y) < 16) {
              enemies[j].hp--;
              bullets.splice(i, 1);
              if (enemies[j].hp <= 0) { score += 200; spawnParticles(enemies[j].x + ox, enemies[j].y + oy, '#f84', 10); playGameOver(); enemies.splice(j, 1); if (enemies.length < 4) spawnEnemy(); }
              break;
            }
          }
        }
      }

      // Crystites collection
      for (let i = crystites.length - 1; i >= 0; i--) {
        const c = crystites[i];
        c.life -= 0.015 * spd;
        if (c.life <= 0) { crystites.splice(i, 1); continue; }
        const csx = c.x + ox, csy = c.y + oy;
        g.fillStyle = '#4ff'; g.beginPath(); g.arc(csx, csy, 5, 0, Math.PI * 2); g.fill();
        if (Math.hypot(c.x - ship.x, c.y - ship.y) < 20) {
          siniBombs++; playCrystite(); ctx.platform.haptic('light');
          crystites.splice(i, 1);
          if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.04 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life; g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      // Player ship (center of screen)
      g.save(); g.translate(W / 2, H / 2);
      g.rotate(ship.facing + Math.PI / 2);
      g.fillStyle = '#4af';
      g.beginPath(); g.moveTo(0, -16); g.lineTo(12, 12); g.lineTo(0, 6); g.lineTo(-12, 12); g.closePath(); g.fill();
      g.fillStyle = '#f84'; g.beginPath(); g.ellipse(0, 10, 5, 8, 0, 0, Math.PI * 2); g.fill();
      g.restore();

      // Joystick
      if (joystickOrigin) {
        g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2;
        g.beginPath(); g.arc(joystickOrigin.x, joystickOrigin.y, 35, 0, Math.PI * 2); g.stroke();
        if (joystickPos) {
          g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(joystickPos.x, joystickPos.y, 14, 0, Math.PI * 2); g.fill();
        }
      }

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, 36);
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 24);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 24);
      g.fillStyle = '#4ff'; g.textAlign = 'center';
      g.fillText(`BOMBS:${siniBombs}`, W / 2, 24);
      // Sinistar progress
      if (siniProgress > 0 && !sinistar) {
        g.fillStyle = '#400'; g.fillRect(10, 36, W - 20, 8);
        g.fillStyle = '#f44'; g.fillRect(10, 36, (W - 20) * (siniProgress / 20), 8);
        g.fillStyle = '#f44'; g.font = `${W * 0.03}px monospace`; g.textAlign = 'left';
        g.fillText('SINISTAR BUILDING', 12, 46);
      }
      if (sinistar) {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.042}px monospace`; g.textAlign = 'center';
        g.fillText('I LIVE!  USE SINIBOMBS!', W / 2, 56);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
