window.plethoraBit = {
  meta: {
    title: 'Orbital Junkyard',
    author: 'plethora',
    description: 'Fling scrap into orbit around a hungry little star.',
    tags: ['game', 'physics', 'arcade'],
    permissions: ['haptics'],
  },

  init(ctx) {
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d');
    const DPR = ctx.dpr || 1;
    const W = ctx.width;
    const H = ctx.height;
    const cx = W / 2;
    const cy = H / 2;
    const starRadius = Math.min(W, H) * 0.055;
    const gravity = Math.min(W, H) * 0.00028;
    const scrap = [];
    const sparks = [];
    const dust = [];
    const pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, t: 0 };
    let score = 0;
    let combo = 0;
    let bestCombo = 0;
    let shake = 0;
    let elapsed = 0;
    let dead = false;

    function rnd(a, b) { return a + Math.random() * (b - a); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function dist(x, y) { return Math.hypot(x - cx, y - cy); }

    function addSpark(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(0.5, 3.2);
        sparks.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: rnd(22, 46),
          max: 46,
          color,
          r: rnd(1.2, 3.8),
        });
      }
    }

    function spawnDust() {
      if (dust.length > 110) return;
      const a = rnd(0, Math.PI * 2);
      const r = rnd(Math.min(W, H) * 0.22, Math.min(W, H) * 0.62);
      dust.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        a,
        r,
        s: rnd(-0.0014, 0.0014),
        w: rnd(0.8, 2.2),
        hue: rnd(170, 230),
      });
    }

    function fling(x, y, vx, vy) {
      const hue = (190 + score * 19 + Math.random() * 80) % 360;
      const size = rnd(7, 15);
      scrap.push({
        x, y, vx, vy,
        size,
        rot: rnd(0, Math.PI * 2),
        spin: rnd(-0.12, 0.12),
        hue,
        age: 0,
        orbit: 0,
        shape: Math.floor(rnd(0, 4)),
      });
      addSpark(x, y, `hsl(${hue}, 90%, 65%)`, 7);
      ctx.platform.haptic('light');
    }

    function burstOrbit(s) {
      score += 10 + combo * 3;
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
      shake = Math.min(18, shake + 5);
      addSpark(s.x, s.y, `hsl(${s.hue}, 100%, 70%)`, 22);
      ctx.platform.setScore(score, { combo: bestCombo });
      if (combo % 5 === 0) {
        ctx.platform.haptic('medium');
        ctx.platform.milestone('combo', { combo });
      }
    }

    function consume(s) {
      score = Math.max(0, score - 4);
      combo = 0;
      shake = Math.min(24, shake + 7);
      addSpark(s.x, s.y, '#ff3864', 18);
      ctx.platform.haptic('heavy');
    }

    function drawScrap(s) {
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.rot);
      g.shadowBlur = 14;
      g.shadowColor = `hsl(${s.hue}, 100%, 65%)`;
      g.fillStyle = `hsl(${s.hue}, 86%, ${58 + Math.sin(s.age * 0.1) * 8}%)`;
      g.strokeStyle = 'rgba(255,255,255,0.65)';
      g.lineWidth = 1.2;
      const z = s.size;
      g.beginPath();
      if (s.shape === 0) {
        g.rect(-z * 0.7, -z * 0.35, z * 1.4, z * 0.7);
      } else if (s.shape === 1) {
        g.moveTo(0, -z * 0.85); g.lineTo(z * 0.75, z * 0.45); g.lineTo(-z * 0.75, z * 0.45); g.closePath();
      } else if (s.shape === 2) {
        g.arc(0, 0, z * 0.55, 0, Math.PI * 2);
      } else {
        g.moveTo(-z, -z * 0.25); g.lineTo(-z * 0.2, -z * 0.7); g.lineTo(z, 0); g.lineTo(-z * 0.2, z * 0.7); g.closePath();
      }
      g.fill();
      g.stroke();
      g.restore();
    }

    function drawStar(t) {
      const pulse = Math.sin(t * 0.004) * 0.08 + 1;
      const grad = g.createRadialGradient(cx, cy, 1, cx, cy, starRadius * 4.6);
      grad.addColorStop(0, '#fff6a5');
      grad.addColorStop(0.18, '#ffb000');
      grad.addColorStop(0.42, 'rgba(255,60,105,0.34)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, starRadius * 4.6 * pulse, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffe66d';
      g.shadowBlur = 28;
      g.shadowColor = '#ff7b00';
      g.beginPath();
      g.arc(cx, cy, starRadius * pulse, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }

    function drawHud() {
      g.save();
      g.font = `700 ${Math.max(13, H * 0.018)}px monospace`;
      g.textAlign = 'left';
      g.fillStyle = 'rgba(235,250,255,0.9)';
      g.fillText(`SCRAP ${score}`, 18, 30);
      g.fillStyle = combo > 1 ? '#8cffd2' : 'rgba(235,250,255,0.46)';
      g.fillText(`COMBO ${combo}`, 18, 52);
      g.textAlign = 'right';
      g.fillStyle = 'rgba(235,250,255,0.46)';
      g.fillText('drag + release', W - 18, 30);
      g.restore();
    }

    function pointerXY(e) {
      const t = e.touches ? e.touches[0] : e;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (t.clientX - rect.left) * (canvas.width / DPR / rect.width),
        y: (t.clientY - rect.top) * (canvas.height / DPR / rect.height),
      };
    }

    function down(e) {
      e.preventDefault();
      const p = pointerXY(e);
      pointer.down = true;
      pointer.x = pointer.sx = p.x;
      pointer.y = pointer.sy = p.y;
      pointer.t = Date.now();
      ctx.platform.interact({ type: 'aim' });
    }

    function move(e) {
      if (!pointer.down) return;
      e.preventDefault();
      const p = pointerXY(e);
      pointer.x = p.x;
      pointer.y = p.y;
    }

    function up(e) {
      if (!pointer.down) return;
      e.preventDefault();
      pointer.down = false;
      const dx = pointer.sx - pointer.x;
      const dy = pointer.sy - pointer.y;
      const power = clamp(Math.hypot(dx, dy), 22, Math.min(W, H) * 0.34);
      const scale = 0.026 + power * 0.00009;
      fling(pointer.sx, pointer.sy, dx * scale, dy * scale);
    }

    ctx.listen(canvas, 'touchstart', down, { passive: false });
    ctx.listen(canvas, 'touchmove', move, { passive: false });
    ctx.listen(canvas, 'touchend', up, { passive: false });
    ctx.listen(canvas, 'mousedown', down);
    ctx.listen(canvas, 'mousemove', move);
    ctx.listen(canvas, 'mouseup', up);

    ctx.platform.ready({ title: 'Orbital Junkyard' });

    ctx.raf((dt, t) => {
      if (dead) return;
      elapsed += dt;
      if (Math.random() < 0.7) spawnDust();
      g.save();
      const sx = shake ? rnd(-shake, shake) : 0;
      const sy = shake ? rnd(-shake, shake) : 0;
      shake *= 0.86;
      g.translate(sx, sy);
      g.fillStyle = 'rgba(2,4,13,0.36)';
      g.fillRect(-30, -30, W + 60, H + 60);

      for (const d of dust) {
        d.a += d.s * dt;
        d.x = cx + Math.cos(d.a) * d.r;
        d.y = cy + Math.sin(d.a) * d.r;
        g.fillStyle = `hsla(${d.hue}, 80%, 72%, 0.18)`;
        g.fillRect(d.x, d.y, d.w, d.w);
      }

      drawStar(t);

      for (let i = scrap.length - 1; i >= 0; i--) {
        const s = scrap[i];
        const dx = cx - s.x;
        const dy = cy - s.y;
        const r2 = Math.max(1200, dx * dx + dy * dy);
        const r = Math.sqrt(r2);
        const force = gravity * Math.min(W, H) * Math.min(3.4, 80000 / r2);
        s.vx += (dx / r) * force * dt;
        s.vy += (dy / r) * force * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.spin * dt;
        s.age += dt;
        if (r > starRadius * 2.4 && r < Math.min(W, H) * 0.42 && Math.abs(dx * s.vy - dy * s.vx) / r > 0.75) {
          s.orbit += dt;
          if (s.orbit > 760) {
            burstOrbit(s);
            scrap.splice(i, 1);
            continue;
          }
        } else {
          s.orbit = Math.max(0, s.orbit - dt * 0.5);
        }
        if (r < starRadius * 1.1) {
          consume(s);
          scrap.splice(i, 1);
          continue;
        }
        if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80 || s.age > 12000) {
          combo = 0;
          scrap.splice(i, 1);
          continue;
        }
        drawScrap(s);
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx * dt * 0.9;
        p.y += p.vy * dt * 0.9;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life -= dt * 0.08;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        g.globalAlpha = clamp(p.life / p.max, 0, 1);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }

      if (pointer.down) {
        const dx = pointer.sx - pointer.x;
        const dy = pointer.sy - pointer.y;
        const len = Math.hypot(dx, dy);
        g.strokeStyle = '#9ffcff';
        g.lineWidth = 2;
        g.setLineDash([8, 8]);
        g.beginPath();
        g.moveTo(pointer.sx, pointer.sy);
        g.lineTo(pointer.x, pointer.y);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = `rgba(159,252,255,${clamp(len / 180, 0.18, 0.7)})`;
        g.beginPath();
        g.arc(pointer.sx, pointer.sy, 8 + Math.sin(elapsed * 0.02) * 2, 0, Math.PI * 2);
        g.fill();
      }

      drawHud();
      g.restore();
    });

    ctx.onDestroy(() => {
      dead = true;
      scrap.length = 0;
      sparks.length = 0;
      dust.length = 0;
    });
  },

  pause() {},
  resume() {},
  destroy() {},
};
