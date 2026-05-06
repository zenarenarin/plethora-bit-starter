window.plethoraBit = {
  meta: {
    title: 'Hand Frame Alchemy',
    author: 'plethora',
    description: 'Frame your face with both hands and transform the image inside.',
    tags: ['camera', 'hands', 'gesture', 'art'],
    permissions: ['camera', 'haptics', 'networkFetch'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const og = off.getContext('2d', { willReadFrequently: true });

    const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
    const CONNECTORS = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];
    const FINGER_TIPS = new Set([4, 8, 12, 16, 20]);
    const MODES = ['THERMAL', 'AURA', 'PRISM', 'DREAM'];

    let video = null;
    let hands = null;
    let modelReady = false;
    let cameraReady = false;
    let started = false;
    let loadingCamera = false;
    let errMsg = null;
    let lastResults = null;
    let lastDetectMs = 0;
    let detectBusy = false;
    let lastTap = 0;
    let lastActive = false;
    let lockScore = 0;
    let modeIndex = 0;
    let prevFrameTips = null;
    let flickFlash = 0;
    let lastFlickAt = 0;

    function log(message) {
      try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'debug', message })); } catch {}
    }

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function mix(a, b, t) { return a + (b - a) * t; }

    function thermal(lum) {
      const t = lum / 255;
      if (t < 0.18) return [mix(5, 38, t / 0.18), 0, mix(35, 130, t / 0.18)];
      if (t < 0.38) return [mix(38, 0, (t - 0.18) / 0.2), mix(0, 180, (t - 0.18) / 0.2), 255];
      if (t < 0.62) return [mix(0, 255, (t - 0.38) / 0.24), mix(180, 240, (t - 0.38) / 0.24), mix(255, 0, (t - 0.38) / 0.24)];
      if (t < 0.84) return [255, mix(240, 50, (t - 0.62) / 0.22), 0];
      return [255, mix(50, 255, (t - 0.84) / 0.16), mix(0, 245, (t - 0.84) / 0.16)];
    }

    async function loadHands() {
      try {
        await ctx.loadScript(MP_BASE + '/hands.js');
        if (!window.Hands) throw new Error('MediaPipe Hands failed to load');
        hands = new window.Hands({ locateFile: (file) => MP_BASE + '/' + file });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.62,
          minTrackingConfidence: 0.55,
        });
        hands.onResults((results) => { lastResults = results || null; });
        modelReady = true;
        log('MediaPipe Hands ready');
      } catch (e) {
        errMsg = e.message || 'Could not load hand model';
      }
    }

    async function startCamera() {
      if (loadingCamera || cameraReady) return;
      loadingCamera = true;
      errMsg = null;
      try {
        video = await ctx.camera.start({ facing: 'user' });
        cameraReady = true;
        loadingCamera = false;
        started = true;
        ctx.platform.start();
        ctx.platform.haptic('light');
      } catch (e) {
        loadingCamera = false;
        errMsg = e.message || 'Camera denied';
      }
    }

    function videoCover() {
      const vw = video?.videoWidth || ctx.camera.width || W;
      const vh = video?.videoHeight || ctx.camera.height || H;
      const scale = Math.max(W / vw, H / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      return { dw, dh, dx, dy };
    }

    function drawVideoCover(target) {
      if (!video || !ctx.camera.ready) return;
      const { dw, dh, dx, dy } = videoCover();
      target.save();
      target.translate(W, 0);
      target.scale(-1, 1);
      target.drawImage(video, dx, dy, dw, dh);
      target.restore();
    }

    function landmarkToPoint(lm) {
      const { dw, dh, dx, dy } = videoCover();
      return { x: W - (dx + lm.x * dw), y: dy + lm.y * dh, z: lm.z || 0 };
    }

    function sortedHands() {
      const landmarks = lastResults?.multiHandLandmarks || [];
      return landmarks
        .map((lm, i) => ({ lm, pts: lm.map(landmarkToPoint), i }))
        .sort((a, b) => a.pts[9].x - b.pts[9].x);
    }

    function frameFromHands(hs) {
      if (hs.length < 2) return null;
      const points = [hs[0].pts[4], hs[0].pts[8], hs[1].pts[4], hs[1].pts[8]];
      const pad = Math.min(W, H) * 0.025;
      const x = clamp(Math.min(...points.map(p => p.x)) - pad, 0, W - 2);
      const y = clamp(Math.min(...points.map(p => p.y)) - pad, 0, H - 2);
      const x2 = clamp(Math.max(...points.map(p => p.x)) + pad, x + 2, W);
      const y2 = clamp(Math.max(...points.map(p => p.y)) + pad, y + 2, H);
      return { x, y, w: x2 - x, h: y2 - y, points };
    }

    function detectFlick(rect, dt, active) {
      if (!rect || !active) {
        prevFrameTips = rect ? rect.points.map(p => ({ x: p.x, y: p.y })) : null;
        return;
      }

      if (!prevFrameTips) {
        prevFrameTips = rect.points.map(p => ({ x: p.x, y: p.y }));
        return;
      }

      const frameSize = Math.max(1, Math.hypot(rect.w, rect.h));
      let maxSpeed = 0;
      for (let i = 0; i < rect.points.length; i++) {
        const p = rect.points[i];
        const prev = prevFrameTips[i];
        const speed = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(16, dt);
        maxSpeed = Math.max(maxSpeed, speed / frameSize * 1000);
      }
      prevFrameTips = rect.points.map(p => ({ x: p.x, y: p.y }));

      const now = performance.now();
      if (maxSpeed > 1.85 && now - lastFlickAt > 520) {
        lastFlickAt = now;
        modeIndex = (modeIndex + 1) % MODES.length;
        flickFlash = 1;
        ctx.platform.haptic('medium');
        ctx.platform.milestone('style-flick', { mode: MODES[modeIndex] });
      }
    }

    function applyTransform(rect, mode, t) {
      const sx = Math.floor(rect.x);
      const sy = Math.floor(rect.y);
      const sw = Math.max(2, Math.floor(rect.w));
      const sh = Math.max(2, Math.floor(rect.h));
      const img = og.getImageData(sx, sy, sw, sh);
      const data = img.data;
      const copy = new Uint8ClampedArray(data);

      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4;
          const r = copy[i], gr = copy[i + 1], b = copy[i + 2];
          const lum = r * 0.299 + gr * 0.587 + b * 0.114;
          const nx = x / sw;
          const ny = y / sh;
          const wave = Math.sin(nx * 18 + t * 0.004) * Math.cos(ny * 14 - t * 0.003);

          if (mode === 'THERMAL') {
            const left = Math.max(0, i - 4);
            const edge = Math.abs(lum - (copy[left] * 0.299 + copy[left + 1] * 0.587 + copy[left + 2] * 0.114));
            const c = thermal(clamp(lum + edge * 1.8 + wave * 28, 0, 255));
            data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
          } else if (mode === 'AURA') {
            data[i] = clamp(255 - b + wave * 60, 0, 255);
            data[i + 1] = clamp(80 + lum * 0.72 + Math.sin(ny * 22 + t * 0.006) * 65, 0, 255);
            data[i + 2] = clamp(255 - r * 0.45 + Math.cos(nx * 20 - t * 0.005) * 55, 0, 255);
          } else if (mode === 'PRISM') {
            const shift = Math.floor(5 + wave * 8);
            const ri = (y * sw + clamp(x + shift, 0, sw - 1)) * 4;
            const bi = (y * sw + clamp(x - shift, 0, sw - 1)) * 4;
            data[i] = copy[ri];
            data[i + 1] = clamp(gr * 1.18, 0, 255);
            data[i + 2] = copy[bi + 2];
          } else {
            const cell = 7;
            const px = Math.floor(x / cell) * cell;
            const py = Math.floor(y / cell) * cell;
            const pi = (clamp(py, 0, sh - 1) * sw + clamp(px, 0, sw - 1)) * 4;
            const c = thermal(clamp(copy[pi] * 0.35 + copy[pi + 1] * 0.55 + copy[pi + 2] * 0.1 + wave * 45, 0, 255));
            data[i] = c[0] * 0.85 + copy[pi] * 0.15;
            data[i + 1] = c[1] * 0.85 + copy[pi + 1] * 0.15;
            data[i + 2] = c[2] * 0.85 + copy[pi + 2] * 0.15;
          }
        }
      }

      og.putImageData(img, sx, sy);
      g.save();
      g.beginPath();
      g.rect(rect.x, rect.y, rect.w, rect.h);
      g.clip();
      g.drawImage(off, 0, 0, W, H);
      g.restore();
    }

    function drawHand(hand, handIndex) {
      const pts = hand.pts;
      const hue = handIndex === 0 ? 168 : 292;
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.shadowColor = `hsla(${hue},100%,60%,0.65)`;
      g.shadowBlur = 12;
      g.lineWidth = Math.max(2, W * 0.007);
      g.strokeStyle = `hsla(${hue},100%,62%,0.86)`;
      for (const [a, b] of CONNECTORS) {
        g.beginPath();
        g.moveTo(pts[a].x, pts[a].y);
        g.lineTo(pts[b].x, pts[b].y);
        g.stroke();
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const isTip = FINGER_TIPS.has(i);
        const isFrame = i === 4 || i === 8;
        const r = isFrame ? Math.max(8, W * 0.023) : isTip ? Math.max(5, W * 0.015) : Math.max(3, W * 0.009);
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fillStyle = isFrame ? '#fff36e' : isTip ? '#ffffff' : `hsl(${hue},100%,58%)`;
        g.fill();
      }
      g.restore();
    }

    async function tickDetection() {
      if (!modelReady || !cameraReady || !ctx.camera.ready || detectBusy) return;
      const now = performance.now();
      if (now - lastDetectMs < 33) return;
      lastDetectMs = now;
      detectBusy = true;
      try { await hands.send({ image: video }); }
      catch (e) { errMsg = e.message || 'Hand detection failed'; }
      finally { detectBusy = false; }
    }

    function drawStartScreen() {
      g.fillStyle = '#050608';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (errMsg) {
        g.font = `bold ${Math.max(15, H * 0.025)}px sans-serif`;
        g.fillStyle = '#ff5f6d';
        g.fillText(errMsg.slice(0, 52), W / 2, H * 0.48);
        return;
      }
      g.font = `bold ${Math.max(22, H * 0.045)}px sans-serif`;
      g.fillStyle = '#fff';
      g.fillText(modelReady ? 'tap to start' : 'loading hands', W / 2, H * 0.46);
      g.font = `${Math.max(12, H * 0.021)}px sans-serif`;
      g.fillStyle = 'rgba(255,255,255,0.44)';
      g.fillText('frame your face with thumb + index fingers', W / 2, H * 0.535);
    }

    function drawFrame(rect, active, mode) {
      if (!rect) return;
      g.save();
      const flash = flickFlash;
      g.strokeStyle = active ? (flash > 0.02 ? '#ffffff' : '#fffb8f') : 'rgba(255,255,255,0.72)';
      g.lineWidth = active ? 4 + flash * 5 : 2;
      g.shadowBlur = active ? 30 + flash * 42 : 10;
      g.shadowColor = active ? '#ff3b00' : '#42f5d7';
      g.strokeRect(rect.x, rect.y, rect.w, rect.h);
      g.shadowBlur = 0;
      g.font = `700 ${Math.max(12, H * 0.018)}px monospace`;
      g.textAlign = 'center';
      g.fillStyle = active ? '#fffb8f' : 'rgba(255,255,255,0.72)';
      g.fillText(active ? mode : 'OPEN THE FRAME', rect.x + rect.w / 2, Math.max(24, rect.y - 12));
      g.restore();
    }

    function drawHud(handsFound, area, mode) {
      g.save();
      g.font = `700 ${Math.max(12, H * 0.018)}px monospace`;
      g.textAlign = 'left';
      g.fillStyle = handsFound >= 2 ? '#79ffd7' : 'rgba(255,255,255,0.68)';
      g.fillText(`HANDS ${handsFound}/2`, 18, 30);
      g.fillStyle = 'rgba(255,255,255,0.52)';
      g.fillText(`AREA ${(area * 100).toFixed(1)}%`, 18, 52);
      g.fillText('FLICK 4/8 TO CHANGE', 18, 74);
      g.textAlign = 'right';
      g.fillText(mode, W - 18, 30);
      g.restore();
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      lastTap = Date.now();
      if (modelReady) startCamera();
    }, { passive: false });
    ctx.listen(canvas, 'click', () => {
      if (Date.now() - lastTap < 500) return;
      if (modelReady) startCamera();
    });

    loadHands();
    ctx.platform.ready();

    ctx.raf((dt, ts) => {
      if (!started || !cameraReady) {
        drawStartScreen();
        return;
      }

      og.fillStyle = '#000';
      og.fillRect(0, 0, W, H);
      drawVideoCover(og);
      g.drawImage(off, 0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(0, 0, W, H);
      tickDetection();

      const hs = sortedHands();
      const rect = frameFromHands(hs);
      const area = rect ? (rect.w * rect.h) / (W * H) : 0;
      const active = !!rect && area > 0.105;
      const mode = MODES[modeIndex];
      detectFlick(rect, dt, active);
      flickFlash = Math.max(0, flickFlash - dt * 0.0045);

      if (active) {
        lockScore += dt;
        if (!lastActive) {
          ctx.platform.haptic('medium');
        }
        applyTransform(rect, mode, ts);
      } else {
        lockScore = Math.max(0, lockScore - dt * 0.5);
      }
      lastActive = active;

      for (let i = 0; i < hs.length; i++) drawHand(hs[i], i);
      drawFrame(rect, active, mode);
      drawHud(hs.length, area, mode);
    });

    ctx.onDestroy(() => {
      try { ctx.camera.stop(); } catch {}
      try { hands?.close?.(); } catch {}
      lastResults = null;
    });
  },

  pause(ctx) { ctx.camera.pause(); },
  resume(ctx) { ctx.camera.resume(); },
  destroy(ctx) { ctx.camera.stop(); },
};
