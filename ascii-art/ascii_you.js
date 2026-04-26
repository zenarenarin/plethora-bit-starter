window.plethoraBit = {
  meta: {
    title: 'ascii.you',
    author: 'plethora',
    description: 'Your face, rendered in real-time ASCII art.',
    tags: ['creative'],
    permissions: ['camera'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const CHARS = ' .,:;i!lI+*?%S#@';
    const COLS  = 60;
    const CW    = W / COLS;
    const CH    = CW * 2.1;
    const ROWS  = Math.ceil(H / CH);

    const off    = document.createElement('canvas');
    off.width    = COLS;
    off.height   = ROWS;
    const og     = off.getContext('2d', { willReadFrequently: true });

    let stream    = null;
    let video     = null;
    let ready     = false;
    let loading   = false;
    let errMsg    = null;
    let _lt       = 0;

    ctx.onDestroy(() => {
      stream?.getTracks().forEach(t => t.stop());
      if (video) { video.pause(); video.srcObject = null; video.remove?.(); }
    });

    const dbg = (msg) => {
      try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'debug', message: msg })); } catch {}
    };

    const startCamera = async () => {
      if (loading || ready) return;
      loading = true;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
        dbg('origin: ' + location.origin + ' secure: ' + window.isSecureContext);
        dbg('mediaDevices available');
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        const cams = devices.filter(d => d.kind === 'videoinput');
        dbg('cameras found: ' + cams.length);
        dbg('calling getUserMedia...');
        const timeout = new Promise((_, rej) =>
          setTimeout(() => rej(new Error('getUserMedia timed out after 8s')), 8000)
        );
        stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false })
            .catch((e1) => {
              dbg('front cam failed: ' + e1?.name + ' ' + e1?.message);
              return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }),
          timeout,
        ]);
        dbg('getUserMedia resolved');
        video             = document.createElement('video');
        video.srcObject   = stream;
        video.playsInline = true;
        video.autoplay    = true;
        video.muted       = true;
        video.setAttribute('playsinline', '');
        // Keep the video composited; some mobile WebViews return black frames
        // when drawImage() reads from a fully hidden or 1px camera element.
        video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.001;pointer-events:none';
        ctx.container.insertBefore(video, canvas);
        await video.play();
        await new Promise((resolve) => {
          if (video.readyState >= 2) { resolve(); return; }
          const done = () => resolve();
          video.addEventListener('loadeddata', done, { once: true });
          video.addEventListener('canplay', done, { once: true });
          setTimeout(done, 1200);
        });
        ready   = true;
        loading = false;
        ctx.platform.start();
      } catch (e) {
        loading = false;
        errMsg  = e.message || 'Camera denied';
      }
    };

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      _lt = Date.now();
      startCamera();
    }, { passive: false });

    ctx.listen(canvas, 'click', () => {
      if (Date.now() - _lt < 500) return;
      startCamera();
    });

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

      og.save();
      og.translate(COLS, 0);
      og.scale(-1, 1);
      og.drawImage(video, 0, 0, COLS, ROWS);
      og.restore();

      const px = og.getImageData(0, 0, COLS, ROWS).data;

      g.textAlign    = 'left';
      g.textBaseline = 'top';
      g.font         = `${CW * 1.15}px monospace`;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const i   = (row * COLS + col) * 4;
          const r   = px[i], gv = px[i + 1], b = px[i + 2];
          const lum = 0.2126 * r + 0.7152 * gv + 0.0722 * b;
          const ch  = CHARS[Math.floor((lum / 255) * (CHARS.length - 1))];
          if (ch === ' ') continue;
          g.fillStyle = `rgb(${r},${gv},${b})`;
          g.fillText(ch, col * CW, row * CH);
        }
      }
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
