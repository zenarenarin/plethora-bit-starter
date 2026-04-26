window.scrollerApp = {
  meta: {
    title: 'Inflation Timeline',
    author: 'plethora',
    description: 'Drag through time. Watch your money shrink.',
    tags: ['education'],
  },

  // ── CPI data (1983=100 baseline) ──────────────────────────────────────────
  _cpiData: [
    [1970, 38.8],
    [1975, 53.8],
    [1980, 82.4],
    [1985, 107.6],
    [1990, 130.7],
    [1995, 152.4],
    [2000, 172.2],
    [2005, 195.3],
    [2010, 218.1],
    [2015, 237.0],
    [2020, 258.8],
    [2024, 314.0],
  ],

  // ── Item prices per anchor year ────────────────────────────────────────────
  // Format: { year: price }
  _items: [
    {
      emoji: '🍞',
      label: 'Bread (loaf)',
      nowPrice: 4.50,
      anchors: [[1970,0.24],[1980,0.50],[1990,0.70],[2000,0.99],[2010,1.99],[2020,3.50],[2024,4.50]],
    },
    {
      emoji: '⛽',
      label: 'Gas (gallon)',
      nowPrice: 3.50,
      anchors: [[1970,0.36],[1980,1.19],[1990,1.16],[2000,1.51],[2010,2.79],[2020,2.17],[2024,3.50]],
    },
    {
      emoji: '🥛',
      label: 'Milk (gallon)',
      nowPrice: 4.20,
      anchors: [[1970,0.62],[1980,1.12],[1990,1.59],[2000,2.78],[2010,3.30],[2020,3.50],[2024,4.20]],
    },
    {
      emoji: '🏠',
      label: 'Avg Home',
      nowPrice: 420000,
      anchors: [[1970,23000],[1980,64600],[1990,122900],[2000,207000],[2010,272900],[2020,337000],[2024,420000]],
      isBig: true,
    },
    {
      emoji: '🎟️',
      label: 'Movie Ticket',
      nowPrice: 15.00,
      anchors: [[1970,1.55],[1980,2.69],[1990,4.23],[2000,5.39],[2010,7.89],[2020,9.16],[2024,15.00]],
    },
  ],

  _raf: null,
  _audioCtx: null,
  _animating: false,
  _animStart: null,
  _animDuration: 8000,
  _currentYear: 1970,
  _dragging: false,
  _sliderEl: null,
  _thumbEl: null,
  _trackEl: null,
  _yearEl: null,
  _powerEl: null,
  _itemEls: [],
  _container: null,
  _lastTickYear: null,

  // ── Interpolation helpers ─────────────────────────────────────────────────
  _lerp(anchors, year) {
    if (year <= anchors[0][0]) return anchors[0][1];
    if (year >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [y0, v0] = anchors[i];
      const [y1, v1] = anchors[i + 1];
      if (year >= y0 && year <= y1) {
        const t = (year - y0) / (y1 - y0);
        return v0 + t * (v1 - v0);
      }
    }
    return anchors[anchors.length - 1][1];
  },

  _getCPI(year) {
    return this._lerp(this._cpiData, year);
  },

  _getBuyingPower(year) {
    // how many dollars in 2024 = $100 in `year`
    return (314.0 / this._getCPI(year)) * 100;
  },

  _fmtPrice(val, isBig) {
    if (isBig) {
      if (val >= 1000000) return '$' + (val / 1000000).toFixed(2) + 'M';
      if (val >= 1000) return '$' + Math.round(val / 1000) + 'K';
    }
    return '$' + val.toFixed(2);
  },

  // ── Audio ─────────────────────────────────────────────────────────────────
  _initAudio() {
    if (this._audioCtx) return;
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { /* no audio */ }
  },

  _tick(year) {
    if (!this._audioCtx) return;
    try {
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      // pitch rises from 300 Hz (1970) to 900 Hz (2024)
      const t = (year - 1970) / (2024 - 1970);
      osc.frequency.value = 300 + t * 600;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) { /* ignore */ }
  },

  // ── DOM build ─────────────────────────────────────────────────────────────
  init(container) {
    this._container = container;
    this._dragging = false;
    this._animating = false;
    this._currentYear = 1970;
    this._lastTickYear = null;
    this._itemEls = [];

    container.style.cssText = `
      background: #050810;
      width: 100%; height: 100%;
      overflow: hidden;
      touch-action: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-sizing: border-box;
      padding: 0;
      position: relative;
    `;

    // ── Header ──
    const header = document.createElement('div');
    header.style.cssText = `
      width: 100%;
      text-align: center;
      padding: 28px 16px 4px;
      box-sizing: border-box;
    `;

    const headerLabel = document.createElement('div');
    headerLabel.style.cssText = `
      color: #8899bb;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 4px;
    `;
    headerLabel.textContent = 'WHAT $100 BOUGHT IN';

    const yearDisplay = document.createElement('div');
    yearDisplay.style.cssText = `
      color: #ffffff;
      font-size: 72px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -2px;
    `;
    yearDisplay.textContent = '1970';
    this._yearEl = yearDisplay;

    header.appendChild(headerLabel);
    header.appendChild(yearDisplay);
    container.appendChild(header);

    // ── Buying power ──
    const powerWrap = document.createElement('div');
    powerWrap.style.cssText = `
      width: 100%;
      text-align: center;
      padding: 6px 16px 8px;
      box-sizing: border-box;
    `;
    const powerEl = document.createElement('div');
    powerEl.style.cssText = `
      color: #f5c842;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.5px;
    `;
    this._powerEl = powerEl;
    powerWrap.appendChild(powerEl);
    container.appendChild(powerWrap);

    // ── Item cards ──
    const cardsWrap = document.createElement('div');
    cardsWrap.style.cssText = `
      width: 100%;
      padding: 0 12px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 7px;
      flex: 1;
      overflow: hidden;
    `;

    this._items.forEach((item) => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: #0d1424;
        border-radius: 12px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px solid #1a2540;
      `;

      const emojiEl = document.createElement('span');
      emojiEl.style.cssText = `font-size: 24px; flex-shrink: 0;`;
      emojiEl.textContent = item.emoji;

      const textCol = document.createElement('div');
      textCol.style.cssText = `flex: 1; min-width: 0;`;

      const labelEl = document.createElement('div');
      labelEl.style.cssText = `color: #6677aa; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;`;
      labelEl.textContent = item.label;

      const priceRow = document.createElement('div');
      priceRow.style.cssText = `display: flex; align-items: baseline; gap: 8px; margin-top: 2px;`;

      const pastPrice = document.createElement('span');
      pastPrice.style.cssText = `color: #556688; font-size: 16px; font-weight: 700;`;

      const arrow = document.createElement('span');
      arrow.style.cssText = `color: #334466; font-size: 13px;`;
      arrow.textContent = '→';

      const nowPrice = document.createElement('span');
      nowPrice.style.cssText = `color: #e8f0ff; font-size: 18px; font-weight: 800;`;
      nowPrice.textContent = this._fmtPrice(item.nowPrice, item.isBig);

      priceRow.appendChild(pastPrice);
      priceRow.appendChild(arrow);
      priceRow.appendChild(nowPrice);

      textCol.appendChild(labelEl);
      textCol.appendChild(priceRow);

      card.appendChild(emojiEl);
      card.appendChild(textCol);
      cardsWrap.appendChild(card);

      this._itemEls.push({ pastPrice, item });
    });

    container.appendChild(cardsWrap);

    // ── Slider area ── (bottom 12% safe zone)
    const sliderArea = document.createElement('div');
    sliderArea.style.cssText = `
      width: 100%;
      padding: 12px 24px 20px;
      box-sizing: border-box;
      position: relative;
    `;

    // Year range labels
    const rangeLabels = document.createElement('div');
    rangeLabels.style.cssText = `
      display: flex;
      justify-content: space-between;
      color: #446688;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 14px;
    `;
    rangeLabels.innerHTML = '<span>1970</span><span>2024</span>';

    // Track
    const track = document.createElement('div');
    track.style.cssText = `
      position: relative;
      height: 6px;
      background: #1a2540;
      border-radius: 3px;
      cursor: pointer;
    `;
    this._trackEl = track;

    // Fill
    const fill = document.createElement('div');
    fill.style.cssText = `
      position: absolute;
      left: 0; top: 0; bottom: 0;
      background: linear-gradient(90deg, #1a4a8a, #f5c842);
      border-radius: 3px;
      width: 0%;
      pointer-events: none;
    `;
    this._fillEl = fill;

    // Thumb
    const thumb = document.createElement('div');
    thumb.style.cssText = `
      position: absolute;
      top: 50%;
      left: 0%;
      transform: translate(-50%, -50%);
      width: 28px;
      height: 28px;
      background: #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.6);
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    this._thumbEl = thumb;

    // Year label above thumb
    const thumbLabel = document.createElement('div');
    thumbLabel.style.cssText = `
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #f5c842;
      color: #000;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
    `;
    thumbLabel.textContent = '1970';
    this._thumbLabelEl = thumbLabel;
    thumb.appendChild(thumbLabel);

    track.appendChild(fill);
    track.appendChild(thumb);
    sliderArea.appendChild(rangeLabels);
    sliderArea.appendChild(track);
    container.appendChild(sliderArea);

    // ── Drag logic ──
    const getYearFromEvent = (e) => {
      const rect = track.getBoundingClientRect();
      const clientX = e.touches ? e.changedTouches[0].clientX : e.clientX;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(1970 + pct * (2024 - 1970));
    };

    const onStart = (e) => {
      this._initAudio();
      this._dragging = true;
      this._animating = false;
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
      const year = getYearFromEvent(e);
      this._setYear(year);
    };

    const onMove = (e) => {
      if (!this._dragging) return;
      e.preventDefault();
      const year = getYearFromEvent(e);
      this._setYear(year);
    };

    const onEnd = () => { this._dragging = false; };

    track.addEventListener('pointerdown', this._onTrackDown = (e) => { onStart(e); track.setPointerCapture(e.pointerId); });
    track.addEventListener('pointermove', this._onTrackMove = (e) => { onMove(e); });
    track.addEventListener('pointerup', this._onTrackUp = onEnd);
    track.addEventListener('pointercancel', this._onTrackCancel = onEnd);

    track.addEventListener('touchstart', this._onTouchStart = (e) => { onStart(e); }, { passive: true });
    track.addEventListener('touchmove', this._onTouchMove = (e) => { onMove(e); }, { passive: false });
    track.addEventListener('touchend', this._onTouchEnd = onEnd, { passive: true });

    // First touch anywhere → init audio
    container.addEventListener('pointerdown', this._onContainerDown = () => { this._initAudio(); }, { once: true });

    // Initial render
    this._setYear(1970);

    // Start auto-animation
    this._startAnimation();
  },

  _setYear(year) {
    year = Math.round(Math.max(1970, Math.min(2024, year)));
    this._currentYear = year;

    const pct = (year - 1970) / (2024 - 1970);

    // Update slider
    if (this._thumbEl) this._thumbEl.style.left = (pct * 100) + '%';
    if (this._fillEl) this._fillEl.style.width = (pct * 100) + '%';
    if (this._thumbLabelEl) this._thumbLabelEl.textContent = year;

    // Update year display
    if (this._yearEl) this._yearEl.textContent = year;

    // Update buying power
    const power = this._getBuyingPower(year);
    if (this._powerEl) {
      this._powerEl.textContent = `Today you'd need $${Math.round(power)} to match $100 in ${year}`;
    }

    // Update item prices
    this._itemEls.forEach(({ pastPrice, item }) => {
      const val = this._lerp(item.anchors, year);
      pastPrice.textContent = this._fmtPrice(val, item.isBig);
    });

    // Tick every 5 years
    const tickYear = Math.round(year / 5) * 5;
    if (tickYear !== this._lastTickYear) {
      this._lastTickYear = tickYear;
      if (this._audioCtx) this._tick(year);
    }
  },

  _startAnimation() {
    this._animating = true;
    this._animStart = performance.now();

    const step = (now) => {
      if (!this._animating) return;
      const elapsed = now - this._animStart;
      const t = Math.min(1, elapsed / this._animDuration);
      // ease in-out cubic
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const year = Math.round(1970 + ease * (2024 - 1970));
      this._setYear(year);
      if (t < 1) {
        this._raf = requestAnimationFrame(step);
      } else {
        this._animating = false;
        this._raf = null;
      }
    };

    this._raf = requestAnimationFrame(step);
  },

  destroy() {
    this._animating = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }

    if (this._trackEl) {
      this._trackEl.removeEventListener('pointerdown', this._onTrackDown);
      this._trackEl.removeEventListener('pointermove', this._onTrackMove);
      this._trackEl.removeEventListener('pointerup', this._onTrackUp);
      this._trackEl.removeEventListener('pointercancel', this._onTrackCancel);
      this._trackEl.removeEventListener('touchstart', this._onTouchStart);
      this._trackEl.removeEventListener('touchmove', this._onTouchMove);
      this._trackEl.removeEventListener('touchend', this._onTouchEnd);
    }

    if (this._container) {
      this._container.removeEventListener('pointerdown', this._onContainerDown);
    }

    if (this._audioCtx) {
      this._audioCtx.close();
      this._audioCtx = null;
    }

    this._trackEl = null;
    this._thumbEl = null;
    this._fillEl = null;
    this._thumbLabelEl = null;
    this._yearEl = null;
    this._powerEl = null;
    this._itemEls = [];
    this._container = null;
  },
};
