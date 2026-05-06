// PUSH BACK — Water Current Boat-Docking Game (Plethora Bit)

// Helper: rounded-rectangle path
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
    title: 'Push Back',
    author: 'plethora',
    description: 'Tap to create currents — guide boats home.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Colours ────────────────────────────────────────────────────────────
    const BG       = '#0a1628';
    const ACCENT   = '#FFD740';
    const HUD_H    = 48;
    const PLAY_TOP = HUD_H + 4;
    const PLAY_BOT = H - SAFE - 4;

    const BOAT_COLORS = ['#FF6B6B', '#4ECDC4', '#95E1A5', '#C5A3FF', '#FFB347'];
    const DOCK_BORDER = ['#FF9999', '#88EDE8', '#C2F2CE', '#DCC8FF', '#FFD09A'];

    // ── Audio ───────────────────────────────────────────────────────────────
    let audioCtx = null;
    const voices = [];
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol = 0.25, detune = 0) {
      if (!audioCtx) return;
      while (voices.length >= 12) { try { voices.shift().stop(); } catch(e){} }
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      o.detune.setValueAtTime(detune, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      voices.push(o);
    }
    function playSplash() {
      // whoosh noise via triangle sweep
      playTone(340, 'triangle', 0.18, 0.18);
      playTone(260, 'sine',     0.22, 0.12, -200);
    }
    function playDock() {
      // satisfying bell
      [523, 659, 784].forEach((f, i) =>
        setTimeout(() => playTone(f, 'sine', 0.45, 0.22), i * 60));
    }
    function playLevelComplete() {
      [523, 587, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => playTone(f, 'sine', 0.35, 0.28), i * 90));
    }
    function playTimeout() {
      [320, 260, 200, 140].forEach((f, i) =>
        setTimeout(() => playTone(f, 'sawtooth', 0.25, 0.22), i * 100));
    }

    // ── Physics constants ───────────────────────────────────────────────────
    const DRAG        = 0.97;   // velocity damping per frame
    const MAX_SPEED   = 80;     // px/s
    const DOCK_R      = 40;     // dock snap radius
    const DOCK_SPEED  = 30;     // max speed to dock
    const CURRENT_R   = 60;     // tap current radius
    const CURRENT_DUR = 1500;   // ms current lives
    const ROCK_R      = 18;     // rock collision radius

    // ── Level definitions ───────────────────────────────────────────────────
    // Each level: { boats: [{x,y,colorIdx}], docks: [{x,y,side,colorIdx}], rocks: [{x,y}] }
    // Positions are fractions of play area width/height.
    function buildLevels() {
      const pw = W;
      const ph = PLAY_BOT - PLAY_TOP;
      const cx = pw / 2, cy = ph / 2 + PLAY_TOP;

      const dockMargin = 32;

      return [
        // Level 1 — 1 boat, 1 dock, no rocks
        {
          boats: [{ x: cx, y: cy, ci: 0 }],
          docks: [{ x: W - dockMargin, y: cy, ci: 0 }],
          rocks: [],
        },
        // Level 2 — 2 boats, 2 docks
        {
          boats: [
            { x: cx - pw * 0.2, y: cy - ph * 0.15, ci: 1 },
            { x: cx + pw * 0.2, y: cy + ph * 0.15, ci: 2 },
          ],
          docks: [
            { x: dockMargin, y: cy - ph * 0.15, ci: 1 },
            { x: W - dockMargin, y: cy + ph * 0.15, ci: 2 },
          ],
          rocks: [],
        },
        // Level 3 — 3 boats, 3 docks, 2 rocks
        {
          boats: [
            { x: cx, y: PLAY_TOP + ph * 0.2, ci: 0 },
            { x: cx - pw * 0.25, y: cy + ph * 0.1, ci: 3 },
            { x: cx + pw * 0.25, y: cy - ph * 0.1, ci: 4 },
          ],
          docks: [
            { x: cx, y: PLAY_BOT - dockMargin, ci: 0 },
            { x: dockMargin, y: cy + ph * 0.1, ci: 3 },
            { x: W - dockMargin, y: cy - ph * 0.1, ci: 4 },
          ],
          rocks: [
            { x: cx - pw * 0.1, y: cy },
            { x: cx + pw * 0.1, y: cy - ph * 0.1 },
          ],
        },
        // Level 4 — 4 boats, 4 docks, 3 rocks
        {
          boats: [
            { x: cx - pw * 0.3, y: PLAY_TOP + ph * 0.15, ci: 0 },
            { x: cx + pw * 0.3, y: PLAY_TOP + ph * 0.15, ci: 1 },
            { x: cx - pw * 0.3, y: PLAY_BOT - ph * 0.15, ci: 2 },
            { x: cx + pw * 0.3, y: PLAY_BOT - ph * 0.15, ci: 3 },
          ],
          docks: [
            { x: dockMargin, y: PLAY_TOP + ph * 0.15, ci: 0 },
            { x: W - dockMargin, y: PLAY_TOP + ph * 0.15, ci: 1 },
            { x: dockMargin, y: PLAY_BOT - ph * 0.15, ci: 2 },
            { x: W - dockMargin, y: PLAY_BOT - ph * 0.15, ci: 3 },
          ],
          rocks: [
            { x: cx, y: cy - ph * 0.15 },
            { x: cx - pw * 0.15, y: cy + ph * 0.1 },
            { x: cx + pw * 0.15, y: cy + ph * 0.1 },
          ],
        },
        // Level 5 — 5 boats, 5 docks, 4 rocks
        {
          boats: [
            { x: cx, y: cy, ci: 4 },
            { x: cx - pw * 0.3, y: PLAY_TOP + ph * 0.1, ci: 0 },
            { x: cx + pw * 0.3, y: PLAY_TOP + ph * 0.1, ci: 1 },
            { x: cx - pw * 0.3, y: PLAY_BOT - ph * 0.1, ci: 2 },
            { x: cx + pw * 0.3, y: PLAY_BOT - ph * 0.1, ci: 3 },
          ],
          docks: [
            { x: cx, y: PLAY_BOT - dockMargin, ci: 4 },
            { x: dockMargin, y: PLAY_TOP + ph * 0.1, ci: 0 },
            { x: W - dockMargin, y: PLAY_TOP + ph * 0.1, ci: 1 },
            { x: dockMargin, y: PLAY_BOT - ph * 0.1, ci: 2 },
            { x: W - dockMargin, y: PLAY_BOT - ph * 0.1, ci: 3 },
          ],
          rocks: [
            { x: cx - pw * 0.15, y: cy - ph * 0.2 },
            { x: cx + pw * 0.15, y: cy - ph * 0.2 },
            { x: cx - pw * 0.15, y: cy + ph * 0.15 },
            { x: cx + pw * 0.15, y: cy + ph * 0.15 },
          ],
        },
      ];
    }

    // ── State ───────────────────────────────────────────────────────────────
    let levels;
    let levelIdx = 0;
    let boats = [];       // { x, y, vx, vy, ci, docked, dockedPulse }
    let docks = [];       // { x, y, ci, filled }
    let rocks = [];       // { x, y }
    let currents = [];    // { x, y, age, maxAge }
    let particles = [];   // { x, y, vx, vy, life, maxLife, r, color }
    let waveRings = [];   // { x, y, r, maxR, age, maxAge } — background shimmer
    let timer = 0;        // seconds remaining
    let score = 0;
    let bestLevel = 0;
    let started = false;
    let gameOver = false;
    let levelWon = false;
    let showInfo = false;
    let totalTime = 0;    // total time for this level
    let globalTime = 0;   // elapsed ms

    const IBTN = { x: W - 22, y: 22, r: 14 };

    // ── Helpers ─────────────────────────────────────────────────────────────
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

    function levelTime(n) {
      // 20s + 5s per extra boat
      const bCount = levels[n % levels.length].boats.length;
      return 20 + (bCount - 1) * 5;
    }

    function extraBoatsForLoop(loopN) {
      // After all 5 levels, add 1 boat per loop pass (up to 3 extra)
      return Math.min(loopN, 3);
    }

    function buildLevel(idx) {
      const loopN = Math.floor(idx / levels.length);
      const baseIdx = idx % levels.length;
      const def = levels[baseIdx];

      boats = def.boats.map(b => ({
        x: b.x, y: b.y, vx: 0, vy: 0,
        ci: b.ci, docked: false, dockedPulse: 0,
      }));

      // Add extra boats for looped levels
      const extra = extraBoatsForLoop(loopN);
      for (let e = 0; e < extra; e++) {
        const ci = (boats.length) % BOAT_COLORS.length;
        const ph = PLAY_BOT - PLAY_TOP;
        boats.push({
          x: W * 0.5 + (Math.random() - 0.5) * W * 0.3,
          y: PLAY_TOP + ph * (0.3 + Math.random() * 0.4),
          vx: 0, vy: 0,
          ci, docked: false, dockedPulse: 0,
        });
        // Add matching dock
        const dockMargin = 32;
        const side = e % 2;
        docks.push({
          x: side === 0 ? dockMargin : W - dockMargin,
          y: PLAY_TOP + ph * (0.25 + e * 0.15),
          ci, filled: false,
        });
      }

      docks = [
        ...def.docks.map(d => ({ x: d.x, y: d.y, ci: d.ci, filled: false })),
        ...docks.slice(def.boats.length),
      ];
      rocks = def.rocks.map(r => ({ x: r.x, y: r.y }));
      currents = [];
      particles = [];
      timer = levelTime(idx);
      totalTime = timer;
      gameOver = false;
      levelWon = false;
    }

    function spawnCurrentParticles(cx, cy) {
      const count = 14;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const r = CURRENT_R * (0.4 + Math.random() * 0.6);
        particles.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          vx: -Math.sin(angle) * (30 + Math.random() * 40),
          vy:  Math.cos(angle) * (30 + Math.random() * 40),
          life: 1, maxLife: 0.6 + Math.random() * 0.6,
          r: 2 + Math.random() * 2.5,
          color: Math.random() < 0.6 ? '#9dd8ff' : '#ffffff',
        });
      }
    }

    function spawnDockParticles(dx, dy, ci) {
      const col = BOAT_COLORS[ci];
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 80;
        particles.push({
          x: dx, y: dy,
          vx: Math.cos(angle) * sp,
          vy: Math.sin(angle) * sp,
          life: 1, maxLife: 0.5 + Math.random() * 0.5,
          r: 3 + Math.random() * 3,
          color: col,
        });
      }
    }

    function addWaveRing(x, y) {
      waveRings.push({ x, y, r: 0, maxR: CURRENT_R * 1.4, age: 0, maxAge: 0.6 });
    }

    // ── Physics update ──────────────────────────────────────────────────────
    function update(dt) {
      const dtS = dt / 1000;

      // Countdown timer
      if (!gameOver && !levelWon && started) {
        timer -= dtS;
        if (timer <= 0) {
          timer = 0;
          gameOver = true;
          playTimeout();
        }
      }

      // Update currents
      for (let i = currents.length - 1; i >= 0; i--) {
        currents[i].age += dt;
        if (currents[i].age >= currents[i].maxAge) currents.splice(i, 1);
      }

      // Update boats
      for (const boat of boats) {
        if (boat.docked) {
          boat.dockedPulse = (boat.dockedPulse || 0) + dtS * 2;
          continue;
        }

        // Apply current forces (tangential)
        for (const cur of currents) {
          const dx = boat.x - cur.x;
          const dy = boat.y - cur.y;
          const d = Math.hypot(dx, dy);
          if (d < CURRENT_R && d > 1) {
            const t = 1 - cur.age / cur.maxAge;          // time-based strength
            const falloff = 1 - (d / CURRENT_R);         // distance falloff
            const strength = t * falloff * 220 * dtS;    // tangential push
            // Tangent vector (perpendicular to radial, counter-clockwise)
            const tx = -dy / d;
            const ty =  dx / d;
            boat.vx += tx * strength;
            boat.vy += ty * strength;
          }
        }

        // Drag
        boat.vx *= Math.pow(DRAG, dt / 16.67);
        boat.vy *= Math.pow(DRAG, dt / 16.67);

        // Clamp speed
        const spd = Math.hypot(boat.vx, boat.vy);
        if (spd > MAX_SPEED) {
          boat.vx = (boat.vx / spd) * MAX_SPEED;
          boat.vy = (boat.vy / spd) * MAX_SPEED;
        }

        // Move
        boat.x += boat.vx * dtS;
        boat.y += boat.vy * dtS;

        // Bounce off play area walls
        if (boat.x < 14) { boat.x = 14; boat.vx = Math.abs(boat.vx) * 0.5; }
        if (boat.x > W - 14) { boat.x = W - 14; boat.vx = -Math.abs(boat.vx) * 0.5; }
        if (boat.y < PLAY_TOP + 14) { boat.y = PLAY_TOP + 14; boat.vy = Math.abs(boat.vy) * 0.5; }
        if (boat.y > PLAY_BOT - 14) { boat.y = PLAY_BOT - 14; boat.vy = -Math.abs(boat.vy) * 0.5; }

        // Rock collision
        for (const rock of rocks) {
          const d = dist(boat.x, boat.y, rock.x, rock.y);
          const minD = ROCK_R + 14;
          if (d < minD && d > 0.1) {
            const nx = (boat.x - rock.x) / d;
            const ny = (boat.y - rock.y) / d;
            // Push boat out
            boat.x = rock.x + nx * minD;
            boat.y = rock.y + ny * minD;
            // Reflect velocity
            const dot = boat.vx * nx + boat.vy * ny;
            boat.vx -= 2 * dot * nx * 0.6;
            boat.vy -= 2 * dot * ny * 0.6;
          }
        }

        // Check dock collision
        for (const dock of docks) {
          if (dock.filled) continue;
          if (dock.ci !== boat.ci) continue;
          const d = dist(boat.x, boat.y, dock.x, dock.y);
          const spd = Math.hypot(boat.vx, boat.vy);
          if (d < DOCK_R && spd < DOCK_SPEED) {
            boat.docked = true;
            boat.x = dock.x;
            boat.y = dock.y;
            boat.vx = 0; boat.vy = 0;
            dock.filled = true;
            score += 100 + Math.round(timer * 5);
            ctx.platform.setScore(score);
            ctx.platform.haptic('medium');
            playDock();
            spawnDockParticles(dock.x, dock.y, boat.ci);
            break;
          }
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dtS;
        p.y += p.vy * dtS;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= dtS / p.maxLife;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Wave rings
      for (let i = waveRings.length - 1; i >= 0; i--) {
        const wr = waveRings[i];
        wr.age += dtS;
        wr.r = (wr.age / wr.maxAge) * wr.maxR;
        if (wr.age >= wr.maxAge) waveRings.splice(i, 1);
      }

      // Background ambient rings
      globalTime += dt;
      if (globalTime % 2800 < dt * 2) {
        // periodic ambient shimmers
        const rx = 30 + Math.random() * (W - 60);
        const ry = PLAY_TOP + 20 + Math.random() * (PLAY_BOT - PLAY_TOP - 40);
        waveRings.push({ x: rx, y: ry, r: 0, maxR: 35 + Math.random() * 40, age: 0, maxAge: 1.2 });
      }

      // Check level won
      if (!levelWon && !gameOver && boats.every(b => b.docked)) {
        levelWon = true;
        ctx.platform.haptic('heavy');
        playLevelComplete();
        if (levelIdx + 1 > bestLevel) {
          bestLevel = levelIdx + 1;
          ctx.storage.set('pb_bestLevel', bestLevel);
        }
        // auto-advance after 2s
        setTimeout(() => {
          levelIdx++;
          buildLevel(levelIdx);
        }, 2000);
      }
    }

    // ── Draw helpers ─────────────────────────────────────────────────────────
    function drawBoat(bx, by, ci, alpha = 1) {
      const col = BOAT_COLORS[ci];
      g.save();
      g.globalAlpha = alpha;
      g.translate(bx, by);

      // Hull
      g.beginPath();
      roundRectC(g, -14, -8, 28, 16, 5);
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 1.5;
      g.stroke();

      // Cabin
      g.beginPath();
      roundRectC(g, -6, -13, 12, 10, 3);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fill();

      // Bow accent
      g.beginPath();
      g.moveTo(14, 0);
      g.lineTo(19, -4);
      g.lineTo(19, 4);
      g.closePath();
      g.fillStyle = col;
      g.fill();

      g.restore();
    }

    function drawDock(dx, dy, ci, filled) {
      const col = BOAT_COLORS[ci];
      const border = DOCK_BORDER[ci];
      g.save();
      g.translate(dx, dy);

      // Glow when filled
      if (filled) {
        const grd = g.createRadialGradient(0, 0, 4, 0, 0, DOCK_R);
        grd.addColorStop(0, col + '88');
        grd.addColorStop(1, 'transparent');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(0, 0, DOCK_R, 0, Math.PI * 2);
        g.fill();
      }

      // Dock square
      const s = 24;
      g.beginPath();
      roundRectC(g, -s / 2, -s / 2, s, s, 5);
      g.fillStyle = filled ? col : BG;
      g.fill();
      g.strokeStyle = filled ? '#ffffffaa' : border;
      g.lineWidth = 2.5;
      g.stroke();

      // Arrow pointing inward (toward center of play area)
      if (!filled) {
        const cx2 = W / 2, cy2 = (PLAY_TOP + PLAY_BOT) / 2;
        const angle = Math.atan2(cy2 - dy, cx2 - dx);
        g.save();
        g.rotate(angle);
        g.beginPath();
        g.moveTo(s * 0.5 + 6, 0);
        g.lineTo(s * 0.5 + 16, -6);
        g.lineTo(s * 0.5 + 16, 6);
        g.closePath();
        g.fillStyle = border;
        g.fill();
        g.restore();
      }

      g.restore();
    }

    function drawCurrent(cur) {
      const t = 1 - cur.age / cur.maxAge;
      const alpha = t;
      const spin = (cur.age / cur.maxAge) * Math.PI * 3;

      // Expanding ring
      const expandR = CURRENT_R * (0.3 + 0.7 * (cur.age / cur.maxAge));
      const grd = g.createRadialGradient(cur.x, cur.y, 0, cur.x, cur.y, expandR);
      grd.addColorStop(0, `rgba(100,190,255,${0.3 * alpha})`);
      grd.addColorStop(0.5, `rgba(160,220,255,${0.45 * alpha})`);
      grd.addColorStop(1, `rgba(100,190,255,0)`);
      g.beginPath();
      g.arc(cur.x, cur.y, expandR, 0, Math.PI * 2);
      g.fillStyle = grd;
      g.fill();

      // Spiral arms
      g.save();
      g.translate(cur.x, cur.y);
      g.rotate(spin);
      const arms = 3;
      for (let a = 0; a < arms; a++) {
        const armAngle = (a / arms) * Math.PI * 2;
        g.save();
        g.rotate(armAngle);
        g.beginPath();
        for (let s = 0; s < 20; s++) {
          const frac = s / 19;
          const r = frac * CURRENT_R * 0.9;
          const ang = frac * Math.PI * 1.2;
          const px = Math.cos(ang) * r;
          const py = Math.sin(ang) * r;
          if (s === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.strokeStyle = `rgba(180,230,255,${0.55 * alpha})`;
        g.lineWidth = 1.5;
        g.stroke();
        g.restore();
      }
      g.restore();
    }

    function drawRock(rx, ry) {
      g.save();
      g.translate(rx, ry);
      // Irregular polygon
      const verts = 6;
      g.beginPath();
      for (let i = 0; i < verts; i++) {
        const angle = (i / verts) * Math.PI * 2 - Math.PI / 6;
        const r = ROCK_R * (0.75 + (i % 3 === 0 ? 0.25 : 0.1));
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle = '#2a3a55';
      g.fill();
      g.strokeStyle = '#4a5f80';
      g.lineWidth = 1.5;
      g.stroke();
      // Highlight
      g.beginPath();
      g.arc(-ROCK_R * 0.25, -ROCK_R * 0.3, ROCK_R * 0.2, 0, Math.PI * 2);
      g.fillStyle = 'rgba(120,150,200,0.25)';
      g.fill();
      g.restore();
    }

    function drawWaveShimmer(t) {
      // Animated subtle horizontal wave lines in background
      g.save();
      g.globalAlpha = 0.045;
      const lineCount = 10;
      const ph = PLAY_BOT - PLAY_TOP;
      for (let i = 0; i < lineCount; i++) {
        const yBase = PLAY_TOP + (i / lineCount) * ph;
        const offset = (t * 0.00012 + i * 0.37) % 1;
        g.beginPath();
        for (let x = 0; x <= W; x += 6) {
          const wave = Math.sin((x * 0.018) + offset * Math.PI * 2 + i) * 4;
          if (x === 0) g.moveTo(x, yBase + wave);
          else g.lineTo(x, yBase + wave);
        }
        g.strokeStyle = '#6ba8d8';
        g.lineWidth = 1.2;
        g.stroke();
      }
      g.restore();
    }

    function drawHUD() {
      // HUD background
      g.fillStyle = 'rgba(10,22,40,0.88)';
      g.fillRect(0, 0, W, HUD_H);

      // Level label
      g.font = 'bold 14px sans-serif';
      g.fillStyle = '#9bb8d8';
      g.textAlign = 'left';
      g.fillText('LEVEL', 14, 18);
      g.font = 'bold 22px sans-serif';
      g.fillStyle = ACCENT;
      g.fillText(levelIdx + 1, 14, 40);

      // Timer bar
      const barX = 60, barY = 14, barW = W - 120, barH = 10;
      const frac = clamp(timer / totalTime, 0, 1);
      g.beginPath();
      roundRectC(g, barX, barY, barW, barH, 5);
      g.fillStyle = '#1a2a44';
      g.fill();

      const barColor = frac > 0.4 ? '#4ECDC4' : frac > 0.2 ? ACCENT : '#FF6B6B';
      g.beginPath();
      roundRectC(g, barX, barY, barW * frac, barH, 5);
      g.fillStyle = barColor;
      g.fill();

      // Timer text
      g.font = 'bold 13px monospace';
      g.textAlign = 'center';
      g.fillStyle = '#c8dff0';
      g.fillText(Math.ceil(timer) + 's', barX + barW / 2, barY + barH - 0.5);

      // Boats remaining
      const undocked = boats.filter(b => !b.docked).length;
      g.font = 'bold 12px sans-serif';
      g.textAlign = 'right';
      g.fillStyle = '#9bb8d8';
      g.fillText('BOATS', W - 50, 18);
      g.font = 'bold 20px sans-serif';
      g.fillStyle = undocked === 0 ? '#95E1A5' : '#c8dff0';
      g.fillText(undocked, W - 50, 39);

      // Info button
      g.beginPath();
      g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,215,64,0.15)';
      g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.stroke();
      g.font = 'bold 14px sans-serif';
      g.textAlign = 'center';
      g.fillStyle = ACCENT;
      g.fillText('i', IBTN.x, IBTN.y + 5);
    }

    function drawGameOver() {
      g.save();
      g.fillStyle = 'rgba(10,22,40,0.78)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.font = 'bold 32px sans-serif';
      g.fillStyle = '#FF6B6B';
      g.fillText("TIME'S UP", W / 2, H / 2 - 40);
      g.font = '18px sans-serif';
      g.fillStyle = '#9bb8d8';
      g.fillText('Score: ' + score, W / 2, H / 2 + 4);
      g.fillText('Best level reached: ' + bestLevel, W / 2, H / 2 + 30);
      g.font = 'bold 16px sans-serif';
      g.fillStyle = ACCENT;
      g.fillText('Tap to try again', W / 2, H / 2 + 68);
      g.restore();
    }

    function drawLevelWon() {
      g.save();
      g.fillStyle = 'rgba(10,22,40,0.7)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.font = 'bold 28px sans-serif';
      g.fillStyle = '#95E1A5';
      g.fillText('ALL DOCKED!', W / 2, H / 2 - 24);
      g.font = '16px sans-serif';
      g.fillStyle = '#c8dff0';
      g.fillText('+' + score + ' pts', W / 2, H / 2 + 12);
      g.font = '14px sans-serif';
      g.fillStyle = '#9bb8d8';
      g.fillText('Next level loading…', W / 2, H / 2 + 40);
      g.restore();
    }

    function drawInfoPanel() {
      const px = 18, py = HUD_H + 14;
      const pw2 = W - 36, ph2 = PLAY_BOT - py - 14;
      g.save();
      g.fillStyle = 'rgba(10,22,40,0.94)';
      roundRectC(g, px, py, pw2, ph2, 14);
      g.fill();
      g.strokeStyle = ACCENT + '66';
      g.lineWidth = 1.5;
      roundRectC(g, px, py, pw2, ph2, 14);
      g.stroke();

      g.textAlign = 'center';
      g.fillStyle = ACCENT;
      g.font = 'bold 20px sans-serif';
      g.fillText('How to Play', W / 2, py + 34);

      const lines = [
        'Tap the water to create a current swirl.',
        'Each swirl pushes nearby boats with a',
        'circular tangential force.',
        '',
        'Guide each boat to the matching',
        'colored dock before time runs out.',
        '',
        'Dock at low speed (gentle approach).',
        'Watch out for rocks — they deflect boats.',
        '',
        'Tap again to close.',
      ];
      g.font = '14px sans-serif';
      g.fillStyle = '#c8dff0';
      lines.forEach((line, i) => {
        g.fillText(line, W / 2, py + 66 + i * 21);
      });
      g.restore();
    }

    // ── Main draw loop ───────────────────────────────────────────────────────
    function draw(t) {
      // Ocean background
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);

      // Clip play area subtle
      g.save();
      g.beginPath();
      g.rect(0, PLAY_TOP, W, PLAY_BOT - PLAY_TOP);
      g.clip();

      // Wave shimmer
      drawWaveShimmer(t);

      // Ambient wave rings (background shimmers)
      for (const wr of waveRings) {
        const a = (1 - wr.age / wr.maxAge) * 0.18;
        g.beginPath();
        g.arc(wr.x, wr.y, wr.r, 0, Math.PI * 2);
        g.strokeStyle = `rgba(100,180,230,${a})`;
        g.lineWidth = 1;
        g.stroke();
      }

      // Docks (behind everything)
      for (const dock of docks) {
        drawDock(dock.x, dock.y, dock.ci, dock.filled);
      }

      // Rocks
      for (const rock of rocks) {
        drawRock(rock.x, rock.y);
      }

      // Currents
      for (const cur of currents) {
        drawCurrent(cur);
      }

      // Particles
      for (const p of particles) {
        g.beginPath();
        g.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        g.fillStyle = p.color + Math.round(p.life * 255).toString(16).padStart(2, '0');
        g.fill();
      }

      // Boats
      for (const boat of boats) {
        if (boat.docked) {
          const pulse = 0.85 + 0.15 * Math.sin(boat.dockedPulse);
          drawBoat(boat.x, boat.y, boat.ci, pulse);
        } else {
          drawBoat(boat.x, boat.y, boat.ci, 1);
        }
      }

      g.restore(); // end play-area clip

      drawHUD();

      if (gameOver)  drawGameOver();
      if (levelWon)  drawLevelWon();
      if (showInfo)  drawInfoPanel();

      // Intro prompt
      if (!started && !showInfo) {
        g.save();
        g.textAlign = 'center';
        g.font = 'bold 16px sans-serif';
        g.fillStyle = 'rgba(200,230,255,0.85)';
        g.fillText('Tap the water to create a current', W / 2, PLAY_BOT - 28);
        g.restore();
      }
    }

    // ── Init game ───────────────────────────────────────────────────────────
    levels = buildLevels();
    bestLevel = ctx.storage.get('pb_bestLevel') || 0;
    score = 0;
    levelIdx = 0;
    buildLevel(levelIdx);

    // ── Touch ────────────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();

      if (!started) {
        started = true;
        ctx.platform.start();
      }

      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      // Info button
      if (dist(tx, ty, IBTN.x, IBTN.y) < IBTN.r + 6) {
        showInfo = !showInfo;
        ctx.platform.haptic('light');
        return;
      }

      if (showInfo) { showInfo = false; return; }

      if (gameOver) {
        // Restart
        score = 0;
        levelIdx = 0;
        started = true;
        buildLevel(levelIdx);
        ctx.platform.haptic('light');
        return;
      }

      if (levelWon) return;

      // Spawn current in play area
      if (ty >= PLAY_TOP && ty <= PLAY_BOT) {
        currents.push({ x: tx, y: ty, age: 0, maxAge: CURRENT_DUR });
        addWaveRing(tx, ty);
        spawnCurrentParticles(tx, ty);
        ctx.platform.haptic('light');
        ctx.platform.interact({ type: 'tap' });
        playSplash();
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    // ── Game loop ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      update(dt);
      draw(globalTime);
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
