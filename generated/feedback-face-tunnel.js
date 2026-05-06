window.plethoraBit = {
  meta: {
    title: 'Feedback Face Tunnel',
    author: 'plethora',
    description: 'A recursive camera tunnel that bends like a TouchDesigner feedback network.',
    tags: ['camera', 'design', 'interactive'],
    permissions: ['camera', 'haptics'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d');
    const fb = ctx.createCanvas2D();
    fb.style.display = 'none';
    fb.width = W; fb.height = H;
    const fg = fb.getContext('2d');
    let video = null, started = false, loading = false, err = null, running = true;
    let touch = { x: W / 2, y: H / 2, down: false };
    let swirl = 0, zoom = 0.985, pulse = 0, frame = 0;

    function start() {
      if (loading || started) return;
      loading = true;
      ctx.camera.start({ facing: 'user' }).then((v) => {
        video = v; started = true; loading = false;
        ctx.platform.start();
        ctx.platform.haptic('light');
      }).catch((e) => { err = e.message || 'Camera denied'; loading = false; });
    }

    function coverDraw(target) {
      if (!video || !ctx.camera.ready) return;
      const vw = video.videoWidth || ctx.camera.width || W;
      const vh = video.videoHeight || ctx.camera.height || H;
      const sc = Math.max(W / vw, H / vh);
      const dw = vw * sc, dh = vh * sc;
      const dx = (W - dw) / 2, dy = (H - dh) / 2;
      target.save();
      target.translate(W, 0);
      target.scale(-1, 1);
      target.drawImage(video, dx, dy, dw, dh);
      target.restore();
    }

    function screen() {
      g.fillStyle = '#05070b';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '800 ' + Math.max(22, H * 0.045) + 'px sans-serif';
      g.fillStyle = err ? '#ff6177' : '#fff';
      g.fillText(err || (loading ? 'opening camera' : 'tap to start'), W / 2, H * 0.47);
      g.font = Math.max(12, H * 0.02) + 'px sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillText('drag to bend the feedback tunnel', W / 2, H * 0.54);
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); start();
      const t = e.changedTouches[0]; touch = { x: t.clientX, y: t.clientY, down: true };
    }, { passive: false });
    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; touch.x = t.clientX; touch.y = t.clientY;
      pulse = Math.min(1, pulse + 0.08);
    }, { passive: false });
    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); touch.down = false; }, { passive: false });

    ctx.raf((dt) => {
      if (!running) return;
      if (!started) { screen(); return; }
      const t = performance.now() * 0.001;
      swirl += (touch.down ? 0.034 : 0.012) * (dt / 16.67);
      pulse *= 0.94;
      zoom = 0.982 + Math.sin(t * 0.9) * 0.006 - pulse * 0.014;

      fg.save();
      fg.globalCompositeOperation = 'source-over';
      fg.fillStyle = 'rgba(2,4,10,0.08)';
      fg.fillRect(0, 0, W, H);
      fg.translate(W / 2, H / 2);
      fg.rotate(Math.sin(swirl) * 0.012 + (touch.x - W / 2) / W * 0.018);
      fg.scale(1 / zoom, 1 / zoom);
      fg.translate(-W / 2 + (touch.x - W / 2) * 0.014, -H / 2 + (touch.y - H / 2) * 0.014);
      fg.globalAlpha = 0.88;
      fg.drawImage(canvas, 0, 0, W, H);
      fg.restore();

      fg.globalCompositeOperation = 'screen';
      fg.globalAlpha = 0.72;
      coverDraw(fg);
      fg.globalAlpha = 1;
      fg.globalCompositeOperation = 'source-over';

      g.drawImage(fb, 0, 0);
      const cx = touch.x, cy = touch.y;
      frame += 1;
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.58);
      grd.addColorStop(0, 'rgba(110,255,230,0.18)');
      grd.addColorStop(0.42, 'rgba(255,62,182,0.08)');
      grd.addColorStop(1, 'rgba(0,0,0,0.42)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        const r = (i + 1) * Math.min(W, H) * 0.055 + Math.sin(t * 1.7 + i) * 8;
        g.strokeStyle = 'hsla(' + (180 + i * 17 + t * 40) + ',100%,70%,' + (0.18 - i * 0.012) + ')';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(cx, cy, r * 1.25, r * 0.72, swirl + i * 0.18, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();

      g.save();
      g.globalCompositeOperation = 'source-over';
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.font = '800 ' + Math.max(12, H * 0.018) + 'px monospace';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(12, 12, Math.min(W - 24, 330), 76);
      g.fillStyle = '#9ffcff';
      g.fillText('FEEDBACK LOOP', 22, 34);
      g.fillStyle = 'rgba(255,255,255,0.78)';
      g.font = '700 ' + Math.max(10, H * 0.014) + 'px monospace';
      g.fillText('camera is redrawn into itself', 22, 56);
      g.fillText('drag = tunnel center / bend', 22, 76);
      g.strokeStyle = 'rgba(159,252,255,0.9)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - 22, cy);
      g.lineTo(cx + 22, cy);
      g.moveTo(cx, cy - 22);
      g.lineTo(cx, cy + 22);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, 34 + Math.sin(frame * 0.08) * 4, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    });

    ctx.platform.ready();
    ctx.onDestroy(() => { running = false; try { ctx.camera.stop(); } catch {} });
  },
  pause(ctx) { ctx.camera.pause(); },
  resume(ctx) { ctx.camera.resume(); },
};
