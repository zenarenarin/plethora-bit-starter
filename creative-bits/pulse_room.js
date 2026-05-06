window.plethoraBit = {
  meta: {
    title: 'Pulse Room',
    author: 'plethora',
    description: 'Make noise. The room listens.',
    tags: ['creative'],
    permissions: ['microphone'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    // ── Grid layout ───────────────────────────────────────────────────────
    const COLS = 8, ROWS = 14;
    const PAD  = W * 0.04;
    const cellW = (W - PAD * 2) / COLS;
    const cellH = (H - PAD * 2) / ROWS;
    const dotR  = Math.min(cellW, cellH) * 0.28;

    // Each orb: base pulse phase + triggered energy
    const orbs = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        orbs.push({
          x: PAD + (col + 0.5) * cellW,
          y: PAD + (row + 0.5) * cellH,
          col, row,
          energy: 0,   // 0–1, decays each frame
          hue: (col / COLS) * 260 + 160,  // blue → violet
        });
      }
    }

    // ── Audio ────────────────────────────────────────────────────────────
    let audioCtx  = null;
    let mic       = null;
    let micReady  = false;
    let beatPhase = 0;          // simulated heartbeat fallback
    let lastBeat  = 0;
    const BPM     = 72;
    const BEAT_MS = 60000 / BPM;

    async function startMic() {
      try {
        mic = await ctx.microphone.start({ fftSize: 512, smoothing: 0.6 });
        micReady = true;
      } catch (_) {
        micReady = false;  // fall back to simulated heartbeat
      }
    }

    function ensureAudio() {
      if (!audioCtx) {
        audioCtx = new AudioContext();
        ctx.onDestroy(() => audioCtx.close());
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Pentatonic scale across 8 columns (A minor pentatonic, two octaves)
    const COL_NOTES = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];

    function kick() {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.25);
    }

    function sub(freq) {
      if (!audioCtx) return;
      const now  = audioCtx.currentTime;
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.4);
    }

    // Soft chime for individual orb activation
    let chimeVoices = 0;
    const MAX_VOICES = 12;
    function chime(freq, vol) {
      if (!audioCtx || chimeVoices >= MAX_VOICES) return;
      const now = audioCtx.currentTime;
      [[1, vol], [2, vol * 0.35], [3.02, vol * 0.12]].forEach(([h, v]) => {
        chimeVoices++;
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * h;
        gain.gain.setValueAtTime(v, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9 / h);
        osc.connect(gain).connect(audioCtx.destination);
        osc.onended = () => chimeVoices--;
        osc.start(now); osc.stop(now + 0.9 / h + 0.05);
      });
    }

    // ── State ─────────────────────────────────────────────────────────────
    let started   = false;
    let time      = 0;
    let lastMicWave = 0;  // throttle mic-triggered waves

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) {
        ctx.platform.start();
        started = true;
        startMic(); // non-blocking — mic is a bonus, not required
      }
      const t = e.changedTouches[0];
      triggerWave(t.clientX, t.clientY, 1.0);
      kick();          // always play a beat on tap
      sub(55);
      ctx.platform.interact({ type: 'tap' });
      ctx.platform.haptic('light');
    }, { passive: false });

    function triggerWave(cx, cy, strength) {
      let bestOrb = null, bestDist = Infinity;
      for (const o of orbs) {
        const d = Math.hypot(o.x - cx, o.y - cy);
        if (d < bestDist) { bestDist = d; bestOrb = o; }
      }
      if (!bestOrb) return;
      const { col: cc, row: rc } = bestOrb;

      orbs.forEach(o => {
        const dist = Math.hypot(o.col - cc, o.row - rc);
        const delay = dist * 0.06;
        const added = strength * Math.pow(0.75, dist);
        ctx.timeout(() => {
          const prev = o.energy;
          o.energy = Math.min(1, o.energy + added);
          // Chime when an orb lights up meaningfully and wasn't already bright
          // Row shifts pitch: bottom row = base, top row = one octave up
          if (added > 0.3 && prev < 0.3) {
            const rowT = (ROWS - 1 - o.row) / (ROWS - 1);  // 0 at bottom, 1 at top
            const freq = COL_NOTES[o.col] * Math.pow(2, rowT);
            const vol  = Math.min(0.12, added * 0.18);
            chime(freq, vol);
          }
        }, delay * 1000);
      });
    }

    // ── Render ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      time += dt;
      g.fillStyle = '#050508';
      g.fillRect(0, 0, W, H);

      // Mic amplitude drives wave from bottom
      let amp = 0;
      if (micReady && mic) {
        const td = mic.getTimeDomainData();
        let rms = 0;
        for (let i = 0; i < td.length; i++) rms += td[i] * td[i];
        amp = Math.sqrt(rms / td.length);
      }

      // Simulated heartbeat fallback (or supplement)
      const now = performance.now();
      if (!micReady && started && now - lastBeat > BEAT_MS) {
        lastBeat = now;
        triggerWave(W / 2, H, 0.85);
        kick();
        sub(55);
        ctx.platform.haptic('light');
      }

      // Mic-driven wave — propagates from bottom like sound hitting a wall
      if (micReady && amp > 0.015 && now - lastMicWave > 300) {
        const strength = Math.min(1, amp * 12);
        // Pick the loudest column from frequency data and launch wave from there
        const fd = mic.getFrequencyData();
        let loudestCol = Math.floor(COLS / 2), loudestVal = 0;
        for (let col = 0; col < COLS; col++) {
          const binIdx = Math.floor((col / COLS) * fd.length * 0.4);
          const val = fd[binIdx] / 255;
          if (val > loudestVal) { loudestVal = val; loudestCol = col; }
        }
        const launchX = PAD + (loudestCol + 0.5) * cellW;
        triggerWave(launchX, H, strength * 0.9);
        if (strength > 0.35) kick();
        lastMicWave = now;
      }

      // Update and draw orbs
      for (const o of orbs) {
        o.energy *= Math.pow(0.94, dt / 16);

        // Slow ambient breathing
        const breath = 0.05 * (0.5 + 0.5 * Math.sin(time * 0.0008 + o.col * 0.4 + o.row * 0.25));
        const total  = Math.min(1, o.energy + breath);
        const r      = dotR * (0.55 + total * 0.6);
        const bright = 40 + total * 40;
        const alpha  = 0.25 + total * 0.75;

        // Glow
        g.save();
        g.shadowColor = `hsl(${o.hue},90%,${bright}%)`;
        g.shadowBlur  = 4 + total * 18;
        g.beginPath();
        g.arc(o.x, o.y, r, 0, Math.PI * 2);
        g.fillStyle = `hsla(${o.hue},80%,${bright}%,${alpha})`;
        g.fill();
        g.restore();
      }

      if (!started) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.font = `300 ${W * 0.042}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('tap or make noise', W / 2, H / 2);
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) { ctx.microphone.stop(); },
  resume(ctx) {},
};
