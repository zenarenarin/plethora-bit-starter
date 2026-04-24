window.scrollerApp = {
  meta: {
    title: 'Ball Pit',
    author: 'YourUsername',
    description: 'Touch to create gravity wells and fling the balls',
    tags: ['creative'],
  },

  init(container) {
    const W = container.clientWidth, H = container.clientHeight;
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const N = 55;
    const GRAVITY = 0.18;
    const DAMPEN  = 0.88;
    const BOUNCE  = 0.88;

    const balls = Array.from({ length: N }, (_, i) => {
      const hue = (i / N) * 360;
      const r   = 10 + Math.random() * 18;
      return {
        x:  r + Math.random() * (W - r * 2),
        y:  r + Math.random() * (H * 0.5),
        vx: (Math.random() - 0.5) * 1.5,
        vy: Math.random() * 0.8,
        r,
        hue,
        sat: 75 + Math.random() * 25,
        lit: 50 + Math.random() * 20,
      };
    });

    const touches = new Map(); // pointerId → {x, y}

    function applyForces(b) {
      // gravity
      b.vy += GRAVITY;

      // attract to each touch point
      touches.forEach(({ x, y }) => {
        const dx = x - b.x, dy = y - b.y;
        const d2 = dx * dx + dy * dy + 1;
        const f  = 7000 / d2;
        b.vx += dx / Math.sqrt(d2) * f;
        b.vy += dy / Math.sqrt(d2) * f;
      });

      b.x += b.vx; b.y += b.vy;

      // wall bounce
      if (b.x - b.r < 0)  { b.x = b.r;  b.vx = Math.abs(b.vx) * BOUNCE; }
      if (b.x + b.r > W)  { b.x = W - b.r; b.vx = -Math.abs(b.vx) * BOUNCE; }
      if (b.y - b.r < 0)  { b.y = b.r;  b.vy = Math.abs(b.vy) * BOUNCE; }
      if (b.y + b.r > H)  { b.y = H - b.r; b.vy = -Math.abs(b.vy) * BOUNCE * DAMPEN; b.vx *= 0.92; }

      // speed cap
      const spd = Math.hypot(b.vx, b.vy);
      if (spd > 12) { b.vx = b.vx / spd * 12; b.vy = b.vy / spd * 12; }
    }

    // Ball-ball collision (O(n²) but n=55 is fine at 60fps)
    function collide() {
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = balls[i], b = balls[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d  = Math.hypot(dx, dy);
          const minD = a.r + b.r;
          if (d < minD && d > 0.01) {
            const nx = dx / d, ny = dy / d;
            const overlap = (minD - d) * 0.5;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
            const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
            const imp = (dvx * nx + dvy * ny) * 0.85;
            if (imp < 0) {
              a.vx += imp * nx; a.vy += imp * ny;
              b.vx -= imp * nx; b.vy -= imp * ny;
            }
          }
        }
      }
    }

    function drawBall(b) {
      const { x, y, r, hue, sat, lit } = b;
      // outer glow
      const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.0);
      glow.addColorStop(0, `hsla(${hue},${sat}%,${lit}%,0.18)`);
      glow.addColorStop(1, `hsla(${hue},${sat}%,${lit}%,0)`);
      ctx.beginPath(); ctx.arc(x, y, r * 2.0, 0, Math.PI * 2);
      ctx.fillStyle = glow; ctx.fill();

      // main sphere
      const grad = ctx.createRadialGradient(x - r*0.35, y - r*0.35, r*0.05, x, y, r);
      grad.addColorStop(0,    `hsla(${hue},50%,92%,1)`);
      grad.addColorStop(0.35, `hsla(${hue},${sat}%,${lit}%,1)`);
      grad.addColorStop(1,    `hsla(${hue+15},${sat}%,18%,1)`);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
    }

    function drawRipples() {
      touches.forEach(({ x, y }) => {
        for (let ri = 0; ri < 3; ri++) {
          const phase = (performance.now() * 0.003 + ri * 0.33) % 1;
          const rr = phase * 60;
          ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - phase) * 0.35})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    }

    this._onDown = e => {
      const r = canvas.getBoundingClientRect();
      const scale = W / r.width;
      touches.set(e.pointerId, {
        x: (e.clientX - r.left) * scale,
        y: (e.clientY - r.top)  * scale,
      });
    };
    this._onMove = e => {
      if (!touches.has(e.pointerId)) return;
      const r = canvas.getBoundingClientRect();
      const scale = W / r.width;
      touches.set(e.pointerId, {
        x: (e.clientX - r.left) * scale,
        y: (e.clientY - r.top)  * scale,
      });
    };
    this._onUp = e => touches.delete(e.pointerId);

    canvas.addEventListener('pointerdown',   this._onDown);
    canvas.addEventListener('pointermove',   this._onMove);
    canvas.addEventListener('pointerup',     this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);

    const loop = () => {
      ctx.fillStyle = '#06030f';
      ctx.fillRect(0, 0, W, H);

      for (const b of balls) applyForces(b);
      collide();
      drawRipples();
      // draw back-to-front by size
      balls.slice().sort((a,b) => b.r - a.r).forEach(drawBall);

      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this._canvas = canvas;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown',   this._onDown);
      this._canvas.removeEventListener('pointermove',   this._onMove);
      this._canvas.removeEventListener('pointerup',     this._onUp);
      this._canvas.removeEventListener('pointercancel', this._onUp);
    }
    this._canvas = null;
  },
};
