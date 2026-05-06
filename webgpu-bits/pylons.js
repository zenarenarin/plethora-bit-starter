import * as THREE from "three/webgpu";
import {
  Fn, uniform, storage, instanceIndex,
  vec2, vec3, vec4, cos, dot, step, min, max,
  abs, float, fract, floor, positionLocal, select,
  pass, mrt, output, normalView, Loop, exp, log, negate,
} from "three/tsl";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

// ── Simplex noise (McEwan / Gustavson / Ashima Arts) ────────────────────────

const mod289 = (x) => x.sub(floor(x.mul(1.0 / 289.0)).mul(289.0));
const permute = (x) => mod289(x.mul(34.0).add(10.0).mul(x));
const taylorInvSqrt = (r) => float(1.79284291400159).sub(r.mul(0.85373472095314));

const simplexNoise = Fn(([v]) => {
  const C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const D = vec4(0.0, 0.5, 1.0, 2.0);
  const i  = floor(vec3(v).add(dot(vec3(v), vec3(C.y, C.y, C.y))));
  const x0 = vec3(v).sub(i).add(dot(i, vec3(C.x, C.x, C.x)));
  const g  = step(vec3(x0.y, x0.z, x0.x), x0);
  const l  = vec3(1.0).sub(g);
  const i1 = min(g, vec3(l.z, l.x, l.y));
  const i2 = max(g, vec3(l.z, l.x, l.y));
  const x1 = x0.sub(i1).add(C.x);
  const x2 = x0.sub(i2).add(C.y);
  const x3 = x0.sub(0.5);
  const im = mod289(i);
  const p  = permute(
    permute(
      permute(vec4(im.z, im.z, im.z, im.z).add(vec4(0.0, i1.z, i2.z, 1.0)))
        .add(vec4(im.y, im.y, im.y, im.y)).add(vec4(0.0, i1.y, i2.y, 1.0)),
    ).add(vec4(im.x, im.x, im.x, im.x)).add(vec4(0.0, i1.x, i2.x, 1.0)),
  );
  const n_  = float(1.0 / 7.0);
  const ns  = vec3(n_.mul(D.w), n_.mul(D.y).sub(1.0), n_.mul(D.z));
  const j   = p.sub(float(49.0).mul(floor(p.mul(ns.z).mul(ns.z))));
  const x_  = floor(j.mul(ns.z));
  const y_  = floor(j.sub(float(7.0).mul(x_)));
  const gx  = x_.mul(ns.x).add(ns.y);
  const gy  = y_.mul(ns.x).add(ns.y);
  const h   = float(1.0).sub(abs(gx)).sub(abs(gy));
  const b0  = vec4(gx.x, gx.y, gy.x, gy.y);
  const b1  = vec4(gx.z, gx.w, gy.z, gy.w);
  const s0  = floor(b0).mul(2.0).add(1.0);
  const s1  = floor(b1).mul(2.0).add(1.0);
  const sh  = step(h, vec4(0.0)).negate();
  const a0  = vec4(b0.x, b0.z, b0.y, b0.w).add(
    vec4(s0.x, s0.z, s0.y, s0.w).mul(vec4(sh.x, sh.x, sh.y, sh.y)),
  );
  const a1  = vec4(b1.x, b1.z, b1.y, b1.w).add(
    vec4(s1.x, s1.z, s1.y, s1.w).mul(vec4(sh.z, sh.z, sh.w, sh.w)),
  );
  const p0 = vec3(a0.x, a0.y, h.x);
  const p1 = vec3(a0.z, a0.w, h.y);
  const p2 = vec3(a1.x, a1.y, h.z);
  const p3 = vec3(a1.z, a1.w, h.w);
  const norm = taylorInvSqrt(
    vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)),
  );
  const m = max(
    float(0.6).sub(vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3))),
    0.0,
  );
  const m2 = m.mul(m);
  return float(42.0)
    .mul(dot(m2.mul(m2), vec4(dot(p0.mul(norm.x), x0), dot(p1.mul(norm.y), x1), dot(p2.mul(norm.z), x2), dot(p3.mul(norm.w), x3))))
    .mul(0.5).add(0.5);
});

const makeFBM = (noiseFn, { octaves = 6, lacunarity = 2.0, gain = 0.5 } = {}) =>
  Fn(([p]) => {
    const value     = float(0).toVar();
    const amplitude = float(0.5).toVar();
    const pos       = vec3(p).toVar();
    Loop(octaves, () => {
      value.addAssign(noiseFn(pos).mul(amplitude));
      pos.mulAssign(lacunarity);
      amplitude.mulAssign(gain);
    });
    return value;
  });

const palette = Fn(([t, a, b, c, d]) => {
  const _a = a ?? vec3(0.5, 0.5, 0.5);
  const _b = b ?? vec3(0.5, 0.5, 0.5);
  const _c = c ?? vec3(1.0, 1.0, 1.0);
  const _d = d ?? vec3(0.0, 0.33, 0.67);
  return _a.add(_b.mul(cos(_c.mul(t).add(_d).mul(6.28318))));
});

const fbmNoise = makeFBM(simplexNoise);

// ── Plethora bit ─────────────────────────────────────────────────────────────

window.plethoraBit = {
  meta: {
    title: 'pylons',
    author: 'plethora',
    description: 'A field of glowing pylons animated by noise.',
    tags: ['creative'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;

    if (!navigator.gpu) {
      const canvas = ctx.createCanvas2D();
      const g = canvas.getContext('2d');
      g.fillStyle = '#07080e';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff';
      g.font = `${H * 0.04}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('WebGPU not supported on this device', W / 2, H / 2);
      ctx.platform.ready();
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07080e);
    scene.fog = new THREE.Fog(0x07080e, 18, 55);

    // Portrait-friendly: elevated angle, centred, field fills the tall screen
    const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 300);
    camera.position.set(0, 16, 20);
    camera.lookAt(0, 0, -2);

    const renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(ctx.dpr, 2));
    renderer.setSize(W, H);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    ctx.container.appendChild(renderer.domElement);
    await renderer.init();

    ctx.onDestroy(() => {
      renderer.dispose();
      renderer.domElement.remove();
    });

    // ── Uniforms ──────────────────────────────────────────────────────────────
    const fieldRadiusU   = uniform(9);   // X semi-axis
    const fieldRadiusZU  = uniform(15);  // Z semi-axis — stretch into depth for portrait
    const pylonRadiusU   = uniform(0.31);
    const maxHeightU     = uniform(8);
    const noiseScaleU    = uniform(0.28);
    const noiseOffsetXU  = uniform(1);
    const noiseOffsetYU  = uniform(0);
    const noiseOffsetZU  = uniform(0);
    const circularU      = uniform(1);

    // ── Grid helpers ──────────────────────────────────────────────────────────
    let GRID = 0, COUNT = 0;
    let heightBuffer, colorBuffer, heightStorage, colorStorage;
    let computeNode = null, pylonMesh = null;

    const cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1);

    function computeGrid() {
      const MAX = Math.floor(Math.sqrt(200_000));
      const desired = Math.round(fieldRadiusU.value / pylonRadiusU.value) + 1;
      return Math.min(MAX, Math.max(3, desired));
    }

    function buildComputeNode(count) {
      return Fn(() => {
        const idxF = float(instanceIndex);
        const col  = idxF.mod(float(GRID));
        const row  = floor(idxF.div(float(GRID)));
        const nx   = col.div(float(GRID - 1)).mul(2.0).sub(1.0);
        const nz   = row.div(float(GRID - 1)).mul(2.0).sub(1.0);
        // Ellipse test in normalised space: (nx/1)² + (nz/1)² ≤ 1 stays the same,
        // but world positions use separate X/Z radii so the shape becomes an ellipse.
        const inside = nx.mul(nx).add(nz.mul(nz)).lessThanEqual(float(1));
        const active = inside.or(circularU.lessThan(float(0.5)));
        const noiseIn = vec3(
          nx.mul(fieldRadiusU).mul(noiseScaleU).add(noiseOffsetXU),
          noiseOffsetYU,
          nz.mul(fieldRadiusZU).mul(noiseScaleU).mul(0.65).add(noiseOffsetZU),
        ).toVar();
        const n = simplexNoise(noiseIn.mul(0.5)).pow(2);
        heightStorage.element(instanceIndex).assign(
          select(active, n.mul(maxHeightU).add(0.04), float(0)),
        );
        const t   = fract(n.mul(0.08).mul(maxHeightU).add(0.5));
        const rgb = palette(t, vec3(0.5, 0.55, 0.5), vec3(0.5), vec3(0.5, 0.4, 0.3), vec3(0.2));
        colorStorage.element(instanceIndex).assign(
          vec4(select(active, rgb, vec3(0, 0, 0)), float(1)),
        );
      })().compute(count);
    }

    function buildMaterial() {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.9 });
      mat.positionNode = Fn(() => {
        const h   = heightStorage.element(instanceIndex);
        const pos = positionLocal.toVar();
        pos.x.assign(pos.x.mul(pylonRadiusU));
        pos.z.assign(pos.z.mul(pylonRadiusU));
        pos.y.assign(pos.y.add(0.5).mul(h));
        return pos;
      })();
      mat.colorNode     = Fn(() => colorStorage.element(instanceIndex))();
      mat.roughnessNode = Fn(() => colorStorage.element(instanceIndex).b.add(0.3))();
      mat.metalnessNode = Fn(() => colorStorage.element(instanceIndex).b.add(0.3))();
      return mat;
    }

    function updateInstanceMatrices() {
      if (!pylonMesh) return;
      const mat = new THREE.Matrix4();
      for (let i = 0; i < COUNT; i++) {
        const col  = i % GRID;
        const row  = Math.floor(i / GRID);
        const nx   = (col / (GRID - 1)) * 2 - 1;
        const nz   = (row / (GRID - 1)) * 2 - 1;
        const dist = Math.sqrt(nx * nx + nz * nz);
        mat.setPosition(nx * fieldRadiusU.value, dist > 1 ? -500 : 0, nz * fieldRadiusZU.value);
        pylonMesh.setMatrixAt(i, mat);
      }
      pylonMesh.instanceMatrix.needsUpdate = true;
    }

    function rebuild() {
      const newGRID = computeGrid();
      if (newGRID === GRID && pylonMesh) { updateInstanceMatrices(); return; }
      GRID  = newGRID;
      COUNT = GRID * GRID;
      heightBuffer  = new THREE.StorageBufferAttribute(COUNT, 1);
      colorBuffer   = new THREE.StorageBufferAttribute(COUNT, 4);
      heightStorage = storage(heightBuffer, 'float', COUNT);
      colorStorage  = storage(colorBuffer, 'vec4', COUNT);
      computeNode   = buildComputeNode(COUNT);
      if (pylonMesh) { scene.remove(pylonMesh); pylonMesh.material.dispose(); }
      pylonMesh = new THREE.InstancedMesh(cyl, buildMaterial(), COUNT);
      pylonMesh.castShadow = true;
      pylonMesh.receiveShadow = true;
      pylonMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(pylonMesh);
      updateInstanceMatrices();
    }

    rebuild();

    // ── Ground + lights ───────────────────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x0d0f18, roughness: 0.95, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    ground.receiveShadow = true;
    scene.add(ground);

    const sun = new THREE.DirectionalLight(0xffffff, 9);
    sun.castShadow = true;
    sun.position.set(30, 30, 42);
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.05;
    sun.shadow.camera.far  = 1000;
    sun.shadow.radius = 2;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -50;
    sun.shadow.camera.right = sun.shadow.camera.top   =  50;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    const back = new THREE.DirectionalLight(0x998877, 6.5);
    back.position.set(-10, 8, -12);
    scene.add(back);
    scene.add(new THREE.AmbientLight(0x223355, 3));

    // ── Post-processing ───────────────────────────────────────────────────────
    const scenePass   = pass(scene, camera);
    scenePass.setMRT(mrt({ output, normal: normalView }));
    const sceneColor  = scenePass.getTextureNode('output');
    const sceneNormal = scenePass.getTextureNode('normal');
    const sceneDepth  = scenePass.getTextureNode('depth');

    const aoEffect = ao(sceneDepth, sceneNormal, camera);
    aoEffect.resolutionScale = 0.5;
    aoEffect.radius.value    = 0.5;
    const aoColor    = aoEffect.getTextureNode().r.mul(sceneColor);
    const bloomEffect = bloom(aoColor, 0.9, 0.5, 0.7);
    const postProcessing = new THREE.PostProcessing(renderer);
    postProcessing.outputNode = sceneColor.add(bloomEffect);

    // ── Touch / drag ──────────────────────────────────────────────────────────
    let isDragging = false, dragX = 0, dragY = 0, velX = 0, velY = 0;
    let touched = false;

    ctx.listen(renderer.domElement, 'touchstart', (e) => {
      e.preventDefault();
      isDragging = true; velX = velY = 0;
      dragX = e.changedTouches[0].clientX;
      dragY = e.changedTouches[0].clientY;
      if (!touched) { touched = true; ctx.platform.start(); }
    }, { passive: false });

    ctx.listen(renderer.domElement, 'touchmove', (e) => {
      e.preventDefault();
      if (!isDragging) return;
      const dx = e.changedTouches[0].clientX - dragX;
      const dy = e.changedTouches[0].clientY - dragY;
      dragX = e.changedTouches[0].clientX;
      dragY = e.changedTouches[0].clientY;
      velX = dx * 0.01;
      velY = dy * 0.01;
      noiseOffsetXU.value -= velX;
      noiseOffsetZU.value -= velY;
    }, { passive: false });

    ctx.listen(renderer.domElement, 'touchend', (e) => {
      e.preventDefault();
      isDragging = false;
    }, { passive: false });

    // ── Animation loop ────────────────────────────────────────────────────────
    let lastTime = performance.now();

    ctx.raf((dt) => {
      noiseOffsetYU.value += (dt / 1000) * 0.22;

      if (!isDragging && (velX !== 0 || velY !== 0)) {
        const decay = Math.pow(0.04, dt / 1000);
        velX *= decay; velY *= decay;
        noiseOffsetXU.value -= velX;
        noiseOffsetZU.value -= velY;
      }

      if (computeNode) renderer.computeAsync(computeNode).then(() => postProcessing.renderAsync());
      else postProcessing.renderAsync();
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
