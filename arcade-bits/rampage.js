window.plethoraBit = {
  meta: {
    title: 'Rampage',
    author: 'plethora',
    description: 'Giant monster destroys the city!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;
    const FLOOR = H - SB - 60;

    let ac = null;
    function initAudio() { if (!ac) ac = new AudioContext(); }
    function beep(f, d, type = 'square', v = 0.3) {
      if (!ac) return;
      const o = ac.createOscillator(), gn = ac.createGain();
      o.connect(gn); gn.connect(ac.destination);
      o.type = type; o.frequency.value = f;
      gn.gain.setValueAtTime(v, ac.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
      o.start(); o.stop(ac.currentTime + d);
    }
    function punchSnd() { beep(60, 0.15, 'sawtooth', 0.5); beep(120, 0.1, 'square', 0.3); }
    function eatSnd() { beep(300, 0.08, 'sine', 0.3); }
    function hitSnd() { beep(40, 0.2, 'square', 0.6); }
    function throwSnd() { beep(200, 0.08, 'sawtooth', 0.4); }
    function buildingCrumbleSnd() { [100,80,60,40].forEach((f,i)=>setTimeout(()=>beep(f,0.15,'sawtooth',0.5),i*60)); }
    function dieSnd() { [200,150,100,60].forEach((f,i)=>setTimeout(()=>beep(f,0.25,'sawtooth',0.6),i*130)); }

    const MONSTERS = [
      { name: 'George', color: '#886644', eyeColor: '#ff8800', type: 'ape', punchRange: 80 },
      { name: 'Lizzie', color: '#448844', eyeColor: '#ff0000', type: 'lizard', punchRange: 95 },
      { name: 'Ralph',  color: '#6644aa', eyeColor: '#00ff88', type: 'wolf', punchRange: 72 },
    ];

    const HS_KEY = 'hs_rampage';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'select';
    let chosen = 0;
    let started = false;
    let swipeStartX, swipeStartY, swipeT;

    let monster, buildings, debris, helicopters, tanks, people, score, city, punchAnim, throwDebris;

    function resetGame() {
      const m = MONSTERS[chosen];
      monster = { x: W * 0.12, y: FLOOR, hp: 20, maxHp: 20, dir: 1,
        color: m.color, eyeColor: m.eyeColor, type: m.type,
        punchRange: m.punchRange, invincible: 0, punchAnim: 0,
        climbTarget: null, climbY: 0, climbTimer: 0, roarTimer: 0 };
      buildings = generateBuildings();
      debris = []; helicopters = []; tanks = []; people = [];
      score = 0; city = 1; punchAnim = 0; throwDebris = null;
      spawnMilitary();
    }

    function generateBuildings() {
      const bldgs = [];
      let x = W * 0.18;
      for (let i = 0; i < 6; i++) {
        const w = 50 + Math.random() * 30;
        const h = 120 + Math.random() * 140;
        const floors = Math.floor(h / 22);
        const hp = floors * 3;
        bldgs.push({ x, y: FLOOR - h, w, h, hp, maxHp: hp, floors, windows: [], flashing: 0 });
        x += w + 20 + Math.random() * 15;
      }
      return bldgs;
    }

    function spawnMilitary() {
      if (helicopters.length < 2) {
        helicopters.push({ x: W + 40, y: H * 0.2 + Math.random() * H * 0.2, vx: -1.2 - city * 0.1,
          hp: 2, hitFlash: 0, shootT: 1500 });
      }
      if (tanks.length < 2) {
        tanks.push({ x: W + 30, y: FLOOR, vx: -(0.5 + city * 0.06), hp: 3, hitFlash: 0, shootT: 2000 });
      }
    }

    function doPunch(dir) {
      monster.dir = dir;
      monster.punchAnim = 22;
      punchSnd();
      ctx.platform.haptic('heavy');
      // punch buildings
      buildings.forEach(b => {
        const dx = dir > 0 ? (b.x - monster.x) : (monster.x - (b.x + b.w));
        if (dx > -10 && dx < monster.punchRange) {
          b.hp -= 2; b.flashing = 10;
          buildingCrumbleSnd();
          // spawn debris
          for (let i = 0; i < 3; i++) {
            debris.push({ x: b.x + Math.random() * b.w, y: b.y + Math.random() * 30,
              vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 4, life: 60 });
          }
          if (b.hp <= 0) {
            score += 200; ctx.platform.setScore(score);
            for (let i = 0; i < 8; i++) debris.push({ x: b.x + Math.random()*b.w, y: b.y + Math.random()*b.h, vx: (Math.random()-0.5)*10, vy: -8-Math.random()*6, life: 80 });
            ctx.platform.haptic('heavy');
          }
          score += 10;
          if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
        }
      });
      buildings = buildings.filter(b => b.hp > 0);
      // punch helicopters/tanks
      helicopters.forEach(h => {
        const dx = dir > 0 ? (h.x - monster.x) : (monster.x - h.x);
        if (dx > -10 && dx < monster.punchRange + 30 && Math.abs(h.y - monster.y) < 120) {
          h.hp -= 2; h.hitFlash = 10; score += 80; ctx.platform.setScore(score);
        }
      });
      tanks.forEach(t => {
        const dx = dir > 0 ? (t.x - monster.x) : (monster.x - t.x);
        if (dx > -10 && dx < monster.punchRange && t.y > FLOOR - 20) {
          t.hp -= 3; t.hitFlash = 12; score += 60;
        }
      });
      // eat people
      people.forEach(p => {
        if (Math.abs(p.x - monster.x) < 80) { p.eaten = true; monster.hp = Math.min(monster.maxHp, monster.hp + 1); eatSnd(); }
      });
      people = people.filter(p => !p.eaten);
      helicopters = helicopters.filter(h => h.hp > 0);
      tanks = tanks.filter(t => t.hp > 0);
      if (buildings.length === 0) nextCity();
    }

    function doThrow() {
      if (debris.length === 0) return;
      const chunk = debris.find(d => d.life <= 0 || true);
      if (!chunk) return;
      throwSnd();
      debris.push({ x: monster.x + monster.dir * 50, y: monster.y - 80, vx: monster.dir * 10, vy: -6, life: 90, isThrown: true });
    }

    function nextCity() {
      score += city * 500;
      city++;
      ctx.timeout(() => {
        buildings = generateBuildings();
        spawnMilitary();
        monster.hp = Math.min(monster.maxHp, monster.hp + 5);
      }, 1000);
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      swipeStartX = tx; swipeStartY = ty; swipeT = Date.now();
      if (state === 'select') {
        chosen = Math.min(2, Math.floor(tx / (W / 3)));
        state = 'playing'; resetGame();
        if (!started) { started = true; ctx.platform.start(); }
        return;
      }
      if (state === 'gameover') { state = 'select'; return; }
      if (!started) { started = true; ctx.platform.start(); }
      const dir = tx > W / 2 ? 1 : -1;
      doPunch(dir);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStartX, dy = ty - swipeStartY;
      if (Date.now() - swipeT < 300 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) doThrow();
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      g.clearRect(0, 0, W, H);
      if (state === 'select') { drawSelect(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      if (monster.punchAnim > 0) monster.punchAnim--;
      if (monster.invincible > 0) monster.invincible--;

      // monster auto-walk
      if (buildings.length > 0) {
        const near = buildings.reduce((a, b) => Math.abs(b.x + b.w/2 - monster.x) < Math.abs(a.x + a.w/2 - monster.x) ? b : a);
        const dx = (near.x + near.w/2) - monster.x;
        if (Math.abs(dx) > near.w/2 + 30) { monster.x += Math.sign(dx) * 1.4 * s; monster.dir = Math.sign(dx); }
      }
      monster.x = Math.max(30, Math.min(W - 30, monster.x));

      // debris physics
      debris.forEach(d => {
        d.x += d.vx * s; d.vy += 0.5 * s; d.y += d.vy * s; d.life -= s;
        if (d.y > FLOOR) { d.y = FLOOR; d.vy *= -0.3; d.vx *= 0.7; }
        if (d.isThrown) {
          helicopters.forEach(h => {
            if (Math.abs(d.x - h.x) < 30 && Math.abs(d.y - h.y) < 30) { h.hp--; h.hitFlash = 12; d.life = 0; score += 100; }
          });
          tanks.forEach(t => {
            if (Math.abs(d.x - t.x) < 30 && Math.abs(d.y - FLOOR) < 30) { t.hp -= 2; t.hitFlash = 12; d.life = 0; score += 80; }
          });
        }
      });
      debris = debris.filter(d => d.life > 0);

      // helicopters
      helicopters.forEach(h => {
        if (h.hitFlash > 0) h.hitFlash--;
        h.x += h.vx * s;
        if (h.x < -60) h.x = W + 40;
        h.shootT -= dt;
        if (h.shootT <= 0 && h.hp > 0) {
          h.shootT = 1500 + Math.random() * 500;
          debris.push({ x: h.x, y: h.y + 14, vx: (monster.x - h.x) * 0.03, vy: 3, life: 80 });
        }
      });
      helicopters = helicopters.filter(h => h.hp > 0);

      // tanks
      tanks.forEach(t => {
        if (t.hitFlash > 0) t.hitFlash--;
        t.x += t.vx * s;
        if (t.x < -60) t.x = W + 30;
        t.shootT -= dt;
        if (t.shootT <= 0) {
          t.shootT = 2000;
          debris.push({ x: t.x - 20, y: FLOOR - 15, vx: -5, vy: -3, life: 60 });
        }
        // tank shell hits monster
        if (Math.abs(t.x - monster.x) < 40 && monster.invincible <= 0) {
          monster.hp -= 1; monster.invincible = 45; hitSnd();
        }
      });

      // debris hits monster
      debris.forEach(d => {
        if (!d.isThrown && Math.abs(d.x - monster.x) < 30 && Math.abs(d.y - monster.y) < 40 && monster.invincible <= 0) {
          monster.hp -= 0.5; monster.invincible = 20; hitSnd();
        }
      });

      // spawn people occasionally
      if (Math.random() < 0.005 && people.length < 6) {
        people.push({ x: W * (0.1 + Math.random() * 0.8), y: FLOOR, vx: (Math.random()-0.5) * 1.5 });
      }
      people.forEach(p => { p.x += p.vx * s; });

      if (monster.hp <= 0) { dieSnd(); state = 'gameover'; }
      if (tanks.length === 0 && helicopters.length === 0 && score > city * 200) spawnMilitary();

      drawBG();
      drawBuildings();
      drawDebris();
      drawTanks();
      drawHelicopters();
      drawPeople();
      drawMonster();
      drawHUD();
    });

    function drawBG() {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#220000'); sky.addColorStop(0.6, '#441108'); sky.addColorStop(1, '#220808');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = '#330a00'; g.fillRect(0, FLOOR, W, H);
      g.fillStyle = '#441100'; g.fillRect(0, FLOOR, W, 8);
      // fire glow at bottom
      const fireGrad = g.createLinearGradient(0, FLOOR - 40, 0, FLOOR);
      fireGrad.addColorStop(0, 'rgba(255,60,0,0)'); fireGrad.addColorStop(1, 'rgba(255,100,0,0.25)');
      g.fillStyle = fireGrad; g.fillRect(0, FLOOR - 40, W, 40);
    }

    function drawBuildings() {
      buildings.forEach(b => {
        const pct = b.hp / b.maxHp;
        g.fillStyle = b.flashing > 0 ? '#ffaa44' : `hsl(20,${15+pct*20}%,${15+pct*15}%)`;
        if (b.flashing > 0) b.flashing--;
        g.fillRect(b.x, b.y, b.w, b.h);
        g.fillStyle = `rgba(255,200,0,${0.3+pct*0.3})`;
        for (let fl = 0; fl < b.floors; fl++) {
          for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += 14) {
            if (Math.random() > 0.3) g.fillRect(wx, b.y + fl * 22 + 4, 8, 10);
          }
        }
        // damage cracks
        if (pct < 0.6) {
          g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(b.x + b.w*0.4, b.y + 20); g.lineTo(b.x + b.w*0.55, b.y + 60); g.stroke();
        }
      });
    }

    function drawDebris() {
      debris.forEach(d => {
        g.fillStyle = '#8a6040';
        g.fillRect(d.x - 6, d.y - 6, 12, 12);
      });
    }

    function drawTanks() {
      tanks.forEach(t => {
        g.save(); g.translate(t.x, t.y);
        if (t.hitFlash > 0 && Math.floor(t.hitFlash/2)%2) g.globalAlpha = 0.3;
        g.fillStyle = '#4a5520'; g.fillRect(-24, -16, 48, 16);
        g.fillStyle = '#5a6628'; g.fillRect(-18, -24, 36, 10);
        g.fillStyle = '#778833'; g.fillRect(-30, 0, 60, 6);
        g.fillStyle = '#334411'; g.fillRect(18, -18, 16, 5);
        g.restore();
      });
    }

    function drawHelicopters() {
      helicopters.forEach(h => {
        g.save(); g.translate(h.x, h.y);
        if (h.hitFlash > 0 && Math.floor(h.hitFlash/2)%2) g.globalAlpha = 0.3;
        g.fillStyle = '#336633'; g.fillRect(-20, -8, 40, 16);
        g.fillStyle = '#448844'; g.fillRect(-5, -16, 10, 10);
        g.fillStyle = 'rgba(100,200,100,0.6)';
        g.beginPath(); g.ellipse(0, -16, 25, 4, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = '#336633'; g.fillRect(18, -2, 12, 4);
        g.restore();
      });
    }

    function drawPeople() {
      people.forEach(p => {
        g.fillStyle = '#c8a888'; g.fillRect(p.x - 3, p.y - 20, 6, 14);
        g.beginPath(); g.arc(p.x, p.y - 24, 5, 0, Math.PI*2); g.fill();
      });
    }

    function drawMonster() {
      if (monster.invincible > 0 && Math.floor(monster.invincible/4)%2) return;
      const m = MONSTERS[chosen];
      g.save(); g.translate(monster.x, monster.y); g.scale(monster.dir, 1);
      const punchOff = monster.punchAnim > 0 ? 20 : 0;
      if (m.type === 'ape') {
        g.fillStyle = monster.color;
        g.fillRect(-20, -80, 40, 80);
        g.fillStyle = '#6a4a28'; g.beginPath(); g.ellipse(0, -90, 22, 22, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = '#c8a050'; g.beginPath(); g.ellipse(0, -85, 12, 10, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = monster.eyeColor; g.beginPath(); g.arc(-7, -93, 4, 0, Math.PI*2); g.fill();
        g.fillRect(-30, -72, 14, 18); g.fillRect(16 + punchOff, -72, 14, 18);
      } else if (m.type === 'lizard') {
        g.fillStyle = monster.color;
        g.fillRect(-22, -85, 44, 85);
        g.beginPath(); g.ellipse(0, -95, 18, 22, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = '#66aa66'; g.fillRect(-25, -55, 12, 20); g.fillRect(13 + punchOff, -55, 12, 20);
        g.fillStyle = monster.eyeColor; g.beginPath(); g.arc(-5, -98, 4, 0, Math.PI*2); g.fill();
        g.fillStyle = monster.color; g.fillRect(22, -50, 15, 30);
      } else {
        g.fillStyle = monster.color;
        g.fillRect(-18, -78, 36, 78);
        g.beginPath(); g.ellipse(0, -88, 18, 18, 0, 0, Math.PI*2); g.fill();
        g.fillRect(-6, -106, 6, 20); g.fillRect(2, -108, 6, 22);
        g.fillStyle = '#8866cc'; g.fillRect(-26, -68, 12, 22); g.fillRect(14 + punchOff, -68, 12, 22);
        g.fillStyle = monster.eyeColor; g.beginPath(); g.arc(-5, -90, 4, 0, Math.PI*2); g.fill();
      }
      g.restore();
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, 26);
      g.textAlign = 'center'; g.fillText(`CITY ${city}`, W/2, 26);
      g.fillStyle = '#333'; g.fillRect(10, 35, 130, 10);
      g.fillStyle = monster.hp > monster.maxHp*0.5 ? '#44ff44' : '#ff4444';
      g.fillRect(10, 35, 130*(monster.hp/monster.maxHp), 10);
      g.fillStyle = '#fff'; g.font = '9px monospace'; g.textAlign = 'left';
      g.fillText(`MONSTER HP`, 12, 44);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '10px monospace'; g.textAlign = 'center';
      g.fillText('TAP L/R=PUNCH  SWIPE=THROW DEBRIS', W/2, H-SB-24);
    }

    function drawSelect() {
      g.fillStyle = '#220000'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff4400'; g.font = 'bold 26px monospace'; g.textAlign = 'center';
      g.fillText('RAMPAGE', W/2, H*0.1);
      g.fillStyle = '#aaa'; g.font = '12px monospace';
      g.fillText('CHOOSE YOUR MONSTER', W/2, H*0.2);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.27);
      MONSTERS.forEach((m, i) => {
        const x = W * (0.2 + i * 0.3);
        const y = H * 0.55;
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.roundRect(x-52, y-80, 104, 110, 8); g.fill();
        g.fillStyle = m.color;
        g.fillRect(x-18, y-70, 36, 70);
        g.beginPath(); g.ellipse(x, y-80, 18, 18, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = m.eyeColor; g.beginPath(); g.arc(x-5, y-82, 4, 0, Math.PI*2); g.fill();
        g.fillStyle = m.color; g.font = 'bold 13px monospace'; g.textAlign = 'center';
        g.fillText(m.name, x, y+16);
      });
    }

    function drawGameOver() {
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff4400'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('MONSTER DOWN!', W/2, H*0.38);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H*0.5);
      g.fillText(`HI: ${hs}`, W/2, H*0.59);
      g.fillStyle = '#ff4400'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.72);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
