window.plethoraBit = {
  meta: {
    title: 'Bubble Harp',
    author: 'plethora',
    description: 'Swipe to seed a Voronoi diagram. Watch the edges sing.',
    tags: ['creative'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    await ctx.loadScript('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js');

    // ── Audio ────────────────────────────────────────────────────────────
    let audioCtx = null;
    let dry = null, verb = null, wet = null;

    function ensureAudio() {
      if (!audioCtx) {
        audioCtx = new AudioContext();
        ctx.onDestroy(() => audioCtx.close());

        // Simple reverb: exponentially decaying stereo noise impulse
        const sr = audioCtx.sampleRate;
        const len = sr * 2.2;
        const buf = audioCtx.createBuffer(2, len, sr);
        for (let c = 0; c < 2; c++) {
          const d = buf.getChannelData(c);
          for (let i = 0; i < len; i++)
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
        }
        verb = audioCtx.createConvolver();
        verb.buffer = buf;
        dry = audioCtx.createGain(); dry.gain.value = 0.65;
        wet = audioCtx.createGain(); wet.gain.value = 0.42;
        dry.connect(audioCtx.destination);
        verb.connect(wet).connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // C pentatonic, two octaves — pitch assigned per edge by length, not X
    const SCALE = [130.81, 146.83, 164.81, 196.00, 220.00,
                   261.63, 293.66, 329.63, 392.00, 440.00,
                   523.25, 587.33, 659.25, 783.99, 880.00];

    // Plucked string: sine harmonics with natural brightness decay + stereo pan
    function pluck(freq, pan) {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const panner = audioCtx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      panner.connect(dry);
      panner.connect(verb);

      // Harmonic series — higher partials decay much faster (real string physics)
      [
        { h: 1, vol: 0.30, decay: 2.8 },
        { h: 2, vol: 0.12, decay: 1.2 },
        { h: 3, vol: 0.06, decay: 0.55 },
        { h: 4, vol: 0.03, decay: 0.25 },
      ].forEach(({ h, vol, decay }) => {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * h;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(gain).connect(panner);
        osc.start(now); osc.stop(now + decay + 0.05);
      });
    }

    // ── Colour palette ────────────────────────────────────────────────────
    const COLORS = ['#88d4f7','#b0a6ff','#ff9fd4','#ffe8a0',
                    '#88efc5','#ffba88','#c4a8ff','#7adff5','#ffb3c6'];

    function hex2rgb(h) {
      return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    }

    // ── State ─────────────────────────────────────────────────────────────
    let state    = 'idle';   // idle | swiping | building | playing
    let swipePts = [];
    let seeds    = [];
    let cells    = [];  // { polygon, rgb }
    let edges    = [];  // Voronoi internal edges (the "strings")
    let gen      = 0;   // incremented on reset to cancel stale timeouts
    let lastPt   = null;
    const GAP    = 28;

    function reset() {
      gen++;
      swipePts = []; seeds = []; cells = []; edges = []; lastPt = null;
    }

    // ── Touch ─────────────────────────────────────────────────────────────
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      ctx.platform.start();
      ctx.platform.haptic('light');
      reset();
      state = 'swiping';
      const t = e.changedTouches[0];
      addPt(t.clientX, t.clientY);
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (state !== 'swiping') return;
      const t = e.changedTouches[0];
      addPt(t.clientX, t.clientY);
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (state !== 'swiping') return;
      if (swipePts.length < 3) { state = 'idle'; reset(); return; }
      state = 'building';
      buildDiagram();
    }, { passive: false });

    function addPt(x, y) {
      if (lastPt) {
        const dx = x - lastPt.x, dy = y - lastPt.y;
        if (dx*dx + dy*dy < GAP*GAP) return;
      }
      swipePts.push({ x, y });
      lastPt = { x, y };
    }

    // ── Build Voronoi from swipe seeds ─────────────────────────────────────
    function buildDiagram() {
      const myGen = gen;

      seeds = swipePts.map((p, i) => ({
        x: p.x, y: p.y,
        color: COLORS[i % COLORS.length],
        rgb: hex2rgb(COLORS[i % COLORS.length]),
      }));

      const delaunay = d3.Delaunay.from(seeds, s => s.x, s => s.y);
      const voronoi  = delaunay.voronoi([0, 0, W, H]);

      // Cell polygons for subtle background fill
      cells = seeds.map((s, i) => ({
        polygon: voronoi.cellPolygon(i),
        rgb: s.rgb,
      }));

      // Extract ALL Voronoi edges by walking every cell polygon.
      // voronoi.cellPolygon(i) returns the clipped polygon for cell i —
      // consecutive vertices are exactly the drawn Voronoi edges (including
      // boundary edges that the halfedge approach misses).
      // A canonical string key deduplicates edges shared by two cells.
      function ptKey(x, y) { return `${Math.round(x*10)},${Math.round(y*10)}`; }

      const edgeMap = new Map();
      for (let i = 0; i < seeds.length; i++) {
        const poly = voronoi.cellPolygon(i);
        if (!poly) continue;
        for (let k = 0; k < poly.length - 1; k++) {
          const ax = poly[k][0],   ay = poly[k][1];
          const bx = poly[k+1][0], by = poly[k+1][1];
          const ka = ptKey(ax, ay), kb = ptKey(bx, by);
          const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          if (edgeMap.has(key)) {
            const existing = edgeMap.get(key);
            existing.internal = true;           // seen by two cells → true Voronoi edge
            existing.cellB = i;                 // record second neighbour for ordering
            continue;
          }

          const dx = bx-ax, dy = by-ay;
          const len = Math.sqrt(dx*dx + dy*dy);
          if (len < 2) continue;

          const mx = (ax+bx)/2;
          const nx = -dy/len, ny = dx/len;     // perpendicular unit vector
          const noteIdx = Math.min(SCALE.length-1, Math.max(0, Math.round((mx/W) * (SCALE.length-1))));

          edgeMap.set(key, {
            x1: ax, y1: ay, x2: bx, y2: by, nx, ny, mx,
            color: seeds[i].color, rgb: seeds[i].rgb,
            pitch: SCALE[noteIdx],
            internal: false,            // flipped to true when the neighbour cell also claims it
            cellA: i, cellB: i,        // both start as i; cellB updated when neighbour claims it
            showing: false,
            vibeAmp: 0, vibeT: 0,
            vibeOmega: 0.024 + Math.random() * 0.020,
          });
        }
      }
      const raw = Array.from(edgeMap.values());

      // Sort left → right for natural harp strum order
      raw.sort((a, b) => a.mx - b.mx);
      edges = raw;

      // Stagger ALL edges into view (boundary + internal)
      edges.forEach((edge, i) => {
        ctx.timeout(() => {
          if (gen !== myGen) return;
          edge.showing = true;
        }, i * 55);
      });

      // Exclude only bounding-box filler segments: edges where BOTH endpoints sit
      // on the SAME wall (e.g. both at y≈0). Those are screen-edge artifacts.
      // Real Voronoi strings that were clipped by a wall (one endpoint on wall,
      // one interior) are still valid — they separate two seed cells.
      const eps = 1;
      function sameWall(x1, y1, x2, y2) {
        return (x1 <= eps && x2 <= eps) ||
               (x1 >= W - eps && x2 >= W - eps) ||
               (y1 <= eps && y2 <= eps) ||
               (y1 >= H - eps && y2 >= H - eps);
      }

      // Only pluck edges between seeds that are consecutive in swipe order.
      // The Delaunay triangulation also connects non-adjacent seeds (convex hull
      // diagonals etc.) — those produce "extra" Voronoi strings we skip.
      const strumEdges = edges
        .filter(e => e.internal
                  && !sameWall(e.x1, e.y1, e.x2, e.y2)
                  && Math.abs(e.cellA - e.cellB) === 1)
        .sort((a, b) => (a.cellA + a.cellB) / 2 - (b.cellA + b.cellB) / 2);

      // Longer Voronoi string → lower pitch (real harp physics).
      // Stereo pan follows midpoint X position.
      if (strumEdges.length > 0) {
        const lens = strumEdges.map(e => Math.hypot(e.x2-e.x1, e.y2-e.y1));
        const minL = Math.min(...lens), maxL = Math.max(...lens);
        strumEdges.forEach((e, i) => {
          const t = maxL > minL ? (lens[i] - minL) / (maxL - minL) : 0.5;
          e.pitch = SCALE[Math.round((1 - t) * (SCALE.length - 1))]; // longer = lower
          e.pan   = (e.mx / W) * 2 - 1;                              // X → stereo
        });
      }

      const strumAt = edges.length * 55 + 420;
      ctx.timeout(() => {
        if (gen !== myGen) return;
        state = 'playing';
        strumEdges.forEach((edge, i) => {
          ctx.timeout(() => {
            if (gen !== myGen) return;
            edge.vibeAmp = 22;
            edge.vibeT   = 0;
            pluck(edge.pitch, edge.pan);
            ctx.platform.haptic('light');
            ctx.platform.interact({ type: 'note' });
          }, i * 75);
        });
      }, strumAt);
    }

    // ── Render ─────────────────────────────────────────────────────────────
    ctx.raf((dt) => {
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);

      if (state === 'idle') {
        hint('swipe to build your harp', 0.42);
        return;
      }
      if (state === 'swiping') {
        drawTrail();
        return;
      }

      updateEdges(dt);
      drawCells();
      drawEdges();
      drawSeeds();

      if (state === 'playing' && edges.length && edges.every(e => e.vibeAmp < 0.2)) {
        hint('swipe again', 0.28);
      }
    });

    function hint(text, alpha) {
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = '#fff';
      g.font = `${W * 0.04}px -apple-system, "Helvetica Neue", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, W/2, H * 0.87);
      g.restore();
    }

    function drawTrail() {
      if (swipePts.length < 2) return;
      g.beginPath();
      g.moveTo(swipePts[0].x, swipePts[0].y);
      for (let i = 1; i < swipePts.length; i++) g.lineTo(swipePts[i].x, swipePts[i].y);
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1;
      g.stroke();
      swipePts.forEach((p, i) => {
        const t = swipePts.length > 1 ? i/(swipePts.length-1) : 0.5;
        g.beginPath();
        g.arc(p.x, p.y, 3.5, 0, Math.PI*2);
        g.fillStyle = `hsl(${180 + t*120}, 80%, 72%)`;
        g.fill();
      });
    }

    function updateEdges(dt) {
      for (const e of edges) {
        if (e.vibeAmp > 0) {
          e.vibeAmp *= Math.pow(0.9975, dt);
          e.vibeT   += dt;
          if (e.vibeAmp < 0.05) e.vibeAmp = 0;
        }
      }
    }

    // Subtle per-cell colour fills (Voronoi "bubbles")
    function drawCells() {
      g.save();
      g.beginPath(); g.rect(0, 0, W, H); g.clip();
      cells.forEach(c => {
        if (!c.polygon) return;
        const [r, gv, b] = c.rgb;
        g.beginPath();
        g.moveTo(c.polygon[0][0], c.polygon[0][1]);
        for (let i = 1; i < c.polygon.length; i++) g.lineTo(c.polygon[i][0], c.polygon[i][1]);
        g.closePath();
        g.fillStyle = `rgba(${r},${gv},${b},0.055)`;
        g.fill();
      });
      g.restore();
    }

    // Voronoi edges = harp strings, with standing-wave vibration
    function drawEdges() {
      g.save();
      g.beginPath(); g.rect(0, 0, W, H); g.clip();

      edges.forEach(e => {
        if (!e.showing) return;
        const [r, gv, b] = e.rgb;
        const pulse = e.vibeAmp / 22;

        g.save();
        g.shadowColor = e.color;
        g.shadowBlur  = 3 + pulse * 20;
        g.strokeStyle = `rgba(${r},${gv},${b},${0.45 + pulse * 0.55})`;
        g.lineWidth   = 1 + pulse * 2;

        // Standing wave: each point along the edge bows perpendicular
        // displacement = A · sin(π · frac) · cos(ω · t)
        const SEGS = 44;
        g.beginPath();
        for (let j = 0; j <= SEGS; j++) {
          const frac = j / SEGS;
          const bx   = e.x1 + (e.x2 - e.x1) * frac;
          const by   = e.y1 + (e.y2 - e.y1) * frac;
          const vib  = e.vibeAmp * Math.sin(Math.PI * frac) * Math.cos(e.vibeOmega * e.vibeT);
          if (j === 0) g.moveTo(bx + e.nx * vib, by + e.ny * vib);
          else         g.lineTo(bx + e.nx * vib, by + e.ny * vib);
        }
        g.stroke();
        g.restore();
      });

      g.restore();
    }

    // Seed points (the original swipe dots)
    function drawSeeds() {
      seeds.forEach(s => {
        const [r, gv, b] = s.rgb;
        g.save();
        g.shadowColor = s.color;
        g.shadowBlur  = 8;
        g.beginPath();
        g.arc(s.x, s.y, 3, 0, Math.PI*2);
        g.fillStyle = `rgba(${r},${gv},${b},0.85)`;
        g.fill();
        g.restore();
      });
    }

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
