window.plethoraBit = {
  meta: {
    title: 'Osmos',
    author: 'plethora',
    description: 'Tap to push yourself. Absorb smaller motes.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Audio ────────────────────────────────────────────────────────────
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) {
        audioCtx = new AudioContext();
        ctx.onDestroy(() => audioCtx.close());
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Crystalline ping on absorb
    function ping(freq) {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      [[1, 0.18], [3, 0.06], [5.04, 0.03]].forEach(([h, vol]) => {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * h;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 2.3);
      });
    }

    // Brief whoosh when ejecting mass
    function whoosh() {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.12, audioCtx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src  = audioCtx.createBufferSource();
      const filt = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();
      src.buffer = buf;
      filt.type = 'bandpass';
      filt.frequency.value = 800;
      filt.Q.value = 0.8;
      gain.gain.value = 0.25;
      src.connect(filt).connect(gain).connect(audioCtx.destination);
      src.start(now);
    }

    // ── Pentatonic scale ──────────────────────────────────────────────────
    const SCALE = [196, 220, 261.63, 329.63, 392, 440, 523.25, 659.25, 783.99];

    // ── Mote helpers ──────────────────────────────────────────────────────
    let motePad = 0;
    function makeMote(r, x, y) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 0.12 + Math.random() * 0.25;
      return {
        x: x ?? (r + Math.random() * (W - 2*r)),
        y: y ?? (r + Math.random() * (H - 2*r)),
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        r,
        hue: (motePad++ * 37) % 360,
        alive: true,
      };
    }

    // ── State ─────────────────────────────────────────────────────────────
    let player = { x: W/2, y: H/2, vx: 0, vy: 0, r: 30, hue: 210 };
    let motes  = Array.from({ length: 18 }, () => makeMote(6 + Math.random() * 26));
    let ejects = [];  // ejected mass blobs
    let score  = 0;
    let started = false;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      ctx.platform.start();
      started = true;
      eject(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    function eject(tx, ty) {
      const MIN_R = 10;
      if (player.r < MIN_R + 2) return;

      // Direction from player toward tap
      const dx = tx - player.x, dy = ty - player.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;

      const ejectR = Math.max(4, player.r * 0.14);
      // Conserve momentum: player recoils opposite to ejection direction
      const ratio  = (ejectR * ejectR) / (player.r * player.r);
      player.vx -= (dx / len) * ratio * 3.5;
      player.vy -= (dy / len) * ratio * 3.5;

      // Shrink player
      const area = Math.PI * player.r * player.r - Math.PI * ejectR * ejectR;
      player.r = Math.max(MIN_R, Math.sqrt(area / Math.PI));

      // Spawn ejected blob moving toward tap
      ejects.push({
        x: player.x + (dx / len) * (player.r + ejectR + 2),
        y: player.y + (dy / len) * (player.r + ejectR + 2),
        vx: (dx / len) * 4.5,
        vy: (dy / len) * 4.5,
        r: ejectR,
        life: 1.0,
      });

      whoosh();
      ctx.platform.haptic('light');
      ctx.platform.interact({ type: 'eject' });
    }

    // ── Render ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      const s = Math.min(dt, 32) / 16;

      // Space-like background
      g.fillStyle = '#010108';
      g.fillRect(0, 0, W, H);

      // Physics
      player.vx *= Math.pow(0.985, s * 4);
      player.vy *= Math.pow(0.985, s * 4);
      player.x  += player.vx * s * 4;
      player.y  += player.vy * s * 4;

      // Soft wall bounce
      if (player.x - player.r < 0)   { player.x = player.r;   player.vx =  Math.abs(player.vx); }
      if (player.x + player.r > W)   { player.x = W-player.r; player.vx = -Math.abs(player.vx); }
      if (player.y - player.r < 0)   { player.y = player.r;   player.vy =  Math.abs(player.vy); }
      if (player.y + player.r > H)   { player.y = H-player.r; player.vy = -Math.abs(player.vy); }

      // Update motes
      for (const m of motes) {
        if (!m.alive) continue;
        m.x += m.vx * s * 4; m.y += m.vy * s * 4;
        // Wrap around edges
        if (m.x < -m.r)   m.x += W + m.r * 2;
        if (m.x > W + m.r) m.x -= W + m.r * 2;
        if (m.y < -m.r)   m.y += H + m.r * 2;
        if (m.y > H + m.r) m.y -= H + m.r * 2;

        const dx = player.x - m.x, dy = player.y - m.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < player.r + m.r) {
          if (player.r > m.r * 1.08) {
            const area = Math.PI*player.r*player.r + Math.PI*m.r*m.r;
            player.r = Math.min(W * 0.2, Math.sqrt(area / Math.PI));
            const ni = Math.min(SCALE.length-1, Math.floor(player.r / 6));
            ping(SCALE[ni]);
            score++;
            ctx.platform.setScore(score);
            ctx.platform.haptic('light');
            m.alive = false;
            // Respawn a new mote, smaller than player
            const newR = 4 + Math.random() * Math.max(6, player.r * 0.6);
            motes.push(makeMote(newR));
          } else if (m.r > player.r * 1.08) {
            // Mote absorbs some of player's mass
            const loss = m.r * 0.04;
            player.r = Math.max(10, player.r - loss);
            player.vx -= dx/dist * 0.5;
            player.vy -= dy/dist * 0.5;
          }
        }
      }
      motes = motes.filter(m => m.alive);
      while (motes.length < 18) motes.push(makeMote(4 + Math.random() * 28));

      // Update ejected blobs
      for (let i = ejects.length - 1; i >= 0; i--) {
        const ej = ejects[i];
        ej.x += ej.vx * s * 4; ej.y += ej.vy * s * 4;
        ej.vx *= Math.pow(0.97, s * 4); ej.vy *= Math.pow(0.97, s * 4);
        ej.life -= s * 0.015;
        if (ej.life <= 0 || ej.x < -50 || ej.x > W+50 || ej.y < -50 || ej.y > H+50)
          ejects.splice(i, 1);
      }

      // Draw motes
      for (const m of motes) {
        if (!m.alive) continue;
        const bigger = m.r > player.r * 1.05;
        g.beginPath();
        g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        g.fillStyle = bigger
          ? `hsla(${m.hue},70%,40%,0.55)`
          : `hsla(${m.hue},65%,55%,0.5)`;
        g.fill();
        g.beginPath();
        g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        g.strokeStyle = bigger
          ? `hsla(${m.hue},60%,55%,0.6)`
          : `hsla(${m.hue},80%,70%,0.7)`;
        g.lineWidth = bigger ? 2.5 : 1;
        g.stroke();
      }

      // Draw ejected blobs
      for (const ej of ejects) {
        g.beginPath();
        g.arc(ej.x, ej.y, ej.r, 0, Math.PI * 2);
        g.fillStyle = `hsla(${player.hue},70%,60%,${ej.life * 0.5})`;
        g.fill();
      }

      // Draw player
      const pg = g.createRadialGradient(
        player.x - player.r*0.3, player.y - player.r*0.3, 0,
        player.x, player.y, player.r);
      pg.addColorStop(0, `hsla(${player.hue},85%,78%,0.95)`);
      pg.addColorStop(1, `hsla(${player.hue},70%,45%,0.75)`);
      g.beginPath();
      g.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      g.fillStyle = pg;
      g.fill();
      g.beginPath();
      g.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      g.strokeStyle = `hsla(${player.hue},90%,85%,0.9)`;
      g.lineWidth = 2;
      g.stroke();

      if (!started) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.font = `300 ${W*0.042}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('tap to push yourself', W/2, H * 0.88);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
