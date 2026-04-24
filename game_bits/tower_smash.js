// Tower Smash — PlayCanvas + Ammo.js real physics
// Tap to launch cannonballs and topple a tower of blocks.

window.scrollerApp = {
  meta: {
    title: 'Tower Smash',
    author: 'plethora',
    description: 'Launch cannonballs. Destroy the tower. Score big.',
    tags: ['game'],
  },

  _app: null,
  _canvas: null,
  _scoreEl: null,
  _msgEl: null,
  _aimEl: null,
  _blocks: [],
  _ball: null,
  _score: 0,
  _totalBlocks: 0,
  _ballInFlight: false,
  _ballTimer: null,
  _rebuildTimer: null,
  _updateHandler: null,
  _destroyed: false,
  _actx: null,
  _lastScoreSound: 0,
  _aimHideTimer: null,
  _unbindInput: null,
  _scored: null,

  init(container) {
    this._destroyed = false;
    this._score = 0;
    this._ballInFlight = false;
    this._blocks = [];
    this._ball = null;
    this._rebuildTimer = null;
    this._ballTimer = null;
    this._scored = new Set();

    // HUD — score
    this._scoreEl = document.createElement('div');
    this._scoreEl.style.cssText = `
      position:absolute; top:18px; left:0; right:0;
      text-align:center; color:#fff; font-size:28px;
      font-weight:900; font-family:sans-serif;
      text-shadow:0 2px 8px #000, 0 0 20px #f80;
      pointer-events:none; z-index:10;
    `;
    this._scoreEl.textContent = 'SCORE: 0';
    container.style.position = 'relative';
    container.appendChild(this._scoreEl);

    // HUD — smashed message
    this._msgEl = document.createElement('div');
    this._msgEl.style.cssText = `
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      color:#fff; font-size:42px; font-weight:900; font-family:sans-serif;
      text-shadow:0 0 30px #f80, 0 0 60px #f80;
      pointer-events:none; z-index:10; opacity:0;
      transition:opacity 0.3s;
    `;
    this._msgEl.textContent = 'SMASHED! 🎯';
    container.appendChild(this._msgEl);

    // Aim ring
    this._aimEl = document.createElement('div');
    this._aimEl.style.cssText = `
      position:absolute; width:32px; height:32px; border-radius:50%;
      border:3px solid rgba(255,160,0,0.85);
      box-shadow:0 0 12px #f80;
      pointer-events:none; z-index:10; display:none;
      transform:translate(-50%,-50%);
    `;
    container.appendChild(this._aimEl);

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    container.appendChild(canvas);
    this._canvas = canvas;

    this._loadPC(() => this._loadAmmo(() => this._startGame(container)));
  },

  _loadPC(cb) {
    if (window.pc) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://code.playcanvas.com/playcanvas-stable.min.js';
    s.onload = cb;
    s.onerror = () => console.error('Tower Smash: failed to load PlayCanvas');
    document.head.appendChild(s);
  },

  _loadAmmo(cb) {
    if (window.Ammo) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/ammo.js@0.0.10/ammo.js';
    s.onload = cb;
    s.onerror = () => cb();
    document.head.appendChild(s);
  },

  _startGame(container) {
    if (this._destroyed) return;

    const canvas = this._canvas;
    const app = new pc.Application(canvas, {
      mouse: new pc.Mouse(canvas),
      touch: new pc.TouchDevice(canvas),
      graphicsDeviceOptions: { antialias: true },
    });
    this._app = app;

    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Gravity
    if (app.systems && app.systems.rigidbody) {
      app.systems.rigidbody.gravity.set(0, -15, 0);
    }

    // Camera at (0, 5, 12) looking at (0, 3, 0)
    const cameraEnt = new pc.Entity('camera');
    cameraEnt.addComponent('camera', {
      clearColor: new pc.Color(0.02, 0.02, 0.06),
      fov: 45,
      nearClip: 0.1,
      farClip: 200,
    });
    cameraEnt.setPosition(0, 5, 12);
    cameraEnt.lookAt(new pc.Vec3(0, 3, 0));
    app.root.addChild(cameraEnt);

    // Directional light
    const dirLight = new pc.Entity('dirLight');
    dirLight.addComponent('light', {
      type: pc.LIGHTTYPE_DIRECTIONAL,
      color: new pc.Color(1, 0.92, 0.8),
      intensity: 1.2,
      castShadows: true,
      shadowDistance: 30,
      shadowResolution: 1024,
    });
    dirLight.setEulerAngles(40, -30, 0);
    app.root.addChild(dirLight);

    // Accent point light
    const ptLight = new pc.Entity('ptLight');
    ptLight.addComponent('light', {
      type: pc.LIGHTTYPE_POINT,
      color: new pc.Color(1, 0.5, 0.1),
      intensity: 0.5,
      range: 8,
    });
    ptLight.setPosition(2, 1, 3);
    app.root.addChild(ptLight);

    // Ground (static physics)
    const ground = new pc.Entity('ground');
    ground.addComponent('model', { type: 'plane' });
    const groundMat = new pc.StandardMaterial();
    groundMat.diffuse = new pc.Color(0.12, 0.12, 0.18);
    groundMat.shininess = 10;
    groundMat.update();
    ground.model.material = groundMat;
    ground.setLocalScale(40, 1, 40);
    ground.setPosition(0, 0, 0);
    app.root.addChild(ground);
    ground.addComponent('rigidbody', { type: pc.BODYTYPE_STATIC });
    ground.addComponent('collision', {
      type: 'box',
      halfExtents: new pc.Vec3(20, 0.1, 20),
    });

    this._bindInput(container);
    this._updateHandler = () => this._onUpdate();
    app.on('update', this._updateHandler);
    app.start();

    // Wait one tick for PlayCanvas's Ammo.then(ready) to fire before adding physics entities
    setTimeout(() => {
      if (this._destroyed) return;
      this._buildTower();
      this._createBallEntity();
    }, 0);
  },

  // ── Block colors ─────────────────────────────────────────────────────────

  _blockColors: [
    [1, 0.2, 0.2],
    [1, 0.5, 0.05],
    [1, 0.9, 0.05],
    [0.2, 0.9, 0.3],
    [0.1, 0.9, 1.0],
    [0.9, 0.2, 1.0],
    [0.3, 0.4, 1.0],
    [1, 0.3, 0.6],
  ],

  // ── Tower ────────────────────────────────────────────────────────────────

  _buildTower() {
    const app = this._app;
    this._blocks = [];
    this._scored = new Set();

    const cols = 4;
    const levels = 5;
    let colorIdx = 0;

    for (let level = 0; level < levels; level++) {
      for (let c = 0; c < cols; c++) {
        const block = new pc.Entity('block_' + this._blocks.length);
        block.addComponent('model', { type: 'box' });

        const mat = new pc.StandardMaterial();
        const col = this._blockColors[colorIdx % this._blockColors.length];
        mat.diffuse = new pc.Color(col[0], col[1], col[2]);
        mat.shininess = 60;
        mat.metalness = 0.2;
        mat.update();
        block.model.material = mat;
        colorIdx++;

        const x = (c - (cols - 1) / 2) * 1.05;
        const y = 0.25 + level * 0.52;
        const z = 0;

        block.setLocalScale(1, 0.5, 1);
        block.setPosition(x, y, z);

        app.root.addChild(block);
        block.addComponent('rigidbody', {
          type: pc.BODYTYPE_DYNAMIC,
          mass: 1,
          friction: 0.5,
          restitution: 0.3,
          linearDamping: 0.1,
          angularDamping: 0.1,
        });
        block.addComponent('collision', {
          type: 'box',
          halfExtents: new pc.Vec3(0.5, 0.25, 0.5),
        });
        this._blocks.push(block);
      }
    }

    this._totalBlocks = this._blocks.length;
    this._score = 0;
    this._updateScoreUI();
  },

  _clearBlocks() {
    for (const block of this._blocks) {
      if (block && block.parent) block.destroy();
    }
    this._blocks = [];
    this._scored = new Set();
  },

  // ── Cannonball ───────────────────────────────────────────────────────────

  _createBallEntity() {
    const app = this._app;
    if (!app) return;

    const ball = new pc.Entity('ball');
    ball.addComponent('model', { type: 'sphere' });

    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(0.2, 0.2, 0.2);
    mat.emissive = new pc.Color(0.4, 0.22, 0.0);
    mat.metalness = 0.9;
    mat.shininess = 90;
    mat.update();
    ball.model.material = mat;
    ball.setLocalScale(0.8, 0.8, 0.8);
    ball.enabled = false;
    app.root.addChild(ball);
    ball.addComponent('rigidbody', {
      type: pc.BODYTYPE_DYNAMIC,
      mass: 5,
      restitution: 0.2,
      friction: 0.4,
      linearDamping: 0.0,
      angularDamping: 0.0,
    });
    ball.addComponent('collision', {
      type: 'sphere',
      radius: 0.4,
    });
    this._ball = ball;
  },

  _launchBall(tapX, container) {
    if (!this._ball || !this._app) return;
    if (this._ballInFlight) return;

    const normX = (tapX / container.clientWidth) * 2 - 1; // -1..1
    const aimX = normX * 2;

    // Re-enable and reposition
    this._ball.enabled = true;
    this._ball.setPosition(aimX, 3, 9);

    // Zero out any residual velocity via rigidbody teleport
    if (this._ball.rigidbody) {
      this._ball.rigidbody.teleport(new pc.Vec3(aimX, 3, 9));
      this._ball.rigidbody.linearVelocity = pc.Vec3.ZERO;
      this._ball.rigidbody.angularVelocity = pc.Vec3.ZERO;
      this._ball.rigidbody.applyImpulse(new pc.Vec3(aimX * 0.3, 0, -25));
    }

    this._ballInFlight = true;
    this._initAudio();
    this._soundCannon();

    // Impact sound 300ms after launch
    setTimeout(() => {
      if (!this._destroyed) this._soundImpact();
    }, 300);

    // Disable ball after 3s
    clearTimeout(this._ballTimer);
    this._ballTimer = setTimeout(() => {
      if (this._destroyed) return;
      if (this._ball) this._ball.enabled = false;
      this._ballInFlight = false;
    }, 3000);
  },

  // ── Input ────────────────────────────────────────────────────────────────

  _bindInput(container) {
    const self = this;

    const onTap = (clientX, clientY) => {
      if (self._destroyed) return;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      self._showAim(x, y);
      self._initAudio();
      self._launchBall(x, container);
    };

    let lastTouch = 0;

    const onTouch = (e) => {
      e.preventDefault();
      lastTouch = Date.now();
      const t = e.changedTouches[0];
      onTap(t.clientX, t.clientY);
    };

    const onClick = (e) => {
      if (Date.now() - lastTouch < 500) return;
      onTap(e.clientX, e.clientY);
    };

    container.addEventListener('touchstart', onTouch, { passive: false });
    container.addEventListener('click', onClick);

    this._unbindInput = () => {
      container.removeEventListener('touchstart', onTouch);
      container.removeEventListener('click', onClick);
    };
  },

  _showAim(x, y) {
    const el = this._aimEl;
    el.style.display = 'block';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    clearTimeout(this._aimHideTimer);
    this._aimHideTimer = setTimeout(() => { el.style.display = 'none'; }, 800);
  },

  // ── Update loop ──────────────────────────────────────────────────────────

  _onUpdate() {
    if (this._destroyed) return;
    this._checkBlocks();
    this._checkWin();
  },

  _checkBlocks() {
    for (let i = 0; i < this._blocks.length; i++) {
      const block = this._blocks[i];
      if (!block || !block.enabled) continue;
      if (this._scored.has(i)) continue;
      if (block.getPosition().y < -1) {
        this._scored.add(i);
        this._score++;
        this._updateScoreUI();
        const now = Date.now();
        if (now - this._lastScoreSound > 100) {
          this._lastScoreSound = now;
          this._soundScore();
        }
      }
    }
  },

  _checkWin() {
    if (this._rebuildTimer) return;
    if (this._totalBlocks === 0) return;
    if (this._scored.size === this._totalBlocks) {
      this._showSmashed();
    }
  },

  // ── UI helpers ───────────────────────────────────────────────────────────

  _updateScoreUI() {
    if (this._scoreEl) {
      this._scoreEl.textContent = 'SCORE: ' + this._score;
    }
  },

  _showSmashed() {
    if (this._msgEl) this._msgEl.style.opacity = '1';
    this._soundVictory();
    this._rebuildTimer = setTimeout(() => {
      if (this._destroyed) return;
      if (this._msgEl) this._msgEl.style.opacity = '0';
      this._clearBlocks();
      this._buildTower();
      this._rebuildTimer = null;
    }, 2500);
  },

  // ── Audio ────────────────────────────────────────────────────────────────

  _initAudio() {
    if (this._actx) return;
    try {
      this._actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { /* silent fallback */ }
  },

  _soundCannon() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(100, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.25);
    g.gain.setValueAtTime(0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(); o.stop(ctx.currentTime + 0.3);
    // Noise layer
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const ng = ctx.createGain(); ng.gain.value = 0.3;
    src.connect(ng); ng.connect(ctx.destination);
    src.start(); src.stop(ctx.currentTime + 0.1);
  },

  _soundImpact() {
    if (!this._actx) return;
    const ctx = this._actx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 0.8) * 0.8;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 800;
    const g = ctx.createGain(); g.gain.value = 0.6;
    src.connect(filter); filter.connect(g); g.connect(ctx.destination);
    src.start(); src.stop(ctx.currentTime + 0.25);
  },

  _soundScore() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    o.start(); o.stop(ctx.currentTime + 0.1);
  },

  _soundVictory() {
    if (!this._actx) return;
    const ctx = this._actx;
    [392, 523, 659, 784].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'square';
      const t = ctx.currentTime + i * 0.12;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.start(t); o.stop(t + 0.25);
    });
  },

  // ── Lifecycle ────────────────────────────────────────────────────────────

  destroy() {
    this._destroyed = true;

    clearTimeout(this._rebuildTimer);
    clearTimeout(this._aimHideTimer);
    clearTimeout(this._ballTimer);
    this._rebuildTimer = null;
    this._ballTimer = null;

    if (this._unbindInput) {
      this._unbindInput();
      this._unbindInput = null;
    }

    if (this._app) { this._app.destroy(); this._app = null; }
    if (this._canvas) { this._canvas.remove(); this._canvas = null; }
    this._scoreEl?.remove(); this._msgEl?.remove(); this._aimEl?.remove();
    this._scoreEl = null; this._msgEl = null; this._aimEl = null;

    this._blocks = [];
    this._ball = null;
    this._scored = null;

    if (this._actx) { this._actx.close(); this._actx = null; }
  },
};
