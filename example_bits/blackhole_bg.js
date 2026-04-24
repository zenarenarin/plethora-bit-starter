let _threeLoaded = false;

window.scrollerApp = {
  meta: {
    title: 'Black Hole',
    author: 'plethora',
    description: 'Touch to move the singularity — 50k particles spiral in',
    tags: ['creative'],
  },

  init(container) {
    const self = this;
    self._destroyed = false;

    const loadAndStart = () => {
      if (_threeLoaded && window.THREE) { startBit(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
      s.onload = () => { _threeLoaded = true; startBit(); };
      document.head.appendChild(s);
    };

    function startBit() {
      if (self._destroyed) return;

      const THREE = window.THREE;
      const W = container.clientWidth;
      const H = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
      renderer.setPixelRatio(dpr);
      renderer.setSize(W, H);
      renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
      container.appendChild(renderer.domElement);
      self._renderer = renderer;

      // Scene & Camera — slightly above, angled down
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
      camera.position.set(0, 38, 52);
      camera.lookAt(0, 0, 0);
      self._scene = scene;
      self._camera = camera;

      // --- Particle system ---
      const COUNT = 50000;

      // Per-particle data stored in attributes:
      //   position  (xyz): current 3D position (y stays near 0)
      //   aAngle    (f):   current orbital angle (radians)
      //   aRadius   (f):   current orbital radius
      //   aSpeed    (f):   base orbital speed factor
      //   aPhase    (f):   random phase for shimmer
      //   aLife     (f):   0..1, fraction of orbit before respawn

      const positions = new Float32Array(COUNT * 3);
      const angles    = new Float32Array(COUNT);
      const radii     = new Float32Array(COUNT);
      const speeds    = new Float32Array(COUNT);
      const phases    = new Float32Array(COUNT);

      const MIN_R = 1.5;   // event horizon radius
      const MAX_R = 42.0;  // outer disc edge

      function initParticle(i) {
        // spawn in an annular disc
        const r = MIN_R + Math.random() * (MAX_R - MIN_R);
        const a = Math.random() * Math.PI * 2;
        const thickness = 0.18 * r; // slight vertical spread, thicker outer
        radii[i]    = r;
        angles[i]   = a;
        speeds[i]   = 0.3 + Math.random() * 0.7; // base multiplier
        phases[i]   = Math.random() * Math.PI * 2;
        positions[i * 3]     = Math.cos(a) * r;
        positions[i * 3 + 1] = (Math.random() - 0.5) * thickness * 0.12;
        positions[i * 3 + 2] = Math.sin(a) * r;
      }

      for (let i = 0; i < COUNT; i++) initParticle(i);

      const geo = new THREE.BufferGeometry();
      const posAttr   = new THREE.BufferAttribute(positions, 3);
      const angAttr   = new THREE.BufferAttribute(angles,    1);
      const radAttr   = new THREE.BufferAttribute(radii,     1);
      const spdAttr   = new THREE.BufferAttribute(speeds,    1);
      const phaAttr   = new THREE.BufferAttribute(phases,    1);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      angAttr.setUsage(THREE.DynamicDrawUsage);
      radAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', posAttr);
      geo.setAttribute('aAngle',   angAttr);
      geo.setAttribute('aRadius',  radAttr);
      geo.setAttribute('aSpeed',   spdAttr);
      geo.setAttribute('aPhase',   phaAttr);

      const vertShader = `
        attribute float aRadius;
        attribute float aSpeed;
        attribute float aPhase;

        uniform float uTime;
        uniform vec2  uSingularity; // XZ position of black hole centre
        uniform float uGravity;

        varying float vRadius;
        varying float vSpeed;
        varying float vPhase;
        varying vec3  vPos;

        void main() {
          vRadius = aRadius;
          vSpeed  = aSpeed;
          vPhase  = aPhase;
          vPos    = position;

          // Distance to singularity in XZ plane
          vec2 pxz = vec2(position.x, position.z);
          float distSing = length(pxz - uSingularity);

          // Point size: bigger near event horizon, smaller far away
          float proximity = clamp(1.0 - distSing / 25.0, 0.0, 1.0);
          gl_PointSize = mix(1.0, 4.5, proximity * proximity);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;

      const fragShader = `
        precision highp float;

        uniform float uTime;

        varying float vRadius;
        varying float vSpeed;
        varying float vPhase;
        varying vec3  vPos;

        vec3 colorFromRadius(float r) {
          // 0 = inner/hot (orange-red), 1 = outer/cool (blue-white)
          float t = clamp((r - 1.5) / 40.5, 0.0, 1.0);

          // Inner: deep orange-red  (1.0, 0.35, 0.05)
          // Mid:   warm yellow-white (1.0, 0.9, 0.6)
          // Outer: cool blue-white  (0.55, 0.75, 1.0)
          vec3 inner = vec3(1.0, 0.30, 0.04);
          vec3 mid   = vec3(1.0, 0.85, 0.55);
          vec3 outer = vec3(0.45, 0.65, 1.0);

          if (t < 0.35) return mix(inner, mid, t / 0.35);
          return mix(mid, outer, (t - 0.35) / 0.65);
        }

        void main() {
          // Circular particle mask
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;

          // Soft glow falloff
          float alpha = 1.0 - smoothstep(0.0, 0.5, d);
          alpha = pow(alpha, 1.4);

          // Twinkle
          float twinkle = 0.7 + 0.3 * sin(uTime * 3.0 + vPhase);

          vec3 col = colorFromRadius(vRadius) * twinkle;

          // Boost inner particles
          float innerBoost = clamp(1.0 - (vRadius - 1.5) / 8.0, 0.0, 1.0);
          col += vec3(1.0, 0.4, 0.1) * innerBoost * 0.6;

          gl_FragColor = vec4(col, alpha * 0.85);
        }
      `;

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime:        { value: 0.0 },
          uSingularity: { value: new THREE.Vector2(0, 0) },
          uGravity:     { value: 1.0 },
        },
        vertexShader:   vertShader,
        fragmentShader: fragShader,
        transparent:    true,
        blending:       THREE.AdditiveBlending,
        depthWrite:     false,
      });

      const points = new THREE.Points(geo, mat);
      scene.add(points);
      self._points = points;
      self._mat    = mat;
      self._geo    = geo;

      // Singularity glow mesh (lens flare substitute)
      const glowGeo = new THREE.PlaneGeometry(1, 1);
      const glowMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          precision highp float;
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vec2 uv = vUv - 0.5;
            float d = length(uv);
            float glow = exp(-d * 8.0) * 1.4;
            float ring = exp(-abs(d - 0.18) * 30.0) * 0.9;
            vec3 col = vec3(1.0, 0.55, 0.1) * glow + vec3(1.0, 0.8, 0.4) * ring;
            float pulse = 0.92 + 0.08 * sin(uTime * 4.5);
            gl_FragColor = vec4(col * pulse, (glow + ring) * pulse);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.scale.set(12, 12, 12);
      // billboard: always face camera — handled per frame
      scene.add(glowMesh);
      self._glowMesh = glowMesh;
      self._glowMat  = glowMat;

      // Interaction state
      let singX = 0, singZ = 0;       // current singularity XZ world pos
      let targX = 0, targZ = 0;
      let isHeld = false;

      const toWorld = (clientX, clientY) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const nx = (clientX - rect.left) / rect.width  * 2 - 1;
        const ny = -((clientY - rect.top)  / rect.height) * 2 + 1;
        // Intersect with y=0 plane via raycasting
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera({ x: nx, y: ny }, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const pt = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, pt);
        return pt;
      };

      self._onDown = e => {
        isHeld = true;
        const pt = toWorld(e.clientX, e.clientY);
        if (pt) { targX = pt.x; targZ = pt.z; }
      };
      self._onMove = e => {
        if (!isHeld) return;
        const pt = toWorld(e.clientX, e.clientY);
        if (pt) { targX = pt.x; targZ = pt.z; }
      };
      self._onUp = () => { isHeld = false; };

      renderer.domElement.addEventListener('pointerdown', self._onDown);
      renderer.domElement.addEventListener('pointermove', self._onMove);
      renderer.domElement.addEventListener('pointerup',   self._onUp);
      renderer.domElement.addEventListener('pointerleave', self._onUp);

      const DRAG_RADIUS   = MAX_R * 0.85; // clamp singularity to disc
      const GRAVITY_BASE  = 0.018;        // base inward drift per frame
      const ORBIT_BASE    = 0.006;        // base angular velocity at r=MAX_R
      const EVENT_HORIZON = MIN_R + 0.4;  // respawn threshold

      const start = performance.now();

      const loop = () => {
        if (self._destroyed) return;
        const t = (performance.now() - start) * 0.001;

        // Lerp singularity toward target
        singX += (targX - singX) * 0.07;
        singZ += (targZ - singZ) * 0.07;
        // Clamp to disc
        const sd = Math.sqrt(singX * singX + singZ * singZ);
        if (sd > DRAG_RADIUS) { singX *= DRAG_RADIUS / sd; singZ *= DRAG_RADIUS / sd; }

        // Held = stronger gravity
        const gravityMult = isHeld ? 3.2 : 1.0;

        // Update particle CPU state
        const pos = posAttr.array;
        const ang = angAttr.array;
        const rad = radAttr.array;
        const spd = spdAttr.array;

        for (let i = 0; i < COUNT; i++) {
          const px = pos[i * 3];
          const pz = pos[i * 3 + 2];

          // Vector from particle to singularity (XZ)
          const dx = singX - px;
          const dz = singZ - pz;
          const distToSing = Math.sqrt(dx * dx + dz * dz) + 0.001;

          // Singularity pull — inverse-square, scaled
          const pull = gravityMult * 0.5 / (distToSing * distToSing + 2.0);

          // Current radius from disc origin
          let r = rad[i];

          // Orbital angular velocity — faster closer to centre (Kepler-ish)
          const omega = ORBIT_BASE * spd[i] * (MAX_R / (r + 2.0)) * (1.0 + pull * 8.0);
          ang[i] += omega;

          // Spiral inward — proportional to gravity and proximity to singularity
          const inwardDrift = GRAVITY_BASE * gravityMult * (1.0 + (MAX_R - r) * 0.01);
          r -= inwardDrift + pull * 0.6;

          // Respawn when consumed (reaches event horizon)
          if (r < EVENT_HORIZON) {
            r = MIN_R * 2.5 + Math.random() * (MAX_R - MIN_R * 2.5);
            ang[i] = Math.random() * Math.PI * 2;
          }

          rad[i] = r;
          // Orbit around the singularity, not the origin
          pos[i * 3]     = singX + Math.cos(ang[i]) * r;
          pos[i * 3 + 1] = (Math.random() - 0.5) * 0.04;
          pos[i * 3 + 2] = singZ + Math.sin(ang[i]) * r;
        }

        posAttr.needsUpdate = true;
        angAttr.needsUpdate = true;
        radAttr.needsUpdate = true;

        // Update uniforms
        mat.uniforms.uTime.value        = t;
        mat.uniforms.uSingularity.value.set(singX, singZ);
        mat.uniforms.uGravity.value     = gravityMult;

        // Billboard glow to face camera
        glowMesh.position.set(singX, 0.1, singZ);
        glowMesh.lookAt(camera.position);
        glowMat.uniforms.uTime.value = t;

        renderer.render(scene, camera);
        self._raf = requestAnimationFrame(loop);
      };

      self._raf = requestAnimationFrame(loop);
    }

    loadAndStart();
  },

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._raf);

    const el = this._renderer?.domElement;
    if (el) {
      el.removeEventListener('pointerdown',  this._onDown);
      el.removeEventListener('pointermove',  this._onMove);
      el.removeEventListener('pointerup',    this._onUp);
      el.removeEventListener('pointerleave', this._onUp);
    }

    this._geo?.dispose();
    this._mat?.dispose();
    this._glowMat?.dispose();
    this._glowMesh?.geometry?.dispose();
    this._renderer?.dispose();
    this._renderer?.forceContextLoss?.();

    this._renderer = null;
    this._scene    = null;
    this._camera   = null;
    this._points   = null;
    this._glowMesh = null;
    this._geo      = null;
    this._mat      = null;
    this._glowMat  = null;
  },
};
