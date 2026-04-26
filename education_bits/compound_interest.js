window.scrollerApp = {
  meta: {
    title: 'Compound Interest',
    author: 'plethora',
    description: 'The gap will shock you.',
    tags: ['education'],
  },

  // Internal state
  _raf: null,
  _autoTimer: null,
  _audioCtx: null,
  _userControlled: false,
  _currentYear: 0,
  _autoStartTime: null,
  _thresholdsHit: null,
  _sliderEl: null,
  _yearEl: null,
  _investBar: null,
  _savingsBar: null,
  _investAmt: null,
  _savingsAmt: null,
  _gapEl: null,
  _onSliderInput: null,
  _onSliderTouch: null,
  _onFirstTouch: null,
  _container: null,

  init(container) {
    this._container = container;
    this._userControlled = false;
    this._currentYear = 0;
    this._autoStartTime = null;
    this._thresholdsHit = new Set();

    container.style.touchAction = 'none';
    container.style.overflow = 'hidden';
    container.style.userSelect = 'none';
    container.style.webkitUserSelect = 'none';

    // ── Layout ─────────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.style.cssText = `
      position: absolute; inset: 0;
      background: #050510;
      display: flex; flex-direction: column;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #fff;
      padding: 0 16px;
      box-sizing: border-box;
    `;
    container.appendChild(root);

    // 1. Title
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `
      margin-top: 28px;
      font-size: 13px;
      color: #8899bb;
      letter-spacing: 0.04em;
      text-align: center;
    `;
    titleEl.textContent = 'What happens to $10,000 over time';
    root.appendChild(titleEl);

    // 2. Year display
    const yearEl = document.createElement('div');
    yearEl.style.cssText = `
      margin-top: 10px;
      font-size: 52px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -1px;
      color: #fff;
      min-height: 56px;
      text-align: center;
    `;
    yearEl.textContent = 'Year 0';
    this._yearEl = yearEl;
    root.appendChild(yearEl);

    // 3. Two columns
    const cols = document.createElement('div');
    cols.style.cssText = `
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: flex-end;
      gap: 24px;
      flex: 1;
      width: 100%;
      max-width: 360px;
      margin-top: 12px;
      padding-bottom: 8px;
    `;
    root.appendChild(cols);

    const makeCol = (label, colorHex, barId, amtId) => {
      const col = document.createElement('div');
      col.style.cssText = `
        display: flex; flex-direction: column;
        align-items: center;
        flex: 1;
        height: 100%;
      `;

      const colLabel = document.createElement('div');
      colLabel.style.cssText = `
        font-size: 12px;
        color: #aab;
        text-align: center;
        margin-bottom: 6px;
        line-height: 1.3;
      `;
      colLabel.textContent = label;
      col.appendChild(colLabel);

      const barWrap = document.createElement('div');
      barWrap.style.cssText = `
        flex: 1;
        width: 80%;
        max-width: 110px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        border-radius: 4px;
        overflow: hidden;
        background: rgba(255,255,255,0.05);
      `;

      const bar = document.createElement('div');
      bar.id = barId;
      bar.style.cssText = `
        width: 100%;
        height: 0%;
        border-radius: 4px 4px 0 0;
        background: ${colorHex};
        transition: height 0.08s linear;
        position: relative;
      `;
      barWrap.appendChild(bar);
      col.appendChild(barWrap);

      const amt = document.createElement('div');
      amt.id = amtId;
      amt.style.cssText = `
        margin-top: 8px;
        font-size: 18px;
        font-weight: 700;
        color: ${colorHex};
        text-align: center;
        min-height: 24px;
      `;
      amt.textContent = '$10,000';
      col.appendChild(amt);

      return { col, bar, amt };
    };

    const invest = makeCol('Invested\n@ 7%', '#2ecc71', 'invest-bar', 'invest-amt');
    const savings = makeCol('Savings\n@ 0.5%', '#5dade2', 'savings-bar', 'savings-amt');

    invest.col.querySelector('div').style.whiteSpace = 'pre';
    savings.col.querySelector('div').style.whiteSpace = 'pre';

    cols.appendChild(invest.col);
    cols.appendChild(savings.col);

    this._investBar = invest.bar;
    this._savingsBar = savings.bar;
    this._investAmt = invest.amt;
    this._savingsAmt = savings.amt;

    // 4. Gap label
    const gapEl = document.createElement('div');
    gapEl.style.cssText = `
      font-size: 18px;
      font-weight: 800;
      color: #f0c040;
      text-align: center;
      margin-bottom: 10px;
      min-height: 28px;
      letter-spacing: 0.01em;
    `;
    gapEl.textContent = '📈 Difference: $0';
    this._gapEl = gapEl;
    root.appendChild(gapEl);

    // 5. Slider
    const sliderWrap = document.createElement('div');
    sliderWrap.style.cssText = `
      width: 100%;
      max-width: 360px;
      padding: 0 8px;
      box-sizing: border-box;
      margin-bottom: calc(12% + 10px);
    `;

    const sliderLabels = document.createElement('div');
    sliderLabels.style.cssText = `
      display: flex; justify-content: space-between;
      font-size: 11px; color: #556; margin-bottom: 4px;
    `;
    sliderLabels.innerHTML = '<span>Year 0</span><span>Year 40</span>';
    sliderWrap.appendChild(sliderLabels);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '40';
    slider.step = '1';
    slider.value = '0';
    slider.style.cssText = `
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: #1a1a2e;
      outline: none;
      cursor: pointer;
      touch-action: none;
    `;

    // Inject slider thumb style
    if (!document.getElementById('ci-slider-style')) {
      const style = document.createElement('style');
      style.id = 'ci-slider-style';
      style.textContent = `
        #ci-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 26px; height: 26px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          cursor: pointer;
        }
        #ci-slider::-moz-range-thumb {
          width: 26px; height: 26px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          cursor: pointer;
          border: none;
        }
      `;
      document.head.appendChild(style);
    }
    slider.id = 'ci-slider';
    this._sliderEl = slider;
    sliderWrap.appendChild(slider);
    root.appendChild(sliderWrap);

    // ── Event listeners ────────────────────────────────────────────────────

    // Init audio on first touch anywhere
    this._onFirstTouch = () => {
      this._initAudio();
    };
    container.addEventListener('pointerdown', this._onFirstTouch, { once: true });

    // Slider input (mouse / programmatic)
    this._onSliderInput = (e) => {
      this._userControlled = true;
      this._currentYear = parseInt(slider.value, 10);
      this._render(this._currentYear);
    };
    slider.addEventListener('input', this._onSliderInput);

    // Touch on slider — prevent scroll, handle drag
    this._onSliderTouch = (e) => {
      e.preventDefault();
      this._userControlled = true;
      const touch = e.changedTouches[0];
      const rect = slider.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (touch.clientX - rect.left) / rect.width));
      const yr = Math.round(ratio * 40);
      slider.value = yr;
      this._currentYear = yr;
      this._render(yr);
    };
    slider.addEventListener('touchstart', this._onSliderTouch, { passive: false });
    slider.addEventListener('touchmove', this._onSliderTouch, { passive: false });

    // ── Start auto-animation ───────────────────────────────────────────────
    this._render(0);
    this._startAutoAnimate();
  },

  _initAudio() {
    if (this._audioCtx) return;
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (err) {
      // audio not available
    }
  },

  _playChaChingAt(audioCtx, time) {
    // Short harmonic burst: fundamental + 3 harmonics
    const harmonics = [523.25, 1046.5, 1568, 2093]; // C5, C6, G6, C7
    harmonics.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.18 / (i + 1), time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
      osc.start(time);
      osc.stop(time + 0.3);
    });
  },

  _maybePlaySound(gap) {
    if (!this._audioCtx) return;
    const thresholds = [10000, 50000, 100000];
    thresholds.forEach(t => {
      if (gap >= t && !this._thresholdsHit.has(t)) {
        this._thresholdsHit.add(t);
        try {
          this._audioCtx.resume().then(() => {
            this._playChaChingAt(this._audioCtx, this._audioCtx.currentTime + 0.02);
          });
        } catch (e) {
          // ignore
        }
      }
    });
  },

  _startAutoAnimate() {
    const DURATION_MS = 6000;
    this._autoStartTime = performance.now();

    const tick = (now) => {
      if (this._userControlled) return;

      const elapsed = now - this._autoStartTime;
      const t = Math.min(1, elapsed / DURATION_MS);
      // Ease-out cubic for more drama at the end
      const eased = 1 - Math.pow(1 - t, 3);
      const yr = Math.round(eased * 40);

      this._currentYear = yr;
      if (this._sliderEl) this._sliderEl.value = yr;
      this._render(yr);

      if (t < 1) {
        this._raf = requestAnimationFrame(tick);
      }
      // After t=1, hold at 40 — no more frames needed
    };

    this._raf = requestAnimationFrame(tick);
  },

  _fmt(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  },

  _render(year) {
    const invested = 10000 * Math.pow(1.07, year);
    const savedAmt = 10000 * Math.pow(1.005, year);
    const gap = invested - savedAmt;

    // Update text
    if (this._yearEl) this._yearEl.textContent = `Year ${year}`;
    if (this._investAmt) this._investAmt.textContent = this._fmt(invested);
    if (this._savingsAmt) this._savingsAmt.textContent = this._fmt(savedAmt);
    if (this._gapEl) this._gapEl.textContent = `📈 Difference: ${this._fmt(gap)}`;

    // Bar heights: max invested at year 40 = 80% height
    const maxInvest = 10000 * Math.pow(1.07, 40); // ~149745
    const investPct = (invested / maxInvest) * 80;
    const savingsPct = (savedAmt / maxInvest) * 80;

    if (this._investBar) this._investBar.style.height = investPct + '%';
    if (this._savingsBar) this._savingsBar.style.height = Math.max(1, savingsPct) + '%';

    // Sound check
    this._maybePlaySound(gap);
  },

  destroy() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
    if (this._audioCtx) {
      try { this._audioCtx.close(); } catch (e) {}
      this._audioCtx = null;
    }

    const slider = this._sliderEl;
    if (slider) {
      if (this._onSliderInput) slider.removeEventListener('input', this._onSliderInput);
      if (this._onSliderTouch) {
        slider.removeEventListener('touchstart', this._onSliderTouch);
        slider.removeEventListener('touchmove', this._onSliderTouch);
      }
    }

    const container = this._container;
    if (container && this._onFirstTouch) {
      container.removeEventListener('pointerdown', this._onFirstTouch);
    }

    // Remove injected style
    const styleEl = document.getElementById('ci-slider-style');
    if (styleEl) styleEl.remove();

    // Reset state refs
    this._sliderEl = null;
    this._yearEl = null;
    this._investBar = null;
    this._savingsBar = null;
    this._investAmt = null;
    this._savingsAmt = null;
    this._gapEl = null;
    this._onSliderInput = null;
    this._onSliderTouch = null;
    this._onFirstTouch = null;
    this._container = null;
    this._thresholdsHit = null;
    this._userControlled = false;
    this._currentYear = 0;
  },
};
