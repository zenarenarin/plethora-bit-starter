window.scrollerApp = {
  meta: {
    title: 'Warp Drive',
    author: 'YourUsername',
    description: 'Tap and hold to punch into warp speed',
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

    const N_STARS = 320;
    const N_ROAD  = 12;   // lanes on each side

    // Stars: angle, depth (0→1), colour
    const stars = Array.from({ length: N_STARS }, () => ({
      angle: Math.random() * Math.PI * 2,
      depth: Math.random(),
      hue:   180 + Math.random() * 120,  // cyan → blue → violet
      tail:  0,
    }));

    let speed     = 0.004;
    let targetSpd = 0.004;
    const BASE_SPD  = 0.004;
    const BOOST_SPD = 0.14;

    let pressing = false;

    // Vanishing point drifts slightly
    let vpX = W / 2, vpY = H * 0.46;
    let tvpX = vpX, tvpY = vpY;

    this._onDown = e => {
      pressing = true;
      const pt = e.touches?.[0] ?? e;
      const r = canvas.getBoundingClientRect();
      tvpX = (pt.clientX - r.left);
      tvpY = (pt.clientY - r.top);
    };
    this._onMove = e => {
      if (!pressing) return;
      const pt = e.touches?.[0] ?? e;
      const r = canvas.getBoundingClientRect();
      tvpX = (pt.clientX - r.left);
      tvpY = (pt.clientY - r.top);
    };
    this._onUp = () => { pressing = false; tvpX = W/2; tvpY = H*0.46; };

    canvas.addEventListener('pointerdown',   this._onDown);
    canvas.addEventListener('pointermove',   this._onMove);
    canvas.addEventListener('pointerup',     this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);

    const loop = () => {
      targetSpd = pressing ? BOOST_SPD : BASE_SPD;
      speed += (targetSpd - speed) * 0.06;
      vpX += (tvpX - vpX) * 0.04;
      vpY += (tvpY - vpY) * 0.04;

      // Trail effect — dark fade instead of clear
      const alpha = 0.18 + (speed / BOOST_SPD) * 0.2;
      ctx.fillStyle = `rgba(1,2,8,${alpha})`;
      ctx.fillRect(0, 0, W, H);

      // Neon road grid lines
      const SIDE = W * 0.8;
      const roadAlpha = Math.min(1, speed / BOOST_SPD * 2);
      const now = performance.now() * 0.001;

      for (let i = 0; i < N_ROAD; i++) {
        const t = ((i / N_ROAD) + now * speed * 4) % 1;
        const d = t * t; // perspective depth
        const roadW = SIDE * d;
        const y     = vpY + (H - vpY) * d;
        const alpha2 = roadAlpha * d * 0.35;
        const cyan   = Math.floor(140 + 115 * (1 - d));

        ctx.strokeStyle = `rgba(0,${cyan},255,${alpha2})`;
        ctx.lineWidth   = 1;

        // left edge line
        ctx.beginPath(); ctx.moveTo(vpX, vpY);
        ctx.lineTo(vpX - roadW / 2, y); ctx.stroke();
        // right edge line
        ctx.beginPath(); ctx.moveTo(vpX, vpY);
        ctx.lineTo(vpX + roadW / 2, y); ctx.stroke();
        // cross stripe
        ctx.beginPath();
        ctx.moveTo(vpX - roadW / 2, y);
        ctx.lineTo(vpX + roadW / 2, y);
        ctx.stroke();
      }

      // Stars
      const spd = speed;
      for (const s of stars) {
        s.depth += spd * (0.8 + (1 - s.depth) * 0.6);
        if (s.depth >= 1) { s.depth = 0.001; s.angle = Math.random() * Math.PI * 2; s.hue = 180 + Math.random()*120; }

        const d  = s.depth * s.depth;
        const R  = Math.min(W, H) * 0.65 * d;
        const sx = vpX + Math.cos(s.angle) * R;
        const sy = vpY + Math.sin(s.angle) * R;

        // tail length grows with speed
        const tailLen = Math.min(40, spd / BASE_SPD * 1.5 * d * 30);
        const ex = vpX + Math.cos(s.angle) * (R - tailLen);
        const ey = vpY + Math.sin(s.angle) * (R - tailLen);

        const a = Math.min(1, d * 1.8);
        const starSize = 0.8 + d * 2;

        const grad = ctx.createLinearGradient(ex, ey, sx, sy);
        grad.addColorStop(0, `hsla(${s.hue},100%,70%,0)`);
        grad.addColorStop(1, `hsla(${s.hue},100%,90%,${a})`);

        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(sx, sy);
        ctx.strokeStyle = grad;
        ctx.lineWidth   = starSize;
        ctx.stroke();
      }

      // Center lens flare when boosting
      if (speed > BASE_SPD * 3) {
        const fl = (speed - BASE_SPD * 3) / (BOOST_SPD - BASE_SPD * 3);
        const flareR = ctx.createRadialGradient(vpX, vpY, 0, vpX, vpY, 80 * fl);
        flareR.addColorStop(0, `rgba(180,240,255,${fl * 0.6})`);
        flareR.addColorStop(0.3, `rgba(80,160,255,${fl * 0.2})`);
        flareR.addColorStop(1, `rgba(0,0,0,0)`);
        ctx.beginPath(); ctx.arc(vpX, vpY, 80 * fl, 0, Math.PI * 2);
        ctx.fillStyle = flareR; ctx.fill();
      }

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
