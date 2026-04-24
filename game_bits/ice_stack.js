// Ice Stack — PlayCanvas bit
// Tap to drop swinging ice blocks. Stack as high as you can.

window.scrollerApp = {
  meta: {
    title: 'Ice Stack',
    author: 'plethora',
    description: 'Tap to stack ice blocks. How high can you go?',
    tags: ['game'],
  },

  // ── state ──────────────────────────────────────────────────────────────
  _app: null,
  _canvas: null,
  _stack: [],          // { entity, x, width }  (z/depth fixed)
  _swingBlock: null,   // { entity, x, width, dir, speed, thudT }
  _score: 0,
  _gameOver: false,
  _cameraEntity: null,
  _scoreEl: null,
  _overlayEl: null,
  _tapHandler: null,
  _updateOff: null,
  _actx: null,

  // constants
  BLOCK_HEIGHT: 0.4,
  BLOCK_DEPTH: 3.0,
  BASE_WIDTH: 3.0,
  SWING_AMP: 2.2,
  BASE_SPEED: 1.8,

  // ice tints (diffuse colors)
  ICE_COLORS: [
    [0.70, 0.90, 1.00],
    [0.60, 0.85, 0.98],
    [0.75, 0.92, 1.00],
    [0.55, 0.80, 0.95],
    [0.80, 0.93, 1.00],
    [0.65, 0.88, 0.97],
  ],

  // ── init ───────────────────────────────────────────────────────────────
  init(container) {
    const self = this;

    // reset state
    self._stack = [];
    self._swingBlock = null;
    self._score = 0;
    self._gameOver = false;

    function boot() {
      self._setupApp(container);
      self._buildScene();
      self._buildUI(container);
      self._startGame();
      self._app.start();
    }

    function loadPC(cb) {
      if (window.pc) return cb();
      const s = document.createElement('script');
      s.src = 'https://code.playcanvas.com/playcanvas-stable.min.js';
      s.onload = cb;
      s.onerror = () => {
        // show fallback message if CDN fails
        const fb = document.createElement('div');
        fb.style.cssText = 'color:#7cf;font:bold 18px sans-serif;display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:20px;';
        fb.textContent = 'Could not load game engine. Check your connection and retry.';
        container.appendChild(fb);
      };
      document.head.appendChild(s);
    }

    loadPC(boot);
  },

  // ── PlayCanvas app ──────────────────────────────────────────────────────
  _setupApp(container) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    container.appendChild(canvas);
    this._canvas = canvas;

    const app = new pc.Application(canvas, {
      mouse: new pc.Mouse(canvas),
      touch: new pc.TouchDevice(canvas),
      graphicsDeviceOptions: { antialias: true, alpha: false },
    });
    this._app = app;

    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
  },

  // ── scene ───────────────────────────────────────────────────────────────
  _buildScene() {
    const app = this._app;

    // ── camera ──
    const camEnt = new pc.Entity('cam');
    camEnt.addComponent('camera', {
      clearColor: new pc.Color(0.039, 0.102, 0.180),   // #0a1a2e
      fov: 35,
      nearClip: 0.1,
      farClip: 200,
    });
    camEnt.setPosition(0, 8, 16);
    camEnt.lookAt(new pc.Vec3(0, 4, 0));
    app.root.addChild(camEnt);
    this._cameraEntity = camEnt;

    // ── ambient ──
    app.scene.ambientLight = new pc.Color(0.08, 0.14, 0.28);

    // ── directional light ──
    const light = new pc.Entity('sun');
    light.addComponent('light', {
      type: pc.LIGHTTYPE_DIRECTIONAL,
      color: new pc.Color(0.75, 0.88, 1.0),
      intensity: 1.4,
      castShadows: true,
      shadowDistance: 60,
      shadowResolution: 1024,
      shadowBias: 0.05,
      normalOffsetBias: 0.05,
    });
    light.setEulerAngles(45, -30, 0);
    app.root.addChild(light);

    // soft fill from below-left
    const fill = new pc.Entity('fill');
    fill.addComponent('light', {
      type: pc.LIGHTTYPE_DIRECTIONAL,
      color: new pc.Color(0.2, 0.35, 0.6),
      intensity: 0.4,
      castShadows: false,
    });
    fill.setEulerAngles(160, 60, 0);
    app.root.addChild(fill);

    // ── base platform ──
    const baseMat = new pc.StandardMaterial();
    baseMat.diffuse = new pc.Color(0.05, 0.10, 0.22);
    baseMat.metalness = 0.3;
    baseMat.gloss = 0.5;
    baseMat.update();

    const base = new pc.Entity('base');
    base.addComponent('model', { type: 'box', castShadows: false, receiveShadows: true });
    base.model.material = baseMat;
    base.setLocalScale(this.BASE_WIDTH + 2, 0.3, this.BLOCK_DEPTH + 0.5);
    base.setPosition(0, -0.15, 0);
    app.root.addChild(base);
  },

  // ── materials ───────────────────────────────────────────────────────────
  _makeIceMat(colorIndex) {
    const c = this.ICE_COLORS[colorIndex % this.ICE_COLORS.length];
    const mat = new pc.StandardMaterial();
    mat.diffuse   = new pc.Color(c[0], c[1], c[2]);
    mat.emissive  = new pc.Color(c[0] * 0.08, c[1] * 0.12, c[2] * 0.18);
    mat.metalness = 0.0;
    mat.gloss     = 0.95;
    mat.opacity   = 0.88;
    mat.blendType = pc.BLEND_NORMAL;
    mat.depthWrite = true;
    mat.update();
    return mat;
  },

  // ── block helpers ────────────────────────────────────────────────────────
  _topY() {
    // y of the top surface of the highest stacked block
    if (this._stack.length === 0) return 0;
    return this._stack.length * this.BLOCK_HEIGHT;
  },

  _makeBlock(width, x, y, colorIndex) {
    const app = this._app;
    const ent = new pc.Entity('block');
    ent.addComponent('model', { type: 'box', castShadows: true, receiveShadows: true });
    ent.model.material = this._makeIceMat(colorIndex);
    ent.setLocalScale(width, this.BLOCK_HEIGHT, this.BLOCK_DEPTH);
    ent.setPosition(x, y, 0);
    app.root.addChild(ent);
    return ent;
  },

  // ── audio ────────────────────────────────────────────────────────────────
  _initAudio() {
    if (this._actx) return;
    this._actx = new (window.AudioContext || window.webkitAudioContext)();
  },

  _soundThud() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(120, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o.start(); o.stop(ctx.currentTime + 0.2);
  },

  _soundCrack() {
    if (!this._actx) return;
    const ctx = this._actx;
    // noise burst
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    src.connect(filter); filter.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    src.start(); src.stop(ctx.currentTime + 0.1);
  },

  _soundGameOver() {
    if (!this._actx) return;
    const ctx = this._actx;
    // low boom
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);
    g.gain.setValueAtTime(0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.5);
  },

  _soundWhoosh() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(300, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.05, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    o.start(); o.stop(ctx.currentTime + 0.08);
  },

  // ── game start / restart ─────────────────────────────────────────────────
  _startGame() {
    const self = this;
    const app  = this._app;

    // destroy old swing block if any
    if (self._swingBlock) {
      self._swingBlock.entity.destroy();
      self._swingBlock = null;
    }
    // destroy old stack
    for (const b of self._stack) b.entity.destroy();
    self._stack = [];
    self._score = 0;
    self._gameOver = false;

    // first stacked block (the "ground" block)
    const firstEnt = self._makeBlock(self.BASE_WIDTH, 0, self.BLOCK_HEIGHT / 2, 0);
    self._stack.push({ entity: firstEnt, x: 0, width: self.BASE_WIDTH });

    self._updateScore();
    self._hideOverlay();
    self._spawnSwingBlock();

    // camera back to start
    self._cameraEntity.setPosition(0, 8, 16);
    self._cameraEntity.lookAt(new pc.Vec3(0, 4, 0));

    // ── update loop ──
    if (self._updateOff) { app.off('update', self._updateOff); }

    let camTargetY = 8;
    const camLookY = { val: 4 };

    self._updateOff = function(dt) {
      if (self._gameOver) return;

      const sw = self._swingBlock;
      if (!sw) return;

      // swing
      sw.x += sw.dir * sw.speed * dt;
      if (sw.x >  self.SWING_AMP) { sw.x =  self.SWING_AMP; sw.dir = -1; self._soundWhoosh(); }
      if (sw.x < -self.SWING_AMP) { sw.x = -self.SWING_AMP; sw.dir =  1; self._soundWhoosh(); }
      sw.entity.setPosition(sw.x, sw.entity.getPosition().y, 0);

      // thud animation
      if (sw.thudT > 0) {
        sw.thudT -= dt;
        const t = Math.max(0, sw.thudT / 0.1);
        const s = 1.0 + 0.12 * t;
        sw.entity.setLocalScale(sw.width * s, self.BLOCK_HEIGHT * (2 - s), self.BLOCK_DEPTH);
      }

      // camera lerp upward
      const stackTop = self._topY();
      const desiredCamY = 8 + Math.max(0, stackTop - 3) * 0.9;
      const desiredLookY = 4 + Math.max(0, stackTop - 3) * 0.9;
      camTargetY = pc.math.lerp(camTargetY, desiredCamY, dt * 2.5);
      camLookY.val = pc.math.lerp(camLookY.val, desiredLookY, dt * 2.5);

      const cp = self._cameraEntity.getPosition();
      self._cameraEntity.setPosition(cp.x, camTargetY, cp.z);
      self._cameraEntity.lookAt(new pc.Vec3(0, camLookY.val, 0));
    };

    app.on('update', self._updateOff);

    // ── tap handler ──
    if (self._tapHandler) {
      self._canvas.removeEventListener('pointerdown', self._tapHandler);
    }
    let _lastTouch = 0;
    self._tapHandler = function(e) {
      if (Date.now() - _lastTouch < 200) return;
      _lastTouch = Date.now();
      self._initAudio();
      if (self._gameOver) {
        self._startGame();
      } else {
        self._drop();
      }
    };
    self._canvas.addEventListener('pointerdown', self._tapHandler);
  },

  // ── spawn next swing block ───────────────────────────────────────────────
  _spawnSwingBlock() {
    const prevBlock = this._stack[this._stack.length - 1];
    const w = prevBlock.width;
    const y = this._topY() + this.BLOCK_HEIGHT / 2 + 0.5;
    const colorIdx = this._stack.length;

    const ent = this._makeBlock(w, -this.SWING_AMP, y, colorIdx);
    const speed = this.BASE_SPEED + this._score * 0.08;

    this._swingBlock = {
      entity: ent,
      x: -this.SWING_AMP,
      width: w,
      dir: 1,
      speed: Math.min(speed, 5.5),
      thudT: 0,
    };
  },

  // ── drop logic ───────────────────────────────────────────────────────────
  _drop() {
    const sw   = this._swingBlock;
    const prev = this._stack[this._stack.length - 1];
    if (!sw || !prev) return;

    const swLeft   = sw.x   - sw.width   / 2;
    const swRight  = sw.x   + sw.width   / 2;
    const prLeft   = prev.x - prev.width / 2;
    const prRight  = prev.x + prev.width / 2;

    const overlapLeft  = Math.max(swLeft,  prLeft);
    const overlapRight = Math.min(swRight, prRight);
    const overlapW = overlapRight - overlapLeft;

    if (overlapW <= 0.01) {
      // missed — game over
      this._triggerGameOver();
      return;
    }

    // trim to overlap
    const newX     = (overlapLeft + overlapRight) / 2;
    const newWidth = overlapW;
    const newY     = this._topY() + this.BLOCK_HEIGHT / 2;

    // reposition + rescale existing entity
    sw.entity.setPosition(newX, newY, 0);
    sw.entity.setLocalScale(newWidth, this.BLOCK_HEIGHT, this.BLOCK_DEPTH);

    // thud animation
    sw.thudT = 0.10;

    this._soundThud();

    // if a chunk was cut off, flash a brief ghost shard
    const cutW = sw.width - newWidth;
    if (cutW > 0.05) {
      this._soundCrack();
      this._showCutShard(sw, newX, newWidth, newY, cutW, overlapLeft, overlapRight, swLeft, swRight);
    }

    this._stack.push({ entity: sw.entity, x: newX, width: newWidth });
    this._swingBlock = null;

    this._score++;
    this._updateScore();

    // next swing block
    this._spawnSwingBlock();
  },

  // brief emissive flash for the cut-off piece
  _showCutShard(sw, newX, newWidth, newY, cutW, overlapLeft, overlapRight, swLeft, swRight) {
    const app = this._app;
    const shardMat = new pc.StandardMaterial();
    shardMat.emissive = new pc.Color(0.6, 0.88, 1.0);
    shardMat.diffuse  = new pc.Color(0.6, 0.88, 1.0);
    shardMat.opacity  = 0.7;
    shardMat.blendType = pc.BLEND_NORMAL;
    shardMat.update();

    // shard is the part that didn't overlap
    const shardX = (swLeft < overlapLeft)
      ? swLeft + cutW / 2
      : swRight - cutW / 2;

    const shard = new pc.Entity('shard');
    shard.addComponent('model', { type: 'box' });
    shard.model.material = shardMat;
    shard.setLocalScale(cutW, this.BLOCK_HEIGHT, this.BLOCK_DEPTH);
    shard.setPosition(shardX, newY, 0);
    app.root.addChild(shard);

    // fade out over 0.4s
    let t = 0;
    const fade = (dt) => {
      t += dt;
      const progress = t / 0.4;
      if (progress >= 1) {
        shard.destroy();
        app.off('update', fade);
        return;
      }
      shardMat.opacity = 0.7 * (1 - progress);
      const dropY = newY - progress * 1.5;
      shard.setPosition(shardX, dropY, 0);
      shardMat.update();
    };
    app.on('update', fade);
  },

  // ── game over ─────────────────────────────────────────────────────────────
  _triggerGameOver() {
    this._gameOver = true;
    this._soundGameOver();

    // let swing block fall a bit then remove
    const sw = this._swingBlock;
    if (sw) {
      const app = this._app;
      let t = 0;
      const startY = sw.entity.getPosition().y;
      const drop = (dt) => {
        t += dt;
        sw.entity.setPosition(sw.x, startY - t * t * 5, 0);
        if (t > 0.8) {
          sw.entity.destroy();
          app.off('update', drop);
        }
      };
      app.on('update', drop);
      this._swingBlock = null;
    }

    this._showOverlay();
  },

  // ── UI ───────────────────────────────────────────────────────────────────
  _buildUI(container) {
    // score
    const scoreEl = document.createElement('div');
    scoreEl.style.cssText = [
      'position:absolute',
      'top:20px',
      'left:0',
      'right:0',
      'text-align:center',
      'color:#d0f0ff',
      'font:bold 22px/1 "Arial",sans-serif',
      'letter-spacing:2px',
      'text-shadow:0 0 12px #4af,0 2px 4px #000a',
      'pointer-events:none',
      'z-index:10',
    ].join(';');
    scoreEl.textContent = 'HEIGHT: 0';
    container.style.position = 'relative';
    container.appendChild(scoreEl);
    this._scoreEl = scoreEl;

    // overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:absolute',
      'top:0;left:0;right:0;bottom:0',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'background:rgba(5,15,35,0.82)',
      'color:#c8eeff',
      'font-family:"Arial",sans-serif',
      'pointer-events:none',
      'z-index:20',
      'opacity:0',
      'transition:opacity 0.3s',
    ].join(';');
    overlay.innerHTML = `
      <div style="font-size:28px;font-weight:bold;text-shadow:0 0 20px #4af;margin-bottom:12px;">TOWER COLLAPSED!</div>
      <div id="ice-final-score" style="font-size:20px;margin-bottom:18px;color:#7df;">HEIGHT: 0</div>
      <div style="font-size:15px;color:#89c;letter-spacing:1px;">Tap to restart</div>
    `;
    overlay.addEventListener('pointerdown', () => {
      if (this._gameOver) this._startGame();
    });
    container.appendChild(overlay);
    this._overlayEl = overlay;
  },

  _updateScore() {
    if (this._scoreEl) {
      this._scoreEl.textContent = 'HEIGHT: ' + this._score;
    }
  },

  _showOverlay() {
    if (!this._overlayEl) return;
    const fs = this._overlayEl.querySelector('#ice-final-score');
    if (fs) fs.textContent = 'HEIGHT: ' + this._score;
    this._overlayEl.style.opacity = '1';
    this._overlayEl.style.pointerEvents = 'auto';
  },

  _hideOverlay() {
    if (!this._overlayEl) return;
    this._overlayEl.style.opacity = '0';
    this._overlayEl.style.pointerEvents = 'none';
  },

  // ── destroy ───────────────────────────────────────────────────────────────
  destroy() {
    if (this._tapHandler && this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._tapHandler);
      this._tapHandler = null;
    }
    if (this._app) {
      if (this._updateOff) {
        this._app.off('update', this._updateOff);
        this._updateOff = null;
      }
      this._app.destroy();
      this._app = null;
    }
    if (this._canvas) {
      this._canvas.remove();
      this._canvas = null;
    }
    if (this._scoreEl) {
      this._scoreEl.remove();
      this._scoreEl = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
    this._stack = [];
    this._swingBlock = null;
    if (this._actx) { this._actx.close(); this._actx = null; }
  },
};
