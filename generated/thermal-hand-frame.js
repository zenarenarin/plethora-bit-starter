window.plethoraBit = {
  meta: {
    title: 'Thermal Hand Frame',
    author: 'plethora',
    description: 'Use both hands to frame part of the camera feed and turn it thermal.',
    tags: ['camera', 'hands', 'gesture', 'art'],
    permissions: ['camera', 'haptics', 'networkFetch'],
  },

  async init(ctx) {
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const W = ctx.width;
    const H = ctx.height;
    const DPR = ctx.dpr || 1;
    const off = document.createElement('canvas');
    off.width = W * DPR;
    off.height = H * DPR;
    const og = off.getContext('2d', { willReadFrequently: true });
    const tips = { leftThumb: null, leftIndex: null, rightThumb: null, rightIndex: null };
    const trails = [];
    let video = null;
    let hands = null;
    let busy = false;
    let running = true;
    let ready = false;
    let error = null;
    let lastSend = 0;
    let lastThermal = false;
    let areaRatio = 0;
    let frameRect = null;

    function log(message) {
      try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'debug', message })); } catch {}
    }

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function screenPoint(lm) {
      return { x: (1 - lm.x) * W, y: lm.y * H, z: lm.z || 0 };
    }
    function pointColor(name) {
      if (name.includes('Thumb')) return '#ffcc33';
      return '#42f5d7';
    }

    function thermalColor(lum) {
      const t = lum / 255;
      let r, gg, b;
      if (t < 0.2) {
        const k = t / 0.2; r = lerp(8, 35, k); gg = lerp(0, 0, k); b = lerp(32, 120, k);
      } else if (t < 0.4) {
        const k = (t - 0.2) / 0.2; r = lerp(35, 0, k); gg = lerp(0, 160, k); b = lerp(120, 255, k);
      } else if (t < 0.62) {
        const k = (t - 0.4) / 0.22; r = lerp(0, 255, k); gg = lerp(160, 230, k); b = lerp(255, 0, k);
      } else if (t < 0.82) {
        const k = (t - 0.62) / 0.2; r = 255; gg = lerp(230, 60, k); b = 0;
      } else {
        const k = (t - 0.82) / 0.18; r = 255; gg = lerp(60, 255, k); b = lerp(0, 235, k);
      }
      return [r, gg, b];
    }

    function clearTips() {
      tips.leftThumb = null;
      tips.leftIndex = null;
      tips.rightThumb = null;
      tips.rightIndex = null;
      frameRect = null;
      areaRatio = 0;
    }

    function onResults(results) {
      clearTips();
      const landmarks = results.multiHandLandmarks || [];
      const handedness = results.multiHandedness || [];

      for (let i = 0; i < landmarks.length; i++) {
        const label = handedness[i]?.label || handedness[i]?.classification?.[0]?.label || (i === 0 ? 'Left' : 'Right');
        const isLeft = label.toLowerCase() === 'left';
        const handName = isLeft ? 'left' : 'right';
        tips[handName + 'Thumb'] = screenPoint(landmarks[i][4]);
        tips[handName + 'Index'] = screenPoint(landmarks[i][8]);

        for (let j = 0; j < landmarks[i].length; j++) {
          const p = screenPoint(landmarks[i][j]);
          trails.push({ x: p.x, y: p.y, life: j === 4 || j === 8 ? 1 : 0.38, r: j === 4 || j === 8 ? 5 : 2 });
        }
      }

      const pts = [tips.leftThumb, tips.leftIndex, tips.rightThumb, tips.rightIndex].filter(Boolean);
      if (pts.length === 4) {
        const minX = clamp(Math.min(...pts.map(p => p.x)), 0, W);
        const maxX = clamp(Math.max(...pts.map(p => p.x)), 0, W);
        const minY = clamp(Math.min(...pts.map(p => p.y)), 0, H);
        const maxY = clamp(Math.max(...pts.map(p => p.y)), 0, H);
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        frameRect = { x: minX, y: minY, w: width, h: height, pts };
        areaRatio = (width * height) / (W * H);
      }
    }

    function drawThermalRect(rect) {
      const sx = Math.floor(rect.x * DPR);
      const sy = Math.floor(rect.y * DPR);
      const sw = Math.max(2, Math.floor(rect.w * DPR));
      const sh = Math.max(2, Math.floor(rect.h * DPR));
      if (sx < 0 || sy < 0 || sx + sw > off.width || sy + sh > off.height) return;
      const img = og.getImageData(sx, sy, sw, sh);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const edge = Math.abs(data[i] - data[Math.max(0, i - 4)] || 0) * 0.3;
        const [r, gg, b] = thermalColor(clamp(lum + edge, 0, 255));
        data[i] = r;
        data[i + 1] = gg;
        data[i + 2] = b;
      }
      og.putImageData(img, sx, sy);
      g.drawImage(off, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
    }

    function drawKeypoints() {
      const bones = [
        ['leftThumb', 'leftIndex'], ['rightThumb', 'rightIndex'],
        ['leftThumb', 'rightThumb'], ['leftIndex', 'rightIndex'],
      ];
      g.lineWidth = 2;
      for (const [a, b] of bones) {
        if (!tips[a] || !tips[b]) continue;
        g.strokeStyle = 'rgba(255,255,255,0.42)';
        g.beginPath();
        g.moveTo(tips[a].x, tips[a].y);
        g.lineTo(tips[b].x, tips[b].y);
        g.stroke();
      }
      for (const name of Object.keys(tips)) {
        const p = tips[name];
        if (!p) continue;
        g.fillStyle = pointColor(name);
        g.shadowBlur = 18;
        g.shadowColor = pointColor(name);
        g.beginPath();
        g.arc(p.x, p.y, 8, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = '#041016';
        g.lineWidth = 2;
        g.stroke();
      }
    }

    function drawFrame() {
      if (!frameRect) return;
      const active = areaRatio > 0.105;
      if (active && !lastThermal) {
        ctx.platform.haptic('medium');
        ctx.platform.milestone('thermal-frame', { area: areaRatio });
      }
      lastThermal = active;
      g.save();
      g.strokeStyle = active ? '#fffb8f' : 'rgba(255,255,255,0.72)';
      g.lineWidth = active ? 4 : 2;
      g.shadowBlur = active ? 28 : 10;
      g.shadowColor = active ? '#ff3b00' : '#42f5d7';
      g.strokeRect(frameRect.x, frameRect.y, frameRect.w, frameRect.h);
      g.shadowBlur = 0;

      const label = active ? 'THERMAL LOCK' : 'OPEN THE FRAME';
      g.font = `700 ${Math.max(12, H * 0.018)}px monospace`;
      g.textAlign = 'center';
      g.fillStyle = active ? '#fffb8f' : 'rgba(255,255,255,0.72)';
      g.fillText(label, frameRect.x + frameRect.w / 2, Math.max(24, frameRect.y - 12));
      g.restore();
    }

    async function start() {
      try {
        video = await ctx.camera.start({ facing: 'user', width: 640, height: 480 });
        await ctx.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
        hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.62,
          selfieMode: true,
        });
        hands.onResults(onResults);
        ready = true;
        ctx.platform.ready();
        ctx.platform.start();
        log('thermal hand frame ready');
      } catch (e) {
        error = e?.message || 'Could not start hand tracking.';
        log('hand frame failed: ' + error);
      }
    }

    start();

    ctx.raf(async (dt, ts) => {
      if (!running) return;
      g.fillStyle = '#020407';
      g.fillRect(0, 0, W, H);

      if (video && ctx.camera.ready) {
        og.save();
        og.scale(-1, 1);
        og.drawImage(video, -off.width, 0, off.width, off.height);
        og.restore();
        g.drawImage(off, 0, 0, W, H);
        g.fillStyle = 'rgba(0,8,12,0.22)';
        g.fillRect(0, 0, W, H);
      }

      if (ready && !busy && ts - lastSend > 80 && video && ctx.camera.ready) {
        busy = true;
        lastSend = ts;
        hands.send({ image: video }).catch((e) => { error = e?.message || String(e); }).finally(() => { busy = false; });
      }

      if (frameRect && areaRatio > 0.105) drawThermalRect(frameRect);

      for (let i = trails.length - 1; i >= 0; i--) {
        const p = trails[i];
        p.life -= dt * 0.0018;
        if (p.life <= 0) { trails.splice(i, 1); continue; }
        g.globalAlpha = Math.min(1, p.life);
        g.fillStyle = '#42f5d7';
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }

      drawFrame();
      drawKeypoints();

      g.textAlign = 'left';
      g.font = `700 ${Math.max(12, H * 0.017)}px monospace`;
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.fillText('SHOW BOTH HANDS', 18, 30);
      g.fillStyle = frameRect ? '#42f5d7' : 'rgba(255,255,255,0.42)';
      g.fillText(`AREA ${(areaRatio * 100).toFixed(1)}%`, 18, 52);
      if (!ready && !error) {
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,255,255,0.72)';
        g.fillText('loading hand tracker...', W / 2, H / 2);
      }
      if (error) {
        g.textAlign = 'center';
        g.fillStyle = '#ff5c7a';
        g.fillText(error.slice(0, 52), W / 2, H / 2);
      }
    });

    ctx.onDestroy(() => {
      running = false;
      try { ctx.camera.stop(); } catch {}
      try { hands?.close?.(); } catch {}
      trails.length = 0;
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
