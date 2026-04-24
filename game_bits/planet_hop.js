window.scrollerApp = {
  meta: {
    title: 'Planet Hop',
    author: 'plethora',
    description: 'Tap to jump. Land on planets. Don\'t miss.',
    tags: ['game'],
  },

  _app: null,
  _canvas: null,
  _hud: null,
  _overlay: null,
  _actx: null,
  _spaceAmbient: null,

  init(container) {
    const self = this;

    function loadPC(cb) {
      if (window.pc) return cb();
      const s = document.createElement('script');
      s.src = 'https://code.playcanvas.com/playcanvas-stable.min.js';
      s.onload = cb;
      document.head.appendChild(s);
    }

    // HUD
    const hud = document.createElement('div');
    hud.style.cssText = [
      'position:absolute',
      'top:24px',
      'left:0',
      'width:100%',
      'text-align:center',
      'color:#fff',
      'font-family:monospace',
      'font-size:22px',
      'font-weight:bold',
      'letter-spacing:2px',
      'pointer-events:none',
      'text-shadow:0 0 12px #00cfff,0 2px 8px #000',
      'z-index:10',
    ].join(';');
    hud.textContent = 'SCORE: 0';
    container.style.position = 'relative';
    container.appendChild(hud);
    this._hud = hud;

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:absolute',
      'top:0','left:0','width:100%','height:100%',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'color:#fff',
      'font-family:monospace',
      'text-align:center',
      'pointer-events:none',
      'z-index:20',
      'background:rgba(0,0,8,0.72)',
    ].join(';');
    overlay.innerHTML = '<div id="ph-msg" style="font-size:2em;font-weight:bold;text-shadow:0 0 24px #ff4455,0 0 8px #000"></div><div id="ph-sub" style="margin-top:18px;font-size:1.1em;opacity:0.85"></div>';
    container.appendChild(overlay);
    this._overlay = overlay;

    loadPC(function () {
      self._startGame(container);
    });
  },

  _startGame(container) {
    const self = this;

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;position:absolute;top:0;left:0;';
    container.insertBefore(canvas, container.firstChild);
    this._canvas = canvas;

    const W = container.clientWidth  || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;
    canvas.width  = W;
    canvas.height = H;

    // PlayCanvas app
    const app = new pc.Application(canvas, {
      mouse: new pc.Mouse(canvas),
      touch: new pc.TouchDevice(canvas),
      graphicsDeviceOptions: { antialias: true, alpha: false },
    });
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this._app = app;

    // ---- SCENE ----

    // Camera
    const camEntity = new pc.Entity('camera');
    camEntity.addComponent('camera', {
      fov: 45,
      clearColor: new pc.Color(0, 0, 0.03, 1),
      nearClip: 0.1,
      farClip: 500,
    });
    camEntity.setPosition(0, 2, 12);
    app.root.addChild(camEntity);

    // Directional light (sun)
    const sunLight = new pc.Entity('sun');
    sunLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.95, 0.85),
      intensity: 1.4,
      castShadows: false,
    });
    sunLight.setEulerAngles(35, -40, 0);
    app.root.addChild(sunLight);

    // Ambient fill
    const ambLight = new pc.Entity('amb');
    ambLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.2, 0.25, 0.5),
      intensity: 0.5,
      castShadows: false,
    });
    ambLight.setEulerAngles(-35, 140, 0);
    app.root.addChild(ambLight);

    // Stars
    const starColors = [
      new pc.Color(1,1,1),
      new pc.Color(0.7,0.85,1),
      new pc.Color(1,0.9,0.7),
    ];
    for (let i = 0; i < 120; i++) {
      const star = new pc.Entity('star');
      const sm = new pc.StandardMaterial();
      const sc = starColors[Math.floor(Math.random() * starColors.length)];
      sm.diffuse = sc;
      sm.emissive = sc;
      sm.update();
      star.addComponent('model', { type: 'sphere' });
      star.model.material = sm;
      const r = 0.04 + Math.random() * 0.04;
      star.setLocalScale(r, r, r);
      const angle = Math.random() * Math.PI * 2;
      const dist  = 30 + Math.random() * 60;
      const vy    = (Math.random() - 0.5) * 40;
      star.setPosition(
        Math.cos(angle) * dist,
        vy,
        -10 - Math.random() * 40,
      );
      app.root.addChild(star);
    }

    // ---- PLANET POOL ----

    const PLANET_COLORS = [
      { d: new pc.Color(0.85, 0.40, 0.15), e: new pc.Color(0.15, 0.04, 0.00) }, // rocky orange
      { d: new pc.Color(0.20, 0.55, 0.90), e: new pc.Color(0.00, 0.05, 0.18) }, // icy blue
      { d: new pc.Color(0.20, 0.72, 0.28), e: new pc.Color(0.01, 0.12, 0.02) }, // jungle green
      { d: new pc.Color(0.90, 0.18, 0.10), e: new pc.Color(0.22, 0.00, 0.00) }, // lava red
      { d: new pc.Color(0.82, 0.70, 0.35), e: new pc.Color(0.12, 0.09, 0.00) }, // desert tan
      { d: new pc.Color(0.60, 0.20, 0.85), e: new pc.Color(0.08, 0.00, 0.15) }, // violet gas
    ];

    function rnd(a, b) { return a + Math.random() * (b - a); }

    const PLANET_SPEED = 1.5; // units/s leftward
    const PLANET_SPACING = 7; // x-gap between planets
    const POOL_COUNT = 5;

    const planets = [];

    function makePlanet(xStart, yOff) {
      const ci = Math.floor(Math.random() * PLANET_COLORS.length);
      const col = PLANET_COLORS[ci];
      const radius = rnd(1.2, 2.2);

      const e = new pc.Entity('planet');
      const mat = new pc.StandardMaterial();
      mat.diffuse = col.d;
      mat.emissive = col.e;
      mat.metalness = 0.1;
      mat.gloss = 0.35;
      mat.useMetalness = true;
      mat.update();
      e.addComponent('model', { type: 'sphere' });
      e.model.material = mat;
      e.setLocalScale(radius * 2, radius * 2, radius * 2);
      const y = yOff !== undefined ? yOff : rnd(-1.0, 1.0);
      e.setPosition(xStart, y, 0);
      app.root.addChild(e);

      return { entity: e, radius, y };
    }

    // Spawn initial planets spaced out
    for (let i = 0; i < POOL_COUNT; i++) {
      const x = -4 + i * PLANET_SPACING;
      const y = i === 0 ? 0 : rnd(-1.0, 1.0);
      planets.push({ entity: null, radius: 0, x, y, ...makePlanet(x, y) });
    }
    // Fix up positions stored
    for (let i = 0; i < planets.length; i++) {
      const pos = planets[i].entity.getPosition();
      planets[i].x = pos.x;
      planets[i].y = pos.y;
    }

    // ---- PLAYER ----

    const playerBody = new pc.Entity('player-body');
    const bodyMat = new pc.StandardMaterial();
    bodyMat.diffuse = new pc.Color(0.9, 0.9, 0.92);
    bodyMat.metalness = 0.35;
    bodyMat.gloss = 0.65;
    bodyMat.useMetalness = true;
    bodyMat.update();
    playerBody.addComponent('model', { type: 'sphere' });
    playerBody.model.material = bodyMat;
    const PLAYER_R = 0.28;
    playerBody.setLocalScale(PLAYER_R * 2, PLAYER_R * 2, PLAYER_R * 2);
    app.root.addChild(playerBody);

    const helmet = new pc.Entity('helmet');
    const helmetMat = new pc.StandardMaterial();
    helmetMat.diffuse = new pc.Color(0.6, 0.65, 0.70);
    helmetMat.metalness = 0.5;
    helmetMat.gloss = 0.8;
    helmetMat.useMetalness = true;
    helmetMat.update();
    helmet.addComponent('model', { type: 'box' });
    helmet.model.material = helmetMat;
    helmet.setLocalScale(0.22, 0.14, 0.22);
    playerBody.addChild(helmet);
    helmet.setLocalPosition(0, PLAYER_R + 0.1, 0);

    // Visor glow
    const visor = new pc.Entity('visor');
    const visorMat = new pc.StandardMaterial();
    visorMat.diffuse = new pc.Color(0.0, 0.8, 1.0);
    visorMat.emissive = new pc.Color(0.0, 0.6, 1.0);
    visorMat.update();
    visor.addComponent('model', { type: 'box' });
    visor.model.material = visorMat;
    visor.setLocalScale(0.18, 0.07, 0.06);
    helmet.addChild(visor);
    visor.setLocalPosition(0, 0, 0.09);

    // ---- GAME STATE ----
    let state = 'standing'; // standing | jumping | falling | dead | waiting
    let score = 0;
    let px = 0, py = 0;
    let vx = 0, vy = 0;
    let currentPlanetIdx = 0; // which planet player stands on
    let camX = 0;

    // Place player on first planet
    function snapToSurface(pidx) {
      const p = planets[pidx];
      const pos = p.entity.getPosition();
      px = pos.x;
      py = pos.y + p.radius + PLAYER_R;
      playerBody.setPosition(px, py, 0.3);
    }

    snapToSurface(0);
    state = 'standing';
    camX = px;

    function updateHUD() {
      self._hud.textContent = 'SCORE: ' + score;
    }

    function showOverlay(msg, sub) {
      self._overlay.style.display = 'flex';
      document.getElementById('ph-msg').textContent = msg;
      document.getElementById('ph-sub').textContent = sub;
    }

    function hideOverlay() {
      self._overlay.style.display = 'none';
    }

    function resetGame() {
      // Reset planets
      for (let i = 0; i < planets.length; i++) {
        const x = -4 + i * PLANET_SPACING;
        const y = i === 0 ? 0 : rnd(-1.0, 1.0);
        const pos = planets[i].entity.getPosition();
        planets[i].entity.setPosition(x, y, 0);
        planets[i].x = x;
        planets[i].y = y;
        // Randomize color
        const ci = Math.floor(Math.random() * PLANET_COLORS.length);
        const col = PLANET_COLORS[ci];
        const mat = planets[i].entity.model.material;
        mat.diffuse = col.d;
        mat.emissive = col.e;
        mat.update();
      }
      score = 0;
      currentPlanetIdx = 0;
      snapToSurface(0);
      state = 'standing';
      camX = px;
      hideOverlay();
      updateHUD();
    }

    // ---- INPUT ----
    let tapped = false;
    let lastTouch = 0;

    function onTap() {
      if (state === 'dead') {
        resetGame();
        return;
      }
      if (state === 'standing') {
        self._initAudio();
        self._startSpaceAmbient();
        self._soundJump();
        state = 'jumping';
        vx = 3.2;
        vy = 6.2;
        tapped = false;
      }
    }

    canvas.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      lastTouch = Date.now();
      onTap();
    }, { passive: false });

    canvas.addEventListener('touchstart', function(e) {
      lastTouch = Date.now();
      onTap();
    }, { passive: true });

    canvas.addEventListener('click', function(e) {
      if (Date.now() - lastTouch < 500) return;
      onTap();
    });

    // ---- NEXT PLANET RIGHTMOST X ----
    function getRightmostX() {
      let maxX = -Infinity;
      for (const p of planets) {
        const x = p.entity.getPosition().x;
        if (x > maxX) maxX = x;
      }
      return maxX;
    }

    function spawnNewPlanet() {
      // Pick planet with smallest x (despawned / leftmost) to recycle
      let minIdx = 0;
      let minX = Infinity;
      for (let i = 0; i < planets.length; i++) {
        const x = planets[i].entity.getPosition().x;
        if (x < minX) { minX = x; minIdx = i; }
      }
      const rightX = getRightmostX();
      const newX = rightX + PLANET_SPACING;
      const newY = rnd(-1.0, 1.0);

      // Randomize appearance
      const ci = Math.floor(Math.random() * PLANET_COLORS.length);
      const col = PLANET_COLORS[ci];
      const radius = rnd(1.2, 2.2);

      const ent = planets[minIdx].entity;
      ent.setPosition(newX, newY, 0);
      ent.setLocalScale(radius * 2, radius * 2, radius * 2);

      const mat = ent.model.material;
      mat.diffuse = col.d;
      mat.emissive = col.e;
      mat.update();

      planets[minIdx].radius = radius;
      planets[minIdx].x = newX;
      planets[minIdx].y = newY;
    }

    // ---- UPDATE LOOP ----
    const GRAVITY = 9.8;
    const LERP = 0.04;

    app.on('update', function(dt) {
      if (state === 'dead') return;

      // Move all planets left
      for (let i = 0; i < planets.length; i++) {
        const pos = planets[i].entity.getPosition();
        pos.x -= PLANET_SPEED * dt;
        planets[i].entity.setPosition(pos.x, pos.y, pos.z);
        // Rotate
        planets[i].entity.rotate(0, 18 * dt, 0);

        // Despawn and recycle if too far left
        if (pos.x < -18) {
          spawnNewPlanet();
          // After spawn, break to avoid double-recycle in same frame
          break;
        }
      }

      if (state === 'standing') {
        // Ride current planet
        const p = planets[currentPlanetIdx];
        const ppos = p.entity.getPosition();
        px = ppos.x;
        py = ppos.y + p.radius + PLAYER_R;
        playerBody.setPosition(px, py, 0.3);

        // Check if planet moved too far left (miss window)
        if (ppos.x < -6) {
          state = 'dead';
          self._soundMiss();
          showOverlay('GAME OVER', 'Score: ' + score + '  •  Tap to restart');
          return;
        }
      }

      if (state === 'jumping' || state === 'falling') {
        vy -= GRAVITY * dt;
        px += vx * dt;
        py += vy * dt;
        playerBody.setPosition(px, py, 0.3);

        if (vy < 0) state = 'falling';

        // Collision check
        let landed = false;
        for (let i = 0; i < planets.length; i++) {
          const p = planets[i];
          const ppos = p.entity.getPosition();
          const dx = px - ppos.x;
          const dy = py - ppos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < p.radius + PLAYER_R + 0.1) {
            // Land
            currentPlanetIdx = i;
            state = 'standing';
            vx = 0; vy = 0;
            score++;
            updateHUD();
            self._soundLand();
            if (score % 5 === 0 && score > 0) self._soundMilestone();
            // Snap
            px = ppos.x;
            py = ppos.y + p.radius + PLAYER_R;
            playerBody.setPosition(px, py, 0.3);
            landed = true;
            break;
          }
        }

        // Fall off bottom
        if (!landed && py < -10) {
          state = 'dead';
          self._soundMiss();
          showOverlay('GAME OVER', 'Score: ' + score + '  •  Tap to restart');
        }
      }

      // Camera follow
      camX += (px - camX) * LERP * 60 * dt;
      const camPos = camEntity.getPosition();
      camEntity.setPosition(camX, camPos.y, camPos.z);

      // Player bobble when standing
      if (state === 'standing') {
        const now = Date.now() / 1000;
        playerBody.setPosition(px, py + Math.sin(now * 3.0) * 0.05, 0.3);
      }
    });

    app.start();
  },

  _initAudio() {
    if (this._actx) return;
    this._actx = new (window.AudioContext || window.webkitAudioContext)();
  },

  _soundJump() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(200, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o.start(); o.stop(ctx.currentTime + 0.2);
  },

  _soundLand() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(300, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.2);
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.25);
  },

  _soundMilestone() {
    if (!this._actx) return;
    const ctx = this._actx;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.09;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.start(t); o.stop(t + 0.2);
    });
  },

  _soundMiss() {
    if (!this._actx) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(400, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.6);
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.start(); o.stop(ctx.currentTime + 0.6);
  },

  _startSpaceAmbient() {
    if (!this._actx || this._spaceAmbient) return;
    const ctx = this._actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 80;
    g.gain.value = 0.03;
    o.start();
    this._spaceAmbient = o;
  },

  destroy() {
    if (this._spaceAmbient) { try { this._spaceAmbient.stop(); } catch(e) {} this._spaceAmbient = null; }
    if (this._actx) { this._actx.close(); this._actx = null; }
    this._app?.destroy();
    this._app = null;
    if (this._canvas) {
      this._canvas.remove();
      this._canvas = null;
    }
    if (this._hud) {
      this._hud.remove();
      this._hud = null;
    }
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  },
};
