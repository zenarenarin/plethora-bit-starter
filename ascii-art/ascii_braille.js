window.plethoraBit = {
  meta: {
    title: 'ascii.you',
    author: 'plethora',
    description: 'Your face in real-time braille ASCII — 8× the resolution.',
    tags: ['creative'],
    permissions: ['camera'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // Each braille char encodes a 2×4 pixel block — 40 chars, each ~20px so dots are visible
    const COLS = 40;
    const CW   = W / COLS;
    const CH   = CW * 2;
    const ROWS = Math.ceil(H / CH);

    // Sample canvas is 2× wide and 4× tall (one pixel per braille dot)
    const SW = COLS * 2;
    const SH = ROWS * 4;

    const off    = document.createElement('canvas');
    off.width    = SW;
    off.height   = SH;
    const og     = off.getContext('2d', { willReadFrequently: true });

    // Braille dot → bit value mapping for a 2×4 block
    // (dx, dy, bit) where bit value = 1 << bit
    const DOT_MAP = [
      [0, 0, 0],  // dot 1 → value 1
      [0, 1, 1],  // dot 2 → value 2
      [0, 2, 2],  // dot 3 → value 4
      [1, 0, 3],  // dot 4 → value 8
      [1, 1, 4],  // dot 5 → value 16
      [1, 2, 5],  // dot 6 → value 32
      [0, 3, 6],  // dot 7 → value 64
      [1, 3, 7],  // dot 8 → value 128
    ];

    let stream  = null;
    let video   = null;
    let ready   = false;
    let loading = false;
    let errMsg  = null;
    let _lt     = 0;

    ctx.onDestroy(() => {
      stream?.getTracks().forEach(t => t.stop());
      if (video) { video.pause(); video.srcObject = null; video.remove?.(); }
    });

    const dbg = (msg) => {
      try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'debug', message: msg })); } catch (_) {}
    };

    const startCamera = async () => {
      if (loading || ready) return;
      loading = true;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
        dbg('calling getUserMedia');
        const timeout = new Promise((_, rej) =>
          setTimeout(() => rej(new Error('getUserMedia timed out after 8s')), 8000)
        );
        stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false })
            .catch((e1) => {
              dbg('front cam failed: ' + e1?.name);
              return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }),
          timeout,
        ]);
        dbg('stream acquired');
        video             = document.createElement('video');
        video.srcObject   = stream;
        video.playsInline = true;
        video.autoplay    = true;
        video.muted       = true;
        video.setAttribute('playsinline', '');
        video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.001;pointer-events:none';
        ctx.container.insertBefore(video, canvas);
        await video.play();
        await new Promise((resolve) => {
          if (video.readyState >= 2) { resolve(); return; }
          video.addEventListener('loadeddata', resolve, { once: true });
          video.addEventListener('canplay',    resolve, { once: true });
          setTimeout(resolve, 1200);
        });
        ready   = true;
        loading = false;
        ctx.platform.start();
      } catch (e) {
        loading = false;
        errMsg  = e.message || 'Camera denied';
        dbg('error: ' + errMsg);
      }
    };

    // Ripples: stored in sample space coords
    const ripples = [];
    const scaleX  = SW / W;
    const scaleY  = SH / H;

    const addRipple = (clientX, clientY) => {
      ripples.push({ x: clientX * scaleX, y: clientY * scaleY, t: performance.now() });
      ctx.platform.haptic('light');
    };

    const rippleOffset = (sx, sy, now) => {
      let ox = 0, oy = 0;
      for (const r of ripples) {
        const age   = (now - r.t) / 1000;
        const decay = Math.exp(-age * 2.5);
        if (decay < 0.01) continue;
        const dx   = sx - r.x, dy = sy - r.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const wave = Math.sin(dist * 0.35 - age * 14) * decay * 10;
        ox += (dx / dist) * wave;
        oy += (dy / dist) * wave;
      }
      return [ox, oy];
    };

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      _lt = Date.now();
      if (!ready) { startCamera(); return; }
      for (let i = 0; i < e.changedTouches.length; i++)
        addRipple(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
    }, { passive: false });

    ctx.listen(canvas, 'click', (e) => {
      if (Date.now() - _lt < 500) return;
      if (!ready) { startCamera(); return; }
      addRipple(e.clientX, e.clientY);
    });

    const dithered = new Float32Array(SW * SH);

    ctx.raf((dt) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);

      if (!ready) {
        g.textAlign    = 'center';
        g.textBaseline = 'middle';
        if (errMsg) {
          g.font      = `bold ${H * 0.022}px monospace`;
          g.fillStyle = '#f44';
          const words = errMsg.split(' ');
          let line = '', y = H / 2 - H * 0.06;
          for (const word of words) {
            const test = line ? line + ' ' + word : word;
            if (g.measureText(test).width > W * 0.9) {
              g.fillText(line, W / 2, y); y += H * 0.028; line = word;
            } else { line = test; }
          }
          if (line) g.fillText(line, W / 2, y);
        } else if (loading) {
          g.font      = `${H * 0.038}px monospace`;
          g.fillStyle = '#0f0';
          g.fillText('[ starting camera… ]', W / 2, H / 2);
        } else {
          g.font      = `${H * 0.044}px monospace`;
          g.fillStyle = '#0f0';
          g.fillText('[ tap to start ]', W / 2, H / 2);
          g.font      = `${H * 0.022}px monospace`;
          g.fillStyle = 'rgba(0,255,0,0.4)';
          g.fillText('needs front camera', W / 2, H / 2 + H * 0.07);
        }
        return;
      }

      if (video.readyState < 2) return;

      // Mirror horizontally (selfie orientation)
      og.save();
      og.translate(SW, 0);
      og.scale(-1, 1);
      og.drawImage(video, 0, 0, SW, SH);
      og.restore();

      const px = og.getImageData(0, 0, SW, SH).data;

      // Compute per-frame mean luminance for adaptive threshold
      let total = 0;
      for (let i = 0; i < SW * SH; i++) {
        dithered[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
        total += dithered[i];
      }
      const threshold = total / (SW * SH);

      // Atkinson dithering — bold, high-contrast, great for faces
      for (let y = 0; y < SH; y++) {
        for (let x = 0; x < SW; x++) {
          const idx    = y * SW + x;
          const old    = dithered[idx];
          const newVal = old > threshold ? 255 : 0;
          dithered[idx] = newVal;
          const err    = (old - newVal) / 8;
          // distribute error to 6 neighbours (Atkinson pattern)
          const nb = [[1,0],[2,0],[-1,1],[0,1],[1,1],[0,2]];
          for (const [dx, dy] of nb) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < SW && ny < SH) dithered[ny * SW + nx] += err;
          }
        }
      }

      // Prune dead ripples
      const now = performance.now();
      for (let i = ripples.length - 1; i >= 0; i--)
        if ((now - ripples[i].t) > 2500) ripples.splice(i, 1);

      // Render braille characters
      g.textAlign    = 'left';
      g.textBaseline = 'top';
      g.font         = `${CH * 1.05}px monospace`;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          let bits = 0;
          let tr = 0, tg = 0, tb = 0;

          for (const [dx, dy, bit] of DOT_MAP) {
            let sx = col * 2 + dx;
            let sy = row * 4 + dy;
            if (ripples.length) {
              const [ox, oy] = rippleOffset(sx, sy, now);
              sx = Math.round(sx + ox);
              sy = Math.round(sy + oy);
            }
            sx = Math.max(0, Math.min(SW - 1, sx));
            sy = Math.max(0, Math.min(SH - 1, sy));
            const pi = (sy * SW + sx) * 4;
            tr += px[pi]; tg += px[pi + 1]; tb += px[pi + 2];
            if (dithered[sy * SW + sx] > 127) bits |= (1 << bit);
          }

          if (bits === 0) continue;

          // Gaussian noise per channel (σ≈35) so each dot has its own tint
          const sigma = 35;
          const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * sigma;
          const cr = Math.max(0, Math.min(255, (tr >> 3) + gauss()));
          const cg = Math.max(0, Math.min(255, (tg >> 3) + gauss()));
          const cb = Math.max(0, Math.min(255, (tb >> 3) + gauss()));
          g.fillStyle = `rgb(${cr|0},${cg|0},${cb|0})`;
          g.fillText(String.fromCharCode(0x2800 + bits), col * CW, row * CH);
        }
      }
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
