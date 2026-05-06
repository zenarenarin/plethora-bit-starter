window.plethoraBit = {
  meta: {
    title: 'hand keypoints',
    author: 'plethora',
    description: 'Control an EDM loop by closing your hand.',
    tags: ['creative'],
    permissions: ['audio', 'camera', 'haptics', 'networkFetch'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
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

    const installMediaPipeXhrPatch = () => {
      if (window.__plethMediaPipeXhrPatch) return;
      const OrigXHR = window.XMLHttpRequest;
      if (!OrigXHR || !OrigXHR.prototype) return;
      window.__plethMediaPipeXhrPatch = true;

      const nativeOpen = OrigXHR.prototype.open;
      if (typeof nativeOpen === 'function') {
        try {
          OrigXHR.prototype.open = function(method, url) {
            const href = String(url || '');
            this.__plethMediaPipePackageUrl = href.includes('hands_solution_packed_assets.data') ? href : '';
            if (this.__plethMediaPipePackageUrl) {
              try { this.addedTotal = false; } catch (e) {}
            }
            return nativeOpen.apply(this, arguments);
          };
        } catch (e) {}
      }

      let progressProto = OrigXHR.prototype;
      let progressDesc = null;
      while (progressProto && !progressDesc) {
        progressDesc = Object.getOwnPropertyDescriptor(progressProto, 'onprogress');
        if (!progressDesc) progressProto = Object.getPrototypeOf(progressProto);
      }
      if (!progressProto || !progressDesc || typeof progressDesc.set !== 'function') return;

      const seedMediaPipeDownloadEntry = (xhr, event) => {
        const url = xhr && xhr.__plethMediaPipePackageUrl;
        if (!url || !event || !event.loaded) return;
        const mod = window.createMediapipeSolutionsPackedAssets;
        if (!mod || typeof mod !== 'object') return;
        if (!mod.dataFileDownloads) mod.dataFileDownloads = {};
        if (xhr.addedTotal && !mod.dataFileDownloads[url]) {
          mod.dataFileDownloads[url] = {
            loaded: 0,
            total: event.total || 0,
          };
        }
      };

      try {
        Object.defineProperty(progressProto, 'onprogress', {
          configurable: true,
          enumerable: progressDesc.enumerable,
          get: progressDesc.get,
          set(value) {
            const wrapped = typeof value === 'function'
              ? function(event) {
                  seedMediaPipeDownloadEntry(this, event);
                  return value.call(this, event);
                }
              : value;
            return progressDesc.set.call(this, wrapped);
          },
        });
      } catch (e) {}
    };

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
    let _lt = 0;
    let handClose = 0;
    let handCloseTarget = 0;
    let handCenter = null;
    let handX = 0.5;
    let handXTarget = 0.5;
    let handY = 0.5;
    let handYTarget = 0.5;
    let audioCtx = null;
    let masterGain = null;
    let bassFilter = null;
    let bassGain = null;
    let subOsc = null;
    let growlOsc = null;
    let leadGain = null;
    let padGain = null;
    let padFilter = null;
    let hatBuffer = null;
    let nextStepTime = 0;
    let stepIndex = 0;
    const BPM = 128;
    const BASS_NOTES = [55, 55, 65.41, 55, 73.42, 65.41, 49, 55];

    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const dist3 = (a, b) => {
      const dz = (a.z || 0) - (b.z || 0);
      return Math.hypot(a.x - b.x, a.y - b.y, dz);
    };

    const estimateHandClose = (landmarks) => {
      if (!landmarks?.length) return 0;
      const wrist = landmarks[0];
      const palmSize = Math.max(0.001, dist3(wrist, landmarks[9]));
      const tipRatio = [8, 12, 16, 20]
        .map((i) => dist3(wrist, landmarks[i]) / palmSize)
        .reduce((sum, v) => sum + v, 0) / 4;
      return clamp01((1.78 - tipRatio) / 0.62);
    };

    const ensureAudio = () => {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.onDestroy(() => audioCtx?.close());

        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.82;

        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 18;
        comp.ratio.value = 5;
        comp.attack.value = 0.004;
        comp.release.value = 0.18;
        comp.connect(masterGain).connect(audioCtx.destination);

        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = 'lowpass';
        bassFilter.frequency.value = 120;
        bassFilter.Q.value = 8;
        bassGain = audioCtx.createGain();
        bassGain.gain.value = 0.0001;
        bassFilter.connect(bassGain).connect(comp);

        subOsc = audioCtx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.value = BASS_NOTES[0];
        subOsc.connect(bassFilter);
        subOsc.start();

        growlOsc = audioCtx.createOscillator();
        growlOsc.type = 'sawtooth';
        growlOsc.frequency.value = BASS_NOTES[0];
        const growlGain = audioCtx.createGain();
        growlGain.gain.value = 0.18;
        growlOsc.connect(growlGain).connect(bassFilter);
        growlOsc.start();

        padFilter = audioCtx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 700;
        padFilter.Q.value = 0.7;
        padGain = audioCtx.createGain();
        padGain.gain.value = 0.065;
        padFilter.connect(padGain).connect(comp);

        [220, 277.18, 329.63].forEach((freq, i) => {
          const osc = audioCtx.createOscillator();
          osc.type = i === 1 ? 'triangle' : 'sine';
          osc.frequency.value = freq;
          const gain = audioCtx.createGain();
          gain.gain.value = i === 1 ? 0.045 : 0.035;
          osc.connect(gain).connect(padFilter);
          osc.start();
        });

        leadGain = audioCtx.createGain();
        leadGain.gain.value = 0.12;
        leadGain.connect(comp);

        const len = Math.floor(audioCtx.sampleRate * 0.08);
        hatBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const data = hatBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        }
      }

      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (!nextStepTime) nextStepTime = audioCtx.currentTime + 0.03;
    };

    const triggerKick = (when, amount) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, when);
      osc.frequency.exponentialRampToValueAtTime(42, when + 0.11);
      gain.gain.setValueAtTime(0.001, when);
      gain.gain.exponentialRampToValueAtTime(0.55 + amount * 0.14, when + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.24);
      osc.connect(gain).connect(masterGain);
      osc.start(when);
      osc.stop(when + 0.26);
    };

    const triggerHat = (when, amount) => {
      if (!audioCtx || !hatBuffer) return;
      const src = audioCtx.createBufferSource();
      const hp = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();
      src.buffer = hatBuffer;
      hp.type = 'highpass';
      hp.frequency.value = 6200 - amount * 1600;
      gain.gain.setValueAtTime(0.001, when);
      gain.gain.exponentialRampToValueAtTime(0.08 + amount * 0.08, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.055);
      src.connect(hp).connect(gain).connect(masterGain);
      src.start(when);
      src.stop(when + 0.08);
    };

    const triggerClick = (when, amount) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880 + amount * 440;
      gain.gain.setValueAtTime(0.001, when);
      gain.gain.exponentialRampToValueAtTime(0.025 + amount * 0.035, when + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
      osc.connect(gain).connect(masterGain);
      osc.start(when);
      osc.stop(when + 0.045);
    };

    const triggerLead = (when, amount) => {
      if (!audioCtx || !leadGain) return;
      const scale = [329.63, 392, 440, 523.25];
      const idx = Math.floor(stepIndex / 4) % scale.length;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filt = audioCtx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(scale[idx], when);
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(1200 + amount * 1700, when);
      filt.Q.value = 7;
      gain.gain.setValueAtTime(0.001, when);
      gain.gain.exponentialRampToValueAtTime(0.02 + amount * 0.035, when + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
      osc.connect(filt).connect(gain).connect(leadGain);
      osc.start(when);
      osc.stop(when + 0.18);
    };

    const scheduleAudio = () => {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const lookahead = now + 0.09;
      while (nextStepTime < lookahead) {
        const s = stepIndex % 16;
        const amount = handClose;
        if (s % 4 === 0) triggerKick(nextStepTime, amount);
        if (s % 2 === 1 || amount > 0.55) triggerHat(nextStepTime, amount);
        if (s === 6 || s === 14) triggerClick(nextStepTime, amount);
        if ((s % 4 === 2) || (amount > 0.45 && s % 2 === 0)) triggerLead(nextStepTime, amount);

        const note = BASS_NOTES[Math.floor(s / 2) % BASS_NOTES.length];
        subOsc?.frequency.setTargetAtTime(note, nextStepTime, 0.018);
        growlOsc?.frequency.setTargetAtTime(note * 2, nextStepTime, 0.018);

        stepIndex++;
        nextStepTime += 60 / BPM / 4;
      }
    };

    const updateAudioControls = () => {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const amount = handClose;
      bassGain.gain.setTargetAtTime(0.018 + amount * 0.26, now, 0.035);
      bassFilter.frequency.setTargetAtTime(85 + amount * 840 + handY * 780, now, 0.045);
      bassFilter.Q.setTargetAtTime(4 + amount * 10 + handY * 10, now, 0.06);
      padGain.gain.setTargetAtTime(0.08 - amount * 0.04, now, 0.1);
      padFilter.frequency.setTargetAtTime(420 + amount * 1200 + handY * 2600, now, 0.08);
      leadGain.gain.setTargetAtTime(0.06 + handY * 0.2, now, 0.08);
      scheduleAudio();
    };

    const loadHands = async () => {
      try {
        installMediaPipeXhrPatch();
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
      } catch (e) {
        console.warn('[hand_keypoints] MediaPipe load failed:', e && (e.stack || e.message) || e);
        errMsg = e.message || 'Could not load hand model';
      }
    };

    const startCamera = async () => {
      if (loadingCamera || cameraReady) return;
      loadingCamera = true;
      errMsg = null;
      try {
        video = await ctx.camera.start({ facing: 'user' });
        ensureAudio();
        cameraReady = true;
        loadingCamera = false;
        started = true;
        ctx.platform.start();
        ctx.platform.haptic('light');
      } catch (e) {
        loadingCamera = false;
        errMsg = e.message || 'Camera denied';
      }
    };

    const drawVideoCover = () => {
      if (!video || !ctx.camera.ready) return;

      const vw = video.videoWidth || ctx.camera.width || W;
      const vh = video.videoHeight || ctx.camera.height || H;
      const scale = Math.max(W / vw, H / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;

      g.save();
      g.translate(W, 0);
      g.scale(-1, 1);
      g.drawImage(video, dx, dy, dw, dh);
      g.restore();
    };

    const landmarkToPoint = (lm) => {
      const vw = video?.videoWidth || ctx.camera.width || W;
      const vh = video?.videoHeight || ctx.camera.height || H;
      const scale = Math.max(W / vw, H / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;

      return {
        x: W - (dx + lm.x * dw),
        y: dy + lm.y * dh,
        z: lm.z || 0,
      };
    };

    const drawHand = (landmarks, handedness, handIndex) => {
      const pts = landmarks.map(landmarkToPoint);
      const hue = handIndex === 0 ? 168 : 292;
      const label = handedness?.label || '';
      const score = handedness?.score ? Math.round(handedness.score * 100) : 0;

      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.shadowColor = `hsla(${hue},100%,60%,0.7)`;
      g.shadowBlur = 12;

      g.lineWidth = Math.max(2, W * 0.008);
      g.strokeStyle = `hsla(${hue},100%,62%,0.92)`;
      for (const [a, b] of CONNECTORS) {
        g.beginPath();
        g.moveTo(pts[a].x, pts[a].y);
        g.lineTo(pts[b].x, pts[b].y);
        g.stroke();
      }

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const isTip = FINGER_TIPS.has(i);
        const r = isTip ? Math.max(5, W * 0.017) : Math.max(3, W * 0.011);
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fillStyle = isTip ? '#ffffff' : `hsl(${hue},100%,58%)`;
        g.fill();

        if (isTip) {
          g.beginPath();
          g.arc(p.x, p.y, r * 1.75, 0, Math.PI * 2);
          g.strokeStyle = `hsla(${hue},100%,62%,0.45)`;
          g.lineWidth = 2;
          g.stroke();
        }
      }

      const wrist = pts[0];
      g.shadowBlur = 0;
      g.font = `bold ${Math.max(12, H * 0.018)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      const text = score ? `${label} ${score}%` : label;
      g.fillText(text, wrist.x + 1, wrist.y - 13);
      g.fillStyle = '#fff';
      g.fillText(text, wrist.x, wrist.y - 14);
      g.restore();
    };

    const drawCloseMeter = () => {
      const cx = handCenter?.x || W / 2;
      const cy = handCenter?.y || H * 0.42;
      const r = Math.max(32, W * 0.12) + handClose * W * 0.08;

      g.save();
      g.globalCompositeOperation = 'lighter';
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(90,255,214,${0.16 + handClose * 0.24})`);
      grad.addColorStop(0.55, `rgba(255,76,214,${0.05 + handClose * 0.14})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };

    const drawOverlay = () => {
      const handsFound = lastResults?.multiHandLandmarks?.length || 0;
      const safeBottom = ctx.safeArea?.bottom || 0;
      const y = H - safeBottom - H * 0.055;

      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.max(13, H * 0.02)}px sans-serif`;
      g.fillStyle = 'rgba(0,0,0,0.42)';
      g.fillRect(W * 0.17, y - H * 0.025, W * 0.66, H * 0.05);
      g.fillStyle = handsFound ? '#79ffd7' : 'rgba(255,255,255,0.82)';
      const status = handsFound
        ? `clench ${Math.round(handClose * 100)}%   lift ${Math.round(handY * 100)}%`
        : modelReady && cameraReady
          ? 'show your hand'
          : modelReady
            ? 'tap to start camera'
            : 'loading hand model';
      g.fillText(status, W / 2, y);

      const mw = W * 0.46;
      const mh = Math.max(4, H * 0.006);
      const my = y + H * 0.032;
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(W / 2 - mw / 2, my, mw, mh);
      g.fillStyle = '#79ffd7';
      g.fillRect(W / 2 - mw / 2, my, mw * handClose, mh);

      const xY = my + H * 0.016;
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(W / 2 - mw / 2, xY, mw, mh);
      g.fillStyle = '#ff66d8';
      const markerX = W / 2 - mw / 2 + mw * handY;
      g.fillRect(markerX - mh, xY - mh * 0.8, mh * 2, mh * 2.6);
      g.font = `${Math.max(10, H * 0.015)}px sans-serif`;
      g.textAlign = 'left';
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText('dark', W / 2 - mw / 2, xY + H * 0.026);
      g.textAlign = 'right';
      g.fillText('bright', W / 2 + mw / 2, xY + H * 0.026);
      g.restore();
    };

    const drawStartScreen = () => {
      g.fillStyle = '#050608';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      if (errMsg) {
        g.font = `bold ${Math.max(16, H * 0.03)}px sans-serif`;
        g.fillStyle = '#ff5f6d';
        const maxWidth = W * 0.86;
        const words = errMsg.split(' ');
        let line = '';
        let y = H * 0.46;
        for (const word of words) {
          const test = line ? line + ' ' + word : word;
          if (g.measureText(test).width > maxWidth && line) {
            g.fillText(line, W / 2, y);
            y += H * 0.04;
            line = word;
          } else {
            line = test;
          }
        }
        if (line) g.fillText(line, W / 2, y);
        return;
      }

      g.font = `bold ${Math.max(22, H * 0.045)}px sans-serif`;
      g.fillStyle = '#fff';
      g.fillText(modelReady ? 'tap to start' : 'loading model', W / 2, H * 0.46);
      g.font = `${Math.max(12, H * 0.021)}px sans-serif`;
      g.fillStyle = 'rgba(255,255,255,0.44)';
      g.fillText(modelReady ? 'camera + audio start together' : 'MediaPipe Hands via CDN', W / 2, H * 0.535);
    };

    const tickDetection = async () => {
      if (!modelReady || !cameraReady || !ctx.camera.ready || detectBusy) return;
      const now = performance.now();
      if (now - lastDetectMs < 33) return;
      lastDetectMs = now;
      detectBusy = true;
      try {
        await hands.send({ image: video });
      } catch (e) {
        console.warn('[hand_keypoints] Hand detection failed:', e && (e.stack || e.message) || e);
        errMsg = e.message || 'Hand detection failed';
      } finally {
        detectBusy = false;
      }
    };

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      _lt = Date.now();
      if (modelReady) startCamera();
    }, { passive: false });

    ctx.listen(canvas, 'click', () => {
      if (Date.now() - _lt < 500) return;
      if (modelReady) startCamera();
    });

    loadHands();

    ctx.raf(() => {
      if (!started || !cameraReady) {
        drawStartScreen();
        return;
      }

      drawVideoCover();
      tickDetection();

      const landmarks = lastResults?.multiHandLandmarks || [];
      const handed = lastResults?.multiHandedness || [];
      handCloseTarget = 0;
      handCenter = null;
      handXTarget = handXTarget * 0.92 + 0.5 * 0.08;
      handYTarget = handYTarget * 0.92 + 0.5 * 0.08;
      for (let i = 0; i < landmarks.length; i++) {
        const close = estimateHandClose(landmarks[i]);
        if (close > handCloseTarget) {
          handCloseTarget = close;
          handCenter = landmarkToPoint(landmarks[i][9]);
          handXTarget = clamp01(handCenter.x / W);
          handYTarget = clamp01(handCenter.y / H);
        }
        drawHand(landmarks[i], handed[i], i);
      }
      handClose = lerp(handClose, handCloseTarget, 0.18);
      handX = lerp(handX, handXTarget, 0.16);
      handY = lerp(handY, handYTarget, 0.16);
      if (handClose > 0.1) drawCloseMeter();
      updateAudioControls();
      drawOverlay();
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
