window.scrollerApp = {
  meta: {
    title: 'Fourier Mixer',
    author: 'plethora',
    description: 'Build any sound from sine waves.',
    tags: ['education'],
  },

  // --- internal state ---
  _raf: null,
  _audioCtx: null,
  _oscillators: null,
  _gainNodes: null,
  _masterGain: null,
  _audioReady: false,
  _amplitudes: [1, 0.5, 0.33, 0.25, 0.2], // start with sawtooth preset
  _phase: 0,
  _canvas: null,
  _ctx: null,
  _sliderState: null,  // [{track el, thumb el, label el}]
  _activeSlider: null, // {index, startX, startAmp}
  _presetIndex: 0,
  _presetName: '',
  _presetTimer: 0,
  _presetBtn: null,
  _container: null,

  // pointer/touch listeners stored for cleanup
  _onPointerDown: null,
  _onPointerMove: null,
  _onPointerUp: null,
  _onTouchMove: null,
  _onFirstTouch: null,
  _onPresetClick: null,

  // harmonic base frequencies (Hz)
  _baseFreqs: [110, 220, 330, 440, 550],

  // dim colors per harmonic
  _harmColors: [
    'rgba(255, 80,  80,  0.45)',
    'rgba(255, 180, 60,  0.45)',
    'rgba(100, 220, 100, 0.45)',
    'rgba(80,  160, 255, 0.45)',
    'rgba(200, 100, 255, 0.45)',
  ],

  _presets: [
    { name: 'Sawtooth', amps: [1, 0.5, 0.33, 0.25, 0.2] },
    { name: 'Square',   amps: [1, 0,   0.33, 0,    0.2] },
    { name: 'Pure Sine',amps: [1, 0,   0,    0,    0  ] },
  ],

  // -------------------------------------------------------
  init(container) {
    this._container = container;
    this._amplitudes = [...this._presets[this._presetIndex].amps];
    this._phase = 0;
    this._audioReady = false;
    this._activeSlider = null;
    this._presetName = '';
    this._presetTimer = 0;

    container.style.background = '#050510';
    container.style.touchAction = 'none';
    container.style.overflow = 'hidden';
    container.style.userSelect = 'none';
    container.style.webkitUserSelect = 'none';

    const W = container.clientWidth;
    const H = container.clientHeight;

    // --- Canvas (top 60%) ---
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = Math.floor(H * 0.60);
    canvas.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 60%;
      display: block;
    `;
    container.appendChild(canvas);
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');

    // --- Slider panel (bottom 40%, capped at 88% of total height) ---
    const panelTop  = Math.floor(H * 0.60);
    const panelBot  = Math.floor(H * 0.88); // safe zone boundary
    const panelH    = panelBot - panelTop;

    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute;
      top: ${panelTop}px; left: 0;
      width: 100%; height: ${panelH}px;
      display: flex;
      flex-direction: column;
      justify-content: space-around;
      align-items: stretch;
      padding: 4px 0;
      box-sizing: border-box;
    `;
    container.appendChild(panel);

    const labels = ['1×', '2×', '3×', '4×', '5×'];
    this._sliderState = [];

    for (let i = 0; i < 5; i++) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        margin: 0 14px;
        height: ${Math.floor(panelH / 5) - 4}px;
      `;

      // frequency label
      const freqLbl = document.createElement('div');
      freqLbl.textContent = labels[i];
      freqLbl.style.cssText = `
        color: #888;
        font-family: monospace;
        font-size: 11px;
        width: 26px;
        flex-shrink: 0;
        text-align: right;
        margin-right: 8px;
      `;
      row.appendChild(freqLbl);

      // track container
      const trackWrap = document.createElement('div');
      trackWrap.style.cssText = `
        position: relative;
        flex: 1;
        height: 6px;
        background: #1a1a2e;
        border-radius: 3px;
      `;

      // center line
      const center = document.createElement('div');
      center.style.cssText = `
        position: absolute;
        top: 0; left: 50%;
        width: 1px; height: 100%;
        background: #333;
      `;
      trackWrap.appendChild(center);

      // fill bar (shows amplitude magnitude)
      const fill = document.createElement('div');
      fill.style.cssText = `
        position: absolute;
        top: 0; height: 100%;
        background: ${this._harmColors[i].replace('0.45', '0.7')};
        border-radius: 3px;
        pointer-events: none;
      `;
      trackWrap.appendChild(fill);

      // thumb
      const thumb = document.createElement('div');
      thumb.style.cssText = `
        position: absolute;
        top: 50%;
        width: 20px; height: 20px;
        background: #fff;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 6px rgba(0,200,255,0.6);
        pointer-events: none;
      `;
      trackWrap.appendChild(thumb);

      row.appendChild(trackWrap);

      // amplitude value label
      const ampLbl = document.createElement('div');
      ampLbl.style.cssText = `
        color: #aaa;
        font-family: monospace;
        font-size: 10px;
        width: 34px;
        flex-shrink: 0;
        text-align: left;
        margin-left: 8px;
      `;
      row.appendChild(ampLbl);

      panel.appendChild(row);
      this._sliderState.push({ trackWrap, thumb, fill, ampLbl, row });
    }

    // Initial thumb positions
    this._updateSliderVisuals();

    // --- PRESET button ---
    const presetBtn = document.createElement('button');
    presetBtn.textContent = 'PRESET';
    presetBtn.style.cssText = `
      position: absolute;
      top: 8px; right: 10px;
      background: rgba(0, 200, 255, 0.15);
      border: 1px solid rgba(0, 200, 255, 0.5);
      color: #0cf;
      font-family: monospace;
      font-size: 11px;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      letter-spacing: 1px;
    `;
    container.appendChild(presetBtn);
    this._presetBtn = presetBtn;

    // --- Preset name overlay ---
    const presetOverlay = document.createElement('div');
    presetOverlay.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      color: rgba(0, 220, 255, 0.9);
      font-family: monospace;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 3px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s;
      text-shadow: 0 0 12px rgba(0,200,255,0.8);
    `;
    container.appendChild(presetOverlay);
    this._presetOverlay = presetOverlay;

    // --- Event listeners ---

    // Preset button
    this._onPresetClick = () => {
      this._presetIndex = (this._presetIndex + 1) % this._presets.length;
      const p = this._presets[this._presetIndex];
      this._amplitudes = [...p.amps];
      this._updateSliderVisuals();
      this._updateGains();
      presetOverlay.textContent = p.name.toUpperCase();
      presetOverlay.style.opacity = '1';
      this._presetTimer = 120; // frames to show name
    };
    presetBtn.addEventListener('click', this._onPresetClick);

    // Touch/pointer for sliders
    this._onPointerDown = (e) => {
      // Check if we hit a track
      for (let i = 0; i < 5; i++) {
        const { trackWrap } = this._sliderState[i];
        const rect = trackWrap.getBoundingClientRect();
        // Extend hit area vertically
        const hitPad = 20;
        if (
          e.clientX >= rect.left - hitPad &&
          e.clientX <= rect.right + hitPad &&
          e.clientY >= rect.top - hitPad &&
          e.clientY <= rect.bottom + hitPad
        ) {
          this._activeSlider = { index: i, startX: e.clientX, startAmp: this._amplitudes[i], rect };
          e.preventDefault();
          break;
        }
      }
    };

    this._onPointerMove = (e) => {
      if (!this._activeSlider) return;
      e.preventDefault();
      const { index, startX, startAmp, rect } = this._activeSlider;
      const trackW = rect.width;
      const dx = e.clientX - startX;
      const deltaAmp = (dx / (trackW / 2)); // full track half = 1 unit
      let newAmp = startAmp + deltaAmp;
      newAmp = Math.max(-1, Math.min(1, newAmp));
      this._amplitudes[index] = newAmp;
      this._updateSliderVisuals();
      this._updateGains();
    };

    this._onPointerUp = () => {
      this._activeSlider = null;
    };

    // touchmove needs passive:false to allow preventDefault
    this._onTouchMove = (e) => {
      if (this._activeSlider) e.preventDefault();
    };

    // Audio init on first touch
    this._onFirstTouch = () => {
      this._initAudio();
    };

    container.addEventListener('pointerdown',  this._onPointerDown,  { passive: false });
    container.addEventListener('pointermove',  this._onPointerMove,  { passive: false });
    container.addEventListener('pointerup',    this._onPointerUp,    false);
    container.addEventListener('pointercancel',this._onPointerUp,    false);
    container.addEventListener('touchmove',    this._onTouchMove,    { passive: false });
    container.addEventListener('pointerdown',  this._onFirstTouch,   { once: true });

    // --- Animation loop ---
    const loop = (ts) => {
      this._raf = requestAnimationFrame(loop);
      this._phase += 0.018; // scroll speed
      this._drawWave();

      // Preset overlay fade-out
      if (this._presetTimer > 0) {
        this._presetTimer--;
        if (this._presetTimer === 0) {
          presetOverlay.style.opacity = '0';
        }
      }
    };
    this._raf = requestAnimationFrame(loop);
  },

  // -------------------------------------------------------
  _initAudio() {
    if (this._audioReady) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._audioCtx = ctx;

      this._masterGain = ctx.createGain();
      this._masterGain.gain.value = 0.18; // keep overall volume modest
      this._masterGain.connect(ctx.destination);

      this._oscillators = [];
      this._gainNodes = [];

      for (let i = 0; i < 5; i++) {
        const gainNode = ctx.createGain();
        gainNode.gain.value = Math.abs(this._amplitudes[i]);
        gainNode.connect(this._masterGain);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = this._baseFreqs[i];
        osc.connect(gainNode);
        osc.start();

        this._oscillators.push(osc);
        this._gainNodes.push(gainNode);
      }

      this._audioReady = true;
    } catch (err) {
      // Audio not available — silently continue visual-only
    }
  },

  // -------------------------------------------------------
  _updateGains() {
    if (!this._audioReady || !this._gainNodes) return;
    for (let i = 0; i < 5; i++) {
      // Smooth gain ramp to avoid clicks
      const g = this._gainNodes[i].gain;
      const target = Math.abs(this._amplitudes[i]);
      g.setTargetAtTime(target, this._audioCtx.currentTime, 0.02);
    }
  },

  // -------------------------------------------------------
  _updateSliderVisuals() {
    const amps = this._amplitudes;
    for (let i = 0; i < 5; i++) {
      const { trackWrap, thumb, fill, ampLbl } = this._sliderState[i];
      const rect = trackWrap.getBoundingClientRect();
      const trackW = rect.width || trackWrap.offsetWidth;
      const amp = amps[i];

      // Thumb position: 0 = left edge, 1 = right edge; 0 amp = center
      const pct = (amp + 1) / 2; // 0..1
      thumb.style.left = `${pct * 100}%`;

      // Fill bar: from center to thumb
      const centerPct = 50;
      const thumbPct  = pct * 100;
      if (thumbPct >= centerPct) {
        fill.style.left  = `${centerPct}%`;
        fill.style.width = `${thumbPct - centerPct}%`;
      } else {
        fill.style.left  = `${thumbPct}%`;
        fill.style.width = `${centerPct - thumbPct}%`;
      }

      // Value label
      ampLbl.textContent = amp.toFixed(2);
    }
  },

  // -------------------------------------------------------
  _drawWave() {
    const canvas = this._canvas;
    const ctx    = this._ctx;
    const W = canvas.width;
    const H = canvas.height;
    const amps = this._amplitudes;
    const phase = this._phase;

    ctx.clearRect(0, 0, W, H);

    // subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    const amplitude = H * 0.38; // max visual swing
    const cycles = 2; // how many full waves fit across width

    // Draw each harmonic as a dim line
    for (let h = 0; h < 5; h++) {
      const amp = amps[h];
      if (Math.abs(amp) < 0.005) continue;

      ctx.beginPath();
      ctx.strokeStyle = this._harmColors[h];
      ctx.lineWidth = 1.5;

      for (let px = 0; px <= W; px++) {
        const t = (px / W) * Math.PI * 2 * cycles;
        const freq = h + 1;
        const y = H / 2 - amp * amplitude * Math.sin(freq * t + freq * phase);
        if (px === 0) ctx.moveTo(px, y);
        else          ctx.lineTo(px, y);
      }
      ctx.stroke();
    }

    // Draw composite wave (sum of all harmonics) in cyan
    ctx.beginPath();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0, 220, 255, 0.6)';
    ctx.shadowBlur  = 8;

    for (let px = 0; px <= W; px++) {
      const t = (px / W) * Math.PI * 2 * cycles;
      let y = 0;
      for (let h = 0; h < 5; h++) {
        const freq = h + 1;
        y += amps[h] * Math.sin(freq * t + freq * phase);
      }
      // Normalize by max possible sum to keep within bounds
      const maxSum = amps.reduce((s, a) => s + Math.abs(a), 0) || 1;
      const normY = H / 2 - (y / maxSum) * amplitude;
      if (px === 0) ctx.moveTo(px, normY);
      else          ctx.lineTo(px, normY);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw label
    ctx.fillStyle = 'rgba(0, 220, 255, 0.5)';
    ctx.font = '10px monospace';
    ctx.fillText('COMPOSITE', 8, 16);
  },

  // -------------------------------------------------------
  destroy() {
    // Cancel animation
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }

    // Close audio
    if (this._audioCtx) {
      try {
        if (this._oscillators) {
          this._oscillators.forEach(o => { try { o.stop(); } catch (e) {} });
        }
        this._audioCtx.close();
      } catch (e) {}
      this._audioCtx   = null;
      this._oscillators = null;
      this._gainNodes   = null;
      this._masterGain  = null;
      this._audioReady  = false;
    }

    // Remove event listeners
    const c = this._container;
    if (c) {
      if (this._onPointerDown)   c.removeEventListener('pointerdown',   this._onPointerDown);
      if (this._onPointerMove)   c.removeEventListener('pointermove',   this._onPointerMove);
      if (this._onPointerUp) {
        c.removeEventListener('pointerup',     this._onPointerUp);
        c.removeEventListener('pointercancel', this._onPointerUp);
      }
      if (this._onTouchMove)    c.removeEventListener('touchmove',     this._onTouchMove);
    }

    if (this._presetBtn && this._onPresetClick) {
      this._presetBtn.removeEventListener('click', this._onPresetClick);
    }

    // Null out refs
    this._canvas        = null;
    this._ctx           = null;
    this._sliderState   = null;
    this._activeSlider  = null;
    this._presetBtn     = null;
    this._presetOverlay = null;
    this._container     = null;
    this._onPointerDown = null;
    this._onPointerMove = null;
    this._onPointerUp   = null;
    this._onTouchMove   = null;
    this._onFirstTouch  = null;
    this._onPresetClick = null;
  },
};
