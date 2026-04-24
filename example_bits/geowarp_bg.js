window.scrollerApp = {
  meta: {
    title: 'Geometric Warp',
    author: 'YourUsername',
    description: 'Fly through a tunnel of sacred geometry — hold to boost',
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

    const cx = W / 2, cy = H / 2;
    const maxR = Math.hypot(cx, cy) * 1.25;

    let time = 0, speed = 1.0, targetSpeed = 1.0, hue = 200;
    const rings = [];

    // Each template defines: n shapes per ring, primary shape, accent shape, size factors
    const TEMPLATES = [
      { n: 3, shape: 'tri',  szF: 0.32, acc: 'circ', accF: 0.14 },
      { n: 6, shape: 'circ', szF: 0.18, acc: 'hex',  accF: 0.09 },
      { n: 4, shape: 'sq',   szF: 0.28, acc: 'tri',  accF: 0.13 },
      { n: 5, shape: 'pent', szF: 0.24, acc: 'circ', accF: 0.11 },
      { n: 6, shape: 'hex',  szF: 0.22, acc: 'tri',  accF: 0.10 },
      { n: 8, shape: 'circ', szF: 0.14, acc: null,   accF: 0    },
      { n: 3, shape: 'tri',  szF: 0.30, acc: 'tri',  accF: 0.16 },
      { n: 4, shape: 'sq',   szF: 0.26, acc: 'sq',   accF: 0.12 },
    ];
    let tmplIdx = 0;

    function pathPoly(x, y, n, r, angle) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = angle + (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
    }

    function drawShape(shape, x, y, r, angle, fill, stroke, lw) {
      ctx.lineWidth = lw || 1.5;
      switch (shape) {
        case 'tri':  pathPoly(x, y, 3, r, angle - Math.PI / 2); break;
        case 'sq':   pathPoly(x, y, 4, r, angle + Math.PI / 4); break;
        case 'pent': pathPoly(x, y, 5, r, angle - Math.PI / 2); break;
        case 'hex':  pathPoly(x, y, 6, r, angle);               break;
        case 'circ': ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); break;
      }
      if (fill)   { ctx.fillStyle = fill;     ctx.fill();   }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    }

    function spawnRing() {
      const tmpl = TEMPLATES[tmplIdx % TEMPLATES.length];
      tmplIdx++;
      rings.push({
        r:     8,
        tmpl,
        angle: tmplIdx % 2 === 0 ? Math.PI / tmpl.n : 0,
        spin:  tmplIdx % 3 === 0 ? -1 : 1,
        hue:   hue,
        alpha: 0,
      });
    }

    function drawRing(ring) {
      const { r, tmpl, angle, hue: h, alpha, spin } = ring;
      const shapeR = Math.max(2, r * tmpl.szF);
      const a = alpha;

      const fill   = `hsla(${h}, 85%, 60%, ${a * 0.18})`;
      const stroke = `hsla(${h}, 100%, 85%, ${a * 0.90})`;
      const accent = `hsla(${(h + 60) % 360}, 100%, 92%, ${a * 0.70})`;

      // dashed polygon connecting all shape positions
      pathPoly(cx, cy, tmpl.n, r, angle);
      ctx.setLineDash([5, 8]);
      ctx.strokeStyle = `hsla(${h}, 70%, 65%, ${a * 0.22})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.setLineDash([]);

      // radial spokes from center
      ctx.beginPath();
      for (let i = 0; i < tmpl.n; i++) {
        const ang = angle + (i / tmpl.n) * Math.PI * 2;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      }
      ctx.strokeStyle = `hsla(${h}, 80%, 70%, ${a * 0.07})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // shapes at each vertex
      for (let i = 0; i < tmpl.n; i++) {
        const ang = angle + (i / tmpl.n) * Math.PI * 2;
        const sx = cx + Math.cos(ang) * r, sy = cy + Math.sin(ang) * r;
        const rot = ang + spin * time * 0.012;

        drawShape(tmpl.shape, sx, sy, shapeR, rot, fill, stroke, 1.5);

        if (tmpl.acc && shapeR > 6) {
          drawShape(tmpl.acc, sx, sy, r * tmpl.accF, -rot * 1.3, null, accent, 1.0);
        }
      }
    }

    this._onDown = () => { targetSpeed = 5.0; };
    this._onUp   = () => { targetSpeed = 1.0; };
    canvas.addEventListener('pointerdown',   this._onDown);
    canvas.addEventListener('pointerup',     this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);

    const loop = () => {
      // motion trail — thicker at high speed
      ctx.fillStyle = `rgba(2, 1, 9, ${0.11 + speed * 0.032})`;
      ctx.fillRect(0, 0, W, H);

      time++;
      speed += (targetSpeed - speed) * 0.04;
      hue = (hue + speed * 0.7) % 360;

      // spawn
      const every = Math.max(2, Math.round(18 / speed));
      if (time % every === 0) spawnRing();

      // update & draw rings back-to-front (oldest = largest radius first)
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r    += (2.0 + ring.r * 0.022) * speed;
        ring.angle += ring.spin * 0.005 * speed;
        const fi = 35, fo = maxR * 0.72;
        ring.alpha = ring.r < fi
          ? ring.r / fi
          : ring.r > fo
            ? 1 - (ring.r - fo) / (maxR - fo)
            : 1;
        if (ring.r > maxR) { rings.splice(i, 1); continue; }
        drawRing(ring);
      }

      // center glow — blooms wider at high speed
      const glowR = 80 + speed * 18;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      g.addColorStop(0,   `hsla(${hue}, 100%, 98%, ${0.50 + speed * 0.07})`);
      g.addColorStop(0.3, `hsla(${(hue + 20) % 360}, 90%, 75%, 0.13)`);
      g.addColorStop(1,   `hsla(${hue}, 80%, 50%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // tiny vanishing point dot
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 100%, 98%, 0.95)`;
      ctx.fill();

      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this._canvas = canvas;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown',   this._onDown);
      this._canvas.removeEventListener('pointerup',     this._onUp);
      this._canvas.removeEventListener('pointercancel', this._onUp);
    }
    this._canvas = null;
  },
};
