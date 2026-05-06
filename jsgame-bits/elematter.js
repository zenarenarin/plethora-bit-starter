// ELEMATTER — Elemental Tower Defense (Plethora Bit)

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
    title: 'Elematter',
    author: 'plethora',
    description: 'Place elemental towers. Defend against the waves.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ────────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function noise(dur, vol = 0.3, freq = 200) {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource();
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = freq;
      const gain = audioCtx.createGain();
      src.buffer = buf; src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      src.start();
    }
    function tone(freq, type, dur, vol = 0.3, detune = 0) {
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
    function sfxFire()  { tone(180, 'sawtooth', 0.12, 0.25); tone(220, 'square', 0.08, 0.15, 50); }
    function sfxWater() { tone(660, 'sine', 0.15, 0.2); tone(880, 'sine', 0.1, 0.1); }
    function sfxEarth() { noise(0.18, 0.35, 120); tone(80, 'sawtooth', 0.15, 0.2); }
    function sfxWind()  { tone(1200, 'sine', 0.06, 0.15, -200); }
    function sfxDeath() { noise(0.2, 0.3, 400); tone(300, 'sawtooth', 0.12, 0.15); }
    function sfxHit()   { tone(200, 'sawtooth', 0.3, 0.4); tone(160, 'sawtooth', 0.3, 0.3); }
    function sfxWaveDone() {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => tone(f, 'sine', 0.25, 0.3), i * 100);
      });
    }

    // ── Grid ─────────────────────────────────────────────────────────────────
    const COLS = 12, ROWS = 18;
    const HUD_H = 48;
    const PANEL_H = 90 + SAFE;
    const PLAY_H = H - HUD_H - PANEL_H;
    const CW = W / COLS;
    const CH = PLAY_H / ROWS;

    // path waypoints in grid coords [col, row]
    const WAYPOINTS = [
      [0, 2], [2, 2], [2, 5], [5, 5], [5, 2], [8, 2],
      [8, 8], [4, 8], [4, 13], [9, 13], [9, 10], [11, 10],
      [11, 15], [7, 15], [7, 17], [12, 17],
    ];

    // build path cells set
    function cellsOnSegment(ax, ay, bx, by) {
      const cells = [];
      if (ax === bx) {
        const minR = Math.min(ay, by), maxR = Math.max(ay, by);
        for (let r = minR; r <= maxR; r++) cells.push([ax, r]);
      } else {
        const minC = Math.min(ax, bx), maxC = Math.max(ax, bx);
        for (let c = minC; c <= maxC; c++) cells.push([c, ay]);
      }
      return cells;
    }

    const pathCells = new Set();
    const pathSegments = []; // [{x1,y1,x2,y2}] in pixel coords
    for (let i = 0; i < WAYPOINTS.length - 1; i++) {
      const [ac, ar] = WAYPOINTS[i];
      const [bc, br] = WAYPOINTS[i + 1];
      const segs = cellsOnSegment(ac, ar, bc, br);
      segs.forEach(([c, r]) => pathCells.add(`${c},${r}`));
      // pixel centers for drawing
      pathSegments.push({
        x1: ac * CW + CW / 2, y1: HUD_H + ar * CH + CH / 2,
        x2: bc * CW + CW / 2, y2: HUD_H + br * CH + CH / 2,
      });
    }

    function isPathCell(c, r) { return pathCells.has(`${c},${r}`); }
    function cellToPixel(c, r) {
      return { x: c * CW + CW / 2, y: HUD_H + r * CH + CH / 2 };
    }

    // ── World state ───────────────────────────────────────────────────────────
    const TOWER_TYPES = {
      fire:  { name: 'Fire',  cost: 50, color: '#FF4500', glow: '#FF6020', dmg: 35, range: 2.2, rate: 1.2, splash: 1.2, slow: 0, multiHit: false, rapidFire: false },
      water: { name: 'Water', cost: 40, color: '#4FC3F7', glow: '#00B0FF', dmg: 12, range: 3.0, rate: 0.9, splash: 0,   slow: 0.5, multiHit: false, rapidFire: false },
      earth: { name: 'Earth', cost: 60, color: '#8D6E63', glow: '#A1887F', dmg: 50, range: 4.0, rate: 0.5, splash: 0,   slow: 0,   multiHit: false, rapidFire: false },
      wind:  { name: 'Wind',  cost: 35, color: '#E0E0E0', glow: '#B0BEC5', dmg: 8,  range: 3.5, rate: 3.0, splash: 0,   slow: 0,   multiHit: false, rapidFire: true  },
    };
    const ELEM_WEAKNESS = { fire: 'earth', water: 'fire', earth: 'wind', wind: 'water' };

    const ENEMY_TYPES = [
      { name: 'Ember Sprite',  hp: 60,  spd: 0.8, weak: 'water', color: '#FF7043', r: 0.35 },
      { name: 'Mud Golem',     hp: 180, spd: 0.4, weak: 'wind',  color: '#795548', r: 0.45 },
      { name: 'Storm Drake',   hp: 90,  spd: 1.2, weak: 'earth', color: '#78909C', r: 0.4  },
      { name: 'Tide Creeper',  hp: 120, spd: 0.6, weak: 'fire',  color: '#26C6DA', r: 0.38 },
    ];

    const WAVE_DEFS = [
      [{ t: 0, n: 4 }],
      [{ t: 0, n: 3 }, { t: 2, n: 2 }],
      [{ t: 1, n: 4 }],
      [{ t: 0, n: 3 }, { t: 2, n: 3 }],
      [{ t: 2, n: 4 }, { t: 3, n: 2 }],
      [{ t: 1, n: 3 }, { t: 3, n: 4 }],
      [{ t: 0, n: 4 }, { t: 1, n: 3 }, { t: 2, n: 2 }],
      [{ t: 2, n: 5 }, { t: 3, n: 5 }],
      [{ t: 0, n: 4 }, { t: 1, n: 4 }, { t: 3, n: 4 }],
      [{ t: 0, n: 5 }, { t: 1, n: 5 }, { t: 2, n: 5 }, { t: 3, n: 5 }],
    ];

    let towers = [];       // { col, row, type, hp, maxHp, cooldown, angle, spin, combo }
    let enemies = [];      // { pathT, hp, maxHp, type, slow, slowTimer, x, y, id }
    let projectiles = [];  // { x, y, tx, ty, spd, dmg, type, splash, slow, target, particles }
    let particles = [];    // { x, y, vx, vy, life, maxLife, color, r }
    let wave = 0;
    let lives = 20;
    let gems = 150;
    let score = 0;
    let highScore = ctx.storage.get('elematter_hs') || 0;
    let selectedElem = 'fire';
    let gameState = 'playing'; // playing | waveDone | gameover | win
    let waveEnemyQueue = [];
    let waveSpawnTimer = 0;
    let waveActive = false;
    let waveStartDelay = 0;
    let enemyId = 0;
    let selectedTower = null; // tower object or null
    let showInfo = false;
    let started = false;
    let totalWaves = 10;

    // Combo synergies: if adjacent tower types synergize
    const SYNERGIES = {
      'fire+wind': { name: 'Firestorm', splashMult: 2.0, dmgMult: 1.5 },
      'water+earth': { name: 'Mudslide', slowMult: 2.0, dmgMult: 1.2 },
      'fire+water': { name: 'Steam',    dmgMult: 1.3, rangeMult: 1.3 },
      'earth+wind': { name: 'Sandstorm', rapidMult: 2.0, dmgMult: 1.2 },
    };

    function getSynergy(t1, t2) {
      const key1 = `${t1}+${t2}`;
      const key2 = `${t2}+${t1}`;
      return SYNERGIES[key1] || SYNERGIES[key2] || null;
    }

    function getAdjacentTowers(col, row) {
      return towers.filter(t =>
        Math.abs(t.col - col) <= 1 && Math.abs(t.row - row) <= 1 && !(t.col === col && t.row === row)
      );
    }

    function recomputeCombos() {
      towers.forEach(t => {
        t.combo = null;
        getAdjacentTowers(t.col, t.row).forEach(n => {
          const syn = getSynergy(t.type, n.type);
          if (syn && !t.combo) t.combo = syn;
        });
      });
    }

    // Path evaluation: get pixel position along path at param t (0=start, 1=end)
    function pathLength() {
      let len = 0;
      for (let i = 0; i < WAYPOINTS.length - 1; i++) {
        const [ac, ar] = WAYPOINTS[i], [bc, br] = WAYPOINTS[i + 1];
        len += Math.hypot((bc - ac) * CW, (br - ar) * CH);
      }
      return len;
    }
    const TOTAL_PATH_LEN = pathLength();

    function getPathPos(dist) {
      let remaining = dist;
      for (let i = 0; i < WAYPOINTS.length - 1; i++) {
        const [ac, ar] = WAYPOINTS[i], [bc, br] = WAYPOINTS[i + 1];
        const segLen = Math.hypot((bc - ac) * CW, (br - ar) * CH);
        if (remaining <= segLen) {
          const t = remaining / segLen;
          return {
            x: (ac + (bc - ac) * t) * CW + CW / 2,
            y: HUD_H + (ar + (br - ar) * t) * CH + CH / 2,
          };
        }
        remaining -= segLen;
      }
      return { x: WAYPOINTS[WAYPOINTS.length - 1][0] * CW + CW / 2, y: HUD_H + WAYPOINTS[WAYPOINTS.length - 1][1] * CH + CH / 2 };
    }

    // ── Wave management ───────────────────────────────────────────────────────
    function startWave(waveIdx) {
      const def = WAVE_DEFS[waveIdx];
      waveEnemyQueue = [];
      const mult = 1 + waveIdx * 0.15;
      def.forEach(group => {
        for (let i = 0; i < group.n; i++) {
          waveEnemyQueue.push({ typeIdx: group.t, delay: group.t * 0.4 + i * 1.2, mult });
        }
      });
      waveEnemyQueue.sort((a, b) => a.delay - b.delay);
      waveSpawnTimer = 0;
      waveActive = true;
    }

    function spawnEnemy(typeIdx, mult) {
      const et = ENEMY_TYPES[typeIdx];
      const id = enemyId++;
      enemies.push({
        id, typeIdx,
        dist: 0,
        hp: Math.round(et.hp * mult),
        maxHp: Math.round(et.hp * mult),
        spd: et.spd * (0.9 + Math.random() * 0.2),
        slow: 1, slowTimer: 0,
        x: WAYPOINTS[0][0] * CW + CW / 2,
        y: HUD_H + WAYPOINTS[0][1] * CH + CH / 2,
        reached: false,
      });
    }

    function spawnParticles(x, y, color, count = 6, speed = 80) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = speed * (0.5 + Math.random());
        particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 0.5 + Math.random() * 0.4,
          maxLife: 0.8,
          color,
          r: 2 + Math.random() * 3,
        });
      }
    }

    function fireTower(tower) {
      const td = TOWER_TYPES[tower.type];
      const rangeP = td.range * CW;
      const combo = tower.combo;
      const dmgMult = combo ? (combo.dmgMult || 1) : 1;
      const splashMult = combo ? (combo.splashMult || 1) : 1;
      const slowMult = combo ? (combo.slowMult || 1) : 1;
      const rangeMult = combo ? (combo.rangeMult || 1) : 1;
      const effectiveRange = rangeP * rangeMult;

      // find target: closest enemy in range
      let target = null, bestDist = Infinity;
      enemies.forEach(e => {
        const dx = e.x - (tower.col * CW + CW / 2);
        const dy = e.y - (HUD_H + tower.row * CH + CH / 2);
        const d = Math.hypot(dx, dy);
        if (d < effectiveRange && d < bestDist) { bestDist = d; target = e; }
      });
      if (!target) return;

      const tx = target.x, ty = target.y;
      const ox = tower.col * CW + CW / 2, oy = HUD_H + tower.row * CH + CH / 2;
      tower.angle = Math.atan2(ty - oy, tx - ox);

      const isRapid = combo && combo.rapidMult ? combo.rapidMult : (td.rapidFire ? 1 : 1);
      projectiles.push({
        x: ox, y: oy,
        tx, ty,
        spd: 280,
        dmg: td.dmg * dmgMult,
        type: tower.type,
        splash: td.splash * splashMult * CW,
        slow: td.slow * slowMult,
        targetId: target.id,
        particles: [],
      });

      // sounds
      if (tower.type === 'fire') sfxFire();
      else if (tower.type === 'water') sfxWater();
      else if (tower.type === 'earth') sfxEarth();
      else if (tower.type === 'wind') sfxWind();
    }

    // ── Game loop ─────────────────────────────────────────────────────────────
    let elapsed = 0;

    ctx.raf((dt) => {
      const sec = dt / 1000;
      elapsed += sec;

      g.clearRect(0, 0, W, H);

      if (gameState === 'playing' || gameState === 'waveDone') {
        updateGame(sec);
      }

      drawGame();
      drawHUD();
      drawPanel();

      if (gameState === 'gameover') drawGameOver();
      if (gameState === 'win') drawWin();
      if (showInfo) drawInfo();
    });

    function updateGame(sec) {
      // wave spawn
      if (waveActive) {
        waveSpawnTimer += sec;
        while (waveEnemyQueue.length && waveEnemyQueue[0].delay <= waveSpawnTimer) {
          const e = waveEnemyQueue.shift();
          spawnEnemy(e.typeIdx, e.mult);
        }
        if (waveEnemyQueue.length === 0 && enemies.length === 0) {
          waveActive = false;
          gameState = 'waveDone';
          gems += 25;
          sfxWaveDone();
          waveStartDelay = 3.0;
        }
      } else if (gameState === 'waveDone') {
        waveStartDelay -= sec;
        if (waveStartDelay <= 0) {
          wave++;
          if (wave >= totalWaves) {
            gameState = 'win';
            if (score > highScore) { highScore = score; ctx.storage.set('elematter_hs', highScore); }
            ctx.platform.complete({ score });
          } else {
            gameState = 'playing';
            startWave(wave);
          }
        }
      }

      // move enemies
      enemies.forEach(e => {
        const et = ENEMY_TYPES[e.typeIdx];
        const effectiveSpd = e.spd * e.slow;
        e.dist += effectiveSpd * CW * sec;
        const pos = getPathPos(e.dist);
        e.x = pos.x; e.y = pos.y;

        if (e.slowTimer > 0) { e.slowTimer -= sec; if (e.slowTimer <= 0) e.slow = 1; }

        if (e.dist >= TOTAL_PATH_LEN) {
          e.reached = true;
          lives--;
          sfxHit();
          ctx.platform.haptic('heavy');
          if (lives <= 0) {
            gameState = 'gameover';
            if (score > highScore) { highScore = score; ctx.storage.set('elematter_hs', highScore); }
            ctx.platform.fail({ reason: 'no lives' });
          }
        }
      });
      enemies = enemies.filter(e => !e.reached && e.hp > 0);

      // tower attack
      towers.forEach(t => {
        const td = TOWER_TYPES[t.type];
        if (t.cooldown > 0) { t.cooldown -= sec; return; }
        if (enemies.length === 0) return;
        t.cooldown = 1 / td.rate;
        fireTower(t);
      });

      // wind tower spin
      towers.forEach(t => {
        if (t.type === 'wind') t.spin = (t.spin || 0) + sec * 3;
      });

      // projectile move
      projectiles.forEach(p => {
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const spd = p.spd * sec;
        if (d < spd + 4) {
          // hit
          p.hit = true;
          if (p.splash > 0) {
            // AoE
            enemies.forEach(e => {
              const ex = e.x - p.tx, ey = e.y - p.ty;
              if (Math.hypot(ex, ey) < p.splash) dealDmg(e, p.dmg, p.type, p.slow);
            });
            spawnParticles(p.tx, p.ty, projColor(p.type), 12, 120);
          } else {
            const tgt = enemies.find(e => e.id === p.targetId);
            if (tgt) {
              dealDmg(tgt, p.dmg, p.type, p.slow);
              spawnParticles(p.tx, p.ty, projColor(p.type), 5, 70);
            }
          }
        } else {
          p.x += (dx / d) * spd;
          p.y += (dy / d) * spd;
          // trail particle
          if (Math.random() < 0.4) {
            particles.push({
              x: p.x + (Math.random() - 0.5) * 4,
              y: p.y + (Math.random() - 0.5) * 4,
              vx: (Math.random() - 0.5) * 20,
              vy: (Math.random() - 0.5) * 20,
              life: 0.2,
              maxLife: 0.2,
              color: projColor(p.type),
              r: 2,
            });
          }
        }
      });
      projectiles = projectiles.filter(p => !p.hit);

      // particles
      particles.forEach(p => {
        p.x += p.vx * sec;
        p.y += p.vy * sec;
        p.vy += 60 * sec;
        p.life -= sec;
      });
      particles = particles.filter(p => p.life > 0);
    }

    function dealDmg(enemy, dmg, type, slow) {
      const et = ENEMY_TYPES[enemy.typeIdx];
      let d = dmg;
      if (et.weak === type) d *= 1.5;
      enemy.hp -= d;
      if (slow > 0) {
        enemy.slow = Math.min(enemy.slow, 1 - slow);
        enemy.slowTimer = 2.0;
      }
      if (enemy.hp <= 0) {
        sfxDeath();
        spawnParticles(enemy.x, enemy.y, et.color, 10, 100);
        score += 10;
        gems += 10;
        ctx.platform.setScore(score);
      }
    }

    function projColor(type) {
      return { fire: '#FF6030', water: '#4FC3F7', earth: '#A1887F', wind: '#E0F7FA' }[type];
    }

    // ── Draw ──────────────────────────────────────────────────────────────────
    function drawGame() {
      // background
      g.fillStyle = '#0f1a0f';
      g.fillRect(0, HUD_H, W, H - HUD_H - PANEL_H);

      // grid dots (subtle)
      g.fillStyle = 'rgba(255,255,255,0.03)';
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          if (!isPathCell(c, r)) {
            g.fillRect(c * CW + CW / 2 - 1, HUD_H + r * CH + CH / 2 - 1, 2, 2);
          }
        }
      }

      // path shadow / edges
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = CW * 0.9 + 6;
      drawPath();

      // path fill (sandy)
      g.strokeStyle = '#C8A870';
      g.lineWidth = CW * 0.85;
      drawPath();

      // path texture lines
      g.strokeStyle = '#B89660';
      g.lineWidth = CW * 0.3;
      drawPath();

      // path edge highlight
      g.strokeStyle = 'rgba(255,245,200,0.15)';
      g.lineWidth = CW * 0.9;
      drawPath();

      // tower range highlight
      if (selectedTower) {
        const td = TOWER_TYPES[selectedTower.type];
        const combo = selectedTower.combo;
        const rangeMult = combo && combo.rangeMult ? combo.rangeMult : 1;
        const rangeP = td.range * CW * rangeMult;
        const ox = selectedTower.col * CW + CW / 2;
        const oy = HUD_H + selectedTower.row * CH + CH / 2;
        g.beginPath();
        g.arc(ox, oy, rangeP, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.2)';
        g.lineWidth = 1;
        g.stroke();
      }

      // towers
      towers.forEach(drawTower);

      // enemies
      enemies.forEach(drawEnemy);

      // projectiles
      projectiles.forEach(drawProjectile);

      // particles
      particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        g.globalAlpha = alpha;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;

      // sell overlay
      if (selectedTower) {
        const ox = selectedTower.col * CW + CW / 2;
        const oy = HUD_H + selectedTower.row * CH + CH / 2;
        const td = TOWER_TYPES[selectedTower.type];
        const refund = Math.floor(td.cost * 0.5);
        g.save();
        roundRectC(g, ox - 38, oy - CH - 22, 76, 22, 8);
        g.fillStyle = 'rgba(0,0,0,0.8)';
        g.fill();
        g.fillStyle = '#FFD740';
        g.font = `bold ${Math.round(CW * 0.55)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText(`Sell +${refund}💎`, ox, oy - CH - 6);
        g.restore();

        if (selectedTower.combo) {
          g.save();
          roundRectC(g, ox - 48, oy + CH + 2, 96, 18, 6);
          g.fillStyle = 'rgba(255,215,64,0.2)';
          g.fill();
          g.fillStyle = '#FFD740';
          g.font = `${Math.round(CW * 0.48)}px sans-serif`;
          g.textAlign = 'center';
          g.fillText(`✨ ${selectedTower.combo.name}`, ox, oy + CH + 15);
          g.restore();
        }
      }
    }

    function drawPath() {
      g.beginPath();
      const start = { x: WAYPOINTS[0][0] * CW + CW / 2, y: HUD_H + WAYPOINTS[0][1] * CH + CH / 2 };
      g.moveTo(start.x, start.y);
      for (let i = 1; i < WAYPOINTS.length; i++) {
        const [c, r] = WAYPOINTS[i];
        g.lineTo(c * CW + CW / 2, HUD_H + r * CH + CH / 2);
      }
      g.stroke();
    }

    function drawTower(t) {
      const x = t.col * CW + CW / 2;
      const y = HUD_H + t.row * CH + CH / 2;
      const r = CW * 0.42;
      const td = TOWER_TYPES[t.type];
      const isSelected = selectedTower === t;

      g.save();
      g.translate(x, y);

      // glow
      if (isSelected || t.combo) {
        const gr = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.6);
        gr.addColorStop(0, td.glow + '55');
        gr.addColorStop(1, 'transparent');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(0, 0, r * 1.6, 0, Math.PI * 2);
        g.fill();
      }

      if (t.type === 'fire') {
        // base
        g.fillStyle = '#333';
        roundRectC(g, -r, -r * 0.8, r * 2, r * 1.6, 4);
        g.fill();
        // barrel
        g.save();
        g.rotate(t.angle || 0);
        g.fillStyle = '#FF4500';
        g.fillRect(-r * 0.2, -r * 1.2, r * 0.4, r * 1.2);
        g.restore();
        // flame orb
        const fireGr = g.createRadialGradient(0, 0, 1, 0, 0, r * 0.7);
        fireGr.addColorStop(0, '#FFEB3B');
        fireGr.addColorStop(0.5, '#FF5722');
        fireGr.addColorStop(1, '#B71C1C');
        g.fillStyle = fireGr;
        g.beginPath();
        g.arc(0, 0, r * 0.6, 0, Math.PI * 2);
        g.fill();

      } else if (t.type === 'water') {
        // crystal base
        g.fillStyle = '#1565C0';
        g.beginPath();
        g.moveTo(0, -r * 1.1);
        g.lineTo(r * 0.7, 0);
        g.lineTo(r * 0.5, r * 0.9);
        g.lineTo(-r * 0.5, r * 0.9);
        g.lineTo(-r * 0.7, 0);
        g.closePath();
        g.fill();
        // crystal highlight
        g.save();
        g.rotate(t.angle || 0);
        g.fillStyle = '#4FC3F7';
        g.fillRect(-r * 0.15, -r * 0.9, r * 0.3, r * 0.9);
        g.restore();
        const waterGr = g.createRadialGradient(-r * 0.2, -r * 0.2, 1, 0, 0, r * 0.6);
        waterGr.addColorStop(0, 'rgba(255,255,255,0.7)');
        waterGr.addColorStop(1, '#00B0FF88');
        g.fillStyle = waterGr;
        g.beginPath();
        g.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        g.fill();

      } else if (t.type === 'earth') {
        // stone block
        g.fillStyle = '#5D4037';
        roundRectC(g, -r, -r, r * 2, r * 2, 3);
        g.fill();
        g.fillStyle = '#8D6E63';
        roundRectC(g, -r + 2, -r + 2, r * 2 - 4, r * 2 - 4, 2);
        g.fill();
        // cannon
        g.save();
        g.rotate(t.angle || 0);
        g.fillStyle = '#4E342E';
        g.fillRect(-r * 0.25, -r * 1.1, r * 0.5, r * 1.1);
        g.fillStyle = '#3E2723';
        g.beginPath();
        g.arc(0, -r * 1.0, r * 0.25, 0, Math.PI * 2);
        g.fill();
        g.restore();

      } else if (t.type === 'wind') {
        // pole
        g.fillStyle = '#B0BEC5';
        g.fillRect(-r * 0.1, -r, r * 0.2, r * 2);
        // spinning vanes
        g.save();
        g.rotate(t.spin || 0);
        for (let i = 0; i < 4; i++) {
          g.save();
          g.rotate((i * Math.PI) / 2);
          g.fillStyle = i % 2 === 0 ? '#E0E0E0' : '#90A4AE';
          g.beginPath();
          g.ellipse(r * 0.5, 0, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
        g.restore();
        // center hub
        g.fillStyle = '#CFD8DC';
        g.beginPath();
        g.arc(0, 0, r * 0.2, 0, Math.PI * 2);
        g.fill();
      }

      // selected ring
      if (isSelected) {
        g.strokeStyle = '#FFD740';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 0, r * 1.15, 0, Math.PI * 2);
        g.stroke();
      }

      // combo star
      if (t.combo) {
        g.fillStyle = '#FFD740';
        g.font = `${Math.round(r * 0.8)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('✨', 0, -r * 1.3);
      }

      g.restore();
    }

    function drawEnemy(e) {
      const et = ENEMY_TYPES[e.typeIdx];
      const r = et.r * CW;
      const x = e.x, y = e.y;
      const slowRatio = 1 - e.slow;

      g.save();
      g.translate(x, y);

      // slow ice overlay
      if (slowRatio > 0.1) {
        g.globalAlpha = slowRatio * 0.5;
        g.fillStyle = '#B3E5FC';
        g.beginPath();
        g.arc(0, 0, r * 1.2, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }

      // body
      g.fillStyle = et.color;
      if (e.typeIdx === 0) {
        // Ember Sprite: triangular flame shape
        g.beginPath();
        g.moveTo(0, -r);
        g.lineTo(r * 0.8, r * 0.6);
        g.lineTo(0, r * 0.3);
        g.lineTo(-r * 0.8, r * 0.6);
        g.closePath();
        g.fill();
        g.fillStyle = '#FFCC02';
        g.beginPath();
        g.arc(0, 0, r * 0.4, 0, Math.PI * 2);
        g.fill();
      } else if (e.typeIdx === 1) {
        // Mud Golem: lumpy circle
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#4E342E';
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(-r * 0.3 + i * r * 0.3, -r * 0.1, r * 0.2, 0, Math.PI * 2);
          g.fill();
        }
      } else if (e.typeIdx === 2) {
        // Storm Drake: diamond/arrow shape
        g.beginPath();
        g.moveTo(0, -r * 1.1);
        g.lineTo(r, 0);
        g.lineTo(r * 0.4, r * 0.6);
        g.lineTo(-r * 0.4, r * 0.6);
        g.lineTo(-r, 0);
        g.closePath();
        g.fill();
        g.fillStyle = '#ECEFF1';
        g.beginPath();
        g.arc(0, -r * 0.2, r * 0.3, 0, Math.PI * 2);
        g.fill();
      } else {
        // Tide Creeper: wave-ish oval
        g.save();
        g.scale(1.3, 0.8);
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.restore();
        g.fillStyle = '#0097A7';
        g.beginPath();
        g.arc(-r * 0.2, -r * 0.1, r * 0.35, 0, Math.PI * 2);
        g.fill();
      }

      // HP bar
      const barW = r * 2.2;
      const barH = 4;
      const bx = -barW / 2;
      const by = -r - 8;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      roundRectC(g, bx - 1, by - 1, barW + 2, barH + 2, 2);
      g.fill();
      const hpRatio = Math.max(0, e.hp / e.maxHp);
      const hpColor = hpRatio > 0.6 ? '#4CAF50' : hpRatio > 0.3 ? '#FFC107' : '#F44336';
      g.fillStyle = hpColor;
      roundRectC(g, bx, by, barW * hpRatio, barH, 2);
      g.fill();

      g.restore();
    }

    function drawProjectile(p) {
      const colors = { fire: '#FF6030', water: '#4FC3F7', earth: '#8D6E63', wind: '#E3F2FD' };
      const sizes = { fire: 5, water: 4, earth: 6, wind: 3 };
      const c = colors[p.type], sz = sizes[p.type];

      g.save();
      g.fillStyle = c;
      g.shadowBlur = 8;
      g.shadowColor = c;
      g.beginPath();
      g.arc(p.x, p.y, sz, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.restore();
    }

    // ── HUD ───────────────────────────────────────────────────────────────────
    function drawHUD() {
      // bg
      g.fillStyle = '#111e11';
      g.fillRect(0, 0, W, HUD_H);
      g.fillStyle = '#1a2b1a';
      g.fillRect(0, HUD_H - 2, W, 2);

      g.font = `bold ${16}px sans-serif`;
      g.textBaseline = 'middle';

      // Wave
      g.fillStyle = '#FFD740';
      g.textAlign = 'left';
      const waveLabel = gameState === 'waveDone'
        ? `Wave ${wave + 1}/${totalWaves} ✓`
        : `Wave ${wave + 1}/${totalWaves}`;
      g.fillText(waveLabel, 12, HUD_H / 2);

      // Gems
      g.fillStyle = '#80DEEA';
      g.textAlign = 'center';
      g.fillText(`💎 ${gems}`, W / 2, HUD_H / 2);

      // Lives
      g.fillStyle = '#EF9A9A';
      g.textAlign = 'right';
      const hearts = '❤️'.repeat(Math.max(0, Math.min(5, Math.ceil(lives / 4))));
      g.fillText(`${hearts} ${lives}`, W - 44, HUD_H / 2);

      // Info button
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.arc(W - 22, 22, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `bold 14px sans-serif`;
      g.textAlign = 'center';
      g.fillText('i', W - 22, 23);

      // waveDone countdown
      if (gameState === 'waveDone' && wave + 1 < totalWaves) {
        g.fillStyle = 'rgba(255,215,64,0.8)';
        g.font = `13px sans-serif`;
        g.textAlign = 'center';
        g.fillText(`Next wave in ${Math.ceil(waveStartDelay)}s`, W / 2, HUD_H - 10);
      }

      g.textBaseline = 'alphabetic';
    }

    // ── Bottom panel ──────────────────────────────────────────────────────────
    const PANEL_Y = H - PANEL_H;
    const BTN_TYPES = ['fire', 'water', 'earth', 'wind'];
    const BTN_LABELS = { fire: '🔥', water: '💧', earth: '🪨', wind: '💨' };
    const BTN_W = (W - 16) / 4;
    const BTN_H = 72;

    function drawPanel() {
      g.fillStyle = '#111e11';
      g.fillRect(0, PANEL_Y, W, PANEL_H);
      g.fillStyle = '#1a2b1a';
      g.fillRect(0, PANEL_Y, W, 2);

      BTN_TYPES.forEach((type, i) => {
        const td = TOWER_TYPES[type];
        const bx = 8 + i * BTN_W;
        const by = PANEL_Y + 8;
        const bw = BTN_W - 8;
        const bh = BTN_H;
        const isSel = selectedElem === type;
        const canAfford = gems >= td.cost;

        g.save();
        roundRectC(g, bx, by, bw, bh, 10);
        if (isSel) {
          g.fillStyle = td.color + '55';
          g.fill();
          g.strokeStyle = td.color;
          g.lineWidth = 2;
          g.stroke();
        } else {
          g.fillStyle = canAfford ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)';
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.1)';
          g.lineWidth = 1;
          g.stroke();
        }
        g.restore();

        // emoji
        g.font = `${22}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = canAfford ? '#fff' : '#666';
        g.fillText(BTN_LABELS[type], bx + bw / 2, by + 22);

        // name
        g.font = `bold 11px sans-serif`;
        g.fillStyle = canAfford ? td.color : '#555';
        g.fillText(td.name, bx + bw / 2, by + 43);

        // cost
        g.font = `11px sans-serif`;
        g.fillStyle = canAfford ? '#80DEEA' : '#555';
        g.fillText(`💎${td.cost}`, bx + bw / 2, by + 58);

        g.textBaseline = 'alphabetic';
      });
    }

    // ── Overlay screens ───────────────────────────────────────────────────────
    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.fillRect(0, 0, W, H);
      const cy = H / 2;
      g.fillStyle = '#F44336';
      g.font = `bold 32px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('DEFEATED', W / 2, cy - 40);
      g.fillStyle = '#fff';
      g.font = `18px sans-serif`;
      g.fillText(`Score: ${score}`, W / 2, cy);
      g.fillStyle = '#FFD740';
      g.fillText(`Best: ${highScore}`, W / 2, cy + 30);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.font = `14px sans-serif`;
      g.fillText('Tap to restart', W / 2, cy + 70);
      g.textBaseline = 'alphabetic';
    }

    function drawWin() {
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.fillRect(0, 0, W, H);
      const cy = H / 2;
      g.fillStyle = '#FFD740';
      g.font = `bold 32px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('VICTORY!', W / 2, cy - 40);
      g.fillStyle = '#fff';
      g.font = `18px sans-serif`;
      g.fillText(`Score: ${score}`, W / 2, cy);
      g.fillStyle = '#FFD740';
      g.fillText(`Best: ${highScore}`, W / 2, cy + 30);
      g.fillStyle = '#80DEEA';
      g.font = `14px sans-serif`;
      g.fillText('All 10 waves survived!', W / 2, cy + 65);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillText('Tap to play again', W / 2, cy + 90);
      g.textBaseline = 'alphabetic';
    }

    function drawInfo() {
      g.fillStyle = 'rgba(0,0,0,0.85)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = '#FFD740';
      g.font = `bold 18px sans-serif`;
      g.fillText('ELEMATTER — How to Play', 14, 20);
      g.fillStyle = '#ccc';
      g.font = `13px sans-serif`;
      const lines = [
        '• Tap an empty cell (not on the path) to place',
        '  the selected tower.',
        '• Tap a placed tower to sell it (50% refund).',
        '• Survive 10 waves of elemental creatures.',
        '',
        '🔥 Fire: AoE splash, high dmg, short range',
        '💧 Water: Slows enemies, medium range',
        '🪨 Earth: Long range, single-target, tank',
        '💨 Wind: Rapid-fire, light dmg, long range',
        '',
        'Synergies (adjacent towers):',
        '🔥+💨 Firestorm: 2× AoE + 1.5× dmg',
        '💧+🪨 Mudslide: 2× slow + 1.2× dmg',
        '🔥+💧 Steam: 1.3× dmg + 1.3× range',
        '🪨+💨 Sandstorm: rapid-fire + 1.2× dmg',
        '',
        'Earn 10💎 per kill, 25💎 per wave cleared.',
        '',
        '  Tap anywhere to close.',
      ];
      lines.forEach((l, i) => { g.fillText(l, 14, 54 + i * 20); });
      g.textBaseline = 'alphabetic';
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    function resetGame() {
      towers = []; enemies = []; projectiles = []; particles = [];
      wave = 0; lives = 20; gems = 150; score = 0;
      selectedElem = 'fire'; selectedTower = null;
      waveActive = false; waveEnemyQueue = [];
      gameState = 'playing';
      ctx.platform.setScore(0);
      startWave(0);
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();

      if (!started) {
        started = true;
        ctx.platform.start();
        startWave(0);
      }

      const touch = e.changedTouches[0];
      const tx = touch.clientX, ty = touch.clientY;

      // info button
      if (Math.hypot(tx - (W - 22), ty - 22) < 18) {
        showInfo = !showInfo;
        ctx.platform.haptic('light');
        return;
      }

      // close info
      if (showInfo) { showInfo = false; return; }

      // restart on gameover/win
      if (gameState === 'gameover' || gameState === 'win') {
        resetGame();
        ctx.platform.haptic('medium');
        return;
      }

      // bottom panel: element selector
      if (ty >= PANEL_Y && ty <= PANEL_Y + BTN_H + 16) {
        BTN_TYPES.forEach((type, i) => {
          const bx = 8 + i * BTN_W;
          const bw = BTN_W - 8;
          if (tx >= bx && tx <= bx + bw) {
            selectedElem = type;
            selectedTower = null;
            ctx.platform.haptic('light');
          }
        });
        return;
      }

      // game area
      if (ty < HUD_H || ty > PANEL_Y) return;

      const col = Math.floor(tx / CW);
      const row = Math.floor((ty - HUD_H) / CH);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

      // check if tapping existing tower
      const existingTower = towers.find(t => t.col === col && t.row === row);
      if (existingTower) {
        if (selectedTower === existingTower) {
          // sell
          const td = TOWER_TYPES[existingTower.type];
          gems += Math.floor(td.cost * 0.5);
          towers = towers.filter(t => t !== existingTower);
          recomputeCombos();
          selectedTower = null;
          ctx.platform.haptic('medium');
          ctx.platform.interact({ type: 'sell' });
        } else {
          selectedTower = existingTower;
          ctx.platform.haptic('light');
        }
        return;
      }

      // deselect if tapping elsewhere
      if (selectedTower) { selectedTower = null; return; }

      // path cell check
      if (isPathCell(col, row)) {
        ctx.platform.haptic('light');
        return;
      }

      // place tower
      const td = TOWER_TYPES[selectedElem];
      if (gems < td.cost) {
        ctx.platform.haptic('light');
        return;
      }

      gems -= td.cost;
      towers.push({
        col, row,
        type: selectedElem,
        hp: 100, maxHp: 100,
        cooldown: 0,
        angle: 0,
        spin: 0,
        combo: null,
      });
      recomputeCombos();
      ctx.platform.haptic('medium');
      ctx.platform.interact({ type: 'place_tower' });
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    // ── Start ─────────────────────────────────────────────────────────────────
    // Don't auto-start wave; wait for first touch
    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
