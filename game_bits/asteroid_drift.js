// Asteroid Drift — 30s survival shooter
// PlayCanvas engine, no physics library, manual movement math

window.scrollerApp = {
  meta: {
    title: 'Asteroid Drift',
    author: 'plethora',
    description: '30 seconds. Shoot everything. Survive.',
    tags: ['game'],
  },

  _app: null,
  _canvas: null,
  _hud: null,
  _actx: null,
  _engineHum: null,

  init(container) {
    const self = this;

    function loadPC(cb) {
      if (window.pc) return cb();
      const s = document.createElement('script');
      s.src = 'https://code.playcanvas.com/playcanvas-stable.min.js';
      s.onload = cb;
      document.head.appendChild(s);
    }

    loadPC(() => self._start(container));
  },

  _start(container) {
    const self = this;

    // ── Canvas ──────────────────────────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
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

    // ── HUD ─────────────────────────────────────────────────────────────────
    const hud = document.createElement('div');
    hud.style.cssText = [
      'position:absolute;top:0;left:0;width:100%;height:100%;',
      'pointer-events:none;font-family:monospace;',
    ].join('');
    container.style.position = 'relative';
    container.appendChild(hud);
    this._hud = hud;

    const scoreEl = document.createElement('div');
    scoreEl.style.cssText = 'position:absolute;top:16px;left:16px;color:#0ff;font-size:20px;font-weight:bold;text-shadow:0 0 8px #0ff;';
    scoreEl.textContent = 'SCORE: 0';
    hud.appendChild(scoreEl);

    const timerEl = document.createElement('div');
    timerEl.style.cssText = 'position:absolute;top:16px;right:16px;color:#fff;font-size:20px;font-weight:bold;text-shadow:0 0 6px #888;';
    timerEl.textContent = '0:30';
    hud.appendChild(timerEl);

    const livesEl = document.createElement('div');
    livesEl.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);font-size:22px;';
    livesEl.textContent = '♥ ♥ ♥';
    hud.appendChild(livesEl);

    const flashEl = document.createElement('div');
    flashEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:red;opacity:0;pointer-events:none;transition:opacity 0.5s ease-out;';
    hud.appendChild(flashEl);

    const overlayEl = document.createElement('div');
    overlayEl.style.cssText = [
      'position:absolute;top:0;left:0;width:100%;height:100%;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'color:#fff;font-size:28px;font-weight:bold;text-align:center;',
      'background:rgba(0,0,0,0.75);pointer-events:auto;display:none;',
    ].join('');
    hud.appendChild(overlayEl);

    // ── Game state ──────────────────────────────────────────────────────────
    let score     = 0;
    let lives     = 3;
    let timeLeft  = 30;
    let gameOver  = false;
    let spawnTimer = 0;
    const SPAWN_INTERVAL = 1.5;

    // Camera shake state
    let shakeTime   = 0;
    let shakeIntens = 0;
    const camBasePos = new pc.Vec3(0, 0, 15);

    // ── Camera ──────────────────────────────────────────────────────────────
    const cameraEntity = new pc.Entity('camera');
    cameraEntity.addComponent('camera', {
      clearColor: new pc.Color(0, 0, 0.02),
      fov: 60,
      nearClip: 0.1,
      farClip: 200,
    });
    cameraEntity.setPosition(camBasePos.x, camBasePos.y, camBasePos.z);
    cameraEntity.lookAt(new pc.Vec3(0, 0, 0));
    app.root.addChild(cameraEntity);

    // Ambient light
    const ambient = new pc.Entity('ambient');
    ambient.addComponent('light', {
      type: pc.LIGHTTYPE_DIRECTIONAL,
      color: new pc.Color(0.3, 0.3, 0.5),
      intensity: 0.6,
    });
    ambient.setEulerAngles(45, 30, 0);
    app.root.addChild(ambient);

    // ── Background stars ────────────────────────────────────────────────────
    const stars = [];
    function randRange(a, b) { return a + Math.random() * (b - a); }

    for (let i = 0; i < 150; i++) {
      const star = new pc.Entity('star');
      star.addComponent('model', { type: 'sphere' });
      const r = randRange(0.02, 0.05);
      star.setLocalScale(r, r, r);

      const mat = new pc.StandardMaterial();
      mat.emissive = new pc.Color(1, 1, 1);
      mat.emissiveIntensity = 2;
      mat.update();
      star.model.material = mat;

      const sx = randRange(-25, 25);
      const sy = randRange(-15, 15);
      const sz = randRange(-50, -20);
      star.setPosition(sx, sy, sz);
      app.root.addChild(star);
      stars.push({ entity: star, baseX: sx, baseY: sy });
    }

    // ── Player ship ─────────────────────────────────────────────────────────
    const ship = new pc.Entity('ship');
    ship.addComponent('model', { type: 'box' });
    ship.setLocalScale(0.8, 0.3, 0.3);
    ship.setPosition(0, 0, 5);

    const shipMat = new pc.StandardMaterial();
    shipMat.diffuse    = new pc.Color(0.15, 0.15, 0.2);
    shipMat.metalness  = 0.9;
    shipMat.gloss      = 0.6;
    shipMat.emissive   = new pc.Color(0.0, 0.2, 0.5);
    shipMat.update();
    ship.model.material = shipMat;
    app.root.addChild(ship);

    // Engine glow light
    const engineGlow = new pc.Entity('engineGlow');
    engineGlow.addComponent('light', {
      type: pc.LIGHTTYPE_POINT,
      color: new pc.Color(0.2, 0.5, 1),
      intensity: 2,
      range: 4,
    });
    engineGlow.setPosition(0, 0, 5.3);
    app.root.addChild(engineGlow);

    // ── Asteroid materials ──────────────────────────────────────────────────
    function makeAsteroidMat() {
      const m = new pc.StandardMaterial();
      m.diffuse  = new pc.Color(randRange(0.3, 0.5), randRange(0.25, 0.35), randRange(0.2, 0.3));
      m.metalness = 0.1;
      m.gloss     = 0.1;
      m.update();
      return m;
    }

    // ── Asteroid pool ───────────────────────────────────────────────────────
    const POOL_SIZE   = 15;
    const ASTEROID_R  = 0.8;
    const asteroidPool = [];
    const activeAsteroids = [];

    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new pc.Entity('asteroid_' + i);
      a.addComponent('model', { type: 'sphere' });
      const s = randRange(0.6, 1.2);
      a.setLocalScale(s, s, s);
      a.model.material = makeAsteroidMat();
      a.enabled = false;
      app.root.addChild(a);
      asteroidPool.push(a);
    }

    function spawnAsteroid() {
      const a = asteroidPool.pop();
      if (!a) return;

      const s = randRange(0.6, 1.2);
      a.setLocalScale(s, s, s);
      a.model.material = makeAsteroidMat();
      a.setPosition(randRange(-8, 8), randRange(-5, 5), -20);
      a.enabled = true;

      a._speed = randRange(3, 6);
      a._rot   = new pc.Vec3(randRange(-40, 40), randRange(-40, 40), randRange(-40, 40));
      a._radius = ASTEROID_R * s;
      a._dying = false;
      a._dyingT = 0;

      activeAsteroids.push(a);
    }

    function despawnAsteroid(a, idx) {
      a.enabled = false;
      if (idx !== undefined) activeAsteroids.splice(idx, 1);
      asteroidPool.push(a);
    }

    // ── Bolt pool ───────────────────────────────────────────────────────────
    const BOLT_POOL_SIZE = 20;
    const boltPool   = [];
    const activeBolts = [];

    for (let i = 0; i < BOLT_POOL_SIZE; i++) {
      const b = new pc.Entity('bolt_' + i);
      b.addComponent('model', { type: 'sphere' });
      b.setLocalScale(0.15, 0.15, 0.15);

      const bm = new pc.StandardMaterial();
      bm.emissive = new pc.Color(0, 1, 1);
      bm.emissiveIntensity = 3;
      bm.update();
      b.model.material = bm;

      const bl = new pc.Entity('boltLight_' + i);
      bl.addComponent('light', {
        type: pc.LIGHTTYPE_POINT,
        color: new pc.Color(0, 1, 1),
        intensity: 1.5,
        range: 3,
      });
      b.addChild(bl);

      b.enabled = false;
      app.root.addChild(b);
      boltPool.push(b);
    }

    function fireBolt(px, py, pz, dx, dy, dz) {
      const b = boltPool.pop();
      if (!b) return;
      b.setPosition(px, py, pz);
      b.enabled = true;
      b._dir  = new pc.Vec3(dx, dy, dz).normalize();
      b._life = 0;
      activeBolts.push(b);
    }

    function despawnBolt(b, idx) {
      b.enabled = false;
      if (idx !== undefined) activeBolts.splice(idx, 1);
      boltPool.push(b);
    }

    // ── Explosion flash ─────────────────────────────────────────────────────
    const explosions = []; // {entity, t, maxT}

    function explode(pos) {
      const e = new pc.Entity('exp');
      e.addComponent('light', {
        type: pc.LIGHTTYPE_POINT,
        color: new pc.Color(1, 0.6, 0.1),
        intensity: 5,
        range: 8,
      });
      e.setPosition(pos.x, pos.y, pos.z);
      app.root.addChild(e);
      explosions.push({ entity: e, t: 0, maxT: 0.3 });

      // Camera shake
      shakeIntens = 0.15;
      shakeTime   = 0.3;
    }

    // ── Input ────────────────────────────────────────────────────────────────
    let lastTouch = 0;

    function onFire(screenX, screenY) {
      if (gameOver) {
        restartGame();
        return;
      }

      self._initAudio();
      self._startEngineHum();

      const shipPos = ship.getPosition();
      // Ray from camera through tap point
      const near = new pc.Vec3();
      const far  = new pc.Vec3();
      cameraEntity.camera.screenToWorld(screenX, screenY, 0.1, near);
      cameraEntity.camera.screenToWorld(screenX, screenY, 50,  far);

      const dir = new pc.Vec3().sub2(far, near).normalize();

      fireBolt(shipPos.x, shipPos.y, shipPos.z, dir.x, dir.y, dir.z);
      self._soundShoot();
    }

    // Mouse
    app.mouse.on(pc.EVENT_MOUSEDOWN, (e) => {
      onFire(e.x, e.y);
    });

    // Touch — use changedTouches, prevent double-fire
    app.touch.on(pc.EVENT_TOUCHSTART, (e) => {
      lastTouch = Date.now();
      const t = e.changedTouches[0];
      onFire(t.x, t.y);
    });

    // ── HUD helpers ─────────────────────────────────────────────────────────
    function updateLivesEl() {
      livesEl.textContent = '♥ '.repeat(Math.max(0, lives)).trim() || '☠';
      livesEl.style.color = lives > 1 ? '#f55' : '#f00';
    }

    function flashRed() {
      flashEl.style.transition = 'none';
      flashEl.style.opacity = '0.55';
      requestAnimationFrame(() => {
        flashEl.style.transition = 'opacity 0.5s ease-out';
        flashEl.style.opacity = '0';
      });
    }

    function showGameOver() {
      overlayEl.style.display = 'flex';
      overlayEl.innerHTML = `
        <div style="font-size:36px;color:#f66;text-shadow:0 0 20px #f00;margin-bottom:12px;">GAME OVER</div>
        <div style="font-size:24px;color:#fff;margin-bottom:24px;">Score: ${score}</div>
        <div style="font-size:18px;color:#aaa;">Tap to restart</div>
      `;
      overlayEl.style.pointerEvents = 'auto';
    }

    function restartGame() {
      // Reset state
      score     = 0;
      lives     = 3;
      timeLeft  = 30;
      gameOver  = false;
      spawnTimer = 0;
      shakeTime  = 0;
      self._stopEngineHum();

      // Clear active asteroids
      for (let i = activeAsteroids.length - 1; i >= 0; i--) {
        despawnAsteroid(activeAsteroids[i], i);
      }
      // Clear active bolts
      for (let i = activeBolts.length - 1; i >= 0; i--) {
        despawnBolt(activeBolts[i], i);
      }
      // Clear explosions
      for (const ex of explosions) {
        ex.entity.destroy();
      }
      explosions.length = 0;

      scoreEl.textContent = 'SCORE: 0';
      timerEl.textContent = '0:30';
      updateLivesEl();
      overlayEl.style.display = 'none';
      overlayEl.style.pointerEvents = 'none';
    }

    updateLivesEl();

    // ── Main update ──────────────────────────────────────────────────────────
    app.on('update', (dt) => {
      if (gameOver) return;

      // Timer
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        gameOver = true;
        self._stopEngineHum();
        self._soundGameOver();
        showGameOver();
        return;
      }
      const secs = Math.ceil(timeLeft);
      timerEl.textContent = '0:' + (secs < 10 ? '0' + secs : secs);

      // Stars scroll toward camera
      for (const star of stars) {
        const p = star.entity.getLocalPosition();
        p.z += 2 * dt;
        if (p.z > 15) {
          p.z = -50;
          p.x = randRange(-25, 25);
          p.y = randRange(-15, 15);
        }
        star.entity.setLocalPosition(p.x, p.y, p.z);
      }

      // Camera shake
      if (shakeTime > 0) {
        shakeTime -= dt;
        const frac = shakeTime / 0.3;
        const ox = (Math.random() * 2 - 1) * shakeIntens * frac;
        const oy = (Math.random() * 2 - 1) * shakeIntens * frac;
        cameraEntity.setPosition(camBasePos.x + ox, camBasePos.y + oy, camBasePos.z);
      } else {
        cameraEntity.setPosition(camBasePos.x, camBasePos.y, camBasePos.z);
      }

      // Spawn asteroids
      spawnTimer += dt;
      if (spawnTimer >= SPAWN_INTERVAL) {
        spawnTimer = 0;
        spawnAsteroid();
      }

      // Move & rotate asteroids
      const toDestroyAsteroids = [];
      for (let i = activeAsteroids.length - 1; i >= 0; i--) {
        const a = activeAsteroids[i];
        if (!a.enabled) continue;

        if (a._dying) {
          a._dyingT += dt;
          const frac = a._dyingT / 0.1;
          const s0   = a.getLocalScale().x;
          const ns   = s0 + (1.5 - 1) * frac * 0.3;
          a.setLocalScale(ns, ns, ns);
          if (a._dyingT >= 0.1) {
            toDestroyAsteroids.push(i);
          }
          continue;
        }

        const p = a.getPosition();
        p.z += a._speed * dt;
        a.setPosition(p.x, p.y, p.z);
        a.rotate(a._rot.x * dt, a._rot.y * dt, a._rot.z * dt);

        // Passed ship
        if (p.z > 8) {
          toDestroyAsteroids.push(i);
          lives--;
          updateLivesEl();
          flashRed();
          if (lives <= 0) {
            gameOver = true;
            self._stopEngineHum();
            self._soundGameOver();
            // remove remaining then show
            for (const idx of toDestroyAsteroids) {
              despawnAsteroid(activeAsteroids[idx], idx);
            }
            showGameOver();
            return;
          }
          self._soundLifeLost();
        }
      }
      // Clean up passed/dying asteroids (descending order, already reversed)
      for (const idx of toDestroyAsteroids) {
        despawnAsteroid(activeAsteroids[idx], idx);
      }

      // Move bolts & check collisions
      const toDestroyBolts = [];
      const toDestroyAsteroidsFromHit = [];

      for (let bi = activeBolts.length - 1; bi >= 0; bi--) {
        const b = activeBolts[bi];
        if (!b.enabled) continue;

        b._life += dt;
        const SPEED = 20;
        b.translate(
          b._dir.x * SPEED * dt,
          b._dir.y * SPEED * dt,
          b._dir.z * SPEED * dt,
        );

        const bp = b.getPosition();

        // Despawn out-of-range
        if (b._life > 2 || bp.z < -30) {
          toDestroyBolts.push(bi);
          continue;
        }

        // Collision with asteroids
        let hit = false;
        for (let ai = activeAsteroids.length - 1; ai >= 0; ai--) {
          const a = activeAsteroids[ai];
          if (!a.enabled || a._dying) continue;

          const ap  = a.getPosition();
          const dx  = bp.x - ap.x;
          const dy  = bp.y - ap.y;
          const dz  = bp.z - ap.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

          if (dist < a._radius + 0.15) {
            // Hit!
            explode(ap);
            self._soundExplode();
            a._dying = true;
            a._dyingT = 0;
            score++;
            scoreEl.textContent = 'SCORE: ' + score;
            toDestroyBolts.push(bi);
            hit = true;
            break;
          }
        }
        if (hit) continue;
      }

      // Remove hit bolts (descending)
      for (const bi of toDestroyBolts) {
        despawnBolt(activeBolts[bi], bi);
      }

      // Explosion light decay
      for (let i = explosions.length - 1; i >= 0; i--) {
        const ex = explosions[i];
        ex.t += dt;
        const frac = 1 - ex.t / ex.maxT;
        if (frac <= 0) {
          ex.entity.destroy();
          explosions.splice(i, 1);
        } else {
          ex.entity.light.intensity = 5 * frac;
        }
      }
    });

    app.start();
  },

  _initAudio() {
    if (this._actx) return;
    this._actx = new (window.AudioContext || window.webkitAudioContext)();
  },

  _soundShoot() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    o.start(); o.stop(ctx.currentTime + 0.12);
  },

  _soundExplode() {
    if (!this._actx) return;
    const ctx = this._actx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    src.connect(filter); filter.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    src.start(); src.stop(ctx.currentTime + 0.3);
  },

  _soundLifeLost() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(440, ctx.currentTime);
    o.frequency.setValueAtTime(220, ctx.currentTime + 0.1);
    o.frequency.setValueAtTime(110, ctx.currentTime + 0.25);
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.4);
  },

  _soundGameOver() {
    if (!this._actx) return;
    const ctx = this._actx;
    [330, 247, 185].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.18;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t); o.stop(t + 0.35);
    });
  },

  _startEngineHum() {
    if (!this._actx || this._engineHum) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 55;
    g.gain.value = 0.04;
    o.start();
    this._engineHum = { osc: o, gain: g };
  },

  _stopEngineHum() {
    if (this._engineHum) {
      try { this._engineHum.osc.stop(); } catch(e) {}
      this._engineHum = null;
    }
  },

  destroy() {
    this._stopEngineHum();
    if (this._actx) {
      this._actx.close();
      this._actx = null;
    }
    if (this._hud) {
      this._hud.remove();
      this._hud = null;
    }
    if (this._app) {
      this._app.destroy();
      this._app = null;
    }
    if (this._canvas) {
      this._canvas.remove();
      this._canvas = null;
    }
  },
};
