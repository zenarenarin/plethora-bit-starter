window.plethoraBit = {
  meta: {
    title: "Dragon's Lair",
    author: 'plethora',
    description: 'Dirk the Daring — react or die!',
    tags: ['game'],
    permissions: [],
  },
  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SB = ctx.safeArea.bottom || 0;

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
    function correctSnd() { [440,550,660,880].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'sine',0.35),i*50)); }
    function wrongSnd() { [200,150,100].forEach((f,i)=>setTimeout(()=>beep(f,0.15,'sawtooth',0.5),i*80)); }
    function dangerSnd() { beep(800,0.05,'square',0.4); setTimeout(()=>beep(600,0.05,'square',0.4),60); }
    function victorySnd() { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,0.18,'sine',0.4),i*100)); }
    function gameOverSnd() { [300,200,150,100,60].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'sawtooth',0.5),i*120)); }

    const SCENES = [
      { name: 'Dungeon Entrance', bg: ['#1a0a05', '#2a1a0a'], detail: 'dungeon',
        prompt: { left:'LEFT', right:'RIGHT', jump:'JUMP', duck:'DUCK' } },
      { name: 'Drawbridge', bg: ['#0a1520', '#153045'], detail: 'bridge',
        prompt: { left:'LEFT', right:'RIGHT', jump:'JUMP', duck:'DUCK' } },
      { name: 'Giddy Goons Hall', bg: ['#15080a', '#2a1015'], detail: 'hall',
        prompt: { left:'LEFT', right:'RIGHT', jump:'JUMP', duck:'DUCK' } },
      { name: 'Snake Room', bg: ['#080a15', '#101830'], detail: 'snakes',
        prompt: { left:'LEFT', right:'RIGHT', jump:'JUMP', duck:'DUCK' } },
      { name: "Dragon's Lair", bg: ['#200505', '#3a0a0a'], detail: 'dragon',
        prompt: { left:'LEFT', right:'RIGHT', jump:'JUMP', duck:'DUCK' } },
    ];

    const REACTION_TIME = 800; // ms
    const CUES = ['left', 'right', 'jump', 'duck'];

    const HS_KEY = 'hs_dragonlair';
    let hs = ctx.storage.get(HS_KEY) || 0;
    let state = 'title';
    let started = false;

    let lives, sceneIdx, score, cue, cueTimer, cueStart, waiting, deathAnim, deathTimer;
    let dirk, bgAnimT, successAnim, successTimer;
    let swipeStartX, swipeStartY, swipeT;

    function resetGame() {
      lives = 3; sceneIdx = 0; score = 0;
      dirk = { x: W * 0.35, y: H * 0.62, facing: 1, deathFrame: 0, successFrame: 0 };
      cue = null; cueTimer = 0; waiting = false; deathAnim = false; deathTimer = 0;
      successAnim = false; successTimer = 0; bgAnimT = 0;
      queueNextCue();
    }

    function queueNextCue() {
      waiting = false;
      ctx.timeout(() => {
        if (state !== 'playing') return;
        cue = CUES[Math.floor(Math.random() * CUES.length)];
        cueStart = Date.now();
        cueTimer = REACTION_TIME;
        waiting = true;
        dangerSnd();
        ctx.platform.haptic('medium');
      }, 500 + Math.random() * 1200);
    }

    function handleInput(action) {
      if (!waiting || deathAnim || successAnim) return;
      if (action === cue) {
        // correct!
        correctSnd(); ctx.platform.haptic('light');
        waiting = false; cue = null;
        score += Math.ceil((cueTimer / REACTION_TIME) * 100);
        ctx.platform.setScore(score);
        if (score > hs) { hs = score; ctx.storage.set(HS_KEY, hs); }
        successAnim = true; successTimer = 40;
        dirk.successFrame = 20;
        // advance scene
        const nextScene = sceneIdx + 1;
        ctx.timeout(() => {
          if (state !== 'playing') return;
          successAnim = false;
          if (nextScene >= SCENES.length) {
            victorySnd();
            score += 500;
            sceneIdx = 0; // loop but harder
            ctx.platform.setScore(score);
            queueNextCue();
          } else {
            sceneIdx = nextScene;
            queueNextCue();
          }
        }, 600);
      } else {
        // wrong!
        wrongSnd(); ctx.platform.haptic('heavy');
        waiting = false; cue = null;
        lives--; deathAnim = true; deathTimer = 80; dirk.deathFrame = 60;
        if (lives <= 0) {
          gameOverSnd();
          ctx.timeout(() => { state = 'gameover'; }, 1200);
        } else {
          ctx.timeout(() => { deathAnim = false; dirk.deathFrame = 0; queueNextCue(); }, 1500);
        }
      }
    }

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      swipeStartX = tx; swipeStartY = ty; swipeT = Date.now();
      if (state === 'title') {
        state = 'playing'; resetGame();
        if (!started) { started = true; ctx.platform.start(); }
        return;
      }
      if (state === 'gameover') { state = 'title'; return; }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (state !== 'playing') return;
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const dx = tx - swipeStartX, dy = ty - swipeStartY;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx < 20 && ady < 20) return; // no swipe
      if (ady > adx) {
        if (dy < -30) handleInput('jump');
        else if (dy > 30) handleInput('duck');
      } else {
        if (dx < -30) handleInput('left');
        else if (dx > 30) handleInput('right');
      }
    }, { passive: false });

    ctx.raf(dt => {
      const s = dt / 16;
      bgAnimT += dt;
      g.clearRect(0, 0, W, H);

      if (state === 'title') { drawTitle(); return; }
      if (state === 'gameover') { drawGameOver(); return; }

      if (waiting && cue) {
        cueTimer -= dt;
        if (cueTimer <= 0 && !deathAnim && !successAnim) {
          // timeout = death
          wrongSnd(); ctx.platform.haptic('heavy');
          waiting = false; cue = null;
          lives--; deathAnim = true; deathTimer = 80; dirk.deathFrame = 60;
          if (lives <= 0) { gameOverSnd(); ctx.timeout(() => { state = 'gameover'; }, 1200); }
          else { ctx.timeout(() => { deathAnim = false; dirk.deathFrame = 0; queueNextCue(); }, 1500); }
        }
      }
      if (dirk.deathFrame > 0) dirk.deathFrame--;
      if (dirk.successFrame > 0) dirk.successFrame--;

      drawScene();
      drawDirk();
      drawCue();
      drawHUD();
    });

    function drawScene() {
      const sc = SCENES[sceneIdx];
      // background gradient
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, sc.bg[0]); grad.addColorStop(1, sc.bg[1]);
      g.fillStyle = grad; g.fillRect(0, 0, W, H);

      if (sc.detail === 'dungeon') {
        // stone arch
        g.strokeStyle = '#5a4020'; g.lineWidth = 18;
        g.beginPath();
        g.moveTo(W*0.05, H); g.lineTo(W*0.05, H*0.35);
        g.arcTo(W*0.5, H*0.1, W*0.95, H*0.35, W*0.45);
        g.lineTo(W*0.95, H); g.stroke();
        // torches
        drawTorch(W*0.12, H*0.5);
        drawTorch(W*0.88, H*0.5);
        // ground
        g.fillStyle = '#2a1a0a'; g.fillRect(0, H*0.72, W, H);
        drawStoneFloor(H*0.72);
      } else if (sc.detail === 'bridge') {
        // bridge
        g.strokeStyle = '#334'; g.lineWidth = 8;
        g.beginPath(); g.moveTo(0, H*0.72); g.lineTo(W, H*0.72); g.stroke();
        for (let i = 0; i < 8; i++) {
          const bx = W*0.1 + i * W*0.1;
          g.strokeStyle = '#2a3a4a'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(bx, H*0.72); g.lineTo(bx, H*0.72 - 30); g.stroke();
        }
        // water below
        g.fillStyle = '#0a1520'; g.fillRect(0, H*0.72, W, H);
        const wT = bgAnimT / 300;
        for (let wx = 0; wx < W; wx += 35) {
          g.strokeStyle = `rgba(50,100,180,${0.4+Math.sin(wT+wx*0.05)*0.2})`;
          g.lineWidth = 2;
          g.beginPath(); g.moveTo(wx, H*0.78+Math.sin(wT+wx*0.1)*5); g.lineTo(wx+25, H*0.78+Math.sin(wT+wx*0.1+1)*5); g.stroke();
        }
      } else if (sc.detail === 'hall') {
        // columns
        [0.1, 0.3, 0.7, 0.9].forEach(cx => {
          g.fillStyle = '#3a2a1a'; g.fillRect(W*cx - 12, H*0.2, 24, H*0.6);
          g.fillStyle = '#5a4030'; g.fillRect(W*cx - 15, H*0.2, 30, 14);
          g.fillRect(W*cx - 15, H*0.75, 30, 14);
        });
        g.fillStyle = '#1a0a05'; g.fillRect(0, H*0.72, W, H);
        drawStoneFloor(H*0.72);
      } else if (sc.detail === 'snakes') {
        // snake silhouettes
        const t = bgAnimT / 600;
        for (let i = 0; i < 3; i++) {
          g.strokeStyle = `rgba(40,${80+i*20},20,0.7)`;
          g.lineWidth = 12;
          g.beginPath();
          for (let x = 0; x < W; x += 5) {
            const y = H*0.55 + Math.sin(x*0.04 + t + i*2) * 40 + i * 35;
            if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
          // snake head
          const hx = (W * 0.2 + i * W * 0.3 + Math.sin(t * 0.7 + i) * 30);
          const hy = H*0.55 + Math.sin(hx*0.04 + t + i*2) * 40 + i * 35;
          g.fillStyle = '#204010'; g.beginPath(); g.ellipse(hx, hy, 18, 12, Math.sin(t+i)*0.3, 0, Math.PI*2); g.fill();
          g.fillStyle = '#ff0'; g.beginPath(); g.arc(hx - 5, hy - 3, 3, 0, Math.PI*2); g.fill();
          g.beginPath(); g.arc(hx + 5, hy - 3, 3, 0, Math.PI*2); g.fill();
        }
        g.fillStyle = '#0a0a1a'; g.fillRect(0, H*0.72, W, H);
      } else if (sc.detail === 'dragon') {
        // dragon silhouette
        const t = bgAnimT / 400;
        g.fillStyle = '#cc2200';
        g.save(); g.translate(W*0.72, H*0.38 + Math.sin(t)*10);
        // body
        g.beginPath(); g.ellipse(0, 0, 70, 45, 0, 0, Math.PI*2); g.fill();
        // head
        g.fillStyle = '#dd3300';
        g.beginPath(); g.ellipse(60, -20, 35, 28, 0.3, 0, Math.PI*2); g.fill();
        // teeth
        g.fillStyle = '#ffe'; g.fillRect(60, -10, 6, 12); g.fillRect(70, -10, 6, 12); g.fillRect(50, -10, 6, 12);
        // eye
        g.fillStyle = '#ff0'; g.beginPath(); g.ellipse(70, -26, 8, 6, 0.2, 0, Math.PI*2); g.fill();
        g.fillStyle = '#000'; g.beginPath(); g.ellipse(72, -26, 4, 5, 0.2, 0, Math.PI*2); g.fill();
        // wing
        g.fillStyle = '#aa1800';
        g.beginPath(); g.moveTo(-20, -10); g.lineTo(-80, -80); g.lineTo(-50, -20); g.lineTo(-20, 0); g.fill();
        // tail
        g.fillStyle = '#cc2200';
        g.beginPath(); g.moveTo(-60, 20); g.quadraticCurveTo(-100, 60, -80+Math.sin(t*1.5)*20, 80); g.lineTo(-70+Math.sin(t*1.5)*20, 72); g.quadraticCurveTo(-90, 50, -55, 18); g.fill();
        // fire
        const fBase = 90;
        const fireGrad = g.createRadialGradient(fBase, -15, 5, fBase + 30, -15, 50);
        fireGrad.addColorStop(0, 'rgba(255,200,50,0.9)');
        fireGrad.addColorStop(0.5, 'rgba(255,100,0,0.7)');
        fireGrad.addColorStop(1, 'rgba(255,0,0,0)');
        g.fillStyle = fireGrad;
        g.beginPath(); g.ellipse(fBase + 20, -15, 55 + Math.sin(t*3)*10, 18, 0.1, 0, Math.PI*2); g.fill();
        g.restore();
        g.fillStyle = '#1a0505'; g.fillRect(0, H*0.72, W, H);
        drawStoneFloor(H*0.72);
      }
    }

    function drawTorch(tx, ty) {
      g.fillStyle = '#5a3010'; g.fillRect(tx - 4, ty, 8, 30);
      const flicker = 0.7 + Math.sin(bgAnimT / 80 + tx) * 0.3;
      g.fillStyle = `rgba(255,${140+Math.random()*40},0,${flicker})`;
      g.beginPath(); g.ellipse(tx, ty - 8, 8, 14, 0, 0, Math.PI*2); g.fill();
      g.fillStyle = `rgba(255,220,0,${flicker * 0.5})`;
      g.beginPath(); g.ellipse(tx, ty - 10, 5, 10, 0, 0, Math.PI*2); g.fill();
    }

    function drawStoneFloor(fy) {
      g.fillStyle = '#2a1a0a'; g.fillRect(0, fy, W, H);
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 1;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 8; col++) {
          const offset = (row % 2) * (W/8/2);
          g.strokeRect(col*(W/8) + offset, fy + row*20, W/8, 20);
        }
      }
    }

    function drawDirk() {
      const dying = dirk.deathFrame > 0;
      const success = dirk.successFrame > 0;
      g.save(); g.translate(dirk.x, dirk.y);

      if (dying) {
        const t2 = 1 - (dirk.deathFrame / 60);
        g.rotate(t2 * Math.PI * 0.5);
        g.globalAlpha = Math.max(0, 1 - t2 * 0.8);
      } else if (success) {
        g.translate(0, -Math.sin(dirk.successFrame / 20 * Math.PI) * 20);
      }

      g.scale(dirk.facing, 1);
      // legs
      g.fillStyle = '#8b6433'; g.fillRect(-9, -14, 8, 20); g.fillRect(1, -14, 8, 20);
      // body/armor
      g.fillStyle = '#aaaacc'; g.fillRect(-12, -52, 24, 38);
      g.fillStyle = '#8888aa'; g.fillRect(-12, -52, 24, 10);
      // arms
      g.fillStyle = '#aaaacc';
      g.fillRect(-20, -50, 10, 10); g.fillRect(10, -50, 10, 10);
      // sword
      if (!dying) {
        g.fillStyle = '#ddd'; g.fillRect(20, -58, 4, 24);
        g.fillStyle = '#c8a050'; g.fillRect(16, -50, 12, 4);
      }
      // head with helmet
      g.fillStyle = '#c8a888'; g.beginPath(); g.ellipse(0, -60, 11, 11, 0, 0, Math.PI*2); g.fill();
      g.fillStyle = '#aaaacc'; g.fillRect(-12, -66, 24, 10);
      g.beginPath(); g.ellipse(0, -69, 11, 7, 0, 0, Math.PI, true); g.fill();
      g.fillStyle = '#888'; g.fillRect(-8, -64, 6, 8); g.fillRect(2, -64, 6, 8);

      if (success) {
        g.fillStyle = '#ffff00'; g.font = 'bold 16px monospace'; g.textAlign = 'center';
        g.fillText('YES!', 0, -80);
      }
      g.restore();
    }

    function drawCue() {
      if (!cue || !waiting) return;
      const elapsed = Date.now() - cueStart;
      const timeLeft = Math.max(0, REACTION_TIME - elapsed);
      const pct = timeLeft / REACTION_TIME;
      const pulse = 0.8 + Math.sin(bgAnimT / 60) * 0.2;

      // central cue arrow
      const cx = W / 2, cy = H * 0.3;
      const arrowSize = 50 + (1 - pct) * 20;
      const alpha = 0.7 + pulse * 0.3;

      g.save(); g.globalAlpha = alpha;
      // urgency color: green → yellow → red
      const hue = pct > 0.5 ? 120 * (pct - 0.5) * 2 : 0;
      g.fillStyle = `hsl(${hue},100%,60%)`;

      // draw arrow
      g.save(); g.translate(cx, cy);
      if (cue === 'left') g.rotate(Math.PI);
      else if (cue === 'jump') g.rotate(-Math.PI/2);
      else if (cue === 'duck') g.rotate(Math.PI/2);
      // right is default

      g.beginPath();
      g.moveTo(arrowSize, 0);
      g.lineTo(-arrowSize * 0.5, arrowSize * 0.5);
      g.lineTo(-arrowSize * 0.2, 0);
      g.lineTo(-arrowSize * 0.5, -arrowSize * 0.5);
      g.closePath(); g.fill();

      // label
      g.rotate(cue === 'left' ? 0 : cue === 'jump' ? Math.PI/2 : cue === 'duck' ? -Math.PI/2 : Math.PI);
      g.fillStyle = '#fff'; g.font = `bold ${14 + (1-pct)*4}px monospace`; g.textAlign = 'center';
      const labels = { left: 'SWIPE LEFT', right: 'SWIPE RIGHT', jump: 'SWIPE UP', duck: 'SWIPE DOWN' };
      g.fillText(labels[cue], 0, arrowSize + 24);
      g.restore();

      // timer bar
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(W*0.1, H*0.48, W*0.8, 10);
      g.fillStyle = `hsl(${hue},100%,60%)`;
      g.fillRect(W*0.1, H*0.48, W*0.8 * pct, 10);

      g.restore();

      // danger flash overlay when < 30%
      if (pct < 0.3) {
        g.fillStyle = `rgba(255,0,0,${(0.3-pct)/0.3 * 0.15})`;
        g.fillRect(0, 0, W, H);
      }
    }

    function drawHUD() {
      g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.textAlign = 'left';
      g.fillText(`SCORE: ${score}`, 10, 26);
      g.textAlign = 'right'; g.fillText(`HI: ${hs}`, W-10, 26);
      g.textAlign = 'center';
      g.fillStyle = '#ffcc44'; g.font = '13px monospace';
      g.fillText(SCENES[sceneIdx].name, W/2, 26);
      // lives
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < lives ? '#ffcc44' : '#333';
        g.beginPath(); g.arc(14 + i * 22, 42, 8, 0, Math.PI*2); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold 9px monospace'; g.textAlign = 'center';
        g.fillText('D', 14 + i * 22, 45);
      }
      // instructions at bottom when no cue
      if (!cue) {
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '10px monospace'; g.textAlign = 'center';
        g.fillText('SWIPE IN THE DIRECTION SHOWN — FAST!', W/2, H-SB-24);
      }
    }

    function drawTitle() {
      // dramatic bg
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0a0205'); grad.addColorStop(1, '#200808');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      // title text with glow
      g.shadowColor = '#ff4400'; g.shadowBlur = 20;
      g.fillStyle = '#ffcc44'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText("DRAGON'S LAIR", W/2, H*0.22);
      g.shadowBlur = 0;
      g.fillStyle = '#cc8844'; g.font = '16px monospace';
      g.fillText('Dirk the Daring', W/2, H*0.33);
      g.fillStyle = '#888'; g.font = '12px monospace';
      g.fillText('Swipe in the correct direction', W/2, H*0.43);
      g.fillText(`within ${REACTION_TIME}ms to survive!`, W/2, H*0.5);
      g.fillText(`HI-SCORE: ${hs}`, W/2, H*0.6);
      g.fillStyle = '#fff'; g.font = '15px monospace';
      const flash = Math.sin(Date.now() / 400) > 0;
      if (flash) g.fillText('TAP TO START', W/2, H*0.74);
    }

    function drawGameOver() {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0a0205'); grad.addColorStop(1, '#200808');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      g.shadowColor = '#ff2200'; g.shadowBlur = 15;
      g.fillStyle = '#ff4400'; g.font = 'bold 28px monospace'; g.textAlign = 'center';
      g.fillText('DIRK HAS FALLEN!', W/2, H*0.35);
      g.shadowBlur = 0;
      g.fillStyle = '#cc8844'; g.font = '14px monospace';
      g.fillText(`Reached: ${SCENES[Math.min(sceneIdx, SCENES.length-1)].name}`, W/2, H*0.46);
      g.fillStyle = '#fff'; g.font = '18px monospace';
      g.fillText(`SCORE: ${score}`, W/2, H*0.55);
      g.fillText(`HI: ${hs}`, W/2, H*0.63);
      g.fillStyle = '#ffcc44'; g.font = '15px monospace';
      g.fillText('TAP TO RESTART', W/2, H*0.76);
    }

    ctx.platform.ready();
  },
  pause(ctx) {},
  resume(ctx) {},
};
