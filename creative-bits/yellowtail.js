window.plethoraBit = {
  meta: {
    title: 'Yellowtail',
    author: 'plethora',
    description: 'Draw anything. Watch it loop forever.',
    tags: ['creative'],
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

    // Bell/chime — inharmonic partials give a metallic ring
    let chimeVoices = 0;
    const MAX_VOICES = 9;
    function chime(freq) {
      if (!audioCtx || chimeVoices >= MAX_VOICES) return;
      const now = audioCtx.currentTime;
      [[1, 0.14], [2, 0.05], [2.76, 0.03]].forEach(([h, vol]) => {
        chimeVoices++;
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * h;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
        osc.connect(gain).connect(audioCtx.destination);
        osc.onended = () => chimeVoices--;
        osc.start(now); osc.stop(now + 1.7);
      });
    }

    // C major pentatonic across 3 octaves
    const NOTES = [130.81, 164.81, 196.00, 261.63, 329.63,
                   392.00, 523.25, 659.25, 783.99, 1046.50];

    // ── State ─────────────────────────────────────────────────────────────
    const MAX_STROKES = 9;
    let strokes = [];
    let current  = null;
    let lastX = 0, lastY = 0, lastT = 0;
    let hueBase = Math.random() * 360;

    // ── Touch ─────────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      ctx.platform.start();
      const t = e.changedTouches[0];
      hueBase = (hueBase + 47) % 360;
      current = {
        pts: [{ x: t.clientX, y: t.clientY, w: 3 }],
        hue: hueBase,
        offset: 0,
        speed: 1,
        note: NOTES[Math.floor(Math.random() * NOTES.length)],
      };
      lastX = t.clientX; lastY = t.clientY; lastT = Date.now();
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!current) return;
      const t = e.changedTouches[0];
      const now = Date.now();
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 5) return;
      const spd = dist / Math.max(1, now - lastT);
      // Slow drawing → thick; fast drawing → thin (Yellowtail's key feel)
      const w = Math.max(1, Math.min(10, 5 / (0.4 + spd * 0.8)));
      current.pts.push({ x: t.clientX, y: t.clientY, w });
      current.speed = (current.speed * 3 + spd * 0.25) / 4;
      lastX = t.clientX; lastY = t.clientY; lastT = now;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!current || current.pts.length < 5) { current = null; return; }
      current.speed = Math.max(0.4, Math.min(5, current.speed * 1.8));
      strokes.push(current);
      if (strokes.length > MAX_STROKES) strokes.shift();
      current = null;
      ctx.platform.interact({ type: 'draw' });
    }, { passive: false });

    // ── Render ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      // Slow background fade creates the persistent ghost trails
      g.fillStyle = 'rgba(0,0,0,0.020)';
      g.fillRect(0, 0, W, H);

      if (!strokes.length && !current) {
        g.fillStyle = 'rgba(255,255,255,0.32)';
        g.font = `300 ${W * 0.042}px -apple-system, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('draw anything', W / 2, H / 2);
        return;
      }

      // Stroke being drawn right now
      if (current && current.pts.length > 1) {
        const pts = current.pts;
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.strokeStyle = `hsla(${current.hue},90%,68%,0.85)`;
        g.lineWidth = 2.5;
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.stroke();
      }

      // Animate each stored stroke
      for (const s of strokes) {
        const prev = s.offset;
        s.offset += s.speed * dt * 0.07;
        const n = s.pts.length;
        if (s.offset >= n) {
          s.offset -= n;
          chime(s.note);   // ring each time the gesture completes a loop
        }

        // Dim ghost of the full stroke so the shape is readable
        g.beginPath();
        g.moveTo(s.pts[0].x, s.pts[0].y);
        for (let i = 1; i < n; i++) g.lineTo(s.pts[i].x, s.pts[i].y);
        g.strokeStyle = `hsla(${s.hue},70%,55%,0.09)`;
        g.lineWidth = 1;
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.stroke();

        // Bright animated head (varying width matches original drawing speed)
        const headLen = Math.max(4, Math.floor(n * 0.18));
        const si = Math.floor(s.offset) % n;
        for (let j = 0; j < headLen - 1; j++) {
          const i1 = (si + j)     % n;
          const i2 = (si + j + 1) % n;
          const alpha = 0.88 * (1 - j / headLen);
          const p1 = s.pts[i1], p2 = s.pts[i2];
          g.beginPath();
          g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y);
          g.strokeStyle = `hsla(${s.hue},92%,70%,${alpha})`;
          g.lineWidth   = p1.w * (1 - j / headLen * 0.6);
          g.lineCap = 'round';
          g.stroke();
        }
      }
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
