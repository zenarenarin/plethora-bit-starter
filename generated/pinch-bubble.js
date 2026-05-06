window.plethoraBit = {
  meta: {
    title: 'Pinch Bubble',
    author: 'plethora',
    description: 'A real Three.js soap bubble appears between thumb and index, growing and spinning with your pinch.',
    tags: ['camera', 'hands', 'gesture', 'threejs', 'art'],
    permissions: ['camera', 'haptics', 'networkFetch'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const bgCanvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = bgCanvas.getContext('2d');
    const threeCanvas = document.createElement('canvas');
    const BUBBLE_RT = 512;

    const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
    const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
    const CONNECTORS = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];

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
    let renderer = null;
    let scene = null;
    let camera3 = null;
    let bubbleGeo = null;
    let running = true;
    const bubbles = new Map();
    const pops = [];

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function angleDelta(a, b) {
      let d = a - b;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    }
    function hypot(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function log(message) {
      try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'debug', message })); } catch {}
    }

    async function loadLibraries() {
      try {
        await ctx.loadScript(THREE_URL);
        await ctx.loadScript(MP_BASE + '/hands.js');
        if (!window.THREE) throw new Error('Three.js failed to load');
        if (!window.Hands) throw new Error('MediaPipe Hands failed to load');
        setupThree();
        hands = new window.Hands({ locateFile: (file) => MP_BASE + '/' + file });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.62,
          minTrackingConfidence: 0.55,
        });
        hands.onResults((results) => { lastResults = results || null; });
        modelReady = true;
        log('Three.js + MediaPipe Hands ready');
      } catch (e) {
        errMsg = e.message || 'Could not load bubble renderer';
      }
    }

    function setupThree() {
      const THREE = window.THREE;
      renderer = new THREE.WebGLRenderer({
        canvas: threeCanvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(BUBBLE_RT, BUBBLE_RT, false);
      renderer.setClearColor(0x000000, 0);
      renderer.sortObjects = true;
      scene = new THREE.Scene();
      camera3 = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
      camera3.position.z = 4;
      bubbleGeo = new THREE.SphereGeometry(1, 96, 64);
    }

    function createBubbleMaterial(hue) {
      const THREE = window.THREE;
      return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uHue: { value: hue },
          uAlpha: { value: 0 },
          uSquish: { value: 0 },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPos;
          varying vec2 vUv;
          uniform float uSquish;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPos = position;
            vUv = uv;
            vec3 p = position;
            p.x *= 1.0 + uSquish * 0.16;
            p.y *= 1.0 - uSquish * 0.10;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec3 vNormal;
          varying vec3 vPos;
          varying vec2 vUv;
          uniform float uTime;
          uniform float uHue;
          uniform float uAlpha;

          vec3 hsv2rgb(vec3 c) {
            vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
            return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
          }

          float filmWave(float phase, float offset) {
            return 0.5 + 0.5 * sin(phase + offset);
          }

          void main() {
            vec3 n = normalize(vNormal);
            vec3 viewDir = vec3(0.0, 0.0, 1.0);
            float ndv = clamp(dot(n, viewDir), 0.0, 1.0);
            float fresnel = pow(1.0 - ndv, 1.65);
            float backRim = pow(1.0 - abs(n.z), 3.2);

            float swirl =
              sin(vUv.y * 23.0 + uTime * 0.85 + sin(vUv.x * 11.0 + uTime * 0.35) * 1.8) +
              sin((n.x + n.y) * 8.0 - uTime * 0.55) * 0.7 +
              sin(length(vPos.xy) * 9.0 + uTime * 0.45) * 0.45;

            float thickness = 0.48 + 0.52 * sin(swirl + n.y * 4.0);
            float angleTerm = 1.0 - ndv;
            float phase = thickness * 9.5 + angleTerm * 7.0 + uTime * 0.28;

            vec3 interference = vec3(
              filmWave(phase, 0.0),
              filmWave(phase, 2.094),
              filmWave(phase, 4.188)
            );
            vec3 hueColor = hsv2rgb(vec3(fract(uHue / 360.0 + thickness * 0.18 + angleTerm * 0.12), 0.78, 1.0));
            vec3 color = mix(interference, hueColor, 0.32);

            float glint = smoothstep(0.965, 1.0, dot(normalize(n + vec3(-0.52, 0.72, 0.45)), viewDir));
            float lowerGlint = smoothstep(0.985, 1.0, dot(normalize(n + vec3(0.45, -0.58, 0.5)), viewDir));
            float latitude = abs(sin((vUv.y - 0.5) * 26.0 + uTime * 0.9));
            float longitude = abs(sin((vUv.x + uTime * 0.07) * 18.0));
            float contour = smoothstep(0.93, 1.0, latitude) * 0.22 + smoothstep(0.965, 1.0, longitude) * 0.12;

            color += vec3(1.0, 0.94, 0.82) * glint * 1.45;
            color += vec3(0.75, 0.95, 1.0) * lowerGlint * 0.42;
            color += vec3(0.85, 0.96, 1.0) * fresnel * 0.52;
            color += hsv2rgb(vec3(fract(uHue / 360.0 + 0.28), 0.85, 1.0)) * contour * 0.85;

            float alpha = uAlpha * (0.018 + fresnel * 0.42 + backRim * 0.09 + glint * 0.22 + lowerGlint * 0.08 + contour * 0.2);
            alpha *= 0.72 + fresnel * 0.55;
            gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.62));
          }
        `,
      });
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

    function drawVideoCover() {
      if (!video || !ctx.camera.ready) return;
      const { dw, dh, dx, dy } = videoCover();
      g.save();
      g.translate(W, 0);
      g.scale(-1, 1);
      g.drawImage(video, dx, dy, dw, dh);
      g.restore();
      g.fillStyle = 'rgba(0,5,12,0.34)';
      g.fillRect(0, 0, W, H);
    }

    function landmarkToPoint(lm) {
      const { dw, dh, dx, dy } = videoCover();
      return { x: W - (dx + lm.x * dw), y: dy + lm.y * dh, z: lm.z || 0 };
    }

    function drawHandLines(pts, color) {
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = Math.max(1.4, W * 0.0045);
      g.strokeStyle = color;
      g.globalAlpha = 0.5;
      for (const [a, b] of CONNECTORS) {
        g.beginPath();
        g.moveTo(pts[a].x, pts[a].y);
        g.lineTo(pts[b].x, pts[b].y);
        g.stroke();
      }
      for (const idx of [4, 8]) {
        const p = pts[idx];
        g.globalAlpha = 1;
        g.fillStyle = '#fff36e';
        g.shadowBlur = 14;
        g.shadowColor = '#fff36e';
        g.beginPath();
        g.arc(p.x, p.y, Math.max(7, W * 0.018), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      g.globalAlpha = 1;
      g.shadowBlur = 0;
    }

    function updateBubble(id, pts, handIndex, dt) {
      const THREE = window.THREE;
      const thumb = pts[4];
      const index = pts[8];
      const wrist = pts[0];
      const middleMcp = pts[9];
      const mid = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
      const d = hypot(thumb, index);
      const angle = Math.atan2(index.y - thumb.y, index.x - thumb.x);
      const palm = Math.max(40, hypot(wrist, middleMcp));
      const targetR = clamp(d * 0.58, palm * 0.32, Math.min(W, H) * 0.2);
      const targetSquish = clamp((d - 28) / 130, 0, 1);
      let b = bubbles.get(id);
      if (!b) {
        const mat = createBubbleMaterial(handIndex === 0 ? 190 : 292);
        const mesh = new THREE.Mesh(bubbleGeo, mat);
        mesh.renderOrder = 10 + handIndex;
        mesh.visible = false;
        scene.add(mesh);
        b = {
          mesh, mat,
          x: mid.x, y: mid.y, r: targetR,
          angle, prevAngle: angle, spin: 0,
          hue: handIndex === 0 ? 190 : 292,
          alpha: 0, squish: targetSquish,
          age: 0, popLatch: false,
        };
        bubbles.set(id, b);
      }

      const da = angleDelta(angle, b.prevAngle);
      b.prevAngle = angle;
      b.spin += da * 1.8;
      b.spin *= 0.92;
      b.angle += b.spin + da * 0.42;
      b.x = mid.x;
      b.y = mid.y;
      b.r = lerp(b.r, targetR, 0.2);
      b.squish = lerp(b.squish, targetSquish, 0.18);
      b.alpha = lerp(b.alpha, 1, 0.2);
      b.age += dt;

      b.mesh.position.set(0, 0, 0);
      b.mesh.scale.set(1, 1, 1);
      b.mesh.rotation.set(Math.sin(b.age * 0.0014) * 0.24, Math.cos(b.age * 0.0011) * 0.2, b.angle);
      b.mat.uniforms.uTime.value = b.age * 0.001;
      b.mat.uniforms.uHue.value = b.hue;
      b.mat.uniforms.uAlpha.value = b.alpha;
      b.mat.uniforms.uSquish.value = b.squish;

      if (d < 24 && !b.popLatch) {
        b.popLatch = true;
        pops.push({ x: b.x, y: b.y, r: b.r, life: 1, hue: b.hue });
        ctx.platform.haptic('medium');
        ctx.platform.milestone('pinch-pop', { hand: handIndex });
      }
      if (d > 42) b.popLatch = false;
    }

    function decayMissing(ids) {
      for (const [id, b] of bubbles.entries()) {
        if (ids.has(id)) continue;
        b.alpha = lerp(b.alpha, 0, 0.14);
        b.r *= 0.985;
        b.mat.uniforms.uAlpha.value = b.alpha;
        if (b.alpha < 0.03) {
          scene.remove(b.mesh);
          b.mesh.geometry = null;
          b.mat.dispose();
          bubbles.delete(id);
        }
      }
    }

    function drawPops(dt) {
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.life -= dt * 0.0018;
        p.r += dt * 0.19;
        if (p.life <= 0) { pops.splice(i, 1); continue; }
        g.save();
        g.globalAlpha = p.life;
        g.strokeStyle = `hsl(${p.hue},100%,72%)`;
        g.lineWidth = 2 + p.life * 5;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.stroke();
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          g.beginPath();
          g.moveTo(p.x + Math.cos(a) * p.r * 0.55, p.y + Math.sin(a) * p.r * 0.55);
          g.lineTo(p.x + Math.cos(a) * p.r * 1.12, p.y + Math.sin(a) * p.r * 1.12);
          g.stroke();
        }
        g.restore();
      }
    }

    function drawBubbleShadow() {
      for (const b of bubbles.values()) {
        if (b.alpha <= 0.02) continue;
        const grd = g.createRadialGradient(b.x, b.y, b.r * 0.15, b.x, b.y, b.r * 1.12);
        grd.addColorStop(0, `hsla(${b.hue},100%,70%,${0.045 * b.alpha})`);
        grd.addColorStop(0.62, `hsla(${b.hue + 80},100%,58%,${0.022 * b.alpha})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(b.x, b.y, b.r * 1.14, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        g.arc(b.x, b.y, Math.max(2, W * 0.006), 0, Math.PI * 2);
        g.fill();
      }
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
      g.fillText(modelReady ? 'tap to start' : 'loading bubble shader', W / 2, H * 0.46);
      g.font = `${Math.max(12, H * 0.021)}px sans-serif`;
      g.fillStyle = 'rgba(255,255,255,0.44)';
      g.fillText('Three.js soap bubble between thumb + index', W / 2, H * 0.535);
    }

    function drawHud(count) {
      g.save();
      g.font = `700 ${Math.max(12, H * 0.018)}px monospace`;
      g.textAlign = 'left';
      g.fillStyle = count ? '#9ffcff' : 'rgba(255,255,255,0.66)';
      g.fillText(`SOAP BUBBLES ${count}`, 18, 30);
      g.fillStyle = 'rgba(255,255,255,0.52)';
      g.fillText('rotate thumb/index to spin', 18, 52);
      g.textAlign = 'right';
      g.fillText('pinch to pop', W - 18, 30);
      g.restore();
    }

    function drawThreeBubbles(dt) {
      if (!renderer || !scene || !camera3) return;
      for (const b of bubbles.values()) {
        if (b.alpha <= 0.02) continue;
        b.mesh.rotation.x += dt * 0.00035;
        b.mesh.rotation.y += dt * 0.00042;
        b.mat.uniforms.uTime.value = b.age * 0.001 + performance.now() * 0.0002;
        b.mesh.visible = true;
        renderer.clear();
        renderer.render(scene, camera3);
        b.mesh.visible = false;

        const size = b.r * 2.38;
        g.save();
        g.globalCompositeOperation = 'screen';
        g.drawImage(threeCanvas, b.x - size / 2, b.y - size / 2, size, size);
        g.restore();
      }
    }

    ctx.listen(bgCanvas, 'touchstart', (e) => {
      e.preventDefault();
      lastTap = Date.now();
      if (modelReady) startCamera();
    }, { passive: false });
    ctx.listen(bgCanvas, 'click', () => {
      if (Date.now() - lastTap < 500) return;
      if (modelReady) startCamera();
    });

    loadLibraries();
    ctx.platform.ready();

    ctx.raf((dt) => {
      if (!running) return;
      if (!started || !cameraReady) {
        drawStartScreen();
        if (renderer) renderer.clear();
        return;
      }

      drawVideoCover();
      tickDetection();

      const landmarks = lastResults?.multiHandLandmarks || [];
      const active = new Set();
      for (let i = 0; i < landmarks.length; i++) {
        const pts = landmarks[i].map(landmarkToPoint);
        const color = i === 0 ? 'rgba(121,255,215,0.7)' : 'rgba(255,102,216,0.7)';
        drawHandLines(pts, color);
        updateBubble('hand-' + i, pts, i, dt);
        active.add('hand-' + i);
      }
      decayMissing(active);

      drawBubbleShadow();
      drawThreeBubbles(dt);
      drawPops(dt);
      drawHud(bubbles.size);
    });

    ctx.onDestroy(() => {
      running = false;
      try { ctx.camera.stop(); } catch {}
      try { hands?.close?.(); } catch {}
      for (const b of bubbles.values()) {
        scene?.remove(b.mesh);
        b.mat?.dispose?.();
      }
      bubbleGeo?.dispose?.();
      renderer?.dispose?.();
      bubbles.clear();
      pops.length = 0;
    });
  },

  pause(ctx) { ctx.camera.pause(); },
  resume(ctx) { ctx.camera.resume(); },
  destroy(ctx) { ctx.camera.stop(); },
};
