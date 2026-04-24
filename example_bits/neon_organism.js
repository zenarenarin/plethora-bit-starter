// Neon Organism — a living 3D graph that breathes and rewires itself.
// Tap a node to send an energy pulse through the network.

window.scrollerApp = {
  meta: {
    title: 'Neon Organism',
    author: 'plethora',
    description: 'Tap a node — energy pulses through the network',
    tags: ['creative'],
  },

  // ── internal state ──────────────────────────────────────────────────────────
  _raf: null,
  _renderer: null,
  _scene: null,
  _camera: null,
  _nodes: [],        // { mesh, basePos, phase, phaseSpeed, excite, color }
  _edges: [],        // { tube, fromIdx, toIdx, mat, bright, fadeOut, growT }
  _adj: [],          // adjacency list: adj[i] = [j, …]
  _raycaster: null,
  _mouse: null,
  _isDragging: false,
  _pointerStart: null,
  _lastPointer: null,
  _cameraPhi: Math.PI / 2.5,
  _cameraTheta: 0,
  _cameraRadius: 14,
  _autoRotateSpeed: 0.0004,
  _rewireTimer: 0,
  _rewireInterval: 5,
  _onPointerDown: null,
  _onPointerMove: null,
  _onPointerUp: null,
  _container: null,

  // ── lifecycle ───────────────────────────────────────────────────────────────
  init(container) {
    this._container = container;
    this._nodes = [];
    this._edges = [];
    this._adj = [];
    this._cameraPhi = Math.PI / 2.5;
    this._cameraTheta = 0;
    this._rewireTimer = 0;
    this._isDragging = false;

    // Guard against double Three.js injection
    if (window._THREE_LOADED) {
      this._startBit();
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
    s.onload = () => {
      window._THREE_LOADED = true;
      this._startBit();
    };
    document.head.appendChild(s);
  },

  destroy() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }

    const c = this._container;
    if (c && this._onPointerDown) {
      c.removeEventListener('pointerdown', this._onPointerDown);
      c.removeEventListener('pointermove', this._onPointerMove);
      c.removeEventListener('pointerup',   this._onPointerUp);
      c.removeEventListener('pointercancel', this._onPointerUp);
    }
    this._onPointerDown = null;
    this._onPointerMove = null;
    this._onPointerUp   = null;

    // Dispose Three.js resources
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer.domElement.remove();
      this._renderer = null;
    }

    if (this._scene) {
      this._scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      this._scene = null;
    }

    this._nodes = [];
    this._edges = [];
    this._adj   = [];
    this._camera = null;
    this._raycaster = null;
    this._mouse = null;
    this._container = null;
  },

  // ── Three.js setup ──────────────────────────────────────────────────────────
  _startBit() {
    const THREE = window.THREE;
    const W = this._container.clientWidth;
    const H = this._container.clientHeight;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;position:absolute;top:0;left:0;';
    this._container.appendChild(renderer.domElement);
    this._renderer = renderer;

    // Scene
    const scene = new THREE.Scene();
    this._scene = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
    this._updateCameraPosition(camera);
    this._camera = camera;

    // Helpers
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();

    // Build graph
    this._buildGraph(THREE);

    // Pointer events
    this._bindPointer(renderer.domElement);

    // Start loop
    let last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this._update(dt, now / 1000, THREE);
      renderer.render(scene, camera);
    };
    this._raf = requestAnimationFrame(loop);
  },

  // ── Graph construction ──────────────────────────────────────────────────────
  _buildGraph(THREE) {
    const NODE_COUNT = 38;
    const RADIUS = 5.5;
    const scene = this._scene;

    // Colors
    const NODE_COLOR_BASE  = new THREE.Color(0xcc44ff);  // magenta/purple
    const EDGE_COLOR_BASE  = new THREE.Color(0x00eeff);  // cyan

    // Sphere geometry shared across all nodes (different mesh per node for excite state)
    const nodeGeo = new THREE.SphereGeometry(0.18, 10, 10);

    // Glow halo — a slightly larger additive sphere
    const haloGeo = new THREE.SphereGeometry(0.32, 8, 8);

    // Scatter nodes on sphere surface using fibonacci spiral
    for (let i = 0; i < NODE_COUNT; i++) {
      const phi   = Math.acos(1 - 2 * (i + 0.5) / NODE_COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      // Perturb slightly for organic feel
      const r = RADIUS * (0.85 + Math.random() * 0.3);
      const pos = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );

      // Core sphere
      const mat = new THREE.MeshBasicMaterial({
        color: NODE_COLOR_BASE.clone(),
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(nodeGeo, mat);
      mesh.position.copy(pos);
      scene.add(mesh);

      // Halo
      const haloMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x6600bb),
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(pos);
      scene.add(halo);

      this._nodes.push({
        mesh,
        halo,
        haloMat,
        mat,
        basePos: pos.clone(),
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.4 + Math.random() * 0.5,
        excite: 0,          // 0..1, decays over time
        visited: false,     // used in BFS
      });
      this._adj.push([]);
    }

    // Build edges: connect each node to its k nearest neighbors
    const K = 3;
    const edgeSet = new Set();
    for (let i = 0; i < NODE_COUNT; i++) {
      const pi = this._nodes[i].basePos;
      const dists = [];
      for (let j = 0; j < NODE_COUNT; j++) {
        if (i === j) continue;
        dists.push({ j, d: pi.distanceTo(this._nodes[j].basePos) });
      }
      dists.sort((a, b) => a.d - b.d);
      for (let k = 0; k < K; k++) {
        const j = dists[k].j;
        const key = i < j ? `${i}_${j}` : `${j}_${i}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          this._addEdge(i, j, THREE, EDGE_COLOR_BASE, 1.0);
        }
      }
    }
  },

  _addEdge(fromIdx, toIdx, THREE, colorBase, opacity) {
    const from = this._nodes[fromIdx];
    const to   = this._nodes[toIdx];

    const curve = new THREE.CatmullRomCurve3([
      from.basePos.clone(),
      from.basePos.clone().lerp(to.basePos, 0.33).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6
      )),
      from.basePos.clone().lerp(to.basePos, 0.66).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6
      )),
      to.basePos.clone(),
    ]);

    const tubeGeo = new THREE.TubeGeometry(curve, 12, 0.025, 5, false);
    const mat = new THREE.MeshBasicMaterial({
      color: colorBase ? colorBase.clone() : new THREE.Color(0x00eeff),
      transparent: true,
      opacity: opacity !== undefined ? opacity : 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const tube = new THREE.Mesh(tubeGeo, mat);
    this._scene.add(tube);

    // Update adjacency
    if (!this._adj[fromIdx].includes(toIdx)) this._adj[fromIdx].push(toIdx);
    if (!this._adj[toIdx].includes(fromIdx)) this._adj[toIdx].push(fromIdx);

    this._edges.push({
      tube,
      mat,
      fromIdx,
      toIdx,
      bright: 0,     // pulse brightness 0..1
      fadeOut: false,
      growT: 0,      // used for new-edge grow animation (0..1)
      growing: false,
    });
  },

  _removeEdge(edgeIdx, THREE) {
    const e = this._edges[edgeIdx];
    // Mark for fade-out instead of instant removal
    e.fadeOut = true;

    // Remove from adjacency
    const fi = this._adj[e.fromIdx].indexOf(e.toIdx);
    if (fi !== -1) this._adj[e.fromIdx].splice(fi, 1);
    const ti = this._adj[e.toIdx].indexOf(e.fromIdx);
    if (ti !== -1) this._adj[e.toIdx].splice(ti, 1);
  },

  // ── Update loop ─────────────────────────────────────────────────────────────
  _update(dt, t, THREE) {
    const nodes = this._nodes;
    const edges = this._edges;
    const scene = this._scene;

    // 1. Breathe nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const breathe = Math.sin(t * n.phaseSpeed + n.phase) * 0.12;

      // Oscillate position
      const dir = n.basePos.clone().normalize();
      n.mesh.position.copy(n.basePos).addScaledVector(dir, breathe);
      n.halo.position.copy(n.mesh.position);

      // Excite decay
      n.excite = Math.max(0, n.excite - dt * 1.5);

      // Color: lerp from base to white based on excite
      const c = n.mat.color;
      c.setHex(0xcc44ff);
      c.lerp(new THREE.Color(0xffffff), n.excite);

      // Scale halo with excite
      const s = 1 + n.excite * 2.2;
      n.halo.scale.setScalar(s);
      n.haloMat.opacity = 0.18 + n.excite * 0.55;
    }

    // 2. Pulse decay on edges + fade-out dead edges
    const toRemove = [];
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = edges[i];

      if (e.fadeOut) {
        e.mat.opacity -= dt * 0.8;
        if (e.mat.opacity <= 0) {
          scene.remove(e.tube);
          e.tube.geometry.dispose();
          e.mat.dispose();
          toRemove.push(i);
        }
        continue;
      }

      // Pulse glow decay
      e.bright = Math.max(0, e.bright - dt * 2.2);
      e.mat.opacity = 0.45 + e.bright * 0.55;
      const ec = e.mat.color;
      ec.setHex(0x00eeff);
      ec.lerp(new THREE.Color(0xffffff), e.bright * 0.7);
    }
    for (const i of toRemove) edges.splice(i, 1);

    // 3. Rewire: swap a random edge every ~5 s
    this._rewireTimer += dt;
    if (this._rewireTimer >= this._rewireInterval) {
      this._rewireTimer = 0;
      this._doRewire(THREE);
    }

    // 4. Auto-rotate camera
    this._cameraTheta += this._autoRotateSpeed * dt * 60;
    this._updateCameraPosition(this._camera);
  },

  _doRewire(THREE) {
    const n = this._nodes.length;
    if (this._edges.length === 0) return;

    // Pick a random non-fading edge to remove
    const candidates = this._edges.filter(e => !e.fadeOut);
    if (candidates.length === 0) return;
    const victim = candidates[Math.floor(Math.random() * candidates.length)];
    const victimIdx = this._edges.indexOf(victim);
    this._removeEdge(victimIdx, THREE);

    // Pick two random unconnected nodes
    let tries = 0;
    let a, b;
    do {
      a = Math.floor(Math.random() * n);
      b = Math.floor(Math.random() * n);
      tries++;
    } while ((a === b || this._adj[a].includes(b)) && tries < 30);

    if (tries < 30) {
      this._addEdge(a, b, THREE, new THREE.Color(0x00eeff), 0.01);
      // Animate opacity growing in
      const newEdge = this._edges[this._edges.length - 1];
      newEdge._growOpacity = true;
      newEdge._growSpeed = 0.9;
    }
  },

  // ── Tap / pulse ─────────────────────────────────────────────────────────────
  _triggerPulse(nodeIdx) {
    // BFS from nodeIdx, propagating excitement with timed delays
    const DELAY_PER_HOP = 140; // ms
    const visited = new Set([nodeIdx]);
    const queue = [{ idx: nodeIdx, depth: 0 }];

    const exciteNode = (idx, depth) => {
      setTimeout(() => {
        if (!this._nodes[idx]) return;
        this._nodes[idx].excite = 1.0;
        // Also brighten edges connected to this node
        for (const e of this._edges) {
          if ((e.fromIdx === idx || e.toIdx === idx) && !e.fadeOut) {
            e.bright = 1.0;
          }
        }
      }, depth * DELAY_PER_HOP);
    };

    while (queue.length > 0) {
      const { idx, depth } = queue.shift();
      exciteNode(idx, depth);
      if (depth >= 2) continue; // propagate 2 hops
      for (const nb of this._adj[idx]) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push({ idx: nb, depth: depth + 1 });
        }
      }
    }
  },

  _pickNode(normalizedX, normalizedY) {
    // normalizedX/Y in [-1, 1]
    this._mouse.set(normalizedX, normalizedY);
    this._raycaster.setFromCamera(this._mouse, this._camera);

    const meshes = this._nodes.map(n => n.mesh);
    const hits = this._raycaster.intersectObjects(meshes);
    if (hits.length > 0) {
      return meshes.indexOf(hits[0].object);
    }

    // Fallback: find nearest node within angular tolerance
    const ray = this._raycaster.ray;
    let bestIdx = -1;
    let bestDist = 0.6; // max screen-space tolerance
    for (let i = 0; i < this._nodes.length; i++) {
      const d = ray.distanceToPoint(this._nodes[i].mesh.position);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
  },

  // ── Pointer handling ────────────────────────────────────────────────────────
  _bindPointer(canvas) {
    const c = this._container;
    const DRAG_THRESHOLD = 8; // px

    this._onPointerDown = (e) => {
      this._isDragging = false;
      this._pointerStart = { x: e.clientX, y: e.clientY };
      this._lastPointer  = { x: e.clientX, y: e.clientY };
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
    };

    this._onPointerMove = (e) => {
      if (!this._lastPointer) return;
      const dx = e.clientX - this._lastPointer.x;
      const dy = e.clientY - this._lastPointer.y;

      // Check if we crossed drag threshold
      const totalDx = e.clientX - this._pointerStart.x;
      const totalDy = e.clientY - this._pointerStart.y;
      if (Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD) {
        this._isDragging = true;
      }

      if (this._isDragging) {
        this._cameraTheta -= dx * 0.007;
        this._cameraPhi   -= dy * 0.007;
        // Clamp phi so camera doesn't flip
        this._cameraPhi = Math.max(0.15, Math.min(Math.PI - 0.15, this._cameraPhi));
        this._updateCameraPosition(this._camera);
      }

      this._lastPointer = { x: e.clientX, y: e.clientY };
    };

    this._onPointerUp = (e) => {
      if (!this._isDragging && this._pointerStart) {
        // It was a tap — find node
        const rect = c.getBoundingClientRect();
        const nx = ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const idx = this._pickNode(nx, ny);
        if (idx !== -1) {
          this._triggerPulse(idx);
        } else {
          // No node hit — excite nearest anyway for mobile friendliness
          const closest = this._nearestNodeToScreen(nx, ny);
          if (closest !== -1) this._triggerPulse(closest);
        }
      }
      this._isDragging  = false;
      this._pointerStart = null;
      this._lastPointer  = null;
    };

    c.addEventListener('pointerdown',   this._onPointerDown);
    c.addEventListener('pointermove',   this._onPointerMove);
    c.addEventListener('pointerup',     this._onPointerUp);
    c.addEventListener('pointercancel', this._onPointerUp);
  },

  _nearestNodeToScreen(nx, ny) {
    // Project each node to NDC and find nearest to tap point
    const THREE = window.THREE;
    const proj = new THREE.Vector3();
    let bestIdx = -1;
    let bestD = 0.25; // NDC threshold (~12% of screen)
    for (let i = 0; i < this._nodes.length; i++) {
      proj.copy(this._nodes[i].mesh.position).project(this._camera);
      const d = Math.hypot(proj.x - nx, proj.y - ny);
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    return bestIdx;
  },

  // ── Camera ──────────────────────────────────────────────────────────────────
  _updateCameraPosition(camera) {
    if (!camera) return;
    const r = this._cameraRadius;
    camera.position.set(
      r * Math.sin(this._cameraPhi) * Math.cos(this._cameraTheta),
      r * Math.cos(this._cameraPhi),
      r * Math.sin(this._cameraPhi) * Math.sin(this._cameraTheta)
    );
    camera.lookAt(0, 0, 0);
  },
};
