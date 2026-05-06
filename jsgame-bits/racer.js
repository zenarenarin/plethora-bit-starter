// RACER — Endless Top-Down Lane Racer (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Racer',
    author: 'plethora',
    description: 'Dodge traffic, collect fuel. How far can you go?',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom + 10;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const ACCENT = '#FF6D00';
    const BG = '#0f0f14';

    // Web Audio
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    const voices = [];
    function playTone(freq, type, dur, vol = 0.3) {
      if (!audioCtx) return;
      if (voices.length >= 8) { try { voices[0].stop(); } catch(e){} voices.shift(); }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
      o.onended = () => { const i = voices.indexOf(o); if (i !== -1) voices.splice(i, 1); };
    }
    function playCrash() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.4, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      src.start();
    }
    function playFuel() { playTone(660, 'sine', 0.15, 0.25); }
    function playNearMiss() { playTone(220, 'sawtooth', 0.1, 0.15); }
    function playGameOver() {
      if (!audioCtx) return;
      [400, 320, 260, 200].forEach((f, i) => {
        setTimeout(() => playTone(f, 'sawtooth', 0.2, 0.3), i * 120);
      });
    }

    // Road layout
    const LANE_COUNT = 3;
    const ROAD_LEFT = W * 0.1;
    const ROAD_RIGHT = W * 0.9;
    const ROAD_W = ROAD_RIGHT - ROAD_LEFT;
    const LANE_W = ROAD_W / LANE_COUNT;
    function laneX(lane) { return ROAD_LEFT + (lane + 0.5) * LANE_W; }

    // HUD height
    const HUD_H = 48;

    // Game state
    let player, traffic, fuels, particles, sparks, score, gameOver, started, lane;
    let speed, distance, spawnT, fuelT, speedT, fuel, highScore;

    function initGame() {
      highScore = ctx.storage.get('hs_racer') || 0;
      lane = 1; // center
      player = { x: laneX(1), y: H * 0.78, targetX: laneX(1), w: 28, h: 44 };
      traffic = []; fuels = []; particles = []; sparks = [];
      score = 0; gameOver = false; started = false;
      speed = 280; distance = 0; spawnT = 0; fuelT = 0; speedT = 0;
      fuel = 80; // 0–100
    }

    // Car drawing helpers (pixel-art style with canvas rects)
    function drawPlayerCar(x, y) {
      const w = player.w, h = player.h;
      // Body
      g.fillStyle = ACCENT;
      g.fillRect(x - w / 2, y - h / 2, w, h);
      // Roof
      g.fillStyle = '#FF9A40';
      g.fillRect(x - w * 0.35, y - h / 2 + 6, w * 0.7, h * 0.45);
      // Windows
      g.fillStyle = '#88CCFF';
      g.fillRect(x - w * 0.28, y - h / 2 + 8, w * 0.56, h * 0.25);
      // Headlights
      g.fillStyle = '#FFFFCC';
      g.fillRect(x - w / 2 + 2, y - h / 2, 7, 5);
      g.fillRect(x + w / 2 - 9, y - h / 2, 7, 5);
      // Taillights
      g.fillStyle = '#FF2200';
      g.fillRect(x - w / 2 + 2, y + h / 2 - 5, 7, 5);
      g.fillRect(x + w / 2 - 9, y + h / 2 - 5, 7, 5);
      // Wheels
      g.fillStyle = '#222';
      g.fillRect(x - w / 2 - 4, y - h * 0.3, 6, 10);
      g.fillRect(x + w / 2 - 2, y - h * 0.3, 6, 10);
      g.fillRect(x - w / 2 - 4, y + h * 0.1, 6, 10);
      g.fillRect(x + w / 2 - 2, y + h * 0.1, 6, 10);
    }

    const TRAFFIC_COLORS = ['#E53935', '#1E88E5', '#43A047', '#8E24AA', '#00ACC1', '#F4511E'];
    function drawTrafficCar(car) {
      const w = car.w, h = car.h;
      const x = car.x, y = car.y;
      g.fillStyle = car.color;
      g.fillRect(x - w / 2, y - h / 2, w, h);
      g.fillStyle = '#aaa';
      g.fillRect(x - w * 0.3, y - h / 2 + 6, w * 0.6, h * 0.4);
      g.fillStyle = '#88CCFF';
      g.fillRect(x - w * 0.25, y - h / 2 + 8, w * 0.5, h * 0.22);
      g.fillStyle = '#FFFFCC';
      g.fillRect(x - w / 2 + 2, y + h / 2 - 5, 6, 5);
      g.fillRect(x + w / 2 - 8, y + h / 2 - 5, 6, 5);
      g.fillStyle = '#222';
      g.fillRect(x - w / 2 - 3, y - h * 0.25, 5, 9);
      g.fillRect(x + w / 2 - 2, y - h * 0.25, 5, 9);
      g.fillRect(x - w / 2 - 3, y + h * 0.12, 5, 9);
      g.fillRect(x + w / 2 - 2, y + h * 0.12, 5, 9);
    }

    function spawnTrafficCar() {
      const l = Math.floor(Math.random() * LANE_COUNT);
      traffic.push({
        x: laneX(l), y: HUD_H - 60,
        w: 26, h: 42,
        lane: l,
        vy: speed * (0.6 + Math.random() * 0.3),
        color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
      });
    }

    function spawnFuel() {
      const l = Math.floor(Math.random() * LANE_COUNT);
      fuels.push({ x: laneX(l), y: HUD_H - 30, vy: speed * 0.65 });
    }

    function addSparks(x, y, n = 6) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 100;
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.3 });
      }
    }

    function addExplosion(x, y) {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const sp = 80 + Math.random() * 140;
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 + Math.random() * 0.5, col: i % 2 === 0 ? '#FF6D00' : '#FFD740' });
      }
    }

    // Road scroll
    let roadOffset = 0;

    // Info overlay
    let showInfo = false;

    const IBTN = { x: W - 22, y: 8 + HUD_H / 2, r: 14 };

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const tx = t.clientX, ty = t.clientY;

      // IBTN check first
      if (Math.hypot(tx - IBTN.x, ty - IBTN.y) < IBTN.r + 6) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (gameOver) { initGame(); return; }

      if (!started) { started = true; ctx.platform.start(); }

      // Lane switch: left half = left, right half = right
      if (tx < W / 2) {
        if (lane > 0) lane--;
      } else {
        if (lane < LANE_COUNT - 1) lane++;
      }
      player.targetX = laneX(lane);
      ctx.platform.interact({ type: 'tap' });
      ctx.platform.haptic('light');
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    initGame();

    ctx.raf((dt) => {
      const sec = dt / 1000;

      if (!gameOver && started) {
        // Speed ramp every 10s
        speedT += dt;
        if (speedT >= 10000) {
          speed += 30;
          speedT = 0;
        }

        // Move player toward target lane
        const dx = player.targetX - player.x;
        player.x += dx * Math.min(1, sec * 8);

        // Road scroll
        roadOffset = (roadOffset + speed * sec) % 80;

        // Distance score
        distance += speed * sec / 100;
        score = Math.floor(distance);

        // Fuel drains
        fuel -= sec * 8;
        if (fuel <= 0) {
          fuel = 0;
          // No fuel = game over
          gameOver = true;
          addExplosion(player.x, player.y);
          playCrash();
          playGameOver();
          if (score > highScore) { highScore = score; ctx.storage.set('hs_racer', highScore); }
          ctx.platform.fail({ reason: 'out of fuel' });
        }

        // Spawn traffic
        spawnT -= dt;
        const interval = Math.max(600, 1400 - speed * 0.8);
        if (spawnT <= 0) { spawnTrafficCar(); spawnT = interval * (0.7 + Math.random() * 0.6); }

        // Spawn fuel pickups
        fuelT -= dt;
        if (fuelT <= 0) { spawnFuel(); fuelT = 3500 + Math.random() * 2000; }

        // Update traffic
        traffic = traffic.filter(car => {
          car.y += car.vy * sec;
          // Near-miss: close but not colliding
          const dx2 = Math.abs(player.x - car.x);
          const dy2 = Math.abs(player.y - car.y);
          if (dx2 < 40 && dy2 < 60 && dy2 > 30) {
            addSparks((player.x + car.x) / 2, (player.y + car.y) / 2, 4);
            playNearMiss();
          }
          // Collision
          if (dx2 < 25 && dy2 < 38) {
            gameOver = true;
            addExplosion(player.x, player.y);
            playCrash();
            playGameOver();
            if (score > highScore) { highScore = score; ctx.storage.set('hs_racer', highScore); }
            ctx.platform.fail({ reason: 'crashed' });
          }
          return car.y < H + 80;
        });

        // Update fuel pickups
        fuels = fuels.filter(f => {
          f.y += f.vy * sec;
          if (Math.hypot(player.x - f.x, player.y - f.y) < 28) {
            fuel = Math.min(100, fuel + 35);
            playFuel();
            ctx.platform.haptic('medium');
            score += 50;
            return false;
          }
          return f.y < H + 40;
        });

        // Update particles
        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec; p.vy += 80 * sec;
          p.life -= sec; return p.life > 0;
        });
        sparks = sparks.filter(sp => {
          sp.x += sp.vx * sec; sp.y += sp.vy * sec;
          sp.life -= sec; return sp.life > 0;
        });

        ctx.platform.setScore(score);
        ctx.platform.setProgress(Math.min(1, score / 2000));
      }

      // ===== DRAW =====
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // Road area
      g.fillStyle = '#1a1a22';
      g.fillRect(ROAD_LEFT, HUD_H, ROAD_W, H - HUD_H);

      // Road edges
      g.strokeStyle = '#444';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(ROAD_LEFT, HUD_H); g.lineTo(ROAD_LEFT, H); g.stroke();
      g.beginPath(); g.moveTo(ROAD_RIGHT, HUD_H); g.lineTo(ROAD_RIGHT, H); g.stroke();

      // Lane dividers (scrolling dashes)
      g.strokeStyle = '#444';
      g.lineWidth = 2;
      g.setLineDash([30, 50]);
      g.lineDashOffset = -roadOffset;
      for (let i = 1; i < LANE_COUNT; i++) {
        const lx = ROAD_LEFT + i * LANE_W;
        g.beginPath(); g.moveTo(lx, HUD_H); g.lineTo(lx, H); g.stroke();
      }
      g.setLineDash([]);
      g.lineDashOffset = 0;

      // Fuel pickups
      fuels.forEach(f => {
        g.fillStyle = '#76FF03';
        g.beginPath(); g.arc(f.x, f.y, 10, 0, Math.PI * 2); g.fill();
        g.fillStyle = BG;
        g.font = 'bold 10px monospace';
        g.textAlign = 'center';
        g.fillText('F', f.x, f.y + 4);
      });

      // Traffic cars
      traffic.forEach(car => drawTrafficCar(car));

      // Sparks
      sparks.forEach(sp => {
        g.globalAlpha = Math.max(0, sp.life / 0.4);
        g.fillStyle = '#FFD740';
        g.fillRect(sp.x - 2, sp.y - 2, 4, 4);
      });
      g.globalAlpha = 1;

      // Explosion particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.8);
        g.fillStyle = p.col;
        g.fillRect(p.x - 3, p.y - 3, 6, 6);
      });
      g.globalAlpha = 1;

      // Player car
      if (!gameOver) drawPlayerCar(player.x, player.y);

      // HUD bar
      g.fillStyle = '#13131a';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      // Title
      g.fillStyle = ACCENT;
      g.font = 'bold 18px "Courier New"';
      g.textAlign = 'left';
      g.fillText('RACER', 16, 24);

      // Score
      g.fillStyle = '#fff';
      g.font = 'bold 16px "Courier New"';
      g.textAlign = 'right';
      g.fillText(score, W - 50, 24);

      // Fuel bar
      const fuelBarW = 80;
      g.fillStyle = '#333';
      g.fillRect(16, 30, fuelBarW, 8);
      const fuelCol = fuel > 40 ? '#76FF03' : fuel > 20 ? '#FFEB3B' : '#FF1744';
      g.fillStyle = fuelCol;
      g.fillRect(16, 30, fuelBarW * (fuel / 100), 8);
      g.fillStyle = '#aaa';
      g.font = '9px "Courier New"';
      g.textAlign = 'left';
      g.fillText('FUEL', 102, 38);

      // High score
      g.fillStyle = '#888';
      g.font = '10px "Courier New"';
      g.textAlign = 'right';
      g.fillText('BEST ' + highScore, W - 50, 40);

      // IBTN (info button) drawn LAST
      g.fillStyle = '#222';
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ACCENT;
      g.font = 'bold 14px "Courier New"';
      g.textAlign = 'center';
      g.fillText('i', IBTN.x, IBTN.y + 5);

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.85)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = ACCENT;
        g.font = 'bold 22px "Courier New"';
        g.textAlign = 'center';
        g.fillText('HOW TO PLAY', W / 2, H / 2 - 100);
        g.fillStyle = '#fff';
        g.font = '16px "Courier New"';
        const lines = [
          'Tap LEFT side → move left',
          'Tap RIGHT side → move right',
          '',
          'Dodge oncoming cars.',
          'Collect FUEL pickups.',
          '',
          'Speed increases over time.',
          'Score = distance traveled.',
        ];
        lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 - 60 + i * 26));
        g.fillStyle = '#888';
        g.font = '13px "Courier New"';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, H / 2 + 160);
        g.textAlign = 'left';
        return;
      }

      // Start overlay
      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.65)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = ACCENT;
        g.font = 'bold 30px "Courier New"';
        g.textAlign = 'center';
        g.fillText('RACER', W / 2, H / 2 - 30);
        g.fillStyle = '#fff';
        g.font = '16px "Courier New"';
        g.fillText('Tap left/right to switch lanes', W / 2, H / 2 + 10);
        g.fillText('Collect fuel. Dodge traffic.', W / 2, H / 2 + 36);
        g.fillStyle = ACCENT;
        g.font = 'bold 14px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 70);
        g.textAlign = 'left';
      }

      // Game over overlay
      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, HUD_H, W, H - HUD_H);
        g.fillStyle = '#FF1744';
        g.font = 'bold 36px "Courier New"';
        g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 40);
        g.fillStyle = ACCENT;
        g.font = 'bold 20px "Courier New"';
        g.fillText('SCORE: ' + score, W / 2, H / 2);
        g.fillStyle = '#FFD740';
        g.font = '16px "Courier New"';
        g.fillText('BEST: ' + highScore, W / 2, H / 2 + 28);
        g.fillStyle = '#fff';
        g.font = '15px "Courier New"';
        g.fillText('TAP TO RESTART', W / 2, H / 2 + 65);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
