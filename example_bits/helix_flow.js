window.scrollerApp = {
  meta: {
    title: 'Helix Flow',
    author: 'YourUsername',
    description: 'Blue and gold particles spiraling through a rotating double helix',
    tags: ['creative'],
  },

  init(container) {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cx = W / 2, cy = H / 2;
    const FOV    = Math.min(W, H) * 1.3;
    const RADIUS = Math.min(W, H) * 0.22;
    const TURNS  = 4;
    const T_MIN  = -TURNS * Math.PI;
    const T_MAX  =  TURNS * Math.PI;
    const PITCH  = (H * 0.78) / (T_MAX - T_MIN);
    const TUBE_R = RADIUS * 0.18;
    const L_ARC  = Math.sqrt(RADIUS * RADIUS + PITCH * PITCH);

    // Rotation state
    let rotX = 0.25, rotY = 0;
    let inerX = 0, inerY = 0.006;
    let dragging = false, lastX = 0, lastY = 0, dragDist = 0;

    // Spring state
    let tubeScale = 1.0, tubeVel = 0;

    // Stars
    const STARS = Array.from({ length: 180 }, () => ({
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     Math.random() * 1.1 + 0.2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.8,
    }));

    // Vignette
    const vignette = ctx.createRadialGradient(cx, cy, H * 0.18, cx, cy, H * 0.78);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,4,0.72)');

    // Strand 1 — blue (hue 200–255)
    const N = 250;
    const particles = Array.from({ length: N }, (_, i) => {
      const r = TUBE_R * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      return {
        t:       T_MIN + (i / N) * (T_MAX - T_MIN),
        offU:    r * Math.cos(a),
        offV:    r * Math.sin(a),
        size:    0.28 + Math.random() * 0.72,
        hue:     200 + Math.random() * 55,
        opacity: 0.45 + Math.random() * 0.55,
      };
    });

    // Strand 2 — purple (hue 265–300), thinner and fainter
    const particles2 = Array.from({ length: N }, (_, i) => {
      const r = TUBE_R * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      return {
        t:       T_MIN + (i / N) * (T_MAX - T_MIN),
        offU:    r * Math.cos(a),
        offV:    r * Math.sin(a),
        size:    0.28 + Math.random() * 0.72,
        hue:     265 + Math.random() * 35,
        opacity: 0.45 + Math.random() * 0.55,
      };
    });

    const SPEED = 0.016;

    // ── 3D math ───────────────────────────────────────────────────────────────

    function rotate(x, y, z) {
      const cy_ = Math.cos(rotY), sy = Math.sin(rotY);
      const cx_ = Math.cos(rotX), sx = Math.sin(rotX);
      const x1 =  x * cy_ + z * sy;
      const z1 = -x * sy  + z * cy_;
      const y2 =  y * cx_ - z1 * sx;
      const z2 =  y * sx  + z1 * cx_;
      return [x1, y2, z2];
    }

    function project(x, y, z) {
      const s = FOV / (FOV + z);
      return [cx + x * s, cy + y * s, s];
    }

    function helixPos(t)  { return [ RADIUS * Math.cos(t), PITCH * t,  RADIUS * Math.sin(t)]; }
    function helixPos2(t) { return [-RADIUS * Math.cos(t), PITCH * t, -RADIUS * Math.sin(t)]; }

    // Frenet tube offsets
    // Strand 1 — N=[-cos(t),0,-sin(t)], B=[-P·sin(t)/L,-R/L,P·cos(t)/L]
    function applyTubeOffset(t, u, v) {
      const [hx, hy, hz] = helixPos(t);
      return [
        hx + u * (-Math.cos(t)) + v * (-PITCH * Math.sin(t) / L_ARC),
        hy +                      v * (-RADIUS / L_ARC),
        hz + u * (-Math.sin(t)) + v * ( PITCH * Math.cos(t) / L_ARC),
      ];
    }
    // Strand 2 — N=[cos(t),0,sin(t)], B=[P·sin(t)/L,-R/L,-P·cos(t)/L]
    function applyTubeOffset2(t, u, v) {
      const [hx, hy, hz] = helixPos2(t);
      return [
        hx + u * ( Math.cos(t)) + v * ( PITCH * Math.sin(t) / L_ARC),
        hy +                      v * (-RADIUS / L_ARC),
        hz + u * ( Math.sin(t)) + v * (-PITCH * Math.cos(t) / L_ARC),
      ];
    }

    // ── Draw ──────────────────────────────────────────────────────────────────

    function drawGuide() {
      const STEPS = 200;
      for (const [posFn, color] of [[helixPos, '40,110,255'], [helixPos2, '160,80,255']]) {
        const pts = [];
        for (let i = 0; i <= STEPS; i++) {
          const t = T_MIN + (i / STEPS) * (T_MAX - T_MIN);
          const [rx, ry, rz] = rotate(...posFn(t));
          const [px, py] = project(rx, ry, rz);
          pts.push([px, py, rz]);
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay, az] = pts[i], [bx, by] = pts[i + 1];
          const depth = Math.max(0, Math.min(1, (az + FOV * 0.6) / (FOV * 1.2)));
          ctx.strokeStyle = `rgba(${color},${(0.04 + depth * 0.18).toFixed(2)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
    }

    function drawParticles() {
      const proj1 = p => {
        const [rx, ry, rz] = rotate(...applyTubeOffset(p.t, p.offU * tubeScale, p.offV * tubeScale));
        const [px, py, scale] = project(rx, ry, rz);
        const r = Math.max(1.5, TUBE_R * 0.52 * p.size * scale * Math.max(0.1, tubeScale));
        return { px, py, rz, r, hue: p.hue, opacity: Math.min(1, p.opacity * 1.4), glow: 2.2 };
      };
      const proj2 = p => {
        const [rx, ry, rz] = rotate(...applyTubeOffset2(p.t, p.offU * tubeScale * 0.6, p.offV * tubeScale * 0.6));
        const [px, py, scale] = project(rx, ry, rz);
        const r = Math.max(1, TUBE_R * 0.28 * p.size * scale * Math.max(0.1, tubeScale));
        return { px, py, rz, r, hue: p.hue, opacity: p.opacity * 0.45, glow: 1.0 };
      };

      const items = [...particles.map(proj1), ...particles2.map(proj2)];
      items.sort((a, b) => a.rz - b.rz);

      for (const { px, py, rz, r, hue, opacity, glow: glowAmp } of items) {
        const depth = Math.max(0, Math.min(1, (rz + FOV * 0.6) / (FOV * 1.2)));
        const a = opacity;

        const glow = ctx.createRadialGradient(px, py, r * 0.3, px, py, r * 2.2);
        glow.addColorStop(0, `hsla(${hue},85%,62%,${(0.10 * depth * a * glowAmp).toFixed(2)})`);
        glow.addColorStop(1, `hsla(${hue},85%,62%,0)`);
        ctx.beginPath();
        ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        const hx = px - r * 0.3, hy = py - r * 0.3;
        const midL = 61 + (glowAmp - 1) * 8;
        const grad = ctx.createRadialGradient(hx, hy, r * 0.06, px, py, r);
        grad.addColorStop(0,    `hsla(${hue},60%,92%,${(0.96 * a).toFixed(2)})`);
        grad.addColorStop(0.38, `hsla(${hue},88%,${midL.toFixed(0)}%,${((0.84 + depth * 0.13) * a).toFixed(2)})`);
        grad.addColorStop(1,    `hsla(${hue + 10},87%,18%,${((0.88 + depth * 0.1) * a).toFixed(2)})`);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }

    // ── Loop ──────────────────────────────────────────────────────────────────

    const loop = () => {
      ctx.fillStyle = '#03060d';
      ctx.fillRect(0, 0, W, H);

      const t0 = performance.now() * 0.001;
      for (const s of STARS) {
        const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t0 * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,218,255,${alpha.toFixed(2)})`;
        ctx.fill();
      }

      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      tubeVel += (1.0 - tubeScale) * 0.14;
      tubeVel *= 0.72;
      tubeScale += tubeVel;

      if (!dragging) {
        inerX = inerX * 0.93;
        inerY = inerY * 0.93 + 0.006 * 0.07;
        rotX += inerX;
        rotY += inerY;
      }

      for (const p of particles)  { p.t += SPEED; if (p.t > T_MAX) p.t = T_MIN + (p.t - T_MAX); }
      for (const p of particles2) { p.t += SPEED; if (p.t > T_MAX) p.t = T_MIN + (p.t - T_MAX); }

      drawGuide();
      drawParticles();

      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);

    // ── Input ─────────────────────────────────────────────────────────────────

    this._onDown = e => {
      dragging = true; dragDist = 0;
      const pt = e.touches?.[0] ?? e;
      lastX = pt.clientX; lastY = pt.clientY;
    };

    this._onMove = e => {
      if (!dragging) return;
      const pt = e.touches?.[0] ?? e;
      const dx = pt.clientX - lastX, dy = pt.clientY - lastY;
      dragDist += Math.abs(dx) + Math.abs(dy);
      rotY += dx * 0.007; rotX += dy * 0.007;
      inerY = dx * 0.007; inerX = dy * 0.007;
      lastX = pt.clientX; lastY = pt.clientY;
    };

    this._onUp = () => {
      if (dragDist < 10) tubeVel += 0.55;
      dragging = false;
    };

    canvas.addEventListener('pointerdown',   this._onDown);
    canvas.addEventListener('pointermove',   this._onMove);
    canvas.addEventListener('pointerup',     this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);

    this._canvas = canvas;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    const c = this._canvas;
    if (c) {
      c.removeEventListener('pointerdown',   this._onDown);
      c.removeEventListener('pointermove',   this._onMove);
      c.removeEventListener('pointerup',     this._onUp);
      c.removeEventListener('pointercancel', this._onUp);
    }
    this._canvas = null;
  },
};
