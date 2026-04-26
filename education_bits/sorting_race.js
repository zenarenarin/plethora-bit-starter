window.scrollerApp = {
  meta: {
    title: 'Sorting Race',
    author: 'plethora',
    description: 'Bubble vs Merge vs Quick. Same data, three algorithms racing. Watch O(n²) lose.',
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

    const N = 40;
    let audioCtx = null;
    const ensureAudio = () => {
      if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    };
    const playSwap = (freq) => {
      if (!audioCtx) return;
      try {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = freq;
        const t = audioCtx.currentTime;
        g.gain.setValueAtTime(0.03, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.start(t); o.stop(t + 0.06);
      } catch (_) {}
    };

    // Three separate copies
    const makeData = () => Array.from({length: N}, (_, i) => i + 1).sort(() => Math.random() - 0.5);

    const ALGOS = [
      { name: 'Bubble',    color: '#FF6060', complexity: 'O(n²)',     data: [], steps: [], stepIdx: 0, done: false, comparisons: 0 },
      { name: 'Merge',     color: '#40C0FF', complexity: 'O(n log n)', data: [], steps: [], stepIdx: 0, done: false, comparisons: 0 },
      { name: 'Quick',     color: '#60E080', complexity: 'O(n log n)', data: [], steps: [], stepIdx: 0, done: false, comparisons: 0 },
    ];

    let racing = false, allDone = false, winner = null;
    let raf;

    // ── Step generators ──────────────────────────────────────────────────
    const bubbleSteps = (arr) => {
      const steps = [], a = arr.slice();
      for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < a.length - i - 1; j++) {
          steps.push({ hi: [j, j+1], arr: null });
          if (a[j] > a[j+1]) {
            [a[j], a[j+1]] = [a[j+1], a[j]];
            steps.push({ swap: [j, j+1], arr: a.slice() });
          }
        }
      }
      steps.push({ arr: a.slice(), done: true });
      return steps;
    };

    const mergeSteps = (arr) => {
      const steps = [], a = arr.slice();
      const merge = (lo, mid, hi) => {
        const left = a.slice(lo, mid+1), right = a.slice(mid+1, hi+1);
        let i = 0, j = 0, k = lo;
        while (i < left.length && j < right.length) {
          steps.push({ hi: [lo+i, mid+1+j] });
          if (left[i] <= right[j]) { a[k++] = left[i++]; }
          else                      { a[k++] = right[j++]; }
          steps.push({ arr: a.slice() });
        }
        while (i < left.length) { a[k++] = left[i++]; steps.push({ arr: a.slice() }); }
        while (j < right.length) { a[k++] = right[j++]; steps.push({ arr: a.slice() }); }
      };
      const sort = (lo, hi) => {
        if (lo >= hi) return;
        const mid = (lo + hi) >> 1;
        sort(lo, mid); sort(mid+1, hi); merge(lo, mid, hi);
      };
      sort(0, a.length - 1);
      steps.push({ arr: a.slice(), done: true });
      return steps;
    };

    const quickSteps = (arr) => {
      const steps = [], a = arr.slice();
      const sort = (lo, hi) => {
        if (lo >= hi) return;
        const pivot = a[hi];
        let i = lo;
        for (let j = lo; j < hi; j++) {
          steps.push({ hi: [j, hi] });
          if (a[j] < pivot) {
            [a[i], a[j]] = [a[j], a[i]];
            steps.push({ swap: [i, j], arr: a.slice() });
            i++;
          }
        }
        [a[i], a[hi]] = [a[hi], a[i]];
        steps.push({ swap: [i, hi], arr: a.slice() });
        sort(lo, i - 1); sort(i + 1, hi);
      };
      sort(0, a.length - 1);
      steps.push({ arr: a.slice(), done: true });
      return steps;
    };

    const reset = () => {
      ensureAudio();
      const base = makeData();
      allDone = false; racing = true; winner = null;

      ALGOS[0].data  = base.slice(); ALGOS[0].steps = bubbleSteps(base.slice()); ALGOS[0].stepIdx = 0; ALGOS[0].done = false; ALGOS[0].comparisons = 0;
      ALGOS[1].data  = base.slice(); ALGOS[1].steps = mergeSteps(base.slice());  ALGOS[1].stepIdx = 0; ALGOS[1].done = false; ALGOS[1].comparisons = 0;
      ALGOS[2].data  = base.slice(); ALGOS[2].steps = quickSteps(base.slice());  ALGOS[2].stepIdx = 0; ALGOS[2].done = false; ALGOS[2].comparisons = 0;
    };

    // Layout
    const PAD   = W * 0.03;
    const COL_W = (W - PAD * 4) / 3;
    const HEADER_H = H * 0.10;
    const FOOTER_H = H * 0.13;
    const CHART_H  = H - HEADER_H - FOOTER_H;
    const BAR_GAP  = 1;
    const BAR_W    = (COL_W - PAD * 0.5 - BAR_GAP * (N - 1)) / N;

    const colX = (c) => PAD + c * (COL_W + PAD);

    // Advance each algorithm STEPS_PER_FRAME steps per frame
    const STEPS_PER_FRAME = 3;

    const tick = () => {
      if (!racing) return;
      let anyProgress = false;
      ALGOS.forEach((a) => {
        if (a.done) return;
        for (let s = 0; s < STEPS_PER_FRAME; s++) {
          if (a.stepIdx >= a.steps.length) { a.done = true; break; }
          const step = a.steps[a.stepIdx++];
          if (step.arr)  a.data = step.arr;
          if (step.hi)   a.comparisons++;
          if (step.done && !winner) winner = a;
        }
        if (!a.done) anyProgress = true;
      });
      if (!anyProgress) { racing = false; allDone = true; }
    };

    const drawCol = (a, ci) => {
      const x0 = colX(ci);
      const maxVal = N;

      // Background
      ctx.fillStyle = 'rgba(15,20,40,0.6)';
      ctx.beginPath();
      ctx.roundRect(x0, HEADER_H, COL_W, CHART_H, 6);
      ctx.fill();

      // Bars
      for (let i = 0; i < a.data.length; i++) {
        const bh  = (a.data[i] / maxVal) * (CHART_H - 8);
        const bx  = x0 + i * (BAR_W + BAR_GAP);
        const by  = HEADER_H + CHART_H - bh - 4;
        const frac = a.data[i] / maxVal;
        const alpha = a.done ? 0.95 : 0.7;
        ctx.fillStyle = `hsla(${120 + frac * 60},80%,${50 + frac * 15}%,${alpha})`;
        ctx.fillRect(bx, by, BAR_W, bh);
      }

      // Done overlay
      if (a.done) {
        ctx.fillStyle = `rgba(${hexToRgbNums(a.color).join(',')},0.08)`;
        ctx.beginPath(); ctx.roundRect(x0, HEADER_H, COL_W, CHART_H, 6); ctx.fill();
      }

      // Header
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      const crowned = winner === a;
      ctx.font = `bold ${H*0.03}px -apple-system,sans-serif`;
      ctx.fillStyle = crowned ? a.color : `rgba(${hexToRgbNums(a.color).join(',')},0.75)`;
      ctx.fillText((crowned ? '🏆 ' : '') + a.name, x0 + COL_W / 2, HEADER_H * 0.38);

      ctx.font = `${H*0.022}px monospace`;
      ctx.fillStyle = `rgba(${hexToRgbNums(a.color).join(',')},0.55)`;
      ctx.fillText(a.complexity, x0 + COL_W / 2, HEADER_H * 0.72);
    };

    const hexToRgbNums = (hex) => [
      parseInt(hex.slice(1,3),16),
      parseInt(hex.slice(3,5),16),
      parseInt(hex.slice(5,7),16),
    ];

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (racing) tick();

      ctx.fillStyle = '#06060f';
      ctx.fillRect(0, 0, W, H);

      ALGOS.forEach((a, i) => drawCol(a, i));

      // Footer
      const fy = HEADER_H + CHART_H + 8;
      ALGOS.forEach((a, i) => {
        const x0 = colX(i);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = `${H*0.022}px monospace`;
        ctx.fillStyle = `rgba(${hexToRgbNums(a.color).join(',')},0.55)`;
        ctx.fillText(`${a.comparisons} ops`, x0 + COL_W / 2, fy);

        if (a.done) {
          ctx.font = `${H*0.02}px -apple-system,sans-serif`;
          ctx.fillStyle = `rgba(${hexToRgbNums(a.color).join(',')},0.4)`;
          ctx.fillText('done', x0 + COL_W / 2, fy + H*0.03);
        } else {
          const pct = a.stepIdx / Math.max(1, a.steps.length);
          ctx.fillStyle = 'rgba(30,50,100,0.5)';
          ctx.fillRect(x0 + 4, fy + H*0.035, COL_W - 8, 3);
          ctx.fillStyle = a.color;
          ctx.fillRect(x0 + 4, fy + H*0.035, (COL_W - 8) * pct, 3);
        }
      });

      // Start / restart prompt
      if (!racing && !allDone) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${H*0.032}px -apple-system,sans-serif`;
        ctx.fillStyle = 'rgba(150,175,240,0.75)';
        ctx.fillText('tap to race', W/2, H/2);
      }
      if (allDone) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.font = `${H*0.022}px -apple-system,sans-serif`;
        ctx.fillStyle = 'rgba(120,150,210,0.55)';
        ctx.fillText('tap to race again', W/2, H - 6);
      }
    };

    this._onTap = (e) => {
      e.preventDefault();
      if (!racing) reset();
    };
    canvas.addEventListener('touchstart', this._onTap, { passive: false });
    canvas.addEventListener('click', this._onTap);

    raf = requestAnimationFrame(loop);
    this._raf = () => cancelAnimationFrame(raf);
    this._canvas = canvas;
  },

  destroy() {
    this._raf?.();
    if (this._canvas) {
      this._canvas.removeEventListener('touchstart', this._onTap);
      this._canvas.removeEventListener('click', this._onTap);
    }
    this._canvas = null;
  },
};
