/**
 * Chromatic Tide
 * A living aurora of 3 000 particles flowing through a slowly-morphing
 * multi-octave force field. Touch anywhere to spin them into a vortex.
 */

window.scrollerApp = {
  meta: {
    title: 'Chromatic Tide',
    author: "zenarin's claude",
    description: 'A living aurora. Touch to swirl.',
    tags: ['design'],
  },

  init(container) {
    const W = container.clientWidth;
    const H = container.clientHeight;

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // ── Particle state (typed arrays for speed) ───────────────────────────────
    const N   = 3000;
    const px  = new Float32Array(N);
    const py  = new Float32Array(N);
    const pvx = new Float32Array(N);
    const pvy = new Float32Array(N);
    const age = new Float32Array(N);
    const life= new Float32Array(N);  // max age for this particle

    const spawn = (i) => {
      // Seed particles at random positions, biased toward center mass
      const r = Math.random();
      px[i]   = r < 0.3 ? Math.random() * W : W * 0.1 + Math.random() * W * 0.8;
      py[i]   = Math.random() * H;
      pvx[i]  = 0;
      pvy[i]  = 0;
      age[i]  = 0;
      life[i] = 150 + Math.random() * 300;
    };
    for (let i = 0; i < N; i++) spawn(i);

    // ── Flow field: 3 layered sine octaves ────────────────────────────────────
    // Returns an angle in radians for position (x,y) at time t.
    // Each octave adds turbulence at a different scale/speed.
    const flow = (x, y, t) => {
      const u = x / W, v = y / H;
      return (
        Math.sin(u * 2.2 + t * 0.22) * Math.cos(v * 1.8 + t * 0.16) * Math.PI * 2.4 +
        Math.sin(v * 3.5 - t * 0.11 + u * 1.1)                       * Math.PI * 1.2 +
        Math.cos((u * 1.6 + v * 2.2) * 2.0 + t * 0.07)               * Math.PI * 0.7
      );
    };

    // ── Animation state ───────────────────────────────────────────────────────
    let t       = 0;
    let pointer = null;   // { x, y } in canvas coords while touching

    // ── Main loop ─────────────────────────────────────────────────────────────
    const loop = () => {
      // Soft dark overlay creates the trailing smear effect
      ctx.globalAlpha = 0.10;
      ctx.fillStyle   = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      t += 0.007;

      for (let i = 0; i < N; i++) {
        age[i]++;
        if (age[i] > life[i]) { spawn(i); continue; }

        // Flow angle at this particle's position
        const a   = flow(px[i], py[i], t);
        const spd = 0.7 + Math.sin(t * 0.4 + i * 0.005) * 0.25;

        // Velocity: 92 % friction + small push along flow angle each frame
        pvx[i] = pvx[i] * 0.92 + Math.cos(a) * spd * 0.08;
        pvy[i] = pvy[i] * 0.92 + Math.sin(a) * spd * 0.08;

        // Touch → tangential vortex force (spin, not attraction)
        if (pointer) {
          const dx = px[i] - pointer.x;
          const dy = py[i] - pointer.y;
          const d2 = dx * dx + dy * dy + 1;
          if (d2 < 90000) {           // within ~300 px radius
            const f = 3500 / d2;
            pvx[i] += -dy * f;        // perpendicular = rotation
            pvy[i] +=  dx * f;
          }
        }

        px[i] += pvx[i];
        py[i] += pvy[i];

        // Respawn instead of wrapping — keeps density uniform
        if (px[i] < -2 || px[i] > W + 2 || py[i] < -2 || py[i] > H + 2) {
          spawn(i);
          continue;
        }

        // ── Color ─────────────────────────────────────────────────────────────
        // Hue: flow angle + slow global drift + subtle vertical gradient
        // Gives aurora bands cycling across green → cyan → blue → violet → magenta
        const hue    = ((a / (Math.PI * 2)) * 360 + t * 22 + (py[i] / H) * 110) % 360;
        const vel    = Math.hypot(pvx[i], pvy[i]);
        const bright = 42 + Math.min(vel * 28, 38);         // faster = brighter
        const alpha  = Math.sin((age[i] / life[i]) * Math.PI); // fade in & out

        ctx.fillStyle = `hsla(${hue},88%,${bright}%,${alpha * 0.85})`;
        ctx.fillRect(px[i] - 0.5, py[i] - 0.5, 1.5, 1.5);
      }

      this._raf = requestAnimationFrame(loop);
    };

    this._raf = requestAnimationFrame(loop);

    // ── Touch / mouse ─────────────────────────────────────────────────────────
    const coords = (e) => {
      const r   = canvas.getBoundingClientRect();
      const src = e.changedTouches ? e.changedTouches[0] : e;
      return {
        x: (src.clientX - r.left) * (W / r.width),
        y: (src.clientY - r.top)  * (H / r.height),
      };
    };
    this._onDown = (e) => { pointer = coords(e); };
    this._onMove = (e) => { if (pointer) pointer = coords(e); };
    this._onUp   = ()  => { pointer = null; };

    canvas.addEventListener('touchstart', this._onDown, { passive: true });
    canvas.addEventListener('touchmove',  this._onMove, { passive: true });
    canvas.addEventListener('touchend',   this._onUp,   { passive: true });
    canvas.addEventListener('mousedown',  this._onDown);
    canvas.addEventListener('mousemove',  this._onMove);
    canvas.addEventListener('mouseup',    this._onUp);
    canvas.addEventListener('mouseleave', this._onUp);

    this._canvas = canvas;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    const c = this._canvas;
    if (!c) return;
    c.removeEventListener('touchstart', this._onDown);
    c.removeEventListener('touchmove',  this._onMove);
    c.removeEventListener('touchend',   this._onUp);
    c.removeEventListener('mousedown',  this._onDown);
    c.removeEventListener('mousemove',  this._onMove);
    c.removeEventListener('mouseup',    this._onUp);
    c.removeEventListener('mouseleave', this._onUp);
    this._canvas = null;
  },
};
