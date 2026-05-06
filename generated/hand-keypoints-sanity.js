window.plethoraBit = {
  meta: {
    title: 'Hand Keypoints Sanity',
    author: 'plethora',
    description: 'Camera sanity check: show all MediaPipe hand keypoints for both hands.',
    tags: ['camera', 'hands', 'debug'],
    permissions: ['camera', 'networkFetch'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d');

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
    const COLORS = ['#79ffd7', '#ff66d8'];

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

    function log(message) {
      try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'debug', message })); } catch {}
    }

    async function loadHands() {
      try {
        await ctx.loadScript(MP_BASE + '/hands.js');
        if (!window.Hands) throw new Error('MediaPipe Hands failed to load');
        hands = new window.Hands({
          locateFile: (file) => MP_BASE + '/' + file,
        });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.62,
          minTrackingConfidence: 0.55,
        });
        hands.onResults((results) => {
          lastResults = results || null;
        });
        modelReady = true;
        log('MediaPipe Hands ready');
      } catch (e) {
        errMsg = e.message || 'Could not load hand model';
        log('hands load failed: ' + errMsg);
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
        log('camera ready ' + (video.videoWidth || ctx.camera.width) + 'x' + (video.videoHeight || ctx.camera.height));
      } catch (e) {
        loadingCamera = false;
        errMsg = e.message || 'Camera denied';
        log('camera failed: ' + errMsg);
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
      return { vw, vh, dw, dh, dx, dy };
    }

    function drawVideoCover() {
      if (!video || !ctx.camera.ready) return;
      const { dw, dh, dx, dy } = videoCover();
      g.save();
      g.translate(W, 0);
      g.scale(-1, 1);
      g.drawImage(video, dx, dy, dw, dh);
      g.restore();
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, 0, W, H);
    }

    function landmarkToPoint(lm) {
      const { dw, dh, dx, dy } = videoCover();
      return {
        x: W - (dx + lm.x * dw),
        y: dy + lm.y * dh,
        z: lm.z || 0,
      };
    }

    function drawHand(landmarks, handedness, handIndex) {
      const pts = landmarks.map(landmarkToPoint);
      const color = COLORS[handIndex % COLORS.length];
      const label = handedness?.label || '';
      const score = handedness?.score ? Math.round(handedness.score * 100) : 0;

      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.shadowColor = color;
      g.shadowBlur = 12;
      g.lineWidth = Math.max(2, W * 0.008);
      g.strokeStyle = color;

      for (const [a, b] of CONNECTORS) {
        g.beginPath();
        g.moveTo(pts[a].x, pts[a].y);
        g.lineTo(pts[b].x, pts[b].y);
        g.stroke();
      }

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const isTip = FINGER_TIPS.has(i);
        const isFramePoint = i === 4 || i === 8;
        const r = isFramePoint ? Math.max(8, W * 0.024) : isTip ? Math.max(5, W * 0.017) : Math.max(3, W * 0.011);
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fillStyle = isFramePoint ? '#fff36e' : isTip ? '#ffffff' : color;
        g.fill();

        if (isTip) {
          g.beginPath();
          g.arc(p.x, p.y, r * 1.75, 0, Math.PI * 2);
          g.strokeStyle = isFramePoint ? 'rgba(255,243,110,0.75)' : color;
          g.lineWidth = 2;
          g.stroke();
        }

        g.shadowBlur = 0;
        g.font = `700 ${Math.max(8, H * 0.012)}px monospace`;
        g.textAlign = 'center';
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillText(String(i), p.x + 1, p.y - r - 3);
        g.fillStyle = '#fff';
        g.fillText(String(i), p.x, p.y - r - 4);
        g.shadowBlur = 12;
      }

      const wrist = pts[0];
      g.shadowBlur = 0;
      g.font = `bold ${Math.max(12, H * 0.018)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      const text = score ? `${label} ${score}%` : label;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillText(text, wrist.x + 1, wrist.y - 13);
      g.fillStyle = '#fff';
      g.fillText(text, wrist.x, wrist.y - 14);
      g.restore();
    }

    async function tickDetection() {
      if (!modelReady || !cameraReady || !ctx.camera.ready || detectBusy) return;
      const now = performance.now();
      if (now - lastDetectMs < 33) return;
      lastDetectMs = now;
      detectBusy = true;
      try {
        await hands.send({ image: video });
      } catch (e) {
        errMsg = e.message || 'Hand detection failed';
      } finally {
        detectBusy = false;
      }
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
      g.fillText(modelReady ? 'show both hands' : 'MediaPipe Hands pinned version', W / 2, H * 0.535);
    }

    function drawHud() {
      const handsFound = lastResults?.multiHandLandmarks?.length || 0;
      g.save();
      g.font = `700 ${Math.max(12, H * 0.018)}px monospace`;
      g.textAlign = 'left';
      g.fillStyle = handsFound ? '#79ffd7' : 'rgba(255,255,255,0.68)';
      g.fillText(`HANDS ${handsFound}/2`, 18, 30);
      g.fillStyle = 'rgba(255,255,255,0.52)';
      g.fillText('thumb=4  index=8', 18, 52);
      g.textAlign = 'right';
      g.fillText('sanity check', W - 18, 30);
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

    ctx.raf(() => {
      if (!started || !cameraReady) {
        drawStartScreen();
        return;
      }

      drawVideoCover();
      tickDetection();

      const landmarks = lastResults?.multiHandLandmarks || [];
      const handed = lastResults?.multiHandedness || [];
      for (let i = 0; i < landmarks.length; i++) {
        drawHand(landmarks[i], handed[i], i);
      }
      drawHud();
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
