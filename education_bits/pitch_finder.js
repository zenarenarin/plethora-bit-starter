window.plethoraBit = {
  meta: {
    title: 'pitch finder',
    author: 'plethora',
    description: 'Sing a note. Find out what it is.',
    tags: ['education'],
    permissions: ['microphone'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

    let audioCtx = null;
    let analyser = null;
    let timeBuf  = null;
    let started  = false;
    let loading  = false;
    let errMsg   = null;
    let _lt      = 0;

    let sFreq  = 0;
    let sCents = 0;
    let sConf  = 0;
    let lastNote = '';
    let history  = [];

    ctx.onDestroy(() => audioCtx?.close());

    const detectPitch = (buf, sampleRate) => {
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      if (Math.sqrt(rms / buf.length) < 0.012) return null;

      const SIZE   = buf.length;
      const minLag = Math.floor(sampleRate / 1200);
      const maxLag = Math.min(Math.ceil(sampleRate / 70), SIZE >> 1);

      let r0 = 0;
      for (let i = 0; i < SIZE; i++) r0 += buf[i] * buf[i];

      let bestCorr = 0, bestLag = -1;
      for (let lag = minLag; lag < maxLag; lag++) {
        let corr = 0;
        for (let i = 0; i < SIZE - lag; i++) corr += buf[i] * buf[i + lag];
        if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
      }

      if (bestLag < 2 || bestCorr / (r0 || 1) < 0.25) return null;

      const prev = Math.max(minLag, bestLag - 1);
      const next = Math.min(maxLag - 1, bestLag + 1);
      let cp = 0, cn = 0;
      for (let i = 0; i < SIZE - next; i++) {
        cp += buf[i] * buf[i + prev];
        cn += buf[i] * buf[i + next];
      }
      const denom = 2 * bestCorr - cp - cn;
      const lag   = bestLag + (denom !== 0 ? (cp - cn) / (2 * denom) : 0);

      return { freq: sampleRate / lag, confidence: bestCorr / (r0 || 1) };
    };

    const freqToNote = (freq) => {
      const n   = 12 * Math.log2(freq / 440) + 69;
      const mid = Math.round(n);
      return {
        name:   NOTE_NAMES[((mid % 12) + 12) % 12],
        octave: Math.floor(mid / 12) - 1,
        cents:  (n - mid) * 100,
      };
    };

    const startMic = async () => {
      if (loading || started) return;
      loading = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        timeBuf = new Float32Array(analyser.fftSize);
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        ctx.onDestroy(() => stream.getTracks().forEach(t => t.stop()));
        started = true;
        loading = false;
        ctx.platform.start();
      } catch (e) {
        loading = false;
        errMsg = e.message || 'Mic denied';
      }
    };

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      _lt = Date.now();
      startMic();
    }, { passive: false });

    ctx.listen(canvas, 'click', () => {
      if (Date.now() - _lt < 500) return;
      startMic();
    });

    const lerp = (a, b, t) => a + (b - a) * t;

    const drawMeter = (cents, conf) => {
      const mx   = W / 2;
      const my   = H * 0.60;
      const half = W * 0.36;
      const mh   = H * 0.012;

      g.beginPath();
      g.roundRect(mx - half, my - mh / 2, half * 2, mh, mh / 2);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fill();

      g.beginPath();
      g.roundRect(mx - half * 0.08, my - mh, half * 0.16, mh * 2, mh);
      g.fillStyle = 'rgba(0,220,120,0.25)';
      g.fill();

      [-50, -25, 0, 25, 50].forEach(v => {
        const x = mx + (v / 50) * half;
        g.beginPath(); g.moveTo(x, my - mh * 2.5); g.lineTo(x, my + mh * 2.5);
        g.strokeStyle = v === 0 ? 'rgba(0,220,120,0.6)' : 'rgba(255,255,255,0.18)';
        g.lineWidth = v === 0 ? 2 : 1;
        g.stroke();
      });

      const cx  = mx + (Math.max(-50, Math.min(50, cents)) / 50) * half;
      const hue = Math.abs(cents) < 10 ? 140 : Math.abs(cents) < 25 ? 60 : 0;
      g.beginPath(); g.arc(cx, my, mh * 3, 0, Math.PI * 2);
      g.fillStyle = 'hsla(' + hue + ',90%,65%,' + (0.3 + conf * 0.7) + ')'; g.fill();
      g.beginPath(); g.arc(cx, my, mh * 1.5, 0, Math.PI * 2);
      g.fillStyle = 'hsl(' + hue + ',90%,72%)'; g.fill();

      g.font = (H * 0.022) + 'px monospace';
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillStyle = 'rgba(255,255,255,' + (0.25 + conf * 0.5) + ')';
      g.fillText((cents >= 0 ? '+' : '') + Math.round(cents) + 'c', mx, my + mh * 4.5);
    };

    ctx.raf(() => {
      g.fillStyle = '#05060f';
      g.fillRect(0, 0, W, H);

      if (!started) {
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (errMsg) {
          g.font = 'bold ' + (H * 0.038) + 'px sans-serif';
          g.fillStyle = '#f55';
          g.fillText(errMsg, W / 2, H / 2);
        } else if (loading) {
          g.font = (H * 0.038) + 'px sans-serif';
          g.fillStyle = '#4af';
          g.fillText('starting mic...', W / 2, H / 2);
        } else {
          g.font = (H * 0.048) + 'px sans-serif';
          g.fillStyle = '#fff';
          g.fillText('tap to start', W / 2, H * 0.46);
          g.font = (H * 0.024) + 'px sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillText('needs microphone', W / 2, H * 0.54);
        }
        return;
      }

      analyser.getFloatTimeDomainData(timeBuf);
      const result = detectPitch(timeBuf, audioCtx.sampleRate);

      if (result) {
        sFreq  = lerp(sFreq || result.freq, result.freq, 0.25);
        sConf  = lerp(sConf, result.confidence, 0.15);
        const nd = freqToNote(sFreq);
        sCents = lerp(sCents, nd.cents, 0.2);
        const noteStr = nd.name + nd.octave;
        if (noteStr !== lastNote) {
          lastNote = noteStr;
          history.unshift(noteStr);
          if (history.length > 5) history.pop();
          ctx.platform.interact({ type: 'note' });
        }
      } else {
        sConf = lerp(sConf, 0, 0.08);
      }

      const conf = Math.max(0, Math.min(1, sConf));
      const note = sFreq > 0 ? freqToNote(sFreq) : null;

      if (conf > 0.05 && note) {
        const hue = Math.abs(sCents) < 10 ? 140 : Math.abs(sCents) < 25 ? 60 : 0;
        const grd = g.createRadialGradient(W/2, H*0.38, 0, W/2, H*0.38, W*0.45);
        grd.addColorStop(0, 'hsla(' + hue + ',80%,50%,' + (conf * 0.18) + ')');
        grd.addColorStop(1, 'transparent');
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
      }

      if (note) {
        const letter = note.name[0];
        const sharp  = note.name[1] || '';
        const bigSz  = H * 0.30;

        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.font = 'bold ' + bigSz + 'px sans-serif';
        g.fillStyle = 'rgba(255,255,255,' + (0.15 + conf * 0.85) + ')';
        const lw = g.measureText(letter).width;
        g.fillText(letter, W/2 - (sharp ? lw * 0.18 : 0), H * 0.44);

        if (sharp) {
          g.font = 'bold ' + (bigSz * 0.45) + 'px sans-serif';
          g.fillStyle = 'rgba(255,255,255,' + (0.1 + conf * 0.75) + ')';
          g.fillText('#', W/2 + lw * 0.38, H * 0.44 - bigSz * 0.38);
        }

        g.font = (H * 0.055) + 'px monospace';
        g.fillStyle = 'rgba(200,210,255,' + (0.15 + conf * 0.55) + ')';
        g.textBaseline = 'top';
        g.fillText(note.octave, W/2 + (sharp ? lw * 0.52 : lw * 0.35), H * 0.44 - bigSz * 0.02);

        g.font = (H * 0.028) + 'px monospace';
        g.textBaseline = 'middle'; g.textAlign = 'center';
        g.fillStyle = 'rgba(150,170,255,' + (0.2 + conf * 0.6) + ')';
        g.fillText(sFreq.toFixed(1) + ' Hz', W/2, H * 0.51);

        drawMeter(sCents, conf);
      } else {
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = (H * 0.048) + 'px sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillText('sing...', W/2, H * 0.38);
      }

      if (history.length > 0) {
        g.font = (H * 0.022) + 'px monospace';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const gap = W * 0.14;
        const sx  = W/2 - (history.length - 1) * gap / 2;
        history.forEach((n, i) => {
          g.fillStyle = 'rgba(200,215,255,' + ((1 - i / history.length) * 0.35) + ')';
          g.fillText(n, sx + i * gap, H * 0.80);
        });
      }

      g.font = (H * 0.018) + 'px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillText('pitch finder', W/2, H * 0.90);
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
