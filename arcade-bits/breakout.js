// BREAKOUT — Arcade Classic (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Breakout',
    author: 'plethora',
    description: 'Drag to move the paddle. Break all bricks!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol = 0.3) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playPaddle() { playTone(330, 'square', 0.06, 0.25); }
    function playBrick() { playTone(660, 'sine', 0.1, 0.3); }
    function playMiss() { playTone(120, 'sawtooth', 0.3, 0.4); }
    function playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.4), i * 120)); }
    function playGameOver() { [300, 240, 180].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.25, 0.35), i * 130)); }

    const SAFE = ctx.safeArea.bottom;
    const PW = W * 0.2, PH = 14;
    const BRICK_ROWS = 6, BRICK_COLS = 9;
    const BW = (W - 20) / BRICK_COLS, BH = 22;
    const COLORS = ['#FF2222', '#FF8800', '#FFFF00', '#00FF00', '#00FFFF', '#FF00FF'];

    let paddle, ball, bricks, particles, score, gameOver, won, level, started;

    function initGame() {
      paddle = { x: W / 2 - PW / 2, y: H - SAFE - 60 };
      ball = { x: W / 2, y: H - SAFE - 80, vx: 200, vy: -280, r: 7 };
      particles = []; score = 0; gameOver = false; won = false; level = 1; started = false;
      createBricks();
    }

    function createBricks() {
      bricks = [];
      for (let row = 0; row < BRICK_ROWS; row++) {
        for (let col = 0; col < BRICK_COLS; col++) {
          bricks.push({ x: 10 + col * BW, y: 80 + row * BH, w: BW - 3, h: BH - 3, color: COLORS[row], alive: true });
        }
      }
    }

    function explode(x, y, color) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        particles.push({ x, y, vx: Math.cos(a) * (60 + Math.random() * 60), vy: Math.sin(a) * (60 + Math.random() * 60), color, life: 0.5 });
      }
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver || won) { initGame(); return; }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      paddle.x = Math.max(0, Math.min(W - PW, t.clientX - PW / 2));
    }, { passive: false });

    initGame();

    ctx.raf((dt) => {
      const sec = dt / 1000;

      if (!gameOver && !won && started) {
        // Ball movement
        ball.x += ball.vx * sec;
        ball.y += ball.vy * sec;

        // Wall bounces
        if (ball.x - ball.r < 0) { ball.vx = Math.abs(ball.vx); ball.x = ball.r; }
        if (ball.x + ball.r > W) { ball.vx = -Math.abs(ball.vx); ball.x = W - ball.r; }
        if (ball.y - ball.r < 0) { ball.vy = Math.abs(ball.vy); ball.y = ball.r; }

        // Ball lost
        if (ball.y > H) {
          gameOver = true;
          playGameOver();
          ctx.platform.fail({ reason: 'ball lost' });
        }

        // Paddle collision
        if (ball.vy > 0 &&
            ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + PH &&
            ball.x >= paddle.x - 4 && ball.x <= paddle.x + PW + 4) {
          ball.vy = -Math.abs(ball.vy);
          ball.y = paddle.y - ball.r;
          const hit = (ball.x - paddle.x) / PW;
          ball.vx = (hit - 0.5) * 500;
          explode(ball.x, ball.y, '#00FF00');
          playPaddle();
          ctx.platform.haptic('light');
        }

        // Brick collisions
        for (const b of bricks) {
          if (!b.alive) continue;
          if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
              ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
            b.alive = false;
            score += 10;
            ctx.platform.setScore(score);
            explode(b.x + b.w / 2, b.y + b.h / 2, b.color);
            playBrick();
            const overL = ball.x + ball.r - b.x;
            const overR = b.x + b.w - (ball.x - ball.r);
            const overT = ball.y + ball.r - b.y;
            const overB = b.y + b.h - (ball.y - ball.r);
            if (Math.min(overT, overB) < Math.min(overL, overR)) ball.vy *= -1;
            else ball.vx *= -1;
            break;
          }
        }

        if (bricks.every(b => !b.alive)) {
          won = true;
          score += 500;
          ctx.platform.complete({ score });
          playWin();
        }

        // Speed up slightly each level
        const speed = Math.hypot(ball.vx, ball.vy);
        const targetSpeed = 280 + level * 30;
        if (speed < targetSpeed) {
          ball.vx *= targetSpeed / speed;
          ball.vy *= targetSpeed / speed;
        }

        // Particles
        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec; p.life -= sec;
          return p.life > 0;
        });
      }

      // Draw
      g.fillStyle = '#000033';
      g.fillRect(0, 0, W, H);

      // Grid bg
      g.strokeStyle = 'rgba(0,100,255,0.08)';
      g.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

      // Bricks
      bricks.forEach(b => {
        if (!b.alive) return;
        g.fillStyle = b.color;
        g.fillRect(b.x, b.y, b.w, b.h);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(b.x, b.y, b.w, 3);
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 1;
        g.strokeRect(b.x, b.y, b.w, b.h);
      });

      // Paddle
      g.fillStyle = '#00FF00';
      g.fillRect(paddle.x, paddle.y, PW, PH);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(paddle.x, paddle.y, PW, 3);
      g.strokeStyle = '#FFFF00';
      g.lineWidth = 2;
      g.strokeRect(paddle.x, paddle.y, PW, PH);

      // Ball
      g.fillStyle = '#FFFF00';
      g.beginPath(); g.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath(); g.arc(ball.x - 2, ball.y - 2, ball.r * 0.4, 0, Math.PI * 2); g.fill();

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.color;
        g.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
      g.globalAlpha = 1;

      // HUD
      g.fillStyle = '#00FF00';
      g.font = 'bold 18px "Courier New"';
      g.textAlign = 'left';
      g.fillText('SCORE: ' + score, 12, 32);
      g.textAlign = 'right';
      g.fillText('LVL: ' + level, W - 12, 32);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,50,0.7)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF00FF';
        g.font = 'bold 30px "Courier New"';
        g.textAlign = 'center';
        g.fillText('BREAKOUT', W / 2, H / 2 - 30);
        g.fillStyle = '#FFFFFF';
        g.font = '18px "Courier New"';
        g.fillText('DRAG to move paddle', W / 2, H / 2 + 15);
        g.fillText('TAP to start', W / 2, H / 2 + 45);
        g.textAlign = 'left';
      }

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF0000';
        g.font = 'bold 36px "Courier New"';
        g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00';
        g.font = '20px "Courier New"';
        g.fillText('SCORE: ' + score, W / 2, H / 2 + 20);
        g.fillStyle = '#00FF00';
        g.font = '16px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 55);
        g.textAlign = 'left';
      }

      if (won) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FF00';
        g.font = 'bold 36px "Courier New"';
        g.textAlign = 'center';
        g.fillText('YOU WIN!', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00';
        g.font = '20px "Courier New"';
        g.fillText('SCORE: ' + score, W / 2, H / 2 + 20);
        g.fillStyle = '#FFFFFF';
        g.font = '16px "Courier New"';
        g.fillText('TAP TO PLAY AGAIN', W / 2, H / 2 + 55);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
