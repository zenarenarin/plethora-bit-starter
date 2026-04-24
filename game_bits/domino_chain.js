// Domino Chain — Real Ammo.js rigid-body physics + PlayCanvas rendering
// window.scrollerApp assigned at top level (no ES imports)

window.scrollerApp = {
  meta: {
    title: 'Domino Chain',
    author: 'plethora',
    description: 'One tap. Twenty dominoes. Pure satisfaction.',
    tags: ['game'],
  },

  // ── internal state ──────────────────────────────────────────
  _app: null,
  _canvas: null,
  _container: null,
  _camera: null,
  _dominos: [],          // array of { entity, angleY, hasSounded }
  _dominoAngles: [],     // pre-computed facing angles for impulse direction
  _chainStarted: false,
  _chainComplete: false,
  _resetTimer: null,
  _overlay: null,
  _overlayEl: null,
  _camAngle: 0,
  _updateHandler: null,
  _resizeHandler: null,
  _pointLights: [],
  _actx: null,
  _kickTime: null,

  // ── entry ───────────────────────────────────────────────────
  init(container) {
    this._container = container;
    this._chainStarted = false;
    this._chainComplete = false;
    this._dominos = [];
    this._dominoAngles = [];
    this._pointLights = [];
    this._kickTime = null;

    this._showLoadingOverlay(container);
    this._loadPC(() => this._loadAmmo(() => this._boot(container)));
  },

  // ── loaders ─────────────────────────────────────────────────
  _loadPC(cb) {
    if (window.pc) return cb();
    const s = document.createElement('script');
    s.src = 'https://code.playcanvas.com/playcanvas-stable.min.js';
    s.onload = cb;
    s.onerror = () => this._showError('Failed to load PlayCanvas');
    document.head.appendChild(s);
  },

  _loadAmmo(cb) {
    if (window.Ammo) return cb();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/ammo.js@0.0.10/ammo.js';
    s.onload = cb;
    s.onerror = () => cb();
    document.head.appendChild(s);
  },

  // ── boot PlayCanvas ─────────────────────────────────────────
  _boot(container) {
    this._removeOverlay();

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    container.appendChild(canvas);
    this._canvas = canvas;

    const app = new pc.Application(canvas, {
      mouse: new pc.Mouse(canvas),
      touch: new pc.TouchDevice(canvas),
      graphicsDeviceOptions: { antialias: true },
    });
    this._app = app;

    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;

    // Set gravity via rigidbody system if available
    if (app.systems && app.systems.rigidbody) {
      app.systems.rigidbody.gravity.set(0, -9.8, 0);
    }

    this._resizeHandler = () => {
      if (!this._app) return;
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      app.resizeCanvas();
    };
    window.addEventListener('resize', this._resizeHandler);

    app.start();

    // Wait one tick for PlayCanvas's Ammo.then(ready) before adding physics entities
    setTimeout(() => {
      if (!this._app) return;
      this._buildScene();
      this._buildDominos();
      this._showStartOverlay();
    }, 0);
  },

  // ── scene: camera + lights + ground ─────────────────────────
  _buildScene() {
    const app = this._app;

    // Camera
    const camEntity = new pc.Entity('camera');
    camEntity.addComponent('camera', {
      clearColor: new pc.Color(0.031, 0.031, 0.063),
      fov: 50,
      nearClip: 0.1,
      farClip: 200,
    });
    camEntity.setPosition(0, 5, 12);
    camEntity.lookAt(new pc.Vec3(0, 1, 0));
    app.root.addChild(camEntity);
    this._camera = camEntity;

    // Directional key light
    const dirLight = new pc.Entity('dirLight');
    dirLight.addComponent('light', {
      type: pc.LIGHTTYPE_DIRECTIONAL,
      color: new pc.Color(0.95, 0.92, 1.0),
      intensity: 1.8,
      castShadows: true,
      shadowDistance: 30,
      shadowResolution: 1024,
      shadowBias: 0.05,
      normalOffsetBias: 0.05,
    });
    dirLight.setEulerAngles(45, -30, 0);
    app.root.addChild(dirLight);

    // Ambient fill
    const ambLight = new pc.Entity('ambLight');
    ambLight.addComponent('light', {
      type: pc.LIGHTTYPE_DIRECTIONAL,
      color: new pc.Color(0.2, 0.25, 0.4),
      intensity: 0.5,
      castShadows: false,
    });
    ambLight.setEulerAngles(135, 60, 0);
    app.root.addChild(ambLight);

    // Ground — static rigid body (dark marble look)
    const ground = new pc.Entity('ground');
    ground.addComponent('model', { type: 'plane' });
    const gMat = new pc.StandardMaterial();
    gMat.diffuse = new pc.Color(0.08, 0.09, 0.12);
    gMat.metalness = 0.1;
    gMat.gloss = 0.85;
    gMat.useMetalness = true;
    gMat.update();
    ground.model.material = gMat;
    ground.setLocalScale(20, 1, 20);
    app.root.addChild(ground);
    ground.addComponent('rigidbody', { type: pc.BODYTYPE_STATIC, friction: 0.8 });
    ground.addComponent('collision', {
      type: 'box',
      halfExtents: new pc.Vec3(10, 0.05, 10),
    });

    // Camera orbit update
    this._camAngle = 0;
    this._updateHandler = (dt) => this._onUpdate(dt);
    app.on('update', this._updateHandler);
  },

  // ── domino color gradient (blue→violet→red) ─────────────────
  _colorForT(t) {
    if (t < 0.5) {
      const s = t * 2;
      return new pc.Color(0.05 + s * 0.45, 0.2 - s * 0.1, 0.9 - s * 0.3);
    } else {
      const s = (t - 0.5) * 2;
      return new pc.Color(0.5 + s * 0.5, 0.1 - s * 0.05, 0.6 - s * 0.55);
    }
  },

  // ── build dominos with real physics ─────────────────────────
  _buildDominos() {
    // Clear old entities
    for (const d of this._dominos) d.entity.destroy();
    this._dominos = [];
    this._dominoAngles = [];
    for (const pl of this._pointLights) pl.destroy();
    this._pointLights = [];

    const NUM = 20;
    const W = 0.3, H = 1.5, D = 0.1;

    for (let i = 0; i < NUM; i++) {
      const t = i / (NUM - 1);
      const x = (t - 0.5) * 8;
      const z = Math.sin(t * Math.PI * 2) * 2;

      // Tangent for facing direction
      const t2 = Math.min((i + 0.01) / (NUM - 1), 1);
      const x2 = (t2 - 0.5) * 8;
      const z2 = Math.sin(t2 * Math.PI * 2) * 2;
      const angleY = Math.atan2(x2 - x, z2 - z) * (180 / Math.PI);

      const e = this._createDomino(x, z, angleY, i, W, H, D);

      this._dominos.push({ entity: e, angleY, hasSounded: false });
      this._dominoAngles.push(angleY);
    }
  },

  _createDomino(x, z, angleY, colorIndex, W, H, D) {
    const e = new pc.Entity('domino_' + colorIndex);
    e.addComponent('model', { type: 'box' });

    const t = colorIndex / 19;
    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(t * 0.8, 0.2, 1 - t * 0.8);
    mat.emissive = new pc.Color(t * 0.1, 0.02, (1 - t) * 0.1);
    mat.metalness = 0.3;
    mat.gloss = 0.6;
    mat.useMetalness = true;
    mat.update();
    e.model.material = mat;

    e.setLocalScale(W, H, D);
    e.setPosition(x, H / 2, z);
    e.setEulerAngles(0, angleY, 0);

    this._app.root.addChild(e);
    e.addComponent('rigidbody', {
      type: pc.BODYTYPE_DYNAMIC,
      mass: 0.5,
      friction: 0.5,
      restitution: 0.1,
      linearDamping: 0.1,
      angularDamping: 0.3,
    });
    e.addComponent('collision', {
      type: 'box',
      halfExtents: new pc.Vec3(W / 2, H / 2, D / 2),
    });
    return e;
  },

  // ── update loop ─────────────────────────────────────────────
  _onUpdate(dt) {
    // Slow camera orbit once chain starts
    if (this._chainStarted) {
      this._camAngle += 8 * dt; // degrees per second
      const r = 12;
      this._camera.setPosition(
        Math.sin(this._camAngle * Math.PI / 180) * r,
        5,
        Math.cos(this._camAngle * Math.PI / 180) * r
      );
      this._camera.lookAt(new pc.Vec3(0, 1, 0));
    }

    if (!this._chainStarted || this._chainComplete) return;

    // Per-domino: watch for tilt sound cue
    for (let i = 0; i < this._dominos.length; i++) {
      const d = this._dominos[i];
      if (d.hasSounded) continue;

      const angles = d.entity.getEulerAngles();
      // Ammo physics tilts on X or Z; check both
      const tiltX = Math.abs(angles.x);
      const tiltZ = Math.abs(angles.z);
      // Euler wraps: a 30° tip can appear as ~330° (i.e. > 300 means ~360-30=330)
      const normX = tiltX > 180 ? 360 - tiltX : tiltX;
      const normZ = tiltZ > 180 ? 360 - tiltZ : tiltZ;

      if (normX > 30 || normZ > 30) {
        this._soundDominoFall(i, this._dominos.length);
        d.hasSounded = true;
        this._spawnSpark(d);
      }
    }

    // Check chain complete: last domino tilt > 60°, or 8s since kick
    const last = this._dominos[this._dominos.length - 1];
    const lastAngles = last.entity.getEulerAngles();
    const lastTiltX = Math.abs(lastAngles.x);
    const lastTiltZ = Math.abs(lastAngles.z);
    const lastNormX = lastTiltX > 180 ? 360 - lastTiltX : lastTiltX;
    const lastNormZ = lastTiltZ > 180 ? 360 - lastTiltZ : lastTiltZ;
    const lastDown = (lastNormX > 60 || lastNormZ > 60);
    const timedOut = this._kickTime && (Date.now() - this._kickTime) > 8000;

    if ((lastDown || timedOut) && !this._chainComplete) {
      this._chainComplete = true;
      this._showCompleteOverlay();
    }
  },

  // ── spark flash ─────────────────────────────────────────────
  _spawnSpark(d) {
    const app = this._app;
    const pos = d.entity.getPosition();
    const col = d.entity.model.material.diffuse;

    const pl = new pc.Entity('spark');
    pl.addComponent('light', {
      type: pc.LIGHTTYPE_POINT,
      color: new pc.Color(
        Math.min(col.r + 0.3, 1),
        Math.min(col.g + 0.2, 1),
        Math.min(col.b + 0.2, 1)
      ),
      intensity: 8,
      range: 3,
      castShadows: false,
    });
    pl.setPosition(pos.x, pos.y + 0.5, pos.z);
    app.root.addChild(pl);
    this._pointLights.push(pl);

    const start = performance.now();
    const fade = () => {
      if (!this._app || !pl.light) return;
      const p = Math.min((performance.now() - start) / 400, 1);
      pl.light.intensity = 8 * (1 - p);
      if (p < 1) {
        requestAnimationFrame(fade);
      } else {
        pl.destroy();
        const idx = this._pointLights.indexOf(pl);
        if (idx > -1) this._pointLights.splice(idx, 1);
      }
    };
    requestAnimationFrame(fade);
  },

  // ── overlays ────────────────────────────────────────────────
  _showLoadingOverlay(container) {
    const ov = document.createElement('div');
    ov.style.cssText = `
      position:absolute;inset:0;display:flex;align-items:center;
      justify-content:center;background:#080810;z-index:10;
      font-family:system-ui,sans-serif;color:#8899ff;font-size:18px;
      letter-spacing:0.05em;
    `;
    ov.textContent = 'Loading…';
    container.style.position = 'relative';
    container.appendChild(ov);
    this._overlay = ov;
    this._overlayEl = ov;
  },

  _removeOverlay() {
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    if (this._overlayEl && this._overlayEl !== this._overlay) {
      this._overlayEl.remove();
    }
    this._overlayEl = null;
  },

  _showStartOverlay() {
    this._removeOverlay();
    const container = this._container;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes dcPulse {
        0%,100%{transform:scale(1);box-shadow:0 0 40px rgba(100,80,255,0.5);}
        50%{transform:scale(1.04);box-shadow:0 0 60px rgba(100,80,255,0.8);}
      }
    `;
    document.head.appendChild(style);

    const ov = document.createElement('div');
    ov.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;z-index:10;
      pointer-events:none;
      font-family:system-ui,sans-serif;
      background:linear-gradient(180deg,rgba(8,8,16,0.6) 0%,rgba(8,8,16,0.2) 100%);
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      font-size:clamp(28px,7vw,42px);font-weight:800;
      color:#fff;letter-spacing:0.02em;text-shadow:0 0 30px #6677ff;
      margin-bottom:12px;
    `;
    title.textContent = 'Domino Chain';

    const sub = document.createElement('div');
    sub.style.cssText = `
      font-size:clamp(15px,4vw,20px);color:#aabbff;
      margin-bottom:48px;letter-spacing:0.05em;
    `;
    sub.textContent = 'One tap. Twenty dominoes. Pure satisfaction.';

    const btn = document.createElement('div');
    btn.style.cssText = `
      font-size:clamp(16px,4vw,22px);color:#fff;
      background:linear-gradient(135deg,#4455ff,#aa33ff);
      padding:14px 36px;border-radius:50px;pointer-events:all;
      cursor:pointer;box-shadow:0 0 40px rgba(100,80,255,0.6);
      letter-spacing:0.05em;font-weight:700;
      animation:dcPulse 1.8s ease-in-out infinite;
    `;
    btn.textContent = '▶ Tap to start the chain';

    ov.appendChild(title);
    ov.appendChild(sub);
    ov.appendChild(btn);
    container.appendChild(ov);
    this._overlay = ov;
    this._overlayEl = ov;

    const onTap = () => {
      this._removeOverlay();
      this._kickChain();
    };
    btn.addEventListener('pointerdown', onTap, { once: true });
  },

  _showCompleteOverlay() {
    this._removeOverlay();
    const container = this._container;

    const style = document.createElement('style');
    style.textContent = `@keyframes dcFadeIn{from{opacity:0}to{opacity:1}}`;
    document.head.appendChild(style);

    const ov = document.createElement('div');
    ov.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;z-index:10;
      font-family:system-ui,sans-serif;
      background:linear-gradient(180deg,rgba(8,8,16,0.7) 0%,rgba(8,8,16,0.3) 100%);
      animation:dcFadeIn 0.6s ease;
    `;

    const msg = document.createElement('div');
    msg.style.cssText = `
      font-size:clamp(26px,7vw,44px);font-weight:800;color:#fff;
      text-shadow:0 0 40px #ff88aa;margin-bottom:16px;text-align:center;
    `;
    msg.textContent = 'Chain Complete! ✨';

    const sub = document.createElement('div');
    sub.style.cssText = `
      font-size:clamp(14px,3.5vw,18px);color:#ffbbcc;
      margin-bottom:40px;letter-spacing:0.04em;
    `;
    sub.textContent = 'Resetting…';

    ov.appendChild(msg);
    ov.appendChild(sub);
    container.appendChild(ov);
    this._overlay = ov;
    this._overlayEl = ov;

    this._soundComplete();

    this._resetTimer = setTimeout(() => {
      this._reset();
    }, 3000);
  },

  _showError(msg) {
    this._removeOverlay();
    const container = this._container;
    const ov = document.createElement('div');
    ov.style.cssText = `
      position:absolute;inset:0;display:flex;align-items:center;
      justify-content:center;background:#080810;z-index:10;
      font-family:system-ui,sans-serif;color:#ff6677;font-size:16px;
      text-align:center;padding:24px;
    `;
    ov.textContent = msg;
    container.appendChild(ov);
    this._overlay = ov;
    this._overlayEl = ov;
  },

  // ── audio ────────────────────────────────────────────────────
  _initAudio() {
    if (this._actx) return;
    this._actx = new (window.AudioContext || window.webkitAudioContext)();
  },

  _soundTap() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(600, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    o.start(); o.stop(ctx.currentTime + 0.06);
  },

  _soundDominoFall(index, total) {
    if (!this._actx) return;
    const ctx = this._actx;
    const t = ctx.currentTime;
    const baseFreq = 180 + (index / total) * 220; // 180–400 Hz across chain
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'triangle';
    o.frequency.setValueAtTime(baseFreq * 2, t);
    o.frequency.exponentialRampToValueAtTime(baseFreq, t + 0.06);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.start(t); o.stop(t + 0.12);
  },

  _soundComplete() {
    if (!this._actx) return;
    const ctx = this._actx;
    [261, 329, 392, 523].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.06;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.start(t); o.stop(t + 0.6);
    });
  },

  // ── kick + reset ─────────────────────────────────────────────
  _kickChain() {
    if (this._dominos.length === 0) return;
    this._initAudio();
    if (this._actx && this._actx.state === 'suspended') {
      this._actx.resume();
    }
    this._soundTap();
    this._chainStarted = true;
    this._chainComplete = false;
    this._camAngle = 0;
    this._kickTime = Date.now();

    // Apply impulse to first domino along its facing direction
    const d = this._dominos[0];
    const rad = this._dominoAngles[0] * Math.PI / 180;
    // Impulse along local +Z (the direction it faces and will tip toward)
    d.entity.rigidbody.applyImpulse(
      new pc.Vec3(Math.sin(rad) * 3, 0.5, Math.cos(rad) * 3)
    );
  },

  _reset() {
    this._chainStarted = false;
    this._chainComplete = false;
    this._camAngle = 0;
    this._kickTime = null;

    if (this._camera) {
      this._camera.setPosition(0, 5, 12);
      this._camera.lookAt(new pc.Vec3(0, 1, 0));
    }

    this._buildDominos();
    this._showStartOverlay();
  },

  // ── cleanup ──────────────────────────────────────────────────
  destroy() {
    clearTimeout(this._resetTimer);
    this._resetTimer = null;

    window.removeEventListener('resize', this._resizeHandler);
    this._resizeHandler = null;

    if (this._app) {
      if (this._updateHandler) {
        this._app.off('update', this._updateHandler);
        this._updateHandler = null;
      }
      this._app.destroy();
      this._app = null;
    }

    if (this._actx) { this._actx.close(); this._actx = null; }

    if (this._canvas) { this._canvas.remove(); this._canvas = null; }

    if (this._overlayEl) { this._overlayEl.remove(); this._overlayEl = null; }
    this._overlay = null;

    this._dominos = [];
    this._dominoAngles = [];
    this._pointLights = [];
    this._camera = null;
    this._container = null;
  },
};
