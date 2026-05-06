// Marble Run — Plethora Bit
// Tilt the board. Roll the marble. Find the goal.

window.scrollerApp = {
  meta: {
    title: 'Marble Run',
    author: 'plethora',
    description: 'Tilt the board. Roll the marble. Find the goal.',
    tags: ['game'],
    permissions: ['audio', 'motion', 'networkFetch'],
  },

  _app: null,
  _canvas: null,
  _marble: null,
  _goalEntity: null,
  _glowLight: null,
  _camera: null,
  _startTime: null,
  _bestTime: null,
  _won: false,
  _overlay: null,
  _hud: null,
  _hintEl: null,
  _hudTimer: null,
  _restartTimer: null,

  // Tilt input
  _tiltX: 0,
  _tiltZ: 0,

  // Motion sensor
  _onDeviceOrientation: null,
  _orientNeutralBeta: null,
  _orientNeutralGamma: null,

  // Event listener refs
  _onMouseDown: null,
  _onMouseMove: null,
  _onMouseUp: null,

  // Audio
  _actx: null,
  _rollOsc: null,
  _rollGain: null,
  _lastBounce: 0,

  // Glow animation
  _glowPhase: 0,

  // Start position
  _startX: 0,
  _startZ: -4,

  init(container) {
    this._won = false;
    this._tiltX = 0;
    this._tiltZ = 0;
    this._orientNeutralBeta = null;
    this._orientNeutralGamma = null;
    this._glowPhase = 0;
    this._overlay = null;
    this._hud = null;
    this._hintEl = null;
    this._hudTimer = null;
    this._restartTimer = null;

    this._loadLibs(() => this._setup(container));
  },

  _loadLibs(cb) {
    const loadScript = (src, onload) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = onload;
      s.onerror = onload; // degrade gracefully
      document.head.appendChild(s);
    };

    // Load PlayCanvas first, then Ammo
    if (window.pc) {
      this._loadAmmo(cb);
    } else {
      loadScript('https://code.playcanvas.com/playcanvas-stable.min.js', () => {
        this._loadAmmo(cb);
      });
    }
  },

  _loadAmmo(cb) {
    if (window.Ammo) return cb();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/ammo.js@0.0.10/ammo.js';
    s.onload = cb;
    s.onerror = () => cb();
    document.head.appendChild(s);
  },

  _setup(container) {
    // ── Canvas ──────────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;position:relative;';
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    container.appendChild(canvas);
    this._canvas = canvas;

    // ── PlayCanvas app ───────────────────────────────────────
    const app = new pc.Application(canvas, {
      mouse: new pc.Mouse(canvas),
      touch: new pc.TouchDevice(canvas),
      graphicsDeviceOptions: { antialias: true, alpha: false },
    });
    this._app = app;

    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    // Enable physics if ammo loaded successfully
    if (app.systems && app.systems.rigidbody) {
      app.systems.rigidbody.gravity.set(0, -20, 0);
    }

    app.scene.ambientLight = new pc.Color(0.07, 0.10, 0.18);

    // ── Camera ───────────────────────────────────────────────
    const cameraEntity = new pc.Entity('camera');
    cameraEntity.addComponent('camera', {
      fov: 50,
      nearClip: 0.1,
      farClip: 100,
      clearColor: new pc.Color(0.04, 0.04, 0.08),
    });
    // Initial position above start — update() will chase marble
    cameraEntity.setPosition(this._startX, 14, this._startZ + 2);
    cameraEntity.lookAt(new pc.Vec3(this._startX, 0, this._startZ));
    app.root.addChild(cameraEntity);
    this._camera = cameraEntity;

    // ── Lights ───────────────────────────────────────────────
    const sun = new pc.Entity('sun');
    sun.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.95, 0.85),
      intensity: 1.6,
      castShadows: true,
      shadowBias: 0.05,
      shadowDistance: 30,
    });
    sun.setEulerAngles(50, 40, 0);
    app.root.addChild(sun);

    const fill = new pc.Entity('fill');
    fill.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.2, 0.3, 0.6),
      intensity: 0.5,
      castShadows: false,
    });
    fill.setEulerAngles(30, 220, 0);
    app.root.addChild(fill);

    // ── HUD & controls ────────────────────────────────────────
    this._buildHUD(container);
    this._setupControls(canvas);

    app.on('update', (dt) => this._update(dt));
    app.start();

    // Wait one tick for PlayCanvas's Ammo.then(ready) before adding physics entities
    setTimeout(() => {
      if (!this._app) return;
      this._buildTrack(app);
      this._marble = this._createMarble(app);
      this._startTime = Date.now();
    }, 0);
  },

  // ── Materials ────────────────────────────────────────────────

  _mkMat(diffuse, metalness, gloss, emissive, emissiveIntensity) {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(diffuse[0], diffuse[1], diffuse[2]);
    m.metalness = metalness || 0;
    m.gloss = gloss || 0.2;
    m.useMetalness = true;
    if (emissive) {
      m.emissive = new pc.Color(emissive[0], emissive[1], emissive[2]);
      m.emissiveIntensity = emissiveIntensity || 1.0;
    }
    m.update();
    return m;
  },

  // ── Static box helper (with Ammo physics if available) ───────

  _makeBox(app, x, y, z, sx, sy, sz, mat) {
    const e = new pc.Entity();
    e.addComponent('model', { type: 'box' });
    e.model.material = mat;
    e.setLocalScale(sx, sy, sz);
    e.setPosition(x, y, z);

    app.root.addChild(e);
    if (app.systems && app.systems.rigidbody) {
      e.addComponent('rigidbody', {
        type: pc.BODYTYPE_STATIC,
        friction: 0.5,
        restitution: 0.2,
      });
      e.addComponent('collision', {
        type: 'box',
        halfExtents: new pc.Vec3(sx / 2, sy / 2, sz / 2),
      });
    }
    return e;
  },

  // ── Track layout ─────────────────────────────────────────────
  //
  // Marble starts at (0, 1, -4). Goal at (3.5, 0.5, 3.5).
  // Winding L-shaped path guarded by walls.
  // All measurements in world units.

  _buildTrack(app) {
    const floorMat = this._mkMat([0.10, 0.12, 0.18], 0.05, 0.35);
    const wallMat  = this._mkMat([0.22, 0.25, 0.38], 0.12, 0.20);
    const goalMat  = this._mkMat([0.8, 0.6, 0.0], 0.5, 0.8, [0.9, 0.65, 0.0], 1.4);

    // Floor platform — 12×12 base
    this._makeBox(app, 0, 0, 0, 12, 0.3, 12, floorMat);

    // ── Outer walls ─────────────────────────────────────────
    //   top / bottom / left / right
    this._makeBox(app,  0,   0.65, -6,   12.4, 1.0, 0.4, wallMat); // top
    this._makeBox(app,  0,   0.65,  6,   12.4, 1.0, 0.4, wallMat); // bottom
    this._makeBox(app, -6,   0.65,  0,    0.4, 1.0, 12.4, wallMat); // left
    this._makeBox(app,  6,   0.65,  0,    0.4, 1.0, 12.4, wallMat); // right

    // ── Internal walls — winding path ──────────────────────
    // Horizontal shelf from left, gap on right
    this._makeBox(app, -1.5, 0.65, -2,   7.0, 1.0, 0.4, wallMat);
    // Vertical bar from top, gap at bottom
    this._makeBox(app,  2.0, 0.65, -3.8,  0.4, 1.0, 4.4, wallMat);
    // Horizontal shelf from right, gap on left
    this._makeBox(app,  1.5, 0.65,  0.5,  7.0, 1.0, 0.4, wallMat);
    // Vertical bar from bottom, gap at top
    this._makeBox(app, -2.0, 0.65,  2.5,  0.4, 1.0, 3.0, wallMat);
    // Short blocker forcing turn toward goal
    this._makeBox(app,  0.5, 0.65,  3.8,  5.0, 1.0, 0.4, wallMat);

    // ── Goal sphere (visual only — win detection via distance) ──
    const goal = new pc.Entity('goal');
    goal.addComponent('model', { type: 'sphere' });
    goal.model.material = goalMat;
    goal.setPosition(3.5, 0.5, 3.5);
    goal.setLocalScale(0.8, 0.8, 0.8);
    app.root.addChild(goal);
    this._goalEntity = goal;

    // Pulsing gold point light at goal
    const glow = new pc.Entity('glow');
    glow.addComponent('light', {
      type: 'point',
      color: new pc.Color(1, 0.8, 0),
      intensity: 4,
      range: 4,
    });
    glow.setPosition(3.5, 1.5, 3.5);
    app.root.addChild(glow);
    this._glowLight = glow;
  },

  // ── Marble (dynamic sphere with Ammo rigidbody) ──────────────

  _createMarble(app) {
    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(0.75, 0.8, 0.9);
    mat.metalness = 1.0;
    mat.gloss = 0.92;
    mat.useMetalness = true;
    mat.emissive = new pc.Color(0.05, 0.1, 0.2);
    mat.update();

    const marble = new pc.Entity('marble');
    marble.addComponent('model', { type: 'sphere' });
    marble.model.material = mat;
    marble.setLocalScale(0.7, 0.7, 0.7);
    marble.setPosition(this._startX, 1, this._startZ);

    app.root.addChild(marble);
    if (app.systems && app.systems.rigidbody) {
      marble.addComponent('rigidbody', {
        type: pc.BODYTYPE_DYNAMIC,
        mass: 1,
        friction: 0.5,
        restitution: 0.1,
        linearDamping: 0.2,
        angularDamping: 0.4,
      });
      marble.addComponent('collision', {
        type: 'sphere',
        radius: 0.35,
      });
    }
    return marble;
  },

  // ── Marble reset ──────────────────────────────────────────────

  _resetMarble() {
    if (!this._marble) return;
    const rb = this._marble.rigidbody;
    if (rb) {
      // Teleport via rigidbody to keep Ammo world in sync
      this._marble.setPosition(this._startX, 1, this._startZ);
      rb.teleport(this._startX, 1, this._startZ);
      rb.linearVelocity = new pc.Vec3(0, 0, 0);
      rb.angularVelocity = new pc.Vec3(0, 0, 0);
    } else {
      this._marble.setPosition(this._startX, 1, this._startZ);
    }
    this._soundFall();
  },

  // ── HUD ───────────────────────────────────────────────────────

  _buildHUD(container) {
    container.style.position = 'relative';

    const hud = document.createElement('div');
    hud.style.cssText = [
      'position:absolute;top:16px;left:0;right:0;',
      'display:flex;justify-content:space-between;align-items:center;',
      'padding:0 20px;pointer-events:none;font-family:monospace;',
      'color:#cde;text-shadow:0 1px 4px #000a;z-index:10;',
    ].join('');
    hud.innerHTML = [
      '<div id="mr_time" style="font-size:22px;font-weight:bold;">TIME: 0.0s</div>',
      '<div id="mr_best" style="font-size:14px;opacity:0.7;">BEST: --</div>',
    ].join('');
    container.appendChild(hud);
    this._hud = hud;

    const hint = document.createElement('div');
    hint.style.cssText = [
      'position:absolute;bottom:40px;left:0;right:0;text-align:center;',
      'color:#aac;font-family:monospace;font-size:14px;opacity:0.8;',
      'pointer-events:none;z-index:10;transition:opacity 1s;',
    ].join('');
    hint.textContent = 'Tilt your phone to roll  ·  Reach the gold sphere';
    container.appendChild(hint);
    this._hintEl = hint;
    setTimeout(() => { if (hint) hint.style.opacity = '0'; }, 3000);

    this._hudTimer = setInterval(() => {
      if (!this._won && this._startTime) {
        const el = document.getElementById('mr_time');
        if (el) el.textContent = 'TIME: ' + ((Date.now() - this._startTime) / 1000).toFixed(1) + 's';
      }
    }, 100);
  },

  _showWin(elapsed) {
    if (this._overlay) return;
    const best = this._bestTime;
    const isNew = (best === null || best === undefined || elapsed < best);
    if (isNew) this._bestTime = elapsed;

    // Update best display
    const bestEl = document.getElementById('mr_best');
    if (bestEl && this._bestTime != null) {
      bestEl.textContent = 'BEST: ' + this._bestTime.toFixed(2) + 's';
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:absolute;inset:0;display:flex;flex-direction:column;',
      'align-items:center;justify-content:center;background:rgba(0,0,20,0.78);',
      'color:#ffe;font-family:monospace;z-index:20;text-align:center;',
    ].join('');

    const newBestLine = isNew
      ? '<div style="font-size:14px;color:#7ff;margin-top:6px;">New Best!</div>'
      : '<div style="font-size:14px;color:#aac;margin-top:6px;">Best: ' + this._bestTime.toFixed(2) + 's</div>';

    overlay.innerHTML = [
      '<div style="font-size:48px;margin-bottom:8px;">🎯</div>',
      '<div style="font-size:28px;font-weight:bold;color:#ffd700;">You made it!</div>',
      '<div style="font-size:20px;margin-top:10px;color:#cde;">' + elapsed.toFixed(2) + 's</div>',
      newBestLine,
      '<div style="font-size:13px;margin-top:22px;opacity:0.6;color:#aac;">Restarting…</div>',
    ].join('');

    // Attach to container (canvas parent)
    if (this._canvas && this._canvas.parentElement) {
      this._canvas.parentElement.appendChild(overlay);
    }
    this._overlay = overlay;

    this._restartTimer = setTimeout(() => this._restart(), 2500);
  },

  _restart() {
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    this._won = false;
    this._resetMarble();
    this._startTime = Date.now();
    const el = document.getElementById('mr_time');
    if (el) el.textContent = 'TIME: 0.0s';
  },

  // ── Controls ─────────────────────────────────────────────────

  _setupControls(canvas) {
    const self = this;
    let gyroActive = false;

    const listen = () => {
      self._onDeviceOrientation = (e) => {
        if (e.beta === null || e.gamma === null) return;
        gyroActive = true;
        if (self._orientNeutralBeta === null) {
          self._orientNeutralBeta = e.beta;
          self._orientNeutralGamma = e.gamma;
          return;
        }
        const db = e.beta  - self._orientNeutralBeta;
        const dg = e.gamma - self._orientNeutralGamma;
        self._tiltX = Math.max(-1, Math.min(1, dg / 20));
        self._tiltZ = Math.max(-1, Math.min(1, db / 20));
      };
      window.addEventListener('deviceorientation', self._onDeviceOrientation);
    };

    if (typeof DeviceOrientationEvent !== 'undefined') {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ — request permission on first touch
        canvas.addEventListener('touchstart', function askPerm() {
          canvas.removeEventListener('touchstart', askPerm);
          self._initAudio();
          DeviceOrientationEvent.requestPermission()
            .then(state => { if (state === 'granted') listen(); })
            .catch(() => {});
        }, { passive: true, once: true });
      } else {
        // Android / non-iOS — no permission needed, listen immediately
        listen();
      }
    }

    // Touch drag — fallback if gyro never fires, also recalibrates on tap
    let touchStartX = 0, touchStartY = 0;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      self._initAudio();
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
      // Tap to recalibrate gyro neutral
      self._orientNeutralBeta  = null;
      self._orientNeutralGamma = null;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (gyroActive) return;
      const t = e.changedTouches[0];
      self._tiltX = Math.max(-1, Math.min(1, (t.clientX - touchStartX) / 80));
      self._tiltZ = Math.max(-1, Math.min(1, (t.clientY - touchStartY) / 80));
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!gyroActive) { self._tiltX = 0; self._tiltZ = 0; }
    }, { passive: false });

    // Mouse drag — desktop fallback
    let mouseDown = false, lastMX = 0, lastMY = 0;

    this._onMouseDown = (e) => {
      mouseDown = true;
      lastMX = e.clientX;
      lastMY = e.clientY;
      this._initAudio();
    };

    this._onMouseMove = (e) => {
      if (!mouseDown) return;
      this._tiltX += (e.clientX - lastMX) * 0.02;
      this._tiltZ += (e.clientY - lastMY) * 0.02;
      this._tiltX = Math.max(-1, Math.min(1, this._tiltX));
      this._tiltZ = Math.max(-1, Math.min(1, this._tiltZ));
      lastMX = e.clientX;
      lastMY = e.clientY;
    };

    this._onMouseUp = () => {
      mouseDown = false;
      this._tiltX = 0;
      this._tiltZ = 0;
    };

    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup',   this._onMouseUp);
  },

  // ── Audio ─────────────────────────────────────────────────────

  _initAudio() {
    if (this._actx) return;
    this._actx = new (window.AudioContext || window.webkitAudioContext)();
  },

  _startRollSound() {
    if (!this._actx || this._rollOsc) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 80;
    g.gain.value = 0;
    o.start();
    this._rollOsc = o;
    this._rollGain = g;
  },

  _updateRollSound(speed) {
    if (!this._rollGain || !this._actx) return;
    const vol = Math.min(speed / 6, 1) * 0.15;
    this._rollGain.gain.setTargetAtTime(vol, this._actx.currentTime, 0.1);
    this._rollOsc.frequency.setTargetAtTime(60 + speed * 10, this._actx.currentTime, 0.1);
  },

  _stopRollSound() {
    if (this._rollOsc) {
      try { this._rollOsc.stop(); } catch (e) { /* already stopped */ }
      this._rollOsc = null;
      this._rollGain = null;
    }
  },

  _soundBounce() {
    if (!this._actx) return;
    const now = Date.now();
    if (now - this._lastBounce < 250) return;
    this._lastBounce = now;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(440, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    o.start();
    o.stop(ctx.currentTime + 0.1);
  },

  _soundWin() {
    if (!this._actx) return;
    const ctx = this._actx;
    [523, 659, 784, 1047, 1319].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.1;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t);
      o.stop(t + 0.3);
    });
  },

  _soundFall() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(800, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  },

  // ── Per-frame update ──────────────────────────────────────────

  _update(dt) {
    const d = Math.min(dt, 0.05);

    // Goal pulse
    this._glowPhase += d * 3;
    if (this._glowLight) {
      this._glowLight.light.intensity = 3 + Math.sin(this._glowPhase) * 1.5;
    }

    if (this._won) return;

    const marble = this._marble;
    if (!marble) return;

    const rb = marble.rigidbody;

    if (rb) {
      // ── Real Ammo.js physics path ────────────────────────
      rb.applyForce(new pc.Vec3(this._tiltX * 15, 0, this._tiltZ * 15));

      // Chase camera
      const mp = marble.getPosition();
      if (this._camera) {
        this._camera.setPosition(mp.x, mp.y + 14, mp.z + 2);
        this._camera.lookAt(mp);
      }

      // Rolling sound — from linear velocity magnitude
      const lv = rb.linearVelocity;
      const speed = lv ? Math.sqrt(lv.x * lv.x + lv.y * lv.y + lv.z * lv.z) : 0;
      this._updateRollSound(speed);

      // Win check
      const gp = this._goalEntity ? this._goalEntity.getPosition() : null;
      if (gp) {
        const dx = mp.x - gp.x;
        const dz = mp.z - gp.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.0 && !this._won) {
          this._won = true;
          this._soundWin();
          const elapsed = (Date.now() - this._startTime) / 1000;
          this._showWin(elapsed);
        }
      }

      // Fall off floor check
      if (mp.y < -3 && !this._won) {
        this._resetMarble();
      }

    } else {
      // ── Fallback: manual physics (no Ammo) ───────────────
      // Keep a simple velocity on _mvx / _mvz stored per-frame
      if (this._mvx === undefined) { this._mvx = 0; this._mvz = 0; }

      this._mvx += this._tiltX * 8 * d;
      this._mvz += this._tiltZ * 8 * d;
      this._mvx *= 0.92;
      this._mvz *= 0.92;

      // Current position from visual entity
      const pos = marble.getPosition();
      let nx = pos.x + this._mvx * d;
      let nz = pos.z + this._mvz * d;

      // Basic boundary clamp (outer walls at ±5.8)
      if (nx < -5.8) { nx = -5.8; this._mvx *= -0.4; }
      if (nx >  5.8) { nx =  5.8; this._mvx *= -0.4; }
      if (nz < -5.8) { nz = -5.8; this._mvz *= -0.4; }
      if (nz >  5.8) { nz =  5.8; this._mvz *= -0.4; }

      marble.setPosition(nx, 0.35, nz);

      if (this._camera) {
        this._camera.setPosition(nx, 14, nz + 2);
        this._camera.lookAt(new pc.Vec3(nx, 0, nz));
      }

      const speed = Math.sqrt(this._mvx * this._mvx + this._mvz * this._mvz);
      this._updateRollSound(speed);

      const gp = this._goalEntity ? this._goalEntity.getPosition() : null;
      if (gp) {
        const dx = nx - gp.x;
        const dz = nz - gp.z;
        if (Math.sqrt(dx * dx + dz * dz) < 0.9 && !this._won) {
          this._won = true;
          this._soundWin();
          const elapsed = (Date.now() - this._startTime) / 1000;
          this._showWin(elapsed);
        }
      }
    }
  },

  // ── Destroy ───────────────────────────────────────────────────

  destroy() {
    if (this._restartTimer) { clearTimeout(this._restartTimer);  this._restartTimer = null; }
    if (this._hudTimer)     { clearInterval(this._hudTimer);     this._hudTimer = null; }

    this._stopRollSound();
    if (this._actx) { this._actx.close(); this._actx = null; }

    if (this._onDeviceOrientation) {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
      this._onDeviceOrientation = null;
    }

    if (this._canvas) {
      if (this._onMouseDown) this._canvas.removeEventListener('mousedown', this._onMouseDown);
      if (this._onMouseMove) this._canvas.removeEventListener('mousemove', this._onMouseMove);
      if (this._onMouseUp)   this._canvas.removeEventListener('mouseup',   this._onMouseUp);
    }

    if (this._app)    { this._app.destroy();    this._app = null; }
    if (this._canvas) { this._canvas.remove();  this._canvas = null; }
    if (this._overlay){ this._overlay.remove(); this._overlay = null; }
    if (this._hud)    { this._hud.remove();     this._hud = null; }
    if (this._hintEl) { this._hintEl.remove();  this._hintEl = null; }

    this._marble = null;
    this._goalEntity = null;
    this._glowLight = null;
    this._camera = null;
    this._mvx = 0;
    this._mvz = 0;
  },
};
