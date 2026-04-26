window.scrollerApp = {
  meta: {
    title: 'Pendulum Wave',
    author: 'plethora',
    description: '15 pendulums. One pattern. Pure math.',
    tags: ['education'],
  },

  init(container) {
    // ── Constants ─────────────────────────────────────────────────────────
    const W          = container.clientWidth;
    const H          = container.clientHeight;
    const NUM        = 15;
    const G          = 9.8;
    const THETA_MAX  = Math.PI / 12;   // 15 degrees
    const TRAIL_LEN  = 20;
    const BOB_R      = 8;
    const SYNC_SEC   = 60;
    const TICK_HZ    = 440;
    const PLUCK_AMP  = Math.PI / 14;           // extra angle on pluck
    const SCRUB_RATE = SYNC_SEC / W;           // 1 full cycle per screen width

    // Mutable state
    const S = {
      raf:           null,
      audioCtx:      null,
      tapTimer:      null,
      paused:        false,
      pausedElapsed: 0,
      startTime:     performance.now(),
      lastTickT:     -99,
      tapCount:      0,
      lastTouchMs:   0,
      // drag scrub
      isDragging:    false,
      dragMoved:     false,
      dragStartX:    0,
      dragStartY:    0,
      dragBaseEl:    0,
      tapTouchX:     0,
      tapTouchY:     0,
      // pinch speed
      pinching:      false,
      pinchDist0:    0,
      speedMult0:    1.0,
      speedMult:     1.0,
      showSpeed:     0,
      // per-bob pluck amplitude [0..1], decays each frame
      plucks:        new Array(NUM).fill(0),
    };

    // ── Canvas ────────────────────────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    container.style.overflow    = 'hidden';
    container.style.touchAction = 'none';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // ── Pendulum geometry ─────────────────────────────────────────────────
    const pivotBarY = Math.round(H * 0.08);
    const maxBobY   = H * 0.87;
    const availH    = maxBobY - pivotBarY;

    const pends = [];
    let maxLphys = 0;
    for (let i = 0; i < NUM; i++) {
      const T = SYNC_SEC / (51 + i);
      const L = G * Math.pow(T / (2 * Math.PI), 2);
      if (L > maxLphys) maxLphys = L;
      pends.push({ T, L, trail: [] });
    }

    const Lscale  = availH / maxLphys;
    const marginX = W * 0.10;
    const spacing = (W - 2 * marginX) / (NUM - 1);

    for (let i = 0; i < NUM; i++) {
      const p  = pends[i];
      p.px     = marginX + i * spacing;
      p.py     = pivotBarY;
      p.Lv     = p.L * Lscale;
      p.hue    = (i / NUM) * 360;
      p.color  = `hsl(${p.hue},100%,65%)`;
      p.colorA = (a) => `hsla(${p.hue},100%,65%,${a})`;
    }

    // Live bob positions for hit-testing
    const bobX = new Float32Array(NUM);
    const bobY = new Float32Array(NUM);

    // ── Helpers ───────────────────────────────────────────────────────────
    const getElapsed = () => {
      if (S.paused || S.isDragging) return S.pausedElapsed;
      return S.pausedElapsed + (performance.now() - S.startTime) / 1000 * S.speedMult;
    };

    // Freeze current sim time into pausedElapsed and reset wall-clock anchor.
    const commitElapsed = () => {
      S.pausedElapsed = getElapsed();
      S.startTime     = performance.now();
    };

    const fmtTime = (sec) => {
      sec = Math.max(0, sec);
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m > 0 ? `${m}m ${s < 10 ? '0' : ''}${s}s` : `${s}s`;
    };

    const ensureAudio = () => {
      if (!S.audioCtx) {
        try { S.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      }
      if (S.audioCtx && S.audioCtx.state === 'suspended') S.audioCtx.resume().catch(() => {});
    };

    const playTone = (freq, type, vol, dur) => {
      if (!S.audioCtx) return;
      try {
        const osc  = S.audioCtx.createOscillator();
        const gain = S.audioCtx.createGain();
        osc.connect(gain); gain.connect(S.audioCtx.destination);
        osc.type = type; osc.frequency.value = freq;
        const t = S.audioCtx.currentTime;
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t); osc.stop(t + dur);
      } catch (_) {}
    };

    const playTick  = () => playTone(TICK_HZ, 'sine',     0.15, 0.30);
    const playPluck = (hue) => playTone(180 + (hue / 360) * 700, 'triangle', 0.20, 0.70);

    const nearestBob = (x, y) => {
      let best = -1, bestD2 = (BOB_R * 5) ** 2;
      for (let i = 0; i < NUM; i++) {
        const dx = x - bobX[i], dy = y - bobY[i];
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
      return best;
    };

    const clearTrails = () => { for (let i = 0; i < NUM; i++) pends[i].trail = []; };

    const fullReset = () => {
      S.pausedElapsed = 0;
      S.paused        = false;
      S.startTime     = performance.now();
      S.lastTickT     = -99;
      S.speedMult     = 1.0;
      S.plucks.fill(0);
      clearTrails();
    };

    // ── Draw loop ─────────────────────────────────────────────────────────
    const draw = () => {
      S.raf = requestAnimationFrame(draw);

      const elapsed    = getElapsed();
      const cyclePhase = elapsed % SYNC_SEC;

      if (cyclePhase < 0.35 && elapsed - S.lastTickT > SYNC_SEC * 0.5) {
        S.lastTickT = elapsed;
        playTick();
      }

      for (let i = 0; i < NUM; i++) {
        if (S.plucks[i] > 0.001) S.plucks[i] *= 0.975;
        else S.plucks[i] = 0;
      }
      if (S.showSpeed > 0) S.showSpeed = Math.max(0, S.showSpeed - 0.012);

      // Background
      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, W, H);

      // Pivot bar
      const barGrad = ctx.createLinearGradient(marginX - 20, 0, W - marginX + 20, 0);
      barGrad.addColorStop(0,    'rgba(80,80,160,0.0)');
      barGrad.addColorStop(0.08, 'rgba(160,160,220,0.65)');
      barGrad.addColorStop(0.92, 'rgba(160,160,220,0.65)');
      barGrad.addColorStop(1,    'rgba(80,80,160,0.0)');
      ctx.save();
      ctx.strokeStyle = barGrad; ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(140,140,255,0.4)'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(marginX - 20, pivotBarY);
      ctx.lineTo(W - marginX + 20, pivotBarY);
      ctx.stroke();
      ctx.restore();

      // Pendulums
      for (let i = 0; i < NUM; i++) {
        const p     = pends[i];
        const omega = (2 * Math.PI) / p.T;
        const theta = (THETA_MAX + PLUCK_AMP * S.plucks[i]) * Math.cos(omega * elapsed);
        const bx = p.px + p.Lv * Math.sin(theta);
        const by = p.py + p.Lv * Math.cos(theta);
        bobX[i] = bx; bobY[i] = by;

        p.trail.push({ x: bx, y: by });
        if (p.trail.length > TRAIL_LEN) p.trail.shift();

        for (let t = 0; t < p.trail.length - 1; t++) {
          const frac = t / (p.trail.length - 1);
          ctx.beginPath();
          ctx.arc(p.trail[t].x, p.trail[t].y, BOB_R * (0.25 + frac * 0.55), 0, Math.PI * 2);
          ctx.fillStyle = p.colorA(frac * 0.4);
          ctx.fill();
        }

        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(bx, by);
        ctx.strokeStyle = 'rgba(200,210,240,0.20)'; ctx.lineWidth = 1.1; ctx.stroke();

        ctx.beginPath(); ctx.arc(p.px, p.py, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,215,255,0.55)'; ctx.fill();

        const glowR = BOB_R * 2.5;
        const glow  = ctx.createRadialGradient(bx, by, 0, bx, by, glowR);
        glow.addColorStop(0, p.colorA(S.plucks[i] > 0.1 ? 0.5 : 0.22));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.arc(bx, by, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow; ctx.fill();

        const bobG = ctx.createRadialGradient(bx - BOB_R * 0.3, by - BOB_R * 0.35, 1, bx, by, BOB_R);
        bobG.addColorStop(0,   'rgba(255,255,255,0.95)');
        bobG.addColorStop(0.3, p.color);
        bobG.addColorStop(1,   `hsl(${p.hue},100%,30%)`);
        ctx.beginPath(); ctx.arc(bx, by, BOB_R, 0, Math.PI * 2);
        ctx.fillStyle = bobG; ctx.fill();
      }

      // ── HUD ──────────────────────────────────────────────────────────────
      const hudBottomY = H * 0.87;
      const countdown  = SYNC_SEC - cyclePhase;
      const nearSync   = cyclePhase < 4 || countdown < 4;

      ctx.save();
      ctx.textBaseline = 'bottom';

      // Time pill
      ctx.font = 'bold 13px monospace';
      const line1 = fmtTime(elapsed);
      ctx.font = '11px monospace';
      const line2 = `Sync in ${fmtTime(countdown)}`;
      ctx.font = 'bold 13px monospace';
      const maxTW = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
      const pad   = 9;
      const pillW = maxTW + pad * 2;
      const pillH = 40;
      const pillX = pad;
      const pillY = hudBottomY - pillH - 4;

      ctx.fillStyle = 'rgba(5,5,20,0.62)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(pillX, pillY, pillW, pillH, 7) : ctx.rect(pillX, pillY, pillW, pillH);
      ctx.fill();

      ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(180,190,255,0.80)';
      ctx.fillText(line1, pillX + pad, pillY + 20);

      ctx.font = '11px monospace';
      ctx.fillStyle = nearSync ? 'rgba(255,220,60,0.95)' : 'rgba(130,150,210,0.70)';
      ctx.fillText(line2, pillX + pad, pillY + pillH - 2);

      // Speed badge (top-right of pill row, visible when ≠ 1×)
      const showSpeedNow = S.showSpeed > 0.02 || Math.abs(S.speedMult - 1) > 0.05;
      if (showSpeedNow) {
        const a = Math.max(S.showSpeed, Math.abs(S.speedMult - 1) > 0.05 ? 0.80 : 0);
        ctx.font = 'bold 13px monospace'; ctx.textAlign = 'right';
        ctx.fillStyle = `rgba(255,200,80,${a.toFixed(2)})`;
        ctx.fillText(`${S.speedMult.toFixed(1)}×`, W - pad, pillY + 20);
      }

      // Drag scrub timeline (shown while scrubbing)
      if (S.isDragging) {
        const trackY = pivotBarY - 18;
        const trackX0 = marginX, trackW = W - marginX * 2;
        const frac = (elapsed % SYNC_SEC) / SYNC_SEC;
        ctx.fillStyle = 'rgba(100,120,255,0.18)';
        ctx.fillRect(trackX0, trackY - 2, trackW, 4);
        ctx.fillStyle = 'rgba(160,180,255,0.75)';
        ctx.beginPath();
        ctx.arc(trackX0 + frac * trackW, trackY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '10px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(150,165,230,0.65)';
        ctx.fillText('← drag to scrub →', W / 2, trackY - 12);
      }

      // Paused banner
      if (S.paused) {
        ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText('PAUSED  (tap to resume)', W / 2, hudBottomY - 8);
      }

      // Fade-in interaction hint (first 6 s)
      if (elapsed < 6) {
        const a = Math.min(1, (6 - elapsed) * 0.7);
        ctx.font = '10px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(140,155,210,${a.toFixed(2)})`;
        ctx.fillText('tap bob to pluck  •  drag to scrub  •  pinch to speed', W / 2, hudBottomY - 8);
      }

      ctx.restore();
    };

    // ── Touch handlers ────────────────────────────────────────────────────
    this._onTouchStart = (e) => {
      e.preventDefault();
      ensureAudio();
      S.lastTouchMs = Date.now();

      if (e.touches.length >= 2) {
        // Begin pinch — cancel any pending single-touch logic
        clearTimeout(S.tapTimer);
        S.tapCount   = 0;
        S.isDragging = false;
        S.dragMoved  = false;
        S.pinching   = true;
        commitElapsed();
        const t0 = e.touches[0], t1 = e.touches[1];
        const dx = t0.clientX - t1.clientX, dy = t0.clientY - t1.clientY;
        S.pinchDist0 = Math.sqrt(dx * dx + dy * dy);
        S.speedMult0 = S.speedMult;
        S.showSpeed  = 1;
        return;
      }

      // Single touch — prepare for tap or drag
      S.pinching   = false;
      S.isDragging = false;
      S.dragMoved  = false;
      S.dragStartX = e.touches[0].clientX;
      S.dragStartY = e.touches[0].clientY;
      S.dragBaseEl = getElapsed();
      S.tapTouchX  = e.touches[0].clientX;
      S.tapTouchY  = e.touches[0].clientY;

      S.tapCount++;
      if (S.tapCount === 1) {
        S.tapTimer = setTimeout(() => {
          S.tapCount = 0;
          if (S.dragMoved) return;
          // Single tap: pluck nearest bob, or toggle pause
          const bob = nearestBob(S.tapTouchX, S.tapTouchY);
          if (bob >= 0) {
            S.plucks[bob] = 1.0;
            playPluck(pends[bob].hue);
            if (S.paused) { S.startTime = performance.now(); S.paused = false; }
          } else {
            if (!S.paused) { commitElapsed(); S.paused = true; }
            else            { S.startTime = performance.now(); S.paused = false; }
          }
        }, 280);
      } else {
        // Double tap → full reset
        clearTimeout(S.tapTimer);
        S.tapCount = 0;
        fullReset();
      }
    };

    this._onTouchMove = (e) => {
      e.preventDefault();

      if (S.pinching && e.touches.length >= 2) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dx = t0.clientX - t1.clientX, dy = t0.clientY - t1.clientY;
        const dist     = Math.sqrt(dx * dx + dy * dy);
        const newSpeed = Math.max(0.25, Math.min(4.0, S.speedMult0 * (dist / S.pinchDist0)));
        commitElapsed();        // freeze time before changing rate
        S.speedMult  = newSpeed;
        S.showSpeed  = 1;
        return;
      }

      if (e.touches.length !== 1 || S.pinching) return;

      const cx = e.touches[0].clientX;
      const dx = cx - S.dragStartX;

      if (!S.dragMoved && Math.abs(dx) < 8) return;  // dead zone

      if (!S.dragMoved) {
        // Threshold crossed — switch to drag mode
        clearTimeout(S.tapTimer);
        S.tapCount = 0;
        const baseEl  = getElapsed();   // capture BEFORE isDragging=true
        S.dragMoved  = true;
        S.isDragging = true;
        S.dragBaseEl = baseEl;
        S.dragStartX = cx;             // re-anchor from here
        clearTrails();
        return;
      }

      if (S.isDragging) {
        const delta = (cx - S.dragStartX) * SCRUB_RATE;
        S.pausedElapsed = Math.max(0, S.dragBaseEl + delta);
      }
    };

    this._onTouchEnd = (e) => {
      if (S.pinching) {
        if (e.touches.length < 2) {
          S.pinching = false;
          commitElapsed();
        }
        return;
      }
      if (S.isDragging) {
        S.isDragging = false;
        S.dragMoved  = false;
        if (!S.paused) S.startTime = performance.now();
      }
    };

    this._onClick = (e) => {
      if (Date.now() - S.lastTouchMs < 500) return;
      ensureAudio();
      if (!S.paused) { commitElapsed(); S.paused = true; }
      else            { S.startTime = performance.now(); S.paused = false; }
    };

    container.addEventListener('touchstart', this._onTouchStart, { passive: false });
    container.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    container.addEventListener('touchend',   this._onTouchEnd,   { passive: false });
    container.addEventListener('click',      this._onClick);

    this._S         = S;
    this._container = container;
    this._canvas    = canvas;

    draw();
  },

  destroy() {
    const S = this._S;
    if (S) {
      if (S.raf)      cancelAnimationFrame(S.raf);
      if (S.tapTimer) clearTimeout(S.tapTimer);
      if (S.audioCtx) { try { S.audioCtx.close(); } catch (_) {} S.audioCtx = null; }
    }
    if (this._container) {
      this._container.removeEventListener('touchstart', this._onTouchStart);
      this._container.removeEventListener('touchmove',  this._onTouchMove);
      this._container.removeEventListener('touchend',   this._onTouchEnd);
      this._container.removeEventListener('click',      this._onClick);
    }
    this._S = null; this._container = null; this._canvas = null;
  },
};
