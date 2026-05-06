// TEMPEST — Vector tunnel shooter (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Tempest',
    author: 'plethora',
    description: 'Drag around the rim to aim. Tap to fire.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type = 'square', vol = 0.2) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playShoot() { playTone(1000, 0.07, 'square', 0.18); }
    function playExplode() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.18, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
      src.start();
    }
    function playScore() { playTone(660, 0.1, 'sine', 0.2); }
    function playGameOver() { [350, 280, 220, 160].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.3), i * 120)); }

    const LANES = 16;
    let cx, cy, R, rInner;
    cx = W / 2; cy = H / 2; R = Math.min(W, H) * 0.42; rInner = R * 0.15;

    let playerLane, enemies, bullets, particles, score, lives, running, tick, spawnT, started;
    let autoFireT = 0;

    function reset() {
      playerLane = 0; enemies = []; bullets = []; particles = [];
      score = 0; lives = 3; running = true; tick = 0; spawnT = 0; autoFireT = 0;
    }

    function laneAngle(i) { return (i / LANES) * Math.PI * 2 - Math.PI / 2; }
    function posOnRim(lane, t) {
      const a = laneAngle(lane);
      const r = rInner + (R - rInner) * t;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }

    function fire() {
      if (!running) return;
      bullets.push({ lane: playerLane, t: 1 });
      playShoot();
    }

    function boom(x, y, c) {
      for (let i = 0; i < 16; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, c, life: 0.5 });
    }

    function setLaneFromPoint(px, py) {
      const dx = px - cx, dy = py - cy;
      const a = Math.atan2(dy, dx) + Math.PI / 2;
      playerLane = Math.floor(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * LANES);
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); reset(); return; }
      if (!running) { reset(); started = true; return; }
      const t = e.changedTouches[0];
      setLaneFromPoint(t.clientX, t.clientY);
      fire();
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      setLaneFromPoint(t.clientX, t.clientY);
    }, { passive: false });

    reset();

    ctx.raf((dt) => {
      const sec = dt / 1000;
      tick++;

      if (running && started) {
        // Spawn enemies
        spawnT += dt;
        if (spawnT > Math.max(600, 2000 - score * 0.5)) {
          spawnT = 0;
          enemies.push({ lane: (Math.random() * LANES) | 0, t: 0.05, type: Math.random() < 0.7 ? 'flipper' : 'spiker', cool: 80 });
        }

        enemies.forEach(e => {
          e.t += 0.004 * (60 * sec);
          if (e.type === 'flipper' && Math.random() < 0.008) {
            e.lane = (e.lane + (Math.random() < 0.5 ? 1 : -1) + LANES) % LANES;
          }
          e.cool -= dt;
          if (e.cool <= 0 && e.t > 0.3) {
            // enemy fire is just visual — spikes
            e.cool = 2000 + Math.random() * 2000;
          }
        });

        // Bullets move inward (t decreasing)
        bullets.forEach(b => b.t -= 0.07 * (60 * sec));
        bullets = bullets.filter(b => b.t > 0);

        // Collisions: bullet vs enemy
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (b.lane === e.lane && Math.abs(b.t - e.t) < 0.08) {
              bullets.splice(j, 1); enemies.splice(i, 1);
              const [px, py] = posOnRim(e.lane, e.t);
              boom(px, py, e.type === 'flipper' ? '#FF2222' : '#00FF66');
              score += e.type === 'flipper' ? 50 : 100;
              ctx.platform.setScore(score);
              playExplode(); playScore();
              break;
            }
          }
        }

        // Enemy reaches rim
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (e.t >= 1) {
            if (e.lane === playerLane || e.lane === (playerLane + 1) % LANES) {
              const [px, py] = posOnRim(e.lane, 1);
              boom(px, py, '#FFFF00');
              lives--; ctx.platform.haptic('heavy');
              playGameOver();
              enemies.splice(i, 1);
              if (lives <= 0) { running = false; ctx.platform.fail({ reason: 'enemy reached rim' }); }
            } else {
              enemies.splice(i, 1);
            }
          }
        }

        // Auto-fire while touching
        autoFireT -= dt;
        if (autoFireT <= 0 && running) { fire(); autoFireT = 250; }

        particles = particles.filter(p => {
          p.x += p.vx * sec; p.y += p.vy * sec; p.life -= sec;
          return p.life > 0;
        });
      }

      // Draw
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

      // Glow center
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2);
      grad.addColorStop(0, 'rgba(255,0,255,0.2)');
      grad.addColorStop(0.3, 'rgba(60,0,90,0.12)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // Tunnel rings
      g.strokeStyle = '#8800FF'; g.lineWidth = 1;
      for (let t = 0.15; t <= 1; t += 0.14) {
        g.beginPath();
        for (let i = 0; i <= LANES; i++) {
          const [px, py] = posOnRim(i % LANES, t);
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath(); g.stroke();
      }

      // Spokes
      for (let i = 0; i < LANES; i++) {
        const a = laneAngle(i);
        g.strokeStyle = i === playerLane ? '#FFFF00' : '#6600AA';
        g.lineWidth = i === playerLane ? 2 : 1;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner);
        g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        g.stroke();
      }

      // Outer rim
      g.strokeStyle = '#FF00FF'; g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= LANES; i++) {
        const [px, py] = posOnRim(i % LANES, 1);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.stroke();

      // Enemies
      enemies.forEach(e => {
        const [px, py] = posOnRim(e.lane, e.t);
        const sz = 5 + e.t * 9;
        g.fillStyle = e.type === 'flipper' ? '#FF2222' : '#00FF66';
        g.beginPath();
        g.moveTo(px, py - sz); g.lineTo(px + sz, py); g.lineTo(px, py + sz); g.lineTo(px - sz, py);
        g.closePath(); g.fill();
        g.strokeStyle = '#FFF'; g.lineWidth = 1; g.stroke();
      });

      // Bullets
      bullets.forEach(b => {
        const [px, py] = posOnRim(b.lane, b.t);
        g.fillStyle = '#FFFF00';
        g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,0,0.25)';
        g.beginPath(); g.arc(px, py, 10, 0, Math.PI * 2); g.fill();
      });

      // Player claw
      {
        const a1 = laneAngle(playerLane);
        const a2 = laneAngle((playerLane + 1) % LANES);
        const mid = (a1 + a2) / 2;
        const p1 = [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R];
        const p2 = [cx + Math.cos(a2) * R, cy + Math.sin(a2) * R];
        const pmid = [cx + Math.cos(mid) * (R + 8), cy + Math.sin(mid) * (R + 8)];
        g.strokeStyle = '#FFFF00'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(pmid[0], pmid[1]); g.lineTo(p2[0], p2[1]); g.stroke();
        g.fillStyle = '#FFF'; g.beginPath(); g.arc(pmid[0], pmid[1], 4, 0, Math.PI * 2); g.fill();
      }

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 3, 3);
      });
      g.globalAlpha = 1;

      // HUD
      g.fillStyle = '#FF00FF'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 28);
      g.textAlign = 'right'; g.fillText('LIVES ' + '▲'.repeat(Math.max(0, lives)), W - 12, 28);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF00FF'; g.font = 'bold 28px "Courier New"'; g.textAlign = 'center';
        g.fillText('TEMPEST', W / 2, H / 2 - 30);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('DRAG around rim to aim', W / 2, H / 2 + 10);
        g.fillText('TAP to fire', W / 2, H / 2 + 40);
        g.textAlign = 'left';
      }

      if (!running) {
        g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF2244'; g.font = 'bold 32px "Courier New"'; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
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
