// UNDERRUN — Claustrophobic Twin-Stick Tunnel Shooter (Plethora Bit)

// Helper: rounded rectangle
function roundRectC(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

window.plethoraBit = {
  meta: {
    title: 'Underrun',
    author: 'plethora',
    description: 'Dark. Fast. Survive.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom + 10;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Sepia palette ──────────────────────────────────────────────
    const C = {
      bg:      '#1a0e00',
      wall0:   '#0f0800',
      wall1:   '#3d2800',
      wall2:   '#5a3c00',
      mid:     '#7a5200',
      bright:  '#c8a040',
      accent:  '#ffd080',
      gold:    '#FFD740',
      player:  '#ffd080',
      bullet:  '#ffe0a0',
      enemy0:  '#7a5200',
      enemy1:  '#c8a040',
      enemy2:  '#a06820',
      expl0:   '#ff8c00',
      expl1:   '#ffd080',
      shield:  '#80d0ff',
      rapid:   '#ffe080',
      red:     '#ff4400',
    };

    // ── Web Audio ─────────────────────────────────────────────────
    let audioCtx = null;
    let engineOsc = null, engineGain = null;
    const voices = [];

    function ensureAudio() {
      if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
      audioCtx = new AudioContext();
      // Engine hum: continuous low oscillator
      engineOsc = audioCtx.createOscillator();
      engineGain = audioCtx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();
    }

    function setEngineHum(speed) {
      if (!audioCtx || !engineOsc) return;
      const norm = Math.min(1, speed / 600);
      engineOsc.frequency.setTargetAtTime(55 + norm * 60, audioCtx.currentTime, 0.2);
      engineGain.gain.setTargetAtTime(0.06 + norm * 0.07, audioCtx.currentTime, 0.2);
    }

    function killVoices() {
      while (voices.length >= 10) { try { voices[0].stop(); } catch(e){} voices.shift(); }
    }

    function playTone(freq, type, dur, vol, bend) {
      if (!audioCtx) return;
      killVoices();
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (bend) o.frequency.exponentialRampToValueAtTime(bend, audioCtx.currentTime + dur);
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
      o.onended = () => { const i = voices.indexOf(o); if (i !== -1) voices.splice(i, 1); };
    }

    function playNoise(dur, vol, filter) {
      if (!audioCtx) return;
      const len = Math.ceil(audioCtx.sampleRate * dur);
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audioCtx.createBufferSource();
      const gn = audioCtx.createGain();
      src.buffer = buf; src.connect(gn); gn.connect(audioCtx.destination);
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      src.start();
    }

    function sndShoot()      { playTone(900, 'square', 0.07, 0.18, 400); }
    function sndEnemyDie()   { playNoise(0.18, 0.28); playTone(200, 'sawtooth', 0.1, 0.12, 80); }
    function sndPlayerDie()  { playNoise(0.5, 0.4); [300,200,140,100].forEach((f,i) => { setTimeout(() => playTone(f,'sawtooth',0.2,0.3), i*100); }); }
    function sndPickup()     { [440,550,660,880].forEach((f,i) => setTimeout(() => playTone(f,'sine',0.12,0.2), i*50)); }
    function sndLaser()      { playTone(1200, 'sawtooth', 0.15, 0.2, 200); }

    // ── Tunnel geometry ───────────────────────────────────────────
    // Tunnel: segments of top-view cross-sections
    // Each segment = left wall x and right wall x at a given world Y
    const SEG_H = 40;           // height of each tunnel segment in px
    const SEGS = Math.ceil(H / SEG_H) + 6;
    const TUNNEL_MARGIN_MIN = W * 0.12;
    const TUNNEL_MARGIN_MAX = W * 0.32;

    let segments = [];       // { lx, rx }  (screen-space, rebuilt each frame)
    let wallSeed = [];       // pre-built noise for wall variation
    let tunnelScroll = 0;    // how far we've scrolled (px)
    let tunnelSpeed = 280;   // pixels/sec

    function genWallSeed(count) {
      // Generate random walk for left margin and right margin
      const res = [];
      let lm = TUNNEL_MARGIN_MIN + (TUNNEL_MARGIN_MAX - TUNNEL_MARGIN_MIN) * 0.5;
      let rm = lm;
      let dlm = 0, drm = 0;
      for (let i = 0; i < count; i++) {
        dlm += (Math.random() - 0.5) * 18;
        dlm *= 0.8;
        drm += (Math.random() - 0.5) * 18;
        drm *= 0.8;
        lm = Math.max(TUNNEL_MARGIN_MIN, Math.min(TUNNEL_MARGIN_MAX, lm + dlm));
        rm = Math.max(TUNNEL_MARGIN_MIN, Math.min(TUNNEL_MARGIN_MAX, rm + drm));
        res.push({ lm, rm });
      }
      return res;
    }

    // We precompute a large ring buffer of wall data
    const WALL_POOL = 2000;
    let wallPool = genWallSeed(WALL_POOL);
    let wallPoolIdx = 0;

    function wallAt(globalIdx) {
      return wallPool[((globalIdx % WALL_POOL) + WALL_POOL) % WALL_POOL];
    }

    // HUD & play area
    const HUD_H = 52;
    const PLAY_TOP = HUD_H;
    const PLAY_H = H - PLAY_TOP - SAFE;

    // ── Game state ────────────────────────────────────────────────
    let player, bullets, enemies, particles, powerups;
    let score, highScore, wave, kills, killsForWave;
    let gameOver, started, showInfo;
    let shakeX = 0, shakeY = 0;
    let shootCooldown = 0;
    let autoFireTimer = 0;
    const SHOOT_INTERVAL = 120;   // ms
    const LASER_INTERVAL = 80;

    // Touch tracking
    let leftTouch  = null;   // { x, y }
    let rightTouch = null;   // { x, y }

    function initGame() {
      highScore = ctx.storage.get('hs_underrun') || 0;
      player = {
        x: W / 2, y: PLAY_TOP + PLAY_H * 0.75,
        vx: 0, vy: 0,
        w: 30, h: 20,
        hp: 3, maxHp: 3,
        shield: false, shieldTime: 0,
        rapidFire: false, rapidTime: 0,
        invincible: 0,
      };
      bullets = []; enemies = []; particles = []; powerups = [];
      score = 0; wave = 1; kills = 0; killsForWave = 10;
      gameOver = false; started = false; showInfo = false;
      tunnelSpeed = 280; tunnelScroll = 0; wallPoolIdx = 0;
      shakeX = 0; shakeY = 0; shootCooldown = 0; autoFireTimer = 0;
      leftTouch = null; rightTouch = null;
    }

    // ── Enemy spawn ───────────────────────────────────────────────
    let enemySpawnTimer = 0;

    function spawnEnemy() {
      // Get tunnel bounds at spawn row (near top of play area)
      const spawnY = PLAY_TOP + 20;
      const segIdx = Math.floor(tunnelScroll / SEG_H);
      const wData = wallAt(segIdx);
      const lx = wData.lm + 14;
      const rx = W - wData.rm - 14;
      const spawnX = lx + Math.random() * Math.max(0, rx - lx);

      const typeRoll = Math.random();
      let type;
      if (wave < 2) {
        type = 'drone';
      } else if (wave < 4) {
        type = typeRoll < 0.55 ? 'drone' : 'weaver';
      } else {
        type = typeRoll < 0.4 ? 'drone' : typeRoll < 0.7 ? 'weaver' : 'bomber';
      }

      const baseSpeed = 120 + wave * 20;
      const e = {
        x: spawnX,
        y: spawnY,
        type,
        hp: type === 'bomber' ? 3 : type === 'weaver' ? 2 : 1,
        phase: Math.random() * Math.PI * 2,
        vx: 0, vy: 0,
        size: type === 'bomber' ? 18 : 13,
        speed: baseSpeed + Math.random() * 60,
        shootTimer: 1000 + Math.random() * 1000,
      };
      if (type === 'drone') {
        const dx = player.x - e.x, dy = player.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        e.vx = (dx / len) * e.speed;
        e.vy = (dy / len) * e.speed;
      } else if (type === 'weaver') {
        e.vy = e.speed * 0.6;
      } else {
        e.vy = e.speed * 0.4;
      }
      enemies.push(e);
    }

    // ── Particle helpers ──────────────────────────────────────────
    function addExplosion(x, y, count, col1, col2, speed) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (speed || 120) * (0.5 + Math.random());
        particles.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.5 + Math.random() * 0.4,
          maxLife: 0.9,
          col: Math.random() < 0.5 ? col1 : col2,
          r: 2 + Math.random() * 3,
        });
      }
    }

    function addBulletTrail(x, y, col) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        life: 0.08 + Math.random() * 0.06,
        maxLife: 0.14,
        col,
        r: 1.5,
      });
    }

    function screenShake(mag) {
      shakeX = (Math.random() - 0.5) * mag * 2;
      shakeY = (Math.random() - 0.5) * mag * 2;
    }

    // ── Drawing helpers ───────────────────────────────────────────
    function drawShip(x, y, thrustOn) {
      g.save();
      g.translate(x, y);

      // Thruster glow
      if (thrustOn) {
        const grad = g.createRadialGradient(0, 12, 0, 0, 12, 14);
        grad.addColorStop(0, 'rgba(255,160,0,0.7)');
        grad.addColorStop(1, 'rgba(255,80,0,0)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(0, 14, 14, 0, Math.PI * 2); g.fill();
      }

      // Hull — angular diamond/wedge
      g.fillStyle = C.player;
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(14, 8);
      g.lineTo(5, 12);
      g.lineTo(0, 6);
      g.lineTo(-5, 12);
      g.lineTo(-14, 8);
      g.closePath();
      g.fill();

      // Dark cockpit
      g.fillStyle = C.bg;
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(6, 5);
      g.lineTo(0, 3);
      g.lineTo(-6, 5);
      g.closePath();
      g.fill();

      // Wing accent
      g.strokeStyle = C.mid;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-14, 8); g.lineTo(0, -10); g.lineTo(14, 8); g.stroke();

      g.restore();
    }

    function drawDrone(e) {
      g.save();
      g.translate(e.x, e.y);
      const s = e.size;
      // Triangle
      g.fillStyle = C.enemy1;
      g.beginPath();
      g.moveTo(0, -s);
      g.lineTo(s * 0.866, s * 0.5);
      g.lineTo(-s * 0.866, s * 0.5);
      g.closePath();
      g.fill();
      g.strokeStyle = C.accent;
      g.lineWidth = 1;
      g.stroke();
      // Core
      g.fillStyle = C.accent;
      g.beginPath(); g.arc(0, 0, s * 0.3, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    function drawWeaver(e, t) {
      g.save();
      g.translate(e.x, e.y);
      const s = e.size;
      // Circle with spikes
      g.fillStyle = C.enemy0;
      g.beginPath(); g.arc(0, 0, s, 0, Math.PI * 2); g.fill();
      g.strokeStyle = C.enemy1;
      g.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * s, Math.sin(a) * s);
        g.lineTo(Math.cos(a) * (s + 7), Math.sin(a) * (s + 7));
        g.stroke();
      }
      g.fillStyle = C.bright;
      g.beginPath(); g.arc(0, 0, s * 0.4, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    function drawBomber(e, t) {
      g.save();
      g.translate(e.x, e.y);
      const s = e.size;
      // Hexagon body
      g.fillStyle = C.enemy2;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) g.moveTo(Math.cos(a) * s, Math.sin(a) * s);
        else g.lineTo(Math.cos(a) * s, Math.sin(a) * s);
      }
      g.closePath(); g.fill();
      g.strokeStyle = C.accent;
      g.lineWidth = 1.5;
      g.stroke();
      // Pulsing center
      const pulse = 0.3 + 0.2 * Math.sin(t * 4);
      g.fillStyle = C.expl0;
      g.globalAlpha = 0.5 + pulse;
      g.beginPath(); g.arc(0, 0, s * 0.45, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      g.restore();
    }

    function drawMine(m, t) {
      g.save();
      g.translate(m.x, m.y);
      const pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * 3));
      g.strokeStyle = C.expl0;
      g.lineWidth = 1.5;
      g.globalAlpha = pulse;
      g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke();
      g.fillStyle = C.expl0;
      g.beginPath(); g.arc(0, 0, 4, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      g.restore();
    }

    function drawPowerup(p, t) {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(t * 1.5);
      if (p.kind === 'shield') {
        // Star shape
        g.fillStyle = C.shield;
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const ai = a + Math.PI / 5;
          if (i === 0) g.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
          else g.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
          g.lineTo(Math.cos(ai) * 5, Math.sin(ai) * 5);
        }
        g.closePath(); g.fill();
      } else {
        // Lightning bolt
        g.fillStyle = C.rapid;
        g.beginPath();
        g.moveTo(4, -12);
        g.lineTo(-2, -1);
        g.lineTo(4, -1);
        g.lineTo(-4, 12);
        g.lineTo(2, 1);
        g.lineTo(-4, 1);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    // ── Tunnel drawing ────────────────────────────────────────────
    function drawTunnel() {
      const scrolledSegs = tunnelScroll / SEG_H;
      const topFrac = scrolledSegs % 1;
      const topSegIdx = Math.floor(scrolledSegs);

      // Build visible segment list
      const visSegs = [];
      for (let i = 0; i <= SEGS + 1; i++) {
        const idx = topSegIdx + i;
        const w = wallAt(idx);
        const screenY = PLAY_TOP + (i - topFrac) * SEG_H;
        visSegs.push({ y: screenY, lx: w.lm, rx: w.rm });
      }

      // Draw left wall segments
      for (let i = 0; i < visSegs.length - 1; i++) {
        const s0 = visSegs[i], s1 = visSegs[i + 1];
        // Outer dark area (left of tunnel)
        g.fillStyle = C.wall0;
        g.beginPath();
        g.moveTo(0, s0.y);
        g.lineTo(s0.lx, s0.y);
        g.lineTo(s1.lx, s1.y);
        g.lineTo(0, s1.y);
        g.closePath();
        g.fill();

        // Rocky wall surface (left)
        const lGrad = g.createLinearGradient(s0.lx - 18, 0, s0.lx, 0);
        lGrad.addColorStop(0, C.wall1);
        lGrad.addColorStop(0.6, C.wall2);
        lGrad.addColorStop(1, C.mid);
        g.fillStyle = lGrad;
        g.beginPath();
        g.moveTo(s0.lx - 18, s0.y);
        g.lineTo(s0.lx, s0.y);
        g.lineTo(s1.lx, s1.y);
        g.lineTo(s1.lx - 18, s1.y);
        g.closePath();
        g.fill();

        // Outer dark area (right of tunnel)
        g.fillStyle = C.wall0;
        g.beginPath();
        g.moveTo(W - s0.rx, s0.y);
        g.lineTo(W, s0.y);
        g.lineTo(W, s1.y);
        g.lineTo(W - s1.rx, s1.y);
        g.closePath();
        g.fill();

        // Rocky wall surface (right)
        const rGrad = g.createLinearGradient(W - s0.rx, 0, W - s0.rx + 18, 0);
        rGrad.addColorStop(0, C.mid);
        rGrad.addColorStop(0.4, C.wall2);
        rGrad.addColorStop(1, C.wall1);
        g.fillStyle = rGrad;
        g.beginPath();
        g.moveTo(W - s0.rx, s0.y);
        g.lineTo(W - s0.rx + 18, s0.y);
        g.lineTo(W - s1.rx + 18, s1.y);
        g.lineTo(W - s1.rx, s1.y);
        g.closePath();
        g.fill();
      }

      // Tunnel floor/center gradient
      const floorGrad = g.createLinearGradient(0, PLAY_TOP, 0, H);
      floorGrad.addColorStop(0, '#2a1800');
      floorGrad.addColorStop(1, '#1a0e00');
      // Fill tunnel interior with gradient (between wall edges using average widths)
      // Just fill the middle strip
      const avgLm = visSegs.reduce((a, s) => a + s.lx, 0) / visSegs.length;
      const avgRm = visSegs.reduce((a, s) => a + s.rx, 0) / visSegs.length;
      g.fillStyle = floorGrad;
      g.fillRect(avgLm - 20, PLAY_TOP, W - avgLm - avgRm + 40, PLAY_H + SAFE);
    }

    function getTunnelBoundsAt(y) {
      const scrolledSegs = tunnelScroll / SEG_H;
      const segOffset = (y - PLAY_TOP) / SEG_H;
      const segIdx = Math.floor(scrolledSegs + segOffset);
      const w = wallAt(segIdx);
      return { left: w.lm, right: W - w.rm };
    }

    // ── Laser beam state ──────────────────────────────────────────
    let laserBeam = null;   // { x, ay, aimX, aimY } active this frame only
    let laserTimer = 0;

    // ── Mines (dropped by Bombers) ────────────────────────────────
    let mines = [];

    // ── Weapon type by wave ───────────────────────────────────────
    function getWeapon() {
      if (wave >= 5) return 'laser';
      if (wave >= 3) return 'spread';
      return 'single';
    }

    function fireBullets(fromX, fromY, aimX, aimY) {
      const dx = aimX - fromX, dy = aimY - fromY;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len, ny = dy / len;
      const weapon = getWeapon();
      const speed = 700;

      if (weapon === 'laser') {
        laserBeam = { x: fromX, y: fromY, tx: aimX, ty: aimY, nx, ny };
        sndLaser();
        return;
      }

      if (weapon === 'spread') {
        const angles = [-0.22, 0, 0.22];
        angles.forEach(da => {
          const cos = Math.cos(da), sin = Math.sin(da);
          const bx = nx * cos - ny * sin;
          const by = nx * sin + ny * cos;
          bullets.push({ x: fromX, y: fromY, vx: bx * speed, vy: by * speed, life: 1.4 });
        });
      } else {
        bullets.push({ x: fromX, y: fromY, vx: nx * speed, vy: ny * speed, life: 1.4 });
      }
      sndShoot();
    }

    // ── Info button ───────────────────────────────────────────────
    const IBTN = { x: W - 22, y: HUD_H / 2, r: 14 };

    // ── Touch handlers ────────────────────────────────────────────
    function updateTouches(e) {
      leftTouch = null; rightTouch = null;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.clientX < W / 2) {
          leftTouch = { x: t.clientX, y: t.clientY };
        } else {
          rightTouch = { x: t.clientX, y: t.clientY };
        }
      }
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      if (Math.hypot(tx - IBTN.x, ty - IBTN.y) < IBTN.r + 8) {
        showInfo = !showInfo; return;
      }
      if (showInfo) { showInfo = false; return; }
      if (gameOver) { initGame(); return; }
      if (!started) { started = true; ctx.platform.start(); }

      updateTouches(e);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      updateTouches(e);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      updateTouches(e);
    }, { passive: false });

    ctx.listen(canvas, 'touchcancel', (e) => {
      e.preventDefault();
      leftTouch = null; rightTouch = null;
    }, { passive: false });

    // ── CRT scan line overlay ─────────────────────────────────────
    function drawScanLines() {
      g.globalAlpha = 0.04;
      g.fillStyle = '#000';
      for (let y = 0; y < H; y += 3) {
        g.fillRect(0, y, W, 1);
      }
      g.globalAlpha = 1;
    }

    // ── HUD drawing ───────────────────────────────────────────────
    function drawHUD() {
      g.fillStyle = '#0f0800';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = C.mid;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      // Title / wave
      g.fillStyle = C.accent;
      g.font = 'bold 15px "Courier New"';
      g.textAlign = 'left';
      g.fillText('UNDERRUN', 14, 20);
      g.fillStyle = C.bright;
      g.font = '11px "Courier New"';
      g.fillText('WAVE ' + wave, 14, 36);

      // Score
      g.fillStyle = '#fff';
      g.font = 'bold 18px "Courier New"';
      g.textAlign = 'center';
      g.fillText(score, W / 2, 26);
      g.fillStyle = '#777';
      g.font = '10px "Courier New"';
      g.fillText('BEST ' + highScore, W / 2, 42);

      // Health segments
      const hpX = W - 90;
      const hpY = 14;
      for (let i = 0; i < player.maxHp; i++) {
        const filled = i < player.hp;
        g.fillStyle = filled ? C.red : '#333';
        roundRectC(g, hpX + i * 28, hpY, 22, 14, 3);
        g.fill();
        if (filled) {
          g.strokeStyle = '#ff8060';
          g.lineWidth = 1;
          g.stroke();
        }
      }
      g.textAlign = 'right';
      g.fillStyle = '#666';
      g.font = '9px "Courier New"';
      g.fillText('HP', hpX - 4, hpY + 10);

      // Wave progress bar
      const barW = W - 28;
      const barH = 4;
      const barY = HUD_H - 7;
      g.fillStyle = '#2a1800';
      g.fillRect(14, barY, barW, barH);
      g.fillStyle = C.gold;
      g.fillRect(14, barY, barW * Math.min(1, kills / killsForWave), barH);

      // Active powerup icons
      if (player.shield) {
        g.fillStyle = C.shield;
        g.font = '10px "Courier New"';
        g.textAlign = 'left';
        g.fillText('⬡', 14, HUD_H - 12);
      }
      if (player.rapidFire) {
        g.fillStyle = C.rapid;
        g.font = '10px "Courier New"';
        g.textAlign = 'left';
        g.fillText('⚡', 34, HUD_H - 12);
      }

      // Info button
      g.fillStyle = '#1a0e00';
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = C.mid;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = C.accent;
      g.font = 'bold 13px "Courier New"';
      g.textAlign = 'center';
      g.fillText('i', IBTN.x, IBTN.y + 5);
    }

    // ── Weapon HUD indicator ──────────────────────────────────────
    function drawWeaponIndicator() {
      const weapon = getWeapon();
      const label = weapon === 'laser' ? 'LASER' : weapon === 'spread' ? 'SPREAD' : 'SHOT';
      g.fillStyle = C.mid;
      g.font = '10px "Courier New"';
      g.textAlign = 'right';
      g.fillText(label, W - 14, H - SAFE - 10);
    }

    // ── Main game loop ────────────────────────────────────────────
    let gameTime = 0;

    initGame();

    ctx.raf((dt) => {
      const sec = dt / 1000;
      gameTime += dt;
      const t = gameTime / 1000;

      // Physics & logic (only when playing)
      if (started && !gameOver) {
        // Tunnel scroll
        tunnelScroll += tunnelSpeed * sec;
        setEngineHum(tunnelSpeed);

        // Ship movement toward left touch
        if (leftTouch) {
          const dx = leftTouch.x - player.x;
          const dy = leftTouch.y - player.y;
          const dist = Math.hypot(dx, dy);
          const acc = Math.min(dist, 380) * 6;
          player.vx += (dx / (dist || 1)) * acc * sec;
          player.vy += (dy / (dist || 1)) * acc * sec;
        }
        // Drag
        player.vx *= Math.pow(0.04, sec);
        player.vy *= Math.pow(0.04, sec);

        player.x += player.vx * sec;
        player.y += player.vy * sec;

        // Clamp to tunnel bounds
        const bounds = getTunnelBoundsAt(player.y);
        const margin = 18;
        player.x = Math.max(bounds.left + margin, Math.min(bounds.right - margin, player.x));
        player.y = Math.max(PLAY_TOP + 10, Math.min(H - SAFE - 20, player.y));

        // Wall collision damage
        if (player.x <= bounds.left + margin + 2 || player.x >= bounds.right - margin - 2) {
          if (!player.shield && player.invincible <= 0) {
            player.hp--;
            player.invincible = 1200;
            screenShake(8);
            ctx.platform.haptic('heavy');
            if (player.hp <= 0) {
              addExplosion(player.x, player.y, 28, C.expl0, C.expl1, 200);
              sndPlayerDie();
              gameOver = true;
              if (score > highScore) { highScore = score; ctx.storage.set('hs_underrun', highScore); }
              ctx.platform.fail({ reason: 'crashed into wall' });
            }
          }
        }

        // Invincibility countdown
        if (player.invincible > 0) player.invincible -= dt;

        // Shield / rapid fire timers
        if (player.shield) { player.shieldTime -= dt; if (player.shieldTime <= 0) player.shield = false; }
        if (player.rapidFire) { player.rapidTime -= dt; if (player.rapidTime <= 0) player.rapidFire = false; }

        // Auto-fire when right touch held
        const fireInterval = (player.rapidFire ? SHOOT_INTERVAL * 0.5 : SHOOT_INTERVAL);
        if (rightTouch) {
          autoFireTimer -= dt;
          if (autoFireTimer <= 0) {
            fireBullets(player.x, player.y, rightTouch.x, rightTouch.y);
            autoFireTimer = fireInterval;
            ctx.platform.interact({ type: 'shoot' });
          }
        } else {
          autoFireTimer = 0;
          laserBeam = null;
        }

        // Update bullets
        bullets = bullets.filter(b => {
          b.x += b.vx * sec; b.y += b.vy * sec; b.life -= sec;
          if (b.life > 0) addBulletTrail(b.x, b.y, C.bullet);
          return b.life > 0 && b.y > PLAY_TOP && b.y < H && b.x > 0 && b.x < W;
        });

        // Laser damage (continuous)
        if (laserBeam) {
          enemies = enemies.filter(e => {
            const dist = Math.hypot(e.x - laserBeam.x, e.y - laserBeam.y);
            const dot = (e.x - laserBeam.x) * laserBeam.nx + (e.y - laserBeam.y) * laserBeam.ny;
            const px = laserBeam.x + dot * laserBeam.nx;
            const py = laserBeam.y + dot * laserBeam.ny;
            const perpDist = Math.hypot(e.x - px, e.y - py);
            if (perpDist < e.size + 6 && dot > 0 && dot < 600) {
              e.hp -= sec * 4;
              addExplosion(e.x, e.y, 2, C.expl0, C.expl1, 80);
              if (e.hp <= 0) {
                onEnemyKilled(e);
                return false;
              }
            }
            return true;
          });
        }

        // Update enemies
        enemies = enemies.filter(e => {
          if (e.type === 'drone') {
            const dx = player.x - e.x, dy = player.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            e.vx += (dx / len) * e.speed * sec * 3;
            e.vy += (dy / len) * e.speed * sec * 3;
            const spd = Math.hypot(e.vx, e.vy);
            if (spd > e.speed) { e.vx *= e.speed / spd; e.vy *= e.speed / spd; }
            e.x += e.vx * sec; e.y += e.vy * sec;
          } else if (e.type === 'weaver') {
            e.phase += sec * 2.5;
            e.x += Math.sin(e.phase) * 90 * sec;
            e.y += e.vy * sec;
          } else if (e.type === 'bomber') {
            e.y += e.vy * sec;
            e.shootTimer -= dt;
            if (e.shootTimer <= 0) {
              mines.push({ x: e.x, y: e.y, life: 5 });
              e.shootTimer = 2000 + Math.random() * 1000;
            }
          }

          // Bullet collisions
          for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            if (Math.hypot(b.x - e.x, b.y - e.y) < e.size + 5) {
              bullets.splice(bi, 1);
              e.hp--;
              addExplosion(e.x, e.y, 5, C.expl0, C.expl1, 100);
              screenShake(3);
              if (e.hp <= 0) {
                onEnemyKilled(e);
                return false;
              }
            }
          }

          // Player collision
          if (!player.shield && player.invincible <= 0 && Math.hypot(player.x - e.x, player.y - e.y) < e.size + 12) {
            player.hp--;
            player.invincible = 1500;
            addExplosion(e.x, e.y, 12, C.expl0, C.red, 130);
            sndEnemyDie();
            screenShake(10);
            ctx.platform.haptic('heavy');
            if (player.hp <= 0) {
              addExplosion(player.x, player.y, 28, C.expl0, C.expl1, 200);
              sndPlayerDie();
              gameOver = true;
              if (score > highScore) { highScore = score; ctx.storage.set('hs_underrun', highScore); }
              ctx.platform.fail({ reason: 'enemy collision' });
            }
            return false;
          }

          return e.y < H + 40 && e.y > PLAY_TOP - 80;
        });

        // Update mines
        mines = mines.filter(m => {
          m.life -= sec;
          if (!player.shield && player.invincible <= 0 && Math.hypot(player.x - m.x, player.y - m.y) < 20) {
            player.hp--;
            player.invincible = 1500;
            addExplosion(m.x, m.y, 16, C.expl0, C.expl1, 150);
            sndEnemyDie();
            screenShake(8);
            ctx.platform.haptic('medium');
            if (player.hp <= 0) {
              addExplosion(player.x, player.y, 28, C.expl0, C.expl1, 200);
              sndPlayerDie();
              gameOver = true;
              if (score > highScore) { highScore = score; ctx.storage.set('hs_underrun', highScore); }
              ctx.platform.fail({ reason: 'mine' });
            }
            return false;
          }
          // Bullet hits mine
          for (let bi = bullets.length - 1; bi >= 0; bi--) {
            if (Math.hypot(bullets[bi].x - m.x, bullets[bi].y - m.y) < 16) {
              bullets.splice(bi, 1);
              addExplosion(m.x, m.y, 10, C.expl0, C.expl1, 120);
              screenShake(4);
              return false;
            }
          }
          return m.life > 0;
        });

        // Update powerups
        powerups = powerups.filter(p => {
          p.y += 60 * sec;
          if (Math.hypot(player.x - p.x, player.y - p.y) < 22) {
            if (p.kind === 'shield') {
              player.shield = true; player.shieldTime = 8000;
            } else {
              player.rapidFire = true; player.rapidTime = 6000;
            }
            sndPickup();
            ctx.platform.haptic('medium');
            addExplosion(p.x, p.y, 12, C.shield, C.rapid, 100);
            return false;
          }
          return p.y < H + 30;
        });

        // Enemy spawning
        const spawnInterval = Math.max(600, 1800 - wave * 120);
        enemySpawnTimer -= dt;
        if (enemySpawnTimer <= 0) {
          spawnEnemy();
          enemySpawnTimer = spawnInterval * (0.6 + Math.random() * 0.8);
        }

        // Update particles
        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec;
          p.vy += 30 * sec;
          p.life -= sec;
          return p.life > 0;
        });

        // Fade screen shake
        shakeX *= 0.7; shakeY *= 0.7;

        ctx.platform.setScore(score);
        ctx.platform.setProgress(Math.min(1, (wave - 1) / 10 + kills / killsForWave / 10));
      }

      // ====== DRAW ======
      g.save();

      // Screen shake
      if (Math.abs(shakeX) > 0.5 || Math.abs(shakeY) > 0.5) {
        g.translate(shakeX, shakeY);
      }

      // Background
      g.fillStyle = C.bg;
      g.fillRect(0, 0, W, H);

      // Tunnel
      drawTunnel();

      // Particles behind everything
      particles.forEach(p => {
        const alpha = Math.max(0, p.life / (p.maxLife || 0.9));
        g.globalAlpha = alpha;
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      });
      g.globalAlpha = 1;

      // Mines
      mines.forEach(m => drawMine(m, t));

      // Powerups
      powerups.forEach(p => drawPowerup(p, t));

      // Bullets
      bullets.forEach(b => {
        g.fillStyle = C.bullet;
        g.shadowColor = C.accent;
        g.shadowBlur = 6;
        g.beginPath(); g.arc(b.x, b.y, 4, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
      });

      // Laser beam
      if (laserBeam) {
        g.save();
        g.strokeStyle = C.accent;
        g.lineWidth = 3;
        g.shadowColor = C.gold;
        g.shadowBlur = 12;
        g.globalAlpha = 0.9;
        g.beginPath();
        g.moveTo(laserBeam.x, laserBeam.y);
        g.lineTo(laserBeam.x + laserBeam.nx * 600, laserBeam.y + laserBeam.ny * 600);
        g.stroke();
        g.globalAlpha = 0.4;
        g.lineWidth = 8;
        g.stroke();
        g.restore();
      }

      // Enemies
      enemies.forEach(e => {
        if (e.type === 'drone') drawDrone(e);
        else if (e.type === 'weaver') drawWeaver(e, t);
        else drawBomber(e, t);
      });

      // Player ship (blink during invincibility)
      const blink = player.invincible > 0 && Math.floor(t * 10) % 2 === 0;
      if (!blink && !gameOver) {
        const thrustOn = !!leftTouch;
        drawShip(player.x, player.y, thrustOn);

        // Shield bubble
        if (player.shield) {
          const pulse = 0.5 + 0.3 * Math.sin(t * 5);
          g.strokeStyle = C.shield;
          g.globalAlpha = 0.4 + pulse * 0.3;
          g.lineWidth = 2;
          g.shadowColor = C.shield;
          g.shadowBlur = 8;
          g.beginPath(); g.arc(player.x, player.y, 24, 0, Math.PI * 2); g.stroke();
          g.shadowBlur = 0;
          g.globalAlpha = 1;
        }
      }

      g.restore(); // end shake transform

      // Scan lines (no shake applied)
      drawScanLines();

      // HUD (no shake)
      drawHUD();
      drawWeaponIndicator();

      // Touch aim reticle on right side
      if (rightTouch && started && !gameOver) {
        g.strokeStyle = C.accent;
        g.lineWidth = 1.5;
        g.globalAlpha = 0.6;
        g.beginPath(); g.arc(rightTouch.x, rightTouch.y, 14, 0, Math.PI * 2); g.stroke();
        g.beginPath();
        g.moveTo(rightTouch.x - 20, rightTouch.y); g.lineTo(rightTouch.x + 20, rightTouch.y);
        g.moveTo(rightTouch.x, rightTouch.y - 20); g.lineTo(rightTouch.x, rightTouch.y + 20);
        g.stroke();
        g.globalAlpha = 1;
      }

      // Left move indicator
      if (leftTouch && started && !gameOver) {
        g.strokeStyle = C.mid;
        g.lineWidth = 1;
        g.globalAlpha = 0.35;
        g.beginPath(); g.arc(leftTouch.x, leftTouch.y, 20, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(10,5,0,0.92)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = C.accent;
        g.font = 'bold 22px "Courier New"';
        g.textAlign = 'center';
        g.fillText('HOW TO PLAY', W / 2, H / 2 - 120);
        g.fillStyle = '#ccc';
        g.font = '14px "Courier New"';
        const infoLines = [
          'LEFT thumb — steer ship',
          'RIGHT thumb — aim & shoot',
          '',
          'Shoot enemies to score.',
          '10 kills = next wave.',
          '',
          'Wave 3: Spread shot',
          'Wave 5: Laser beam',
          '',
          'Powerups: Shield ★ Rapid ⚡',
          '',
          'Don\'t hit the walls.',
        ];
        infoLines.forEach((l, i) => g.fillText(l, W / 2, H / 2 - 80 + i * 22));
        g.fillStyle = C.mid;
        g.font = '12px "Courier New"';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, H - SAFE - 20);
        g.textAlign = 'left';
      }

      // Start overlay
      if (!started) {
        g.fillStyle = 'rgba(10,5,0,0.8)';
        g.fillRect(0, PLAY_TOP, W, PLAY_H + SAFE);
        const glow = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 120);
        glow.addColorStop(0, 'rgba(200,120,0,0.18)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
        g.fillStyle = C.accent;
        g.font = 'bold 36px "Courier New"';
        g.textAlign = 'center';
        g.fillText('UNDERRUN', W / 2, H / 2 - 50);
        g.fillStyle = C.bright;
        g.font = '14px "Courier New"';
        g.fillText('Dark. Fast. Survive.', W / 2, H / 2 - 18);
        g.fillStyle = '#aaa';
        g.font = '13px "Courier New"';
        g.fillText('LEFT: steer  RIGHT: shoot', W / 2, H / 2 + 18);
        g.fillStyle = C.gold;
        g.font = 'bold 15px "Courier New"';
        g.fillText('TOUCH TO START', W / 2, H / 2 + 60);
        if (highScore > 0) {
          g.fillStyle = C.mid;
          g.font = '12px "Courier New"';
          g.fillText('BEST ' + highScore, W / 2, H / 2 + 90);
        }
        g.textAlign = 'left';
      }

      // Game over overlay
      if (gameOver) {
        g.fillStyle = 'rgba(10,5,0,0.82)';
        g.fillRect(0, PLAY_TOP, W, PLAY_H + SAFE);
        g.fillStyle = C.red;
        g.font = 'bold 34px "Courier New"';
        g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 50);
        g.fillStyle = C.accent;
        g.font = 'bold 22px "Courier New"';
        g.fillText('SCORE: ' + score, W / 2, H / 2);
        g.fillStyle = C.gold;
        g.font = '15px "Courier New"';
        g.fillText('BEST: ' + highScore, W / 2, H / 2 + 30);
        g.fillStyle = C.mid;
        g.font = '13px "Courier New"';
        g.fillText('WAVE ' + wave + ' REACHED', W / 2, H / 2 + 58);
        g.fillStyle = '#aaa';
        g.font = '14px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 90);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();

    // ── onEnemyKilled helper (defined after all vars) ─────────────
    function onEnemyKilled(e) {
      sndEnemyDie();
      screenShake(5);
      ctx.platform.haptic('light');
      addExplosion(e.x, e.y, 16, C.expl0, C.expl1, 140);
      score += 10 * wave;
      kills++;

      // Chance to drop powerup
      if (Math.random() < 0.12) {
        powerups.push({ x: e.x, y: e.y, kind: Math.random() < 0.5 ? 'shield' : 'rapid' });
      }

      // Wave advance
      if (kills >= killsForWave) {
        kills = 0;
        wave++;
        killsForWave = 10 + wave * 2;
        tunnelSpeed = Math.min(700, 280 + wave * 40);
        score += 100;
      }
    }
  },

  pause() {},
  resume() {},
};
