// VIER — Four elements. One wizard. Defeat them all. (Plethora Bit)

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
    title: 'Vier',
    author: 'plethora',
    description: 'Four elements. One wizard. Defeat them all.',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ──────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, type, dur, vol = 0.2, bend = null) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      if (bend) o.frequency.linearRampToValueAtTime(bend, audioCtx.currentTime + dur);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playNoise(dur, vol = 0.3, hipass = 0) {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate * dur), audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      src.start();
    }
    // Element sounds
    function sfxFire()  { playTone(180, 'sawtooth', 0.15, 0.25, 80); playNoise(0.12, 0.2); }
    function sfxWater() { playTone(600, 'sine', 0.25, 0.18, 300); }
    function sfxEarth() { playTone(80,  'triangle', 0.3, 0.4, 60); playNoise(0.2, 0.3); }
    function sfxWind()  { playTone(1200,'sine', 0.2, 0.12, 1600); playNoise(0.18, 0.12); }
    function sfxHit()   { playTone(440, 'square', 0.08, 0.3); }
    function sfxAbsorb(){ playTone(200, 'sine', 0.3, 0.15, 100); }
    function sfxLevel() {
      [523,659,784,1047].forEach((f,i) => setTimeout(()=>playTone(f,'sine',0.15,0.25), i*80));
    }
    function sfxDie()   {
      [400,320,240,160].forEach((f,i) => setTimeout(()=>playTone(f,'sawtooth',0.18,0.3), i*100));
    }
    function sfxGameOver() {
      [300,240,180,120].forEach((f,i) => setTimeout(()=>playTone(f,'sawtooth',0.22,0.35), i*120));
    }

    // ── Constants ──────────────────────────────────────────────────────────
    const ELEMS = ['fire','water','earth','wind'];
    const ELEM_COLOR = { fire:'#ff5500', water:'#00aaff', earth:'#8b5e3c', wind:'#ccddff' };
    const ELEM_GLOW  = { fire:'#ff9900', water:'#44ccff', earth:'#c8905a', wind:'#ffffff' };
    const ELEM_LABEL = { fire:'🔥', water:'💧', earth:'🌍', wind:'💨' };
    // Weakness: key beats value  (fire > earth > wind > water > fire)
    const STRONG_VS  = { fire:'earth', earth:'wind', wind:'water', water:'fire' };
    // Inverse: what beats me
    const WEAK_TO    = { earth:'fire', wind:'earth', water:'wind', fire:'water' };

    const ENEMY_DEFS = [
      { el:'fire',  hp:50,  atk:12, spd:2.5, name:'Pyromancer' },
      { el:'water', hp:60,  atk:15, spd:2.0, name:'Tidecaller' },
      { el:'earth', hp:80,  atk:10, spd:3.0, name:'Stonewarden' },
      { el:'wind',  hp:40,  atk:20, spd:1.5, name:'Stormweaver' },
      { el:'fire',  hp:70,  atk:18, spd:2.0, name:'Blazelord' },
      { el:'water', hp:90,  atk:12, spd:2.8, name:'Deepcaster' },
      { el:'earth', hp:60,  atk:22, spd:1.8, name:'Quakemage' },
      { el:'wind',  hp:50,  atk:25, spd:1.4, name:'Cyclonerift' },
    ];

    const BTN_R = Math.min(30, W * 0.08);
    const BTN_Y = H - SAFE - BTN_R - 14;
    // Positions: fire=BL, water=CL, earth=CR, wind=BR
    const BTN_POS = {
      fire:  { x: W * 0.15, y: BTN_Y },
      water: { x: W * 0.38, y: BTN_Y },
      earth: { x: W * 0.62, y: BTN_Y },
      wind:  { x: W * 0.85, y: BTN_Y },
    };

    const PLAYER_X = W / 2;
    const PLAYER_Y = H - SAFE - BTN_R * 2 - 80;
    const ENEMY_X  = W / 2;
    const ENEMY_Y  = H * 0.28;

    const MAX_HP = 100;
    const ENEMY_ATK_CHARGE = 1500; // ms to charge
    const STUN_DUR = 1000;
    const PROJ_DUR = 500;

    // ── State ──────────────────────────────────────────────────────────────
    let playerHP = MAX_HP;
    let enemyQueue = [];
    let enemyIndex = 0;
    let enemy = null;
    let enemyHP = 0;
    let enemyMaxHP = 0;
    let enemiesDefeated = 0;
    let totalDefeated = 0;
    let score = 0;
    let highScore = ctx.storage.get('vier_hs') || 0;

    let stars = [];
    let particles = [];
    let floatParticles = [];
    let projectile = null;    // { x,y, tx,ty, el, t, maxT, phase } phase: fly|resolve
    let enemyProj = null;     // enemy counter-attack projectile
    let chargeTimer = null;   // ms until enemy attacks
    let chargeMax = 0;
    let stunTimer = 0;
    let phase = 'IDLE'; // IDLE | CASTING | ENEMY_CHARGE | ENEMY_PROJ | STUN | WIN | DEAD | GAMEOVER
    let flashMsg = null; // { text, color, t, maxT }
    let screenShake = 0;
    let started = false;
    let showInfo = false;
    let infoScroll = 0;
    let enemyBob = 0;
    let wobble = 0;

    // ── Init stars ─────────────────────────────────────────────────────────
    for (let i = 0; i < 90; i++) {
      stars.push({ x: Math.random()*W, y: Math.random()*H,
        r: Math.random()*1.5+0.3, blink: Math.random()*Math.PI*2, spd: Math.random()*0.5+0.2 });
    }
    for (let i = 0; i < 24; i++) {
      floatParticles.push({
        x: Math.random()*W, y: Math.random()*H,
        vx: (Math.random()-0.5)*0.3, vy: -Math.random()*0.4-0.1,
        r: Math.random()*3+1,
        hue: Math.random()*360,
        life: Math.random(),
        maxLife: 1,
        alpha: Math.random()*0.4+0.1,
      });
    }

    // ── Build enemy queue ──────────────────────────────────────────────────
    function buildQueue() {
      enemyQueue = [];
      for (let wave = 0; wave < 3; wave++) {
        const shuffled = [...ENEMY_DEFS].sort(() => Math.random()-0.5);
        enemyQueue.push(...shuffled);
      }
    }

    function spawnEnemy() {
      if (enemyIndex >= enemyQueue.length) {
        phase = 'WIN';
        flashMsg = { text: 'VICTORY!', color: '#ffd700', t: 0, maxT: 3000 };
        sfxLevel();
        ctx.platform.complete({ score, result: 'win', durationMs: 0 });
        return;
      }
      const isBoss = (enemyIndex + 1) % 4 === 0;
      const def = enemyQueue[enemyIndex];
      enemy = { ...def };
      enemyMaxHP = isBoss ? 200 : def.hp;
      enemyHP = enemyMaxHP;
      if (isBoss) enemy.name = '⚡ ' + enemy.name + ' ⚡';
      enemy.isBoss = isBoss;
      enemyIndex++;
      phase = 'IDLE';
      chargeTimer = null;
      stunTimer = 0;

      // Spawn entry particles
      for (let i = 0; i < 20; i++) spawnBurst(ENEMY_X, ENEMY_Y, ELEM_COLOR[enemy.el], 3);
    }

    function spawnBurst(x, y, color, count, speed = 2.5) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = Math.random() * speed + 0.5;
        particles.push({
          x, y,
          vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
          color,
          r: Math.random()*3+1,
          life: 1, decay: Math.random()*0.02+0.015,
        });
      }
    }

    function spawnTrail(el, x, y) {
      const colors = {
        fire:  ['#ff5500','#ff9900','#ffcc00'],
        water: ['#00aaff','#44ccff','#aaddff'],
        earth: ['#8b5e3c','#c8905a','#a0724a'],
        wind:  ['#ccddff','#ffffff','#aabbee'],
      }[el];
      for (let i = 0; i < 4; i++) {
        const c = colors[Math.floor(Math.random()*colors.length)];
        particles.push({
          x: x + (Math.random()-0.5)*6,
          y: y + (Math.random()-0.5)*6,
          vx: (Math.random()-0.5)*1.5,
          vy: (Math.random()-0.5)*1.5,
          color: c,
          r: Math.random()*4+1,
          life: 1, decay: 0.04,
        });
      }
    }

    function flash(text, color, dur = 1200) {
      flashMsg = { text, color, t: 0, maxT: dur };
    }

    // ── Combat logic ───────────────────────────────────────────────────────
    function castSpell(el) {
      if (phase !== 'IDLE' && phase !== 'ENEMY_CHARGE') return;
      if (!enemy) return;
      if (!started) {
        started = true;
        ctx.platform.start();
      }
      ensureAudio();
      ctx.platform.haptic('light');

      const wasCharging = phase === 'ENEMY_CHARGE';
      phase = 'CASTING';

      // Play cast sound
      ({ fire: sfxFire, water: sfxWater, earth: sfxEarth, wind: sfxWind }[el])();

      // Determine outcome
      const weakEl = WEAK_TO[enemy.el]; // what beats the enemy
      let outcome;
      if (el === weakEl) outcome = 'strong';
      else if (STRONG_VS[enemy.el] === el) outcome = 'weak'; // enemy's el beats player's el
      else outcome = 'neutral';

      // If interrupted charge with right element = interrupt + stun
      let interrupted = false;
      if (wasCharging && el === weakEl) {
        interrupted = true;
      }

      projectile = {
        x: PLAYER_X, y: PLAYER_Y,
        tx: ENEMY_X, ty: ENEMY_Y,
        el, outcome, interrupted,
        t: 0, maxT: PROJ_DUR,
        phase: 'fly',
      };
      chargeTimer = null;
    }

    function resolveSpell(proj) {
      const { el, outcome, interrupted } = proj;
      let dmg = 0;
      if (outcome === 'strong') {
        dmg = 30;
        flash('STRONG! ×2', '#ffcc00', 900);
        sfxHit();
        ctx.platform.haptic('medium');
        screenShake = 8;
        spawnBurst(ENEMY_X, ENEMY_Y, ELEM_COLOR[el], 20, 4);
      } else if (outcome === 'neutral') {
        dmg = 15;
        flash('HIT', '#ffffff', 700);
        sfxHit();
        ctx.platform.haptic('light');
        screenShake = 4;
        spawnBurst(ENEMY_X, ENEMY_Y, ELEM_COLOR[el], 10, 3);
      } else {
        // weak — enemy absorbs, heals 5
        dmg = -5;
        flash('ABSORBED!', ELEM_COLOR[enemy.el], 900);
        sfxAbsorb();
        ctx.platform.haptic('light');
        spawnBurst(ENEMY_X, ENEMY_Y, ELEM_COLOR[enemy.el], 12, 2);
      }

      enemyHP = Math.max(0, Math.min(enemyMaxHP, enemyHP - dmg));

      if (enemyHP <= 0) {
        // Kill
        enemiesDefeated++;
        totalDefeated++;
        score += enemy.isBoss ? 3 : 1;
        ctx.platform.setScore(score);
        sfxLevel();
        ctx.platform.haptic('heavy');
        screenShake = 14;
        for (let i = 0; i < 40; i++) spawnBurst(ENEMY_X, ENEMY_Y, ELEM_COLOR[enemy.el], 1, 5);

        playerHP = Math.min(MAX_HP, playerHP + 15);
        flash(enemy.isBoss ? 'BOSS SLAIN! +15 HP' : 'ENEMY DOWN! +15 HP', '#7fff7f', 1200);

        if (score > highScore) {
          highScore = score;
          ctx.storage.set('vier_hs', highScore);
        }

        ctx.timeout(() => { spawnEnemy(); }, 1000);
        phase = 'IDLE';
        return;
      }

      if (interrupted) {
        flash('INTERRUPTED! STUNNED!', '#ffff00', 1000);
        stunTimer = STUN_DUR;
        phase = 'STUN';
        ctx.timeout(() => {
          if (phase === 'STUN') {
            phase = 'IDLE';
            startEnemyCharge();
          }
        }, STUN_DUR);
      } else {
        // Enemy counter-attacks after brief delay
        phase = 'IDLE';
        ctx.timeout(() => {
          if (phase === 'IDLE' && enemy) startEnemyCharge();
        }, 400);
      }
    }

    function startEnemyCharge() {
      if (!enemy || phase === 'GAMEOVER' || phase === 'WIN') return;
      phase = 'ENEMY_CHARGE';
      chargeMax = ENEMY_ATK_CHARGE / enemy.spd;
      chargeTimer = chargeMax;
    }

    function enemyAttack() {
      phase = 'ENEMY_PROJ';
      chargeTimer = null;
      sfxFire(); // use enemy element sound
      ({ fire: sfxFire, water: sfxWater, earth: sfxEarth, wind: sfxWind }[enemy.el])();
      enemyProj = {
        x: ENEMY_X, y: ENEMY_Y,
        tx: PLAYER_X, ty: PLAYER_Y,
        el: enemy.el,
        t: 0, maxT: PROJ_DUR,
      };
    }

    function resolveEnemyAttack() {
      const dmg = enemy ? (10 + Math.floor(Math.random() * (enemy.atk - 10 + 1))) : 15;
      playerHP = Math.max(0, playerHP - dmg);
      flash(`-${dmg} HP`, '#ff4444', 800);
      sfxHit();
      ctx.platform.haptic('medium');
      screenShake = 6;
      spawnBurst(PLAYER_X, PLAYER_Y, ELEM_COLOR[enemy.el], 12, 3);

      if (playerHP <= 0) {
        phase = 'GAMEOVER';
        sfxGameOver();
        ctx.platform.fail({ reason: 'hp_zero' });
        return;
      }

      phase = 'IDLE';
      ctx.timeout(() => {
        if (phase === 'IDLE' && enemy) startEnemyCharge();
      }, 600);
    }

    // ── Init ───────────────────────────────────────────────────────────────
    buildQueue();
    spawnEnemy();
    // Start first enemy charge after a moment
    ctx.timeout(() => {
      if (phase === 'IDLE' && enemy) startEnemyCharge();
    }, 1500);

    // ── Touch ──────────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;

      // Info button
      if (Math.hypot(tx - (W-22), ty - 22) < 18) {
        showInfo = !showInfo;
        infoScroll = 0;
        return;
      }
      if (showInfo) {
        showInfo = false;
        return;
      }

      // Restart
      if (phase === 'GAMEOVER') {
        ensureAudio();
        playerHP = MAX_HP;
        enemiesDefeated = 0;
        score = 0;
        enemyIndex = 0;
        buildQueue();
        particles = [];
        projectile = null;
        enemyProj = null;
        chargeTimer = null;
        started = false;
        spawnEnemy();
        ctx.timeout(() => { if (phase === 'IDLE' && enemy) startEnemyCharge(); }, 1500);
        return;
      }

      // Element buttons
      for (const el of ELEMS) {
        const bp = BTN_POS[el];
        if (Math.hypot(tx - bp.x, ty - bp.y) < BTN_R + 10) {
          castSpell(el);
          return;
        }
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    // ── Draw helpers ───────────────────────────────────────────────────────
    function drawWizard(x, y, el, scale = 1, glow = '#88aaff') {
      g.save();
      g.translate(x, y);
      g.scale(scale, scale);
      // Glow
      g.shadowColor = glow;
      g.shadowBlur = 22;
      // Robe
      g.fillStyle = '#1a0a2e';
      g.beginPath();
      g.moveTo(-14, 0);
      g.quadraticCurveTo(-16, 20, -10, 38);
      g.lineTo(10, 38);
      g.quadraticCurveTo(16, 20, 14, 0);
      g.closePath();
      g.fill();
      // Robe trim
      g.strokeStyle = glow;
      g.lineWidth = 1.5;
      g.stroke();
      // Body glow core
      g.fillStyle = glow;
      g.globalAlpha = 0.25;
      g.beginPath();
      g.ellipse(0, 18, 10, 16, 0, 0, Math.PI*2);
      g.fill();
      g.globalAlpha = 1;
      // Head
      g.fillStyle = '#ffe0c0';
      g.beginPath();
      g.arc(0, -10, 10, 0, Math.PI*2);
      g.fill();
      g.strokeStyle = glow;
      g.lineWidth = 1.2;
      g.stroke();
      // Hat
      g.fillStyle = '#0a0520';
      g.beginPath();
      g.moveTo(-12, -10);
      g.lineTo(12, -10);
      g.lineTo(4, -32);
      g.lineTo(-4, -32);
      g.closePath();
      g.fill();
      g.strokeStyle = glow;
      g.lineWidth = 1;
      g.stroke();
      // Eyes
      g.fillStyle = glow;
      g.globalAlpha = 0.9;
      g.beginPath(); g.arc(-3.5, -10, 2, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(3.5, -10, 2, 0, Math.PI*2); g.fill();
      g.globalAlpha = 1;
      // Staff
      g.strokeStyle = '#a0724a';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(14, -2); g.lineTo(22, -30); g.stroke();
      g.fillStyle = glow;
      g.shadowColor = glow; g.shadowBlur = 16;
      g.beginPath(); g.arc(22, -32, 5, 0, Math.PI*2); g.fill();
      g.shadowBlur = 0;
      g.restore();
    }

    function drawProjectile(proj) {
      const t = proj.t / proj.maxT;
      const px = proj.x + (proj.tx - proj.x) * t;
      const py = proj.y + (proj.ty - proj.y) * t - Math.sin(t * Math.PI) * 40;
      const el = proj.el;
      const col = ELEM_COLOR[el];
      const glow = ELEM_GLOW[el];

      g.save();
      g.shadowColor = glow;
      g.shadowBlur = 20;

      if (el === 'fire') {
        // Fireball
        const grad = g.createRadialGradient(px,py,0, px,py,14);
        grad.addColorStop(0,'#ffffff');
        grad.addColorStop(0.3,'#ff9900');
        grad.addColorStop(1,'rgba(255,50,0,0)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(px, py, 14, 0, Math.PI*2); g.fill();
        // Sparks
        spawnTrail(el, px, py);
      } else if (el === 'water') {
        // Water sphere
        const grad = g.createRadialGradient(px,py,0, px,py,12);
        grad.addColorStop(0,'#cceeff');
        grad.addColorStop(0.4,'#00aaff');
        grad.addColorStop(1,'rgba(0,80,200,0)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(px, py, 12, 0, Math.PI*2); g.fill();
        // Ripple rings
        g.strokeStyle = 'rgba(100,200,255,0.5)';
        g.lineWidth = 1.5;
        for (let ri = 0; ri < 2; ri++) {
          g.beginPath(); g.arc(px, py, 14 + ri*6, 0, Math.PI*2); g.stroke();
        }
        spawnTrail(el, px, py);
      } else if (el === 'earth') {
        // Flying rock
        g.fillStyle = col;
        g.save(); g.translate(px, py); g.rotate(proj.t * 0.01);
        g.beginPath();
        g.moveTo(-8,-5); g.lineTo(8,-6); g.lineTo(10,4); g.lineTo(0,8); g.lineTo(-10,3);
        g.closePath(); g.fill();
        g.restore();
        spawnTrail(el, px, py);
      } else {
        // Wind — swirling gusts
        const ang = proj.t * 0.02;
        g.strokeStyle = 'rgba(200,220,255,0.7)';
        g.lineWidth = 2.5;
        for (let gi = 0; gi < 3; gi++) {
          const off = gi * (Math.PI*2/3);
          g.beginPath();
          g.arc(px + Math.cos(ang+off)*6, py + Math.sin(ang+off)*6, 8, 0, Math.PI*1.5);
          g.stroke();
        }
        spawnTrail(el, px, py);
      }
      g.restore();
    }

    function drawHPBar(x, y, w, h, ratio, col, glow) {
      // Background
      g.fillStyle = 'rgba(0,0,0,0.5)';
      roundRectC(g, x, y, w, h, h/2);
      g.fill();
      // Bar
      if (ratio > 0) {
        g.save();
        g.shadowColor = glow;
        g.shadowBlur = 10;
        const barW = Math.max(h, (w - 4) * ratio);
        const grad = g.createLinearGradient(x+2, y, x+w-2, y);
        grad.addColorStop(0, col);
        grad.addColorStop(1, glow);
        g.fillStyle = grad;
        roundRectC(g, x+2, y+2, barW - 4, h-4, (h-4)/2);
        g.fill();
        g.restore();
      }
      // Border
      g.strokeStyle = glow;
      g.lineWidth = 1.2;
      g.globalAlpha = 0.6;
      roundRectC(g, x, y, w, h, h/2);
      g.stroke();
      g.globalAlpha = 1;
    }

    function drawChargeBar(ratio) {
      const bw = W * 0.5;
      const bx = (W - bw) / 2;
      const by = ENEMY_Y + 60;
      // Pulsing warning color
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.01);
      g.save();
      g.globalAlpha = pulse;
      // Label
      g.fillStyle = '#ffaa00';
      g.font = `bold ${Math.round(H*0.022)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('⚡ CHARGING...', W/2, by - 6);
      drawHPBar(bx, by, bw, 10, ratio, '#ff8800', '#ffcc00');
      g.restore();
    }

    // ── Main loop ──────────────────────────────────────────────────────────
    let elapsed = 0;

    ctx.raf((dt) => {
      elapsed += dt;
      wobble = Math.sin(elapsed * 0.002);
      enemyBob = Math.sin(elapsed * 0.003) * 4;

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.04;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Update floating bg particles
      for (const fp of floatParticles) {
        fp.x += fp.vx; fp.y += fp.vy;
        fp.life -= 0.002;
        if (fp.life <= 0) {
          fp.x = Math.random()*W; fp.y = H + 5;
          fp.life = 0.3 + Math.random()*0.7;
          fp.hue = Math.random()*360;
        }
      }

      // Update flash
      if (flashMsg) {
        flashMsg.t += dt;
        if (flashMsg.t >= flashMsg.maxT) flashMsg = null;
      }

      // Update screen shake
      if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 0.05);

      // Update projectile
      if (projectile) {
        projectile.t += dt;
        if (projectile.t >= projectile.maxT) {
          const p = projectile;
          projectile = null;
          resolveSpell(p);
        }
      }

      // Update enemy projectile
      if (enemyProj) {
        enemyProj.t += dt;
        if (enemyProj.t >= enemyProj.maxT) {
          enemyProj = null;
          resolveEnemyAttack();
        }
      }

      // Charge timer countdown
      if (phase === 'ENEMY_CHARGE' && chargeTimer !== null) {
        chargeTimer -= dt;
        if (chargeTimer <= 0) {
          chargeTimer = null;
          enemyAttack();
        }
      }

      // Shake offset
      const sx = screenShake > 0 ? (Math.random()-0.5)*screenShake : 0;
      const sy = screenShake > 0 ? (Math.random()-0.5)*screenShake : 0;

      g.save();
      g.translate(sx, sy);

      // ── Background ────────────────────────────────────────────────────
      g.fillStyle = '#0f0814';
      g.fillRect(-10, -10, W+20, H+20);

      // Subtle radial vignette
      const vig = g.createRadialGradient(W/2,H/2,H*0.2, W/2,H/2,H*0.8);
      vig.addColorStop(0,'rgba(0,0,0,0)');
      vig.addColorStop(1,'rgba(0,0,0,0.6)');
      g.fillStyle = vig;
      g.fillRect(0,0,W,H);

      // Stars
      for (const s of stars) {
        s.blink += dt * s.spd * 0.003;
        const alpha = 0.4 + 0.5*Math.abs(Math.sin(s.blink));
        g.fillStyle = `rgba(200,210,255,${alpha})`;
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI*2); g.fill();
      }

      // Floating magical particles
      for (const fp of floatParticles) {
        g.globalAlpha = fp.alpha * fp.life;
        g.fillStyle = `hsl(${fp.hue},80%,70%)`;
        g.beginPath(); g.arc(fp.x, fp.y, fp.r, 0, Math.PI*2); g.fill();
      }
      g.globalAlpha = 1;

      // Arena divider line
      g.strokeStyle = 'rgba(150,100,255,0.15)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, H*0.52); g.lineTo(W, H*0.52); g.stroke();

      // Magical glow beneath enemy
      if (enemy) {
        const ec = ELEM_COLOR[enemy.el];
        const eglow = g.createRadialGradient(ENEMY_X, ENEMY_Y+30, 5, ENEMY_X, ENEMY_Y+30, 60);
        eglow.addColorStop(0, ec.replace(')',',0.25)').replace('rgb','rgba'));
        eglow.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = eglow;
        g.beginPath(); g.ellipse(ENEMY_X, ENEMY_Y+30, 60, 30, 0, 0, Math.PI*2); g.fill();
      }

      // Magical glow beneath player
      const pglow = g.createRadialGradient(PLAYER_X, PLAYER_Y+30, 5, PLAYER_X, PLAYER_Y+30, 55);
      pglow.addColorStop(0, 'rgba(80,120,255,0.2)');
      pglow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = pglow;
      g.beginPath(); g.ellipse(PLAYER_X, PLAYER_Y+30, 55, 26, 0, 0, Math.PI*2); g.fill();

      // ── Particles ─────────────────────────────────────────────────────
      for (const p of particles) {
        g.globalAlpha = Math.max(0, p.life);
        g.fillStyle = p.color;
        g.shadowColor = p.color;
        g.shadowBlur = 6;
        g.beginPath(); g.arc(p.x, p.y, p.r * p.life, 0, Math.PI*2); g.fill();
      }
      g.globalAlpha = 1;
      g.shadowBlur = 0;

      // ── Enemy wizard ──────────────────────────────────────────────────
      if (enemy && phase !== 'GAMEOVER') {
        const ec = ELEM_COLOR[enemy.el];
        const eg = ELEM_GLOW[enemy.el];
        drawWizard(ENEMY_X, ENEMY_Y + enemyBob, enemy.el, 1, eg);

        // Enemy name
        g.fillStyle = eg;
        g.font = `bold ${Math.round(H*0.025)}px sans-serif`;
        g.textAlign = 'center';
        g.shadowColor = eg; g.shadowBlur = 8;
        g.fillText(enemy.name, ENEMY_X, ENEMY_Y - 62);
        g.shadowBlur = 0;

        // Elemental weakness indicator (pulsing)
        const weakEl = WEAK_TO[enemy.el];
        const pulse2 = 0.7 + 0.3*Math.sin(elapsed*0.005);
        g.globalAlpha = pulse2;
        g.font = `${Math.round(H*0.022)}px sans-serif`;
        g.fillStyle = ELEM_GLOW[weakEl];
        g.fillText(`WEAK: ${ELEM_LABEL[weakEl]}`, ENEMY_X, ENEMY_Y - 44);
        g.globalAlpha = 1;

        // Enemy HP bar
        const ebw = W * 0.5;
        const ebx = (W - ebw) / 2;
        drawHPBar(ebx, ENEMY_Y - 35, ebw, 12, enemyHP/enemyMaxHP, ec, eg);
        g.fillStyle = '#cccccc';
        g.font = `${Math.round(H*0.018)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText(`${enemyHP}/${enemyMaxHP}`, ENEMY_X, ENEMY_Y - 24);

        // Boss crown
        if (enemy.isBoss) {
          g.fillStyle = '#ffd700';
          g.font = `${Math.round(H*0.035)}px sans-serif`;
          g.textAlign = 'center';
          g.fillText('♛', ENEMY_X, ENEMY_Y - 76);
        }

        // Charge bar
        if (phase === 'ENEMY_CHARGE' && chargeTimer !== null) {
          drawChargeBar(1 - chargeTimer/chargeMax);
        }

        // Stun indicator
        if (phase === 'STUN') {
          g.fillStyle = '#ffff00';
          g.font = `bold ${Math.round(H*0.03)}px sans-serif`;
          g.textAlign = 'center';
          g.shadowColor = '#ffff00'; g.shadowBlur = 12;
          g.fillText('★ STUNNED ★', ENEMY_X, ENEMY_Y - 85);
          g.shadowBlur = 0;
        }
      }

      // ── Player wizard ─────────────────────────────────────────────────
      if (phase !== 'GAMEOVER') {
        drawWizard(PLAYER_X, PLAYER_Y + wobble*2, 'player', 1, '#88aaff');
      }

      // ── Projectiles ───────────────────────────────────────────────────
      if (projectile) drawProjectile(projectile);
      if (enemyProj) drawProjectile(enemyProj);

      // ── HUD ───────────────────────────────────────────────────────────
      const hudY = 14;
      // HP label
      g.fillStyle = '#aabbff';
      g.font = `${Math.round(H*0.022)}px sans-serif`;
      g.textAlign = 'left';
      g.fillText('YOUR HP', 14, hudY + 14);
      // HP bar
      const hpCol = playerHP > 50 ? '#44ff88' : playerHP > 25 ? '#ffcc00' : '#ff4444';
      const hpGlow = playerHP > 50 ? '#00ff66' : playerHP > 25 ? '#ffaa00' : '#ff2222';
      drawHPBar(14, hudY + 18, W * 0.45, 14, playerHP/MAX_HP, hpCol, hpGlow);
      g.fillStyle = '#ffffff';
      g.font = `${Math.round(H*0.02)}px sans-serif`;
      g.textAlign = 'left';
      g.fillText(`${playerHP}/${MAX_HP}`, 18, hudY + 46);

      // Score / defeated
      g.fillStyle = '#ffd700';
      g.font = `bold ${Math.round(H*0.026)}px sans-serif`;
      g.textAlign = 'right';
      g.shadowColor = '#ffd700'; g.shadowBlur = 8;
      g.fillText(`⚔ ${score}`, W - 14, hudY + 20);
      g.shadowBlur = 0;
      g.fillStyle = '#888aaa';
      g.font = `${Math.round(H*0.018)}px sans-serif`;
      g.fillText(`Best: ${highScore}`, W-14, hudY + 38);

      g.textAlign = 'center';

      // ── Element Buttons ───────────────────────────────────────────────
      const btnEnabled = (phase === 'IDLE' || phase === 'ENEMY_CHARGE') && !showInfo;
      for (const el of ELEMS) {
        const bp = BTN_POS[el];
        const bc = ELEM_COLOR[el];
        const bg = ELEM_GLOW[el];
        const isWeak = enemy && WEAK_TO[enemy.el] === el;
        const pulse3 = isWeak ? 0.7 + 0.3*Math.sin(elapsed*0.008) : 1;

        g.save();
        g.globalAlpha = btnEnabled ? pulse3 : 0.4;
        g.shadowColor = bg;
        g.shadowBlur = isWeak ? 28 : 14;

        // Outer ring (weakness pulse)
        if (isWeak) {
          g.strokeStyle = bg;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(bp.x, bp.y, BTN_R + 4 + pulse3*4, 0, Math.PI*2);
          g.stroke();
        }

        // Button body
        const btnGrad = g.createRadialGradient(bp.x, bp.y-BTN_R*0.3, 2, bp.x, bp.y, BTN_R);
        btnGrad.addColorStop(0, bg);
        btnGrad.addColorStop(0.5, bc);
        btnGrad.addColorStop(1, '#0f0814');
        g.fillStyle = btnGrad;
        g.beginPath(); g.arc(bp.x, bp.y, BTN_R, 0, Math.PI*2); g.fill();

        g.strokeStyle = bg;
        g.lineWidth = 2;
        g.beginPath(); g.arc(bp.x, bp.y, BTN_R, 0, Math.PI*2); g.stroke();

        // Emoji label
        g.shadowBlur = 0;
        g.font = `${Math.round(BTN_R * 0.9)}px sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = '#ffffff';
        g.fillText(ELEM_LABEL[el], bp.x, bp.y + BTN_R*0.33);

        g.restore();
      }

      // ── Flash message ─────────────────────────────────────────────────
      if (flashMsg) {
        const prog = flashMsg.t / flashMsg.maxT;
        const alpha = prog < 0.3 ? prog/0.3 : prog > 0.7 ? 1-(prog-0.7)/0.3 : 1;
        const yOff = -30 * prog;
        g.globalAlpha = alpha;
        g.fillStyle = flashMsg.color;
        g.font = `bold ${Math.round(H*0.042)}px sans-serif`;
        g.textAlign = 'center';
        g.shadowColor = flashMsg.color; g.shadowBlur = 20;
        g.fillText(flashMsg.text, W/2, H/2 + yOff);
        g.shadowBlur = 0;
        g.globalAlpha = 1;
      }

      // ── Game Over screen ──────────────────────────────────────────────
      if (phase === 'GAMEOVER') {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);

        g.fillStyle = '#ff2244';
        g.font = `bold ${Math.round(H*0.07)}px sans-serif`;
        g.textAlign = 'center';
        g.shadowColor = '#ff2244'; g.shadowBlur = 30;
        g.fillText('DEFEATED', W/2, H*0.35);
        g.shadowBlur = 0;

        g.fillStyle = '#ffd700';
        g.font = `${Math.round(H*0.04)}px sans-serif`;
        g.fillText(`Enemies Slain: ${score}`, W/2, H*0.46);

        g.fillStyle = '#aabbff';
        g.font = `${Math.round(H*0.03)}px sans-serif`;
        g.fillText(`Best: ${highScore}`, W/2, H*0.54);

        // Tap to restart
        const pulse4 = 0.6 + 0.4*Math.sin(elapsed*0.004);
        g.globalAlpha = pulse4;
        g.fillStyle = '#ffffff';
        g.font = `bold ${Math.round(H*0.035)}px sans-serif`;
        g.fillText('TAP TO TRY AGAIN', W/2, H*0.65);
        g.globalAlpha = 1;
      }

      // ── Win screen ────────────────────────────────────────────────────
      if (phase === 'WIN') {
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(0, 0, W, H);

        g.fillStyle = '#ffd700';
        g.font = `bold ${Math.round(H*0.07)}px sans-serif`;
        g.textAlign = 'center';
        g.shadowColor = '#ffd700'; g.shadowBlur = 30;
        g.fillText('VICTORY!', W/2, H*0.35);
        g.shadowBlur = 0;

        g.fillStyle = '#ffffff';
        g.font = `${Math.round(H*0.04)}px sans-serif`;
        g.fillText(`Score: ${score}`, W/2, H*0.46);

        g.fillStyle = '#aaffaa';
        g.font = `${Math.round(H*0.03)}px sans-serif`;
        g.fillText('Master of the Four Elements!', W/2, H*0.54);
      }

      // ── Info overlay ──────────────────────────────────────────────────
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);

        g.fillStyle = '#ccaaff';
        g.font = `bold ${Math.round(H*0.045)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('VIER', W/2, 50);

        const lines = [
          'Tap element buttons to cast spells.',
          '',
          'Weakness cycle:',
          '🔥 Fire beats 🌍 Earth',
          '🌍 Earth beats 💨 Wind',
          '💨 Wind beats 💧 Water',
          '💧 Water beats 🔥 Fire',
          '',
          'Hit weakness = STRONG (30 dmg)',
          'Neutral = HIT (15 dmg)',
          'Enemy element = ABSORBED (heals!)',
          '',
          'Enemy charging? Cast the right',
          'counter-element to INTERRUPT + STUN.',
          '',
          'Every 4th enemy is a BOSS (200 HP).',
          'Kill enemies to restore +15 HP.',
          '',
          'Tap anywhere to close.',
        ];

        g.font = `${Math.round(H*0.028)}px sans-serif`;
        g.textAlign = 'center';
        lines.forEach((ln, i) => {
          if (!ln) return;
          const isHead = ln.endsWith(':');
          g.fillStyle = isHead ? '#ffd700' : '#ddccff';
          if (ln.startsWith('🔥') || ln.startsWith('🌍') || ln.startsWith('💨') || ln.startsWith('💧')) g.fillStyle = '#ffffff';
          if (ln.includes('STRONG') || ln.includes('ABSORBED') || ln.includes('INTERRUPT')) g.fillStyle = '#aaffaa';
          g.fillText(ln, W/2, 90 + i * Math.round(H*0.038));
        });
      }

      // ── Info button ───────────────────────────────────────────────────
      g.fillStyle = 'rgba(80,50,120,0.8)';
      g.beginPath(); g.arc(W-22, 22, 14, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#aa88ff'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(W-22, 22, 14, 0, Math.PI*2); g.stroke();
      g.fillStyle = '#ffffff';
      g.font = `bold ${Math.round(H*0.025)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('i', W-22, 27);

      g.restore(); // end shake

      ctx.platform.setProgress(Math.min(1, enemyIndex / enemyQueue.length));
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
