window.plethoraBit = {
  meta: {
    title: 'Track & Field',
    author: 'plethora',
    description: '3 mini-events. Tap fast. Win gold.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null;
    function initAudio() { if (!audioCtx) audioCtx = new AudioContext(); }
    function beep(freq, dur, type='sine', vol=0.12) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function tapSound() { beep(400 + Math.random()*200, 0.04, 'square', 0.1); }
    function startGun() { beep(1000, 0.08, 'square', 0.25); }
    function medalSound(medal) {
      if (medal === 'GOLD') { [523,659,784,1047,1568].forEach((f,i)=>setTimeout(()=>beep(f,0.12,'sine'),i*80)); }
      else if (medal === 'SILVER') { [440,523,659,784].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'sine'),i*80)); }
      else { [330,392].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'sine'),i*100)); }
    }

    const EVENTS = ['100m Dash', 'Long Jump', 'Hammer Throw'];
    let event, phase, score, totalScore, gameOver, started, hs;
    let runSpeed, runPos, jumpPhase, jumpAngle, jumpPower, jumpVX, jumpVY, jumpX, jumpY, jumpDist;
    let hammerAngle, hammerPower, hammerSpin, hammerReleased, hammerX, hammerY, hammerVX, hammerVY;
    let tapCount, tapTimer, countdown, phaseTimer, resultText, medal;
    let lastTapTime, tapFreq;

    function startEvent() {
      phase = 'intro'; phaseTimer = 1500; resultText = ''; medal = '';
      tapCount = 0; lastTapTime = 0; tapFreq = 0;
      runSpeed = 0; runPos = 0;
      jumpPhase = 'run'; jumpAngle = 0; jumpPower = 0; jumpVX = 0; jumpVY = 0; jumpX = W*0.15; jumpY = H*0.72; jumpDist = 0;
      hammerAngle = 0; hammerPower = 0; hammerSpin = 0; hammerReleased = false; hammerX = W/2; hammerY = H*0.5; hammerVX = 0; hammerVY = 0;
    }

    function reset() {
      event = 0; score = 0; totalScore = 0; gameOver = false; started = false;
      countdown = 3;
      startEvent();
    }

    hs = ctx.storage.get('hs_trackfield') || 0;
    reset();

    let lastTouchX = W/2, lastTouchY = H/2;

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      lastTouchX = t.clientX; lastTouchY = t.clientY;
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }

      if (phase === 'result') return;
      if (phase === 'intro') return;

      const now = Date.now();
      tapFreq = Math.min(30, 1000 / Math.max(50, now - lastTapTime));
      lastTapTime = now;
      tapCount++;
      tapSound();
      ctx.platform.interact({ type: 'tap' });
      ctx.platform.haptic('light');

      const ev = EVENTS[event % 3];
      if (ev === '100m Dash') {
        if (phase === 'run') {
          runSpeed = Math.min(12, runSpeed + tapFreq * 0.3 + 0.5);
        }
      } else if (ev === 'Long Jump') {
        if (jumpPhase === 'run') {
          jumpVX = Math.min(10, (jumpVX || 0) + 0.6);
        } else if (jumpPhase === 'launch') {
          // tap sets angle
          jumpAngle = Math.min(Math.PI*0.4, jumpAngle + 0.12);
        }
      } else if (ev === 'Hammer Throw') {
        if (!hammerReleased) {
          hammerSpin = Math.min(15, hammerSpin + 0.8);
        }
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault();
      if (!started || gameOver || phase !== 'active') return;
      const ev = EVENTS[event % 3];
      if (ev === 'Hammer Throw' && !hammerReleased && hammerSpin > 2) {
        hammerReleased = true;
        const throwAngle = hammerAngle;
        hammerVX = Math.cos(throwAngle) * hammerSpin * 2;
        hammerVY = Math.sin(throwAngle) * hammerSpin * 2 - 8;
        hammerX = W/2 + Math.cos(hammerAngle)*H*0.13;
        hammerY = H*0.55 + Math.sin(hammerAngle)*H*0.13;
        beep(300, 0.1, 'sawtooth', 0.15);
      }
    }, { passive: false });

    function getMedal(val, thresholds) {
      if (val >= thresholds[0]) return 'GOLD';
      if (val >= thresholds[1]) return 'SILVER';
      if (val >= thresholds[2]) return 'BRONZE';
      return 'NONE';
    }

    function medalScore(m) { return { GOLD: 1000, SILVER: 600, BRONZE: 300, NONE: 50 }[m]; }
    const MEDAL_COLORS = { GOLD:'#ffd700', SILVER:'#c0c0c0', BRONZE:'#cd7f32', NONE:'#888' };

    ctx.raf(dt => {
      const spd = dt / 16;
      g.fillStyle = '#1a3a1a';
      g.fillRect(0, 0, W, H);

      if (!started) {
        g.fillStyle = '#4af';
        g.font = `bold ${Math.floor(H*0.065)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('TRACK & FIELD', W/2, H*0.34);
        g.fillStyle = '#ccc';
        g.font = `${Math.floor(H*0.03)}px sans-serif`;
        g.fillText('100m DASH • LONG JUMP', W/2, H*0.44);
        g.fillText('HAMMER THROW', W/2, H*0.5);
        g.fillText('TAP TO START', W/2, H*0.6);
        g.fillText(`BEST: ${hs}`, W/2, H*0.67);
        return;
      }

      const ev = EVENTS[event % 3];

      if (phase === 'intro') {
        phaseTimer -= dt;
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.07)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText(ev.toUpperCase(), W/2, H*0.4);
        g.fillStyle = '#ff0';
        g.font = `bold ${Math.floor(H*0.12)}px monospace`;
        const cnt = Math.ceil(phaseTimer / 500);
        g.fillText(cnt > 0 ? String(cnt) : 'GO!', W/2, H*0.62);
        if (phaseTimer <= 0) {
          phase = 'active';
          startGun();
          if (ev === 'Long Jump') jumpPhase = 'run';
        }
        drawHUD();
        return;
      }

      if (phase === 'active') {
        // auto-decelerate tap speed
        tapFreq *= Math.pow(0.98, spd);

        if (ev === '100m Dash') {
          runSpeed = Math.max(0, runSpeed - 0.04 * spd);
          runPos += runSpeed * spd;

          // draw track
          drawTrack();
          // athlete
          const ax = Math.min(W*0.85, W*0.15 + (runPos/800)*W*0.7);
          drawRunner(ax, H*0.67, runSpeed/12);

          // tap prompt
          drawTapMeter(runSpeed / 12);

          if (runPos >= 800) {
            const time = ((event * 40 + 40) - runSpeed * 2).toFixed(2);
            score = Math.round(runSpeed * 80);
            medal = getMedal(score, [900, 650, 400]);
            resultText = `${time}s  ${score} pts`;
            totalScore += medalScore(medal);
            ctx.platform.setScore(totalScore);
            medalSound(medal);
            phase = 'result'; phaseTimer = 2500;
          }

        } else if (ev === 'Long Jump') {
          if (jumpPhase === 'run') {
            if (jumpVX > 0) { jumpVX *= Math.pow(0.97, spd); } else { jumpVX = 0; }
            jumpX += jumpVX * spd * 0.5;

            drawTrack();
            drawRunner(Math.min(W*0.55, jumpX), H*0.72, jumpVX/10);

            // draw runway
            g.fillStyle = '#c8a060';
            g.fillRect(W*0.55, H*0.69, 8, H*0.06);
            g.fillStyle = '#f00';
            g.fillText('▼', W*0.55, H*0.68);

            if (jumpX >= W*0.55) {
              jumpPhase = 'launch';
              jumpVX = 8;
              beep(600, 0.05, 'square');
            }
          } else if (jumpPhase === 'launch') {
            jumpAngle = Math.min(Math.PI*0.42, jumpAngle + 0.015 * spd);
          } else if (jumpPhase === 'fly') {
            jumpX += jumpVX * spd;
            jumpY += jumpVY * spd;
            jumpVY += 0.25 * spd;

            g.fillStyle = '#c8a060';
            g.fillRect(W*0.55, H*0.69, W*0.4, H*0.04);
            drawTrack();

            // jumper
            g.fillStyle = '#ff4';
            g.beginPath(); g.arc(jumpX, jumpY, H*0.025, 0, Math.PI*2); g.fill();
            // arc trace
            g.strokeStyle = 'rgba(255,255,0,0.3)'; g.lineWidth = 1;
            g.setLineDash([4,4]); g.beginPath(); g.moveTo(W*0.55, H*0.72);
            g.quadraticCurveTo(jumpX, jumpY - 40, jumpX, jumpY); g.stroke();
            g.setLineDash([]);

            if (jumpY >= H*0.73) {
              jumpDist = (jumpX - W*0.55) * 0.25;
              score = Math.round(jumpDist * 10);
              medal = getMedal(score, [700, 500, 300]);
              resultText = `${jumpDist.toFixed(2)}m  ${score} pts`;
              totalScore += medalScore(medal);
              ctx.platform.setScore(totalScore);
              medalSound(medal);
              phase = 'result'; phaseTimer = 2500;
            }
          }

          if (jumpPhase === 'launch') {
            drawTrack();
            drawRunner(W*0.55, H*0.72, 1);
            // angle indicator
            g.strokeStyle = '#0f0'; g.lineWidth = 3;
            g.beginPath();
            g.moveTo(W*0.55, H*0.72);
            g.lineTo(W*0.55 + Math.cos(-jumpAngle)*80, H*0.72 - Math.sin(jumpAngle)*80);
            g.stroke();
            g.fillStyle = '#0f0';
            g.font = `${Math.floor(H*0.03)}px monospace`;
            g.textAlign = 'center';
            g.fillText(`TAP TO SET ANGLE: ${Math.round(jumpAngle*180/Math.PI)}°`, W/2, H*0.55);
            g.fillText('RELEASE TO JUMP!', W/2, H*0.61);

            // auto-launch after delay
            phaseTimer = (phaseTimer || 3000) - dt;
            if ((phaseTimer || 3000) <= 0 || jumpAngle >= Math.PI*0.42) {
              jumpPhase = 'fly';
              jumpVX = 8 + jumpAngle * 5;
              jumpVY = -Math.sin(jumpAngle) * 12;
              jumpX = W * 0.55; jumpY = H * 0.72;
            }
          }

        } else if (ev === 'Hammer Throw') {
          if (!hammerReleased) {
            hammerAngle += hammerSpin * 0.03 * spd;
            hammerSpin *= Math.pow(0.985, spd);
            const hr = H * 0.13;
            const hx = W/2 + Math.cos(hammerAngle) * hr;
            const hy = H*0.55 + Math.sin(hammerAngle) * hr;

            drawArena();
            // wire
            g.strokeStyle = '#888'; g.lineWidth = 2;
            g.beginPath(); g.moveTo(W/2, H*0.55); g.lineTo(hx, hy); g.stroke();
            // hammer
            g.fillStyle = '#aaa';
            g.beginPath(); g.arc(hx, hy, H*0.03, 0, Math.PI*2); g.fill();
            // athlete
            drawThrower(W/2, H*0.55);
            // spin indicator
            drawTapMeter(hammerSpin/15);
            g.fillStyle = '#ff0';
            g.font = `${Math.floor(H*0.032)}px monospace`;
            g.textAlign = 'center';
            g.fillText('TAP FAST then RELEASE!', W/2, H*0.3);
          } else {
            hammerX += hammerVX * spd;
            hammerY += hammerVY * spd;
            hammerVY += 0.12 * spd;

            drawArena();
            g.fillStyle = '#aaa';
            g.beginPath(); g.arc(hammerX, hammerY, H*0.03, 0, Math.PI*2); g.fill();

            if (hammerY > H*0.75) {
              const dist = Math.abs(hammerX - W/2);
              score = Math.round(dist * 0.8);
              medal = getMedal(score, [600, 400, 200]);
              resultText = `${(dist*0.05).toFixed(2)}m  ${score} pts`;
              totalScore += medalScore(medal);
              ctx.platform.setScore(totalScore);
              medalSound(medal);
              phase = 'result'; phaseTimer = 2500;
            }
          }
        }
      }

      if (phase === 'result') {
        phaseTimer -= dt;
        drawResultScreen();
        if (phaseTimer <= 0) {
          event++;
          if (event % 3 === 0) {
            // after 3 events, show final score
            if (totalScore > hs) { hs = totalScore; ctx.storage.set('hs_trackfield', hs); }
            gameOver = true;
            ctx.platform.complete({ score: totalScore });
          } else {
            startEvent();
            phaseTimer = 1500;
          }
        }
      }

      drawHUD();

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#ffd700';
        g.font = `bold ${Math.floor(H*0.065)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('EVENTS COMPLETE', W/2, H*0.36);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`SCORE: ${totalScore}`, W/2, H*0.46);
        g.fillText(`BEST: ${hs}`, W/2, H*0.53);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.033)}px monospace`;
        g.fillText('TAP TO PLAY AGAIN', W/2, H*0.63);
      }

      function drawTrack() {
        g.fillStyle = '#c8a060';
        g.fillRect(0, H*0.68, W, H*0.12);
        g.strokeStyle = '#fff'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, H*0.68); g.lineTo(W, H*0.68); g.stroke();
        g.beginPath(); g.moveTo(0, H*0.8); g.lineTo(W, H*0.8); g.stroke();
        // lane lines
        g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1; g.setLineDash([10,10]);
        g.beginPath(); g.moveTo(0, H*0.74); g.lineTo(W, H*0.74); g.stroke();
        g.setLineDash([]);
        // finish line
        g.fillStyle = '#fff';
        for (let fy = H*0.68; fy < H*0.8; fy += 8) {
          if (Math.floor((fy - H*0.68)/8) % 2 === 0) g.fillRect(W*0.87, fy, 8, 8);
          else g.fillRect(W*0.87 + 8, fy, 8, 8);
        }
      }

      function drawRunner(x, y, spd2) {
        const legPhase = (Date.now() * 0.01 * (spd2 || 0.5)) % (Math.PI*2);
        g.fillStyle = '#ff6644';
        g.beginPath(); g.arc(x, y - H*0.06, H*0.03, 0, Math.PI*2); g.fill(); // head
        g.fillStyle = '#2244aa';
        g.fillRect(x - H*0.015, y - H*0.05, H*0.03, H*0.05); // body
        // legs
        g.strokeStyle = '#2244aa'; g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(legPhase)*H*0.04, y + H*0.04);
        g.stroke();
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - Math.cos(legPhase)*H*0.04, y + H*0.04);
        g.stroke();
      }

      function drawThrower(x, y) {
        g.fillStyle = '#ff6644';
        g.beginPath(); g.arc(x, y - H*0.07, H*0.03, 0, Math.PI*2); g.fill();
        g.fillStyle = '#2244aa';
        g.fillRect(x - H*0.015, y - H*0.06, H*0.03, H*0.06);
      }

      function drawArena() {
        g.fillStyle = '#4a8a4a';
        g.fillRect(0, H*0.65, W, H*0.3);
        // concentric circles
        for (let r = H*0.08; r < H*0.45; r += H*0.07) {
          g.strokeStyle = `rgba(255,255,255,${0.3 - r/H*0.4})`;
          g.lineWidth = 1;
          g.beginPath(); g.arc(W/2, H*0.85, r, 0, Math.PI*2); g.stroke();
        }
      }

      function drawTapMeter(pct) {
        g.fillStyle = '#333';
        g.fillRect(W*0.1, H*0.85, W*0.8, H*0.025);
        g.fillStyle = `hsl(${pct*120},100%,50%)`;
        g.fillRect(W*0.1, H*0.85, W*0.8*pct, H*0.025);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.025)}px monospace`;
        g.textAlign = 'center';
        g.fillText('TAP TAP TAP!', W/2, H*0.92);
      }

      function drawResultScreen() {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = MEDAL_COLORS[medal] || '#fff';
        g.font = `bold ${Math.floor(H*0.09)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText(medal || 'NO MEDAL', W/2, H*0.42);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(resultText, W/2, H*0.54);
      }

      function drawHUD() {
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.032)}px monospace`;
        g.textAlign = 'left';
        g.fillText(`${totalScore}`, 10, Math.floor(H*0.055));
        g.textAlign = 'right';
        g.fillText(`BEST:${hs}`, W-10, Math.floor(H*0.055));
        g.textAlign = 'center';
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.025)}px monospace`;
        g.fillText(`EVENT ${(event%3)+1}/3: ${EVENTS[event%3]}`, W/2, Math.floor(H*0.055));
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
