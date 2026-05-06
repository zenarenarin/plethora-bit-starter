// JUMP-N-BUMP — Endless Vertical Jumper (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Jump-n-Bump',
    author: 'plethora',
    description: 'Bounce up forever. Tap left/right to steer.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom + 10;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#76FF03';
    const BG = '#0f0f14';
    const HUD_H = 48;

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
    function playBounce(height) {
      const f = 300 + Math.min(height * 0.3, 400);
      playTone(f, 'sine', 0.12, 0.25);
    }
    function playSuperBounce() { playTone(880, 'sine', 0.25, 0.35); }
    function playSpring() { if (!audioCtx) return; [440, 660, 880].forEach((f, i) => setTimeout(() => playTone(f, 'triangle', 0.1, 0.2), i * 50)); }
    function playFall() { if (!audioCtx) return; [600, 400, 240].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.18, 0.3), i * 100)); }

    // Platform types
    const PT_NORMAL = 0;
    const PT_CRUMBLE = 1;
    const PT_BOUNCY = 2;
    const PT_MOVING = 3;

    const PLAT_W = 70;
    const PLAT_H = 12;
    const CHAR_W = 22;
    const CHAR_H = 24;
    const GRAVITY = 1200;
    const JUMP_VEL = -620;
    const SUPER_JUMP_VEL = -1050;
    const MOVE_SPEED = 180;

    let player, platforms, particles, score, highScore;
    let gameOver, started, worldY, cameraY;
    let moveDir = 0; // -1 left, 0 none, 1 right

    function makePlatform(x, y, type) {
      return { x, y, w: PLAT_W, h: PLAT_H, type, crumbleT: 0, crumbling: false, broken: false, mx: (type === PT_MOVING) ? (Math.random() < 0.5 ? 60 : -60) : 0 };
    }

    function initGame() {
      highScore = ctx.storage.get('hs_jumpnbump') || 0;
      worldY = 0; cameraY = 0;
      score = 0; gameOver = false; started = false; moveDir = 0;
      particles = [];

      // Seed platforms from bottom
      platforms = [];
      // Starting platform right under player
      platforms.push(makePlatform(W / 2 - PLAT_W / 2, H * 0.72, PT_NORMAL));

      let y = H * 0.72;
      for (let i = 0; i < 22; i++) {
        y -= 80 + Math.random() * 30;
        const type = Math.random() < 0.15 ? PT_CRUMBLE : Math.random() < 0.15 ? PT_BOUNCY : Math.random() < 0.12 ? PT_MOVING : PT_NORMAL;
        const x = PLAT_W / 2 + Math.random() * (W - PLAT_W * 1.5);
        platforms.push(makePlatform(x, y, type));
      }

      player = {
        x: W / 2, y: H * 0.72 - CHAR_H,
        vx: 0, vy: 0,
        onGround: false,
        squash: 1, squashVy: 0,
        lastBounceY: 0,
      };
    }

    function addParticles(x, y, col, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 80;
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.3, col });
      }
    }

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

      moveDir = tx < W / 2 ? -1 : 1;
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      moveDir = 0;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      moveDir = t.clientX < W / 2 ? -1 : 1;
    }, { passive: false });

    initGame();

    // Track highest worldY for platform generation
    let highestGenY = -H * 0.72 * 0.5;

    ctx.raf((dt) => {
      const sec = dt / 1000;

      if (!gameOver && started) {
        // Horizontal movement
        player.vx = moveDir * MOVE_SPEED;

        // Gravity
        player.vy += GRAVITY * sec;

        // Move
        player.x += player.vx * sec;
        player.y += player.vy * sec;

        // Wrap horizontal
        if (player.x < -CHAR_W / 2) player.x = W + CHAR_W / 2;
        if (player.x > W + CHAR_W / 2) player.x = -CHAR_W / 2;

        // World height: worldY tracks how high we've gone (positive = higher)
        const absY = -player.y + H * 0.72;
        if (absY > worldY) worldY = absY;
        score = Math.max(score, Math.floor(worldY / 10));
        if (score > highScore) highScore = score;

        // Camera: smoothly follow player upward only
        const targetCam = player.y - H * 0.55;
        if (targetCam < cameraY) cameraY += (targetCam - cameraY) * Math.min(1, sec * 5);

        // Squash/stretch
        if (player.squash !== 1) {
          player.squash += (1 - player.squash) * Math.min(1, sec * 12);
          if (Math.abs(player.squash - 1) < 0.01) player.squash = 1;
        }

        // Platform collision (only when falling)
        player.onGround = false;
        if (player.vy >= 0) {
          for (const plat of platforms) {
            if (plat.broken) continue;
            const screenY = plat.y - cameraY;
            // Player feet
            const feet = player.y + CHAR_H / 2;
            const feetPrev = feet - player.vy * sec; // approximate previous
            if (
              player.x + CHAR_W * 0.4 > plat.x &&
              player.x - CHAR_W * 0.4 < plat.x + plat.w &&
              feet >= plat.y - cameraY &&
              feet - player.vy * sec <= plat.y - cameraY + PLAT_H
            ) {
              // Land on platform
              player.y = plat.y - cameraY - CHAR_H / 2;
              const bounceH = Math.abs(player.vy);
              if (plat.type === PT_BOUNCY) {
                player.vy = SUPER_JUMP_VEL;
                player.squash = 0.55;
                addParticles(player.x, player.y + CHAR_H / 2, '#76FF03', 10);
                playSuperBounce();
                ctx.platform.haptic('heavy');
              } else {
                player.vy = JUMP_VEL;
                player.squash = 0.65;
                playBounce(bounceH);
                ctx.platform.haptic('light');
              }
              player.onGround = true;
              if (plat.type === PT_CRUMBLE) {
                plat.crumbling = true;
                plat.crumbleT = 600;
              }
              break;
            }
          }
        }

        // Update crumbling platforms
        for (const plat of platforms) {
          if (plat.crumbling) {
            plat.crumbleT -= dt;
            if (plat.crumbleT <= 0) {
              plat.broken = true;
              addParticles(plat.x + plat.w / 2, plat.y - cameraY, '#888', 8);
            }
          }
          if (plat.type === PT_MOVING && !plat.broken) {
            plat.x += plat.mx * sec;
            if (plat.x <= PLAT_W * 0.1 || plat.x >= W - PLAT_W * 1.1) plat.mx *= -1;
          }
        }

        // Remove platforms far below camera
        platforms = platforms.filter(p => p.y - cameraY < H + 200);

        // Generate more platforms above
        const topPlat = platforms.reduce((a, b) => b.y < a.y ? b : a, { y: 0 });
        let genY = topPlat.y;
        while (genY > cameraY - H) {
          const gap = 75 + Math.random() * 35 + Math.min(score / 300, 25);
          genY -= gap;
          const type = Math.random() < 0.12 ? PT_CRUMBLE : Math.random() < 0.12 ? PT_BOUNCY : Math.random() < 0.1 ? PT_MOVING : PT_NORMAL;
          const x = PLAT_W * 0.2 + Math.random() * (W - PLAT_W * 1.4);
          platforms.push(makePlatform(x, genY, type));
        }

        // Update particles
        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec; p.vy += 300 * sec;
          p.life -= sec; return p.life > 0;
        });

        // Fall = game over (player goes below visible area)
        if (player.y - cameraY > H + CHAR_H) {
          gameOver = true;
          playFall();
          ctx.storage.set('hs_jumpnbump', highScore);
          ctx.platform.setScore(score);
          ctx.platform.fail({ reason: 'fell off screen' });
        }

        ctx.platform.setScore(score);
        ctx.platform.setProgress(Math.min(1, score / 5000));
      }

      // ===== DRAW =====
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // Background stars
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137 + 5) % W;
        const sy = ((i * 91 + 13) % (H * 2) + cameraY * 0.3) % H;
        if (sy > HUD_H) g.fillRect(sx, sy, 2, 2);
      }

      // Platforms
      platforms.forEach(plat => {
        const py = plat.y - cameraY;
        if (py < HUD_H - 20 || py > H + 20) return;

        const alpha = plat.crumbling ? Math.max(0.2, plat.crumbleT / 600) : 1;
        g.globalAlpha = alpha;

        switch (plat.type) {
          case PT_NORMAL:
            g.fillStyle = '#445566';
            g.fillRect(plat.x, py, plat.w, plat.h);
            g.fillStyle = '#667788';
            g.fillRect(plat.x, py, plat.w, 3);
            break;
          case PT_CRUMBLE:
            g.fillStyle = plat.crumbling ? '#AA6622' : '#887755';
            g.fillRect(plat.x, py, plat.w, plat.h);
            // Cracks
            g.strokeStyle = '#554433';
            g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(plat.x + plat.w * 0.3, py); g.lineTo(plat.x + plat.w * 0.4, py + plat.h); g.stroke();
            g.beginPath(); g.moveTo(plat.x + plat.w * 0.65, py); g.lineTo(plat.x + plat.w * 0.55, py + plat.h); g.stroke();
            break;
          case PT_BOUNCY:
            g.fillStyle = ACCENT;
            g.fillRect(plat.x, py + 2, plat.w, plat.h - 4);
            g.fillStyle = '#AAFF55';
            g.fillRect(plat.x, py, plat.w, 4);
            // Spring symbol
            g.strokeStyle = '#fff';
            g.lineWidth = 1.5;
            g.beginPath();
            for (let xi = 0; xi <= 4; xi++) {
              const bx = plat.x + plat.w * 0.2 + xi * plat.w * 0.6 / 4;
              const by = py + (xi % 2 === 0 ? 3 : plat.h - 3);
              xi === 0 ? g.moveTo(bx, by) : g.lineTo(bx, by);
            }
            g.stroke();
            break;
          case PT_MOVING:
            g.fillStyle = '#6644AA';
            g.fillRect(plat.x, py, plat.w, plat.h);
            g.fillStyle = '#9966DD';
            g.fillRect(plat.x, py, plat.w, 3);
            // Arrow indicators
            g.fillStyle = '#DDAAFF';
            g.font = '9px monospace';
            g.textAlign = 'center';
            g.fillText(plat.mx > 0 ? '▶' : '◀', plat.x + plat.w / 2, py + 10);
            break;
        }
        g.globalAlpha = 1;
      });

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.col;
        g.fillRect(p.x - 2, p.y - 2, 5, 5);
      });
      g.globalAlpha = 1;

      // Player character
      if (!gameOver) {
        const px = player.x;
        const py = player.y - cameraY;
        const sw = CHAR_W * (2 - player.squash);
        const sh = CHAR_H * player.squash;
        const ox = px - sw / 2;
        const oy = py - sh / 2;

        // Body (squash/stretch)
        g.fillStyle = ACCENT;
        g.fillRect(ox, oy, sw, sh);
        // Eyes
        g.fillStyle = '#000';
        g.fillRect(ox + sw * 0.2, oy + sh * 0.2, sw * 0.15, sh * 0.18);
        g.fillRect(ox + sw * 0.6, oy + sh * 0.2, sw * 0.15, sh * 0.18);
        // Smile
        g.strokeStyle = '#000';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(px, oy + sh * 0.65, sw * 0.22, 0, Math.PI);
        g.stroke();
        // Ears/bumps
        g.fillStyle = '#55CC00';
        g.fillRect(ox - 3, oy + sh * 0.1, 5, sh * 0.3);
        g.fillRect(ox + sw - 2, oy + sh * 0.1, 5, sh * 0.3);
      }

      // HUD
      g.fillStyle = '#13131a';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      g.fillStyle = ACCENT;
      g.font = 'bold 18px "Courier New"';
      g.textAlign = 'left';
      g.fillText('JUMP', 16, 24);

      g.fillStyle = '#fff';
      g.font = 'bold 16px "Courier New"';
      g.textAlign = 'right';
      g.fillText(score, W - 50, 24);

      g.fillStyle = '#888';
      g.font = '10px "Courier New"';
      g.textAlign = 'right';
      g.fillText('BEST ' + highScore, W - 50, 40);

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
        g.fillText('HOW TO PLAY', W / 2, H / 2 - 110);
        g.fillStyle = '#fff';
        g.font = '15px "Courier New"';
        const lines = [
          'Hold LEFT side → move left',
          'Hold RIGHT side → move right',
          '',
          'Character bounces automatically.',
          '',
          'GREY = normal platform',
          'BROWN = crumbles after landing',
          'GREEN = super bounce!',
          'PURPLE = moving platform',
          '',
          'Fall below screen = game over.',
        ];
        lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 - 65 + i * 23));
        g.fillStyle = '#888';
        g.font = '13px "Courier New"';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, H / 2 + 185);
        g.textAlign = 'left';
        return;
      }

      // Start overlay
      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.65)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = ACCENT;
        g.font = 'bold 28px "Courier New"';
        g.textAlign = 'center';
        g.fillText('JUMP-N-BUMP', W / 2, H / 2 - 30);
        g.fillStyle = '#fff';
        g.font = '15px "Courier New"';
        g.fillText('Hold left/right to steer', W / 2, H / 2 + 10);
        g.fillText('Bounce on platforms to rise!', W / 2, H / 2 + 34);
        g.fillStyle = ACCENT;
        g.font = 'bold 14px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 68);
        g.textAlign = 'left';
      }

      // Game over
      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = '#FF1744';
        g.font = 'bold 36px "Courier New"';
        g.textAlign = 'center';
        g.fillText('FELL!', W / 2, H / 2 - 40);
        g.fillStyle = ACCENT;
        g.font = 'bold 20px "Courier New"';
        g.fillText('HEIGHT: ' + score, W / 2, H / 2);
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
