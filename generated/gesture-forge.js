window.plethoraBit = {
  meta: {
    title: 'Gesture Forge',
    author: 'plethora',
    description: 'Wave your hand through the camera to bend sparks into living metal.',
    tags: ['camera', 'gesture', 'art'],
    permissions: ['camera', 'haptics'],
  },

  async init(ctx) {
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d');
    const W = ctx.width;
    const H = ctx.height;
    const DPR = ctx.dpr || 1;
    const particles = [];
    const rings = [];
    const low = document.createElement('canvas');
    const LW = 96;
    const LH = Math.round(LW * H / W);
    low.width = LW;
    low.height = LH;
    const lg = low.getContext('2d', { willReadFrequently: true });
    let previous = null;
    let video = null;
    let running = true;
    let cameraError = null;
    let hand = { x: W / 2, y: H / 2, px: W / 2, py: H / 2, amount: 0, active: false };
    let charge = 0;
    let score = 0;
    let lastBurst = 0;
    let hue = 185;

    function rand(a, b) { return a + Math.random() * (b - a); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function log(message) {
      try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'debug', message })); } catch {}
    }

    function spark(x, y, count, force, colorShift) {
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(0.4, force);
        particles.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: rand(30, 90),
          max: 90,
          r: rand(1.5, 5.5),
          hue: (hue + colorShift + rand(-22, 28) + 360) % 360,
          spin: rand(-0.08, 0.08),
        });
      }
    }

    function addRing(x, y, power) {
      rings.push({ x, y, r: 12, life: 1, power });
      spark(x, y, Math.floor(26 + power * 34), 5 + power * 5, power * 80);
      ctx.platform.haptic(power > 0.65 ? 'medium' : 'light');
      score += Math.round(10 + power * 40);
      ctx.platform.setScore(score, { charge: power });
    }

    async function startCamera() {
      try {
        if (!ctx.capabilities.camera) throw new Error('This bit needs camera permission.');
        video = await ctx.camera.start({ facing: 'user', width: 640, height: 480 });
        log('camera ready ' + ctx.camera.width + 'x' + ctx.camera.height);
        ctx.platform.start();
      } catch (e) {
        cameraError = e?.message || 'Camera could not start.';
        log('camera failed: ' + cameraError);
      }
    }

    function sampleMotion() {
      if (!video || !ctx.camera.ready) return;
      lg.save();
      lg.scale(-1, 1);
      lg.drawImage(video, -LW, 0, LW, LH);
      lg.restore();
      const img = lg.getImageData(0, 0, LW, LH).data;
      let sx = 0;
      let sy = 0;
      let mass = 0;
      let hot = 0;

      if (previous) {
        for (let y = 0; y < LH; y += 2) {
          for (let x = 0; x < LW; x += 2) {
            const i = (y * LW + x) * 4;
            const d =
              Math.abs(img[i] - previous[i]) +
              Math.abs(img[i + 1] - previous[i + 1]) +
              Math.abs(img[i + 2] - previous[i + 2]);
            if (d > 44) {
              const weight = Math.min(5, d / 42);
              sx += x * weight;
              sy += y * weight;
              mass += weight;
              hot++;
            }
          }
        }
      }

      previous = new Uint8ClampedArray(img);
      hand.px = hand.x;
      hand.py = hand.y;

      const amount = clamp(mass / 2200, 0, 1);
      if (mass > 22) {
        const nx = (sx / mass) / LW;
        const ny = (sy / mass) / LH;
        hand.x += (nx * W - hand.x) * 0.42;
        hand.y += (ny * H - hand.y) * 0.42;
        hand.active = true;
      } else {
        hand.active = false;
      }
      hand.amount += (amount - hand.amount) * 0.2;
      charge = clamp(charge + (hand.active ? hand.amount * 0.035 : -0.025), 0, 1);
      hue = (hue + 0.7 + hand.amount * 5) % 360;

      const speed = Math.hypot(hand.x - hand.px, hand.y - hand.py);
      if (hand.active && speed > 18 && Date.now() - lastBurst > 180) {
        lastBurst = Date.now();
        addRing(hand.x, hand.y, clamp(speed / 80, 0.2, 1));
      }

      if (hand.active && hot > 18 && Math.random() < 0.65) {
        spark(hand.x + rand(-30, 30), hand.y + rand(-30, 30), 2 + Math.floor(hand.amount * 5), 2.8, 0);
      }
    }

    function drawCamera() {
      if (!video || !ctx.camera.ready) return;
      g.save();
      g.globalAlpha = 0.34;
      g.translate(W, 0);
      g.scale(-1, 1);
      g.drawImage(video, 0, 0, W, H);
      g.restore();
      g.fillStyle = 'rgba(0,7,13,0.46)';
      g.fillRect(0, 0, W, H);
    }

    function drawHand() {
      if (!hand.active) return;
      const r = 34 + hand.amount * 90 + Math.sin(Date.now() * 0.012) * 8;
      const grd = g.createRadialGradient(hand.x, hand.y, 4, hand.x, hand.y, r);
      grd.addColorStop(0, `hsla(${hue},100%,74%,0.9)`);
      grd.addColorStop(0.35, `hsla(${hue + 45},100%,58%,0.28)`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(hand.x, hand.y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `hsla(${hue},100%,74%,0.75)`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(hand.x, hand.y, 14 + charge * 26, 0, Math.PI * 2);
      g.stroke();
    }

    function drawHud() {
      g.save();
      g.font = `700 ${Math.max(12, H * 0.018)}px monospace`;
      g.textAlign = 'left';
      g.fillStyle = 'rgba(225,250,255,0.86)';
      g.fillText('GESTURE FORGE', 18, 30);
      g.fillStyle = hand.active ? '#65ffd8' : 'rgba(225,250,255,0.42)';
      g.fillText(hand.active ? 'HAND LOCK' : 'MOVE HAND', 18, 52);
      g.fillStyle = 'rgba(225,250,255,0.35)';
      g.fillRect(18, 66, 120, 5);
      g.fillStyle = `hsl(${hue},100%,64%)`;
      g.fillRect(18, 66, 120 * charge, 5);
      g.textAlign = 'right';
      g.fillStyle = 'rgba(225,250,255,0.7)';
      g.fillText(String(score), W - 18, 30);
      g.restore();
    }

    ctx.listen(canvas, 'pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / DPR / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / DPR / rect.height);
      addRing(x, y, 0.45);
    });

    await startCamera();
    ctx.platform.ready();

    ctx.raf((dt) => {
      if (!running) return;
      g.fillStyle = 'rgba(1,3,9,0.38)';
      g.fillRect(0, 0, W, H);

      drawCamera();
      sampleMotion();

      if (cameraError) {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#fff';
        g.font = `700 ${Math.max(16, H * 0.026)}px monospace`;
        g.fillText('camera blocked', W / 2, H / 2 - 18);
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.font = `${Math.max(11, H * 0.016)}px monospace`;
        g.fillText(cameraError.slice(0, 48), W / 2, H / 2 + 18);
      }

      drawHand();

      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.r += (4 + r.power * 9) * (dt / 16);
        r.life -= 0.018 * (dt / 16);
        if (r.life <= 0) { rings.splice(i, 1); continue; }
        g.strokeStyle = `hsla(${hue + r.power * 80},100%,70%,${r.life})`;
        g.lineWidth = 2 + r.power * 4;
        g.beginPath();
        g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        g.stroke();
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const dx = hand.x - p.x;
        const dy = hand.y - p.y;
        const d = Math.max(30, Math.hypot(dx, dy));
        if (hand.active) {
          p.vx += (dx / d) * hand.amount * 0.075 * dt;
          p.vy += (dy / d) * hand.amount * 0.075 * dt;
        }
        p.vx *= 0.988;
        p.vy *= 0.988;
        p.vy += 0.012 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 0.05;
        if (p.life <= 0 || p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) {
          particles.splice(i, 1);
          continue;
        }
        const a = clamp(p.life / p.max, 0, 1);
        g.globalAlpha = a;
        g.shadowBlur = 18;
        g.shadowColor = `hsl(${p.hue},100%,60%)`;
        g.fillStyle = `hsl(${p.hue},100%,66%)`;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        g.shadowBlur = 0;
      }

      if (charge > 0.98 && Date.now() - lastBurst > 300) {
        lastBurst = Date.now();
        addRing(hand.x, hand.y, 1);
        charge = 0.25;
        ctx.platform.milestone('forge-burst', { score });
      }

      drawHud();
    });

    ctx.onDestroy(() => {
      running = false;
      ctx.camera.stop();
      particles.length = 0;
      rings.length = 0;
      previous = null;
    });
  },

  pause(ctx) {
    ctx.camera.pause();
  },

  resume(ctx) {
    ctx.camera.resume();
  },

  destroy(ctx) {
    ctx.camera.stop();
  },
};
