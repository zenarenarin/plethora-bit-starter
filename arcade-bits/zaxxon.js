window.plethoraBit = {
  meta: {
    title: 'Zaxxon',
    author: 'plethora',
    description: 'Isometric fortress assault. Watch your altitude.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_zaxxon';

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
    function playShoot() { beep(800, 'square', 0.07, 0.13); }
    function playExplode() { beep(120, 'sawtooth', 0.3, 0.5); }
    function playAltChange() { beep(600, 'sine', 0.08, 0.15); }
    function playGameOver() { [400,300,200,100].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.3), i*160)); }

    // Isometric projection
    const ISO_ANGLE = 30 * Math.PI / 180;
    const TILE_W = 60, TILE_H = 30;
    const SCROLL_SPEED = 1.5;

    function toIso(wx, wy, wz) {
      // wx = right, wy = forward (scroll), wz = up (altitude)
      const ix = (wx - wy) * TILE_W * 0.5;
      const iy = (wx + wy) * TILE_H * 0.5 - wz * 18;
      return { x: W / 2 + ix, y: H * 0.55 + iy };
    }

    let scrollY = 0;
    let altitude = 4; // 0 (ground) to 8 (max)
    let playerX = 0; // -2 to 2 lateral
    let bullets = [], enemies = [], obstacles = [], particles = [];
    let fuel = 100;
    let fuelTanks = [];
    let autoFireTimer = 0;
    let wave = 0;
    let dragging = false, dragStart = null;

    function buildWorld() {
      obstacles = [];
      fuelTanks = [];
      // Walls the player must fly over (at various altitudes)
      for (let i = 0; i < 25; i++) {
        const fy = scrollY + 80 + i * 40;
        const type = Math.random() < 0.4 ? 'wall' : (Math.random() < 0.5 ? 'turret' : 'fuel');
        if (type === 'wall') {
          obstacles.push({ fy, fx: (Math.random() - 0.5) * 4, type: 'wall', h: 2 + Math.floor(Math.random() * 4) });
        } else if (type === 'turret') {
          obstacles.push({ fy, fx: (Math.random() - 0.5) * 4, type: 'turret', hp: 2, fireTimer: 60 + Math.random() * 60 });
        } else {
          fuelTanks.push({ fy, fx: (Math.random() - 0.5) * 4 });
        }
      }
      // Enemy ships
      for (let i = 0; i < 8 + wave * 2; i++) {
        enemies.push({ fy: scrollY + 100 + i * 60, fx: (Math.random() - 0.5) * 4, fz: 3 + Math.random() * 3, vx: (Math.random() - 0.5) * 0.02, vy: -0.8, hp: 1, fireTimer: 80 + Math.random() * 80 });
      }
    }

    function resetGame() {
      score = 0; wave = 1; scrollY = 0; altitude = 4; playerX = 0; fuel = 100;
      bullets = []; enemies = []; particles = [];
      buildWorld();
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    function drawBox(wx, wy, wz, ww, wh, wd, topCol, sideCol, frontCol) {
      // Draw isometric box (wx,wy,wz = back-left-bottom corner)
      const pts = {
        a: toIso(wx, wy, wz + wd),
        b: toIso(wx + ww, wy, wz + wd),
        c: toIso(wx + ww, wy + wh, wz + wd),
        d: toIso(wx, wy + wh, wz + wd),
        e: toIso(wx, wy, wz),
        f: toIso(wx + ww, wy, wz),
        g2: toIso(wx + ww, wy + wh, wz),
        h: toIso(wx, wy + wh, wz),
      };
      // Top face
      g.fillStyle = topCol;
      g.beginPath(); g.moveTo(pts.a.x,pts.a.y); g.lineTo(pts.b.x,pts.b.y); g.lineTo(pts.c.x,pts.c.y); g.lineTo(pts.d.x,pts.d.y); g.closePath(); g.fill();
      // Left face (south)
      g.fillStyle = sideCol;
      g.beginPath(); g.moveTo(pts.d.x,pts.d.y); g.lineTo(pts.c.x,pts.c.y); g.lineTo(pts.g2.x,pts.g2.y); g.lineTo(pts.h.x,pts.h.y); g.closePath(); g.fill();
      // Right face (east)
      g.fillStyle = frontCol;
      g.beginPath(); g.moveTo(pts.b.x,pts.b.y); g.lineTo(pts.c.x,pts.c.y); g.lineTo(pts.g2.x,pts.g2.y); g.lineTo(pts.f.x,pts.f.y); g.closePath(); g.fill();
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over') { state = 'play'; resetGame(); return; }
      dragging = true; dragStart = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!dragging || state !== 'play') return;
      const t = e.changedTouches[0];
      const dy = t.clientY - dragStart.y;
      const dx = t.clientX - dragStart.x;
      if (Math.abs(dy) > 8) {
        altitude = Math.max(1, Math.min(8, altitude - dy / 40));
        playAltChange();
      }
      if (Math.abs(dx) > 8) playerX = Math.max(-2.5, Math.min(2.5, playerX + dx / 80));
      dragStart = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); dragging = false; }, { passive: false });

    ctx.raf((dt) => {
      const spd = dt / 16;

      g.fillStyle = '#1a0a2a'; g.fillRect(0, 0, W, H);

      if (state === 'title') {
        g.fillStyle = '#f84'; g.font = `bold ${W * 0.11}px monospace`; g.textAlign = 'center';
        g.fillText('ZAXXON', W / 2, H * 0.35);
        g.fillStyle = '#fff'; g.font = `${W * 0.038}px monospace`;
        g.fillText('DRAG up/down = altitude', W / 2, H * 0.5);
        g.fillText('DRAG left/right = dodge', W / 2, H * 0.57);
        g.fillText('AUTO fires  Watch ALTITUDE gauge', W / 2, H * 0.64);
        g.fillStyle = '#ff8'; g.font = `${W * 0.05}px monospace`;
        g.fillText('TAP TO START', W / 2, H * 0.78);
        g.fillStyle = '#888'; g.font = `${W * 0.04}px monospace`;
        g.fillText(`HI: ${highScore}`, W / 2, H * 0.88);
        return;
      }

      if (state === 'over') {
        g.fillStyle = '#f44'; g.font = `bold ${W * 0.1}px monospace`; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H * 0.38);
        g.fillStyle = '#fff'; g.font = `${W * 0.05}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H * 0.52);
        g.fillStyle = '#ff8'; g.fillText(`BEST: ${highScore}`, W / 2, H * 0.62);
        g.fillStyle = '#f84'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.76);
        return;
      }

      scrollY += SCROLL_SPEED * spd;
      fuel -= 0.02 * spd;
      if (fuel <= 0) { playGameOver(); state = 'over'; return; }

      // Ground tiles
      const groundColor = ['#2a4a2a', '#223322', '#1a3a1a'];
      for (let gx = -5; gx <= 5; gx++) {
        for (let gy = -3; gy <= 15; gy++) {
          const wfy = gy + Math.floor(scrollY / TILE_H);
          const relY = (wfy * TILE_H - scrollY) / TILE_H;
          const col = groundColor[(gx + wfy * 3 + 99) % groundColor.length];
          const p1 = toIso(gx, relY, 0);
          const p2 = toIso(gx + 1, relY, 0);
          const p3 = toIso(gx + 1, relY + 1, 0);
          const p4 = toIso(gx, relY + 1, 0);
          g.fillStyle = col;
          g.beginPath(); g.moveTo(p1.x,p1.y); g.lineTo(p2.x,p2.y); g.lineTo(p3.x,p3.y); g.lineTo(p4.x,p4.y); g.closePath(); g.fill();
        }
      }

      // Fuel tanks
      for (let i = fuelTanks.length - 1; i >= 0; i--) {
        const ft = fuelTanks[i];
        const relY = (ft.fy - scrollY) / TILE_H;
        if (relY > 15 || relY < -3) continue;
        const p = toIso(ft.fx, relY, 0);
        g.fillStyle = '#ff0'; g.beginPath(); g.arc(p.x, p.y, 10, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#840'; g.font = `bold 10px monospace`; g.textAlign = 'center';
        g.fillText('F', p.x, p.y + 4);
        // Collect
        if (Math.abs(ft.fx - playerX) < 1 && Math.abs(relY - 0) < 2 && Math.abs(altitude - 1) < 2) {
          fuel = Math.min(100, fuel + 20); fuelTanks.splice(i, 1);
          beep(1200, 'sine', 0.1, 0.3); ctx.platform.haptic('light');
        }
      }

      // Obstacles
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const ob = obstacles[i];
        const relY = (ob.fy - scrollY) / TILE_H;
        if (relY < -2) { obstacles.splice(i, 1); continue; }
        if (relY > 15) continue;

        if (ob.type === 'wall') {
          drawBox(ob.fx - 0.3, relY, 0, 0.6, 0.3, ob.h, '#667', '#445', '#556');
          // Altitude collision
          if (Math.abs(ob.fx - playerX) < 0.8 && Math.abs(relY) < 1.5) {
            if (altitude < ob.h + 0.5) {
              spawnParticles(W / 2, H * 0.55, '#f84', 14); playGameOver();
              ctx.platform.haptic('heavy'); state = 'over'; return;
            }
          }
        } else if (ob.type === 'turret') {
          drawBox(ob.fx - 0.2, relY - 0.1, 0, 0.4, 0.2, 1.2, '#a55', '#833', '#944');
          ob.fireTimer -= dt;
          if (ob.fireTimer <= 0) {
            ob.fireTimer = 1200;
            enemies.push({ fy: ob.fy, fx: ob.fx, fz: 1.2, vx: (playerX - ob.fx) * 0.01, vy: -0.6, hp: 1, fireTimer: 9999, bullet: true });
          }
        }
      }

      // Enemies
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        en.fy -= en.vy * spd; en.fx += en.vx * spd;
        const relY = (en.fy - scrollY) / TILE_H;
        if (relY < -3) { enemies.splice(i, 1); continue; }
        if (relY > 14) continue;
        const p = toIso(en.fx, relY, en.fz);
        if (!en.bullet) {
          g.fillStyle = '#c44';
          g.beginPath(); g.moveTo(p.x, p.y - 12); g.lineTo(p.x + 14, p.y + 6); g.lineTo(p.x - 14, p.y + 6); g.closePath(); g.fill();
          en.fireTimer -= dt;
          if (en.fireTimer <= 0) {
            en.fireTimer = 1400;
            enemies.push({ fy: en.fy, fx: en.fx, fz: en.fz, vx: (playerX - en.fx) * 0.02, vy: -0.4, hp: 1, fireTimer: 9999, bullet: true });
          }
        } else {
          g.fillStyle = '#f84'; g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2); g.fill();
        }
        // Hit player
        if (!en.bullet) {
          if (Math.abs(en.fx - playerX) < 1 && Math.abs(relY) < 1.5 && Math.abs(en.fz - altitude) < 1.5) {
            spawnParticles(W / 2, H * 0.55, '#4af', 12); playGameOver();
            ctx.platform.haptic('heavy'); state = 'over'; return;
          }
        } else {
          if (Math.abs(en.fx - playerX) < 0.8 && Math.abs(relY) < 1 && Math.abs(en.fz - altitude) < 1.2) {
            spawnParticles(W / 2, H * 0.55, '#4af', 10); playGameOver();
            ctx.platform.haptic('heavy'); state = 'over'; return;
          }
        }
      }

      // Auto fire
      autoFireTimer -= dt;
      if (autoFireTimer <= 0) {
        autoFireTimer = 220;
        bullets.push({ fy: scrollY + 10, fx: playerX, fz: altitude, vy: 4 });
        playShoot();
      }

      // Player bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.fy += b.vy * spd;
        const relY = (b.fy - scrollY) / TILE_H;
        if (relY > 14 || relY < -3) { bullets.splice(i, 1); continue; }
        const p = toIso(b.fx, relY, b.fz);
        g.fillStyle = '#ff8'; g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2); g.fill();
        // Hit enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (en.bullet) continue;
          if (Math.abs(b.fy - en.fy) < 15 && Math.abs(b.fx - en.fx) < 0.8 && Math.abs(b.fz - en.fz) < 1.5) {
            score += 200; ctx.platform.setScore(score);
            const ep = toIso(en.fx, (en.fy - scrollY) / TILE_H, en.fz);
            spawnParticles(ep.x, ep.y, '#f84', 10); playExplode();
            enemies.splice(j, 1); bullets.splice(i, 1);
            if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
            break;
          }
        }
        // Hit obstacles (turrets)
        for (let j = obstacles.length - 1; j >= 0; j--) {
          const ob = obstacles[j];
          if (ob.type !== 'turret') continue;
          if (Math.abs(b.fy - ob.fy) < 15 && Math.abs(b.fx - ob.fx) < 0.8) {
            ob.hp--;
            bullets.splice(i, 1);
            if (ob.hp <= 0) { score += 400; spawnParticles(W / 2, H / 2, '#f84', 10); playExplode(); obstacles.splice(j, 1); if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); } }
            break;
          }
        }
      }

      // Replenish world
      if (obstacles.length < 10) buildWorld();

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * spd; p.y += p.vy * spd; p.life -= 0.04 * spd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life; g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      // Player ship
      const pp = toIso(playerX, 0, altitude);
      g.save(); g.translate(pp.x, pp.y);
      g.fillStyle = '#4af';
      g.beginPath(); g.moveTo(0, -14); g.lineTo(14, 8); g.lineTo(0, 3); g.lineTo(-14, 8); g.closePath(); g.fill();
      g.fillStyle = '#aef'; g.beginPath(); g.ellipse(0, -2, 5, 3, 0, 0, Math.PI * 2); g.fill();
      // Shadow on ground
      const sp = toIso(playerX, 0, 0);
      g.restore();
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(sp.x, sp.y, 12, 6, 0, 0, Math.PI * 2); g.fill();

      // Altitude gauge (right side)
      const gaugeX = W - 30, gaugeY = H * 0.2, gaugeH = H * 0.5;
      g.fillStyle = '#222'; g.fillRect(gaugeX - 14, gaugeY, 28, gaugeH);
      g.fillStyle = '#4af';
      const altFrac = altitude / 8;
      g.fillRect(gaugeX - 12, gaugeY + gaugeH * (1 - altFrac), 24, gaugeH * altFrac);
      g.strokeStyle = '#4af'; g.lineWidth = 2;
      g.strokeRect(gaugeX - 14, gaugeY, 28, gaugeH);
      g.fillStyle = '#fff'; g.font = `${W * 0.03}px monospace`; g.textAlign = 'center';
      g.fillText('ALT', gaugeX, gaugeY - 4);
      g.fillText(Math.round(altitude), gaugeX, gaugeY + gaugeH + 14);

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, 36);
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 24);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 50, 24);
      // Fuel
      g.fillStyle = '#300'; g.fillRect(10, 36, W * 0.5, 8);
      g.fillStyle = fuel > 30 ? '#4f8' : '#f44';
      g.fillRect(10, 36, W * 0.5 * (fuel / 100), 8);
      g.fillStyle = '#aaa'; g.font = `${W * 0.03}px monospace`; g.textAlign = 'left';
      g.fillText(`FUEL: ${Math.round(fuel)}%`, 10, 34);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
