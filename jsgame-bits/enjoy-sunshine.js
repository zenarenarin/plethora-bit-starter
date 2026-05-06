// ENJOY THE SUNSHINE — Ambient Nature Scene (Plethora Bit)

function roundRectC(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

window.plethoraBit = {
  meta: {
    title: 'Enjoy The Sunshine',
    author: 'plethora',
    description: 'Sit. Breathe. Enjoy.',
    tags: ['creative'],
    permissions: ['audio', 'haptics'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom || 0;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const ACCENT = '#FFD740';

    // ── Audio ────────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) {
        audioCtx = new AudioContext();
        startWind();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    let windGain = null;
    function startWind() {
      if (!audioCtx) return;
      const bufSize = audioCtx.sampleRate * 2;
      const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lpf = audioCtx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 400;
      windGain = audioCtx.createGain();
      windGain.gain.value = 0.04;
      src.connect(lpf);
      lpf.connect(windGain);
      windGain.connect(audioCtx.destination);
      src.start();
    }

    function playTone(freq, type, dur, vol = 0.1, attack = 0.01, release = 0.3) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const env = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      env.gain.setValueAtTime(0, audioCtx.currentTime);
      env.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + attack);
      env.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + attack + release);
      o.connect(env);
      env.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + attack + release + 0.05);
    }

    function playChord(freqs, dur = 1.2, vol = 0.07) {
      freqs.forEach((f, i) => {
        ctx.timeout(() => playTone(f, 'sine', dur, vol, 0.05, dur * 0.8), i * 60);
      });
    }

    function playBirdChirp() {
      const base = 1800 + Math.random() * 800;
      playTone(base, 'sine', 0.08, 0.08, 0.005, 0.06);
      ctx.timeout(() => playTone(base * 1.15, 'sine', 0.06, 0.06, 0.005, 0.05), 80);
      ctx.timeout(() => playTone(base * 0.92, 'sine', 0.1, 0.05, 0.005, 0.08), 160);
    }

    function playLeafRustle() {
      for (let i = 0; i < 5; i++) {
        ctx.timeout(() => {
          const f = 600 + Math.random() * 1200;
          playTone(f, 'triangle', 0.05, 0.04, 0.002, 0.04);
        }, i * 30);
      }
    }

    function playFlowerBloom() {
      playChord([261.6, 329.6, 392, 523.2], 1.5, 0.06);
    }

    function playSunFlare() {
      playTone(440, 'sine', 1.0, 0.1, 0.08, 0.8);
      ctx.timeout(() => playTone(660, 'sine', 0.8, 0.07, 0.05, 0.6), 150);
      ctx.timeout(() => playTone(880, 'sine', 0.6, 0.05, 0.03, 0.5), 280);
    }

    // ── Time & Progress ──────────────────────────────────────────────────────
    const TOTAL_DURATION = 90000; // 90s full cycle
    let elapsed = 0;
    let wellnessScore = 0;
    let started = false;
    let showInfo = false;

    // ── Sun path ─────────────────────────────────────────────────────────────
    const SUN_R = Math.min(W, H) * 0.09;
    function getSunPos(t) {
      // t: 0→1. arc from bottom-left → top → bottom-right
      const angle = Math.PI + t * Math.PI; // PI → 2PI
      const cx = W * 0.5;
      const cy = H * 0.55;
      const rx = W * 0.42;
      const ry = H * 0.48;
      return {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      };
    }

    // ── Sky color interpolation ───────────────────────────────────────────────
    // 0=dawn, 0.2=morning, 0.5=noon, 0.8=afternoon, 1=dusk
    const SKY_STOPS = [
      // [t, topColor, horizColor]
      [0.0,  '#0d1b2a', '#c97a4e'],
      [0.15, '#1a2a4a', '#e8905a'],
      [0.35, '#1e3a6e', '#4a90e2'],
      [0.5,  '#1a3358', '#2e7cbf'],
      [0.65, '#1e3a6e', '#4a90e2'],
      [0.85, '#1a2a4a', '#e8905a'],
      [1.0,  '#0d1b2a', '#7a3a1e'],
    ];
    function lerpColor(c1, c2, t) {
      const p = (s) => parseInt(s, 16);
      const r1 = p(c1.slice(1, 3)), g1 = p(c1.slice(3, 5)), b1 = p(c1.slice(5, 7));
      const r2 = p(c2.slice(1, 3)), g2 = p(c2.slice(3, 5)), b2 = p(c2.slice(5, 7));
      const r = Math.round(r1 + (r2 - r1) * t);
      const gg = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r},${gg},${b})`;
    }
    function getSkyColors(progress) {
      for (let i = 0; i < SKY_STOPS.length - 1; i++) {
        const a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
        if (progress >= a[0] && progress <= b[0]) {
          const t = (progress - a[0]) / (b[0] - a[0]);
          return {
            top: lerpColor(a[1], b[1], t),
            horizon: lerpColor(a[2], b[2], t),
          };
        }
      }
      return { top: SKY_STOPS[0][1], horizon: SKY_STOPS[0][2] };
    }

    // ── Clouds ────────────────────────────────────────────────────────────────
    const clouds = [];
    function spawnCloud(x, y, burst = false) {
      clouds.push({
        x: x !== undefined ? x : W + 80,
        y: y !== undefined ? y : H * 0.08 + Math.random() * H * 0.22,
        w: 60 + Math.random() * 80,
        h: 20 + Math.random() * 25,
        speed: 0.2 + Math.random() * 0.3,
        alpha: burst ? 0 : 0.6 + Math.random() * 0.35,
        growing: burst,
        age: 0,
      });
    }
    // seed initial clouds
    for (let i = 0; i < 4; i++) spawnCloud(-Math.random() * W, undefined);

    function updateClouds(dt) {
      for (const c of clouds) {
        c.x -= c.speed * dt * 0.03;
        c.age += dt;
        if (c.growing) {
          c.alpha = Math.min(0.75, c.alpha + dt * 0.002);
          c.w = Math.min(c.w + dt * 0.05, 130);
        }
      }
      // remove off-screen
      for (let i = clouds.length - 1; i >= 0; i--) {
        if (clouds[i].x + clouds[i].w + 40 < 0) clouds.splice(i, 1);
      }
      // spawn new if sparse
      if (clouds.length < 5 && Math.random() < 0.002) spawnCloud();
    }

    function drawCloud(c) {
      g.save();
      g.globalAlpha = c.alpha;
      g.fillStyle = '#e8f4ff';
      const x = c.x, y = c.y, w = c.w, h = c.h;
      // puffball cloud shape
      g.beginPath();
      g.arc(x + w * 0.3, y + h * 0.6, h * 0.6, 0, Math.PI * 2);
      g.arc(x + w * 0.55, y + h * 0.4, h * 0.75, 0, Math.PI * 2);
      g.arc(x + w * 0.75, y + h * 0.6, h * 0.55, 0, Math.PI * 2);
      g.arc(x + w * 0.15, y + h * 0.7, h * 0.45, 0, Math.PI * 2);
      g.arc(x + w * 0.9, y + h * 0.7, h * 0.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // ── Birds ─────────────────────────────────────────────────────────────────
    const birds = [];
    function spawnBirdFlock(ox, oy) {
      const count = 5 + Math.floor(Math.random() * 6);
      for (let i = 0; i < count; i++) {
        birds.push({
          x: ox + (Math.random() - 0.5) * 60,
          y: oy + (Math.random() - 0.5) * 40,
          vx: 1.2 + Math.random() * 0.8,
          vy: -0.3 + Math.random() * 0.6,
          wing: Math.random() * Math.PI * 2,
          wingSpeed: 0.05 + Math.random() * 0.04,
          size: 3 + Math.random() * 3,
        });
      }
    }

    function updateBirds(dt) {
      for (const b of birds) {
        b.x += b.vx * dt * 0.05;
        b.y += b.vy * dt * 0.03;
        b.wing += b.wingSpeed * dt;
      }
      for (let i = birds.length - 1; i >= 0; i--) {
        if (birds[i].x > W + 40) birds.splice(i, 1);
      }
    }

    function drawBird(b) {
      const flap = Math.sin(b.wing) * b.size * 1.2;
      g.save();
      g.strokeStyle = 'rgba(30,30,30,0.7)';
      g.lineWidth = 1.2;
      g.beginPath();
      // left wing arc
      g.moveTo(b.x, b.y);
      g.quadraticCurveTo(b.x - b.size * 0.8, b.y - flap, b.x - b.size * 1.6, b.y);
      // right wing arc
      g.moveTo(b.x, b.y);
      g.quadraticCurveTo(b.x + b.size * 0.8, b.y - flap, b.x + b.size * 1.6, b.y);
      g.stroke();
      g.restore();
    }

    // ── Leaves ────────────────────────────────────────────────────────────────
    const leaves = [];
    const treeX = W * 0.35;
    const treeTopY = H * 0.3;

    function spawnLeaves(ox, oy) {
      for (let i = 0; i < 22; i++) {
        leaves.push({
          x: ox + (Math.random() - 0.5) * 70,
          y: oy + (Math.random() - 0.5) * 50,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -0.5 + Math.random() * 0.3,
          rot: Math.random() * Math.PI * 2,
          rotV: (Math.random() - 0.5) * 0.08,
          size: 4 + Math.random() * 5,
          color: ['#4a7c3f', '#5a9c4a', '#3d6b35', '#6ab04c', '#8bc34a'][Math.floor(Math.random() * 5)],
          life: 1,
          gravity: 0.012 + Math.random() * 0.008,
        });
      }
    }

    function updateLeaves(dt) {
      for (const l of leaves) {
        l.x += l.vx * dt * 0.05;
        l.vy += l.gravity * dt * 0.05;
        l.y += l.vy * dt * 0.05;
        l.rot += l.rotV * dt;
        l.vx *= 0.998;
        l.life -= 0.003 * dt * 0.05;
      }
      for (let i = leaves.length - 1; i >= 0; i--) {
        if (leaves[i].life <= 0 || leaves[i].y > H - SAFE) leaves.splice(i, 1);
      }
    }

    function drawLeaf(l) {
      g.save();
      g.globalAlpha = Math.max(0, l.life);
      g.translate(l.x, l.y);
      g.rotate(l.rot);
      g.fillStyle = l.color;
      g.beginPath();
      g.ellipse(0, 0, l.size, l.size * 0.55, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // ── Flowers ───────────────────────────────────────────────────────────────
    const flowers = [];

    function spawnFlower(x, y) {
      flowers.push({
        x, y,
        scale: 0,
        targetScale: 0.7 + Math.random() * 0.5,
        petals: 5 + Math.floor(Math.random() * 3),
        color: ['#FF6B9D', '#FFD740', '#FF8C42', '#E91E8C', '#C8E6C9'][Math.floor(Math.random() * 5)],
        centerColor: '#fff176',
        rot: Math.random() * Math.PI * 2,
        size: 7 + Math.random() * 8,
        life: 1,
        age: 0,
      });
    }

    function updateFlowers(dt) {
      for (const f of flowers) {
        f.scale += (f.targetScale - f.scale) * 0.08 * dt * 0.05;
        f.age += dt;
        if (f.age > 8000) f.life -= 0.0005 * dt * 0.05;
      }
      for (let i = flowers.length - 1; i >= 0; i--) {
        if (flowers[i].life <= 0) flowers.splice(i, 1);
        if (flowers.length > 30) flowers.splice(0, 1);
      }
    }

    function drawFlower(f) {
      g.save();
      g.globalAlpha = Math.max(0, f.life);
      g.translate(f.x, f.y);
      g.scale(f.scale, f.scale);
      g.rotate(f.rot);
      // stem
      g.strokeStyle = '#4caf50';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, f.size * 1.4);
      g.stroke();
      // petals
      for (let p = 0; p < f.petals; p++) {
        const angle = (p / f.petals) * Math.PI * 2;
        g.save();
        g.rotate(angle);
        g.fillStyle = f.color;
        g.beginPath();
        g.ellipse(0, -f.size * 0.8, f.size * 0.4, f.size * 0.6, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // center
      g.fillStyle = f.centerColor;
      g.beginPath();
      g.arc(0, 0, f.size * 0.3, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // ── Sun flare particles ───────────────────────────────────────────────────
    const flares = [];
    function spawnSunFlare(sx, sy) {
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const speed = 1.5 + Math.random() * 2.5;
        flares.push({
          x: sx, y: sy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: 3 + Math.random() * 5,
          color: i % 2 === 0 ? '#FFD740' : '#FFA726',
        });
      }
    }

    function updateFlares(dt) {
      for (const f of flares) {
        f.x += f.vx * dt * 0.06;
        f.y += f.vy * dt * 0.06;
        f.life -= 0.025 * dt * 0.05;
        f.size *= 0.995;
      }
      for (let i = flares.length - 1; i >= 0; i--) {
        if (flares[i].life <= 0) flares.splice(i, 1);
      }
    }

    function drawFlares() {
      for (const f of flares) {
        g.save();
        g.globalAlpha = Math.max(0, f.life) * 0.8;
        g.fillStyle = f.color;
        g.beginPath();
        g.arc(f.x, f.y, f.size, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }

    // ── Tap feedback pulse ────────────────────────────────────────────────────
    const pulses = [];
    function addPulse(x, y, color) {
      pulses.push({ x, y, r: 10, maxR: 55, life: 1, color });
    }
    function updatePulses(dt) {
      for (const p of pulses) {
        p.r += (p.maxR - p.r) * 0.08 * dt * 0.05;
        p.life -= 0.04 * dt * 0.05;
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        if (pulses[i].life <= 0) pulses.splice(i, 1);
      }
    }
    function drawPulses() {
      for (const p of pulses) {
        g.save();
        g.globalAlpha = Math.max(0, p.life) * 0.5;
        g.strokeStyle = p.color;
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }

    // ── Ray angle ─────────────────────────────────────────────────────────────
    let rayAngle = 0;

    // ── Draw scene ────────────────────────────────────────────────────────────
    function drawSky(progress) {
      const { top, horizon } = getSkyColors(progress);
      const grad = g.createLinearGradient(0, 0, 0, H * 0.72);
      grad.addColorStop(0, top);
      grad.addColorStop(1, horizon);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H * 0.72);
    }

    function drawHills() {
      // Hill layer 1 — far, darker
      g.fillStyle = '#2e5a2e';
      g.beginPath();
      g.moveTo(0, H * 0.62);
      g.bezierCurveTo(W * 0.1, H * 0.48, W * 0.25, H * 0.52, W * 0.4, H * 0.5);
      g.bezierCurveTo(W * 0.55, H * 0.48, W * 0.65, H * 0.55, W * 0.8, H * 0.52);
      g.bezierCurveTo(W * 0.9, H * 0.5, W * 0.95, H * 0.54, W, H * 0.56);
      g.lineTo(W, H);
      g.lineTo(0, H);
      g.closePath();
      g.fill();

      // Hill layer 2 — mid
      g.fillStyle = '#3a7a3a';
      g.beginPath();
      g.moveTo(0, H * 0.7);
      g.bezierCurveTo(W * 0.15, H * 0.58, W * 0.3, H * 0.63, W * 0.45, H * 0.6);
      g.bezierCurveTo(W * 0.6, H * 0.57, W * 0.7, H * 0.64, W * 0.85, H * 0.61);
      g.bezierCurveTo(W * 0.92, H * 0.59, W * 0.97, H * 0.63, W, H * 0.65);
      g.lineTo(W, H);
      g.lineTo(0, H);
      g.closePath();
      g.fill();

      // Hill layer 3 — near ground
      g.fillStyle = '#4a9040';
      g.beginPath();
      g.moveTo(0, H * 0.78);
      g.bezierCurveTo(W * 0.2, H * 0.7, W * 0.4, H * 0.75, W * 0.6, H * 0.72);
      g.bezierCurveTo(W * 0.75, H * 0.7, W * 0.88, H * 0.74, W, H * 0.72);
      g.lineTo(W, H);
      g.lineTo(0, H);
      g.closePath();
      g.fill();
    }

    function drawGround() {
      // flat ground plane
      const grad = g.createLinearGradient(0, H * 0.72, 0, H - SAFE);
      grad.addColorStop(0, '#5aaa4a');
      grad.addColorStop(0.4, '#4a9040');
      grad.addColorStop(1, '#3a7832');
      g.fillStyle = grad;
      g.fillRect(0, H * 0.72, W, H - H * 0.72);

      // subtle grass blades hint
      g.strokeStyle = 'rgba(90,160,70,0.35)';
      g.lineWidth = 1;
      for (let gx = 10; gx < W; gx += 14) {
        const gy = H * 0.72;
        g.beginPath();
        g.moveTo(gx, gy);
        g.quadraticCurveTo(gx + 3, gy - 6, gx + 1, gy - 10);
        g.stroke();
      }
    }

    function drawSun(pos, progress) {
      // brightness based on height in sky
      const brightness = 0.5 + 0.5 * (1 - Math.abs(progress - 0.5) * 2);
      const sunAlpha = Math.max(0.3, brightness);

      // outer glow
      const glow = g.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, SUN_R * 3.5);
      glow.addColorStop(0, `rgba(255, 220, 100, ${0.25 * sunAlpha})`);
      glow.addColorStop(0.4, `rgba(255, 180, 50, ${0.12 * sunAlpha})`);
      glow.addColorStop(1, 'rgba(255, 150, 30, 0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(pos.x, pos.y, SUN_R * 3.5, 0, Math.PI * 2);
      g.fill();

      // rays
      g.save();
      g.translate(pos.x, pos.y);
      g.rotate(rayAngle);
      g.strokeStyle = `rgba(255, 220, 80, ${0.35 * sunAlpha})`;
      g.lineWidth = 2;
      const rayCount = 12;
      for (let i = 0; i < rayCount; i++) {
        const a = (i / rayCount) * Math.PI * 2;
        const r1 = SUN_R * 1.3;
        const r2 = SUN_R * (2.0 + 0.4 * Math.sin(i * 1.7));
        g.beginPath();
        g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        g.stroke();
      }
      g.restore();

      // sun body radial gradient
      const sunGrad = g.createRadialGradient(
        pos.x - SUN_R * 0.2, pos.y - SUN_R * 0.2, SUN_R * 0.1,
        pos.x, pos.y, SUN_R
      );
      sunGrad.addColorStop(0, `rgba(255, 255, 200, ${sunAlpha})`);
      sunGrad.addColorStop(0.6, `rgba(255, 215, 80, ${sunAlpha})`);
      sunGrad.addColorStop(1, `rgba(255, 160, 30, ${sunAlpha * 0.9})`);
      g.fillStyle = sunGrad;
      g.beginPath();
      g.arc(pos.x, pos.y, SUN_R, 0, Math.PI * 2);
      g.fill();
    }

    function drawTree() {
      const bx = treeX;
      const by = H * 0.73;
      const trunkH = H * 0.18;
      const trunkW = W * 0.025;

      // trunk
      const trunkGrad = g.createLinearGradient(bx - trunkW, 0, bx + trunkW, 0);
      trunkGrad.addColorStop(0, '#3e2008');
      trunkGrad.addColorStop(0.4, '#6b3a12');
      trunkGrad.addColorStop(1, '#3e2008');
      g.fillStyle = trunkGrad;
      g.beginPath();
      g.moveTo(bx - trunkW, by);
      g.bezierCurveTo(bx - trunkW * 1.1, by - trunkH * 0.5, bx - trunkW * 0.8, by - trunkH * 0.8, bx, by - trunkH);
      g.bezierCurveTo(bx + trunkW * 0.8, by - trunkH * 0.8, bx + trunkW * 1.1, by - trunkH * 0.5, bx + trunkW, by);
      g.closePath();
      g.fill();

      // foliage — layered blobs
      const foliageColors = ['#2d5a1e', '#3d7a28', '#4a9030', '#5aaa3a'];
      const blobs = [
        { dx: 0, dy: 0, r: W * 0.14 },
        { dx: -W * 0.08, dy: H * 0.04, r: W * 0.1 },
        { dx: W * 0.09, dy: H * 0.03, r: W * 0.095 },
        { dx: -W * 0.04, dy: -H * 0.06, r: W * 0.09 },
        { dx: W * 0.03, dy: -H * 0.07, r: W * 0.085 },
      ];
      blobs.forEach((b, i) => {
        const c = foliageColors[Math.min(i, foliageColors.length - 1)];
        g.fillStyle = c;
        g.beginPath();
        g.arc(bx + b.dx, treeTopY + b.dy, b.r, 0, Math.PI * 2);
        g.fill();
      });

      // leaf highlights
      g.fillStyle = 'rgba(120, 200, 80, 0.2)';
      g.beginPath();
      g.arc(bx - W * 0.03, treeTopY - H * 0.05, W * 0.07, 0, Math.PI * 2);
      g.fill();
    }

    function drawPerson() {
      // seated person silhouette under tree
      const px = treeX + W * 0.07;
      const py = H * 0.73;
      const scale = H * 0.001;

      g.fillStyle = '#1a1008';

      // body / torso (leaning back slightly)
      g.beginPath();
      g.save();
      g.translate(px, py);
      // legs stretched out
      g.fillStyle = '#1a1008';
      g.beginPath();
      g.ellipse(14 * scale * 8, -8 * scale * 8, 22 * scale * 8, 7 * scale * 8, -0.15, 0, Math.PI * 2);
      g.fill();
      // body
      g.beginPath();
      g.ellipse(0, -22 * scale * 8, 9 * scale * 8, 14 * scale * 8, 0.2, 0, Math.PI * 2);
      g.fill();
      // head
      g.beginPath();
      g.arc(3 * scale * 8, -42 * scale * 8, 9 * scale * 8, 0, Math.PI * 2);
      g.fill();
      // arm resting
      g.beginPath();
      g.ellipse(-8 * scale * 8, -20 * scale * 8, 5 * scale * 8, 12 * scale * 8, 0.5, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    function drawVignette() {
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    }

    function drawWellness() {
      const score = Math.min(100, Math.round(wellnessScore));
      const barW = W * 0.45;
      const barH = 6;
      const bx = W / 2 - barW / 2;
      const by = 22;

      // label
      g.save();
      g.globalAlpha = 0.8;
      g.fillStyle = '#FFD740';
      g.font = `bold ${Math.round(H * 0.018)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('✦ Wellness', W / 2, by - 4);

      // bar bg
      g.fillStyle = 'rgba(0,0,0,0.3)';
      roundRectC(g, bx, by, barW, barH, 3);
      g.fill();

      // bar fill
      const fillGrad = g.createLinearGradient(bx, 0, bx + barW, 0);
      fillGrad.addColorStop(0, '#4CAF50');
      fillGrad.addColorStop(0.5, '#8BC34A');
      fillGrad.addColorStop(1, '#FFD740');
      g.fillStyle = fillGrad;
      roundRectC(g, bx, by, barW * (score / 100), barH, 3);
      g.fill();

      g.restore();
    }

    function drawInfoButton() {
      const ix = W - 22, iy = 22;
      g.save();
      g.globalAlpha = 0.75;
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      g.arc(ix, iy, 14, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(ix, iy, 14, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#fff';
      g.font = `bold ${Math.round(H * 0.02)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', ix, iy);
      g.restore();
    }

    function drawInfoPanel() {
      if (!showInfo) return;
      const pw = W * 0.78;
      const ph = H * 0.38;
      const px = W / 2 - pw / 2;
      const py = H / 2 - ph / 2;
      g.save();
      g.globalAlpha = 0.93;
      g.fillStyle = 'rgba(10, 20, 35, 0.92)';
      roundRectC(g, px, py, pw, ph, 16);
      g.fill();
      g.strokeStyle = 'rgba(255, 215, 64, 0.5)';
      g.lineWidth = 1.5;
      roundRectC(g, px, py, pw, ph, 16);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = '#FFD740';
      g.font = `bold ${Math.round(H * 0.024)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText('How to experience', W / 2, py + 18);
      g.fillStyle = '#d0e8ff';
      g.font = `${Math.round(H * 0.019)}px sans-serif`;
      const lines = [
        '☁  Tap the sky → clouds drift by',
        '☀  Tap the sun → birds take flight',
        '🌳  Tap the tree → leaves rustle & fall',
        '🌸  Tap the ground → flowers bloom',
        '',
        'Breathe. Just be here.',
        'Wellness grows over time.',
      ];
      lines.forEach((line, i) => {
        g.fillText(line, W / 2, py + 52 + i * (H * 0.044));
      });
      g.restore();
    }

    // ── Hit zones ─────────────────────────────────────────────────────────────
    function hitZone(tx, ty, progress) {
      const sunPos = getSunPos(progress);
      const dx = tx - sunPos.x, dy = ty - sunPos.y;

      // sun
      if (Math.sqrt(dx * dx + dy * dy) < SUN_R * 2) {
        return 'sun';
      }
      // tree foliage
      const tdx = tx - treeX, tdy = ty - treeTopY;
      if (Math.sqrt(tdx * tdx + tdy * tdy) < W * 0.18) {
        return 'tree';
      }
      // sky (top 40%)
      if (ty < H * 0.4) {
        return 'sky';
      }
      // ground
      if (ty > H * 0.68) {
        return 'ground';
      }
      return 'sky';
    }

    // ── Main loop ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      elapsed += dt;
      rayAngle += 0.0003 * dt;

      const progress = Math.min(1, elapsed / TOTAL_DURATION);
      ctx.platform.setProgress(progress);

      if (started) {
        wellnessScore = Math.min(100, wellnessScore + 0.003 * dt * 0.05 * 100);
      }

      updateClouds(dt);
      updateBirds(dt);
      updateLeaves(dt);
      updateFlowers(dt);
      updateFlares(dt);
      updatePulses(dt);

      const sunPos = getSunPos(progress);

      // ── Draw layers ──
      g.clearRect(0, 0, W, H);

      drawSky(progress);
      drawSun(sunPos, progress);

      // clouds behind hills
      clouds.forEach(drawCloud);

      drawHills();
      drawGround();

      // flowers on ground
      flowers.forEach(drawFlower);

      drawTree();
      drawPerson();

      // leaves in foreground
      leaves.forEach(drawLeaf);

      // birds
      birds.forEach(drawBird);

      // flares
      drawFlares();
      drawPulses();

      drawVignette();
      drawWellness();
      drawInfoButton();
      drawInfoPanel();

      // complete at end of cycle
      if (progress >= 1 && started) {
        ctx.platform.complete({ score: Math.round(wellnessScore), result: 'peaceful', durationMs: elapsed });
      }
    });

    // ── Touch ─────────────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) {
        started = true;
        ctx.platform.start();
      }

      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // info button
      if (Math.sqrt((tx - (W - 22)) ** 2 + (ty - 22) ** 2) < 20) {
        showInfo = !showInfo;
        ctx.platform.haptic('light');
        return;
      }

      if (showInfo) { showInfo = false; return; }

      const progress = Math.min(1, elapsed / TOTAL_DURATION);
      const zone = hitZone(tx, ty, progress);

      ctx.platform.interact({ type: 'tap', zone });
      ctx.platform.haptic('light');
      wellnessScore = Math.min(100, wellnessScore + 2);

      if (zone === 'sun') {
        const sunPos = getSunPos(progress);
        spawnSunFlare(sunPos.x, sunPos.y);
        spawnBirdFlock(sunPos.x - W * 0.1, sunPos.y);
        addPulse(sunPos.x, sunPos.y, '#FFD740');
        playSunFlare();
        for (let i = 0; i < 3; i++) ctx.timeout(playBirdChirp, i * 300 + 200);
      } else if (zone === 'tree') {
        spawnLeaves(treeX, treeTopY);
        addPulse(treeX, treeTopY, '#6ab04c');
        playLeafRustle();
      } else if (zone === 'ground') {
        spawnFlower(tx, ty - 8);
        addPulse(tx, ty, '#FF6B9D');
        playFlowerBloom();
      } else if (zone === 'sky') {
        // burst of clouds
        for (let i = 0; i < 3; i++) {
          spawnCloud(tx - 40 + Math.random() * 80, ty - 20 + Math.random() * 40, true);
        }
        addPulse(tx, ty, '#b0d8ff');
        playTone(440 + Math.random() * 200, 'sine', 0.5, 0.06, 0.1, 0.4);
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
