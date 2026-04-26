window.scrollerApp = {
  meta: {
    title: 'Prime Sieve',
    author: 'plethora',
    description: 'Watch primes emerge from the pattern.',
    tags: ['education'],
  },

  // ── internal state ────────────────────────────────────────────────────
  _timeouts: [],
  _raf: null,
  _audioCtx: null,
  _audioReady: false,
  _speedIdx: 1,           // 0=slow, 1=normal, 2=fast
  _speeds: [600, 300, 120],
  _running: false,
  _repeatRun: false,
  _container: null,
  _canvas: null,
  _ctx: null,
  _W: 0,
  _H: 0,

  // sieve data
  _N: 200,
  _COLS: 14,
  _state: null,   // array of { num, status:'unmarked'|'prime'|'composite', flash:null }
  _primeIndex: 0,
  _flashQueue: [], // { idx, color, duration }

  // ── lifecycle ─────────────────────────────────────────────────────────
  init(container) {
    this._container = container;
    container.style.touchAction = 'none';
    container.style.overflow = 'hidden';

    const W = container.clientWidth;
    const H = container.clientHeight;
    this._W = W;
    this._H = H;

    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    this._canvas = canvas;
    this._ctx = ctx;

    this._speedIdx = 1;
    this._repeatRun = false;
    this._audioReady = false;

    // touch / click for speed cycle + audio init
    const onInteract = (e) => {
      e.preventDefault();
      this._initAudio();
      this._cycleSpeed();
    };
    canvas.addEventListener('touchstart', onInteract, { passive: false });
    canvas.addEventListener('click', onInteract);
    this._onInteract = onInteract;

    this._resetAndRun();
    this._startRenderLoop();
  },

  destroy() {
    // cancel all pending timeouts
    for (const id of this._timeouts) clearTimeout(id);
    this._timeouts = [];

    // cancel RAF
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }

    // remove event listeners
    if (this._canvas && this._onInteract) {
      this._canvas.removeEventListener('touchstart', this._onInteract);
      this._canvas.removeEventListener('click', this._onInteract);
    }

    // close audio
    if (this._audioCtx) {
      this._audioCtx.close();
      this._audioCtx = null;
    }

    this._canvas = null;
    this._ctx = null;
    this._container = null;
    this._running = false;
    this._flashQueue = [];
    this._state = null;
  },

  // ── audio ─────────────────────────────────────────────────────────────
  _initAudio() {
    if (this._audioReady) return;
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this._audioReady = true;
    } catch (e) { /* no audio */ }
  },

  _playPrimeChime(primeIndex) {
    if (!this._audioReady || !this._audioCtx) return;
    const freq = Math.min(200 + primeIndex * 30, 1200);
    const ctx = this._audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.28);
  },

  _playCompositeThud() {
    if (!this._audioReady || !this._audioCtx) return;
    const ctx = this._audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  },

  // ── speed control ─────────────────────────────────────────────────────
  _cycleSpeed() {
    this._speedIdx = (this._speedIdx + 1) % 3;
  },

  // ── sieve logic ───────────────────────────────────────────────────────
  _resetAndRun() {
    // cancel any in-flight timeouts
    for (const id of this._timeouts) clearTimeout(id);
    this._timeouts = [];
    this._flashQueue = [];
    this._running = false;

    const N = this._N;
    this._state = [];
    for (let i = 0; i <= N; i++) {
      this._state.push({ num: i, status: 'unmarked', flash: null, flashEnd: 0 });
    }
    this._primeIndex = 0;
    this._showSummary = false;
    this._summaryText = '';

    // delay start slightly so canvas renders first frame
    const startId = setTimeout(() => { this._runStep(2); }, 400);
    this._timeouts.push(startId);
  },

  _runStep(p) {
    if (!this._state) return;
    const N = this._N;
    const delay = this._repeatRun
      ? this._speeds[this._speedIdx] / 2
      : this._speeds[this._speedIdx];

    // find the next unmarked number >= p
    let current = p;
    while (current <= N && this._state[current].status !== 'unmarked') {
      current++;
    }

    if (current > N) {
      // all done — flash remaining unmarked as primes (shouldn't be many after sqrt)
      this._finalize();
      return;
    }

    // mark current as prime
    const s = this._state[current];
    s.status = 'prime';
    s.flash = 'cyan';
    s.flashEnd = Date.now() + 180;
    this._playPrimeChime(this._primeIndex);
    this._primeIndex++;

    // cross out multiples with staggered flashes
    const multiples = [];
    for (let m = current * 2; m <= N; m += current) {
      if (this._state[m].status === 'unmarked') {
        multiples.push(m);
      }
    }

    let mDelay = 0;
    const flashStep = Math.max(20, Math.min(60, delay / (multiples.length + 1)));
    for (const m of multiples) {
      const tid = setTimeout(() => {
        if (!this._state) return;
        const ms = this._state[m];
        ms.status = 'composite';
        ms.flash = 'red';
        ms.flashEnd = Date.now() + 200;
        this._playCompositeThud();
      }, mDelay);
      this._timeouts.push(tid);
      mDelay += flashStep;
    }

    // transition current's cyan flash to settled gold after flash duration
    const settleId = setTimeout(() => {
      if (!this._state) return;
      this._state[current].flash = null;
    }, 200);
    this._timeouts.push(settleId);

    const nextId = setTimeout(() => {
      if (!this._state) return;
      const sqrtN = Math.sqrt(N);
      if (current >= sqrtN) {
        this._finalize();
      } else {
        this._runStep(current + 1);
      }
    }, delay + mDelay);
    this._timeouts.push(nextId);
  },

  _finalize() {
    if (!this._state) return;
    const N = this._N;
    const delay = this._repeatRun
      ? this._speeds[this._speedIdx] / 2
      : this._speeds[this._speedIdx];

    // collect all remaining unmarked — they are prime
    const remaining = [];
    for (let i = 2; i <= N; i++) {
      if (this._state[i].status === 'unmarked') remaining.push(i);
    }

    let d = 0;
    const flashStep = Math.max(15, Math.min(40, delay / (remaining.length + 1)));
    for (const idx of remaining) {
      const tid = setTimeout(() => {
        if (!this._state) return;
        this._state[idx].status = 'prime';
        this._state[idx].flash = 'gold';
        this._state[idx].flashEnd = Date.now() + 300;
        this._playPrimeChime(this._primeIndex);
        this._primeIndex++;
      }, d);
      this._timeouts.push(tid);
      d += flashStep;
    }

    // count primes after all flashes done
    const doneId = setTimeout(() => {
      if (!this._state) return;
      let count = 0;
      for (let i = 2; i <= N; i++) {
        if (this._state[i].status === 'prime') count++;
      }
      this._showSummary = true;
      this._summaryText = `Found ${count} primes up to ${N}`;
      this._running = false;

      // queue next run
      const restartId = setTimeout(() => {
        this._repeatRun = true;
        this._resetAndRun();
      }, 5000);
      this._timeouts.push(restartId);
    }, d + 500);
    this._timeouts.push(doneId);
  },

  // ── render loop ───────────────────────────────────────────────────────
  _startRenderLoop() {
    const loop = () => {
      this._draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  },

  _draw() {
    const ctx = this._ctx;
    if (!ctx || !this._state) return;

    const W = this._W;
    const H = this._H;
    const safeH = H * 0.88;

    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);

    const COLS = this._COLS;
    const N = this._N;
    const nums = N - 1; // numbers 2..200 = 199 cells

    // grid geometry
    const marginX = 8;
    const marginTop = 48;
    const gridW = W - marginX * 2;
    const ROWS = Math.ceil(nums / COLS);
    const cellW = gridW / COLS;
    const maxGridH = safeH - marginTop - 4;
    const cellH = Math.min(cellW, maxGridH / ROWS);

    const gridH = cellH * ROWS;
    const startY = marginTop;

    const now = Date.now();

    // draw cells 2..200
    for (let n = 2; n <= N; n++) {
      const i = n - 2;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = marginX + col * cellW;
      const y = startY + row * cellH;

      const s = this._state[n];
      const isFlashing = s.flash && now < s.flashEnd;

      let bg, textColor, borderColor;

      if (isFlashing) {
        if (s.flash === 'cyan') {
          bg = '#00e5ff';
          textColor = '#000';
          borderColor = '#00bcd4';
        } else if (s.flash === 'red') {
          bg = '#c62828';
          textColor = '#ff8a80';
          borderColor = '#b71c1c';
        } else if (s.flash === 'gold') {
          bg = '#ffd700';
          textColor = '#000';
          borderColor = '#ffb300';
        } else {
          bg = '#333';
          textColor = '#aaa';
          borderColor = '#444';
        }
      } else {
        if (s.status === 'prime') {
          bg = '#1a1600';
          textColor = '#ffd700';
          borderColor = '#7a6400';
        } else if (s.status === 'composite') {
          bg = '#0e0a0a';
          textColor = '#3a2020';
          borderColor = '#1a1010';
        } else {
          // unmarked
          bg = '#1a1a2a';
          textColor = '#bbb';
          borderColor = '#2a2a3a';
        }
      }

      // cell background
      ctx.fillStyle = bg;
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

      // border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);

      // number text
      const fontSize = Math.max(7, Math.min(11, cellH * 0.38));
      ctx.fillStyle = textColor;
      ctx.font = `${fontSize}px "Courier New", Courier, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), x + cellW / 2, y + cellH / 2);
    }

    // ── UI bar above grid ──────────────────────────────────────────────
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 15px "Courier New", Courier, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('PRIME SIEVE', marginX + 2, 24);

    // speed indicator
    const speedLabels = ['SLOW', 'NORM', 'FAST'];
    const speedLabel = speedLabels[this._speedIdx];
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 11px "Courier New", Courier, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`[TAP] SPEED: ${speedLabel}`, W - marginX - 2, 24);

    // ── summary / legend below grid ────────────────────────────────────
    const legendY = startY + gridH + 10;
    if (legendY < safeH) {
      // legend swatches
      const swatches = [
        { color: '#ffd700', label: 'Prime' },
        { color: '#3a2020', label: 'Composite' },
        { color: '#00e5ff', label: 'Current' },
      ];
      let lx = marginX + 2;
      const ly = legendY + 8;
      ctx.font = '9px "Courier New", Courier, monospace';
      ctx.textBaseline = 'middle';
      for (const sw of swatches) {
        ctx.fillStyle = sw.color;
        ctx.fillRect(lx, ly - 4, 8, 8);
        ctx.fillStyle = '#888';
        ctx.textAlign = 'left';
        ctx.fillText(sw.label, lx + 11, ly);
        lx += sw.label.length * 6 + 22;
      }
    }

    // summary text
    if (this._showSummary && this._summaryText) {
      const sy = Math.min(safeH - 20, startY + gridH + 26);
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 13px "Courier New", Courier, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this._summaryText, W / 2, sy);

      ctx.fillStyle = '#555';
      ctx.font = '10px "Courier New", Courier, monospace';
      ctx.fillText('Restarting...', W / 2, sy + 16);
    }
  },
};
