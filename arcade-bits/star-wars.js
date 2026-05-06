window.plethoraBit = {
  meta: {
    title: 'Star Wars',
    author: 'plethora',
    description: 'Trench run. Use the Force. Fire!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const HS_KEY = 'hs_starwars';

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
    function playShoot() { beep(1200, 'square', 0.1, 0.2); }
    function playHit() { beep(200, 'sawtooth', 0.2, 0.4); }
    function playForce() { [200,300,400,300,200].forEach((f,i) => setTimeout(() => beep(f,'sine',0.18,0.35), i*80)); }
    function playFire() { [800,600,400,800,1200,2000].forEach((f,i) => setTimeout(() => beep(f,'sine',0.25,0.4), i*60)); }
    function playGameOver() { [400,300,200,100].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.3), i*180)); }
    function playWin() { [400,600,800,1200,800,600,400].forEach((f,i) => setTimeout(() => beep(f,'sine',0.2,0.35), i*80)); }

    // Trench run state
    let trenchZ = 0;         // how far along trench (0 → exhaust port at TRENCH_LEN)
    const TRENCH_LEN = 800;
    let speed = 3;
    let playerX = 0;         // -1 to 1 horizontal position
    let shield = 3;
    let forcePower = 1.0;    // 0-1
    let forceActive = false;
    let forceHeld = false;
    let difficulty = 1;

    // Obstacles in trench (perspective z positions)
    let obstacles = []; // { z, x(-1..1), type: 'turret'|'tie'|'wall', shot, hp }
    let playerBullets = [];
    let particles = [];
    let shootTimer = 0;
    let exhaustPortVisible = false;
    let exhaustWindowOpen = false;
    let exhaustTimer = 0;
    let fired = false;
    let missionResult = null;

    function resetGame() {
      trenchZ = 0; speed = 2.5 + difficulty * 0.5;
      playerX = 0; shield = 3; forcePower = 1;
      forceActive = false; forceHeld = false;
      obstacles = []; playerBullets = []; particles = [];
      exhaustPortVisible = false; exhaustWindowOpen = false;
      exhaustTimer = 0; fired = false; missionResult = null;
      generateObstacles();
    }

    function generateObstacles() {
      obstacles = [];
      const n = 20 + difficulty * 8;
      for (let i = 0; i < n; i++) {
        const z = 50 + (i / n) * (TRENCH_LEN - 100);
        const types = ['turret', 'tie', 'wall'];
        const type = types[Math.floor(Math.random() * types.length)];
        obstacles.push({ z, x: (Math.random() * 2 - 1) * 0.7, type, hp: type === 'wall' ? 3 : 1, fireTimer: 40 + Math.random() * 60, shot: null });
      }
    }

    function spawnParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col });
      }
    }

    // Perspective projection
    function project(worldX, worldY, worldZ) {
      const fov = 0.8;
      const depth = Math.max(1, worldZ - trenchZ);
      const scale = (H * fov) / depth;
      return { x: W / 2 + worldX * scale, y: H * 0.45 + worldY * scale, scale };
    }

    function drawTrench() {
      // Walls
      const WALL_W = 1.5, WALL_H = 0.8;
      const horizons = [20, 60, 120, 200, 350, 600, 1200];
      for (const dz of horizons) {
        const near = project(-WALL_W, -WALL_H, trenchZ + dz);
        const nearR = project(WALL_W, -WALL_H, trenchZ + dz);
        const nearBL = project(-WALL_W, WALL_H, trenchZ + dz);
        const nearBR = project(WALL_W, WALL_H, trenchZ + dz);
        const far = project(-WALL_W, -WALL_H, trenchZ + dz * 1.3);
        const farR = project(WALL_W, -WALL_H, trenchZ + dz * 1.3);
        const farBL = project(-WALL_W, WALL_H, trenchZ + dz * 1.3);
        const farBR = project(WALL_W, WALL_H, trenchZ + dz * 1.3);

        const alpha = Math.min(1, dz / 30) * 0.4;
        g.fillStyle = `rgba(100,80,80,${alpha})`;
        // Left wall
        g.beginPath(); g.moveTo(near.x, near.y); g.lineTo(far.x, far.y); g.lineTo(farBL.x, farBL.y); g.lineTo(nearBL.x, nearBL.y); g.fill();
        // Right wall
        g.fillStyle = `rgba(80,80,100,${alpha})`;
        g.beginPath(); g.moveTo(nearR.x, nearR.y); g.lineTo(farR.x, farR.y); g.lineTo(farBR.x, farBR.y); g.lineTo(nearBR.x, nearBR.y); g.fill();
        // Floor
        g.fillStyle = `rgba(60,60,60,${alpha})`;
        g.beginPath(); g.moveTo(nearBL.x, nearBL.y); g.lineTo(farBL.x, farBL.y); g.lineTo(farBR.x, farBR.y); g.lineTo(nearBR.x, nearBR.y); g.fill();

        // Panel lines
        g.strokeStyle = `rgba(200,100,0,${alpha * 0.6})`; g.lineWidth = 1;
        g.strokeRect(near.x + 4, near.y, nearR.x - near.x - 8, nearBL.y - near.y);
      }
    }

    let dragging = false, dragX = null;
    let fireBtn = false;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); initAudio();
      const t = e.changedTouches[0];
      if (state === 'title') { state = 'play'; resetGame(); ctx.platform.start(); return; }
      if (state === 'over' || state === 'win') { state = 'play'; resetGame(); return; }
      // Force hold (right side hold)
      if (t.clientX > W * 0.65) { forceHeld = true; forceActive = true; playForce(); ctx.platform.haptic('medium'); return; }
      // Fire (exhaust port moment)
      if (exhaustPortVisible && t.clientX < W * 0.35 && !fired) {
        fired = true; playFire(); ctx.platform.haptic('heavy');
        return;
      }
      dragging = true; dragX = t.clientX;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (state !== 'play') return;
      const t = e.changedTouches[0];
      if (t.clientX > W * 0.65) return;
      if (dragging && dragX !== null) {
        const delta = (t.clientX - dragX) / W;
        playerX = Math.max(-0.8, Math.min(0.8, playerX + delta * 2));
        dragX = t.clientX;
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault(); dragging = false; dragX = null;
      forceHeld = false; forceActive = false;
    }, { passive: false });

    // Auto fire
    ctx.raf((dt) => {
      const timeScale = forceActive ? 0.3 : 1;
      const spd = (dt / 16) * timeScale;
      const realSpd = dt / 16;

      if (forceActive) forcePower = Math.max(0, forcePower - 0.008 * realSpd);
      else forcePower = Math.min(1, forcePower + 0.003 * realSpd);
      if (forcePower <= 0) { forceActive = false; forceHeld = false; }

      // BG: space
      g.fillStyle = '#000008'; g.fillRect(0, 0, W, H);
      // Stars at top
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 137 + trenchZ * 0.2) % W + W) % W;
        const sy = (i * 73) % (H * 0.4);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(sx, sy, 1.5, 1.5);
      }

      if (state === 'title') {
        g.fillStyle = '#f84'; g.font = `bold ${W * 0.09}px monospace`; g.textAlign = 'center';
        g.fillText('STAR WARS', W / 2, H * 0.32);
        g.fillStyle = '#ff8'; g.font = `${W * 0.038}px monospace`;
        g.fillText('DRAG left/right to steer', W / 2, H * 0.47);
        g.fillText('TAP to shoot', W / 2, H * 0.54);
        g.fillStyle = '#4af';
        g.fillText('HOLD right side = FORCE (slow time)', W / 2, H * 0.61);
        g.fillStyle = '#0f8';
        g.fillText('TAP when exhaust port opens!', W / 2, H * 0.68);
        g.fillStyle = '#ff8'; g.font = `${W * 0.05}px monospace`;
        g.fillText('TAP TO START', W / 2, H * 0.8);
        g.fillStyle = '#888'; g.font = `${W * 0.04}px monospace`;
        g.fillText(`HI: ${highScore}`, W / 2, H * 0.9);
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

      if (state === 'win') {
        g.fillStyle = '#ff8'; g.font = `bold ${W * 0.08}px monospace`; g.textAlign = 'center';
        g.fillText('GREAT SHOT!', W / 2, H * 0.35);
        g.fillStyle = '#0f8'; g.font = `${W * 0.046}px monospace`;
        g.fillText('DEATH STAR DESTROYED', W / 2, H * 0.46);
        g.fillStyle = '#fff'; g.font = `${W * 0.05}px monospace`;
        g.fillText(`SCORE: ${score}`, W / 2, H * 0.58);
        g.fillStyle = '#ff8'; g.fillText(`BEST: ${highScore}`, W / 2, H * 0.68);
        g.fillStyle = '#f84'; g.font = `${W * 0.045}px monospace`;
        g.fillText('TAP TO RESTART', W / 2, H * 0.8);
        return;
      }

      // Advance trench
      trenchZ += speed * spd;

      // Auto fire
      shootTimer -= dt;
      if (shootTimer <= 0) {
        shootTimer = 300;
        playerBullets.push({ x: playerX, z: trenchZ + 5 });
        playShoot();
      }

      // Exhaust port logic
      const distToEnd = TRENCH_LEN - trenchZ;
      exhaustPortVisible = distToEnd < 80 && distToEnd > 0;
      if (exhaustPortVisible) {
        exhaustTimer += dt;
        exhaustWindowOpen = exhaustTimer > 600 && exhaustTimer < 1800;
        if (fired && exhaustWindowOpen) {
          score += 5000 + difficulty * 2000;
          if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
          ctx.platform.complete({ score });
          playWin(); state = 'win'; return;
        }
        if (distToEnd < 0) {
          if (!fired) { playGameOver(); state = 'over'; return; }
        }
      }

      drawTrench();

      // Draw exhaust port
      if (exhaustPortVisible) {
        const ep = project(0, 0.3, trenchZ + distToEnd * 0.5);
        const portSize = ep.scale * 0.2;
        g.fillStyle = exhaustWindowOpen ? '#0f8' : '#666';
        g.beginPath(); g.arc(ep.x, ep.y, portSize, 0, Math.PI * 2); g.fill();
        if (exhaustWindowOpen) {
          g.strokeStyle = '#0f8'; g.lineWidth = 3; g.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() * 0.01);
          g.beginPath(); g.arc(ep.x, ep.y, portSize * 2, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
        }
      }

      // Obstacles
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const ob = obstacles[i];
        if (ob.z < trenchZ - 5) { obstacles.splice(i, 1); continue; }
        if (ob.z > trenchZ + 600) continue;
        const depth = ob.z - trenchZ;
        if (depth < 2) continue;
        const p = project(ob.x, 0, ob.z);

        // Fire at player
        ob.fireTimer -= dt;
        if (ob.fireTimer <= 0 && depth < 200) {
          ob.fireTimer = 800 + Math.random() * 600;
          ob.shot = { x: ob.x, z: ob.z, vz: -6 };
        }
        if (ob.shot) {
          ob.shot.z += ob.shot.vz * spd;
          if (ob.shot.z < trenchZ + 5) {
            // Hit player check
            if (Math.abs(ob.shot.x - playerX) < 0.25) {
              shield--;
              spawnParticles(W / 2, H * 0.8, '#f44', 10); playHit();
              ctx.platform.haptic('medium');
              if (shield <= 0) { playGameOver(); state = 'over'; return; }
            }
            ob.shot = null;
          } else {
            const sp = project(ob.shot.x, 0.1, ob.shot.z);
            g.fillStyle = '#f44'; g.beginPath(); g.arc(sp.x, sp.y, 6, 0, Math.PI * 2); g.fill();
          }
        }

        // Draw obstacle
        const size = p.scale * 0.25;
        if (ob.type === 'wall') {
          g.fillStyle = '#886644'; g.fillRect(p.x - size * 2, p.y - p.scale * 0.4, size * 4, p.scale * 0.8);
        } else if (ob.type === 'turret') {
          g.fillStyle = '#668'; g.fillRect(p.x - size, p.y - size * 2, size * 2, size * 3);
          g.fillStyle = '#88a'; g.beginPath(); g.arc(p.x, p.y - size * 1.5, size * 0.6, 0, Math.PI * 2); g.fill();
        } else {
          // TIE fighter
          g.fillStyle = '#aaa';
          g.fillRect(p.x - size * 0.5, p.y - size * 0.5, size, size);
          g.fillStyle = '#888';
          g.fillRect(p.x - size * 2, p.y - size * 1.2, size * 1.2, size * 2.4);
          g.fillRect(p.x + size * 0.8, p.y - size * 1.2, size * 1.2, size * 2.4);
        }

        // Player bullet collision
        for (let j = playerBullets.length - 1; j >= 0; j--) {
          const b = playerBullets[j];
          if (Math.abs(b.z - ob.z) < 15 && Math.abs(b.x - ob.x) < 0.3) {
            ob.hp--;
            playerBullets.splice(j, 1);
            spawnParticles(p.x, p.y, '#f84', 8);
            if (ob.hp <= 0) {
              score += ob.type === 'wall' ? 150 : 300;
              ctx.platform.setScore(score);
              spawnParticles(p.x, p.y, '#ff8', 12);
              obstacles.splice(i, 1);
              if (score > highScore) { highScore = score; ctx.storage.set(HS_KEY, highScore); }
            }
            break;
          }
        }

        // Contact
        if (depth < 8 && Math.abs(ob.x - playerX) < 0.3) {
          if (ob.type !== 'wall') obstacles.splice(i, 1);
          shield--; spawnParticles(W / 2, H * 0.8, '#f44', 10); playHit();
          ctx.platform.haptic('heavy');
          if (shield <= 0) { playGameOver(); state = 'over'; return; }
        }
      }

      // Player bullets
      for (let i = playerBullets.length - 1; i >= 0; i--) {
        const b = playerBullets[i];
        b.z += 8 * spd;
        if (b.z > trenchZ + 600) { playerBullets.splice(i, 1); continue; }
        const bp = project(b.x, 0, b.z);
        g.fillStyle = '#ff8'; g.beginPath(); g.arc(bp.x, bp.y, 4, 0, Math.PI * 2); g.fill();
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * realSpd; p.y += p.vy * realSpd; p.life -= 0.04 * realSpd;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        g.globalAlpha = p.life; g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      // Player crosshair
      const cx = W / 2 + playerX * W * 0.35;
      g.strokeStyle = '#ff8'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - 14, H * 0.82); g.lineTo(cx + 14, H * 0.82); g.stroke();
      g.beginPath(); g.moveTo(cx, H * 0.82 - 14); g.lineTo(cx, H * 0.82 + 14); g.stroke();
      // X-wing icon
      g.fillStyle = '#4af'; g.font = `${W * 0.06}px monospace`; g.textAlign = 'center';
      g.fillText('✦', cx, H * 0.82 + 4);

      // HUD
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, 36);
      g.fillStyle = '#fff'; g.font = `bold ${W * 0.04}px monospace`; g.textAlign = 'left';
      g.fillText(`${score}`, 10, 24);
      g.fillStyle = '#ff8'; g.textAlign = 'right';
      g.fillText(`HI:${highScore}`, W - 10, 24);
      // Shield
      g.fillStyle = '#4af'; g.textAlign = 'center';
      g.fillText(`◆`.repeat(shield) + `◇`.repeat(3 - shield), W / 2, 24);
      // Force meter
      g.fillStyle = '#222'; g.fillRect(W * 0.03, H * 0.88, W * 0.2, 8);
      g.fillStyle = forceActive ? '#ff8' : '#4af';
      g.fillRect(W * 0.03, H * 0.88, W * 0.2 * forcePower, 8);
      g.fillStyle = '#aaa'; g.font = `${W * 0.03}px monospace`; g.textAlign = 'left';
      g.fillText('FORCE', W * 0.03, H * 0.88 - 4);
      // Progress
      const prog = trenchZ / TRENCH_LEN;
      g.fillStyle = '#333'; g.fillRect(W * 0.03, H * 0.96, W * 0.94, 6);
      g.fillStyle = '#f84'; g.fillRect(W * 0.03, H * 0.96, W * 0.94 * prog, 6);
      if (exhaustPortVisible) {
        g.fillStyle = exhaustWindowOpen ? '#0f8' : '#f84';
        g.font = `bold ${W * 0.038}px monospace`; g.textAlign = 'center';
        g.fillText(exhaustWindowOpen ? 'FIRE NOW! TAP!' : 'WAIT FOR IT...', W / 2, H * 0.95);
      }
      // FORCE hint
      g.fillStyle = 'rgba(100,150,255,0.4)'; g.font = `${W * 0.03}px monospace`; g.textAlign = 'right';
      g.fillText('HOLD→ FORCE', W - 10, H * 0.88 + 8);
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
