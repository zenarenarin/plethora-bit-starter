window.scrollerApp = {
  meta: {
    title: 'Beat Mixer',
    author: 'plethora',
    description: 'Build your beat — tap to mix',
    tags: ['creative'],
  },

  // ── constants ──────────────────────────────────────────────────────────────
  TRACKS: ['KICK', 'SNARE', 'HAT', 'BASS'],
  COLORS: {
    KICK:  '#ff4422',
    SNARE: '#ffcc00',
    HAT:   '#00ddff',
    BASS:  '#cc44ff',
  },
  DIM: {
    KICK:  '#3d1208',
    SNARE: '#3d3000',
    HAT:   '#003a44',
    BASS:  '#2a0a44',
  },
  STEPS: 8,
  HEADER_H: 70,
  STRIP_W: 10,
  PAD_RADIUS: 8,
  LOOKAHEAD_MS: 100,

  // ── init ───────────────────────────────────────────────────────────────────
  init(container) {
    this._destroyed = false;

    // ── state ────────────────────────────────────────────────────────────────
    this._bpm = 120;
    this._playing = false;
    this._raf = null;

    // patterns: 4 tracks × 8 steps
    this._pads = [
      [1,0,0,0,1,0,0,0], // KICK
      [0,0,1,0,0,0,1,0], // SNARE
      [1,1,0,1,1,1,0,1], // HAT
      [1,0,0,1,0,0,1,0], // BASS
    ];

    // VU levels per track (0–1)
    this._vu = [0, 0, 0, 0];

    // scheduler state
    this._schedStep = 0;
    this._schedNextTime = 0; // AudioContext time

    // display step sync (performance.now space)
    this._dispStep = -1;
    this._dispNextTime = 0;

    // ── audio ────────────────────────────────────────────────────────────────
    this._ac = new AudioContext();
    this._masterGain = this._ac.createGain();
    this._masterGain.gain.value = 0.85;
    this._masterGain.connect(this._ac.destination);

    // ── canvas ───────────────────────────────────────────────────────────────
    const W = container.clientWidth;
    const H = container.clientHeight;
    this._W = W;
    this._H = H;
    const dpr = window.devicePixelRatio || 1;
    this._dpr = dpr;

    const canvas = document.createElement('canvas');
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.cssText = `display:block;width:${W}px;height:${H}px;touch-action:none;`;
    container.appendChild(canvas);
    this._canvas = canvas;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    this._ctx = ctx;

    // ── layout precompute ────────────────────────────────────────────────────
    this._layout = this._computeLayout(W, H);

    // ── pointer ──────────────────────────────────────────────────────────────
    this._onDown = (e) => this._handlePointer(e);
    canvas.addEventListener('pointerdown', this._onDown);

    // resume AudioContext on first gesture
    this._acResumed = false;

    // ── start RAF ────────────────────────────────────────────────────────────
    this._raf = requestAnimationFrame((t) => this._loop(t));
  },

  // ── layout ─────────────────────────────────────────────────────────────────
  _computeLayout(W, H) {
    const HEADER_H = this.HEADER_H;
    const STRIP_W  = this.STRIP_W;
    const trackAreaH = H - HEADER_H;
    const trackH = trackAreaH / 4;

    // BPM controls in header
    const bpmX = W / 2;
    const bpmY = HEADER_H / 2;

    // Play button: right side of header
    const playR = 22;
    const playX = W - 36;
    const playY = HEADER_H / 2;

    // BPM buttons
    const bpmBtnW = W * 0.18;
    const minusZone = { x: W * 0.32, y: 0, w: bpmBtnW, h: HEADER_H };
    const plusZone  = { x: W * 0.32 + bpmBtnW + 60, y: 0, w: bpmBtnW, h: HEADER_H };

    // Step pads per track row
    const PAD_MARGIN = 6;
    const padAreaX = STRIP_W + 56; // strip + label
    const padAreaW = W - padAreaX - 12;
    const padW = (padAreaW - PAD_MARGIN * (this.STEPS - 1)) / this.STEPS;
    const padH = trackH * 0.58;

    const rows = this.TRACKS.map((name, ti) => {
      const rowY = HEADER_H + ti * trackH;
      const pads = Array.from({ length: this.STEPS }, (_, si) => ({
        x: padAreaX + si * (padW + PAD_MARGIN),
        y: rowY + (trackH - padH) / 2,
        w: padW,
        h: padH,
      }));
      return { name, rowY, trackH, pads, labelX: STRIP_W + 8, labelY: rowY + trackH / 2 };
    });

    return { W, H, HEADER_H, STRIP_W, bpmX, bpmY, playX, playY, playR, minusZone, plusZone, rows, padW, padH };
  },

  // ── RAF loop ───────────────────────────────────────────────────────────────
  _loop(ts) {
    if (this._destroyed) return;

    const now = performance.now();

    // advance display step
    if (this._playing) {
      const stepMs = this._stepMs();
      if (this._dispStep === -1) {
        // not yet started
      } else {
        while (now >= this._dispNextTime) {
          this._dispStep = (this._dispStep + 1) % this.STEPS;
          this._dispNextTime += stepMs;
        }
      }
      // lookahead scheduler
      this._schedule();
    }

    // decay VU
    for (let i = 0; i < 4; i++) {
      this._vu[i] *= 0.87;
    }

    this._draw(now);
    this._raf = requestAnimationFrame((t) => this._loop(t));
  },

  // ── scheduler ──────────────────────────────────────────────────────────────
  _stepMs() {
    return (60 / this._bpm / 2) * 1000;
  },

  _schedule() {
    if (!this._ac) return;
    const lookaheadSec = this.LOOKAHEAD_MS / 1000;
    const stepSec = 60 / this._bpm / 2;

    while (this._schedNextTime < this._ac.currentTime + lookaheadSec) {
      const step = this._schedStep;
      for (let ti = 0; ti < 4; ti++) {
        if (this._pads[ti][step]) {
          this._triggerSound(ti, this._schedNextTime);
          // VU: approximate - set when schedNextTime is close
          const msAhead = (this._schedNextTime - this._ac.currentTime) * 1000;
          if (msAhead < this.LOOKAHEAD_MS + 20) {
            setTimeout(() => { if (!this._destroyed) this._vu[ti] = 1.0; }, Math.max(0, msAhead));
          }
        }
      }
      this._schedStep = (step + 1) % this.STEPS;
      this._schedNextTime += stepSec;
    }
  },

  // ── sound synthesis ────────────────────────────────────────────────────────
  _triggerSound(trackIndex, when) {
    switch (trackIndex) {
      case 0: this._triggerKick(when);  break;
      case 1: this._triggerSnare(when); break;
      case 2: this._triggerHat(when);   break;
      case 3: this._triggerBass(when);  break;
    }
  },

  _triggerKick(when) {
    const ac = this._ac;
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.connect(env);
    env.connect(this._masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, when);
    osc.frequency.exponentialRampToValueAtTime(0.001, when + 0.4);
    env.gain.setValueAtTime(1.0, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.4);
    osc.start(when);
    osc.stop(when + 0.42);
  },

  _triggerSnare(when) {
    const ac = this._ac;
    const dur = 0.18;

    // noise burst through bandpass
    const bufSize = ac.sampleRate * dur;
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 0.8;
    const nEnv = ac.createGain();
    noise.connect(bp);
    bp.connect(nEnv);
    nEnv.connect(this._masterGain);
    nEnv.gain.setValueAtTime(0.8, when);
    nEnv.gain.exponentialRampToValueAtTime(0.001, when + dur);
    noise.start(when);
    noise.stop(when + dur + 0.01);

    // short triangle tone
    const osc = ac.createOscillator();
    const tEnv = ac.createGain();
    osc.connect(tEnv);
    tEnv.connect(this._masterGain);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, when);
    osc.frequency.exponentialRampToValueAtTime(100, when + 0.1);
    tEnv.gain.setValueAtTime(0.5, when);
    tEnv.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
    osc.start(when);
    osc.stop(when + 0.12);
  },

  _triggerHat(when) {
    const ac = this._ac;
    const dur = 0.06;
    const bufSize = Math.ceil(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;
    const env = ac.createGain();
    noise.connect(hp);
    hp.connect(env);
    env.connect(this._masterGain);
    env.gain.setValueAtTime(0.6, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + dur);
    noise.start(when);
    noise.stop(when + dur + 0.01);
  },

  _triggerBass(when) {
    const ac = this._ac;
    const dur = 0.35;
    const osc = ac.createOscillator();
    const lp = ac.createBiquadFilter();
    const env = ac.createGain();
    osc.connect(lp);
    lp.connect(env);
    env.connect(this._masterGain);
    osc.type = 'triangle';
    osc.frequency.value = 55;
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    env.gain.setValueAtTime(1.0, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.start(when);
    osc.stop(when + dur + 0.01);
  },

  // ── pointer handling ───────────────────────────────────────────────────────
  _handlePointer(e) {
    e.preventDefault();

    // resume AudioContext
    if (!this._acResumed && this._ac) {
      this._ac.resume();
      this._acResumed = true;
    }

    const rect = this._canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const L = this._layout;

    // play/stop button
    const dx = x - L.playX;
    const dy = y - L.playY;
    if (Math.sqrt(dx * dx + dy * dy) <= L.playR + 12) {
      this._togglePlay();
      return;
    }

    // BPM minus
    const mz = L.minusZone;
    if (x >= mz.x && x <= mz.x + mz.w && y >= mz.y && y <= mz.y + mz.h) {
      this._bpm = Math.max(60, this._bpm - 5);
      return;
    }

    // BPM plus
    const pz = L.plusZone;
    if (x >= pz.x && x <= pz.x + pz.w && y >= pz.y && y <= pz.y + pz.h) {
      this._bpm = Math.min(200, this._bpm + 5);
      return;
    }

    // step pads
    const HIT_EX = 4;
    for (let ti = 0; ti < L.rows.length; ti++) {
      const row = L.rows[ti];
      for (let si = 0; si < this.STEPS; si++) {
        const pad = row.pads[si];
        if (
          x >= pad.x - HIT_EX && x <= pad.x + pad.w + HIT_EX &&
          y >= pad.y - HIT_EX && y <= pad.y + pad.h + HIT_EX
        ) {
          this._pads[ti][si] ^= 1;
          if (this._pads[ti][si]) {
            // play immediately as feedback
            if (this._ac && this._ac.state !== 'closed') {
              const t = this._ac.currentTime + 0.01;
              this._triggerSound(ti, t);
              this._vu[ti] = 1.0;
            }
          }
          return;
        }
      }
    }
  },

  _togglePlay() {
    if (this._playing) {
      this._playing = false;
      this._dispStep = -1;
    } else {
      this._playing = true;
      if (this._ac) {
        // give a short grace to let AudioContext resume
        const startTime = this._ac.currentTime + 0.05;
        this._schedNextTime = startTime;
        this._schedStep = 0;
        this._dispStep = 0;
        this._dispNextTime = performance.now() + 50 + this._stepMs();
      }
    }
  },

  // ── drawing ────────────────────────────────────────────────────────────────
  _draw(now) {
    const ctx = this._ctx;
    const L = this._layout;
    const { W, H } = L;

    // background
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, W, H);

    this._drawHeader(ctx, L, W);
    this._drawTracks(ctx, L, W);
  },

  _drawHeader(ctx, L, W) {
    // header background
    ctx.fillStyle = '#0e0e1a';
    ctx.fillRect(0, 0, W, L.HEADER_H);

    // separator
    ctx.fillStyle = '#1e1e30';
    ctx.fillRect(0, L.HEADER_H - 1, W, 1);

    // title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('BEAT MIXER', 14, L.HEADER_H / 2);

    // BPM display (center)
    const bx = L.bpmX;
    const by = L.bpmY;

    // BPM number
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._bpm, bx, by - 5);

    ctx.fillStyle = '#5555aa';
    ctx.font = '10px monospace';
    ctx.fillText('BPM', bx, by + 16);

    // minus button
    const mz = L.minusZone;
    const mCx = mz.x + mz.w / 2;
    const mCy = mz.y + mz.h / 2;
    this._drawBpmBtn(ctx, mCx, mCy, '−');

    // plus button
    const pz = L.plusZone;
    const pCx = pz.x + pz.w / 2;
    const pCy = pz.y + pz.h / 2;
    this._drawBpmBtn(ctx, pCx, pCy, '+');

    // play/stop button
    this._drawPlayBtn(ctx, L.playX, L.playY, L.playR);
  },

  _drawBpmBtn(ctx, cx, cy, label) {
    const r = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.strokeStyle = '#3333aa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#aaaaff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);
  },

  _drawPlayBtn(ctx, cx, cy, r) {
    const playing = this._playing;

    // glow
    if (playing) {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 12);
      grad.addColorStop(0, 'rgba(80,220,120,0.35)');
      grad.addColorStop(1, 'rgba(80,220,120,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = playing ? '#1a4d2a' : '#1a1a2e';
    ctx.fill();
    ctx.strokeStyle = playing ? '#50dc78' : '#3333aa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // icon
    ctx.fillStyle = playing ? '#50dc78' : '#aaaaff';
    if (playing) {
      // pause bars
      const bw = 5, bh = 14;
      ctx.fillRect(cx - 8, cy - bh / 2, bw, bh);
      ctx.fillRect(cx + 3, cy - bh / 2, bw, bh);
    } else {
      // play triangle
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 9);
      ctx.lineTo(cx - 6, cy + 9);
      ctx.lineTo(cx + 11, cy);
      ctx.closePath();
      ctx.fill();
    }
  },

  _drawTracks(ctx, L, W) {
    for (let ti = 0; ti < this.TRACKS.length; ti++) {
      this._drawTrackRow(ctx, L, W, ti);
    }
    // step column highlight line across all tracks
    if (this._playing && this._dispStep >= 0) {
      this._drawStepColumnHighlight(ctx, L, this._dispStep);
    }
  },

  _drawStepColumnHighlight(ctx, L, step) {
    // subtle vertical column highlight behind all pads
    const firstRow = L.rows[0];
    const lastRow  = L.rows[L.rows.length - 1];
    const pad0 = firstRow.pads[step];
    const padN = lastRow.pads[step];
    const colX = pad0.x - 3;
    const colY = firstRow.rowY;
    const colW = pad0.w + 6;
    const colH = (lastRow.rowY + lastRow.trackH) - firstRow.rowY;

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(colX, colY, colW, colH);
  },

  _drawTrackRow(ctx, L, W, ti) {
    const name = this.TRACKS[ti];
    const color = this.COLORS[name];
    const dim = this.DIM[name];
    const row = L.rows[ti];
    const vu = this._vu[ti];

    // row separator
    ctx.fillStyle = '#111120';
    ctx.fillRect(0, row.rowY, W, 1);

    // left color strip — VU brightness
    const stripAlpha = 0.18 + vu * 0.82;
    ctx.fillStyle = this._hexAlpha(color, stripAlpha);
    ctx.fillRect(0, row.rowY, this.STRIP_W, row.trackH);

    // track label
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, row.labelX + this.STRIP_W + 2, row.labelY);
    ctx.restore();

    // step pads
    for (let si = 0; si < this.STEPS; si++) {
      this._drawPad(ctx, row.pads[si], ti, si, name, color, dim);
    }
  },

  _drawPad(ctx, pad, ti, si, name, color, dim) {
    const active = this._pads[ti][si] === 1;
    const isCurrent = this._playing && this._dispStep === si;
    const isBeat = si % 2 === 0; // steps 0,2,4,6

    const r = this.PAD_RADIUS;
    const { x, y, w, h } = pad;

    ctx.beginPath();
    this._roundRect(ctx, x, y, w, h, r);

    if (isCurrent && active) {
      // bright white with glow
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (isCurrent && !active) {
      // current step, inactive: slight bright outline
      ctx.fillStyle = '#1c1c2e';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (active) {
      // active, not current
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      // inactive
      ctx.fillStyle = '#12121e';
      ctx.fill();

      // subtle border
      ctx.strokeStyle = '#1e1e32';
      ctx.lineWidth = 1;
      ctx.stroke();

      // beat marker dot on beat positions when inactive
      if (isBeat) {
        const dotX = x + w / 2;
        const dotY = y + h - 8;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
      }
    }
  },

  _roundRect(ctx, x, y, w, h, r) {
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

  _hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  },

  // ── destroy ────────────────────────────────────────────────────────────────
  destroy() {
    this._destroyed = true;

    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }

    if (this._canvas && this._onDown) {
      this._canvas.removeEventListener('pointerdown', this._onDown);
    }

    if (this._ac && this._ac.state !== 'closed') {
      this._ac.close();
    }
    this._ac = null;
    this._masterGain = null;
    this._canvas = null;
    this._ctx = null;
    this._onDown = null;
    this._playing = false;
  },
};
