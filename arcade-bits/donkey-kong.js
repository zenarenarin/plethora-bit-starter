// DONKEY KONG — Climb to the top dodging barrels (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Donkey Kong',
    author: 'plethora',
    description: 'Climb ladders, jump barrels. Reach the top!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SAFE = ctx.safeArea.bottom;

    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type = 'square', vol = 0.25) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playJump() { playTone(600, 0.1, 'square', 0.25); }
    function playDie() { [400, 320, 240].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'sawtooth', 0.3), i * 110)); }
    function playScore() { playTone(880, 0.12, 'sine', 0.3); }
    function playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.4), i * 120)); }
    function playBarrel() { playTone(180, 0.08, 'square', 0.2); }

    // Virtual world dimensions
    const VW = 200, VH = 300;
    function SX() { return W / VW; }
    function SY() { return (H - SAFE - 20) / VH; }
    function vx(x) { return x * SX(); }
    function vy(y) { return y * SY(); }

    const PLATFORMS = [
      { y: 280, x1: 5, x2: 195, slope: 0 },
      { y: 230, x1: 5, x2: 195, slope: -0.08 },
      { y: 180, x1: 5, x2: 195, slope: 0.08 },
      { y: 130, x1: 5, x2: 195, slope: -0.08 },
      { y: 80, x1: 5, x2: 195, slope: 0 },
    ];
    const LADDERS = [
      { x: 40, y1: 230, y2: 280 },
      { x: 160, y1: 180, y2: 230 },
      { x: 50, y1: 130, y2: 180 },
      { x: 150, y1: 80, y2: 130 },
    ];

    function platY(p, x) { return p.y + (x - p.x1) * p.slope; }
    function platAt(x, y) {
      for (const p of PLATFORMS) {
        if (x >= p.x1 && x <= p.x2) {
          const py = platY(p, x);
          if (Math.abs(y - py) < 5) return p;
        }
      }
      return null;
    }

    let player, barrels, particles, score, lives, running, win, tick, spawnT, started;
    let leftDown = false, rightDown = false, upDown = false, downDown = false;

    function reset() {
      player = { x: 30, y: 280, vy: 0, onGround: true, climbing: false, jumpT: 0, face: 1 };
      barrels = []; particles = [];
      score = 0; lives = 3; running = true; win = false; tick = 0; spawnT = 0;
    }

    function jump() {
      if (player.onGround && !player.climbing) {
        player.vy = -3.5; player.onGround = false; player.jumpT = 1;
        playJump();
      }
    }

    // Touch controls: left half = walk left, right half = walk right
    // Swipe up = climb up, swipe down = climb down
    // Double-tap = jump
    let touchStartX = null, touchStartY = null, touchStartTime = 0, lastTapTime = 0;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
      const t = e.changedTouches[0];
      touchStartX = t.clientX; touchStartY = t.clientY;
      touchStartTime = Date.now();
      const now = Date.now();
      if (now - lastTapTime < 300) jump();
      lastTapTime = now;
      if (t.clientX < W / 2) { leftDown = true; rightDown = false; player.face = -1; }
      else { rightDown = true; leftDown = false; player.face = 1; }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!touchStartY) return;
      const t = e.changedTouches[0];
      const dy = t.clientY - touchStartY;
      upDown = dy < -20; downDown = dy > 20;
      if (Math.abs(dy) > 20) { leftDown = false; rightDown = false; }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      leftDown = rightDown = upDown = downDown = false;
      touchStartX = touchStartY = null;
    }, { passive: false });

    reset();

    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      if (running && started) {
        // Spawn barrels
        spawnT += dt;
        if (spawnT > 2000) {
          spawnT = 0;
          barrels.push({ x: 30, y: 80, vx: 1.0, vy: 0, rot: 0, onPlat: PLATFORMS[4] });
          playBarrel();
        }

        // Player movement
        const spd = 60 * sec;
        const onL = LADDERS.find(l => Math.abs(l.x - player.x) < 5 && player.y >= l.y1 - 3 && player.y <= l.y2 + 3);
        if (upDown && onL) { player.climbing = true; player.y -= spd; if (player.y < onL.y1) player.y = onL.y1; }
        else if (downDown && onL) { player.climbing = true; player.y += spd; if (player.y > onL.y2) player.y = onL.y2; }
        if (player.climbing && !onL) player.climbing = false;

        if (!player.climbing) {
          if (leftDown) player.x -= spd;
          if (rightDown) player.x += spd;
          player.vy += 0.3;
          player.y += player.vy;
          const p = platAt(player.x, player.y);
          if (p && player.vy >= 0) {
            player.y = platY(p, player.x);
            player.vy = 0;
            player.onGround = true; player.jumpT = 0;
          } else {
            player.onGround = false;
          }
        }
        player.x = Math.max(5, Math.min(195, player.x));

        // Win condition
        if (player.y <= 85 && player.x > 155) {
          win = true; running = false; score += 500;
          ctx.platform.complete({ score });
          playWin();
        }

        // Barrels
        barrels.forEach(b => {
          b.rot += b.vx * 0.2;
          b.x += b.vx;
          const p2 = platAt(b.x, b.y);
          if (p2) { b.y = platY(p2, b.x); b.vy = 0; }
          else { b.vy += 0.25; b.y += b.vy; }
          if (b.x < 3 || b.x > 197) b.vx = -b.vx;
          // Jump over barrel
          if (player.jumpT > 0 && Math.abs(player.x - b.x) < 8 && player.y < b.y - 2) {
            score += 100; ctx.platform.setScore(score); b.scored = true; playScore();
          }
          // Collision
          if (Math.abs(player.x - b.x) < 7 && Math.abs(player.y - b.y) < 12) {
            lives--;
            for (let i = 0; i < 12; i++) particles.push({ x: vx(player.x), y: vy(player.y), vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 150 - 50, c: '#FF0000', life: 0.5 });
            player.x = 30; player.y = 280; player.vy = 0;
            ctx.platform.haptic('heavy'); playDie();
            if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'hit by barrel' }); }
          }
        });
        barrels = barrels.filter(b => b.y < 310);
        if (player.jumpT > 0 && player.onGround) player.jumpT = 0;

        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec; p.vy += 200 * sec; p.life -= sec;
          return p.life > 0;
        });
      }

      // Draw
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(255,0,80,0.07)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Platforms
      PLATFORMS.forEach(p => {
        const y1 = vy(p.y), y2 = vy(platY(p, p.x2));
        g.strokeStyle = '#FF00AA'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(vx(p.x1), y1); g.lineTo(vx(p.x2), y2); g.stroke();
        g.fillStyle = '#FFE066';
        for (let x = p.x1 + 5; x < p.x2; x += 18) g.fillRect(vx(x) - 1.5, vy(platY(p, x)) - 1.5, 3, 3);
      });

      // Ladders
      LADDERS.forEach(l => {
        const lw = vx(l.x + 4) - vx(l.x - 4);
        const x1 = vx(l.x - 3), x2 = vx(l.x + 3);
        const y1 = vy(l.y1), y2 = vy(l.y2);
        g.strokeStyle = '#00FFDD'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1, y2); g.moveTo(x2, y1); g.lineTo(x2, y2); g.stroke();
        for (let y = l.y1 + 5; y < l.y2; y += 7) {
          const ys = vy(y); g.beginPath(); g.moveTo(x1, ys); g.lineTo(x2, ys); g.stroke();
        }
      });

      // Kong
      {
        const kx = vx(20), ky = vy(80) - vy(22);
        g.fillStyle = '#8B4513'; g.fillRect(kx, ky, vx(40), vy(22) - vy(0));
        g.fillStyle = '#D2691E'; g.fillRect(kx + 4, ky + 4, vx(22) - vx(0), vy(12) - vy(0));
        g.fillStyle = '#FFF'; g.fillRect(kx + 8, ky + 6, 4, 5); g.fillRect(kx + 20, ky + 6, 4, 5);
        g.fillStyle = '#000'; g.fillRect(kx + 9, ky + 7, 2, 2); g.fillRect(kx + 21, ky + 7, 2, 2);
      }

      // Princess
      {
        const px = vx(170), py = vy(75);
        g.fillStyle = '#FF69B4'; g.fillRect(px - 6, py - 14, 12, 14);
        g.fillStyle = '#FFCC99'; g.fillRect(px - 5, py - 22, 10, 8);
        g.fillStyle = '#FFFF00'; g.fillRect(px - 6, py - 24, 12, 4);
        g.fillStyle = '#FFF'; g.font = 'bold 9px "Courier New"'; g.fillText('HELP!', px - 12, py - 28);
      }

      // Barrels
      barrels.forEach(b => {
        g.save(); g.translate(vx(b.x), vy(b.y) - 5);
        g.rotate(b.rot);
        const bw = vx(10) - vx(0), bh = vy(8) - vy(0);
        g.fillStyle = '#CC6600'; g.fillRect(-bw / 2, -bh / 2, bw, bh);
        g.fillStyle = '#663300'; g.fillRect(-bw / 2, -bh * 0.3, bw, 1.5); g.fillRect(-bw / 2, bh * 0.1, bw, 1.5);
        g.restore();
      });

      // Mario
      {
        const px = vx(player.x), py = vy(player.y);
        const w = vx(12) - vx(0), h = vy(18) - vy(0);
        g.fillStyle = '#FF0000'; g.fillRect(px - w / 2, py - h, w, h * 0.25);
        g.fillStyle = '#FFCC99'; g.fillRect(px - w / 2 + 1, py - h * 0.72, w - 2, h * 0.28);
        g.fillStyle = '#000';
        g.fillRect(px + (player.face > 0 ? 0 : -w / 2 + 1), py - h * 0.62, 2, 2);
        g.fillStyle = '#2222FF'; g.fillRect(px - w / 2, py - h * 0.4, w, h * 0.4);
        g.fillStyle = '#FF0000';
        g.fillRect(px - w / 2, py - h * 0.12, w * 0.45, h * 0.12);
        g.fillRect(px + w * 0.05, py - h * 0.12, w * 0.45, h * 0.12);
        g.fillStyle = '#663300';
        g.fillRect(px - w / 2, py - 2, w * 0.48, 2);
        g.fillRect(px + w * 0.03, py - 2, w * 0.48, 2);
      }

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // HUD
      g.fillStyle = '#FF2222'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'right'; g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      // Control hints
      if (started && running) {
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.font = '11px "Courier New"';
        g.textAlign = 'center'; g.fillText('L/R tap = walk  swipe-up = climb  double-tap = jump', W / 2, H - SAFE - 8); g.textAlign = 'left';
      }

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FFD700'; g.font = 'bold 26px "Courier New"'; g.textAlign = 'center';
        g.fillText('DONKEY KONG', W / 2, H / 2 - 40);
        g.fillStyle = '#FFF'; g.font = '14px "Courier New"';
        g.fillText('Tap L/R half = walk', W / 2, H / 2);
        g.fillText('Swipe UP = climb ladder', W / 2, H / 2 + 24);
        g.fillText('Double-tap = jump', W / 2, H / 2 + 48);
        g.fillStyle = '#FFFF00'; g.font = 'bold 16px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 85);
        g.textAlign = 'left';
      }

      if (!running && win) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FF88'; g.font = 'bold 30px "Courier New"'; g.textAlign = 'center';
        g.fillText('YOU WIN!', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"'; g.fillText('SCORE ' + score, W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"'; g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }

      if (!running && !win) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF2244'; g.font = 'bold 30px "Courier New"'; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"'; g.fillText('SCORE ' + score, W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"'; g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
