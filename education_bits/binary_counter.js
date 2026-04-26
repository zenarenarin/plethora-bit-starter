window.scrollerApp = {
  meta: {
    title: 'Binary Counter',
    author: 'plethora',
    description: 'Tap to count. Watch bits flip. Understand binary in 2 minutes.',
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

    const BITS = 8;
    let count = 0;
    const flipAnim = new Float32Array(BITS);  // 1 → 0 each flip

    let audioCtx = null;
    const ensureAudio = () => {
      if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    };
    const playPop = (freq) => {
      if (!audioCtx) return;
      try {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = freq;
        const t = audioCtx.currentTime;
        g.gain.setValueAtTime(0.07, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.start(t); o.stop(t + 0.12);
      } catch (_) {}
    };

    const getBit = (n, i) => (n >> i) & 1;  // i=0 is LSB

    const increment = () => {
      const prev = count;
      count = count >= 255 ? 0 : count + 1;
      for (let i = 0; i < BITS; i++) {
        if (getBit(prev, i) !== getBit(count, i)) {
          flipAnim[i] = 1;
          playPop(180 + i * 55);
        }
      }
      if (count === 0) playPop(110);
    };

    let lt = 0, raf;
    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((ts - lt) / 1000, 0.05); lt = ts;
      for (let i = 0; i < BITS; i++) {
        if (flipAnim[i] > 0) flipAnim[i] = Math.max(0, flipAnim[i] - dt * 7);
      }

      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, W, H);

      const bitSize = Math.min(W * 0.088, 52);
      const totalW  = BITS * bitSize + (BITS - 1) * bitSize * 0.28;
      const startX  = (W - totalW) / 2;
      const stride  = bitSize * 1.28;
      const bitY    = H * 0.30;

      // Group separator (nibble boundary)
      const sepX = startX + 4 * stride - bitSize * 0.14;
      ctx.strokeStyle = 'rgba(100,140,200,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(sepX, bitY - bitSize * 0.65);
      ctx.lineTo(sepX, bitY + bitSize * 0.65);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = BITS - 1; i >= 0; i--) {
        const vi  = BITS - 1 - i;  // visual index 0=MSB (left)
        const bx  = startX + vi * stride + bitSize / 2;
        const by  = bitY;
        const bit = getBit(count, i);
        const fl  = flipAnim[i];

        // Coin-flip scale
        const scaleX = Math.max(0.02, Math.abs(Math.cos(fl * Math.PI)));
        const mid     = fl > 0.5;  // true = showing "other side" mid-flip
        const face    = mid ? 1 - bit : bit;

        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(scaleX, 1);

        const r = bitSize * 0.44;
        if (face) {
          const grd = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.05, 0, 0, r);
          grd.addColorStop(0, '#b0e8ff');
          grd.addColorStop(0.35, '#1a8fff');
          grd.addColorStop(1, '#003878');
          ctx.fillStyle = grd;
          ctx.shadowColor = `rgba(30,140,255,${0.6 + fl * 0.4})`;
          ctx.shadowBlur = 18 + fl * 22;
        } else {
          ctx.fillStyle = '#0c1525';
          ctx.shadowColor = 'rgba(20,50,100,0.3)';
          ctx.shadowBlur = 4;
        }
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

        ctx.shadowBlur = 0;
        ctx.font = `bold ${bitSize * 0.44}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = face ? '#fff' : '#1e3060';
        ctx.fillText(face ? '1' : '0', 0, 0);
        ctx.restore();

        // Labels below
        ctx.font = `${bitSize * 0.2}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(90,130,190,0.45)';
        ctx.fillText(`2^${i}`, bx, by + r + 6);
        ctx.font = `${bitSize * 0.18}px monospace`;
        ctx.fillStyle = 'rgba(70,100,160,0.32)';
        ctx.fillText(String(1 << i), bx, by + r + 6 + bitSize * 0.22);
      }

      // Big decimal
      const pulse = count === 0 ? 0.7 : 1;
      ctx.font = `bold ${H * 0.13}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(220,235,255,${pulse})`;
      ctx.fillText(String(count), W / 2, H * 0.60);

      // Representations row
      const binStr = count.toString(2).padStart(8, '0');
      ctx.font = `${H * 0.027}px monospace`;
      ctx.fillStyle = 'rgba(100,155,255,0.65)';
      ctx.fillText(`0b${binStr}   0x${count.toString(16).toUpperCase().padStart(2,'0')}`, W / 2, H * 0.715);

      // Progress bar
      const barW = W * 0.72, barH = 4, barX = (W - barW) / 2, barYy = H * 0.775;
      ctx.fillStyle = 'rgba(30,60,120,0.4)';
      ctx.beginPath(); ctx.roundRect(barX, barYy, barW, barH, 2); ctx.fill();
      ctx.fillStyle = '#1a8fff';
      ctx.beginPath(); ctx.roundRect(barX, barYy, barW * (count / 255), barH, 2); ctx.fill();
      ctx.font = `${H * 0.022}px monospace`;
      ctx.fillStyle = 'rgba(110,145,200,0.5)';
      ctx.fillText(`${count} / 255`, W / 2, barYy + 18);

      // Hint / overflow warning
      ctx.font = `${H * 0.026}px monospace`;
      ctx.fillStyle = count === 0
        ? 'rgba(150,175,240,0.65)'
        : count >= 250
          ? 'rgba(255,160,60,0.75)'
          : 'rgba(0,0,0,0)';
      ctx.fillText(
        count === 0 ? 'tap anywhere to count' : `overflow in ${256 - count}`,
        W / 2, H * 0.855,
      );
    };

    raf = requestAnimationFrame(loop);

    this._onTap = (e) => { e.preventDefault(); ensureAudio(); increment(); };
    canvas.addEventListener('touchstart', this._onTap, { passive: false });
    canvas.addEventListener('click', this._onTap);

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
