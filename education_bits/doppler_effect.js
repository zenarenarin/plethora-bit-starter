window.scrollerApp = {
  meta: {
    title: 'Doppler Effect',
    author: 'plethora',
    description: 'Drag the source. Hear the pitch shift.',
    tags: ['education'],
  },

  // ── internal state ──────────────────────────────────────────────────────────
  _raf: null,
  _waveTimer: null,
  _snapTimer: null,
  _audioCtx: null,
  _oscillator: null,
  _gainNode: null,
  _audioStarted: false,
  _waves: [],           // { x, y, r, born, maxR, alpha }
  _sourceX: 0,
  _sourceY: 0,
  _prevSourceX: 0,
  _dragging: false,
  _dragOffsetX: 0,
  _autoMode: true,
  _autoAngle: 0,
  _lastFrameTime: 0,
  _canvas: null,
  _ctx: null,
  _W: 0,
  _H: 0,
  _showExplainer: true,
  _explainerTimer: null,
  _currentFreq: 440,

  // ── bound listeners (so we can remove them) ─────────────────────────────────
  _onPointerDown: null,
  _onPointerMove: null,
  _onPointerUp: null,
  _onTouchStart: null,
  _onTouchMove: null,
  _onTouchEnd: null,

  init(container) {
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    container.style.userSelect = 'none';
    container.style.webkitUserSelect = 'none';

    // canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    container.appendChild(canvas);
    this._canvas = canvas;

    this._resize(canvas, container);

    const ctx = canvas.getContext('2d');
    this._ctx = ctx;

    // initial source position: centre, in the safe zone (top 88%)
    this._sourceX = this._W / 2;
    this._sourceY = this._H * 0.48;
    this._prevSourceX = this._sourceX;

    // auto-mode oscillation amplitude
    this._autoAmplitude = this._W * 0.35;
    this._autoSpeed = 0.6; // radians/sec
    this._autoAngle = Math.PI / 2; // start at left side of arc
    this._autoMode = true;

    this._waves = [];
    this._showExplainer = true;
    this._audioStarted = false;
    this._currentFreq = 440;
    this._lastFrameTime = performance.now();

    // emit wave every 80 ms
    this._emitWave();
    this._waveTimer = setInterval(() => this._emitWave(), 80);

    // hide explainer after 4 s
    this._explainerTimer = setTimeout(() => { this._showExplainer = false; }, 4000);

    // touch / pointer listeners
    this._onPointerDown = (e) => this._handleDown(e.clientX, e.clientY, container);
    this._onPointerMove = (e) => this._handleMove(e.clientX, e.clientY, container);
    this._onPointerUp   = ()  => this._handleUp();

    this._onTouchStart = (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._handleDown(t.clientX, t.clientY, container);
    };
    this._onTouchMove = (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._handleMove(t.clientX, t.clientY, container);
    };
    this._onTouchEnd = (e) => {
      e.preventDefault();
      this._handleUp();
    };

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup',   this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('touchstart',  this._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',   this._onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',    this._onTouchEnd,   { passive: false });

    // kick off RAF
    this._raf = requestAnimationFrame((t) => this._loop(t));
  },

  destroy() {
    // cancel animation
    cancelAnimationFrame(this._raf);
    this._raf = null;

    // cancel timers
    clearInterval(this._waveTimer);
    this._waveTimer = null;
    clearTimeout(this._snapTimer);
    this._snapTimer = null;
    clearTimeout(this._explainerTimer);
    this._explainerTimer = null;

    // close audio
    if (this._oscillator) {
      try { this._oscillator.stop(); } catch (_) {}
      this._oscillator.disconnect();
      this._oscillator = null;
    }
    if (this._gainNode) {
      this._gainNode.disconnect();
      this._gainNode = null;
    }
    if (this._audioCtx) {
      this._audioCtx.close();
      this._audioCtx = null;
    }
    this._audioStarted = false;

    // remove listeners
    const c = this._canvas;
    if (c) {
      c.removeEventListener('pointerdown',   this._onPointerDown);
      c.removeEventListener('pointermove',   this._onPointerMove);
      c.removeEventListener('pointerup',     this._onPointerUp);
      c.removeEventListener('pointercancel', this._onPointerUp);
      c.removeEventListener('touchstart',    this._onTouchStart);
      c.removeEventListener('touchmove',     this._onTouchMove);
      c.removeEventListener('touchend',      this._onTouchEnd);
    }
    this._canvas = null;
    this._ctx = null;
    this._waves = [];
  },

  // ── resize ──────────────────────────────────────────────────────────────────
  _resize(canvas, container) {
    this._W = container.clientWidth  || window.innerWidth;
    this._H = container.clientHeight || window.innerHeight;
    canvas.width  = this._W;
    canvas.height = this._H;
  },

  // ── audio ───────────────────────────────────────────────────────────────────
  _startAudio() {
    if (this._audioStarted) return;
    this._audioStarted = true;

    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = this._audioCtx;

    this._gainNode = ctx.createGain();
    this._gainNode.gain.setValueAtTime(0.18, ctx.currentTime);
    this._gainNode.connect(ctx.destination);

    this._oscillator = ctx.createOscillator();
    this._oscillator.type = 'sine';
    this._oscillator.frequency.setValueAtTime(440, ctx.currentTime);
    this._oscillator.connect(this._gainNode);
    this._oscillator.start();
  },

  _updateFrequency(freq) {
    if (!this._audioCtx || !this._oscillator) return;
    const now = this._audioCtx.currentTime;
    const clamped = Math.max(200, Math.min(1200, freq));
    this._oscillator.frequency.cancelScheduledValues(now);
    this._oscillator.frequency.setValueAtTime(
      this._oscillator.frequency.value, now
    );
    this._oscillator.frequency.exponentialRampToValueAtTime(clamped, now + 0.05);
    this._currentFreq = clamped;
  },

  // ── wave emission ────────────────────────────────────────────────────────────
  _emitWave() {
    const maxR = Math.max(this._W, this._H) * 1.1;
    this._waves.push({
      x: this._sourceX,
      y: this._sourceY,
      r: 0,
      born: performance.now(),
      maxR,
    });
    // trim old waves
    const cutoff = performance.now() - 2000;
    this._waves = this._waves.filter(w => w.born > cutoff);
  },

  // ── interaction ──────────────────────────────────────────────────────────────
  _handleDown(clientX, clientY, container) {
    this._startAudio();
    if (this._audioCtx && this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }

    const rect = this._canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // check if near source (generous 48px hit zone)
    const dx = x - this._sourceX;
    const dy = y - this._sourceY;
    if (Math.sqrt(dx * dx + dy * dy) < 60) {
      this._dragging = true;
      this._dragOffsetX = dx;
      this._autoMode = false;
      clearTimeout(this._snapTimer);
      this._snapTimer = null;
    }
  },

  _handleMove(clientX, _clientY, _container) {
    if (!this._dragging) return;
    const rect = this._canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const minX = 28;
    const maxX = this._W - 28;
    this._sourceX = Math.max(minX, Math.min(maxX, x - this._dragOffsetX));
  },

  _handleUp() {
    if (!this._dragging) return;
    this._dragging = false;
    // snap back to auto after 2 s
    clearTimeout(this._snapTimer);
    this._snapTimer = setTimeout(() => {
      this._autoMode = true;
      // reset auto angle so oscillation continues from current x smoothly
      const center = this._W / 2;
      const norm = (this._sourceX - center) / this._autoAmplitude;
      this._autoAngle = Math.asin(Math.max(-1, Math.min(1, norm)));
    }, 2000);
  },

  // ── physics ──────────────────────────────────────────────────────────────────
  _computeObservedFreq(vSourceTowardListener) {
    const vSound = 200; // px/s (visual scale)
    const BASE = 440;
    const denom = vSound - vSourceTowardListener;
    if (Math.abs(denom) < 1) return BASE;
    const f = BASE * vSound / denom;
    return Math.max(200, Math.min(1200, f));
  },

  // ── main loop ────────────────────────────────────────────────────────────────
  _loop(now) {
    const dt = Math.min((now - this._lastFrameTime) / 1000, 0.1); // seconds, capped
    this._lastFrameTime = now;

    const W = this._W;
    const H = this._H;
    const ctx = this._ctx;

    // ── update source position ──────────────────────────────────────────────
    const prevX = this._sourceX;

    if (this._autoMode) {
      this._autoAngle += this._autoSpeed * dt;
      this._sourceX = W / 2 + Math.sin(this._autoAngle) * this._autoAmplitude;
    }

    const vSource = dt > 0 ? (this._sourceX - prevX) / dt : 0; // px/s, positive = rightward
    const listenerX = W / 2;
    // positive vToward = source moving toward listener (from left, toward center)
    const dirToListener = listenerX > this._sourceX ? 1 : -1; // +1 if listener is to the right
    const vTowardListener = vSource * dirToListener;

    const freq = this._computeObservedFreq(vTowardListener);
    this._updateFrequency(freq);

    // ── grow waves ──────────────────────────────────────────────────────────
    const vSoundPx = 200; // px/s visual
    for (const w of this._waves) {
      w.r += vSoundPx * dt;
    }
    // remove waves that have grown too large
    this._waves = this._waves.filter(w => w.r < w.maxR + 20);

    // ── draw ────────────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);

    // background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, W, H);

    // draw waves
    const waveLifespan = 1500; // ms
    for (const w of this._waves) {
      const age = now - w.born;
      const alpha = Math.max(0, 1 - age / waveLifespan);
      const hue = 210; // blue-ish
      // compress waves more as they age if source was moving — already natural
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue}, 85%, 65%, ${alpha * 0.75})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // listener marker (fixed center, subtle)
    const lx = listenerX;
    const ly = this._sourceY;
    ctx.beginPath();
    ctx.arc(lx, ly, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // small "👂" text at listener
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👂', lx, ly);

    // ── source ──────────────────────────────────────────────────────────────
    const sx = this._sourceX;
    const sy = this._sourceY;

    // glow
    const glowR = this._dragging ? 28 : 22;
    const grd = ctx.createRadialGradient(sx, sy, 2, sx, sy, glowR);
    grd.addColorStop(0,   'rgba(100, 180, 255, 0.55)');
    grd.addColorStop(1,   'rgba(100, 180, 255, 0)');
    ctx.beginPath();
    ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // circle
    ctx.beginPath();
    ctx.arc(sx, sy, 18, 0, Math.PI * 2);
    ctx.fillStyle = this._dragging ? '#2299ff' : '#1677cc';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // car emoji
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚗', sx, sy);

    // ── velocity arrow (shows direction of motion) ───────────────────────────
    if (Math.abs(vSource) > 5) {
      const arrowLen = Math.min(Math.abs(vSource) * 0.15, 40);
      const dir = vSource > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(sx + dir * 22, sy);
      ctx.lineTo(sx + dir * (22 + arrowLen), sy);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // arrowhead
      ctx.beginPath();
      const tip = sx + dir * (22 + arrowLen);
      ctx.moveTo(tip, sy);
      ctx.lineTo(tip - dir * 8, sy - 5);
      ctx.lineTo(tip - dir * 8, sy + 5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
    }

    // ── title ────────────────────────────────────────────────────────────────
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('Doppler Effect', 18, 18);

    // ── drag hint ────────────────────────────────────────────────────────────
    if (!this._dragging && this._autoMode) {
      ctx.font = '13px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText('← drag the source →', 18, 46);
    }

    // ── explainer ────────────────────────────────────────────────────────────
    if (this._showExplainer) {
      const ex = W / 2;
      const ey = H * 0.78;
      ctx.textAlign = 'center';
      ctx.font = '13px sans-serif';
      ctx.fillStyle = 'rgba(160, 210, 255, 0.85)';
      ctx.fillText('Waves compress ahead → higher pitch', ex, ey);
      ctx.fillText('Waves stretch behind → lower pitch', ex, ey + 20);
    }

    // ── pitch readout ─────────────────────────────────────────────────────────
    const safeBottom = H * 0.88;
    const pitchHz = Math.round(this._currentFreq);
    const basePitch = 440;
    const direction = pitchHz > basePitch ? '▲ higher' : pitchHz < basePitch ? '▼ lower' : '— same';
    const pitchColor = pitchHz > basePitch
      ? 'rgba(120, 220, 120, 0.95)'
      : pitchHz < basePitch
        ? 'rgba(220, 120, 120, 0.95)'
        : 'rgba(200,200,200,0.8)';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // pill background
    const label = `Pitch: ${pitchHz} Hz  ${direction}`;
    ctx.font = 'bold 15px sans-serif';
    const tw = ctx.measureText(label).width;
    const px = W / 2;
    const py = safeBottom;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this._roundRect(ctx, px - tw / 2 - 14, py - 22, tw + 28, 30, 8);
    ctx.fill();

    ctx.fillStyle = pitchColor;
    ctx.fillText(label, px, py);

    // ── next frame ──────────────────────────────────────────────────────────
    this._raf = requestAnimationFrame((t) => this._loop(t));
  },

  // ── helper: rounded rect ──────────────────────────────────────────────────
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
};
