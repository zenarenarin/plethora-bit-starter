window.plethoraBit = {
  meta: {
    title: 'Binary Edge Field',
    author: 'plethora',
    description: 'Live camera edges become streams of 0s, 1s, and geometric sparks.',
    tags: ['camera', 'design', 'interactive'],
    permissions: ['camera', 'haptics'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d');
    const sample = ctx.createCanvas2D();
    sample.style.display = 'none';
    sample.width = 120;
    sample.height = Math.max(2, Math.round(120 * H / W));
    const sg = sample.getContext('2d', { willReadFrequently: true });
    const SW = sample.width, SH = sample.height;
    const cells = [];
    let video = null;
    let started = false;
    let loading = false;
    let err = null;
    let threshold = 42;
    let glyphScale = 1;
    let lastTap = 0;
    let frame = 0;
    let running = true;

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function cover(w, h) {
      const vw = video?.videoWidth || ctx.camera.width || w;
      const vh = video?.videoHeight || ctx.camera.height || h;
      const scale = Math.max(w / vw, h / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      return { dw, dh, dx: (w - dw) / 2, dy: (h - dh) / 2 };
    }

    async function start() {
      if (loading || started) return;
      loading = true;
      err = null;
      try {
        video = await ctx.camera.start({ facing: 'environment' });
        started = true;
        loading = false;
        ctx.platform.start();
        ctx.platform.haptic('light');
      } catch (e) {
        loading = false;
        err = e.message || 'Camera denied';
      }
    }

    function drawStart() {
      g.fillStyle = '#020408';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '800 ' + Math.max(22, H * 0.045) + 'px sans-serif';
      g.fillStyle = err ? '#ff6177' : '#fff';
      g.fillText(err || (loading ? 'opening camera' : 'tap to start'), W / 2, H * 0.46);
      g.font = Math.max(12, H * 0.02) + 'px sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillText('edge detector: 0s, 1s, triangles, squares', W / 2, H * 0.535);
    }

    function sampleCamera() {
      const c = cover(SW, SH);
      sg.drawImage(video, c.dx, c.dy, c.dw, c.dh);
      return sg.getImageData(0, 0, SW, SH).data;
    }

    function rebuildCells(data) {
      cells.length = 0;
      const step = 2;
      for (let y = 2; y < SH - 2; y += step) {
        for (let x = 2; x < SW - 2; x += step) {
          const i = (y * SW + x) * 4;
          const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          const ir = (y * SW + x + 1) * 4;
          const il = (y * SW + x - 1) * 4;
          const iu = ((y - 1) * SW + x) * 4;
          const id = ((y + 1) * SW + x) * 4;
          const lr = data[ir] * 0.299 + data[ir + 1] * 0.587 + data[ir + 2] * 0.114;
          const ll = data[il] * 0.299 + data[il + 1] * 0.587 + data[il + 2] * 0.114;
          const lu = data[iu] * 0.299 + data[iu + 1] * 0.587 + data[iu + 2] * 0.114;
          const ld = data[id] * 0.299 + data[id + 1] * 0.587 + data[id + 2] * 0.114;
          const gx = lr - ll;
          const gy = ld - lu;
          const mag = Math.sqrt(gx * gx + gy * gy);
          if (mag < threshold) continue;
          if (cells.length > 720) return;
          cells.push({
            x: x / SW * W,
            y: y / SH * H,
            a: Math.atan2(gy, gx) + Math.PI / 2,
            m: clamp((mag - threshold) / 150, 0, 1),
            l,
            bit: (Math.floor(l + x * 7 + y * 13 + frame) & 1) ? '1' : '0',
            shape: (x + y + frame) % 17,
          });
        }
      }
    }

    function drawCell(c, t) {
      const alpha = 0.22 + c.m * 0.78;
      const size = (8 + c.m * 15) * glyphScale;
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.a + Math.sin(t * 1.8 + c.x * 0.01) * 0.12);
      g.globalAlpha = alpha;
      g.globalCompositeOperation = 'lighter';
      if (c.shape === 0 || c.shape === 8) {
        g.strokeStyle = c.shape ? '#ff66d8' : '#fff36e';
        g.lineWidth = 1.5 + c.m * 3;
        g.beginPath();
        if (c.shape) {
          g.rect(-size * 0.45, -size * 0.45, size * 0.9, size * 0.9);
        } else {
          g.moveTo(0, -size * 0.62);
          g.lineTo(size * 0.58, size * 0.38);
          g.lineTo(-size * 0.58, size * 0.38);
          g.closePath();
        }
        g.stroke();
      } else {
        g.font = '800 ' + size + 'px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = c.bit === '1' ? '#79ffd7' : '#9ffcff';
        g.shadowBlur = 10 + c.m * 16;
        g.shadowColor = g.fillStyle;
        g.fillText(c.bit, 0, 0);
      }
      g.restore();
    }

    function drawHud() {
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.58)';
      g.fillRect(12, 12, Math.min(W - 24, 370), 88);
      g.font = '800 ' + Math.max(13, H * 0.019) + 'px monospace';
      g.fillStyle = '#9ffcff';
      g.fillText('BINARY EDGE FIELD', 24, 36);
      g.font = '700 ' + Math.max(11, H * 0.016) + 'px monospace';
      g.fillStyle = 'rgba(255,255,255,0.76)';
      g.fillText('tap: cycle sensitivity', 24, 58);
      g.fillText('drag up/down: glyph size', 24, 80);
      g.textAlign = 'right';
      g.fillStyle = '#fff36e';
      g.fillText(String(cells.length) + ' edges', Math.min(W - 24, 370), 36);
      g.restore();
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      start();
      const now = Date.now();
      if (now - lastTap < 420) {
        threshold = threshold > 56 ? 30 : threshold + 14;
        ctx.platform.haptic('light');
      }
      lastTap = now;
    }, { passive: false });
    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      glyphScale = clamp(0.65 + (1 - t.clientY / H) * 1.35, 0.55, 2.1);
    }, { passive: false });

    ctx.platform.ready();
    ctx.raf((dt) => {
      if (!running) return;
      if (!started || !ctx.camera.ready) { drawStart(); return; }
      frame += 1;
      const t = performance.now() * 0.001;
      const data = sampleCamera();
      rebuildCells(data);

      g.fillStyle = 'rgba(1,4,10,0.33)';
      g.fillRect(0, 0, W, H);
      const grd = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.72);
      grd.addColorStop(0, 'rgba(8,25,34,0.45)');
      grd.addColorStop(1, 'rgba(0,0,0,0.2)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      for (const c of cells) drawCell(c, t);

      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(121,255,215,0.18)';
      g.lineWidth = 1;
      for (let i = 0; i < cells.length; i += 17) {
        const a = cells[i];
        const b = cells[(i + 11) % cells.length];
        if (!a || !b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > Math.min(W, H) * 0.18) continue;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.restore();
      drawHud();
    });

    ctx.onDestroy(() => {
      running = false;
      try { ctx.camera.stop(); } catch {}
    });
  },

  pause(ctx) { ctx.camera.pause(); },
  resume(ctx) { ctx.camera.resume(); },
};
