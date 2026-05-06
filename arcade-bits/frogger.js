// FROGGER — Hop across traffic and water (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Frogger',
    author: 'plethora',
    description: 'Swipe to hop. Cross the road and the river!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SAFE = ctx.safeArea.bottom;

    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type = 'square', vol = 0.25) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playHop() { playTone(600, 0.06, 'square', 0.2); }
    function playDie() { [400, 300, 200].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sawtooth', 0.3), i * 100)); }
    function playHome() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.35), i * 100)); }
    function playWin() { playTone(1000, 0.5, 'sine', 0.4); }

    const COLS = 13, ROWS = 13;

    let frog, lanes, homes, score, lives, running, tick, started;

    function reset() {
      frog = { col: 6, row: 12, px: 6, py: 12, hopT: 0 };
      lanes = [
        { row: 1, type: 'log', spd: 0.025, items: [{ x: 0, len: 3 }, { x: 6, len: 2 }, { x: 10, len: 2 }] },
        { row: 2, type: 'turtle', spd: -0.035, items: [{ x: 1, len: 2 }, { x: 5, len: 3 }, { x: 10, len: 2 }] },
        { row: 3, type: 'log', spd: 0.02, items: [{ x: 0, len: 4 }, { x: 7, len: 3 }] },
        { row: 4, type: 'turtle', spd: -0.04, items: [{ x: 2, len: 2 }, { x: 6, len: 2 }, { x: 10, len: 2 }] },
        { row: 6, type: 'truck', spd: 0.035, items: [{ x: 0, len: 2, c: '#FF4444' }, { x: 7, len: 2, c: '#FF4444' }] },
        { row: 7, type: 'car', spd: -0.05, items: [{ x: 2, len: 1, c: '#FFFF00' }, { x: 6, len: 1, c: '#FFFF00' }, { x: 10, len: 1, c: '#FFFF00' }] },
        { row: 8, type: 'car', spd: 0.045, items: [{ x: 0, len: 1, c: '#00FFFF' }, { x: 4, len: 1, c: '#00FFFF' }, { x: 9, len: 1, c: '#00FFFF' }] },
        { row: 9, type: 'truck', spd: -0.03, items: [{ x: 1, len: 2, c: '#FF00FF' }, { x: 8, len: 2, c: '#FF00FF' }] },
        { row: 10, type: 'car', spd: 0.06, items: [{ x: 0, len: 1, c: '#FF8800' }, { x: 3, len: 1, c: '#FF8800' }, { x: 7, len: 1, c: '#FF8800' }, { x: 11, len: 1, c: '#FF8800' }] },
      ];
      homes = [false, false, false, false, false];
      score = 0; lives = 3; running = true; tick = 0;
    }

    function hop(dc, dr) {
      if (!running || frog.hopT > 0) return;
      frog.col = Math.max(0, Math.min(COLS - 1, frog.col + dc));
      frog.row = Math.max(0, Math.min(ROWS - 1, frog.row + dr));
      frog.hopT = 1;
      score += 10;
      playHop();
      ctx.platform.haptic('light');
    }

    function die() {
      lives--;
      frog.col = 6; frog.row = 12; frog.px = 6; frog.py = 12;
      playDie(); ctx.platform.haptic('heavy');
      if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'game over' }); }
    }

    let swipeStart = null;
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
      const t = e.changedTouches[0];
      swipeStart = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!swipeStart || !running) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStart.x, dy = t.clientY - swipeStart.y;
      if (Math.hypot(dx, dy) < 16) { hop(0, -1); }
      else if (Math.abs(dx) > Math.abs(dy)) hop(dx > 0 ? 1 : -1, 0);
      else hop(0, dy > 0 ? 1 : -1);
      swipeStart = null;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    reset();

    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      if (running && started) {
        // Frog animation
        if (frog.hopT > 0) {
          frog.hopT = Math.max(0, frog.hopT - 0.15);
          frog.px += (frog.col - frog.px) * 0.35;
          frog.py += (frog.row - frog.py) * 0.35;
        } else {
          frog.px = frog.col; frog.py = frog.row;
        }

        // Water: ride logs/turtles
        if (frog.row >= 1 && frog.row <= 4) {
          const lane = lanes.find(l => l.row === frog.row);
          if (lane) {
            let onItem = false;
            lane.items.forEach(it => {
              const x = ((it.x + lane.spd * tick) % COLS + COLS) % COLS;
              for (let p = 0; p < it.len; p++) {
                if (Math.abs((x + p) % COLS - frog.col) < 0.55) onItem = true;
              }
            });
            if (onItem) {
              frog.col += lane.spd * 60 * sec;
              if (frog.col < 0 || frog.col > COLS - 1) die();
            } else { die(); }
          }
        }

        // Road: hit by vehicles
        if (frog.row >= 6 && frog.row <= 10) {
          const lane = lanes.find(l => l.row === frog.row);
          if (lane) {
            lane.items.forEach(it => {
              const x = ((it.x + lane.spd * tick) % COLS + COLS) % COLS;
              for (let p = 0; p < it.len; p++) {
                if (Math.abs((x + p) % COLS - frog.col) < 0.75) die();
              }
            });
          }
        }

        // Home row
        if (frog.row === 0) {
          const slotW = COLS / 5;
          const idx = Math.floor(frog.col / slotW);
          if (idx >= 0 && idx < 5 && !homes[idx]) {
            homes[idx] = true; score += 200; ctx.platform.setScore(score);
            playHome();
            if (homes.every(Boolean)) { running = false; ctx.platform.complete({ score }); playWin(); }
            else { frog.col = 6; frog.row = 12; frog.px = 6; frog.py = 12; }
          } else die();
        }
      }

      // Layout
      const cw = W / COLS;
      const ch = (H - SAFE - 60) / ROWS;
      const oy = 40;

      // Draw BG
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

      for (let r = 0; r < ROWS; r++) {
        const y = oy + r * ch;
        if (r === 0) {
          g.fillStyle = '#002060'; g.fillRect(0, y, W, ch);
        } else if (r >= 1 && r <= 4) {
          g.fillStyle = '#001F5C'; g.fillRect(0, y, W, ch);
          g.strokeStyle = 'rgba(0,180,255,0.3)';
          g.beginPath();
          for (let x = 0; x < W; x += 8) { g.moveTo(x, y + ch / 2 + Math.sin((x + tick * 3) * 0.12) * 2); g.lineTo(x + 4, y + ch / 2 + Math.sin((x + 4 + tick * 3) * 0.12) * 2); }
          g.stroke();
        } else if (r === 5 || r === 11) {
          g.fillStyle = '#330044'; g.fillRect(0, y, W, ch);
        } else if (r === 12) {
          g.fillStyle = '#004400'; g.fillRect(0, y, W, ch);
        } else {
          g.fillStyle = '#1a1a1a'; g.fillRect(0, y, W, ch);
          g.fillStyle = '#FFFF00';
          for (let x = 0; x < W; x += 22) g.fillRect(x, y + ch / 2 - 1, 11, 2);
        }
      }

      // Home slots
      for (let i = 0; i < 5; i++) {
        const hx = i * (W / 5) + W / 10;
        g.fillStyle = homes[i] ? '#00FF88' : '#111';
        g.fillRect(hx - cw * 0.4, oy + 4, cw * 0.8, ch - 8);
        if (homes[i]) {
          g.fillStyle = '#00FF88';
          g.fillRect(hx - 4, oy + 2, 8, 6);
        }
      }

      // Lane items
      lanes.forEach(l => {
        const ly = oy + l.row * ch;
        l.items.forEach(it => {
          const x = ((it.x + l.spd * tick) % COLS + COLS) % COLS;
          for (let part = 0; part < it.len; part++) {
            const cx = ((x + part) % COLS) * cw;
            if (l.type === 'log') {
              g.fillStyle = '#8B4513'; g.fillRect(cx + 1, ly + 3, cw - 2, ch - 6);
              g.fillStyle = '#A0522D'; g.fillRect(cx + 1, ly + 3, cw - 2, 2);
            } else if (l.type === 'turtle') {
              g.fillStyle = '#228822'; g.fillRect(cx + 2, ly + 4, cw - 4, ch - 8);
              g.fillStyle = '#44CC44'; g.fillRect(cx + cw / 2 - 3, ly + ch / 2 - 3, 6, 6);
            } else if (l.type === 'car') {
              g.fillStyle = it.c; g.fillRect(cx + 2, ly + 3, cw - 4, ch - 6);
              g.fillStyle = '#FFF'; g.fillRect(cx + cw - 5, ly + ch / 2 - 2, 2, 4);
            } else if (l.type === 'truck') {
              g.fillStyle = it.c; g.fillRect(cx + 1, ly + 3, cw - 2, ch - 6);
              if (part === 0) { g.fillStyle = '#000'; g.fillRect(cx + 2, ly + 5, 4, ch - 10); }
            }
          }
        });
      });

      // Frog
      {
        const fx = frog.px * cw + cw / 2;
        const fy = oy + frog.py * ch + ch / 2;
        const hopScale = 1 + (frog.hopT > 0 ? 0.3 * Math.sin((1 - frog.hopT) * Math.PI) : 0);
        const fr = Math.min(cw, ch) * 0.38;
        g.save(); g.translate(fx, fy); g.scale(hopScale, hopScale);
        g.fillStyle = '#00FF00'; g.fillRect(-fr, -fr, fr * 2, fr * 2);
        g.fillStyle = '#009900'; g.fillRect(-fr - 2, -fr * 0.3, 3, fr * 0.6); g.fillRect(fr - 1, -fr * 0.3, 3, fr * 0.6);
        g.fillStyle = '#FFFF00'; g.fillRect(-fr * 0.7, -fr * 0.8, fr * 0.5, fr * 0.4); g.fillRect(fr * 0.2, -fr * 0.8, fr * 0.5, fr * 0.4);
        g.fillStyle = '#000'; g.fillRect(-fr * 0.6, -fr * 0.7, fr * 0.3, fr * 0.3); g.fillRect(fr * 0.3, -fr * 0.7, fr * 0.3, fr * 0.3);
        g.restore();
      }

      // Scanlines
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // HUD
      g.fillStyle = '#00FF88'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'center'; g.fillText('HOMES ' + homes.filter(Boolean).length + '/5', W / 2, 28);
      g.textAlign = 'right'; g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FF88'; g.font = 'bold 28px "Courier New"'; g.textAlign = 'center';
        g.fillText('FROGGER', W / 2, H / 2 - 30);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('SWIPE to hop', W / 2, H / 2 + 10);
        g.fillText('TAP = hop forward', W / 2, H / 2 + 40);
        g.textAlign = 'left';
      }

      if (!running && lives <= 0) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF2244'; g.font = 'bold 32px "Courier New"'; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"'; g.fillText('SCORE ' + score, W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"'; g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }

      if (!running && lives > 0) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#00FF00'; g.font = 'bold 32px "Courier New"'; g.textAlign = 'center';
        g.fillText('YOU WIN!', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"'; g.fillText('SCORE ' + score, W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"'; g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
