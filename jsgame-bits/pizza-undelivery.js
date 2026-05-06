// PIZZA UNDELIVERY — Plethora Bit
// Intercept pizzas before they reach houses!

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
    title: 'Pizza Undelivery',
    author: 'plethora',
    description: 'Steal pizzas before they arrive!',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea ? ctx.safeArea.bottom : 0;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ──────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol = 0.3, detune = 0) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (detune) o.detune.setValueAtTime(detune, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playGrab() {
      if (!audioCtx) return;
      playTone(520, 'sine', 0.06, 0.4);
      playTone(780, 'sine', 0.1, 0.25);
    }
    function playDelivered() {
      if (!audioCtx) return;
      [220, 180, 140].forEach((f, i) => {
        const t = audioCtx.currentTime + i * 0.12;
        const o = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        o.connect(gain); gain.connect(audioCtx.destination);
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.start(t); o.stop(t + 0.18);
      });
    }
    function playCombo(count) {
      if (!audioCtx) return;
      const freqs = [440, 554, 659, 880, 1047];
      for (let i = 0; i < Math.min(count, freqs.length); i++) {
        setTimeout(() => playTone(freqs[i], 'sine', 0.12, 0.35), i * 80);
      }
    }
    function playGameOver() {
      if (!audioCtx) return;
      [400, 320, 240, 180].forEach((f, i) => {
        setTimeout(() => playTone(f, 'sawtooth', 0.25, 0.35), i * 150);
      });
    }
    function playSpawn() {
      if (!audioCtx) return;
      playTone(660, 'triangle', 0.08, 0.15);
    }
    function playWave() {
      if (!audioCtx) return;
      [330, 440, 550, 660].forEach((f, i) => {
        setTimeout(() => playTone(f, 'triangle', 0.15, 0.3), i * 100);
      });
    }

    // ── Layout ─────────────────────────────────────────────────
    const HUD_H = 52;
    const GRID_TOP = HUD_H + 8;
    const GRID_BOT = H - SAFE - 8;
    const GRID_AREA_H = GRID_BOT - GRID_TOP;
    const COLS = 4, ROWS = 5;
    const CELL_W = W / COLS;
    const CELL_H = GRID_AREA_H / ROWS;
    const HOUSE_W = CELL_W * 0.52;
    const HOUSE_H = CELL_H * 0.52;
    const PIZZA_R = Math.min(CELL_W, CELL_H) * 0.18;

    // ── State ──────────────────────────────────────────────────
    let score = 0;
    let lives = 3;
    let wave = 1;
    let grabsThisWave = 0;
    let gameStarted = false;
    let gameOver = false;
    let gameOverTimer = 0;
    let pizzas = [];
    let particles = [];
    let flyingScores = [];
    let comboCount = 0;
    let comboTimer = 0;
    let comboPop = null; // { x, y, text, life }
    let waveFlash = 0;
    let cursorX = W / 2, cursorY = H / 2;
    let cursorVisible = false;

    const highScore = ctx.storage.get('pizzaUndeliveryHigh') || 0;
    let sessionHigh = highScore;

    // Houses: array of {cx, cy, wx, wy, ww, wh, doorX, doorY}
    const houses = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cx = col * CELL_W + CELL_W / 2;
        const cy = GRID_TOP + row * CELL_H + CELL_H / 2;
        const hx = cx - HOUSE_W / 2;
        const hy = cy - HOUSE_H / 2;
        houses.push({
          cx, cy,
          hx, hy, hw: HOUSE_W, hh: HOUSE_H,
          doorX: cx,
          doorY: hy + HOUSE_H,
          // shake on delivery
          shakeTime: 0,
        });
      }
    }

    // ── Pizza factory ──────────────────────────────────────────
    let pizzaIdCounter = 0;
    function spawnPizza() {
      const target = houses[Math.floor(Math.random() * houses.length)];
      // spawn at a random edge
      let sx, sy;
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { sx = Math.random() * W; sy = GRID_TOP; }
      else if (edge === 1) { sx = W; sy = GRID_TOP + Math.random() * GRID_AREA_H; }
      else if (edge === 2) { sx = Math.random() * W; sy = GRID_BOT; }
      else { sx = 0; sy = GRID_TOP + Math.random() * GRID_AREA_H; }

      const baseSpeed = 55 + wave * 12;
      const speed = baseSpeed + Math.random() * 20;
      const dx = target.doorX - sx;
      const dy = target.doorY - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      pizzas.push({
        id: pizzaIdCounter++,
        x: sx, y: sy,
        tx: target.doorX, ty: target.doorY,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        house: target,
        r: PIZZA_R,
        grabbed: false,
        flyX: null, flyY: null,
        flyProgress: 0,
        startX: sx, startY: sy,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 2.5,
        wobble: 0,
        // trail points
        trail: [],
      });
      playSpawn();
    }

    // ── Spawn scheduling ───────────────────────────────────────
    let spawnTimer = 0;
    function getSpawnInterval() {
      return Math.max(700, 2200 - wave * 180);
    }
    function getMaxPizzas() {
      return Math.min(2 + Math.floor(wave * 0.8), 8);
    }

    // ── Grab logic ─────────────────────────────────────────────
    function tryGrab(tapX, tapY) {
      if (gameOver) return;
      let grabbed = null;
      let bestDist = Infinity;
      for (const p of pizzas) {
        if (p.grabbed) continue;
        const dx = p.x - tapX, dy = p.y - tapY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < p.r + 18 && d < bestDist) {
          bestDist = d;
          grabbed = p;
        }
      }
      if (!grabbed) return;

      grabbed.grabbed = true;
      comboTimer = 1500;
      comboCount++;
      grabsThisWave++;

      const mult = comboCount >= 4 ? 4 : comboCount;
      const pts = 10 * mult;
      score += pts;
      if (score > sessionHigh) {
        sessionHigh = score;
        ctx.storage.set('pizzaUndeliveryHigh', sessionHigh);
      }
      ctx.platform.setScore(score);
      ctx.platform.haptic(comboCount >= 3 ? 'medium' : 'light');

      playGrab();
      if (comboCount > 1) {
        playCombo(comboCount);
        comboPop = { x: grabbed.x, y: grabbed.y, text: `${comboCount}x COMBO!`, life: 1.0 };
      }

      // spawn particles
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        const speed = 60 + Math.random() * 80;
        particles.push({
          x: grabbed.x, y: grabbed.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 2 + Math.random() * 3,
          color: i % 2 === 0 ? '#FF8C00' : '#FFD740',
          life: 1.0,
          decay: 0.6 + Math.random() * 0.5,
        });
      }

      flyingScores.push({
        x: grabbed.x, y: grabbed.y,
        text: `+${pts}`,
        life: 1.0,
        vy: -90,
      });

      // animate fly to score area
      grabbed.flyX = grabbed.x;
      grabbed.flyY = grabbed.y;
      grabbed.flyTargetX = W - 60;
      grabbed.flyTargetY = 24;
      grabbed.flyProgress = 0;

      // check wave
      if (grabsThisWave >= 10) {
        wave++;
        grabsThisWave = 0;
        waveFlash = 1.5;
        playWave();
      }

      if (!gameStarted) {
        gameStarted = true;
        ctx.platform.start();
      }
    }

    // ── Touch ──────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      cursorX = t.clientX;
      cursorY = t.clientY;
      cursorVisible = true;

      if (gameOver) {
        if (gameOverTimer <= 0) restartGame();
        return;
      }
      tryGrab(t.clientX, t.clientY);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      cursorX = t.clientX;
      cursorY = t.clientY;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
    }, { passive: false });

    // ── Restart ────────────────────────────────────────────────
    function restartGame() {
      score = 0;
      lives = 3;
      wave = 1;
      grabsThisWave = 0;
      pizzas = [];
      particles = [];
      flyingScores = [];
      comboCount = 0;
      comboTimer = 0;
      comboPop = null;
      waveFlash = 0;
      gameOver = false;
      gameStarted = false;
      spawnTimer = 0;
      gameOverTimer = 0;
      ctx.platform.setScore(0);
    }

    // ── Draw helpers ───────────────────────────────────────────
    function drawHouse(h, shake) {
      const ox = shake ? (Math.random() - 0.5) * 5 : 0;
      const oy = shake ? (Math.random() - 0.5) * 5 : 0;
      const x = h.hx + ox, y = h.hy + oy;
      const w = h.hw, hh = h.hh;

      // body
      g.fillStyle = '#3a2a14';
      roundRectC(g, x, y, w, hh, 5);
      g.fill();

      // amber glow body
      g.fillStyle = '#c17f3a';
      roundRectC(g, x + 2, y + 2, w - 4, hh - 4, 4);
      g.fill();

      // roof triangle
      g.beginPath();
      g.moveTo(x - 4, y + 4);
      g.lineTo(x + w / 2, y - hh * 0.35);
      g.lineTo(x + w + 4, y + 4);
      g.closePath();
      g.fillStyle = '#7a3a14';
      g.fill();

      // windows
      const wSize = w * 0.18;
      const wY = y + hh * 0.2;
      [[x + w * 0.2, wY], [x + w * 0.62, wY]].forEach(([wx, wy]) => {
        g.fillStyle = '#ffe08a';
        roundRectC(g, wx, wy, wSize, wSize, 2);
        g.fill();
        // window glow
        g.fillStyle = 'rgba(255,220,100,0.2)';
        roundRectC(g, wx - 2, wy - 2, wSize + 4, wSize + 4, 4);
        g.fill();
      });

      // door
      const dw = w * 0.22, dh = hh * 0.3;
      const dx = x + w / 2 - dw / 2;
      const dy = y + hh - dh;
      g.fillStyle = '#5a2a08';
      roundRectC(g, dx, dy, dw, dh, 3);
      g.fill();
      // door knob
      g.beginPath();
      g.arc(dx + dw * 0.75, dy + dh * 0.55, 2, 0, Math.PI * 2);
      g.fillStyle = '#FFD740';
      g.fill();
    }

    function drawPizza(p, alpha = 1) {
      g.save();
      g.globalAlpha = alpha;
      g.translate(p.x, p.y);
      g.rotate(p.rot);

      const r = p.r;

      // glow
      const grd = g.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.8);
      grd.addColorStop(0, 'rgba(255,140,0,0.35)');
      grd.addColorStop(1, 'rgba(255,140,0,0)');
      g.beginPath();
      g.arc(0, 0, r * 1.8, 0, Math.PI * 2);
      g.fillStyle = grd;
      g.fill();

      // crust
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fillStyle = '#cc7722';
      g.fill();

      // sauce
      g.beginPath();
      g.arc(0, 0, r * 0.82, 0, Math.PI * 2);
      g.fillStyle = '#c0391b';
      g.fill();

      // cheese
      g.beginPath();
      g.arc(0, 0, r * 0.68, 0, Math.PI * 2);
      g.fillStyle = '#f0d060';
      g.fill();

      // slice lines
      g.strokeStyle = 'rgba(200,120,10,0.7)';
      g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        g.stroke();
      }

      // pepperoni dots
      [[0.35, 0], [-0.2, 0.3], [0.1, -0.38]].forEach(([px, py]) => {
        g.beginPath();
        g.arc(px * r, py * r, r * 0.14, 0, Math.PI * 2);
        g.fillStyle = '#a01010';
        g.fill();
      });

      g.restore();
    }

    function drawPath(p) {
      // dotted line from current pos to destination
      g.save();
      g.setLineDash([4, 8]);
      g.strokeStyle = 'rgba(100,180,255,0.25)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.tx, p.ty);
      g.stroke();
      g.setLineDash([]);
      g.restore();
    }

    function drawGrid() {
      // subtle street grid
      g.strokeStyle = 'rgba(30,50,100,0.4)';
      g.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) {
        g.beginPath();
        g.moveTo(c * CELL_W, GRID_TOP);
        g.lineTo(c * CELL_W, GRID_BOT);
        g.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        g.beginPath();
        g.moveTo(0, GRID_TOP + r * CELL_H);
        g.lineTo(W, GRID_TOP + r * CELL_H);
        g.stroke();
      }
    }

    function drawPizzaIcon(cx, cy, r, full = true) {
      // mini pizza icon for lives
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = full ? '#cc7722' : '#333';
      g.fill();
      if (full) {
        g.beginPath();
        g.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
        g.fillStyle = '#c0391b';
        g.fill();
        g.beginPath();
        g.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
        g.fillStyle = '#f0d060';
        g.fill();
      }
    }

    function drawHUD() {
      // background bar
      g.fillStyle = 'rgba(10,10,20,0.88)';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = 'rgba(255,215,64,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, HUD_H);
      g.lineTo(W, HUD_H);
      g.stroke();

      // Title
      g.fillStyle = '#FFD740';
      g.font = `bold 13px monospace`;
      g.textAlign = 'left';
      g.fillText('PIZZA UNDELIVERY', 12, 18);

      // Score
      g.fillStyle = '#fff';
      g.font = `bold 22px monospace`;
      g.textAlign = 'right';
      g.fillText(score.toString().padStart(6, '0'), W - 50, 34);

      // High score label
      g.fillStyle = '#888';
      g.font = `10px monospace`;
      g.textAlign = 'right';
      g.fillText(`BEST:${sessionHigh}`, W - 50, 46);

      // Lives
      for (let i = 0; i < 3; i++) {
        drawPizzaIcon(18 + i * 22, 36, 8, i < lives);
      }

      // Wave
      g.fillStyle = '#FFD740';
      g.font = `bold 11px monospace`;
      g.textAlign = 'left';
      g.fillText(`WAVE ${wave}`, 12, 48);

      // Info button
      g.beginPath();
      g.arc(W - 22, 22, 14, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,215,64,0.15)';
      g.fill();
      g.strokeStyle = '#FFD740';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#FFD740';
      g.font = `bold 13px serif`;
      g.textAlign = 'center';
      g.fillText('i', W - 22, 27);
    }

    function drawCursor() {
      if (!cursorVisible) return;
      const cx = cursorX, cy = cursorY;
      // glowing hand icon (simplified grabber)
      g.save();
      g.translate(cx, cy);

      // outer glow
      const grd = g.createRadialGradient(0, 0, 4, 0, 0, 22);
      grd.addColorStop(0, 'rgba(0,255,220,0.45)');
      grd.addColorStop(1, 'rgba(0,255,220,0)');
      g.beginPath();
      g.arc(0, 0, 22, 0, Math.PI * 2);
      g.fillStyle = grd;
      g.fill();

      // hand circle
      g.beginPath();
      g.arc(0, 0, 10, 0, Math.PI * 2);
      g.strokeStyle = '#00FFDC';
      g.lineWidth = 2.5;
      g.stroke();

      // crosshair lines
      g.strokeStyle = 'rgba(0,255,220,0.7)';
      g.lineWidth = 1.5;
      [[-16, 0, -12, 0], [12, 0, 16, 0], [0, -16, 0, -12], [0, 12, 0, 16]].forEach(([x1, y1, x2, y2]) => {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      });

      g.restore();
    }

    function drawStartScreen() {
      // radial bg glow
      const grd = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.8);
      grd.addColorStop(0, 'rgba(255,140,0,0.18)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // big pizza
      const bigP = { x: W / 2, y: H * 0.38, r: 52, rot: Date.now() * 0.001 };
      drawPizza(bigP);

      g.fillStyle = '#FFD740';
      g.font = `bold 28px monospace`;
      g.textAlign = 'center';
      g.fillText('PIZZA', W / 2, H * 0.6);
      g.fillText('UNDELIVERY', W / 2, H * 0.6 + 34);

      g.fillStyle = '#aaa';
      g.font = `14px monospace`;
      g.fillText('Steal pizzas before they', W / 2, H * 0.6 + 72);
      g.fillText('reach the houses!', W / 2, H * 0.6 + 92);

      // pulsing tap prompt
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() * 0.004);
      g.globalAlpha = pulse;
      g.fillStyle = '#00FFDC';
      g.font = `bold 16px monospace`;
      g.fillText('TAP TO START', W / 2, H * 0.82);
      g.globalAlpha = 1;

      // best
      if (sessionHigh > 0) {
        g.fillStyle = '#FFD740';
        g.font = `12px monospace`;
        g.fillText(`BEST: ${sessionHigh}`, W / 2, H * 0.87);
      }
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.72)';
      g.fillRect(0, 0, W, H);

      g.fillStyle = '#FF4444';
      g.font = `bold 30px monospace`;
      g.textAlign = 'center';
      g.fillText('DELIVERY', W / 2, H * 0.38);
      g.fillText('FAILED!', W / 2, H * 0.38 + 36);

      g.fillStyle = '#FFD740';
      g.font = `bold 22px monospace`;
      g.fillText(`SCORE: ${score}`, W / 2, H * 0.56);

      if (score >= sessionHigh && score > 0) {
        const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.006);
        g.globalAlpha = pulse;
        g.fillStyle = '#00FFDC';
        g.font = `bold 14px monospace`;
        g.fillText('NEW HIGH SCORE!', W / 2, H * 0.64);
        g.globalAlpha = 1;
      }

      g.fillStyle = '#888';
      g.font = `12px monospace`;
      g.fillText(`WAVE REACHED: ${wave}`, W / 2, H * 0.7);

      if (gameOverTimer <= 0) {
        const pulse = 0.75 + 0.25 * Math.sin(Date.now() * 0.004);
        g.globalAlpha = pulse;
        g.fillStyle = '#fff';
        g.font = `bold 16px monospace`;
        g.fillText('TAP TO PLAY AGAIN', W / 2, H * 0.82);
        g.globalAlpha = 1;
      }
    }

    // ── Main loop ──────────────────────────────────────────────
    ctx.raf((dt) => {
      const secs = dt / 1000;

      // clear
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);

      // bg radial glow
      const bgGrd = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.85);
      bgGrd.addColorStop(0, 'rgba(20,18,35,1)');
      bgGrd.addColorStop(1, 'rgba(5,5,12,1)');
      g.fillStyle = bgGrd;
      g.fillRect(0, 0, W, H);

      if (!gameStarted && !gameOver) {
        drawHUD();
        drawGrid();
        houses.forEach(h => drawHouse(h, false));
        drawStartScreen();
        drawCursor();
        return;
      }

      // grid
      drawGrid();

      // wave flash overlay
      if (waveFlash > 0) {
        waveFlash -= secs * 1.5;
        g.fillStyle = `rgba(255,215,64,${Math.max(0, waveFlash) * 0.12})`;
        g.fillRect(0, 0, W, H);
      }

      // houses
      houses.forEach(h => {
        const shaking = h.shakeTime > 0;
        if (shaking) h.shakeTime -= secs;
        drawHouse(h, shaking);
      });

      // combo timer
      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
          comboCount = 0;
        }
      }

      // spawn
      if (!gameOver) {
        spawnTimer -= dt;
        const activePizzas = pizzas.filter(p => !p.grabbed || p.flyProgress < 1).length;
        if (spawnTimer <= 0 && activePizzas < getMaxPizzas()) {
          spawnPizza();
          spawnTimer = getSpawnInterval();
        }
      }

      // update pizzas
      for (let i = pizzas.length - 1; i >= 0; i--) {
        const p = pizzas[i];

        if (p.grabbed) {
          // fly-to-score animation
          p.flyProgress += secs * 3.2;
          if (p.flyProgress >= 1) {
            pizzas.splice(i, 1);
            continue;
          }
          const t = p.flyProgress;
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          p.x = p.flyX + (p.flyTargetX - p.flyX) * ease;
          p.y = p.flyY + (p.flyTargetY - p.flyY) * ease;
          p.r = PIZZA_R * (1 - t * 0.7);
          p.rot += secs * 6;
          // draw fading pizza flying to score
          drawPizza(p, 1 - t * 0.5);
          continue;
        }

        // trail
        p.trail.push({ x: p.x, y: p.y, life: 1 });
        if (p.trail.length > 10) p.trail.shift();
        p.trail.forEach(pt => { pt.life -= secs * 4; });

        // move
        p.x += p.vx * secs;
        p.y += p.vy * secs;
        p.rot += p.rotSpeed * secs;

        // check arrival
        const dx = p.x - p.tx, dy = p.y - p.ty;
        const distSq = dx * dx + dy * dy;
        if (distSq < (PIZZA_R * 1.5) * (PIZZA_R * 1.5)) {
          // delivered!
          lives--;
          p.house.shakeTime = 0.3;
          playDelivered();
          ctx.platform.haptic('heavy');
          pizzas.splice(i, 1);
          comboCount = 0;
          comboTimer = 0;
          // red flash
          particles.push({
            x: p.tx, y: p.ty,
            vx: 0, vy: 0,
            r: 28, color: 'rgba(255,0,0,0.5)',
            life: 0.8, decay: 1.8, type: 'flash',
          });
          if (lives <= 0) {
            gameOver = true;
            gameOverTimer = 1.2;
            playGameOver();
            ctx.platform.fail({ reason: 'too many deliveries' });
          }
          continue;
        }

        // draw trail
        p.trail.forEach((pt, ti) => {
          if (pt.life <= 0) return;
          const tr = p.r * 0.3 * pt.life;
          g.beginPath();
          g.arc(pt.x, pt.y, tr, 0, Math.PI * 2);
          g.fillStyle = `rgba(255,140,0,${pt.life * 0.2})`;
          g.fill();
        });

        // draw path
        drawPath(p);

        // draw pizza
        drawPizza(p);
      }

      // particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= secs * p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        if (p.type === 'flash') {
          g.beginPath();
          g.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
          g.fillStyle = p.color;
          g.fill();
        } else {
          p.x += p.vx * secs;
          p.y += p.vy * secs;
          p.vx *= 0.92;
          p.vy *= 0.92;
          g.beginPath();
          g.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
          g.fillStyle = p.color;
          g.globalAlpha = p.life;
          g.fill();
          g.globalAlpha = 1;
        }
      }

      // flying score texts
      for (let i = flyingScores.length - 1; i >= 0; i--) {
        const fs = flyingScores[i];
        fs.life -= secs * 1.2;
        if (fs.life <= 0) { flyingScores.splice(i, 1); continue; }
        fs.y += fs.vy * secs;
        g.globalAlpha = fs.life;
        g.fillStyle = '#FFD740';
        g.font = `bold 18px monospace`;
        g.textAlign = 'center';
        g.fillText(fs.text, fs.x, fs.y);
        g.globalAlpha = 1;
      }

      // combo pop
      if (comboPop) {
        comboPop.life -= secs * 0.9;
        if (comboPop.life <= 0) {
          comboPop = null;
        } else {
          const scale = 1 + (1 - comboPop.life) * 0.5;
          g.save();
          g.translate(comboPop.x, comboPop.y - 30);
          g.scale(scale, scale);
          g.globalAlpha = comboPop.life;
          g.fillStyle = '#00FFDC';
          g.font = `bold 24px monospace`;
          g.textAlign = 'center';
          g.fillText(comboPop.text, 0, 0);
          g.globalAlpha = 1;
          g.restore();
        }
      }

      // HUD
      drawHUD();

      // wave flash label
      if (waveFlash > 0.5) {
        const a = Math.min(1, (waveFlash - 0.5) * 4);
        g.globalAlpha = a;
        g.fillStyle = '#FFD740';
        g.font = `bold 26px monospace`;
        g.textAlign = 'center';
        g.fillText(`WAVE ${wave}!`, W / 2, H * 0.5);
        g.globalAlpha = 1;
      }

      // game over timer
      if (gameOver) {
        if (gameOverTimer > 0) gameOverTimer -= secs;
        drawGameOver();
      }

      drawCursor();
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
