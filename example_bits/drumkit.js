window.scrollerApp = {
  meta: {
    title: 'Drum Kit',
    author: 'plethora',
    description: 'Tap the drums — play your beat',
    tags: ['creative'],
  },

  init(container) {
    this._destroyed = false;

    // --- Canvas setup ---
    const W = container.clientWidth;
    const H = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    const canvas = document.createElement('canvas');
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    this._canvas = canvas;
    this._ctx = ctx;
    this._W = W;
    this._H = H;

    // --- Audio setup ---
    this._audioCtx = null;
    this._masterGain = null;
    this._audioReady = false;

    // --- Drum elements (hit-detection order: front-to-back) ---
    this._elements = [
      {
        id: 'crash',
        type: 'cymbal',
        cx: W * 0.78, cy: H * 0.17,
        rx: W * 0.13, ry: W * 0.030,
        label: 'CRASH',
        accentColor: '#ffaa22',
        hitTime: -9999,
      },
      {
        id: 'hihat',
        type: 'cymbal',
        cx: W * 0.22, cy: H * 0.20,
        rx: W * 0.14, ry: W * 0.033,
        label: 'HH',
        accentColor: '#ffdd44',
        hitTime: -9999,
      },
      {
        id: 'racktom',
        type: 'drum',
        cx: W * 0.63, cy: H * 0.36,
        r: W * 0.12,
        shellColor: '#0a1a3a',
        label: 'TOM',
        accentColor: '#00aaff',
        hitTime: -9999,
      },
      {
        id: 'snare',
        type: 'drum',
        cx: W * 0.24, cy: H * 0.50,
        r: W * 0.135,
        shellColor: '#2a2a2a',
        label: 'SNARE',
        accentColor: '#ff4422',
        hitTime: -9999,
      },
      {
        id: 'floortom',
        type: 'drum',
        cx: W * 0.76, cy: H * 0.57,
        r: W * 0.14,
        shellColor: '#0a1a3a',
        label: 'FLOOR',
        accentColor: '#00ccaa',
        hitTime: -9999,
      },
      {
        id: 'kick',
        type: 'drum',
        cx: W * 0.44, cy: H * 0.74,
        r: W * 0.22,
        shellColor: '#1a0a2e',
        label: 'KICK',
        accentColor: '#9944ff',
        hitTime: -9999,
      },
    ];

    // --- Input ---
    this._onDown = (e) => {
      e.preventDefault();

      if (!this._audioReady) {
        this._initAudio();
      } else if (this._audioCtx) {
        this._audioCtx.resume();
      }

      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;

      let px, py;
      if (e.changedTouches && e.changedTouches.length) {
        px = (e.changedTouches[0].clientX - rect.left) * scaleX;
        py = (e.changedTouches[0].clientY - rect.top)  * scaleY;
      } else {
        px = (e.clientX - rect.left) * scaleX;
        py = (e.clientY - rect.top)  * scaleY;
      }

      // Hit detection — front-to-back (cymbals before toms, kick last)
      const now = performance.now();
      for (const el of this._elements) {
        let hit = false;
        if (el.type === 'cymbal') {
          const dx = (px - el.cx) / el.rx;
          const dy = (py - el.cy) / el.ry;
          hit = (dx * dx + dy * dy) <= 1.1 * 1.1;
        } else {
          hit = Math.hypot(px - el.cx, py - el.cy) <= el.r * 1.05;
        }
        if (hit) {
          el.hitTime = now;
          this._playSound(el.id);
          break;
        }
      }
    };

    canvas.addEventListener('pointerdown', this._onDown);

    // --- RAF loop ---
    const loop = (now) => {
      if (this._destroyed) return;
      this._draw(now);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  },

  _initAudio() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(audioCtx.destination);
      this._audioCtx = audioCtx;
      this._masterGain = masterGain;
      this._audioReady = true;
      audioCtx.resume();
    } catch (_) {
      // audio unavailable
    }
  },

  _playSound(id) {
    if (!this._audioReady || !this._audioCtx) return;
    const ac = this._audioCtx;
    const out = this._masterGain;
    const t = ac.currentTime + 0.005;

    if (id === 'kick') {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(0.001, t + 0.45);
      gain.gain.setValueAtTime(1.0, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain); gain.connect(out);
      osc.start(t); osc.stop(t + 0.47);

    } else if (id === 'snare') {
      // Noise layer
      const dur = 0.18;
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ac.createBufferSource();
      noise.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2800; bp.Q.value = 0.8;
      const ngain = ac.createGain();
      ngain.gain.setValueAtTime(0.8, t);
      ngain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      noise.connect(bp); bp.connect(ngain); ngain.connect(out);
      noise.start(t); noise.stop(t + dur + 0.01);
      // Tone layer
      const osc = ac.createOscillator();
      const ogain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
      ogain.gain.setValueAtTime(0.5, t);
      ogain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(ogain); ogain.connect(out);
      osc.start(t); osc.stop(t + 0.12);

    } else if (id === 'hihat') {
      const dur = 0.055;
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ac.createBufferSource();
      noise.buffer = buf;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 8500;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      noise.connect(hp); hp.connect(gain); gain.connect(out);
      noise.start(t); noise.stop(t + dur + 0.01);

    } else if (id === 'crash') {
      const dur = 0.8;
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ac.createBufferSource();
      noise.buffer = buf;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 5000;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      noise.connect(hp); hp.connect(gain); gain.connect(out);
      noise.start(t); noise.stop(t + dur + 0.01);

    } else if (id === 'racktom') {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(0.001, t + 0.35);
      gain.gain.setValueAtTime(0.9, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain); gain.connect(out);
      osc.start(t); osc.stop(t + 0.37);

    } else if (id === 'floortom') {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(75, t);
      osc.frequency.exponentialRampToValueAtTime(0.001, t + 0.45);
      gain.gain.setValueAtTime(1.0, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain); gain.connect(out);
      osc.start(t); osc.stop(t + 0.47);
    }
  },

  _draw(now) {
    const ctx = this._ctx;
    const W = this._W;
    const H = this._H;

    // Background
    ctx.fillStyle = '#080810';
    ctx.fillRect(0, 0, W, H);

    // Radial glow behind kit center
    const grd = ctx.createRadialGradient(W * 0.44, H * 0.55, 0, W * 0.44, H * 0.55, W * 0.55);
    grd.addColorStop(0, 'rgba(40,20,80,0.4)');
    grd.addColorStop(1, 'rgba(40,20,80,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Stage floor lines
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const ly = H * 0.6 + i * H * 0.1;
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(W, ly);
      ctx.stroke();
    }

    // Hi-hat stand line
    const hh = this._elements.find(e => e.id === 'hihat');
    ctx.strokeStyle = 'rgba(150,150,160,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hh.cx, hh.cy + hh.ry * 2);
    ctx.lineTo(hh.cx, hh.cy + H * 0.12);
    ctx.stroke();

    // Hardware connecting lines
    const kick     = this._elements.find(e => e.id === 'kick');
    const rack     = this._elements.find(e => e.id === 'racktom');
    const snare    = this._elements.find(e => e.id === 'snare');
    const floortom = this._elements.find(e => e.id === 'floortom');

    ctx.strokeStyle = 'rgba(120,120,130,0.25)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(rack.cx, rack.cy + rack.r);
    ctx.lineTo(kick.cx - kick.r * 0.4, kick.cy - kick.r * 0.6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(floortom.cx - floortom.r * 0.5, floortom.cy - floortom.r * 0.3);
    ctx.lineTo(kick.cx + kick.r * 0.5, kick.cy - kick.r * 0.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(snare.cx + snare.r * 0.8, snare.cy - snare.r * 0.3);
    ctx.lineTo(rack.cx - rack.r * 0.8, rack.cy + rack.r * 0.3);
    ctx.stroke();

    // Draw order: back-to-front
    const drawOrder = ['kick', 'floortom', 'snare', 'racktom', 'crash', 'hihat'];
    for (const id of drawOrder) {
      const el = this._elements.find(e => e.id === id);
      if (el.type === 'drum') {
        this._drawDrum(ctx, el, now);
      } else {
        this._drawCymbal(ctx, el, now);
      }
    }
  },

  _drawDrum(ctx, el, now) {
    const { cx, cy, r, shellColor, accentColor, hitTime, label } = el;

    // 1. Shell ring
    const shellGrd = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.1, cx, cy, r);
    shellGrd.addColorStop(0, _lighten(shellColor, 0.3));
    shellGrd.addColorStop(1, shellColor);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = shellGrd;
    ctx.fill();

    // 2. Chrome rim
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
    ctx.strokeStyle = '#c8c8d0';
    ctx.lineWidth = r * 0.08;
    ctx.stroke();

    // 3. Drum head
    const headGrd = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.15, 0, cx, cy, r * 0.82);
    headGrd.addColorStop(0, '#f5f5f0');
    headGrd.addColorStop(1, '#d8d4cc');
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
    ctx.fillStyle = headGrd;
    ctx.fill();

    // 4. Tension rods
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const rx = cx + Math.cos(angle) * r * 0.89;
      const ry = cy + Math.sin(angle) * r * 0.89;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(angle);
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(-r * 0.018, -r * 0.045, r * 0.036, r * 0.09);
      ctx.restore();
    }

    // 5. Center logo ring
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 6. Hit ripples
    const age = (now - hitTime) / 500;
    if (age < 1) {
      const r1 = r * (0.3 + age * 0.7);
      const a1 = (1 - age) * 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, Math.PI * 2);
      ctx.strokeStyle = _withAlpha(accentColor, a1);
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const r2 = r * (0.1 + age * 0.5);
      const a2 = (1 - age) * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${a2.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 7. Label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, cx, cy + r + 6);
  },

  _drawCymbal(ctx, el, now) {
    const { cx, cy, rx, ry, accentColor, hitTime, label, id } = el;
    const age = (now - hitTime) / 400;
    const isHit = age < 1;
    const flashAlpha = isHit ? (1 - age) * 0.6 : 0;

    const drawOneCymbal = (ox, oy) => {
      // 1. Body — gold gradient
      const grd = ctx.createRadialGradient(ox, oy, 0, ox, oy, rx);
      grd.addColorStop(0, '#C9A84C');
      grd.addColorStop(0.6, '#8B6914');
      grd.addColorStop(1, '#6B4F10');
      ctx.beginPath();
      ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // 2. Radial grooves (clip to cymbal shape)
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(ox + Math.cos(ang) * rx * 0.3, oy + Math.sin(ang) * ry * 0.3);
        ctx.lineTo(ox + Math.cos(ang) * rx,        oy + Math.sin(ang) * ry);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Bell
      const bellGrd = ctx.createRadialGradient(ox - rx * 0.05, oy - ry * 0.05, 0, ox, oy, rx * 0.3);
      bellGrd.addColorStop(0, '#FFD700');
      bellGrd.addColorStop(1, '#B8860B');
      ctx.beginPath();
      ctx.ellipse(ox, oy, rx * 0.3, ry * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = bellGrd;
      ctx.fill();

      // 4. Rim highlight
      ctx.beginPath();
      ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,220,100,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 5. Hit flash
      if (isHit) {
        ctx.beginPath();
        ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,220,100,${flashAlpha.toFixed(3)})`;
        ctx.fill();

        const r1 = rx * (0.3 + age * 0.7);
        const r1y = ry * (0.3 + age * 0.7);
        const a1 = (1 - age) * 0.7;
        ctx.beginPath();
        ctx.ellipse(ox, oy, r1, r1y, 0, 0, Math.PI * 2);
        ctx.strokeStyle = _withAlpha(accentColor, a1);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    if (id === 'hihat') {
      // Two cymbals — slightly open hi-hat look
      drawOneCymbal(cx, cy + ry * 0.6); // bottom cymbal
      drawOneCymbal(cx, cy);             // top cymbal
    } else {
      drawOneCymbal(cx, cy);
    }

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelY = (id === 'hihat') ? cy + ry * 2.2 + 4 : cy + ry * 1.5 + 4;
    ctx.fillText(label, cx, labelY);
  },

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._raf);
    this._raf = null;

    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onDown);
      this._canvas = null;
    }

    if (this._audioCtx) {
      this._audioCtx.close();
      this._audioCtx = null;
      this._masterGain = null;
    }

    this._onDown = null;
    this._ctx = null;
    this._elements = null;
  },
};

// --- Module-level helpers ---

function _withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function _lighten(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + Math.round(255 * amount));
  return `rgb(${r},${g},${b})`;
}
