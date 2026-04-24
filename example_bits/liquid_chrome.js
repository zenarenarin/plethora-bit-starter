window.scrollerApp = {
  meta: {
    title: 'Liquid Chrome',
    author: 'plethora',
    description: 'Touch the surface — it ripples like mercury',
    tags: ['creative'],
  },

  init(container) {
    // ── Guard against double-injection ──────────────────────────────────────
    if (window._liquidChromeLoaded) {
      this._start(container);
      return;
    }
    window._liquidChromeLoaded = true;
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
    s.onload = () => this._start(container);
    document.head.appendChild(s);
  },

  _start(container) {
    const W = container.clientWidth;
    const H = container.clientHeight;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(DPR);
    renderer.setSize(W, H);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
    container.appendChild(renderer.domElement);
    this._renderer = renderer;

    // ── Scene / Camera ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    this._scene = scene;

    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.set(0.4, 0.2, 2.8);
    camera.lookAt(0, 0, 0);
    this._camera = camera;

    // ── Procedural env map (colored point lights baked into CubeRenderTarget) ─
    // We use PMREMGenerator with a tiny "probe scene" made of colored planes.
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    const probeScene = new THREE.Scene();
    const probeColors = [
      [0xff2244, [6, 3, 2]],
      [0x2255ff, [-6, -2, 4]],
      [0x22ffaa, [0, 6, -4]],
      [0xffaa22, [-4, -4, -6]],
      [0xcc44ff, [5, -5, 0]],
    ];
    probeColors.forEach(([color, pos]) => {
      const light = new THREE.PointLight(color, 2, 20);
      light.position.set(...pos);
      probeScene.add(light);
      // A tiny emissive sphere so the cube camera "sees" a colored source
      const sm = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      );
      sm.position.set(...pos);
      probeScene.add(sm);
    });
    const envMap = pmrem.fromScene(probeScene).texture;
    scene.environment = envMap;
    pmrem.dispose();

    // ── Orbiting colored point lights (give colorful chrome look) ────────────
    this._lights = [];
    const lightDefs = [
      { color: 0xff3366, r: 3.5, speed: 0.41, phase: 0.0,   y: 1.2  },
      { color: 0x3388ff, r: 3.0, speed: 0.27, phase: 2.1,   y: -0.8 },
      { color: 0x44ffcc, r: 4.0, speed: 0.33, phase: 4.2,   y: 0.4  },
      { color: 0xff8822, r: 2.8, speed: 0.52, phase: 1.1,   y: -1.5 },
    ];
    lightDefs.forEach(def => {
      const pl = new THREE.PointLight(def.color, 3.5, 12);
      scene.add(pl);
      this._lights.push({ pl, ...def });
    });

    // ── Sphere with ShaderMaterial (vertex displacement) ─────────────────────
    const SEG = 128;
    const geo = new THREE.SphereGeometry(1, SEG, SEG);
    // Store original positions as a custom attribute so the shader can
    // displace from the rest shape without accumulating drift.
    geo.setAttribute(
      'aPosition',
      new THREE.BufferAttribute(geo.attributes.position.array.slice(), 3)
    );

    const MAX_RIPPLES = 5;

    // Uniforms – ripple data packed as arrays
    const uniforms = {
      uTime:          { value: 0.0 },
      uIdle:          { value: 1.0 }, // 1 = rotating, 0 = touched
      // Per-ripple: origin on unit sphere (xyz), startTime (w)
      uRippleOrigin:  { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 1, 0, -9999)) },
      uRippleCount:   { value: 0 },
      uLightPos:      { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
      uLightColor:    { value: Array.from({ length: 4 }, () => new THREE.Vector3(1, 1, 1)) },
    };

    const vertexShader = /* glsl */`
      attribute vec3 aPosition;

      uniform float uTime;
      uniform float uIdle;
      uniform vec4  uRippleOrigin[${MAX_RIPPLES}];
      uniform int   uRippleCount;

      varying vec3  vNormal;
      varying vec3  vWorldPos;

      float ripple(vec3 p, vec4 origin) {
        float t       = uTime - origin.w;
        if (t < 0.0) return 0.0;

        float dist    = acos(clamp(dot(p, origin.xyz), -1.0, 1.0)); // geodesic
        float freq    = 14.0;
        float speed   = 3.2;
        float decay   = 4.0;
        float amp     = 0.10 * exp(-t * 1.8); // fade over ~2 s
        float wave    = sin(dist * freq - t * speed) * exp(-dist * decay);
        return amp * wave;
      }

      void main() {
        vec3 p = normalize(aPosition); // unit-sphere direction

        // Accumulate displacement from all active ripples
        float disp = 0.0;
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          if (i >= uRippleCount) break;
          disp += ripple(p, uRippleOrigin[i]);
        }

        // Idle breathing / slow morph when no touch
        disp += uIdle * 0.012 * sin(p.x * 4.0 + uTime * 0.9)
                       * sin(p.y * 3.0 + uTime * 0.7)
                       * sin(p.z * 5.0 + uTime * 1.1);

        vec3 displaced = aPosition + normalize(aPosition) * disp;

        // Approximate displaced normal via finite differences (cheap)
        float eps = 0.01;
        vec3 tangent = normalize(cross(aPosition, vec3(0.0, 1.0, 0.01)));
        vec3 bitang  = normalize(cross(aPosition, tangent));

        vec3 p1 = normalize(aPosition + tangent * eps);
        vec3 p2 = normalize(aPosition + bitang  * eps);

        // Re-evaluate displacement at neighbors (unrolled for GLSL compat)
        float d1 = 0.0, d2 = 0.0;
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          if (i >= uRippleCount) break;
          d1 += ripple(p1, uRippleOrigin[i]);
          d2 += ripple(p2, uRippleOrigin[i]);
        }
        d1 += uIdle * 0.012 * sin(p1.x*4.0+uTime*0.9)*sin(p1.y*3.0+uTime*0.7)*sin(p1.z*5.0+uTime*1.1);
        d2 += uIdle * 0.012 * sin(p2.x*4.0+uTime*0.9)*sin(p2.y*3.0+uTime*0.7)*sin(p2.z*5.0+uTime*1.1);

        vec3 q1 = (aPosition + tangent * eps) + p1 * d1;
        vec3 q2 = (aPosition + bitang  * eps) + p2 * d2;

        vNormal   = normalize(normalMatrix * normalize(cross(q1 - displaced, q2 - displaced)));
        vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `;

    const fragmentShader = /* glsl */`
      uniform vec3 uLightPos[4];
      uniform vec3 uLightColor[4];

      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 R = reflect(-V, N);

        // Fresnel — metals go from dark base to bright rim
        float fresnel = pow(1.0 - max(dot(V, N), 0.0), 4.0);

        // Environment reflection: rich gradient (warm top, cool bottom, dark sides)
        float envY  = R.y * 0.5 + 0.5;
        float envXZ = abs(R.x) * 0.3 + abs(R.z) * 0.3;
        vec3 envTop  = vec3(0.95, 0.95, 1.00);
        vec3 envMid  = vec3(0.20, 0.22, 0.28);
        vec3 envBot  = vec3(0.05, 0.05, 0.07);
        vec3 envCol  = mix(envBot, mix(envMid, envTop, envY), smoothstep(0.0, 1.0, envY));
        envCol      *= (1.0 - envXZ * 0.4); // darken sides for depth

        // Specular highlights from each orbiting light
        vec3 specAccum = vec3(0.0);
        for (int i = 0; i < 4; i++) {
          vec3  L    = normalize(uLightPos[i] - vWorldPos);
          vec3  H    = normalize(L + V);
          float NdH  = max(dot(N, H), 0.0);
          float spec = pow(NdH, 80.0);          // tight hard highlight
          float wide = pow(NdH, 10.0) * 0.15;  // broad secondary sheen
          specAccum += uLightColor[i] * (spec + wide);
        }

        // Metallic base: almost no diffuse, mostly env reflection + specular
        vec3 base = vec3(0.78, 0.80, 0.84);    // cool silver
        vec3 col  = mix(base * 0.08, envCol, 0.7 + 0.3 * fresnel);
        col      += specAccum;

        gl_FragColor = vec4(clamp(col, 0.0, 2.0), 1.0);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    });

    const sphere = new THREE.Mesh(geo, mat);
    scene.add(sphere);
    this._sphere = sphere;
    this._uniforms = uniforms;

    // ── Ripple queue ─────────────────────────────────────────────────────────
    // Ring buffer – newest ripple overwrites oldest when full.
    this._ripples = [];   // { origin: Vector3, startTime: number }
    this._rippleHead = 0;
    this._idleVelocity = 1.0;
    this._touchActive = false;

    // ── Clock ────────────────────────────────────────────────────────────────
    this._clock = new THREE.Clock();

    // ── Pointer events ───────────────────────────────────────────────────────
    this._onPointerDown = (e) => {
      e.preventDefault();
      this._touchActive = true;
      this._addRipple(e, container, camera, sphere);
    };
    this._onPointerMove = (e) => {
      if (!this._touchActive) return;
      // Throttle move ripples: only spawn if previous was > 80 ms ago
      const now = performance.now();
      if (!this._lastMoveTime || now - this._lastMoveTime > 80) {
        this._lastMoveTime = now;
        this._addRipple(e, container, camera, sphere);
      }
    };
    this._onPointerUp = () => { this._touchActive = false; };

    renderer.domElement.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    renderer.domElement.addEventListener('pointermove', this._onPointerMove, { passive: true });
    renderer.domElement.addEventListener('pointerup',   this._onPointerUp,   { passive: true });
    renderer.domElement.addEventListener('pointercancel', this._onPointerUp, { passive: true });

    // ── Resize ───────────────────────────────────────────────────────────────
    this._onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);

    // ── Animation loop ───────────────────────────────────────────────────────
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const t   = this._clock.getElapsedTime();
      const dt  = this._clock.getDelta();

      // Smooth idle factor
      const targetIdle = this._touchActive ? 0.0 : 1.0;
      this._idleVelocity += (targetIdle - this._idleVelocity) * 0.04;

      // Update uniforms
      uniforms.uTime.value  = t;
      uniforms.uIdle.value  = this._idleVelocity;

      // Expire old ripples (older than 3 s)
      this._ripples = this._ripples.filter(r => t - r.startTime < 3.0);
      uniforms.uRippleCount.value = this._ripples.length;
      this._ripples.forEach((r, i) => {
        uniforms.uRippleOrigin.value[i].set(r.origin.x, r.origin.y, r.origin.z, r.startTime);
      });

      // Idle rotation
      sphere.rotation.y += this._idleVelocity * 0.003;
      sphere.rotation.x  = Math.sin(t * 0.17) * 0.08 * this._idleVelocity;

      // Orbit colored lights, then sync positions into shader uniforms
      this._lights.forEach(({ pl, r, speed, phase, y }, i) => {
        const a = t * speed + phase;
        pl.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        uniforms.uLightPos.value[i].copy(pl.position);
        uniforms.uLightColor.value[i].set(pl.color.r * 1.4, pl.color.g * 1.4, pl.color.b * 1.4);
      });

      renderer.render(scene, camera);
    };
    this._raf = requestAnimationFrame(loop);
  },

  // ── Helper: cast ray from pointer into sphere and record ripple ───────────
  _addRipple(e, container, camera, sphere) {
    const rect = container.getBoundingClientRect();
    const px = (e.clientX - rect.left)  / rect.width;
    const py = (e.clientY - rect.top)   / rect.height;

    const ndc = new THREE.Vector2(px * 2 - 1, -(py * 2 - 1));
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);

    const hits = ray.intersectObject(sphere);
    if (!hits.length) return;

    const localPt = sphere.worldToLocal(hits[0].point.clone()).normalize();
    const t = this._clock.getElapsedTime();

    if (this._ripples.length < 5) {
      this._ripples.push({ origin: localPt, startTime: t });
    } else {
      let oldestIdx = 0, oldestT = Infinity;
      this._ripples.forEach((r, i) => {
        if (r.startTime < oldestT) { oldestT = r.startTime; oldestIdx = i; }
      });
      this._ripples[oldestIdx] = { origin: localPt, startTime: t };
    }
  },

  destroy() {
    cancelAnimationFrame(this._raf);

    if (this._renderer) {
      const el = this._renderer.domElement;
      if (el) {
        el.removeEventListener('pointerdown',  this._onPointerDown);
        el.removeEventListener('pointermove',  this._onPointerMove);
        el.removeEventListener('pointerup',    this._onPointerUp);
        el.removeEventListener('pointercancel',this._onPointerUp);
      }
    }
    window.removeEventListener('resize', this._onResize);

    // Dispose Three.js resources
    if (this._scene) {
      this._scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer.domElement?.remove();
    }

    // Reset state
    this._raf        = null;
    this._renderer   = null;
    this._scene      = null;
    this._sphere     = null;
    this._lights     = [];
    this._ripples    = [];
    this._uniforms   = null;
    this._clock      = null;
    this._touchActive = false;
  },
};
