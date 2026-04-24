window.scrollerApp = {
  meta: {
    title: 'Crystal Geode',
    author: 'plethora',
    description: 'Watch crystals grow — tap to shatter and regrow',
    tags: ['creative'],
  },

  init(container) {
    // ── Script loader (guard against double-inject) ───────────────────────────
    if (window.__threeLoaded) {
      this._startBit(container);
      return;
    }
    if (window.__threeLoading) {
      window.__threeOnLoad = () => this._startBit(container);
      return;
    }
    window.__threeLoading = true;
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
    s.onload = () => {
      window.__threeLoaded = true;
      window.__threeLoading = false;
      if (window.__threeOnLoad) { window.__threeOnLoad(); window.__threeOnLoad = null; }
      this._startBit(container);
    };
    document.head.appendChild(s);
  },

  _startBit(container) {
    const THREE = window.THREE;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H);
    renderer.setClearColor(0x080408, 1);
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';

    // ── Scene / Camera ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 1000);
    camera.position.set(0, 0, 5.5);

    // Subtle fog for depth
    scene.fog = new THREE.FogExp2(0x080408, 0.055);

    // ── Lighting ──────────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0x110011, 0.4);
    scene.add(ambientLight);

    // Inner glow lights — one per color family
    const light1 = new THREE.PointLight(0xcc44ff, 3.5, 8);
    light1.position.set(0, 0, 0);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xff55aa, 2.2, 7);
    light2.position.set(1.2, 0.8, 0.5);
    scene.add(light2);

    const light3 = new THREE.PointLight(0xffcc44, 1.8, 7);
    light3.position.set(-1.0, -0.7, 0.8);
    scene.add(light3);

    const light4 = new THREE.PointLight(0x4488ff, 1.5, 6);
    light4.position.set(0.3, -1.0, -0.6);
    scene.add(light4);

    // ── Crystal geometry helpers ──────────────────────────────────────────────
    // Hue palettes: amethyst purples, quartz pinks, citrine yellows, aqua
    const PALETTES = [
      { h: 275, s: '72%' }, // amethyst
      { h: 290, s: '68%' }, // violet
      { h: 315, s: '75%' }, // pink quartz
      { h: 340, s: '70%' }, // rose
      { h:  45, s: '80%' }, // citrine yellow
      { h:  30, s: '75%' }, // amber
      { h: 195, s: '78%' }, // aqua
      { h: 260, s: '65%' }, // lavender
    ];

    const NUM_CRYSTALS = 80;

    // Build all crystal meshes and store growth metadata
    const crystals = [];
    const geodeGroup = new THREE.Group();
    scene.add(geodeGroup);

    // Precompute Fibonacci sphere distribution for cluster positions
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    function fibonacciPoint(i, n, radius) {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;
      return new THREE.Vector3(r * Math.cos(theta) * radius, y * radius, r * Math.sin(theta) * radius);
    }

    function rnd(min, max) { return min + Math.random() * (max - min); }

    for (let i = 0; i < NUM_CRYSTALS; i++) {
      // Geometry: tapered prism via ConeGeometry with radiusTop > 0 for variety
      const height  = rnd(0.55, 1.65);
      const radBase = rnd(0.055, 0.14);
      const radTip  = rnd(0.002, 0.025);
      const segs    = Math.random() < 0.5 ? 5 : 6; // pentagon or hex cross-section

      const geo = new THREE.CylinderGeometry(radTip, radBase, height, segs, 1, false);

      // Palette pick with small hue jitter
      const pal = PALETTES[i % PALETTES.length];
      const hue = pal.h + rnd(-12, 12);
      const lightness = rnd(52, 74);
      const opacity   = rnd(0.68, 0.90);

      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(`hsl(${hue},${pal.s},${lightness.toFixed(0)}%)`),
        emissive: new THREE.Color(`hsl(${hue},60%,18%)`),
        emissiveIntensity: 0.35,
        shininess: 140,
        specular: new THREE.Color(0xffffff),
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);

      // Position on Fibonacci sphere with slight radial jitter
      const baseRadius = rnd(0.7, 1.7);
      const pos = fibonacciPoint(i, NUM_CRYSTALS, baseRadius);

      // Tilt crystal outward from center with slight random wobble
      const dir = pos.clone().normalize();
      mesh.position.copy(pos);

      // Orient: cone tip points away from center
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      mesh.quaternion.copy(quat);

      // Extra random roll around its own axis
      mesh.rotateOnAxis(dir, rnd(0, Math.PI * 2));
      // Small random tilt deviation
      const tiltAxis = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      mesh.rotateOnWorldAxis(tiltAxis, rnd(-0.18, 0.18));

      mesh.scale.setScalar(0); // start invisible; will grow
      geodeGroup.add(mesh);

      // Growth delay: inner crystals first
      const growDelay = (baseRadius / 1.7) * 900 + rnd(0, 200); // ms

      crystals.push({
        mesh,
        pos: pos.clone(),
        dir: dir.clone(),
        growDelay,
        growDuration: rnd(400, 750),
        targetScale: 1,
        currentScale: 0,
        // Shatter physics
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
        opacity: mat.opacity,
        baseOpacity: mat.opacity,
        mat,
      });
    }

    // ── State machine ─────────────────────────────────────────────────────────
    // States: 'growing' | 'idle' | 'shattering' | 'regrowing'
    let state       = 'growing';
    let stateStart  = performance.now();
    const SHATTER_DUR  = 1500; // ms crystals fly
    const REGROW_DELAY = 300;  // ms pause before regrow

    function startGrow() {
      state = 'growing';
      stateStart = performance.now();
      for (const c of crystals) {
        c.mesh.position.copy(c.pos);
        c.mesh.scale.setScalar(0);
        c.currentScale = 0;
        c.mat.opacity = c.baseOpacity;
        c.mat.transparent = true;
        c.vel.set(0, 0, 0);
        c.angVel.set(0, 0, 0);
      }
    }

    function startShatter() {
      state = 'shattering';
      stateStart = performance.now();
      for (const c of crystals) {
        // Velocity: outward direction + small random spread + upward pop
        const speed = rnd(1.8, 5.5);
        c.vel.copy(c.dir).multiplyScalar(speed);
        c.vel.x += rnd(-1.2, 1.2);
        c.vel.y += rnd(0.5, 2.5);
        c.vel.z += rnd(-1.2, 1.2);
        // Random angular velocity
        c.angVel.set(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3));
      }
    }

    // ── Orbit drag state ──────────────────────────────────────────────────────
    let isDragging  = false;
    let dragDist    = 0;
    let lastX       = 0, lastY = 0;
    let velX        = 0, velY = 0;
    let orbitX      = 0, orbitY = 0; // current rotation angles

    // ── Easing ────────────────────────────────────────────────────────────────
    function easeOutBack(t) {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    // ── Light pulse ───────────────────────────────────────────────────────────
    let lightPhase = 0;

    // ── Render loop ───────────────────────────────────────────────────────────
    const loop = () => {
      this._raf = requestAnimationFrame(loop);

      const now  = performance.now();
      const dt   = 0.016; // nominal 60fps delta in seconds

      lightPhase += dt * 0.7;
      light1.intensity = 3.0 + 0.5 * Math.sin(lightPhase);
      light2.intensity = 2.0 + 0.4 * Math.sin(lightPhase * 1.3 + 1.0);
      light3.intensity = 1.6 + 0.35 * Math.sin(lightPhase * 0.9 + 2.2);

      // Orbit inertia
      if (!isDragging) {
        velX *= 0.93;
        velY = velY * 0.93 + 0.004 * 0.07; // gentle auto-rotate
        orbitX += velX;
        orbitY += velY;
      }
      geodeGroup.rotation.x = orbitX;
      geodeGroup.rotation.y = orbitY;

      const elapsed = now - stateStart;

      if (state === 'growing') {
        let allDone = true;
        for (const c of crystals) {
          const localT = elapsed - c.growDelay;
          if (localT < 0) { allDone = false; continue; }
          const t = Math.min(1, localT / c.growDuration);
          c.currentScale = easeOutBack(t);
          c.mesh.scale.setScalar(Math.max(0, c.currentScale));
          c.mat.opacity = c.baseOpacity * easeOutCubic(t);
          if (t < 1) allDone = false;
        }
        if (allDone) state = 'idle';

      } else if (state === 'shattering') {
        const t = Math.min(1, elapsed / SHATTER_DUR);
        const gravity = 4.5; // units/s^2

        for (const c of crystals) {
          c.mesh.position.x += c.vel.x * dt;
          c.mesh.position.y += c.vel.y * dt - 0.5 * gravity * dt * dt;
          c.mesh.position.z += c.vel.z * dt;
          c.vel.y -= gravity * dt;

          c.mesh.rotation.x += c.angVel.x * dt;
          c.mesh.rotation.y += c.angVel.y * dt;
          c.mesh.rotation.z += c.angVel.z * dt;

          // Fade out in last 40%
          const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
          c.mat.opacity = c.baseOpacity * fade;
        }

        if (t >= 1) {
          // Pause then regrow
          state = 'regrowing';
          stateStart = now;
        }

      } else if (state === 'regrowing') {
        if (elapsed >= REGROW_DELAY) startGrow();
      }
      // 'idle': nothing to update

      renderer.render(scene, camera);
    };

    this._raf = requestAnimationFrame(loop);
    startGrow();

    // ── Pointer input ─────────────────────────────────────────────────────────
    this._onDown = e => {
      isDragging = true;
      dragDist   = 0;
      const pt = e.touches ? e.touches[0] : e;
      lastX = pt.clientX;
      lastY = pt.clientY;
    };

    this._onMove = e => {
      if (!isDragging) return;
      const pt = e.touches ? e.touches[0] : e;
      const dx = pt.clientX - lastX;
      const dy = pt.clientY - lastY;
      dragDist += Math.abs(dx) + Math.abs(dy);
      velY = dx * 0.006;
      velX = dy * 0.006;
      orbitX += velX;
      orbitY += velY;
      lastX = pt.clientX;
      lastY = pt.clientY;
    };

    this._onUp = () => {
      // Tap (not drag) — shatter
      if (dragDist < 10 && (state === 'idle' || state === 'growing')) {
        startShatter();
      }
      isDragging = false;
    };

    const el = renderer.domElement;
    el.addEventListener('pointerdown',   this._onDown);
    el.addEventListener('pointermove',   this._onMove);
    el.addEventListener('pointerup',     this._onUp);
    el.addEventListener('pointercancel', this._onUp);

    this._renderer = renderer;
    this._el = el;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    const el = this._el;
    if (el) {
      el.removeEventListener('pointerdown',   this._onDown);
      el.removeEventListener('pointermove',   this._onMove);
      el.removeEventListener('pointerup',     this._onUp);
      el.removeEventListener('pointercancel', this._onUp);
    }
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer.domElement.remove();
      this._renderer = null;
    }
    this._el = null;
    this._raf = null;
  },
};
