// SPACECRAFT — Chill Space Exploration (Plethora Bit)

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
    title: 'Spacecraft',
    author: 'plethora',
    description: 'Explore. Discover. Float.',
    tags: ['creative'],
    permissions: ['audio', 'haptics'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom + 8;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // World dimensions: 3x3 screen tiles
    const WW = W * 3;
    const WH = H * 3;

    // ---------- Audio ----------
    let audioCtx = null;
    let thrusterGain = null;
    let thrusterOsc = null;
    let thrusterActive = false;

    function ensureAudio() {
      if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
      audioCtx = new AudioContext();
      // Thruster hum: continuous oscillator, gain controlled by thrust
      thrusterOsc = audioCtx.createOscillator();
      thrusterGain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      thrusterOsc.type = 'sawtooth';
      thrusterOsc.frequency.value = 68;
      thrusterOsc.connect(filter);
      filter.connect(thrusterGain);
      thrusterGain.connect(audioCtx.destination);
      thrusterGain.gain.setValueAtTime(0, audioCtx.currentTime);
      thrusterOsc.start();
    }

    function setThrusterVolume(vol) {
      if (!audioCtx || !thrusterGain) return;
      thrusterGain.gain.setTargetAtTime(vol * 0.12, audioCtx.currentTime, 0.05);
    }

    function playChime() {
      if (!audioCtx) return;
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        o.connect(env);
        env.connect(audioCtx.destination);
        const t = audioCtx.currentTime + i * 0.12;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.22, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
        o.start(t);
        o.stop(t + 1.5);
      });
    }

    function playFuelPickup() {
      if (!audioCtx) return;
      [440, 660].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        o.connect(env);
        env.connect(audioCtx.destination);
        const t = audioCtx.currentTime + i * 0.07;
        env.gain.setValueAtTime(0.18, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.start(t);
        o.stop(t + 0.3);
      });
    }

    function playMissionComplete() {
      if (!audioCtx) return;
      const melody = [523, 659, 784, 1047, 880, 1047, 1319];
      const durs =   [0.18, 0.18, 0.18, 0.36, 0.18, 0.18, 0.6];
      let t = audioCtx.currentTime;
      melody.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        o.connect(env);
        env.connect(audioCtx.destination);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.28, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, t + durs[i] * 0.9);
        o.start(t);
        o.stop(t + durs[i]);
        t += durs[i];
      });
    }

    // ---------- Stars (3 parallax layers) ----------
    const starLayers = [
      { stars: [], parallax: 0.15, size: 0.7, alpha: 0.5 },
      { stars: [], parallax: 0.45, size: 1.1, alpha: 0.75 },
      { stars: [], parallax: 0.80, size: 1.6, alpha: 1.0 },
    ];
    const STAR_COUNTS = [80, 80, 40];
    starLayers.forEach((layer, li) => {
      for (let i = 0; i < STAR_COUNTS[li]; i++) {
        layer.stars.push({
          x: Math.random() * WW,
          y: Math.random() * WH,
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    });

    // ---------- Nebulae ----------
    const nebulae = [
      { x: WW * 0.15, y: WH * 0.2, r: W * 0.8, color: 'rgba(80,20,120,0.18)' },
      { x: WW * 0.7,  y: WH * 0.3, r: W * 0.7, color: 'rgba(20,60,140,0.15)' },
      { x: WW * 0.4,  y: WH * 0.65,r: W * 0.9, color: 'rgba(0,100,120,0.15)' },
      { x: WW * 0.85, y: WH * 0.8, r: W * 0.75,color: 'rgba(100,20,80,0.16)' },
    ];

    // ---------- World Objects (8 total) ----------
    const DISCOVERY_RADIUS = 80;
    const worldObjects = [
      {
        id: 0, name: 'Red Planet',
        x: WW * 0.18, y: WH * 0.22,
        type: 'redPlanet', radius: 52,
        discovered: false, pulseT: 0,
      },
      {
        id: 1, name: 'Gas Giant',
        x: WW * 0.78, y: WH * 0.18,
        type: 'gasGiant', radius: 72,
        discovered: false, pulseT: 0,
      },
      {
        id: 2, name: 'Ice Planet',
        x: WW * 0.55, y: WH * 0.42,
        type: 'icePlanet', radius: 44,
        discovered: false, pulseT: 0,
      },
      {
        id: 3, name: 'Station Alpha',
        x: WW * 0.25, y: WH * 0.62,
        type: 'station', radius: 38,
        discovered: false, pulseT: 0, blinkT: 0,
      },
      {
        id: 4, name: 'Ancient Ruins',
        x: WW * 0.72, y: WH * 0.58,
        type: 'ruins', radius: 40,
        discovered: false, pulseT: 0,
      },
      {
        id: 5, name: 'Wormhole',
        x: WW * 0.88, y: WH * 0.82,
        type: 'wormhole', radius: 48,
        discovered: false, pulseT: 0, wormT: 0,
        paired: { x: WW * 0.08, y: WH * 0.78 },
      },
      {
        id: 6, name: 'Asteroid Cluster',
        x: WW * 0.45, y: WH * 0.78,
        type: 'asteroids', radius: 55,
        discovered: false, pulseT: 0,
        rocks: [],
      },
      {
        id: 7, name: 'Beacon Satellite',
        x: WW * 0.62, y: WH * 0.12,
        type: 'beacon', radius: 22,
        discovered: false, pulseT: 0, blinkT: 0,
      },
    ];

    // Seed asteroid cluster rocks
    const ac = worldObjects[6];
    for (let i = 0; i < 18; i++) {
      ac.rocks.push({
        ox: (Math.random() - 0.5) * 180,
        oy: (Math.random() - 0.5) * 180,
        r: 8 + Math.random() * 18,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.02,
      });
    }

    // ---------- Fuel Canisters ----------
    const fuelCanisters = [
      { x: WW * 0.38, y: WH * 0.15, collected: false },
      { x: WW * 0.62, y: WH * 0.33, collected: false },
      { x: WW * 0.15, y: WH * 0.48, collected: false },
      { x: WW * 0.82, y: WH * 0.52, collected: false },
      { x: WW * 0.30, y: WH * 0.85, collected: false },
      { x: WW * 0.55, y: WH * 0.91, collected: false },
    ];

    // ---------- Ship ----------
    const ship = {
      x: WW * 0.5,
      y: WH * 0.5,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2, // facing up
      targetAngle: -Math.PI / 2,
      thrustPower: 0,
      trail: [],
    };
    const MAX_SPEED = 150;
    const THRUST_ACCEL = 220;
    const DAMPING = 0.995;

    // ---------- Camera ----------
    let camX = ship.x - W / 2;
    let camY = ship.y - H / 2;

    // ---------- State ----------
    let discovered = 0;
    let fuel = 1.0;
    let missionComplete = false;
    let gameStarted = false;
    let totalTime = 0;
    let touchX = null, touchY = null;
    let isTouching = false;
    let thrustingThisFrame = false;
    let showInfo = false;
    let wormholeTransport = false;
    let wormholeCooldown = 0;
    let discoveryBannerText = '';
    let discoveryBannerAlpha = 0;
    let discoveryBannerTimer = 0;

    // ---------- Touch handling ----------
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // Info button check: top-right
      const ibx = W - 22, iby = 22;
      if (Math.hypot(tx - ibx, ty - iby) < 20) {
        showInfo = !showInfo;
        return;
      }
      showInfo = false;

      if (!gameStarted) {
        gameStarted = true;
        ctx.platform.start();
      }
      ensureAudio();
      isTouching = true;
      touchX = tx;
      touchY = ty;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchX = t.clientX;
      touchY = t.clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      isTouching = false;
    }, { passive: false });

    // ---------- Helpers ----------
    function lerpAngle(a, b, t) {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a + d * t;
    }

    function worldToScreen(wx, wy) {
      return { sx: wx - camX, sy: wy - camY };
    }

    function drawPlanetRedPlanet(g, cx, cy, r) {
      // Base
      const grad = g.createRadialGradient(cx - r*0.25, cy - r*0.25, r*0.05, cx, cy, r);
      grad.addColorStop(0, '#e05030');
      grad.addColorStop(0.6, '#a03018');
      grad.addColorStop(1, '#501008');
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2);
      g.fillStyle = grad; g.fill();
      // Craters
      [[0.3, -0.3, 0.18], [-0.4, 0.2, 0.12], [0.1, 0.4, 0.09], [-0.15, -0.45, 0.08]].forEach(([dx, dy, rf]) => {
        const cx2 = cx + dx*r, cy2 = cy + dy*r, r2 = rf*r;
        g.beginPath(); g.arc(cx2, cy2, r2, 0, Math.PI*2);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
        g.strokeStyle = 'rgba(255,150,100,0.25)'; g.lineWidth = 1; g.stroke();
      });
    }

    function drawGasGiant(g, cx, cy, r, t) {
      const grad = g.createRadialGradient(cx - r*0.2, cy - r*0.2, r*0.05, cx, cy, r);
      grad.addColorStop(0, '#f0c060');
      grad.addColorStop(0.4, '#d08030');
      grad.addColorStop(0.75, '#a06020');
      grad.addColorStop(1, '#503010');
      g.save();
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.clip();
      g.fillStyle = grad; g.fillRect(cx-r, cy-r, r*2, r*2);
      // Bands
      const bands = [
        { y: -0.5, h: 0.12, col: 'rgba(200,100,40,0.55)' },
        { y: -0.2, h: 0.10, col: 'rgba(240,180,80,0.4)' },
        { y:  0.1, h: 0.15, col: 'rgba(180,80,30,0.5)' },
        { y:  0.4, h: 0.09, col: 'rgba(220,140,60,0.45)' },
      ];
      bands.forEach(b => {
        g.fillStyle = b.col;
        const offset = Math.sin(t * 0.0003 + b.y) * 4;
        g.fillRect(cx - r, cy + b.y * r + offset, r*2, b.h * r);
      });
      g.restore();
      // Rings
      g.save();
      g.translate(cx, cy);
      g.scale(1, 0.28);
      g.beginPath(); g.arc(0, 0, r * 1.65, 0, Math.PI*2);
      g.strokeStyle = 'rgba(220,160,60,0.35)'; g.lineWidth = r * 0.22; g.stroke();
      g.beginPath(); g.arc(0, 0, r * 1.9, 0, Math.PI*2);
      g.strokeStyle = 'rgba(200,140,50,0.2)'; g.lineWidth = r * 0.1; g.stroke();
      g.restore();
    }

    function drawIcePlanet(g, cx, cy, r) {
      const grad = g.createRadialGradient(cx - r*0.3, cy - r*0.3, r*0.05, cx, cy, r);
      grad.addColorStop(0, '#ddf4ff');
      grad.addColorStop(0.5, '#70c0e8');
      grad.addColorStop(0.85, '#3080b0');
      grad.addColorStop(1, '#103050');
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2);
      g.fillStyle = grad; g.fill();
      // Crystal facets
      g.save();
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.clip();
      const facets = [
        [0.2, -0.4, 0.25], [-0.35, -0.1, 0.2], [0.0, 0.3, 0.18], [-0.1, -0.6, 0.14],
      ];
      facets.forEach(([dx, dy, rf]) => {
        const fx = cx + dx*r, fy = cy + dy*r;
        g.beginPath();
        g.moveTo(fx, fy - rf*r);
        g.lineTo(fx + rf*r * 0.7, fy + rf*r * 0.5);
        g.lineTo(fx - rf*r * 0.7, fy + rf*r * 0.5);
        g.closePath();
        g.fillStyle = 'rgba(180,240,255,0.2)'; g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.8; g.stroke();
      });
      g.restore();
    }

    function drawStation(g, cx, cy, r, t) {
      const blink = Math.sin(t * 0.003) > 0.5;
      // Hub
      g.save(); g.translate(cx, cy);
      roundRectC(g, -r*0.35, -r*0.35, r*0.7, r*0.7, 4);
      g.fillStyle = '#445566'; g.fill();
      g.strokeStyle = '#88aacc'; g.lineWidth = 1.5; g.stroke();
      // Arms
      [0, 1, 2, 3].forEach(i => {
        g.save(); g.rotate(i * Math.PI / 2);
        g.fillStyle = '#334455';
        g.fillRect(-r*0.1, r*0.3, r*0.2, r*0.5);
        // End module
        roundRectC(g, -r*0.18, r*0.8, r*0.36, r*0.25, 3);
        g.fill();
        g.strokeStyle = '#6699bb'; g.lineWidth = 1; g.stroke();
        g.restore();
      });
      // Blink lights
      const blinkCols = ['#ff4444', '#ffaa00', '#44ff88'];
      blinkCols.forEach((col, i) => {
        g.beginPath();
        g.arc(Math.cos(i * Math.PI * 2 / 3) * r * 0.9, Math.sin(i * Math.PI * 2 / 3) * r * 0.9, 3.5, 0, Math.PI*2);
        g.fillStyle = (blink && i === Math.floor(t * 0.003 * 3) % 3) ? col : 'rgba(255,255,255,0.2)';
        g.fill();
      });
      g.restore();
    }

    function drawRuins(g, cx, cy, r, t) {
      const monoliths = [
        [0, -r*0.7, r*0.12, r*0.5, -0.1],
        [-r*0.45, -r*0.2, r*0.1, r*0.4, 0.15],
        [r*0.5, -r*0.3, r*0.11, r*0.45, -0.08],
        [-r*0.15, r*0.1, r*0.09, r*0.3, 0.05],
        [r*0.2, r*0.2, r*0.08, r*0.28, -0.12],
      ];
      g.save(); g.translate(cx, cy);
      const glow = g.createRadialGradient(0, 0, 0, 0, 0, r*0.8);
      glow.addColorStop(0, 'rgba(160,80,255,0.12)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.beginPath(); g.arc(0, 0, r*0.8, 0, Math.PI*2);
      g.fillStyle = glow; g.fill();
      monoliths.forEach(([dx, dy, mw, mh, tilt]) => {
        g.save(); g.translate(dx, dy); g.rotate(tilt);
        roundRectC(g, -mw/2, -mh, mw, mh, 2);
        const mgrad = g.createLinearGradient(-mw/2, -mh, mw/2, 0);
        mgrad.addColorStop(0, '#8860cc');
        mgrad.addColorStop(1, '#443366');
        g.fillStyle = mgrad; g.fill();
        g.strokeStyle = 'rgba(180,120,255,0.4)'; g.lineWidth = 0.8; g.stroke();
        // Rune glow
        const pulse = (Math.sin(t * 0.001 + dx) + 1) / 2;
        g.fillStyle = `rgba(180,120,255,${0.2 + pulse * 0.3})`;
        g.fillRect(-mw*0.3, -mh*0.6, mw*0.6, 2);
        g.fillRect(-mw*0.3, -mh*0.3, mw*0.6, 2);
        g.restore();
      });
      g.restore();
    }

    function drawWormhole(g, cx, cy, r, t) {
      const rings = 8;
      for (let i = rings; i >= 0; i--) {
        const frac = i / rings;
        const spin = t * 0.002 * (1 + (1-frac) * 2);
        const cr = frac * r;
        const hue = (200 + frac * 120 + t * 0.05) % 360;
        g.save(); g.translate(cx, cy); g.rotate(spin);
        if (i > 0) {
          g.beginPath();
          g.arc(0, 0, cr, 0, Math.PI * 1.5);
          g.strokeStyle = `hsla(${hue},90%,70%,${0.6 * frac})`;
          g.lineWidth = 1.5 + frac * 2;
          g.stroke();
        }
        g.restore();
      }
      // Core glow
      const coreGrad = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
      coreGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
      coreGrad.addColorStop(0.3, 'rgba(160,80,255,0.6)');
      coreGrad.addColorStop(1, 'rgba(0,0,40,0)');
      g.beginPath(); g.arc(cx, cy, r * 0.5, 0, Math.PI*2);
      g.fillStyle = coreGrad; g.fill();
    }

    function drawAsteroids(g, cx, cy, obj, t) {
      obj.rocks.forEach(rock => {
        rock.angle += rock.spin;
        const rx = cx + rock.ox, ry = cy + rock.oy;
        g.save(); g.translate(rx, ry); g.rotate(rock.angle);
        g.beginPath();
        const pts = 7;
        for (let i = 0; i < pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const nr = rock.r * (0.7 + 0.3 * Math.sin(i * 2.3 + rock.angle));
          i === 0 ? g.moveTo(Math.cos(a)*nr, Math.sin(a)*nr) : g.lineTo(Math.cos(a)*nr, Math.sin(a)*nr);
        }
        g.closePath();
        const ag = g.createRadialGradient(0, 0, 0, 0, 0, rock.r);
        ag.addColorStop(0, '#888070');
        ag.addColorStop(1, '#444038');
        g.fillStyle = ag; g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 0.5; g.stroke();
        g.restore();
      });
    }

    function drawBeacon(g, cx, cy, r, t) {
      const blink = Math.sin(t * 0.005) > 0.3;
      // Body
      g.save(); g.translate(cx, cy);
      g.fillStyle = '#556677';
      g.fillRect(-r*0.3, -r, r*0.6, r*1.8);
      // Solar panels
      g.fillStyle = '#224488';
      g.fillRect(-r*1.2, -r*0.2, r*0.8, r*0.35);
      g.fillRect(r*0.4, -r*0.2, r*0.8, r*0.35);
      g.strokeStyle = '#3366aa'; g.lineWidth = 1;
      g.strokeRect(-r*1.2, -r*0.2, r*0.8, r*0.35);
      g.strokeRect(r*0.4, -r*0.2, r*0.8, r*0.35);
      // Blink light
      if (blink) {
        const bgrad = g.createRadialGradient(0, -r*1.2, 0, 0, -r*1.2, r*0.6);
        bgrad.addColorStop(0, 'rgba(255,220,60,0.95)');
        bgrad.addColorStop(1, 'rgba(255,220,60,0)');
        g.beginPath(); g.arc(0, -r*1.2, r*0.6, 0, Math.PI*2);
        g.fillStyle = bgrad; g.fill();
        g.beginPath(); g.arc(0, -r*1.2, r*0.15, 0, Math.PI*2);
        g.fillStyle = '#FFD740'; g.fill();
      }
      // Signal rings
      for (let i = 1; i <= 3; i++) {
        const phase = ((t * 0.002) % 1);
        const ringR = r * 0.5 + i * r * 0.6;
        const a = Math.max(0, (1 - phase) * 0.4 - i * 0.1);
        g.beginPath(); g.arc(0, -r, ringR, 0, Math.PI*2);
        g.strokeStyle = `rgba(255,220,60,${a})`; g.lineWidth = 1.5; g.stroke();
      }
      g.restore();
    }

    function drawShip(g, cx, cy, angle, thrustPower, t) {
      g.save(); g.translate(cx, cy); g.rotate(angle + Math.PI / 2);
      // Thruster glow
      if (thrustPower > 0.05) {
        const tg = g.createRadialGradient(0, 14, 0, 0, 14, 22 * thrustPower);
        tg.addColorStop(0, `rgba(100,180,255,${0.9 * thrustPower})`);
        tg.addColorStop(0.5, `rgba(40,80,200,${0.5 * thrustPower})`);
        tg.addColorStop(1, 'rgba(0,0,80,0)');
        g.beginPath(); g.arc(0, 14, 22 * thrustPower, 0, Math.PI*2);
        g.fillStyle = tg; g.fill();
        // Exhaust flame
        const fl = 8 + thrustPower * 20 + Math.random() * 5;
        g.beginPath();
        g.moveTo(-5, 10);
        g.lineTo(0, 10 + fl);
        g.lineTo(5, 10);
        const fg = g.createLinearGradient(0, 10, 0, 10 + fl);
        fg.addColorStop(0, `rgba(140,200,255,${0.9 * thrustPower})`);
        fg.addColorStop(1, 'rgba(0,40,255,0)');
        g.strokeStyle = fg; g.lineWidth = 2; g.stroke();
      }
      // Hull
      g.beginPath();
      g.moveTo(0, -16);
      g.lineTo(10, 8);
      g.lineTo(6, 4);
      g.lineTo(0, 6);
      g.lineTo(-6, 4);
      g.lineTo(-10, 8);
      g.closePath();
      const hg = g.createLinearGradient(-10, -16, 10, 8);
      hg.addColorStop(0, '#c0d8f0');
      hg.addColorStop(1, '#405878');
      g.fillStyle = hg; g.fill();
      g.strokeStyle = 'rgba(180,220,255,0.6)'; g.lineWidth = 1; g.stroke();
      // Cockpit
      g.beginPath(); g.ellipse(0, -4, 4, 6, 0, 0, Math.PI*2);
      g.fillStyle = 'rgba(100,200,255,0.7)'; g.fill();
      // Wing highlights
      g.beginPath(); g.moveTo(-10, 8); g.lineTo(-6, 4); g.lineTo(0, -2);
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.8; g.stroke();
      g.beginPath(); g.moveTo(10, 8); g.lineTo(6, 4); g.lineTo(0, -2);
      g.stroke();
      g.restore();
    }

    // ---------- Draw object (dispatch) ----------
    function drawObject(g, obj, t) {
      const { sx, sy } = worldToScreen(obj.x, obj.y);
      const r = obj.radius;
      // Skip if off screen with margin
      if (sx < -r*3 || sx > W + r*3 || sy < -r*3 || sy > H + r*3) return;

      // Undiscovered indicator ring
      if (!obj.discovered) {
        const dist = Math.hypot(ship.x - obj.x, ship.y - obj.y);
        if (dist < DISCOVERY_RADIUS * 4) {
          const opacity = Math.max(0, 1 - dist / (DISCOVERY_RADIUS * 4));
          g.beginPath(); g.arc(sx, sy, r + 8, 0, Math.PI*2);
          g.strokeStyle = `rgba(255,215,64,${opacity * 0.5})`; g.lineWidth = 1.5; g.stroke();
        }
      }

      if (obj.type === 'redPlanet') drawPlanetRedPlanet(g, sx, sy, r);
      else if (obj.type === 'gasGiant') drawGasGiant(g, sx, sy, r, t);
      else if (obj.type === 'icePlanet') drawIcePlanet(g, sx, sy, r);
      else if (obj.type === 'station') drawStation(g, sx, sy, r, t);
      else if (obj.type === 'ruins') drawRuins(g, sx, sy, r, t);
      else if (obj.type === 'wormhole') drawWormhole(g, sx, sy, r, t);
      else if (obj.type === 'asteroids') drawAsteroids(g, sx, sy, obj, t);
      else if (obj.type === 'beacon') drawBeacon(g, sx, sy, r, t);

      // Discovery pulse ring
      if (obj.pulseT > 0) {
        const progress = 1 - obj.pulseT;
        const pr = r + progress * r * 2;
        g.beginPath(); g.arc(sx, sy, pr, 0, Math.PI*2);
        g.strokeStyle = `rgba(255,215,64,${obj.pulseT * 0.8})`; g.lineWidth = 3; g.stroke();
      }

      // Name label if discovered
      if (obj.discovered) {
        g.font = 'bold 11px sans-serif';
        g.textAlign = 'center';
        g.fillStyle = 'rgba(200,230,255,0.7)';
        g.fillText(obj.name, sx, sy + r + 14);
      }
    }

    // ---------- HUD ----------
    function drawHUD(g, t) {
      const hudY = H - SAFE;
      const hudH = 44;

      // HUD background bar
      roundRectC(g, 8, hudY - hudH - 4, W - 16, hudH + 4, 8);
      g.fillStyle = 'rgba(5,10,30,0.75)'; g.fill();
      g.strokeStyle = 'rgba(80,130,200,0.3)'; g.lineWidth = 1; g.stroke();

      // Discoveries
      g.font = 'bold 13px sans-serif';
      g.textAlign = 'left';
      g.fillStyle = '#FFD740';
      g.fillText(`DISCOVER`, 18, hudY - hudH + 15);
      g.fillStyle = '#ffffff';
      g.fillText(`${discovered}/8`, 18, hudY - hudH + 32);

      // Fuel bar
      const fuelX = W * 0.32, fuelW = W * 0.36, fuelBarY = hudY - hudH + 10;
      g.fillStyle = 'rgba(60,80,120,0.6)';
      roundRectC(g, fuelX, fuelBarY, fuelW, 10, 5); g.fill();
      const fuelCol = fuel > 0.3 ? (fuel > 0.6 ? '#44ff88' : '#ffcc44') : '#ff4444';
      const gf = g.createLinearGradient(fuelX, 0, fuelX + fuelW * fuel, 0);
      gf.addColorStop(0, fuelCol);
      gf.addColorStop(1, fuel > 0.3 ? '#22aa55' : '#cc2222');
      g.fillStyle = gf;
      roundRectC(g, fuelX, fuelBarY, fuelW * fuel, 10, 5); g.fill();
      g.font = '10px sans-serif';
      g.textAlign = 'center';
      g.fillStyle = 'rgba(180,200,255,0.7)';
      g.fillText('FUEL', fuelX + fuelW / 2, fuelBarY + 22);

      // Coordinates
      const cx = Math.round(ship.x - WW/2);
      const cy = Math.round(ship.y - WH/2);
      g.font = '10px monospace';
      g.textAlign = 'right';
      g.fillStyle = 'rgba(150,200,255,0.7)';
      g.fillText(`${cx > 0 ? '+' : ''}${cx}, ${cy > 0 ? '+' : ''}${cy}`, W - 18, hudY - hudH + 15);
      g.fillStyle = 'rgba(100,160,220,0.5)';
      g.fillText('COORDS', W - 18, hudY - hudH + 29);

      // Minimap
      const mmSize = 72, mmX = W - mmSize - 10, mmY = 36;
      g.save();
      g.beginPath(); roundRectC(g, mmX, mmY, mmSize, mmSize, 6); g.clip();
      g.fillStyle = 'rgba(5,8,25,0.85)'; g.fillRect(mmX, mmY, mmSize, mmSize);
      // Objects on minimap
      worldObjects.forEach(obj => {
        const mx = mmX + (obj.x / WW) * mmSize;
        const my = mmY + (obj.y / WH) * mmSize;
        g.beginPath(); g.arc(mx, my, 3, 0, Math.PI*2);
        g.fillStyle = obj.discovered ? '#FFD740' : 'rgba(80,120,200,0.5)'; g.fill();
      });
      // Fuel canisters
      fuelCanisters.forEach(fc => {
        if (fc.collected) return;
        const mx = mmX + (fc.x / WW) * mmSize;
        const my = mmY + (fc.y / WH) * mmSize;
        g.beginPath(); g.arc(mx, my, 2, 0, Math.PI*2);
        g.fillStyle = 'rgba(80,255,140,0.6)'; g.fill();
      });
      // Ship dot
      const smx = mmX + (ship.x / WW) * mmSize;
      const smy = mmY + (ship.y / WH) * mmSize;
      g.beginPath(); g.arc(smx, smy, 3.5, 0, Math.PI*2);
      g.fillStyle = '#ffffff'; g.fill();
      g.restore();
      // Minimap border
      roundRectC(g, mmX, mmY, mmSize, mmSize, 6);
      g.strokeStyle = 'rgba(80,130,200,0.4)'; g.lineWidth = 1; g.stroke();
      g.font = '9px sans-serif'; g.textAlign = 'center';
      g.fillStyle = 'rgba(120,170,255,0.5)';
      g.fillText('MAP', mmX + mmSize/2, mmY + mmSize + 12);

      // Info button
      g.beginPath(); g.arc(W - 22, 22, 14, 0, Math.PI*2);
      g.fillStyle = 'rgba(20,40,80,0.8)'; g.fill();
      g.strokeStyle = 'rgba(80,130,200,0.5)'; g.lineWidth = 1.5; g.stroke();
      g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(180,210,255,0.9)';
      g.fillText('i', W - 22, 22);
      g.textBaseline = 'alphabetic';

      // Discovery banner
      if (discoveryBannerAlpha > 0) {
        const bw = W * 0.72, bx = (W - bw) / 2, by = H * 0.28;
        roundRectC(g, bx, by, bw, 44, 10);
        g.fillStyle = `rgba(10,20,60,${discoveryBannerAlpha * 0.9})`; g.fill();
        g.strokeStyle = `rgba(255,215,64,${discoveryBannerAlpha * 0.8})`; g.lineWidth = 1.5; g.stroke();
        g.font = 'bold 14px sans-serif'; g.textAlign = 'center';
        g.fillStyle = `rgba(255,215,64,${discoveryBannerAlpha})`;
        g.fillText('DISCOVERED', W/2, by + 16);
        g.fillStyle = `rgba(200,230,255,${discoveryBannerAlpha})`;
        g.font = '12px sans-serif';
        g.fillText(discoveryBannerText, W/2, by + 34);
      }

      // Low fuel warning
      if (fuel < 0.15) {
        const blink2 = Math.sin(t * 0.008) > 0;
        if (blink2) {
          g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
          g.fillStyle = '#ff4444';
          g.fillText('LOW FUEL — FIND A CANISTER', W/2, hudY - hudH - 14);
        }
      }

      // Info panel
      if (showInfo) {
        const pw = W * 0.82, ph = H * 0.55;
        const px = (W - pw) / 2, py = (H - ph) / 2;
        roundRectC(g, px, py, pw, ph, 12);
        g.fillStyle = 'rgba(5,10,30,0.95)'; g.fill();
        g.strokeStyle = 'rgba(80,130,200,0.5)'; g.lineWidth = 1.5; g.stroke();
        g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
        g.fillStyle = '#FFD740';
        g.fillText('SPACECRAFT', W/2, py + 26);
        g.font = '11px sans-serif'; g.fillStyle = 'rgba(180,210,255,0.9)';
        const lines = [
          'Tap / drag to thrust toward touch point',
          'Explore the universe to discover 8 objects',
          'Collect green fuel canisters to keep flying',
          '',
          'Objects to find:',
          '● Red Planet  ● Gas Giant  ● Ice Planet',
          '● Station Alpha  ● Ancient Ruins',
          '● Wormhole  ● Asteroid Cluster  ● Beacon',
          '',
          'Tap i to close',
        ];
        lines.forEach((line, i) => {
          g.fillText(line, W/2, py + 52 + i * 18);
        });
      }

      // Mission complete overlay
      if (missionComplete) {
        roundRectC(g, W*0.1, H*0.3, W*0.8, H*0.28, 14);
        g.fillStyle = 'rgba(5,10,30,0.95)'; g.fill();
        g.strokeStyle = 'rgba(255,215,64,0.8)'; g.lineWidth = 2; g.stroke();
        g.font = 'bold 22px sans-serif'; g.textAlign = 'center';
        g.fillStyle = '#FFD740';
        g.fillText('MISSION COMPLETE', W/2, H*0.3 + 36);
        g.font = '14px sans-serif'; g.fillStyle = 'rgba(200,230,255,0.9)';
        g.fillText('All 8 objects discovered!', W/2, H*0.3 + 58);
        g.font = '12px sans-serif'; g.fillStyle = 'rgba(150,200,255,0.7)';
        g.fillText(`Time: ${Math.floor(totalTime/60000)}m ${Math.floor((totalTime%60000)/1000)}s`, W/2, H*0.3 + 78);
      }
    }

    // ---------- Draw scene ----------
    function draw(t) {
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#030310'; g.fillRect(0, 0, W, H);

      // Nebulae (no parallax — far background)
      nebulae.forEach(neb => {
        const nx = neb.x - camX * 0.05;
        const ny = neb.y - camY * 0.05;
        const ng = g.createRadialGradient(nx, ny, 0, nx, ny, neb.r);
        ng.addColorStop(0, neb.color);
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        g.beginPath(); g.arc(nx, ny, neb.r, 0, Math.PI*2);
        g.fillStyle = ng; g.fill();
      });

      // Stars (parallax layers)
      starLayers.forEach(layer => {
        layer.stars.forEach(star => {
          const sx = ((star.x - camX * layer.parallax) % W + W) % W;
          const sy = ((star.y - camY * layer.parallax) % H + H) % H;
          star.twinkle += 0.02;
          const brightness = layer.alpha * (0.7 + 0.3 * Math.sin(star.twinkle));
          g.beginPath();
          g.arc(sx, sy, layer.size, 0, Math.PI*2);
          g.fillStyle = `rgba(255,255,255,${brightness})`; g.fill();
        });
      });

      // World objects
      worldObjects.forEach(obj => drawObject(g, obj, t));

      // Fuel canisters
      fuelCanisters.forEach(fc => {
        if (fc.collected) return;
        const { sx, sy } = worldToScreen(fc.x, fc.y);
        if (sx < -30 || sx > W+30 || sy < -30 || sy > H+30) return;
        const bob = Math.sin(t * 0.003 + fc.x) * 3;
        g.save(); g.translate(sx, sy + bob);
        const cg = g.createRadialGradient(0, 0, 0, 0, 0, 14);
        cg.addColorStop(0, 'rgba(80,255,140,0.3)');
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        g.beginPath(); g.arc(0, 0, 14, 0, Math.PI*2);
        g.fillStyle = cg; g.fill();
        roundRectC(g, -6, -10, 12, 20, 3);
        g.fillStyle = '#44ff88'; g.fill();
        g.strokeStyle = '#22cc66'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = '#003010';
        g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('⚡', 0, 0);
        g.textBaseline = 'alphabetic';
        g.restore();
      });

      // Ship trail
      if (ship.trail.length > 1) {
        for (let i = 1; i < ship.trail.length; i++) {
          const p0 = ship.trail[i-1], p1 = ship.trail[i];
          const { sx: x0, sy: y0 } = worldToScreen(p0.x, p0.y);
          const { sx: x1, sy: y1 } = worldToScreen(p1.x, p1.y);
          const alpha = (i / ship.trail.length) * 0.35;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
          g.strokeStyle = `rgba(100,180,255,${alpha})`; g.lineWidth = 1.5; g.stroke();
        }
      }

      // Ship
      const { sx: shipSX, sy: shipSY } = worldToScreen(ship.x, ship.y);
      drawShip(g, shipSX, shipSY, ship.angle, ship.thrustPower, t);

      // Thrust indicator dots when thrusting
      if (isTouching && touchX !== null && !showInfo) {
        g.beginPath(); g.arc(touchX, touchY, 12, 0, Math.PI*2);
        g.strokeStyle = 'rgba(100,180,255,0.35)'; g.lineWidth = 1.5; g.stroke();
        g.beginPath(); g.arc(touchX, touchY, 4, 0, Math.PI*2);
        g.fillStyle = 'rgba(100,180,255,0.5)'; g.fill();
      }

      // HUD on top
      drawHUD(g, t);
    }

    // ---------- Game loop ----------
    ctx.raf((dt) => {
      totalTime += dt;
      const t = totalTime;
      thrustingThisFrame = false;

      // Decay pulse rings
      worldObjects.forEach(obj => {
        if (obj.pulseT > 0) obj.pulseT = Math.max(0, obj.pulseT - dt * 0.0015);
        if (obj.type === 'station' || obj.type === 'beacon') obj.blinkT = t;
        if (obj.type === 'wormhole') obj.wormT = t;
      });

      // Discovery banner decay
      if (discoveryBannerAlpha > 0) {
        discoveryBannerTimer -= dt;
        if (discoveryBannerTimer <= 0) discoveryBannerAlpha = Math.max(0, discoveryBannerAlpha - dt * 0.002);
      }

      if (!missionComplete) {
        // Thrust physics
        if (isTouching && touchX !== null && fuel > 0) {
          thrustingThisFrame = true;
          const worldTX = touchX + camX;
          const worldTY = touchY + camY;
          const dx = worldTX - ship.x;
          const dy = worldTY - ship.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 8) {
            const nx = dx / dist, ny = dy / dist;
            const thrust = Math.min(1, dist / 60);
            ship.vx += nx * THRUST_ACCEL * thrust * (dt / 1000);
            ship.vy += ny * THRUST_ACCEL * thrust * (dt / 1000);
            ship.thrustPower = thrust;
            ship.targetAngle = Math.atan2(ny, nx);
            fuel = Math.max(0, fuel - 0.00025 * thrust);
          } else {
            ship.thrustPower = 0;
          }
        } else {
          ship.thrustPower *= 0.85;
        }

        // Speed cap
        const speed = Math.hypot(ship.vx, ship.vy);
        if (speed > MAX_SPEED) {
          ship.vx = (ship.vx / speed) * MAX_SPEED;
          ship.vy = (ship.vy / speed) * MAX_SPEED;
        }

        // Damping
        ship.vx *= Math.pow(DAMPING, dt / 16.67);
        ship.vy *= Math.pow(DAMPING, dt / 16.67);

        // Angle lerp toward travel direction
        if (speed > 5) {
          ship.targetAngle = Math.atan2(ship.vy, ship.vx);
        }
        ship.angle = lerpAngle(ship.angle, ship.targetAngle, 0.08);

        // Update position
        ship.x += ship.vx * (dt / 1000);
        ship.y += ship.vy * (dt / 1000);

        // World bounds (wrap)
        ship.x = Math.max(20, Math.min(WW - 20, ship.x));
        ship.y = Math.max(20, Math.min(WH - 20, ship.y));

        // Trail
        ship.trail.push({ x: ship.x, y: ship.y });
        if (ship.trail.length > 30) ship.trail.shift();

        // Wormhole cooldown
        if (wormholeCooldown > 0) wormholeCooldown -= dt;

        // Check wormhole transport
        const wh = worldObjects[5];
        if (!wh.discovered && wormholeCooldown <= 0) {
          const dw = Math.hypot(ship.x - wh.x, ship.y - wh.y);
          if (dw < wh.radius * 0.7) {
            // Transport
            ship.x = wh.paired.x;
            ship.y = wh.paired.y;
            ship.vx *= 0.3; ship.vy *= 0.3;
            ship.trail = [];
            wormholeCooldown = 2000;
            ctx.platform.haptic('heavy');
          }
        }

        // Check discoveries
        worldObjects.forEach(obj => {
          if (obj.discovered) return;
          const d = Math.hypot(ship.x - obj.x, ship.y - obj.y);
          if (d < obj.radius + DISCOVERY_RADIUS) {
            obj.discovered = true;
            obj.pulseT = 1.0;
            discovered++;
            ctx.platform.setProgress(discovered / 8);
            ctx.platform.haptic('medium');
            discoveryBannerText = obj.name;
            discoveryBannerAlpha = 1.0;
            discoveryBannerTimer = 2200;
            if (audioCtx) playChime();
            if (discovered === 8) {
              missionComplete = true;
              if (audioCtx) { setTimeout(playMissionComplete, 300); }
              ctx.platform.complete({ score: discovered, result: 'all discovered', durationMs: totalTime });
            }
          }
        });

        // Check fuel canisters
        fuelCanisters.forEach(fc => {
          if (fc.collected) return;
          const d = Math.hypot(ship.x - fc.x, ship.y - fc.y);
          if (d < 36) {
            fc.collected = true;
            fuel = Math.min(1.0, fuel + 0.4);
            ctx.platform.haptic('light');
            if (audioCtx) playFuelPickup();
          }
        });

        // Camera follow ship (smooth)
        const targetCamX = ship.x - W / 2;
        const targetCamY = ship.y - H / 2;
        camX += (targetCamX - camX) * 0.08;
        camY += (targetCamY - camY) * 0.08;
        camX = Math.max(0, Math.min(WW - W, camX));
        camY = Math.max(0, Math.min(WH - H, camY));

        // Thruster audio
        if (audioCtx) setThrusterVolume(thrustingThisFrame ? ship.thrustPower : 0);
      }

      draw(totalTime);
    });

    // Welcome message on start
    discoveryBannerText = 'Find all 8 objects. Tap to fly!';
    discoveryBannerAlpha = 1.0;
    discoveryBannerTimer = 3000;

    ctx.platform.ready();
  },

  pause(ctx) {
    // Audio handled by ctx auto-cleanup; no additional action needed
  },

  resume(ctx) {},
};
