window.plethoraBit = {
  meta: {
    title: 'flOw',
    author: 'plethora',
    description: 'Touch to steer. Eat smaller things. Grow.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ────────────────────────────────────────────────────────────
    let audioCtx = null, droneOsc = null, droneGain = null;

    function ensureAudio() {
      if (!audioCtx) {
        audioCtx = new AudioContext();
        ctx.onDestroy(() => audioCtx.close());

        // Ambient drone that shifts pitch as the player grows
        droneOsc  = audioCtx.createOscillator();
        droneGain = audioCtx.createGain();
        droneOsc.type = 'sine';
        droneOsc.frequency.value = 55;
        droneGain.gain.value = 0.07;
        droneOsc.connect(droneGain).connect(audioCtx.destination);
        droneOsc.start();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function setDrone(freq) {
      if (!droneOsc) return;
      droneOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.8);
    }

    function pop(freq) {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 1.5, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.2);
    }

    // ── Organism helpers ──────────────────────────────────────────────────
    function rndOrg(excludeCenter) {
      // Spawn off one of the four edges
      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = Math.random() * W; y = -40; }
      else if (side === 1) { x = W + 40; y = Math.random() * H; }
      else if (side === 2) { x = Math.random() * W; y = H + 40; }
      else { x = -40; y = Math.random() * H; }
      const r = 8 + Math.random() * 28;
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.5) * (20 / r);
      return {
        x, y, r,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        hue: Math.random() * 360,
        alpha: 0.6 + Math.random() * 0.3,
      };
    }

    // ── State ─────────────────────────────────────────────────────────────
    const SCALE = [55, 65.4, 73.4, 82.4, 98, 110, 130.8, 164.8, 196, 220, 261.6];
    let player = { x: W/2, y: H/2, vx: 0, vy: 0, r: 28, hue: 200 };
    let enemies = Array.from({ length: 16 }, rndOrg);
    let touch = null;
    let score = 0;
    let started = false;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      ctx.platform.start();
      started = true;
      const t = e.changedTouches[0];
      touch = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touch = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      touch = null;
    }, { passive: false });

    // ── Render ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      const s = Math.min(dt, 32) / 16;

      // Background gradient
      const bg = g.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
      bg.addColorStop(0, '#0a0a1a');
      bg.addColorStop(1, '#000008');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // Steer toward touch
      if (touch && started) {
        const dx = touch.x - player.x, dy = touch.y - player.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 5) {
          const force = 0.12 / Math.max(1, player.r / 20);
          player.vx += (dx / dist) * force * s * 60;
          player.vy += (dy / dist) * force * s * 60;
        }
      }

      // Drag
      player.vx *= Math.pow(0.92, s * 4);
      player.vy *= Math.pow(0.92, s * 4);
      player.x  += player.vx * s * 4;
      player.y  += player.vy * s * 4;

      // Clamp player to screen
      player.x = Math.max(player.r, Math.min(W - player.r, player.x));
      player.y = Math.max(player.r, Math.min(H - player.r, player.y));

      // Update enemies
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.x += e.vx * s * 4;
        e.y += e.vy * s * 4;

        // Slowly drift toward center
        e.vx += (W/2 - e.x) * 0.00003 * s * 60;
        e.vy += (H/2 - e.y) * 0.00003 * s * 60;
        e.vx *= Math.pow(0.98, s * 4);
        e.vy *= Math.pow(0.98, s * 4);

        // Collision with player
        const dx = player.x - e.x, dy = player.y - e.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < player.r + e.r) {
          if (player.r > e.r * 1.05) {
            // Player absorbs enemy
            const area = Math.PI * player.r * player.r + Math.PI * e.r * e.r;
            player.r = Math.sqrt(area / Math.PI);
            player.r = Math.min(player.r, W * 0.22);
            const noteIdx = Math.min(SCALE.length-1, Math.floor(player.r / 5));
            pop(SCALE[noteIdx]);
            setDrone(55 * Math.pow(2, player.r / 60));
            score++;
            ctx.platform.setScore(score);
            ctx.platform.haptic('light');
            enemies.splice(i, 1);
            enemies.push(rndOrg());
          } else if (e.r > player.r * 1.05) {
            // Enemy absorbs player — shrink and bounce
            player.r = Math.max(10, player.r * 0.8);
            player.vx = -dx / dist * 4;
            player.vy = -dy / dist * 4;
            pop(110);
            ctx.platform.haptic('medium');
          }
        }
      }

      // Draw enemies
      for (const e of enemies) {
        g.beginPath();
        g.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        g.fillStyle = `hsla(${e.hue},70%,55%,${e.alpha * 0.55})`;
        g.fill();
        // Rim
        g.beginPath();
        g.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        g.strokeStyle = `hsla(${e.hue},80%,70%,${e.alpha * 0.7})`;
        g.lineWidth = 1.5;
        g.stroke();
      }

      // Draw player
      const pg = g.createRadialGradient(player.x - player.r*0.3, player.y - player.r*0.3, 0,
                                        player.x, player.y, player.r);
      pg.addColorStop(0, `hsla(${player.hue},80%,75%,0.9)`);
      pg.addColorStop(1, `hsla(${player.hue},70%,45%,0.7)`);
      g.beginPath();
      g.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      g.fillStyle = pg;
      g.fill();
      g.beginPath();
      g.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      g.strokeStyle = `hsla(${player.hue},90%,80%,0.9)`;
      g.lineWidth = 2;
      g.stroke();

      if (!started) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.font = `300 ${W*0.042}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('touch to steer', W/2, H * 0.88);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
