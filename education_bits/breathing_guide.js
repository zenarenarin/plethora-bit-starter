window.scrollerApp = {
  meta: {
    title: '4-7-8 Breathing',
    author: 'plethora',
    description: 'Choose a breathing mode. Inhale, hold, exhale. Feel it in 60 seconds.',
    tags: ['education'],
  },

  init(container) {
    const W = container.clientWidth, H = container.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // ── Breathing modes ───────────────────────────────────────────────────
    const MODES = [
      {
        id: '4-7-8',
        label: '4-7-8',
        tagline: 'Sleep / Calm',
        science: 'activates parasympathetic nervous system',
        phases: [
          { name: 'Inhale',  dur: 4,  rgb: [70,  130, 255], grow: true  },
          { name: 'Hold',    dur: 7,  rgb: [140,  70, 220], grow: null  },
          { name: 'Exhale',  dur: 8,  rgb: [40,  190, 140], grow: false },
        ],
      },
      {
        id: 'box',
        label: 'Box',
        tagline: 'Focus / Stress',
        science: 'used by Navy SEALs to stay calm under pressure',
        phases: [
          { name: 'Inhale',  dur: 4,  rgb: [70,  130, 255], grow: true  },
          { name: 'Hold',    dur: 4,  rgb: [140,  70, 220], grow: null  },
          { name: 'Exhale',  dur: 4,  rgb: [40,  190, 140], grow: false },
          { name: 'Hold',    dur: 4,  rgb: [90,   50, 180], grow: null  },
        ],
      },
      {
        id: 'coherent',
        label: '5.5',
        tagline: 'Coherent',
        science: 'maximises heart rate variability',
        phases: [
          { name: 'Inhale',  dur: 5.5, rgb: [70,  160, 255], grow: true  },
          { name: 'Exhale',  dur: 5.5, rgb: [40,  200, 150], grow: false },
        ],
      },
      {
        id: 'energize',
        label: '4-2',
        tagline: 'Energize',
        science: 'stimulates sympathetic system — use in morning',
        phases: [
          { name: 'Inhale',  dur: 4,  rgb: [255, 130,  50], grow: true  },
          { name: 'Exhale',  dur: 2,  rgb: [255,  70,  70], grow: false },
        ],
      },
      {
        id: 'physiological',
        label: 'Sigh',
        tagline: 'Phys. Sigh',
        science: 'fastest known way to offload CO₂ and reduce stress',
        phases: [
          { name: 'Inhale',  dur: 4,   rgb: [80,  140, 255], grow: true  },
          { name: 'Top-up',  dur: 1.5, rgb: [100, 100, 255], grow: true  },
          { name: 'Exhale',  dur: 8,   rgb: [40,  200, 150], grow: false },
        ],
      },
    ];

    let modeIdx  = 0;
    let elapsed  = 0;
    let cycles   = 0;
    let started  = false;
    let lt       = performance.now();
    let audioCtx = null;
    let lastPhaseIdx = -1;

    const ensureAudio = () => {
      if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    };

    const playBell = (freq, vol = 0.10, dur = 1.0) => {
      if (!audioCtx) return;
      try {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = freq;
        const t = audioCtx.currentTime;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.start(t); o.stop(t + dur);
      } catch (_) {}
    };

    // Per-mode bell pitches (root, hold, exhale, hold2, top-up)
    const BELL_FREQS = [660, 550, 440, 500, 600];

    const getPhase = (mode, t) => {
      const cyc = t % mode.phases.reduce((s, p) => s + p.dur, 0);
      let acc = 0;
      for (let i = 0; i < mode.phases.length; i++) {
        if (cyc < acc + mode.phases[i].dur) return { p: mode.phases[i], frac: (cyc - acc) / mode.phases[i].dur, idx: i };
        acc += mode.phases[i].dur;
      }
      return { p: mode.phases[0], frac: 0, idx: 0 };
    };

    const CYCLE_LEN = (mode) => mode.phases.reduce((s, p) => s + p.dur, 0);
    const easeIO    = (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    const lerp      = (a, b, t) => a + (b - a) * t;

    const CX   = W / 2;
    const CY   = H * 0.40;
    const RMIN = Math.min(W, H) * 0.14;
    const RMAX = Math.min(W, H) * 0.32;

    // Mode chip layout
    const CHIP_H    = H * 0.058;
    const CHIP_GAP  = W * 0.022;
    const CHIP_Y    = H * 0.84;
    const chipRects = [];   // { x, y, w, h, idx }

    const measureChips = () => {
      chipRects.length = 0;
      ctx.font = `bold ${H*0.024}px -apple-system,sans-serif`;
      const pads = W * 0.045;
      let totalW = 0;
      const widths = MODES.map(m => ctx.measureText(m.label).width + pads * 2);
      totalW = widths.reduce((s, w) => s + w, 0) + CHIP_GAP * (MODES.length - 1);
      let x = (W - totalW) / 2;
      MODES.forEach((m, i) => {
        chipRects.push({ x, y: CHIP_Y - CHIP_H / 2, w: widths[i], h: CHIP_H, idx: i });
        x += widths[i] + CHIP_GAP;
      });
    };

    const drawChips = () => {
      MODES.forEach((m, i) => {
        const r     = chipRects[i];
        const sel   = i === modeIdx;
        const [cr, cg, cb] = m.phases[0].rgb;

        ctx.fillStyle = sel
          ? `rgba(${cr},${cg},${cb},0.22)`
          : 'rgba(20,35,80,0.35)';
        ctx.strokeStyle = sel
          ? `rgba(${cr},${cg},${cb},0.70)`
          : 'rgba(50,75,150,0.25)';
        ctx.lineWidth = sel ? 1.5 : 1;
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, CHIP_H / 2);
        ctx.fill(); ctx.stroke();

        ctx.font = `bold ${H*0.024}px -apple-system,sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = sel
          ? `rgb(${cr},${cg},${cb})`
          : 'rgba(130,155,210,0.55)';
        ctx.fillText(m.label, r.x + r.w / 2, r.y + r.h / 2);
      });
    };

    let raf;
    const draw = (ts) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min((ts - lt) / 1000, 0.05); lt = ts;
      if (started) elapsed += dt;

      const mode = MODES[modeIdx];
      const { p: phase, frac, idx } = getPhase(mode, elapsed);

      // Cycle counter
      const cycleSec = CYCLE_LEN(mode);
      const newCycles = Math.floor(elapsed / cycleSec);
      if (newCycles > cycles && started) cycles = newCycles;

      // Phase-change sound
      if (idx !== lastPhaseIdx && started) {
        lastPhaseIdx = idx;
        if (idx === 0) { cycles = Math.floor(elapsed / cycleSec); playBell(660, 0.12, 1.0); }
        else playBell(BELL_FREQS[idx] || 500, 0.08, 0.5);
      }

      // Ring radius
      let r;
      const prevPhases = mode.phases.slice(0, idx);
      const prevGrow   = prevPhases.reduceRight((acc, pp) => acc ?? pp.grow, null);
      if (phase.grow === true)  r = lerp(RMIN, RMAX, easeIO(frac));
      else if (phase.grow === false) r = lerp(RMAX, RMIN, easeIO(frac));
      else r = (prevGrow === true || prevGrow === null) ? RMAX : RMIN;  // hold keeps current size

      const [cr, cg, cb] = phase.rgb;

      ctx.fillStyle = '#060610';
      ctx.fillRect(0, 0, W, H);

      // Pre-start pulse
      if (!started) {
        const pulse = 0.5 + 0.5 * Math.sin(ts / 700);
        ctx.beginPath();
        ctx.arc(CX, CY, RMIN + (RMAX - RMIN) * 0.2 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(80,130,220,${0.28 + pulse * 0.22})`;
        ctx.lineWidth = 3; ctx.stroke();
      }

      // Outer glow
      [3, 2, 1].forEach(ring => {
        ctx.beginPath(); ctx.arc(CX, CY, r + ring * 18, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.055 / ring})`;
        ctx.lineWidth = 12; ctx.stroke();
      });

      // Filled core gradient
      const core = ctx.createRadialGradient(CX, CY, r * 0.5, CX, CY, r);
      core.addColorStop(0, `rgba(${cr},${cg},${cb},0.10)`);
      core.addColorStop(1, `rgba(${cr},${cg},${cb},0.00)`);
      ctx.beginPath(); ctx.arc(CX, CY, r, 0, Math.PI * 2);
      ctx.fillStyle = core; ctx.fill();

      // Ring stroke
      ctx.beginPath(); ctx.arc(CX, CY, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.82)`;
      ctx.lineWidth = 4; ctx.stroke();

      // Progress arc (white) for current phase
      ctx.beginPath();
      ctx.arc(CX, CY, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.50)';
      ctx.lineWidth = 6; ctx.stroke();

      // Center text
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${H * 0.048}px -apple-system,sans-serif`;
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillText(started ? phase.name : 'Tap to begin', CX, CY);

      if (started) {
        const secsLeft = Math.ceil(phase.dur * (1 - frac));
        ctx.font = `${H * 0.028}px monospace`;
        ctx.fillStyle = 'rgba(210,225,255,0.48)';
        ctx.fillText(String(secsLeft), CX, CY + H * 0.06);
      }

      // Mode tagline
      ctx.font = `${H * 0.021}px -apple-system,sans-serif`;
      ctx.fillStyle = 'rgba(130,160,220,0.55)';
      ctx.fillText(mode.tagline, CX, H * 0.12);

      // Phase sequence dots
      const totalPhaseDur = CYCLE_LEN(mode);
      const seqY = H * 0.76;
      const seqW = W * 0.75;
      const seqX = (W - seqW) / 2;
      mode.phases.forEach((ph, i) => {
        const segW = (ph.dur / totalPhaseDur) * seqW;
        const segX = seqX + mode.phases.slice(0, i).reduce((s, pp) => s + (pp.dur / totalPhaseDur) * seqW, 0);
        const [pr, pg, pb] = ph.rgb;
        const active = i === idx && started;
        ctx.fillStyle = active ? `rgba(${pr},${pg},${pb},0.75)` : `rgba(${pr},${pg},${pb},0.22)`;
        ctx.beginPath();
        ctx.roundRect(segX, seqY - 3, segW - 3, 6, 3); ctx.fill();
        ctx.font = `${H*0.016}px -apple-system,sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = active ? `rgba(${pr},${pg},${pb},0.85)` : `rgba(${pr},${pg},${pb},0.38)`;
        ctx.fillText(`${ph.name} ${ph.dur}s`, segX + (segW - 3) / 2, seqY + 6);
      });

      // Cycle count
      if (cycles > 0) {
        ctx.font = `${H*0.021}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(110,140,200,0.40)';
        ctx.fillText(`cycle ${cycles}`, W/2, H*0.795);
      }

      // Science blurb
      ctx.font = `${H*0.017}px -apple-system,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(70,95,155,0.45)';
      ctx.fillText(mode.science, W/2, H*0.905);

      // Mode chips
      measureChips();
      drawChips();
    };

    const hitChip = (x, y) => chipRects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

    let lastTouchMs = 0;
    this._onTouchStart = (e) => {
      e.preventDefault();
      ensureAudio();
      lastTouchMs = Date.now();
      const tx = e.changedTouches[0].clientX;
      const ty = e.changedTouches[0].clientY;
      const chip = hitChip(tx, ty);
      if (chip) {
        if (chip.idx !== modeIdx) {
          modeIdx = chip.idx;
          elapsed = 0; cycles = 0; started = false; lastPhaseIdx = -1;
        }
      } else {
        if (!started) { started = true; elapsed = 0; lt = performance.now(); }
        // ring area tap: toggle pause-like restart
      }
    };

    this._onClick = (e) => {
      if (Date.now() - lastTouchMs < 500) return;
      ensureAudio();
      const chip = hitChip(e.clientX, e.clientY);
      if (chip) {
        if (chip.idx !== modeIdx) {
          modeIdx = chip.idx;
          elapsed = 0; cycles = 0; started = false; lastPhaseIdx = -1;
        }
      } else if (!started) {
        started = true; elapsed = 0; lt = performance.now();
      }
    };

    canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    canvas.addEventListener('click', this._onClick);

    lt = performance.now();
    raf = requestAnimationFrame(draw);
    this._raf = () => cancelAnimationFrame(raf);
    this._canvas = canvas;
  },

  destroy() {
    this._raf?.();
    if (this._canvas) {
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('click', this._onClick);
    }
    this._canvas = null;
  },
};
