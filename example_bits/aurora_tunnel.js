window.scrollerApp = {
  meta: {
    title: 'Aurora Tunnel',
    author: 'plethora',
    description: 'Fly through the northern lights — swipe to steer',
    tags: ['creative'],
  },

  init(container) {
    const self = this;
    self._container = container;
    self._destroyed = false;

    // Guard double-injection
    if (window._auroraTHREE_loaded) {
      self._startBit(container);
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
    s.onload = () => {
      window._auroraTHREE_loaded = true;
      if (!self._destroyed) self._startBit(container);
    };
    document.head.appendChild(s);
  },

  _startBit(container) {
    const self = this;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(DPR);
    renderer.setSize(W, H);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;position:absolute;top:0;left:0;';
    container.appendChild(renderer.domElement);
    self._renderer = renderer;

    // Scene + Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    self._scene = scene;

    const camera = new THREE.PerspectiveCamera(90, W / H, 0.1, 2000);
    camera.position.set(0, 0, 0);
    self._camera = camera;

    // --- Starfield ---
    const starCount = 2000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3 + 0] = (Math.random() - 0.5) * 800;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 800;
      starPos[i * 3 + 2] = -(Math.random() * 1500 + 50);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.7 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    self._stars = stars;
    self._starPos = starPos;
    self._starGeo = starGeo;

    // --- Aurora Shader ---
    const vertexShader = `
      uniform float time;
      uniform float offset;
      varying vec2 vUv;
      varying float vDisplace;

      void main() {
        vUv = uv;
        vec3 pos = position;

        // Multi-octave sine wave curtain displacement
        float d = 0.0;
        d += sin(pos.x * 0.08 + time * 0.7 + offset) * 12.0;
        d += sin(pos.x * 0.15 - time * 0.5 + offset * 1.7) * 7.0;
        d += sin(pos.x * 0.03 + time * 1.1 + offset * 0.6) * 5.0;
        d += sin(pos.y * 0.05 + time * 0.3 + offset * 2.1) * 4.0;
        pos.y += d;
        vDisplace = d;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float time;
      uniform float offset;
      uniform float colorShift;
      varying vec2 vUv;
      varying float vDisplace;

      vec3 aurora(float t, float shift) {
        // Green -> Cyan -> Blue -> Violet gradient driven by colorShift + UV
        float g = sin(t * 3.14159 + shift) * 0.5 + 0.5;
        float b = sin(t * 3.14159 + shift + 1.0) * 0.5 + 0.5;
        float r = sin(t * 3.14159 + shift + 2.2) * 0.5 + 0.5;
        return vec3(r * 0.4, g * 0.9 + 0.1, b);
      }

      void main() {
        float t = vUv.y + vDisplace * 0.015 + colorShift * 0.3;

        // Band shaping — brighter in mid UV.y, fade at edges
        float band = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);

        // Flickering intensity along X
        float flicker = sin(vUv.x * 20.0 + time * 2.3 + offset) * 0.5 + 0.5;
        flicker = mix(0.5, 1.0, flicker);

        vec3 col = aurora(t, offset * 0.5) * band * flicker;

        // Second harmonic layer
        float t2 = vUv.x * 0.5 + vDisplace * 0.02 + colorShift * 0.2 + offset;
        vec3 col2 = aurora(t2, offset * 0.8 + 1.5) * band * (1.0 - flicker * 0.3);
        col = col + col2 * 0.4;

        float alpha = band * (0.35 + flicker * 0.25);
        gl_FragColor = vec4(col, alpha);
      }
    `;

    // --- Tunnel layers ---
    // 10 open-ended cylinder sections + 2 wide planes for ceiling/floor aurora sheets
    const LAYER_COUNT = 10;
    const TUNNEL_LENGTH = 180;
    const TUNNEL_RADIUS = 55;
    const RECYCLE_Z = 20;      // when layer passes camera, teleport back
    const SPAWN_Z = -TUNNEL_LENGTH;

    self._layers = [];
    self._layerUniforms = [];

    for (let i = 0; i < LAYER_COUNT; i++) {
      const phase = (i / LAYER_COUNT) * Math.PI * 2;

      const uniforms = {
        time: { value: 0 },
        offset: { value: phase },
        colorShift: { value: 0 },
      };
      self._layerUniforms.push(uniforms);

      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      // CylinderGeometry open-ended for tunnel feel
      const geo = new THREE.CylinderGeometry(
        TUNNEL_RADIUS,
        TUNNEL_RADIUS,
        TUNNEL_LENGTH,
        48,   // radial segments
        8,    // height segments
        true  // open ended
      );

      const mesh = new THREE.Mesh(geo, mat);
      // Rotate so cylinder axis aligns with Z (forward)
      mesh.rotation.x = Math.PI / 2;
      // Distribute along Z
      const zOffset = SPAWN_Z + (i / LAYER_COUNT) * TUNNEL_LENGTH;
      mesh.position.z = zOffset;

      scene.add(mesh);
      self._layers.push(mesh);
    }

    // Extra wide aurora sheets (planes) for volumetric ceiling/floor effect
    const SHEET_COUNT = 8;
    self._sheets = [];
    self._sheetUniforms = [];

    for (let i = 0; i < SHEET_COUNT; i++) {
      const phase = (i / SHEET_COUNT) * Math.PI * 2 + 0.5;
      const yPos = (i % 2 === 0 ? 1 : -1) * (15 + (i >> 1) * 10);

      const uniforms = {
        time: { value: 0 },
        offset: { value: phase },
        colorShift: { value: 0 },
      };
      self._sheetUniforms.push(uniforms);

      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const geo = new THREE.PlaneGeometry(220, TUNNEL_LENGTH, 32, 8);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, yPos, SPAWN_Z + (i / SHEET_COUNT) * TUNNEL_LENGTH);
      // Rotate plane so it faces along tunnel
      mesh.rotation.y = Math.PI / 2;
      scene.add(mesh);
      self._sheets.push(mesh);
    }

    // --- State ---
    self._speed = 40;           // units/sec forward
    self._time = 0;
    self._colorShift = 0;

    // Steering state
    self._steerTarget = 0;     // target X offset [-1, 1]
    self._steerCurrent = 0;
    self._rollTarget = 0;
    self._rollCurrent = 0;
    self._pointerDown = false;
    self._pointerStartX = 0;
    self._pointerLastX = 0;
    self._pointerVelX = 0;

    // --- Input ---
    const onPointerDown = (e) => {
      self._pointerDown = true;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      self._pointerStartX = x;
      self._pointerLastX = x;
      self._pointerVelX = 0;
    };

    const onPointerMove = (e) => {
      if (!self._pointerDown) return;
      e.preventDefault();
      const x = e.touches ? e.changedTouches[0].clientX : e.clientX;
      self._pointerVelX = x - self._pointerLastX;
      self._pointerLastX = x;

      const deltaX = (x - self._pointerStartX) / W;
      self._steerTarget = Math.max(-1, Math.min(1, deltaX * 2.5));
      self._rollTarget = deltaX * 0.35;
    };

    const onPointerUp = () => {
      self._pointerDown = false;
      self._steerTarget = 0;
      self._rollTarget = 0;
    };

    const el = renderer.domElement;
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('touchstart', onPointerDown, { passive: true });
    el.addEventListener('touchmove', onPointerMove, { passive: false });
    el.addEventListener('touchend', onPointerUp);

    self._onPointerDown = onPointerDown;
    self._onPointerMove = onPointerMove;
    self._onPointerUp = onPointerUp;

    // --- Resize ---
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    self._onResize = onResize;

    // --- Render loop ---
    let lastTime = performance.now();

    const loop = (now) => {
      if (self._destroyed) return;
      self._raf = requestAnimationFrame(loop);

      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      self._time += dt;

      const t = self._time;
      // Slow 60s color cycle
      self._colorShift = (t / 60.0) % 1.0;

      // Forward camera motion
      camera.position.z -= self._speed * dt;

      // Steering lerp
      self._steerCurrent += (self._steerTarget - self._steerCurrent) * dt * 4;
      self._rollCurrent += (self._rollTarget - self._rollCurrent) * dt * 3;

      camera.position.x = self._steerCurrent * 4;
      camera.position.y = 0;
      camera.rotation.z = -self._rollCurrent * 0.25;
      camera.rotation.y = -self._steerCurrent * 0.3;

      const camZ = camera.position.z;

      // Recycle tunnel cylinder layers
      for (let i = 0; i < self._layers.length; i++) {
        const mesh = self._layers[i];
        if (mesh.position.z > camZ + RECYCLE_Z) {
          mesh.position.z -= TUNNEL_LENGTH;
        }
        self._layerUniforms[i].time.value = t;
        self._layerUniforms[i].colorShift.value = self._colorShift;
      }

      // Recycle aurora sheets
      const SHEET_TUNNEL_LEN = TUNNEL_LENGTH * 1.2;
      for (let i = 0; i < self._sheets.length; i++) {
        const mesh = self._sheets[i];
        if (mesh.position.z > camZ + RECYCLE_Z) {
          mesh.position.z -= SHEET_TUNNEL_LEN;
        }
        self._sheetUniforms[i].time.value = t;
        self._sheetUniforms[i].colorShift.value = self._colorShift;
      }

      // Recycle stars — move star field so it loops
      const starPosArr = self._starPos;
      for (let i = 0; i < starCount; i++) {
        const sz = starPosArr[i * 3 + 2];
        if (sz > camZ + 50) {
          starPosArr[i * 3 + 2] -= 1550;
        }
      }
      self._starGeo.attributes.position.needsUpdate = true;
      // Subtle star parallax via group following camera X/Y partially
      stars.position.x = camera.position.x * 0.1;
      stars.position.y = camera.position.y * 0.1;
      stars.position.z = camZ; // keep stars centered around camera Z

      renderer.render(scene, camera);
    };

    self._raf = requestAnimationFrame(loop);
  },

  destroy() {
    const self = this;
    self._destroyed = true;

    if (self._raf) {
      cancelAnimationFrame(self._raf);
      self._raf = null;
    }

    const el = self._renderer && self._renderer.domElement;
    if (el) {
      el.removeEventListener('pointerdown', self._onPointerDown);
      el.removeEventListener('pointermove', self._onPointerMove);
      el.removeEventListener('pointerup', self._onPointerUp);
      el.removeEventListener('pointercancel', self._onPointerUp);
      el.removeEventListener('touchstart', self._onPointerDown);
      el.removeEventListener('touchmove', self._onPointerMove);
      el.removeEventListener('touchend', self._onPointerUp);
    }

    if (self._onResize) {
      window.removeEventListener('resize', self._onResize);
      self._onResize = null;
    }

    // Dispose geometries + materials
    if (self._layers) {
      for (const mesh of self._layers) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      self._layers = null;
    }
    if (self._sheets) {
      for (const mesh of self._sheets) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      self._sheets = null;
    }
    if (self._stars) {
      self._stars.geometry.dispose();
      self._stars.material.dispose();
      self._stars = null;
    }

    if (self._renderer) {
      self._renderer.dispose();
      self._renderer.domElement.remove();
      self._renderer = null;
    }

    self._scene = null;
    self._camera = null;
    self._starGeo = null;
    self._starPos = null;
    self._layerUniforms = null;
    self._sheetUniforms = null;
  },
};
