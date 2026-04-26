window.scrollerApp = {
  meta: {
    title: 'Credit Card Spiral',
    author: 'plethora',
    description: 'See exactly how minimum payments trap you.',
    tags: ['education'],
  },

  init(container) {
    this._destroyed = false;

    // --- Container setup ---
    container.style.touchAction = 'none';
    container.style.overflow = 'hidden';
    container.style.background = '#0a0005';
    container.style.fontFamily = "'Helvetica Neue', Arial, sans-serif";
    container.style.userSelect = 'none';
    container.style.webkitUserSelect = 'none';

    const W = container.clientWidth;
    const H = container.clientHeight;
    const safeH = H * 0.88; // bottom 12% safe zone

    this._W = W;
    this._H = H;
    this._safeH = safeH;

    // --- State ---
    this._balance = 5000;
    this._apr = 24;
    this._audioCtx = null;
    this._humOscillator = null;
    this._humGain = null;
    this._audioReady = false;
    this._animTimer = null;
    this._animStep = 0;
    this._calendarData = [];
    this._calcResult = null;

    // --- Build DOM ---
    const root = document.createElement('div');
    root.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: ${W}px;
      height: ${safeH}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-sizing: border-box;
      padding: ${H * 0.025}px ${W * 0.05}px ${H * 0.015}px;
      gap: ${H * 0.012}px;
    `;
    container.appendChild(root);
    this._root = root;

    // Header
    const header = document.createElement('div');
    header.textContent = 'Credit Card Debt';
    header.style.cssText = `
      color: #ff3355;
      font-size: ${Math.min(W * 0.065, 26)}px;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: center;
      flex-shrink: 0;
    `;
    root.appendChild(header);

    // Controls row
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = `
      display: flex;
      gap: ${W * 0.04}px;
      width: 100%;
      flex-shrink: 0;
    `;
    root.appendChild(controlsRow);

    // Balance control
    const balanceCtrl = this._makeControl(
      'Balance',
      () => '$' + this._balance.toLocaleString(),
      () => { this._balance = Math.min(20000, this._balance + 500); this._onChange(); },
      () => { this._balance = Math.max(1000, this._balance - 500); this._onChange(); },
      W, H
    );
    this._balanceLabel = balanceCtrl.label;
    controlsRow.appendChild(balanceCtrl.el);

    // APR control
    const aprCtrl = this._makeControl(
      'APR',
      () => this._apr + '%',
      () => { this._apr = Math.min(36, this._apr + 1); this._onChange(); },
      () => { this._apr = Math.max(12, this._apr - 1); this._onChange(); },
      W, H
    );
    this._aprLabel = aprCtrl.label;
    controlsRow.appendChild(aprCtrl.el);

    // Results area
    const results = document.createElement('div');
    results.style.cssText = `
      width: 100%;
      background: rgba(255,255,255,0.04);
      border-radius: ${W * 0.03}px;
      padding: ${H * 0.012}px ${W * 0.04}px;
      flex-shrink: 0;
      box-sizing: border-box;
    `;
    root.appendChild(results);
    this._resultsEl = results;

    const makeResultLine = (emoji, id) => {
      const line = document.createElement('div');
      line.style.cssText = `
        color: #fff;
        font-size: ${Math.min(W * 0.042, 17)}px;
        font-weight: 700;
        line-height: 1.55;
        white-space: nowrap;
      `;
      line.innerHTML = emoji + ' <span id="res_' + id + '">—</span>';
      results.appendChild(line);
      return document.getElementById('res_' + id) || line.querySelector('span');
    };

    this._resTime = makeResultLine('⏱', 'time');
    this._resInterest = makeResultLine('💸', 'interest');
    this._resTotal = makeResultLine('💀', 'total');

    // Calendar canvas
    const calCanvas = document.createElement('canvas');
    const calH = Math.round(safeH * 0.30);
    const calW = W - W * 0.1;
    const dpr = window.devicePixelRatio || 1;
    calCanvas.width = calW * dpr;
    calCanvas.height = calH * dpr;
    calCanvas.style.cssText = `
      width: ${calW}px;
      height: ${calH}px;
      border-radius: ${W * 0.02}px;
      flex-shrink: 0;
    `;
    root.appendChild(calCanvas);
    this._calCanvas = calCanvas;
    this._calCtx = calCanvas.getContext('2d');
    this._calCtx.scale(dpr, dpr);
    this._calW = calW;
    this._calH = calH;

    // Bar chart
    const barWrap = document.createElement('div');
    barWrap.style.cssText = `
      width: 100%;
      flex-shrink: 0;
    `;
    root.appendChild(barWrap);

    const barLabel = document.createElement('div');
    barLabel.style.cssText = `
      display: flex;
      justify-content: space-between;
      color: rgba(255,255,255,0.5);
      font-size: ${Math.min(W * 0.03, 12)}px;
      margin-bottom: ${H * 0.004}px;
    `;
    barLabel.innerHTML = '<span style="color:#4ade80">■ Principal</span><span style="color:#ff3355">■ Interest</span>';
    barWrap.appendChild(barLabel);

    const barTrack = document.createElement('div');
    barTrack.style.cssText = `
      width: 100%;
      height: ${H * 0.022}px;
      background: rgba(255,255,255,0.08);
      border-radius: 999px;
      overflow: hidden;
      display: flex;
    `;
    barWrap.appendChild(barTrack);

    const barPrincipal = document.createElement('div');
    barPrincipal.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #22c55e, #4ade80);
      border-radius: 999px 0 0 999px;
      transition: width 0.3s ease;
      width: 50%;
    `;
    barTrack.appendChild(barPrincipal);

    const barInterest = document.createElement('div');
    barInterest.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #dc2626, #ff3355);
      flex: 1;
    `;
    barTrack.appendChild(barInterest);

    this._barPrincipal = barPrincipal;
    this._barInterest = barInterest;

    // Bar % labels
    const barPct = document.createElement('div');
    barPct.style.cssText = `
      display: flex;
      justify-content: space-between;
      color: rgba(255,255,255,0.4);
      font-size: ${Math.min(W * 0.028, 11)}px;
      margin-top: ${H * 0.003}px;
    `;
    barWrap.appendChild(barPct);
    this._barPctEl = barPct;

    // --- First touch to enable audio ---
    this._onFirstTouch = () => this._initAudio();
    container.addEventListener('pointerdown', this._onFirstTouch, { once: true });

    // Prevent scroll bleed
    this._onTouchMove = (e) => e.preventDefault();
    container.addEventListener('touchmove', this._onTouchMove, { passive: false });
    container.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    this._container = container;

    // Initial calc + animate
    this._recalc();
    this._startAnimation();
  },

  // --- Control widget builder ---
  _makeControl(labelText, getValue, onPlus, onMinus, W, H) {
    const el = document.createElement('div');
    el.style.cssText = `
      flex: 1;
      background: rgba(255,255,255,0.06);
      border-radius: ${W * 0.03}px;
      padding: ${H * 0.01}px ${W * 0.02}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: ${H * 0.005}px;
      box-sizing: border-box;
    `;

    const lbl = document.createElement('div');
    lbl.textContent = labelText;
    lbl.style.cssText = `
      color: rgba(255,255,255,0.45);
      font-size: ${Math.min(W * 0.03, 12)}px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    `;
    el.appendChild(lbl);

    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: ${W * 0.02}px;
    `;
    el.appendChild(row);

    const btnStyle = `
      width: ${Math.min(W * 0.08, 34)}px;
      height: ${Math.min(W * 0.08, 34)}px;
      border-radius: 50%;
      background: rgba(255,255,255,0.1);
      color: #fff;
      font-size: ${Math.min(W * 0.055, 22)}px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border: none;
      outline: none;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    `;

    const btnMinus = document.createElement('button');
    btnMinus.textContent = '−';
    btnMinus.style.cssText = btnStyle;
    row.appendChild(btnMinus);

    const valEl = document.createElement('div');
    valEl.textContent = getValue();
    valEl.style.cssText = `
      color: #fff;
      font-size: ${Math.min(W * 0.052, 20)}px;
      font-weight: 800;
      min-width: ${W * 0.18}px;
      text-align: center;
    `;
    row.appendChild(valEl);

    const btnPlus = document.createElement('button');
    btnPlus.textContent = '+';
    btnPlus.style.cssText = btnStyle;
    row.appendChild(btnPlus);

    // Touch/click handlers with active feedback
    const makeHandler = (btn, action) => {
      const activate = () => { btn.style.background = 'rgba(255,255,255,0.25)'; };
      const deactivate = () => { btn.style.background = 'rgba(255,255,255,0.1)'; };

      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        activate();
        action();
        valEl.textContent = getValue();
      });
      btn.addEventListener('pointerup', deactivate);
      btn.addEventListener('pointerleave', deactivate);
    };

    makeHandler(btnMinus, onMinus);
    makeHandler(btnPlus, onPlus);

    return { el, label: valEl };
  },

  // --- Math ---
  _recalc() {
    let balance = this._balance;
    const monthlyRate = this._apr / 100 / 12;
    let totalInterest = 0;
    let months = 0;
    const MAX_MONTHS = 600; // safety cap

    while (balance > 0 && months < MAX_MONTHS) {
      const interest = balance * monthlyRate;
      let payment = Math.max(balance * 0.02, 25);
      if (payment > balance + interest) payment = balance + interest;
      totalInterest += interest;
      balance -= (payment - interest);
      if (balance < 0.005) balance = 0;
      months++;
    }

    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    const totalPaid = this._balance + totalInterest;

    this._calcResult = { months, years, remMonths, totalInterest, totalPaid };

    // Update result lines
    let timeStr = '';
    if (years > 0 && remMonths > 0) timeStr = `${years} yr${years > 1 ? 's' : ''} ${remMonths} mo to pay off`;
    else if (years > 0) timeStr = `${years} year${years > 1 ? 's' : ''} to pay off`;
    else timeStr = `${remMonths} month${remMonths > 1 ? 's' : ''} to pay off`;

    this._resTime.textContent = timeStr;
    this._resInterest.textContent = '$' + Math.round(totalInterest).toLocaleString() + ' total interest paid';
    this._resTotal.textContent = `You paid $${Math.round(totalPaid).toLocaleString()} for $${this._balance.toLocaleString()} of stuff`;

    // Update bar
    const principalPct = (this._balance / totalPaid) * 100;
    const interestPct = 100 - principalPct;
    this._barPrincipal.style.width = principalPct.toFixed(1) + '%';
    this._barPctEl.innerHTML =
      `<span style="color:#4ade80">${Math.round(principalPct)}% principal</span>` +
      `<span style="color:#ff3355">${Math.round(interestPct)}% interest</span>`;

    // Build calendar data (cap at 120 squares + overflow flag)
    const MAX_CELLS = 120;
    const displayMonths = Math.min(months, MAX_CELLS);
    this._calendarData = { displayMonths, totalMonths: months };

    // Update hum pitch if audio ready
    if (this._audioReady) this._updateHum();
  },

  // --- Calendar drawing ---
  _drawCalendar(filledCount) {
    const ctx = this._calCtx;
    const W = this._calW;
    const H = this._calH;
    const { displayMonths, totalMonths } = this._calendarData;

    ctx.clearRect(0, 0, W, H);

    if (displayMonths === 0) return;

    const COLS = 12; // months per row = 1 year per row
    const rows = Math.ceil(displayMonths / COLS);
    const hasMore = totalMonths > 120;

    // Reserve space for "..." label if needed
    const labelH = hasMore ? H * 0.12 : 0;
    const gridH = H - labelH - H * 0.05;

    const cellSize = Math.min(
      Math.floor((W - W * 0.04) / COLS),
      Math.floor((gridH) / rows)
    );
    const gap = Math.max(1, Math.floor(cellSize * 0.12));
    const cellInner = cellSize - gap;
    const totalGridW = COLS * cellSize;
    const totalGridH = rows * cellSize;
    const offsetX = (W - totalGridW) / 2;
    const offsetY = (gridH - totalGridH) / 2;

    for (let i = 0; i < displayMonths; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = offsetX + col * cellSize + gap / 2;
      const y = offsetY + row * cellSize + gap / 2;

      const t = i / (displayMonths - 1 || 1); // 0 = first month, 1 = last

      if (i < filledCount) {
        // Color: green -> yellow -> orange -> deep red
        let r, g, b;
        if (t < 0.33) {
          const s = t / 0.33;
          r = Math.round(34 + (200 - 34) * s);
          g = Math.round(197 + (160 - 197) * s);
          b = Math.round(94 + (20 - 94) * s);
        } else if (t < 0.66) {
          const s = (t - 0.33) / 0.33;
          r = Math.round(200 + (230 - 200) * s);
          g = Math.round(160 + (60 - 160) * s);
          b = Math.round(20 + (10 - 20) * s);
        } else {
          const s = (t - 0.66) / 0.34;
          r = Math.round(230 + (139 - 230) * s);
          g = Math.round(60 * (1 - s));
          b = Math.round(10 * (1 - s));
        }
        ctx.fillStyle = `rgb(${r},${g},${b})`;

        // Slight glow on recent cell
        if (i === filledCount - 1) {
          ctx.shadowColor = `rgb(${r},${g},${b})`;
          ctx.shadowBlur = cellInner * 1.5;
        } else {
          ctx.shadowBlur = 0;
        }
      } else {
        // Unfilled: dim outline
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
      }

      const radius = Math.max(1, cellInner * 0.2);
      this._roundRect(ctx, x, y, cellInner, cellInner, radius);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // Draw year labels on left edge (every row = 1 year)
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `${Math.max(8, cellSize * 0.38)}px Helvetica Neue, Arial, sans-serif`;
    ctx.textAlign = 'right';
    for (let row = 0; row < rows; row++) {
      const y = offsetY + row * cellSize + cellSize / 2 + 3;
      if (offsetX > 6) {
        ctx.fillText('Y' + (row + 1), offsetX - gap - 1, y);
      }
    }

    // "..." label if truncated
    if (hasMore) {
      const extraYears = Math.ceil((totalMonths - 120) / 12);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,80,80,0.7)';
      ctx.font = `bold ${Math.max(10, H * 0.1)}px Helvetica Neue, Arial, sans-serif`;
      ctx.fillText(`+ ${extraYears} more year${extraYears > 1 ? 's' : ''}…`, W / 2, H - labelH * 0.1);
    }
  },

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  // --- Animation ---
  _startAnimation() {
    this._cancelAnimation();
    const total = this._calendarData.displayMonths;
    let step = 0;

    const tick = () => {
      if (this._destroyed) return;
      this._drawCalendar(step);
      if (step < total) {
        this._playTick(step, total);
        step++;
        this._animTimer = setTimeout(tick, 30);
      }
    };

    this._animTimer = setTimeout(tick, 50);
  },

  _cancelAnimation() {
    if (this._animTimer) {
      clearTimeout(this._animTimer);
      this._animTimer = null;
    }
  },

  // --- Value change handler ---
  _onChange() {
    // Update displayed labels
    this._balanceLabel.textContent = '$' + this._balance.toLocaleString();
    this._aprLabel.textContent = this._apr + '%';
    this._cancelAnimation();
    this._recalc();
    this._startAnimation();
  },

  // --- Audio ---
  _initAudio() {
    if (this._audioReady || this._destroyed) return;
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Master gain
      this._masterGain = this._audioCtx.createGain();
      this._masterGain.gain.setValueAtTime(0.0, this._audioCtx.currentTime);
      this._masterGain.connect(this._audioCtx.destination);

      // Ominous hum: two oscillators slightly detuned
      this._humOsc1 = this._audioCtx.createOscillator();
      this._humOsc1.type = 'sine';
      this._humGain1 = this._audioCtx.createGain();
      this._humGain1.gain.setValueAtTime(0.18, this._audioCtx.currentTime);
      this._humOsc1.connect(this._humGain1);
      this._humGain1.connect(this._masterGain);
      this._humOsc1.start();

      this._humOsc2 = this._audioCtx.createOscillator();
      this._humOsc2.type = 'sine';
      this._humGain2 = this._audioCtx.createGain();
      this._humGain2.gain.setValueAtTime(0.10, this._audioCtx.currentTime);
      this._humOsc2.connect(this._humGain2);
      this._humGain2.connect(this._masterGain);
      this._humOsc2.start();

      // Low sub rumble
      this._humOsc3 = this._audioCtx.createOscillator();
      this._humOsc3.type = 'triangle';
      this._humGain3 = this._audioCtx.createGain();
      this._humGain3.gain.setValueAtTime(0.07, this._audioCtx.currentTime);
      this._humOsc3.connect(this._humGain3);
      this._humGain3.connect(this._masterGain);
      this._humOsc3.start();

      this._audioReady = true;
      this._updateHum();

      // Fade hum in
      this._masterGain.gain.linearRampToValueAtTime(1.0, this._audioCtx.currentTime + 1.5);

    } catch (e) {
      // Audio not available — silent mode
    }
  },

  _updateHum() {
    if (!this._audioReady || !this._calcResult) return;
    const { totalInterest } = this._calcResult;

    // Map interest $0–$20000 → frequency 40–140 Hz
    const t = Math.min(totalInterest / 20000, 1);
    const baseFreq = 40 + t * 100;

    const now = this._audioCtx.currentTime;
    this._humOsc1.frequency.linearRampToValueAtTime(baseFreq, now + 0.5);
    this._humOsc2.frequency.linearRampToValueAtTime(baseFreq * 1.005, now + 0.5); // slight detune
    this._humOsc3.frequency.linearRampToValueAtTime(baseFreq * 0.5, now + 0.5);   // sub octave
  },

  _playTick(stepIndex, totalSteps) {
    if (!this._audioReady) return;
    try {
      const ctx = this._audioCtx;
      const t = stepIndex / (totalSteps - 1 || 1);

      // Tick: short sine burst
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';

      // Pitch rises with time: 800Hz early, 300Hz late (more ominous)
      osc.frequency.setValueAtTime(800 - t * 500, ctx.currentTime);

      gain.gain.setValueAtTime(0.0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(this._masterGain);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.07);

      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch (e) {}
  },

  // --- Destroy ---
  destroy() {
    this._destroyed = true;
    this._cancelAnimation();

    if (this._audioReady) {
      try {
        this._masterGain.gain.linearRampToValueAtTime(0, this._audioCtx.currentTime + 0.3);
        setTimeout(() => {
          try {
            this._humOsc1 && this._humOsc1.stop();
            this._humOsc2 && this._humOsc2.stop();
            this._humOsc3 && this._humOsc3.stop();
            this._audioCtx && this._audioCtx.close();
          } catch (e) {}
        }, 350);
      } catch (e) {}
    }

    if (this._container) {
      this._container.removeEventListener('pointerdown', this._onFirstTouch);
      this._container.removeEventListener('touchmove', this._onTouchMove);
    }

    this._humOsc1 = null;
    this._humOsc2 = null;
    this._humOsc3 = null;
    this._masterGain = null;
    this._audioCtx = null;
    this._calCtx = null;
    this._root = null;
    this._container = null;
  },
};
